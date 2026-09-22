/**
 * 🛡 反截断 (Anti-Truncation) · SillyTavern x 酒馆助手 脚本（独立版）
 *
 * 做什么：
 *   在生成请求里临时挂一个「把正文塞进参数」的函数，让模型把整篇回复写进这个函数的
 *   content 参数；脚本再把流式响应里的这段参数抽出来，还原成普通的 delta.content
 *   交还给酒馆。正文因此走的是函数参数通道，而不是普通文本通道。
 *
 * 按钮：由「🎛 脚本按钮中转站」统一注册（点 🛡 切换开/关，标签显示「反截断 开 / 反截断 关」）。
 *       本脚本只管登记 + 暴露 window.AntiTruncation = { enabled, on, off, toggle, status }。
 *       一切功能都走酒馆助手接口，不使用任何斜杠命令。
 *       v1.3：
 *         · 删除斜杠命令声明（原来登记给中转站注册 /anti）
 *         · 自定义登记事件改用 kami- 前缀命名（清除旧皮肤脚本留下的残迹）
 *         · 注销时补上定时器与 pagehide 监听的清理（原来 setInterval 没存句柄，
 *           脚本关掉后仍会每 2s 跑一次 ownSync）
 *       v1.2：自带按钮改为「自适应 + 自愈」——
 *         · 中转站真的接管了本按钮 → 隐藏自己的，避免出现两个「反截断」；
 *         · 中转站没装 / 没跑 / 被关掉 / 没登记上（心跳过期） → 自己顶上，按钮不会消失；
 *         · 每 2s 核对一次真实状态，按钮被重置/隐藏都会自己恢复。
 * 控制台：window.AntiTruncation.status()、.on()、.off()、.toggle()
 *
 * 特点：
 *   · 不依赖任何预设结构，没有锚点也能用（指令插在最后一条 user 消息之前）
 *   · SSE 按行解析，兼容 CRLF；重建响应时去掉 content-length / content-encoding
 *   · 模型没调用函数时，正文照常逐字流式显示，不会被扣住到最后
 *
 * 说明：只对 /api/backends/渠道/generate 生效。不需要函数调用的渠道开了可能空回；
 *       脚本发现异常只提示，不会替你关掉开关。
 *
 * 默认状态：**关闭**（导入后按钮显示「反截断 关」）。点「反截断」按钮即可开启；
 *          开关状态记在脚本变量 anti-truncation.enabled 里，刷新后保留。
 */
