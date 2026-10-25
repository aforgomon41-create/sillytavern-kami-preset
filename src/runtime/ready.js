/* 运行库：就绪握手。
 *
 * 面板脚本可能在运行库之前跑（脚本顺序被用户挪过、或运行库被关掉），
 * 所以提供一个 ready(fn, opts)：
 *   · 运行库已就绪 → 立刻同步调用 fn(KamiRuntime)
 *   · 还没就绪 → 排队，等运行库注册时统一唤醒
 *   · 超时（默认 3000ms）→ 调用 opts.onTimeout() 或给一句人话提示
 * 注意：这是「面板脚本等运行库」，不是反过来。运行库自己是同步 babel 出来的 IIFE，
 * 注册完立刻唤醒等待队列。
 */
export function createReady(runtime) {
  var waiters = [];
  var TIMEOUT = 3000;

  function flush() {
    var list = waiters.slice();
    waiters.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { clearTimeout(list[i].timer); } catch (e) { }
      try { list[i].fn(runtime); } catch (e) { try { console.error('[运行库] 面板回调失败', e); } catch (e2) { } }
    }
  }

  function ready(fn, opts) {
    var o = opts || {};
    if (typeof fn !== 'function') { return function () { }; }
    if (waiters === null) { fn(runtime); return function () { }; }
    var item = { fn: fn, timer: null };
    var ms = typeof o.timeout === 'number' ? o.timeout : TIMEOUT;
    if (ms > 0) {
      item.timer = setTimeout(function () {
        var idx = waiters.indexOf(item);
        if (idx >= 0) { waiters.splice(idx, 1); }
        try {
          if (typeof o.onTimeout === 'function') { o.onTimeout(); }
          else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[运行库] 等待超时：面板脚本跑在运行库之前，或「🧩 运行库」脚本被关闭了。');
          }
        } catch (e) { }
      }, ms);
    }
    waiters.push(item);
    return function cancel() {
      var idx = waiters.indexOf(item);
      if (idx >= 0) { waiters.splice(idx, 1); }
      try { clearTimeout(item.timer); } catch (e) { }
    };
  }

  return {
    ready: ready,
    flush: function () { flush(); waiters = null; },
    waiting: function () { return waiters ? waiters.length : 0; }
  };
}
