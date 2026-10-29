/**
 * 「工具箱」面板重设计预览（皮肤：碎光）。三个页签：压缩 / 网络搜索 / 其他功能，旧工具箱的功能一项不漏（旧界面盘点第三节）。
 * 文案全部来自现有出处，不在这里另写：
 *   压缩 → design/copy/compress-copy.polished.json；标签处理 → 40-预设设置.js 的 TAGFIX_COPY（比 tagfix-copy.json 新，补了思维链引用保护）；
 *   常驻附加指令 → design/copy/godcmd-copy.json（**用户逐字给定，不改**）；导出 → 40-预设设置.js 的 EXPORT_NOTICE；
 *   搜索来源、说明、链接 → src/scripts/_search-providers.js；搜索限额字段、范围、默认值 → src/scripts/_search-pure.js。
 * 第二版（用户 2026-10-29）：原预设设置的「关于」挪进来改成「更新」页（版本信息、检查更新 + 进度弹窗、继承旧预设 + 逐条裁决）；四个页签都带图标；
 *   补上手动搜索弹窗（_search-manual-ui.js 的文案与四个步骤）和大总结的分块进度。更新进度直接跑 _update-progress.js 的状态机。
 * 只是预览：状态都在本页内存里，按钮只弹提示，不连酒馆。
 * 布局原则：常用操作在页签顶部；只有开着的功能才显示它的参数；高级项（提示词、手动搜索设置、头部任务）收进折叠卡。
 */
import * as React from 'react';
import { createRuntime } from '../../../src/frontend/runtime/index';
import type { SkinManifest } from '../../../src/frontend/skin-engine/package';
import manifestJson from '../../../src/skins-next/suiguang/skin.json';
import skinCss from '../../../src/skins-next/suiguang/skin.css';
import paperUrl from '../../../src/skins-next/suiguang/assets/paper.png';
import CC from '../../copy/compress-copy.polished.json';
import GOD from '../../copy/godcmd-copy.json';
import TAG0 from '../../copy/tagfix-copy.json';
import { webSearchProviders } from '../../../src/scripts/_search-providers.js';
import { webSearchLimitFields } from '../../../src/scripts/_search-pure.js';
import * as UP from '../../../src/scripts/_update-progress.js';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, CollapseCard, Dialog, Field, InfoPopover, Panel, Segmented, Select, SettingRow, SettingSection,
  Progress, Slider, Steps, Switch, Tabs, TextArea, TextField, Toast, ICONS
} from '../../../src/frontend/ds';

const rt = createRuntime(window);
const q = new URLSearchParams(location.search);
rt.applySkin(manifestJson as unknown as SkinManifest, { scheme: q.get('scheme') || 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss, assetUrls: { paper: paperUrl } });

/* 标签处理：以脚本里正在用的 TAGFIX_COPY 为准（40-预设设置.js），json 留档缺的几条在这里补上 */
const TAG = {
  ...TAG0,
  note: 'AI 忘写结尾标签会导致正文或选项不显示，也会让摘要压缩失效。你可以在下面填入需要自动收拾的标签名，打开覆盖模式管得更宽，所有标签都管，HTML 标签除外。' +
    '开启补全或删除时，会先把思维链里的标签引用改成全角尖括号，防止它们触发预设或角色卡正则。补全把结尾紧贴缺失的开始标签补上；删除会扔掉没配对的标签。关闭则保持原样。',
  modeLabel: '处理方式', manualLabel: '手动处理', referenceLead: '要保护的思维链引用：'
};
const EXPORT = {
  title: '导出纯净正文', note: '把当前聊天的正文导成 TXT。楼层范围留空表示全部；范围用你看到的楼层号（第 1 层在最上面）。',
  rangeLabel: '楼层范围', rangeFromHint: '起始', rangeToHint: '结束', scopeLabel: '导出范围', scopeAll: '全部', scopeAi: '仅 AI',
  scopeAllHint: '用户与 AI 的消息都导；每条前面写 role：user / role：assistant', scopeAiHint: '只导 AI 的消息，不写 role 前缀', btn: '导出 TXT',
  goodPath: '只取每条消息里 content 块中的正文，再去掉标签、还原段落换行；<content> 之外的东西（前端代码、围栏代码块、指令）一律不进导出。'
};
const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
const PROVIDERS = webSearchProviders();
const LIMITS = webSearchLimitFields();

function useCompact(): boolean {
  const mq = '(max-width: 1000px)';
  const [c, setC] = React.useState(() => matchMedia(mq).matches);
  React.useEffect(() => { const m = matchMedia(mq); const on = (): void => setC(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, []);
  return c;
}

const info = (label: string, text: string): React.ReactNode => <InfoPopover label={'关于「' + label + '」'}><p>{text}</p></InfoPopover>;
const Note = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{children}</p>;
const Row = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</div>;
const Num = ({ value, onChange, label, min, max, width = 120 }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; width?: number }): React.JSX.Element => (
  <span style={{ display: 'block', width, maxWidth: '100%' }}><TextField type="number" inputMode="numeric" aria-label={label} value={Number.isNaN(value) ? '' : String(value)} {...(min !== undefined ? { min } : {})} {...(max !== undefined ? { max } : {})}
    onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} /></span>
);
const Stack = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)' }}>{children}</div>;
const Grid2 = ({ children }: { children: React.ReactNode }): React.JSX.Element => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--k-gap-group)' }}>{children}</div>;

type Notify = (msg: string, undo?: () => void) => void;

/* ───────── 压缩 ───────── */

interface PromptEntry { role: 'system' | 'user' | 'assistant'; content: string }
const ROLES = [{ value: 'system', label: CC.prompts.roleSystem }, { value: 'user', label: CC.prompts.roleUser }, { value: 'assistant', label: CC.prompts.roleChar }];

