#!/usr/bin/env node
/**
 * 消息前端：node test/frontend/browser/message.mjs（需先 node build/frontend/build-preview.mjs）
 * 在消息前端预览（模拟酒馆聊天区 + 真的消息挂载服务）上验证拍板 A–F：
 *   ① 正文排版：两字缩进（电脑 / 手机一样）、步骤注释与 <n> 标记不显示、对白 / 心理 / 场景转换有对应部件
 *   ② 思维链默认收起、显示字数；展开后排版 / 原文切换
 *   ③ 行动选项只在最新一条回复渲染；填入接在输入框已有内容后面；发送触发流式生成
 *   ④ 流式期间逐步排版（有光标、选项显示生成中），结束后出现选项、光标消失；上一条回复的选项消失
 *   ⑤ 碎光三档 × 两种宽度的实际渲染对比度、窄屏不横向溢出、敌意宿主样式不漏进来
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { auditInPage, serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const b = await chromium.launch();
const URL0 = base + '/design/previews/message/index.html';

/* 在第 n 个挂载点（-1 = 最后一个）的 Shadow DOM 里求值 */
const inMount = (page, n, fn, arg) => page.evaluate(([n, src, arg]) => {
  const ms = [...document.querySelectorAll('[data-kami-mount]')];
  const r = ms[n < 0 ? ms.length + n : n].shadowRoot;
  return (0, eval)('(' + src + ')')(r, arg);
}, [n, fn.toString(), arg]);
const ITEM = '[data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]';

