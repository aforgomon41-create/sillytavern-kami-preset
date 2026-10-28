/**
 * emoji → 图标（前端契约 6.7）。预设条目名只能写 emoji，皮肤在 skin.json 的 icons 里给映射：
 *   值是平台图标名（registry.ts）→ 画线性图标；值是 data:image/svg+xml → 用遮罩画（跟随 currentColor，配色仍由令牌决定）；
 *   没映射 → 照常显示 emoji。
 */
import * as React from 'react';
import { ICONS } from './registry';

const IconMapContext = React.createContext<Record<string, string>>({});
export const IconMapProvider = IconMapContext.Provider;
export const useIconMap = (): Record<string, string> => React.useContext(IconMapContext);

const LEAD = /^\s*(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;
const SKIN_TONE = /\p{Emoji_Modifier}/gu;

/** 拆出名字开头的 emoji（去掉肤色修饰作为映射键） */
export function splitLeadingEmoji(name: string): { emoji: string | null; key: string | null; text: string } {
  const m = LEAD.exec(name);
  if (!m || !m[1]) { return { emoji: null, key: null, text: name }; }
  return { emoji: m[1], key: m[1].replace(SKIN_TONE, ''), text: name.slice(m[0].length) };
}

/** 映射键的宽松匹配：有无变体选择符 U+FE0F 都认 */
function lookup(map: Record<string, string>, key: string): string | undefined {
  return map[key] ?? map[key.replace(/️/g, '')] ?? map[key + '️'];
}

export function EmojiIcon({ emoji, size = '1.15em' }: { emoji: string; size?: string }): React.JSX.Element {
  const map = useIconMap();
  const v = lookup(map, emoji.replace(SKIN_TONE, ''));
  if (v && ICONS[v]) {
    const C = ICONS[v]!;
    return <span data-k-part="icon" data-k-icon={v} aria-hidden="true" style={{ display: 'inline-flex', width: size, height: size, flex: 'none' }}><C width="100%" height="100%" strokeWidth={1.75} /></span>;
  }
  if (v && v.startsWith('data:image/svg+xml')) {
    const mask = 'url("' + v.replace(/"/g, '%22') + '") center / contain no-repeat';
    return <span data-k-part="icon" data-k-icon="custom" aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, flex: 'none', background: 'currentColor', WebkitMask: mask, mask }} />;
  }
  return <span data-k-part="icon" data-k-icon="emoji" aria-hidden="true" style={{ flex: 'none', lineHeight: 1 }}>{emoji}</span>;
}

const ANY = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

/** 去掉名字里所有 emoji，只留文字（提示条、无障碍名称等纯文本场合用） */
export function stripEmoji(name: string): string {
  return name.replace(ANY, ' ').replace(/\s+/g, ' ').trim();
}

/** 把名字拆成「文字 / emoji」交替的片段（任意位置的 emoji 都拆出来，用户 2026-10-28 要求全部换图标） */
export function splitEmoji(name: string): Array<{ emoji: string } | { text: string }> {
  const out: Array<{ emoji: string } | { text: string }> = [];
  let at = 0;
  for (const m of name.matchAll(ANY)) {
    const i = m.index ?? 0;
    const t = name.slice(at, i).trim();
    if (t) { out.push({ text: t }); }
    out.push({ emoji: m[0] });
    at = i + m[0].length;
  }
  const t = name.slice(at).trim();
  if (t) { out.push({ text: t }); }
  return out;
}

/* 中文词不在字中间断开（keep-all），「深度求索/DeepSeek」这类别名在斜杠后可断；一整段放不下时 break-word 兜底换行。
   不用 overflow-wrap:anywhere——它把最小内容宽度压成一个字，弹性布局里会被挤成一字一行 */
const TEXT: React.CSSProperties = { minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'break-word' };
const slashBreaks = (text: string): React.ReactNode =>
  text.split('/').map((seg, n) => <React.Fragment key={n}>{n ? <>/<wbr /></> : null}{seg}</React.Fragment>);

/**
 * 文字中间 / 结尾的 emoji 画成行内小图标。图标和它前面的一个字包进 nowrap 片段：
 * 换行时图标跟着前一个字走，不会单独掉到下一行（U+2060 对行内块元素不起作用，Chrome 实测）。
 */
function inline(parts: Array<{ emoji: string } | { text: string }>): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const icon = (e: string, key: number): React.ReactNode => <span key={key} style={{ display: 'inline-flex', verticalAlign: '-0.15em', margin: '0 0.2em' }}><EmojiIcon emoji={e} size="1em" /></span>;
  parts.forEach((p, n) => {
    if ('text' in p) {
      const next = parts[n + 1];
      const keepLast = next && 'emoji' in next ? Array.from(p.text) : null;
      const body = keepLast ? keepLast.slice(0, -1).join('') : p.text;
      out.push(<React.Fragment key={n}>{n ? ' ' : null}{slashBreaks(body)}</React.Fragment>);
      if (keepLast && next && 'emoji' in next) {
        out.push(<span key={n + 'g'} style={{ whiteSpace: 'nowrap' }}>{keepLast[keepLast.length - 1]}{icon(next.emoji, 0)}</span>);
      }
    } else if (!(n && 'text' in parts[n - 1]!)) {
      out.push(icon(p.emoji, n));
    }
  });
  return out;
}

/**
 * 预设条目名：所有 emoji 都按皮肤映射显示（开头的是前置图标，中间 / 结尾的跟在文字里），原名留在 title 里，悬停仍看得到。
 * 根元素 max-width:100%：放在卡片标题这类弹性项里时不能按整行文字宽度撑出容器。
 */
export function EntryLabel({ name }: { name: string }): React.JSX.Element {
  const parts = splitEmoji(name);
  const lead = parts[0] && 'emoji' in parts[0] ? parts[0].emoji : null;
  const rest = lead ? parts.slice(1) : parts;
  return (
    <span data-k-part="label" title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', minWidth: 0, maxWidth: '100%' }}>
      {lead ? <EmojiIcon emoji={lead} /> : null}
      {rest.length ? <span style={TEXT}>{inline(rest)}</span> : null}
    </span>
  );
}
