/**
 * 平台动效模块 · 招牌组（前端契约 6.5）：每款皮肤一个专属动作，让「按下 / 打开」的手感各不相同。
 * 2026-11-02 为世界观系列深化补充（docs/世界观皮肤系列方案.md 第五节）。触发时机、上限、动效档与 motifs.ts 共用。
 *
 *   stamp   印章 / 蜡封落下         --k-fx-stamp 印文（1~2 字或符号）  --k-fx-stamp-style outline | fill
 *   words   拟声字弹出（漫画）       --k-fx-words 空格分开的词
 *   slash   斜刀光一闪
 *   sparks  火花迸溅（带重力）
 *   steam   蒸汽团升腾               --k-fx-steam 蒸汽色
 *   flash   闪光灯
 *   ripple  同心波纹 / 脉冲环
 *   lockon  四角括号收拢锁定 / 展开  --k-fx-lock in | out
 *   drip    蜡滴 / 血滴从下沿落下
 *   tendril 触须从边缘卷出又缩回
 *   shine   斜向金箔光泽扫过
 *   orbit   一圈符文绕着转开          --k-fx-glyphs 符文
 *   mark    朱笔圈点（手绘椭圆 / 勾）
 * 只动 transform / opacity（tendril / mark 另动 SVG 描边偏移）；「平静」档只留最轻的一下，「关闭」与系统减少动态效果时不播（由 motifs.ts 拦）。
 */
import type { Ctx, Event, Kit } from './motifs';

export type SignatureId = 'stamp' | 'words' | 'slash' | 'sparks' | 'steam' | 'flash' | 'ripple' | 'lockon' | 'drip' | 'tendril' | 'shine' | 'orbit' | 'mark';
export const SIGNATURE_IDS: readonly SignatureId[] = ['stamp', 'words', 'slash', 'sparks', 'steam', 'flash', 'ripple', 'lockon', 'drip', 'tendril', 'shine', 'orbit', 'mark'];

type Painter = (ev: Event, el: Element, c: Ctx, k: Kit) => void;
const v = (c: Ctx, name: string): string => c.cs.getPropertyValue(name).trim().replace(/^["']|["']$/g, '');
const words = (c: Ctx, name: string, dflt: string): string[] => (v(c, name) || dflt).split(/\s+/).filter(Boolean);
const mix = (col: string, pct: number): string => 'color-mix(in srgb, ' + col + ' ' + pct + '%, transparent)';
const SVGNS = 'http://www.w3.org/2000/svg';
const fades = (ev: Event): boolean => ev === 'close' || ev === 'fold-close';

/** 在节点里放一条 SVG 路径，返回路径元素（描边动画用） */
function svgPath(k: Kit, d: HTMLElement, w: number, h: number, path: string, color: string, width: number): SVGPathElement {
  const doc = d.ownerDocument;
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.style.overflow = 'visible';
  const p = doc.createElementNS(SVGNS, 'path');
  p.setAttribute('d', path); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', String(width));
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p); d.appendChild(svg);
  void k;
  return p;
}

/* ───────── stamp：印章落下（远征的蜡封、朱墙的玉玺、简报的「绝密」） ───────── */
const stamp: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const text = v(c, '--k-fx-stamp') || '印';
  const fill = v(c, '--k-fx-stamp-style') === 'fill';
  const big = ev === 'open';
  const s = big ? Math.min(64, Math.max(40, r.width * 0.12)) : ev === 'press' ? Math.min(34, Math.max(24, r.height * 0.9)) : 22;
  const x = big ? r.right - s - 18 : ev === 'tab' || ev === 'fold-open' ? r.left + 6 : c.x - s / 2;
  const y = big ? r.top + 12 : ev === 'tab' ? r.top - s * 0.4 : ev === 'fold-open' ? r.top + 4 : c.y - s / 2;
  const d = k.node('b'); if (!d) { return; }
  const st = d.style;
  st.display = 'grid'; st.placeItems = 'center'; st.fontWeight = '900'; st.fontStyle = 'normal'; st.lineHeight = '1';
  st.fontSize = Math.round(s * (text.length > 1 ? 0.36 : 0.56)) + 'px'; st.letterSpacing = text.length > 1 ? '.05em' : '0';
  st.borderRadius = fill ? '46% 54% 50% 50% / 52% 48% 52% 48%' : (v(c, '--k-fx-stamp-shape') === 'round' ? '50%' : '3px');
  if (fill) { st.background = c.glow; st.color = '#fff8ec'; st.boxShadow = 'inset 0 0 0 3px ' + mix('#000', 18) + ', 0 2px 6px ' + mix('#000', 30); }
  else { st.border = '2px solid ' + c.glow; st.color = c.glow; st.background = mix(c.glow, 8); st.boxShadow = 'inset 0 0 0 2px ' + mix(c.glow, 30); }
  d.textContent = text;
  const at = k.box(d, x, y, s, s);
  const rot = k.rnd(-16, -6);
  if (c.calm) { k.play(d, [{ transform: at + ' rotate(' + rot + 'deg)', opacity: 0 }, { transform: at + ' rotate(' + rot + 'deg)', opacity: 0.85, offset: 0.3 }, { transform: at + ' rotate(' + rot + 'deg)', opacity: 0 }], { duration: 700 }); return; }
  k.play(d, [
    { transform: at + ' scale(2.4) rotate(' + (rot - 10) + 'deg)', opacity: 0 },
    { transform: at + ' scale(.92) rotate(' + rot + 'deg)', opacity: 1, offset: 0.16 },
    { transform: at + ' scale(1) rotate(' + rot + 'deg)', opacity: 1, offset: 0.24 },
    { transform: at + ' scale(1) rotate(' + rot + 'deg)', opacity: 0.95, offset: 0.7 },
    { transform: at + ' scale(1.04) rotate(' + rot + 'deg)', opacity: 0 }
  ], { duration: big ? 1300 : 900, easing: 'cubic-bezier(.3,.9,.3,1)' });
  /* 落下时的一圈震波 */
  const w = k.node(); if (!w) { return; }
  w.style.border = '1.5px solid ' + c.glow; w.style.borderRadius = fill ? '50%' : '4px';
  const at2 = k.box(w, x, y, s, s);
  k.play(w, [{ transform: at2 + ' scale(1)', opacity: 0 }, { transform: at2 + ' scale(1)', opacity: 0.6, offset: 0.2 }, { transform: at2 + ' scale(1.7)', opacity: 0 }], { duration: 520, delay: 120 });
};

