#!/usr/bin/env node
/**
 * 📜 压缩 · 离线集成自测：node test/harness/summarize-flow.mjs
 * ------------------------------------------------------------
 * 与 test/harness/summarize-pure.mjs 的分工：
 *   · summarize-pure.mjs 测 src/scripts/_summarize-pure.js 的**纯函数**（解析器 / 对账器）；
 *   · 本文件是它的上一层 —— 把**产物里那份内联好的「📜 压缩」脚本**整段加载进一套
 *     假酒馆环境，跑真实流程（runOnce / refresh / addPin / repairOrphans / shutdown /
 *     生成事件自动触发），验证 v1.3 三个 bug 的修复路径在真流程里确实成立，
 *     而不是「纯函数对了、脚本接线接错了」。
 *
 * 加载源：**默认**取 dist/ 里最新的 kami-*.json 里那条「📜 压缩」脚本的 content
 *        （与 build/verify-summarize-pure.mjs 同规矩：产物里三方模块已经内联好）。
 *        也可指定产物：node test/harness/summarize-flow.mjs dist/xxx.json
 *        改完 src 还没 build 时，用 --src 先跑一遍工作区源码（照 update-flow.mjs 的先例，
 *        按 build/kami-doc.mjs 的同一条内联规则手动展开三个占位符）：
 *        node test/harness/summarize-flow.mjs --src
 *
 * 假环境提供：getChatMessages（同步）/ setChatMessages / getVariables / replaceVariables /
 *   generateRaw（可编程返回值）/ eventOn + tavern_events（可手动 emit）/
 *   SillyTavern.getContext 的 loadWorldInfo + saveWorldInfo + reloadWorldInfoEditor +
 *   getTokenCountAsync / getChatLorebook + getOrCreateChatLorebook / toastr /
 *   window + document（够 buildPanel/renderContent 跑起来的 DOM 替身）/ 可控定时器。
 *
 * 退出码：全绿 0 / 有失败 1 / 找不到产物（或产物里没有压缩脚本、占位符没展开）2。
 * 不联网、不起服务器、不开浏览器、不写 dist。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ───────────────────────── ① 找产物并取出脚本 ───────────────────────── */

function newestProduct() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) { return null; }
  const files = fs.readdirSync(dir)
    .filter(f => /^kami-.*\.json$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

const ARGV = process.argv.slice(2);
const FROM_SRC = ARGV.indexOf('--src') >= 0;
const EXPLICIT = ARGV.find(a => a.indexOf('--') !== 0);

/* --src：直接测工作区源码（照 update-flow.mjs 的先例手动内联三个占位符）。
   规则与 build/kami-doc.mjs 一致：只去掉**行首**的 export 前缀 / 兜底皮肤整段进字符串。
   占位符找不到就报错退出（构建规则改了要回来同步，不许静默跳过）。 */
function codeFromSource() {
  const NL = '\n';
  function stripExports(raw, label) {
    let stripped = 0;
    const lines = raw.split(NL).map(l => {
      if (l.slice(0, 7) === 'export ') { stripped++; return l.slice(7); }
      return l;
    });
    if (!stripped) { throw new Error(label + ' 里没有找到 export 声明（内联规则要与 build/kami-doc.mjs 同步）'); }
    if (lines.filter(l => l.slice(0, 7) === 'export ').length) { throw new Error(label + ' 里还有行首 export 没被去掉'); }
    return lines.join(NL);
  }
  const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
  let code = read('src', 'scripts', '60-压缩.js');
  const marks = [
    ['/* @@KAMI_SUMMARIZE_PURE@@ */', stripExports(read('src', 'scripts', '_summarize-pure.js'), '_summarize-pure.js')],
    ['/* @@KAMI_PANEL_GESTURES@@ */', stripExports(read('src', 'scripts', '_panel-gestures.js'), '_panel-gestures.js')],
    ['/* @@KAMI_BASE_CSS_JS@@ */', 'var KAMI_BASE_CSS = ' + JSON.stringify(read('src', 'skin', 'base.css')) + ';'],
  ];
  for (const [mark, text] of marks) {
    if (code.indexOf(mark) < 0) { throw new Error('src/scripts/60-压缩.js 里没有占位符 ' + mark + '（构建内联规则变了？）'); }
    code = code.replace(mark, () => text);
  }
  return code;
}

let artifact = null, CODE = '', ZIP = null;
if (FROM_SRC) {
  try {
    CODE = codeFromSource();
  } catch (e) {
    console.error('从 src 内联加载失败：' + e.message);
    process.exit(2);
  }
  ZIP = { name: '（工作区源码 src/scripts/60-压缩.js + 三个内联模块）' };
} else {
  artifact = EXPLICIT ? path.resolve(EXPLICIT) : newestProduct();
  if (!artifact) {
    console.error('找不到产物：dist/ 里没有 kami-*.json。先跑 `node build/build.mjs` 生成产物，再跑本测试。');
    console.error('（也可以先用 `node test/harness/summarize-flow.mjs --src` 直接测工作区源码）');
    process.exit(2);
  }
  if (!fs.existsSync(artifact)) {
    console.error('产物不存在：' + artifact);
    process.exit(2);
  }
  let PRESET = null;
  try {
    PRESET = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  } catch (e) {
    console.error('产物不是合法 JSON：' + artifact + ' —— ' + e.message);
    process.exit(2);
  }
  const SCRIPTS = (PRESET.extensions && PRESET.extensions.tavern_helper && PRESET.extensions.tavern_helper.scripts) || [];
  ZIP = SCRIPTS.find(s => String(s.name || '').indexOf('压缩') >= 0);
  if (!ZIP || !ZIP.content) {
    console.error('产物里没有「压缩」脚本：' + path.basename(artifact));
    console.error('现有脚本：' + SCRIPTS.map(s => s.name).join(' / '));
    process.exit(2);
  }
  CODE = String(ZIP.content);
  const LEFTOVER = CODE.match(/@@[A-Z_]+@@/g);
  if (LEFTOVER) {
    console.error('产物里还有没展开的占位符：' + LEFTOVER.join(' , ') + '（构建内联漏了？）');
    process.exit(2);
  }
}
const CODE_LINES = CODE.split('\n').length;
const VERSION_IN_CODE = (CODE.match(/var VERSION = '([^']+)'/) || [, '?'])[1];

const SRC_MAIN = path.join(ROOT, 'src', 'scripts', '60-压缩.js');
const SRC_PURE = path.join(ROOT, 'src', 'scripts', '_summarize-pure.js');
const srcMtime = Math.max(
  fs.existsSync(SRC_MAIN) ? fs.statSync(SRC_MAIN).mtimeMs : 0,
  fs.existsSync(SRC_PURE) ? fs.statSync(SRC_PURE).mtimeMs : 0,
);
const artMtime = artifact ? fs.statSync(artifact).mtimeMs : 0;
const STALE = !FROM_SRC && srcMtime > artMtime + 1000;

console.log('=== 📜 压缩 · 离线集成自测 ===');
console.log('加载源：' + (FROM_SRC ? '工作区源码（--src）' : path.relative(ROOT, artifact)));
console.log('脚本：' + ZIP.name + '（v' + VERSION_IN_CODE + '，' + CODE.length + ' 字符 / ' + CODE_LINES + ' 行）');
if (STALE) {
  console.log('⚠️ 产物比源码旧：src 改于 ' + new Date(srcMtime).toLocaleString() + '，产物构建于 ' + new Date(artMtime).toLocaleString() + '。');
  console.log('   本测试跑的是**产物里那一版**。要测最新源码：先跑 `node build/build.mjs`，或直接加 --src。');
}

/* ───────────────────────── ② 断言与计数 ───────────────────────── */

let total = 0, bad = 0;
const failLogs = [];
let CUR = null;   // 当前用例的假环境（失败时附上脚本日志，便于定位）

function ok(cond, msg, extra) {
  total++;
  if (cond) { console.log('PASS  ' + msg); return true; }
  bad++;
  console.log('FAIL  ' + msg + (extra === undefined ? '' : '  >> ' + extra));
  if (CUR && CUR.logs && CUR.logs.length) { failLogs.push([msg, CUR.logs.slice(-14)]); }
  return false;
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  return ok(a === e, msg, '实际 ' + a + ' / 期望 ' + e);
}
const tick = () => new Promise(r => setImmediate(r));
async function settle(n = 10) { for (let i = 0; i < n; i++) { await tick(); } }

const PREFIX = '📜 压缩块 #';
const LEDGER = '📜 压缩状态（勿动）';
const SUMMARY_ID = '3fd5251a-b51b-4fc2-a4a8-fbb955faa527';
const PROVIDER_ERR = '当前分组上游负载已饱和，请稍后重试';   // 中转站把报错塞进 content 的典型形状

function parseComment(comment) {
  const m = /^📜 压缩块 #(\d+)｜楼层 (\d+)-(\d+)$/.exec(String(comment || ''));
  return m ? { index: Number(m[1]), from: Number(m[2]), to: Number(m[3]) } : null;
}
function goodJson(n, extra) {
  return JSON.stringify(Object.assign({
    timeline: '第' + n + '次摘要的时间线',
    plot: '第' + n + '次摘要的正文：' + '主角在酒馆里把旧案的线索一条条摆开，气氛越来越紧。'.repeat(3),
    changes: ['拿到旧案卷宗', '老板态度转冷']
  }, extra || {}));
}
/* 请求体里那段「剧情材料」（固定 user 消息） */
function materialOf(req) {
  const list = (req && req.ordered_prompts) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (String(list[i] && list[i].content || '').indexOf('【本块楼层：') >= 0) { return String(list[i].content); }
  }
  return '';
}

