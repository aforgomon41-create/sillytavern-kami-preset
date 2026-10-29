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
