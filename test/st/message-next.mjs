// 新消息前端 v0.2（🧪 消息前端 脚本 + 新运行库 chatFrontend）在真实酒馆里的验证：
//   node test/st/message-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包，见 test/st/README.md
// v0.2 的做法（2026-10-29 用户实测意见）：内容留在酒馆的 DOM 里，我们只加外壳。核对：
//   · 思维链：「💭 思维链」流式时搬进酒馆原生思维链块（extra.reasoning），新前端显示它（原生块藏起、编辑 / 删除走原生按钮）；
//     生成中显示「奈亚子思考中」；
//   · 正文：仍是酒馆渲染的节点（在 .mes_text 里），对白 / 心理描写的颜色就是酒馆的字体颜色设置；其他插件插进去的节点留得住；
//     正文里的 HTML 美化（酒馆助手 iframe）照常显示；公式渲染成 MathML；
//   · 搜索资料 / 行动选项：换掉酒馆助手的 iframe；只有最新回复有选项；填入 / 发送；
//   · 编辑后重新接管、重载聊天、删除消息；显示面板的「消息前端」开关（关 → 「📄 正文外壳」「💭 思维链」接回）；
//   · 折叠时有碎光特效；实际渲染对比度；脚本注销后不留东西。
import path from 'node:path';
import { createRequire } from 'node:module';
import { auditInPage } from '../frontend/browser/audit-lib.mjs';
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
  { title: '转身离开', type: '其他', content: '这地方不对劲，还是先回镇上打听清楚再说。$x^2$ 也算' }
];
const THINK = ['## 场景确认', '深夜的废屋，<n>老马什</n>在屋里。', '', '## 最终线路', '1. **步骤1**：门前的环境与声音', '2. **步骤2**：开门前的一瞬', '- 选项给 6 个', '- 能量守恒 $E=mc^2$'];
const REPLY = [
  '<nyaruko_think>', ...THINK, '</nyaruko_think>',
  '<out_body>', '<introduction>',
  '<search_results>', '范围：克苏鲁神话｜洛夫克拉夫特原作设定', '- 印斯茅斯是马萨诸塞州海岸的虚构小镇。 [1]', '- 达贡秘密教团在镇上取代了原有教会。 [1][2]',
  '[1] https://zh.wikipedia.org/wiki/Innsmouth 印斯茅斯', '[2] https://www.hplovecraft.com/writings/texts/fiction/soi.aspx The Shadow over Innsmouth', '</search_results>',
  '</introduction>', '<content>', '<!-- 步骤1/Token320 -->',
  '　　夜风穿过破败的窗棂，发出低低的呜咽。你站在那扇木门前，门缝里漏出一线昏黄的光。',
  '', '　　屋里有人在说话。*他们在说什么？*你摸了摸口袋里的地图，上面圈出的正是【马什旧宅】。',
  '', '<!-- 步骤2/Token280 -->', '___', '',
  '　　「外面有人。」一个沙哑的声音忽然停了下来。<n>老马什</n>的影子爬上了门缝——那是传说中的**深潜者之潮**。',
  '', '　　门上刻着一行算式：\\(\\frac{a*b}{c_1}\\) 与 $x_1 + y_1$，价格标签写着 $5 和 $10。',
  '', '$$', '\\int_0^1 x\\,dx = \\frac{1}{2}', '$$',
  '', '```html', '<!DOCTYPE html><html><body><div id="kami-html-card" style="padding:8px">HTML美化卡片</div></body></html>', '```',
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
/* 上次测试可能关掉了开关 */
await page.evaluate(() => { try { localStorage.removeItem('kami.msgfe'); localStorage.removeItem('kami.msg.skincolors'); } catch (e) { } if (window.KamiChatFrontend && !window.KamiChatFrontend.active()) { window.KamiChatFrontend.setEnabled(true); } });

/* 最后一条消息里某种宿主的 Shadow DOM 里求值 */
const inPart = (kind, fn, arg, mesid) => page.evaluate(([kind, src, arg, mesid]) => {
  const ctx = window.SillyTavern.getContext();
  const id = mesid === undefined ? ctx.chat.length - 1 : mesid;
  const h = document.querySelector('#chat .mes[mesid="' + id + '"] [data-kami-msg-host="' + kind + '"]');
  return h ? (0, eval)('(' + src + ')')(h.shadowRoot, arg, h) : null;
}, [kind, fn.toString(), arg, mesid]);
const ITEM = '[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]';
const notGenerating = () => page.waitForFunction(() => { const s = document.getElementById('mes_stop'); return !s || getComputedStyle(s).display === 'none'; }, null, { timeout: 60000 });

ok(await page.evaluate(() => !!window.KamiChatFrontend && window.KamiChatFrontend.active() && !!window.KamiCot && !!window.KamiBodyShell), '「🧪 消息前端」启动；「💭 思维链」「📄 正文外壳」也在跑（前者负责搬、后者让位）', logs.join(' | '));

/* ① 流式生成：慢慢吐字 */
await fetch(MOCK + '/__mock/reset', { method: 'POST' });
await queue({ content: REPLY, chunk: 6, delayMs: 40 });
const before = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
await page.fill('#send_textarea', '走向旧宅');
await page.click('#send_but');
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, before, { timeout: 30000 });
const samples = [];
for (let i = 0; i < 60; i++) {
  const x = await page.evaluate(() => {
    const ctx = window.SillyTavern.getContext();
    const id = ctx.chat.length - 1;
    const mes = document.querySelector('#chat .mes[mesid="' + id + '"]');
    const h = mes && mes.querySelector('[data-kami-msg-host="think"]');
    const stop = document.getElementById('mes_stop');
    const t = mes && mes.querySelector('.mes_text');
    return {
      stop: !!stop && getComputedStyle(stop).display !== 'none', raw: (ctx.chat[id].mes || '').length,
      think: h ? ((h.shadowRoot.querySelector('[data-k="msg-think"] [data-k-part="toggle"]') || {}).textContent || '') : '',
      rawThink: /<nyaruko_think>/.test(ctx.chat[id].mes || ''), textLen: t ? t.textContent.length : 0,
      styled: t ? t.getAttribute('data-k-content') === 'body' && !!t.shadowRoot && t.querySelectorAll(':scope > p[data-k-part="para"]').length : 0
    };
  });
  samples.push(x);
  if (!x.stop && i > 3) { break; }
  await page.waitForTimeout(120);
}
const live = samples.filter((x) => x.stop);
ok(live.length >= 5, '取到了生成中的样本', samples.length + ' 个样本，其中生成中 ' + live.length);
ok(live.some((x) => /奈亚子思考中/.test(x.think)), '生成中思维链显示「奈亚子思考中」（读「💭 思维链」正在搬的内容）', [...new Set(live.map((x) => x.think))].join(' / '));
ok(live.every((x) => !x.rawThink), '思维链没有进正文（「💭 思维链」流式时就扣走了）');
ok(live.some((x) => x.textLen > 20), '生成中正文逐步显示', live.map((x) => x.textLen).join(','));
ok(live.some((x) => x.styled > 0), '生成中正文就按我们的排版（段落已标记、套上正文样式）', live.map((x) => x.styled).join(','));
await notGenerating();
await page.waitForTimeout(2000);

