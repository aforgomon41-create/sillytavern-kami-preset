/* 从20号抽取的共同流传输层；保留SSE/JSON数组拆包、取消与UTF-8增量解码。 */
export function createKamiResponseTransport() {
  const SNIFF_BYTES=12, BACKSLASH=String.fromCharCode(92), QUOTE='"';
  function peek(response, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const seen = [];
    let head = '';
    let ended = false;
    let failure = null;

    return (async function () {
      const stop=function(){reader.cancel().catch(function(){});};
      if(signal){if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true});}
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
      } finally { if(signal)signal.removeEventListener('abort',stop); }

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
        if (!session.stats.sawDone) console.warn('[生成响应] 上游流没有正常收尾');
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
        else console.warn('[生成响应] JSON 数组流没有正常收尾');
      },
    }));
  }



  /* Bounded JSON/SSE reader shared by short diagnostics; never clones a live stream. */
  async function readEvents(response, consume, opts) {
    opts=opts||{};
    const signal=opts.signal, limit=opts.maxBytes||1048576;
    let bytes=0, reader=null, abortReject=null,ended=false;
    const aborted=function(){const error=new Error('响应读取已中断');error.name='AbortError';return error;};
    const stop=function(){if(reader)reader.cancel().catch(function(){});if(abortReject)abortReject(aborted());};
    const cancellation=new Promise(function(_,reject){abortReject=reject;});
    cancellation.catch(function(){});
    if(signal){if(signal.aborted)throw aborted();signal.addEventListener('abort',stop,{once:true});}
    function check(){if(signal&&signal.aborted)throw aborted();}
    function value(text){check();if(text.trim()==='[DONE]'){ended=true;return;}const parsed=JSON.parse(text);if(Array.isArray(parsed))parsed.forEach(consume);else consume(parsed);}
    try{
      check();
      if(!response.body){const text=await Promise.race([response.text(),cancellation]);if(new TextEncoder().encode(text).length>limit)throw Error('诊断响应超过大小限制');value(text);return {format:'json'};}
      const inspected=await Promise.race([peek(response,signal),cancellation]);
      let source=inspected.body.pipeThrough(new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>limit)throw Error('诊断响应超过大小限制');controller.enqueue(chunk);}}));
      const shape=shapeOf(inspected.head,response.headers.get('content-type')||'');
      if(shape==='json-array')source=arrayToSse(source);
      reader=source.getReader();
      const decoder=new TextDecoder();
      let buffer='',data=[];
      function line(text){if(text.slice(-1)==='\r')text=text.slice(0,-1);if(!text){if(data.length){value(data.join('\n'));data=[];}return;}if(text.indexOf('data:')===0)data.push(text.slice(5).replace(/^ /,''));}
      while(true){check();const part=await Promise.race([reader.read(),cancellation]);if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});if(shape!=='json'){let cut;while((cut=buffer.indexOf('\n'))>=0){line(buffer.slice(0,cut));buffer=buffer.slice(cut+1);}}}
      buffer+=decoder.decode();check();
      if(shape==='json')value(buffer);
      else{if(buffer)line(buffer);line('');}
      return {format:shape==='json'?'json':'sse',ended:ended};
    }finally{
      if(signal)signal.removeEventListener('abort',stop);
      if(reader){try{await reader.cancel();}catch(error){}try{reader.releaseLock();}catch(error){}}
      else if(signal&&signal.aborted&&response.body){try{await response.body.cancel();}catch(error){}}
    }
  }

  return {peek:peek,shapeOf:shapeOf,restream:restream,jsonResponse:jsonResponse,sseRelay:sseRelay,arrayToSse:arrayToSse,readEvents:readEvents};
}
