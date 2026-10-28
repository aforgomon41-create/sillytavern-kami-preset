// 在本机测试酒馆里和默认角色聊一句，等回复渲染完，打印最后一条消息的 DOM 读数：
//   node chat.mjs "<要发送的话>" [--html] [--shot 文件名]
// 需要：酒馆已接到假模型（test/mock-llm/server.mjs），见 test/st/README.md
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const text = process.argv[2] || '你好';
const wantHtml = process.argv.includes('--html');
const shotIdx = process.argv.indexOf('--shot');
const ROOT = process.env.ST_ROOT || '/workspace/st-test';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error' && !/horde|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForSelector('#send_textarea', { timeout: 60000 });
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
await page.waitForTimeout(8000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);            // 关掉可能自动弹出的引导
const chid = await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) {
    const id = ctx.characters.findIndex((c) => /Seraphina/i.test(c.name));
    await ctx.selectCharacterById(String(id));
  }
  return window.SillyTavern.getContext().characterId;
});
await page.waitForTimeout(2500);
/* 没连上接口时酒馆会藏起发送按钮：点一下接口面板的「连接」 */
if (!(await page.locator('#send_but').isVisible())) {
  await page.evaluate(() => document.getElementById('api_button_openai')?.click());
  await page.waitForSelector('#send_but', { state: 'visible', timeout: 30000 });
}
const before = await page.evaluate(() => window.SillyTavern.getContext().chat.length);
await page.fill('#send_textarea', text);
await page.click('#send_but');
await page.waitForFunction((n) => window.SillyTavern.getContext().chat.length >= n + 2, before, { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('#mes_stop') || getComputedStyle(document.querySelector('#mes_stop')).display === 'none', null, { timeout: 60000 });
await page.waitForTimeout(3000);
const info = await page.evaluate((wantHtml) => {
  const ctx = window.SillyTavern.getContext();
  const last = ctx.chat[ctx.chat.length - 1];
  const el = document.querySelector('#chat .mes:last-of-type');
  const text = el?.querySelector('.mes_text');
  return {
    floors: ctx.chat.length,
    mesRaw: (last?.mes || '').slice(0, 200),
    reasoning: (last?.extra?.reasoning || '').slice(0, 80),
    iframes: el ? el.querySelectorAll('iframe').length : 0,
    kamiRoots: el ? el.querySelectorAll('.kami-root').length : 0,
    html: wantHtml && text ? text.innerHTML : undefined,
  };
}, wantHtml);
console.log(JSON.stringify({ character: chid, ...info }, null, 1));
if (shotIdx > 0) { await page.screenshot({ path: ROOT + '/' + process.argv[shotIdx + 1] }); }
console.log('errors:', errors.slice(0, 6));
await b.close();
