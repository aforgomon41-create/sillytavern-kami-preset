// 比对最近两次构建的脚本体量，找出多出来的 112KB（只读）
import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('dist/build-manifest.json', 'utf8'));
const builds = m.builds.slice(-2);
const [prev, cur] = builds;
console.log('上一版：', prev.file);
console.log('本  版：', cur.file);
const byName = new Map(prev.scripts.map(s => [s.name, s]));
console.log('\n脚本体积变化：');
let sum = 0;
for (const s of cur.scripts) {
  const p = byName.get(s.name);
  const d = p ? s.bytes - p.bytes : s.bytes;
  sum += d;
  if (d !== 0) console.log(`  ${d > 0 ? '+' : ''}${d}  ${s.name}  (${p ? p.bytes : 0} → ${s.bytes})`);
}
console.log('  脚本合计变化：' + (sum > 0 ? '+' : '') + sum);
console.log('\n正则体积变化：');
const rp = new Map(prev.regex.map(r => [r.scriptName, r]));
for (const r of cur.regex) {
  const p = rp.get(r.scriptName);
  const d = p ? r.replacementBytes - p.replacementBytes : r.replacementBytes;
  if (d !== 0) console.log(`  ${d > 0 ? '+' : ''}${d}  ${r.scriptName}  (${p ? p.replacementBytes : 0} → ${r.replacementBytes})`);
}
console.log('\n预设本体 sha：', prev.baseSha256, '→', cur.baseSha256);
