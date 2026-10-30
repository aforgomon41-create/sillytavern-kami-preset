/**
 * 酒馆聊天前端 v0.2（2026-10-29 按用户实测意见重做）：**内容留在酒馆的 DOM 里，我们只加外壳**。
 *
 * 为什么（用户 2026-10-29）：v0.1 把 .mes_text 整个藏起来、自己从原文重画，结果
 *   · 其他插件往正文里插的按钮 / 生图标记全没了，正文里的 HTML 美化也不显示；
 *   · 对白 / 心理描写的颜色不跟酒馆的字体颜色设置走；
 *   · 思维链没走 main 的做法（「💭 思维链」把它从正文流里搬进酒馆原生思维链块）。
 * 现在与 main 的「📄 正文外壳」同一个思路：
 *   · 正文：正则「前端|正文」把 <content> 换成两个空标记夹住的正文，酒馆照常渲染；这里把两个标记之间的节点**原样**搬进
 *     我们的宿主元素。宿主挂 Shadow DOM，里面是头部（字数 / 看原文 / 复制）和一个 <slot>——正文节点仍是页面 DOM 的一部分
 *     （仍在 .mes_text 里），插件照常找得到、照常插；字体颜色由酒馆的样式决定。公式见 math.ts。
 *   · 思维链：内容来自酒馆原生思维链块（extra.reasoning，「💭 思维链」流式时搬进去的）；老楼层正文里内联的思维链也认。
 *     我们在 .mes_text 前面放一块自己的思维链（Shadow DOM），原生块藏起来；编辑 / 删除按钮点的是酒馆原生的那两个，
 *     酒馆进入编辑状态时反过来：显示原生块、藏起我们的。生成中显示「思考中 N 字」（读「💭 思维链」正在扣的内容）。
 *   · 搜索资料 / 行动选项：酒馆助手把对应正则渲染成 iframe（.TH-render）。认出是哪一种后藏起 iframe，在原位置换成我们的；
 *     行动选项只有最新一条回复渲染（拍板 D）。
 *   · 生成中的那一楼只更新思维链；正文 / 搜索资料 / 行动选项等生成结束、酒馆最后一次渲染之后再接管（酒馆流式时每个片段都重写
 *     .mes_text，放进去的东西会被冲掉——main 的正文外壳也是这么处理的）。
 *   · stop()：正文节点搬回原处、标记放回，iframe 取消隐藏，宿主与样式全部移除——酒馆、「📄 正文外壳」「💭 思维链」原样接手。
 * 原文只从聊天数据读（契约 8.3）；酒馆的控件和交互一个都不动（契约 8.4）。
 */
import * as React from 'react';
import type { StyleHub } from '../skin-engine/sheets';
import { mountSurface } from '../surfaces/messages';
import { typesetTex } from './math';
import { TEXT_ATTR, bodyCss, markBody, tokenRule, unmarkBody } from './body-style';
import { splitReply, takeTag } from './parse';
import { MsgBodyShell, MsgOptions, MsgPart, MsgSearch, MsgThink, type OptionItem, type OptionMode, type ThinkActions } from './view';
import { cleanCopyText } from '../../scripts/_copy-clean.js';

export interface TavernMessage {
  mes: string; isUser: boolean; isSystem?: boolean;
  /** 酒馆原生思维链（extra.reasoning） */
  reasoning?: string;
}

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
  /** 生成中正在搬的思维链（「💭 思维链」的 KamiCot.live()）；没有在搬时返回 null */
  liveThink?: () => { diverting: boolean; text: string } | null;
  /** 点行动选项：填入 / 发送由调用方实现 */
  onPick: (item: OptionItem, mode: OptionMode) => void;
  /** 思维链标题里的名字 */
  thinker?: string;
  /** 行动选项默认展开？（默认读 localStorage kami.options.folded，'1' = 收起） */
  optionsOpen?: () => boolean;
  /** 「填入 / 发送」偏好的存取（默认 localStorage） */
  loadMode?: () => OptionMode;
  saveMode?: (m: OptionMode) => void;
}

interface Surface { host: HTMLElement; render: (node: React.ReactNode) => void; dispose: () => void; last: string }
type Kind = 'think' | 'search' | 'options' | 'body';

