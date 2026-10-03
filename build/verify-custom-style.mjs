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
const uiSrc = read('src/scripts/_custom-style-ui.js');
const docSrc = read('build/kami-doc.mjs');

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

/* ── ④ 两个面板的接线：各自只挂一次，不许自己碰预设 ── */
ok(guideSrc.indexOf('customStyleBlock(') >= 0, '④ 50 号调用了共享模块');
ok(guideSrc.indexOf('api: HOST.KamiPreset') >= 0, '④ 50 号把 KamiPreset 注入给模块（自己不去调）');
ok(panelSrc.indexOf('customStyleBlock(') >= 0, '④ 40 号调用了共享模块');
ok(panelSrc.indexOf('api: { customStyles') >= 0, '④ 40 号把自己的两个方法注入给模块（同一次调用栈，不跨层互调）');
/* 50 本来就会直读 prompt_order（liveEnabledMap 就是），所以这里不能按"出现字符串"判，
   要按**写口**判：不许出现任何写盘/写预设的调用。 */
ok(guideSrc.indexOf('update_oai_preset') < 0, '④ 50 号没有自己去点酒馆的保存按钮');
ok(guideSrc.indexOf('savePresetFile') < 0, '④ 50 号没有自己写预设文件');
ok(guideSrc.indexOf('saveSettingsDebounced') < 0, '④ 50 号没有自己写酒馆设置');
ok(guideSrc.indexOf('replacePreset(') < 0, '④ 50 号没有碰被禁的预设 API');
note('④ 的「50 不碰预设」是按写口 grep 判的，能挡住直接下手，挡不住把活拆碎了绕过去');

/* ── ④c 只许有一份实现（用户 2026-10-02 点名的硬要求）──
   判据不是"看起来像"，而是四条一起：模块存在且自洽、两个脚本都留了同一个占位符、
   两个脚本都没有自己的第二份实现、内联后各脚本里模块恰好出现一次。 */
ok(fs.existsSync(path.join(ROOT, 'src/scripts/_custom-style-ui.js')), '④c 共享模块文件存在');
const placeholders = ['/* @@KAMI_CUSTOM_STYLE_UI@@ */'];
ok(count(panelSrc, placeholders[0]) === 1, '④c 40 号留了恰好一个模块占位符', String(count(panelSrc, placeholders[0])));
ok(count(guideSrc, placeholders[0]) === 1, '④c 50 号留了恰好一个模块占位符', String(count(guideSrc, placeholders[0])));
ok(count(uiSrc, placeholders[0]) === 0, '④c 模块自己不含那个占位符（否则内联会自我复制）');
/* 两个脚本里都不许再有第二份实现：文案对象、状态机、DOM 构建、CSS 常量 */
for (const [label, needle] of [['文案对象', 'CUSTOM_STYLE_COPY = {'], ['状态机 csState', 'var csState'],
  ['DOM 构建 csPaint', 'function csPaint'], ['编辑器 csForm', 'function csForm'], ['样式常量', 'CUSTOM_STYLE_CSS = [']]) {
  ok(panelSrc.indexOf(needle) < 0, '④c 40 号里没有第二份' + label, needle);
  ok(guideSrc.indexOf(needle) < 0, '④c 50 号里没有第二份' + label, needle);
}
ok(count(uiSrc, 'CUSTOM_STYLE_COPY = {') === 1, '④c 文案对象在模块里只有一份');
ok(count(uiSrc, 'function customStyleBlock(') === 1, '④c 模块只导出一个块工厂');
/* 全仓唯一性：文案对象与块工厂只许出现在模块里 */
const copySites = allSrc.filter(f => f.text.indexOf('CUSTOM_STYLE_COPY = {') >= 0).map(f => f.rel);
ok(copySites.length === 1 && copySites[0].indexOf('_custom-style-ui.js') >= 0,
  '④c CUSTOM_STYLE_COPY 全仓只有一处定义', copySites.join(', ') || '一处都没有');
const factorySites = allSrc.filter(f => f.text.indexOf('function customStyleBlock(') >= 0).map(f => f.rel);
ok(factorySites.length === 1 && factorySites[0].indexOf('_custom-style-ui.js') >= 0,
  '④c customStyleBlock 全仓只有一处定义', factorySites.join(', ') || '一处都没有');
