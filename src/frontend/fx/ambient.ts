/**
 * 平台动效模块 `ambient`：常驻的环境层（前端契约 6.5）。落樱、雨丝、余烬、灵光、沙尘、气泡、扫过的光……
 * 2026-11-02 为世界观系列深化补充。皮肤只用 CSS 变量调参（写在 [data-k-surface] 上）：
 *
 *   --k-amb         种类：glyph 字符 | dot 光点 | streak 雨丝 / 数据流 | petal 花瓣 / 叶片 | sweep 扫过的光带 | blink 点阵闪烁 | bubble 气泡 | puff 烟团 | ooze 黏液垂滴（从上沿挂出、拉长、坠落）
 *   --k-amb-dir     走向：up | down | left | right | float（原地飘）        --k-amb-angle  倾斜角（度，雨丝 / 光带用）
 *   --k-amb-count   数量（默认 8，上限 24；手机减半）                       --k-amb-speed  一个来回的秒数（默认 12）
 *   --k-amb-size    大小（px，默认 6）    --k-amb-color 颜色（默认强调色）    --k-amb-alpha  不透明度（默认 .35）
 *   --k-amb-glyphs  glyph 用的字符（空格分开）
 *
 * 画在哪：面板、对话框、消息（正文那一块）里的背景装饰槽 [data-k-ornament="surface-backdrop"]，所以在文字**后面**，不挡字。
 * 只有在屏幕里的宿主才建粒子（IntersectionObserver），离开屏幕就收掉——长聊天里不会堆积。
 * 只在动效「完整」档、且没开系统「减少动态效果」时播；皮肤定义了同名特效 `ambient` 时由那个开关控制。
 * 只动 transform / opacity，无限循环交给 Web Animations（合成器线程）。
 */

const HOST_SEL = '[data-k="panel"], [data-k="dialog"][data-k-part="content"], [data-k="msg-view"]:not([data-k-kind]), [data-k="msg-view"][data-k-kind="body"]';
const KINDS = ['glyph', 'dot', 'streak', 'petal', 'sweep', 'blink', 'bubble', 'puff', 'ooze'] as const;
type Kind = typeof KINDS[number];

export interface AmbientOptions {
  enabled: () => boolean;
  motion: () => 'full' | 'calm' | 'off';
}

interface Field { holder: HTMLElement; box: HTMLElement; anims: Animation[]; w: number; h: number; sig: string }

export class Ambient {
  private readonly win: Window & typeof globalThis;
  private readonly doc: Document;
  private readonly io: IntersectionObserver | null;
  private readonly ro: ResizeObserver | null;
  private readonly mo: MutationObserver;
  private readonly fields = new Map<Element, Field>();
  private readonly seen = new WeakSet<Element>();
  private readonly visible = new Set<Element>();
  private readonly coarse: boolean;
  private readonly reduce: boolean;
  private timer = 0;
  private disposed = false;

  constructor(private readonly root: ShadowRoot, private readonly o: AmbientOptions) {
    this.doc = root.ownerDocument;
    this.win = this.doc.defaultView as Window & typeof globalThis;
    this.coarse = !!this.win.matchMedia && this.win.matchMedia('(pointer: coarse)').matches;
    this.reduce = !!this.win.matchMedia && this.win.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.io = typeof this.win.IntersectionObserver === 'function' ? new this.win.IntersectionObserver((es) => {
      for (const e of es) { if (e.isIntersecting) { this.visible.add(e.target); } else { this.visible.delete(e.target); } }
      this.sync();
    }) : null;
    this.ro = typeof this.win.ResizeObserver === 'function' ? new this.win.ResizeObserver((es) => {
      for (const e of es) {
        const f = this.fields.get(e.target);
        if (!f) { continue; }
        const w = (e.target as HTMLElement).clientWidth, h = (e.target as HTMLElement).clientHeight;
        if (Math.abs(w - f.w) > f.w * 0.15 || Math.abs(h - f.h) > f.h * 0.15) { this.clear(e.target); }
      }
      this.sync();
    }) : null;
    this.mo = new this.win.MutationObserver(() => this.later());
    this.mo.observe(root, { childList: true, subtree: true });
    this.scan();
  }

