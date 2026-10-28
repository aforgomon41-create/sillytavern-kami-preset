/**
 * 非颜色令牌：圆角、间距（随密度）、字号（随用户缩放）、动效（随动效设置）、层次（阴影 / 辉光 / 描边）。
 * 前端契约 5.7、5.8。
 */
import { hexToOklch, oklchToHex } from './color';
import type { Mode } from './tokens';

export type Density = 'compact' | 'cozy' | 'roomy';
export type Motion = 'full' | 'calm' | 'off';
export type Elevation = 'flat' | 'shadow' | 'glow' | 'outline';

export interface FontStacks { body?: string; heading?: string; mono?: string }

export interface ScaleInput {
  mode: Mode;
  radius?: number;          /* 圆角基准（px），默认 8 */
  font?: FontStacks;
  elevation?: Elevation;
  accent: string;           /* 辉光用 */
  density: Density;
  motion: Motion;
  fontScale: number;        /* 用户字号缩放，0.8 ~ 1.4 */
}

export const SYSTEM_FONTS = {
  body: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  heading: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'
};

const SPACE_UNIT: Record<Density, number> = { compact: 3, cozy: 4, roomy: 5 };
const CONTROL_H: Record<Density, number> = { compact: 30, cozy: 34, roomy: 40 };
const SPACE_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const FONT_STEPS: Record<string, number> = { xs: 0.75, sm: 0.875, md: 1, lg: 1.143, xl: 1.286, '2xl': 1.571 };

const px = (n: number): string => (Math.round(n * 100) / 100) + 'px';
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function resolveScales(s: ScaleInput): Record<string, string> {
  const t: Record<string, string> = {};
  const r = clamp(s.radius ?? 8, 0, 32);
  t['r-xs'] = px(r * 0.5); t['r-sm'] = px(r * 0.75); t['r-md'] = px(r); t['r-lg'] = px(r * 1.5); t['r-xl'] = px(r * 2); t['r-pill'] = '999px';

  const u = SPACE_UNIT[s.density];
  SPACE_STEPS.forEach((m, i) => { t['space-' + (i + 1)] = px(u * m); });
  t['control-h'] = px(CONTROL_H[s.density]);

  const scale = clamp(s.fontScale || 1, 0.8, 1.4);
  t['font-body'] = s.font?.body || SYSTEM_FONTS.body;
  t['font-heading'] = s.font?.heading || s.font?.body || SYSTEM_FONTS.heading;
  t['font-mono'] = s.font?.mono || SYSTEM_FONTS.mono;
  for (const k of Object.keys(FONT_STEPS)) { t['fs-' + k] = px(14 * scale * (FONT_STEPS[k] as number)); }
  t['lh'] = '1.6'; t['lh-tight'] = '1.3';
  t['fw'] = '400'; t['fw-strong'] = '600';
  t['border-w'] = '1px';

  /* 动效：calm 去掉循环与位移、缩短时长；off 一律 0（系统「减少动态效果」在 k.lock 里再兜一层） */
  const dur = s.motion === 'off' ? [0, 0, 0] : s.motion === 'calm' ? [80, 120, 160] : [120, 200, 320];
  t['dur-fast'] = dur[0] + 'ms'; t['dur'] = dur[1] + 'ms'; t['dur-slow'] = dur[2] + 'ms';
  t['ease'] = 'cubic-bezier(.22, .61, .36, 1)'; t['ease-out'] = 'cubic-bezier(.16, 1, .3, 1)';
  t['enter-y'] = s.motion === 'full' ? '4px' : '0px';

  /* 层次 */
  const el = s.elevation || 'shadow';
  const shadowColor = s.mode === 'dark' ? '0, 0, 0' : '15, 20, 30';
  const a = hexToOklch(s.accent);
  const glow = oklchToHex({ l: s.mode === 'dark' ? 0.72 : 0.6, c: Math.min(a.c, 0.18), h: a.h });
  for (const [i, k] of ['1', '2', '3'].entries()) {
    const lvl = i + 1;
    if (el === 'shadow') { t['shadow-' + k] = '0 ' + px(lvl * 2) + ' ' + px(lvl * 8) + ' rgba(' + shadowColor + ', ' + (s.mode === 'dark' ? 0.32 + lvl * 0.06 : 0.08 + lvl * 0.04) + ')'; }
    else if (el === 'glow') { t['shadow-' + k] = '0 0 ' + px(lvl * 6) + ' ' + glow + (lvl === 3 ? '99' : lvl === 2 ? '66' : '40'); }
    else { t['shadow-' + k] = 'none'; }
  }
  t['elev-outline'] = el === 'outline' ? 'var(--k-border-w)' : '0px';
  return t;
}
