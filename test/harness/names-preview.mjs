#!/usr/bin/env node
/**
 * 命名规则原型验证：node test/harness/names-preview.mjs
 * ------------------------------------------------------------------
 * 目的：并排验证三套「预设条目命名方案」在真实预设 src/preset.base.json 上的表现。
 *   V0 · 现状（一个字都不改）
 *   V1 · 前缀式（#tab / #end / #group / #var）
 *   V2 · 最小侵入式（结构名一字不改，只在变量条目名字末尾追加 ｜变量:... 标记）
 *
 * 四件事：
 *   (A) 按 prompt_order[0].order 读出真实条目序列 + 定位「🗂️ 最近用户输入」
 *   (B) 生成三套变体的改后名字（只改名，绝不改动顺序、不增删条目）
 *   (C) 对每套变体跑一遍原型解析器，输出解析树 + 结构区统计 + 孤儿 + 特例清单
 *   (D) 硬断言：三套变体的 identifier 序列与原预设完全一致（零重排），失败 exit(1)
 *
 * 只读脚本：不写任何文件，不修改预设。
 * 本工作区约束：脚本内不出现反斜杠字面量与美元号字面量，正则一律用 indexOf/includes 替代。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRESET_PATH = path.join(ROOT, 'src', 'preset.base.json');

const TRI_DOWN = String.fromCodePoint(0x1F53B); // 层级开标记
const TRI_UP = String.fromCodePoint(0x1F53A);   // 层级闭标记
const FULL_COLON = String.fromCodePoint(0xFF1A);
const FULL_BAR = String.fromCodePoint(0xFF5C);
const ROBOT = String.fromCodePoint(0x1F916);
const NL = String.fromCharCode(10);
const SEP = String.fromCharCode(1);
const DIGITS = '0123456789.';

/* ============================ 0. 载入 ============================ */

const parsed = JSON.parse(fs.readFileSync(PRESET_PATH, 'utf8'));
const ORDER = parsed.prompt_order[0].order;
const BY_ID = new Map();
parsed.prompts.forEach(function (p) { BY_ID.set(p.identifier, p); });
const TOTAL = ORDER.length;

const entryAt = function (i) { return BY_ID.get(ORDER[i].identifier); };
const contentOf = function (p) { return p && typeof p.content === 'string' ? p.content : ''; };
const contentAt = function (i) { return contentOf(entryAt(i)); };
const nameAt = function (i) { return entryAt(i).name; };
const trimAt = function (i) { return nameAt(i).trim(); };
const id8 = function (i) { return ORDER[i].identifier.slice(0, 8); };
const countOf = function (s, sub) { return s.split(sub).length - 1; };
const padL = function (s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; };
const padR = function (s, n) { s = String(s); while (s.length < n) s = s + ' '; return s; };

function isNumericValue(v) {
  if (!v) return false;
  for (const ch of v) { if (!DIGITS.includes(ch)) return false; }
  return true;
}
function commentBlocks(c) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = c.indexOf('{{//', i);
    if (a < 0) break;
    const b = c.indexOf('}}', a + 4);
    out.push(c.slice(a + 4, b < 0 ? c.length : b));
    i = b < 0 ? c.length : b + 2;
  }
  return out;
}
function firstComment(c) {
  const b = commentBlocks(c);
  return b.length ? b[0].trim() : null;
}
function setvarsOf(c) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = c.indexOf('{{setvar::', i);
    if (a < 0) break;
    const b = c.indexOf('}}', a);
    const body = c.slice(a + 10, b < 0 ? c.length : b);
    const parts = body.split('::');
    out.push({ name: parts[0], value: parts.length > 1 ? parts.slice(1).join('::') : '' });
    i = a + 11;
  }
  return out;
}
function numericSetvars(c) {
  return setvarsOf(c).filter(function (s) { return isNumericValue(s.value); });
}
/* 模型登记表：任一注释块里出现 <emoji>：表示<X>系列模型 的行 */
function modelTableOf(c) {
  const blocks = commentBlocks(c);
  for (const b of blocks) {
    const hit = [];
    const lines = b.split(NL);
    for (const ln of lines) {
      const t = ln.trim();
      const ci = t.indexOf(FULL_COLON);
      if (ci > 0 && t.includes('表示') && t.includes('系列模型')) {
        const emo = t.slice(0, ci).trim();
        if (emo && emo.length <= 8) hit.push({ emoji: emo, label: t.slice(ci + 1).trim() });
      }
    }
    if (hit.length) return hit;
  }
  return null;
}

const MODEL_TABLE_AT = [];
for (let i = 0; i < TOTAL; i++) { if (modelTableOf(contentAt(i))) MODEL_TABLE_AT.push(i); }
const MODEL_TABLE = MODEL_TABLE_AT.length ? modelTableOf(contentAt(MODEL_TABLE_AT[0])) : [];
const MODEL_EMOJIS = MODEL_TABLE.map(function (m) { return m.emoji; });
const modelHits = function (t) { return MODEL_EMOJIS.filter(function (e) { return t.includes(e); }); };

const isCardHeadName = function (t) { return t.endsWith(' 选一') || t.endsWith(' 任选'); };
const cardHeadX = function (t) { return t.slice(0, t.length - 3).trim(); };
const cardHeadKw = function (t) { return t.endsWith(' 选一') ? '选一' : '任选'; };
const isLevelMarker = function (i) {
  const t = trimAt(i);
  const d = countOf(t, TRI_DOWN), u = countOf(t, TRI_UP);
  return (d === 1 && u === 0) || (u === 1 && d === 0);
};

