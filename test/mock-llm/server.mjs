#!/usr/bin/env node
/**
 * 本地假模型接口（OpenAI 兼容）：node test/mock-llm/server.mjs [--port 8787]
 * ------------------------------------------------------------------
 * 给本机测试酒馆当「对话补全 → 自定义（OpenAI 兼容）」接口用，不花钱、结果可重复。
 *
 * 接口：
 *   GET  /v1/models                 模型列表（kami-mock）
 *   POST /v1/chat/completions       支持 stream（SSE）与非流式；可带原生思维链（reasoning_content）
 *
 * 回复怎么来（按优先级）：
 *   1. 测试脚本先 POST /__mock/next 排队的回复（先进先出），精确控制下一条输出
 *   2. 消息里的场景标记 [mock:<场景>]（从最后一条往前找，任意角色），见 SCENARIOS
 *   3. 默认场景 kami：思维链 + 正文 + 行动选项，模仿卡密预设要求的输出格式
 *
 * 控制接口（给自动化测试用）：
 *   POST /__mock/next      { content, reasoning?, chunk?, delayMs?, finish? } 或数组；排队下一条（多条）回复
 *   GET  /__mock/requests  最近收到的请求体（核对酒馆实际发给模型的提示词）
 *   POST /__mock/reset     清空队列与请求记录
 *   GET  /__mock/health    存活检查
 */
import http from 'node:http';

const PORT = (() => { const i = process.argv.indexOf('--port'); return i >= 0 ? Number(process.argv[i + 1]) : Number(process.env.MOCK_PORT || 8787); })();
const MODEL = 'kami-mock';
const MAX_LOG = 50;

const queue = [];
const requests = [];

const OPTIONS_JSON = JSON.stringify([
  { title: '推开门走进去', type: '行动', content: '深吸一口气，推开那扇吱呀作响的木门。' },
  { title: '先在门外听一听', type: '信息', content: '贴着门板屏住呼吸，分辨屋里的动静。' },
  { title: '转身离开', type: '推进', content: '这地方不对劲，还是先回镇上打听清楚。' }
], null, 2);

/** 场景：在用户消息里写 [mock:<名字>] 触发 */
const SCENARIOS = {
  /* 默认：卡密预设的完整输出格式 */
  kami: () => ({
    content: [
      '<nyaruko_think>',
      '用户想知道门后有什么。先确认场景：深夜、小镇边缘的废屋。',
      '- 保持悬疑氛围',
      '- 给出三个方向不同的行动选项',
      '</nyaruko_think>',
      '<content>',
      '夜风穿过破败的窗棂，发出低低的呜咽。你站在那扇木门前，门缝里漏出一线昏黄的光。',
      '',
      '屋里似乎有人在低声说话，又像只是风声。',
      '</content>',
      '<options>',
      OPTIONS_JSON,
      '</options>'
    ].join('\n')
  }),
  /* 原生思维链：思考走 reasoning_content，正文不带 nyaruko_think */
  native: () => ({
    reasoning: '这是走原生 reasoning_content 通道的思考内容。\n需要检查原生思维链块的装饰。',
    content: '<content>\n这一条的思考在原生思维链块里。\n</content>'
  }),
  /* 只有正文 */
  plain: () => ({ content: '<content>\n一段普通的正文，没有思维链也没有选项。\n</content>' }),
  /* 长文：测滚动、性能与流式 */
  long: () => ({ content: '<content>\n' + Array.from({ length: 40 }, (_, i) => '第 ' + (i + 1) + ' 段：' + '夜色很深，'.repeat(12)).join('\n\n') + '\n</content>' }),
  /* 挂载探针：直接输出各种 HTML 写法，看酒馆的清洗会留下什么 */
  'mount-probe': () => ({
    content: [
      '<content>探针正文</content>',
      '<div data-kami-mount="probe" data-kami-v="1" data-kami-payload="eyJhIjoxfQ==">兜底文字A</div>',
      '<div class="kami-mount" data-kami-mount="probe-b"><pre hidden data-kami-payload>{"b":2}</pre>兜底文字B</div>',
      '<template data-kami-mount="probe-c">{"c":3}</template>',
      '<kami-mount kind="probe-d">兜底文字D</kami-mount>',
      '<span data-kami-mount="probe-e" style="display:none">隐藏E</span>',
      '<details data-kami-mount="probe-f"><summary>折叠F</summary>内容F</details>',
      '<script>window.__kamiProbeScript = 1</script>'
    ].join('\n')
  })
};

