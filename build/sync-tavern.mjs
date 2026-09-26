#!/usr/bin/env node
/**
 * 幂等同步：把「令牌上提」铺进源码（跑两次结果一致）。
 *   node build/sync-tavern.mjs [--dry]
 *
 * 只做一件事（改皮肤后重跑即可）：
 *   **令牌上提（契约 §3）**：从每套皮肤 src/skins/<id>/skin.css 的
 *   html[data-kami-skin="<id>"]….kami-root 规则里抽出全部 --kami-* 声明，
 *   按原选择器条件生成一份 <html> 作用域副本，追加到皮肤末尾的「生成块」里。
 *     · 只追加、不改写既有规则：.kami-root 层行为一字不变。
 *     · 顶层规则才上提；@media（如 prefers-reduced-motion 的时长）跳过。
 *     · 判据是「选择器里出现 .kami-root」（不是「以它结尾」）—— 因为皮肤把**组件面专用令牌
 *       的重映射**写在 `.kami-root .kami-md, .kami-root .kami-raw` 这类多段选择器上
 *       （如 grokbot 的 --kami-clay-*）；判据收紧会整批漏掉，兜底皮肤与其它非 .kami-root
 *       消费方就读不到那套配色。
 *     · 生成块带起止标记，重跑先整块删除再按当前源码重建，故幂等。
 *
 * ⛔ **已删除的两件事（2026-09-26 用户裁定「我们不动酒馆本身了」）**：
 *   ① 全局层注入 —— 以前把 src/skin/tavern.css 内联进 30-皮肤管理.js 的占位区、
 *      运行时注入酒馆页面（#sheld/#chat/.mes/.mes_text 的底色/圆角/间距/字体）。文件已删。
 *   ② 消息楼层的面与特效镜像 —— 见下面 MES_DORMANT 那段（代码保留、不参与生成）。
 *   现在这份脚本**不写酒馆 UI 一个像素**。
 *
 * 为什么是脚本：令牌上提是「唯一需要 15 套皮肤同步的点」。做成幂等脚本后，
 * 将来的第 16 套皮肤跑一次即自动跟随，且不会重复改写已上提的皮肤。
 * 只写 src/skins/<id>/skin.css。
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

/* ---------- ② 全局层注入 ----------
   ⛔ 已停用（2026-09-26 用户裁定「连外壳层美化也不需要，我们不动酒馆本身了」）：
   以前这里把 src/skin/tavern.css 内联进 30 号脚本的占位区，由脚本注入酒馆页面 —— 那套
   「消息区外壳」（#sheld / #chat / .mes / .mes_text 的底色、圆角、间距、字体）**整体删除**，
   src/skin/tavern.css 文件也已删。酒馆本身的 UI 我们**一个像素都不再动**。
   本文件现在只剩一件事：**令牌上提**（见下）—— 它是**结构性**的，不是酒馆 UI 美化：
   皮肤把组件面专用令牌重映射写在 `.kami-root` 上（如 grokbot 的 --kami-clay-*），
   不上提到 <html> 的话，兜底皮肤与将来的非 .kami-root 消费方就读不到。
   要彻底连它一起删：删掉 30 号脚本里的占位区与 applyTo 注入（已经没有了）、
   liftSkin 的调用、以及 15 套皮肤末尾的「全局层令牌上提」生成块。 */
function syncScript() { return { changed: false, bytes: 0, skipped: true }; }

/* ---------- 颜色令牌解析（生成期把 var() 链算成实际色值）----------
   为什么必须算出来：皮肤写了很多「组件面 → 另一套配色」的**后代规则**（如 .kami-md 块把
   --kami-fg 重映射成墨色/纸色）。这些规则搬到消息楼层之后，字色会跟 .mes 的底色**脱对**
   —— 实测 terminal 上出现「深绿字 × 深绿卡」1.01:1，等于整段不可读。
   解法：生成期把 --kami-bg / --kami-fg 两支令牌**按皮肤自己的链算成实际色值**，
   写成消息楼层的**保底成对规则**（放在生成块最后、命中 .mes 与 .mes_text，把字色钉死）。
   于是「谁改色谁配底」这条纪律在镜像之后仍然成立。 */