/* ───────── words：拟声字弹出（糖霜） ───────── */
const wordsFx: Painter = (ev, _el, c, k) => {
  if (fades(ev) || ev === 'tab') { return; }
  const list = words(c, '--k-fx-words', '♥');
  const { r } = c;
  const n = ev === 'open' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const d = k.node('b'); if (!d) { return; }
    const w = list[Math.floor(Math.random() * list.length)]!;
    const fs = ev === 'open' ? 26 : ev === 'fold-open' ? 16 : 20;
    const st = d.style;
    st.fontSize = fs + 'px'; st.fontWeight = '900'; st.fontStyle = 'italic'; st.lineHeight = '1'; st.whiteSpace = 'nowrap'; st.color = i ? c.alt : c.glow;
    st.textShadow = '2px 0 #fff, -2px 0 #fff, 0 2px #fff, 0 -2px #fff, 2px 2px #fff, -2px -2px #fff, 2px -2px #fff, -2px 2px #fff, 3px 4px 0 ' + mix(c.glow, 35);
    d.textContent = w;
    const x = ev === 'open' ? (i ? r.right - 70 : r.left + 14) : ev === 'fold-open' ? r.left + 20 : c.x + k.rnd(-10, 10);
    const y = ev === 'open' ? r.top - 10 : ev === 'fold-open' ? r.top - 4 : c.y - 34;
    const rot = k.rnd(-18, 18);
    const at = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg)';
    if (c.calm) { k.play(d, [{ transform: at, opacity: 0 }, { transform: at, opacity: 1, offset: 0.3 }, { transform: at, opacity: 0 }], { duration: 600 }); continue; }
    k.play(d, [
      { transform: at + ' scale(.2)', opacity: 0 },
      { transform: at + ' scale(1.25)', opacity: 1, offset: 0.2 },
      { transform: at + ' scale(1)', opacity: 1, offset: 0.35 },
      { transform: at + ' translateY(-14px) scale(1)', opacity: 0 }
    ], { duration: 900, delay: i * 120, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }
};

