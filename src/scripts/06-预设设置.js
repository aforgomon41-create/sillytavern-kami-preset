/* 🧪 预设设置 v0.1（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 新前端的「预设设置」面板接进酒馆。只换界面：解析当前预设、开关条目（单选联动、对话模式联动、模型闸门）、
 * 改变量、选模型、自定义文风的读写，全部走 40 号「🌟 预设设置」的 KamiPreset.presetBridge()。
 * 原预设设置的「关于」「其他功能」两页已挪进工具箱（「🧪 工具箱」）。
 * 按钮条上仍是「🌟 预设设置」（同一个名字）：本脚本在运行时，40 号的同名登记 alive() 让位。
 * 关闭 / 删除本脚本：pagehide 时注销——按钮登记、面板、全局 API 全部收回；40 号的按钮自动接回。
 */
(function () {
  var VERSION = '0.1';
  var HUB_NAME = '🌟 预设设置';
  var HUB_ORDER = 30;
  var LAYER_ID = 'kami-preset';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, ownDef = null, timer = null, isOpen = false, pingTimer = null;
  function log(msg) { try { console.log('[预设设置·新] ' + msg); } catch (e) { } }
  function toast(kind, msg) {
    try { if (typeof toastr !== 'undefined' && toastr[kind]) { toastr[kind](msg, '预设设置'); return; } } catch (e) { }
    log(msg);
  }
  function bridge() {
    try { if (HOST.KamiPreset && typeof HOST.KamiPreset.presetBridge === 'function') { return HOST.KamiPreset.presetBridge(); } } catch (e) { }
    return null;
  }

  function open() {
    if (disposed || !rt) { return; }
    var api = bridge();
    if (!api) { toast('warning', '「🌟 预设设置」脚本没在运行，面板读不到预设'); return; }
    try { api.reload(); } catch (e) { }
    rt.layer().open(LAYER_ID, rt.React.createElement(rt.panels.PresetPanel, { api: api, styleCopy: api.copy, onClose: close }));
    isOpen = true;
  }
  function close() {
    isOpen = false;
    try { if (rt) { rt.layer().close(LAYER_ID); } } catch (e) { }
  }
  function toggle() { if (isOpen) { close(); } else { open(); } }

  function registerButton() {
    try {
      var defs = HOST.__hubDefs || (HOST.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) { if (defs[i] && defs[i].__kamiNext === HUB_NAME) { defs.splice(i, 1); } }
      ownDef = {
        name: HUB_NAME,
        __kamiNext: HUB_NAME,
        order: HUB_ORDER,
        tip: '预设设置（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return !!rt; },
        absent: '预设设置还没就绪（🧪 新前端运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    try { HOST.KamiPresetNext = { version: VERSION, alive: function () { return !disposed; }, open: open, close: close, toggle: toggle, shutdown: shutdown }; } catch (e) { }
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    log('启动 v' + VERSION);
  }

  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.panels && r.panels.PresetPanel) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到新运行库（🧪 新前端运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    close();
    /* 只撤自己的登记，不调 __hub.unregister（那会连 40 号的同名登记一起删掉） */
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef) { defs.splice(j, 1); } }
      var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev);
    } catch (e) { }
    ownDef = null;
    try { if (HOST.KamiPresetNext && HOST.KamiPresetNext.shutdown === shutdown) { delete HOST.KamiPresetNext; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
