#!/usr/bin/env node
/**
 * 皮肤管理面板：node test/frontend/browser/skin-panel.mjs（需先 node build/frontend/build-preview.mjs）
 * 在预览（真的 SkinManager + 运行库）上验证：
 *   ① 界面由清单生成：皮肤卡数 = 登记的皮肤数，配色选项 = 跟随系统 + 清单每一档，特效 / 参数行数 = 清单项数
 *   ② 换皮肤立即套到面板自己身上，提示条可撤销；配色、动效、密度写进设置并套用
 *   ③ 滑杆：键盘与拖动都能改值，松手才写盘；改「圆角」真的改了令牌
 *   ④ 特效开关、恢复默认 + 撤销；刷新后设置还在
 *   ⑤ 每套皮肤 × 每档配色 × 两种宽度的实际渲染对比度；窄屏不横向溢出
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { auditInPage, serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const b = await chromium.launch();
const URL0 = base + '/design/previews/skin-panel/index.html';
const inLayer = (page, fn, arg) => page.evaluate(([src, arg]) => (0, eval)('(' + src + ')')(document.querySelector('kami-layer').shadowRoot, arg), [fn.toString(), arg]);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('kami-skin-preview') || 'null'));
const CARD = '[data-k="card"][data-role="choice"]';

for (const [label, opts] of [['电脑 1280', { viewport: { width: 1280, height: 900 } }], ['手机 390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
  console.log('\n── ' + label);
  const mobile = !!opts.isMobile;
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL0 + '?reset=1'); await page.waitForTimeout(700);
  await page.goto(URL0); await page.waitForTimeout(700);
  /* 手机：切到指定页签（Radix 页签按焦点激活） */
  const tab = async (i) => { if (!mobile) { return; } await inLayer(page, (r, i) => r.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')[i].focus(), i); await page.waitForTimeout(250); };

  /* ① 清单生成 */
  const shape = await page.evaluate(() => {
    const m = window.__mgr; const cur = m.current.manifest;
    return { skins: m.list().length, schemes: Object.keys(cur.schemes).length, effects: (cur.effects || []).length, params: (cur.params || []).length, name: cur.name };
  });
  await tab(0);
  const cards = await inLayer(page, (r, C) => [...r.querySelectorAll(C)].map((c) => ({ sel: c.getAttribute('data-state') === 'selected', title: c.querySelector('[data-k-part="title"]').textContent })), CARD);
  ok(cards.length === shape.skins, '皮肤卡数 = 登记的皮肤数（' + shape.skins + '）', cards);
  ok(cards.filter((c) => c.sel).length === 1 && cards.find((c) => c.sel).title === shape.name, '当前皮肤的卡选中', cards);
  const swatches = await inLayer(page, (r, C) => [...r.querySelectorAll(C)].map((c) => c.querySelector('[data-k-part="body"] > span').children.length), CARD);
  ok(swatches[0] === shape.schemes, '缩略图按每档配色各画一块', swatches);
  await tab(1);
  const seg = await inLayer(page, () => [...[...document.querySelector('kami-layer').shadowRoot.querySelectorAll('[data-k="segmented"]')][0].querySelectorAll('[data-k-part="item"]')].map((i) => i.textContent));
  ok(seg.length === shape.schemes + 1 && seg[0] === '跟随系统', '配色选项 = 跟随系统 + 清单每一档', seg);
  await tab(2);
  const rows = await inLayer(page, () => ({ sw: document.querySelector('kami-layer').shadowRoot.querySelectorAll('[data-k="setting-row"] [data-k="switch"]').length, sl: [...document.querySelector('kami-layer').shadowRoot.querySelectorAll('[data-k="setting-row"] [role="slider"]')].map((s) => s.getAttribute('aria-label')) }));
  ok(rows.sw === shape.effects, '特效开关数 = 清单特效数', rows);
  ok(rows.sl.filter((x) => x !== '字号').length === shape.params, '参数滑杆数 = 清单参数数', rows);

  /* ② 换皮肤 + 撤销 */
  await tab(0);
  const attr0 = await inLayer(page, (r) => r.querySelector('[data-k-surface]').getAttribute('data-k-skin'));
  await inLayer(page, (r, C) => r.querySelectorAll(C)[1].querySelector('[data-k-part="select"]').click(), CARD);
  await page.waitForTimeout(250);
  const after = await inLayer(page, (r) => ({ skin: r.querySelector('[data-k-surface]').getAttribute('data-k-skin'), toast: (r.querySelector('[data-k="toast"]') || {}).textContent || '', badge: r.querySelector('[data-k="panel"] [data-k-part="actions"]').textContent }));
  const s1 = await stored(page);
  ok(after.skin !== attr0 && s1.skin === after.skin, '换皮肤：渲染面立即换上、设置写盘', { attr0, after, s1: s1 && s1.skin });
  ok(/已换成/.test(after.toast) && after.badge.length > 0, '提示条「已换成…」、标题栏显示当前皮肤', after);
  await inLayer(page, (r) => r.querySelector('[data-k="toast"] [data-k-part="action"]').click());
  await page.waitForTimeout(250);
  ok((await stored(page)).skin === 'suiguang', '撤销：换回原来的皮肤');

  /* 配色 / 动效 / 密度 */
  await tab(1);
  await inLayer(page, (r) => { const items = r.querySelectorAll('[data-k="segmented"]')[0].querySelectorAll('[data-k-part="item"]'); items[2].click(); });
  await page.waitForTimeout(200);
  let st = await stored(page);
  const mode = await inLayer(page, (r) => r.querySelector('[data-k-surface]').getAttribute('data-k-mode'));
  ok(st.perSkin.suiguang && st.perSkin.suiguang.scheme === 'dark' && mode === 'dark', '选「深色」：存进这套皮肤自己的设置、渲染面变深色', { st: st.perSkin, mode });
  await inLayer(page, (r) => { const segs = r.querySelectorAll('[data-k="setting-row"] [data-k="segmented"]'); segs[0].querySelectorAll('[data-k-part="item"]')[1].click(); segs[1].querySelectorAll('[data-k-part="item"]')[0].click(); });
  await page.waitForTimeout(200);
  st = await stored(page);
  const sattr = await inLayer(page, (r) => ({ m: r.querySelector('[data-k-surface]').getAttribute('data-k-motion'), d: r.querySelector('[data-k-surface]').getAttribute('data-k-density') }));
  ok(st.global.motion === 'calm' && st.global.density === 'compact' && sattr.m === 'calm' && sattr.d === 'compact', '动效「平静」、密度「紧凑」：全局设置、渲染面属性同步', { g: st.global, sattr });

  /* ③ 滑杆：字号用键盘（松手 = 每次按键都提交）；圆角用拖动 */
  const fs0 = st.global.fontScale;
  await inLayer(page, (r) => [...r.querySelectorAll('[role="slider"]')].find((s) => s.getAttribute('aria-label') === '字号').focus());
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  st = await stored(page);
  const fsAria = await inLayer(page, (r) => [...r.querySelectorAll('[role="slider"]')].find((s) => s.getAttribute('aria-label') === '字号').getAttribute('aria-valuetext'));
  ok(Math.abs(st.global.fontScale - (fs0 + 0.1)) < 1e-9 && fsAria === '110%', '字号：方向键两下 = +10%，读屏文字是百分比', { fs: st.global.fontScale, fsAria });
  await page.keyboard.press('End'); await page.waitForTimeout(120);
  ok((await stored(page)).global.fontScale === 1.4, 'End 到最大值 140%');
  await tab(2);
  const r0 = await inLayer(page, (r) => getComputedStyle(r.querySelector('[data-k-surface]')).getPropertyValue('--k-r-md').trim());
  const box = await inLayer(page, (r) => { const s = [...r.querySelectorAll('[role="slider"]')].find((x) => x.getAttribute('aria-label') === '圆角'); s.scrollIntoView({ block: 'center' }); const t = s.parentElement.getBoundingClientRect(); return { x: t.left, y: t.top + t.height / 2, w: t.width }; });
  await page.mouse.move(box.x + box.w * 0.5, box.y);
  await page.mouse.down(); await page.mouse.move(box.x + box.w * 0.8, box.y, { steps: 4 });
  const mid = (await stored(page)).perSkin.suiguang.params;
  await page.mouse.move(box.x + box.w, box.y, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(200);
  st = await stored(page);
  const r1 = await inLayer(page, (r) => getComputedStyle(r.querySelector('[data-k-surface]')).getPropertyValue('--k-r-md').trim());
  ok(st.perSkin.suiguang.params && st.perSkin.suiguang.params.corner === 12, '拖动「圆角」到最右 = 12', st.perSkin.suiguang);
  ok(r0 !== r1, '圆角令牌真的变了（' + r0 + ' → ' + r1 + '）');
  ok(!mid || mid.corner !== undefined, '拖动中按帧套用（不必等松手）', mid);

  /* ④ 特效开关、恢复默认 + 撤销 */
  await inLayer(page, (r) => r.querySelector('[data-k="setting-row"] [data-k="switch"]').click());
  await page.waitForTimeout(150);
  st = await stored(page);
  ok(Array.isArray(st.perSkin.suiguang.effects) && !st.perSkin.suiguang.effects.includes('fracture'), '关掉第一个特效（碎光）', st.perSkin.suiguang);
  await inLayer(page, (r) => [...r.querySelectorAll('[data-k="button"]')].find((x) => /恢复这套皮肤/.test(x.textContent)).click());
  await page.waitForTimeout(200);
  ok(!(await stored(page)).perSkin.suiguang, '恢复默认：清掉这套皮肤自己的设置');
  await inLayer(page, (r) => r.querySelector('[data-k="toast"] [data-k-part="action"]').click());
  await page.waitForTimeout(200);
  const restored = (await stored(page)).perSkin.suiguang;
  ok(restored && restored.scheme === 'dark' && restored.params.corner === 12 && !restored.effects.includes('fracture'), '撤销恢复默认：配色、参数、特效原样回来', restored);
  await page.reload(); await page.waitForTimeout(700);
  const reload = await inLayer(page, (r) => ({ mode: r.querySelector('[data-k-surface]').getAttribute('data-k-mode'), density: r.querySelector('[data-k-surface]').getAttribute('data-k-density') }));
  ok(reload.mode === 'dark' && reload.density === 'compact', '刷新后设置还在', reload);

  /* ⑤ 对比度：每套皮肤 × 每档配色（预览是一个面板，审计整个浮层） */
  await page.goto(URL0 + '?reset=1'); await page.waitForTimeout(700);
  const combos = await page.evaluate(() => window.__mgr.list().flatMap((m) => Object.keys(m.schemes).map((s) => [m.id, s])));
  let checked = 0; const bad = [];
  for (const [skin, scheme] of combos) {
    await page.evaluate(([k, s]) => { window.__mgr.select(k); window.__mgr.setScheme(s); }, [skin, scheme]);
    await page.waitForTimeout(150);
    for (const i of mobile ? [0, 1, 2] : [0]) {
      await tab(i);
      const a = await page.evaluate(auditInPage, null);
      checked += a.checked; if (a.failures.length) { bad.push(skin + '/' + scheme + '#' + i + ': ' + JSON.stringify(a.failures.slice(0, 2))); }
    }
  }
  ok(bad.length === 0 && checked > 100, '对比度：' + combos.length + ' 档配色共 ' + checked + ' 处', bad.slice(0, 3));
  const overflow = await inLayer(page, (r) => { const p = r.querySelector('[data-k="panel"]'); const bd = p.querySelector(':scope > [data-k-part="body"]'); return bd.scrollWidth > bd.clientWidth + 1 || p.getBoundingClientRect().right > innerWidth + 1; });
  ok(!overflow, '不横向溢出');
  ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
  await ctx.close();
}
await b.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