/* ───────── slash：斜刀光（江湖） ───────── */
const slash: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const len = ev === 'press' ? Math.max(90, r.width * 1.2) : ev === 'tab' ? r.width * 1.3 : Math.min(900, Math.hypot(r.width, r.height) * 0.9);
  const cx = ev === 'press' ? c.x : r.left + r.width / 2;
  const cy = ev === 'press' ? c.y : ev === 'tab' ? r.top + r.height / 2 : r.top + Math.min(r.height * 0.4, 260);
  const ang = ev === 'tab' ? -8 : -24;
  const d = k.node(); if (!d) { return; }
  d.style.background = 'linear-gradient(90deg, transparent, ' + mix('#fff', 90) + ' 45%, ' + c.glow + ' 55%, transparent)';
  d.style.boxShadow = '0 0 12px ' + c.glow; d.style.borderRadius = '50%';
  const h = ev === 'press' ? 3 : 4;
  const at = k.box(d, cx - len / 2, cy - h / 2, len, h) + ' rotate(' + ang + 'deg)';
  k.play(d, [{ transform: at + ' scaleX(0)', opacity: 1 }, { transform: at + ' scaleX(1)', opacity: 1, offset: 0.35 }, { transform: at + ' scaleX(1) scaleY(.2)', opacity: 0 }], { duration: c.calm ? 320 : 460, easing: 'cubic-bezier(.7,0,.2,1)' });
  if (c.calm || ev === 'tab') { return; }
  /* 刀风：一道淡的残影错后半拍 */
  const g = k.node(); if (!g) { return; }
  g.style.background = 'linear-gradient(90deg, transparent, ' + mix(c.glow, 40) + ', transparent)';
  const at2 = k.box(g, cx - len / 2, cy - 7, len, 14) + ' rotate(' + ang + 'deg)';
  k.play(g, [{ transform: at2 + ' translateY(0)', opacity: 0 }, { transform: at2 + ' translateY(6px)', opacity: 0.6, offset: 0.4 }, { transform: at2 + ' translateY(12px)', opacity: 0 }], { duration: 520, delay: 60 });
};

/* ───────── sparks：火花迸溅（锈土） ───────── */
const sparks: Painter = (ev, _el, c, k) => {
  if (fades(ev) || c.calm) { return; }
  const { r } = c;
  const n = ev === 'press' ? (c.coarse ? 8 : 12) : ev === 'tab' ? 5 : 16;
  for (let i = 0; i < n; i++) {
    const d = k.node(); if (!d) { return; }
    const x0 = ev === 'press' ? c.x : ev === 'tab' ? k.rnd(r.left, r.right) : (i % 2 ? r.right - 12 : r.left + 12);
    const y0 = ev === 'press' ? c.y : ev === 'tab' ? r.bottom : r.top + 6;
    const len = k.rnd(5, 11);
    d.style.background = 'linear-gradient(90deg, transparent, ' + (i % 3 ? c.glow : '#fff2c0') + ')'; d.style.borderRadius = '2px'; d.style.boxShadow = '0 0 4px ' + c.glow;
    const a = ev === 'open' ? k.rnd(-Math.PI * 0.9, -Math.PI * 0.1) + (i % 2 ? 0.3 : -0.3) : k.rnd(-Math.PI, 0) + k.rnd(-0.4, 0.4);
    const sp = k.rnd(30, ev === 'press' ? 70 : 110);
    const dx = Math.cos(a) * sp, dy = Math.sin(a) * sp;
    const deg = a * 180 / Math.PI;
    const at = k.box(d, x0, y0, len, 1.6);
    k.play(d, [
      { transform: at + ' rotate(' + deg + 'deg)', opacity: 1 },
      { transform: at + ' translate(' + dx * 0.6 + 'px,' + dy * 0.6 + 'px) rotate(' + (deg + 20) + 'deg)', opacity: 1, offset: 0.45 },
      { transform: at + ' translate(' + dx + 'px,' + (dy + 46) + 'px) rotate(' + (deg + 70) + 'deg)', opacity: 0 }
    ], { duration: k.rnd(420, 700), delay: i * 6, easing: 'cubic-bezier(.2,.6,.6,1)' });
  }
};

