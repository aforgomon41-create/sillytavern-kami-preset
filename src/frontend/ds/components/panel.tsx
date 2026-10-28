/**
 * 面板（非模态）：宽屏浮动窗（标题栏拖动、右下角缩放、方向键缩放、视口变化自动收回），窄屏贴底抽屉（顶部把手下拉关闭）。
 * Esc 关闭；几何由使用方保存（onGeometryChange），组件只负责计算与夹取。
 * ⚠️ 不用 setPointerCapture（交接 §五第 20 条：它会吃掉后续 click 的目标）；拖动在窗口上监听，移动超过 4px 才算开始。
 */
import * as React from 'react';
import { k, ornament, part } from '../hooks';
import { IconClose } from '../icons';
import { centered, clampRect, isSheet, sheetShouldClose, type Rect, type Size } from '../geometry';
import { LevelProvider, usePortal } from './context';
import { IconButton } from './controls';

export interface PanelProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** 标题栏右侧的额外操作（关闭按钮之前） */
  actions?: React.ReactNode;
  onClose: () => void;
  /** 上次保存的几何（浮动窗） */
  geometry?: Rect;
  onGeometryChange?: (r: Rect) => void;
  defaultSize?: Size;
  minSize?: Size;
  closeLabel?: string;
}

const DRAG_START = 4;

function useViewport(win: Window | null): Size {
  const read = (): Size => ({ w: win ? win.innerWidth : 1280, h: win ? win.innerHeight : 800 });
  const [vp, setVp] = React.useState<Size>(read);
  React.useEffect(() => {
    if (!win) { return undefined; }
    const on = (): void => setVp(read());
    win.addEventListener('resize', on);
    return () => win.removeEventListener('resize', on);
  }, [win]);
  return vp;
}

export function Panel({ title, children, footer, actions, onClose, geometry, onGeometryChange, defaultSize = { w: 720, h: 640 }, minSize = { w: 320, h: 240 }, closeLabel = '关闭' }: PanelProps): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  /* 第一次渲染就要知道所在窗口（算居中用）：从渲染面的弹层容器取，元素还没挂上时 ref 拿不到 */
  const portal = usePortal();
  const win = portal ? portal.ownerDocument.defaultView : (typeof window !== 'undefined' ? window : null);
  const vp = useViewport(win);
  const sheet = isSheet(vp.w);
  const titleId = React.useId();
  const [rect, setRect] = React.useState<Rect>(() => geometry ? clampRect(geometry, vp, minSize) : centered(defaultSize, vp, minSize));
  const [sheetDrag, setSheetDrag] = React.useState(0);

  /* 视口变化：收回可见范围 */
  React.useEffect(() => { setRect((r) => clampRect(r, vp, minSize)); }, [vp.w, vp.h]);
  /* 打开时把焦点放进面板（非模态，不锁焦点） */
  React.useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);

  const commit = (r: Rect): void => { const c = clampRect(r, vp, minSize); setRect(c); if (onGeometryChange) { onGeometryChange(c); } };

  /** 通用拖动：按下记起点，窗口上跟踪移动，超过阈值才开始 */
  const track = (e: React.PointerEvent, onMove: (dx: number, dy: number, dt: number) => void, onEnd: (dx: number, dy: number, v: number) => void): void => {
    if (e.button !== 0 || !win) { return; }
    const sx = e.clientX, sy = e.clientY, t0 = performance.now();
    let started = false, lastY = sy, lastT = t0, vel = 0;
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!started && Math.hypot(dx, dy) < DRAG_START) { return; }
      started = true;
      const now = performance.now(); vel = (ev.clientY - lastY) / Math.max(1, now - lastT); lastY = ev.clientY; lastT = now;
      ev.preventDefault();
      onMove(dx, dy, now - t0);
    };
    const up = (ev: PointerEvent): void => {
      win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); win.removeEventListener('pointercancel', up);
      if (started) { onEnd(ev.clientX - sx, ev.clientY - sy, vel); }
    };
    win.addEventListener('pointermove', move); win.addEventListener('pointerup', up); win.addEventListener('pointercancel', up);
  };

  const onHeadDown = (e: React.PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="tab"]')) { return; }
    if (sheet) {
      track(e, (_dx, dy) => setSheetDrag(Math.max(0, dy)), (_dx, dy, v) => {
        const h = ref.current?.getBoundingClientRect().height ?? vp.h;
        setSheetDrag(0);
        if (sheetShouldClose(dy, h, v)) { onClose(); }
      });
      return;
    }
    const start = rect;
    track(e, (dx, dy) => setRect(clampRect({ ...start, x: start.x + dx, y: start.y + dy }, vp, minSize)), (dx, dy) => commit({ ...start, x: start.x + dx, y: start.y + dy }));
  };

  const onResizeDown = (e: React.PointerEvent): void => {
    const start = rect;
    track(e, (dx, dy) => setRect(clampRect({ ...start, w: start.w + dx, h: start.h + dy }, vp, minSize)), (dx, dy) => commit({ ...start, w: start.w + dx, h: start.h + dy }));
  };
  const onResizeKey = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 48 : 16;
    const d: Record<string, [number, number]> = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] };
    const v = d[e.key];
    if (!v) { return; }
    e.preventDefault();
    commit({ ...rect, w: rect.w + v[0], h: rect.h + v[1] });
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onClose(); }
  };

  const style = (sheet
    ? { '--k-sheet-drag': sheetDrag + 'px' }
    : { '--k-panel-x': rect.x + 'px', '--k-panel-y': rect.y + 'px', '--k-panel-w': rect.w + 'px', '--k-panel-h': rect.h + 'px' }) as unknown as React.CSSProperties;

  return (
    <div ref={ref} {...k('panel')} data-layout={sheet ? 'sheet' : 'floating'} data-k-level="surface-1" role="dialog" aria-modal="false"
      aria-labelledby={titleId} tabIndex={-1} style={style} onKeyDown={onKeyDown} data-dragging={sheetDrag > 0 ? '' : undefined}>
      <LevelProvider level="surface-1">
        <div {...part('head')} onPointerDown={onHeadDown}>
          {sheet ? <span {...part('grip')} aria-hidden="true" /> : null}
          <span {...ornament('panel-head-start')} />
          <h2 {...part('title')} id={titleId}>{title}</h2>
          {actions ? <div {...part('actions')}>{actions}</div> : null}
          <span {...ornament('panel-head-end')} />
          <IconButton label={closeLabel} variant="ghost" onClick={onClose} {...part('close')}><IconClose /></IconButton>
        </div>
        <div {...part('body')}>{children}</div>
        {footer ? <div {...part('foot')}>{footer}</div> : null}
        {sheet ? null : <div {...part('resize')} role="separator" aria-orientation="vertical" aria-label="调整大小（方向键）" tabIndex={0} onPointerDown={onResizeDown} onKeyDown={onResizeKey} />}
      </LevelProvider>
    </div>
  );
}
