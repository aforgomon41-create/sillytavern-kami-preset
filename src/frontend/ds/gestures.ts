/**
 * 面板触屏手势（照旧版 src/scripts/_panel-gestures.js 的做法，用户 2026-10-28 指定）：
 *   ① 标题栏下拉            → 收回抽屉（仅窄屏贴底抽屉）
 *   ② 内容区滚到顶再下拉     → 收回抽屉（仅窄屏贴底抽屉）
 *   ③ 内容区左右滑           → 切上一个 / 下一个页签
 *
 * 约定（与旧版一致）：
 *   · 只挂 touch 事件。鼠标不接管——PC 上拖标题栏是移动面板，横向拖还会和选中文字打架。
 *     不用 pointer 事件：浏览器一旦判定为滚动就发 pointercancel，后面的移动全收不到。
 *   · 位移超过 AXIS 才判方向；横向要明显大于纵向（≥1.2 倍）。判为横向才 preventDefault，纵向滚动一律放行。
 *   · 起点在页签条、输入控件、可横向滚动的区域（data-k-swipe="off"）上不接管。
 *   · 事件只挂在 root 上，root 之外的节点一个都不碰。返回解绑函数。
 */
import { sheetShouldClose } from './geometry';

export interface GestureConfig {
  root: HTMLElement;
  /** 标题栏（① 的起点） */
  handle: () => Element | null;
  /** 内容滚动区（判断「滚到顶」） */
  pane: () => HTMLElement | null;
  /** 现在是不是贴底抽屉（①② 只在抽屉下生效） */
  isSheet: () => boolean;
  onClose: () => void;
  /** 下拉过程中的位移（0 = 复位）；由面板写进 --k-sheet-drag */
  onDrag: (dy: number) => void;
  /** 当前可以翻页的页签（没有就不做 ③）：dir = +1 下一个 / -1 上一个 */
  step: () => ((dir: 1 | -1) => void) | null;
}

const AXIS = 12, SWITCH = 48, RATIO = 1.2, TOP_SLOP = 2;
const NO_SWIPE = 'input, textarea, select, [role="slider"], [data-k-swipe="off"], [data-k="tabs"] > [data-k-part="list"]';

export function bindPanelGestures(cfg: GestureConfig): () => void {
  const { root } = cfg;
  let st: { x: number; y: number; t: number; lastY: number; lastT: number; v: number; axis: '' | 'x' | 'y'; dx: number; dy: number; top: boolean; pull: boolean; swipe: boolean } | null = null;

  const onStart = (ev: TouchEvent): void => {
    st = null;
    if (ev.touches.length !== 1) { return; }
    const target = ev.target as Element | null;
    if (!target || !target.closest) { return; }
    const touch = ev.touches[0]!;
    const handle = cfg.handle();
    const pane = cfg.pane();
    let top = false, swipe = false;
    if (handle && handle.contains(target)) {
      if (target.closest('button, a, input, select, textarea')) { return; }
      top = true;
    } else if (pane && pane.contains(target)) {
      if (target.closest('[data-k="tabs"] > [data-k-part="list"]')) { return; }
      top = pane.scrollTop <= TOP_SLOP;
      swipe = !target.closest(NO_SWIPE);
    } else { return; }
    const now = performance.now();
    st = { x: touch.clientX, y: touch.clientY, t: now, lastY: touch.clientY, lastT: now, v: 0, axis: '', dx: 0, dy: 0, top, pull: false, swipe };
  };

  const onMove = (ev: TouchEvent): void => {
    if (!st || ev.touches.length !== 1) { return; }
    const touch = ev.touches[0]!;
    const dx = touch.clientX - st.x, dy = touch.clientY - st.y;
    if (!st.axis) {
      if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) { return; }
      st.axis = Math.abs(dx) > Math.abs(dy) * RATIO ? 'x' : 'y';
    }
    if (st.axis === 'x') {
      if (!st.swipe || !cfg.step()) { return; }
      st.dx = dx;
      if (ev.cancelable) { ev.preventDefault(); }
      return;
    }
    /* 纵向：只有「抽屉 + 起点在顶 + 往下拖」才是下拉收回；其它一律放行给原生滚动 */
    if (!st.pull && (!cfg.isSheet() || !st.top || dy <= 0)) { return; }
    st.pull = true;
    const now = performance.now();
    st.v = (touch.clientY - st.lastY) / Math.max(1, now - st.lastT); st.lastY = touch.clientY; st.lastT = now;
    st.dy = Math.max(0, dy);
    /* 已经接管成下拉：掐掉内容区的回弹 / 页面下拉刷新 */
    if (ev.cancelable) { ev.preventDefault(); }
    cfg.onDrag(st.dy);
  };

  const onEnd = (): void => {
    const s = st; st = null;
    if (!s) { return; }
    if (s.pull) {
      cfg.onDrag(0);
      if (sheetShouldClose(s.dy, root.getBoundingClientRect().height, s.v)) { cfg.onClose(); }
      return;
    }
    const step = cfg.step();
    if (s.axis === 'x' && step && Math.abs(s.dx) >= SWITCH) { step(s.dx < 0 ? 1 : -1); }
  };
  const onCancel = (): void => { if (st && st.pull) { cfg.onDrag(0); } st = null; };

  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd);
  root.addEventListener('touchcancel', onCancel);
  return () => {
    root.removeEventListener('touchstart', onStart);
    root.removeEventListener('touchmove', onMove);
    root.removeEventListener('touchend', onEnd);
    root.removeEventListener('touchcancel', onCancel);
    if (st && st.pull) { cfg.onDrag(0); }
    st = null;
  };
}
