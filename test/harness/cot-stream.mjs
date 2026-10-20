import assert from 'node:assert/strict';
import { createCotStream, newCotCollector, COT_OPEN, COT_CLOSE } from '../../src/scripts/_cot-stream.js';

let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function run(text, splits) {
  const collector = newCotCollector();
  const stream = createCotStream(collector);
  let out = '';
  if (!splits) {
    out = stream.push(text) + stream.finish();
  } else {
    let at = 0;
    for (const n of splits) { out += stream.push(text.slice(at, at + n)); at += n; }
    out += stream.push(text.slice(at)) + stream.finish();
  }
  return { out, collector };
}
function snapshot(r) {
  return { out: r.out, text: r.collector.text, partial: r.collector.partial, blocks: r.collector.blocks, closed: r.collector.closed, unclosed: r.collector.unclosed, bufferLimited: r.collector.bufferLimited };
}

const intro = '<out_body>\n<introduction>\n' + COT_OPEN + '\n思考 <content> 引用 </nyaruko_think>\n</introduction>\n<content>正文</content>\n</out_body>';
const introExpected = '<out_body>\n<introduction>\n\n</introduction>\n<content>正文</content>\n</out_body>';
const cases = [
  ['前缀' + COT_OPEN + '思考</nyaruko_think>后缀', '前缀后缀', '思考'],
  [intro, introExpected, '思考 <content> 引用'],
  [COT_OPEN + '一</nyaruko_think>中间' + COT_OPEN + '二</nyaruko_think>尾', '中间尾', '一\n\n二'],
  [COT_OPEN + '</nyaruko_think>空块', '空块', ''],
  [COT_OPEN + '未闭合 <content>正文', COT_OPEN + '未闭合 <content>正文', ''],
  [COT_OPEN + '想</nyaruko_thin', COT_OPEN + '想</nyaruko_thin', ''],
  ['普通文字 < 2 和 ' + COT_OPEN + '想</nyaruko_think>', '普通文字 < 2 和 ', '想'],
  ['<nyaruko_think>开头' + COT_CLOSE, '', '开头'],
  ['a<nyaruko_think>b</nyaruko_think>c<nyaruko_think>d</nyaruko_think>e', 'ace', 'b\n\nd']
];
for (const [source, expectedOut, expectedText] of cases) {
  const base = run(source);
  eq(base.out, expectedOut, '正文输出：' + source.slice(0, 24));
  eq(base.collector.text, expectedText, '扣留文本：' + source.slice(0, 24));
  eq(base.collector.blocks, expectedText ? expectedText.split('\n\n').length : (source.includes(COT_CLOSE) ? 1 : 0), '块数：' + source.slice(0, 24));
  for (let split = 0; split <= source.length; split++) {
    eq(snapshot(run(source, [split])), snapshot(base), '任意双分片：' + source.slice(0, 24) + ' @' + split);
  }
  eq(snapshot(run(source, Array(source.length).fill(1))), snapshot(base), '逐字符：' + source.slice(0, 24));
}

/* 代码块 / 行内代码 / 引号里的同名标签不算结构标签 */
const fence = COT_OPEN + '代码\n```xml\n' + COT_OPEN + '示例</nyaruko_think>\n```\n真结尾</nyaruko_think>后';
eq(run(fence).out, '后', '代码块内同名标签不结束块');
eq(run(fence).collector.text, '代码\n```xml\n<nyaruko_think>示例</nyaruko_think>\n```\n真结尾', '代码块内容原样扣留');
const inline = COT_OPEN + '引用`</nyaruko_think>`和“</nyaruko_think>”</nyaruko_think>后';
eq(run(inline).out, '后', '行内代码与引号里的结束标签不结束块');
eq(run(inline).collector.text, '引用`</nyaruko_think>`和“</nyaruko_think>”', '引用文本原样扣留');
const example = '前言\n```xml\n' + COT_OPEN + '示例</nyaruko_think>\n```\n' + COT_OPEN + '真</nyaruko_think>后';
eq(run(example).out, '前言\n```xml\n<nyaruko_think>示例</nyaruko_think>\n```\n后', '代码块里的示例不会被搬走');
eq(run(example).collector.text, '真', '只搬代码块外的真块');

