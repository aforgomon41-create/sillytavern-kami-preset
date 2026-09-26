#!/usr/bin/env node
/**
 * 幂等同步：把「全局层」铺进源码（跑两次结果一致）。
 *   node build/sync-tavern.mjs [--dry]
 *
 * 做两件事（改 src/skin/tavern.css 或皮肤后重跑即可）：
 *   ① 令牌上提（契约 §3）：从每套皮肤 src/skins/<id>/skin.css 的每个**顶层**
 *      html[data-kami-skin="<id>"]….kami-root 规则里抽出全部 --kami-* 声明，
 *      按原选择器条件生成一份 <html> 作用域副本，追加到皮肤末尾的「生成块」里。
 *      —— 让全局层（tavern.css）在 <html> 上读得到该皮肤的颜色与圆角。
 *      · 只追加、不改写既有规则：.kami-root 层行为一字不变（预览台渗漏探针读数应一致）。
 *      · 顶层规则才上提；@media（如 prefers-reduced-motion 的时长）跳过 —— tavern 层用不到。
 *      · 生成块带起止标记，重跑先整块删除再按当前源码重建，故幂等。
 *   ② 全局层注入：把 src/skin/tavern.css 原文内联进 30-皮肤管理.js 的占位区
 *      （KAMI_TAVERN_CSS_BEGIN 与 KAMI_TAVERN_CSS_END 两个标记注释之间），
 *      运行时由 applyTo 注入酒馆页面。
 *
 * 为什么是脚本：令牌上提是「唯一需要 15 套皮肤同步的点」。做成幂等脚本后，
 * 将来的第 16 套皮肤跑一次即自动跟随，且不会重复改写已上提的皮肤。
 * 只写 src/ 下：src/scripts/30-皮肤管理.js 与 src/skins/<id>/skin.css。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKIN_DIR = path.join(ROOT, 'src', 'skins');
const SCRIPT = path.join(ROOT, 'src', 'scripts', '30-皮肤管理.js');
const TAVERN = path.join(ROOT, 'src', 'skin', 'tavern.css');
const dry = process.argv.includes('--dry');

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- 极简 CSS 解析：拆成 [{sel, decls:[{prop,val}], media}] ----------
   @media 内的规则 media 记为媒体条件；顶层规则 media 为 ''。@keyframes 不进规则表。 */
function parseRules(css) {
  let code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*\}/g, '');
  const rules = [];
  (function walk(text, ctx) {
    let i = 0, start = 0;
    while (i < text.length) {
      if (text[i] === '{') {
        let depth = 1, j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') { depth++; }
          else if (text[j] === '}') { depth--; }
          j++;
        }
        const prelude = text.slice(start, i).trim();
        const body = text.slice(i + 1, j - 1);
        if (prelude.startsWith('@')) { walk(body, ctx ? ctx + ' > ' + prelude : prelude); }
        else if (prelude) { rules.push({ sel: prelude, body, media: ctx || '' }); }
        i = j; start = j;
      } else { i++; }
    }
  })(code, '');
  return rules;
}
/* 只在括号外按逗号切选择器（:has(a,b) / 属性里的逗号不被切开） */
function splitSel(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') { depth++; }
    else if (ch === ')' || ch === ']') { depth--; }
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out.filter(Boolean);
}
/* 从规则体里抽出全部 --kami-*: value; 声明（保留值里的括号/逗号/中文） */
function tokenDecls(body) {
  const out = []; let depth = 0, cur = '';
  const push = (s) => {
    const t = s.trim(); if (!t) { return; }
    const k = t.indexOf(':'); if (k < 0) { return; }
    if (/^--[\w-]+$/.test(t.slice(0, k).trim())) { out.push(t.slice(0, k).trim() + ': ' + t.slice(k + 1).trim() + ';'); }
  };
  for (const ch of body) {
    if (ch === '(') { depth++; }
    else if (ch === ')') { depth--; }
    if (ch === ';' && depth === 0) { push(cur); cur = ''; continue; }
    cur += ch;
  }
  push(cur);
  return out;
}

/* ---------- ② 把 src/skin/tavern.css 内联进 30 号脚本占位区 ---------- */
const BEGIN = '/* @@KAMI_TAVERN_CSS_BEGIN@@ */';
const END = '/* @@KAMI_TAVERN_CSS_END@@ */';
function syncScript() {
  let code = fs.readFileSync(SCRIPT, 'utf8');
  if (code.indexOf(BEGIN) < 0 || code.indexOf(END) < 0) {
    throw new Error('30-皮肤管理.js 里找不到 TAVERN_CSS 占位区（' + BEGIN + ' … ' + END + '），请勿手删这两个标记');
  }
  const tavern = fs.readFileSync(TAVERN, 'utf8');
  const injected = BEGIN + '\n  var TAVERN_CSS = ' + JSON.stringify(tavern) + ';\n  ' + END;
  const re = new RegExp(escapeRe(BEGIN) + '[\\s\\S]*?' + escapeRe(END));
  const next = code.replace(re, () => injected);   // 函数式替换，$ 不当作引用
  const changed = next !== code;
  if (changed && !dry) { fs.writeFileSync(SCRIPT, next, 'utf8'); }
  return { changed, bytes: Buffer.byteLength(tavern) };
}

