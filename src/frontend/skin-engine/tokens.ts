/**
 * 令牌引擎：种子 → 成对的语义令牌，并强制对比度（前端契约第 5 节）。
 * ------------------------------------------------------------------
 * 配对规则：每个背景令牌都有配套的前景令牌，组件只能把背景和它自己的前景放在一起用。
 * 引擎保证所有配对达到门槛：
 *   · 引擎自己推导的颜色：直接解出满足门槛的值（不算「校正」）；
 *   · 皮肤明确给出的颜色（种子原样使用的值、L2 令牌覆盖）：不达标就只调明度，并记一条「校正」。
 *     内置皮肤不允许出现任何校正（构建时检查），运行时校正是给用户调参与将来的用户皮肤兜底。
 */
import { contrast, hexToOklch, luminance, oklchToHex, parseHex, type Oklch } from './color';

export type Mode = 'light' | 'dark';
export type ContrastLevel = 'standard' | 'high';
export type StatusKind = 'danger' | 'warning' | 'success' | 'info';

export interface Seeds {
  /** 表面的基调色（决定底色的色相与饱和度） */
  neutral: string;
  /** 主强调色（原样用作 --k-accent） */
  accent: string;
  danger?: string;
  warning?: string;
  success?: string;
  info?: string;
  contrast?: ContrastLevel;
}

export interface SchemeInput {
  mode: Mode;
  seeds: Seeds;
  /** L2：直接指定某些颜色令牌（不带 --k- 前缀），例如 { "surface-1": "#202020" } */
  tokens?: Record<string, string>;
}

export interface Correction {
  token: string;
  against: string;
  from: string;
  to: string;
  required: number;
  before: number;
  after: number;
}

export interface ResolvedScheme {
  mode: Mode;
  /** 令牌名（不带 --k- 前缀）→ 值 */
  tokens: Record<string, string>;
  corrections: Correction[];
}

/** 表面：每个都有 on-/on-*-muted/on-*-subtle/border-/divider- 配套 */
export const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3', 'sunken', 'inverse'] as const;
export const STATUS: readonly StatusKind[] = ['danger', 'warning', 'success', 'info'];

type Need = 'text' | 'subtle' | 'ui' | 'divider';
/** 配对：[前景, 背景, 门槛类别] */
export type Pair = readonly [string, string, Need];

/** 全部配对规则：组件只允许按这里列出的组合使用颜色 */
export function pairRules(): Pair[] {
  const pairs: Pair[] = [];
  for (const s of SURFACES) {
    pairs.push(['on-' + s, s, 'text'], ['on-' + s + '-muted', s, 'text'], ['on-' + s + '-subtle', s, 'subtle'],
      ['border-' + s, s, 'ui'], ['divider-' + s, s, 'divider']);
  }
  for (const st of ['control', 'control-hover', 'control-active']) { pairs.push(['on-control', st, 'text'], ['border-control', st, 'ui']); }
  for (const st of ['accent', 'accent-hover', 'accent-active']) { pairs.push(['on-accent', st, 'text']); }
  pairs.push(['on-accent-soft', 'accent-soft', 'text'], ['on-selected', 'selected', 'text']);
  for (const k of STATUS) { pairs.push(['on-' + k, k, 'text'], ['on-' + k + '-soft', k + '-soft', 'text']); }
  /* 链接与焦点环：每个表面各有一份（表面上下文），组件按所在表面取用；
     一个全局颜色无法同时在深底与浅底上都清楚（例如深色主题里的浅色卡片） */
  for (const s of SURFACES) { pairs.push(['link-' + s, s, 'text'], ['focus-ring-' + s, s, 'ui']); }
  return pairs;
}

function threshold(need: Need, level: ContrastLevel): number {
  if (need === 'text') { return level === 'high' ? 7 : 4.5; }
  if (need === 'subtle') { return level === 'high' ? 4.5 : 3; }
  if (need === 'ui') { return 3; }
  return 1.35; /* 分隔线：只求看得见，不当控件边界用 */
}

