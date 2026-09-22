#!/usr/bin/env node
/**
 * apply-copy：把「风格性文案表」design/copy/copy-table.json 落地进四套皮肤包
 * ------------------------------------------------------------
 * 输入（唯一真相来源，本脚本只读）：
 *   design/copy/copy-table.json
 * 输出（每套皮肤只动这两个文件里指定的那几个字段，其余字节原样保留）：
 *   src/skins/<id>/skin.json   tagline；effects[].label/desc；params[].label/group/unit
 *   src/skins/<id>/skin.css    --kami-label-think-title / -think-title-open / -options-title 的值
 *
 * 两条工程约定（本工作区踩过坑）：
 *   · 脚本里不写字面反斜杠与字面美元号，这两个字符一律用 String.fromCharCode 构造；
 *   · 定位不用正则，改用 indexOf / 按行切分，避免把文件写坏。
 *
 * 用法：node build/apply-copy.mjs [--check]
 *   --check   只打印「哪个文件、哪个字段、旧值 -> 新值」，不写任何文件
 * 退出码：0 成功；1 前置断言失败（此时一个文件都不写）。
 * 幂等：连跑两次，第二次不产生任何变化；第二次 --check 不输出任何内容。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKIN_DIR = path.join(ROOT, 'src', 'skins');
const TABLE_PATH = path.join(ROOT, 'design', 'copy', 'copy-table.json');

const LF = String.fromCharCode(10);
const SP = String.fromCharCode(32);
const TAB = String.fromCharCode(9);
const COLON = String.fromCharCode(58);
const SEMI = String.fromCharCode(59);
const SEP = String.fromCharCode(92);

const SKIN_IDS = ['grokbot', 'memo', 'nixie', 'rain', 'trpg'];

/* [文案表槽位名, skin.css 里的令牌名]，顺序即报告顺序 */
const SLOT_TOKENS = [
  ['think-title', '--kami-label-think-title'],
  ['think-title-open', '--kami-label-think-title-open'],
  ['options-title', '--kami-label-options-title'],
];

/* 只落地这些字段；文案表里的 alt / note 是给设计评审看的，不进皮肤包 */
const EFFECT_FIELDS = ['label', 'desc'];
const PARAM_FIELDS = ['label', 'group', 'unit'];

const CHECK = process.argv.slice(2).indexOf('--check') >= 0;

const fails = [];
function bad(msg) { fails.push(msg); }

function rel(p) { return path.relative(ROOT, p).split(SEP).join('/'); }
function show(v) { return v === undefined ? '(无此字段)' : String(v); }

/* 保持现有文件的缩进风格（四套都是 2 空格），找不到缩进行就退回 2 */
function detectIndent(raw) {
  for (const line of raw.split(LF)) {
    if (line.length && line.charAt(0) === SP) {
      let n = 0;
      while (n < line.length && line.charAt(n) === SP) { n++; }
      return n;
    }
  }
  return 2;
}

/* ---------- 读文案表（失败即退出，不进入落地流程） ---------- */
if (!fs.existsSync(TABLE_PATH)) {
  console.log('找不到文案表：' + rel(TABLE_PATH));
  process.exit(1);
}
let TABLE = null;
try {
  TABLE = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
} catch (e) {
  console.log('文案表不是合法 JSON：' + e.message);
  process.exit(1);
}

/* ---------- 前置断言：文案表与 skin.json 的 id 集合必须完全一致 ---------- */
function sameIds(kind, id, skinList, tableList) {
  const where = kind + '.' + id;
  const want = [], got = [];
  for (const it of skinList) { want.push(it && typeof it.id === 'string' ? it.id : ''); }
  for (const it of tableList) { got.push(it && typeof it.id === 'string' ? it.id : ''); }
  let ok = true;
  for (let i = 0; i < want.length; i++) {
    if (!want[i]) { bad(where + '：skin.json 第 ' + (i + 1) + ' 条缺少 id'); ok = false; continue; }
    if (want.indexOf(want[i]) !== i) { bad(where + '：skin.json 里 id=' + want[i] + ' 重复出现'); ok = false; }
    if (got.indexOf(want[i]) < 0) { bad(where + '：文案表缺少条目 id=' + want[i] + '（skin.json 里有）'); ok = false; }
  }
  for (let i = 0; i < got.length; i++) {
    if (!got[i]) { bad(where + '：文案表第 ' + (i + 1) + ' 条缺少 id'); ok = false; continue; }
    if (got.indexOf(got[i]) !== i) { bad(where + '：文案表里 id=' + got[i] + ' 重复出现'); ok = false; }
    if (want.indexOf(got[i]) < 0) { bad(where + '：文案表多出条目 id=' + got[i] + '（skin.json 里没有）'); ok = false; }
  }
  if (ok && want.length !== got.length) { ok = false; bad(where + '：条数不符（skin.json ' + want.length + ' 条，文案表 ' + got.length + ' 条）'); }
  return ok;
}