/* ---------- ① 令牌上提 ---------- */
const GEN_OPEN = '/* ==== 全局层令牌上提（build/sync-tavern.mjs 生成，勿手改；把 --kami-* 令牌同时定义到 <html>，契约 §3）==== */';
const GEN_CLOSE = '/* ==== END 全局层令牌上提 ==== */';
/* 行尾无关：皮肤源文件可能是 CRLF（Windows）或 LF；剥离标记两侧吃掉所有 \r/\n，
   生成时按文件主流行尾输出，避免「CRLF 主体 + LF 追加块」的混合行尾在外部
   （git autocrlf / 另一进程归一）后被误判成「又变了」。 */
const STRIP_RE = new RegExp('[\\r\\n]*' + escapeRe(GEN_OPEN) + '[\\s\\S]*?' + escapeRe(GEN_CLOSE) + '[\\r\\n]*');

function buildLift(css, id) {
  const PREFIX = 'html[data-kami-skin="' + id + '"]';
  const stripped = css.replace(STRIP_RE, '');          // 先删旧生成块（幂等）
  const total = (stripped.match(/\n/g) || []).length;
  const crlf = (stripped.match(/\r\n/g) || []).length;
  const EOL = crlf > (total - crlf) ? '\r\n' : '\n';   // 跟文件主流行尾走
  const rules = parseRules(stripped);
  const gen = [];
  for (const r of rules) {
    if (r.media) { continue; }                          // 只上提顶层（@media 的 reduced-motion 时长跳过）
    /* 每个以 PREFIX 开头、以 .kami-root 结尾的选择器 → 剥掉 .kami-root 得到 <html> 作用域 */
    const htmlSel = splitSel(r.sel)
      .map(s => (s.endsWith('.kami-root') ? s.slice(0, s.length - 10).trim() : null))
      .filter(s => s && s.indexOf(PREFIX) === 0);
    if (!htmlSel.length) { continue; }
    const toks = tokenDecls(r.body);
    if (!toks.length) { continue; }
    gen.push(htmlSel.join(',' + EOL) + ' {' + EOL + '  ' + toks.join(EOL + '  ') + EOL + '}');
  }
  if (!gen.length) { return { next: stripped.replace(/\s*$/, '') + EOL, blocks: 0 }; }
  const block = EOL + GEN_OPEN + EOL + gen.join(EOL) + EOL + GEN_CLOSE + EOL;
  return { next: stripped.replace(/\s*$/, '') + EOL + block, blocks: gen.length };
}

function liftSkin(id) {
  const p = path.join(SKIN_DIR, id, 'skin.css');
  const css = fs.readFileSync(p, 'utf8');
  const once = buildLift(css, id);
  const twice = buildLift(once.next, id);               // 自检：二次必须零变化
  if (twice.next !== once.next) {
    throw new Error(id + ' 的令牌上提不幂等（二次扫描仍有变化），终止以免写坏源码');
  }
  const changed = once.next !== css;
  if (changed && !dry) { fs.writeFileSync(p, once.next, 'utf8'); }
  return { changed, blocks: once.blocks };
}

/* ---------- 主流程 ---------- */
const scriptRes = syncScript();
console.log((scriptRes.changed ? '[注入] ' : '[保持] ') + '30-皮肤管理.js ← src/skin/tavern.css（' +
  scriptRes.bytes + 'B）' + (dry ? '  [dry：未写盘]' : ''));

if (!fs.existsSync(SKIN_DIR)) { console.log('（src/skins/ 为空）'); process.exit(0); }
const ids = fs.readdirSync(SKIN_DIR).filter(d => fs.statSync(path.join(SKIN_DIR, d)).isDirectory()).sort();
let changedSkins = 0, totalBlocks = 0;
for (const id of ids) {
  const r = liftSkin(id);
  if (r.changed) { changedSkins++; }
  totalBlocks += r.blocks;
  console.log('  ' + id.padEnd(10) + ' 生成 ' + r.blocks + ' 条 <html> 令牌规则 · ' + (r.changed ? '本轮写盘' : '无变化'));
}
console.log('\n全局层同步' + (dry ? '（dry）' : '完成') + '：15 套皮肤共生成 ' + totalBlocks +
  ' 条 <html> 令牌规则；本轮改动 ' + changedSkins + ' 套皮肤' +
  (scriptRes.changed ? ' + 30 号脚本' : '（30 号已最新）') + '。');
if (!dry && changedSkins === 0 && !scriptRes.changed) {
  console.log('（全部已是最新，重复运行零变化 —— 幂等 ✓）');
}
