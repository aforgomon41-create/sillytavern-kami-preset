// preset-report.mjs —— 用「内存里迁移后的状态」跑解析器，生成 design/proposals/预设结构解析表.md
//
// 重要：本脚本只调用 migratePreset()（内存态），**不写盘** src/preset.base.json。
//
// 两种输入形态（自动判别）：
//   a) src/preset.base.json 还没迁移 → 直接在内存里迁移它，断言与解析都从这次迁移来；
//   b) 已经迁移过（含 prompt_kami_style_opt / prompt_kami_model_table）→ migratePreset 会短路成
//      「已迁移、零断言」，报告就没法复跑。这时改用 dist/_preset.base.迁移前备份.json 重跑一次迁移，
//      拿到断言与改动清单，再核对「重跑结果 == 盘上的 src/preset.base.json」；
//      **解析仍然用盘上的 base（它是唯一真相）**。
//
// 用法：node test/harness/preset-report.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  migratePreset,
  PRESET_PATH,
  NEW_ID_MODEL,
  NEW_ID_STYLE,
  NEW_NAME_MODEL,
  NEW_NAME_STYLE,
  ANCHOR_DISCLAIMER,
  ANCHOR_WRITING,
  TARGET_MODEL_CARD,
  VAR_RENAMES,
} from './preset-migrate.mjs';
import { parsePreset, ARROW_OPEN, ARROW_CLOSE } from './preset-parse.mjs';

const OUT_PATH = 'design/proposals/预设结构解析表.md';
const NL = String.fromCharCode(10);
const PIPE = String.fromCharCode(124);
const L = [];
const add = (s) => L.push(s === undefined || s === null ? '' : s);
const pct = (x) => (x * 100).toFixed(1) + '%';

function cell(text) {
  let s = text === null || text === undefined ? '-' : String(text);
  s = s.split(NL).join(' ');
  s = s.split(PIPE).join('&#124;');
  return s;
}
function short(text, max) {
  if (text === null || text === undefined) return '-';
  let s = String(text).split(NL).join(' ');
  if (s.length > max) s = s.slice(0, max) + '…';
  return s;
}
function table(headers, rows) {
  add(PIPE + ' ' + headers.join(' ' + PIPE + ' ') + ' ' + PIPE);
  add(PIPE + headers.map(() => '---').join(PIPE) + PIPE);
  for (const r of rows) add(PIPE + ' ' + r.map(cell).join(' ' + PIPE + ' ') + ' ' + PIPE);
}
function yn(b) {
  return b ? '开' : '关';
}
function code(s) {
  return '`' + s + '`';
}

// ---------- 1. 迁移（内存态）+ 解析 ----------
const BACKUP_PATH = 'dist/_preset.base.迁移前备份.json';
const rawText = fs.readFileSync(PRESET_PATH, 'utf8');
const basePreset = JSON.parse(rawText);          // 盘上的 src/preset.base.json（唯一真相，解析用这份）
let mig = migratePreset(basePreset, { rawText: rawText });
let original = basePreset;                       // 「迁移前」的对象（§1/§2 的对照面）
let rederive = null;                             // 从迁移前备份重跑迁移的结果
if (mig.alreadyMigrated) {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.error('src/preset.base.json 已是迁移后的状态，但找不到迁移前备份 ' + BACKUP_PATH + '，无法复跑迁移断言。');
    process.exit(1);
  }
  const bkText = fs.readFileSync(BACKUP_PATH, 'utf8');
  const bk = JSON.parse(bkText);
  const r = migratePreset(bk, { rawText: bkText });
  rederive = {
    ok: r.ok,
    assertions: r.assertions,
    changes: r.changes,
    logs: r.logs,
    bytes: bkText.length,
    // 内存重跑的迁移结果必须与盘上的 base 逐字节一致（比旧版更强的断言）
    match: JSON.stringify(r.preset) === JSON.stringify(basePreset),
  };
  original = bk;
  mig = { ok: r.ok, alreadyMigrated: true, preset: basePreset, changes: r.changes, assertions: r.assertions, logs: r.logs };
}
if (!mig.ok) {
  console.error('迁移断言失败，终止。');
  for (const a of mig.assertions) if (!a.ok) console.error('FAIL ' + a.id + ' :: ' + a.detail);
  process.exit(1);
}
const tree = parsePreset(basePreset);
const S = tree.stats;
const byId = new Map();
for (const p of mig.preset.prompts) byId.set(p.identifier, p);
const origById = new Map();
for (const p of original.prompts) origById.set(p.identifier, p);

// order.enabled 与 prompts.enabled 不一致的条目
const enabledMismatch = [];
for (const o of mig.preset.prompt_order[0].order) {
  const p = byId.get(o.identifier);
  if (p && p.enabled !== undefined && p.enabled !== o.enabled) {
    enabledMismatch.push({ id: o.identifier, name: p.name.trim(), orderEnabled: o.enabled, promptEnabled: p.enabled });
  }
}
// marker 条目画像
const markerProfile = mig.preset.prompts
  .filter((p) => p.marker === true)
  .map((p) => ({
    id: p.identifier,
    name: typeof p.name === 'string' ? p.name.trim() : '',
    hasContentKey: Object.prototype.hasOwnProperty.call(p, 'content'),
    contentLen: typeof p.content === 'string' ? p.content.length : 0,
    enabled: p.enabled,
  }));
const panelOff = tree.contentEntries.filter((e) => e.enabled === false);
const commentedContentNames = tree.commentedContentEntries.map((e) => e.name);
const commentedHeadNames = tree.commentedEntries.filter((e) => e.role2 === 'card-head').map((e) => e.name);
// 「清空变量 / 标签格式」里的 setvar 片段画像（验证「纯数字」闸门确实挡住它们）
function setvarProfile(entryName) {
  const e = tree.entries.find((x) => x.name === entryName);
  const parts = e.content.split('setvar::').slice(1);
  let empty = 0;
  let numeric = 0;
  let other = 0;
  for (const p of parts) {
    const end = p.indexOf('}}');
    const body = end < 0 ? p : p.slice(0, end);
    const sep = body.indexOf('::');
    const v = sep < 0 ? '' : body.slice(sep + 2).trim();
    if (v.length === 0) empty++;
    else if (v.split('').every((ch) => ch >= '0' && ch <= '9')) numeric++;
    else other++;
  }
  return { name: entryName, total: parts.length, empty: empty, numeric: numeric, other: other };
}
const svProfiles = [setvarProfile('🧩 清空变量'), setvarProfile('🧩 标签格式')];
const commentOf = (e) => (e.commentFlat ? short(e.commentFlat, 90) : '（无注释）');

// ---------- 规则 15（模型专属卡片降级 · 收窄版）的核对数据 ----------
const demotions = tree.modelExclusiveDemotions;          // 真正被判掉的卡片
const rescued = tree.modelExclusiveKeptNotSole;          // 名下条目全是模型专属、但**不是**该层唯一卡片 → 规则不动手
const cardScan = tree.cardModelScan;
const scanAllModel = cardScan.filter((c) => c.allModelExclusive);
const scanDemoted = cardScan.filter((c) => c.verdict === 'demoted');
const scanKeptNotSole = cardScan.filter((c) => c.verdict === 'kept-not-sole-card');
const scanKept = cardScan.filter((c) => c.verdict === 'kept');
// 条目 identifier -> 它在「🤖 模型」tab 的哪几张卡片里出现
const modelTabHits = new Map();
for (const c of tree.modelTab.cards) {
  for (const it of c.items) {
    const label = c.emoji + ' ' + c.label;
    const cur = modelTabHits.get(it.identifier);
    if (cur) cur.push(label);
    else modelTabHits.set(it.identifier, [label]);
  }
}
const unreachableIds = new Set(tree.unreachable.map((e) => e.identifier));
const skippedDetail = tree.skippedLayers.map((s) => {
  const items = s.items;
  return {
    name: s.name,
    openIndex: s.openIndex,
    closeIndex: s.closeIndex,
    items: items,
    inModel: items.filter((e) => modelTabHits.has(e.identifier)),
    lost: items.filter((e) => unreachableIds.has(e.identifier)),
    demotedCardNames: demotions.filter((d) => d.layer === s.name).map((d) => d.card),
  };
});
const mysteryLayer = skippedDetail.find((s) => s.name.indexOf('神秘咒语') >= 0) || null;
const taskLayerDetail = skippedDetail.find((s) => s.name.indexOf('任务设置') >= 0) || null;
// 被规则 15 判掉的条目：模型 tab 出现次数（用来还原「规则 15 之前」的镜像/仅模型拆分）
const demotedItemIds = [];
for (const d of demotions) for (const id of d.itemIdentifiers) demotedItemIds.push(id);
const demotedOccurrenceCount = demotedItemIds.reduce((n, id) => n + (modelTabHits.has(id) ? modelTabHits.get(id).length : 0), 0);
const mirrorBefore = S.modelMirrorCount + demotedOccurrenceCount;
const onlyBefore = S.modelTabOccurrences - mirrorBefore;
// 找不到的条目分组：规则 4/8 原有的那批 + 规则 15 新引入的卡片头
const lostHeads = tree.unreachable.filter((e) => e.cardDemoteReason === 'model-exclusive-items');
const lostBeforeRule15 = tree.unreachable.filter((e) => e.cardDemoteReason !== 'model-exclusive-items');
const modelTabSummary = tree.modelTab.cards.map((c) => c.emoji + ' ' + c.label + '=' + c.itemCount + ' 条').join(' / ');
const tabNames = tree.tabs.map((t) => (t.kind === 'model' ? t.displayName : t.name)).join('、');
// 条目 identifier -> 它在某个层级 tab（不是模型 tab）里出现
const inLayerTabIds = new Set();
for (const t of tree.tabs) {
  if (t.kind !== 'layer') continue;
  for (const c of t.cards) for (const it of c.items) inLayerTabIds.add(it.entry ? it.entry.identifier : it.identifier);
  for (const it of t.standaloneItems) inLayerTabIds.add(it.identifier);
  for (const v of t.varEntries) inLayerTabIds.add(v.identifier);
}
const modelMembersWithNativeTab = tree.modelMembers.filter((e) => inLayerTabIds.has(e.identifier));
const modelMembersNativeHidden = tree.modelMembers.filter((e) => !inLayerTabIds.has(e.identifier));
// 被规则 15 判掉的卡片所在层级是否还出 tab（收窄后只有「唯一卡片的层级」会命中，必然不出 tab）
const demotedLayerNames = [];
for (const d of demotions) if (demotedLayerNames.indexOf(d.layer) < 0) demotedLayerNames.push(d.layer);
const layersLosingTab = demotedLayerNames.filter((n) => !tree.tabs.some((t) => t.kind === 'layer' && t.name === n));
const layersKeepingTab = demotedLayerNames.filter((n) => tree.tabs.some((t) => t.kind === 'layer' && t.name === n));
const demotedHeadsInTab = demotions.filter((d) => inLayerTabIds.has(d.headIdentifier));
const entryById = new Map();
for (const e of tree.entries) entryById.set(e.identifier, e);
const demotedItemsInLayerTab = [];
for (const d of demotions) {
  for (const id of d.itemIdentifiers) {
    if (inLayerTabIds.has(id)) demotedItemsInLayerTab.push({ card: d.card, layer: d.layer, identifier: id, entry: entryById.get(id) });
  }
}
// 「规则 15 之前」（= 完全不加这条规则）的几个计数
const contentBefore = S.contentEntryCount - demotedHeadsInTab.length;
const cardHeadBefore = S.cardHeadCount + demotions.length;
const panelBefore = S.panelEntryCount + (demotions.length - demotedHeadsInTab.length);
// 被收窄放过的卡片所在 tab（它照旧是一张正常卡片）
const rescuedLayer = rescued.length ? rescued[0].layer : null;
const rescuedTab = rescuedLayer ? tree.tabs.find((t) => t.kind === 'layer' && t.name === rescuedLayer) || null : null;
const rescuedCard = rescuedTab && rescued.length ? rescuedTab.cards.find((c) => c.name === rescued[0].card) || null : null;
// 「上一版（未收窄）规则 15」会多判掉哪些卡片
const widerRuleDemotions = scanAllModel;