/* ② 生成结束：各部分 */
const info = await page.evaluate(() => {
  const ctx = window.SillyTavern.getContext();
  const id = ctx.chat.length - 1, m = ctx.chat[id];
  const mes = document.querySelector('#chat .mes[mesid="' + id + '"]');
  const text = mes.querySelector('.mes_text');
  const host = (k) => mes.querySelector('[data-kami-msg-host="' + k + '"]');
  const body = text.hasAttribute('data-kami-msg-body') && text.shadowRoot ? text : null;
  const details = mes.querySelector('.mes_reasoning_details');
  const css = getComputedStyle(document.documentElement);
  const rgb = (v) => { const d = document.createElement('span'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const q = body && body.querySelector('q'), em = body && body.querySelector('em');
  return {
    reasoning: (m.extra && m.extra.reasoning) || '', mesHasThink: /<nyaruko_think>/.test(m.mes),
    thinkHead: host('think') ? (host('think').shadowRoot.querySelector('[data-k="msg-think"] [data-k-part="toggle"]') || {}).textContent : null,
    thinkClosed: host('think') ? host('think').shadowRoot.querySelector('[data-k="msg-think"]').getAttribute('data-state') : null,
    nativeShown: details ? getComputedStyle(details).display !== 'none' : null,
    search: host('search') ? (host('search').shadowRoot.querySelector('[data-k="msg-search"] [data-k-part="toggle"]') || {}).textContent : null,
    opts: host("options") ? host("options").shadowRoot.querySelectorAll('[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]').length : 0,
    bodyInText: !!body && text.contains(body), bodyParas: body ? body.querySelectorAll(':scope > p').length : 0,
    bodyShadowHead: body && body.shadowRoot ? (body.shadowRoot.querySelector('[data-k="msg-body"] [data-k-part="count"]') || {}).textContent : null,
    slot: body && body.shadowRoot ? !!body.shadowRoot.querySelector('slot') : false,
    leak: body ? /<!--|步骤1|nyaruko/.test(body.innerText) : true,
    quote: q ? getComputedStyle(q).color : null, quoteWant: rgb(css.getPropertyValue('--SmartThemeQuoteColor')),
    em: em ? getComputedStyle(em).color : null, emWant: rgb(css.getPropertyValue('--SmartThemeEmColor')),
    para: body && body.querySelector('p') ? getComputedStyle(body.querySelector('p')).color : null, paraWant: rgb(css.getPropertyValue('--SmartThemeBodyColor')),
    math: body ? [...body.querySelectorAll('[data-kami-math]')].map((x) => x.getAttribute('data-kami-math') + ':' + !!x.querySelector('math')) : [],
    texLeft: body ? body.querySelectorAll('code[data-kami-tex]').length : -1,
    price: body ? body.textContent.includes('$5 和 $10') : false,
    typo: (() => {
      if (!body) { return null; }
      const p = body.querySelector(':scope > [data-k-part="para"]'), cs = p ? getComputedStyle(p) : null;
      const th = body.querySelector('[data-k-part="thought"]');
      return { mode: body.getAttribute('data-k-content'), indent: cs && cs.textIndent, font: cs && cs.fontFamily, lead: p ? /^[\s\u3000]/.test(p.textContent) : null,
        scene: body.querySelectorAll('hr[data-k-part="scene-break"]').length, term: (body.querySelector('[data-k-part="term"]') || {}).textContent,
        thoughtFont: th ? getComputedStyle(th).fontFamily : null, dialogue: body.querySelectorAll('[data-k-part="dialogue"]').length };
    })(),
    thIframes: [...text.querySelectorAll('.TH-render')].map((th) => (th.hasAttribute('data-kami-msg-hidden') ? 'hidden:' + th.getAttribute('data-kami-msg-hidden') : 'shown') + (body && body.contains(th) ? '@body' : '')),
    htmlCard: (() => { const f = body && [...body.querySelectorAll('.TH-render:not([data-kami-msg-hidden]) iframe')][0]; return f ? f.getBoundingClientRect().height : 0; })(),
    bodyBg: body ? getComputedStyle(body.shadowRoot.querySelector('[data-k="msg-view"]')).backgroundColor : null,
    searchFacts: host('search') ? host('search').querySelectorAll('[slot="content"] [data-k-content="search"] [data-k-part="fact"]').length : 0,
    searchShown: host('search') ? !!host('search').shadowRoot.querySelector('slot[name="content"]') : false,
    optSlots: host('options') ? host('options').querySelectorAll('[slot^="o"][data-k-content="option"]').length : 0,
    optMath: host('options') ? !!host('options').querySelector('[slot="o5-text"] [data-kami-math] math') : false
  };
});
ok(info.reasoning.includes('场景确认') && !info.mesHasThink, '思维链写进了酒馆原生思维链（extra.reasoning），正文原文里没有', { len: info.reasoning.length, inMes: info.mesHasThink });
ok(/^奈亚子思考了\s*\d+\s*字/.test((info.thinkHead || '').trim()) && info.thinkClosed === 'closed', '思维链默认收起：「奈亚子思考了 N 字」', info.thinkHead);
ok(info.nativeShown === false, '原生思维链块藏起来（由新前端代为显示，不重复）', info.nativeShown);
ok(/参考了 2 个来源/.test(info.search || ''), '搜索资料：换掉 iframe，一行摘要', info.search);
ok(info.opts === 6, '行动选项：换掉 iframe，6 个', info.opts);
ok(info.bodyInText && info.slot && info.bodyParas >= 3 && /\d+ 字/.test(info.bodyShadowHead || '') && !info.leak, '正文节点留在 .mes_text 里（插件找得到），头部有字数；注释与标记不外露', info);
ok(info.typo && info.typo.mode === 'body' && parseFloat(info.typo.indent) > 10 && !info.typo.lead && /Songti|Serif|serif/.test(info.typo.font) && info.typo.scene === 1 && info.typo.term === '【马什旧宅】' && /Kaiti|KaiTi|楷/.test(info.typo.thoughtFont || '') && info.typo.dialogue >= 1,
  '正文由我们排版：皮肤字体（碎光：宋体 / 心理描写楷体）、两字缩进、场景转换、专有名词、对白', info.typo);
ok(info.quote === info.para && !/rgba\(0, 0, 0, 0\)|transparent/.test(info.bodyBg || 'transparent'), '默认「皮肤字体颜色」开：正文铺皮肤的底色，对白用皮肤的颜色（覆盖酒馆的字体颜色）', { q: info.quote, p: info.para, bg: info.bodyBg });
ok(info.searchFacts === 2 && info.searchShown, '搜索资料：事实经统一管线渲染进页面 DOM，经 slot 显示', info.searchFacts);
ok(info.optSlots === 12 && info.optMath, '行动选项：标题与内容经统一管线渲染（含公式），经 slot 显示', { slots: info.optSlots, math: info.optMath });
ok(info.math.filter((x) => x === 'inline:true').length === 2 && info.math.includes('block:true') && info.texLeft === 0 && info.price, '公式：行内 2 个 + 独立 1 个渲染成 MathML；价格「$5 和 $10」不误伤', { math: info.math, left: info.texLeft, price: info.price });
ok(info.thIframes.filter((x) => x.startsWith('hidden')).length === 2 && info.thIframes.includes('shown@body') && info.htmlCard > 10, '酒馆助手 iframe：搜索资料 / 行动选项的藏起，正文里的 HTML 美化照常显示', info);

/* 更早的楼层（正文正则只作用于最后两条，没有正文标记）：整段按我们的排版 */
const older = await page.evaluate(() => { const ms = [...document.querySelectorAll('#chat .mes[is_user="false"] .mes_text[data-k-content="body"]:not(:has(textarea))')]; return { n: ms.length, paras: ms.length ? ms[0].querySelectorAll(':scope > p[data-k-part="para"]').length : 0 }; });
ok(older.n >= 1 && older.paras >= 1, '更早的楼层也按我们的排版（没有正文标记时整段当正文）', older);

/* ③ 插件兼容：往正文里插节点（模拟生图按钮类插件），重扫后还在原位 */
const plug = await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]');
  const p = mes.querySelector('.mes_text > p');
  const btn = document.createElement('button'); btn.className = 'kami-test-plugin'; btn.textContent = '生图';
  p.appendChild(btn);
  window.KamiChatFrontend.instance.refresh();
  await new Promise((r) => setTimeout(r, 300));
  const again = mes.querySelector('.kami-test-plugin');
  return { found: !!again && mes.querySelector('.mes_text').contains(again), visible: !!again && again.getClientRects().length > 0 };
});
ok(plug.found && plug.visible, '插件往正文里插的按钮：在 .mes_text 里、看得见、重扫后不丢', plug);

