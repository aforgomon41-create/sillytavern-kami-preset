/* 把 design/copy/comment-updates.json 的注释写回 src/preset.base.json。
 * 目标定位走解析器（卡片 → head.identifier；条目 → 名字精确匹配），
 * 写入只动条目 content 的第一个 {{//...}} 块：
 *   · add：原条目没有注释 → 在最前（{{trim}} 之后）插入一行 {{//text}}
 *   · replace：已有注释 → 原地把第一个 {{//...}} 换成 {{//text}}，其余一字不动
 * 写盘前备份一份 .bak。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset, firstComment } from '../test/harness/preset-parse.mjs';

/* 工作区根目录从本文件位置推导（build/ 的上一级）：不写死，
   换机器、改文件夹名都能跑。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(ROOT, 'src/preset.base.json');
const updates = JSON.parse(fs.readFileSync(path.join(ROOT, 'design/copy/comment-updates.json'), 'utf8'));

const backup = base + '.bak-before-comments';
if (!fs.existsSync(backup)) { fs.copyFileSync(base, backup); }
const preset = JSON.parse(fs.readFileSync(base, 'utf8'));
const NL = String.fromCharCode(10);

/* 定位：卡片名 → head identifier（tabs 里的卡片带 headIdentifier）；
   条目名 → identifier。模型 tab 的「卡片」是登记表推导的标签、不是预设条目，
   对应的注释没有落点，跳过并提示。 */
const tree = parsePreset(preset);
const cardHead = {};
for (const tab of (tree.tabs || [])) {
  if (tab.kind === 'model') { continue; }
  for (const c of (tab.cards || [])) { cardHead[c.name] = c.headIdentifier; }
}
const entryByName = {};
for (const p of (preset.prompts || [])) {
  const n = String(p.name || '');
  if (!(n in entryByName)) { entryByName[n] = p.identifier; }
}
const byId = {};
for (const p of (preset.prompts || [])) { byId[p.identifier] = p; }

function stripTrimPrefix(content) {
  /* 内容以 {{trim}} 开头时，注释插在它后面（保持项目既有排版习惯） */
  const t = String(content || '');
  if (t.indexOf('{{trim}}') === 0) { return { head: '{{trim}}' + NL, rest: t.slice('{{trim}}'.length) }; }
  return { head: '', rest: t };
}

let okCount = 0;
const misses = [];
for (const it of updates) {
  const id = it.target === 'card' ? cardHead[it.match] : entryByName[it.match];
  const entry = id ? byId[id] : null;
  if (!entry) { misses.push(it.target + '｜' + it.match); continue; }
  const before = String(entry.content || '');
  const existing = firstComment(before);
  const text = String(it.text || '');
  let after;
  if (existing != null) {
    /* 原地替换第一个 {{//...}} 块 */
    const s = before.indexOf('{{//');
    const e = before.indexOf('}}', s);
    after = before.slice(0, s) + '{{//' + text + '}}' + before.slice(e + 2);
    if (it.action !== 'replace') {
      /* 名义是 add 但已有注释：按 replace 处理并记录，避免重复叠注释 */
      console.log('  [注意] ' + it.match + ' 已有注释但清单写的是 add，已按替换处理');
    }
  } else {
    const parts = stripTrimPrefix(before);
    const comment = '{{//' + text + '}}';
    after = parts.rest.trim().length
      ? parts.head + comment + NL + parts.rest
      : parts.head + comment;
  }
  entry.content = after;
  okCount++;
}

fs.writeFileSync(base, JSON.stringify(preset, null, 2), 'utf8');
console.log('已写回 ' + okCount + '/' + updates.length + ' 条注释 → ' + base);
if (misses.length) { console.log('未定位到的条目：' + misses.join('；')); process.exit(1); }

/* 抽查 3 条：卡片注释、条目注释、replace 过的变量 */
const checks = ['🗣️ [语言文字]', '🚫 仿全知', '🧩 推理预算 | var'];
for (const want of checks) {
  const p = (preset.prompts || []).find((x) => String(x.name || '').indexOf(want.replace(/_/g, ' ')) >= 0 || String(x.name || '') === want);
  const id = cardHead[want] || entryByName[want];
  const e = id ? byId[id] : p;
  console.log('抽查「' + want + '」→ ' + (e ? String(e.content || '').slice(0, 60).replace(/\n/g, ' ') : '（没找到）'));
}
