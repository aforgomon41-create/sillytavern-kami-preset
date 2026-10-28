// 旧界面的对比度基线：用新系统同一套算法（按实际叠加后的背景）审计旧面板每个页签与引导每一页。
//   node audit-old-ui.mjs   → .cache/old-ui/contrast-baseline.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, '.cache', 'old-ui');
fs.mkdirSync(OUT, { recursive: true });
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/'); await page.waitForSelector('#send_textarea'); await page.waitForTimeout(12000);
await page.keyboard.press('Escape'); await page.waitForTimeout(600);

const closePanels = () => page.evaluate(() => {
  for (const r of document.querySelectorAll('.kami-root[data-kami-container="panel"]')) {
    if (!r.getBoundingClientRect().width) { continue; }
    const b = [...r.querySelectorAll('button')].find((x) => /^[×✕✖]$/.test(x.textContent.trim()) || /关闭/.test((x.getAttribute('aria-label') || '') + (x.title || '')));
    if (b) { b.click(); }
  }
});
/* 旧面板可能盖住按钮条：直接用脚本点按钮 */
const openHub = (text) => page.evaluate((t) => { const b = [...document.querySelectorAll('.qr--button, .qr--buttons button')].find((x) => x.textContent.includes(t)); if (b) { b.click(); } return !!b; }, text);
await closePanels(); await page.waitForTimeout(600);
const audit = () => page.evaluate(() => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) { return null; } const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const bgOf = (el) => { const st = []; let n = el; while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { st.push(c); if (c.a >= 1) { break; } } n = n.parentElement; } if (!st.length) { return { r: 0, g: 0, b: 0, a: 1 }; } let bg = st[st.length - 1].a >= 1 ? st.pop() : { r: 0, g: 0, b: 0, a: 1 }; while (st.length) { bg = over(st.pop(), bg); } return bg; };
  const roots = [...document.querySelectorAll('.kami-root')].filter((r) => r.getBoundingClientRect().width > 300 && !r.closest('#chat'));
  const fails = []; let checked = 0; const items = new Set();
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('[hidden],[aria-hidden="true"],[disabled]')) { continue; }
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { continue; }
    if (r.bottom < 0 || r.top > innerHeight) { continue; }   /* 只算当前屏幕内可见的 */
    let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { op *= Number(getComputedStyle(n).opacity); }
    const bg = bgOf(el); let fg = parse(cs.color); fg = { ...fg, a: fg.a * op }; const f = fg.a < 1 ? over(fg, bg) : fg;
    const k = ratio(f, bg); checked++;
    const txt = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (/^(H\d|BUTTON|LABEL)$/.test(el.tagName) || el.className && /title/.test(String(el.className))) { items.add(txt); }
    if (k < 4.5) { fails.push({ text: txt, ratio: Math.round(k * 100) / 100 }); }
  }
  return { checked, failed: fails.length, worst: fails.sort((a, c) => a.ratio - c.ratio).slice(0, 6), items: [...items].slice(0, 40) };
});
const report = [];
for (const [btn, name] of [['🎨', '皮肤管理'], ['卡密预设', '预设设置'], ['工具箱', '工具箱']]) {
  await openHub(btn); await page.waitForTimeout(1500);
  const tabs = page.locator('.kami-root[data-kami-container="panel"] .kami-tab, .kami-root[data-kami-container="panel"] [role="tab"]').filter({ visible: true });
  const n = await tabs.count();
  for (let i = 0; i < n; i++) { const t = (await tabs.nth(i).innerText()).trim(); await tabs.nth(i).click(); await page.waitForTimeout(900); const a = await audit(); delete a.items; report.push({ panel: name, page: t, ...a }); }
  /* 旧面板焦点不在面板里时 Esc 关不掉：点它自己的关闭按钮 */
  await closePanels(); await page.waitForTimeout(600);
}
await openHub('引导'); await page.waitForTimeout(1500);
for (let i = 1; i <= 15; i++) {
  report.push({ panel: '引导', page: '第 ' + i + ' 页', ...(await audit()) });
  const next = page.locator('button', { hasText: /^(下一步|继续|我已阅读|同意|开始)/ }).filter({ visible: true });
  if (!(await next.count())) { break; }
  await next.first().click(); await page.waitForTimeout(900);
}
fs.writeFileSync(path.join(OUT, 'contrast-baseline.json'), JSON.stringify(report, null, 1));
let c = 0, f = 0;
for (const r of report) { c += r.checked; f += r.failed; console.log(r.panel + ' / ' + r.page + '：' + r.failed + ' / ' + r.checked + ' 不达标' + (r.worst.length ? '  最差：' + r.worst.slice(0, 3).map((w) => '「' + w.text + '」' + w.ratio).join(' ') : '')); }
console.log('合计：' + f + ' / ' + c + ' 处文字低于 4.5:1');
await b.close();
