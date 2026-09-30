/* 只读预演：点「模型卡片头」时，面板到底会开哪些条目、关哪些条目。
   为什么要它：用户报「标了(非必要不开)的条目，选模型时不该跟着开」——
   得先看清选中每个模型时**实际会开哪几条**，才不会改漏或改过头。
   用法：node .audit/model-switch-preview.mjs
   口径与 40-预设设置.js 的 selectModel() 逐条对齐（同一份解析器给出的 models 集合）。 */
import fs from 'node:fs';
import { parsePreset } from '../test/harness/preset-parse.mjs';

const preset = JSON.parse(fs.readFileSync(process.cwd() + '/src/preset.base.json', 'utf8'));
const r = parsePreset(preset);
const order = (preset.prompt_order.find(o => o.character_id === 100001) || preset.prompt_order[0]).order;
const onNow = new Map(order.map(o => [o.identifier, o.enabled !== false]));

/* 收集所有条目（与 eachItem 同口径） */
const items = [];
const seen = new Set();
(function walk(n) {
  if (!n || typeof n !== 'object') { return; }
  if (Array.isArray(n)) { n.forEach(walk); return; }
  if (Array.isArray(n.items)) { n.items.forEach(it => { if (it && it.identifier && !seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); } }); }
  if (Array.isArray(n.cards)) { n.cards.forEach(walk); }
  if (Array.isArray(n.tabs)) { n.tabs.forEach(walk); }
  if (Array.isArray(n.layers)) { n.layers.forEach(walk); }
  if (Array.isArray(n.children)) { n.children.forEach(walk); }
  if (Array.isArray(n.own)) { n.own.forEach(it => { if (it && it.identifier && !seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); } }); }
})(r);

const withModels = items.filter(it => (it.models || []).length);
const emojis = Array.from(new Set(withModels.flatMap(it => it.models)));

/* 与 40 号 selectModel 同步的「非必要不开」规则（2026-09-28）：标题带这个标签的不跟着开 */
const OPT = '非必要不开';
const isOptionalOff = (it) => String(it.name || '').indexOf(OPT) >= 0;

console.log('条目总数 ' + items.length + '，其中带模型归属的 ' + withModels.length + ' 条；模型 ' + emojis.join(' '));
console.log('');
for (const emo of emojis) {
  const on = [], off = [], skip = [];
  for (const it of withModels) {
    const hit = it.models.indexOf(emo) >= 0;
    if (hit) {
      if (onNow.get(it.identifier) === false) {
        if (isOptionalOff(it)) { skip.push(it); } else { on.push(it); }
      }
    } else if (onNow.get(it.identifier) !== false) { off.push(it); }
  }
  console.log('=== 选中 ' + emo + ' 会开 ' + on.length + ' 条、关 ' + off.length + ' 条、按「' + OPT + '」跳过 ' + skip.length + ' 条 ===');
  on.forEach(it => console.log('   + ' + it.name));
  skip.forEach(it => console.log('   · 跳过（不跟着开，要用自己点）：' + it.name));
  if (off.length) { console.log('   - ' + off.map(it => it.name).join('、')); }
  console.log('');
}
