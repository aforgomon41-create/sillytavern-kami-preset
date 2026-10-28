/**
 * S1 宿主浮层：酒馆 body 下唯一一个 Shadow DOM 宿主 <kami-layer>，面板、对话框、提示与所有弹层都在里面。
 * 前端契约 1.1、8.2。
 * 宿主元素本身在酒馆页面的 light DOM 里，可能被酒馆 / 用户 CSS 波及，所以它的几何用内联 !important 钉死。
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { LevelProvider, PortalProvider, TooltipProvider } from '../ds';
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
  dispose(): void;
}

const HOST_STYLE: Record<string, string> = {
  position: 'fixed', inset: '0', width: '100%', height: '100%', margin: '0', padding: '0', border: '0',
  'pointer-events': 'none', 'z-index': '2147482000', display: 'block', background: 'transparent', transform: 'none'
};

export function createLayer(doc: Document, hub: StyleHub, attrs: Record<string, string> = {}): Layer {
  const old = doc.querySelector('kami-layer');
  if (old) { old.remove(); }   /* 脚本热重载：不留旧实例 */
  const host = doc.createElement('kami-layer');
  host.setAttribute('data-k-host', 'layer');
  for (const [p, v] of Object.entries(HOST_STYLE)) { host.style.setProperty(p, v, 'important'); }
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

  const items = new Map<string, React.ReactNode>();
  const reactRoot: Root = createRoot(app);
  const paint = (): void => {
    flushSync(() => reactRoot.render(
      <PortalProvider container={portal}>
        <LevelProvider level="bg">
          <TooltipProvider>{Array.from(items.entries()).map(([id, n]) => <React.Fragment key={id}>{n}</React.Fragment>)}</TooltipProvider>
        </LevelProvider>
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
    dispose() {
      if (disposed) { return; }
      disposed = true;
      try { reactRoot.unmount(); } catch (e) { /* 已卸载 */ }
      detach();
      host.remove();
    }
  };
}
