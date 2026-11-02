/**
 * 世界观系列皮肤预览（审阅用，不是验证）。一页两种模式：
 *   · 总览（不带参数）：每款一行，浅色 / 深色各一个缩略窗（iframe 套本页的 ?skin=…&embed=1，一个窗口只能有一套皮肤）
 *   · 单款（?skin=<id>[&scheme=light|dark]）：模拟酒馆聊天页 + 真的显示面板（真的 SkinManager，全部打包皮肤，可在面板里按系列切换）
 *   · 缩略（再加 &embed=1）：左边消息、右边一块部件样张面板
 * 皮肤取自 .cache/frontend/skins.json（node build/frontend/pack-skins.mjs 生成），和构建产物同一份。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import { SkinManager, type SkinEntry, type StoredSettings } from '../../../src/frontend/skin-engine/manager';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import { DisplayPanel } from '../../../src/frontend/panels/display-panel';
import { Badge, Button, Card, Checkbox, ChoiceCard, CollapseCard, Panel, Progress, Segmented, SettingRow, SettingSection, Slider, Switch, Tabs } from '../../../src/frontend/ds';
import { MessageView, type OptionMode } from '../../../src/frontend/message/view';
import skins from '../../../.cache/frontend/skins.json';
import { GREETING, REPLY_A } from '../message/samples';

const entries = skins as unknown as SkinEntry[];
const q = new URLSearchParams(location.search);
const skinId = q.get('skin');
const THEME: Record<string, string> = {
  sugar: '恋爱轻喜剧', quest: '西幻冒险', reborn: '异世界轻小说', yunji: '修仙', jianghu: '武侠', neon: '赛博朋克', brief: '军事战术',
  palace: '历史 · 中国宫廷', laurel: '历史 · 西方古典', vigil: '黑暗哥特', grid: '高科技', abyss: '克苏鲁 / 诡秘', rust: '末日废土', cog: '蒸汽朋克', noir: '悬疑推理'
};

if (!skinId) { gallery(); } else { single(skinId, q.get('scheme') || '', q.get('embed') === '1'); }

/* ───────── 总览 ───────── */
function gallery(): void {
  const list = entries.map((e) => e.manifest).filter((m) => m.series);
  const root = document.createElement('div');
  root.id = 'gallery';
  root.innerHTML = '<h1>世界观系列 · ' + list.length + ' 款</h1><p class="lead">审阅用预览，不是验证（能不能用以实机为准）。每款左浅色、右深色；缩略窗里左边是消息正文，右边是部件样张。点「单独打开」看大图、在真的显示面板里切皮肤 / 开关特效 / 调动效档。点「▶ 动效演示」会在两个缩略窗里依次播放：打开面板 → 按下按钮 → 切换页签 → 展开折叠 → 展开思维链（系统开了「减少动态效果」时不播）。</p>' +
    '<div class="bar"><span>显示：</span><button data-v="both" aria-pressed="true">浅色 + 深色</button><button data-v="light">只看浅色</button><button data-v="dark">只看深色</button></div>';
  document.body.appendChild(root);
  const rows: HTMLElement[] = [];
  for (const m of list) {
    const row = document.createElement('section');
    row.className = 'row';
    const h = document.createElement('h2');
    h.innerHTML = '<span></span><small></small><a target="_blank">单独打开 ↗</a><button type="button" class="demo">▶ 动效演示</button>';
    h.children[0]!.textContent = m.name;
    h.children[1]!.textContent = m.id + ' · ' + (THEME[m.id] || '');
    (h.children[2] as HTMLAnchorElement).href = '?skin=' + m.id;
    const p = document.createElement('p'); p.textContent = m.description || '';
    const shots = document.createElement('div'); shots.className = 'shots';
    for (const sc of ['light', 'dark']) {
      const box = document.createElement('div'); box.className = 'shot'; box.dataset.scheme = sc;
      const f = document.createElement('iframe');
      f.loading = 'lazy'; f.title = m.name + ' ' + sc; f.src = '?skin=' + m.id + '&scheme=' + sc + '&embed=1';
      const tag = document.createElement('span'); tag.textContent = sc === 'light' ? '浅色' : '深色';
      box.append(f, tag); shots.appendChild(box);
    }
    (h.querySelector('.demo') as HTMLButtonElement).onclick = () => shots.querySelectorAll('iframe').forEach((f) => f.contentWindow?.postMessage('kami-demo', '*'));
    row.append(h, p, shots); root.appendChild(row); rows.push(row);
  }
  /* 缩略窗按格子宽度等比缩小 */
  const fit = (): void => { for (const f of Array.from(root.querySelectorAll<HTMLIFrameElement>('.shot iframe'))) { f.style.transform = 'scale(' + (f.parentElement!.clientWidth / 1280) + ')'; } };
  new ResizeObserver(fit).observe(root); fit();
  root.querySelector('.bar')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button'); if (!b) { return; }
    root.querySelectorAll('.bar button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const v = b.dataset.v;
    root.querySelectorAll<HTMLElement>('.shot').forEach((s) => { s.style.display = v === 'both' || s.dataset.scheme === v ? '' : 'none'; });
    fit();
  });
}

