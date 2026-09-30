#!/usr/bin/env node
/**
 * 探针：在没有真机酒馆的情况下，给 src/scripts/60-压缩.js 里的**纯逻辑函数**写自动化测试
 * ------------------------------------------------------------
 * 本文件是一次可行性验证（只读 src/，不写任何东西），跑法：
 *
 *     node .audit/probe-pure-logic-test.mjs
 *
 * 验证两条路：
 *   【路线乙】读源文件文本 → 用「括号配对扫描器」截出某个具名函数的完整源码
 *             → new Function() 求值 → 真调用它，断言返回值。
 *             好处：**不用改 src**，不用给脚本加导出，不用构建。
 *             代价：被截的函数必须自包含（不能引用 IIFE 里别的东西），
 *                   引用到的常量得连带截出来（见下面的 LB_BLOCK_PREFIX）。
 *   【路线丙的证据】本项目已有一个「零 import 的 ESM 共享模块」先例
 *             （test/harness/preset-parse.mjs，构建期被内联进 40/50 号脚本）。
 *             这种模块 node 可以直接 import，连扫描器都不用。
 *             本探针顺手 import 一次，证明这条路是通的。
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SRC60 = path.join(ROOT, 'src', 'scripts', '60-压缩.js');
const src = fs.readFileSync(SRC60, 'utf8');

let bad = 0, total = 0;
const ok = (cond, label, extra) => {
  total++;
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

/* ───────── 1. 源码扫描器：跳过字符串 / 注释 / 正则，做花括号配对 ───────── */

/** src[i] 是引号：返回「闭合引号之后」的下标。反引号里的 ${...} 递归配对。 */
function skipString(s, i) {
  const q = s[i];
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === q) { return i + 1; }
    if (q === '`' && c === '$' && s[i + 1] === '{') { i = skipBalanced(s, i + 1) - 1; }
  }
  throw new Error('字符串没闭合');
}

/** 这个 '/' 是正则字面量的开头吗？（看前一个有效字符） */
function regexAllowed(s, i) {
  for (let k = i - 1; k >= 0; k--) {
    const c = s[k];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { continue; }
    if ('(,=:[!&|?{};+-*%^~<>'.indexOf(c) >= 0) { return true; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = k;
      while (j >= 0 && /[A-Za-z_$]/.test(s[j])) { j--; }
      return /^(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(s.slice(j + 1, k + 1));
    }
    return false;
  }
  return true;
}

function skipRegex(s, i) {
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '[') { for (i++; i < s.length && s[i] !== ']'; i++) { if (s[i] === '\\') { i++; } } continue; }
    if (c === '/') { i++; while (i < s.length && /[a-z]/.test(s[i])) { i++; } return i; }
    if (c === '\n') { return i; }
  }
  throw new Error('正则没闭合');
}

/** src[i] === '{'：返回「配对右花括号之后」的下标 */
function skipBalanced(s, i) {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j; continue; }
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { i = skipString(s, i) - 1; continue; }
    if (c === '/' && regexAllowed(s, i)) { i = skipRegex(s, i) - 1; continue; }
    if (c === '{') { depth++; }
    else if (c === '}') { depth--; if (!depth) { return i + 1; } }
  }
  throw new Error('花括号没配平');
}

/** 从源码里截出 `function <name>(...) {...}` 的完整原文 */
function extractFunction(s, name) {
  const re = new RegExp('(?<![\\w$.])function\\s+' + name + '\\s*\\(');
  const m = re.exec(s);
  if (!m) { throw new Error('没找到函数声明：' + name); }
  let i = m.index + m[0].length - 1;          // 停在 '('
  let depth = 0;
  for (; i < s.length; i++) {
    if (s[i] === '(') { depth++; }
    else if (s[i] === ')') { depth--; if (!depth) { i++; break; } }
  }
  while (i < s.length && s[i] !== '{') { i++; }
  if (i >= s.length) { throw new Error(name + ' 后面没找到函数体'); }
  return s.slice(m.index, skipBalanced(s, i));
}

/** 从源码里截出 `var <name> = '<字符串>';` 的字符串值（纯逻辑函数引用的常量） */
function extractStringConst(s, name) {
  const m = new RegExp('var\\s+' + name + '\\s*=\\s*\'([^\']*)\'').exec(s);
  if (!m) { throw new Error('没找到字符串常量：' + name); }
  return m[1];
}

/* ───────── 2. 路线乙：截函数 → new Function → 真调用 ───────── */

const NAMES = ['stripBlockHeader', 'blockContent', 'blockComment', 'clip', 'fmtK', 'clampNum'];
const LB_BLOCK_PREFIX = extractStringConst(src, 'LB_BLOCK_PREFIX');
console.log('=== 路线乙：从 60-压缩.js 截取纯函数并在 node 里调用 ===');
console.log('源文件 ' + path.relative(ROOT, SRC60) + '（' + src.split('\n').length + ' 行）');
console.log('连带截出的常量 LB_BLOCK_PREFIX = ' + JSON.stringify(LB_BLOCK_PREFIX));

const pieces = NAMES.map(function (n) {
  const code = extractFunction(src, n);
  console.log('  [截取] ' + n + '  ' + code.split('\n').length + ' 行 / ' + code.length + ' B');
  return code;
});

const factory = new Function('LB_BLOCK_PREFIX',
  pieces.join('\n\n') + '\nreturn {' + NAMES.map(n => n + ': ' + n).join(', ') + '};');