/* ④ 展开思维链：特效、Markdown、公式、编辑走原生按钮 */
const fx0 = await inPart('think', (r) => { r.querySelector('[data-k="msg-think"] [data-k-part="toggle"]').click(); return true; });
await page.waitForTimeout(90);
const fxShown = await inPart('think', (r) => [...r.querySelectorAll('[data-k-fx-layer] > *')].filter((x) => x.style.display !== 'none').length);
ok(fx0 && fxShown > 0, '展开思维链有碎光特效（' + fxShown + ' 片）', fxShown);
await page.waitForTimeout(500);
const th = await inPart('think', (r, a, h) => { const c = h.querySelector('[slot="content"][data-k-content="think"]'); return {
  h: c ? [...c.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((x) => x.textContent) : [], li: c ? c.querySelectorAll('li').length : 0,
  math: c ? c.querySelectorAll('[data-kami-math] math').length : 0, edit: !!r.querySelector('[aria-label="编辑思维链"]'),
  visible: c ? c.getBoundingClientRect().height > 20 : false
}; });
ok(th.h.includes('场景确认') && th.li >= 4 && th.math === 1 && th.edit && th.visible, '思维链：经统一管线（酒馆渲染）——标题、列表、公式，展开后经 slot 显示；头部有「编辑」（酒馆原生入口）', th);
await inPart('think', (r) => r.querySelector('[aria-label="编辑思维链"]').click());
await page.waitForTimeout(700);
const ed = await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]'); const d = mes.querySelector('.mes_reasoning_details'); const h = mes.querySelector('[data-kami-msg-host="think"]'); return { ta: !!mes.querySelector('.reasoning_edit_textarea'), native: d ? getComputedStyle(d).display : 'none', ours: h ? getComputedStyle(h).display : 'gone' }; });
ok(ed.ta && ed.native !== 'none' && ed.ours === 'none', '点「编辑」：进酒馆原生思维链的编辑框（原生块显示、我们的让开）', ed);
await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]'); (mes.querySelector('.mes_reasoning_edit_cancel') || mes.querySelector('.mes_reasoning_edit_done'))?.click(); });
await page.waitForTimeout(800);
const ed2 = await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]'); const d = mes.querySelector('.mes_reasoning_details'); const h = mes.querySelector('[data-kami-msg-host="think"]'); return { native: d ? getComputedStyle(d).display : 'none', ours: h ? getComputedStyle(h).display : 'gone' }; });
ok(ed2.native === 'none' && ed2.ours !== 'none', '退出编辑：回到新前端的思维链', ed2);

