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
  /** 上一轮上下文搬运结果，英文代号：'moved:12' / 'skip:no-markers' / 'off' … */
  lastCtx: string;
  /** 上一轮打断了几个敏感词（按出现次数） */
  lastObf: number;
  /** 累计有几次回复是模型用函数交回来的 */
  toolHits: number;
  /** 上一轮工具反截断：'on' / 'off' / 'skip:no-tools' / 'skip:tool-choice' */
  lastTool?: string;
  /** 上一轮回复模型有没有用函数交付：'relayed' / 'idle' / ''（还没有回复） */
  lastRelay?: string;
  /** 上一轮发送时四个开关各是什么状态（区分「开了还没发过」和「发过了但没做事」） */
  lastOn?: Partial<Record<'tool' | 'noise' | 'obfuscate' | 'ctx', boolean>> | null;
}

export interface GuardApi {
  get(): GuardState;
  /** 合并写入，返回写入后的完整状态 */
  set(patch: Partial<GuardState>): GuardState;
  /** 订阅变化（脚本侧改状态时面板要重画），返回取消订阅函数 */
  subscribe(fn: () => void): () => void;
  status(): GuardStatus;
  /** 恢复出厂默认（四项全部） */
  reset(): void;
  /** 出厂默认值；有它时手机上的「恢复本页默认」只恢复当前页签那几项 */
  defaults?(): GuardState;
}

export interface GuardPanelProps {
  api: GuardApi;
  onClose: () => void;
  /** 窄屏判断，默认 '(max-width: 1000px)'，和 display-panel 一致 */
  compactQuery?: string;
  defaultSize?: { w: number; h: number };
}

/* ───────── 选项表 ───────── */

/** 噪声量的三个常用档：只是把滑杆一次性设过去，不存在单独的「档位」状态 */
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

/* 「强度」两处意思不同（噪声是量、混淆是范围），2026-11-19 审计后分开叫 */
const OB_MODE: Array<{ value: string; label: string }> = [
  { value: 'head', label: '只处理设定' },
  { value: 'deep', label: '全部消息' }
];

/** 每个页签管哪几项：手机上「恢复本页默认」只动这几项 */
type SectionId = 'tool' | 'noise' | 'obf' | 'ctx';
const FIELDS: Record<SectionId, Array<keyof GuardState>> = {
  tool: ['tool'],
  noise: ['noise', 'noiseChars', 'noiseWhere'],
  obf: ['obfuscate', 'obMode'],
  ctx: ['ctx', 'ctxInfo']
};

/* ───────── 小工具 ───────── */

const info = (label: string, body: React.ReactNode): React.ReactNode => <InfoPopover label={'关于「' + label + '」'}>{body}</InfoPopover>;

/** 只读状态行：脚本上一轮实测出来的读数，面板只显示不改 */
function Status({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div data-guard-status="" style={{ color: 'var(--k-on-muted)', fontSize: 'var(--k-fs-sm)' }}>{children}</div>;
}

/** 显眼提醒：徽章自己一行，不跟说明文字挤在一起 */
function Warning({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }): React.JSX.Element {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><Badge tone={tone}>{children}</Badge></div>;
}

/** 状态行的共同前两步：没开 → 「未开启」；开了但上一轮发送时还没开（或还没发过） → 「下一轮生效」 */
function phase(on: boolean, stt: GuardStatus, key: 'tool' | 'noise' | 'obfuscate' | 'ctx'): string | null {
  if (!on) { return '未开启'; }
  if (!stt.lastOn || !stt.lastOn[key]) { return '已开启，发下一条消息时生效'; }
  return null;
}

/** 把脚本侧的英文代号翻译成面板里的一句话：脚本只报代号，文案归面板（改文案不用动脚本） */
function ctxText(s: string): string {
  if (s.startsWith('moved:')) {
    const n = Number(s.slice('moved:'.length));
    return Number.isFinite(n) ? '上一轮搬了 ' + n + ' 个区段' : '上一轮已搬运';
  }
  switch (s) {
    case 'skip:no-tools': return '上一轮没搬：当前渠道不把工具发给模型（Azure、Gemini 出图、Gemma 3），已按普通方式发送';
    case 'skip:no-markers': return '上一轮没搬：预设里没找到 <CHAT_HISTORY> 标记，已按普通方式发送';
    case 'skip:empty-context': return '上一轮没搬：标记之间是空的，已按普通方式发送';
    case 'skip:no-kept': return '上一轮没搬：搬走后就没有写作要求了，已按普通方式发送';
    case 'skip:not-text': return '上一轮没搬：消息里有图片等附件，已按普通方式发送';
    case 'skip:no-messages': return '上一轮没搬：请求里没有消息';
    default: return s.startsWith('skip:') ? '上一轮没搬（' + s.slice(5) + '），已按普通方式发送' : '上一轮没搬';
  }
}

function toolText(stt: GuardStatus): string {
  const total = stt.toolHits > 0 ? '；累计 ' + stt.toolHits + ' 次用函数收到回复' : '';
  switch (stt.lastTool) {
    case 'skip:no-tools': return '上一轮没用上：当前渠道不把工具发给模型（Azure、Gemini 出图、Gemma 3）' + total;
    case 'skip:tool-choice': return '上一轮没用上：别的插件指定了工具调用方式' + total;
    default: break;
  }
  if (stt.lastRelay === 'relayed') { return '上一轮模型用函数交回了正文' + total; }
  if (stt.lastRelay === 'idle') { return '上一轮模型没用函数，正文按普通方式收到' + total; }
  return '上一轮已请求模型用函数交付' + total;
}

/** 只把 patch 里出现过的键恢复成 prev 里的旧值：撤销时不顺手推回别的设置 */
function revert(patch: Partial<GuardState>, prev: GuardState): Partial<GuardState> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as Array<keyof GuardState>) { out[key] = prev[key]; }
  return out as Partial<GuardState>;
}

