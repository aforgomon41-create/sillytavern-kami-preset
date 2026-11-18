// 「🛡 防护」脚本在真实酒馆里的验证：
//   node test/st/guard-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包（含「🛡 防护」），见 test/st/README.md
// 核对：按钮条有且只有一颗 🛡 防护、点开是面板（不是开关）；面板四项都在；
//       开关写进脚本变量、刷新后保留；四项对发出去的请求体真的生效（读假模型收到的提示词）；
//       注销后不留 🛡 与全局 API。
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const SHOTS = process.argv.includes('--shots');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
const SHOT_DIR = process.env.ST_ROOT || '/workspace/st-test';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)) : '')); };

const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|防护|React/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

async function load() {
  await page.goto(ST);
  await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
  await page.waitForTimeout(11000);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const ctx = window.SillyTavern.getContext();
    if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
  });
  await page.waitForTimeout(2500);
}
await load();

const inLayer = (fn, arg) => page.evaluate(([src, arg]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, arg) : null; }, [fn.toString(), arg]);
const buttons = () => page.evaluate(() => [...document.querySelectorAll('.qr--button, [data-hub-btn], #TH-script-buttons .menu_button, .qr--buttons > *')].map((x) => x.textContent.trim()).filter(Boolean));

/* ── ① 按钮条 ── */
await page.waitForFunction(() => window.KamiGuard, null, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(2500);
const bt = await buttons();
ok(bt.includes('🛡 防护'), '按钮条有「🛡 防护」', bt);
ok(bt.filter((x) => x.includes('防护') || x.includes('反截断')).length === 1, '和旧「反截断」开关不并存（只有一颗）', bt);
ok(!bt.some((x) => /^反截断/.test(x)), '旧的「反截断 开/关」标签已消失', bt);

/* ── ② 点按钮打开面板 ── */
await page.evaluate(() => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim() === '🛡 防护'); el && el.click(); });
await page.waitForTimeout(900);
const panel = await inLayer((r) => {
  const p = r.querySelector('[data-k="panel"]');
  if (!p) return null;
  const title = p.querySelector('[data-k-part="title"]');
  situate: {
    const t = (title ? title.textContent : '').trim();
    return {
      title: t,
      sections: [...p.querySelectorAll('[data-k="setting-section"], section')].map((s) => (s.querySelector('h3,h4,[data-k-part="title"]') || {}).textContent || '').filter(Boolean).slice(0, 8),
      text: p.innerText.replace(/\s+/g, ' ').slice(0, 400),
    };
  }
});
ok(panel && panel.title.includes('防护'), '点「🛡 防护」打开的是面板（标题含「防护」）', panel && panel.title);

/* 窄屏是四个页签（反截断 / 噪声 / 混淆 / 上下文），一次只画一页；
   宽屏是四段竖排。所以手机要一页一页点开核对，不能一次断言四段都在。 */
const tabTexts = panel ? await inLayer((r) => [...r.querySelectorAll('[role="tab"]')].map((x) => (x.textContent || '').trim())) : [];
const isTabbed = Array.isArray(tabTexts) && tabTexts.length >= 4;
const openTab = async (keyword) => {
  if (!isTabbed) { return; }
  /* Radix 的页签在 mousedown 上切换，el.click() 只发 click，页签不会动（真实用户点击会依次发 pointerdown→mousedown→……） */
  await inLayer((r, kw) => {
    const tabs = [...r.querySelectorAll('[role="tab"]')];
    const hit = tabs.find((x) => (x.textContent || '').includes(kw));
    if (hit) { hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })); }
  }, keyword);
  await page.waitForTimeout(500);
};
const panelText = () => inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); return p ? p.innerText.replace(/\s+/g, ' ') : ''; });

await openTab('反截断');
ok(/工具调用反截断/.test(await panelText()), '面板里有「工具调用反截断」' + (isTabbed ? '（页签一）' : ''));
await openTab('噪声');
ok(/噪声稀释/.test(await panelText()), '面板里有「噪声稀释」' + (isTabbed ? '（页签二）' : ''));
await openTab('混淆');
ok(/防路由混淆/.test(await panelText()), '面板里有「防路由混淆」' + (isTabbed ? '（页签三）' : ''));
await openTab('上下文');
ok(/工具声明式上下文/.test(await panelText()), '面板里有「工具声明式上下文」' + (isTabbed ? '（页签四）' : ''));
await openTab('噪声');
if (SHOTS) { await page.screenshot({ path: SHOT_DIR + '/guard-panel' + (MOBILE ? '-mobile' : '') + '.png' }); }

