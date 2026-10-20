/* ============================================================================
 * 卡密预设 · 显式思维链切流（纯逻辑，构建期内联进 46-思维链.js）
 * ----------------------------------------------------------------------------
 * 干什么：在**正文流**里找 `<nyaruko_think>…</nyaruko_think>`，把块内文本扣下来，
 *   块外文本原样放出去。块内那些未闭合的引用标签一个字都不解析 —— 它们从此
 *   不再进 message.mes，AI 输出正则也就永远看不到它们。
 *
 * 规则（用户 2026-10-19 裁定）：
 *   · 开标签出现就开始扣；闭标签出现就停；标签本身不输出。
 *   · 只搬完整闭合块：流结束时还没闭合，把扣住的内容连同开标签原样放回正文。
 *   · 标签可能被拆到多个分片：末尾留一个标签长度的尾巴，等下一片拼上再判断。
 *   · 代码块、行内代码、引号里的同名标签不算真标签（与 _reasoning-references.js
 *     的上下文判断同一套口径），避免把示例搬走。
 *   · 块内出现嵌套同名开标签时按普通文本处理：闭标签只看第一个（用户要的简单检测）。
 *   · 缓冲上限 1M 字符；超限按“未闭合”放回正文并停止本轮提取，防止内存失控。
 *
 * 用法：createCotStream(collector) → { push(text), finish(), stats }
 *   collector 由调用方共享，形状见 newCotCollector()。
 *   push 返回**应该继续作为正文**的文本；finish 返回尾部（未闭合时的还原文本）。
 * ========================================================================== */

export var COT_OPEN = '<nyaruko_think>';
export var COT_CLOSE = '</nyaruko_think>';
var COT_BUFFER_LIMIT = 1048576;

export function newCotCollector() {
  return { text: '', partial: '', blocks: 0, closed: 0, unclosed: 0, bufferLimited: false, diverting: false, at: 0 };
}

/* 块内文本只做首尾空白收口；中间原样保留。 */
function cotTrim(value) {
  return String(value == null ? '' : value).replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
}

function cotAppend(collector, text) {
  var value = cotTrim(text);
  if (!value) { return; }
  if (collector.text) { collector.text += '\n\n'; }
  collector.text += value;
  collector.at = Date.now();
}

export function createCotStream(collector) {
  var target = collector || newCotCollector();
  var mode = 'text';              // text / block
  var buf = '';                   // 未处理输入
  var pos = 0;
  var block = '';                 // 当前块内的字符
  var blockChars = 0;
  var passthrough = false;        // 超限后本轮不再提取，全部当正文
  var ended = false;

  /* 上下文：代码块 / 行内代码 / 引号里的尖括号不算结构标签。
     与 _reasoning-references.js 的 finishRun/context 同一套口径。 */
  var fence = '', inline = 0, run = '', runStart = false, lineStart = true, prev = '', quote = '';
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
      run += ch; lineStart = false; prev = ch; return;
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
    prev = ch;
  }
  function free() { return !fence && !inline && !quote; }
  /* 消费一个结构标签后，把上下文状态收口（与引用保护器 settle 后的处理一致）。 */
  function afterTag() {
    finishRun();
    lineStart = false;
    prev = '>';
  }
  function startsAt(tag) {
    if (pos + tag.length > buf.length) { return false; }
    return buf.slice(pos, pos + tag.length) === tag;
  }
  function isPrefix(tag) {
    var rest = buf.length - pos;
    if (rest <= 0 || rest >= tag.length) { return false; }
    return tag.slice(0, rest) === buf.slice(pos);
  }
  function flushBlock(asContent) {
    var value = block;
    target.partial = '';
    if (asContent) { return COT_OPEN + value; }
    cotAppend(target, value);
    target.closed++;
    target.blocks++;
    target.diverting = false;
    return '';
  }

  function pump() {
    var out = [];
    while (pos < buf.length) {
      if (passthrough) {
        out.push(buf.slice(pos));
        pos = buf.length;
        break;
      }
      if (mode === 'text') {
        /* 尖括号前先把待定的反引号串收口：单个 ` 是行内代码，``` 是代码块，
           否则标签检测会钻进代码里（引用保护器也是先 finishRun 再认标签）。 */
        if (buf.charAt(pos) === '<') { finishRun(); }
        if (free() && startsAt(COT_OPEN)) {
          pos += COT_OPEN.length;
          mode = 'block';
          block = '';
          blockChars = 0;
          target.diverting = true;
          afterTag();
          continue;
        }
        if (free() && isPrefix(COT_OPEN)) { break; }
        var ch = buf.charAt(pos);
        pos += 1;
        context(ch);
        out.push(ch);
        continue;
      }
      /* mode === 'block' */
      if (buf.charAt(pos) === '<') { finishRun(); }
      if (free() && startsAt(COT_CLOSE)) {
        pos += COT_CLOSE.length;
        flushBlock(false);
        mode = 'text';
        block = '';
        blockChars = 0;
        afterTag();
        continue;
      }
      if (free() && isPrefix(COT_CLOSE)) { break; }
      var bc = buf.charAt(pos);
      pos += 1;
      block += bc;
      blockChars += 1;
      context(bc);
      if (blockChars > COT_BUFFER_LIMIT) {
        /* 超限：当作未闭合放回正文，本轮停止提取，剩余全部直通。 */
        target.bufferLimited = true;
        target.unclosed++;
        target.diverting = false;
        out.push(COT_OPEN + block);
        mode = 'text';
        block = '';
        blockChars = 0;
        target.partial = '';
        passthrough = true;
      }
    }
    if (pos) { buf = buf.slice(pos); pos = 0; }
    target.partial = (mode === 'block' && !passthrough) ? block : '';
    return out.join('');
  }

  return {
    push: function (text) {
      if (ended || passthrough) { return String(text == null ? '' : text); }
      buf += String(text == null ? '' : text);
      return pump();
    },
    finish: function () {
      if (ended) { return ''; }
      ended = true;
      target.diverting = false;
      var tail = pump();
      if (passthrough) { return tail; }
      if (mode === 'block') {
        target.unclosed++;
        var restored = COT_OPEN + block + buf;
        target.partial = '';
        block = ''; blockChars = 0; buf = ''; mode = 'text';
        return tail + restored;
      }
      var held = buf;
      buf = '';
      return tail + held;
    },
    stats: {
      get blocks() { return target.blocks; },
      get closed() { return target.closed; },
      get unclosed() { return target.unclosed; },
      get reasoningChars() { return target.text.length; },
      get bufferLimited() { return target.bufferLimited; }
    }
  };
}
