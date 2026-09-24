/* ============================================================
 * 🧭 引导   v0.1
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 首次使用本预设时自动弹出的全屏引导向导；也可以随时点按钮条上的「🧭引导」重看。
 *
 * 页面从哪来（两条来源，都在运行时决定）：
 *   · 固定页：免责声明（正文现读预设里的免责条目）、选皮肤（读皮肤管理）、
 *     选模型（读预设设置）、变量页（读预设设置）、反截断（读反截断脚本）、
 *     压缩（读压缩脚本，只讲基础用法与开关，调参指向 📜 面板）、完成页、
 *     一页预留位（状态变量，内容就绪前隐藏）。
 *   · 推导页：预设解析器（test/harness/preset-parse.mjs，构建期内联）在运行时把
 *     当前预设拍成树，**每张「[功能] 选一/任选」卡片一页**——卡片头注释当页首说明，
 *     条目自己的注释当选项说明。以后只改预设本体（增删条目、改注释），引导自动跟着变。
 *
 * 写入通道（自己不碰预设，全部走各脚本暴露的现成 API）：
 *   · 条目开关 / 选模型 / 写变量 → KamiPreset.setEnabled / selectModel / setVar（🌟 预设设置）
 *   · 换皮肤 → KamiSkin.setSkin（🎨 皮肤管理）
 *   · 反截断开关 → AntiTruncation.on / off（🛡 反截断）
 *   · 压缩开关 → KamiSummarize.setRolling / setGrand、调参去 KamiSummarize.open() 打开的 📜 面板（📜 压缩）
 *   对应脚本没在运行时，相关页面降级成纯说明，不让用户卡住。
 *
 * 其它：
 *   · 面板骨架按 docs/皮肤契约.md §4.4（kami-root → kami-drop → 头/正文/脚），
 *     皮肤管理在跑时吃当前皮肤，没在跑时吃内联的兜底皮肤（src/skin/base.css）。
 *   · 「首次」判定：构建时把产物号写进本脚本（@@KAMI_BUILD_N@@），
 *     脚本变量 kami-guide.seen 记「看过的产物号」，不一致才自动弹；每页加载最多弹一次。
 *     关掉面板或走到完成页 = 这个产物看过了。按钮随时能重看。
 *   · 注销零残留：摘监听 / 拆面板 / 收样式 / 撤登记 / 删全局，预设与酒馆设置不被改动。
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '0.1';
  var HUB_NAME = '🧭引导';
  /* 按钮条上的排布（2026-09-21 用户裁定）：**按使用频率从低到高，从左到右** ——
     引导(10) → 皮肤(20) → 预设(30) → 压缩(40) → 反截断(50)。
     引导最不常用，放最左；反截断要常按开关，放最右。中转站按 order 升序排。 */
  var HUB_ORDER = 10;
  var PANEL_ID = 'kami-guide-panel';
  var CSS_ID = 'kami-guide-css';
  var API_NAME = 'KamiGuide';
  var VARS_KEY = 'kami-guide';
  var GUIDE_TAG = 'data-kami-guide';
  var Z = 30000;
  var CHAR_ID = 100001;
  var PRESET_MARK = '卡密预设';        // 自动弹前核对当前预设名含这个
  var READY_TIMEOUT = 15000;           // 等酒馆设置可读的上限
  var READY_TICK = 300;
  var OPEN_DELAY = 1200;               // 页面就绪后再等的缓冲，不抢启动瞬间

  /* 产物号：构建时把 @@KAMI_BUILD_N@@ 替换成真实编号（源码必须能独立编译，所以这么写） */
  var BUILD_N = parseInt('@@KAMI_BUILD_N@@', 10) || 0;

  /* 预留页（状态变量）：内容就绪后把 RESERVED_ON 改 true 并填文案即可上线。
     压缩页已于 2026-09-23 上线（见 buildSteps 里「6.5 压缩」那一步），不再是预留页。 */
  var RESERVED_ON = false;
  var RESERVED_STEPS = [
    { id: 'reserved-statevars', title: '状态变量', body: '（占位：状态变量说明，内容就绪后填写）' }
  ];

  /* ── 页面匹配列表（唯一需要随预设大改而手补的地方） ──
     每页：title 页标题；introKey 页首讲解（文案在 design/copy/guide-copy.json）；
     cards 按名字精确对位预设里的「[功能]」卡片——改名或删卡后该卡自动从向导退场
     （仍在 🌟卡密预设 里可调），一页的卡全没了我这页整个跳过。
     卡片注释（组说明）与条目注释（选项说明）仍运行时从预设解析，不在列表里。 */
  var PAGE_GROUPS = [
    { id: 'lang',   title: '语言文字', introKey: 'pageIntroLang',   cards: ['🗣️ [语言文字]'] },
    { id: 'pace',   title: '故事节奏', introKey: 'pageIntroPace',   cards: ['🏃🏻‍♂️ [剧情推进]', '👁️ [叙事视角]', '🎯 [叙事焦点]'] },
    { id: 'rules',  title: '互动规则', introKey: 'pageIntroRules',  cards: ['🎮 [创作权限]', '🔊 [转述程度]'] },
    { id: 'diff',   title: '游戏难度', introKey: 'pageIntroDiff',   cards: ['⚔️ [难度设定]'] },
    { id: 'style',  title: '文风',     introKey: 'pageIntroStyle',  cards: ['🖊️ [写作文风]', '✒️ [文风优化]'] },
    { id: 'adult',  title: '成人内容', introKey: 'pageIntroAdult',  cards: ['💕 [色色选项]', '🔞 [NSFW文风]'] },
    { id: 'extra',  title: '附加功能', introKey: 'pageIntroExtra',  cards: ['🔛 [正文任务]', '🔚 [尾部任务]'] },
    { id: 'reason', title: '推理选项', introKey: 'pageIntroReason', cards: ['🔧 [推理工具]', '🔀 [增强随机]', '🪓 [底部破限]', '🤔 [推理格式]', '♿ [卡思维链]'] }
  ];

  /* 固定页文案：唯一真相 design/copy/guide-copy.json（构建期内联成 GUIDE_COPY）。
     缺键时回退这里的中性话术；落地脚本绝不重打文案，只读表。 */
  var COPY_DEFAULT = {
    wizardTitle: '新手引导',
    stepCounter: '{n} / {total}',
    progressAria: '第 {n} 页，共 {total} 页',
    btnPrev: '上一步',
    btnNext: '下一步',
    btnConfirm: '确认',
    btnFinish: '完成',
    disclaimerTitle: '免责声明',
    disclaimerIntro: '使用前请先阅读这份说明。',
    disclaimerConfirmHint: '确认后才能进入下一页或关闭引导。',
    disclaimerMissing: '预设里没有找到免责声明条目，请到预设列表中查看。',
    skinPageTitle: '选一套皮肤',
    skinPageIntro: '皮肤决定整个界面的样子。点下面任意一张卡立刻换上，之后随时可以在 🎨 按钮里换。',
    skinCurrent: '当前',
    skinDegrade: '皮肤管理脚本没有在运行，暂时只能用默认外观。启用 🎨 皮肤管理后再点这个按钮重看。',
    modelPageTitle: '你在用什么模型',
    modelPageIntro: '选一个模型，引导会自动开好它名下的条目、关掉其它模型的。以后随时可以在 🌟卡密预设 里换。',
    modelCurrent: '当前',
    modelItemCount: '名下 {n} 条条目',
    presetDegrade: '预设设置脚本没有在运行，这一页暂时只能看。启用 🌟卡密预设 后再点这个按钮重看。',
    varsPageTitle: '生成长度',
    varsPageIntro: '下面几个数字决定 AI 写多长、想多久。改成想要的值就行；范围的两大门填反了会自动交换。',
    pageIntroLang: '选择 AI 输出用的语言。',
    pageIntroPace: '选择故事的推进快慢、叙事视角与镜头对准谁。',
    pageIntroRules: '选择 AI 可以替你写到什么程度。',
    pageIntroDiff: '选择故事的挑战强度。',
    pageIntroStyle: '选择正文按什么味道来写。',
    pageIntroAdult: '选择成人内容的有无与写法。',
    pageIntroExtra: '选择每次回复末尾附带哪些实用部件。',
    pageIntroReason: '选择 AI 思考时使用哪些辅助工具（都是进阶项，默认已配好）。',
    varMin: '最少',
    varMax: '最多',
    varDigitsOnly: '只能填 0 以上的整数',
    varSwapped: '大小填反了，已自动交换',
    antitruncPageTitle: '反截断',
    antitruncPageIntro: '有时回复会在中途被截断。反截断开关用一个变通办法绕开它：开了之后回复改走工具调用通道带回来，体验接近非流式；需要渠道支持函数调用，不支持的渠道开了会没有回复。',
    antitruncOn: '已开启',
    antitruncOff: '已关闭',
    antitruncDegrade: '反截断脚本没有在运行，这里只有说明。启用 🛡 反截断 后可用按钮条上的 🛡 开关。',
    compressPageTitle: '长文压缩（避免顶到模型上限）',
    compressPageIntro: '聊久了每次发出去的内容会越来越多，迟早顶到模型能记住的上限。这一页有两个压缩开关，用来把旧楼层总结成摘要。它们出手的时机不一样，各自都有优劣。',
    compressRollName: '滚动压缩（楼层深了就出手）',
    compressRollNote: '滚动压缩：聊天楼层变深后，自动把较早的旧楼层换成单楼摘要。好处是开一次就省心，聊天自动瘦身。代价是发出去的内容老变。模型端会把发过的内容存下来，下次直接复用就能少花钱。因为内容老变，每次都得全价重新算一遍。另外预设里的摘要条目得一直开着，不然旧楼层被替换后内容就全丢了。',
    compressGrandName: '超限压缩（快超量了再出手）',
    compressGrandNote: '超限压缩：平时完全不动手，直到实际发送量快顶到阈值，才把旧楼层总结成压缩块长期存起来，并把它们从发送内容里去掉。好处是平时发出去的内容长期一模一样，能充分吃到缓存命中来省钱。代价是稍微麻烦点。你得自己把触发阈值调到小于模型能记住的上限。它平时不干活，想提前压得手动点一次总结。',
    compressPickTitle: '怎么选',
    compressPickNote: '按用量计费的渠道推荐用超限压缩；缓存命中能实打实替你省钱。按请求次数收费的渠道推荐用滚动压缩；这类渠道吃不到缓存折扣，滚动模式更省心且发送量一直很小。打算长期玩同一个会话的玩家推荐两个都开；滚动管日常，超限兜极端。',
    compressOn: '已开启',
    compressOff: '已关闭',
    compressParamsNote: '触发阈值、保留楼层、分块大小这三个参数都在 📜 压缩面板里调。在面板里还能手动跑一次总结、看已经压了多少。压过的楼层在聊天界面里会变成半透明，随时可以手动解除。',
    compressOpenPanel: '打开 📜 压缩面板',
    compressDegrade: '压缩脚本没有在运行，这一页只剩说明。启用 📜 压缩 之后可以在这里开关，参数在那块面板里调。',
    completionTitle: '设置完成',
    completionBody: '你的选择已经生效。以后想调整：🌟卡密预设 管条目与变量，🎨 管皮肤，🛡 管反截断；点 🧭引导 可以随时重看这份引导。',
    fallbackMissing: '这一项在预设里找不到了，可能已被改名或删除。',
    applyFail: '这次改动没有写进去，可以重试一次，或稍后到 🌟卡密预设 里手动改。'
  };
  var GUIDE_COPY = null; /* @@KAMI_GUIDE_COPY_JS@@ */
  function copyOf(key) {
    try {
      if (GUIDE_COPY && GUIDE_COPY[key]) { return String(GUIDE_COPY[key]); }
    } catch (e) { }
    return COPY_DEFAULT[key] || '';
  }

  /* ── 兜底皮肤（唯一真相：src/skin/base.css，构建期内联成字符串常量） ── */
  /* @@KAMI_BASE_CSS_JS@@ */

  /* ── 预设结构解析器（规则真相：test/harness/preset-parse.mjs，构建期内联） ── */
  /* @@KAMI_PRESET_PARSE@@ */

  /* ── 模型卡 / 条目卡的**结构**只有一份实现：src/scripts/_preset-cards.js（构建期内联）──
     🌟 预设设置面板内联的是同一份，所以向导的模型页与预设面板的模型 tab 同构
     （模型卡 = div.kami-card + 可点卡头 + 卡内条目网格），不会再各写一套（契约 §4.4）。 */
  /* @@KAMI_PRESET_CARDS@@ */

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
    try { if (window.console && console.log) { console.log('[引导] ' + msg); } } catch (e) { }
  }
  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, '🧭 引导'); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }

  /* ───────── 状态 ───────── */

  var disposed = false;
  var panelRoot = null, panelDrop = null, panelBody = null, panelDots = null;
  var panelCounter = null, btnPrev = null, btnNext = null, btnClose = null;
  var steps = [];            // 可见的步骤模型（打开时构建）
  var cur = 0;               // 当前页下标
  var confirmed = false;     // 第一页「确认」门禁
  var seen = 0;              // 看过的产物号（脚本变量 kami-guide.seen）
  var autoOpened = false;    // 本次页面加载已自动弹过
  var readyTimer = null, openTimer = null, pingTimer = null, hideHandler = null;
  var ownDef = null;

  /* ───────── 脚本变量（记「看过的产物号」） ───────── */

  function readGuideVars() {
    var all = {};
    try {
      if (typeof getVariables === 'function') { all = getVariables({ type: 'script' }) || {}; }
    } catch (e) { all = {}; }
    var v = all[VARS_KEY];
    seen = (v && typeof v.seen === 'number') ? v.seen : 0;
    return seen;
  }
  function saveGuideVars() {
    try {
      if (typeof replaceVariables !== 'function') { return; }
      var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
      all[VARS_KEY] = { seen: seen };
      replaceVariables(all, { type: 'script' });
      log('已记「看过的产物号」=' + seen);
    } catch (e) { log('记变量失败：' + ((e && e.message) || e)); }
  }

  /* ───────── 酒馆设置：读 ───────── */

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
  function settingsOf(ctx) {
    if (!ctx) { return null; }
    try { if (ctx.chatCompletionSettings) { return ctx.chatCompletionSettings; } } catch (e) { }
    try { if (HOST && HOST.oai_settings) { return HOST.oai_settings; } } catch (e) { }
    return null;
  }
  function pickOrder(s) {
    var list = (s && s.prompt_order) ? s.prompt_order : [], i, best = null;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].character_id === CHAR_ID && list[i].order && list[i].order.length) { return list[i]; }
    }
    for (i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].order || !list[i].order.length) { continue; }
      if (!best || list[i].order.length > best.order.length) { best = list[i]; }
    }
    return best;
  }
  function readRaw() {
    var ctx = stCtx();
    if (!ctx) { return { ok: false, error: '拿不到酒馆设置：SillyTavern.getContext 不可用' }; }
    var s = settingsOf(ctx);
    if (!s) { return { ok: false, error: '酒馆设置里没有 chatCompletionSettings' }; }
    var pm = pickOrder(s);
    if (!pm) { return { ok: false, error: '当前预设的 prompt_order 是空的', ctx: ctx, settings: s }; }
    return { ok: true, error: null, ctx: ctx, settings: s, order: pm };
  }
  function presetName() {
    var raw = readRaw();
    if (!raw.ok) { return null; }
    var s = raw.settings;
    return (s && (s.preset_settings_openai || s.name || s.preset_name)) || null;
  }
  function readTree() {
    var raw = readRaw();
    if (!raw.ok) { return raw; }
    var preset = {
      name: raw.settings.name || raw.settings.preset_name || '当前预设',
      prompts: raw.settings.prompts || [],
      prompt_order: [raw.order]
    };
    var tree = null, err = null;
    try { tree = parsePreset(preset); } catch (e) { err = (e && e.message) || String(e); }
    if (!tree) { return { ok: false, error: '预设解析失败：' + err }; }
    raw.preset = preset;
    raw.tree = tree;
    return raw;
  }
  function liveEnabledMap() {
    var raw = readRaw(), map = {}, i;
    if (!raw.ok) { return map; }
    var list = raw.order.order || [];
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].identifier) { map[list[i].identifier] = list[i].enabled !== false; }
    }
    return map;
  }

  /* ───────── 组装步骤（可见页） ───────── */

  function stripBrackets(s) {
    var t = String(s || '');
    return t.split('[').join('').split(']').join('').trim();
  }
  function findEntryByName(prompts, part) {
    var list = prompts || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].name || '').indexOf(part) >= 0) { return list[i]; }
    }
    return null;
  }
  function inferredModel() {
    var api = HOST.KamiPreset;
    try {
      if (api && typeof api.currentModel === 'function') {
        var c = api.currentModel();
        if (c) { return c; }
      }
    } catch (e) { }
    var map = liveEnabledMap(), i, j, k;
    for (i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.kind !== 'card') { continue; }
      for (j = 0; j < (st.groups || []).length; j++) {
        var its = st.groups[j].items || [];
        for (k = 0; k < its.length; k++) {
          if (its[k].models && its[k].models.length && map[its[k].identifier]) { return its[k].models[0]; }
        }
      }
    }
    return null;
  }

  /* 模型页条目注释：解析器整棵树里按 identifier 查第一个 {{//}}（models() 不带注释） */
  function noteByIdentifier(prompts) {
    var map = {}, i;
    for (i = 0; i < prompts.length; i++) {
      if (prompts[i] && prompts[i].identifier) { map[prompts[i].identifier] = firstComment(prompts[i].content) || ''; }
    }
    return map;
  }

  function buildSteps(raw) {
    var tree = raw.tree;
    var prompts = (raw.preset && raw.preset.prompts) || [];
    var out = [], i, j, k;

    /* 1. 免责（正文现读；确认门禁在渲染层做） */
    var disc = findEntryByName(prompts, '免责');
    out.push({
      kind: 'disclaimer', id: 'disclaimer',
      title: copyOf('disclaimerTitle'),
      intro: copyOf('disclaimerIntro'),
      text: disc ? (firstComment(disc.content) || '') : '',
      missing: !disc
    });

    /* 2. 皮肤 */
    out.push({ kind: 'skin', id: 'skin', title: copyOf('skinPageTitle'), intro: copyOf('skinPageIntro') });

    /* 3. 模型 */
    out.push({ kind: 'model', id: 'model', title: copyOf('modelPageTitle'), intro: copyOf('modelPageIntro'), noteMap: noteByIdentifier(prompts) });

    /* 4. 变量页（「插图」变量跟到「文生图」那页去，其余都留在这页）。
       这里只记录「有哪些变量条目」——值渲染时从 KamiPreset.vars() 现读。 */
    var varCards = [];
    for (i = 0; i < (tree.tabs || []).length; i++) {
      var tab = tree.tabs[i];
      for (j = 0; j < (tab.varCards || []).length; j++) {
        var vc = tab.varCards[j];
        for (k = 0; k < (vc.cards || []).length; k++) { varCards.push(vc.cards[k]); }
      }
    }
    var pageVarIds = [], attachVarId = null;
    for (i = 0; i < varCards.length; i++) {
      var c1 = varCards[i];
      if (String(c1.entryName || '').indexOf('插图') >= 0) { attachVarId = c1.identifier; continue; }
      pageVarIds.push(c1.identifier);
    }
    if (pageVarIds.length) {
      out.push({ kind: 'vars', id: 'vars', title: copyOf('varsPageTitle'), intro: copyOf('varsPageIntro'), entryIds: pageVarIds });
    }

    /* 5. 推导页：按内置匹配列表组页（PAGE_GROUPS）；模型 tab 是特殊 tab，由第 3 步专页处理 */
    var entryById = {};
    for (i = 0; i < prompts.length; i++) { if (prompts[i]) { entryById[prompts[i].identifier] = prompts[i]; } }
    var cardByName = {};
    for (i = 0; i < (tree.tabs || []).length; i++) {
      var tab3 = tree.tabs[i];
      if (tab3.kind === 'model') { continue; }
      for (j = 0; j < (tab3.cards || []).length; j++) {
        var cd = tab3.cards[j];
        cardByName[cd.name] = cd;
      }
    }
    for (i = 0; i < PAGE_GROUPS.length; i++) {
      var grp = PAGE_GROUPS[i];
      var groups = [], itemVar = null, m;
      for (j = 0; j < grp.cards.length; j++) {
        var card = cardByName[grp.cards[j]];
        if (!card) { continue; }
        var items = [];
        for (k = 0; k < (card.items || []).length; k++) {
          var e = card.items[k];
          items.push({
            identifier: e.identifier, name: e.name,
            enabled: e.enabled !== false, models: (e.models || []).slice(),
            desc: firstComment(e.content) || ''
          });
        }
        if (!items.length) { continue; }
        /* 卡片头说明：解析器给的是 headIdentifier，反查条目正文取第一个 {{//}} */
        var headEntry = card.headIdentifier ? entryById[card.headIdentifier] : null;
        var cardIntro = headEntry ? (firstComment(headEntry.content) || '') : '';
        /* 「插图」变量跟到含「文生图」条目的那页 */
        if (!itemVar && attachVarId) {
          var hit = false, k2;
          for (k2 = 0; k2 < items.length; k2++) {
            if (String(items[k2].name || '').indexOf('文生图') >= 0) { hit = true; break; }
          }
          if (hit) { itemVar = attachVarId; }
        }
        groups.push({
          name: card.name,
          /* ⚠️ 解析器给的是**中文**模式名（preset-parse.mjs:368 的 '单选' / '多选'），
           这里原来写成 card.mode === 'once'，永远不成立 —— 后果是引导里「单选卡片」
           既不取消同组其它卡片的选中，也没给卡片打上 data-kami-single
           （用户 2026-09-22 真机报的「选一张，原来那张不取消高亮」就是这个）。
           同一套词汇在 40-预设设置.js 里用的是 '单选'，两边必须一致。 */
        mode: card.mode === '单选' ? 'once' : 'any',
          intro: cardIntro,
          items: items
        });
      }
      if (!groups.length) { continue; }
      out.push({
        kind: 'card', id: 'page:' + grp.id,
        title: grp.title, intro: copyOf(grp.introKey),
        groups: groups, varCard: itemVar
      });
    }

    /* 6. 反截断 */
    out.push({ kind: 'antitrunc', id: 'antitrunc', title: copyOf('antitruncPageTitle'), intro: copyOf('antitruncPageIntro') });

    /* 6.5 压缩（用户 2026-09-23 点名加在反截断后面：只讲基础用法 + 开关，调参指向 📜 面板） */
    out.push({ kind: 'compress', id: 'compress', title: copyOf('compressPageTitle'), intro: copyOf('compressPageIntro') });

    /* 7. 预留页（内容就绪前隐藏） */
    if (RESERVED_ON) {
      for (i = 0; i < RESERVED_STEPS.length; i++) {
        out.push({ kind: 'draft', id: RESERVED_STEPS[i].id, title: RESERVED_STEPS[i].title, body: RESERVED_STEPS[i].body });
      }
    }

    /* 8. 完成 */
    out.push({ kind: 'done', id: 'done', title: copyOf('completionTitle'), intro: copyOf('completionBody') });
    return out;
  }

  /* ───────── 面板 CSS（全屏几何 + 报纸式排版层） ─────────
     原则：本层只做「排版与结构」（刊头 / 分栏 / 图版 / 说明文 / 按钮层级），
     **一个颜色都不自己定**——底色、墨色、描边、圆角、间距全部引用皮肤令牌。
     于是每套皮肤一换，向导自动跟着换材质；皮肤管理没跑时由内联兜底皮肤供料。 */

  var GUIDE_CSS = [
    /* 结构：全屏向导。特异性压过皮肤管理的面板几何层与窄屏抽屉兜底。
       ⚠️ border-radius:0!important 是**登记在案的例外**（契约 §9）：全屏向导的四角必须贴边，
       几何层给 .kami-drop 写的是 var(--kami-r-lg,14px)，不压掉就会在屏幕上留四个圆角。
       不要为了「合规」把它改成圆角令牌 —— 那会把全屏向导变成一张带圆角的浮窗。 */
    /* ⚠️ 第二条登记在案的例外：舞台宽度夹到视口（`100vw`）。
       舞台是 `position:fixed;left:0;right:0` 撑的，**定位包含块不是视口而是酒馆的 html 盒子**
       （酒馆给 html 上了 transform/perspective，见 30-皮肤管理.js 里那段注释）。
       于是**页面一旦横向溢出，舞台就跟着变宽，全屏面板整体右移，最右边的 ✕ 被推出屏幕**
       —— 预览台 375px 下实测 wod / trpg 是 399 宽、✕ 视口右距 -9 ~ -11（其它 13 套都是 +11 以上）。
       越界来源是预览台自己的固定工具条，**不是皮肤元素**（皮肤一条页面级选择器都没有）。
       `max-width:100vw` 只在「页面比视口宽」时生效：桌面端 100vw ≥ 视口，等于没有这条；
       手机上它把面板夹回屏幕内，✕ 就回来了。契约 §9.2 已登记。 */
    '#' + PANEL_ID + '{max-width:100vw!important;}',
    '#' + PANEL_ID + ' .kami-drop.kami-drop{left:0!important;top:0!important;right:auto!important;bottom:auto!important;',
    'width:100%!important;height:100%!important;max-height:100%!important;border-radius:0!important;}',
    '#' + PANEL_ID + ' .kami-drop{display:flex;flex-direction:column;overflow:hidden;',
    /* ⚠️ 墨色 / 纸色必须在这里先拍快照（2026-09-23 用户报「统御皮肤的确认和下一步按钮看不见」）：
       wod / terminal / empire / grokbot / mileng 五套皮肤把 --kami-fg 重定义在 .kami-btn--primary
       **元素自己身上**（`--kami-fg:var(--kami-accent-fg)`，为的是让强调块反相）。
       页脚主键那条规则特异性最高，底与字读的都是 --kami-fg / --kami-bg 这族令牌，
       于是元素上的 --kami-fg 被换成强调块里的深色字，--kami-bg 又是深色面板 ——
       实测底 rgb(27,18,38) + 字 rgb(22,16,31)，对比度 1.03，等于一个隐形按钮。
       快照拍在面板表面（祖先元素）上，元素级的重定义就影响不到它。 */
    '--kami-guide-ink:var(--kami-fg,#1a1a1a);--kami-guide-paper:var(--kami-bg,#fff);}',

    /* 报纸骨架：正文区一栏到底，页脚墨块，滚动只在正文 */
    '#' + PANEL_ID + ' .kami-body{flex:1 1 auto;min-height:0;}',
    '#' + PANEL_ID + ' .kami-foot{flex:0 0 auto;gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID + ' .kami-foot .kami-btn{flex:1 1 0;min-width:0;}',

    /* 刊头：标题加大、期号行等宽、上下双规线（结构，颜色用令牌） */
    '#' + PANEL_ID + ' .kami-head{flex-wrap:nowrap;padding:calc(var(--kami-pad-lg-y,12px) * 1.4) var(--kami-pad-lg-x,14px);}',
    /* 刊头三件套的伸缩权（2026-09-23 用户报「手机端看不到关闭按钮」）：
       375px 实测页头溢出 18px、✕ 的右缘越过面板 17px，被 overflow:hidden 裁掉。
       占宽度的是长标题，所以由标题承担收缩（flex:1 1 auto + min-width:0 + 省略号），
       圆点 / 期号 / 动作区一律不缩 —— 关闭键在任何宽度下都必须留在面板里。 */
    '#' + PANEL_ID + ' .kami-head .kami-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
    'font-size:var(--kami-fs-lg,17px);letter-spacing:var(--kami-ls-title,.06em);}',
    '#' + PANEL_ID + ' .kami-head .kami-dot,' + '#' + PANEL_ID + ' .kami-head .kami-sub,' +
    '#' + PANEL_ID + ' .kami-head .kami-actions{flex:0 0 auto;}',
    '#' + PANEL_ID + ' .kami-head .kami-sub{white-space:nowrap;font-family:var(--kami-font-mono,monospace);}',
    '#' + PANEL_ID + ' .kami-dots{display:flex;flex-wrap:wrap;gap:calc(var(--kami-gap,8px)/2);justify-content:center;align-items:center;',
    'padding:calc(var(--kami-pad-y,6px) + 2px) var(--kami-pad-x,10px) 0;flex:0 0 auto;}',
    '#' + PANEL_ID + ' .kami-dots .kami-dot{cursor:pointer;}',

    /* 导语（页首说明）与栏目小标题。压淡改用墨色令牌（--kami-fg-dim = 次要文字），
       不再写死 opacity —— 透明度没有现成令牌，见契约 §3.9。 */
    '#' + PANEL_ID + ' .kami-guide-offnote{color:var(--kami-fg-dim,currentColor);}',
    '#' + PANEL_ID + ' .kami-guide-lead{font-size:var(--kami-fs-sm,13px);line-height:1.7;margin:0 0 var(--kami-gap,8px);}',
    '#' + PANEL_ID + ' .kami-guide-sec{display:flex;align-items:center;gap:var(--kami-gap,8px);',
    'margin:calc(var(--kami-gap,8px) * 1.5) 0 var(--kami-gap,8px);font-weight:var(--kami-fw-title,600);font-size:var(--kami-fs-sm,13px);}',
    '#' + PANEL_ID + ' .kami-guide-sec::before,' + '#' + PANEL_ID + ' .kami-guide-sec::after{content:"";flex:1 1 0;height:0;',
    'border-top:var(--kami-border-w,1px) solid var(--kami-line,rgba(128,128,128,.3));}',

    /* 免责长文：纸面等宽留白，行高放松 */
    '#' + PANEL_ID + ' .kami-guide-doc{white-space:pre-wrap;word-break:break-word;line-height:1.75;}',
    '#' + PANEL_ID + ' .kami-guide-doc strong{font-weight:var(--kami-fw-title,600);}',

    /* 照片卡（选项）：标题栏 = 图版位（emoji ＋ 条目名同行），下面是图片说明。
       列宽自适应，宽屏多栏、窄屏一栏 */
    /* ⚠️ align-items:start 是**必须的**（2026-09-22 用户报「同一行里最后一张卡总是高一点」）：
       默认的 normal/stretch 在网格里会让**每一行最后一张卡**被拉伸到行高（实测 63px vs 其它 47px），
       成因是表单控件（条目卡是 <button>）在 normal 下的拉伸行为不一致；显式 start 之后
       每张卡都取自己的自然高度，整行立刻齐平（实测 47/51/47，选中的那张高 4px 是强调线的设计）。
       实测：改成 stretch 无效（最后一张仍 63）。别再删这一行。 */
    '#' + PANEL_ID + ' .kami-guide-grid{display:grid;align-items:start;',
    'grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item{flex-direction:column;align-items:stretch;gap:0;padding:0;overflow:hidden;text-align:left;}',
    /* 角标/注释标记的高度补偿（2026-09-25 补）。上面那条 `padding:0` 带**面板 id**，
       特异性 (1,2,0) 高于皮肤自己的 `.kami-item:has(> .kami-badge[data-kami-corner=...])`
       补偿 (0,6,1)—— id 永远赢。所以条目卡一旦带 emoji 角标或 ⓘ，补偿就被压掉，
       角标直接盖在条目名上。这里补两条**同样以面板 id 开头、并带 :has()** 的规则
       （特异性 (1,4,0)，压得过），让带角标的卡片在引导里也「只占高度不占宽度」（契约 §4.4）。
       取值与各皮肤一致：--kami-pad-y ＋ 1.4em（卡片字号）—— 1.4em 必然盖过角标
       自身高度（角标的 1.4em 取的是更小的 --kami-fs-xs）。
       ⚠️ 今天不命中任何元素：引导现有的 `.kami-guide-grid > .kami-item` 全是「图版位」
       卡片（emoji 走 .kami-guide-plate-glyph 行内排版，没有 data-kami-corner 角标），
       `.kami-guide-skins > .kami-item` 是皮肤预览卡。所以观感零变化，纯粹是防回归：
       实测把一张同构条目卡注入 .kami-guide-grid，修复前 ⓘ ∩ 条目名 = 268.1px²
      （xianyun）/ 265px²（grokbot）/ emoji 224.6px²（trpg，连干净皮肤也中招）。 */
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item:has(> .kami-badge[data-kami-corner="tl"], > .kami-badge[data-kami-corner="tr"], > .kami-card-note[data-kami-corner="tr"]){padding-top:calc(var(--kami-pad-y,7px) + 1.4em);}',
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item:has(> .kami-badge[data-kami-corner="bl"], > .kami-badge[data-kami-corner="br"]){padding-bottom:calc(var(--kami-pad-y,7px) + 1.4em);}',
    /* 条目开关卡片一律排网格（2026-09-21 用户裁定，**推翻**同日「有注释的占满整行」的旧决定）：
       带注释的卡片（说明文字常展开）与普通卡片同列宽排布，不独占一行。带注释的卡片会高一截
       （多一行图片说明），同行其它卡片被网格拉伸到同一高度，视觉上仍是一整行。
       模型页的条目卡走另一条路（带注释的会被 buildItemCard 包进 .kami-item-note），
       规则见下面的 .kami-guide-grid-models 段。 */
    /* 标题栏（图版位）：emoji 与名字一行。
       上下内边距比通用档多 4px：卡片自带大圆角（皮肤决定，各套不同），
       通用档在圆角大的皮肤下会让文字的墨水盒贴到圆弧上（真机实测余量只剩 5.9px）。
       这一层只调排版、不碰颜色，符合「引导只做排版」的约定。 */
    '#' + PANEL_ID + ' .kami-guide-plate{display:flex;align-items:center;gap:calc(var(--kami-gap,8px)/2);',
    'min-height:var(--kami-row-h,34px);padding:calc(var(--kami-pad-y,7px) + 4px) var(--kami-pad-x,10px);',
    'border-bottom:var(--kami-border-w,1px) solid var(--kami-line,rgba(128,128,128,.3));',
    'background-color:var(--kami-t1,rgba(128,128,128,.06));}',
    '#' + PANEL_ID + ' .kami-guide-plate-glyph{flex:none;font-size:var(--kami-icon,15px);line-height:1;}',
    '#' + PANEL_ID + ' .kami-guide-plate-name{flex:1 1 auto;min-width:0;font-size:var(--kami-fs-sm,13px);',
    'font-weight:var(--kami-fw-title,600);line-height:1.3;}',
    '#' + PANEL_ID + ' .kami-guide-capdesc{display:block;padding:var(--kami-pad-y,7px) var(--kami-pad-x,10px);',
    'font-size:var(--kami-fs-xs,11px);color:var(--kami-fg-mute,#888);}',
    /* 开关态：标题栏粗底线（强调色）＋整卡高亮，关态整卡压淡——差别一眼看得出
       ⚠️ 2026-09-21 修：选中底原来直接写 `background-color: var(--kami-accent-soft)`，
       把卡**自己的面色**整个换掉了。色块皮肤在「卡 / 条目」作用域里把
       `--kami-accent-soft` 重映射成 `--kami-clay-accent-soft` ＝ rgba(22,22,26,.08)
       ＝**一层墨膜**；它铺在向导的炭黑底上还是黑的，而卡里的文字被同一套重映射
       翻成了墨色 #16161a —— 用户报的「选中色块皮肤时『色块』两个字看不见」就是这里
       （实测 ≈1.00:1）。其余四套皮肤的 accent-soft 是彩色半透明淡染，压在浅纸面上没事，
       所以只有色块犯。
       修法：**先铺卡自己的面色（--kami-card），再把淡染当一层叠加** —— 淡染不再是「底」，
       只是「染色」。这样六套皮肤下都是「浅面 + 一层淡染」，字永远压在它该在的那块面上。
       （属排版层改动，仍然不自定颜色，全部引皮肤令牌。） */
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item.is-on{',
    'background-color:var(--kami-card,transparent);',
    'background-image:linear-gradient(var(--kami-accent-soft,rgba(128,128,128,.12)),var(--kami-accent-soft,rgba(128,128,128,.12)));',
    'border-color:var(--kami-accent-line,currentColor);}',
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item.is-on .kami-guide-plate{',
    'border-bottom:calc(var(--kami-accent-mark,2px) + 2px) solid var(--kami-accent,currentColor);}',
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item:not(.is-on){opacity:var(--kami-dim-soft,.62);}',
    /* 锁死（非当前模型） */
    '#' + PANEL_ID + ' .kami-guide-grid > .kami-item[disabled]{opacity:var(--kami-dim-lock,.38);}',
    /* 皮肤预览卡：宽栏（预览窗要看得清），一栏到两栏 */
    '#' + PANEL_ID + ' .kami-guide-skins{display:grid;',
    'grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID + ' .kami-guide-skins > .kami-item{flex-direction:column;align-items:stretch;gap:0;padding:0;overflow:hidden;text-align:left;}',
    /* 同上：皮肤预览卡万一带上角标/注释标记，也别让 padding:0 把补偿压掉。
       （今天皮肤卡没有角标，这条是纯防回归，观感零变化。） */
    '#' + PANEL_ID + ' .kami-guide-skins > .kami-item:has(> .kami-badge[data-kami-corner="tl"], > .kami-badge[data-kami-corner="tr"], > .kami-card-note[data-kami-corner="tr"]){padding-top:calc(var(--kami-pad-y,7px) + 1.4em);}',
    '#' + PANEL_ID + ' .kami-guide-skins > .kami-item:has(> .kami-badge[data-kami-corner="bl"], > .kami-badge[data-kami-corner="br"]){padding-bottom:calc(var(--kami-pad-y,7px) + 1.4em);}',
    '#' + PANEL_ID + ' .kami-guide-skins .kami-guide-cap{display:block;padding:var(--kami-pad-y,7px) var(--kami-pad-x,10px);',
    'font-size:var(--kami-fs-sm,13px);font-weight:var(--kami-fw-title,600);}',
    '#' + PANEL_ID + ' .kami-guide-skins > .kami-item.is-on{',
    /* 同上（皮肤预览卡）：先铺卡自己的面色，再把强调淡染叠上去 ——
       直接拿 accent-soft 当底，在色块皮肤下就是「墨膜当底、墨字压上去」。 */
    'background-color:var(--kami-card,transparent);',
    'background-image:linear-gradient(var(--kami-accent-soft,rgba(128,128,128,.12)),var(--kami-accent-soft,rgba(128,128,128,.12)));',
    'border-color:var(--kami-accent-line,currentColor);}',
    '#' + PANEL_ID + ' .kami-guide-skins > .kami-item.is-on .kami-guide-pv{',
    'border-bottom:calc(var(--kami-accent-mark,2px) + 2px) solid var(--kami-accent,currentColor);}',
    /* 变量页 / 模型页：grid 卡片（🌟 面板同款），不用列表式 */
    '#' + PANEL_ID + ' .kami-guide-grid-cards{display:grid;',
    'grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:var(--kami-gap,8px);}',
    '#' + PANEL_ID + ' .kami-guide-grid-cards > .kami-card{display:flex;flex-direction:column;gap:calc(var(--kami-gap,8px)/2);}',
    /* 模型页专属：模型卡更宽的列（宽屏 2 列）＋ 卡内条目卡两列起步 ＋ 条目卡内部不再叠第二层内边距。
       —— 为什么单独开一个类（`renderModel` 给网格多加 .kami-guide-grid-models）——
       真机实测（1259px 视口、色块皮肤）：「Gemini随机数」被渲染成竖排单字，量出来的账是
         条目卡 141.6px ＝ 卡自身内边距 24 ＋ **卡头 .kami-card-head 的内边距 40** ＋ 行间距 8
                              ＋ ⓘ 18 ＋ ⓘ 左边距 6 ＋ 名字只剩 44.4px（字号 13.5px，不到 3.5 个字）。
       那 40px 是皮肤里「面板内卡片的内边距改挂到直接子元素上」那条规则
       （.kami-drop .kami-card > .kami-card-head{padding:16px 20px}）命中条目卡的头补出来的 ——
       条目卡自己已经有 12px 内边距，两层一叠，宽度就没了。没有 ⓘ 的条目因为不扣那 32px
       还留着 76px，所以看起来正常，真凶是「内边距叠了两层 ＋ 条目卡太窄」。
       本层只调引导这一页的排版，不碰皮肤：
         ① 模型卡列宽 240 → 480px（宽屏 2 列，同 🌟 面板「一张宽卡装一组条目」的形状）；
         ② 卡内条目卡最小 220px（皮肤给面板网格的是 100px，四列模型卡里被切成 143px）；
         ③ 条目卡的头只把**左右**内边距归零（上下留着：角标 emoji 钉在卡角上，名字要躲开它）。
       手机等窄视口下两条都退化成 1 列，宽度只多不少。 */
    '#' + PANEL_ID + ' .kami-guide-grid-models{grid-template-columns:repeat(auto-fill,minmax(min(100%,480px),1fr));}',
    /* ⚠️ 2026-09-21 二次修（用户报「解析出来的条目开关卡片，没有注释的话应该排网格」）：
       220px 的下限在手机上会把卡内条目排成**一行一张**（实测 442px 的模型卡 → 卡内条目 441px 宽、
       正好 1 列），于是没有注释的条目也白占一整行。现在收到 150px：手机上 2 列、宽屏 3 列。
       2026-09-21 三次修（用户裁定「带注释的也不要独占一行」）：带注释的条目卡（外包层
       .kami-item-note）与普通条目卡同列宽排布，注释在卡下方容器里展开/收起。 */
    '#' + PANEL_ID + ' .kami-guide-grid-models .kami-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));}',
    '#' + PANEL_ID + ' .kami-guide-grid-models .kami-item > .kami-card-head{padding-left:0;padding-right:0;}',
    /* 带注释的外包层（契约 §4.2 .kami-item-note）：网格里占满一格，注释容器在卡下方。
       ⚠️ 不许用面板 id 限定 —— 这是两块面板共用的组件（契约 §4.4 硬规则 2 与新增的
       「面板内组件规则一律不得用面板 id 限定」），写死 #kami-guide-panel 会让 🌟 面板的
       同名组件吃不到同一套排版（ⓘ 与开关高亮就是这么丢的）。 */
    '.kami-item-note{display:flex;flex-direction:column;min-width:0;}',
    '.kami-item-note > .kami-card-note{margin:0 0 calc(var(--kami-gap,8px)/2);}',

    /* 反截断开关行（行式开关，纯开关不带说明） */
    '#' + PANEL_ID + ' .kami-guide-switchrow{display:flex;align-items:center;gap:var(--kami-gap,8px);width:100%;text-align:left;',
    'padding:var(--kami-pad-y,7px) var(--kami-pad-x,10px);',
    'border:var(--kami-border-w,1px) solid var(--kami-line,rgba(128,128,128,.3));border-radius:var(--kami-r-sm,9px);',
    'background-color:var(--kami-card,transparent);cursor:pointer;font:inherit;color:inherit;}',
    '#' + PANEL_ID + ' .kami-guide-switchrow .kami-guide-rowname{flex:1 1 auto;font-size:var(--kami-fs-sm,13px);font-weight:var(--kami-fw-title,600);}',
    '#' + PANEL_ID + ' .kami-guide-switchrow .kami-guide-rowstate{flex:none;font-size:var(--kami-fs-xs,11px);',
    'color:var(--kami-fg-mute,#888);font-family:var(--kami-font-mono,monospace);}',
    '#' + PANEL_ID + ' .kami-guide-switchrow.is-on{border-color:var(--kami-accent-line,currentColor);',
    'background-color:var(--kami-card,transparent);',
    'background-image:linear-gradient(var(--kami-accent-soft,rgba(128,128,128,.12)),var(--kami-accent-soft,rgba(128,128,128,.12)));}',
    '#' + PANEL_ID + ' .kami-guide-switchrow.is-on .kami-guide-rowstate{color:var(--kami-accent,currentColor);}',

    /* 变量页（grid 卡片的行内排布） */
    '#' + PANEL_ID + ' .kami-guide-varrow{display:flex;gap:var(--kami-gap,8px);align-items:center;flex-wrap:wrap;}',
    '#' + PANEL_ID + ' .kami-guide-varrow .kami-field-label{flex:0 0 auto;}',
    '#' + PANEL_ID + ' .kami-guide-varrow input.kami-number{flex:1 1 6em;min-width:5em;}',

    /* 皮肤预览小窗。margin-top 归零：预览窗是卡片的第一块，图版位那一行的上间距在它身上不需要。
       这条类名同时被上面「选中态粗底线」消费（原来 DOM 里没有任何元素带它 → 那条规则永不命中）。
       ⚠️ 2026-09-21：两个元素都必须 pointer-events:none —— iframe 是独立文档，
       点进去就被它自己消化掉、**不冒泡到父 button**，于是「点预览图选不中皮肤，
       只有点下面的说明文字才行」（用户报的）。🎨 面板的同款预览窗
       （30-皮肤管理.js 的 .kami-pv / .kami-pv-frame）一直就有这两条，向导这边漏了。 */
    '#' + PANEL_ID + ' .kami-guide-pv{position:relative;display:block;overflow:hidden;',
    'border-radius:var(--kami-r-sm,9px);margin-top:0;pointer-events:none;}',
    '#' + PANEL_ID + ' .kami-guide-pv-frame{display:block;width:100%;border:0;pointer-events:none;}',

    /* 主按钮＝报纸的「墨块」：用皮肤自己的墨色与纸色做反相（不是新配色）。
       正文对比度契约保证 fg/bg ≥ 4.5:1，所以任何皮肤下墨块都清楚；
       禁用的主按钮（确认前）保持可读但不抢注意力。
       ⚠️ 读的是拍在面板表面上的快照（见上面 .kami-drop 那条），不能改回去直接读 --kami-fg：
       五套皮肤在按钮元素上重定义了这个令牌，直接读就会得到「深字压深底」的隐形按钮。
       `node build/lint-guide.mjs` 会机械拦这种写法。 */
    '#' + PANEL_ID + ' .kami-foot .kami-btn--primary{',
    'background-color:var(--kami-guide-ink,#1a1a1a);border-color:var(--kami-guide-ink,#1a1a1a);color:var(--kami-guide-paper,#fff);',
    'font-weight:var(--kami-fw-title,600);}',
    '#' + PANEL_ID + ' .kami-foot .kami-btn--primary[disabled]{',
    'background-color:var(--kami-guide-ink,#1a1a1a);border-color:var(--kami-guide-ink,#1a1a1a);color:var(--kami-guide-paper,#fff);opacity:var(--kami-dim-lock,.38);}',
    '#' + PANEL_ID + ' .kami-foot .kami-btn--ghost{background-color:transparent;}'
  ].join('');

  function injectCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var st = HDOC.createElement('style');
      st.id = CSS_ID;
      st.textContent = GUIDE_CSS + String.fromCharCode(10) + (typeof KAMI_BASE_CSS === 'string' ? KAMI_BASE_CSS : '');
      (HDOC.head || HDOC.documentElement).appendChild(st);
    } catch (e) { log('注入样式失败：' + ((e && e.message) || e)); }
  }
  function dropCss() {
    try {
      var st = HDOC.getElementById(CSS_ID);
      if (st && st.parentNode) { st.parentNode.removeChild(st); }
    } catch (e) { }
  }

  /* ───────── DOM 工具 ───────── */

  function el(tag, cls, text) {
    var n = HDOC.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null && text !== '') { n.textContent = String(text); }
    return n;
  }
  /* 图版用：取条目名开头的图形符号（emoji/方括号区等），取不到就退回首字符 */
  function leadingGlyph(name) {
    var s = String(name || '').trim();
    if (!s) { return '◆'; }
    var first = s.split(' ')[0];
    /* 以「[」开头的是层级名（如 [语言文字]），整段当图版 */
    if (first.indexOf('[') === 0) { return first; }
    if (first.length > 0 && first !== s) { return first; }
    return s.charAt(0);
  }
  /* 说明文用：去掉开头的图形符号，只留名字正文 */
  function stripGlyph(name) {
    var s = String(name || '').trim();
    var first = s.split(' ')[0];
    if (first && first !== s && first.indexOf('[') !== 0) { return s.slice(first.length).trim() || s; }
    return s;
  }
  /* ── 真 markdown 渲染（2026-09-22 补，用户指出「引导面板也用 markdown」）──
     免责条目是真 markdown（标题 / 粗体 / 表格 / 分隔线 / 列表），下面的迷你排版只认
     #、**、- 三样 —— 表格会整段原样露出来、标题退化成一行粗体。
     showdown 与 DOMPurify 酒馆助手**已经合并进脚本 iframe 的 window**
     （JS-Slash-Runner 的 src/iframe/predefine.js:12 从父窗口 pick 了 'showdown'），
     所以这里比消息 iframe 里的前端还省事：直接用全局的，拿不到（老版酒馆助手 / 预览台没装）
     就退回上面的迷你排版 —— 宁少渲染，不白屏。
     ⚠️ 输出必须过 DOMPurify：预设内容不可信，而面板就建在酒馆页面那个文档里。
     ⚠️ simpleLineBreaks 开着：免责这份文档是「单个换行就是换行」的手写体（比如开头那四行
     版本/作者/平台/依赖），不是标准 markdown 的软换行；渲染完再把「标签之间的换行」清掉，
     免得 .kami-guide-doc 的 white-space:pre-wrap 把它们放大成一段段空行。 */
  var GD = false, GPURIFY = false, GCONV = null, GD_PROBED = false, GD_LOGGED = false;
  function probeMd() {
    if (GD_PROBED) { return; }
    GD_PROBED = true;
    function sd(w) { try { return (w && w.showdown && w.showdown.Converter) ? w.showdown : null; } catch (e) { return null; } }
    function dp(w) { try { return (w && w.DOMPurify && w.DOMPurify.sanitize) ? w.DOMPurify : null; } catch (e) { return null; } }
    GD = sd(window) || sd(HOST) || false;
    GPURIFY = dp(window) || dp(HOST) || false;
  }
  function mdHtml(text) {
    probeMd();
    if (!GD || !GPURIFY) { return ''; }
    try {
      if (!GCONV) { GCONV = new GD.Converter({ tables: true, strikethrough: true, tasklists: true, simpleLineBreaks: true }); }
      var html = GCONV.makeHtml(String(text || ''));
      if (!html) { return ''; }
      return GPURIFY.sanitize(html.split('>' + String.fromCharCode(10) + '<').join('><'));
    } catch (e) { log('markdown 渲染失败，退回迷你排版：' + ((e && e.message) || e)); return ''; }
  }
  function fillMarkdown(box, text) {
    var html = mdHtml(text);
    if (html) {
      box.innerHTML = html;
      if (!GD_LOGGED) { GD_LOGGED = true; log('markdown：用酒馆助手的 showdown 渲染'); }
      return true;
    }
    fillParagraphs(box, text);
    return false;
  }

  function fillParagraphs(box, text) {
    /* 迷你排版：# 开头当小标题，**x** 加粗，- x 当列表点；其余整段。不使用正则。 */
    var lines = String(text || '').split(String.fromCharCode(10)), i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.replace(/^##+/, '').trim();
      var isH = /^\s*#/.test(line) && t.length > 0;
      var isLi = line.trim().indexOf('- ') === 0;
      var body = isLi ? line.trim().slice(2).trim() : t;
      if (!body) {
        box.appendChild(el('p', '', ' '));
        continue;
      }
      var p = el(isH ? 'strong' : (isLi ? 'p' : 'p'), '', '');
      if (isLi) { p.textContent = '· '; }
      var rest = body, idx;
      while (rest.length) {
        idx = rest.indexOf('**');
        if (idx < 0) { p.appendChild(HDOC.createTextNode(rest)); break; }
        if (idx > 0) { p.appendChild(HDOC.createTextNode(rest.slice(0, idx))); }
        rest = rest.slice(idx + 2);
        idx = rest.indexOf('**');
        if (idx < 0) { p.appendChild(HDOC.createTextNode('**' + rest)); rest = ''; break; }
        p.appendChild(el('strong', '', rest.slice(0, idx)));
        rest = rest.slice(idx + 2);
      }
      box.appendChild(p);
    }
  }

  /* ───────── 各页渲染（只换 .kami-body 内容，不重建面板） ───────── */

  function clearBody() {
    while (panelBody && panelBody.firstChild) { panelBody.removeChild(panelBody.firstChild); }
  }
  function degradeNote(text) {
    var t = el('div', 'kami-toast', text);
    panelBody.appendChild(t);
  }

  function renderDisclaimer(st) {
    panelBody.appendChild(el('p', 'kami-guide-offnote', st.intro));
    panelBody.appendChild(el('p', 'kami-guide-offnote', copyOf('disclaimerConfirmHint')));
    if (st.missing) {
      var t = el('div', 'kami-toast is-bad', copyOf('disclaimerMissing'));
      panelBody.appendChild(t);
      return;
    }
    var doc = el('div', 'kami-md kami-guide-doc');
    fillMarkdown(doc, st.text);
    panelBody.appendChild(doc);
  }

  function renderSkin(st) {
    panelBody.appendChild(el('p', 'kami-guide-lead', st.intro));
    var api = HOST.KamiSkin;
    if (!api || typeof api.skins !== 'function') {
      degradeNote(copyOf('skinDegrade'));
      return;
    }
    var list = [], curId = null;
    try { list = api.skins() || []; curId = api.skin; } catch (e) { }
    var grid = el('div', 'kami-guide-skins');
    for (var i = 0; i < list.length; i++) {
      (function (s) {
        var b = el('button', 'kami-item kami-card');
        b.type = 'button';
        b.setAttribute('data-kami-skin-id', s.id);
        if (s.id === curId) {
          b.classList.add('is-on');
          b.setAttribute('aria-pressed', 'true');
        }
        /* 预览小窗：把该皮肤自己的 CSS + 微型骨架塞进 srcdoc iframe（与 🎨 面板同一机制） */
        var doc = null;
        try { doc = api.previewDoc ? api.previewDoc(s.id) : null; } catch (e) { }
        if (doc) {
          /* 预览小窗自己就是一块：类名用 .kami-guide-pv（契约 §4.5 登记），
             不再借图版位 .kami-guide-plate 再靠内联 padding/border 把它压平 ——
             那两条内联外观（padding='0' / borderBottom='0'）已删掉。
             原来 CSS 里写的是 .kami-guide-pv，但 DOM 建的是 .kami-guide-plate，
             导致「选中态粗底线」永不命中（真缺陷 D2）：现在类名与 DOM 对上了。 */
          var pv = el('span', 'kami-guide-pv');
          var frame = HDOC.createElement('iframe');
          frame.className = 'kami-guide-pv-frame';
          frame.setAttribute('scrolling', 'no');
          frame.setAttribute('title', s.name + ' 预览');
          frame.srcdoc = doc;
          frame.addEventListener('load', function () {
            try { frame.style.height = Math.max(frame.contentDocument.body.scrollHeight, 48) + 'px'; } catch (e) { }
          });
          pv.appendChild(frame);
          b.appendChild(pv);
        } else {
          /* 皮肤管理没提供预览文档时退回字母图版，版式不变 */
          b.appendChild(el('span', 'kami-guide-plate', (s.name || '?').charAt(0)));
        }
        b.appendChild(el('span', 'kami-guide-cap', s.name));
        b.appendChild(el('span', 'kami-guide-capdesc', s.tagline || ('按钮显示：🎨' + (s.button || ''))));
        b.addEventListener('click', function () {
          try {
            api.setSkin(s.id);
            paintSkinCards();
            log('已切换皮肤：' + s.id);
          } catch (e) { toast('error', copyOf('applyFail')); }
        });
        grid.appendChild(b);
      })(list[i]);
    }
    panelBody.appendChild(grid);
  }
  function paintSkinCards() {
    var api = HOST.KamiSkin;
    var curId = null;
    try { curId = api ? api.skin : null; } catch (e) { }
    var cards = panelBody.querySelectorAll('[data-kami-skin-id]'), i;
    for (i = 0; i < cards.length; i++) {
      var on = cards[i].getAttribute('data-kami-skin-id') === curId;
      cards[i].classList.toggle('is-on', on);
      if (on) { cards[i].setAttribute('aria-pressed', 'true'); }
      else { cards[i].removeAttribute('aria-pressed'); }
    }
  }

  /* 可点击注释（🌟 预设面板同款）：ⓘ 在条目名后面，点了就地展开/收起注释容器。
     必须 stopPropagation：条目卡整张就是开关，不掐断会把开关一起翻掉。
     宿主是外包层 .kami-item-note（条目卡 + 卡下方注释容器）。
     **结构**由共享模块给（noteMarkEl / noteBoxEl）：DOM 与 🌟 面板的 noteMark() 逐属性同构
     （契约 §4.4 硬规则 1）。span 不是真 <button>，键盘可达性得自己补 —— 见 bindNoteMark。 */
  function bindNoteMark(mark) {
    if (!mark) { return; }
    var flip = function (ev) {
      if (ev) { ev.stopPropagation(); }
      var host = mark.closest ? mark.closest('.kami-item-note') : null;
      var note = host ? host.querySelector('[data-kami-note]') : null;
      if (!note) { return; }
      var open = note.hasAttribute('hidden');
      if (open) { note.removeAttribute('hidden'); }
      else { note.setAttribute('hidden', ''); }
      mark.setAttribute('aria-expanded', open ? 'true' : 'false');
      mark.setAttribute('aria-label', open ? '收起注释' : '查看注释');
    };
    mark.addEventListener('click', flip);
    mark.addEventListener('keydown', function (ev) {
      if (!ev) { return; }
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar' || ev.keyCode === 13 || ev.keyCode === 32) {
        ev.preventDefault();   /* Space 不 preventDefault 会顺带把页面滚一下 */
        flip(ev);
      }
    });
  }
  function appendNoteMark(head, text) {
    if (!text) { return; }
    var mark = noteMarkEl(HDOC, text);
    bindNoteMark(mark);
    head.appendChild(mark);
  }
  function appendNoteBox(host, text) {
    if (!text) { return; }
    host.appendChild(noteBoxEl(HDOC, text));
  }

  /* 模型页的条目：identifier → 条目对象（重刷开关态与锁死态时按它查归属集合） */
  var modelPageItems = {};

  /* 非当前模型的专属条目：与 🌟 面板同一条闸门，用原生 disabled 锁死（外观交给皮肤）。
     归属集合为空的条目（不属任何模型）永远可开关。
     当前模型未知时**不锁**：向导这一页得留得下得去手（40 的预设面板此时是一律锁死的）。 */
  function isModelLocked(item, current) {
    var m = (item && item.models) || [], i;
    if (!m.length || !current) { return false; }
    for (i = 0; i < m.length; i++) { if (m[i] === current) { return false; } }
    return true;
  }

  function renderModel(st) {
    panelBody.appendChild(el('p', 'kami-guide-lead', st.intro));
    var api = HOST.KamiPreset;
    if (!api || typeof api.models !== 'function' || typeof api.selectModel !== 'function') {
      degradeNote(copyOf('presetDegrade'));
      return;
    }
    var data = null;
    try { data = api.models(); } catch (e) { }
    if (!data || !data.cards || !data.cards.length) {
      degradeNote(copyOf('fallbackMissing'));
      return;
    }
    var current = data.current || inferredModel();
    if (data.legend) { panelBody.appendChild(el('p', 'kami-guide-offnote', data.legend)); }
    var canWrite = typeof api.setEnabled === 'function';
    var noteMap = st.noteMap || {};
    /* 卡内部（模型卡外框 + 卡头 + 卡内条目网格）走**与 🌟 预设面板同一份**构建器：
       src/scripts/_preset-cards.js，构建期内联。向导只保留自己那一层网格
       .kami-guide-grid-cards（排版层），卡本身与预设面板逐属性同构（契约 §4.4）。 */
    var grid = el('div', 'kami-guide-grid-cards kami-guide-grid-models');
    for (var i = 0; i < data.cards.length; i++) {
      (function (m, mi) {
        var items = m.items || [], byId = {}, q;
        for (q = 0; q < items.length; q++) {
          byId[items[q].identifier] = items[q];
          modelPageItems[items[q].identifier] = items[q];
        }
        var card = buildModelCard(HDOC, m, current, {
          cardKey: 'model#' + mi,
          lock: function (it) { return isModelLocked(it, current); },
          noteText: function (it) { return noteMap[it.identifier] || ''; }
        });
        /* 卡头按钮 = 选中这个模型（共享构建器只建结构，事件由调用方挂） */
        var head = card.querySelector('[data-kami-model]');
        if (head) {
          head.addEventListener('click', function () {
            try {
              api.selectModel(m.emoji);
              refreshItemFlags();
              paintModelCards();
              paintModelItems(api);
              log('已选模型：' + m.emoji);
            } catch (e) { toast('error', copyOf('applyFail')); }
          });
        }
        /* 条目卡：点一下翻转（与 🌟 面板同一条写入通道）；有注释的条目挂 ⓘ */
        var btns = card.querySelectorAll('[data-kami-item]');
        for (q = 0; q < btns.length; q++) {
          bindModelItem(btns[q], byId[btns[q].getAttribute('data-kami-item')] || null, api, canWrite);
        }
        grid.appendChild(card);
      })(data.cards[i], i);
    }
    panelBody.appendChild(grid);
  }

  /* 一张条目卡：点一下翻转（整卡就是开关）。写失败只提示、不改界面（界面不说谎）。 */
  function bindModelItem(btn, item, api, canWrite) {
    if (!btn || !item) { return; }
    var mark = btn.querySelector('[data-kami-note-mark]');
    if (mark) { bindNoteMark(mark); }   /* ⓘ 的 click 自己 stopPropagation，不会把开关一起翻 */
    btn.addEventListener('click', function () {
      if (!canWrite || btn.disabled) { return; }
      var target = !btn.classList.contains('is-on');
      var r = null;
      try { r = api.setEnabled(item.identifier, target); } catch (e) { r = { ok: false }; }
      if (!r || !r.ok) { toast('error', copyOf('applyFail')); return; }
      item.enabled = target;
      btn.classList.toggle('is-on', target);
      btn.setAttribute('aria-pressed', target ? 'true' : 'false');
      refreshItemFlags();
    });
  }

  /* 当前模型一变，卡头的选中态就地重刷（.is-on + aria-pressed + 「当前」小标签）。
     结构与 🌟 面板的 paintModelHeads 同款：标记是 span.kami-chip[data-kami-role="cur"]，
     不是 .kami-badge（那是条目角标的位置，两者混用会多出一枚假的「当前」）。 */
  function paintModelCards() {
    var api = HOST.KamiPreset, current = null;
    try { current = api ? api.currentModel() : null; } catch (e) { }
    if (!current) { current = inferredModel(); }
    var heads = panelBody.querySelectorAll('[data-kami-model]'), i;
    for (i = 0; i < heads.length; i++) {
      var node = heads[i], on = node.getAttribute('data-kami-model') === current;
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      var chip = node.querySelector('[data-kami-role="cur"]');
      if (on && !chip) {
        var c = el('span', 'kami-chip', copyOf('modelCurrent'));
        c.setAttribute('data-kami-role', 'cur');
        node.appendChild(c);
      } else if (!on && chip && chip.parentNode) { chip.parentNode.removeChild(chip); }
    }
  }

  /* 模型一变，条目卡也跟着变：开关态从活设置现读（选模型会连带开/关一批条目），
     锁死态按新的当前模型重算 —— 不重刷就会留下「已经锁死的卡还亮着」的假象。
     ⚠️ 当前模型一律问**渲染这一页时抓到的那份 api**（调用方传进来），不要在函数里重新
     查一次 HOST.KamiPreset：那是「同一份 API 在两处各取一次」的老毛病，
     页面存活期间全局被换掉（重载脚本 / 另一份实例）就会算出上一任模型的闸门。 */
  function paintModelItems(api) {
    if (!api) { api = HOST.KamiPreset; }
    var current = null;
    try { current = (api && typeof api.currentModel === 'function') ? api.currentModel() : null; } catch (e) { }
    if (!current) { current = inferredModel(); }
    var map = liveEnabledMap();
    var cards = panelBody.querySelectorAll('[data-kami-item]'), i;
    for (i = 0; i < cards.length; i++) {
      var node = cards[i], it = modelPageItems[node.getAttribute('data-kami-item')] || null;
      if (it && Object.prototype.hasOwnProperty.call(map, it.identifier)) { it.enabled = map[it.identifier]; }
      var on = !!(it && it.enabled);
      node.classList.toggle('is-on', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      var locked = it ? isModelLocked(it, current) : false;
      if (locked) { node.disabled = true; node.setAttribute('aria-disabled', 'true'); }
      else { node.disabled = false; node.removeAttribute('aria-disabled'); }
    }
  }

  function varInputRow(labelText, varInfo) {
    var row = el('div', 'kami-guide-varrow');
    var lab = el('span', 'kami-field-label', labelText);
    row.appendChild(lab);
    var input = HDOC.createElement('input');
    input.type = 'number';
    input.className = 'kami-number';
    input.setAttribute('data-kami-var', varInfo.name);
    input.setAttribute('data-kami-entry', varInfo.identifier);
    input.setAttribute('data-kami-old', String(varInfo.value));
    input.value = String(varInfo.value);
    row.appendChild(input);
    return row;
  }

  function renderVars(st) {
    panelBody.appendChild(el('p', 'kami-guide-lead', st.intro));
    var api = HOST.KamiPreset;
    if (!api || typeof api.vars !== 'function' || typeof api.setVar !== 'function') {
      degradeNote(copyOf('presetDegrade'));
      return;
    }
    /* 值一律渲染时现读：🌟 面板刚改过这里也跟着变，不会显示旧数字 */
    var data = null;
    try { data = api.vars(); } catch (e) { }
    var cards = (data && data.cards) || [];
    var want = st.entryIds || [];
    var box = el('div', 'kami-guide-grid-cards');
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      (function (c) {
        if (want.length && want.indexOf(c.entry) < 0) { return; }
        var host = el('div', 'kami-item-note');
        var card = el('div', 'kami-card');
        card.setAttribute('data-kami-var-card', c.entry || '');
        var head = el('span', 'kami-card-head');
        head.appendChild(el('span', 'kami-dot'));
        head.appendChild(el('span', 'kami-card-title', stripBrackets(c.name || c.label || '')));
        appendNoteMark(head, c.note);
        card.appendChild(head);
        var wrap = el('div', 'kami-guide-varrow');
        var vs = c.vars || [];
        if (c.kind === 'range' && vs.length >= 2) {
          wrap.appendChild(varInputRow(copyOf('varMin'), { name: vs[0].name, value: vs[0].value, identifier: c.entry }));
          wrap.appendChild(varInputRow(copyOf('varMax'), { name: vs[1].name, value: vs[1].value, identifier: c.entry }));
        } else if (vs.length) {
          wrap.appendChild(varInputRow('', { name: vs[0].name, value: vs[0].value, identifier: c.entry }));
        }
        card.appendChild(wrap);
        host.appendChild(card);
        appendNoteBox(host, c.note);
        box.appendChild(host);
        shown++;
      })(cards[i]);
    }
    if (!shown) { degradeNote(copyOf('fallbackMissing')); return; }
    panelBody.appendChild(box);
  }

  function onVarChange(ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'INPUT' || t.getAttribute('data-kami-var') === null) { return; }
    var card = null;
    try { card = t.closest ? t.closest('[data-kami-var-card]') : null; } catch (e) { }
    var inputs = card ? card.querySelectorAll('input.kami-number') : [t];
    var vals = [], olds = [], names = [], i, s;
    for (i = 0; i < inputs.length; i++) {
      s = String(inputs[i].value).trim();
      if (!isPureDigits(s)) { toast('warning', copyOf('varDigitsOnly')); inputs[i].value = inputs[i].getAttribute('data-kami-old'); return; }
      vals.push(s);
      olds.push(inputs[i].getAttribute('data-kami-old'));
      names.push(inputs[i].getAttribute('data-kami-var'));
    }
    if (inputs.length === 2 && Number(vals[0]) > Number(vals[1])) {
      var tmp = vals[0]; vals[0] = vals[1]; vals[1] = tmp;
      inputs[0].value = vals[0]; inputs[1].value = vals[1];
      toast('info', copyOf('varSwapped'));
    }
    var api = HOST.KamiPreset, okAll = true;
    for (i = 0; i < inputs.length; i++) {
      if (vals[i] === olds[i]) { continue; }
      var r = null;
      try { r = api.setVar(inputs[i].getAttribute('data-kami-entry'), names[i], vals[i], olds[i]); } catch (e) { r = { ok: false }; }
      if (!r || !r.ok) { okAll = false; break; }
      inputs[i].setAttribute('data-kami-old', vals[i]);
    }
    if (!okAll) {
      toast('error', copyOf('applyFail'));
      for (i = 0; i < inputs.length; i++) { inputs[i].value = inputs[i].getAttribute('data-kami-old'); }
    }
  }

  function renderCardPage(st) {
    if (st.intro) { panelBody.appendChild(el('p', 'kami-guide-lead', st.intro)); }
    var api = HOST.KamiPreset;
    var canWrite = !!(api && typeof api.setEnabled === 'function');
    if (!canWrite) { degradeNote(copyOf('presetDegrade')); }
    var current = null;
    try { current = api ? api.currentModel() : null; } catch (e) { }
    if (!current) { current = inferredModel(); }
    for (var g = 0; g < st.groups.length; g++) {
      (function (grp, gi) {
        /* 栏目小标题：组名居中，两侧细线（报纸的栏间线） */
        if (grp.intro || grp.name) {
          var sec = el('div', 'kami-guide-sec');
          sec.appendChild(el('span', '', stripBrackets(grp.name) || ''));
          panelBody.appendChild(sec);
          if (grp.intro) { panelBody.appendChild(el('p', 'kami-guide-offnote', grp.intro)); }
        }
        var grid = el('div', 'kami-guide-grid');
        grid.setAttribute('data-kami-group', String(gi));
        var hasT2I = false;
        for (var i = 0; i < grp.items.length; i++) {
          (function (it) {
            var locked = !!(it.models && it.models.length && current && it.models.indexOf(current) < 0);
            var b = el('button', 'kami-item kami-card');
            b.type = 'button';
            b.setAttribute('data-kami-item', it.identifier);
            if (grp.mode === 'once') { b.setAttribute('data-kami-single', '1'); }
            /* 标题栏 = 图版位：emoji 与条目名同一行（字号收小），
               下面是图片说明（一句话注释）。开关态靠标题栏的粗底线 + 整卡高亮。 */
            var plate = el('span', 'kami-guide-plate');
            plate.appendChild(el('span', 'kami-guide-plate-glyph', leadingGlyph(it.name)));
            plate.appendChild(el('span', 'kami-guide-plate-name', stripGlyph(it.name)));
            b.appendChild(plate);
            /* 图片说明（一句话注释）常展开在标题栏下方：有没有注释都排同一个网格，
               不独占整行（2026-09-21 用户裁定）。 */
            if (it.desc) {
              b.appendChild(el('span', 'kami-guide-capdesc', it.desc));
            }
            if (locked) {
              b.disabled = true;
              b.appendChild(el('span', 'kami-guide-capdesc', it.models.join(' ') + ' 专用'));
            }
            if (it.enabled) { b.classList.add('is-on'); b.setAttribute('aria-pressed', 'true'); }
            if (String(it.name || '').indexOf('文生图') >= 0) { hasT2I = true; }
            b.addEventListener('click', function () {
              if (!canWrite || b.disabled) { return; }
              toggleCardItem(grp, it, grid);
            });
            grid.appendChild(b);
          })(grp.items[i]);
        }
        panelBody.appendChild(grid);
        if (st.varCard && hasT2I) { renderAttachedVar(st.varCard); }
      })(st.groups[g], g);
    }
  }

  /* 挂在「文生图」那页的插图数量：值同样渲染时从 KamiPreset.vars() 现读 */
  function renderAttachedVar(entryId) {
    var api = HOST.KamiPreset;
    if (!entryId || !api || typeof api.vars !== 'function' || typeof api.setVar !== 'function') { return; }
    var data = null;
    try { data = api.vars(); } catch (e) { }
    var cards = (data && data.cards) || [];
    var c = null;
    for (var i = 0; i < cards.length; i++) { if (cards[i].entry === entryId) { c = cards[i]; break; } }
    if (!c) { return; }
    var box = el('div', 'kami-guide-grid-cards');
    var host = el('div', 'kami-item-note');
    var card = el('div', 'kami-card');
    card.setAttribute('data-kami-var-card', c.entry || '');
    var head = el('span', 'kami-card-head');
    head.appendChild(el('span', 'kami-dot'));
    head.appendChild(el('span', 'kami-card-title', stripBrackets(c.name || c.label || '')));
    appendNoteMark(head, c.note);
    card.appendChild(head);
    var wrap = el('div', 'kami-guide-varrow');
    var vs = c.vars || [];
    if (c.kind === 'range' && vs.length >= 2) {
      wrap.appendChild(varInputRow(copyOf('varMin'), { name: vs[0].name, value: vs[0].value, identifier: c.entry }));
      wrap.appendChild(varInputRow(copyOf('varMax'), { name: vs[1].name, value: vs[1].value, identifier: c.entry }));
    } else if (vs.length) {
      wrap.appendChild(varInputRow('', { name: vs[0].name, value: vs[0].value, identifier: c.entry }));
    }
    card.appendChild(wrap);
    host.appendChild(card);
    appendNoteBox(host, c.note);
    box.appendChild(host);
    panelBody.appendChild(box);
  }

  function toggleCardItem(grp, it, grid) {
    var api = HOST.KamiPreset;
    var target = !it.enabled;
    var pairs = [{ identifier: it.identifier, value: target }], i;
    if (target && grp.mode === 'once') {
      for (i = 0; i < grp.items.length; i++) {
        var other = grp.items[i];
        if (other.identifier !== it.identifier && other.enabled) {
          pairs.push({ identifier: other.identifier, value: false });
        }
      }
    }
    var okAll = true, j;
    for (j = 0; j < pairs.length; j++) {
      var r = null;
      try { r = api.setEnabled(pairs[j].identifier, pairs[j].value); } catch (e) { r = { ok: false }; }
      if (!r || !r.ok) { okAll = false; break; }
    }
    if (!okAll) { toast('error', copyOf('applyFail')); }
    refreshItemFlags();
    paintGroup(grp, grid);
  }

  function refreshItemFlags() {
    var map = liveEnabledMap(), i, j, g;
    for (i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st.kind !== 'card') { continue; }
      for (g = 0; g < st.groups.length; g++) {
        for (j = 0; j < st.groups[g].items.length; j++) {
          var id = st.groups[g].items[j].identifier;
          if (Object.prototype.hasOwnProperty.call(map, id)) { st.groups[g].items[j].enabled = map[id]; }
        }
      }
    }
  }
  function paintGroup(grp, grid) {
    if (!grid) { return; }
    var cards = grid.querySelectorAll('[data-kami-item]'), i, j;
    for (i = 0; i < cards.length; i++) {
      var id = cards[i].getAttribute('data-kami-item'), item = null;
      for (j = 0; j < grp.items.length; j++) {
        if (grp.items[j].identifier === id) { item = grp.items[j]; break; }
      }
      if (!item) { continue; }
      cards[i].classList.toggle('is-on', item.enabled);
      if (item.enabled) { cards[i].setAttribute('aria-pressed', 'true'); }
      else { cards[i].removeAttribute('aria-pressed'); }
      /* 单选卡：开了一个，同组其它关掉（is-on 同步） */
      if (grp.mode === 'once' && item.enabled) {
        for (j = 0; j < cards.length; j++) {
          if (j === i) { continue; }
          var oid = cards[j].getAttribute('data-kami-item'), found = null, k2;
          for (k2 = 0; k2 < grp.items.length; k2++) { if (grp.items[k2].identifier === oid) { found = grp.items[k2]; break; } }
          if (found && !found.enabled) { cards[j].classList.remove('is-on'); cards[j].removeAttribute('aria-pressed'); }
        }
      }
    }
  }

  function renderAntitrunc(st) {
    /* 说明只在页首出现一次；卡片是纯开关行，不重复说明 */
    panelBody.appendChild(el('p', 'kami-guide-lead', st.intro));
    var api = HOST.AntiTruncation;
    if (!api || typeof api.status !== 'function' || typeof api.on !== 'function') {
      degradeNote(copyOf('antitruncDegrade'));
      return;
    }
    var stat = null;
    try { stat = api.status(); } catch (e) { }
    var on = !!(stat && stat.enabled);
    var row = el('button', 'kami-guide-switchrow');
    row.type = 'button';
    row.setAttribute('data-kami-antitrunc', '1');
    if (on) { row.classList.add('is-on'); }
    row.appendChild(el('span', 'kami-guide-rowname', st.title));
    var state = el('span', 'kami-guide-rowstate', on ? copyOf('antitruncOn') : copyOf('antitruncOff'));
    if (on) { state.classList.add('is-on'); }
    row.appendChild(state);
    row.addEventListener('click', function () {
      try {
        if (on) { api.off(); } else { api.on(); }
        on = !on;
        row.classList.toggle('is-on', on);
        state.classList.toggle('is-on', on);
        state.textContent = on ? copyOf('antitruncOn') : copyOf('antitruncOff');
        log('反截断开关 → ' + (on ? '开' : '关'));
      } catch (e) { toast('error', copyOf('applyFail')); }
    });
    panelBody.appendChild(row);
  }

  /* 压缩页：两枚开关行（滚动压缩 / 超限压缩）＋ 一段调参说明 ＋ 一颗打开 📜 面板的按钮。
     全部走 KamiSummarize 的现成 API；那个脚本没在跑时只留说明（与反截断页同款降级）。
     参数（阈值 / 保留楼层 / 分块）不在这一页重复造控件 —— 用户裁定「只教基础使用和开关/调参」。 */
  function renderCompress(st) {
    panelBody.appendChild(el('span', 'kami-guide-sec', st.title));
    panelBody.appendChild(el('p', 'kami-guide-lead', st.intro));
    var api = HOST.KamiSummarize;
    if (!api || typeof api.status !== 'function' || typeof api.setGrand !== 'function') {
      degradeNote(copyOf('compressDegrade'));
      return;
    }
    var stat = null;
    try { stat = api.status(); } catch (e) { }

    /* 一枚开关行：整行即开关，右侧状态字。写失败只提示、不改界面。 */
    function switchRow(nameKey, readOn, write) {
      var on = false;
      try { on = !!readOn(); } catch (e) { }
      var row = el('button', 'kami-guide-switchrow');
      row.type = 'button';
      if (on) { row.classList.add('is-on'); }
      row.appendChild(el('span', 'kami-guide-rowname', copyOf(nameKey)));
      var stateEl = el('span', 'kami-guide-rowstate', on ? copyOf('compressOn') : copyOf('compressOff'));
      if (on) { stateEl.classList.add('is-on'); }
      row.appendChild(stateEl);
      function paint(v) {
        on = !!v;
        row.classList.toggle('is-on', on);
        stateEl.classList.toggle('is-on', on);
        stateEl.textContent = on ? copyOf('compressOn') : copyOf('compressOff');
      }
      row.addEventListener('click', function () {
        var want = !on;
        try {
          var r = write(want);
          if (r && typeof r.then === 'function') {
            /* 滚动压缩要写酒馆正则，是异步的：成功了再翻界面，失败了只提示 */
            r.then(function () { paint(want); log(nameKey + ' → ' + (want ? '开' : '关')); },
              function () { toast('error', copyOf('applyFail')); });
          } else {
            paint(want);
            log(nameKey + ' → ' + (want ? '开' : '关'));
          }
        } catch (e) { toast('error', copyOf('applyFail')); }
      });
      panelBody.appendChild(row);
    }

    /* 滚动压缩：正则不在当前预设里时（roll.ok=false）这枚开关不出现，只留超限那一枚。
       每枚开关下面跟一段这个模式的说明（何时出手 / 好处 / 代价），开关不在时说明也一起不出现。
       文案按 2026-09-23 用户裁定重写：两种模式各自讲清 + 各自的优劣 + 怎么选（见 compressPickNote）。 */
    var rollOk = !!(stat && stat.roll && stat.roll.ok);
    if (rollOk) {
      switchRow('compressRollName',
        function () { return api.status().roll && api.status().roll.enabled; },
        function (v) { return api.setRolling(v); });
      panelBody.appendChild(el('p', 'kami-guide-lead', copyOf('compressRollNote')));
    }
    switchRow('compressGrandName',
      function () { return api.status().grandOn; },
      function (v) { return api.setGrand(v); });
    panelBody.appendChild(el('p', 'kami-guide-lead', copyOf('compressGrandNote')));

    /* 怎么选：按计费方式与游玩时长给三条明确建议（用户裁定，不要再写回「先只开滚动」那套旧口径） */
    panelBody.appendChild(el('span', 'kami-guide-sec', copyOf('compressPickTitle')));
    panelBody.appendChild(el('p', 'kami-guide-lead', copyOf('compressPickNote')));

    panelBody.appendChild(el('p', 'kami-guide-offnote', copyOf('compressParamsNote')));
    if (typeof api.open === 'function') {
      var btn = el('button', 'kami-btn kami-btn--ghost', copyOf('compressOpenPanel'));
      btn.type = 'button';
      btn.setAttribute('data-kami-guide-open', 'compress');
      btn.addEventListener('click', function () {
        try { api.open(); } catch (e) { toast('error', copyOf('applyFail')); }
      });
      panelBody.appendChild(btn);
    }
  }

  function renderDone(st) {
    var sec = el('div', 'kami-guide-sec');
    sec.appendChild(el('span', '', st.title));
    panelBody.appendChild(sec);
    fillParagraphs(panelBody, st.intro);
  }

  function renderDraft(st) {
    panelBody.appendChild(el('p', 'kami-guide-offnote', st.body));
  }

  var RENDERERS = {
    disclaimer: renderDisclaimer,
    skin: renderSkin,
    model: renderModel,
    vars: renderVars,
    card: renderCardPage,
    antitrunc: renderAntitrunc,
    compress: renderCompress,
    done: renderDone,
    draft: renderDraft
  };

  /* ───────── 导航 ───────── */

  function paintDots() {
    while (panelDots.firstChild) { panelDots.removeChild(panelDots.firstChild); }
    for (var i = 0; i < steps.length; i++) {
      (function (idx) {
        var d = el('span', 'kami-dot');
        d.setAttribute('data-kami-dot', String(idx));
        if (idx === cur) { d.setAttribute('data-kami-on', '1'); }
        d.setAttribute('role', 'button');
        d.setAttribute('tabindex', '0');
        d.setAttribute('aria-label', copyOf('progressAria')
          .replace('{n}', String(idx + 1)).replace('{total}', String(steps.length)));
        d.addEventListener('click', function () { showStep(idx); });
        d.addEventListener('keydown', function (ev) {
          if (ev && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); showStep(idx); }
        });
        panelDots.appendChild(d);
      })(i);
    }
  }
  function gated() {
    /* 第一页确认门禁：确认前不能下一步、不能关闭。
       免责条目缺失时门禁自动解除（不能把用户困在错误页上）。 */
    return !!(steps[0] && steps[0].kind === 'disclaimer' && !steps[0].missing) && cur === 0 && !confirmed;
  }
  function paintNav() {
    var first = cur === 0, last = cur === steps.length - 1;
    btnPrev.style.display = first ? 'none' : '';
    btnPrev.disabled = first;
    if (gated()) {
      /* 门禁中：主按钮就是「确认」，点它解锁，文案再变回「下一步」 */
      btnNext.textContent = copyOf('btnConfirm');
      btnNext.setAttribute('data-kami-confirm', '1');
      btnNext.disabled = false;
      btnClose.disabled = true;
    } else {
      btnNext.removeAttribute('data-kami-confirm');
      btnClose.disabled = false;
      if (last) {
        btnNext.textContent = copyOf('btnFinish');
        btnNext.setAttribute('data-kami-finish', '1');
      } else {
        btnNext.textContent = copyOf('btnNext');
        btnNext.removeAttribute('data-kami-finish');
      }
    }
    try {
      panelCounter.textContent = copyOf('stepCounter')
        .replace('{n}', String(cur + 1)).replace('{total}', String(steps.length));
    } catch (e) { }
    var dots = panelDots.querySelectorAll('.kami-dot'), i;
    for (i = 0; i < dots.length; i++) {
      if (i === cur) { dots[i].setAttribute('data-kami-on', '1'); }
      else { dots[i].removeAttribute('data-kami-on'); }
    }
  }

  function showStep(idx) {
    if (idx < 0 || idx >= steps.length) { return; }
    cur = idx;
    clearBody();
    var st = steps[cur];
    try {
      (RENDERERS[st.kind] || renderDraft)(st);
    } catch (e) {
      log('渲染第 ' + cur + ' 页失败：' + ((e && e.message) || e));
      degradeNote(copyOf('fallbackMissing'));
    }
    paintNav();
    log('第 ' + (cur + 1) + '/' + steps.length + ' 页：' + st.title);
  }

  function next() {
    if (btnNext.getAttribute('data-kami-confirm') === '1') {
      /* 点的是「确认」：解锁，留在本页，按钮变回「下一步」 */
      confirmed = true;
      log('免责声明已确认');
      paintNav();
      return;
    }
    if (cur >= steps.length - 1) { closeWizard(true); return; }
    showStep(cur + 1);
  }
  function prev() { if (cur > 0) { showStep(cur - 1); } }

  /* ───────── 面板骨架 ───────── */

  function buildPanel() {
    if (panelRoot) { return; }
    panelRoot = el('div', 'kami-root');
    panelRoot.id = PANEL_ID;
    panelRoot.setAttribute('data-kami-comp', 'panel');
    panelRoot.setAttribute(GUIDE_TAG, '1');
    panelRoot.style.zIndex = String(Z);

    panelDrop = el('div', 'kami-drop kami-surface');
    panelDrop.setAttribute('data-kami-open', '1');
    panelRoot.appendChild(panelDrop);

    var head = el('div', 'kami-head');
    head.appendChild(el('span', 'kami-dot'));
    head.appendChild(el('span', 'kami-title', copyOf('wizardTitle')));
    panelCounter = el('span', 'kami-sub', '');
    head.appendChild(panelCounter);
    var acts = el('span', 'kami-actions');
    btnClose = el('button', 'kami-icon-btn', '✕');
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', '关闭');
    btnClose.addEventListener('click', function () { closeWizard(true); });
    acts.appendChild(btnClose);
    head.appendChild(acts);
    panelDrop.appendChild(head);

    panelDots = el('div', 'kami-dots');
    panelDots.setAttribute('data-kami-role', 'dots');
    panelDrop.appendChild(panelDots);

    panelBody = el('div', 'kami-body kami-scroll');
    panelBody.setAttribute('data-kami-role', 'page');
    panelBody.addEventListener('change', onVarChange);   // 变量输入的统一入口（只挂这一次）
    panelDrop.appendChild(panelBody);

    var foot = el('div', 'kami-foot');
    btnPrev = el('button', 'kami-btn kami-btn--ghost', copyOf('btnPrev'));
    btnPrev.type = 'button';
    btnPrev.addEventListener('click', prev);
    foot.appendChild(btnPrev);
    btnNext = el('button', 'kami-btn kami-btn--primary', copyOf('btnNext'));
    btnNext.type = 'button';
    btnNext.addEventListener('click', next);
    foot.appendChild(btnNext);
    panelDrop.appendChild(foot);

    try { (HDOC.body || HDOC.documentElement).appendChild(panelRoot); } catch (e) {
      log('面板挂载失败：' + ((e && e.message) || e));
      panelRoot = null;
    }
  }

  function openWizard() {
    if (disposed) { return; }
    var raw = readTree();
    if (!raw.ok) {
      toast('error', raw.error);
      log('打不开：' + raw.error);
      return;
    }
    steps = buildSteps(raw);
    if (!steps.length) { toast('error', copyOf('fallbackMissing')); return; }
    buildPanel();
    if (!panelRoot) { return; }
    injectCss();
    confirmed = false;
    cur = 0;
    paintDots();
    showStep(0);
    panelDrop.setAttribute('data-kami-open', '1');
    log('引导打开：共 ' + steps.length + ' 页（产物 ' + BUILD_N + '，看过 ' + seen + '）');
  }

  function closeWizard(markSeen) {
    if (markSeen !== false) {
      seen = BUILD_N || seen;
      saveGuideVars();
    }
    if (panelRoot && panelRoot.parentNode) { panelRoot.parentNode.removeChild(panelRoot); }
    panelRoot = null; panelDrop = null; panelBody = null; panelDots = null;
    panelCounter = null; btnPrev = null; btnNext = null; btnClose = null;
    steps = []; cur = 0; confirmed = false;
    log('引导关闭' + (markSeen !== false ? '（已记「看过」）' : ''));
  }

  /* ───────── 首次自动弹 ───────── */

  function waitForTavernReady(cb) {
    var deadline = Date.now() + READY_TIMEOUT;
    readyTimer = setInterval(function () {
      if (disposed) { try { clearInterval(readyTimer); } catch (e) { } return; }
      var name = presetName();
      if (name) {
        try { clearInterval(readyTimer); } catch (e) { }
        readyTimer = null;
        cb(name);
        return;
      }
      if (Date.now() > deadline) {
        try { clearInterval(readyTimer); } catch (e) { }
        readyTimer = null;
        log('等酒馆设置超时（' + READY_TIMEOUT + 'ms），本次不自动弹');
      }
    }, READY_TICK);
  }

  function maybeAutoOpen(name) {
    if (disposed || autoOpened) { return; }
    if (String(name || '').indexOf(PRESET_MARK) < 0) {
      log('当前预设不是「' + PRESET_MARK + '」（' + name + '），不自动弹');
      return;
    }
    if (readGuideVars() === BUILD_N) {
      log('产物 ' + BUILD_N + ' 已看过（seen=' + seen + '），不自动弹');
      return;
    }
    autoOpened = true;
    openTimer = setTimeout(function () {
      if (!disposed && !panelRoot) { openWizard(); }
    }, OPEN_DELAY);
  }

  /* ───────── 全局 API / 按钮登记 / 注销 ───────── */

  function expose() {
    var api = {
      version: VERSION,
      build: BUILD_N,
      open: function () { openWizard(); },
      close: function () { closeWizard(true); },
      reset: function () { seen = 0; saveGuideVars(); log('已清除「看过」标记（下次加载会自动弹）'); },
      status: function () {
        return {
          version: VERSION, build: BUILD_N, seen: seen, autoOpened: autoOpened,
          open: !!panelRoot, steps: steps.length, cur: cur,
          stepTitles: steps.map(function (s) { return s.title; }),
          liveOk: readRaw().ok, presetName: presetName()
        };
      },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  function registerButton() {
    try {
      var w = HOST;
      var defs = w.__hubDefs || (w.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === HUB_NAME) { defs.splice(i, 1); }
      }
      ownDef = {
        name: HUB_NAME,
        order: HUB_ORDER,
        tip: '新手引导（点击打开向导，可随时重看）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return true; },
        absent: '引导脚本拿不到宿主窗口',
        click: function () { openWizard(); }
      };
      defs.push(ownDef);
      try {
        var ev = w.document.createEvent('Event');
        ev.initEvent('kami-hub-def', false, false);
        w.dispatchEvent(ev);
      } catch (e) { }
      log('已向按钮中转站登记按钮 ' + HUB_NAME);
    } catch (e) {
      console.warn('[引导] 向中转站登记按钮失败（可用控制台 KamiGuide.open() 手动打开）', e);
    }
  }

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    log('正在注销：摘监听 / 拆面板 / 收样式 / 撤登记 / 删全局');
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (readyTimer) { clearInterval(readyTimer); readyTimer = null; } } catch (e) { }
    try { if (openTimer) { clearTimeout(openTimer); openTimer = null; } } catch (e) { }
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    dropCss();
    try { if (panelRoot && panelRoot.parentNode) { panelRoot.parentNode.removeChild(panelRoot); } } catch (e) { }
    panelRoot = null; panelDrop = null; panelBody = null; panelDots = null;
    panelCounter = null; btnPrev = null; btnNext = null; btnClose = null;
    steps = []; cur = 0; confirmed = false;
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) {
        if (defs[j] === ownDef || (defs[j] && defs[j].name === HUB_NAME)) { defs.splice(j, 1); }
      }
      if (HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister(HUB_NAME); }
    } catch (e) { }
    ownDef = null;
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    log('注销完成：面板、样式、登记、全局 API 都已收回；预设文件与酒馆设置没有被改动');
  }

  /* ───────── 启动 ───────── */

  function boot() {
    log('启动 v' + VERSION + '（产物 ' + BUILD_N + '，解析器与兜底皮肤已内联）');
    readGuideVars();
    expose();
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    /* 脚本被关闭/删除（或页面卸载）时酒馆助手会派 pagehide → 立刻注销，零残留 */
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
    waitForTavernReady(function (name) {
      log('酒馆就绪：当前预设「' + name + '」');
      maybeAutoOpen(name);   /* 内部自带 OPEN_DELAY 缓冲，不抢启动瞬间 */
    });
  }

  try { boot(); } catch (e) { console.error('[引导] 启动失败', e); }
})();