const MES_ATTR = 'data-kami-msg';
const HOST_ATTR = 'data-kami-msg-host';          /* 我们的宿主元素，值是种类 */
const HIDE_ATTR = 'data-kami-msg-hidden';        /* 被我们换掉的酒馆助手 iframe（.TH-render） */
const NATIVE_THINK = 'data-kami-msg-native-think'; /* .mes 上：原生思维链块由我们代为显示 */
const MARK_START = 'data-kami-body-start';
const MARK_END = 'data-kami-body-end';
const STYLE_ID = 'kami-msg-host-style';
const BODY_STYLE_ID = 'kami-msg-body-style';   /* 正文排版（从设计系统与皮肤里抽出来的正文规则，见 body-style.ts） */
const OPT_FOLD_KEY = 'kami.options.folded';
const EDITING_THINK = '.reasoning_edit_textarea';

/* 宿主文档里的唯一一条样式：只藏 / 显我们接手的东西，外加公式的排版（公式在页面 DOM 里，影子样式管不到）。不改酒馆任何外观 */
const HOST_CSS = [
  '#chat [' + HIDE_ATTR + '] { display: none !important; }',
  '#chat .mes[' + NATIVE_THINK + ']:not(:has(' + EDITING_THINK + ')) .mes_reasoning_details { display: none !important; }',
  '#chat .mes:has(' + EDITING_THINK + ') [' + HOST_ATTR + '="think"] { display: none !important; }',
  '#chat [' + HOST_ATTR + '] { display: block; }',
  /* 思维链在 .mes_text 外面：右边留出与 .mes_text 一样的空，和正文同宽 */
  '#chat [' + HOST_ATTR + '="think"] { margin: 4px var(--mes-right-spacing, 0) 4px 0; }',
  '#chat [' + HOST_ATTR + '="search"], #chat [' + HOST_ATTR + '="options"] { margin: 6px 0; text-indent: 0; }',
  '#chat [data-kami-math="block"] { display: block; overflow-x: auto; overflow-y: hidden; margin: .4em 0; text-indent: 0; }',
  '#chat [data-kami-math] math { font-size: 1.05em; }'
].join('\n');

/** 酒馆助手渲染的 iframe 前端是哪一种：看它保留的源码（隐藏的 <pre><code>）里的组件标记 */
function thKind(th: Element): 'think' | 'search' | 'options' | null {
  const code = th.querySelector(':scope > pre code, :scope > pre');
  const src = code ? code.textContent || '' : '';
  /* 认元素上的标记（<div class="kami-root" data-kami-comp="…">），不认样式表里的选择器——基础样式里三种组件的选择器都有 */
  const m = /<div class="kami-root" data-kami-comp="(think|search|options)"/.exec(src);
  return m ? (m[1] as 'think' | 'search' | 'options') : null;
}

