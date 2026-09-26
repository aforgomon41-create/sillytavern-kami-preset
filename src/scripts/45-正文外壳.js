/* ============================================================================
 * 卡密预设 · 正文外壳（v0.1）
 * ----------------------------------------------------------------------------
 * 它要解决什么（2026-09-26 用户两条质疑的结论）：
 *   老做法是把 `<content>…</content>` 整段换成一份 HTML 文档，由酒馆助手渲染成消息楼层里的 **iframe**。
 *   副作用是**正文从此不在聊天页的 DOM 里** —— 于是所有「在正文里就地插入生图按钮」的插件都失效：
 *     · 标签识别型（RBQ）：扫父文档找不到标签，一个按钮都不插；
 *     · DOM 插入型：操作的 DOM 里根本没有正文那一段。
 *   影子文本 / 调插件 API 都只是**治标**（按钮会挤在一处、且每来一支新插件都要再适配一次）。
 *
 * 现在换了落脚点：**正文留在聊天页的 DOM 里，只给它套一层我们自己的外壳**。
 *   ① 正则（「前端|正文 v0.1」）把 `<content>X</content>` 换成
 *      `<div data-kami-body-start></div>\n\n X \n\n<div data-kami-body-end></div>`
 *      —— 两个空标记夹住正文，**正文本身一个字符都不动**，交回酒馆自己的 markdown 渲染
 *      （离线实测：用单个 div 把正文包在里面，showdown 会把里面的 markdown 全部当原文不渲染；
 *        夹两个空标记才既能定位、又不破坏渲染。守卫见 build/verify-body-shell.mjs）。
 *   ② 本脚本在每个楼层找到这一对标记，把两个标记之间的节点整体搬进外壳的正文区。
 *   → 插件看到的仍然是一份「没被动过手脚的普通消息」：
 *     标签识别型在自己原来的位置就地插按钮（**按钮散布在正文对应位置**），
 *     DOM 插入型照常工作，将来任何新插件都不需要我们再改一行。
 *
 * 与前身的差异（要如实记住）：
 *   · 没有 iframe ⇒ 没有 `srcdoc` ⇒ RBQ 深度模式那把「改写整块 innerHTML 把载荷打坏」的刀砍不到我们；
 *   · 也没有 iframe 的隔离 ⇒ 本组件直接活在聊天页里，样式靠 `html[data-kami-skin] .kami-root …`
 *     收口（与四块面板同一套机制），**不得**给 `.kami-root` 以外的任何东西写样式；
 *   · 「渲染 / 原文」双视图靠契约既有的 `data-kami-view` 规则切换，原文单独存一份 markdown。
 *
 * 复用已登记类名与令牌，零新增：.kami-root / .kami-shell / .kami-surface / .kami-head /
 * .kami-title / .kami-sub / .kami-actions / .kami-seg / .kami-seg-item / .kami-btn /
 * .kami-btn--ghost / .kami-body / .kami-raw / .kami-toast。
 * ========================================================================== */