/* ⑤ 对比度（展开思维链与搜索资料） */
await inPart('search', (r) => r.querySelector('[data-k="msg-search"] [data-k-part="toggle"]').click());
await page.waitForTimeout(500);
const auditRes = await page.evaluate(([src]) => {
  const hs = [...document.querySelectorAll('#chat [data-kami-msg-host], #chat .mes_text[data-kami-msg-body]')];
  hs.forEach((h) => h.setAttribute('data-kami-mount', 'audit'));
  const r = (0, eval)('(' + src + ')')('@mounts');
  hs.forEach((h) => h.removeAttribute('data-kami-mount'));
  return r;
}, [auditInPage.toString()]);
ok(auditRes.failures.length === 0 && auditRes.checked > 30, '四块（正文 / 思维链 / 搜索资料 / 行动选项）的实际渲染对比度：' + auditRes.checked + ' 处', auditRes.failures.slice(0, 3));
if (SHOTS) { await page.locator('#chat .mes:last-of-type').screenshot({ path: path.join(SHOT_DIR, 'st-msg-' + (MOBILE ? 'mobile' : 'desktop') + '.png') }); }

/* ⑤b 「皮肤字体颜色」关：跟酒馆的字体颜色设置，底色让出来；再打开 */
const tav = await page.evaluate(async () => {
  localStorage.setItem('kami.msg.skincolors', '0'); window.KamiChatFrontend.instance.refresh();
  await new Promise((r) => setTimeout(r, 300));
  const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]');
  const t = mes.querySelector('.mes_text'), css = getComputedStyle(document.documentElement);
  const rgb = (v) => { const d = document.createElement('span'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
  const p = t.querySelector(':scope > p'), q = t.querySelector('q'), em = t.querySelector('em');
  const th = mes.querySelector('[data-kami-msg-host="think"]');
  return {
    p: getComputedStyle(p).color === rgb(css.getPropertyValue('--SmartThemeBodyColor')), q: getComputedStyle(q).color === rgb(css.getPropertyValue('--SmartThemeQuoteColor')),
    em: getComputedStyle(em).color === rgb(css.getPropertyValue('--SmartThemeEmColor')),
    bg: getComputedStyle(t.shadowRoot.querySelector('[data-k="msg-view"]')).backgroundColor, thinkBg: getComputedStyle(th.shadowRoot.querySelector('[data-k="msg-view"]')).backgroundColor
  };
});
if (SHOTS) { await page.locator('#chat .mes:last-of-type').screenshot({ path: path.join(SHOT_DIR, 'st-msg-tavern-colors-' + (MOBILE ? 'mobile' : 'desktop') + '.png') }); }
ok(tav.p && tav.q && tav.em && /rgba\(0, 0, 0, 0\)/.test(tav.bg) && /rgba\(0, 0, 0, 0\)/.test(tav.thinkBg), '「皮肤字体颜色」关：正文 / 对白 / 心理描写 = 酒馆的字体颜色设置，四块的底色都让出来', tav);
const auditTav = await page.evaluate(([src]) => {
  const hs = [...document.querySelectorAll('#chat [data-kami-msg-host], #chat .mes_text[data-kami-msg-body]')];
  hs.forEach((h) => h.setAttribute('data-kami-mount', 'audit'));
  const r = (0, eval)('(' + src + ')')('@mounts');
  hs.forEach((h) => h.removeAttribute('data-kami-mount'));
  return r;
}, [auditInPage.toString()]);
ok(auditTav.failures.length === 0, '「皮肤字体颜色」关时的实际渲染对比度：' + auditTav.checked + ' 处', auditTav.failures.slice(0, 3));
await page.evaluate(() => { localStorage.removeItem('kami.msg.skincolors'); window.KamiChatFrontend.instance.refresh(); });
await page.waitForTimeout(300);

/* ⑥ 填入：接在输入框已有内容后面 */
await page.fill('#send_textarea', '我想想');
await inPart('options', (r, sel) => { r.querySelectorAll(sel)[1].click(); }, ITEM);
await page.waitForTimeout(300);
const filled = await page.inputValue('#send_textarea');
ok(filled.startsWith('我想想') && filled.includes('贴着门板'), '填入：接在酒馆输入框已有内容的后面', filled);
await page.fill('#send_textarea', '');

/* ⑦ 编辑消息：酒馆的编辑框照常；保存后重新接管 */
const lastId = await page.evaluate(() => window.SillyTavern.getContext().chat.length - 1);
await page.evaluate((id) => { document.querySelector('#chat .mes[mesid="' + id + '"] .mes_edit')?.click(); }, lastId);
await page.waitForTimeout(800);
const editing = await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); const t = m.querySelector('.mes_text'); const v = t.shadowRoot && t.shadowRoot.querySelector('[data-k="msg-view"]'); return { ta: !!t.querySelector('textarea'), editing: !!v && v.hasAttribute('data-editing'), head: !!v && getComputedStyle(v.querySelector('[data-k="msg-body"] > [data-k-part="head"]')).display }; }, lastId);
ok(editing.ta && editing.editing && editing.head === 'none', '编辑消息：酒馆的编辑框照常出现，外壳让开', editing);
await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); (m.querySelector('.mes_edit_cancel') || m.querySelector('.mes_edit_done'))?.click(); }, lastId);
await page.waitForTimeout(1200);
const after = await page.evaluate((id) => { const m = document.querySelector('#chat .mes[mesid="' + id + '"]'); const o = m.querySelector('[data-kami-msg-host="options"]'); return { body: m.querySelector('.mes_text').getAttribute('data-k-content') === 'body' && !!m.querySelector('.mes_text > p[data-k-part="para"]'), opts: o ? o.shadowRoot.querySelectorAll('[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]').length : 0 }; }, lastId);
ok(after.body && after.opts === 6, '退出编辑后重新接管', after);

