/**
 * 皮肤包清单（skin.json）的类型与校验。前端契约第 6 节。
 * 校验只看结构与取值范围；颜色是否达标由令牌引擎负责，CSS 是否合规由 lint-css 负责。
 */
import type { ContrastLevel, Mode, Seeds } from './tokens';
import type { Elevation, FontStacks } from './scales';

export interface SchemeDef {
  seeds: Seeds & { radius?: number; font?: FontStacks; elevation?: Elevation; contrast?: ContrastLevel };
  /** L2：直接指定语义令牌（不带 --k- 前缀） */
  tokens?: Record<string, string>;
  /** L2：按对改组件配色，例如 { button: { tone: 'accent-soft' } } */
  components?: Record<string, { tone: string }>;
}

export interface EffectDef { id: string; name: string; description?: string; group?: string; default: boolean }

export type ParamDef =
  | { id: string; name: string; type: 'color'; default: string; bind: string; group?: string }
  | { id: string; name: string; type: 'number'; default: number; min: number; max: number; step?: number; unit?: string; bind: string; group?: string }
  | { id: string; name: string; type: 'enum'; default: string; options: Array<{ value: string; name: string }>; bind: string; group?: string };

/** 素材：file 是包内文件（必需，也是外链失效时的兜底）；url 是可选的 https 外链，平台先试外链，失败或超时就用 file */
export interface AssetDef { file: string; url?: string; alt?: string }

/** 外链字体（前端契约 6.6）：平台在酒馆主页面注册（Shadow DOM 里的 @font-face 不生效），带超时；
    失败时字体栈里后面的系统字体自动接替，所以字体栈必须以通用字体族结尾 */
export interface FontDef {
  family: string;
  /** https 地址（woff2 / woff），可给多个，按顺序尝试 */
  src: string[];
  weight?: string;
  style?: 'normal' | 'italic';
  /** 只覆盖某些字符（CJK 大字体分片时用） */
  unicodeRange?: string;
}

export interface SkinManifest {
  id: string;
  name: string;
  version: string;
  contract: string;
  description?: string;
  author?: string;
  credits?: string;
  schemes: Partial<Record<Mode, SchemeDef>>;
  defaultScheme: Mode;
  effects?: EffectDef[];
  params?: ParamDef[];
  assets?: Record<string, AssetDef>;
  ornaments?: string[];
  /** 外链字体（6.6） */
  fonts?: FontDef[];
  /** 启用的平台动效模块（前端契约 6.5），例如 ["fracture"] */
  modules?: string[];
  flavor?: Record<string, string>;
}

