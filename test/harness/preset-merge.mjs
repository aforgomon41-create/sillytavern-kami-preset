#!/usr/bin/env node
/**
 * 合并引擎离线自测：node test/harness/preset-merge.mjs
 * ------------------------------------------------------------
 * 直接加载 src/scripts/_preset-merge.js（内联进「🔄 远程更新」的那份源，规则只有一份），
 * 风格与 update-flow.mjs 一致：纯 node、假数据、PASS/FAIL 计数、失败即非零退出码。
 * 逐条对照三方合并的硬口径（口径全文见 _preset-merge.js 文件头）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* 与 build/kami-doc.mjs 的 inlineModuleSource 同一条规则：剥掉行首 export 前缀 */
const RAW = fs.readFileSync(path.join(ROOT, 'src', 'scripts', '_preset-merge.js'), 'utf8');
const CODE = RAW.split('\n').map(l => (l.slice(0, 7) === 'export ' ? l.slice(7) : l)).join('\n');
if (CODE === RAW) { throw new Error('剥离 export 失败：_preset-merge.js 里没有 export 声明？'); }
const eng = new Function(CODE + '\n;return { computeMergePlan: computeMergePlan, applyMergePlan: applyMergePlan };')();

let bad = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg + (!cond && extra !== undefined ? '  >> ' + JSON.stringify(extra) : ''));
  if (!cond) { bad++; }
};

/* ---------- 造预设的小工具 ----------
   spec：字段清单。条目 = { identifier:..' } 或字符串（'id' / 'id:off' / 'id:off:文本'）。 */
function promptOf(spec) {
  if (typeof spec === 'string') {
    const pp = spec.split('::');
    const on = pp[0].split(':')[1] !== 'off';
    const id = pp[0].split(':')[0];
    const o = { identifier: id, name: id + ' 名', content: '内容·' + id, role: 'system', enabled: !(on === false) };
    if (pp[1] !== undefined) { o.content = pp[1]; }
    if (on === false) { o.enabled = false; }
    return o;
  }
  return Object.assign({ identifier: spec.identifier, name: spec.name || (spec.identifier + ' 名'),
    content: spec.content || ('内容·' + spec.identifier), role: 'system',
    enabled: spec.enabled !== false }, spec.role !== undefined ? { role: spec.role } : {});
}
function orderOf(spec) {
  if (typeof spec === 'string') {
    const pp = spec.split(':');
    return { identifier: pp[0], enabled: pp[1] !== 'off' };
  }
  return { identifier: spec.identifier, enabled: spec.enabled !== false };
}
function preset(opts) {
  opts = opts || {};
  const p = {
    name: opts.name || 'kami-v0.90-100-20260924',
    temperature: 0.7, openai_max_tokens: 2048,
    prompts: (opts.prompts || []).map(promptOf),
    prompt_order: [{ character_id: 100001, order: (opts.order || (opts.prompts || []).map(s => (typeof s === 'string' ? s.split(':')[0] : s.identifier))).map(orderOf) }],
    extensions: opts.extensions || {}
  };
  if (opts.name !== undefined) { p.name = opts.name; }
  return p;
}
function texts(list) { return list.map(p => p.identifier); }
function mapOf(list) { const x = {}; for (const q of list) { x[q.identifier] = q; } return x; }
function findIn(list, id) { for (const q of list) { if (q.identifier === id) { return q; } } return null; }
function allNext(plan, keyPrefix) { plan.conflicts.forEach(c => { c.choice = 'next'; keyPrefix.x = 1; }); return plan; }

/* ================================================================ */

