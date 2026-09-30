// 试探「哪些反引号片段算角色名包裹」的判定规则在真实数据上的表现
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('src/preset.base.json', 'utf8'));
const ps = j.prompts || [];
const BT = String.fromCharCode(96);
const re = new RegExp(BT + '([^' + BT + '\\n]*)' + BT, 'g');

// 判定规则（保守版）：反引号内是一个「短、纯文本、含汉字、不含技术符号」的片段
const BAD = /[\s<>{}|\\/*_#\[\]()="'&;~$%^,]/;
function isNameWrap(inner) {
  if (!inner) return false;
  if (inner.length > 16) return false;
  if (BAD.test(inner)) return false;
  if (!/[\u4e00-\u9fff]/.test(inner)) return false;   // 必须含汉字
  if (/^[\d.]+$/.test(inner)) return false;
  return true;
}

const hits = new Map();
const misses = new Map();
let hitN = 0, missN = 0;
for (const p of ps) {
  const c = p.content || '';
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(c)) !== null) {
    const full = m[0], inner = m[1];
    if (isNameWrap(inner)) { hitN++; hits.set(full, (hits.get(full) || 0) + 1); }
    else { missN++; misses.set(full, (misses.get(full) || 0) + 1); }
  }
}
console.log(`判定为「角色名包裹」: ${hits.size} 种 / ${hitN} 次`);
console.log(`判定为「技术引用」保留原样: ${misses.size} 种 / ${missN} 次\n`);
console.log('--- 会被改写的（全部）---');
for (const [s, n] of [...hits.entries()].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(3), s);
console.log('\n--- 保留原样的（抽样 40）---');
for (const [s, n] of [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(n).padStart(3), s);
