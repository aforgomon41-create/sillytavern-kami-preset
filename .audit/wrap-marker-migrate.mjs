// 一次性迁移：把示例里「角色名」的反引号包裹改成显式标记 <n>…</n>
//
// 为什么：反引号在预设里有三种用途（角色名 / XML 标签 / 宏与代码），形状上分不开。
// 换成 <n> 之后，发送时脚本可以零猜测地精确替换成当前档位的包裹符。
//
// 只动名单里的 24 个名字，其余反引号一律不碰。数量对不上就中止。
//
//   node .audit/wrap-marker-migrate.mjs           干跑，只报告
//   node .audit/wrap-marker-migrate.mjs --apply   写盘
import fs from 'node:fs';

const FILE = 'src/preset.base.json';
const BT = String.fromCharCode(96);
const APPLY = process.argv.includes('--apply');

// 名字 → 预设里出现的次数（2026-09-28 扫描所得，对不上就说明预设变过了）
const NAMES = {
  '奈亚子': 16, '林冲': 10, '陆沉': 9, '王陆': 3, '诸葛雷': 3,
  '阿撒托斯': 2, '艾莉亚': 2, '白术': 2, '王舞': 2, '宁缺': 2,
  '千反田': 2, '折木': 2, '李寻欢': 2, '陆谦': 2,
  '卡恩': 1, '她': 1, '桑桑': 1, '朝小树': 1, '桐乃': 1,
  '阿库娅': 1, '常陆茉子': 1, '古河渚': 1, '沙耶': 1, '富安': 1,
};
const EXPECT_TOTAL = Object.values(NAMES).reduce((a, b) => a + b, 0); // 69

// 长名字优先，避免「王陆」先匹配掉「王陆谦」这类前缀
const keys = Object.keys(NAMES).sort((a, b) => b.length - a.length);
const RE = new RegExp(BT + '(' + keys.join('|') + ')' + BT, 'g');

const preset = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const prompts = preset.prompts || [];

// 先留一份迁移前的快照（必须在改动内存里的 preset 之前写，否则备份的是迁移后的内容）
const snapshot = JSON.stringify(preset, null, 2) + '\n';

const got = {};
let total = 0;
let touched = 0;
for (const p of prompts) {
  const before = p.content || '';
  if (!before.includes(BT)) continue;
  let hit = 0;
  const after = before.replace(RE, (_full, name) => {
    got[name] = (got[name] || 0) + 1;
    hit++;
    return '<n>' + name + '</n>';
  });
  if (hit) { touched++; total += hit; p.content = after; }
}

// ---- 断言 ----
let bad = 0;
for (const [name, want] of Object.entries(NAMES)) {
  const have = got[name] || 0;
  if (have !== want) { console.log(`  ✗ ${name}：预期 ${want} 处，实际 ${have} 处`); bad++; }
}
if (total !== EXPECT_TOTAL) { console.log(`  ✗ 总数：预期 ${EXPECT_TOTAL}，实际 ${total}`); bad++; }

console.log(`名字 ${keys.length} 个 / 站点 ${total} 处 / 涉及条目 ${touched} 条`);
if (bad) { console.log(`\n✗ ${bad} 项对不上，已中止，未写盘。`); process.exit(1); }
console.log('  ✓ 每个名字的出现次数都与扫描结果一致');

// 迁移后不该再有「名单里的名字被反引号包着」
const left = [];
for (const p of prompts) {
  const re2 = new RegExp(BT + '(' + keys.join('|') + ')' + BT, 'g');
  if (re2.test(p.content || '')) left.push(p.name);
}
if (left.length) { console.log('  ✗ 仍有残留：' + left.join('、')); process.exit(1); }
console.log('  ✓ 没有残留的反引号角色名');

// 顺手统计一下还剩多少反引号（应当只剩技术引用）
const rest = JSON.stringify(prompts).match(new RegExp(BT + '[^' + BT + ']*' + BT, 'g')) || [];
console.log(`  剩余反引号片段 ${rest.length} 处（技术引用，保持原样）`);

if (!APPLY) { console.log('\n（干跑，未写盘。加 --apply 才会写入）'); process.exit(0); }

fs.writeFileSync('dist/_preset.base.标记迁移前备份.json', snapshot, 'utf8');
fs.writeFileSync(FILE, JSON.stringify(preset, null, 2) + '\n', 'utf8');
console.log(`\n已写盘：${FILE}（迁移前备份在 dist/_preset.base.标记迁移前备份.json）`);
