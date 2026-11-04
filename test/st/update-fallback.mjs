// 实机：工具箱注销后（没有 KamiUpdateUi），70 号直接用新运行库画「要不要更新」与进度窗（directUi）。
//   node test/st/update-fallback.mjs [--mobile]
//   拦网络：Releases 接口 500 → 走 jsDelivr 清单（假的 v0.99-1）；所有下载通道 404 → 进度窗报错。不写任何预设。
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('PASS  ' + l); } else { fail++; console.log('FAIL  ' + l + (x === undefined ? '' : '  ← ' + JSON.stringify(x))); } };
const errors = []; const logs = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/更新/.test(t)) { logs.push(t.slice(0, 160)); } });
const hits = [];
await page.route(/api\.github\.com|cdn\.jsdelivr\.net|githubusercontent\.com|github\.com\/.*\/releases\/download/, (route) => {
  const u = route.request().url(); hits.push(u.replace(/^https:\/\//, '').slice(0, 90));
  if (/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\?/.test(u)) { return route.fulfill({ status: 500, body: 'test' }); }
  if (/@main\/mirror\/manifest\.json/.test(u)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.99-1', file: 'kami-v0.99-1-20261231.json', date: '2026-12-31', notes: '测试用的假新版（update-fallback.mjs）' }) });
  }
  return route.fulfill({ status: 404, body: 'no' });
});
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForFunction(() => window.KamiRuntimeNext && window.KamiUpdate && window.KamiToolboxNext && window.KamiUpdateUi, null, { timeout: 90000 });
await page.waitForTimeout(2000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.evaluate(() => { window.KamiToolboxNext.shutdown(); window.KamiToolbox.shutdown(); });
await page.waitForTimeout(2500);
ok(await page.evaluate(() => !window.KamiUpdateUi && !!window.KamiRuntimeNext), '工具箱注销：KamiUpdateUi 没了、新运行库还在');
const checking = page.evaluate(() => window.KamiUpdate.check(true).then((r) => r && r.action).catch((e) => 'error:' + e.message));
const inLayer = (fn, arg) => page.evaluate(([src, a]) => { const l = document.querySelector('kami-layer'); return l && l.shadowRoot ? (0, eval)(src)(l.shadowRoot, a) : null; }, [fn.toString(), arg]);
await page.waitForFunction(() => { const l = document.querySelector('kami-layer'); return l && l.shadowRoot && [...l.shadowRoot.querySelectorAll('[role="dialog"]')].some((d) => /0\.99/.test(d.textContent)); }, null, { timeout: 90000 }).catch(() => {});
const ask = await inLayer((r) => { const d = [...r.querySelectorAll('[role="dialog"]')].find((x) => /0\.99/.test(x.textContent)); if (!d) { return null; } const bx = d.getBoundingClientRect(); return { text: d.textContent.replace(/\s+/g, ' ').slice(0, 160), buttons: [...d.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean), w: Math.round(bx.width), h: Math.round(bx.height), left: Math.round(bx.left), right: Math.round(bx.right) }; });
ok(ask && /测试用的假新版/.test(ask.text) && ask.buttons.some((t) => /立即更新/.test(t)), '询问窗口：新运行库的 UpdateAskDialog，带版本与更新说明', ask);
ok(ask && ask.left >= 0 && ask.right <= (MOBILE ? 390 : 1440), '询问窗口在屏幕内', ask);
await inLayer((r) => { const d = [...r.querySelectorAll('[role="dialog"]')].find((x) => /0\.99/.test(x.textContent)); [...d.querySelectorAll('button')].find((x) => /立即更新/.test(x.textContent)).click(); });
/* 下载链全 404：每条通道试 2 次、隔 1.5 秒 */
await page.waitForFunction(() => { const l = document.querySelector('kami-layer'); return l && [...l.shadowRoot.querySelectorAll('[role="dialog"]')].some((d) => /失败|没成功|出错|重试/.test(d.textContent)); }, null, { timeout: 120000 }).catch(() => {});
const prog = await inLayer((r) => { const d = [...r.querySelectorAll('[role="dialog"]')].find((x) => /失败|没成功|出错|重试/.test(x.textContent)); return d ? { text: d.textContent.replace(/\s+/g, ' ').slice(0, 200), buttons: [...d.querySelectorAll('button')].map((x) => x.textContent.trim()).filter(Boolean) } : null; });
ok(!!prog, '进度窗口：新运行库的 UpdateProgressDialog，下载失败时显示出错', prog);
if (prog) {
  await inLayer((r) => { const d = [...r.querySelectorAll('[role="dialog"]')].find((x) => /失败|没成功|出错|重试/.test(x.textContent)); const c = [...d.querySelectorAll('button')].find((x) => /关闭|知道了|取消/.test(x.textContent)) || d.querySelector('[aria-label="关闭"]'); c && c.click(); });
  await page.waitForTimeout(800);
  ok(await inLayer((r) => ![...r.querySelectorAll('[role="dialog"]')].some((d) => /失败|没成功|出错|重试|0\.99/.test(d.textContent))), '进度窗口能关掉');
}
const action = await Promise.race([checking, new Promise((r) => setTimeout(() => r('还在等'), 5000))]);
console.log('  check 结果：' + action + '；拦下的请求 ' + hits.length + ' 个');
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
const presets = await page.evaluate(() => [...document.querySelectorAll('#settings_preset_openai option')].map((o) => o.textContent).filter((t) => /0\.99/.test(t)));
ok(presets.length === 0, '没有写出任何预设', presets);
logs.slice(-6).forEach((l) => console.log('  log ' + l));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
