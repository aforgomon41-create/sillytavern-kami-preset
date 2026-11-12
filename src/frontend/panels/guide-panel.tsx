/**
 * 引导（新前端）。2026-11-03 用户要求重做：
 *   ① **先确认免责声明与开源许可**：确认前没有关闭按钮、Esc / 下拉都关不掉、不能往后走；
 *      按钮条上其他按钮也会先跳回这里（10 号脚本按钮中转站看 KamiGuide.accepted()）。
 *   ② **教会用户预设的每一项功能**，每一页都按出厂默认设好（标「默认」，可一键恢复本页默认）：
 *      免责声明与开源许可 → 先认识一下（按钮条地图）→ 外观 → 模型 → 预设的每个层级（运行时从预设解析，
 *      创作要求 / 角色塑造 / 写作指导 / 额外任务 / 推理选项 / 运行模式 / 设置变量）→ 消息界面（可点的样例回复）
 *      → 长文与截断 → 网络搜索 → 其他工具 → 完成。
 * 每一页都直接改真实设置：模型 / 条目 / 数值走 PresetApi（40 号 presetBridge），皮肤走 SkinManager（04 号「🎨 显示」），
 * 压缩走 60 号的读写桥，防截断走 20 号的 AntiTruncation。缺哪个就那一项显示降级说明。
 * 电脑：左侧步骤列表（走过的步骤可以点回去）；手机：顶部进度条。文案唯一真相 design/copy/guide-copy.json。
 */
import * as React from 'react';
import G0 from '../../../design/copy/guide-copy.json';
import { Markdown } from '../message/markdown';
import { MessageView, type OptionMode } from '../message/view';
import type { SkinManager } from '../skin-engine/manager';
import { SkinChoices } from './display-panel';
import { EntryLabel } from '../ds';
import { GroupCards, ModelPicker, VarFields, info, plain, type Act, type Group, type Item, type State, type Tab } from './preset-parts';
import type { PresetApi } from './preset-panel';
import type { Live } from './toolbox-types';
import { Badge, Button, Checkbox, ChoiceCard, ChoiceGrid, NavList, Panel, SettingRow, SettingSection, Switch, Toast, useMedia } from '../ds';

export type GuideCopy = typeof G0;
export interface GuideLong {
  /** 60 号压缩：roll 为 null 表示当前预设里没有滚动压缩正则 */
  compress?: { get(): { roll: boolean | null; grand: boolean }; setRoll(on: boolean): unknown; setGrand(on: boolean): unknown; open?: () => void };
  /** 20 号反截断 */
  antitrunc?: { get(): boolean; set(on: boolean): unknown };
}
/** 打开其他面板（引导里「去哪里改」的按钮） */
export interface GuideOpeners { display?: () => void; preset?: () => void; toolbox?: (tab?: string) => void }
export interface GuidePanelProps {
  disclaimer: string;
  preset?: PresetApi | null;
  skins?: SkinManager | null;
  long?: GuideLong;
  /** 这些源有变化时重画（预设、压缩桥等） */
  live?: Live[];
  copy?: Partial<GuideCopy> | null;
  /** 已经确认过（这一份）免责声明与开源许可 */
  accepted?: boolean;
  /** 出厂开关：条目 id → 开 / 关（构建期从预设内联） */
  defaults?: Record<string, boolean> | null;
  open?: GuideOpeners;
  /** 关闭：completed = 点了最后一步的「完成」 */
  onClose: (completed: boolean) => void;
  onConfirm?: () => void;
  initialStep?: number;
  compactQuery?: string;
}

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
const Intro = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p style={{ color: 'var(--k-on-muted)', maxWidth: '42em' }}>{children}</p>;
const Stack = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{children}</div>;
/** 名词 + 说明的列表（按钮条地图、消息各部分、工具） */
const Terms = ({ rows }: { rows: ReadonlyArray<readonly [string, string] | string[]> }): React.JSX.Element => (
  <dl data-guide-terms="" style={{ display: 'grid', gridTemplateColumns: 'minmax(7em, max-content) minmax(0, 1fr)', gap: '8px 16px', margin: 0 }}>
    {rows.map((r) => <React.Fragment key={r[0]}><dt style={{ fontWeight: 'var(--k-fw-strong)' as unknown as number }}>{r[0]}</dt><dd style={{ margin: 0, color: 'var(--k-on-muted)' }}>{r[1]}</dd></React.Fragment>)}
  </dl>
);

