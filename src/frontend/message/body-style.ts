/**
 * 消息内容的统一渲染（v0.4，用户 2026-10-30：正文、思维链、搜索资料、行动选项以及以后依附于消息的前端，渲染逻辑统一）。
 *
 * 一条管线：
 *   ① 内容由酒馆渲染（正文：酒馆渲染好的 .mes_text；其他：酒馆的 messageFormatting）——Markdown、HTML 美化、正则都和酒馆一致；
 *      公式先保护成 <code data-kami-tex>（math.ts），渲染后换成 MathML；
 *   ② 内容留在页面 DOM 里（经 slot 显示在我们的外壳里），插件插的节点不会丢、之后的插件也找得到；
 *   ③ markBody 在节点上原地加结构标记（段落、对白、心理描写、关键词、专有名词、场景转换）；
 *   ④ 样式：设计系统与皮肤里以 [data-k-content 开头的内容规则——影子树（预览、面板）里直接生效；页面里的内容由这里抽出来、
 *      加 #chat 前缀放进宿主文档（只作用于标了 data-k-content 的内容）。令牌、颜色、字体经 slot 从外壳继承。
 */

export const TEXT_ATTR = 'data-k-content';

/** 不当正文排的东西：酒馆助手的 iframe、我们的其他宿主、代码、公式、插件常用的按钮 */
const SKIP = '.TH-render, [data-kami-msg-host], pre, code, script, style, textarea, iframe, math, [data-kami-math], button';

/** 按最外层逗号切选择器（:is(a, b) 里的逗号不切） */
function splitSelectors(sel: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') { depth++; } else if (ch === ')' || ch === ']') { depth--; }
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out;
}

type RuleList = { cssRules: CSSRuleList };

function collect(list: RuleList, out: string[]): void {
  for (const r of Array.from(list.cssRules)) {
    const anyR = r as CSSRule & { selectorText?: string; style?: CSSStyleDeclaration; cssRules?: CSSRuleList; media?: MediaList };
    if (anyR.selectorText !== undefined && anyR.style) {
      const picked = splitSelectors(anyR.selectorText).filter((x) => x.startsWith('[data-k-content'));
      if (picked.length) { out.push(picked.map((x) => '#chat ' + x).join(', ') + ' { ' + anyR.style.cssText + ' }'); }
    } else if (anyR.cssRules) {
      const inner: string[] = [];
      collect(anyR as unknown as RuleList, inner);
      if (!inner.length) { continue; }
      if (anyR.media) { out.push('@media ' + anyR.media.mediaText + ' { ' + inner.join('\n') + ' }'); }
      else { out.push(...inner); }   /* @layer 块：拆开放平（页面里不用层，靠 #chat 的权重压过酒馆的 .mes_text 规则） */
    }
  }
}

/** 宿主文档里的内容样式。texts：设计系统、皮肤的样式原文（StyleHub.texts()） */
export function bodyCss(win: Window & typeof globalThis, texts: string[]): string {
  const out: string[] = [];
  for (const t of texts) {
    if (!t) { continue; }
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(t);
      collect(sheet, out);
    } catch (e) { /* 样式表解析失败：这一份跳过 */ }
  }
  return out.join('\n');
}

/** el 在 root 里面是不是落在「不排」的东西里（root 外面的祖先不算——内容容器本身就挂在我们的宿主下） */
function skipIn(root: Element, el: Element): boolean {
  const m = el.closest(SKIP);
  return !!m && m !== root && root.contains(m);
}
const LEAD = /^[\s　]+/;
const TERM = /【[^【】\n]{1,40}】/g;

/** 段首的全角空格去掉（缩进交给 text-indent，和预览里同一种排法；酒馆渲染的段落里原样带着「　　」） */
function stripLead(root: Element, p: Element): void {
  let n: Node | null = p.firstChild;
  while (n && n.nodeType === 1 && (n as Element).firstChild && !skipIn(root, n as Element)) { n = (n as Element).firstChild; }
  if (n && n.nodeType === 3 && LEAD.test(n.nodeValue || '')) { n.nodeValue = (n.nodeValue || '').replace(LEAD, ''); }
}

/**
 * 在 root（宿主或 .mes_text）里原地加结构标记；可以反复调用（已标的不再动）。
 * 只加属性、只在专有名词处拆文字节点，不移动、不替换酒馆或插件的节点。
 */
export function markBody(root: Element): void {
  for (const el of Array.from(root.children)) {
    if (el.hasAttribute('data-k-part') || el.matches(SKIP)) { continue; }
    if (el.tagName === 'P') { el.setAttribute('data-k-part', 'para'); stripLead(root, el); }
    else if (el.tagName === 'HR') { el.setAttribute('data-k-part', 'scene-break'); }
  }
  const tag = (sel: string, part: string): void => {
    for (const el of Array.from(root.querySelectorAll(sel + ':not([data-k-part])'))) { if (!skipIn(root, el)) { el.setAttribute('data-k-part', part); } }
  };
  tag('q', 'dialogue');
  tag('em, i', 'thought');
  tag('strong, b', 'keyword');
  /* 专有名词【…】：拆出来包一层 */
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (!t.nodeValue || !t.nodeValue.includes('【')) { continue; }
    const pe = t.parentElement;
    if (!pe || skipIn(root, pe) || pe.closest('[data-k-part="term"]')) { continue; }
    TERM.lastIndex = 0;
    if (TERM.test(t.nodeValue)) { hits.push(t); }
  }
  for (const t of hits) {
    const s = t.nodeValue || '';
    const frag = doc.createDocumentFragment();
    let at = 0;
    TERM.lastIndex = 0;
    for (let m = TERM.exec(s); m; m = TERM.exec(s)) {
      if (m.index > at) { frag.appendChild(doc.createTextNode(s.slice(at, m.index))); }
      const span = doc.createElement('span');
      span.setAttribute('data-k-part', 'term');
      span.textContent = m[0];
      frag.appendChild(span);
      at = m.index + m[0].length;
    }
    if (at < s.length) { frag.appendChild(doc.createTextNode(s.slice(at))); }
    t.replaceWith(frag);
  }
}

/** 收回标记（关掉前端时）：属性去掉，专有名词的包裹拆掉。段首空格已经去掉的不补回（酒馆下次渲染这一楼时自然恢复） */
export function unmarkBody(root: Element): void {
  for (const el of Array.from(root.querySelectorAll('[data-k-part="term"]'))) { el.replaceWith(root.ownerDocument.createTextNode(el.textContent || '')); }
  for (const el of Array.from(root.querySelectorAll('[data-k-part]'))) { el.removeAttribute('data-k-part'); }
  root.removeAttribute(TEXT_ATTR);
}
