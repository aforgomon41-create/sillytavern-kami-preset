// 长回复流式（用户 2026-11-15 报：流式超过八千字后越来越卡，整个酒馆难以响应）。实机核对：
//   node test/st/stream-next.mjs [--mobile]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了当前构建（见 test/st/README.md）。
// 核对：
//   ① 生成中正文不逐片段标记（酒馆每个片段都整段重写 .mes_text，原来每次重标一遍，整楼多排一次版）；
//   ② 生成中的样式与标记后一致：对白 / 心理描写 / 关键词颜色、段落首字位置（靠内容规则的标签兜底，body-style.ts）；
//   ③ 生成结束后标记补上；
//   ④ 流畅度：同一段 1.2 万字的回复，消息前端开着时生成后半段的帧率不低于关掉时的 75%（关掉 = 酒馆自己的开销）。
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x).slice(0, 600) : '')); };
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper && window.KamiChatFrontend, null, { timeout: 90000 });
await page.waitForTimeout(8000);
await page.keyboard.press('Escape');
await page.evaluate(async () => { const c = window.SillyTavern.getContext(); if (c.characterId === undefined || c.characterId === null) { await c.selectCharacterById(String(c.characters.findIndex((x) => /Seraphina/i.test(x.name)))); } });
await page.waitForTimeout(3000);
if (!(await page.locator('#send_but').isVisible())) { await page.evaluate(() => document.getElementById('api_button_openai')?.click()); await page.waitForSelector('#send_but', { state: 'visible', timeout: 30000 }); }

const para = (i) => '　　第' + i + '段。夜风穿过窗棂，「外面有人。」一个沙哑的声音停了下来。*他们在说什么？*你摸了摸口袋里的地图，上面圈着【马什旧宅】。**老马什**上下打量着你，又看了看门外的雨。';
const reply = (len) => { let s = ''; for (let i = 1; s.length < len; i++) { s += para(i) + '\n\n'; } return '<content>\n' + s + '</content>'; };
const stopShown = () => page.evaluate(() => { const s = document.getElementById('mes_stop'); return !!s && getComputedStyle(s).display !== 'none'; });
const lastChars = () => page.evaluate(() => { const c = window.SillyTavern.getContext(); const m = c.chat[c.chat.length - 1]; return m && !m.is_user ? (m.mes || '').length : 0; });
async function send(len, delayMs) {
  await fetch(MOCK + '/__mock/reset', { method: 'POST' });
  await fetch(MOCK + '/__mock/next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: reply(len), chunk: 8, delayMs }) });
  const n0 = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
  await page.fill('#send_textarea', '（流式测试）');
  await page.click('#send_but');
  await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
}
const waitEnd = () => page.waitForFunction(() => { const s = document.getElementById('mes_stop'); return !s || getComputedStyle(s).display === 'none'; }, null, { timeout: 300000 });
const dropLast = () => page.evaluate(async () => { const c = window.SillyTavern.getContext(); await c.deleteLastMessage(); await c.deleteLastMessage(); });

/* 最新一楼正文的样子：标记数、对白 / 心理描写 / 关键词的颜色与字重、第一段第一个可见字离段落左边多远 */
const look = () => page.evaluate(() => {
  const mes = [...document.querySelectorAll('#chat .mes[is_user="false"]')].pop();
  const t = mes.querySelector('.mes_text');
  /* 段落首字取第二段：第一段生成中开头还连着 <content> 标签（预设的正则要等收尾标签到了才去掉，与本前端无关） */
  const q = t.querySelector('q'), em = t.querySelector('em, i'), st = t.querySelector('strong, b'), p = t.querySelectorAll(':scope > p')[1];
  let x = null;
  if (p) {
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const i = (n.nodeValue || '').search(/[^\s　]/);
      if (i < 0) { continue; }
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      x = Math.round(r.getBoundingClientRect().left - p.getBoundingClientRect().left); break;
    }
  }
  return {
    host: t.hasAttribute('data-kami-msg-body'), marks: t.querySelectorAll('[data-k-part]').length, paras: t.querySelectorAll(':scope > p').length,
    q: q && getComputedStyle(q).color, em: em && getComputedStyle(em).color, emStyle: em && getComputedStyle(em).fontStyle, strong: st && getComputedStyle(st).fontWeight, x
  };
});

/* ①②③ 样式一致：慢一点的流，生成中取一次样，结束后再取一次 */
await send(6000, 25);
await page.waitForFunction(() => { const c = window.SillyTavern.getContext(); const m = c.chat[c.chat.length - 1]; return m && (m.mes || '').length > 2500; }, null, { timeout: 60000 });
const live = await look();
const liveGen = await stopShown();
await waitEnd(); await page.waitForTimeout(1500);
const done = await look();
ok(liveGen && live.host && live.paras > 5, '准备：生成中取到了样（正文由消息前端接管）', { liveGen, ...live });
ok(live.marks < live.paras, '① 生成中正文不逐片段标记（标记 ' + live.marks + ' 处 / 段落 ' + live.paras + '）', live);
ok(done.marks > done.paras, '③ 生成结束后补上标记（' + done.marks + ' 处）', done);
ok(live.q === done.q && live.em === done.em && live.emStyle === done.emStyle && live.strong === done.strong, '② 生成中对白 / 心理描写 / 关键词的样式与标记后一样（标签兜底）', { live, done });
ok(live.x !== null && done.x !== null && Math.abs(live.x - done.x) <= 3, '② 生成中段落首字位置与标记后一样（' + live.x + ' / ' + done.x + ' px）', { live: live.x, done: done.x });
await dropLast(); await page.waitForTimeout(1000);

/* ④ 流畅度：生成后半段（6000 字以后）的帧率，开 / 关消息前端各跑一遍 */
async function fps(on) {
  await page.evaluate((v) => window.KamiChatFrontend.setEnabled(v), on);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const w = window; w.__frames = []; const tick = () => { w.__frames.push(performance.now()); w.__raf = requestAnimationFrame(tick); }; w.__raf = requestAnimationFrame(tick); });
  await send(12000, 20);
  await page.waitForFunction(() => { const c = window.SillyTavern.getContext(); const m = c.chat[c.chat.length - 1]; return m && (m.mes || '').length > 6000; }, null, { timeout: 120000 });
  const t0 = await page.evaluate(() => performance.now());
  const c0 = await lastChars();
  await waitEnd();
  const r = await page.evaluate((t) => { cancelAnimationFrame(window.__raf); const f = window.__frames.filter((x) => x > t); const span = (f[f.length - 1] - f[0]) || 1; return Math.round((f.length - 1) / span * 1000); }, t0);
  const c1 = await lastChars();
  await page.waitForTimeout(1500);
  await dropLast(); await page.waitForTimeout(1000);
  return { fps: r, from: c0, to: c1 };
}
const off = await fps(false);
const on = await fps(true);
ok(on.fps >= off.fps * 0.75, '④ 1.2 万字回复的后半段：消息前端开着 ' + on.fps + ' 帧/秒，关掉 ' + off.fps + ' 帧/秒（开着不低于关掉的 75%）', { on, off });
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
await b.close();
