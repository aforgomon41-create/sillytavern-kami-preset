#!/usr/bin/env node
/**
 * 「🧩 运行库」接线守卫（只读产物）
 * ------------------------------------------------------------
 * 运行库是**所有面板的地基**：它挂了，面板全部打不开。这个守卫钉四件事：
 *   ① 产物里有「运行库」脚本，且**默认开启**
 *   ② 它排在整个脚本树的**第一位**（面板启动时就要拿到 React）
 *   ③ 内容里真的是打包好的新运行库（KamiRuntimeNext + React 特征），不是没展开的空壳；旧运行库 KamiRuntime 已删（2026-11-04）
 *   ④ 没有脚本还在用旧组件核心 createKamiUi / 旧运行库 KamiRuntime（用了就会在运行时报 is not defined）
 *
 * 用法：node build/verify-runtime.mjs <产物路径>
 */
import { flattenScriptTrees } from './kami-doc.mjs';
import { currentBranchTag, parseArtifactName } from './branch-tag.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv[2];
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let p = arg;
if (!p) {
  const dir = path.join(ROOT, 'dist');
  const tag = currentBranchTag(ROOT);   /* 只挑当前支线的产物（main 产物不带后缀） */
  const files = fs.readdirSync(dir).filter(f => { const a = parseArtifactName(f); return !!a && a.branch === tag; })
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!files.length) { console.log('dist 里没有产物'); process.exit(1); }
  p = path.join(dir, files[0].f);
}

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const trees = preset.extensions.tavern_helper.scripts || [];
const flat = flattenScriptTrees(trees);
let bad = 0;
const ok = (cond, label, extra) => { if (!cond) { bad++; } console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra)); };

console.log('=== 运行库接线验证（' + path.basename(p) + '） ===');

const rt = flat.find(s => String(s.name).indexOf('运行库') >= 0 && String(s.name).indexOf('🧪') < 0);
ok(!!rt, '① 产物里有「运行库」脚本', rt ? rt.name : '没找到');
if (rt) {
  ok(rt.enabled !== false, '① 运行库默认开启', String(rt.enabled));
  const idx = flat.indexOf(rt);
  ok(idx === 0, '② 运行库排在整个脚本树第一位', '第 ' + (idx + 1) + ' 位');
  const code = String(rt.content || '');
  ok(code.indexOf('@@KAMI_RUNTIME_NEXT@@') < 0, '③ 占位符已展开（不是空壳）');
  ok(code.indexOf('KamiRuntimeNext') >= 0, '③ 内容里有 KamiRuntimeNext');
  ok(!/\.KamiRuntime\s*=/.test(code), '③ 不再注册旧运行库 KamiRuntime');
  ok(code.indexOf('createRoot') >= 0, '③ 内容里有 React createRoot（React 真打进来了）');
  ok(code.length > 150000, '③ 运行库体积像样（>150KB）', Math.round(code.length / 1024) + 'KB');
}

/* ④ 旧组件核心 / 旧运行库已删：脚本里不能再有人用 */
const users = flat.filter(s => s !== rt && /createKamiUi|\bKamiRuntime\b(?!Next)/.test(String(s.content || '')));
ok(users.length === 0, '④ 没有脚本还在用旧组件核心 createKamiUi / 旧运行库 KamiRuntime', users.map(s => s.name).join('、') || '无');

console.log('');
if (bad) { console.log('★ 运行库接线验证失败 ' + bad + ' 条'); process.exit(1); }
console.log('运行库接线验证全部通过');
