#!/usr/bin/env node
/**
 * 手机触屏交互：node test/frontend/browser/touch.mjs（需先 npm run build:frontend 与 node build/frontend/build-preview.mjs）
 * ① 手指在按钮 / 卡片上滑动（只是滚面板）不触发碎光，也不改选中；真正点按才触发
 * ② 预设设置预览：在内容区左右滑动切换页签；从页签条上开始的横滑不翻页；翻页后页签条把当前页签滚进视野
 * ③ 选择卡：没有勾选框；标题不压到右上角的说明按钮下面、不超出卡片；条目名中间的 emoji 也换成图标
 * ④ 抽屉收回：内容区没滚到顶时下拉只滚内容；滚到顶后从内容区下拉、或从标题栏下拉都能收回
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
/* 用 CDP 发真实的触摸序列（按下 → 移动若干步 → 抬起），浏览器会像真机一样判定滚动并发 pointercancel */
async function touchPath(points) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0][0], y: points[0][1] }] });
  for (const [x, y] of points.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const fxSeen = () => page.evaluate(() => { const r = document.querySelector('kami-layer').shadowRoot; return r.querySelectorAll('[data-k-fx-layer] i[style*="display: block"]').length + r.querySelectorAll('[data-k-fx="active"]').length; });

await page.goto(base + '/design/previews/preset-panel/index.html'); await page.waitForTimeout(700);
/* ① 在第一张选择卡上竖向滑动 */
const card = page.locator('kami-layer [data-k="card"][data-role="choice"]').nth(1);
const bb = await card.boundingBox();
const sel0 = await card.getAttribute('data-state');
const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
await touchPath(Array.from({ length: 10 }, (_, i) => [cx, cy - i * 12]));
await page.waitForTimeout(60);
ok((await fxSeen()) === 0, '在卡片上滑动（滚面板）不触发碎光');
ok((await card.getAttribute('data-state')) === sel0, '在卡片上滑动不改变选中');
await page.waitForTimeout(800);
const bb2 = await card.boundingBox();
await touchPath([[bb2.x + bb2.width / 2, bb2.y + bb2.height / 2]]);
await page.waitForTimeout(80);
ok((await fxSeen()) > 0, '真正点按才触发碎光');
await page.waitForTimeout(900);

/* ② 页签手势 */
const active = () => page.evaluate(() => document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="tabs"] [data-k-part="tab"][data-state="active"]').textContent.trim());
const t0 = await active();
const panels = await page.locator('kami-layer [data-k="tabs"] > [data-k-part="panels"]').boundingBox();
const y = panels.y + 120;
await touchPath(Array.from({ length: 8 }, (_, i) => [320 - i * 30, y]));
await page.waitForTimeout(300);
const t1 = await active();
ok(t1 !== t0, '内容区向左滑：切到下一个页签', { t0, t1 });
await touchPath(Array.from({ length: 8 }, (_, i) => [70 + i * 30, y]));
await page.waitForTimeout(300);
ok((await active()) === t0, '向右滑：回到上一个页签');
const list = await page.locator('kami-layer [data-k="tabs"] > [data-k-part="list"]').boundingBox();
await touchPath(Array.from({ length: 8 }, (_, i) => [320 - i * 30, list.y + list.height / 2]));
await page.waitForTimeout(300);
ok((await active()) === t0, '在页签条上横滑（滚动页签条）不翻页');
/* 概览页「当前生效」那一行可横向滚动（data-k-swipe="off"）：在它上面横滑只滚这一行 */
const chips = page.locator('kami-layer [data-k-swipe="off"]').first();
if (await chips.count()) {
  const cb = await chips.boundingBox();
  const sl0 = await chips.evaluate((el) => el.scrollLeft);
  await touchPath(Array.from({ length: 8 }, (_, i) => [320 - i * 30, cb.y + cb.height / 2]));
  await page.waitForTimeout(400);
  ok((await active()) === t0, '在「当前生效」行上横滑不翻页');
  ok((await chips.evaluate((el) => el.scrollLeft)) > sl0, '……而是滚动这一行');
}
await touchPath(Array.from({ length: 8 }, (_, i) => [200, y + 200 - i * 25]));
await page.waitForTimeout(300);
ok((await active()) === t0, '竖向滑动（滚内容）不翻页');

/* 翻页后页签条跟着走：一路向左滑到最后一页，当前页签始终完整可见 */
const inView = () => page.evaluate(() => {
  const r = document.querySelector('kami-layer').shadowRoot;
  const bar = r.querySelector('[data-k="tabs"] > [data-k-part="list"]').getBoundingClientRect();
  const t = r.querySelector('[data-k="tabs"] [data-k-part="tab"][data-state="active"]').getBoundingClientRect();
  return t.left >= bar.left - 1 && t.right <= bar.right + 1;
});
let allVisible = true;
for (let n = 0; n < 9; n++) {
  await touchPath(Array.from({ length: 8 }, (_, i) => [320 - i * 30, y]));
  await page.waitForTimeout(450);
  if (!(await inView())) { allVisible = false; }
}
ok(allVisible, '连续向左翻页：当前页签始终在页签条可见范围内');
/* 最后一页 = 页签条里的最后一个（「关于」2026-10-29 挪去工具箱后是预设里的最后一页） */
const lastTab = await page.evaluate(() => { const t = [...document.querySelector('kami-layer').shadowRoot.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')]; return t[t.length - 1].textContent; });
ok((await active()) === lastTab, '翻到最后一页后停住（不循环）', { now: await active(), lastTab });
/* 往回滑时落点取当前页第一个分区标题（输入框上横滑按设计不翻页，固定高度可能正好落在输入框上） */
const titleY = () => page.evaluate((fb) => { const r = document.querySelector('kami-layer').shadowRoot; const h = [...r.querySelectorAll('[data-k="tabs"] [role="tabpanel"][data-state="active"] [data-k="setting-section"] > [data-k-part="head"]')].find((x) => x.getClientRects().length); if (!h) { return fb; } const b = h.getBoundingClientRect(); return b.y + b.height / 2; }, y);
for (let n = 0; n < 9; n++) { const yy = await titleY(); await touchPath(Array.from({ length: 8 }, (_, i) => [70 + i * 30, yy])); await page.waitForTimeout(300); }
ok((await inView()) && (await active()) === t0, '向右翻回第一页，页签条也滚回来');

/* ③ 选择卡（找一个有长名字的页签：推理选项） */
await page.evaluate(() => {
  const r = document.querySelector('kami-layer').shadowRoot;
  [...r.querySelectorAll('[data-k="tabs"] [data-k-part="tab"]')].find((t) => t.textContent.includes('推理选项')).focus();
});
await page.waitForTimeout(400);
ok((await active()).includes('推理选项'), '切到「推理选项」页签', await active());
const cards = await page.evaluate(() => {
  const r = document.querySelector('kami-layer').shadowRoot;
  const out = { indicators: r.querySelectorAll('[data-k="card"][data-role="choice"] [data-k-part="indicator"]').length, overlap: [], overflow: [] };
  for (const c of r.querySelectorAll('[data-k="card"][data-role="choice"]')) {
    if (!c.getClientRects().length) { continue; }
    const cb = c.getBoundingClientRect();
    const label = c.querySelector('[data-k-part="title"] [data-k-part="label"]');
    if (!label) { continue; }
    const name = label.getAttribute('title');
    for (const rr of label.getClientRects()) { if (rr.right > cb.right + 0.5 || rr.left < cb.left - 0.5) { out.overflow.push(name); } }
    const info = c.querySelector(':scope > [data-k-part="info"]');
    if (info) {
      const ib = info.getBoundingClientRect();
      const rng = document.createRange(); rng.selectNodeContents(label);
      for (const rr of rng.getClientRects()) { if (rr.width && rr.right > ib.left && rr.left < ib.right && rr.bottom > ib.top && rr.top < ib.bottom) { out.overlap.push(name); break; } }
    }
  }
  return out;
});
ok(cards.indicators === 0, '选择卡没有勾选框', cards.indicators);
ok(cards.overflow.length === 0, '选择卡标题不超出卡片', cards.overflow);
ok(cards.overlap.length === 0, '选择卡标题不压到说明按钮', cards.overlap);
const midEmoji = await page.evaluate(() => {
  const r = document.querySelector('kami-layer').shadowRoot;
  /* 名字里任何位置的 emoji 都应该换成了图标：标签的文字里不再出现 emoji */
  const bad = [];
  for (const l of r.querySelectorAll('[data-k-part="label"][title]')) {
    const txt = [...l.querySelectorAll(':scope > span:not([data-k-part="icon"])')].map((x) => x.textContent).join('');
    if (/\p{Extended_Pictographic}/u.test(txt.replace(/[\u0030-\u0039#*]/g, ''))) { bad.push(l.getAttribute('title')); }
  }
  return bad;
});
ok(midEmoji.length === 0, '条目名里所有位置的 emoji 都换成了图标', midEmoji);

/* ④ 抽屉收回 */
const panelEl = () => page.evaluate(() => !!document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"]'));
const bodyTop = () => page.evaluate(() => document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"] > [data-k-part="body"]').scrollTop);
await page.evaluate(() => { document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"] > [data-k-part="body"]').scrollTop = 400; });
await page.waitForTimeout(100);
const pb = await page.locator('kami-layer [data-k="panel"] > [data-k-part="body"]').boundingBox();
const px = pb.x + pb.width / 2;
await touchPath(Array.from({ length: 10 }, (_, i) => [px, pb.y + 120 + i * 30]));
await page.waitForTimeout(500);
ok((await panelEl()) && (await bodyTop()) < 400, '内容没滚到顶时下拉：只滚内容，不收回', await bodyTop());
await page.evaluate(() => { document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"] > [data-k-part="body"]').scrollTop = 0; });
await page.waitForTimeout(100);
await touchPath(Array.from({ length: 4 }, (_, i) => [px, pb.y + 160 + i * 20]));
await page.waitForTimeout(500);
ok(await panelEl(), '从内容区轻轻下拉一点：回弹，不收回');
await touchPath(Array.from({ length: 12 }, (_, i) => [px, pb.y + 160 + i * 40]));
await page.waitForTimeout(600);
ok(!(await panelEl()), '内容滚到顶后从内容区下拉：收回抽屉');
await page.reload(); await page.waitForTimeout(700);
const hb = await page.locator('kami-layer [data-k="panel"] > [data-k-part="head"]').boundingBox();
await touchPath(Array.from({ length: 12 }, (_, i) => [hb.x + 60, hb.y + hb.height / 2 + i * 40]));
await page.waitForTimeout(600);
ok(!(await panelEl()), '从标题栏下拉：收回抽屉');
await b.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
