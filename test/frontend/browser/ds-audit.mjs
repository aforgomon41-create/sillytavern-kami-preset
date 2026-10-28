#!/usr/bin/env node
/**
 * 设计系统实际渲染审计（前端契约第 14 节「实际渲染对比度矩阵」）：
 *   node test/frontend/browser/ds-audit.mjs [--quick] [--shots]
 * 皮肤 × 明暗 × 宽度：在敌意宿主页里渲染展示台，逐个文字元素读计算样式，按实际叠加后的背景算对比度；
 * 另查输入框与占位文字、悬停态、下拉弹层与提示框、样式隔离、窄屏横向溢出。
 * 需要先 node build/frontend-build.mjs；Playwright 取自 KAMI_TOOLS（默认 /workspace/tools）。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const QUICK = process.argv.includes('--quick');
const SHOTS = process.argv.includes('--shots');

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const BASE = 'http://127.0.0.1:' + server.address().port + '/test/frontend/playground/index.html';

/* 在页面里执行的审计函数：返回 { checked, failures[] } */
function auditInPage(scopeSel) {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) { return null; } const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; };
  const up = (el) => el.parentElement || (el.getRootNode() && el.getRootNode().host) || null;
  /* 实际背景：从元素往上收集背景色，遇到不透明的为止，再自底向上叠加 */
  const effectiveBg = (el) => {
    const stack = []; let n = el;
    while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) { break; } } n = up(n); }
    if (!stack.length || stack[stack.length - 1].a < 1) { return null; }
    let bg = stack.pop(); while (stack.length) { bg = over(stack.pop(), bg); } return bg;
  };
  const desc = (el) => { const parts = []; let n = el; for (let i = 0; i < 4 && n && n.getAttribute; i++) { parts.unshift((n.getAttribute('data-k') ? '[' + n.getAttribute('data-k') + ']' : n.tagName.toLowerCase()) + (n.getAttribute('data-k-part') ? '.' + n.getAttribute('data-k-part') : '')); n = up(n); } return parts.join(' > '); };
  const skip = (el) => el.closest('[data-k-ornament], [aria-hidden="true"], [disabled], [data-disabled], [aria-disabled="true"]');
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0; };
  const sr = document.querySelector('kami-layer').shadowRoot;
  const scope = scopeSel ? sr.querySelectorAll(scopeSel) : [sr];
  const failures = []; let checked = 0;
  const check = (el, fgColor, min, what) => {
    const bg = effectiveBg(el); const fg = parse(fgColor);
    if (!bg) { failures.push({ el: desc(el), what, problem: '一路透明到宿主页（没有铺底的表面）' }); return; }
    const f = fg.a < 1 ? over(fg, bg) : fg; const r = ratio(f, bg); checked++;
    if (r < min - 0.01) { failures.push({ el: desc(el), what, ratio: Math.round(r * 100) / 100, min, text: (el.textContent || '').trim().slice(0, 20) }); }
  };
  for (const s of scope) {
    for (const el of (s.nodeType === 1 ? [s, ...s.querySelectorAll('*')] : s.querySelectorAll('*'))) {
      if (skip(el) || !visible(el)) { continue; }
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { check(el, getComputedStyle(el).color, 4.5, '文字'); }
      if (el.matches('input, textarea')) {
        if (el.value) { check(el, getComputedStyle(el).color, 4.5, '输入值'); }
        if (el.placeholder) { check(el, getComputedStyle(el, '::placeholder').color, 3, '占位'); }
      }
    }
  }
  return { checked, failures };
}

const skins = QUICK ? ['fallback'] : ['fallback', 'paper', 'abyss'];
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
  if (skin === 'fallback' && corr) { problems.push(combo + ' · 兜底皮肤出现自动校正 ' + corr + ' 处'); }
  await page.close();
}
await browser.close(); server.close();
console.log('组合 ' + combos + ' 个，核对 ' + total + ' 处文字配对');
if (problems.length) {
  console.log('问题 ' + problems.length + ' 条（前 30 条）：'); problems.slice(0, 30).forEach((p) => console.log('  ' + p));
  process.exit(1);
}
console.log('全部通过');
