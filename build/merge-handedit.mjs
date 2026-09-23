/* merge-handedit：把「用户手改过的预设」合并回主干 src/preset.base.json。
 *
 * 为什么需要它：用户会直接在酒馆里改（条目名、正文、开关、顺序、脚本开关与脚本内设置…），
 * 改完把文件发回来。以前每轮都要人工逐项比对（哪条是真改动、哪条是酒馆自己补的字段、
 * 哪条是文案表管的注释），又慢又容易漏。这个工具把规则固化下来，一条命令出结果。
 *
 * ── 用法 ──
 *   node build/merge-handedit.mjs                        # 自动取「收到的文件/」里最新的预设
 *   node build/merge-handedit.mjs <文件路径>              # 指定文件
 *   node build/merge-handedit.mjs --url <ferry链接>       # 先用 ferry 取回再合并
 *   node build/merge-handedit.mjs --st <预设名或路径>      # 直接读酒馆数据目录里那份（不用导出）
 *   node build/merge-handedit.mjs --st --list             # 列出酒馆目录里可选的预设
 *   选项：--apply（真的写盘；不加只比对）
 *         --build（合并后顺手构建）
 *         --json（机器可读输出，给 agent 用）
 *         --sync-comments（把 design/copy/comment-updates.json 的文案与 match 同步成他文件里的版本）
 *         --keep-runtime（脚本 data 不回填，保留主干原值：不想把面板位置 / 上次检查时间 /
 *                        看过标记 / 当前皮肤与模型这类运行时状态写进默认值时用）
 *
 * ── 合并策略：一律以「他手改的那份」为准（用户 2026-09-23 明确要求）──
 *   条目名 / 正文 / 条目开关 / 其它字段（role、injection_*、system_prompt…）
 *   条目顺序（位置 + 顺序表里的启用位）
 *   顶层字段（含酒馆自己补的 claude_fast_mode 之类，照收）
 *   脚本：按 id 对齐 src/scripts/meta.json → **enabled 与 data 都回填**（data 就是脚本内设置）
 *   正则：按 id 对齐 src/regex/list.json → disabled / minDepth / maxDepth / promptOnly /
 *         markdownOnly / runOnEdit / substituteRegex **全部回填**
 *   注释（条目正文开头的 {{//…}}）：**以他为准**（他改过的注释就是最终文案）。
 *         工具会列出「文案表里的文字与他文件不一致」的行，要同步就加 --sync-comments。
 *
 * ── 他文件里表达不了、只能由构建期接管的部分（不参与合并，构建时重新生成）──
 *   脚本正文 / 脚本名字 / info / button / export_with（来自 src/scripts/meta.json + 脚本源码）
 *   他没有的脚本（构建期仍会装上）、正则正文
 *
 * ── 写盘时做什么（--apply）──
 *   ① 备份主干 → dist/_preset.base.合并前备份.json
 *   ② 主干 ← 他的文件（缩进沿用主干原样，diff 才干净）
 *   ③ 回填 src/scripts/meta.json（脚本 enabled / data）与 src/regex/list.json（正则各参数）
 *   ④ （--sync-comments 时）同步 design/copy/comment-updates.json 的 match 与 text
 *   ⑤ 跑 build/check-copy-updates.mjs 核对文案表；--build 时再跑一次构建
 *
 * 退出码：0 正常（含「没有差异」）；1 出错。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePreset, firstComment } from '../test/harness/preset-parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'src', 'preset.base.json');
const META = path.join(ROOT, 'src', 'scripts', 'meta.json');
const REGEX = path.join(ROOT, 'src', 'regex', 'list.json');
const COMMENTS = path.join(ROOT, 'design', 'copy', 'comment-updates.json');
const RECV = path.join(ROOT, '收到的文件');
const BACKUP = path.join(ROOT, 'dist', '_preset.base.合并前备份.json');
/* 酒馆数据目录：换机器用环境变量 KAMI_ST_SETTINGS_DIR 覆盖 */
const ST_DIR = process.env.KAMI_ST_SETTINGS_DIR ||
  'D:\\sillytavern-software\\SillyTavern Launcher GUI\\data\\st_data\\default-user\\OpenAI Settings';

