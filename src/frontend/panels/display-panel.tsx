/**
 * 显示面板（新前端；原「皮肤管理」，用户 2026-10-29 改名：**总管所有前端与显示的事情**）。
 * 皮肤部分：界面上的每一项都由皮肤包清单（skin.json）生成，面板本身不认识任何一套具体皮肤：
 *   · 皮肤列表：每套皮肤一张选择卡，缩略图按它自己的每档配色实时推导（和真正套上时同一套令牌引擎）
 *   · 配色：「跟随系统」+ 清单里的每一档（浅色 / 深色 / 额外配色的 name）
 *   · 特效：清单 effects，按 group 分组，每项一句说明
 *   · 参数：清单 params，按 group 分组；number → 滑杆（带单位），enum → 分段 / 下拉，color → 取色
 *   · 显示（对所有皮肤生效）：动效、密度、字号
 * 所有改动都交给 SkinManager（设置按皮肤分别保存、立即套用到所有渲染面），面板只是它的界面。
 * 消息部分（用户 2026-10-29 定：放这里）：角色名样式、行动选项默认展开 / 收起、点选项时填入还是发送。
 *   这些设置的存放处各不相同（酒馆全局变量 / localStorage），面板不直接碰，由调用方传读写适配器（DisplayPrefs）；没传的项显示「脚本未运行」。
 * 电脑：左边皮肤列表、右边外观 / 消息 / 特效；手机（≤1000px）：皮肤 / 外观 / 消息 / 特效与参数四个页签，左右滑动切换。
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { composeSkin, DEFAULT_SETTINGS } from '../skin-engine/compose';
import type { SkinManager, StoredSettings } from '../skin-engine/manager';
import type { ParamDef, SkinManifest } from '../skin-engine/package';
import {
  Badge, Button, Card, ChoiceCard, DS_CSS, LevelProvider, useMedia, ChoiceGrid, InfoPopover, Panel, Segmented, Select, SettingRow, SettingSection, Slider, Switch, Tabs, TextField, Toast
} from '../ds';

/** 非皮肤的显示设置：每项一对读写函数，set 返回 false 表示写不进去（面板提示、不改显示） */
export interface DisplayPrefs {
  /** 角色名样式（35 号脚本的 KamiNameWrap：酒馆全局变量 kami_name_wrap） */
  nameWrap?: { modes: Array<{ id: string; label: string; demo: string }>; get: () => string; set: (id: string) => boolean };
  /** 行动选项默认收起（localStorage kami.options.folded，'1' = 收起；消息前端同一个键） */
  optionsFolded?: { get: () => boolean; set: (v: boolean) => boolean };
  /** 点行动选项时：填入 / 发送（localStorage kami-option-mode；消息里的切换按钮改的是同一个） */
  optionMode?: { get: () => 'fill' | 'send'; set: (v: 'fill' | 'send') => boolean };
}

export interface DisplayPanelProps {
  manager: SkinManager;
  prefs?: DisplayPrefs;
  onClose: () => void;
  /** 窄屏判断（默认 ≤1000px，和预设设置面板一致） */
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

const MOTION = [{ value: 'full', label: '完整' }, { value: 'calm', label: '平静' }, { value: 'off', label: '关闭' }];
const DENSITY = [{ value: 'compact', label: '紧凑' }, { value: 'cozy', label: '适中' }, { value: 'roomy', label: '宽松' }];

const schemeName = (m: SkinManifest, id: string): string => (id === 'light' ? '浅色' : id === 'dark' ? '深色' : m.schemes[id]?.name || id);
/** 配色排序：浅色、深色在前，额外配色按清单顺序 */
const schemeIds = (m: SkinManifest): string[] => ['light', 'dark', ...Object.keys(m.schemes).filter((s) => s !== 'light' && s !== 'dark')].filter((s) => m.schemes[s]);

const useMatch = (q: string): boolean => useMedia(q);   /* 按酒馆主页面的宽度算（见 ds useMedia） */

function useManager(mgr: SkinManager): StoredSettings {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => mgr.subscribe(() => force()), [mgr]);
  return mgr.settings;
}

/* ───────── 实时预览：用这套皮肤**真正的样式**渲染一小块真实界面 ─────────
 * 用户 2026-10-29：之前按令牌画的色条「没有把皮肤的样子展示出来」——看不到字体、纸纹、印章、圆角、阴影。
 * 现在每张皮肤卡里挂一个独立的 Shadow DOM：设计系统静态表（整个文档共用一份）+ 这套皮肤自己合成的样式表
 * （composeSkin，和真正套上时同一条路，含皮肤 CSS 与素材），里面用真组件摆一张卡片、一段文字、按钮、开关、徽章。
 * 预览只看不点：宿主 inert + aria-hidden + 不接收指针，点击落到外面的选择卡上。 */

