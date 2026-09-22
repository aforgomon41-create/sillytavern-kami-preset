/* lint-copy：校验「风格性文案表」design/copy/copy-table.json 是否可安全落地。
 *
 * 为什么需要它：
 *   · 皮肤的 --kami-label-* 令牌值会被前端 JS 读出来当纯文本，值里混进特殊字符会静默出错；
 *   · 这些 JSON 字段会进皮肤包，字段名/长度错了构建期不一定拦得住；
 *   · 文案 Agent 自报的「格数」不可靠（实测有过系统性多报），所以一律机械实算。
 *
 * 用法：node build/lint-copy.mjs [表路径]
 * 退出码：0 全部通过；1 有失败项。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TABLE = process.argv[2] || join(ROOT, 'design/copy/copy-table.json');

const SKIN_IDS = ['grokbot', 'memo', 'nixie', 'rain', 'trpg'];

/* 禁用字符：用字符码构造，避免本文件自身被写坏（本工作区对美元号与反斜杠不可靠） */
const DOLLAR = String.fromCharCode(36);
const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BANNED = [
  [DOLLAR, '美元号'],
  [BACKSLASH, '反斜杠'],
  [';', '分号'],
  ['{', '左花括号'],
  ['}', '右花括号'],
  ['{{', '双花括号'],
  ['}}', '双花括号'],
  ['/*', '注释起止符'],
  ['"', '双引号'],
  ["'", '单引号'],
  [LF, '换行'],
  [CR, '回车'],
];

/* 宽度：CJK / 全角记 1 格，其余记 0.5 格 */
export function width(s) {
  let w = 0;
  for (const ch of s) { w += (ch.codePointAt(0) > 0x2e80) ? 1 : 0.5; }
  return w;
}

const LIMIT = {
  'think-title': 6,
  'think-title-open': 6,
  'options-title': 6,
};
const LABEL_MAX = 8;
const DESC_MAX = 60;
const GROUP_MAX = 4;
const UNIT_MAX = 2;

const fails = [];
const warns = [];
let checked = 0;

function fail(where, why) { fails.push(where + ' —— ' + why); }

function checkText(where, value, max) {
  checked++;
  if (typeof value !== 'string') { fail(where, '不是字符串'); return 0; }
  if (value.length === 0) { fail(where, '是空的'); return 0; }
  if (value !== value.trim()) { fail(where, '首尾有空白'); }
  for (const [ch, name] of BANNED) {
    if (value.indexOf(ch) >= 0) { fail(where, '含禁用字符：' + name); }
  }
  const w = width(value);
  if (max && w > max) { fail(where, '超长：' + w + ' 格 > 上限 ' + max + ' 格'); }
  return w;
}

/* unit 不是纯显示字段：皮肤管理会把它直接拼进 CSS 值（30-皮肤管理.js 里 `v + (p.unit || '')`）。
   所以它必须是**合法 CSS 单位**或空串。写成 × 或 ° 会让 calc()/rotate() 变成非法值，
   整条属性被丢弃 —— 真机上表现是「骰子宽高归零、压住标题并被纸边裁掉」以及「印章不再倾斜」。
   这条规则就是那次回归换来的。 */
function checkUnit(where, value, tag, widths) {
  checked++;
  if (typeof value !== 'string') { fail(where, '不是字符串'); return; }
  if (value === '') { widths.push([tag + '.unit', 0]); return; }
  if (!/^[a-z%]+$/.test(value)) {
    fail(where, '不是合法 CSS 单位：' + JSON.stringify(value) + '（只允许小写字母或 %，或留空）');
  }
  /* 这里不走 checkText：那个函数会自增「校验文本条数」，单位已在上面计过一次，再计就重复了。
     而且正则 ^[a-z%]+$ 已经保证值里只可能是小写字母或 %，禁用字符检查对它没有意义。 */
  const w = width(value);
  if (w > UNIT_MAX) { fail(where, '超长：' + w + ' 格 > 上限 ' + UNIT_MAX + ' 格'); }
  widths.push([tag + '.unit', w]);
}

if (!existsSync(TABLE)) {
  console.log('找不到文案表：' + TABLE);
  process.exit(1);
}

let table;
try {
  table = JSON.parse(readFileSync(TABLE, 'utf8'));
} catch (e) {
  console.log('文案表不是合法 JSON：' + e.message);
  process.exit(1);
}

const widths = [];

