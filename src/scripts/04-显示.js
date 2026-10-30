/* 🧪 显示 v0.1（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 新前端的「显示」面板（原皮肤管理；用户 2026-10-29 改名：总管所有前端与显示的事情）接进酒馆：
 *   · 向「🎛 脚本按钮」中转站登记按钮「🎨 显示」（用户 2026-10-29 定：维持酒馆助手原生按钮，只统一成「图标 + 空格 + 名字」）
 *   · 用新运行库的 SkinManager 管皮肤：内置皮肤来自构建期内联的 SKINS_NEXT；设置存本脚本的脚本变量 kami-display（跟着预设走）
 *   · 面板里的「消息」一组：角色名样式走 35 号脚本的 KamiNameWrap（酒馆全局变量），
 *     行动选项默认 / 点选项时写酒馆页面的 localStorage（与消息前端同一个键），写完叫消息前端重画
 *   · 本脚本在运行时，旧「🎨 皮肤管理」的按钮自己让位（它的 alive() 会看 KamiDisplay）
 * 关闭 / 删除本脚本：pagehide 时注销——按钮登记、面板、全局 API 全部收回；已套用的皮肤留在新运行库里，直到页面刷新。
 */
(function () {
  /* @@KAMI_SKINS_NEXT@@ */
  var VERSION = '0.1';
  var HUB_NAME = '🎨 显示';
  var HUB_ORDER = 20;
  var VAR_KEY = 'kami-display';
  var LAYER_ID = 'kami-display';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, mgr = null, ownDef = null, timer = null, isOpen = false, pingTimer = null;
  function log(msg) { try { console.log('[显示] ' + msg); } catch (e) { } }

  /* 设置存脚本变量（getVariables / replaceVariables，type: 'script'，和 70 号远程更新同一套） */
  var store = {
    load: function () {
      try { var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {}; return all[VAR_KEY] || null; } catch (e) { return null; }
    },
    save: function (s) {
      try {
        if (typeof getVariables !== 'function' || typeof replaceVariables !== 'function') { return; }
        var all = getVariables({ type: 'script' }) || {};
        all[VAR_KEY] = JSON.parse(JSON.stringify(s));
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('⚠ 保存设置失败：' + e.message); }
    }
  };

  /* 「消息」一组的读写适配器：每次打开面板时现建，晚启动的 35 号脚本也能接上 */
  function ls() { try { return HOST.localStorage; } catch (e) { return null; } }
  function chatRefresh() { try { if (HOST.KamiChatFrontend && HOST.KamiChatFrontend.instance) { HOST.KamiChatFrontend.instance.refresh(); } } catch (e) { } }
  function prefs() {
    var p = {};
    var nw = null;
    try { nw = HOST.KamiNameWrap || null; } catch (e) { nw = null; }
    if (nw && typeof nw.get === 'function' && typeof nw.set === 'function' && nw.MODES && nw.MODES.length) {
      p.nameWrap = {
        modes: nw.MODES.map(function (m) { return { id: String(m.id), label: m.label, demo: m.demo || m.label }; }),
        get: function () { try { return String(nw.get()); } catch (e) { return ''; } },
        set: function (id) { try { return nw.set(id) === true; } catch (e) { return false; } }
      };
    }
    var fe = null;
    try { fe = HOST.KamiChatFrontend && typeof HOST.KamiChatFrontend.setEnabled === 'function' ? HOST.KamiChatFrontend : null; } catch (e) { fe = null; }
    if (fe) {
      p.chatFrontend = {
        get: function () { try { return !!fe.enabled(); } catch (e) { return true; } },
        set: function (v) { try { return fe.setEnabled(!!v) === true; } catch (e) { return false; } }
      };
    }
    var s = ls();
    if (s) {
      p.optionsFolded = {
        get: function () { try { return s.getItem('kami.options.folded') === '1'; } catch (e) { return false; } },
        set: function (v) { try { s.setItem('kami.options.folded', v ? '1' : '0'); chatRefresh(); return true; } catch (e) { return false; } }
      };
      p.skinColors = {
        get: function () { try { return s.getItem('kami.msg.skincolors') !== '0'; } catch (e) { return true; } },
        set: function (v) { try { s.setItem('kami.msg.skincolors', v ? '1' : '0'); chatRefresh(); return true; } catch (e) { return false; } }
      };
      p.optionMode = {
        get: function () { try { return s.getItem('kami-option-mode') === 'send' ? 'send' : 'fill'; } catch (e) { return 'fill'; } },
        set: function (v) { try { s.setItem('kami-option-mode', v); chatRefresh(); return true; } catch (e) { return false; } }
      };
    }
    return p;
  }

  function open() {
    if (disposed || !rt || !mgr) { return; }
    var h = rt.React.createElement;
    rt.layer().open(LAYER_ID, h(rt.panels.DisplayPanel, { manager: mgr, prefs: prefs(), onClose: close }));
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
      for (var i = defs.length - 1; i >= 0; i -= 1) { if (defs[i] && defs[i].name === HUB_NAME) { defs.splice(i, 1); } }
      ownDef = {
        name: HUB_NAME,
        order: HUB_ORDER,
        tip: '显示：皮肤、配色、动效与消息显示（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return !!mgr; },
        absent: '显示面板还没就绪（🧩 运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    var entries = (typeof SKINS_NEXT !== 'undefined' && SKINS_NEXT) || [];
    try {
      mgr = new rt.SkinManager(store, rt, entries, HOST);
      mgr.apply();
    } catch (e) { log('⚠ 皮肤管理器启动失败：' + e.message); mgr = null; return; }
    try { HOST.KamiDisplay = { version: VERSION, alive: function () { return !disposed; }, open: open, close: close, toggle: toggle, manager: mgr, shutdown: shutdown }; } catch (e) { }
    registerButton();
    /* 心跳：按钮中转站超过 3 分钟没收到 ping 就当登记方已死、撤下按钮（之前漏了这一条，按钮用一会儿就掉） */
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    log('启动 v' + VERSION + '：' + entries.length + ' 套内置皮肤，当前「' + mgr.current.manifest.name + '」');
  }

  /* 运行库由另一个脚本加载，脚本是并行跑的：最多等 15 秒 */
  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.SkinManager && r.panels) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到新运行库（🧩 运行库 是否开着？）'); return; }
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
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef || (defs[j] && defs[j].name === HUB_NAME)) { defs.splice(j, 1); } }
      if (HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister(HUB_NAME); }
    } catch (e) { }
    ownDef = null;
    if (mgr) { try { mgr.dispose(); } catch (e) { } mgr = null; }
    try { if (HOST.KamiDisplay && HOST.KamiDisplay.shutdown === shutdown) { delete HOST.KamiDisplay; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
