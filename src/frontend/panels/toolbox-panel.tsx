/**
 * 工具箱面板（新前端）。四个页签：压缩 / 网络搜索 / 其他功能 / 更新（用户 2026-10-29：原预设设置的「关于」挪进来改成「更新」，页签都带图标）。
 * 界面照预览（design/previews/toolbox）定稿；数据全部来自旧脚本的读写桥（toolbox-types.ts），面板不保存任何业务状态：
 *   压缩、网络搜索、手动搜索 → 60 号 KamiToolbox.bridge()；其他功能、更新页 → 40 号 KamiPreset.toolsBridge() / updateBridge()。
 * 没传的桥对应的页显示「脚本未运行」。
 * 另外导出几个独立窗口，由 05 号脚本按需打开：手动搜索（ManualSearchDialog）、更新询问 / 进度 / 逐条裁决（70 号流程走 KamiUpdateUi）。
 * 文字输入框一律「失焦或回车才写回」：脚本那边每次写回都会存盘、取消进行中的搜索，不能每个按键都写。
 */
import * as React from 'react';
import CC from '../../../design/copy/compress-copy.polished.json';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, CollapseCard, Dialog, Field, InfoPopover, Panel, Progress, Segmented, Select, SettingRow, SettingSection,
  Slider, Steps, Switch, Tabs, TextArea, TextField, Toast, ICONS, useMedia
} from '../ds';
import type {
  CompressApi, CompressState, Live, LlmApi, ManualApi, MergePlan, OtherApi, SearchApi, SearchLimits, SearchProgress, ToolboxBridge, UpdateApi, UpdateView
} from './toolbox-types';

/* 60 号 COPY 里有、留档 json 里没有的几条（文字与 60 号一致；运行时以桥上带来的 COPY 为准） */
const EXTRA = {
  model: {
    pickModelLabel: '选择模型', pickLabel: '连接配置', pickCurrent: '当前连接', pickNone: '酒馆中没有已保存的对话补全连接配置',
    pickHint: '可直接选用酒馆已保存的连接配置，无需重复填写接口参数。',
    pickProxyNote: '使用酒馆代理的配置可能无法读取其内置密钥。若总结失败，请切换至自定义接口手动填写密钥。'
  },
  prompts: { roleLabel: '角色', tplLabel: '提示词模板', tplNamePh: '模板名称', tplSaveAs: '存为新模板', tplDel: '删除当前模板', tplHint: '切换模板会替换提示词内容与结构，保存后可随时切换不同总结风格。' },
  blocks: {
    blockTag: '块', lbNone: '（当前聊天未绑定世界书）', errHint: '压缩数据读取异常：{err}',
    errFix: '可点击顶部「清除压缩数据」重置当前聊天的压缩记录。已被隐藏的楼层不会受影响。',
    pendingTag: '待重新生成', orphanBtn: '重新纳入大总结', suspectTag: '疑似失败内容', refresh: '刷新', refreshTip: '重新读取世界书，同步手动修改的内容'
  }
};
type Copy = typeof CC & { model: typeof CC.model & typeof EXTRA.model; prompts: typeof CC.prompts & typeof EXTRA.prompts; blocks: typeof CC.blocks & typeof EXTRA.blocks };
function mergeCopy(live: unknown): Copy {
  const out: Record<string, unknown> = {};
  const a = CC as unknown as Record<string, unknown>, b = EXTRA as unknown as Record<string, unknown>, c = (live && typeof live === 'object' ? live : {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
    const parts = [a[k], b[k], c[k]];
    if (parts.some((p) => p && typeof p === 'object' && !Array.isArray(p))) { out[k] = Object.assign({}, ...parts.filter((p) => p && typeof p === 'object')); }
    else { out[k] = c[k] ?? b[k] ?? a[k]; }
  }
  return out as Copy;
}
const CopyCtx = React.createContext<Copy>(mergeCopy(null));

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
type Notify = (msg: string, undo?: () => void) => void;

/** 订阅一个变化源：它通知一次就重画一次 */
function useLive(src: Live | null | undefined): number {
  const sub = React.useCallback((fn: () => void) => (src ? src.subscribe(fn) : () => undefined), [src]);
  return React.useSyncExternalStore(sub, () => (src ? src.version() : 0));
}

const info = (label: string, text: string): React.ReactNode => <InfoPopover label={'关于「' + label + '」'}><p>{text}</p></InfoPopover>;
const Note = ({ children, tone }: { children: React.ReactNode; tone?: 'danger' | 'warning' }): React.JSX.Element => (
  <p style={{ color: tone ? 'var(--k-' + tone + ')' : 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{children}</p>
);
const Row = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>;
const Stack = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{children}</div>;
const Grid2 = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--k-gap-group)' }}>{children}</div>;
const Missing = ({ what }: { what: string }): React.JSX.Element => (
  <SettingSection title="脚本未运行"><Note>{what}没在运行，这一页暂时用不了。到酒馆助手的脚本列表里把它打开即可。</Note></SettingSection>
);
function swallow(p: unknown): void { Promise.resolve(p).catch(() => undefined); }

/* ───────── 失焦 / 回车才写回的输入框 ───────── */

function CommitText({ value, onCommit, label, type, placeholder, multiline, rows, width, readOnly, inputMode }: {
  value: string; onCommit: (v: string) => void; label: string; type?: string; placeholder?: string; multiline?: boolean; rows?: number; width?: number | string; readOnly?: boolean; inputMode?: 'numeric' | 'text';
}): React.JSX.Element {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  React.useEffect(() => { if (!editing.current) { setDraft(value); } }, [value]);
  const commit = (): void => { editing.current = false; if (draft !== value) { onCommit(draft); } };
  const common = {
    'aria-label': label, value: draft, ...(placeholder ? { placeholder } : {}), ...(readOnly ? { readOnly } : {}),
    onFocus: () => { editing.current = true; },
    onBlur: commit
  };
  const el = multiline
    ? <TextArea {...common} rows={rows || 4} onChange={(e) => setDraft(e.target.value)} />
    : <TextField {...common} {...(type ? { type } : {})} {...(inputMode ? { inputMode } : {})} autoComplete="off"
      onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} />;
  return width !== undefined ? <span style={{ display: 'block', width, maxWidth: '100%' }}>{el}</span> : el;
}
function CommitNum({ value, onCommit, label, width = 120 }: { value: number; onCommit: (v: number) => void; label: string; width?: number }): React.JSX.Element {
  return <CommitText label={label} type="number" inputMode="numeric" width={width} value={Number.isFinite(value) ? String(value) : ''}
    onCommit={(v) => { if (v.trim() !== '') { onCommit(Number(v)); } }} />;
}

/* ───────── 模型配置 / 提示词（压缩与手动搜索共用） ───────── */

const CURRENT = '__current';
function ModelConfig({ api, title, note, hint }: { api: LlmApi; title?: string; note?: string; hint?: string }): React.JSX.Element {
  const C = React.useContext(CopyCtx);
  const s = api.get();
  const [name, setName] = React.useState('');
  const c = s.current;
  const t = title || C.model.section;
  return (
    <SettingSection title={t} aside={info(t, note || C.model.note)}>
      <Segmented label={t} options={[{ value: 'tavern', label: C.model.tavern }, { value: 'custom', label: C.model.custom }]} value={s.mode} onValueChange={(v) => api.mode(v as 'tavern' | 'custom')} />
      {s.mode === 'tavern' ? (
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Field label={C.model.pickLabel} hint={C.model.pickHint}>
            <Select options={[{ value: CURRENT, label: C.model.pickCurrent }, ...s.profiles.map((p) => ({ value: p.name, label: p.name + (p.model ? '（' + p.model + '）' : '') }))]}
              value={s.pick || CURRENT} onValueChange={(v) => api.pick(v === CURRENT ? '' : v)} />
          </Field>
          {!s.profiles.length ? <Note>{C.model.pickNone}</Note> : null}
          <Note>{C.model.pickProxyNote}</Note>
        </div>
      ) : c ? (
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Grid2>
            <Field label={C.model.cfgLabel}>
              <Select options={s.configs.map((x) => ({ value: x, label: x || C.model.noCfgName }))} value={c.name} onValueChange={(v) => api.selectConfig(v)} />
            </Field>
            <Field label={C.model.sourceLabel} hint={C.model.sourceHint}>
              <Select options={C.model.sources.map((x) => ({ value: x.v, label: x.n }))} value={c.source} onValueChange={(v) => api.input('source', v)} />
            </Field>
          </Grid2>
          <Field label={C.model.apiUrlLabel} hint={C.model.apiUrlHint}><CommitText label={C.model.apiUrlLabel} type="url" placeholder="https://…/v1" value={c.apiurl} onCommit={(v) => api.input('apiurl', v)} /></Field>
          <Field label={C.model.keyLabel} hint={C.model.keyHint}><CommitText label={C.model.keyLabel} type="password" value={c.key} onCommit={(v) => api.input('key', v)} /></Field>
          <Field label={C.model.modelLabel} hint={C.model.modelHint}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0 }}><CommitText label={C.model.modelLabel} value={c.model} onCommit={(v) => api.input('model', v)} /></span>
              <Button busy={s.fetching} disabled={s.fetching} onClick={() => swallow(api.fetchModels())}>{s.fetching ? C.model.fetching : C.model.fetchModels}</Button>
            </div>
          </Field>
          {s.models ? (
            <Field label={C.model.pickModelLabel}>
              <Select options={s.models.map((m) => ({ value: m, label: m }))} value={s.models.includes(c.model) ? c.model : ''} placeholder={C.model.fetchPick} onValueChange={(v) => api.input('model', v)} />
            </Field>
          ) : null}
          <Row>
            <span style={{ width: 160 }}><TextField size="sm" placeholder={C.model.namePh} aria-label={C.model.namePh} value={name} onChange={(e) => setName(e.target.value)} /></span>
            <Button size="sm" onClick={() => { api.saveConfig(name); if (name.trim()) { setName(''); } }}>{C.model.saveAs}</Button>
            <Button size="sm" variant="ghost" onClick={() => api.deleteConfig()}>{C.model.delBtn}</Button>
          </Row>
          <Note>{hint || C.model.customHint}</Note>
        </div>
      ) : null}
    </SettingSection>
  );
}

