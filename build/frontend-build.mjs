#!/usr/bin/env node
/**
 * 新前端打包：node build/frontend-build.mjs [--watch]
 *   src/frontend/runtime/index.ts → .cache/frontend/runtime.js（IIFE，含 React + Radix + 设计系统 + 皮肤引擎）
 *   test/frontend/playground/main.tsx → .cache/frontend/playground.js（开发展示台）
 * CSS 文件作为文本打包（import css from './x.css'），由皮肤引擎按层叠顺序注入 Shadow DOM。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { withRadixPatches } from './frontend/radix-patches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.cache', 'frontend');
const common = {
  bundle: true, format: 'iife', target: ['es2019', 'chrome108', 'safari16'], jsx: 'automatic', legalComments: 'none',
  loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning'
};
const entries = [
  { entryPoints: [path.join(ROOT, 'src/frontend/runtime/index.ts')], outfile: path.join(OUT, 'runtime.js'), minify: true },
  { entryPoints: [path.join(ROOT, 'test/frontend/playground/main.tsx')], outfile: path.join(OUT, 'playground.js'), minify: false, sourcemap: 'inline' }
];
const watch = process.argv.includes('--watch');
for (const e of entries) {
  const opts = withRadixPatches(Object.assign({}, common, e));
  if (watch) { const ctx = await esbuild.context(opts); await ctx.watch(); }
  else {
    const r = await esbuild.build(Object.assign(opts, { metafile: true }));
    const bytes = Object.values(r.metafile.outputs)[0].bytes;
    console.log('[新前端] ' + path.relative(ROOT, e.outfile) + '  ' + Math.round(bytes / 1024) + 'KB');
  }
}
if (watch) { console.log('[新前端] 监听中……'); }
