import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast, gamutMap, hexToOklch, inGamut, oklchToHex, parseHex, toHex } from '../../src/frontend/skin-engine/color';
import { rng } from './util';

test('WCAG 对比度：已知值', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.48) < 0.01);
  assert.equal(contrast('#123456', '#123456'), 1);
  assert.equal(contrast('#fff', '#000'), contrast('#000000', '#ffffff'));
});

test('OKLCH：#ff0000 的已知坐标', () => {
  const c = hexToOklch('#ff0000');
  assert.ok(Math.abs(c.l - 0.628) < 0.002, 'L=' + c.l);
  assert.ok(Math.abs(c.c - 0.2577) < 0.002, 'C=' + c.c);
  assert.ok(Math.abs(c.h - 29.23) < 0.1, 'H=' + c.h);
});

test('十六进制 ⇄ OKLCH 往返误差不超过 1/255', () => {
  const r = rng(7);
  for (let i = 0; i < 500; i++) {
    const hex = toHex({ r: r(), g: r(), b: r() });
    const back = parseHex(oklchToHex(hexToOklch(hex))), orig = parseHex(hex);
    for (const k of ['r', 'g', 'b'] as const) { assert.ok(Math.abs(back[k] - orig[k]) <= 1 / 255 + 1e-9, hex); }
  }
});

test('色域映射：保持明度与色相、结果在 sRGB 内', () => {
  const m = gamutMap({ l: 0.7, c: 0.4, h: 140 });
  assert.ok(inGamut(m));
  assert.equal(m.l, 0.7);
  assert.equal(m.h, 140);
  assert.ok(m.c < 0.4);
});

test('非法颜色会抛错', () => {
  assert.throws(() => parseHex('red'));
  assert.throws(() => parseHex('#12345'));
});
