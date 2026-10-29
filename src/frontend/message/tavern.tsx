/**
 * 酒馆聊天前端：把 MessageView 挂到酒馆的每条 AI 回复上（拍板 A：正文由我们渲染；E：生成期间就逐步排版）。
 *
 * 怎么挂（2026-10-28 在本机测试酒馆实测定下，见 test/st/message-next.mjs）：
 *   · 每条 AI 消息的 .mes_block 里、紧跟 .mes_text 之后插一个宿主 <div data-kami-msg-host>，挂 Shadow DOM。
 *     **不放进 .mes_text**：流式生成时酒馆每个片段都整段重写 .mes_text，放进去会被反复冲掉。
 *   · 酒馆自己的 .mes_text 用一条宿主样式藏起来（.mes 上打 data-kami-msg 标记）；**编辑消息时**（.mes_text 里出现编辑框）
 *     反过来：显示酒馆的编辑框、藏起我们的宿主。酒馆的控件和交互一个都不动（前端契约 8.4）。
 *   · 原文只从聊天数据读（chat[mesid].mes，流式时酒馆也在实时更新它），绝不从渲染后的 DOM 取（契约 8.3）。
 *   · 观察 #chat：酒馆每次重写消息（流式片段、重绘、切换回复、重载聊天）都会触发，合并到一次微任务里重画；
 *     宿主节点离开文档（删除消息、重载聊天）就卸载 React 根、释放样式表。整段 .mes 被换掉时自动重挂。
 *   · stop() 之后不留任何东西：宿主、标记、宿主样式全部移除，酒馆恢复原样。
 */
import * as React from 'react';
import type { StyleHub } from '../skin-engine/sheets';
import { mountSurface } from '../surfaces/messages';
import { MessageView, type OptionItem, type OptionMode } from './view';

export interface TavernMessage { mes: string; isUser: boolean; isSystem?: boolean }

export interface ChatFrontendOptions {
  doc: Document;
  hub: StyleHub;
  attrs?: () => Record<string, string>;
  icons?: () => Record<string, string>;
  onRoot?: (root: ShadowRoot) => () => void;
  /** 聊天区（酒馆是 #chat） */
  chat: () => Element | null;
  /** 第 id 条消息（酒馆：SillyTavern.getContext().chat[id]） */
  getMessage: (id: number) => TavernMessage | undefined;
  /** 消息条数 */
  count: () => number;
  /** 现在是否正在生成（酒馆：停止按钮可见）；生成中的只会是最后一条 */
  generating: () => boolean;
  /** 点行动选项：填入 / 发送由调用方实现（酒馆助手的 createChatMessages + generate，输入框） */
  onPick: (item: OptionItem, mode: OptionMode) => void;
  /** 思维链标题里的名字 */
  thinker?: string;
  /** 行动选项默认展开？（显示面板「行动选项默认」；默认读 localStorage kami.options.folded，和旧前端同一个键，'1' = 收起） */
  optionsOpen?: () => boolean;
  /** 「填入 / 发送」偏好的存取（默认 localStorage） */
  loadMode?: () => OptionMode;
  saveMode?: (m: OptionMode) => void;
}

interface Mounted { host: HTMLElement; mes: Element; render: (node: React.ReactNode) => void; dispose: () => void; last: string }

const HOST_ATTR = 'data-kami-msg-host';
const MES_ATTR = 'data-kami-msg';
const STYLE_ID = 'kami-msg-host-style';
const OPT_FOLD_KEY = 'kami.options.folded';
/* 宿主文档里的唯一一条样式：只藏 / 显，不改酒馆任何外观 */
const HOST_CSS =
  '#chat .mes[' + MES_ATTR + ']:not(:has(.mes_text textarea)) .mes_text { display: none !important; }\n' +
  '#chat .mes[' + MES_ATTR + ']:has(.mes_text textarea) [' + HOST_ATTR + '] { display: none !important; }\n' +
  '#chat [' + HOST_ATTR + '] { display: block; margin-top: 4px; }';

export class ChatFrontend {
  private readonly o: ChatFrontendOptions;
  private readonly mounted = new Map<number, Mounted>();
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private mode: OptionMode;
  private readonly onStorage = (e: StorageEvent): void => { if (e.key === OPT_FOLD_KEY || e.key === 'kami-option-mode') { this.reloadMode(); this.scan(); } };
  /** 统计：累计挂载次数（测试与排障用） */
  mounts = 0;
  /** 统计：累计重画次数 */
  paints = 0;

  constructor(o: ChatFrontendOptions) {
    this.o = o;
    this.mode = 'fill';
    this.reloadMode();
  }

  private reloadMode(): void {
    try { this.mode = this.o.loadMode ? this.o.loadMode() : ((this.o.doc.defaultView!.localStorage.getItem('kami-option-mode') as OptionMode) || 'fill'); } catch (e) { /* 无痕模式 */ }
    if (this.mode !== 'send') { this.mode = 'fill'; }
  }

  private optionsOpen(): boolean {
    if (this.o.optionsOpen) { return this.o.optionsOpen(); }
    try { return this.o.doc.defaultView!.localStorage.getItem(OPT_FOLD_KEY) !== '1'; } catch (e) { return true; }
  }

