// 技术验证运行器：node spikes/radix-isolation/run.mjs（需要 /workspace/tools 里的 playwright）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');

/* KAMI_PATCH=1：把打包产物里所有 document.activeElement 换成「钻进 Shadow DOM 取真实焦点」的读取器。
   Radix 的 focus-scope / select / menu / roving-focus 直接读 document.activeElement，在 Shadow DOM 里读到的是宿主元素。 */
const PATCH = process.env.KAMI_PATCH === '1';
/* FocusScope 在 document 上监听 focusin/focusout；Shadow DOM 里冒泡到 document 的事件目标会被改写成宿主元素，
   陷阱误判焦点逃逸、把焦点拉回去。改为监听容器所在的根节点（Shadow DOM 里是 ShadowRoot，普通 DOM 里就是 document）。 */
const focusScopeRootPlugin = {
  name: 'kami-focus-scope-root',
  setup(build) {
    build.onLoad({ filter: /react-focus-scope[\\/]dist[\\/]index\.mjs$/ }, async (args) => {
      let src = await fs.promises.readFile(args.path, 'utf8');
      const before = src;
      src = src.replace(/document\.(add|remove)EventListener\("focus(in|out)"/g, (m, verb, dir) =>
        '(container && container.getRootNode ? container.getRootNode() : document).' + verb + 'EventListener("focus' + dir + '"');
      const n = (before.match(/document\.(add|remove)EventListener\("focus(in|out)"/g) || []).length;
      if (n !== 4) { throw new Error('FocusScope 修补点数量不对（期望 4，实际 ' + n + '），Radix 版本可能变了'); }
      return { contents: src, loader: 'js' };
    });
  }
};
const DEEP_ACTIVE = `Object.defineProperty(globalThis, '__kamiDeepActive', { configurable: true, get: function () {
  var a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) { a = a.shadowRoot.activeElement; } return a; } });`;
await esbuild.build({
  entryPoints: [path.join(here, 'app.tsx')], bundle: true, format: 'iife', target: ['es2019'],
  outfile: path.join(here, 'out/app.js'), logLevel: 'silent', jsx: 'automatic',
  define: Object.assign({ 'process.env.NODE_ENV': '"production"' }, PATCH ? { 'document.activeElement': 'globalThis.__kamiDeepActive' } : {}),
  banner: PATCH ? { js: DEEP_ACTIVE } : undefined,
  plugins: PATCH ? [focusScopeRootPlugin] : []
});
console.log('activeElement 修补：' + (PATCH ? '开' : '关'));
const server = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'host.html');
  if (!p.startsWith(here) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const url = 'http://127.0.0.1:' + server.address().port + '/host.html';

let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) { pass++; console.log('PASS  ' + label); } else { fail++; console.log('FAIL  ' + label + (extra !== undefined ? '  ← ' + extra : '')); } };

const browser = await chromium.launch();
async function suite(name, setup) {
  try { await suiteBody(name, setup); } catch (e) { fail++; console.log('FAIL  ' + name + '：中途卡死  ← ' + String(e.message || e).split('\n')[0]); }
}
async function suiteBody(name, setup) {
  console.log('\n=== ' + name + ' ===');
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  const { scope, outside } = await setup(page);
  const q = (id) => scope.locator('[data-testid="' + id + '"]');
  const visible = async (id) => (await q(id).count()) > 0 && await q(id).first().isVisible();

  // 样式隔离
  const btn = await q('plain').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, fg: s.color, fs: s.fontSize, ff: s.fontFamily }; });
  ok(btn.bg === 'rgb(240, 240, 240)' && btn.fg === 'rgb(20, 20, 20)', name + '：宿主的 button !important 样式进不来', JSON.stringify(btn));
  ok(!/Courier/.test(btn.ff), name + '：宿主的 * 字体 !important 进不来', btn.ff);

  // Select：鼠标
  await q('sel-trigger').click();
  ok(await visible('sel-content'), name + '：Select 点开');
  await q('sel-b').click();
  ok((await q('sel-value').textContent()) === 'b' && !(await visible('sel-content')), name + '：Select 点选项后取值并收起');
  const popBg = await (async () => { await q('sel-trigger').click(); const v = await q('sel-content').evaluate((el) => getComputedStyle(el).backgroundColor); await page.keyboard.press('Escape'); return v; })();
  ok(popBg === 'rgb(255, 255, 255)', name + '：弹层（portal）也不吃宿主样式', popBg);
  // Select：键盘
  await q('sel-trigger').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  ok((await q('sel-value').textContent()) === 'c', name + '：Select 键盘选择', await q('sel-value').textContent());

  // Popover：点里面不关，点外面关
  await q('pop-trigger').click();
  ok(await visible('pop-content'), name + '：Popover 打开');
  await q('pop-inside').click();
  await q('pop-input').fill('打字');
  ok(await visible('pop-content'), name + '：Popover 点内部 / 输入时不误关');
  await outside.click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(100);
  ok(!(await visible('pop-content')), name + '：Popover 点外面关闭');

  // Dialog：焦点陷阱、Esc、焦点归还
  await q('dlg-trigger').click();
  ok(await visible('dlg-content'), name + '：Dialog 打开');
  await q('dlg-a').click();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); }
  const focusInside = await q('dlg-content').evaluate((el) => { const r = el.getRootNode(); const a = r.activeElement; return !!a && el.contains(a); });
  ok(focusInside, name + '：Dialog 内 Tab 焦点不逃逸');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(!(await visible('dlg-content')), name + '：Dialog Esc 关闭');
  const back = await q('dlg-trigger').evaluate((el) => el.getRootNode().activeElement === el);
  ok(back, name + '：Dialog 关闭后焦点回到触发按钮');

  // DropdownMenu
  await q('menu-trigger').click();
  ok(await visible('menu-content'), name + '：Menu 打开');
  await q('menu-y').click();
  ok((await q('menu-value').textContent()) === 'y', name + '：Menu 鼠标选择');
  await q('menu-trigger').focus();
  await page.keyboard.press('Enter');          // 打开后焦点在第一项（X）
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');      // 移到 Y
  await page.keyboard.press('ArrowUp');        // 回到 X
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const mv = await q('menu-value').textContent();
  ok(mv === 'x', name + '：Menu 键盘上下移动后选中 X（鼠标先前选的是 Y）', mv);

  // Tooltip、Switch、Tabs
  await q('tip-trigger').hover();
  await page.waitForTimeout(200);
  ok(await visible('tip-content'), name + '：Tooltip 悬停出现');
  await q('switch').click();
  ok((await q('switch').getAttribute('data-state')) === 'checked', name + '：Switch 点击切换');
  await q('tab-one').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  ok(await visible('panel-two'), name + '：Tabs 方向键切换');

  ok(errors.length === 0, name + '：无页面错误', errors.join(' | '));
  await page.close();
}

