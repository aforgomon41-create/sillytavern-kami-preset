/* ============================================================
 * 📜 压缩 · 纯逻辑离线自测（node test/harness/summarize-pure.mjs）
 * ------------------------------------------------------------
 * 测的是 src/scripts/_summarize-pure.js（构建期内联进 60-压缩.js 的那份源码）。
 * 覆盖两块：
 *   A. 摘要响应解析：只认合法 JSON，供应商报错/纯文本/半个 JSON 全部判失败
 *   B. 世界书对账：块条目是唯一真相（手改生效、删块记待重做、孤儿隐藏楼层分两类）
 * 不需要酒馆、不需要浏览器、不联网：纯函数进纯函数出。
 * 用法：node test/harness/summarize-pure.mjs   （全绿退出码 0，有失败退出码 1）
 * ============================================================ */
import {
  parseSummaryResponse, assembleBlockText, normalizeSummaryFields, extractJsonObject,
  looksLikeProviderError, rangesOf, countFloors, mergeRanges, subtractRanges,
  parseBlockName, stripBlockHeader, blockContent, pendingFloors, reconcileBlocks,
  summaryJsonSchema, SUMMARY_SCHEMA, rawHead
} from '../../src/scripts/_summarize-pure.js';

let pass = 0, bad = 0;
const NL = String.fromCharCode(10);
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  [通过] ' + name); }
  else { bad++; console.log('  [失败] ' + name + (detail === undefined ? '' : '  →  ' + detail)); }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(name, a === e, '实际 ' + a + ' / 期望 ' + e);
}

const PREFIX = '📜 压缩块 #';

/* ───────── A. 摘要响应解析 ───────── */
console.log('=== A. 摘要响应解析 ===');

const GOOD = { timeline: '第一天傍晚，酒馆', plot: '主角走进酒馆，和老板聊起了三年前的旧案，气氛逐渐紧张起来。'.repeat(2), changes: ['拿到旧案卷宗', '老板态度转冷'] };
const GOOD_JSON = JSON.stringify(GOOD);

ok('A1 裸 JSON 通过', parseSummaryResponse(GOOD_JSON).ok);
ok('A2 带 ```json 围栏通过', parseSummaryResponse('```json' + NL + GOOD_JSON + NL + '```').ok);
ok('A3 JSON 前有寒暄也通过（取第一个完整对象）', parseSummaryResponse('好的，这是本块的提要：' + NL + GOOD_JSON).ok);
ok('A4 对象直接传进来通过', parseSummaryResponse(GOOD).ok);
eq('A5 还原成人话（不是 JSON）', assembleBlockText(GOOD).slice(0, 4), '时间线：');
ok('A6 人话里没有花括号', assembleBlockText(GOOD).indexOf('{') < 0);

/* 供应商报错的各种形状 —— 这是这个 bug 的正题 */
const ERRS = {
  '中转站把错误塞进 content（HTTP 200）': '当前分组上游负载已饱和，请稍后重试',
  '配额错误': 'insufficient_quota: You exceeded your current quota',
  '鉴权失败': '{"error":{"message":"Invalid API key provided","type":"invalid_request_error"}}',
  'Cloudflare 错误页': '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head></html>',
  '网关英文': 'Bad gateway: upstream connect error or disconnect/reset before headers',
  'ST 的配额字面量': '[object Object]',
  'HTTP 状态行': 'HTTP 429: rate limit exceeded',
  '英文重试提示': 'The upstream service is temporarily unavailable. Please try again later.',
  '中文额度': '账户余额不足，请充值后使用'
};
for (const [label, text] of Object.entries(ERRS)) {
  const r = parseSummaryResponse(text);
  ok('A7 判失败 · ' + label, !r.ok, 'reason=' + r.reason);
  ok('A7b reason 认出来了 · ' + label, r.reason === 'errorText' || r.reason === 'errorJson', 'reason=' + r.reason);
}
ok('A8 纯文本（不是报错）也判失败，不宽松收下', !parseSummaryResponse('主角走进酒馆，老板抬头看了他一眼。'.repeat(8)).ok);
eq('A8b 纯文本的 reason 是 noJson', parseSummaryResponse('主角走进酒馆，老板抬头看了他一眼。'.repeat(8)).reason, 'noJson');
eq('A9 空回复', parseSummaryResponse('   ').reason, 'empty');
eq('A9b null 回复', parseSummaryResponse(null).reason, 'empty');
eq('A10 半个 JSON', parseSummaryResponse('{"timeline":"x","plot":"主角走进酒馆，老板抬头看了他一眼，气氛不太对劲。"').reason, 'badJson');
eq('A10b 只有 timeline 没有正文', parseSummaryResponse('{"timeline":"第一天","changes":["a"]}').reason, 'noFields');
eq('A10c plot 太短（空壳）', parseSummaryResponse('{"timeline":"第一天","plot":"无","changes":[]}').reason, 'noFields');
eq('A10d JSON 里包着报错', parseSummaryResponse('{"error":{"message":"invalid api key"}}').reason, 'errorJson');
ok('A11 报错文案识别器本身', looksLikeProviderError('当前分组上游负载已饱和') && looksLikeProviderError('<!DOCTYPE html>') && !looksLikeProviderError('时间线：主角走进酒馆，老板抬头看了他一眼。'));

