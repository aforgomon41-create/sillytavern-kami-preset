/**
 * 部件清单：皮肤能用的全部公开钩子（前端契约第 4 节）。
 * 组件实现只能输出这里登记过的 data-k / data-k-part / 变体 / 装饰槽；皮肤 CSS 检查据此拒绝不存在的钩子。
 * 新增钩子 = 扩展契约的表达能力，要同步写进契约变更记录。
 */
export interface ComponentSpec {
  /** 组件内部的部件（data-k-part） */
  parts: readonly string[];
  /** 变体属性 → 可选值（data-variant / data-tone / data-size / data-role …） */
  variants: Readonly<Record<string, readonly string[]>>;
  /** 会出现的状态（Radix 的 data-state 取值、data-disabled、aria-* 等），供文档与检查参考 */
  states: readonly string[];
}

export const COMPONENTS = {
  /* 表面层级用通用属性 data-k-level（不限于 surface 组件：弹层、对话框、卡片也会带），见 LEVELS */
  surface: { parts: [], variants: {}, states: [] },
  button: { parts: ['label', 'icon', 'spinner'], variants: { variant: ['default', 'primary', 'ghost', 'danger'], size: ['sm', 'md'] }, states: ['disabled', 'busy', 'pressed'] },
  'icon-button': { parts: ['icon'], variants: { variant: ['default', 'ghost'], size: ['sm', 'md'] }, states: ['disabled', 'pressed'] },
  switch: { parts: ['thumb'], variants: { size: ['sm', 'md'] }, states: ['checked', 'unchecked', 'disabled'] },
  checkbox: { parts: ['indicator'], variants: {}, states: ['checked', 'unchecked', 'indeterminate', 'disabled'] },
  tabs: { parts: ['list', 'tab', 'panels', 'panel'], variants: { mode: ['scroll', 'fit'] }, states: ['active', 'inactive', 'disabled'] },
  select: { parts: ['trigger', 'value', 'icon', 'content', 'viewport', 'item', 'item-indicator'], variants: { size: ['sm', 'md'] }, states: ['open', 'closed', 'checked', 'highlighted', 'disabled', 'placeholder'] },
  'text-field': { parts: ['input'], variants: { size: ['sm', 'md'] }, states: ['disabled', 'invalid', 'readonly'] },
  'text-area': { parts: ['input'], variants: {}, states: ['disabled', 'invalid', 'readonly'] },
  field: { parts: ['label', 'control', 'hint', 'error'], variants: { layout: ['stack', 'inline'] }, states: ['invalid', 'disabled'] },
  card: { parts: ['head', 'title', 'meta', 'body', 'foot', 'indicator', 'select', 'info'], variants: { role: ['container', 'choice', 'collapse'] }, states: ['selected', 'open', 'closed', 'disabled'] },
  dialog: { parts: ['overlay', 'content', 'head', 'title', 'description', 'body', 'foot', 'close'], variants: { size: ['sm', 'md', 'lg'] }, states: ['open', 'closed'] },
  panel: { parts: ['head', 'grip', 'title', 'actions', 'close', 'body', 'foot', 'resize'], variants: { layout: ['floating', 'sheet'] }, states: ['dragging'] },
  tooltip: { parts: ['content', 'arrow'], variants: {}, states: ['delayed-open', 'instant-open', 'closed'] },
  badge: { parts: [], variants: { tone: ['neutral', 'accent', 'danger', 'warning', 'success', 'info'] }, states: [] },
  empty: { parts: ['icon', 'title', 'description', 'actions'], variants: {}, states: [] },
  'setting-section': { parts: ['head', 'title', 'badge', 'aside', 'body'], variants: {}, states: [] },
  'setting-row': { parts: ['text', 'label', 'description', 'info', 'control'], variants: {}, states: [] },
  'choice-grid': { parts: [], variants: {}, states: [] },
  nav: { parts: ['item', 'icon', 'label', 'meta', 'chevron'], variants: { layout: ['sidebar', 'list'] }, states: ['active'] },
  segmented: { parts: ['item'], variants: { size: ['sm', 'md'] }, states: ['on', 'off'] },
  'info-button': { parts: [], variants: {}, states: [] },
  popover: { parts: ['content'], variants: {}, states: ['open', 'closed'] },
  toast: { parts: ['message', 'action', 'close'], variants: {}, states: [] },
  spinner: { parts: [], variants: { size: ['sm', 'md'] }, states: [] },
  /* 消息前端（前端重构-消息前端方案；2026-10-28 用户拍板 A–F）。四个前端共用对齐轴与间距节奏，框不框由皮肤决定 */
  'msg-view': { parts: [], variants: {}, states: ['streaming'] },
  'msg-body': { parts: ['head', 'count', 'tools', 'text', 'para', 'narration', 'dialogue', 'quote', 'thought', 'name', 'keyword', 'term', 'scene-break', 'caret', 'raw'], variants: { view: ['rendered', 'raw'] }, states: ['streaming'] },
  'msg-think': { parts: ['head', 'toggle', 'icon', 'title', 'count', 'chevron', 'tools', 'fold', 'body', 'markdown', 'raw'], variants: { view: ['rendered', 'raw'] }, states: ['open', 'closed', 'streaming'] },
  'msg-search': { parts: ['head', 'toggle', 'icon', 'title', 'sites', 'chevron', 'fold', 'body', 'scope', 'facts', 'fact', 'ref', 'sources', 'source', 'status'], variants: {}, states: ['open', 'closed', 'streaming'] },
  'msg-options': { parts: ['head', 'title', 'count', 'mode', 'list', 'item', 'item-head', 'type', 'label', 'text', 'pending'], variants: { mode: ['fill', 'send'] }, states: ['streaming'] }
} as const satisfies Record<string, ComponentSpec>;

export type ComponentName = keyof typeof COMPONENTS;

/** 表面层级（data-k-level）：带这个属性的元素就是一个表面，内部的上下文变量指向本层的配对 */
export const LEVELS = ['bg', 'surface-1', 'surface-2', 'surface-3', 'sunken', 'inverse'] as const;
export type Level = typeof LEVELS[number];

/** 装饰槽（data-k-ornament）：不可交互、aria-hidden、pointer-events: none */
export const ORNAMENTS = ['panel-head-start', 'panel-head-end', 'card-corner', 'empty-art', 'surface-backdrop', 'divider', 'dice'] as const;
export type OrnamentName = typeof ORNAMENTS[number];

/** 导出给构建与检查用的清单 */
export function partsManifest(): { components: Record<string, ComponentSpec>; levels: readonly string[]; ornaments: readonly string[] } {
  return { components: COMPONENTS, levels: LEVELS, ornaments: ORNAMENTS };
}
