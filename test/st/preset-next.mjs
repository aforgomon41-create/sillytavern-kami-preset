// 「🌟 预设设置」脚本（新预设设置面板 + 40 号读写桥，2026-10-30 起同一条脚本）在真实酒馆里的验证：
//   node test/st/preset-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包，见 test/st/README.md
// 核对：只有一颗 🌟 且打开的是新面板；页签 = 概览 + 预设解析出的层级；
//       多选条目点一下写进酒馆的 prompt_order、撤销能复原；单选组切换时同组其它条关掉；
//       选模型走 40 号原来的路径；改变量写进预设正文；写作指导页有自定义文风；对比度；注销后按钮、面板、全局 API 全部收回。
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
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|预设|React|Preset/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.waitForFunction(() => window.KamiPresetNext && window.KamiPreset && window.KamiPreset.presetBridge, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2000);

const inLayer = (fn, arg) => page.evaluate(([src, a]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, a) : null; }, [fn.toString(), arg]);
const buttons = () => page.evaluate(() => [...document.querySelectorAll('.qr--button, [data-hub-btn], #TH-script-buttons .menu_button, .qr--buttons > *')].map((x) => x.textContent.trim()).filter(Boolean));
const clickBtn = (name) => page.evaluate((n) => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim().startsWith(n)); if (el) { el.click(); } return !!el; }, name);
const view = () => page.evaluate(() => window.KamiPreset.presetBridge().view());
/* 酒馆里这一条真实的开关（prompt_order） */
const liveOn = (id) => page.evaluate((i) => {
  const ctx = window.SillyTavern.getContext(), s = ctx.chatCompletionSettings || ctx.oai_settings || {};
  const orders = s.prompt_order || [];
  const o = orders.find((x) => String(x.character_id) === '100001') || orders[orders.length - 1];
  const e = o && o.order.find((x) => x.identifier === i);
  return e ? e.enabled !== false : null;
}, id);
const goTab = async (plainName) => {
  await inLayer((r, n) => {
    const els = [...r.querySelectorAll('[data-k="nav"] [data-k-part="item"], [data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')];
    const t = els.find((x) => x.textContent.replace(/\s/g, '').includes(n.replace(/\s/g, '')));
    if (t) { t.focus(); t.click(); }
  }, plainName);
  await page.waitForTimeout(400);
};
const plain = (s) => String(s).replace(/\p{Extended_Pictographic}|️|[[\]]/gu, '').trim();
const clickCard = (title) => inLayer((r, t) => {
  const c = [...r.querySelectorAll('[data-k="card"][data-role="choice"]')].find((x) => x.getClientRects().length && (x.querySelector('[data-k-part="title"]') || {}).textContent?.replace(/\s/g, '') === t.replace(/\s/g, ''));
  if (!c) { return false; }
  c.querySelector('[data-k-part="select"]').click();
  return true;
}, title);

