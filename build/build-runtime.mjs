#!/usr/bin/env node
/**
 * 把 src/runtime 打成单文件 IIFE，供「00-运行库.js」内联。
 *
 * 为什么需要这一步：
 *   酒馆脚本是不带模块系统的纯文本（一个 content 字段），不能 import；
 *   所以 React/Radix 必须先打成自执行函数，再作为字符串塞进脚本。
 *
 * 产物：src/runtime/bundle.js（与脚本一起提交，构建脚本直接读它）
 * 用法：node build/build-runtime.mjs [--check]
 *   --check  只报告会不会变，不写盘（给守卫用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { uiCss } from './kami-doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src', 'runtime', 'index.js');
const OUT = path.join(ROOT, 'src', 'runtime', 'bundle.js');
const CHECK = process.argv.includes('--check');

const result = esbuild.buildSync({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  minify: true,
  legalComments: 'none',
  write: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    /* 组件基础样式在构建期算好、以字符串字面量注入 —— 运行库是唯一一份，面板不再各自内联 foundation.css */
    __KAMI_UI_CSS_JSON__: JSON.stringify(uiCss(ROOT))
  },
  logLevel: 'silent'
});

let code = result.outputFiles[0].text;

/* 尾巴上加一行来源标记，方便在酒馆里认版本 */
code = code + '\n/* kami-runtime v1 */\n';

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (CHECK) {
  if (prev === code) { console.log('运行库产物已是最新（' + Math.round(code.length / 1024) + 'KB）'); process.exit(0); }
  console.log('运行库产物过期，请运行 node build/build-runtime.mjs');
  process.exit(1);
}

if (prev !== code) {
  fs.writeFileSync(OUT, code, 'utf8');
  console.log('运行库已打包：' + Math.round(code.length / 1024) + 'KB → src/runtime/bundle.js');
} else {
  console.log('运行库无变化（' + Math.round(code.length / 1024) + 'KB）');
}
