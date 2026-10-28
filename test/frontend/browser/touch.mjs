#!/usr/bin/env node
/**
 * 手机触屏交互：node test/frontend/browser/touch.mjs（需先 npm run build:frontend 与 node build/frontend/build-preview.mjs）
 * ① 手指在按钮 / 卡片上滑动（只是滚面板）不触发碎光，也不改选中；真正点按才触发
 * ② 预设设置预览：在内容区左右滑动切换页签；从页签条上开始的横滑不翻页
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
await touchPath(Array.from({ length: 8 }, (_, i) => [200, y + 200 - i * 25]));
await page.waitForTimeout(300);
ok((await active()) === t0, '竖向滑动（滚内容）不翻页');
await b.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
