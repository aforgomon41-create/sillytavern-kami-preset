// 「🧪 显示」脚本（新显示面板 + SkinManager）在真实酒馆里的验证：
//   node test/st/display-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包（含「🧪 显示」），见 test/st/README.md
// 核对：按钮条统一成「图标 + 空格 + 名字」、只有一颗 🎨（旧皮肤管理让位）；点「🎨 显示」打开面板；
//       换皮肤同时套到面板和聊天里的消息前端；配色写进脚本变量、刷新后还在；
//       「行动选项默认收起」让消息里的选项收起；角色名样式走 35 号脚本的全局变量；实际渲染对比度；注销后不留东西。
import { createRequire } from 'node:module';
import { auditInPage } from '../frontend/browser/audit-lib.mjs';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const SHOTS = process.argv.includes('--shots');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8787';
const SHOT_DIR = process.env.ST_ROOT || '/workspace/st-test';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|显示|React/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

async function load() {
  await page.goto(ST);
  await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);   // 关掉自动弹出的引导
  await page.evaluate(async () => {
    const ctx = window.SillyTavern.getContext();
    if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
  });
  await page.waitForTimeout(2500);
}
await load();
const inLayer = (fn, arg) => page.evaluate(([src, arg]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, arg) : null; }, [fn.toString(), arg]);
const buttons = () => page.evaluate(() => [...document.querySelectorAll('.qr--button, [data-hub-btn], #TH-script-buttons .menu_button, .qr--buttons > *')].map((x) => x.textContent.trim()).filter(Boolean));

/* ① 按钮条 */
await page.waitForFunction(() => window.KamiDisplay && window.KamiDisplay.manager, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(3000);
const bt = await buttons();
ok(bt.includes('🎨 显示'), '按钮条有「🎨 显示」', bt);
ok(bt.filter((x) => x.startsWith('🎨')).length === 1, '只有一颗 🎨（旧皮肤管理让位）', bt);
ok(bt.includes('🌟 预设设置') && bt.includes('🧭 引导') && bt.some((x) => /^🛡 反截断 (开|关)$/.test(x)) && bt.some((x) => x.startsWith('🧰 工具箱')), '其他按钮统一成「图标 + 空格 + 名字」', bt);

/* ② 点按钮打开面板 */
await page.evaluate(() => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim() === '🎨 显示'); el && el.click(); });
await page.waitForTimeout(800);
const panel = await inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); return p ? { title: p.querySelector('[data-k-part="title"]').textContent, cards: p.querySelectorAll('[data-k="card"][data-role="choice"]').length } : null; });
ok(panel && panel.title.includes('显示') && panel.cards >= 1, '点「🎨 显示」打开显示面板', panel);
const geo = await inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); const b = p.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, layout: p.getAttribute('data-layout'), tabs: !!p.querySelector('[data-k="tabs"]') }; });
ok(geo.top >= 0 && geo.bottom <= geo.h + 1 && geo.layout === (MOBILE ? 'sheet' : 'floating') && geo.tabs === MOBILE, (MOBILE ? '手机：贴底抽屉在屏幕内、用页签' : '电脑：浮动窗、左右两栏（宽窄屏按酒馆页面算，不按脚本 iframe）'), geo);

/* ③ 换配色：面板与消息前端一起变，写进脚本变量 */
const mode0 = await page.evaluate(() => { const h = document.querySelector('#chat [data-kami-msg-host]'); return h ? h.shadowRoot.querySelector('[data-k-surface]').getAttribute('data-k-mode') : null; });
await page.evaluate(() => window.KamiDisplay.manager.setScheme('dark'));
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const h = document.querySelector('#chat [data-kami-msg-host]');
  const vars = (() => { try { const id = [...window.SillyTavern.getContext().extensionSettings?.TavernHelper?.script?.scripts || []].length; return id; } catch (e) { return -1; } })();
  return { msg: h ? h.shadowRoot.querySelector('[data-k-surface]').getAttribute('data-k-mode') : null, layer: document.querySelector('kami-layer').shadowRoot.querySelector('[data-k-surface]').getAttribute('data-k-mode'), vars };
});
ok(after.msg === 'dark' && after.layer === 'dark', '选「深色」：面板与聊天里的消息前端同时变深（之前 ' + mode0 + '）', after);
if (SHOTS) { await page.screenshot({ path: SHOT_DIR + '/display-next' + (MOBILE ? '-m' : '') + '.png' }); }
const a1 = await page.evaluate(auditInPage, null);
ok(a1.failures.length === 0 && a1.checked > 10, '面板对比度（深色）：' + a1.checked + ' 处', a1.failures.slice(0, 3));
const a2 = await page.evaluate(auditInPage, '@mounts');
ok(a2.failures.length === 0, '消息前端对比度（深色）：' + a2.checked + ' 处', a2.failures.slice(0, 3));

