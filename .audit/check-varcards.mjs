/* 只读核对：面板（预设设置 / 引导）会把变量条目画成什么样的卡。
   用面板**共用的那一份解析器**（test/harness/preset-parse.mjs）跑，避免「我以为面板会这么认」。
   用法：node .audit/check-varcards.mjs */
import fs from 'node:fs';
import { parsePreset } from '../test/harness/preset-parse.mjs';

const preset = JSON.parse(fs.readFileSync(process.cwd() + '/src/preset.base.json', 'utf8'));
const r = parsePreset(preset);

console.log('=== 变量条目解析结果 ===');
const flat = [];
(function walk(node, path) {
  if (!node) { return; }
  if (Array.isArray(node)) { node.forEach((n, i) => walk(n, path + '[' + i + ']')); return; }
  if (node.varCards) { node.varCards.forEach(v => flat.push({ title: node.title || node.name || path, v: v })); }
  ['layers', 'children', 'tabs', 'cards', 'groups'].forEach(k => { if (node[k]) { walk(node[k], path + '.' + k); } });
})(r.tree || r, 'tree');

if (!flat.length) {
  /* 退回直接看解析器给的入口清单 */
  const vars = (r.vars || []).map(v => v);
  console.log('（没走到 varCards，改看入口清单）');
  (r.entryList || []).filter(e => e.role2 === 'var').forEach(e => {
    console.log('  条目：' + e.name);
    const built = e;
    (built.allVars || []).forEach(s => console.log('     变量 ' + s.name + ' = ' + s.value + (s.numeric ? '（数字）' : '')));
  });
} else {
  flat.forEach(x => {
    const names = (x.v.allVars || []).map(s => s.name + '=' + s.value);
    console.log('  [' + x.title + '] 变量：' + names.join(', '));
    (x.v.cards || []).forEach(c => console.log('     卡：' + (c.label || c.name || '?') + '  范围 ' + c.min + '~' + c.max));
  });
}

console.log('');
console.log('=== 关键两问（在解析结果上遍历，不用 JSON.stringify —— 树里有环） ===');
let hasNew = false, hasOld = false;
(function scan(n, seen) {
  if (!n || typeof n !== 'object' || seen.has(n)) { return; }
  seen.add(n);
  for (const k of Object.keys(n)) {
    let v;
    try { v = n[k]; } catch (e) { continue; }
    if (typeof v === 'string') {
      if (v.indexOf('content_token_min') >= 0) { hasNew = true; }
      if (v.indexOf('content_word_count') >= 0) { hasOld = true; }
    } else if (v && typeof v === 'object') { scan(v, seen); }
  }
})(r, new WeakSet());
console.log('  解析结果里出现 content_token_min = ' + hasNew);
console.log('  解析结果里还有 content_word_count = ' + hasOld);