/** 四个分组共用的读写口：st 是当前状态快照，stt 是脚本侧读数，write 负责写回并给撤销提示 */
interface Ctx {
  st: GuardState;
  stt: GuardStatus;
  write: (patch: Partial<GuardState>, msg: string) => void;
}

/* 分组标题就是功能名，组里第一行只写「开启」——2026-11-19 审计：标题和第一行同名，读起来像重复了一遍。
   子设置在总开关关着时变灰（和「同时搬运背景设定区」一致），免得以为调了就生效。 */

/* ───────── 1. 工具调用反截断 ───────── */

function ToolSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="工具调用反截断" aside={info('工具调用反截断', <>
      <p>有些渠道会把较长的普通回复从中间截断。开启后会让模型把正文作为函数参数交回来，前端再把它还原成正常的消息。</p>
      <p>模型或渠道不支持函数调用时会自动按普通方式收回复；连续几次都没用上会提醒你关掉。</p>
    </>)}>
      <SettingRow label="开启"
        description="回复经常写到一半就断掉时打开。代价：正文会在最后一次性出现，看不到逐字输出。"
        control={<Switch checked={st.tool} aria-label="工具调用反截断" onCheckedChange={(v) => write({ tool: v }, v ? '已开启工具调用反截断' : '已关闭工具调用反截断')} />} />
      <Status>{phase(st.tool, stt, 'tool') ?? toolText(stt)}</Status>
    </SettingSection>
  );
}

/* ───────── 2. 噪声稀释 ───────── */

function NoiseSection({ st, stt, write }: Ctx): React.JSX.Element {
  /* 滑杆拖动时只改本地显示，松手（onValueCommit）才写回脚本：
     每挪一格就写一次盘既没必要，也会让脚本每帧重新拼一遍请求 */
  const [chars, setChars] = React.useState(st.noiseChars);
  React.useEffect(() => { setChars(st.noiseChars); }, [st.noiseChars]);
  const off = !st.noise;
  return (
    <SettingSection title="噪声稀释" aside={info('噪声稀释', <>
      <p>噪声用希伯来字母和数字随机拼接，作用是稀释注意力、打乱可预测的提示词结构。</p>
      <p>它和预设里的噪声条目一样会占上下文，不是免费的：噪声量越大，每轮花的 token 越多。</p>
    </>)}>
      <SettingRow label="开启"
        description="回复常被拒绝、或被换成千篇一律的套话时可以试试。每轮会往请求里掺一段随机字符，多占一些上下文。"
        control={<Switch checked={st.noise} aria-label="噪声稀释" onCheckedChange={(v) => write({ noise: v }, v ? '已开启噪声稀释' : '已关闭噪声稀释')} />} />
      <SettingRow label="噪声量" description="1K～30K 字符：点常用档，或拖下面的滑杆"
        control={<span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {NOISE_PRESETS.map((p) => (
            <Button key={p.chars} size="sm" disabled={off} {...(st.noiseChars === p.chars ? { variant: 'primary' as const } : {})}
              onClick={() => { setChars(p.chars); write({ noiseChars: p.chars }, '噪声量已设为' + p.label + '档（' + p.chars / 1000 + 'K 字符）'); }}>
              {p.label} {p.chars / 1000}K
            </Button>
          ))}
        </span>} />
      {/* 滑杆单独占一整行：放在设置行右侧时手机上只有半宽、旁边一大片空白（2026-11-19 审计） */}
      <div style={{ maxWidth: 480 }}>
        <Slider value={chars} min={1000} max={30000} step={1000} aria-label="噪声量" disabled={off}
          format={(v) => v / 1000 + 'K 字符'}
          onValueChange={setChars}
          onValueCommit={(v) => write({ noiseChars: v }, '噪声量已设为 ' + v / 1000 + 'K 字符')} />
      </div>
      <SettingRow label="插入位置" description="噪声放在请求的哪个位置"
        control={<Segmented label="插入位置" size="sm" options={NOISE_WHERE} value={st.noiseWhere} disabled={off}
          onValueChange={(v) => write({ noiseWhere: v as GuardState['noiseWhere'] }, '噪声插入位置已改为「' + (NOISE_WHERE.find((x) => x.value === v)?.label || v) + '」')} />} />
      <Status>{phase(st.noise, stt, 'noise') ?? (stt.lastNoise > 0 ? '上一轮插入了 ' + stt.lastNoise + ' 字符噪声' : '上一轮没有插噪声')}</Status>
    </SettingSection>
  );
}

