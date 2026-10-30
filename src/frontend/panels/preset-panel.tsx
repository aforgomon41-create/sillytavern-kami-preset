/**
 * 预设设置面板（新前端），第四版定稿（design/previews/preset-panel 的界面搬过来）。
 * 数据来自 PresetApi：真实酒馆里是 40 号 KamiPreset.presetBridge()（解析当前预设、开关走原来的写入路径），
 * 预览里是一份内存实现。面板只按「类型」渲染，不认任何分类名：
 *   概览 =「当前生效」（每个单选组的当前选项 + 当前模型）+「常用」（模型页 + 所有变量卡）；其余页签 = 预设的层级。
 * PC：左侧导航 + 右侧内容；手机：页签（左右滑动切换），「当前生效」压成一行横向滑动。当前模型显示在标题栏。
 * 每次开关后提示条可撤销（撤销 = 按原来的规则反向操作一次：单选组切回原来那条、模型切回原来的模型）。
 */
import * as React from 'react';
import { Badge, Button, ChoiceCard, ChoiceGrid, EmojiIcon, EntryLabel, NavList, Panel, SettingSection, Tabs, Toast, useMedia, type NavItem } from '../ds';
import { CustomStyles, GroupCards, ModelPicker, VarFields, info, plain, type Act, type CustomStyle, type Group, type State, type Tab } from './preset-parts';
import type { Live } from './toolbox-types';

export interface PresetView { ok: boolean; error: string; name: string; tabs: Tab[]; state: State }
export interface PresetResult { ok: boolean; msg?: string }
/** 40 号 customStyles() 的读数（只取面板用到的字段） */
export interface CustomStyleState {
  ok: boolean; code?: string | null; layerName?: string; closeOk?: boolean;
  groups?: Array<{ cardName: string; cardMode: string; headIdentifier: string }>;
  entries?: Array<{ identifier: string; display: string; content: string; groupName: string | null; groupHeadId: string | null }>;
}
export interface CustomStyleRequest {
  adds: Array<{ display: string; groupHeadId: string; content: string }>;
  updates: Array<{ identifier: string; display: string; groupHeadId: string; content: string }>;
  removes: string[];
}
export interface PresetApi extends Live {
  view(): PresetView;
  toggle(id: string, group: string | null): PresetResult;
  setVar(key: string, value: number): PresetResult;
  selectModel(name: string): PresetResult;
  customStyles?(anchorCards?: string[] | null): CustomStyleState;
  applyCustomStyles?(req: CustomStyleRequest): Promise<{ ok: boolean; code?: string; detail?: string }>;
}

function useLive(src: Live): number {
  const sub = React.useCallback((fn: () => void) => src.subscribe(fn), [src]);
  return React.useSyncExternalStore(sub, () => src.version());
}

/** 「当前生效」：每个单选组的当前选项 + 当前模型（全部由解析结果算出） */
function currentChips(tabs: Tab[], st: State): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  const mt = tabs.find((t) => t.kind === 'model');
  const m = mt && (mt.models || []).find((x) => x.name === st.model);
  if (m) { out.push({ key: 'model', text: '模型 · ' + m.label }); }
  for (const t of tabs) {
    for (const g of t.groups || []) {
      if (g.mode !== 'one') { continue; }
      const on = g.items.find((i) => st.on[i.id]);
      out.push({ key: g.name, text: plain(g.name) + ' · ' + (on ? plain(on.name) : '未选') });
    }
  }
  return out;
}

