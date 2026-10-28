// 消息挂载验证：在真实酒馆里给消息内的 [data-kami-mount] 标记挂 Shadow DOM，再触发酒馆重绘，
// 看挂载会不会丢、能否由 MutationObserver 自动重挂、兜底文字是否被 Shadow DOM 自动遮住、载荷能否从聊天数据读出。
// 前提：最后一条 AI 消息是 [mock:mount-probe] 的回复（先跑 chat.mjs "探针 [mock:mount-probe]"）
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForSelector('#send_textarea'); await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) {
    await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name))));
  }
});
await page.waitForTimeout(3000);
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (x !== undefined && !c ? '  ← ' + x : '')); };

/* 极简挂载服务原型：观察 #chat，给新出现的标记挂 Shadow DOM，载荷从 ctx.chat[mesid].mes 原文里取 */
await page.evaluate(() => {
  const ctx = () => window.SillyTavern.getContext();
  window.__kamiMounts = 0;
  function payloadFor(marker) {
    const mes = marker.closest('.mes'); const id = mes && Number(mes.getAttribute('mesid'));
    const raw = (ctx().chat[id] || {}).mes || '';
    const m = /data-kami-payload="([^"]*)"/.exec(raw);
    return m ? atob(m[1]) : null;
  }
  function mountAll(root) {
    root.querySelectorAll('[data-kami-mount="probe"]').forEach((el) => {
      if (el.shadowRoot) { return; }
      const sr = el.attachShadow({ mode: 'open' });
      sr.innerHTML = '<span data-mounted>已挂载 · 载荷=' + payloadFor(el) + '</span>';
      window.__kamiMounts++;
    });
  }
  mountAll(document.getElementById('chat'));
  new MutationObserver(() => mountAll(document.getElementById('chat'))).observe(document.getElementById('chat'), { childList: true, subtree: true });
});
const read = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('#chat [data-kami-mount="probe"]')].pop();
  if (!el) { return { found: false }; }
  const r = el.getBoundingClientRect();
  return { found: true, shadow: !!el.shadowRoot, text: el.shadowRoot && el.shadowRoot.textContent, visibleText: el.innerText, h: Math.round(r.height), mounts: window.__kamiMounts };
});
let s = await read();
ok(s.found && s.shadow, '标记存在且挂上了 Shadow DOM', JSON.stringify(s));
ok(s.text && s.text.includes('载荷={"a":1}'), '载荷从聊天原始数据读出（base64 解码）', s.text);
ok(!/兜底文字A/.test(s.visibleText || ''), '挂上 Shadow DOM 后兜底文字自动不显示', s.visibleText);

/* 重绘 1：重新加载当前聊天（整段重绘） */
const m0 = s.mounts;
await page.evaluate(() => window.SillyTavern.getContext().reloadCurrentChat());
await page.waitForTimeout(3000);
s = await read();
ok(s.found && s.shadow && s.mounts > m0, '重新加载聊天后，MutationObserver 自动重挂', JSON.stringify(s));

/* 重绘 2：编辑这条消息并保存（酒馆重绘单条消息） */
const m1 = s.mounts;
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext(); const id = ctx.chat.length - 1;
  ctx.chat[id].mes = ctx.chat[id].mes.replace('兜底文字A', '兜底文字A（编辑过）');
  ctx.updateMessageBlock(id, ctx.chat[id]);
});
await page.waitForTimeout(1500);
s = await read();
ok(s.found && s.shadow && s.mounts > m1, '单条消息重绘（updateMessageBlock）后自动重挂', JSON.stringify(s));
console.log('\n结果：' + pass + ' / ' + (pass + fail));
await b.close();
