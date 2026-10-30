/**
 * 酒馆聊天前端 v0.4：依附于消息的前端（正文 / 思维链 / 搜索资料 / 行动选项，以及以后的）**渲染逻辑统一**（用户 2026-10-30）。
 *
 * 一条管线（body-style.ts）：内容由酒馆渲染（Markdown、HTML 美化、正则与酒馆一致；公式先保护再换成 MathML）→ 内容留在页面 DOM 里
 * （插件插的节点不丢、之后的插件也找得到）→ 原地加结构标记 → 用设计系统与皮肤的内容排版。外壳（头部、折叠、按钮）在 Shadow DOM 里，
 * 内容经 slot 显示在外壳里——所以皮肤的底色、纸纹、令牌、字体颜色对四块都一样生效。
 *
 * 每一块挂在哪：
 *   · 思维链、搜索资料：.mes_text 前面各一个宿主（不在 .mes_text 里，流式重写冲不掉）；内容 = messageFormatting 的结果，放在宿主的
 *     子节点里（slot="content"）。思维链来自酒馆原生思维链（extra.reasoning，「💭 思维链」流式时搬进去的；原生块藏起，编辑 / 删除点原生按钮，
 *     酒馆编辑时让回原生块）；老楼层正文里内联的思维链、生成中正在搬的思维链也认。
 *   · 正文：**.mes_text 本身就是宿主**——Shadow DOM 里是外壳（头部 + slot），酒馆每次重写 .mes_text 的内容，外壳都还在；
 *     所以生成中、更早的楼层、生成结束是同一个外壳、同一套排版。酒馆编辑这一楼时外壳让开。
 *   · 行动选项：.mes_text 后面一个宿主，只有最新一条回复有（拍板 D）；按钮在影子树里，标题与内容经 slot 进来。
 *   · 酒馆助手渲染的 iframe（思维链 / 搜索资料 / 行动选项三种正则前端）一律藏起——由我们的这几块代替。正文里的 HTML 美化照常显示。
 * 颜色：默认用皮肤的字体颜色与底色；显示面板关掉「皮肤字体颜色」时跟酒馆的字体颜色设置、底色让出来（lock.css）。
 * stop()：标记、样式、宿主全部移除；.mes_text 的影子树去不掉，只留一个空 slot（显示与没有时一样）——酒馆、「📄 正文外壳」「💭 思维链」原样接手。
 * 原文只从聊天数据读（契约 8.3）；酒馆的控件和交互一个都不动（契约 8.4）。
 */
import * as React from 'react';
import type { StyleHub } from '../skin-engine/sheets';
import { mountSurface } from '../surfaces/messages';
import { protectMath, typesetTex } from './math';
import { TEXT_ATTR, bodyCss, markBody, unmarkBody } from './body-style';
import { splitReply, takeTag, siteOf, type SearchRecord } from './parse';
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
  /** 酒馆的渲染（messageFormatting）：Markdown → 净化过的 HTML。拿不到时返回 null（退回内置的 Markdown） */
  format?: (md: string, o: { id: number; reasoning?: boolean }) => string | null;
  /** 用皮肤的字体颜色（默认是）；否则跟酒馆的字体颜色设置 */
  skinColors?: () => boolean;
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

interface Surface { host: HTMLElement; surface: Element | null; render: (node: React.ReactNode) => void; dispose: () => void; last: string; body: boolean }
type Kind = 'think' | 'search' | 'options';

const MES_ATTR = 'data-kami-msg';
const HOST_ATTR = 'data-kami-msg-host';          /* 我们的宿主元素（.mes_text 之外的几块），值是种类 */
const BODY_ATTR = 'data-kami-msg-body';          /* .mes_text 当了正文宿主 */
const HIDE_ATTR = 'data-kami-msg-hidden';        /* 被我们代替的酒馆助手 iframe（.TH-render） */
const NATIVE_THINK = 'data-kami-msg-native-think'; /* .mes 上：原生思维链块由我们代为显示 */
const STYLE_ID = 'kami-msg-host-style';
const BODY_STYLE_ID = 'kami-msg-body-style';
const OPT_FOLD_KEY = 'kami.options.folded';
const EDITING_THINK = '.reasoning_edit_textarea';

