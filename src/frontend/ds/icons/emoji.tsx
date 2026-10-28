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

/** 预设条目名：开头的 emoji 按皮肤映射显示，后面是文字。原 emoji 留在 title 里，悬停仍看得到 */
export function EntryLabel({ name }: { name: string }): React.JSX.Element {
  const { emoji, text } = splitLeadingEmoji(name);
  return (
    <span data-k-part="label" title={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', minWidth: 0 }}>
      {emoji ? <EmojiIcon emoji={emoji} /> : null}
      {/* 中文词不在字中间断开（keep-all），「深度求索/DeepSeek」这类别名在斜杠后可断；
          不用 overflow-wrap:anywhere——它把最小内容宽度压成一个字，弹性布局里会被挤成一字一行 */}
      <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
        {text.split('/').map((seg, n) => <React.Fragment key={n}>{n ? <>/<wbr /></> : null}{seg}</React.Fragment>)}
      </span>
    </span>
  );
}
