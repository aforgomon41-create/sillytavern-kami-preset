#!/usr/bin/env node
/**
 * 皮肤包校验：node build/lint-skins.mjs [皮肤id...]
 * 规则见 docs/皮肤契约.md 第 7 节。不通过就没有资格进入构建产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKIN_DIR = path.join(ROOT, 'src', 'skins');
const only = process.argv.slice(2);

const base = fs.readFileSync(path.join(ROOT, 'src', 'skin', 'base.css'), 'utf8');
const ALL_TOKENS = [...new Set([...base.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]))];
const MUST = ALL_TOKENS.filter(t => !t.endsWith('-v'));

const REQUIRED_LABEL_TOKENS = ['--kami-label-think-title', '--kami-label-options-title'];
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

/** 只在括号外（顶层）按逗号切分选择器，避免把 :is(.a, .b) 切开 */
function splitSelectors(sel) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") { depth++; }
    else if (ch === ")" || ch === "]") { depth--; }
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) { out.push(cur.trim()); }
  return out.filter(Boolean);
}

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function hasAttrValue(code, attr, value) {
  return code.indexOf(attr + '~=' + DQ + value + DQ) >= 0 || code.indexOf(attr + '~=' + SQ + value + SQ) >= 0;
}

function checkSkin(id) {
  const dir = path.join(SKIN_DIR, id);
  const errs = [], warns = [];
  if (!fs.existsSync(dir)) { return { id, errs: ['目录不存在'], warns }; }
  const mp = path.join(dir, 'skin.json'), cp = path.join(dir, 'skin.css');
  if (!fs.existsSync(mp)) { errs.push('缺少 skin.json'); }
  if (!fs.existsSync(cp)) { errs.push('缺少 skin.css'); }
  if (errs.length) { return { id, errs, warns }; }

  const meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const css = fs.readFileSync(cp, 'utf8');
  const code = stripComments(css);

  for (const k of ['id', 'name', 'button']) { if (!meta[k]) { errs.push('skin.json 缺少字段 ' + k); } }
  if (meta.id !== id) { errs.push('skin.json 的 id (' + meta.id + ') 与目录名 (' + id + ') 不一致'); }
  if (meta.css) { warns.push('skin.json 里不该有 css 字段（皮肤 CSS 请写在 skin.css）'); }

  if (/@import/i.test(code)) { errs.push('出现 @import'); }
  if (/@font-face/i.test(code)) { errs.push('出现 @font-face（不允许外部字体）'); }
  if (/<script|javascript:/i.test(code)) { errs.push('出现脚本内容'); }
  if (/[\d.]+vh\b/i.test(code)) { errs.push('使用了 vh 单位'); }
  /* 只拦真正的“外部网络引用”，放行 data: URI 里的命名空间标识符（永不发起请求） */
  var lower = code.toLowerCase();
  /* 用纯字面量匹配，避免任何转义：url(http 同时覆盖 http:// 与 https:// */
  var NET_PATTERNS = [
    "url(http", "url(//",
    "url(@@SQ@@http", "url(@@DQ@@http", "url(@@SQ@@//", "url(@@DQ@@//",
    "@@import @@SQ@@http", "@@import @@DQ@@http",
    "src=http", "src=//",
  ];
  var netHits = NET_PATTERNS.filter(function (pat) {
    pat = pat.split("@@SQ@@").join(String.fromCharCode(39)).split("@@DQ@@").join(String.fromCharCode(34));
    return lower.indexOf(pat) >= 0;
  });

  const badSel = [];
  const cssNoAt = code
    .replace(/@media[^{]*\{/g, '{')
    .replace(/@supports[^{]*\{/g, '{')
    .replace(/@container[^{]*\{/g, '{')
    .replace(/@keyframes[\s\S]*?\}\s*\}/g, '');
  for (const m of cssNoAt.matchAll(/(^|[}])\s*([^{}@]+)\{/g)) {
    const sel = m[2].trim();
    if (!sel || sel.startsWith('from') || sel.startsWith('to') || /^[\d.]+%$/.test(sel)) { continue; }
    for (const part of sel.split(',')) {
      const t = part.trim();
      if (!t) { continue; }
      if (t.indexOf('kami') < 0) { badSel.push(t); }
    }
  }
  /* 每条选择器必须以该皮肤的作用域前缀原样开头（面板要做机械替换生成预览副本） */
  const PREFIX = "html[data-kami-skin=\"" + id + "\"]";
  const badPrefix = [];
  for (const m of cssNoAt.matchAll(/(^|[}])\s*([^{}@]+)\{/g)) {
    const sel = m[2].trim();
    if (!sel || sel.startsWith("from") || sel.startsWith("to") || /^[0-9.]+%$/.test(sel)) { continue; }
    for (const t of splitSelectors(sel)) {
      if (t.indexOf("kami") < 0) { continue; }
      if (t.indexOf(PREFIX) !== 0) { badPrefix.push(t); }
    }
  }
  if (badPrefix.length) {
    errs.push("选择器未以皮肤前缀开头（共 " + badPrefix.length + " 处）：" + badPrefix.slice(0, 4).join(" | "));
  }
  if (badSel.length) { errs.push('选择器未包含 kami（共 ' + badSel.length + ' 处）：' + badSel.slice(0, 5).join(' | ')); }

  const defined = new Set([...code.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const missing = MUST.filter(t => !defined.has(t));
  if (missing.length) { errs.push('缺少令牌（' + missing.length + ' 个）：' + missing.join(' ')); }
  const missingLabel = REQUIRED_LABEL_TOKENS.filter(t => !defined.has(t));
  if (missingLabel.length) { warns.push('没有提供文案令牌：' + missingLabel.join(' ') + '（皮肤会失去品牌化标题）'); }

  if (!/prefers-reduced-motion/.test(code)) { errs.push('缺少 prefers-reduced-motion 降级'); }
  if (!/data-kami-motion/.test(code)) { errs.push('缺少 data-kami-motion 档位响应'); }
  if (!/data-kami-density/.test(code)) { warns.push('没有响应 data-kami-density 密度档位'); }
  if (!/data-kami-scheme/.test(code)) { warns.push('没有响应 data-kami-scheme 明暗档位'); }
  if (!/:focus-visible/.test(code)) { errs.push('缺少 :focus-visible 焦点样式'); }
  if (!/--kami-fs-scale/.test(code)) { errs.push('没有把 --kami-fs-scale 乘进字号'); }

  for (const f of (meta.effects || [])) {
    if (!f.id || !f.label) { errs.push('effects 项缺少 id 或 label'); continue; }
    if (!hasAttrValue(code, 'data-kami-effects', f.id)) {
      errs.push('特效 ' + f.id + ' 在 CSS 里找不到 data-kami-effects 的规则');
    }
  }
  /* 装饰模块（契约 §8）：由皮肤声明、由皮肤管理注入。装饰 id 由平台定义，皮肤只声明要不要 */
  const KNOWN_DECOR = ['d20', 'd10'];
  if (meta.decor !== undefined) {
    if (!Array.isArray(meta.decor)) { errs.push('decor 必须是数组（如 ["d20"]）'); }
    else {
      for (const d of meta.decor) {
        if (typeof d !== 'string' || !d) { errs.push('decor 项必须是非空字符串'); continue; }
        if (KNOWN_DECOR.indexOf(d) < 0) { warns.push('decor 里的 ' + d + ' 不是皮肤管理认识的装饰模块，会被忽略'); }
        else if (code.indexOf('.kami-' + d) < 0) { warns.push('声明了 ' + d + ' 装饰，但 skin.css 里没有 .kami-' + d + ' 相关样式'); }
      }
    }
  }
  for (const p of (meta.params || [])) {
    if (!p.id || !p.label || !p.token) { errs.push('params 项缺少 id/label/token'); continue; }
    if (typeof p.min !== 'number' || typeof p.max !== 'number' || typeof p.value !== 'number') {
      errs.push('params.' + p.id + ' 缺少 min/max/value 数值');
    }
    if (p.min > p.value || p.value > p.max) { errs.push('params.' + p.id + ' 的 value 不在 min..max 内'); }
  }

  return { id, errs, warns, bytes: Buffer.byteLength(css), tokens: defined.size };
}

const ids = only.length ? only : (fs.existsSync(SKIN_DIR) ? fs.readdirSync(SKIN_DIR).filter(d => fs.statSync(path.join(SKIN_DIR, d)).isDirectory()) : []);
if (!ids.length) { console.log('（src/skins/ 下还没有皮肤包）'); process.exit(0); }

let bad = 0;
for (const id of ids) {
  const r = checkSkin(id);
  const ok = r.errs.length === 0;
  if (!ok) { bad++; }
  console.log((ok ? 'PASS  ' : 'FAIL  ') + id + (r.bytes ? '  (' + r.bytes + 'B, ' + r.tokens + ' 令牌)' : ''));
  for (const e of r.errs) { console.log('    x ' + e); }
  for (const w of r.warns) { console.log('    ! ' + w); }
}
console.log(bad ? ('\n' + bad + ' 套皮肤未通过校验') : '\n全部皮肤通过校验');
process.exit(bad ? 1 : 0);
