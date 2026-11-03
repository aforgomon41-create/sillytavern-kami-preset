/**
 * 平台动效模块（前端契约 6.5）· 通用组：particles / glitch / ink / trace / scan / unroll。
 * 2026-11-01 为「世界观」皮肤系列补充（docs/世界观皮肤系列方案.md 第四节）。碎光的 fracture 仍在 fracture.ts。
 *
 * 触发时机与碎光一致：
 *   · open    面板 / 对话框 / 下拉弹出（data-state 变成 open，或带这些钩子的元素出现）
 *   · close   收起（data-state 变成 closed）
 *   · press   按下按钮、选择卡、开关、选项（触屏要是「点」而不是滑）
 *   · tab     切换页签
 *   · fold    折叠 / 展开（思维链、搜索资料、折叠卡）
 * 每个模块对这些时机各有自己的画法（见下面各函数）。皮肤在 skin.json 的 modules 里声明启用哪几个，
 * 参数都是 CSS 变量（写在 skin.css 的 [data-k-surface] 上），不写就用默认值：
 *   --k-fx-glow    主色（默认强调色）          --k-fx-alt     副色（故障的第二道、粒子的第二种颜色）
 *   --k-fx-size    粒子 / 墨点大小（px）        --k-fx-glyphs  粒子字符，空格分开（默认「·」；例如 "♥ ✦"）
 *   --k-fx-drift   粒子走向：out 迸开 / up 上升 / down 落下（默认 out）
 *   --k-fx-ink     墨色（默认正文色）           --k-fx-trace   描线起点：corner 从左上角绕一圈 / center 从中间向两端（默认 corner）
 *   --k-fx-dir     展开方向：down 卷轴从上往下 / right 从左往右（默认 down）
 * 性能与无障碍（契约第 10、13 节）：只动 transform / opacity；同时进行的动效有上限；同一元素 120ms 内不重复；
 * 动效「平静」只留最轻的一层（淡入淡出的光 / 线），「关闭」与系统「减少动态效果」时完全不播；所有监听挂在 Shadow DOM 根上，销毁时收回。
 */

import { SIGNATURES, SIGNATURE_IDS, type SignatureId } from './signature';

export type BaseMotifId = 'particles' | 'glitch' | 'ink' | 'trace' | 'scan' | 'unroll';
export type MotifId = BaseMotifId | SignatureId;
const BASE_IDS: readonly BaseMotifId[] = ['particles', 'glitch', 'ink', 'trace', 'scan', 'unroll'];
/** 通用组 + 招牌组（fx/signature.ts，每款皮肤一个专属动作） */
export const MOTIF_IDS: readonly MotifId[] = [...BASE_IDS, ...SIGNATURE_IDS];

export interface MotifOptions {
  /** 某个模块此刻是否启用（皮肤声明 + 特效开关） */
  enabled: (id: MotifId) => boolean;
  motion: () => 'full' | 'calm' | 'off';
}

export type Event = 'open' | 'close' | 'press' | 'tab' | 'fold-open' | 'fold-close';

const PRESS_SEL = '[data-k="button"]:not(:disabled), [data-k="icon-button"]:not(:disabled), [data-k="card"][data-role="choice"], [data-k="switch"], [data-k="checkbox"], [data-k="select"][data-k-part="trigger"], [data-k="segmented"] [data-k-part="item"], [data-k="msg-options"] > [data-k-part="fold"] > [data-k-part="list"] > li > [data-k-part="item"]';
const TAB_SEL = '[data-k="tabs"] [data-k-part="tab"]:not([data-disabled]), [data-k="nav"] [data-k-part="item"]';
const STATE_SEL = '[data-k="dialog"][data-k-part="content"], [data-k="select"][data-k-part="content"], [data-k="panel"]';
const FOLD_SEL = '[data-k="card"][data-role="collapse"], [data-k="msg-think"], [data-k="msg-search"], [data-k="msg-options"]';
const MAX_ACTIVE = 6;
const MAX_NODES = 90;
const TAP_SLOP = 10;

export interface Ctx {
  r: DOMRect; cs: CSSStyleDeclaration; calm: boolean; coarse: boolean; x: number; y: number;
  glow: string; alt: string; size: number;
}