/* 宿主文档里的一条样式：只藏 / 显我们接手的东西，外加几块的间距。不改酒馆任何外观 */
const HOST_CSS = [
  '#chat [' + HIDE_ATTR + '] { display: none !important; }',
  '#chat .mes[' + NATIVE_THINK + ']:not(:has(' + EDITING_THINK + ')) .mes_reasoning_details { display: none !important; }',
  '#chat .mes:has(' + EDITING_THINK + ') [' + HOST_ATTR + '="think"] { display: none !important; }',
  '#chat [' + HOST_ATTR + '] { display: block; margin: 4px var(--mes-right-spacing, 0) 4px 0; text-indent: 0; }',
  '#chat [' + HOST_ATTR + '="options"] { margin-top: 6px; }'
].join('\n');

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 酒馆助手渲染的 iframe 前端是哪一种：看它保留的源码里元素上的组件标记（不认样式表里的选择器——基础样式里三种都有） */
function thKind(th: Element): Kind | null {
  const code = th.querySelector(':scope > pre code, :scope > pre');
  const src = code ? code.textContent || '' : '';
  const m = /<div class="kami-root" data-kami-comp="(think|search|options)"/.exec(src);
  return m ? (m[1] as Kind) : null;
}

export class ChatFrontend {
  private readonly o: ChatFrontendOptions;
  private readonly surfaces = new Map<HTMLElement, Surface>();
  private observer: MutationObserver | null = null;
  private scheduled = false;
  private busy = false;
  /* 增量扫描：只重查有变动的楼层（长聊天里流式每个片段都全量扫一遍，100 楼要 15ms）；all = 下次全部重查 */
  private dirty = new Set<Element>();
  private all = true;
  private prevLatest = -2;
  private mode: OptionMode;
  /** 内容容器上次写进去的源（没变就不重写——插件插进去的节点留着） */
  private readonly written = new WeakMap<Element, string>();
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

