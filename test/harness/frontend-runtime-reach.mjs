#!/usr/bin/env node
/**
 * 正则前端自带建元素小工具的回归（2026-11-04 起；原 2026-10-27「正则前端取运行库」）：node test/harness/frontend-runtime-reach.mjs
 * ------------------------------------------------------------
 * 背景：正则前端（思维链 / 搜索资料 / 行动选项，跑在酒馆助手的**消息 iframe** 里）以前从酒馆主页面的旧运行库
 * KamiRuntime 取组件核心 createKamiUi（沿父窗口链往上找，2026-10-27 还因为没找父窗口整块渲染不出来）。
 * 2026-11-04 旧运行库删掉，@@KAMI_UI@@ 改为整段内联 src/ui/element.js——正则前端不再依赖任何运行库。
 *
 * 钉住三件事：
 *   ① 内联出来的 createKamiUi(doc).element() 建元素、打 data-kami-ui / data-kami-card-role 标记（兜底样式按它们写）
 *   ② 不再沿父窗口链找运行库，也不提 KamiRuntime
 *   ③ 端到端：真实的三个正则前端放进**没有任何运行库**的页面里照样渲染、没有报错
 * 不依赖浏览器（jsdom）。
 */
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { expandUi, expandForPreview } from '../../build/kami-doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (extra === undefined ? '' : '  ← ' + extra)); }
};

console.log('=== 正则前端自带建元素小工具 ===');

const SHIM = expandUi(ROOT, '/* @@KAMI_UI@@ */');
{ /* ① element() */
  const dom = new JSDOM('<!doctype html><body></body>');
  const ctx = vm.createContext({ document: dom.window.document, URL: dom.window.URL });
  vm.runInContext(SHIM, ctx);
  const r = vm.runInContext(`(function () {
    var ui = createKamiUi(document);
    var btn = ui.element('button', 'kami-btn', '确定');
    var card = ui.element('div', 'kami-card', ['甲', ui.element('span', '', '乙')]);
    var choice = ui.element('button', 'kami-card');
    var link = ui.element('a', '', '链接', { href: 'javascript:alert(1)' });
    var bad = null; try { ui.element('div', '', '', { onclick: 'x' }); } catch (e) { bad = e.message; }
    return { btn: [btn.type, btn.textContent, btn.getAttribute('data-kami-ui')], card: [card.textContent, card.getAttribute('data-kami-ui'), card.getAttribute('data-kami-card-role')],
      choice: [choice.getAttribute('data-kami-ui'), choice.getAttribute('data-kami-card-role')], link: link.hasAttribute('href'), bad: bad };
  })()`, ctx);
  ok(JSON.stringify(r.btn) === JSON.stringify(['button', '确定', 'button']), '① 按钮：type=button、文字、data-kami-ui', JSON.stringify(r.btn));
  ok(JSON.stringify(r.card) === JSON.stringify(['甲乙', 'card', 'container']), '① 容器卡：子节点、data-kami-ui=card、data-kami-card-role=container', JSON.stringify(r.card));
  ok(JSON.stringify(r.choice) === JSON.stringify(['choiceCard', 'choice']), '① 按钮做的卡是选择卡', JSON.stringify(r.choice));
  ok(r.link === false && /禁止执行代码/.test(r.bad || ''), '① 不安全的网址与事件属性被拦下', JSON.stringify([r.link, r.bad]));
}

{ /* ② 不再找运行库 */
  ok(!/KamiRuntime|\.parent\b/.test(SHIM.replace(/\/\*[\s\S]*?\*\//g, '')), '② 内联的小工具不提 KamiRuntime、不沿父窗口链找东西');
}

{ /* ③ 端到端：三个正则前端，页面上没有任何运行库 */
  const payloads = {
    options: JSON.stringify([
      { title: '推开门', type: '行动', content: '推开门走进去。' },
      { title: '先听一听', type: '信息', content: '在门外听一听。' }
    ]),
    think: '## 场景确认\n深夜的废屋。',
    search: '范围：克苏鲁神话\n- 印斯茅斯是虚构小镇。 [1]\n[1] https://zh.wikipedia.org/wiki/Innsmouth 印斯茅斯'
  };
  for (const name of ['options', 'think', 'search']) {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
    const dom = new JSDOM(expandForPreview(ROOT, name, payloads[name]), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
    await new Promise((r) => setTimeout(r, 200));
    const doc = dom.window.document;
    /* 搜索资料前端从酒馆的楼层读原始数据，离线时停在「读取中」——能走到这一步（adopt 之后）就说明小工具够用 */
    const want = { options: '先听一听', think: '深夜的废屋', search: '读取中' }[name];
    const shown = (doc.body.textContent || '').includes(want);
    const cards = doc.querySelectorAll('.kami-card').length;
    dom.window.close();
    ok(errors.length === 0 && shown && (name !== 'options' || cards === 2), '③ ' + name + ' 前端在没有运行库的页面里渲染出来、没有报错',
      'shown=' + shown + ' cards=' + cards + ' errors=' + errors.slice(0, 2).join(' | '));
  }
}

console.log('\n结果：' + pass + ' / ' + (pass + fail) + ' 通过');
process.exit(fail ? 1 : 0);
