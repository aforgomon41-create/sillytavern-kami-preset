/* 临时测量器（2026-09-25）：用 CDP 直连本机 Chrome，跑 .audit/overlap-probe2.html
   （角标重叠探针）并把 #out 的读数取回来。不依赖任何 npm 包（Node 22 自带 WebSocket）。
   用法：node .audit/cdp-measure.mjs <url> [等待秒数] */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = process.argv[2];
const WAIT_S = Number(process.argv[3] || 150);
const CDP_PORT = 9223;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kami-cdp-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--disable-background-networking', 'about:blank'
], { stdio: 'ignore', detached: false });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jsonList() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const j = await r.json();
      const page = j.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { /* 还没起来 */ }
    await sleep(400);
  }
  throw new Error('Chrome CDP 没起来');
}

const target = await jsonList();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const send = (method, params) => new Promise((res, rej) => {
  const myId = ++id;
  pending.set(myId, m => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result));
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Page.enable', {});
await send('Runtime.enable', {});
await send('Page.navigate', { url: URL_ });

let out = '';
const t0 = Date.now();
while (Date.now() - t0 < WAIT_S * 1000) {
  await sleep(2500);
  try {
    const r = await send('Runtime.evaluate', { expression: "document.getElementById('out') ? document.getElementById('out').textContent : ''", returnByValue: true });
    out = r.result.value || '';
    if (out.includes('===END===')) break;
  } catch (e) { /* 页面还在导航 */ }
}
console.log(out || '（没读到输出）');
try { ws.close(); } catch (e) { }
try { chrome.kill(); } catch (e) { }
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
process.exit(0);
