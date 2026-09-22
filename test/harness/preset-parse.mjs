// preset-parse.mjs —— 「卡密预设」结构解析器（纯函数版）
//
// 设计约束（本工作区约定）：
//   1) 不使用正则表达式，一律 indexOf / startsWith / endsWith / 按行切分
//   2) 脚本内不出现反斜杠字面量与美元号字面量（换行用 String.fromCharCode(10)）
//   3) 本文件零 import，可直接被浏览器面板脚本复用
//
// 输入：迁移后的预设对象（内存态）
// 输出：结构树（tab -> 卡片 -> 条目）
//
// 编号约定（别混）：
//   - 本文件注释里的 1) 2) 3) … 是**代码步骤**编号
//   - 报告（design/proposals/预设结构解析表.md）里的「规则 N」是**需求规则**编号
//   - 步骤 6.5 实现的是**规则 15**（模型专属卡片降级，规则 4 的补充）
//     规则 15 的实际适用条件是**收窄过的**：一张卡片必须是它所在层级里**唯一的卡片**
//     （层级的卡片列表里只有它一张），且名下条目全是模型专属条目，才降级。
//     收窄的理由：原版（不看"唯一卡片"）会把 `🧠 推理选项` 里的 `🤔 [推理格式]` 也判掉，
//     用户实测后指出那是误伤（[推理格式] 本来就该是卡片层级）。收窄后
//     `🪓 神秘咒语`（层级里只有 `🤖 [模型类型]` 一张卡片）照旧不出 tab，
//     `🧠 推理选项`（5 张卡片）里的 `🤔 [推理格式]` 恢复成正常卡片。

export const ARROW_OPEN = String.fromCodePoint(0x1f53b); // 🔻
export const ARROW_CLOSE = String.fromCodePoint(0x1f53a); // 🔺
export const NL = String.fromCharCode(10);
export const VAR_SUFFIX = ' | var';
export const MODEL_SUFFIX = ' | model';
export const CARD_ONCE = ' 选一';
export const CARD_ANY = ' 任选';
export const FULL_COLON = '：';

// ---------- 基础工具（无正则） ----------

export function countOccurrences(text, sub) {
  if (typeof text !== 'string' || typeof sub !== 'string' || sub.length === 0) return 0;
  let count = 0;
  let i = 0;
  for (;;) {
    i = text.indexOf(sub, i);
    if (i < 0) return count;
    count++;
    i += sub.length;
  }
}

export function isPureDigits(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

// 去掉首尾的 🔻 / 🔺，再 trim。用于包裹区与层级的内名比对。
// 注意：🔻/🔺 是代理对（2 个 UTF-16 码元），必须按 2 个码元切，不能用 slice(1)。
export function stripArrowEnds(text) {
  let s = String(text);
  let changed = true;
  while (changed) {
    changed = false;
    while (s.startsWith(ARROW_OPEN) || s.startsWith(ARROW_CLOSE)) {
      s = s.slice(2);
      changed = true;
    }
    while (s.endsWith(ARROW_OPEN) || s.endsWith(ARROW_CLOSE)) {
      s = s.slice(0, s.length - 2);
      changed = true;
    }
  }
  return s.trim();
}

// 第一个 {{// ... }} 的内部文本（去掉包裹符），没有则为 null
export function firstComment(content) {
  if (typeof content !== 'string') return null;
  const start = content.indexOf('{{//');
  if (start < 0) return null;
  const end = content.indexOf('}}', start);
  if (end < 0) return null;
  return content.slice(start + 4, end);
}

// 抽 content 里所有 setvar::名字::值 片段
export function parseSetvars(content) {
  const out = [];
  if (typeof content !== 'string') return out;
  let i = 0;
  for (;;) {
    i = content.indexOf('setvar::', i);
    if (i < 0) return out;
    const rest = content.slice(i + 8);
    let end = rest.indexOf('}}');
    if (end < 0) end = rest.length;
    const body = rest.slice(0, end);
    const sep = body.indexOf('::');
    if (sep >= 0) {
      const name = body.slice(0, sep).trim();
      const value = body.slice(sep + 2).trim();
      out.push({ name: name, value: value, numeric: isPureDigits(value), raw: body });
    }
    i += 8;
  }
}

// 从模型登记表 content 里解析 emoji 表：每个 {{// ... }} 块按行切
export function parseModelTable(content) {
  const models = [];
  if (typeof content !== 'string') return models;
  let i = 0;
  for (;;) {
    const start = content.indexOf('{{//', i);
    if (start < 0) return models;
    const end = content.indexOf('}}', start);
    if (end < 0) return models;
    const inner = content.slice(start + 4, end);
    const lines = inner.split(NL);
    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (line.length === 0) continue;
      const c = line.indexOf(FULL_COLON);
      if (c <= 0) continue;
      const emoji = line.slice(0, c).trim();
      const label = line.slice(c + 1).trim();
      if (emoji.length > 0 && label.length > 0) {
        models.push({ emoji: emoji, label: label, line: lineRaw, source: end });
      }
    }
    i = end + 2;
  }
}

