/* 离线跑一遍「酒馆显示链」：原文 → 正文正则 → showdown → 看 DOM 长什么样。
   为什么要它：正文前端 fork 版要往正则的替换串里塞「标记元素」，
   而替换串随后要过 showdown —— 标记会不会被吃掉、里面的 markdown 还渲不渲染，
   在本机就能先量清楚，不用等真机。
   用法：node .audit/body-marker-probe.mjs [替换串文件]
   ⚠️ showdown 的路径是本机约定（与 test/harness/server.mjs 的 LIB_ROOTS 同一份来源）。 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOTS = (process.env.KAMI_ST_ROOT || [
  'D:/sillytavern-software/SillyTavern Launcher GUI/data/sillytavern/1.18.0',
  'D:/SillyTavern/SillyTavern',
].join(';')).split(';').map(s => s.trim()).filter(Boolean);

let showdownPath = null;
for (const r of ROOTS) {
  const p = path.join(r, 'node_modules/showdown/dist/showdown.min.js');
  if (fs.existsSync(p)) { showdownPath = p; break; }
}
if (!showdownPath) { console.log('找不到 showdown，跳过'); process.exit(2); }
const require = createRequire(import.meta.url);
const showdown = require(showdownPath);
const conv = new showdown.Converter();
/* 与酒馆同一套开关（settings.json 实测）：encode_tags=false / collapse_newlines=false */
console.log('showdown 版本：' + (showdown.getDefaultOptions ? 'ok' : 'ok') + '  路径=' + showdownPath);

/* 一段带正文标签的 AI 输出（含插图标签、markdown、列表、引用） */
const RAW = [
  '开场白一段。',
  '',
  '<content>',
  '## 雨夜',
  '',
  '她把伞往我这边偏了偏。',
  '',
  'image###雨夜，一把伞，湿透的半边肩膀###',
  '',
  '- 雨点砸在伞面上',
  '- 路灯把水洼照得发亮',
  '',
  '> 「你这个人啊……」她叹了口气。',
  '</content>',
  '',
  '收尾一句。',
].join('\n');

/* 三种候选替换串，逐个看 showdown 之后还剩什么 */
const CANDIDATES = [
  ['A 单标记 div（正文留在里面）', '<div class="kami-body-src" data-kami-body>$1</div>'],
  ['B 双标记 div（前后各一个空 div）', '<div data-kami-body-start></div>\n\n$1\n\n<div data-kami-body-end></div>'],
  ['C 文本标记（两侧是纯文本哨兵）', '%%KAMI-BODY-START%%\n\n$1\n\n%%KAMI-BODY-END%%'],
];

function applyRegex(text, rep) {
  const re = /[ \t]*<content>([\s\S]*?)<\/content>[ \t]*/g;
  return text.replace(re, rep);
}
function count(hay, needle) { return hay.split(needle).length - 1; }

for (const [label, rep] of CANDIDATES) {
  const withRep = applyRegex(RAW, rep);
  const html = conv.makeHtml(withRep);
  console.log('');
  console.log('=== ' + label + ' ===');
  console.log('替换后（前 160 字）：' + JSON.stringify(withRep.slice(0, 160)));
  console.log('showdown 后（前 300 字）：' + JSON.stringify(html.slice(0, 300)));
  console.log('  标记还在：start=' + (count(html, 'data-kami-body-start') > 0) +
    ' end=' + (count(html, 'data-kami-body-end') > 0) +
    ' 单div=' + (count(html, 'data-kami-body"') > 0) +
    ' 文本哨兵=' + (count(html, '%%KAMI-BODY-START%%') > 0));
  console.log('  markdown 真的渲染了：h2=' + (count(html, '<h2') > 0) +
    ' li=' + (count(html, '<li>') > 0) + ' blockquote=' + (count(html, '<blockquote') > 0));
  console.log('  插图标签仍在文本里：' + (html.indexOf('image###雨夜') >= 0));
  console.log('  <content> 标签残留：' + (count(html, '<content>') > 0) + '（应为否）');
}
