#!/usr/bin/env node
/**
 * 对话模式纯逻辑单测（离线，不需要酒馆）
 * 用法：node test/harness/dialog-mode.mjs
 *
 * 对象：src/scripts/40-预设设置.js 里的 enterDialogMode / leaveDialogMode / isDialogModeEntry /
 * enabledOfId —— 由 .audit/extract-dialog.mjs 从真源码里抽出来（不是抄一份），
 * 这里补上 mock 依赖再跑断言。
 *
 * ⚠️ 为什么要有这份离线单测：浏览器预览台会同时加载多份脚本实例，
 *    用它验证这个功能极不稳定（2026-10-15 在这上面耗了很久）。
 *    纯逻辑用 Node 跑，结论可复现、可回归。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* 先跑一次抽取脚本：保证测的是**当前**源码，而不是上一次生成的陈货 */
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(root, '.audit', 'extract-dialog.mjs')], { stdio: 'pipe' });

const require2 = createRequire(import.meta.url);
const M = require2(path.join(root, '.audit', 'dialog-extract.cjs'));

/* 「要关哪些组」在解析器里（那个文件零 import，可以直接 import） */
const { parsePreset, dialogModeTargets } = await import('../../test/harness/preset-parse.mjs');
const preset = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root, 'src', 'preset.base.json'), 'utf8'));

let pass = 0, fail = 0;
function eq(got, want, label) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      期望：' + w + '\n      实际：' + g); }
}

/* 造一份「跑团专属的组」：3 条开着、1 条关着；另有两条模式条目与一条推理格式条目 */
const TARGET_IDS = ['a1', 'a2', 'a3', 'a4'];
function freshItems() {
  return [
    { identifier: 'a1', name: '🗣️ 简体中文', enabled: true },
    { identifier: 'a2', name: '🏃🏻‍♂️ 详略得当', enabled: true },
    { identifier: 'a3', name: '👁️ 限知第三人称', enabled: false },
    { identifier: 'a4', name: '🎯 行动选项', enabled: true },
    { identifier: 'd1a10001-0000-4000-8000-000000000002', name: '🎲 剧情游玩', enabled: true },
    { identifier: 'd1a10001-0000-4000-8000-000000000003', name: '💬 对话讨论', enabled: false },
    { identifier: 'keep', name: '🤔 Gemini糖糖', enabled: true }
  ];
}
function setup() {
  M.clearSaved();
  M.setItems(freshItems());
  M.setTargets({ groups: [{ layer: '📖 创作要求', card: '🗣️ [语言文字]', identifiers: TARGET_IDS }], identifiers: TARGET_IDS });
}
function allOff() { return freshItems().map(function (x) { return { identifier: x.identifier, name: x.name, enabled: false }; }); }

console.log('=== 对话模式 · 纯逻辑单测 ===');

/* ① 模式条目识别：按名字认，不靠顺序 */
setup();
eq(M.isDlgEntry('d1a10001-0000-4000-8000-000000000003'), true, '① 认出「💬 对话讨论」');
eq(M.isDlgEntry('d1a10001-0000-4000-8000-000000000002'), false, '① 「🎲 剧情游玩」不算对话模式条目');
eq(M.isDlgEntry('a1'), false, '① 普通条目不算');

/* ② 进入：目标全部关掉；**不碰**推理格式 */
setup();
const entered = M.enter();
eq(entered.length, 4, '② 进入时给出 4 条（= 目标条目数）');
eq(entered.every(function (p) { return p.value === false; }), true, '② 全部是「关掉」');
eq(entered.some(function (p) { return p.identifier === 'keep'; }), false, '② 不碰推理格式条目');

/* ③ 快照：只存一份，记的是**进入前**的状态 */
setup();
M.enter();
eq(M.saved().on.a1, true, '③ 快照记下 a1 进入前是「开」');
eq(M.saved().on.a3, false, '③ 快照记下 a3 进入前是「关」');
M.setItems(allOff());
M.enter();
eq(M.saved().on.a1, true, '③ 第二次进入**不覆盖**快照（原始状态保住）');

/* ④ 退出：按快照逐条恢复 */
setup();
M.enter();
M.setItems(allOff());
const left = M.leave();
eq(left.length, 4, '④ 退出时给出 4 条恢复');
const back = {};
left.forEach(function (p) { back[p.identifier] = p.value; });
eq(back, { a1: true, a2: true, a3: false, a4: true }, '④ 恢复成进入前的原样（开着的开、关着的关）');

