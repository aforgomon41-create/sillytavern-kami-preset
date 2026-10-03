#!/usr/bin/env node
/**
 * 「用户自定义文风」接线守卫（默认只读源码；给了产物路径再查产物）
 * ------------------------------------------------------------
 * 为什么要这个守卫：这件功能横跨四处，任何一处漏了构建都照样全绿 ——
 *   ① 唯一真相 test/harness/preset-parse.mjs（标记 DIY_SUFFIX + parseCustomName + 写入计划）；
 *   ② 结构写入 40-预设设置.js 的 KamiPreset 新方法（走活设置 + 酒馆原生保存按钮）；
 *   ③ 界面 50-引导.js 的「文风」页（**只渲染 + 调用 API，自己不许碰预设**）；
 *   ④ 纯逻辑单测 test/harness/custom-style-pure.mjs。
 * 最容易悄悄分叉的正是 ①：标记与解析函数在 40 / 50 里各抄一份，两边就会慢慢漂开
 * （_preset-cards.js 头部注释记着同一组件写两套已经丢过两次功能）。所以这里**先钉死唯一性**。
 *
 * 用法：node build/verify-custom-style.mjs            ← 只查源码（随时可跑）
 *      node build/verify-custom-style.mjs <产物路径>   ← 再查内联产物（build 之后跑）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let bad = 0, noteN = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};
const note = (label) => { noteN++; console.log('NOTE  ' + label); };

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (src, needle) => { let n = 0, i = 0; for (;;) { i = src.indexOf(needle, i); if (i < 0) { return n; } n++; i += needle.length; } };

console.log('=== 用户自定义文风 · 源码守卫 ===');

const parseSrc = read('test/harness/preset-parse.mjs');
const panelSrc = read('src/scripts/40-预设设置.js');
const guideSrc = read('src/scripts/50-引导.js');

/* ── ① 唯一真相：标记与解析函数只许出现在 preset-parse.mjs ── */
const hasMarker = src => src.indexOf("' | diy_write_style'") >= 0;
ok(hasMarker(parseSrc), '① 标记字面量在 preset-parse.mjs 里');
ok(!hasMarker(panelSrc), '① 40 号里没有标记字面量（不许自己抄一份）');
ok(!hasMarker(guideSrc), '① 50 号里没有标记字面量（不许自己抄一份）');

const allSrc = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git' && e.name !== 'dist' && e.name !== 'mirror' && e.name !== 'archive') { walk(p); } continue; }
    if (/\.(js|mjs)$/.test(e.name)) {
      const rel = path.relative(ROOT, p);
      /* 跳过守卫自己：它的判定里就必须写出那些字面量 */
      if (rel.split(path.sep).join('/') === 'build/verify-custom-style.mjs') { continue; }
      allSrc.push({ rel: rel, text: fs.readFileSync(p, 'utf8') });
    }
  }
})(ROOT);
const defSites = allSrc.filter(f => f.text.indexOf('function parseCustomName(') >= 0).map(f => f.rel);
ok(defSites.length === 1 && defSites[0].indexOf('preset-parse.mjs') >= 0,
  '① parseCustomName 全仓只有一处定义', defSites.join(', ') || '一处都没有');
const suffixDefs = allSrc.filter(f => f.text.indexOf('export const DIY_SUFFIX') >= 0).map(f => f.rel);
ok(suffixDefs.length === 1 && suffixDefs[0].indexOf('preset-parse.mjs') >= 0,
  '① DIY_SUFFIX 全仓只有一处定义', suffixDefs.join(', ') || '一处都没有');

/* ── ② 解析器仍然能被内联（build/kami-doc.mjs 的三条硬检查） ── */
ok(parseSrc.indexOf('import ') < 0, '② preset-parse.mjs 零 import（内联前提）');
const lines = parseSrc.split('\n');
const indentedExport = lines.filter(l => /^\s+export\s/.test(l));
ok(indentedExport.length === 0, '② 没有缩进的 export（只会被去掉行首的）', indentedExport.length + ' 行');
const leftExport = lines.map(l => l.startsWith('export ') ? l.slice(7) : l).filter(l => l.startsWith('export '));
ok(leftExport.length === 0, '② 去掉行首 export 后不再残留 export');

/* ── ③ 40 号：新 API 与安全通道 ── */
ok(panelSrc.indexOf('planCustomStyleWrite(') >= 0, '③ 40 号调用了写入计划函数');
ok(panelSrc.indexOf('customStyleSections(') >= 0, '③ 40 号调用了分区解析');
ok(panelSrc.indexOf('customStyleEntries(') >= 0, '③ 40 号调用了读侧');
ok(/customStyles\s*:/.test(panelSrc), '③ KamiPreset 暴露了 customStyles');
ok(/applyCustomStyles\s*:/.test(panelSrc), '③ KamiPreset 暴露了 applyCustomStyles');
ok(panelSrc.indexOf('savePresetFile(') >= 0, '③ 结构写入走 savePresetFile（点 #update_oai_preset）');
for (const forbidden of ['replacePreset(', 'updatePresetWith(', 'setPreset(']) {
  ok(panelSrc.indexOf(forbidden) < 0, '③ 没有调用 ' + forbidden + '（白名单重建会写坏预设）');
}
ok(panelSrc.indexOf('diyRollback') >= 0, '③ 有回滚路径 diyRollback');
ok(panelSrc.indexOf('DIY_ORDER_COUNT') >= 0 || panelSrc.indexOf('orderEntryCount') >= 0, '③ 写入前断言了 prompt_order 结构');

