/**
 * 新运行库入口（前端契约第 1、7 节）。
 * 过渡期注册为 HOST.KamiRuntimeNext，与旧运行库（HOST.KamiRuntime）并存；新系统全部落地后改回 KamiRuntime。
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as DS from '../ds';
import { DS_CSS } from '../ds/styles';
import { StyleHub } from '../skin-engine/sheets';
import { composeSkin, DEFAULT_SETTINGS, type ComposeOptions, type ComposedSkin, type SkinSettings } from '../skin-engine/compose';
import { resolveScheme, auditScheme } from '../skin-engine/tokens';
import { validateManifest, type SkinManifest } from '../skin-engine/package';
import { createLayer, type Layer } from '../surfaces/layer';
import { MessageMounts, nthTag, type MessageMountOptions } from '../surfaces/messages';
import { FALLBACK_SKIN } from './fallback-skin';
import { Fracture } from '../fx/fracture';
import { loadFonts, probeImage, type LoadState } from './remote';

export const VERSION = '2.0.0-alpha.1';

export interface Runtime {
  version: string;
  React: typeof React; ReactDOM: typeof ReactDOM; ReactDOMClient: typeof ReactDOMClient;
  ds: typeof DS;
  /** 当前文档的样式表中心 */
  hub(doc?: Document): StyleHub;
  /** 宿主浮层（每个文档一个） */
  layer(doc?: Document): Layer;
  /** 应用皮肤：合成样式、写渲染面属性、广播 kami:skin-changed */
  /** 应用皮肤：合成样式、写渲染面属性、广播 kami:skin-changed。外链字体与外链图片在后台加载，不阻塞（6.6） */
  applySkin(m: SkinManifest, settings?: Partial<SkinSettings>, opts?: ComposeOptions): ComposedSkin;
  /** 当前皮肤外链资源的加载结果（测试与排障用） */
  remote(): Promise<{ fonts: Record<string, LoadState>; assets: Record<string, 'remote' | 'fallback'> }>;
  current(): ComposedSkin;
  messages(o: Omit<MessageMountOptions, 'hub' | 'doc' | 'attrs'> & { doc?: Document }): MessageMounts;
  engine: { resolveScheme: typeof resolveScheme; auditScheme: typeof auditScheme; validateManifest: typeof validateManifest; composeSkin: typeof composeSkin; nthTag: typeof nthTag };
  dispose(): void;
}

