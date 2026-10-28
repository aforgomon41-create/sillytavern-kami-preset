/**
 * 平台动效模块「碎裂溢光」（fracture）。动效语义（用户 2026-10-27 确认）：
 *   · 打开 / 展开 / 弹出：碎块从外侧**聚合**成边（assemble）
 *   · 关闭 / 收起：边**碎散**（shatter）
 *   · 按下：只在按下点附近**局部**碎裂（local）；手机上同时轻震一下（支持时）
 *   · 切换页签：一道光沿底边**扫过**（sweep），不碎
 *   · 高频操作（打字、滚动、拖滑杆）不触发
 * ------------------------------------------------------------------
 * 皮肤只声明启用（skin.json → modules: ["fracture"]，并由特效开关 fracture 控制），参数用 CSS 变量调：
 *   --k-fx-size      碎块边长（px，默认 6）
 *   --k-fx-glow      溢光颜色（默认 var(--k-accent)）
 *   --k-fx-strength  溢光强度 0~1（默认 .7）
 *   --k-fx-spread    碎块飞散距离（px，默认 18）
 * 性能约束（前端契约第 13 节）：
 *   · 碎块来自预先建好的元素池（上限 POOL），重复使用；一次爆裂最多 MAX_BURST 块，手机上更少更大
 *   · 只动 transform 与 opacity（交给合成器），用 Web Animations，不跑逐帧 JS
 *   · 同一元素 120ms 内不重复触发；同时进行的爆裂有上限；动效「平静」只留溢光，「关闭」与系统减少动态效果时完全不播
 *   · 所有监听挂在 Shadow DOM 根上（事件委托），销毁时一并移除
 */

const POOL = 72;
const MAX_BURST = 28;
const MAX_ACTIVE = 4;
/** 触屏判定为「点击」的最大移动距离（px） */
const TAP_SLOP = 10;

/** 触发：按下这些组件 */
const PRESS_SEL = '[data-k="button"]:not(:disabled), [data-k="icon-button"]:not(:disabled), [data-k="card"][data-role="choice"], [data-k="switch"], [data-k="checkbox"], [data-k="select"][data-k-part="trigger"]';
const TAB_SEL = '[data-k="tabs"] [data-k-part="tab"]:not([data-disabled])';
/** 触发：这些元素的 data-state 变化（展开 / 收起、弹出） */
const STATE_SEL = '[data-k="card"][data-role="collapse"], [data-k="dialog"][data-k-part="content"], [data-k="select"][data-k-part="content"], [data-k="panel"]';

export type BurstKind = 'local' | 'assemble' | 'shatter';

export interface FractureOptions {
  /** 是否启用（皮肤声明 + 特效开关），可随时改 */
  enabled: () => boolean;
  /** 动效设置：full 全部；calm 只留溢光；off 不播 */
  motion: () => 'full' | 'calm' | 'off';
}

interface Burst { done: number }

export class Fracture {
  private readonly root: ShadowRoot;
  private readonly layer: HTMLElement;
  private readonly pool: HTMLElement[] = [];
  private readonly glows: HTMLElement[] = [];
  private free: HTMLElement[] = [];
  private freeGlows: HTMLElement[] = [];
  private active: Burst[] = [];
  private readonly last = new WeakMap<Element, number>();
  private readonly mo: MutationObserver;
  private readonly coarse: boolean;
  private readonly reduce: boolean;
  private disposed = false;

