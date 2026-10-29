// 新消息前端（🧪 消息前端 脚本 + 新运行库 chatFrontend）在真实酒馆里的验证：
//   node test/st/message-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包（含「🧪 消息前端」），见 test/st/README.md
// 核对：接管已有回复、藏起酒馆的 .mes_text；流式生成期间逐步排版（读 chat[mesid].mes）；生成结束出选项；
//       只有最新回复有选项；填入 / 发送（酒馆助手 createChatMessages + generate）；编辑消息时让回酒馆的编辑框；
//       重载聊天重挂、删除消息清理；实际渲染对比度；脚本注销后不留任何东西。
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { auditInPage } from '../frontend/browser/audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const SHOTS = process.argv.includes('--shots');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
const SHOT_DIR = process.env.ST_ROOT || '/workspace/st-test';

const OPTIONS = [
  { title: '推开门走进去', type: '行动', content: '深吸一口气，推开那扇吱呀作响的木门，借着昏黄的光看清屋里的人。' },
  { title: '先在门外听一听', type: '信息', content: '贴着门板屏住呼吸，分辨屋里那两个声音在说什么。' },
  { title: '敲门报上名字', type: '性格', content: '「打扰了，我是从镇上来的。」规规矩矩地敲三下门。' },
  { title: '绕到后窗', type: '推进', content: '沿着墙根绕到屋后，看看破窗里能不能先瞧见些什么。' },
  { title: '学猫叫试探', type: '搞笑', content: '冲着门缝「喵——」了一声，看看屋里的人会不会上当。' },
  { title: '转身离开', type: '其他', content: '这地方不对劲，还是先回镇上打听清楚再说。' }
];
const REPLY = [
  '<nyaruko_think>', '## 场景确认', '深夜的废屋，<n>老马什</n>在屋里。', '', '## 最终线路', '1. **步骤1**：门前的环境与声音', '2. **步骤2**：开门前的一瞬', '- 选项给 6 个', '</nyaruko_think>',
  '<out_body>', '<introduction>',
  '<search_results>', '范围：克苏鲁神话｜洛夫克拉夫特原作设定', '- 印斯茅斯是马萨诸塞州海岸的虚构小镇。 [1]', '- 达贡秘密教团在镇上取代了原有教会。 [1][2]',
  '[1] https://zh.wikipedia.org/wiki/Innsmouth 印斯茅斯', '[2] https://www.hplovecraft.com/writings/texts/fiction/soi.aspx The Shadow over Innsmouth', '</search_results>',
  '</introduction>', '<content>', '<!-- 步骤1/Token320 -->',
  '　　夜风穿过破败的窗棂，发出低低的呜咽。你站在那扇木门前，门缝里漏出一线昏黄的光。',
  '', '　　屋里有人在说话。*他们在说什么？*你摸了摸口袋里的地图，上面圈出的正是【马什旧宅】。',
  '', '<!-- 步骤2/Token280 -->', '___', '',
  '　　「外面有人。」一个沙哑的声音忽然停了下来。<n>老马什</n>的影子爬上了门缝——那是传说中的**深潜者之潮**。',
  '</content>', '<appendix>', '<options>', JSON.stringify(OPTIONS), '</options>', '</appendix>', '</out_body>'
].join('\n');
const REPLY2 = ['<content>', '　　门开了。<n>老马什</n>上下打量着你：「进来吧，外面……不安全。」', '</content>', '<options>',
  JSON.stringify([{ title: '跟着进屋', type: '推进', content: '点点头，跟着走进屋子。' }, { title: '借口告辞', type: '其他', content: '「天太晚了，我明早再来。」' }]), '</options>'].join('\n');
const queue = (body) => fetch(MOCK + '/__mock/next', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = []; const logs = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.includes('[消息前端]')) { logs.push(t); } if (m.type() === 'error' && /kami|消息前端|React/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });
await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);   // 关掉自动弹出的引导
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
});
await page.waitForTimeout(2500);
if (!(await page.locator('#send_but').isVisible())) {
  await page.evaluate(() => document.getElementById('api_button_openai')?.click());
  await page.waitForSelector('#send_but', { state: 'visible', timeout: 30000 });
}

