/* 只读切片：把压缩后的 RBQ 扩展在某个字符偏移附近的原文打出来（不写任何文件）。
   用法：node .audit/slice-rbq.mjs <偏移> [长度] [文件]
   为什么要这个：单行压缩文件没法用 grep 看上下文，按偏移切片最省事也最可靠。 */
import fs from 'node:fs';

const at = Number(process.argv[2] || 0);
const len = Number(process.argv[3] || 400);
const file = process.argv[4] || '收到的文件/RBQ-Draw-index.js';
const s = fs.readFileSync(file, 'utf8');
console.log('文件 ' + file + ' 共 ' + s.length + ' 字符；以下是从 ' + at + ' 起 ' + len + ' 字符：');
console.log('---');
console.log(s.slice(Math.max(0, at - 80), at + len).split(/\\n/).join('\n'));
console.log('---');
