// 盘点旧界面：在测试酒馆里逐个打开旧面板、逐页签截图，并提取每页的标题 / 控件 / 按钮 / 说明，供前端重设计用。
//   node capture-old-ui.mjs [输出目录]   （默认 .cache/old-ui）
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '.cache', 'old-ui'));
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const W = Number(process.env.W || 1440), H = Number(process.env.H || 1000);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: W, height: H } });
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForSelector('#send_textarea'); await page.waitForTimeout(12000);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);

/* 页内盘点：可见的标题、字段标签、按钮、开关、下拉、输入框、说明 */
const inventory = () => page.evaluate(() => {
  const root = [...document.querySelectorAll('.kami-root[data-kami-container="panel"]')].find((r) => r.getBoundingClientRect().width > 0 && r.querySelector('.kami-drop'));
  if (!root) { return null; }
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'); };
  const t = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const q = (sel) => [...root.querySelectorAll(sel)].filter(vis);
  return {
    title: t(root.querySelector('.kami-head .kami-title, .kami-title') || root).slice(0, 60),
    tabs: uniq(q('.kami-tab, [role="tab"]').map(t)),
    headings: uniq(q('.kami-card-title, .kami-section-title, h2, h3, h4, .kami-item-title, summary').map((e) => t(e).slice(0, 60))),
    labels: uniq(q('label, .kami-field-label, .kami-field > .kami-title').map((e) => t(e).slice(0, 60))),
    buttons: uniq(q('button').map((e) => t(e).slice(0, 30) || e.getAttribute('aria-label') || e.title)),
    switches: q('[role="switch"], .kami-switch').length,
    selects: q('select, [role="combobox"]').length,
    inputs: q('input:not([type="checkbox"]):not([type="radio"]), textarea').map((e) => e.placeholder || e.type).length,
    notes: uniq(q('.kami-card-note, .kami-sub, .kami-hint, .kami-note').map((e) => t(e).slice(0, 80))).slice(0, 12)
  };
});
const shot = async (name) => {
  const el = page.locator('.kami-root[data-kami-container="panel"] .kami-drop').filter({ visible: true }).first();
  try { await el.screenshot({ path: path.join(OUT, name + '.png') }); } catch (e) { await page.screenshot({ path: path.join(OUT, name + '.png') }); }
};
const report = [];
async function capturePanel(buttonText, slug) {
  await page.locator('.qr--button, .qr--buttons button', { hasText: buttonText }).first().click();
  await page.waitForTimeout(1500);
  const tabs = page.locator('.kami-root[data-kami-container="panel"] .kami-tab, .kami-root[data-kami-container="panel"] [role="tab"]').filter({ visible: true });
  const n = await tabs.count();
  if (!n) { await shot(slug); report.push({ panel: buttonText, page: '（单页）', file: slug + '.png', ...(await inventory()) }); }
  for (let i = 0; i < n; i++) {
    const name = ((await tabs.nth(i).innerText()) || ('tab' + i)).replace(/\s+/g, '').slice(0, 12);
    await tabs.nth(i).click(); await page.waitForTimeout(900);
    const file = slug + '-' + String(i + 1).padStart(2, '0') + '.png';
    await shot(file.replace(/\.png$/, ''));
    report.push({ panel: buttonText, page: name, file, ...(await inventory()) });
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const close = page.locator('.kami-root[data-kami-container="panel"] .kami-drop [data-kami-act="close"], .kami-root[data-kami-container="panel"] .kami-drop .kami-close, .kami-root[data-kami-container="panel"] .kami-drop button[title="关闭"]').filter({ visible: true });
  if (await close.count()) { await close.first().click(); await page.waitForTimeout(500); }
}
async function captureGuide() {
  await page.locator('.qr--button, .qr--buttons button', { hasText: '引导' }).first().click();
  await page.waitForTimeout(1500);
  for (let i = 1; i <= 20; i++) {
    const file = 'guide-' + String(i).padStart(2, '0') + '.png';
    await page.screenshot({ path: path.join(OUT, file) });
    const inv = await page.evaluate(() => {
      const t = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
      const root = document.querySelector('#kami-guide-root, .kami-root[data-kami-comp="guide"], .kami-root[data-kami-container="panel"]');
      if (!root) { return null; }
      const vis = [...root.querySelectorAll('h1,h2,h3,.kami-title,.kami-card-title,button,label')].filter((e) => e.getBoundingClientRect().width > 0);
      return { items: [...new Set(vis.map((e) => t(e).slice(0, 50)).filter(Boolean))].slice(0, 40) };
    });
    report.push({ panel: '🧭引导', page: '第 ' + i + ' 页', file, ...(inv || {}) });
    const next = page.locator('button', { hasText: /^(下一步|继续|我已阅读|同意|开始)/ }).filter({ visible: true });
    if (!(await next.count())) { break; }
    await next.first().click(); await page.waitForTimeout(900);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
}
for (const [btn, slug] of [['🎨', 'skin'], ['卡密预设', 'preset'], ['工具箱', 'toolbox']]) {
  try { await capturePanel(btn, slug); } catch (e) { report.push({ panel: btn, error: String(e.message || e).slice(0, 200) }); await page.keyboard.press('Escape'); }
}
try { await captureGuide(); } catch (e) { report.push({ panel: '引导', error: String(e.message || e).slice(0, 200) }); }
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(report, null, 1));
console.log('截图与盘点 → ' + OUT + '（' + report.length + ' 页）');
for (const r of report) { console.log((r.error ? '✗ ' : '· ') + r.panel + ' / ' + (r.page || '') + (r.error ? '  ' + r.error : '  按钮' + (r.buttons ? r.buttons.length : 0) + ' 开关' + (r.switches ?? '-') + ' 下拉' + (r.selects ?? '-'))); }
await b.close();
