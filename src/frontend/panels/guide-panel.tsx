/**
 * 引导（新前端），预览定稿（design/previews/guide）搬过来。旧引导 15 步里有 7 步是把预设设置各页签再走一遍；
 * 新引导只留**第一次必须决定**的 6 步，其余之后在面板里调：
 *   免责声明 → 外观（皮肤）→ 模型 → 语言与数值 → 长文压缩与防截断 → 完成
 * 每一步都直接改真实设置（和旧引导一样）：模型 / 语言 / 数值走 PresetApi（40 号 presetBridge），
 * 皮肤走 SkinManager（04 号「🧪 显示」），压缩走 60 号的读写桥，防截断走 20 号的 AntiTruncation。缺哪个就那一项显示降级说明。
 * 电脑：左侧步骤列表（走过的步骤可以点回去）；手机：顶部进度条。免责声明确认之前不能往后走。
 */
import * as React from 'react';
import G0 from '../../../design/copy/guide-copy.json';
import { Markdown } from '../message/markdown';
import type { SkinManager } from '../skin-engine/manager';
import { SkinChoices } from './display-panel';
import { GroupCards, ModelPicker, VarFields, plain, type Act } from './preset-parts';
import type { PresetApi } from './preset-panel';
import type { Live } from './toolbox-types';
import { Badge, Button, ChoiceCard, ChoiceGrid, NavList, Panel, SettingRow, SettingSection, Switch, Toast, useMedia } from '../ds';

export type GuideCopy = typeof G0;
export interface GuideLong {
  /** 60 号压缩：roll 为 null 表示当前预设里没有滚动压缩正则 */
  compress?: { get(): { roll: boolean | null; grand: boolean }; setRoll(on: boolean): unknown; setGrand(on: boolean): unknown; open?: () => void };
  /** 20 号反截断 */
  antitrunc?: { get(): boolean; set(on: boolean): unknown };
}
export interface GuidePanelProps {
  disclaimer: string;
  preset?: PresetApi | null;
  skins?: SkinManager | null;
  long?: GuideLong;
  /** 这些源有变化时重画（预设、压缩桥等） */
  live?: Live[];
  copy?: Partial<GuideCopy> | null;
  /** 关闭：completed = 点了最后一步的「完成」 */
  onClose: (completed: boolean) => void;
  onConfirm?: () => void;
  initialStep?: number;
  compactQuery?: string;
}

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
const Intro = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p style={{ color: 'var(--k-on-muted)', maxWidth: '42em' }}>{children}</p>;
const Stack = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{children}</div>;

