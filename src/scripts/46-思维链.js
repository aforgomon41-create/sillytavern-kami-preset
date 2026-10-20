/* ============================================================================
 * 卡密预设 · 思维链（v0.1）
 * ----------------------------------------------------------------------------
 * 用户 2026-10-19 裁定，本脚本只做两件事：
 *   ① 搬：流式生成时，一旦出现 `<nyaruko_think>` 开标签就把块内文本从正文流里扣走，
 *      闭标签出现就停止；消息落地后写进 `extra.reasoning`。块内那些未闭合的引用标签
 *      从此不进 message.mes，AI 输出正则永远看不到它们。
 *   ② 美化：给酒馆原生思维链块套上「显式思维链」同款前端；原生 summary 与
 *      编辑/删除/复制按钮全部保留（用户点名「原生入口要保留」）。
 *
 * 关键边界（都来自实际代码核对，不是猜的）：
 *   · 只搬完整闭合块。流结束还没闭合 → 扣住的内容原样放回正文，交给旧正则/40 号。
 *   · 管线复用 `_tag-response.js` 的方言适配，本脚本不写任何方言分支。
 *   · 顺序 15：20 号反截断（10）之后、40 号引用保护（20）之前。
 *   · 老楼层不迁移；旧「前端|显式思维链」iframe 正则继续兜底。
 *   · 原生块美化在父文档里做，直接复用 think 身份与 `.kami-*` 骨架；皮肤零改动。
 *
 * 关闭/删除脚本时：注销管线、摘监听、拆装饰、删样式、清全局，原生块恢复酒馆原样。
 * ========================================================================== */