/* ───────────────────────── ③ 假 DOM（够 buildPanel/renderContent 跑起来） ───────────────────────── */

function selTest(sel) {
  const s = String(sel === undefined || sel === null ? '' : sel).trim();
  let m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s);
  if (m) {
    const attr = m[1], want = m[2];
    return (e) => {
      const v = e.getAttribute ? e.getAttribute(attr) : null;
      return v !== null && v !== undefined && (want === undefined || String(v) === want);
    };
  }
  m = /^#([\w-]+)$/.exec(s);
  if (m) { return (e) => e.id === m[1]; }
  m = /^\.([\w-]+)$/.exec(s);
  if (m) { return (e) => String(e.className || '').split(/\s+/).indexOf(m[1]) >= 0; }
  return (e) => e.tagName === s.toUpperCase();
}
function findNodes(root, test) {
  const out = [];
  (function walk(n) {
    if (!n || !n.children) { return; }
    for (let i = 0; i < n.children.length; i++) {
      const c = n.children[i];
      if (test(c)) { out.push(c); }
      walk(c);
    }
  })(root);
  return out;
}
function textOf(el) {
  if (!el) { return ''; }
  let s = el._text || '';
  const kids = el.children || [];
  for (let i = 0; i < kids.length; i++) { s += textOf(kids[i]); }
  return s;
}
function makeEl(doc, tag) {
  const el = {
    ownerDocument: doc, tagName: String(tag || 'div').toUpperCase(),
    children: [], _attrs: {}, _text: '', parentNode: null,
    className: '', id: '', value: '', type: '', title: '', placeholder: '',
    selected: false, checked: false, disabled: false, role: '', tabIndex: 0,
    isConnected: true, offsetWidth: 100, offsetHeight: 20, scrollTop: 0, scrollHeight: 100,
    clientWidth: 400, clientHeight: 500,
    style: {
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; },
      getPropertyValue(k) { return this[k] === undefined ? '' : this[k]; },
    },
    appendChild(c) { if (c) { c.parentNode = el; el.children.push(c); } return c; },
    insertBefore(c) { return el.appendChild(c); },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) { el.children.splice(i, 1); } return c; },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null; },
    removeAttribute(k) { delete el._attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k); },
    querySelector(sel) { const r = findNodes(el, selTest(sel)); return r.length ? r[0] : null; },
    querySelectorAll(sel) { return findNodes(el, selTest(sel)); },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    setPointerCapture() { }, releasePointerCapture() { },
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 560, right: 420, bottom: 560 }; },
    closest() { return null; }, focus() { }, blur() { }, click() { },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return el._text + el.children.map(textOf).join(''); },
    set(v) { el.children.length = 0; el._text = String(v === undefined || v === null ? '' : v); },
    enumerable: true,
  });
  return el;
}
function makeDoc(full) {
  if (!full) {
    return {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => makeEl(null, 'div'), createEvent: () => ({ initEvent() { } }),
      addEventListener() { }, removeEventListener() { }, documentElement: {}, body: {}, head: {},
    };
  }
  const doc = { defaultView: null, _send: { value: '', tagName: 'TEXTAREA' } };
  doc.body = makeEl(doc, 'body');
  doc.head = makeEl(doc, 'head');
  doc.documentElement = makeEl(doc, 'html');
  doc.documentElement.clientWidth = 1280;
  doc.documentElement.clientHeight = 900;
  doc.documentElement.appendChild(doc.body);
  doc.documentElement.appendChild(doc.head);
  doc.createElement = (t) => makeEl(doc, t);
  doc.createEvent = () => ({ initEvent() { } });
  doc.getElementById = (id) => {
    if (id === 'send_textarea') { return doc._send; }   // looksLikeTavern 的判据
    const hit = findNodes(doc.documentElement, (e) => e.id === id);
    return hit.length ? hit[0] : null;
  };
  doc.querySelector = (sel) => { const r = findNodes(doc.documentElement, selTest(sel)); return r.length ? r[0] : null; };
  doc.querySelectorAll = (sel) => findNodes(doc.documentElement, selTest(sel));
  doc.addEventListener = () => { };
  doc.removeEventListener = () => { };
  return doc;
}

/* ───────────────────────── ④ 假酒馆环境 ───────────────────────── */

