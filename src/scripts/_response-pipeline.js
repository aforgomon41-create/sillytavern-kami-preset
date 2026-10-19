/* 同宿主仅一层 fetch；响应按 order 从小到大通过处理器。注册票据隔离新旧脚本实例。 */
export function kamiResponsePipeline(host) {
  var key = '__kamiResponsePipelineV1';
  var cached = host[key];
  /* 空闲实例可能夹在已卸载的其他 fetch 包装中；另建闭包，不能把旧 base 改成包着自己的函数。 */
  if (cached && (cached.size() || (typeof cached.isCurrent === 'function' && cached.isCurrent()))) { return cached; }
  var base = host.fetch, entries = new Map(), hooked;
  function generation(input) {
    try {
      var url = new URL(typeof input === 'string' ? input : input.url || input.href, host.location.href);
      return url.origin === host.location.origin && /^\/api\/backends\/[^/]+\/generate$/.test(url.pathname);
    } catch (e) { return false; }
  }
  hooked = function () {
    var ctx = this || host, args = Array.prototype.slice.call(arguments);
    if (!generation(args[0]) || !entries.size) { return base.apply(ctx, args); }
    var next = function (values) { return base.apply(ctx, values); };
    Array.from(entries.values()).sort(function (a, b) { return a.order - b.order; }).forEach(function (entry) {
      var inner = next;
      next = function (values) { return entry.around(function (forwarded) { return inner(forwarded || values); }, ctx, values); };
    });
    return next(args);
  };
  var api = {
    register: function (id, order, around) {
      if (!entries.size && host.fetch === base) { host.fetch = hooked; }
      var entry = { order: order, around: around }; entries.set(id, entry);
      return function () {
        if (entries.get(id) !== entry) { return; }
        entries.delete(id);
        if (!entries.size && host.fetch === hooked) { host.fetch = base; }
      };
    },
    size: function () { return entries.size; },
    isCurrent: function () { return host.fetch === base || host.fetch === hooked; }
  };
  host[key] = api;
  return api;
}
