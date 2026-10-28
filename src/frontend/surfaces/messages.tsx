/**
 * S2 消息挂载服务（前端契约 8.3）。
 * · 正则把模型输出替换成 <div data-kami-mount="种类">兜底文字</div>
 * · 本服务观察聊天区：给新出现的标记挂 Shadow DOM 并渲染；标记被酒馆重绘换掉时自动重挂；节点离开文档时卸载 React 根并释放样式表
 * · 载荷只从聊天原始数据读（getRaw(mesid)），按「同种标记在这条消息里的序号」取第 n 段 —— 绝不从渲染后的 DOM 文本取
 */
import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LevelProvider, PortalProvider, TooltipProvider } from '../ds';
import type { StyleHub } from '../skin-engine/sheets';

export interface MountKind<P = unknown> {
  /** 从消息原文里取第 index 段载荷；取不到返回 undefined（标记保留兜底文字，不挂载） */
  payload(raw: string, index: number): P | undefined;
  render(payload: P, ctx: { mesId: number; index: number }): React.ReactNode;
}

export interface MessageMountOptions {
  doc: Document;
  hub: StyleHub;
  /** 聊天区根元素（酒馆是 #chat） */
  chat: () => Element | null;
  /** 第 mesId 条消息的原文（酒馆：SillyTavern.getContext().chat[mesId].mes） */
  getRaw: (mesId: number) => string | undefined;
  kinds: Record<string, MountKind<any>>;
  attrs?: () => Record<string, string>;
}

interface Mounted { root: Root; detach: () => void; key: string }

/** 取原文里第 index 个 <tag>…</tag> 的内容（常用的载荷取法） */
export function nthTag(tag: string): (raw: string, index: number) => string | undefined {
  return (raw, index) => {
    const re = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'g');
    let m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(raw))) { if (i++ === index) { return m[1]; } }
    return undefined;
  };
}

export class MessageMounts {
  private readonly o: MessageMountOptions;
  private readonly mounted = new Map<Element, Mounted>();
  private observer: MutationObserver | null = null;
  private scheduled = false;
  /** 统计：累计挂载次数（测试与排障用） */
  mounts = 0;

  constructor(o: MessageMountOptions) { this.o = o; }

  start(): void {
    const chat = this.o.chat();
    if (!chat || this.observer) { return; }
    const win = this.o.doc.defaultView as (Window & typeof globalThis);
    this.observer = new win.MutationObserver(() => this.schedule());
    this.observer.observe(chat, { childList: true, subtree: true });
    this.scan();
  }

  /** 同一帧里的多次变化合并成一次扫描 */
  private schedule(): void {
    if (this.scheduled) { return; }
    this.scheduled = true;
    Promise.resolve().then(() => { this.scheduled = false; this.scan(); });
  }

  scan(): void {
    /* 先卸载已离开文档的 */
    for (const [el, m] of this.mounted) { if (!el.isConnected) { this.unmount(el, m); } }
    const chat = this.o.chat();
    if (!chat) { return; }
    const markers = Array.from(chat.querySelectorAll('[data-kami-mount]'));
    for (const el of markers) {
      if (this.mounted.has(el) || el.shadowRoot) { continue; }
      const kind = el.getAttribute('data-kami-mount') || '';
      const spec = this.o.kinds[kind];
      const mes = el.closest('[mesid]');
      if (!spec || !mes) { continue; }
      const mesId = Number(mes.getAttribute('mesid'));
      const siblings = Array.from(mes.querySelectorAll('[data-kami-mount="' + kind + '"]'));
      const index = siblings.indexOf(el);
      const raw = this.o.getRaw(mesId);
      const payload = raw === undefined ? undefined : spec.payload(raw, index);
      if (payload === undefined) { continue; }
      this.mount(el, spec, payload, mesId, index, kind);
    }
  }

  private mount(el: Element, spec: MountKind<any>, payload: unknown, mesId: number, index: number, kind: string): void {
    const shadow = el.attachShadow({ mode: 'open' });   /* 没有插槽：标记里的兜底文字自动不再显示 */
    const detach = this.o.hub.attach(shadow);
    const doc = this.o.doc;
    const surface = doc.createElement('div');
    surface.setAttribute('data-k-surface', 'message');
    for (const [n, v] of Object.entries(this.o.attrs ? this.o.attrs() : {})) { surface.setAttribute(n, v); }
    const app = doc.createElement('div'), portal = doc.createElement('div');
    portal.setAttribute('data-k-portal', '');
    surface.append(app, portal);
    shadow.appendChild(surface);
    const root = createRoot(app);
    root.render(
      <PortalProvider container={portal}>
        <LevelProvider level="bg"><TooltipProvider>{spec.render(payload, { mesId, index })}</TooltipProvider></LevelProvider>
      </PortalProvider>
    );
    this.mounted.set(el, { root, detach, key: mesId + ':' + kind + ':' + index });
    this.mounts++;
  }

  private unmount(el: Element, m: Mounted): void {
    try { m.root.unmount(); } catch (e) { /* 已卸载 */ }
    m.detach();
    this.mounted.delete(el);
  }

  /** 皮肤属性变化时同步到所有挂载点的渲染面根 */
  refreshAttrs(): void {
    const a = this.o.attrs ? this.o.attrs() : {};
    for (const el of this.mounted.keys()) {
      const s = el.shadowRoot && el.shadowRoot.querySelector('[data-k-surface]');
      if (s) { for (const [n, v] of Object.entries(a)) { s.setAttribute(n, v); } }
    }
  }

  get size(): number { return this.mounted.size; }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    for (const [el, m] of Array.from(this.mounted)) { this.unmount(el, m); }
  }
}
