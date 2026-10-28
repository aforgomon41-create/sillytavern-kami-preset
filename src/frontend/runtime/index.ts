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
  applySkin(m: SkinManifest, settings?: Partial<SkinSettings>, opts?: ComposeOptions): ComposedSkin;
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
  let revision = 0;

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
      if (!l || !l.host.isConnected) { l = createLayer(doc, hub(doc), composed.attrs); layers.set(doc, l); }
      return l;
    },
    applySkin(m, settings = {}, opts = {}) {
      const errs = validateManifest(m);
      if (errs.length) { throw new Error('皮肤清单不合法：' + errs.join('；')); }
      composed = composeSkin(m, { ...DEFAULT_SETTINGS, ...settings }, { systemDark: systemDark(), ...opts });
      for (const h of hubs.values()) { h.setSkin(composed.css); }
      for (const l of layers.values()) { l.setAttrs(composed.attrs); }
      for (const mm of mounts) { mm.refreshAttrs(); }
      revision++;
      if (composed.corrections.length) { try { host.console.warn('[运行库] 皮肤 ' + m.id + ' 有 ' + composed.corrections.length + ' 处自动校正', composed.corrections); } catch (e) { /* 无控制台 */ } }
      try { doc0.dispatchEvent(new host.CustomEvent('kami:skin-changed', { detail: { revision, skin: m.id, mode: composed.mode } })); } catch (e) { /* 旧浏览器 */ }
      return composed;
    },
    current: () => composed,
    messages(o) {
      const doc = o.doc || doc0;
      const mm = new MessageMounts({ ...o, doc, hub: hub(doc), attrs: () => composed.attrs });
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
