#!/usr/bin/env node
/**
 * 防护脚本回归：四项功能对请求体的实际改写
 * ------------------------------------------------------------
 * 为什么单独测：这四个功能都会改「要发出去的请求」。改错了不是面板点不动，
 * 而是模型收到一份别人看不懂的提示词 —— 症状是空回复或答非所问，离现场很远。
 * 所以这里直接喂请求体、看输出，不经过浏览器。
 *
 * 用法：node test/harness/guard-shape.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { kamiResponsePipeline } from '../../src/scripts/_response-pipeline.js';
import { createKamiResponseTransport } from '../../src/scripts/_response-transport.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'src', 'scripts', '20-防护.js');

let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function ok(cond, label) { assert.ok(cond, label); checks++; }

/* 载入脚本：只跑 IIFE，取出测试钩子。宿主用最小替身，不碰真实浏览器 */
function load() {
  const host = { location: new URL('http://localhost:11451/'), addEventListener() {}, removeEventListener() {} };
  const code = fs.readFileSync(SRC, 'utf8')
    /* 构建期占位符换成真正的模块源码（和构建同一个函数，避免测的和跑的不是一份） */
    .replace('/* @@KAMI_RESPONSE_TRANSPORT@@ */', () => createKamiResponseTransport.toString().replace(/^export function /, 'function '))
    .replace('/* @@KAMI_RESPONSE_PIPELINE@@ */', () => kamiResponsePipeline.toString().replace(/^export function /, 'function '));
  const sandbox = vm.createContext({
    window: { parent: host },
    console: { log() {}, warn() {}, error() {} },
    URL, Map, Set, Request, Response, Headers, ReadableStream, TransformStream, TextEncoder, TextDecoder,
    crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval,
  });
  vm.runInContext(code, sandbox);
  const hook = host.__kamiGuardTestHook;
  assert.ok(hook, '脚本应暴露测试钩子');
  return hook;
}

const hook = load();
const base = { messages: [{ role: 'system', content: '你是助手' }, { role: 'user', content: '开始吧' }] };
/* setState 是「合并」语义：上一个用例开的开关会留到下一个。
   所以每条都先整体归零再设，避免用例之间互相污染。 */
const BLANK = { tool: false, noise: false, noiseChars: 10000, noiseWhere: 'tail', obfuscate: false, obMode: 'head', ctx: false, ctxInfo: true };
function shape(over, body) {
  hook.setState(Object.assign({}, BLANK, over));
  return hook.shape(JSON.stringify(Object.assign({}, base, body || {})));
}

/* ① 全关：一个字节都不改 */
hook.setState({ tool: false, noise: false, obfuscate: false, ctx: false });
const off = hook.shape(JSON.stringify(base));
eq(JSON.parse(off.body).messages.length, 2, '全关时消息条数不变');
eq(off.report.noise, 0, '全关时不插噪声');
eq(off.report.ctx, 'off', '全关时不搬上下文');

/* ② 噪声：插的位置与长度 */
const noise = shape({ noise: true, noiseChars: 5000, noiseWhere: 'tail' });
const nm = JSON.parse(noise.body).messages;
eq(nm.length, 3, '尾部噪声：多出一条 system');
ok(/^[א-ת0-9·\-_ ]+$/.test(nm[1].content), '噪声只由希伯来字母、数字与分隔符组成');
eq(nm[1].content.replace(/ /g, '').length, 5000, '噪声字符数等于设定值');
eq(nm[0].content, '你是助手', '原有消息不动');
eq(nm[2].content, '开始吧', '原有消息不动（第二条）');

const head = shape({ noise: true, noiseChars: 3000, noiseWhere: 'head' });
eq(JSON.parse(head.body).messages[0].role, 'system', '头部噪声：第一条是 system');
ok(/^[א-ת0-9·\-_ ]+$/.test(JSON.parse(head.body).messages[0].content), '头部噪声内容合法');

const each = shape({ noise: true, noiseChars: 3000, noiseWhere: 'each-user' });
const em = JSON.parse(each.body).messages;
eq(em.length, 3, 'each-user：一条 user 前面插一条 system');

/* ③ 防路由混淆：敏感词被打断，但去掉注释后能还原 */
const obfSrc = '这是 CRITICAL INSTRUCTIONS 与 非AI助手 的测试';
const obf = shape({ obfuscate: true, obMode: 'deep' }, { messages: [{ role: 'system', content: obfSrc }, { role: 'user', content: 'x' }] });
const obfText = JSON.parse(obf.body).messages[0].content;
ok(obfText !== obfSrc, '混淆后文本变了');
ok(!obfText.includes('CRITICAL INSTRUCTIONS'), '完整敏感词不再出现');
ok(!obfText.includes('非AI助手'), '中文敏感词也不完整出现');
eq(obfText.replace(/<!--[0-9a-f]+-->/g, ''), obfSrc, '去掉插入的注释后能还原原文（模型读到的还是原意）');