/* ⑧ 发送模式：点选项 → 作为用户楼层发出并生成 */
await queue({ content: REPLY2, chunk: 8, delayMs: 30 });
await inPart('options', (r) => [...r.querySelectorAll('[data-k="msg-options"] [data-k="segmented"] [data-k-part="item"]')].find((x) => x.textContent === '发送').click());
await page.waitForTimeout(300);
const n0 = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
await page.fill('#send_textarea', '写了一半的草稿');
await inPart('options', (r, sel) => { r.querySelector(sel).click(); }, ITEM);
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, n0, { timeout: 30000 });
await notGenerating();
await page.waitForTimeout(1800);
const sent = await page.evaluate(() => { const c = window.SillyTavern.getContext().chat; return { user: c[c.length - 2].mes, isUser: c[c.length - 2].is_user }; });
ok(sent.isUser && sent.user.includes('推开那扇吱呀作响') && !sent.user.includes('草稿'), '发送：只把选项内容作为用户楼层发出', sent);
ok((await page.inputValue('#send_textarea')) === '写了一半的草稿', '发送后输入框里原来写了一半的内容还在');
await page.fill('#send_textarea', '');
const optsPer = await page.evaluate(() => [...document.querySelectorAll('#chat .mes[is_user="false"]')].map((m) => m.querySelectorAll('[data-kami-msg-host="options"]').length));
ok(optsPer[optsPer.length - 1] === 1 && optsPer.slice(0, -1).every((n) => n === 0), '只有最新一条回复显示行动选项', optsPer.join(','));