function makeEnv(opts) {
  opts = opts || {};
  const logs = [], toasts = [], listeners = {}, timers = [], intervals = [];
  const calls = {
    gen: [], hide: [], saveWorld: [], loadWorld: [], getMessages: [], setMessages: [],
    orCreate: [], reloadEditor: 0,
  };
  const scriptVars = JSON.parse(JSON.stringify(opts.vars || {}));

  /* 可控定时器（注入成脚本作用域里的 setTimeout/setInterval，脚本里的裸调用走这些） */
  let timerId = 0;
  const fakeSetTimeout = (fn, ms) => { const t = { id: ++timerId, fn, ms: Number(ms) || 0 }; timers.push(t); return t.id; };
  const fakeClearTimeout = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) { timers.splice(i, 1); } };
  const fakeSetInterval = (fn, ms) => { const t = { id: ++timerId, fn, ms: Number(ms) || 0 }; intervals.push(t); return t.id; };
  const fakeClearInterval = (id) => { const i = intervals.findIndex(t => t.id === id); if (i >= 0) { intervals.splice(i, 1); } };
  async function pump(ms) {
    const due = timers.filter(t => t.ms <= ms).sort((a, b) => a.ms - b.ms);
    for (const t of due) {
      const i = timers.indexOf(t);
      if (i < 0) { continue; }
      timers.splice(i, 1);
      t.fn();
      await settle();
    }
  }

  /* 假聊天：楼层对象字段与酒馆助手 getChatMessages 一致 */
  const chat = [];
  const nFloors = opts.floors === undefined ? 20 : opts.floors;
  const rep = opts.floorRepeat === undefined ? 12 : opts.floorRepeat;
  for (let i = 0; i < nFloors; i++) {
    chat.push({
      message_id: i, name: i % 2 ? '玩家' : '角色甲', role: i % 2 ? 'user' : 'assistant',
      is_hidden: false, message: '第 ' + i + ' 楼：' + '剧情内容占位。'.repeat(rep), is_user: i % 2 === 1,
    });
  }

  /* 假世界书（内存里的 {entries:{uid: entry}}） */
  let boundLb = opts.lorebook === undefined ? '测试聊天世界书' : opts.lorebook;
  let wb = opts.worldbook ? JSON.parse(JSON.stringify(opts.worldbook)) : { entries: {} };

  const ctx = {
    chat: chat,
    chatCompletionSettings: {
      prompts: [{ identifier: SUMMARY_ID, name: '🧱 摘要(小总结)', content: '摘要条目正文' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: SUMMARY_ID, enabled: true }] }],
      temperature: 1,
    },
    /* 酒馆的「连接配置」名单（60-压缩 借用它做「跟随指定连接」） */
    extensionSettings: {
      connectionManager: { profiles: JSON.parse(JSON.stringify(opts.profiles || [])) },
    },
    loadWorldInfo: async (name) => { calls.loadWorld.push(name); return JSON.parse(JSON.stringify(wb)); },
    saveWorldInfo: async (name, data) => { calls.saveWorld.push(name); wb = JSON.parse(JSON.stringify(data)); return true; },
    reloadWorldInfoEditor: () => { calls.reloadEditor++; },
    getTokenCountAsync: async (t) => Math.ceil(String(t === undefined || t === null ? '' : t).length / 2),
  };

  const doc = makeDoc(true);
  const nativeFetch = () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' });
  const fakeConsole = {
    log: (...a) => logs.push(a.map(String).join(' ')),
    info: (...a) => logs.push(a.map(String).join(' ')),
    warn: (...a) => logs.push('WARN ' + a.map(String).join(' ')),
    error: (...a) => logs.push('ERROR ' + a.map(String).join(' ')),
  };
  const toastr = {
    options: {},
    success: (m, t) => toasts.push(['success', m, t]),
    info: (m, t) => toasts.push(['info', m, t]),
    warning: (m, t) => toasts.push(['warning', m, t]),
    error: (m, t) => toasts.push(['error', m, t]),
  };
  const timerApi = { setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, setInterval: fakeSetInterval, clearInterval: fakeClearInterval };
  const hostWin = Object.assign({
    document: doc, console: fakeConsole, toastr: toastr, fetch: nativeFetch,
    SillyTavern: { getContext: () => ctx },
    addEventListener() { }, removeEventListener() { }, dispatchEvent: () => true,
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ display: 'block', position: 'static', visibility: 'visible' }),
    scrollTo() { }, location: { href: 'http://127.0.0.1/' },
  }, timerApi);
  hostWin.parent = hostWin; hostWin.top = hostWin; hostWin.self = hostWin; hostWin.window = hostWin;
  doc.defaultView = hostWin;

  /* hostParent=true：脚本跑在 iframe（window），HOST = 父窗口 —— 用来分别断言
     两个全局都被回收（真机就是这种形态：酒馆助手把脚本塞进 iframe）。 */
  let W = hostWin;
  if (opts.hostParent) {
    W = Object.assign({
      document: makeDoc(false), console: fakeConsole,
      addEventListener() { }, removeEventListener() { }, dispatchEvent: () => true,
    }, timerApi);
    W.parent = hostWin; W.top = hostWin; W.self = W; W.window = W;
  }

  /* 可编程的 generateRaw */
  let genHandler = opts.generate || null;
  let genSeq = 0;
  const injected = {
    getVariables: () => JSON.parse(JSON.stringify(scriptVars)),
    replaceVariables: (all) => {
      Object.keys(scriptVars).forEach(k => delete scriptVars[k]);
      Object.assign(scriptVars, all || {});
    },
    getChatMessages: (range) => {
      calls.getMessages.push(range);
      const s = String(range === undefined || range === null ? '' : range).trim();
      let from, to;
      const dash = s.indexOf('-');
      if (dash > 0) { from = Number(s.slice(0, dash)); to = Number(s.slice(dash + 1)); }
      else { from = Number(s); to = from; }
      if (!isFinite(from) || !isFinite(to)) { return []; }
      const out = [];
      for (let i = from; i <= to; i++) {
        const m = chat[i];
        if (!m) { continue; }
        out.push({
          message_id: m.message_id, name: m.name, role: m.role,
          is_hidden: m.is_hidden, message: m.message, is_user: m.is_user,
        });
      }
      return out;
    },
    setChatMessages: async (payload, o) => {
      calls.setMessages.push({ payload: JSON.parse(JSON.stringify(payload)), options: o });
      const list = Array.isArray(payload) ? payload : [payload];
      for (const it of list) {
        const m = chat[it && it.message_id];
        if (m) { m.is_hidden = !!it.is_hidden; }
      }
      return true;
    },
    generateRaw: async (req) => {
      calls.gen.push(req);
      genSeq++;
      if (genHandler) { return await genHandler(req, genSeq); }
      return goodJson(genSeq);
    },
    eventOn: (ev, fn) => {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return { stop() { const a = listeners[ev] || []; const i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); } } };
    },
    tavern_events: {
      GENERATION_STARTED: 'generation_started', CHAT_CHANGED: 'chat_changed',
      MESSAGE_DELETED: 'message_deleted', WORLDINFO_UPDATED: 'worldinfo_updated',
    },
    getChatLorebook: () => boundLb,
    getOrCreateChatLorebook: async () => {
      calls.orCreate.push(1);
      if (!boundLb) { boundLb = '新建的聊天世界书'; }
      return boundLb;
    },
  };

  const names = Object.keys(injected);
  const runner = new Function(
    ...names,
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'window', 'document', 'console', 'fetch',
    CODE,
  );
  runner(
    ...names.map(n => injected[n]),
    fakeSetTimeout, fakeClearTimeout, fakeSetInterval, fakeClearInterval,
    W, doc, fakeConsole, nativeFetch,
  );

  const env = {
    W, HOST: hostWin, doc, chat, toasts, logs, calls, scriptVars, timers, intervals, nativeFetch,
    getChatMessages: injected.getChatMessages, ctx,
    lbName: () => boundLb,
    wb: () => wb,
    /* 两个全局都留着引用，注销后照样能查 */
    api: () => hostWin.KamiSummarize || W.KamiSummarize,
    pamApi: () => W.KamiSummarize,
    entries: () => Object.keys(wb.entries).map(k => ({ key: k, e: wb.entries[k] })),
    findEntry: (comment) => {
      for (const k of Object.keys(wb.entries)) {
        const e = wb.entries[k];
        if (e && e.comment === comment) { return e; }
      }
      return null;
    },
    dropEntry: (comment) => {
      for (const k of Object.keys(wb.entries)) {
        const e = wb.entries[k];
        if (e && e.comment === comment) { delete wb.entries[k]; return e; }
      }
      return null;
    },
    setContent: (comment, content) => {
      const e = env.findEntry(comment);
      if (!e) { return false; }
      e.content = content;
      return true;
    },
    setGen: (fn) => { genHandler = fn; },
    pump, settle,
    emit: async (ev, arg) => {
      const list = (listeners[ev] || []).slice();
      for (const fn of list) { await fn(arg); }
    },
    listeners: (ev) => (listeners[ev] || []).length,
  };
  env.blockEntries = () => env.entries().map(x => x.e).filter(e => e && String(e.comment || '').indexOf(PREFIX) === 0);
  env.blockRanges = () => env.blockEntries()
    .map(e => parseComment(e.comment))
    .filter(Boolean)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map(r => r.from + '-' + r.to);
  env.blockByRange = (from, to) => env.blockEntries().find(e => {
    const p = parseComment(e.comment);
    return p && p.from === from && p.to === to;
  }) || null;
  env.ledgerEntry = () => env.findEntry(LEDGER);
  env.rawLedger = () => {
    const e = env.ledgerEntry();
    if (!e) { return null; }
    try { return JSON.parse(e.content); } catch (err) { return null; }
  };
  /* 读字段用这个：账本不存在/被改坏时给空壳，避免访问 null 崩掉整轮测试 */
  env.ledgerOf = () => env.rawLedger() || {};
  env.hidden = () => chat.filter(m => m.is_hidden).map(m => m.message_id);
  env.text = (sel) => findNodes(doc.documentElement, selTest(sel)).map(textOf);
  env.nodes = (sel) => findNodes(doc.documentElement, selTest(sel));
  return env;
}

const VARS = (cfg) => ({ 'kami-summarize': { cfg: cfg } });

/* ───────────────────────── 用例 0：环境与启动 ───────────────────────── */