/* ───────── 单款 / 缩略 ───────── */
function single(id: string, scheme: string, embed: boolean): void {
  document.body.classList.add('single');
  if (embed) { document.body.classList.add('embed'); }
  document.body.insertAdjacentHTML('afterbegin', '<div id="top"><a href="./">← 返回总览</a><span id="cur"></span></div><div id="chat"></div>');
  const rt = createRuntime(window);
  /* 设置只存在内存里：网址决定看哪款、哪个配色 */
  let saved: unknown = null;
  const store = { load: (): unknown => saved, save: (s: StoredSettings): void => { saved = JSON.parse(JSON.stringify(s)); } };
  const mgr = new SkinManager(store, rt, entries, window);
  mgr.select(id);
  if (scheme) { mgr.setScheme(scheme); }
  mgr.apply();
  const cur = document.getElementById('cur')!;
  const label = (): void => { const m = mgr.current.manifest; cur.textContent = m.name + '（' + m.id + '）' + (THEME[m.id] ? ' · ' + THEME[m.id] : ''); document.title = m.name + ' · 皮肤预览'; };
  mgr.subscribe(label); label();
  (window as unknown as { __mgr: unknown }).__mgr = mgr;

  /* 消息：开场白 + 一条完整回复（思维链 / 搜索资料 / 正文 / 行动选项） */
  const chatEl = document.getElementById('chat')!;
  const chat = [{ name: '奈亚子', isUser: false, mes: GREETING }, { name: '你', isUser: true, mes: '走向旧宅' }, { name: '奈亚子', isUser: false, mes: REPLY_A }];
  chat.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = 'mes'; el.setAttribute('mesid', String(i)); el.setAttribute('is_user', String(m.isUser));
    el.innerHTML = '<div class="avatar"></div><div class="mes_block"><div class="ch_name"></div><div class="mes_text"></div></div>';
    el.querySelector('.ch_name')!.textContent = m.name;
    const text = el.querySelector('.mes_text')!;
    if (m.isUser) { text.textContent = m.mes; } else {
      const mark = document.createElement('div');
      mark.setAttribute('data-kami-mount', 'reply'); mark.setAttribute('data-kami-v', '1'); mark.textContent = m.mes;
      text.appendChild(mark);
    }
    chatEl.appendChild(el);
  });
  function Reply({ mesId }: { mesId: number }): React.JSX.Element {
    const [mode, setMode] = React.useState<OptionMode>('fill');
    return <MessageView raw={chat[mesId]!.mes} streaming={false} latest={mesId === 2} mode={mode} onMode={setMode} onPick={() => undefined} />;
  }
  rt.messages({
    chat: () => chatEl,
    getRaw: (i) => (chat[i] ? chat[i]!.mes : undefined),
    kinds: { reply: { payload: () => true, render: (_p: unknown, ctx: { mesId: number }) => <Reply mesId={ctx.mesId} /> } }
  }).start();
  if (embed) { chatEl.scrollTop = 0; }

  addEventListener('message', (e) => { if (e.data === 'kami-demo') { demo(); } });
  if (embed) { rt.layer().open('worlds-specimen', <Specimen />); return; }
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = '▶ 动效演示'; btn.className = 'demo'; btn.onclick = demo;
  document.getElementById('top')!.appendChild(btn);
  function App(): React.JSX.Element {
    const [open, setOpen] = React.useState(true);
    React.useEffect(() => { reopen = () => { setOpen(false); setTimeout(() => setOpen(true), 60); }; return () => { reopen = null; }; }, []);
    if (!open) { return <div style={{ position: 'fixed', right: 16, top: 52, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>打开显示设置</Button></div>; }
    return <DisplayPanel manager={mgr} onClose={() => setOpen(false)} defaultSize={{ w: 640, h: 720 }} />;
  }
  rt.layer().open('worlds-display', <App />);
}

/* ───────── 动效演示：依次触发「打开 → 按下 → 切页签 → 展开折叠 → 展开思维链」，走的都是真的事件 ───────── */
let reopen: (() => void) | null = null;
function roots(): ShadowRoot[] { return Array.from(document.querySelectorAll('*')).map((el) => el.shadowRoot).filter((r): r is ShadowRoot => !!r); }
function find(sel: string): HTMLElement | null { for (const r of roots()) { const el = r.querySelector<HTMLElement>(sel); if (el) { return el; } } return null; }
function press(el: HTMLElement | null): void {
  if (!el) { return; }
  const b = el.getBoundingClientRect();
  const o = { bubbles: true, composed: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, pointerType: 'mouse', button: 0, isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o));
}
function demo(): void {
  const steps: Array<() => void> = [
    () => { if (reopen) { reopen(); } },
    () => press(find('[data-k="panel"] [data-k="button"][data-variant="primary"]') || find('[data-k="panel"] [data-k="button"]')),
    () => { const t = find('[data-k="panel"] [data-k="tabs"] [data-k-part="tab"][data-state="inactive"]'); press(t); t?.click(); },
    () => { const t = find('[data-k="panel"] [data-k="tabs"] [data-k-part="tab"]'); press(t); t?.click(); },
    () => find('[data-k="card"][data-role="collapse"] > [data-k-part="head"]')?.click(),
    () => find('[data-k="msg-think"] > [data-k-part="head"] > [data-k-part="toggle"]')?.click()
  ];
  steps.forEach((f, i) => setTimeout(f, i * 1100));
}