// ---------- 报告正文 ----------
add('# 卡密预设 v0.9 · 预设结构解析表');
add('');
add('> 本文档由 ' + code('test/harness/preset-report.mjs') + ' 自动生成：先在**内存里**跑迁移（' + code('migratePreset') + '），再把迁移后的对象交给**纯函数解析器**（' + code('parsePreset') + '），最后把结果铺成这张表。');
add('> ');
if (rederive) {
  add('> **' + code('src/preset.base.json') + ' 已经是迁移后的状态**（' + basePreset.prompts.length + ' 条 prompts / order ' + basePreset.prompt_order[0].order.length + ' 项）。所以迁移断言是从**迁移前备份** ' + code(BACKUP_PATH) + '（' + rederive.bytes + ' 字符）在内存里重跑出来的，并核对「重跑结果 == 盘上的 base」：' + (rederive.match ? '**逐字节一致**' : '**不一致（见第 2 节）**') + '。解析用的始终是盘上的 base。');
} else {
  add('> **本轮没有写盘。** ' + code('src/preset.base.json') + ' 保持原样（' + code('--check') + ' 模式）；要落地需要用户点头后跑 ' + code('node test/harness/preset-migrate.mjs --write') + '。');
}
add('');
add('| 项目 | 值 |');
add('| --- | --- |');
add('| 预设文件 | ' + code(PRESET_PATH) + '（' + rawText.length + ' 字符） |');
add('| 预设内条目总数 | prompts ' + original.prompts.length + ' 条 → 迁移后 ' + S.promptCount + ' 条 |');
add('| order 数组（' + code('prompt_order[0].character_id=' + tree.meta.characterId) + '） | ' + S.orderLength + ' 项（迁移后） |');
add('| 面板主键 | 完整 ' + code('identifier') + '（前 8 位有 102 条重名成 ' + code('prompt_1') + '，所以短号取**后 6 位**） |');
add('| 解析入口 | ' + code('test/harness/preset-parse.mjs') + ' → ' + code('parsePreset(preset)') + '（零 import、无正则，可直接给面板用） |');
add('');

add('## 0. 一句话结论');
add('');
add('迁移 4 处全部通过断言；解析出 **' + S.layerTabCount + ' 个层级 tab + 1 个全局「🤖 模型」tab**、共 **' + S.tabCount + ' 个 tab**、**' + S.cardCount + ' 张层级卡片 + ' + S.modelCardCount + ' 张模型卡片**、**' + S.contentEntryCount + ' 条可开关内容条目**。');
add('本轮按用户裁定把 **规则 15（模型专属卡片降级）收窄**：现在**只有「某张卡片是它所在层级里唯一的卡片」且名下条目全是模型专属条目**时才降级（旧版不看"唯一卡片"）。全预设 ' + cardScan.length + ' 张层级卡片里：**' + demotions.length + ' 张**命中（' + demotions.map((d) => code(d.card) + '（在 ' + d.layer + ' 层级）').join('、') + '）→ ' + layersLosingTab.map((n) => code(n)).join('、') + ' 变成「无卡片无变量」→ 按规则 8 **不出 tab**；另有 **' + scanKeptNotSole.length + ' 张**名下条目也全是模型专属，但**不是该层里唯一的卡片**（' + scanKeptNotSole.map((c) => code(c.card) + '（在 ' + c.layer + ' 层级，该层共 ' + c.layerCardCount + ' 张卡片）').join('、') + '）→ 按收窄后的规则**保持卡片身份**。**tab 数 7（层级 6 + 模型 1）**（见第 11 节）。');
add('**没有任何条目被删掉**：被降级的卡片名下那 ' + demotedItemIds.length + ' 条模型专属条目照旧进「🤖 模型」tab（逐条核对见第 11.5 / 11.6 节）；被收窄放过的 ' + code(rescued.length ? rescued[0].card : '-') + ' 名下 ' + rescued.reduce((n, r) => n + r.itemCount, 0) + ' 条照旧是层级卡片里的条目（同时也镜像进模型 tab）。');
add('面板上找不到的条目：**' + S.unreachableCount + ' 条** = 规则 4/8 原有的 ' + lostBeforeRule15.length + ' 条（全部来自 ' + code('📌 任务设置') + '，用户已确认接受）+ **规则 15 仍会引入的 ' + lostHeads.length + ' 条**（' + code(lostHeads.length ? lostHeads[0].name : '-') + '：它所在的 ' + code(layersLosingTab[0] || '-') + ' 层级里**只有它这一张卡片**，所以收窄后照旧被判掉，而它的 content 只有一条 ' + code('{{// }}') + ' 注释）→ **没有回到 4 条**，见第 9 节与第 11.7 节。');
add('');

// ---------- 1. 迁移改动清单 ----------
add('## 1. 迁移改动清单（共 4 处）');
add('');
add('### A1 · 新增「✒️ [文风优化] 任选」卡片头（名字已定稿）');
add('');
add('| 项 | 内容 |');
add('| --- | --- |');
add('| 位置 | order 第 77 位：紧跟 ' + code(ANCHOR_WRITING) + ' 之后、' + code('💀 反死人文风(Gemini可不开)') + ' 之前 |');
add('| identifier | ' + code(NEW_ID_STYLE) + '（自造，已断言在 prompts 里唯一） |');
add('| 原名 | （无，新增） |');
add('| 新名 | ' + code(cell(NEW_NAME_STYLE)) + ' ← **用户已定稿**：emoji ✒️ = U+2712 + 变体选择符 U+FE0F（与预设里已有的 🖊️ / 🗣️ / ⚔️ 同一套写法）+ 人类可读名「文风优化」+ 后缀「 任选」 |');
add('| 为什么不用 🪶 | U+1FAB6 是 Emoji 13.0 才加入的字符，部分设备会显示成方框；已改成 U+2712 + U+FE0F |');
add('| 占用检查 | ' + mig.assertions.find((a) => a.id === 'a1-emoji-unused-in-names').detail + ' |');
add('| content 变化 | 新增，content = 空字符串 ' + code("''") + ' |');
add('| enabled | true |');
add('| 字段集合 | content,enabled,forbid_overrides,identifier,injection_depth,injection_order,injection_position,marker,name,role,system_prompt（**照抄邻居** ' + code(ANCHOR_WRITING) + '，未发明新字段） |');
add('| 效果 | 它成为 ' + code('📝 写作指导') + ' 层级里的第一张卡片（多选），吃掉紧随其后的 3 条：💀 反死人文风(Gemini可不开)、🔄 写作节奏优化、🔞 NSFW基础 |');
add('');
add('### A2 · 新增「📋 支持模型列表 | model」模型登记表条目（名字已定稿）');
add('');
add('| 项 | 内容 |');
add('| --- | --- |');
add('| 位置 | order 第 1 位：紧跟 ' + code(ANCHOR_DISCLAIMER) + ' 之后，成为 order 里的第 2 条 |');
add('| identifier | ' + code(NEW_ID_MODEL) + '（自造，已断言在 prompts 里唯一） |');
add('| 原名 | （无，新增） |');
add('| 新名 | ' + code(cell(NEW_NAME_MODEL)) + ' ← **用户已定稿**：前缀 emoji 📋（U+1F4CB）+ 人类可读名「支持模型列表」+ 已确认后缀 ' + code(cell(' | model')) + ' |');
add('| content 变化 | 新增，content = 从 ' + code(TARGET_MODEL_CARD) + ' 里**逐字搬来**的那段 emoji 表 |');
add('| enabled | true |');
add('| 字段集合 | content,enabled,forbid_overrides,identifier,injection_depth,injection_order,injection_position,marker,name,role,system_prompt（**照抄邻居** ' + code(ANCHOR_DISCLAIMER) + '） |');
add('');
add('搬过来的原文（含 ' + code('{{//') + ' 与 ' + code('}}') + '、含换行，一字未改）：');
add('');
add('```');
add(byId.get(NEW_ID_MODEL).content);
add('```');
add('');

add('### A3 · 从「🤖 [模型类型] 选一」里删掉那张 emoji 表');
add('');
add('| 项 | 内容 |');
add('| --- | --- |');
add('| 位置 | order 第 11 位：' + code(TARGET_MODEL_CARD) + ' |');
add('| identifier | ' + code('prompt_1789213815769_ks7pgcc') + '（既有条目，未改） |');
add('| 原名 / 新名 | ' + code(TARGET_MODEL_CARD) + ' → **同名，一个字都没改** |');
add('| content 变化 | 删掉第二个 ' + code('{{// … }}') + ' 整块（那把 emoji 表），只保留第一个 ' + code('{{// … }}') + ' 块 |');
add('| 其他字段 | 一个字符都没动（它的字段集合比邻居多 4 个：injection_trigger,attach_role,attach_index,attach_side，原样保留） |');
add('');
add('保留后的 content：');
add('');
add('```');
add(byId.get('prompt_1789213815769_ks7pgcc').content);
add('```');
add('');
add('### A4 · 三条变量条目改名（只在名字末尾加 ' + code(' | var') + '）');
add('');
table(
  ['变量条目', 'identifier', '原名', '新名', 'content 变化'],
  VAR_RENAMES.map((r) => {
    const t = mig.preset.prompts.find((p) => p.name.trim() === r.to);
    return [cell(r.to), t.identifier, r.from, cell(r.to), '未改动'];
  })
);
add('');
add('> 改名后 ' + code('🧩 设置变量') + ' 层级里仍是 3 条变量条目、5 个变量（见第 5 节）。');
add('');

