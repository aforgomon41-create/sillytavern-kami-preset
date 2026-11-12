// 「🧭 引导」脚本（v1.0：引导界面 + 展示记录 + 各脚本的读写桥）在真实酒馆里的验证：
//   node test/st/guide-next.mjs [--mobile] [--shots]
// 前提：测试酒馆与假模型在跑，已用 install-preset.mjs 装了**新的**支线测试包（新版本没看过 → 会自动弹），见 test/st/README.md
// 核对（2026-11-03 重做）：没确认免责声明与开源许可时自动弹出、没有关闭按钮、Esc 关不掉、按钮条其他按钮先跳回引导、
//       不勾同意不能继续；确认后能关、按钮照常；预设每个层级各一页、出厂默认标「默认」、能一键恢复本页默认；
//       消息界面的样例回复能点；模型 / 语言写进预设，压缩写进 60 号，防截断写进 20 号（测完都改回）；
//       完成后记下「这一版已完成」；对比度；注销后按钮与界面收回。
// ⚠ 会清掉确认记录（KamiGuide.reset），跑完会重新确认（引导里勾选同意），不影响后面的测试。
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
await page.waitForFunction(() => window.KamiGuide, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(12000);   /* 等引导读完展示记录、首次自动弹的判断走完，再清记录（太早清会被它随后的存盘盖掉） */
await page.keyboard.press('Escape');
await page.evaluate(() => window.KamiGuide.reset());
await page.reload();
await page.waitForFunction(() => window.KamiGuide && window.KamiPreset && window.KamiPreset.presetBridge, null, { timeout: 60000 }).catch(() => {});
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

/* ① 没确认免责声明与开源许可：自动弹出、关不掉、其他按钮先跳回来 */
ok((await stepId()) === 'disclaimer', '清掉确认记录后加载：自动弹出引导，停在免责声明', await stepId());
ok(await page.evaluate(() => window.KamiGuide.status().open && !window.KamiGuide.status().accepted), '状态：已打开、未确认');
const bt = await buttons();
ok(bt.filter((x) => x.startsWith('🧭')).length === 1, '按钮条只有一颗 🧭', bt);
const disc = await inLayer((r) => { const d = r.querySelector('[data-guide-disclaimer]'); return d ? d.textContent : ''; });
ok(disc.length > 50 && /开源许可|CC BY-NC/.test(disc), '免责声明与开源许可正文现读预设（' + disc.length + ' 字）');
ok(await inLayer((r) => !r.querySelector('[data-k="panel"] > [data-k-part="head"] [data-k-part="close"]')), '确认前没有关闭按钮');
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok((await stepId()) === 'disclaimer', '确认前按 Esc 关不掉');
await clickBtn('🌟 预设设置'); await page.waitForTimeout(800);
ok((await stepId()) === 'disclaimer' && !(await page.evaluate(() => window.KamiPresetNext && window.KamiPresetNext.isOpen())), '确认前点「🌟 预设设置」：不打开预设面板，留在引导');
await inLayer((r) => { const it = [...r.querySelectorAll('[data-k="nav"] [data-k-part="item"]')][2]; if (it) { it.click(); } });
await page.waitForTimeout(200);
ok((await stepId()) === 'disclaimer', '确认前点导航里后面的步骤不跳');
const primary = () => inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); const btn = [...p.querySelectorAll('button')].filter((x) => x.getAttribute('data-variant') === 'primary' && x.getClientRects().length).pop(); return btn ? { text: btn.textContent, disabled: btn.disabled } : null; });
const pb = await primary();
ok(pb && pb.disabled, '没勾「我已阅读并同意」时「同意并继续」点不了', pb);
/* 2026-11-12 用户反映「同意框有时勾不上」：整行可点、框在文字前面、不贴滚动条。用真指针（电脑鼠标 / 手机触摸）点，不用 JS click */
const agreeAt = (where) => inLayer((r, w) => {
  const row = r.querySelector('[data-guide-step="disclaimer"] [data-guide-agree]');
  if (!row) { return null; }
  row.scrollIntoView({ block: 'center' });
  const cb = row.querySelector('[data-k="checkbox"]'), q = (w === 'box' ? cb : row.querySelector('span')).getBoundingClientRect();
  return { x: w === 'box' ? q.left + q.width / 2 : q.left + Math.min(60, q.width / 2), y: q.top + q.height / 2, state: cb.getAttribute('data-state') };
}, where);
const tap = async (p) => { if (MOBILE) { await page.touchscreen.tap(p.x, p.y); } else { await page.mouse.click(p.x, p.y); } await page.waitForTimeout(300); };
const ag0 = await agreeAt('text');
ok(ag0 && ag0.state === 'unchecked', '同意这一行存在（框在文字前面）', ag0);
const geo = await inLayer((r) => {
  const row = r.querySelector('[data-guide-agree]'), cb = row.querySelector('[data-k="checkbox"]'), sc = row.closest('[data-k-part="body"]');
  const rr = row.getBoundingClientRect(), cr = cb.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  const hits = [[.2, .5], [.5, .5], [.8, .5]].map(([fx, fy]) => { const el = r.elementFromPoint(rr.left + rr.width * fx, rr.top + rr.height * fy); return !!el && row.contains(el); });
  return { boxLeft: Math.round(cr.left - rr.left), boxToScroller: Math.round(sr.right - cr.right), hits };
});
ok(geo.boxLeft < 40 && geo.boxToScroller > 100 && geo.hits.every(Boolean), '勾选框靠左、离滚动条远，整行上点哪里都落在这一行上', geo);
await tap(ag0);
ok((await agreeAt('text')).state === 'checked', (MOBILE ? '触摸' : '鼠标') + '点「我已阅读并同意」的文字就能勾上');
await tap(await agreeAt('box'));
ok((await agreeAt('box')).state === 'unchecked', (MOBILE ? '触摸' : '鼠标') + '点框本身能取消');
await tap(await agreeAt('box'));
ok((await agreeAt('box')).state === 'checked', '再点框又勾上');
if (!MOBILE) {
  /* 左侧步骤列表不超过可见高度：内容区滚到底时第一步仍完整可见（不缩到标题栏下面） */
  const navOk = await inLayer((r) => {
    const sc = r.querySelector('[data-guide-step]').closest('[data-k-part="body"]'); sc.scrollTop = sc.scrollHeight;
    return new Promise((res) => requestAnimationFrame(() => { const it = r.querySelector('[data-guide-nav] [data-k-part="item"]'); const a = it.getBoundingClientRect(), b = sc.getBoundingClientRect(); res({ itemTop: Math.round(a.top), bodyTop: Math.round(b.top) }); }));
  });
  ok(navOk.itemTop >= navOk.bodyTop, '内容滚到底时，左侧第一步仍完整可见', navOk);
}
const next = () => inLayer((r) => { const p = r.querySelector('[data-k="panel"]'); const btn = [...p.querySelectorAll('button')].filter((x) => x.getAttribute('data-variant') === 'primary' && x.getClientRects().length).pop(); if (btn && !btn.disabled) { btn.click(); } return btn ? btn.textContent : null; });
await next(); await page.waitForTimeout(500);
ok((await stepId()) === 'tour', '勾选并确认后进入「先认识一下」', await stepId());
ok(await page.evaluate(() => window.KamiGuide.status().accepted && window.KamiGuide.accepted()), '记下已确认（这一份声明）');
ok(await inLayer((r) => !!r.querySelector('[data-k="panel"] > [data-k-part="head"] [data-k-part="close"]')), '确认后出现关闭按钮');
const terms = await inLayer((r) => r.querySelectorAll('[data-guide-step="tour"] [data-guide-terms] dt').length);
ok(terms >= 5, '按钮条地图列出 ' + terms + ' 个按钮');

