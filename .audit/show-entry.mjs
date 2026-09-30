/* 只读：把某几个条目的正文整段打出来（按序号或名字片段匹配）。
   用法：node .audit/show-entry.mjs <名字片段> [行号起] [行数]
   为什么要它：预设条目正文很长，read 整个 preset.base.json 不现实；按条目定位最省事。 */
import fs from 'node:fs';

const preset = JSON.parse(fs.readFileSync(process.cwd() + '/src/preset.base.json', 'utf8'));
const kw = process.argv[2] || '';
const from = Number(process.argv[3] || 1);
const take = Number(process.argv[4] || 400);
const hits = (preset.prompts || []).filter(p => String(p.name || '').indexOf(kw) >= 0 || String(p.identifier || '').indexOf(kw) >= 0);
if (!hits.length) { console.log('没找到含「' + kw + '」的条目'); process.exit(0); }
for (const p of hits) {
  console.log('===== ' + p.name + ' ｜ identifier=' + p.identifier + ' ｜ role=' + p.role +
    ' ｜ 正文字数(字符)=' + String(p.content || '').length + ' =====');
  const ls = String(p.content || '').split(/\r?\n/);
  ls.slice(from - 1, from - 1 + take).forEach((l, i) => console.log(String(from + i).padStart(4) + '| ' + l));
  console.log('');
}
