/**
 * 防护面板：「🛡 防护」设置页，管四件事——工具调用反截断、噪声稀释、防路由混淆、工具声明式上下文。
 * 面板不自己存一份状态：每次渲染现读 api.get()，脚本侧改了状态靠 api.subscribe 把面板推新，
 * 所以面板外面（脚本、别的入口）改了开关，这里跟着变，不会出现「面板显示开着、脚本其实关着」。
 * 具体存在哪（酒馆全局变量 / 脚本内存）由调用方决定，面板只认 GuardApi 这一层契约。
 * 改值不弹确认框：改完给一条带「撤销」的提示条；撤销只回滚这次动过的字段，
 * 期间改的别的项不动（避免撤销一下把用户刚调的设置也推回去）。
 * 电脑：四个分组竖排；手机（≤1000px）：四个页签、左右滑动切换（和显示面板同一套 Tabs 用法）。
 * 只读状态行来自 status()，是脚本上一轮实测的读数——只显示不回写，免得两处各记一份、对不上。
 */
import * as React from 'react';
import {
  Badge, Button, InfoPopover, Panel, Segmented, SettingRow, SettingSection, Slider, Switch, Tabs, Toast, useMedia
} from '../ds';

export interface GuardState {
  /** 工具调用反截断：把正文塞进函数参数通道 */
  tool: boolean;
  /** 噪声稀释 */
  noise: boolean;
  /** 噪声字符数，范围 1000..30000，步进 1000 */
  noiseChars: number;
  /** 噪声插在哪：开头 / 结尾 / 每条用户消息前 */
  noiseWhere: 'head' | 'tail' | 'each-user';
  /** 防路由混淆：往分类器敏感词里插 HTML 注释 */
  obfuscate: boolean;
  /** 混淆强度：只混淆头部 / 全量 */
  obMode: 'head' | 'deep';
  /** 工具声明式上下文：把角色卡+聊天记录搬进工具描述 */
  ctx: boolean;
  /** 同时搬 <INFORMATION> 那一段（仅在 ctx 开启时有效） */
  ctxInfo: boolean;
}

/** 脚本侧实测出来的运行状态（给面板显示用，只读） */
export interface GuardStatus {
  /** 上一轮实际插入了多少字符噪声，0 = 没插 */
  lastNoise: number;
  /** 上一轮上下文搬运结果，英文短句：'moved:12' / 'skip:no-markers' / 'off' */
  lastCtx: string;
  /** 上一轮混淆了多少处敏感词 */
  lastObf: number;
  /** 反截断命中次数 */
  toolHits: number;
}

export interface GuardApi {
  get(): GuardState;
  /** 合并写入，返回写入后的完整状态 */
  set(patch: Partial<GuardState>): GuardState;
  /** 订阅变化（脚本侧改状态时面板要重画），返回取消订阅函数 */
  subscribe(fn: () => void): () => void;
  status(): GuardStatus;
  /** 恢复出厂默认 */
  reset(): void;
}