/* ───────── steam：蒸汽团（齿轮） ───────── */
const steam: Painter = (ev, _el, c, k) => {
  if (ev === 'tab' || fades(ev)) { return; }
  const { r } = c;
  const col = v(c, '--k-fx-steam') || 'rgba(255,255,255,.75)';
  const n = ev === 'press' ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const d = k.node(); if (!d) { return; }
    const s = k.rnd(ev === 'press' ? 18 : 28, ev === 'press' ? 30 : 56);
    const x0 = ev === 'press' ? c.x + k.rnd(-8, 8) : ev === 'fold-open' ? r.left + 10 : (i % 2 ? r.right - 20 : r.left + 20);
    const y0 = ev === 'press' ? c.y - 6 : ev === 'fold-open' ? r.top + 10 : r.top + 14;
    d.style.background = 'radial-gradient(closest-side, ' + col + ', transparent)'; d.style.borderRadius = '50%'; d.style.filter = 'blur(3px)';
    const at = k.box(d, x0 - s / 2, y0 - s / 2, s, s);
    const dx = k.rnd(-16, 16) + (ev === 'open' ? (i % 2 ? 18 : -18) : 0), dy = -k.rnd(40, ev === 'press' ? 70 : 110);
    k.play(d, [
      { transform: at + ' scale(.3)', opacity: 0 },
      { transform: at + ' translate(' + dx * 0.3 + 'px,' + dy * 0.3 + 'px) scale(.9)', opacity: c.calm ? 0.35 : 0.8, offset: 0.25 },
      { transform: at + ' translate(' + dx + 'px,' + dy + 'px) scale(1.9)', opacity: 0 }
    ], { duration: k.rnd(900, 1400), delay: i * 70, easing: 'cubic-bezier(.2,.5,.4,1)' });
  }
};

/* ───────── flash：闪光灯（暗巷） ───────── */
const flash: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const d = k.node(); if (!d) { return; }
  d.style.background = '#fff'; d.style.mixBlendMode = 'screen';
  const at = k.box(d, r.left, r.top, r.width, r.height);
  k.play(d, [{ transform: at, opacity: c.calm ? 0.25 : 0.75 }, { transform: at, opacity: 0 }], { duration: ev === 'open' ? 520 : 260, easing: 'cubic-bezier(.1,.8,.3,1)' });
  if (c.calm || ev === 'tab') { return; }
  /* 闪光点：按下处一颗四芒星 */
  const s = ev === 'press' ? 26 : 44;
  const x = ev === 'press' ? c.x : r.right - 30, y = ev === 'press' ? c.y : r.top + 20;
  for (const rot of [0, 90]) {
    const p = k.node(); if (!p) { return; }
    p.style.background = 'linear-gradient(90deg, transparent, #fff, transparent)';
    const at2 = k.box(p, x - s / 2, y - 1, s, 2) + ' rotate(' + rot + 'deg)';
    k.play(p, [{ transform: at2 + ' scale(.2)', opacity: 1 }, { transform: at2 + ' scale(1.3)', opacity: 0 }], { duration: 380 });
  }
};

/* ───────── ripple：同心脉冲环（光栅；云笈的灵光涟漪） ───────── */
const ripple: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const press = ev === 'press' || ev === 'tab';
  const s = press ? Math.min(140, Math.max(60, r.height * 2.4)) : Math.min(Math.max(r.width, r.height) * 0.9, 560);
  const x = press ? c.x : r.left + r.width / 2, y = press ? c.y : r.top + Math.min(r.height / 2, 240);
  const n = c.calm ? 1 : press ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const d = k.node(); if (!d) { return; }
    d.style.border = '1px solid ' + c.glow; d.style.borderRadius = '50%'; d.style.boxShadow = '0 0 8px ' + mix(c.glow, 60) + ', inset 0 0 8px ' + mix(c.glow, 40);
    const at = k.box(d, x - s / 2, y - s / 2, s, s);
    k.play(d, [{ transform: at + ' scale(.05)', opacity: 0.9 }, { transform: at + ' scale(1)', opacity: 0 }], { duration: press ? 620 : 1100, delay: i * (press ? 120 : 200), easing: 'cubic-bezier(.1,.6,.3,1)' });
  }
};

