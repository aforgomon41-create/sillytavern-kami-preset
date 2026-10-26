#!/usr/bin/env node
/**
 * 运行库组件层（React + Radix）渲染自测
 * ------------------------------------------------------------
 * 为什么要这个文件：
 *   技术栈迁移后，面板界面改用 React + Radix 渲染。而现有的单测全是
 *   「假 DOM + 函数式断言」，React 在那种环境里根本渲染不了 ——
 *   等于组件层没有任何测试保护。这个文件用 jsdom 起一个真 DOM，
 *   加载**产物里的真 bundle**（src/runtime/bundle.js），把每个组件都渲染一遍。
 *
 * 这里测的是「组件层本身」：能不能渲染、类名对不对、Radix 的可访问性角色在不在。
 * 面板业务逻辑另有各面板自己的单测。
 *
 * 用法：node test/harness/runtime-ui.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const bad = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  bad.push(label + (extra === undefined ? '' : '  （' + extra + '）'));
}
const eq = (a, b, label) => ok(a === b, label, '实际 ' + JSON.stringify(a) + ' / 期望 ' + JSON.stringify(b));

/* ── 起一个真 DOM ── */
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
  /* runScripts: 'outside-only' —— 只为拿到 getInternalVMContext()（它要求 jsdom 允许脚本运行）。
     页面自身的 <script> 不会执行，我们只手动 runInContext 跑运行库产物。 */
  runScripts: 'outside-only'
});
const win = dom.window;

/* jsdom 缺的浏览器 API 补上（React 18 / Radix 会用到） */
if (!win.matchMedia) { win.matchMedia = () => ({ matches: false, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } }); }
if (!win.ResizeObserver) { win.ResizeObserver = class { observe() { } unobserve() { } disconnect() { } }; }
if (!win.IntersectionObserver) { win.IntersectionObserver = class { observe() { } unobserve() { } disconnect() { } }; }
if (!win.requestAnimationFrame) { win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16); }
if (!win.cancelAnimationFrame) { win.cancelAnimationFrame = (id) => win.clearTimeout(id); }

/* ── 把产物里的真 bundle 跑起来 ──
   ⚠️ 必须用 jsdom 的 getInternalVMContext()：它把 window 上**全部**浏览器全局
   （HTMLFormElement / HTMLInputElement / Node …）一起注进沙箱。
   手写白名单会漏，Radix 一碰 instanceof HTMLFormElement 就直接 ReferenceError
   （2026-10-26 第一次写这个自测时踩到）。 */
const bundlePath = path.join(ROOT, 'src/runtime/bundle.js');
ok(fs.existsSync(bundlePath), '① 运行库产物存在（src/runtime/bundle.js）');
const code = fs.readFileSync(bundlePath, 'utf8');
const ctx = dom.getInternalVMContext();
if (!ctx.console) { ctx.console = console; }
try {
  vm.runInContext(code, ctx, { timeout: 30000 });
} catch (e) {
  ok(false, '① bundle 在 jsdom 里执行不抛错', e && e.message);
}
const RT = win.KamiRuntime || sandbox.window.KamiRuntime;
ok(!!RT, '① 运行库注册出 KamiRuntime');
if (!RT) { console.log('\n★ 运行库没加载起来，后面全部跳过'); console.log(bad.join('\n')); process.exit(1); }
eq(RT.version, '1.0.0', '① 版本号正确');
ok(!!RT.React && !!RT.createRoot, '① React 与 createRoot 可用');
ok(!!RT.UI && !!RT.UI.Button, '① 组件层可访问');

/* ── 渲染助手 ── */
const h = RT.React.createElement;
function render(el) {
  const box = win.document.createElement('div');
  win.document.getElementById('host').appendChild(box);
  const root = RT.createRoot(box);
  RT.flushSync ? RT.flushSync(() => root.render(el)) : root.render(el);
  return { box, root };
}
function q(box, sel) { return box.querySelector(sel); }
function qa(box, sel) { return Array.from(box.querySelectorAll(sel)); }

/* ── ② 纯表现层 ── */
{
  const { box, root } = render(h('div', null,
    h(RT.UI.Button, { onClick() { } }, '按钮'),
    h(RT.UI.IconButton, { label: '图标' }, '✕'),
    h(RT.UI.Card, { head: { title: '标题', dot: true } }, '正文'),
    h(RT.UI.Badge, { kind: 'info' }, '徽章'),
    h(RT.UI.Chip, null, '芯片'),
    h(RT.UI.Dot, { on: true }),
    h(RT.UI.Note, null, '说明'),
    h(RT.UI.Empty, null, '空'),
    h(RT.UI.Divider),
    h(RT.UI.Grid, null, '网格')
  ));
  eq(qa(box, '.kami-btn').length, 1, '② Button 渲染出 .kami-btn');
  eq(qa(box, '.kami-icon-btn').length, 1, '② IconButton 渲染出 .kami-icon-btn');
  eq(!!q(box, '.kami-card'), true, '② Card 渲染出 .kami-card');
  eq(!!q(box, '.kami-card-title'), true, '② Card 头有标题');
  eq(!!q(box, '.kami-badge'), true, '② Badge 渲染出 .kami-badge');
  eq(!!q(box, '.kami-chip'), true, '② Chip 渲染出 .kami-chip');
  eq(!!q(box, '.kami-dot'), true, '② Dot 渲染出 .kami-dot');
  eq(!!q(box, '.kami-card-note'), true, '② Note 渲染出 .kami-card-note');
  eq(!!q(box, '.kami-empty'), true, '② Empty 渲染出 .kami-empty');
  eq(!!q(box, '.kami-divider'), true, '② Divider 渲染出 .kami-divider');
  eq(!!q(box, '.kami-grid'), true, '② Grid 渲染出 .kami-grid');
  root.unmount();
}

