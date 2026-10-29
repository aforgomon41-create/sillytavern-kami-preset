/**
 * 「引导」重设计预览（皮肤：碎光）。旧引导 15 步，其中 7 步是把预设设置各页签再走一遍（旧界面盘点第二节第 5 条）；
 * 新引导只留**第一次必须决定**的 6 步，其余让用户之后在面板里调：
 *   免责声明 → 外观（皮肤）→ 模型 → 语言与数值 → 长文压缩与防截断 → 完成
 * 页面组件与预设设置面板、皮肤管理面板共用（src/frontend/panels/），数据同样来自解析预设本体；文案来自 design/copy/guide-copy.json。
 * 免责声明正文现读预设里的免责条目（guide-data.json 由 build/frontend/preview-preset-data.mjs 生成），确认之前不能往后走。
 * 电脑：左侧步骤列表（走过的步骤可以点回去）；手机：顶部进度条。只是预览：选择不会写回预设。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import { SkinManager, type StoredSettings } from '../../../src/frontend/skin-engine/manager';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import G from '../../copy/guide-copy.json';
import data from '../preset-panel/preset-data.json';
import guideData from './guide-data.json';
import { Markdown } from '../../../src/frontend/message/markdown';
import { SkinChoices } from '../../../src/frontend/panels/skin-panel';
import { GroupCards, ModelPicker, VarFields, initial, plain, type Act, type State, type Tab } from '../../../src/frontend/panels/preset-parts';
import { Badge, Button, ChoiceCard, ChoiceGrid, NavList, Panel, SettingRow, SettingSection, Switch, Toast } from '../../../src/frontend/ds';

const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
const KEY = 'kami-guide-preview-skin';
try { if (q.get('reset')) { localStorage.removeItem(KEY); } } catch (e) { /* 无痕 */ }
const mgr = new SkinManager({
  load: (): unknown => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  save: (s: StoredSettings): void => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 无痕 */ } }
}, rt, [
  { manifest: manifestJson as unknown as SkinManifest, css: skinCss, assetUrls: { paper: paperUrl } },
  { manifest: { id: 'paper', name: '粉纸浅黄', version: '0.0.1', contract: '1.0', defaultScheme: 'light', description: '测试皮肤',
    schemes: { light: { seeds: { neutral: '#f7d6e0', accent: '#ffe066', radius: 2, elevation: 'outline' } }, dark: { seeds: { neutral: '#3a2030', accent: '#ffe066', radius: 2, elevation: 'outline' } } } } }
], window);
mgr.apply();
(window as unknown as { __mgr: unknown }).__mgr = mgr;

const TABS: Tab[] = (data as unknown as { tabs: Tab[] }).tabs;
const MODEL_TAB = TABS.find((t) => t.kind === 'model');
const VARS = TABS.flatMap((t) => t.vars || []);
/* 「语言」一步：引导要挑哪一组是内容决定（旧引导第 6 页也是它），按组名找；预设里没有这一组时这一步只剩数值 */
const LANG = TABS.flatMap((t) => t.groups || []).find((g) => /语言/.test(g.name));
const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