/* 两个面板都要注入模块自带的样式，否则同一块 UI 两边长相会分叉 */
ok(panelSrc.indexOf('CUSTOM_STYLE_CSS') >= 0, '④c 40 号注入了模块样式');
ok(guideSrc.indexOf('CUSTOM_STYLE_CSS') >= 0, '④c 50 号注入了模块样式');
/* 构建侧：占位符得有人展开，否则内联根本不会发生 */
ok(docSrc.indexOf('CUSTOM_STYLE_UI_MARK') >= 0, '④c build/kami-doc.mjs 里有模块占位符常量');
ok(docSrc.indexOf('expandCustomStyleUi') >= 0, '④c build/kami-doc.mjs 里有展开函数');
ok(/expandPanelGestures[\s\S]{0,600}expandCustomStyleUi\(root, code\)/.test(docSrc),
  '④c 展开函数挂在 expandPanelGestures 里（build.mjs 与 server.mjs 都只调它）');
/* 模块自身的内联前提：与 preset-parse.mjs 同一条规则 */
ok(uiSrc.indexOf('import ') < 0, '④c 模块零 import（内联前提）');
ok(uiSrc.split('\n').filter(l => /^\s+export\s/.test(l)).length === 0, '④c 模块没有缩进的 export');
ok(uiSrc.split('\n').filter(l => l.startsWith('export ')).length >= 2, '④c 模块有行首 export 可去');

/* ── ④d mount 的实参必须是"专属容器"，不许是页面级容器 ──
   2026-10-03 真机回归：两个面板都曾把**整页容器**（40 的 pane / 50 的 panelBody）直接传进
   csBlock.mount()，而模块的 mount 会先清空容器再重画 → 预设自带的文风刚画完就被整片抹掉，
   用户看到的是"写作指导读不出预设自带的文风了"。
   光靠注释提醒挡不住下一次，所以这里把**这一类错误**钉死：
     (a) 实参名不许是任何页面级容器名；
     (b) 实参必须是紧邻几行内新建的 div（类名恰好 kami-cs-host）；
     (c) 挂载前必须先把这个专属容器 appendChild 进页面容器。
   顺带把"为什么会踩"也钉住：模块的 mount 确实会清空容器（清空逻辑还在，规则就还得在）。 */
const PAGE_CONTAINERS = ['pane', 'panelBody', 'panelDrop', 'panelRoot', 'body', 'document', 'HDOC'];
function mountArgAudit(src, label) {
  const hits = [...src.matchAll(/csBlock\.mount\(\s*([A-Za-z_$][\w$]*)\s*\)/g)];
  ok(hits.length === 1, label + '：恰好一处 csBlock.mount(变量)', hits.length + ' 处');
  if (hits.length !== 1) { return; }
  const arg = hits[0][1];
  const at = hits[0].index;
  ok(PAGE_CONTAINERS.indexOf(arg) < 0, label + '：mount 的实参不是页面级容器', arg);
  const before = src.slice(Math.max(0, at - 600), at);
  const decl = new RegExp('var\\s+' + arg + "\\s*=\\s*[\\w$.]+\\(\\s*'div'\\s*,\\s*'kami-cs-host'\\s*\\)");
  ok(decl.test(before), label + '：实参是紧邻新建的 kami-cs-host 专属容器', arg);
  const app = before.match(new RegExp('([\\w$.]+)\\.appendChild\\(\\s*' + arg + '\\s*\\)'));
  ok(!!app, label + '：挂载前先把专属容器 appendChild 进页面容器');
  if (app) { ok(PAGE_CONTAINERS.indexOf(app[1].split('.').pop()) >= 0, label + '：appendChild 的目标是页面容器', app[1]); }
}
mountArgAudit(panelSrc, '④d 40 号');
mountArgAudit(guideSrc, '④d 50 号');
/* 为什么会踩：模块的 mount 会清空容器 —— 这条规则的前提，前提没了规则也该重审 */
ok(uiSrc.indexOf('root = container') >= 0, '④d 模块的 mount 接收容器（前提仍在）');
ok(uiSrc.indexOf('while (root.firstChild) { root.removeChild(root.firstChild); }') >= 0,
  '④d 模块确实会清空传进来的容器（这就是必须传专属容器的原因）');
