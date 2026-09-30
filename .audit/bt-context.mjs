// 打印反引号角色名的上下文，看有没有稳定模式
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('src/preset.base.json', 'utf8'));
const ps = j.prompts || [];
const BT = String.fromCharCode(96);
const nameRe = new RegExp(BT + '([\\u4e00-\\u9fff]{1,6})' + BT, 'g');

let shown = 0;
for (const p of ps) {
  const lines = (p.content || '').split('\n');
  for (const line of lines) {
    nameRe.lastIndex = 0;
    if (!nameRe.test(line)) continue;
    if (shown++ > 45) break;
    console.log(`[${p.name}]`);
    console.log('   ' + line.slice(0, 160));
  }
}
console.log('\n总命中行数（未截断）以上为前 46 行');

// 名字是否也以「无包裹」形式出现在同一行/邻近
const all = ps.map(p => p.content || '').join('\n');
for (const nm of ['奈亚子', '林冲', '陆沉', '王陆']) {
  const wrapped = (all.match(new RegExp(BT + nm + BT, 'g')) || []).length;
  const bare = (all.match(new RegExp(nm, 'g')) || []).length;
  console.log(`${nm}: 包裹 ${wrapped} 次 / 总出现 ${bare} 次`);
}