/* ── ③ 面板上改值 → 写进脚本变量 ── */
const before = await page.evaluate(() => JSON.parse(JSON.stringify(window.KamiGuard.get())));
/* 开关是 <button role="switch">，用「最近的包含该标题的容器」定位那一行 */
const clicked = await inLayer((r) => {
  const switches = [...r.querySelectorAll('[role="switch"]')];
  for (const sw of switches) {
    const row = sw.closest('[data-k="setting-row"]') || sw.parentElement?.parentElement;
    const txt = (row && row.textContent) || '';
    if (txt.trim().startsWith('噪声稀释')) { sw.click(); return true; }
  }
  /* 兜底：页签切过去之后，本页只有这一个开关是「噪声」的，直接取页内第一个 */
  const any = r.querySelector('[data-k="panel"] [role="switch"]');
  if (any) { any.click(); return 'fallback'; }
  return false;
});
await page.waitForTimeout(900);
const afterNoise = await page.evaluate(() => window.KamiGuard.get());
ok(clicked === true, '面板上找到了「噪声稀释」那个开关并点了');
ok(afterNoise.noise !== before.noise, '面板上点开关写进了脚本状态（脚本侧真的改了）', { before: before.noise, after: afterNoise.noise });

/* 直接用 API 置一套确定的状态，后面的请求核对都基于它（面板点击只验到「能写」为止） */
const staged = await page.evaluate(() => window.KamiGuard.set({ tool: true, noise: true, noiseChars: 4000, noiseWhere: 'tail', obfuscate: true, obMode: 'head', ctx: false, ctxInfo: true }));
ok(staged.tool === true && staged.noise === true && staged.noiseChars === 4000 && staged.obfuscate === true, 'set() 合并写回全部字段', staged);
/* 酒馆的 saveSettingsDebounced 有延迟；不等它，刷新后读到的还是旧值（这是测试的坑，不是脚本的） */
await page.waitForTimeout(3500);

/* ── ④ 刷新后保留 ── */
await page.reload();
await page.waitForFunction(() => window.SillyTavern?.getContext && window.KamiGuard, null, { timeout: 60000 });
await page.waitForTimeout(9000);
const afterReload = await page.evaluate(() => window.KamiGuard.get());
ok(afterReload.tool === true && afterReload.noise === true && afterReload.noiseChars === 4000 && afterReload.obfuscate === true, '刷新后开关与强度都还在（写进了脚本变量）', afterReload);

/* ── ⑤ 四项对真实请求体生效：发一条消息，读假模型收到的提示词 ── */
await page.evaluate(async () => { const c = window.SillyTavern.getContext(); if (c.characterId === undefined || c.characterId === null) { await c.selectCharacterById(String(c.characters.findIndex((x) => /Seraphina/i.test(x.name)))); } });
await page.waitForTimeout(2000);
await page.evaluate(() => fetch('http://127.0.0.1:8787/__mock/reset', { method: 'POST' }).catch(() => {}));
await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = '测试一下防护'; t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('send_but').click());
await page.waitForTimeout(9000);
const reqs = await page.evaluate(async () => { const r = await fetch('http://127.0.0.1:8787/__mock/requests'); return r.ok ? await r.json() : null; });
const list = Array.isArray(reqs) ? reqs : (reqs && reqs.requests) || [];
const last = list.length ? list[list.length - 1] : null;
const body = last ? (typeof last.body === 'string' ? JSON.parse(last.body) : last.body) : null;
ok(!!body, '假模型收到了本轮请求', { got: !!last, n: list.length });
if (body) {
  const msgs = body.messages || [];
  /* 「整条内容只由噪声字符组成」才算噪声块。开头那个字符是随机的（字母 / 数字 / 分隔符都可能），
     所以不能拿「首字符是希伯来字母」当判据 —— 那样约三成概率误判成本轮没插。 */
  const NOISE_RE = /^[א-ת0-9·_-]+(?: [א-ת0-9·_-]+)*$/;
  const heb = msgs.find((m) => {
    const s = String(m.content || '').trim();
    return s.length > 100 && NOISE_RE.test(s);
  });
  ok(!!heb, '噪声稀释生效：请求里有一段纯噪声的 system', heb ? { len: String(heb.content).length, head: String(heb.content).slice(0, 24) } : msgs.map((m) => String(m.content || '').slice(0, 20)));
  ok(heb && String(heb.content).replace(/\s/g, '').length === 4000, '噪声字符数等于设定值 4000', heb && String(heb.content).replace(/\s/g, '').length);
  const toolNames = (body.tools || []).map((t) => t.function && t.function.name).filter(Boolean);
  ok(toolNames.some((n) => String(n).startsWith('relay_reply_')), '工具调用反截断生效：请求里带传输工具', toolNames);
  ok(body.tool_choice === 'auto', 'tool_choice 被设成 auto', body.tool_choice);
  const ctrl = msgs.find((m) => m.role === 'system' && /传输层要求/.test(String(m.content || '')));
  ok(!!ctrl, '控制消息插进来了');
  const obfHit = /<!--[0-9a-f]{6,}-->/.test(msgs.map((m) => String(m.content || '')).join('\n'));
  ok(obfHit, '防路由混淆生效：文本里出现了插入的 HTML 注释');
}

