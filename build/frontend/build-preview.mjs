#!/usr/bin/env node
/** 打包预览页：design/previews/<名>/main.tsx → preview.js（单文件，可直接用浏览器打开 index.html） */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { withRadixPatches } from './radix-patches.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const name of ['suiguang', 'preset-panel', 'message', 'display-panel', 'toolbox', 'guide']) {
  const dir = path.join(ROOT, 'design/previews', name);
  const r = await esbuild.build(withRadixPatches({
    entryPoints: [path.join(dir, 'main.tsx')], outfile: path.join(dir, 'preview.js'), bundle: true, format: 'iife', minify: true,
    target: ['es2019', 'chrome108', 'safari16'], jsx: 'automatic', legalComments: 'none', metafile: true,
    loader: { '.css': 'text', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning'
  }));
  console.log('[预览] design/previews/' + name + '/preview.js  ' + Math.round(Object.values(r.metafile.outputs)[0].bytes / 1024) + 'KB');
}