/* ② 外观、模型 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'skin', '下一步：外观');
const skinCards = await inLayer((r) => r.querySelectorAll('[data-guide-step="skin"] [data-k="card"][data-role="choice"]').length);
ok(skinCards >= 1, '外观页有皮肤卡（来自「🎨 显示」）', skinCards);
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

/* ③ 预设的每个层级各一页：出厂默认标「默认」，改了能一键恢复 */
const layers = v0.tabs.filter((t) => t.kind === 'layer');
const seenLayers = [];
for (let n = 0; n < layers.length; n++) {
  await next(); await page.waitForTimeout(400);
  const id = await stepId();
  if (!id || !id.startsWith('layer:')) { break; }
  seenLayers.push(id.slice(6));
  if (n === 0) {
    const badges = await inLayer((r) => [...r.querySelectorAll('[data-guide-step] [data-k="card"][data-role="choice"] [data-k-part="meta"]')].filter((x) => x.textContent === '默认').length);
    ok(badges >= 3, '第一个层级页：出厂默认的卡片标了「默认」（' + badges + ' 张）');
    const lang = v0.tabs.flatMap((t) => t.groups || []).find((g) => /语言/.test(g.name));
    const cur = lang && lang.items.find((i) => v0.state.on[i.id]), alt = lang && lang.items.find((i) => i.id !== (cur && cur.id) && !i.locked);
    if (alt) {
      await clickCard(plain(alt.name)); await page.waitForTimeout(600);
      ok((await liveOn(alt.id)) === true, '语言切到「' + alt.name + '」写进预设');
      await inLayer((r) => { const btn = [...r.querySelectorAll('[data-k="panel"] button')].find((x) => x.textContent === '恢复本页默认'); btn && btn.click(); });
      await page.waitForTimeout(800);
      ok((await liveOn(cur.id)) === true && (await liveOn(alt.id)) === false, '「恢复本页默认」把语言改回「' + cur.name + '」');
    }
  }
}
ok(seenLayers.length === layers.length, '预设的每个层级都有一页：' + seenLayers.join('、'), layers.map((t) => t.name));