function useCompact(): boolean {
  const mq = '(max-width: 1000px)';
  const [c, setC] = React.useState(() => matchMedia(mq).matches);
  React.useEffect(() => { const m = matchMedia(mq); const on = (): void => setC(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return c;
}

const Intro = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p style={{ color: 'var(--k-on-muted)', maxWidth: '42em' }}>{children}</p>;
const Stack = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{children}</div>;

interface Extra { roll: boolean; grand: boolean; antitrunc: boolean; confirmed: boolean }

interface Step { id: string; title: string; body: (p: { st: State; act: Act; ex: Extra; setEx: (p: Partial<Extra>) => void; compact: boolean; notify: (m: string) => void }) => React.ReactNode }

const STEPS: Step[] = [
  {
    id: 'disclaimer', title: '免责声明',
    body: ({ ex }) => (
      <Stack>
        <Intro>{G.disclaimerIntro}</Intro>
        <div data-k="prose" data-k-level="sunken" style={{ padding: 'var(--k-space-4)', borderRadius: 'var(--k-r-md)', maxWidth: 'none' }}>
          {guideData.disclaimer ? <Markdown text={guideData.disclaimer} /> : <p>预设里没有找到免责声明条目，请到预设列表中查看。</p>}
        </div>
        {!ex.confirmed ? <Intro>{G.disclaimerConfirmHint}</Intro> : <Badge tone="success">已确认</Badge>}
      </Stack>
    )
  },
  {
    id: 'skin', title: '外观',
    body: ({ compact, notify }) => (
      <Stack>
        <Intro>{G.skinPageIntro}</Intro>
        <SkinChoices manager={mgr} compact={compact} notify={notify} />
      </Stack>
    )
  },
  {
    id: 'model', title: '模型',
    body: ({ st, act }) => (
      <Stack>
        <Intro>{G.modelPageIntro}</Intro>
        {MODEL_TAB ? <ModelPicker t={MODEL_TAB} st={st} act={act} withItems={false} /> : <Intro>{G.presetDegrade}</Intro>}
      </Stack>
    )
  },
  {
    id: 'basics', title: '语言与数值',
    body: ({ st, act }) => (
      <Stack>
        {LANG ? <><Intro>{G.pageIntroLang}</Intro><GroupCards g={LANG} st={st} act={act} /></> : null}
        {VARS.length ? <><Intro>{G.varsPageIntro}</Intro>{VARS.map((v) => <VarFields key={v.name} v={v} st={st} act={act} />)}</> : null}
      </Stack>
    )
  },
  {
    id: 'long', title: '长文与截断',
    body: ({ ex, setEx, notify }) => (
      <Stack>
        <SettingSection title={G.compressPageTitle}>
          <Intro>{G.compressPageIntro}</Intro>
          <ChoiceGrid min={240}>
            <ChoiceCard multi selected={ex.roll} onSelect={() => setEx({ roll: !ex.roll })} title={G.compressRollName} meta={ex.roll ? G.compressOn : G.compressOff}>{G.compressRollNote}</ChoiceCard>
            <ChoiceCard multi selected={ex.grand} onSelect={() => setEx({ grand: !ex.grand })} title={G.compressGrandName} meta={ex.grand ? G.compressOn : G.compressOff}>{G.compressGrandNote}</ChoiceCard>
          </ChoiceGrid>
          <div data-k="prose" style={{ maxWidth: 'none' }}>
            <p><strong>{G.compressPickTitle}</strong></p>
            <p>{G.compressPickNote}</p>
            <p style={{ color: 'var(--k-on-muted)' }}>{G.compressParamsNote}</p>
          </div>
          <div><Button size="sm" onClick={() => notify('（预览）这里会打开工具箱的「压缩」页')}>{G.compressOpenPanel}</Button></div>
        </SettingSection>
        <SettingSection title={G.antitruncPageTitle}>
          <SettingRow label={ex.antitrunc ? G.antitruncOn : G.antitruncOff} description={G.antitruncPageIntro}
            control={<Switch checked={ex.antitrunc} onCheckedChange={(v) => setEx({ antitrunc: v })} aria-label={G.antitruncPageTitle} />} />
        </SettingSection>
      </Stack>
    )
  },
  {
    id: 'done', title: '完成',
    body: ({ st, ex }) => {
      const model = (MODEL_TAB?.models || []).find((m) => m.name === st.model);
      const lang = LANG ? LANG.items.find((i) => st.on[i.id]) : undefined;
      const chips = [
        '皮肤 · ' + mgr.current.manifest.name,
        model ? '模型 · ' + model.label : '',
        lang ? plain(LANG!.name).replace(/[[\]]/g, '') + ' · ' + plain(lang.name) : '',
        '压缩 · ' + ([ex.roll ? '滚动' : '', ex.grand ? '超限' : ''].filter(Boolean).join(' + ') || '不压缩'),
        '防截断 · ' + (ex.antitrunc ? '开' : '关')
      ].filter(Boolean);
      return (
        <Stack>
          <h3 style={{ fontSize: 'var(--k-fs-xl)', fontFamily: 'var(--k-font-heading)' }}>{G.completionTitle}</h3>
          <Intro>{G.completionBody}</Intro>
          <SettingSection title="这次选了">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{chips.map((c) => <Badge key={c} tone="accent">{c}</Badge>)}</div>
          </SettingSection>
          <Intro>文风、叙事、角色塑造、额外任务、推理选项等其余设置都保持预设默认，之后在🌟预设设置里按需调整。</Intro>
        </Stack>
      );
    }
  }
];

function App(): React.JSX.Element {
  const compact = useCompact();
  const [open, setOpen] = React.useState(true);
  const [i, setI] = React.useState(Math.min(STEPS.length - 1, Math.max(0, Number(q.get('step') || 0))));
  const [seen, setSeen] = React.useState(i);
  const [st, setSt] = React.useState<State>(() => initial(TABS));
  const [ex, setExState] = React.useState<Extra>({ roll: false, grand: true, antitrunc: false, confirmed: i > 0 });
  const [toast, setToast] = React.useState<{ msg: string; n: number } | null>(null);
  const timer = React.useRef(0);
  const notify = React.useCallback((msg: string) => { setToast((t) => ({ msg, n: (t?.n || 0) + 1 })); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 4000); }, []);
  const body = React.useRef<HTMLDivElement>(null);
  const setEx = (p: Partial<Extra>): void => setExState((e) => ({ ...e, ...p }));
  const act: Act = {
    toggle: (g, item) => setSt((s) => {
      const on = { ...s.on };
      if (g && g.mode === 'one') { for (const x of g.items) { on[x.id] = x.id === item.id; } } else { on[item.id] = !on[item.id]; }
      return { ...s, on };
    }),
    setVar: (k, v) => setSt((s) => ({ ...s, vars: { ...s.vars, [k]: v } })),
    setModel: (m) => setSt((s) => {
      const on = { ...s.on };
      for (const mm of MODEL_TAB?.models || []) { for (const x of mm.items) { on[x.id] = false; } }
      for (const x of m.items) { on[x.id] = true; }
      return { ...s, model: m.name, on };
    })
  };
  const go = (n: number): void => {
    setI(n); setSeen((s) => Math.max(s, n));
    /* 换页回到顶部（面板内容区自己滚动） */
    requestAnimationFrame(() => { const el = body.current?.closest('[data-k-part="body"]'); if (el) { el.scrollTop = 0; } });
  };
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开引导</Button></div>; }
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const gate = step.id === 'disclaimer' && !ex.confirmed;
  const counter = fill(G.stepCounter, { n: i + 1, total: STEPS.length });
  const footer = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
      {compact ? <span style={{ marginRight: 'auto', color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{counter}</span> : null}
      {i > 0 ? <Button variant="ghost" onClick={() => go(i - 1)}>{G.btnPrev}</Button> : null}
      {gate ? <Button variant="primary" onClick={() => { setEx({ confirmed: true }); go(i + 1); }}>{G.btnConfirm}</Button>
        : last ? <Button variant="primary" onClick={() => setOpen(false)}>{G.btnFinish}</Button>
          : <Button variant="primary" onClick={() => go(i + 1)}>{G.btnNext}</Button>}
    </div>
  );
  return (
    <Panel title={G.wizardTitle} actions={compact ? undefined : <Badge>{counter}</Badge>} onClose={() => setOpen(false)} footer={footer} defaultSize={{ w: 900, h: 760 }}>
      <div ref={body} style={compact ? undefined : { display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
        {compact ? (
          <div role="progressbar" aria-label={fill(G.progressAria, { n: i + 1, total: STEPS.length })} aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}
            style={{ display: 'flex', gap: 4, marginBottom: 'var(--k-gap-group)' }}>
            {STEPS.map((s, n) => <span key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= i ? 'var(--k-accent)' : 'var(--k-divider)' }} />)}
          </div>
        ) : (
          <div style={{ position: 'sticky', top: 0 }}>
            <NavList layout="sidebar" label="引导步骤" current={step.id}
              items={STEPS.map((s, n) => ({ id: s.id, label: (n + 1) + '. ' + s.title, ...(n < i ? { meta: '✓' } : {}) }))}
              onSelect={(id) => { const n = STEPS.findIndex((s) => s.id === id); if (n <= seen && (ex.confirmed || n === 0)) { go(n); } }} />
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--k-fs-xl)', marginBottom: 'var(--k-gap-group)' }}>{step.title}</h2>
          {step.body({ st, act, ex, setEx, compact, notify })}
        </div>
      </div>
      {toast ? <Toast key={toast.n} message={toast.msg} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}

rt.layer().open('guide-preview', <App />);
