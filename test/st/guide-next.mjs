// 「🧪 引导」脚本（新引导 + 各脚本的读写桥）在真实酒馆里的验证：
//   node test/st/guide-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了**新的**支线测试包（新版本没看过 → 会自动弹），见 test/st/README.md
// 核对：自动弹出的是新引导（旧向导没开）、只有一颗 🧭；免责声明确认前不能往后走；
//       模型 / 语言写进预设，压缩写进 60 号，防截断写进 20 号（测完都改回）；完成后 50 号记下「这一版已完成」；
//       对比度；注销后按钮与旧向导交回 50 号。
import { createRequire } from 'node:module';
import { auditInPage } from '../frontend/browser/audit-lib.mjs';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const SHOTS = process.argv.includes('--shots');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const SHOT_DIR = process.env.ST_ROOT || '/workspace/st-test';
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|引导|React|Preset/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
/* 让这一版重新算「没看过」，然后刷新一次，看首次自动弹 */
await page.waitForFunction(() => window.KamiGuide && window.KamiGuideNext, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(12000);   /* 等 50 号读完展示记录、首次自动弹的判断走完，再清记录（太早清会被它随后的存盘盖掉） */
await page.keyboard.press('Escape');
await page.evaluate(() => window.KamiGuide.reset());
await page.reload();
await page.waitForFunction(() => window.KamiGuide && window.KamiGuideNext && window.KamiPreset && window.KamiPreset.presetBridge, null, { timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => { const l = document.querySelector('kami-layer'); return l && l.shadowRoot.querySelector('[data-guide-step]'); }, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1000);

const inLayer = (fn, arg) => page.evaluate(([src, a]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, a) : null; }, [fn.toString(), arg]);
const buttons = () => page.evaluate(() => [...document.querySelectorAll('.qr--button, [data-hub-btn], #TH-script-buttons .menu_button, .qr--buttons > *')].map((x) => x.textContent.trim()).filter(Boolean));
const clickBtn = (name) => page.evaluate((n) => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim().startsWith(n)); if (el) { el.click(); } return !!el; }, name);
const stepId = () => inLayer((r) => { const s = r.querySelector('[data-guide-step]'); return s ? s.getAttribute('data-guide-step') : null; });
const footBtn = (text) => inLayer((r, t) => { const p = r.querySelector('[data-k="panel"]'); const btn = p && [...p.querySelectorAll('[data-k-part="footer"] button, button')].find((x) => x.textContent.trim() === t && x.getClientRects().length); if (btn) { btn.click(); } return !!btn; }, text);
const plain = (s) => String(s).replace(/\p{Extended_Pictographic}|️|[[\]]/gu, '').replace(/\s/g, '');
const clickCard = (title) => inLayer((r, t) => {
  const c = [...r.querySelectorAll('[data-k="card"][data-role="choice"]')].find((x) => x.getClientRects().length && (x.querySelector('[data-k-part="title"]') || {}).textContent?.replace(/\s/g, '') === t);
  if (!c) { return false; }
  c.querySelector('[data-k-part="select"]').click();
  return true;
}, title);
const liveOn = (id) => page.evaluate((i) => window.KamiPreset.presetBridge().view().state.on[i], id);

/* ① 自动弹出的是新引导 */
ok((await stepId()) === 'disclaimer', '新版本首次加载：自动弹出新引导，停在免责声明', await stepId());
ok(await page.evaluate(() => !window.KamiGuide.status().open), '旧向导没有打开');
const bt = await buttons();
ok(bt.filter((x) => x.startsWith('🧭')).length === 1, '按钮条只有一颗 🧭', bt);
const disc = await inLayer((r) => { const d = r.querySelector('[data-guide-disclaimer]'); return d ? d.textContent.length : 0; });
ok(disc > 50, '免责声明正文现读预设（' + disc + ' 字）');
/* 没确认前点导航里的后面步骤不跳 */
await inLayer((r) => { const it = [...r.querySelectorAll('[data-k="nav"] [data-k-part="item"]')][2]; if (it) { it.click(); } });
await page.waitForTimeout(200);
ok((await stepId()) === 'disclaimer', '确认之前不能往后走');
await footBtn('我已阅读并同意');
await page.waitForTimeout(400);
if ((await stepId()) === 'disclaimer') { await inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); const btn = [...p.querySelectorAll('button')].filter((x) => x.getAttribute('data-variant') === 'primary' && x.getClientRects().length).pop(); btn && btn.click(); }); await page.waitForTimeout(400); }
ok((await stepId()) === 'skin', '确认后进入「外观」', await stepId());
ok(await page.evaluate(() => window.KamiGuide.status().confirmed), '50 号记下已确认免责声明');
const skinCards = await inLayer((r) => r.querySelectorAll('[data-guide-step="skin"] [data-k="card"][data-role="choice"]').length);
ok(skinCards >= 1, '外观页有皮肤卡（来自「🧪 显示」）', skinCards);
const next = () => inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); const btn = [...p.querySelectorAll('button')].filter((x) => x.getAttribute('data-variant') === 'primary' && x.getClientRects().length).pop(); if (btn) { btn.click(); } return btn ? btn.textContent : null; });

