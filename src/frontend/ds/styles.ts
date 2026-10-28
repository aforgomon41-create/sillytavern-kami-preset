/**
 * 设计系统的静态样式表：层叠顺序声明 + reset / base（含表面上下文）/ components / lock。
 * 随皮肤变化的 k.tokens 与 k.skin 由皮肤引擎合成（skin-engine/compose.ts），是另一份样式表。
 */
import resetCss from './css/reset.css';
import baseCss from './css/base.css';
import componentsCss from './css/components.css';
import lockCss from './css/lock.css';
import { LEVELS } from './parts';

export const LAYER_ORDER = '@layer k.reset, k.tokens, k.base, k.components, k.skin, k.lock;';

/** 上下文变量：表面里的文字、链接、焦点环一律用这些，指向本层的配对（前端契约 5.3「表面上下文」） */
const CONTEXT_VARS = ['on', 'on-muted', 'on-subtle', 'border', 'divider', 'link', 'focus-ring'] as const;

function contextFor(level: string): string {
  const map: Record<string, string> = {
    on: 'on-' + level, 'on-muted': 'on-' + level + '-muted', 'on-subtle': 'on-' + level + '-subtle',
    border: 'border-' + level, divider: 'divider-' + level, link: 'link-' + level, 'focus-ring': 'focus-ring-' + level
  };
  /* --k-here：本层的底色（吸顶的页签条等需要和所在表面同色的元素用） */
  return CONTEXT_VARS.map((v) => '--k-' + v + ': var(--k-' + map[v] + ');').join(' ') + ' --k-here: var(--k-' + level + ');';
}

/** 渲染面根默认按画布（bg）配对；每个 data-k-level 元素铺自己的底色并把上下文指向本层 */
export function surfaceContextCss(): string {
  const lines = [':host, [data-k-surface] { ' + contextFor('bg') + ' }'];
  for (const lv of LEVELS) {
    lines.push('[data-k-level="' + lv + '"] { background-color: var(--k-' + lv + '); color: var(--k-on-' + lv + '); ' + contextFor(lv) + ' }');
  }
  return lines.join('\n');
}

const wrap = (layer: string, css: string): string => '@layer ' + layer + ' {\n' + css + '\n}\n';

export const DS_CSS: string = LAYER_ORDER + '\n' +
  wrap('k.reset', resetCss) +
  wrap('k.base', baseCss + '\n' + surfaceContextCss()) +
  wrap('k.components', componentsCss) +
  wrap('k.lock', lockCss);