/** 招牌动效拿到的工具：建节点（受总数上限约束）、播放并回收、定位、随机数 */
export interface Kit {
  node(tag?: string): HTMLElement | null;
  play(d: HTMLElement | null, frames: Keyframe[], opt: KeyframeAnimationOptions): Animation | null;
  box(d: HTMLElement, x: number, y: number, w: number, h: number): string;
  rnd(a: number, b: number): number;
  win: Window & typeof globalThis;
}

export class Motifs {
  private readonly layer: HTMLElement;
  private readonly win: Window & typeof globalThis;
  private readonly doc: Document;
  private readonly mo: MutationObserver;
  private readonly last = new WeakMap<Element, number>();
  private readonly coarse: boolean;
  private readonly reduce: boolean;
  private active = 0;
  private nodes = 0;
  private disposed = false;
  private pending: { id: number; x: number; y: number; t: number; target: Element } | null = null;
  private readonly kit: Kit;

  constructor(private readonly root: ShadowRoot, private readonly o: MotifOptions) {
    this.doc = root.ownerDocument;
    this.win = this.doc.defaultView as Window & typeof globalThis;
    this.coarse = !!this.win.matchMedia && this.win.matchMedia('(pointer: coarse)').matches;
    this.reduce = !!this.win.matchMedia && this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.kit = { node: (tag) => this.node(tag), play: (d, f, op) => this.play(d, f, op), box: (d, x, y, w, h) => this.box(d, x, y, w, h), rnd: (a, b) => this.rnd(a, b), win: this.win };
    this.layer = this.doc.createElement('div');
    this.layer.setAttribute('data-k-fx-layer', 'motifs');
    this.layer.setAttribute('aria-hidden', 'true');
    const ls = this.layer.style;
    ls.position = 'fixed'; ls.inset = '0'; ls.pointerEvents = 'none'; ls.overflow = 'hidden'; ls.contain = 'strict'; ls.zIndex = '2147483001';
    root.appendChild(this.layer);
    root.addEventListener('pointerdown', this.onDown, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('pointerup', this.onUp, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('pointercancel', this.onCancel, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('keydown', this.onKey, true);
    this.mo = new this.win.MutationObserver(this.onMutations);
    this.mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-state'], attributeOldValue: true, childList: true });
  }

  /* ───────── 事件接线（与 fracture 同一套判定） ───────── */

  private readonly onCancel = (): void => { this.pending = null; };
  private readonly onDown = (e: globalThis.Event): void => {
    const pe = e as PointerEvent;
    if (pe.button !== undefined && pe.button !== 0) { return; }
    const t = pe.composedPath()[0] as Element | undefined;
    if (!t || typeof t.closest !== 'function') { return; }
    if (pe.pointerType === 'touch') { this.pending = { id: pe.pointerId, x: pe.clientX, y: pe.clientY, t: this.win.performance.now(), target: t }; return; }
    this.pointer(t, pe.clientX, pe.clientY);
  };
  private readonly onUp = (e: globalThis.Event): void => {
    const pe = e as PointerEvent;
    const p = this.pending;
    this.pending = null;
    if (!p || p.id !== pe.pointerId) { return; }
    if (Math.hypot(pe.clientX - p.x, pe.clientY - p.y) > TAP_SLOP || this.win.performance.now() - p.t > 600) { return; }
    this.pointer(p.target, pe.clientX, pe.clientY);
  };
  private readonly onKey = (e: globalThis.Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') { return; }
    const t = ke.composedPath()[0] as Element | undefined;
    if (!t || typeof t.closest !== 'function') { return; }
    const r = t.getBoundingClientRect();
    this.pointer(t, r.left + r.width / 2, r.top + r.height / 2);
  };
  private pointer(t: Element, x: number, y: number): void {
    if (t.closest('[data-k-part="info"], [data-k="popover"]')) { return; }
    const tab = t.closest(TAB_SEL);
    if (tab) { this.fire('tab', tab, x, y); return; }
    const el = t.closest(PRESS_SEL);
    if (el) { this.fire('press', el, x, y); }
  }
  private readonly onMutations = (list: MutationRecord[]): void => {
    for (const m of list) {
      if (m.type === 'attributes') {
        const el = m.target as Element;
        const now = el.getAttribute('data-state');
        if (!el.matches || m.oldValue === now) { continue; }
        if (el.matches(FOLD_SEL)) {
          if ((now === 'open' || now === 'closed') && (m.oldValue === 'open' || m.oldValue === 'closed')) { this.fire(now === 'open' ? 'fold-open' : 'fold-close', el); }
          continue;
        }
        if (el.matches(STATE_SEL)) { this.fire(now === 'closed' ? 'close' : 'open', el); }
      } else {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) { return; }
          const el = n as Element;
          const hit = el.matches(STATE_SEL) ? el : el.querySelector(STATE_SEL);
          if (hit) { this.fire('open', hit); }
        });
      }
    }
  };