/* ④ 消息界面：可点的样例回复 */
await next(); await page.waitForTimeout(600);
ok((await stepId()) === 'message', '下一步：消息界面', await stepId());
const sample = await inLayer((r) => { const s = r.querySelector('[data-guide-sample]'); return s ? ['msg-think', 'msg-search', 'msg-options'].filter((k) => s.querySelector('[data-k="' + k + '"]')).length : 0; });
ok(sample === 3, '样例回复里有思维链、搜索资料、行动选项', sample);
await inLayer((r) => { const it = r.querySelector('[data-guide-sample] [data-k="msg-options"] > [data-k-part="fold"] [data-k-part="list"] > li > [data-k-part="item"]'); it && it.click(); });
await page.waitForTimeout(300);
ok(await inLayer((r) => /样例里点了/.test(r.querySelector('[data-guide-step="message"]').textContent)), '点样例里的行动选项有反馈（不进聊天）');

/* ⑤ 长文与截断 */
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

/* ⑥ 网络搜索、其他工具、完成 */
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'search', '下一步：网络搜索');
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'tools', '下一步：其他工具');
await next(); await page.waitForTimeout(400);
ok((await stepId()) === 'done', '下一步：完成');
const chips = await inLayer((r) => [...r.querySelectorAll('[data-guide-summary] [data-k="badge"]')].map((x) => x.textContent));
ok(chips.some((c) => c.startsWith('模型')) && chips.some((c) => c.startsWith('皮肤')), '完成页列出这次的选择', chips);
await next(); await page.waitForTimeout(500);
ok(!(await stepId()), '点「完成」关掉引导');
ok(await page.evaluate(() => window.KamiGuide.status().completed), '记下这一版已完成');
ok((await page.evaluate(() => window.KamiPreset.currentModel())) === m0, '测完模型复原');

/* ⑦ 确认后按钮照常；重开、注销 */
await clickBtn('🌟 预设设置'); await page.waitForTimeout(900);
ok(await page.evaluate(() => window.KamiPresetNext && window.KamiPresetNext.isOpen()), '确认后「🌟 预设设置」照常打开');
await page.evaluate(() => window.KamiPresetNext.close()); await page.waitForTimeout(400);
await clickBtn('🧭 引导'); await page.waitForTimeout(600);
ok((await stepId()) === 'disclaimer' && await inLayer((r) => /已同意/.test(r.querySelector('[data-guide-step]').textContent)), '点「🧭 引导」重新打开，免责声明页显示已同意');
await page.evaluate(() => window.KamiGuide.shutdown());
await page.waitForTimeout(3500);
ok(!(await stepId()) && !(await page.evaluate(() => !!window.KamiGuide)), '注销后界面与全局 API 收回');
const bt2 = await buttons();
ok(bt2.filter((x) => x.startsWith('🧭')).length === 0, '注销后按钮收回（旧引导已退役，不再有接手的）', bt2);
ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
