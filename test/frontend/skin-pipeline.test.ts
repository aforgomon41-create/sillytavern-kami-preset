import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { validateManifest, type SkinManifest } from '../../src/frontend/skin-engine/package';
import { composeSkin, DEFAULT_SETTINGS } from '../../src/frontend/skin-engine/compose';
import { resolveScales } from '../../src/frontend/skin-engine/scales';
import { lintSkinCss } from '../../src/frontend/skin-engine/lint-css';
import { StyleHub } from '../../src/frontend/skin-engine/sheets';

const base: SkinManifest = {
  id: 'sample', name: '样例', version: '0.1.0', contract: '1.0', defaultScheme: 'dark',
  schemes: {
    dark: { seeds: { neutral: '#1e2126', accent: '#7aa2f7', radius: 10 } },
    light: { seeds: { neutral: '#f4f1ea', accent: '#2f5bd3' } }
  },
  effects: [{ id: 'grain', name: '颗粒', default: true }, { id: 'glow', name: '辉光', default: false }],
  params: [
    { id: 'accent-pick', name: '强调色', type: 'color', default: '#7aa2f7', bind: 'seed:accent' },
    { id: 'grain-alpha', name: '颗粒浓度', type: 'number', default: 0.2, min: 0, max: 1, bind: 'var:--k-skin-grain' }
  ]
};

test('清单校验：合法清单通过', () => { assert.deepEqual(validateManifest(base), []); });

test('清单校验：逐项报出错误', () => {
  const bad = { ...base, id: 'Bad Id', contract: '2.0', defaultScheme: 'light', schemes: { dark: { seeds: { neutral: 'red', accent: '#123' } } },
    params: [{ id: 'p', name: 'p', type: 'number', default: 5, min: 0, max: 1, bind: 'var:--other' }], assets: { hero: { file: '../x.gif' } } };
  const e = validateManifest(bad).join('\n');
  for (const k of ['id 必须', 'contract 必须', 'neutral 必须', 'defaultScheme', '默认值不在范围', 'bind 不合法', '素材 hero']) { assert.ok(e.includes(k), '应报：' + k + '\n' + e); }
});

test('非颜色令牌：密度、字号缩放、动效关闭', () => {
  const t = resolveScales({ mode: 'dark', accent: '#7aa2f7', density: 'compact', motion: 'off', fontScale: 1.2, radius: 10 });
  assert.equal(t['space-1'], '3px');
  assert.equal(t['control-h'], '30px');
  assert.equal(t['fs-md'], '16.8px');
  assert.equal(t['dur'], '0ms');
  assert.equal(t['r-md'], '10px');
});

test('合成：默认特效、参数写到种子与皮肤变量、属性齐全', () => {
  const c = composeSkin(base, { ...DEFAULT_SETTINGS, scheme: 'dark', params: { 'accent-pick': '#ff8800', 'grain-alpha': 9 } });
  assert.equal(c.mode, 'dark');
  assert.ok(c.css.includes('--k-accent: #ff8800;'), '颜色参数应写进强调色');
  assert.ok(c.css.includes('--k-skin-grain: 1;'), '数值参数应按范围裁剪');
  assert.ok(c.css.startsWith('@layer k.tokens {'));
  assert.deepEqual(c.attrs['data-k-effects'], 'grain');
  assert.equal(c.attrs['data-k-skin'], 'sample');
});

test('合成：auto 跟随系统，缺的方案回落到默认方案', () => {
  assert.equal(composeSkin(base, { ...DEFAULT_SETTINGS, scheme: 'auto' }, { systemDark: false }).mode, 'light');
  const onlyDark: SkinManifest = { ...base, schemes: { dark: base.schemes.dark! } };
  assert.equal(composeSkin(onlyDark, { ...DEFAULT_SETTINGS, scheme: 'light' }).mode, 'dark');
});