console.log('--- 口径 A：开关与参数永远保留用户 ---');
{
  const base = preset({ prompts: [{ identifier: 'a' }, { identifier: 'b' }] });
  const theirs = preset({ prompts: [{ identifier: 'a' }, { identifier: 'b' }] });
  theirs.prompts[0].enabled = false;
  theirs.prompt_order[0].order[0].enabled = false;
  const next = preset({ prompts: [{ identifier: 'a', content: '新版的 a' }] });
  next.prompt_order[0].order[0].enabled = true;
  const r = eng.applyMergePlan(base, theirs, next, null);
  ok(r.merged.prompts[0].enabled === false, '条目开关留在用户手里（新版翻成开也不改）', r.merged.prompts[0]);
  ok(r.merged.prompt_order[0].order[0].enabled === false, '顺序表里的开关同样留在用户手里',
    r.merged.prompt_order[0].order[0]);
  ok(r.merged.prompts[0].content === '新版的 a', '开关之外的内容照常吃新版',
    r.merged.prompts[0].content);
  ok(r.plan.conflicts.length === 0, '只有新版改内容 → 不进待裁决', r.plan.conflicts);
}
{
  /* 顺序表开关 = 用户自己的另一处开关（与 prompts[].enabled 同步）；
     用户把 a 关掉、新版没动它的顺序位 → 维持关 */
  const base = preset({ prompts: [{ identifier: 'a' }, { identifier: 'b' }] });
  const theirs = preset({ prompts: [{ identifier: 'a' }, { identifier: 'b' }] });
  theirs.prompt_order[0].order = [{ identifier: 'a', enabled: false }, { identifier: 'b', enabled: true }];
  const next = preset({ prompts: [{ identifier: 'a' }, { identifier: 'b' }] });
  const r = eng.applyMergePlan(base, theirs, next, null);
  ok(r.merged.prompt_order[0].order[0].enabled === false, '顺序表里用户关掉的开关维持关',
    r.merged.prompt_order[0].order[0]);
}

console.log('--- 口径 B：条目内容（三选一） ---');
{
  const base = preset({ prompts: ['a::v1'] });
  const theirs = preset({ prompts: ['a::我自己改的'] });
  const r = eng.applyMergePlan(base, theirs, base, null);
  ok(r.merged.prompts[0].content === '我自己改的', '只有用户改过 → theirs（不问）',
    r.merged.prompts[0].content);
  ok(r.plan.conflicts.length === 0, '…不进待裁决', r.plan.conflicts);
}
{
  const base = preset({ prompts: ['a::v1'] });
  const next = preset({ prompts: ['a::新版改的'] });
  const r = eng.applyMergePlan(base, base, next, null);
  ok(r.merged.prompts[0].content === '新版改的', '只有新版改过 → next（不问，这就是更新）',
    r.merged.prompts[0].content);
  ok(r.plan.conflicts.length === 0, '…不进待裁决', r.plan.conflicts);
}
{
  const base = preset({ prompts: ['a::v1'] });
  const theirs = preset({ prompts: ['a::我的版本'] });
  const next = preset({ prompts: ['a::新版本的版本'] });
  const plan = eng.computeMergePlan(base, theirs, next);
  ok(plan.conflicts.length === 1 && plan.conflicts[0].key === 'pm:a' && plan.conflicts[0].kind === 'prompt',
    '两边都改过 → 进待裁决清单', plan.conflicts);
  ok(plan.conflicts[0].name.indexOf('a') >= 0 && plan.conflicts[0].fields.indexOf('content') >= 0,
    '待裁决项带名字与「改了什么」(content)', plan.conflicts[0]);
  const mine = eng.applyMergePlan(base, theirs, next, null);
  ok(mine.merged.prompts[0].content === '我的版本', '默认（未裁决）= 保留我的',
    mine.merged.prompts[0].content);
  ok(mine.report.decidedMine >= 1, '报告里有「保留你的」计数', mine.report);
  const rNext = eng.applyMergePlan(base, theirs, next,
    { conflicts: [{ key: 'pm:a', choice: 'next' }] });
  ok(rNext.merged.prompts[0].content === '新版本的版本', '一键全覆盖 → 用新版',
    rNext.merged.prompts[0].content);
  ok(rNext.report.applied >= 1 && rNext.report.decidedNext >= 1, '报告里有「应用新版」计数',
    rNext.report);
}

