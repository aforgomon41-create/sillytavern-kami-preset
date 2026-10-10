/* preset-vars.mjs —— 「🧩 设置变量」改值链路的纯逻辑自测
 *
 * 为什么要单独测这两个函数：2026-10-10 用户报了一个 bug ——
 *   面板里改某个变量的数值时，**有时会找不到该变量**，报
 *   「预设里找不到 setvar::名::旧值（预设被改过？）」并拒绝写入。
 * 根因：面板输入框把"渲染那一刻的值"存在 data-kami-old 里当钥匙，
 *      写盘时拿它拼 `setvar::名::旧值` 去正文里**逐字**找。
 *      用户在酒馆里直接改过预设正文（或在别处改过这个变量）之后，
 *      正文里的值与面板缓存的对不上 → 找不到 → 报错回滚。
 * 修法：**钥匙是变量名，不是值**。写之前先按名现读一次正文里的真实值；
 *      万一还落空，再退到"按名锚定"替换，并且只认非负整数。
 *
 * 这三个函数活在 src/scripts/40-预设设置.js 的闭包里（有 IO 依赖，没法整体载入），
 * 所以这里按源码文本把它们抽出来离线跑 —— 与 build/ 内联的是同一份源码，
 * 不会出现"测的和跑的不是一段代码"。
 *
 * 跑法：node test/harness/preset-vars.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src', 'scripts', '40-预设设置.js');

let pass = 0, fail = 0;
const eq = (got, want, why) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; return; }
  fail++;
  console.log('  ✗ ' + why + '\n      期望：' + b + '\n      实际：' + a);
};
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };

/* ── 从源码里抽出三个函数（按行切，不数花括号 —— 值里就有花括号） ── */
const src = readFileSync(SRC, 'utf8');
const lines = src.split(/\r?\n/);
function grabFn(sig) {
  const a = lines.findIndex(l => l.startsWith('  function ' + sig));
  if (a < 0) throw new Error('源码里找不到函数 ' + sig);
  let b = a;
  while (b < lines.length && lines[b].replace(/\s+$/, '') !== '  }') b++;
  if (b >= lines.length) throw new Error('找不到 ' + sig + ' 的收尾花括号');
  return lines.slice(a, b + 1).join('\n');
}
const code = grabFn('readVarValue(') + '\n' + grabFn('setVarInContent(') + '\n' + grabFn('varWhyText(');
const M = new Function(code +
  '\nreturn { readVarValue: readVarValue, setVarInContent: setVarInContent, varWhyText: varWhyText };')();

/* setVarInContent 返回 { ok:true, after } 或 { ok:false, why }。
   这两个壳把结果折算成"改完的正文"或"失败原因"，让断言读起来短。 */
const after = (content, name, oldValue, newValue) => {
  const r = M.setVarInContent(content, name, oldValue, newValue);
  return r.ok ? r.after : null;
};
const whyOf = (content, name, oldValue, newValue) => {
  const r = M.setVarInContent(content, name, oldValue, newValue);
  return r.ok ? 'ok' : r.why;
};

/* ── ① 按名读取 ── */
{
  const c = '{{setvar::好感度::250}}\n正文\n{{setvar::其他::7}}';
  eq(M.readVarValue(c, '好感度'), '250', '按名读出正文里的真实值');
  eq(M.readVarValue(c, '其他'), '7', '读另一个变量互不干扰');
  eq(M.readVarValue(c, '不存在'), null, '没有这个变量 → null');
  eq(M.readVarValue('', 'x'), null, '空正文 → null');
  eq(M.readVarValue(null, 'x'), null, '正文不是字符串 → null');
}

/* ── ② 核心 bug：面板缓存值与正文不一致（这条就是回归测试）── */
{
  const c = '{{setvar::好感度::250}}\n正文\n{{setvar::其他::7}}';
  const want = '{{setvar::好感度::300}}\n正文\n{{setvar::其他::7}}';
  eq(after(c, '好感度', '100', '300'), want,
    '★ 正文里是 250、面板缓存是 100 —— 照样改得动（旧代码在这里报「预设被改过？」）');
  eq(after(c, '好感度', '250', '300'), want,
    '缓存值与正文一致时，行为与改动前完全相同');
  eq(after(c, '好感度', '', '300'), want,
    '★ 缓存值是空串也不能把新旧值叠起来（自测抓到过 300250 这种脏数据）');
}

