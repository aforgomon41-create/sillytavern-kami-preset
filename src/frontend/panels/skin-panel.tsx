/**
 * 皮肤管理面板（新前端）。界面上的每一项都由皮肤包清单（skin.json）生成，面板本身不认识任何一套具体皮肤：
 *   · 皮肤列表：每套皮肤一张选择卡，缩略图按它自己的每档配色实时推导（和真正套上时同一套令牌引擎）
 *   · 配色：「跟随系统」+ 清单里的每一档（浅色 / 深色 / 额外配色的 name）
 *   · 特效：清单 effects，按 group 分组，每项一句说明
 *   · 参数：清单 params，按 group 分组；number → 滑杆（带单位），enum → 分段 / 下拉，color → 取色
 *   · 显示（对所有皮肤生效）：动效、密度、字号
 * 所有改动都交给 SkinManager（设置按皮肤分别保存、立即套用到所有渲染面），面板只是它的界面。
 * 「角色名样式」「正文前端开关」「行动选项默认展开」不是皮肤设置，不放在这里（旧界面盘点第三节）。
 * 电脑：左边皮肤列表、右边当前皮肤的设置；手机（≤1000px）：皮肤 / 外观 / 特效三个页签，左右滑动切换。
 */
import * as React from 'react';
import { resolveScheme } from '../skin-engine/tokens';
import type { SkinManager, StoredSettings } from '../skin-engine/manager';
import type { ParamDef, SkinManifest } from '../skin-engine/package';
import type { Mode } from '../skin-engine/tokens';
import {
  Badge, Button, Card, ChoiceCard, ChoiceGrid, InfoPopover, Panel, Segmented, Select, SettingRow, SettingSection, Slider, Switch, Tabs, TextField, Toast
} from '../ds';

