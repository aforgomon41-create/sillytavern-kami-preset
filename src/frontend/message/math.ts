/**
 * 公式（LaTeX）：用 Temml 渲染成浏览器原生的 MathML，不需要额外字体或样式表。
 *
 * 两个入口：
 *   · splitMath(text)：思维链 / 搜索资料 / 行动选项这些「我们自己从原文渲染」的地方用，把一段文字拆成文字与公式。
 *   · typesetTex(root)：正文用。正文由酒馆自己的 markdown 渲染（showdown 会吃掉 \( \[ \\ 的反斜杠、把公式里的 * _ 变成斜体），
 *     所以构建时加了两条显示用正则（「前端|公式」），在 <content> 范围内把公式原样包进 <code data-kami-tex="i|b">——
 *     code 里的内容 showdown 不动。这里把这些 code 换成渲染好的公式；渲染失败就保留原文。
 *     前端关掉时这些 code 照常显示公式原文（不会被 markdown 吃坏）。
 */
import temml from 'temml';

const cache = new Map<string, string>();

/** TeX → MathML 字符串（Temml 会转义输入；出错时返回 null，调用方显示原文） */
export function texToMathML(tex: string, display: boolean): string | null {
  const key = (display ? 'b:' : 'i:') + tex;
  const hit = cache.get(key);
  if (hit !== undefined) { return hit || null; }
  let out = '';
  try {
    out = temml.renderToString(tex, { displayMode: display, throwOnError: true, annotate: true, trust: false });
  } catch (e) { out = ''; }
  if (cache.size > 500) { cache.clear(); }
  cache.set(key, out);
  return out || null;
}

export type MathPiece = { t: 'text'; v: string } | { t: 'math'; v: string; display: boolean };

/*
 * 定界符：$$…$$ 与 \[…\] 是独立公式；\(…\) 与 $…$ 是行内公式。
 * 行内 $…$ 防误伤（价格「$5 和 $10」、命令行变量 $HOME）：开头的 $ 后面不能是空白、结尾的 $ 前面不能是空白，
 * 两边不能紧贴字母数字，内容不跨行。
 */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(((?:(?!\n\n)[\s\S])+?)\\\)|(?<![\\$\w])\$(?![\s$])([^\n$]+?)(?<![\s\\])\$(?![\w$])/g;

/** 把文字拆成文字段与公式段（公式渲染不了的段落按原文当文字） */
export function splitMath(text: string): MathPiece[] {
  const out: MathPiece[] = [];
  let at = 0;
  MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_RE.exec(text))) {
    const display = m[1] !== undefined || m[2] !== undefined;
    const tex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!tex || texToMathML(tex, display) === null) { continue; }
    if (m.index > at) { out.push({ t: 'text', v: text.slice(at, m.index) }); }
    out.push({ t: 'math', v: tex, display });
    at = m.index + m[0].length;
  }
  if (at < text.length) { out.push({ t: 'text', v: text.slice(at) }); }
  return out;
}

/** 交给酒馆的 messageFormatting 之前：把公式包进 <code data-kami-tex>（markdown 不动 code 里的内容），渲染后再由 typesetTex 换成 MathML */
export function protectMath(md: string): string {
  if (!maybeMath(md)) { return md; }
  MATH_RE.lastIndex = 0;
  return md.replace(MATH_RE, (all, b1?: string, b2?: string, i1?: string, i2?: string) => {
    const display = b1 !== undefined || b2 !== undefined;
    const tex = (b1 ?? b2 ?? i1 ?? i2 ?? '').trim();
    if (!tex) { return all; }
    const esc = tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<code data-kami-tex="' + (display ? 'b' : 'i') + '">' + esc + '</code>';
  });
}

/** 文字里有没有像公式的东西（便宜的预检，省得每段都跑正则） */
export const maybeMath = (s: string): boolean => s.includes('$') || s.includes('\\(') || s.includes('\\[');

/**
 * 正文：把 root 里构建期正则留下的 <code data-kami-tex> 换成公式。返回换掉的个数。
 * 已换过的不会再出现（code 被替换掉了），所以可以反复调用。
 */
export function typesetTex(root: ParentNode): number {
  let n = 0;
  for (const code of Array.from(root.querySelectorAll('code[data-kami-tex]'))) {
    const display = code.getAttribute('data-kami-tex') === 'b';
    const tex = (code.textContent || '').trim();
    const html = tex ? texToMathML(tex, display) : null;
    if (!html) { code.setAttribute('data-kami-tex-error', ''); continue; }
    const doc = code.ownerDocument;
    const box = doc.createElement(display ? 'div' : 'span');
    box.setAttribute('data-kami-math', display ? 'block' : 'inline');
    box.setAttribute('title', tex);
    box.innerHTML = html;
    code.replaceWith(box);
    n++;
  }
  return n;
}

/** 渲染好的公式（React 用）：dangerouslySetInnerHTML 只用于 Temml 的输出（它转义了全部输入） */
export function mathHtml(tex: string, display: boolean): { __html: string } {
  return { __html: texToMathML(tex, display) || '' };
}