/* ───────── 参数 ───────── */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : ''; };
const APPLY = has('--apply');
const BUILD = has('--build');
const AS_JSON = has('--json');
const SYNC_COMMENTS = has('--sync-comments');
/* 默认：脚本 data（脚本内设置）也以他的文件为准。
   --keep-runtime：只回填脚本开关，**不动 data** —— 用于「不想把面板位置、上次检查时间、
   看过标记、当前皮肤/模型这类运行时状态写进新用户的默认值」的场合。 */
const KEEP_RUNTIME = has('--keep-runtime');
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--url', '--st'].includes(argv[i - 1]));

if (has('--help') || has('-h')) {
  const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0];
  console.log(head.replace(/^\/\*/, '').replace(/^ ?\*? ?/gm, '').trim());
  process.exit(0);
}

if (has('--st') && has('--list')) {
  if (!fs.existsSync(ST_DIR)) { console.error('酒馆数据目录不存在：' + ST_DIR); process.exit(1); }
  console.log('酒馆数据目录：' + ST_DIR);
  for (const f of fs.readdirSync(ST_DIR).filter(f => f.endsWith('.json')).sort()) {
    const st = fs.statSync(path.join(ST_DIR, f));
    console.log('  ' + f + '  ' + Math.round(st.size / 1024) + ' KB  ' + st.mtime.toISOString().slice(0, 16).replace('T', ' '));
  }
  process.exit(0);
}

/* ───────── 小工具 ───────── */

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
const norm = (v) => (v === undefined || v === null ? '' : String(v));
const jnorm = (v) => norm(JSON.stringify(v));
/* 沿用目标文件原本的缩进，写回去 diff 才干净 */
function indentOf(text) {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1] : '  ';
}
function writeJsonLike(target, obj) {
  const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  fs.writeFileSync(target, JSON.stringify(obj, null, indentOf(old)) + '\n', 'utf8');
}
/* 条目正文里的注释块（文案表管辖的那一段） */
function splitComment(content) {
  const s = String(content == null ? '' : content);
  const m = /\{\{\/\/([\s\S]*?)\}\}/.exec(s);
  if (!m) { return { comment: null, body: s }; }
  return { comment: m[1], body: s.slice(0, m.index) + s.slice(m.index + m[0].length) };
}
const orderOf = (p) => {
  const o = (p.prompt_order || [])[0] || {};
  return o.order || o.character_list || [];
};
/* 看着像运行时状态、不是「设置」的键：只提示，不拦（用户要求一律以他的文件为准） */
const RUNTIME_HINTS = ['lastCheckAt', 'imported', 'skipped', 'seen', 'x', 'y', 'w', 'h', 'lastRunAt', 'checkCount'];
function runtimeKeysIn(data) {
  const out = [];
  const walk = (o, prefix) => {
    if (!o || typeof o !== 'object') { return; }
    for (const k of Object.keys(o)) {
      if (RUNTIME_HINTS.includes(k)) { out.push(prefix + k); }
      else if (o[k] && typeof o[k] === 'object') { walk(o[k], prefix + k + '.'); }
    }
  };
  walk(data, '');
  return out;
}

/* ───────── 选来源 ───────── */

