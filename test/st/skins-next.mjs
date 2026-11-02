// 每套内置皮肤 × 每个配色在真实酒馆里的验证（皮肤制作流程第 5 节）：
//   node test/st/skins-next.mjs [--mobile] [--only=id,id]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包，见 test/st/README.md
// 每一档核对：面板与聊天里的消息前端都换成这套皮肤与配色；面板与消息前端的实际渲染对比度；
//   对白 / 心理描写真的用了皮肤的颜色；声明了环境层（ambient）的皮肤在面板背景里画出了环境层；
//   按下按钮时有动效（皮肤声明了动效模块时）；动效「关闭」后环境层收掉、按下不再出动效；没有页面错误。
import { createRequire } from 'node:module';
import { auditInPage } from '../frontend/browser/audit-lib.mjs';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; if (!c || process.env.VERBOSE) { console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); } };
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|显示|React/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
});
await page.waitForFunction(() => window.KamiDisplay && window.KamiDisplay.manager, null, { timeout: 30000 });
await page.waitForTimeout(2500);

/* 先让假模型回一条带对白、心理描写、专有名词、场景转换和 7 种行动选项的回复，消息前端的审计才有东西可查；收尾时删掉 */
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
const TYPES = ['行动', '性格', '推进', '信息', '搞笑', 'nsfw', '其他'];
const REPLY = ['<content>', '　　夜风穿过窗棂。「外面有人。」一个沙哑的声音停了下来。*他们在说什么？*你摸了摸口袋里的地图，上面圈着【马什旧宅】。', '', '___', '',
  '　　门开了，**老马什**上下打量着你。', '</content>', '<options>', JSON.stringify(TYPES.map((t, i) => ({ title: '选项' + (i + 1), type: t, content: '第 ' + (i + 1) + ' 个行动选项的内容。' }))), '</options>'].join('\n');
if (!(await page.locator('#send_but').isVisible())) {
  await page.evaluate(() => document.getElementById('api_button_openai')?.click());
  await page.waitForSelector('#send_but', { state: 'visible', timeout: 30000 });
}
await fetch(MOCK + '/__mock/reset', { method: 'POST' });
await fetch(MOCK + '/__mock/next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: REPLY }) });
const n0 = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
await page.fill('#send_textarea', '（皮肤测试）');
await page.click('#send_but');
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
await page.waitForFunction(() => { const s = document.getElementById('mes_stop'); return !s || getComputedStyle(s).display === 'none'; }, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const hosts = await page.evaluate(() => document.querySelectorAll('#chat [data-kami-msg-host]').length);
ok(hosts > 0, '准备：聊天里有消息前端（' + hosts + ' 个宿主）', hosts);

const skins = await page.evaluate(() => window.KamiDisplay.manager.list().map((m) => ({ id: m.id, name: m.name, schemes: Object.keys(m.schemes), modules: m.modules || [] })));
const todo = skins.filter((s) => !ONLY.length || ONLY.includes(s.id));
console.log('皮肤：' + todo.map((s) => s.name + '（' + s.id + '）').join('、'));
await page.evaluate(() => window.KamiDisplay.manager.setGlobal({ motion: 'full' }));
await page.evaluate(() => window.KamiDisplay.open());
await page.waitForTimeout(800);

const layer = (fn, arg) => page.evaluate(([src, a]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, a) : null; }, [fn.toString(), arg]);
/* 按下面板里的一个按钮（真的指针事件），返回随后 0.6 秒里动效层上出现的节点数 */
const pressCount = () => layer(async (r) => {
  /* 面板标题栏的关闭按钮：每套皮肤都在、都在屏幕里；只发指针事件不发 click，面板不会真的关掉 */
  const btn = r.querySelector('[data-k="panel"] > [data-k-part="head"] [data-k="icon-button"]');
  if (!btn) { return -1; }
  /* 用 MutationObserver 记下动效层上新加的节点（通用 / 招牌动效）与从隐藏变成显示的节点（碎光的对象池）：
     有些动效一片只活 0.2 秒，轮询容易在主线程忙时错过 */
  let most = 0;
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target;
      if (t.closest && t.closest('[data-k-fx-layer="ambient"]')) { continue; }
      if (m.type === 'childList' && t.hasAttribute && t.hasAttribute('data-k-fx-layer')) { most += m.addedNodes.length; }
      if (m.type === 'attributes' && t.parentElement && t.parentElement.hasAttribute('data-k-fx-layer') && t.style.display !== 'none') { most++; }
    }
  });
  mo.observe(r, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  const bb = btn.getBoundingClientRect();
  const o = { bubbles: true, composed: true, clientX: bb.left + bb.width / 2, clientY: bb.top + bb.height / 2, pointerType: 'mouse', button: 0, isPrimary: true };
  btn.dispatchEvent(new PointerEvent('pointerdown', o)); btn.dispatchEvent(new PointerEvent('pointerup', o));
  await new Promise((res) => setTimeout(res, 600));
  mo.disconnect();
  return most;
});