/* ───────── 3. 防路由混淆 ───────── */

function ObfSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="防路由混淆" aside={info('防路由混淆', <>
      <p>部分渠道会先用一个审核分类器扫一遍请求，看到 jailbreak、system prompt、CRITICAL INSTRUCTIONS 之类的词就把请求转去更严格的模型或直接拦下。</p>
      <p>开启后在这些词中间插一段 HTML 注释，把词拆开；模型读到的意思不变。只拆完整的词，DANGER 这种长词里的 DAN 不会被动。</p>
    </>)}>
      <SettingRow label="开启"
        description="Gemini 系渠道把正常剧情误判成违规、回复被拦或明显变保守时打开；其它渠道一般用不上。"
        control={<Switch checked={st.obfuscate} aria-label="防路由混淆" onCheckedChange={(v) => write({ obfuscate: v }, v ? '已开启防路由混淆' : '已关闭防路由混淆')} />} />
      <SettingRow label="处理范围" description="只处理设定：第一条用户消息之前的系统提示与角色设定；全部消息：连聊天记录也一起处理"
        control={<Segmented label="处理范围" size="sm" options={OB_MODE} value={st.obMode} disabled={!st.obfuscate}
          onValueChange={(v) => write({ obMode: v as GuardState['obMode'] }, '混淆范围已改为「' + (v === 'deep' ? '全部消息' : '只处理设定') + '」')} />} />
      <Status>{phase(st.obfuscate, stt, 'obfuscate') ?? (stt.lastObf > 0 ? '上一轮拆开了 ' + stt.lastObf + ' 个敏感词' : '上一轮没有遇到要拆的词')}</Status>
      <Warning tone="warning">仅建议 Gemini 系渠道开启</Warning>
    </SettingSection>
  );
}

/* ───────── 4. 工具声明式上下文 ───────── */

function CtxSection({ st, stt, write }: Ctx): React.JSX.Element {
  return (
    <SettingSection title="工具声明式上下文" aside={info('工具声明式上下文', <>
      <p>把预设里 &lt;CHAT_HISTORY&gt;（聊天记录）和 &lt;INFORMATION&gt;（角色与世界设定）两段标记之间的内容，从消息列表里挪进一个工具的说明文字里，并在请求里留一句话告诉模型资料在哪。</p>
      <p>找不到标记、消息里有图片、或渠道不把工具发给模型（Azure、Gemini 出图、Gemma 3）时自动按普通方式发送，不会卡住。</p>
    </>)}>
      <SettingRow label="开启"
        description="实验性。聊天记录很长、模型开始忽略设定或答非所问时可以试试；需要预设里带 <CHAT_HISTORY> 标记。"
        control={<Switch checked={st.ctx} aria-label="工具声明式上下文" onCheckedChange={(v) => write({ ctx: v }, v ? '已开启工具声明式上下文' : '已关闭工具声明式上下文')} />} />
      <SettingRow label="同时搬运背景设定区"
        description="角色与世界设定（<INFORMATION> 那一段）也一起挪走"
        control={<Switch checked={st.ctxInfo} disabled={!st.ctx} aria-label="同时搬运背景设定区"
          onCheckedChange={(v) => write({ ctxInfo: v }, v ? '已同时搬运背景设定区' : '不再搬运背景设定区')} />} />
      <Status>{phase(st.ctx, stt, 'ctx') ?? ctxText(stt.lastCtx)}</Status>
      <Warning tone="danger">实验性：出现空回复就关掉</Warning>
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
  /* 电脑上四项排在同一页，按钮恢复全部；手机上一页一项，只恢复当前页签那几项（2026-11-19 审计：
     以前手机上点「恢复本页默认」会把另外三页也一起关掉） */
  const onlyTab = compact && typeof api.defaults === 'function';
  const reset = (): void => {
    const before = api.get();
    if (onlyTab) {
      const def = api.defaults!();
      const patch: Record<string, unknown> = {};
      for (const key of FIELDS[tab as SectionId] || []) { patch[key] = def[key]; }
      api.set(patch as Partial<GuardState>);
    } else {
      api.reset();
    }
    force();
    notify(onlyTab ? '已恢复本页默认' : '已全部恢复默认', () => { api.set(before); force(); notify('已撤销'); });
  };
  const ctx: Ctx = { st, stt, write };
  const cols = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--k-gap-section)', alignContent: 'start' } as const;
  return (
    <Panel title="防护" footer={<Button variant="ghost" onClick={reset}>{onlyTab ? '恢复本页默认' : '全部恢复默认'}</Button>} onClose={onClose} defaultSize={defaultSize}>
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
