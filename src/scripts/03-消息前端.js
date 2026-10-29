/* 🧪 消息前端 v0.1（frontend-rewrite 支线测试）
 * ------------------------------------------------------------------
 * 用新运行库（KamiRuntimeNext）的 chatFrontend 渲染每条 AI 回复：正文 / 思维链 / 搜索资料 / 行动选项（前端重构-消息前端方案，用户拍板 A–F）。
 * 取代旧的「📄 正文外壳」与「💭 思维链」：支线上「💭 思维链」默认关闭；正文外壳与旧的正则前端还在 .mes_text 里，但 .mes_text 被藏起来，看不到。
 * 皮肤：新皮肤管理还没做，先固定用内置的「碎光」，跟随系统明暗。
 * 关闭 / 删除本脚本：pagehide 时 stop()——宿主节点、标记、宿主样式全部移除，酒馆恢复原样。
 */
(function () {
  /* @@KAMI_SKINS_NEXT@@ */
  var VERSION = '0.1';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var HDOC = HOST.document;
  var disposed = false, cf = null, unsubs = [], timer = null;
  function log(msg) { try { console.log('[消息前端] ' + msg); } catch (e) { } }

  function ctx() { try { return SillyTavern.getContext(); } catch (e) { return null; } }
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
    var skin = (SKINS_NEXT || []).filter(function (s) { return s.manifest && s.manifest.id === 'suiguang'; })[0];
    if (skin) {
      try { rt.applySkin(skin.manifest, { scheme: 'auto', density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss: skin.css, assetUrls: skin.assetUrls }); }
      catch (e) { log('套皮肤失败，用运行库内置兜底：' + e.message); }
    }
    cf = rt.chatFrontend({
      chat: function () { return HDOC.getElementById('chat'); },
      getMessage: function (id) { var c = ctx(); var m = c && c.chat[id]; return m ? { mes: String(m.mes || ''), isUser: !!m.is_user, isSystem: !!m.is_system } : undefined; },
      count: function () { var c = ctx(); return c ? c.chat.length : 0; },
      /* 「正在生成」以停止键为准：酒馆统计提示词（dry run）时也发 GENERATION_STARTED，却没有对应的结束事件，
         拿事件记状态会一直卡在「生成中」（2026-10-28 实测）。事件只用来叫一次重画 */
      generating: stopVisible,
      onPick: function (item, mode) { if (mode === 'send') { send(item.content); } else { fill(item.content); } }
    });
    cf.start();
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      var on = function (name, fn) { var ev = tavern_events[name]; if (!ev) { return; } try { var s = eventOn(ev, fn); if (s) { unsubs.push(s); } } catch (e) { } };
      on('GENERATION_STARTED', function () { cf.refresh(); });
      ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'].forEach(function (n) { on(n, function () { cf.refresh(); setTimeout(function () { if (cf) { cf.refresh(); } }, 300); }); });
      ['MESSAGE_RECEIVED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'STREAM_TOKEN_RECEIVED'].forEach(function (n) { on(n, function () { cf.refresh(); }); });
    }
    try { HOST.KamiChatFrontend = { version: VERSION, instance: cf, shutdown: shutdown }; } catch (e) { }
    log('启动 v' + VERSION + '：已接管 ' + cf.size + ' 条回复');
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
    if (cf) { try { cf.stop(); } catch (e) { } cf = null; }
    try { if (HOST.KamiChatFrontend && HOST.KamiChatFrontend.shutdown === shutdown) { delete HOST.KamiChatFrontend; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