for (const s of todo) {
  for (const sc of s.schemes) {
    const tag = s.name + ' · ' + sc + (MOBILE ? '（手机）' : '（电脑）');
    const e0 = errors.length;
    await page.evaluate(([id, sc]) => { const m = window.KamiDisplay.manager; m.select(id); m.setScheme(sc); }, [s.id, sc]);
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const ls = document.querySelector('kami-layer').shadowRoot.querySelector('[data-k-surface]');
      const h = document.querySelector('#chat [data-kami-msg-host]');
      const ms = h ? h.shadowRoot.querySelector('[data-k-surface]') : null;
      return { layer: ls && ls.getAttribute('data-k-skin') + '/' + ls.getAttribute('data-k-scheme'), msg: ms && ms.getAttribute('data-k-skin') + '/' + ms.getAttribute('data-k-scheme') };
    });
    ok(st.layer === s.id + '/' + sc && (st.msg === null || st.msg === s.id + '/' + sc), tag + '：面板与消息前端都换上了', st);

    const a1 = await page.evaluate(auditInPage, null);
    ok(a1.failures.length === 0 && a1.checked > 10, tag + '：面板对比度 ' + a1.checked + ' 处', a1.failures.slice(0, 3));
    /* 新前端的宿主不带 data-kami-mount（那是正则留的占位），临时标上再审计（同 message-next） */
    const a2 = await page.evaluate(([src]) => {
      const hs = [...document.querySelectorAll('#chat [data-kami-msg-host], #chat .mes_text[data-kami-msg-body]')];
      hs.forEach((h) => h.setAttribute('data-kami-mount', 'audit'));
      const r = (0, eval)('(' + src + ')')('@mounts');
      hs.forEach((h) => h.removeAttribute('data-kami-mount'));
      return r;
    }, [auditInPage.toString()]);
    ok(a2.failures.length === 0 && a2.checked > 0, tag + '：消息前端对比度 ' + a2.checked + ' 处', a2.failures.slice(0, 3));

    /* 对白 / 心理描写颜色：页面里的正文（酒馆渲染、经 slot 显示）真的用了皮肤给的颜色 */
    const col = await page.evaluate(() => {
      const norm = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
      const q = document.querySelector('#chat [data-k-content] [data-k-part="dialogue"]');
      const t = document.querySelector('#chat [data-k-content] [data-k-part="thought"]');
      const h = document.querySelector('#chat [data-kami-msg-host]');
      const surf = h && h.shadowRoot.querySelector('[data-k-surface]');
      const v = (k) => surf ? getComputedStyle(surf).getPropertyValue(k).trim() : '';
      return { q: q && getComputedStyle(q).color, qWant: v('--k-msg-dialogue') && norm(v('--k-msg-dialogue')), t: t && getComputedStyle(t).color, tWant: v('--k-msg-thought') && norm(v('--k-msg-thought')) };
    });
    ok((!col.q || col.q === col.qWant) && (!col.t || col.t === col.tWant), tag + '：对白 / 心理描写用了皮肤的颜色', col);

    if (s.modules.includes('ambient')) {
      const amb = await layer((r) => { const p = r.querySelector('[data-k="panel"] > [data-k-ornament="surface-backdrop"] > [data-k-fx-layer="ambient"]'); return p ? p.children.length : 0; });
      ok(amb > 0, tag + '：面板背景里有环境层（' + amb + ' 个）', amb);
    }
    if (s.modules.length) {
      const n = await pressCount();
      ok(n > 0, tag + '：按下按钮有动效（' + n + ' 个节点）', n);
    }
    ok(errors.length === e0, tag + '：没有页面错误', errors.slice(e0, e0 + 3));
  }
  /* 动效关闭：环境层收掉、按下不出动效（每套只测一次，用默认配色） */
  if (s.modules.length) {
    await page.evaluate(() => window.KamiDisplay.manager.setGlobal({ motion: 'off' }));
    await page.waitForTimeout(500);
    const amb = await layer((r) => r.querySelectorAll('[data-k-fx-layer="ambient"]').length);
    const n = await pressCount();
    ok(amb === 0 && n === 0, s.name + '：动效「关闭」后环境层收掉、按下不出动效', { amb, n });
    await page.evaluate(() => window.KamiDisplay.manager.setGlobal({ motion: 'full' }));
    await page.waitForTimeout(300);
  }
}

/* 收尾：回到默认皮肤与跟随系统 */
await page.evaluate(() => { const m = window.KamiDisplay.manager; m.select(m.list()[0].id); m.setScheme('auto'); window.KamiDisplay.close(); });
/* 删掉测试发的那两条消息 */
await page.evaluate(async (n) => { const ctx = window.SillyTavern.getContext(); while (ctx.chat.length > n && ctx.deleteLastMessage) { await ctx.deleteLastMessage(); } }, n0);
/* 设置存在酒馆助手的脚本变量里，写盘是异步的：等它写完再关浏览器，不然下一个测试会在别的皮肤下跑 */
await page.waitForTimeout(3000);
const back = await page.evaluate(() => window.KamiDisplay.manager.settings.skin);
ok(back === skins[0].id, '收尾：回到默认皮肤（' + back + '）', back);
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