const ROLE_KEYS = ['system', 'user', 'assistant'] as const;
function PromptList({ api, list, title }: { api: LlmApi; list: 'head' | 'tail'; title: string }): React.JSX.Element {
  const C = React.useContext(CopyCtx);
  const roles = [{ value: 'system', label: C.prompts.roleSystem }, { value: 'user', label: C.prompts.roleUser }, { value: 'assistant', label: C.prompts.roleChar }];
  const items = api.get().prompts[list];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Row><strong>{title}</strong><Badge>{items.length} 条</Badge></Row>
      {items.map((e, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <Row>
            <span style={{ width: 120 }}><Select aria-label={title + ' 第 ' + (i + 1) + ' 条' + C.prompts.roleLabel} size="sm" options={roles} value={e.role} onValueChange={(v) => api.prompt(list, i, 'role', v)} /></span>
            <Button size="sm" variant="ghost" onClick={() => api.removePrompt(list, i)}>{C.prompts.removeEntry}</Button>
          </Row>
          <CommitText multiline rows={3} label={title + ' 第 ' + (i + 1) + ' 条内容'} value={e.content} onCommit={(v) => api.prompt(list, i, 'content', v)} />
        </div>
      ))}
      <div><Button size="sm" onClick={() => api.addPrompt(list)}>{C.prompts.addEntry}</Button></div>
    </div>
  );
}
function PromptEditor({ api, title, hint, taskLabel }: { api: LlmApi; title?: string; hint?: string; taskLabel?: string }): React.JSX.Element {
  const C = React.useContext(CopyCtx);
  const s = api.get();
  const [name, setName] = React.useState('');
  const roles = [{ value: 'system', label: C.prompts.roleSystem }, { value: 'user', label: C.prompts.roleUser }, { value: 'assistant', label: C.prompts.roleChar }];
  const task = taskLabel || C.prompts.task;
  return (
    <CollapseCard title={title || C.prompts.section} meta="高级">
      <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
        <Note>{hint || C.prompts.hint}</Note>
        <Field label={C.prompts.tplLabel} hint={C.prompts.tplHint}>
          <Select options={s.templates.map((x) => ({ value: x, label: x }))} value={s.template} onValueChange={(v) => api.switchTemplate(v)} />
        </Field>
        <Row>
          <span style={{ width: 160 }}><TextField size="sm" placeholder={C.prompts.tplNamePh} aria-label={C.prompts.tplNamePh} value={name} onChange={(e) => setName(e.target.value)} /></span>
          <Button size="sm" onClick={() => { api.saveTemplate(name); if (name.trim()) { setName(''); } }}>{C.prompts.tplSaveAs}</Button>
          <Button size="sm" variant="ghost" onClick={() => api.deleteTemplate()}>{C.prompts.tplDel}</Button>
        </Row>
        <PromptList api={api} list="head" title={C.prompts.head} />
        <div style={{ display: 'grid', gap: 6 }}>
          <Row>
            <strong>{task}</strong>
            <span style={{ width: 120 }}><Select aria-label={task + C.prompts.roleLabel} size="sm" options={roles} value={ROLE_KEYS.includes(s.prompts.taskRole) ? s.prompts.taskRole : 'system'} onValueChange={(v) => api.prompt('task', 0, 'role', v)} /></span>
            <Button size="sm" variant="ghost" onClick={() => api.resetTask()}>{C.prompts.reset}</Button>
          </Row>
          <CommitText multiline rows={5} label={task} value={s.prompts.task} onCommit={(v) => api.prompt('task', 0, 'content', v)} />
        </div>
        <PromptList api={api} list="tail" title={C.prompts.tail} />
      </div>
    </CollapseCard>
  );
}

