#!/usr/bin/env node
/**
 * 面板交互：node test/frontend/browser/panel.mjs（需先 npm run build:frontend）
 * 宽屏：居中、标题栏拖动、拖出视口被夹回、右下角缩放、方向键缩放、窗口变小收回、拖动后标题栏按钮仍可点、Esc 关闭
 * 窄屏：贴底抽屉、小幅下拉回弹、大幅下拉关闭
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
const URL = base + '/test/frontend/playground/index.html?panel=1';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const browser = await chromium.launch();
const box = (page) => page.locator('kami-layer [data-k="panel"]').boundingBox();

{ /* 宽屏 */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL); await page.waitForTimeout(300);
  const p = page.locator('kami-layer [data-k="panel"]');
  ok((await p.getAttribute('data-layout')) === 'floating', '宽屏是浮动窗');
  let b = await box(page);
  ok(Math.abs(b.x + b.width / 2 - 720) < 2 && Math.abs(b.y + b.height / 2 - 450) < 2, '初始居中', b);
  const head = page.locator('kami-layer [data-k="panel"] > [data-k-part="head"] > [data-k-part="title"]');
  const hb = await head.boundingBox();
  await page.mouse.move(hb.x + 20, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(hb.x + 120, hb.y + hb.height / 2 + 60, { steps: 6 }); await page.mouse.up();
  const b2 = await box(page);
  ok(Math.abs(b2.x - b.x - 100) <= 1 && Math.abs(b2.y - b.y - 60) <= 1, '标题栏拖动', { from: b, to: b2 });
  ok(await page.evaluate(() => !!window.__geom), '拖完回报几何（供使用方保存）');
  await page.mouse.move(b2.x + 40, b2.y + 20); await page.mouse.down(); await page.mouse.move(-800, -600, { steps: 6 }); await page.mouse.up();
  b = await box(page);
  ok(b.x >= 8 && b.y >= 8, '拖出视口被夹回（标题栏始终可见）', b);
  await page.locator('kami-layer [data-testid="panel-action"]').click({ timeout: 3000 });
  ok(true, '拖动后标题栏里的按钮仍可点（不用 setPointerCapture）');
  const rz = await page.locator('kami-layer [data-k="panel"] > [data-k-part="resize"]').boundingBox();
  const before = await box(page);
  await page.mouse.move(rz.x + 10, rz.y + 10); await page.mouse.down(); await page.mouse.move(rz.x + 110, rz.y + 60, { steps: 6 }); await page.mouse.up();
  b = await box(page);
  ok(Math.abs(b.width - before.width - 100) <= 1 && Math.abs(b.height - before.height - 50) <= 1, '右下角缩放', { before, after: b });
  await page.locator('kami-layer [data-k="panel"] > [data-k-part="resize"]').focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowUp');
  const b3 = await box(page);
  ok(Math.abs(b3.width - b.width + 16) <= 1 && Math.abs(b3.height - b.height + 48) <= 1, '方向键缩放（Shift 大步）', { b, b3 });
  await page.setViewportSize({ width: 1100, height: 600 }); await page.waitForTimeout(200);
  b = await box(page);
  ok(b.x + b.width <= 1100 - 7 && b.y + b.height <= 600 - 7, '窗口变小后收回可见范围', b);
  await page.locator('kami-layer [data-k="panel"]').focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok((await page.locator('kami-layer [data-k="panel"]').count()) === 0 && await page.evaluate(() => window.__panelClosed === 1), 'Esc 关闭');
  await page.close();
}
{ /* 窄屏：贴底抽屉 */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForTimeout(300);
  const p = page.locator('kami-layer [data-k="panel"]');
  ok((await p.getAttribute('data-layout')) === 'sheet', '窄屏是贴底抽屉');
  let b = await box(page);
  ok(Math.abs(b.y + b.height - 844) <= 1 && Math.abs(b.width - 390) <= 1, '抽屉贴底、铺满宽度', b);
  const drag = async (dy) => {
    const t = await page.locator('kami-layer [data-k="panel"] > [data-k-part="head"] > [data-k-part="title"]').boundingBox();
    await page.mouse.move(t.x + 30, t.y + 5); await page.mouse.down(); await page.mouse.move(t.x + 30, t.y + 5 + dy, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(400);
  };
  await drag(60);
  b = await box(page);
  ok((await p.count()) === 1 && Math.abs(b.y + b.height - 844) <= 1, '小幅下拉回弹', b);
  await drag(400);
  ok((await page.locator('kami-layer [data-k="panel"]').count()) === 0, '大幅下拉关闭');
  await ctx.close();
}
await browser.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