/* 在最后一个（或第 n 个）宿主的 Shadow DOM 里求值 */
const inHost = (fn, arg, n = -1) => page.evaluate(([src, arg, n]) => {
  const hs = [...document.querySelectorAll('#chat [data-kami-msg-host]')];
  const h = hs[n < 0 ? hs.length + n : n];
  return h ? (0, eval)('(' + src + ')')(h.shadowRoot, arg) : null;
}, [fn.toString(), arg, n]);
const ITEM = '[data-k="msg-options"] > [data-k-part="list"] > li > [data-k-part="item"]';
const state = () => page.evaluate(() => {
  const ctx = window.SillyTavern.getContext();
  const aiMes = [...document.querySelectorAll('#chat .mes[mesid]')].filter((m) => m.getAttribute('is_user') !== 'true' && m.getAttribute('is_system') !== 'true');
  const hosts = document.querySelectorAll('#chat [data-kami-msg-host]');
  const visibleText = aiMes.filter((m) => { const t = m.querySelector('.mes_text'); return t && getComputedStyle(t).display !== 'none'; }).length;
  return { chat: ctx.chat.length, ai: aiMes.length, hosts: hosts.length, visibleText, size: window.KamiChatFrontend ? window.KamiChatFrontend.instance.size : -1 };
});

/* ① 接管已有回复 */
ok(await page.evaluate(() => !!window.KamiChatFrontend && !!window.KamiRuntimeNext), '「🧪 消息前端」脚本已启动并拿到新运行库', logs.join(' | '));
let s = await state();
ok(s.ai > 0 && s.hosts === s.ai && s.size === s.ai, '已有的每条 AI 回复都挂上了新前端', s);
ok(s.visibleText === 0, '酒馆自己的 .mes_text 都藏起来了', s);

