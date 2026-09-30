// 模拟「发送时改写」：逐条列出每个档位到底会动哪些反引号片段
import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('src/preset.base.json', 'utf8'));
const ps = j.prompts || [];
const BT = String.fromCharCode(96);

// 判定「这处反引号是不是角色名包裹」——必须同时满足全部条件才动它
const BAD = /[\s<>{}\|\\\/*_#\[\]()="'&;~$%^,:.+\-！？。，、；：（）【】「」…—]/;
function isNameWrap(inner) {
  if (!inner) return false;                       // 空的反引号对，不是名字
  if (inner.length > 16) return false;            // 太长的多半是句子或代码
  if (BAD.test(inner)) return false;              // 含技术符号/标点，一律不碰
  if (!/[\u4e00-\u9fff]/.test(inner)) return false; // 必须含汉字，纯英文/数字不碰
  return true;
}
function rewrite(text, open, close) {
  const re = new RegExp(BT + '([^' + BT + '\\n]*)' + BT, 'g');
  const changed = [];
  const out = text.replace(re, (full, inner) => {
    if (!isNameWrap(inner)) return full;
    changed.push([full, open + inner + close]);
    return open + inner + close;
  });
  return { out, changed };
}

for (const [label, open, close] of [['无包裹', '', ''], ['双下划线', '__', '__']]) {
  let n = 0;
  const kinds = new Map();
  for (const p of ps) {
    const { changed } = rewrite(p.content || '', open, close);
    n += changed.length;
    for (const [a, b] of changed) kinds.set(a, b);
  }
  console.log(`\n=========== 档位「${label}」：共改动 ${n} 处，去重 ${kinds.size} 种 ===========`);
  for (const [a, b] of [...kinds.entries()]) console.log(`   ${a}  ->  ${b === '' ? '(去掉反引号)' : b}`);
}

// 反向确认：技术引用一处都不能动
console.log('\n=========== 反向确认：技术引用是否被碰 ===========');
const techMust = ['<interactive_input>', '<content>', '<appendix>', '{{getvar::medium_start}}',
  '<!-- 步骤**/Token** -->', '|centers:C3', '<god>', '{{getvar::image_start}}'];
let bad = 0;
for (const p of ps) {
  const { changed } = rewrite(p.content || '', '__', '__');
  for (const [a] of changed) if (techMust.includes(a)) { console.log('  ✗ 被误改：', a); bad++; }
}
console.log(bad === 0 ? '  ✓ 8 个技术样本一个都没被碰' : `  ✗ ${bad} 处被误改`);

// 抽样展示段落级前后对照
const sample = ps.find(p => p.name.includes('古龙武侠'));
if (sample) {
  const line = (sample.content || '').split('\n').find(l => l.includes('诸葛雷') && l.length > 60);
  console.log('\n=========== 段落级对照（古龙武侠）===========');
  console.log('【改前】' + line.trim());
  console.log('【无包裹】' + rewrite(line, '', '').out.trim());
  console.log('【双下划线】' + rewrite(line, '__', '__').out.trim());
}
