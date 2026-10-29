/**
 * 「预设设置」面板重设计预览（皮肤：碎光）第三版：第一版的信息架构（概览 + 当前生效 + 常用 + 带摘要的导航）+ 用户 8 条修改。
 * 数据**完全由解析预设本体得来**（build/frontend/preview-preset-data.mjs），这里只按「类型」渲染，不认任何分类名：
 *   概览里的「常用」= 模型页 + 所有变量卡（按类型找出来）；「当前生效」= 每个单选组的当前选项 + 当前模型。
 * PC：左侧导航 + 右侧内容；手机：页签（概览在第一个，左右滑动切换），「当前生效」压成一行横向滑动。
 * 当前模型显示在面板标题栏（第四版，用户 2026-10-28 要求；导航不再显示「N 项开启」）。
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
  Badge, Button, ChoiceCard, ChoiceGrid, EmojiIcon, EntryLabel, NavList, Panel, SettingSection, Tabs, Toast, type NavItem
} from '../../../src/frontend/ds';
import { CustomStyles, GroupCards, ModelPicker, VarFields, info, initial, plain, type Act, type State, type Tab } from '../../../src/frontend/panels/preset-parts';
import { CUSTOM_STYLE_COPY } from '../../../src/scripts/_custom-style-ui.js';

const manifest = manifestJson as unknown as SkinManifest;
const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
rt.applySkin(manifest, { scheme: q.get('scheme') || 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });

const TABS: Tab[] = (data as unknown as { tabs: Tab[] }).tabs;

function useCompact(): boolean {
  const mq = '(max-width: 1000px)';
  const [c, setC] = React.useState(() => matchMedia(mq).matches);
  React.useEffect(() => { const m = matchMedia(mq); const on = (): void => setC(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return c;
}

/** 「当前生效」：每个单选组的当前选项 + 当前模型（全部由解析结果算出） */
function currentChips(st: State): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  const mt = TABS.find((t) => t.kind === 'model');
  const m = mt && (mt.models || []).find((x) => x.name === st.model);
  if (m) { out.push({ key: 'model', text: '模型 · ' + m.label }); }
  for (const t of TABS) {
    for (const g of t.groups || []) {
      if (g.mode !== 'one') { continue; }
      const on = g.items.find((i) => st.on[i.id]);
      out.push({ key: g.name, text: plain(g.name) + ' · ' + (on ? plain(on.name) : '未选') });
    }
  }
  return out;
}

function Overview({ st, act, compact }: { st: State; act: Act; compact: boolean }): React.JSX.Element {
  const chips = currentChips(st);
  /* 电脑上全铺开太密（十几个标签成一面墙）：先显示前 CHIP_LIMIT 个，其余点「全部」展开；手机是一行横滑，全显示 */
  const CHIP_LIMIT = 6;
  const [allChips, setAllChips] = React.useState(false);
  const shownChips = compact || allChips ? chips : chips.slice(0, CHIP_LIMIT);
  const mt = TABS.find((t) => t.kind === 'model');
  const vars = TABS.flatMap((t) => t.vars || []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>
      <SettingSection title="当前生效" badge={<Badge>{chips.length} 项</Badge>}
        aside={!compact && chips.length > CHIP_LIMIT ? <Button variant="ghost" size="sm" onClick={() => setAllChips(!allChips)}>{allChips ? '收起' : '全部 ' + chips.length + ' 项'}</Button> : undefined}>
        {/* 手机：压成一行横向滑动（不触发翻页）；电脑：换行铺开 */}
        <div data-k-swipe="off" style={compact
          ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4, scrollbarWidth: 'none' }
          : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {shownChips.map((c) => <span key={c.key} style={{ flex: 'none' }}><Badge tone="accent">{c.text}</Badge></span>)}
        </div>
      </SettingSection>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-group)' }}>
        <h3 style={{ fontSize: 'var(--k-fs-lg)' }}>常用</h3>
        {mt ? <ModelPicker t={mt} st={st} act={act} withItems={false} /> : null}
        {vars.map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}
      </section>
    </div>
  );
}