/* ⑤ 没进过就退出：不动任何东西 */
setup();
M.clearSaved();
eq(M.leave(), [], '⑤ 没进过对话模式时，退出不产生任何改动');

/* ⑥ 目标为空：安全返回，不抛异常 */
setup();
M.setTargets({ groups: [], identifiers: [] });
eq(M.enter(), [], '⑥ 目标为空时进入返回空数组（不抛异常）');

/* ⑦ 真实预设：要关哪些组（对话框那 4 个层级全关 + 推理选项除推理格式外全关） */
{
  const tree = parsePreset(preset);
  const r = dialogModeTargets(tree.tabs);
  const layers = {};
  r.groups.forEach(function (g) { layers[g.layer] = (layers[g.layer] || 0) + 1; });
  eq(!!layers['📖 创作要求'], true, '⑦ 创作要求整层都在目标里');
  eq(!!layers['😀 角色塑造'], true, '⑦ 角色塑造整层都在目标里');
  eq(!!layers['📝 写作指导'], true, '⑦ 写作指导整层都在目标里');
  eq(!!layers['🧪 额外任务'], true, '⑦ 额外任务整层都在目标里');
  eq(!!layers['🧠 推理选项'], true, '⑦ 推理选项也有关掉的组');

  /* 推理格式组的条目**一条都不能**出现在目标里 */
  const keep = tree.tabs.find(function (t) { return String(t.name || '').indexOf('推理选项') >= 0; });
  const fmt = (keep.cards || []).find(function (c) { return String(c.name).indexOf('推理格式') >= 0; });
  const fmtIds = (fmt.items || []).map(function (i) { return i.identifier; });
  eq(fmtIds.length > 0, true, '⑦ 找得到「推理格式」组（不然下面的断言是空转）');
  eq(fmtIds.some(function (id) { return r.identifiers.indexOf(id) >= 0; }), false, '⑦ **推理格式的条目一条都不在目标里**');

  /* 模式条目自己也不能被关（它们在「🎛 运行模式」层级里，是自然层级，不是模型 tab 的特例） */
  const modeLayer = tree.layers.find(function (l) { return String(l.name || '').indexOf('运行模式') >= 0; });
  eq(!!modeLayer, true, '⑦ 产物里有「🎛 运行模式」层级');
  eq(modeLayer.hasTab, true, '⑦ 它是一个自然层级（有自己的 tab）');
  eq(modeLayer.cards.length, 1, '⑦ 它有一张卡片');
  eq(modeLayer.cards[0].name, '🎛 [运行模式]', '⑦ 卡片名是「🎛 [运行模式]」');
  eq(modeLayer.cards[0].mode, '单选', '⑦ 卡片是单选（选中一个顶掉另一个）');
  const modeIds = (modeLayer.cards[0].items || []).map(function (i2) { return i2.identifier; });
  eq(modeIds.length, 2, '⑦ 卡片里有 2 个模式条目');
  eq(modeIds.some(function (id) { return r.identifiers.indexOf(id) >= 0; }), false, '⑦ 模式条目自己**不在**关停目标里（否则会把模式也关掉）');

  /* 它在模型 tab 之外，而且排在推理选项之后（用户 2026-10-15 的要求） */
  const modelCardNames = tree.modelTab.cards.map(function (c) { return String(c.name); });
  eq(modelCardNames.some(function (n) { return n.indexOf('模式切换') >= 0; }), false, '⑦ 模型 tab 里**没有**模式卡了');
  const layerNames = tree.layers.map(function (l) { return String(l.name || ''); });
  const rmAt = layerNames.findIndex(function (n) { return n.indexOf('运行模式') >= 0; });
  const rzAt = layerNames.findIndex(function (n) { return n.indexOf('推理选项') >= 0; });
  eq(rmAt > rzAt && rmAt === layerNames.length - 1, true, '⑦ 运行模式排在推理选项之后、且是整个预设的最后一层');

  /* 目标 id 必须都能在顺序表里找到（否则面板写不进去） */
  const orderIds = {};
  (preset.prompt_order[0].order || []).forEach(function (o) { orderIds[o.identifier] = 1; });
  const orphan = r.identifiers.filter(function (id) { return !orderIds[id]; });
  eq(orphan, [], '⑦ 目标条目全都在 prompt_order 里（没有孤儿）');
}

console.log('\n=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
