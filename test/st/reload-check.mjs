// 反复刷新，统计各脚本启动失败（尤其「运行库未加载」）的频率：node reload-check.mjs [次数]
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const N = Number(process.argv[2] || 5);
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
let logs = [];
page.on('console', m => { const t = m.text(); if (/启动失败|运行库未加载|\[工具箱\]|\[压缩\] 启动|toolbox/i.test(t)) logs.push(t.split('\n')[0].slice(0, 120)); });
for (let i = 1; i <= N; i++) {
  logs = [];
  await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
  await page.waitForSelector('#send_textarea', { timeout: 60000 });
  await page.waitForTimeout(12000);
  const btns = await page.evaluate(() => Array.from(document.querySelectorAll('.qr--button, .qr--buttons button')).map(x => x.textContent.trim()));
  console.log('第 ' + i + ' 次：工具箱按钮 ' + (btns.some(t => /工具箱/.test(t)) ? '有' : '没有') + ' | ' + (logs.filter(l => /失败|未加载/.test(l)).join(' / ') || '无启动失败'));
}
await b.close();
