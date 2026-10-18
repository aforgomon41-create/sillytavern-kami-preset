/* 消息文本适配器：协议拆包复用反截断传输层，各 choice 单独维护增量扫描状态。 */
export function createTagReferenceResponse(transport, makeStream, report) {
  function session() {
    var lanes = new Map(), stats = { sawDone: false };
    function lane(id, dialect, index) {
      if (!lanes.has(id)) { lanes.set(id, { stream: makeStream(), dialect: dialect, index: index }); }
      return lanes.get(id);
    }
    function frame(l, text) {
      if (l.dialect === 'google') { return { candidates: [{ index: l.index, content: { role: 'model', parts: [{ text: text }] } }] }; }
      if (l.dialect === 'anthropic') { return { type: 'content_block_delta', index: l.index, delta: { type: 'text_delta', text: text } }; }
      if (l.dialect === 'token') { return { token: text }; }
      return { choices: [{ index: l.index, delta: { content: text } }] };
    }
    function drain() {
      var out = [];
      lanes.forEach(function (l) { var tail = l.stream.finish(); if (tail) { out.push(JSON.stringify(frame(l, tail))); } });
      return out;
    }
    function rewrite(data, final) {
      var slots = [], finish = [];
      if (Array.isArray(data.choices)) {
        data.choices.forEach(function (c, n) {
          if (!c || typeof c !== 'object') { return; }
          var index = c.index == null ? n : c.index, l = lane('openai:' + index, 'openai', index);
          var holder = c.delta || c.message, key = 'content';
          if (!holder && typeof c.text === 'string') { holder = c; key = 'text'; }
          if (holder && typeof holder[key] === 'string') { slots.push({ l: l, holder: holder, key: key }); }
          if (c.finish_reason != null || final) {
            if (!holder) { holder = c.delta = {}; }
            finish.push({ l: l, holder: holder, key: key });
          }
        });
      } else if (Array.isArray(data.candidates)) {
        data.candidates.forEach(function (c, n) {
          if (!c || typeof c !== 'object') { return; }
          var index = c.index == null ? n : c.index, l = lane('google:' + index, 'google', index);
          var parts = c.content && c.content.parts;
          if (!Array.isArray(parts)) { parts = []; }
          parts.forEach(function (p) { if (p && p.thought !== true && typeof p.text === 'string') { slots.push({ l: l, holder: p, key: 'text' }); } });
          if (c.finishReason != null || final) {
            var last = parts.filter(function (p) { return p && p.thought !== true && typeof p.text === 'string'; }).slice(-1)[0];
            if (!last) { last = { text: '' }; if (!c.content) { c.content = { role: 'model' }; } if (!Array.isArray(c.content.parts)) { c.content.parts = []; } c.content.parts.push(last); }
            finish.push({ l: l, holder: last, key: 'text' });
          }
        });
      } else if (Array.isArray(data.content)) {
        var l = lane('anthropic:0', 'anthropic', 0), last;
        data.content.forEach(function (p) { if (p && p.type === 'text' && typeof p.text === 'string') { last = p; slots.push({ l: l, holder: p, key: 'text' }); } });
        if (final && last) { finish.push({ l: l, holder: last, key: 'text' }); }
      } else if (data.type === 'content_block_start' && data.content_block && data.content_block.type === 'text') {
        slots.push({ l: lane('anthropic:' + data.index, 'anthropic', data.index), holder: data.content_block, key: 'text' });
      } else if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
        slots.push({ l: lane('anthropic:' + data.index, 'anthropic', data.index), holder: data.delta, key: 'text' });
      } else if (data.type === 'content_block_stop') {
        var found = lanes.get('anthropic:' + data.index);
        if (found) { var rest = found.stream.finish(); if (rest) { return [frame(found, rest), data]; } }
      } else if (typeof data.token === 'string') {
        slots.push({ l: lane('token:0', 'token', 0), holder: data, key: 'token' });
      } else if (Array.isArray(data.results)) {
        data.results.forEach(function (r, n) { if (r && typeof r.text === 'string') { var l = lane('result:' + n, 'token', n); slots.push({ l: l, holder: r, key: 'text' }); if (final) { finish.push({ l: l, holder: r, key: 'text' }); } } });
      }
      slots.forEach(function (s) { s.holder[s.key] = s.l.stream.push(s.holder[s.key]); });
      finish.forEach(function (s) { var tail = s.l.stream.finish(); if (tail) { s.holder[s.key] = (s.holder[s.key] || '') + tail; } });
      return [data];
    }
    return {
      stats: stats,
      rewrite: rewrite,
      drain: drain,
      consume: function (raw) {
        if (raw.trim() === '[DONE]') { stats.sawDone = true; var tails = drain(); tails.push('[DONE]'); return tails.join('\n\ndata: '); }
        var data; try { data = JSON.parse(raw); } catch (e) { return raw; }
        if (!data || typeof data !== 'object' || Array.isArray(data)) { return raw; }
        return rewrite(data, false).map(function (x) { return JSON.stringify(x); }).join('\n\ndata: ');
      },
      report: function () {
        var total = { references: 0, recovered: 0, incomplete: false, bufferLimited: false };
        lanes.forEach(function (l) { total.references += l.stream.stats.references; total.recovered += l.stream.stats.recovered; total.incomplete = total.incomplete || l.stream.stats.incomplete; total.bufferLimited = total.bufferLimited || l.stream.stats.bufferLimited; });
        if (report) { report(total); }
      }
    };
  }
  return async function (response) {
    if (!response || !response.ok || !response.body) { return response; }
    var probe = await transport.peek(response), shape = transport.shapeOf(probe.head, response.headers.get('content-type') || ''), current = session();
    if (shape === 'sse' || shape === 'json-array') {
      var source = shape === 'sse' ? probe.body : transport.arrayToSse(probe.body);
      return transport.restream(transport.sseRelay(source, current), response);
    }
    var text = await new Response(probe.body).text(), data;
    try { data = JSON.parse(text); } catch (e) { return transport.restream(new Response(text).body, response); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) { return transport.jsonResponse(text, response); }
    current.rewrite(data, true); current.report();
    return transport.jsonResponse(JSON.stringify(data), response);
  };
}