/* ---- 槽位 ---- */
if (!table.slots) { fail('slots', '缺这一节'); }
else {
  for (const id of SKIN_IDS) {
    const s = table.slots[id];
    if (!s) { fail('slots.' + id, '缺这套皮肤'); continue; }
    for (const slot of Object.keys(LIMIT)) {
      const w = checkText('slots.' + id + '.' + slot, s[slot], LIMIT[slot]);
      widths.push(['槽位 ' + id + '.' + slot, w]);
    }
    for (const k of Object.keys(s)) {
      if (!(k in LIMIT)) { fail('slots.' + id + '.' + k, '未登记的槽位名'); }
    }
  }
}

/* ---- tagline ---- */
if (!table.taglines) { fail('taglines', '缺这一节'); }
else {
  for (const id of SKIN_IDS) {
    const w = checkText('taglines.' + id, table.taglines[id], 0);
    widths.push(['tagline ' + id, w]);
  }
}

/* ---- effects / params：必须与 skin.json 的 id 集合逐一对应 ---- */
for (const id of SKIN_IDS) {
  const skin = JSON.parse(readFileSync(join(ROOT, 'src/skins', id, 'skin.json'), 'utf8'));
  for (const [kind, list] of [['effects', skin.effects || []], ['params', skin.params || []]]) {
    const want = list.map(x => x.id);
    const got = (table[kind] && table[kind][id]) ? table[kind][id].map(x => x.id) : null;
    if (!got) { fail(kind + '.' + id, '缺这套皮肤'); continue; }
    if (got.length !== want.length) {
      fail(kind + '.' + id, '条数不符：表里 ' + got.length + ' 条，skin.json ' + want.length + ' 条');
    }
    for (const wid of want) {
      if (got.indexOf(wid) < 0) { fail(kind + '.' + id, '缺条目 id=' + wid); }
    }
    for (const gid of got) {
      if (want.indexOf(gid) < 0) { fail(kind + '.' + id, '多出条目 id=' + gid + '（skin.json 里没有）'); }
    }
    for (const item of (table[kind][id] || [])) {
      const at = kind + '.' + id + '.' + item.id;
      const keys = Object.keys(item).filter(k => ['id', 'label', 'desc', 'group', 'unit', 'alt', 'note'].indexOf(k) < 0);
      if (keys.length) { fail(at, '出现未允许的字段：' + keys.join(', ')); }
      const lw = checkText(at + '.label', item.label, LABEL_MAX);
      widths.push([kind + ' ' + id + '.' + item.id + '.label', lw]);
      if (kind === 'effects') {
        const dw = checkText(at + '.desc', item.desc, DESC_MAX);
        widths.push([kind + ' ' + id + '.' + item.id + '.desc', dw]);
      } else {
        const gw = checkText(at + '.group', item.group, GROUP_MAX);
        widths.push([kind + ' ' + id + '.' + item.id + '.group', gw]);
        checkUnit(at + '.unit', item.unit, kind + ' ' + id + '.' + item.id, widths);
      }
      if (item.alt !== undefined) { checkText(at + '.alt', item.alt, LABEL_MAX); }
    }
    /* 出厂顺序应与 skin.json 一致 */
    if (got && got.length === want.length) {
      for (let i = 0; i < want.length; i++) {
        if (got[i] !== want[i]) { warns.push(kind + '.' + id + ' 条目顺序与 skin.json 不同（不影响落地）'); break; }
      }
    }
  }
}

/* ---- 四套皮肤的标题不许四套全同（那样风格化就没意义） ---- */
if (table.slots) {
  for (const slot of Object.keys(LIMIT)) {
    const vals = SKIN_IDS.map(id => (table.slots[id] || {})[slot]);
    if (vals.every(v => v === vals[0])) {
      warns.push('槽位 ' + slot + ' 四套皮肤取值完全相同（风格化失效）：' + vals[0]);
    }
  }
}

const widest = widths.slice().sort((a, b) => b[1] - a[1]).slice(0, 6);

console.log('=== lint-copy：' + TABLE.replace(ROOT, '.') + ' ===');
console.log('校验文本条数：' + checked);
console.log('最宽的 6 条：');
for (const [name, w] of widest) { console.log('  ' + w + ' 格  ' + name); }
if (warns.length) {
  console.log('');
  console.log('提示 ' + warns.length + ' 条：');
  for (const w of warns) { console.log('  · ' + w); }
}
if (fails.length) {
  console.log('');
  console.log('失败 ' + fails.length + ' 条：');
  for (const f of fails) { console.log('  x ' + f); }
  console.log('');
  console.log('lint-copy 不通过');
  process.exit(1);
}
console.log('');
console.log('lint-copy 全部通过');
