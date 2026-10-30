/* 🧪 引导 v0.1（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 新前端的「引导」接进酒馆：6 步（免责声明 → 外观 → 模型 → 语言与数值 → 长文与截断 → 完成），每一步都直接改真实设置：
 *   · 免责声明正文、展示记录（这一版看过没有、首次自动弹）→ 50 号「🧭 引导」的 KamiGuide.guideBridge()
 *   · 模型 / 语言 / 数值 → 40 号 KamiPreset.presetBridge()；皮肤 → 04 号「🧪 显示」的 SkinManager
 *   · 压缩 → 60 号 KamiToolbox.bridge()；防截断 → 20 号 AntiTruncation
 * 按钮条上仍是「🧭 引导」（同一个名字）：本脚本在运行时，50 号的同名登记让位，50 号的首次自动弹也改开这里的界面。
 * 关闭 / 删除本脚本：pagehide 时注销——按钮登记、界面、全局 API 全部收回；50 号的按钮与旧向导自动接回。
 */
(function () {
  var VERSION = '0.1';
  var HUB_NAME = '🧭 引导';
  var HUB_ORDER = 10;
  var LAYER_ID = 'kami-guide';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, ownDef = null, timer = null, isOpen = false, pingTimer = null;
  function log(msg) { try { console.log('[引导·新] ' + msg); } catch (e) { } }
  function toast(kind, msg) {
    try { if (typeof toastr !== 'undefined' && toastr[kind]) { toastr[kind](msg, '引导'); return; } } catch (e) { }
    log(msg);
  }
  function call(fn) { try { return fn(); } catch (e) { return null; } }

  function open() {
    if (disposed || !rt) { return; }
    var gb = call(function () { return HOST.KamiGuide && HOST.KamiGuide.guideBridge ? HOST.KamiGuide.guideBridge() : null; });
    if (!gb) { toast('warning', '「🧭 引导」脚本没在运行，读不到免责声明与展示记录'); return; }
    var preset = call(function () { return HOST.KamiPreset && HOST.KamiPreset.presetBridge ? HOST.KamiPreset.presetBridge() : null; });
    var skins = call(function () { return HOST.KamiDisplay && HOST.KamiDisplay.alive() ? HOST.KamiDisplay.manager : null; });
    var tb = call(function () { return HOST.KamiToolbox && HOST.KamiToolbox.bridge ? HOST.KamiToolbox.bridge() : null; });
    var at = call(function () { return HOST.AntiTruncation || null; });
    var long = {};
    if (tb) {
      long.compress = {
        get: function () { var s = tb.compress.get(); return { roll: s.roll.ok ? !!s.roll.enabled : null, grand: !!s.grandOn }; },
        setRoll: function (v) { return tb.compress.setRoll(v); },
        setGrand: function (v) { return tb.compress.setGrand(v); },
        open: function () {
          if (HOST.KamiToolboxNext && HOST.KamiToolboxNext.alive()) { HOST.KamiToolboxNext.open('compress'); }
          else if (HOST.KamiToolbox) { HOST.KamiToolbox.open('compress'); }
        }
      };
    }
    if (at) { long.antitrunc = { get: function () { return !!at.enabled; }, set: function (v) { if (v) { at.on(); } else { at.off(); } } }; }
    try { if (preset) { preset.reload(); } } catch (e) { }
    gb.opened();
    rt.layer().open(LAYER_ID, rt.React.createElement(rt.panels.GuidePanel, {
      disclaimer: gb.disclaimer(), copy: gb.copy, preset: preset, skins: skins, long: long, live: tb ? [tb] : [],
      onConfirm: function () { gb.confirmed(); },
      onClose: function (completed) { gb.finish(!!completed); close(); }
    }));
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
        tip: '新手引导（点击打开向导，可随时重看）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return !!rt; },
        absent: '引导还没就绪（🧪 新前端运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    try { HOST.KamiGuideNext = { version: VERSION, alive: function () { return !disposed; }, open: open, close: close, toggle: toggle, shutdown: shutdown }; } catch (e) { }
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    /* 50 号的首次自动弹可能抢在本脚本就绪之前开了旧向导：换成新界面 */
    try {
      var g = HOST.KamiGuide;
      if (g && g.status && g.status().open) { g.close(); open(); log('旧向导已自动弹出，换成新界面'); }
    } catch (e) { }
    log('启动 v' + VERSION);
  }

  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.panels && r.panels.GuidePanel) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到新运行库（🧪 新前端运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    close();
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef) { defs.splice(j, 1); } }
      var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev);
    } catch (e) { }
    ownDef = null;
    try { if (HOST.KamiGuideNext && HOST.KamiGuideNext.shutdown === shutdown) { delete HOST.KamiGuideNext; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
