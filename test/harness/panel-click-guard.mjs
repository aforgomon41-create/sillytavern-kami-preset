#!/usr/bin/env node
/**
 * 面板交互接线守卫的回归用例
 * 用法：node test/harness/panel-click-guard.mjs <产物路径>（不给就自己找 dist 里最新的）
 *
 * 它验证的是 build/verify-panel-click.mjs 这个守卫**确实拦得住事**：
 *   把产物里「条目卡」那条点击委托分支删掉，守卫必须 FAIL 且退出码非 0。
 *
 * 为什么要这条用例：2026-10-14 那行被误删后，构建与全部单测都没报错，
 * 一路发到了线上，直到用户说「所有开关都失效了」。守卫自己也要有守卫。
 */
import { flattenScriptTrees } from '../../build/kami-doc.mjs';
import { currentBranchTag, ARTIFACT_RE } from '../../build/branch-tag.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const GUARD = path.join(root, 'build', 'verify-panel-click.mjs');

/* ① 先找一个产物 */
let artifact = process.argv[2];
if (!artifact) {
  const dir = path.join(root, 'dist');
  /* ⚠️ 挑「最新产物」的排序有两个坑（2026-10-15 都踩到了）：
     ① 构建号必须从**同一个正则的捕获组**取。写成 f.match(/-(\d+)-/)[1] 的话，
        对 `kami-v0.92-19-20261015.json` 会匹配到**版本号 92**（第一个 -数字- 是 .92-）。
     ② **构建号每个版本会重置**：v0.91-129 的 129 比 v0.92-19 的 19 大，
        所以「按构建号取最大」会把上一代大版本的产物当成最新的。
     正解：先按版本号（0.90 < 0.91 < 0.92），再按日期，最后才按构建号。 */
  /* 产物名可带支线后缀（…-<日期>-<支线>.json），只挑当前支线的（2026-10-27） */
  const RE = ARTIFACT_RE;
  const tag = currentBranchTag(root);
  const cands = fs.readdirSync(dir)
    .map((f) => ({ f, m: RE.exec(f) }))
    .filter((x) => !!x.m && String(x.m[5] || '').toLowerCase() === tag)
    .map((x) => ({ f: x.f, major: +x.m[1], minor: +x.m[2], build: +x.m[3], date: +x.m[4] }))
    .sort((a, b) => (a.major - b.major) || (a.minor - b.minor) || (a.date - b.date) || (a.build - b.build));
  if (!cands.length) { console.error('dist 里没有产物'); process.exit(2); }
  artifact = path.join(dir, cands[cands.length - 1].f);
}

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
};
function runGuard(file) {
  try {
    const out = execFileSync(process.execPath, [GUARD, file], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

console.log('=== 面板交互接线守卫 · 回归用例 ===');
console.log('  产物：' + path.basename(artifact));

/* ② 好产物必须通过 */
const good = runGuard(artifact);
ok(good.code === 0, '好产物：守卫通过（退出码 0）');
ok(good.out.indexOf('条目卡（所有开关）') >= 0, '好产物：守卫确实检查了「条目卡」这一条');

/* ③ 把条目卡分支删掉，守卫必须拦住 */
const j = JSON.parse(fs.readFileSync(artifact, 'utf8'));
const scripts = flattenScriptTrees((((j.extensions || {}).tavern_helper || {}).scripts) || []);
const panel = scripts.find((s) => String(s.name || '').indexOf('预设设置') >= 0);
if (!panel) { console.error('产物里没找到面板脚本'); process.exit(2); }
const NEEDLE = "t.getAttribute('data-kami-item') && t.tagName === 'BUTTON'";
ok(String(panel.content).indexOf(NEEDLE) >= 0, '产物里确实有「条目卡」那条分支（不然下面的模拟是空转）');
panel.content = String(panel.content).split(NEEDLE).join('data-kami-DELETED');

const tmp = path.join(os.tmpdir(), 'kami-broken-' + Date.now() + '.json');
fs.writeFileSync(tmp, JSON.stringify(j), 'utf8');
try {
  const broken = runGuard(tmp);
  ok(broken.code !== 0, '坏产物（条目卡分支被删）：守卫**拦住**了（退出码非 0）');
  ok(broken.out.indexOf('条目卡（所有开关）') >= 0 && broken.out.indexOf('整行不见了') >= 0,
    '坏产物：报错点名了「条目卡」并说明「整行不见了」');
} finally {
  try { fs.unlinkSync(tmp); } catch (e) { }
}

console.log('\n=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