function PromptList({ title, list, set }: { title: string; list: PromptEntry[]; set: (l: PromptEntry[]) => void }): React.JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Row><strong>{title}</strong><Badge>{list.length} 条</Badge></Row>
      {list.map((e, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <Row>
            <span style={{ width: 120 }}><Select aria-label={title + ' 第 ' + (i + 1) + ' 条角色'} size="sm" options={ROLES} value={e.role} onValueChange={(v) => set(list.map((x, j) => (j === i ? { ...x, role: v as PromptEntry['role'] } : x)))} /></span>
            <Button size="sm" variant="ghost" onClick={() => set(list.filter((_, j) => j !== i))}>{CC.prompts.removeEntry}</Button>
          </Row>
          <TextArea aria-label={title + ' 第 ' + (i + 1) + ' 条内容'} rows={3} value={e.content} onChange={(ev) => set(list.map((x, j) => (j === i ? { ...x, content: ev.target.value } : x)))} />
        </div>
      ))}
      <div><Button size="sm" onClick={() => set([...list, { role: 'system', content: '' }])}>{CC.prompts.addEntry}</Button></div>
    </div>
  );
}

function ModelConfig({ notify }: { notify: Notify }): React.JSX.Element {
  const [mode, setMode] = React.useState('tavern');
  const [cfgs, setCfgs] = React.useState([{ name: '我的 DeepSeek', source: 'deepseek', url: '', model: 'deepseek-chat' }]);
  const [cur, setCur] = React.useState(0);
  const [newName, setNewName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [models, setModels] = React.useState<string[]>([]);
  const c = cfgs[cur] || cfgs[0]!;
  const patch = (p: Partial<typeof c>): void => setCfgs(cfgs.map((x, i) => (i === cur ? { ...x, ...p } : x)));
  return (
    <SettingSection title={CC.model.section} aside={info(CC.model.section, CC.model.note)}>
      <Segmented label={CC.model.section} options={[{ value: 'tavern', label: CC.model.tavern }, { value: 'custom', label: CC.model.custom }]} value={mode} onValueChange={setMode} />
      {mode === 'custom' ? (
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Grid2>
            <Field label={CC.model.cfgLabel}>
              <Select options={cfgs.map((x, i) => ({ value: String(i), label: x.name || CC.model.noCfgName }))} value={String(cur)} onValueChange={(v) => setCur(Number(v))} />
            </Field>
            <Field label={CC.model.sourceLabel} hint={CC.model.sourceHint}>
              <Select options={CC.model.sources.map((s) => ({ value: s.v, label: s.n }))} value={c.source} onValueChange={(v) => patch({ source: v })} />
            </Field>
          </Grid2>
          <Field label={CC.model.apiUrlLabel} hint={CC.model.apiUrlHint}><TextField type="url" placeholder="https://…" value={c.url} onChange={(e) => patch({ url: e.target.value })} /></Field>
          <Field label={CC.model.keyLabel} hint={CC.model.keyHint}><TextField type="password" autoComplete="off" /></Field>
          <Field label={CC.model.modelLabel} hint={CC.model.modelHint}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0 }}>{models.length
                ? <Select options={models.map((m) => ({ value: m, label: m }))} value={c.model} onValueChange={(v) => patch({ model: v })} placeholder={CC.model.fetchPick} />
                : <TextField value={c.model} onChange={(e) => patch({ model: e.target.value })} />}</span>
              <Button busy={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); setModels(['deepseek-chat', 'deepseek-reasoner']); notify('已获取 2 个模型'); }, 700); }}>{busy ? CC.model.fetching : CC.model.fetchModels}</Button>
            </div>
          </Field>
          <Row>
            <Button size="sm" onClick={() => notify(fill(CC.model.importDone, { name: '酒馆当前连接' }))}>{CC.model.importBtn}</Button>
            <span style={{ width: 160 }}><TextField size="sm" placeholder={CC.model.namePh} aria-label={CC.model.namePh} value={newName} onChange={(e) => setNewName(e.target.value)} /></span>
            <Button size="sm" onClick={() => {
              if (!newName.trim()) { notify(CC.model.nameMissing); return; }
              setCfgs([...cfgs, { ...c, name: newName.trim() }]); setCur(cfgs.length); setNewName(''); notify(fill(CC.model.saveDone, { name: newName.trim() }));
            }}>{CC.model.saveAs}</Button>
            <Button size="sm" variant="ghost" onClick={() => {
              if (cfgs.length <= 1) { notify(CC.model.delLast); return; }
              const name = c.name; setCfgs(cfgs.filter((_, i) => i !== cur)); setCur(0); notify(fill(CC.model.delDone, { name }));
            }}>{CC.model.delBtn}</Button>
          </Row>
          <Note>{CC.model.customHint}</Note>
        </div>
      ) : null}
    </SettingSection>
  );
}

