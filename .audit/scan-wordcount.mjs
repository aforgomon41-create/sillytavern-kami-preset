/* 只读盘点：预设里所有「字数 / 字」要求，以及 getvar/setvar 变量的定义与引用。
   用法：node .audit/scan-wordcount.mjs [关键词]
   为什么要它：预设里条目上百条、正文里到处混着「字」，直接 grep 只会得到一堆噪音；
   这里按**条目**归类，把命中行连同条目名一起打出来，改之前先看清有多少处、都在哪。 */
import fs from 'node:fs';

const ROOT = process.cwd();
const preset = JSON.parse(fs.readFileSync(ROOT + '/src/preset.base.json', 'utf8'));
const prompts = preset.prompts || [];
const kw = process.argv[2] || '字';

function entryName(p) {
  return String(p.name || p.identifier || '?');
}
function lines(s) { return String(s || '').split(/\r?\n/); }

console.log('=== 含「' + kw + '」的条目（按条目归类） ===');
let hitEntries = 0, hitLines = 0;
for (const p of prompts) {
  const c = String(p.content || '');
  if (c.indexOf(kw) < 0) { continue; }
  hitEntries++;
  const out = [];
  lines(c).forEach((l, i) => {
    if (l.indexOf(kw) >= 0) { hitLines++; out.push('    ' + (i + 1) + ': ' + l.trim().slice(0, 160)); }
  });
  console.log('  [' + entryName(p) + ']  identifier=' + p.identifier + '  命中 ' + out.length + ' 行');
  out.slice(0, 12).forEach(l => console.log(l));
  if (out.length > 12) { console.log('    …还有 ' + (out.length - 12) + ' 行'); }
}
console.log('（共 ' + hitEntries + ' 个条目、' + hitLines + ' 行命中）');

console.log('');
console.log('=== 变量：定义（setvar）与引用（getvar） ===');
const defs = {}, refs = {};
for (const p of prompts) {
  const c = String(p.content || '');
  for (const m of c.matchAll(/\{\{setvar::([^}:]+)(?:::([^}]*))?\}\}/g)) {
    (defs[m[1]] = defs[m[1]] || []).push({ entry: entryName(p), value: m[2] });
  }
  for (const m of c.matchAll(/\{\{getvar::([^}]+)\}\}/g)) {
    (refs[m[1]] = refs[m[1]] || []).push(entryName(p));
  }
}
const names = Array.from(new Set([...Object.keys(defs), ...Object.keys(refs)])).sort();
for (const n of names) {
  const d = defs[n] || [];
  const r = refs[n] || [];
  console.log('  ' + n.padEnd(28) + ' 定义 ' + d.length + ' 处' + (d.length ? '（值=' + d.map(x => x.value).join(' / ') + ' 于 ' + d[0].entry + '）' : '') +
    '　引用 ' + r.length + ' 处' + (r.length ? '（' + Array.from(new Set(r)).slice(0, 4).join('、') + '）' : ''));
}
console.log('（变量共 ' + names.length + ' 个）');