/* 用户可调变量：setvar 的值必须全部是纯数字（V0 唯一能用的判据） */
const VAR_INDEX = [];
for (let i = 0; i < TOTAL; i++) { if (numericSetvars(contentAt(i)).length) VAR_INDEX.push(i); }
const variableEntries = VAR_INDEX.map(function (i) {
  const sv = numericSetvars(contentAt(i));
  const names = sv.map(function (s) { return s.name; });
  const values = sv.map(function (s) { return s.value; });
  const isRange = names.length === 2 && names[0].endsWith('_min') && names[1].endsWith('_max');
  return { i: i, names: names, values: values, type: isRange ? '范围' : '数字' };
});
const VAR_BY_INDEX = new Map(variableEntries.map(function (e) { return [e.i, e]; }));
const varLine = function (e) { return e.names.join(',') + ':' + e.type + ':' + e.values.join(','); };
const VAR_TOTAL = variableEntries.reduce(function (a, e) { return a + e.names.length; }, 0);

/* ============================ (A) 真实条目序列 ============================ */

console.log('==================================================================');
console.log('(A) 真实条目序列 —— 按 prompt_order[0].order（共 ' + TOTAL + ' 条）');
console.log('    prompts 总数 = ' + parsed.prompts.length + '，其中 ' + (parsed.prompts.length - TOTAL) +
  ' 条不在 order 里（酒馆内置槽位 main / nsfw / jailbreak / enhanceDefinitions）');
console.log('    prompt_order[0].character_id = ' + parsed.prompt_order[0].character_id + '（本文件只有 ' + parsed.prompt_order.length + ' 组 order）');
console.log('==================================================================');
console.log('idx | id前8    | 开 | 字数 | 名字（trim 后）');
for (let i = 0; i < TOTAL; i++) {
  const p = entryAt(i);
  const lead = nameAt(i).length - nameAt(i).trimStart().length;
  const nm = trimAt(i) + (lead ? '   [前导空格x' + lead + ']' : '');
  console.log(padL(i, 3) + ' | ' + padR(id8(i), 8) + ' | ' + (p.enabled ? 'O' : '.') + '  | ' +
    padL(contentAt(i).length, 4) + ' | ' + nm);
}

const RU = 140;
console.log('');
console.log('--- (A3) identifier 形态（主键可读性）---');
(function () {
  const all = ORDER.map(function (o) { return o.identifier; });
  const distinct = new Set(all);
  const byHead = new Map();
  all.forEach(function (id) {
    const h = id.slice(0, 8);
    if (!byHead.has(h)) byHead.set(h, 0);
    byHead.set(h, byHead.get(h) + 1);
  });
  const headPrompt = all.filter(function (id) { return id.slice(0, 8) === 'prompt_1'; }).length;
  console.log('  order 内 identifier 总数 = ' + all.length + '，去重后 = ' + distinct.size + '（无重复，可安全做主键）');
  console.log('  其中 ' + headPrompt + ' 条的「前 8 位」都是 prompt_1（因为 id 形如 prompt_<13位时间戳>_<7位随机>）');
  console.log('  => 前 8 位只能当展示用的短号，不能当主键/不能用来区分条目；要短号请取后 7 位');
  console.log('  形如 prompt_... 的条目 = ' + headPrompt + ' 条，其余 ' + (all.length - headPrompt) + ' 条是固定语义 id（worldInfoBefore / chatHistory / main 等）');
})();
console.log('');
console.log('--- (A4) setvar 统计（决定「哪些是用户可改的数值变量」这条规则的难度）---');
(function () {
  const withSv = [], emptyOnly = [], nonNumeric = [], numeric = [];
  for (let i = 0; i < TOTAL; i++) {
    const sv = setvarsOf(contentAt(i));
    if (!sv.length) continue;
    withSv.push(i);
    const allEmpty = sv.every(function (s) { return s.value === ''; });
    const allNum = sv.every(function (s) { return isNumericValue(s.value); });
    if (allEmpty) emptyOnly.push(i); else if (allNum) numeric.push(i); else nonNumeric.push(i);
  }
  const fmt = function (arr) {
    return arr.map(function (i) { return trimAt(i) + '(' + setvarsOf(contentAt(i)).length + '个)'; }).join('  ');
  };
  console.log('  含 setvar 的条目 = ' + withSv.length + ' 条');
  console.log('    值全为空   = ' + emptyOnly.length + ' 条: ' + fmt(emptyOnly));
  console.log('    值全为纯数字 = ' + numeric.length + ' 条: ' + fmt(numeric));
  console.log('    值含非数字 = ' + nonNumeric.length + ' 条: ' + fmt(nonNumeric));
  console.log('  => 若判据写成「含非空 setvar」会得到 ' + (withSv.length - emptyOnly.length) + ' 个"变量"（多出 ' + (withSv.length - emptyOnly.length - numeric.length) + ' 个），所以必须收紧到「值全为纯数字」');
})();
console.log('');
console.log('--- (A2) 「🗂️ 最近用户输入」位置核对 ---');
console.log('order 下标            = ' + RU + '（0 起算，全序列第 ' + (RU + 1) + ' 条）');
console.log('identifier            = ' + ORDER[RU].identifier);
console.log('名字                  = ' + JSON.stringify(nameAt(RU)));
console.log('它前面有几条          = ' + RU + ' 条');
console.log('它属于哪个 X🔻 层级   = 无 —— 它不在任何层级内（它所属的"层级"不存在）');
console.log('它所在位置            = 「🔺交互历史🔺」(order[137]) 之后、「🧠 推理选项🔻」(order[141]) 之前');
console.log('它前面 2 条           = [138]' + trimAt(138) + '  /  [139]' + trimAt(139));
console.log('它后面 1 条           = [141]' + trimAt(141));
console.log('层级内第几条          = 不适用（不在层级内）=>「层级内第一张卡片头之前」这条规则够不到它');
console.log('是否在 🔻🔻 包裹区内   = 否（最近的包裹区 🔻交互历史🔻…🔺交互历史🔺 已在 order[137] 闭合）');
console.log('role / injPos / depth = ' + entryAt(RU).role + ' / ' + entryAt(RU).injection_position + ' / ' + entryAt(RU).injection_depth);
console.log('marker / enabled / 字数 = ' + entryAt(RU).marker + ' / ' + entryAt(RU).enabled + ' / ' + contentAt(RU).length);
console.log('content               = ' + JSON.stringify(contentAt(RU)));
console.log('唯一同类              = order[0] ' + JSON.stringify(trimAt(0)) + '（另一条不在任何层级/包裹区内的内容条目）');

