import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SkinManager, sanitizeStored, type StoredSettings } from '../../src/frontend/skin-engine/manager';
import type { SkinManifest } from '../../src/frontend/skin-engine/package';

const mk = (id: string, extra: Partial<SkinManifest> = {}): SkinManifest => ({
  id, name: id, version: '1', contract: '1.0', defaultScheme: 'dark',
  schemes: { dark: { seeds: { neutral: '#1e2126', accent: '#7aa2f7' } }, light: { seeds: { neutral: '#f4f1ea', accent: '#2f5bd3' } } }, ...extra
});
function setup(stored: unknown = null) {
  let saved: StoredSettings | null = null;
  const applied: Array<{ id: string; s: unknown }> = [];
  const m = new SkinManager({ load: () => stored, save: (s) => { saved = JSON.parse(JSON.stringify(s)); } },
    { applySkin: (mf, s) => { applied.push({ id: mf.id, s }); return null; } },
    [{ manifest: mk('alpha', { effects: [{ id: 'grain', name: '颗粒', default: true }] }) }, { manifest: mk('beta') }]);
  return { m, applied, saved: () => saved };
}

test('坏数据被清洗：未知皮肤落到第一个、字号缩放裁剪、坏字段回落', () => {
  const s = sanitizeStored({ skin: 7, global: { density: 'huge', motion: 'off', fontScale: 9 }, perSkin: { a: { scheme: 'Neon Bad!', effects: ['x', 3] } } }, 'alpha');
  assert.equal(s.skin, 'alpha'); assert.equal(s.global.density, 'cozy'); assert.equal(s.global.motion, 'off'); assert.equal(s.global.fontScale, 1.4);
  assert.deepEqual(s.perSkin['a'], { effects: ['x'] });
  const { m } = setup({ skin: 'grokbot' });   /* 旧系统的皮肤 id */
  assert.equal(m.current.manifest.id, 'alpha');
});

test('设置按皮肤分别保存：切回来恢复自己的明暗与特效', () => {
  const { m, applied, saved } = setup();
  m.apply();
  m.setScheme('light'); m.setEffect('grain', false);
  m.select('beta');
  assert.equal(applied.at(-1)!.id, 'beta');
  assert.equal((applied.at(-1)!.s as { scheme: string }).scheme, 'auto');
  m.select('alpha');
  const s = applied.at(-1)!.s as { scheme: string; effects: string[] };
  assert.equal(s.scheme, 'light'); assert.deepEqual(s.effects, []);
  assert.equal(saved()!.skin, 'alpha');
});

test('全局设置作用于所有皮肤；不认识的特效不会存进去', () => {
  const { m, applied } = setup();
  m.setGlobal({ density: 'compact', fontScale: 1.2 });
  m.setEffect('nope', true);
  m.select('beta');
  const s = applied.at(-1)!.s as { density: string; fontScale: number };
  assert.equal(s.density, 'compact'); assert.equal(s.fontScale, 1.2);
  assert.deepEqual(m.settings.perSkin['alpha']!.effects, ['grain']);
});

test('重置当前皮肤：清掉它自己的设置', () => {
  const { m } = setup();
  m.setParam('x', 1); m.resetSkin();
  assert.equal(m.settings.perSkin['alpha'], undefined);
});

test('撤销恢复默认：整组写回，坏字段被清洗', () => {
  const { m } = setup();
  m.setScheme('light'); m.setParam('x', 3);
  const before = JSON.parse(JSON.stringify(m.settings.perSkin['alpha']));
  m.resetSkin();
  m.restoreSkin('alpha', { ...before, scheme: 'Bad Scheme!' });
  assert.deepEqual(m.settings.perSkin['alpha'], { params: { x: 3 } });
  m.restoreSkin('alpha', undefined);
  assert.equal(m.settings.perSkin['alpha'], undefined);
});

test('清单不合法的皮肤登记时报错', () => {
  const { m } = setup();
  assert.throws(() => m.register({ manifest: { ...mk('gamma'), contract: '9' } }));
});