/* ── ④ 50 号：只渲染 + 调用，不许自己碰预设 ── */
ok(guideSrc.indexOf('applyCustomStyles') >= 0, '④ 50 号调用了 applyCustomStyles');
ok(guideSrc.indexOf('customStyles') >= 0, '④ 50 号调用了 customStyles（读）');
ok(guideSrc.indexOf('CUSTOM_STYLE_COPY') >= 0, '④ 50 号有集中的文案常量对象');
/* 50 本来就会直读 prompt_order（liveEnabledMap 就是），所以这里不能按"出现字符串"判，
   要按**写口**判：不许出现任何写盘/写预设的调用。 */
ok(guideSrc.indexOf('update_oai_preset') < 0, '④ 50 号没有自己去点酒馆的保存按钮');
ok(guideSrc.indexOf('savePresetFile') < 0, '④ 50 号没有自己写预设文件');
ok(guideSrc.indexOf('saveSettingsDebounced') < 0, '④ 50 号没有自己写酒馆设置');
ok(guideSrc.indexOf('replacePreset(') < 0, '④ 50 号没有碰被禁的预设 API');
note('④ 的「50 不碰预设」是按写口 grep 判的，能挡住直接下手，挡不住把活拆碎了绕过去');

/* ── ④b 用户 2026-10-02 点名的两条补丁 ── */
/* (1) 分区收尾标记读不到 → 硬拒绝写入（功能不可用是看得见的毛病，条目插到分区外是看不见的毛病） */
ok(panelSrc.indexOf('NO_SECTION_END') >= 0, '④b 40 号在收尾标记缺失时硬拒绝写入');
ok(panelSrc.indexOf('if (!sec.closeIdentifier)') >= 0, '④b 那道硬闸就在 applyCustomStyles 里');
ok(guideSrc.indexOf('closeOk') >= 0, '④b 50 号按 closeOk 收起写入口（只让看不让改）');
/* (2) 掉出组的条目要有明确提示（否则用户只会看到"我的文风不见了"） */
ok(guideSrc.indexOf('data-kami-cs-orphan') >= 0, '④b 50 号给掉组的行打了标记');
ok(guideSrc.indexOf('orphanNote') >= 0, '④b 50 号在列表上方给出掉组解释');
ok(guideSrc.indexOf('CUSTOM_STYLE_COPY.orphanNote.replace') >= 0, '④b 掉组提示带条数（{n} 会被替换）');

/* ── ⑤ 单测文件在，且不是空壳 ── */
const testRel = 'test/harness/custom-style-pure.mjs';
ok(fs.existsSync(path.join(ROOT, testRel)), '⑤ 单测文件存在');
if (fs.existsSync(path.join(ROOT, testRel))) {
  const t = read(testRel);
  const eqN = count(t, 'eq(') + count(t, 'ok(');
  ok(eqN >= 40, '⑤ 单测断言数量够（>= 40）', eqN + ' 处');
  for (const fn of ['planCustomStyleWrite', 'customStyleSections', 'resolveCustomGroup', 'parseCustomName', 'buildCustomStyleName']) {
    ok(t.indexOf(fn) >= 0, '⑤ 单测覆盖了 ' + fn);
  }
}

/* ── ⑥ 产物层（给了路径才查） ── */
const p = process.argv[2];
if (!p) {
  note('没给产物路径：只查了源码。build 之后请跑 node build/verify-custom-style.mjs <产物>');
} else if (!fs.existsSync(p)) {
  ok(false, '⑥ 产物存在', p);
} else {
  console.log('');
  console.log('=== 产物接线 ===');
  const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
  const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
  const panel = String((scripts.find(s => String(s.name).indexOf('预设设置') >= 0) || {}).content || '');
  const guide = String((scripts.find(s => String(s.name).indexOf('引导') >= 0) || {}).content || '');
  ok(!!panel, '⑥ 产物里有「预设设置」脚本');
  ok(!!guide, '⑥ 产物里有「引导」脚本');
  ok(panel.indexOf('function parseCustomName(') >= 0, '⑥ 解析器内联进了 40 号');
  ok(guide.indexOf('function parseCustomName(') >= 0, '⑥ 解析器内联进了 50 号');
  ok(panel.indexOf('function planCustomStyleWrite(') >= 0, '⑥ 写入计划内联进了 40 号');
  ok(panel.indexOf('applyCustomStyles') >= 0, '⑥ 40 号有 applyCustomStyles');
  ok(guide.indexOf('CUSTOM_STYLE_COPY') >= 0, '⑥ 50 号有文案常量');
  const dupMarker = count(panel, "' | diy_write_style'") + count(guide, "' | diy_write_style'");
  ok(dupMarker <= 2, '⑥ 标记字面量只随解析器各内联一份（40 一份、50 一份）', dupMarker + ' 处');
}

console.log('');
console.log(bad ? ('✗ ' + bad + ' 项未通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')) : ('✓ 全部通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')));
process.exit(bad ? 1 : 0);