// 变量条目 -> 卡片（范围卡 / 数字卡）
export function buildVarCards(entry) {
  const numeric = parseSetvars(entry.content).filter((s) => s.numeric);
  const used = [];
  const cards = [];
  const consumedNames = [];
  for (const v of numeric) {
    if (consumedNames.indexOf(v.name) >= 0) continue;
    let base = null;
    if (v.name.endsWith('_min')) base = v.name.slice(0, v.name.length - 4);
    else if (v.name.endsWith('_max')) base = v.name.slice(0, v.name.length - 4);
    if (base !== null && base.length > 0) {
      const minName = base + '_min';
      const maxName = base + '_max';
      const minVar = numeric.find((x) => x.name === minName);
      const maxVar = numeric.find((x) => x.name === maxName);
      if (minVar && maxVar) {
        consumedNames.push(minName, maxName);
        cards.push({
          type: 'range',
          identifier: entry.identifier,
          entryName: entry.name,
          base: base,
          min: { name: minName, value: minVar.value, number: Number(minVar.value) },
          max: { name: maxName, value: maxVar.value, number: Number(maxVar.value) },
          swapped: Number(minVar.value) > Number(maxVar.value),
        });
        continue;
      }
    }
    consumedNames.push(v.name);
    cards.push({
      type: 'number',
      identifier: entry.identifier,
      entryName: entry.name,
      name: v.name,
      value: v.value,
      number: Number(v.value),
    });
  }
  for (const v of numeric) used.push(v.name);
  return { cards: cards, numericVars: numeric, allVars: parseSetvars(entry.content), usedNames: used };
}

// ---------- 主解析 ----------

