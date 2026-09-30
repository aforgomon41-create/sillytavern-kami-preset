// 对比调研第一刀：两份预设的「骨架 + 长度要求在哪」
// ⚠️ 另一份预设只落在 收到的文件/（已被 .gitignore 忽略），本脚本与它的结论都不得写进任何会公开的文档。
// 只看两份 JSON 本身，不下任何结论，先把事实摊开。
import fs from 'node:fs';

const MINE = 'src/preset.base.json';
const REF = '收到的文件/refpreset-AcESrbLH.json';

const j = JSON.parse(fs.readFileSync(MINE, 'utf8'));
const r = JSON.parse(fs.readFileSync(REF, 'utf8'));

const ps = j.prompts || [];
const rs = r.prompts || [];

console.log('=== 骨架 ===');
console.log('  条目数: 我们 ' + ps.length + ' / 参考 ' + rs.length);
console.log('  顶层字段我们:', Object.keys(j).join(', '));
console.log('  顶层字段参考:', Object.keys(r).join(', '));
console.log('  参考预设名:', r.name || '(无 name 字段)');

/* 顺序表：哪些条目默认开着 */
function enabledOf(preset) {
  const ord = (preset.prompt_order || []).find(o => o.character_id === 100001) || (preset.prompt_order || [])[0] || {};
  const m = new Map((ord.order || []).map(o => [o.identifier, o.enabled !== false]));
  return m;
}
const me = enabledOf(j), re = enabledOf(r);
const myOn = ps.filter(p => me.get(p.identifier) === true);
const refOn = rs.filter(p => re.get(p.identifier) === true);
console.log('  默认开启: 我们 ' + myOn.length + ' / 参考 ' + refOn.length);

/* 长度要求：抓含 token / 字数 / 长度 关键字的条目 */
const KW = /token|字数|长度|字左右|words?|max_tokens|min_tokens/i;
function hits(list, tag) {
  const out = [];
  for (const p of list) {
    const c = String(p.content || '');
    if (!KW.test(c)) { continue; }
    const lines = c.split('\n').filter(l => KW.test(l));
    out.push({ name: p.name, n: lines.length, lines: lines.slice(0, 4).map(l => l.trim().slice(0, 110)) });
  }
  console.log('\n=== ' + tag + '：提到 token/字数/长度的条目（' + out.length + ' 条）===');
  out.forEach(o => {
    console.log('  · [' + o.name + '] ' + o.n + ' 行');
    o.lines.forEach(l => console.log('      ' + l));
  });
  return out;
}
const a = hits(myOn, '我们（默认开启的）');
const b = hits(refOn, '参考（默认开启的）');

/* 这些条目在顺序表里的位置（越靠前越优先） */
function posOf(preset, id) {
  const ord = (preset.prompt_order || []).find(o => o.character_id === 100001) || (preset.prompt_order || [])[0] || {};
  return (ord.order || []).findIndex(o => o.identifier === id);
}
console.log('\n=== 长度相关条目的顺序表位置 ===');
a.forEach(o => { const p = ps.find(x => x.name === o.name); console.log('  我们 [' + o.name + '] 位置 ' + posOf(j, p.identifier)); });
b.forEach(o => { const p = rs.find(x => x.name === o.name); console.log('  参考 [' + o.name + '] 位置 ' + posOf(r, p.identifier)); });

/* 采样参数：max_tokens / max output 之类的顶层字段 */
const numKeys = ['max_tokens', 'openai_max_tokens', 'truncation_length', 'max_length'];
console.log('\n=== 顶层数值字段 ===');
for (const k of numKeys) {
  const mv = (j[k] !== undefined) ? j[k] : (j.extensions && j.extensions[k]);
  const rv = (r[k] !== undefined) ? r[k] : (r.extensions && r.extensions[k]);
  console.log('  ' + k + ': 我们=' + JSON.stringify(mv) + ' 参考=' + JSON.stringify(rv));
}
/* 顶层所有数值字段对照（找长度/预算相关的） */
const allNum = (o) => Object.keys(o || {}).filter(k => typeof o[k] === 'number');
console.log('\n  我们顶层数字字段:', allNum(j).join(', ') || '(无)');
console.log('  参考顶层数字字段:', allNum(r).join(', ') || '(无)');
