/**
 * 色彩基础：sRGB ⇄ OKLab ⇄ OKLCH、色域映射、WCAG 相对亮度与对比度。
 * ------------------------------------------------------------------
 * 皮肤引擎在 OKLCH 里推导与校正颜色（明度 L 与人眼感知接近线性，调明度不跑色相），
 * 输出时映射回 sRGB 十六进制。对比度一律按 WCAG 2.x 公式计算。
 * OKLab 公式：Björn Ottosson, https://bottosson.github.io/posts/oklab/
 */

/** sRGB，各分量 0..1 */
export interface Rgb { r: number; g: number; b: number }
/** OKLCH：L 0..1，C ≥ 0，H 角度 0..360 */
export interface Oklch { l: number; c: number; h: number }

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 解析 #rgb / #rrggbb（大小写均可）；不认识的格式抛错 */
export function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) { throw new Error('不是合法的十六进制颜色：' + hex); }
  let h = m[1];
  if (h.length === 3) { h = h.split('').map((ch) => ch + ch).join(''); }
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function toHex(c: Rgb): string {
  const to = (x: number): string => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
  return '#' + to(c.r) + to(c.g) + to(c.b);
}

const toLinear = (x: number): number => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const toGamma = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export function rgbToOklch(c: Rgb): Oklch {
  const r = toLinear(c.r), g = toLinear(c.g), b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) { H += 360; }
  return { l: L, c: C, h: C < 1e-6 ? 0 : H };
}

/** OKLCH → 线性 sRGB（可能超出 0..1，即超出色域） */
function oklchToLinear(c: Oklch): [number, number, number] {
  const hr = (c.h * Math.PI) / 180;
  const A = c.c * Math.cos(hr), B = c.c * Math.sin(hr);
  const l = Math.pow(c.l + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(c.l - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(c.l - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}

export function inGamut(c: Oklch): boolean {
  const eps = 1e-4;
  return oklchToLinear(c).every((x) => x >= -eps && x <= 1 + eps);
}

/** 色域映射：保持 L 与 H，二分降低 C 直到落进 sRGB */
export function gamutMap(c: Oklch): Oklch {
  const l = clamp01(c.l);
  if (l <= 0) { return { l: 0, c: 0, h: c.h }; }
  if (l >= 1) { return { l: 1, c: 0, h: c.h }; }
  if (inGamut({ l, c: c.c, h: c.h })) { return { l, c: c.c, h: c.h }; }
  let lo = 0, hi = c.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l, c: mid, h: c.h })) { lo = mid; } else { hi = mid; }
  }
  return { l, c: lo, h: c.h };
}

export function oklchToRgb(c: Oklch): Rgb {
  const [r, g, b] = oklchToLinear(gamutMap(c));
  return { r: clamp01(toGamma(r)), g: clamp01(toGamma(g)), b: clamp01(toGamma(b)) };
}

export const hexToOklch = (hex: string): Oklch => rgbToOklch(parseHex(hex));
export const oklchToHex = (c: Oklch): string => toHex(oklchToRgb(c));

/** WCAG 2.x 相对亮度 */
export function luminance(c: Rgb): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG 2.x 对比度（1..21），参数为十六进制颜色 */
export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a)), lb = luminance(parseHex(b));
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