/* ───────── 推导参数（OKLCH 明度） ───────── */

const PLAN = {
  dark: {
    bg: 0.19, 'surface-1': 0.225, 'surface-2': 0.26, 'surface-3': 0.295, sunken: 0.16, inverse: 0.94,
    control: 0.31, controlStep: 0.04, fg: 0.95, muted: 0.8, subtle: 0.66, border: 0.55, divider: 0.32,
    soft: 0.3, selected: 0.34, onSoft: 0.86, status: 0.7, statusSoft: 0.28
  },
  light: {
    bg: 0.97, 'surface-1': 0.995, 'surface-2': 0.955, 'surface-3': 0.93, sunken: 0.94, inverse: 0.25,
    control: 0.93, controlStep: -0.035, fg: 0.22, muted: 0.42, subtle: 0.56, border: 0.6, divider: 0.88,
    soft: 0.93, selected: 0.89, onSoft: 0.38, status: 0.55, statusSoft: 0.95
  }
} as const;

const STATUS_HUE: Record<StatusKind, number> = { danger: 25, warning: 75, success: 150, info: 245 };
const SURFACE_MAX_C = 0.12;
const TEXT_MAX_C = 0.03;

const withL = (c: Oklch, l: number, cMax?: number): Oklch => ({ l, c: cMax === undefined ? c.c : Math.min(c.c, cMax), h: c.h });

/**
 * 解出满足门槛的前景：从目标颜色出发，只改明度，朝能拉开对比度的方向找「改动最小」的明度。
 * 同时要对一组背景都达标（例如 on-control 对 control / hover / active）。
 */
export function solveForeground(target: Oklch, backgrounds: string[], min: number): string {
  const ok = (hex: string): boolean => backgrounds.every((b) => contrast(hex, b) >= min - 1e-9);
  const start = oklchToHex(target);
  if (ok(start)) { return start; }
  /* 背景整体偏亮就往暗处找，偏暗就往亮处找；一个方向不行再试另一个 */
  const avgLum = backgrounds.reduce((s, b) => s + luminance(parseHex(b)), 0) / backgrounds.length;
  const dirs: Array<0 | 1> = avgLum > 0.18 ? [0, 1] : [1, 0];
  for (const end of dirs) {
    const farHex = oklchToHex(withL(target, end));
    if (!ok(farHex)) { continue; }
    let near = target.l, far: number = end;
    for (let i = 0; i < 30; i++) {
      const mid = (near + far) / 2;
      if (ok(oklchToHex(withL(target, mid)))) { far = mid; } else { near = mid; }
    }
    return oklchToHex(withL(target, far));
  }
  /* 彩色无论怎么调明度都不够：退到纯黑或纯白里更好的那个 */
  const worst = (hex: string): number => Math.min(...backgrounds.map((b) => contrast(hex, b)));
  return worst('#000000') >= worst('#ffffff') ? '#000000' : '#ffffff';
}

