/** 构建时 CSS 文件作为文本打包（esbuild loader: text） */
declare module '*.css' {
  const text: string;
  export default text;
}