// ---------- 2. 断言结果 ----------
add('## 2. 断言结果');
add('');
add('### 2.1 两条硬断言（任务书点名要求）');
add('');
const p1 = mig.assertions.find((a) => a.id === 'no-pipe-in-names-before');
const p3 = mig.assertions.find((a) => a.id === 'order-sequence-preserved');
const p7 = mig.assertions.find((a) => a.id === 'post-pipe-only-convention');
add('**断言一 · 竖线撞车检查：' + (p1.ok ? '通过（0 命中）' : '失败') + '**');
add('');
add('- 检查范围：原文件全部 ' + original.prompts.length + ' 条 ' + code('prompts') + ' 的 ' + code('name') + '（不是只看 order 里的 161 条）。');
add('- 结果：' + p1.detail);
add('- 迁移后复审：' + p7.detail);
add('');
add('**断言二 · 顺序一致性检查：' + (p3.ok ? '通过' : '失败') + '**');
add('');
add('- 结果：' + p3.detail);
add('- 插入位校验：' + mig.assertions.find((a) => a.id === 'order-insert-positions').detail);
add('- 补充：' + mig.assertions.find((a) => a.id === 'other-entries-untouched').detail);
add('');
add('### 2.2 全部断言明细');
add('');
table(['#', '断言 id', '结果', '说明'], mig.assertions.map((a, i) => [i + 1, a.id, a.ok ? 'PASS' : 'FAIL', a.detail]));
add('');

// ---------- 3. 解析树 ----------
add('## 3. 解析树（每个 tab → 每张卡片 → 条目数）');
add('');
add('面板一共 **' + S.tabCount + ' 个 tab**：' + S.layerTabCount + ' 个来自「有卡片或有变量」的层级 + 1 个全局「🤖 模型」tab。');
add('');
add('### 3.0 tab 总览');
add('');
table(
  ['#', 'tab', '来源层级', '卡片数', '卡片内条目', '独立条目', '变量条目', '层级 order 区间'],
  tree.tabs.map((t, i) => {
    if (t.kind === 'model') {
      return [i + 1, '🤖 模型', '（全局特殊 tab，跨所有层级）', t.cards.length, t.cards.reduce((n, c) => n + c.itemCount, 0), 0, 0, '-'];
    }
    const cardItems = t.cards.reduce((n, c) => n + c.itemCount, 0);
    return [i + 1, t.name, t.name + ARROW_OPEN + ' … ' + t.name + ARROW_CLOSE, t.cards.length, cardItems, t.standaloneItems.length, t.varEntries.length, t.openIndex + ' … ' + t.closeIndex];
  })
);
add('');
for (let ti = 0; ti < tree.tabs.length; ti++) {
  const t = tree.tabs[ti];
  if (t.kind === 'model') {
    add('### 3.' + (ti + 1) + ' 🤖 模型（全局特殊 tab）');
    add('');
    add('详细清单见第 4 节。此处只记规模：' + t.cards.length + ' 张卡片（一个模型一张）/ ' + t.cards.reduce((n, c) => n + c.itemCount, 0) + ' 条条目（含镜像）。');
    add('');
    continue;
  }
  add('### 3.' + (ti + 1) + ' ' + t.name);
  add('');
  add('- 层级：' + code(t.name + ARROW_OPEN) + ' … ' + code(t.name + ARROW_CLOSE) + '（order ' + t.openIndex + ' … ' + t.closeIndex + '，两条层级条目本身**锁定为开、不出现在面板**）');
  add('- 规模：卡片 ' + t.cards.length + ' 张 ｜ 卡片内条目 ' + t.cards.reduce((n, c) => n + c.itemCount, 0) + ' 条 ｜ 独立条目 ' + t.standaloneItems.length + ' 条 ｜ 变量条目 ' + t.varEntries.length + ' 条');
  if (t.standaloneItems.length > 0) {
    add('');
    add('**独立条目（不属任何卡片）**');
    add('');
    table(['#', '条目名', 'identifier', '当前', '模型归属', '说明（第一个 {{// }}）'], t.standaloneItems.map((e, i) => [i + 1, e.name, e.identifier, yn(e.enabled), e.models.length ? e.models.join(' ') : '-', commentOf(e)]));
  }
  for (const c of t.cards) {
    add('');
    add('**卡片：' + c.name + '（' + c.mode + '）** ｜ 卡片头 identifier ' + code(c.headIdentifier) + ' ｜ 当前 ' + yn(c.headEnabled) + ' ｜ 条目 **' + c.itemCount + '** 条');
    add('');
    const MAX = 5;
    const rows = [];
    const items = c.items;
    const shown = items.length > MAX + 1 ? items.slice(0, MAX) : items;
    shown.forEach((e, i) => rows.push([i + 1, e.name, e.identifier, yn(e.enabled), e.models.length ? e.models.join(' ') : '-', commentOf(e)]));
    if (shown.length < items.length) {
      const rest = items.slice(shown.length);
      rows.push(['…', '其余 ' + rest.length + ' 条：' + rest.map((e) => e.name).join(' / '), '-', '-', '-', '-']);
    }
    rows.push(['合计', '共 ' + c.itemCount + ' 条', '-', '开 ' + items.filter((e) => e.enabled).length + ' / 关 ' + items.filter((e) => !e.enabled).length, '-', '-']);
    table(['#', '条目名', 'identifier', '当前', '模型归属', '说明（第一个 {{// }}）'], rows);
  }
  add('');
}

add('### 3.' + (tree.tabs.length + 1) + ' 不出 tab 的层级（显式列出）');
add('');
function skipReasonOf(r) {
  if (r.kind === 'wrapper') return '是结构包裹区（名字里同一个箭头符号出现 2 次），整段算结构区，不给用户入口';
  const d = demotions.filter((x) => x.layer === r.name);
  if (d.length > 0) {
    return '层级里**唯一的卡片** ' + code(d[0].card) + ' 被**规则 15（收窄版）** 判掉（它是本层唯一的卡片，且名下 ' + d[0].itemCount + ' 条条目**全是模型专属条目**）→ 变成「无卡片无变量」→ 按规则 8 不出 tab；那 ' + d[0].itemCount + ' 条仍在「🤖 模型」tab 里（见第 11.5 节）';
  }
  return '层级内既没有卡片、也没有变量条目 → 按规则 8 不出 tab（这层的条目会掉出面板，见第 9 节）';
}
table(
  ['层级', 'order 区间', '为什么不出 tab'],
  tree.regions
    .filter((r) => (r.kind === 'layer' && !r.hasTab) || r.kind === 'wrapper')
    .map((r) => [r.name, r.openIndex + ' … ' + r.closeIndex, skipReasonOf(r)])
);
add('');
for (const s of skippedDetail) {
  add(
    '- ' + code(s.name) + ' 层级：order ' + s.openIndex + ' … ' + s.closeIndex + '，区间内共 ' + s.items.length + ' 条普通条目（不含两条锁定层级条目）→ 在「🤖 模型」tab 里能找到 **' + s.inModel.length + ' 条**，掉出面板 **' + s.lost.length + ' 条**' +
      (s.demotedCardNames.length > 0 ? '（规则 15 判掉的卡片：' + s.demotedCardNames.map((n) => code(n)).join('、') + '）' : '') +
      '。'
  );
}
for (const w of tree.wrappers) {
  add('- ' + code(ARROW_OPEN + w.name + ARROW_OPEN) + ' … ' + code(ARROW_CLOSE + w.name + ARROW_CLOSE) + '：结构包裹区（' + w.entries.length + ' 条）。');
}
add('');

// ---------- 4. 模型 tab ----------
add('## 4. 「🤖 模型」tab（全局特殊 tab）');
add('');
add('模型类别不硬编码，全部从登记表 ' + code(NEW_NAME_MODEL) + ' 的 content 里解析出来（每行以**全角冒号** ' + code('：') + ' 分隔）：');
add('');
table(['emoji', '解析出的模型名（逐字，规则 6：冒号后那部分）', '来自哪条登记表'], tree.modelTable.map((m) => [m.emoji, m.label, m.fromName]));
add('');
add('> 模型名按规则**逐字保留**（含「表示…系列模型」字样）。面板如果想显示成「DeepSeek」需要用户再拍一次板，见第 10 节。');
add('');
add('### 4.1 每个模型的条目清单');
add('');
for (const c of tree.modelTab.cards) {
  add('**' + c.emoji + ' ' + c.label + '**（' + c.itemCount + ' 条）');
  add('');
  table(
    ['#', '条目名', 'identifier', '当前', '原本在哪张卡片', '镜像/独有'],
    c.items.map((it, i) => [
      i + 1,
      it.name,
      it.identifier,
      yn(it.entry.enabled),
      it.originCard ? it.originCard + '（在 ' + it.originLayer + ' 层级）' : (it.originCardDemoted ? '原卡片 ' + it.originCardDemoted + '（被规则 15 判掉）→ 现在是 ' + it.originLayer + ' 层级的裸放条目' : '原本不在任何卡片里（只在 ' + it.originLayer + ' 层级裸放）'),
      it.isMirror ? '镜像' : '仅模型 tab',
    ])
  );
  add('');
}
add('### 4.2 多模型共用条目（显式列出）');
add('');
const multi = tree.modelMembers.filter((e) => e.models.length > 1);
table(
  ['条目名', 'identifier', '归属集合', '原本在哪张卡片', '当前'],
  multi.map((e) => [e.name, e.identifier, e.models.join(' + '), e.card ? e.card.name : (e.demotedFromCard ? '原卡片 ' + e.demotedFromCard + '（被规则 15 判掉）' : '（不在卡片里）'), yn(e.enabled)])
);
add('');
add('- 共 **' + multi.length + ' 条**多模型共用条目，全部同时属于 🐋 和 💤。');
add('- 它们会在「🤖 模型」tab 里**各出现两次**（🐋 卡片一次、💤 卡片一次）。');
add('- 模型闸门（规则 11）：面板拿 ' + code('models') + ' 数组做判断；多归属条目「任一命中即开放」还是「必须全部命中」，见第 10 节待拍板。');
add('');
add('### 4.3 镜像关系汇总');
add('');
table(
  ['条目名', '归属', '原位置（层级 / 卡片）', '模型 tab 里的身份', '原卡片里是否标注模型专属'],
  tree.modelMembers.map((e) => [
    e.name,
    e.models.join(' '),
    (e.region ? e.region.name + ' 层级' : '-') + ' / ' + (e.card ? e.card.name : (e.demotedFromCard ? '（原卡片 ' + e.demotedFromCard + ' 已被规则 15 判掉，现在是层级里的裸放条目）' : '（无卡片）')),
    e.card ? '镜像（isMirror=true）' : (e.demotedFromCard ? '仅存在于模型 tab（originCard=null，原卡片被规则 15 判掉）' : '仅存在于模型 tab（originCard=null）'),
    e.card ? '是（modelExclusive=true）' : '无原卡片可标注',
  ])
);
add('');
add('- 唯一模型条目 **' + S.modelMemberEntryCount + ' 条**；出现次数 = 原生位置 ' + S.modelMemberEntryCount + ' 次 + 模型 tab ' + S.modelTabOccurrences + ' 次 = **' + (S.modelMemberEntryCount + S.modelTabOccurrences) + ' 次**（含镜像）。');
add('- 其中 **' + S.modelMirrorCount + ' 次**是「还挂在层级卡片里的条目镜像到模型 tab」（' + code('isMirror=true') + '），**' + S.modelOnlyOccurrences + ' 次**是「已经没有原卡片、只出现在模型 tab」（' + code('originCard=null') + '）。');
add('- 规则 15 的直接后果：' + demotions.map((d) => code(d.card)).join('、') + ' 这 ' + demotions.length + ' 张卡片被判掉，名下共 ' + demotedItemIds.length + ' 条的 ' + code('originCard') + ' 从卡片名变成 ' + code('null') + ' → **镜像 ' + mirrorBefore + ' 次 → ' + S.modelMirrorCount + ' 次**，**仅模型 tab ' + onlyBefore + ' 次 → ' + S.modelOnlyOccurrences + ' 次**（模型 tab 内的总出现次数 ' + S.modelTabOccurrences + ' 次不变）。');
add('- ' + code('🐱 Gemini随机数') + ' / ' + code('🐱 Gemini抗输入审') + ' 这两条本来就在 ' + code('🪓 神秘咒语') + ' 层级里裸放（一直不在任何卡片内），与本轮改动无关。');
add('');