/* ============================ (B) 三套变体 ============================ */

function buildVariants() {
  const v0 = [], v1 = [], v2 = [];
  const rows = [];
  for (let i = 0; i < TOTAL; i++) {
    const raw = nameAt(i);
    const t = raw.trim();
    const d = countOf(t, TRI_DOWN), u = countOf(t, TRI_UP);
    const isWrap = (d === 2 && u === 0) || (u === 2 && d === 0);
    const isOpen = d === 1 && u === 0;
    const isClose = u === 1 && d === 0;
    const isTable = MODEL_TABLE_AT.includes(i);
    const isCard = !isTable && isCardHeadName(t);
    const ve = VAR_BY_INDEX.get(i);

    v0.push(raw);

    let n1 = t;
    if (isWrap) n1 = t;
    else if (isOpen) n1 = '#tab ' + t.slice(0, t.length - TRI_DOWN.length).trim();
    else if (isClose) n1 = '#end';
    else if (isTable) n1 = '#tab ' + ROBOT + ' 模型';
    else if (isCard) n1 = '#group ' + cardHeadX(t) + ' | ' + cardHeadKw(t);
    else if (ve) n1 = '#var ' + t + ' | ' + varLine(ve);
    v1.push(n1);

    let n2 = raw;
    if (ve) n2 = t + ' ' + FULL_BAR + '变量:' + varLine(ve);
    v2.push(n2);

    if (n1 !== t || n2 !== raw) rows.push({ i: i, id: id8(i), tail: ORDER[i].identifier.slice(-6), orig: t, v1: n1, v2: n2 });
  }
  return { v0: v0, v1: v1, v2: v2, rows: rows };
}
const VARIANTS = buildVariants();
const ch1 = VARIANTS.v1.filter(function (n, i) { return n !== nameAt(i).trim(); }).length;
const ch2 = VARIANTS.v2.filter(function (n, i) { return n !== nameAt(i); }).length;

console.log('');
console.log('==================================================================');
console.log('(B) 三套命名变体：只在名字上有变化的条目（按原顺序，共 ' + VARIANTS.rows.length + ' 行）');
console.log('==================================================================');
console.log('idx | id前8    | id后6  | 原名 | V1 改后 | V2 改后');
VARIANTS.rows.forEach(function (r) {
  console.log(padL(r.i, 3) + ' | ' + padR(r.id, 8) + ' | ' + padR(r.tail, 6) + ' | ' + r.orig + ' | ' + r.v1 + ' | ' + r.v2);
});
console.log('');
console.log('--- 改名统计 ---');
console.log('V0 改名 = 0 条 / ' + TOTAL + '（0.0%）');
console.log('V1 改名 = ' + ch1 + ' 条 / ' + TOTAL + '（' + (ch1 / TOTAL * 100).toFixed(1) + '%）  = 8 个层级开 + 8 个层级闭 + 1 个模型表 + 20 个卡片头 + 3 个变量条目');
console.log('V2 改名 = ' + ch2 + ' 条 / ' + TOTAL + '（' + (ch2 / TOTAL * 100).toFixed(1) + '%）  = 3 个变量条目');
console.log('名字带前导空格 = 5 条（order 111/113/116/141/153）：V1 改名时顺手抹掉，V2/V0 原样保留');
console.log('');
console.log('--- 变量条目改名后的长度（UTF-16 码元数，emoji 算 2）---');
variableEntries.forEach(function (e) {
  const orig = trimAt(e.i);
  const l1 = VARIANTS.v1[e.i];
  const l2 = VARIANTS.v2[e.i].trim();
  console.log('  ' + padR(orig, 10) + ' 原 ' + padL(orig.length, 3) + '  |  V1 ' + padL(l1.length, 3) + '  |  V2 ' + padL(l2.length, 3));
});

/* ============================ (C) 原型解析器 ============================ */

