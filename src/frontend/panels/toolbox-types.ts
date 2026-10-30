/**
 * 工具箱面板（新前端）与旧脚本之间的读写桥类型。
 * 每个桥都是「快照 + 动作 + 变化订阅」：面板渲染时读 get()，操作调动作，脚本那边有变化就通知订阅者。
 * 逻辑与状态全部留在旧脚本里（60 号压缩 / 搜索，40 号其他功能 / 继承，70 号远程更新），面板只是界面。
 */

/** 变化源：version() 每次有变化就变，subscribe 返回退订函数 */
export interface Live { version(): number; subscribe(fn: () => void): () => void }

export type Role = 'system' | 'user' | 'assistant';
export interface PromptEntry { role: Role; content: string }
export interface PromptSet { head: PromptEntry[]; taskRole: Role; task: string; tail: PromptEntry[] }

/** 模型配置 + 提示词模板（压缩、手动搜索各一份；60 号 _llm-settings.js 的 createKamiLlmBridge） */
export interface LlmState {
  mode: 'tavern' | 'custom';
  /** 跟随酒馆时选的连接配置名；'' = 当前连接 */
  pick: string;
  profiles: Array<{ name: string; model: string }>;
  configs: string[];
  current: { name: string; source: string; apiurl: string; key: string; model: string } | null;
  models: string[] | null;
  fetching: boolean;
  prompts: PromptSet;
  templates: string[];
  template: string;
}
export interface LlmApi {
  get(): LlmState;
  mode(m: 'tavern' | 'custom'): void;
  pick(name: string): void;
  selectConfig(name: string): void;
  input(field: 'source' | 'apiurl' | 'key' | 'model', value: string): void;
  saveConfig(name: string): void;
  deleteConfig(): void;
  fetchModels(): Promise<unknown>;
  prompt(list: 'head' | 'tail' | 'task', i: number, field: 'role' | 'content', value: string): void;
  addPrompt(list: 'head' | 'tail'): void;
  removePrompt(list: 'head' | 'tail', i: number): void;
  resetTask(): void;
  switchTemplate(name: string): void;
  saveTemplate(name: string): void;
  deleteTemplate(): void;
}

export interface CompressState {
  roll: { ok: true; enabled: boolean; depth: number } | { ok: false; error: string };
  grandOn: boolean; threshold: number; keep: number; chunk: number;
  pins: number[]; maxFloor: number;
  blocks: Array<{ from: number; to: number; depth: number | null; text: string; suspect: boolean }>;
  pending: Array<{ from: number; to: number }>;
  orphans: number; error: string | null; notice: string[]; lorebook: string;
  entry: { ok: true; enabled: boolean; name: string } | { ok: false; error: string };
  measured: number;
  pipeline: { running: boolean; done: number; total: number };
  lastError: string | null;
}
export interface CompressApi {
  get(): CompressState;
  setRoll(on: boolean): Promise<unknown>;
  setGrand(on: boolean): Promise<unknown>;
  setNumber(key: 'depth' | 'threshold' | 'keep' | 'chunk', value: number): Promise<unknown>;
  run(): Promise<unknown>;
  unhideAll(): Promise<unknown>;
  clearData(): Promise<unknown>;
  addPin(n: number | string): Promise<unknown>;
  removePin(n: number): Promise<unknown>;
  refresh(reason?: string): Promise<unknown>;
  repairOrphans(): Promise<unknown>;
  setEntry(on: boolean): Promise<unknown>;
}

