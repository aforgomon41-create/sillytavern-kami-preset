/**
 * 消息前端（前端重构-消息前端方案 第六节，用户 2026-10-28 拍板）：
 *   A 正文由我们渲染；B 对白 / 心理描写 / 专有名词按方案建议；C 电脑、手机都两字缩进；
 *   D 行动选项留在消息末尾，只有最新一条回复渲染；E 生成期间就用我们的排版逐步渲染；F 思维链默认折叠、显示字数。
 * 四个前端共用一条对齐轴（--k-read-measure）与间距节奏；三种存在感：正文（主体）、思维链 / 搜索资料（边注，默认收起）、行动选项（操作）。
 * 这里只管结构与状态，外观全部由皮肤通过钩子决定（data-k="msg-*"）。
 */
import * as React from 'react';
import { k, part } from '../ds/hooks';
import { IconChevronDown, IconCode, IconCopy } from '../ds/icons';
import { ICONS } from '../ds/icons/registry';
import { Badge, IconButton, Segmented, Spinner } from '../ds';
import { Markdown } from './markdown';
import { countChars, parseBody, siteOf, splitReply, type Inline, type OptionItem, type SearchRecord } from './parse';

/** 复制到剪贴板（消息在宿主页面里，clipboard API 不可用时退回 execCommand） */
export async function copyText(doc: Document, text: string): Promise<boolean> {
  try { await doc.defaultView!.navigator.clipboard.writeText(text); return true; } catch (e) { /* 退回旧办法 */ }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    doc.body.appendChild(ta); ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

function CopyButton({ text, label }: { text: string; label: string }): React.JSX.Element {
  const [done, setDone] = React.useState(false);
  const ref = React.useRef<HTMLButtonElement>(null);
  return (
    <IconButton ref={ref} size="sm" variant="ghost" label={done ? '已复制' : label}
      onClick={() => { void copyText(ref.current!.ownerDocument, text).then((ok) => { setDone(ok); window.setTimeout(() => setDone(false), 1500); }); }}>
      <IconCopy width={16} height={16} />
    </IconButton>
  );
}

/* ───────── 正文 ───────── */

function renderInline(xs: Inline[], key: string): React.ReactNode[] {
  return xs.map((x, i) => {
    const kk = key + i;
    switch (x.t) {
      case 'text': return <React.Fragment key={kk}>{x.v}</React.Fragment>;
      case 'name': return <span key={kk} {...part('name')}>{x.v}</span>;
      case 'term': return <span key={kk} {...part('term')}>【{x.v}】</span>;
      case 'keyword': return <strong key={kk} {...part('keyword')}>{renderInline(x.kids, kk)}</strong>;
      case 'thought': return <em key={kk} {...part('thought')}>{renderInline(x.kids, kk)}</em>;
      case 'dialogue': return (
        <span key={kk} {...part('dialogue')}>
          <span {...part('quote')}>{x.open}</span>{renderInline(x.kids, kk)}{x.close ? <span {...part('quote')}>{x.close}</span> : null}
        </span>
      );
    }
  });
}

export function MsgBody({ text, streaming }: { text: string; streaming: boolean }): React.JSX.Element {
  const [raw, setRaw] = React.useState(false);
  const blocks = React.useMemo(() => parseBody(text), [text]);
  const last = blocks.length - 1;
  return (
    <section {...k('msg-body', { view: raw ? 'raw' : 'rendered' })} data-streaming={streaming ? '' : undefined} aria-busy={streaming || undefined}>
      {/* 头部：字数 + 工具（用户 2026-10-28：相关按钮放在前端头部，不放尾部）。生成中只显示字数 */}
      <div {...part('head')}>
        <span {...part('count')}>{countChars(text)} 字</span>
        {streaming ? null : (
          <span {...part('tools')}>
            <IconButton size="sm" variant="ghost" label={raw ? '看排版' : '看原文'} aria-pressed={raw} onClick={() => setRaw(!raw)}><IconCode width={16} height={16} /></IconButton>
            <CopyButton text={text.trim()} label="复制正文" />
          </span>
        )}
      </div>
      {raw ? <pre {...part('raw')}>{text.trim()}</pre> : (
        <div {...part('text')}>
          {blocks.map((b, i) => (b.t === 'scene'
            ? <hr key={i} {...part('scene-break')} />
            : <p key={i} {...part('para')}>{renderInline(b.kids, 'p' + i)}{streaming && i === last ? <span {...part('caret')} aria-hidden="true" /> : null}</p>))}
          {streaming && (last < 0 || blocks[last]!.t === 'scene') ? <p {...part('para')}><span {...part('caret')} aria-hidden="true" /></p> : null}
        </div>
      )}
    </section>
  );
}

/**
 * 折叠外壳：内容一直在 DOM 里，收起 / 展开靠 CSS 的行高过渡（0fr ↔ 1fr），收起也有动画；
 * 收起时 inert（不可聚焦、读屏跳过）。碎光的「沿线铺开 / 收拢」由 fx/fracture.ts 监听 data-state 来画。
 */
function Fold({ open, id, children }: { open: boolean; id: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div {...part('fold')} data-state={open ? 'open' : 'closed'} {...(open ? {} : { inert: '' as unknown as boolean, 'aria-hidden': true })}>
      <div {...part('body')} id={id}>{children}</div>
    </div>
  );
}

/* ───────── 思维链 ───────── */

export function MsgThink({ text, streaming, thinker = '奈亚子' }: { text: string; streaming: boolean; thinker?: string }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [raw, setRaw] = React.useState(false);
  const id = React.useId();
  const n = Array.from(text.replace(/\s/g, '')).length;
  const Brain = ICONS['brain']!;
  return (
    <section {...k('msg-think', { view: raw ? 'raw' : 'rendered' })} data-state={open ? 'open' : 'closed'} data-streaming={streaming ? '' : undefined}>
      {/* 头部：左边是展开 / 收起（「奈亚子思考了 N 字」），展开后右边是排版 / 原文与复制（按钮里不能嵌按钮，所以分开） */}
      <div {...part('head')}>
        <button type="button" {...part('toggle')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          <span {...part('icon')} aria-hidden="true">{streaming ? <Spinner size="sm" label="思考中" /> : <Brain width="100%" height="100%" strokeWidth={1.75} />}</span>
          <span {...part('title')}>{thinker + (streaming ? '思考中' : '思考了')}</span>
          <span {...part('count')}>{n} 字</span>
          <span {...part('chevron')} aria-hidden="true"><IconChevronDown width={16} height={16} /></span>
        </button>
        {open ? (
          <span {...part('tools')}>
            <Segmented size="sm" label="显示方式" value={raw ? 'raw' : 'md'} onValueChange={(v) => setRaw(v === 'raw')} options={[{ value: 'md', label: '排版' }, { value: 'raw', label: '原文' }]} />
            <CopyButton text={text} label="复制思维链" />
          </span>
        ) : null}
      </div>
      <Fold open={open} id={id}>
        {raw ? <pre {...part('raw')}>{text}</pre> : <div {...part('markdown')}><Markdown text={text} /></div>}
      </Fold>
    </section>
  );
}

/* ───────── 搜索资料 ───────── */

export function MsgSearch({ records, pending }: { records: SearchRecord[]; pending: boolean }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const sources = records.flatMap((r) => r.sources);
  const sites = [...new Set(sources.map((s) => siteOf(s.url)))];
  const Search = ICONS['search']!;
  return (
    <section {...k('msg-search')} data-state={open ? 'open' : 'closed'} data-streaming={pending ? '' : undefined}>
      <div {...part('head')}>
      <button type="button" {...part('toggle')} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} disabled={!records.length}>
        <span {...part('icon')} aria-hidden="true">{pending ? <Spinner size="sm" label="整理资料中" /> : <Search width="100%" height="100%" strokeWidth={1.75} />}</span>
        <span {...part('title')}>{records.length ? '参考了 ' + sources.length + ' 个来源' : '正在整理资料'}</span>
        {sites.length ? <span {...part('sites')}>{sites.slice(0, 3).join(' · ')}{sites.length > 3 ? ' 等' : ''}</span> : null}
        {records.length ? <span {...part('chevron')} aria-hidden="true"><IconChevronDown width={16} height={16} /></span> : null}
      </button>
      </div>
      <Fold open={open} id={id}>
          {records.map((r, ri) => {
            const num = new Map(r.sources.map((s, i) => [s.id, i + 1]));
            return (
              <div key={ri}>
                {r.world ? <p {...part('scope')}>范围{r.origin === 'native' ? '（模型自带搜索）' : ''}：{r.world}</p> : null}
                {r.facts.length ? (
                  <ol {...part('facts')}>
                    {r.facts.map((f, i) => <li key={i} {...part('fact')}>{f.text}{f.source_ids.map((sid) => <sup key={sid} {...part('ref')}>[{num.get(sid)}]</sup>)}</li>)}
                  </ol>
                ) : <p {...part('status')}>{r.status === 'not_found' ? '本次没有找到可用资料。' : r.status === 'budget_exceeded' ? '资料超过本轮长度预算，未加入新事实。' : '本次没有需要补充的新事实。'}</p>}
                {r.sources.length ? (
                  <ol {...part('sources')}>
                    {r.sources.map((s, i) => <li key={s.id} {...part('source')} value={i + 1}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || siteOf(s.url)}</a> <span>{siteOf(s.url)}</span></li>)}
                  </ol>
                ) : null}
              </div>
            );
          })}
      </Fold>
    </section>
  );
}

