import assert from 'node:assert/strict';
import { createCotStream, newCotCollector, COT_OPEN, COT_CLOSE } from '../../src/scripts/_cot-stream.js';
import { createKamiResponseTransport } from '../../src/scripts/_response-transport.js';
import { createTagReferenceResponse } from '../../src/scripts/_tag-response.js';
import { kamiResponsePipeline } from '../../src/scripts/_response-pipeline.js';

let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }

const inner = '思考 <content> 引用 <options> 未闭合';
const source = '<out_body><introduction>' + COT_OPEN + inner + COT_CLOSE + '</introduction><content>正文</content></out_body>';
const cleaned = '<out_body><introduction></introduction><content>正文</content></out_body>';
const unclosedSource = '<out_body><introduction>' + COT_OPEN + inner + '</introduction><content>正文</content></out_body>';

function response(text, type = 'application/json', width = 7) {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return new Response(new ReadableStream({ pull(c) { if (at >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(at, at += width)); } }), { headers: { 'content-type': type, 'x-kept': 'yes' } });
}
function harness() {
  const collector = newCotCollector();
  const reports = [];
  const rewrite = createTagReferenceResponse(
    createKamiResponseTransport(),
    () => createCotStream(collector),
    (stats) => reports.push(stats)
  );
  return { collector, reports, rewrite };
}
function sse(events) {
  return events.map(x => 'data: ' + JSON.stringify(x) + '\r\n\r\n').join('') + 'data: [DONE]\r\n\r\n';
}
function packets(text) {
  return text.split(/\r?\n/).filter(x => x.startsWith('data: ')).map(x => x.slice(6));
}

/* 整包：四种方言的正文文本字段都换成“去掉 CoT”的版本，其他字段不动 */
const wholeCases = [
  ['openai', { choices: [{ index: 0, message: { content: source, tool_calls: [{ function: { arguments: '{"content":"<original>"}' } }], reasoning_content: '<native>' }, finish_reason: 'stop' }] },
    d => d.choices[0].message.content],
  ['google', { candidates: [{ index: 0, content: { parts: [{ thought: true, text: '<native>' }, { text: source }] }, finishReason: 'STOP' }] },
    d => d.candidates[0].content.parts.filter(p => !p.thought)[0].text],
  ['anthropic', { content: [{ type: 'thinking', thinking: '<native>' }, { type: 'text', text: source }] },
    d => d.content.filter(p => p.type === 'text')[0].text],
  ['token', { results: [{ text: source }] }, d => d.results[0].text]
];
for (const [name, value, pick] of wholeCases) {
  const h = harness();
  const result = await h.rewrite(response(JSON.stringify(value)));
  const data = await result.json();
  eq(pick(data), cleaned, name + ' 整包正文去掉 CoT');
  eq(h.collector.text, inner, name + ' 扣留文本');
  eq(h.collector.closed, 1, name + ' 闭合计数');
  eq(result.headers.get('x-kept'), 'yes', name + ' 保留响应头');
  eq(h.reports.length, 1, name + ' report 调用一次');
}
{
  const h = harness();
  const value = { choices: [{ index: 0, message: { content: source, tool_calls: [{ function: { arguments: '{"content":"<original>"}' } }], reasoning_content: '<native>', signature: 'keep' }, finish_reason: 'stop' }] };
  const data = await (await h.rewrite(response(JSON.stringify(value)))).json();
  eq(data.choices[0].message.tool_calls, value.choices[0].message.tool_calls, '工具调用参数不改');
  eq(data.choices[0].message.reasoning_content, '<native>', '原生推理字段不改');
  eq(data.choices[0].message.signature, 'keep', '签名不改');
}

