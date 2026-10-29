/**
 * 轻量 Markdown（思维链的「排版」视图、引导里的免责声明等长文用）：标题、列表、引用、代码块、分隔线、表格、段落；行内粗体 / 斜体 / 行内代码。
 * 只输出 React 节点、不拼 HTML 字符串，模型输出里的尖括号原样显示，没有注入风险。
 * 够用即可：表格只认标准的竖线表（第二行是 |---| 分隔行）；表格外面包一层可横向滚动的容器，窄屏不撑破。
 */
import * as React from 'react';

function inline(s: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_/g;
  let at = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(s))) {
    if (m.index > at) { out.push(s.slice(at, m.index)); }
    const k = key + '-' + n++;
    if (m[1] !== undefined) { out.push(<code key={k}>{m[1]}</code>); }
    else if (m[2] !== undefined || m[3] !== undefined) { out.push(<strong key={k}>{m[2] ?? m[3]}</strong>); }
    else { out.push(<em key={k}>{m[4] ?? m[5]}</em>); }
    at = m.index + m[0].length;
  }
  if (at < s.length) { out.push(s.slice(at)); }
  return out;
}

/** 多行段落：行与行之间保留换行（思维链常是一行一个念头） */
const lines = (ls: string[], key: string): React.ReactNode[] =>
  ls.flatMap((l, i) => (i ? [<br key={key + 'br' + i} />, ...inline(l, key + 'l' + i)] : inline(l, key + 'l' + i)));

export function Markdown({ text }: { text: string }): React.JSX.Element {
  /* 角色名标记 <n>名字</n> 在思维链里只显示名字 */
  const src = text.replace(/\r\n?/g, '\n').replace(/<\/?n>/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0, n = 0;
  while (i < src.length) {
    const line = src[i]!;
    const key = 'b' + n++;
    if (!line.trim()) { i++; continue; }
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < src.length && !/^```/.test(src[i]!)) { body.push(src[i]!); i++; }
      i++;
      out.push(<pre key={key}><code>{body.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const H = ('h' + Math.min(6, h[1]!.length + 3)) as 'h4'; out.push(<H key={key}>{inline(h[2]!, key)}</H>); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(<hr key={key} />); i++; continue; }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < src.length && /^\s*>/.test(src[i]!)) { body.push(src[i]!.replace(/^\s*>\s?/, '')); i++; }
      out.push(<blockquote key={key}>{lines(body, key)}</blockquote>);
      continue;
    }
    /* 表格：| a | b | 后面紧跟 |---|---| */
    const cells = (l: string): string[] => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < src.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(src[i + 1]!)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < src.length && /^\s*\|.*\|\s*$/.test(src[i]!)) { rows.push(cells(src[i]!)); i++; }
      out.push(
        <div key={key} data-k-swipe="off" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, key + 'h' + j)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{head.map((_, j) => <td key={j}>{inline(r[j] || '', key + 'r' + ri + 'c' + j)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const li = /^\s*(?:[-*+]|(\d+)[.)、])\s+/;
    if (li.test(line)) {
      /* 列表：条目之间隔空行也算同一个列表（编号不从 1 重来）；缩进的下一行（含缩进的引用 >）并进上一条 */
      const first = li.exec(line)!;
      const ordered = !!first[1];
      const items: string[][] = [];
      while (i < src.length) {
        const l = src[i]!;
        const m = li.exec(l);
        if (m && !!m[1] === ordered) { items.push([l.replace(li, '')]); i++; continue; }
        if (!l.trim()) {
          let j = i; while (j < src.length && !src[j]!.trim()) { j++; }
          const nx = j < src.length ? li.exec(src[j]!) : null;
          if ((nx && !!nx[1] === ordered) || (j < src.length && /^\s{2,}\S/.test(src[j]!) && !li.test(src[j]!))) { i = j; continue; }
          break;
        }
        if (/^\s{2,}\S/.test(l) && items.length) { items[items.length - 1]!.push(l.trim().replace(/^>\s?/, '')); i++; continue; }
        break;
      }
      const L = ordered ? 'ol' : 'ul';
      const start = ordered ? Number(first[1]) : 1;
      out.push(<L key={key} {...(ordered && start !== 1 ? { start } : {})}>{items.map((t, j) => <li key={j}>{lines(t, key + 'i' + j)}</li>)}</L>);
      continue;
    }
    const para: string[] = [];
    while (i < src.length && src[i]!.trim() && !/^```|^#{1,6}\s|^\s*>|^\s*\|.*\|\s*$/.test(src[i]!) && !li.test(src[i]!)) { para.push(src[i]!); i++; }
    out.push(<p key={key}>{lines(para, key)}</p>);
  }
  return <>{out}</>;
}
