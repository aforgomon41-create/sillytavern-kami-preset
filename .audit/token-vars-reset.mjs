/* 补一刀：把「每次请求清空变量」那条清单里的旧变量名也换掉。
   为什么必须有这一刀：那条清单的作用是「条目被关掉时别留下上一轮的变量值」，
   只清旧名字 = 新变量会残留，正文 token 量会串上一轮的数。
   用法：node .audit/token-vars-reset.mjs [--check] */
import fs from 'node:fs';

const FILE = process.cwd() + '/src/preset.base.json';
const CHECK = process.argv.includes('--check');
const preset = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const entry = preset.prompts.find(p => p.identifier === 'prompt_1788364022825_s7ebevr');
if (!entry) { throw new Error('找不到「设置变量🔻」条目'); }

const pairs = [
  ['{{setvar::content_word_count_min::}}', '{{setvar::content_token_min::}}'],
  ['{{setvar::content_word_count_max::}}', '{{setvar::content_token_max::}}'],
];
for (const [from, to] of pairs) {
  const n = String(entry.content).split(from).length - 1;
  if (n !== 1) { throw new Error('【' + entry.name + '】里 ' + from + ' 出现 ' + n + ' 次（必须恰好 1 次）'); }
  entry.content = String(entry.content).split(from).join(to);
  console.log('  [' + entry.name + '] ' + from + ' → ' + to);
}

/* 复核：全预设里不该再有旧变量名 */
const left = [];
for (const p of preset.prompts) {
  if (String(p.content || '').indexOf('content_word_count') >= 0) { left.push(p.name); }
}
console.log('  残留旧变量名的条目：' + (left.join('、') || '无'));
if (left.length) { console.error('还有残留，不写盘'); process.exit(1); }
if (CHECK) { console.log('（--check：未写盘）'); process.exit(0); }
fs.writeFileSync(FILE, JSON.stringify(preset, null, 2) + '\n', 'utf8');
console.log('已写盘：' + FILE);