// ---------- 5. 变量 tab ----------
add('## 5. 「🧩 设置变量」tab');
add('');
add('三条变量条目（名字末尾 ' + code(' | var') + '），共解析出 **' + S.varCount + ' 个变量**，合并成 **' + (S.rangeCardCount + S.numberCardCount) + ' 张变量卡片**。');
add('');
add('变量名与当前值只从「条目自己的 content」里读，且**只保留值为纯数字的** ' + code('setvar::名::值') + ' 片段（值为空的一律不算）。');
add('');
const varRows = [];
for (const vc of tree.tabs.find((t) => t.name === '🧩 设置变量').varCards) {
  const allVars = vc.allVars;
  const numVars = vc.numericVars;
  for (const c of vc.cards) {
    if (c.type === 'range') {
      varRows.push([vc.entry.name, c.min.name, c.min.value, '范围卡（' + (c.swapped ? '当前 min > max，面板会自动交换' : '大小正常') + '）', c.base + ' 这一对 _min/_max 合并']);
      varRows.push([vc.entry.name, c.max.name, c.max.value, '范围卡（同一个 base=' + c.base + '）', '与上一行同属一张卡的两个数字框']);
    } else {
      varRows.push([vc.entry.name, c.name, c.value, '数字卡（单个变量）', '没有配对的 _min/_max，单独一张']);
    }
  }
}
table(['变量条目', '变量名', '当前值', '判成什么卡片', '依据'], varRows);
add('');
add('**配对明细**');
add('');
add('- ' + code('🧩 正文字数 | var') + ' → ' + code('content_word_count_min=1500') + ' + ' + code('content_word_count_max=3000') + ' → 去掉后缀后同名（' + code('content_word_count') + '）→ **1 张范围卡**（2 个数字框）。');
add('- ' + code('🧩 插图数量 | var') + ' → ' + code('image_count_min=4') + ' + ' + code('image_count_max=8') + ' → 去掉后缀后同名（' + code('image_count') + '）→ **1 张范围卡**（2 个数字框）。');
add('- ' + code('🧩 推理预算 | var') + ' → 只有 ' + code('cot_budget=6000') + '，没有 _min/_max 配对 → **1 张数字卡**（1 个数字框）。');
add('- 合计：**2 组被判成范围卡片**（正文字数、插图数量），1 张数字卡片（推理预算），共 5 个变量。');
add('');
const allSetvars = tree.tabs.find((t) => t.name === '🧩 设置变量').varCards.map((v) => v).map((v) => v.allVars.length);
add('**被「纯数字」这道闸挡掉的片段**（这条规则很关键，实测数据如下）：');
add('');
table(
  ['条目（没有 ' + cell(' | var') + ' 后缀）', 'setvar 片段数', '值为空', '纯数字', '非数字（标签/文本）'],
  svProfiles.map((p) => [p.name, p.total, p.empty, p.numeric, p.other])
);
add('');
add('- 这两条是「开关型」条目：' + svProfiles[0].name + ' 的 ' + svProfiles[0].total + ' 处 setvar 全部用来**清空**变量，值是空串；' + svProfiles[1].name + ' 的值是 ' + code('<think>') + ' 这类标签文本。它们本来就没有 ' + code(' | var') + ' 后缀、不会被当变量，即便误读也会被「值必须纯数字」再挡一道（实测纯数字 ' + (svProfiles[0].numeric + svProfiles[1].numeric) + ' 处）。');
add('');

// ---------- 6. 结构区 ----------
add('## 6. 结构区清单');
add('');
add('结构区 = 面板上不出现、只统计条数的部分。本预设结构区共 **' + (S.structureCount + S.wrapperPartCount) + ' 条**：不在任何层级内且不是 marker 的裸条目 ' + S.structureCount + ' 条 + 两个包裹区 ' + S.wrapperPartCount + ' 条。');
add('');
add('### 6.1 不在任何层级内的裸条目（' + S.structureCount + ' 条）');
add('');
table(['#', 'order', '条目名', 'identifier', '当前', 'content 长度', '说明（截断显示，完整见 content）'], tree.structure.items.map((e, i) => [i + 1, e.index, e.name, e.identifier, yn(e.enabled), e.contentLength, commentOf(e)]));
add('');
add('### 6.2 结构包裹区（' + tree.wrappers.length + ' 段 / ' + S.wrapperPartCount + ' 条）');
add('');
for (const w of tree.wrappers) {
  add('**' + w.name + '**：' + code(ARROW_OPEN + w.name + ARROW_OPEN) + ' … ' + code(ARROW_CLOSE + w.name + ARROW_CLOSE) + '，order ' + w.openIndex + ' … ' + w.closeIndex + '，共 ' + w.entries.length + ' 条：');
  add('');
  for (const e of w.entries) add('- ' + e.name + '（' + (e.marker ? 'marker:true' : '普通条目') + '，' + yn(e.enabled) + '）');
  add('');
}
add('### 6.3 系统 marker 条目（' + markerProfile.length + ' 条，附带说明）');
add('');
add('这 ' + markerProfile.length + ' 条是 SillyTavern 的系统占位（' + code('marker: true') + '）。其中 9 条落在包裹区内、已计入 6.2；剩下 2 条 ' + code('Agent System Prompt') + ' / ' + code('Agent Results') + ' 不在任何区间内，按规则 3「是 marker 的条目不算结构区」单独列出——它们本来也没有正文内容。');
add('');
table(['条目名', 'identifier', 'enabled', '有 content 字段吗', 'content 长度'], markerProfile.map((m) => [m.name, m.id, yn(m.enabled), m.hasContentKey ? '有' : '没有', m.contentLen]));
add('');

// ---------- 7. 锁定条目 ----------
add('## 7. 锁定条目清单（层级条目：锁定为开、不可关、不出现在面板）');
add('');
add('共 **' + S.lockedCount + ' 条**层级条目（8 个层级 × 开/闭各 1 条）。解析器**绝不修改** ' + code('enabled') + '，只报告。');
add('');
table(['#', 'order', '层级', '开/闭', '条目名', 'identifier', '短号（后 6 位）', '当前 enabled'], tree.locked.map((x, i) => [i + 1, x.index, x.layerName, x.which, x.name, x.identifier, x.shortId, yn(x.enabled)]));
add('');
if (S.lockedDisabledCount === 0) {
  add('**没有一条层级条目是关掉的**（' + code('enabled: false') + ' 命中 0 条）——所以面板不需要显示「层级被关掉」的告警行。');
} else {
  add('**⚠️ 高亮：有 ' + S.lockedDisabledCount + ' 条层级条目当前是关的**，面板需要显示提示行（但绝不自动改）：');
  add('');
  table(['条目名', 'identifier', '当前 enabled'], tree.lockedDisabled.map((x) => [x.name, x.identifier, yn(x.enabled)]));
}
add('');

