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
    bodyText: false,             // 正文美化（默认关闭）：把 .mes_text 里的纯文本段包进 .kami-md 骨架
    bodyTag: 'content',          // 正文美化的作用范围标签名（v2 新增）：只包 <bodyTag>…</bodyTag> 之内
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
    /* 存档里的正文标签也要过校验（防旧档/手改坏值把 v2 判据拼坏） */
    state.bodyTag = normalizeBodyTag(state.bodyTag) || BODY_TAG_DEF;
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
      '\n/* ==== body wrap struct (正文美化包裹层，契约 §9.7；开关关着时页面上没有这种节点，规则空转) ==== */\n' + BODY_STRUCT_CSS +
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

  /* ───────── 下发：酒馆页面 + 每个消息 iframe ───────── */

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
    /* 正文只存在于酒馆页面的 #chat 里（消息 iframe 是前端文档，没有 .mes_text）；
       但 iframe 渲染结束往往意味着新楼层刚建好，这里补一次正文检查（开关开着才做事）。 */
    syncBodyAfterIframes();
  }

  function syncAllIframes() {
    try {
      var frames = HDOC.querySelectorAll(IFRAME_SEL), i;
      for (i = 0; i < frames.length; i++) {
        var doc = iframeDoc(frames[i]);
        if (doc && doc.documentElement) { applyTo(doc); }
      }
    } catch (e) { }
    syncBodyAfterIframes();
  }

  function syncAll() {
    if (disposed) { return; }
    applyTo(HDOC);
    syncAllIframes();
    if (bodyTextOn()) { syncBody(); }
  }

  /* ───────── 正文美化 v2（默认关闭）─────────
     把酒馆消息正文里的「纯文本节点 + 无 class 无 style 的 markdown 元素」原地包进
     div.kami-root[data-kami-comp="body"] > div.kami-body.kami-md ——
     复用 15 套皮肤里已登记的 .kami-root / .kami-body / .kami-md 规则，皮肤与令牌零改动。
     v2 收窄（2026-09-25）：**只包用户指定标签的内部**，标签外一个节点都不碰 ——
       · 标签名 = 脚本变量 kami-skin.bodyTag（默认 'content'），
         在面板「显示」卡「正文标签」文本框里改，改完就地点火（同 setFlag 的就地路径）；
       · 判据的根基：酒馆把消息正文跑完 showdown → DOMPurify 后灌进 .mes_text
         （酒馆 public/script.js 1898-1908 / 2637）。content 在 DOMPurify 3.4.2 的默认
         允许标签表里（node_modules/dompurify/dist/purify.min.js 的 html 白名单字面含
         "content"），所以 content 标签能以元素形态存活到 DOM —— 主路径：在 .mes_text
         里直接找该标签的元素，只包它内部；
       · 兜底路径（标签被剥掉时）：不在允许表里的自造标签名（如「正文」「narr」）会被
         清洗剥掉只留内容，DOM 里认不出边界 —— 此时回到该楼层原始文本（酒馆助手
         getChatMessages）里定位 <tag>…</tag> 的内文，用「只留文字/数字/emoji」的归一化
         指纹，在 .mes_text 直接子节点的连续区间上对位；对得上才包，对不上一个节点
         都不动（失败 = 不美化，绝不包错）。指纹按（标签名, 原文长度）记在元素上缓存，
         避免每轮 sweep 反复做同一场对位。
     两条铁律不变：
       ① 只在 #chat 里跑（流式打字机浮窗也挂 mes_text 类，但它在 dialog[open] 里，绝不许碰）；
       ② 「让位清单」里的元素一律原地不动 —— 包裹必须是移动原节点而不是 innerHTML 拼串，
          否则插件（如智能生图触发器）插进正文的按钮会掉监听、掉锚点。
     让位清单（判据即代码，永不包裹；标签内、标签外、指纹窗内一视同仁）：
        div.TH-render / pre / iframe / button / input / select / textarea / label /
        details / summary / 带 class 的元素 / 带行内 style 的元素 / .mes_* 容器 /
        style / script / link / custom-style 等元数据元素 / 注释节点 / 纯空白文本。
        「带 class 就让位」同时放过了 TH-render（既有前端宿主）、插件卡片（自带 class）、
        与酒馆自己的结构容器；「带行内 style 就让位」放过了 HTML 美化条目的卡片。
     不套娃：包裹层自带 class（kami-root）+ data-kami-comp="body"，
        「带 class 就让位」与容器级幂等检查双保险把它认出来跳过。 */
  var BODY_MES_TEXT_SEL = '#chat .mes .mes_text';
  var BODY_WRAP_SEL = ':scope > .kami-root[data-kami-comp="body"]';
  var BODY_PROTECT_TAGS = ['IFRAME', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL',
    'DETAILS', 'SUMMARY', 'PRE', 'SCRIPT', 'STYLE', 'LINK', 'VIDEO', 'AUDIO',
    'CUSTOM-STYLE', 'DIALOG'];
  var BODY_PROTECT_CLS = 'mes_';   // .mes_buttons / .mes_media_wrapper / .mes_bias 等（以空格分词匹配）
  var BODY_TAG_DEF = 'content';
  var BODY_TAG_MAX = 32;

  /* 标签名规范：去首尾空白；空值 / 超长 / 含尖括号·引号·斜杠·空白 → 非法（调用方回退默认）。
     再用真实 DOM 验一道（querySelectorAll 对非法标识符会抛错），保证标签名
     永远不会把查找路径拼坏 —— 查找用 getElementsByTagName（不做 CSS 解析），校验宁可从严。 */
  function normalizeBodyTag(v) {
    if (typeof v !== 'string') { return null; }
    var t = v.trim();
    if (!t || t.length > BODY_TAG_MAX) { return null; }
    if (/[<>"'\s\/\\]/.test(t)) { return null; }
    try {
      HDOC.createElement(t);
      var probe = HDOC.body || HDOC.documentElement;
      if (probe) { probe.querySelectorAll(t); }
      return t;
    } catch (e) { return null; }
  }
  function bodyTag() { return normalizeBodyTag(state.bodyTag) || BODY_TAG_DEF; }

  function bodyProtected(el) {
    if (el.nodeType !== 1) { return false; }
    if (BODY_PROTECT_TAGS.indexOf(el.tagName) >= 0) { return true; }
    if (el.hasAttribute('class')) { return true; }   /* 插件卡片 / TH-render / 包裹层本身 / 酒馆容器 */
    if (el.hasAttribute('style')) { return true; }   /* HTML 美化条目产出的卡片（预设强制行内样式） */
    if ((el.className || '').split(/\s+/).indexOf(BODY_PROTECT_CLS) >= 0) { return true; }
    return false;
  }
  /* 注释节点与纯空白文本必须跳过：包进去会造出空 wrapper，
     并让酒馆的 `.last_mes:has(.mes_text:empty)` 显隐判据失效（探针第一版实测踩过）。 */
  function bodySkippable(n) {
    if (n.nodeType === 8) { return true; }                 /* 注释 */
    if (n.nodeType === 3) { return !n.nodeValue.trim(); }  /* 纯空白文本 */
    return false;
  }

  /* 一段「可包节点」包进包裹层：插入父元素 = host，候选节点 = kids（必须是 host 的直接子节点）。
     手法（探针实测踩坑后的定稿）：先在连续段首节点**之前**插入空包裹层，
     再把段内节点逐个 appendChild 搬进去 —— 全程保留原节点对象，
     事件监听与插件锚点都不会丢。 */
  function wrapRunsIn(host, kids) {
    try {
      var runs = [], cur = [], i;
      for (i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (bodySkippable(n)) { continue; }
        if (n.nodeType === 1 && bodyProtected(n)) {
          if (cur.length) { runs.push(cur); cur = []; }
          continue;
        }
        cur.push(n);
      }
      if (cur.length) { runs.push(cur); }
      for (i = 0; i < runs.length; i++) {
        var root = host.ownerDocument.createElement('div');
        root.className = 'kami-root';
        root.setAttribute('data-kami-comp', 'body');
        root.setAttribute('data-kami-ready', '1');
        var body = host.ownerDocument.createElement('div');
        body.className = 'kami-body kami-md';
        root.appendChild(body);
        var run = runs[i];
        host.insertBefore(root, run[0]);
        for (var j = 0; j < run.length; j++) { body.appendChild(run[j]); }
      }
      return runs.length;
    } catch (e) { return 0; }
  }

  /* .mes_text 里「最外层的」用户标签容器（嵌套同名只认最外层，内层整个被外层包裹层带走） */
  function bodyContainers(mt) {
    var tag = bodyTag();
    var raw;
    try { raw = mt.getElementsByTagName(tag); } catch (e) { return []; }
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var el = raw[i], up = el.parentNode, nested = false;
      while (up && up !== mt) { if (up.tagName === el.tagName) { nested = true; break; } up = up.parentNode; }
      if (!nested) { out.push(el); }
    }
    return out;
  }
  function bodyHasWrap(el) {
    try { return !!el.querySelector(BODY_WRAP_SEL); } catch (e) { return false; }
  }

  /* ── 兜底判据：标签被酒馆清洗剥掉时走的「原始文本 → 文本指纹」对位 ──
     归一化：只留文字/数字/注音/emoji，标点与 markdown 记号（* _ ` # > 等）全忽略 ——
     于是「夜里**很冷**。」与渲染后的「夜里很冷。」指纹相同，空白差异也一并抹平。 */
  function normText(s) {
    return String(s).replace(/[^\p{L}\p{N}\p{M}\u2600-\u27BF\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/gu, '');
  }
  function readMesRaw(mesid) {
    if (typeof getChatMessages !== 'function') { return null; }
    try {
      var arr = getChatMessages(String(mesid));
      if (arr && arr.length) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && Number(arr[i].message_id) === Number(mesid) && typeof arr[i].mes === 'string') { return arr[i].mes; }
        }
      }
    } catch (e) { }
    return null;
  }
  /* 在原始文本里找 <tag>…</tag> 的全部内文（大小写不敏感；开标签允许带属性） */
  function bodySectionsIn(raw, tag) {
    var out = [];
    try {
      var esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var tok = new RegExp('<(/?)' + esc + '(?=\\s|>|/)[^>]*>', 'g');
      var src = String(raw);
      var m, depth = 0, start = -1;
      tok.lastIndex = 0;
      while ((m = tok.exec(src)) != null) {
        if (!m[1]) {
          if (depth === 0) { start = m.index + m[0].length; }
          depth++;
        } else if (depth > 0) {
          depth--;
          if (depth === 0 && start >= 0) { out.push(src.slice(start, m.index)); start = -1; }
        }
      }
    } catch (e) { }
    return out;
  }
  /* 窗口里有几个「可包」的连续段（找不到可包节点时 = 这一窗已在包裹层里、无需再包） */
  function runsCount(kids) {
    var cnt = 0, cur = 0;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (bodySkippable(n)) { continue; }
      if (n.nodeType !== 1 || !bodyProtected(n)) { cur = 1; continue; }
      if (cur) { cnt++; cur = 0; }
    }
    if (cur) { cnt++; }
    return cnt;
  }
  /* 在 .mes_text 的直接子节点序列上找一段连续窗口，其归一化指纹恰好等于标签内文。
     窗口里有可包节点 → 包（返回段数）；窗口里全是让位对象/包裹层 → 已包好，返回 -1；
     整个窗口对不上 → 返回 0（失败 = 不美化，绝不包错）。 */
  function wrapByFingerprint(mt, innerRaw) {
    var target = normText(innerRaw);
    if (!target) { return 0; }
    var kids = Array.prototype.slice.call(mt.childNodes);
    var cs = kids.map(function (k) { return normText(k.nodeType === 3 ? k.nodeValue : k.textContent); });
    for (var i = 0; i < kids.length; i++) {
      var acc = '';
      for (var j = i; j < kids.length; j++) {
        acc += cs[j];
        if (acc.length > target.length) { break; }
        if (acc.length === target.length && acc === target) {
          var win = kids.slice(i, j + 1);
          if (runsCount(win) === 0) { return -1; }   /* 指纹对上但已在包裹层里：不是 miss，也不重复动手 */
          return wrapRunsIn(mt, win);
        }
      }
    }
    return 0;
  }
  /* 一条 .mes_text 的兜底路径：只有「真对不上」才按（标签名, 原文长度）记忆、本形态不再重试
     （原文改写会变长度，钥匙自动更换重算；「已包好」永不记忆，开关/标签一拆一重包还在）。 */
  function wrapFromBodyRange(mt, raw, tag) {
    var key = '__kamiBodyAt_' + tag + ':' + String(raw).length;
    if (mt[key] === true) { return 0; }
    var sections = bodySectionsIn(raw, tag);
    var n = 0, anyDone = false, anyHard = false;
    for (var i = 0; i < sections.length; i++) {
      var w = wrapByFingerprint(mt, sections[i]);
      if (w > 0) { n += w; anyDone = true; }
      else if (w < 0) { anyDone = true; }
      else { anyHard = true; log('正文标签 <' + tag + '> 的内文指纹在渲染后的 DOM 里对不上（该段保持原样、未美化）'); }
    }
    if (!anyDone && anyHard) { mt[key] = true; }
    return n;
  }

  /* 清一条 .mes_text 的包裹层（关闭开关 / 注销时）：把包裹层里搬进去的节点按原顺序放回，再删包裹层。
     v2 注意：包裹层可能在用户标签容器**内部**（主路径），也可能就在 .mes_text 直接子级（兜底路径），
     所以用后代查询 + 逆序还原，两种位置都拆得干净。 */
  function unwrapOneMesText(mesText) {
    var roots;
    try { roots = mesText.querySelectorAll('.kami-root[data-kami-comp="body"]'); } catch (e) { return; }
    for (var i = roots.length - 1; i >= 0; i--) {
      var root = roots[i];
      var body = root.firstElementChild;
      var parent = root.parentNode;
      if (!parent) { continue; }
      try {
        while (body && body.firstChild) { parent.insertBefore(body.firstChild, root); }
      } catch (e) { continue; }   /* 万一搬不动（不该发生），留着包裹层总比丢内容强 */
      parent.removeChild(root);
    }
  }

  /* 遍历 #chat 里所有 .mes_text：开启时包裹、关闭时还原。
     单轮最多包 12 层，剩下的留给下一轮触发（防大聊天首次加载卡顿；调研 §2.4）。
     主路径：找用户标签容器，只包容器内部；
     兜底：容器一个都没有、但原始文本里确实出现了这个标签（多半被清洗剥掉）时，才走指纹对位。 */
  var BODY_SWEEP_CAP = 12;
  function syncBody() {
    if (disposed) { return; }
    var on = bodyTextOn();
    var list;
    try { list = HDOC.querySelectorAll(BODY_MES_TEXT_SEL); } catch (e) { return; }
    var done = 0;
    for (var i = 0; i < list.length; i++) {
      var mt = list[i];
      if (!on) { unwrapOneMesText(mt); continue; }
      var containers = bodyContainers(mt);
      for (var c = 0; c < containers.length; c++) {
        if (done >= BODY_SWEEP_CAP) { break; }
        if (bodyHasWrap(containers[c])) { continue; }   /* 该容器已包过：跳过（幂等，不套娃） */
        done += wrapRunsIn(containers[c], Array.prototype.slice.call(containers[c].childNodes));
      }
      if (!containers.length && done < BODY_SWEEP_CAP) {
        var mes = mt.closest ? mt.closest('.mes') : null;
        var mesid = mes ? mes.getAttribute('mesid') : null;
        if (mesid !== null && mesid !== '') {
          var tag = bodyTag();
          var raw = readMesRaw(mesid);
          if (raw && String(raw).toLowerCase().indexOf('<' + tag.toLowerCase()) >= 0) {
            done += wrapFromBodyRange(mt, raw, tag);
          }
        }
      }
    }
  }

  /* ───────── 装饰：注入 / 销毁（契约 §8）───────── */

  /* 正文美化的触发点**复用**上面三条既有链（报告 §2.3 的纪律：不新增观察者）：
     · MESSAGE_IFRAME_RENDER_ENDED / STARTED 事件 → syncIframe(id)（末尾补 syncBodyAfterIframes）；
     · 300ms 防抖 MutationObserver → syncAllIframes()（末尾补）；
     · 8 秒 sweep → syncAllIframes()（同上）。
     开关关着时 syncBodyAfterIframes 第一行就返回，零成本。 */
  function syncBodyAfterIframes() {
    if (disposed || !bodyTextOn()) { return; }
    try { syncBody(); } catch (e) { }
  }

  /* 正文包裹层的结构性兜底（契约 §9.7 登记的例外）：
     只做排版归位（块级、清外边距、防横向溢出），一个颜色都不写 —— 外观仍归皮肤。
     作用域带 .kami-root[data-kami-comp="body"]，特异性 (0,3,0) 高于 .kami-root 通用规则的
     (0,2,0)/(0,2,1)，皮肤想接管写同名前缀的规则即可，不冲突。 */
  var BODY_STRUCT_CSS = '.kami-root[data-kami-comp="body"]{display:block;margin:0;min-width:0;max-width:100%;overflow-wrap:anywhere;}'
    + '.kami-root[data-kami-comp="body"]>.kami-body{padding:0;}';

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

    /* 正文标签文本行（v2 新增）：change（失焦 / Enter 提交）就地生效并校验，
       非法值回退默认并回显。 */
    panelDrop.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute || !t.getAttribute('data-kami-bodytag')) { return; }
      setBodyTag(t.value, t);
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

    /* 全局档位 */
    box.appendChild(sectionTitle('显示'));
    var g = mk('div', 'kami-card');
    /* 正文美化放**第一行**（2026-09-25 用户裁定），后面明暗/动效/密度三行相对顺序不变。
       「正文标签」文本行紧随其后（同一卡内，改标签名当场生效，见 setBodyTag）。
       复用 flagRow 与现成的 flag: 动作链（setFlag → saveState → syncAll），零新类名零新令牌。 */
    g.appendChild(flagRow('bodyText', '正文美化', [['0', '关'], ['1', '开']]));
    g.appendChild(textRow('bodyTag', '正文标签'));
    g.appendChild(flagRow('scheme', '明暗', [['', '跟随皮肤'], ['dark', '暗色'], ['light', '亮色']]));
    g.appendChild(flagRow('motion', '动效', [['full', '完整'], ['calm', '克制'], ['off', '关闭']]));
    g.appendChild(flagRow('density', '密度', [['compact', '紧凑'], ['cozy', '舒适'], ['roomy', '宽松']]));
    box.appendChild(g);
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
      /* 布尔态（bodyText 的 false/true）与字符串档位（'0'/'1'）统一比字符串：
         flagRow 选中态只认「当前值 == 选项值」，两边都 String() 后比较，避免类型不一致高亮错。 */
      var now = (state[key] === true) ? '1' : (state[key] === false) ? '0' : String(state[key] === undefined || state[key] === null ? '' : state[key]);
      var b = mk('button', 'kami-seg-item' + (now === o[0] ? ' is-on' : ''), o[1]);
      b.setAttribute('data-kami-act', 'flag:' + key + '=' + o[0]);
      seg.appendChild(b);
    });
    val.appendChild(seg);
    row.appendChild(val);
    return row;
  }

  /* 单行文本设置项：复用契约 §4.2 已登记的 .kami-field + .kami-text（文本框专用类），
     零新类名。行为钩子 data-kami-bodytag 由 bindPanelEvents 的 change 委托接（v2 新增）。 */
  function textRow(key, label) {
    var row = mk('div', 'kami-field');
    row.appendChild(mk('span', 'kami-field-label', label));
    var val = mk('span', 'kami-field-value');
    var inp = mk('input', 'kami-text');
    inp.type = 'text';
    inp.value = bodyTag();
    inp.placeholder = BODY_TAG_DEF;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('data-kami-bodytag', '1');
    inp.setAttribute('aria-label', label);
    val.appendChild(inp);
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
  function setFlag(kv) {
    var i = kv.indexOf('=');
    var k = kv.slice(0, i), v = kv.slice(i + 1);
    state[k] = v;
    saveState();
    syncAll();
    renderPane();
    if (k === 'bodyText') {
      /* 正文美化开关就地点火/还原：不再等下一轮 iframe 事件或 sweep */
      if (v === '1') { try { syncBody(); } catch (e) { } }
      else { try { unwrapAllBody(); } catch (e) { } }
      log('正文美化 → ' + (v === '1' ? '开' : '关'));
    }
  }
  /* 正文标签（v2 新增）：与开关同样的就地点火方式 —— 改完立即「拆旧包 → 按新标签重包」。
     非法值（空 / 尖括号 / 引号 / 空白 / 超长 / 非法标识符）拒绝并回退默认，
     输入框当场回显生效值，绝不把查找拼坏。 */
  function setBodyTag(v, srcNode) {
    var tag = normalizeBodyTag(v);
    if (!tag) {
      toast('warning', '正文标签不合法，已回退为「' + BODY_TAG_DEF + '」');
      tag = BODY_TAG_DEF;
      log('正文标签「' + v + '」非法，回退默认 ' + BODY_TAG_DEF);
    }
    state.bodyTag = tag;
    if (srcNode && srcNode.value !== tag) { srcNode.value = tag; }
    saveState();
    if (bodyTextOn()) {
      /* 边界换了：先全部拆除，再按新标签重新包一轮 */
      try { unwrapAllBody(); } catch (e) { }
      try { syncBody(); } catch (e) { }
    }
    log('正文标签 → ' + tag);
  }
  /* 把 #chat 里所有正文包裹层还原（关闭开关 / 注销时走这里，一条不剩） */
  function unwrapAllBody() {
    var list;
    try { list = HDOC.querySelectorAll(BODY_MES_TEXT_SEL); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) { unwrapOneMesText(list[i]); }
  }

  function setOpen(open) {
    if (!panelRoot) { buildPanel(); }
    state.panel.open = !!open;
    if (open) {
      panelDrop.setAttribute('data-kami-open', '1');
      panelRoot.style.display = '';
      restoreGeometry();
      logGeom('打开');
      renderPane();
    } else {
      panelDrop.setAttribute('data-kami-open', '0');
      panelRoot.style.display = 'none';
    }
    saveState();
  }
  /* flagRow 的选中态按字符串比较：bodyText 用 '0'/'1' 存，读回来统一成布尔给 syncBody 用 */
  function bodyTextOn() {
    return state.bodyText === true || state.bodyText === '1';
  }
  function openPanel() { setOpen(true); }
  function closePanel() { setOpen(false); }
  function togglePanel() { setOpen(!(state.panel.open && panelDrop && panelDrop.getAttribute('data-kami-open') === '1')); }

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
      /* v2：改正文标签名并就地点火（控制台/引导可调；面板输入行走同一个 setBodyTag） */
      setBodyTag: function (v) { setBodyTag(v, null); },
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
    /* 正文包裹层：原样还原（原节点搬回 .mes_text 直接子级），不留残迹 */
    try { unwrapAllBody(); } catch (e) { }
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
    /* 首轮正文美化（开关开着时）：楼层 DOM 可能比样式下发晚建好，再补一次 */
    setTimeout(function () { if (!disposed && bodyTextOn()) { try { syncBody(); } catch (e) { } } }, 600);

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