  /* ───────── 分发 ───────── */

  /** 手动触发（测试与预览用） */
  fire(ev: Event, el: Element, x?: number, y?: number): void {
    if (this.disposed) { return; }
    const ids = MOTIF_IDS.filter((id) => this.o.enabled(id));
    if (!ids.length) { return; }
    const motion = this.reduce ? 'off' : this.o.motion();
    if (motion === 'off') { return; }
    const now = this.win.performance.now();
    if ((this.last.get(el) || 0) > now - 120 && ev !== 'close') { return; }
    this.last.set(el, now);
    if (this.active >= MAX_ACTIVE) { return; }
    const r = ev === 'fold-open' ? this.unfolded(el) : el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > this.win.innerHeight) { return; }
    const cs = this.win.getComputedStyle(el);
    const v = (k: string): string => cs.getPropertyValue(k).trim();
    const glow = v('--k-fx-glow') || v('--k-accent') || '#7aa2f7';
    const c: Ctx = {
      r, cs, calm: motion === 'calm', coarse: this.coarse, x: x ?? r.left + r.width / 2, y: y ?? r.top + r.height / 2,
      glow, alt: v('--k-fx-alt') || glow, size: Math.max(2, parseFloat(v('--k-fx-size')) || 6) * (this.coarse ? 1.3 : 1)
    };
    for (const id of ids) {
      if ((BASE_IDS as readonly string[]).includes(id)) { this[id as BaseMotifId](ev, el, c); } else { SIGNATURES[id as SignatureId](ev, el, c, this.kit); }
    }
  }

  /* ───────── 小工具 ───────── */

  /** 折叠块展开那一刻内容还是 0 高（高度动画刚开始），量到的只有标题栏；
      这里按内容的自然高度（scrollHeight）推算展开后的框，特效铺满整块（画到视口底为止） */
  private unfolded(el: Element): DOMRect {
    const r = el.getBoundingClientRect();
    const fold = el.querySelector(':scope > [data-k-part="fold"]') || el.querySelector(':scope > [data-k-part="body"]');
    if (!fold) { return r; }
    const now = fold.getBoundingClientRect().height;
    let full = fold.scrollHeight;
    for (const c of Array.from(fold.children)) { full = Math.max(full, (c as HTMLElement).scrollHeight); }
    const extra = full - now;
    if (extra < 2) { return r; }
    const bottom = Math.min(r.bottom + extra, Math.max(r.bottom, this.win.innerHeight));
    return new DOMRect(r.left, r.top, r.width, bottom - r.top);
  }

  private node(tag = 'i'): HTMLElement | null {
    if (this.nodes >= MAX_NODES) { return null; }
    const d = this.doc.createElement(tag);
    const s = d.style;
    s.position = 'absolute'; s.left = '0'; s.top = '0'; s.willChange = 'transform, opacity'; s.pointerEvents = 'none';
    this.layer.appendChild(d);
    this.nodes++;
    return d;
  }
  /** 播放并在结束时回收；返回动画（拿不到节点时 null） */
  private play(d: HTMLElement | null, frames: Keyframe[], opt: KeyframeAnimationOptions): Animation | null {
    if (!d) { return null; }
    this.active++;
    const a = d.animate(frames, { easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both', ...opt });
    const done = (): void => { d.remove(); this.nodes--; this.active--; };
    a.onfinish = done; a.oncancel = done;
    return a;
  }
  private box(d: HTMLElement, x: number, y: number, w: number, h: number): string {
    d.style.width = w + 'px'; d.style.height = h + 'px';
    return 'translate(' + x + 'px,' + y + 'px)';
  }
  private readonly rnd = (a: number, b: number): number => a + Math.random() * (b - a);

  /* ───────── particles：字符粒子（爱心、星星、灵光、尘土、余烬、蒸汽…） ───────── */

  private particles(ev: Event, _el: Element, c: Ctx): void {
    if (c.calm || ev === 'close' || ev === 'fold-close') { return; }
    const glyphs = (c.cs.getPropertyValue('--k-fx-glyphs').trim().replace(/^["']|["']$/g, '') || '·').split(/\s+/).filter(Boolean);
    const drift = c.cs.getPropertyValue('--k-fx-drift').trim() || 'out';
    const { r } = c;
    const n = ev === 'press' ? (c.coarse ? 5 : 7) : ev === 'tab' ? 4 : (c.coarse ? 9 : 14);
    for (let i = 0; i < n; i++) {
      const d = this.node('b');
      if (!d) { return; }
      d.textContent = glyphs[i % glyphs.length]!;
      const s = d.style;
      const sz = c.size * this.rnd(1.6, 2.8);
      s.fontSize = sz + 'px'; s.lineHeight = '1'; s.color = i % 3 === 2 ? c.alt : c.glow; s.textShadow = '0 0 ' + Math.round(sz / 2) + 'px ' + c.glow; s.fontStyle = 'normal';
      /* 出发点：按下 = 按下点；其他 = 元素四边上随机一点（折叠展开 = 左边线） */
      let x0 = c.x, y0 = c.y;
      if (ev === 'open') { const t = Math.random(); const side = i % 4; x0 = side < 2 ? r.left + t * r.width : (side === 2 ? r.left : r.right); y0 = side === 0 ? r.top : side === 1 ? r.bottom : r.top + t * r.height; }
      if (ev === 'fold-open') { x0 = r.left + 8; y0 = r.top + this.rnd(0, Math.min(r.height, 240)); }
      if (ev === 'tab') { x0 = this.rnd(r.left, r.right); y0 = r.bottom; }
      const far = (ev === 'press' ? 26 : 46) * (c.coarse ? 0.8 : 1);
      let dx = 0, dy = 0;
      if (drift === 'up') { dx = this.rnd(-12, 12); dy = -this.rnd(far * 0.8, far * 1.8); }
      else if (drift === 'down') { dx = this.rnd(-10, 10); dy = this.rnd(far * 0.6, far * 1.4); }
      else { const a = Math.random() * Math.PI * 2; dx = Math.cos(a) * this.rnd(far * 0.5, far); dy = Math.sin(a) * this.rnd(far * 0.5, far) - (ev === 'press' ? 6 : 0); }
      const at = 'translate(' + (x0 - sz / 2) + 'px,' + (y0 - sz / 2) + 'px)';
      const to = 'translate(' + (x0 - sz / 2 + dx) + 'px,' + (y0 - sz / 2 + dy) + 'px)';
      const rot = this.rnd(-40, 40);
      this.play(d, [
        { transform: at + ' scale(.2) rotate(0deg)', opacity: 0 },
        { transform: at + ' scale(1) rotate(' + rot / 3 + 'deg)', opacity: 1, offset: 0.18 },
        { transform: to + ' scale(.7) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: this.rnd(620, drift === 'out' ? 820 : 1300), delay: i * (ev === 'open' ? 18 : 8) });
    }
  }

  /* ───────── glitch：几道错位的色条闪过（赛博） ───────── */

  private glitch(ev: Event, _el: Element, c: Ctx): void {
    const { r } = c;
    if (ev === 'tab') {
      const d = this.node(); if (!d) { return; }
      d.style.background = c.alt; d.style.mixBlendMode = 'screen';
      const at = this.box(d, r.left, r.bottom - 2, r.width, 2);
      this.play(d, [{ transform: at + ' translateX(-6px)', opacity: 1 }, { transform: at + ' translateX(4px)', opacity: 0.4, offset: 0.4 }, { transform: at, opacity: 0 }], { duration: 220, easing: 'steps(4, end)' });
      return;
    }
    if (c.calm) {
      const d = this.node(); if (!d) { return; }
      d.style.boxShadow = '0 0 0 1px ' + c.glow + ', 0 0 18px ' + c.glow;
      const at = this.box(d, r.left, r.top, r.width, r.height);
      this.play(d, [{ transform: at, opacity: 0 }, { transform: at, opacity: 0.8, offset: 0.3 }, { transform: at, opacity: 0 }], { duration: 260 });
      return;
    }
    const area = ev === 'press' ? { top: Math.max(r.top, c.y - 18), h: Math.min(36, r.height) } : { top: r.top, h: r.height };
    const n = ev === 'press' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const d = this.node(); if (!d) { return; }
      const h = this.rnd(2, Math.max(4, area.h / (n * 0.9)));
      const y = area.top + this.rnd(0, Math.max(1, area.h - h));
      d.style.background = i % 2 ? c.alt : c.glow; d.style.mixBlendMode = 'screen'; d.style.opacity = '0';
      const w = ev === 'press' ? Math.min(r.width, 120) : r.width;
      const x = ev === 'press' ? Math.max(r.left, Math.min(r.right - w, c.x - w / 2)) : r.left;
      const at = this.box(d, x, y, w, h);
      const j = this.rnd(6, 16) * (i % 2 ? -1 : 1);
      this.play(d, [
        { transform: at + ' translateX(' + j + 'px)', opacity: 0.85 },
        { transform: at + ' translateX(' + (-j / 2) + 'px)', opacity: 0.55, offset: 0.35 },
        { transform: at + ' translateX(' + (j / 3) + 'px)', opacity: 0.7, offset: 0.6 },
        { transform: at, opacity: 0 }
      ], { duration: this.rnd(180, 300), delay: i * 22, easing: 'steps(5, end)' });
    }
  }

  /* ───────── ink：墨晕扩散 + 溅墨（武侠、深渊） ───────── */

  private ink(ev: Event, _el: Element, c: Ctx): void {
    const { r } = c;
    const ink = c.cs.getPropertyValue('--k-fx-ink').trim() || c.cs.color || '#000';
    if (ev === 'tab') {
      const d = this.node(); if (!d) { return; }
      d.style.background = ink; d.style.borderRadius = '50%'; d.style.filter = 'blur(2px)';
      const at = this.box(d, r.left, r.bottom - 3, r.width, 3);
      this.play(d, [{ transform: at + ' scaleX(.05)', opacity: 0.9 }, { transform: at + ' scaleX(1)', opacity: 0.6, offset: 0.5 }, { transform: at, opacity: 0 }], { duration: 480 });
      return;
    }
    if (ev === 'close' || ev === 'fold-close') {
      if (c.calm) { return; }
      const d = this.node(); if (!d) { return; }
      const s = Math.min(Math.max(r.width, r.height), 520);
      d.style.background = 'radial-gradient(closest-side, ' + ink + ', transparent)'; d.style.borderRadius = '50%';
      const at = this.box(d, r.left + r.width / 2 - s / 2, r.top + r.height / 2 - s / 2, s, s);
      this.play(d, [{ transform: at + ' scale(1)', opacity: 0.16 }, { transform: at + ' scale(.2)', opacity: 0 }], { duration: 420 });
      return;
    }
    /* 晕开：一团模糊的墨从起点扩散再淡去 */
    const press = ev === 'press';
    const s = press ? Math.min(140, Math.max(60, r.height * 2.2)) : Math.min(Math.max(r.width, r.height) * 1.1, 640);
    const ox = press || ev === 'fold-open' ? (ev === 'fold-open' ? r.left + 10 : c.x) : r.left + r.width * 0.3;
    const oy = press ? c.y : ev === 'fold-open' ? r.top + 20 : r.top + r.height * 0.35;
    const d = this.node();
    if (d) {
      d.style.background = 'radial-gradient(closest-side, ' + ink + ' 0%, ' + ink + ' 35%, transparent 100%)';
      d.style.borderRadius = '47% 53% 41% 59% / 52% 44% 56% 48%';
      d.style.filter = 'blur(' + (press ? 4 : 10) + 'px)';
      const at = this.box(d, ox - s / 2, oy - s / 2, s, s);
      this.play(d, [{ transform: at + ' scale(.08) rotate(0deg)', opacity: c.calm ? 0.12 : 0.34 }, { transform: at + ' scale(1) rotate(20deg)', opacity: 0 }], { duration: c.calm ? 420 : (press ? 520 : 900), easing: 'cubic-bezier(.15,.6,.2,1)' });
    }
    if (c.calm) { return; }
    /* 溅墨：几颗墨点甩出去 */
    const n = press ? 6 : (ev === 'open' ? 9 : 4);
    for (let i = 0; i < n; i++) {
      const p = this.node(); if (!p) { return; }
      const sz = c.size * this.rnd(0.5, 1.4);
      p.style.background = ink; p.style.borderRadius = '50%';
      const a = Math.random() * Math.PI * 2, far = this.rnd(14, press ? 34 : 60);
      const at = this.box(p, ox - sz / 2, oy - sz / 2, sz, sz);
      this.play(p, [
        { transform: at + ' scale(.3)', opacity: 0.9 },
        { transform: at + ' translate(' + Math.cos(a) * far + 'px,' + Math.sin(a) * far + 'px) scale(1)', opacity: 0.8, offset: 0.5 },
        { transform: at + ' translate(' + Math.cos(a) * far * 1.08 + 'px,' + (Math.sin(a) * far * 1.08 + 4) + 'px) scale(.9)', opacity: 0 }
      ], { duration: this.rnd(420, 640), delay: i * 14 });
    }
  }

  /* ───────── trace：线条描出边框（高科技、古典金线、军事） ───────── */

  private trace(ev: Event, _el: Element, c: Ctx): void {
    const { r } = c;
    const center = c.cs.getPropertyValue('--k-fx-trace').trim() === 'center';
    const line = (x: number, y: number, w: number, h: number, origin: string, delay: number, dur: number): void => {
      const d = this.node(); if (!d) { return; }
      d.style.background = c.glow; d.style.boxShadow = '0 0 6px ' + c.glow; d.style.transformOrigin = origin;
      const at = this.box(d, x, y, w, h);
      const sc = w > h ? 'scaleX' : 'scaleY';
      this.play(d, [{ transform: at + ' ' + sc + '(0)', opacity: 1 }, { transform: at + ' ' + sc + '(1)', opacity: 1, offset: 0.6 }, { transform: at + ' ' + sc + '(1)', opacity: 0 }], { duration: dur, delay });
    };
    if (ev === 'tab') { line(r.left, r.bottom - 2, r.width, 2, center ? '50% 50%' : '0 50%', 0, 360); return; }
    if (ev === 'press') {
      /* 按下：四个角标一闪（HUD 括号） */
      const k = Math.min(10, r.width / 4, r.height / 3);
      const pts: Array<[number, number, number, number]> = [[r.left, r.top, k, 1.5], [r.left, r.top, 1.5, k], [r.right - k, r.bottom - 1.5, k, 1.5], [r.right - 1.5, r.bottom - k, 1.5, k]];
      for (const [x, y, w, h] of pts) {
        const d = this.node(); if (!d) { return; }
        d.style.background = c.glow;
        const at = this.box(d, x, y, w, h);
        this.play(d, [{ transform: at, opacity: 0 }, { transform: at, opacity: 1, offset: 0.25 }, { transform: at, opacity: 0 }], { duration: 300 });
      }
      return;
    }
    if (ev === 'fold-open' || ev === 'fold-close') { line(r.left, r.top, 1.5, Math.min(r.height, 400), ev === 'fold-open' ? '50% 0' : '50% 100%', 0, 420); return; }
    if (ev === 'close') { if (!c.calm) { line(r.left, r.top + r.height / 2, r.width, 1, '50% 50%', 0, 260); } return; }
    const dur = c.calm ? 380 : 620;
    if (center) {
      line(r.left, r.top, r.width, 1.5, '50% 50%', 0, dur);
      line(r.left, r.bottom - 1.5, r.width, 1.5, '50% 50%', 0, dur);
      return;
    }
    const step = dur * 0.22;
    line(r.left, r.top, r.width, 1.5, '0 50%', 0, dur);
    line(r.right - 1.5, r.top, 1.5, r.height, '50% 0', step, dur);
    line(r.left, r.bottom - 1.5, r.width, 1.5, '100% 50%', step * 2, dur);
    line(r.left, r.top, 1.5, r.height, '50% 100%', step * 3, dur);
  }

  /* ───────── scan：扫描光带 / 雷达波纹（异世界系统窗、军事、暗巷的百叶窗光） ───────── */

  private scan(ev: Event, _el: Element, c: Ctx): void {
    const { r } = c;
    if (ev === 'press') {
      if (c.calm) { return; }
      const d = this.node(); if (!d) { return; }
      const s = Math.min(120, Math.max(48, r.height * 1.6));
      d.style.border = '1.5px solid ' + c.glow; d.style.borderRadius = '50%';
      const at = this.box(d, c.x - s / 2, c.y - s / 2, s, s);
      this.play(d, [{ transform: at + ' scale(.1)', opacity: 0.9 }, { transform: at + ' scale(1)', opacity: 0 }], { duration: 520 });
      return;
    }
    if (ev === 'close' || ev === 'fold-close') { return; }
    const d = this.node(); if (!d) { return; }
    const band = ev === 'tab' ? r.width : Math.max(18, Math.min(70, r.height * 0.18));
    if (ev === 'tab') {
      d.style.background = 'linear-gradient(90deg, transparent, ' + c.glow + ', transparent)';
      const at = this.box(d, r.left, r.top, r.width * 0.5, r.height);
      this.play(d, [{ transform: at + ' translateX(-60%)', opacity: 0 }, { transform: at + ' translateX(60%)', opacity: 0.45, offset: 0.5 }, { transform: at + ' translateX(160%)', opacity: 0 }], { duration: 420 });
      return;
    }
    d.style.background = 'linear-gradient(180deg, transparent, ' + c.glow + ' 85%, transparent)'; d.style.mixBlendMode = 'screen';
    const h = ev === 'fold-open' ? Math.min(r.height, 400) : r.height;
    const at = this.box(d, r.left, r.top - band, r.width, band);
    this.play(d, [{ transform: at, opacity: 0 }, { transform: at + ' translateY(' + band + 'px)', opacity: c.calm ? 0.25 : 0.5, offset: 0.12 }, { transform: at + ' translateY(' + (h + band) + 'px)', opacity: 0 }], { duration: c.calm ? 420 : Math.min(900, 380 + h * 0.8), easing: 'cubic-bezier(.4,0,.6,1)' });
  }

  /* ───────── unroll：卷轴 / 奏折 / 文件夹展开（盖在上面的一层底色往一个方向收走，前沿一道轴线） ───────── */

  private unroll(ev: Event, el: Element, c: Ctx): void {
    if (c.calm || ev === 'press' || ev === 'tab' || ev === 'fold-close' || ev === 'fold-open') { return; }
    const { r } = c;
    const bg = c.cs.backgroundColor && c.cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? c.cs.backgroundColor : (this.win.getComputedStyle(el.closest('[data-k-level]') || el).backgroundColor || '#000');
    const right = (c.cs.getPropertyValue('--k-fx-dir').trim() || 'down') === 'right';
    const open = ev === 'open';
    const cover = this.node();
    const rod = this.node();
    const dur = 560;
    if (cover) {
      cover.style.background = bg; cover.style.borderRadius = c.cs.borderTopLeftRadius; cover.style.transformOrigin = right ? '100% 50%' : '50% 100%';
      const at = this.box(cover, r.left, r.top, r.width, r.height);
      const s = right ? 'scaleX' : 'scaleY';
      this.play(cover, open ? [{ transform: at + ' ' + s + '(1)', opacity: 1 }, { transform: at + ' ' + s + '(0)', opacity: 1 }] : [{ transform: at + ' ' + s + '(0)', opacity: 0.9 }, { transform: at + ' ' + s + '(1)', opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.5,.05,.2,1)' });
    }
    if (rod) {
      const t = 6;
      rod.style.background = 'linear-gradient(' + (right ? '90deg' : '180deg') + ', transparent, ' + c.glow + ', transparent)';
      rod.style.boxShadow = '0 0 10px ' + c.glow;
      const at = right ? this.box(rod, r.left - t / 2, r.top, t, r.height) : this.box(rod, r.left, r.top - t / 2, r.width, t);
      const move = right ? 'translateX(' + r.width + 'px)' : 'translateY(' + r.height + 'px)';
      this.play(rod, open ? [{ transform: at, opacity: 1 }, { transform: at + ' ' + move, opacity: 0.8, offset: 0.92 }, { transform: at + ' ' + move, opacity: 0 }] : [{ transform: at + ' ' + move, opacity: 0.8 }, { transform: at, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.5,.05,.2,1)' });
    }
  }

  get busy(): number { return this.active; }

  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.root.removeEventListener('pointerdown', this.onDown, true);
    this.root.removeEventListener('pointerup', this.onUp, true);
    this.root.removeEventListener('pointercancel', this.onCancel, true);
    this.root.removeEventListener('keydown', this.onKey, true);
    this.mo.disconnect();
    this.layer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.layer.remove();
  }
}
