/* 只读验证用的 CDP 小工具（.audit/ 内，不改工作区其它文件）
   用法：node .audit/probe.mjs <表达式文件.js> [--port 9341] [--url 片段]
   表达式文件里写一段 JS，返回值按 JSON 打印。 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
let port = 9341, urlMatch = 'preview.html';
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--port') port = Number(args[++i]);
  else if (args[i] === '--url') urlMatch = args[++i];
}
const expr = fs.readFileSync(file, 'utf8');

const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
const pages = list.filter(t => t.type === 'page');
const page = pages.find(p => (p.url || '').includes(urlMatch)) || pages[0];
if (!page) { console.error('没有找到页面'); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

const r = await send('Runtime.evaluate', {
  expression: expr,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true,
});
if (r.exceptionDetails) {
  console.log(JSON.stringify({ ok: false, error: r.exceptionDetails.exception && (r.exceptionDetails.exception.description || r.exceptionDetails.exception.value) || r.exceptionDetails.text }, null, 2));
} else {
  const v = r.result.value;
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}
ws.close();
