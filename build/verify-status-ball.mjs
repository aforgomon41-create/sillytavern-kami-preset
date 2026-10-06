#!/usr/bin/env node
/**
 * 「状态栏(实验)」悬浮球守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 为什么需要：这个脚本有两件**只在产物里才看得出**的事 ——
 *   ① 默认必须是关的（用户 2026-09-30 点名：实验脚本不许出现在所有人的界面上）；
 *   ② 悬浮球的图标是构建期内联的 data URI。占位符没展开、图标文件被换掉、
 *      或者哪天有人把 base64 直接贴回源码里，构建都照样全绿 —— 只有真机上
 *      看到一颗空白球（或根本没球）才知道。
 * 另外顺手钉住几条结构纪律（不新增类名、不登记按钮、注销要收回东西）。
 *
 * 用法：node build/verify-status-ball.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json，与 verify-frontends.mjs 同规矩）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function newestProduct() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) { return null; }
  const files = fs.readdirSync(dir).filter(f => /^kami-.*\.json$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

let p = process.argv[2];
if (!p) {
  p = newestProduct();
  if (!p) { console.error('用法：node build/verify-status-ball.mjs <产物路径>（dist/ 里也没有产物）'); process.exit(2); }
}
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const entry = scripts.find(s => String(s.name).indexOf('状态栏') >= 0);
const code = String((entry && entry.content) || '');

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 状态栏悬浮球验证（' + path.basename(p) + '） ===');

ok(!!entry, '① 产物里有「状态栏」脚本', entry ? entry.name : '没找到');
ok(entry && entry.enabled === false, '② 默认关闭（实验脚本不许默认出现在所有人界面上）', entry ? 'enabled=' + entry.enabled : '');
ok(entry && /\bv?[0-9]+\.[0-9]+\b/.test(String(entry.name)), '② 名字里带版本号', entry && entry.name);

/* ③ 图标：占位符必须已展开，且内联的字节与 design/icon 里那张 PNG 逐字节一致 */
const iconPath = path.join(ROOT, 'design', 'icon', 'kami-statusbar.png');
ok(fs.existsSync(iconPath), '③ 图标源文件在（design/icon/kami-statusbar.png）');
ok(code.indexOf('@@KAMI_ICON_STATUS@@') < 0, '③ 占位符 @@KAMI_ICON_STATUS@@ 没有残留');
const m = /var ICON_STATUS = "data:image\/png;base64,([A-Za-z0-9+/=]+)";/.exec(code);
ok(!!m, '③ 产物里有 ICON_STATUS 常量（data:image/png;base64,…）');
if (m && fs.existsSync(iconPath)) {
  const embedded = Buffer.from(m[1], 'base64');
  const src = fs.readFileSync(iconPath);
  const h = b => crypto.createHash('sha256').update(b).digest('hex');
  ok(h(embedded) === h(src), '③ 内联的图标与源文件逐字节一致',
    embedded.length + ' B / ' + src.length + ' B');
  ok(embedded.length > 2000 && embedded.slice(1, 4).toString() === 'PNG', '③ 解码出来确实是一张 PNG',
    embedded.slice(0, 4).toString('hex'));
  /* 尺寸：悬浮球 64px，192 的图够 3 倍屏；太大是白烧预设体积。
     注意剪影是等比缩放的，最长边才是 192（实测 192×188），所以只钉最长边。 */
  const w = embedded.readUInt32BE(16), hgt = embedded.readUInt32BE(20);
  ok(Math.max(w, hgt) === 192 && Math.min(w, hgt) >= 140, '③ 图标最长边 192（够 3 倍屏，也不白烧体积）', w + 'x' + hgt);
} else {
  bad += 3;
}

/* ④ 结构纪律：只许用登记过的类名 / 不登记按钮 / 注销要收东西 */
ok(code.indexOf('data-kami-comp\', \'ball\'') >= 0 || code.indexOf('"ball"') >= 0, '④ 根节点下发 data-kami-comp="ball"');
ok(code.indexOf('kami-root') >= 0 && code.indexOf('kami-ball') >= 0 && code.indexOf('kami-ball-img') >= 0,
  '④ 用的是登记过的三个类名（kami-root / kami-ball / kami-ball-img）');
ok(code.indexOf('__hubDefs') < 0, '④ 没往按钮中转站登记（悬浮球不是面板按钮）');
ok(code.indexOf('function teardown') >= 0 && code.indexOf('dropCss') >= 0 && code.indexOf('removeChild(stage)') >= 0,
  '④ 注销会拆 DOM、收样式');
ok(code.indexOf('delete HOST[API_NAME]') >= 0 || code.indexOf('delete HOST[API_NAME];') >= 0,
  '④ 注销会收回全局 API');
/* ⑤ 几何走令牌、外观只吃一个令牌（皮肤可覆盖） */
ok(code.indexOf('--kami-ball-x') >= 0 && code.indexOf('--kami-ball-y') >= 0 && code.indexOf('--kami-ball-size') >= 0,
  '⑤ 位置与直径走几何令牌');
ok(code.indexOf('var(--kami-ball-shadow') >= 0, '⑤ 外观只吃 --kami-ball-shadow（皮肤可覆盖）');
ok(code.indexOf('setPointerCapture') >= 0 && code.indexOf('touch-action:none') >= 0,
  '⑤ 拖动走 pointer 捕获 + touch-action:none（触屏才拖得动）');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '状态栏悬浮球验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