function Compress({ notify }: { notify: Notify }): React.JSX.Element {
  const [roll, setRoll] = React.useState(false);
  const [grand, setGrand] = React.useState(true);
  const [depth, setDepth] = React.useState(20);
  const [threshold, setThreshold] = React.useState(60000);
  const [keep, setKeep] = React.useState(12);
  const [chunk, setChunk] = React.useState(40);
  const [running, setRunning] = React.useState(false);
  const [chunkAt, setChunkAt] = React.useState(0);
  const CHUNKS = [{ from: 81, to: 120 }, { from: 121, to: 160 }, { from: 161, to: 200 }];
  React.useEffect(() => {
    if (!running) { return; }
    if (chunkAt >= CHUNKS.length) { setRunning(false); notify(fill(CC.toasts.done, { a: CHUNKS.length, b: CHUNKS.length * 40, c: 2 + CHUNKS.length })); return; }
    const t = setTimeout(() => setChunkAt((n) => n + 1), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, chunkAt]);
  const [armed, setArmed] = React.useState(false);
  const [pins, setPins] = React.useState([3, 17]);
  const [pin, setPin] = React.useState('');
  const [entryOn, setEntryOn] = React.useState(true);
  const [head, setHead] = React.useState<PromptEntry[]>([{ role: 'system', content: '你是剧情记录员。' }]);
  const [task, setTask] = React.useState('把下面的楼层压缩成要点，保留人物关系变化、承诺与伏笔。');
  const [tail, setTail] = React.useState<PromptEntry[]>([]);
  const blocks = [{ n: 1, from: 1, to: 40, depth: 52, text: '主角在港口城市醒来，失去了三天的记忆；与酒馆老板娘约定以打工抵债……' }, { n: 2, from: 41, to: 80, depth: 12, text: '调查船难真相，得知灯塔看守人知情；与搭档第一次争执后和解……' }];
  React.useEffect(() => { if (!armed) { return; } const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return (
    <Stack>
      <div style={{ display: 'grid', gap: 6 }}>
        <Row>
          <Button variant="primary" busy={running} onClick={() => { if (running) { notify(CC.toasts.running); return; } setChunkAt(0); setRunning(true); notify(fill(CC.toasts.start, { x: CC.toasts.startManual })); }}>{running ? CC.grand.running : CC.grand.runNow}</Button>
          <Button onClick={() => notify(fill(CC.toasts.unhideDone, { n: 80 }))}>{CC.grand.unhideAll}</Button>
          <Button variant={armed ? 'danger' : 'ghost'} onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); notify(fill(CC.toasts.clearDone, { n: 2 })); }}>{armed ? CC.grand.clearArmed : CC.grand.clearData}</Button>
        </Row>
        {running ? (
          <div data-grand-progress="" style={{ display: 'grid', gap: 6 }} aria-live="polite">
            <Progress label="大总结进度" value={(chunkAt / CHUNKS.length) * 100} />
            <Note>{chunkAt < CHUNKS.length ? '正在总结第 ' + (chunkAt + 1) + ' / ' + CHUNKS.length + ' 块（' + CHUNKS[chunkAt]!.from + '–' + CHUNKS[chunkAt]!.to + ' 楼）' : '正在收尾…'}</Note>
          </div>
        ) : <Note>{CC.grand.runHint}</Note>}
      </div>

      <SettingSection title={CC.mode.section} badge={<Badge>可同时开</Badge>}>
        <ChoiceGrid min={220}>
          <ChoiceCard multi selected={roll} onSelect={() => setRoll(!roll)} title={CC.mode.rollTitle} meta={roll ? fill(CC.mode.rollDepthLine, { n: depth }) : CC.mode.off}>{CC.mode.rollNote}</ChoiceCard>
          <ChoiceCard multi selected={grand} onSelect={() => { setGrand(!grand); if (!grand) { notify(fill(CC.toasts.grandOn, { n: threshold })); } }} title={CC.mode.grandTitle} meta={grand ? CC.mode.on : CC.mode.off}>{CC.mode.grandNote}</ChoiceCard>
        </ChoiceGrid>
      </SettingSection>

      {roll ? (
        <SettingSection title={CC.roll.section}>
          <SettingRow label={CC.roll.depthLabel} description={CC.roll.depthHint} control={<Num label={CC.roll.depthLabel} value={depth} min={0} onChange={setDepth} />} />
        </SettingSection>
      ) : null}
      {grand ? (
        <SettingSection title={CC.grand.section} badge={<Badge tone="info">上次实测 41,286 token</Badge>}>
          <SettingRow label={CC.grand.thresholdLabel} description={CC.grand.thresholdHint} control={<Num label={CC.grand.thresholdLabel} value={threshold} min={1000} onChange={setThreshold} width={140} />} />
          <SettingRow label={CC.grand.keepLabel} description={CC.grand.keepHint} control={<Num label={CC.grand.keepLabel} value={keep} min={0} onChange={setKeep} />} />
          <SettingRow label={CC.grand.chunkLabel} description={CC.grand.chunkHint} control={<Num label={CC.grand.chunkLabel} value={chunk} min={1} onChange={setChunk} />} />
        </SettingSection>
      ) : null}

      <ModelConfig notify={notify} />

      <SettingSection title={CC.pins.section} badge={<Badge>{pins.length} 楼</Badge>} aside={info(CC.pins.section, CC.pins.note)}>
        {pins.length ? (
          <Row>{pins.map((n) => <Button key={n} size="sm" title={CC.pins.chipTitle} aria-label={CC.pins.remove + ' #' + n} onClick={() => { setPins(pins.filter((x) => x !== n)); notify(fill(CC.toasts.pinRemoved, { n }), () => setPins((p) => [...p, n].sort((a, b) => a - b))); }}>#{n} ✕</Button>)}</Row>
        ) : <Note>{CC.pins.empty}</Note>}
        <Row>
          <span style={{ width: 120 }}><TextField size="sm" type="number" inputMode="numeric" placeholder={CC.pins.ph} aria-label={CC.pins.ph} value={pin} onChange={(e) => setPin(e.target.value)} /></span>
          <Button size="sm" onClick={() => {
            const n = Number(pin);
            if (!pin || !Number.isInteger(n) || n < 0 || n > 120) { notify(fill(CC.toasts.pinRange, { n: 120 })); return; }
            if (pins.includes(n)) { notify(fill(CC.toasts.pinDup, { n })); return; }
            setPins([...pins, n].sort((a, b) => a - b)); setPin(''); notify(fill(CC.toasts.pinAdded, { n }));
          }}>{CC.pins.add}</Button>
        </Row>
      </SettingSection>

      <SettingSection title={CC.blocks.section} badge={<Badge>{blocks.length} 块</Badge>} aside={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant="ghost" onClick={() => notify('已刷新')}>刷新</Button>{info(CC.blocks.section, fill(CC.blocks.note, { lb: '示例聊天' }))}</span>}>
        {blocks.map((b) => (
          <CollapseCard key={b.n} title={'📜 压缩块 #' + b.n + ' · ' + b.from + '–' + b.to + ' 楼'} meta={CC.blocks.depthTag + ' ' + b.depth}>
            <p>{b.text}</p>
          </CollapseCard>
        ))}
      </SettingSection>

      <CollapseCard title={CC.prompts.section} meta="高级">
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Note>{CC.prompts.hint}</Note>
          <PromptList title={CC.prompts.head} list={head} set={setHead} />
          <Field label={CC.prompts.task}><TextArea rows={4} value={task} onChange={(e) => setTask(e.target.value)} /></Field>
          <PromptList title={CC.prompts.tail} list={tail} set={setTail} />
          <div><Button size="sm" variant="ghost" onClick={() => notify(CC.prompts.reset + '：已完成')}>{CC.prompts.reset}</Button></div>
        </div>
      </CollapseCard>

      <SettingSection title={CC.entry.section} badge={<Badge tone={entryOn ? 'success' : 'warning'}>{entryOn ? '已开启' : '已关闭'}</Badge>}>
        <Note>{CC.entry.note}</Note>
        <div><Button size="sm" onClick={() => setEntryOn(!entryOn)}>{entryOn ? CC.entry.turnOff : CC.entry.turnOn}</Button></div>
      </SettingSection>
    </Stack>
  );
}

/* ───────── 网络搜索 ───────── */

function Limits({ manual, title }: { manual: boolean; title: string }): React.JSX.Element {
  const [v, setV] = React.useState<Record<string, number>>(() => Object.fromEntries(LIMITS.map((f) => [f.key, manual ? f.manual : f.auto])));
  return (
    <SettingSection title={title} aside={info(title, '均为每次搜索的上限，实际结果可以更少。token预算只限制最终保存的资料，不含搜索模型读取上下文的用量。模型自带搜索的实际查询次数由模型控制，保存时仍检查资料、来源和长度。')}>
      {LIMITS.map((f) => (
        <SettingRow key={f.key} label={f.label} description={f.min + '–' + f.max}
          control={<span style={{ display: 'block', width: 240, maxWidth: '100%' }}><Slider aria-label={(manual ? '手动搜索' : '自动搜索') + f.label} value={v[f.key]!} min={f.min} max={f.max}
            step={f.max >= 1000 ? 100 : 1} onValueChange={(n) => setV({ ...v, [f.key]: n })} /></span>} />
      ))}
    </SettingSection>
  );
}

function Search({ notify }: { notify: Notify }): React.JSX.Element {
  const [on, setOn] = React.useState(true);
  const [mode, setMode] = React.useState('service');
  const [prov, setProv] = React.useState('firecrawl-keyless');
  const [saved, setSaved] = React.useState<Record<string, boolean>>({});
  const [key, setKey] = React.useState('');
  const [wiki, setWiki] = React.useState('zh');
  const [shortcut, setShortcut] = React.useState(true);
  const [endpoint, setEndpoint] = React.useState('');
  const p = PROVIDERS.find((x) => x.id === prov) || PROVIDERS[0]!;
  const needKey = !!(p.secret || p.localKey);
  return (
    <Stack>
      {on && mode === 'service' ? <div><ManualSearch /></div> : null}
      <SettingSection title="搜索能力">
        <SettingRow label="开启搜索能力" control={<Switch checked={on} onCheckedChange={setOn} aria-label="开启搜索能力" />} />
        {on ? (
          <>
            <SettingRow label="搜索来源" description={mode === 'native' ? '由剧情模型按需搜索，资料与剧情保存在同一条回复中。' : '自动搜索会额外调用搜索模型判断需求；也可单独查询资料。'}
              control={<Segmented label="搜索来源" size="sm" options={[{ value: 'native', label: '模型自带' }, { value: 'service', label: '搜索服务' }]} value={mode} onValueChange={setMode} />} />
          </>
        ) : null}
      </SettingSection>
      {on && mode === 'native' ? (
        <>
          <Limits manual={false} title="自动搜索限额" />
          <SettingSection title="模型联网能力">
            <Note>使用当前剧情连接提供的搜索能力。Gemini 原生搜索与反截断正文工具不能同时使用，本轮会优先搜索。</Note>
            <Note>测试会实际调用当前连接，可能产生模型与搜索费用；不携带剧情、不写入聊天，可随时中断。</Note>
            <div><Button size="sm" onClick={() => notify('测试已开始（预览不会真的调用）')}>测试当前连接</Button></div>
          </SettingSection>
        </>
      ) : null}
      {on && mode === 'service' ? (
        <>
          <SettingSection title="搜索服务连接" badge={needKey ? <Badge tone={saved[prov] ? 'success' : 'warning'}>{saved[prov] ? '已保存密钥' : '还没保存密钥'}</Badge> : <Badge tone="success">免密钥</Badge>}>
            <Field label="服务"><Select options={PROVIDERS.map((x) => ({ value: x.id, label: x.label }))} value={prov} onValueChange={(v) => { setProv(v); setKey(''); }} /></Field>
            <Note>{p.note}</Note>
            <Row>
              <a {...{ 'data-k': 'button', 'data-variant': 'ghost', 'data-size': 'sm' }} href={p.url} target="_blank" rel="noopener"><span data-k-part="label">官方说明与额度 ↗</span></a>
              {p.keyUrl ? <a {...{ 'data-k': 'button', 'data-variant': 'ghost', 'data-size': 'sm' }} href={p.keyUrl} target="_blank" rel="noopener"><span data-k-part="label">获取 API Key ↗</span></a> : null}
            </Row>
            {p.endpoint ? (
              <Field label="服务地址" hint="地址由运行酒馆的服务器访问；127.0.0.1 指酒馆服务器。切换服务会分别保留两种服务的地址。">
                <TextField type="url" placeholder="https://…" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
              </Field>
            ) : null}
            {prov === 'wikipedia' ? (
              <Field label="百科语言"><Select options={[{ value: 'zh', label: '中文' }, { value: 'en', label: '英文' }, { value: 'ja', label: '日文' }]} value={wiki} onValueChange={setWiki} /></Field>
            ) : null}
            {needKey ? (
              <Field label="API Key" hint={p.localKey ? '当前设备直接连接官方接口，无需额外插件。密钥仅保存在本机浏览器，按酒馆用户分别保存；不随预设导出，换设备需重填。' : undefined}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 180px', minWidth: 0 }}><TextField type="password" autoComplete="off" placeholder="填写或更新搜索服务密钥" value={key} onChange={(e) => setKey(e.target.value)} /></span>
                  <Button onClick={() => { if (!key.trim()) { notify('密钥格式无效，请重新填写'); return; } setSaved({ ...saved, [prov]: true }); setKey(''); notify('已保存密钥'); }}>保存密钥</Button>
                  {p.localKey && saved[prov] ? <Button variant="ghost" onClick={() => { setSaved({ ...saved, [prov]: false }); notify('已清除本机密钥'); }}>清除本机密钥</Button> : null}
                </div>
              </Field>
            ) : <Note>此来源无需搜索API密钥。</Note>}
            <Note>免费仅指搜索服务；搜索模型与剧情模型仍按所选连接计费。额度信息核对于2026-10-19，以服务商当前政策为准。</Note>
          </SettingSection>
          <Limits manual={false} title="自动搜索限额" />
          <CollapseCard title="手动搜索设置" meta="高级">
            <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
              <Note>以下设置仅用于手动搜索。自动搜索仍跟随剧情连接；这些修改不会改变压缩设置。</Note>
              <SettingRow label="显示消息栏上方按钮" description="显示消息栏上方手动搜索按钮" control={<Switch checked={shortcut} onCheckedChange={setShortcut} aria-label="显示消息栏上方手动搜索按钮" />} />
              <Limits manual title="手动搜索限额" />
              <Note>手动搜索模型、手动搜索提示词与「压缩 → 大总结模型 / 摘要提示词」同一套编辑方式（此模型仅用于手动搜索。自动搜索跟随剧情连接，压缩模型独立保存）。</Note>
            </div>
          </CollapseCard>
        </>
      ) : null}
      {on ? (
        <CollapseCard title="网络搜索头部任务" meta="高级">
          <Note>与预设“🌐 网络搜索”里的头部任务保持一致，改动只影响本机设置。</Note>
        </CollapseCard>
      ) : null}
    </Stack>
  );
}

/* ───────── 其他功能 ───────── */

function Other({ notify }: { notify: Notify }): React.JSX.Element {
  const [tagMode, setTagMode] = React.useState('close');
  const [all, setAll] = React.useState(false);
  const [custom, setCustom] = React.useState('content options');
  const [confirm, setConfirm] = React.useState(false);
  const [stat, setStat] = React.useState('');
  const [god, setGod] = React.useState(false);
  const [godText, setGodText] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [scope, setScope] = React.useState('all');
  return (
    <Stack>
      <SettingSection title={TAG.title} aside={info(TAG.title, TAG.note)}>
        <SettingRow label={TAG.modeLabel} description={TAG.modeHint}
          control={<Segmented label={TAG.modeLabel} size="sm" options={[{ value: 'off', label: '关闭' }, { value: 'close', label: '补全' }, { value: 'remove', label: '删除' }]} value={tagMode} onValueChange={setTagMode} />} />
        <SettingRow label={TAG.allLabel} description={TAG.allHint} control={<Switch checked={all} onCheckedChange={setAll} aria-label={TAG.allLabel} disabled={tagMode === 'off'} />} />
        <Field label={TAG.customLabel} hint={all ? TAG.allChip + '：' + TAG.allHint : TAG.customHint} disabled={tagMode === 'off' || all}>
          <TextField value={custom} onChange={(e) => setCustom(e.target.value)} />
        </Field>
        <SettingRow label={TAG.manualLabel} description={TAG.manualHint + ' · ' + TAG.statLabel + '：' + (stat || TAG.statNone)}
          control={<Button size="sm" onClick={() => setConfirm(true)}>{TAG.manualBtn}</Button>} />
      </SettingSection>
      <Dialog open={confirm} onOpenChange={setConfirm} title={TAG.manualBtn} size="sm"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>{TAG.confirmCancel}</Button><Button variant="primary" onClick={() => { setConfirm(false); setStat('补全 2 处'); notify(TAG.confirmDone); }}>{TAG.confirmOk}</Button></>}>
        <div style={{ display: 'grid', gap: 8 }}>
          <p>{TAG.scanLead}</p>
          <p><strong>{TAG.closeLead}</strong><code>&lt;/content&gt;</code> <code>&lt;/options&gt;</code></p>
          <p style={{ color: 'var(--k-on-muted)' }}>{TAG.strayNote.replace('%n%', '1')}</p>
          <p style={{ color: 'var(--k-on-muted)' }}>{TAG.confirmNote}</p>
        </div>
      </Dialog>

      <SettingSection title={GOD.title} aside={info(GOD.title, GOD.note)}>
        <SettingRow label={GOD.switchLabel} description={god ? GOD.modeOn : GOD.modeOff}
          control={<Switch checked={god} aria-label={GOD.title + GOD.switchLabel} onCheckedChange={(v) => { if (v && !godText.trim()) { notify(GOD.emptyWarn); return; } setGod(v); }} />} />
        <Field label={GOD.textLabel} hint={GOD.textHint}>
          <TextArea rows={4} value={godText} onChange={(e) => { setGodText(e.target.value); if (!e.target.value.trim()) { setGod(false); } }} />
        </Field>
      </SettingSection>

      <SettingSection title={EXPORT.title} aside={info(EXPORT.title, EXPORT.note + '\n' + EXPORT.goodPath)}>
        <SettingRow label={EXPORT.rangeLabel} description="留空表示全部" control={
          <Row>
            <Num label={EXPORT.rangeLabel + '（起始）'} value={from === '' ? NaN : Number(from)} onChange={(v) => setFrom(isNaN(v) ? '' : String(v))} width={90} />
            <span aria-hidden="true">–</span>
            <Num label={EXPORT.rangeLabel + '（结束）'} value={to === '' ? NaN : Number(to)} onChange={(v) => setTo(isNaN(v) ? '' : String(v))} width={90} />
          </Row>} />
        <SettingRow label={EXPORT.scopeLabel} description={scope === 'ai' ? EXPORT.scopeAiHint : EXPORT.scopeAllHint}
          control={<Segmented label={EXPORT.scopeLabel} size="sm" options={[{ value: 'all', label: EXPORT.scopeAll }, { value: 'ai', label: EXPORT.scopeAi }]} value={scope} onValueChange={setScope} />} />
        <div><Button variant="primary" onClick={() => notify('已导出 ' + (from && to ? Number(to) - Number(from) + 1 : 120) + ' 楼层')}>{EXPORT.btn}</Button></div>
      </SettingSection>
    </Stack>
  );
}

/* ───────── 手动搜索弹窗（_search-manual-ui.js 的文案与四个步骤） ───────── */

const MS_STEPS = [
  { id: 'plan', label: '理解需求', hint: '识别世界与查询范围' },
  { id: 'query', label: '查询外部资料', hint: '按主题查询真实来源' },
  { id: 'facts', label: '整理详细资料', hint: '核对事实、细节与引用' },
  { id: 'save', label: '保存资料', hint: '只新增一个资料楼层' }
];

function ManualSearch(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<'ask' | 'run' | 'done' | 'stopped'>('ask');
  const [ask, setAsk] = React.useState('');
  const [at, setAt] = React.useState(0);
  const [qn, setQn] = React.useState(1);
  React.useEffect(() => {
    if (phase !== 'run') { return; }
    if (at >= MS_STEPS.length) { setPhase('done'); return; }
    const t = setTimeout(() => { if (at === 1 && qn < 3) { setQn(qn + 1); } else { setAt(at + 1); } }, 700);
    return () => clearTimeout(t);
  }, [phase, at, qn]);
  const close = (): void => { setOpen(false); setPhase('ask'); setAt(0); setQn(1); };
  const title = phase === 'run' ? '手动搜索进行中' : phase === 'done' ? '手动搜索已完成' : phase === 'stopped' ? '搜索已中断' : '手动搜索';
  return (
    <>
      <Button variant="primary" icon={React.createElement(ICONS['search']!, { width: 16, height: 16 })} onClick={() => setOpen(true)}>手动搜索</Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { if (phase === 'run') { setPhase('stopped'); } close(); } }} title={title} size="md"
        footer={phase === 'ask'
          ? <><Button variant="ghost" onClick={close}>取消</Button><Button variant="primary" disabled={!ask.trim()} onClick={() => setPhase('run')}>确认并搜索</Button></>
          : phase === 'run' ? <Button variant="danger" onClick={() => setPhase('stopped')}>中断搜索</Button>
            : <Button variant="primary" onClick={close}>关闭</Button>}>
        {phase === 'ask' ? (
          <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
            <Field label="这次想查什么？" hint="会参考角色卡、世界书和经过正则处理的历史；不带剧情预设条目。">
              <TextArea rows={4} placeholder="例如：整理当前年代的地理、居民、文化与规则，排除未来剧情。" value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="本次搜索要求" />
            </Field>
            <Steps label="搜索步骤" items={MS_STEPS} current="" />
            <Note>可以随时中断；未完成的资料不会写入聊天。</Note>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }} aria-live="polite">
            <Steps label="搜索步骤" items={MS_STEPS.map((s) => (s.id === 'query' && phase === 'run' && at === 1 ? { ...s, hint: '正在处理第 ' + qn + ' 个查询' } : s))}
              current={phase === 'done' ? 'save' : MS_STEPS[Math.min(at, MS_STEPS.length - 1)]!.id} failed={phase === 'stopped'} />
            {phase === 'run' ? <Progress label="手动搜索进度" value={null} /> : null}
            <Note>{phase === 'done' ? '完成后只新增资料楼层。' : phase === 'stopped' ? '搜索已中断，未完成的资料不会写入聊天。' : '可以随时中断；未完成的资料不会写入聊天。'}</Note>
          </div>
        )}
      </Dialog>
    </>
  );
}

