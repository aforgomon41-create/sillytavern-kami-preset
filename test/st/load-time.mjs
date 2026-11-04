// 实机量预设载入时间：node test/st/load-time.mjs [--mobile] [--runs N]（没装卡密预设时量基线：WAIT_MS=3000，酒馆可用后最多再等 3 秒）
//   手机：390×844 触屏 + CPU 降速 4 倍 + 网速约 4G（9Mbps 下行、150ms 延迟）；电脑不限速。
//   每轮刷新页面，记：酒馆可用（#send_textarea + TavernHelper）、新运行库注册（KamiRuntimeNext）、按钮条出现「🧰 工具箱」、
//   消息前端接管（KamiChatFrontend.active()），以及 /api/settings/get 的传输大小（预设就在这份响应里）。
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const RUNS = Number((process.argv[process.argv.indexOf('--runs') + 1]) || 3) || 3;
const url = process.env.ST_URL || 'http://127.0.0.1:8000/';
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
if (MOBILE) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
}
let settingsBytes = 0;
const sizes = new Map();
cdp.on('Network.responseReceived', (e) => { if (/\/api\/settings\/get/.test(e.response.url)) { sizes.set(e.requestId, true); } });
cdp.on('Network.loadingFinished', (e) => { if (sizes.has(e.requestId)) { settingsBytes = e.encodedDataLength; } });
const rows = [];
for (let i = 0; i < RUNS + 1; i++) {   /* 第 0 轮只热缓存，不计 */
  await page.goto(url, { waitUntil: 'commit' });
  const t = await page.evaluate(async (WAIT) => {
    const now = () => Math.round(performance.now());
    const until = (f) => new Promise((r) => { const go = () => { let v = false; try { v = f(); } catch (e) { } if (v) { r(now()); } else { setTimeout(go, 20); } }; go(); });
    const ready = until(() => document.querySelector('#send_textarea') && window.SillyTavern && window.TavernHelper && document.querySelector('#chat'));
    const rt = until(() => window.KamiRuntimeNext);
    const btn = until(() => [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].some((x) => /工具箱/.test(x.textContent)));
    const fe = until(() => window.KamiChatFrontend && window.KamiChatFrontend.active());
    const tReady = await Promise.race([ready, new Promise((r) => setTimeout(() => r('超时'), 180000))]);
    const timeout = new Promise((r) => setTimeout(() => r('超时'), WAIT));   /* 从酒馆可用那一刻起算 */
    return { ready: tReady, rt: await Promise.race([rt, timeout]), btn: await Promise.race([btn, timeout]), fe: await Promise.race([fe, timeout]) };
  }, Number(process.env.WAIT_MS || 120000));
  if (i > 0) { rows.push(t); }
  console.log((i ? '第 ' + i + ' 轮' : '预热') + '：酒馆可用 ' + t.ready + 'ms，运行库 ' + t.rt + 'ms，工具箱按钮 ' + t.btn + 'ms，消息前端接管 ' + t.fe + 'ms');
  await page.waitForTimeout(1500);
}
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => typeof x === 'number').sort((a, c) => a - c); return v.length ? v[Math.floor(v.length / 2)] : '—'; };
console.log('中位数' + (MOBILE ? '（手机 390，CPU×4，约 4G）' : '（电脑 1440，不限速）') + '：酒馆可用 ' + med('ready') + 'ms，运行库 ' + med('rt') + 'ms，工具箱按钮 ' + med('btn') + 'ms，消息前端接管 ' + med('fe') + 'ms；/api/settings/get 传输 ' + (settingsBytes / 1048576).toFixed(2) + 'MB');
await b.close();
