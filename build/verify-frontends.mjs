#!/usr/bin/env node
/**
 * 前端正则的真实语义验证（node build/verify-frontends.mjs）
 * ------------------------------------------------------------
 * 为什么需要它：酒馆 1.18 的正则引擎**不是** native String.replace。
 *   public/scripts/extensions/regex/engine.js:419-445
 *     rawString.replace(findRegex, function (match) {
 *       const args = [...arguments];
 *       const replaceString = regexScript.replaceString.replace(/{{match}}/gi, '$0');
 *       const replaceWithGroups = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, groupName) => {
 *         if (num) { match = args[Number(num)]; } else if (groupName) { ... }
 *         if (!match) { return ''; }
 *         return filterString(match, regexScript.trimStrings, {...});
 *       });
 *       return substituteParams(replaceWithGroups);
 *     });
 *
 * 关键差异：
 *   · 它**只认** $n 与 $<name>，**从不把 $$ 还原成 $**（那是 native 语义，酒馆不是）。
 *   · 替换结果最后还要过一遍 substituteParams（宏替换），所以前端文档里不能出现 {{...}}。
 * 这个脚本按酒馆的逐字语义重放一遍，并把展开后的内联脚本拿去编译，编译不过就退出码 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const NL = String.fromCharCode(10);
const FENCE = String.fromCharCode(96, 96, 96);

function newestPreset() {
  /* ⚠️ 2026-09-25 起构建号**按版本各自计数**（换版本号就重置），所以「只按构建号挑最新」是错的：
     0.90-131 会压过 0.91-30。必须**先比版本号、再比构建号**（交接 §二第 17 条那条副作用）。
     2026-09-26 实测踩到：新产物 0.91-30 已写出，这里却仍在验 0.90-131，
     于是新加的前端正则「找不到该正则」而误报 FAIL。 */
  let best = null, bestVer = -1, bestN = -1;
  const consider = (ver, build, file) => {
    if (ver > bestVer || (ver === bestVer && build > bestN)) {
      bestVer = ver; bestN = build; best = path.join(DIST, file);
    }
  };
  const verNum = (major, digits) => Number(major) + Number('0.' + digits);
  for (const f of fs.readdirSync(DIST)) {
    /* 现行 kami-v<版本>-<构建号>-<日期>.json、曾用 卡密预设v0.90-<构建号>-<日期>.json 与旧命名（0.9-52 / 0.9-260917-51）都认 */
    let m = /^(?:kami-|卡密预设)v(\d+)\.(\d+)-(\d{1,4})-\d{8}\.json$/i.exec(f);
    if (m) { consider(verNum(m[1], m[2]), Number(m[3]), f); continue; }
    m = /^(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d{1,4})\.json$/i.exec(f);
    if (m) { consider(0.9, Number(m[1]), f); }
  }
  return best;
}

/** 严格按酒馆 engine.js 的语义做替换（不实现 native 的 $$ -> $） */
function stReplace(rawString, findRegex, replaceString, trimStrings) {
  return rawString.replace(findRegex, function (match) {
    const args = [...arguments];
    const rs = String(replaceString).replace(/{{match}}/gi, '$0');
    const out = rs.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, groupName) => {
      let m = match;
      if (num) { m = args[Number(num)]; }
      else if (groupName) { const g = args[args.length - 1]; m = g && typeof g === 'object' && g[groupName]; }
      if (!m) { return ''; }
      return m;
    });
    return out;   // substituteParams 跳过，但要单独检查是否有 {{...}}
  });
}

/* 产物：优先用命令行传进来的那一个（build.mjs 会把**它刚写出的**文件路径传进来，
   避免「按文件猜最新」在构建号按版本重置之后挑错版本 —— 2026-09-26 实测踩过：
   新产物 0.91-30 已写出，这里却仍在验 0.90-131，新加的前端正则被误报「找不到该正则」）。 */