export function parsePreset(preset) {
  const issues = [];
  const orders = preset && preset.prompt_order ? preset.prompt_order : [];
  if (orders.length === 0) throw new Error('prompt_order 为空，无法解析');
  const orderArr = orders[0].order || [];
  const prompts = preset.prompts || [];
  const byId = new Map();
  for (const p of prompts) byId.set(p.identifier, p);

  // 1) 按 order 展开，主键用完整 identifier，短号取后 6 位
  const entries = [];
  orderArr.forEach((o, index) => {
    const p = byId.get(o.identifier);
    if (!p) {
      issues.push({ level: 'error', kind: 'prompt-not-found', identifier: o.identifier, index: index });
      return;
    }
    const nameRaw = typeof p.name === 'string' ? p.name : '';
    const name = nameRaw.trim();
    const content = typeof p.content === 'string' ? p.content : '';
    const openCount = countOccurrences(name, ARROW_OPEN);
    const closeCount = countOccurrences(name, ARROW_CLOSE);
    let kind = 'plain';
    if (name.endsWith(ARROW_OPEN) && openCount === 2) kind = 'wrapper-open';
    else if (name.endsWith(ARROW_CLOSE) && closeCount === 2) kind = 'wrapper-close';
    else if (name.endsWith(ARROW_OPEN) && openCount === 1) kind = 'layer-open';
    else if (name.endsWith(ARROW_CLOSE) && closeCount === 1) kind = 'layer-close';
    else if (openCount > 0 || closeCount > 0) {
      issues.push({ level: 'warn', kind: 'arrow-name-not-matching-any-pattern', identifier: p.identifier, name: name });
    }
    entries.push({
      index: index,
      identifier: p.identifier,
      shortId: p.identifier.slice(Math.max(0, p.identifier.length - 6)),
      nameRaw: nameRaw,
      name: name,
      enabled: o.enabled === undefined ? p.enabled : o.enabled,
      promptEnabled: p.enabled,
      marker: p.marker === true,
      role: p.role,
      systemPrompt: p.system_prompt,
      injectionDepth: p.injection_depth,
      injectionOrder: p.injection_order,
      injectionPosition: p.injection_position,
      forbidOverrides: p.forbid_overrides,
      content: content,
      contentLength: content.length,
      kind: kind,
      orderEnabled: o.enabled,
      comment: firstComment(content),
      commentFlat: null,
      region: null,
      card: null,
      models: [],
      modelLabels: [],
      modelExclusive: false,
      lockedOpen: false,
      note: null,
    });
  });
  for (const e of entries) e.commentFlat = e.comment === null ? null : e.comment.trim();

  // 2) 区间识别：栈式配对（层级 / 包裹区）
  const regions = [];
  const stack = [];
  const closeRegion = (region, node) => {
    region.closeIndex = node.index;
    region.closeEntry = node;
    regions.push(region);
  };
  for (const e of entries) {
    if (e.kind === 'layer-open' || e.kind === 'wrapper-open') {
      stack.push({
        kind: e.kind === 'layer-open' ? 'layer' : 'wrapper',
        name: stripArrowEnds(e.name),
        openIndex: e.index,
        openEntry: e,
        closeIndex: -1,
        closeEntry: null,
        children: [],
        cards: [],
        activeCards: [],
        segments: [],
        ownItems: [],
      });
      continue;
    }
    if (e.kind === 'layer-close' || e.kind === 'wrapper-close') {
      const want = e.kind === 'layer-close' ? 'layer' : 'wrapper';
      const wantName = stripArrowEnds(e.name);
      let found = -1;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].kind === want && stack[s].name === wantName) {
          found = s;
          break;
        }
      }
      if (found < 0) {
        issues.push({ level: 'error', kind: 'region-close-without-open', identifier: e.identifier, name: e.name, index: e.index });
        e.role = 'region-orphan';
        continue;
      }
      for (let s = stack.length - 1; s > found; s--) {
        issues.push({
          level: 'error',
          kind: 'region-not-closed',
          name: stack[s].name,
          kindOfRegion: stack[s].kind,
          openIndex: stack[s].openIndex,
          closedBy: e.name,
        });
        closeRegion(stack[s], e);
      }
      stack.length = found + 1;
      const region = stack.pop();
      closeRegion(region, e);
      continue;
    }
    if (stack.length > 0) stack[stack.length - 1].children.push(e);
  }
  for (let s = stack.length - 1; s >= 0; s--) {
    issues.push({ level: 'error', kind: 'region-never-closed', name: stack[s].name, kindOfRegion: stack[s].kind, openIndex: stack[s].openIndex });
    const stub = entries[entries.length - 1];
    closeRegion(stack[s], { index: stub ? stub.index : -1, name: '<<EOF>>' });
  }
  regions.sort((a, b) => a.openIndex - b.openIndex);

  const innermostRegion = (index) => {
    let best = null;
    for (const r of regions) {
      if (r.openIndex < index && (r.closeIndex < 0 || index < r.closeIndex)) {
        if (!best || r.openIndex > best.openIndex) best = r;
      }
    }
    return best;
  };
  for (const e of entries) e.region = innermostRegion(e.index);

  // 3) 角色判定
  for (const e of entries) {
    if (e.kind === 'layer-open' || e.kind === 'layer-close') {
      e.role2 = 'layer-locked';
      e.lockedOpen = true;
      continue;
    }
    if (e.region && e.region.kind === 'wrapper') {
      e.role2 = 'wrapper-part';
      continue;
    }
    if (e.region && e.region.kind === 'layer') {
      if (e.name.endsWith(VAR_SUFFIX)) e.role2 = 'var';
      else if (e.name.endsWith(MODEL_SUFFIX)) e.role2 = 'model-registry';
      else if (e.name.endsWith(CARD_ONCE) || e.name.endsWith(CARD_ANY)) e.role2 = 'card-head';
      else e.role2 = 'item';
      continue;
    }
    if (e.kind === 'wrapper-close' || e.kind === 'wrapper-open') {
      e.role2 = 'wrapper-part';
      continue;
    }
    if (e.name.endsWith(VAR_SUFFIX)) {
      e.role2 = 'var';
      issues.push({ level: 'warn', kind: 'var-entry-outside-any-layer', identifier: e.identifier, name: e.name });
      continue;
    }
    if (e.name.endsWith(MODEL_SUFFIX)) {
      e.role2 = 'model-registry';
      issues.push({ level: 'info', kind: 'model-registry-outside-any-layer', identifier: e.identifier, name: e.name });
      continue;
    }
    if (e.marker) {
      e.role2 = 'marker';
      continue;
    }
    e.role2 = 'structure';
  }

  // 4) 层级内部：卡片组装 + 零条目卡片降级
  const layerRegions = regions.filter((r) => r.kind === 'layer');
  const wrapperRegions = regions.filter((r) => r.kind === 'wrapper');
  for (const r of layerRegions) {
    r.entryList = r.children.filter((c) => c.role2 !== 'layer-locked');
    const segs = [];
    let cur = null;
    for (const c of r.entryList) {
      if (c.role2 === 'card-head') {
        const suffix = c.name.endsWith(CARD_ONCE) ? CARD_ONCE : CARD_ANY;
        cur = {
          name: c.name.slice(0, c.name.length - suffix.length).trim(),
          rawName: c.name,
          mode: suffix === CARD_ONCE ? '单选' : '多选',
          suffix: suffix,
          head: c,
          items: [],
        };
        c.cardName = cur.name;
        segs.push({ type: 'card', card: cur });
      } else if (cur) {
        cur.items.push(c);
        c.card = cur;
      } else {
        segs.push({ type: 'item', entry: c });
      }
    }
    const cards = [];
    const blocks = [];
    r.ownItems = [];
    for (const seg of segs) {
      if (seg.type === 'item') {
        blocks.push(seg);
        r.ownItems.push(seg.entry);
        continue;
      }
      if (seg.card.items.length === 0) {
        seg.card.head.role2 = 'item';
        seg.card.head.cardDemoted = true;
        seg.card.head.cardDemoteReason = 'empty';
        seg.card.head.cardName = null;
        r.ownItems.push(seg.card.head);
        blocks.push({ type: 'item', entry: seg.card.head });
      } else {
        cards.push(seg.card);
        blocks.push(seg);
      }
    }
    r.cards = cards;
    r.segments = blocks;
    r.vars = r.entryList.filter((c) => c.role2 === 'var');
    r.registries = r.entryList.filter((c) => c.role2 === 'model-registry');
    r.items = r.entryList.filter((c) => c.role2 === 'item');
    r.hasTab = cards.length > 0 || r.vars.length > 0;
    r.skipReason = r.hasTab ? null : '无卡片且无变量条目';
    for (const c of cards) {
      for (const it of c.items) it.inCard = c.name;
    }
    for (const it of r.ownItems) it.inCard = null;
  }

  // 5) 模型登记表
  const registryEntries = entries.filter((e) => e.role2 === 'model-registry');
  const table = [];
  for (const reg of registryEntries) {
    const rows = parseModelTable(reg.content);
    for (const row of rows) table.push({ emoji: row.emoji, label: row.label, from: reg.identifier, fromName: reg.name });
  }

  // 6) 模型归属
  const modelMembers = [];
  for (const e of entries) {
    if (e.role2 === 'layer-locked' || e.role2 === 'wrapper-part' || e.role2 === 'structure' || e.role2 === 'marker' || e.role2 === 'model-registry') continue;
    const hit = table.filter((m) => e.name.indexOf(m.emoji) >= 0);
    if (hit.length === 0) continue;
    e.models = hit.map((m) => m.emoji);
    e.modelLabels = hit.map((m) => m.label);
    e.modelExclusive = true;
    modelMembers.push(e);
  }
  // 非内容条目（卡片头/层级/结构）命中 emoji 的提示
  for (const e of entries) {
    if (e.models.length > 0) continue;
    const hit = table.filter((m) => e.name.indexOf(m.emoji) >= 0);
    if (hit.length > 0) {
      issues.push({ level: 'warn', kind: 'non-content-entry-matches-model-emoji', identifier: e.identifier, name: e.name, role2: e.role2, emojis: hit.map((m) => m.emoji) });
    }
  }

  // 6.5) 规则 15（收窄版）：模型专属卡片降级
  //      生效条件（**两个都要满足**）：
  //        a) 这张卡片是它所在层级里**唯一的卡片**（r.cards.length === 1）
  //        b) 它名下的条目「全部」都是模型专属条目（每条的模型归属集合 e.models 都非空）
  //      命中后：
  //        - 卡片头降级成该层级的普通条目（cardDemoted=true，cardDemoteReason='model-exclusive-items'）
  //        - 名下条目变成该层级的裸放条目（card=null）→ 没有「原卡片」可用于镜像标注
  //        - 卡片从 r.cards 里移除 → 该层级必然变成「无卡片无变量」→ 按规则 8 不出 tab
  //      收窄的后果（用户裁定）：层级里只要还有别的卡片，本规则一律不动手 —— 那些卡片
  //      照旧是卡片，名下模型专属条目照旧是卡片内条目（仍镜像进「🤖 模型」tab）。
  //      本规则**不删除任何条目**：模型专属条目照旧进全局「🤖 模型」tab（步骤 7 按名字里的
  //      emoji 收集），所以层级 tab 消失不会让这些条目从面板上消失。
  //      本步骤必须排在 6)（模型归属）之后、7)（tab 组装）之前。
  //      同时留下一张全量扫描表 cardModelScan（每个层级每张卡片一行），供报告核对。
  const modelExclusiveDemotions = [];
  const cardModelScan = [];
  const modelExclusiveKeptNotSole = [];
  for (const r of layerRegions) {
    const keptCards = [];
    const demotedCards = [];
    for (const c of r.cards) {
      const modelItems = c.items.filter((it) => it.models.length > 0);
      const nonModelItems = c.items.filter((it) => it.models.length === 0);
      const allModelExclusive = c.items.length > 0 && nonModelItems.length === 0;
      const soleCardInLayer = r.cards.length === 1;
      const demote = allModelExclusive && soleCardInLayer;
      cardModelScan.push({
        layer: r.name,
        card: c.name,
        rawName: c.rawName,
        itemCount: c.items.length,
        modelExclusiveItemCount: modelItems.length,
        modelExclusiveItemNames: modelItems.map((it) => it.name),
        nonModelItemNames: nonModelItems.map((it) => it.name),
        allModelExclusive: allModelExclusive,
        soleCardInLayer: soleCardInLayer,
        layerCardCount: r.cards.length,
        verdict: demote ? 'demoted' : (allModelExclusive ? 'kept-not-sole-card' : 'kept'),
      });
      if (!demote) {
        keptCards.push(c);
        if (allModelExclusive) {
          modelExclusiveKeptNotSole.push({
            layer: r.name,
            card: c.name,
            mode: c.mode,
            headIdentifier: c.head.identifier,
            headName: c.head.name,
            headEnabled: c.head.enabled,
            layerCardCount: r.cards.length,
            layerOtherCards: r.cards.filter((x) => x !== c).map((x) => x.name),
            itemCount: c.items.length,
            itemNames: c.items.map((it) => it.name),
            itemIdentifiers: c.items.map((it) => it.identifier),
            itemModels: c.items.map((it) => it.models.slice()),
          });
        }
        continue;
      }
      demotedCards.push(c);
      c.demotedByModelRule = true;
      c.head.role2 = 'item';
      c.head.cardDemoted = true;
      c.head.cardDemoteReason = 'model-exclusive-items';
      c.head.cardName = null;
      c.head.inCard = null;
      c.head.demotedFromCard = c.name;
      for (const it of c.items) {
        it.card = null;
        it.inCard = null;
        it.demotedFromCard = c.name;
      }
      modelExclusiveDemotions.push({
        layer: r.name,
        card: c.name,
        rawName: c.rawName,
        mode: c.mode,
        headIdentifier: c.head.identifier,
        headName: c.head.name,
        headEnabled: c.head.enabled,
        headContentLength: c.head.contentLength,
        itemCount: c.items.length,
        itemNames: c.items.map((it) => it.name),
        itemIdentifiers: c.items.map((it) => it.identifier),
        itemModels: c.items.map((it) => it.models.slice()),
        openIndex: r.openIndex,
        closeIndex: r.closeIndex,
      });
    }
    if (demotedCards.length === 0) continue;
    r.cards = keptCards;
    // 段落与裸放条目重排：被降级的卡片头 + 名下条目都变成该层级的裸放条目（保持原有的先后顺序）
    const segs2 = [];
    const own = [];
    for (const seg of r.segments) {
      if (seg.type === 'item') {
        segs2.push(seg);
        own.push(seg.entry);
        continue;
      }
      if (seg.card.demotedByModelRule) {
        segs2.push({ type: 'item', entry: seg.card.head });
        own.push(seg.card.head);
        for (const it of seg.card.items) {
          segs2.push({ type: 'item', entry: it });
          own.push(it);
        }
        continue;
      }
      segs2.push(seg);
    }
    r.segments = segs2;
    r.ownItems = own;
    r.items = r.entryList.filter((c) => c.role2 === 'item');
    r.hasTab = r.cards.length > 0 || r.vars.length > 0;
    r.skipReason = r.hasTab ? null : '无卡片且无变量条目';
  }

  // 7) tab 组装
  const tabs = [];
  const skippedLayers = [];
  for (const r of layerRegions) {
    if (!r.hasTab) {
      skippedLayers.push({ name: r.name, reason: r.skipReason, items: r.items.slice(), index: r.openIndex, openIndex: r.openIndex, closeIndex: r.closeIndex });
      continue;
    }
    tabs.push({
      kind: 'layer',
      name: r.name,
      openIndex: r.openIndex,
      closeIndex: r.closeIndex,
      region: r,
      cards: r.cards.map((c) => ({
        name: c.name,
        mode: c.mode,
        headIdentifier: c.head.identifier,
        headEnabled: c.head.enabled,
        items: c.items,
        itemCount: c.items.length,
        source: 'layer',
      })),
      standaloneItems: r.ownItems.filter((x) => x.role2 === 'item'),
      varEntries: r.vars,
      varCards: [],
      modelMembers: [],
    });
  }
  for (const t of tabs) {
    for (const v of t.varEntries) {
      const built = buildVarCards(v);
      v.varCards = built.cards;
      t.varCards.push({ entry: v, cards: built.cards, allVars: built.allVars, numericVars: built.numericVars });
    }
  }

  const modelTab = {
    kind: 'model',
    name: '模型',
    displayName: '🤖 模型',
    global: true,
    cards: table.map((m) => ({ name: m.emoji + ' ' + m.label, emoji: m.emoji, label: m.label, mode: null, items: [], itemCount: 0, source: 'model' })),
    standaloneItems: [],
    varEntries: [],
    varCards: [],
    registryEntries: registryEntries.slice(),
    table: table.slice(),
  };
  for (let i = 0; i < modelTab.cards.length; i++) {
    const card = modelTab.cards[i];
    for (const e of modelMembers) {
      if (e.models.indexOf(card.emoji) < 0) continue;
      const originCard = e.card ? e.card.name : null;
      const originLayer = e.region && e.region.kind === 'layer' ? e.region.name : null;
      card.items.push({
        entry: e,
        identifier: e.identifier,
        name: e.name,
        models: e.models.slice(),
        originLayer: originLayer,
        originCard: originCard,
        originCardDemoted: e.demotedFromCard ? e.demotedFromCard : null,
        originIndex: e.index,
        isMirror: originCard !== null,
        onlyInModelTab: originCard === null,
      });
    }
    card.itemCount = card.items.length;
  }
  tabs.push(modelTab);

  // 8) 锁定条目
  const locked = entries
    .filter((e) => e.role2 === 'layer-locked')
    .map((e) => ({
      identifier: e.identifier,
      shortId: e.shortId,
      name: e.name,
      index: e.index,
      enabled: e.enabled,
      orderEnabled: e.orderEnabled,
      promptEnabled: e.promptEnabled,
      which: e.kind === 'layer-open' ? '层级开' : '层级闭',
      layerName: stripArrowEnds(e.name),
    }));
  const lockedDisabled = locked.filter((x) => x.enabled === false);

  // 9) 结构区
  const structureItems = entries.filter((e) => e.role2 === 'structure');
  const wrapperParts = entries.filter((e) => e.role2 === 'wrapper-part');
  const markers = entries.filter((e) => e.role2 === 'marker');

  // 10) 可达性核查：不在任何 tab、也不是结构区/锁定/marker 的条目
  //     inTab   = 作为「内容条目」出现在某个 tab 里
  //     inPanel = 出现在面板上（含卡片头：它在面板上显示为卡片标题）
  const inTab = new Set();
  const inPanel = new Set();
  const asCardHead = new Set();
  for (const t of tabs) {
    for (const c of t.cards) {
      if (c.headIdentifier) {
        inPanel.add(c.headIdentifier);
        asCardHead.add(c.headIdentifier);
      }
      for (const it of c.items) {
        const id = it.entry ? it.entry.identifier : it.identifier;
        inTab.add(id);
        inPanel.add(id);
      }
    }
    for (const it of t.standaloneItems) {
      inTab.add(it.identifier);
      inPanel.add(it.identifier);
    }
    for (const v of t.varEntries) {
      inTab.add(v.identifier);
      inPanel.add(v.identifier);
    }
  }
  const unreachable = entries.filter((e) => {
    if (inPanel.has(e.identifier)) return false;
    if (e.role2 === 'structure') return false;
    if (e.role2 === 'wrapper-part') return false;
    if (e.role2 === 'layer-locked') return false;
    if (e.role2 === 'marker') return false;
    if (e.role2 === 'model-registry') return false;
    return true;
  });

  // 11) 统计
  const panelEntries = entries.filter((e) => inPanel.has(e.identifier));
  const contentEntries = entries.filter((e) => inTab.has(e.identifier) && (e.role2 === 'item' || e.role2 === 'var'));
  const commented = panelEntries.filter((e) => e.commentFlat !== null && e.commentFlat.length > 0);
  const commentedContent = contentEntries.filter((e) => e.commentFlat !== null && e.commentFlat.length > 0);
  const withCommentFlat = panelEntries.filter((e) => e.commentFlat !== null && e.commentFlat.length > 0);
  const layerTabs = tabs.filter((t) => t.kind === 'layer');
  const allCards = [];
  for (const t of layerTabs) for (const c of t.cards) allCards.push(c);
  const modelMemberIds = [];
  for (const e of modelMembers) if (modelMemberIds.indexOf(e.identifier) < 0) modelMemberIds.push(e.identifier);
  let modelMirrorCount = 0;
  let modelTabOccurrences = 0;
  for (const c of modelTab.cards) {
    for (const it of c.items) {
      modelTabOccurrences++;
      if (it.isMirror) modelMirrorCount++;
    }
  }
  const stats = {
    orderLength: entries.length,
    promptCount: prompts.length,
    layerCount: layerRegions.length,
    wrapperCount: wrapperRegions.length,
    tabCount: tabs.length,
    layerTabCount: layerTabs.length,
    cardCount: allCards.length,
    modelCardCount: modelTab.cards.length,
    panelEntryCount: panelEntries.length,
    contentEntryCount: contentEntries.length,
    cardHeadCount: asCardHead.size,
    varEntryCount: entries.filter((e) => e.role2 === 'var').length,
    varCount: 0,
    rangeCardCount: 0,
    numberCardCount: 0,
    modelCount: table.length,
    modelMemberEntryCount: modelMemberIds.length,
    modelTabOccurrences: modelTabOccurrences,
    modelMirrorCount: modelMirrorCount,
    modelOnlyCount: modelMembers.filter((e) => !e.card).length,
    modelOnlyOccurrences: modelTabOccurrences - modelMirrorCount,
    structureCount: structureItems.length,
    wrapperPartCount: wrapperParts.length,
    markerCount: markers.length,
    lockedCount: locked.length,
    lockedDisabledCount: lockedDisabled.length,
    commentedCount: withCommentFlat.length,
    commentCoverage: panelEntries.length === 0 ? 0 : withCommentFlat.length / panelEntries.length,
    commentedContentCount: commentedContent.length,
    unreachableCount: unreachable.length,
    skippedLayerCount: skippedLayers.length,
    demotedCardHeadCount: entries.filter((e) => e.cardDemoted === true).length,
    emptyCardDemoteCount: entries.filter((e) => e.cardDemoteReason === 'empty').length,
    modelExclusiveCardDemoteCount: entries.filter((e) => e.cardDemoteReason === 'model-exclusive-items').length,
    modelExclusiveCardCount: modelExclusiveDemotions.length,
    modelExclusiveCardItemCount: modelExclusiveDemotions.reduce((n, d) => n + d.itemCount, 0),
    modelExclusiveAllModelCardCount: cardModelScan.filter((c) => c.allModelExclusive).length,
    modelExclusiveKeptNotSoleCount: modelExclusiveKeptNotSole.length,
  };
  for (const t of layerTabs) {
    for (const vc of t.varCards) {
      for (const c of vc.cards) {
        stats.varCount += c.type === 'range' ? 2 : 1;
        if (c.type === 'range') stats.rangeCardCount++;
        else stats.numberCardCount++;
      }
    }
  }

  return {
    meta: {
      characterId: orders[0].character_id,
      orderLength: entries.length,
      promptCount: prompts.length,
      presetName: preset.name,
    },
    entries: entries,
    regions: regions.map((r) => ({
      kind: r.kind,
      name: r.name,
      openIndex: r.openIndex,
      closeIndex: r.closeIndex,
      entryCount: r.closeIndex - r.openIndex + 1,
      innerCount: r.closeIndex - r.openIndex - 1,
      cardCount: r.kind === 'layer' ? r.cards.length : 0,
      varCount: r.kind === 'layer' ? r.vars.length : 0,
      hasTab: r.kind === 'layer' ? r.hasTab : false,
      skipReason: r.kind === 'layer' ? r.skipReason : '结构包裹区',
    })),
    layers: layerRegions.map((r) => ({
      name: r.name,
      openIndex: r.openIndex,
      closeIndex: r.closeIndex,
      hasTab: r.hasTab,
      skipReason: r.skipReason,
      cards: r.cards.map((c) => ({ name: c.name, rawName: c.rawName, mode: c.mode, items: c.items })),
      items: r.items,
      vars: r.vars,
      registries: r.registries,
      entries: r.entryList,
    })),
    wrappers: wrapperRegions.map((r) => ({
      name: r.name,
      openIndex: r.openIndex,
      closeIndex: r.closeIndex,
      entries: r.children.concat([r.openEntry, r.closeEntry]).sort((a, b) => a.index - b.index),
    })),
    tabs: tabs,
    modelTab: modelTab,
    modelTable: table,
    modelMembers: modelMembers,
    modelExclusiveDemotions: modelExclusiveDemotions,
    modelExclusiveKeptNotSole: modelExclusiveKeptNotSole,
    cardModelScan: cardModelScan,
    structure: { items: structureItems, wrapperParts: wrapperParts, markers: markers },
    locked: locked,
    lockedDisabled: lockedDisabled,
    skippedLayers: skippedLayers,
    unreachable: unreachable,
    panelEntries: panelEntries,
    contentEntries: contentEntries,
    commentedEntries: commented,
    commentedContentEntries: commentedContent,
    stats: stats,
    issues: issues,
  };
}
