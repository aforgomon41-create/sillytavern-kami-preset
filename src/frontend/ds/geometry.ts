/**
 * 面板几何（纯函数，可单测）。前端契约 8.2：宽屏是可拖动、可缩放的浮动窗；窄屏（≤1000px，与酒馆单栏断点一致）是贴底抽屉。
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

/** 与酒馆自己的单栏断点一致（public/css/mobile-styles.css: max-width 1000px） */
export const SHEET_BREAKPOINT = 1000;
export const EDGE = 8;

export const isSheet = (viewportW: number): boolean => viewportW <= SHEET_BREAKPOINT;

/** 把面板收进视口：先保证尺寸不小于最小值、不大于视口，再把位置夹进去（标题栏始终可见、可再拖回来） */
export function clampRect(r: Rect, vp: Size, min: Size): Rect {
  const maxW = Math.max(min.w, vp.w - EDGE * 2), maxH = Math.max(min.h, vp.h - EDGE * 2);
  const w = Math.min(Math.max(r.w, min.w), maxW);
  const h = Math.min(Math.max(r.h, min.h), maxH);
  const x = Math.min(Math.max(r.x, EDGE), Math.max(EDGE, vp.w - w - EDGE));
  const y = Math.min(Math.max(r.y, EDGE), Math.max(EDGE, vp.h - h - EDGE));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** 初始位置：居中 */
export function centered(size: Size, vp: Size, min: Size): Rect {
  return clampRect({ x: (vp.w - size.w) / 2, y: (vp.h - size.h) / 2, w: size.w, h: size.h }, vp, min);
}

/** 贴底抽屉下拉：拖过高度的 25%，或者快速下甩（> 0.6 px/ms），就关闭 */
export function sheetShouldClose(dragY: number, sheetH: number, velocity: number): boolean {
  return dragY > sheetH * 0.25 || (dragY > 24 && velocity > 0.6);
}