/* ④ 上下文搬运：标记段落进工具描述，messages 里消失 */
const ctxMsgs = [
  { role: 'system', content: '<INFORMATION>角色设定内容</INFORMATION>' },
  { role: 'system', content: '<CHAT_HISTORY>历史对话内容</CHAT_HISTORY>' },
  { role: 'user', content: '本轮写作要求' },
];
const ctx = shape({ ctx: true, ctxInfo: true }, { messages: ctxMsgs });
ok(ctx.report.ctx.startsWith('moved:'), '搬运成功');
const cm = JSON.parse(ctx.body).messages;
eq(cm.length, 1, '两段资料从 messages 里消失，只剩写作要求');
eq(cm[0].content, '本轮写作要求', '留下的是标记之外的内容');
const ctxTool = JSON.parse(ctx.body).tools.at(-1);
ok(ctxTool.function.description.includes('角色设定内容'), '工具描述里带着资料');
ok(ctxTool.function.description.includes('历史对话内容'), '工具描述里带着历史');
eq(Object.keys(ctxTool.function.parameters.properties).length, 0, '这个工具没有参数（永远不会被真调用）');

/* ⑤ 搬运的降级：没有标记 / 有非文本内容时必须原样放行 */
const noMark = shape({ ctx: true }, { messages: [{ role: 'user', content: '没有标记' }] });
eq(noMark.report.ctx, 'skip:no-markers', '没有标记时跳过');
eq(JSON.parse(noMark.body).messages.length, 1, '跳过时消息原样');

const withImage = shape({ ctx: true }, {
  messages: [
    { role: 'system', content: '<CHAT_HISTORY>历史</CHAT_HISTORY>' },
    { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'x' } }] },
  ],
});
eq(withImage.report.ctx, 'skip:not-text', '有图片时不搬（避免丢附件）');

/* ⑥ 工具反截断：加工具、加控制消息、改 tool_choice */
const tool = shape({ tool: true });
const tb = JSON.parse(tool.body);
eq(tb.tools.length, 1, '注入一个工具');
ok(tb.tools[0].function.name.startsWith('relay_reply_'), '工具名带固定前缀');
ok(String(tb.tools[0].function.name).length > 'relay_reply_'.length, '工具名带随机尾巴');
eq(tb.tool_choice, 'auto', 'tool_choice 设为 auto');
ok(tb.messages.some(m => m.role === 'system' && m.content.includes('传输层要求')), '插入了控制消息');
eq(tb.messages.at(-1).content, '开始吧', '控制消息插在最后一条 user 之前（anchor）');

/* ⑦ 工具反截断的拒绝条件 */
for (const pinned of ['none', 'required', { type: 'function', function: { name: 'x' } }]) {
  const r = shape({ tool: true }, { tool_choice: pinned });
  eq(r.report.tool, 'skip:tool-choice', 'tool_choice=' + JSON.stringify(pinned) + ' 时跳过');
}

/* ⑧ 四项同开：顺序正确（上下文先搬走，否则标记会被混淆打断） */
const all = shape({ tool: true, noise: true, noiseChars: 2000, obfuscate: true, obMode: 'deep', ctx: true, ctxInfo: true }, { messages: ctxMsgs });
const ab = JSON.parse(all.body);
ok(all.report.ctx.startsWith('moved:'), '四项同开：上下文仍搬运成功');
eq(all.report.noise, 2000, '四项同开：噪声已插');
ok(all.report.obf >= 0, '四项同开：混淆已跑');
ok(ab.tools.some(t => t.function.name === 'kami_context_note'), '四个工具里含上下文工具');
ok(ab.tools.some(t => String(t.function.name).startsWith('relay_reply_')), '四个工具里含反截断工具');

/* ⑨ 别的脚本发的请求一律不碰 */
for (const flag of ['_kami_background_task', '_kami_native_probe', 'should_silence']) {
  hook.setState({ tool: true, noise: true });
  const r = hook.shape(JSON.stringify(Object.assign({}, base, { [flag]: true })));
  eq(r.skip, 'foreign', flag + ' 的请求原样放行');
}

/* ⑩ 状态写回：面板靠这三个数知道上一轮做了什么 */
hook.setState({ noise: true, noiseChars: 4000, noiseWhere: 'head', tool: false, obfuscate: false, ctx: false });
hook.shape(JSON.stringify(base));
eq(hook.getState().noiseChars, 4000, '状态已保存');

console.log('防护脚本回归：' + checks + ' 项通过');
