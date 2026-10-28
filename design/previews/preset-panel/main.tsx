/**
 * 「预设设置」面板重设计预览（皮肤：碎光）。数据来自真实预设（build/frontend/preview-preset-data.mjs）。
 * PC：左侧导航 + 右侧内容两栏；手机：列表 → 详情逐层进入。改动直接生效，底部给「撤销」。
 * 只是预览：开关不会写回预设。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import data from './preset-data.json';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, EntryLabel, Field, InfoPopover, NavList, Panel, Segmented, Select, SettingRow, SettingSection, Switch, Toast, splitLeadingEmoji, type NavItem
} from '../../../src/frontend/ds';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
rt.applySkin(manifest, { scheme: q.get('scheme') || 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });

interface Item { id: string; name: string; on: boolean; note: string; hint: string }
interface Group { name: string; mode: 'one' | 'any'; items: Item[] }
const GROUPS = (data as unknown as { groups: Record<string, Group> }).groups;

interface Section { id: string; name: string; icon: string; groups?: string[]; blurb?: string }
const SECTIONS: Section[] = [
  { id: 'overview', name: '概览', icon: 'sparkles' },
  { id: 'narrative', name: '叙事', icon: 'book', groups: ['🗣️ [语言文字]', '🏃🏻‍♂️ [剧情推进]', '👁️ [叙事视角]', '🎯 [叙事焦点]', '🔊 [转述程度]', '🎮 [创作权限]', '⚔️ [难度设定]', '⚙️ [杂项要求]'] },
  { id: 'character', name: '角色', icon: 'drama', groups: ['💬 [角色对白]', '💭 [心理描写]', '🚫 [各种防止]'] },
  { id: 'style', name: '文风', icon: 'feather', groups: ['🖊️ [写作文风]', '✒️ [文风优化]', '🔞 [NSFW文风]', '💕 [色色选项]'] },
  { id: 'tasks', name: '功能任务', icon: 'layers', groups: ['🔝 [头部任务]', '🔛 [正文任务]', '🔚 [尾部任务]'] },
  { id: 'reasoning', name: '推理', icon: 'brain', groups: ['🔧 [推理工具]', '🔀 [增强随机]', '🤔 [推理格式]', '♿ [卡思维链]', '🔧 [特殊底部]', '🪓 [底部破限]'] },
  { id: 'advanced', name: '高级', icon: 'sliders', blurb: '模型专属条目与变量（推理预算、正文 token 量、插图数量）放在这里；平时不用动。' },
  { id: 'about', name: '关于', icon: 'info', blurb: '版本信息、检查更新、从旧预设继承设置。' }
];

const plain = (name: string): string => splitLeadingEmoji(name).text.replace(/^\[|\]$/g, '').replace(/\[|\]/g, '').trim();

/** 用媒体查询判断手机布局（与面板贴底抽屉同一个断点） */
function useCompact(): boolean {
  const mq = '(max-width: 1000px)';
  const [c, setC] = React.useState(() => matchMedia(mq).matches);
  React.useEffect(() => { const m = matchMedia(mq); const on = (): void => setC(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return c;
}

type State = Record<string, Record<string, boolean>>;
const initial = (): State => Object.fromEntries(Object.values(GROUPS).map((g) => [g.name, Object.fromEntries(g.items.map((i) => [i.id, i.on]))]));

function summaryOf(st: State, gname: string): string {
  const g = GROUPS[gname]; if (!g) { return ''; }
  const on = g.items.filter((i) => st[gname]?.[i.id]);
  if (g.mode === 'one') { return on[0] ? plain(on[0].name) : '未选'; }
  return on.length ? '已开 ' + on.length + ' 项' : '都没开';
}

function GroupView({ g, st, set }: { g: Group; st: State; set: (gname: string, id: string, v: boolean) => void }): React.JSX.Element {
  const [all, setAll] = React.useState(false);
  const title = <EntryLabel name={g.name.replace(/\[|\]/g, '')} />;
  const badge = <Badge>{g.mode === 'one' ? '单选' : '多选'}</Badge>;
  const shortNames = g.items.every((i) => plain(i.name).length <= 6);
  if (g.mode === 'one' && g.items.length <= 4 && shortNames) {
    const cur = g.items.find((i) => st[g.name]?.[i.id]);
    return (
      <SettingSection title={title} badge={badge}>
        <Segmented label={plain(g.name)} value={cur ? cur.id : ''} onValueChange={(v) => set(g.name, v, true)}
          options={g.items.map((i) => ({ value: i.id, label: <EntryLabel name={i.name} /> }))} />
        {cur && (cur.note || cur.hint) ? <p style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{cur.note || cur.hint}</p> : null}
      </SettingSection>
    );
  }
  if (g.mode === 'one') {
    const LIMIT = 8;
    const shown = all ? g.items : g.items.slice(0, LIMIT);
    return (
      <SettingSection title={title} badge={badge}
        aside={g.items.length > LIMIT ? <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? '收起' : '展开全部 ' + g.items.length + ' 种'}</Button> : undefined}>
        <ChoiceGrid min={150}>
          {shown.map((i) => (
            <ChoiceCard key={i.id} title={<EntryLabel name={i.name} />} selected={!!st[g.name]?.[i.id]} onSelect={() => set(g.name, i.id, true)}>
              {i.note || i.hint ? <span style={{ fontSize: 'var(--k-fs-xs)' }}>{(i.note || i.hint).slice(0, 30)}</span> : undefined}
            </ChoiceCard>
          ))}
        </ChoiceGrid>
      </SettingSection>
    );
  }
  return (
    <SettingSection title={title} badge={badge}>
      {g.items.map((i) => (
        <SettingRow key={i.id} label={<EntryLabel name={i.name} />} description={i.note || i.hint || undefined}
          info={i.note && i.note.length > 40 ? <InfoPopover label={'关于「' + plain(i.name) + '」'}><p>{i.note}</p></InfoPopover> : undefined}
          control={<Switch checked={!!st[g.name]?.[i.id]} onCheckedChange={(v) => set(g.name, i.id, v)} aria-label={plain(i.name)} />} />
      ))}
    </SettingSection>
  );
}

function Overview({ st, set }: { st: State; set: (gname: string, id: string, v: boolean) => void }): React.JSX.Element {
  const chips = ['🗣️ [语言文字]', '👁️ [叙事视角]', '🏃🏻‍♂️ [剧情推进]', '🖊️ [写作文风]', '🔞 [NSFW文风]'].map((n) => ({ n, v: summaryOf(st, n) }));
  const style = GROUPS['🖊️ [写作文风]']!;
  const curStyle = style.items.find((i) => st[style.name]?.[i.id]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>
      <SettingSection title="当前生效">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{chips.map((c) => <Badge key={c.n} tone="accent">{plain(c.n)} · {c.v}</Badge>)}</div>
      </SettingSection>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-group)' }}>
        <h3 style={{ fontSize: 'var(--k-fs-md)' }}>常用</h3>
        <GroupView g={GROUPS['🗣️ [语言文字]']!} st={st} set={set} />
        <GroupView g={GROUPS['👁️ [叙事视角]']!} st={st} set={set} />
        <Field label="写作文风" layout="inline" hint="23 种文风，在「文风」里可以看全部">
          <Select aria-label="写作文风" {...(curStyle ? { value: curStyle.id } : {})} placeholder="未选" onValueChange={(v) => set(style.name, v, true)}
            options={style.items.map((i) => ({ value: i.id, label: plain(i.name) }))} />
        </Field>
      </section>
    </div>
  );
}

function SectionBody({ s, st, set }: { s: Section; st: State; set: (gname: string, id: string, v: boolean) => void }): React.JSX.Element {
  if (s.id === 'overview') { return <Overview st={st} set={set} />; }
  if (!s.groups) { return <p style={{ color: 'var(--k-on-muted)' }}>{s.blurb}（预览里省略）</p>; }
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{s.groups.filter((n) => GROUPS[n]).map((n) => <GroupView key={n} g={GROUPS[n]!} st={st} set={set} />)}</div>;
}

function App(): React.JSX.Element {
  const compact = useCompact();
  const [st, setSt] = React.useState<State>(initial);
  const [cur, setCur] = React.useState('overview');
  const [detail, setDetail] = React.useState<string | null>(null);   /* 手机：正在看哪一节 */
  const [mode, setMode] = React.useState('play');
  const [toast, setToast] = React.useState<{ msg: string; undo: State } | null>(null);
  const [open, setOpen] = React.useState(true);
  const timer = React.useRef<number>(0);
  const set = (gname: string, id: string, v: boolean): void => {
    const g = GROUPS[gname]!;
    setSt((prev) => {
      const next = { ...prev, [gname]: { ...prev[gname] } };
      if (g.mode === 'one') { for (const i of g.items) { next[gname]![i.id] = i.id === id; } } else { next[gname]![id] = v; }
      const item = g.items.find((i) => i.id === id)!;
      setToast({ msg: (g.mode === 'one' ? '已切换为「' : (v ? '已开启「' : '已关闭「')) + plain(item.name) + '」', undo: prev });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 5000);
      return next;
    });
  };
  const navItems: NavItem[] = SECTIONS.map((s) => ({
    id: s.id, label: s.name, icon: s.icon,
    meta: s.groups ? (s.id === 'narrative' ? summaryOf(st, '👁️ [叙事视角]') : s.id === 'style' ? summaryOf(st, '🖊️ [写作文风]') : s.groups.reduce((n, g) => n + (GROUPS[g]?.items.filter((i) => st[g]?.[i.id]).length || 0), 0) + ' 项开启') : undefined
  }));
  const section = SECTIONS.find((s) => s.id === (compact ? detail : cur))!;
  const header = <Segmented label="运行模式" size="sm" value={mode} onValueChange={setMode} options={[{ value: 'play', label: '剧情游玩' }, { value: 'talk', label: '对话讨论' }]} />;

  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开预设设置</Button></div>; }
  return (
    <Panel title={compact && detail ? section.name : '预设设置'} onClose={() => setOpen(false)} defaultSize={{ w: 900, h: 760 }} actions={header}>
      {compact ? (
        detail ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-group)' }}>
            <div><Button variant="ghost" size="sm" onClick={() => setDetail(null)}>‹ 返回</Button></div>
            <SectionBody s={section} st={st} set={set} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>
            <Overview st={st} set={set} />
            <NavList layout="list" label="分类" items={navItems.filter((n) => n.id !== 'overview')} onSelect={(id) => setDetail(id)} />
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 0 }}><NavList layout="sidebar" label="分类" items={navItems} current={cur} onSelect={setCur} /></div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--k-fs-xl)', marginBottom: 'var(--k-gap-group)' }}>{section.name}</h2>
            <SectionBody s={section} st={st} set={set} />
          </div>
        </div>
      )}
      {toast ? <Toast message={toast.msg} action="撤销" onAction={() => { setSt(toast.undo); setToast(null); }} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}

rt.layer().open('preset-preview', <App />);
