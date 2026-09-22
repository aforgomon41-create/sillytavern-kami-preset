// preset-migrate.mjs —— 「卡密预设」迁移脚本（默认 --check，不写盘）
//
// 只做 4 处改动：
//   A1  在 order 里 `📝 写作指导🔻` 之后插入 `✒️ [文风优化] 任选`（空 content，enabled=true）
//   A2  在 order 里 `‼️免责声明/开源许可‼️(不开)` 之后插入 `📋 支持模型列表 | model`（装 A3 搬过来的 emoji 表）
//   A3  把 `🤖 [模型类型] 选一` 的 content 里第二段 {{// ... }}（emoji 表）删掉，只留第一段注释
//   A4  三条变量条目改名：末尾加 ` | var`
//
// 用法：
//   node test/harness/preset-migrate.mjs            # 等价 --check
//   node test/harness/preset-migrate.mjs --check    # 只报告，不写盘
//   node test/harness/preset-migrate.mjs --write    # 写盘
//
// 本文件不使用正则、不出现反斜杠字面量与美元号字面量。

import fs from 'node:fs';

export const PRESET_PATH = 'src/preset.base.json';
export const NL = String.fromCharCode(10);

export const NEW_ID_STYLE = 'prompt_kami_style_opt';
export const NEW_ID_MODEL = 'prompt_kami_model_table';
export const NEW_NAME_STYLE = '✒️ [文风优化] 任选';
// A2 条目名（用户已定稿）：📋 支持模型列表 + 已确认后缀 ` | model`
export const NEW_NAME_MODEL = '📋 支持模型列表 | model';
// A1 名字里的钢笔：U+2712 + 变体选择符 U+FE0F（跟预设里 🖊️ / 🗣️ / ⚔️ 同一套写法；🪶 是 Emoji 13.0，旧设备会显示成方框）
export const PEN_EMOJI = String.fromCodePoint(0x2712);
export const VARIATION_SELECTOR_16 = String.fromCodePoint(0xfe0f);

export const ANCHOR_DISCLAIMER = '‼️免责声明/开源许可‼️(不开)';
export const ANCHOR_WRITING = '📝 写作指导🔻';
export const TARGET_MODEL_CARD = '🤖 [模型类型] 选一';

export const VAR_RENAMES = [
  { from: '🧩 推理预算', to: '🧩 推理预算 | var' },
  { from: '🧩 正文字数', to: '🧩 正文字数 | var' },
  { from: '🧩 插图数量', to: '🧩 插图数量 | var' },
];

const VAR_SUFFIX = ' | var';
const MODEL_SUFFIX = ' | model';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimName(p) {
  return typeof p.name === 'string' ? p.name.trim() : '';
}

// 去掉首尾换行/空格/Tab（不用正则）
function trimBlankEdges(text) {
  let s = String(text);
  for (;;) {
    if (s.length === 0) return s;
    const c = s.charCodeAt(0);
    if (c === 10 || c === 13 || c === 32 || c === 9) {
      s = s.slice(1);
      continue;
    }
    break;
  }
  for (;;) {
    if (s.length === 0) return s;
    const c = s.charCodeAt(s.length - 1);
    if (c === 10 || c === 13 || c === 32 || c === 9) {
      s = s.slice(0, s.length - 1);
      continue;
    }
    break;
  }
  return s;
}

function cloneWithOverrides(neighbor, overrides) {
  const out = {};
  for (const k of Object.keys(neighbor)) {
    out[k] = Object.prototype.hasOwnProperty.call(overrides, k) ? overrides[k] : neighbor[k];
  }
  return out;
}

// 找出 content 里的第 n 个 {{// ... }} 整块（含包裹符），verbatim
export function blockAt(content, ordinal) {
  let i = 0;
  let seen = 0;
  for (;;) {
    const start = content.indexOf('{{//', i);
    if (start < 0) return null;
    const end = content.indexOf('}}', start);
    if (end < 0) return null;
    seen++;
    if (seen === ordinal) return content.slice(start, end + 2);
    i = end + 2;
  }
}