function useLives(list: Live[]): void {
  const key = list.length;
  const sub = React.useCallback((fn: () => void) => { const offs = list.map((l) => l.subscribe(fn)); return () => offs.forEach((o) => o()); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useSyncExternalStore(sub, () => list.map((l) => l.version()).join(',') + '/' + key);
}

/* 消息界面那一页的样例回复（只在引导里渲染，不进聊天） */
const SAMPLE = [
  '<nyaruko_think>', '## 场景确认', '深夜的旧宅门口，<n>老马什</n>在屋里。', '', '## 安排', '1. 先写门外的声音', '2. 再让老马什开门', '</nyaruko_think>',
  '<out_body>', '<introduction>', '<search_results>', '范围：示例｜旧宅地方志', '- 马什旧宅建于 1846 年，后来荒废。 [1]', '[1] https://example.org/marsh 地方志（示例）', '</search_results>', '</introduction>',
  '<content>', '　　夜风穿过破败的窗棂。你站在那扇木门前，门缝里漏出一线昏黄的光。', '', '　　「外面有人。」屋里沙哑的声音停了下来。*他知道我来了？*', '</content>',
  '<appendix>', '<options>', JSON.stringify([
    { title: '敲门报上名字', type: '性格', content: '「打扰了，我是从镇上来的。」' },
    { title: '先在门外听一听', type: '信息', content: '贴着门板，听屋里在说什么。' },
    { title: '绕到后窗', type: '推进', content: '沿着墙根绕到屋后看看。' }
  ]), '</options>', '</appendix>', '</out_body>'
].join('\n');

function SampleMessage(): React.JSX.Element {
  const [mode, setMode] = React.useState<OptionMode>('fill');
  const [picked, setPicked] = React.useState('');
  return (
    <div data-guide-sample="">
      <MessageView raw={SAMPLE} streaming={false} latest mode={mode} onMode={setMode} onPick={(it, m) => setPicked((m === 'send' ? '（发送）' : '（填入）') + it.title)} thinker="奈亚子" />
      {picked ? <Intro>{'样例里点了：' + picked + '——真实聊天里会' + (mode === 'send' ? '直接发出去' : '放进输入框') + '。'}</Intro> : null}
    </div>
  );
}

/** 一个预设层级（创作要求、角色塑造……）：独立条目 + 数值 + 每个选项组，出厂开着的标「默认」 */
function LayerBody({ t, st, act, defaults, G }: { t: Tab; st: State; act: Act; defaults: Record<string, boolean> | null; G: GuideCopy }): React.JSX.Element {
  return (
    <>
      {(t.groups || []).map((g) => <GroupCards key={g.name} g={g} st={st} act={act} defaults={defaults} defaultLabel={G.defaultBadge} />)}
      {(t.standalone || []).length ? (
        <SettingSection title="其他条目" badge={<Badge>多选</Badge>}>
          <ChoiceGrid>
            {(t.standalone || []).map((i) => <ChoiceCard key={i.id} multi title={<EntryLabel name={i.name} />} selected={!!st.on[i.id]} disabled={!!i.locked}
              {...(defaults && defaults[i.id] ? { meta: G.defaultBadge } : {})} onSelect={() => act.toggle(null, i)} info={info(plain(i.name), i.note)} />)}
          </ChoiceGrid>
        </SettingSection>
      ) : null}
      {(t.vars || []).map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}
    </>
  );
}

/** 本页和出厂默认不一样的开关：单选组切到出厂那一项，多选组 / 独立条目逐个翻 */
function restorePlan(t: Tab, st: State, defaults: Record<string, boolean>): Array<{ g: Group | null; item: Item }> {
  const out: Array<{ g: Group | null; item: Item }> = [];
  const known = (i: Item): boolean => Object.prototype.hasOwnProperty.call(defaults, i.id) && !i.locked;
  for (const g of t.groups || []) {
    if (g.mode === 'one') {
      const want = g.items.find((i) => known(i) && defaults[i.id]);
      if (want && !st.on[want.id]) { out.push({ g, item: want }); }
    } else {
      for (const i of g.items) { if (known(i) && !!st.on[i.id] !== defaults[i.id]) { out.push({ g, item: i }); } }
    }
  }
  for (const i of t.standalone || []) { if (known(i) && !!st.on[i.id] !== defaults[i.id]) { out.push({ g: null, item: i }); } }
  return out;
}

export function GuidePanel({ disclaimer, preset, skins, long = {}, live = [], copy, accepted = false, defaults = null, open = {}, onClose, onConfirm, initialStep = 0, compactQuery = '(max-width: 1000px)' }: GuidePanelProps): React.JSX.Element {
  const G = React.useMemo(() => ({ ...G0, ...(copy || {}) }) as GuideCopy, [copy]);
  const sources = React.useMemo(() => [...(preset ? [preset] : []), ...live], [preset, live]);
  useLives(sources);
  const compact = useMedia(compactQuery);
  const [confirmed, setConfirmed] = React.useState(accepted);
  const [agree, setAgree] = React.useState(accepted);
  const [i, setI] = React.useState(confirmed ? Math.max(0, initialStep) : 0);
  const [seen, setSeen] = React.useState(i);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [toast, setToast] = React.useState<{ msg: string; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = React.useCallback((msg: string) => { setToast((t) => ({ msg, n: (t?.n || 0) + 1 })); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 4000); }, []);
  const body = React.useRef<HTMLDivElement>(null);
  /* 左侧步骤列表：高度不超过内容区的可见高度，自己滚（原来比可见区高时，往下翻后第一项缩到标题栏下面，用户 2026-11-12 截图） */
  const nav = React.useRef<HTMLDivElement>(null);
  const [navMax, setNavMax] = React.useState<number | null>(null);
  React.useEffect(() => {
    const sc = body.current?.closest('[data-k-part="body"]') as HTMLElement | null;
    if (!sc) { return undefined; }
    const win = sc.ownerDocument.defaultView as Window & typeof globalThis;
    const measure = (): void => { const cs = win.getComputedStyle(sc); setNavMax(Math.max(160, sc.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0))); };
    measure();
    const ro = win.ResizeObserver ? new win.ResizeObserver(measure) : null;
    if (ro) { ro.observe(sc); }
    return () => { if (ro) { ro.disconnect(); } };
  }, []);

  const v = preset ? preset.view() : null;
  const tabs = v && v.ok ? v.tabs : [];
  const st = v ? v.state : { on: {}, vars: {}, model: '' };
  const MODEL_TAB = tabs.find((t) => t.kind === 'model');
  /* 预设的层级按预设里的顺序，只有数值的层（设置变量）放到最后 */
  const LAYERS = tabs.filter((t) => t.kind === 'layer');
  const layersOrdered = [...LAYERS.filter((t) => (t.groups || []).length), ...LAYERS.filter((t) => !(t.groups || []).length)];
  const LANG = tabs.flatMap((t) => t.groups || []).find((g) => /语言/.test(g.name));
  const fail = (r: { ok: boolean; msg?: string }): void => { if (!r.ok) { notify(r.msg || '写入失败'); } };
  const act: Act = {
    toggle: (g, item) => { if (preset) { if (g && g.mode === 'one' && st.on[item.id]) { return; } fail(preset.toggle(item.id, g ? g.name : null)); } },
    setVar: (k, x) => { if (preset) { fail(preset.setVar(k, x)); } },
    setModel: (m) => { if (preset && m.name !== st.model) { fail(preset.selectModel(m.name)); } }
  };
  const comp = long.compress ? long.compress.get() : null;
  const anti = long.antitrunc ? long.antitrunc.get() : null;
  const layerIntro = G.layerIntro as Record<string, string>;
  const restore = (t: Tab): void => {
    if (!preset || !defaults) { return; }
    const plan = restorePlan(t, st, defaults);
    if (!plan.length) { notify(G.alreadyDefaultToast); return; }
    for (const p of plan) { fail(preset.toggle(p.item.id, p.g ? p.g.name : null)); }
    notify(G.restoredToast);
  };
  const OpenBtn = ({ label, onClick }: { label: string; onClick?: (() => void) | undefined }): React.JSX.Element | null => onClick ? <div><Button size="sm" onClick={onClick}>{label}</Button></div> : null;

  type Step = { id: string; title: string; aside?: React.ReactNode; body: () => React.ReactNode };
  const STEPS: Step[] = [
    {
      id: 'disclaimer', title: G.disclaimerTitle,
      body: () => (
        <Stack>
          <Intro>{G.disclaimerIntro}</Intro>
          <div data-k="prose" data-k-level="sunken" data-guide-disclaimer="" style={{ padding: 'var(--k-space-4)', borderRadius: 'var(--k-r-md)', maxWidth: 'none' }}>
            {disclaimer ? <Markdown text={disclaimer} /> : <p>预设里没有找到免责声明条目，请到预设列表中查看。</p>}
          </div>
          {confirmed ? <div><Badge tone="success">{G.disclaimerAccepted}</Badge></div> : (
            <>
              {/* 同意这一行整行可点（用户 2026-11-12 反映「有时勾不上」：原来只有最右边、贴着滚动条的 20px 小框能点，点文字没反应；
                  手机上手指容易点偏，卡顿时连点两下又取消了）。框放到文字前面，整行是一个 label */}
              <label data-guide-agree="" data-state={agree ? 'checked' : 'unchecked'}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--k-space-3)', padding: 'var(--k-space-3) var(--k-space-4)', minHeight: 48, cursor: 'pointer',
                  borderRadius: 'var(--k-r-md)', border: 'var(--k-border-w) solid ' + (agree ? 'var(--k-accent)' : 'var(--k-border)'), background: agree ? 'var(--k-soft)' : 'transparent', userSelect: 'none' }}>
                <Checkbox checked={agree} onCheckedChange={(x) => setAgree(x === true)} aria-label={G.disclaimerAgree} />
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>{G.disclaimerAgree}</span>
              </label>
              <Intro>{G.disclaimerConfirmHint}</Intro>
            </>
          )}
        </Stack>
      )
    },
    {
      id: 'tour', title: G.tourTitle,
      body: () => (
        <Stack>
          <Intro>{G.tourIntro}</Intro>
          <SettingSection title={G.tourButtonsTitle}><Terms rows={G.tourButtons} /></SettingSection>
          <SettingSection title={G.tourMessageTitle}><Intro>{G.tourMessage}</Intro></SettingSection>
        </Stack>
      )
    },
    {
      id: 'skin', title: '外观',
      body: () => (
        <Stack>
          <Intro>{G.skinPageIntro}</Intro>
          {skins ? <SkinChoices manager={skins} compact={compact} notify={notify} /> : <Intro>{G.skinDegrade}</Intro>}
          <OpenBtn label={G.openDisplay} onClick={open.display} />
        </Stack>
      )
    },
    {
      id: 'model', title: '模型',
      body: () => (
        <Stack>
          <Intro>{G.modelPageIntro}</Intro>
          {MODEL_TAB ? <ModelPicker t={MODEL_TAB} st={st} act={act} withItems={false} /> : <Intro>{G.presetDegrade}</Intro>}
        </Stack>
      )
    },
    ...(layersOrdered.length ? layersOrdered.map((t): Step => ({
      id: 'layer:' + plain(t.name), title: plain(t.name),
      aside: defaults ? <Button variant="ghost" size="sm" onClick={() => restore(t)}>{G.restoreDefaults}</Button> : undefined,
      body: () => (
        <Stack>
          {layerIntro[plain(t.name)] ? <Intro>{layerIntro[plain(t.name)]}</Intro> : null}
          {defaults ? <Intro>{G.layerDefaultHint}</Intro> : null}
          <LayerBody t={t} st={st} act={act} defaults={defaults} G={G} />
        </Stack>
      )
    })) : [{ id: 'layers', title: '预设选项', body: () => <Intro>{G.presetDegrade}</Intro> }]),
    {
      id: 'message', title: G.messageTitle,
      body: () => (
        <Stack>
          <Intro>{G.messageIntro}</Intro>
          <SampleMessage />
          <SettingSection title="每一块是什么"><Terms rows={G.messageParts} /></SettingSection>
          <Intro>{G.messageMore}</Intro>
          <OpenBtn label={G.openDisplay} onClick={open.display} />
        </Stack>
      )
    },
    {
      id: 'long', title: '长文与截断',
      body: () => (
        <Stack>
          <SettingSection title={G.compressPageTitle}>
            <Intro>{G.compressPageIntro}</Intro>
            {comp && long.compress ? (
              <ChoiceGrid min={240}>
                <ChoiceCard multi selected={!!comp.roll} disabled={comp.roll === null} onSelect={() => { void Promise.resolve(long.compress!.setRoll(!comp.roll)).then(force); }} title={G.compressRollName} meta={comp.roll ? G.compressOn : G.compressOff}>{G.compressRollNote}</ChoiceCard>
                <ChoiceCard multi selected={comp.grand} onSelect={() => { void Promise.resolve(long.compress!.setGrand(!comp.grand)).then(force); }} title={G.compressGrandName} meta={comp.grand ? G.compressOn : G.compressOff}>{G.compressGrandNote}</ChoiceCard>
              </ChoiceGrid>
            ) : <Intro>{G.compressDegrade}</Intro>}
            <div data-k="prose" style={{ maxWidth: 'none' }}>
              <p><strong>{G.compressPickTitle}</strong></p>
              <p>{G.compressPickNote}</p>
              <p style={{ color: 'var(--k-on-muted)' }}>{G.compressParamsNote}</p>
            </div>
            {long.compress && long.compress.open ? <div><Button size="sm" onClick={() => long.compress!.open!()}>{G.compressOpenPanel}</Button></div> : null}
          </SettingSection>
          <SettingSection title={G.antitruncPageTitle}>
            {long.antitrunc && anti !== null ? (
              <SettingRow label={anti ? G.antitruncOn : G.antitruncOff} description={G.antitruncPageIntro}
                control={<Switch checked={anti} onCheckedChange={(x) => { void Promise.resolve(long.antitrunc!.set(x)).then(force); }} aria-label={G.antitruncPageTitle} />} />
            ) : <Intro>{G.antitruncDegrade}</Intro>}
          </SettingSection>
        </Stack>
      )
    },
    {
      id: 'search', title: G.searchTitle,
      body: () => (
        <Stack>
          <Intro>{G.searchIntro}</Intro>
          <Terms rows={G.searchHow} />
          <OpenBtn label={G.openSearch} onClick={open.toolbox ? () => open.toolbox!('search') : undefined} />
        </Stack>
      )
    },
    {
      id: 'tools', title: G.toolsTitle,
      body: () => (
        <Stack>
          <Intro>{G.toolsIntro}</Intro>
          <Terms rows={G.toolsList} />
          {open.toolbox ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => open.toolbox!('other')}>{G.openTools}</Button>
            <Button size="sm" onClick={() => open.toolbox!('update')}>{G.openUpdate}</Button>
          </div> : null}
        </Stack>
      )
    },
    {
      id: 'done', title: '完成',
      body: () => {
        const model = (MODEL_TAB?.models || []).find((m) => m.name === st.model);
        const lang = LANG ? LANG.items.find((x) => st.on[x.id]) : undefined;
        const chips = [
          skins ? '皮肤 · ' + skins.current.manifest.name : '',
          model ? '模型 · ' + model.label : '',
          lang ? plain(LANG!.name) + ' · ' + plain(lang.name) : '',
          comp ? '压缩 · ' + ([comp.roll ? '滚动' : '', comp.grand ? '超限' : ''].filter(Boolean).join(' + ') || '不压缩') : '',
          anti !== null ? '防截断 · ' + (anti ? '开' : '关') : ''
        ].filter(Boolean);
        return (
          <Stack>
            <h3 style={{ fontSize: 'var(--k-fs-xl)', fontFamily: 'var(--k-font-heading)' }}>{G.completionTitle}</h3>
            <Intro>{G.completionBody}</Intro>
            <SettingSection title="这次选了">
              <div data-guide-summary="" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{chips.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
            </SettingSection>
            <SettingSection title={G.doneButtonsTitle}><Terms rows={G.tourButtons} /></SettingSection>
          </Stack>
        );
      }
    }
  ];

  const go = (n: number): void => {
    setI(n); setSeen((s) => Math.max(s, n));
    const w = body.current?.ownerDocument.defaultView || window;   /* 宿主窗口的 rAF：脚本 iframe 是隐藏的，它的 rAF 可能不触发 */
    w.requestAnimationFrame(() => {
      const el = body.current?.closest('[data-k-part="body"]'); if (el) { el.scrollTop = 0; }
      /* 步骤列表自己滚时，让当前这一步留在列表的可见范围里 */
      const nv = nav.current, cur = nv ? nv.querySelector('[aria-current]:not([aria-current="false"])') as HTMLElement | null : null;
      if (nv && cur && nv.scrollHeight > nv.clientHeight) {
        const t = cur.offsetTop - nv.offsetTop;
        if (t < nv.scrollTop || t + cur.offsetHeight > nv.scrollTop + nv.clientHeight) { nv.scrollTop = Math.max(0, t - nv.clientHeight / 2 + cur.offsetHeight / 2); }
      }
    });
  };
  const step = STEPS[Math.min(i, STEPS.length - 1)]!;
  const last = i >= STEPS.length - 1;
  const gate = step.id === 'disclaimer' && !confirmed;
  const counter = fill(G.stepCounter, { n: i + 1, total: STEPS.length });
  /* 确认前关不掉：没有关闭按钮，Esc / 下拉关闭只提示 */
  const close = (completed: boolean): void => { if (!confirmed) { notify(G.disclaimerLockedToast); return; } onClose(completed); };
  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
      {compact ? <span style={{ marginRight: 'auto', color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{counter}</span> : null}
      {i > 0 ? <Button variant="ghost" onClick={() => go(i - 1)}>{G.btnPrev}</Button> : null}
      {gate ? <Button variant="primary" disabled={!agree} onClick={() => { setConfirmed(true); if (onConfirm) { onConfirm(); } go(i + 1); }}>{G.btnConfirm}</Button>
        : last ? <Button variant="primary" onClick={() => close(true)}>{G.btnFinish}</Button>
          : <Button variant="primary" onClick={() => go(i + 1)}>{G.btnNext}</Button>}
    </div>
  );
  return (
    <Panel title={G.wizardTitle} actions={compact ? undefined : <Badge>{counter}</Badge>} onClose={() => close(false)} closable={confirmed} footer={footer} defaultSize={{ w: 960, h: 780 }}>
      <div ref={body} data-guide-step={step.id} data-guide-locked={confirmed ? undefined : ''} style={compact ? undefined : { display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
        {compact ? (
          <div role="progressbar" aria-label={fill(G.progressAria, { n: i + 1, total: STEPS.length })} aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}
            style={{ display: 'flex', gap: 3, marginBottom: 'var(--k-gap-group)' }}>
            {STEPS.map((s, n) => <span key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= i ? 'var(--k-accent)' : 'var(--k-divider)' }} />)}
          </div>
        ) : (
          <div ref={nav} data-guide-nav="" style={{ position: 'sticky', top: 0, ...(navMax ? { maxHeight: navMax, overflowY: 'auto', overscrollBehavior: 'contain' } : {}) }}>
            <NavList layout="sidebar" label="引导步骤" current={step.id}
              items={STEPS.map((s, n) => ({ id: s.id, label: (n + 1) + '. ' + s.title, ...(n < i ? { meta: '✓' } : {}) }))}
              onSelect={(id) => { const n = STEPS.findIndex((s) => s.id === id); if (confirmed && n >= 0 && n <= Math.max(seen, i)) { go(n); } else if (!confirmed && n > 0) { notify(G.disclaimerLockedToast); } }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--k-gap-group)' }}>
            <h2 style={{ fontSize: 'var(--k-fs-xl)', margin: 0, flex: '1 1 auto' }}>{step.title}</h2>
            {step.aside || null}
          </div>
          {step.body()}
        </div>
      </div>
      {toast ? <Toast key={toast.n} message={toast.msg} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}
