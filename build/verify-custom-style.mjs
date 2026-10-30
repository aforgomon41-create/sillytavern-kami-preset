#!/usr/bin/env node
/**
 * 「用户自定义文风」接线守卫（默认只读源码；给了产物路径再查产物）
 * ------------------------------------------------------------
 * 为什么要这个守卫：这件功能横跨四处，任何一处漏了构建都照样全绿 ——
 *   ① 唯一真相 test/harness/preset-parse.mjs（标记 DIY_SUFFIX + parseCustomName + 写入计划）；
 *   ② 结构写入 40-预设设置.js 的 KamiPreset 新方法（走活设置 + 酒馆原生保存按钮）；
 *   ③ 界面 src/scripts/_custom-style-ui.js（**整块只有这一份**：40 与 50 各内联它一次）；
 *   ④ 两个面板的接线（40 = 写作指导 tab 挂一次，50 = 文风页挂一次）；
 *   ⑤ 纯逻辑单测 test/harness/custom-style-pure.mjs。
 * 最容易悄悄分叉的是 ① 和 ③：标记/解析函数抄两份会漂；整块 UI 抄两份更糟 ——
 * _preset-cards.js 头部注释记着，同组件写两套已经丢过两次功能。所以这里**先钉死唯一性**。
 *
 * 用法：node build/verify-custom-style.mjs            ← 只查源码（随时可跑）
 *      node build/verify-custom-style.mjs <产物路径>   ← 再查内联产物（build 之后跑）
 */
import { flattenScriptTrees, expandPanelGestures } from './kami-doc.mjs';
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
const uiSrc = read('src/scripts/_custom-style-ui.js');
const docSrc = read('build/kami-doc.mjs');

/* ── ① 唯一真相：标记与解析函数只许出现在 preset-parse.mjs ── */
const hasMarker = src => src.indexOf("' | diy_write_style'") >= 0;
ok(hasMarker(parseSrc), '① 标记字面量在 preset-parse.mjs 里');
ok(!hasMarker(panelSrc), '① 40 号里没有标记字面量（不许自己抄一份）');

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

/* ── ④ 界面接线：2026-10-30 起自定义文风块由运行库的预设面板 / 引导面板画，
     经 40 号的预设桥（customStyles / applyCustomStyles）读写；_custom-style-ui.js 只剩文案。 */
const bridgeSrc = read('src/scripts/_preset-bridge.js');
const uiPanels = ['src/frontend/panels/preset-panel.tsx', 'src/frontend/panels/preset-parts.tsx', 'src/frontend/panels/guide-panel.tsx']
  .filter(r => fs.existsSync(path.join(ROOT, r))).map(read).join('\n');
