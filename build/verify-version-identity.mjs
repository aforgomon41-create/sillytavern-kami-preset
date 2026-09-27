#!/usr/bin/env node
/**
 * 「版本身份」守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 2026-09-26 用户提的问题：**用户的预设名是他自己的**，随时可能改（改成「我的卡密预设」之类）。
 * 所以「本机是哪个版本」不能靠解析当前预设名，得由**打包时写进脚本文本**的产物名说了算。
 * 这条链路错了的后果不是显示难看，是**功能坏掉**：
 *   · 40 号「关于」页显示不出版本与构建号；
 *   · 70 号更糟 —— 解析不出本机版本时它按「本机版本未知」处理，于是**每 6 小时把同一个版本再推一次**；
 *   · 50 号曾经还有一道「预设名里必须含卡密预设」的闸，ASCII 产物名直接把它变成永不自动弹。
 * 这个守卫就盯这三件事（外加「占位符一个都不许漏」）。
 *
 * 用法：node build/verify-version-identity.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-version-identity.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const asset = path.basename(p, '.json');                 // kami-v0.91-47-20260927
const wantVer = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version || '').trim();

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 版本身份验证（' + path.basename(p) + '） ===');

const scripts = preset.extensions?.tavern_helper?.scripts || [];
const byName = (kw) => String((scripts.find(s => String(s.name).indexOf(kw) >= 0) || {}).content || '');
const updater = byName('远程更新');
const panel = byName('预设设置');
const guide = byName('引导');

/* ① 占位符全都要被替换掉 */
const leftovers = scripts.filter(s => /@@KAMI_[A-Z_]+@@/.test(String(s.content)));
ok(leftovers.length === 0, '① 产物里没有漏替换的占位符', leftovers.map(s => s.name).join('、') || '干净');

/* ② 40 号与 70 号都写死了产物名（权威来源），并且与产物名逐字一致 */
[['预设设置', panel], ['远程更新', updater]].forEach(([who, code]) => {
  const m = /SELF_NAME\s*=\s*'([^']+)'/.exec(code);
  ok(!!m, '② ' + who + ' 里有写死的产物名 SELF_NAME', m ? m[1] : '没找到');
  if (m) { ok(m[1] === asset, '② ' + who + ' 的产物名与产物文件一致', m[1] + ' vs ' + asset); }
  ok(code.indexOf('parseVersion(SELF_NAME)') >= 0 || code.indexOf('presetVersionLabel(SELF_NAME)') >= 0,
    '② ' + who + ' 真的拿它当第一来源（不是只定义不用）');
});
ok(new RegExp('v' + wantVer.replace('.', '\\.') + '-').test(asset),
  '② 产物名里的版本号与 version.json 一致', wantVer + ' → ' + asset);

/* ③ 预设名只作为兜底，不能再是唯一来源 */
ok(/parseVersion\(local\.name\)/.test(updater), '③ 70 号仍然保留「按预设名解析」这条兜底（旧产物没有 SELF_NAME）');
ok(/presetVersionLabel\(name\)/.test(panel), '③ 40 号同样保留兜底');

/* ④ 引导：那道「预设名里必须含卡密预设」的闸必须不在了 */
ok(guide.indexOf('PRESET_MARK') < 0, '④ 引导脚本里没有 PRESET_MARK（名字闸已拆）');
ok(guide.indexOf('不自动弹') < 0 || guide.indexOf('已看过') >= 0,
  '④ 只剩「这一版看过没有」这一道闸');
ok(/readGuideVars\(\)\s*===\s*BUILD_N/.test(guide), '④ 「看过的产物号」那道闸还在（同一个产物只弹一次）');
ok(guide.indexOf('@@KAMI_BUILD_N@@') < 0, '④ 引导的产物号已注入');

/* ⑤ 70 号对外暴露版本读取口（用户点名要的） */
ok(/selfName:\s*function/.test(updater) && /presetVersion:\s*function/.test(updater),
  '⑤ 70 号对外暴露 selfName / presetVersion');

console.log('');
console.log(bad ? '★ 版本身份验证失败 ' + bad + ' 条' : '版本身份验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