test('合成：L2 组件配色按对写入，不存在的配色对抛错', () => {
  const m: SkinManifest = { ...base, schemes: { dark: { seeds: base.schemes.dark!.seeds, components: { button: { tone: 'accent-soft' } } } } };
  const c = composeSkin(m, { ...DEFAULT_SETTINGS, scheme: 'dark' });
  assert.ok(c.css.includes('--k-button-bg: var(--k-accent-soft);') && c.css.includes('--k-button-fg: var(--k-on-accent-soft);'));
  const bad: SkinManifest = { ...base, schemes: { dark: { seeds: base.schemes.dark!.seeds, components: { button: { tone: 'nope' } } } } };
  assert.throws(() => composeSkin(bad, { ...DEFAULT_SETTINGS, scheme: 'dark' }));
});

test('合成：皮肤 CSS 被包进 k.skin 层，素材变量写进令牌层', () => {
  const c = composeSkin(base, { ...DEFAULT_SETTINGS, scheme: 'dark' }, { skinCss: '[data-k="button"] { border-radius: 0; }', assetUrls: { mascot: 'data:image/png;base64,AAAA' } });
  assert.ok(c.css.includes('@layer k.skin {\n[data-k="button"]'));
  assert.ok(c.css.includes('--k-asset-mascot: url("data:image/png;base64,AAAA");'));
});

test('皮肤 CSS 检查：合规的写法通过', () => {
  const ok = `
[data-k="button"][data-variant="primary"] { border-radius: var(--k-r-pill); box-shadow: var(--k-shadow-2); }
[data-k="card"]::before { position: absolute; inset: 0; background-image: var(--k-asset-grain); pointer-events: none; }
[data-k-ornament="panel-head-start"] { position: absolute; left: 8px; }
:host([data-k-effects~="glow"]) [data-k="button"] { filter: drop-shadow(0 0 4px var(--k-accent)); }
@media (max-width: 600px) { [data-k="tabs"] [data-k-part="tab"] { padding: 0 8px; } }
@keyframes k-skin-pulse { from { opacity: .6; } to { opacity: 1; } }
[data-k="badge"] { background: url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"); }`;
  assert.deepEqual(lintSkinCss(ok), []);
});

test('皮肤 CSS 检查：逐项拦截', () => {
  const bad = `
@import url("x.css");
@layer foo { [data-k="button"] { color: red; } }
.kami-btn { color: red; }
[data-k="button"] { color: red !important; }
[data-k="card"] { position: fixed; }
[data-k="panel"] { transform: translateX(10px); }
[data-k="badge"] { background: url(https://evil.example/x.png); }
@font-face { font-family: x; src: url(data:font/woff2;base64,AA); }
[data-k="buton"] { color: red; }
[data-k="card"] [data-k-part="tittle"] { color: red; }`;
  const msgs = lintSkinCss(bad).map((i) => i.message).join('\n');
  for (const k of ['@import', '@layer', '公开钩子', '!important', '结构属性 position', '不许 transform', 'url() 只允许', '@font-face', '[data-k="buton"]', '[data-k-part="tittle"]']) {
    assert.ok(msgs.includes(k), '应拦截：' + k + '\n' + msgs);
  }
});

test('样式表共享：不支持可构造样式表时退回为每个根两个 <style>，更新同步', () => {
  const dom = new JSDOM('<!doctype html><body><div id="a"></div><div id="b"></div></body>');
  const doc = dom.window.document;
  const hub = new StyleHub(doc, { forceFallback: true });
  hub.setDesignSystem('/*ds*/');
  const ra = doc.getElementById('a')!.attachShadow({ mode: 'open' });
  const rb = doc.getElementById('b')!.attachShadow({ mode: 'open' });
  const offA = hub.attach(ra); hub.attach(rb);
  hub.setSkin('/*skin-1*/');
  assert.equal(hub.shared, false);
  assert.equal(ra.querySelectorAll('style').length, 2);
  assert.equal(rb.querySelector('style[data-k-style="skin"]')!.textContent, '/*skin-1*/');
  assert.equal(ra.querySelector('style[data-k-style="ds"]')!.textContent, '/*ds*/');
  offA();
  assert.equal(ra.querySelectorAll('style').length, 0);
  assert.equal(hub.size, 1);
});
