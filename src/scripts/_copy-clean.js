/* ============================================================================
 * 「只复制干净的正文」—— 两个前端（💭 显式思维链 / 📄 正文外壳）共用的一份取文本规则
 * ----------------------------------------------------------------------------
 * 为什么要有这一份：两个前端各有一个「复制」按钮。改之前它们都是把手上那份**原始文本**
 * 直接丢进剪贴板，复制出来会带着思维链标签、状态栏占位符、大括号宏指令，
 * 还有前端自己的界面文字。用户 2026-10-05 的要求是：复制只给**干净的带排版的正文**，
 * 想要完整原文的人自己去酒馆的编辑功能里拿 —— 所以也不再加第二个「复制原文」按钮。
 *
 * 为什么从**渲染后的 DOM** 取，而不是拿正则去清洗原始文本：
 *   ① 原始文本里混着思维链标签、状态栏标签、自闭合占位符、HTML 注释、大括号宏指令，
 *      正则要一条条认全，还得小心别把正文里正常的尖括号和大括号误伤 ——
 *      规则只会越堆越多，而且永远漏一条。
 *   ② 渲染后的 DOM 已经把「该显示什么」算完了：正文里的 HTML 美化卡片就是渲染结果，
 *      取它的可见文本天然等于用户看到的样子，也不可能把 HTML 源码复制出去。
 *   ③ 段落、列表、引用之间的换行在 DOM 里就是块级元素的边界，照着边界还原即可，
 *      不需要去猜哪一行是分隔、哪一行是内容。
 *
 * 排除界面元素只用**明确清单**，绝不按 .kami- 前缀通配 ——
 *   正文里的 HTML 美化卡片本身就是 .kami- 开头的，一通配就会把用户真正想要的内容删掉。
 *
 * 内联规则与其它共享模块一致：零 import、只有行首 export；构建期由
 * build/kami-doc.mjs 的 expandCopyClean 去掉行首 export 后内联进两个使用者。
 * ============================================================================ */

/* 整块跳过的标签：要么不是正文，要么是前端自己的控件 */
export var COPY_DROP_TAGS = {
  BUTTON: 1, INPUT: 1, SELECT: 1, OPTION: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1,
  NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, CANVAS: 1, IFRAME: 1
};

/* 带这些属性的节点是界面（前端自己标的，见两个前端各自的根节点） */
export var COPY_DROP_ATTRS = [
  'data-kami-ui', 'data-kami-nocopy', 'data-kami-act',
  'data-kami-slot', 'data-kami-view-btn', 'data-kami-body-copy'
];

/* 带这些类名的节点是界面。**明确列举，不用通配** —— 理由见文件头。 */
export var COPY_DROP_CLASSES = [
  'kami-raw', 'kami-collapse-head', 'kami-head', 'kami-seg', 'kami-seg-item',
  'kami-actions', 'kami-title', 'kami-sub', 'kami-count', 'kami-toast', 'kami-empty'
];

/* 段级元素：前后各补一个换行 —— 相邻两段之间因此空一行，和看到的排版一致 */
export var COPY_BLOCK_TAGS = {
  P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
  BLOCKQUOTE: 1, PRE: 1, TABLE: 1, SECTION: 1, ARTICLE: 1, HEADER: 1,
  FOOTER: 1, FIGURE: 1, FIGCAPTION: 1, DL: 1, DT: 1, DD: 1, ADDRESS: 1,
  MAIN: 1, ASIDE: 1, DETAILS: 1, SUMMARY: 1, HR: 1
};

/* 行级元素：只在**前面**补一个换行，后面不补。
   为什么单列一类：列表项和表格行彼此是紧挨着的行，不是段落。
   要是它们也算段级，<li>甲</li><li>乙</li> 会变成「甲」空行「乙」，
   粘出去就成了两个段落 —— 而用户看到的明明是一行一条。
   UL/OL 本身不补换行：孩子（li）已经补过了，父元素再补就会多出空行。 */
export var COPY_LINE_TAGS = { LI: 1, TR: 1 };

/** 这个节点是不是前端界面（该整块丢掉） */
export function isCopyUiNode(el) {
  if (!el || !el.nodeName) { return false; }
  var tag = String(el.nodeName).toUpperCase();
  if (COPY_DROP_TAGS[tag]) { return true; }
  if (!el.getAttribute) { return false; }
  var i, v;
  for (i = 0; i < COPY_DROP_ATTRS.length; i++) {
    v = el.getAttribute(COPY_DROP_ATTRS[i]);
    if (v !== null && v !== undefined && v !== '') { return true; }
  }
  var cls = ' ' + String(el.className || '') + ' ';
  for (i = 0; i < COPY_DROP_CLASSES.length; i++) {
    if (cls.indexOf(' ' + COPY_DROP_CLASSES[i] + ' ') >= 0) { return true; }
  }
  return false;
}

/** 递归取文本：文本节点原样，块级元素补换行，界面元素整块丢掉 */
export function copyWalk(node) {
  if (!node) { return ''; }
  if (node.nodeType === 3) { return String(node.nodeValue == null ? '' : node.nodeValue); }
  if (node.nodeType !== 1) { return ''; }
  if (isCopyUiNode(node)) { return ''; }
  var tag = String(node.nodeName).toUpperCase();
  if (tag === 'BR') { return '\n'; }
  var kids = node.childNodes || [], i, s = '';
  for (i = 0; i < kids.length; i++) { s += copyWalk(kids[i]); }
  /* 表格：单元格之间用制表符，行与行之间靠 TR 的换行 —— 结构不至于糊成一坨 */
  if (tag === 'TD' || tag === 'TH') { return s + '\t'; }
  if (COPY_LINE_TAGS[tag]) { return '\n' + s; }
  if (COPY_BLOCK_TAGS[tag]) { return '\n' + s + '\n'; }
  return s;
}

/** 收尾：统一换行符、去掉行尾空白、最多留一个空行、去掉首尾空行。
    注意：本文件**不许出现美元符号**（含正则里的行尾锚点）—— 前端那条构建链会把每个
    美元符号加倍，锚点会被写成两个、正则就废了。所以首尾空行用逐个砍的方式，不写锚点。 */
export function tidyCopyText(s) {
  var out = String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  while (out.charAt(0) === '\n') { out = out.slice(1); }
  while (out.length && out.charAt(out.length - 1) === '\n') { out = out.slice(0, -1); }
  return out;
}

/**
 * 从**渲染后的容器**取「干净的带排版的正文」。
 * 传进来的应该是正文渲染容器（.kami-md / .kami-body-render），不是整个组件根；
 * 就算传了整个根也不会带出界面文字 —— 界面元素会被上面那份清单摘掉。
 * 克隆一份再走，**不动真实 DOM**。
 */
export function cleanCopyText(node) {
  if (!node) { return ''; }
  var clone = null;
  try { clone = node.cloneNode(true); } catch (e) { clone = node; }
  var text = '';
  try { text = copyWalk(clone); } catch (e2) { text = String(node.textContent || ''); }
  return tidyCopyText(text);
}