function classify(key, i) {
  const p = entryAt(i);
  const t = VARIANTS[key][i].trim();
  if (p.marker) return { kind: 'MARKER' };

  if (key === 'v1') {
    if (t.startsWith('#tab ')) {
      if (MODEL_TABLE_AT.includes(i)) return { kind: 'MODEL_TABLE', title: ROBOT + ' 模型' };
      return { kind: 'LEVEL_OPEN', title: t.slice(5).trim() };
    }
    if (t === '#end') return { kind: 'LEVEL_CLOSE' };
    if (t.startsWith('#group ')) {
      const body = t.slice(7);
      const bar = body.lastIndexOf(' | ');
      return { kind: 'CARD_HEAD', title: bar > 0 ? body.slice(0, bar).trim() : body.trim(), mode: bar > 0 ? body.slice(bar + 3).trim() : '' };
    }
    if (t.startsWith('#var ')) {
      const ve = VAR_BY_INDEX.get(i);
      return { kind: 'VAR', title: ve ? ve.names[0] : t, vars: ve };
    }
    const d = countOf(t, TRI_DOWN), u = countOf(t, TRI_UP);
    if (d === 2 && u === 0) return { kind: 'WRAP_OPEN' };
    if (u === 2 && d === 0) return { kind: 'WRAP_CLOSE' };
    if (modelHits(t).length) return { kind: 'MODEL_MEMBER', models: modelHits(t) };
    return { kind: 'PLAIN' };
  }

  const d = countOf(t, TRI_DOWN), u = countOf(t, TRI_UP);
  if (d === 2 && u === 0) return { kind: 'WRAP_OPEN' };
  if (u === 2 && d === 0) return { kind: 'WRAP_CLOSE' };
  if (d === 1 && u === 0) return { kind: 'LEVEL_OPEN', title: t.slice(0, t.length - TRI_DOWN.length).trim() };
  if (u === 1 && d === 0) return { kind: 'LEVEL_CLOSE', title: t.slice(0, t.length - TRI_UP.length).trim() };
  if (MODEL_TABLE_AT.includes(i)) return { kind: 'MODEL_TABLE', title: ROBOT + ' 模型' };
  if (key === 'v2' && t.includes(' ' + FULL_BAR + '变量:')) {
    const ve = VAR_BY_INDEX.get(i);
    return { kind: 'VAR', title: ve ? ve.names[0] : t, vars: ve };
  }
  if (isCardHeadName(t)) return { kind: 'CARD_HEAD', title: cardHeadX(t), mode: cardHeadKw(t) };
  if (modelHits(t).length) return { kind: 'MODEL_MEMBER', models: modelHits(t) };
  if (key === 'v0') {
    const ve = VAR_BY_INDEX.get(i);
    if (ve) return { kind: 'VAR', title: ve.names[0], vars: ve };
  }
  return { kind: 'PLAIN' };
}

function buildTree(key, opts) {
  const strictPreCard = !!opts.strictPreCard;
  const topLevelRule = !!opts.topLevelRule;
  const levelStack = [];
  let wrapDepth = 0;
  const tabs = [];
  const structure = { preCard: [], wrap: [], topLevel: [], levelNoTab: [], marker: [] };
  let curCard = null;
  let modelTableEntry = null;

  function here() { return levelStack.length ? levelStack[levelStack.length - 1] : null; }
  function place(i) {
    if (wrapDepth > 0) { structure.wrap.push(i); return; }
    const lv = here();
    if (!lv) { structure.topLevel.push(i); return; }
    if (curCard) curCard.items.push(i); else lv.loose.push(i);
  }

  for (let i = 0; i < TOTAL; i++) {
    const it = classify(key, i);
    if (it.kind === 'WRAP_OPEN') { structure.wrap.push(i); wrapDepth++; continue; }
    if (it.kind === 'WRAP_CLOSE') { structure.wrap.push(i); wrapDepth = Math.max(0, wrapDepth - 1); continue; }
    if (it.kind === 'MARKER') { structure.marker.push(i); continue; }
    if (it.kind === 'MODEL_TABLE') {
      modelTableEntry = i;
      const lv = here();
      if (lv) lv.loose.push(i); else structure.topLevel.push(i);
      continue;
    }
    if (it.kind === 'LEVEL_OPEN') {
      const lv = { open: i, title: it.title, desc: firstComment(contentAt(i)), cards: [], loose: [], vars: [], close: null, hasTab: false };
      levelStack.push(lv); tabs.push(lv); curCard = null; continue;
    }
    if (it.kind === 'LEVEL_CLOSE') {
      const lv = levelStack.pop();
      if (lv) lv.close = i; else structure.topLevel.push(i);
      curCard = null; continue;
    }
    if (it.kind === 'CARD_HEAD') {
      const lv = here();
      if (!lv) { structure.topLevel.push(i); continue; }
      curCard = { head: i, title: it.title, mode: it.mode, items: [] };
      lv.cards.push(curCard); continue;
    }
    if (it.kind === 'VAR') {
      const lv = here();
      if (!lv) { structure.topLevel.push(i); continue; }
      lv.vars.push(i);
      if (curCard) curCard.items.push(i); else lv.loose.push(i);
      continue;
    }
    place(i);
  }

  tabs.forEach(function (lv) {
    const hasCard = lv.cards.length > 0;
    lv.hasTab = key === 'v1' ? true : (opts.allLevelsAreTabs ? true : (hasCard || lv.vars.length > 0));
    if (!lv.hasTab) {
      const all = [];
      const last = lv.close === null ? lv.open : lv.close;
      for (let k = lv.open; k <= last; k++) all.push(k);
      structure.levelNoTab.push({ title: lv.title, items: all });
      lv.loose = []; lv.cards = []; lv.vars = [];
    } else if (strictPreCard && hasCard) {
      const firstCard = lv.cards[0].head;
      const keep = [];
      lv.loose.forEach(function (k) {
        if (k < firstCard && k !== lv.open && !modelHits(VARIANTS[key][k].trim()).length) structure.preCard.push(k);
        else keep.push(k);
      });
      lv.loose = keep;
    }
  });

  const modelCards = MODEL_TABLE.map(function (m) {
    const members = [];
    for (let i = 0; i < TOTAL; i++) {
      const it = classify(key, i);
      if (it.kind === 'MODEL_MEMBER' && it.models.includes(m.emoji)) members.push(i);
    }
    return { emoji: m.emoji, title: m.emoji + ' ' + (m.label.startsWith('表示') ? m.label.slice(2) : m.label), members: members };
  });
  const multi = [];
  const duplicates = [];
  for (let i = 0; i < TOTAL; i++) {
    const it = classify(key, i);
    if (it.kind === 'MODEL_MEMBER') {
      duplicates.push(i);
      if (it.models.length > 1) multi.push({ i: i, models: it.models });
    }
  }

  const assigned = new Set();
  structure.wrap.forEach(function (i) { assigned.add(i); });
  structure.marker.forEach(function (i) { assigned.add(i); });
  structure.preCard.forEach(function (i) { assigned.add(i); });
  structure.levelNoTab.forEach(function (g) { g.items.forEach(function (i) { assigned.add(i); }); });
  if (topLevelRule) structure.topLevel.forEach(function (i) { assigned.add(i); });
  tabs.forEach(function (lv) {
    if (!lv.hasTab) return;
    assigned.add(lv.open); if (lv.close !== null) assigned.add(lv.close);
    lv.loose.forEach(function (i) { assigned.add(i); });
    lv.cards.forEach(function (cd) { assigned.add(cd.head); cd.items.forEach(function (i) { assigned.add(i); }); });
  });
  const orphans = [];
  for (let i = 0; i < TOTAL; i++) { if (!assigned.has(i)) orphans.push(i); }

  /* 不出 tab 且真的看不见的实体条目（排除已经在 🤖 模型 视图里出现的） */
  const noTabItems = [];
  structure.levelNoTab.forEach(function (g) {
    g.items.forEach(function (i) {
      if (isLevelMarker(i)) return;
      if (MODEL_TABLE_AT.includes(i)) return;
      if (modelHits(trimAt(i)).length) return;
      noTabItems.push(i);
    });
  });

  return {
    key: key, tabs: tabs, structure: structure, orphans: orphans, noTabItems: noTabItems,
    modelCards: modelCards, multi: multi, duplicates: duplicates,
    modelTableEntry: modelTableEntry, assigned: assigned.size,
    opts: opts
  };
}

