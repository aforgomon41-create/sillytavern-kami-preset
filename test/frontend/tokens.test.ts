import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditScheme, pairRules, resolveScheme, toCssDeclarations, type Mode } from '../../src/frontend/skin-engine/tokens';
import { contrast } from '../../src/frontend/skin-engine/color';
import { randomHex, rng } from './util';

test('任意种子 × 明暗两档：所有配对都达标（400 组随机种子）', () => {
  const r = rng(42);
  for (let i = 0; i < 200; i++) {
    for (const mode of ['dark', 'light'] as Mode[]) {
      const seeds = { neutral: randomHex(r), accent: randomHex(r) };
      const s = resolveScheme({ mode, seeds });
      assert.deepEqual(auditScheme(s), [], mode + ' ' + JSON.stringify(seeds));
    }
  }
});

test('高对比档：正文 7:1 也都达标（100 组随机种子）', () => {
  const r = rng(9);
  for (let i = 0; i < 50; i++) {
    for (const mode of ['dark', 'light'] as Mode[]) {
      const seeds = { neutral: randomHex(r), accent: randomHex(r), contrast: 'high' as const };
      const s = resolveScheme({ mode, seeds });
      assert.deepEqual(auditScheme(s, 'high'), [], mode + ' ' + JSON.stringify(seeds));
    }
  }
});

test('选得好的种子：引擎推导完全不需要校正', () => {
  const dark = resolveScheme({ mode: 'dark', seeds: { neutral: '#1e2126', accent: '#7aa2f7' } });
  const light = resolveScheme({ mode: 'light', seeds: { neutral: '#f4f1ea', accent: '#2f5bd3' } });
  assert.deepEqual(dark.corrections, []);
  assert.deepEqual(light.corrections, []);
});

test('L2 覆盖了不达标的前景：被校正并记录', () => {
  const s = resolveScheme({ mode: 'dark', seeds: { neutral: '#1e2126', accent: '#7aa2f7' }, tokens: { 'on-surface-1': '#2a2a2a' } });
  const c = s.corrections.find((x) => x.token === 'on-surface-1');
  assert.ok(c, '应记录一条 on-surface-1 的校正');
  assert.ok(c.before < 4.5 && c.after >= 4.5);
  assert.deepEqual(auditScheme(s), []);
});

test('L2 覆盖了背景：引擎推导的前景按新背景重新解，不算校正', () => {
  const s = resolveScheme({ mode: 'dark', seeds: { neutral: '#1e2126', accent: '#7aa2f7' }, tokens: { 'surface-1': '#f0f0f0' } });
  assert.equal(s.tokens['surface-1'], '#f0f0f0');
  assert.ok(contrast(s.tokens['on-surface-1'] as string, '#f0f0f0') >= 4.5);
  assert.equal(s.corrections.filter((x) => x.token.startsWith('on-surface-1')).length, 0);
  assert.deepEqual(auditScheme(s), []);
});

test('种子强调色很浅（白底上的浅黄）：不强改品牌色，强调底上的字与链接仍可读', () => {
  const s = resolveScheme({ mode: 'light', seeds: { neutral: '#f7f7f7', accent: '#fff3a0' } });
  assert.equal(s.tokens['accent'], '#fff3a0');
  assert.deepEqual(s.corrections, []);
  assert.ok(contrast(s.tokens['on-accent'] as string, '#fff3a0') >= 4.5);
  assert.ok(contrast(s.tokens['link-surface-1'] as string, s.tokens['surface-1'] as string) >= 4.5);
  assert.deepEqual(auditScheme(s), []);
});

test('高对比档遇上中等明度的强调色：调整强调色本身并记录校正', () => {
  const s = resolveScheme({ mode: 'light', seeds: { neutral: '#f7f7f7', accent: '#0d9708', contrast: 'high' } });
  assert.ok(s.corrections.some((x) => x.token === 'accent'), JSON.stringify(s.corrections));
  assert.deepEqual(auditScheme(s, 'high'), []);
});

test('深色主题里把一个表面改成浅色：该表面上的链接与焦点环单独解出', () => {
  const s = resolveScheme({ mode: 'dark', seeds: { neutral: '#1e2126', accent: '#7aa2f7' }, tokens: { 'surface-2': '#f2efe6' } });
  assert.ok(contrast(s.tokens['link-surface-2'] as string, '#f2efe6') >= 4.5);
  assert.ok(contrast(s.tokens['link-bg'] as string, s.tokens['bg'] as string) >= 4.5);
  assert.deepEqual(auditScheme(s), []);
});

test('未知令牌名会抛错', () => {
  assert.throws(() => resolveScheme({ mode: 'dark', seeds: { neutral: '#111111', accent: '#ff0000' }, tokens: { 'no-such': '#000000' } }));
});

test('每条配对的前景与背景都是引擎会产出的令牌', () => {
  const s = resolveScheme({ mode: 'dark', seeds: { neutral: '#222222', accent: '#55aaff' } });
  for (const [fg, bg] of pairRules()) {
    assert.ok(fg in s.tokens, '缺前景 ' + fg);
    assert.ok(bg in s.tokens, '缺背景 ' + bg);
  }
});

test('CSS 声明输出', () => {
  assert.equal(toCssDeclarations({ bg: '#000000', 'on-bg': '#ffffff' }), '--k-bg: #000000;\n--k-on-bg: #ffffff;');
});
