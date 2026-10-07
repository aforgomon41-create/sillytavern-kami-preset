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
  /* 默认直径（CSS 像素）。用户 2026-10-05 先要"很大"（92→112），看过 -135 之后改口：
     「现在球搞的太大了，面积只需要现在大概三分之一」。
     面积 ∝ 边长²，1/3 面积 ⇒ 边长 × 1/√3 = 112 × 0.577 ≈ 64.7 → 取 64。
     64 正好就是 v0.2 之前的原始尺寸（18 套皮肤没有任何一套覆盖 --kami-ball-size），
     所以这一改既满足"小回去"，也让"无数据态与改动前一致"天然成立。 */
  var DEF_SIZE = 64;
  var DEF_X = null;           // null = 首次按「右上角往里缩一点」算
  var DEF_Y = 96;
  var EDGE_KEEP = 8;          // 夹取时至少要留这么多像素在可视区内（免得拖出屏幕再也点不到）
  /* 位移阈值：pointerdown 到 pointerup 之间**累计位移**小于它就算点击，不算拖动。
     取 4px 的理由：① 手指点按时的自然抖动一般在 2-3px，4 能吃掉抖动又不会把"真想拖一点"
     误判成点击；② 鼠标点击几乎零位移，4 绰绰有余；③ 它与"拖完不算点击"那道闸（下面
     lastDragEnd 的 300ms）是**两道独立的闸**，同时成立才会误开面板。 */
  var RIBBON_PAD_L = 10;      // 横幅左侧留白（手机满宽时用）
  var RIBBON_PAD_R = 16;      // 横幅右侧留白（手柄与文字之间）
  var MOVE_SLOP = 4;
  var SAVE_DELAY = 300;       // 位置落盘防抖（拖动过程中不写盘）

  /* 构建期内联：data:image/png;base64,…（唯一真相 design/icon/kami-statusbar.png） */
  /* @@KAMI_ICON_STATUS@@ */

  /* 「状态栏前端」的纯逻辑（src/scripts/_status-view.js）：三行标题栏、模块开关、
     字段自适应分类、剧透字段过滤。DOM / 拖拽 / 持久化留在本文件。 */
  /* @@KAMI_STATUS_VIEW@@ */

  var COPY = {
    "tip": "状态栏（实验）· 拖动可以移动位置，暂时还没有功能",
    "label": "状态栏（实验）",
    /* 2026-10-05 删掉 "noFunc"（"这个悬浮球还没有功能"）：
       点球已经改成展开面板，没人再用它了。删之前 grep 过全仓 —— 只有它自己的定义，零引用，
       守卫里也没有断言引用它（否则要连守卫一起改语义）。 */
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
  /* PC 端用户调出来的宽度（null = 没调过，走"内容撑开"）。与位置同存一处。 */
  var userWidth = null;
  var curLayout = null;   /* layoutOf 最近一次的产物，排障与用例读它 */
  var grip = null;        /* 横幅右端那根细拖拽手柄（只在 PC 出现） */
  var gripDrag = null;

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
    /* 宽度原样读出来，夹取交给 layoutOf（它知道当时视口多宽） */
    if (typeof saved.w === 'number' && isFinite(saved.w) && saved.w > 0) { userWidth = saved.w; }
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
          w: userWidth === null ? null : Math.round(userWidth),
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
    '#' + PANEL_ID + ' .kami-ball{position:absolute;left:0;top:0;z-index:1;transform:translate3d(var(--kami-ball-x,0px),var(--kami-ball-y,0px),0);will-change:transform;width:var(--kami-ball-size,' + DEF_SIZE + 'px);height:var(--kami-ball-size,' + DEF_SIZE + 'px);margin:0;padding:0;border:0;background:none;cursor:grab;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}',
    '#' + PANEL_ID + ' .kami-ball:active{cursor:grabbing;}',
    '#' + PANEL_ID + ' .kami-ball:focus-visible{outline:2px solid var(--kami-accent,rgba(128,128,128,.9));outline-offset:3px;border-radius:50%;}',
    '#' + PANEL_ID + ' .kami-ball-img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;filter:drop-shadow(var(--kami-ball-shadow,0 2px 6px rgba(0,0,0,.30)));}',

    /* ── 有数据时：一条横幅**从球背后向右探出**（球在上一层压住它左端）──
       左缘落在**球心 x**、高度**等于图标高度**、顶边与球齐平 —— 三个数都由
       _status-view.js 的 headerGeom() 算好，以 --kami-ribbon-* 下发。
       横幅在**下面一层**（z-index 0），球在上面（z-index 1）。 */
    '#' + PANEL_ID + ' .kami-status-ribbon{position:absolute;left:0;top:0;z-index:0;display:none;align-items:center;box-sizing:border-box;transform:translate3d(var(--kami-ribbon-x,0px),var(--kami-ribbon-y,0px),0);width:var(--kami-ribbon-w,0px);height:var(--kami-ribbon-h,0px);padding-right:var(--kami-pad-x,10px);padding-left:var(--kami-ribbon-inset,0px);overflow:hidden;border-radius:var(--kami-r-md,10px);background:var(--kami-card,rgba(40,42,52,.96));border:var(--kami-border-w,1px) solid var(--kami-line-strong,rgba(255,255,255,.28));box-shadow:var(--kami-shadow-sm,0 4px 14px rgba(0,0,0,.35));pointer-events:auto;}',
    /* 用户 2026-10-05：兜底底色原来是 rgba(20,20,24)，在深色背景上**几乎隐形**。
       换成 rgba(40,42,52)，并把描边兜底提到 28% 白 —— 这样深黑、中灰、浅色三种无皮肤背景
       上都看得出边界（截图见报告）。皮肤一跑起来，两个令牌都由皮肤接管，这里的兜底自动失效。 */
    '#' + PANEL_ID + ' .kami-status-ribbon[data-kami-dir="left"]{padding-left:var(--kami-pad-x,10px);padding-right:var(--kami-ribbon-inset,0px);}',
    '#' + PANEL_ID + ' .kami-status-ribbon[data-kami-dir="left"] .kami-status-head{text-align:right;align-items:flex-end;}',
    '#' + PANEL_ID + '[data-kami-state="header"] .kami-status-ribbon{display:flex;}',
    /* 横幅里的字要避开压在上面的球：左侧内缩 = 半个球宽 + 一点间距 */
        /* ⚠️ head 用 max-content 且**不加 max-width 夹取**：它的盒子宽度就是"内容要多宽"，
       这是 contentWidth() 唯一的量法。加了 max-width:100% 的话，横幅一窄量出来就被夹小，
       首屏会偏窄、双击复位也会量不准（实测踩到）。溢出交给横幅的 overflow:hidden 裁。 */
    '#' + PANEL_ID + ' .kami-status-head{display:flex;flex-direction:column;gap:1px;text-align:left;min-width:0;width:max-content;}',
    /* 三行、字号小（用户明确要求）。三行都省略号截断，标题栏不会被长文本撑爆 */
    '#' + PANEL_ID + ' .kami-status-line{font-size:var(--kami-fs-xs,11px);line-height:1.35;color:var(--kami-fg-dim,#cfcfd6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:44vw;}',
    '#' + PANEL_ID + ' .kami-status-line[data-kami-slot="time"]{color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID + ' .kami-status-line.is-empty{display:none;}',
    /* "示例"徽标：小、克制，但**看得见** —— 别让人把示例当成自己的剧情变量 */
    '#' + PANEL_ID + ' .kami-status-sample{display:inline-block;margin:0 0 2px;padding:0 5px;border-radius:var(--kami-r-pill,999px);font-size:calc(var(--kami-fs-xs,11px) * .9);line-height:1.5;color:var(--kami-accent,#7aa2f7);border:var(--kami-border-w,1px) solid var(--kami-accent-line,rgba(122,162,247,.45));}',

    /* ── 展开后的状态栏面板 ── */
    '#' + PANEL_ID_PANEL + '{position:absolute;left:0;top:0;box-sizing:border-box;transform:translate3d(var(--kami-panel-x,40px),var(--kami-panel-y,80px),0);z-index:1;width:var(--kami-panel-w,320px);max-height:70vh;display:none;flex-direction:column;pointer-events:auto;background:var(--kami-card,rgba(20,20,24,.97));color:var(--kami-fg,#f2f2f4);border:var(--kami-border-w,1px) solid var(--kami-line-strong,rgba(255,255,255,.18));border-radius:var(--kami-r-lg,12px);box-shadow:var(--kami-shadow,0 12px 40px rgba(0,0,0,.5));font-size:var(--kami-fs,13px);overflow:hidden;}',
    '#' + PANEL_ID_PANEL + '[data-kami-open="1"]{display:flex;}',
    /* ── 连体：面板与横幅**共享一条边**，像从横幅长出来 ──
       ① 位置：面板 left/top 由 layoutOf 一次算出（左缘=横幅左缘、上缘=横幅下缘），
          不是各算各的 —— 所以几何上不可能错开；
       ② 圆角：贴在一起的两个角都收成直角，外侧两个角保持圆角；
       ③ 接缝：横幅的**下边框取消**，由面板的上边框充当那条线 —— 只有一条线，不是两条。 */
    '#' + PANEL_ID + '[data-kami-connected="1"] .kami-status-ribbon{border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-width:0;}',
    /* 面板上缘**正好**落在横幅下缘（不加负 margin）—— 横幅的下边框已经取消，
       接缝只剩面板自己那一条上边框。这样量出来的"面板上缘 - 横幅下缘"是干净的 0。 */
    '#' + PANEL_ID_PANEL + '[data-kami-open="1"]{border-top-left-radius:0;border-top-right-radius:0;}',
    /* 调宽手柄：细、低对比、悬停才明显（B 轮再调整体视觉） */
    '#' + PANEL_ID + ' .kami-status-grip{position:absolute;top:0;bottom:0;width:' + 12 + 'px;cursor:ew-resize;touch-action:none;background:transparent;}',
    '#' + PANEL_ID + ' .kami-status-ribbon[data-kami-dir="left"] .kami-status-grip{left:0;}',
    '#' + PANEL_ID + ' .kami-status-ribbon[data-kami-dir="right"] .kami-status-grip{right:0;}',
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
  var ribbon = null;           /* 从球背后向右探出的那条横幅 */

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
      paintRibbon();
    } catch (e) { }
  }

  /* 横幅几何：三个数全部来自纯函数 headerGeom（左缘=球心 x、高=图标高、向右展开），
     这里只负责把它们写进 CSS 变量。文字再额外内缩半个球宽，免得被压在上面的球挡住。 */
  /* 内容自然宽度：三行里最宽的那行 + 左侧内缩 + 右侧留白。
     行都是 white-space:nowrap，所以 scrollWidth 给的就是"不换行要多宽"，
     即使当前横幅比它窄也量得准（超出的部分算 overflow）。 */
  function contentWidth() {
    try {
      var head = ribbon && ribbon.querySelector('.kami-status-head');
      if (!head) { return 0; }
      /* ⚠️ 用 getBoundingClientRect 而不是 scrollWidth：scrollWidth 会被元素自身的
         盒子宽度兜底，横幅一宽它就把"内容宽度"报成横幅宽度 —— 双击复位再也回不去
         （会一路棘轮，实测踩到）。head 是 width:max-content，所以它的盒子宽就是内容宽。 */
      return head.getBoundingClientRect().width + ribbonTextInset(geom.size, 10) + RIBBON_PAD_R;
    } catch (e) { return 0; }
  }

  /* 横幅 + 连体面板的几何，一次算完（全在纯函数 layoutOf 里）。
     面板的位置**不是**自己算的 —— 它直接取 layoutOf 给的 panel 字段，
     所以"共享一条边"是同一个来源保证的，不会两边算岔。 */
  function paintRibbon() {
    if (!stage) { return; }
    try {
      var w = viewCache.w || viewW();
      var g = layoutOf({
        ball: geom, viewW: w, edgeGap: EDGE_KEEP,
        contentW: contentWidth(), userWidth: userWidth
      });
      curLayout = g;
      stage.style.setProperty('--kami-ribbon-x', Math.round(g.left) + 'px');
      stage.style.setProperty('--kami-ribbon-y', Math.round(g.top) + 'px');
      stage.style.setProperty('--kami-ribbon-w', Math.round(g.width) + 'px');
      stage.style.setProperty('--kami-ribbon-h', Math.round(g.height) + 'px');
      /* 文字内缩：
         · 手机满宽时球是"排头图标"，横幅左缘 = 球的左缘 —— 文字要让开**整个球宽**再加间距，
           否则会被球压住（第一版只让了 10px，截图里字全糊在球上）；
         · PC 时横幅从球心探出，只需再让半个球宽。 */
      stage.style.setProperty('--kami-ribbon-inset',
        Math.round(g.mobile ? (geom.size + RIBBON_PAD_L) : ribbonTextInset(geom.size, 10)) + 'px');
      stage.style.setProperty('--kami-panel-x', Math.round(g.panel.left) + 'px');
      stage.style.setProperty('--kami-panel-y', Math.round(g.panel.top) + 'px');
      stage.style.setProperty('--kami-panel-w', Math.round(g.panel.width) + 'px');
      if (ribbon) {
        ribbon.setAttribute('data-kami-dir', g.dir);
        ribbon.setAttribute('data-kami-mobile', g.mobile ? '1' : '0');
      }
      if (grip) { grip.hidden = !(!g.mobile && g.width > 0); }
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

    /* 横幅先建：它是**球背后**那条，z-index 比球低，球的左半压住它左端 */
    ribbon = mk('div', 'kami-status-ribbon');
    ribbon.setAttribute('data-kami-slot', 'ribbon');
    ribbon.hidden = true;
    ribbon.addEventListener('click', function (ev) {
      if (disposed) { return; }
      try { ev.preventDefault(); } catch (e) { }
      refresh();
      togglePanel();
    });
    stage.appendChild(ribbon);

    ball = mk('button', 'kami-ball');
    ball.type = 'button';
    ball.setAttribute('data-kami-act', 'ball');
    ball.setAttribute('data-kami-drag', '1');
    /* 无障碍沿用既有那一套：球本来就是 <button>，所以
       · 天然可聚焦（Tab 到得到）、Enter / Space 天然触发 click（浏览器给 button 的默认行为）；
       · aria-label 说清它是什么，aria-expanded 在 paintHeader 里跟着开合状态更新。
       这里只补 aria-haspopup，让读屏知道点它会弹出一块面板。 */
    ball.setAttribute('aria-label', COPY.label);
    ball.setAttribute('aria-haspopup', 'dialog');
    ball.setAttribute('aria-expanded', 'false');
    ball.title = COPY.tip;
    img = mk('img', 'kami-ball-img');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    try { if (ICON_STATUS) { img.src = ICON_STATUS; } } catch (e) { }
    /* ⚠️ 球里**只放图标**：没有底板、没有边框、没有内边距。
       用户 2026-10-05：「icon 应该很大，并且没有被容器包裹（至少看起来没有）」——
       三行文字挂在**背后的横幅**上，不是挂在球里。 */
    ball.appendChild(img);
    /* 三行标题栏元素挂在横幅里，默认不显示（CSS 靠 [data-kami-state="header"] 放出来）。
       行数固定 3 —— 用户说"只需要三行"，少一项就收起那一行，但位置不跳。 */
    var head = mk('div', 'kami-status-head');
    /* 「示例」徽标**不再创建**（用户 2026-10-05 要去掉视觉标注）。
       currentIsSample 仍然在算 —— 它喂给 data-kami-sample 属性（排障用，不是视觉标注）。 */
    headEls = [];
    var slots = ['time', 'place', 'present'];
    for (var si = 0; si < slots.length; si++) {
      var ln = mk('span', 'kami-status-line');
      ln.setAttribute('data-kami-slot', slots[si]);
      head.appendChild(ln);
      headEls.push(ln);
    }
    ribbon.appendChild(head);
    /* 调宽手柄：横幅末端那一小条。只在 PC 出现（手机是满宽，没什么可调的）。 */
    grip = mk('div', 'kami-status-grip');
    grip.setAttribute('data-kami-drag', 'grip');
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', STATUS_COPY.gripLabel);
    grip.title = STATUS_COPY.gripTip;
    grip.hidden = true;
    bindGrip();
    ribbon.appendChild(grip);
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
      /* 用户 2026-10-05：「如果没有数据，虽然只会显示悬浮球，但是**仍然可以点击展开状态栏面板**」。
         所以这里不再分有没有数据 —— 只要球在，点它就是开面板（面板里没数据就显示空态）。
         球与横幅是一个整体，点哪个都一样。 */
      togglePanel();
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
    if (ribbon) { ribbon.hidden = !show; }
    if (show) { paintRibbon(); }
    /* 正在显示示例数据 → 舞台打标记（皮肤/用例都能读到），头部再放一枚徽标。
       **徽标不算一行**：三行恒为三行，只是多一个小标。 */
    /* ⚠️ 用户 2026-10-05：**去掉「示例」的视觉标注**（调试完会删示例数据，不必标）。
       所以这里不再渲染徽标 —— 但 data-kami-sample 这个**属性**留着（排障与用例读它，
       它不是视觉标注）。currentIsSample 仍然在算，"真实数据优先"照旧。 */
    stage.setAttribute('data-kami-sample', currentIsSample ? '1' : '0');
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
  var panelOpen = false, activeTab = null, panelTitleEl = null;

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

    /* ⚠️ 面板**不再独立拖拽**：连体之后它必须跟着横幅走。
       想移动整块，拖横幅/球 —— 那是同一个 geom 来源，面板自然跟随。 */
    stage.appendChild(panelEl);
  }

  function renderTabs() {
    if (!panelTabsEl) { return; }
    while (panelTabsEl.firstChild) { panelTabsEl.removeChild(panelTabsEl.firstChild); }
    var list = tabsList(), i;
    /* 默认落**第一个模块页**（Lead 2026-10-05 定）。
       理由：用户点球是想看自己的剧情状态，默认甩给他一屏设置开关是错的第一印象；
       而 tab 就在眼前，不需要靠"默认落在设置页"来教他。设置页仍然钉在最后一个。 */
    if (!activeTab || !list.some(function (t) { return t.id === activeTab; })) {
      activeTab = list.length ? list[0].id : '__settings';
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

    /* 空态统一走纯函数 panelTabPlan —— 它会带上引导句（"怎么才会有内容"），
       而且在"示例数据开着"时**不会**同时喊"没有数据"（那就自相矛盾了）。 */
    var plan = panelTabPlan(currentStat, settings, activeTab);
    if (plan.kind === 'empty') {
      for (var k = 0; k < plan.lines.length; k++) {
        panelBody.appendChild(mk('div', 'kami-status-empty', plan.lines[k]));
      }
      return;
    }
    for (var i = 0; i < plan.rows.length; i++) {
      var row = mk('div', 'kami-status-row');
      row.appendChild(mk('span', 'kami-status-k', plan.rows[i].key));
      var vb = mk('span', 'kami-status-v');
      renderValue(plan.rows[i].value, vb);
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
    /* 连体状态写在舞台上：横幅据此收掉下面两个圆角与下边框，接缝只剩一条线 */
    if (stage) { stage.setAttribute('data-kami-connected', want ? '1' : '0'); }
    /* ⚠️ 用户 2026-10-05：去掉「示例」的**视觉标注**（调试完会删示例数据，不用标）。
       标题就是标题，不再缀"（示例）"。 */
    if (panelTitleEl) { panelTitleEl.textContent = STATUS_COPY.label; }
    if (want) { renderTabs(); renderPanelBody(); }
  }

  /* 调宽手柄：拖拽改宽度 + 双击复位。与球的拖动共用同一套 pointer 捕获写法。 */
  function bindGrip() {
    if (!grip) { return; }
    grip.addEventListener('pointerdown', function (ev) {
      if (disposed || ev.button > 0) { return; }
      gripDrag = {
        id: ev.pointerId, sx: ev.clientX,
        base: curLayout ? curLayout.width : MIN_RIBBON_W,
        dir: curLayout ? curLayout.dir : 'right'
      };
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { }
      /* 别让这一下穿到横幅上（否则拖手柄会顺手把面板开出来） */
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { }
    });
    grip.addEventListener('pointermove', function (ev) {
      if (!gripDrag || ev.pointerId !== gripDrag.id) { return; }
      /* 镜像向左时手柄在左端，往左拖才是"变宽" */
      var delta = (gripDrag.dir === 'left') ? (gripDrag.sx - ev.clientX) : (ev.clientX - gripDrag.sx);
      var w = clampUserWidth(gripDrag.base + delta, viewCache.w || viewW());
      if (w === null) { return; }
      userWidth = w;
      paintRibbon();   /* 面板的位置与宽度都是从同一次布局来的，所以它跟着一起变 */
    });
    var endGrip = function (ev) {
      if (!gripDrag || (ev && ev.pointerId !== gripDrag.id)) { return; }
      try { grip.releasePointerCapture(gripDrag.id); } catch (e) { }
      gripDrag = null;
      lastDragEnd = Date.now();   /* 调完宽那一下不算点击，不许顺手开面板 */
      if (saveTimer) { clearTimeout(saveTimer); }
      saveVars();
    };
    grip.addEventListener('pointerup', endGrip);
    grip.addEventListener('pointercancel', endGrip);
    /* 双击复位：userWidth 清成 null → 回到"内容撑开" */
    grip.addEventListener('dblclick', function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (e) { }
      userWidth = null;
      paintRibbon();
      saveVars();
      log('宽度已复位：回到由内容撑开');
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
    headEls = null; sampleTagEl = null; ribbon = null; panelEl = null; panelBody = null; panelTabsEl = null;
    panelOpen = false; activeTab = null; injectedStat = undefined; gripDrag = null;
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
          all[VARS_KEY] = {
            x: Math.round(geom.x), y: Math.round(geom.y), size: Math.round(geom.size),
            w: userWidth === null ? null : Math.round(userWidth), settings: settings
          };
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
