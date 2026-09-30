#!/usr/bin/env node
/**
 * 面板「舞台」移动端守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 2026-09-28 有用户反馈：iPhone 上点我们的按钮没反应（面板不出来），
 * 但「🛡 反截断」那只按钮是正常的 —— 说明点击通道没问题，坏的是「面板的出现」。
 * 调查结论（见 docs/交接.md 第四十轮）：
 *   酒馆给 html 上了变换（public/style.css:139-144）⇒ fixed 的定位参考是 html 盒子；
 *   窄屏酒馆又把 body 钉住（public/css/mobile-styles.css:98-102）⇒ html 盒高塌成 0；
 *   舞台 top:0;bottom:0 因此归零，抽屉（高=舞台的 78%）跟着只剩一条细线
 *   （真机记录：舞台=[0,0,390,0]、面板=[317,171,643,1]，30-皮肤管理.js:229-231）。
 *   桌面宽屏酒馆的移动样式不生效、body 高度锁死，所以永远碰不到。
 * 修法三件套，这里逐条钉死：
 *   ① 舞台高度下限**内联**写进四个面板（内联优先级最高，皮肤/注入顺序压不住）；
 *   ② 兜底皮肤 base.css 的同名规则不得再写 min-height:0；
 *   ③ 窄屏判定加上「body 被钉住 = 已进单栏」这条**酒馆自己的**信号
 *      （旧判定靠的「小锁被隐藏」在 1.13 源码里已经不存在了）。
 *
 * 用法：node build/verify-panel-mobile.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';

const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-panel-mobile.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));

const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const codeOf = (kw) => strip(String((scripts.find(s => String(s.name).indexOf(kw) >= 0) || {}).content || ''));

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};
const hasMinHeight = (code) => /style\.minHeight = '100vh'/.test(code) && /style\.minHeight = '100dvh'/.test(code);
const hasSignal = (code) => /getComputedStyle\(HDOC\.body\)\.position === 'fixed'/.test(code);
const hasHome = (code) => /function bringViewportHome/.test(code) && /HOST\.scrollTo\(0, 0\)/.test(code);

console.log('=== 面板舞台移动端验证（' + path.basename(p) + '） ===');

/* ① 四个面板：舞台高度下限必须内联在 buildPanel 里 */
[['皮肤管理', '30 号'], ['预设设置', '40 号'], ['引导', '50 号'], ['压缩', '60 号']].forEach(([kw, label]) => {
  const code = codeOf(kw);
  ok(code.length > 0, '① 产物里有「' + kw + '」脚本');
  ok(hasMinHeight(code), '① ' + label + '：舞台高度下限已内联（100vh + 100dvh 两行都在）');
});

/* ② 兜底皮肤：同名舞台规则不得再写 min-height:0（皮肤管理没跑时三个面板靠它） */
let baseCss = '';
try { baseCss = fs.readFileSync(path.join(path.dirname(p), '..', 'src', 'skin', 'base.css'), 'utf8'); } catch (e) { }
if (!baseCss) {
  /* 产物里没有源路径可依时退回仓库根目录（本守卫只在仓库内跑） */
  baseCss = fs.readFileSync(path.join(path.dirname(p), '..', 'src', 'skin', 'base.css'), 'utf8');
}
const stageRule = baseCss.match(/html:not\(\[data-kami-skin\]\) \.kami-root\[data-kami-comp="panel"\]\s*\{[\s\S]*?\}/) || [];
ok(stageRule.length > 0, '② base.css 里找得到舞台规则');
ok(stageRule.join('').indexOf('min-height: 0') < 0 && /min-height:\s*100dvh/.test(stageRule.join('')),
  '② base.css 的舞台不再写 min-height:0（改成 100vh + 100dvh 两行）');

/* ③ 窄屏判定：body 被钉住 = 单栏（三个有自己判定的脚本都要加上） */
[['皮肤管理', '30 号'], ['预设设置', '40 号'], ['压缩', '60 号']].forEach(([kw, label]) => {
  const code = codeOf(kw);
  ok(hasSignal(code), '③ ' + label + '：窄屏判定加了「body 被钉住」这条酒馆自己的信号');
});

/* ④ 打开时把可视窗口带回原点（四个面板都要有） */
[['皮肤管理', '30 号'], ['预设设置', '40 号'], ['引导', '50 号'], ['压缩', '60 号']].forEach(([kw, label]) => {
  const code = codeOf(kw);
  ok(hasHome(code), '④ ' + label + '：打开面板时把页面滚回原点');
});

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '面板舞台移动端验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