function TabBody({ t, st, act }: { t: Tab; st: State; act: Act }): React.JSX.Element {
  const cols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' } as const;
  if (t.kind === 'model') { return <div style={cols}><ModelPicker t={t} st={st} act={act} withItems /></div>; }
  return (
    <div style={cols}>
      {(t.vars || []).map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}
      {(t.standalone || []).length ? (
        <SettingSection title="其他条目" badge={<Badge>多选</Badge>}>
          <ChoiceGrid>
            {(t.standalone || []).map((i) => <ChoiceCard key={i.id} multi title={<EntryLabel name={i.name} />} selected={!!st.on[i.id]} onSelect={() => act.toggle(null, i)} info={info(plain(i.name), i.note)} />)}
          </ChoiceGrid>
        </SettingSection>
      ) : null}
      {(t.groups || []).map((g) => <GroupCards key={g.name} g={g} st={st} act={act} />)}
      {/* 自定义文风挂在「写作指导」页（旧版也是锚在写作指导分区；按页名找） */}
      {/写作指导/.test(t.name) && (t.groups || []).length ? (
        <CustomStyles groups={t.groups!} copy={CUSTOM_STYLE_COPY} onSave={() => undefined}
          initial={[{ id: 's1', name: '冷硬派', group: t.groups![1]?.name || t.groups![0]!.name, content: '短句，少形容词；情绪藏在动作和物件里，不直接说出来。', status: 'saved' }]} />
      ) : null}
    </div>
  );
}

function App(): React.JSX.Element {
  const compact = useCompact();
  const [st, setSt] = React.useState<State>(() => initial(TABS));
  const [cur, setCur] = React.useState('overview');
  const [toast, setToast] = React.useState<{ msg: string; undo: State } | null>(null);
  const [open, setOpen] = React.useState(true);
  const timer = React.useRef<number>(0);
  const commit = (next: (s: State) => State, msg: string): void => {
    setSt((prev) => {
      setToast({ msg, undo: prev });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 5000);
      return next(prev);
    });
  };
  const act: Act = {
    toggle: (g, item) => commit((s) => {
      const on = { ...s.on };
      if (g && g.mode === 'one') { for (const i of g.items) { on[i.id] = i.id === item.id; } } else { on[item.id] = !on[item.id]; }
      return { ...s, on };
    }, (g && g.mode === 'one' ? '已切换为「' : (st.on[item.id] ? '已关闭「' : '已开启「')) + plain(item.name) + '」'),
    setVar: (k, v) => setSt((s) => ({ ...s, vars: { ...s.vars, [k]: v } })),
    setModel: (m) => commit((s) => {
      const on = { ...s.on };
      const t = TABS.find((x) => x.kind === 'model')!;
      for (const mm of t.models || []) { for (const i of mm.items) { on[i.id] = false; } }
      for (const i of m.items) { on[i.id] = true; }
      return { ...s, model: m.name, on };
    }, '已切换到「' + m.label + '」')
  };
  const OVERVIEW: Tab = { id: 'overview', kind: 'layer', name: '概览' };   /* 平台固定的页签 */
  const all = [OVERVIEW, ...TABS];   /* 「关于」挪到工具箱改成「更新」页（用户 2026-10-29） */
  const label = (t: Tab): string => plain(t.name);
  /* 来自预设的页签用 emoji → 图标映射；平台固定的「关于」直接用图标 */
  const navItems: NavItem[] = all.map((t) => (t.id === 'overview' ? { id: t.id, label: '概览', icon: 'sparkles' }
    : { id: t.id, label: <EntryLabel name={t.name} /> }));
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开预设设置</Button></div>; }
  const tab = all.find((t) => t.id === cur)!;
  const model = (TABS.find((t) => t.kind === 'model')?.models || []).find((m) => m.name === st.model);
  /* 标题栏：当前模型（图标 + 简称），手机上也放得下 */
  const modelBadge = model ? (
    <span title={'当前模型：' + model.label}><Badge tone="accent">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><EmojiIcon emoji={model.emoji} size="1em" />{model.label.split('/').pop()}</span>
    </Badge></span>
  ) : null;
  return (
    <Panel title="预设设置" actions={modelBadge} onClose={() => setOpen(false)} defaultSize={{ w: 920, h: 780 }}>
      {compact ? (
        <Tabs label="预设分类" swipe sticky value={cur} onValueChange={setCur}
          items={all.map((t) => ({ value: t.id, label: t.id === 'overview' ? '概览' : <EntryLabel name={t.name} />, content: t.id === 'overview' ? <Overview st={st} act={act} compact /> : <TabBody t={t} st={st} act={act} /> }))} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 0 }}><NavList layout="sidebar" label="预设分类" items={navItems} current={cur} onSelect={setCur} /></div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--k-fs-xl)', marginBottom: 'var(--k-gap-group)' }}>{label(tab)}</h2>
            {tab.id === 'overview' ? <Overview st={st} act={act} compact={false} /> : <TabBody t={tab} st={st} act={act} />}
          </div>
        </div>
      )}
      {toast ? <Toast message={toast.msg} action="撤销" onAction={() => { setSt(toast.undo); setToast(null); }} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}

rt.layer().open('preset-preview', <App />);
