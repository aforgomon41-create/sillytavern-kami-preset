// 「🧰 工具箱」脚本（v2.0：压缩 / 搜索逻辑 + 运行库的工具箱面板）在真实酒馆里的验证：
//   node test/st/toolbox-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了支线测试包，见 test/st/README.md
// 核对：按钮条只有一颗 🧰；四个页签；压缩页的开关 / 数字写进 60 号；搜索页开关写进搜索服务；
//       其他功能写进 40 号（标签处理档位、常驻指令）；更新页有版本信息、能检查；70 号的逐条裁决走新窗口；
//       手动搜索窗口；对比度；注销后按钮、面板与全局 API 收回。
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
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /kami|工具箱|React/i.test(t)) { errors.push('console: ' + t.slice(0, 200)); } });

await page.goto(ST);
await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
});
await page.waitForTimeout(2500);
await page.waitForFunction(() => window.KamiToolboxNext && window.KamiToolbox && window.KamiPreset, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(3000);

const inLayer = (fn, arg) => page.evaluate(([src, a]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, a) : null; }, [fn.toString(), arg]);
const buttons = () => page.evaluate(() => [...document.querySelectorAll('.qr--button, [data-hub-btn], #TH-script-buttons .menu_button, .qr--buttons > *')].map((x) => x.textContent.trim()).filter(Boolean));
const clickBtn = (name) => page.evaluate((n) => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim().startsWith(n)); if (el) { el.click(); } return !!el; }, name);
const toTab = async (label) => { await inLayer((r, l) => { const t = [...r.querySelectorAll('[data-k="panel"] [data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((x) => x.textContent.includes(l)); if (t) { t.focus(); t.click(); } }, label); await page.waitForTimeout(400); };
/* 失焦写回的输入框：填值后 blur */
const commit = (label, value) => inLayer((r, [l, v]) => {
  const el = [...r.querySelectorAll('input, textarea')].find((x) => x.getAttribute('aria-label') === l && x.getClientRects().length);
  if (!el) { return false; }
  el.focus();
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
  return true;
}, [label, value]);

/* ① 按钮条 */
const bt = await buttons();
ok(bt.filter((x) => x.startsWith('🧰')).length === 1, '按钮条只有一颗 🧰', bt);

/* ② 打开面板 */
ok(await clickBtn('🧰 工具箱'), '找到「🧰 工具箱」按钮');
await page.waitForTimeout(900);
const panel = await inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); return p ? { title: p.querySelector('[data-k-part="title"]').textContent, tabs: [...p.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].map((t) => t.textContent) } : null; });
ok(panel && panel.title.includes('工具箱') && panel.tabs.length === 4 && panel.tabs.join() === '压缩,网络搜索,其他功能,更新', '点按钮打开新工具箱：四个页签带图标', panel);
const st0 = await page.evaluate(() => ({ open: window.KamiToolbox.status().open, oldDom: !!document.getElementById('kami-compress-panel'), oldCss: !!document.getElementById('kami-compress-css') }));
ok(st0.open === true && !st0.oldDom && !st0.oldCss, 'KamiToolbox.status() 反映新面板已打开；页面上没有旧面板的节点与样式', st0);

/* ③ 压缩页：超限压缩开关、阈值 */
/* 按卡片标题找（滚动压缩卡的说明里也提到「超限压缩」，不能按全文找） */
const clickGrand = () => inLayer((r) => { const c = [...r.querySelectorAll('[data-k="card"][data-role="choice"]')].find((x) => (x.querySelector('[data-k-part="title"]') || {}).textContent?.startsWith('超限')); if (c) { c.querySelector('[data-k-part="select"]').click(); } return !!c; });
const g0 = await page.evaluate(() => window.KamiSummarize.status().grandOn);
const roll0 = await page.evaluate(() => window.KamiSummarize.status().roll.enabled);
await clickGrand();
await page.waitForTimeout(500);
const g1 = await page.evaluate(() => window.KamiSummarize.status().grandOn);
ok(g1 === !g0, '点「超限压缩」卡：60 号的开关跟着变（' + g0 + ' → ' + g1 + '）');
if (!g1) { await clickGrand(); await page.waitForTimeout(500); }   /* 阈值等参数只在开着时显示 */
const th0 = await page.evaluate(() => window.KamiSummarize.status().threshold);
const thLabel = await inLayer((r) => { const i = [...r.querySelectorAll('input[type="number"]')].find((x) => /触发上限/.test(x.getAttribute('aria-label') || '')); return i ? i.getAttribute('aria-label') : null; });
await commit(thLabel, String(th0 + 1000));
await page.waitForTimeout(600);
const th1 = await page.evaluate(() => window.KamiSummarize.status().threshold);
ok(th1 === th0 + 1000, '改阈值（失焦写回）：60 号收到 ' + th1, { thLabel, th0, th1 });
await commit(thLabel, String(th0)); await page.waitForTimeout(400);
await page.evaluate((g) => window.KamiSummarize.setGrand(g), g0);
const roll1 = await page.evaluate(() => window.KamiSummarize.status().roll.enabled);
ok(roll1 === roll0, '滚动压缩没被误动', { roll0, roll1 });
const modelSec = await inLayer((r) => [...r.querySelectorAll('[data-k="segmented"]')].map((s) => s.getAttribute('aria-label')));
ok(modelSec.some((x) => /模型/.test(x || '')), '压缩页有大总结模型设置', modelSec);
const a1 = await page.evaluate(auditInPage, null);
ok(a1.failures.length === 0 && a1.checked > 10, '压缩页对比度：' + a1.checked + ' 处', a1.failures.slice(0, 3));
if (SHOTS) { await page.screenshot({ path: SHOT_DIR + '/toolbox-next' + (MOBILE ? '-m' : '') + '.png' }); }

/* ④ 网络搜索页 */
await toTab('网络搜索');
const s0 = await page.evaluate(() => window.KamiToolbox.status().search.enabled);
await inLayer((r) => { const sw = [...r.querySelectorAll('[role="switch"]')].find((x) => x.getAttribute('aria-label') === '开启搜索能力'); sw && sw.click(); });
await page.waitForTimeout(600);
const s1 = await page.evaluate(() => window.KamiToolbox.status().search.enabled);
ok(s1 === !s0, '「开启搜索能力」写进搜索服务（' + s0 + ' → ' + s1 + '）');
await page.evaluate(() => window.KamiToolbox.bridge().search.configure({ enabled: true, mode: 'service' }));
await page.waitForTimeout(500);
const svc = await inLayer((r) => ({ manual: [...r.querySelectorAll('button')].some((x) => x.textContent.startsWith('手动搜索')), conn: [...r.querySelectorAll('[data-k="setting-section"]')].some((x) => x.textContent.includes('搜索服务连接')) }));
ok(svc.manual && svc.conn, '选「搜索服务」：出现手动搜索按钮与服务连接设置', svc);
await inLayer((r) => { [...r.querySelectorAll('button')].find((x) => x.textContent.startsWith('手动搜索')).click(); });
await page.waitForTimeout(600);
const ms = await inLayer((r) => { const d = [...r.querySelectorAll('[role="dialog"]')].find((x) => x.textContent.includes('这次想查什么')); return !!d; });
ok(ms, '手动搜索窗口打开（新界面）');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.evaluate((v) => window.KamiToolbox.bridge().search.configure({ enabled: v }), s0);

/* ⑤ 其他功能 */
await toTab('其他功能');
const folds = await inLayer((r) => [...r.querySelectorAll('[data-k="card"][data-role="collapse"]')].filter((c) => c.getClientRects().length).map((c) => c.getAttribute('data-state')));
ok(folds.length === 3 && folds.every((x) => x === 'closed'), '其他功能：三张折叠卡片，默认收起', folds);
await inLayer((r) => { [...r.querySelectorAll('[data-k="card"][data-role="collapse"]:not([data-state="open"]) > [data-k-part="head"]')].filter((h) => h.getClientRects().length).forEach((h) => h.click()); });
await page.waitForTimeout(500);
const t0 = await page.evaluate(() => window.KamiPreset.toolsBridge().get().tag.mode);
await inLayer((r, m) => { const s = [...r.querySelectorAll('[data-k="segmented"]')].find((x) => x.getAttribute('aria-label') === '处理方式'); [...s.querySelectorAll('[data-k-part="item"]')].find((i) => i.textContent === (m === 'close' ? '删除' : '补全')).click(); }, t0);
await page.waitForTimeout(400);
const t1 = await page.evaluate(() => window.KamiPreset.toolsBridge().get().tag.mode);
ok(t1 !== t0 && (t1 === 'close' || t1 === 'del'), '标签处理档位写进 40 号（' + t0 + ' → ' + t1 + '）');
await page.evaluate((m) => window.KamiPreset.toolsBridge().setTagMode(m), t0);
const god0 = await page.evaluate(() => window.KamiPreset.toolsBridge().get().god.text);
await commit('指令内容', 'kami-test-god');
await page.waitForTimeout(400);
const god1 = await page.evaluate(() => window.KamiPreset.toolsBridge().get().god.text);
ok(god1 === 'kami-test-god', '常驻附加指令内容写进全局变量', god1);
await page.evaluate((t) => window.KamiPreset.toolsBridge().setGodText(t), god0);

/* ⑥ 更新页 */
await toTab('更新');
const up = await inLayer((r) => ({ rows: [...r.querySelectorAll('[data-k="setting-row"]')].map((x) => x.textContent).filter((x) => /酒馆版本|酒馆助手|预设版本/.test(x)).length }));
ok(up.rows === 3, '更新页：版本信息三行', up);
await inLayer((r) => { [...r.querySelectorAll('button')].find((x) => x.textContent === '检查更新').click(); });
await page.waitForFunction(() => { const r = document.querySelector('kami-layer').shadowRoot; const e = r.querySelector('[data-update-result]'); return e && e.textContent && e.textContent !== '正在检查…'; }, null, { timeout: 30000 }).catch(() => {});
const res = await inLayer((r) => { const e = r.querySelector('[data-update-result]'); return e ? e.textContent : null; });
ok(res && res !== '正在检查…', '检查更新有结果：' + res);
/* 70 号的逐条裁决：直接调登记的界面 */
const review = page.evaluate(() => new Promise((resolve) => {
  const plan = { conflicts: [{ key: 'a', name: '条目 A', kind: 'prompt', fields: ['内容'] }, { key: 'b', name: '条目 B', kind: 'order' }] };
  window.KamiUpdateUi.review(plan, (p) => resolve(p ? p.conflicts.map((c) => c.choice) : null));
}));
await page.waitForTimeout(600);
await inLayer((r) => { const d = r.querySelector('[data-merge-review]').closest('[role="dialog"]'); [...d.querySelectorAll('button')].find((x) => x.textContent === '全部用新版').click(); });
await page.waitForTimeout(200);
await inLayer((r) => { const d = r.querySelector('[data-merge-review]').closest('[role="dialog"]'); [...d.querySelectorAll('button')].find((x) => x.textContent === '应用并完成').click(); });
const picks = await review;
ok(JSON.stringify(picks) === '["next","next"]', '逐条裁决窗口：「全部用新版」后完成，结果交回 70 号', picks);
const a2 = await page.evaluate(auditInPage, null);
ok(a2.failures.length === 0, '更新页对比度：' + a2.checked + ' 处', a2.failures.slice(0, 3));

/* ⑦ 注销（整个脚本：界面一段 + 逻辑一段） */
await page.evaluate(() => { window.KamiToolboxNext.shutdown(); window.KamiToolbox.shutdown(); });
await page.waitForTimeout(3500);
const gone = await page.evaluate(() => ({ api: !!window.KamiToolboxNext, ui: !!window.KamiUpdateUi, tb: !!window.KamiToolbox, sum: !!window.KamiSummarize, open: !!document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="panel"]'), css: !!document.getElementById('kami-compress-css') }));
const bt2 = await buttons();
ok(!gone.api && !gone.ui && !gone.tb && !gone.sum && !gone.open && !gone.css, '注销后面板、全局 API 收回，不留旧面板样式', gone);
ok(bt2.filter((x) => x.startsWith('🧰')).length === 0, '注销后按钮收回（旧工具箱面板已删，不再有接手的）', bt2);
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
