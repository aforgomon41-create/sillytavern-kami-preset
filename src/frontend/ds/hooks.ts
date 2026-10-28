/** 输出公开钩子的小工具：组件里一律用它们，不手写 data-k 属性名 */
import type { ComponentName, OrnamentName } from './parts';

type Attrs = Record<string, string | undefined>;

/** 组件根：data-k + 变体 */
export function k(name: ComponentName, variants: Attrs = {}): Attrs {
  const out: Attrs = { 'data-k': name };
  for (const [key, v] of Object.entries(variants)) { if (v !== undefined) { out['data-' + key] = v; } }
  return out;
}

/** 部件 */
export const part = (name: string): Attrs => ({ 'data-k-part': name });

/** 装饰槽 */
export const ornament = (name: OrnamentName): Attrs => ({ 'data-k-ornament': name, 'aria-hidden': 'true' });
