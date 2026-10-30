/* ============================================================
 * 🧭 引导   v1.0
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 首次使用本预设时自动弹出的引导向导；也可以随时点按钮条上的「🧭 引导」重看。
 * 6 步（免责声明 → 外观 → 模型 → 语言与数值 → 长文与截断 → 完成），每一步都直接改真实设置：
 *   · 免责声明正文：现读预设里的免责条目（注释部分）
 *   · 模型 / 语言 / 数值 → 🌟 预设设置 的 KamiPreset.presetBridge()；皮肤 → 🎨 显示 的 SkinManager
 *   · 压缩 → 🧰 工具箱 的 KamiToolbox.bridge()；防截断 → 反截断 的 AntiTruncation
 * 界面由「🧩 运行库」（React + 设计系统 + 皮肤引擎）的 GuidePanel 画。
 *
 * 「首次」判定（与旧版 v0.6 同一套记录，升级后不会重复弹）：构建时把产物名写进本脚本，
 * 完整版本记录「已展示」；脚本变量 kami-guide 与按账号隔离的本机记录互为兜底。确认与完成单独保存。
 *
 * 2026-10-30 脚本整理：旧版「🧭 引导 v0.6」（50-引导.js，自带一套 DOM 向导）退役，
 * 它的展示记录与免责声明读取搬进本脚本；更新时旧脚本的开关与记录经 legacy_ids 并进来。
 * 注销零残留：按钮登记、界面、全局 API 全部收回。
 * ============================================================ */