const F = factory(LB_BLOCK_PREFIX);   // ← 六个真函数在这里跑起来
ok(NAMES.every(n => typeof F[n] === 'function'), '① 六个函数全部求值成功', NAMES.join('、'));

/* ② stripBlockHeader：带头的正文剥头，不带的原样，空值安全 */
const withHead = '【剧情提要｜楼层 3-9】\n她走进酒馆，把伞靠在门边。';
const noHead = '没有头的正文';
ok(F.stripBlockHeader(withHead) === '她走进酒馆，把伞靠在门边。', '② stripBlockHeader 剥掉【剧情提要】头', JSON.stringify(F.stripBlockHeader(withHead)));
ok(F.stripBlockHeader(noHead) === noHead, '② 没有头时原样返回', JSON.stringify(F.stripBlockHeader(noHead)));
ok(F.stripBlockHeader(null) === '' && F.stripBlockHeader(undefined) === '', '② null / undefined 不抛错，返回空串');

/* ③ blockContent / blockComment：块 → 世界书条目的「正文」与「条目名」 */
const b = { from: 3, to: 9, text: '她走进酒馆。' };
ok(F.blockContent(b) === '【剧情提要｜楼层 3-9】\n她走进酒馆。', '③ blockContent 拼出条目正文', JSON.stringify(F.blockContent(b)));
ok(F.blockComment(0, b) === '📜 压缩块 #1｜楼层 3-9', '③ blockComment 拼出条目名（index 从 0 数）', JSON.stringify(F.blockComment(0, b)));
ok(F.blockComment(11, { from: 200, to: 219 }) === '📜 压缩块 #12｜楼层 200-219', '③ 第 12 块的条目名', JSON.stringify(F.blockComment(11, { from: 200, to: 219 })));

/* ④ 往返：写进条目再读回来，正文必须一模一样（账本丢了靠这个「按名字收养」） */
ok(F.stripBlockHeader(F.blockContent(b)) === b.text, '④ blockContent → stripBlockHeader 往返不失真');

/* ⑤ clip：超长截断 */
ok(F.clip('abc', 10) === 'abc', '⑤ 不超长时原样', JSON.stringify(F.clip('abc', 10)));
ok(F.clip('abcdefghij', 3) === 'abc……（本楼过长，已截断）', '⑤ 超长时截断并加说明', JSON.stringify(F.clip('abcdefghij', 3)));
ok(F.clip(null, 5) === '' && F.clip(12345, 2) === '12……（本楼过长，已截断）', '⑤ null 安全、非字符串先转字符串');

/* ⑥ fmtK：状态栏数字（四舍五入到 0.1k / 1k） */
ok(F.fmtK(999) === '999', '⑥ <1000 原样', F.fmtK(999));
ok(F.fmtK(1500) === '1.5k', '⑥ 1000~9999 保留一位小数', F.fmtK(1500));
ok(F.fmtK(12345) === '12k', '⑥ >=10000 取整到 k', F.fmtK(12345));

/* ⑦ clampNum：数字框夹取 */
ok(F.clampNum(5, 0, 3) === 3 && F.clampNum(-1, 0, 3) === 0 && F.clampNum(2, 0, 3) === 2, '⑦ clampNum 三档都对',
  [F.clampNum(5, 0, 3), F.clampNum(-1, 0, 3), F.clampNum(2, 0, 3)].join(' / '));

/* ⑧ 反例：这个扫描器**不**适合截「引用了一大堆 IIFE 内部状态」的函数（会截到、但调用必炸）。
      说明「纯逻辑」是有边界的：能截 ≠ 能跑。 */
const depsHeavy = extractFunction(src, 'makeDepthCounter');
let heavyErr = null;
try {
  const g = new Function(depsHeavy + '\nreturn makeDepthCounter;')();
  g();
} catch (e) { heavyErr = e.constructor.name + ': ' + e.message; }
ok(!!heavyErr, '⑧ 依赖宿主状态的函数截出来也调不动（路线乙的边界）', heavyErr);

/* ───────── 3. 路线丙的证据：零 import 的 ESM 共享模块，node 直接 import ───────── */

console.log('');
console.log('=== 路线丙的证据：共享模块（零 import）node 直接 import ===');
const modUrl = url.pathToFileURL(path.join(ROOT, 'test', 'harness', 'preset-parse.mjs')).href;
const mod = await import(modUrl);
const exported = Object.keys(mod).filter(k => typeof mod[k] === 'function');
ok(exported.length > 0, '① test/harness/preset-parse.mjs 可直接 import（零依赖，无需构建）', exported.join('、'));
ok(typeof mod.parsePreset === 'function', '② 拿到 parsePreset（build/verify-model-switch.mjs:43 用的就是这招）');
let parseNote = '';
try {
  const preset = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'preset.base.json'), 'utf8'));
  const r = mod.parsePreset(preset);
  parseNote = '真预设上跑通了，顶层键 ' + Object.keys(r).join('/');
} catch (e) { parseNote = '（信息性）拿真预设直接跑 parsePreset 抛了 ' + e.message + '——它本来要求「已迁移态」的预设，与本探针无关'; }
console.log('  ' + parseNote);

/* ───────── 汇总 ───────── */
console.log('');
console.log(bad ? '★ 探针失败 ' + bad + ' / ' + total + ' 条' : '探针全部通过（' + total + ' / ' + total + '）');
process.exit(bad ? 1 : 0);
