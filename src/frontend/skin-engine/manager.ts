/**
 * 皮肤管理器核心（皮肤脚本 = 唯一的皮肤分发者，前端契约第 7 节）。只有逻辑，没有界面。
 * · 登记皮肤（内置 + 以后的用户皮肤），校验清单
 * · 设置按皮肤分别保存（特效、参数、明暗），字号缩放 / 密度 / 动效是全局设置
 * · 切换皮肤恢复该皮肤自己的设置；明暗选「跟随系统」时监听系统变化
 * · 任何变化都交给运行库 applySkin，由它同步所有渲染面
 */
import { validateManifest, type SkinManifest } from './package';
import { DEFAULT_SETTINGS, type SkinSettings } from './compose';
import type { Density, Motion } from './scales';
import type { Mode } from './tokens';

export interface SkinEntry { manifest: SkinManifest; css?: string; assetUrls?: Record<string, string> }

/** 持久化的设置结构（存在酒馆助手脚本变量里） */
export interface StoredSettings {
  version: 1;
  skin: string;
  global: { density: Density; motion: Motion; fontScale: number };
  perSkin: Record<string, { scheme?: string; effects?: string[]; params?: Record<string, string | number> }>;
}

export interface SettingsStore { load(): unknown; save(s: StoredSettings): void }

export interface Applier { applySkin(m: SkinManifest, s: Partial<SkinSettings>, o: { skinCss?: string; assetUrls?: Record<string, string> }): unknown }

export function defaultStored(skin: string): StoredSettings {
  return { version: 1, skin, global: { density: DEFAULT_SETTINGS.density, motion: DEFAULT_SETTINGS.motion, fontScale: 1 }, perSkin: {} };
}

const DENSITY: Density[] = ['compact', 'cozy', 'roomy'];
const MOTION: Motion[] = ['full', 'calm', 'off'];

/** 读回来的数据不可信：逐项清洗，坏的字段回落默认值 */
export function sanitizeStored(raw: unknown, fallbackSkin: string): StoredSettings {
  const d = defaultStored(fallbackSkin);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoredSettings>;
  const g = (o.global && typeof o.global === 'object' ? o.global : {}) as Partial<StoredSettings['global']>;
  const fs = Number(g.fontScale);
  const out: StoredSettings = {
    version: 1,
    skin: typeof o.skin === 'string' ? o.skin : d.skin,
    global: {
      density: DENSITY.includes(g.density as Density) ? (g.density as Density) : d.global.density,
      motion: MOTION.includes(g.motion as Motion) ? (g.motion as Motion) : d.global.motion,
      fontScale: isFinite(fs) ? Math.min(1.4, Math.max(0.8, fs)) : 1
    },
    perSkin: {}
  };
  for (const [id, v] of Object.entries(o.perSkin && typeof o.perSkin === 'object' ? o.perSkin : {})) {
    if (!v || typeof v !== 'object') { continue; }
    const e: StoredSettings['perSkin'][string] = {};
    if (typeof v.scheme === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(v.scheme)) { e.scheme = v.scheme; }
    if (Array.isArray(v.effects)) { e.effects = v.effects.filter((x): x is string => typeof x === 'string'); }
    if (v.params && typeof v.params === 'object') {
      e.params = {};
      for (const [pk, pv] of Object.entries(v.params)) { if (typeof pv === 'string' || typeof pv === 'number') { e.params[pk] = pv; } }
    }
    out.perSkin[id] = e;
  }
  return out;
}

export class SkinManager {
  private readonly skins = new Map<string, SkinEntry>();
  private state: StoredSettings;
  private readonly listeners = new Set<(s: StoredSettings) => void>();
  private mql: MediaQueryList | null = null;
  private readonly onSystem = (): void => { if (this.effectiveScheme() === 'auto') { this.apply(); } };

