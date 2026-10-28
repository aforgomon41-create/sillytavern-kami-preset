/**
 * 平台动效模块「碎裂溢光」（fracture）：组件被按下、展开 / 收起、弹出时，边缘碎成方块飞散，碎块背后透出强调色的光。
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

/** 触发：按下这些组件 */
const PRESS_SEL = '[data-k="button"]:not(:disabled), [data-k="icon-button"]:not(:disabled), [data-k="card"][data-role="choice"], [data-k="switch"], [data-k="checkbox"], [data-k="tabs"] [data-k-part="tab"], [data-k="select"][data-k-part="trigger"], [data-k="card"][data-role="collapse"] > [data-k-part="head"]';
/** 触发：这些元素的 data-state 变化（展开 / 收起、弹出） */
const STATE_SEL = '[data-k="card"][data-role="collapse"], [data-k="dialog"][data-k-part="content"], [data-k="select"][data-k-part="content"], [data-k="panel"]';

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
    root.appendChild(this.layer);
    root.addEventListener('pointerdown', this.onDown, { capture: true, passive: true } as AddEventListenerOptions);
    root.addEventListener('keydown', this.onKey, true);
    this.mo = new win.MutationObserver(this.onMutations);
    this.mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-state'], attributeOldValue: true, childList: true });
  }

  private readonly onDown = (e: Event): void => {
    const pe = e as PointerEvent;
    if (pe.button !== undefined && pe.button !== 0) { return; }
    const t = (pe.composedPath()[0] as Element | undefined);
    const el = t && t.closest ? t.closest(PRESS_SEL) : null;
    if (el) { this.burst(el, pe.clientX, pe.clientY); }
  };

  private readonly onKey = (e: Event): void => {
    const ke = e as KeyboardEvent;
    if (ke.key !== 'Enter' && ke.key !== ' ') { return; }
    const t = ke.composedPath()[0] as Element | undefined;
    const el = t && t.closest ? t.closest(PRESS_SEL) : null;
    if (el) { const r = el.getBoundingClientRect(); this.burst(el, r.left + r.width / 2, r.top + r.height / 2); }
  };

  private readonly onMutations = (list: MutationRecord[]): void => {
    for (const m of list) {
      if (m.type === 'attributes') {
        const el = m.target as Element;
        if (el.matches && el.matches(STATE_SEL) && m.oldValue !== el.getAttribute('data-state')) { this.burst(el); }
      } else {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) { return; }
          const el = n as Element;
          const hit = el.matches(STATE_SEL) ? el : el.querySelector(STATE_SEL);
          if (hit) { this.burst(hit); }
        });
      }
    }
  };

  /** 在元素四周爆裂；给了 (x, y) 就让离按下点近的碎块先飞、飞得更远 */
  burst(el: Element, x?: number, y?: number): void {
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
    const g = this.glows[this.active.length - 1] as HTMLElement;
    const gs = g.style;
    gs.display = 'block'; gs.width = r.width + 'px'; gs.height = r.height + 'px';
    gs.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
    gs.borderRadius = radius; gs.boxShadow = '0 0 ' + Math.round(16 + 26 * strength) + 'px ' + Math.round(3 + 7 * strength) + 'px ' + glow + ', inset 0 0 ' + Math.round(8 + 12 * strength) + 'px ' + glow;
    const ga = g.animate([{ opacity: 0 }, { opacity: Math.min(1, strength * 1.15), offset: 0.2 }, { opacity: strength * 0.6, offset: 0.55 }, { opacity: 0 }], { duration: motion === 'calm' ? 380 : 640, easing: 'ease-out' });
    ga.onfinish = ga.oncancel = (): void => { gs.display = 'none'; finish(); };
    if (motion === 'calm') { return; }

    /* 碎块：沿四条边按周长均匀取点，数量按周长与设备调整 */
    const perim = 2 * (r.width + r.height);
    const want = Math.min(MAX_BURST * (this.coarse ? 0.65 : 1), Math.max(10, Math.round(perim / (size * 4.5))), this.free.length) | 0;
    const cx = x ?? r.left + r.width / 2, cy = y ?? r.top + r.height / 2;
    total += want;
    for (let i = 0; i < want; i++) {
      const d = this.free.pop() as HTMLElement;
      const p = ((i + Math.random() * 0.6) / want) * perim;
      let px: number, py: number, nx: number, ny: number;
      if (p < r.width) { px = r.left + p; py = r.top; nx = 0; ny = -1; }
      else if (p < r.width + r.height) { px = r.right; py = r.top + (p - r.width); nx = 1; ny = 0; }
      else if (p < 2 * r.width + r.height) { px = r.right - (p - r.width - r.height); py = r.bottom; nx = 0; ny = 1; }
      else { px = r.left; py = r.bottom - (p - 2 * r.width - r.height); nx = -1; ny = 0; }
      const dist = Math.hypot(px - cx, py - cy);
      const near = 1 - Math.min(1, dist / Math.max(r.width, r.height));
      const fly = spread * (0.5 + Math.random() * 0.7 + near * 0.6);
      const dx = nx * fly + (Math.random() - 0.5) * spread * 0.6, dy = ny * fly + (Math.random() - 0.5) * spread * 0.6;
      const s = size * (0.7 + Math.random() * 0.7);
      const ds = d.style;
      ds.display = 'block'; ds.width = s + 'px'; ds.height = s + 'px'; ds.background = edge;
      ds.boxShadow = '0 0 ' + Math.round(6 + 10 * strength) + 'px ' + Math.round(1 + 2 * strength) + 'px ' + glow;
      ds.willChange = 'transform, opacity';
      const x0 = px - s / 2, y0 = py - s / 2;
      /* 两段：先在边缘停一瞬（看得见「裂开的边」），再带着光飞散、旋转、缩小、淡出 */
      const from = 'translate(' + x0 + 'px,' + y0 + 'px)';
      const a = d.animate([
        { transform: from + ' rotate(0deg) scale(1)', opacity: 1 },
        { transform: from + ' rotate(0deg) scale(1.05)', opacity: 1, offset: 0.16 },
        { transform: 'translate(' + (x0 + dx) + 'px,' + (y0 + dy) + 'px) rotate(' + ((Math.random() - 0.5) * 140) + 'deg) scale(.3)', opacity: 0 }
      ], { duration: 460 + Math.random() * 220 + near * 80, delay: (1 - near) * 50, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
      a.onfinish = a.oncancel = (): void => { ds.display = 'none'; ds.willChange = 'auto'; this.free.push(d); finish(); };
    }
  }

  /** 当前正在进行的爆裂数（测试与排障用） */
  get busy(): number { return this.active.length; }

  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    this.root.removeEventListener('pointerdown', this.onDown, true);
    this.root.removeEventListener('keydown', this.onKey, true);
    this.mo.disconnect();
    this.layer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.layer.remove();
  }
}