  /** 皮肤 / 特效开关 / 动效档变了：全部重建 */
  refresh(): void {
    for (const el of Array.from(this.fields.keys())) { this.clear(el); }
    this.sync();
  }

  private later(): void {
    if (this.timer) { return; }
    this.timer = this.win.setTimeout(() => { this.timer = 0; this.scan(); }, 200);
  }

  private scan(): void {
    if (this.disposed) { return; }
    for (const el of Array.from(this.root.querySelectorAll(HOST_SEL))) {
      if (this.seen.has(el)) { continue; }
      this.seen.add(el);
      if (this.io) { this.io.observe(el); } else { this.visible.add(el); }
    }
    for (const el of Array.from(this.visible)) { if (!el.isConnected) { this.visible.delete(el); this.io?.unobserve(el); } }
    this.sync();
  }

  private on(): boolean { return !this.disposed && !this.reduce && this.o.motion() === 'full' && this.o.enabled(); }

  private sync(): void {
    for (const el of Array.from(this.fields.keys())) { if (!this.on() || !this.visible.has(el) || !el.isConnected) { this.clear(el); } }
    if (!this.on()) { return; }
    for (const el of this.visible) { if (!this.fields.has(el)) { this.build(el as HTMLElement); } }
  }

  private clear(el: Element): void {
    const f = this.fields.get(el);
    if (!f) { return; }
    f.anims.forEach((a) => a.cancel());
    f.box.remove();
    this.ro?.unobserve(el);
    this.fields.delete(el);
  }

