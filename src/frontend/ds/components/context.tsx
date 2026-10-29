/**
 * 表面层级与弹层容器的上下文。
 * · 表面层级自动嵌套：画布里的卡片是 surface-1，卡片里的卡片是 surface-2……（前端契约 5.3「表面上下文」）
 * · 弹层（下拉、对话框、提示）portal 到所在渲染面的弹层容器里，留在同一个 Shadow DOM 内
 */
import * as React from 'react';
import type { Level } from '../parts';

const LevelContext = React.createContext<Level>('bg');
const PortalContext = React.createContext<HTMLElement | null>(null);

export const useLevel = (): Level => React.useContext(LevelContext);
export const usePortal = (): HTMLElement | null => React.useContext(PortalContext);

/** 下一层：bg → surface-1 → surface-2 → surface-3（到顶为止）；凹陷与反色表面里的卡片回到 surface-1 / 保持反色 */
export function nextLevel(l: Level): Level {
  switch (l) {
    case 'bg': return 'surface-1';
    case 'surface-1': return 'surface-2';
    case 'surface-2': case 'surface-3': return 'surface-3';
    case 'sunken': return 'surface-1';
    case 'inverse': return 'inverse';
  }
}

export function PortalProvider({ container, children }: { container: HTMLElement | null; children?: React.ReactNode }): React.JSX.Element {
  return <PortalContext.Provider value={container}>{children}</PortalContext.Provider>;
}

/** 让子树处在某个层级（不输出元素）；用于渲染面根或弹层内容 */
export function LevelProvider({ level, children }: { level: Level; children?: React.ReactNode }): React.JSX.Element {
  return <LevelContext.Provider value={level}>{children}</LevelContext.Provider>;
}

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** 表面：铺本层底色，并把上下文变量指向本层配对；不给 level 就自动取下一层 */
export const Surface = React.forwardRef<HTMLDivElement, DivProps & { level?: Level }>(function Surface({ level, children, ...rest }, ref) {
  const parent = useLevel();
  const lv = level ?? nextLevel(parent);
  return (
    <div ref={ref} data-k="surface" data-k-level={lv} {...rest}>
      <LevelContext.Provider value={lv}>{children}</LevelContext.Provider>
    </div>
  );
});

/**
 * 页签翻页的宿主：面板（Panel）提供，里面开了 swipe 的页签把「翻一页」登记进来，
 * 由面板统一的触屏手势调用（与下拉收回共用一套方向判定，见 ds/gestures.ts）。不在面板里时为 null。
 */
export type SwipeStep = (dir: 1 | -1) => void;
export const SwipeHostContext = React.createContext<React.MutableRefObject<SwipeStep | null> | null>(null);
export const useSwipeHost = (): React.MutableRefObject<SwipeStep | null> | null => React.useContext(SwipeHostContext);

/** 渲染面所在的窗口（酒馆主页面）。⚠️ 运行库代码跑在酒馆助手的脚本 iframe 里，全局 window / matchMedia 是那个看不见的小 iframe 的，
    拿它判断宽窄屏永远是「窄屏」（2026-10-29 实机抓到：1440 宽的电脑上显示面板排成了手机页签）。一律从浮层节点反查。 */
export function useHostWindow(): Window & typeof globalThis {
  const portal = usePortal();
  return ((portal && portal.ownerDocument.defaultView) || window) as Window & typeof globalThis;
}

/** 媒体查询（按渲染面所在窗口算） */
export function useMedia(query: string): boolean {
  const win = useHostWindow();
  const [m, setM] = React.useState(() => { try { return win.matchMedia(query).matches; } catch (e) { return false; } });
  React.useEffect(() => {
    let mq: MediaQueryList;
    try { mq = win.matchMedia(query); } catch (e) { return undefined; }
    const on = (): void => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [win, query]);
  return m;
}