(function () {
  'use strict';

  /* ───────── 可调参数 ───────── */

  const BUTTON = '反截断';   // 按钮名（也是标签前缀，标签形如「反截断 开 / 反截断 关」）
  const VARS_KEY = 'anti-truncation';
  const API_NAME = 'AntiTruncation';
  const HOOK_MARK = '__antiTruncationHook';
  const OLD_HOOK_MARK = '__steadyRelayHook';
  const PREFIX = 'relay_reply_';
  const ENDPOINT = /\/api\/backends\/[^/]+\/generate\b/;
  const PLACEMENT = 'anchor';
  const SEEK_LIMIT = 8192;
  const SNIFF_BYTES = 12;
  const NAG_AFTER = 3;

  const TOAST_ON = ['反截断已开启', '谷畜！我燃烧你的梦！不准再截断了！'];
  const TOAST_OFF = ['反截断已关闭', '谷谷歌歌，我原谅你了，真的。'];

  /* ───────── 宿主环境 ───────── */

  const HOST = (function () {
    try {
      return window.parent && window.parent !== window ? window.parent : window;
    } catch (err) {
      return window;
    }
  })();

  function msg(err) {
    return err instanceof Error ? err.message : String(err);
  }

  function notify(level, title, text) {
    try {
      const box = HOST.toastr || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[level] === 'function') box[level](text, title);
    } catch (err) { /* 提示失败不影响功能 */ }
    const mirror = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    (console[mirror] || console.log).call(console, '[反截断] ' + title + ' · ' + text);
  }

  /* ───────── 开关状态 ───────── */

  /* 默认关闭（用户要求）：导入后按钮显示「反截断 关」，点一下开启。
     开启/关闭的选择会记在脚本变量 anti-truncation.enabled 里，刷新后保留；
     导入 JSON 里的 data 也是 {'anti-truncation': {'enabled': false}}。 */
  const state = { enabled: false };

  function readSaved() {
    try {
      const all = typeof getVariables === 'function' ? getVariables({ type: 'script' }) : null;
      const saved = all && all[VARS_KEY];
      /* 只有明确存过 enabled:true 才算开启，其余一律按默认（关闭） */
      state.enabled = !!(saved && typeof saved === 'object' && saved.enabled === true);
    } catch (err) {
      console.warn('[反截断] 读脚本变量失败，本次按默认（关闭）处理', err);
      state.enabled = false;
    }
  }

  function persist() {
    try {
      if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') return;
      const all = getVariables({ type: 'script' }) || {};
      const next = Object.assign({}, all);
      next[VARS_KEY] = { enabled: state.enabled };
      replaceVariables(next, { type: 'script' });
    } catch (err) {
      console.warn('[反截断] 写脚本变量失败，开关只在本次会话有效', err);
    }
  }

  /* ───────── 工具名 ───────── */

  function bareName(name) {
    const cut = name.lastIndexOf(':');
    return cut >= 0 ? name.slice(cut + 1) : name;
  }

  function namesOf(tools) {
    const names = new Set();
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        const name = tool && tool.function ? tool.function.name : null;
        if (typeof name === 'string' && name !== '') names.add(name);
      }
    }
    return names;
  }

  function randomTail() {
    const bytes = new Uint8Array(6);
    const box = globalThis.crypto;
    if (box && typeof box.getRandomValues === 'function') box.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function mintName(taken) {
    for (let round = 0; round < 64; round += 1) {
      const name = PREFIX + randomTail();
      if (!taken.has(name)) return name;
    }
    return PREFIX + Date.now().toString(36);
  }

  function originOf(name, mine, taken) {
    if (typeof name !== 'string' || name === '') return 'other';
    if (name === mine) return 'mine';
    const bare = bareName(name);
    if (taken.has(name) || taken.has(bare)) return 'other';
    return bare.indexOf(PREFIX) === 0 ? 'kin' : 'other';
  }

  /* ───────── 请求改造 ───────── */

  function instructionFor(tool) {
    return [
      '【传输层要求】本轮回复不要直接写在聊天正文里，改用函数调用交付：',
      '1. 调用 ' + tool + ' 一次，把你本来要写的完整正文放进它的 content 参数；',
      '2. 正文只出现在 content 里，函数调用之外不要再重复输出；',
      '3. 需要调用其它工具时照常调用，本条不影响它们。',
    ].join('\n');
  }

  function placeControl(messages, text) {
    const control = { role: 'system', content: text };
    if (PLACEMENT === 'anchor') {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i] && messages[i].role === 'user') {
          return messages.slice(0, i).concat([control], messages.slice(i));
        }
      }
    }
    const last = messages[messages.length - 1];
    return messages.concat([{ role: last && last.role === 'assistant' ? 'user' : 'system', content: text }]);
  }

  function planRequest(raw) {
    let body;
    try { body = JSON.parse(raw); } catch (err) { return { skip: '请求体不是 JSON' }; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { skip: '请求体结构不认识' };

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) return { skip: '这次请求没有 messages' };

    const pinned = body.tool_choice;
    if (pinned === 'none') return { skip: '调用方关掉了工具' };
    if (pinned === 'required') return { skip: '调用方要求必须调工具' };
    if (pinned && typeof pinned === 'object') return { skip: '调用方指定了具体工具' };

    const tools = Array.isArray(body.tools) ? body.tools.slice() : [];
    const taken = namesOf(tools);
    const tool = mintName(taken);

    const patched = Object.assign({}, body);
    patched.messages = placeControl(messages, instructionFor(tool));
    patched.tools = tools.concat([{
      type: 'function',
      function: {
        name: tool,
        description: '把这一轮要给用户看的完整正文一次性写进 content；只调用一次，正文不要写在调用之外。',
        parameters: {
          type: 'object',
          properties: { content: { type: 'string', description: '要展示给用户的完整正文' } },
          required: ['content'],
        },
      },
    }]);
    patched.tool_choice = 'auto';

    return { tool: tool, taken: taken, body: JSON.stringify(patched) };
  }

  /* ───────── 参数抽取器 ───────── */

  const QUOTE = '\x22';
  const BACKSLASH = '\\';

  function unescapeOf(ch) {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    if (ch === 'b') return '\b';
    if (ch === 'f') return '\f';
    return ch;
  }

  function ArgReader() {
    this.phase = 'seek';
    this.seekBuf = '';
    this.pending = '';
    this.high = null;
  }

  ArgReader.prototype.push = function (fragment) {
    if (!fragment) return '';
    let src = this.pending ? this.pending + fragment : fragment;
    this.pending = '';
    let at = 0;

    if (this.phase === 'seek') {
      const before = this.seekBuf.length;
      this.seekBuf += src;
      const found = /\x22content\x22\s*:\s*\x22/.exec(this.seekBuf) ||
        /(^|[\s,{])content\s*:\s*\x22/.exec(this.seekBuf);
      if (!found) {
        if (this.seekBuf.length > SEEK_LIMIT) this.phase = 'dead';
        return '';
      }
      at = found.index + found[0].length - before;
      this.seekBuf = '';
      this.phase = 'read';
      if (at >= src.length) return '';
    }
    if (this.phase !== 'read') return '';

    let out = '';
    while (at < src.length) {
      const ch = src[at];
      if (ch !== BACKSLASH) {
        if (ch === QUOTE) { this.phase = 'done'; break; }
        out += ch;
        at += 1;
        continue;
      }
      if (at + 1 >= src.length) { this.pending = src.slice(at); break; }
      const next = src[at + 1];
      if (next === 'u') {
        const hex = src.slice(at + 2, at + 6);
        if (hex.length < 4) { this.pending = src.slice(at); break; }
        if (!/^[0-9a-f]{4}$/i.test(hex)) { out += hex; at += 6; continue; }
        const code = parseInt(hex, 16);
        at += 6;
        if (code >= 55296 && code <= 56319) { this.high = code; continue; }
        if (code >= 56320 && code <= 57343 && this.high !== null) {
          out += String.fromCodePoint(65536 + ((this.high - 55296) << 10) + (code - 56320));
          this.high = null;
          continue;
        }
        this.high = null;
        out += String.fromCharCode(code);
        continue;
      }
      out += unescapeOf(next);
      at += 2;
    }
    return out;
  };

  ArgReader.prototype.flush = function () {
    if (!this.pending) return '';
    const rest = this.pending;
    this.pending = '';
    return rest;
  };

  /* ───────── 单条候选的账本 ───────── */

  function Lane(dialect) {
    this.dialect = dialect;
    this.channels = new Map();
    this.routes = new Map();
    this.openRoute = null;
    this.plain = '';
    this.sent = '';
    this.sources = new Set();
    this.holding = false;
    this.consumed = false;
  }

  Lane.prototype.channel = function (name) {
    let found = this.channels.get(name);
    if (!found) {
      found = { reader: new ArgReader(), text: '' };
      this.channels.set(name, found);
    }
    return found;
  };

  Lane.prototype.admit = function (stats, source, text) {
    if (!text) return true;
    this.sources.add(source);
    if (this.sources.size > 1) this.holding = true;
    if (this.holding) return false;
    this.sent += text;
    stats.emitted += text.length;
    return true;
  };

  Lane.prototype.settle = function (stats) {
    const pool = [];
    this.channels.forEach(function (channel, name) {
      const rest = channel.reader.flush();
      if (rest) channel.text += rest;
      if (channel.text !== '') pool.push({ name: name, text: channel.text, relay: true });
      channel.text = '';
    });
    if (this.plain !== '') pool.push({ name: 'plain', text: this.plain, relay: false });
    this.plain = '';
    if (pool.length === 0) return '';

    let winner = pool[0];
    for (const entry of pool) if (entry.text.length > winner.text.length) winner = entry;

    if (pool.length > 1) {
      stats.conflicts += 1;
      if (!winner.relay) stats.plainWins += 1;
    }
    if (winner.relay) stats.carried += winner.text.length;

    const tail = winner.text.indexOf(this.sent) === 0 ? winner.text.slice(this.sent.length) : winner.text;
    this.sent += tail;
    stats.emitted += tail.length;
    return tail;
  };

  /* ───────── 改写会话 ───────── */

  function Session(tool, taken, onFinish) {
    this.tool = tool;
    this.taken = taken;
    this.onFinish = onFinish;
    this.slots = new Map();
    this.meta = { id: 'anti-truncation-' + Date.now().toString(36), model: 'relay', created: Math.floor(Date.now() / 1000) };
    this.stats = { relay: false, conflicts: 0, plainWins: 0, carried: 0, emitted: 0, sawDone: false };
  }

  Session.prototype.lane = function (index, dialect) {
    let found = this.slots.get(index);
    if (!found) { found = new Lane(dialect); this.slots.set(index, found); }
    found.dialect = dialect;
    return found;
  };

  function putText(choice, key, text) {
    let carrier = choice[key];
    if (!carrier || typeof carrier !== 'object') { carrier = {}; choice[key] = carrier; }
    carrier.content = typeof carrier.content === 'string' ? carrier.content + text : text;
  }

  Session.prototype.consume = function (raw) {
    const payload = String(raw).trim();
    if (payload === '[DONE]') { this.stats.sawDone = true; return raw; }
    let chunk;
    try { chunk = JSON.parse(payload); } catch (err) { return raw; }
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return raw;
    if (typeof chunk.id === 'string') this.meta.id = chunk.id;
    if (typeof chunk.model === 'string') this.meta.model = chunk.model;
    if (typeof chunk.created === 'number') this.meta.created = chunk.created;
    if (Array.isArray(chunk.choices)) return this.openai(chunk, raw);
    if (Array.isArray(chunk.candidates)) return this.google(chunk, raw);
    return raw;
  };

  Session.prototype.openai = function (chunk, raw) {
    let changed = false;
    let sends = false;

    for (const entry of chunk.choices) {
      if (!entry || typeof entry !== 'object') continue;
      const index = typeof entry.index === 'number' ? entry.index : 0;
      const lane = this.lane(index, 'openai');
      const hasDelta = entry.delta !== undefined && entry.delta !== null;
      const key = hasDelta ? 'delta' : (entry.message && typeof entry.message === 'object' ? 'message' : 'delta');
      const carrier = entry[key] && typeof entry[key] === 'object' ? entry[key] : null;
      let fresh = '';

      if (carrier) {
        if (typeof carrier.content === 'string' && carrier.content !== '') {
          const text = carrier.content;
          lane.plain += text;
          if (lane.admit(this.stats, 'plain', text)) sends = true;
          else { delete carrier.content; changed = true; }
        }

        const calls = carrier.tool_calls;
        if (Array.isArray(calls) && calls.length > 0) {
          const keep = [];
          for (const call of calls) {
            if (!call || typeof call !== 'object') { keep.push(call); continue; }
            const at = typeof call.index === 'number' ? call.index : 0;
            const fn = call.function && typeof call.function === 'object' ? call.function : null;
            const name = fn && typeof fn.name === 'string' ? fn.name : '';
            let route = lane.routes.get(at);

            if (name !== '') {
              if (originOf(name, this.tool, this.taken) === 'other') { lane.routes.delete(at); route = null; }
              else { route = bareName(name); lane.routes.set(at, route); }
            }
            if (!route) { keep.push(call); continue; }

            changed = true;
            lane.consumed = true;
            if (!this.stats.relay) { this.stats.relay = true; console.log('[反截断] 命中传输函数 ' + (name || route)); }

            const channel = lane.channel(route);
            const args = fn && typeof fn.arguments === 'string' ? fn.arguments : '';
            if (args !== '') {
              const text = channel.reader.push(args);
              if (text !== '') {
                channel.text += text;
                this.stats.carried += text.length;
                if (lane.admit(this.stats, route, text)) fresh += text;
              }
            }
          }
          if (keep.length > 0) carrier.tool_calls = keep;
          else { delete carrier.tool_calls; changed = true; }
        }
      }

      if (fresh !== '') { putText(entry, key, fresh); sends = true; }

      const finish = entry.finish_reason;
      if (finish !== undefined && finish !== null) {
        const tail = lane.settle(this.stats);
        if (tail !== '') { putText(entry, key, tail); sends = true; }
        if (lane.consumed && (finish === 'tool_calls' || finish === 'function_call')) entry.finish_reason = 'stop';
        changed = true;
        sends = true;
      }
    }

    if (!changed) return raw;
    return sends ? JSON.stringify(chunk) : undefined;
  };

  Session.prototype.googleArgs = function (channel, args) {
    if (typeof args === 'string') return args === '' ? '' : channel.reader.push(args);
    if (args && typeof args === 'object' && typeof args.content === 'string') {
      const value = args.content;
      if (value === '') return '';
      if (channel.text === '') return value;
      if (value.indexOf(channel.text) === 0) return value.slice(channel.text.length);
      return channel.text.indexOf(value) === 0 ? '' : value;
    }
    return '';
  };

  Session.prototype.googleCall = function (lane, call) {
    const name = typeof call.name === 'string' ? call.name : '';
    if (name !== '') {
      if (originOf(name, this.tool, this.taken) === 'other') { lane.openRoute = null; return null; }
      lane.openRoute = bareName(name);
    }
    const route = lane.openRoute;
    if (!route) {
      const bare = call.args === undefined && call.partialArgs === undefined;
      return bare && this.stats.relay ? '' : null;
    }
    lane.consumed = true;
    if (!this.stats.relay) { this.stats.relay = true; console.log('[反截断] 命中传输函数 ' + route); }

    const channel = lane.channel(route);
    let text = '';
    if (Array.isArray(call.partialArgs)) text += readPartials(call.partialArgs);
    if (call.args !== undefined) text += this.googleArgs(channel, call.args);
    if (call.willContinue !== true) lane.openRoute = null;

    if (text === '') return '';
    channel.text += text;
    this.stats.carried += text.length;
    return lane.admit(this.stats, route, text) ? text : '';
  };

  Session.prototype.google = function (chunk, raw) {
    let changed = false;
    let sends = false;

    for (const entry of chunk.candidates) {
      if (!entry || typeof entry !== 'object') continue;
      const index = typeof entry.index === 'number' ? entry.index : 0;
      const lane = this.lane(index, 'google');
      let touched = false;
      let fresh = '';
      const keep = [];

      const content = entry.content && typeof entry.content === 'object' ? entry.content : null;
      const parts = content && Array.isArray(content.parts) ? content.parts : null;

      if (parts) {
        for (const part of parts) {
          if (!part || typeof part !== 'object') { keep.push(part); continue; }
          if (part.functionCall && typeof part.functionCall === 'object') {
            const text = this.googleCall(lane, part.functionCall);
            if (text === null) { keep.push(part); continue; }
            touched = true;
            if (text !== '') fresh += text;
            continue;
          }
          if (part.thought === true) { keep.push(part); continue; }
          if (typeof part.text === 'string' && part.text !== '') {
            lane.plain += part.text;
            if (lane.admit(this.stats, 'plain', part.text)) keep.push(part);
            else touched = true;
            continue;
          }
          keep.push(part);
        }
      }

      const finish = entry.finishReason;
      if (finish !== undefined && finish !== null) {
        const tail = lane.settle(this.stats);
        if (tail !== '') fresh += tail;
        touched = true;
      }

      if (!touched) continue;
      changed = true;
      if (fresh === '' && keep.length === 0) continue;

      const settled = content || {};
      const packed = [];
      if (fresh !== '') packed.push({ text: fresh });
      for (const part of keep) packed.push(part);
      settled.parts = packed;
      if (typeof settled.role !== 'string') settled.role = 'model';
      entry.content = settled;
      sends = true;
    }

    if (!changed) return raw;
    return sends ? JSON.stringify(chunk) : undefined;
  };

  Session.prototype.drain = function () {
    const out = [];
    const self = this;
    this.slots.forEach(function (lane, index) {
      const tail = lane.settle(self.stats);
      if (tail) out.push(self.frame(lane, index, tail));
    });
    return out;
  };

  Session.prototype.frame = function (lane, index, text) {
    if (lane.dialect === 'google') {
      return JSON.stringify({ candidates: [{ index: index, content: { role: 'model', parts: [{ text: text }] } }] });
    }
    return JSON.stringify({
      id: this.meta.id,
      object: 'chat.completion.chunk',
      created: this.meta.created,
      model: this.meta.model,
      choices: [{ index: index, delta: { content: text }, finish_reason: null }],
    });
  };

  Session.prototype.report = function () {
    if (typeof this.onFinish === 'function') this.onFinish(this.stats);
  };

  /* ───────── 流工具 ───────── */

  function readPartials(fragments) {
    let text = '';
    for (const fragment of fragments) {
      if (!fragment || typeof fragment !== 'object') continue;
      const path = typeof fragment.jsonPath === 'string' ? fragment.jsonPath.trim() : '';
      if (path !== '$.content') continue;
      if (typeof fragment.stringValue === 'string') text += fragment.stringValue;
    }
    return text;
  }

  function peek(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const seen = [];
    let head = '';
    let ended = false;
    let failure = null;

    return (async function () {
      try {
        while (!ended && head.length < SNIFF_BYTES) {
          const step = await reader.read();
          if (step.done) { ended = true; break; }
          if (!step.value || step.value.length === 0) continue;
          seen.push(step.value);
          head += decoder.decode(step.value, { stream: true });
        }
      } catch (err) {
        failure = err;
        ended = true;
      }

      const body = new ReadableStream({
        start(controller) {
          for (const value of seen) controller.enqueue(value);
          if (failure) controller.error(failure);
          else if (ended) controller.close();
        },
        async pull(controller) {
          try {
            const step = await reader.read();
            if (step.done) controller.close();
            else controller.enqueue(step.value);
          } catch (err) {
            controller.error(err);
          }
        },
        cancel(reason) { reader.cancel(reason).catch(function () {}); },
      });

      return { head: head, body: body };
    })();
  }

  function shapeOf(head, contentType) {
    const trimmed = head.trim();
    if (trimmed.charAt(0) === '[') return 'json-array';
    if (/^(data|event|id|retry):/.test(trimmed) || trimmed.charAt(0) === ':') return 'sse';
    if (contentType.indexOf('text/event-stream') >= 0) return 'sse';
    return 'json';
  }

  function cleanHeaders(headers) {
    const out = new Headers(headers);
    out.delete('content-length');
    out.delete('content-encoding');
    return out;
  }

  function restream(stream, response) {
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: cleanHeaders(response.headers),
    });
  }

  function jsonResponse(text, response) {
    const headers = cleanHeaders(response.headers);
    headers.set('content-type', 'application/json');
    return new Response(text, { status: response.status, statusText: response.statusText, headers: headers });
  }

  function rewriteEvent(event, session) {
    const out = [];
    let dataSeen = false;
    let dataKept = false;
    for (const line of event.split('\n')) {
      if (line.indexOf('data:') !== 0) { out.push(line); continue; }
      dataSeen = true;
      const raw = line.slice(5).replace(/^ /, '');
      const next = session.consume(raw);
      if (next === undefined) continue;
      out.push('data: ' + next);
      dataKept = true;
    }
    if (!dataSeen) return out.join('\n');
    return dataKept ? out.join('\n') : null;
  }

  function sseRelay(source, session) {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let lines = [];

    function emitEvent(controller) {
      if (lines.length === 0) return;
      const event = lines.join('\n');
      lines = [];
      const rewritten = rewriteEvent(event, session);
      if (rewritten) controller.enqueue(encoder.encode(rewritten + '\n\n'));
    }

    return source.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let cut = buffer.indexOf('\n');
        while (cut !== -1) {
          let line = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 1);
          if (line.slice(-1) === '\r') line = line.slice(0, -1);
          if (line === '') emitEvent(controller);
          else lines.push(line);
          cut = buffer.indexOf('\n');
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer !== '') {
          let last = buffer;
          if (last.slice(-1) === '\r') last = last.slice(0, -1);
          if (last !== '') lines.push(last);
          buffer = '';
        }
        emitEvent(controller);
        for (const payload of session.drain()) controller.enqueue(encoder.encode('data: ' + payload + '\n\n'));
        if (!session.stats.sawDone) console.warn('[反截断] 上游流没有正常收尾');
        session.report();
      },
    }));
  }

  function ArrayStream() {
    this.buffer = '';
    this.at = 0;
    this.begin = -1;
    this.depth = 0;
    this.quoted = false;
    this.escaped = false;
    this.opened = false;
    this.ended = false;
  }

  ArrayStream.prototype.take = function (text) {
    if (text) this.buffer += text;
    const out = [];
    while (this.at < this.buffer.length) {
      const ch = this.buffer[this.at];
      if (this.ended) { this.at += 1; continue; }

      if (this.begin < 0) {
        if (!this.opened) {
          if (ch === '[') { this.opened = true; this.at += 1; continue; }
          if (/\s/.test(ch)) { this.at += 1; continue; }
          this.opened = true;
          continue;
        }
        if (/\s/.test(ch) || ch === ',') { this.at += 1; continue; }
        if (ch === ']') { this.ended = true; this.at += 1; continue; }
        this.begin = this.at;
        this.depth = 0;
      }

      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (ch === BACKSLASH) this.escaped = true;
        else if (ch === QUOTE) this.quoted = false;
        this.at += 1;
        continue;
      }
      if (ch === QUOTE) { this.quoted = true; this.at += 1; continue; }
      if (ch === '{' || ch === '[') { this.depth += 1; this.at += 1; continue; }
      if (this.depth === 0 && (ch === ',' || ch === ']')) {
        out.push(this.buffer.slice(this.begin, this.at));
        this.buffer = this.buffer.slice(this.at + 1);
        if (ch === ']') this.ended = true;
        this.at = 0;
        this.begin = -1;
        continue;
      }
      if (ch === '}' || ch === ']') {
        this.depth -= 1;
        const closing = this.at;
        this.at += 1;
        if (this.depth <= 0) {
          out.push(this.buffer.slice(this.begin, closing + 1));
          this.buffer = this.buffer.slice(this.at);
          this.at = 0;
          this.begin = -1;
        }
        continue;
      }
      this.at += 1;
    }
    return out;
  };

  ArrayStream.prototype.rest = function () {
    if (this.begin < 0) return '';
    const text = this.buffer.slice(this.begin);
    this.begin = -1;
    this.buffer = '';
    this.at = 0;
    return text;
  };

  function flatJson(text) {
    try { return JSON.stringify(JSON.parse(text)); } catch (err) { return text.replace(/\s+/g, ' ').trim(); }
  }

  function arrayToSse(source) {
    const splitter = new ArrayStream();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    function frame(controller, element) {
      controller.enqueue(encoder.encode('data: ' + flatJson(element) + '\n\n'));
    }
    return source.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        for (const element of splitter.take(decoder.decode(chunk, { stream: true }))) frame(controller, element);
      },
      flush(controller) {
        for (const element of splitter.take(decoder.decode())) frame(controller, element);
        const rest = splitter.rest();
        if (rest.trim() !== '') frame(controller, rest);
        if (splitter.ended) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        else console.warn('[反截断] JSON 数组流没有正常收尾');
      },
    }));
  }

  /* ───────── 整包 JSON 还原 ───────── */

  function longestOf(plain, carried) {
    let best = '';
    for (const text of carried) if (text.length > best.length) best = text;
    if (plain !== '' && plain.length > best.length) return { text: plain, plain: true };
    return { text: best, plain: false };
  }

  function salvageArgs(args) {
    if (typeof args === 'string') {
      if (args === '') return undefined;
      try {
        const value = JSON.parse(args);
        return value && typeof value === 'object' && typeof value.content === 'string' ? value.content : undefined;
      } catch (err) {
        const reader = new ArgReader();
        const text = reader.push(args) + reader.flush();
        if (text !== '') console.warn('[反截断] arguments 是断的，只抢救出已到达的部分');
        return text === '' ? undefined : text;
      }
    }
    if (args && typeof args === 'object' && typeof args.content === 'string') return args.content;
    return undefined;
  }

  function unwrapJson(parsed, session) {
    const result = { relayed: false, chars: 0, plainWon: false };
    const choices = parsed && parsed.choices;

    if (Array.isArray(choices)) {
      for (const entry of choices) {
        if (!entry || typeof entry !== 'object') continue;
        const message = entry.message;
        if (!message || typeof message !== 'object') continue;

        const carried = [];
        const keep = [];
        const calls = message.tool_calls;
        if (Array.isArray(calls)) {
          for (const call of calls) {
            const fn = call && typeof call === 'object' ? call.function : null;
            const name = fn && typeof fn.name === 'string' ? fn.name : '';
            if (name !== '' && originOf(name, session.tool, session.taken) !== 'other') {
              const text = salvageArgs(fn.arguments);
              if (typeof text === 'string') { carried.push(text); continue; }
            }
            keep.push(call);
          }
        }
        if (carried.length === 0) continue;

        const plain = typeof message.content === 'string' ? message.content : '';
        const best = longestOf(plain, carried);
        message.content = best.text;
        if (keep.length > 0) message.tool_calls = keep;
        else {
          delete message.tool_calls;
          if (entry.finish_reason === 'tool_calls' || entry.finish_reason === 'function_call') entry.finish_reason = 'stop';
        }
        result.relayed = true;
        result.chars += best.text.length;
        if (best.plain) result.plainWon = true;
      }
    }

    const holders = [];
    if (Array.isArray(parsed && parsed.candidates)) {
      for (const entry of parsed.candidates) {
        const content = entry && typeof entry === 'object' ? entry.content : null;
        if (content && Array.isArray(content.parts)) holders.push({ content: content, owner: entry });
      }
    }
    if (parsed && parsed.responseContent && Array.isArray(parsed.responseContent.parts)) {
      holders.push({ content: parsed.responseContent, owner: null });
    }

    for (const holder of holders) {
      const carried = [];
      const keep = [];
      let plain = '';
      for (const part of holder.content.parts) {
        const call = part && typeof part === 'object' ? part.functionCall : null;
        if (call && originOf(call.name, session.tool, session.taken) !== 'other') {
          const text = salvageArgs(call.args);
          if (typeof text === 'string') { carried.push(text); continue; }
        }
        if (part && typeof part === 'object' && part.thought !== true && typeof part.text === 'string' && part.text !== '') {
          plain += part.text;
          continue;
        }
        keep.push(part);
      }
      if (carried.length === 0) continue;

      const best = longestOf(plain, carried);
      holder.content.parts = [{ text: best.text }].concat(keep);
      if (typeof holder.content.role !== 'string') holder.content.role = 'model';

      const first = Array.isArray(choices) ? choices[0] : null;
      const wrapped = first && first.message;
      if (wrapped && typeof wrapped.content === 'string' && wrapped.content.length <= best.text.length) {
        wrapped.content = best.text;
      }
      result.relayed = true;
      result.chars += best.text.length;
      if (best.plain) result.plainWon = true;
    }

    return result;
  }

  /* ───────── 主体 ───────── */

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input === 'object') {
        if (typeof input.url === 'string') return input.url;
        if (typeof input.href === 'string') return input.href;
      }
    } catch (err) { /* 忽略 */ }
    return undefined;
  }

  async function bodyOf(args) {
    const init = args[1];
    if (init && init.body !== undefined && init.body !== null) {
      return typeof init.body === 'string' ? init.body : undefined;
    }
    const input = args[0];
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try { return await input.clone().text(); } catch (err) { return undefined; }
    }
    return undefined;
  }

  function repack(args, body) {
    const input = args[0];
    const init = args[1];
    if (init && init.body !== undefined && init.body !== null) {
      return [input, Object.assign({}, init, { body: body })];
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try { return [new Request(input, { body: body }), init]; } catch (err) { return null; }
    }
    return null;
  }

  function Relay() {
    this.active = true;
    this.installed = false;
    this.native = null;
    this.host = null;
    this.last = null;
    this.misses = 0;
    this.idleWins = 0;
  }

  Relay.prototype.install = function () {
    if (this.installed) return;
    let host = null;
    try { host = HOST; void host.fetch; } catch (err) { host = null; }
    if (!host || typeof host.fetch !== 'function') {
      console.warn('[反截断] 拿不到宿主窗口的 fetch，未安装');
      return;
    }
    const current = host.fetch;
    let native = (current[HOOK_MARK] && current[HOOK_MARK].native) || current;
    if (native[OLD_HOOK_MARK] && native[OLD_HOOK_MARK].native) native = native[OLD_HOOK_MARK].native;
    const self = this;

    const hooked = function () {
      const args = arguments;
      const ctx = this || host;
      if (!self.active) return native.apply(ctx, args);
      let url;
      try { url = urlOf(args[0]); } catch (err) { url = undefined; }
      if (!url || !ENDPOINT.test(url)) return native.apply(ctx, args);
      try {
        return self.ride(native, ctx, args);
      } catch (err) {
        console.warn('[反截断] 钩子里出错，原样放行', err);
        return native.apply(ctx, args);
      }
    };
    hooked[HOOK_MARK] = { native: native };

    host.fetch = hooked;
    this.host = host;
    this.native = native;
    this.installed = true;
    console.log('[反截断] 生成请求钩子已装上');
  };

  Relay.prototype.dispose = function () {
    this.active = false;
    if (!this.installed || !this.host || !this.native) { this.installed = false; return; }
    const current = this.host.fetch;
    if (current && current[HOOK_MARK]) this.host.fetch = this.native;
    else console.warn('[反截断] fetch 上还压着别的补丁，就不动它了');
    this.installed = false;
    this.host = null;
    this.native = null;
  };

  Relay.prototype.note = function (outcome, detail) {
    this.last = { at: Date.now(), outcome: outcome, detail: detail || '' };
    console.log(detail ? '[反截断] ' + outcome + ' · ' + detail : '[反截断] ' + outcome);
    if (outcome === 'idle') {
      this.misses += 1;
      if (this.misses === NAG_AFTER) {
        notify('warning', '反截断没派上用场',
          '连续 ' + NAG_AFTER + ' 次都没在回复里看到传输函数调用。这条渠道可能不吃函数调用，也可能它自己就做了抗截断。要停用就点「' + BUTTON + '」按钮（由中转站注册）。');
      }
    } else if (outcome === 'relayed') {
      this.misses = 0;
    }
  };

  Relay.prototype.report = function (stats) {
    if (!stats.relay) {
      this.note('idle', stats.sawDone ? '模型没调用传输函数' : '模型没调用传输函数，且上游没有正常收尾');
      return;
    }
    this.misses = 0;
    this.note('relayed', stats.emitted + ' 字已送达 · 旁路 ' + stats.carried + ' 字' +
      (stats.conflicts > 0 ? ' · 双通道竞争 ' + stats.conflicts + ' 次（普通通道胜 ' + stats.plainWins + ' 次）' : ''));
    if (stats.plainWins > 0) {
      this.idleWins += 1;
      if (this.idleWins === NAG_AFTER) {
        notify('info', '这条渠道可能自带抗截断', '连续几次的正文都是从普通通道拿的。正文没丢，但这一层多半是多余的，可以点「' + BUTTON + '」按钮关掉。');
      }
    } else {
      this.idleWins = 0;
    }
  };

  Relay.prototype.ride = async function (native, ctx, args) {
    const send = function () { return native.apply(ctx, args); };

    let raw;
    try { raw = await bodyOf(args); } catch (err) { raw = undefined; }
    if (typeof raw !== 'string') { this.note('skip', '请求体不是可读的字符串，不去碰它'); return send(); }

    const plan = planRequest(raw);
    if (plan.skip) { this.note('skip', plan.skip); return send(); }

    const patched = repack(args, plan.body);
    if (!patched) { this.note('skip', '这个请求对象改不动'); return send(); }

    let response;
    try {
      response = await native.apply(ctx, patched);
    } catch (err) {
      this.note('error', '请求本身失败：' + msg(err));
      throw err;
    }

    if (!response || !response.ok || !response.body) {
      this.note('error', '上游返回 HTTP ' + (response ? response.status : '未知'));
      return response;
    }

    let probe;
    try { probe = await peek(response); } catch (err) {
      this.note('error', '读响应流失败：' + msg(err));
      return response;
    }

    const self = this;
    const session = new Session(plan.tool, plan.taken, function (stats) { self.report(stats); });
    const contentType = response.headers.get('content-type') || '';
    const shape = shapeOf(probe.head, contentType);

    try {
      if (shape === 'sse' || shape === 'json-array') {
        const source = shape === 'sse' ? probe.body : arrayToSse(probe.body);
        return restream(sseRelay(source, session), response);
      }
      const text = await new Response(probe.body).text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (err) {
        this.note('idle', '整包响应不是 JSON');
        return jsonResponse(text, response);
      }
      const outcome = unwrapJson(parsed, session);
      if (outcome.relayed) {
        this.note('relayed', '整包响应 · ' + outcome.chars + ' 字' + (outcome.plainWon ? '（普通通道更长，已采用普通通道）' : ''));
      } else {
        this.note('idle', '整包响应里没有旁路调用');
      }
      return jsonResponse(JSON.stringify(parsed), response);
    } catch (err) {
      this.note('error', '改写失败，原样转发：' + msg(err));
      return restream(probe.body, response);
    }
  };

  /* ───────── 启动 ───────── */

  const relay = new Relay();

  function setEnabled(next, announce) {
    state.enabled = next;
    relay.active = next;
    persist();
    if (announce) {
      const pair = next ? TOAST_ON : TOAST_OFF;
      notify(next ? 'success' : 'info', pair[0], pair[1]);
    } else {
      console.log('[反截断] ' + (next ? '开启' : '关闭'));
    }
  }

  /* ───────── 自有按钮（为了能单独分享；装了中转站就自动让位） ─────────
   * OWN_BUTTON_MODE:
   *   'auto'   —— 默认：检测到「🎛 脚本按钮」中转站就把自己的按钮隐藏（由中转站显示「反截断」），
   *               没检测到就自动显示自己的按钮（单独分享给别人时零配置可用）
   *   'always' —— 永远显示自己的按钮
   *   'never'  —— 永远不显示（只把按钮登记给中转站）
   * ──────────────────────────────────────────────────────────────── */
  const OWN_BUTTON_MODE = 'auto';

  let ownApplied = null, ownVisible = false, ownBound = false, ownClickAt = 0;
  let ownDisposed = false, ownDef = null, ownDomHandler = null, ownEventStop = null;
  let ownSyncTimer = null, ownBootTimer = null, ownLateTimer = null, ownPageHide = null;

  /* 中转站是否“真的活着”：
     · 不存在 / 已注销 → null
     · 心跳（__hub.hb）超过 120s 没更新 → 说明中转站 iframe 已经没了（脚本被关掉）
       ⚠️ 这正是以前“关掉中转站后按钮再也不出现”的原因：__hub 的残骸还在，
          旧代码只判断“存在与否”，于是永远把自己的按钮藏起来。
       （120s 是安全网：正常关闭中转站时，它的注销会立刻删掉 __hub；
         阈值放宽是因为脚本 iframe 是隐藏的，浏览器会节流定时器）
     · 老版本中转站没有心跳 → 视为活着（保持兼容） */
  function relayAlive() {
    try {
      const h = HOST.__hub || (HOST.parent && HOST.parent.__hub);
      if (!h || h.disposed === true) { return null; }
      const hb = Number(h.hb || 0);
      if (hb && (Date.now() - hb) > 120000) { return null; }
      return h;
    } catch (err) { return null; }
  }
  /* 中转站是否已经“接管”了本按钮（它的登记表里有「反截断」才算） */
  function relayManagesUs(h) {
    try {
      if (!h) { return false; }
      if (typeof h.status === 'function') {
        const st = h.status() || {};
        const list = st.buttons || [];
        for (let i = 0; i < list.length; i += 1) {
          if (list[i] && list[i].name === BUTTON) { return true; }
        }
        return false;
      }
      return true;   // 老版本中转站没有 status()：先认为它能接管
    } catch (err) { return false; }
  }
  function ownWant() {
    if (OWN_BUTTON_MODE === 'always') { return true; }
    if (OWN_BUTTON_MODE === 'never') { return false; }
    return !relayManagesUs(relayAlive());
  }
  function ownLabelText() { return relay.active ? '反截断 开' : '反截断 关'; }

  /* ── 认按钮的规矩：与「🎛 脚本按钮中转站」同一套 ─────────────────────
     只按「这一个按钮宿主自己的标签」认，绝不拿祖先按钮条拼起来的文字猜；
     找不到宿主就什么都不做（宁可点不动，也不许串台）。 */
  const OWN_TAG = 'data-anti-btn';
  function ownNorm(s) { return String(s === undefined || s === null ? '' : s).trim(); }
  function ownIsButtonish(el) {
    try {
      const c = String(el.className || '');
      if (c.indexOf('qr--button-label') >= 0) { return false; }
      return c.indexOf('button') >= 0 || c.indexOf('btn') >= 0;
    } catch (err) { return false; }
  }
  /* 前缀匹配：登记名「反截断」要能命中标签「反截断 开 / 反截断 关」（开关状态跟在后面）。
     名字后面必须是边界（结尾或空格），否则别人的「反截断长」会把本按钮的点击抢走。 */
  function ownMatches(text, name) {
    const t = ownNorm(text);
    if (!t) { return false; }
    if (t === name) { return true; }
    return t.indexOf(name) === 0 && t.charAt(name.length) === ' ';
  }
  /* 这段文字属于哪个登记名：能对上的取名字最长的那个
     （本脚本只登记「反截断」一个名字，所以这里退化成上面那条判断） */
  function ownMatchName(text) {
    return ownMatches(text, BUTTON) ? BUTTON : null;
  }
  /* 这个元素内部还有别的「能对上登记名」的按钮吗？
     有 → 它是按钮条容器（.qr--buttons），不是按钮，不能当宿主 */
  function ownHoldsOtherButtons(el) {
    try {
      const kids = el.querySelectorAll('*');
      for (let i = 0; i < kids.length; i += 1) {
        if (!ownIsButtonish(kids[i])) { continue; }
        let t = '';
        try { t = kids[i].textContent || ''; } catch (err) { /* 忽略 */ }
        if (ownMatchName(t)) { return true; }
      }
    } catch (err) { /* 忽略 */ }
    return false;
  }
  /* 从点击目标往上找「按钮宿主」，找到就停：
     · 带本脚本标记 OWN_TAG 的 → 就是自己画过的按钮，最可信
     · 否则要求像按钮，且内部没有别的「能对上登记名」的按钮
     找不到 → null，这次点击什么都不做 */
  function ownButtonHost(el) {
    let hops = 0;
    while (el && hops < 6) {
      if (el === HOST.document.body || el === HOST.document.documentElement) { return null; }
      try { if (el.getAttribute && el.getAttribute(OWN_TAG) !== null) { return el; } } catch (err) { /* 忽略 */ }
      if (ownIsButtonish(el) && !ownHoldsOtherButtons(el)) { return el; }
      el = el.parentNode;
      hops += 1;
    }
    return null;
  }
  function ownLabelOf(node) {
    try {
      const label = node.querySelector('.qr--button-label');
      if (label) { return label; }
    } catch (err) { /* 忽略 */ }
    return node;
  }
  function ownFind() {
    try {
      const nodes = HOST.document.querySelectorAll('.qr--button-label, .qr--button');
      let first = null;
      for (let i = 0; i < nodes.length; i += 1) {
        if (!ownMatchName(nodes[i].textContent)) { continue; }
        /* 自己标过记的优先，免得把别人家按钮的文字抢过来改 */
        try { if (nodes[i].getAttribute(OWN_TAG) !== null) { return ownLabelOf(nodes[i]); } } catch (err) { /* 忽略 */ }
        if (!first) { first = nodes[i]; }
      }
      if (first) { return ownLabelOf(first); }
    } catch (err) { /* 忽略 */ }
    return null;
  }
  function ownPaint() {
    if (!ownVisible) { return; }
    const node = ownFind();
    if (!node) { return; }
    const want = ownLabelText();
    try { if ((node.textContent || '').trim() !== want) { node.textContent = want; } } catch (err) { /* 忽略 */ }
    try { node.setAttribute(OWN_TAG, '1'); } catch (err) { /* 忽略 */ }
  }
  function ownBind() {
    if (ownBound) { return; }
    ownBound = true;
    try {
      if (typeof getButtonEvent === 'function' && typeof eventOn === 'function') {
        const evt = getButtonEvent(BUTTON);
        if (evt) {
          const stop = eventOn(evt, function () { setEnabled(!relay.active, true); ownPaint(); });
          if (typeof stop === 'function') { ownEventStop = stop; }   // 新版 eventOn 返回取消函数
          console.log('[反截断] 自有按钮事件通道已绑');
        }
      }
    } catch (err) { /* 忽略 */ }
    /* DOM 兜底（只在独立模式安装，避免和中转站重复处理同一次点击） */
    try {
      ownDomHandler = function (ev) {
        const host = ownButtonHost(ev.target);
        if (!host) { return; }
        /* 只按「这一个宿主自己的标签」认；标签为空（纯图标按钮）时才退回看标记。
           两条路都只认这个宿主自己，绝不拿祖先按钮条拼起来的文字猜。 */
        let name = ownMatchName(host.textContent);
        if (!name) {
          let tag = null;
          try { tag = host.getAttribute(OWN_TAG); } catch (err) { tag = null; }
          if (tag) { name = BUTTON; }
        }
        if (!name) { return; }
        try { ev.stopImmediatePropagation(); } catch (err) { /* 忽略 */ }
        try { ev.preventDefault(); } catch (err) { /* 忽略 */ }
        const now = Date.now();
        if (now - ownClickAt > 320) { ownClickAt = now; setEnabled(!relay.active, true); }
        ownPaint();
      };
      HOST.addEventListener('click', ownDomHandler, true);
      console.log('[反截断] 自有按钮 DOM 兜底已装');
    } catch (err) { /* 忽略 */ }
  }
  /* 读自己在中转站里的真实可见性：true / false / null(配置里没有) / undefined(查询接口不可用) */
  function ownState() {
    try {
      if (typeof getScriptButtons === 'function') {
        const list = getScriptButtons() || [];
        for (let i = 0; i < list.length; i += 1) {
          if (list[i] && list[i].name === BUTTON) { return list[i].visible !== false; }
        }
        return null;
      }
    } catch (err) { /* 忽略 */ }
    return undefined;
  }
  function writeOwnVisible(want) {
    try {
      if (typeof replaceScriptButtons === 'function') {
        if (typeof getScriptId === 'function') { replaceScriptButtons(getScriptId(), [{ name: BUTTON, visible: want }]); }
        else { replaceScriptButtons([{ name: BUTTON, visible: want }]); }
        return true;
      }
      if (want && typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name: BUTTON, visible: true }]);
        return true;
      }
    } catch (err) { console.warn('[反截断] 同步按钮显示状态失败', err); }
    return false;
  }
  function relayWhy() {
    try {
      const h = relayAlive();
      if (!h) { return '中转站没在运行'; }
      const st = (typeof h.status === 'function') ? h.status() : null;
      const list = (st && st.buttons) || [];
      return list.length ? '中转站还没接管本按钮' : '中转站还没登记任何按钮';
    } catch (err) { return '探测失败'; }
  }
  /* 每 2s 核对一次真实状态并自我修复（按钮被重置/藏起来都会自己恢复）：
     · 想显示但配置里没有/被隐藏 → 补写
     · 想隐藏但还显示着 → 藏起来
     顺便刷新自己在中转站登记表里的心跳（人没了，中转站会自动撤下按钮） */
  function ownSync(force) {
    if (ownDisposed) { return; }
    const want = ownWant();
    const cur = ownState();
    let mismatch = false;
    if (want !== ownApplied) { mismatch = true; }
    else if (cur === undefined) { mismatch = false; }      // 查询接口不可用，只能按记忆来
    else if (want) { mismatch = (cur !== true); }
    else { mismatch = (cur === true); }
    if (mismatch) {
      if (writeOwnVisible(want)) {
        ownApplied = want;
        console.log('[反截断] 自有按钮' + (want
          ? '已显示（' + relayWhy() + '，独立运行）'
          : '已隐藏（由「🎛 脚本按钮」统一显示）'));
      } else if (force) {
        ownApplied = want;
      }
    }
    ownVisible = want;
    if (ownVisible) { ownBind(); }
    ownPaint();
    if (ownDef) { try { ownDef.ping = Date.now(); } catch (err) { /* 忽略 */ } }
  }

  /* 注销：脚本关闭时把钩子、按钮登记、全局 API 全部清掉
     （只有“当前实例”才动手；迟到的旧实例不会把新实例的钩子/全局删掉） */
  function shutdown() {
    ownDisposed = true;
    /* 定时器必须先停：原来 setInterval 没存句柄，脚本关掉后还会每 2s 跑一次 ownSync */
    try { if (ownSyncTimer) { clearInterval(ownSyncTimer); } } catch (err) { }
    try { if (ownBootTimer) { clearTimeout(ownBootTimer); } } catch (err) { }
    try { if (ownLateTimer) { clearTimeout(ownLateTimer); } } catch (err) { }
    ownSyncTimer = null; ownBootTimer = null; ownLateTimer = null;
    try { if (ownPageHide) { window.removeEventListener('pagehide', ownPageHide); } } catch (err) { }
    ownPageHide = null;
    try { if (ownDomHandler) { HOST.removeEventListener('click', ownDomHandler, true); } } catch (err) { }
    try { if (typeof ownEventStop === 'function') { ownEventStop(); } } catch (err) { }
    let current = false;
    try { current = (HOST[HOOK_MARK + 'Instance'] === relay); } catch (err) { current = false; }
    if (current) { try { relay.dispose(); } catch (err) { /* 忽略 */ } }
    try { if (current && HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister(BUTTON); } } catch (err) { }
    try {
      if (current) {
        const defs = HOST.__hubDefs || [];
        for (let i = defs.length - 1; i >= 0; i -= 1) {
          if (defs[i] === ownDef || (defs[i] && defs[i].name === BUTTON)) defs.splice(i, 1);
        }
      }
    } catch (err) { }
    try {
      if (current && typeof replaceScriptButtons === 'function') {
        if (typeof getScriptId === 'function') { replaceScriptButtons(getScriptId(), []); }
        else { replaceScriptButtons([]); }
      }
    } catch (err) { /* 忽略 */ }
    try { if (current) { delete HOST[API_NAME]; } } catch (err) { }
    try { if (current) { delete HOST[HOOK_MARK + 'Instance']; } } catch (err) { }
    try { if (current) { delete HOST[OLD_HOOK_MARK + 'Instance']; } } catch (err) { }
    ownDef = null;
    console.log('[反截断] 已注销' + (current ? '' : '（旧实例，已让位给新实例）') + '：钩子已移除、按钮登记已撤销、全局 API 已清理');
  }

  function boot() {
    try {
      const previous = HOST[HOOK_MARK + 'Instance'];
      if (previous && typeof previous.dispose === 'function') previous.dispose();
    } catch (err) { /* 忽略 */ }

    readSaved();
    relay.active = state.enabled;
    relay.install();

    try {
      HOST[HOOK_MARK + 'Instance'] = relay;
      HOST[API_NAME] = {
        get enabled() { return relay.active; },
        on: function () { setEnabled(true, false); },
        off: function () { setEnabled(false, false); },
        toggle: function () { setEnabled(!relay.active, true); },
        shutdown: function () { shutdown(); },
        status: function () { return { enabled: relay.active, installed: relay.installed, last: relay.last }; },
      };
    } catch (err) {
      console.warn('[反截断] 挂调试接口失败', err);
    }

    /* 向「🎛 脚本按钮中转站」登记按钮（本脚本不碰酒馆助手的按钮 API）：
       中转站负责注册/绘制/点击，标签显示 开/关。
       每次都把自己的旧登记替换掉——否则脚本重启后，中转站手里还是
       上一个实例（已经死掉）的闭包，点了会没反应。 */
    try {
      const w = HOST;
      const defs = w.__hubDefs || (w.__hubDefs = []);
      for (let i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === BUTTON) { defs.splice(i, 1); }
      }
      ownDef = {
        name: BUTTON,
        /* 按钮条排布（2026-09-21 用户裁定）：引导(10) → 皮肤(20) → 预设(30) → 压缩(40) → 反截断(50)。
           反截断要常按开关，排最右。中转站不在时这条 order 用不上（它自己画按钮）。 */
        order: 50,
        tip: '反截断 开/关（点击切换）',
        ping: Date.now(),
        alive: function () { return !ownDisposed; },
        label: function () { return relay.active ? '反截断 开' : '反截断 关'; },
        click: function () { setEnabled(!relay.active, true); },
        ready: function () { return true; },
        absent: '反截断还没就绪'
      };
      defs.push(ownDef);
      try {
        const ev = w.document.createEvent('Event');
        ev.initEvent('kami-hub-def', false, false);
        w.dispatchEvent(ev);
      } catch (e) { /* 中转站轮询也能发现 */ }
      console.log('[反截断] 已向按钮中转站登记按钮 ' + BUTTON);
    } catch (err) {
      console.warn('[反截断] 向中转站登记按钮失败（可用控制台 AntiTruncation.toggle() 手动开关）', err);
    }

    /* 自有按钮：默认「中转站没真的接管时才显示」；
       每 2s 核对一次真实状态（中转站稍后加载/被关闭/按钮被重置都能自愈） */
    ownSync(true);
    try { ownSyncTimer = setInterval(function () { ownSync(); }, 2000); } catch (err) { /* 忽略 */ }
    ownBootTimer = setTimeout(function () {
      ownSync();
      ownLateTimer = setTimeout(function () { ownSync(); }, 800);
    }, 300);

    ownPageHide = function () { shutdown(); };
    window.addEventListener('pagehide', ownPageHide);

    console.log('[反截断] 就绪 v1.3，当前状态：' + (relay.active ? '开' : '关'));
  }

  try {
    boot();
  } catch (err) {
    console.error('[反截断] 启动失败', err);
  }
})();