console.log('\n--- 用例 0：启动与环境自检 ---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  ok(!!api, '启动后暴露了全局 API（KamiSummarize）');
  ok(!!api && typeof api.runOnce === 'function' && typeof api.refresh === 'function' &&
    typeof api.addPin === 'function' && typeof api.repairOrphans === 'function' &&
    typeof api.shutdown === 'function' && typeof api.inspect === 'function', '控制台四件套齐全（runOnce/refresh/addPin/repairOrphans/shutdown/inspect）');
  ok(env.api() === env.pamApi() || env.W === env.HOST, '全局 API 挂在当前窗口上（本环境 window === HOST）');
  const probe = env.getChatMessages('0-1');
  ok(Array.isArray(probe) && probe.length === 2 && !(probe instanceof Promise),
    '假 getChatMessages 是同步函数、直接返回楼层数组（脚本全程同步调它）');
  const st0 = api.status();
  ok(typeof st0.version === 'string' && st0.version.length > 0, 'status().version 有值（' + st0.version + '）');
  ok(st0.keep === 5 && st0.chunk === 10, '脚本变量里的 keep=5 / chunk=10 被读进来', 'keep=' + st0.keep + ' chunk=' + st0.chunk);
  ok(st0.covered === -1 && st0.blocks === 0, '空世界书：前沿 -1、0 个块');
  ok(env.HOST.__hubDefs && env.HOST.__hubDefs.some(d => d && d.name === '📜 压缩'), '向按钮中转站登记了「📜 压缩」按钮');
  ok(env.lbName() === '测试聊天世界书', '聊天已绑世界书（getChatLorebook）');
  ok(env.logs.some(l => l.indexOf('启动 v') > 0), '脚本日志里有启动记录');
  api.shutdown();
}

/* ───────────────────────── 用例 1：正常一轮 ───────────────────────── */

console.log('\n--- 用例 1：正常一轮（20 楼 / 保留 5 / 每块 10）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();

  /* 块条目 */
  eq(env.blockRanges(), ['0-9', '10-14'], '生成了 2 个块条目，范围 0-9 / 10-14');
  const b1 = env.blockByRange(0, 9);
  ok(!!b1 && b1.comment === PREFIX + '1｜楼层 0-9', '块条目名字是「📜 压缩块 #1｜楼层 0-9」', b1 && b1.comment);
  ok(!!b1 && b1.content.indexOf('【剧情提要｜楼层 0-9】') === 0, '块条目正文带格式头', b1 && b1.content.slice(0, 40));
  ok(!!b1 && b1.content.indexOf('本块剧情：') > 0 && b1.content.indexOf('关键变化：') > 0, '块正文是「时间线 / 本块剧情 / 关键变化」的人话');
  ok(!!b1 && b1.content.indexOf('{') < 0 && b1.content.indexOf('}') < 0, '块正文里没有花括号（不塞 JSON）');
  ok(!!b1 && b1.constant === true && b1.disable === false && b1.position === 4 && b1.ignoreBudget === true,
    '块条目字段：常驻 + 启用 + @D⚙ 位置 + 不吃预算', b1 && JSON.stringify({ c: b1.constant, d: b1.disable, p: b1.position, ib: b1.ignoreBudget }));
  ok(!!b1 && b1.depth === 10, '块 #1 注入深度 = 块尾之后的未隐藏楼层数（10）', b1 && String(b1.depth));
  const b2 = env.blockByRange(10, 14);
  ok(!!b2 && b2.depth === 5, '块 #2 注入深度 = 5', b2 && String(b2.depth));
  ok(!!b1 && b1.order === 1000000 && !!b2 && b2.order === 999990, '块条目 order 用 1000000-起始楼号（先来的排前面）',
    b1 && b2 && (b1.order + '/' + b2.order));

  /* 账本条目 */
  const ledger = env.rawLedger();
  ok(!!ledger, '世界书里出现了账本条目「' + LEDGER + '」');
  ok(!!ledger && ledger.v === 3, '账本是 v3 结构', ledger && String(ledger.v));
  ok(!!ledger && ledger.covered === 14, '账本前沿推进到 14 楼', ledger && String(ledger.covered));
  eq(ledger && ledger.blocks.map(x => x.from + '-' + x.to), ['0-9', '10-14'], '账本里记着两个块的范围');
  eq(ledger && ledger.pending, [], '账本里没有待重做段');
  const ledgerEntry = env.ledgerEntry();
  ok(!!ledgerEntry && ledgerEntry.disable === true, '账本条目是关闭状态（永不进提示词）');
  ok(!!ledgerEntry && ledgerEntry.content.indexOf('本块剧情') < 0 && ledgerEntry.content.indexOf('时间线：') < 0,
    '账本里不存块正文副本（正文的唯一真相是块条目）');
  eq(ledger && ledger.hiddenByUs, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    '账本记下「这 15 楼是我们隐藏的」（缺了它，块条目被删时脚本认不出这些楼）');
  ok(env.calls.reloadEditor > 0, '写盘后重新加载了世界书编辑器（酒馆打开着的面板跟着刷新）');

  /* 楼层隐藏 */
  eq(env.hidden(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], '被总结的 0-14 楼全部 is_hidden=true（保留区 15-19 不动）');
  ok(env.calls.setMessages.length === 1, '隐藏走了一次 setChatMessages 批量调用', String(env.calls.setMessages.length));
  ok(env.calls.setMessages[0].payload.every(x => x.is_hidden === true), '批量负载里 is_hidden 全是 true');

  /* 摘要请求 */
  ok(env.calls.gen.length === 2, '两个块各发一次摘要请求', String(env.calls.gen.length));
  const reqOk = env.calls.gen.every(r =>
    r && r.json_schema && r.json_schema.name === 'kami_block_summary' && r.json_schema.strict === true &&
    r.tool_choice === 'none' && Array.isArray(r.tools) && r.tools.length === 1 &&
    r.tools[0].function && r.tools[0].function.name === 'kami_noop');
  ok(reqOk, '每个摘要请求都带 json_schema + tool_choice:none + 占位工具 kami_noop');
  ok(env.calls.gen.every(r => r.should_silence === true), '摘要请求都带 should_silence');
  const r0 = env.calls.gen[0];
  ok(!!r0 && r0.json_schema.value && Array.isArray(r0.json_schema.value.required) &&
    r0.json_schema.value.required.join(',') === 'timeline,plot,changes' && r0.json_schema.value.additionalProperties === false,
    'json_schema 是 strict 形状（三字段必填 + additionalProperties:false）');
  ok(!!r0 && r0.custom_api === undefined, '跟随酒馆模式不带 custom_api');
  const last = r0 && r0.ordered_prompts[r0.ordered_prompts.length - 1];
  ok(!!last && last.role === 'system' && String(last.content).indexOf('<output_format>') === 0,
    '输出格式契约永远压在最后一条（system）');
  ok(!!r0 && r0.ordered_prompts[r0.ordered_prompts.length - 2].role === 'user', '材料固定是 user 消息');
  ok(materialOf(r0).indexOf('【本块楼层：0 到 9】') > 0, '第 1 块的请求材料是 0-9 楼');
  ok(materialOf(env.calls.gen[1]).indexOf('【本块楼层：10 到 14】') > 0, '第 2 块的请求材料是 10-14 楼');
  ok(materialOf(env.calls.gen[1]).indexOf('—— 块（楼层 0-9）——') > 0, '第 2 块的请求带上了第 1 块作为历史提要');
  ok(materialOf(r0).indexOf('（无，这是第一块）') > 0, '第 1 块的历史提要写「无，这是第一块」');
  ok(materialOf(r0).indexOf('楼层 0（角色·角色甲）') > 0 && materialOf(r0).indexOf('楼层 1（用户·玩家）') > 0,
    '材料里逐楼带角色/用户归属');

  /* status / inspect */
  const st = api.status();
  ok(st.blocks === 2 && st.covered === 14 && st.lastError === null, 'status：2 块 / 前沿 14 / 无错误',
    JSON.stringify({ b: st.blocks, c: st.covered, e: st.lastError }));
  ok(st.schemaMode === 'on', '结构化输出走通，schemaMode 保持 on');
  ok(st.pending.length === 0 && st.orphan.length === 0 && st.suspect === 0, '没有待重做 / 孤儿 / 疑似报错');
  ok(st.hiddenByUs === 15, 'status 记下隐藏了 15 楼');
  const insp = api.inspect();
  ok(insp.blockTexts.length === 2 && insp.blockTexts[0].indexOf('第1次摘要的时间线') > 0, 'inspect().blockTexts 是块条目正文');
  ok(insp.state.blocks.every(b => b.suspect === false), '块正文都没被误判成「接口报错内容」');
  ok(env.toasts.some(t => t[0] === 'success'), '成功后弹了成功提示');
  ok(!env.toasts.some(t => t[0] === 'error'), '没有错误提示');

  /* 面板（DOM 替身） */
  api.open();
  await settle(14);
  const panel = env.nodes('#kami-compress-panel');
  ok(panel.length === 1, '面板节点建起来了');
  ok(env.nodes('#kami-compress-css').length === 1, '兜底皮肤 + 布局样式注入了一份');
  const statusLine = env.text('[data-kami-role="status"]')[0] || '';
  ok(statusLine.indexOf('块2→14楼') > 0, '面板页脚显示「块2→14楼」', statusLine);
  const blockTexts = env.text('[data-kami-role="block-text"]');
  ok(blockTexts.length === 2 && blockTexts[0].indexOf('第1次摘要的时间线') > 0, '面板里两个块正文都渲染出来了');
  ok(env.nodes('[data-kami-var="pin"]').length === 1, '面板有例外楼层输入框');
  ok(api.status().panelOpen === true, 'status().panelOpen = true');
  api.shutdown();
}

