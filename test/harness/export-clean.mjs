#!/usr/bin/env node
/**
 * 「导出纯净正文」纯逻辑单测（离线，不需要酒馆、不需要浏览器）
 * 用法：node test/harness/export-clean.mjs
 *
 * 覆盖：楼层范围解析与四种边界、只导 AI 的筛选、当前 swipe 的取法、
 *       role 前缀拼装、楼层间空行、文件名、以及内联契约。
 *
 * 加载方式与构建期**同一条路**：把两个模块的源码去掉行首 export 后拼起来 eval ——
 * _export-clean.js 用的 tidyCopyText 来自 _copy-clean.js，两边在 40 号里是同一个作用域，
 * 所以这里也照那样拼（顺带把"能不能内联"这件事一起验了）。
 */
import { readFileSync } from 'node:fs';

const NAMES = ['parseFloorRange', 'planExport', 'buildExportText', 'exportFileName', 'exportErrorText',
  'messageText', 'roleOf', 'isUserMessage', 'isSystemMessage', 'fallbackCleanText',
  'tidyCopyText', 'cleanCopyText', 'EXPORT_ERRORS', 'floorToIndex', 'EXPORT_NL'];
function loadInlined(paths) {
  const src = paths.map(p => readFileSync(new URL(p, import.meta.url), 'utf8')
    .split('\n').map(l => (l.slice(0, 7) === 'export ') ? l.slice(7) : l).join('\n')).join('\n');
  const body = src + '\nreturn {' + NAMES.map(n => n + ': ' + n).join(', ') + '};';
  return new Function(body)();
}
let M;
try { M = loadInlined(['../../src/scripts/_copy-clean.js', '../../src/scripts/_export-clean.js']); }
catch (e) { console.log('✗ 内联加载失败：' + e.message); process.exit(1); }

let pass = 0, fail = 0;
const bad = [];
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return; }
  fail++;
  bad.push(label + '\n    期望：' + JSON.stringify(b) + '\n    实际：' + JSON.stringify(a));
}
const ok = (c, label) => eq(!!c, true, label);

const mkChat = (n) => {
  const c = [];
  for (let i = 0; i < n; i++) { c.push({ name: i % 2 ? 'AI' : '我', is_user: i % 2 === 0, mes: '第' + (i + 1) + '条正文' }); }
  return c;
};

/* ── ① 楼层范围：默认全部 + 四种边界 ── */
{
  const chat = mkChat(10);
  eq(M.parseFloorRange('', '', 10), { ok: true, from: 1, to: 10, total: 10 }, '① 两个都留空 = 全部');
  eq(M.parseFloorRange('3', '', 10), { ok: true, from: 3, to: 10, total: 10 }, '① 只填起始');
  eq(M.parseFloorRange('', '4', 10), { ok: true, from: 1, to: 4, total: 10 }, '① 只填结束');
  eq(M.parseFloorRange('3', '5', 10), { ok: true, from: 3, to: 5, total: 10 }, '① 正常范围');
  eq(M.parseFloorRange(' 3 ', ' 5 ', 10), { ok: true, from: 3, to: 5, total: 10 }, '① 两头空格也认');
  eq(M.parseFloorRange('5', '3', 10).code, 'REVERSED', '① 范围填反 → REVERSED');
  eq(M.parseFloorRange('0', '5', 10).code, 'OUT_OF_RANGE', '① 起始 0 → OUT_OF_RANGE（楼层从 1 起）');
  eq(M.parseFloorRange('1', '11', 10).code, 'OUT_OF_RANGE', '① 超过总楼层 → OUT_OF_RANGE');
  eq(M.parseFloorRange('1', '11', 10).total, 10, '① 越界时把总层数带出去，好在界面上说清楚');
  eq(M.parseFloorRange('abc', '5', 10).code, 'BAD_NUMBER', '① 填了非数字 → BAD_NUMBER');
  eq(M.parseFloorRange('1.5', '', 10).code, 'BAD_NUMBER', '① 小数也当非数字（楼层号是整数）');
  eq(M.parseFloorRange('', '', 0).code, 'NO_FLOOR', '① 零楼层 → NO_FLOOR');
  eq(M.parseFloorRange('', '', 0).total, 0, '① 零楼层带 total=0');
  eq(M.parseFloorRange('-1', '', 10).code, 'BAD_NUMBER', '① 负数 → BAD_NUMBER（连字符不是数字）');
}

