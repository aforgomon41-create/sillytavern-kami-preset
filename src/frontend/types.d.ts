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