/* ── ③ Radix：分段 / 开关 / 进度（角色由 Radix 提供） ── */
{
  const { box, root } = render(h('div', null,
    h(RT.UI.Segmented, { value: 'a', onValueChange() { }, options: [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }] }),
    h(RT.UI.SwitchToggle, { checked: true, onCheckedChange() { } }),
    h(RT.UI.Bar, { value: 42 })
  ));
  eq(qa(box, '.kami-seg-item').length, 2, '③ Segmented 渲染 2 个 .kami-seg-item');
  eq(!!q(box, '[role="radiogroup"]'), true, '③ Segmented 有 radiogroup 角色（Radix）');
  ok(qa(box, '[role="radio"]').length >= 2, '③ Segmented 的每项是 radio（Radix）');
  const sw = q(box, '.kami-switch');
  eq(!!sw, true, '③ Switch 渲染出 .kami-switch');
  eq(sw && sw.getAttribute('role'), 'switch', '③ Switch 有 switch 角色（Radix）');
  eq(sw && sw.getAttribute('aria-checked'), 'true', '③ Switch 勾选态正确');
  const bar = q(box, '.kami-progress');
  eq(!!bar, true, '③ Progress 渲染出 .kami-progress');
  eq(bar && bar.getAttribute('role'), 'progressbar', '③ Progress 有 progressbar 角色（Radix）');
  root.unmount();
}

/* ── ④ Radix：复选框 / 单选 ── */
{
  const { box, root } = render(h('div', null,
    h(RT.UI.Check, { checked: true, onCheckedChange() { }, label: '勾选' }),
    h(RT.UI.Radios, { value: 'x', onValueChange() { }, options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] })
  ));
  const cb = q(box, '.kami-checkbox');
  eq(!!cb, true, '④ Checkbox 渲染出 .kami-checkbox');
  eq(cb && cb.getAttribute('role'), 'checkbox', '④ Checkbox 有 checkbox 角色（Radix）');
  eq(!!q(box, '.kami-radios'), true, '④ Radios 渲染出 .kami-radios');
  ok(qa(box, '[role="radio"]').length >= 2, '④ Radios 的每项是 radio（Radix）');
  root.unmount();
}

/* ── ⑤ Radix：页签 / 折叠 / 手风琴 ── */
{
  const { box, root } = render(h('div', null,
    h(RT.UI.TabsRoot, { value: 't1', onValueChange() { } },
      h(RT.UI.TabsList, null, h(RT.UI.Tab, { value: 't1' }, '一'), h(RT.UI.Tab, { value: 't2' }, '二')),
      h(RT.UI.TabPanel, { value: 't1' }, '面板一')
    ),
    h(RT.UI.Collapse, { open: true, title: '折叠' }, '内容'),
    h(RT.UI.AccordionRoot, { value: 'a1', onValueChange() { } },
      h(RT.UI.AccordionItem, { value: 'a1', title: '手风琴' }, '体')
    )
  ));
  eq(qa(box, '[role="tab"]').length, 2, '⑤ Tabs 渲染 2 个 role=tab（Radix）');
  eq(!!q(box, '[role="tabpanel"]'), true, '⑤ Tabs 有 tabpanel（Radix）');
  eq(!!q(box, '.kami-collapse'), true, '⑤ Collapse 渲染出 .kami-collapse');
  eq(q(box, '.kami-collapse') && q(box, '.kami-collapse').getAttribute('data-kami-open'), '1', '⑤ Collapse 展开态属性正确');
  eq(!!q(box, '.kami-collapse-head'), true, '⑤ Collapse 有折叠头');
  eq(!!q(box, '.kami-accordion'), true, '⑤ Accordion 渲染出 .kami-accordion');
  root.unmount();
}

/* ── ⑥ Radix：弹窗（Portal 到 body）── */
{
  const { box, root } = render(h(RT.UI.Modal, { open: true, title: '测试弹窗', desc: '说明文字' }, '弹窗内容'));
  const dlg = win.document.querySelector('[role="dialog"]');
  eq(!!dlg, true, '⑥ Modal 打开后有 role=dialog（Radix）');
  eq(!!win.document.querySelector('.kami-dialog'), true, '⑥ Modal 带 .kami-dialog 类');
  ok(win.document.body.textContent.includes('测试弹窗'), '⑥ Modal 标题渲染出来');
  root.unmount();
}

/* ── ⑦ 老的组件核心仍然可用（面板没迁完时靠它） ── */
{
  ok(typeof RT.createKamiUi === 'function', '⑦ createKamiUi 仍由运行库提供');
  const ui = RT.createKamiUi(win.document);
  ok(!!ui && typeof ui.element === 'function', '⑦ createKamiUi(doc) 可用');
  const el = ui.element('div', 'kami-root');
  eq(el.className, 'kami-root', '⑦ createKamiUi 造得出元素');
  ok(typeof RT.KAMI_UI_CSS === 'string' && RT.KAMI_UI_CSS.length > 1000, '⑦ 基础样式表跟着运行库下发', String(RT.KAMI_UI_CSS && RT.KAMI_UI_CSS.length) + ' 字符');
}

/* ── 收尾 ── */
try { win.close(); } catch (e) { }
console.log('');
if (fail) {
  console.log('★ 运行库组件层自测失败 ' + fail + ' 项：');
  bad.forEach(b => console.log('   - ' + b));
  console.log('通过 ' + pass + ' / 共 ' + (pass + fail));
  process.exit(1);
}
console.log('运行库组件层（React + Radix）：' + pass + ' 项全过');