console.log('--- 口径 B：新增与删除 ---');
{
  const base = preset({ prompts: ['a', 'b', 'keep'] });
  const theirs = preset({ prompts: ['a', 'keep', 'user-added'] });    /* 用户删了 b、加了 user-added */
  const next = preset({ prompts: [{ identifier: 'b', content: 'b 新版改过' }, 'a', 'keep', 'next-added'] });
  const plan = eng.computeMergePlan(base, theirs, next);
  ok(plan.conflicts.some(c => c.key === 'rm:b' && c.kind === 'delete'),
    '用户删掉、新版又改过 → 进清单（默认保持删除）', plan.conflicts);
  const r = eng.applyMergePlan(base, theirs, next, null);
  const idl = texts(r.merged.prompts);
  ok(idl.indexOf('b') < 0, '默认裁决下 b 保持删除，不会加回来', idl);
  ok(idl.indexOf('user-added') >= 0, '用户新增的条目保留', idl);
  ok(idl.indexOf('next-added') >= 0, '新版新增的条目直接加进来', idl);
  ok(idl.indexOf('keep') >= 0, '没动过的条目不丢', idl);
  ok(r.merged.prompt_order[0].order.every(o => o.identifier !== 'b'), 'b 不会留在顺序表',
    r.merged.prompt_order[0].order.map(o => o.identifier));
  ok(r.merged.prompt_order[0].order.some(o => o.identifier === 'next-added'),
    '新增条目排进顺序表', r.merged.prompt_order[0].order.map(o => o.identifier));
  /* 待裁决改选「用新版」→ 删掉的条目恢复成新版 */
  const r2 = eng.applyMergePlan(base, theirs, next, { conflicts: [{ key: 'rm:b', choice: 'next' }] });
  ok(texts(r2.merged.prompts).indexOf('b') >= 0, '删改冲突选「用新版」→ 条目恢复', texts(r2.merged.prompts));
  ok(findIn(r2.merged.prompts, 'b').content === 'b 新版改过', '恢复出的就是新版正文',
    findIn(r2.merged.prompts, 'b'));
}
{
  /* 新版删掉、用户没动过 → 跟着删（更新的一部分，不弹窗） */
  const base = preset({ prompts: ['a', 'b'] });
  const next = preset({ prompts: ['a'] });
  const r = eng.applyMergePlan(base, base, next, null);
  ok(texts(r.merged.prompts).indexOf('b') < 0, '新版删掉、用户没动 → 跟着删除',
    texts(r.merged.prompts));
  ok(r.report.followedRemovals === 1, '…且计入「跟着新版删除」', r.report);
  ok(r.plan.conflicts.length === 0, '…不进待裁决', r.plan.conflicts);
}

console.log('--- 口径 B：顺序 ---');
{
  const base = preset({ prompts: ['a', 'b', 'c'] });
  const theirs = preset({ prompts: ['a', 'b', 'c'] });
  theirs.prompt_order[0].order = [orderOf('c'), orderOf('a'), orderOf('b')];
  const next = preset({ prompts: ['a', 'b', 'c'] });
  const r = eng.applyMergePlan(base, theirs, next, null);
  ok(JSON.stringify(r.merged.prompt_order[0].order.map(o => o.identifier)) === JSON.stringify(['c', 'a', 'b']),
    '只有用户调过排列 → 用用户的', r.merged.prompt_order[0].order.map(o => o.identifier));
  ok(r.plan.conflicts.length === 0, '…不进待裁决', r.plan.conflicts);
}
{
  const base = preset({ prompts: ['a', 'b', 'c'] });
  const theirs0 = preset({ prompts: ['a', 'b', 'c'] });
  const next = preset({ prompts: ['a', 'b', 'c'] });
  next.prompt_order[0].order = [orderOf('b'), orderOf('c'), orderOf('a')];
  const r = eng.applyMergePlan(base, theirs0, next, null);
  ok(JSON.stringify(r.merged.prompt_order[0].order.map(o => o.identifier)) === JSON.stringify(['b', 'c', 'a']),
    '只有新版调过排列 → 用新版的',
    r.merged.prompt_order[0].order.map(o => o.identifier));
}
{
  const base = preset({ prompts: ['a', 'b', 'c'] });
  const theirs = preset({ prompts: ['a', 'b', 'c'] });
  theirs.prompt_order[0].order = [orderOf('c'), orderOf('a'), orderOf('b')];
  const next = preset({ prompts: ['a', 'b', 'c'] });
  next.prompt_order[0].order = [orderOf('a'), orderOf('c'), orderOf('b')];
  const plan = eng.computeMergePlan(base, theirs, next);
  ok(plan.conflicts.length === 1 && plan.conflicts[0].kind === 'order' && plan.conflicts[0].key === 'ord:100001',
    '顺序两边都调过 → 单独一项待裁决', plan.conflicts);
  const r = eng.applyMergePlan(base, theirs, next, null);
  ok(JSON.stringify(r.merged.prompt_order[0].order.map(o => o.identifier)) === JSON.stringify(['c', 'a', 'b']),
    '顺序冲突默认=用户的排列', r.merged.prompt_order[0].order.map(o => o.identifier));
  const r2 = eng.applyMergePlan(base, theirs, next, { conflicts: [{ key: 'ord:100001', choice: 'next' }] });
  ok(JSON.stringify(r2.merged.prompt_order[0].order.map(o => o.identifier)) === JSON.stringify(['a', 'c', 'b']),
    '顺序冲突选「用新版」→ 新版排列', r2.merged.prompt_order[0].order.map(o => o.identifier));
}
{
  /* 顺序冲突裁决「用新版」后，顺序表里的开关仍是用户的（硬规格 A2） */
  const base = preset({ prompts: ['a', 'b'] });
  const theirs = preset({ prompts: ['a', 'b'] });
  theirs.prompt_order[0].order = [{ identifier: 'b', enabled: false }, { identifier: 'a', enabled: true }];
  const next = preset({ prompts: ['a', 'b'] });
  next.prompt_order[0].order = [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }];
  const plan = eng.computeMergePlan(base, theirs, next);
  const r = eng.applyMergePlan(base, theirs, next, { conflicts: [{ key: 'ord:100001', choice: 'next' }] });
  const bItem = r.merged.prompt_order[0].order.find(o => o.identifier === 'b');
  ok(!!bItem && bItem.enabled === false, '顺序裁决「用新版」后，用户关掉的开关仍是关的',
    r.merged.prompt_order[0].order);
}

