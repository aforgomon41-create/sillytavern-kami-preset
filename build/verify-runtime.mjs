#!/usr/bin/env node
/**
 * 「🧩 运行库」接线守卫（只读产物）
 * ------------------------------------------------------------
 * 运行库是**所有面板的地基**：它挂了，面板全部打不开。这个守卫钉四件事：
 *   ① 产物里有「运行库」脚本，且**默认开启**
 *   ② 它排在整个脚本树的**第一位**（面板启动时就要拿到 React）
 *   ③ 内容里真的是打包好的运行库（KamiRuntime + React 特征），不是没展开的空壳
 *   ④ 面板脚本**不再各自内联**组件核心（否则体积优化白做，也说明 shim 被改回去了）
 *
 * 用法：node build/verify-runtime.mjs <产物路径>
 */
import { flattenScriptTrees } from './kami-doc.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv[2];
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let p = arg;
if (!p) {
  const dir = path.join(ROOT, 'dist');
  const files = fs.readdirSync(dir).filter(f => /^kami-v\d+\.\d+-\d+-\d{8}\.json$/.test(f))
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

const rt = flat.find(s => String(s.name).indexOf('运行库') >= 0);
ok(!!rt, '① 产物里有「运行库」脚本', rt ? rt.name : '没找到');
if (rt) {
  ok(rt.enabled !== false, '① 运行库默认开启', String(rt.enabled));
  const idx = flat.indexOf(rt);
  ok(idx === 0, '② 运行库排在整个脚本树第一位', '第 ' + (idx + 1) + ' 位');
  const code = String(rt.content || '');
  ok(code.indexOf('@@KAMI_RUNTIME@@') < 0, '③ 占位符已展开（不是空壳）');
  ok(code.indexOf('KamiRuntime') >= 0, '③ 内容里有 KamiRuntime');
  ok(code.indexOf('createRoot') >= 0, '③ 内容里有 React createRoot（React 真打进来了）');
  ok(code.length > 150000, '③ 运行库体积像样（>150KB）', Math.round(code.length / 1024) + 'KB');
}

/* ④ 面板脚本不再内联组件核心：它们只该有惰性 shim（函数声明），
      不该出现 core.js 的实现特征（那个 __kami_ui_v1__ 缓存键）。 */
const panels = flat.filter(s => s !== rt && /皮肤管理|预设设置|引导|工具箱|远程更新|正文外壳|思维链|状态栏/.test(String(s.name)));
ok(panels.length >= 5, '④ 找得到面板脚本', panels.length + ' 个');
const inlined = panels.filter(s => String(s.content || '').indexOf('__kami_ui_v1__') >= 0);
ok(inlined.length === 0, '④ 面板脚本里没有内联的组件核心（应全部改成运行库 shim）', inlined.map(s => s.name).join('、') || '无');
/* 面板分两种状态，都算合格：
     · 还没迁移 → 有运行库 shim（function createKamiUi(doc) {...}）
     · 已经迁移 → 完全不提 createKamiUi（界面直接用 React 渲染）
   真正要拦的是「既没 shim、又在用 createKamiUi」—— 那会在运行时报 is not defined。 */
const shimmed = panels.filter(s => /function createKamiUi\(doc\)/.test(String(s.content || '')));
const migrated = panels.filter(s => String(s.content || '').indexOf('createKamiUi') < 0);
const orphan = panels.filter(s => {
  const c = String(s.content || '');
  return c.indexOf('createKamiUi') >= 0 && !/function createKamiUi\(doc\)/.test(c);
});
ok(orphan.length === 0, '④ 没有「用了 createKamiUi 却没拿到 shim」的面板', orphan.map(s => s.name).join('、') || '无');
ok(migrated.length + shimmed.length === panels.length, '④ 每个面板要么已迁移到 React、要么拿到运行库 shim',
  '已迁移 ' + migrated.length + ' 个（' + (migrated.map(s => s.name).join('、') || '无') + '），用 shim ' + shimmed.length + ' 个');

console.log('');
if (bad) { console.log('★ 运行库接线验证失败 ' + bad + ' 条'); process.exit(1); }
console.log('运行库接线验证全部通过');