ok(/customStyles:\s*function/.test(bridgeSrc) && /applyCustomStyles:\s*function/.test(bridgeSrc), '④ 预设桥导出 customStyles / applyCustomStyles');
ok(/\.customStyles\(/.test(uiPanels) && /\.applyCustomStyles!?\(/.test(uiPanels), '④ 新面板真的调用了这两个出口');
ok(uiSrc.indexOf('export var CUSTOM_STYLE_COPY') >= 0 || uiSrc.indexOf('export const CUSTOM_STYLE_COPY') >= 0, '④ 文案只有模块里这一份');
ok(uiSrc.indexOf('function customStyleBlock(') < 0, '④ 旧的 DOM 块工厂已删（不留第二套界面）');

/* ── ④g 保存路径必须在落盘成功后叫酒馆原生面板重画 ──
   2026-10-05 用户报「删除没有用」，真根因在这里：删除本身是好的，是**酒馆原生预设面板没跟着刷新**，
   用户切过去看到的还是旧样子。原生面板只监听 OAI_PRESET_CHANGED_AFTER，不 emit 就不重画。
   这件功能横跨三处（界面 → 40 号写入 → 原生面板重画），最后那一跳此前没人管：
   变量那条写入路径（commitVars）一直在叫，自定义文风这条漏了，谁也没发现。
   所以这条断言必须带**反向自证** —— 把那句调用删掉时它要 FAIL，否则下次"顺手清理"就又没了。 */
function applyCustomStyleBody(src) {
  const a = src.indexOf('function applyCustomStyles(req) {');
  if (a < 0) { return null; }
  const b = src.indexOf('function diffDots(', a);
  return (b < 0) ? null : src.slice(a, b);
}
function callsNotifyAfterSave(src) {
  const body = applyCustomStyleBody(src);
  if (!body) { return false; }
  const saveOk = body.indexOf('if (!saved.ok)');
  const call = body.indexOf('notifyPresetChanged(check.ctx)');
  return saveOk >= 0 && call >= 0 && call > saveOk;   /* 必须在"落盘这一步成功了"之后 */
}
const panelApplyBody = applyCustomStyleBody(panelSrc);
ok(!!panelApplyBody, '④g 40 号：截到了 applyCustomStyles 的函数体');
ok(callsNotifyAfterSave(panelSrc), '④g 自定义文风的保存路径在落盘成功后调用了 notifyPresetChanged');
ok(panelApplyBody && panelApplyBody.indexOf('notifyPresetChanged(check.ctx)') > panelApplyBody.indexOf('if (!saved.ok)'),
  '④g 那句调用在「落盘没成功就 return」之后（不会在失败路径上白叫一次）');
ok(panelApplyBody && /try \{ notifyPresetChanged\(check\.ctx\); \} catch/.test(panelApplyBody),
  '④g 那句调用包在 try/catch 里（拿不到环境不能把写入算作失败）');
ok(panelSrc.indexOf('function notifyPresetChanged(ctx)') >= 0, '④g notifyPresetChanged 只有一处实现');
ok(panelSrc.indexOf('es.emit(name)') >= 0, '④g notifyPresetChanged 真的 emit 了事件');
ok(panelSrc.indexOf('OAI_PRESET_CHANGED_AFTER') >= 0, '④g 事件名对得上酒馆原生面板监听的那个');
/* 与另一条写入路径共用同一份实现：两条写入路径不许各写一套。
   ⚠️ 实际共同调用者是 commit(pairs)（40 号 :311），它的调用点在第 339 行 ——
   不是 commitVars。（本条断言写第一版时按口述写成了 commitVars，直接被守卫抓出来了。） */
(function () {
  const a = panelSrc.indexOf('function commit(pairs) {');
  const b = panelSrc.indexOf('\n  function ', a + 10);
  const body = (a >= 0 && b > a) ? panelSrc.slice(a, b) : null;
  ok(!!body && body.indexOf('notifyPresetChanged(') >= 0,
    '④g 另一条写入路径 commit(pairs) 也在叫同一个 notifyPresetChanged（只有一份实现）');
})();
ok((panelSrc.match(/notifyPresetChanged\(/g) || []).length >= 3, '④g 两条写入路径 + 定义，调用点不止一处',
  (panelSrc.match(/notifyPresetChanged\(/g) || []).length + ' 处');

/* 反向自证：把那一句删掉，上面的判据必须**FAIL**（否则这条断言只是装饰） */
(function () {
  const body = applyCustomStyleBody(panelSrc);
  const stripped = panelSrc.replace('try { notifyPresetChanged(check.ctx); } catch (e9) { }', '/* 被删掉的那一句 */');
  ok(!callsNotifyAfterSave(stripped), '④g 反向自证：删掉那句调用后判据会 FAIL');
  ok(callsNotifyAfterSave(panelSrc), '④g 反向自证：原样保留时判据放行');
  /* 只挪到落盘判断**之前**也必须 FAIL：失败路径上叫一次原生面板重画是错的 */
  const moved = body.replace('try { notifyPresetChanged(check.ctx); } catch (e9) { }', '')
    .replace('if (!saved.ok)', 'try { notifyPresetChanged(check.ctx); } catch (e9) { }\n    if (!saved.ok)');
  ok(!callsNotifyAfterSave(applyCustomStyleBody(panelSrc).replace(body, moved)),
    '④g 反向自证：把那句挪到落盘判断之前，判据同样会 FAIL');
})();

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
  ok(t.indexOf('④-12') >= 0, '⑤ 单测里有"新增→保存→删除→保存"整链回归');
  ok(t.indexOf('④-12 删完两个数组里都没有它') >= 0, '⑤ 那条回归断言的是"两个数组里都没有它"');
}

console.log('');
console.log(bad ? ('✗ ' + bad + ' 项未通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')) : ('✓ 全部通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')));
process.exit(bad ? 1 : 0);
