/* 单次增量扫描。完整思维块确认后再交给酒馆，缺边界时原样交还，避免误改正文。
   缓冲仅限当前思维块、上限512K字符；不反复扫描累计文本，不回溯寻找标签配对。 */
export function createReasoningReferenceStream() {
  var name = '', token = '', attrQuote = '', lineStart = true, afterTag = false, prev = '';
  var quote = '', fence = '', inline = 0, run = '', runStart = false, html = [], data = [];
  var comment = false, commentTail = '', held = null, namePair = null, ended = false, passthrough = false, nested = 0;
  var stats = { references: 0, recovered: 0, incomplete: false, bufferLimited: false };
  function finishRun() {
    if (!run) { return; }
    var ch = run.charAt(0), n = run.length;
    if (runStart && n >= 3) {
      if (!fence) { fence = run; }
      else if (fence.charAt(0) === ch && n >= fence.length) { fence = ''; }
    } else if (!fence && ch === '`') {
      if (!inline) { inline = n; } else if (inline === n) { inline = 0; }
    }
    run = '';
  }
  function context(ch) {
    if (ch === '`' || ch === '~') {
      if (run && run.charAt(0) !== ch) { finishRun(); }
      if (!run) { runStart = lineStart; }
      run += ch; lineStart = false; afterTag = false; prev = ch; return;
    }
    finishRun();
    if (ch === '\n' || ch === '\r') { lineStart = true; }
    else {
      if (!fence && !inline) {
        if (quote) { if (ch === quote && prev !== '\\') { quote = ''; } }
        else if (ch === '“') { quote = '”'; }
        else if (ch === '‘') { quote = '’'; }
        else if (ch === '「') { quote = '」'; }
        else if (ch === '『') { quote = '』'; }
        else if ((ch === '"' || ch === "'") && !/[A-Za-z0-9]/.test(prev)) { quote = ch; }
      }
      if (!/[ \t]/.test(ch)) { lineStart = false; }
    }
    if (!/\s/.test(ch)) { afterTag = false; }
    prev = ch;
  }
  function literal(value) { stats.references++; return value.replace(/</g, '＜').replace(/>/g, '＞'); }
  function settle(value) {
    var parsed = /^<(\/?)([^\s<>/]+)(?:\s[\s\S]*?)?\/?\s*>$/.exec(value);
    var tag = parsed && parsed[2], close = parsed && parsed[1] === '/', self = /\/\s*>$/.test(value);
    var boundary = !fence && !inline && !quote, result = value;
    if (!name) {
      if (boundary && !html.length && !data.length && !self && !close &&
          (tag === 'nyaruko_think' || tag === 'think')) {
        name = tag; nested = 0; held = { raw: [value], safe: [value], chars: value.length, references: stats.references, candidate: null }; result = '';
      } else if (boundary && /^(medium|medium_content|details|script|style|pre|code|template)$/.test(tag || '')) {
        if (!close && !self) { html.push(tag); }
        else if (close && html.indexOf(tag) >= 0) { html.length = html.lastIndexOf(tag); }
      } else if (boundary && !html.length && /^(content|appendix|options|summary|char_setting|search_results)$/.test(tag || '')) {
        if (!close && !self) { data.push(tag); }
        else if (close && data.indexOf(tag) >= 0) { data.length = data.lastIndexOf(tag); }
      }
    } else if (boundary && tag === 'out_body' && !close && held.candidate && held.candidate.outer &&
        held.raw.slice(held.candidate.end, held.raw.length - value.length).join('').trim() === '') {
      var end = held.candidate;
      result = held.safe.slice(0, end.index).join('') + end.value + held.raw.slice(end.end).join('');
      stats.references = end.references; held = null; name = ''; namePair = null;
    } else if (boundary && tag === 'n' && close && namePair && namePair.text && namePair.text.length <= 128 && !/[\r\n<>]/.test(namePair.text)) {
      /* <n>姓名</n> 是35号脚本的实际姓名语义，只有非代码/引号中的完整短姓名对可保留。 */
      held.safe[namePair.index] = namePair.open; stats.references--; namePair = null;
    } else {
      if (boundary && tag === name) {
        if (!close && !self) { nested++; }
        else if (close) {
          held.candidate = { end: held.raw.length, index: held.safe.length, references: stats.references, value: value, outer: nested === 0 };
          if (nested) { nested--; }
        }
      }
      result = literal(value);
      namePair = boundary && tag === 'n' && !close && !self ? { index: held.safe.length, open: value, text: '' } : null;
    }
    lineStart = false; afterTag = true; prev = '>';
    return result;
  }
  function push(text) {
    if (ended || passthrough) { return text; }
    var out = [];
    function emit(value) { if (value) { (held ? held.safe : out).push(value); } }
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (held) {
        held.raw.push(ch); held.chars++;
        if (held.chars > 524288) {
          stats.references = held.references; stats.incomplete = true; stats.bufferLimited = true;
          out.push(held.raw.join(''), text.slice(i + 1)); held = null; name = ''; token = ''; passthrough = true; break;
        }
      }
      if (comment) {
        emit(name ? ch.replace(/</g, '＜').replace(/>/g, '＞') : ch);
        if (ch === '<' && name) { stats.references++; }
        if (ch === '>' && commentTail === '--') { comment = false; afterTag = true; }
        commentTail = (commentTail + ch).slice(-2);
        if (ch === '\n' || ch === '\r') { lineStart = true; } else if (!/[ \t]/.test(ch)) { lineStart = false; }
        continue;
      }
      if (!token) {
        if (ch === '<') { finishRun(); token = '<'; attrQuote = ''; }
        else { emit(ch); if (namePair) { namePair.text += ch; if (namePair.text.length > 128) { namePair = null; } } context(ch); }
        continue;
      }
      if (token === '<' && !/[\p{L}/!?]/u.test(ch)) {
        emit('<'); context('<'); token = '';
        if (ch === '<') { token = '<'; attrQuote = ''; } else { emit(ch); context(ch); }
        continue;
      }
      if (ch === '<' && !attrQuote) { emit(name ? literal(token) : token); token = '<'; continue; }
      token += ch;
      if (token === '<!--') { emit(name ? literal(token) : token); token = ''; comment = true; commentTail = '--'; continue; }
      if (attrQuote) { if (ch === attrQuote) { attrQuote = ''; } }
      else if (ch === '"' || ch === "'") { attrQuote = ch; }
      else if (ch === '>') { emit(settle(token)); token = ''; }
      if (token.length >= 4096) { emit(name ? literal(token) : token); token = ''; attrQuote = ''; }
    }
    return out.join('');
  }
  return {
    push: push,
    finish: function () {
      if (ended) { return ''; } ended = true;
      if (held) {
        var end = held.candidate, tail = end ? held.raw.slice(end.end).join('') : '';
        /* 候选结束后只剩空白或完整正文总标签时，可确认最后的真实边界；同名完整示例留在思维块内。 */
        if (end && (!tail.trim() || /^\s*<out_body>[\s\S]*<\/out_body>\s*$/.test(tail) ||
            (end.outer && /^\s*<(?:content|introduction|appendix)>/.test(tail)))) {
          var safe = held.safe.slice(0, end.index).join('') + end.value + tail;
          stats.references = end.references; held = null; token = ''; return safe;
        }
        stats.references = held.references; stats.incomplete = true; var raw = held.raw.join(''); held = null; token = ''; return raw;
      }
      var rest = token; token = ''; return rest;
    },
    stats: stats
  };
}

export function protectReasoningReferences(text) {
  var stream = createReasoningReferenceStream();
  return { text: stream.push(String(text == null ? '' : text)) + stream.finish(), stats: stream.stats };
}
