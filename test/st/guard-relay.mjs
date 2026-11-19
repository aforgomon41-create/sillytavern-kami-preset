// 「🛡 防护」与模型回复、酒馆渠道的配合（真实酒馆）：
//   node test/st/guard-relay.mjs [--mobile]
// 前提：测试酒馆在跑、装了当前构建（见 test/st/README.md）。不需要假模型：本测试拦下酒馆前端发往
//   /api/backends/chat-completions/generate 的请求（这时防护已经改完请求体），读请求、回一段自造的响应。
// 核对：
//   ① 反截断 + 工具声明式上下文同开，模型先调资料工具 kami_context_note、再调传输工具：
//      资料那次调用被丢掉，正文照常还原显示（流式、非流式各一遍）；控制消息点名资料工具不要调
//   ② 酒馆后端不把 tools 发给模型的渠道（Azure；Gemini 开出图；Gemma 3）：两项都跳过、请求原样、回复照常、
//      面板状态行说明原因；普通 Gemini 照常加工具（对照）
// 2026-11-19 审计后加（之前同开时资料调用会吞掉正文；这些渠道上搬运会让模型什么都看不到）
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); };
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
let seen = null;
const BODY_TEXT = '这是从传输函数里还原出来的正文，第' + Date.now() % 1000 + '号。';
await page.route('**/api/backends/chat-completions/generate', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  seen = body;
  const relay = (body.tools || []).map((t) => t.function && t.function.name).find((n) => /^relay_reply_/.test(n || ''));
  const calls = [];
  if (relay) {
    calls.push({ id: 'c0', type: 'function', function: { name: 'kami_context_note', arguments: '{}' } });
    calls.push({ id: 'c1', type: 'function', function: { name: relay, arguments: JSON.stringify({ content: BODY_TEXT }) } });
  }
  /* Gemini（makersuite / vertexai）的回复是 Google 自己的格式：candidates[].content.parts，函数调用是 functionCall 片段 */
  if (body.chat_completion_source === 'makersuite' || body.chat_completion_source === 'vertexai') {
    const parts = relay
      ? [{ functionCall: { name: 'kami_context_note', args: {} } }, { functionCall: { name: relay, args: { content: BODY_TEXT } } }]
      : [{ text: '普通回复。' }];
    const cand = { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }] };
    if (body.stream) { await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: ' + JSON.stringify(cand) + '\n\n' }); }
    else { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cand) }); }
    return;
  }
  if (body.stream) {
    const ev = [];
    if (calls.length) {
      ev.push({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'c0', type: 'function', function: { name: 'kami_context_note', arguments: '' } }] } }] });
      ev.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] } }] });
      ev.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: 'c1', type: 'function', function: { name: relay, arguments: '' } }] } }] });
      const args = JSON.stringify({ content: BODY_TEXT });
      for (let i = 0; i < args.length; i += 12) ev.push({ choices: [{ index: 0, delta: { tool_calls: [{ index: 1, function: { arguments: args.slice(i, i + 12) } }] } }] });
      ev.push({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
    } else {
      ev.push({ choices: [{ index: 0, delta: { role: 'assistant', content: '普通回复。' } }] });
      ev.push({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ev.map((e) => 'data: ' + JSON.stringify(e) + '\n\n').join('') + 'data: [DONE]\n\n' });
  } else {
    const msg = calls.length ? { role: 'assistant', content: null, tool_calls: calls } : { role: 'assistant', content: '普通回复。' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: msg, finish_reason: calls.length ? 'tool_calls' : 'stop' }] }) });
  }
});
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForFunction(() => window.KamiGuard && window.SillyTavern?.getContext, null, { timeout: 90000 });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape');
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
});
await page.waitForTimeout(2500);
const send = async (text) => {
  await page.evaluate((t) => { const el = document.getElementById('send_textarea'); el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('send_but').click(); }, text);
  await page.waitForFunction(() => !document.querySelector('#mes_stop:not([style*="none"])') || getComputedStyle(document.getElementById('mes_stop')).display === 'none', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
};
const lastMes = () => page.evaluate(() => { const m = [...document.querySelectorAll('#chat .mes')].pop(); const c = window.SillyTavern.getContext().chat; const last = c[c.length - 1]; return { dom: m ? m.querySelector('.mes_text').innerText.trim() : '', raw: last && last.mes, user: last && last.is_user, extra: last && last.extra ? Object.keys(last.extra) : [] }; });

for (const stream of [true, false]) {
  await page.evaluate((s) => { const ctx = window.SillyTavern.getContext(); ctx.chatCompletionSettings.stream_openai = s; window.KamiGuard.set({ tool: true, ctx: true, ctxInfo: true, noise: false, obfuscate: false }); }, stream);
  await send('同开测试' + (stream ? '（流式）' : '（非流式）'));
  const tag = stream ? '流式' : '非流式';
  ok(seen && (seen.tools || []).some((t) => t.function.name === 'kami_context_note') && (seen.tools || []).some((t) => /^relay_reply_/.test(t.function.name)), tag + '：请求里两个工具都在');
  const ctl = (seen.messages || []).find((m) => /传输层要求/.test(String(m.content)));
  ok(ctl && /kami_context_note[^\n]*不要调用/.test(ctl.content), tag + '：控制消息点名资料工具不要调用', ctl && ctl.content.split('\n').pop());
  const lm = await lastMes();
  ok(!lm.user && lm.raw === BODY_TEXT, tag + '：模型先调资料工具再调传输工具，正文照常还原', lm);
  ok(lm.dom.includes(BODY_TEXT.slice(0, 10)), tag + '：画面上显示的是正文', lm.dom.slice(0, 60));
  const stt = await page.evaluate(() => window.KamiGuard.status());
  ok(stt.lastTool === 'on' && stt.lastRelay === 'relayed', tag + '：读数 lastTool=on、lastRelay=relayed', stt);
}

/* ② 酒馆后端不转发 tools 的渠道 → 两项都跳过（改的是 oai_settings，测完还原） */
const saved = await page.evaluate(() => { const s = window.SillyTavern.getContext().chatCompletionSettings; s.stream_openai = true; return { src: s.chat_completion_source, gm: s.google_model, img: s.request_images }; });
const CHANNELS = [
  ['Azure', { chat_completion_source: 'azure_openai' }, false],
  ['Gemini 出图', { chat_completion_source: 'makersuite', google_model: 'gemini-2.5-flash-image', request_images: true }, false],
  ['Gemma 3', { chat_completion_source: 'makersuite', google_model: 'gemma-3-27b-it', request_images: false }, false],
  ['普通 Gemini（对照）', { chat_completion_source: 'makersuite', google_model: 'gemini-2.5-pro', request_images: false }, true],
];
for (const [label, patch, toolsKept] of CHANNELS) {
  await page.evaluate((p) => Object.assign(window.SillyTavern.getContext().chatCompletionSettings, p), patch);
  seen = null;
  await send(label + ' 测试');
  ok(seen && seen.chat_completion_source === patch.chat_completion_source, label + '：请求按 ' + patch.chat_completion_source + ' 发出', seen && [seen.chat_completion_source, seen.model, seen.request_images]);
  const names = seen ? (seen.tools || []).map((t) => t.function.name) : [];
  const stt = await page.evaluate(() => window.KamiGuard.status());
  if (toolsKept) {
    ok(names.includes('kami_context_note') && names.some((n) => /^relay_reply_/.test(n)), label + '：照常加了两个工具', names);
    ok(stt.lastTool === 'on' && /^moved:/.test(stt.lastCtx), label + '：读数是 on / moved', stt);
    const lm = await lastMes();
    ok(lm.raw === BODY_TEXT, label + '：Gemini 格式下先调资料工具再调传输工具，正文照常还原', lm);
    continue;
  }
  ok(seen && !names.length, label + '：没加任何工具', names);
  ok(seen && !(seen.messages || []).some((m) => /传输层要求|资料位置/.test(String(m.content))), label + '：没插控制消息和引导语');
  ok(stt.lastCtx === 'skip:no-tools' && stt.lastTool === 'skip:no-tools', label + '：读数是 skip:no-tools', stt);
  ok((await lastMes()).raw === '普通回复。', label + '：回复照常收到');
}
/* 面板要读的是「不转发」那一轮：再按 Azure 发一次 */
await page.evaluate(() => { window.SillyTavern.getContext().chatCompletionSettings.chat_completion_source = 'azure_openai'; });
await send('Azure 再来一次');

/* 面板上的说明：打开面板看两段状态行 */
await page.evaluate(() => window.KamiGuard.open());
await page.waitForTimeout(900);
const readStatus = () => page.evaluate(() => { const r = document.querySelector('kami-layer').shadowRoot; return [...r.querySelectorAll('[data-guard-status]')].map((x) => x.textContent); });
let lines = await readStatus();
if (MOBILE) {
  const all = [];
  for (const kw of ['反截断', '上下文']) {
    await page.evaluate((kw) => { const r = document.querySelector('kami-layer').shadowRoot; const t = [...r.querySelectorAll('[role="tab"]')].find((x) => x.textContent.includes(kw)); t && t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); }, kw);
    await page.waitForTimeout(500);
    all.push(...await readStatus());
  }
  lines = all;
}
ok(lines.some((l) => /反截断|没用上/.test(l) && /Azure/.test(l)) || lines.some((l) => /没用上：当前渠道不把工具发给模型/.test(l)), '面板：反截断状态行说明渠道不转发工具', lines);
ok(lines.some((l) => /没搬：当前渠道不把工具发给模型/.test(l)), '面板：上下文状态行说明渠道不转发工具', lines);
if (process.argv.includes('--shots')) { await page.screenshot({ path: (process.env.ST_ROOT || '/workspace/st-test') + '/guard-relay' + (MOBILE ? '-mobile' : '') + '.png' }); }

await page.evaluate((v) => { Object.assign(window.SillyTavern.getContext().chatCompletionSettings, { chat_completion_source: v.src, google_model: v.gm, request_images: v.img }); window.KamiGuard.reset(); }, saved);
await page.waitForTimeout(2500);
ok(errors.length === 0, '没有页面错误', errors);
console.log(fail ? '★ 失败 ' + fail + ' 项' : '「🛡 防护」回复与渠道验证全部通过（' + pass + ' 项，' + (MOBILE ? '手机 390' : '电脑 1440') + '）');
await b.close(); process.exit(fail ? 1 : 0);