/* ② 模型 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'model', '下一步：模型');
const v0 = await page.evaluate(() => window.KamiPreset.presetBridge().view());
const m0 = await page.evaluate(() => window.KamiPreset.currentModel());
const mt = v0.tabs.find((t) => t.kind === 'model');
const other = mt.models.find((m) => m.emoji !== m0);
await clickCard(plain(other.name));
await page.waitForTimeout(600);
ok((await page.evaluate(() => window.KamiPreset.currentModel())) === other.emoji, '选模型写进预设（' + m0 + ' → ' + other.emoji + '）');
await page.evaluate((e) => window.KamiPreset.selectModel(e), m0);
await page.waitForTimeout(400);

/* ③ 语言与数值 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'basics', '下一步：语言与数值');
const lang = v0.tabs.flatMap((t) => t.groups || []).find((g) => /语言/.test(g.name));
if (lang) {
  const cur = lang.items.find((i) => v0.state.on[i.id]), alt = lang.items.find((i) => i.id !== (cur && cur.id) && !i.locked);
  await clickCard(plain(alt.name));
  await page.waitForTimeout(600);
  ok((await liveOn(alt.id)) === true && (!cur || (await liveOn(cur.id)) === false), '语言切到「' + alt.name + '」写进预设');
  if (cur) { await page.evaluate(([id, g]) => window.KamiPreset.presetBridge().toggle(id, g), [cur.id, lang.name]); await page.waitForTimeout(400); }
}

/* ④ 长文与截断 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'long', '下一步：长文与截断');
const g0 = await page.evaluate(() => window.KamiSummarize.status().grandOn);
await inLayer((r) => { const c = [...r.querySelectorAll('[data-k="card"][data-role="choice"]')].find((x) => /超限/.test((x.querySelector('[data-k-part="title"]') || {}).textContent || '')); c && c.querySelector('[data-k-part="select"]').click(); });
await page.waitForTimeout(600);
ok((await page.evaluate(() => window.KamiSummarize.status().grandOn)) === !g0, '超限压缩写进 60 号');
await page.evaluate((g) => window.KamiSummarize.setGrand(g), g0);
const a0 = await page.evaluate(() => !!window.AntiTruncation.enabled);
await inLayer((r) => { const sw = r.querySelector('[data-guide-step="long"] [role="switch"]'); sw && sw.click(); });
await page.waitForTimeout(600);
ok((await page.evaluate(() => !!window.AntiTruncation.enabled)) === !a0, '防截断开关写进 20 号');
await page.evaluate((a) => (a ? window.AntiTruncation.on() : window.AntiTruncation.off()), a0);
await page.waitForTimeout(300);
const au = await page.evaluate(auditInPage, null);
ok(au.failures.length === 0 && au.checked > 10, '引导对比度：' + au.checked + ' 处', au.failures.slice(0, 3));
if (SHOTS) { await page.screenshot({ path: SHOT_DIR + '/guide-next' + (MOBILE ? '-m' : '') + '.png' }); }

/* ⑤ 完成 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'done', '下一步：完成');
const chips = await inLayer((r) => [...r.querySelectorAll('[data-guide-summary] [data-k="badge"]')].map((x) => x.textContent));
ok(chips.some((c) => c.startsWith('模型')) && chips.some((c) => c.startsWith('皮肤')), '完成页列出这次的选择', chips);
await next(); await page.waitForTimeout(500);
ok(!(await stepId()), '点「完成」关掉引导');
ok(await page.evaluate(() => window.KamiGuide.status().completed), '50 号记下这一版已完成');
ok((await page.evaluate(() => window.KamiPreset.currentModel())) === m0, '测完模型复原');

/* ⑥ 按钮重开、注销 */
await clickBtn('🧭 引导'); await page.waitForTimeout(600);
ok((await stepId()) === 'disclaimer', '点「🧭 引导」重新打开');
await page.evaluate(() => window.KamiGuideNext.shutdown());
await page.waitForTimeout(3500);
ok(!(await stepId()) && !(await page.evaluate(() => !!window.KamiGuideNext)), '注销后界面与全局 API 收回');
const bt2 = await buttons();
ok(bt2.filter((x) => x.startsWith('🧭')).length === 1, '按钮交回旧引导（仍是一颗 🧭）', bt2);
await clickBtn('🧭 引导'); await page.waitForTimeout(800);
ok(await page.evaluate(() => window.KamiGuide.status().open), '点它打开的是旧向导');
await page.evaluate(() => window.KamiGuide.close());
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
