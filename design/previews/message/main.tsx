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

/* ───────── 样例回复（格式照 📌 输出规范） ───────── */

const OPTS_A = JSON.stringify([
  { title: '推开门走进去', type: '行动', content: '深吸一口气，推开那扇吱呀作响的木门，借着昏黄的光看清屋里的人。' },
  { title: '先在门外听一听', type: '信息', content: '贴着门板屏住呼吸，分辨屋里那两个声音在说什么。' },
  { title: '敲门报上名字', type: '性格', content: '「打扰了，我是从镇上来的。」规规矩矩地敲三下门，等里面的人回应。' },
  { title: '绕到后窗', type: '推进', content: '沿着墙根绕到屋后，看看破窗里能不能先瞧见些什么。' },
  { title: '学猫叫试探', type: '搞笑', content: '清清嗓子，冲着门缝「喵——」了一声，看看屋里的人会不会上当。' },
  { title: '转身离开', type: '其他', content: '这地方不对劲，还是先回镇上打听清楚再说。' }
]);

const SEARCH_A = [
  '<search_results>',
  '范围：克苏鲁神话｜洛夫克拉夫特原作设定',
  '- 印斯茅斯是马萨诸塞州海岸的虚构小镇，镇民与「深潜者」通婚，外貌逐渐呈现「印斯茅斯相」。 [1][2]',
  '- 达贡秘密教团（Esoteric Order of Dagon）在镇上取代了原有教会，崇拜达贡与海德拉。 [1]',
  '- 原作中外来者夜里在镇上留宿会被镇民围捕，旅馆房门的门闩常被拆掉。 [2]',
  '[1] https://zh.wikipedia.org/wiki/%E5%8D%B0%E6%96%AF%E8%8C%85%E6%96%AF 印斯茅斯 - 维基百科',
  '[2] https://www.hplovecraft.com/writings/texts/fiction/soi.aspx The Shadow over Innsmouth',
  '</search_results>'
].join('\n');

const REPLY_A = [
  '<nyaruko_think>',
  '## 场景确认',
  '深夜，印斯茅斯镇边缘的废屋。用户的角色刚到门前，屋里有光有人声。',
  '',
  '## 最终线路',
  '1. **步骤1**：门前的环境与声音，铺悬疑感（约 320 token）',
  '2. **步骤2**：<n>老马什</n>开门前的一瞬，用心理描写放大不安',
  '- 资料里提到镇民会围捕外来者 → 暗示，不点破',
  '- 选项给 6 个，方向尽量分散',
  '</nyaruko_think>',
  '<out_body>',
  '<introduction>',
  SEARCH_A,
  '</introduction>',
  '<content>',
  '<!-- 步骤1/Token320 -->',
  '　　夜风穿过破败的窗棂，发出低低的呜咽。你站在那扇木门前，门缝里漏出一线昏黄的光，照在脚边湿漉漉的石板上，像一条细细的、不肯熄灭的河。',
  '',
  '　　屋里有人在说话。声音压得很低，夹着一种你从没听过的、带着水汽的喉音。*他们在说什么？这种口音……不像是镇上的人。*你下意识地摸了摸口袋里那张皱巴巴的地图，上面用红笔圈出的正是这里——镇民口中的【马什旧宅】。',
  '',
  '<!-- 步骤2/Token280 -->',
  '___',
  '',
  '　　「外面有人。」一个沙哑的声音忽然停了下来。',
  '',
  '　　门内传来拖沓的脚步声，一步，又一步。<n>老马什</n>的影子先一步爬上了门缝，把那线光切成了两半。*跑，还是留下？*你的心跳声大得几乎盖过了海浪——那是传说中的**深潜者之潮**涨起来的声音。',
  '</content>',
  '<appendix>',
  '<options>',
  OPTS_A,
  '</options>',
  '</appendix>',
  '</out_body>'
].join('\n');

const OPTS_B = JSON.stringify([
  { title: '跟着进屋', type: '推进', content: '点点头，跟在老马什身后走进那间满是鱼腥味的屋子。' },
  { title: '问起那幅画', type: '信息', content: '「墙上那幅画里的人……是您的祖先吗？」' },
  { title: '悄悄记下出口', type: '行动', content: '一边应付着寒暄，一边把门窗的位置默记在心里。' },
  { title: '装作很懂行', type: '搞笑', content: '「啊，达贡嘛，我们那边也拜。」煞有介事地双手合十。' },
  { title: '直说来意', type: '性格', content: '「我是来找我舅舅的，他上个月来了这里就再没回去。」' },
  { title: '借口告辞', type: '其他', content: '「天太晚了，我明早再来拜访。」后退一步，准备开溜。' }
]);

const REPLY_B = [
  '<nyaruko_think>',
  '用户选择了推进，门打开。',
  '- 老马什的外貌：**印斯茅斯相**，但别写得太直白',
  '- 屋内细节：鱼腥、潮气、一幅旧画',
  '- 结尾留钩子：画里的人在看着你',
  '</nyaruko_think>',
  '<out_body>',
  '<introduction>',
  '<!-- 奈亚子做前锋了~ -->',
  '</introduction>',
  '<content>',
  '<!-- 步骤1/Token300 -->',
  '　　门开了。站在门里的是一个驼背的老人，皮肤泛着一种不健康的灰白，眼睛大而突出，几乎不怎么眨。<n>老马什</n>上下打量着你，嘴角慢慢扯出一个算不上笑的弧度。',
  '',
  '　　「这么晚了，」<n>他</n>说，「外乡人可不该在镇上乱走。进来吧，外面……不安全。」',
  '',
  '　　屋里比你想象的要暖和，空气里弥漫着浓重的鱼腥味和潮气。墙上挂着一幅褪了色的油画，画里的人穿着旧式的礼服，有着和<n>老马什</n>一模一样的眼睛。*那双眼睛……是在看着我吗？*',
  '</content>',
  '<appendix>',
  '<options>',
  OPTS_B,
  '</options>',
  '</appendix>',
  '</out_body>'
].join('\n');

const GREETING = [
  '<content>',
  '　　从阿卡姆开出的最后一班巴士在印斯茅斯镇口停下时，天已经黑透了。司机没等你站稳就关上了门，像是急着离开这个地方。',
  '',
  '　　镇上没有路灯，只有海风和一股挥之不去的鱼腥味。远处，一栋孤零零的旧宅里，亮着一点灯光。',
  '</content>',
  '<options>',
  JSON.stringify([{ title: '走向旧宅', type: '推进', content: '朝那点灯光走过去。' }, { title: '找地方过夜', type: '其他', content: '先在镇上找家旅馆。' }]),
  '</options>'
].join('\n');

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
  return <MessageView raw={m.mes} streaming={m.streaming} latest={mesId === latestAi()} mode={mode} onMode={setMode} onPick={pick} />;
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
