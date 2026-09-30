/* 校正 docs/大总结功能.md 里指向本仓库源码的行号引用（避免手工数错/改完代码后漂移）。
 *
 * 为什么要脚本：文档里十几处「（脚本第 N 行）」是证据的一部分（约定：行号与原文可复核），
 * 而源码一改行号就整体漂移。这份脚本**不写死数字** —— 它按锚点字符串去源码里现查行号，
 * 再回填文档，所以任何时候都能重跑。
 *
 * 用法：node .audit/fix-doc-lines.mjs          # 干跑，只打印
 *      node .audit/fix-doc-lines.mjs --apply  # 写盘
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', '大总结功能.md');
const SCRIPT = path.join(ROOT, 'src', 'scripts', '60-压缩.js');
const PURE = path.join(ROOT, 'src', 'scripts', '_summarize-pure.js');

const srcText = fs.readFileSync(SCRIPT, 'utf8').split('\n');
const pureText = fs.readFileSync(PURE, 'utf8').split('\n');
function lineOf(lines, anchor) {
  const i = lines.findIndex(l => l.indexOf(anchor) >= 0);
  if (i < 0) { throw new Error('源码里找不到锚点：' + anchor); }
  return i + 1;
}
function rangeOf(lines, from, to) {
  const a = lineOf(lines, from);
  const b = lineOf(lines, to);
  if (b < a) { throw new Error('锚点顺序反了：' + from + ' / ' + to); }
  return a + '-' + b;
}

/* [文档里的前后文正则（必须正好三个捕获组，中间那个是数字或区间）, 真实值] */
const RULES = [
  ['`OUTPUT_CONTRACT`（第 ', lineOf(srcText, 'var OUTPUT_CONTRACT')],
  ['`parseSummaryResponse()`（`src/scripts/_summarize-pure.js` 第 ', lineOf(pureText, 'export function parseSummaryResponse')],
  ['`looksLikeProviderError()`，第 ', lineOf(pureText, 'export function looksLikeProviderError')],
  ['`schemaMode`，脚本第 ', lineOf(srcText, "var schemaMode = 'on'")],
  ['`assembleBlockText()`，第 ', lineOf(pureText, 'export function assembleBlockText')],
  ['`blockComment()`（脚本第 ', lineOf(srcText, 'function blockComment')],
  ['`reconcileBlocks()`，`src/scripts/_summarize-pure.js` 第 ', lineOf(pureText, 'export function reconcileBlocks')],
  ['`pendingFloors()`，`_summarize-pure.js` 第 ', lineOf(pureText, 'export function pendingFloors')],
  ['`repairOrphans()`，脚本第 ', lineOf(srcText, 'async function repairOrphans')],
  ['`responseTextOf()` 那条兜底（脚本第 ', lineOf(srcText, 'function responseTextOf')],
  /* ⚠️ 前缀必须够长：'（脚本第 ' 这种泛前缀会先命中别人的引用（本轮踩过，差点改坏 blockComment 那条） */
  ['再往前推进新楼层（脚本第 ', rangeOf(srcText, '/* ① 补块：账本里有档案', 'var pendingChanged = JSON')],
  ['400ms 防抖（脚本第 ', rangeOf(srcText, 'var wiSyncTimer = null', '}, 400);')]
];

let doc = fs.readFileSync(DOC, 'utf8');
let bad = 0, changed = 0;
for (const [prefix, actual] of RULES) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(' + esc + ')(\\d+(?:-\\d+)?)( 行)');
  const m = doc.match(re);
  if (!m) { console.log('  [未匹配] ' + prefix); bad++; continue; }
  if (m[2] === String(actual)) { console.log('  [已是]   ' + prefix + actual); continue; }
  doc = doc.replace(re, m[1] + actual + m[3]);
  changed++;
  console.log('  [修正]   ' + prefix + m[2] + ' → ' + actual);
}
console.log('');
console.log('修正 ' + changed + ' 处，未匹配 ' + bad + ' 处');
if (process.argv[2] === '--apply') {
  if (bad) { console.error('有未匹配的规则，拒绝写盘（先把规则补对）'); process.exit(1); }
  fs.writeFileSync(DOC, doc, 'utf8');
  console.log('已写盘：' + DOC);
} else {
  console.log('（干跑；加 --apply 才写盘）');
}
process.exit(bad ? 1 : 0);