/* ───────── 行动选项 ───────── */

export type OptionMode = 'fill' | 'send';
const TONE: Record<string, 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  行动: 'accent', 性格: 'info', 推进: 'success', 信息: 'info', 搞笑: 'warning', nsfw: 'danger', NSFW: 'danger'
};

export function MsgOptions({ items, pending, mode, onMode, onPick }: {
  items: OptionItem[]; pending: boolean; mode: OptionMode; onMode: (m: OptionMode) => void; onPick: (item: OptionItem, mode: OptionMode) => void;
}): React.JSX.Element {
  return (
    <section {...k('msg-options', { mode })} data-streaming={pending ? '' : undefined} aria-label="行动选项">
      <div {...part('head')}>
        <span {...part('title')}>行动选项</span>
        {pending ? null : <span {...part('count')}>{items.length} 个</span>}
        <span {...part('mode')}>
          <Segmented size="sm" label="点选项时" value={mode} onValueChange={(v) => onMode(v as OptionMode)} options={[{ value: 'fill', label: '填入' }, { value: 'send', label: '发送' }]} />
        </span>
      </div>
      {pending ? <p {...part('pending')}><Spinner size="sm" label="生成选项中" /> 正在生成选项……</p> : (
        <ul {...part('list')}>
          {items.map((it, i) => (
            <li key={i}>
              <button type="button" {...part('item')} title={it.content} onClick={() => onPick(it, mode)}
                aria-label={(mode === 'send' ? '发送：' : '填入：') + it.title + '。' + it.content}>
                {/* 类型标签 + 标题一起作为头部，内容在下面占满整个宽度（用户 2026-10-28） */}
                <span {...part('item-head')}>
                  <span {...part('type')}><Badge tone={TONE[it.type] || 'neutral'}>{it.type === 'nsfw' ? 'NSFW' : it.type}</Badge></span>
                  <span {...part('label')}>{it.title}</span>
                </span>
                <span {...part('text')}>{it.content}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────── 一整条回复 ───────── */

export function MessageView({ raw, streaming, latest, mode, onMode, onPick, thinker }: {
  /** 聊天原始数据里的这条回复（流式时是写到一半的文本） */
  raw: string; streaming: boolean;
  /** 是不是最新一条回复：只有它渲染行动选项（拍板 D） */
  latest: boolean;
  mode: OptionMode; onMode: (m: OptionMode) => void; onPick: (item: OptionItem, mode: OptionMode) => void;
  /** 思维链标题里的名字（默认奈亚子） */
  thinker?: string;
}): React.JSX.Element {
  const r = React.useMemo(() => splitReply(raw), [raw]);
  const thinking = streaming && !!r.think && !r.think.closed;
  const bodyStreaming = streaming && !!r.body && !r.body.closed;
  return (
    /* 自己铺底色（画布层 bg）：酒馆主题可能是深色、皮肤是浅色，不铺底就保证不了对比度。皮肤可以把它做得很淡，但不能透明 */
    <div {...k('msg-view')} data-k-level="bg" data-streaming={streaming ? '' : undefined}>
      {r.think && r.think.text ? <MsgThink text={r.think.text} streaming={thinking} {...(thinker ? { thinker } : {})} /> : null}
      {r.search.length || (streaming && r.searchPending) ? <MsgSearch records={r.search} pending={streaming && r.searchPending} /> : null}
      {r.body ? <MsgBody text={r.body.text} streaming={bodyStreaming} />
        /* 刚开始生成、还没写到任何内容：先放一个只有光标的正文，免得是一张空纸 */
        : streaming && !r.think && !r.search.length ? <MsgBody text="" streaming /> : null}
      {latest && r.options && (r.options.items.length || (streaming && !r.options.closed))
        ? <MsgOptions items={r.options.items} pending={!r.options.closed} mode={mode} onMode={onMode} onPick={onPick} /> : null}
    </div>
  );
}

export { countChars };
export type { OptionItem };