(function () {
  'use strict';
  /* @@KAMI_USER_SCOPE@@ */

  /* ── 预设结构解析器（规则真相：test/harness/preset-parse.mjs，构建期内联；这里只用 firstComment） ── */
  /* @@KAMI_PRESET_PARSE@@ */

  var VERSION = '1.0';
  var HUB_NAME = '🧭 引导';
  var HUB_ORDER = 10;
  var LAYER_ID = 'kami-guide';
  var API_NAME = 'KamiGuide';
  var VARS_KEY = 'kami-guide';
  var CHAR_ID = 100001;
  var READY_TIMEOUT = 15000;           // 等酒馆设置可读的上限
  var READY_TICK = 300;
  var OPEN_DELAY = 1200;               // 页面就绪后再等的缓冲，不抢启动瞬间
  var BUILD_N = parseInt('@@KAMI_BUILD_N@@', 10) || 0;
  var SELF_NAME = '@@KAMI_PRESET_NAME@@';
  var GUIDE_VERSION = guideVersionOf(SELF_NAME);
  /* 文案：唯一真相 design/copy/guide-copy.json（构建期内联） */
  var GUIDE_COPY = null; /* @@KAMI_GUIDE_COPY_JS@@ */

  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, ownDef = null, timer = null, isOpen = false, pingTimer = null;
  var seen = 0, autoOpened = false, readyTimer = null, openTimer = null;
  function log(msg) { try { console.log('[引导] ' + msg); } catch (e) { } }
  function toast(kind, msg) {
    try { var t = HOST.toastr || (typeof toastr !== 'undefined' ? toastr : null); if (t && t[kind]) { t[kind](msg, '引导'); return; } } catch (e) { }
    log(msg);
  }
  function call(fn) { try { return fn(); } catch (e) { return null; } }

  /* ───────── 展示记录：脚本变量兼容 + 按账号隔离的同步本地兜底 ───────── */

  var visit = { shown: false, confirmed: false, completed: false, updatedAt: 0 };
  var visitDirty = false, localVisitKey = null, accountHandle = null, identityPending = false;
  var identityAbort = null, identityTimer = null, storageWarned = false, scriptVisitSaved = false;

  function guideVersionOf(name) {
    /* 支线测试包的名字在日期后带 -<支线> 后缀（2026-10-27，见 build/branch-tag.mjs），版本与构建号照常读 */
    var match = /^kami-v(\d+\.\d+)-(\d+)-\d{8}(?:-[a-z0-9][a-z0-9-]*)?$/i.exec(String(name || ''));
    return match ? 'v' + match[1] + '-' + match[2] : '';
  }
  function cleanVisit(value) {
    if (!value || value.version !== GUIDE_VERSION || typeof value.shown !== 'boolean'
      || (value.account && value.account !== accountHandle)) { return null; }
    return { shown: value.shown, confirmed: value.shown && value.confirmed === true,
      completed: value.shown && value.completed === true,
      updatedAt: typeof value.updatedAt === 'number' && isFinite(value.updatedAt) && value.updatedAt >= 0
        && value.updatedAt < 9007199254740990 ? Math.floor(value.updatedAt) : 0 };
  }
  function visitValue() {
    return { schema: 2, version: GUIDE_VERSION, account: accountHandle, seen: visit.shown ? BUILD_N : 0,
      shown: visit.shown, confirmed: visit.confirmed, completed: visit.completed, updatedAt: visit.updatedAt };
  }
  function readGuideVars() {
    var value = null;
    try {
      var all = typeof getVariables === 'function' ? getVariables({ type: 'script' }) : {};
      var saved = all && all[VARS_KEY];
      /* 旧 seen 仅保留作诊断；它缺少主版本，不能用来判定新版本已经展示。 */
      seen = saved && typeof saved.seen === 'number' ? saved.seen : 0;
      value = cleanVisit(saved);
    } catch (e) { log('读引导记录失败'); }
    if (!visitDirty) { visit = value || { shown: false, confirmed: false, completed: false, updatedAt: 0 }; scriptVisitSaved = !!value; }
    return seen;
  }
  function readLocalVisit() {
    if (!localVisitKey || visitDirty) { return; }
    try {
      var raw = HOST.localStorage.getItem(localVisitKey);
      var value = raw ? cleanVisit(JSON.parse(raw)) : null;
      /* 比较更新时间；reset 的 false 记录可覆盖尚未落盘的旧 true，旧 tombstone 也不会压住新记录。 */
      if (value && value.updatedAt >= visit.updatedAt) { visit = value; seen = visit.shown ? BUILD_N : 0; }
    } catch (e) { log('本机引导记录不可读，使用脚本记录'); }
  }
  function saveGuideVars() {
    if (!GUIDE_VERSION) { return; }
    var localSaved = false;
    if (localVisitKey && visitDirty) {
      try {
        var previous = cleanVisit(JSON.parse(HOST.localStorage.getItem(localVisitKey) || 'null'));
        if (previous && previous.updatedAt >= visit.updatedAt) { visit.updatedAt = previous.updatedAt + 1; }
      } catch (e) { }
    }
    var value = visitValue();
    scriptVisitSaved = false;
    if (localVisitKey) {
      try {
        var raw = JSON.stringify(value);
        HOST.localStorage.setItem(localVisitKey, raw);
        localSaved = HOST.localStorage.getItem(localVisitKey) === raw;
      } catch (e) { log('本机引导记录不可写，使用脚本记录'); }
    }
    try {
      if (typeof getVariables === 'function' && typeof replaceVariables === 'function') {
        var all = getVariables({ type: 'script' }) || {};
        all[VARS_KEY] = Object.assign({}, all[VARS_KEY] || {}, value);
        replaceVariables(all, { type: 'script' });
        var saved = (getVariables({ type: 'script' }) || {})[VARS_KEY];
        scriptVisitSaved = !!cleanVisit(saved) && saved.shown === visit.shown
          && saved.confirmed === visit.confirmed && saved.completed === visit.completed;
      }
    } catch (e) { log('引导脚本记录保存失败'); }
    if (!localSaved && !scriptVisitSaved && !identityPending && !storageWarned) {
      storageWarned = true;
      toast('warning', '引导记录未能保存，下次打开可能再次显示。请检查本站存储权限。');
    }
  }
  function markVisit(patch) {
    visit = Object.assign({}, visit, patch);
    visit.updatedAt = Math.max(Date.now(), visit.updatedAt + 1);
    seen = visit.shown ? BUILD_N : 0;
    visitDirty = true;
    saveGuideVars();
  }
  function hasSeenCurrentVersion() {
    /* 未打包的开发预览不自动抢占页面，也不写正式版本的展示记录。 */
    return !GUIDE_VERSION || visit.shown;
  }
  async function prepareVisitStorage() {
    if (!GUIDE_VERSION || disposed) { return; }
    identityPending = true;
    try {
      identityAbort = new (HOST.AbortController || AbortController)();
      identityTimer = setTimeout(function () { if (identityAbort) { identityAbort.abort(); } }, 5000);
      var ctx = stCtx(), headers = ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : {};
      var handle = await kamiUserHandle(HOST.fetch.bind(HOST), headers, identityAbort.signal);
      if (disposed) { return; }
      accountHandle = handle;
      localVisitKey = 'kami-guide-v2:' + encodeURIComponent(handle) + ':' + GUIDE_VERSION;
      readGuideVars();
      readLocalVisit();
    } catch (e) { if (!disposed) { log('无法读取账号本机引导记录，使用脚本记录'); } }
    finally {
      if (identityTimer) { clearTimeout(identityTimer); identityTimer = null; }
      identityAbort = null; identityPending = false;
    }
    if (disposed) { return; }
    /* 展示/重置可能发生在账号查询之前；此时保留用户刚做的操作，不能被旧记录盖回去。 */
    if (visitDirty || visit.shown) { saveGuideVars(); }
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
  function findEntryByName(prompts, part) {
    var list = prompts || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].name || '').indexOf(part) >= 0) { return list[i]; }
    }
    return null;
  }
  function disclaimer() {
    var raw = readRaw();
    if (!raw.ok) { return ''; }
    var d = findEntryByName(raw.settings.prompts || [], '免责');
    return d ? (firstComment(d.content) || '') : '';
  }

  /* ───────── 界面 ───────── */

  function openWizard() {
    if (disposed) { return false; }
    if (!rt) { toast('warning', '引导还没就绪（🧩 运行库 是否开着？）'); return false; }
    var preset = call(function () { return HOST.KamiPreset && HOST.KamiPreset.presetBridge ? HOST.KamiPreset.presetBridge() : null; });
    var skins = call(function () { return HOST.KamiDisplay && HOST.KamiDisplay.alive() ? HOST.KamiDisplay.manager : null; });
    var tb = call(function () { return HOST.KamiToolbox && HOST.KamiToolbox.bridge ? HOST.KamiToolbox.bridge() : null; });
    var at = call(function () { return HOST.AntiTruncation || null; });
    var long = {};
    if (tb) {
      long.compress = {
        get: function () { var s = tb.compress.get(); return { roll: s.roll.ok ? !!s.roll.enabled : null, grand: !!s.grandOn }; },
        setRoll: function (v) { return tb.compress.setRoll(v); },
        setGrand: function (v) { return tb.compress.setGrand(v); },
        open: function () { if (HOST.KamiToolbox && HOST.KamiToolbox.open) { HOST.KamiToolbox.open('compress'); } }
      };
    }
    if (at) { long.antitrunc = { get: function () { return !!at.enabled; }, set: function (v) { if (v) { at.on(); } else { at.off(); } } }; }
    try { if (preset) { preset.reload(); } } catch (e) { }
    markVisit({ shown: true });
    log('引导打开（版本 ' + GUIDE_VERSION + '）');
    rt.layer().open(LAYER_ID, rt.React.createElement(rt.panels.GuidePanel, {
      disclaimer: disclaimer(), copy: GUIDE_COPY || null, preset: preset, skins: skins, long: long, live: tb ? [tb] : [],
      onConfirm: function () { markVisit({ shown: true, confirmed: true }); },
      onClose: function (completed) {
        markVisit(completed ? { shown: true, completed: true } : { shown: true });
        log('引导关闭' + (completed ? '：已完成' : ''));
        closeWizard();
      }
    }));
    isOpen = true;
    return true;
  }
  function closeWizard() {
    isOpen = false;
    try { if (rt) { rt.layer().close(LAYER_ID); } } catch (e) { }
  }
  function toggle() { if (isOpen) { closeWizard(); } else { openWizard(); } }

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
    /* ⚠️ 2026-09-26 用户裁定：**去掉「预设名里必须含卡密预设」那道闸**。
       理由：脚本能跑起来，就说明它所在的预设已经载入了 —— 这道闸除了误伤什么也没防住。
       而它确实误伤了：2026-09-23 起产物名改成 ASCII（GitHub 会削非 ASCII 附件名），
      更新脚本导入的预设名是 `kami-v0.91-46-20260926`，不含中文那四个字，
       于是**自动弹出等于被关掉了**只能手动点 🧭（预览台日志就是这个现象）。
       用户改预设名同样不受影响 —— 现在只看「这个完整版本展示过没有」。 */
    if (hasSeenCurrentVersion()) {
      log('产物 ' + BUILD_N + ' 已看过（seen=' + seen + '），不自动弹');
      return;
    }
    log('这一版（产物 ' + BUILD_N + '）还没看过，准备自动弹；当前预设「' + (name || '?') + '」');
    openTimer = setTimeout(function () {
      openTimer = null;
      if (!disposed) { readGuideVars(); readLocalVisit(); }
      if (!disposed && !isOpen && !hasSeenCurrentVersion()) { autoOpened = openWizard() === true; }
    }, OPEN_DELAY);
  }

  /* ───────── 全局 API / 按钮登记 / 注销 ───────── */

  function expose() {
    var api = {
      version: VERSION,
      build: BUILD_N,
      alive: function () { return !disposed; },
      open: function () { openWizard(); },
      close: function () { closeWizard(); },
      toggle: toggle,
      reset: function () { markVisit({ shown: false, confirmed: false, completed: false }); log('已清除本版展示记录（下次加载会自动弹）'); },
      status: function () {
        return {
          version: VERSION, build: BUILD_N, seen: seen, autoOpened: autoOpened,
          presetVersion: GUIDE_VERSION, shown: visit.shown, confirmed: visit.confirmed, completed: visit.completed,
          open: isOpen, liveOk: readRaw().ok, presetName: presetName()
        };
      },
      shutdown: shutdown
    };
    try { HOST[API_NAME] = api; } catch (e) { }
  }

  function registerButton() {
    try {
      var defs = HOST.__hubDefs || (HOST.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) { if (defs[i] && defs[i].name === HUB_NAME) { defs.splice(i, 1); } }
      ownDef = {
        name: HUB_NAME,
        order: HUB_ORDER,
        tip: '新手引导（点击打开向导，可随时重看）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return !!rt; },
        absent: '引导还没就绪（🧩 运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    log('启动 v' + VERSION + '（产物 ' + BUILD_N + '）');
    waitForTavernReady(function (name) {
      log('酒馆就绪：当前预设「' + name + '」');
      prepareVisitStorage().then(function () { if (!disposed) { maybeAutoOpen(name); } });
    });
  }

  /* 运行库由另一个脚本加载，脚本是并行跑的：最多等 15 秒 */
  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.panels && r.panels.GuidePanel) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到运行库（🧩 运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (identityAbort) { try { identityAbort.abort(); } catch (e) { } identityAbort = null; }
    if (identityTimer) { clearTimeout(identityTimer); identityTimer = null; }
    if (timer) { clearTimeout(timer); timer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    if (openTimer) { clearTimeout(openTimer); openTimer = null; }
    closeWizard();
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef) { defs.splice(j, 1); } }
      var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev);
    } catch (e) { }
    ownDef = null;
    try { if (HOST[API_NAME] && HOST[API_NAME].shutdown === shutdown) { delete HOST[API_NAME]; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  readGuideVars();
  expose();
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