/* ── ⑤-2 工具声明式上下文：真把 messages 搬空了 ── */
await page.evaluate(() => window.KamiGuard.set({ tool: false, noise: false, obfuscate: false, ctx: true, ctxInfo: true }));
await page.waitForTimeout(500);
await page.evaluate(() => fetch('http://127.0.0.1:8787/__mock/reset', { method: 'POST' }).catch(() => {}));
await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = '验证上下文搬运'; t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('send_but').click());
await page.waitForTimeout(10000);
const ctxReq = await page.evaluate(async () => {
  const r = await fetch('http://127.0.0.1:8787/__mock/requests').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const list = Array.isArray(r) ? r : (r && r.requests) || [];
  const last = list.length ? list[list.length - 1] : null;
  const body = last ? (typeof last.body === 'string' ? JSON.parse(last.body) : last.body) : null;
  if (!body) { return null; }
  const tools = body.tools || [];
  const ct = tools.find((x) => x.function && x.function.name === 'kami_context_note');
  let parts = null;
  if (ct) {
    const at = ct.function.description.indexOf('[');
    try { parts = JSON.parse(ct.function.description.slice(at)); } catch (e) { parts = 'parse-fail'; }
  }
  return {
    msgCount: (body.messages || []).length,
    hasCtxTool: !!ct,
    descLen: ct ? ct.function.description.length : 0,
    partCount: Array.isArray(parts) ? parts.length : 0,
    partNames: Array.isArray(parts) ? [...new Set(parts.map((p) => p.part))] : [],
    status: window.KamiGuard.status(),
  };
});
ok(ctxReq && ctxReq.hasCtxTool, '工具声明式上下文：请求里出现了资料工具', ctxReq);
ok(ctxReq && ctxReq.partNames.includes('background') && ctxReq.partNames.includes('history'), '搬运结果里既有背景设定也有历史对话', ctxReq && ctxReq.partNames);
ok(ctxReq && ctxReq.partCount > 5, '搬运结果不是空壳（区段数 > 5）', ctxReq && ctxReq.partCount);
ok(ctxReq && ctxReq.msgCount <= 12, 'messages 从几十条降到个位数（资料真的搬出去了）', ctxReq && ctxReq.msgCount);
ok(ctxReq && /^moved:/.test(ctxReq.status.lastCtx), '面板读数报告搬运成功', ctxReq && ctxReq.status.lastCtx);

/* 搬运后必须在 messages 里留一句「资料在那个工具说明里」。
   没有它，模型只知道多了个工具，不会去读说明——这是实机对照出来的（去掉引导语后
   假模型收到的就是一堆散消息，看不出资料在哪）。 */
