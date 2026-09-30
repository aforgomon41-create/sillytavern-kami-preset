#!/usr/bin/env node
/**
 * 「压缩纯逻辑已内联」守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 为什么需要：`60-压缩.js` 里的解析器与对账器来自构建期内联的
 * `src/scripts/_summarize-pure.js`（走 build/kami-doc.mjs 的 expandSummarizePure）。
 * 内联一旦漏了（占位符拼错、模块改名、只改了 build 一侧），**构建照样全绿**：
 *   · 脚本编译护栏只做 `new Function(code)`，不执行；
 *   · 离线单测直接 import 那份源码，压根不看产物；
 *   · 桌面上打开面板也看不出来 —— 只有真机里点开压缩面板（或让它自动触发一次）
 *     才会炸 `ReferenceError: reconcileBlocks is not defined`。
 * 这个守卫就是那条缺口：内联必须真进了产物，且占位符不许残留。
 *
 * 用法：node build/verify-summarize-pure.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json，与 verify-frontends.mjs 同规矩）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function newestProduct() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) { return null; }
  const files = fs.readdirSync(dir)
    .filter(f => /^kami-.*\.json$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

let p = process.argv[2];
if (!p) {
  p = newestProduct();
  if (!p) { console.error('用法：node build/verify-summarize-pure.mjs <产物路径>（dist/ 里也没有产物）'); process.exit(2); }
}
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const zip = scripts.find(s => String(s.name).indexOf('压缩') >= 0);
const code = String((zip && zip.content) || '');

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 压缩纯逻辑内联验证（' + path.basename(p) + '） ===');

ok(!!zip, '① 产物里有「压缩」脚本', zip ? zip.name : '没找到');

/* ② 纯逻辑模块的每个出口都要真的在产物里 */
const FUNCS = [
  'parseSummaryResponse', 'assembleBlockText', 'normalizeSummaryFields', 'extractJsonObject',
  'looksLikeProviderError', 'summaryJsonSchema', 'reconcileBlocks', 'pendingFloors',
  'rangesOf', 'mergeRanges', 'subtractRanges', 'parseBlockName', 'stripBlockHeader', 'blockContent'
];
const missing = FUNCS.filter(f => code.indexOf('function ' + f + '(') < 0);
ok(missing.length === 0, '② 纯逻辑模块的函数都在产物里（' + FUNCS.length + ' 个）', missing.join('、') || '全在');

/* ③ 占位符不许残留（残留 = 内联没跑，运行时才会炸） */
ok(code.indexOf('@@KAMI_SUMMARIZE_PURE@@') < 0, '③ 占位符 @@KAMI_SUMMARIZE_PURE@@ 没有残留');

/* ④ 模块里的函数声明不该带 export（内联规则是去掉行首 export；带出来就是语法错误，双保险） */
ok(!/^\s*export\s/m.test(code), '④ 产物里没有行首 export（内联规则生效）');

/* ⑤ 关键接线：结构化输出、运行期契约、对账、世界书同步、补块都要真被调用 */
const WIRING = [
  ['summaryJsonSchema()', '摘要请求带上 json_schema'],
  ['OUTPUT_CONTRACT', '运行期输出格式契约被拼进请求'],
  ['reconcileBlocks(', '面板/流水线走对账结果'],
  ['parseSummaryResponse(', '响应过解析器'],
  ['WORLDINFO_UPDATED', '世界书保存事件挂上了'],
  ['pendingFloors(', '待重做段参与取材'],
  ['repairOrphans', '孤儿隐藏楼层的按钮链路在']
];
const notWired = WIRING.filter(([needle]) => code.indexOf(needle) < 0);
ok(notWired.length === 0, '⑤ 七处关键接线都在', notWired.map(x => x[1]).join('、') || '全在');

/* ⑥ 引擎不许被"顺手改回去"：正文的唯一真相是块条目 */
ok(code.indexOf('function blockContent(') >= 0 && code.indexOf('blockContent(b.from, b.to, b.text)') >= 0,
  '⑥ 条目正文按 (from,to,text) 组装（正文的唯一真相是块条目）');
ok(code.indexOf('blocks: ledgerBlocks') >= 0 && !/JSON\.stringify\(\s*\{\s*v: 2/.test(code),
  '⑥ 账本写的是 v3 结构（不再存正文副本）');

/* ⑦ 离线单测文件必须存在（否则这份守卫会掩盖"纯逻辑没人测"的事实） */
const testFile = path.join(ROOT, 'test', 'harness', 'summarize-pure.mjs');
ok(fs.existsSync(testFile), '⑦ 离线单测还在（test/harness/summarize-pure.mjs）');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '压缩纯逻辑内联验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