/* ───────────────────────── 用例 2：bug① 回归 ───────────────────────── */

console.log('\n--- 用例 2：bug① 回归 · 供应商报错文案 ---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  const before = JSON.stringify(env.wb());
  env.setGen(() => PROVIDER_ERR);          // 中转站把报错塞进 content，HTTP 200
  await api.runOnce();
  await settle();

  ok(JSON.stringify(env.wb()) === before, '世界书一个字都没动（没有新增块条目、没有账本）');
  eq(env.blockEntries().length, 0, '没有新增块条目');
  ok(!env.ledgerEntry(), '没有写账本（前沿因此没有推进）');
  eq(env.hidden(), [], '没有任何楼层被隐藏');
  const st = api.status();
  ok(st.covered === -1 && st.blocks === 0, '前沿还是 -1、块数 0（账本前沿没有推进）', JSON.stringify({ c: st.covered, b: st.blocks }));
  ok(st.pending.length === 0, '待重做清单为空（下一次仍然是完整一轮）');
  ok(typeof st.lastError === 'string' && st.lastError.indexOf(PROVIDER_ERR) > 0,
    'status().lastError 里带上了报错原文', st.lastError);
  ok(typeof st.lastError === 'string' && st.lastError.indexOf('0-9') > 0, 'lastError 指明是哪一块失败了', st.lastError);
  /* ⚠️ 这一条的口径是「接口报错**不翻模式**」：报错文案说明的是传输层出问题，
     与结构化输出能不能用无关。乱翻只会让后面的块白丢 json_schema 强制
     —— 而且翻到 off 之后要"off 失败、on 成功"才回得来，一次误判会黏一整轮。
     真正该翻模式的是「模型给了东西但不是我们的 JSON」（用例 4 覆盖）。 */
  ok(st.schemaMode === 'on', '接口报错不翻模式（json_schema 是无辜的）', st.schemaMode);
  ok(env.toasts.some(t => t[0] === 'error'), '弹了错误提示');
  ok(env.calls.gen.length === 2, '同一块换边重试了一次，共 2 次请求（第 2 块没有开始）', String(env.calls.gen.length));
  ok(!!env.calls.gen[0].json_schema && env.calls.gen[1].json_schema === undefined, '第 1 次带 json_schema、第 2 次不带');
  ok(env.calls.gen.every(r => r.tool_choice === 'none'), '两次都仍然带 tool_choice:none（反截断认这个标记）');
  ok(env.calls.gen.every(r => r.tools && r.tools[0].function.name === 'kami_noop'), '两次都仍然带占位工具');
  api.shutdown();
}

/* ───────────────────────── 用例 3：bug① 第二种形状（Claude 工具调用） ───────────────────────── */

console.log('\n--- 用例 3：bug① 第二种形状 · 工具调用里的 JSON（Claude 那条路）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  const ARGS = JSON.stringify({
    timeline: '第三天清晨，码头',
    plot: '主角在码头等到了那位旧友，两人把三年前的旧案重新摊开来看，线索逐渐指向了城里的商会。',
    changes: ['与旧友会合', '线索指向商会'],
  });
  env.setGen(() => ({ content: '', tool_calls: [{ function: { name: 'kami_block_summary', arguments: ARGS } }] }));
  await api.runOnce();
  await settle();

  eq(env.blockRanges(), ['0-9', '10-14'], '工具调用那条路照样落盘出两个块');
  const b1 = env.blockByRange(0, 9);
  ok(!!b1 && b1.content.indexOf('时间线：第三天清晨，码头') > 0, '块正文是「时间线：…」的人话', b1 && b1.content.slice(0, 60));
  ok(!!b1 && b1.content.indexOf('{\n') < 0 && b1.content.indexOf('{"timeline"') < 0, '块正文里没有原始 JSON');
  ok(!!b1 && b1.content.indexOf('{') < 0, '块正文不含花括号');
  const insp = api.inspect();
  ok(insp.blockTexts.every(t => t.indexOf('{') < 0), 'inspect().blockTexts 里也没有花括号');
  ok(api.status().schemaMode === 'on', '工具调用路径算「结构化输出走通」，schemaMode = on');
  ok(env.calls.gen.length === 2, '每块只发一次请求（第 1 次就成了）', String(env.calls.gen.length));
  api.shutdown();
}

/* ───────────────────────── 用例 4：bug① 自动换边 ───────────────────────── */

console.log('\n--- 用例 4：bug① 自动换边（带 schema 的返回废话 → 不带 schema 的返回正常 JSON）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  env.setGen((req, n) => (req && req.json_schema) ? '模型闲聊：今天天气不错，主角心情很好，我们先聊点别的。' : goodJson(n));
  await api.runOnce();
  await settle();

  eq(env.blockRanges(), ['0-9', '10-14'], '换边之后两个块都成功落盘');
  ok(api.status().schemaMode === 'off', 'status().schemaMode 变成 off', api.status().schemaMode);
  ok(api.status().lastError === null, '整轮没有留下错误');
  ok(env.calls.gen.length === 3, '共 3 次请求：第 1 块换边 2 次，第 2 块直接走 off 只用 1 次', String(env.calls.gen.length));
  ok(!!env.calls.gen[0].json_schema, '第 1 次（带 schema）确实带了 json_schema');
  ok(env.calls.gen[1].json_schema === undefined, '第 2 次（换边）请求体里**没有** json_schema');
  ok(env.calls.gen[1].tool_choice === 'none', '换边后**仍然有** tool_choice:none');
  ok(env.calls.gen[1].tools && env.calls.gen[1].tools[0].function.name === 'kami_noop', '换边后仍然带占位工具');
  ok(String(env.calls.gen[1].generation_id).indexOf('-plain') > 0, '换边的 generation_id 带 -plain 后缀（便于排查）');
  ok(env.calls.gen[2].json_schema === undefined, '第 2 块先试 off（省一次往返）');
  ok(env.blockEntries().every(e => e.content.indexOf('今天天气不错') < 0), '废话没有被写进任何块条目');
  ok(api.inspect().blockTexts.every(t => t.indexOf('第') >= 0 && t.indexOf('今天天气不错') < 0), '面板/状态里的块正文都是合法摘要');
  api.shutdown();
}

/* ───────────────────────── 用例 5：bug② 手改同步 ───────────────────────── */

