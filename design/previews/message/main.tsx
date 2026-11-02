/**
 * 消息前端预览（皮肤：碎光）：四个前端放在真实格式的消息里，用**真的消息挂载服务**（surfaces/messages.tsx）挂到模拟的酒馆聊天区。
 * 演示拍板 A–F：正文由我们排版（对白 / 心理描写 / 角色名 / 关键词 / 专有名词 / 场景转换，两字缩进）；
 * 行动选项只在最新一条回复出现（旧回复原文里也有选项，但不渲染）；点「发送」会发出选项并**流式生成**下一条回复（生成期间就逐步排版）；
 * 思维链默认收起、显示字数。网址参数 ?scheme=light|dark|reading 选配色。只是预览：没有真的模型，回复是写好的样例。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import { Button, Segmented, Surface } from '../../../src/frontend/ds';
import { MessageView, type OptionItem, type OptionMode } from '../../../src/frontend/message/view';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
const applyScheme = (scheme: string): void => {
  rt.applySkin(manifest, { scheme, density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });
};
applyScheme(q.get('scheme') || 'auto');

import { GREETING, REPLY_A, REPLY_B } from './samples';

/* ───────── 模拟的聊天数据（酒馆：SillyTavern.getContext().chat） ───────── */

interface Mes { name: string; isUser: boolean; mes: string; streaming: boolean }
const chat: Mes[] = [
  { name: '奈亚子', isUser: false, mes: GREETING, streaming: false },
  { name: '你', isUser: true, mes: '走向旧宅', streaming: false },
  { name: '奈亚子', isUser: false, mes: REPLY_A, streaming: false }
];
const listeners = new Set<() => void>();
let version = 0;
const notify = (): void => { version++; for (const l of listeners) { l(); } };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => listeners.delete(l); };
const latestAi = (): number => { for (let i = chat.length - 1; i >= 0; i--) { if (!chat[i]!.isUser) { return i; } } return -1; };

const chatEl = document.getElementById('chat')!;
const input = document.getElementById('send_textarea') as HTMLTextAreaElement;

/** 照酒馆的结构画一条消息；AI 回复的正文区里是正则替换出的挂载标记（兜底文字 = 原文） */
function addMesDom(id: number): void {
  const m = chat[id]!;
  const el = document.createElement('div');
  el.className = 'mes';
  el.setAttribute('mesid', String(id));
  el.setAttribute('is_user', String(m.isUser));
  el.innerHTML = '<div class="avatar"></div><div class="mes_block"><div class="ch_name"></div><div class="mes_text"></div></div>';
  el.querySelector('.ch_name')!.textContent = m.name;
  const text = el.querySelector('.mes_text')!;
  if (m.isUser) { text.textContent = m.mes; } else {
    const mark = document.createElement('div');
    mark.setAttribute('data-kami-mount', 'reply');
    mark.setAttribute('data-kami-v', '1');
    mark.textContent = m.mes;
    text.appendChild(mark);
  }
  chatEl.appendChild(el);
}
chat.forEach((_, i) => addMesDom(i));
const scrollBottom = (): void => { chatEl.scrollTop = chatEl.scrollHeight; };

/* ───────── 流式生成（模拟） ───────── */

let replies = [REPLY_B, REPLY_A];
let timer = 0;
function stream(id: number, full: string): void {
  window.clearInterval(timer);
  const m = chat[id]!;
  m.mes = ''; m.streaming = true; notify();
  let at = 0;
  timer = window.setInterval(() => {
    at = Math.min(full.length, at + 3 + Math.floor(Math.random() * 5));
    m.mes = full.slice(0, at);
    if (at >= full.length) { m.streaming = false; window.clearInterval(timer); }
    const nearBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < 120;
    notify();
    if (nearBottom) { requestAnimationFrame(scrollBottom); }
  }, 40);
}

function send(text: string): void {
  if (!text.trim() || chat.some((m) => m.streaming)) { return; }
  chat.push({ name: '你', isUser: true, mes: text.trim(), streaming: false }); addMesDom(chat.length - 1);
  chat.push({ name: '奈亚子', isUser: false, mes: '', streaming: true }); addMesDom(chat.length - 1);
  const next = replies[0]!; replies = [replies[1]!, replies[0]!];
  notify(); scrollBottom();
  stream(chat.length - 1, next);
}
document.getElementById('form')!.addEventListener('submit', () => { const t = input.value; input.value = ''; send(t); });

/* ───────── 挂载 ───────── */

let mode: OptionMode = 'fill';
try { mode = (localStorage.getItem('kami-preview-option-mode') as OptionMode) || 'fill'; } catch (e) { /* 无痕模式 */ }
const setMode = (m: OptionMode): void => { mode = m; try { localStorage.setItem('kami-preview-option-mode', m); } catch (e) { /* 无痕模式 */ } notify(); };

function pick(item: OptionItem, how: OptionMode): void {
  if (how === 'send') { send(item.content); return; }
  /* 填入：接在输入框已有内容的后面，不覆盖 */
  input.value = input.value.trim() ? input.value.replace(/\s+$/, '') + '\n' + item.content : item.content;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function Reply({ mesId }: { mesId: number }): React.JSX.Element | null {
  React.useSyncExternalStore(subscribe, () => version);
  const m = chat[mesId];
  if (!m) { return null; }
  /* 「行动选项默认」和显示面板 / 旧前端同一个键：'1' = 收起 */
  let optionsOpen = true;
  try { optionsOpen = localStorage.getItem('kami.options.folded') !== '1'; } catch (e) { /* 无痕 */ }
  return <MessageView raw={m.mes} streaming={m.streaming} latest={mesId === latestAi()} mode={mode} onMode={setMode} onPick={pick} optionsOpen={optionsOpen} />;
}

rt.messages({
  chat: () => chatEl,
  getRaw: (id) => (chat[id] ? chat[id]!.mes : undefined),
  /* 一条回复一个挂载点：载荷就是「这条消息」，内容从聊天数据实时读（流式时随生成更新） */
  kinds: { reply: { payload: (_raw: string, index: number) => (index === 0 ? true : undefined), render: (_p: unknown, ctx: { mesId: number }) => <Reply mesId={ctx.mesId} /> } }
}).start();
requestAnimationFrame(scrollBottom);

/* ───────── 预览工具：配色、重新生成最新一条 ───────── */

function Tools(): React.JSX.Element {
  const [scheme, setScheme] = React.useState(() => q.get('scheme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  React.useSyncExternalStore(subscribe, () => version);
  const busy = chat.some((m) => m.streaming);
  return (
    <div style={{ position: 'fixed', top: 4, right: 8, pointerEvents: 'auto' }}>
      <Surface level="surface-1" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 6px', borderRadius: 8 }}>
        <Segmented size="sm" label="配色" value={scheme} onValueChange={(v) => { setScheme(v); applyScheme(v); }}
          options={[{ value: 'light', label: '宣纸' }, { value: 'dark', label: '墨' }, { value: 'reading', label: '阅读' }]} />
        <Button size="sm" disabled={busy} onClick={() => { const id = latestAi(); stream(id, chat[id]!.mes || REPLY_A); scrollBottom(); }}>重新生成</Button>
      </Surface>
    </div>
  );
}
rt.layer().open('message-preview-tools', <Tools />);
