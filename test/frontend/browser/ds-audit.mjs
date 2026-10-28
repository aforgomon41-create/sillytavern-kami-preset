#!/usr/bin/env node
/**
 * 设计系统实际渲染审计（前端契约第 14 节「实际渲染对比度矩阵」）：
 *   node test/frontend/browser/ds-audit.mjs [--quick] [--shots]
 * 皮肤 × 明暗 × 宽度：在敌意宿主页里渲染展示台，逐个文字元素读计算样式，按实际叠加后的背景算对比度；
 * 另查输入框与占位文字、悬停态、下拉弹层与提示框、样式隔离、窄屏横向溢出。
 * 需要先 node build/frontend-build.mjs；Playwright 取自 KAMI_TOOLS（默认 /workspace/tools）。
 */
import path from 'node:path';
import { auditInPage, serve } from './audit-lib.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const QUICK = process.argv.includes('--quick');
const SHOTS = process.argv.includes('--shots');

const { server, base } = serve(ROOT);
const BASE = base + '/test/frontend/playground/index.html';

const ONLY = (process.argv.find((a) => a.startsWith('--skin=')) || '').slice(7);
const skins = ONLY ? [ONLY] : QUICK ? ['fallback'] : ['suiguang', 'fallback', 'paper', 'abyss'];
const schemes = ['dark', 'light'];
const widths = QUICK ? [390] : [320, 390, 1440];
const browser = await chromium.launch();
let total = 0, combos = 0; const problems = [];
const note = (combo, items) => { for (const it of items) { problems.push(combo + ' · ' + JSON.stringify(it)); } };

for (const skin of skins) for (const scheme of schemes) for (const w of widths) {
  const combo = skin + '/' + scheme + '/' + w;
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE + '?skin=' + skin + '&scheme=' + scheme);
  await page.waitForSelector('kami-layer');
  await page.waitForTimeout(150);
  combos++;
  /* 1. 静态：全部文字 */
  let r = await page.evaluate(auditInPage, null); total += r.checked; note(combo, r.failures);
  /* 2. 悬停态：每类可悬停控件悬停后只审它自己 */
  for (const sel of ['[data-k="button"]:not([disabled])', '[data-k="icon-button"]', '[data-k="select"][data-k-part="trigger"]', '[data-k="card"][data-role="choice"]', '[data-k="tabs"] [data-k-part="tab"]:not([data-disabled])']) {
    const loc = page.locator('[data-testid="surface-surface-1"] ' + sel);
    const n = Math.min(await loc.count(), 6);
    for (let i = 0; i < n; i++) {
      await loc.nth(i).hover();
      await page.evaluate(() => new Promise((res) => setTimeout(res, 260)));
      const marked = await loc.nth(i).evaluate((el) => { el.setAttribute('data-audit-hover', ''); return true; });
      if (marked) { r = await page.evaluate(auditInPage, '[data-audit-hover]'); total += r.checked; note(combo + ' 悬停', r.failures); }
      await loc.nth(i).evaluate((el) => el.removeAttribute('data-audit-hover'));
    }
  }
  await page.mouse.move(0, 0);
  /* 3. 下拉弹层 */
  await page.locator('[data-testid="surface-surface-1"] [data-k="select"][data-k-part="trigger"]').first().click();
  await page.waitForTimeout(200);
  r = await page.evaluate(auditInPage, '[data-k="select"][data-k-part="content"]'); total += r.checked; note(combo + ' 下拉', r.failures);
  if (r.checked === 0) { problems.push(combo + ' · 下拉弹层没打开'); }
  await page.keyboard.press('Escape');
  /* 4. 提示框 */
  await page.locator('[data-testid="surface-bg"] [data-testid="tip"]').first().hover();
  await page.waitForTimeout(600);
  r = await page.evaluate(auditInPage, '[data-k="tooltip"][data-k-part="content"]'); total += r.checked; note(combo + ' 提示', r.failures);
  if (r.checked === 0) { problems.push(combo + ' · 提示框没出现'); }
  await page.mouse.move(0, 0);
  /* 5. 对话框 */
  await page.locator('[data-testid="open-dialog"]').click();
  await page.waitForTimeout(250);
  r = await page.evaluate(auditInPage, '[data-k="dialog"][data-k-part="content"]'); total += r.checked; note(combo + ' 对话框', r.failures);
  if (r.checked === 0) { problems.push(combo + ' · 对话框没打开'); }
  if (SHOTS) { await page.screenshot({ path: path.join(ROOT, '.cache', 'audit-' + skin + '-' + scheme + '-' + w + '.png') }); }
  await page.keyboard.press('Escape');
  /* 5b. 面板（窄屏是贴底抽屉） */
  await page.locator('[data-testid="open-panel"]').click();
  await page.waitForTimeout(250);
  r = await page.evaluate(auditInPage, '[data-k="panel"]'); total += r.checked; note(combo + ' 面板', r.failures);
  if (r.checked === 0) { problems.push(combo + ' · 面板没打开'); }
  await page.keyboard.press('Escape');
  /* 6. 隔离与溢出 */
  const iso = await page.evaluate(() => {
    const sr = document.querySelector('kami-layer').shadowRoot;
    const b = sr.querySelector('[data-k="button"]'); const cs = getComputedStyle(b);
    const g = sr.querySelector('[data-testid="gallery"]');
    return { red: cs.backgroundColor === 'rgb(255, 0, 0)' || cs.color === 'rgb(255, 0, 0)', courier: /Courier/.test(cs.fontFamily), overflow: g.scrollWidth - g.clientWidth };
  });
  if (iso.red || iso.courier) { problems.push(combo + ' · 宿主样式漏进来了 ' + JSON.stringify(iso)); }
  if (iso.overflow > 1) { problems.push(combo + ' · 横向溢出 ' + iso.overflow + 'px'); }
  if (errors.length) { problems.push(combo + ' · 页面错误 ' + errors.join(' | ')); }
  const corr = await page.evaluate(() => window.__corrections.length);
  if ((skin === 'fallback' || skin === 'suiguang') && corr) { problems.push(combo + ' · 兜底皮肤出现自动校正 ' + corr + ' 处'); }
  await page.close();
}
await browser.close(); server.close();
console.log('组合 ' + combos + ' 个，核对 ' + total + ' 处文字配对');
if (problems.length) {
  console.log('问题 ' + problems.length + ' 条（前 30 条）：'); problems.slice(0, 30).forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('全部通过');
