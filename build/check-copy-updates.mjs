/* 校验文案 agent 的两份 JSON：结构、雷区字符、空字段。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* 工作区根目录从本文件位置推导（build/ 的上一级）：不写死，
   换机器、改文件夹名都能跑。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = ROOT + '/design/copy/';
const cu = JSON.parse(fs.readFileSync(root + 'comment-updates.json', 'utf8'));
const gc = JSON.parse(fs.readFileSync(root + 'guide-copy.json', 'utf8'));

const bad = [];
for (const it of cu) {
  const t = String(it.text || '');
  if (t.indexOf('{{') >= 0 || t.indexOf('}}') >= 0) { bad.push([it.match, '双花括号']); }
  if (t.indexOf('\\') >= 0) { bad.push([it.match, '反斜杠']); }
  if (t.indexOf('"') >= 0) { bad.push([it.match, '英文双引号']); }
  if (!it.match || !it.text) { bad.push([String(it.match), '空字段']); }
}
const keys = Object.keys(gc);
const emptyKeys = keys.filter((k) => !gc[k] || !String(gc[k]).trim());
const cards = cu.filter((x) => x.target === 'card').length;
const entries = cu.filter((x) => x.target === 'entry').length;
const add = cu.filter((x) => x.action === 'add').length;
const rep = cu.filter((x) => x.action === 'replace').length;
console.log('comment-updates 条数:', cu.length, '| card:', cards, '| entry:', entries, '| add:', add, '| replace:', rep);
console.log('guide-copy 键数:', keys.length, '| 空值键:', emptyKeys.join(', ') || '无');
console.log('雷区命中:', bad.length ? JSON.stringify(bad) : '无');

/* match 名能否在素材包/预设里对上号（防抄错名字） */
const preset = JSON.parse(fs.readFileSync(ROOT + '/src/preset.base.json', 'utf8'));
const names = new Set();
for (const p of (preset.prompts || [])) { names.add(p.name); }
const missing = cu.filter((it) => it.target === 'entry' && !names.has(it.match));
console.log('entry match 对不上预设条目名的:', missing.length ? missing.map((m) => m.match).join('；') : '无');