export const CONTRACT_MAJOR = 1;
/** 平台提供的动效模块 */
export const MODULES = ['fracture'] as const;
const ID = /^[a-z][a-z0-9-]{1,31}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** 参数可以绑定：种子（seed:accent）、语义令牌（token:surface-1）、皮肤自己的变量（var:--k-skin-xxx） */
const HTTPS = /^https:\/\/[^\s"'()]+$/i;
/** 字体栈必须以通用字体族结尾：外链失败时有系统字体接替 */
const GENERIC_END = /(^|,)\s*(serif|sans-serif|monospace|system-ui|ui-serif|ui-sans-serif|ui-monospace|cursive|fantasy)\s*$/i;
const BIND = /^(seed:(neutral|accent|danger|warning|success|info|radius)|token:[a-z0-9-]+|var:--k-skin-[a-z0-9-]+)$/;

/** 校验清单；返回错误列表（空数组 = 通过） */
export function validateManifest(m: unknown): string[] {
  const e: string[] = [];
  const o = m as Partial<SkinManifest> | null;
  if (!o || typeof o !== 'object') { return ['清单不是对象']; }
  if (!o.id || !ID.test(o.id)) { e.push('id 必须是小写字母开头的 2~32 位字母、数字、连字符'); }
  if (!o.name) { e.push('缺 name'); }
  if (!o.version) { e.push('缺 version'); }
  if (!o.contract || Number(String(o.contract).split('.')[0]) !== CONTRACT_MAJOR) { e.push('contract 必须是 ' + CONTRACT_MAJOR + '.x'); }
  const schemes = o.schemes || {};
  const modes = Object.keys(schemes) as Mode[];
  if (!modes.length) { e.push('schemes 至少要有 light 或 dark 之一'); }
  for (const mode of modes) {
    if (mode !== 'light' && mode !== 'dark') { e.push('未知配色方案：' + mode); continue; }
    const sc = schemes[mode] as SchemeDef;
    const seeds = sc && sc.seeds;
    if (!seeds) { e.push(mode + '：缺 seeds'); continue; }
    for (const k of ['neutral', 'accent'] as const) { if (!seeds[k] || !HEX.test(seeds[k])) { e.push(mode + '.seeds.' + k + ' 必须是十六进制颜色'); } }
    for (const k of ['danger', 'warning', 'success', 'info'] as const) { if (seeds[k] !== undefined && !HEX.test(seeds[k] as string)) { e.push(mode + '.seeds.' + k + ' 必须是十六进制颜色'); } }
    if (seeds.radius !== undefined && !(seeds.radius >= 0 && seeds.radius <= 32)) { e.push(mode + '.seeds.radius 必须在 0~32'); }
    if (seeds.elevation !== undefined && !['flat', 'shadow', 'glow', 'outline'].includes(seeds.elevation)) { e.push(mode + '.seeds.elevation 取值不对'); }
    if (seeds.contrast !== undefined && !['standard', 'high'].includes(seeds.contrast)) { e.push(mode + '.seeds.contrast 取值不对'); }
    for (const [fk, stack] of Object.entries(seeds.font || {})) {
      if (typeof stack !== 'string' || !GENERIC_END.test(stack)) { e.push(mode + '.seeds.font.' + fk + ' 必须以通用字体族结尾（如 serif / sans-serif），外链字体失效时由它兜底'); }
    }
    for (const [k, v] of Object.entries(sc.tokens || {})) { if (!HEX.test(v)) { e.push(mode + '.tokens.' + k + ' 必须是十六进制颜色'); } }
  }
  if (!o.defaultScheme || !modes.includes(o.defaultScheme)) { e.push('defaultScheme 必须是已提供的配色方案之一'); }
  const ids = new Set<string>();
  for (const f of o.effects || []) {
    if (!f.id || !ID.test(f.id)) { e.push('特效 id 不合法：' + f.id); }
    if (ids.has(f.id)) { e.push('特效 / 参数 id 重复：' + f.id); }
    ids.add(f.id);
    if (!f.name) { e.push('特效 ' + f.id + ' 缺 name'); }
  }
  for (const p of o.params || []) {
    if (!p.id || !ID.test(p.id)) { e.push('参数 id 不合法：' + p.id); }
    if (ids.has(p.id)) { e.push('特效 / 参数 id 重复：' + p.id); }
    ids.add(p.id);
    if (!BIND.test(p.bind || '')) { e.push('参数 ' + p.id + ' 的 bind 不合法：' + p.bind); }
    if (p.type === 'color' && !HEX.test(p.default)) { e.push('参数 ' + p.id + ' 的默认值必须是十六进制颜色'); }
    if (p.type === 'number' && !(p.min <= p.default && p.default <= p.max)) { e.push('参数 ' + p.id + ' 的默认值不在范围内'); }
    if (p.type === 'enum' && !(p.options || []).some((x) => x.value === p.default)) { e.push('参数 ' + p.id + ' 的默认值不在选项里'); }
  }
  for (const [k, a] of Object.entries(o.assets || {})) {
    if (!ID.test(k)) { e.push('素材名不合法：' + k); }
    if (!a || !/^assets\/[\w.-]+\.(png|webp)$/i.test(a.file)) { e.push('素材 ' + k + ' 必须有 assets/ 下的 png / webp（外链失效时的兜底）'); }
    if (a && a.url !== undefined && !HTTPS.test(a.url)) { e.push('素材 ' + k + ' 的外链必须是 https 地址'); }
  }
  for (const f of o.fonts || []) {
    if (!f || !f.family || /["'\\;{}]/.test(f.family)) { e.push('外链字体的 family 不合法：' + (f && f.family)); }
    if (!f || !Array.isArray(f.src) || !f.src.length || !f.src.every((u) => HTTPS.test(u))) { e.push('外链字体 ' + (f && f.family) + ' 的 src 必须是一个或多个 https 地址'); }
    if (f && f.unicodeRange !== undefined && !/^[U+0-9A-F?,\s-]+$/i.test(f.unicodeRange)) { e.push('外链字体 ' + f.family + ' 的 unicodeRange 不合法'); }
  }
  for (const mod of o.modules || []) { if (!(MODULES as readonly string[]).includes(mod)) { e.push('未知的动效模块：' + mod); } }
  return e;
}