function applyField(plan, field, target, key, value, allowEmpty) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    bad(field + '：文案表里这个字段缺失，或不是' + (allowEmpty ? '字符串' : '非空字符串'));
    return;
  }
  if (target[key] !== value) {
    plan.jsonRows.push({ field: field, old: target[key], next: value });
  }
  target[key] = value;
}

/* ---------- skin.json：只改 tagline / effects[].label+desc / params[].label+group+unit ---------- */
function planJson(plan) {
  const file = plan.file;
  if (!fs.existsSync(file)) { bad('找不到 ' + rel(file)); return; }
  const raw = fs.readFileSync(file, 'utf8');
  let obj = null;
  try { obj = JSON.parse(raw); } catch (e) { bad(rel(file) + ' 不是合法 JSON：' + e.message); return; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { bad(rel(file) + ' 顶层不是对象'); return; }

  const tagline = (TABLE.taglines || {})[plan.id];
  if (typeof tagline !== 'string' || !tagline.length) {
    bad('taglines.' + plan.id + ' 缺失或不是非空字符串');
  } else {
    applyField(plan, 'tagline', obj, 'tagline', tagline);
  }

  const skinEff = Array.isArray(obj.effects) ? obj.effects : [];
  const tableEff = (TABLE.effects || {})[plan.id];
  if (!Array.isArray(tableEff)) { bad('effects.' + plan.id + ' 缺失或不是数组'); }
  else if (sameIds('effects', plan.id, skinEff, tableEff)) {
    for (const item of skinEff) {
      const src = tableEff.find(x => x && x.id === item.id);
      for (const f of EFFECT_FIELDS) { applyField(plan, 'effects[' + item.id + '].' + f, item, f, src[f]); }
    }
  }

  const skinPar = Array.isArray(obj.params) ? obj.params : [];
  const tablePar = (TABLE.params || {})[plan.id];
  if (!Array.isArray(tablePar)) { bad('params.' + plan.id + ' 缺失或不是数组'); }
  else if (sameIds('params', plan.id, skinPar, tablePar)) {
    for (const item of skinPar) {
      const src = tablePar.find(x => x && x.id === item.id);
      for (const f of PARAM_FIELDS) { applyField(plan, 'params[' + item.id + '].' + f, item, f, src[f], f === 'unit'); }
    }
  }

  /* 写回：缩进沿用现有文件；末尾换行也沿用现有文件的结尾风格（有的 JSON 带换行、有的不带） */
  let next = JSON.stringify(obj, null, detectIndent(raw));
  if (raw.endsWith(LF)) { next = next + LF; }
  plan.nextJson = next;
  plan.jsonChanged = next !== raw;
}

/* ---------- skin.css：只改三个文案令牌冒号后面的值，行首缩进与结尾分号原样保留 ---------- */
function planCss(plan) {
  const file = plan.cssFile;
  if (!fs.existsSync(file)) { bad('找不到 ' + rel(file)); return; }
  const raw = fs.readFileSync(file, 'utf8');
  const slots = (TABLE.slots || {})[plan.id];
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) { bad('slots.' + plan.id + ' 缺失或不是对象'); return; }

  const lines = raw.split(LF);
  for (const [slot, token] of SLOT_TOKENS) {
    const nextValue = slots[slot];
    const needle = token + COLON;
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(needle) >= 0) { hits.push(i); }
    }
    /* 断言：每个令牌在每个文件里必须恰好出现 1 次，0 次或 2 次以上都不许静默继续 */
    if (hits.length !== 1) {
      bad(rel(file) + '：令牌 ' + token + ' 在文件里出现 ' + hits.length + ' 次（必须恰好 1 次）');
      continue;
    }
    if (typeof nextValue !== 'string' || !nextValue.length) {
      bad('slots.' + plan.id + '.' + slot + ' 缺失或不是非空字符串');
      continue;
    }
    const idx = hits[0];
    const line = lines[idx];
    const at = line.indexOf(needle) + needle.length;
    let p = at;
    while (p < line.length && (line.charAt(p) === SP || line.charAt(p) === TAB)) { p++; }
    const gap = line.slice(at, p);
    const semiAt = line.lastIndexOf(SEMI);
    if (semiAt < p) {
      bad(rel(file) + ' 第 ' + (idx + 1) + ' 行：令牌 ' + token + ' 所在行找不到结尾分号');
      continue;
    }
    const oldValue = line.slice(p, semiAt).trim();
    const nextLine = line.slice(0, at) + gap + nextValue + line.slice(semiAt);
    if (nextLine !== line) {
      lines[idx] = nextLine;
      plan.cssRows.push({ line: idx + 1, field: token, old: oldValue, next: nextValue });
    }
  }
  plan.nextCss = lines.join(LF);
  plan.cssChanged = plan.nextCss !== raw;
}

