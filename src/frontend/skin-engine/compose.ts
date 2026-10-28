/**
 * 样式合成：皮肤清单 + 用户设置 → 令牌层与皮肤层的 CSS、渲染面根上的属性、校正记录。
 * 设计系统自己的 reset / base / components / lock 是一份静态样式表（ds/styles.ts），这里只产出随皮肤变化的部分。
 * 前端契约第 3、5、6、7 节。
 */
import { resolveScheme, toCssDeclarations, type Correction, type Mode, type Seeds } from './tokens';
import { resolveScales, type Density, type Motion } from './scales';
import type { SkinManifest } from './package';

export interface SkinSettings {
  scheme: Mode | 'auto';
  density: Density;
  motion: Motion;
  fontScale: number;
  /** 打开的特效；不给就用清单里的默认值 */
  effects?: string[];
  params?: Record<string, string | number>;
}

export const DEFAULT_SETTINGS: SkinSettings = { scheme: 'auto', density: 'cozy', motion: 'full', fontScale: 1 };

export interface ComposedSkin {
  mode: Mode;
  /** 令牌层 + 皮肤层（含层叠顺序声明之外的部分；顺序声明在设计系统的静态样式表开头） */
  css: string;
  /** 渲染面根上的属性 */
  attrs: Record<string, string>;
  corrections: Correction[];
}

export interface ComposeOptions {
  /** 已通过 lint 的皮肤 CSS（L3） */
  skinCss?: string;
  /** 素材名 → 可用的 URL（data: 或 blob:），由皮肤脚本准备 */
  assetUrls?: Record<string, string>;
  /** 系统是否偏好深色（scheme 为 auto 时用） */
  systemDark?: boolean;
}

function pickMode(m: SkinManifest, s: SkinSettings, systemDark: boolean): Mode {
  const want: Mode = s.scheme === 'auto' ? (systemDark ? 'dark' : 'light') : s.scheme;
  return m.schemes[want] ? want : m.defaultScheme;
}

export function composeSkin(m: SkinManifest, settings: SkinSettings, opts: ComposeOptions = {}): ComposedSkin {
  const mode = pickMode(m, settings, !!opts.systemDark);
  const def = m.schemes[mode];
  if (!def) { throw new Error('皮肤 ' + m.id + ' 没有可用的配色方案'); }
  const seeds: Seeds & { radius?: number } = { ...def.seeds };
  const tokens: Record<string, string> = { ...(def.tokens || {}) };
  const skinVars: Record<string, string> = {};

  /* 参数：按绑定写到种子、语义令牌或皮肤自己的变量上；数值按范围裁剪 */
  for (const p of m.params || []) {
    let v: string | number = settings.params && p.id in settings.params ? (settings.params[p.id] as string | number) : p.default;
    if (p.type === 'number') { v = Math.min(p.max, Math.max(p.min, Number(v))); }
    if (p.type === 'enum' && !p.options.some((o) => o.value === v)) { v = p.default; }
    const [kind, name] = [p.bind.slice(0, p.bind.indexOf(':')), p.bind.slice(p.bind.indexOf(':') + 1)];
    const text = p.type === 'number' ? String(v) + (p.unit || '') : String(v);
    if (kind === 'seed') {
      if (name === 'radius') { seeds.radius = Number(v); } else { (seeds as unknown as Record<string, string>)[name] = String(v); }
    } else if (kind === 'token') { tokens[name] = String(v); } else { skinVars[name] = text; }
  }

  const colors = resolveScheme({ mode, seeds, tokens });
  const scales = resolveScales({
    mode, radius: seeds.radius ?? def.seeds.radius ?? 8, font: def.seeds.font ?? {}, elevation: def.seeds.elevation ?? 'shadow',
    accent: colors.tokens['accent'] as string, density: settings.density, motion: settings.motion, fontScale: settings.fontScale
  });

  /* L2：按对改组件配色 —— 背景与前景一起指过去，组件里永远是成对的 */
  const pairLines: string[] = [];
  for (const [comp, { tone }] of Object.entries(def.components || {})) {
    if (!(tone in colors.tokens) || !(('on-' + tone) in colors.tokens)) { throw new Error('皮肤 ' + m.id + '：组件 ' + comp + ' 的配色对 ' + tone + ' 不存在'); }
    pairLines.push('--k-' + comp + '-bg: var(--k-' + tone + ');', '--k-' + comp + '-fg: var(--k-on-' + tone + ');');
  }

  const assetLines = Object.entries(opts.assetUrls || {}).map(([k, url]) => '--k-asset-' + k + ': url("' + url.replace(/"/g, '%22') + '");');
  const varLines = Object.entries(skinVars).map(([k, v]) => k + ': ' + v + ';');

  const tokenBlock = [toCssDeclarations(colors.tokens), toCssDeclarations(scales), ...pairLines, ...assetLines, ...varLines].join('\n');
  const css = '@layer k.tokens {\n:host, [data-k-surface] {\n' + tokenBlock + '\ncolor-scheme: ' + mode + ';\n}\n}\n' +
    (opts.skinCss ? '@layer k.skin {\n' + opts.skinCss + '\n}\n' : '');

  const effects = settings.effects ?? (m.effects || []).filter((f) => f.default).map((f) => f.id);
  const known = new Set((m.effects || []).map((f) => f.id));
  return {
    mode, css, corrections: colors.corrections,
    attrs: {
      'data-k-skin': m.id, 'data-k-scheme': mode, 'data-k-density': settings.density, 'data-k-motion': settings.motion,
      'data-k-effects': effects.filter((x) => known.has(x)).join(' ')
    }
  };
}
