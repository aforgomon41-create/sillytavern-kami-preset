/* 🧪 消息前端 v0.2（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 用新运行库（KamiRuntimeNext）的 chatFrontend 给每条 AI 回复加外壳：正文 / 思维链 / 搜索资料 / 行动选项。
 * v0.2（2026-10-29 用户实测意见）：**内容留在酒馆的 DOM 里**——正文由酒馆渲染（插件插的按钮、HTML 美化、酒馆的字体颜色都照常），
 * 思维链读酒馆原生思维链块（「💭 思维链」负责把它从正文流里搬进去），搜索资料 / 行动选项换掉酒馆助手的 iframe。
 * 与 main 的两个脚本分工：「💭 思维链」照常搬运、只是不美化；「📄 正文外壳」让位。本前端关掉（显示面板「消息前端」开关、
 * 或关掉本脚本）时，它们自动接回。
 * 皮肤：由「🧪 显示」脚本管；它没开时先用内置的「碎光」，跟随系统明暗。
 * 关闭 / 删除本脚本：pagehide 时 stop()——正文放回原处、宿主与样式全部移除，酒馆恢复原样。
 */
(function () {
  /* @@KAMI_SKINS_NEXT@@ */
  var VERSION = '0.4';
  var ENABLE_KEY = 'kami.msgfe';   /* localStorage：'0' = 关（显示面板「消息前端」开关） */
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var HDOC = HOST.document;
  var disposed = false, cf = null, unsubs = [], timer = null, rtRef = null;
  function log(msg) { try { console.log('[消息前端] ' + msg); } catch (e) { } }

  function ctx() { try { return SillyTavern.getContext(); } catch (e) { return null; } }
  function enabledPref() { try { return HOST.localStorage.getItem(ENABLE_KEY) !== '0'; } catch (e) { return true; } }
  /* 「📄 正文外壳」「💭 思维链」：我们接管时让它们收起装饰；我们退出后让它们重新扫一遍 */
  function oldScripts(fn) {
    ['KamiBodyShell', 'KamiCot'].forEach(function (n) { try { var a = HOST[n]; if (a && typeof a[fn] === 'function') { a[fn](); } } catch (e) { } });
  }
  function stopVisible() {
    var b = HDOC.getElementById('mes_stop');
    return !!b && HOST.getComputedStyle(b).display !== 'none';
  }

  /* 行动选项：填入接在输入框已有内容后面 */
  function input() { return HDOC.getElementById('send_textarea'); }
  function setInput(el, v) {
    el.value = v;
    try { el.dispatchEvent(new HOST.Event('input', { bubbles: true })); } catch (e) { }
  }
  function fill(text) {
    var el = input();
    if (!el) { return false; }
    var cur = String(el.value || '').replace(/\s+$/, '');
    setInput(el, cur ? cur + '\n' + text : text);
    try { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } catch (e) { }
    return true;
  }
  /* 发送：走酒馆自己的发送流程（选项内容放进输入框 → 点发送键），不用斜杠命令。
     ⚠️ 不用酒馆助手的 generate()：它只生成文本、不写进聊天（2026-10-28 测试酒馆实测；旧行动选项前端也踩了这个坑）。
     输入框里原来有用户写了一半的内容：发送后酒馆会清空输入框，再把原来的内容放回去 */
  function send(text) {
    var el = input(), btn = HDOC.getElementById('send_but');
    if (!el || !btn) { return; }
    var keep = String(el.value || '');
    setInput(el, text);
    btn.click();
    if (!keep.trim()) { return; }
    var tries = 0;
    (function restore() {
      if (disposed) { return; }
      if (el.value === '') { setInput(el, keep); return; }
      if (++tries < 40) { setTimeout(restore, 50); }
    })();
  }

  function boot(rt) {
    if (disposed) { return; }
    /* 皮肤归「🧪 显示」管（它记住用户选的皮肤）；它没在运行、运行库还是兜底皮肤时，才先套内置的「碎光」 */
    var skin = (SKINS_NEXT || []).filter(function (s) { return s.manifest && s.manifest.id === 'suiguang'; })[0];
    var managed = false;
    try { managed = !!(HOST.KamiDisplay && HOST.KamiDisplay.alive()) || rt.current().attrs['data-k-skin'] !== 'fallback'; } catch (e) { managed = false; }
    if (skin && !managed) {
      try { rt.applySkin(skin.manifest, { scheme: 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss: skin.css, assetUrls: skin.assetUrls }); }
      catch (e) { log('套皮肤失败，用运行库内置兜底：' + e.message); }
    }
    rtRef = rt;
    try { HOST.KamiChatFrontend = { version: VERSION, active: function () { return !disposed && !!cf; }, enabled: enabledPref, setEnabled: setEnabled, get instance() { return cf; }, shutdown: shutdown }; } catch (e) { }
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      var on = function (name, fn) { var ev = tavern_events[name]; if (!ev) { return; } try { var s = eventOn(ev, fn); if (s) { unsubs.push(s); } } catch (e) { } };
      var again = function () { if (cf) { cf.refresh(); } };
      on('GENERATION_STARTED', again);
      ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'MESSAGE_RECEIVED'].forEach(function (n) { on(n, function () { again(); setTimeout(again, 300); setTimeout(again, 1200); }); });
      /* 只涉及一楼的事件：只重查那一楼（长聊天里流式每个片段都全部重画太重）；参数不是楼层号时按最后一楼 */
      var one = function (id) { if (cf) { var n = Number(id); cf.touch(isFinite(n) && String(id) !== '' && typeof id !== 'object' ? n : undefined); } };
      on('MESSAGE_DELETED', again);
      ['MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_REASONING_EDITED', 'MESSAGE_REASONING_DELETED'].forEach(function (n) { on(n, one); });
      ['STREAM_TOKEN_RECEIVED', 'STREAM_REASONING_DONE'].forEach(function (n) { on(n, function () { one(); }); });
    }
    if (enabledPref()) { startFrontend(); } else { log('启动 v' + VERSION + '：消息前端已在显示面板里关闭'); }
  }

  function startFrontend() {
    if (disposed || cf || !rtRef) { return; }
    var rt = rtRef;
    cf = rt.chatFrontend({
      chat: function () { return HDOC.getElementById('chat'); },
      getMessage: function (id) {
        var c = ctx(); var m = c && c.chat[id];
        if (!m) { return undefined; }
        var r = m.extra && typeof m.extra.reasoning === 'string' ? m.extra.reasoning : '';
        return { mes: String(m.mes || ''), isUser: !!m.is_user, isSystem: !!m.is_system, reasoning: r };
      },
      /* 统一管线：思维链 / 搜索资料 / 行动选项的内容交给酒馆自己的渲染（Markdown、HTML 美化、正则与正文一致） */
      format: function (md, o) {
        var c = ctx();
        if (!c || typeof c.messageFormatting !== 'function') { return null; }
        try { var m = c.chat[o.id]; return String(c.messageFormatting(md, m ? m.name : '', false, false, o.id, {}, !!o.reasoning)); } catch (e) { return null; }
      },
      skinColors: function () { try { return HOST.localStorage.getItem('kami.msg.skincolors') !== '0'; } catch (e) { return true; } },
      liveThink: function () { try { return HOST.KamiCot && typeof HOST.KamiCot.live === 'function' ? HOST.KamiCot.live() : null; } catch (e) { return null; } },
      count: function () { var c = ctx(); return c ? c.chat.length : 0; },
      /* 「正在生成」以停止键为准：酒馆统计提示词（dry run）时也发 GENERATION_STARTED，却没有对应的结束事件，
         拿事件记状态会一直卡在「生成中」（2026-10-28 实测）。事件只用来叫一次重画 */
      generating: stopVisible,
      onPick: function (item, mode) { if (mode === 'send') { send(item.content); } else { fill(item.content); } }
    });
    /* 先让「📄 正文外壳」「💭 思维链」收起已有的装饰（它们的 dress 看 active() 让位），再开始接管 */
    oldScripts('release');
    cf.start();
    log('启动 v' + VERSION + '：已接管 ' + cf.size + ' 处');
  }

  function stopFrontend() {
    if (!cf) { return; }
    try { cf.stop(); } catch (e) { }
    cf = null;
    oldScripts('scan');
    log('消息前端已关闭：交回酒馆与「📄 正文外壳」「💭 思维链」');
  }

  /* 显示面板的「消息前端」开关 */
  function setEnabled(v) {
    try { HOST.localStorage.setItem(ENABLE_KEY, v ? '1' : '0'); } catch (e) { }
    if (v) { startFrontend(); } else { stopFrontend(); }
    return true;
  }

  /* 运行库由另一个脚本加载，脚本是并行跑的：最多等 15 秒 */
  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var rt = HOST.KamiRuntimeNext;
    if (rt && rt.chatFrontend) { boot(rt); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到新运行库（🧪 新前端运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    unsubs.forEach(function (u) { try { u.stop(); } catch (e) { } });
    unsubs = [];
    if (cf) { try { cf.stop(); } catch (e) { } cf = null; oldScripts('scan'); }
    try { if (HOST.KamiChatFrontend && HOST.KamiChatFrontend.shutdown === shutdown) { delete HOST.KamiChatFrontend; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
