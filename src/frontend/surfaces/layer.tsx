/**
 * S1 宿主浮层：酒馆 body 下唯一一个 Shadow DOM 宿主 <kami-layer>，面板、对话框、提示与所有弹层都在里面。
 * 前端契约 1.1、8.2。
 * 宿主元素本身在酒馆页面的 light DOM 里，可能被酒馆 / 用户 CSS 波及，所以它的几何用内联 !important 钉死。
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { IconMapProvider, LevelProvider, PortalProvider, TooltipProvider } from '../ds';
import type { StyleHub } from '../skin-engine/sheets';

export interface Layer {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly root: HTMLElement;
  readonly portal: HTMLElement;
  /** 打开（或替换）一个浮层项，返回关闭函数 */
  open(id: string, node: React.ReactNode): () => void;
  close(id: string): void;
  ids(): string[];
  setAttrs(attrs: Record<string, string>): void;
  /** 皮肤变了（例如图标映射）：整层重画 */
  refresh(): void;
  dispose(): void;
}

const HOST_STYLE: Record<string, string> = {
  /* 高度用视口单位而不是 100%：酒馆手机版给 <html> 设了 transform 且 <html> 高 0，fixed 元素的包含块变成 <html>，
     100% / inset:0 都会算成 0 高，贴底抽屉整块跑到屏幕上方（2026-10-29 实机抓到）。下面再试 dvh（地址栏伸缩时更准） */
  position: 'fixed', top: '0', left: '0', right: '0', bottom: 'auto', width: '100%', height: '100vh', margin: '0', padding: '0', border: '0',
  /* transform 让宿主自己成为里面 fixed 元素（贴底抽屉、对话框遮罩、碎光层）的包含块：不然它们又会去对齐酒馆手机版那个 0 高的 <html> */
  'pointer-events': 'none', 'z-index': '2147482000', display: 'block', background: 'transparent', transform: 'translateZ(0)'
};

export function createLayer(doc: Document, hub: StyleHub, attrs: Record<string, string> = {}, onRoot?: (root: ShadowRoot) => () => void, icons: () => Record<string, string> = () => ({})): Layer {
  const old = doc.querySelector('kami-layer');
  if (old) { old.remove(); }   /* 脚本热重载：不留旧实例 */
  const host = doc.createElement('kami-layer');
  host.setAttribute('data-k-host', 'layer');
  for (const [p, v] of Object.entries(HOST_STYLE)) { host.style.setProperty(p, v, 'important'); }
  host.style.setProperty('height', '100dvh', 'important');   /* 不支持 dvh 的浏览器会忽略这一条，留着上面的 100vh */
  const shadow = host.attachShadow({ mode: 'open' });
  const detach = hub.attach(shadow);
  const root = doc.createElement('div');
  root.setAttribute('data-k-surface', 'layer');
  const app = doc.createElement('div');
  app.setAttribute('data-k-layer-items', '');
  app.style.display = 'contents';
  const portal = doc.createElement('div');
  portal.setAttribute('data-k-portal', '');
  root.append(app, portal);
  shadow.appendChild(root);
  doc.body.appendChild(host);
  const offRoot = onRoot ? onRoot(shadow) : null;

  const items = new Map<string, React.ReactNode>();
  const reactRoot: Root = createRoot(app);
  const paint = (): void => {
    flushSync(() => reactRoot.render(
      <PortalProvider container={portal}>
        <IconMapProvider value={icons()}>
          <LevelProvider level="bg">
            <TooltipProvider>{Array.from(items.entries()).map(([id, n]) => <React.Fragment key={id}>{n}</React.Fragment>)}</TooltipProvider>
          </LevelProvider>
        </IconMapProvider>
      </PortalProvider>
    ));
  };
  const setAttrs = (a: Record<string, string>): void => { for (const [n, v] of Object.entries(a)) { root.setAttribute(n, v); } };
  setAttrs(attrs);
  paint();
  let disposed = false;
  return {
    host, shadow, root, portal,
    open(id, node) { if (disposed) { return () => undefined; } items.set(id, node); paint(); return () => this.close(id); },
    close(id) { if (!disposed && items.delete(id)) { paint(); } },
    ids: () => Array.from(items.keys()),
    setAttrs,
    refresh() { if (!disposed) { paint(); } },
    dispose() {
      if (disposed) { return; }
      disposed = true;
      try { reactRoot.unmount(); } catch (e) { /* 已卸载 */ }
      if (offRoot) { offRoot(); }
      detach();
      host.remove();
    }
  };
}