(function () {
  /* @@KAMI_RESPONSE_PIPELINE@@ */
  /* @@KAMI_RESPONSE_TRANSPORT@@ */
  /* @@KAMI_TAG_RESPONSE@@ */
  /* @@KAMI_COT_STREAM@@ */
  /* @@KAMI_UI@@ */

  var VERSION = '0.1';
  var STASH_KEY = '__kamiCotStashV1';
  var ATTR = 'data-kami-native-think';
  var STYLE_ID = 'kami-cot-style';
  var API_NAME = 'KamiCot';
  var OPEN_KEY = 'kami.think.open';
  var VIEW_KEY = 'kami.think.view';
  var STASH_TTL = 120000;

  /* ───────── 宿主窗口与文档（与 40/45 号同一套取法） ───────── */
  function looksLikeTavern(w) {
    try {
      var d = w.document;
      if (!d) { return false; }
      if (d.getElementById('send_textarea')) { return true; }
      if (d.querySelector('#chat')) { return true; }
      if (d.querySelector('.mes_text')) { return true; }
      if (d.querySelector('#sheld')) { return true; }
    } catch (e) { }
    return false;
  }
  var HOST = (function () {
    var c = [window], i, w;
    try { if (window.parent && window.parent !== window) { c.push(window.parent); } } catch (e) { }
    try { if (window.top && window.top !== window && window.top !== window.parent) { c.push(window.top); } } catch (e) { }
    for (i = 0; i < c.length; i++) { if (looksLikeTavern(c[i])) { return c[i]; } }
    for (i = 0; i < c.length; i++) {
      w = c[i];
      try { if (w && w.document && w.document.documentElement) { return w; } } catch (e) { }
    }
    return window;
  })();
  var HDOC = null;
  try { HDOC = HOST.document; } catch (e) { HDOC = document; }

  var disposed = false;
  var unsubs = [], timers = [], records = [];
  var pipelineRelease = null;
  var scanTimer = null, refreshTimer = null;
  var chatObserver = null, skinObserver = null;
  var streamHint = null;

  function log(msg) {
    try { if (window.console && console.log) { console.log('[思维链] ' + msg); } } catch (e) { }
  }
  function later(fn, ms) {
    if (disposed) { return null; }
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) { timers.splice(i, 1); }
      if (!disposed) { fn(); }
    }, ms);
    timers.push(id);
    return id;
  }
  function cancelLater(id) {
    try { clearTimeout(id); } catch (e) { }
    var i = timers.indexOf(id);
    if (i >= 0) { timers.splice(i, 1); }
  }
  function el(tag, cls, text) {
    try { return createKamiUi(HDOC).element(tag, cls, text == null ? undefined : String(text)); } catch (e) { }
    var n = HDOC.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = String(text); }
    return n;
  }
  function keepSub(stop) {
    if (typeof stop === 'function') { unsubs.push({ stop: stop }); }
    else if (stop && typeof stop.stop === 'function') { unsubs.push(stop); }
  }
  function listen(ev, fn) {
    try {
      if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined' || !ev) { return; }
      keepSub(eventOn(ev, fn));
    } catch (e) { log('订阅事件失败：' + ((e && e.message) || e)); }
  }
  function store(key, val) {
    try {
      var ls = HOST.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!ls) { return null; }
      if (val === undefined) { return ls.getItem(key); }
      ls.setItem(key, val);
    } catch (e) { }
    return null;
  }
  function stCtx() {
    var cands = [], i;
    function push(o) { try { if (o && cands.indexOf(o) < 0) { cands.push(o); } } catch (e) { } }
    try { push(window.SillyTavern); } catch (e) { }
    try { push(HOST && HOST.SillyTavern); } catch (e) { }
    try { if (window.parent && window.parent !== window) { push(window.parent.SillyTavern); } } catch (e) { }
    try { if (window.top && window.top !== window) { push(window.top.SillyTavern); } } catch (e) { }
    for (i = 0; i < cands.length; i++) {
      try { if (typeof cands[i].getContext === 'function') { return cands[i].getContext(); } } catch (e) { }
    }
    return null;
  }
  function chatArray() {
    var c = stCtx();
    if (c && Array.isArray(c.chat)) { return c.chat; }
    try { if (typeof chat !== 'undefined' && Array.isArray(chat)) { return chat; } } catch (e) { }
    return null;
  }
  function msgAt(idx) {
    var arr = chatArray();
    return (arr && arr[idx]) ? arr[idx] : null;
  }
  function chatLen() {
    var c = stCtx();
    if (c && Array.isArray(c.chat)) { return c.chat.length; }
    try { var el2 = HDOC.getElementById('chat'); return el2 ? el2.querySelectorAll('.mes[mesid]').length : 0; } catch (e) { return 0; }
  }
  function mesElement(idx) {
    try { return HDOC.querySelector('#chat .mes[mesid="' + String(idx) + '"]'); } catch (e) { return null; }
  }
  function reasoningOf(idx) {
    var m = msgAt(idx);
    if (m && m.extra && typeof m.extra.reasoning === 'string') { return m.extra.reasoning; }
    var el2 = mesElement(idx);
    var node = el2 ? el2.querySelector('.mes_reasoning') : null;
    return node ? String(node.textContent || '') : '';
  }

  /* ───────── 管线：把 CoT 从正文流里扣走 ───────── */

  function readRequestBody(args) {
    var init = args[1];
    if (init && typeof init.body === 'string') {
      try { return JSON.parse(init.body); } catch (e) { return null; }
    }
    return null;
  }
  async function shouldProcess(args) {
    var body = readRequestBody(args);
    if (!body) {
      /* 拿不到 body（Request 对象等）：再试一次 clone().text()，不阻断正常生成。 */
      var input = args[0];
      if (input && typeof input.clone === 'function' && typeof input.text === 'function') {
        try { body = JSON.parse(await input.clone().text()); } catch (e) { body = null; }
      }
    }
    if (!body) { return true; }
    if (body._kami_native_probe || body._kami_background_task || body.should_silence) { return false; }
    if (typeof body.n === 'number' && body.n > 1) { return false; }
    if (body.type && ['normal', 'regenerate', 'swipe', 'continue'].indexOf(body.type) < 0) { return false; }
    if (Array.isArray(body.messages)) {
      for (var i = 0; i < body.messages.length; i++) {
        var row = body.messages[i];
        if (row && typeof row.content === 'string' && row.content.indexOf('__kami_search_private_') >= 0) { return false; }
      }
    }
    return true;
  }
  function stash(collector) {
    try { HOST[STASH_KEY] = collector; } catch (e) { }
  }
  function takeStash() {
    var c = null;
    try { c = HOST[STASH_KEY]; HOST[STASH_KEY] = null; } catch (e) { c = null; }
    if (!c) { return null; }
    var text = typeof c.text === 'string' ? c.text : '';
    var partial = typeof c.partial === 'string' ? c.partial : '';
    if (!text && !partial) { return null; }
    if (Date.now() - (c.at || 0) > STASH_TTL) { return null; }
    return c;
  }
  function clearStash() {
    hideStreamHint();
    try { if (HOST[STASH_KEY]) { HOST[STASH_KEY] = null; } } catch (e) { }
  }

  /* ───────── 流式搬运时的小提示（父文档消息里，跟皮肤走） ───────── */

  function lastMes() {
    try {
      var chat = HDOC.getElementById('chat');
      if (!chat) { return null; }
      var list = chat.querySelectorAll('.mes[mesid]');
      return list.length ? list[list.length - 1] : null;
    } catch (e) { return null; }
  }
  function hideStreamHint() {
    try {
      if (streamHint && streamHint.parentNode) {
        streamHint.parentNode.removeChild(streamHint);
        log('流式提示：收起');
      }
    } catch (e) { }
    streamHint = null;
  }
  function showStreamHint() {
    if (disposed) { return; }
    if (streamHint && streamHint.parentNode) { return; }
    var mes = lastMes();
    if (!mes || mes.getAttribute('is_user') === 'true') { return; }
    var block = mes.querySelector('.mes_block') || mes;
    var root = el('div', 'kami-root kami-stream-hint');
    root.setAttribute('data-kami-stream-hint', '1');
    root.setAttribute('data-kami-comp', 'think');
    root.setAttribute('data-kami-container', 'native');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    var chip = el('span', 'kami-chip');
    var spin = el('span', 'kami-cot-spin');
    spin.setAttribute('aria-hidden', 'true');
    var label = el('span', 'kami-title', '奈亚子思考中');
    chip.appendChild(spin);
    chip.appendChild(label);
    root.appendChild(chip);
    block.appendChild(root);
    streamHint = root;
    log('流式提示：显示（奈亚子思考中）');
  }
  function updateStreamHint(collector) {
    if (!collector) { return; }
    if (collector.diverting) { showStreamHint(); }
    else { hideStreamHint(); }
  }
  function makeCotStream(collector) {
    var inner = createCotStream(collector);
    return {
      push: function (text) {
        var out = inner.push(text);
        updateStreamHint(collector);
        return out;
      },
      finish: function () {
        var out = inner.finish();
        hideStreamHint();
        return out;
      },
      stats: inner.stats
    };
  }

  function installPipeline() {
    if (typeof kamiResponsePipeline !== 'function' || typeof createKamiResponseTransport !== 'function' ||
      typeof createTagReferenceResponse !== 'function' || typeof createCotStream !== 'function') {
      log('管线模块不可用，退到消息落地兜底');
      return;
    }
    try {
      var transport = createKamiResponseTransport();
      pipelineRelease = kamiResponsePipeline(HOST).register('cot-move', 15, async function (next, ctx, args) {
        var response = await next(args);
        if (disposed) { return response; }
        try { if (!(await shouldProcess(args))) { return response; } } catch (e) { return response; }
        var collector = newCotCollector();
        var rewrite = createTagReferenceResponse(transport,
          function () { return makeCotStream(collector); },
          function () { collector.done = true; });
        stash(collector);
        try {
          return await rewrite(response);
        } catch (e) {
          log('管线改写失败，原样放行：' + ((e && e.message) || e));
          return response;
        }
      });
      log('已注册响应管线 order 15（CoT 从正文流扣走）');
    } catch (e) {
      log('注册响应管线失败：' + ((e && e.message) || e));
      pipelineRelease = null;
    }
  }

  /* ───────── 消息落地：把扣住的文本写进 extra.reasoning ───────── */

  function scanText(text) {
    var collector = newCotCollector();
    var stream = createCotStream(collector);
    var cleaned = stream.push(String(text == null ? '' : text)) + stream.finish();
    return { cleaned: cleaned, collector: collector };
  }

  function commitReasoning(idx, stashText, fallback) {
    var msg = msgAt(idx);
    if (!msg || msg.is_user) { return null; }
    var extra = Object.assign({}, msg.extra || {});
    var prev = typeof extra.reasoning === 'string' ? extra.reasoning : '';
    var parts = [];
    if (stashText) { parts.push(stashText); }
    if (fallback && fallback.text) { parts.push(fallback.text); }
    var add = parts.join('\n\n').replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
    if (!add) { return null; }
    if (prev && prev.indexOf(add) >= 0) { return null; }
    extra.reasoning = prev ? (prev.replace(/[\s\u3000]+$/, '') + '\n\n' + add) : add;
    if (!extra.reasoning_type) { extra.reasoning_type = 'parsed'; }
    /* ⚠️ 酒馆助手的 setChatMessages 只有在载荷里带 message / data 时才走「普通消息」分支；
       只给 extra 会被当成 swipe 数据，extra 静默丢掉（2026-10-20 真机踩到）。
       所以这里始终带上当前正文：没改正文时原样写回，改了正文时写清理后的版本。 */
    var cleanedMessage = (fallback && fallback.cleaned !== null && fallback.cleaned !== undefined)
      ? fallback.cleaned
      : (typeof msg.mes === 'string' ? msg.mes : '');
    var wroteMessage = cleanedMessage !== (typeof msg.mes === 'string' ? msg.mes : '');
    var payload = { message_id: idx, message: cleanedMessage, extra: extra };
    var postRender = !!mesElement(idx);
    var write = null;
    try {
      if (typeof setChatMessages !== 'function') { log('拿不到 setChatMessages，放弃写回'); return null; }
      write = setChatMessages([payload], { refresh: 'none' });
    } catch (e) {
      log('写回失败：' + ((e && e.message) || e));
      return null;
    }
    return Promise.resolve(write).then(function () {
      if (disposed) { return; }
      var ctx = stCtx();
      try {
        if (postRender) { renderReasoning(idx, wroteMessage, ctx); }
      } catch (e) { log('重画失败：' + ((e && e.message) || e)); }
      scheduleScan(40);
      log('第 ' + (idx + 1) + ' 楼：思维链已搬到原生块（' + add.length + ' 字）');
    });
  }

  /* 让原生块按 extra.reasoning 重画。优先用酒馆上下文里的现成入口；
     拿不到就退回 updateMessageBlock，最后才手写 .mes_reasoning（内容仍走 messageFormatting，不塞外部文本）。 */
  function renderReasoning(idx, wroteMessage, ctx) {
    ctx = ctx || stCtx();
    var mes = mesElement(idx);
    if (!mes) { return; }
    if (wroteMessage && ctx && typeof ctx.updateMessageBlock === 'function') {
      ctx.updateMessageBlock(idx, msgAt(idx));
      return;
    }
    if (ctx && typeof ctx.updateReasoningUI === 'function') {
      ctx.updateReasoningUI(idx);
      return;
    }
    if (ctx && typeof ctx.updateMessageBlock === 'function') {
      ctx.updateMessageBlock(idx, msgAt(idx));
      return;
    }
    var node = mes.querySelector('.mes_reasoning');
    var extra = msgAt(idx) && msgAt(idx).extra;
    if (!node || !extra || typeof extra.reasoning !== 'string' || !extra.reasoning) { return; }
    var html = '';
    if (ctx && typeof ctx.messageFormatting === 'function') {
      html = ctx.messageFormatting(extra.reasoning, '', false, false, idx, {}, true);
    }
    if (html) {
      node.innerHTML = html;
      mes.classList.add('reasoning');
    }
  }

  function onMessageReceived(id) {
    hideStreamHint();
    if (disposed) { return; }
    var idx = (typeof id === 'number' && isFinite(id)) ? id : (chatLen() - 1);
    if (idx < 0) { return; }
    var msg = msgAt(idx);
    if (!msg || msg.is_user) { return; }
    var stashData = takeStash();
    var stashText = stashData ? stashData.text : '';
    /* 中止/出错时管线没机会走 finish：把已经扣住的部分写进原生块，避免丢字。 */
    if (!stashText && stashData && stashData.partial) { stashText = stashData.partial; }
    var fallback = null;
    var raw = typeof msg.mes === 'string' ? msg.mes : '';
    if (raw && raw.indexOf(COT_OPEN) >= 0) {
      var scanned = scanText(raw);
      if (scanned.collector.closed > 0 && scanned.collector.text) {
        fallback = { text: scanned.collector.text, cleaned: scanned.cleaned };
      }
    }
    if (!stashText && !fallback) { return; }
    return commitReasoning(idx, stashText, fallback);
  }

  /* ───────── 原生块美化（父文档、复用 think 身份） ───────── */

  var STRUCT_CSS = [
    '[' + ATTR + '] > summary{list-style:none;margin:0 !important;}',
    '[' + ATTR + '] > summary::-webkit-details-marker{display:none;}',
    '[' + ATTR + '] > summary::marker{content:"";}',
    '[' + ATTR + '] .mes_reasoning_header{padding:0 !important;margin:0 !important;background:none !important;border:0 !important;border-radius:0 !important;position:static !important;cursor:inherit !important;width:100%;box-sizing:border-box;}',
    '[' + ATTR + '] .mes_reasoning_header_block{flex:1 1 100%;min-width:0;}',
    '[' + ATTR + '] .mes_reasoning_header_title,[' + ATTR + '] .mes_reasoning_arrow{display:none !important;}',
    '[' + ATTR + '] .mes_reasoning{border:0 !important;padding:0 !important;margin:0 !important;background:none !important;max-width:none !important;overflow:visible !important;}',
    '[' + ATTR + '] .mes_reasoning_actions{margin-left:auto;}',
    '[' + ATTR + '].kami-collapse[data-kami-open="0"] > .kami-collapse-body{display:none;}',
    '[' + ATTR + '].kami-collapse[data-kami-open="1"] > .kami-collapse-body{display:block;}',
    '[' + ATTR + '][data-kami-view="raw"] [data-kami-view="render"]{display:none !important;}',
    '[' + ATTR + '][data-kami-view="render"] [data-kami-view="raw"]{display:none !important;}',
    '[' + ATTR + '] .kami-raw{margin:0;}',
    '[data-kami-stream-hint]{margin:6px 0 !important;max-width:none !important;}',
    '[data-kami-stream-hint] .kami-chip{display:inline-flex;align-items:center;gap:6px;}',
    '[data-kami-stream-hint] .kami-cot-spin{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;display:inline-block;animation:kami-cot-spin .8s linear infinite;}',
    '@keyframes kami-cot-spin{to{transform:rotate(360deg)}}'
  ].join('');

  function injectCss() {
    try {
      if (HDOC.getElementById(STYLE_ID)) { return; }
      var st = HDOC.createElement('style');
      st.id = STYLE_ID;
      st.textContent = STRUCT_CSS;
      (HDOC.head || HDOC.documentElement).appendChild(st);
    } catch (e) { log('注入结构样式失败：' + ((e && e.message) || e)); }
  }
  function dropCss() {
    try { var st = HDOC.getElementById(STYLE_ID); if (st && st.parentNode) { st.parentNode.removeChild(st); } } catch (e) { }
  }

  var RE_TRIM = /^[\s\u3000]+|[\s\u3000]+$/g;
  function labelVar(root, name) {
    var v = '';
    try {
      var gcs = (HOST && typeof HOST.getComputedStyle === 'function') ? HOST.getComputedStyle : getComputedStyle;
      v = gcs(root).getPropertyValue('--kami-label-' + name);
    } catch (e) { return ''; }
    v = String(v || '').replace(RE_TRIM, '');
    if (v.length > 1) {
      var a = v.charAt(0), b = v.charAt(v.length - 1);
      if ((a === '"' && b === '"') || (a === "'" && b === "'")) { v = v.slice(1, -1).replace(RE_TRIM, ''); }
    }
    return v;
  }
  function countText(raw) {
    return String(raw || '').replace(/\s+/g, '').length;
  }
  function applyLabels(rec) {
    if (!rec || !rec.details) { return; }
    var open = rec.details.open;
    var tok = open ? (labelVar(rec.details, 'think-title-open') || labelVar(rec.details, 'think-title')) : labelVar(rec.details, 'think-title');
    rec.title.textContent = tok || '思维链';
    rec.title.setAttribute('data-kami-label', 'think-title');
    if (open) { rec.title.setAttribute('data-kami-label-open', 'think-title-open'); }
    rec.chev.textContent = '▸';
  }
  function refreshRecord(rec) {
    if (!rec || disposed) { return; }
    var raw = reasoningOf(rec.idx);
    var count = countText(raw);
    rec.sub.textContent = count ? (count + ' ' + '字') : '';
    if (rec.rawEl && rec.rawEl.textContent !== raw) { rec.rawEl.textContent = raw; }
    applyLabels(rec);
  }
  function setView(rec, view) {
    var v = view === 'raw' ? 'raw' : 'render';
    rec.details.setAttribute('data-kami-view', v);
    rec.btnRender.classList.toggle('is-on', v === 'render');
    rec.btnRaw.classList.toggle('is-on', v === 'raw');
    store(VIEW_KEY, v);
  }
  function findRecord(details) {
    for (var i = 0; i < records.length; i++) { if (records[i].details === details) { return records[i]; } }
    return null;
  }
  function undress(details) {
    var rec = findRecord(details);
    if (!rec) { return; }
    try {
      if (rec.observer) { rec.observer.disconnect(); }
      if (rec.onToggle) { details.removeEventListener('toggle', rec.onToggle); }
      if (rec.onHeadClick) { rec.summary.removeEventListener('click', rec.onHeadClick); }
      if (rec.onRender) { rec.btnRender.removeEventListener('click', rec.onRender); }
      if (rec.onRaw) { rec.btnRaw.removeEventListener('click', rec.onRaw); }
      /* 原生三按钮搬回 summary；思维链节点搬回 details，再拆外壳。 */
      if (rec.nativeActions && rec.nativeActions.parentNode) {
        if (rec.actionsHome) { rec.actionsHome.insertBefore(rec.nativeActions, rec.actionsNext || null); }
        else { rec.nativeActions.parentNode.removeChild(rec.nativeActions); }
      }
      if (rec.reasoning && rec.wrapper) { details.insertBefore(rec.reasoning, rec.wrapper); }
      if (rec.wrapper && rec.wrapper.parentNode) { rec.wrapper.parentNode.removeChild(rec.wrapper); }
      if (rec.title && rec.title.parentNode) { rec.title.parentNode.removeChild(rec.title); }
      if (rec.dot && rec.dot.parentNode) { rec.dot.parentNode.removeChild(rec.dot); }
      if (rec.actions && rec.actions.parentNode) { rec.actions.parentNode.removeChild(rec.actions); }
      if (rec.rootWrap && rec.rootWrap.parentNode) {
        rec.rootWrap.parentNode.insertBefore(details, rec.rootWrap);
        rec.rootWrap.parentNode.removeChild(rec.rootWrap);
      }
      if (rec.reasoning) {
        rec.reasoning.classList.remove('kami-md');
        rec.reasoning.removeAttribute('data-kami-view');
      }
      details.classList.remove('kami-root', 'kami-shell', 'kami-surface', 'kami-collapse');
      details.removeAttribute('data-kami-comp');
      details.removeAttribute('data-kami-container');
      details.removeAttribute('data-kami-view');
      details.removeAttribute('data-kami-open');
      details.removeAttribute(ATTR);
      if (rec.summary) { rec.summary.classList.remove('kami-head', 'kami-collapse-head'); }
    } catch (e) { log('还原原生块失败：' + ((e && e.message) || e)); }
    var at = records.indexOf(rec);
    if (at >= 0) { records.splice(at, 1); }
  }
  function undressAll() {
    for (var i = records.length - 1; i >= 0; i--) { undress(records[i].details); }
    records = [];
  }

  function dress(mes) {
    if (disposed || !mes) { return; }
    var details = mes.querySelector('details.mes_reasoning_details');
    if (!details) { return; }
    var idx = Number(mes.getAttribute('mesid'));
    if (!isFinite(idx) || idx < 0) { return; }
    var raw = reasoningOf(idx);
    var existing = findRecord(details);
    if (existing) { refreshRecord(existing); return; }
    if (!raw) { return; }
    var summary = details.querySelector('.mes_reasoning_summary') || details.querySelector('summary');
    var header = details.querySelector('.mes_reasoning_header') || summary;
    var reasoning = details.querySelector('.mes_reasoning');
    var nativeActions = details.querySelector('.mes_reasoning_actions');
    if (!summary || !reasoning || !details.parentNode) { return; }
    try { mes.classList.add('reasoning'); } catch (e) { }

    /* 原生 details 自己不能同时当 .kami-root 和 .kami-shell：皮肤的
       `.kami-root … .kami-shell` 是后代选择器，同元素不匹配，色块等皮肤就丢边框。
       外面再套一层 .kami-root，details 只当 shell/surface，皮肤规则才能命中。 */
    var rootWrap = el('div', 'kami-root');
    rootWrap.setAttribute('data-kami-comp', 'think');
    rootWrap.setAttribute('data-kami-container', 'native');
    details.parentNode.insertBefore(rootWrap, details);
    rootWrap.appendChild(details);

    details.setAttribute(ATTR, '1');
    details.classList.add('kami-shell', 'kami-surface', 'kami-collapse');
    summary.classList.add('kami-head', 'kami-collapse-head');

    var dot = el('span', 'kami-dot');
    var title = el('span', 'kami-title', '思维链');
    title.setAttribute('data-kami-slot', 'think-title');
    var actions = el('span', 'kami-actions');
    var sub = el('span', 'kami-sub');
    var chev = el('span', 'kami-chev', '▸');
    chev.setAttribute('aria-hidden', 'true');
    actions.appendChild(sub);
    actions.appendChild(chev);
    header.appendChild(dot);
    header.appendChild(title);
    header.appendChild(actions);

    var wrapper = el('div', 'kami-collapse-body');
    details.insertBefore(wrapper, summary.nextSibling);
    var mdWrap = el('div', 'kami-md');
    mdWrap.setAttribute('data-kami-view', 'render');
    mdWrap.appendChild(reasoning);
    var rawEl = el('pre', 'kami-raw', raw);
    rawEl.setAttribute('data-kami-view', 'raw');
    var bar = el('div', 'kami-bar');
    var seg = el('span', 'kami-seg');
    var btnRender = el('button', 'kami-seg-item is-on', '渲染');
    var btnRaw = el('button', 'kami-seg-item', '原文');
    btnRender.type = 'button'; btnRaw.type = 'button';
    btnRender.setAttribute('data-kami-mode', 'render');
    btnRaw.setAttribute('data-kami-mode', 'raw');
    seg.appendChild(btnRender); seg.appendChild(btnRaw);
    bar.appendChild(seg);
    /* 原生三个按钮（折叠全部 / 复制 / 编辑）搬到渲染/原文这一行，标题栏只留我们的样式。 */
    var actionsHome = nativeActions ? nativeActions.parentNode : null;
    var actionsNext = nativeActions ? nativeActions.nextSibling : null;
    if (nativeActions) { bar.appendChild(nativeActions); }
    wrapper.appendChild(bar);
    wrapper.appendChild(mdWrap);
    wrapper.appendChild(rawEl);

    var storedOpen = store(OPEN_KEY);
    if (storedOpen === '1') { details.setAttribute('open', ''); }
    else if (storedOpen === '0') { details.removeAttribute('open'); }
    var open = !!details.open;
    details.setAttribute('data-kami-open', open ? '1' : '0');

    var rec = {
      details: details, summary: summary, reasoning: reasoning, wrapper: wrapper, mdWrap: mdWrap, rootWrap: rootWrap,
      nativeActions: nativeActions, actionsHome: actionsHome, actionsNext: actionsNext,
      rawEl: rawEl, sub: sub, title: title, chev: chev, dot: dot, actions: actions,
      btnRender: btnRender, btnRaw: btnRaw, idx: idx, observer: null, onToggle: null, onRender: null, onRaw: null, onHeadClick: null
    };
    records.push(rec);

    rec.onToggle = function () {
      if (disposed) { return; }
      var isOpen = !!details.open;
      details.setAttribute('data-kami-open', isOpen ? '1' : '0');
      applyLabels(rec);
      store(OPEN_KEY, isOpen ? '1' : '0');
    };
    details.addEventListener('toggle', rec.onToggle);
    /* 整条标题栏都能点：拦掉 summary 的默认切换，自己翻转；按钮/输入框/原生操作区除外。 */
    rec.onHeadClick = function (ev) {
      if (disposed) { return; }
      if (details.querySelector('.reasoning_edit_textarea')) { return; }
      var t = ev.target;
      if (t && t.nodeType !== 1) { t = t.parentElement; }
      if (t && t.closest && t.closest('button, a, input, textarea, select, .mes_reasoning_actions, .kami-seg')) { return; }
      ev.preventDefault();
      details.open = !details.open;
    };
    summary.addEventListener('click', rec.onHeadClick);
    rec.onRender = function (ev) { if (ev) { ev.stopPropagation(); ev.preventDefault(); } setView(rec, 'render'); };
    rec.onRaw = function (ev) { if (ev) { ev.stopPropagation(); ev.preventDefault(); } setView(rec, 'raw'); };
    btnRender.addEventListener('click', rec.onRender);
    btnRaw.addEventListener('click', rec.onRaw);

    var view = store(VIEW_KEY) === 'raw' ? 'raw' : 'render';
    setView(rec, view);
    applyLabels(rec);
    refreshRecord(rec);

    try {
      if (HOST.MutationObserver) {
        rec.observer = new HOST.MutationObserver(function () {
          if (disposed) { return; }
          if (refreshTimer) { return; }
          refreshTimer = later(function () { refreshTimer = null; refreshRecord(rec); }, 160);
        });
        rec.observer.observe(reasoning, { childList: true, subtree: true, characterData: true });
      }
    } catch (e) { }
  }

  function scan() {
    if (disposed) { return; }
    try {
      var chat = HDOC.getElementById('chat');
      if (!chat) { return; }
      var list = chat.querySelectorAll('.mes[mesid]');
      for (var i = 0; i < list.length; i++) { dress(list[i]); }
    } catch (e) { log('扫描失败：' + ((e && e.message) || e)); }
  }
  function scheduleScan(ms) {
    if (disposed) { return; }
    if (scanTimer) { return; }
    scanTimer = later(function () { scanTimer = null; scan(); }, ms || 120);
  }

  /* ───────── 事件 ───────── */

  function bindEvents() {
    if (typeof tavern_events === 'undefined') { log('拿不到 tavern_events，只靠 DOM 兜底'); }
    else {
      listen(tavern_events.MESSAGE_RECEIVED, onMessageReceived);
      [tavern_events.MESSAGE_RENDERED, tavern_events.CHARACTER_MESSAGE_RENDERED,
        tavern_events.USER_MESSAGE_RENDERED, tavern_events.MESSAGE_UPDATED,
        tavern_events.MESSAGE_SWIPED, tavern_events.MESSAGE_REASONING_EDITED,
        tavern_events.MESSAGE_REASONING_DELETED, tavern_events.STREAM_REASONING_DONE,
        tavern_events.GENERATION_ENDED].forEach(function (ev) {
          if (!ev) { return; }
          listen(ev, function () { hideStreamHint(); scheduleScan(80); });
        });
      listen(tavern_events.CHAT_CHANGED, function () { clearStash(); scheduleScan(120); });
      listen(tavern_events.GENERATION_STARTED, function () { clearStash(); scheduleScan(60); });
    }
    /* 新楼层/重渲染：只看新增节点里有没有消息或原生块，避免流式期间全量重扫。 */
    try {
      var chat = HDOC.getElementById('chat');
      if (chat && HOST.MutationObserver) {
        var queued = false;
        chatObserver = new HOST.MutationObserver(function (changes) {
          if (disposed || queued) { return; }
          var hit = false;
          for (var i = 0; i < changes.length && !hit; i++) {
            var added = changes[i].addedNodes || [];
            for (var j = 0; j < added.length; j++) {
              var n = added[j];
              if (n.nodeType === 1 && ((n.matches && (n.matches('.mes') || n.matches('.mes_reasoning_details'))) ||
                (n.querySelector && (n.querySelector('.mes') || n.querySelector('.mes_reasoning_details'))))) { hit = true; break; }
            }
          }
          if (!hit) { return; }
          queued = true;
          later(function () { queued = false; scheduleScan(60); }, 180);
        });
        chatObserver.observe(chat, { childList: true, subtree: true });
      }
    } catch (e) { log('订阅 DOM 变化失败：' + ((e && e.message) || e)); }
    /* 切皮肤/明暗时重读文案令牌 */
    try {
      if (HOST.MutationObserver && HDOC.documentElement) {
        skinObserver = new HOST.MutationObserver(function () {
          for (var i = 0; i < records.length; i++) { applyLabels(records[i]); }
        });
        skinObserver.observe(HDOC.documentElement, {
          attributes: true,
          attributeFilter: ['data-kami-skin', 'data-kami-scheme', 'data-kami-density', 'data-kami-motion', 'data-kami-effects']
        });
      }
    } catch (e) { }
  }

  /* ───────── 全局 API / 注销 / 启动 ───────── */

  function expose() {
    var api = {
      version: VERSION,
      scan: scan,
      status: function () {
        return {
          version: VERSION, decorated: records.length,
          pipeline: !!pipelineRelease, chat: !!HDOC.getElementById('chat'),
          stash: (function () { try { return HOST[STASH_KEY] ? HOST[STASH_KEY].text.length : 0; } catch (e) { return -1; } })()
        };
      },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    hideStreamHint();
    log('正在注销：收管线 / 摘监听 / 拆装饰 / 删样式');
    try { if (pipelineRelease) { pipelineRelease(); pipelineRelease = null; } } catch (e) { }
    for (var i = 0; i < unsubs.length; i++) { try { if (unsubs[i] && unsubs[i].stop) { unsubs[i].stop(); } } catch (e) { } }
    unsubs = [];
    if (scanTimer) { cancelLater(scanTimer); scanTimer = null; }
    if (refreshTimer) { cancelLater(refreshTimer); refreshTimer = null; }
    try { if (chatObserver) { chatObserver.disconnect(); chatObserver = null; } } catch (e) { }
    try { if (skinObserver) { skinObserver.disconnect(); skinObserver = null; } } catch (e) { }
    undressAll();
    dropCss();
    clearStash();
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    log('注销完成：原生块已还原，管线与监听已收回');
  }

  var hideHandler = null;
  function boot() {
    log('启动 v' + VERSION);
    injectCss();
    installPipeline();
    bindEvents();
    later(function () { scan(); }, 300);
    later(function () { scan(); }, 1200);
    expose();
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
  }

  try { boot(); } catch (e) { console.error('[思维链] 启动失败', e); }
})();