/* 反向自证：这套判据必须能抓住"出过事的那种写法"，否则它只是装饰 */
(function () {
  const mountRe = /csBlock\.mount\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  const badHits = [..."csBlock.mount(pane);".matchAll(mountRe)];
  ok(badHits.length === 1 && PAGE_CONTAINERS.indexOf(badHits[0][1]) >= 0,
    '④d 反向自证：判据能抓住 csBlock.mount(pane) 这种写法');
  const goodHits = [..."var csHost = mk('div', 'kami-cs-host'); csBlock.mount(csHost);".matchAll(mountRe)];
  ok(goodHits.length === 1 && PAGE_CONTAINERS.indexOf(goodHits[0][1]) < 0,
    '④d 反向自证：判据不会误伤 csBlock.mount(csHost)');
})();
note('④d 是按源码形态判的：能挡住"顺手把 pane 传进去"，挡不住有人把专属容器再包一层再用同一份 DOM');

/* ── ④b 用户 2026-10-02 点名的两条补丁（现在都长在共享模块里）── */
/* (1) 分区收尾标记读不到 → 硬拒绝写入（功能不可用是看得见的毛病，条目插到分区外是看不见的毛病） */
ok(panelSrc.indexOf('NO_SECTION_END') >= 0, '④b 40 号在收尾标记缺失时硬拒绝写入');
ok(panelSrc.indexOf('if (!sec.closeIdentifier)') >= 0, '④b 那道硬闸就在 applyCustomStyles 里');
ok(uiSrc.indexOf('closeOk') >= 0, '④b 模块按 closeOk 收起写入口（只让看不让改）');
/* (2) 掉出组的条目要有明确提示（否则用户只会看到"我的文风不见了"） */
ok(uiSrc.indexOf('data-kami-cs-orphan') >= 0, '④b 模块给掉组的行打了标记');
ok(uiSrc.indexOf('orphanNote') >= 0, '④b 模块在列表上方给出掉组解释');
ok(uiSrc.indexOf(".orphanNote.replace('{n}'") >= 0, '④b 掉组提示带条数（{n} 会被替换）');

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

/* ── ⑦ 产物层（给了路径才查） ── */
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
  ok(!!panel, '⑦ 产物里有「预设设置」脚本');
  ok(!!guide, '⑦ 产物里有「引导」脚本');
  ok(panel.indexOf('function parseCustomName(') >= 0, '⑦ 解析器内联进了 40 号');
  ok(guide.indexOf('function parseCustomName(') >= 0, '⑦ 解析器内联进了 50 号');
  ok(panel.indexOf('function planCustomStyleWrite(') >= 0, '⑦ 写入计划内联进了 40 号');
  ok(panel.indexOf('applyCustomStyles') >= 0, '⑦ 40 号有 applyCustomStyles');
  /* 共享模块：两个脚本里各内联一份，且**恰好一份** —— 这就是"只许有一份实现"的产物级证据 */
  ok(count(panel, 'function customStyleBlock(') === 1, '⑦ 共享模块内联进 40 号且只有一份', String(count(panel, 'function customStyleBlock(')));
  ok(count(guide, 'function customStyleBlock(') === 1, '⑦ 共享模块内联进 50 号且只有一份', String(count(guide, 'function customStyleBlock(')));
  ok(count(panel, 'CUSTOM_STYLE_COPY = {') === 1, '⑦ 40 号里文案对象只有一份');
  ok(count(guide, 'CUSTOM_STYLE_COPY = {') === 1, '⑦ 50 号里文案对象只有一份');
  ok(count(panel, 'CUSTOM_STYLE_CSS = [') === 1 && count(guide, 'CUSTOM_STYLE_CSS = [') === 1,
    '⑦ 两个脚本里样式常量各只有一份');
  const dupMarker = count(panel, "' | diy_write_style'") + count(guide, "' | diy_write_style'");
  ok(dupMarker <= 2, '⑦ 标记字面量只随解析器各内联一份（40 一份、50 一份）', dupMarker + ' 处');
}

console.log('');
console.log(bad ? ('✗ ' + bad + ' 项未通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')) : ('✓ 全部通过' + (noteN ? ('（另有 ' + noteN + ' 条 NOTE）') : '')));
process.exit(bad ? 1 : 0);