// ---------- 8. 统计 ----------
add('## 8. 统计');
add('');
add('| 指标 | 数值 | 口径 |');
add('| --- | --- | --- |');
add('| tab 数 | **' + S.tabCount + '**（层级 tab ' + S.layerTabCount + ' + 全局「🤖 模型」tab 1）｜完全不加规则 15 时是 **' + (S.tabCount + 1) + '** | 规则 8 + 规则 9（叠加规则 15 收窄版） |');
add('| 卡片数 | **' + (S.cardCount + S.modelCardCount) + '**（层级卡片 ' + S.cardCount + ' + 模型卡片 ' + S.modelCardCount + '）｜完全不加规则 15 时层级卡片是 ' + (S.cardCount + S.modelExclusiveCardCount) + ' 张 | 规则 4 / 规则 9（叠加规则 15） |');
add('| 零条目卡片降级 | ' + S.emptyCardDemoteCount + ' 张（没有卡片头因为「零条目」被降级） | 规则 4 的「零条目的卡片不算卡片」（原有） |');
add('| 模型专属卡片降级 | **' + S.modelExclusiveCardDemoteCount + ' 张卡片头**（' + S.modelExclusiveCardCount + ' 张卡片 / 名下 ' + S.modelExclusiveCardItemCount + ' 条条目） | **规则 15（收窄版）**，见第 11 节 |');
add('| ↳ 被收窄放过的卡片 | **' + S.modelExclusiveKeptNotSoleCount + ' 张**：' + (rescued.length ? code(rescued[0].card) + '（在 ' + code(rescued[0].layer) + ' 层级，该层共 ' + rescued[0].layerCardCount + ' 张卡片）' : '（无）') + ' —— 名下条目也全是模型专属，但**不是该层唯一的卡片** → 保持卡片身份 | 规则 15（收窄版）新增的第二道条件 |');
add('| 可开关条目数 | **' + S.contentEntryCount + '** 条（去重）｜完全不加规则 15 时是 ' + contentBefore + ' 条 | 出现在 tab 里、且是可开关的内容条目（含变量条目 3）|');
add('| ↳ 其中的降级卡片头 | ' + demotedHeadsInTab.length + ' 条（' + (demotedHeadsInTab.length ? demotedHeadsInTab.map((d) => code(d.headName)).join('、') : '（无）') + '）：收窄后不再出现「被降级的卡片头又落在某个层级 tab 里」这种情况 | 规则 15（收窄版） |');
add('| 卡片头 | ' + S.cardHeadCount + ' 条｜完全不加规则 15 时是 ' + cardHeadBefore + ' 条（少了 ' + demotions.length + ' 张被降级的卡片头） | 在面板上显示为卡片标题，不算「可开关条目」 |');
add('| 面板条目合计 | ' + S.panelEntryCount + ' 条（=' + S.contentEntryCount + ' + ' + S.cardHeadCount + '）｜完全不加规则 15 时是 ' + panelBefore + ' 条 | 能在面板上找到的条目（去重） |');
add('| 模型条目数 | 唯一 **' + S.modelMemberEntryCount + '** 条；模型 tab 内出现 **' + S.modelTabOccurrences + '** 次；连同各自的原生位置合计 **' + (S.modelMemberEntryCount + S.modelTabOccurrences) + '** 次（含镜像） | 规则 7 / 10（规则 15 不改这些数字） |');
add('| ↳ 模型 tab 内出现 | ' + S.modelTabOccurrences + ' 次（其中镜像 ' + S.modelMirrorCount + ' 次、仅模型 tab ' + S.modelOnlyOccurrences + ' 次）｜完全不加规则 15 时是镜像 ' + mirrorBefore + ' / 仅模型 ' + onlyBefore + ' | 规则 9 / 10（叠加规则 15） |');
add('| ↳ 模型 tab 里每张卡片 | ' + modelTabSummary + ' | 规则 9（规则 15 前后都是这些数字） |');
add('| ↳ 多模型共用 | ' + multi.length + ' 条 | 规则 7 |');
add('| 变量 | 3 条变量条目 → ' + S.varCount + ' 个变量 → ' + S.rangeCardCount + ' 张范围卡 + ' + S.numberCardCount + ' 张数字卡 | 规则 5 |');
add('| 结构区 | ' + S.structureCount + ' 条裸条目 + ' + S.wrapperPartCount + ' 条包裹区 = **' + (S.structureCount + S.wrapperPartCount) + ' 条** | 规则 3 |');
add('| 系统 marker | ' + S.markerCount + ' 条（包裹区外的）+ 9 条包裹区内的 | 规则 3 |');
add('| 锁定层级条目 | ' + S.lockedCount + ' 条（其中关着的 ' + S.lockedDisabledCount + ' 条） | 规则 12 |');
add('| 注释覆盖率 | 面板条目 ' + S.panelEntryCount + ' 条中 ' + S.commentedCount + ' 条有注释 = **' + pct(S.commentCoverage) + '**；只算可开关内容条目则 ' + S.commentedContentCount + '/' + S.contentEntryCount + ' = **' + pct(S.commentedContentCount / S.contentEntryCount) + '** | 规则 13（注释缺失不是错误） |');
add('| 面板里当前「关」着的可开关条目 | ' + panelOff.length + ' / ' + S.contentEntryCount + ' 条 | 只统计，不修改（规则 14） |');
add('| 面板上找不到的条目 | **' + S.unreachableCount + ' 条** | 见第 9 节 |');
add('');
add('> 注释覆盖率的两个数字与「完全不加规则 15」相比只差一处（面板 ' + panelBefore + ' → ' + S.panelEntryCount + '，有注释 ' + (S.commentedCount + 1) + ' → ' + S.commentedCount + '）：规则 15 让面板少了 1 条**带注释的卡片头**（' + code(lostHeads.length ? lostHeads[0].name : '-') + ' 脱离面板）、分母同时少 1。**没有任何条目的注释被改动或删除。**（收窄只影响另外那一张卡片：' + code(rescued.length ? rescued[0].card : '-') + ' 的 2 条条目身份不变，所以它不再影响覆盖率。）');
add('');
add('**有注释的条目（共 ' + S.commentedCount + ' 条 = 内容条目 ' + S.commentedContentCount + ' 条 + 卡片头 ' + commentedHeadNames.length + ' 条）**');
add('');
add('- 内容条目（' + S.commentedContentCount + ' 条）：' + (commentedContentNames.length ? commentedContentNames.join('、') : '（无）'));
add('- 卡片头（' + commentedHeadNames.length + ' 条）：' + (commentedHeadNames.length ? commentedHeadNames.join('、') : '（无）'));
add('- 其余条目内容里**没有** ' + code('{{// }}') + ' 注释 —— 按规则 13，这不是错误。');
add('');

// ---------- 9. 找不到的条目 ----------
add('## 9. 报告正文里必须回答的问题：有没有条目在面板上找不到？');
add('');
add('问题：**按这套规则解析这份预设，有没有任何一条真实内容会在面板上找不到（既不在任何 tab 里、也不是结构区/锁定条目）？**');
add('');
add('答案：**有，' + S.unreachableCount + ' 条。** 分两组：');
add('');
add('**第一组（规则 4/8 原有，' + lostBeforeRule15.length + ' 条）**：全部来自 ' + code('📌 任务设置') + ' 层级（order ' + taskLayerDetail.openIndex + ' … ' + taskLayerDetail.closeIndex + '，' + lostBeforeRule15.length + ' 条内容条目在 order ' + lostBeforeRule15.map((e) => e.index).join('、') + '）：层级里既没有 ' + code(' 选一') + ' / ' + code(' 任选') + ' 卡片、也没有 ' + code(' | var') + ' 变量条目，按规则 8「有卡片或有变量才出 tab」它不出 tab；而这 ' + lostBeforeRule15.length + ' 条确实在层级内（所以不算结构区）、名字里没有模型 emoji（所以不进「🤖 模型」tab）、也不是 marker。**这是上一轮就已存在、用户已确认接受的行为。**');
add('');
add('**第二组（规则 15 收窄后仍存在，' + lostHeads.length + ' 条）**：' + code(lostHeads.length ? lostHeads[0].name : '-') + ' —— 它是 ' + code(layersLosingTab[0] || '-') + ' 层级里那张被规则 15 判掉的卡片的**卡片头**。**收窄没有让它回到 4 条**：因为那张卡片是 ' + code(layersLosingTab[0] || '-') + ' 层级里**唯一的卡片**（该层共 1 张），收窄后的规则照样命中；卡片被判掉后它降级成普通条目，而该层级又不出 tab，于是失去面板入口。它的 content 只有一条 ' + code('{{// }}') + ' 注释（' + (lostHeads.length ? lostHeads[0].contentLength : 0) + ' 字符）' + (lostHeads.length && lostHeads[0].commentFlat ? '：' + code(short(lostHeads[0].commentFlat, 120)) : '') + '，没有任何正文/指令文本。**这一条仍需用户单独拍板**（见第 10 节第 12 条与第 11.7 节）。');
add('');
table(['#', 'order', '条目名', 'identifier', '短号', '当前 enabled', 'content 长度', '所属', '说明（第一个 {{// }}）'], tree.unreachable.map((e, i) => [i + 1, e.index, e.name, e.identifier, e.shortId, yn(e.enabled), e.contentLength, e.cardDemoteReason === 'model-exclusive-items' ? '规则 15 降级的卡片头' : (e.region && e.region.kind === 'layer' ? e.region.name + ' 层级' : '-'), commentOf(e)]));
add('');
add('这 ' + tree.unreachable.length + ' 条里：' + lostBeforeRule15.length + ' 条是**实打实有正文的条目**（content 长度见上表，全部来自 ' + code('📌 任务设置') + '，处理方式见第 10 节第 1 条），' + lostHeads.length + ' 条是**注释型卡片头**（规则 15 的副产物，见第 10 节第 12 条）。');
add('');
add('**其余全部有归属**，逐类复核如下：');
add('');
const checked = [
  ['面板 tab 里的条目', S.panelEntryCount, '含卡片内条目、独立条目、变量条目、卡片头'],
  ['结构区裸条目', S.structureCount, '‼️免责声明/开源许可‼️(不开)、🗂️ 最近用户输入'],
  ['结构包裹区', S.wrapperPartCount, '🔻系统提示词🔻…🔺系统提示词🔺 12 条 + 🔻交互历史🔻…🔺交互历史🔺 5 条'],
  ['锁定层级条目', S.lockedCount, '8 个层级的开/闭各 1 条'],
  ['系统 marker（包裹区外）', S.markerCount, 'Agent System Prompt、Agent Results（无正文内容）'],
  ['模型登记表条目', 1, NEW_NAME_MODEL + '（是 4 个模型的表源，按规则 6 单列，见第 10 节第 3 条）'],
  ['找不到的条目', S.unreachableCount, '上表 ' + S.unreachableCount + ' 条（' + lostBeforeRule15.length + ' 条 📌 任务设置 + ' + lostHeads.length + ' 条规则 15 判掉的卡片头）'],
];
table(['类别', '条数', '说明'], checked);
add('');
add('> 对账：order 里共 ' + S.orderLength + ' 条，上面的分类互不重叠，合计 ' + (S.panelEntryCount + S.structureCount + S.wrapperPartCount + S.lockedCount + S.markerCount + 1 + S.unreachableCount) + ' 条 = 面板 ' + S.panelEntryCount + ' + 结构 ' + S.structureCount + ' + 包裹 ' + S.wrapperPartCount + ' + 锁定 ' + S.lockedCount + ' + marker ' + S.markerCount + ' + 登记表 1 + 找不到 ' + S.unreachableCount + '。模型 tab 里的条目是镜像，不重复计入面板去重数。');
add('');

