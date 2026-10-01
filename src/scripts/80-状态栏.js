/* ============================================================
 * 📊 状态栏（实验）   v0.1
 * 酒馆助手（TavernHelper / JS-Slash-Runner 4.9.5+）脚本
 * ------------------------------------------------------------
 * 这是**实验脚本，meta.json 里默认关闭**：用户要在酒馆的脚本列表里手动打开它，
 * 屏幕上才会出现这个悬浮球。默认关闭是刻意的 —— 它现在还没有功能，
 * 不该出现在所有人的界面上。
 *
 * 它现在做什么：在屏幕边缘放一个预设吉祥物的悬浮球（透明背景的剪影图）。
 *   · 可以拖着走（鼠标 / 触屏都行），松手后位置记在脚本变量里，下次进酒馆还在原处；
 *   · 位置会夹在可视区内，窗口变小或转屏时自动收回来，永远留一条边能点到；
 *   · 点一下弹一句「还没做功能」，让你知道点到了（不是点不动）。
 *   · 以后这里会长成状态栏（变量读数 / 回合状态 / 快捷入口），所以文件名叫状态栏。
 *
 * 三条纪律（照 60-压缩.js 的先例）：
 *   ① 只碰自己的 DOM：一个铺满视口的舞台 + 里面一颗球，注销时一起拆掉，零残留；
 *   ② 位置是**状态**，走几何令牌（--kami-ball-x / -y / -size）下发；
 *      样子（阴影）走令牌 --kami-ball-shadow，皮肤可以覆盖 —— 与本项目「几何归脚本、
 *      外观归皮肤」的分工一致（见 docs/皮肤契约.md §4.6 / §9.10）；
 *   ③ 悬浮球不出现在按钮中转站里：它不是面板，不登记按钮，也不抢任何快捷键。
 *
 * 图标来自构建期内联（`design/icon/kami-statusbar.png` → data URI，
 * 走 build/kami-doc.mjs 的 expandIconStatus），脚本源码里只有占位符没有一坨 base64。
 *
 * 控制台：KamiStatusBar.status() / .show() / .hide() / .reset() / .shutdown()
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '0.1';
  var PANEL_ID = 'kami-status-ball';
  var CSS_ID = 'kami-status-css';
  var API_NAME = 'KamiStatusBar';
  var VARS_KEY = 'kami-statusbar';
  var Z = 29000;              // 比面板（30000）低一档：面板永远盖在球上面
  var DEF_SIZE = 64;          // 默认直径（CSS 像素）
  var DEF_X = null;           // null = 首次按「右上角往里缩一点」算
  var DEF_Y = 96;
  var EDGE_KEEP = 8;          // 夹取时至少要留这么多像素在可视区内（免得拖出屏幕再也点不到）
  var MOVE_SLOP = 4;          // 位移小于它算「点击」而不是「拖动」
  var SAVE_DELAY = 300;       // 位置落盘防抖（拖动过程中不写盘）

  /* 构建期内联：data:image/png;base64,…（唯一真相 design/icon/kami-statusbar.png） */
  /* @@KAMI_ICON_STATUS@@ */

  var COPY = {
    "tip": "状态栏（实验）· 拖动可以移动位置，暂时还没有功能",
    "label": "状态栏（实验）",
    "noFunc": "这个悬浮球还没有功能：以后这里会变成状态栏",
    "ready": "已就绪"
  };

  /* ───────── 宿主窗口（与 60 号同一套取法：脚本跑在 iframe 里，parent 才是酒馆页面） ───────── */
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
    return window;
  })();
  var HDOC = HOST.document;

  function log(msg) { try { console.log('[状态栏] ' + msg); } catch (e) { } }
  function msgOf(e) { return (e && e.message) ? e.message : String(e); }
  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, COPY.label); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }

  /* ───────── 位置（状态）：脚本变量，跨聊天跟着账号走 ───────── */
  var geom = { x: DEF_X, y: DEF_Y, size: DEF_SIZE };
  var saveTimer = null;

  function readVars() {
    var saved = null;
    try {
      if (typeof getVariables === 'function') {
        var all = getVariables({ type: 'script' });
        saved = all && all[VARS_KEY];
      }
    } catch (e) { log('读脚本变量失败：' + msgOf(e)); }
    if (!saved || typeof saved !== 'object') { return; }
    if (typeof saved.x === 'number' && isFinite(saved.x)) { geom.x = saved.x; }
    if (typeof saved.y === 'number' && isFinite(saved.y)) { geom.y = saved.y; }
    if (typeof saved.size === 'number' && saved.size >= 24 && saved.size <= 200) { geom.size = saved.size; }
  }
  function saveVars() {
    try { if (saveTimer) { clearTimeout(saveTimer); } } catch (e) { }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        all[VARS_KEY] = { x: Math.round(geom.x), y: Math.round(geom.y), size: Math.round(geom.size) };
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('写脚本变量失败：' + msgOf(e)); }
    }, SAVE_DELAY);
  }

  /* ───────── 样式 ─────────
     只写布局与结构性重置（契约 §9.10 登记）：几何一律走令牌，外观（阴影）走
     --kami-ball-shadow 带兜底值，皮肤想改就定义那个令牌。
     选择器带 id，特异性压得住任何皮肤的裸 .kami-root 规则。
     ⚠️ 这里**不注入兜底皮肤**（40/50/60 号都注入，本脚本刻意不注入）：
     悬浮球一个 .kami-* 组件样式都不用，注进来就是白背 50KB。 */
  var BALL_CSS = [
        /* 位置走 transform 而不是 left/top（2026-10-01 拖动卡顿修复，调研见 .audit/悬浮球性能-调研.md）：
       left/top 是布局属性 ⇒ 每帧都要主线程 style→layout；transform 只更新合成器。
       几何令牌一个都没改（仍是 --kami-ball-x/-y，仍是「左上角坐标 + px」语义），
       clampGeom 与脚本变量读写照旧 —— 只是把它们喂给 transform 而已。
       will-change:transform 提前把球提成自己的合成层，拖动时不再每帧重新判定合成。 */
    '#' + PANEL_ID + ' .kami-ball{position:absolute;left:0;top:0;transform:translate3d(var(--kami-ball-x,0px),var(--kami-ball-y,0px),0);will-change:transform;width:var(--kami-ball-size,' + DEF_SIZE + 'px);height:var(--kami-ball-size,' + DEF_SIZE + 'px);margin:0;padding:0;border:0;background:none;cursor:grab;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}',
    '#' + PANEL_ID + ' .kami-ball:active{cursor:grabbing;}',
    '#' + PANEL_ID + ' .kami-ball:focus-visible{outline:2px solid var(--kami-accent,rgba(128,128,128,.9));outline-offset:3px;border-radius:50%;}',
    '#' + PANEL_ID + ' .kami-ball-img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(var(--kami-ball-shadow,0 2px 6px rgba(0,0,0,.30)));}'
  ].join('\n');

  function injectCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var el = HDOC.createElement('style');
      el.id = CSS_ID;
      el.textContent = BALL_CSS;
      (HDOC.head || HDOC.documentElement).appendChild(el);
    } catch (e) { log('注入样式失败：' + msgOf(e)); }
  }
  function dropCss() {
    try {
      var el = HDOC.getElementById(CSS_ID);
      if (el && el.parentNode) { el.parentNode.removeChild(el); }
    } catch (e) { }
  }

  /* ───────── DOM ───────── */
  var disposed = false;
  var stage = null, ball = null, img = null, drag = null, resizeHandler = null, hideHandler = null;

  function mk(tag, cls, text) {
    var el = HDOC.createElement(tag);
    if (cls) { el.className = cls; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  /* 拖动节的拍子（2026-10-01）：pointermove 只更新坐标并**请求一帧**，真正写样式挪进 rAF 回调，
     一帧最多写一次。⚠️ rAF 必须向**宿主窗口**要：脚本跑在隐藏 iframe 里，
     不可见 iframe 自己的 requestAnimationFrame 不跳，用错了球会完全不动。
     两层兜底都拿不到时退回 setTimeout —— 宁可少顺滑一点，也不能不动。 */
  function raf(fn) {
    try {
      if (HOST && typeof HOST.requestAnimationFrame === 'function') {
        return HOST.requestAnimationFrame(fn);
      }
    } catch (e) { }
    try { if (typeof requestAnimationFrame === 'function') { return requestAnimationFrame(fn); } } catch (e) { }
    try { return setTimeout(fn, 16); } catch (e) { return 0; }
  }
  function cancelRaf(id) {
    if (!id) { return; }
    try { if (HOST && typeof HOST.cancelAnimationFrame === 'function') { HOST.cancelAnimationFrame(id); return; } } catch (e) { }
    try { if (typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(id); return; } } catch (e) { }
    try { clearTimeout(id); } catch (e) { }
  }
  function viewW() { try { return HOST.innerWidth || HDOC.documentElement.clientWidth || 0; } catch (e) { return 0; } }
  function viewH() { try { return HOST.innerHeight || HDOC.documentElement.clientHeight || 0; } catch (e) { return 0; } }

  /* 视口尺寸缓存：拖动时每帧现读 innerWidth/innerHeight 会强制读布局，
     而窗口尺寸只在 resize / 转屏 / 页面回前台时变 ⇒ 缓存起来，那三处各刷一次。 */
  var viewCache = { w: 0, h: 0 };
  function refreshView() { viewCache.w = viewW(); viewCache.h = viewH(); }

  /* 夹到可视区里：至少留 EDGE_KEEP 像素能点到（x 为 null 表示还没定过位） */
  function clampGeom() {
    var w = viewCache.w || viewW(), h = viewCache.h || viewH(), s = geom.size;
    if (!w || !h) { return; }
    if (geom.x === null || geom.x === undefined) { geom.x = w - s - 16; }   // 首次：右上角往里缩 16px
    if (geom.y === null || geom.y === undefined) { geom.y = DEF_Y; }
    geom.x = Math.min(Math.max(geom.x, EDGE_KEEP - s), w - EDGE_KEEP);
    geom.y = Math.min(Math.max(geom.y, EDGE_KEEP - s), h - EDGE_KEEP);
  }
  /* 把几何写进舞台的 CSS 变量。拖动时每帧都会调它，所以尺寸**没变就不写**
     （每帧从 3 次 setProperty 降到 2 次；setProperty 是纯主线程操作）。 */
  var lastPaintedSize = 0;
  function paint() {
    if (!stage) { return; }
    try {
      stage.style.setProperty('--kami-ball-x', Math.round(geom.x) + 'px');
      stage.style.setProperty('--kami-ball-y', Math.round(geom.y) + 'px');
      var s = Math.round(geom.size);
      if (s !== lastPaintedSize) {
        stage.style.setProperty('--kami-ball-size', s + 'px');
        lastPaintedSize = s;
      }
    } catch (e) { }
  }

  function build() {
    if (stage) { return; }
    stage = mk('div', 'kami-root');
    stage.id = PANEL_ID;
    stage.setAttribute('data-kami-comp', 'ball');
    /* 舞台几何内联（契约 §4.4 例外①的同一条理由：舞台是脚本自己的东西，
       皮肤的裸 .kami-root 规则不该把它顶掉；dvh 不认时落回 vh，iOS 上盒子会塌） */
    stage.style.position = 'fixed';
    stage.style.inset = '0';
    stage.style.top = '0';
    stage.style.right = '0';
    stage.style.bottom = '0';
    stage.style.left = '0';
    stage.style.width = 'auto';
    stage.style.height = 'auto';
    stage.style.minHeight = '100vh';
    stage.style.minHeight = '100dvh';
    stage.style.margin = '0';
    stage.style.zIndex = String(Z);
    stage.style.pointerEvents = 'none';

    ball = mk('button', 'kami-ball');
    ball.type = 'button';
    ball.setAttribute('data-kami-act', 'ball');
    ball.setAttribute('data-kami-drag', '1');
    ball.setAttribute('aria-label', COPY.label);
    ball.title = COPY.tip;
    img = mk('img', 'kami-ball-img');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    try { if (ICON_STATUS) { img.src = ICON_STATUS; } } catch (e) { }
    ball.appendChild(img);
    stage.appendChild(ball);
    (HDOC.body || HDOC.documentElement).appendChild(stage);
    bindDrag();
    bindClick();
  }

  /* 拖动：pointer 事件 + 捕获（照面板那一套；触屏上必须先 touch-action:none 才拖得动） */
  var lastDragEnd = 0;   // 刚拖完的那一下不算点击
  var rafId = 0;         // 拖动节流用的那一帧（0 = 没有待执行帧）
  function bindDrag() {
    if (!ball) { return; }
    ball.addEventListener('pointerdown', function (ev) {
      if (disposed || ev.button > 0) { return; }
      drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: geom.x, oy: geom.y, moved: false };
      try { ball.setPointerCapture(ev.pointerId); } catch (e) { }
      try { ev.preventDefault(); } catch (e) { }
    });
    ball.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.id) { return; }
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < MOVE_SLOP) { return; }
      drag.moved = true;
      geom.x = drag.ox + dx;
      geom.y = drag.oy + dy;
      /* 采样点只更新坐标，写样式交给下一帧：一帧里来多少次 move 都只写一次。
         抬手那一下不依赖这里 —— endDrag 里还有一次 clampGeom + paint 兜底。 */
      if (!rafId) {
        rafId = raf(function () {
          rafId = 0;
          if (!drag) { return; }
          clampGeom();
          paint();
        });
      }
    });
    var endDrag = function (ev) {
      if (!drag || (ev && ev.pointerId !== drag.id)) { return; }
      var moved = drag.moved;
      try { ball.releasePointerCapture(drag.id); } catch (e) { }
      drag = null;
      if (moved) {
        lastDragEnd = Date.now();
        /* 先把没跑完的那一帧掐掉，再按**最终坐标**画一次：
           否则待执行帧会按抬手前的位置补画，球就停在最后一帧而不是落点。 */
        if (rafId) { cancelRaf(rafId); rafId = 0; }
        clampGeom();
        paint();
        saveVars();
      }
    };
    ball.addEventListener('pointerup', endDrag);
    ball.addEventListener('pointercancel', endDrag);
  }

  /* 点击：只有「没拖动」的那一下才算点击（否则每次拖完都弹一句） */
  function bindClick() {
    if (!ball) { return; }
    ball.addEventListener('click', function (ev) {
      if (disposed) { return; }
      if (Date.now() - lastDragEnd < 300) { return; }
      try { ev.preventDefault(); } catch (e) { }
      toast('info', COPY.noFunc);
    });
  }

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    try { if (rafId) { cancelRaf(rafId); rafId = 0; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    try { if (resizeHandler) { HOST.removeEventListener('resize', resizeHandler); } } catch (e) { }
    resizeHandler = null;
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    try { if (ball && drag) { ball.releasePointerCapture(drag.id); } } catch (e) { }
    drag = null;
    dropCss();
    try { if (stage && stage.parentNode) { stage.parentNode.removeChild(stage); } } catch (e) { }
    stage = null; ball = null; img = null;
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    log('注销完成：悬浮球、样式、监听器、脚本变量写入定时器都已收回（位置留在脚本变量里，下次开还在原处）');
  }

  /* ───────── 全局 API ───────── */
  function api() {
    return {
      version: VERSION,
      show: function () { if (!stage) { build(); } else { stage.style.display = ''; } refreshView(); clampGeom(); paint(); return true; },
      hide: function () { if (stage) { stage.style.display = 'none'; } return true; },
      reset: function () { geom.x = null; geom.y = DEF_Y; refreshView(); clampGeom(); paint(); saveVars(); return { x: geom.x, y: geom.y }; },
      status: function () {
        return {
          version: VERSION, mounted: !!stage, disposed: disposed,
          x: Math.round(geom.x === null ? -1 : geom.x), y: Math.round(geom.y), size: geom.size,
          view: viewW() + 'x' + viewH()
        };
      },
      shutdown: function () { teardown(); }
    };
  }

  function boot() {
    readVars();
    build();
    injectCss();
    refreshView();   /* 首次夹取前先量一次视口（clampGeom 平时只读缓存） */
    clampGeom();
    paint();
    resizeHandler = function () { if (!disposed) { refreshView(); clampGeom(); paint(); } };
    try { HOST.addEventListener('resize', resizeHandler); } catch (e) { }
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
    try { HOST[API_NAME] = api(); } catch (e) { }
    try { window[API_NAME] = HOST[API_NAME] || api(); } catch (e) { }
    log('启动 v' + VERSION + '：悬浮球已就位（' + Math.round(geom.x) + ',' + Math.round(geom.y) + ' 直径 ' + geom.size + '）');
  }

  try { boot(); } catch (e) { console.error('[状态栏] 启动失败', e); }
})();