  constructor(private readonly store: SettingsStore, private readonly applier: Applier, entries: SkinEntry[], private readonly win?: Window) {
    for (const e of entries) { this.register(e); }
    const first = entries[0]?.manifest.id ?? 'fallback';
    this.state = sanitizeStored(store.load(), first);
    if (!this.skins.has(this.state.skin)) { this.state.skin = first; }   /* 旧系统的皮肤 id 或已删除的皮肤：落到第一个（默认）皮肤 */
    try { this.mql = win ? win.matchMedia('(prefers-color-scheme: dark)') : null; this.mql?.addEventListener('change', this.onSystem); } catch (e) { this.mql = null; }
  }

  register(e: SkinEntry): void {
    const errs = validateManifest(e.manifest);
    if (errs.length) { throw new Error('皮肤 ' + (e.manifest && e.manifest.id) + ' 清单不合法：' + errs.join('；')); }
    this.skins.set(e.manifest.id, e);
  }

  /** 某套皮肤的完整登记（清单 + CSS + 素材），皮肤卡的实时预览要用 */
  entry(id: string): SkinEntry | undefined { return this.skins.get(id); }
  list(): SkinManifest[] { return Array.from(this.skins.values()).map((e) => e.manifest); }
  get settings(): StoredSettings { return this.state; }
  get current(): SkinEntry { return this.skins.get(this.state.skin) as SkinEntry; }

  private effectiveScheme(): string { return this.state.perSkin[this.state.skin]?.scheme ?? 'auto'; }

  /** 合成当前设置交给运行库 */
  apply(): void {
    const e = this.current;
    const per = this.state.perSkin[e.manifest.id] || {};
    const s: Partial<SkinSettings> = { ...this.state.global, scheme: per.scheme ?? 'auto' };
    if (per.effects) { s.effects = per.effects; }
    if (per.params) { s.params = per.params; }
    const o: { skinCss?: string; assetUrls?: Record<string, string> } = {};
    if (e.css) { o.skinCss = e.css; }
    if (e.assetUrls) { o.assetUrls = e.assetUrls; }
    this.applier.applySkin(e.manifest, s, o);
  }

  private change(mut: (s: StoredSettings) => void): void {
    mut(this.state);
    this.store.save(this.state);
    this.apply();
    for (const l of this.listeners) { l(this.state); }
  }

  select(id: string): void { if (this.skins.has(id) && id !== this.state.skin) { this.change((s) => { s.skin = id; }); } }
  setScheme(scheme: string): void { this.change((s) => { (s.perSkin[s.skin] ||= {}).scheme = scheme; }); }
  setGlobal(patch: Partial<StoredSettings['global']>): void { this.change((s) => { s.global = sanitizeStored({ ...s, global: { ...s.global, ...patch } }, s.skin).global; }); }
  setEffect(id: string, on: boolean): void {
    this.change((s) => {
      const m = this.current.manifest;
      const per = (s.perSkin[s.skin] ||= {});
      const cur = new Set(per.effects ?? (m.effects || []).filter((f) => f.default).map((f) => f.id));
      if (on) { cur.add(id); } else { cur.delete(id); }
      per.effects = Array.from(cur).filter((x) => (m.effects || []).some((f) => f.id === x));
    });
  }
  setParam(id: string, value: string | number): void { this.change((s) => { ((s.perSkin[s.skin] ||= {}).params ||= {})[id] = value; }); }
  resetSkin(): void { this.change((s) => { delete s.perSkin[s.skin]; }); }
  /** 整组写回某套皮肤自己的设置（撤销「恢复默认」用）；传 undefined 等于恢复默认。只接受清洗过的结构 */
  restoreSkin(id: string, per: StoredSettings['perSkin'][string] | undefined): void {
    this.change((s) => {
      if (!per) { delete s.perSkin[id]; return; }
      const clean = sanitizeStored({ perSkin: { [id]: per } }, s.skin).perSkin[id];
      if (clean) { s.perSkin[id] = clean; }
    });
  }

  subscribe(fn: (s: StoredSettings) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  dispose(): void { try { this.mql?.removeEventListener('change', this.onSystem); } catch (e) { /* 旧浏览器 */ } this.listeners.clear(); }
}