/* ───────── 压缩 ───────── */

function Compress({ bridge }: { bridge: ToolboxBridge }): React.JSX.Element {
  const C = React.useContext(CopyCtx);
  const api: CompressApi = bridge.compress;
  const s: CompressState = api.get();
  const [armed, setArmed] = React.useState(false);
  const [pin, setPin] = React.useState('');
  React.useEffect(() => { if (!armed) { return; } const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  React.useEffect(() => { swallow(api.refresh('open')); }, [api]);
  const roll = s.roll;
  const run = s.pipeline;
  return (
    <Stack>
      <div style={{ display: 'grid', gap: 6 }}>
        <Row>
          <Button variant="primary" busy={run.running} onClick={() => swallow(api.run())}>{run.running ? C.grand.running : C.grand.runNow}</Button>
          <Button onClick={() => swallow(api.unhideAll())}>{C.grand.unhideAll}</Button>
          <Button variant={armed ? 'danger' : 'ghost'} onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); swallow(api.clearData()); }}>{armed ? C.grand.clearArmed : C.grand.clearData}</Button>
        </Row>
        {run.running ? (
          <div data-grand-progress="" style={{ display: 'grid', gap: 6 }} aria-live="polite">
            <Progress label="大总结进度" value={run.total ? (run.done / run.total) * 100 : null} />
            <Note>{run.total ? '已完成 ' + run.done + ' / ' + run.total + ' 块' : '正在准备…'}</Note>
          </div>
        ) : <Note>{C.grand.runHint}</Note>}
        {s.lastError ? <Note tone="danger">{s.lastError}</Note> : null}
      </div>

      <SettingSection title={C.mode.section} badge={<Badge>可同时开</Badge>}>
        <ChoiceGrid min={220}>
          <ChoiceCard multi selected={roll.ok && roll.enabled} disabled={!roll.ok} onSelect={() => swallow(api.setRoll(!(roll.ok && roll.enabled)))} title={C.mode.rollTitle}
            meta={roll.ok ? (roll.enabled ? fill(C.mode.rollDepthLine, { n: roll.depth }) : C.mode.off) : roll.error}>{C.mode.rollNote}</ChoiceCard>
          <ChoiceCard multi selected={s.grandOn} onSelect={() => swallow(api.setGrand(!s.grandOn))} title={C.mode.grandTitle} meta={s.grandOn ? C.mode.on : C.mode.off}>{C.mode.grandNote}</ChoiceCard>
        </ChoiceGrid>
      </SettingSection>

      {roll.ok && roll.enabled ? (
        <SettingSection title={C.roll.section}>
          <SettingRow label={C.roll.depthLabel} description={C.roll.depthHint} control={<CommitNum label={C.roll.depthLabel} value={roll.depth} onCommit={(v) => swallow(api.setNumber('depth', v))} />} />
        </SettingSection>
      ) : null}
      {s.grandOn ? (
        <SettingSection title={C.grand.section} {...(s.measured ? { badge: <Badge tone="info">{'上次实测 ' + s.measured.toLocaleString() + ' token'}</Badge> } : {})}>
          <SettingRow label={C.grand.thresholdLabel} description={C.grand.thresholdHint} control={<CommitNum label={C.grand.thresholdLabel} value={s.threshold} width={140} onCommit={(v) => swallow(api.setNumber('threshold', v))} />} />
          <SettingRow label={C.grand.keepLabel} description={C.grand.keepHint} control={<CommitNum label={C.grand.keepLabel} value={s.keep} onCommit={(v) => swallow(api.setNumber('keep', v))} />} />
          <SettingRow label={C.grand.chunkLabel} description={C.grand.chunkHint} control={<CommitNum label={C.grand.chunkLabel} value={s.chunk} onCommit={(v) => swallow(api.setNumber('chunk', v))} />} />
        </SettingSection>
      ) : null}

      <ModelConfig api={bridge.llm} />

      <SettingSection title={C.pins.section} badge={<Badge>{s.pins.length} 楼</Badge>} aside={info(C.pins.section, C.pins.note)}>
        {s.pins.length ? (
          <Row>{s.pins.map((n) => <Button key={n} size="sm" title={C.pins.chipTitle} aria-label={C.pins.remove + ' #' + n} onClick={() => swallow(api.removePin(n))}>#{n} ✕</Button>)}</Row>
        ) : <Note>{C.pins.empty}</Note>}
        <Row>
          <span style={{ width: 120 }}><TextField size="sm" type="number" inputMode="numeric" placeholder={C.pins.ph} aria-label={C.pins.ph} value={pin} onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { swallow(api.addPin(pin)); setPin(''); } }} /></span>
          <Button size="sm" onClick={() => { swallow(api.addPin(pin)); setPin(''); }}>{C.pins.add}</Button>
        </Row>
      </SettingSection>

      <SettingSection title={C.blocks.section} badge={<Badge>{s.blocks.length} 块</Badge>} aside={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant="ghost" title={C.blocks.refreshTip} onClick={() => swallow(api.refresh('手动刷新'))}>{C.blocks.refresh}</Button>
        {info(C.blocks.section, fill(C.blocks.note, { lb: s.lorebook || C.blocks.lbNone }))}</span>}>
        {s.error ? <><Note tone="danger">{fill(C.blocks.errHint, { err: s.error })}</Note><Note>{C.blocks.errFix}</Note></> : null}
        {s.notice.map((n, i) => <Note key={i} tone="warning">{n}</Note>)}
        {s.orphans ? <div><Button size="sm" onClick={() => swallow(api.repairOrphans())}>{C.blocks.orphanBtn}</Button></div> : null}
        {s.pending.length ? <Row>{s.pending.map((p, i) => <Badge key={i} tone="warning">{C.blocks.pendingTag + ' · ' + p.from + '–' + p.to + ' 楼'}</Badge>)}</Row> : null}
        {s.blocks.map((b, i) => (
          <CollapseCard key={i + ':' + b.from} title={C.blocks.blockTag + ' #' + (i + 1) + ' · ' + b.from + '–' + b.to + ' 楼'}
            meta={(b.depth !== null ? C.blocks.depthTag + ' ' + b.depth : '') + (b.suspect ? ' · ⚠ ' + C.blocks.suspectTag : '')}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{b.text}</p>
          </CollapseCard>
        ))}
        {!s.blocks.length && !s.pending.length && !s.error ? <Note>{C.blocks.empty}</Note> : null}
      </SettingSection>

      <PromptEditor api={bridge.llm} />

      <SettingSection title={C.entry.section} {...(s.entry.ok ? { badge: <Badge tone={s.entry.enabled ? 'success' : 'warning'}>{s.entry.enabled ? '已开启' : '已关闭'}</Badge> } : {})}>
        {s.entry.ok ? (
          <SettingRow label={s.entry.name} control={<Button size="sm" onClick={() => swallow(api.setEntry(!(s.entry.ok && s.entry.enabled)))}>{s.entry.enabled ? C.entry.turnOff : C.entry.turnOn}</Button>} />
        ) : <Note tone="warning">{s.entry.error}</Note>}
        <Note>{C.entry.note}</Note>
      </SettingSection>
    </Stack>
  );
}