/* ───────── 更新（原预设设置的「关于」页；用户 2026-10-29 挪进工具箱） ───────── */

const INHERIT = {
  title: '继承旧预设设置', note: '手动导入新版本后，可以用它把旧预设里你改过的设置搬过来。', pickHint: '请从下面选一个你之前用过的旧预设。',
  notKamiWarn: '这个看起来不是卡密预设，强行搬过来可能会出问题。你想继续继承它，还是换一个？', working: '正在搬运设置...',
  done: '设置已经搬过来了，并且立刻生效。当前的预设已经提前备份了一份，名字里带有“继承前备份”。', noOthers: '没有找到其他预设，需要先有旧预设才能搬运设置。',
  sourceLabel: '这一份继承自', sourceNone: '还没继承过',
  noAsk: '这次没有条目需要你裁决：你的旧预设和这一版之间，没有同一条内容被两边都改过，所以直接搬完了。', asked: '其中 {n} 处两边都改过，已按你在裁决页里的选择处理。'
};
const OLD_PRESETS = [{ id: 'a', name: 'kami-v0.92-100', kami: true }, { id: 'b', name: 'kami-v0.91-88（我改过）', kami: true }, { id: 'c', name: 'Default', kami: false }];
const CONFLICTS = [
  { id: 'c1', name: '📖 [语言文字] 简体中文', mine: '……保留用户口吻里的方言词……', theirs: '……统一使用规范书面语……' },
  { id: 'c2', name: '🖊️ [写作文风] 白描', mine: '多用短句；少用比喻', theirs: '短句为主，比喻不超过每段一个' },
  { id: 'c3', name: '🧩 推理预算 | var', mine: 'reasoning_budget = 8000', theirs: 'reasoning_budget = 6000' }
];