/* ── ② 选楼层：只导 AI / 两边都导 / 隐藏消息 ── */
{
  const chat = mkChat(6);   /* 下标 0,2,4 是用户；1,3,5 是 AI */
  const all = M.planExport(chat, '', '', false);
  eq(all.ok, true, '② 全部导出：ok');
  eq(all.picks.length, 6, '② 全部导出：6 条都在');
  eq(all.picks.map(p => p.floor), [1, 2, 3, 4, 5, 6], '② 楼层号从 1 开始、连续');
  eq(all.picks.map(p => p.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant'], '② role 逐条对');

  const ai = M.planExport(chat, '', '', true);
  eq(ai.picks.length, 3, '② 只导 AI：只剩 3 条');
  eq(ai.picks.map(p => p.floor), [2, 4, 6], '② 只导 AI：跳过用户消息，但楼层号仍是真实楼层号');
  eq(ai.skippedUser, 3, '② 只导 AI：跳掉 3 条用户消息');

  const ranged = M.planExport(chat, '2', '4', false);
  eq(ranged.picks.map(p => p.floor), [2, 3, 4], '② 范围 2-4 只取这三层');
  eq(ranged.picks[0].index, 1, '② 楼层 2 对应数组下标 1');

  /* 隐藏 / 系统消息：整条跳过，但要计数 */
  const sys = mkChat(4);
  sys[1].is_system = true;
  const s = M.planExport(sys, '', '', false);
  eq(s.picks.map(p => p.floor), [1, 3, 4], '② 隐藏消息不导，且不占位（楼层号仍是它自己的号）');
  eq(s.skippedSystem, 1, '② 隐藏消息的条数报出来，好在界面上说明');

  /* 全被筛掉：必须明确报错，不许静默给空文件 */
  const onlyUser = [{ name: '我', is_user: true, mes: '只有用户消息' }];
  eq(M.planExport(onlyUser, '', '', true).code, 'ALL_FILTERED', '② 只导 AI 但一条 AI 都没有 → ALL_FILTERED');
}

/* ── ③ 取的是**当前** swipe，不是所有 swipe ── */
{
  eq(M.messageText({ mes: '当前这份', swipes: ['旧的甲', '旧的乙'], swipe_id: 1 }), '当前这份',
    '③ mes 就是当前显示的那一份');
  eq(M.messageText({ mes: '', swipes: ['甲', '乙'], swipe_id: 1 }), '乙', '③ mes 空着才回头去 swipes[swipe_id] 里捞');
  eq(M.messageText({ mes: '', swipes: ['甲', '乙'], swipe_id: 0 }), '甲', '③ swipe_id=0 取第一条');
  eq(M.messageText({ mes: '唯一' }), '唯一', '③ 没有 swipes 也照常');
  eq(M.messageText(null), '', '③ 空条目返回空串，不炸');
}

/* ── ④ 拼文本：role 前缀、楼层间空行、段落换行 ── */
{
  const picks = [
    { role: 'user', text: '用户第一段。' },
    { role: 'assistant', text: 'AI第一段。\n\nAI第二段。' }
  ];
  eq(M.buildExportText(picks, false), '用户第一段。\n\nAI第一段。\n\nAI第二段。',
    '④ 只导 AI 时：没有 role 前缀，楼层之间空行，段落换行保留');
  eq(M.buildExportText(picks, true),
    'role：user\n用户第一段。\n\nrole：assistant\nAI第一段。\n\nAI第二段。',
    '④ 两边都导时：每条前面写 role：user / role：assistant，正文在第一行下面');

  eq(M.buildExportText([{ role: 'user', text: '   ' }], true), '', '④ 空白条目直接跳过，不留空块');
  eq(M.buildExportText([{ role: 'user', text: '甲\n\n\n\n乙' }], false), '甲\n\n乙',
    '④ 连续空行收到一个（用的就是复制那块 tidyCopyText，同一套规则）');
  eq(M.buildExportText([], true), '', '④ 空列表给空串');
  ok(M.buildExportText(picks, true).indexOf('role：') === 0, '④ role 标识用的是全角冒号（用户原话的写法）');
}

/* ── ⑤ 文件名带范围 ── */
{
  eq(M.exportFileName(1, 120), '卡密预设-正文-1-120.txt', '⑤ 文件名带范围');
  eq(M.exportFileName(5, 5), '卡密预设-正文-5-5.txt', '⑤ 单层也带范围');
}

/* ── ⑥ 提示语：每个错误码都得有人话，且不许静默 ── */
{
  for (const code of ['BAD_NUMBER', 'REVERSED', 'OUT_OF_RANGE', 'NO_FLOOR', 'ALL_FILTERED', 'NO_CTX', 'EMPTY_RESULT']) {
    const s = M.exportErrorText(code, {});
    ok(typeof s === 'string' && s.length >= 6 && s !== code, '⑥ ' + code + ' 有中文提示，不是把错误码甩给用户');
  }
  ok(M.exportErrorText('OUT_OF_RANGE', { total: 88 }).indexOf('88') >= 0, '⑥ 越界提示里写出总层数');
  ok(M.exportErrorText('ALL_FILTERED', { skippedSystem: 2 }).indexOf('2') >= 0, '⑥ 全被筛掉时说明有几条隐藏消息');
  eq(M.exportErrorText('没这个码'), '导出失败', '⑥ 未知错误码也有兜底文案');
}

/* ── ⑦ 兜底清洗：保守，且不该动的别动 ── */
{
  eq(M.fallbackCleanText('<nyaruko_think>内心</nyaruko_think>\n\n正文。'), '内心\n\n正文。',
    '⑦ 兜底只摘尖括号，正文留着');
  eq(M.fallbackCleanText('甲\n\n\n\n乙'), '甲\n\n乙', '⑦ 兜底也走同一套换行规则');
  eq(M.fallbackCleanText('数学 3 < 5 且 7 > 4'), '数学 3  4',
    '⑦ 兜底的已知代价：正文里的裸尖括号会被误删（所以界面必须说明它不是所见即所得）');
}

/* ── ⑧ 内联契约 ── */
{
  for (const [name, p] of [['_export-clean.js', '../../src/scripts/_export-clean.js'], ['_copy-clean.js', '../../src/scripts/_copy-clean.js']]) {
    const src = readFileSync(new URL(p, import.meta.url), 'utf8');
    ok(src.indexOf('$') < 0, '⑧ ' + name + ' 没有美元符号');
    ok(src.indexOf('{{') < 0, '⑧ ' + name + ' 没有大括号宏');
    ok(src.indexOf('import ') < 0, '⑧ ' + name + ' 没有 import（内联前提）');
    ok(src.split('\n').filter(l => /^\s+export\s/.test(l)).length === 0, '⑧ ' + name + ' 没有缩进的 export');
    ok(src.split('\n').filter(l => l.slice(0, 7) === 'export ').length >= 2, '⑧ ' + name + ' 有行首 export 可去');
  }
}

console.log((fail ? '✗ ' : '✓ ') + '导出纯净正文：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