/* ───────── 网络搜索 ───────── */

const LIMIT_FIELDS = [
  { key: 'maxQueries', label: '查询数上限', min: 1, max: 10 },
  { key: 'maxSources', label: '来源数上限', min: 1, max: 20 },
  { key: 'maxFacts', label: '详细资料数上限', min: 1, max: 60 },
  { key: 'maxTokens', label: '保存 token 预算', min: 100, max: 16000 }
];
function Limits({ api, manual, title }: { api: SearchApi; manual: boolean; title: string }): React.JSX.Element {
  const live = manual ? api.get().manualLimits : api.get().limits;
  const [draft, setDraft] = React.useState<SearchLimits>(live);
  const key = JSON.stringify(live);
  React.useEffect(() => { setDraft(JSON.parse(key) as SearchLimits); }, [key]);
  return (
    <SettingSection title={title} aside={info(title, '均为每次搜索的上限，实际结果可以更少。token预算只限制最终保存的资料，不含搜索模型读取上下文的用量。模型自带搜索的实际查询次数由模型控制，保存时仍检查资料、来源和长度。')}>
      {LIMIT_FIELDS.map((f) => (
        <SettingRow key={f.key} label={f.label} description={f.min + '–' + f.max}
          control={<span style={{ display: 'block', width: 240, maxWidth: '100%' }}><Slider aria-label={(manual ? '手动搜索' : '自动搜索') + f.label} value={draft[f.key] ?? f.min} min={f.min} max={f.max}
            step={f.max >= 1000 ? 100 : 1} onValueChange={(n) => setDraft({ ...draft, [f.key]: n })} onValueCommit={(n) => { setDraft(api.limits(manual, { [f.key]: n })); }} /></span>} />
      ))}
    </SettingSection>
  );
}

function Search({ bridge, openManual }: { bridge: ToolboxBridge; openManual: () => void }): React.JSX.Element {
  const api = bridge.search;
  const [key, setKey] = React.useState('');
  const [busyKey, setBusyKey] = React.useState(false);
  React.useEffect(() => { if (api) { swallow(api.refreshSecrets()); } }, [api]);
  if (!api) { return <Missing what="网络搜索（🧰 工具箱脚本里的搜索服务）" />; }
  const s = api.get();
  const p = s.providers.find((x) => x.id === s.provider) || s.providers[0];
  const needKey = !!(p && (p.secret || p.localKey));
  const probe = s.probe;
  return (
    <Stack>
      {s.enabled && s.mode === 'service' ? (
        <Row>
          <Button variant="primary" icon={React.createElement(ICONS['search']!, { width: 16, height: 16 })} disabled={s.running && !s.manualRunning} onClick={openManual}>{s.manualRunning ? '手动搜索（进行中）' : '手动搜索'}</Button>
          <Note>{s.message}</Note>
        </Row>
      ) : null}
      <SettingSection title="搜索能力">
        <SettingRow label="开启搜索能力" control={<Switch checked={s.enabled} onCheckedChange={(v) => api.configure({ enabled: v })} aria-label="开启搜索能力" />} />
        {s.enabled ? (
          <SettingRow label="搜索来源" description={s.mode === 'native' ? '由剧情模型按需搜索，资料与剧情保存在同一条回复中。' : '自动搜索会额外调用搜索模型判断需求；也可单独查询资料。'}
            control={<Segmented label="搜索来源" size="sm" options={[{ value: 'native', label: '模型自带' }, { value: 'service', label: '搜索服务' }]} value={s.mode} onValueChange={(v) => api.configure({ mode: v })} />} />
        ) : <Note>{s.message}</Note>}
      </SettingSection>
      {s.enabled && s.mode === 'native' ? (
        <>
          <Limits api={api} manual={false} title="自动搜索限额" />
          <SettingSection title="模型联网能力" {...(probe && probe.testedAt && !probe.running ? { badge: <Badge tone={probe.state === 'verified' ? 'success' : probe.state === 'failed' ? 'danger' : 'warning'}>{probe.state === 'verified' ? '已验证' : probe.state === 'failed' ? '失败' : '无法验证'}</Badge> } : {})}>
            <Note>使用当前剧情连接提供的搜索能力。Gemini 原生搜索与反截断正文工具不能同时使用，本轮会优先搜索。</Note>
            <Note>测试会实际调用当前连接，可能产生模型与搜索费用；不携带剧情、不写入聊天，可随时中断。</Note>
            <Row>
              <Button size="sm" busy={!!probe?.running} disabled={!!probe?.running} onClick={() => swallow(api.probe())}>{probe && probe.phase !== 'idle' ? '重新测试' : '测试真实搜索'}</Button>
              {probe?.running ? <Button size="sm" variant="ghost" onClick={() => api.cancelProbe()}>中断测试</Button> : null}
            </Row>
            {probe ? (
              <div data-search-native-result="" data-state={probe.phase} style={{ display: 'grid', gap: 6 }} aria-live="polite">
                {probe.running ? <Progress label="联网能力测试进度" value={null} /> : null}
                <Note>{probe.message}</Note>
                {!probe.running && probe.testedAt && probe.phase !== 'cancelled' ? <Note>{'搜索记录 ' + probe.queries + ' 次 · 返回来源 ' + probe.sources.length + ' 个。本结果仅适用于当前连接；搜索执行证据不等于事实已逐条核实。'}</Note> : null}
                {!probe.running && probe.sources.length ? <Row>{probe.sources.slice(0, 3).map((x) => <a key={x.url} {...{ 'data-k': 'button', 'data-variant': 'ghost', 'data-size': 'sm' }} href={x.url} target="_blank" rel="noopener"><span data-k-part="label">{x.title + ' ↗'}</span></a>)}</Row> : null}
              </div>
            ) : null}
          </SettingSection>
        </>
      ) : null}
      {s.enabled && s.mode === 'service' && p ? (
        <>
          <SettingSection title="搜索服务连接" badge={needKey ? <Badge tone={s.hasSecret ? 'success' : 'warning'}>{s.hasSecret ? '已保存密钥' : '还没保存密钥'}</Badge> : <Badge tone="success">免密钥</Badge>}>
            <Field label="服务"><Select options={s.providers.map((x) => ({ value: x.id, label: x.label }))} value={s.provider} onValueChange={(v) => { setKey(''); api.configure({ provider: v }); }} /></Field>
            <Note>{p.note}</Note>
            <Row>
              {p.url ? <a {...{ 'data-k': 'button', 'data-variant': 'ghost', 'data-size': 'sm' }} href={p.url} target="_blank" rel="noopener"><span data-k-part="label">官方说明与额度 ↗</span></a> : null}
              {p.keyUrl ? <a {...{ 'data-k': 'button', 'data-variant': 'ghost', 'data-size': 'sm' }} href={p.keyUrl} target="_blank" rel="noopener"><span data-k-part="label">获取 API Key ↗</span></a> : null}
            </Row>
            {p.endpoint ? (
              <Field label="服务地址" hint="地址由运行酒馆的服务器访问；127.0.0.1 指酒馆服务器。切换服务会分别保留两种服务的地址。">
                <CommitText label="服务地址" type="url" placeholder="https://…" value={s.endpoints[p.endpointKey as 'searxng' | 'koboldcpp'] || ''} onCommit={(v) => api.configure({ endpoints: { [p.endpointKey]: v } })} />
              </Field>
            ) : null}
            {p.id === 'wikipedia' ? (
              <Field label="百科语言"><Select options={[{ value: 'zh', label: '中文' }, { value: 'en', label: '英文' }, { value: 'ja', label: '日文' }]} value={s.wikiLanguage} onValueChange={(v) => api.configure({ wikiLanguage: v })} /></Field>
            ) : null}
            {needKey ? (
              <Field label="API Key" {...(p.localKey ? { hint: '当前设备直接连接官方接口，无需额外插件。密钥仅保存在本机浏览器，按酒馆用户分别保存；不随预设导出，换设备需重填。' } : {})}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 180px', minWidth: 0 }}><TextField type="password" autoComplete="off" aria-label="API Key" placeholder="填写或更新搜索服务密钥" value={key} onChange={(e) => setKey(e.target.value)} /></span>
                  <Button busy={busyKey} disabled={busyKey} onClick={() => { setBusyKey(true); api.saveKey(key).then((ok) => { setBusyKey(false); if (ok) { setKey(''); } }, () => setBusyKey(false)); }}>保存密钥</Button>
                  {p.localKey && s.hasSecret ? <Button variant="ghost" onClick={() => swallow(api.clearKey())}>清除本机密钥</Button> : null}
                </div>
              </Field>
            ) : <Note>此来源无需搜索API密钥。</Note>}
            <Note>{s.message}</Note>
            <Note>免费仅指搜索服务；搜索模型与剧情模型仍按所选连接计费。额度信息核对于2026-10-19，以服务商当前政策为准。</Note>
          </SettingSection>
          <Limits api={api} manual={false} title="自动搜索限额" />
          {bridge.manual ? <ManualSettings manual={bridge.manual} search={api} /> : null}
        </>
      ) : null}
      {s.enabled ? (
        <CollapseCard title="网络搜索头部任务" meta="高级">
          <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
            <Note>与预设“🌐 网络搜索”的开关和完整内容双向同步；手动助手的模型与提示词在手动搜索设置中单独配置。</Note>
            <Field label="头部任务内容"><CommitText multiline rows={6} label="搜索系统提示词" value={s.system} onCommit={(v) => api.configure({ system: v })} /></Field>
            <div><Button size="sm" variant="ghost" onClick={() => api.configure({ system: s.defaultSystem })}>恢复默认提示词</Button></div>
          </div>
        </CollapseCard>
      ) : null}
    </Stack>
  );
}