const PREVIEW_W = 280;
const dsSheets = new WeakMap<Document, CSSStyleSheet | null>();
function dsSheetFor(doc: Document): CSSStyleSheet | null {
  if (dsSheets.has(doc)) { return dsSheets.get(doc)!; }
  let sheet: CSSStyleSheet | null = null;
  try { const W = doc.defaultView as (Window & typeof globalThis) | null; if (W && 'adoptedStyleSheets' in W.Document.prototype) { sheet = new W.CSSStyleSheet(); sheet.replaceSync(DS_CSS); } } catch (e) { sheet = null; }
  dsSheets.set(doc, sheet);
  return sheet;
}

function SkinPreview({ mgr, st, m }: { mgr: SkinManager; st: StoredSettings; m: SkinManifest }): React.JSX.Element {
  const host = React.useRef<HTMLSpanElement>(null);
  const [mount, setMount] = React.useState<{ root: HTMLElement; setCss: (css: string) => void } | null>(null);
  React.useLayoutEffect(() => {
    const h = host.current!;
    const doc = h.ownerDocument;
    const sr = h.shadowRoot || h.attachShadow({ mode: 'open' });
    sr.textContent = '';
    const ds = dsSheetFor(doc);
    let setCss: (css: string) => void;
    if (ds) {
      const own = new (doc.defaultView as Window & typeof globalThis).CSSStyleSheet();
      sr.adoptedStyleSheets = [ds, own];
      setCss = (css) => own.replaceSync(css);
    } else {
      const a = doc.createElement('style'), b = doc.createElement('style');
      a.textContent = DS_CSS; sr.append(a, b);
      setCss = (css) => { b.textContent = css; };
    }
    const root = doc.createElement('div');
    root.setAttribute('data-k-surface', 'preview');
    root.setAttribute('data-k-level', 'bg');
    root.style.padding = '10px';
    /* 预览按固定 280px 宽排版，再按卡片实际宽度整体等比缩放（手机两张并排时卡片只有 160px 左右，直接排会把按钮挤成一列） */
    root.style.width = PREVIEW_W + 'px';
    root.style.transformOrigin = '0 0';
    root.style.borderRadius = '6px';
    sr.appendChild(root);
    setMount({ root, setCss });
    const fit = (): void => {
      const w = h.clientWidth;
      const k = w > 0 ? Math.min(1, w / PREVIEW_W) : 1;
      root.style.transform = k < 1 ? 'scale(' + k + ')' : '';
      root.style.width = (k < 1 ? PREVIEW_W : w) + 'px';
      h.style.height = Math.ceil(root.offsetHeight * k) + 'px';
    };
    const W = doc.defaultView as Window & typeof globalThis;
    const ro = typeof W.ResizeObserver === 'function' ? new W.ResizeObserver(fit) : null;
    if (ro) { ro.observe(h); ro.observe(root); } else { fit(); }
    return () => { if (ro) { ro.disconnect(); } sr.textContent = ''; setMount(null); };
  }, []);
  const per = st.perSkin[m.id] || {};
  const dark = useMedia('(prefers-color-scheme: dark)');
  const key = JSON.stringify([m.id, m.version, per, st.global, dark]);
  React.useLayoutEffect(() => {
    if (!mount) { return; }
    const e = mgr.entry(m.id);
    try {
      const c = composeSkin(m, { ...DEFAULT_SETTINGS, ...st.global, scheme: per.scheme ?? 'auto', ...(per.effects ? { effects: per.effects } : {}), ...(per.params ? { params: per.params } : {}) },
        { systemDark: dark, ...(e?.css ? { skinCss: e.css } : {}), ...(e?.assetUrls ? { assetUrls: e.assetUrls } : {}) });
      mount.setCss(c.css);
      for (const [n, v] of Object.entries(c.attrs)) { mount.root.setAttribute(n, v); }
    } catch (err) { mount.setCss(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mount, key]);
  return (
    <span ref={host} aria-hidden="true" {...{ inert: '' }} style={{ display: 'block', marginTop: 8, pointerEvents: 'none', overflow: 'hidden' }}>
      {mount ? createPortal(
        <LevelProvider level="bg">
          <Card title="示例卡片" meta="预览">
            <span style={{ display: 'grid', gap: 8 }}>
              <span style={{ display: 'block' }}>「静时如纸，动时碎光。」她合上书页，抬眼看你。</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Button variant="primary" size="sm">确定</Button>
                <Button size="sm">取消</Button>
                <Switch checked aria-label="示例开关" />
                <Badge tone="accent">标签</Badge>
              </span>
            </span>
          </Card>
        </LevelProvider>, mount.root) : null}
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
      <ChoiceGrid min={compact ? 140 : 220}>
        {list.map((m) => {
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
              <SkinPreview mgr={mgr} st={st} m={m} />
              <span style={{ display: 'block', marginTop: 6, fontSize: 'var(--k-fs-sm)', color: 'inherit', opacity: 1 }}>{schemeIds(m).map((id) => schemeName(m, id)).join(' · ')}</span>
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

/* ───────── 消息（非皮肤的显示设置） ───────── */

const NAME_WRAP_NOTE = '更改角色名外面的包裹符号，切换后立刻对新生成的回复生效。';   /* 与引导同一句（design/copy/guide-copy.json nameWrapBody） */

function MessagePrefs({ prefs, notify }: { prefs: DisplayPrefs; notify: Ctx['notify'] }): React.JSX.Element {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const off = <span style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>脚本未运行</span>;
  const write = (ok: boolean): void => { if (!ok) { notify('写不进去，设置没变。'); } force(); };
  const nw = prefs.nameWrap, of = prefs.optionsFolded, om = prefs.optionMode;
  const cur = nw ? nw.modes.find((m) => m.id === nw.get()) : undefined;
  return (
    <SettingSection title="消息" badge={<Badge>所有皮肤</Badge>}>
      <SettingRow label="角色名样式" description={NAME_WRAP_NOTE + (cur ? '（现在：' + cur.demo + '）' : '')}
        control={nw ? <Segmented label="角色名样式" size="sm" options={nw.modes.map((m) => ({ value: m.id, label: m.label }))} value={nw.get()} onValueChange={(v) => write(nw.set(v))} /> : off} />
      <SettingRow label="行动选项默认" description="行动选项在消息里的默认状态。选项头部随时可以单独展开或收起。"
        control={of ? <Segmented label="行动选项默认" size="sm" options={[{ value: 'open', label: '展开' }, { value: 'folded', label: '收起' }]} value={of.get() ? 'folded' : 'open'} onValueChange={(v) => write(of.set(v === 'folded'))} /> : off} />
      <SettingRow label="点选项时" description="填进输入框（接在已有内容后面），还是直接发送。消息里的切换按钮改的是同一个设置。"
        control={om ? <Segmented label="点选项时" size="sm" options={[{ value: 'fill', label: '填入' }, { value: 'send', label: '发送' }]} value={om.get()} onValueChange={(v) => write(om.set(v as 'fill' | 'send'))} /> : off} />
    </SettingSection>
  );
}

/** 标题栏的快速切换（用户 2026-10-29 要求）：不用翻列表，下拉直接换；同样可撤销 */
function QuickPick({ mgr, st, notify }: { mgr: SkinManager; st: StoredSettings; notify: Ctx['notify'] }): React.JSX.Element {
  return (
    <span style={{ display: 'block', maxWidth: '45vw' }}>
      <Select aria-label="快速切换皮肤" size="sm" value={st.skin} options={mgr.list().map((x) => ({ value: x.id, label: x.name }))}
        onValueChange={(id) => {
          if (id === st.skin) { return; }
          const prev = st.skin, prevName = mgr.list().find((x) => x.id === prev)?.name || prev, name = mgr.list().find((x) => x.id === id)?.name || id;
          mgr.select(id);
          notify('已换成「' + name + '」', () => { mgr.select(prev); notify('已换回「' + prevName + '」'); });
        }} />
    </span>
  );
}

export function DisplayPanel({ manager: mgr, prefs = {}, onClose, compactQuery = '(max-width: 1000px)', defaultSize = { w: 960, h: 760 } }: DisplayPanelProps): React.JSX.Element {
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
    <Panel title="显示" actions={<QuickPick mgr={mgr} st={st} notify={notify} />} onClose={onClose} defaultSize={defaultSize}>
      {compact ? (
        <Tabs label="显示设置" swipe sticky value={tab} onValueChange={setTab} items={[
          { value: 'skins', label: '皮肤', content: <div style={cols}><SkinList {...ctx} compact /></div> },
          { value: 'look', label: '外观', content: <div style={cols}><Appearance {...ctx} /></div> },
          { value: 'msg', label: '消息', content: <div style={cols}><MessagePrefs prefs={prefs} notify={notify} /></div> },
          { value: 'fx', label: '特效与参数', content: <div style={cols}><Effects {...ctx} /></div> }
        ]} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignItems: 'start' }}>
          <div style={cols}><SkinList {...ctx} compact={false} /></div>
          <div style={cols}><Appearance {...ctx} /><MessagePrefs prefs={prefs} notify={notify} /><Effects {...ctx} /></div>
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