export interface SearchProvider { id: string; label: string; note: string; url: string; keyUrl: string; secret: string; localKey: boolean; endpoint: boolean; endpointKey: string }
export type SearchLimits = Record<string, number>;
export interface ProbeState { phase: string; state: string; running: boolean; message: string; queries: number; sources: Array<{ url: string; title: string }>; testedAt?: string | null }
export interface SearchState {
  enabled: boolean; mode: 'native' | 'service'; provider: string; providers: SearchProvider[];
  endpoints: { searxng: string; koboldcpp: string }; wikiLanguage: string;
  limits: SearchLimits; manualLimits: SearchLimits;
  hasSecret: boolean; message: string; running: boolean; manualRunning: boolean;
  system: string; defaultSystem: string; shortcut: boolean; probe: ProbeState | null;
}
export interface SearchApi {
  get(): SearchState;
  configure(patch: Partial<{ enabled: boolean; mode: string; provider: string; endpoints: Record<string, string>; wikiLanguage: string; system: string }>): void;
  limits(manual: boolean, patch: SearchLimits): SearchLimits;
  saveKey(value: string): Promise<boolean>;
  clearKey(): Promise<boolean>;
  refreshSecrets(): Promise<unknown>;
  probe(): Promise<unknown>;
  cancelProbe(): void;
}
export interface SearchProgress { phase: string; message: string; current: number; total: number; running: boolean }
export interface ManualApi {
  llm: LlmApi;
  lastTopic(v?: string): string;
  setShortcut(v: boolean): void;
  search(topic: string): Promise<unknown>;
  cancel(reason?: string): void;
  subscribeProgress(fn: (p: SearchProgress) => void): () => void;
  status(): { enabled: boolean; mode: string; running: boolean; manualRunning: boolean };
}
/** 60 号 KamiToolbox.bridge() */
export interface ToolboxBridge extends Live {
  compress: CompressApi;
  llm: LlmApi;
  search: SearchApi | null;
  manual: ManualApi | null;
  copy?: CompressCopy;
}

/** 40 号 KamiPreset.toolsBridge()：标签处理 / 常驻附加指令 / 导出纯净正文 */
export interface OtherState {
  tag: { mode: string; all: boolean; custom: string; stat: string; api: boolean };
  god: { on: boolean; text: string };
}
export type TagScan =
  | { ok: false; message: string }
  | { ok: true; nothing: true; message: string }
  | { ok: true; nothing?: undefined; token: number; floor: number; groups: Array<{ lead: string; rows: Array<{ text: string; label: string }> }>; stray: number };
export interface OtherApi extends Live {
  copy: { tag: Record<string, string>; god: Record<string, string>; exp: Record<string, string>; inherit: Record<string, string>; modes: Array<{ id: string; label: string }> };
  get(): OtherState;
  setTagMode(id: string): void;
  setTagAll(on: boolean): void;
  setTagCustom(text: string): string;
  scanTag(): TagScan;
  applyTag(token: number): Promise<boolean>;
  setGod(on: boolean): boolean;
  setGodText(text: string): void;
  exportChat(from: string, to: string, aiOnly: boolean, onProgress?: (i: number, n: number) => void): Promise<{ ok: boolean; text: string }>;
}

/** 40 号 KamiPreset.updateBridge()：版本信息 / 检查更新 / 继承旧预设 */
export interface UpdateState {
  rows: Array<[string, string]>;
  running: boolean; repo: string; lastChecked: string; busy: boolean;
  inheritFrom: string; inheritAt: string;
}
export interface UpdateApi extends Live {
  copy: Record<string, string>;
  get(): UpdateState;
  check(): Promise<string>;
  presets(): { names: string[]; current: string };
  isKami(name: string): boolean;
  inherit(name: string): Promise<{ ok: boolean; text: string }>;
}

/** 70 号进度状态机的 viewOf() 结果（_update-progress.js） */
export interface UpdateView {
  status: string; stage: string; title: string; percent: number | null;
  bytesText: string; detail: string; retryText: string; canClose: boolean; canRetry: boolean;
}
/** 70 号合并计划里要裁决的一项 */
export interface MergeConflict { key: string; id?: string; name?: string; kind?: string; fields?: string[]; choice?: 'mine' | 'next' }
export interface MergePlan { conflicts: MergeConflict[]; degraded?: boolean; inherit?: boolean }

/** 压缩页文案（60 号 COPY；结构同 design/copy/compress-copy.polished.json） */
export type CompressCopy = typeof import('../../../design/copy/compress-copy.polished.json');