function ManualSettings({ manual, search }: { manual: ManualApi; search: SearchApi }): React.JSX.Element {
  const s = search.get();
  return (
    <CollapseCard title="手动搜索设置" meta="高级">
      <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
        <Note>以下设置仅用于手动搜索。自动搜索仍跟随剧情连接；这些修改不会改变压缩设置。</Note>
        <SettingRow label="显示消息栏上方按钮" description="在按钮栏放一颗「🔎 手动搜索」" control={<Switch checked={s.shortcut} onCheckedChange={(v) => manual.setShortcut(v)} aria-label="显示消息栏上方手动搜索按钮" />} />
        <Limits api={search} manual title="手动搜索限额" />
        <ModelConfig api={manual.llm} title="手动搜索模型" note="此模型仅用于手动搜索。自动搜索跟随剧情连接，压缩模型独立保存。" hint="自定义接口请填写完整地址、密钥和模型后再搜索。" />
        <PromptEditor api={manual.llm} title="手动搜索提示词" taskLabel="任务正文（结合本次查询要求）" hint="仅手动查询使用。头部、任务正文和尾部的编辑方式与摘要提示词一致；不修改网络搜索头部任务。" />
        <Note>完成后只新增资料楼层。查询数、来源数、详细资料数和保存预算以上方手动搜索限额为准。</Note>
      </div>
    </CollapseCard>
  );
}

/* ───────── 手动搜索窗口（_search-manual-ui.js 的文案与四个步骤） ───────── */

const MS_STEPS = [
  { id: 'plan', label: '理解需求', hint: '识别世界与查询范围' },
  { id: 'search', label: '查询外部资料', hint: '按主题查询真实来源' },
  { id: 'extract', label: '整理详细资料', hint: '核对事实、细节与引用' },
  { id: 'save', label: '保存资料', hint: '只新增一个资料楼层' }
];
export function ManualSearchDialog({ manual, onClose }: { manual: ManualApi; onClose: () => void }): React.JSX.Element {
  const [ask, setAsk] = React.useState(() => manual.lastTopic());
  const [prog, setProg] = React.useState<SearchProgress | null>(() => (manual.status().manualRunning ? { phase: 'plan', message: '手动搜索进行中…', current: 0, total: 0, running: true } : null));
  const last = React.useRef('plan');
  React.useEffect(() => {
    if (!prog) { return; }
    return manual.subscribeProgress((p) => { if (p.phase !== 'idle') { setProg(p); } });
  }, [manual, !!prog]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = MS_STEPS.map((x) => x.id);
  if (prog && order.includes(prog.phase)) { last.current = prog.phase; }
  const failed = !!prog && (prog.phase === 'error' || prog.phase === 'cancelled');
  const done = prog?.phase === 'done';
  const running = !!prog?.running;
  const title = !prog ? '手动搜索' : done ? '手动搜索已完成' : prog.phase === 'error' ? '搜索未完成' : prog.phase === 'cancelled' ? '搜索已中断' : '手动搜索进行中';
  const close = (): void => { if (running) { manual.cancel('手动搜索已中断'); } onClose(); };
  const start = (): void => {
    const t = ask.trim();
    if (!t) { return; }
    manual.lastTopic(t);
    setProg({ phase: 'plan', message: '正在准备手动搜索…', current: 0, total: 0, running: true });
    manual.search(t).catch((e: { searchCancelled?: boolean; message?: string }) => { if (!e || !e.searchCancelled) { setProg({ phase: 'error', message: (e && e.message) || String(e), current: 0, total: 0, running: false }); } });
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) { close(); } }} title={title} size="md"
      footer={!prog
        ? <><Button variant="ghost" onClick={close}>取消</Button><Button variant="primary" disabled={!ask.trim()} onClick={start}>确认并搜索</Button></>
        : running ? <Button variant="danger" onClick={close}>中断搜索</Button>
          : <Button variant="primary" onClick={onClose}>关闭</Button>}>
      {!prog ? (
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Field label="这次想查什么？" hint="会参考角色卡、世界书和经过正则处理的历史；不带剧情预设条目。">
            <TextArea rows={4} placeholder="例如：整理当前年代的地理、居民、文化与规则，排除未来剧情。" value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="本次搜索要求" />
          </Field>
          <Steps label="搜索步骤" items={MS_STEPS} current="" />
          <Note>可以随时中断；未完成的资料不会写入聊天。</Note>
        </div>
      ) : (
        <div data-manual-search-phase={prog.phase} style={{ display: 'grid', gap: 'var(--k-gap-group)' }} aria-live="polite">
          <p>{prog.message}</p>
          <Steps label="搜索步骤" items={MS_STEPS.map((x) => (x.id === 'search' && prog.phase === 'search' && prog.total ? { ...x, hint: '正在处理第 ' + prog.current + ' / ' + prog.total + ' 个查询' } : x))}
            current={done ? 'save' : last.current} failed={failed} />
          {running ? <Progress label="手动搜索进度" value={prog.phase === 'search' && prog.total ? (prog.current / prog.total) * 100 : null} /> : null}
          <Note>{done ? '完成后只新增资料楼层。' : failed ? '未完成的资料不会写入聊天。' : '可以随时中断；未完成的资料不会写入聊天。'}</Note>
        </div>
      )}
    </Dialog>
  );
}