function pickSource() {
  if (val('--url')) {
    const ferry = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', 'tools', 'ferry', 'ferry.mjs');
    if (!fs.existsSync(ferry)) { console.error('找不到 ferry 工具：' + ferry); process.exit(1); }
    console.log('用 ferry 取回：' + val('--url'));
    execFileSync(process.execPath, [ferry, 'get', val('--url')], { cwd: ROOT, stdio: 'inherit' });
  }
  if (has('--st')) {
    const arg = val('--st');
    if (arg && arg !== 'true' && fs.existsSync(arg)) { return path.resolve(ROOT, arg); }
    if (!fs.existsSync(ST_DIR)) {
      console.error('酒馆数据目录不存在：' + ST_DIR + '（可用环境变量 KAMI_ST_SETTINGS_DIR 指定）');
      process.exit(1);
    }
    const all = fs.readdirSync(ST_DIR).filter(f => f.endsWith('.json'));
    const want = arg && arg !== 'true' ? arg : '';
    if (want) {
      const hit = all.find(f => f === want) || all.find(f => f === want + '.json') || all.find(f => f.indexOf(want) >= 0);
      if (!hit) { console.error('酒馆目录里找不到匹配「' + want + '」的预设，用 --st --list 看有哪些'); process.exit(1); }
      return path.join(ST_DIR, hit);
    }
    const newest = all.map(f => ({ f, t: fs.statSync(path.join(ST_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    if (!newest) { console.error('酒馆目录里没有 .json'); process.exit(1); }
    return path.join(ST_DIR, newest.f);
  }
  if (positional[0]) {
    const p = path.resolve(ROOT, positional[0]);
    if (!fs.existsSync(p)) { console.error('文件不存在：' + p); process.exit(1); }
    return p;
  }
  if (!fs.existsSync(RECV)) { console.error('没有给文件，且「收到的文件/」目录不存在'); process.exit(1); }
  const cands = fs.readdirSync(RECV).filter(f => f.toLowerCase().endsWith('.json'))
    .map(f => ({ f: path.join(RECV, f), t: fs.statSync(path.join(RECV, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const c of cands) {
    try { const j = readJson(c.f); if (Array.isArray(j.prompts)) { return c.f; } } catch (e) { /* 不是预设，跳过 */ }
  }
  console.error('「收到的文件/」里没找到像预设的 .json（要有 prompts 数组）');
  process.exit(1);
}

/* ───────── 比对 ───────── */

function diffPresets(base, his) {
  const out = { prompts: {}, order: {}, scripts: [], regex: [], top: {}, variables: false, comments: [] };
  const bById = new Map(base.prompts.map(p => [p.identifier, p]));
  const hById = new Map(his.prompts.map(p => [p.identifier, p]));

  const added = his.prompts.filter(p => !bById.has(p.identifier)).map(p => p.name || p.identifier);
  const removed = base.prompts.filter(p => !hById.has(p.identifier)).map(p => p.name || p.identifier);
  const renamed = [], bodyChanged = [], commentOnly = [], enabledChanged = [], fieldChanged = [];
  for (const b of base.prompts) {
    const h = hById.get(b.identifier);
    if (!h) { continue; }
    if (norm(b.name) !== norm(h.name)) { renamed.push({ id: b.identifier, from: b.name, to: h.name }); }
    if (!!b.enabled !== !!h.enabled) { enabledChanged.push({ name: h.name || b.name, from: !!b.enabled, to: !!h.enabled }); }
    const bc = splitComment(b.content), hc = splitComment(h.content);
    if (bc.body !== hc.body) { bodyChanged.push({ name: h.name || b.name, from: String(b.content).length, to: String(h.content).length }); }
    else if (norm(bc.comment) !== norm(hc.comment)) { commentOnly.push({ name: h.name || b.name, from: bc.comment, to: hc.comment }); }
    const keys = new Set([...Object.keys(b), ...Object.keys(h)]);
    keys.delete('content'); keys.delete('name'); keys.delete('enabled'); keys.delete('identifier');
    const diffs = [];
    for (const k of keys) {
      const hasB = k in b, hasH = k in h;
      if (hasB && hasH && jnorm(b[k]) !== jnorm(h[k])) { diffs.push(k + '(值不同)'); }
      else if (hasH && !hasB) { diffs.push(k + '(只他有)'); }
      else if (hasB && !hasH) { diffs.push(k + '(只主干有)'); }
    }
    if (diffs.length) { fieldChanged.push({ name: h.name || b.name, fields: diffs }); }
  }
  out.prompts = { added, removed, renamed, bodyChanged, commentOnly, enabledChanged, fieldChanged };

  /* 顺序：位置 + 顺序表里的启用位 */
  const bo = orderOf(base), ho = orderOf(his);
  let firstPos = -1;
  for (let i = 0; i < Math.max(bo.length, ho.length); i++) {
    const x = bo[i] || {}, y = ho[i] || {};
    if (x.identifier !== y.identifier) { firstPos = i; break; }
  }
  const enFlags = [], moved = [];
  for (let i = 0; i < Math.min(bo.length, ho.length); i++) {
    if (bo[i].identifier === ho[i].identifier && !!bo[i].enabled !== !!ho[i].enabled) {
      const p = hById.get(ho[i].identifier) || bById.get(bo[i].identifier) || {};
      enFlags.push({ at: i, id: ho[i].identifier, name: p.name || '', from: !!bo[i].enabled, to: !!ho[i].enabled });
    }
  }
  if (firstPos >= 0) {
    const setB = new Set(bo.map(x => x.identifier)), setH = new Set(ho.map(x => x.identifier));
    for (const k of setH) { if (!setB.has(k)) { moved.push('新增 ' + k); } }
    for (const k of setB) { if (!setH.has(k)) { moved.push('移出 ' + k); } }
  }
  out.order = { lenBase: bo.length, lenHis: ho.length, firstPos, enFlags, moved,
    enabledBase: bo.filter(x => x.enabled).length, enabledHis: ho.filter(x => x.enabled).length };

  /* 脚本：按 id 对齐 meta.json（构建期整体重建，所以名字/正文/info 一律忽略） */
  const meta = readJson(META);
  const metaById = new Map(meta.map(m => [m.id, m]));
  const hisScripts = ((his.extensions || {}).tavern_helper || {}).scripts || [];
  for (const s of hisScripts) {
    const m = metaById.get(s.id);
    if (!m) { out.scripts.push({ name: s.name, unknown: true }); continue; }
    const enDiff = (m.enabled !== false) !== !!s.enabled;
    const dataDiff = jnorm(m.data || {}) !== jnorm(s.data || {});
    if (enDiff || dataDiff) {
      out.scripts.push({ id: s.id, name: m.name, file: m.file, enDiff, dataDiff,
        metaEnabled: m.enabled !== false, hisEnabled: !!s.enabled, metaData: m.data || {}, hisData: s.data || {},
        runtimeKeys: runtimeKeysIn(s.data || {}) });
    }
  }
  const hisIds = new Set(hisScripts.map(s => s.id));
  out.scriptsMissing = meta.filter(m => !hisIds.has(m.id)).map(m => m.name);

  /* 正则：按 id（或 scriptName）对齐 src/regex/list.json */
  const list = readJson(REGEX);
  const hisByKey = new Map((((his.extensions || {}).regex_scripts) || []).map(r => [r.id || r.scriptName, r]));
  const REGEX_FIELDS = ['disabled', 'minDepth', 'maxDepth', 'promptOnly', 'markdownOnly', 'runOnEdit', 'substituteRegex'];
  for (const r of list) {
    const h = hisByKey.get(r.id || r.scriptName);
    if (!h) { out.regex.push({ name: r.scriptName, missing: true }); continue; }
    const fields = REGEX_FIELDS.filter(f => jnorm(r[f]) !== jnorm(h[f]));
    if (fields.length) {
      out.regex.push({ name: r.scriptName, id: r.id, fields,
        detail: fields.map(f => f + ' ' + JSON.stringify(r[f]) + ' → ' + JSON.stringify(h[f])) });
    }
  }

  /* 顶层字段：prompts / prompt_order / extensions 各自另有小节，这里不重复报 */
  const SKIP_TOP = ['prompts', 'prompt_order', 'extensions'];
  const bk = Object.keys(base).filter(k => !SKIP_TOP.includes(k));
  const hk = Object.keys(his).filter(k => !SKIP_TOP.includes(k));
  out.top = { onlyHis: hk.filter(k => !bk.includes(k)), onlyBase: bk.filter(k => !hk.includes(k)),
    changed: bk.filter(k => hk.includes(k) && jnorm(base[k]) !== jnorm(his[k])) };
  out.name = { base: norm(base.name), his: norm(his.name), diff: norm(base.name) !== norm(his.name) };
  out.variables = jnorm((base.extensions.tavern_helper || {}).variables || {}) !==
    jnorm((his.extensions.tavern_helper || {}).variables || {});

  /* 文案表 vs 他的注释：哪几行的文字/名字对不上 */
  try {
    const rows = readJson(COMMENTS);
    const cardHeadOf = (preset) => {
      const map = {};
      for (const tab of (parsePreset(preset).tabs || [])) {
        if (tab.kind === 'model') { continue; }
        for (const c of (tab.cards || [])) { map[c.name] = c.headIdentifier; }
      }
      return map;
    };
    const cardB = cardHeadOf(base), cardH = cardHeadOf(his);
    const byIdB = new Map(base.prompts.map(p => [p.identifier, p]));
    const byIdH = new Map(his.prompts.map(p => [p.identifier, p]));
    const nameByIdH = new Map(his.prompts.map(p => [p.identifier, String(p.name || '')]));
    for (const it of rows) {
      const id = it.target === 'card' ? cardB[it.match] : (base.prompts.find(p => p.name === it.match) || {}).identifier;
      const h = id ? byIdH.get(id) : null;
      if (!h) { out.comments.push({ match: it.match, missing: true }); continue; }
      const hisComment = firstComment(String(h.content || ''));
      const hisName = it.target === 'card'
        ? (Object.keys(cardH).find(n => cardH[n] === id) || it.match)
        : nameByIdH.get(id);
      const textDiff = hisComment != null && norm(hisComment) !== norm(it.text);
      const nameDiff = norm(hisName) !== norm(it.match);
      if (textDiff || nameDiff) {
        out.comments.push({ match: it.match, hisName, textDiff, nameDiff, hisText: hisComment,
          baseHasComment: !!byIdB.get(id) && firstComment(String(byIdB.get(id).content || '')) != null });
      }
    }
  } catch (e) { out.comments = [{ error: (e && e.message) || String(e) }]; }
  return out;
}

/* ───────── 输出 ───────── */

function render(d, meta) {
  const L = [];
  const P = d.prompts;
  L.push('条目：主干 ' + meta.baseCount + ' 条 → 他的 ' + meta.hisCount + ' 条');
  L.push('  · 正文改动 ' + P.bodyChanged.length + ' 条' + (P.bodyChanged.length ? '：' + P.bodyChanged.slice(0, 6).map(x => x.name + '(' + x.from + '→' + x.to + '字)').join('、') : ''));
  L.push('  · 改名 ' + P.renamed.length + ' 条' + (P.renamed.length ? '：' + P.renamed.slice(0, 6).map(x => x.from + ' → ' + x.to).join('、') : ''));
  L.push('  · 条目开关 ' + P.enabledChanged.length + ' 条' + (P.enabledChanged.length ? '：' + P.enabledChanged.slice(0, 6).map(x => x.name + ' ' + (x.from ? '开' : '关') + '→' + (x.to ? '开' : '关')).join('、') : ''));
  L.push('  · 其它字段 ' + P.fieldChanged.length + ' 条' + (P.fieldChanged.length ? '：' + P.fieldChanged.slice(0, 6).map(x => x.name + '[' + x.fields.join('/') + ']').join('、') : ''));
  L.push('  · 新增 ' + P.added.length + ' 条' + (P.added.length ? '：' + P.added.slice(0, 6).join('、') : '') +
    '；删除 ' + P.removed.length + ' 条' + (P.removed.length ? '：' + P.removed.slice(0, 6).join('、') : ''));
  L.push('  · 注释文字不同 ' + P.commentOnly.length + ' 条' + (P.commentOnly.length ? '：' + P.commentOnly.slice(0, 4).map(x => x.name).join('、') : ''));

  const O = d.order;
  L.push('顺序：' + O.lenBase + ' 项 → ' + O.lenHis + ' 项' +
    (O.firstPos < 0 ? '，位置完全一致' : '，第 ' + (O.firstPos + 1) + ' 位起不同' + (O.moved.length ? '（' + O.moved.slice(0, 5).join('、') + '）' : '')));
  L.push('  · 顺序表里的启用位不同 ' + O.enFlags.length + ' 处（主干 ' + O.enabledBase + ' 开 / 他的 ' + O.enabledHis + ' 开）' +
    (O.enFlags.length ? '：' + O.enFlags.slice(0, 6).map(x => '第' + (x.at + 1) + '位 ' + (x.name || x.id) + ' ' + (x.from ? '开' : '关') + '→' + (x.to ? '开' : '关')).join('、') : ''));

  L.push('脚本（按 id 对齐 src/scripts/meta.json）：' + d.scripts.length + ' 处差异' +
    (KEEP_RUNTIME ? '（--keep-runtime：只回填开关，data 保留主干原值）' : ''));
  for (const s of d.scripts) {
    if (s.unknown) { L.push('  · 他有个主干里没有的脚本：' + s.name + '（构建期不认，会被丢掉）'); continue; }
    const bits = [];
    if (s.enDiff) { bits.push('开关 ' + (s.metaEnabled ? '开' : '关') + ' → ' + (s.hisEnabled ? '开' : '关')); }
    if (s.dataDiff) {
      const emptyHis = !s.hisData || Object.keys(s.hisData).length === 0;
      bits.push('data：' + JSON.stringify(s.metaData) + ' → ' + JSON.stringify(s.hisData) +
        (KEEP_RUNTIME ? '（--keep-runtime：不回填）' : '') +
        (emptyHis ? '（他这份里这个脚本没存过设置，会写成空——脚本用内置默认值兜底）' : '') +
        (!KEEP_RUNTIME && s.runtimeKeys.length ? '（其中 ' + s.runtimeKeys.join('、') + ' 看着是运行时状态，会一起进默认值）' : ''));
    }
    L.push('  · ' + s.name + '：' + bits.join('；'));
  }
  if (d.scriptsMissing.length) { L.push('  · 他的文件里没有这些脚本（构建期仍会装上，设置沿用主干）：' + d.scriptsMissing.join('、')); }

  L.push('正则（按 id 对齐 src/regex/list.json）：' + d.regex.length + ' 处差异');
  for (const r of d.regex) {
    L.push('  · ' + r.name + (r.missing ? '：他的文件里没有这条' : '：' + r.detail.join('、')));
  }

  const T = d.top;
  L.push('顶层字段：他的多 ' + T.onlyHis.length + ' 个' + (T.onlyHis.length ? '（' + T.onlyHis.join('、') + '，酒馆自带，照收）' : '') +
    '；主干独有 ' + T.onlyBase.length + ' 个' + (T.onlyBase.length ? '（' + T.onlyBase.join('、') + '）' : '') +
    '；值不同 ' + T.changed.length + ' 个' + (T.changed.length ? '：' + T.changed.slice(0, 8).join('、') : ''));
  if (d.name && d.name.diff) {
    L.push('  · 预设内部 name：「' + d.name.base + '」→「' + d.name.his + '」（**不影响产物**：构建期会覆盖成产物名）');
  }
  if (d.variables) { L.push('脚本变量（tavern_helper.variables）：两边不同，按你的文件为准一起写进主干'); }

  if (d.comments.length) {
    L.push('文案表（design/copy/comment-updates.json）与他的注释对不上：' + d.comments.length + ' 行');
    for (const c of d.comments.slice(0, 6)) {
      if (c.error) { L.push('  · ⚠ 读文案表出错：' + c.error); continue; }
      if (c.missing) { L.push('  · 「' + c.match + '」在预设里定位不到了（多半是改了名，要更新 match）'); continue; }
      L.push('  · 「' + c.match + '」' + (c.nameDiff ? '名字要改成「' + c.hisName + '」' : '') +
        (c.textDiff ? '  注释文字要改成他写的那版' : ''));
    }
    if (d.comments.length > 6) { L.push('  · …还有 ' + (d.comments.length - 6) + ' 行'); }
  }
  return L.join('\n');
}

/* ───────── 主流程 ───────── */

const src = pickSource();
const baseRaw = fs.readFileSync(BASE, 'utf8');
const hisRaw = fs.readFileSync(src, 'utf8');
let base, his;
try { base = JSON.parse(baseRaw); } catch (e) { console.error('主干不是合法 JSON：' + e.message); process.exit(1); }
try { his = JSON.parse(hisRaw); } catch (e) { console.error('来源文件不是合法 JSON：' + e.message); process.exit(1); }
if (!Array.isArray(his.prompts)) { console.error('来源文件不像预设（没有 prompts 数组）：' + src); process.exit(1); }

const d = diffPresets(base, his);
const info = { baseCount: base.prompts.length, hisCount: his.prompts.length, src };
/* 「文件层面」有没有差异：条目 / 顺序 / 顶层 / 正则 / name。
   脚本那部分（enabled 与 data）是回填到 src/scripts/meta.json 的，不是文件差异，
   所以单独算 —— 主干里那份脚本块本来就是旧快照（构建期整体重建），不该拿它当基准。 */
const scriptDiffs = d.scripts.filter(s => !s.unknown && (s.enDiff || (s.dataDiff && !KEEP_RUNTIME)));
const fileSame = !d.prompts.added.length && !d.prompts.removed.length && !d.prompts.renamed.length &&
  !d.prompts.bodyChanged.length && !d.prompts.enabledChanged.length && !d.prompts.fieldChanged.length &&
  d.order.firstPos < 0 && !d.order.enFlags.length && !d.regex.length &&
  !d.top.changed.length && !d.top.onlyHis.length && !d.top.onlyBase.length && !d.variables;
const nothing = fileSame && !scriptDiffs.length;

if (AS_JSON) {
  console.log(JSON.stringify({ source: path.relative(ROOT, src), apply: APPLY, nothing, diff: d }, null, 1));
  if (!APPLY) { process.exit(0); }
}

if (!AS_JSON) {
  console.log('=== 合并手改预设（一律以你的文件为准）===');
  console.log('来源：' + path.relative(ROOT, src) + '（' + kb(hisRaw.length) + '）');
  console.log('主干：' + path.relative(ROOT, BASE) + '（' + kb(baseRaw.length) + '）');
  console.log('');
  console.log(render(d, info));
  console.log('');
  if (nothing) { console.log('结论：没有差异，主干已经就是你那份，不用合并。'); process.exit(0); }
  if (!APPLY) {
    if (fileSame) {
      console.log('结论：条目 / 顺序 / 顶层字段 / 正则都一致；只有上面那几处**脚本设置**要回填到 src/scripts/meta.json。');
      console.log('      要回填就加 --apply（不动条目，只写 meta.json）。');
      process.exit(0);
    }
    console.log('结论：以上差异**尚未写入**。确认无误后加 --apply 合并（会自动备份、回填脚本与正则的设置）。');
    process.exit(0);
  }
}

/* ---- 写盘 ---- */
const steps = [];
fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
fs.copyFileSync(BASE, BACKUP);
steps.push('备份主干 → ' + path.relative(ROOT, BACKUP));
writeJsonLike(BASE, his);
steps.push('主干 ← 你的文件（' + info.hisCount + ' 条）');

/* 回填脚本：enabled + data */
const metaJson = readJson(META);
let metaTouched = 0;
const metaBits = [];
for (const s of d.scripts) {
  if (s.unknown) { continue; }
  const m = metaJson.find(x => x.id === s.id);
  if (!m) { continue; }
  const bits = [];
  if (s.enDiff) { m.enabled = s.hisEnabled; bits.push('开关'); }
  if (s.dataDiff) {
    if (KEEP_RUNTIME) { bits.push('data（--keep-runtime：保留主干原值）'); }
    else { m.data = s.hisData; bits.push('data'); }
  }
  if (bits.length) { metaTouched++; metaBits.push(s.name + '(' + bits.join('+') + ')'); }
}
if (metaTouched) { writeJsonLike(META, metaJson); steps.push('回填脚本设置 → src/scripts/meta.json：' + metaBits.join('、')); }

/* 回填正则：全部参与比对的字段 */
const regexJson = readJson(REGEX);
const hisRegex = ((his.extensions || {}).regex_scripts) || [];
let regexTouched = 0;
const regexBits = [];
for (const r of d.regex) {
  if (r.missing) { continue; }
  const row = regexJson.find(x => (x.id || x.scriptName) === (r.id || r.name));
  const hisRow = hisRegex.find(x => (x.id || x.scriptName) === (r.id || r.name));
  if (!row || !hisRow) { continue; }
  for (const f of r.fields) { row[f] = hisRow[f]; }
  regexTouched++; regexBits.push(r.name + '(' + r.fields.join('/') + ')');
}
if (regexTouched) { writeJsonLike(REGEX, regexJson); steps.push('回填正则设置 → src/regex/list.json：' + regexBits.join('、')); }

/* 可选：把文案表同步成他文件里的名字与注释文字 */
if (SYNC_COMMENTS && d.comments.length) {
  const rows = readJson(COMMENTS);
  const cardHeadOf = (preset) => {
    const map = {};
    for (const tab of (parsePreset(preset).tabs || [])) {
      if (tab.kind === 'model') { continue; }
      for (const c of (tab.cards || [])) { map[c.name] = c.headIdentifier; }
    }
    return map;
  };
  const cardB = cardHeadOf(base), cardH = cardHeadOf(his);
  const nameByIdH = new Map(his.prompts.map(p => [p.identifier, String(p.name || '')]));
  const byIdH = new Map(his.prompts.map(p => [p.identifier, p]));
  let touched = 0;
  for (const it of rows) {
    const id = it.target === 'card' ? cardB[it.match] : (base.prompts.find(p => p.name === it.match) || {}).identifier;
    const h = id ? byIdH.get(id) : null;
    if (!h) { continue; }
    const c = firstComment(String(h.content || ''));
    const newName = it.target === 'card' ? (Object.keys(cardH).find(n => cardH[n] === id) || it.match) : nameByIdH.get(id);
    let hit = false;
    if (newName && norm(newName) !== norm(it.match)) { it.match = newName; hit = true; }
    if (c != null && norm(c) !== norm(it.text)) { it.text = c; it.action = 'replace'; hit = true; }
    if (hit) { touched++; }
  }
  if (touched) { writeJsonLike(COMMENTS, rows); steps.push('同步文案表 → design/copy/comment-updates.json（' + touched + ' 行）'); }
}

/* 文案表核对 */
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'build', 'check-copy-updates.mjs')], { cwd: ROOT, encoding: 'utf8' });
  const tail = String(out).trim().split('\n').filter(l => /对不上|雷区|键数|空值/.test(l)).join(' ｜ ');
  steps.push('文案表核对：' + (tail || '无异常'));
} catch (e) {
  steps.push('⚠ 文案表核对**没通过**（多半是条目改了名，design/copy/comment-updates.json 的 match 要跟着改，' +
    '可以加 --sync-comments 让工具自动同步）：' + String((e && e.stdout) || (e && e.message) || e).trim().split('\n').slice(-3).join(' ｜ '));
}

if (BUILD) {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'build', 'build.mjs')], { cwd: ROOT, encoding: 'utf8' });
    const lines = String(out).trim().split('\n').filter(l => /输出|完成|中止|失败/.test(l));
    steps.push('构建：' + (lines.join(' ｜ ') || '完成'));
  } catch (e) {
    steps.push('⚠ 构建没通过：' + String((e && e.stdout) || (e && e.message) || e).trim().split('\n').slice(-4).join(' ｜ '));
  }
}

if (!AS_JSON) {
  console.log('--- 已写入 ---');
  steps.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));
  console.log('');
  console.log('下一步：' + (BUILD ? '看上面的构建结果；' : '跑 node build/build.mjs 出产物；') +
    '要发版按 GitHub推送规范 §四 先出方案。');
}
