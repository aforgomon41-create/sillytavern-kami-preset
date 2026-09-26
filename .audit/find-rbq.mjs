/* 只读检索：在压缩后的单行文件里找某个片段的全部出现位置，并把每处的上下文打出来。
   用法：node .audit/find-rbq.mjs "Tn(" [上下文长度] [文件]
   为什么不用 grep：单行文件里 grep 只会命中「第 1 行」，拿不到偏移与上下文。 */
import fs from 'node:fs';

const needle = process.argv[2];
const ctx = Number(process.argv[3] || 140);
const file = process.argv[4] || '收到的文件/RBQ-Draw-index.js';
const s = fs.readFileSync(file, 'utf8');
let i = 0, n = 0;
while (true) {
  const at = s.indexOf(needle, i);
  if (at < 0) { break; }
  n++;
  const from = Math.max(0, at - ctx);
  console.log('【' + n + '】偏移 ' + at);
  console.log('  …' + s.slice(from, at + needle.length + ctx) + '…');
  i = at + needle.length;
}
console.log('共 ' + n + ' 处');