for (const [label, opts] of [['电脑 1280', { viewport: { width: 1280, height: 900 } }], ['手机 390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
  console.log('\n── ' + label);
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL0 + '?scheme=light'); await page.waitForTimeout(800);

  ok((await page.evaluate(() => document.querySelectorAll('[data-kami-mount]').length)) === 2, '两条 AI 回复都挂上了');
  /* ① 正文 */
  const body = await inMount(page, -1, (r) => {
    const paras = [...r.querySelectorAll('[data-k="msg-body"] > [data-k-part="text"] > [data-k-part="para"]')];
    const text = r.querySelector('[data-k="msg-body"]').textContent;
    const fs = parseFloat(getComputedStyle(paras[0]).fontSize);
    return {
      n: paras.length, indent: parseFloat(getComputedStyle(paras[0]).textIndent) / fs,
      comment: text.includes('步骤') || text.includes('<!--'), nameTag: text.includes('<n>'),
      parts: ['dialogue', 'quote', 'thought', 'name', 'keyword', 'term', 'scene-break'].filter((p) => !r.querySelector('[data-k="msg-body"] [data-k-part="' + p + '"]')),
      leadingSpace: paras.some((p) => /^[\s　]/.test(p.textContent))
    };
  });
  ok(body.n >= 4, '正文切成段落', body.n);
  ok(Math.abs(body.indent - 2) < 0.05, '段首两字缩进', body.indent);
  ok(!body.leadingSpace, '原文的全角空格不重复缩进');
  ok(!body.comment && !body.nameTag, '步骤注释与 <n> 标记不显示');
  ok(body.parts.length === 0, '对白 / 引号 / 心理 / 角色名 / 关键词 / 专有名词 / 场景转换都有部件', body.parts);
  /* ② 思维链 */
  const think0 = await inMount(page, -1, (r) => { const t = r.querySelector('[data-k="msg-think"]'); return { state: t.getAttribute('data-state'), head: t.querySelector(':scope > [data-k-part="head"]').textContent, tools: !!t.querySelector(':scope > [data-k-part="head"] > [data-k-part="tools"]'), fold: (() => { const f = t.querySelector(':scope > [data-k-part="fold"]'); return f ? { h: f.getBoundingClientRect().height, inert: f.hasAttribute('inert'), vis: getComputedStyle(f).visibility } : null; })() }; });
  ok(think0.state === 'closed' && think0.fold && think0.fold.h < 1 && think0.fold.inert && think0.fold.vis === 'hidden', '思维链默认收起（内容收成 0 高、不可聚焦）', think0.fold);
  ok(/^奈亚子思考了\s*\d+\s*字/.test(think0.head.trim()), '收起时显示「奈亚子思考了 N 字」', think0.head);
  ok(!think0.tools, '收起时头部不显示工具');
  /* 展开时的碎光：沿内容区左边的一条竖线（2px 宽的光），不是包住整块的光框 */
  const fx = await inMount(page, -1, (r) => {
    const t = r.querySelector('[data-k="msg-think"]');
    t.scrollIntoView({ block: 'center' });   /* 预览会把聊天区滚到底，思维链可能在画面外（画面外不放特效） */
    t.querySelector(':scope > [data-k-part="head"] > [data-k-part="toggle"]').click();
    return new Promise((res) => setTimeout(() => {
      const layer = r.querySelector('[data-k-fx-layer]');
      const glows = [...layer.querySelectorAll('b')].filter((g) => g.style.display === 'block').map((g) => ({ w: parseFloat(g.style.width), h: parseFloat(g.style.height) }));
      const shards = [...layer.querySelectorAll('i')].filter((d) => d.style.display === 'block').length;
      const w = t.getBoundingClientRect().width;
      const fh = t.querySelector(':scope > [data-k-part="fold"]').getBoundingClientRect().height;
      res({ glows, shards, boxGlow: glows.some((g) => g.w > w * 0.5), midHeight: fh });
    }, 120));
  });
  ok(fx.glows.some((g) => g.w === 2 && g.h > 20) && !fx.boxGlow && fx.shards > 0, '展开：碎光沿内容区左边的线铺开（不是一圈光框）', fx);
  ok(fx.midHeight > 0, '展开：内容高度在动画中长出来', fx.midHeight);
  await page.waitForTimeout(500);
  const think1 = await inMount(page, -1, (r) => {
    return new Promise((res) => setTimeout(() => {
      const t = r.querySelector('[data-k="msg-think"]');
      const md = t.querySelector('[data-k-part="markdown"]');
      res({ toolsInHead: !!t.querySelector(':scope > [data-k-part="head"] > [data-k-part="tools"] [data-k="segmented"]'), state: t.getAttribute('data-state'), md: !!md, h: !!(md && md.querySelector('h4, h5, h6')), li: md ? md.querySelectorAll('li').length : 0, nameTag: md ? md.textContent.includes('<n>') : true });
    }, 50));
  });
  ok(think1.state === 'open' && think1.md && think1.h && think1.li >= 2, '展开后按 Markdown 排版（标题、列表）', think1);
  ok(!think1.nameTag, '思维链里的 <n> 标记也不显示');
  ok(think1.toolsInHead, '展开后排版 / 原文与复制在头部');
  const clash = await inMount(page, -1, (r) => { const h = r.querySelector('[data-k="msg-think"] > [data-k-part="head"]'); const a = h.querySelector('[data-k-part="chevron"]').getBoundingClientRect(); const b = h.querySelector('[data-k-part="tools"]').getBoundingClientRect(); const tg = h.querySelector('[data-k-part="toggle"]'); return { overlap: a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom, clipped: tg.scrollWidth > tg.clientWidth + 1 }; });
  ok(!clash.overlap && !clash.clipped, '头部的工具不挤压、不遮住「奈亚子思考了 N 字」', clash);
  const bodyHead = await inMount(page, -1, (r) => { const h = r.querySelector('[data-k="msg-body"] > [data-k-part="head"]'); const b = r.querySelector('[data-k="msg-body"]'); return { first: b.firstElementChild === h, count: h.querySelector('[data-k-part="count"]').textContent, tools: h.querySelectorAll('[data-k-part="tools"] [data-k="icon-button"]').length }; });
  ok(bodyHead.first && /\d+ 字/.test(bodyHead.count) && bodyHead.tools === 2, '正文的字数与工具在头部', bodyHead);
  const raw = await inMount(page, -1, (r) => {
    [...r.querySelectorAll('[data-k="msg-think"] [data-k="segmented"] [data-k-part="item"]')].find((x) => x.textContent === '原文').click();
    return new Promise((res) => setTimeout(() => res(!!r.querySelector('[data-k="msg-think"] [data-k-part="raw"]')), 50));
  });
  ok(raw, '切到原文视图');
  /* 搜索资料展开 */
  const search = await inMount(page, -1, (r) => {
    const s = r.querySelector('[data-k="msg-search"]');
    const head = s.querySelector(':scope > [data-k-part="head"]').textContent;
    s.querySelector(':scope > [data-k-part="head"] > [data-k-part="toggle"]').click();
    return new Promise((res) => setTimeout(() => res({ head, facts: s.querySelectorAll('[data-k-part="fact"]').length, links: s.querySelectorAll('[data-k-part="source"] a[target="_blank"][rel~="noopener"]').length }), 50));
  });
  ok(/参考了 2 个来源/.test(search.head), '搜索资料收起时一行摘要', search.head);
  ok(search.facts === 3 && search.links === 2, '展开：事实与来源链接（新标签页打开）', search);

  /* ⑤ 对比度：三档配色，思维链与搜索资料展开着 */
  for (const scheme of ['light', 'dark', 'reading']) {
    await page.evaluate((s) => [...document.querySelector('kami-layer').shadowRoot.querySelectorAll('[data-k="segmented"] [data-k-part="item"]')].find((x) => x.textContent === ({ light: '宣纸', dark: '墨', reading: '阅读' })[s]).click(), scheme);
    await page.waitForTimeout(150);
    const a = await page.evaluate(auditInPage, '@mounts');
    ok(a.failures.length === 0 && a.checked > 50, '对比度（' + scheme + '）：' + a.checked + ' 处', a.failures.slice(0, 3));
  }
  const overflow = await page.evaluate(() => [...document.querySelectorAll('[data-kami-mount]')].some((m) => m.shadowRoot.querySelector('[data-k="msg-view"]').scrollWidth > m.getBoundingClientRect().width + 1));
  ok(!overflow, '不横向溢出');
  const hostile = await inMount(page, -1, (r, sel) => { const p = r.querySelector('[data-k="msg-body"] [data-k-part="para"]'); const btn = r.querySelector(sel); return { pc: getComputedStyle(p).color, bb: getComputedStyle(btn).backgroundColor }; }, ITEM);
  ok(hostile.pc !== 'rgb(255, 0, 255)' && hostile.bb !== 'rgb(255, 0, 0)', '宿主页的全局 p / button 样式不漏进来', hostile);

  /* ③ 只有最新一条回复有选项 */
  const optCount = await page.evaluate(() => [...document.querySelectorAll('[data-kami-mount]')].map((m) => m.shadowRoot.querySelectorAll('[data-k="msg-options"]').length));
  ok(JSON.stringify(optCount) === '[0,1]', '只有最新一条回复渲染行动选项（开场白原文里也有选项）', optCount);
  const n = await inMount(page, -1, (r, sel) => r.querySelectorAll(sel).length, ITEM);
  const cnt = await inMount(page, -1, (r) => r.querySelector('[data-k="msg-options"] [data-k-part="count"]').textContent);
  ok(n === 6 && cnt.includes('6'), '显示选项个数', { n, cnt });
  const layout = await inMount(page, -1, (r, sel) => {
    const it = r.querySelector(sel); const ib = it.getBoundingClientRect();
    const head = it.querySelector(':scope > [data-k-part="item-head"]'); const t = it.querySelector(':scope > [data-k-part="text"]');
    const tb = t.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(it).paddingLeft) + it.clientLeft;
    return { typeInHead: !!head.querySelector('[data-k-part="type"]') && !!head.querySelector('[data-k-part="label"]'), textLeft: Math.round(tb.left - ib.left - pad), textW: Math.round(tb.width), innerW: Math.round(ib.width - pad * 2) };
  }, ITEM);
  ok(layout.typeInHead && layout.textLeft === 0 && Math.abs(layout.textW - layout.innerW) <= 1, '选项：类型标签与标题一起作为头部，内容占满宽度', layout);
  /* 填入：接在已有内容后面 */
  await page.fill('#send_textarea', '我想想');
  await inMount(page, -1, (r, sel) => { r.querySelectorAll(sel)[1].click(); }, ITEM);
  const filled = await page.inputValue('#send_textarea');
  ok(filled.startsWith('我想想') && filled.includes('贴着门板'), '填入：接在输入框已有内容的后面', filled);
  ok((await page.evaluate(() => document.querySelectorAll('.mes').length)) === 3, '填入不发送');
  /* 发送：流式 */
  await page.fill('#send_textarea', '');
  await inMount(page, -1, (r) => [...r.querySelectorAll('[data-k="msg-options"] [data-k="segmented"] [data-k-part="item"]')].find((x) => x.textContent === '发送').click());
  await page.waitForTimeout(100);
  await inMount(page, -1, (r, sel) => { r.querySelector(sel).click(); }, ITEM);
  await page.waitForTimeout(900);
  const mid = await page.evaluate(() => {
    const ms = [...document.querySelectorAll('[data-kami-mount]')];
    const last = ms[ms.length - 1].shadowRoot, prev = ms[ms.length - 2].shadowRoot;
    return {
      mes: document.querySelectorAll('.mes').length,
      streaming: !!last.querySelector('[data-k="msg-view"][data-streaming]'),
      thinkLive: (last.querySelector('[data-k="msg-think"] > [data-k-part="head"]') || {}).textContent || '',
      prevOptions: prev.querySelectorAll('[data-k="msg-options"]').length
    };
  });
  ok(mid.mes === 5, '发送：新增用户消息与回复', mid.mes);
  ok(mid.streaming, '生成中：回复处于流式状态');
  ok(mid.prevOptions === 0, '新回复开始生成后，上一条回复的选项消失');
  await page.waitForFunction(() => { const ms = [...document.querySelectorAll('[data-kami-mount]')]; return !!ms[ms.length - 1].shadowRoot.querySelector('[data-k="msg-body"] [data-k-part="caret"]'); }, null, { timeout: 8000 });
  const during = await inMount(page, -1, (r) => ({ caret: !!r.querySelector('[data-k-part="caret"]'), paras: r.querySelectorAll('[data-k="msg-body"] [data-k-part="para"]').length, opts: r.querySelectorAll('[data-k="msg-options"] [data-k-part="list"]').length }));
  ok(during.caret && during.paras >= 1, '生成期间正文就按我们的排版逐步出现（有光标）', during);
  ok(during.opts === 0, '生成期间不显示选项列表');
  await page.waitForFunction(() => { const ms = [...document.querySelectorAll('[data-kami-mount]')]; return !ms[ms.length - 1].shadowRoot.querySelector('[data-streaming]'); }, null, { timeout: 15000 });
  const end = await inMount(page, -1, (r, sel) => ({ caret: !!r.querySelector('[data-k-part="caret"]'), opts: r.querySelectorAll(sel).length, mode: r.querySelector('[data-k="msg-options"]').getAttribute('data-mode') }), ITEM);
  ok(!end.caret && end.opts === 6, '生成结束：光标消失、出现选项', end);
  ok(end.mode === 'send', '选项模式在新回复上保持（发送）', end.mode);
  /* 行动选项可折叠；默认状态跟显示面板的设置（localStorage kami.options.folded） */
  const optFold = async () => inMount(page, -1, (r) => { const o = r.querySelector('[data-k="msg-options"]'); if (!o) { return null; } const f = o.querySelector(':scope > [data-k-part="fold"]'); return { state: o.getAttribute('data-state'), h: f ? f.getBoundingClientRect().height : -1, inert: f ? f.hasAttribute('inert') : null }; });
  const o0 = await optFold();
  await inMount(page, -1, (r) => r.querySelector('[data-k="msg-options"] > [data-k-part="head"] > [data-k-part="toggle"]').click());
  await page.waitForTimeout(700);
  const o1 = await optFold();
  ok(o0 && o0.state === 'open' && o0.h > 20 && o1.state === 'closed' && o1.h < 1 && o1.inert, '行动选项：点头部收起（0 高、不可聚焦），默认展开', { o0, o1 });
  await page.evaluate(() => localStorage.setItem('kami.options.folded', '1'));
  await page.reload(); await page.waitForTimeout(900);
  const o2 = await optFold();
  ok(o2 && o2.state === 'closed', '设置「行动选项默认收起」后新渲染的选项是收起的', o2);
  await page.evaluate(() => localStorage.removeItem('kami.options.folded'));
  ok(errors.length === 0, '没有页面错误', errors);
  await ctx.close();
}
await b.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