  private build(host: HTMLElement): void {
    const holder = Array.from(host.children).find((c) => c.getAttribute('data-k-ornament') === 'surface-backdrop') as HTMLElement | undefined;
    if (!holder) { return; }
    const cs = this.win.getComputedStyle(host);
    const v = (k: string): string => cs.getPropertyValue(k).trim().replace(/^["']|["']$/g, '');
    const kind = v('--k-amb') as Kind;
    if (!KINDS.includes(kind)) { return; }
    const w = host.clientWidth, h = host.clientHeight;
    if (w < 40 || h < 40) { return; }
    /* 装饰槽默认 display: none（皮肤没写它时）；环境层要用它，就让它显示出来（只铺满、不改别的） */
    if (this.win.getComputedStyle(holder).display === 'none') { holder.style.display = 'block'; }
    const box = this.doc.createElement('div');
    box.setAttribute('data-k-fx-layer', 'ambient');
    const bs = box.style;
    bs.position = 'absolute'; bs.inset = '0'; bs.overflow = 'hidden'; bs.pointerEvents = 'none'; bs.borderRadius = 'inherit'; bs.contain = 'strict';
    holder.appendChild(box);
    const f: Field = { holder, box, anims: [], w, h, sig: '' };
    this.fields.set(host, f);
    this.ro?.observe(host);

    const num = (k: string, d: number): number => { const n = parseFloat(v(k)); return Number.isFinite(n) ? n : d; };
    const color = v('--k-amb-color') || v('--k-accent') || '#888';
    const alpha = Math.max(0.05, Math.min(1, num('--k-amb-alpha', 0.35)));
    const size = Math.max(1, Math.min(80, num('--k-amb-size', 6)));
    const speed = Math.max(2, Math.min(120, num('--k-amb-speed', 12)));
    const angle = num('--k-amb-angle', 0);
    const dir = v('--k-amb-dir') || 'up';
    const glyphs = (v('--k-amb-glyphs') || '·').split(/\s+/).filter(Boolean);
    let count = Math.round(Math.max(1, Math.min(24, num('--k-amb-count', 8))) * (this.coarse ? 0.5 : 1));
    if (kind === 'sweep') { count = 1; }
    count = Math.max(1, count);
    const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

    for (let i = 0; i < count; i++) {
      const d = this.doc.createElement('i');
      const s = d.style;
      s.position = 'absolute'; s.left = '0'; s.top = '0'; s.pointerEvents = 'none'; s.willChange = 'transform, opacity'; s.fontStyle = 'normal';
      const sz = size * rnd(0.7, 1.3);
      const dur = speed * 1000 * rnd(0.75, 1.3);
      let frames: Keyframe[];

      if (kind === 'sweep') {
        const bw = Math.max(60, w * 0.22);
        s.width = bw + 'px'; s.height = Math.hypot(w, h) * 1.2 + 'px';
        s.background = 'linear-gradient(90deg, transparent, ' + color + ', transparent)';
        const y0 = -(Math.hypot(w, h) * 1.2 - h) / 2;
        const rot = ' rotate(' + (angle || 20) + 'deg)';
        frames = [
          { transform: 'translate(' + (-bw * 2) + 'px,' + y0 + 'px)' + rot, opacity: 0 },
          { transform: 'translate(' + (w * 0.2) + 'px,' + y0 + 'px)' + rot, opacity: alpha, offset: 0.25 },
          { transform: 'translate(' + (w + bw) + 'px,' + y0 + 'px)' + rot, opacity: 0, offset: 0.6 },
          { transform: 'translate(' + (w + bw) + 'px,' + y0 + 'px)' + rot, opacity: 0 }
        ];
      } else if (kind === 'blink') {
        s.width = sz + 'px'; s.height = sz + 'px'; s.borderRadius = '50%'; s.background = color; s.boxShadow = '0 0 ' + sz * 1.5 + 'px ' + color;
        const at = 'translate(' + rnd(0, w - sz) + 'px,' + rnd(0, h - sz) + 'px)';
        frames = [{ transform: at + ' scale(.4)', opacity: 0 }, { transform: at + ' scale(1)', opacity: alpha, offset: 0.12 }, { transform: at + ' scale(.6)', opacity: 0, offset: 0.3 }, { transform: at, opacity: 0 }];
      } else if (kind === 'ooze') {
        /* 黏液：从上沿某处挂出一滴，慢慢拉长，然后坠落、淡掉 */
        s.width = sz + 'px'; s.height = sz * 1.5 + 'px'; s.borderRadius = '50% 50% 50% 50% / 35% 35% 65% 65%';
        s.background = 'radial-gradient(circle at 38% 62%, rgba(255,255,255,.55) 0 12%, transparent 22%), ' + color; s.transformOrigin = '50% 0';
        const x = rnd(0, w - sz), fall = rnd(h * 0.35, h * 0.9);
        const at = (y: number, sx: number, sy: number): string => 'translate(' + x + 'px,' + y + 'px) scale(' + sx + ',' + sy + ')';
        frames = [
          { transform: at(-sz * 0.6, 0.3, 0.2), opacity: 0 },
          { transform: at(-sz * 0.6, 0.8, 0.8), opacity: alpha, offset: 0.15 },
          { transform: at(-sz * 0.4, 0.75, 2.2), opacity: alpha, offset: 0.62, easing: 'cubic-bezier(.6,0,1,1)' },
          { transform: at(fall, 0.7, 1.4), opacity: alpha * 0.8, offset: 0.8 },
          { transform: at(fall + sz * 2, 0.6, 1), opacity: 0, offset: 0.86 },
          { transform: at(fall + sz * 2, 0.6, 1), opacity: 0 }
        ];
      } else {
        /* 会移动的种类：起点 / 终点按走向定，中途左右摆一下 */
        let x0 = rnd(0, w), y0 = rnd(0, h), x1 = x0, y1 = y0;
        const pad = sz * 3;
        if (dir === 'up') { y0 = h + pad; y1 = -pad; x1 = x0 + rnd(-40, 40); }
        else if (dir === 'down') { y0 = -pad; y1 = h + pad; x1 = x0 + rnd(-30, 30) + Math.tan(angle * Math.PI / 180) * h; }
        else if (dir === 'left') { x0 = w + pad; x1 = -pad; y1 = y0 + rnd(-30, 30); }
        else if (dir === 'right') { x0 = -pad; x1 = w + pad; y1 = y0 + rnd(-30, 30); }
        else { x1 = x0 + rnd(-40, 40); y1 = y0 + rnd(-30, 30); }
        const sway = rnd(-24, 24);
        let rot0 = 0, rot1 = 0, sc0 = 1, sc1 = 1;
        if (kind === 'glyph') { d.textContent = glyphs[i % glyphs.length]!; s.fontSize = sz * 2 + 'px'; s.lineHeight = '1'; s.color = color; rot1 = rnd(-60, 60); }
        else if (kind === 'dot') { s.width = sz + 'px'; s.height = sz + 'px'; s.borderRadius = '50%'; s.background = color; s.boxShadow = '0 0 ' + sz * 2 + 'px ' + color; }
        else if (kind === 'streak') {
          s.width = Math.max(1, sz / 6) + 'px'; s.height = sz * 4 + 'px'; s.background = 'linear-gradient(180deg, transparent, ' + color + ')';
          rot0 = rot1 = dir === 'down' || dir === 'up' ? -angle : 90 - angle;
        }
        else if (kind === 'petal') { s.width = sz * 1.6 + 'px'; s.height = sz + 'px'; s.borderRadius = '80% 0 80% 0'; s.background = color; rot0 = rnd(0, 180); rot1 = rot0 + rnd(200, 520) * (Math.random() < 0.5 ? -1 : 1); }
        else if (kind === 'bubble') { s.width = sz * 2 + 'px'; s.height = sz * 2 + 'px'; s.borderRadius = '50%'; s.border = '1px solid ' + color; s.boxSizing = 'border-box'; sc0 = 0.5; sc1 = 1.2; }
        else if (kind === 'puff') { s.width = sz * 6 + 'px'; s.height = sz * 6 + 'px'; s.borderRadius = '50%'; s.background = 'radial-gradient(closest-side, ' + color + ', transparent)'; s.filter = 'blur(4px)'; sc0 = 0.5; sc1 = 2; }
        const T = (x: number, y: number, r: number, sc: number): string => 'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg) scale(' + sc + ')';
        const float = dir === 'float';
        frames = float
          ? [{ transform: T(x0, y0, rot0, sc0), opacity: 0 }, { transform: T((x0 + x1) / 2 + sway, (y0 + y1) / 2, (rot0 + rot1) / 2, (sc0 + sc1) / 2), opacity: alpha, offset: 0.5 }, { transform: T(x1, y1, rot1, sc1), opacity: 0 }]
          : [{ transform: T(x0, y0, rot0, sc0), opacity: 0 }, { transform: T(x0 + (x1 - x0) * 0.15, y0 + (y1 - y0) * 0.15, rot0, sc0), opacity: alpha, offset: 0.1 },
            { transform: T((x0 + x1) / 2 + sway, (y0 + y1) / 2, (rot0 + rot1) / 2, (sc0 + sc1) / 2), opacity: alpha, offset: 0.5 },
            { transform: T(x0 + (x1 - x0) * 0.9, y0 + (y1 - y0) * 0.9, rot1, sc1), opacity: alpha, offset: 0.9 }, { transform: T(x1, y1, rot1, sc1), opacity: 0 }];
      }
      box.appendChild(d);
      const a = d.animate(frames, { duration: dur, iterations: Infinity, delay: -rnd(0, dur), easing: kind === 'streak' ? 'linear' : 'ease-in-out' });
      f.anims.push(a);
    }
  }

  dispose(): void {
    if (this.disposed) { return; }
    this.disposed = true;
    if (this.timer) { this.win.clearTimeout(this.timer); }
    this.io?.disconnect(); this.ro?.disconnect(); this.mo.disconnect();
    for (const el of Array.from(this.fields.keys())) { this.clear(el); }
  }
}