/* ───────── lockon：四角括号收拢锁定（简报）/ 从中间展开（转生的系统窗） ───────── */
const lockon: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const out = v(c, '--k-fx-lock') === 'out';
  const kk = Math.max(8, Math.min(18, Math.min(r.width, r.height) / 4));
  const corners: Array<[number, number, number, number]> = [[r.left, r.top, 1, 1], [r.right, r.top, -1, 1], [r.left, r.bottom, 1, -1], [r.right, r.bottom, -1, -1]];
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (const [x, y, sx, sy] of corners) {
    const d = k.node(); if (!d) { return; }
    d.style.borderLeft = sx > 0 ? '2px solid ' + c.glow : ''; d.style.borderRight = sx < 0 ? '2px solid ' + c.glow : '';
    d.style.borderTop = sy > 0 ? '2px solid ' + c.glow : ''; d.style.borderBottom = sy < 0 ? '2px solid ' + c.glow : '';
    d.style.boxSizing = 'border-box'; d.style.filter = 'drop-shadow(0 0 3px ' + c.glow + ')';
    const bx = sx > 0 ? x : x - kk, by = sy > 0 ? y : y - kk;
    const at = k.box(d, bx, by, kk, kk);
    const from = out ? 'translate(' + (cx - bx - kk / 2) + 'px,' + (cy - by - kk / 2) + 'px) scale(.4)' : 'translate(' + (-sx * 14) + 'px,' + (-sy * 14) + 'px)';
    const frames: Keyframe[] = c.calm
      ? [{ transform: at, opacity: 0 }, { transform: at, opacity: 1, offset: 0.3 }, { transform: at, opacity: 0 }]
      : [{ transform: at + ' ' + from, opacity: 0 }, { transform: at, opacity: 1, offset: 0.45 }, { transform: at, opacity: 0.2, offset: 0.6 }, { transform: at, opacity: 1, offset: 0.75 }, { transform: at, opacity: 0 }];
    k.play(d, frames, { duration: ev === 'open' ? 760 : 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  if (c.calm || ev !== 'press') { return; }
  /* 按下：中心一个小十字 */
  for (const [w, h] of [[10, 1.5], [1.5, 10]] as Array<[number, number]>) {
    const d = k.node(); if (!d) { return; }
    d.style.background = c.glow;
    const at = k.box(d, c.x - w / 2, c.y - h / 2, w, h);
    k.play(d, [{ transform: at + ' scale(2)', opacity: 0 }, { transform: at, opacity: 1, offset: 0.4 }, { transform: at, opacity: 0 }], { duration: 480 });
  }
};

/* ───────── drip：下沿凝出几滴往下落（夜祷的蜡滴 / 血滴） ───────── */
const drip: Painter = (ev, _el, c, k) => {
  if (fades(ev) || ev === 'tab') { return; }
  const { r } = c;
  const n = ev === 'press' ? 2 : 4;
  const edge = ev === 'open' ? r.top + Math.min(56, r.height * 0.2) : r.bottom;
  for (let i = 0; i < n; i++) {
    const d = k.node(); if (!d) { return; }
    const s = k.rnd(4, 7);
    const x = ev === 'press' ? c.x + k.rnd(-14, 14) : r.left + r.width * (0.15 + 0.7 * (i + k.rnd(0, 0.8)) / n);
    d.style.background = 'radial-gradient(circle at 40% 35%, ' + mix('#fff', 55) + ', ' + c.glow + ' 45%)'; d.style.borderRadius = '50% 50% 50% 50% / 60% 60% 40% 40%';
    const at = k.box(d, x - s / 2, edge - s / 2, s, s * 1.25);
    const fall = c.calm ? 0 : k.rnd(40, 90);
    k.play(d, [
      { transform: at + ' scale(.2)', opacity: 0 },
      { transform: at + ' scale(1)', opacity: 1, offset: 0.35 },
      { transform: at + ' scale(.9, 1.3)', opacity: 1, offset: 0.5 },
      { transform: at + ' translateY(' + fall + 'px) scale(.8, 1.5)', opacity: 0 }
    ], { duration: c.calm ? 700 : k.rnd(900, 1200), delay: i * 140, easing: 'cubic-bezier(.5,0,.8,.6)' });
  }
};

/* ───────── tendril：触须从边缘卷出又缩回（深渊） ───────── */
const tendril: Painter = (ev, _el, c, k) => {
  if (fades(ev) || ev === 'tab' || c.calm) { return; }
  const { r } = c;
  const spots: Array<[number, number, number]> = ev === 'press'
    ? [[c.x < r.left + r.width / 2 ? r.left : r.right, Math.min(r.bottom, Math.max(r.top, c.y)), c.x < r.left + r.width / 2 ? 1 : -1]]
    : [[r.left, r.top + 30, 1], [r.right, r.top + Math.min(r.height * 0.5, 180), -1], [r.left, r.bottom - 30, 1], [r.right, r.bottom - 40, -1]];
  const L = ev === 'press' ? 46 : 80;
  spots.forEach(([x, y, dir], i) => {
    const d = k.node(); if (!d) { return; }
    const w = L, h = L;
    const ox = dir > 0 ? x - 4 : x - w + 4, oy = y - h / 2;
    const sx = dir > 0 ? 0 : w;
    const ex = dir > 0 ? w * 0.75 : w * 0.25;
    const path = 'M' + sx + ' ' + h / 2 + ' C ' + (dir > 0 ? w * 0.35 : w * 0.65) + ' ' + (h * 0.15) + ', ' + ex + ' ' + (h * 0.1) + ', ' + ex + ' ' + (h * 0.45) +
      ' S ' + (dir > 0 ? w * 0.5 : w * 0.5) + ' ' + (h * 0.7) + ', ' + (dir > 0 ? w * 0.55 : w * 0.45) + ' ' + (h * 0.52);
    const p = svgPath(k, d, w, h, path, c.glow, 2.4);
    k.box(d, ox, oy, w, h);
    d.style.transform = 'translate(' + ox + 'px,' + oy + 'px)'; d.style.filter = 'drop-shadow(0 0 3px ' + c.glow + ')';
    const len = 220;
    p.style.strokeDasharray = String(len);
    k.play(d, [{ opacity: 0 }, { opacity: 0.9, offset: 0.15 }, { opacity: 0.9, offset: 0.7 }, { opacity: 0 }], { duration: 1100, delay: i * 90 });
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0, offset: 0.5 }, { strokeDashoffset: len * 0.6 }], { duration: 1100, delay: i * 90, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
  });
};

/* ───────── shine：斜向金箔光泽扫过（月桂） ───────── */
const shine: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const d = k.node(); if (!d) { return; }
  const bw = Math.max(40, Math.min(160, r.width * 0.3));
  d.style.background = 'linear-gradient(100deg, transparent, ' + mix(c.glow, 55) + ' 40%, ' + mix('#fff', 80) + ' 50%, ' + mix(c.glow, 55) + ' 60%, transparent)';
  d.style.mixBlendMode = 'screen';
  const h = ev === 'open' ? Math.min(r.height, 420) : r.height;
  const at = k.box(d, r.left - bw, r.top, bw, h) + ' skewX(-18deg)';
  k.play(d, [{ transform: at, opacity: 0 }, { transform: at + ' translateX(' + (r.width * 0.3) + 'px)', opacity: c.calm ? 0.35 : 0.85, offset: 0.25 }, { transform: at + ' translateX(' + (r.width + bw * 2) + 'px)', opacity: 0 }], { duration: ev === 'press' ? 520 : 900, easing: 'cubic-bezier(.4,0,.3,1)' });
  if (c.calm || ev !== 'open') { return; }
  const s = k.node('b'); if (!s) { return; }
  s.textContent = '✦'; s.style.color = c.glow; s.style.fontSize = '16px'; s.style.lineHeight = '1'; s.style.textShadow = '0 0 8px ' + c.glow;
  const at2 = 'translate(' + (r.right - 26) + 'px,' + (r.top + 8) + 'px)';
  k.play(s, [{ transform: at2 + ' scale(0) rotate(0)', opacity: 0 }, { transform: at2 + ' scale(1.2) rotate(90deg)', opacity: 1, offset: 0.5 }, { transform: at2 + ' scale(0) rotate(180deg)', opacity: 0 }], { duration: 800, delay: 500 });
};