function showItem(key, i) {
  const p = entryAt(i);
  const hasC = contentAt(i).includes('{{//');
  return VARIANTS[key][i].trim() + '  <' + id8(i) + '> ' + (p.enabled ? 'on ' : 'off') + (hasC ? ' [注]' : '     ');
}
function showList(key, arr, indent, cap) {
  const show = (cap && arr.length > cap) ? arr.slice(0, cap) : arr;
  show.forEach(function (i) { console.log(indent + showItem(key, i)); });
  if (cap && arr.length > cap) console.log(indent + '...共 ' + arr.length + ' 条');
}

function printTree(key, label, opts, compact) {
  const T = buildTree(key, opts);
  console.log('');
  console.log('------------------------------------------------------------------');
  console.log('解析树 · ' + label);
  console.log('------------------------------------------------------------------');
  let nTabs = 0, nCards = 0, nItems = 0;
  T.tabs.forEach(function (lv) {
    if (!lv.hasTab) {
      const g = T.structure.levelNoTab.find(function (x) { return x.title === lv.title; }) || { items: [] };
      console.log('[不出 tab] ' + lv.title + ' —— 无卡片头、无变量条目，整层归结构区（' + g.items.length + ' 条）');
      return;
    }
    nTabs++;
    console.log('TAB ' + lv.title + '   说明: ' + (lv.desc ? lv.desc : '(无)'));
    lv.vars.forEach(function (i) {
      const ve = VAR_BY_INDEX.get(i);
      console.log('   变量 ' + showItem(key, i) + '  => ' + ve.names.join(' + ') + ' / ' + ve.type + ' / ' + ve.values.join(', '));
    });
    lv.cards.forEach(function (cd) {
      nCards++; nItems += cd.items.length;
      console.log('   卡片 [' + cd.title + '] 模式=' + cd.mode + '  条目 ' + cd.items.length + ' 条');
      if (!compact) showList(key, cd.items, '      ', 4);
    });
    if (lv.loose.length) {
      nItems += lv.loose.length;
      console.log('   （无卡片归属的层级条目 ' + lv.loose.length + ' 条）');
      if (!compact) showList(key, lv.loose, '      ', 6);
    }
  });
  console.log('TAB ' + ROBOT + ' 模型（视图，条目同时保留在原层级）  数据源 = order[' + T.modelTableEntry + '] ' + trimAt(T.modelTableEntry));
  T.modelCards.forEach(function (mc) {
    nCards++;
    console.log('   卡片 [' + mc.title + ']  条目 ' + mc.members.length + ' 条');
    if (!compact) mc.members.forEach(function (i) {
      const it = classify(key, i);
      console.log('      ' + showItem(key, i) + (it.models.length > 1 ? '   <<多模型共用 ' + it.models.join('+') + '>>' : ''));
    });
  });
  console.log('   多模型共用条目 = ' + T.multi.length + ' 条：' + T.multi.map(function (x) { return trimAt(x.i) + '(' + x.models.join('+') + ')'; }).join('  |  '));
  console.log('   变量总表 = ' + VAR_INDEX.length + ' 个条目 / ' + VAR_TOTAL + ' 个变量：' +
    variableEntries.map(function (e) { return e.names.join('+') + '(' + e.type + ')'; }).join('  |  ') +
    '   范围配对 = ' + variableEntries.filter(function (e) { return e.type === '范围'; }).length + ' 组');

  console.log('--- 结构区（不出 tab）---');
  console.log('  层级内、第一张卡片头之前的条目 : ' + T.structure.preCard.length + ' 条' +
    (T.structure.preCard.length ? '  ->  ' + T.structure.preCard.map(function (i) { return trimAt(i); }).join('  |  ') : ''));
  console.log('  🔻🔻 包裹区（系统提示词/交互历史） : ' + T.structure.wrap.length + ' 条');
  console.log('  顶层（层级外、包裹区外）        : ' + T.structure.topLevel.length + ' 条' +
    (T.structure.topLevel.length ? '  ->  ' + T.structure.topLevel.map(function (i) { return trimAt(i); }).join('  |  ') : ''));
  console.log('  无卡片无变量的整层              : ' + T.structure.levelNoTab.length + ' 层 / ' +
    T.structure.levelNoTab.reduce(function (a, g) { return a + g.items.length; }, 0) + ' 条' +
    (T.structure.levelNoTab.length ? '  ->  ' + T.structure.levelNoTab.map(function (g) { return g.title + '(' + g.items.length + ')'; }).join('  |  ') : ''));
  console.log('  marker（酒馆注入槽位）          : ' + T.structure.marker.length + ' 条');
  console.log('  已归类条目 = ' + T.assigned + ' / ' + TOTAL);
  console.log('--- 孤儿 ---');
  console.log('  孤儿 = ' + T.orphans.length + ' 条' + (T.orphans.length ? '  ->  ' + T.orphans.map(function (i) { return '[' + i + ']' + trimAt(i); }).join('  |  ') : ''));
  console.log('--- 计数 ---');
  console.log('  tab 数 = ' + nTabs + '（另加 1 个 🤖 模型 视图 tab） / 卡片数 = ' + nCards + ' / tab 内可开关条目 = ' + nItems + ' / 全序列 = ' + TOTAL);
  T.nTabs = nTabs; T.nCards = nCards; T.nItems = nItems;
  return T;
}