  start(): void {
    const chat = this.o.chat();
    if (!chat || this.observer) { return; }
    if (!this.o.doc.getElementById(STYLE_ID)) {
      const st = this.o.doc.createElement('style');
      st.id = STYLE_ID; st.textContent = HOST_CSS;
      this.o.doc.head.appendChild(st);
    }
    const win = this.o.doc.defaultView as Window & typeof globalThis;
    this.observer = new win.MutationObserver(() => this.schedule());
    this.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    /* 显示面板改了「行动选项默认 / 填入发送」：其他标签页或面板写 localStorage 时跟上（同一页面里由调用方 refresh） */
    try { win.addEventListener('storage', this.onStorage); } catch (e) { /* 没有 storage 事件 */ }
    this.scan();
  }

  /** 外部事件（生成结束、切换回复、编辑完成……）也可以直接要一次重画；设置变了（选项模式等）也走这里 */
  refresh(): void { this.reloadMode(); this.schedule(); }

  private schedule(): void {
    if (this.scheduled) { return; }
    this.scheduled = true;
    Promise.resolve().then(() => { this.scheduled = false; this.scan(); });
  }

  /** 最新一条 AI 回复的 id（只有它渲染行动选项，拍板 D） */
  private latestAi(): number {
    for (let i = this.o.count() - 1; i >= 0; i--) { const m = this.o.getMessage(i); if (m && !m.isUser && !m.isSystem) { return i; } }
    return -1;
  }

  scan(): void {
    const chat = this.o.chat();
    for (const [id, m] of this.mounted) { if (!m.host.isConnected || !m.mes.isConnected) { this.unmount(id, m); } }
    if (!chat) { return; }
    const latest = this.latestAi();
    const generating = this.o.generating();
    const lastId = this.o.count() - 1;
    for (const mes of Array.from(chat.querySelectorAll('.mes[mesid]'))) {
      const id = Number(mes.getAttribute('mesid'));
      const msg = this.o.getMessage(id);
      if (!msg || msg.isUser || msg.isSystem || mes.getAttribute('is_user') === 'true' || mes.getAttribute('is_system') === 'true') { continue; }
      let m = this.mounted.get(id);
      if (m && m.mes !== mes) { this.unmount(id, m); m = undefined; }
      if (!m) { m = this.mount(id, mes); if (!m) { continue; } }
      const streaming = generating && id === lastId;
      /* 只在原文 / 最新 / 生成状态变了时重画（观察器每个流式片段都会叫一次） */
      const optOpen = this.optionsOpen();
      const key = msg.mes.length + ':' + msg.mes.slice(-64) + '|' + (id === latest) + '|' + streaming + '|' + this.mode + '|' + optOpen;
      if (key === m.last) { continue; }
      m.last = key;
      this.paints++;
      m.render(<MessageView raw={msg.mes} streaming={streaming} latest={id === latest} mode={this.mode}
        onMode={(v) => this.setMode(v)} onPick={this.o.onPick} optionsOpen={optOpen} {...(this.o.thinker ? { thinker: this.o.thinker } : {})} />);
    }
  }

  private setMode(v: OptionMode): void {
    this.mode = v;
    try { if (this.o.saveMode) { this.o.saveMode(v); } else { this.o.doc.defaultView!.localStorage.setItem('kami-option-mode', v); } } catch (e) { /* 无痕模式 */ }
    this.scan();
  }

  private mount(id: number, mes: Element): Mounted | undefined {
    const text = mes.querySelector('.mes_text');
    if (!text || !text.parentElement) { return undefined; }
    let host = text.parentElement.querySelector(':scope > [' + HOST_ATTR + ']') as HTMLElement | null;
    if (host && host.shadowRoot) { host.remove(); host = null; }   /* 上一个实例留下的（不该发生，保险） */
    host = this.o.doc.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    text.after(host);
    mes.setAttribute(MES_ATTR, '');
    const s = mountSurface(host, this.o);
    const m: Mounted = {
      host, mes, render: s.render, last: '',
      dispose: () => { try { s.root.unmount(); } catch (e) { /* 已卸载 */ } if (s.off) { s.off(); } s.detach(); }
    };
    this.mounted.set(id, m);
    this.mounts++;
    return m;
  }

  private unmount(id: number, m: Mounted): void {
    m.dispose();
    if (m.host.isConnected) { m.host.remove(); }
    if (m.mes.isConnected) { m.mes.removeAttribute(MES_ATTR); }
    this.mounted.delete(id);
  }

  /** 皮肤属性变化：同步到所有渲染面根并重画（图标映射等上下文） */
  refreshAttrs(): void {
    const a = this.o.attrs ? this.o.attrs() : {};
    for (const m of this.mounted.values()) {
      const s = m.host.shadowRoot && m.host.shadowRoot.querySelector('[data-k-surface]');
      if (s) { for (const [n, v] of Object.entries(a)) { s.setAttribute(n, v); } }
      m.last = '';
    }
    this.scan();
  }

  get size(): number { return this.mounted.size; }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    try { this.o.doc.defaultView!.removeEventListener('storage', this.onStorage); } catch (e) { /* 已卸载 */ }
    for (const [id, m] of Array.from(this.mounted)) { this.unmount(id, m); }
    const st = this.o.doc.getElementById(STYLE_ID);
    if (st) { st.remove(); }
  }
}