(function () {
  var NL = String.fromCharCode(10);
  var VERSION = '0.1';
  var MARK_START = 'data-kami-body-start';
  var MARK_END = 'data-kami-body-end';
  var HOST_ATTR = 'data-kami-body-host';
  var Z = 1;

  /* 宿主窗口：酒馆助手把脚本放进 iframe 跑，DOM 要建在父窗口（与四块面板同一套取法） */
  var HOST = (function () {
    try {
      if (window.parent && window.parent !== window && window.parent.document) { return window.parent; }
    } catch (e) { }
    return window;
  })();
  var HDOC = HOST.document;

  function log(msg) { try { if (window.console && console.log) { console.log('[正文外壳] ' + msg); } } catch (e) { } }
  function warn(msg) { log('⚠ ' + msg); }

  function el(tag, cls, text) {
    var n = HDOC.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null && text !== '') { n.textContent = String(text); }
    return n;
  }

  /* ───────── 读原文：正文只从聊天数组里取（DOM 那份是酒馆渲染过的，不能当原文用） ───────── */
  function stCtx() {
    try {
      if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) { return SillyTavern.getContext(); }
    } catch (e) { }
    return null;
  }
  function chatArray() {
    var c = stCtx();
    if (c && Array.isArray(c.chat)) { return c.chat; }
    try { if (typeof chat !== 'undefined' && Array.isArray(chat)) { return chat; } } catch (e) { }
    return null;
  }
  function rawOf(mesid) {
    var arr = chatArray();
    if (!arr) { return null; }
    var m = arr[Number(mesid)];
    return m && typeof m.mes === 'string' ? m.mes : null;
  }
  /* 从原文里抠出 <content>…</content> 的内容（找不到就退回整段原文，别让「原文」视图空着） */
  function bodyOf(raw) {
    if (typeof raw !== 'string') { return ''; }
    var m = /<content>([\s\S]*?)<\/content>/.exec(raw);
    return m ? m[1] : raw;
  }
  function charCount(s) {
    /* 字数：按「非空白字符」数，中文一个字算一个（与思维链那块的算法保持同一个口径） */
    return String(s || '').replace(/\s+/g, '').length;
  }

  /* ───────── 建外壳 ───────── */
  function buildShell(mesid) {
    var raw = rawOf(mesid) || '';
    var body = bodyOf(raw);
    var root = el('div', 'kami-root');
    root.setAttribute('data-kami-comp', 'body');
    root.setAttribute('data-kami-view', 'render');
    root.setAttribute(HOST_ATTR, String(mesid));
    root.style.zIndex = String(Z);

    var shell = el('div', 'kami-shell kami-surface');
    root.appendChild(shell);

    var head = el('div', 'kami-head');
    head.appendChild(el('span', 'kami-title', '正文'));
    var sub = el('span', 'kami-sub', charCount(body) + ' 字');
    head.appendChild(sub);
    var acts = el('span', 'kami-actions');
    var seg = el('span', 'kami-seg');
    var btnRender = el('button', 'kami-seg-item is-on', '渲染');
    var btnRaw = el('button', 'kami-seg-item', '原文');
    btnRender.type = 'button'; btnRaw.type = 'button';
    btnRender.setAttribute('data-kami-view-btn', 'render');
    btnRaw.setAttribute('data-kami-view-btn', 'raw');
    seg.appendChild(btnRender); seg.appendChild(btnRaw);
    acts.appendChild(seg);
    var btnCopy = el('button', 'kami-btn kami-btn--ghost', '复制');
    btnCopy.type = 'button';
    btnCopy.setAttribute('data-kami-body-copy', '1');
    acts.appendChild(btnCopy);
    head.appendChild(acts);
    shell.appendChild(head);

    var bodyBox = el('div', 'kami-body');
    var renderBox = el('div', 'kami-body-render');
    renderBox.setAttribute('data-kami-view', 'render');
    var rawBox = el('pre', 'kami-raw', body);
    rawBox.setAttribute('data-kami-view', 'raw');
    rawBox.setAttribute('hidden', '');
    bodyBox.appendChild(renderBox);
    bodyBox.appendChild(rawBox);
    shell.appendChild(bodyBox);

    var toast = el('div', 'kami-toast', '');
    toast.setAttribute('hidden', '');
    shell.appendChild(toast);

    /* 交互：双视图切换 + 复制（复制的是原文 markdown） */
    function paintView(v) {
      root.setAttribute('data-kami-view', v);
      btnRender.classList.toggle('is-on', v === 'render');
      btnRaw.classList.toggle('is-on', v === 'raw');
      if (v === 'raw') { rawBox.removeAttribute('hidden'); } else { rawBox.setAttribute('hidden', ''); }
    }
    btnRender.addEventListener('click', function () { paintView('render'); });
    btnRaw.addEventListener('click', function () { paintView('raw'); });
    btnCopy.addEventListener('click', function () {
      var text = rawBox.textContent || '';
      var done = function (ok) {
        toast.textContent = ok ? '已复制原文' : '复制失败，请手动选中';
        toast.removeAttribute('hidden');
        setTimeout(function () { toast.setAttribute('hidden', ''); }, 1400);
      };
      try {
        var nav = HOST.navigator || navigator;
        if (nav && nav.clipboard && nav.clipboard.writeText) {
          nav.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else {
          var ta = HDOC.createElement('textarea');
          ta.value = text;
          HDOC.body.appendChild(ta);
          ta.select();
          var ok = false;
          try { ok = HDOC.execCommand('copy'); } catch (e) { }
          HDOC.body.removeChild(ta);
          done(ok);
        }
      } catch (e) { done(false); }
    });

    return { root: root, renderBox: renderBox, sub: sub, rawBox: rawBox };
  }

  /* ───────── 给一个楼层套壳 ───────── */
  function dress(mes) {
    var mesid = mes.getAttribute('mesid');
    if (mesid === null || mesid === '') { return 0; }
    if (mes.querySelector('[' + HOST_ATTR + ']')) { return 0; }   /* 已经套过了，不重复搬节点 */
    var start = mes.querySelector('[' + MARK_START + ']');
    var end = mes.querySelector('[' + MARK_END + ']');
    if (!start || !end) { return 0; }
    /* 两个标记必须同层（正则生成的兄弟关系）；不同层就放弃，别乱搬 */
    if (start.parentNode !== end.parentNode) { warn('楼层 ' + mesid + ' 的两个标记不在同一层，跳过'); return 0; }

    /* 收集两个标记之间的节点（不含标记本身） */
    var picked = [], n = start.nextSibling;
    while (n && n !== end) { picked.push(n); n = n.nextSibling; }

    var built = buildShell(mesid);
    /* 把正文节点整体搬进正文区 —— **不重新渲染**，原样搬过去。
       插件的按钮如果在搬之前就已经插在这儿，会被一起搬进来，位置也不变。 */
    for (var i = 0; i < picked.length; i++) { built.renderBox.appendChild(picked[i]); }
    start.parentNode.insertBefore(built.root, start);
    /* 标记自己收掉：留着会在「原文」视图里露出来 */
    start.parentNode.removeChild(start);
    end.parentNode.removeChild(end);
    /* 搬完之后正文区可能只剩空白，收一下（否则外壳顶上多出一段空白） */
    if (!String(built.renderBox.textContent || '').trim() && built.renderBox.children.length === 0) {
      built.renderBox.appendChild(el('p', 'kami-empty', '这一楼没有正文内容'));
    }
    return 1;
  }

  function scan() {
    var out = 0;
    try {
      var chat = HDOC.getElementById('chat');
      if (!chat) { return 0; }
      var list = chat.querySelectorAll('.mes[' + 'mesid' + ']');
      for (var i = 0; i < list.length; i++) { out += dress(list[i]); }
    } catch (e) { warn('扫描失败：' + ((e && e.message) || e)); }
    return out;
  }

  /* 刷新外壳里的「字数」与「原文」（用户编辑过消息、或重新渲染之后要跟上） */
  function refresh() {
    try {
      var chat = HDOC.getElementById('chat');
      if (!chat) { return; }
      var roots = chat.querySelectorAll('[' + HOST_ATTR + ']');
      for (var i = 0; i < roots.length; i++) {
        var mesid = roots[i].getAttribute(HOST_ATTR);
        var body = bodyOf(rawOf(mesid) || '');
        var sub = roots[i].querySelector('.kami-sub');
        if (sub) { sub.textContent = charCount(body) + ' 字'; }
        var rb = roots[i].querySelector('[data-kami-view="raw"]');
        if (rb && rb.textContent !== body) { rb.textContent = body; }
      }
    } catch (e) { }
  }

  /* ───────── 订阅：新楼层 / 重新渲染 / 切换聊天 ───────── */
  var unsubs = [];
  var timer = null;
  function soon(ms) {
    if (timer) { return; }
    timer = setTimeout(function () { timer = null; scan(); }, ms || 120);
  }

  function boot() {
    log('启动 v' + VERSION + '（正文留在父文档，只套外壳，不进 iframe）');
    var n = scan();
    log('首次扫描：套壳 ' + n + ' 楼');
    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
        var evs = [
          tavern_events.MESSAGE_RENDERED, tavern_events.CHARACTER_MESSAGE_RENDERED,
          tavern_events.USER_MESSAGE_RENDERED, tavern_events.MESSAGE_UPDATED,
          tavern_events.MESSAGE_SWIPED, tavern_events.CHAT_CHANGED,
        ];
        evs.forEach(function (ev) {
          if (!ev) { return; }
          try {
            unsubs.push(eventOn(ev, function () {
              soon(60);
              setTimeout(refresh, 400);   /* 流式/编辑之后原文会变，字数要跟上 */
            }));
          } catch (e) { }
        });
      } else {
        warn('拿不到 eventOn/tavern_events：只靠 DOM 兜底重扫');
      }
    } catch (e) { warn('订阅事件失败：' + ((e && e.message) || e)); }

    /* DOM 兜底：有些版本不发事件；另外插件插完按钮也会动 DOM，一并重扫（scan 是幂等的） */
    try {
      var MO = HOST.MutationObserver || window.MutationObserver;
      if (MO && HDOC.getElementById('chat')) {
        var queued = false;
        var mo = new MO(function () {
          if (queued) { return; }
          queued = true;
          setTimeout(function () { queued = false; soon(150); }, 250);
        });
        mo.observe(HDOC.getElementById('chat'), { childList: true, subtree: true });
      }
    } catch (e) { }

    /* 气泡：正文渲染可能比脚本启动晚 */
    setTimeout(function () { scan(); refresh(); }, 600);
    setTimeout(function () { scan(); refresh(); }, 2000);
  }

  var api = {
    version: VERSION,
    scan: scan, refresh: refresh,
    /* 诊断读数：给预览台/真机排查用（只看，不改） */
    status: function () {
      var chat = HDOC.getElementById('chat');
      var roots = chat ? chat.querySelectorAll('[' + HOST_ATTR + ']') : [];
      var marks = chat ? chat.querySelectorAll('[' + MARK_START + ']') : [];
      return { version: VERSION, dressed: roots.length, pendingMarks: marks.length, chat: !!chat };
    },
    shutdown: function () {
      unsubs.forEach(function (u) { try { u.stop(); } catch (e) { } });
      unsubs = [];
      log('已注销');
    }
  };
  try { HOST.KamiBodyShell = api; } catch (e) { }
  try { window.KamiBodyShell = api; } catch (e) { }

  if (HDOC.readyState === 'loading') { HDOC.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