console.log('\n--- 用例 5：bug② 手改同步（refresh + 世界书事件）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  api.open();
  await settle(14);
  await api.runOnce();
  await settle();

  /* 模拟用户在酒馆世界书面板里改块条目正文（保留格式头、只改正文） */
  const HAND1 = '用户手改的正文：主角在酒馆里等到了旧友，两人决定连夜出城。';
  ok(env.setContent(PREFIX + '1｜楼层 0-9', '【剧情提要｜楼层 0-9】\n' + HAND1), '假世界书里块 #1 的正文被手工改成了一段新文字');
  const savesBefore = env.calls.saveWorld.length;
  await api.refresh();
  await settle();
  const insp = api.inspect();
  ok(insp.blockTexts[0] === HAND1, 'refresh() 之后 inspect().blockTexts[0] 就是手改后的正文', insp.blockTexts[0]);
  ok(insp.state.blocks.length === 2 && insp.state.blocks[0].from === 0 && insp.state.blocks[0].to === 9, '块结构没乱');
  ok(env.calls.saveWorld.length === savesBefore, 'refresh() 只读不写（不会把手改内容覆盖回去）', String(env.calls.saveWorld.length));
  const rendered = env.text('[data-kami-role="block-text"]');
  ok(rendered.some(t => t.indexOf(HAND1) === 0), '面板里的块正文跟着变成手改后的内容', JSON.stringify(rendered.map(t => t.slice(0, 24))));

  /* 世界书保存事件（ST 1.18 输入即存 → worldinfo_updated）也应触发对账 */
  const HAND2 = '第二次手改：旧友其实是商会派来的。';
  env.setContent(PREFIX + '1｜楼层 0-9', '【剧情提要｜楼层 0-9】\n' + HAND2);
  await env.emit('worldinfo_updated', env.lbName());
  await env.pump(400);                       // 400ms 防抖
  await settle();
  ok(api.inspect().blockTexts[0] === HAND2, '世界书事件 + 400ms 防抖后自动对账，正文再次跟上', api.inspect().blockTexts[0]);
  ok(env.listeners('worldinfo_updated') === 1, 'worldinfo_updated 事件挂上了监听');

  /* 别的世界书的事件不该刷我们的面板 */
  const HAND3 = '第三次手改：这只是另一本世界书的变动。';
  env.setContent(PREFIX + '1｜楼层 0-9', '【剧情提要｜楼层 0-9】\n' + HAND3);
  await env.emit('worldinfo_updated', '别人的世界书');
  await env.pump(400);
  await settle();
  ok(api.inspect().blockTexts[0] === HAND2, '不是当前聊天的世界书 → 不重新对账', api.inspect().blockTexts[0]);
  api.shutdown();
}

/* ───────────────────────── 用例 6：bug② 不被覆盖 ───────────────────────── */

console.log('\n--- 用例 6：bug② 手改不被覆盖（之后任何写盘都不能把手改内容盖回去）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  const generated = api.inspect().blockTexts[0];
  ok(generated.indexOf('第1次摘要') > 0, '先记下脚本生成的原正文', generated.slice(0, 24));

  const HAND = '用户手写的正文：这段剧情我自己重写了，脚本不许覆盖。';
  ok(env.setContent(PREFIX + '1｜楼层 0-9', HAND), '把块 #1 的整段正文换成手写内容（连格式头都不留）');
  const savesBefore = env.calls.saveWorld.length;
  await api.addPin(1);                        // 走 loadChatState → saveChatState 这条会写盘的路径
  await settle(14);
  ok(env.calls.saveWorld.length > savesBefore, 'addPin 确实触发了一次世界书写盘', String(env.calls.saveWorld.length - savesBefore));
  const e1 = env.blockByRange(0, 9);
  ok(!!e1 && e1.content.indexOf(HAND) > 0, '写盘之后块条目正文仍然是手改后的内容', e1 && e1.content.slice(0, 60));
  ok(!!e1 && e1.content.indexOf('第1次摘要') < 0, '脚本生成的原正文没有被带回来');
  ok(!!e1 && e1.content.indexOf('【剧情提要｜楼层 0-9】') === 0, '格式头被补齐（只动头，不动正文）');
  const e2 = env.blockByRange(10, 14);
  ok(!!e2 && e2.content.indexOf('第2次摘要') > 0, '另一块没有被波及');
  eq(env.ledgerOf().pins, [1], '例外楼层落进了账本');
  ok((env.ledgerOf().blocks || []).length === 2, '账本里两个块的档案都在');
  api.shutdown();
}

/* ───────────────────────── 用例 7：bug③ 缺块补回 ───────────────────────── */

console.log('\n--- 用例 7：bug③ 缺块补回（删掉一个块条目 → 下一次大总结把它补回来）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  const gone = env.dropEntry(PREFIX + '2｜楼层 10-14');
  ok(!!gone, '从假世界书里删掉了块 #2（楼层 10-14）的条目');
  const genBefore = env.calls.gen.length;

  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '被删的那一段重新生成了压缩块，块总数与范围都对得上');
  ok(env.calls.gen.length === genBefore + 1, '只补了缺失的那一段（1 次请求），没有整轮重做', String(env.calls.gen.length - genBefore));
  const b1 = env.blockByRange(0, 9);
  const b2 = env.blockByRange(10, 14);
  ok(!!b1 && b1.content.indexOf('第1次摘要') > 0, '活着的块 #1 没有被重复生成', b1 && b1.content.slice(0, 26));
  ok(!!b2 && b2.content.indexOf('第3次摘要') > 0, '补回来的块是新生成的正文（第 3 次请求）', b2 && b2.content.slice(0, 26));
  const ledger = env.rawLedger();
  ok(!!ledger && ledger.covered === 14, '前沿没有倒退（还是 14）', ledger && String(ledger.covered));
  eq(ledger && ledger.pending, [], '待重做清单清空');
  eq(env.hidden(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], '被删那段的楼层仍然隐藏着');
  ok(api.status().lastError === null, '补块这一轮没有报错');
  const material = materialOf(env.calls.gen[genBefore]);
  ok(material.indexOf('【本块楼层：10 到 14】') > 0, '补块请求的取材正是那段缺失的楼层');
  ok(material.indexOf('—— 块（楼层 0-9）——') > 0, '补块请求带上了仍然活着的前一块作上下文');
  ok(material.indexOf('第 10 楼：') > 0, '被隐藏楼层的原文被读回来了（否则这段剧情永远补不上）');
  api.shutdown();
}

/* ───────────────────────── 用例 8：bug③ 账本也丢了 ───────────────────────── */