console.log('');
console.log('==================================================================');
console.log('(C) 原型解析器输出');
console.log('==================================================================');
const V0 = printTree('v0', 'V0 · 现状（不改名）｜严格版：层级内首张卡片头之前 => 结构区', { strictPreCard: true, topLevelRule: true }, false);
const V1 = printTree('v1', 'V1 · 前缀式｜#tab 显式声明，无「卡片头之前」概念', { strictPreCard: false, topLevelRule: true }, false);
const V2 = printTree('v2', 'V2 · 最小侵入式｜严格版：层级内首张卡片头之前 => 结构区', { strictPreCard: true, topLevelRule: true }, false);
console.log('');
console.log('==================================================================');
console.log('(C2) V0 / V2 换成宽松版（层级内首张卡片头之前 = 普通条目）');
console.log('==================================================================');
const V0L = printTree('v0', 'V0 · 现状｜宽松版', { strictPreCard: false, topLevelRule: true }, true);
const V2L = printTree('v2', 'V2 · 最小侵入式｜宽松版', { strictPreCard: false, topLevelRule: true }, true);

console.log('');
console.log('--- 严格版 vs 宽松版：面板看不见的实体条目 ---');
console.log('严格版被「首张卡片头之前 => 结构区」藏起来的实体条目 = ' + V2.structure.preCard.length + ' 条:');
V2.structure.preCard.forEach(function (i) { console.log('    [' + i + ']' + trimAt(i) + '（' + contentAt(i).length + ' 字）'); });
console.log('严格版被「无卡片无变量 => 不出 tab」藏起来的实体条目 = ' + V2.noTabItems.length + ' 条（已排除在 🤖 模型 视图里可见的模型专属条目）:');
V2.noTabItems.forEach(function (i) { console.log('    [' + i + ']' + trimAt(i) + '（' + contentAt(i).length + ' 字）'); });
console.log('合计：严格版看不到的实体条目 = ' + (V2.structure.preCard.length + V2.noTabItems.length) + ' 条，共 ' +
  V2.structure.preCard.concat(V2.noTabItems).reduce(function (a, i) { return a + contentAt(i).length; }, 0) + ' 字');
console.log('宽松版只放回其中 ' + (V2L.nItems - V2.nItems) + ' 条（E5 那 3 条），因为 📌 任务设置 仍然没有 tab');
console.log('');
console.log('--- 最优口径：宽松版 + 「层级即 tab」（每个 X🔻 层级都出 tab）---');
const V2BEST = printTree('v2', 'V2 · 最小侵入式｜最优口径：宽松 + 层级即 tab', { strictPreCard: false, topLevelRule: true, allLevelsAreTabs: true }, true);
console.log('  => tab 内可开关条目 ' + V2BEST.nItems + ' 条（严格版 ' + V2.nItems + '，宽松版 ' + V2L.nItems + '），看不见的实体条目 ' + V2BEST.noTabItems.length + ' 条，孤儿 ' + V2BEST.orphans.length + ' 条');

console.log('');
console.log('--- V1 的 #tab 嵌套诊断（不加 E2 特判时的裸栈行为）---');
(function () {
  /* 重新按 #tab/#end 走一遍完整栈 */
  const st = [];
  let maxDepth = 0;
  for (let i = 0; i < TOTAL; i++) {
    const t = VARIANTS.v1[i].trim();
    if (t.startsWith('#tab ')) { st.push(t.slice(5).trim()); maxDepth = Math.max(maxDepth, st.length); }
    else if (t === '#end' && st.length) st.pop();
  }
  console.log('  裸栈：最大 tab 深度 = ' + maxDepth + '（因为有 tab 开在另一个 tab 内部）');
  console.log('  裸栈：走到末尾仍未闭合的 tab = ' + st.length + ' 个 -> ' + st.join(' / '));
  console.log('  具体：order[11] 的 #tab 🤖 模型 开在 order[8] 的 #tab 🪓 神秘咒语 内部；order[15] 的 #end 只会关掉 🤖 模型');
})();

/* ============================ (E) 解析器特例清单 ============================ */

