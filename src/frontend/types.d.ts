/** 构建时 CSS 文件作为文本打包（esbuild loader: text） */
declare module '*.css' {
  const text: string;
  export default text;
}

/** 预览页把 PNG 打成 data: URL */
declare module '*.png' {
  const url: string;
  export default url;
}

/** 旧系统的网络搜索纯函数（src/scripts/_search-pure.js，无类型）：新消息前端复用它解析 <search_results>，保证读写格式只有一份实现 */
declare module '*/_search-pure.js' {
  export function readWebSearchRecords(text: string): unknown[];
}

/** 旧系统的搜索限额字段（同上；工具箱预览按它生成限额控件，范围与默认值只有一份） */
declare module '*/_search-pure.js' {
  export function webSearchLimitFields(): Array<{ key: string; label: string; min: number; max: number; auto: number; manual: number }>;
}

/** 搜索来源目录（src/scripts/_search-providers.js）：工具箱的「服务」下拉与每家的说明、链接都从这里来 */
declare module '*/_search-providers.js' {
  export interface WebSearchProvider { id: string; label: string; url: string; note: string; secret?: string; localKey?: boolean; endpoint?: boolean; endpointKey?: string; keyUrl?: string }
  export function webSearchProviders(): WebSearchProvider[];
}

/** 远程更新进度的纯状态机（src/scripts/_update-progress.js）：工具箱「更新」页的进度弹窗直接用它，阶段与文案只有一份 */
declare module '*/_update-progress.js' {
  export interface UpdateProgress { stage: string; status: 'running' | 'failed' | 'done'; received: number; total: number | null; attempts: number; running: boolean }
  export interface UpdateView { stage: string; status: string; stageText: string; detail: string; percent: number | null; indeterminate: boolean; bytesText: string; canRetry: boolean; canClose: boolean; title: string; error: string; attempts: number; retryText: string }
  export const UPDATE_COPY: Record<string, string>;
  export const UPDATE_STAGES: Array<{ id: string; copy: string }>;
  export function newProgress(now?: number): UpdateProgress;
  export function beginProgress(p: UpdateProgress, now?: number): boolean;
  export function enterStage(p: UpdateProgress, id: string, now?: number): boolean;
  export function setTotal(p: UpdateProgress, total: number, source?: string): boolean;
  export function addBytes(p: UpdateProgress, n: number): number;
  export function failProgress(p: UpdateProgress, err: string, now?: number): UpdateProgress;
  export function doneProgress(p: UpdateProgress, v: string, now?: number): UpdateProgress;
  export function viewOf(p: UpdateProgress): UpdateView;
}


/** 自定义文风的文案（src/scripts/_custom-style-ui.js 的 CUSTOM_STYLE_COPY，唯一真相；新面板只读它的文案） */
declare module '*/_custom-style-ui.js' {
  export const CUSTOM_STYLE_COPY: Record<string, string>;
}