/* ---------- 依次处理四套皮肤：先全部算完并断言，再统一写盘 ---------- */
const plans = [];
for (const id of SKIN_IDS) {
  const plan = {
    id: id,
    file: path.join(SKIN_DIR, id, 'skin.json'),
    cssFile: path.join(SKIN_DIR, id, 'skin.css'),
    jsonRows: [],
    cssRows: [],
    nextJson: null,
    nextCss: null,
    jsonChanged: false,
    cssChanged: false,
  };
  planJson(plan);
  planCss(plan);
  plans.push(plan);
}

if (fails.length) {
  console.log('=== apply-copy：前置断言未通过，一个文件都没写 ===');
  for (const f of fails) { console.log('  x ' + f); }
  console.log('');
  console.log('失败 ' + fails.length + ' 条');
  process.exit(1);
}

const total = plans.reduce((n, p) => n + p.jsonRows.length + p.cssRows.length, 0);

/* 幂等判据：--check 且没有任何变化时，不输出任何内容 */
if (CHECK && total === 0) { process.exit(0); }

console.log('=== apply-copy：设计文案落地' + (CHECK ? '（--check 预览，不写文件）' : '') + ' ===');
console.log('文案表：' + rel(TABLE_PATH));
console.log('');

for (const p of plans) {
  console.log('[' + p.id + ']');
  if (!p.jsonRows.length && !p.cssRows.length) { console.log('  （无变化）'); console.log(''); continue; }
  if (p.jsonRows.length) {
    console.log('  ' + rel(p.file));
    for (const r of p.jsonRows) {
      console.log('    ' + r.field.padEnd(28, SP) + '「' + show(r.old) + '」 -> 「' + r.next + '」');
    }
  }
  if (p.cssRows.length) {
    console.log('  ' + rel(p.cssFile));
    for (const r of p.cssRows) {
      console.log('    第 ' + r.line + ' 行  ' + r.field.padEnd(30, SP) + '「' + show(r.old) + '」 -> 「' + r.next + '」');
    }
  }
  console.log('');
}

console.log('=== 汇总 ===');
for (const p of plans) {
  const parts = [];
  const tag = p.jsonRows.filter(r => r.field === 'tagline').length;
  const eff = p.jsonRows.filter(r => r.field.indexOf('effects[') === 0).length;
  const par = p.jsonRows.filter(r => r.field.indexOf('params[') === 0).length;
  if (tag) { parts.push('tagline ' + tag + ' 条'); }
  if (eff) { parts.push('effects ' + eff + ' 条'); }
  if (par) { parts.push('params ' + par + ' 条'); }
  console.log('  ' + p.id.padEnd(6, SP) + '：skin.json ' + p.jsonRows.length + ' 处' +
    (parts.length ? '（' + parts.join('，') + '）' : '') + '，skin.css ' + p.cssRows.length + ' 处');
}
console.log('  合计 ' + total + ' 处；skin.json ' + plans.reduce((n, p) => n + p.jsonRows.length, 0) +
  ' 处，skin.css ' + plans.reduce((n, p) => n + p.cssRows.length, 0) + ' 处');
console.log('');

if (CHECK) {
  console.log('（--check：未写盘）');
} else {
  let wrote = 0;
  for (const p of plans) {
    if (p.jsonChanged) { fs.writeFileSync(p.file, p.nextJson, 'utf8'); wrote++; }
    if (p.cssChanged) { fs.writeFileSync(p.cssFile, p.nextCss, 'utf8'); wrote++; }
  }
  console.log('已写盘 ' + wrote + ' 个文件');
}