function UpdateProgressDialog({ open, onClose, fail }: { open: boolean; onClose: () => void; fail: boolean }): React.JSX.Element {
  const ref = React.useRef(UP.newProgress(0));
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const failOnce = React.useRef(fail);
  const run = React.useCallback(() => {
    const p = ref.current;
    if (!UP.beginProgress(p, Date.now())) { return; }
    force();
    const total = 3464106;
    const steps: Array<() => boolean> = [
      () => { UP.enterStage(p, 'download'); UP.setTotal(p, total, 'manifest'); return true; },
      ...Array.from({ length: 8 }, () => () => { UP.addBytes(p, total / 8); if (failOnce.current && p.received > total / 2) { failOnce.current = false; UP.failProgress(p, '几条下载通道都试不通（GitHub 直链、jsDelivr 镜像），请换个网络再重试一次'); return false; } return true; }),
      () => UP.enterStage(p, 'verify'), () => UP.enterStage(p, 'merge'), () => UP.enterStage(p, 'write'),
      () => { UP.doneProgress(p, 'v0.93-8'); return true; }
    ];
    let i = 0;
    const tick = (): void => { if (i >= steps.length) { return; } const ok = steps[i++]!(); force(); if (ok && p.status === 'running') { setTimeout(tick, 260); } };
    setTimeout(tick, 400);
  }, []);
  React.useEffect(() => { if (open) { ref.current = UP.newProgress(0); failOnce.current = fail; run(); } }, [open, run, fail]);
  const v = UP.viewOf(ref.current);
  const stages = UP.UPDATE_STAGES.map((s) => ({ id: s.id, label: UP.UPDATE_COPY[s.copy]! }));
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && v.canClose) { onClose(); } }} title={v.title} size="sm"
      footer={<>{v.canRetry ? <Button variant="primary" onClick={() => run()}>{UP.UPDATE_COPY['retry']}</Button> : null}
        <Button variant={v.canRetry ? 'ghost' : 'primary'} disabled={!v.canClose} onClick={onClose}>{UP.UPDATE_COPY['close']}</Button></>}>
      <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }} aria-live="polite">
        <Steps label="更新阶段" items={stages} current={v.stage} failed={v.status === 'failed'} />
        {v.stage === 'download' || v.status === 'failed' ? <Progress label="下载进度" value={v.percent} tone={v.status === 'failed' ? 'danger' : 'accent'} /> : null}
        {v.bytesText ? <Note>{v.bytesText}</Note> : null}
        {v.detail ? <p style={{ color: v.status === 'failed' ? 'var(--k-danger)' : 'var(--k-on-muted)' }}>{v.detail}</p> : null}
        {v.retryText ? <Badge>{v.retryText}</Badge> : null}
      </div>
    </Dialog>
  );
}