export class ChatFrontend {
  private readonly o: ChatFrontendOptions;
  /** 每个宿主元素一个渲染面 */
  private readonly surfaces = new Map<HTMLElement, Surface>();
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private busy = false;
  private mode: OptionMode;
  /** 正文排版样式用到的令牌；tokensFrom：令牌值是从哪个渲染面读的（还没有渲染面时先空着，挂上第一个后补） */
  private bodyTokens: string[] = [];
  private tokensFrom: Element | null = null;
  /** 已经标过的正文：内容没变就不再走一遍 */
  private readonly marked = new WeakMap<Element, string>();
  private readonly onStorage = (e: StorageEvent): void => { if (e.key === OPT_FOLD_KEY || e.key === 'kami-option-mode') { this.refresh(); } };
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
    this.bodyStyle();
    const win = this.o.doc.defaultView as Window & typeof globalThis;
    this.observer = new win.MutationObserver(() => { if (!this.busy) { this.schedule(); } });
    this.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    try { win.addEventListener('storage', this.onStorage); } catch (e) { /* 没有 storage 事件 */ }
    this.scan();
  }

  /** 正文排版样式：设计系统 + 当前皮肤里的正文规则，改写后放进宿主文档；令牌值从一个已挂好的渲染面读 */
  private bodyStyle(): void {
    const doc = this.o.doc;
    let st = doc.getElementById(BODY_STYLE_ID);
    if (!st) { st = doc.createElement('style'); st.id = BODY_STYLE_ID; doc.head.appendChild(st); }
    const t = this.o.hub.texts();
    const { css, tokens } = bodyCss(doc.defaultView as Window & typeof globalThis, [t.ds, t.skin]);
    this.bodyTokens = tokens;
    let src: Element | null = null;
    for (const s of this.surfaces.values()) { const el = s.host.shadowRoot && s.host.shadowRoot.querySelector('[data-k-surface]'); if (el && el.isConnected) { src = el; break; } }
    this.tokensFrom = src;
    st.textContent = css + '\n' + tokenRule(src, tokens);
  }

  private mark(root: Element, mode: 'body' | 'stream' | 'all'): void {
    if (root.getAttribute(TEXT_ATTR) !== mode) { root.setAttribute(TEXT_ATTR, mode); this.marked.delete(root); }
    const sig = root.childElementCount + ':' + (root.textContent || '').length;
    if (this.marked.get(root) === sig) { return; }
    markBody(root);
    this.marked.set(root, root.childElementCount + ':' + (root.textContent || '').length);
  }

  /** 外部事件（生成结束、切换回复、编辑完成……）或设置变了：重画一次 */
  refresh(): void {
    this.reloadMode();
    for (const s of this.surfaces.values()) { s.last = ''; }
    this.schedule();
  }

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
    /* 自己改 DOM 时观察器会再叫一次：改动期间不排队（改完的状态本来就是这次扫描的结果） */
    this.busy = true;
    try { this.scanNow(); } finally {
      this.busy = false;
      if (this.observer) { this.observer.takeRecords(); }
    }
  }

  private scanNow(): void {
    for (const [h, s] of this.surfaces) { if (!h.isConnected) { s.dispose(); this.surfaces.delete(h); } }
    const chat = this.o.chat();
    if (!chat) { return; }
    const latest = this.latestAi();
    const generating = this.o.generating();
    const lastId = this.o.count() - 1;
    for (const mes of Array.from(chat.querySelectorAll('.mes[mesid]'))) {
      const id = Number(mes.getAttribute('mesid'));
      const msg = this.o.getMessage(id);
      if (!msg || msg.isUser || msg.isSystem || mes.getAttribute('is_user') === 'true' || mes.getAttribute('is_system') === 'true') { continue; }
      const text = mes.querySelector('.mes_text');
      if (!text) { continue; }
      mes.setAttribute(MES_ATTR, '');
      const streaming = generating && id === lastId;
      this.think(mes, text, id, msg, streaming);
      if (text.querySelector('textarea')) { continue; }   /* 酒馆正在编辑这条：不碰 .mes_text */
      if (streaming) {
        /* 生成中：藏起已经出现的 iframe 前端（结束后在原位换成我们的）；正文按我们的排版逐步显示——
           酒馆每个片段都重写 .mes_text，标记在这个微任务里补上，赶在绘制之前 */
        for (const th of Array.from(text.querySelectorAll('.TH-render'))) { const kd = thKind(th); if (kd) { th.setAttribute(HIDE_ATTR, kd); } }
        this.mark(text, 'stream');
        continue;
      }
      this.iframes(text, id, msg, id === latest);
      this.body(text, id, msg);
      typesetTex(text);
      const bodyHost = text.querySelector('[' + HOST_ATTR + '="body"]');
      if (bodyHost) { if (text.hasAttribute(TEXT_ATTR)) { unmarkBody(text); } this.mark(bodyHost, 'body'); }
      else { this.mark(text, 'all'); }   /* 没有正文标记的楼层（老消息、正文正则只作用于最后两条）：整段当正文排 */
    }
    /* 令牌值还没读过（刚启动时一个渲染面都没有）：现在有了就补上 */
    if (!this.tokensFrom || !this.tokensFrom.isConnected) { if (this.surfaces.size) { this.bodyStyle(); } }
  }

  /* ───── 思维链：放在 .mes_text 前面（不在 .mes_text 里，流式重写冲不掉） ───── */
  private think(mes: Element, text: Element, id: number, msg: TavernMessage, streaming: boolean): void {
    const native = (msg.reasoning || '').trim();
    let src = native;
    let live = false;
    if (!src) { const t = takeTag(msg.mes, 'nyaruko_think'); if (t && t.text.trim()) { src = t.text.trim(); live = streaming && !t.closed; } }
    if (!src && streaming && this.o.liveThink) {
      const l = this.o.liveThink();
      if (l && (l.diverting || l.text)) { src = l.text; live = l.diverting; }
      if (l && l.diverting && !src) { src = ''; live = true; }
    }
    const details = mes.querySelector('.mes_reasoning_details');
    if (native && details) { mes.setAttribute(NATIVE_THINK, ''); } else { mes.removeAttribute(NATIVE_THINK); }
    let host = text.parentElement!.querySelector(':scope > [' + HOST_ATTR + '="think"]') as HTMLElement | null;
    if (!src && !live) { if (host) { this.drop(host); } return; }
    if (!host || host.nextElementSibling !== text) {
      if (host) { this.drop(host); }
      host = this.o.doc.createElement('div');
      host.setAttribute(HOST_ATTR, 'think');
      text.before(host);
    }
    const actions: ThinkActions = {};
    if (native && details) {
      const click = (sel: string) => (): void => {
        const b = details.querySelector(sel) as HTMLElement | null;
        if (!b) { return; }
        if (sel.includes('edit')) { (details as HTMLDetailsElement).open = true; }
        b.click();
      };
      if (details.querySelector('.mes_reasoning_edit')) { actions.edit = click('.mes_reasoning_edit'); }
      if (details.querySelector('.mes_reasoning_delete')) { actions.remove = click('.mes_reasoning_delete'); }
    }
    this.paint(host, 'think|' + src.length + ':' + src.slice(-48) + '|' + live + '|' + !!actions.edit,
      <MsgPart kind="think"><MsgThink text={src} streaming={live} actions={actions} {...(this.o.thinker ? { thinker: this.o.thinker } : {})} /></MsgPart>);
  }

  /* ───── 酒馆助手渲染的 iframe：思维链（老楼层）直接藏；搜索资料 / 行动选项换成我们的 ───── */
  private iframes(text: Element, id: number, msg: TavernMessage, latest: boolean): void {
    let reply: ReturnType<typeof splitReply> | null = null;
    const get = (): ReturnType<typeof splitReply> => (reply ||= splitReply(msg.mes));
    let optsTh = false;
    for (const th of Array.from(text.querySelectorAll('.TH-render'))) {
      const kind = thKind(th);
      if (!kind) { continue; }
      th.setAttribute(HIDE_ATTR, kind);
      if (kind === 'think') { continue; }
      let host = th.previousElementSibling as HTMLElement | null;
      if (!host || host.getAttribute(HOST_ATTR) !== kind) {
        host = this.o.doc.createElement('div');
        host.setAttribute(HOST_ATTR, kind);
        th.before(host);
      }
      if (kind === 'search') {
        const r = get();
        if (!r.search.length) { this.drop(host); th.removeAttribute(HIDE_ATTR); continue; }
        this.paint(host, 'search|' + msg.mes.length, <MsgPart kind="search"><MsgSearch records={r.search} pending={false} /></MsgPart>);
      } else {
        optsTh = true;
        const r = get();
        const open = this.optionsOpen();
        if (!latest || !r.options || !r.options.items.length) {
          /* 不是最新一条：选项不显示（iframe 也藏着）；解析不出选项时把 iframe 还回去 */
          if (latest) { th.removeAttribute(HIDE_ATTR); }
          this.drop(host);
          continue;
        }
        this.paint(host, 'options|' + msg.mes.length + '|' + this.mode + '|' + open,
          <MsgPart kind="options"><MsgOptions items={r.options.items} pending={false} mode={this.mode} onMode={(v) => this.setMode(v)} onPick={this.o.onPick} defaultOpen={open} /></MsgPart>);
      }
    }
    /* 行动选项的正则只作用在最后两条（maxDepth 1）：更早渲染的楼层里没有选项 iframe。删掉最新回复后，新的「最新一条」
       就没有地方可换——这时把选项接在 .mes_text 末尾；不再是最新一条时收掉 */
    const tailHost = text.querySelector(':scope > [' + HOST_ATTR + '="options"][data-kami-msg-tail]') as HTMLElement | null;
    const r = latest && !optsTh ? get() : null;
    if (r && r.options && r.options.items.length) {
      let host = tailHost;
      if (!host) { host = this.o.doc.createElement('div'); host.setAttribute(HOST_ATTR, 'options'); host.setAttribute('data-kami-msg-tail', ''); text.appendChild(host); }
      const open = this.optionsOpen();
      this.paint(host, 'options|' + msg.mes.length + '|' + this.mode + '|' + open,
        <MsgPart kind="options"><MsgOptions items={r.options.items} pending={false} mode={this.mode} onMode={(v) => this.setMode(v)} onPick={this.o.onPick} defaultOpen={open} /></MsgPart>);
    } else if (tailHost) { this.drop(tailHost); }
  }

  /* ───── 正文：两个标记之间的节点原样搬进宿主（slot 显示），标记收掉 ───── */
  private body(text: Element, id: number, msg: TavernMessage): void {
    const start = text.querySelector('[' + MARK_START + ']');
    const end = text.querySelector('[' + MARK_END + ']');
    if (start && end && start.parentNode === end.parentNode) {
      const host = this.o.doc.createElement('div');
      host.setAttribute(HOST_ATTR, 'body');
      let n = start.nextSibling;
      while (n && n !== end) { const nx = n.nextSibling; host.appendChild(n); n = nx; }
      start.before(host);
      start.remove(); end.remove();
    }
    for (const host of Array.from(text.querySelectorAll('[' + HOST_ATTR + '="body"]')) as HTMLElement[]) {
      const raw = (takeTag(msg.mes, 'content') || { text: '' }).text;
      this.paint(host, 'body|' + raw.length + ':' + raw.slice(-48),
        <MsgBodyShell raw={raw} copy={() => cleanCopyText(host)} />);
    }
  }

  private paint(host: HTMLElement, key: string, node: React.ReactNode): void {
    let s = this.surfaces.get(host);
    if (!s) {
      const m = mountSurface(host, this.o);
      s = { host, render: m.render, last: '', dispose: () => { try { m.root.unmount(); } catch (e) { /* 已卸载 */ } if (m.off) { m.off(); } m.detach(); } };
      this.surfaces.set(host, s);
      this.mounts++;
    }
    if (s.last === key) { return; }
    s.last = key;
    this.paints++;
    s.render(node);
  }

  private drop(host: HTMLElement): void {
    const s = this.surfaces.get(host);
    if (s) { s.dispose(); this.surfaces.delete(host); }
    host.remove();
  }

  private setMode(v: OptionMode): void {
    this.mode = v;
    try { if (this.o.saveMode) { this.o.saveMode(v); } else { this.o.doc.defaultView!.localStorage.setItem('kami-option-mode', v); } } catch (e) { /* 无痕模式 */ }
    this.refresh();
  }

  /** 皮肤属性变化：同步到所有渲染面根并重画 */
  refreshAttrs(): void {
    const a = this.o.attrs ? this.o.attrs() : {};
    for (const s of this.surfaces.values()) {
      const el = s.host.shadowRoot && s.host.shadowRoot.querySelector('[data-k-surface]');
      if (el) { for (const [n, v] of Object.entries(a)) { el.setAttribute(n, v); } }
      s.last = '';
    }
    this.bodyStyle();
    this.scan();
    this.bodyStyle();   /* 换了配色：令牌值要按新的重读 */
  }

  get size(): number { return this.surfaces.size; }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    try { this.o.doc.defaultView!.removeEventListener('storage', this.onStorage); } catch (e) { /* 已卸载 */ }
    for (const s of this.surfaces.values()) { s.dispose(); }
    this.surfaces.clear();
    const chat = this.o.chat();
    if (chat) {
      for (const el of Array.from(chat.querySelectorAll('[' + TEXT_ATTR + ']'))) { unmarkBody(el); }
      /* 正文放回原处，两个标记也放回去（「📄 正文外壳」或之后重新开启的我们还能认出来） */
      for (const host of Array.from(chat.querySelectorAll('[' + HOST_ATTR + '="body"]'))) {
        const a = this.o.doc.createElement('div'), b = this.o.doc.createElement('div');
        a.setAttribute(MARK_START, ''); b.setAttribute(MARK_END, '');
        host.before(a);
        while (host.firstChild) { host.before(host.firstChild); }
        host.before(b);
        host.remove();
      }
      for (const host of Array.from(chat.querySelectorAll('[' + HOST_ATTR + ']'))) { host.remove(); }
      for (const el of Array.from(chat.querySelectorAll('[' + HIDE_ATTR + ']'))) { el.removeAttribute(HIDE_ATTR); }
      for (const el of Array.from(chat.querySelectorAll('[' + NATIVE_THINK + '], [' + MES_ATTR + ']'))) { el.removeAttribute(NATIVE_THINK); el.removeAttribute(MES_ATTR); }
    }
    for (const sid of [STYLE_ID, BODY_STYLE_ID]) { const st = this.o.doc.getElementById(sid); if (st) { st.remove(); } }
  }
}