// ---------- 10. 拿不准 ----------
add('## 10. 拿不准 / 需要拍板');
add('');
add('1. **' + code('📌 任务设置') + ' 层级的 4 条条目掉出面板（最重要）**：' + code('📌 模型任务') + ' / ' + code('📌 身份权限') + ' / ' + code('📌 输入解析') + ' / ' + code('📌 输出规范') + '。规则 8 的直接后果是「无卡片无变量 → 不出 tab」。可选：(a) 在该层级第一行加一条卡片头（如 ' + code('📌 [任务设置] 任选') + '）；(b) 把 4 条当"常开基础设施"并入结构区；(c) 给面板加一条"其它层级"兜底视图。**需要用户选一个。**');
add('2. **' + code('🗂️ 最近用户输入') + '（order ' + tree.structure.items[1].index + '）落在结构区**：它不在任何 ' + code('X🔻…X🔺') + ' 区间内，按规则 3 就是结构区，但它是 ' + tree.structure.items[1].contentLength + ' 字符的实内容，而且没有 ' + code('{{// }}') + ' 注释。面板上不会有入口，需确认这是否符合预期。');
add('3. **模型登记表 ' + code(NEW_NAME_MODEL) + ' 本身不在任何层级内**：规则 3 字面上会说它「不在任何层级区间内 → 结构区」，但规则 6 又说它是模型登记表。本解析器让规则 5/6 优先，把它标成 ' + code('model-registry') + '（不算结构区、也不是任何 tab 的条目）。建议面板把它当作「🤖 模型」tab 的表头/图例展示（不可开关）。**需确认这个优先顺序。**');
add('4. **' + code('🪓 神秘咒语') + ' 层级：用户已裁定 —— 不出 tab。** 该层级里唯一的卡片 ' + code('🤖 [模型类型]') + ' 名下 3 条条目**全是模型专属条目**（🐋 DS/GLM 💤、🐱 Gemini、🌒 KIMI(占位)），按**规则 15（收窄版：必须是该层唯一的卡片）**这张卡片不算卡片 → 该层级变成「无卡片无变量」→ 按规则 8 不出 tab。那 3 条仍然出现在「🤖 模型」tab 里（逐条核对见第 11.5 / 11.6 节），**没有任何条目因此从面板消失**。副作用见下面第 12 条。');
add('5. **模型名逐字保留**：规则 6 说取全角冒号后那部分，于是模型名是 ' + code('表示DeepSeek系列模型') + ' / ' + code('表示GLM系列模型') + ' / ' + code('表示Gemini系列模型') + ' / ' + code('表示Kimi系列模型') + '。面板上如果只想显示「DeepSeek」，需要再给一条规则（本次没有自行推断）。');
add('6. **模型闸门的多归属语义**：' + multi.length + ' 条同时属于 🐋 和 💤。面板实现「非当前模型的条目开关禁用」时，是「命中任意一个当前模型就开放」还是「必须命中全部」？解析器已经把归属集合（' + code('models') + ' 数组）带出来了，语义由面板定。');
add('7. **重名条目**：' + code('❌ 不开') + ' 出现 4 次（分别在 🔞 [NSFW文风]、🔀 [增强随机]、🪓 [底部破限]、♿ [卡思维链] 四张卡片里），' + code('🌒 KIMI(占位)') + ' / ' + code('占位(暂时只有Gemini的显式思维链)') + ' 是占位条目。主键是 identifier 所以不冲突，但面板上要不要加卡片前缀、要不要隐藏占位条目，需要拍板。');
add('8. **注释覆盖率很低**：可开关内容条目 ' + S.contentEntryCount + ' 条里只有 ' + S.commentedContentCount + ' 条自带 ' + code('{{// … }}') + ' 注释（' + pct(S.commentedContentCount / S.contentEntryCount) + '）。面板想给每条目一行说明的话，需要另做一份「条目说明补全表」（本次没做，规则 13 明确说注释缺失不是错误）。');
add('9. **order.enabled 与 prompts.enabled 有 1 条不一致**' + (enabledMismatch.length ? '：' + enabledMismatch.map((m) => code(m.name) + '（order=' + yn(m.orderEnabled) + '，prompts=' + yn(m.promptEnabled) + '）').join('、') : '') + '。解析器统一取 order 里的值（SillyTavern 也以 order 为准），面板写回时要注意两边都要同步。');
add('10. **A2 名字已定稿**：' + code(NEW_NAME_MODEL) + ' 是用户定稿名，不再是占位；emoji 📋（U+1F4CB）已确认在预设里未被占用。若之后改名，只需改 ' + code('preset-migrate.mjs') + ' 里的 ' + code('NEW_NAME_MODEL') + ' 常量。');
add('11. **已裁定（本轮落地）：规则 15 收窄成「只作用于层级里唯一的卡片」。** 上一版只按「名下条目全是模型专属」判定，一次命中两张：' + code('🤖 [模型类型]') + '（' + code('🪓 神秘咒语') + ' 层级里唯一的卡片 → 命中是对的，该层不出 tab）与 ' + code('🤔 [推理格式]') + '（' + code('🧠 推理选项') + ' 层级里 5 张卡片中的一张 → **误伤**：它从卡片头掉成普通开关、名下 2 条变成散条目，上一位实现者还临时造了一张叫「独立条目」的假卡片装它们）。收窄后：' + code('🤔 [推理格式]') + ' 恢复成正常卡片（' + code('🧠 推理选项') + ' tab 恢复成 **' + (rescuedTab ? rescuedTab.cards.length : 0) + ' 张卡片 / ' + (rescuedTab ? rescuedTab.standaloneItems.length : 0) + ' 条独立条目**），面板里那张「独立条目」假卡片已一并删除。');
add('12. **被规则 15 判掉的卡片头 ' + code(lostHeads.length ? lostHeads[0].name : '-') + ' 仍然失去面板入口**（' + code(layersLosingTab[0] || '-') + ' 不出 tab，它又没有模型 emoji）：它的 content 只有一条 ' + code('{{// }}') + ' 注释（' + (lostHeads.length ? lostHeads[0].contentLength : 0) + ' 字符）、没有正文，所以「面板上找不到的条目」是 ' + S.unreachableCount + '（= 4 条 📌 任务设置 + 这 1 条），**收窄没有把它变回 4 条**（它所在的层级里只有它这一张卡片）。需要确认：(a) 接受（按"注释不算内容"处理）；(b) 把它并入结构区；(c) 在「🤖 模型」tab 里当图例/表头展示（它的注释正好在解释"模型专属"的约定，很可能本来就该当图例）；(d) 给 ' + code('🪓 神秘咒语') + ' 层级补一张非模型专属的卡片头（那样该层会重新出 tab，卡片头也就有了面板入口）。**需要用户选一个。**');
add('');

