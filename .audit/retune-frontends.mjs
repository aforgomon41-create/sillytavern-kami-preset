/* 一次性工具：调整正则表
   ① 把「正文」前端正则移到「显式思维链」**上面**（用户 2026-09-26 点名：必须排在思维链之前才能正常渲染）；
   ② 三个前端正则去掉「(占位)」、改成自己的版本号（本轮统一 v0.1）。
   判据：按 scriptName 找条目，按 id 定位后重排，不动其它字段。跑两次零变化（幂等）。
     node .audit/retune-frontends.mjs [--apply]
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const F = path.join(ROOT, 'src', 'regex', 'list.json');
const APPLY = process.argv.includes('--apply');

const RENAME = {
  '前端|显式思维链(占位)': '前端|显式思维链 v0.1',
  '前端|行动选项(占位)': '前端|行动选项 v0.1',
  '前端|正文(占位)': '前端|正文 v0.1',
};
/* 目标顺序：正文 必须排在 思维链 之前（并排的两个前端之间保持 options 在最后） */
const ORDER = ['前端|正文 v0.1', '前端|显式思维链 v0.1', '前端|行动选项 v0.1'];

const list = JSON.parse(fs.readFileSync(F, 'utf8'));
let renamed = 0;
for (const r of list) {
  const to = RENAME[r.scriptName];
  if (to && r.scriptName !== to) { r.scriptName = to; renamed += 1; }
}
/* 重排：把三个前端按 ORDER 的次序放回「第一个前端原来所在的位置」，其余条目相对顺序不变 */
const front = [];
const rest = [];
for (const r of list) { (ORDER.indexOf(r.scriptName) >= 0 ? front : rest).push(r); }
const before = list.findIndex(r => ORDER.indexOf(r.scriptName) >= 0);
const frontSorted = ORDER.map(n => front.find(r => r.scriptName === n)).filter(Boolean);
/* 前端没凑齐就报错退出，别静默改坏表 */
if (frontSorted.length !== ORDER.length) {
  console.error('★ 只找到 ' + frontSorted.length + ' 个前端正则（应为 ' + ORDER.length + '）：' +
    front.map(r => r.scriptName).join(' / '));
  process.exit(1);
}
const out = rest.slice(0, before).concat(frontSorted, rest.slice(before));

const idxOf = (arr, n) => arr.findIndex(r => r.scriptName === n);
const ok = idxOf(out, '前端|正文 v0.1') < idxOf(out, '前端|显式思维链 v0.1');
console.log('重命名 ' + renamed + ' 条；前端顺序：' + frontSorted.map(r => r.scriptName).join(' → '));
console.log('正文在思维链之前？ ' + (ok ? '是 ✓' : '否 ✗'));
if (!ok) { process.exit(1); }
if (APPLY) {
  fs.writeFileSync(F, JSON.stringify(out, null, 2).split('\n').join('\r\n') + '\r\n', 'utf8');
  console.log('已写盘 ' + F + '（' + out.length + ' 条）');
} else { console.log('（干跑，未写盘）'); }