/* ② 流式生成：慢慢吐字，生成期间取样 */
await fetch(MOCK + '/__mock/reset', { method: 'POST' });
await queue({ content: REPLY, chunk: 6, delayMs: 45 });
const before = (await state()).chat;
await page.fill('#send_textarea', '走向旧宅');
await page.click('#send_but');
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, before, { timeout: 30000 });
const samples = [];
for (let i = 0; i < 40; i++) {
  const x = await page.evaluate(() => {
    const ctx = window.SillyTavern.getContext();
    const last = ctx.chat[ctx.chat.length - 1];
    const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]');
    const h = mes && mes.querySelector('[data-kami-msg-host]');
    const r = h && h.shadowRoot;
    const stop = document.getElementById('mes_stop');
    return {
      raw: (last.mes || '').length, stop: !!stop && getComputedStyle(stop).display !== 'none',
      host: !!h, streaming: !!(r && r.querySelector('[data-k="msg-view"][data-streaming]')),
      caret: !!(r && r.querySelector('[data-k-part="caret"]')), paras: r ? r.querySelectorAll('[data-k="msg-body"] [data-k-part="para"]').length : 0,
      thinkHead: r ? ((r.querySelector('[data-k="msg-think"] [data-k-part="toggle"]') || {}).textContent || '') : '',
      optList: r ? r.querySelectorAll('[data-k="msg-options"] [data-k-part="list"]').length : 0,
      textShown: !!(mes && getComputedStyle(mes.querySelector('.mes_text')).display !== 'none')
    };
  });
  samples.push(x);
  if (!x.stop && x.raw >= REPLY.length - 5) { break; }
  await page.waitForTimeout(150);
}
const live = samples.filter((x) => x.stop);
ok(live.length >= 5, '取到了生成中的样本', samples.length + ' 个样本，其中生成中 ' + live.length);
ok(live.some((x) => x.raw > 0 && x.raw < REPLY.length), '生成期间 chat[mesid].mes 在实时更新（流式可以直接读聊天数据）', live.map((x) => x.raw).join(','));
ok(live.every((x) => x.host), '生成期间宿主一直在（酒馆重写 .mes_text 冲不掉它）');
ok(live.some((x) => /奈亚子思考中/.test(x.thinkHead)), '思维链写到一半时显示「奈亚子思考中」', [...new Set(live.map((x) => x.thinkHead))].join(' / '));
ok(live.some((x) => x.streaming && x.caret && x.paras >= 1), '生成期间正文就按新排版逐步出现（有光标）');
const growth = live.map((x) => x.paras).filter((n, i, a) => i === 0 || n !== a[i - 1]);
ok(growth.length >= 3, '段落随生成逐步增加', growth.join('→'));
ok(live.every((x) => x.optList === 0), '生成期间不显示选项列表');
ok(live.every((x) => !x.textShown), '生成期间酒馆的 .mes_text 一直藏着（没有原文闪一下）');
await page.waitForFunction(() => { const s = document.getElementById('mes_stop'); return !s || getComputedStyle(s).display === 'none'; }, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const end = await inHost((r, sel) => ({
  streaming: !!r.querySelector('[data-streaming]'), caret: !!r.querySelector('[data-k-part="caret"]'), opts: r.querySelectorAll(sel).length,
  think: (r.querySelector('[data-k="msg-think"] [data-k-part="toggle"]') || {}).textContent || '', thinkOpen: r.querySelector('[data-k="msg-think"]')?.getAttribute('data-state'),
  search: (r.querySelector('[data-k="msg-search"] [data-k-part="toggle"]') || {}).textContent || '',
  paras: r.querySelectorAll('[data-k="msg-body"] [data-k-part="para"]').length, scene: r.querySelectorAll('[data-k-part="scene-break"]').length,
  parts: ['dialogue', 'thought', 'name', 'keyword', 'term'].filter((p) => !r.querySelector('[data-k="msg-body"] [data-k-part="' + p + '"]')),
  leak: /<!--|<n>|步骤1/.test(r.querySelector('[data-k="msg-body"] [data-k-part="text"]').textContent)
}), ITEM);
ok(!end.streaming && !end.caret, '生成结束：退出流式状态、光标消失', end);
ok(end.opts === 6, '生成结束：出现 6 个行动选项', end.opts);
ok(/^奈亚子思考了\s*\d+\s*字/.test(end.think.trim()) && end.thinkOpen === 'closed', '思维链默认收起：「奈亚子思考了 N 字」', end.think);
ok(/参考了 2 个来源/.test(end.search), '搜索资料一行摘要', end.search);
ok(end.paras === 3 && end.scene === 1 && end.parts.length === 0 && !end.leak, '正文排版：段落、场景转换、对白 / 心理 / 角色名 / 关键词 / 专有名词，注释与标记不外露', end);
const native = await page.evaluate(() => { const m = document.querySelector('#chat .mes:last-of-type .mes_reasoning_details'); return m ? getComputedStyle(m).display : 'none'; });
ok(native === 'none', '没有重复的原生思维链块（旧「💭 思维链」已关）', native);
const optsPerMes = await page.evaluate(() => [...document.querySelectorAll('#chat [data-kami-msg-host]')].map((h) => h.shadowRoot.querySelectorAll('[data-k="msg-options"]').length));
ok(optsPerMes.slice(0, -1).every((n) => n === 0) && optsPerMes[optsPerMes.length - 1] === 1, '只有最新一条回复渲染行动选项', optsPerMes.join(','));
if (SHOTS) { await page.screenshot({ path: path.join(SHOT_DIR, 'st-msg-' + (MOBILE ? 'mobile' : 'desktop') + '.png') }); }

/* ③ 实际渲染对比度（展开思维链与搜索资料） */
await inHost((r) => { r.querySelector('[data-k="msg-think"] [data-k-part="toggle"]').click(); r.querySelector('[data-k="msg-search"] [data-k-part="toggle"]').click(); });
await page.waitForTimeout(400);
const auditRes = await page.evaluate(([src]) => {
  /* audit-lib 的 '@mounts' 认的是 [data-kami-mount]；这里给宿主临时借一个同名属性 */
  const hs = [...document.querySelectorAll('#chat [data-kami-msg-host]')];
  hs.forEach((h) => h.setAttribute('data-kami-mount', 'audit'));
  const r = (0, eval)('(' + src + ')')('@mounts');
  hs.forEach((h) => h.removeAttribute('data-kami-mount'));
  return r;
}, [auditInPage.toString()]);
ok(auditRes.failures.length === 0 && auditRes.checked > 30, '真实酒馆里的实际渲染对比度：' + auditRes.checked + ' 处', auditRes.failures.slice(0, 3));
const head = await inHost((r) => !!r.querySelector('[data-k="msg-think"] > [data-k-part="head"] > [data-k-part="tools"] [data-k="segmented"]'));
ok(head, '展开后排版 / 原文与复制在思维链头部');
if (SHOTS) { await page.locator('#chat .mes:last-of-type').screenshot({ path: path.join(SHOT_DIR, 'st-msg-open-' + (MOBILE ? 'mobile' : 'desktop') + '.png') }); }

/* ④ 填入：接在输入框已有内容后面 */
await page.fill('#send_textarea', '我想想');
await inHost((r, sel) => { r.querySelectorAll(sel)[1].click(); }, ITEM);
await page.waitForTimeout(300);
const filled = await page.inputValue('#send_textarea');
ok(filled.startsWith('我想想') && filled.includes('贴着门板'), '填入：接在酒馆输入框已有内容的后面', filled);
await page.fill('#send_textarea', '');

/* ⑤ 编辑消息：让回酒馆的编辑框 */
const lastId = await page.evaluate(() => window.SillyTavern.getContext().chat.length - 1);
await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); m.querySelector('.mes_edit')?.click(); }, lastId);
await page.waitForTimeout(800);
const editing = await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); const t = m.querySelector('.mes_text'); const h = m.querySelector('[data-kami-msg-host]'); return { ta: !!t.querySelector('textarea'), text: getComputedStyle(t).display, host: h ? getComputedStyle(h).display : 'gone' }; }, lastId);
ok(editing.ta && editing.text !== 'none' && editing.host === 'none', '编辑消息时显示酒馆的编辑框、藏起新前端', editing);
await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); (m.querySelector('.mes_edit_cancel') || m.querySelector('.mes_edit_done'))?.click(); }, lastId);
await page.waitForTimeout(1000);
const after = await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); const h = m.querySelector('[data-kami-msg-host]'); return { text: getComputedStyle(m.querySelector('.mes_text')).display, host: h ? getComputedStyle(h).display : 'gone', opts: h ? h.shadowRoot.querySelectorAll('[data-k="msg-options"] [data-k-part="item"]').length : 0 }; }, lastId);
ok(after.text === 'none' && after.host !== 'none' && after.opts > 0, '退出编辑后新前端回来', after);