function pickReply(body) {
  if (queue.length) { return queue.shift(); }
  /* 预设会在用户消息后面再注入别的消息（系统提示、附加指令……），所以从后往前在所有消息里找场景标记 */
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  let m = null;
  for (let i = msgs.length - 1; i >= 0 && !m; i--) {
    const c = msgs[i] && msgs[i].content;
    m = /\[mock:([a-z0-9-]+)\]/i.exec(typeof c === 'string' ? c : JSON.stringify(c || ''));
  }
  const name = m && SCENARIOS[m[1].toLowerCase()] ? m[1].toLowerCase() : 'kami';
  return Object.assign({ scenario: name }, SCENARIOS[name]());
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({ __raw: raw }); } });
  });
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(obj));
}

/** 按 Unicode 字符切片，避免把中文或 emoji 切坏 */
function chunks(text, size) {
  const chars = Array.from(text || '');
  const out = [];
  for (let i = 0; i < chars.length; i += size) { out.push(chars.slice(i, i + size).join('')); }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function completions(req, res) {
  const body = await readBody(req);
  requests.push({ at: new Date().toISOString(), body });
  if (requests.length > MAX_LOG) { requests.shift(); }
  const reply = pickReply(body);
  const id = 'chatcmpl-mock-' + Date.now();
  const created = Math.floor(Date.now() / 1000);
  const finish = reply.finish || 'stop';
  const content = reply.content || '';
  const reasoning = reply.reasoning || '';

  if (!body.stream) {
    const message = { role: 'assistant', content };
    if (reasoning) { message.reasoning_content = reasoning; }
    return send(res, 200, {
      id, object: 'chat.completion', created, model: MODEL,
      choices: [{ index: 0, message, finish_reason: finish }],
      usage: { prompt_tokens: 0, completion_tokens: Array.from(content).length, total_tokens: Array.from(content).length }
    });
  }

  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
  const size = reply.chunk || 6;
  const delay = typeof reply.delayMs === 'number' ? reply.delayMs : 15;
  const frame = (delta, fin) => 'data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: MODEL, choices: [{ index: 0, delta, finish_reason: fin || null }] }) + '\n\n';
  let closed = false;
  req.on('close', () => { closed = true; });
  res.write(frame({ role: 'assistant', content: '' }));
  for (const piece of chunks(reasoning, size)) { if (closed) { return; } res.write(frame({ reasoning_content: piece })); if (delay) { await sleep(delay); } }
  for (const piece of chunks(content, size)) { if (closed) { return; } res.write(frame({ content: piece })); if (delay) { await sleep(delay); } }
  if (closed) { return; }
  res.write(frame({}, finish));
  res.write('data: [DONE]\n\n');
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
      return res.end();
    }
    if (req.method === 'GET' && /\/models$/.test(url)) { return send(res, 200, { object: 'list', data: [{ id: MODEL, object: 'model', owned_by: 'kami' }] }); }
    if (req.method === 'POST' && /\/chat\/completions$/.test(url)) { return await completions(req, res); }
    if (url === '/__mock/health') { return send(res, 200, { ok: true, queued: queue.length, requests: requests.length }); }
    if (url === '/__mock/requests') { return send(res, 200, requests); }
    if (req.method === 'POST' && url === '/__mock/reset') { queue.length = 0; requests.length = 0; return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url === '/__mock/next') {
      const body = await readBody(req);
      const list = Array.isArray(body) ? body : [body];
      for (const r of list) { queue.push(r); }
      return send(res, 200, { ok: true, queued: queue.length });
    }
    send(res, 404, { error: 'not found: ' + req.method + ' ' + url });
  } catch (e) {
    send(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => { console.log('[假模型] 监听 http://127.0.0.1:' + PORT + '/v1 （模型名 ' + MODEL + '）'); });