/* 别名与容错 */
ok('A12 changes 是数组以外的形状也能收（一段文本按行拆）', normalizeSummaryFields({ plot: '主角走进酒馆，老板抬头看了他一眼，气氛不太对劲。', changes: '- 拿到卷宗' + NL + '- 老板转冷' }).changes.length === 2);
ok('A13 别名 summary / 时间线 也认', normalizeSummaryFields({ summary: '主角走进酒馆，老板抬头看了他一眼，气氛不太对劲。', 时间线: '傍晚' }).timeline === '傍晚');

/* 括号配对：字符串里的花括号不能骗到扫描器 */
eq('A14 字符串里的花括号不影响配对', extractJsonObject('{"plot":"他说\\"{\\"然后就走了，这一段够长够长了啊啊啊"}'), '{"plot":"他说\\"{\\"然后就走了，这一段够长够长了啊啊啊"}');
eq('A15 没有对象时返回 null', extractJsonObject('这里根本没有大括号'), null);
ok('A16 schema 形状（酒馆助手要 name/value/strict）', summaryJsonSchema().value === SUMMARY_SCHEMA && summaryJsonSchema().strict === true && summaryJsonSchema().name === 'kami_block_summary');
eq('A17 schema 三字段必填 + additionalProperties:false', [SUMMARY_SCHEMA.required, SUMMARY_SCHEMA.additionalProperties], [['timeline', 'plot', 'changes'], false]);
eq('A18 rawHead 压平换行并截断', rawHead('a' + NL + 'b', 3), 'a b');

/* ───────── 区间工具 ───────── */
console.log('=== B. 区间工具 ===');
eq('B1 rangesOf 合并相邻', rangesOf([3, 1, 2, 7, 9, 8]), [{ from: 1, to: 3 }, { from: 7, to: 9 }]);
eq('B2 countFloors', countFloors([{ from: 1, to: 3 }, { from: 7, to: 9 }]), 6);
eq('B3 mergeRanges 合并重叠', mergeRanges([{ from: 1, to: 5 }, { from: 3, to: 9 }]), [{ from: 1, to: 9 }]);
eq('B4 subtractRanges 抠洞（含中间）', subtractRanges([{ from: 1, to: 10 }], [{ from: 3, to: 5 }]), [{ from: 1, to: 2 }, { from: 6, to: 10 }]);
eq('B5 subtractRanges 全被盖住', subtractRanges([{ from: 3, to: 5 }], [{ from: 1, to: 10 }]), []);
eq('B6 块条目的名字', parseBlockName(PREFIX, '📜 压缩块 #12｜楼层 200-219'), { index: 12, from: 200, to: 219 });
eq('B7 名字不匹配返回 null', parseBlockName(PREFIX, '别的条目'), null);
eq('B8 正文去头', stripBlockHeader('【剧情提要｜楼层 1-20】' + NL + '时间线：傍晚'), '时间线：傍晚');
eq('B9 没有头时原样返回', stripBlockHeader('时间线：傍晚'), '时间线：傍晚');
eq('B10 正文加头', blockContent(1, 20, '时间线：傍晚'), '【剧情提要｜楼层 1-20】' + NL + '时间线：傍晚');
eq('B11 待重做段取楼层（含隐藏的、跳过例外楼层）', pendingFloors({ from: 1, to: 4 }, 10, [2]), [1, 3, 4]);
eq('B12 待重做段越界收拢', pendingFloors({ from: 8, to: 99 }, 10, []), [8, 9]);