/* 未闭合：原样放回正文，collector 不写 text；partial 留给中止兜底 */
const unclosed = run(COT_OPEN + '半截 <content> 正文');
eq(unclosed.out, COT_OPEN + '半截 <content> 正文', '未闭合原样放回');
eq(unclosed.collector.text, '', '未闭合不写 text');
eq(unclosed.collector.partial, '', 'finish 后清 partial');
eq(unclosed.collector.unclosed, 1, '未闭合计数');
const abortCollector = newCotCollector();
const abortStream = createCotStream(abortCollector);
eq(abortStream.push('前缀' + COT_OPEN + '半截 <content>'), '前缀', '中止前正文已输出');
eq(abortCollector.partial, '半截 <content>', '中止时 partial 保留扣住的内容');
eq(abortCollector.text, '', '中止时未闭合不写 text');
eq(abortCollector.unclosed, 0, '未 finish 不记 unclosed');

/* 缓冲上限：超限按未闭合放回，剩余直通 */
const big = COT_OPEN + '字'.repeat(1048600) + COT_CLOSE + '尾部';
const bigRun = run(big);
eq(bigRun.collector.bufferLimited, true, '超限报告');
eq(bigRun.collector.unclosed, 1, '超限按未闭合');
eq(bigRun.out.endsWith('尾部'), true, '超限后剩余直通');
eq(bigRun.out.startsWith(COT_OPEN + '字'), true, '超限块原样放回');

/* 内容与正文隔离：块内未闭合标签只出现在 collector，不在正文 */
const inner = '<content>甲<options>乙<summary>丙';
const isolated = run(COT_OPEN + inner + COT_CLOSE + '<content>正文</content>');
eq(isolated.out, '<content>正文</content>', '正文只剩块外内容');
eq(isolated.collector.text, inner, '块内标签原样扣留');
eq([...isolated.out.matchAll(/<content>([\s\S]*?)<\/content>/g)].map(x => x[1]), ['正文'], '正文正则只命中真实正文');

/* 幂等 / 结束标记 */
const idem = newCotCollector();
const idemStream = createCotStream(idem);
eq(idemStream.push(COT_OPEN + '想</nyaruko_think>'), '', '第一次输出为空');
eq(idemStream.finish(), '', 'finish 后无尾巴');
eq(idemStream.finish(), '', '重复 finish 为空');
eq(idemStream.push('后面'), '后面', '结束后 push 直通');

/* CRLF */
eq(run('前\r\n' + COT_OPEN + '想</nyaruko_think>\r\n后').out, '前\r\n\r\n后', 'CRLF 不破坏');

/* 长文本性能与正确性 */
const long = '正文'.repeat(30000) + COT_OPEN + '想'.repeat(30000) + COT_CLOSE + '尾巴';
const start = performance.now();
const longRun = run(long);
assert(performance.now() - start < 1500, '长文本不能超时'); checks++;
eq(longRun.out, '正文'.repeat(30000) + '尾巴', '长文本正文正确');
eq(longRun.collector.text.length, 30000, '长文本扣留正确');

/* diverting：流式提示前端靠这个状态决定显示/隐藏 */
{
  const hint = newCotCollector();
  const hs = createCotStream(hint);
  eq(hint.diverting, false, '提示：初始不搬运');
  eq(hs.push('前' + COT_OPEN), '前', '提示：开标签前的正文照出');
  eq(hint.diverting, true, '提示：开标签后进入搬运');
  eq(hs.push('想'), '', '提示：块内不出正文');
  eq(hint.diverting, true, '提示：块内仍处于搬运');
  eq(hs.push(COT_CLOSE + '后'), '后', '提示：闭标签后正文恢复');
  eq(hint.diverting, false, '提示：闭标签后停止搬运');

  const hint2 = newCotCollector();
  const hs2 = createCotStream(hint2);
  hs2.push(COT_OPEN + '没闭合');
  eq(hint2.diverting, true, '提示：未闭合时仍显示');
  hs2.finish();
  eq(hint2.diverting, false, '提示：流结束一定收起');

  const hint3 = newCotCollector();
  const hs3 = createCotStream(hint3);
  hs3.push('```\n' + COT_OPEN + '\n```');
  eq(hint3.diverting, false, '提示：代码块里的标签不触发');
}

console.log('显式思维链切流：' + checks + ' 项通过');