console.log('\n--- 用例 8：bug③ 账本也丢了（删块 + 删账本 / 账本 JSON 改坏）---');
{
  /* 8a：删掉块条目 + 删掉账本 → 面板报孤儿隐藏楼层 → 一颗按钮纳入待重做 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  env.dropEntry(PREFIX + '1｜楼层 0-9');
  ok(!!env.dropEntry(LEDGER), '删掉了块 #1 与整个账本条目');
  await api.refresh();
  await settle();
  const st = api.status();
  eq(st.orphan, ['0-9'], 'status().orphan 报出这段没人管的隐藏楼层');
  eq(st.pending, [], '在用户点按钮之前，脚本不替用户做主（pending 还是空）');
  const insp = api.inspect();
  ok(insp.state.notice.length > 0, '面板提示里也说了这件事', JSON.stringify(insp.state.notice));
  ok(insp.state.notice.some(n => /10/.test(n)), '面板提示里带上了「10 个隐藏楼层」这个数（0-9 共 10 楼）', JSON.stringify(insp.state.notice));
  ok(insp.state.adopted === true, '活着的块按条目名字被收养（adopted）');
  eq(st.blocks, 1, '按名字收养出 1 个块');
  await api.repairOrphans();
  await settle();
  eq(api.status().pending, ['0-9'], 'repairOrphans() 之后这段进了待重做（pending）');
  eq((env.ledgerOf().pending || []).map(p => p.from + '-' + p.to), ['0-9'], '待重做段落进了账本');
  ok(env.toasts.some(t => t[0] === 'success'), 'repairOrphans 弹了成功提示');
  ok(env.hidden().indexOf(3) > 0, '这些楼层在此期间保持隐藏（没被顺手取消隐藏）');

  /* 接着真的补回来 */
  const genBefore = env.calls.gen.length;
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '下一次大总结把丢掉的那段重新总结并补回');
  ok(env.calls.gen.length === genBefore + 1, '补块只花了一次请求', String(env.calls.gen.length - genBefore));
  ok(!!env.blockByRange(0, 9) && env.blockByRange(0, 9).content.indexOf('第3次摘要') > 0, '补回的块正文是新生成的');
  eq(api.status().pending, [], '待重做清空');
  ok(api.status().covered === 14, '前沿没有倒退');
  api.shutdown();
}
{
  /* 8b：账本 JSON 被改坏（半个 JSON）——块条目也没了 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  env.dropEntry(PREFIX + '1｜楼层 0-9');
  ok(env.setContent(LEDGER, '{"v":3, "covered":14, "blocks":[') === true, '把账本正文改成半个 JSON');
  await api.refresh();
  await settle();
  const insp = api.inspect();
  ok(typeof insp.state.error === 'string' && insp.state.error.length > 0 && /JSON/.test(insp.state.error),
    '面板拿到「账本不是合法 JSON」这条 error（块条目本身照常能用）', insp.state.error);
  eq(api.status().orphan, ['0-9'], '账本坏了也照样报出孤儿隐藏楼层');
  eq(api.status().blocks, 1, '块条目仍然被收养（1 个）');
  api.shutdown();
}
{
  /* 8c：账本还在、只是块档案没了（用户清过账本的极端形态）——
     这时唯一的线索是账本里的「我们隐藏过哪些楼」。 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  const lg = env.ledgerOf();
  const ledgerHadHiddenByUs = Array.isArray(lg.hiddenByUs) ? lg.hiddenByUs.length : 0;
  ok(ledgerHadHiddenByUs === 15,
    '8c 前置：账本里记着「这 15 楼是我们隐藏的」（写完盘就该有，否则后面认不出它们）',
    '账本里的 hiddenByUs = ' + JSON.stringify(lg.hiddenByUs));
  lg.blocks = [];                                  // 块档案被清掉
  env.setContent(LEDGER, JSON.stringify(lg, null, 2));
  env.dropEntry(PREFIX + '1｜楼层 0-9');            // 第 1 块条目也没了
  await api.refresh();
  await settle();
  eq(api.status().pending, ['0-9'], '8c：靠 hiddenByUs 自动把这段纳入待重做（不必让用户点按钮）');
  eq(api.status().orphan, [], '8c：不需要报警（这些楼是我们自己藏的，脚本认得出）');
  api.shutdown();
}

/* ───────────────────────── 用例 9：注销零残留 ───────────────────────── */

console.log('\n--- 用例 9：注销零残留（iframe + 父窗口两处全局都要收回）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }), hostParent: true });
  CUR = env;
  await settle();
  const api = env.W.KamiSummarize;
  ok(!!api && env.W !== env.HOST, '环境是「iframe 里的脚本 + 父窗口宿主」（window !== HOST）');
  ok(env.W.KamiSummarize === env.HOST.KamiSummarize, '全局 API 在 window 与 HOST 两边都挂了');
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '注销前先跑出一轮压缩成果');
  const wbSnapshot = JSON.stringify(env.wb());
  const hiddenSnapshot = JSON.stringify(env.hidden());
  ok(env.HOST.fetch !== env.nativeFetch, '实测钩子挂在 HOST.fetch 上');

  api.shutdown();
  await settle();
  ok(env.W.KamiSummarize === undefined, 'shutdown 后 window.KamiSummarize 没了');
  ok(env.HOST.KamiSummarize === undefined, 'shutdown 后 HOST.KamiSummarize 也没了');
  ok(!(env.HOST.__hubDefs || []).some(d => d && d.name === '📜 压缩'), '按钮中转站里的登记被撤了');
  ok(env.HOST.fetch === env.nativeFetch, '实测钩子摘干净（HOST.fetch 还原成原生函数）');
  ok(env.intervals.length === 0, '心跳 setInterval 被清掉（进程可以正常退出）');
  eq(env.doc.getElementById('kami-compress-panel'), null, '面板节点没建过/已拆除（本环境没开面板）');

  const savesBefore = env.calls.saveWorld.length;
  await env.pump(60000);
  await settle();
  ok(env.calls.saveWorld.length === savesBefore, '注销后定时器不再触发任何写盘');
  ok(JSON.stringify(env.wb()) === wbSnapshot, '假世界书没有被改动（压缩成果按设计保留）');
  ok(JSON.stringify(env.hidden()) === hiddenSnapshot, '隐藏状态也保持原样（注销不取消隐藏）');
  ok(api.status().disposed === true, 'status().disposed = true');

  /* F1：注销后就算硬调一次 runOnce，也不许写盘。
     先删掉一个块条目，让这一轮**确实有活要干**（否则没待办，走不到注销判断那一步）。 */
  env.dropEntry(PREFIX + '2｜楼层 10-14');
  const wbSnapshot2 = JSON.stringify(env.wb());
  await api.runOnce();
  await settle();
  ok(env.calls.saveWorld.length === savesBefore, '注销后即使被硬调 runOnce 也不写盘');
  ok(JSON.stringify(env.wb()) === wbSnapshot2, '世界书仍然原样（缺块也没去补）');
  ok(String(api.status().lastError || '').indexOf('注销') >= 0, '注销后那次调用留下的错误里写明「脚本已注销」', api.status().lastError);
}

/* ───────────────────────── 用例 10：例外楼层 ───────────────────────── */

console.log('\n--- 用例 10：例外楼层（pin 不隐藏、不参与压缩、但要进摘要材料）---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.addPin(3);
  await settle();
  eq(api.status().pins, [3], 'addPin(3) 记下了例外楼层');
  eq(env.ledgerOf().pins, [3], '例外楼层落进了账本');
  await api.runOnce();
  await settle();

  eq(env.blockRanges(), ['0-10', '11-14'], '切块时跳过例外楼层，两个块的范围是 0-10 / 11-14');
  const hidden = env.hidden();
  ok(hidden.indexOf(3) < 0, '第 3 楼没有被隐藏（例外楼层始终保留原文）');
  eq(hidden, [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], '其余被总结的楼层照常隐藏');
  ok((env.ledgerOf().hiddenByUs || []).indexOf(3) < 0, '账本的 hiddenByUs 里没有第 3 楼（不是我们藏的）');
  const material = materialOf(env.calls.gen[0]);
  ok(material.indexOf('—— 例外楼层 3 ——') > 0, '第 3 楼的原文作为「例外楼层」进了请求材料');
  ok(material.indexOf('第 3 楼：') > 0, '例外楼层的原文内容确实带上了');
  ok(material.indexOf('楼层 3（') < 0, '第 3 楼没有被当成「本块楼层」重复计入');
  ok(material.indexOf('—— 例外楼层') > 0 && material.indexOf('【例外楼层】') > 0, '材料里单列了【例外楼层】一节');
  const st = api.status();
  ok(st.pins.join(',') === '3' && st.blocks === 2, 'status 里 pins 与块数都对');
  api.shutdown();
}

/* ───────────────────────── 用例 11：中途失败 → 断点续跑 ───────────────────────── */

console.log('\n--- 用例 11（加测）：第 2 块失败 → 已成功的块照常落盘，下次从断点继续 ---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  env.setGen((req, n) => (n === 1 ? goodJson(n) : PROVIDER_ERR));
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9'], '只落了第 1 个块（第 2 块两次都没过）');
  eq(env.hidden(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], '只隐藏了第 1 块覆盖的楼层');
  ok(env.ledgerOf().covered === 9, '前沿只推进到成功块的末尾（9）', String(env.ledgerOf().covered));
  const st1 = api.status();
  ok(typeof st1.lastError === 'string' && st1.lastError.indexOf('10-14') > 0, 'lastError 指明失败的是 10-14 那块', st1.lastError);
  ok(String(st1.lastError || '').indexOf(PROVIDER_ERR) > 0, '错误里带着接口原文', st1.lastError);
  ok(env.toasts.some(t => t[0] === 'error'), '弹了「未全部完成」的错误提示');

  /* 网络恢复 → 从断点续跑 */
  env.setGen(null);
  const genBefore = env.calls.gen.length;
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '续跑补上了剩下的 10-14，两块都在');
  ok(env.calls.gen.length === genBefore + 1, '续跑只处理剩下的那一块（1 次请求）', String(env.calls.gen.length - genBefore));
  eq(env.hidden(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], '续跑成功后 10-14 才被隐藏');
  ok(api.status().covered === 14 && api.status().lastError === null, '前沿推到 14、错误清空');
  ok(env.blockByRange(0, 9).content.indexOf('第1次摘要') > 0, '已成功的第 1 块没有被重算');
  api.shutdown();
}