console.log('--- 口径 A3/A4/C：脚本与脚本变量 ---');
{
  function script(id, content, enabled, data) {
    return { id: id, name: id + ' 名', info: id + ' info', content: content, enabled: enabled, data: data || {} };
  }
  const mk = (list, vars) => ({ tavern_helper: { scripts: list, variables: vars || {} }, regex_scripts: [] });
  const base = preset({ prompts: ['a'] });
  base.extensions = mk([script('s1', '正文v1', true, { '皮肤': 'grokbot' }), script('s2', '旧脚本', false)]);
  const theirs = preset({ prompts: ['a'] });
  theirs.extensions = mk([
    script('s1', '正文v1', false, { '皮肤': 'rain', lastCheckAt: 12345 }),
    script('user-script', '用户自己加的脚本', true),
  ], { '记忆': '2' });
  const next = preset({ prompts: ['a'] });
  next.extensions = mk([
    script('s1', '正文v2（新版本的重写）', true, { '皮肤': 'memo' }),
    script('s3', '新版新脚本', true),
  ], { '记忆': '9' });
  const r = eng.applyMergePlan(base, theirs, next, null);
  const scripts = r.merged.extensions.tavern_helper.scripts;
  const s1 = scripts.find(s => s.id === 's1');
  ok(s1 && s1.content === '正文v2（新版本的重写）', '脚本正文一律用 next', s1 && s1.content);
  ok(s1 && s1.enabled === false, '脚本开关留在用户手里', s1 && s1.enabled);
  ok(s1 && s1.data['皮肤'] === 'rain' && s1.data['lastCheckAt'] === 12345,
    '脚本内设置（data）整个留在用户手里（含运行时状态）', s1 && s1.data);
  ok(scripts.some(s => s.id === 'user-script'), '用户自己加的脚本保留', scripts.map(s => s.id));
  ok(scripts.some(s => s.id === 's3'), '新版新增的脚本加进来', scripts.map(s => s.id));
  ok(!scripts.some(s => s.id === 's2'), '新版删掉的脚本不再回来', scripts.map(s => s.id));
  ok(r.merged.extensions.tavern_helper.variables['记忆'] === '2',
    '脚本变量留在用户手里（新版改了也不覆盖）',
    r.merged.extensions.tavern_helper.variables);
}

