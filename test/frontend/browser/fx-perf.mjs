#!/usr/bin/env node
/**
 * 碎裂溢光的性能实测：node test/frontend/browser/fx-perf.mjs
 * 在「碎光」预览页里快速连点 40 次各类组件，记录每帧耗时与长任务（>50ms）。
 * 场景：PC（不降速）、手机（触屏 + CPU 降速 4 倍，模拟中低端机）；对照组：关闭碎光特效。
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
const browser = await chromium.launch();
const SEL = ['[data-k="card"][data-role="choice"]', '[data-k="switch"]', '[data-k="button"]:not([data-variant="primary"])', '[data-k="tabs"] [data-k-part="tab"]'];

async function run(name, ctxOpts, throttle, fxOn) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(base + '/design/previews/suiguang/index.html'); await page.waitForTimeout(600);
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  if (!fxOn) { await page.locator('kami-layer [data-k="switch"]').first().click(); await page.waitForTimeout(300); }
  /* 开始记录：rAF 帧间隔 + 长任务 */
  await page.evaluate(() => {
    window.__frames = []; window.__long = [];
    let last = performance.now();
    const tick = (now) => { window.__frames.push(now - last); last = now; if (window.__rec) { requestAnimationFrame(tick); } };
    window.__rec = true; requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false }); } catch (e) { /* 不支持 */ }
  });
  const targets = [];
  for (const s of SEL) { const loc = page.locator('kami-layer ' + s); const n = Math.min(await loc.count(), 4); for (let i = 0; i < n; i++) { targets.push(loc.nth(i)); } }
  const boxes = [];
  for (const t of targets) { const bb = await t.boundingBox(); if (bb && bb.y > 0 && bb.y < (ctxOpts.viewport.height - 40)) { boxes.push(bb); } }
  for (let i = 0; i < 40; i++) {
    const bb = boxes[i % boxes.length];
    const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    if (ctxOpts.hasTouch) { await page.touchscreen.tap(x, y); } else { await page.mouse.click(x, y); }
    await page.waitForTimeout(70);   /* 每秒约 10 次，比真人连点还快 */
  }
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => { window.__rec = false; const f = window.__frames.slice(2).sort((a, b) => a - b); const pct = (p) => f[Math.min(f.length - 1, Math.floor(f.length * p))]; return { frames: f.length, p50: pct(0.5), p95: pct(0.95), max: f[f.length - 1], over33: f.filter((x) => x > 33.4).length, long: window.__long.length, longMax: Math.max(0, ...window.__long) }; });
  const fmt = (x) => Math.round(x * 10) / 10;
  console.log(name.padEnd(26) + ' 帧 ' + r.frames + '  中位 ' + fmt(r.p50) + 'ms  P95 ' + fmt(r.p95) + 'ms  最长 ' + fmt(r.max) + 'ms  掉到 30 帧以下 ' + r.over33 + ' 次  长任务 ' + r.long + ' 个' + (r.long ? '（最长 ' + fmt(r.longMax) + 'ms）' : ''));
  await ctx.close();
  return r;
}
const pc = { viewport: { width: 1440, height: 950 } };
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
await run('PC · 碎光开', pc, 0, true);
await run('PC · 碎光关（对照）', pc, 0, false);
await run('手机 · CPU 降速 4 倍 · 碎光开', phone, 4, true);
await run('手机 · CPU 降速 4 倍 · 碎光关', phone, 4, false);
await browser.close(); server.close();