export interface GuardPanelProps {
  api: GuardApi;
  onClose: () => void;
  /** 窄屏判断，默认 '(max-width: 1000px)'，和 display-panel 一致 */
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

/* ───────── 选项表 ───────── */

/** 噪声强度的三个常用档：只是把滑杆一次性设过去，不存在单独的「档位」状态 */
const NOISE_PRESETS: Array<{ label: string; chars: number }> = [
  { label: '轻', chars: 3000 },
  { label: '中', chars: 10000 },
  { label: '重', chars: 20000 }
];

const NOISE_WHERE: Array<{ value: string; label: string }> = [
  { value: 'head', label: '开头' },
  { value: 'tail', label: '结尾' },
  { value: 'each-user', label: '每条用户消息前' }
];

const OB_MODE: Array<{ value: string; label: string }> = [
  { value: 'head', label: '只混淆头部' },
  { value: 'deep', label: '全量' }
];

/* ───────── 小工具 ───────── */

const info = (label: string, body: React.ReactNode): React.ReactNode => <InfoPopover label={'关于「' + label + '」'}>{body}</InfoPopover>;

/** 只读状态行：脚本上一轮实测出来的读数，面板只显示不改 */
function Status({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{children}</div>;
}

/** 显眼提醒：徽章自己一行，不跟说明文字挤在一起 */
function Warning({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><Badge tone={tone}>{children}</Badge></div>;
}

/** 把脚本侧的英文短状态翻译成面板里的一句话：脚本只报代号，文案归面板（改文案不用动脚本） */
function ctxText(s: string): string {
  if (s === 'off') { return '未启用'; }
  if (s.startsWith('moved:')) {
    const n = Number(s.slice('moved:'.length));
    return Number.isFinite(n) ? '上一轮搬了 ' + n + ' 个区段' : s;
  }
  if (s === 'skip:no-markers') { return '没找到 <CHAT_HISTORY> 标记，本轮按普通请求发送'; }
  if (s === 'skip:not-text') { return '消息里有图片或非纯文本，本轮不搬'; }
  return s || '还没有结果';
}

/** 只把 patch 里出现过的键恢复成 prev 里的旧值：撤销时不顺手推回别的设置 */
function revert(patch: Partial<GuardState>, prev: GuardState): Partial<GuardState> {
  const out: Partial<GuardState> = {};
  if (patch.tool !== undefined) { out.tool = prev.tool; }
  if (patch.noise !== undefined) { out.noise = prev.noise; }
  if (patch.noiseChars !== undefined) { out.noiseChars = prev.noiseChars; }
  if (patch.noiseWhere !== undefined) { out.noiseWhere = prev.noiseWhere; }
  if (patch.obfuscate !== undefined) { out.obfuscate = prev.obfuscate; }
  if (patch.obMode !== undefined) { out.obMode = prev.obMode; }
  if (patch.ctx !== undefined) { out.ctx = prev.ctx; }
  if (patch.ctxInfo !== undefined) { out.ctxInfo = prev.ctxInfo; }
  return out;
}

/** 四个分组共用的读写口：st 是当前状态快照，stt 是脚本侧读数，write 负责写回并给撤销提示 */
interface Ctx {
  st: GuardState;
  stt: GuardStatus;
  write: (patch: Partial<GuardState>, msg: string) => void;
}

/* ───────── 1. 工具调用反截断 ───────── */

function ToolSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="工具调用反截断">
      <SettingRow label="工具调用反截断"
        description="开启后模型把正文写进函数参数，而不是普通文本通道，绕过部分渠道的截断。代价是流式体验变差：正文攒到最后一次性出现。"
        control={<Switch checked={st.tool} aria-label="工具调用反截断" onCheckedChange={(v) => write({ tool: v }, v ? '已开启工具调用反截断' : '已关闭工具调用反截断')} />} />
      <Status>命中次数：{stt.toolHits} 次</Status>
    </SettingSection>
  );
}

/* ───────── 2. 噪声稀释 ───────── */

function NoiseSection({ st, stt, write }: Ctx): React.JSX.Element {
  /* 滑杆拖动时只改本地显示，松手（onValueCommit）才写回脚本：
     每挪一格就写一次盘既没必要，也会让脚本每帧重新拼一遍请求 */
  const [chars, setChars] = React.useState(st.noiseChars);
  React.useEffect(() => { setChars(st.noiseChars); }, [st.noiseChars]);
  return (
    <SettingSection title="噪声稀释" aside={info('噪声稀释', <>
      <p>噪声用希伯来字母和数字随机拼接，作用是稀释注意力、打乱可预测的提示词结构。</p>
      <p>它和预设里的噪声条目一样会占上下文，不是免费省 token。</p>
    </>)}>
      <SettingRow label="噪声稀释"
        description="每轮往请求里掺一段随机字符。会占上下文，具体见右上角 ⓘ。"
        control={<Switch checked={st.noise} aria-label="噪声稀释" onCheckedChange={(v) => write({ noise: v }, v ? '已开启噪声稀释' : '已关闭噪声稀释')} />} />
      <SettingRow label="强度" description="范围 1K～30K 字符，拖到哪就插多少"
        control={<span style={{ display: 'block', width: 240, maxWidth: '100%' }}>
          <Slider value={chars} min={1000} max={30000} step={1000} aria-label="噪声强度"
            format={(v) => v / 1000 + 'K 字符'}
            onValueChange={setChars}
            onValueCommit={(v) => write({ noiseChars: v }, '噪声强度已设为 ' + v / 1000 + 'K 字符')} />
        </span>} />
      <SettingRow label="快速预设" description="点一下直接把强度设成常用值，不用拖滑杆"
        control={<span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {NOISE_PRESETS.map((p) => (
            <Button key={p.chars} size="sm" {...(st.noiseChars === p.chars ? { variant: 'primary' as const } : {})}
              onClick={() => { setChars(p.chars); write({ noiseChars: p.chars }, '噪声强度已设为' + p.label + '档（' + p.chars / 1000 + 'K 字符）'); }}>
              {p.label} {p.chars / 1000}K
            </Button>
          ))}
        </span>} />
      <SettingRow label="插入位置" description="噪声放在请求的哪一头"
        control={<Segmented label="插入位置" size="sm" options={NOISE_WHERE} value={st.noiseWhere}
          onValueChange={(v) => write({ noiseWhere: v as GuardState['noiseWhere'] }, '噪声插入位置已改为「' + (NOISE_WHERE.find((x) => x.value === v)?.label || v) + '」')} />} />
      <Status>{stt.lastNoise > 0 ? '上一轮实际插入 ' + stt.lastNoise + ' 字符噪声' : '上一轮没有插噪声'}</Status>
    </SettingSection>
  );
}

/* ───────── 3. 防路由混淆 ───────── */

function ObfSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="防路由混淆">
      <SettingRow label="防路由混淆"
        description="往分类器敏感词里插 HTML 注释，降低被归到敏感类目的概率。"
        control={<Switch checked={st.obfuscate} aria-label="防路由混淆" onCheckedChange={(v) => write({ obfuscate: v }, v ? '已开启防路由混淆' : '已关闭防路由混淆')} />} />
      <SettingRow label="强度" description="只混淆头部 = 只处理开头一段；全量 = 整段都插"
        control={<Segmented label="混淆强度" size="sm" options={OB_MODE} value={st.obMode}
          onValueChange={(v) => write({ obMode: v as GuardState['obMode'] }, '混淆强度已改为「' + (v === 'deep' ? '全量' : '只混淆头部') + '」')} />} />
      <Status>上一轮混淆 {stt.lastObf} 处</Status>
      <Warning tone="warning">仅对 Gemini 系渠道建议开启</Warning>
    </SettingSection>
  );
}

