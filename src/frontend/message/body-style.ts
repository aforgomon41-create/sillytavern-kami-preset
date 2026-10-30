/**
 * 正文前端的排版（v0.3，用户 2026-10-29：正文前端开着时由我们渲染，样式是我们的；关掉才交回酒馆）。
 *
 * 渲染分工：markdown / 正则 / HTML 美化交给酒馆（借用酒馆的渲染，插件插的按钮也在这份 DOM 里），
 * 我们在酒馆渲染出的节点上**原地**加结构标记（段落、对白、心理描写、关键词、专有名词、场景转换、公式），
 * 再用我们的样式排版。原地做而不是另建一份 DOM：在我们之前插进去的插件节点不会丢，之后的插件也照常找得到正文。
 *
 * 样式从哪来：设计系统与当前皮肤里写给 [data-k="msg-body"] > [data-k-part="text"] 的规则——和预览里那套正文排版是同一份。
 * 这里把它们抽出来，前缀改写成「#chat [data-kami-msg-text]」放进宿主文档（只作用于我们标记过的正文，不碰酒馆别处）。
 * 颜色按用户的意思用酒馆的字体颜色设置：正文 / 对白 / 心理描写分别是 SmartThemeBodyColor / QuoteColor / EmColor。
 *
 * [data-kami-msg-text] 有三种：
 *   body   我们的正文宿主（Shadow DOM 里是头部 + slot，正文节点是它的子节点）；令牌从影子树经 slot 继承下来
 *   stream 生成中的那一楼的 .mes_text（酒馆每个片段都重写它，标记在下一个微任务里补上，赶在绘制之前）
 *   all    没有正文标记的楼层（老消息、正文正则只作用于最后两条）：整段 .mes_text 当正文排
 *   stream / all 不在影子树里，拿不到令牌：把令牌的当前值写进一条规则（见 tokenRule）。
 */

export const TEXT_ATTR = 'data-kami-msg-text';
const PREFIX = '[data-k="msg-body"] > [data-k-part="text"]';
const SCOPE = '#chat [' + TEXT_ATTR + ']';

/** 不当正文排的东西：酒馆助手的 iframe、我们的其他宿主、代码、公式、插件常用的按钮容器 */
const SKIP = '.TH-render, [data-kami-msg-host]:not([' + TEXT_ATTR + ']), pre, code, script, style, textarea, iframe, math, [data-kami-math], button';

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
    const anyR = r as CSSRule & { selectorText?: string; style?: CSSStyleDeclaration; cssRules?: CSSRuleList; media?: MediaList; conditionText?: string };
    if (anyR.selectorText !== undefined && anyR.style) {
      const picked = splitSelectors(anyR.selectorText).filter((x) => x.startsWith(PREFIX));
      if (!picked.length) { continue; }
      const sels = picked.map((x) => {
        const rest = x.slice(PREFIX.length);
        /* 容器本身的规则（字体、字号、行高）：落到它的子节点上——宿主的子节点经 slot 继承的是影子树，不是宿主 */
        return rest.trim() ? SCOPE + rest : SCOPE + ' > :not([data-kami-msg-host])';
      });
      out.push(sels.join(', ') + ' { ' + anyR.style.cssText + ' }');
    } else if (anyR.cssRules) {
      const inner: string[] = [];
      collect(anyR as unknown as RuleList, inner);
      if (!inner.length) { continue; }
      if (anyR.media) { out.push('@media ' + anyR.media.mediaText + ' { ' + inner.join('\n') + ' }'); }
      else if (anyR.conditionText !== undefined && r.constructor.name.includes('Supports')) { out.push('@supports ' + anyR.conditionText + ' { ' + inner.join('\n') + ' }'); }
      else { out.push(...inner); }   /* @layer 块：拆开放平（宿主文档里不用层，靠 #chat 的权重压过酒馆的 .mes_text 规则） */
    }
  }
}