console.log('--- 口径 A6：正则 ---');
{
  function rx(id, name, findRegex, disabled) {
    return { id: id, script_name: name, find_regex: findRegex, replace_string: 'r', disabled: !!disabled };
  }
  const base = preset({ prompts: ['a'] });
  base.extensions = { regex_scripts: [rx('r1', '压缩', 'f1', false), rx('r2', '行动选项', 'f2', false)] };
  const theirs = preset({ prompts: ['a'] });
  theirs.extensions = { regex_scripts: [rx('r1', '压缩', 'f1', true), rx('user-r', '我的正则', 'fu', false)] };
  const next = preset({ prompts: ['a'] });
  next.extensions = { regex_scripts: [rx('r1', '压缩', 'f1新版', false), rx('r3', '新版新增', 'f3', false)] };
  const r = eng.applyMergePlan(base, theirs, next, null);
  const rl = r.merged.extensions.regex_scripts;
  const r1 = rl.find(x => x.id === 'r1');
  ok(r1 && r1.disabled === true, '正则的开关留在用户手里（新版想重开也不改）', r1 && r1.disabled);
  ok(r1 && r1.find_regex === 'f1新版', '只有新版动过的正则正文 → 用 next', r1 && r1.find_regex);
  ok(rl.some(x => x.id === 'user-r'), '用户自己加的正则保留', rl.map(x => x.id));
  ok(rl.some(x => x.id === 'r3'), '新版新增的正则照加', rl.map(x => x.id));
  ok(r.plan.conflicts.length === 0, '（本组没有两边都改过的真冲突）', r.plan.conflicts);
}
{
  function rx2(id, name, findRegex, disabled) {
    return { id: id, script_name: name, find_regex: findRegex, replace_string: 'r', disabled: !!disabled };
  }
  const base = preset({ prompts: ['a'] });
  base.extensions = { regex_scripts: [rx2('r1', '压缩', 'f1', false)] };
  const theirs = preset({ prompts: ['a'] });
  theirs.extensions = { regex_scripts: [rx2('r1', '压缩', '我自己改的正则', false)] };
  const next = preset({ prompts: ['a'] });
  next.extensions = { regex_scripts: [rx2('r1', '压缩', '新版改的正则', false)] };
  const plan = eng.computeMergePlan(base, theirs, next);
  ok(plan.conflicts.length === 1 && plan.conflicts[0].kind === 'regex' &&
    plan.conflicts[0].fields.indexOf('find_regex') >= 0, '正则两边都改过 → 进待裁决清单', plan.conflicts);
  const mine = eng.applyMergePlan(base, theirs, next, null);
  ok(mine.merged.extensions.regex_scripts[0].find_regex === '我自己改的正则', '正则冲突默认=保留我的',
    mine.merged.extensions.regex_scripts[0]);
  const rN = eng.applyMergePlan(base, theirs, next, { conflicts: [{ key: 'rx:r1', choice: 'next' }] });
  ok(rN.merged.extensions.regex_scripts[0].find_regex === '新版改的正则', '正则冲突选「用新版」→ 吃 next',
    rN.merged.extensions.regex_scripts[0]);
}

console.log('--- 口径 A5：顶层参数 ---');
{
  const base = preset({ prompts: ['a'] });
  const theirs = preset({ prompts: ['a'] });
  theirs.temperature = 1.1; theirs.openai_max_context = 300000;
  const next = preset({ prompts: ['a'] });
  next.temperature = 0.5; next.openai_max_tokens = 4096; next['新的顶层字段'] = '新增';
  const r = eng.applyMergePlan(base, theirs, next, null);
  ok(r.merged.temperature === 1.1, '顶层参数一律用户（新版改了也不覆盖）', r.merged.temperature);
  ok(r.merged.openai_max_context === 300000, '顶层参数（第 2 处）同样留用户', r.merged.openai_max_context);
  ok(r.merged['新的顶层字段'] === '新增', 'next 独有的顶层字段照加（用户没有的才算「新结构」）',
    r.merged['新的顶层字段']);
}
{
  const next = preset({ prompts: ['a'], name: 'kami-v0.90-999-20260925' });
  const r = eng.applyMergePlan(preset({ prompts: ['a'] }), preset({ prompts: ['a'] }), next, null);
  ok(r.merged.name === 'kami-v0.90-999-20260925', 'name 跟着新版走（这份文件就是新版）', r.merged.name);
}

