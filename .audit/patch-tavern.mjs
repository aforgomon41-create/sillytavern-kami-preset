/* 一次性工具：把 .audit/tavern-new.css 的「宿主后代让位」子句补齐，写成 CRLF 的
   src/skin/tavern.css。
   规则：**选择器行里出现 `.mes_text` 的**，在第一个 `:where(` 段之后插入
   `:not([data-kami-mes-host] *)`；带 `> :where(...)`（子元素形态）的那条跳过。
   已经带该子句的行不重复补（幂等）。
     node .audit/patch-tavern.mjs [--apply]
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, '.audit', 'tavern-new.css');
const DST = path.join(ROOT, 'src', 'skin', 'tavern.css');
const APPLY = process.argv.includes('--apply');

const GATE = ':not([data-kami-mes-host] *)';
const lines = fs.readFileSync(SRC, 'utf8').split('\r\n').join('\n').split('\n');
let patched = 0;

for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (L.indexOf('.mes_text') < 0 || L.indexOf('{') >= 0) { continue; }   /* 只看选择器行 */
  if (L.indexOf('> :where(') >= 0) { continue; }                          /* 子元素形态：精确匹配，不加 */
  if (L.indexOf(GATE) >= 0) { continue; }                                 /* 已补过 */
  const m = L.match(/:where\([^)]*\)/);
  if (!m) { continue; }
  const at = m.index + m[0].length;
  lines[i] = L.slice(0, at) + GATE + L.slice(at);
  patched += 1;
}
const out = lines.join('\r\n');
const gateCount = (out.match(/data-kami-mes-host/g) || []).length;

if (!APPLY) {
  console.log('[干跑] 将补 ' + patched + ' 条选择器 · 写入后宿主让位子句共 ' + gateCount + ' 处 · ' + Buffer.byteLength(out) + ' 字节');
} else {
  fs.writeFileSync(DST, out, 'utf8');
  console.log('[写入] 补 ' + patched + ' 条选择器 · 宿主让位子句共 ' + gateCount + ' 处 · ' + Buffer.byteLength(out) + ' 字节');
}
