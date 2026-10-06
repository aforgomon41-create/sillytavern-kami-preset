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

  var VERSION = '0.2';
  var PANEL_ID = 'kami-status-ball';
  var PANEL_ID_PANEL = 'kami-status-panel';
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

  /* 「状态栏前端」的纯逻辑（src/scripts/_status-view.js）：三行标题栏、模块开关、
     字段自适应分类、剧透字段过滤。DOM / 拖拽 / 持久化留在本文件。 */
  /* @@KAMI_STATUS_VIEW@@ */

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
  /* 设置持久化：**并进现有的脚本变量**（与位置同一个 VARS_KEY）。
     为什么存这里：① 位置本来就存这儿，同一个脚本的状态不该分两个地方；
     ② 脚本变量跟着**账号**走、跨聊天保持，正是"用户偏好"该有的语义
     （对比：聊天变量会随每个会话重置，存那里每次新聊天都要重设）。 */
  var settings = defaultSettings();

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
    /* 存下来的设置一律不可信（手改过 / 旧版本结构不同）→ 交给纯函数逐字段兜底 */
    settings = mergeSettings(saved.settings);
  }
  function saveVars() {
    try { if (saveTimer) { clearTimeout(saveTimer); } } catch (e) { }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        all[VARS_KEY] = {
          x: Math.round(geom.x), y: Math.round(geom.y), size: Math.round(geom.size),
          settings: settings
        };
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
    '#' + PANEL_ID + ' .kami-ball-img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(var(--kami-ball-shadow,0 2px 6px rgba(0,0,0,.30)));}',

    /* ── 有数据时：球展开成三行小字的标题栏（不是弹窗、不是面板）── */
    '#' + PANEL_ID + '[data-kami-state="header"] .kami-ball{width:auto;height:auto;min-width:var(--kami-ball-size,' + DEF_SIZE + 'px);display:flex;gap:8px;align-items:flex-start;padding:var(--kami-pad-y,7px) var(--kami-pad-x,11px);border-radius:var(--kami-r-md,10px);cursor:pointer;background:var(--kami-card,rgba(20,20,24,.94));border:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.16));box-shadow:var(--kami-shadow-sm,0 4px 14px rgba(0,0,0,.35));}',
    '#' + PANEL_ID + '[data-kami-state="header"] .kami-ball-img{width:calc(var(--kami-ball-size,' + DEF_SIZE + 'px) * .32);height:calc(var(--kami-ball-size,' + DEF_SIZE + 'px) * .32);margin-top:2px;flex:none;}',
    '#' + PANEL_ID + ' .kami-status-head{display:none;flex-direction:column;gap:1px;text-align:left;min-width:0;}',
    '#' + PANEL_ID + '[data-kami-state="header"] .kami-status-head{display:flex;}',
    /* 三行、字号小（用户明确要求）。三行都省略号截断，标题栏不会被长文本撑爆 */
    '#' + PANEL_ID + ' .kami-status-line{font-size:var(--kami-fs-xs,11px);line-height:1.35;color:var(--kami-fg-dim,#cfcfd6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:44vw;}',
    '#' + PANEL_ID + ' .kami-status-line[data-kami-slot="time"]{color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID + ' .kami-status-line.is-empty{display:none;}',
    /* "示例"徽标：小、克制，但**看得见** —— 别让人把示例当成自己的剧情变量 */
    '#' + PANEL_ID + ' .kami-status-sample{display:inline-block;margin:0 0 2px;padding:0 5px;border-radius:var(--kami-r-pill,999px);font-size:calc(var(--kami-fs-xs,11px) * .9);line-height:1.5;color:var(--kami-accent,#7aa2f7);border:var(--kami-border-w,1px) solid var(--kami-accent-line,rgba(122,162,247,.45));}',

    /* ── 展开后的状态栏面板 ── */
    '#' + PANEL_ID_PANEL + '{position:absolute;left:0;top:0;transform:translate3d(var(--kami-panel-x,40px),var(--kami-panel-y,80px),0);z-index:1;width:min(400px,92vw);max-height:70vh;display:none;flex-direction:column;pointer-events:auto;background:var(--kami-card,rgba(20,20,24,.97));color:var(--kami-fg,#f2f2f4);border:var(--kami-border-w,1px) solid var(--kami-line-strong,rgba(255,255,255,.18));border-radius:var(--kami-r-lg,12px);box-shadow:var(--kami-shadow,0 12px 40px rgba(0,0,0,.5));font-size:var(--kami-fs,13px);overflow:hidden;}',
    '#' + PANEL_ID_PANEL + '[data-kami-open="1"]{display:flex;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-bar{display:flex;align-items:center;gap:6px;padding:var(--kami-pad-y,8px) var(--kami-pad-x,12px);border-bottom:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.12));cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-bar:active{cursor:grabbing;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-title{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-x{appearance:none;font:inherit;line-height:1;padding:4px 8px;border-radius:var(--kami-r-xs,6px);cursor:pointer;background:transparent;color:var(--kami-fg-dim,#cfcfd6);border:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.16));}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tabs{display:flex;gap:4px;overflow-x:auto;padding:var(--kami-pad-y,8px) var(--kami-pad-x,12px) 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab{appearance:none;font:inherit;white-space:nowrap;padding:5px 10px;border-radius:var(--kami-r-sm,8px);cursor:pointer;background:transparent;color:var(--kami-fg-dim,#cfcfd6);border:var(--kami-border-w,1px) solid transparent;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab.is-on{background:var(--kami-accent-soft,rgba(122,162,247,.18));color:var(--kami-fg,#f2f2f4);border-color:var(--kami-line,rgba(255,255,255,.16));}',
    '#' + PANEL_ID_PANEL + ' .kami-status-body{overflow-y:auto;padding:var(--kami-pad-y,10px) var(--kami-pad-x,12px) var(--kami-pad-lg-y,14px);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-sec{margin:0 0 10px;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-sec-t{font-weight:600;margin:0 0 4px;color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-row{display:flex;gap:8px;padding:2px 0;border-bottom:var(--kami-border-w,1px) dashed var(--kami-line,rgba(255,255,255,.10));}',
    '#' + PANEL_ID_PANEL + ' .kami-status-k{color:var(--kami-fg-mute,#a8a8b0);flex:none;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-v{flex:1;min-width:0;word-break:break-word;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-v[data-kami-kind="bool"]{color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-empty{color:var(--kami-fg-mute,#a8a8b0);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-set{display:flex;align-items:center;gap:8px;padding:5px 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-set label{flex:1;min-width:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-set input{flex:none;width:16px;height:16px;accent-color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-hint{color:var(--kami-fg-mute,#a8a8b0);font-size:.92em;margin:2px 0 8px;}'
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
  var headEls = null;          /* 标题栏那三行（徽标不算行） */
  var sampleTagEl = null;      /* "示例"徽标：只在显示内置示例数据时出现 */

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
    /* 三行标题栏元素先建好、默认不显示（CSS 靠 [data-kami-state="header"] 放出来）。
       行数固定 3 —— 用户说"只需要三行"，少一项就收起那一行，但位置不跳。 */
    var head = mk('div', 'kami-status-head');
    sampleTagEl = mk('span', 'kami-status-sample', '');
    sampleTagEl.setAttribute('data-kami-slot', 'sample');
    sampleTagEl.hidden = true;
    head.appendChild(sampleTagEl);
    headEls = [];
    var slots = ['time', 'place', 'present'];
    for (var si = 0; si < slots.length; si++) {
      var ln = mk('span', 'kami-status-line');
      ln.setAttribute('data-kami-slot', slots[si]);
      head.appendChild(ln);
      headEls.push(ln);
    }
    ball.appendChild(head);
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
      /* 有数据 → 点标题栏展开面板；没数据 → 还是老样子，点一下给个说明
         （"点不动"比"还没有功能"更让人懵） */
      refresh();   /* 先现读一次：变量可能刚被这一轮回复改过 */
      if (shouldShowHeader(currentStat, settings)) { togglePanel(); return; }
      toast('info', COPY.noFunc);
    });
  }

  /* ───────── 数据：拿得到就渲染，拿不到就只有球 ─────────
     ⚠️ 绝不伪造数据。读不到就是 readStat() 返回 null，界面退回"一颗球"。
     读取口径照 00-mvu初始化测试.js:103-119 那套（楼层对象的 variables / swipes_data 里找
     stat_data）—— 那条是**已经在用的**写法，不是我猜的接口。 */
  var currentStat = null;
  var currentIsSample = false;   /* 现在显示的这份是不是内置示例 */
  var injectedStat;      /* undefined = 没注入；null/对象 = 预览台或测试显式喂的 */

  /* 只有它去读真实变量 */
  function readReal() {
    try {
      var fn = (typeof getChatMessages === 'function') ? getChatMessages
        : (HOST && typeof HOST.getChatMessages === 'function') ? HOST.getChatMessages : null;
      if (!fn) { return null; }
      var chat = (HOST && HOST.SillyTavern && HOST.SillyTavern.chat) || null;
      var idx = (chat && chat.length) ? chat.length - 1 : 0;
      if (idx < 0) { return null; }
      var msgs = fn(idx, { include_swipes: true });
      return pickStat(msgs && msgs[0]);
    } catch (e) { log('读变量失败（当作没数据）：' + msgOf(e)); return null; }
  }

  /* 取数优先级（用户 2026-10-05 的硬要求：示例 ≠ 假数据）：
     ① 外部注入（预览台/单测）→ ② **真实楼层变量** → ③ 内置示例（**仅当用户开了开关**）→ ④ 没有。
     真实数据一旦读到，示例永远轮不到 —— 这是"示例只在没有真实数据时顶上"的落地。 */
  function readStat() {
    if (injectedStat !== undefined) { currentIsSample = false; return injectedStat; }
    var real = readReal();
    if (!isEmptyStat(real)) { currentIsSample = false; return real; }
    if (settings.options && settings.options.useSample) { currentIsSample = true; return SAMPLE_STAT; }
    currentIsSample = false;
    return null;
  }

  /* 标题栏：三行小字。没数据就把球变回球 —— 这就是"没有数据时只有 icon" */
  function paintHeader(stat) {
    if (!stage || !ball || !headEls) { return; }
    var show = shouldShowHeader(stat, settings);
    stage.setAttribute('data-kami-state', show ? 'header' : 'ball');
    /* 正在显示示例数据 → 舞台打标记（皮肤/用例都能读到），头部再放一枚徽标。
       **徽标不算一行**：三行恒为三行，只是多一个小标。 */
    stage.setAttribute('data-kami-sample', currentIsSample ? '1' : '0');
    if (sampleTagEl) {
      sampleTagEl.textContent = currentIsSample ? STATUS_COPY.sampleTag : '';
      sampleTagEl.hidden = !currentIsSample;
    }
    ball.setAttribute('aria-expanded', show ? 'true' : 'false');
    ball.title = show ? STATUS_COPY.expandHint : COPY.tip;
    if (!show) { return; }
    var chars = (stat && stat.characters) || {};
    var lines = headerLines(stat, function (id) { var c = chars[id]; return c ? c.name : ''; });
    for (var i = 0; i < headEls.length; i++) {
      var v = lines[i] || '';
      headEls[i].textContent = v;
      /* 空的那一行收起来：三行的**位置**不变（不跳），但不留一片空白 */
      if (v) { headEls[i].classList.remove('is-empty'); } else { headEls[i].classList.add('is-empty'); }
    }
  }

  function refresh() {
    currentStat = readStat();
    paintHeader(currentStat);
    if (panelOpen) { renderPanelBody(); }
    return currentStat;
  }

  /* ───────── 展开面板：tab 是各模块，**最后一个 tab 是设置页** ───────── */
  var panelEl = null, panelBody = null, panelTabsEl = null;
  var panelOpen = false, activeTab = null, panelDrag = null, panelTitleEl = null;
  var panelPos = { x: 40, y: 80 };

  function tabsList() {
    var mods = enabledModules(settings), out = [], i;
    for (i = 0; i < mods.length; i++) { out.push({ id: mods[i].id, label: STATUS_COPY[mods[i].copy] }); }
    out.push({ id: '__settings', label: STATUS_COPY.settingsTab });
    return out;
  }

  function buildPanel() {
    if (panelEl) { return; }
    panelEl = mk('div', 'kami-root');
    panelEl.id = PANEL_ID_PANEL;
    panelEl.setAttribute('data-kami-comp', 'status-panel');
    panelEl.setAttribute('data-kami-open', '0');
    panelEl.style.pointerEvents = 'auto';

    var bar = mk('div', 'kami-status-bar');
    bar.setAttribute('data-kami-drag', 'panel');
    var ttl = mk('span', 'kami-status-title', STATUS_COPY.label);
    panelTitleEl = ttl;
    bar.appendChild(ttl);
    var x = mk('button', 'kami-status-x', '✕');
    x.type = 'button';
    x.setAttribute('data-kami-act', 'status-close');
    x.setAttribute('aria-label', STATUS_COPY.close);
    x.addEventListener('click', function (ev) { ev.stopPropagation(); togglePanel(false); });
    bar.appendChild(x);
    panelEl.appendChild(bar);

    panelTabsEl = mk('div', 'kami-status-tabs');
    panelEl.appendChild(panelTabsEl);

    panelBody = mk('div', 'kami-status-body');
    panelEl.appendChild(panelBody);

    bindPanelDrag(bar);
    stage.appendChild(panelEl);
    paintPanelPos();
  }

  function paintPanelPos() {
    if (!stage) { return; }
    try {
      stage.style.setProperty('--kami-panel-x', Math.round(panelPos.x) + 'px');
      stage.style.setProperty('--kami-panel-y', Math.round(panelPos.y) + 'px');
    } catch (e) { }
  }

  function bindPanelDrag(handle) {
    handle.addEventListener('pointerdown', function (ev) {
      if (disposed || ev.button > 0 || ev.target === null) { return; }
      if (ev.target.getAttribute && ev.target.getAttribute('data-kami-act')) { return; }
      panelDrag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: panelPos.x, oy: panelPos.y };
      try { handle.setPointerCapture(ev.pointerId); } catch (e) { }
      try { ev.preventDefault(); } catch (e) { }
    });
    handle.addEventListener('pointermove', function (ev) {
      if (!panelDrag || ev.pointerId !== panelDrag.id) { return; }
      panelPos.x = panelDrag.ox + (ev.clientX - panelDrag.sx);
      panelPos.y = panelDrag.oy + (ev.clientY - panelDrag.sy);
      paintPanelPos();
    });
    var end = function (ev) {
      if (!panelDrag || (ev && ev.pointerId !== panelDrag.id)) { return; }
      try { handle.releasePointerCapture(panelDrag.id); } catch (e) { }
      panelDrag = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function renderTabs() {
    if (!panelTabsEl) { return; }
    while (panelTabsEl.firstChild) { panelTabsEl.removeChild(panelTabsEl.firstChild); }
    var list = tabsList(), i;
    if (!activeTab || !list.some(function (t) { return t.id === activeTab; })) {
      activeTab = list.length ? list[list.length - 1].id : '__settings';
    }
    for (i = 0; i < list.length; i++) {
      (function (tab) {
        var b = mk('button', 'kami-status-tab' + (tab.id === activeTab ? ' is-on' : ''), tab.label);
        b.type = 'button';
        b.setAttribute('data-kami-tab', tab.id);
        b.addEventListener('click', function () { activeTab = tab.id; renderTabs(); renderPanelBody(); });
        panelTabsEl.appendChild(b);
      })(list[i]);
    }
  }

  /* 值 → DOM：数字/文本直接写，布尔打点，列表和对象递归。
     **分类由纯逻辑决定**（describeField），这里只管把每种 kind 画出来。 */
  function renderValue(v, box) {
    var d = describeField(v), i;
    if (d.kind === 'empty') { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }
    if (d.kind === 'bool') {
      var s = mk('span', '', v ? '✓' : '✗');
      s.setAttribute('data-kami-kind', 'bool');
      box.appendChild(s);
      return;
    }
    if (d.kind === 'text' || d.kind === 'number') { box.appendChild(mk('span', '', String(v))); return; }
    if (d.kind === 'list') {
      var parts = [];
      for (i = 0; i < d.items.length; i++) {
        var it = d.items[i];
        parts.push(typeof it === 'object' ? String(it && it.name ? it.name : '·') : String(it));
      }
      box.appendChild(mk('span', '', parts.join(' / ')));
      return;
    }
    /* group：再摊一层 */
    var keys = Object.keys(v);
    if (!keys.length) { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }
    var wrap = mk('div', '');
    for (i = 0; i < keys.length; i++) {
      var row = mk('div', 'kami-status-row');
      row.appendChild(mk('span', 'kami-status-k', keys[i]));
      var vb = mk('span', 'kami-status-v');
      renderValue(v[keys[i]], vb);
      row.appendChild(vb);
      wrap.appendChild(row);
    }
    box.appendChild(wrap);
  }

  function renderPanelBody() {
    if (!panelBody) { return; }
    while (panelBody.firstChild) { panelBody.removeChild(panelBody.firstChild); }

    if (activeTab === '__settings') { renderSettings(); return; }

    var secs = sectionsOf(currentStat, settings);
    var sec = null, i;
    for (i = 0; i < secs.length; i++) { if (secs[i].id === activeTab) { sec = secs[i]; } }
    if (!sec) { panelBody.appendChild(mk('div', 'kami-status-empty', STATUS_COPY.noData)); return; }
    for (i = 0; i < sec.rows.length; i++) {
      var row = mk('div', 'kami-status-row');
      row.appendChild(mk('span', 'kami-status-k', sec.rows[i].key));
      var vb = mk('span', 'kami-status-v');
      renderValue(sec.rows[i].value, vb);
      row.appendChild(vb);
      panelBody.appendChild(row);
    }
  }

  function checkbox(labelText, hint, checked, onChange) {
    var row = mk('label', 'kami-status-set');
    var t = mk('span', '', labelText);
    row.appendChild(t);
    var cb = mk('input', '');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', function () { onChange(!!cb.checked); });
    row.appendChild(cb);
    var box = mk('div', '');
    box.appendChild(row);
    if (hint) { box.appendChild(mk('div', 'kami-status-hint', hint)); }
    return box;
  }

  /* 设置页：模块开关 + 可选项。改一下就立刻存（saveVars 自带防抖） */
  function renderSettings() {
    panelBody.appendChild(mk('div', 'kami-status-sec-t', STATUS_COPY.settingsModules));
    var i;
    for (i = 0; i < MODULES.length; i++) {
      (function (mod) {
        panelBody.appendChild(checkbox(STATUS_COPY[mod.copy], '', settings.modules[mod.id], function (on) {
          settings.modules[mod.id] = on;
          saveVars();
          renderTabs();
          renderPanelBody();
        }));
      })(MODULES[i]);
    }
    panelBody.appendChild(mk('div', 'kami-status-sec-t', STATUS_COPY.settingsOptions));
    panelBody.appendChild(checkbox(STATUS_COPY.optShowHeader, STATUS_COPY.optShowHeaderHint, settings.options.showHeader, function (on) {
      settings.options.showHeader = on; saveVars(); paintHeader(currentStat);
    }));
    panelBody.appendChild(checkbox(STATUS_COPY.optShowHidden, STATUS_COPY.optShowHiddenHint, settings.options.showHidden, function (on) {
      settings.options.showHidden = on; saveVars(); renderPanelBody();
    }));
    panelBody.appendChild(checkbox(STATUS_COPY.optUseSample, STATUS_COPY.optUseSampleHint, settings.options.useSample, function (on) {
      settings.options.useSample = on; saveVars(); refresh();
    }));
  }

  function togglePanel(force) {
    var want = (force === undefined) ? !panelOpen : !!force;
    if (want && !panelEl) { buildPanel(); }
    if (!panelEl) { return; }
    panelOpen = want;
    panelEl.setAttribute('data-kami-open', want ? '1' : '0');
    if (panelTitleEl) {
      panelTitleEl.textContent = STATUS_COPY.label + (currentIsSample ? '（' + STATUS_COPY.sampleTag + '）' : '');
    }
    if (want) { renderTabs(); renderPanelBody(); }
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
    headEls = null; sampleTagEl = null; panelEl = null; panelBody = null; panelTabsEl = null;
    panelOpen = false; activeTab = null; panelDrag = null; injectedStat = undefined;
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
      /* 现读一次变量并重画（真机上点一下球也会走这条路） */
      refresh: function () { refresh(); return { hasData: !isEmptyStat(currentStat), state: stage ? stage.getAttribute('data-kami-state') : null }; },
      /* 预览台 / 单测注入数据用：传对象=有数据，传 null=显式"没数据"，不传参=恢复现读 */
      setStat: function (v) { injectedStat = (v === undefined ? undefined : v); refresh(); return this.status(); },
      /* 三行标题栏的实际文字，给用例断言用的 */
      headerLines: function () {
        if (!headEls) { return null; }
        var out = [];
        for (var i = 0; i < headEls.length; i++) { out.push(headEls[i].textContent); }
        return out;
      },
      panelOpen: function () { return panelOpen; },
      openPanel: function () { togglePanel(true); return panelOpen; },
      closePanel: function () { togglePanel(false); return panelOpen; },
      activeTab: function () { return activeTab; },
      tabs: function () { return tabsList().map(function (t) { return t.id; }); },
      clickTab: function (id) {
        var list = tabsList();
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) { activeTab = id; if (panelEl) { renderTabs(); renderPanelBody(); } return true; }
        }
        return false;
      },
      settings: function () { return JSON.parse(JSON.stringify(settings)); },
      setSetting: function (path, value) {
        /* ⚠️ 别写死选项名。原来这里是 "showHeader || showHidden" 的白名单，
           加了 useSample 之后它静默返回 false —— E2E 一跑就露馅（开关点了没反应）。
           改成看 options 里有没有这个键，将来再加选项就不用动这里了。 */
        if (settings.options && Object.prototype.hasOwnProperty.call(settings.options, path)) {
          settings.options[path] = !!value;
        } else if (settings.modules[path] !== undefined) {
          settings.modules[path] = !!value;
        } else { return false; }
        saveVars();
        /* ⚠️ 必须**重新取数**，不能只 paintHeader(currentStat)：
           useSample 这类开关会改变"该显示哪份数据"，只重画的话 currentStat 还是旧的，
           开关点了像没反应（E2E 抓到过）。 */
        refresh();
        if (panelEl) { renderTabs(); renderPanelBody(); }
        return true;
      },
      flushSave: function () {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        try {
          if (typeof replaceVariables !== 'function') { return false; }
          var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
          all[VARS_KEY] = { x: Math.round(geom.x), y: Math.round(geom.y), size: Math.round(geom.size), settings: settings };
          replaceVariables(all, { type: 'script' });
          return true;
        } catch (e) { return false; }
      },
      status: function () {
        return {
          version: VERSION, mounted: !!stage, disposed: disposed,
          x: Math.round(geom.x === null ? -1 : geom.x), y: Math.round(geom.y), size: geom.size,
          /* state: 'ball'（没数据，只有球）| 'header'（有数据，三行标题栏）——
             这是"有没有数据"的对外读数，排障与用例都靠它 */
          state: stage ? stage.getAttribute('data-kami-state') : null,
          hasData: !isEmptyStat(currentStat),
          panelOpen: !!panelOpen,
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
    /* 变量可能有也可能没有：先读一次。没有 → 保持"一颗球"，这是正确状态，不是失败。 */
    refresh();
    /* MVU 的初始化是异步的，启动这一刻很可能还没变量。
       隔几秒**只补看一次**（不做常驻轮询：没有变量时它永远不会变，白耗电）。 */
    try { setTimeout(function () { if (!disposed) { refresh(); } }, 2500); } catch (e) { }
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      try {
        var onRefresh = function () { try { setTimeout(function () { if (!disposed) { refresh(); } }, 300); } catch (e) { } };
        eventOn(tavern_events.MESSAGE_SENT, onRefresh);
        eventOn(tavern_events.CHAT_CHANGED, onRefresh);
      } catch (e) { log('挂事件失败（不影响使用）：' + msgOf(e)); }
    }
    log('启动 v' + VERSION + '：悬浮球已就位（' + Math.round(geom.x) + ',' + Math.round(geom.y) +
      ' 直径 ' + geom.size + '）；变量状态=' + (isEmptyStat(currentStat) ? '没有数据（只显示球）' : '有数据（展开标题栏）'));
  }

  try { boot(); } catch (e) { console.error('[状态栏] 启动失败', e); }
})();
