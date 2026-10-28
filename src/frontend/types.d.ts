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
