/* ============================================================
 * 🎨 皮肤管理   v0.1
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 它是「外观的唯一来源」：
 *   · 自己向「🎛 脚本按钮」登记一个按钮（文案 = 🎨 + 当前皮肤短名）
 *   · 把选中皮肤的 CSS / 令牌 / 特效 下发到【酒馆页面】与【每一个消息 iframe】
 *   · 提供面板：切皮肤、调参数、开关高级特效
 *   · 被关闭或删除时，把注入的一切收回；各前端自动回落到自己内置的兜底皮肤
 *
 * 架构见 docs/皮肤契约.md（令牌 §3 / DOM §4 / 骨架 §5 / 包格式 §6）
 *
 * 约定：
 *   · 皮肤包是**纯 CSS**：本脚本只负责注入与开关，不向 iframe 注入任何 JS
 *   · 作用域：html[data-kami-skin="<id>"] .kami-root { … }
 *             兜底皮肤 html:not([data-kami-skin]) .kami-root { … }
 *   · 用户参数写在**后置**的 <style id="kami-skin-user"> 里，靠文档顺序覆盖皮肤默认值
 *   · ⛔ **酒馆本身的 UI 一个像素都不动**（2026-09-26 用户裁定「我们不动酒馆本身了」）：
 *     曾经有过一层「消息区外壳」（tavern.css → #sheld/#chat/.mes/.mes_text 的底色、圆角、间距、字体），
 *     两轮效果都被否，已整体删除；本脚本现在只往 <html> 写 5 个 data-kami-* 属性 + 注入皮肤 CSS，
 *     作用域全在 `.kami-root` 里（面板、引导、以及三个嵌入式前端自己的组件）。
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '0.1';
  var TAG = 'data-kami-skin';
  var STYLE_ID = 'kami-skin';
  var USER_STYLE_ID = 'kami-skin-user';
  var PREVIEW_STYLE_ID = 'kami-skin-preview';
  var PANEL_ID = 'kami-skin-panel';
  var API_NAME = 'KamiSkin';
  var VARS_KEY = 'kami-skin';
  var IFRAME_SEL = 'iframe[id^="TH-message--"]';
  var Z = 30000;

  /* ── 装饰模块（契约 §8）──
     皮肤用 skin.json 的 decor 声明「我需要哪些装饰」，本脚本负责把它们注入到
     酒馆页面与每一个消息 iframe，并在切皮肤 / 注销时**完整销毁**。
     各装饰模块（src/decor/<id>.js）在构建期内联成下面的 SRC 字符串常量
     （build/kami-doc.mjs，占位 @@KAMI_DECOR_D20@@ / @@KAMI_DECOR_D10@@），
     运行时注入成一个 <script>：每个文档各一份，各自 mount / destroy，互不干扰。 */
  /* 注册表：id → 选择器 / 教本 Script id / 样式 id / 模块暴露的全局名；src 由构建期补上 */
  var DECORS = [
    { id: 'd20', sel: '.kami-deco[data-kami-deco="d20"]', scriptId: 'kami-d20-js',
      styleId: 'kami-d20-css', global: 'KamiD20', className: 'kami-d20' },
    { id: 'd10', sel: '.kami-deco[data-kami-deco="d10"]', scriptId: 'kami-d10-js',
      styleId: 'kami-d10-css', global: 'KamiD10', className: 'kami-d10' }
  ];
  /* @@KAMI_DECOR_D20@@ */
  /* @@KAMI_DECOR_D10@@ */
  /* 构建期把上面的占位换成 var D20_SRC = "..."; / var D10_SRC = "...";
     未构建（源码直跑）时这两个名字不存在，injectDecor 会跳过并提示。 */
  if (typeof D20_SRC === 'string' && D20_SRC) { DECORS[0].src = D20_SRC; }
  if (typeof D10_SRC === 'string' && D10_SRC) { DECORS[1].src = D10_SRC; }

  /* 皮肤包由构建脚本注入（src/skins/<id>/） */
  /* @@KAMI_SKINS@@ */

  if (typeof SKINS === 'undefined' || !SKINS.length) {
    console.warn('[皮肤] 没有可用皮肤包，脚本不启动');
    return;
  }

  /* ───────── 宿主窗口 ───────── */

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

  function log(msg) {
    try { if (window.console && console.log) { console.log('[皮肤] ' + msg); } } catch (e) { }
  }
  /* 几何诊断：把「舞台 / 面板」的实测矩形写进控制台。
     窄屏抽屉的高度是舞台的百分比，出问题时只有这两个矩形能说清是哪一层塌了。 */
  function logGeom(where) {
    try {
      if (!panelRoot || !panelDrop) { return; }
      var st = panelRoot.getBoundingClientRect(), dp = panelDrop.getBoundingClientRect();
      var de = HDOC.documentElement;
      var box = function (r) { return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); };
      var toks = ['--kami-panel-x', '--kami-panel-y', '--kami-panel-w', '--kami-panel-h'].map(function (t) {
        return t.slice(13) + ':' + (panelRoot.style.getPropertyValue(t) || '空');
      }).join(' ');
      log('几何(' + where + ') 视口=' + de.clientWidth + 'x' + de.clientHeight + ' sheet=' + sheetMode() + ' 单栏=' + tavernSingleColumn() +
        ' layout=' + panelDrop.getAttribute('data-kami-layout') + ' open=' + panelDrop.getAttribute('data-kami-open') +
        ' 舞台=[' + box(st) + '] 面板=[' + box(dp) + '] 令牌 ' + toks +
        ' 舞台定位=' + HDOC.defaultView.getComputedStyle(panelRoot).position +
        ' 面板高=' + HDOC.defaultView.getComputedStyle(panelDrop).height);
    } catch (e) { }
  }

  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, '🎨 皮肤管理'); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }

  /* ───────── 状态 ───────── */

  /* 默认皮肤：有 grokbot（色块）就用它（用户指定），否则用第一个 */
  var PREFERRED = 'grokbot';
  var DEFAULT_SKIN_ID = (function () { for (var i = 0; i < SKINS.length; i++) { if (SKINS[i].id === PREFERRED) { return SKINS[i].id; } } return SKINS[0].id; })();
  var DEFAULT_STATE = {
    skinId: DEFAULT_SKIN_ID,
    scheme: '',                  // '' = 跟随皮肤默认
    motion: 'full',              // full | calm | off
    density: 'cozy',             // compact | cozy | roomy
    /* 正文前端（默认开）：把 <content> 里的正文交给嵌入式前端渲染（正则「前端|正文 v0.1」）。
       ⚠️ 值必须是字符串 '1' —— 面板的 flagRow 用 String(state[key]) === 选项值 判选中态，
       写布尔 true 会算出 'true' ≠ '1'，于是开关在界面上显示成「关」（用户点名要求默认显示开）。
       旧存档里可能存着布尔 true/false，读取一律走 bodyFrontOn() 归一。 */
    bodyFront: '1',
    effects: {},                 // { effectId: true }
    params: {},                  // { paramId: number }
    panel: { x: null, y: null, w: null, h: null, open: false }
  };
  var state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  var disposed = false;

  function findSkin(id) {
    for (var i = 0; i < SKINS.length; i++) { if (SKINS[i].id === id) { return SKINS[i]; } }
    return null;
  }
  function curSkin() { return findSkin(state.skinId) || SKINS[0]; }

  function readState() {
    var saved = null;
    try {
      if (typeof getVariables === 'function') {
        var all = getVariables({ type: 'script' });
        saved = all && all[VARS_KEY];
      }
    } catch (e) { log('读脚本变量失败：' + ((e && e.message) || e)); }
    if (!saved || typeof saved !== 'object') { return; }
    for (var k in DEFAULT_STATE) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_STATE, k)) { continue; }
      if (saved[k] === undefined || saved[k] === null) { continue; }
      if (k === 'panel' && typeof saved.panel === 'object') {
        for (var p in state.panel) {
          if (Object.prototype.hasOwnProperty.call(state.panel, p) && saved.panel[p] !== undefined) { state.panel[p] = saved.panel[p]; }
        }
        continue;
      }
      state[k] = saved[k];
    }
    if (!findSkin(state.skinId)) { state.skinId = SKINS[0].id; }
  }

  var saveTimer = null;
  function saveState() {
    if (saveTimer) { try { clearTimeout(saveTimer); } catch (e) { } }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (disposed) { return; }
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        all[VARS_KEY] = JSON.parse(JSON.stringify(state));
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('写脚本变量失败：' + ((e && e.message) || e)); }
    }, 250);
  }

  /* ───────── CSS 组装 ───────── */

  function escAttr(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* 结构兜底层：折叠显隐与双视图切换的默认行为；皮肤可以用同优先级更高的规则覆盖（契约 §4.3） */
  var STRUCT_CSS = [
    '.kami-collapse[data-kami-open="0"]>.kami-collapse-body{display:none;}',
    '.kami-collapse[data-kami-open="1"]>.kami-collapse-body{display:block;}',
    '.kami-drop>.kami-head,.kami-drop>.kami-tabs,.kami-drop>.kami-foot{flex:0 0 auto;}',
    '.kami-drop>.kami-body{flex:1 1 auto;min-height:0;}',
    '.kami-root[data-kami-view="raw"] [data-kami-view="render"]{display:none;}',
    '.kami-root[data-kami-view="render"] [data-kami-view="raw"]{display:none;}',
    /* 皮肤预览缩略（契约 §4.2 已登记 .kami-pv / .kami-pv-frame；trpg/skin.css 按它们写规则，不许删） */
    '.kami-pv{position:relative;display:block;overflow:hidden;border-radius:var(--kami-r-sm,8px);pointer-events:none;}',
    '.kami-pv-frame{width:100%;border:0;display:block;height:120px;pointer-events:none;}',
    '.kami-deco{display:none;}'
  ].join('');

  /* 面板几何层：脚本保证舞台铺满视口、面板至少能正常摆放；面板本体（.kami-drop）的外观与摆法/* 面板几何层：脚本保证舞台铺满视口、面板至少能正常摆放；面板本体（.kami-drop）的外观与摆法
   * 仍然归皮肤（契约 §4.4），但**舞台本身是结构，不是外观**，不能被皮肤夺走：
   *
   *   · 窄屏抽屉的高度是「舞台的百分比」（height:78% / 80%），而宽屏用的是脚本下发的 px 令牌
   *     （--kami-panel-w/-h，见 restoreGeometry）。所以一旦舞台不再是「铺满视口的 fixed 舞台」，
   *     它会退回成 in-flow 的普通块（唯一子元素是绝对定位的 .kami-drop → 高度 auto = 0），
   *     百分比基准随之变成 0：宽屏照常（令牌生效），窄屏却塌成 1–2px 的细条。
   *   · 而皮肤里到处都有的 `html[data-kami-skin="x"] .kami-root`（特异性 (0,2,1)）本来就能压过
   *     本层原来的 `.kami-root[data-kami-comp="panel"]`（(0,2,0)）：trpg 的
   *     `.kami-root{position:relative}` 正是靠皮肤自己又重复写了一遍舞台规则才没出事，
   *     rain/nixie 只是碰巧没给 .kami-root 写 position。这里把舞台规则的特异性抬到 (0,3,0)
   *     （重复一个类名），让「舞台 = 视口」这条保证真的成立，皮肤想改摆法请改 .kami-drop；
   *   · 用 top/right/bottom/left 四个长写属性（inset 简写兜底）而不是只写 inset，
   *     并归零 margin——皮肤给 .kami-root 的 margin（如 10px 0 6px）同样会缩掉舞台的高度。
   *
   *   · **min-height 必须是视口高度，不能是 0**（这是「面板只剩一条细线」的真根因，真机实测）：
   *       酒馆 public/style.css:143-148 给 <html> 写了 -webkit-transform:translateZ(0)
   *       （外加 -webkit-perspective:1000）—— 于是 position:fixed 的**定位包含块不再是视口，
   *       而是 <html> 的盒子**（transform/perspective 都会给 fixed 后代另立包含块）；
   *       酒馆又在 public/css/mobile-styles.css:2 + 250-254 里，≤1000px 时把 body 改成
   *       position:fixed —— body 一脱流，<html> 盒子里就没有任何 in-flow 内容，**盒高塌成 0**。
   *       两头一凑：我们这个「position:fixed;top:0;bottom:0」的舞台在 ≤1000px 的宽度下只有
   *       「视口宽 × 0」高 —— 实测 视口991x967 时 舞台=[0,0,991,0]；视口390x844 时 舞台=[0,0,390,0]。
   *       舞台一塌，抽屉的 height:78% 与悬浮窗的 max-height:calc(100% - 24px) 全按 0 算，
   *       .kami-drop 只剩边框那 ~1px，用户看到的就是「一条细线」（实测 面板=[317,171,643,1]）。
   *       所以这里用**视口单位**给舞台兜住下限：vw/vh/dvh 与包含块无关，html 有没有 transform 都一样；
   *       宽度用 left/right 撑（本来就等于视口宽），高度才需要 min-height 兜。
   *       注：契约 §2 第 3 条「不得用 vh 做 min-height」是对**皮肤**的要求（消息 iframe 里没有视口），
   *       这里是平台几何层、只作用于酒馆页面里的面板舞台，两边不冲突。
   */
  var STAGE_SEL = '.kami-root.kami-root[data-kami-comp="panel"]';
  /* 贴底抽屉的几何。由脚本按「酒馆自己是不是已经切成只有中间栏」下发的
     data-kami-layout="sheet" 决定（见 sheetMode / tavernSingleColumn），不再自己猜 768。 */
  var SHEET_BODY = 'left:0 !important;right:0 !important;top:auto !important;bottom:0 !important;width:auto !important;height:78% !important;max-height:78% !important;' +
    'border-radius:var(--kami-r-lg,14px) var(--kami-r-lg,14px) 0 0;';
  var GEOMETRY_CSS = [
    STAGE_SEL + '{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;width:auto;height:auto;',
    'min-height:100vh;min-height:100dvh;margin:0;z-index:' + Z + ';pointer-events:none;}',
    '/* 舞台定位：特异性 (0,3,0)，皮肤里常见的 .kami-surface{position:relative} (0,2,1) 顶不掉它。 */',
    '.kami-root .kami-drop.kami-drop{position:absolute;left:var(--kami-panel-x,50%);top:var(--kami-panel-y,72px);',
    'width:var(--kami-panel-w,min(420px,calc(100% - 24px)));height:var(--kami-panel-h,560px);',
    'max-height:calc(100% - 24px);pointer-events:auto;}',
    '/* 贴底抽屉：跟随酒馆自己的单栏状态（脚本下发 data-kami-layout="sheet"）。 */',
    '.kami-root[data-kami-comp="panel"] .kami-drop.kami-drop[data-kami-layout="sheet"]{' + SHEET_BODY + '}',
    '/* 兜底：脚本还没跑起来时按 768px 贴底（老行为，保留）。 */',
    '@media (max-width:768px){.kami-root[data-kami-comp="panel"] .kami-drop.kami-drop{' + SHEET_BODY + '}}'
  ].join('');


  function skinCssText(skin) {
    return '/* ==== struct ==== */\n' + STRUCT_CSS +
      '\n/* ==== panel geometry ==== */\n' + GEOMETRY_CSS +
      '\n/* ==== skin: ' + skin.id + ' ==== */\n' + (skin.css || '');
  }

  /* 用户参数 / 档位 → 一段后置 CSS（作用域与皮肤相同，靠顺序取胜） */
  function userCssText(skin) {
    var sel = 'html[' + TAG + '="' + escAttr(skin.id) + '"] .kami-root';
    var body = [];
    /* 全局伪参数：字号缩放（所有皮肤都必须把它乘进 --kami-fs） */
    body.push('  --kami-fs-scale: ' + fsScale() + ';');
    var params = (skin.params || []);
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var v = state.params[p.id];
      if (v === undefined || v === null) { v = p.value; }
      if (typeof v !== 'number' || !isFinite(v)) { continue; }
      body.push('  ' + p.token + ': ' + v + (p.unit || '') + ';');
    }
    /* 明暗 / 动效 / 密度都用 <html> 属性表达，由皮肤自己写选择器 */
    return '/* ==== user params ==== */\n' + sel + ' {\n' + body.join('\n') + '\n}\n';
  }

  function fsScale() {
    var v = state.params['__fs'];
    return (typeof v === 'number' && isFinite(v)) ? v : 1;
  }

  function effectList() {
    var out = [], fx = curSkin().effects || [];
    for (var i = 0; i < fx.length; i++) {
      var id = fx[i].id;
      var on = state.effects[id];
      if (on === undefined) { on = !!fx[i].default; }
      if (on) { out.push(id); }
    }
    return out;
  }

  /* ── 面板该做成「贴底抽屉」还是「悬浮窗」：**跟着酒馆自己的单栏状态走** ──
     以前这里自己猜了一个 768px，结果落进一个「两边都不认」的宽度区间：
     酒馆早在 1000px 就把左右设置栏收起来变成「只有中间栏」了，我们的面板却还在 768 以上当悬浮窗。
     现在不去猜宽度，直接读酒馆自己的状态：
       酒馆 public/css/mobile-styles.css:2      @media screen and (max-width:1000px) { … }
       酒馆 public/css/mobile-styles.css:13-16  #rm_button_panel_pin_div, #lm_button_panel_pin_div { display:none; }
     也就是：**「把侧栏钉住」的那把小锁被藏起来的时候，就是酒馆进单栏的时候。**
     这两个控件是 index.html 里的常驻 DOM（酒馆 style.css:2768-2774 给它们 display:inline），
     没有任何 JS 去动它们的显隐，所以「计算样式 = 酒馆那份媒体查询的投影」——
     酒馆哪天改断点，我们跟着一起改，不用回来改这个文件。 */
  function tavernSingleColumn() {
    var any = false;
    try {
      /* 只认这两个：酒馆自己那条 ≤1000px 的规则隐藏的就是它们
         （#WI_button_panel_pin_div 酒馆 1.18 的 index.html 里根本没有，
         而且那条规则也没管它，拿它当信号会在 ≤1000px 时误判成「非单栏」）。 */
      var ids = ['lm_button_panel_pin_div', 'rm_button_panel_pin_div'];
      var view = HDOC.defaultView || HOST;
      for (var i = 0; i < ids.length; i++) {
        var el = HDOC.getElementById(ids[i]);
        if (!el) { continue; }
        any = true;
        if (view.getComputedStyle(el).display !== 'none') { return false; }
      }
    } catch (e) { }
    if (any) { return true; }
    /* 兜底：那几个控件不在（酒馆改版）时，用酒馆同一份 CSS 里的断点值。 */
    try { return !!(HOST.matchMedia && HOST.matchMedia('(max-width: 1000px)').matches); } catch (e) { return false; }
  }
  function sheetMode() { return tavernSingleColumn(); }

  /* ───────── 消息排版的「第三方宿主」标记 ────────
     ⛔ **已停用**（2026-09-26 用户裁定删掉消息楼层美化）。它配合「把皮肤字号/面铺到消息楼层」
     那套用；那套已整体回退，所以这里只剩一个空壳：`unmarkMesHosts()` 留着当**扫尾** ——
     老版本升级上来的页面上若还留着 data-kami-mes-host 标记，注销时清掉，页面上不留 kami 痕迹。
     要彻底删就删掉这个函数与它在 teardown 里的那一处调用。 */
  var MES_HOST_ATTR = 'data-kami-mes-host';
  function unmarkMesHosts() {
    var list, i;
    try { list = HDOC.querySelectorAll('[' + MES_HOST_ATTR + ']'); } catch (e) { return; }
    for (i = 0; i < list.length; i++) { list[i].removeAttribute(MES_HOST_ATTR); }
  }

  /* ───────── 下发：酒馆页面 + 每个消息 iframe ───────── */

  /* 只写 <html> 上的 5 个 data-kami-* 属性（皮肤作用域与档位）。
     ⛔ 2026-09-26 起**不再往酒馆 UI 写任何东西**（用户裁定「连外壳层美化也不需要，
     我们不动酒馆本身了」）：以前这里还会给 #chat 写 data-kami-mes、量原生字体并广播
     --kami-host-*，那套属于「消息区外壳美化」，已整体删除。 */
  function setAttrs(doc, skin) {
    try {
      var el = doc.documentElement;
      if (!el) { return; }
      el.setAttribute(TAG, skin.id);
      el.setAttribute('data-kami-scheme', state.scheme || skin.scheme || 'dark');
      el.setAttribute('data-kami-motion', state.motion);
      el.setAttribute('data-kami-density', state.density);
      el.setAttribute('data-kami-effects', effectList().join(' '));
    } catch (e) { }
  }
  function clearAttrs(doc) {
    try {
      var el = doc.documentElement;
      if (!el) { return; }
      el.removeAttribute(TAG);
      el.removeAttribute('data-kami-scheme');
      el.removeAttribute('data-kami-motion');
      el.removeAttribute('data-kami-density');
      el.removeAttribute('data-kami-effects');
    } catch (e) { }
  }

  function putStyle(doc, id, text) {
    try {
      var head = doc.head || doc.documentElement;
      if (!head) { return; }
      var st = doc.getElementById ? doc.getElementById(id) : null;
      if (!st) {
        st = doc.createElement('style');
        st.id = id;
        head.appendChild(st);
      }
      if (st.textContent !== text) { st.textContent = text; }
    } catch (e) { }
  }
  function dropStyle(doc, id) {
    try {
      var st = doc.getElementById ? doc.getElementById(id) : null;
      if (st && st.parentNode) { st.parentNode.removeChild(st); } else if (st) { st.remove(); }
    } catch (e) { }
  }

  function applyTo(doc) {
    if (disposed || !doc) { return; }
    var skin = curSkin();
    setAttrs(doc, skin);
    putStyle(doc, STYLE_ID, skinCssText(skin));
    putStyle(doc, USER_STYLE_ID, userCssText(skin));
    /* 装饰模块：皮肤声明了才注入；皮肤一换就销毁（契约 §8） */
    syncDecor(doc);
  }

  function iframeDoc(frame) {
    try { return frame && frame.contentDocument ? frame.contentDocument : null; } catch (e) { return null; }
  }

  function syncIframe(id) {
    try {
      var frame = HDOC.getElementById(id) || HDOC.querySelector('iframe[id="' + id + '"]');
      var doc = iframeDoc(frame);
      if (doc && doc.documentElement) { applyTo(doc); }
    } catch (e) { }
  }

  /* 只要有一条 iframe 变了，就顺手把「旧功能残渣」清一次（幂等、一条都不剩时立刻返回），
     再给新楼层的第三方宿主打标记（幂等：已打标的原样留着）。 */
  function syncAllIframes() {
    try {
      var frames = HDOC.querySelectorAll(IFRAME_SEL), i;
      for (i = 0; i < frames.length; i++) {
        var doc = iframeDoc(frames[i]);
        if (doc && doc.documentElement) { applyTo(doc); }
      }
    } catch (e) { }
    purgeBodyWraps();
  }

  function syncAll() {
    if (disposed) { return; }
    applyTo(HDOC);
    syncAllIframes();
    purgeBodyWraps();
  }

  /* ───────── 旧「正文美化包裹层」残渣清理（退役，契约 §9.7）─────────
     2026-09-25 做过一版「只把 <content> 标签内的正文包进 .kami-md 骨架」的功能
     （div.kami-root[data-kami-comp="body"]），2026-09-26 按用户裁定**整体退役**：
     改用全局层（src/skin/tavern.css）直接给 #chat 的消息楼层上皮肤排版，不再往
     楼层 DOM 里插任何节点 —— 复杂度归零，也不会和插件/既有前端抢层级。
     这里保留一次「扫尾」：万一页面上还留着旧版包出来的包裹层（老版本升级上来的
     用户、旧聊天复用了已渲染的 DOM），当场把里面的节点按原顺序搬回原位再删包裹层。
     幂等 + 惰性：整页一条都没有时是「一次 querySelectorAll 就返回」，可以挂在
     每条 iframe 事件链上跑（syncAll / syncAllIframes 末尾）。
     用 :scope > 认亲，只挑包裹层结构本身，绝不误伤面板里的 .kami-md 正文块。 */
  var MES_WRAP_SEL = '.kami-root[data-kami-comp="body"]';
  var MES_CHILD_SEL = ':scope > .kami-body.kami-md, :scope > div.kami-body.kami-md';

  function purgeBodyWraps() {
    if (disposed) { return; }
    var chat = HDOC.getElementById ? HDOC.getElementById('chat') : null;
    if (!chat) { return; }
    var wraps;
    try { wraps = chat.querySelectorAll(MES_WRAP_SEL); } catch (e) { return; }
    for (var i = wraps.length - 1; i >= 0; i--) {
      var root = wraps[i];
      var parent = root.parentNode;
      if (!parent) { continue; }
      var body = null;
      try { body = root.querySelector(MES_CHILD_SEL); } catch (e2) { body = root.firstElementChild; }
      if (!body) { continue; }
      try {
        while (body.firstChild) { parent.insertBefore(body.firstChild, root); }
        parent.removeChild(root);
      } catch (e3) { }   /* 万一搬不动（不该发生），留着包裹层总比丢内容强 */
    }
  }

  /* ───────── 装饰：注入 / 销毁（契约 §8）───────── */

  function decorOn(id) {
    var d = curSkin().decor;
    return !!(d && d.length && d.indexOf(id) >= 0);
  }

  function dropEl(doc, id) {
    try {
      var el = doc.getElementById ? doc.getElementById(id) : null;
      if (!el) { return; }
      if (el.parentNode) { el.parentNode.removeChild(el); } else if (el.remove) { el.remove(); }
    } catch (e) { }
  }

  /* 注入一份装饰模块到该文档，返回它暴露的 API（同一个文档只注入一次） */
  function injectDecor(doc, win, def) {
    if (!win) { return null; }
    if (typeof def.src !== 'string' || !def.src) {
      log('装饰模块源码没有内联（未经构建？），跳过 ' + def.id);
      return null;
    }
    try {
      var s = doc.createElement('script');
      s.id = def.scriptId;
      s.textContent = def.src;
      (doc.head || doc.documentElement).appendChild(s);
    } catch (e) { log(def.id + ' 注入失败：' + ((e && e.message) || e)); }
    if (win[def.global]) { return win[def.global]; }
    /* 兜底：内联 <script> 被 CSP 挡掉时，直接在该窗口求值（同源） */
    try { win.eval(def.src); } catch (e) { log(def.id + ' eval 兜底失败：' + ((e && e.message) || e)); }
    return win[def.global] || null;
  }

  function destroyOneDecor(doc, def) {
    try {
      var win = doc.defaultView;
      var m = win && win[def.global];
      if (m && typeof m.destroy === 'function') { m.destroy(doc); }
    } catch (e) { }
    /* 双保险：模块自己会收干净，这里再按 id 兜一次 */
    dropStyle(doc, def.styleId);
    dropEl(doc, def.scriptId);
  }

  function destroyDecor(doc) {
    if (!doc) { return; }
    for (var i = 0; i < DECORS.length; i++) { destroyOneDecor(doc, DECORS[i]); }
  }

  /* 每个文档 × 每个登记过的装饰模块走一遍：当前皮肤没声明该模块、
     或这个文档里根本没有槽位 —— 一律零成本返回。
     （所以 memo / rain / nixie 三套皮肤既不会注入脚本，也不会留下任何东西。） */
  /* ── 槽位改标（契约 §8 的「槽位自身属性」允许范围）──
     两个正则前端的槽位把 data-kami-deco 写死成 "d20"（那是 d10 出现前留下的记号）。
     皮肤声明的是别的模块（如 wod 声明 ["d10"]）而文档里又没有它的槽时，
     本层把槽位的 data-kami-deco 改标成声明的 id，让对应模块能认出它。
     改标前把原值记在槽位元素上（__kamiDecoOrig），皮肤切走 / 注销时原样还原，
     所以 trpg（声明 d20）永远拿到与改动前逐字节相同的槽位。 */
  var RETAG_SAVE = '__kamiDecoOrig';

  function retagDecor(doc) {
    var declared = (curSkin().decor || []);
    var want = null, i, j, d;
    for (i = 0; i < DECORS.length; i++) {
      d = DECORS[i];
      for (j = 0; j < declared.length; j++) {
        if (declared[j] === d.id) {
          if (want && want !== d.id) { return; }   /* 声明了多个不同模块：不猜，不改标 */
          want = d.id;
        }
      }
    }
    var wantDef = null;
    if (want) { for (i = 0; i < DECORS.length; i++) { if (DECORS[i].id === want) { wantDef = DECORS[i]; break; } } }
    try {
      var els = doc.querySelectorAll('.kami-deco[data-kami-deco]'), m;
      for (m = 0; m < els.length; m++) {
        var el = els[m];
        var now = el.getAttribute('data-kami-deco');
        var defNow = null;
        for (i = 0; i < DECORS.length; i++) { if (DECORS[i].id === now) { defNow = DECORS[i]; break; } }
        if (!defNow) { continue; }               /* 不是登记过的模块槽：不碰 */
        if (el[RETAG_SAVE] && defNow.id === want) { continue; }  /* 已是我们改标后的 */
        if (!wantDef || now === wantDef.id) { restoreOneDecoEl(el); continue; }  /* 目标模块回来了：还原 */
        /* 记录原值后改标 */
        if (!el[RETAG_SAVE]) { el[RETAG_SAVE] = { deco: now, cls: el.getAttribute('class') }; }
        el.setAttribute('data-kami-deco', wantDef.id);
      }
    } catch (e) { }
  }

  function restoreOneDecoEl(el) {
    var old = el[RETAG_SAVE];
    try {
      if (old) { el.setAttribute('data-kami-deco', old.deco); el.setAttribute('class', old.cls); }
      delete el[RETAG_SAVE];
    } catch (e) { }
  }

  function restoreDecor(doc, keep) {
    if (!doc) { return; }
    try {
      var els = doc.querySelectorAll('.kami-deco[data-kami-deco]'), m;
      for (m = 0; m < els.length; m++) { restoreOneDecoEl(els[m]); }
    } catch (e) { }
  }

  function syncOneDecor(doc, def) {
    var win = null;
    try { win = doc.defaultView; } catch (e) { }
    var dirty = false;
    try {
      dirty = !!(doc.getElementById(def.styleId) || doc.getElementById(def.scriptId) || doc.querySelector('.' + def.className));
    } catch (e) { }
    var slots = 0;
    if (decorOn(def.id)) {
      try { slots = doc.querySelectorAll(def.sel).length; } catch (e) { }
    }
    if (!slots) { if (dirty) { destroyOneDecor(doc, def); } return; }
    var api = win && win[def.global];
    if (!api) { api = injectDecor(doc, win, def); }
    if (api && typeof api.mount === 'function') {
      try { api.mount(doc); } catch (e) { log(def.id + ' 挂载失败：' + ((e && e.message) || e)); }
    }
  }

  function syncDecor(doc) {
    if (disposed || !doc) { return; }
    /* ① 先收掉这轮不再声明的模块（旧模块还占着槽位时，先让它还原、
          再改标 / 挂新模块，避免旧模块的 teardown 还原把新模块刚建的 DOM 冲掉） */
    for (var i = 0; i < DECORS.length; i++) {
      var def = DECORS[i];
      if (decorOn(def.id)) { continue; }
      var dirtyDead = false;
      try {
        dirtyDead = !!(doc.getElementById(def.styleId) || doc.getElementById(def.scriptId) || doc.querySelector('.' + def.className));
      } catch (e) { }
      if (dirtyDead) { destroyOneDecor(doc, def); }
    }
    try { retagDecor(doc); } catch (e) { }
    /* ② 再挂这一轮声明中的模块 */
    for (var j = 0; j < DECORS.length; j++) { syncOneDecor(doc, DECORS[j]); }
  }

  /* ───────── 面板 ───────── */

  /* 面板手势（标题栏下拉收回 / 内容区滚到顶下拉收回 / 左右滑切 tab）只有一份实现：
     src/scripts/_panel-gestures.js，构建期内联到这里（见 build/kami-doc.mjs）。 */
  /* @@KAMI_PANEL_GESTURES@@ */

  var panelRoot = null, panelDrop = null, panelHead = null, pane = 'skin', unsubs = [];
  var GESTURES = null;

  function mk(tag, cls, text) {
    var el = HDOC.createElement(tag);
    if (cls) { el.className = cls; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }

  function buildPanel() {
    if (panelRoot) { return; }
    panelRoot = mk('div', 'kami-root');
    panelRoot.id = PANEL_ID;
    panelRoot.setAttribute('data-kami-comp', 'panel');
    /* 舞台是“结构”：内联保证任何皮肤下都可拖动；外观由皮肤决定 */
    panelRoot.style.position = 'fixed';
    panelRoot.style.inset = '0';
    panelRoot.style.zIndex = String(Z);
    panelRoot.style.pointerEvents = 'none';

    panelDrop = mk('div', 'kami-drop kami-surface');
    panelDrop.setAttribute('data-kami-open', '0');
    panelDrop.style.pointerEvents = 'auto';
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');

    /* 头部 */
    var head = mk('div', 'kami-head');
    panelHead = head;
    head.setAttribute('data-kami-drag', '1');
    head.appendChild(mk('span', 'kami-dot'));
    var deco = mk('span', 'kami-deco');
    deco.setAttribute('data-kami-deco', 'd20');
    deco.setAttribute('aria-hidden', 'true');
    head.appendChild(deco);
    head.appendChild(mk('span', 'kami-title', '皮肤管理'));
    var sub = mk('span', 'kami-sub');
    sub.setAttribute('data-kami-role', 'cur');
    head.appendChild(sub);
    var acts = mk('span', 'kami-actions');
    var btnClose = mk('button', 'kami-icon-btn', '✕');
    btnClose.setAttribute('aria-label', '关闭');
    btnClose.setAttribute('data-kami-act', 'close');
    acts.appendChild(btnClose);
    head.appendChild(acts);
    panelDrop.appendChild(head);

    /* 标签页 */
    var tabs = mk('div', 'kami-tabs');
    tabs.setAttribute('role', 'tablist');
    [['skin', '皮肤'], ['param', '参数'], ['fx', '特效']].forEach(function (t) {
      var b = mk('button', 'kami-tab', t[1]);
      b.setAttribute('role', 'tab');
      b.setAttribute('data-kami-tab', t[0]);
      b.setAttribute('aria-selected', t[0] === pane ? 'true' : 'false');
      tabs.appendChild(b);
    });
    /* 皮肤快速切换下拉（2026-09-22 用户裁定：放在 **tab 行的最右端**）。
       两个实现要点：
         · `.kami-tabs` 是**横向滚动**容器（tab 多的时候要能滑），所以下拉框必须
           `position:sticky; right:0` 贴在右端 —— 普通子元素一滑动就跟着跑没了；
         · 用契约 §4.2 已登记的 `.kami-select`：六套皮肤都已经有它的外观与对比度规则，
           **不新增类名、不新增令牌**。外观归皮肤，这里只摆位置。
       选它就等于点那张皮肤卡（都走同一个 setSkin）。 */
    var pick = mk('select', 'kami-select');
    pick.setAttribute('data-kami-role', 'skin-pick');
    pick.setAttribute('aria-label', '快速切换皮肤');
    pick.style.maxWidth = '100%';
    pick.style.minWidth = '5.5em';
    var pickWrap = mk('span', '', '');
    pickWrap.style.display = 'flex';
    pickWrap.style.alignItems = 'center';
    pickWrap.style.position = 'sticky';
    pickWrap.style.right = '0';
    pickWrap.style.marginLeft = 'auto';
    pickWrap.style.flex = '0 0 auto';
    pickWrap.appendChild(pick);
    pick.addEventListener('change', function () { setSkin(pick.value); });
    tabs.appendChild(pickWrap);
    panelDrop.appendChild(tabs);

    /* 三个面板容器 */
    ['skin', 'param', 'fx'].forEach(function (k) {
      var body = mk('div', 'kami-body kami-scroll');
      body.setAttribute('data-kami-pane', k);
      if (k !== pane) { body.hidden = true; }
      panelDrop.appendChild(body);
    });

    /* 底部 */
    var foot = mk('div', 'kami-foot');
    var st = mk('span', 'kami-sub');
    st.setAttribute('data-kami-role', 'status');
    foot.appendChild(st);
    panelDrop.appendChild(foot);

    var rz = mk('span', 'kami-resize');
    rz.setAttribute('data-kami-act', 'resize');
    panelDrop.appendChild(rz);

    panelRoot.appendChild(panelDrop);
    HDOC.body.appendChild(panelRoot);

    restoreGeometry();
    bindPanelEvents();
    renderPane();
    /* 面板标题栏里的装饰槽是刚刚才创建的，这里补一次注入 */
    syncDecor(HDOC);
    log('面板已创建（' + (sheetMode() ? '移动端抽屉' : '桌面悬浮窗') + '）');
    logGeom('创建');
  }

  /* 面板尺寸的上下限与默认值（v2，2026-09-25 用户裁定）：
     皮肤管理面板的桌面档默认 **840×1120**（其它面板 40/60 各有自己的 PANEL_W/H 常量，不受影响）。
     默认值只在脚本变量里**没存过** w/h 时生效（老用户拖出过自定义尺寸的，继续用他们存的那套）。 */
  var PANEL_DEF_W = 840, PANEL_DEF_H = 1120;
  var PANEL_MIN_W = 300, PANEL_MIN_H = 240;
  function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function restoreGeometry() {
    if (!panelRoot || !panelDrop) { return; }
    /* 先把「贴底抽屉 / 悬浮窗」定下来，再决定下发不下发几何令牌。
       放在这里（而不是只在 resize 里）是为了让「打开」与「尺寸变化」两条路都过同一段代码 ——
       否则面板在下发过布局模式之前就被打开，就会用上一次的旧模式摆一次，看起来像「有时会失效」。 */
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');
    /* 面板几何属于「状态」：脚本只下发几何令牌，怎么摆由皮肤决定（契约 §4.4） */
    if (sheetMode()) {
      panelRoot.style.removeProperty('--kami-panel-x');
      panelRoot.style.removeProperty('--kami-panel-y');
      panelRoot.style.removeProperty('--kami-panel-w');
      panelRoot.style.removeProperty('--kami-panel-h');
      return;
    }
    var p = state.panel;
    var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
    /* 夹取一律用**当前**视口：存下来的那套几何可能是在另一个宽度下拖出来的
       （例如在 1600 的窗口里拖到 1200 宽，再缩到 1100），直接恢复就会跑到屏幕外、
       或者比视口还大 —— 这正是「有时也会失效」那一类时序问题。 */
    var w = clampNum((p.w === null || p.w === undefined) ? PANEL_DEF_W : p.w, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - 24));
    var h = clampNum((p.h === null || p.h === undefined) ? PANEL_DEF_H : p.h, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - 24));
    var x = (p.x === null || p.x === undefined) ? Math.max(12, (vw - w) / 2) : clampNum(p.x, -40, Math.max(-40, vw - 80));
    var y = (p.y === null || p.y === undefined) ? 72 : clampNum(p.y, 0, Math.max(0, vh - 48));
    /* v2 可视区约束：放大到 840×1120 后，矮/窄视口下任何一边都不许超出可视区
       （超出时按可视区留边收窄位置 —— 尺寸在上一行已按 vw-24 / vh-24 收窄）。
       老用户存过的位置也吃这条兜底：之前有存档能摆出「底部出屏」的组合，现在一并收回来。 */
    if (x + w > vw - 12) { x = Math.max(0, vw - w - 12); }
    if (y + h > vh - 12) { y = Math.max(0, vh - h - 12); }
    panelRoot.style.setProperty('--kami-panel-w', Math.round(w) + 'px');
    panelRoot.style.setProperty('--kami-panel-h', Math.round(h) + 'px');
    panelRoot.style.setProperty('--kami-panel-x', Math.round(x) + 'px');
    panelRoot.style.setProperty('--kami-panel-y', Math.round(y) + 'px');
  }

  function bindPanelEvents() {
    panelDrop.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== panelDrop) {
        var act = t.getAttribute && t.getAttribute('data-kami-act');
        var tab = t.getAttribute && t.getAttribute('data-kami-tab');
        if (tab) { setPane(tab); return; }
        if (act === 'close') { setOpen(false); return; }
        if (act && act.indexOf('skin:') === 0) { setSkin(act.slice(5)); return; }
        if (act && act.indexOf('fx:') === 0) { toggleEffect(act.slice(3)); return; }
        if (act && act.indexOf('flag:') === 0) { setFlag(act.slice(5)); return; }
        t = t.parentNode;
      }
    });

    /* 带 data-kami-act 的元素也要能键盘激活（皮肤卡片从 button 改成 div 之后补的） */
    panelDrop.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') { return; }
      var t = ev.target;
      while (t && t !== panelDrop) {
        if (t.getAttribute && t.getAttribute('data-kami-act')) { ev.preventDefault(); t.click(); return; }
        t = t.parentNode;
      }
    });

    /* 参数：滑杆与数字输入双向绑定 */
    panelDrop.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) { return; }
      var pid = t.getAttribute('data-kami-param');
      if (!pid) { return; }
      var v = Number(t.value);
      if (!isFinite(v)) { return; }
      setParam(pid, v, t);
    });

    /* 拖动 */
    var drag = null;
    panelDrop.addEventListener('pointerdown', function (ev) {
      var t = ev.target;
      var mode = null;
      while (t && t !== panelDrop) {
        if (t.getAttribute && t.getAttribute('data-kami-drag')) { mode = 'move'; break; }
        if (t.getAttribute && t.getAttribute('data-kami-act') === 'resize') { mode = 'size'; break; }
        t = t.parentNode;
      }
      if (!mode || sheetMode()) { return; }
      if (ev.target.closest && ev.target.closest('button')) { return; }
      var r = panelDrop.getBoundingClientRect();
      drag = { mode: mode, sx: ev.clientX, sy: ev.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
      try { panelDrop.setPointerCapture(ev.pointerId); } catch (e) { }
      ev.preventDefault();
    });
    panelDrop.addEventListener('pointermove', function (ev) {
      if (!drag) { return; }
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
      if (drag.mode === 'move') {
        /* v2 可视区约束：拖动整体不能出屏（以按下瞬间的面板尺寸为准，面板内不许拖到看不见） */
        var loX = Math.min(12, vw - drag.w - 12);
        var loY = Math.min(12, Math.max(0, vh - drag.h - 12));
        var nx = clampNum(drag.l + dx, Math.max(0, loX), Math.max(Math.max(0, loX), vw - drag.w - 12));
        var ny = clampNum(drag.t + dy, loY, Math.max(loY, Math.max(0, vh - drag.h - 12)));
        panelRoot.style.setProperty('--kami-panel-x', Math.round(nx) + 'px');
        panelRoot.style.setProperty('--kami-panel-y', Math.round(ny) + 'px');
        state.panel.x = Math.round(nx); state.panel.y = Math.round(ny);
      } else {
        /* v2 可视区约束：缩放同样不能把任何一边推出可视区（右/下边以 y/x 当前值为准不动） */
        var nwHi = Math.max(PANEL_MIN_W, Math.min(vw - 24, vw - drag.l - 12));
        var nhHi = Math.max(PANEL_MIN_H, Math.min(vh - 24, vh - drag.t - 12));
        var nw = clampNum(drag.w + dx, PANEL_MIN_W, nwHi);
        var nh = clampNum(drag.h + dy, PANEL_MIN_H, nhHi);
        panelRoot.style.setProperty('--kami-panel-w', Math.round(nw) + 'px');
        panelRoot.style.setProperty('--kami-panel-h', Math.round(nh) + 'px');
        state.panel.w = Math.round(nw); state.panel.h = Math.round(nh);
      }
    });
    panelDrop.addEventListener('pointerup', function (ev) {
      if (drag) { saveState(); }
      drag = null;
      try { panelDrop.releasePointerCapture(ev.pointerId); } catch (e) { }
    });

    /* 面板手势（共享模块，见文件上方内联的那一份）：
       ① 标题栏往下拖 → 收回；② 内容区滚到顶后再往下拖 → 收回；③ 正文左右滑 → 切 tab。
       原来的拖动 / 缩放 / 窄屏贴底一律不动：它们仍由上面那几个 pointer 监听负责。 */
    if (GESTURES) { try { GESTURES.destroy(); } catch (e) { } }
    GESTURES = bindPanelGestures({
      root: panelDrop,
      handle: function () { return panelHead; },
      pane: function () { return paneEl(pane); },
      tabs: function () { return panelDrop.querySelector('.kami-tabs'); },
      isSheet: sheetMode,
      onClose: function () { setOpen(false); },
      onStep: stepPane
    });
  }

  /* ③ 滑动的落点：按 tab 行里的**当前顺序**往上/下一个（到边就停，不循环） */
  var PANE_ORDER = ['skin', 'param', 'fx'];
  function stepPane(dir) {
    var at = PANE_ORDER.indexOf(pane);
    if (at < 0) { return; }
    var n = at + dir;
    if (n < 0 || n >= PANE_ORDER.length) { return; }
    setPane(PANE_ORDER[n]);
  }

  function setPane(k) {
    pane = k;
    var tabs = panelDrop.querySelectorAll('.kami-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-kami-tab') === k ? 'true' : 'false');
    }
    var panes = panelDrop.querySelectorAll('[data-kami-pane]');
    for (var j = 0; j < panes.length; j++) {
      panes[j].hidden = panes[j].getAttribute('data-kami-pane') !== k;
    }
    renderPane();
  }

  function paneEl(k) { return panelDrop ? panelDrop.querySelector('[data-kami-pane="' + k + '"]') : null; }

  /* tab 行右端那个皮肤下拉：选项一次建好，之后每次 renderPane 只同步选中项。
     列表为空（皮肤包没读到）时不显示这一枚，免得给出一个点不动的空框。 */
  function paintSkinPick() {
    if (!panelDrop) { return; }
    var pick = panelDrop.querySelector('[data-kami-role="skin-pick"]');
    if (!pick || !pick.parentNode) { return; }
    if (!SKINS || !SKINS.length) { pick.parentNode.hidden = true; return; }
    pick.parentNode.hidden = false;
    if (pick.options.length !== SKINS.length) {
      pick.textContent = '';
      SKINS.forEach(function (s) {
        var o = HDOC.createElement('option');
        o.value = s.id;
        o.textContent = s.name;
        pick.appendChild(o);
      });
    }
    var now = curSkin().id;
    if (pick.value !== now) { pick.value = now; }
  }

  function renderPane() {
    if (!panelDrop) { return; }
    paintSkinPick();
    var sub = panelDrop.querySelector('[data-kami-role="cur"]');
    if (sub) { sub.textContent = '🎨' + curSkin().button; }
    var st = panelDrop.querySelector('[data-kami-role="status"]');
    if (st) {
      st.textContent = curSkin().name + ' · 动效 ' + state.motion + ' · 密度 ' + state.density +
        ' · 特效 ' + (effectList().length || '无');
    }
    if (pane === 'skin') { renderSkinPane(); }
    else if (pane === 'param') { renderParamPane(); }
    else { renderFxPane(); }
  }

  /* 卡片里的迷你骨架：整块塞进一个 iframe，用「它自己那套皮肤」渲染。
     用 iframe 而不是「同页作用域替换」，是因为同页方案会被当前生效皮肤的同名规则渗透
     （当前皮肤把某一属性/某一个令牌设在 .kami-root 上时，迷你骨架只要自己没声明就会被它影响）。 */
  var PREVIEW_MINI = [
    /* data-kami-comp="preview" 是 §4.1 登记的第四个取值（trpg/skin.css 按它给 d20 装饰槽写规则），不许改。 */
    '<div class="kami-root" data-kami-comp="preview">',
    '<div class="kami-shell kami-surface">',
    '<div class="kami-head"><span class="kami-dot"></span><span class="kami-title">标题</span>',
    '<span class="kami-actions"><span class="kami-sub">128 字</span><span class="kami-chev">&#9656;</span></span></div>',
    '<div class="kami-body">',
    '<div class="kami-bar"><span class="kami-seg"><span class="kami-seg-item is-on">渲染</span><span class="kami-seg-item">原文</span></span>',
    '<span class="kami-btn kami-btn--ghost">复制</span></div>',
    '<div class="kami-md"><p>正文样例文字，用来看字体、行距与纸面质感。</p></div>',
    '<div class="kami-item kami-card" data-kami-kind="action"><span class="kami-card-head">',
    '<span class="kami-badge" data-kami-kind="action">行动</span><span class="kami-card-title">一个选项</span></span></div>',
    '</div></div></div>'
  ].join('');

  /* 把「某皮肤的预览文档」拼成一段完整 HTML（srcdoc 用）。
     面板自己用 previewSkeleton 嵌卡片；引导脚本也调它做皮肤预览小窗——
     同一份骨架、同一份皮肤 CSS，两边预览永远一致。 */
  function buildPreviewDoc(sk) {
    var fx = [];
    (sk.effects || []).forEach(function (e) { if (e.default) { fx.push(e.id); } });
    return '<!DOCTYPE html><html data-kami-skin="' + sk.id + '"' +
      ' data-kami-scheme="' + (sk.scheme || 'dark') + '"' +
      (fx.length ? ' data-kami-effects="' + fx.join(' ') + '"' : '') +
      '><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent;}</style>' +
      '<style>' + String(sk.css || '') + '</style></head><body>' + PREVIEW_MINI + '</body></html>';
  }

  function previewSkeleton(sk) {
    var wrap = mk('div', 'kami-pv');
    wrap.setAttribute('data-kami-preview', sk.id);
    var frame = HDOC.createElement('iframe');
    frame.className = 'kami-pv-frame';
    frame.setAttribute('scrolling', 'no');
    frame.srcdoc = buildPreviewDoc(sk);
    frame.addEventListener('load', function () {
      try { frame.style.height = Math.max(frame.contentDocument.body.scrollHeight, 40) + 'px'; } catch (e) { }
    });
    wrap.appendChild(frame);
    return wrap;
  }

  /* ---- 皮肤页 ---- */
  function renderSkinPane() {
    var box = paneEl('skin');
    if (!box) { return; }
    box.textContent = '';
    /* 「显示」卡（全局档位）整张放到**皮肤预览之前**（2026-09-25 用户裁定：放在皮肤预览上面）。
       只调「皮肤」页的卡片顺序；卡内行序保持现状。 */
    box.appendChild(sectionTitle('显示'));
    var g = mk('div', 'kami-card');
    /* 行序（2026-09-26 起）：
       ① 正文前端 —— 把 `<content>…</content>` 里的正文交给嵌入式前端渲染，**默认开**。
          它本质是一条酒馆正则（「前端|正文 v0.1」，在 list.json 里排在「显式思维链」**之前**）
          的启用位；开关与酒馆真正的正则开关**联动**（setBodyFront 读写正则表的启用位）。
          与下面三个档位同一类：全局、不随皮肤变、存在 state 顶层。
          默认值必须是字符串 '1'（flagRow 按 String(state[key]) 判选中态，布尔 true 会显示成「关」）。
       ②③④ 明暗 / 动效 / 密度，相对顺序不变。
       复用 flagRow 与现成的 flag: 动作链（setFlag → saveState → syncAll → setBodyFront），零新类名零新令牌。 */
    g.appendChild(flagRow('bodyFront', '正文前端', [['0', '关'], ['1', '开']]));
    /* 风险提示（用户 2026-09-26 给的定稿文案，逐字照抄，不要再改词）—— 用已登记的 .kami-card-note */
    g.appendChild(mk('div', 'kami-card-note',
      '请勿在会话中切换，重载正则前端可能会导致消息内容丢失。'));
    g.appendChild(flagRow('scheme', '明暗', [['', '跟随皮肤'], ['dark', '暗色'], ['light', '亮色']]));
    g.appendChild(flagRow('motion', '动效', [['full', '完整'], ['calm', '克制'], ['off', '关闭']]));
    g.appendChild(flagRow('density', '密度', [['compact', '紧凑'], ['cozy', '舒适'], ['roomy', '宽松']]));
    box.appendChild(g);

    /* 皮肤预览（15 套皮肤的网格）在「显示」卡下面 */
    var grid = mk('div', 'kami-grid');
    SKINS.forEach(function (s) {
      var on = s.id === state.skinId;
      var card = mk('div', 'kami-card');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-kami-act', 'skin:' + s.id);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { card.classList.add('is-on'); }
      var head = mk('span', 'kami-card-head');
      head.appendChild(mk('span', 'kami-dot'));
      head.appendChild(mk('span', 'kami-card-title', s.name));
      if (on) { head.appendChild(mk('span', 'kami-chip', '使用中')); }
      card.appendChild(head);
      card.appendChild(mk('span', 'kami-card-note', s.tagline || ('按钮显示：🎨' + s.button)));
      card.appendChild(previewSkeleton(s));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  /* 栏目小标题：只用已登记的 .kami-card-note（注释排版类），间距回落到皮肤自己的默认规则。
     原来这里内联写死 margin，违反契约 §0「前端不写尺寸」——皮肤顶不掉内联值。 */
  function sectionTitle(t) {
    return mk('div', 'kami-card-note', t);
  }

  function flagRow(key, label, opts) {
    var row = mk('div', 'kami-field');
    row.appendChild(mk('span', 'kami-field-label', label));
    var val = mk('span', 'kami-field-value');
    var seg = mk('span', 'kami-seg');
    opts.forEach(function (o) {
      /* 选中态只认「当前值 == 选项值」，两边都 String() 后比较，避免类型不一致导致高亮错。 */
      var now = String(state[key] === undefined || state[key] === null ? '' : state[key]);
      var b = mk('button', 'kami-seg-item' + (now === o[0] ? ' is-on' : ''), o[1]);
      b.setAttribute('data-kami-act', 'flag:' + key + '=' + o[0]);
      seg.appendChild(b);
    });
    val.appendChild(seg);
    row.appendChild(val);
    return row;
  }

  /* ---- 参数页：分组默认折叠，滑杆 + 数字输入 ---- */
  var folded = {};   // group -> true 折叠
  function renderParamPane() {
    var box = paneEl('param');
    if (!box) { return; }
    box.textContent = '';
    var skin = curSkin();
    var params = (skin.params || []).slice();
    /* 全局参数：字号缩放（所有皮肤都必须尊重 --kami-fs-scale） */
    params.unshift({ id: '__fs', label: '字号缩放', group: '通用', token: '--kami-fs-scale', unit: '×',
      min: 0.8, max: 1.5, step: 0.02, value: 1 });
    if (!params.length) { box.appendChild(mk('div', 'kami-empty', '这套皮肤没有可调参数')); return; }

    var groups = {};
    var order = [];
    params.forEach(function (p) {
      var g = p.group || '参数';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(p);
    });

    order.forEach(function (g) {
      var isFolded = folded[g] !== false ? true : false;
      /* 契约 §4.3 的折叠写法：外层 .kami-collapse + data-kami-open="0|1"，
         头是 .kami-head.kami-collapse-head（六套皮肤的箭头旋转规则都写成
         `.kami-collapse[data-kami-open="1"] > .kami-head .kami-chev`，少了 .kami-head 就一条都匹配不到），
         折叠体 .kami-collapse-body **始终在 DOM 里**，切属性即可 —— 显隐与进出动画全归皮肤。
         这里不再内联写 display/gap/cursor/transform/margin：排版与旋转都由皮肤给
         （.kami-head 提供 flex + gap + cursor 来自 .kami-collapse-head）。 */
      var wrap = mk('div', 'kami-card kami-collapse');
      wrap.setAttribute('data-kami-open', isFolded ? '0' : '1');
      var head = mk('div', 'kami-head kami-collapse-head');
      head.appendChild(mk('span', 'kami-chev', '▸'));
      head.appendChild(mk('span', 'kami-card-title', g));
      head.appendChild(mk('span', 'kami-chip', String(groups[g].length)));
      head.addEventListener('click', function () {
        /* ⚠️ 必须读**当前 DOM 状态**再翻转，不能碰渲染时算出来的 isFolded：
           那个变量是闭包里的初始态，点第二次起就永远是同一个值，
           表现是「只能开合一次，必须离开参数页再回来（触发重渲染）才能再折一次」。
           folded 仍然是**状态来源**（重渲染时按它恢复），这里只负责把它同步成
           「现在到底是折着还是开着」。 */
        var open = wrap.getAttribute('data-kami-open') === '1';
        wrap.setAttribute('data-kami-open', open ? '0' : '1');
        folded[g] = open;   // 记住「现在是折着的」，供下次重渲染时恢复
      });
      wrap.appendChild(head);
      var bodyBox = mk('div', 'kami-card-body kami-collapse-body');
      groups[g].forEach(function (p) { bodyBox.appendChild(paramRow(p)); });
      wrap.appendChild(bodyBox);
      box.appendChild(wrap);
    });
  }

  /* 契约 §4.3：滑杆把当前值归一化到 0-1 写进 --kami-value，皮肤据此画通电区段 */
  function setRangeValue(el, v, p) {
    try {
      var span = (p.max - p.min) || 1;
      var t = (v - p.min) / span;
      if (!isFinite(t)) { t = 0; }
      el.style.setProperty('--kami-value', String(Math.min(1, Math.max(0, t))));
    } catch (e) { }
  }

  function paramRow(p) {
    var v = state.params[p.id];
    if (typeof v !== 'number' || !isFinite(v)) { v = p.value; }
    var row = mk('div', 'kami-field');
    row.appendChild(mk('span', 'kami-field-label', p.label));
    var val = mk('span', 'kami-field-value');
    var range = mk('input', 'kami-range');
    range.type = 'range';
    range.min = String(p.min); range.max = String(p.max); range.step = String(p.step);
    range.value = String(v);
    range.setAttribute('data-kami-param', p.id);
    range.setAttribute('aria-label', p.label);
    setRangeValue(range, v, p);
    var num = mk('input', 'kami-number');
    num.type = 'number';
    num.min = String(p.min); num.max = String(p.max); num.step = String(p.step);
    num.value = String(v);
    num.setAttribute('data-kami-param', p.id);
    num.setAttribute('aria-label', p.label + '（直接输入）');
    val.appendChild(range);
    val.appendChild(num);
    val.appendChild(mk('span', 'kami-sub', p.unit || ''));
    row.appendChild(val);
    return row;
  }

  /* ---- 特效页 ---- */
  function renderFxPane() {
    var box = paneEl('fx');
    if (!box) { return; }
    box.textContent = '';
    var fx = curSkin().effects || [];
    if (!fx.length) { box.appendChild(mk('div', 'kami-empty', '这套皮肤没有高级特效')); return; }
    fx.forEach(function (f) {
      var on = state.effects[f.id];
      if (on === undefined) { on = !!f.default; }
      var row = mk('div', 'kami-field');
      var lab = mk('span', 'kami-field-label');
      lab.appendChild(mk('div', null, f.label));
      if (f.desc) {
        /* 说明行只用已登记的 .kami-sub；行距回落到皮肤默认规则（原来内联写死 marginTop）。 */
        lab.appendChild(mk('div', 'kami-sub', f.desc));
      }
      row.appendChild(lab);
      var val = mk('span', 'kami-field-value');
      var sw = mk('label', 'kami-switch');
      var input = mk('input', 'kami-switch-input');
      input.type = 'checkbox';
      input.checked = on;
      input.setAttribute('data-kami-act', 'fx:' + f.id);
      input.setAttribute('aria-label', f.label);
      var track = mk('span', 'kami-switch-track');
      track.appendChild(mk('span', 'kami-switch-knob'));
      sw.appendChild(input); sw.appendChild(track);
      val.appendChild(sw);
      row.appendChild(val);
      box.appendChild(row);
    });
  }

  /* ---- 状态写入 ---- */
  function setSkin(id) {
    var s = findSkin(id);
    if (!s) { return; }
    state.skinId = id;
    /* 参数按新皮肤的取值域裁剪 */
    var np = {};
    (s.params || []).forEach(function (p) {
      var v = state.params[p.id];
      if (typeof v !== 'number' || !isFinite(v)) { v = p.value; }
      np[p.id] = Math.min(Math.max(v, p.min), p.max);
    });
    if (typeof state.params['__fs'] === 'number') { np['__fs'] = state.params['__fs']; }
    state.params = np;
    saveState();
    syncAll();
    renderPane();
    log('切换皮肤 → ' + s.name);
  }
  function setParam(id, v, srcNode) {
    var skin = curSkin();
    var def = null;
    (skin.params || []).concat([{ id: '__fs', min: 0.8, max: 1.5 }]).forEach(function (p) { if (p.id === id) { def = p; } });
    if (def) { v = Math.min(Math.max(v, def.min), def.max); }
    state.params[id] = v;
    /* 同步 --kami-value（滑杆元素上） */
    try {
      var skin2 = curSkin();
      var def2 = null;
      (skin2.params || []).concat([{ id: '__fs', min: 0.8, max: 1.5 }]).forEach(function (pp) { if (pp.id === id) { def2 = pp; } });
      if (def2) {
        var rng = panelDrop ? panelDrop.querySelector('input.kami-range[data-kami-param="' + id + '"]') : null;
        if (rng) { setRangeValue(rng, v, def2); }
      }
    } catch (e) { }

    /* 同步同一行的另一个输入框 */
    if (srcNode) {
      try {
        var row = srcNode.closest ? srcNode.closest('.kami-field-value') : null;
        if (row) {
          var peers = row.querySelectorAll('[data-kami-param="' + id + '"]');
          for (var i = 0; i < peers.length; i++) {
            if (peers[i] !== srcNode && peers[i].value !== String(v)) { peers[i].value = String(v); }
          }
        }
      } catch (e) { }
    }
    saveState();
    applyTo(HDOC);
    syncAllIframes();
    renderPaneStatusOnly();
  }
  function renderPaneStatusOnly() {
    var st = panelDrop && panelDrop.querySelector('[data-kami-role="status"]');
    if (st) { st.textContent = curSkin().name + ' · 动效 ' + state.motion + ' · 密度 ' + state.density + ' · 特效 ' + (effectList().length || '无'); }
  }
  function toggleEffect(id) {
    var fx = curSkin().effects || [], def = false, i;
    for (i = 0; i < fx.length; i++) { if (fx[i].id === id) { def = !!fx[i].default; } }
    var cur = state.effects[id];
    if (cur === undefined) { cur = def; }
    state.effects[id] = !cur;
    saveState();
    syncAll();
    renderFxPane();
    renderPaneStatusOnly();
  }
  /* 档位开关。返回值只对 bodyFront 有意义（见 setBodyFront 的契约）：
     面板路径不看它；导出给引导页的那条会拿它等写入落定。 */
  function setFlag(kv) {
    var i = kv.indexOf('=');
    var k = kv.slice(0, i), v = kv.slice(i + 1);
    var prev = state[k];
    state[k] = v;
    saveState();
    /* 档位改动只需重下 <html> 属性 + 皮肤 CSS（酒馆 UI 一个像素都不动，所以这里没有别的动作） */
    syncAll();
    renderPane();
    if (k !== 'bodyFront') { return null; }
    /* 正文前端：**就地点火** —— 它本质是一条酒馆正则（「前端|正文 v0.1」）的启用位，
       所以除了上面的同步，还要把正则表的启用位真正写回去（见 setBodyFront）。
       写不成（false）或写失败（reject）就把档位**退回原位**：开关的位置必须反映酒馆正则的
       真实启用状态，否则用户会以为开了、正文其实没被前端接管（只有日志能看出问题）。 */
    var w = null;
    try { w = setBodyFront(bodyFrontOn()); } catch (e) { }
    var back = function () {
      state[k] = prev;
      saveState();
      syncAll();
      renderPane();
      toast('error', '没能写进酒馆正则，开关已退回原位。请确认预设里有「' + BODY_REGEX_NAME + '」这条正则。');
    };
    if (w && typeof w.then === 'function') {
      return w.then(function () { log('正文前端 → ' + (bodyFrontOn() ? '开' : '关')); return true; },
        function (e) { back(); throw e; });
    }
    if (w === false) { back(); return false; }
    log('正文前端 → ' + (bodyFrontOn() ? '开' : '关'));
    return w;
  }

  function setOpen(open) {
    if (!panelRoot) { buildPanel(); }
    state.panel.open = !!open;
    if (open) {
      panelDrop.setAttribute('data-kami-open', '1');
      panelRoot.style.display = '';
      restoreGeometry();
      logGeom('打开');
      /* 每次打开面板都跟酒馆正则对一次账：用户可能在酒馆原生面板里改过这条正则，
         开关的位置必须是**当前真实状态**，不是我们上次记住的状态。 */
      syncBodyFrontFromTavern();
      renderPane();
    } else {
      panelDrop.setAttribute('data-kami-open', '0');
      panelRoot.style.display = 'none';
    }
    saveState();
  }
  /* 档位值统一按字符串存（'0'/'1'）：兼容旧存档里写成布尔 true/false 的形态 */
  function bodyFrontOn() {
    return state.bodyFront === true || state.bodyFront === '1';
  }
  /* ---------- 正文前端：正则启用位的读写（「前端|正文 v0.1」）----------
     这条功能本质是一条**酒馆正则**：它把 `<content>…</content>` 换成前端载荷，
     由酒馆助手渲染成 iframe（与「显式思维链 / 行动选项」同一个机制）。
     所以「开关」= 把正则表里那一条的启用位写回去 —— 酒馆的正则表是活设置，
     写回后酒馆自己会持久化（§五第 16 条：写完发 OAI_PRESET_CHANGED_AFTER 让原生面板刷新）。

     ⚠️ 字段名与预设文件里**不一样**（2026-09-26 对着官方文档逐条核对，两处曾写错、静默失效）：
       酒馆预设文件（src/preset.base.json / src/regex/list.json）用的是酒馆原生形态
         `scriptName` / `disabled`（camelCase）；
       酒馆助手的 getTavernRegexes 返回的是**归一化形态**
         `script_name` / `enabled`（snake_case），官方类型：
         https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/功能详情/酒馆正则/获取正则.html
       按 camelCase 去匹配会一个都匹配不上；按 `disabled` 去比对会拿 undefined 当「已一致」，
       于是开关看着能点、日志还说「已设为启用」，实际一个字节都没写。
       这里的规矩：**名字两种都认**（兼容旧版本/原生对象），
       **启用位只动对象上本来就有的那个键**（有 enabled 就写 enabled，有 disabled 才写 disabled），
       绝不凭空造字段。replaceTavernRegexes 的第二个参数是**必填**的（不带会落到全局正则表），
       统一照 60-压缩.js 的写法：{ type: 'preset', name: 'in_use' }。

     ⚠️ 两个已知代价，做成了面板上的提示（用户点名要求）：
       ① replaceTavernRegexes 为了重新应用正则会**重新载入整个聊天消息**，已加载出来的楼层要等重载完
          才看到效果或恢复；极端情况下会让人以为「消息丢了」。
       ② 正则被关掉时，`<content>` 标签会原样显示成文本（内容不丢，只是露出标签）。 */
  var BODY_REGEX_NAME = '前端|正文 v0.1';
  var BODY_REGEX_NAME_ALT = '前端|正文';   /* 兼容旧名（改名前导出的预设 / 用户手改过） */
  var BODY_REGEX_NAME_OLD = '前端|正文(占位)';   /* v0.1 之前的占位名，老预设里可能还是它 */
  function bodyRegexApi() {
    /* 酒馆助手 4.x：getTavernRegexes / replaceTavernRegexes。
       读、写**都必须带 { type: 'preset', name: 'in_use' }**：
       不带 type 会落到全局正则表，不带 name 认不出「当前使用中的预设」。 */
    if (typeof getTavernRegexes !== 'function' || typeof replaceTavernRegexes !== 'function') { return null; }
    var opt = { type: 'preset', name: 'in_use' };
    return {
      get: function () { return getTavernRegexes(opt) || []; },
      put: function (list) { return replaceTavernRegexes(list, opt); }
    };
  }
  function regexNameOf(r) {
    if (!r) { return ''; }
    /* 归一化形态 script_name 优先；没有就退回酒馆原生 scriptName */
    return String(r.script_name !== undefined && r.script_name !== null ? r.script_name
      : (r.scriptName !== undefined && r.scriptName !== null ? r.scriptName : ''));
  }
  function regexOnOf(r) {
    if (!r) { return false; }
    if (typeof r.enabled === 'boolean') { return r.enabled; }          /* 归一化形态 */
    if (typeof r.disabled === 'boolean') { return !r.disabled; }       /* 酒馆原生形态 */
    return true;   /* 两个都没有：当成启用（不要凭空把用户的正则关掉） */
  }
  function setRegexOn(r, on) {
    var wrote = false;
    if (r && typeof r.enabled === 'boolean') { r.enabled = !!on; wrote = true; }
    if (r && typeof r.disabled === 'boolean') { r.disabled = !on; wrote = true; }
    if (!wrote) { r.enabled = !!on; }   /* 两种形态都没有：按归一化形态写 */
  }
  function findBodyRegex(list) {
    var arr = (list && list.length ? list : (list && list.regexes) || []) || [];
    /* 先精确匹配带版本号的名字，再退回不带版本号的前缀匹配（改名兼容） */
    for (var i = 0; i < arr.length; i++) {
      if (regexNameOf(arr[i]) === BODY_REGEX_NAME) { return { list: arr, index: i, item: arr[i] }; }
    }
    for (var j = 0; j < arr.length; j++) {
      var n = regexNameOf(arr[j]);
      if (n.indexOf(BODY_REGEX_NAME_ALT) === 0 || n === BODY_REGEX_NAME_OLD) { return { list: arr, index: j, item: arr[j] }; }
    }
    return null;
  }
  /* 写正则启用位。返回值契约（两个调用方都靠它决定界面怎么画）：
       true   —— 本来就一致，不用写（最省，也避免白白重载一次聊天）
       false  —— 写不了（版本没有接口 / 正则表里找不到这条）
       Promise—— 真写下去了，等它落定；resolve=写成功，reject=写失败 */
  function setBodyFront(on) {
    var want = !!on;
    var api = bodyRegexApi();
    if (!api) { log('正文前端：这个酒馆助手版本没有 getTavernRegexes / replaceTavernRegexes，改不了正则启用位'); return false; }
    try {
      var list = api.get();
      var hit = findBodyRegex(list);
      if (!hit) { log('正文前端：正则表里没有「' + BODY_REGEX_NAME + '」，改不了启用位'); return false; }
      if (regexOnOf(hit.item) === want) { return true; }   /* 已经一致，不白写 */
      setRegexOn(hit.item, want);
      var p = api.put(hit.list);
      return Promise.resolve(p).then(function () {
        try {
          if (typeof eventEmit === 'function' && typeof tavern_events !== 'undefined') {
            eventEmit(tavern_events.OAI_PRESET_CHANGED_AFTER);
          }
        } catch (e) { }
        log('正文前端：正则「' + BODY_REGEX_NAME + '」已设为 ' + (want ? '启用' : '停用'));
        return true;
      }, function (e) {
        log('正文前端：写正则启用位失败（' + ((e && e.message) || e) + '）');
        throw e;
      });
    } catch (e) {
      log('正文前端：写正则启用位失败（' + ((e && e.message) || e) + '）');
      return false;
    }
  }
  /* 面板 / 引导上那枚开关的**位置**，与酒馆正则的真实启用位对账（用户 2026-09-26 点名要求）。
     为什么只读不写：写正则走 replaceTavernRegexes，它会**重新载入整个聊天**（见 setBodyFront 的注释），
     启动时或一开面板就来这么一下，用户会莫名其妙看见聊天重载。
     所以规矩是：**界面跟着酒馆走** —— 谁在酒馆原生面板里改了这条正则，我们下次对账就把开关摆过去。
     读不到（版本没接口 / 预设里没有这条正则）就保持原样，不猜、不动。
     返回 true 表示「这次真的对上了、界面重画过」。 */
  function syncBodyFrontFromTavern() {
    var api = bodyRegexApi();
    if (!api) { return false; }
    try {
      var hit = findBodyRegex(api.get());
      if (!hit) { return false; }
      var real = regexOnOf(hit.item) ? '1' : '0';
      if (String(state.bodyFront) === real) { return false; }
      var was = bodyFrontOn() ? '开' : '关';
      state.bodyFront = real;
      saveState();
      renderPane();
      log('正文前端：按酒馆正则的真实启用位对齐（' + was + ' → ' + (real === '1' ? '开' : '关') + '）');
      return true;
    } catch (e) {
      log('正文前端：对账失败（' + ((e && e.message) || e) + '）');
      return false;
    }
  }
  function openPanel() { setOpen(true); }
  function closePanel() { setOpen(false); }  function togglePanel() { setOpen(!(state.panel.open && panelDrop && panelDrop.getAttribute('data-kami-open') === '1')); }

  /* ───────── 登记按钮 ───────── */

  var ownDef = null, pingTimer = null;
  function registerButton() {
    try {
      var w = HOST;
      var defs = w.__hubDefs || (w.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === '🎨') { defs.splice(i, 1); }
      }
      ownDef = {
        name: '🎨',
        /* 按钮条排布（2026-09-21 用户裁定）：引导(10) → 皮肤(20) → 预设(30) → 压缩(40) → 反截断(50) */
        order: 20,
        tip: '皮肤管理（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return '🎨' + curSkin().button; },
        click: function () { togglePanel(); },
        ready: function () { return true; },
        absent: '皮肤管理还没就绪'
      };
      defs.push(ownDef);
      try {
        var ev = w.document.createEvent('Event');
        ev.initEvent('kami-hub-def', false, false);
        w.dispatchEvent(ev);
      } catch (e) { }
      log('已向按钮中转站登记按钮 🎨');
    } catch (e) {
      console.warn('[皮肤] 向中转站登记按钮失败（可用控制台 KamiSkin.open() 手动打开）', e);
    }
  }

  /* ───────── 全局 API ───────── */

  function expose() {
    HOST[API_NAME] = {
      version: VERSION,
      get skin() { return curSkin().id; },
      get state() { return JSON.parse(JSON.stringify(state)); },
      skins: function () { return SKINS.map(function (s) { return { id: s.id, name: s.name, button: s.button, tagline: s.tagline || '' }; }); },
      /* 取某套皮肤的完整预览文档（srcdoc HTML）；没有这个 id 返回 null。
         引导脚本的皮肤预览小窗用它，和面板内预览同一份骨架同一份 CSS。 */
      previewDoc: function (id) {
        var sk = null;
        for (var i = 0; i < SKINS.length; i++) { if (SKINS[i].id === id) { sk = SKINS[i]; break; } }
        return sk ? buildPreviewDoc(sk) : null;
      },
      open: openPanel, close: closePanel, toggle: togglePanel,
      setSkin: setSkin, setParam: setParam, setFlag: function (k, v) { setFlag(k + '=' + v); },
      /* 正文前端（引导面板的皮肤页要用它给一枚开关）：
         bodyFront() 读当前状态；setBodyFront(on) 写状态 + 联动酒馆真正的正则启用位。
         返回契约照 50-引导.js 的开关行工厂：Promise=写入落定后成功（值=落定后的状态）、
         null=写不了（那边弹提示、不翻界面）、布尔=无需写，直接就是落定后的状态。 */
      bodyFront: function () { return bodyFrontOn(); },
      /* 引导页那枚开关在渲染前先调一次：把状态与酒馆正则的真实启用位对齐（只读，不写正则）。
         这样「谁在酒馆原生面板里改过」也能被引导页如实反映。 */
      syncBodyFront: function () { return syncBodyFrontFromTavern(); },
      setBodyFront: function (on) {
        var w = null;
        try { w = setFlag('bodyFront=' + (on ? '1' : '0')); } catch (e) { }
        if (w && typeof w.then === 'function') {
          return w.then(function () { return bodyFrontOn(); });   /* 写失败会 reject → 引导页弹提示且不翻界面 */
        }
        if (w === false || w === null || w === undefined) { return null; }
        return bodyFrontOn();
      },
      sync: syncAll, shutdown: function () { teardown(); },
      status: function () {
        return {
          version: VERSION, skin: curSkin().id, motion: state.motion, density: state.density,
          scheme: state.scheme || curSkin().scheme || 'dark', effects: effectList(),
          decor: (curSkin().decor || []).join(' '),
          panelOpen: !!(panelDrop && panelDrop.getAttribute('data-kami-open') === '1'),
          iframes: (function () { try { return HDOC.querySelectorAll(IFRAME_SEL).length; } catch (e) { return -1; } })()
        };
      }
    };
  }

  /* ───────── 注销 ───────── */

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    log('正在注销：摘监听 / 拆面板 / 收样式 / 删全局');
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    for (var i = 0; i < unsubs.length; i++) { try { if (unsubs[i] && unsubs[i].stop) { unsubs[i].stop(); } } catch (e) { } }
    unsubs = [];
    try { if (mo) { mo.disconnect(); mo = null; } } catch (e) { }
    try { if (resizeHandler) { HOST.removeEventListener('resize', resizeHandler); } } catch (e) { }
    resizeHandler = null;
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    /* 页面与所有消息 iframe：收样式、摘属性 */
    try { dropStyle(HDOC, STYLE_ID); } catch (e) { }
    try { dropStyle(HDOC, USER_STYLE_ID); } catch (e) { }
    try { destroyDecor(HDOC); } catch (e) { }
    try { restoreDecor(HDOC); } catch (e) { }
    try { clearAttrs(HDOC); } catch (e) { }
    /* 旧功能残渣 + 消息排版的宿主标记：注销时一并清扫，页面上不留 kami 痕迹 */
    try { purgeBodyWraps(); } catch (e) { }
    try { unmarkMesHosts(); } catch (e) { }
    try {
      var frames = HDOC.querySelectorAll(IFRAME_SEL), k;
      for (k = 0; k < frames.length; k++) {
        var doc = iframeDoc(frames[k]);
        if (!doc) { continue; }
        dropStyle(doc, STYLE_ID); dropStyle(doc, USER_STYLE_ID); clearAttrs(doc);
        destroyDecor(doc);
        try { restoreDecor(doc); } catch (e) { }
      }
    } catch (e) { }
    /* 面板 DOM */
    try { if (GESTURES) { GESTURES.destroy(); } } catch (e) { }
    GESTURES = null;
    try { if (panelRoot && panelRoot.parentNode) { panelRoot.parentNode.removeChild(panelRoot); } } catch (e) { }
    panelRoot = null; panelDrop = null; panelHead = null;
    /* 按钮登记 */
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) {
        if (defs[j] === ownDef || (defs[j] && defs[j].name === '🎨')) { defs.splice(j, 1); }
      }
      if (HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister('🎨'); }
    } catch (e) { }
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    log('注销完成：样式与属性已收回，各前端回落到内置兜底皮肤');
  }

  /* ───────── 启动 ───────── */

  var mo = null, resizeHandler = null, hideHandler = null, sweepTimer = null;

  function boot() {
    log('启动 v' + VERSION + '，皮肤包 ' + SKINS.length + ' 套：' + SKINS.map(function (s) { return s.id; }).join(', '));
    readState();
    expose();
    syncAll();
    /* 开关位置与酒馆正则的真实启用位对账（只读；写会重载聊天，所以这里绝不写）。
       启动瞬间可能读不到正则表（酒馆助手还没就绪 / 预设还没加载完），1.2 秒后补一次。 */
    syncBodyFrontFromTavern();
    setTimeout(function () { if (!disposed) { try { syncBodyFrontFromTavern(); } catch (e) { } } }, 1200);
    /* 旧功能残渣清理（消息排版 v1 的包裹层）：楼层 DOM 可能比样式下发晚建好，再补一次 */
    setTimeout(function () { if (!disposed) { try { purgeBodyWraps(); } catch (e) { } } }, 600);

    /* 新楼层 / 重渲染的消息 iframe */
    try {
      if (typeof eventOn === 'function' && typeof iframe_events !== 'undefined') {
        unsubs.push(eventOn(iframe_events.MESSAGE_IFRAME_RENDER_ENDED, function (id) {
          setTimeout(function () { syncIframe(id); }, 0);
        }));
        unsubs.push(eventOn(iframe_events.MESSAGE_IFRAME_RENDER_STARTED, function (id) {
          setTimeout(function () { syncIframe(id); }, 60);
        }));
      }
    } catch (e) { log('订阅 iframe 事件失败：' + ((e && e.message) || e)); }

    /* 兜底：DOM 变化 + 定时核对（防止某些版本不发事件） */
    try {
      var MO = HOST.MutationObserver || window.MutationObserver;
      if (MO) {
        var queued = false;
        mo = new MO(function () {
          if (queued || disposed) { return; }
          queued = true;
          setTimeout(function () { queued = false; syncAllIframes(); }, 300);
        });
        var chat = HDOC.getElementById('chat') || HDOC.body;
        mo.observe(chat, { childList: true, subtree: true });
      }
    } catch (e) { }

    resizeHandler = function () {
      if (!panelDrop) { return; }
      /* 布局模式与几何都在 restoreGeometry 里一起核对（它内部会重读 sheetMode） */
      restoreGeometry();
      logGeom('尺寸变化');
    };
    try { HOST.addEventListener('resize', resizeHandler); } catch (e) { }

    /* 8 秒兜底核对：句柄必须留着，否则注销后它会永久存活（交接.md 记过的同类真 bug）。 */
    try { sweepTimer = setInterval(function () { syncAllIframes(); }, 8000); } catch (e) { }

    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);

    if (state.panel.open) { setTimeout(function () { if (!disposed) { openPanel(); } }, 400); }

    /* pagehide 必须用具名函数：匿名函数摘不掉（40/50/60 都是具名 hideHandler 成对摘）。 */
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }

    log('就绪：' + JSON.stringify(HOST[API_NAME].status()));
  }

  try { boot(); } catch (e) { console.error('[皮肤] 启动失败', e); }
})();
