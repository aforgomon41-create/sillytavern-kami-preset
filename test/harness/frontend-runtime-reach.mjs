#!/usr/bin/env node
/**
 * 正则前端取运行库的回归（2026-10-27）：node test/harness/frontend-runtime-reach.mjs
 * ------------------------------------------------------------
 * 背景：0.93 起组件核心（createKamiUi）只由「🧩 运行库」提供一份，挂在酒馆主页面上；
 * 前端里留的是取用 shim（build/kami-doc.mjs 的 UI_SHIM）。正则前端跑在**消息 iframe** 里，
 * 那里没有 HOST，本窗口也没有 KamiRuntime —— 原 shim 只看这两处，于是消息里的
 * 行动选项整块渲染不出来（抛「运行库未加载」）。现在 shim 会沿父窗口链往上找。
 *
 * 钉住四件事：
 *   ① shim 能从父窗口 / 祖父窗口取到运行库
 *   ② 父窗口跨域（访问抛错）时不连带崩，最终给出「运行库未加载」的人话错误
 *   ③ 真的哪儿都没有运行库时照样报人话错误（不静默）
 *   ④ 端到端：真实的行动选项前端放进「父窗口挂着运行库」的 iframe 里能渲染出选项
 * 不依赖浏览器（jsdom）。
 */
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { expandUi, expandForPreview } from '../../build/kami-doc.mjs';
import { createKamiUi } from '../../src/ui/core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra === undefined ? '' : '  ← ' + extra)); }
};

const SHIM = expandUi(ROOT, '/* @@KAMI_UI@@ */\n/* @@KAMI_UI_CSS_JS@@ */');
const RT = { createKamiUi: () => ({ tag: 'rt' }), KAMI_UI_CSS: '.kami-x{}' };

/* 在沙箱里跑 shim：window 由用例自己造（模拟 iframe 的 parent 链） */
function runShim(win) {
  const ctx = vm.createContext({ window: win });
  vm.runInContext(SHIM, ctx);
  let value = null, error = null;
  try { value = vm.runInContext('createKamiUi(null)', ctx); } catch (e) { error = e; }
  return { value, error, css: vm.runInContext('KAMI_UI_CSS', ctx) };
}
function frame(parent, extra) {
  const w = Object.assign({}, extra || {});
  w.parent = parent || w;
  if (!parent) { w.parent = w; }
  return w;
}

console.log('=== 正则前端取运行库 ===');

{ /* ① 父窗口 / 祖父窗口 */
  const host = frame(null, { KamiRuntime: RT });
  const r1 = runShim(frame(host));
  ok(!r1.error && r1.value && r1.value.tag === 'rt', '① 消息 iframe 能从父窗口取到运行库', r1.error && r1.error.message);
  ok(r1.css === '.kami-x{}', '① 基础样式 shim 同样能从父窗口取到');
  const r2 = runShim(frame(frame(host)));
  ok(!r2.error && r2.value && r2.value.tag === 'rt', '① 嵌套两层也能取到（祖父窗口）', r2.error && r2.error.message);
}

{ /* ② 父窗口跨域：访问 KamiRuntime 抛错 */
  const crossOrigin = {};
  Object.defineProperty(crossOrigin, 'KamiRuntime', { get() { throw new Error('SecurityError: cross-origin'); } });
  crossOrigin.parent = crossOrigin;
  const r = runShim(frame(crossOrigin));
  ok(r.error && /运行库未加载/.test(r.error.message), '② 父窗口跨域时不连带崩，给出「运行库未加载」', r.error && r.error.message);
  ok(r.css === '', '② 基础样式 shim 跨域时安静返回空串');
}

{ /* ③ 哪儿都没有 */
  const r = runShim(frame(frame(null)));
  ok(r.error && /运行库未加载/.test(r.error.message), '③ 没有运行库时报人话错误', r.error && r.error.message);
}

{ /* ④ 端到端：真实行动选项前端 */
  const payload = JSON.stringify([
    { title: '推开门', type: '行动', content: '推开门走进去。' },
    { title: '先听一听', type: '信息', content: '在门外听一听。' }
  ]);
  async function render(withParentRuntime) {
    let html = expandForPreview(ROOT, 'options', payload);
    if (withParentRuntime) {
      /* jsdom 不执行 iframe srcdoc，这里把 window.parent 换成一个挂着真组件核心的「酒馆主页面」 */
      html = html.replace('<head>', '<head><script>(function(){var host={KamiRuntime:{createKamiUi:window.__kamiCore}};' +
        'Object.defineProperty(window,"parent",{configurable:true,get:function(){return host;}});})();</script>');
    }
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(win) { win.__kamiCore = createKamiUi; }
    });
    await new Promise((r) => setTimeout(r, 200));
    const items = dom.window.document.querySelectorAll('.kami-card').length;
    dom.window.close();
    return { items, errors };
  }
  const good = await render(true);
  ok(good.items === 2 && good.errors.length === 0, '④ 父窗口挂着运行库时，行动选项渲染出 2 个选项',
    'items=' + good.items + ' errors=' + good.errors.slice(0, 2).join(' | '));
  const bad = await render(false);
  ok(bad.errors.some((e) => /运行库未加载/.test(e)), '④ 没有运行库时报人话错误（不静默白板）', bad.errors.slice(0, 2).join(' | '));
}

console.log('\n结果：' + pass + ' / ' + (pass + fail) + ' 通过');
process.exit(fail ? 1 : 0);