/* ④ 消息设置 */
if (MOBILE) { await inLayer((r) => [...r.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((t) => t.textContent === '消息').focus()); await page.waitForTimeout(300); }
const nw = await page.evaluate(() => !!window.KamiNameWrap);
const msgSeg = await inLayer((r) => [...r.querySelectorAll('[data-k="segmented"]')].map((s) => s.getAttribute('aria-label')));
ok(msgSeg.includes('行动选项默认') && msgSeg.includes('点选项时') && (!nw || msgSeg.includes('角色名样式')), '消息一组：角色名样式（35 号在跑时）/ 行动选项默认 / 点选项时', { msgSeg, nw });
await page.evaluate(() => window.KamiDisplay.close());
await page.evaluate(() => window.KamiDisplay.open());
await page.waitForTimeout(400);
if (MOBILE) { await inLayer((r) => [...r.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((t) => t.textContent === '消息').focus()); await page.waitForTimeout(300); }
await inLayer((r) => { const s = [...r.querySelectorAll('[data-k="segmented"]')].find((x) => x.getAttribute('aria-label') === '行动选项默认'); [...s.querySelectorAll('[data-k-part="item"]')].find((i) => i.textContent === '收起').click(); });
await page.waitForTimeout(600);
const folded = await page.evaluate(() => {
  const hs = [...document.querySelectorAll('#chat [data-kami-msg-host]')];
  const o = hs.map((h) => h.shadowRoot.querySelector('[data-k="msg-options"]')).filter(Boolean).pop();
  return { ls: localStorage.getItem('kami.options.folded'), state: o ? o.getAttribute('data-state') : 'none' };
});
ok(folded.ls === '1' && (folded.state === 'closed' || folded.state === 'none'), '「行动选项默认 → 收起」：消息里已显示的选项跟着收起', folded);
await inLayer((r) => { const s = [...r.querySelectorAll('[data-k="segmented"]')].find((x) => x.getAttribute('aria-label') === '行动选项默认'); [...s.querySelectorAll('[data-k-part="item"]')].find((i) => i.textContent === '展开').click(); });
if (nw) {
  const before = await page.evaluate(() => String(window.KamiNameWrap.get()));
  await inLayer((r) => { const s = [...r.querySelectorAll('[data-k="segmented"]')].find((x) => x.getAttribute('aria-label') === '角色名样式'); [...s.querySelectorAll('[data-k-part="item"]')].find((i) => i.textContent === '双下划线').click(); });
  await page.waitForTimeout(300);
  const now = await page.evaluate(() => String(window.KamiNameWrap.get()));
  ok(now === 'ul', '角色名样式写进 35 号脚本（' + before + ' → ' + now + '）');
  await page.evaluate((v) => window.KamiNameWrap.set(v), before);
}

/* ⑤ 刷新后设置还在（脚本变量） */
await load();
await page.waitForFunction(() => window.KamiDisplay && window.KamiDisplay.manager, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const kept = await page.evaluate(() => ({ s: window.KamiDisplay && window.KamiDisplay.manager.settings.perSkin[window.KamiDisplay.manager.settings.skin], msg: (() => { const h = document.querySelector('#chat [data-kami-msg-host]'); return h ? h.shadowRoot.querySelector('[data-k-surface]').getAttribute('data-k-mode') : null; })() }));
ok(kept.s && kept.s.scheme === 'dark' && kept.msg === 'dark', '刷新后配色还在，消息前端用的也是它（消息前端不再强套碎光）', kept);
await page.evaluate(() => window.KamiDisplay.manager.setScheme('auto'));

/* ⑥ 注销：按钮、面板、全局 API 收回，旧 🎨 回来 */
await page.evaluate(() => { window.KamiDisplay.open(); });
await page.waitForTimeout(300);
await page.evaluate(() => window.KamiDisplay.shutdown());
await page.waitForTimeout(3500);
const gone = await page.evaluate(() => ({ api: !!window.KamiDisplay, open: document.querySelector('kami-layer') ? !!document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"]') : false, defs: (window.__hubDefs || []).some((d) => d && d.name === '🎨 显示') }));
const bt2 = await buttons();
ok(!gone.api && !gone.open && !gone.defs && !bt2.includes('🎨 显示'), '注销后按钮、面板、全局 API 都收回', { gone, bt2 });
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
