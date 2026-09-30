#!/usr/bin/env node
/**
 * 「非必要不开」守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 用户 2026-09-28 点名的规矩：**条目标题里带 `(非必要不开)` 的，默认关；选模型时也不跟着开。**
 * 这类条目是破限 / 抗审用的（🐱 抗输入审、🐱 听话！Gemini、🐱 Gemini倒打一耙），
 * 平时不该开 —— 要用的时候自己去条目卡上点开。
 * 之前的行为是「点模型卡片头 = 开它名下全部条目」，而 🐱 名下正好全是这三条 ⇒ 一选 Gemini 就全开了。
 * 守卫分两半：**数据**（产物里它们必须都是关的）+ **代码**（40 号的 selectModel 里那处跳过还在）。
 *
 * 用法：node build/verify-model-switch.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-model-switch.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const TAG = '非必要不开';

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 「非必要不开」条目验证（' + path.basename(p) + '） ===');

/* ① 数据：这些条目默认必须是关的 */
const order = ((preset.prompt_order || []).find(o => o.character_id === 100001) || (preset.prompt_order || [])[0] || {}).order || [];
const onMap = new Map(order.map(o => [o.identifier, o.enabled !== false]));
const tagged = (preset.prompts || []).filter(e => String(e.name || '').indexOf(TAG) >= 0);
ok(tagged.length > 0, '① 产物里确实有带「' + TAG + '」的条目', tagged.map(e => e.name).join('、') || '一条都没有');
const wronglyOn = tagged.filter(e => onMap.get(e.identifier) === true);
ok(wronglyOn.length === 0, '① 它们默认都是关的', wronglyOn.map(e => e.name).join('、') || '全部关闭');

/* ② 这些条目确实属于某个模型（否则「选模型时跳过」这条规则就是空谈，守卫也就白设了） */
const parserPath = path.join(ROOT, 'test', 'harness', 'preset-parse.mjs');
const { parsePreset } = await import('file://' + parserPath.replace(/\\/g, '/'));
const r = parsePreset(preset);
const items = [], seen = new Set();
(function walk(n) {
  if (!n || typeof n !== 'object') { return; }
  if (Array.isArray(n)) { n.forEach(walk); return; }
  if (Array.isArray(n.items)) { n.items.forEach(it => { if (it && it.identifier && !seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); } }); }
  ['cards', 'tabs', 'layers', 'children'].forEach(k => { if (Array.isArray(n[k])) { n[k].forEach(walk); } });
  if (Array.isArray(n.own)) { n.own.forEach(it => { if (it && it.identifier && !seen.has(it.identifier)) { seen.add(it.identifier); items.push(it); } }); }
})(r);
const byId = new Map(items.map(it => [it.identifier, it]));
const taggedWithModel = tagged.filter(e => ((byId.get(e.identifier) || {}).models || []).length > 0);
ok(taggedWithModel.length > 0, '② 其中至少有一条挂在模型名下（不然这条规则不会生效）',
  taggedWithModel.map(e => e.name + '→' + (byId.get(e.identifier).models || []).join('')).join('、') || '一条都没有');

/* ③ 代码：40 号的 selectModel 里那处跳过还在（这是真正决定行为的地方） */
const panel = String(((preset.extensions?.tavern_helper?.scripts) || []).find(s => String(s.name).indexOf('预设设置') >= 0)?.content || '');
ok(panel.indexOf('function isOptionalOff') >= 0, '③ 40 号里有 isOptionalOff 判定');
ok(/if \(isOptionalOff\(it\)\) \{ skipped\.push/.test(panel), '③ 选模型时对这类条目**跳过开启**（不是只写个函数不用）');
ok(panel.indexOf("indexOf('" + TAG + "')") >= 0, '③ 判定用的就是标题里的「' + TAG + '」标签');

/* ④ 反向：产物里不该出现「默认开着且标了非必要不开」的组合 —— 与 ① 同义，但顺手核对标签写法没被改坏 */
const loose = (preset.prompts || []).filter(e => /非必要不开|不必开|非必须/.test(String(e.name)) && !String(e.name).includes(TAG));
ok(loose.length === 0, '④ 没有写成别的说法的同类标签（防止改文案时把标签改了）', loose.map(e => e.name).join('、') || '干净');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '「非必要不开」验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
