// 列出所有「含汉字但会被排除」的反引号片段 —— 确认没有漏网的角色名
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('src/preset.base.json', 'utf8'));
const ps = j.prompts || [];
const BT = String.fromCharCode(96);
const re = new RegExp(BT + '([^' + BT + '\\n]*)' + BT, 'g');
const BAD = /[\s<>{}\|\\\/*_#\[\]()="'&;~$%^,:.+\-！？。，、；：（）【】「」…—]/;

const excluded = new Map();
const kept = new Map();
for (const p of ps) {
  const c = p.content || '';
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(c)) !== null) {
    const inner = m[1];
    if (!inner || !/[\u4e00-\u9fff]/.test(inner)) continue;
    if (inner.length > 16) excluded.set(m[0] + '   ← 太长');
    else if (BAD.test(inner)) excluded.set(m[0] + '   ← 含符号');
    else kept.set(m[0], (kept.get(m[0]) || 0) + 1);
  }
}
console.log('含汉字但被排除的片段，共 ' + excluded.size + ' 种：');
for (const s of excluded.keys()) console.log('  ' + s);
console.log('\n判定为角色名、准备改标记的，共 ' + kept.size + ' 种 / ' +
  [...kept.values()].reduce((a, b) => a + b, 0) + ' 次：');
for (const [s, n] of [...kept.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + String(n).padStart(3) + '  ' + s);
