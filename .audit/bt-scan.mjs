// 扫描预设里反引号包裹的片段：总量、种类、是否混用
import fs from 'node:fs';

const file = process.argv[2] || 'src/preset.base.json';
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const ps = j.prompts || [];
const BT = String.fromCharCode(96);
const re = new RegExp(BT + '[^' + BT + '\\n]*' + BT, 'g');

let total = 0;
const freq = new Map();
const perEntry = [];
for (const p of ps) {
  const c = p.content || '';
  const m = c.match(re) || [];
  if (!m.length) continue;
  perEntry.push([p.name, m.length]);
  total += m.length;
  for (const s of m) freq.set(s, (freq.get(s) || 0) + 1);
}
console.log(`文件: ${file}  条目 ${ps.length} 条`);
console.log(`含反引号条目: ${perEntry.length} 条   反引号片段总数: ${total}   去重后: ${freq.size}\n`);

const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
console.log('--- 出现最多的 50 种 ---');
for (const [s, n] of sorted.slice(0, 50)) console.log(String(n).padStart(4), s);

// 粗分类：纯中文 1-6 字（疑似角色名） / 其他
const cjkName = [];
const other = [];
for (const [s, n] of sorted) {
  const inner = s.slice(1, -1);
  if (/^[\u4e00-\u9fff]{1,6}$/.test(inner)) cjkName.push([s, n]);
  else other.push([s, n]);
}
const sum = (a) => a.reduce((x, [, n]) => x + n, 0);
console.log(`\n纯中文 1-6 字（疑似角色名）: ${cjkName.length} 种 / ${sum(cjkName)} 次`);
console.log(`其他用途: ${other.length} 种 / ${sum(other)} 次`);
console.log('\n--- 其他用途（这些不能无脑替换）---');
for (const [s, n] of other.slice(0, 60)) console.log(String(n).padStart(4), s);

console.log('\n--- 含反引号最多的 15 个条目 ---');
perEntry.sort((a, b) => b[1] - a[1]);
for (const [name, n] of perEntry.slice(0, 15)) console.log(String(n).padStart(4), name);