/* ── ③ 「只改那一个数字」：别处一个字符都不许动 ── */
{
  eq(after('{{setvar::a::1}} {{setvar::b::1}}', 'b', '99', '5'),
    '{{setvar::a::1}} {{setvar::b::5}}', '同值的另一个变量不受影响');
  eq(after('x{{setvar::n::10}}y', 'n', '999', '20'),
    'x{{setvar::n::20}}y', '只替换值，前后缀原样保留');
  eq(after('{{setvar::多::3}}\n{{setvar::多::8}}', '多', 'x', '9'),
    '{{setvar::多::9}}\n{{setvar::多::8}}', '同名出现两次时只改第一处');
}

/* ── ④ 闸门：不安全就拒绝，宁可不动 ── */
{
  eq(after('{{setvar::文风::这是一段\n多行文本}}', '文风', '旧', '新'), null, '值是文本 → 拒绝改');
  eq(after('{{setvar::空::}}', '空', '旧', '新'), null, '空值 → 拒绝改');
  eq(after('{{setvar::残::12', '残', '旧', '新'), null, '缺 }} 的残文 → 拒绝改');
  eq(after('{{setvar::负::-5}}', '负', '0', '9'), null, '负值 → 拒绝改');
  eq(after('{{setvar::名::１}}', '名', 'x', '5'), null, '全角数字不算纯数字 → 拒绝改');
  eq(after('{{setvar::名::1e3}}', '名', 'x', '5'), null, '科学计数法 → 拒绝改');
  eq(after('{{setvar::名::1.5}}', '名', 'x', '5'), null, '小数 → 拒绝改（面板是整数框）');
  eq(after('没有这个变量', '名', 'x', '5'), null, '变量名真不存在 → 如实返回 null');
}

/* ── ④b 失败要说清是哪种原因（公告里承诺过）── */
{
  eq(whyOf('没有这个变量', '名', 'x', '5'), 'no-entry', '变量名不存在 → no-entry');
  eq(whyOf('{{setvar::残::12', '残', '旧', '新'), 'no-close', '缺收尾 }} → no-close');
  eq(whyOf('{{setvar::空::}}', '空', '旧', '新'), 'empty', '空值 → empty');
  eq(whyOf('{{setvar::文风::多行\n文本}}', '文风', '旧', '新'), 'not-number', '值是文字 → not-number');
  eq(whyOf('{{setvar::负::-5}}', '负', '0', '9'), 'minus', '负值 → minus（不能退化成含糊的 not-number）');
  const texts = ['no-entry', 'no-close', 'empty', 'not-number', 'minus'].map(w => M.varWhyText(w, '测试变量'));
  ok(new Set(texts).size === 5, '五种原因对应五句不同的提示（现在 ' + new Set(texts).size + ' 种）');
  ok(texts.every(x => x.indexOf('测试变量') >= 0), '每条提示都点明是哪个变量');
  ok(M.varWhyText('no-entry', 'v') !== M.varWhyText('unknown-why', 'v'), '未知原因有兜底文案，且与已知原因不同');
}

/* ── ⑤ 结构断言：防止有人把修好的地方退回去 ── */
{
  ok(/readVarValue\(before, p\.name\)/.test(src),
    'commitVars 里仍然按变量名现读正文真实值（删了就会退回旧 bug）');
  ok(/var useOld = \(realOld !== null && realOld !== ''\) \? realOld : p\.old;/.test(src),
    '现读到的真实值优先于面板缓存值');
  ok(/panelOld: p\.old/.test(src), '计划里同时留下了面板缓存值（日志里能看出不一致）');
  ok(/if \(!res\.ok\) \{ return \{ ok: false, changed: 0, why: res\.why, msg: varWhyText\(res\.why, p\.name\) \}; \}/.test(src),
    '写入失败时走 varWhyText 说清原因（不能退回含糊的"找不到"）');
  ok(/oldValue !== '' && oldValue !== null && oldValue !== undefined/.test(src),
    '空旧值不走精确匹配（否则会写出新旧值叠加的脏数据）');
}

console.log('\n' + (fail ? '✗' : '✓') + ' 预设变量改值链路：' + (pass + fail) + ' 项，' + fail + ' 项失败');
process.exit(fail ? 1 : 0);