function Update({ notify }: { notify: Notify }): React.JSX.Element {
  const [check, setCheck] = React.useState<'idle' | 'busy' | 'new' | 'latest'>('idle');
  const [checkedAt, setCheckedAt] = React.useState('');
  const [prog, setProg] = React.useState(false);
  const [failDemo, setFailDemo] = React.useState(true);
  const [old, setOld] = React.useState('a');
  const [warn, setWarn] = React.useState(false);
  const [judge, setJudge] = React.useState(false);
  const [pick, setPick] = React.useState<Record<string, 'mine' | 'theirs'>>({});
  const [inherited, setInherited] = React.useState<{ from: string; asked: number } | null>(null);
  const rows: Array<[string, string]> = [['酒馆版本', 'SillyTavern 1.18.0'], ['酒馆助手', '4.11.3'], ['预设版本', 'v0.93 · 构建 7']];
  const oldP = OLD_PRESETS.find((x) => x.id === old)!;
  const finish = (): void => { setJudge(false); setInherited({ from: oldP.name, asked: CONFLICTS.length }); notify('已从「' + oldP.name + '」继承设置，立刻生效'); };
  return (
    <Stack>
      <SettingSection title="版本信息">
        {rows.map(([k, v]) => <SettingRow key={k} label={k} control={<span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>} />)}
      </SettingSection>
      <SettingSection title="检查更新" badge={check === 'new' ? <Badge tone="accent">有新版</Badge> : check === 'latest' ? <Badge tone="success">已是最新</Badge> : undefined}>
        <SettingRow label="远程仓库" control={<code style={{ fontSize: 'var(--k-fs-sm)' }}>aforgomon41-create/sillytavern-kami-preset</code>} />
        <SettingRow label="上次检查" control={<span style={{ color: 'var(--k-on-muted)' }}>{checkedAt || '本次会话还没查过'}</span>} />
        {check === 'new' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p>仓库最新：<strong>v0.93-8</strong>（当前 v0.93-7）。更新会先备份当前预设，再把你改过的设置合并进新版。</p>
            <Row>
              <Button variant="primary" onClick={() => setProg(true)}>立即更新</Button>
              <Button variant="ghost" onClick={() => { setCheck('idle'); notify('先不更新（之后不再为这一版弹窗）'); }}>先不更新</Button>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 'var(--k-fs-sm)', color: 'var(--k-on-muted)' }}>
                <Switch size="sm" checked={failDemo} onCheckedChange={setFailDemo} aria-label="预览：第一次下载失败" />预览：第一次下载失败
              </label>
            </Row>
          </div>
        ) : null}
        <div><Button busy={check === 'busy'} onClick={() => { setCheck('busy'); setTimeout(() => { setCheck('new'); setCheckedAt(new Date().toLocaleTimeString()); }, 700); }}>检查更新</Button></div>
      </SettingSection>
      <UpdateProgressDialog open={prog} fail={failDemo} onClose={() => { setProg(false); setCheck('latest'); }} />

      <SettingSection title={INHERIT.title} aside={info(INHERIT.title, INHERIT.note)}>
        <Field label="旧预设" hint={INHERIT.pickHint}>
          <Select options={OLD_PRESETS.map((x) => ({ value: x.id, label: x.name + (x.kami ? '' : '（非卡密）') }))} value={old} onValueChange={(v) => { setOld(v); setWarn(false); }} />
        </Field>
        {warn ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ color: 'var(--k-warning)' }}>{INHERIT.notKamiWarn}</p>
            <Row><Button variant="danger" onClick={() => { setWarn(false); setJudge(true); }}>仍然继承</Button><Button variant="ghost" onClick={() => setWarn(false)}>换一个</Button></Row>
          </div>
        ) : <div><Button onClick={() => { if (!oldP.kami) { setWarn(true); return; } setPick({}); setJudge(true); }}>继承</Button></div>}
        <SettingRow label={INHERIT.sourceLabel} control={<span style={{ color: 'var(--k-on-muted)' }}>{inherited ? inherited.from : INHERIT.sourceNone}</span>} />
        {inherited ? <Note>{INHERIT.done + ' ' + (inherited.asked ? fill(INHERIT.asked.replace('{n}', '{n}'), { n: inherited.asked }) : INHERIT.noAsk)}</Note> : null}
      </SettingSection>

      <Dialog open={judge} onOpenChange={setJudge} title={'逐条裁决：' + CONFLICTS.length + ' 处你和新版都改过的内容'} size="lg"
        footer={<>
          <Button variant="ghost" onClick={() => setPick(Object.fromEntries(CONFLICTS.map((c) => [c.id, 'mine'])))}>全部保留我的</Button>
          <Button variant="ghost" onClick={() => setPick(Object.fromEntries(CONFLICTS.map((c) => [c.id, 'theirs'])))}>全部用新版</Button>
          <Button variant="primary" disabled={CONFLICTS.some((c) => !pick[c.id])} onClick={finish}>完成</Button>
        </>}>
        <div style={{ display: 'grid', gap: 'var(--k-gap-group)' }}>
          <Note>每一条选一边；没选完不能完成。关掉窗口 = 这次不继承，什么都不会写。</Note>
          {CONFLICTS.map((c) => (
            <SettingSection key={c.id} title={c.name}>
              <ChoiceGrid min={200}>
                <ChoiceCard selected={pick[c.id] === 'mine'} onSelect={() => setPick({ ...pick, [c.id]: 'mine' })} title="保留我的">{c.mine}</ChoiceCard>
                <ChoiceCard selected={pick[c.id] === 'theirs'} onSelect={() => setPick({ ...pick, [c.id]: 'theirs' })} title="用新版">{c.theirs}</ChoiceCard>
              </ChoiceGrid>
            </SettingSection>
          ))}
        </div>
      </Dialog>
    </Stack>
  );
}