export interface SkinPanelProps {
  manager: SkinManager;
  onClose: () => void;
  /** 窄屏判断（默认 ≤1000px，和预设设置面板一致） */
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

const MOTION = [{ value: 'full', label: '完整' }, { value: 'calm', label: '平静' }, { value: 'off', label: '关闭' }];
const DENSITY = [{ value: 'compact', label: '紧凑' }, { value: 'cozy', label: '适中' }, { value: 'roomy', label: '宽松' }];

const schemeName = (m: SkinManifest, id: string): string => (id === 'light' ? '浅色' : id === 'dark' ? '深色' : m.schemes[id]?.name || id);
const schemeMode = (m: SkinManifest, id: string): Mode => (id === 'light' || id === 'dark' ? id : (m.schemes[id]?.base || 'light'));
/** 配色排序：浅色、深色在前，额外配色按清单顺序 */
const schemeIds = (m: SkinManifest): string[] => ['light', 'dark', ...Object.keys(m.schemes).filter((s) => s !== 'light' && s !== 'dark')].filter((s) => m.schemes[s]);

function useMatch(q: string): boolean {
  const [c, setC] = React.useState(() => matchMedia(q).matches);
  React.useEffect(() => { const m = matchMedia(q); const on = (): void => setC(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, [q]);
  return c;
}

function useManager(mgr: SkinManager): StoredSettings {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => mgr.subscribe(() => force()), [mgr]);
  return mgr.settings;
}

/* ───────── 缩略图：每档配色一块，按真实令牌画「底色 + 卡片 + 标题条 + 正文条 + 强调按钮」 ───────── */

const swatchCache = new Map<string, Record<string, string>>();
function schemeTokens(m: SkinManifest, id: string): Record<string, string> | null {
  const key = m.id + '@' + m.version + ':' + id;
  if (swatchCache.has(key)) { return swatchCache.get(key)!; }
  const def = m.schemes[id];
  if (!def) { return null; }
  try {
    const t = resolveScheme({ mode: schemeMode(m, id), seeds: def.seeds, ...(def.tokens ? { tokens: def.tokens } : {}) }).tokens;
    swatchCache.set(key, t);
    return t;
  } catch (e) { return null; }
}

function Swatch({ m, active }: { m: SkinManifest; active?: string | undefined }): React.JSX.Element {
  const ids = schemeIds(m);
  return (
    <span aria-hidden="true" style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      {ids.map((id) => {
        const t = schemeTokens(m, id);
        if (!t) { return null; }
        const r = Math.min(8, Number(m.schemes[id]?.seeds.radius ?? 6));
        const bar = (w: string, c: string, h = 4): React.JSX.Element => <span style={{ display: 'block', width: w, height: h, borderRadius: 2, background: c }} />;
        return (
          <span key={id} title={schemeName(m, id)} style={{
            flex: '1 1 0', minWidth: 0, display: 'block', padding: 5, borderRadius: r, background: t['bg'],
            outline: active === id ? '2px solid ' + t['accent'] : 'none', outlineOffset: 1
          }}>
            <span style={{ display: 'grid', gap: 4, padding: 6, minWidth: 0, overflow: 'hidden', borderRadius: Math.max(0, r - 2), background: t['surface-1'], boxShadow: 'inset 0 0 0 1px ' + t['border-surface-1'] }}>
              {bar('55%', t['on-surface-1']!, 5)}
              {bar('90%', t['on-surface-1-muted']!)}
              {bar('70%', t['on-surface-1-muted']!)}
              <span style={{ display: 'flex', gap: 3, marginTop: 2, minWidth: 0 }}>
                <span style={{ display: 'block', width: '36%', height: 8, borderRadius: Math.min(4, r), background: t['accent'] }} />
                <span style={{ display: 'block', width: '22%', height: 8, borderRadius: Math.min(4, r), background: t['control'], boxShadow: 'inset 0 0 0 1px ' + t['border-control'] }} />
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ───────── 小工具 ───────── */

const info = (label: string, body: React.ReactNode): React.ReactNode => <InfoPopover label={'关于「' + label + '」'}>{body}</InfoPopover>;

function groupBy<T extends { group?: string | undefined }>(list: T[], fallback: string): Array<[string, T[]]> {
  const out = new Map<string, T[]>();
  for (const x of list) { const g = x.group || fallback; if (!out.has(g)) { out.set(g, []); } out.get(g)!.push(x); }
  return Array.from(out);
}

const fmtNum = (p: Extract<ParamDef, { type: 'number' }>, v: number): string => {
  const d = (String(p.step ?? 1).split('.')[1] || '').length;
  return v.toFixed(d) + (p.unit ? ' ' + p.unit : '');
};

/** 滑杆：拖动时只更新显示，按帧合并后才交给管理器（重新合成皮肤），避免每个指针事件都重算令牌 */
function ParamSlider({ p, value, onApply }: { p: Extract<ParamDef, { type: 'number' }>; value: number; onApply: (v: number) => void }): React.JSX.Element {
  const [v, setV] = React.useState(value);
  const raf = React.useRef(0);
  React.useEffect(() => { setV(value); }, [value]);
  React.useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const change = (n: number): void => {
    setV(n);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => onApply(n));
  };
  return <Slider value={v} min={p.min} max={p.max} step={p.step ?? 1} onValueChange={change} format={(x) => fmtNum(p, x)} aria-label={p.name} />;
}

/* ───────── 各块 ───────── */

interface Ctx { mgr: SkinManager; st: StoredSettings; m: SkinManifest; notify: (msg: string, undo?: () => void) => void }

function SkinList({ mgr, st, notify, compact }: Ctx & { compact: boolean }): React.JSX.Element {
  const list = mgr.list();
  return (
    <SettingSection title="皮肤" badge={<Badge>{list.length} 套</Badge>}>
      <ChoiceGrid min={compact ? 240 : 220}>
        {list.map((m) => {
          const per = st.perSkin[m.id];
          return (
            <ChoiceCard key={m.id} selected={st.skin === m.id}
              title={m.name} meta={'v' + m.version}
              onSelect={() => {
                if (st.skin === m.id) { return; }
                const prev = st.skin;
                const prevName = mgr.list().find((x) => x.id === prev)?.name || prev;
                mgr.select(m.id);
                notify('已换成「' + m.name + '」', () => { mgr.select(prev); notify('已换回「' + prevName + '」'); });
              }}
              info={m.description || m.author ? info(m.name, <>
                {m.description ? <p>{m.description}</p> : null}
                {m.author ? <p style={{ color: 'var(--k-on-muted)' }}>作者：{m.author}</p> : null}
              </>) : undefined}>
              <Swatch m={m} active={st.skin === m.id ? (per?.scheme && per.scheme !== 'auto' ? per.scheme : undefined) : undefined} />
            </ChoiceCard>
          );
        })}
      </ChoiceGrid>
    </SettingSection>
  );
}

function Appearance({ mgr, st, m }: Ctx): React.JSX.Element {
  const scheme = st.perSkin[m.id]?.scheme || 'auto';
  const opts = [{ value: 'auto', label: '跟随系统' }, ...schemeIds(m).map((id) => ({ value: id, label: schemeName(m, id) }))];
  const [fs, setFs] = React.useState(st.global.fontScale);
  React.useEffect(() => { setFs(st.global.fontScale); }, [st.global.fontScale]);
  return (
    <>
      <SettingSection title="配色" aside={info('配色', <p>「跟随系统」在系统浅色时用浅色、深色时用深色；其他配色（例如阅读）要手动选。每套皮肤分别记住自己的选择。</p>)}>
        <Segmented label="配色" options={opts} value={scheme} onValueChange={(v) => mgr.setScheme(v)} />
      </SettingSection>
      <SettingSection title="显示" badge={<Badge>所有皮肤</Badge>}>
        <SettingRow label="动效" description="「平静」只保留淡入淡出与光，「关闭」不播任何动画（系统要求减少动态效果时也会自动关闭）"
          control={<Segmented label="动效" size="sm" options={MOTION} value={st.global.motion} onValueChange={(v) => mgr.setGlobal({ motion: v as 'full' })} />} />
        <SettingRow label="密度" description="控件高度与间距"
          control={<Segmented label="密度" size="sm" options={DENSITY} value={st.global.density} onValueChange={(v) => mgr.setGlobal({ density: v as 'cozy' })} />} />
        <SettingRow label="字号" description="面板与消息里的文字一起缩放"
          control={<span style={{ display: 'block', width: 240, maxWidth: '100%' }}><Slider value={fs} min={0.8} max={1.4} step={0.05} aria-label="字号"
            format={(v) => Math.round(v * 100) + '%'} onValueChange={setFs} onValueCommit={(v) => mgr.setGlobal({ fontScale: v })} /></span>} />
      </SettingSection>
    </>
  );
}

function ParamRow({ p, value, set }: { p: ParamDef; value: string | number; set: (v: string | number) => void }): React.JSX.Element {
  const control = p.type === 'number'
    ? <span style={{ display: 'block', width: 240, maxWidth: '100%' }}><ParamSlider p={p} value={Number(value)} onApply={set} /></span>
    : p.type === 'enum'
      ? (p.options.length <= 4
        ? <Segmented label={p.name} size="sm" options={p.options.map((o) => ({ value: o.value, label: o.name }))} value={String(value)} onValueChange={set} />
        : <Select aria-label={p.name} options={p.options.map((o) => ({ value: o.value, label: o.name }))} value={String(value)} onValueChange={set} />)
      : <span style={{ display: 'block', width: 120 }}><TextField type="color" aria-label={p.name} value={String(value)} onChange={(e) => set(e.target.value)} /></span>;
  return <SettingRow label={p.name} control={control} />;
}

function Effects({ mgr, st, m, notify }: Ctx): React.JSX.Element {
  const per = st.perSkin[m.id];
  const effects = m.effects || [];
  const params = m.params || [];
  const onSet = new Set(per?.effects ?? effects.filter((f) => f.default).map((f) => f.id));
  const pv = (p: ParamDef): string | number => (per?.params && p.id in per.params ? per.params[p.id]! : p.default);
  return (
    <>
      {groupBy<{ group?: string | undefined; kind: 'e' | 'p'; e?: typeof effects[number]; p?: ParamDef }>([
        ...effects.map((e) => ({ group: e.group, kind: 'e' as const, e })),
        ...params.map((p) => ({ group: p.group, kind: 'p' as const, p }))
      ], '其他').map(([g, list]) => (
        <SettingSection key={g} title={g}>
          {list.map((x) => x.e ? (
            <SettingRow key={'e-' + x.e.id} label={x.e.name} description={x.e.description}
              control={<Switch checked={onSet.has(x.e.id)} onCheckedChange={(v) => mgr.setEffect(x.e!.id, v)} aria-label={x.e.name} />} />
          ) : x.p ? <ParamRow key={'p-' + x.p.id} p={x.p} value={pv(x.p)} set={(v) => mgr.setParam(x.p!.id, v)} /> : null)}
        </SettingSection>
      ))}
      {!effects.length && !params.length ? <p style={{ color: 'var(--k-on-muted)' }}>这套皮肤没有可调的特效或参数。</p> : null}
      <Card title={'关于「' + m.name + '」'} meta={'v' + m.version}>
        <div style={{ display: 'grid', gap: 'var(--k-space-2)' }}>
          {m.description ? <p>{m.description}</p> : null}
          {m.author ? <p style={{ color: 'var(--k-on-muted)' }}>作者：{m.author}</p> : null}
          {m.credits ? <p style={{ color: 'var(--k-on-muted)' }}>{m.credits}</p> : null}
          <div>
            <Button variant="ghost" size="sm" disabled={!per} onClick={() => {
              const before = per ? JSON.parse(JSON.stringify(per)) as typeof per : undefined;
              mgr.resetSkin();
              notify('「' + m.name + '」已恢复默认', () => mgr.restoreSkin(m.id, before));
            }}>恢复这套皮肤的默认设置</Button>
          </div>
        </div>
      </Card>
    </>
  );
}

export function SkinPanel({ manager: mgr, onClose, compactQuery = '(max-width: 1000px)', defaultSize = { w: 960, h: 760 } }: SkinPanelProps): React.JSX.Element {
  const st = useManager(mgr);
  const compact = useMatch(compactQuery);
  const m = mgr.current.manifest;
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => void; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = React.useCallback((msg: string, undo?: () => void): void => {
    setToast((t) => ({ msg, ...(undo ? { undo } : {}), n: (t?.n || 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  const ctx: Ctx = { mgr, st, m, notify };
  const [tab, setTab] = React.useState('skins');
  const cols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignContent: 'start' } as const;
  return (
    <Panel title="皮肤" actions={<Badge tone="accent">{m.name}</Badge>} onClose={onClose} defaultSize={defaultSize}>
      {compact ? (
        <Tabs label="皮肤设置" swipe sticky value={tab} onValueChange={setTab} items={[
          { value: 'skins', label: '皮肤', content: <div style={cols}><SkinList {...ctx} compact /></div> },
          { value: 'look', label: '外观', content: <div style={cols}><Appearance {...ctx} /></div> },
          { value: 'fx', label: '特效与参数', content: <div style={cols}><Effects {...ctx} /></div> }
        ]} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
          <div style={cols}><SkinList {...ctx} compact={false} /></div>
          <div style={cols}><Appearance {...ctx} /><Effects {...ctx} /></div>
        </div>
      )}
      {toast ? <Toast key={toast.n} message={toast.msg} {...(toast.undo ? { action: '撤销', onAction: () => { const u = toast.undo!; setToast(null); u(); } } : {})} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}

/** 只有皮肤列表（引导的「选皮肤」一步用）：同一套卡片与缩略图，改动同样交给管理器、立即套用 */
export function SkinChoices({ manager, compact = false, notify = () => undefined }: { manager: SkinManager; compact?: boolean; notify?: (msg: string, undo?: () => void) => void }): React.JSX.Element {
  const st = useManager(manager);
  return <SkinList mgr={manager} st={st} m={manager.current.manifest} notify={notify} compact={compact} />;
}