// ---------- 11. 规则 15 ------------------
add('## 11. 规则 15（收窄版）· 模型专属卡片降级 —— 适用范围与核对结果');
add('');
add('### 11.0 规则编号与一句话表述');
add('');
add('> **规则 15（收窄版）：一张卡片，如果它 ① 是它所在层级里「唯一的卡片」，而且 ② 名下的条目「全部」都是模型专属条目（每条的模型归属集合都非空），那么这张卡片不算卡片。**');
add('');
add('- **收窄的由来（本轮唯一改动）**：旧版只有条件 ②，一次命中了**两张**卡片 —— ' + code('🤖 [模型类型]') + '（' + code('🪓 神秘咒语') + ' 层级里唯一的卡片，命中是对的）与 ' + code('🤔 [推理格式]') + '（' + code('🧠 推理选项') + ' 层级 5 张卡片中的一张，属于**误伤**）。用户实测后指出：「[推理格式] 不应该是卡片层级吗？为什么会有独立条目作为其卡片层级，而本应该是卡片层级的[推理格式]却变成了其中的一个开关？」→ 本轮把规则收窄成「只看层级里**唯一的**那张卡片」。');
add('- 编号说明：本报告沿用的「规则 N」是**需求规则**编号（规则 3 结构区/marker、规则 4 卡片组装与「零条目的卡片不算卡片」、规则 5 变量、规则 6 模型登记表、规则 7 模型归属、规则 8「有卡片或有变量才出 tab」、规则 9 全局「🤖 模型」tab、规则 10 镜像、规则 11 模型闸门、规则 12 锁定层级条目、规则 13 注释、规则 14 只统计不修改）。规则 15 实现在解析器的步骤 6.5（' + code('test/harness/preset-parse.mjs') + '），原有编号不动。');
add('- 判定条件只看「卡片是不是本层唯一的卡片」+「条目名字里的模型 emoji 归属集合是否非空」，不看 ' + code('enabled') + '、不看 content、不看注释放了什么。');
add('- 判定粒度是**卡片**：只要名下有一条条目**没有**模型归属，这张卡片照旧保留（全量扫描见 11.1）。');
add('- 生效范围只限**层级内的卡片**：包裹区不是层级；「零条目卡片」在步骤 4 就已经降级，不会走到本条。');
add('- 被判定后：卡片头降级成该层级的普通条目（' + code('cardDemoted=true') + '，' + code('cardDemoteReason="model-exclusive-items"') + '），名下条目变成该层级的**裸放条目**（' + code('card=null') + '，' + code('originCard=null') + '），卡片从层级卡片列表里移除。**收窄后「唯一的卡片」被拿掉，该层级必然变成「无卡片无变量」→ 按规则 8 不出 tab**（不会再出现「卡片被降级、层级还出 tab」的情况）。');
add('- **不变量**：不删任何条目、不改任何 ' + code('enabled') + ' / content / name、不改层级内条目顺序。模型专属条目照旧按名字里的 emoji 收进「🤖 模型」tab（规则 7/9/10 完全不受影响）。');
add('');
add('### 11.1 全量扫描：逐层级逐卡片');
add('');
add('下表是规则 15 的全部判定输入（' + cardScan.length + ' 张层级卡片，逐张列出）。第 5 列「该层卡片数」就是收窄后新增的那道闸：**只有它等于 1 的卡片才可能被判掉**。');
add('');
table(
  ['#', '层级', '卡片', '该层卡片数', '卡片内条目', '其中模型专属', '非模型条目', '判定'],
  cardScan.map((c, i) => [
    i + 1,
    c.layer,
    c.card,
    c.layerCardCount,
    c.itemCount,
    c.modelExclusiveItemCount,
    c.nonModelItemNames.length > 0 ? c.nonModelItemNames.length + ' 条' : '**0 条**',
    c.verdict === 'demoted'
      ? '**判掉（不算卡片）**'
      : (c.verdict === 'kept-not-sole-card' ? '**保留（不是本层唯一的卡片）**' : '保留'),
  ])
);
add('');
add('- 判定分布：**判掉 ' + scanDemoted.length + ' 张** ' + scanDemoted.map((c) => code(c.card) + ' @ ' + c.layer).join('、') + '；**名下条目全是模型专属、但不是本层唯一卡片 → 收窄后保留 ' + scanKeptNotSole.length + ' 张** ' + scanKeptNotSole.map((c) => code(c.card) + ' @ ' + c.layer).join('、') + '；其余 ' + scanKept.length + ' 张照旧保留。');
add('- 旧版（未收窄）会判掉 **' + widerRuleDemotions.length + ' 张**（= 上面两类之和），多出来的那 ' + scanKeptNotSole.length + ' 张就是本轮修掉的误伤。');
add('- 部分命中（卡片里既有模型条目、也有普通条目）的卡片按规则 15 一律**保留**，逐张明细：');
for (const c of cardScan.filter((c) => c.modelExclusiveItemCount > 0 && !c.allModelExclusive)) {
  add('  - ' + code(c.layer) + ' / ' + code(c.card) + '：' + c.itemCount + ' 条里 ' + c.modelExclusiveItemCount + ' 条模型专属（' + short(c.modelExclusiveItemNames.join(' / '), 140) + '），另有 ' + c.nonModelItemNames.length + ' 条无模型归属（' + short(c.nonModelItemNames.join(' / '), 140) + '）→ **保留卡片**（卡片头照旧出 tab，模型条目同时镜像进「🤖 模型」tab）。');
}
add('');
add('### 11.2 被规则 15 判掉的卡片（' + demotions.length + ' 张）');
add('');
table(
  ['卡片', '层级', 'order 区间', '模式', '该层卡片数', '卡片头 identifier', '卡片头 enabled', '名下条目（模型归属）'],
  demotions.map((d) => [
    d.card,
    d.layer,
    d.openIndex + ' … ' + d.closeIndex,
    d.mode,
    1,
    d.headIdentifier,
    yn(d.headEnabled),
    d.itemNames.map((n, i) => n + ' [' + d.itemModels[i].join(' ') + ']').join('；'),
  ])
);
add('');
add('### 11.2b 被收窄放过的那张卡片（' + rescued.length + ' 张）—— 本轮修掉的误伤');
add('');
table(
  ['卡片', '层级', '该层卡片数', '同层的其它卡片', '名下条目（模型归属）', '收窄后的身份'],
  rescued.map((r) => [
    r.card,
    r.layer,
    r.layerCardCount,
    short(r.layerOtherCards.join(' / '), 90),
    r.itemNames.map((n, i) => n + ' [' + r.itemModels[i].join(' ') + ']').join('；'),
    '**正常卡片**（卡片头 + ' + r.itemCount + ' 条卡片内条目）',
  ])
);
add('');
add('- ' + code(rescued.length ? rescued[0].card : '-') + ' 名下 ' + rescued.reduce((n, r) => n + r.itemCount, 0) + ' 条条目**全是模型专属**，但它所在层级有 ' + (rescued.length ? rescued[0].layerCardCount : 0) + ' 张卡片 → 不是「唯一的卡片」→ 规则 15 不动手。它照旧是卡片，名下条目照旧是**卡片内条目**（同时也按规则 10 镜像进「🤖 模型」tab）。');
add('- 收窄的直接可见结果：' + code(rescuedLayer || '-') + ' 层级恢复正常，tab 恢复成 **' + (rescuedTab ? rescuedTab.cards.length : 0) + ' 张卡片 + ' + (rescuedTab ? rescuedTab.standaloneItems.length : 0) + ' 条独立条目**（旧版这里是 ' + (rescuedTab ? rescuedTab.cards.length - 1 : 0) + ' 张卡片 + ' + (rescuedTab ? rescuedTab.standaloneItems.length + 1 + rescued.reduce((n, r) => n + r.itemCount, 0) : 0) + ' 条独立条目）。');
add('- 面板侧：不再需要那张为了装散条目而临时造出来的「独立条目」假卡片，**已删除**（' + code('src/scripts/40-预设设置.js') + ' 的 buildView；裸放条目现在直接铺成一条网格）。');
add('');
add('### 11.3 tab 数：完全不加规则 15 是 8，收窄前后都是 ' + S.tabCount + '（层级 ' + S.layerTabCount + ' + 模型 1）');
add('');
add('层级一共 8 个，其中 ' + code('📌 任务设置') + ' 从来没有卡片/变量、' + code('🪓 神秘咒语') + ' 的唯一卡片被规则 15 判掉 → 出 tab 的层级 ' + S.layerTabCount + ' 个，加上全局「🤖 模型」tab，**共 ' + S.tabCount + ' 个 tab**。收窄**没有改变 tab 数与 tab 顺序**：');
add('');
table(
  ['#', 'tab', '类型', '卡片数', '卡片内条目', '独立条目', '变量条目'],
  tree.tabs.map((t, i) => {
    if (t.kind === 'model') return [i + 1, t.displayName, '全局特殊 tab（跨所有层级）', t.cards.length, t.cards.reduce((n, c) => n + c.itemCount, 0), 0, 0];
    return [i + 1, t.name, '层级 tab（order ' + t.openIndex + ' … ' + t.closeIndex + '）', t.cards.length, t.cards.reduce((n, c) => n + c.itemCount, 0), t.standaloneItems.length, t.varEntries.length];
  })
);
add('');
add('- 面板里 tab 的显示顺序按用户裁定改成 **「🤖 模型」排第一个**（其余顺序不变）—— 这是面板侧的事，解析器的 tab 顺序（模型 tab 在最后）不变。');
add('- 消失的是原来的第 2 个层级 tab ' + code('🪓 神秘咒语') + '（它的卡片被规则 15 判掉后，层级变成无卡片无变量）。');
add('- 收窄后**不会再出现**「卡片被降级、层级还出 tab」的情况（那个情况是旧版的副作用 2，本轮随收窄一起消失）。');
add('- tab 里的卡片总数：' + S.cardCount + ' 张层级卡片（完全不加规则 15 时是 ' + (S.cardCount + S.modelExclusiveCardCount) + ' 张）+ ' + S.modelCardCount + ' 张模型卡片。');
add('');
add('### 11.4 ' + code('🪓 神秘咒语') + ' 层级里每条条目的新归属');
add('');
add('层级 order ' + mysteryLayer.openIndex + ' … ' + mysteryLayer.closeIndex + '，区间内 **' + mysteryLayer.items.length + ' 条**普通条目（两条层级条目本身锁定为开、不在面板）。逐条核对：');
add('');
table(
  ['#', 'order', '条目名', 'identifier', '模型归属', '现在的身份', '在「🤖 模型」tab 的哪张卡片', '面板可达'],
  mysteryLayer.items.map((e, i) => [
    i + 1,
    e.index,
    e.name,
    e.identifier,
    e.models.length ? e.models.join(' ') : '-',
    e.cardDemoteReason === 'model-exclusive-items'
      ? '被规则 15 降级的**卡片头**（层级裸放条目）'
      : (e.demotedFromCard ? '原卡片 ' + e.demotedFromCard + ' 的名下条目 → 规则 15 后变成层级裸放条目' : '层级裸放条目（本来就不在任何卡片里）'),
    modelTabHits.has(e.identifier) ? modelTabHits.get(e.identifier).join(' / ') : '-',
    unreachableIds.has(e.identifier) ? '**否**（见 11.6）' : '是（经「🤖 模型」tab）',
  ])
);
add('');
add('- ' + code('🐱 Gemini随机数') + ' / ' + code('🐱 Gemini抗输入审') + ' 这两条**本来就**是该层级里的裸放条目（不在任何卡片内），规则 15 之后身份不变，仍然**只在「🤖 模型」tab（🐱）里出现**（实测：' + mysteryLayer.inModel.length + ' / ' + mysteryLayer.items.length + ' 条在该层级里能找到模型 tab 入口）。');
add('- 被降级的卡片头 + 3 条原卡片名下条目，现在都是该层级的裸放条目；其中 3 条模型条目照旧进模型 tab，卡片头没有模型 emoji，所以它只能在层级里被点到 —— 而层级不出 tab（见 11.6）。');
add('');
add('### 11.5 「🤖 模型」tab 的内容');
add('');
add('规则 15 **不参与**模型 tab 的收集（那是规则 7/9/10 的事），所以模型 tab 的卡片与条目一个不变。实测：');
add('');
table(
  ['模型卡片', '条目数', '条目名（身份）'],
  tree.modelTab.cards.map((c) => [c.emoji + ' ' + c.label, c.itemCount, c.items.map((it) => it.name + (it.isMirror ? '（镜像）' : '（仅模型 tab）')).join(' / ')])
);
add('');
add('- 唯一模型条目 **' + S.modelMemberEntryCount + ' 条**；模型 tab 内出现 **' + S.modelTabOccurrences + ' 次** ＝ ' + modelTabSummary + '。**「模型 tab 内容有没有变」的答案：没变**（收窄只改卡片身份，不改条目的去留）。');
add('- 「出现次数 = 原生位置 + 模型 tab」= **' + S.modelMemberEntryCount + ' + ' + S.modelTabOccurrences + ' = ' + (S.modelMemberEntryCount + S.modelTabOccurrences) + ' 次**（含镜像）。');
add('- **本轮（收窄后）的镜像 / 仅模型 tab 拆分：镜像 ' + S.modelMirrorCount + ' 次 / 仅模型 tab ' + S.modelOnlyOccurrences + ' 次**；完全不加规则 15 时是**镜像 ' + mirrorBefore + ' 次 / 仅模型 tab ' + onlyBefore + ' 次**（差在 ' + demotedItemIds.length + ' 条被降级卡片的条目：它们的 ' + code('originCard') + ' 从卡片名变成 ' + code('null') + '）。上一版（未收窄）是镜像 ' + (mirrorBefore - (rescued.reduce((n, r) => n + r.itemCount, 0))) + ' 次 —— 收窄把 ' + code(rescued.length ? rescued[0].card : '-') + ' 名下那 ' + rescued.reduce((n, r) => n + r.itemCount, 0) + ' 条还回了卡片，所以镜像次数回升。');
add('- ' + S.modelMemberEntryCount + ' 条模型条目里，原生位置能在某个层级 tab 里找到的有 **' + modelMembersWithNativeTab.length + ' 条**（' + modelMembersWithNativeTab.map((e) => code(e.name)).join('、') + '）；原生位置在不出 tab 的层级里的有 **' + modelMembersNativeHidden.length + ' 条**（' + modelMembersNativeHidden.map((e) => code(e.name)).join('、') + '）—— 这 ' + modelMembersNativeHidden.length + ' 条**只靠「🤖 模型」tab 才能被点到**。');
add('');
add('### 11.6 「面板上找不到的条目」：4 → ' + S.unreachableCount + '（**没有回到 4 条，明确报出来**）');
add('');
add('用户期望是「回到 4 条（全部来自 ' + code('📌 任务设置') + '）」。**实测是 ' + S.unreachableCount + ' 条**：那 ' + lostBeforeRule15.length + ' 条 📌 任务设置 之外，还多 ' + lostHeads.length + ' 条 —— ' + code(lostHeads.length ? lostHeads[0].name : '-') + '（order ' + (lostHeads.length ? lostHeads[0].index : '-') + '，' + code(lostHeads.length ? lostHeads[0].identifier : '-') + '）。');
add('');
add('**为什么收窄没有救回它**：收窄只保护「不是本层唯一卡片」的卡片，而它是 ' + code(layersLosingTab[0] || '-') + ' 层级里**唯一的卡片**（该层卡片数 = 1）→ 规则 15 照旧命中 → 卡片被降级成普通条目 → 而该层级又不出 tab（规则 8）→ 它既不在任何 tab 里、名字里也没有模型 emoji（不进「🤖 模型」tab）、也不是结构区/锁定/marker → 落入「找不到」。');
add('');
add('**但它不是有正文的内容条目**：content 共 ' + (lostHeads.length ? lostHeads[0].contentLength : 0) + ' 字符，全部是一条 ' + code('{{// }}') + ' 注释' + (lostHeads.length && lostHeads[0].commentFlat ? '：' + code(short(lostHeads[0].commentFlat, 140)) : '') + '，没有任何正文/指令文本，当前 enabled=' + (lostHeads.length ? yn(lostHeads[0].enabled) : '-') + '。');
add('');
table(
  ['#', 'order', '条目名', 'identifier', 'content 长度', 'content 是否只有一条注释', '为什么找不到'],
  tree.unreachable.map((e, i) => [
    i + 1,
    e.index,
    e.name,
    e.identifier,
    e.contentLength,
    e.comment !== null && e.content === '{{//' + e.comment + '}}' ? '是（纯注释）' : '否（有正文）',
    e.cardDemoteReason === 'model-exclusive-items' ? '规则 15 把它的卡片判掉了，层级不出 tab' : '层级无卡片无变量 → 不出 tab（规则 8，原有问题）',
  ])
);
add('');
add('- 被降级的 ' + demotedItemIds.length + ' 条模型条目（' + demotions.map((d) => d.itemNames.map((n) => code(n)).join('、')).join('、') + '）**没有掉出面板**：它们都在「🤖 模型」tab 里（见 11.4 / 11.5）。');
add('- **结论（报告必须回答的问题）**：' + code('📌 任务设置') + ' 的 ' + lostBeforeRule15.length + ' 条仍然是唯一一批「有正文却点不到」的条目（用户已确认接受）；第 ' + S.unreachableCount + ' 条是**注释型卡片头**（0 正文），它确实失去了面板入口 → 列为待拍板项（第 10 节第 12 条）。**从面板上消失的「真实内容」条目是 0 条。**');
add('');
add('### 11.7 迁移断言复跑');
add('');
add('- 本报告生成时已经在内存里跑过同一套迁移断言：**' + mig.assertions.filter((a) => a.ok).length + ' / ' + mig.assertions.length + ' 通过**' + (mig.assertions.every((a) => a.ok) ? '（全部 PASS，无失败）' : '（**有失败：' + mig.assertions.filter((a) => !a.ok).map((a) => a.id).join('、') + '**）') + '。');
if (rederive) {
  add('- 复跑方式：' + code('src/preset.base.json') + ' 已是迁移后的状态，' + code('migratePreset()') + ' 会短路成「已迁移、0 断言」，所以本报告改用**迁移前备份** ' + code(BACKUP_PATH) + '（' + rederive.bytes + ' 字符）在内存里重跑迁移，并核对「重跑结果 == 盘上的 base」：**' + (rederive.match ? '逐字节一致' : '不一致（见第 2 节）') + '**。');
} else {
  add('- 单独复跑：' + code('node test/harness/preset-migrate.mjs --check') + '。');
}
add('- 规则 15 只改解析器（' + code('preset-parse.mjs') + '）与报告生成器，**没有动** ' + code('preset-migrate.mjs') + '：4 处迁移改动与 ' + mig.assertions.length + ' 条断言与本轮之前逐条相同（断言 id 清单可在第 2.2 节核对）。');
add('');
add('### 11.8 规则 15（收窄版）的边界与已知副作用');
add('');
add('| 项 | 结论 |');
add('| --- | --- |');
add('| 判定输入 | ① 这张卡片是不是它所在层级里唯一的卡片（' + code('r.cards.length === 1') + '）；② 条目名字里的模型 emoji 归属集合（来自登记表 ' + code(NEW_NAME_MODEL) + ' 的 4 个 emoji）。两条都满足才降级 |');
add('| 判定粒度 | 卡片（不是层级、不是条目）；名下**任一**条目无模型归属 → 卡片保留 |');
add('| 命中范围 | ' + cardScan.length + ' 张层级卡片里命中 ' + demotions.length + ' 张（' + demotions.map((d) => code(d.card)).join('、') + '）；涉及层级 ' + demotedLayerNames.length + ' 个；另有 ' + scanKeptNotSole.length + ' 张因「不是本层唯一卡片」被放过（' + scanKeptNotSole.map((c) => code(c.card)).join('、') + '） |');
add('| 与旧版的差 | 旧版（只有条件 ②）会判掉 ' + widerRuleDemotions.length + ' 张；收窄后判掉 ' + demotions.length + ' 张 → 少判 ' + scanKeptNotSole.length + ' 张，正是用户指出的误伤 |');
add('| 条目去留 | **不删条目**：' + demotedItemIds.length + ' 条被降级卡片名下的模型条目仍进「🤖 模型」tab；模型 tab 的卡片与条目一个没变（11.5） |');
add('| 可开关条目数 | 完全不加规则 15 时 ' + contentBefore + ' → **' + S.contentEntryCount + '**（本级卡片头降级后掉出面板，不再计入内容条目） |');
add('| 卡片头 / 面板 | 卡片头 ' + cardHeadBefore + ' → ' + S.cardHeadCount + '；面板条目 ' + panelBefore + ' → ' + S.panelEntryCount + ' |');
add('| 副作用（收窄后只剩这一个） | ' + code(layersLosingTab[0] || '-') + ' 的卡片头 ' + code(lostHeads.length ? lostHeads[0].name : '-') + ' 失去面板入口（层级不出 tab 且它没有模型 emoji）→ 「找不到的条目」4 → ' + S.unreachableCount + '（11.6）。它的 content 只有一条注释 |');
add('| 已消除的旧副作用 | 旧版「卡片被降级、层级照旧出 tab → 名下模型条目在层级 tab 与模型 tab 各出现一次（重复展示）」**已随收窄消失**：收窄后只有「唯一卡片的层级」会命中，而那种层级必然不出 tab |');
add('| 顺序 | 层级内顺序不变（卡片头 + 名下条目原地变成裸放条目） |');
add('| 与规则 4 的关系 | 规则 4 管「零条目的卡片不算卡片」，规则 15 是它的补充（条目不为空、但全是模型专属） |');
add('| 与规则 8 的关系 | 规则 8 是出 tab 闸门；规则 15 让这张卡片不再为层级"贡献"卡片，而收窄保证了命中就意味着该层没有别的卡片 → **必然**触发规则 8（本预设里就是 ' + code(layersLosingTab[0] || '-') + '） |');
add('| 面板实现建议 | 被降级的卡片头可用 ' + code('cardDemoted') + ' + ' + code('cardDemoteReason') + ' 识别；模型 tab 的条目可用 ' + code('originCardDemoted') + ' 区分「原卡片被判掉」与「本来就没卡片」；面板已删除自造的「独立条目」假卡片（收窄后不再需要） |');
add('');