console.log('');
console.log('==================================================================');
console.log('(E) 解析器特例清单');
console.log('==================================================================');
const EXC = [
  {
    id: 'E1', what: '模型登记表条目长得像卡片头：order[' + MODEL_TABLE_AT[0] + '] 🤖 [模型类型] 选一',
    nature: '写死（内容耦合）', v0: '写死', v1: '不适用', v2: '写死',
    note: 'V0/V2 必须补「注释块里出现 <emoji>：表示…系列模型 => 该条是数据源、不是卡片头」，否则它会变成一张空卡片'
  },
  {
    id: 'E2', what: 'V1 把模型表改名成 #tab 🤖 模型，而它嵌在 #tab 🪓 神秘咒语 内部',
    nature: '写死（命名方案自身造成的）', v0: '不适用', v1: '写死', v2: '不适用',
    note: '不特判则栈失衡：最大深度 2，末尾 1 个 tab 永不闭合，order[12/13/14] 被塞进嵌套的 🤖 模型 tab'
  },
  {
    id: 'E3', what: '顶层无层级归属的内容条目：order[0] ' + trimAt(0) + '、order[' + RU + '] ' + trimAt(RU),
    nature: '写死 或 补一条通用规则', v0: '写死x2', v1: '写死x2', v2: '写死x2',
    note: '补通用规则「不落在任何 X🔻 层级内的非 marker 条目 = 结构区」即可三套同时归零，且一个字都不用改'
  },
  {
    id: 'E4', what: '无卡片头也无变量条目的层级：order[16] 📌 任务设置🔻（内含 4 条实体内容）',
    nature: '需拍板', v0: '拍板', v1: '不适用', v2: '拍板',
    note: '按「无卡片不出 tab」=> 4 条实体内容（合计 ' + [17, 18, 19, 20].reduce(function (a, i) { return a + contentAt(i).length; }, 0) + ' 字）从面板消失；V1 因为 #tab 显式声明而必然出 tab'
  },
  {
    id: 'E5', what: '层级内、首张卡片头之前的实体条目：order[76] 💀 反死人文风(Gemini可不开)、order[77] 🔄 写作节奏优化、order[78] 🔞 NSFW基础',
    nature: '需拍板', v0: '拍板', v1: '不适用', v2: '拍板',
    note: '按字面「首张卡片头之前 = 结构区」=> 3 条实体内容（合计 ' + [76, 77, 78].reduce(function (a, i) { return a + contentAt(i).length; }, 0) + ' 字）被藏；V1 里它们天然是 tab 内条目'
  },
  {
    id: 'E6', what: '含 setvar 但不是用户可调变量：order[2] 🧩 清空变量（32 个空 setvar）、order[3] 🧩 标签格式（22 个标签 setvar）',
    nature: '写死（启发式）', v0: '写死', v1: '不适用', v2: '不适用',
    note: 'V0 只能靠内容猜，必须补「setvar 值全部是纯数字才算用户可调变量」，否则变量条目从 3 条变 11 条；V1/V2 由名字显式声明，天然免疫'
  },
  {
    id: 'E7', what: '4 条同名 ❌ 不开：order[104/148/152/158]（提示词里写的是 3 条，实测 4 条）',
    nature: '数据约束（不是特例）', v0: '—', v1: '—', v2: '—',
    note: '必须用 identifier 做主键；卡片归属只能靠位置（位置法本身是通用规则）'
  },
  {
    id: 'E8', what: '5 条名字带前导空格：order[111/113/116/141/153]',
    nature: '数据约束（不是特例）', v0: '—', v1: '—', v2: '—',
    note: '比较前一律 trim；V1 改名时顺手抹掉，V2/V0 原样保留'
  },
  {
    id: 'E9', what: '名字含模型名却不是模型条目：order[76] 💀 反死人文风(Gemini可不开)',
    nature: '易错点（不是特例）', v0: '—', v1: '—', v2: '—',
    note: '模型归属只能按登记表里的 emoji 匹配，绝不能按文字（Gemini/DS/GLM/KIMI）匹配，否则会误收这一条'
  },
  {
    id: 'E10', what: '🔻🔻 / 🔺🔺 结构包裹区：order[121/132/133/137]（内含 13 条内容/marker）',
    nature: '通用规则（不是特例）', v0: '—', v1: '—', v2: '—',
    note: '🔻 出现 2 次 => 结构包裹、天然不出 tab；三套通用'
  },
  {
    id: 'E11', what: '层级开/闭条目自身带内容：8 个层级开（<SYSTEM> / <CREATIVE_REQUIREMENTS> / <CHARACTER_DEVELOPMENT> / <WRITING_GUIDE> / <EXTRA_TASKS> …）+ 5 个层级闭（</SYSTEM> …）',
    nature: '结构性约束（不是特例）', v0: '—', v1: '—', v2: '—',
    note: '这 13 条是真实的开/闭标签内容，enabled 必须锁死不可关；V1 把它们改名成 #tab/#end 后，面板仍须当锁定结构条目而不是普通 tab 标题'
  },
  {
    id: 'E12', what: '占位条目：order[112] 占位(暂时只有Gemini的显式思维链)、order[14] 🌒 KIMI(占位)',
    nature: '需拍板', v0: '拍板', v1: '拍板', v2: '拍板',
    note: 'order[112] 按位置落在 🔝 [头部任务] 卡片内（夹在卡片头 111 与下一张卡片头 113 之间），但名字写着「占位」——要不要在面板里隐藏'
  }
];
function excCount(key) {
  return EXC.filter(function (e) { return String(e[key]).startsWith('写死'); })
    .reduce(function (a, e) { return a + (e[key] === '写死x2' ? 2 : 1); }, 0);
}
function pendCount(key) {
  return EXC.filter(function (e) { return e[key] === '拍板'; }).length;
}
EXC.forEach(function (e) {
  console.log(e.id + ' [' + e.nature + '] ' + e.what);
  console.log('     V0=' + e.v0 + '   V1=' + e.v1 + '   V2=' + e.v2);
  console.log('     ' + e.note);
});
console.log('');
console.log('特例数（必须为这份预设的具体内容/名字写死的判断）:');
console.log('  V0 = ' + excCount('v0') + ' 条  (+ 待拍板 ' + pendCount('v0') + ' 条)   [不含顶层规则]');
console.log('  V1 = ' + excCount('v1') + ' 条  (+ 待拍板 ' + pendCount('v1') + ' 条)   [不含顶层规则]');
console.log('  V2 = ' + excCount('v2') + ' 条  (+ 待拍板 ' + pendCount('v2') + ' 条)   [不含顶层规则]');
console.log('  采纳 E3 的通用规则「顶层非 marker 条目 = 结构区」后：V0 = ' + (excCount('v0') - 2) + ' / V1 = ' + (excCount('v1') - 2) + ' / V2 = ' + (excCount('v2') - 2) + ' 条');

