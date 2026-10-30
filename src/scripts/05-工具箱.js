/* 🧪 工具箱 v0.1（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 新前端的「工具箱」面板接进酒馆。只换界面，逻辑全在旧脚本里，经它们的读写桥拿数据、调动作：
 *   · 压缩 / 网络搜索 / 手动搜索 → 60 号「🧰 工具箱」的 KamiToolbox.bridge()
 *   · 其他功能（标签处理、常驻附加指令、导出）与更新页（版本信息、检查更新、继承旧预设）→ 40 号的 KamiPreset.toolsBridge() / updateBridge()
 *   · 远程更新流程里的三个窗口（要不要更新 / 进度 / 逐条裁决）：登记 HOST.KamiUpdateUi，70 号在跑时就改用这里的窗口
 *   · 手动搜索：60 号的「🔎 手动搜索」按钮与面板里的按钮都打开这里的窗口（HOST.KamiToolboxNext.manualSearch）
 * 按钮条上仍是「🧰 工具箱」（同一个名字）：本脚本在运行时，60 号的同名登记 alive() 让位。
 * 关闭 / 删除本脚本：pagehide 时注销——按钮登记、面板与窗口、全局 API 全部收回；60 号的按钮自动接回。
 */
(function () {
  var VERSION = '0.1';
  var HUB_NAME = '🧰 工具箱';
  var HUB_ORDER = 40;
  var LAYER_ID = 'kami-toolbox';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, ownDef = null, timer = null, isOpen = false, tab = 'compress';
  var pingTimer = null, offBridge = null;
  function log(msg) { try { console.log('[工具箱·新] ' + msg); } catch (e) { } }

  function bridges() {
    var tb = null, other = null, update = null;
    try { if (HOST.KamiToolbox && typeof HOST.KamiToolbox.bridge === 'function') { tb = HOST.KamiToolbox.bridge(); } } catch (e) { tb = null; }
    try { if (HOST.KamiPreset && typeof HOST.KamiPreset.toolsBridge === 'function') { other = HOST.KamiPreset.toolsBridge(); } } catch (e) { other = null; }
    try { if (HOST.KamiPreset && typeof HOST.KamiPreset.updateBridge === 'function') { update = HOST.KamiPreset.updateBridge(); } } catch (e) { update = null; }
    return { toolbox: tb, other: other, update: update };
  }
  function h() { return rt.React.createElement; }

  function open(which) {
    if (disposed || !rt) { return; }
    if (which) { tab = which; }
    var b = bridges();
    if (offBridge) { offBridge(); offBridge = null; }
    if (b.toolbox) { offBridge = b.toolbox.subscribe(paintButton); }
    rt.layer().open(LAYER_ID, h()(rt.panels.ToolboxPanel, {
      toolbox: b.toolbox, other: b.other, update: b.update, tab: tab,
      onTabChange: function (t) { tab = t; },
      onClose: close, onManualSearch: manualSearch
    }));
    isOpen = true;
  }
  function close() {
    isOpen = false;
    if (offBridge) { offBridge(); offBridge = null; }
    try { if (rt) { rt.layer().close(LAYER_ID); } } catch (e) { }
  }
  function toggle() { if (isOpen) { close(); } else { open(); } }

  /* 手动搜索窗口：开在同一层上（不依赖面板开着），关掉 = 中断（如果还在跑） */
  function manualSearch() {
    if (disposed || !rt) { return; }
    var b = bridges();
    var manual = b.toolbox && b.toolbox.manual;
    if (!manual) { toast('warning', '网络搜索还没就绪（🧰 工具箱脚本是否开着？）'); return; }
    var st = manual.status();
    if (!st.enabled || st.mode !== 'service') { toast('warning', '请先开启搜索能力并选择搜索服务'); return; }
    if (st.running && !st.manualRunning) { toast('warning', '请先等待自动搜索完成'); return; }
    rt.layer().open('kami-manual-search', h()(rt.panels.ManualSearchDialog, { manual: manual, onClose: function () { try { rt.layer().close('kami-manual-search'); } catch (e) { } } }));
  }
  function toast(kind, msg) {
    try { if (typeof toastr !== 'undefined' && toastr[kind]) { toastr[kind](msg, '工具箱'); return; } } catch (e) { }
    log(msg);
  }

  /* 70 号远程更新的三个窗口 */
  var updateUi = {
    alive: function () { return !disposed && !!rt; },
    ask: function (remote, local) {
      if (disposed || !rt) { return null; }
      return new Promise(function (resolve) {
        var done = false;
        rt.layer().open('kami-update-ask', h()(rt.panels.UpdateAskDialog, {
          remote: remote, local: local,
          onAnswer: function (yes) { if (done) { return; } done = true; try { rt.layer().close('kami-update-ask'); } catch (e) { } resolve(!!yes); }
        }));
      });
    },
    progress: function (view, handlers) {
      if (!rt) { return; }
      if (!view) { try { rt.layer().close('kami-update-progress'); } catch (e) { } return; }
      rt.layer().open('kami-update-progress', h()(rt.panels.UpdateProgressDialog, {
        view: view,
        onRetry: function () { if (handlers && handlers.retry) { handlers.retry(); } },
        onClose: function () { if (handlers && handlers.close) { handlers.close(); } else { try { rt.layer().close('kami-update-progress'); } catch (e) { } } }
      }));
    },
    review: function (plan, done) {
      if (disposed || !rt) { return false; }
      var settled = false;
      rt.layer().open('kami-merge-review', h()(rt.panels.MergeReviewDialog, {
        plan: plan,
        onDone: function (p) { if (settled) { return; } settled = true; try { rt.layer().close('kami-merge-review'); } catch (e) { } done(p); }
      }));
      return true;
    }
  };

  function buttonLabel() {
    try {
      var b = HOST.KamiToolbox && HOST.KamiToolbox.bridge ? HOST.KamiToolbox.bridge() : null;
      var s = b ? b.compress.get() : null;
      if (s && s.pipeline.running) { return HUB_NAME + '·总结中 ' + s.pipeline.done + '/' + s.pipeline.total; }
      if (s && s.lastError) { return HUB_NAME + '⚠'; }
    } catch (e) { }
    return HUB_NAME;
  }
  function paintButton() { try { if (HOST.__hub && typeof HOST.__hub.paint === 'function') { HOST.__hub.paint(); } } catch (e) { } }

  function registerButton() {
    try {
      var defs = HOST.__hubDefs || (HOST.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) { if (defs[i] && defs[i].__kamiNext === HUB_NAME) { defs.splice(i, 1); } }
      ownDef = {
        name: HUB_NAME,
        __kamiNext: HUB_NAME,
        order: HUB_ORDER,
        tip: '工具箱：压缩、网络搜索、其他功能、更新（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: buttonLabel,
        ready: function () { return !!rt; },
        absent: '工具箱还没就绪（🧪 新前端运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    try {
      HOST.KamiToolboxNext = { version: VERSION, alive: function () { return !disposed; }, open: open, close: close, toggle: toggle, manualSearch: manualSearch, shutdown: shutdown };
      HOST.KamiUpdateUi = updateUi;
    } catch (e) { }
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    log('启动 v' + VERSION);
  }

  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.panels && r.panels.ToolboxPanel) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到新运行库（🧪 新前端运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    close();
    try { if (rt) { ['kami-manual-search', 'kami-update-ask', 'kami-update-progress', 'kami-merge-review'].forEach(function (id) { rt.layer().close(id); }); } } catch (e) { }
    /* 只撤自己的登记，不调 __hub.unregister（那会连 60 号的同名登记一起删掉）；按钮中转站下一轮会把按钮交回 60 号 */
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef) { defs.splice(j, 1); } }
      var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev);
    } catch (e) { }
    ownDef = null;
    try { if (HOST.KamiToolboxNext && HOST.KamiToolboxNext.shutdown === shutdown) { delete HOST.KamiToolboxNext; } } catch (e) { }
    try { if (HOST.KamiUpdateUi === updateUi) { delete HOST.KamiUpdateUi; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