const presetPath = (process.argv[2] && fs.existsSync(process.argv[2])) ? process.argv[2] : newestPreset();
if (!presetPath) { console.log('dist 里没有产物'); process.exit(1); }
const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
const rx = preset.extensions.regex_scripts;
const targets = [
  /* ⚠️ 名字带版本号（2026-09-26 起三个前端各带自己的 vX.Y）——这里必须与 src/regex/list.json 逐字一致。
     ⚠️ 2026-09-26 起「前端|正文 v0.1」**不在这里**：它不再发 iframe 载荷，
     改成「两个空标记夹住正文」交给 45-正文外壳.js 在父文档里套壳 ——
     那条链路的守卫是 build/verify-body-shell.mjs（含「正则 → showdown」的端到端发射检查）。 */
  { name: '前端|显式思维链 v0.1', raw: '<nyaruko_think>' + '测试载荷 ' + String.fromCharCode(36) + '1 与 ' + String.fromCharCode(36) + '<name> 与 ' + String.fromCharCode(36) + String.fromCharCode(36) + ' 和换行' + NL + '第二行' + '</nyaruko_think>' },
  { name: '前端|行动选项 v0.1', raw: '<options>[{"title":"甲","type":"行动","content":"含 ' + String.fromCharCode(36) + '1 与 ' + String.fromCharCode(36) + ' 与反斜杠"}]</options>' },
];

let bad = 0;
console.log('=== 前端正则真实语义验证（产物：' + path.basename(presetPath) + '） ===');
for (const t of targets) {
  const r = rx.find(x => x.scriptName === t.name);
  if (!r) { console.log('FAIL  ' + t.name + '：找不到该正则'); bad++; continue; }
  const problems = [];

  /* 1) 模板里 $n / $<name> 必须只有载荷标记一个 */
  const marks = String(r.replaceString).match(/\$(\d+)|\$<([^>]+)>/g) || [];
  if (marks.length !== 1 || marks[0] !== String.fromCharCode(36) + '1') {
    problems.push('模板里的 $n/$<name> 占位应为且仅为 1 个 $1，实际 ' + marks.length + ' 个：' + marks.slice(0, 6).join(','));
  }
  /* 2) 模板里不能有 $$（酒馆不还原它） */
  const dbl = (String(r.replaceString).match(/\$\$/g) || []).length;
  if (dbl > 0) { problems.push('模板里出现 ' + dbl + ' 个 $$（酒馆不会把它还原成 $）'); }
  /* 3) 不能有会被 substituteParams 吃掉的宏 */
  const macros = String(r.replaceString).match(/\{\{[^}]{0,40}\}\}/g) || [];
  if (macros.length) { problems.push('模板里出现宏 ' + macros.slice(0, 3).join(',') + '（会被 substituteParams 替换掉）'); }

  /* 4) 按酒馆语义重放 */
  let replaced = '';
  try { replaced = stReplace(t.raw, eval(r.findRegex), r.replaceString, r.trimStrings || []); }
  catch (e) { problems.push('替换过程抛错：' + e.message); }

  /* 5) 去掉围栏，取出内联脚本并编译 */
  let inner = replaced;
  const first = replaced.indexOf(FENCE), last = replaced.lastIndexOf(FENCE);
  if (first >= 0 && last > first) { inner = replaced.slice(first + FENCE.length, last); }
  inner = inner.replace(/^\s*\n/, '');
  const codeRe = new RegExp('<script>([^]*?)</script>', 'g');
  let m, scripts = 0, compiled = 0;
  while ((m = codeRe.exec(inner)) !== null) {
    scripts++;
    try { new Function(m[1]); compiled++; }
    catch (e) { problems.push('内联脚本 #' + scripts + ' 编译失败：' + e.message); }
  }
  if (!scripts) { problems.push('没找到内联脚本'); }

  /* 6) 载荷必须恰好注入一次（注释里重复注入是历史 bug） */
  const payloadHits = inner.split('测试载荷').length - 1;
  if (t.name.indexOf('显式思维链') >= 0 && payloadHits > 1) {
    problems.push('载荷被注入了 ' + payloadHits + ' 次（应当只 1 次）');
  }

  if (problems.length) { bad++; console.log('FAIL  ' + t.name); problems.forEach(p => console.log('        x ' + p)); }
  else { console.log('PASS  ' + t.name + '  (' + scripts + ' 个脚本全部编译通过，载荷注入 1 次)'); }
}

console.log(bad ? (NL + bad + ' 个前端未通过验证') : NL + '全部前端通过验证');
process.exit(bad ? 1 : 0);