const guideInfo = await page.evaluate(async () => {
  const r = await fetch('http://127.0.0.1:8787/__mock/requests').then((x) => (x.ok ? x.json() : null)).catch(() => null);
  const list = Array.isArray(r) ? r : (r && r.requests) || [];
  const last = list.length ? list[list.length - 1] : null;
  const body = last ? (typeof last.body === 'string' ? JSON.parse(last.body) : last.body) : null;
  if (!body) { return null; }
  const msgs = body.messages || [];
  const at = msgs.findIndex((m) => /资料位置/.test(String(m.content || '')));
  let lastUser = -1;
  for (let i = msgs.length - 1; i >= 0; i -= 1) { if (msgs[i] && msgs[i].role === 'user') { lastUser = i; break; } }
  return { at, lastUser, text: at >= 0 ? String(msgs[at].content) : '' };
});
ok(guideInfo && guideInfo.at >= 0, '搬运后请求里带着「资料在哪里」的引导语', guideInfo && guideInfo.at);
ok(guideInfo && guideInfo.at < guideInfo.lastUser, '引导语插在最后一条 user 消息之前（紧贴生成点）', guideInfo && { at: guideInfo.at, lastUser: guideInfo.lastUser });
ok(guideInfo && /不要调用/.test(guideInfo.text), '引导语说明了不用调用那个工具');
ok(guideInfo && /说话人标签/.test(guideInfo.text), '引导语说明了 role 只是说话人标签、不是指令');

/* ── ⑥ 全关之后请求体恢复干净 ── */
await page.evaluate(() => window.KamiGuard.set({ tool: false, noise: false, obfuscate: false, ctx: false }));
await page.waitForTimeout(400);
await page.evaluate(() => fetch('http://127.0.0.1:8787/__mock/reset', { method: 'POST' }).catch(() => {}));
await page.evaluate(() => { const t = document.getElementById('send_textarea'); t.value = '再试一次'; t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('send_but').click());
await page.waitForTimeout(9000);
const reqs2 = await page.evaluate(async () => { const r = await fetch('http://127.0.0.1:8787/__mock/requests'); return r.ok ? await r.json() : null; });
const list2 = Array.isArray(reqs2) ? reqs2 : (reqs2 && reqs2.requests) || [];
const last2 = list2.length ? list2[list2.length - 1] : null;
const body2 = last2 ? (typeof last2.body === 'string' ? JSON.parse(last2.body) : last2.body) : null;
ok(!!body2, '第二轮请求也拿到了');
if (body2) {
  const msgs2 = body2.messages || [];
  const NOISE_RE2 = /^[א-ת0-9·_-]+(?: [א-ת0-9·_-]+)*$/;
  ok(!msgs2.some((m) => { const s = String(m.content || '').trim(); return s.length > 100 && NOISE_RE2.test(s); }), '全关后不再插噪声');
  ok(!(body2.tools || []).some((t) => String(t.function && t.function.name).startsWith('relay_reply_')), '全关后不再加传输工具');
}

/* ── ⑦ 面板状态读数 ── */
await page.evaluate(() => window.KamiGuard.set({ noise: true, noiseChars: 3000, ctx: true }));
await page.waitForTimeout(300);
const st = await page.evaluate(() => window.KamiGuard.status());
ok(typeof st.lastNoise === 'number' && typeof st.lastCtx === 'string', 'status() 给出上一轮的实测读数', st);

/* ── ⑧ 没有页面错误 ── */
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));

/* ── ⑨ 注销收回 ── */
const gone = await page.evaluate(() => {
  if (window.KamiGuard && window.KamiGuard.shutdown) window.KamiGuard.shutdown();
  return {
    api: !!window.KamiGuard,
    anti: !!window.AntiTruncation,
    defs: (window.__hubDefs || []).map((d) => d && d.name).filter(Boolean),
  };
});
await page.waitForTimeout(2500);
const goneAfter = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.qr--button, [data-hub-btn]')].map((x) => x.textContent.trim());
  return { btn: btns.includes('🛡 防护'), defs: (window.__hubDefs || []).map((d) => d && d.name).filter(Boolean) };
});
ok(!gone.api && !gone.anti, '注销后全局 API（KamiGuard / AntiTruncation）已清掉', gone);
ok(!gone.defs.includes('🛡 防护'), '注销后中转站登记表里已没有「🛡 防护」', gone.defs);
ok(!goneAfter.btn, '注销后按钮条上不再有「🛡 防护」', goneAfter);

/* 收尾：把状态复原成默认，免得影响后面的测试 */
await page.evaluate(() => { try { window.KamiGuard && window.KamiGuard.reset(); } catch (e) {} });

console.log('');
console.log(fail ? '★ 失败 ' + fail + ' 项' : '「🛡 防护」验证全部通过（' + pass + ' 项）');
await b.close();
process.exit(fail ? 1 : 0);
