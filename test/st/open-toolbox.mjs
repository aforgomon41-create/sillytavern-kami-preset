import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/'); await page.waitForSelector('#send_textarea'); await page.waitForTimeout(12000);
// 引导会自动弹出，先关掉
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
await page.locator('.qr--button, .qr--buttons button', { hasText: '工具箱' }).first().click();
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const panels = Array.from(document.querySelectorAll('.kami-root[data-kami-container="panel"]')).filter(p => p.querySelector('.kami-drop[data-kami-open="1"], .kami-drop'));
  const tabs = Array.from(document.querySelectorAll('.kami-root .kami-tab, .kami-root [role="tab"]')).map(t => t.textContent.trim()).filter(Boolean);
  return { panels: panels.length, tabs: Array.from(new Set(tabs)).slice(0, 12) };
});
console.log(JSON.stringify(info), 'errors:', errs);
await page.screenshot({ path: (process.env.ST_ROOT || '/workspace/st-test') + '/st-toolbox.png' });
await b.close();