/** 由种子推导全部颜色令牌（尚未应用 L2 覆盖） */
function derive(mode: Mode, seeds: Seeds, level: ContrastLevel): { tokens: Record<string, string>; fromSkin: Set<string> } {
  const P = PLAN[mode];
  const n = hexToOklch(seeds.neutral);
  const a = hexToOklch(seeds.accent);
  const t: Record<string, string> = {};
  const fromSkin = new Set<string>();
  const text = threshold('text', level), subtle = threshold('subtle', level), ui = threshold('ui', level);

  for (const s of SURFACES) { t[s] = oklchToHex(withL(n, P[s], SURFACE_MAX_C)); }
  const ctlStep = P.controlStep;
  t['control'] = oklchToHex(withL(n, P.control, SURFACE_MAX_C));
  t['control-hover'] = oklchToHex(withL(n, P.control + ctlStep, SURFACE_MAX_C));
  t['control-active'] = oklchToHex(withL(n, P.control + 2 * ctlStep, SURFACE_MAX_C));

  /* 前景：表面上的文字带一点基调色，反色表面用另一档的明度 */
  for (const s of SURFACES) {
    const inv = s === 'inverse';
    const fgL = inv ? PLAN[mode === 'dark' ? 'light' : 'dark'].fg : P.fg;
    const mutedL = inv ? PLAN[mode === 'dark' ? 'light' : 'dark'].muted : P.muted;
    const subtleL = inv ? PLAN[mode === 'dark' ? 'light' : 'dark'].subtle : P.subtle;
    const borderL = inv ? PLAN[mode === 'dark' ? 'light' : 'dark'].border : P.border;
    const dividerL = inv ? PLAN[mode === 'dark' ? 'light' : 'dark'].divider : P.divider;
    const bg = t[s] as string;
    t['on-' + s] = solveForeground(withL(n, fgL, TEXT_MAX_C), [bg], text);
    t['on-' + s + '-muted'] = solveForeground(withL(n, mutedL, TEXT_MAX_C), [bg], text);
    t['on-' + s + '-subtle'] = solveForeground(withL(n, subtleL, TEXT_MAX_C), [bg], subtle);
    t['border-' + s] = solveForeground(withL(n, borderL, TEXT_MAX_C), [bg], ui);
    t['divider-' + s] = solveForeground(withL(n, dividerL, TEXT_MAX_C), [bg], threshold('divider', level));
  }
  const ctlBgs = [t['control'], t['control-hover'], t['control-active']] as string[];
  t['on-control'] = solveForeground(withL(n, P.fg, TEXT_MAX_C), ctlBgs, text);
  t['border-control'] = solveForeground(withL(n, P.border, TEXT_MAX_C), ctlBgs, ui);

  /* 强调色：种子原样使用（皮肤给的值），悬停 / 按下按明暗方向挪一点明度 */
  t['accent'] = oklchToHex(a);
  fromSkin.add('accent');
  /* 强调底上的字：黑白里谁更清楚就从谁出发（带一点强调色的色相）；
     悬停 / 按下朝「离字更远」的方向挪明度，这样同一个字色在三种状态上都更容易达标 */
  const blackish = { l: 0.16, c: Math.min(a.c, 0.03), h: a.h }, whitish = { l: 0.99, c: Math.min(a.c, 0.02), h: a.h };
  const darkText = contrast(oklchToHex(blackish), t['accent']) >= contrast(oklchToHex(whitish), t['accent']);
  const step = darkText ? 0.05 : -0.05;
  t['accent-hover'] = oklchToHex(withL(a, a.l + step));
  t['accent-active'] = oklchToHex(withL(a, a.l + 2 * step));
  const accBgs = [t['accent'], t['accent-hover'], t['accent-active']] as string[];
  t['on-accent'] = solveForeground(darkText ? blackish : whitish, accBgs, text);
  t['accent-soft'] = oklchToHex(withL(a, P.soft, 0.06));
  t['on-accent-soft'] = solveForeground(withL(a, P.onSoft, 0.14), [t['accent-soft']], text);
  t['selected'] = oklchToHex(withL(a, P.selected, 0.08));
  t['on-selected'] = solveForeground(withL(a, P.onSoft, 0.14), [t['selected']], text);

  /* 链接与焦点环：强调色色相，每个表面各解一份 */
  for (const s of SURFACES) {
    t['link-' + s] = solveForeground(a, [t[s] as string], text);
    t['focus-ring-' + s] = solveForeground(a, [t[s] as string], ui);
  }

  /* 状态色：给了种子就原样用，没给按默认色相推导 */
  for (const k of STATUS) {
    const given = seeds[k];
    const base: Oklch = given ? hexToOklch(given) : { l: P.status, c: 0.15, h: STATUS_HUE[k] };
    t[k] = oklchToHex(base);
    if (given) { fromSkin.add(k); }
    const bk = { l: 0.16, c: Math.min(base.c, 0.03), h: base.h }, wh = { l: 0.99, c: Math.min(base.c, 0.02), h: base.h };
    const better = contrast(oklchToHex(bk), t[k]) >= contrast(oklchToHex(wh), t[k]) ? bk : wh;
    t['on-' + k] = solveForeground(better, [t[k]], text);
    t[k + '-soft'] = oklchToHex(withL(base, P.statusSoft, 0.05));
    t['on-' + k + '-soft'] = solveForeground(withL(base, P.onSoft, 0.14), [t[k + '-soft'] as string], text);
  }

  t['scrim'] = mode === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(15, 20, 30, 0.35)';
  return { tokens: t, fromSkin };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** 解析一个配色方案：推导 → 应用 L2 覆盖 → 逐对强制门槛 */
export function resolveScheme(input: SchemeInput): ResolvedScheme {
  const level: ContrastLevel = input.seeds.contrast || 'standard';
  const { tokens, fromSkin } = derive(input.mode, input.seeds, level);
  const overridden = new Set<string>();
  for (const [k, v] of Object.entries(input.tokens || {})) {
    if (!(k in tokens) || k === 'scrim') { throw new Error('未知的颜色令牌：' + k); }
    tokens[k] = oklchToHex(hexToOklch(v)); /* 规整成 #rrggbb */
    overridden.add(k);
    fromSkin.add(k);
  }
  const corrections: Correction[] = [];
  const rules = pairRules();
  /* 覆盖改了背景时，引擎推导的前景要按新背景重新解（不算校正）；皮肤给的前景不达标则校正并记录 */
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const [fg, bg, need] of rules) {
      const min = threshold(need, level);
      const f = tokens[fg] as string, b = tokens[bg] as string;
      if (!HEX.test(f) || !HEX.test(b)) { continue; }
      const before = contrast(f, b);
      if (before >= min - 1e-9) { continue; }
      /* 同一个前景要对它的所有背景一起达标 */
      const allBgs = rules.filter((r) => r[0] === fg && threshold(r[2], level) >= min).map((r) => tokens[r[1]] as string);
      const fixed = solveForeground(hexToOklch(f), allBgs, min);
      if (contrast(fixed, b) >= min - 1e-9) {
        if (fromSkin.has(fg)) {
          corrections.push({ token: fg, against: bg, from: f, to: fixed, required: min, before: round2(before), after: round2(contrast(fixed, b)) });
        }
        tokens[fg] = fixed;
      } else {
        /* 前景调到黑白都不够（例如 7:1 档遇上中等明度的强调色）：前景用最好的那个，再把背景往远离前景的方向调 */
        tokens[fg] = fixed;
        const newBg = solveForeground(hexToOklch(b), [fixed], min);
        if (fromSkin.has(bg)) {
          corrections.push({ token: bg, against: fg, from: b, to: newBg, required: min, before: round2(before), after: round2(contrast(fixed, newBg)) });
        }
        tokens[bg] = newBg;
      }
      changed = true;
    }
    if (!changed) { break; }
  }
  return { mode: input.mode, tokens, corrections };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** 核对一个已解析的方案是否所有配对达标（测试与构建检查用） */
export function auditScheme(s: ResolvedScheme, level: ContrastLevel = 'standard'): Array<{ fg: string; bg: string; ratio: number; required: number }> {
  const out: Array<{ fg: string; bg: string; ratio: number; required: number }> = [];
  for (const [fg, bg, need] of pairRules()) {
    const f = s.tokens[fg], b = s.tokens[bg];
    if (!f || !b || !HEX.test(f) || !HEX.test(b)) { continue; }
    const r = contrast(f, b), min = threshold(need, level);
    if (r < min - 1e-9) { out.push({ fg, bg, ratio: round2(r), required: min }); }
  }
  return out;
}

/** 生成 CSS 声明块内容：`--k-bg: #...;` */
export function toCssDeclarations(tokens: Record<string, string>): string {
  return Object.keys(tokens).map((k) => '--k-' + k + ': ' + tokens[k] + ';').join('\n');
}