/** 页签标题：图标 + 文字（用户 2026-10-29：工具箱的页签都加上图标） */
function tabLabel(icon: string, text: string): React.ReactNode {
  const I = ICONS[icon];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{I ? <I width="1.05em" height="1.05em" strokeWidth={1.75} aria-hidden="true" /> : null}{text}</span>;
}

/* ───────── 面板 ───────── */

function App(): React.JSX.Element {
  const compact = useCompact();
  const [open, setOpen] = React.useState(true);
  const [tab, setTab] = React.useState(q.get('tab') || 'compress');
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => void; n: number } | null>(null);
  const timer = React.useRef(0);
  const notify: Notify = React.useCallback((msg, undo) => {
    setToast((t) => ({ msg, ...(undo ? { undo } : {}), n: (t?.n || 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  if (!open) { return <div style={{ position: 'fixed', left: 16, bottom: 16, pointerEvents: 'auto' }}><Button variant="primary" onClick={() => setOpen(true)}>重新打开工具箱</Button></div>; }
  return (
    <Panel title="工具箱" onClose={() => setOpen(false)} defaultSize={{ w: 860, h: 780 }}>
      <Tabs label="工具箱" swipe={compact} sticky mode={compact ? 'scroll' : 'fit'} value={tab} onValueChange={setTab} items={[
        { value: 'compress', label: tabLabel('archive', '压缩'), content: <Compress notify={notify} /> },
        { value: 'search', label: tabLabel('search', '网络搜索'), content: <Search notify={notify} /> },
        { value: 'other', label: tabLabel('wrench', '其他功能'), content: <Other notify={notify} /> },
        { value: 'update', label: tabLabel('refresh', '更新'), content: <Update notify={notify} /> }
      ]} />
      {toast ? <Toast key={toast.n} message={toast.msg} {...(toast.undo ? { action: '撤销', onAction: () => { const u = toast.undo!; setToast(null); u(); } } : {})} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}

rt.layer().open('toolbox-preview', <App />);