console.log('--- 退化模式（base 取不到）---');
{
  const theirs = preset({ prompts: ['a::我的 a', 'b::用户版的 b'] });
  const next = preset({ prompts: ['a::新版改的 a', 'b::新版的 b', 'next-added'] });
  const plan = eng.computeMergePlan(null, theirs, next);
  ok(plan.degraded === true, 'base=null → 计划标记退化模式', plan.degraded);
  ok(plan.conflicts.some(c => c.key === 'pm:a' && c.kind === 'prompt'), '退化：a 的差异进清单',
    plan.conflicts.map(c => c.key));
  ok(plan.conflicts.some(c => c.key === 'pm:b'), '退化：b 的差异同样进清单', plan.conflicts.map(c => c.key));
  const mine = eng.applyMergePlan(null, theirs, next, null);
  ok(mine.merged.prompts[0].content === '我的 a', '退化默认 = 保留我的',
    mine.merged.prompts[0]);
  ok(mapOf(mine.merged.prompts)['next-added'] !== undefined, '退化：新版新增条目照加',
    texts(mine.merged.prompts));
  const r2 = eng.applyMergePlan(null, theirs, next, { conflicts: [{ key: 'pm:a', choice: 'next' }, { key: 'pm:b', choice: 'next' }] });
  ok(r2.merged.prompts[0].content === '新版改的 a', '退化清单一键全覆盖 → 全部吃新版',
    r2.merged.prompts[0]);
}

console.log('--- 合并结果的合法性 ---');
{
  const base = preset({ prompts: ['a', 'b'] });
  const theirs = preset({ prompts: ['a::用户改的 a', 'user-added'] });
  const next = preset({ prompts: ['a::新版改的 a', 'next-added'] });
  const plan = eng.computeMergePlan(base, theirs, next);
  const cases = [
    eng.applyMergePlan(base, theirs, next, null),
    eng.applyMergePlan(base, theirs, next, { conflicts: [{ key: 'pm:a', choice: 'next' }] }),
  ];
  for (const rr of cases) {
    const mm = rr.merged;
    ok(Array.isArray(mm.prompts), '合并结果 prompts 是数组', typeof mm.prompts);
    ok(Array.isArray(mm.prompt_order) && mm.prompt_order.length > 0, 'prompt_order 是非空数组',
      mm.prompt_order);
    const set = mapOf(mm.prompts);
    ok(mm.prompt_order[0].order.every(o => set[o.identifier] !== undefined),
      '顺序表里的每一项都能在 prompts 里找到（两边对得上）', mm.prompt_order[0].order);
    ok(mapOf(mm.prompts)['user-added'] !== undefined, '用户新增条目在',
      texts(mm.prompts));
    ok(mapOf(mm.prompts)['next-added'] !== undefined, '新版新增条目在', texts(mm.prompts));
    ok(mm.extensions && Array.isArray(mm.extensions.regex_scripts), 'extensions.regex_scripts 还是数组',
      mm.extensions && Array.isArray(mm.extensions.regex_scripts));
    ok(texts(mm.prompts).filter(x => x === 'a').length === 1 && mapOf(mm.prompts)['a'] !== undefined,
      '没丢条目、也没造重复', texts(mm.prompts));
  }
}

console.log('--- 计划的统计口径 ---');
{
  const base = preset({ prompts: ['a::v1', 'b'] });
  const theirs = preset({ prompts: ['a::我的 a', 'b'] });
  const next = preset({ prompts: ['a::新版的 a', 'b', 'n'] });
  const plan = eng.computeMergePlan(base, theirs, next);
  ok(plan.stats.conflicts === plan.conflicts.length, '统计里的冲突数 == 清单长度', plan.stats);
  ok(plan.stats.added >= 1, '统计里有「新增」计数', plan.stats);
  ok(typeof plan.stats.applied === 'number', '统计里有「应用新版」计数', plan.stats);
}

console.log('\n结果：' + (total - bad) + ' / ' + total + ' 通过');
process.exit(bad ? 1 : 0);