  constructor(root: ShadowRoot, private readonly o: FractureOptions) {
    this.root = root;
    const doc = root.ownerDocument;
    const win = doc.defaultView as Window & typeof globalThis;
    this.coarse = !!win.matchMedia && win.matchMedia('(pointer: coarse)').matches;
    this.reduce = !!win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.layer = doc.createElement('div');
    this.layer.setAttribute('data-k-fx-layer', '');
    this.layer.setAttribute('aria-hidden', 'true');
    /* 动效层：固定铺满、不拦点击、独立合成，不影响排版 */
    const ls = this.layer.style;
    ls.position = 'fixed'; ls.inset = '0'; ls.pointerEvents = 'none'; ls.overflow = 'hidden'; ls.contain = 'strict'; ls.zIndex = '2147483000';
    for (let i = 0; i < POOL; i++) {
      const d = doc.createElement('i');
      const s = d.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.display = 'none'; s.willChange = 'auto';
      this.pool.push(d); this.layer.appendChild(d);
    }
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const g = doc.createElement('b');
      const s = g.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.display = 'none'; s.borderRadius = 'inherit';
      this.glows.push(g); this.layer.appendChild(g);
    }
    this.free = this.pool.slice();
    this.freeGlows = this.glows.slice();
    root.appendChild(this.layer);
    root.addEventListener('pointerdown', this.onDown, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('pointerup', this.onUp, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('pointercancel', this.onCancel, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('keydown', this.onKey, true);
    this.mo = new win.MutationObserver(this.onMutations);
    this.mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-state'], attributeOldValue: true, childList: true });
  }

  /* 触屏：按下时只记下来，抬起时才判定。手指移动超过 TAP_SLOP、按太久、或浏览器判定为滚动（pointercancel）都不算点击——
     用户只是在滑动面板，碰到按钮不应该碎（用户 2026-10-28 反馈）。鼠标 / 触控笔仍然按下即触发，保持跟手。 */
  private pending: { id: number; x: number; y: number; t: number; target: Element } | null = null;
  private readonly onCancel = (): void => { this.pending = null; };
  private readonly onUp = (e: Event): void => {
    const pe = e as PointerEvent;
    const p = this.pending;
    this.pending = null;
    if (!p || p.id !== pe.pointerId) { return; }
    if (Math.hypot(pe.clientX - p.x, pe.clientY - p.y) > TAP_SLOP || performance.now() - p.t > 600) { return; }
    this.trigger(p.target, pe.clientX, pe.clientY);
  };

  private readonly onDown = (e: Event): void => {
    const pe = e as PointerEvent;
    if (pe.button !== undefined && pe.button !== 0) { return; }
    if (pe.pointerType === 'touch') {
      const t0 = pe.composedPath()[0] as Element | undefined;
      this.pending = t0 && typeof t0.closest === 'function' ? { id: pe.pointerId, x: pe.clientX, y: pe.clientY, t: performance.now(), target: t0 } : null;
      return;
    }
    this.trigger(pe.composedPath()[0] as Element | undefined, pe.clientX, pe.clientY);
  };

  private trigger(t: Element | undefined, x: number, y: number): void {
    if (!t || !t.closest) { return; }
    if (t.closest('[data-k-part="info"], [data-k="popover"]')) { return; }   /* 点说明按钮不算按下卡片 */
    const tab = t.closest(TAB_SEL);
    if (tab) { this.sweep(tab); return; }
    const el = t.closest(PRESS_SEL);
    if (el) { this.burst(el, 'local', x, y); this.haptic(); }
  };

  private readonly onKey = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') { return; }
    const t = ke.composedPath()[0] as Element | undefined;
    if (!t || !t.closest) { return; }
    const tab = t.closest(TAB_SEL);
    if (tab) { this.sweep(tab); return; }
    const el = t.closest(PRESS_SEL);
    if (el) { const r = el.getBoundingClientRect(); this.burst(el, 'local', r.left + r.width / 2, r.top + r.height / 2); }
  };

  private readonly onMutations = (list: MutationRecord[]): void => {
    for (const m of list) {
      if (m.type === 'attributes') {
        const el = m.target as Element;
        const now = el.getAttribute('data-state');
        if (el.matches && el.matches(STATE_SEL) && m.oldValue !== now) { this.burst(el, now === 'closed' ? 'shatter' : 'assemble'); }
      } else {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) { return; }
          const el = n as Element;
          const hit = el.matches(STATE_SEL) ? el : el.querySelector(STATE_SEL);
          if (hit) { this.burst(hit, 'assemble'); }
        });
      }
    }
  };

  /** 手机上按下时轻震一下（浏览器支持且动效未关闭时） */
  private haptic(): void {
    if (!this.coarse || this.reduce || this.o.motion() !== 'full' || !this.o.enabled()) { return; }
    try { const nav = (this.root.ownerDocument.defaultView as Window).navigator; if (nav.vibrate) { nav.vibrate(8); } } catch (e) { /* 不支持 */ }
  }

  /** 页签：一道光沿底边扫过（不碎） */
  sweep(el: Element): void {
    if (this.disposed || !this.o.enabled()) { return; }
    const motion = this.reduce ? 'off' : this.o.motion();
    if (motion === 'off' || this.active.length >= MAX_ACTIVE) { return; }
    const r = el.getBoundingClientRect();
    if (r.width < 4) { return; }
    const cs = getComputedStyle(el);
    const glow = cs.getPropertyValue('--k-fx-glow').trim() || cs.getPropertyValue('--k-accent').trim() || '#7aa2f7';
    const g = this.freeGlows.pop();
    if (!g) { return; }
    const b: Burst = { done: 0 };
    this.active.push(b);
    const gs = g.style;
    gs.display = 'block'; gs.width = r.width + 'px'; gs.height = '2px'; gs.borderRadius = '2px';
    gs.background = glow; gs.boxShadow = '0 0 12px 2px ' + glow; gs.transformOrigin = '0 50%';
    const tr = 'translate(' + r.left + 'px,' + (r.bottom - 2) + 'px)';
    const a = g.animate([
      { transform: tr + ' scaleX(0)', opacity: 0.2 },
      { transform: tr + ' scaleX(1)', opacity: 1, offset: 0.55 },
      { transform: tr + ' scaleX(1)', opacity: 0 }
    ], { duration: motion === 'calm' ? 260 : 420, easing: 'cubic-bezier(.2,.7,.3,1)' });
    a.onfinish = a.oncancel = (): void => { gs.display = 'none'; gs.background = ''; gs.height = ''; this.freeGlows.push(g); this.active = this.active.filter((x) => x !== b); };
  }

  /** 在元素四周爆裂。local：只碎按下点附近；assemble：碎块从外侧聚合成边；shatter：整圈碎散 */
  burst(el: Element, kind: BurstKind = 'shatter', x?: number, y?: number): void {
    if (this.disposed || !this.o.enabled()) { return; }
    const motion = this.reduce ? 'off' : this.o.motion();
    if (motion === 'off') { return; }
    const now = performance.now();
    if ((this.last.get(el) || 0) > now - 120) { return; }
    this.last.set(el, now);
    if (this.active.length >= MAX_ACTIVE) { return; }
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) { return; }

    const cs = getComputedStyle(el);
    const num = (v: string, d: number): number => { const n = parseFloat(v); return isFinite(n) ? n : d; };
    const size = Math.max(3, num(cs.getPropertyValue('--k-fx-size'), 6)) * (this.coarse ? 1.5 : 1);
    const glow = cs.getPropertyValue('--k-fx-glow').trim() || cs.getPropertyValue('--k-accent').trim() || '#7aa2f7';
    const strength = Math.min(1, Math.max(0, num(cs.getPropertyValue('--k-fx-strength'), 0.7)));
    const spread = num(cs.getPropertyValue('--k-fx-spread'), 18) * (this.coarse ? 0.8 : 1);
    const edge = cs.borderTopColor && cs.borderTopColor !== 'rgba(0, 0, 0, 0)' ? cs.borderTopColor : (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : glow);
    const radius = cs.borderTopLeftRadius;
    let total = 1;
    const b: Burst = { done: 0 };
    this.active.push(b);
    el.setAttribute('data-k-fx', 'active');
    const finish = (): void => {
      b.done++;
      if (b.done >= total) {
        this.active = this.active.filter((x) => x !== b);
        if (el.getAttribute('data-k-fx') === 'active') { el.removeAttribute('data-k-fx'); }
      }
    };

    /* 溢光：一个与元素同形的发光框，淡入后淡出（只动 opacity / transform） */
    const g = this.freeGlows.pop() as HTMLElement;
    const gs = g.style;
    gs.background = ''; gs.transformOrigin = '';
    gs.display = 'block'; gs.width = r.width + 'px'; gs.height = r.height + 'px';
    gs.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
    gs.borderRadius = radius; gs.boxShadow = '0 0 ' + Math.round(16 + 26 * strength) + 'px ' + Math.round(3 + 7 * strength) + 'px ' + glow + ', inset 0 0 ' + Math.round(8 + 12 * strength) + 'px ' + glow;
    /* 聚合：光在碎块合拢时最亮；碎散 / 局部：一开始就亮 */
    const peak = kind === 'assemble' ? 0.6 : 0.2;
    const ga = g.animate([{ opacity: 0 }, { opacity: Math.min(1, strength * 1.15), offset: peak }, { opacity: strength * 0.5, offset: Math.min(0.85, peak + 0.3) }, { opacity: 0 }], { duration: motion === 'calm' ? 380 : 640, easing: 'ease-out' });
    ga.onfinish = ga.oncancel = (): void => { gs.display = 'none'; this.freeGlows.push(g); finish(); };
    if (motion === 'calm') { return; }

    /* 碎块：沿四条边按周长均匀取点，数量按周长与设备调整 */
    const perim = 2 * (r.width + r.height);
    let want = Math.min(MAX_BURST * (this.coarse ? 0.65 : 1), Math.max(10, Math.round(perim / (size * 4.5))), this.free.length) | 0;
    const cx = x ?? r.left + r.width / 2, cy = y ?? r.top + r.height / 2;
    /* 局部：只取离按下点最近的一段边（约 1/3 周长），碎块也少一些 */
    const localR = Math.max(48, Math.min(r.width, r.height) * 1.2, perim * 0.12);
    if (kind === 'local') { want = Math.max(6, Math.round(want * 0.55)); }

    let made = 0;
    for (let i = 0, tries = 0; made < want && tries < want * 6; tries++, i++) {
      const p = kind === 'local' ? Math.random() * perim : ((i + Math.random() * 0.6) / want) * perim;
      let px: number, py: number, nx: number, ny: number;
      if (p < r.width) { px = r.left + p; py = r.top; nx = 0; ny = -1; }
      else if (p < r.width + r.height) { px = r.right; py = r.top + (p - r.width); nx = 1; ny = 0; }
      else if (p < 2 * r.width + r.height) { px = r.right - (p - r.width - r.height); py = r.bottom; nx = 0; ny = 1; }
      else { px = r.left; py = r.bottom - (p - 2 * r.width - r.height); nx = -1; ny = 0; }
      const dist = Math.hypot(px - cx, py - cy);
      if (kind === 'local' && dist > localR) { continue; }
      const d = this.free.pop() as HTMLElement;
      made++;
      const near = 1 - Math.min(1, dist / Math.max(r.width, r.height));
      const fly = spread * (0.5 + Math.random() * 0.7 + near * 0.6);
      const dx = nx * fly + (Math.random() - 0.5) * spread * 0.6, dy = ny * fly + (Math.random() - 0.5) * spread * 0.6;
      const s = size * (0.7 + Math.random() * 0.7);
      const ds = d.style;
      ds.display = 'block'; ds.width = s + 'px'; ds.height = s + 'px'; ds.background = edge;
      ds.boxShadow = '0 0 ' + Math.round(6 + 10 * strength) + 'px ' + Math.round(1 + 2 * strength) + 'px ' + glow;
      ds.willChange = 'transform, opacity';
      const x0 = px - s / 2, y0 = py - s / 2;
      const at = 'translate(' + x0 + 'px,' + y0 + 'px)';
      const out = 'translate(' + (x0 + dx) + 'px,' + (y0 + dy) + 'px) rotate(' + ((Math.random() - 0.5) * 140) + 'deg) scale(.3)';
      const frames = kind === 'assemble'
        /* 聚合：从外侧带着光飞回来、在边上停一瞬、再淡去（交还给真实的边线） */
        ? [{ transform: out, opacity: 0 }, { transform: at + ' rotate(0deg) scale(1)', opacity: 1, offset: 0.6 }, { transform: at + ' rotate(0deg) scale(1)', opacity: 0 }]
        /* 碎散 / 局部：先在边缘停一瞬（看得见「裂开的边」），再飞散、旋转、缩小、淡出 */
        : [{ transform: at + ' rotate(0deg) scale(1)', opacity: 1 }, { transform: at + ' rotate(0deg) scale(1.05)', opacity: 1, offset: 0.16 }, { transform: out, opacity: 0 }];
      const a = d.animate(frames, { duration: 460 + Math.random() * 220 + near * 80, delay: kind === 'assemble' ? Math.random() * 60 : (1 - near) * 50, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
      total++;
      a.onfinish = a.oncancel = (): void => { ds.display = 'none'; ds.willChange = 'auto'; this.free.push(d); finish(); };
    }
  }

  /** 当前正在进行的爆裂数（测试与排障用） */
  get busy(): number { return this.active.length; }

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
