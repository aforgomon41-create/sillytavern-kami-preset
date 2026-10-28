// 打开本机测试酒馆，确认主界面与酒馆助手加载成功并截图
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const url = process.env.ST_URL || 'http://127.0.0.1:8000/';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('response', r => { if (r.status() >= 500) errors.push('HTTP ' + r.status() + ' ' + r.request().method() + ' ' + r.url()); });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#send_textarea', { timeout: 60000 });
await page.waitForFunction(() => window.SillyTavern && window.SillyTavern.getContext, null, { timeout: 60000 });
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const ctx = window.SillyTavern.getContext();
  const th = window.TavernHelper;
  return {
    stVersion: (ctx && (ctx.version || ctx.getVersion?.())) || null,
    tavernHelper: !!th,
    thKeys: th ? Object.keys(th).length : 0,
    thVersion: th && (th.getTavernHelperVersion ? th.getTavernHelperVersion() : null),
    extSettings: Object.keys((ctx && ctx.extensionSettings) || {}).filter(k => /tavern_helper|JS-Slash/i.test(k)),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: (process.env.ST_ROOT || '/workspace/st-test') + '/st-home.png' });
console.log('errors:', errors.slice(0, 8));
await b.close();