// ---------- 12. 复现 ----------
add('## 12. 复现命令');
add('');
add('```');
add('# 迁移检查（默认模式，只报告不写盘）');
add('node test/harness/preset-migrate.mjs');
add('node test/harness/preset-migrate.mjs --check');
add('');
add('# 真正写盘（' + (rederive ? '已经执行过：src/preset.base.json 就是迁移后的产物' : '还没执行，等用户批准') + '）');
add('node test/harness/preset-migrate.mjs --write');
add('');
add('# 重新生成本表（自动跑内存迁移 + 解析；base 已迁移时改用 ' + BACKUP_PATH + ' 复跑迁移断言）');
add('node test/harness/preset-report.mjs');
add('```');
add('');
add('解析器入口（纯函数，可直接被面板脚本复用）：');
add('');
add('```js');
add('import { parsePreset } from "./preset-parse.mjs";');
add('const tree = parsePreset(presetObject);   // 输入：迁移后的预设对象');
add('```');
add('');

fs.mkdirSync('design/proposals', { recursive: true });
fs.writeFileSync(OUT_PATH, L.join(NL) + NL, 'utf8');

// ---------- 控制台摘要 ----------
console.log('已生成：' + OUT_PATH + '（' + L.length + ' 行）');
console.log('迁移：' + mig.changes.length + ' 处改动，断言 ' + mig.assertions.filter((a) => a.ok).length + '/' + mig.assertions.length + ' 通过' + (rederive ? ('；base 已迁移，断言由 ' + BACKUP_PATH + ' 复跑，重跑结果 == base：' + rederive.match) : '；未写盘。'));
console.log('解析：tab ' + S.tabCount + '（层级 ' + S.layerTabCount + ' + 模型 1）｜卡片 ' + (S.cardCount + S.modelCardCount) + '｜可开关条目 ' + S.contentEntryCount + '｜结构区 ' + (S.structureCount + S.wrapperPartCount) + '｜锁定 ' + S.lockedCount);
console.log('规则 15（收窄版）：扫描 ' + cardScan.length + ' 张层级卡片，判掉 ' + demotions.length + ' 张（' + (demotions.length ? demotions[0].card + ' @ ' + demotions[0].layer : '-') + '），收窄放过 ' + scanKeptNotSole.length + ' 张（' + (scanKeptNotSole.length ? scanKeptNotSole.map((c) => c.card + ' @ ' + c.layer).join('、') : '-') + '），旧版会判掉 ' + widerRuleDemotions.length + ' 张');
console.log('tab 列表（解析器顺序）：' + tabNames);
console.log('模型 tab：' + modelTabSummary + '｜唯一 ' + S.modelMemberEntryCount + ' 条｜模型 tab 内 ' + S.modelTabOccurrences + ' 次（镜像 ' + S.modelMirrorCount + ' / 仅模型 tab ' + S.modelOnlyOccurrences + '，完全不加规则 15 是 ' + mirrorBefore + ' / ' + onlyBefore + '）');
console.log('找不到的条目 ' + S.unreachableCount + ' 条（📌 任务设置 ' + lostBeforeRule15.length + ' + 规则 15 判掉的卡片头 ' + lostHeads.length + '）：' + tree.unreachable.map((e) => e.name + '(' + e.identifier + ')').join(' / '));
console.log('推理选项 tab：卡片 ' + (rescuedTab ? rescuedTab.cards.length : 0) + ' 张 ｜ 独立条目 ' + (rescuedTab ? rescuedTab.standaloneItems.length : 0) + ' 条 ｜ 含 [推理格式]：' + (rescuedCard ? '是（' + rescuedCard.itemCount + ' 条）' : '否'));
console.log('issues: ' + tree.issues.length + ' 条');
for (const i of tree.issues) console.log('   ' + i.level + ' ' + i.kind + ' ' + (i.name || i.identifier || ''));