/* ───────── 4. 工具声明式上下文 ───────── */

function CtxSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="工具声明式上下文" aside={info('工具声明式上下文', <>
      <p>把角色卡与聊天记录序列化后塞进一个永不调用的工具描述里，让它们从 messages 数组里消失。</p>
      <p>失败会自动退回普通发送，不会把请求卡死。</p>
    </>)}>
      <SettingRow label="工具声明式上下文"
        description="把角色卡和聊天记录搬进工具描述里（原理见右上角 ⓘ）。"
        control={<Switch checked={st.ctx} aria-label="工具声明式上下文" onCheckedChange={(v) => write({ ctx: v }, v ? '已开启工具声明式上下文' : '已关闭工具声明式上下文')} />} />
      <SettingRow label="同时搬运背景设定区"
        description="连 <INFORMATION> 那一段也一起搬；只在上面开关打开时有效。"
        control={<Switch checked={st.ctxInfo} disabled={!st.ctx} aria-label="同时搬运背景设定区"
          onCheckedChange={(v) => write({ ctxInfo: v }, v ? '已同时搬运背景设定区' : '不再搬运背景设定区')} />} />
      <Status>上一轮：{ctxText(stt.lastCtx)}</Status>
      <Warning tone="danger">实验性：搬错会导致空回复</Warning>
    </SettingSection>
  );
}

/* ───────── 面板 ───────── */

export function GuardPanel({ api, onClose, compactQuery = '(max-width: 1000px)', defaultSize = { w: 760, h: 720 } }: GuardPanelProps): React.JSX.Element {
  /* api 内部怎么存不管：每次渲染重新读一份快照，脚本侧改了状态就靠 subscribe 把这一份推新 */
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => api.subscribe(() => force()), [api]);
  const st = api.get();
  const stt = api.status();
  const compact = useMedia(compactQuery);
  const [tab, setTab] = React.useState('tool');
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => void; n: number } | null>(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const notify = (msg: string, undo?: () => void): void => {
    setToast((t) => ({ msg, ...(undo ? { undo } : {}), n: (t?.n || 0) + 1 }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5000);
  };
  /* 改一项：先记下改前的值，改完给一条可撤销的提示条 */
  const write = (patch: Partial<GuardState>, msg: string): void => {
    const before = revert(patch, api.get());
    api.set(patch);
    force();   /* 不指望每一份实现写完都回调订阅：自己再推一帧，面板立刻显示新值 */
    notify(msg, () => { api.set(before); force(); });
  };
  const reset = (): void => {
    const before = api.get();
    api.reset();
    force();
    notify('已恢复本页默认', () => { api.set(before); force(); notify('已撤销'); });
  };
  const ctx: Ctx = { st, stt, write };
  const cols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignContent: 'start' } as const;
  return (
    <Panel title="防护" footer={<Button variant="ghost" onClick={reset}>恢复本页默认</Button>} onClose={onClose} defaultSize={defaultSize}>
      {compact ? (
        <Tabs label="防护设置" swipe sticky value={tab} onValueChange={setTab} items={[
          { value: 'tool', label: '反截断', content: <div style={cols}><ToolSection {...ctx} /></div> },
          { value: 'noise', label: '噪声', content: <div style={cols}><NoiseSection {...ctx} /></div> },
          { value: 'obf', label: '混淆', content: <div style={cols}><ObfSection {...ctx} /></div> },
          { value: 'ctx', label: '上下文', content: <div style={cols}><CtxSection {...ctx} /></div> }
        ]} />
      ) : (
        <div style={cols}>
          <ToolSection {...ctx} />
          <NoiseSection {...ctx} />
          <ObfSection {...ctx} />
          <CtxSection {...ctx} />
        </div>
      )}
      {toast ? <Toast key={toast.n} message={toast.msg} {...(toast.undo ? { action: '撤销', onAction: () => { const u = toast.undo!; setToast(null); u(); } } : {})} onClose={() => setToast(null)} /> : null}
    </Panel>
  );
}
