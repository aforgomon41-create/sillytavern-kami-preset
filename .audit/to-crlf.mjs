/* 一次性工具：把 tavern.css 的行尾从 LF 归一成 CRLF（其余样式/皮肤源文件都是 CRLF）。
   仅在写入工具产出 LF 之后跑一次。如需回退：--lf。
     node .audit/to-crlf.mjs <文件>
     node .audit/to-crlf.mjs <文件> --lf
*/
import fs from 'node:fs';

const file = process.argv[2];
const toLf = process.argv.includes('--lf');
if (!file) { console.error('用法：node .audit/to-crlf.mjs <文件> [--lf]'); process.exit(1); }

const src = fs.readFileSync(file, 'utf8');
const out = toLf
  ? src.split('\r\n').join('\n')
  : src.split('\r\n').join('\n').split('\n').join('\r\n');

if (out === src) { console.log('已是目标行尾，未改动：' + file); }
else {
  fs.writeFileSync(file, out, 'utf8');
  const b = fs.readFileSync(file);
  let crlf = 0, lf = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 10) { continue; }
    if (i > 0 && b[i - 1] === 13) { crlf += 1; } else { lf += 1; }
  }
  console.log('已写：' + file + ' → CRLF=' + crlf + ' 裸LF=' + lf);
}