/* ───────── 部件样张：缩略窗右半边，一眼看齐形状 / 边框 / 页签 / 开关 / 徽章 ───────── */
function Specimen(): React.JSX.Element {
  const [n, setN] = React.useState(0);
  React.useEffect(() => { reopen = () => setN((x) => x + 1); return () => { reopen = null; }; }, []);
  return <SpecimenPanel key={n} />;
}
function SpecimenPanel(): React.JSX.Element {
  const [tab, setTab] = React.useState('a');
  const [pick, setPick] = React.useState(0);
  const [on, setOn] = React.useState(true);
  const [v, setV] = React.useState(60);
  const body = (
    <div style={{ display: 'grid', gap: 12 }}>
      <SettingSection title="外观" badge={<Badge tone="accent">新</Badge>}>
        <SettingRow label="特效" description="打开 / 按下时的动效" control={<Switch aria-label="特效" checked={on} onCheckedChange={setOn} />} />
        <SettingRow label="字号" control={<Slider aria-label="字号" value={v} min={0} max={100} onValueChange={setV} />} />
      </SettingSection>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['浅色', '深色'].map((t, i) => <ChoiceCard key={t} title={t} meta={i ? '夜' : '昼'} selected={pick === i} onSelect={() => setPick(i)}>{i ? '深色配色' : '浅色配色'}</ChoiceCard>)}
      </div>
      <Card title="任务卷宗" meta="3 / 5">
        <div style={{ display: 'grid', gap: 8 }}>
          <Progress value={60} label="进度" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge>普通</Badge><Badge tone="accent">强调</Badge><Badge tone="success">成功</Badge><Badge tone="danger">危险</Badge></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Checkbox aria-label="勾选" defaultChecked />记住选择</label>
        </div>
      </Card>
      <CollapseCard title="折叠卡" meta="点开">折叠卡里的内容：展开 / 收起时触发该款的折叠动效。</CollapseCard>
    </div>
  );
  return (
    <Panel title="样张" onClose={() => undefined} geometry={{ x: 620, y: 14, w: 640, h: 730 }}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Button variant="ghost">取消</Button><Button>次要</Button><Button variant="primary">确定</Button></div>}>
      <Tabs label="样张" value={tab} onValueChange={setTab} items={[
        { value: 'a', label: '部件', content: body },
        { value: 'b', label: '其他', content: <Segmented label="密度" value="b" onValueChange={() => undefined} options={[{ value: 'a', label: '紧凑' }, { value: 'b', label: '适中' }]} /> },
        { value: 'c', label: '关于', content: <p>样张</p> }
      ]} />
    </Panel>
  );
}