/* ───────── C. 世界书对账 ───────── */
console.log('=== C. 世界书对账 ===');

function entry(uid, from, to, text) {
  return { uid: uid, comment: PREFIX + (uid + 1) + '｜楼层 ' + from + '-' + to, content: blockContent(from, to, text), depth: 5 };
}
/* 真实世界书条目里没有 from/to 字段 —— 账本的结构得从条目名字里解析出来，
   所以测试助手也走同一条路，别偷偷给条目加字段（加了就测不出真行为）。 */
function ledgerV3(entries, extra) {
  const blocks = (entries || []).map(en => {
    const p = parseBlockName(PREFIX, en.comment);
    return { from: p.from, to: p.to, at: null, uid: en.uid };
  });
  return Object.assign({
    v: 3, covered: -1, pins: [], hiddenByUs: [], pending: [], blocks: blocks
  }, extra || {});
}
const LEN = 100, KEEP = 20;

/* C1 正常：账本与条目一致 */
{
  const e = [entry(0, 0, 19, '第一块正文'), entry(1, 20, 39, '第二块正文')];
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e), pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C1 块数与范围', r.blocks.map(b => b.from + '-' + b.to), ['0-19', '20-39']);
  eq('C1b 前沿', r.covered, 39);
  eq('C1c 没有待重做', r.pending, []);
}
/* C2 用户手改块正文 → 面板/请求拿到的就是改后的（唯一真相） */
{
  const e = [entry(0, 0, 19, '第一块正文')];
  e[0].content = blockContent(0, 19, '用户自己重写的正文');
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e), pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C2 用户手改的正文被采用', r.blocks[0].text, '用户自己重写的正文');
}
/* C3 删掉块条目 → 该段进待重做，前沿不倒退 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块'), entry(2, 40, 59, '第三块')];
  const ledger = ledgerV3(e);
  const left = [e[0], e[2]];                 // 用户删掉中间那块
  const r = reconcileBlocks({ prefix: PREFIX, entries: left, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C3 中间缺块 → 待重做那一段', r.pending, [{ from: 20, to: 39 }]);
  eq('C3b 前沿不退（还是 59）', r.covered, 59);
  eq('C3c 活着的块', r.blocks.map(b => b.from + '-' + b.to), ['0-19', '40-59']);
}
/* C4 正文被清空 = 等同于删掉 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const ledger = ledgerV3(e);
  e[1].content = '【剧情提要｜楼层 20-39】';   // 只剩格式头
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C4 正文清空 → 待重做', r.pending, [{ from: 20, to: 39 }]);
}
/* C5 账本整个丢了 → 按条目名收养，前沿按最大块尾 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: null, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C5 收养后块数', r.blocks.length, 2);
  ok('C5b adopted 标记', r.adopted === true);
  eq('C5c 前沿按最大块尾', r.covered, 39);
}
/* C6 用户手加块条目 → 收养 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(7, 20, 39, '我自己加的块')];
  const ledger = { v: 3, covered: 19, pins: [], hiddenByUs: [], pending: [], blocks: [{ from: 0, to: 19, at: null, uid: 0 }] };
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C6 手加的块被收养并推进前沿', r.covered, 39);
  ok('C6b 手加的块正文也在', r.blocks.some(b => b.text === '我自己加的块'));
}
/* C7 孤儿隐藏楼层：我们隐藏过的自动重做；来路不明的只报警 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const hiddenByUs = [];
  for (let i = 40; i <= 50; i++) { hiddenByUs.push(i); }   // 丢掉的块覆盖过、也是我们隐藏的
  const ledger = ledgerV3(e, { covered: 59, hiddenByUs: hiddenByUs });
  const hidden = [];
  for (let i = 0; i < 53; i++) { hidden.push(i); }         // 40-52 全隐藏，其中 51/52 不是我们藏的
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledger, pins: [], hiddenFloors: hidden, len: LEN, keep: KEEP });
  eq('C7 我们隐藏的孤儿 → 自动待重做', r.pending, [{ from: 40, to: 50 }]);
  eq('C7b 来路不明的孤儿 → 只报警', r.orphan, [{ from: 51, to: 52 }]);
}
/* C7c 保留区里的隐藏楼层不算孤儿 */
{
  const e = [entry(0, 0, 19, '第一块')];
  const hidden = [];
  for (let i = 90; i < 100; i++) { hidden.push(i); }
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e, { covered: 95 }), pins: [], hiddenFloors: hidden, len: LEN, keep: KEEP });
  eq('C7c 保留区内的隐藏楼层不进孤儿', r.orphan, []);
}
/* C8 待重做段与活着的块重叠 → 抠掉已被覆盖的部分 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const ledger = ledgerV3(e, { pending: [{ from: 30, to: 45 }] });
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C8 重叠部分被抠掉', r.pending, [{ from: 40, to: 45 }]);
}
/* C9 疑似失败内容体检 */
{
  const e = [entry(0, 0, 19, '正常正文'), entry(1, 20, 39, '当前分组上游负载已饱和，请稍后重试')];
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e), pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C9 标出疑似报错的块序号', r.suspect, [1]);
}
/* C10 同范围重复条目 → 只留一条并报警 */
{
  const e = [entry(0, 0, 19, 'A'), entry(1, 0, 19, 'B')];
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e), pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C10 重复只留一条', r.blocks.length, 1);
  eq('C10b 重复被记下来', r.dup, ['0-19']);
}
/* C11 账本里的例外楼层被认领 */
{
  const e = [entry(0, 0, 19, 'A')];
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e, { pins: [5, 3] }), pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C11 例外楼层读出来了（并排序）', r.pins, [3, 5]);
}
/* C12 保留区里的隐藏楼层不算孤儿（它压根没到该总结的位置） */{
  const e = [entry(0, 0, 19, 'A')];
  const hidden = [];
  for (let i = 85; i < 100; i++) { hidden.push(i); }
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledgerV3(e, { covered: 99 }), pins: [], hiddenFloors: hidden, len: LEN, keep: KEEP });
  eq('C12 保留区内的隐藏楼层不进孤儿', r.orphan, []);
}
/* C13 条目被改名 → 靠账本里的 uid 仍然认得出（不然会当成"块没了"重做一遍，
       而那个改名的条目还在世界里注入内容 = 同一段剧情两份） */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const ledger = ledgerV3(e);
  const renamed = [e[0], Object.assign({}, e[1], { comment: '📜 压缩块 #2｜楼层 20-39（主角线）' })];
  const r = reconcileBlocks({ prefix: PREFIX, entries: renamed, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C13 改名后仍算活着（不重做）', r.pending, []);
  eq('C13b 块还在，正文照旧', r.blocks.map(b => b.from + '-' + b.to), ['0-19', '20-39']);
  eq('C13c 正文取条目里的', r.blocks[1].text, '第二块');
}
/* C14 改名 + 改正文：正文照样以条目为准 */
{
  const e = [entry(0, 0, 19, '第一块'), entry(1, 20, 39, '第二块')];
  const ledger = ledgerV3(e);
  const renamed = [e[0], Object.assign({}, e[1], { comment: '我的第二块', content: '用户重写过的正文' })];
  const r = reconcileBlocks({ prefix: PREFIX, entries: renamed, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C14 改名 + 改正文 → 用条目里的正文', r.blocks[1].text, '用户重写过的正文');
  eq('C14b 不算重做', r.pending, []);
}
/* C15 账本里的 block 记录指向一个已经不存在的 uid，但同名条目还在 → 按范围认领 */
{
  const e = [entry(9, 0, 19, '第一块')];       // 条目 uid=9（世界书被导出重导过）
  const ledger = ledgerV3([entry(0, 0, 19, '第一块')]);   // 账本记的是 uid=0
  const r = reconcileBlocks({ prefix: PREFIX, entries: e, ledger: ledger, pins: [], hiddenFloors: [], len: LEN, keep: KEEP });
  eq('C15 uid 对不上时按楼层范围认领', r.pending, []);
  eq('C15b 块还活着', r.blocks.length, 1);
}

console.log(NL + '=== 结果：' + pass + ' 通过 / ' + bad + ' 失败 ===');
process.exit(bad ? 1 : 0);