/* ───────── 其他功能 ───────── */

function Other({ api, notify }: { api: OtherApi | undefined; notify: Notify }): React.JSX.Element {
  useLive(api);
  const [scan, setScan] = React.useState<Extract<ReturnType<OtherApi['scanTag']>, { token: number }> | null>(null);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [scope, setScope] = React.useState('all');
  const [exp, setExp] = React.useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: '', ok: true });
  if (!api) { return <Missing what="「🌟 预设设置」脚本（标签处理、常驻附加指令、导出都由它管）" />; }
  const s = api.get();
  const T = api.copy.tag, G = api.copy.god, E = api.copy.exp;
  const off = s.tag.mode === 'off';
  return (
    <Stack>
      <SettingSection title={T['title']!} badge={<Badge>{(api.copy.modes.find((m) => m.id === s.tag.mode)?.label || '') + (s.tag.all ? ' · ' + T['allChip'] : '')}</Badge>} aside={info(T['title']!, T['note']!)}>
        <SettingRow label={T['modeLabel']!} description={T['modeHint']}
          control={<Segmented label={T['modeLabel']!} size="sm" options={api.copy.modes.map((m) => ({ value: m.id, label: m.label }))} value={s.tag.mode} onValueChange={(v) => api.setTagMode(v)} />} />
        <SettingRow label={T['allLabel']!} description={T['allHint']} control={<Switch checked={s.tag.all} onCheckedChange={(v) => api.setTagAll(v)} aria-label={T['allLabel']!} disabled={off} />} />
        <Field label={T['customLabel']!} hint={s.tag.all ? T['allChip'] + '：' + T['allHint'] : T['customHint']} disabled={off || s.tag.all}>
          <CommitText label={T['customLabel']!} value={s.tag.custom} onCommit={(v) => api.setTagCustom(v)} />
        </Field>
        <SettingRow label={T['manualLabel']!} description={T['manualHint'] + ' · ' + T['statLabel'] + '：' + s.tag.stat}
          control={<Button size="sm" disabled={off} onClick={() => { const r = api.scanTag(); if (!r.ok || r.nothing) { notify(r.message); return; } setScan(r); }}>{T['manualBtn']}</Button>} />
      </SettingSection>
      <Dialog open={!!scan} onOpenChange={(v) => { if (!v) { setScan(null); } }} title={T['manualBtn'] + (scan ? '（第 ' + scan.floor + ' 楼）' : '')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setScan(null)}>{T['confirmCancel']}</Button><Button variant="primary" onClick={() => { const tk = scan!.token; setScan(null); swallow(api.applyTag(tk)); }}>{T['confirmOk']}</Button></>}>
        {scan ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p>{T['scanLead']}</p>
            {scan.groups.map((g) => (
              <div key={g.lead}><strong>{g.lead}</strong>
                <ul style={{ margin: '4px 0 0 18px' }}>{g.rows.map((r, i) => <li key={i}><code>{r.text}</code>{r.label ? '　' + r.label : ''}</li>)}</ul>
              </div>
            ))}
            {scan.stray ? <Note>{(T['strayNote'] || '').replace('%n%', String(scan.stray))}</Note> : null}
            <Note>{T['confirmNote']}</Note>
          </div>
        ) : null}
      </Dialog>

      <SettingSection title={G['title']!} badge={<Badge tone={s.god.on ? 'success' : 'neutral'}>{s.god.on ? G['modeOn'] : G['modeOff']}</Badge>} aside={info(G['title']!, G['note']!)}>
        <SettingRow label={G['switchLabel']!} description={s.god.on ? G['modeOn'] : G['modeOff']}
          control={<Switch checked={s.god.on} aria-label={G['title']! + G['switchLabel']} onCheckedChange={(v) => { api.setGod(v); }} />} />
        <Field label={G['textLabel']!} hint={G['textHint']}>
          <CommitText multiline rows={4} label={G['textLabel']!} value={s.god.text} readOnly={s.god.on} onCommit={(v) => api.setGodText(v)} />
        </Field>
      </SettingSection>

      <SettingSection title={E['title']!} aside={info(E['title']!, E['note'] + '\n' + E['goodPath'])}>
        <SettingRow label={E['rangeLabel']!} description="留空表示全部" control={
          <Row>
            <span style={{ width: 90 }}><TextField inputMode="numeric" aria-label={E['rangeLabel'] + '（起始）'} placeholder={E['rangeFromHint']} value={from} onChange={(e) => setFrom(e.target.value)} /></span>
            <span aria-hidden="true">–</span>
            <span style={{ width: 90 }}><TextField inputMode="numeric" aria-label={E['rangeLabel'] + '（结束）'} placeholder={E['rangeToHint']} value={to} onChange={(e) => setTo(e.target.value)} /></span>
          </Row>} />
        <SettingRow label={E['scopeLabel']!} description={scope === 'ai' ? E['scopeAiHint'] : E['scopeAllHint']}
          control={<Segmented label={E['scopeLabel']!} size="sm" options={[{ value: 'all', label: E['scopeAll']! }, { value: 'ai', label: E['scopeAi']! }]} value={scope} onValueChange={setScope} />} />
        <Row>
          <Button variant="primary" busy={exp.busy} disabled={exp.busy} onClick={() => {
            setExp({ busy: true, text: '', ok: true });
            api.exportChat(from, to, scope === 'ai', (i, n) => setExp({ busy: true, text: (E['working'] || '正在处理') + ' ' + i + '/' + n, ok: true }))
              .then((r) => setExp({ busy: false, text: r.text, ok: r.ok }), (e: unknown) => setExp({ busy: false, text: String(e), ok: false }));
          }}>{E['btn']}</Button>
        </Row>
        {exp.text ? <Note {...(exp.ok ? {} : { tone: 'danger' as const })}>{exp.text}</Note> : null}
      </SettingSection>
    </Stack>
  );
}