/** 我们自己的补充：颜色用酒馆设置；段落里的块级内容（列表、表格、引用）不缩进；插件与 iframe 不受段落规则影响 */
const OWN = [
  SCOPE + ' > :not([data-kami-msg-host]) { color: var(--SmartThemeBodyColor, inherit); }',
  SCOPE + ' [data-k-part="dialogue"] { color: var(--SmartThemeQuoteColor, inherit); }',
  SCOPE + ' [data-k-part="thought"] { color: var(--SmartThemeEmColor, inherit); }',
  SCOPE + ' :is(ul, ol, table, blockquote, pre, .TH-render) { text-indent: 0; }',
  SCOPE + ' :is(ul, ol) { padding-left: 1.6em; margin: 0 0 var(--k-read-para, .8em); }',
  SCOPE + ' blockquote { margin: 0 0 var(--k-read-para, .8em); padding-left: .9em; border-left: 2px solid color-mix(in srgb, currentColor 30%, transparent); }',
  SCOPE + ' table { border-collapse: collapse; margin: 0 0 var(--k-read-para, .8em); }',
  SCOPE + ' :is(th, td) { padding: .3em .6em; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); }',
  SCOPE + ' .TH-render { margin: 0 0 var(--k-read-para, .8em); }',
  SCOPE + ' > [data-k-part="para"]:last-child { margin-bottom: 0; }'
];

/**
 * 生成宿主文档里的正文样式。texts：设计系统、皮肤的样式原文（StyleHub.texts()）。
 * 返回样式与用到的令牌名（stream / all 两种拿不到影子树的令牌，要另写值）。
 */
export function bodyCss(win: Window & typeof globalThis, texts: string[]): { css: string; tokens: string[] } {
  const out: string[] = [];
  for (const t of texts) {
    if (!t) { continue; }
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(t);
      collect(sheet, out);
    } catch (e) { /* 样式表解析失败：这一份跳过 */ }
  }
  out.push(...OWN);
  const css = out.join('\n');
  const tokens = [...new Set(Array.from(css.matchAll(/var\((--k-[\w-]+)/g), (m) => m[1]!))];
  return { css, tokens };
}

/** stream / all 两种用的令牌：从一个已挂好的渲染面上读当前值，写成一条规则 */
export function tokenRule(src: Element | null, tokens: string[]): string {
  if (!src) { return ''; }
  const cs = (src.ownerDocument.defaultView as Window).getComputedStyle(src);
  const decl = tokens.map((t) => { const v = cs.getPropertyValue(t).trim(); return v ? t + ': ' + v + ';' : ''; }).filter(Boolean).join(' ');
  return decl ? '#chat [' + TEXT_ATTR + '="stream"], #chat [' + TEXT_ATTR + '="all"] { ' + decl + ' }' : '';
}

const skip = (el: Element): boolean => !!el.closest(SKIP);
const LEAD = /^[\s　]+/;
const TERM = /【[^【】\n]{1,40}】/g;

/** 段首的全角空格去掉（缩进交给 text-indent，和预览里同一种排法；酒馆渲染的段落里原样带着「　　」） */
function stripLead(p: Element): void {
  let n: Node | null = p.firstChild;
  while (n && n.nodeType === 1 && (n as Element).firstChild && !skip(n as Element)) { n = (n as Element).firstChild; }
  if (n && n.nodeType === 3 && LEAD.test(n.nodeValue || '')) { n.nodeValue = (n.nodeValue || '').replace(LEAD, ''); }
}

/**
 * 在 root（宿主或 .mes_text）里原地加结构标记；可以反复调用（已标的不再动）。
 * 只加属性、只在专有名词处拆文字节点，不移动、不替换酒馆或插件的节点。
 */
export function markBody(root: Element): void {
  for (const el of Array.from(root.children)) {
    if (el.hasAttribute('data-k-part') || el.matches(SKIP)) { continue; }
    if (el.tagName === 'P') { el.setAttribute('data-k-part', 'para'); stripLead(el); }
    else if (el.tagName === 'HR') { el.setAttribute('data-k-part', 'scene-break'); }
  }
  const tag = (sel: string, part: string): void => {
    for (const el of Array.from(root.querySelectorAll(sel + ':not([data-k-part])'))) { if (!skip(el)) { el.setAttribute('data-k-part', part); } }
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
    if (!pe || skip(pe) || pe.closest('[data-k-part="term"]')) { continue; }
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
  for (const el of Array.from(root.querySelectorAll('[data-k-part]'))) { if (!el.closest('[data-kami-msg-host]:not([' + TEXT_ATTR + '])')) { el.removeAttribute('data-k-part'); } }
  root.removeAttribute(TEXT_ATTR);
}