/* ───────── orbit：一圈符文绕着转开（云笈） ───────── */
const orbit: Painter = (ev, _el, c, k) => {
  if (fades(ev) || ev === 'tab') { return; }
  const { r } = c;
  const glyphs = words(c, '--k-fx-glyphs', '✦');
  const press = ev === 'press';
  const R = press ? Math.max(22, Math.min(46, r.height)) : Math.min(140, Math.max(60, Math.min(r.width, r.height) * 0.3));
  const cx = press ? c.x : r.left + r.width / 2, cy = press ? c.y : r.top + Math.min(r.height / 2, 220);
  const n = c.calm ? 4 : press ? 6 : 8;
  const spin = k.rnd(80, 120) * (Math.random() < 0.5 ? -1 : 1);
  for (let i = 0; i < n; i++) {
    const d = k.node('b'); if (!d) { return; }
    d.textContent = glyphs[i % glyphs.length]!;
    const fs = press ? 12 : 16;
    d.style.fontSize = fs + 'px'; d.style.lineHeight = '1'; d.style.color = i % 2 ? c.alt : c.glow; d.style.textShadow = '0 0 6px ' + c.glow; d.style.fontStyle = 'normal';
    const a0 = (i / n) * 360;
    const base = 'translate(' + (cx - fs / 2) + 'px,' + (cy - fs / 2) + 'px)';
    k.play(d, [
      { transform: base + ' rotate(' + a0 + 'deg) translateX(' + R * 0.3 + 'px) rotate(' + -a0 + 'deg)', opacity: 0 },
      { transform: base + ' rotate(' + (a0 + spin * 0.5) + 'deg) translateX(' + R + 'px) rotate(' + -(a0 + spin * 0.5) + 'deg)', opacity: 1, offset: 0.45 },
      { transform: base + ' rotate(' + (a0 + spin) + 'deg) translateX(' + R * 1.25 + 'px) rotate(' + -(a0 + spin) + 'deg)', opacity: 0 }
    ], { duration: press ? 800 : 1300, easing: 'cubic-bezier(.2,.6,.4,1)' });
  }
  if (c.calm) { return; }
  const ring = k.node(); if (!ring) { return; }
  ring.style.border = '1px solid ' + mix(c.glow, 70); ring.style.borderRadius = '50%';
  const at = k.box(ring, cx - R, cy - R, R * 2, R * 2);
  k.play(ring, [{ transform: at + ' scale(.3)', opacity: 0 }, { transform: at + ' scale(1)', opacity: 0.7, offset: 0.4 }, { transform: at + ' scale(1.2)', opacity: 0 }], { duration: press ? 700 : 1100 });
};

