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

  /* RPG 界面的图标集（design/icons/*.svg，构建期内联成一张表）。
     表里只存 viewBox 与 path 的 d，外壳由 icon() 现拼 —— 所以图标**天然吃 currentColor**，
     18 套皮肤零改动就能给它们染色。表本身在 _status-view.js 之后内联，
     因为 icon() 要用它。 */
  /* @@KAMI_ICONS@@ */

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
  var curView = 'empty';  /* 'loading' | 'empty' | 'data' —— 三态 */
  var bootAt = Date.now();/* 加载态的超时窗口从这里起算 */
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
    normalizeUi();
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
    '#' + PANEL_ID + ' .kami-status-ribbon{position:absolute;left:0;top:0;margin:0;z-index:0;display:none;align-items:center;box-sizing:border-box;transform:translate3d(var(--kami-ribbon-x,0px),var(--kami-ribbon-y,0px),0);width:var(--kami-ribbon-w,0px);height:var(--kami-ribbon-h,0px);padding-right:var(--kami-status-pad-x,var(--kami-pad-lg-x,14px));padding-left:var(--kami-ribbon-inset,0px);overflow:hidden;border-radius:var(--kami-status-r,var(--kami-r-md,12px));background:var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96)));border:var(--kami-border-w,1px) solid var(--kami-status-line,var(--kami-line-strong,rgba(255,255,255,.28)));box-shadow:var(--kami-shadow-sm,0 4px 14px rgba(0,0,0,.35));pointer-events:auto;}',
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
        /* ⚠️ flex:0 0 auto 是关键：横幅是 display:flex，head 作为 flex item 默认 flex-shrink:1，
       会被压到比 max-content 还窄 —— 于是"量内容宽"量到的是被压过的宽度，
       横幅永远比文字窄一截、开头就被省略号吃掉（A 轮 scrollWidth 自噬的残留，截图里看到的那条）。
       不许压缩 + width:max-content，量出来才是"文字自然排完"需要的宽度。 */
    '#' + PANEL_ID + ' .kami-status-head{display:flex;flex-direction:column;gap:var(--kami-status-line-gap,2px);text-align:left;flex:0 0 auto;width:max-content;}',
    /* 三行、字号小（用户明确要求）。三行都省略号截断，标题栏不会被长文本撑爆 */
        /* ── 三行信息层级（B 轮定的）──
       主行（时间+天气）最重、地点次之、在场人物最轻；三行字号只分两级，靠**字重+颜色**拉层级，
       这样在窄屏收缩时层级不会因为字号一起缩水而糊掉。 */
    '#' + PANEL_ID + ' .kami-status-line{font-size:var(--kami-status-fs-sub,var(--kami-fs-xs,11px));line-height:var(--kami-status-lh,1.3);color:var(--kami-fg-mute,#a8a8b0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    /* ⚠️ 这里原来有 max-width:44vw —— 它就是"文字过早截断"的**最后一层**成因：
       390 视口下 44vw = 171.6px，正好把主行卡在 172px 上（截图里量到的就是这个数）。
       head 已经是 flex:0 0 auto + width:max-content，宽度该由文字自己决定；
       真放不下时由横幅的 overflow:hidden 裁，不需要每行再自设上限。 */
    '#' + PANEL_ID + ' .kami-status-line[data-kami-slot="time"]{font-size:var(--kami-status-fs-main,var(--kami-fs-sm,13px));font-weight:var(--kami-status-fw-main,600);color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID + ' .kami-status-line[data-kami-slot="place"]{color:var(--kami-fg-dim,#cfcfd6);}',
    /* 天气图标单独包一层：emoji 与汉字不在同一基线，靠 vertical-align 压齐 */
    '#' + PANEL_ID + ' .kami-status-wx{display:inline-block;font-size:1.05em;line-height:1;vertical-align:var(--kami-status-wx-shift,-0.12em);margin-left:0;}',   /* 前面的空格由文本节点提供，这里不再加间距 */
    '#' + PANEL_ID + ' .kami-status-line.is-empty{display:none;}',
    /* "示例"徽标：小、克制，但**看得见** —— 别让人把示例当成自己的剧情变量 */
    '#' + PANEL_ID + ' .kami-status-sample{display:inline-block;margin:0 0 2px;padding:0 5px;border-radius:var(--kami-r-pill,999px);font-size:calc(var(--kami-fs-xs,11px) * .9);line-height:1.5;color:var(--kami-accent,#7aa2f7);border:var(--kami-border-w,1px) solid var(--kami-accent-line,rgba(122,162,247,.45));}',

    /* ── 展开后的状态栏面板 ── */
        /* ⚠️ margin:0 是**必须**的：src/skin/base.css 里有一条通用子元素规则会给它加上
       margin-top:10px，于是连体面板被顶下去 10px、接缝裂开（皮肤截图里实测到的）。
       这个脚本的几何一律由 layoutOf 算，**不许被基础样式扰动**。 */
    '#' + PANEL_ID_PANEL + '{position:absolute;left:0;top:0;margin:0;box-sizing:border-box;transform:translate3d(var(--kami-panel-x,40px),var(--kami-panel-y,80px),0);z-index:1;width:var(--kami-panel-w,320px);max-height:70vh;display:none;flex-direction:column;pointer-events:auto;background:var(--kami-card,rgba(20,20,24,.97));color:var(--kami-fg,#f2f2f4);border:var(--kami-border-w,1px) solid var(--kami-line-strong,rgba(255,255,255,.18));border-radius:var(--kami-r-lg,12px);box-shadow:var(--kami-shadow,0 12px 40px rgba(0,0,0,.5));font-size:var(--kami-fs,15px);overflow:hidden;}',
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
    '#' + PANEL_ID_PANEL + ' .kami-status-bar{display:flex;align-items:center;gap:var(--kami-gap,8px);padding:var(--kami-status-pad-y,var(--kami-pad-lg-y,12px)) var(--kami-status-pad-x,var(--kami-pad-lg-x,14px));border-bottom:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.12));cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-bar:active{cursor:grabbing;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-title{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        /* 浮动 ✕：绝对定位在面板右上角，**不占布局** —— 少了一行标题也不会让接缝错位 */
    '#' + PANEL_ID_PANEL + ' .kami-status-x{position:static;flex:none;appearance:none;font:inherit;line-height:1;padding:2px 7px;border-radius:var(--kami-r-xs,6px);cursor:pointer;background:var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96)));color:var(--kami-fg-dim,#cfcfd6);border:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.16));opacity:.85;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-x:hover{opacity:1;color:var(--kami-fg,#f2f2f4);}',
        /* ⚠️ flex:none 是关键 —— 标签行是 flex item，默认 flex-shrink:1，
       内容一多它就被压缩到几乎没高度（用户看到的"被底下内容挡住"）。
       z-index 再兜一道：即使有内容越界也盖不住它。 */
    /* 标签行这一排：左边是可滚动的标签，右边是固定的 ✕ —— 两者是 flex 兄弟，互不重叠 */
    '#' + PANEL_ID_PANEL + ' .kami-status-tabsrow{display:flex;align-items:center;flex:none;position:relative;z-index:2;gap:var(--kami-gap,8px);padding:var(--kami-status-pad-y,var(--kami-pad-lg-y,12px)) var(--kami-status-pad-x,var(--kami-pad-lg-x,14px)) calc(var(--kami-gap,8px) / 2);}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tabs{display:flex;flex:1 1 auto;min-width:0;position:relative;gap:var(--kami-gap,8px);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab{appearance:none;font:inherit;white-space:nowrap;padding:5px 10px;border-radius:var(--kami-r-sm,8px);cursor:pointer;background:transparent;color:var(--kami-fg-dim,#cfcfd6);border:var(--kami-border-w,1px) solid transparent;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab.is-on{background:var(--kami-accent-soft,rgba(122,162,247,.18));color:var(--kami-fg,#f2f2f4);border-color:var(--kami-line,rgba(255,255,255,.16));}',
        /* min-height:0 必须写：flex 子项的默认 min-height:auto 会让它**顶开**容器而不滚动；
       flex:1 让它吃掉剩余高度，于是滚动发生在它内部，标签行纹丝不动。 */
    '#' + PANEL_ID_PANEL + ' .kami-status-body{flex:1 1 auto;min-height:0;position:relative;z-index:1;overscroll-behavior:contain;overflow-y:auto;padding:var(--kami-gap-lg,12px) var(--kami-status-pad-x,var(--kami-pad-lg-x,14px)) var(--kami-status-pad-y,var(--kami-pad-lg-y,12px));}',
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
    /* ── 游戏界面控件（值形态 → 视觉形式）──
       每个新令牌都可选，默认串到已有令牌；皮肤不定义任何一个也不会变形。 */
    /* 条：轨道用分隔线色，填充用强调色 */
    '#' + PANEL_ID_PANEL + ' .kami-w-bar{position:relative;display:inline-flex;align-items:center;gap:var(--kami-gap,8px);width:100%;max-width:var(--kami-status-bar-w,220px);height:var(--kami-status-bar-h,calc(var(--kami-fs-sm,13px) + 2px));border-radius:var(--kami-r-pill,999px);background:var(--kami-status-track,var(--kami-line,rgba(255,255,255,.10)));overflow:hidden;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar-fill{position:absolute;left:0;top:0;bottom:0;border-radius:var(--kami-r-pill,999px);background:var(--kami-status-fill,var(--kami-accent,#7aa2f7));transition:width .18s ease;}',
    /* 双向条：零点一根刻度；负的一段用另一种填充色，**一眼看得出是负的** */
    '#' + PANEL_ID_PANEL + ' .kami-w-bar.is-signed .kami-w-bar-fill{background:var(--kami-status-fill,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar.is-signed.is-neg .kami-w-bar-fill{background:var(--kami-status-fill-neg,var(--kami-fg-mute,#a8a8b0));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar-zero{position:absolute;top:0;bottom:0;width:var(--kami-border-w,1px);background:var(--kami-status-zero,var(--kami-line-strong,rgba(255,255,255,.34)));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar-num{position:relative;margin-left:auto;padding:0 var(--kami-gap,8px);font-size:var(--kami-fs-xs,11px);color:var(--kami-fg,#f2f2f4);font-variant-numeric:tabular-nums;}',
    /* 档位徽章：15 档只用 5 个配色 —— 靠**同一个强调色的透明度**分档，
       这样皮肤配 0 个色也能分得清；想给真彩色就定义 --kami-status-tier-N。 */
    '#' + PANEL_ID_PANEL + ' .kami-w-rank{display:inline-block;min-width:2.2em;text-align:center;padding:0 var(--kami-gap,8px);border-radius:var(--kami-r-xs,6px);font-weight:600;font-size:var(--kami-fs-xs,11px);line-height:1.7;background:var(--kami-accent-soft,rgba(122,162,247,.18));color:var(--kami-status-tier-3,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="1"]{color:var(--kami-status-tier-1,var(--kami-accent,#7aa2f7));opacity:.42;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="2"]{color:var(--kami-status-tier-2,var(--kami-accent,#7aa2f7));opacity:.6;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="3"]{color:var(--kami-status-tier-3,var(--kami-accent,#7aa2f7));opacity:.78;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="4"]{color:var(--kami-status-tier-4,var(--kami-accent,#7aa2f7));opacity:1;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="5"]{color:var(--kami-status-tier-5,var(--kami-accent,#7aa2f7));opacity:1;box-shadow:0 0 0 var(--kami-border-w,1px) var(--kami-accent-soft,rgba(122,162,247,.18));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-rank[data-kami-tier="0"]{opacity:1;color:var(--kami-fg-dim,#cfcfd6);}',
    /* 状态徽章：三档语气（好/中性/差） */
    '#' + PANEL_ID_PANEL + ' .kami-w-badge{display:inline-block;padding:0 var(--kami-gap,8px);border-radius:var(--kami-r-pill,999px);font-size:var(--kami-fs-xs,11px);line-height:1.8;background:var(--kami-accent-soft,rgba(122,162,247,.18));color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID_PANEL + ' .kami-w-badge[data-kami-tone="1"]{color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-w-badge[data-kami-tone="-1"]{color:var(--kami-status-warn,var(--kami-fg-mute,#a8a8b0));background:var(--kami-status-warn-bg,var(--kami-line,rgba(255,255,255,.10)));}',
    /* 列表 → 标签片 */
    '#' + PANEL_ID_PANEL + ' .kami-w-chips{display:inline-flex;flex-wrap:wrap;gap:calc(var(--kami-gap,8px) / 2);}',
    '#' + PANEL_ID_PANEL + ' .kami-w-chip{padding:0 calc(var(--kami-gap,8px) * .75);border-radius:var(--kami-r-xs,6px);font-size:var(--kami-fs-xs,11px);line-height:1.7;background:var(--kami-line,rgba(255,255,255,.10));color:var(--kami-fg-dim,#cfcfd6);}',
    /* 长文本 → 正文段落 */
    '#' + PANEL_ID_PANEL + ' .kami-w-text{margin:0;line-height:var(--kami-status-lh,1.3);word-break:break-word;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-num{font-variant-numeric:tabular-nums;color:var(--kami-accent,#7aa2f7);font-weight:600;}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bool{font-size:var(--kami-fs-xs,11px);}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bool[data-kami-on="1"]{color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bool[data-kami-on="0"]{color:var(--kami-fg-mute,#a8a8b0);}',
    /* ── 信息架构层（分区专属排版）── 全部走令牌，不写死颜色 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-sec{margin:0 0 var(--kami-gap-lg,12px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-sec-t{font-weight:600;color:var(--kami-accent,#7aa2f7);margin:0 0 2px;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-sec-s{color:var(--kami-fg-mute,#a8a8b0);font-size:var(--kami-fs-xs,11px);margin:0 0 var(--kami-gap,8px);}',
    /* HUD：一句话能看完 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-hud-line{display:flex;align-items:center;gap:var(--kami-gap,8px);flex-wrap:wrap;font-size:var(--kami-status-fs-main,var(--kami-fs-sm,13px));color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-hud-where{margin-top:2px;color:var(--kami-fg-dim,#cfcfd6);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-self{display:flex;align-items:center;gap:var(--kami-gap,8px);margin-top:var(--kami-gap,8px);padding:var(--kami-gap,8px);border-radius:var(--kami-status-r,var(--kami-r-md,12px));background:var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96)));border:var(--kami-border-w,1px) solid var(--kami-status-line,var(--kami-line-strong,rgba(255,255,255,.28)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-self-name{font-weight:600;color:var(--kami-fg,#f2f2f4);}',
    /* 头像：没图必须兜底，不能空着 */
    /* 头像：没图时按名字取一个**稳定但各不相同**的色相 → 不同角色一眼能分开 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--kami-status-avatar,40px);height:var(--kami-status-avatar,40px);border-radius:var(--kami-status-avatar-r,var(--kami-r-sm,9px));overflow:hidden;font-weight:700;background:var(--kami-status-avatar-bg,hsl(var(--kami-ia-hue,220) 45% 34% / .55));color:var(--kami-status-avatar-fg,hsl(var(--kami-ia-hue,220) 85% 78%));box-shadow:inset 0 0 0 var(--kami-border-w,1px) hsl(var(--kami-ia-hue,220) 70% 60% / .45);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-avatar[data-kami-fallback="1"]::after{content:"";position:absolute;width:150%;height:150%;background:radial-gradient(circle at 30% 25%,hsl(var(--kami-ia-hue,220) 90% 70% / .28),transparent 60%);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-avatar{position:relative;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-avatar-img{width:100%;height:100%;object-fit:cover;}',
    /* 角色卡 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-card{margin:0 0 var(--kami-gap,8px);padding:var(--kami-gap,8px);border-radius:var(--kami-status-r,var(--kami-r-md,12px));border:var(--kami-border-w,1px) solid var(--kami-status-line,var(--kami-line-strong,rgba(255,255,255,.28)));background:var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-card.is-self{border-color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-card-h{display:flex;align-items:center;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-card-name{font-weight:600;color:var(--kami-fg,#f2f2f4);display:flex;align-items:center;gap:calc(var(--kami-gap,8px)/2);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-card-alias{color:var(--kami-fg-mute,#a8a8b0);font-size:var(--kami-fs-xs,11px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-bars{margin:var(--kami-gap,8px) 0 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-bar-row{display:flex;align-items:center;gap:var(--kami-gap,8px);margin:2px 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-bar-row .kami-status-k{flex:none;width:var(--kami-status-kw,3.4em);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-rels{margin-top:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-rel{display:flex;align-items:center;gap:var(--kami-gap,8px);margin:2px 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-rel-to{flex:none;color:var(--kami-fg-dim,#cfcfd6);}',
    /* 折叠：所有分区共用同一个交互 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-fold{margin:var(--kami-gap,8px) 0 0;border-top:var(--kami-border-w,1px) dashed var(--kami-line,rgba(255,255,255,.10));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-fold-h{display:flex;align-items:center;gap:calc(var(--kami-gap,8px)/2);width:100%;margin:0;padding:calc(var(--kami-gap,8px)/2) 0;appearance:none;font:inherit;text-align:left;cursor:pointer;background:transparent;color:var(--kami-fg-dim,#cfcfd6);border:0;}',
    /* 折叠动效：grid-template-rows 0fr→1fr 可以做"高度自适应"的过渡；尊重减动效偏好 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-fold-b{display:grid;grid-template-rows:0fr;overflow:hidden;transition:grid-template-rows var(--kami-status-anim,180ms) ease;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-fold-b>div{min-height:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-fold[data-kami-open="1"] .kami-ia-fold-b{grid-template-rows:1fr;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-caret{transition:transform var(--kami-status-anim,180ms) ease;}',
    '@media (prefers-reduced-motion: reduce){',
    '  #' + PANEL_ID_PANEL + ' .kami-ia-fold-b,#' + PANEL_ID_PANEL + ' .kami-ia-caret,#' + PANEL_ID_PANEL + ' .kami-w-bar-fill{transition:none !important;}',
    '}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-caret{flex:none;color:var(--kami-fg-mute,#a8a8b0);}',
    /* 迷雾：未探明统一长这样 */
    /* 未探明：**真正的遮罩感** —— 斜纹盖一层 + 模糊 + 压暗，不是单纯 blur */
    '#' + PANEL_ID_PANEL + ' [data-kami-fog="1"]{position:relative;filter:blur(var(--kami-status-fog-blur,1px));opacity:var(--kami-status-fog-dim,.6);}',
    '#' + PANEL_ID_PANEL + ' [data-kami-fog="1"]::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:repeating-linear-gradient(45deg,var(--kami-status-fog-hatch,rgba(255,255,255,.06)) 0 4px,transparent 4px 8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-fog{color:var(--kami-fg-mute,#a8a8b0);font-style:italic;letter-spacing:.15em;}',
    /* 地图连通：用连接符把"能去哪"串成一条可见的路径 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-links{display:flex;flex-wrap:wrap;align-items:center;gap:calc(var(--kami-gap,8px)/2);margin:2px 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-link{display:inline-flex;align-items:center;gap:calc(var(--kami-gap,8px)/2);padding:0 calc(var(--kami-gap,8px)*.6);border-radius:var(--kami-r-pill,999px);background:var(--kami-line,rgba(255,255,255,.10));color:var(--kami-fg-dim,#cfcfd6);font-size:var(--kami-fs-xs,11px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-link::before{content:"⌁";color:var(--kami-accent,#7aa2f7);}',
    /* 地图层级 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-area{margin:var(--kami-gap,8px) 0 0 var(--kami-gap-lg,12px);padding-left:var(--kami-gap,8px);border-left:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.10));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-area-t{font-weight:600;color:var(--kami-fg-dim,#cfcfd6);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-spot{display:flex;gap:var(--kami-gap,8px);margin:2px 0 0 var(--kami-gap-lg,12px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-spot-t{flex:none;color:var(--kami-fg,#f2f2f4);}',
    /* 任务日志 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-quest-group{margin:0 0 var(--kami-gap-lg,12px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-quest{padding:var(--kami-gap,8px);margin:0 0 var(--kami-gap,8px);border-radius:var(--kami-status-r,var(--kami-r-md,12px));border:var(--kami-border-w,1px) solid var(--kami-status-line,var(--kami-line-strong,rgba(255,255,255,.28)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-quest.is-done{opacity:.68;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-quest-h{display:flex;align-items:center;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-quest-n{font-weight:600;color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-rep{display:flex;align-items:center;gap:var(--kami-gap,8px);margin:2px 0;}',
    /* 时间线 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-line{margin:0 0 var(--kami-gap-lg,12px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-line-h{display:flex;align-items:center;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-timeline{margin-top:var(--kami-gap,8px);}',
    /* 时间线：节点之间**有连线**；已发生实心、未发生空心虚线 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-node{position:relative;display:flex;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node::before{content:"";position:absolute;left:3px;top:1.1em;bottom:0;width:var(--kami-border-w,1px);background:var(--kami-status-tl-line,var(--kami-line-strong,rgba(255,255,255,.28)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node:last-child::before{display:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node-dot{position:relative;z-index:1;flex:none;width:7px;height:7px;margin-top:.45em;border-radius:50%;background:var(--kami-status-node,var(--kami-accent,#7aa2f7));box-shadow:0 0 0 3px var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96)));}',
    /* 未发生：空心 + 虚线连线，一眼看出"还没到那儿" */
    '#' + PANEL_ID_PANEL + ' .kami-ia-node.is-future .kami-ia-node-dot{background:transparent;border:var(--kami-border-w,1px) dashed var(--kami-status-tl-line,var(--kami-line-strong,rgba(255,255,255,.28)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node.is-future{opacity:.72;}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node.is-future::before{background:transparent;border-left:var(--kami-border-w,1px) dashed var(--kami-status-tl-line,var(--kami-line-strong,rgba(255,255,255,.28)));width:0;}',
    /* 当前节点：强调 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-node.is-now .kami-ia-node-dot{box-shadow:0 0 0 3px var(--kami-status-bg,var(--kami-card,rgba(40,42,52,.96))),0 0 0 5px var(--kami-accent-soft,rgba(122,162,247,.18));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node-c{flex:1;min-width:0;padding-bottom:var(--kami-gap-lg,12px);padding-left:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node-h{display:flex;align-items:center;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-node-t{font-weight:600;color:var(--kami-fg-dim,#cfcfd6);}',
    /* 不动产 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-estate{margin:0 0 var(--kami-gap-lg,12px);padding:var(--kami-gap,8px);border-radius:var(--kami-status-r,var(--kami-r-md,12px));border:var(--kami-border-w,1px) solid var(--kami-status-line,var(--kami-line-strong,rgba(255,255,255,.28)));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-facilities{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--kami-status-cell,108px),1fr));gap:var(--kami-gap,8px);margin-top:var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-facility{padding:calc(var(--kami-gap,8px)/2);border-radius:var(--kami-r-xs,6px);background:var(--kami-line,rgba(255,255,255,.10));}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-facility.is-built{box-shadow:inset 0 0 0 var(--kami-border-w,1px) var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-facility-n{font-weight:600;color:var(--kami-fg,#f2f2f4);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-facility-d{font-size:var(--kami-fs-xs,11px);color:var(--kami-fg-mute,#a8a8b0);}',
    /* 设定集 */
    '#' + PANEL_ID_PANEL + ' .kami-ia-lore{margin:0 0 var(--kami-gap,8px);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-lore-t{font-weight:600;color:var(--kami-fg-dim,#cfcfd6);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-truth{margin-top:2px;display:flex;gap:var(--kami-gap,8px);color:var(--kami-fg-dim,#cfcfd6);}',
    /* 浮动 ✕ 与标签行不重叠：标签行右侧预留的空间由上面的 padding-right 保证 */
    '#' + PANEL_ID_PANEL + ' .kami-status-hint{color:var(--kami-fg-mute,#a8a8b0);font-size:.92em;margin:2px 0 8px;}',
    /* ══ RPG 界面层（2026-10-07）══
       全部走 base.css 里新登记的那批令牌（--kami-sunken / --kami-bar-fill / --kami-map-* …），
       皮肤不定义任何一个也有一份像样的默认外观。 */

    /* 图标：只占位、吃 currentColor */
    '#' + PANEL_ID_PANEL + ' .kami-ico{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-ico svg{display:block;width:100%;height:100%;}',

    /* 主标签行：只留图标，当前项带文字（9 个标签在 420px 里排得下的关键） */
    '#' + PANEL_ID_PANEL + ' .kami-status-tab{display:inline-flex;align-items:center;gap:5px;position:relative;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab b{font-weight:600;}',
    '#' + PANEL_ID_PANEL + ' .kami-status-tab.is-on::after{content:"";position:absolute;left:6px;right:6px;bottom:-7px;height:2px;background:var(--kami-accent,#7aa2f7);border-radius:2px;}',

    /* 子 tab 条 */
    '#' + PANEL_ID_PANEL + ' .kami-subrow{display:flex;flex:none;padding:6px var(--kami-status-pad-x,var(--kami-pad-lg-x,14px));background:var(--kami-sunken,rgba(0,0,0,.30));border-bottom:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.12));}',
    '#' + PANEL_ID_PANEL + ' .kami-subs{display:flex;gap:4px;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-subs::-webkit-scrollbar{display:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-subtab{appearance:none;font:inherit;font-size:11.5px;white-space:nowrap;padding:4px 12px;border-radius:var(--kami-r-pill,999px);background:transparent;color:var(--kami-fg-mute,#8f99a3);border:var(--kami-border-w,1px) solid transparent;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}',
    '#' + PANEL_ID_PANEL + ' .kami-subtab.is-on{background:var(--kami-surface-2,var(--kami-card,rgba(40,42,52,.96)));color:var(--kami-fg,#f2f2f4);border-color:var(--kami-edge,var(--kami-line-strong,rgba(255,255,255,.28)));box-shadow:inset 0 -2px 0 var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-subtab-n{font-size:10px;opacity:.75;font-variant-numeric:tabular-nums;}',

    /* 筛选条 */
    '#' + PANEL_ID_PANEL + ' .kami-filterrow{display:flex;flex:none;padding:6px var(--kami-status-pad-x,var(--kami-pad-lg-x,14px)) 0;}',
    '#' + PANEL_ID_PANEL + ' .kami-fchips{display:flex;gap:5px;flex:1 1 auto;min-width:0;overflow-x:auto;scrollbar-width:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-fchips::-webkit-scrollbar{display:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-fchip{appearance:none;font:inherit;font-size:11px;white-space:nowrap;padding:3px 10px;border-radius:var(--kami-r-pill,999px);background:var(--kami-sunken,rgba(0,0,0,.30));color:var(--kami-fg-mute,#8f99a3);border:var(--kami-border-w,1px) solid var(--kami-line,rgba(255,255,255,.12));cursor:pointer;}',
    '#' + PANEL_ID_PANEL + ' .kami-fchip.is-on{background:var(--kami-accent-soft,rgba(122,162,247,.20));color:var(--kami-fg,#f2f2f4);border-color:var(--kami-accent-line,rgba(122,162,247,.55));}',

    /* 卡片：折叠主体 */
    '#' + PANEL_ID_PANEL + ' .kami-card{margin:0 0 8px;padding:9px;border-radius:var(--kami-card-r,var(--kami-r-md,10px));background:var(--kami-surface-2,var(--kami-card,rgba(40,42,52,.96)));border:var(--kami-border-w,1px) solid var(--kami-edge,var(--kami-line-strong,rgba(255,255,255,.28)));box-shadow:inset 0 1px 0 var(--kami-edge-in,rgba(255,255,255,.07));}',
    '#' + PANEL_ID_PANEL + ' .kami-card.is-compact{padding:8px 9px;}',
    '#' + PANEL_ID_PANEL + ' .kami-card.is-bad{border-color:var(--kami-status-warn,var(--kami-fg-mute,#a8a8b0));}',
    '#' + PANEL_ID_PANEL + ' .kami-card-h{display:flex;align-items:center;gap:9px;cursor:pointer;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-col{flex:1 1 auto;min-width:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-name{font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-alias{color:var(--kami-fg-mute,#8f99a3);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-n{flex:none;font-variant-numeric:tabular-nums;font-size:12px;font-weight:600;color:var(--kami-fg-dim,#cfcfd6);}',
    '#' + PANEL_ID_PANEL + ' .kami-card-mark{flex:none;width:1.2em;text-align:center;color:var(--kami-fg-mute,#8f99a3);font-size:13px;line-height:1;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-sum{color:var(--kami-fg-mute,#8f99a3);font-size:11.5px;margin-top:5px;padding-top:5px;border-top:var(--kami-border-w,1px) dashed var(--kami-line,rgba(255,255,255,.12));overflow:hidden;text-overflow:ellipsis;}',
    /* 折叠动效：grid-template-rows 0fr→1fr 可以过渡"高度自适应"，且尊重减动效偏好 */
    '#' + PANEL_ID_PANEL + ' .kami-card-body{display:grid;grid-template-rows:0fr;overflow:hidden;transition:grid-template-rows var(--kami-status-anim,180ms) ease;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-body>div{min-height:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-card.is-open .kami-card-body{grid-template-rows:1fr;}',
    '#' + PANEL_ID_PANEL + ' .kami-card-inner{padding-top:8px;}',
    '#' + PANEL_ID_PANEL + ' .kami-detail{display:block;}',
    '#' + PANEL_ID_PANEL + ' .kami-role-tag{font-size:10px;padding:0 6px;line-height:1.6;border-radius:var(--kami-r-xs,4px);background:var(--kami-line,rgba(255,255,255,.10));color:var(--kami-fg-mute,#8f99a3);font-weight:400;}',
    '#' + PANEL_ID_PANEL + ' .kami-eq-tag{font-size:10px;padding:0 6px;line-height:1.6;border-radius:var(--kami-r-xs,4px);background:var(--kami-accent-soft,rgba(122,162,247,.20));color:var(--kami-accent,#7aa2f7);border:var(--kami-border-w,1px) solid var(--kami-accent-line,rgba(122,162,247,.55));font-weight:400;}',
    /* 图标槽：凹陷的小方格（物品 / 势力 / 产业共用） */
    '#' + PANEL_ID_PANEL + ' .kami-slot{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:var(--kami-r-sm,8px);background:var(--kami-sunken,rgba(0,0,0,.30));box-shadow:inset 0 1px 2px rgba(0,0,0,.35),inset 0 0 0 var(--kami-border-w,1px) var(--kami-sunken-line,rgba(255,255,255,.10));color:var(--kami-fg-mute,#8f99a3);}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-item{color:var(--kami-status-tier-3,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-faction{color:var(--kami-status-tier-4,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-estate{color:var(--kami-status-tier-2,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-skill{color:var(--kami-status-tier-3,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-line{color:var(--kami-status-tier-4,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-quest{color:var(--kami-status-tier-5,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-lore{color:var(--kami-status-tier-2,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-dip{color:var(--kami-fg-dim,#cfcfd6);}',
    '#' + PANEL_ID_PANEL + ' .kami-slot.is-mount{color:var(--kami-status-tier-4,var(--kami-accent,#7aa2f7));}',

    /* 档位菱形：外框转 45°，文字反向转回来 */
    '#' + PANEL_ID_PANEL + ' .kami-rank-d{display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;transform:rotate(45deg);background:var(--kami-rank-bg,rgba(122,162,247,.20));border:var(--kami-border-w,1px) solid var(--kami-rank-edge,rgba(122,162,247,.55));border-radius:3px;margin:0 .35em;}',
    '#' + PANEL_ID_PANEL + ' .kami-rank-d-t{transform:rotate(-45deg);font-size:.68em;font-weight:700;color:var(--kami-rank-fg,#bcd4fb);line-height:1;}',

    /* 条：轨道是**凹陷槽**，填充是渐变 + 顶部高光（游戏的"厚"感主要来自这一层） */
    '#' + PANEL_ID_PANEL + ' .kami-w-bar{background:var(--kami-sunken,rgba(0,0,0,.30));box-shadow:inset 0 1px 2px rgba(0,0,0,.45),inset 0 0 0 var(--kami-border-w,1px) var(--kami-sunken-line,rgba(255,255,255,.10));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar-fill{background:var(--kami-bar-fill,linear-gradient(180deg,#8fb4f0,#5f86d6));box-shadow:inset 0 1px 0 var(--kami-bar-gloss,rgba(255,255,255,.28));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar.is-signed.is-neg .kami-w-bar-fill{background:var(--kami-bar-fill-neg,linear-gradient(180deg,#d98f8f,#a85252));}',
    '#' + PANEL_ID_PANEL + ' .kami-w-bar-num{text-shadow:0 1px 2px rgba(0,0,0,.7);}',

    /* 主角块 */
    '#' + PANEL_ID_PANEL + ' .kami-hero{display:flex;align-items:center;gap:10px;padding:10px;border-radius:var(--kami-card-r,var(--kami-r-md,10px));background:var(--kami-surface-2,var(--kami-card,rgba(40,42,52,.96)));border:var(--kami-border-w,1px) solid var(--kami-accent,#7aa2f7);box-shadow:inset 0 1px 0 var(--kami-edge-in,rgba(255,255,255,.07));}',
    '#' + PANEL_ID_PANEL + ' .kami-hero-col{flex:1 1 auto;min-width:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-hero-name{font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px;}',
    '#' + PANEL_ID_PANEL + ' .kami-hero-meta{color:var(--kami-fg-mute,#8f99a3);font-size:11.5px;margin:1px 0 3px;}',
    '#' + PANEL_ID_PANEL + ' .kami-thought{margin:6px 0;padding:6px 9px;border-left:3px solid var(--kami-accent-line,rgba(122,162,247,.55));background:var(--kami-sunken,rgba(0,0,0,.30));border-radius:0 var(--kami-r-xs,6px) var(--kami-r-xs,6px) 0;color:var(--kami-fg-dim,#cfcfd6);font-size:12px;}',

    /* 背包 */
    '#' + PANEL_ID_PANEL + ' .kami-wealth{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--kami-card-r,var(--kami-r-md,10px));background:var(--kami-surface-2,var(--kami-card,rgba(40,42,52,.96)));border:var(--kami-border-w,1px) solid var(--kami-edge,var(--kami-line-strong,rgba(255,255,255,.28)));color:var(--kami-status-tier-4,var(--kami-accent,#7aa2f7));font-variant-numeric:tabular-nums;margin-bottom:4px;flex-wrap:wrap;}',
    '#' + PANEL_ID_PANEL + ' .kami-wealth-i{font-weight:600;}',
    '#' + PANEL_ID_PANEL + ' .kami-slotgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:8px;margin-bottom:4px;}',
    '#' + PANEL_ID_PANEL + ' .kami-slotcell{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 6px;border-radius:var(--kami-card-r,var(--kami-r-md,10px));background:var(--kami-sunken,rgba(0,0,0,.30));box-shadow:inset 0 1px 2px rgba(0,0,0,.4),inset 0 0 0 var(--kami-border-w,1px) var(--kami-sunken-line,rgba(255,255,255,.10));color:var(--kami-fg-mute,#8f99a3);text-align:center;}',
    '#' + PANEL_ID_PANEL + ' .kami-slotcell.is-on{background:var(--kami-surface-2,var(--kami-card,rgba(40,42,52,.96)));box-shadow:inset 0 1px 0 var(--kami-edge-in,rgba(255,255,255,.07)),inset 0 0 0 var(--kami-border-w,1px) var(--kami-accent,#7aa2f7);color:var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-slotcell i{font-style:normal;font-size:10px;opacity:.8;}',
    '#' + PANEL_ID_PANEL + ' .kami-slotcell b{font-weight:600;font-size:11.5px;color:var(--kami-fg,#f2f2f4);overflow:hidden;text-overflow:ellipsis;max-width:100%;white-space:nowrap;}',

    /* 分区标题（带图标与计数） */
    '#' + PANEL_ID_PANEL + ' .kami-ia-sec-t{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--kami-accent,#7aa2f7);font-size:12.5px;margin:12px 0 5px;padding-left:7px;border-left:3px solid var(--kami-accent,#7aa2f7);}',
    '#' + PANEL_ID_PANEL + ' .kami-ia-sec-t:first-child{margin-top:0;}',
    '#' + PANEL_ID_PANEL + ' .kami-sec-n{margin-left:auto;font-weight:400;color:var(--kami-fg-mute,#8f99a3);font-size:11px;}',

    /* 地图节点图 */
    '#' + PANEL_ID_PANEL + ' .kami-graph{display:block;width:100%;height:auto;border-radius:var(--kami-card-r,var(--kami-r-md,10px));background:var(--kami-map-void,radial-gradient(circle at 40% 35%,#1e2530,#161b21 70%));}',
    '#' + PANEL_ID_PANEL + ' .kami-graph-edges line{stroke:var(--kami-map-edge,#4b5563);stroke-width:1.4;}',
    '#' + PANEL_ID_PANEL + ' .kami-graph-edges line.is-fog{stroke:var(--kami-map-edge-dash,#3a434e);stroke-dasharray:3 2.5;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode circle{fill:var(--kami-map-node-fill,#232a33);stroke:var(--kami-map-node-edge,var(--kami-accent,#7aa2f7));stroke-width:1.4;cursor:pointer;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode.is-fog circle{fill:var(--kami-map-fog-fill,#1a1f26);stroke:var(--kami-map-fog-edge,#3a434e);stroke-dasharray:3 2.5;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode.is-here circle{fill:var(--kami-map-here-fill,rgba(122,162,247,.22));stroke-width:2;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode-ring{fill:none;stroke:var(--kami-map-here-ring,rgba(122,162,247,.50));stroke-width:1.2;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode-t{fill:var(--kami-map-node-fg,#dbe4ee);font-size:5.2px;pointer-events:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-gnode.is-fog .kami-gnode-t{fill:var(--kami-map-fog-fg,#6b7784);}',
    '#' + PANEL_ID_PANEL + ' .kami-graph-legend{display:flex;align-items:center;gap:12px;padding:7px 2px 0;font-size:11px;color:var(--kami-fg-mute,#8f99a3);flex-wrap:wrap;}',
    '#' + PANEL_ID_PANEL + ' .kami-lg{display:inline-flex;align-items:center;gap:4px;}',
    '#' + PANEL_ID_PANEL + ' .kami-lg-dot{width:10px;height:10px;border-radius:50%;flex:none;}',
    '#' + PANEL_ID_PANEL + ' .kami-lg.is-here .kami-lg-dot{background:var(--kami-map-here-fill,rgba(122,162,247,.22));border:2px solid var(--kami-map-node-edge,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-lg.is-found .kami-lg-dot{background:var(--kami-map-node-fill,#232a33);border:2px solid var(--kami-map-node-edge,var(--kami-accent,#7aa2f7));}',
    '#' + PANEL_ID_PANEL + ' .kami-lg.is-unknown .kami-lg-dot{background:var(--kami-map-fog-fill,#1a1f26);border:2px dashed var(--kami-map-fog-edge,#3a434e);}',

    /* 面板内容容器：滚动在它上面，标签行 / 子 tab / 筛选条都不动 */
    '#' + PANEL_ID_PANEL + ' .kami-panelbox{display:block;}',
    '@media (prefers-reduced-motion: reduce){',
    '  #' + PANEL_ID_PANEL + ' .kami-card-body{transition:none !important;}',
    '}'
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

  /* ───────── 界面选择状态（子 tab / 筛选 / 折叠）─────────
     为什么单独有一份"明账"而不是从 DOM 上读：
       · 面板每次重画都会换掉所有节点，从 DOM 读等于每次都丢（旧版就是这样把折叠弄丢的）；
       · 存成数据之后，它可以进脚本变量、跟着账号走，重开酒馆还在原处；
       · 它也能被用例直接构造，于是"折叠状态"这件事是可测的，不必真机点。
     形状：{ sub: { 面板id: 子tabid }, filter: { 面板id: 档位id }, folds: { 折叠id: true=折起 } } */
  function normalizeUi() {
    var u = (settings && settings.ui) || {};
    if (!u.sub || typeof u.sub !== 'object') { u.sub = {}; }
    if (!u.filter || typeof u.filter !== 'object') { u.filter = {}; }
    if (!u.folds || typeof u.folds !== 'object') { u.folds = {}; }
    settings.ui = u;
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
    /* 三态：有数据 / 还在超时窗口内（加载中）/ 确实没有。
       加载中也要把横幅显示出来，否则用户看到的就是"没数据"，分不清坏了还是没好。 */
    curView = viewStateOf({
      hasData: !isEmptyStat(stat),
      elapsedMs: Date.now() - bootAt,
      timeoutMs: LOADING_MS
    });
    stage.setAttribute('data-kami-view', curView);
    if (curView === 'loading') {
      if (ribbon) { ribbon.hidden = false; }
      stage.setAttribute('data-kami-state', 'header');
      if (sampleTagEl === null && headEls[0]) { /* 占位，无实际动作 */ }
      headEls[0].textContent = STATUS_COPY.loading;
      headEls[0].classList.remove('is-empty');
      for (var q = 1; q < headEls.length; q++) { headEls[q].classList.add('is-empty'); }
      paintRibbon();
      return;
    }
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
      var el = headEls[i];
      while (el.firstChild) { el.removeChild(el.firstChild); }
      /* 空的那一行收起来：三行的**位置**不变（不跳），但不留一片空白 */
      if (!v) { el.classList.add('is-empty'); continue; }
      el.classList.remove('is-empty');
      if (i === 0) {
        /* 天气图标拆出来单独包一层，好让它跟汉字对齐基线（emoji 与汉字基线本来就不同高） */
        var sp = splitWeatherIcon(v);
        el.appendChild(HDOC.createTextNode(sp.icon ? (sp.text + ' ') : sp.text));
        if (sp.icon) {
          var wx = mk('span', 'kami-status-wx', sp.icon);
          wx.setAttribute('aria-hidden', 'true');
          el.appendChild(wx);
        }
      } else {
        el.textContent = v;
      }
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
  var panelOpen = false, activeTab = null, tabsRowEl = null;

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

    /* 用户 2026-10-06：面板里那行「剧情状态栏」**整行去掉** —— 横幅已经说明这是什么了。
       关闭入口改成**两个**（用户建议"两个都做"）：
         · 熟悉的人：**再点一次横幅/球** → togglePanel() 收起（横幅本来就是这个行为）；
         · 不熟悉的人：面板右上角这枚**浮动 ✕**（绝对定位，不占布局、不影响接缝）。 */
    /* ⚠️ 上一版把 ✕ 做成 position:absolute，靠给标签行加内边距避让 ——
       **只有滚到最右才不重叠**，中间滚动位置下标签照样从它底下穿过（截图里看得见）。
       真正的修法：把 ✕ 放进标签行这一排里当 **flex 兄弟**（flex:none），
       它永远占着自己的位置，标签行只能滚到它左边 —— **与滚动位置无关，永不重叠**。 */
    tabsRowEl = mk('div', 'kami-status-tabsrow');
    panelTabsEl = mk('div', 'kami-status-tabs');
    tabsRowEl.appendChild(panelTabsEl);
    var x = mk('button', 'kami-status-x', '✕');
    x.type = 'button';
    x.setAttribute('data-kami-act', 'status-close');
    x.setAttribute('aria-label', STATUS_COPY.close);
    x.setAttribute('title', STATUS_COPY.close);
    x.addEventListener('click', function (ev) { ev.stopPropagation(); togglePanel(false); });
    tabsRowEl.appendChild(x);
    panelEl.appendChild(tabsRowEl);

    panelBody = mk('div', 'kami-status-body');
    /* 两个委托监听器（内容区挂一次，不是每张卡挂一次）：卡片开合、二级折叠标题 */
    panelBody.addEventListener('click', onPanelBodyClick);
    panelBody.addEventListener('click', onFoldHeadClick);
    panelEl.appendChild(panelBody);

    /* ⚠️ 面板**不再独立拖拽**：连体之后它必须跟着横幅走。
       想移动整块，拖横幅/球 —— 那是同一个 geom 来源，面板自然跟随。 */
    stage.appendChild(panelEl);
  }

  function renderTabs() {
    if (!panelTabsEl) { return; }
    while (panelTabsEl.firstChild) { panelTabsEl.removeChild(panelTabsEl.firstChild); }
    var list = tabsList(), i;
    /* 默认落**第一个模块页**（Lead 2026-10-05 定）：用户点球是想看自己的剧情状态，
       甩给他一屏设置开关是错的第一印象。设置页仍然钉在最后一个。 */
    if (!activeTab || !list.some(function (t) { return t.id === activeTab; })) {
      activeTab = list.length ? list[0].id : '__settings';
    }
    for (i = 0; i < list.length; i++) {
      (function (tab) {
        /* 标签行只留图标，**只有当前项带文字** ——
           9 个"图标+文字"标签在 420px 宽的面板里排不下，末尾会被挤掉（实测）。
           文字仍挂在 title 上，鼠标悬停与读屏都拿得到。 */
        var on = tab.id === activeTab;
        var b = mk('button', 'kami-status-tab' + (on ? ' is-on' : ''));
        b.type = 'button';
        b.setAttribute('data-kami-tab', tab.id);
        b.setAttribute('aria-label', tab.label);
        b.title = tab.label;
        if (tab.icon) { b.appendChild(icon(tab.icon, 15)); }
        if (on) { b.appendChild(mk('b', '', tab.label)); }
        b.addEventListener('click', function () { activeTab = tab.id; renderTabs(); renderPanelBody(); });
        panelTabsEl.appendChild(b);
      })(list[i]);
    }
  }

  /* ── 值 → 控件（游戏界面）──
     **形态判断全在纯函数 widgetOf 里**（范围换算、档位分档、正负双向都在那边测过），
     这里只负责把算好的 kind 画出来 —— 一个数字都不在这层算。 */
  function renderWidget(key, v, box, path) {
    var w = widgetOf(key, v, path), i, el, fill;
    var kind = w.kind;

    if (kind === 'empty') { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }

    if (kind === 'bar') {
      el = mk('span', 'kami-w-bar');
      el.setAttribute('data-kami-group', w.group || '');
      fill = mk('span', 'kami-w-bar-fill');
      fill.style.width = w.pct.toFixed(1) + '%';
      el.appendChild(fill);
      el.appendChild(mk('span', 'kami-w-bar-num', String(w.value)));
      box.appendChild(el);
      return;
    }

    if (kind === 'signed') {
      /* 双向条：零点用一个刻度标出来，填充段按 widgetOf 算好的左右位置摆 */
      el = mk('span', 'kami-w-bar is-signed' + (w.negative ? ' is-neg' : ''));
      var zero = mk('span', 'kami-w-bar-zero');
      zero.style.left = w.zero.toFixed(1) + '%';
      el.appendChild(zero);
      fill = mk('span', 'kami-w-bar-fill');
      fill.style.left = w.fillLeft.toFixed(1) + '%';
      fill.style.width = w.fillWidth.toFixed(1) + '%';
      el.appendChild(fill);
      el.appendChild(mk('span', 'kami-w-bar-num', (w.value > 0 ? '+' : '') + w.value));
      box.appendChild(el);
      return;
    }

    if (kind === 'rank') {
      el = mk('span', 'kami-w-rank', w.label);
      el.setAttribute('data-kami-tier', w.known ? String(w.tier) : '0');
      box.appendChild(el);
      return;
    }

    if (kind === 'badge') {
      el = mk('span', 'kami-w-badge', w.text);
      el.setAttribute('data-kami-tone', String(w.tone));
      box.appendChild(el);
      return;
    }

    if (kind === 'chips') {
      el = mk('span', 'kami-w-chips');
      if (!w.items.length) { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }
      for (i = 0; i < w.items.length; i++) { el.appendChild(mk('span', 'kami-w-chip', w.items[i])); }
      box.appendChild(el);
      return;
    }

    if (kind === 'text') { box.appendChild(mk('p', 'kami-w-text', w.text)); return; }
    if (kind === 'num') { box.appendChild(mk('span', 'kami-w-num', String(v))); return; }
    if (kind === 'bool') {
      el = mk('span', 'kami-w-bool', v ? '●' : '○');
      el.setAttribute('data-kami-on', v ? '1' : '0');
      el.setAttribute('aria-hidden', 'true');
      box.appendChild(el);
      return;
    }
    if (kind === 'kv') { box.appendChild(mk('span', '', w.text)); return; }

    /* card：对象 → 继续摊一层 */
    renderValue(v, box, path);
  }

  /* 值 → DOM：形态由 widgetOf 决定；对象/数组继续递归。
     path 是键路径，widgetOf 靠它知道这个数字属于哪套规则体系（D&D / WOD / FU / FATE）。 */
  function renderValue(v, box, path) {
    var d = describeField(v), i;
    if (d.kind === 'empty') { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }
    if (d.kind === 'bool') {
      var s = mk('span', '', v ? '✓' : '✗');
      s.setAttribute('data-kami-kind', 'bool');
      box.appendChild(s);
      return;
    }
    if (d.kind === 'text') { box.appendChild(mk('span', '', String(resolveRef(v, nameIndex)))); return; }
    if (d.kind === 'number') { box.appendChild(mk('span', '', String(v))); return; }
    if (d.kind === 'list') {
      var parts = [];
      for (i = 0; i < d.items.length; i++) {
        var it = d.items[i];
        parts.push(typeof it === 'object'
          ? String(it && it.name ? it.name : '·')
          : String(resolveRef(it, nameIndex)));
      }
      box.appendChild(mk('span', '', parts.join(' / ')));
      return;
    }
    /* group：再摊一层。键和值都可能是实体 ID（relations 的键就是角色 ID），
       统一走共用的名字索引解析 —— 与标题栏、与 sectionsOf 是同一份逻辑。 */
    var keys = Object.keys(v);
    if (!keys.length) { box.appendChild(mk('span', 'kami-status-empty', '—')); return; }
    var wrap = mk('div', '');
    for (i = 0; i < keys.length; i++) {
      if (isNoiseField(keys[i])) { continue; }
      var row = mk('div', 'kami-status-row');
      /* 先解析实体名（char_player → 雷恩），再查中文标签表；表里没有就退回原键名 */
      row.appendChild(mk('span', 'kami-status-k', labelOf(resolveRef(keys[i], nameIndex))));
      var vb = mk('span', 'kami-status-v');
      /* ⚠️ 递归时也要走 renderWidget（不能退回旧的 renderValue 直写）——
         否则只有第一层有控件，角色/地图/势力这些**全是嵌套**的分区一个控件都长不出来
         （实测：八个分区里七个是 0 个条 / 0 个徽章）。 */
      renderWidget(keys[i], v[keys[i]], vb, (path || []).concat([keys[i]]));
      row.appendChild(vb);
      wrap.appendChild(row);
    }
    box.appendChild(wrap);
  }

    /* 当前这一屏用的名字索引（与标题栏共用 buildNameIndex）。
     ⚠️ 原来这一行在旧的"信息架构层"块开头，重构时那块被整段替换掉，
     声明跟着一起没了 —— 结果卡里的关系对象与地图的连通胶囊都取不到名字，
     浏览器直接抛 ReferenceError: nameIndex is not defined（实测踩到）。 */
  var nameIndex = {};

  /* ───────── 信息架构层的小积木 ─────────
     ⚠️ 这几个原来在旧的"信息架构层"块里，重构时那块被整段替换掉，
     函数跟着一起没了（浏览器报 avatarNode is not defined）。
     现在归到新渲染层，**只保留新卡片模型真正用到的那几个**：
     sec()（区块标题）与 fogText() 已经不用了 —— 前者换成带图标与计数的 .kami-ia-sec-t，
     后者换成 data-kami-fog 属性。 */
  function line(k, v) {
    var r = mk('div', 'kami-status-row');
    if (k !== null && k !== undefined && k !== '') { r.appendChild(mk('span', 'kami-status-k', String(k))); }
    var vb = mk('span', 'kami-status-v');
    if (v && v.nodeType) { vb.appendChild(v); } else { vb.appendChild(HDOC.createTextNode(String(v == null ? '' : v))); }
    r.appendChild(vb);
    return r;
  }
  /* 折叠块：所有二级细节共用同一个交互（用户要求"细节折叠要统一"） */
  function fold(id, title, inner, defaultOpen) {
    var box = mk('div', 'kami-ia-fold');
    var head = mk('button', 'kami-ia-fold-h');
    head.type = 'button';
    head.setAttribute('data-kami-fold', id);
    head.setAttribute('aria-expanded', defaultOpen ? 'true' : 'false');
    head.appendChild(mk('span', 'kami-ia-caret', defaultOpen ? '▾' : '▸'));
    head.appendChild(mk('span', '', title));
    var body = mk('div', 'kami-ia-fold-b');
    body.appendChild(inner);
    box.appendChild(head); box.appendChild(body);
    if (defaultOpen) { box.setAttribute('data-kami-open', '1'); }
    /* 事件走内容区的委托（onFoldHeadClick），这里**不挂监听器** —— 卡片每次重画都会换节点 */
    return box;
  }
  /* 头像：有图用图，没图按名字取色相兜底（同名同色、异名异色） */
  function avatarNode(a) {
    var box = mk('span', 'kami-ia-avatar');
    if (a && a.kind === 'image') {
      var im = mk('img', 'kami-ia-avatar-img'); im.src = a.src; im.alt = '';
      box.appendChild(im);
    } else {
      box.setAttribute('data-kami-fallback', '1');
      box.style.setProperty('--kami-ia-hue', String(hueOf((a && a.hueKey) || (a && a.text) || '')));
      box.appendChild(mk('span', 'kami-ia-avatar-t', (a && a.text) || '?'));
    }
    return box;
  }
  function barNode(b) {
    var el = mk('span', 'kami-w-bar');
    var f = mk('span', 'kami-w-bar-fill'); f.style.width = b.pct.toFixed(1) + '%';
    el.appendChild(f); el.appendChild(mk('span', 'kami-w-bar-num', String(b.value)));
    return el;
  }
  function signedNode(r) {
    var el = mk('span', 'kami-w-bar is-signed' + (r.negative ? ' is-neg' : ''));
    var z = mk('span', 'kami-w-bar-zero'); z.style.left = r.zero.toFixed(1) + '%';
    var f = mk('span', 'kami-w-bar-fill'); f.style.left = r.fillLeft.toFixed(1) + '%'; f.style.width = r.fillWidth.toFixed(1) + '%';
    el.appendChild(z); el.appendChild(f);
    el.appendChild(mk('span', 'kami-w-bar-num', (r.value > 0 ? '+' : '') + r.value));
    return el;
  }
  function chipsNode(items) {
    var el = mk('span', 'kami-w-chips');
    for (var i = 0; i < items.length; i++) { el.appendChild(mk('span', 'kami-w-chip', String(items[i]))); }
    return el;
  }
  function badgeNode(text, tone) {
    var el = mk('span', 'kami-w-badge', String(text));
    el.setAttribute('data-kami-tone', String(tone === undefined ? 0 : tone));
    return el;
  }

  /* 设置项：一行标签 + 一枚开关（原样保留旧的 checkbox，只是搬了位置） */
  function checkbox(labelText, hint, checked, onChange) {
    var row = mk('label', 'kami-status-set');
    row.appendChild(mk('span', '', labelText));
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

  /* ───────── 图标（内联表 → 行内 SVG）─────────
     表里只存 path 的 d，外壳每次现拼：这样 fill/stroke 走 currentColor，图标跟着文字变色，
     皮肤不需要为图标单独配一套颜色规则。拿不到图标（名字拼错 / 表里没有）时返回空 span，
     界面不会因为少一枚图标而塌。 */
  function icon(name, size) {
    var e = mk('span', 'kami-ico');
    var t = (typeof ICON_SVG !== 'undefined' && ICON_SVG) ? ICON_SVG[name] : null;
    var s = size || 16;
    e.style.width = s + 'px';
    e.style.height = s + 'px';
    if (!t) { return e; }
    var svg = HDOC.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', t.vb || '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var i, el;
    for (i = 0; i < (t.d || []).length; i++) {
      el = HDOC.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', t.d[i]);
      svg.appendChild(el);
    }
    for (i = 0; i < ((t.s || []).length); i++) {
      var parts = String(t.s[i]).split(' ');
      try {
        el = HDOC.createElementNS('http://www.w3.org/2000/svg', parts[0]);
        for (var j = 1; j < parts.length; j++) {
          var kv = parts[j].split('=');
          if (kv.length === 2) { el.setAttribute(kv[0], kv[1].replace(/"/g, '')); }
        }
        svg.appendChild(el);
      } catch (err) { }
    }
    e.appendChild(svg);
    return e;
  }

  /* ───────── 子 tab（RPG 界面层：每个主 tab 下面挂一层）─────────
     数据全部来自纯函数 panelPlanOf()，这里只负责画。
     子 tab 条只在**有两个以上**子 tab 时出现（只有一个就是没有选择，少占一行）。 */
  var curPlan = null;          /* panelPlanOf 最近一次的产物，排障与用例读它 */
  var panelPlan = null;        /* 当前面板 id */
  var subPlan = null;          /* 当前子 tab id */
  var panelBodyBox = null;     /* 子 tab 与筛选条下面的那块容器（滚动在它上面） */

  function renderSubRow(plan) {
    var row = mk('div', 'kami-subrow');
    if (!plan || !plan.subs || plan.subs.length < 2) { row.hidden = true; return row; }
    var wrap = mk('div', 'kami-subs');
    for (var i = 0; i < plan.subs.length; i++) {
      (function (s) {
        var b = mk('button', 'kami-subtab' + (s.id === plan.sub ? ' is-on' : ''));
        b.type = 'button';
        b.setAttribute('data-kami-sub', s.id);
        b.appendChild(HDOC.createTextNode(s.label));
        if (s.count) { b.appendChild(mk('span', 'kami-subtab-n', String(s.count))); }
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (disposed || !settings.ui) { return; }
          settings.ui.sub[panelPlan] = s.id;
          /* 换子 tab 时把筛选档清掉：不同子 tab 的档位不是一套，留着会指向不存在的档 */
          settings.ui.filter[panelPlan] = 'all';
          saveVars();
          renderTabs();
          renderPanelBody();
        });
        wrap.appendChild(b);
      })(plan.subs[i]);
    }
    row.appendChild(wrap);
    return row;
  }

  function renderFilterRow(plan) {
    var row = mk('div', 'kami-filterrow');
    if (!plan || !plan.filters || plan.filters.length < 2) { row.hidden = true; return row; }
    var wrap = mk('div', 'kami-fchips');
    for (var i = 0; i < plan.filters.length; i++) {
      (function (f) {
        var b = mk('button', 'kami-fchip' + (f.id === plan.filterId ? ' is-on' : ''));
        b.type = 'button';
        b.setAttribute('data-kami-filter', f.id);
        b.appendChild(HDOC.createTextNode(f.label + (f.count ? ' ' + f.count : '')));
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (disposed || !settings.ui) { return; }
          settings.ui.filter[panelPlan] = f.id;
          saveVars();
          renderPanelBody();
        });
        wrap.appendChild(b);
      })(plan.filters[i]);
    }
    row.appendChild(wrap);
    return row;
  }

  /* ───────── 折叠 ─────────
     折叠状态是**数据**（settings.ui.folds），不是 DOM 上读来的 ——
     所以重画一次不会把用户折开的块合上（这正是旧版清空重画丢状态的那个 bug）。 */
  function isFolded(foldId, dflt) {
    if (settings.ui && settings.ui.folds && Object.prototype.hasOwnProperty.call(settings.ui.folds, foldId)) {
      return settings.ui.folds[foldId] !== true;
    }
    return dflt === true;
  }
  function setFolded(foldId, folded) {
    if (!settings.ui) { return; }
    settings.ui.folds[foldId] = !!folded;
    saveVars();
  }
  function foldHead(el, foldId) {
    el.classList.add('kami-foldable');
    var grid = HDOC.createElement('div');
    grid.className = 'kami-foldgrid';
    return { el: el, grid: grid };
  }

  /* ───────── 卡片 ─────────
     一张卡 = 头部（图标槽 + 名字 + 类型 + 数量）+ 摘要行 + 详情。
     详情里的东西按 kind 分派；收起时**保留一行关键摘要**，否则全是一模一样的标题条，扫不出信息。 */
  function detailOf(card) {
    var box = mk('div', 'kami-detail'), i, j, row;
    if (card.kind === 'item') {
      if (card.realDesc) { box.appendChild(truthRow(card.realDesc)); }
      row = mk('div', 'kami-status-row');
      row.appendChild(mk('span', 'kami-status-k', labelOf('type')));
      row.appendChild(mk('span', 'kami-status-v', card.typeLabel + ' · ×' + card.count));
      box.appendChild(row);
      return box;
    }
    if (card.kind === 'skill') {
      if (card.desc) { box.appendChild(mk('p', 'kami-w-text', card.desc)); }
      return box;
    }
    if (card.kind === 'area') {
      var sr;
      for (i = 0; i < (card.spots || []).length; i++) {
        sr = mk('div', 'kami-ia-spot' + (card.spots[i].found ? '' : ' is-fog'));
        if (!card.spots[i].found) { sr.setAttribute('data-kami-fog', '1'); }
        sr.appendChild(mk('span', 'kami-ia-spot-t', card.spots[i].found ? card.spots[i].name : '？？？'));
        if (card.spots[i].found && card.spots[i].desc) { sr.appendChild(mk('span', 'kami-status-v', card.spots[i].desc)); }
        box.appendChild(sr);
      }
      if ((card.links || []).length) {
        var links = mk('div', 'kami-ia-links');
        links.appendChild(mk('span', 'kami-status-k', cpyText('reach')));
        for (i = 0; i < card.links.length; i++) {
          links.appendChild(mk('span', 'kami-ia-link', nameIndex[card.links[i]] || card.links[i]));
        }
        box.appendChild(links);
      }
      return box;
    }
    if (card.kind === 'faction') {
      for (i = 0; i < (card.reps || []).length; i++) {
        var r = card.reps[i];
        row = mk('div', 'kami-ia-rep');
        row.appendChild(mk('span', 'kami-status-k', (r.title || STATUS_COPY.subRep) + ' · ' + r.who));
        row.appendChild(signedNode(r));
        box.appendChild(row);
      }
      if (card.domain) { box.appendChild(line(cpyText('factionDomain'), card.domain)); }
      for (i = 0; i < (card.diplomacy || []).length; i++) {
        box.appendChild(line('对 ' + card.diplomacy[i].toward,
          card.diplomacy[i].relation + (card.diplomacy[i].trends ? '（' + card.diplomacy[i].trends + '）' : '')));
      }
      return box;
    }
    if (card.kind === 'dip') {
      if (card.trends) { box.appendChild(mk('p', 'kami-w-text', card.trends)); }
      return box;
    }
    if (card.kind === 'line') {
      if (card.summary) { box.appendChild(mk('p', 'kami-w-text', card.summary)); }
      var tl = mk('div', 'kami-ia-timeline');
      for (i = 0; i < (card.nodes || []).length; i++) {
        var n = card.nodes[i];
        var nb = mk('div', 'kami-ia-node' + (n.phase === 'future' ? ' is-future' : (n.phase === 'now' ? ' is-now' : '')));
        nb.appendChild(mk('span', 'kami-ia-node-dot', ''));
        var nc = mk('div', 'kami-ia-node-c');
        var nh = mk('div', 'kami-ia-node-h');
        if (n.round !== null && n.round !== undefined) { nh.appendChild(mk('span', 'kami-w-num', '#' + n.round)); }
        nh.appendChild(mk('span', 'kami-ia-node-t', n.title));
        nc.appendChild(nh);
        if (n.log) { nc.appendChild(mk('p', 'kami-w-text', n.log)); }
        if ((n.chars || []).length) { nc.appendChild(chipsNode(n.chars)); }
        nb.appendChild(nc);
        tl.appendChild(nb);
      }
      box.appendChild(tl);
      return box;
    }
    if (card.kind === 'quest') {
      if (card.objective) { box.appendChild(mk('p', 'kami-w-text', card.objective)); }
      if (card.client) { box.appendChild(line(cpyText('questClient'), card.client)); }
      if (card.line) { box.appendChild(line(cpyText('questLine'), card.line)); }
      if (card.reward) { box.appendChild(line(cpyText('questReward'), card.reward)); }
      if (card.limits) { box.appendChild(line(cpyText('questLimits'), card.limits)); }
      return box;
    }
    if (card.kind === 'estate') {
      if (card.desc) { box.appendChild(mk('p', 'kami-w-text', card.desc)); }
      if ((card.facilities || []).length) {
        var grid = mk('div', 'kami-ia-facilities');
        for (i = 0; i < card.facilities.length; i++) {
          var cell = mk('div', 'kami-ia-facility' + (card.facilities[i].built ? ' is-built' : ''));
          cell.appendChild(mk('div', 'kami-ia-facility-n', card.facilities[i].name));
          if (card.facilities[i].desc) { cell.appendChild(mk('div', 'kami-ia-facility-d', card.facilities[i].desc)); }
          grid.appendChild(cell);
        }
        box.appendChild(grid);
      }
      if ((card.residents || []).length) { box.appendChild(line(cpyText('estateResidents'), chipsNode(card.residents))); }
      return box;
    }
    if (card.kind === 'lore') {
      if (card.summary) { box.appendChild(mk('p', 'kami-w-text', card.summary)); }
      if (card.truth) { box.appendChild(truthRow(card.truth)); }
      return box;
    }
    /* ── 角色卡（kind 为空）：属性条 + 关系 + 身份与外貌；细节块默认收起 ── */
    var detail = card.foldId + ':more';
    if (card.identityLine || (card.identities || []).length || card.appearance || card.thoughts) {
      var inner = mk('div', '');
      if ((card.identities || []).length) { inner.appendChild(line(labelOf('identities'), chipsNode(card.identities))); }
      if (card.appearance) { inner.appendChild(line(labelOf('appearance'), card.appearance)); }
      if (card.thoughts) { inner.appendChild(line(labelOf('thoughts'), card.thoughts)); }
      for (i = 0; i < (card.details || []).length; i++) {
        var blk = card.details[i], ib = mk('div', '');
        for (j = 0; j < blk.rows.length; j++) {
          var vn = mk('span', '');
          renderWidget(blk.id, blk.rows[j].value, vn, ['characters', blk.id]);
          ib.appendChild(line(blk.rows[j].key, vn));
        }
        inner.appendChild(fold(blk.id, blk.label, ib, false));
      }
      box.appendChild(fold(detail, cpyText('moreInfo'), inner, false));
    }
    return box;
  }
  function truthRow(t) {
    var r = mk('div', 'kami-ia-truth');
    r.appendChild(mk('span', 'kami-w-chip', cpyText('truth')));
    r.appendChild(mk('span', '', String(t)));
    return r;
  }
  function cpyText(k) { return (STATUS_COPY && STATUS_COPY[k]) || k; }

  /** 纯文本折行：卡片头部那个 ＋ / − 的箭头用文本，不用图标（省一枚图标，也更容易对齐） */
  function foldMark(open) { return open ? '−' : '＋'; }

  function cardNode(card, plan) {
    var open = isFolded(card.foldId, true) === false;   /* 默认收起 → 只有显式存了"展开"才是展开 */
    var box = mk('div', 'kami-card' + (card.headless ? ' is-compact' : '') + (open ? ' is-open' : ' is-closed')
      + (card.tone === -1 ? ' is-bad' : (card.tone === 1 ? ' is-good' : '')));
    box.setAttribute('data-kami-fold', card.foldId);

    var head = mk('div', 'kami-card-h');
    if (card.avatar) { head.appendChild(avatarNode(card.avatar)); }
    else if (card.icon) { head.appendChild(slotNode(card.icon, card.kind || 'default')); }
    var col = mk('div', 'kami-card-col');
    var nm = mk('div', 'kami-card-name');
    nm.appendChild(HDOC.createTextNode(card.name || card.title || ''));
    if (card.role) { nm.appendChild(mk('span', 'kami-role-tag', card.role)); }
    if (card.rank) { nm.appendChild(diamondNode(card.rank)); }
    if (card.typeLabel) { nm.appendChild(mk('span', 'kami-role-tag', card.typeLabel)); }
    if (card.equipped) { nm.appendChild(mk('span', 'kami-eq-tag', cpyText('equipped'))); }
    col.appendChild(nm);
    var sub = card.alias || '';
    if (!sub && card.kind === 'item') { sub = card.typeLabel || ''; }
    if (!sub && card.kind === 'faction') { sub = [card.alias, card.type].filter(Boolean).join(' · '); }
    if (!sub && card.kind === 'estate') { sub = [card.type, card.owner].filter(Boolean).join(' · '); }
    if (!sub && card.kind === 'dip') { sub = card.name; }
    if (!sub && card.kind === 'area') { sub = card.realm + (card.found ? '' : ' · ' + cpyText('subUnknown')); }
    if (!sub && card.kind === 'lore') { sub = card.category || ''; }
    if (!sub && card.age) { sub = card.age; }
    if (sub) { col.appendChild(mk('div', 'kami-card-alias', sub)); }
    head.appendChild(col);
    if (card.count !== undefined && card.count !== null && card.count !== 1) {
      head.appendChild(mk('span', 'kami-card-n', '×' + card.count));
    }
    var mark = mk('span', 'kami-card-mark', foldMark(open));
    head.appendChild(mark);
    box.appendChild(head);

    var sum = card.summaryLine || '';
    if (sum && !open) { box.appendChild(mk('div', 'kami-card-sum', String(sum))); }

    var body = mk('div', 'kami-card-body');
    var inner = mk('div', 'kami-card-inner');
    var d = detailOf(card);
    if (d.firstChild) { inner.appendChild(d); }
    if (card.kind === '' || card.kind === undefined) {
      if ((card.bars || []).length) {
        var bars = mk('div', 'kami-ia-bars');
        for (var b = 0; b < card.bars.length; b++) {
          var brow = mk('div', 'kami-ia-bar-row');
          brow.appendChild(mk('span', 'kami-status-k', card.bars[b].key));
          brow.appendChild(barNode(card.bars[b]));
          bars.appendChild(brow);
        }
        inner.appendChild(bars);
      }
      for (var m = 0; m < (card.relations || []).length; m++) {
        var rel = card.relations[m], rr = mk('div', 'kami-ia-rel');
        rr.appendChild(mk('span', 'kami-ia-rel-to', '→ ' + rel.toward));
        rr.appendChild(signedNode({ value: rel.affinity, negative: rel.negative, zero: 50,
          fillLeft: rel.negative ? 50 - rel.pct / 2 : 50, fillWidth: rel.pct / 2 }));
        inner.appendChild(rr);
      }
      if ((card.goals && Object.keys(card.goals).length) || (card.plan || []).length) {
        var gi = mk('div', '');
        var gk = Object.keys(card.goals || {});
        for (var q = 0; q < gk.length; q++) { gi.appendChild(line(labelOf(gk[q]), card.goals[gk[q]])); }
        if ((card.plan || []).length) { gi.appendChild(line(labelOf('plan'), chipsNode(card.plan))); }
        inner.appendChild(fold(card.foldId + ':goals', labelOf('goals'), gi, false));
      }
    }
    body.appendChild(inner);
    box.appendChild(body);
    /* 整卡可点：点头部开合（事件走内容区的委托，不给每张卡各挂一个监听器） */
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    box.setAttribute('data-kami-fold-open', open ? '1' : '0');
    return box;
  }

  function slotNode(iconName, kind) {
    var e = mk('span', 'kami-slot' + (kind ? ' is-' + kind : ''));
    e.appendChild(icon(iconName, 16));
    return e;
  }
  function diamondNode(text) {
    var e = mk('span', 'kami-rank-d');
    e.appendChild(mk('span', 'kami-rank-d-t', String(text)));
    return e;
  }

  /* ───────── 主角概览 ───────── */
  function renderOverview(card) {
    var frag = HDOC.createDocumentFragment();
    if (!card) { return frag; }
    var hero = mk('div', 'kami-hero');
    hero.appendChild(avatarNode(card.avatar));
    var col = mk('div', 'kami-hero-col');
    var nm = mk('div', 'kami-hero-name', card.name || '');
    nm.appendChild(mk('span', 'kami-w-chip', cpyText('isSelf')));
    col.appendChild(nm);
    var meta = [card.alias, card.age, card.rank].filter(Boolean).join(' · ');
    if (meta) { col.appendChild(mk('div', 'kami-hero-meta', meta)); }
    if ((card.identities || []).length) {
      var ch = mk('div', 'kami-w-chips');
      for (var i = 0; i < card.identities.length; i++) { ch.appendChild(mk('span', 'kami-w-chip', card.identities[i])); }
      col.appendChild(ch);
    }
    hero.appendChild(col);
    frag.appendChild(hero);

    if (card.health) { frag.appendChild(badgeLine(cpyText('health'), card.health, card.tone)); }
    if ((card.bars || []).length) {
      frag.appendChild(mk('div', 'kami-ia-sec-t', labelOf('stats')));
      var bars = mk('div', 'kami-ia-bars');
      for (var b = 0; b < card.bars.length; b++) {
        var row = mk('div', 'kami-ia-bar-row');
        row.appendChild(mk('span', 'kami-status-k', card.bars[b].key));
        row.appendChild(barNode(card.bars[b]));
        bars.appendChild(row);
      }
      frag.appendChild(bars);
    }
    var gk = Object.keys(card.goals || {});
    if (gk.length || card.thoughts || (card.plan || []).length) {
      frag.appendChild(mk('div', 'kami-ia-sec-t', labelOf('goals')));
      for (var g = 0; g < gk.length; g++) { frag.appendChild(line(labelOf(gk[g]), String(card.goals[gk[g]]))); }
      if (card.thoughts) { frag.appendChild(mk('div', 'kami-thought', '「' + card.thoughts + '」')); }
      if ((card.plan || []).length) { frag.appendChild(line(labelOf('plan'), chipsNode(card.plan))); }
    }
    return frag;
  }
  function badgeLine(key, text, tone) {
    var row = mk('div', 'kami-status-row');
    row.appendChild(mk('span', 'kami-status-k', key));
    var v = mk('span', 'kami-status-v');
    v.appendChild(badgeNode(text, tone === undefined ? 0 : (tone > 0 ? 1 : (tone < 0 ? -1 : 0))));
    row.appendChild(v);
    return row;
  }

  /* ───────── 背包 ───────── */
  function renderBag(plan) {
    var frag = HDOC.createDocumentFragment(), i;
    if ((plan.wealth || []).length) {
      frag.appendChild(mk('div', 'kami-ia-sec-t', cpyText('wealth')));
      var wrow = mk('div', 'kami-wealth');
      wrow.appendChild(icon('coin', 15));
      for (i = 0; i < plan.wealth.length; i++) {
        wrow.appendChild(mk('span', 'kami-wealth-i', plan.wealth[i].name + ' ' + plan.wealth[i].value));
      }
      frag.appendChild(wrow);
    }
    var worn = 0;
    for (i = 0; i < (plan.slots || []).length; i++) { if (plan.slots[i].filled) { worn++; } }
    if (worn) {
      frag.appendChild(mk('div', 'kami-ia-sec-t', cpyText('wornSlots')));
      var grid = mk('div', 'kami-slotgrid');
      for (i = 0; i < plan.slots.length; i++) {
        var slot = plan.slots[i];
        var c = mk('div', 'kami-slotcell' + (slot.filled ? ' is-on' : ''));
        c.appendChild(icon(slot.icon, 18));
        c.appendChild(mk('i', '', slot.label));
        c.appendChild(mk('b', '', slot.name));
        grid.appendChild(c);
      }
      frag.appendChild(grid);
    }
    frag.appendChild(mk('div', 'kami-ia-sec-t', labelOf('items') + ((plan.cards || []).length ? ' · ' + plan.cards.length : '')));
    frag.appendChild(cardsFragment(plan));
    if ((plan.mounts || []).length) {
      frag.appendChild(mk('div', 'kami-ia-sec-t', cpyText('mount')));
      for (i = 0; i < plan.mounts.length; i++) {
        var m = plan.mounts[i];
        var mc = mk('div', 'kami-card is-compact');
        var mh = mk('div', 'kami-card-h');
        mh.appendChild(slotNode('horse', 'mount'));
        var mcol = mk('div', 'kami-card-col');
        var mnm = mk('div', 'kami-card-name');
        mnm.appendChild(HDOC.createTextNode(m.name));
        if (m.equipped) { mnm.appendChild(mk('span', 'kami-eq-tag', cpyText('riding'))); }
        mcol.appendChild(mnm);
        var msub = [m.type, m.status].filter(Boolean).join(' · ');
        if (msub) { mcol.appendChild(mk('div', 'kami-card-alias', msub)); }
        mh.appendChild(mcol);
        mc.appendChild(mh);
        if (m.desc) { mc.appendChild(mk('div', 'kami-card-sum', m.desc)); }
        frag.appendChild(mc);
      }
    }
    return frag;
  }

  /* ───────── 技能 ───────── */
  function renderSkill(plan) {
    var frag = HDOC.createDocumentFragment(), i, j;
    if (!(plan.groups || []).length) { return frag; }
    for (i = 0; i < plan.groups.length; i++) {
      var g = plan.groups[i];
      var title = mk('div', 'kami-ia-sec-t');
      title.appendChild(icon(g.icon, 13));
      title.appendChild(HDOC.createTextNode(g.label));
      title.appendChild(mk('span', 'kami-sec-n', String(g.count)));
      frag.appendChild(title);
      for (j = 0; j < plan.cards.length; j++) {
        if (plan.cards[j].section === g.id) { frag.appendChild(cardNode(plan.cards[j], plan)); }
      }
    }
    return frag;
  }

  /* ───────── 地图节点图（SVG）─────────
     坐标由纯函数 mapGraphOf 算好（归一化 0..1），这里只乘视野尺寸。
     节点连线的颜色全部走令牌，皮肤可以整套换；圆点半径在 DB 上放大 ——
     手机上 8px 的圆点根本点不中。 */
  function renderGraph(graph) {
    var frag = HDOC.createDocumentFragment(), i;
    if (!graph || !graph.nodes.length) { return frag; }
    var VB_W = 100, VB_H = 100;
    var svg = HDOC.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VB_W + ' ' + VB_H);
    svg.setAttribute('class', 'kami-graph');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', STATUS_COPY.subGraph);
    var gEdges = HDOC.createElementNS('http://www.w3.org/2000/svg', 'g');
    gEdges.setAttribute('class', 'kami-graph-edges');
    var pos = {}, j;
    for (j = 0; j < graph.nodes.length; j++) { pos[graph.nodes[j].id] = graph.nodes[j]; }
    for (j = 0; j < graph.edges.length; j++) {
      var a = pos[graph.edges[j].a], b = pos[graph.edges[j].b];
      if (!a || !b) { continue; }
      var ln = HDOC.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', (a.x * VB_W).toFixed(1));
      ln.setAttribute('y1', (a.y * VB_H).toFixed(1));
      ln.setAttribute('x2', (b.x * VB_W).toFixed(1));
      ln.setAttribute('y2', (b.y * VB_H).toFixed(1));
      ln.setAttribute('class', graph.edges[j].found ? 'is-found' : 'is-fog');
      gEdges.appendChild(ln);
    }
    svg.appendChild(gEdges);
    var gNodes = HDOC.createElementNS('http://www.w3.org/2000/svg', 'g');
    gNodes.setAttribute('class', 'kami-graph-nodes');
    for (j = 0; j < graph.nodes.length; j++) {
      var n = graph.nodes[j];
      var g = HDOC.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'kami-gnode' + (n.found ? '' : ' is-fog') + (n.current ? ' is-here' : ''));
      g.setAttribute('data-kami-node', n.id);
      if (n.current) {
        var ring = HDOC.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', (n.x * VB_W).toFixed(1));
        ring.setAttribute('cy', (n.y * VB_H).toFixed(1));
        ring.setAttribute('r', '9');
        ring.setAttribute('class', 'kami-gnode-ring');
        g.appendChild(ring);
      }
      var c = HDOC.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (n.x * VB_W).toFixed(1));
      c.setAttribute('cy', (n.y * VB_H).toFixed(1));
      c.setAttribute('r', '6');
      g.appendChild(c);
      var tx = HDOC.createElementNS('http://www.w3.org/2000/svg', 'text');
      tx.setAttribute('x', (n.x * VB_W).toFixed(1));
      tx.setAttribute('y', ((n.y * VB_H) + 11.5).toFixed(1));
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('class', 'kami-gnode-t');
      tx.appendChild(HDOC.createTextNode(n.found ? n.name : '？？？'));
      g.appendChild(tx);
      gNodes.appendChild(g);
    }
    svg.appendChild(gNodes);
    frag.appendChild(svg);
    var legend = mk('div', 'kami-graph-legend');
    legend.appendChild(legendItem('here', cpyText('mapHere')));
    legend.appendChild(legendItem('found', cpyText('filterFound')));
    legend.appendChild(legendItem('unknown', cpyText('filterUnknown')));
    /* 图例说明：三档之外再补一句"虚线=未探明通路"，否则用户不知道虚线什么意思 */
    legend.appendChild(legendItem('dash', cpyText('legendDash')));
    frag.appendChild(legend);
    return frag;
  }
  function legendItem(kind, text) {
    var e = mk('span', 'kami-lg is-' + kind);
    e.appendChild(mk('span', 'kami-lg-dot', ''));
    e.appendChild(HDOC.createTextNode(text));
    return e;
  }

  /* ───────── 通用卡片列表 ───────── */
  function cardsFragment(plan) {
    var frag = HDOC.createDocumentFragment(), i;
    if (!(plan.cards || []).length) {
      var lines = plan.emptyLines && plan.emptyLines.length ? plan.emptyLines : emptyStateText({ isSample: currentIsSample });
      for (i = 0; i < lines.length; i++) { frag.appendChild(mk('div', 'kami-status-empty', lines[i])); }
      return frag;
    }
    for (i = 0; i < plan.cards.length; i++) { frag.appendChild(cardNode(plan.cards[i], plan)); }
    return frag;
  }

  /* ───────── 设置（三个子 tab：模块 / 显示 / 关于）───────── */
  function renderSettingsSub(plan) {
    var frag = HDOC.createDocumentFragment(), i;
    if (plan.sub === 'about') {
      frag.appendChild(mk('div', 'kami-ia-sec-t', cpyText('about')));
      frag.appendChild(line(cpyText('aboutPreset'), selfNameOf()));
      frag.appendChild(line(cpyText('aboutTavern'), tavernVer()));
      frag.appendChild(line(cpyText('aboutHelper'), helperVer()));
      return frag;
    }
    if (plan.sub === 'display') {
      frag.appendChild(checkbox(STATUS_COPY.optShowHeader, STATUS_COPY.optShowHeaderHint, settings.options.showHeader, function (on) {
        settings.options.showHeader = on; saveVars(); paintHeader(currentStat);
      }));
      frag.appendChild(checkbox(STATUS_COPY.optShowHidden, STATUS_COPY.optShowHiddenHint, settings.options.showHidden, function (on) {
        settings.options.showHidden = on; saveVars(); renderPanelBody();
      }));
      frag.appendChild(checkbox(STATUS_COPY.optUseSample, STATUS_COPY.optUseSampleHint, settings.options.useSample, function (on) {
        settings.options.useSample = on; saveVars(); refresh();
      }));
      frag.appendChild(checkbox(STATUS_COPY.optAutoCloseGraph || '图太挤时自动切列表', '', settings.options.graphAutoList !== false, function (on) {
        settings.options.graphAutoList = on; saveVars(); renderPanelBody();
      }));
      return frag;
    }
    frag.appendChild(mk('div', 'kami-ia-sec-t', STATUS_COPY.settingsModules));
    for (i = 0; i < MODULES.length; i++) {
      (function (mod) {
        frag.appendChild(checkbox(STATUS_COPY[mod.copy], '', settings.modules[mod.id], function (on) {
          settings.modules[mod.id] = on;
          saveVars();
          renderTabs();
          renderPanelBody();
        }));
      })(MODULES[i]);
    }
    frag.appendChild(mk('div', 'kami-status-hint', STATUS_COPY.modulesHint || ''));
    return frag;
  }
  function selfNameOf() { try { return (typeof SELF_NAME === 'string' && SELF_NAME) ? SELF_NAME : ''; } catch (e) { return ''; } }
  function tavernVer() { try { var v = (typeof getTavernVersion === 'function') ? getTavernVersion() : ''; return String(v || '未知'); } catch (e) { return '未知'; } }
  function helperVer() { try { var v = (typeof getTavernHelperVersion === 'function') ? getTavernHelperVersion() : ''; return String(v || '未知'); } catch (e) { return '未知'; } }


  /* ───────── 面板主体 ─────────
     全部交给纯函数 panelPlanOf 决定"这一屏画什么"，这里只负责画。
     DOM 层做的判断只剩一件：把折叠/子 tab/筛选的**用户选择**存进 settings.ui。 */
  function renderPanelBody() {
    if (!panelBody) { return; }
    nameIndex = buildNameIndex(currentStat);

    var pid = (activeTab === '__settings' || !activeTab) ? 'settings' : activeTab;
    var plan = null;
    try {
      plan = panelPlanOf(currentStat, settings, pid, {
        sub: settings.ui ? settings.ui.sub[pid] : null,
        filter: settings.ui ? settings.ui.filter[pid] : null
      }, curLayout && curLayout.mobile ? 'drawer' : 'ribbon');
    } catch (e) {
      log('面板计划失败（' + pid + '）：' + msgOf(e));
    }
    if (!plan) { return; }
    curPlan = plan;
    panelPlan = pid;
    subPlan = plan.sub;

    /* 空白重建的最小面：子 tab 行与筛选行先移除，主体容器复用 */
    while (panelBody.firstChild) { panelBody.removeChild(panelBody.firstChild); }
    panelBody.appendChild(renderSubRow(plan));
    panelBody.appendChild(renderFilterRow(plan));
    panelBodyBox = mk('div', 'kami-panelbox');
    panelBody.appendChild(panelBodyBox);

    var frag;
    try {
      if (pid === 'settings') { frag = renderSettingsSub(plan); }
      else if (pid === 'status' && plan.sub === 'overview') {
        frag = HDOC.createDocumentFragment();
        var hero = renderOverview(plan.cards[0]);
        if (hero) { frag.appendChild(hero); }
      } else if (pid === 'status' && plan.sub === 'bag') { frag = renderBag(plan); }
      else if (pid === 'status' && plan.sub === 'skill') { frag = renderSkill(plan); }
      else if (pid === 'map_nodes' && plan.sub === 'graph') {
        frag = HDOC.createDocumentFragment();
        if (plan.listMode) {
          frag.appendChild(mk('div', 'kami-status-hint', STATUS_COPY.graphTooMany));
        } else {
          frag.appendChild(renderGraph(plan.graph));
        }
      } else { frag = cardsFragment(plan); }
    } catch (e) {
      log('渲染失败（' + pid + '/' + plan.sub + '）：' + msgOf(e));
      frag = HDOC.createDocumentFragment();
      frag.appendChild(mk('div', 'kami-status-empty', STATUS_COPY.emptyHint));
    }
    panelBodyBox.appendChild(frag);
  }

  /* ───────── 内容区事件委托 ─────────
     内容区每次重画都会换掉所有卡片，所以**不能**给每张卡各挂一个监听器
     （挂上就随重画一起丢掉，或者积累成一堆指向旧节点的闭包）。
     一个委托监听器吃三种点击：折叠开关、折叠标题、图上的节点。 */
  function onPanelBodyClick(ev) {
    if (disposed) { return; }
    var t = ev.target, guard = 0;
    while (t && t !== panelBody && guard++ < 12) {
      if (t.getAttribute && t.getAttribute('data-kami-fold-toggle') !== null) { break; }
      if (t.classList && t.classList.contains('kami-card-h')) { break; }
      if (t.getAttribute && t.getAttribute('data-kami-node')) { break; }
      t = t.parentNode;
    }
    if (!t || t === panelBody) { return; }
    if (t.getAttribute && t.getAttribute('data-kami-node')) {
      /* 点节点 = 跳到"地点详情"子 tab（图里点开某个区域，等价于去详情页看它） */
      try { ev.stopPropagation(); } catch (e) { }
      if (settings.ui) { settings.ui.sub[panelPlan] = 'detail'; settings.ui.filter[panelPlan] = 'all'; }
      saveVars(); renderTabs(); renderPanelBody();
      return;
    }
    var card = t, g2 = 0;
    while (card && card !== panelBody && g2++ < 8) {
      if (card.classList && card.classList.contains('kami-card')) { break; }
      card = card.parentNode;
    }
    if (!card || card === panelBody) { return; }
    var id = card.getAttribute('data-kami-fold');
    if (!id) { return; }
    try { ev.stopPropagation(); } catch (e) { }
    var open = card.getAttribute('data-kami-fold-open') === '1';
    setFolded(id, open);          /* 存的是"折起来了吗"，所以传反过来的值 */
    renderPanelBody();
  }

  /* 折叠块的标题点击（角色卡里的"细节"、目标这些二级折叠块） */
  function onFoldHeadClick(ev) {
    if (disposed) { return; }
    var t = ev.target, guard = 0;
    while (t && guard++ < 8) {
      if (t.classList && t.classList.contains('kami-ia-fold')) { break; }
      t = t.parentNode;
    }
    if (!t || !t.classList || !t.classList.contains('kami-ia-fold')) { return; }
    ev.stopPropagation();
    var on = t.getAttribute('data-kami-open') === '1';
    t.setAttribute('data-kami-open', on ? '0' : '1');
    var head = t.firstChild;
    if (head && head.getAttribute) { head.setAttribute('aria-expanded', on ? 'false' : 'true'); }
    if (head && head.firstChild) { head.firstChild.textContent = on ? '▸' : '▾'; }
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
    /* 面板里那行标题已整行去掉（用户 2026-10-06），这里不再需要更新标题 */
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
    headEls = null; sampleTagEl = null; ribbon = null; panelEl = null; panelBody = null; panelTabsEl = null; tabsRowEl = null;
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
          /* 注意：别叫 view —— status() 里已经有 view = "视口尺寸" 了，会互相盖掉 */
          viewState: curView,
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
    normalizeUi();
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
    /* 加载态到点后翻成"空态"：这段时间一直没读到变量，就不该再吊着用户 */
    try { setTimeout(function () { if (!disposed) { refresh(); } }, LOADING_MS + 50); } catch (e) { }
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