/* ============================ 总表 ============================ */

const noRule = {
  v0: buildTree('v0', { strictPreCard: true, topLevelRule: false }),
  v1: buildTree('v1', { strictPreCard: false, topLevelRule: false }),
  v2: buildTree('v2', { strictPreCard: true, topLevelRule: false })
};
console.log('');
console.log('==================================================================');
console.log('(F) 总表');
console.log('==================================================================');
console.log('变体 | 改名 | 特例 | 待拍板 | tab | 卡片 | tab内条目 | 结构区 | 孤儿(无顶层规则) | 孤儿(有顶层规则)');
[['V0', 'v0', V0], ['V1', 'v1', V1], ['V2', 'v2', V2]].forEach(function (row) {
  const label = row[0], key = row[1], T = row[2];
  const structTotal = T.structure.preCard.length + T.structure.wrap.length + T.structure.topLevel.length +
    T.structure.levelNoTab.reduce(function (a, g) { return a + g.items.length; }, 0) + T.structure.marker.length;
  console.log(padR(label, 4) + ' | ' + padL(key === 'v0' ? 0 : (key === 'v1' ? ch1 : ch2), 4) + ' | ' +
    padL(excCount(key), 4) + ' | ' + padL(pendCount(key), 6) + ' | ' + padL(T.nTabs, 3) + ' | ' +
    padL(T.nCards, 4) + ' | ' + padL(T.nItems, 9) + ' | ' + padL(structTotal, 6) + ' | ' +
    padL(noRule[key].orphans.length, 16) + ' | ' + padL(T.orphans.length, 16));
});
console.log('');
console.log('tab 摘要（严格版口径）:');
[['V0', V0], ['V1', V1], ['V2', V2]].forEach(function (row) {
  const label = row[0], T = row[1];
  const parts = T.tabs.map(function (lv) {
    if (!lv.hasTab) return lv.title + '[不出tab]';
    return lv.title + '(卡片' + lv.cards.length + '/条目' + (lv.loose.length + lv.cards.reduce(function (a, cd) { return a + cd.items.length; }, 0)) + ')';
  });
  parts.push(ROBOT + ' 模型(卡片' + T.modelCards.length + '/条目' + T.duplicates.length + ')');
  console.log('  ' + label + ': ' + parts.join('  |  '));
});
console.log('');
console.log('模型卡片明细:');
V2.modelCards.forEach(function (mc) { console.log('  ' + mc.title + '  ' + mc.members.length + ' 条: ' + mc.members.map(function (i) { return trimAt(i); }).join('  |  ')); });
console.log('  多模型共用: ' + V2.multi.map(function (x) { return trimAt(x.i) + '(' + x.models.join('+') + ')'; }).join('  |  '));

/* ============================ (D) 零重排断言 ============================ */

console.log('');
console.log('==================================================================');
console.log('(D) 硬断言：零重排');
console.log('==================================================================');
const ORIG_IDS = ORDER.map(function (o) { return o.identifier; });
let failed = 0;
function assertEq(cond, msg) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg);
  if (!cond) failed++;
}
['v0', 'v1', 'v2'].forEach(function (key) {
  const names = VARIANTS[key];
  assertEq(names.length === TOTAL, key + ' 条目数 = ' + names.length + '（原预设 ' + TOTAL + '），未增删');
  let mismatch = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (entryAt(i).identifier !== ORIG_IDS[i]) mismatch++;
    if (names[i] === undefined) mismatch++;
  }
  assertEq(mismatch === 0, key + ' 每一位的 identifier 未发生位移/交换（错位 ' + mismatch + ' 处）');
  assertEq(ORDER.map(function (o) { return o.identifier; }).join(SEP) === ORIG_IDS.join(SEP), key + ' identifier 序列与原预设逐位一致');
});
assertEq(VARIANTS.v0.every(function (n, i) { return n === nameAt(i); }), 'v0 名字数组逐位等于原预设名字（基线未被污染）');
assertEq(VARIANTS.v1.length === TOTAL && VARIANTS.v2.length === TOTAL, 'v1/v2 名字数组长度 = ' + TOTAL);
[['v0', V0], ['v1', V1], ['v2', V2]].forEach(function (row) {
  assertEq(row[1].assigned === TOTAL, row[0] + ' 解析树把 ' + TOTAL + ' 条全部归类（实际 ' + row[1].assigned + '）');
});
console.log('');
if (failed) {
  console.log('断言失败 ' + failed + ' 项 —— 命名规则影响了排序，必须回炉');
  process.exit(1);
}
console.log('全部通过：三套命名变体的 identifier 序列与原预设完全一致，零重排、零增删。');