function tokenMap(rules) {
  const map = new Map();               // 'sel||token' -> value
  for (const r of rules) {
    if (r.media) { continue; }
    for (const d of tokenDecls(r.body)) {
      const k = d.indexOf(':');
      const name = d.slice(0, k).trim(), val = d.slice(k + 1).trim().replace(/;$/, '').trim();
      for (const s of splitSel(r.sel)) { map.set(s + '||' + name, val); }
    }
  }
  return map;
}
/* 逐层剥 var()：先在精确选择器上找，再退到任何以该选择器结尾（或它就是 html 前缀）的规则 */
function resolveToken(map, sel, token, depth) {
  depth = depth || 0;
  if (depth > 8) { return null; }
  let raw = null;
  if (map.has(sel + '||' + token)) { raw = map.get(sel + '||' + token); }
  if (raw == null) {
    for (const [k, v] of map) {
      const s = k.slice(0, k.indexOf('||'));
      if (s === sel || s.endsWith(' ' + sel) || s.endsWith(sel)) { raw = v; break; }
    }
  }
  if (raw == null) { return null; }
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(raw);
  if (!m) { return /^#|^rgb|^hsl|^[a-z]+$/i.test(raw) ? raw : null; }
  const inner = resolveToken(map, sel, m[1], depth + 1);
  return inner || (m[2] ? m[2].trim() : null);
}

/* ---------- ① 令牌上提 ---------- */
const GEN_OPEN = '/* ==== 全局层令牌上提（build/sync-tavern.mjs 生成，勿手改；把 --kami-* 令牌同时定义到 <html>，契约 §3）==== */';
const GEN_CLOSE = '/* ==== END 全局层令牌上提 ==== */';
/* 行尾无关：皮肤源文件可能是 CRLF（Windows）或 LF；剥离标记两侧吃掉所有 \r/\n，
   生成时按文件主流行尾输出，避免「CRLF 主体 + LF 追加块」的混合行尾在外部
   （git autocrlf / 另一进程归一）后被误判成「又变了」。 */
const STRIP_RE = new RegExp('[\\r\\n]*' + escapeRe(GEN_OPEN) + '[\\s\\S]*?' + escapeRe(GEN_CLOSE) + '[\\r\\n]*');

/* 生成块的剥离与拼装：不用「吃掉两侧换行」的正则（那种写法对行尾极度敏感，
   一旦拼装时把内容末尾与生成块粘在一起，第二轮就咬不住、块会越滚越大 —— 2026-09-26 实测踩过）。
   改成三步确定性写法：① 按标记整块删除；② 规范化行尾与尾部空白；③ 统一拼装。 */
function stripBlocks(text) {
  return text.split(STRIP_MES_RE).join('').split(STRIP_RE).join('');
}
function normalize(text, EOL) {
  return text.split('\r\n').join('\n').replace(/[ \t\n]+$/, '').split('\n').join(EOL);
}
function assemble(stripped, blks, EOL) {
  const head = normalize(stripped, EOL);
  return head + EOL + (blks.length ? EOL + blks.join(EOL + EOL) + EOL : '');
}

/* 「哪些令牌算基础令牌、可以上提」：只要声明块里出现 --kami-* 就上提。
   ⚠️ 2026-09-26 起从「选择器必须以 .kami-root 结尾」放宽成「选择器里出现 .kami-root」——
   原因是皮肤把**组件面专用的令牌重映射**写在 `.kami-root .kami-md, .kami-root .kami-raw` 上
   （grokbot 的 --kami-clay-* 系列、memo 的纸色、nixie 的管色…），旧写法把这类整批跳过，
   结果全局层读到的是「另一套配色」（实测：grokbot 的消息卡拿到炭底而不是黏土白），
   而它写在 .kami-shell 上的 background-color: var(--kami-clay-surface) 更会解析成空、整条声明被丢。
   放宽后这类重映射也进 <html>，三样东西（面 / 字色 / 令牌）就落在同一个作用域上，成对成立。
   自定义属性只向下继承，所以对 .kami-root 层是纯增量、行为不变。 */
function buildLift(css, id) {
  const PREFIX = 'html[data-kami-skin="' + id + '"]';
  const stripped = stripBlocks(css);                   // 先删旧生成块（幂等）
  const total = (stripped.match(/\n/g) || []).length;
  const crlf = (stripped.match(/\r\n/g) || []).length;
  const EOL = crlf > (total - crlf) ? '\r\n' : '\n';   // 跟文件主流行尾走
  const rules = parseRules(stripped);
  const gen = [];
  for (const r of rules) {    if (r.media) { continue; }                          // 只上提顶层（@media 的 reduced-motion 时长跳过）
    /* 每个含 .kami-root 的选择器 → 剥掉 .kami-root 得到 <html> 作用域 */
    const htmlSel = [];
    for (const s of splitSel(r.sel)) {
      const at = s.indexOf('.kami-root');
      if (at < 0) { continue; }
      const head = s.slice(0, at).trim();               // 形如 html[data-kami-skin="x"][data-kami-scheme="light"]
      if (head.indexOf(PREFIX) !== 0) { continue; }
      if (!/\{/.test(head) && htmlSel.indexOf(head) < 0) { htmlSel.push(head); }
    }
    if (!htmlSel.length) { continue; }
    const toks = tokenDecls(r.body);
    if (!toks.length) { continue; }
    gen.push(htmlSel.join(',' + EOL) + ' {' + EOL + '  ' + toks.join(EOL + '  ') + EOL + '}');
  }
  return { stripped, EOL, gen, rules, PREFIX };
}

/* ---------- ③ 消息楼层的「面 + 特效」镜像 ----------
   为什么要有这一段（2026-09-26 用户点名）：
     皮肤的「面」与「特效」是按**组件类名**挂的 —— 面在 .kami-shell / .kami-surface 上，
     特效是挂在这两个类与 .kami-root 上的 ::before / ::after 与 animation。
     而酒馆的消息楼层里**没有这些类名**，所以 15 套皮肤的面与特效一条都不命中，
     只有全局层手写的那点底色。用户的原话是「消息楼层仍然是酒馆原生背景，各皮肤的特效也没作用上」。
   做法：把皮肤写在这些类上的**视觉声明**改写成消息楼层作用域，追加回同一套皮肤的生成块里。
     源码仍是皮肤文件（单一真相），消息楼层只是它的一个作用域投影，改皮肤→重跑即同步。
   四条机械判据（都出自实测）：
     1. **只碰壳与面**：选择器里出现 .kami-shell / .kami-surface，或 .kami-root 的**裸规则**
        （`.kami-root { … }` 这种整块底）。带 .kami-drop / [data-kami-comp="panel"] / .kami-card /
        .kami-item / .kami-head / .kami-title / .kami-dot 这些**面板与组件内部**的一律跳过并列进报告
        —— 消息楼层上根本没有那些元素，搬过去只会是错的语义。
     2. **只搬视觉属性**（白名单）。几何属性一律不搬：margin / padding / width / height / overflow /
        position / display / flex* / cursor / pointer-events / user-select / gap。
        理由：.mes 是 display:flex 的一行（头像列 + swipe 按钮的几何靠它），
        而且酒馆自己的 style.css 已经把 .mes 定成 position:relative + padding:10px 10px 0，
        被皮肤夺走 display 会直接歪（探针 shell 原型实测：display:block 就是歪的）。
     3. **overflow 永不搬**：消息楼层里有插件浮层与头像列，裁一下就可能被切掉。
     4. `.kami-md`（正文块）只搬**底色族**，不搬 padding/border —— 底色与描边已经由 ③ 段给在 .mes 上了，
        再给 .mes_text 来一套就是「卡片套卡片」（旧设计简报 §C-2 专门否过一次）。 */
/* 消息楼层的「面 + 特效」镜像 ---------- ⛔ 已停用（2026-09-26 用户裁定「删掉消息楼层美化相关的更新，
   效果始终不好」）。下面这一整段**保留代码、不参与生成**（MES_DORMANT）。为什么留着而不删：
   它已过 15 套实测（含两个坑的修法：色彩配对解析、宿主闸门），将来做「状态栏 / 别的酒馆 UI 皮肤化」
   会直接复用；成本只是文件里多一段死代码。要彻底删：删 MES_* 常量、FACE_PROPS / TEXT_PROPS /
   PANEL_MARKERS、gate()、mapSel()、declList()、tokenMap()、resolveToken()、buildMes() 与 liftSkin 里的调用。
   ⚠️ 唯一仍在跑的是**剥离**：老版本升级上来的皮肤文件里若还留着那段镜像，会被清掉（幂等）。 */
const MES_DORMANT = true;
const MES_OPEN = '/* ==== 消息楼层的面与特效镜像（build/sync-tavern.mjs 生成，勿手改；契约 §9.8-8）==== */';
const MES_CLOSE = '/* ==== END 消息楼层的面与特效镜像 ==== */';
const STRIP_MES_RE = new RegExp('[\\r\\n]*' + escapeRe(MES_OPEN) + '[\\s\\S]*?' + escapeRe(MES_CLOSE) + '[\\r\\n]*');

/* 面（.mes）可搬的视觉属性白名单 —— 少一个就会「皮肤写了但没生效」，多一个就会动到骨头 */
const FACE_PROPS = new Set([
  'background', 'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-attachment', 'background-blend-mode', 'background-clip', 'background-origin',
  'border', 'border-color', 'border-style', 'border-width', 'border-radius',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'clip-path', 'isolation',
  'mix-blend-mode', 'opacity', 'color', 'font-family', 'letter-spacing',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode',
  'animation-play-state', 'will-change', 'content',
  'inset', 'top', 'right', 'bottom', 'left', 'z-index',
]);
/* 正文块（.mes_text）只搬这些 —— 再搬别的就是「卡片套卡片」/改酒馆的正文排版 */
const TEXT_PROPS = new Set(['background', 'background-color', 'background-image', 'color', 'text-shadow']);
/* 面板与组件内部的类：出现在选择器里就整条跳过（消息楼层上没有这些元素） */
const PANEL_MARKERS = ['.kami-drop', '[data-kami-comp="panel"]', '.kami-card', '.kami-item', '.kami-head',
  '.kami-title', '.kami-foot', '.kami-btn', '.kami-chip', '.kami-seg', '.kami-tabs', '.kami-pane',
  '.kami-dot', '.kami-list', '.kami-empty', '.kami-toast', '.kami-collapse', '.kami-bar', '.kami-chev',
  '.kami-shell--', '.kami-icon-btn', '.kami-field', '.kami-num', '.kami-select', '.kami-pv'];

function declList(body) {
  const out = []; let depth = 0, cur = '';
  const push = (s) => {
    const t = s.trim(); if (!t) { return; }
    const k = t.indexOf(':'); if (k < 0) { return; }
    out.push({ prop: t.slice(0, k).trim().toLowerCase(), val: t.slice(k + 1).trim() });
  };
  for (const ch of body) {
    if (ch === '(') { depth++; } else if (ch === ')') { depth--; }
    if (ch === ';' && depth === 0) { push(cur); cur = ''; continue; }
    cur += ch;
  }
  push(cur);
  return out;
}
/* 镜像规则必须自带「宿主让位」闸门：生成出来的选择器特异性 (1,3,1) 比全局层手写那条
   `… .mes_text strong:not([data-kami-mes-host] *)`（也是 (1,3,1)）**一样高**，
   但生成块排在后面 → 会压过闸门、漏进插件卡片（实测：卡片里的 <strong> 被染成皮肤字色）。
   所以把闸门直接编进生成的选择器：`:not(:where([data-kami-mes-host] *))` 补在最后一个
   复合选择器的末尾（伪元素 `::before` 之前）。用 :where() 把这条 :not() 的特异性压成 0，
   保持生成规则原有的特异性，不改与全局层的相对胜负。 */
function gate(s) {
  const pe = s.indexOf('::');
  return pe < 0 ? s + ':not(:where([data-kami-mes-host] *))'
    : s.slice(0, pe) + ':not(:where([data-kami-mes-host] *))' + s.slice(pe);
}
/* 把一个选择器里的组件类替换成消息楼层目标；返回 null = 这条跳过 */
function mapSel(s) {
  for (const m of PANEL_MARKERS) { if (s.indexOf(m) >= 0) { return null; } }
  const hasFace = s.indexOf('.kami-shell') >= 0 || s.indexOf('.kami-surface') >= 0;
  const bareRoot = /(^|[\s>+~])\.kami-root(?![\w-])/.test(s.replace(/\.kami-shell|\.kami-surface/g, ''));
  const hasText = s.indexOf('.kami-md') >= 0 || s.indexOf('.kami-body') >= 0;
  if (!hasFace && !bareRoot && !hasText) { return null; }
  let out = replaceAll(s, '.kami-shell', '#chat[data-kami-mes="1"] .mes');
  out = replaceAll(out, '.kami-surface', '#chat[data-kami-mes="1"] .mes');
  if (bareRoot) { out = out.replace(/(^|[\s>+~])\.kami-root(?![\w-])/g, '$1#chat[data-kami-mes="1"] .mes'); }
  out = replaceAll(out, '.kami-md', '#chat[data-kami-mes="1"] .mes_text');
  out = replaceAll(out, '.kami-body', '#chat[data-kami-mes="1"] .mes_text');
  return { sel: gate(out.replace(/\s+/g, ' ').trim()), kind: hasFace || bareRoot ? 'face' : 'text' };
}
function replaceAll(s, find, to) { return s.split(find).join(to); }

function buildMes(rules, id, EOL) {
  const PREFIX = 'html[data-kami-skin="' + id + '"]';
  const gen = [], skipped = [];
  for (const r of rules) {
    if (r.media) { continue; }
    const sels = [];
    let kind = null;
    for (const s of splitSel(r.sel)) {
      const m = mapSel(s);
      if (!m) { skipped.push(s); continue; }
      if (!kind) { kind = m.kind; }
      if (sels.indexOf(m.sel) < 0) { sels.push(m.sel); }
    }
    if (!sels.length || !kind) { continue; }
    const allow = kind === 'face' ? FACE_PROPS : TEXT_PROPS;
    const decls = declList(r.body).filter(d => allow.has(d.prop));
    if (!decls.length) { continue; }
    gen.push(sels.join(',' + EOL) + ' {' + EOL + '  ' + decls.map(d => d.prop + ': ' + d.val + ';').join(EOL + '  ') + EOL + '}');
  }
  /* ★ 保底成对：把 --kami-bg × --kami-fg 两支令牌在生成期算成实际色值，钉死在消息楼层上。
     必须排在生成块**最后**（同一特异性靠文档顺序赢），而且 :is(:not([data-kami-mes-host] *))
     保证插件宿主整棵子树不吃这一口（宿主有自己的底色与字色）。 */
  /* 皮肤令牌的**基座**选择器不是 <html>，而是 `… .kami-root`（<html> 那一份是上提脚本生成的，
     在源码里并不存在）。所以解析底色/字色时要挂在 .kami-root 上；亮档再叠一层 scheme 属性。 */
  const ROOT_SEL = PREFIX + ' .kami-root';
  const map = tokenMap(rules);
  const pairOf = (sel) => {
    const bg = resolveToken(map, sel, '--kami-bg', 0);
    const fg = resolveToken(map, sel, '--kami-fg', 0);
    const dim = resolveToken(map, sel, '--kami-fg-dim', 0);
    const mute = resolveToken(map, sel, '--kami-fg-mute', 0);
    return bg && fg ? { bg, fg, dim, mute } : null;
  };
  const dark = pairOf(ROOT_SEL);
  const light = pairOf(PREFIX + '[data-kami-scheme="light"] ' + '.kami-root');
  /* 规则里同时把三支字色令牌钉回「与底成对」的那一套：生成的镜像里可能有
     `.mes_text` 级别的 --kami-fg 重映射（组件里那是给另一种底用的墨色），
     它一漏下来，消息楼层里所有跟着 --kami-fg 走的元素（strong / a / code / 标题）
     就全变成深墨 —— 实测 empire 上 dark→1.03:1（等于整段看不见）。 */
  const pair = (sel, p) => sel + ' {' + EOL + '  background-color: ' + p.bg + ';' + EOL + '  color: ' + p.fg + ';' +
    EOL + '  --kami-fg: ' + p.fg + ';' + (p.dim ? EOL + '  --kami-fg-dim: ' + p.dim + ';' : '') +
    (p.mute ? EOL + '  --kami-fg-mute: ' + p.mute + ';' : '') + EOL + '}';
  if (dark) {
    const scoped = (extra) => '#chat[data-kami-mes="1"] .mes' + extra + ':not(:where([data-kami-mes-host] *))';
    gen.push(pair(PREFIX + ' ' + scoped(''), dark) + EOL + pair(PREFIX + ' ' + scoped(' .mes_text'), dark));
    if (light) {
      gen.push(pair(PREFIX + '[data-kami-scheme="light"] ' + scoped(''), light) + EOL +
        pair(PREFIX + '[data-kami-scheme="light"] ' + scoped(' .mes_text'), light));
    }
  }
  /* 角：保底一条「贴住卡片内缘的描边」。酒馆不给 .mes 做 overflow 裁剪（我们也不做，
     裁了会切掉插件浮层与头像列），所以圆角与内容的贴合靠这一层画上去。 */
  if (gen.length) {
    gen.push(PREFIX + ' #chat[data-kami-mes="1"] .mes::after {' + EOL +
      '  content: "";' + EOL +
      '  position: absolute;' + EOL +
      '  inset: 0;' + EOL +
      '  border-radius: inherit;' + EOL +
      '  border: var(--kami-border-w) solid var(--kami-line);' + EOL +
      '  pointer-events: none;' + EOL +
      '}');
  }
  return { gen, skipped: [...new Set(skipped)], dark, light };
}

function liftSkin(id) {
  const p = path.join(SKIN_DIR, id, 'skin.css');
  const css = fs.readFileSync(p, 'utf8');
  const once = buildLift(css, id);
  /* 消息楼层的面与特效镜像：已停用（MES_DORMANT）时只保留「剥离旧块」，不再生成 */
  const mes = MES_DORMANT ? { gen: [], skipped: [] } : buildMes(once.rules, id, once.EOL);
  const blocks = [];
  if (once.gen.length) { blocks.push(GEN_OPEN + once.EOL + once.gen.join(once.EOL) + once.EOL + GEN_CLOSE); }
  if (mes.gen.length) { blocks.push(MES_OPEN + once.EOL + mes.gen.join(once.EOL) + once.EOL + MES_CLOSE); }
  const next = assemble(once.stripped, blocks, once.EOL);
  /* 自检：二次必须零变化（含消息楼层段的剥离与重建） */
  const l2 = buildLift(next, id);
  const m2 = MES_DORMANT ? { gen: [] } : buildMes(l2.rules, id, l2.EOL);
  const b2 = [];
  if (l2.gen.length) { b2.push(GEN_OPEN + l2.EOL + l2.gen.join(l2.EOL) + l2.EOL + GEN_CLOSE); }
  if (m2.gen.length) { b2.push(MES_OPEN + l2.EOL + m2.gen.join(l2.EOL) + l2.EOL + MES_CLOSE); }
  if (assemble(l2.stripped, b2, l2.EOL) !== next) {
    /* 排障：把第一处差异打出来（含前后 60 字），别让人对着两个 20 万字的文件找 */
    const a = next, b = assemble(l2.stripped, b2, l2.EOL);
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) { k++; }
    const ctx = (s) => JSON.stringify(s.slice(Math.max(0, k - 60), k + 60));
    throw new Error(id + ' 的全局层同步不幂等（二次扫描仍有变化），首处差异在第 ' + k + ' 字符：\n' +
      '  一次: ' + ctx(a) + '\n  二次: ' + ctx(b) + '\n  长度: ' + a.length + ' vs ' + b.length);
  }
  const changed = next !== css;
  if (changed && !dry) { fs.writeFileSync(p, next, 'utf8'); }
  return { changed, blocks: once.gen.length, mesBlocks: mes.gen.length, skipped: mes.skipped };
}

/* ---------- 主流程 ---------- */
const scriptRes = syncScript();   /* 恒为 skipped：全局层注入已删（见函数头的说明） */

if (!fs.existsSync(SKIN_DIR)) { console.log('（src/skins/ 为空）'); process.exit(0); }
const ids = fs.readdirSync(SKIN_DIR).filter(d => fs.statSync(path.join(SKIN_DIR, d)).isDirectory()).sort();
let changedSkins = 0, totalBlocks = 0, totalMes = 0;
for (const id of ids) {
  const r = liftSkin(id);
  if (r.changed) { changedSkins++; }
  totalBlocks += r.blocks;
  totalMes += r.mesBlocks;
  console.log('  ' + id.padEnd(10) + ' 令牌 ' + String(r.blocks).padStart(2) + ' 条 · 消息楼层面与特效 ' +
    String(r.mesBlocks).padStart(2) + ' 条 · ' + (r.changed ? '本轮写盘' : '无变化'));
}
console.log('\n令牌上提同步' + (dry ? '（dry）' : '完成') + '：15 套皮肤共生成 ' + totalBlocks +
  ' 条 <html> 令牌规则；本轮改动 ' + changedSkins + ' 套皮肤。');
if (!dry && changedSkins === 0 && !scriptRes.changed) {
  console.log('（全部已是最新，重复运行零变化 —— 幂等 ✓）');
}
