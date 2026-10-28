import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centered, clampRect, isSheet, sheetShouldClose, SHEET_BREAKPOINT } from '../../src/frontend/ds/geometry';

const min = { w: 320, h: 240 };
test('断点与酒馆单栏一致', () => { assert.equal(SHEET_BREAKPOINT, 1000); assert.ok(isSheet(1000)); assert.ok(!isSheet(1001)); });
test('拖出视口会被夹回来，标题栏始终可见', () => {
  assert.deepEqual(clampRect({ x: -500, y: -80, w: 600, h: 400 }, { w: 1440, h: 900 }, min), { x: 8, y: 8, w: 600, h: 400 });
  assert.deepEqual(clampRect({ x: 2000, y: 2000, w: 600, h: 400 }, { w: 1440, h: 900 }, min), { x: 832, y: 492, w: 600, h: 400 });
});
test('尺寸不小于最小值、不大于视口', () => {
  assert.deepEqual(clampRect({ x: 0, y: 0, w: 100, h: 50 }, { w: 1440, h: 900 }, min), { x: 8, y: 8, w: 320, h: 240 });
  assert.deepEqual(clampRect({ x: 0, y: 0, w: 5000, h: 5000 }, { w: 1100, h: 700 }, min), { x: 8, y: 8, w: 1084, h: 684 });
});
test('视口变小：面板收回可见范围', () => {
  const r = clampRect({ x: 900, y: 500, w: 720, h: 640 }, { w: 1100, h: 700 }, min);
  assert.ok(r.x + r.w <= 1100 - 8 && r.y + r.h <= 700 - 8);
});
test('初始居中', () => { assert.deepEqual(centered({ w: 720, h: 640 }, { w: 1440, h: 900 }, min), { x: 360, y: 130, w: 720, h: 640 }); });
test('抽屉下拉关闭：拖过四分之一或快速下甩', () => {
  assert.ok(sheetShouldClose(200, 700, 0.1));
  assert.ok(!sheetShouldClose(100, 700, 0.1));
  assert.ok(sheetShouldClose(40, 700, 1.2));
  assert.ok(!sheetShouldClose(10, 700, 2));
});
