/**
 * 皮肤 CSS（L3）检查。前端契约 6.3。只在构建时用（依赖 postcss，不打进运行库）。
 *
 * 规则：
 *   · 禁止 !important、@import、@font-face、@layer（引擎会自动包进 k.skin）、@namespace、@charset
 *   · url() 只允许 data: 的 SVG / PNG / WebP；素材走 var(--k-asset-*)；禁止 expression / behavior / -moz-binding
 *   · 每条选择器必须从公开钩子出发：[data-k…]、:host（部件、组件、装饰槽、渲染面根），且钩子名必须在部件清单（ds/parts.ts）里登记过
 *   · 结构属性（position / inset / top… / z-index / display / overflow / pointer-events / visibility / float / contain）
 *     只能写在装饰槽 [data-k-ornament…] 或 ::before / ::after 上；渲染面与面板类组件不许 transform
 */
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import { COMPONENTS, LEVELS, ORNAMENTS } from '../ds/parts';

const KNOWN_K = new Set(Object.keys(COMPONENTS));
const KNOWN_PART = new Set(Object.values(COMPONENTS).flatMap((c) => [...c.parts]));
const KNOWN_ORN = new Set<string>(ORNAMENTS);
const KNOWN_LEVEL = new Set<string>(LEVELS);
/* 容器组件之后、在遇到下一个组件之前，没经过 > 就碰到了部件 → 后代选择器泄漏 */
const LEAK = /\[data-k=["']?(panel|dialog|card|setting-section|setting-row)["']?\](?:\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?)*\s+(?:(?!\[data-k=)[^>])*?\[data-k-part/;
const HOOK_VALUE = /\[(data-k(?:-part|-ornament|-level)?)\s*[~|^$*]?=\s*["']?([\w-]+)["']?\s*\]/g;

export interface LintIssue { line: number; message: string }

const ALLOWED_AT = new Set(['media', 'supports', 'keyframes', 'container']);
const STRUCTURAL = new Set(['position', 'inset', 'inset-block', 'inset-inline', 'top', 'right', 'bottom', 'left', 'z-index', 'display',
  'overflow', 'overflow-x', 'overflow-y', 'pointer-events', 'visibility', 'float', 'contain', 'content-visibility']);
const SURFACE_LIKE = /\[data-k-surface|\[data-k=["']?(panel|dialog|sheet|popover|menu|tooltip)["']?\]/;
const HOOK = /\[data-k|:host/;
const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const SAFE_DATA = /^data:image\/(svg\+xml|png|webp)[;,]/i;

function insideKeyframes(node: postcss.Node): boolean {
  let p = node.parent;
  while (p) { if (p.type === 'atrule' && /keyframes$/i.test((p as AtRule).name)) { return true; } p = p.parent as postcss.Node['parent']; }
  return false;
}

export function lintSkinCss(css: string): LintIssue[] {
  const issues: LintIssue[] = [];
  let root: postcss.Root;
  try { root = postcss.parse(css); } catch (e) {
    const err = e as { line?: number; reason?: string; message?: string };
    return [{ line: err.line || 0, message: 'CSS 解析失败：' + (err.reason || err.message) }];
  }
  const at = (n: postcss.Node): number => (n.source && n.source.start ? n.source.start.line : 0);

  root.walkAtRules((a: AtRule) => {
    const name = a.name.toLowerCase().replace(/^-\w+-/, '');
    if (!ALLOWED_AT.has(name)) { issues.push({ line: at(a), message: '不允许 @' + a.name + (name === 'layer' ? '（引擎会自动包进 k.skin）' : name === 'font-face' ? '（Shadow DOM 里不生效；外链字体请在 skin.json 的 fonts 里声明，平台负责加载与兜底）' : '') }); }
  });

  root.walkRules((r: Rule) => {
    if (insideKeyframes(r)) { return; }
    for (const sel of r.selectors) {
      if (!HOOK.test(sel)) { issues.push({ line: at(r), message: '选择器必须从公开钩子出发（[data-k…] 或 :host）：' + sel.trim() }); }
      /* 容器组件（面板、对话框、卡片、设置分组 / 设置行）的部件必须用直接子元素选择器 >：
         写成后代选择器会误伤嵌套在里面的其他组件的同名部件（旧系统 .kami-card 的老问题） */
      if (LEAK.test(sel)) { issues.push({ line: at(r), message: '容器组件的部件请用 > 直接子元素选择器（后代选择器会误伤嵌套组件的同名部件）：' + sel.trim() }); }
      /* 钩子必须在部件清单里登记过：写错名字的规则会静默失效 */
      let m: RegExpExecArray | null;
      HOOK_VALUE.lastIndex = 0;
      while ((m = HOOK_VALUE.exec(sel))) {
        const [attr, val] = [m[1], m[2] || ''];
        const known = attr === 'data-k' ? KNOWN_K : attr === 'data-k-part' ? KNOWN_PART : attr === 'data-k-ornament' ? KNOWN_ORN : KNOWN_LEVEL;
        if (!known.has(val)) { issues.push({ line: at(r), message: '部件清单里没有这个钩子：[' + attr + '="' + val + '"]' }); }
      }
    }
  });

  root.walkDecls((d: Declaration) => {
    const prop = d.prop.toLowerCase();
    if (d.important) { issues.push({ line: at(d), message: '不允许 !important：' + d.prop }); }
    if (/expression\s*\(/i.test(d.value) || prop === 'behavior' || prop === '-moz-binding') { issues.push({ line: at(d), message: '不允许脚本类属性：' + d.prop }); }
    let m: RegExpExecArray | null;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(d.value))) {
      if (!SAFE_DATA.test((m[2] || '').trim())) { issues.push({ line: at(d), message: 'url() 只允许 data: 图片；素材（包括外链图片）请在 skin.json 的 assets 里声明、用 var(--k-asset-名字)，平台负责兜底：' + (m[2] || '').slice(0, 60) }); }
    }
    if (insideKeyframes(d)) { return; }
    const rule = d.parent as Rule | undefined;
    const sels = rule && rule.type === 'rule' ? rule.selectors : [];
    if (STRUCTURAL.has(prop)) {
      const bad = sels.filter((s) => !/\[data-k-ornament/.test(s) && !/::?(before|after)\b/.test(s));
      if (bad.length) { issues.push({ line: at(d), message: '结构属性 ' + d.prop + ' 只能写在装饰槽或 ::before / ::after 上：' + bad.join(', ') }); }
    }
    if (prop === 'transform' || prop === 'translate' || prop === 'scale' || prop === 'rotate') {
      const bad = sels.filter((s) => SURFACE_LIKE.test(s) && !/::?(before|after)\b/.test(s) && !/\[data-k-ornament/.test(s));
      if (bad.length) { issues.push({ line: at(d), message: '渲染面与面板类组件不许 ' + d.prop + '（几何归平台）：' + bad.join(', ') }); }
    }
  });
  return issues;
}