function useLives(list: Live[]): void {
  const key = list.length;
  const sub = React.useCallback((fn: () => void) => { const offs = list.map((l) => l.subscribe(fn)); return () => offs.forEach((o) => o()); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useSyncExternalStore(sub, () => list.map((l) => l.version()).join(',') + '/' + key);
}

const STEP_IDS = ['disclaimer', 'skin', 'model', 'basics', 'long', 'done'] as const;

export function GuidePanel({ disclaimer, preset, skins, long = {}, live = [], copy, onClose, onConfirm, initialStep = 0, compactQuery = '(max-width: 1000px)' }: GuidePanelProps): React.JSX.Element {
  const G = React.useMemo(() => ({ ...G0, ...(copy || {}) }) as GuideCopy, [copy]);
  const sources = React.useMemo(() => [...(preset ? [preset] : []), ...live], [preset, live]);
  useLives(sources);
  const compact = useMedia(compactQuery);
  const [i, setI] = React.useState(Math.min(STEP_IDS.length - 1, Math.max(0, initialStep)));
  const [seen, setSeen] = React.useState(i);
  const [confirmed, setConfirmed] = React.useState(i > 0);
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [toast, setToast] = React.useState<{ msg: string; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = React.useCallback((msg: string) => { setToast((t) => ({ msg, n: (t?.n || 0) + 1 })); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 4000); }, []);
  const body = React.useRef<HTMLDivElement>(null);

  const v = preset ? preset.view() : null;
  const tabs = v && v.ok ? v.tabs : [];
  const st = v ? v.state : { on: {}, vars: {}, model: '' };
  const MODEL_TAB = tabs.find((t) => t.kind === 'model');
  const VARS = tabs.flatMap((t) => t.vars || []);
  /* 「语言」一步：引导要挑哪一组是内容决定（旧引导第 6 页也是它），按组名找 */
  const LANG = tabs.flatMap((t) => t.groups || []).find((g) => /语言/.test(g.name));
  const fail = (r: { ok: boolean; msg?: string }): void => { if (!r.ok) { notify(r.msg || '写入失败'); } };
  const act: Act = {
    toggle: (g, item) => { if (preset) { if (g && g.mode === 'one' && st.on[item.id]) { return; } fail(preset.toggle(item.id, g ? g.name : null)); } },
    setVar: (k, x) => { if (preset) { fail(preset.setVar(k, x)); } },
    setModel: (m) => { if (preset && m.name !== st.model) { fail(preset.selectModel(m.name)); } }
  };
  const comp = long.compress ? long.compress.get() : null;
  const anti = long.antitrunc ? long.antitrunc.get() : null;

  const STEPS: Array<{ id: string; title: string; body: () => React.ReactNode }> = [
    {
      id: 'disclaimer', title: '免责声明',
      body: () => (
        <Stack>
          <Intro>{G.disclaimerIntro}</Intro>
          <div data-k="prose" data-k-level="sunken" data-guide-disclaimer="" style={{ padding: 'var(--k-space-4)', borderRadius: 'var(--k-r-md)', maxWidth: 'none' }}>
            {disclaimer ? <Markdown text={disclaimer} /> : <p>预设里没有找到免责声明条目，请到预设列表中查看。</p>}
          </div>
          {!confirmed ? <Intro>{G.disclaimerConfirmHint}</Intro> : <Badge tone="success">已确认</Badge>}
        </Stack>
      )
    },
    {
      id: 'skin', title: '外观',
      body: () => (
        <Stack>
          <Intro>{G.skinPageIntro}</Intro>
          {skins ? <SkinChoices manager={skins} compact={compact} notify={notify} /> : <Intro>「🧪 显示」脚本没在运行，皮肤之后可以在🎨显示面板里换。</Intro>}
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
    {
      id: 'basics', title: '语言与数值',
      body: () => (
        <Stack>
          {LANG ? <><Intro>{G.pageIntroLang}</Intro><GroupCards g={LANG} st={st} act={act} /></> : null}
          {VARS.length ? <><Intro>{G.varsPageIntro}</Intro>{VARS.map((x) => <VarFields key={x.name} v={x} st={st} act={act} />)}</> : null}
          {!LANG && !VARS.length ? <Intro>{G.presetDegrade}</Intro> : null}
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
            ) : <Intro>「🧰 工具箱」脚本没在运行，压缩之后可以在工具箱里开。</Intro>}
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
            ) : <Intro>「🛡 反截断」脚本没在运行。</Intro>}
          </SettingSection>
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
            <Intro>文风、叙事、角色塑造、额外任务、推理选项等其余设置都保持预设默认，之后在🌟预设设置里按需调整。</Intro>
          </Stack>
        );
      }
    }
  ];

  const go = (n: number): void => {
    setI(n); setSeen((s) => Math.max(s, n));
    requestAnimationFrame(() => { const el = body.current?.closest('[data-k-part="body"]'); if (el) { el.scrollTop = 0; } });
  };
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const gate = step.id === 'disclaimer' && !confirmed;
  const counter = fill(G.stepCounter, { n: i + 1, total: STEPS.length });
  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
      {compact ? <span style={{ marginRight: 'auto', color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{counter}</span> : null}
      {i > 0 ? <Button variant="ghost" onClick={() => go(i - 1)}>{G.btnPrev}</Button> : null}
      {gate ? <Button variant="primary" onClick={() => { setConfirmed(true); if (onConfirm) { onConfirm(); } go(i + 1); }}>{G.btnConfirm}</Button>
        : last ? <Button variant="primary" onClick={() => onClose(true)}>{G.btnFinish}</Button>
          : <Button variant="primary" onClick={() => go(i + 1)}>{G.btnNext}</Button>}
    </div>
  );
  return (
    <Panel title={G.wizardTitle} actions={compact ? undefined : <Badge>{counter}</Badge>} onClose={() => onClose(false)} footer={footer} defaultSize={{ w: 900, h: 760 }}>
      <div ref={body} data-guide-step={step.id} style={compact ? undefined : { display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
        {compact ? (
          <div role="progressbar" aria-label={fill(G.progressAria, { n: i + 1, total: STEPS.length })} aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}
            style={{ display: 'flex', gap: 4, marginBottom: 'var(--k-gap-group)' }}>
            {STEPS.map((s, n) => <span key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= i ? 'var(--k-accent)' : 'var(--k-divider)' }} />)}
          </div>
        ) : (
          <div style={{ position: 'sticky', top: 0 }}>
            <NavList layout="sidebar" label="引导步骤" current={step.id}
              items={STEPS.map((s, n) => ({ id: s.id, label: (n + 1) + '. ' + s.title, ...(n < i ? { meta: '✓' } : {}) }))}
              onSelect={(id) => { const n = STEPS.findIndex((s) => s.id === id); if (n <= seen && (confirmed || n === 0)) { go(n); } }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--k-fs-xl)', marginBottom: 'var(--k-gap-group)' }}>{step.title}</h2>
          {step.body()}
        </div>
      </div>
      {toast ? <Toast key={toast.n} message={toast.msg} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}