export function createRuntime(host: Window & typeof globalThis): Runtime {
  const doc0 = host.document;
  const hubs = new Map<Document, StyleHub>();
  const layers = new Map<Document, Layer>();
  const mounts = new Set<MessageMounts>();
  const systemDark = (): boolean => { try { return host.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return true; } };
  let composed: ComposedSkin = composeSkin(FALLBACK_SKIN, DEFAULT_SETTINGS, { systemDark: systemDark() });
  let manifest: SkinManifest = FALLBACK_SKIN;
  /* 动效模块：皮肤声明了 modules，且（皮肤定义了同名特效时）特效开关打开 */
  const moduleOn = (id: string): boolean => {
    if (!(manifest.modules || []).includes(id)) { return false; }
    const hasToggle = (manifest.effects || []).some((f) => f.id === id);
    return !hasToggle || composed.attrs['data-k-effects']!.split(' ').includes(id);
  };
  const onRoot = (root: ShadowRoot): (() => void) => {
    const fx = new Fracture(root, { enabled: () => moduleOn('fracture'), motion: () => (composed.attrs['data-k-motion'] as 'full' | 'calm' | 'off') });
    return () => fx.dispose();
  };
  let revision = 0;
  let remoteStatus: Promise<{ fonts: Record<string, LoadState>; assets: Record<string, 'remote' | 'fallback'> }> = Promise.resolve({ fonts: {}, assets: {} });

  const hub = (doc: Document = doc0): StyleHub => {
    let h = hubs.get(doc);
    if (!h) { h = new StyleHub(doc); h.setDesignSystem(DS_CSS); h.setSkin(composed.css); hubs.set(doc, h); }
    return h;
  };

  const rt: Runtime = {
    version: VERSION, React, ReactDOM, ReactDOMClient, ds: DS,
    hub,
    layer(doc = doc0) {
      let l = layers.get(doc);
      if (!l || !l.host.isConnected) { l = createLayer(doc, hub(doc), composed.attrs, onRoot, () => manifest.icons || {}); layers.set(doc, l); }
      return l;
    },
    applySkin(m, settings = {}, opts = {}) {
      const errs = validateManifest(m);
      if (errs.length) { throw new Error('皮肤清单不合法：' + errs.join('；')); }
      composed = composeSkin(m, { ...DEFAULT_SETTINGS, ...settings }, { systemDark: systemDark(), ...opts });
      manifest = m;
      /* 外链资源：字体后台注册；图片先用包内兜底（opts.assetUrls），外链能加载再换上去 */
      const rev = revision + 1;
      const fontsP = loadFonts(doc0, m.fonts || []);
      const remoteAssets = Object.entries(m.assets || {}).filter(([, a]) => !!a.url) as Array<[string, { url: string }]>;
      const assetsP = Promise.all(remoteAssets.map(async ([name, a]) => [name, (await probeImage(doc0, a.url)) ? 'remote' : 'fallback'] as const)).then((xs) => {
        const ok = xs.filter(([, v]) => v === 'remote');
        if (ok.length && revision === rev) {   /* 期间没有换过皮肤，才把外链图换上去 */
          const urls = { ...(opts.assetUrls || {}) };
          for (const [name] of ok) { urls[name] = (m.assets as Record<string, { url: string }>)[name]!.url; }
          composed = composeSkin(m, { ...DEFAULT_SETTINGS, ...settings }, { systemDark: systemDark(), ...opts, assetUrls: urls });
          for (const h of hubs.values()) { h.setSkin(composed.css); }
        }
        return Object.fromEntries(xs) as Record<string, 'remote' | 'fallback'>;
      });
      remoteStatus = Promise.all([fontsP, assetsP]).then(([fonts, assets]) => ({ fonts, assets }));
      for (const h of hubs.values()) { h.setSkin(composed.css); }
      for (const l of layers.values()) { l.setAttrs(composed.attrs); l.refresh(); }
      for (const mm of mounts) { mm.refreshAttrs(); }
      revision++;
      if (composed.corrections.length) { try { host.console.warn('[运行库] 皮肤 ' + m.id + ' 有 ' + composed.corrections.length + ' 处自动校正', composed.corrections); } catch (e) { /* 无控制台 */ } }
      try { doc0.dispatchEvent(new host.CustomEvent('kami:skin-changed', { detail: { revision, skin: m.id, mode: composed.mode } })); } catch (e) { /* 旧浏览器 */ }
      return composed;
    },
    current: () => composed,
    remote: () => remoteStatus,
    messages(o) {
      const doc = o.doc || doc0;
      const mm = new MessageMounts({ ...o, doc, hub: hub(doc), attrs: () => composed.attrs, onRoot, icons: () => manifest.icons || {} });
      mounts.add(mm);
      return mm;
    },
    engine: { resolveScheme, auditScheme, validateManifest, composeSkin, nthTag },
    dispose() {
      for (const mm of mounts) { mm.stop(); }
      for (const l of layers.values()) { l.dispose(); }
      mounts.clear(); layers.clear(); hubs.clear();
    }
  };
  return rt;
}

/* 作为 IIFE 加载时：注册到宿主窗口（沿 window 链找酒馆主页面，同源才能拿到） */
declare const window: Window & typeof globalThis;
if (typeof window !== 'undefined') {
  let host: Window & typeof globalThis = window;
  try { while (host.parent && host.parent !== host && host.parent.document) { host = host.parent as Window & typeof globalThis; } } catch (e) { /* 跨域就停在这一层 */ }
  const g = host as unknown as { KamiRuntimeNext?: Runtime };
  if (g.KamiRuntimeNext) { try { g.KamiRuntimeNext.dispose(); } catch (e) { /* 旧实例已坏 */ } }
  g.KamiRuntimeNext = createRuntime(host);
  try { host.document.documentElement.setAttribute('data-kami-runtime-next', VERSION); } catch (e) { /* 无文档 */ }
}