function Overview({ tabs, st, act, compact }: { tabs: Tab[]; st: State; act: Act; compact: boolean }): React.JSX.Element {
  const chips = currentChips(tabs, st);
  /* 电脑上全铺开太密：先显示前 CHIP_LIMIT 个，其余点「全部」展开；手机是一行横滑，全显示 */
  const CHIP_LIMIT = 6;
  const [allChips, setAllChips] = React.useState(false);
  const shownChips = compact || allChips ? chips : chips.slice(0, CHIP_LIMIT);
  const mt = tabs.find((t) => t.kind === 'model');
  const vars = tabs.flatMap((t) => t.vars || []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>
      <SettingSection title="当前生效" badge={<Badge>{chips.length} 项</Badge>}
        aside={!compact && chips.length > CHIP_LIMIT ? <Button variant="ghost" size="sm" onClick={() => setAllChips(!allChips)}>{allChips ? '收起' : '全部 ' + chips.length + ' 项'}</Button> : undefined}>
        <div data-k-swipe="off" style={compact
          ? { display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4, scrollbarWidth: 'none' }
          : { display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {shownChips.map((c) => <span key={c.key} style={{ flex: 'none' }}><Badge tone="accent">{c.text}</Badge></span>)}
        </div>
      </SettingSection>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-group)', borderTop: 'var(--k-border-w) solid var(--k-divider)', paddingTop: 'var(--k-gap-section)' }}>
        <h3 style={{ fontSize: 'var(--k-fs-lg)' }}>常用</h3>
        {mt ? <ModelPicker t={mt} st={st} act={act} withItems={false} /> : null}
        {vars.map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}
      </section>
    </div>
  );
}

/* ───────── 自定义文风：读 40 号的现有条目，保存时算出增 / 改 / 删交给它一次写入 ───────── */

function errText(C: Record<string, string>, code: string | undefined): string {
  if (code === 'SAVE_BUSY') { return '上一项还在保存，请保存完成后再修改'; }
  const map: Record<string, string> = {
    NO_TREE: 'errNoTree', NO_SECTION: 'errNoSection', NO_SECTION_END: 'errNoSectionEnd', ORDER_SHAPE: 'errOrderShape',
    VERIFY_FAIL: 'errVerify', APPLY_FAIL: 'errVerify', SAVE_FAIL: 'errSave', BAD_NAME: 'errName',
    GROUP_NOT_FOUND: 'errGroup', GROUP_EMPTY: 'errGroup', GROUP_TAIL_MISSING: 'errGroup'
  };
  return C[map[code || ''] || 'errGeneric'] || '保存失败';
}
function RealCustomStyles({ api, cs, copy }: { api: PresetApi; cs: CustomStyleState; copy: Record<string, string> }): React.JSX.Element {
  const groups: Group[] = (cs.groups || []).map((g) => ({ name: g.cardName, mode: g.cardMode === '单选' ? 'one' : 'any', note: '', items: [] }));
  const init: CustomStyle[] = (cs.entries || []).map((e) => ({ id: e.identifier, name: e.display, group: e.groupName || '', content: e.content, status: 'saved' }));
  const headOf = (name: string): string => (cs.groups || []).find((g) => g.cardName === name)?.headIdentifier || '';
  const save = (next: CustomStyle[]): Promise<PresetResult> => {
    const before = new Map(init.map((x) => [x.id, x]));
    const req: CustomStyleRequest = { adds: [], updates: [], removes: [] };
    for (const s of next) {
      const old = before.get(s.id);
      if (!old) { req.adds.push({ display: s.name, groupHeadId: headOf(s.group), content: s.content }); continue; }
      if (old.name !== s.name || old.group !== s.group || old.content !== s.content) { req.updates.push({ identifier: s.id, display: s.name, groupHeadId: headOf(s.group), content: s.content }); }
    }
    for (const id of before.keys()) { if (!next.some((s) => s.id === id)) { req.removes.push(id); } }
    if (!req.adds.length && !req.updates.length && !req.removes.length) { return Promise.resolve({ ok: true }); }
    return api.applyCustomStyles!(req).then((r) => (r && r.ok ? { ok: true } : { ok: false, msg: errText(copy, r && r.code) }));
  };
  /* 保存成功后预设变了，读数跟着变：用条目指纹当 key，让组件按新读数重建 */
  const key = JSON.stringify(init.map((x) => [x.id, x.name, x.group, x.content]));
  return <CustomStyles key={key} groups={groups} initial={init} copy={copy} onSave={save} />;
}

function TabBody({ t, st, act, api, styleCopy }: { t: Tab; st: State; act: Act; api: PresetApi; styleCopy?: Record<string, string> | undefined }): React.JSX.Element {
  const cols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' } as const;
  if (t.kind === 'model') { return <div style={cols}><ModelPicker t={t} st={st} act={act} withItems /></div>; }
  let cs: CustomStyleState | null = null;
  if (styleCopy && api.customStyles && (t.groups || []).length) {
    try { cs = api.customStyles(); } catch { cs = null; }
    if (cs && (!cs.ok || plain(cs.layerName || '') !== plain(t.name))) { cs = null; }
  }
  return (
    <div style={cols}>
      {(t.vars || []).map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}
      {(t.standalone || []).length ? (
        <SettingSection title="其他条目" badge={<Badge>多选</Badge>}>
          <ChoiceGrid>
            {(t.standalone || []).map((i) => <ChoiceCard key={i.id} multi title={<EntryLabel name={i.name} />} selected={!!st.on[i.id]} disabled={!!i.locked} onSelect={() => act.toggle(null, i)} info={info(plain(i.name), i.note)} />)}
          </ChoiceGrid>
        </SettingSection>
      ) : null}
      {(t.groups || []).map((g) => <GroupCards key={g.name} g={g} st={st} act={act} />)}
      {cs && styleCopy ? <RealCustomStyles api={api} cs={cs} copy={styleCopy} /> : null}
    </div>
  );
}

export interface PresetPanelProps {
  api: PresetApi;
  onClose: () => void;
  /** 自定义文风的文案（_custom-style-ui.js 的 CUSTOM_STYLE_COPY）；不传就不显示这一节 */
  styleCopy?: Record<string, string>;
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

export function PresetPanel({ api, onClose, styleCopy, compactQuery = '(max-width: 1000px)', defaultSize = { w: 920, h: 780 } }: PresetPanelProps): React.JSX.Element {
  useLive(api);
  const compact = useMedia(compactQuery);
  const v = api.view();
  const tabs = v.tabs, st = v.state;
  const [cur, setCur] = React.useState('overview');
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => void; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = (msg: string, undo?: () => void): void => {
    setToast((t) => ({ msg, ...(undo ? { undo } : {}), n: (t?.n || 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  };
  const fail = (r: PresetResult): boolean => { if (!r.ok) { notify(r.msg || '写入失败'); return true; } return false; };
  const act: Act = {
    toggle: (g, item) => {
      const wasOn = !!st.on[item.id];
      const prev = g && g.mode === 'one' && !wasOn ? g.items.find((x) => x.id !== item.id && st.on[x.id]) : undefined;
      const gname = g ? g.name : null;
      if (fail(api.toggle(item.id, gname))) { return; }
      const msg = (g && g.mode === 'one' && !wasOn ? '已切换为「' : (wasOn ? '已关闭「' : '已开启「')) + plain(item.name) + '」';
      notify(msg, () => { fail(prev ? api.toggle(prev.id, gname) : api.toggle(item.id, gname)); });
    },
    setVar: (k, x) => { if (!fail(api.setVar(k, x))) { notify('已保存 ' + k + ' = ' + x); } },
    setModel: (m) => {
      const prev = st.model;
      if (m.name === prev) { return; }
      if (fail(api.selectModel(m.name))) { return; }
      notify('已切换到「' + m.label + '」', prev ? () => { fail(api.selectModel(prev)); } : undefined);
    }
  };
  const OVERVIEW: Tab = { id: 'overview', kind: 'layer', name: '概览' };
  const all = [OVERVIEW, ...tabs];
  const tab = all.find((t) => t.id === cur) || OVERVIEW;
  const navItems: NavItem[] = all.map((t) => (t.id === 'overview' ? { id: t.id, label: '概览', icon: 'sparkles' } : { id: t.id, label: <EntryLabel name={t.name} /> }));
  const model = (tabs.find((t) => t.kind === 'model')?.models || []).find((m) => m.name === st.model);
  const modelBadge = model ? (
    <span title={'当前模型：' + model.label}><Badge tone="accent">
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><EmojiIcon emoji={model.emoji} size="1em" />{model.label.split('/').pop()}</span>
    </Badge></span>
  ) : null;
  const body = (t: Tab): React.JSX.Element => (t.id === 'overview' ? <Overview tabs={tabs} st={st} act={act} compact={compact} /> : <TabBody t={t} st={st} act={act} api={api} styleCopy={styleCopy} />);
  return (
    <Panel title="预设设置" actions={modelBadge} onClose={onClose} defaultSize={defaultSize}>
      {!v.ok ? (
        <SettingSection title="读不到当前预设"><p style={{ color: 'var(--k-on-muted)' }}>{v.error}</p></SettingSection>
      ) : compact ? (
        <Tabs label="预设分类" swipe sticky value={tab.id} onValueChange={setCur}
          items={all.map((t) => ({ value: t.id, label: t.id === 'overview' ? '概览' : <EntryLabel name={t.name} />, content: body(t) }))} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 0 }}><NavList layout="sidebar" label="预设分类" items={navItems} current={tab.id} onSelect={setCur} /></div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 'var(--k-fs-xl)', marginBottom: 'var(--k-gap-group)' }}>{plain(tab.name)}</h2>
            {body(tab)}
          </div>
        </div>
      )}
      {toast ? <Toast key={toast.n} message={toast.msg} {...(toast.undo ? { action: '撤销', onAction: () => { const u = toast.undo!; setToast(null); u(); } } : {})} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}