/* ───────────────────────── 用例 12：边角（未绑世界书 / 自动触发 / 自定义接口 / 重入）--- */

console.log('\n--- 用例 12（加测）：未绑世界书自动创建 / 生成事件自动触发 / 自定义接口 / 重入保护 ---');
{
  /* 12a：聊天没绑世界书 → 写的时候自动创建并绑定 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }), lorebook: null });
  CUR = env;
  await settle();
  const api = env.api();
  ok(api.status().lorebook === null || api.status().lorebook === undefined, '未绑世界书时 status().lorebook 是空');
  await api.runOnce();
  await settle();
  ok(env.calls.orCreate.length === 1, '写盘时调了一次 getOrCreateChatLorebook');
  ok(env.calls.saveWorld[0] === '新建的聊天世界书', '压缩数据写进了新建的世界书', env.calls.saveWorld[0]);
  ok(api.status().lorebook === '新建的聊天世界书', 'status().lorebook 更新成新世界书名');
  eq(env.blockRanges(), ['0-9', '10-14'], '块照常落盘');
  api.shutdown();
}
{
  /* 12b：生成前估算 ≥ 上限 → 自动触发大总结 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10, grandOn: true, threshold: 1000 }), floorRepeat: 20 });
  CUR = env;
  await settle();
  const api = env.api();
  await env.emit('generation_started', 'normal');
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '估算超过上限 → 生成前自动跑完一轮大总结');
  ok(env.toasts.some(t => t[0] === 'info'), '弹了自动触发的提示');
  ok(env.listeners('generation_started') === 1, 'GENERATION_STARTED 事件挂上了监听');
  api.shutdown();

  /* 12b-2：开关关着时，生成事件不触发任何摘要请求 */
  const env2 = makeEnv({ vars: VARS({ keep: 5, chunk: 10, grandOn: false, threshold: 1000 }), floorRepeat: 20 });
  CUR = env2;
  await settle();
  await env2.emit('generation_started', 'normal');
  await settle();
  ok(env2.calls.gen.length === 0 && env2.blockEntries().length === 0, '超限压缩关着 → 生成前不触发大总结');
  env2.api().shutdown();
}
{
  /* 12c：自定义接口（sumModel.mode='custom'）→ 每次都带 custom_api */
  const env = makeEnv({
    vars: VARS({
      keep: 5, chunk: 10,
      sumModel: { mode: 'custom', current: '我的接口', tavernPick: '' },
      sumConfigs: [{ name: '我的接口', source: 'custom', apiurl: 'https://api.example.com/v1/chat/completions', key: 'sk-test', model: 'gpt-4o-mini' }],
    }),
  });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '自定义接口下也照常落盘');
  ok(env.calls.gen.length === 2 && env.calls.gen.every(r => r.custom_api &&
    r.custom_api.apiurl === 'https://api.example.com/v1/chat/completions' &&
    r.custom_api.key === 'sk-test' && r.custom_api.model === 'gpt-4o-mini' && r.custom_api.source === 'custom'),
    '每个摘要请求都带 custom_api（地址/密钥/模型）');
  api.shutdown();
}
{
  /* 12c-2：跟随酒馆的「连接配置」→ 请求发出时临时把源格式/地址/模型套到酒馆设置上，跑完还原 */
  const env = makeEnv({
    vars: VARS({ keep: 5, chunk: 10, sumModel: { mode: 'tavern', current: '', tavernPick: '我的连接' } }),
    profiles: [{ name: '我的连接', mode: 'cc', api: 'deepseek', model: 'deepseek-chat', 'api-url': 'https://proxy.example.com/v1' }],
  });
  CUR = env;
  await settle();
  const api = env.api();
  const seen = [];
  env.setGen((req, n) => {
    seen.push({
      model: env.ctx.chatCompletionSettings.model,
      src: env.ctx.chatCompletionSettings.chat_completion_source,
      proxy: env.ctx.chatCompletionSettings.reverse_proxy,
    });
    return goodJson(n);
  });
  await api.runOnce();
  await settle();
  eq(env.blockRanges(), ['0-9', '10-14'], '指定酒馆连接配置时也照常落盘');
  ok(env.calls.gen.length === 2 && env.calls.gen.every(r => r.custom_api === undefined), '指定酒馆连接时不带 custom_api');
  ok(seen.length === 2 && seen.every(x => x.model === 'deepseek-chat' && x.src === 'deepseek' &&
    x.proxy === 'https://proxy.example.com/v1'),
    '摘要请求发出时，选中那套连接配置已临时套到酒馆设置上', JSON.stringify(seen));
  ok(env.ctx.chatCompletionSettings.model === undefined &&
    env.ctx.chatCompletionSettings.chat_completion_source === undefined &&
    env.ctx.chatCompletionSettings.reverse_proxy === undefined, '跑完立刻还原（不留痕）');
  api.shutdown();

  /* 12c-3：配置名不存在 → 警告 + 回退当前连接，不静默失败 */
  const env2 = makeEnv({
    vars: VARS({ keep: 5, chunk: 10, sumModel: { mode: 'tavern', current: '', tavernPick: '早被删掉的连接' } }),
  });
  CUR = env2;
  await settle();
  const api2 = env2.api();
  await api2.runOnce();
  await settle();
  eq(env2.blockRanges(), ['0-9', '10-14'], '连接配置找不到时回退当前连接，照样能总结');
  ok(env2.toasts.some(t => t[0] === 'warning'), '弹了「连接配置不存在」的警告提示');
  api2.shutdown();
}
{
  /* 12d：重入保护 */
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  const p1 = api.runOnce();
  const p2 = api.runOnce();
  await Promise.all([p1, p2]);
  await settle();
  ok(env.calls.gen.length === 2, '并发触发只有一轮真的跑（2 次请求）', String(env.calls.gen.length));
  ok(env.toasts.some(t => t[0] === 'warning'), '第二次被拦下来并给了警告提示');
  ok(env.calls.setMessages.length === 1, '隐藏只做了一次');
  api.shutdown();
}

/* ───────────────────────── 探针：末段丢块 + 账本一起丢（不计分）--- */

console.log('\n--- 探针（不计分）：删掉**最后**一个块 + 账本一起丢 ---');
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) });
  CUR = env;
  await settle();
  const api = env.api();
  await api.runOnce();
  await settle();
  env.dropEntry(PREFIX + '2｜楼层 10-14');   // 末段
  env.dropEntry(LEDGER);                    // 账本一起没
  await api.refresh();
  await settle();
  console.log('OBSERVE · 只点刷新：orphan=' + JSON.stringify(api.status().orphan) +
    ' pending=' + JSON.stringify(api.status().pending) + ' covered=' + api.status().covered +
    '（10-14 楼仍隐藏，前沿只剩 9）');
  await api.runOnce();
  await settle();
  console.log('OBSERVE · 再跑一轮：blocks=' + JSON.stringify(env.blockRanges()) +
    ' covered=' + api.status().covered + ' orphan=' + JSON.stringify(api.status().orphan) +
    ' pending=' + JSON.stringify(api.status().pending));
  await api.refresh();
  await settle();
  console.log('OBSERVE · 那一轮之后再刷新：orphan=' + JSON.stringify(api.status().orphan) +
    ' pending=' + JSON.stringify(api.status().pending) + ' covered=' + api.status().covered);
  api.shutdown();
}

/* ───────────────────────── 收尾 ───────────────────────── */

if (bad) {
  console.log('\n--- 失败时的脚本日志（各用例末尾 14 条）---');
  for (const [msg, logs] of failLogs.slice(0, 6)) {
    console.log('· ' + msg);
    for (const l of logs) { console.log('    ' + l); }
  }
  if (STALE) {
    console.log('\n提示：产物比源码旧（见文件开头那两行）。先跑 `node build/build.mjs` 重建产物再重跑本测试，可以排除「测的是旧产物」这一类失败。');
  }
}
console.log('\n=== 合计：通过 ' + (total - bad) + ' / 失败 ' + bad + '（共 ' + total + ' 项，退出码 ' + (bad ? 1 : 0) + '）===');
process.exit(bad ? 1 : 0);