/* 流式：四种方言，正文逐分片拼接后等于 cleaned */
function eventsFor(name, text, width) {
  const out = [];
  for (let i = 0; i < text.length; i += width) {
    const part = text.slice(i, i + width);
    if (name === 'openai') out.push({ choices: [{ index: 0, delta: { content: part } }] });
    else if (name === 'google') out.push({ candidates: [{ index: 0, content: { parts: [{ text: part }] } }] });
    else if (name === 'anthropic') out.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } });
    else out.push({ token: part });
  }
  return out;
}
function contentOf(name, payloads) {
  return payloads.map(p => {
    const d = JSON.parse(p);
    if (name === 'openai') return d.choices?.[0]?.delta?.content || '';
    if (name === 'google') return d.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '';
    if (name === 'anthropic') return d.delta?.text || '';
    return d.token || '';
  }).join('');
}
for (const name of ['openai', 'google', 'anthropic', 'token']) {
  for (const width of [1, 3, 7, 64]) {
    const h = harness();
    const events = eventsFor(name, source, width);
    const raw = await (await h.rewrite(response(sse(events), 'text/event-stream', 1))).text();
    const payloads = packets(raw);
    eq(payloads.pop(), '[DONE]', name + ' DONE 最后发送 width=' + width);
    eq(contentOf(name, payloads), cleaned, name + ' 流式正文去掉 CoT width=' + width);
    eq(h.collector.text, inner, name + ' 流式扣留文本 width=' + width);
    eq(h.collector.closed, 1, name + ' 流式闭合计数 width=' + width);
  }
}
{
  const h = harness();
  const events = eventsFor('openai', source, 5);
  events.push({ choices: [{ index: 0, delta: { tool_calls: [{ function: { arguments: '<content>保留参数</content>' } }], reasoning_content: '<native>', signature: 'keep' }, finish_reason: 'stop' }] });
  const raw = await (await h.rewrite(response(sse(events), 'text/event-stream', 1))).text();
  const last = JSON.parse(packets(raw).filter(x => x !== '[DONE]').pop());
  eq(last.choices[0].delta.tool_calls, events.at(-1).choices[0].delta.tool_calls, '流式工具调用参数不改');
  eq(last.choices[0].delta.reasoning_content, '<native>', '流式原生推理字段不改');
  eq(last.choices[0].delta.signature, 'keep', '流式签名不改');
}

/* 未闭合：正文原样保留，不写 reasoning */
{
  const h = harness();
  const events = eventsFor('openai', unclosedSource, 4);
  const raw = await (await h.rewrite(response(sse(events), 'text/event-stream', 1))).text();
  eq(contentOf('openai', packets(raw).filter(x => x !== '[DONE]')), unclosedSource, '未闭合流式正文原样保留');
  eq(h.collector.text, '', '未闭合不写 reasoning');
  eq(h.collector.unclosed, 1, '未闭合计数');
  const whole = harness();
  const data = await (await whole.rewrite(response(JSON.stringify({ choices: [{ message: { content: unclosedSource } }] })))).json();
  eq(data.choices[0].message.content, unclosedSource, '未闭合整包正文原样保留');
  eq(whole.collector.text, '', '未闭合整包不写 reasoning');
}

/* 代码块里的示例不搬 */
{
  const h = harness();
  const example = '前言\n```xml\n' + COT_OPEN + '示例</nyaruko_think>\n```\n' + COT_OPEN + '真</nyaruko_think>后';
  const data = await (await h.rewrite(response(JSON.stringify({ choices: [{ message: { content: example } }] })))).json();
  eq(data.choices[0].message.content, '前言\n```xml\n<nyaruko_think>示例</nyaruko_think>\n```\n后', '代码块示例留在正文');
  eq(h.collector.text, '真', '只扣真块');
}

/* 取消向上游传递 */
{
  let cancelled = false;
  const h = harness();
  const endless = new Response(new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"文本"}}]}\n\n')); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } });
  const reader = (await h.rewrite(endless)).body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise(r => setTimeout(r, 10));
  eq(cancelled, true, '取消向上游传递');
}

/* 错误响应不读取 */
{
  const h = harness();
  const failure = new Response('error', { status: 500 });
  eq(await h.rewrite(failure), failure, '错误响应不读取');
}

/* 管线顺序：order 15 在 20 之前处理响应，20 在 10 之后 */
{
  const original = async function (input, init) { return { input, init, text: 'model' }; };
  const host = { fetch: original, location: new URL('http://localhost:11451/') };
  const pipe = kamiResponsePipeline(host);
  const sequence = [];
  const stopLate = pipe.register('late', 20, async (next, ctx, args) => { const r = await next(args); sequence.push('late'); r.text += ':late'; return r; });
  const stopEarly = pipe.register('early', 10, async (next, ctx, args) => { const r = await next(args); sequence.push('early'); r.text += ':early'; return r; });
  const stopCot = pipe.register('cot', 15, async (next, ctx, args) => { const r = await next(args); sequence.push('cot'); r.text += ':cot'; return r; });
  eq((await host.fetch('/api/backends/chat-completions/generate', { body: 'unaltered' })).text, 'model:early:cot:late', '响应顺序 10 → 15 → 20');
  eq(sequence, ['early', 'cot', 'late'], '处理器执行顺序');
  stopCot(); stopEarly(); stopLate();
  eq(host.fetch, original, '注销后还原 fetch');
}

console.log('思维链响应管线：' + checks + ' 项通过');