/* ───────── 更新 ───────── */

function Update({ api }: { api: UpdateApi | undefined }): React.JSX.Element {
  useLive(api);
  const [result, setResult] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [pick, setPick] = React.useState('');
  const [warn, setWarn] = React.useState(false);
  const [inh, setInh] = React.useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: '', ok: true });
  const [list, setList] = React.useState<{ names: string[]; current: string } | null>(null);
  if (!api) { return <Missing what="「🌟 预设设置」脚本（版本信息与继承都由它管）" />; }
  const s = api.get();
  const I = api.copy;
  const names = list ? list.names : [];
  const chosen = names.includes(pick) ? pick : names[0] || '';
  const startInherit = (name: string): void => {
    setWarn(false);
    setInh({ busy: true, text: (I['working'] || '') + '（' + name + '）', ok: true });
    api.inherit(name).then((r) => setInh({ busy: false, text: r.text, ok: r.ok }));
  };
  return (
    <Stack>
      <SettingSection title="版本信息">
        {s.rows.map(([k, v]) => <SettingRow key={k} label={k} control={<span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>} />)}
      </SettingSection>
      <SettingSection title="检查更新">
        <SettingRow label="远程仓库" control={<code style={{ fontSize: 'var(--k-fs-sm)', overflowWrap: 'anywhere' }}>{s.repo}</code>} />
        <SettingRow label="上次检查" control={<span style={{ color: 'var(--k-on-muted)' }}>{s.lastChecked || '本次会话还没查过'}</span>} />
        <Row>
          <Button busy={checking || s.busy} disabled={checking || s.busy || !s.running} onClick={() => { setChecking(true); setResult('正在检查…'); api.check().then((t) => { setChecking(false); setResult(t); }); }}>检查更新</Button>
          {result ? <span data-update-result="" style={{ color: 'var(--k-on-muted)' }}>{result}</span> : null}
        </Row>
        <Note>发现新版时会弹窗询问；更新会先备份当前预设，再把你改过的设置合并进新版，两边都改过的内容逐条问你。</Note>
      </SettingSection>

      <SettingSection title={I['title']!} aside={info(I['title']!, I['note']!)}>
        <SettingRow label={I['sourceLabel']!} control={<span style={{ color: 'var(--k-on-muted)' }}>{s.inheritFrom ? s.inheritFrom + (s.inheritAt ? '（' + s.inheritAt + '）' : '') : I['sourceNone']}</span>} />
        {!s.running ? <Note tone="warning">{I['degrade']}</Note> : list === null ? (
          <div><Button onClick={() => setList(api.presets())}>选择旧预设</Button></div>
        ) : !names.length ? <Note>{I['noOthers']}</Note> : (
          <>
            <Field label="旧预设" hint={I['pickHint'] + (list.current ? '（当前这一份是「' + list.current + '」，不列在下面）' : '')}>
              <Select options={names.map((n) => ({ value: n, label: n + (api.isKami(n) ? '' : '（非卡密）') }))} value={chosen} onValueChange={(v) => { setPick(v); setWarn(false); }} />
            </Field>
            {warn ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <Note tone="warning">{I['notKamiWarn']}</Note>
                <Row><Button variant="danger" onClick={() => startInherit(chosen)}>仍然继承</Button><Button variant="ghost" onClick={() => setWarn(false)}>换一个</Button></Row>
              </div>
            ) : (
              <Row>
                <Button variant="primary" busy={inh.busy} disabled={inh.busy || !chosen} onClick={() => { if (!api.isKami(chosen)) { setWarn(true); return; } startInherit(chosen); }}>继承</Button>
                <Button variant="ghost" disabled={inh.busy} onClick={() => { setList(null); setInh({ busy: false, text: '', ok: true }); }}>不继承了</Button>
              </Row>
            )}
          </>
        )}
        {inh.text ? <Note {...(inh.ok ? {} : { tone: 'danger' as const })}>{inh.text}</Note> : null}
        <Note>{I['sourceNote']}</Note>
      </SettingSection>
    </Stack>
  );
}

/* ───────── 更新流程的三个窗口（70 号经 KamiUpdateUi 调过来） ───────── */

export function UpdateAskDialog({ remote, local, onAnswer }: { remote: { name: string; version: string; notes: string }; local: string; onAnswer: (yes: boolean) => void }): React.JSX.Element {
  const notes = remote.notes.trim();
  return (
    <Dialog open onOpenChange={(v) => { if (!v) { onAnswer(false); } }} title="发现新版本" size="sm"
      footer={<><Button variant="ghost" onClick={() => onAnswer(false)}>暂不更新</Button><Button variant="primary" onClick={() => onAnswer(true)}>立即更新</Button></>}>
      <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
        <p>检测到新版本预设 <strong>{remote.name || remote.version}</strong>{local ? '（当前 ' + local + '）' : ''}</p>
        <div data-update-notes="" style={{ maxHeight: '36vh', overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--k-line)', borderRadius: 'var(--k-r-md)', padding: '8px 10px' }}>
          {notes ? notes.split(/(\*\*[^*\n]+\*\*)/).map((part, i) => (/^\*\*[^*\n]+\*\*$/.test(part) ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>)) : <span style={{ color: 'var(--k-on-muted)' }}>（这一版没有写更新说明）</span>}
        </div>
        <Note>点「立即更新」会自动下载并写入你的预设文件夹；写入后还需要你手动切换预设。</Note>
      </div>
    </Dialog>
  );
}

const UPDATE_STAGES = [
  { id: 'check', label: '检查版本' }, { id: 'download', label: '下载新版' }, { id: 'verify', label: '校验文件' },
  { id: 'merge', label: '合并你的改动' }, { id: 'write', label: '写入预设' }
];
export function UpdateProgressDialog({ view: v, stages = UPDATE_STAGES, onRetry, onClose }: { view: UpdateView; stages?: Array<{ id: string; label: string }>; onRetry: () => void; onClose: () => void }): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(o) => { if (!o && v.canClose) { onClose(); } }} title={v.title} size="sm"
      footer={<>{v.canRetry ? <Button variant="primary" onClick={onRetry}>重试</Button> : null}
        <Button variant={v.canRetry ? 'ghost' : 'primary'} disabled={!v.canClose} onClick={onClose}>关闭</Button></>}>
      <div data-update-status={v.status} data-update-stage={v.stage} style={{ display: 'grid', gap: 'var(--k-gap-group)' }} aria-live="polite">
        <Steps label="更新阶段" items={stages} current={v.stage} failed={v.status === 'failed'} />
        {v.stage === 'download' || v.status === 'failed' ? <Progress label="下载进度" value={v.percent} tone={v.status === 'failed' ? 'danger' : 'accent'} /> : null}
        {v.bytesText ? <Note>{v.bytesText}</Note> : null}
        {v.detail ? <p style={{ color: v.status === 'failed' ? 'var(--k-danger)' : 'var(--k-on-muted)' }}>{v.detail}</p> : null}
        {v.retryText ? <Badge>{v.retryText}</Badge> : null}
      </div>
    </Dialog>
  );
}