/* ⑨ 显示面板的「消息前端」开关：关 → 酒馆原样 + 「📄 正文外壳」「💭 思维链」接回；开 → 重新接管 */
await page.evaluate(() => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim() === '🎨 显示'); el && el.click(); });
await page.waitForTimeout(900);
/* 手机上显示面板分页签，「消息」一组在自己的页签里 */
if (MOBILE) { await page.evaluate(() => { const l = document.querySelector('kami-layer'); const t = [...l.shadowRoot.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((x) => x.textContent === '消息'); t && t.focus(); t && t.click(); }); await page.waitForTimeout(400); }
const sw = await page.evaluate(() => { const l = document.querySelector('kami-layer'); const s = l && [...l.shadowRoot.querySelectorAll('[data-k="switch"]')].find((x) => x.getAttribute('aria-label') === '消息前端'); if (!s) { return null; } s.scrollIntoView(); const st = s.getAttribute('data-state'); s.click(); return st; });
await page.waitForTimeout(1200);
const off = await page.evaluate(() => ({
  active: window.KamiChatFrontend.active(), hosts: document.querySelectorAll('#chat [data-kami-msg-host]').length,
  hidden: document.querySelectorAll('#chat [data-kami-msg-hidden]').length,
  oldBody: document.querySelectorAll('#chat [data-kami-body-host]').length, oldThink: document.querySelectorAll('#chat [data-kami-native-think]').length,
  ls: localStorage.getItem('kami.msgfe'), styled: document.querySelectorAll('#chat [data-k-content], #chat .mes_text [data-k-part], #chat [data-kami-msg-body]').length, bare: [...document.querySelectorAll('#chat .mes_text')].filter((t) => t.shadowRoot).every((t) => t.shadowRoot.children.length === 1 && t.shadowRoot.firstElementChild.tagName === 'SLOT'), sheet: !!document.getElementById('kami-msg-body-style')
}));
ok(sw === 'checked' && !off.active && off.hosts === 0 && off.hidden === 0 && off.ls === '0' && off.styled === 0 && !off.sheet && off.bare, '显示面板关掉「消息前端」：宿主、排版标记与样式全部移除（.mes_text 的影子树只剩空 slot），iframe 恢复——交回酒馆渲染', { sw, ...off });
ok(off.oldBody > 0 && off.oldThink > 0, '……「📄 正文外壳」「💭 思维链」的装饰接回', off);
await page.evaluate(() => { const l = document.querySelector('kami-layer'); const s = [...l.shadowRoot.querySelectorAll('[data-k="switch"]')].find((x) => x.getAttribute('aria-label') === '消息前端'); s.click(); });
await page.waitForTimeout(1500);
const on = await page.evaluate(() => ({
  active: window.KamiChatFrontend.active(), body: document.querySelectorAll('#chat .mes_text[data-kami-msg-body]').length,
  oldBody: document.querySelectorAll('#chat [data-kami-body-host]').length, oldThink: document.querySelectorAll('#chat [data-kami-native-think]').length
}));
ok(on.active && on.body > 0 && on.oldBody === 0 && on.oldThink === 0, '重新打开：新前端接管，旧装饰收起', on);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

/* ⑩ 重载聊天、删除消息 */
await page.evaluate(() => window.SillyTavern.getContext().reloadCurrentChat()); await page.waitForTimeout(3500);
const rel = await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]'); return { body: !!mes.querySelector('.mes_text[data-kami-msg-body]'), opts: mes.querySelectorAll('[data-kami-msg-host="options"]').length, size: window.KamiChatFrontend.instance.size }; });
ok(rel.body && rel.opts === 1, '重载聊天后重新接管', rel);
await page.evaluate(async () => { const ctx = window.SillyTavern.getContext(); await ctx.deleteLastMessage(); await ctx.deleteLastMessage(); });
await page.waitForTimeout(1500);
const del = await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const mes = document.querySelector('#chat .mes[mesid="' + (ctx.chat.length - 1) + '"]'); return { opts: mes.querySelectorAll('[data-kami-msg-host="options"]').length, hidden: mes.querySelectorAll('[data-kami-msg-hidden="options"]').length }; });
ok(del.opts === 1, '删掉最新回复后，新的「最新一条」重新显示选项', del);

/* ⑪ 注销：不留任何东西 */
await page.evaluate(() => window.KamiChatFrontend.shutdown());
await page.waitForTimeout(500);
const clean = await page.evaluate(() => ({
  hosts: document.querySelectorAll('[data-kami-msg-host]').length, marks: document.querySelectorAll('[data-kami-msg], [data-kami-msg-hidden], [data-kami-msg-native-think], [data-kami-msg-body], #chat [data-k-content]').length,
  style: !!document.getElementById('kami-msg-host-style'), api: !!window.KamiChatFrontend
}));
ok(!clean.hosts && !clean.marks && !clean.style && !clean.api, '脚本注销后：宿主、标记、宿主样式、全局对象全部移除', clean);
ok(errors.length === 0, '没有页面错误', errors.join(' | '));
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
await b.close();
process.exit(fail ? 1 : 0);