/* ⑥ 发送模式：点选项 → 酒馆助手新建用户楼层并生成 */
await queue({ content: REPLY2, chunk: 8, delayMs: 30 });
await inHost((r) => [...r.querySelectorAll('[data-k="msg-options"] [data-k="segmented"] [data-k-part="item"]')].find((x) => x.textContent === '发送').click());
await page.waitForTimeout(300);
const n0 = (await state()).chat;
await page.fill('#send_textarea', '写了一半的草稿');
await inHost((r, sel) => { r.querySelector(sel).click(); }, ITEM);
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
await page.waitForFunction(() => { const s = document.getElementById('mes_stop'); return !s || getComputedStyle(s).display === 'none'; }, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const sent = await page.evaluate(() => { const c = window.SillyTavern.getContext().chat; return { user: c[c.length - 2].mes, isUser: c[c.length - 2].is_user }; });
ok(sent.isUser && sent.user.includes('推开那扇吱呀作响') && !sent.user.includes('草稿'), '发送：只把选项内容作为用户楼层发出', sent);
ok((await page.inputValue('#send_textarea')) === '写了一半的草稿', '发送后输入框里原来写了一半的内容还在');
await page.fill('#send_textarea', '');
const r2 = await inHost((r, sel) => ({ opts: r.querySelectorAll(sel).length, mode: r.querySelector('[data-k="msg-options"]')?.getAttribute('data-mode'), body: r.querySelector('[data-k="msg-body"]')?.textContent.includes('门开了') }), ITEM);
ok(r2.body && r2.opts === 2 && r2.mode === 'send', '新回复渲染完成，选项模式保持「发送」', r2);
const optsNow = await page.evaluate(() => [...document.querySelectorAll('#chat [data-kami-msg-host]')].map((h) => h.shadowRoot.querySelectorAll('[data-k="msg-options"]').length));
ok(optsNow.filter((n) => n > 0).length === 1 && optsNow[optsNow.length - 1] === 1, '上一条回复的选项已经消失', optsNow.join(','));

/* ⑦ 重载聊天：自动重挂 */
const m0 = await page.evaluate(() => window.KamiChatFrontend.instance.mounts);
await page.evaluate(() => window.SillyTavern.getContext().reloadCurrentChat()); await page.waitForTimeout(3000);
s = await state();
const m1 = await page.evaluate(() => window.KamiChatFrontend.instance.mounts);
ok(m1 > m0 && s.hosts === s.ai && s.size === s.ai && s.visibleText === 0, '重载聊天后全部重挂（挂载点不累积）', { ...s, m0, m1 });

/* ⑧ 删除最后两条：挂载点被清理 */
const size0 = s.size;
await page.evaluate(async () => { const ctx = window.SillyTavern.getContext(); await ctx.deleteLastMessage(); await ctx.deleteLastMessage(); });
await page.waitForTimeout(1200);
s = await state();
ok(s.size === size0 - 1 && s.hosts === s.ai, '删除消息后对应的挂载点被清理', s);
const optsAfterDel = await page.evaluate(() => [...document.querySelectorAll('#chat [data-kami-msg-host]')].map((h) => h.shadowRoot.querySelectorAll('[data-k="msg-options"]').length));
ok(optsAfterDel[optsAfterDel.length - 1] === 1, '删掉最新回复后，新的「最新一条」重新显示选项', optsAfterDel.join(','));

/* ⑨ 注销：不留任何东西 */
await page.evaluate(() => window.KamiChatFrontend.shutdown());
await page.waitForTimeout(300);
const clean = await page.evaluate(() => ({
  hosts: document.querySelectorAll('[data-kami-msg-host]').length, marks: document.querySelectorAll('[data-kami-msg]').length,
  style: !!document.getElementById('kami-msg-host-style'), api: !!window.KamiChatFrontend,
  hidden: [...document.querySelectorAll('#chat .mes .mes_text')].filter((t) => getComputedStyle(t).display === 'none').length
}));
ok(!clean.hosts && !clean.marks && !clean.style && !clean.api && !clean.hidden, '脚本注销后：宿主、标记、宿主样式、全局对象全部移除，酒馆的 .mes_text 恢复显示', clean);
ok(errors.length === 0, '没有页面错误', errors.join(' | '));
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
await b.close();
process.exit(fail ? 1 : 0);