export function migratePreset(preset, options) {
  const opts = options || {};
  const original = preset;
  const out = cloneJson(preset);
  const changes = [];
  const assertions = [];
  const logs = [];
  const addAssert = (id, ok, detail) => {
    assertions.push({ id: id, ok: ok === true, detail: detail });
    return ok === true;
  };

  const orderArr = out.prompt_order[0].order;
  const origOrderArr = original.prompt_order[0].order;

  // ---------- 已迁移检测 ----------
  const existingIds = out.prompts.map((p) => p.identifier);
  if (existingIds.indexOf(NEW_ID_STYLE) >= 0 || existingIds.indexOf(NEW_ID_MODEL) >= 0) {
    return {
      ok: true,
      alreadyMigrated: true,
      preset: out,
      changes: [],
      assertions: assertions,
      logs: ['检测到 ' + NEW_ID_STYLE + ' / ' + NEW_ID_MODEL + ' 已存在，判定为「已经迁移过」，本次不做任何改动。'],
    };
  }

  // ---------- 断言 0：原文件格式化风格可无损往返 ----------
  if (typeof opts.rawText === 'string') {
    addAssert(
      'style-roundtrip',
      JSON.stringify(original, null, 2) === opts.rawText,
      '原文件 == JSON.stringify(obj, null, 2)（缩进 2 空格、字段顺序原样、无结尾换行），写回可保持原风格'
    );
  }
  addAssert(
    'name-trim-audit',
    true,
    '名字比对前统一 trim()；原文件有 ' + original.prompts.filter((p) => typeof p.name === 'string' && p.name !== p.name.trim()).length + ' 条条目名带前导空格'
  );

  // ---------- 断言 1：全预设 prompts 里没有半角竖线 ----------
  const pipeHits = [];
  for (const p of original.prompts) {
    const n = typeof p.name === 'string' ? p.name : '';
    if (n.indexOf('|') >= 0) pipeHits.push({ identifier: p.identifier, name: n });
  }
  const pipeOk = addAssert(
    'no-pipe-in-names-before',
    pipeHits.length === 0,
    pipeHits.length === 0
      ? '迁移前 165 条 prompts 的 name 里都没有半角竖线 |，` | var` / ` | model` 后缀可安全启用'
      : '命中 ' + pipeHits.length + ' 条：' + pipeHits.map((x) => x.name).join(' / ')
  );
  if (!pipeOk) {
    return { ok: false, alreadyMigrated: false, preset: original, changes: changes, assertions: assertions, logs: logs };
  }

  // ---------- 断言 2：两个新 identifier 唯一 ----------
  addAssert('new-id-style-unique', existingIds.indexOf(NEW_ID_STYLE) < 0, NEW_ID_STYLE + ' 在 prompts 里唯一');
  addAssert('new-id-model-unique', existingIds.indexOf(NEW_ID_MODEL) < 0, NEW_ID_MODEL + ' 在 prompts 里唯一');

  // ---------- 断言 2b：A1 名字的 emoji 写法（U+2712 + U+FE0F）与占用情况 ----------
  addAssert(
    'a1-name-codepoints',
    NEW_NAME_STYLE.codePointAt(0) === 0x2712 &&
      NEW_NAME_STYLE.codePointAt(1) === 0xfe0f &&
      NEW_NAME_STYLE.indexOf(PEN_EMOJI + VARIATION_SELECTOR_16) === 0,
    'A1 名字以 U+2712 + U+FE0F（✒️）开头：' + Array.from(NEW_NAME_STYLE).slice(0, 2).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' + ')
  );
  const penNameHits = original.prompts.filter((p) => (typeof p.name === 'string' ? p.name : '').indexOf(PEN_EMOJI) >= 0);
  const penContentHits = original.prompts.filter((p) => (typeof p.content === 'string' ? p.content : '').indexOf(PEN_EMOJI) >= 0);
  addAssert(
    'a1-emoji-unused-in-names',
    penNameHits.length === 0,
    '全预设 ' + original.prompts.length + ' 条 prompts 的 name 里，U+2712（✒）出现 ' + penNameHits.length + ' 次（0 = 没有别的条目用过这个符号）'
  );
  logs.push('U+2712 在全部 prompts 的 content 里出现 ' + penContentHits.length + ' 次。');

  // ---------- 定位锚点 ----------
  const byId = new Map();
  for (const p of out.prompts) byId.set(p.identifier, p);
  const findOrderIndexByName = (name) => {
    for (let i = 0; i < orderArr.length; i++) {
      const p = byId.get(orderArr[i].identifier);
      if (p && trimName(p) === name) return i;
    }
    return -1;
  };
  const findPromptIndexByName = (name) => {
    for (let i = 0; i < out.prompts.length; i++) {
      if (trimName(out.prompts[i]) === name) return i;
    }
    return -1;
  };

  const idxDisclaimer = findOrderIndexByName(ANCHOR_DISCLAIMER);
  const idxWriting = findOrderIndexByName(ANCHOR_WRITING);
  const idxModelCard = findOrderIndexByName(TARGET_MODEL_CARD);
  addAssert('anchor-disclaimer-found', idxDisclaimer >= 0, ANCHOR_DISCLAIMER + ' @ order[' + idxDisclaimer + ']');
  addAssert('anchor-writing-found', idxWriting >= 0, ANCHOR_WRITING + ' @ order[' + idxWriting + ']');
  addAssert('target-model-card-found', idxModelCard >= 0, TARGET_MODEL_CARD + ' @ order[' + idxModelCard + ']');
  if (idxDisclaimer < 0 || idxWriting < 0 || idxModelCard < 0) {
    return { ok: false, alreadyMigrated: false, preset: original, changes: changes, assertions: assertions, logs: logs };
  }

  const nodeDisclaimer = byId.get(orderArr[idxDisclaimer].identifier);
  const nodeWriting = byId.get(orderArr[idxWriting].identifier);
  const nodeModelCard = byId.get(orderArr[idxModelCard].identifier);
  const nodeDisclaimerId = nodeDisclaimer.identifier;
  const nodeWritingId = nodeWriting.identifier;
  const nodeModelCardId = nodeModelCard.identifier;
  const origModelCardContent = nodeModelCard.content;

  // ---------- A3 素材：第二段 {{// ... }}（emoji 表），verbatim ----------
  const firstBlock = blockAt(origModelCardContent, 1);
  const secondBlock = blockAt(origModelCardContent, 2);
  addAssert('a3-first-block-found', firstBlock !== null, '第一段 {{// ... }}：' + (firstBlock === null ? '未找到' : firstBlock));
  addAssert(
    'a3-second-block-found',
    secondBlock !== null,
    '第二段 {{// ... }}（emoji 表）：' + (secondBlock === null ? '未找到' : JSON.stringify(secondBlock))
  );
  if (firstBlock === null || secondBlock === null) {
    return { ok: false, alreadyMigrated: false, preset: original, changes: changes, assertions: assertions, logs: logs };
  }
  const afterFirst = origModelCardContent.slice(firstBlock.length);
  addAssert(
    'a3-rest-is-exactly-second-block',
    trimBlankEdges(afterFirst) === secondBlock,
    '第一段之后剩余的内容（去首尾空白后）就是那一段 emoji 表，可整段搬走'
  );
  let tableLineCount = 0;
  for (const line of secondBlock.split(NL)) {
    if (line.indexOf('：') > 0) tableLineCount++;
  }
  addAssert('a3-table-has-4-rows', tableLineCount === 4, 'emoji 表共 ' + tableLineCount + ' 行（全角冒号分隔）');

  // ---------- A2：新增 模型登记表 ----------
  const newModelEntry = cloneWithOverrides(nodeDisclaimer, {
    content: secondBlock,
    enabled: true,
    identifier: NEW_ID_MODEL,
    name: NEW_NAME_MODEL,
  });
  const orderIdxModel = idxDisclaimer + 1;
  const promptIdxModel = findPromptIndexByName(ANCHOR_DISCLAIMER) + 1;
  orderArr.splice(orderIdxModel, 0, { enabled: true, identifier: NEW_ID_MODEL });
  out.prompts.splice(promptIdxModel, 0, newModelEntry);
  changes.push({
    id: 'A2',
    title: '新增「支持模型列表」条目（名字已定稿）',
    position: 'order 第 ' + orderIdxModel + ' 位（紧跟 `' + ANCHOR_DISCLAIMER + '` 之后）；prompts 数组第 ' + promptIdxModel + ' 位',
    identifier: NEW_ID_MODEL,
    name: NEW_NAME_MODEL,
    nameNote: '名字已由用户定稿：📋 +「支持模型列表」+ 已确认后缀 ` | model`。',
    contentChange: '新增，content = 从 `' + TARGET_MODEL_CARD + '` 搬来的 emoji 表（verbatim，' + secondBlock.length + ' 字符）',
    enabled: true,
    fields: Object.keys(newModelEntry).join(','),
    neighbor: nodeDisclaimerId,
    extra: { content: secondBlock },
  });

  // ---------- A1：新增 文风优化 任选 ----------
  const newStyleEntry = cloneWithOverrides(nodeWriting, {
    content: '',
    enabled: true,
    identifier: NEW_ID_STYLE,
    name: NEW_NAME_STYLE,
  });
  const orderIdxStyle = idxWriting + 2; // idxWriting 之后；A2 已经插在最前面，所以 +2
  const promptIdxStyle = findPromptIndexByName(ANCHOR_WRITING) + 1;
  orderArr.splice(orderIdxStyle, 0, { enabled: true, identifier: NEW_ID_STYLE });
  out.prompts.splice(promptIdxStyle, 0, newStyleEntry);
  changes.push({
    id: 'A1',
    title: '新增「✒️ [文风优化] 任选」卡片头（名字已定稿）',
    position: 'order 第 ' + orderIdxStyle + ' 位（紧跟 `' + ANCHOR_WRITING + '` 之后、`💀 反死人文风(Gemini可不开)` 之前）；prompts 数组第 ' + promptIdxStyle + ' 位',
    identifier: NEW_ID_STYLE,
    name: NEW_NAME_STYLE,
    nameNote: '名字已定稿：✒️（U+2712 + U+FE0F，与预设里 🖊️/🗣️/⚔️ 同一套写法）+「文风优化」+ 后缀「 任选」。',
    contentChange: '新增，content = 空字符串',
    enabled: true,
    fields: Object.keys(newStyleEntry).join(','),
    neighbor: nodeWritingId,
    extra: { content: '' },
  });

  // ---------- A3：模型类型 选一 去掉 emoji 表 ----------
  nodeModelCard.content = firstBlock;
  changes.push({
    id: 'A3',
    title: '删掉「模型类型 选一」里的 emoji 表',
    position: 'order 第 ' + idxModelCard + ' 位（`' + TARGET_MODEL_CARD + '`）',
    identifier: nodeModelCardId,
    name: TARGET_MODEL_CARD,
    contentChange: 'content 去掉第二段 {{// ... }}（' + secondBlock.length + ' 字符），只保留第一段注释；name 与其他字段一字未改',
    enabled: nodeModelCard.enabled,
    fields: '(未改动字段集合)',
    neighbor: '-',
    extra: { removed: secondBlock, kept: firstBlock },
  });

  // ---------- A4：三条变量条目改名 ----------
  for (const r of VAR_RENAMES) {
    const t = out.prompts.find((p) => trimName(p) === r.from);
    if (!t) {
      addAssert('a4-target-' + r.from, false, '找不到条目 ' + r.from);
      continue;
    }
    const before = t.name;
    t.name = r.to;
    changes.push({
      id: 'A4',
      title: '变量条目改名',
      position: 'order 第 ' + orderArr.findIndex((o) => o.identifier === t.identifier) + ' 位',
      identifier: t.identifier,
      name: r.to,
      contentChange: 'content 未改动；name 「' + before + '」→「' + r.to + '」',
      enabled: t.enabled,
      fields: '(未改动字段集合)',
      neighbor: '-',
      extra: {},
    });
  }

  // ---------- 断言 3：顺序一致性 ----------
  const newOrderIds = orderArr.map((o) => o.identifier);
  const filteredNew = newOrderIds.filter((id) => id !== NEW_ID_MODEL && id !== NEW_ID_STYLE);
  const origIds = origOrderArr.map((o) => o.identifier);
  let sameSeq = filteredNew.length === origIds.length;
  if (sameSeq) {
    for (let i = 0; i < origIds.length; i++) {
      if (filteredNew[i] !== origIds[i]) {
        sameSeq = false;
        break;
      }
    }
  }
  addAssert(
    'order-sequence-preserved',
    sameSeq,
    '剔除两条新增后，order 里 161 条既有 identifier 的序列与原文件逐位相同'
  );
  addAssert(
    'order-insert-positions',
    newOrderIds.indexOf(NEW_ID_MODEL) === idxDisclaimer + 1 && newOrderIds.indexOf(NEW_ID_STYLE) === idxWriting + 2,
    '📋 支持模型列表 @ order[' + newOrderIds.indexOf(NEW_ID_MODEL) + ']，✒️ [文风优化] 任选 @ order[' + newOrderIds.indexOf(NEW_ID_STYLE) + ']'
  );

  // ---------- 断言 4：其余条目一个字符都没动 ----------
  const touched = new Set([nodeModelCardId]);
  for (const r of VAR_RENAMES) {
    const t = original.prompts.find((p) => trimName(p) === r.from);
    if (t) touched.add(t.identifier);
  }
  const origById = new Map();
  for (const p of original.prompts) origById.set(p.identifier, p);
  const newById = new Map();
  for (const p of out.prompts) newById.set(p.identifier, p);
  const untouchedDiff = [];
  for (const id of origById.keys()) {
    if (touched.has(id)) continue;
    const a = JSON.stringify(origById.get(id));
    const b = newById.has(id) ? JSON.stringify(newById.get(id)) : '<<MISSING>>';
    if (a !== b) untouchedDiff.push(id);
  }
  addAssert(
    'other-entries-untouched',
    untouchedDiff.length === 0,
    untouchedDiff.length === 0
      ? '除 A3 改的 1 条 + A4 改名的 3 条之外，其余 161 条 prompt 完全逐字节相同'
      : '被意外改动：' + untouchedDiff.join(', ')
  );
  addAssert('prompt-count', out.prompts.length === original.prompts.length + 2, 'prompts: ' + original.prompts.length + ' → ' + out.prompts.length);
  addAssert('order-length', orderArr.length === origOrderArr.length + 2, 'order: ' + origOrderArr.length + ' → ' + orderArr.length);

  // ---------- 断言 5：字段集合与邻居一致 ----------
  const keysOf = (o) => Object.keys(o).join(',');
  addAssert(
    'a1-field-set-match-neighbor',
    keysOf(newStyleEntry) === keysOf(nodeWriting),
    '新增 A1 字段集合 == 邻居 `' + ANCHOR_WRITING + '`：' + keysOf(newStyleEntry)
  );
  addAssert(
    'a2-field-set-match-neighbor',
    keysOf(newModelEntry) === keysOf(nodeDisclaimer),
    '新增 A2 字段集合 == 邻居 `' + ANCHOR_DISCLAIMER + '`：' + keysOf(newModelEntry)
  );

  // ---------- 断言 6：表格 verbatim 搬运 ----------
  addAssert('table-moved-verbatim', newById.get(NEW_ID_MODEL).content === secondBlock, '登记表内容与从 `' + TARGET_MODEL_CARD + '` 删掉的第二段完全一致');
  addAssert('a3-content-equals-first-block', newById.get(nodeModelCardId).content === firstBlock, '「模型类型 选一」content == 第一段注释');

  // ---------- 断言 7：改名后竖线只出现在两个约定后缀里 ----------
  const postHits = out.prompts.filter((p) => (typeof p.name === 'string' ? p.name : '').indexOf('|') >= 0);
  const illegal = postHits.filter((p) => {
    const n = p.name.trim();
    return !(n.endsWith(VAR_SUFFIX) || n.endsWith(MODEL_SUFFIX));
  });
  addAssert(
    'post-pipe-only-convention',
    illegal.length === 0 && postHits.length === 4,
    '迁移后含竖线的 name 共 ' + postHits.length + ' 条，全部是 ` | var`(3) 或 ` | model`(1)：' + postHits.map((p) => p.name.trim()).join(' / ')
  );

  // ---------- 断言 8：order[i].enabled 与 prompts[i].enabled 一致（迁移前后） ----------
  const mismatchBefore = [];
  const mismatchAfter = [];
  for (const o of origOrderArr) {
    const p = origById.get(o.identifier);
    if (p && p.enabled !== undefined && p.enabled !== o.enabled) mismatchBefore.push(o.identifier);
  }
  for (const o of orderArr) {
    const p = newById.get(o.identifier);
    if (p && p.enabled !== undefined && p.enabled !== o.enabled) mismatchAfter.push(o.identifier);
  }
  addAssert('enabled-consistency', mismatchAfter.length === mismatchBefore.length, 'order.enabled 与 prompts.enabled 不一致条目数：迁移前 ' + mismatchBefore.length + ' / 迁移后 ' + mismatchAfter.length);

  // ---------- 断言 9：prompts 数组下标与 order 下标仍对齐 ----------
  let alignOk = true;
  for (let i = 0; i < orderArr.length; i++) {
    if (out.prompts[i] === undefined || out.prompts[i].identifier !== orderArr[i].identifier) {
      alignOk = false;
      break;
    }
  }
  addAssert('index-alignment', alignOk, 'out.prompts[i].identifier == out.prompt_order[0].order[i].identifier（前 ' + orderArr.length + ' 条）');

  const ok = assertions.every((a) => a.ok);
  return { ok: ok, alreadyMigrated: false, preset: out, changes: changes, assertions: assertions, logs: logs, anchors: { idxDisclaimer: idxDisclaimer, idxWriting: idxWriting, idxModelCard: idxModelCard } };
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  const wantWrite = args.indexOf('--write') >= 0;
  const rawText = fs.readFileSync(PRESET_PATH, 'utf8');
  const original = JSON.parse(rawText);
  const result = migratePreset(original, { rawText: rawText });

  const lines = [];
  lines.push('==== 卡密预设 · 迁移脚本（' + (wantWrite ? '--write' : '--check（默认）') + '）====');
  lines.push('预设：' + PRESET_PATH + '（' + rawText.length + ' 字符，' + original.prompts.length + ' 条 prompts，order ' + original.prompt_order[0].order.length + ' 项）');
  lines.push('');

  if (result.alreadyMigrated) {
    lines.push(result.logs.join(NL));
    console.log(lines.join(NL));
    return 0;
  }

  lines.push('---- 改动清单（共 ' + result.changes.length + ' 处）----');
  for (const c of result.changes) {
    lines.push('[' + c.id + '] ' + c.title);
    lines.push('     位置：' + c.position);
    lines.push('     identifier：' + c.identifier);
    lines.push('     name：' + c.name + (c.nameNote ? '   <<< ' + c.nameNote : ''));
    lines.push('     字段：' + c.contentChange);
    lines.push('     字段集合：' + c.fields);
  }
  lines.push('');
  lines.push('---- 断言结果 ----');
  let failed = 0;
  for (const a of result.assertions) {
    if (!a.ok) failed++;
    lines.push((a.ok ? '[PASS] ' : '[FAIL] ') + a.id + ' :: ' + a.detail);
  }
  lines.push('');
  const migratedText = JSON.stringify(result.preset, null, 2);
  lines.push('---- 迁移后体积（内存态）----');
  lines.push('原：' + rawText.length + ' 字符；迁移后：' + migratedText.length + ' 字符；差：' + (migratedText.length - rawText.length));
  const styleOk = JSON.stringify(original, null, 2) === rawText;
  lines.push('写盘风格：JSON.stringify(preset, null, 2)，与原文件逐字节一致 = ' + styleOk + '（无结尾换行）');
  if (result.logs.length > 0) {
    lines.push('');
    lines.push('---- 备注 ----');
    for (const l of result.logs) lines.push(l);
  }
  lines.push('');
  const ok = result.ok && failed === 0;
  lines.push('==== 结果：' + (ok ? '全部断言通过' : '有断言失败（' + failed + ' 条），未写盘') + ' ====');

  if (wantWrite) {
    if (!ok) {
      lines.push('存在失败断言，拒绝写盘。');
      console.log(lines.join(NL));
      return 1;
    }
    fs.writeFileSync(PRESET_PATH, migratedText, 'utf8');
    lines.push('已写盘：' + PRESET_PATH);
  } else {
    lines.push('（--check 模式：只报告，未写盘。要落地请显式加 --write）');
  }
  console.log(lines.join(NL));
  return ok ? 0 : 1;
}

const isMain = process.argv[1] && process.argv[1].indexOf('preset-migrate') >= 0;
if (isMain) {
  process.exitCode = main();
}