if (process.env.KAMI_SKIP_A !== '1') await suite('A 宿主页 Shadow DOM', async (page) => {
  await page.evaluate(() => window.KamiSpike.mountShadow(document.getElementById('panel-host')));
  await page.waitForTimeout(100);
  return { scope: page.locator('#panel-host'), outside: page.locator('#outside') };
});
if (process.env.KAMI_ONLY_A !== '1') await suite('B 父页 React 渲染进同源 iframe', async (page) => {
  await page.waitForFunction(() => document.getElementById('msg').contentDocument?.readyState === 'complete');
  await page.evaluate(() => window.KamiSpike.mountIntoDoc(document.getElementById('msg').contentDocument));
  await page.waitForTimeout(100);
  const frame = page.frameLocator('#msg');
  return { scope: frame.locator('body'), outside: frame.locator('#outside-in-frame') };
});

/* 触屏：手机上用户是点按（tap），Radix Select 在 touch 下走 onClick 分支而不是 pointerdown */
async function touchSuite(name, mount) {
  console.log('\n=== ' + name + ' ===');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  const scope = await mount(page);
  const q = (id) => scope.locator('[data-testid="' + id + '"]');
  const visible = async (id) => (await q(id).count()) > 0 && await q(id).first().isVisible();
  await q('sel-trigger').tap(); await page.waitForTimeout(200);
  ok(await visible('sel-content'), name + '：Select 点按打开');
  await q('sel-c').tap(); await page.waitForTimeout(200);
  ok((await q('sel-value').textContent()) === 'c' && !(await visible('sel-content')), name + '：Select 点按选项后取值并收起', await q('sel-value').textContent());
  await q('pop-trigger').tap(); await page.waitForTimeout(150);
  await q('pop-inside').tap(); await page.waitForTimeout(150);
  ok(await visible('pop-content'), name + '：Popover 点按内部不误关');
  await page.locator('#outside').tap({ position: { x: 5, y: 5 } }); await page.waitForTimeout(150);
  ok(!(await visible('pop-content')), name + '：Popover 点按外面关闭');
  await q('menu-trigger').tap(); await page.waitForTimeout(150);
  await q('menu-x').tap(); await page.waitForTimeout(150);
  ok((await q('menu-value').textContent()) === 'x', name + '：Menu 点按选择');
  await q('dlg-trigger').tap(); await page.waitForTimeout(150);
  await q('dlg-close').tap(); await page.waitForTimeout(200);
  ok(!(await visible('dlg-content')), name + '：Dialog 点按关闭');
  await q('switch').tap(); await page.waitForTimeout(100);
  ok((await q('switch').getAttribute('data-state')) === 'checked', name + '：Switch 点按切换');
  ok(errors.length === 0, name + '：无页面错误', errors.join(' | '));
  await ctx.close();
}
if (process.env.KAMI_TOUCH === '1') {
  await touchSuite('T 手机触屏 · Shadow DOM', async (page) => { await page.evaluate(() => window.KamiSpike.mountShadow(document.getElementById('panel-host'))); await page.waitForTimeout(100); return page.locator('#panel-host'); });
}

if (process.env.KAMI_CONTROL === '1') await suite('C 普通 DOM（对照组，样式隔离项预期失败）', async (page) => {
  await page.evaluate(() => window.KamiSpike.mountIntoDoc(document));
  await page.waitForTimeout(100);
  return { scope: page.locator('body'), outside: page.locator('#outside') };
});

await browser.close();
server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + ' 通过');
process.exit(fail ? 1 : 0);