const KIND: Record<string, string> = { prompt: '两边都改过', delete: '删除与新版改动撞了', order: '排列两边都调过', regex: '正则两边都改过' };
export function MergeReviewDialog({ plan, onDone }: { plan: MergePlan; onDone: (plan: MergePlan | null) => void }): React.JSX.Element {
  const inh = !!plan.inherit;
  const W = inh
    ? { title: '合并到当前预设', mine: '保留旧预设', next: '用现在这份', allMine: '全部保留旧预设', allNext: '全部用现在这份', tail: '没有列进来的（开关、采样参数、脚本设置、正则开关、新增/删除的条目）一律以你挑的那份旧预设为准，不会被现在这份覆盖。' }
    : { title: '合并到新版本', mine: '保留我的', next: '用新版', allMine: '全部保留我的', allNext: '全部用新版', tail: '没有列进来的（开关、采样参数、脚本设置、正则开关、新增/删除的条目）一律以你现在的预设为准，不会被新版覆盖。' };
  const [pick, setPick] = React.useState<Record<string, 'mine' | 'next'>>(() => Object.fromEntries(plan.conflicts.map((c) => [c.key, c.choice === 'next' ? 'next' : 'mine'])));
  const finish = (): void => { for (const c of plan.conflicts) { c.choice = pick[c.key] || 'mine'; } onDone(plan); };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) { onDone(null); } }} title={W.title + '：' + plan.conflicts.length + ' 处要你裁决'} size="lg"
      footer={<>
        <Button variant="ghost" onClick={() => setPick(Object.fromEntries(plan.conflicts.map((c) => [c.key, 'mine'])))}>{W.allMine}</Button>
        <Button variant="ghost" onClick={() => setPick(Object.fromEntries(plan.conflicts.map((c) => [c.key, 'next'])))}>{W.allNext}</Button>
        <Button variant="primary" onClick={finish}>应用并完成</Button>
      </>}>
      <div data-merge-review="" style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
        <Note>{'每一项二选一：' + W.mine + ' / ' + W.next + '（默认' + W.mine + '）。' + W.tail + (plan.degraded ? '（你的旧版认不出来，所有差异都当成「两边都改过」处理，宁可少更新也不动你的东西。）' : '') + ' 关掉窗口 = 这次不合并，什么都不会写。'}</Note>
        {plan.conflicts.map((c) => (
          <SettingSection key={c.key} title={c.name || c.id || c.key} badge={<Badge>{KIND[c.kind || ''] || '两边都改过'}</Badge>}>
            {c.fields && c.fields.length ? <Note>{'改了：' + c.fields.join('、')}</Note> : null}
            <Segmented label={c.name || c.key} options={[{ value: 'mine', label: W.mine }, { value: 'next', label: W.next }]} value={pick[c.key] || 'mine'} onValueChange={(v) => setPick({ ...pick, [c.key]: v as 'mine' | 'next' })} />
          </SettingSection>
        ))}
      </div>
    </Dialog>
  );
}

/* ───────── 面板 ───────── */

/** 页签标题：图标 + 文字（用户 2026-10-29：工具箱的页签都加上图标） */
function tabLabel(icon: string, text: string): React.ReactNode {
  const I = ICONS[icon];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{I ? <I width="1.05em" height="1.05em" strokeWidth={1.75} aria-hidden="true" /> : null}{text}</span>;
}

export interface ToolboxPanelProps {
  /** 60 号 KamiToolbox.bridge()（压缩 / 搜索 / 手动搜索）；没有 = 那几页显示「脚本未运行」 */
  toolbox?: ToolboxBridge | null;
  /** 40 号 KamiPreset.toolsBridge() */
  other?: OtherApi | null;
  /** 40 号 KamiPreset.updateBridge() */
  update?: UpdateApi | null;
  onClose: () => void;
  /** 打开手动搜索窗口（由脚本开在同一层上，关面板不影响它） */
  onManualSearch?: () => void;
  tab?: string;
  onTabChange?: (tab: string) => void;
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

export function ToolboxPanel({ toolbox, other, update, onClose, onManualSearch, tab: tab0, onTabChange, compactQuery = '(max-width: 1000px)', defaultSize = { w: 860, h: 780 } }: ToolboxPanelProps): React.JSX.Element {
  useLive(toolbox);
  const compact = useMedia(compactQuery);
  const [tab, setTabState] = React.useState(tab0 || 'compress');
  React.useEffect(() => { if (tab0) { setTabState(tab0); } }, [tab0]);
  const setTab = (t: string): void => { setTabState(t); if (onTabChange) { onTabChange(t); } };
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => void; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify: Notify = React.useCallback((msg, undo) => {
    setToast((t) => ({ msg, ...(undo ? { undo } : {}), n: (t?.n || 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  const copy = React.useMemo(() => mergeCopy(toolbox?.copy), [toolbox]);
  const missing = <Missing what="「🧰 工具箱」脚本" />;
  return (
    <CopyCtx.Provider value={copy}>
      <Panel title="工具箱" onClose={onClose} defaultSize={defaultSize}>
        <Tabs label="工具箱" swipe={compact} sticky mode={compact ? 'scroll' : 'fit'} value={tab} onValueChange={setTab} items={[
          { value: 'compress', label: tabLabel('archive', '压缩'), content: toolbox ? <Compress bridge={toolbox} /> : missing },
          { value: 'search', label: tabLabel('search', '网络搜索'), content: toolbox ? <Search bridge={toolbox} openManual={() => { if (onManualSearch) { onManualSearch(); } }} /> : missing },
          { value: 'other', label: tabLabel('wrench', '其他功能'), content: <Other api={other || undefined} notify={notify} /> },
          { value: 'update', label: tabLabel('refresh', '更新'), content: <Update api={update || undefined} /> }
        ]} />
        {toast ? <Toast key={toast.n} message={toast.msg} {...(toast.undo ? { action: '撤销', onAction: () => { const u = toast.undo!; setToast(null); u(); } } : {})} onClose={() => setToast(null)} /> : null}
      </Panel>
    </CopyCtx.Provider>
  );
}