/* ───────── mark：朱笔圈点（朱墙的朱批；暗巷可用作红笔圈证物） ───────── */
const mark: Painter = (ev, _el, c, k) => {
  if (fades(ev)) { return; }
  const { r } = c;
  const d = k.node(); if (!d) { return; }
  let w: number, h: number, x: number, y: number, path: string;
  if (ev === 'open') {
    /* 打开：右上角一个朱笔勾 */
    w = 46; h = 34; x = r.right - w - 24; y = r.top + 10;
    path = 'M4 18 Q 12 22 17 31 Q 26 12 44 3';
  } else {
    const box = ev === 'press' && r.width > 260 ? { l: c.x - 60, t: c.y - 18, w: 120, h: 36 } : { l: r.left, t: r.top, w: r.width, h: r.height };
    w = box.w + 16; h = box.h + 12; x = box.l - 8; y = box.t - 6;
    /* 手绘椭圆：起笔与收笔错开一点，不完全闭合 */
    path = 'M ' + (w * 0.55) + ' 3 C ' + (w * 0.95) + ' 1, ' + (w - 2) + ' ' + (h * 0.75) + ', ' + (w * 0.55) + ' ' + (h - 3) +
      ' C ' + (w * 0.1) + ' ' + (h + 1) + ', 1 ' + (h * 0.35) + ', ' + (w * 0.35) + ' 5 C ' + (w * 0.5) + ' 1, ' + (w * 0.7) + ' 3, ' + (w * 0.78) + ' 9';
  }
  const p = svgPath(k, d, w, h, path, c.glow, ev === 'open' ? 3.5 : 2.2);
  d.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  const len = ev === 'open' ? 80 : Math.round((w + h) * 1.7);
  p.style.strokeDasharray = String(len);
  k.play(d, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: c.calm ? 600 : 1000 });
  p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0, offset: 0.45 }, { strokeDashoffset: 0 }], { duration: c.calm ? 600 : 1000, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' });
};

export const SIGNATURES: Record<SignatureId, Painter> = { stamp, words: wordsFx, slash, sparks, steam, flash, ripple, lockon, drip, tendril, shine, orbit, mark };