/* ① 按钮与面板 */
const bt = await buttons();
ok(bt.filter((x) => x.startsWith('🌟')).length === 1, '按钮条只有一颗 🌟', bt);
ok(await clickBtn('🌟 预设设置'), '找到「🌟 预设设置」按钮');
await page.waitForTimeout(900);
const v0 = await view();
const panel = await inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); return p ? { title: p.querySelector('[data-k-part="title"]').textContent, tabs: [...p.querySelectorAll('[data-k="nav"] [data-k-part="item"], [data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].map((x) => x.textContent) } : null; });
ok(v0.ok && v0.tabs.length >= 3, '读写桥解析出当前预设：' + v0.tabs.length + ' 个页签（' + v0.name + '）', v0.error);
ok(panel && panel.title.includes('预设设置') && panel.tabs.length === v0.tabs.length + 1 && panel.tabs[0] === '概览', '打开新面板：概览 + 预设的层级', panel);
ok(await page.evaluate(() => window.KamiPreset.status().panelOpen === true && !document.getElementById('kami-preset-panel')), 'KamiPreset.status 读的是新面板，页面上没有旧面板 DOM');

/* ② 多选条目：点一下写进酒馆，撤销复原 */
const layer = v0.tabs.find((t) => t.kind === 'layer' && (t.groups || []).some((g) => g.mode === 'any' && g.items.some((i) => !i.locked)));
const anyG = layer.groups.find((g) => g.mode === 'any' && g.items.some((i) => !i.locked));
const it = anyG.items.find((i) => !i.locked);
const before = await liveOn(it.id);
await goTab(plain(layer.name));
const clicked = await clickCard(plain(it.name));
await page.waitForTimeout(600);
const after = await liveOn(it.id);
ok(clicked && before !== null && after === !before, '多选条目「' + plain(it.name) + '」：点一下写进酒馆（' + before + ' → ' + after + '）', { clicked, before, after });
await inLayer((r) => { const t = r.querySelector('[data-k="toast"]'); const a = t && [...t.querySelectorAll('button')].find((x) => x.textContent === '撤销'); if (a) { a.click(); } });
await page.waitForTimeout(600);
ok((await liveOn(it.id)) === before, '提示条「撤销」复原');

/* ③ 单选组：切到另一条，原来那条关掉 */
const oneTab = v0.tabs.find((t) => (t.groups || []).some((g) => g.mode === 'one' && g.items.filter((i) => !i.locked).length >= 2 && g.items.some((i) => v0.state.on[i.id])));
if (oneTab) {
  const g = oneTab.groups.find((x) => x.mode === 'one' && x.items.filter((i) => !i.locked).length >= 2 && x.items.some((i) => v0.state.on[i.id]));
  const cur = g.items.find((i) => v0.state.on[i.id]), next = g.items.find((i) => !i.locked && i.id !== cur.id);
  await goTab(plain(oneTab.name));
  await clickCard(plain(next.name));
  await page.waitForTimeout(600);
  const a = await liveOn(next.id), c = await liveOn(cur.id);
  ok(a === true && c === false, '单选组「' + plain(g.name) + '」：切到「' + plain(next.name) + '」，原来的「' + plain(cur.name) + '」关掉', { a, c });
  await page.evaluate(([id, gn]) => window.KamiPreset.presetBridge().toggle(id, gn), [cur.id, g.name]);
  await page.waitForTimeout(400);
  ok((await liveOn(cur.id)) === true && (await liveOn(next.id)) === false, '切回原来那条');
} else { ok(false, '预设里找不到可测的单选组'); }

/* ④ 模型：在模型页选另一个模型（40 号原来的路径），再切回 */
const mt = v0.tabs.find((t) => t.kind === 'model');
const m0 = await page.evaluate(() => window.KamiPreset.currentModel());
const other = mt && mt.models.find((m) => m.emoji !== m0);
if (other) {
  await goTab(plain(mt.name));
  await clickCard(plain(other.name));
  await page.waitForTimeout(700);
  const m1 = await page.evaluate(() => window.KamiPreset.currentModel());
  const badge = await inLayer((r) => { const p = r.querySelector('[data-k="panel"] > [data-k-part="head"]'); return p ? p.textContent : ''; });
  ok(m1 === other.emoji, '选模型「' + other.label + '」：40 号的当前模型跟着变（' + m0 + ' → ' + m1 + '）', { m0, m1 });
  ok(badge.includes(other.label.split('/').pop()), '标题栏显示当前模型', badge);
  if (SHOTS) { await page.screenshot({ path: SHOT_DIR + '/preset-next' + (MOBILE ? '-m' : '') + '.png' }); }
  await page.evaluate((e) => window.KamiPreset.selectModel(e), m0);
  await page.waitForTimeout(500);
}

/* ⑤ 变量：在概览的「常用」里改一个数字（失焦写回），预设正文跟着变 */
const varKey = Object.keys(v0.state.vars)[0];
if (varKey) {
  await goTab('概览');
  const val0 = v0.state.vars[varKey];
  const label = await inLayer((r) => { const i = [...r.querySelectorAll('input[type="number"]')].find((x) => x.getClientRects().length); return i ? i.getAttribute('aria-label') : null; });
  await inLayer((r, [l, nv]) => {
    const el = [...r.querySelectorAll('input[type="number"]')].find((x) => x.getAttribute('aria-label') === l && x.getClientRects().length);
    el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(nv)); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur();
  }, [label, val0 + 1]);
  await page.waitForTimeout(700);
  const v1 = await view();
  const changedKey = Object.keys(v1.state.vars).find((k) => v1.state.vars[k] !== v0.state.vars[k]);
  ok(!!changedKey && v1.state.vars[changedKey] === v0.state.vars[changedKey] + 1, '改变量（失焦写回）：预设正文里的数字跟着变', { label, changedKey });
  if (changedKey) { await page.evaluate(([k, x]) => window.KamiPreset.presetBridge().setVar(k, x), [changedKey, v0.state.vars[changedKey]]); await page.waitForTimeout(400); }
  const v2 = await view();
  ok(JSON.stringify(v2.state.vars) === JSON.stringify(v0.state.vars), '变量改回原值');
}

/* ⑥ 写作指导页的自定义文风 */
const cs = await page.evaluate(() => window.KamiPreset.presetBridge().customStyles());
if (cs && cs.ok) {
  await goTab(plain(cs.layerName));
  const has = await inLayer((r) => [...r.querySelectorAll('[data-k="setting-section"]')].some((x) => x.textContent.includes('自定义')));
  ok(has, '「' + plain(cs.layerName) + '」页有自定义文风');
}
const a1 = await page.evaluate(auditInPage, null);
ok(a1.failures.length === 0 && a1.checked > 10, '面板对比度：' + a1.checked + ' 处', a1.failures.slice(0, 3));
ok(JSON.stringify((await view()).state.on) === JSON.stringify(v0.state.on), '测完所有开关都回到原状');

/* ⑦ 注销 */
await page.evaluate(() => window.KamiPresetNext.shutdown());
await page.waitForTimeout(3500);
const gone = await page.evaluate(() => ({ api: !!window.KamiPresetNext, open: !!document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"]') }));
const bt2 = await buttons();
ok(!gone.api && !gone.open, '注销后面板与全局 API 收回', gone);
ok(await page.evaluate(() => window.KamiPreset.status().panelOpen === false), '界面注销后 KamiPreset 报告面板已关');
await page.evaluate(() => window.KamiPreset.shutdown());
await page.waitForTimeout(3500);
const gone2 = await page.evaluate(() => ({ preset: !!window.KamiPreset, next: !!window.KamiPresetNext }));
const bt3 = await buttons();
ok(!gone2.preset && !gone2.next && bt3.filter((x) => x.startsWith('🌟')).length === 0, '整条脚本注销后不留 🌟 按钮与全局 API', { gone2, bt3 });
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
