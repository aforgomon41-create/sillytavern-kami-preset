#!/usr/bin/env node
/**
 * 跑新前端的 TypeScript 单测：node build/run-ts-tests.mjs [文件过滤]
 * 用 esbuild 把 test/frontend/*.test.ts 各自打成临时 ESM，再交给 node:test。
 * 不依赖 Node 的类型剥离特性，旧一点的 Node 也能跑。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'test', 'frontend');
const filter = process.argv[2] || '';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.test.ts') && f.includes(filter)).map((f) => path.join(DIR, f));
if (!files.length) { console.log('没有匹配的测试'); process.exit(0); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kami-ts-tests-'));
const built = [];
for (const f of files) {
  const o = path.join(out, path.basename(f).replace(/\.ts$/, '.mjs'));
  await esbuild.build({ entryPoints: [f], bundle: true, platform: 'node', format: 'esm', target: 'node18', outfile: o, logLevel: 'silent', sourcemap: 'inline' });
  built.push(o);
}
const r = spawnSync(process.execPath, ['--test', ...built], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
process.exit(r.status === null ? 1 : r.status);