  private colors(): 'skin' | 'tavern' { return !this.o.skinColors || this.o.skinColors() ? 'skin' : 'tavern'; }

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
    this.observer = new win.MutationObserver((records) => { if (!this.busy) { this.note(records); this.schedule(); } });
    this.all = true;
    this.observer.observe(chat, { childList: true, subtree: true, characterData: true });
    try { win.addEventListener('storage', this.onStorage); } catch (e) { /* 没有 storage 事件 */ }
    this.scan();
  }

  /** 内容排版样式：设计系统 + 当前皮肤里的内容规则，改写后放进宿主文档 */
  private bodyStyle(): void {
    const doc = this.o.doc;
    let st = doc.getElementById(BODY_STYLE_ID);
    if (!st) { st = doc.createElement('style'); st.id = BODY_STYLE_ID; doc.head.appendChild(st); }
    const t = this.o.hub.texts();
    st.textContent = bodyCss(doc.defaultView as Window & typeof globalThis, [t.ds, t.skin]);
  }

  /** 外部事件（生成结束、切换回复、编辑完成……）或设置变了：重画一次 */
  refresh(): void {
    this.reloadMode();
    const c = this.colors();
    for (const s of this.surfaces.values()) { s.last = ''; if (s.surface) { s.surface.setAttribute('data-k-colors', c); } }
    this.all = true;
    this.schedule();
  }

  /** 某一楼的内容变了（流式片段、单条消息的编辑 / 切换回复事件）：只重查这一楼，不重画别的楼。id 省略 = 最后一楼 */
  touch(id?: number): void {
    const chat = this.o.chat();
    if (!chat) { return; }
    const n = typeof id === 'number' && id >= 0 ? id : this.o.count() - 1;
    const mes = chat.querySelector('.mes[mesid="' + n + '"]');
    if (mes) { this.dirty.add(mes); } else { this.all = true; }
    this.schedule();
  }

  /** 观察器的记录 → 变动的楼层 */
  private note(records: MutationRecord[]): void {
    if (this.all) { return; }
    for (const r of records) {
      const t = r.target.nodeType === 1 ? r.target as Element : r.target.parentElement;
      const mes = t && t.closest('.mes[mesid]');
      if (mes) { this.dirty.add(mes); continue; }
      /* 直接加在 #chat 上的楼层（新消息、重载） */
      for (const n of Array.from(r.addedNodes)) {
        if (n.nodeType !== 1) { continue; }
        const el = n as Element;
        if (el.matches('.mes[mesid]')) { this.dirty.add(el); } else { for (const m of Array.from(el.querySelectorAll('.mes[mesid]'))) { this.dirty.add(m); } }
      }
    }
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
    /* 最新一条换了（新回复、删除）：上一条的行动选项要收掉，全部重查 */
    if (latest !== this.prevLatest) { this.all = true; this.prevLatest = latest; }
    const list = this.all ? Array.from(chat.querySelectorAll('.mes[mesid]')) : Array.from(this.dirty).filter((m) => m.isConnected && chat.contains(m));
    this.all = false;
    this.dirty.clear();
    for (const mes of list) {
      const id = Number(mes.getAttribute('mesid'));
      const msg = this.o.getMessage(id);
      if (!msg || msg.isUser || msg.isSystem || mes.getAttribute('is_user') === 'true' || mes.getAttribute('is_system') === 'true') { continue; }
      const text = mes.querySelector('.mes_text') as HTMLElement | null;
      if (!text || !text.parentElement) { continue; }
      mes.setAttribute(MES_ATTR, '');
      const streaming = generating && id === lastId;
      const editing = !!text.querySelector('textarea');
      for (const th of Array.from(text.querySelectorAll('.TH-render'))) { const kd = thKind(th); if (kd) { th.setAttribute(HIDE_ATTR, kd); } }
      const reply = splitReply(msg.mes);
      this.think(mes, text, id, msg, streaming);
      this.search(text, id, reply.search, streaming && reply.searchPending);
      this.body(text, id, msg, reply.body ? reply.body.text : '', streaming, editing);
      this.options(text, id, id === latest ? reply.options : null, streaming);
    }
  }

  /* ───── 宿主：.mes_text 外面的几块，按「思维链 → 搜索资料 → .mes_text → 行动选项」的顺序 ───── */
  private hostFor(text: HTMLElement, kind: Kind): HTMLElement {
    const parent = text.parentElement!;
    let host = parent.querySelector(':scope > [' + HOST_ATTR + '="' + kind + '"]') as HTMLElement | null;
    if (!host) { host = this.o.doc.createElement('div'); host.setAttribute(HOST_ATTR, kind); }
    if (kind === 'options') { if (text.nextElementSibling !== host) { text.after(host); } }
    else {
      const search = kind === 'think' ? parent.querySelector(':scope > [' + HOST_ATTR + '="search"]') : null;
      const anchor = search || text;
      if (host.nextElementSibling !== anchor) { anchor.before(host); }
    }
    return host;
  }
  private dropKind(text: HTMLElement, kind: Kind): void {
    const host = text.parentElement!.querySelector(':scope > [' + HOST_ATTR + '="' + kind + '"]') as HTMLElement | null;
    if (host) { this.drop(host); }
  }

  /** 统一管线：把一段 Markdown 交给酒馆渲染、写进内容容器、加标记、排公式。返回 false = 拿不到酒馆的渲染 */
  private fill(box: Element, md: string, id: number, kind: string, reasoning = false): boolean {
    if (!this.o.format) { return false; }
    if (this.written.get(box) !== md) {
      const html = this.o.format(protectMath(md), { id, reasoning });
      if (html === null) { return false; }
      box.innerHTML = html;
      this.written.set(box, md);
    }
    box.setAttribute(TEXT_ATTR, kind);
    markBody(box);
    typesetTex(box);
    return true;
  }
  /** 宿主下某个 slot 的内容容器（宿主的子节点，页面 DOM） */
  private box(host: HTMLElement, slot: string, tag = 'div'): HTMLElement {
    let b = Array.from(host.children).find((c) => c.getAttribute('slot') === slot) as HTMLElement | undefined;
    if (!b) { b = this.o.doc.createElement(tag); b.setAttribute('slot', slot); host.appendChild(b); }
    return b;
  }

  /* ───── 思维链 ───── */
  private think(mes: Element, text: HTMLElement, id: number, msg: TavernMessage, streaming: boolean): void {
    const native = (msg.reasoning || '').trim();
    let src = native;
    let live = false;
    if (!src) { const t = takeTag(msg.mes, 'nyaruko_think'); if (t && t.text.trim()) { src = t.text.trim(); live = streaming && !t.closed; } }
    if (!src && streaming && this.o.liveThink) {
      const l = this.o.liveThink();
      if (l && (l.diverting || l.text)) { src = l.text; live = l.diverting; }
    }
    const details = mes.querySelector('.mes_reasoning_details');
    if (native && details) { mes.setAttribute(NATIVE_THINK, ''); } else { mes.removeAttribute(NATIVE_THINK); }
    if (!src && !live) { this.dropKind(text, 'think'); return; }
    const host = this.hostFor(text, 'think');
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
    const slotted = this.fill(this.box(host, 'content'), src, id, 'think', true);
    this.paint(host, 'think|' + src.length + ':' + src.slice(-48) + '|' + live + '|' + !!actions.edit + '|' + slotted,
      <MsgPart kind="think"><MsgThink text={src} streaming={live} actions={actions} slotted={slotted} {...(this.o.thinker ? { thinker: this.o.thinker } : {})} /></MsgPart>);
  }

  /* ───── 搜索资料：事实逐条走统一管线，来源是链接 ───── */
  private search(text: HTMLElement, id: number, records: SearchRecord[], pending: boolean): void {
    if (!records.length && !pending) { this.dropKind(text, 'search'); return; }
    const host = this.hostFor(text, 'search');
    const key = JSON.stringify(records);
    const box = this.box(host, 'content');
    let slotted = !!this.o.format;
    if (slotted && this.written.get(box) !== key) {
      const fmt = (s: string): string => this.o.format!(protectMath(s), { id }) ?? esc(s);
      box.innerHTML = records.map((r) => {
        const num = new Map(r.sources.map((s, i) => [s.id, i + 1]));
        const scope = r.world ? '<p data-k-part="scope">范围' + (r.origin === 'native' ? '（模型自带搜索）' : '') + '：' + esc(r.world) + '</p>' : '';
        const facts = r.facts.length
          ? '<ol data-k-part="facts">' + r.facts.map((f) => '<li data-k-part="fact">' + fmt(f.text) + f.source_ids.map((sid) => '<sup data-k-part="ref">[' + (num.get(sid) ?? '?') + ']</sup>').join('') + '</li>').join('') + '</ol>'
          : '<p data-k-part="status">' + (r.status === 'not_found' ? '本次没有找到可用资料。' : r.status === 'budget_exceeded' ? '资料超过本轮长度预算，未加入新事实。' : '本次没有需要补充的新事实。') + '</p>';
        const sources = r.sources.length
          ? '<ol data-k-part="sources">' + r.sources.map((s, i) => {
            const ok = /^https?:\/\//i.test(s.url);
            const title = esc(s.title || siteOf(s.url));
            return '<li data-k-part="source" value="' + (i + 1) + '">' + (ok ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>' : title) + ' <span>' + esc(siteOf(s.url)) + '</span></li>';
          }).join('') + '</ol>'
          : '';
        return '<div ' + TEXT_ATTR + '="search">' + scope + facts + sources + '</div>';
      }).join('');
      this.written.set(box, key);
      for (const c of Array.from(box.children)) { markBody(c); typesetTex(c); }
    }
    if (!this.o.format) { slotted = false; box.innerHTML = ''; }
    this.paint(host, 'search|' + key.length + '|' + pending + '|' + slotted,
      <MsgPart kind="search"><MsgSearch records={records} pending={pending} slotted={slotted} /></MsgPart>);
  }

  /* ───── 正文：.mes_text 本身当宿主 ───── */
  private body(text: HTMLElement, id: number, msg: TavernMessage, raw: string, streaming: boolean, editing: boolean): void {
    text.setAttribute(BODY_ATTR, '');
    if (!editing) {
      if (text.getAttribute(TEXT_ATTR) !== 'body') { text.setAttribute(TEXT_ATTR, 'body'); this.marked.delete(text); }
      const sig = text.childElementCount + ':' + (text.textContent || '').length;
      if (this.marked.get(text) !== sig) {
        markBody(text);
        typesetTex(text);
        this.marked.set(text, text.childElementCount + ':' + (text.textContent || '').length);
      }
    } else { text.removeAttribute(TEXT_ATTR); this.marked.delete(text); }
    const src = raw || msg.mes;
    this.paint(text, 'body|' + src.length + ':' + src.slice(-48) + '|' + streaming + '|' + editing,
      <MsgPart kind="body" editing={editing}><MsgBodyShell raw={src} streaming={streaming} copy={() => cleanCopyText(text)} /></MsgPart>, true);
  }

  /* ───── 行动选项（只有最新一条）：标题与内容逐个走统一管线 ───── */
  private options(text: HTMLElement, id: number, opts: { items: OptionItem[]; closed: boolean } | null, streaming: boolean): void {
    const pending = !!opts && streaming && !opts.closed;
    if (!opts || (!opts.items.length && !pending)) { this.dropKind(text, 'options'); return; }
    const host = this.hostFor(text, 'options');
    let slotted = !!this.o.format;
    if (slotted) {
      opts.items.forEach((it, i) => {
        const strip = (h: string): string => h.replace(/^\s*<p>([\s\S]*)<\/p>\s*$/, '$1');
        for (const [slot, md] of [['o' + i + '-label', it.title], ['o' + i + '-text', it.content]] as const) {
          const b = this.box(host, slot, 'span');
          if (this.written.get(b) !== md) {
            const h = this.o.format!(protectMath(md), { id });
            if (h === null) { slotted = false; continue; }
            b.innerHTML = strip(h);
            this.written.set(b, md);
          }
          b.setAttribute(TEXT_ATTR, 'option');
          markBody(b); typesetTex(b);
        }
      });
      /* 选项变少了：多出来的容器收掉 */
      for (const c of Array.from(host.children)) { const m = /^o(\d+)-/.exec(c.getAttribute('slot') || ''); if (m && Number(m[1]) >= opts.items.length) { c.remove(); } }
    }
    const open = this.optionsOpen();
    this.paint(host, 'options|' + JSON.stringify(opts.items).length + '|' + pending + '|' + this.mode + '|' + open + '|' + slotted,
      <MsgPart kind="options"><MsgOptions items={opts.items} pending={pending} mode={this.mode} onMode={(v) => this.setMode(v)} onPick={this.o.onPick} defaultOpen={open} slotted={slotted} /></MsgPart>);
  }

  private paint(host: HTMLElement, key: string, node: React.ReactNode, body = false): void {
    let s = this.surfaces.get(host);
    if (!s) {
      const m = mountSurface(host, this.o);
      const surface = m.shadow.querySelector('[data-k-surface]');
      if (surface) { surface.setAttribute('data-k-colors', this.colors()); }
      s = {
        host, surface, render: m.render, last: '', body,
        dispose: () => {
          try { m.root.unmount(); } catch (e) { /* 已卸载 */ }
          if (m.off) { m.off(); }
          m.detach();
          /* .mes_text 的影子树去不掉：只留一个空 slot，显示与没有影子树时一样 */
          if (body && host.shadowRoot) { host.shadowRoot.replaceChildren(host.ownerDocument.createElement('slot')); }
        }
      };
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

  /** 皮肤属性变化：同步到所有渲染面根、重建内容样式并重画 */
  refreshAttrs(): void {
    const a = this.o.attrs ? this.o.attrs() : {};
    const c = this.colors();
    for (const s of this.surfaces.values()) {
      if (s.surface) { for (const [n, v] of Object.entries(a)) { s.surface.setAttribute(n, v); } s.surface.setAttribute('data-k-colors', c); }
      s.last = '';
    }
    this.bodyStyle();
    this.all = true;
    this.scan();
  }

  get size(): number { return this.surfaces.size; }

  stop(): void {
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    try { this.o.doc.defaultView!.removeEventListener('storage', this.onStorage); } catch (e) { /* 已卸载 */ }
    for (const s of this.surfaces.values()) { s.dispose(); }
    this.surfaces.clear();
    const chat = this.o.chat();
    if (chat) {
      for (const el of Array.from(chat.querySelectorAll('.mes_text[' + TEXT_ATTR + ']'))) { unmarkBody(el); }
      for (const host of Array.from(chat.querySelectorAll('[' + HOST_ATTR + ']'))) { host.remove(); }
      for (const el of Array.from(chat.querySelectorAll('[' + HIDE_ATTR + ']'))) { el.removeAttribute(HIDE_ATTR); }
      for (const el of Array.from(chat.querySelectorAll('[' + NATIVE_THINK + '], [' + MES_ATTR + '], [' + BODY_ATTR + ']'))) {
        el.removeAttribute(NATIVE_THINK); el.removeAttribute(MES_ATTR); el.removeAttribute(BODY_ATTR);
      }
    }
    for (const sid of [STYLE_ID, BODY_STYLE_ID]) { const st = this.o.doc.getElementById(sid); if (st) { st.remove(); } }
  }
}
