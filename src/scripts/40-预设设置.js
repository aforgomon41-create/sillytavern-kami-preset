/* ============================================================
 * 🌟 预设设置   v0.6
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 它把「当前预设」变成一块可以点的面板：
 *   · 自己向「🎛 脚本按钮」登记一个按钮（🌟卡密预设），点击展开面板
 *   · 面板结构**运行时**从当前预设解析出来：tab = 层级，卡片 = 卡片头，条目 = 一张可点小卡片
 *     → 以后只改预设，不改脚本
 *   · 开关走**酒馆自己的通道**：改 prompt_order 里的 enabled → saveSettingsDebounced()
 *     （酒馆原生开关就是这么做的：写 settings.json，不写预设文件）
 *   · 「 选一」的卡片是单选：点开一条，自动关掉同卡片里的其它条目
 *   · 层级开/闭这类**锁定条目**一律不出现在面板里
 *   · 被关闭或删除时把面板、样式、登记、全局 API 全部收回；
 *     不修改预设文件、不改动酒馆设置
 *
 * 规则只有一份：解析器是 test/harness/preset-parse.mjs，构建期内联进来（build/kami-doc.mjs）。
 * 兜底皮肤只有一份：src/skin/base.css，同样构建期内联；它的作用域是
 * `html:not([data-kami-skin]) .kami-root`，所以皮肤管理一运行就整体失效，由选中皮肤接管。
 *
 * v0.5 新增（用户裁定）：固定的最后一页「ℹ️ 关于」—— 三个版本读数
 *   （酒馆本体 / 酒馆助手 / 预设本体）＋ 一颗「检查更新」按钮。
 *   检查更新调的是 70-远程更新.js 的全局 API KamiUpdate.check(true)：用户主动点，
 *   必须忽略「拒绝过 / 已写入」的记录真查一次。那个脚本没在运行时按钮照样能点，
 *   只把一句人话写进结果行（不把按钮做成点不动 —— 用户会犯懵）。
 *
 * v0.6 新增（用户裁定）：「🔄 远程更新」v1.4 的三方合并走两步裁决 ——
 *   70 号在下载到新版预设计算出「待裁决清单」后，调本脚本的
 *   KamiPreset.openMergeReview(plan, onApply) 打开「🔀 更新合并」页（本页排在最前，
 *   其它 tab 照旧）。计划对象由 70 号用内联的合并引擎算好，本脚本只负责展示与选择：
 *   每项一张卡（条目名 + 改了什么 + 二选一分段 保留我的/用新版，默认保留我的），
 *   顶部「全部保留我的 / 全部用新版」，底部「应用并完成更新」→ onApply(plan)。
 *   用户关掉面板 = onApply(null)（更新暂停、不落盘）；清单长时正文区自己滚。
 *   (本脚本**不**内联合并引擎 —— 计算、备份、写盘都不在这边。)
 *
 * v0.5 → v0.6 期间的历史范围注记：
 *   · v0.5：固定的最后一页「ℹ️ 关于」与「检查更新」按钮（见上）。
 *   · v0.4：「🧩 设置变量」tab（单值 → 数字卡、_min/_max 一对 → 范围卡，
 *     走安全通道写预设）；注释查看（ⓘ 就地展开）；
 *     修「PC 鼠标点 tab 页没反应」（指针捕获吃掉 click）：pointerdown 记下真正按的
 *     那一枚 tab，pointerup（按下基本没动）补一次切换；
 *     注释结构：条目名是标题栏，注释正文在标题栏**下方**的独立容器（.kami-item-note）。
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '0.6';
  var HUB_NAME = '🌟卡密预设';
  /* 按钮条排布（2026-09-21 用户裁定）：引导(10) → 皮肤(20) → 预设(30) → 压缩(40) → 反截断(50) */
  var HUB_ORDER = 30;
  var PANEL_ID = 'kami-preset-panel';
  var CSS_ID = 'kami-preset-css';
  var API_NAME = 'KamiPreset';
  var VARS_KEY = 'kami-preset';
  /* 产物号：构建时把 @@KAMI_BUILD_N@@ 换成真实编号（源码必须能独立编译，所以写成字符串）。
     与 50-引导.js 用的是同一个占位符 —— 「关于」页拿它给预设版本做交叉核对。 */
  var BUILD_N = parseInt('@@KAMI_BUILD_N@@', 10) || 0;
  var CHAR_ID = 100001;          // 酒馆 preset 的 prompt_order 主键（这份预设就是 100001）
  var Z = 30000;
  /* 面板几何的上下限：与拖动/缩放时的夹取共用同一组常量（照搬皮肤管理面板） */
  var PANEL_W = 420, PANEL_H = 560, PANEL_MIN_W = 300, PANEL_MIN_H = 240;
  var STATUS_ROLE = 'status';
  var SWIPE_AXIS = 12;    // 判定「横向滑动」的位移（小于它不判方向，避免误触）
  var SWIPE_SWITCH = 48;  // 切上一个/下一个 tab 的位移阈值
  var SHEET_CLOSE_DY = 90; // 贴底抽屉下拉关闭的距离（与皮肤管理面板一致）
  var TAP_SLOP = 6;       // 拖动 tab 行时允许的「按下不动」容差

  /* 面板手势（标题栏下拉收回 / 内容区滚到顶下拉收回 / 左右滑切 tab）只有一份实现：
     src/scripts/_panel-gestures.js，构建期内联到这里（见 build/kami-doc.mjs）。
     两个面板共用同一份，手势行为不会再各走各的。 */
  /* @@KAMI_PANEL_GESTURES@@ */

  /* 模型卡 / 条目卡（含角标、ⓘ 标记、注释外包层）的结构只有一份实现：
     src/scripts/_preset-cards.js，构建期内联到这里（build/kami-doc.mjs 的 expandPresetCards）。
     引导面板的模型页内联的是**同一份**，两块面板的卡片不会再各写一套（契约 §4.4）。 */
  /* @@KAMI_PRESET_CARDS@@ */

  /* v0.3 变更（本轮 7 件事，用户真机实测）：
   *   ① 桌面悬浮窗加缩放把手（.kami-resize[data-kami-act="resize"]），w/h 一起持久化；
   *   ② tab 行放不下时：滚轮 → 横向滚，按住可拖，触屏可滑（紧凑单行，不换行）；
   *   ③ 面板正文区左右滑动切 tab（横向位移明显大于纵向才切，避免与滚动打架）；
   *   ④ 去掉条目卡上那枚「开/关」小标签（.kami-chip），状态只由 .is-on 表达；
   *   ⑤ 点开关不再整体重画面板：只就地改受影响的卡片，tab / 几何 / 滚动位置都不动；
   *   ⑥ nixie 皮肤加强「开着」的发光感（用自己的暖橙令牌）；
   *   ⑦ 贴底抽屉向下拖超过阈值关闭（照搬皮肤管理面板的阈值与判断）。
   * ── 预设结构解析器（规则真相：test/harness/preset-parse.mjs，构建期内联） ── */
  /* @@KAMI_PRESET_PARSE@@ */

  /* ── 兜底皮肤（唯一真相：src/skin/base.css，构建期内联成字符串常量） ──
     皮肤管理没运行时（html 上没有 data-kami-skin）它才生效，所以这里无条件注入一份：
     面板自己的外观、以及面板的定位（.kami-drop 的 left/top/width/height 就是用
     --kami-panel-* 令牌算的）都来自它。 */
  /* @@KAMI_BASE_CSS_JS@@ */

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
    try { if (window.console && console.log) { console.log('[预设] ' + msg); } } catch (e) { }
  }
  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, '🌟 预设设置'); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }

  /* ───────── 状态 ───────── */

  var disposed = false;
  var panelRoot = null, panelDrop = null, panelHead = null;
  var GESTURES = null;
  var liveData = null;              // 最近一次「读活设置 + 解析」的结果
  var view = [];                    // tab 模型（渲染用）
  var tabKey = null;                // 当前 tab
  var cardMap = {};                 // 卡片键 -> { tabKey, items }
  var aboutEls = null;              // 「关于」页的元素句柄（检查更新的结果就地写，不重画面板）
  var geom = { x: null, y: null, w: null, h: null };  // 面板位置与大小（拖动/缩放时存回脚本变量 kami-preset）
  var currentModel = null;          // 当前模型（模型 emoji）：存在脚本变量 kami-preset.currentModel 里
  var writeCount = 0, saveCount = 0, lastWrite = '';
  var lastSave = null;      // 最近一次「写预设文件」的结果（预设名 / 取自哪一层 / 通道 / 服务端回执）
  var lastNameInfo = null;  // 最近一次解析到的预设名：{ name, from }
  var varWrites = 0;                    // 变量写回次数（与开关的 writeCount 分开记，读起来才不含糊）
  var emitCount = 0, emitSkipped = 0;   // OAI_PRESET_CHANGED_AFTER 的发出/跳过次数（排障用）
  var saveTimer = null, pingTimer = null, resizeHandler = null;
  var ownDef = null, unsubs = [];
  /* v0.6：「🔄 远程更新」的裁决页。有值 = 面板最前多一页「🔀 更新合并」，
     结构 = { plan, onApply }（都由 70 号传进来）；onApply(plan) 提交、onApply(null) 放弃。 */
  var mergeCtx = null;

  /* ───────── 酒馆设置：读（活的设置对象） ───────── */

  /* SillyTavern 这个全局在脚本 iframe 里不一定直接可见，几个位置都找一遍 */
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

  /* 这份预设的 order：优先 character_id 100001（酒馆原生开关改的就是它），
     拿不到就退到「条数最多的那一条」，最后才认命报错。 */
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

  /* 只读设置，不解析（写入路径用这个，省一次解析） */
  function readRaw() {
    var ctx = stCtx();
    if (!ctx) { return { ok: false, error: '拿不到酒馆设置：SillyTavern.getContext 不可用' }; }
    var s = settingsOf(ctx);
    if (!s) { return { ok: false, error: '酒馆设置里没有 chatCompletionSettings，读不到当前预设' }; }
    var pm = pickOrder(s);
    if (!pm) {
      return {
        ok: false, error: '当前预设的 prompt_order 是空的（没有 character_id=' + CHAR_ID + ' 这一条）',
        ctx: ctx, settings: s
      };
    }
    return { ok: true, error: null, ctx: ctx, settings: s, order: pm };
  }

  /* 读 + 按解析器规则解析出结构树 */
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
    if (!tree) {
      return { ok: false, error: '预设解析失败：' + err, ctx: raw.ctx, settings: raw.settings, order: raw.order };
    }
    raw.preset = preset;
    raw.tree = tree;
    return raw;
  }

  /* ───────── 酒馆设置：写（prompt_order.enabled + saveSettingsDebounced） ───────── */

  /* 让**酒馆原生预设面板**自己重画一次。
     酒馆的原生条目列表只在它自己的 render() 里更新，而它监听这一个事件：
     public/scripts/PromptManager.js  eventSource.on(OAI_PRESET_CHANGED_AFTER, () => { …; this.renderDebounced(); })
     这个回调**不需要任何参数**，所以只 emit 事件名即可。
     拿不到 eventSource / eventTypes / 事件名时**跳过**：开关本身已经写好了，
     刷新不成功只是「原生面板显示旧样子」，绝不能因此把整个写入流程算作失败。 */
  function notifyPresetChanged(ctx) {
    var es = null, name = null, i, cands = [ctx, HOST];
    for (i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c) { continue; }
      if (!es) { es = c.eventSource || null; }
      if (!name && c.eventTypes) { name = c.eventTypes.OAI_PRESET_CHANGED_AFTER || null; }
    }
    if (!es || typeof es.emit !== 'function' || !name) {
      emitSkipped++;
      log('跳过原生面板刷新事件：' + (!es ? '拿不到 eventSource' : (typeof es.emit !== 'function' ? 'eventSource.emit 不是函数' : '拿不到 eventTypes.OAI_PRESET_CHANGED_AFTER')));
      return false;
    }
    try {
      es.emit(name);
      emitCount++;
      log('已发事件 ' + name + '（第 ' + emitCount + ' 次）→ 酒馆原生预设面板会重画');
      return true;
    } catch (e) {
      emitSkipped++;
      log('发事件 ' + name + ' 失败（开关已生效，不影响）：' + ((e && e.message) || e));
      return false;
    }
  }

  /* pairs: [{ identifier, value }]。幂等：已经是目标状态就不写、也不保存。 */
  function commit(pairs) {
    var raw = readRaw();
    if (!raw.ok) { return { ok: false, changed: 0, missing: [], msg: raw.error }; }
    var list = raw.order.order || [];
    var changed = 0, missing = [], i, j;
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i], ent = null;
      for (j = 0; j < list.length; j++) {
        if (list[j] && list[j].identifier === p.identifier) { ent = list[j]; break; }
      }
      if (!ent) { missing.push(p.identifier); continue; }
      if (ent.enabled === p.value) { continue; }        // 幂等：不动
      ent.enabled = p.value;
      changed++;
    }
    if (changed > 0) {
      writeCount += changed;
      lastWrite = writeText(nowText(), changed, missing);
      try {
        if (typeof raw.ctx.saveSettingsDebounced !== 'function') {
          return { ok: false, changed: changed, missing: missing, msg: '找不到 saveSettingsDebounced，改动可能不会被保存' };
        }
        raw.ctx.saveSettingsDebounced();              // 酒馆自己的保存：写 settings.json
        saveCount++;
      } catch (e) {
        return { ok: false, changed: changed, missing: missing, msg: '保存失败：' + ((e && e.message) || e) };
      }
      /* 写完再发事件：只有真的改过东西才需要让原生面板重画 */
      notifyPresetChanged(raw.ctx);
      log('写入 prompt_order：改动 ' + changed + ' 条' + (missing.length ? ('，找不到 ' + missing.length + ' 条') : '') +
        '（saveSettingsDebounced 共 ' + saveCount + ' 次）');
    } else {
      lastWrite = writeText(nowText(), 0, missing);
    }
    return { ok: true, changed: changed, missing: missing, msg: lastWrite };
  }

  /* ───────── 酒馆设置：写（预设条目的 content + 酒馆自己的保存通道） ─────────

     ⚠️ **绝不许用**酒馆助手的 replacePreset / updatePresetWith / setPreset：
     它们走**白名单重建**，凡是白名单外的字段（例如 injection_trigger）会在往返里被丢掉，
     把整个预设写坏（已实测）。变量值写在预设条目的 content 里（形如 {{setvar::名::值}}），
     要改预设文本，就只认下面这一条安全通道：
       ① 改**活的设置对象**里那条 prompt 的 content（主键一律用**完整 identifier** ——
          这份预设里有 4 条同名的「❌ 不开」）：
            SillyTavern.getContext().chatCompletionSettings.prompts[i].content = 新文本
       ② 再用**酒馆自己的保存通道**写盘：点酒馆原生「更新当前预设」按钮 #update_oai_preset
          （= openai.js:6766 saveOpenAIPreset(oai_settings.preset_settings_openai, oai_settings, false)：
          请求体从**活设置**按酒馆自己的字段表组装，prompts / prompt_order 整段克隆，无损）。
          ⚠️ 不要用 getPresetManager('openai').savePreset(名字)：openai 这条路在
          preset-manager.js:641-673 没有分支，它会拿到 {} 并把预设写成空对象（详见 savePresetFile）。
        ③ 只改那**一个数字**，其余一个字符都不许动：下面的 setVarInContent 只做一次精确的
          字符串替换（找 `setvar::名::旧值`，只换掉旧值那一段）。 */

  /* 把 content 里第一处 `setvar::<name>::<oldValue>` 的数字换成 newValue。
     找不到（预设已被改过、或值不是纯数字）就返回 null —— 绝不猜、绝不整段重写。 */
  function setVarInContent(content, name, oldValue, newValue) {
    if (typeof content !== 'string') { return null; }
    var needle = 'setvar::' + name + '::' + oldValue;
    var at = content.indexOf(needle);
    if (at < 0) { return null; }
    return content.slice(0, at) + 'setvar::' + name + '::' + newValue + content.slice(at + needle.length);
  }

  /* ── 当前预设名：多重兜底（真机上这一步原先 100% 失败） ──────────────────

     背景：旧代码只读 `chatCompletionSettings.name`，而 ST 1.18.0 里**根本没有这个字段**
     （public/scripts/openai.js 全文没有给 oai_settings.name 赋过值），所以名字永远是空，
     直接 return + 回滚 → 变量 tab 改值 100% 写不进去。
     预设名在 1.18.0 里实际有两处：活设置的 preset_settings_openai（openai.js:4509/4728 就是往它赋值的）、
     以及那个下拉框 #settings_preset_openai 的选中项文本。官方读名字读的也是下拉框：
       preset-manager.js:403  getSelectedPresetName() { return $(this.select).find('option:selected').text(); }
     按优先级一层层试，**每一层都 try/catch**；全拿不到就如实报错 + 回滚（绝不猜名字写盘）。 */
  function cleanName(v) {
    try {
      if (v === null || v === undefined) { return ''; }
      if (typeof v !== 'string') { v = String(v); }
      return v.replace(/^[\s\u200B]+|[\s\u200B]+$/g, '');
    } catch (e) { return ''; }
  }

  function domPresetName() {
    try {
      var sel = HDOC.getElementById('settings_preset_openai');
      if (!sel) { return ''; }
      if (sel.selectedOptions && sel.selectedOptions.length) {
        var t = cleanName(sel.selectedOptions[0].textContent);
        if (t) { return t; }
      }
      if (sel.options && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
        return cleanName(sel.options[sel.selectedIndex].text);
      }
    } catch (e) { }
    return '';
  }

  /* 活设置的几个可能位置，按「最像当前预设」的顺序排 */
  function liveSettingsList(ctx, settings) {
    var out = [], i, cands = [settings, (ctx && ctx.chatCompletionSettings) || null, (HOST && HOST.oai_settings) || null];
    for (i = 0; i < cands.length; i++) { if (cands[i] && out.indexOf(cands[i]) < 0) { out.push(cands[i]); } }
    return out;
  }

  function presetManagerOf(ctx) {
    var i, cands = [ctx, HOST];
    for (i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c || typeof c.getPresetManager !== 'function') { continue; }
      try { var pm = c.getPresetManager('openai'); if (pm) { return pm; } } catch (e) { }
    }
    return null;
  }

  function resolvePresetName(ctx, settings, pm) {
    var list = liveSettingsList(ctx, settings), i;
    var layers = [
      ['getPresetManager("openai").getSelectedPresetName()', function () {
        if (!pm || typeof pm.getSelectedPresetName !== 'function') { return ''; }
        return cleanName(pm.getSelectedPresetName());
      }],
      ['活设置 preset_settings_openai', function () {
        for (var j = 0; j < list.length; j++) { var v = cleanName(list[j].preset_settings_openai); if (v) { return v; } }
        return '';
      }],
      ['活设置 name', function () {
        for (var j = 0; j < list.length; j++) { var v = cleanName(list[j].name); if (v) { return v; } }
        return '';
      }],
      ['下拉框 #settings_preset_openai 选中项', domPresetName]
    ];
    for (i = 0; i < layers.length; i++) {
      try {
        var got = layers[i][1]();
        if (got) {
          log('当前预设名 = 「' + got + '」（取自第 ' + (i + 1) + ' 层兜底：' + layers[i][0] + '）');
          return { name: got, from: layers[i][0], layer: i + 1 };
        }
      } catch (e) { log('第 ' + (i + 1) + ' 层取预设名出错（跳过）：' + ((e && e.message) || e)); }
    }
    return { name: '', from: null, layer: 0 };
  }

  /* ── 写盘后的自证：拦一次 fetch，抓住这次保存**真正发出去的那个请求体** ──

     酒馆原生「更新当前预设」按钮是 fire-and-forget（handler 是 async，拿不到返回值），
     而服务端就是把请求体里的 preset 原样写盘（src/endpoints/presets.js:52 writeFileAtomicSync）。
     所以拦下这唯一一次 /api/presets/save 的**请求体 + HTTP 状态**，等于回读了即将落盘的内容：
     prompts 条数、injection_trigger 还在不在、那条 content 是不是已带新值。
     结果写进日志与 status().lastSave；拦完立刻还原 fetch（零残留）。 */
  function countInjection(prompts) {
    var n = 0, i;
    for (i = 0; i < (prompts || []).length; i++) {
      if (prompts[i] && prompts[i].injection_trigger !== undefined && prompts[i].injection_trigger !== null) { n++; }
    }
    return n;
  }

  function planInBody(prompts, plan) {
    var out = [], i, j;
    for (i = 0; i < (plan || []).length; i++) {
      for (j = 0; j < (prompts || []).length; j++) {
        if (prompts[j] && prompts[j].identifier === plan[i].identifier) {
          var c = (typeof prompts[j].content === 'string') ? prompts[j].content : '';
          out.push({
            identifier: plan[i].identifier, name: plan[i].name,
            hasNew: c.indexOf('setvar::' + plan[i].name + '::' + plan[i].value) >= 0,
            hasOld: c.indexOf('setvar::' + plan[i].name + '::' + plan[i].old) >= 0
          });
        }
      }
    }
    return out;
  }

  function watchSave(name, from, plan) {
    var target = HOST || window;
    var orig = null, done = false, patched = null;
    var r = {
      at: nowText(), name: name, from: from, channel: '酒馆原生「更新当前预设」按钮',
      status: null, ok: null, dispatcher: null, prompts: null, injection: null, bytes: null, content: null, error: null
    };
    try { orig = target.fetch; } catch (e) { orig = null; }
    if (typeof orig !== 'function') {
      r.error = '宿主 fetch 不可用，没法回读写盘结果（改动仍已发出）';
      lastSave = r; log('写盘自证不可用：' + r.error); return r;
    }
    /* 补丁与兜底定时器都登记在 savePatches 里，注销时由 cancelSavePatches() 逐项收回
       （原来只靠 finish() 自还原：写盘途中注销 → 最多 6 秒内 HOST.fetch 还是被替换过的版本）。 */
    var slot = { target: target, orig: orig, patched: null, timer: null, done: false };
    function finish() {
      if (done) { return; }
      done = true;
      slot.done = true;
      try { if (slot.timer) { clearTimeout(slot.timer); slot.timer = null; } } catch (e) { }
      try { if (target.fetch === patched) { target.fetch = orig; } } catch (e) { }
      var si = savePatches.indexOf(slot);
      if (si >= 0) { savePatches.splice(si, 1); }
      lastSave = r;
      if (!r.dispatched) {
        log('写盘自证：没等到 /api/presets/save 请求 —— ' + (r.error || '按钮可能没接上'));
      } else if (r.ok) {
        log('写盘自证 ✓ HTTP ' + r.status + ' · 落到「' + r.name + '」· 请求体 ' + r.bytes + 'B · prompts ' + r.prompts +
          ' 条 · 带 injection_trigger ' + r.injection + ' 条' +
          (r.content && r.content.length ? (' · 那条 content 已含新值=' + r.content[0].hasNew + '、旧值还在=' + r.content[0].hasOld) : ''));
      } else {
        log('写盘自证 ✗ HTTP ' + r.status + ' · ' + (r.error || '服务端没成功'));
      }
      renderStatus();
      /* 真写失败：活设置里的改动要退回去，否则内存与磁盘就分家了（界面也弹回旧值） */
      if (r.ok === false && plan && plan.length) {
        try {
          for (var i = 0; i < plan.length; i++) { plan[i].prompt.content = plan[i].before; }
          revertVarInputs(plan);
          toast('error', '预设没写进去（HTTP ' + r.status + '），改动已退回');
        } catch (e) { log('退回活设置失败：' + ((e && e.message) || e)); }
      }
    }
    patched = function (input, init) {
      var url = '';
      try { url = (typeof input === 'string') ? input : ((input && input.url) || ''); } catch (e) { }
      var p = orig.apply(this, arguments);
      try {
        if (url.indexOf('/api/presets/save') >= 0) {
          r.dispatched = true;
          var rawBody = (init && init.body) ? init.body : null;
          try {
            var obj = rawBody ? JSON.parse(rawBody) : null;
            if (obj && obj.preset) {
              r.name = obj.name; r.dispatcher = obj.apiId;
              r.bytes = (typeof rawBody === 'string') ? rawBody.length : null;
              r.prompts = (obj.preset.prompts || []).length;
              r.injection = countInjection(obj.preset.prompts);
              r.content = planInBody(obj.preset.prompts, plan);
            }
          } catch (e2) { r.error = '请求体解析失败：' + ((e2 && e2.message) || e2); }
          try {
            p.then(function (resp) {
              r.status = resp ? resp.status : null;
              r.ok = !!(resp && resp.ok);
              if (!r.ok) { r.error = '服务端返回 ' + r.status; }
              finish();
            }, function (err) {
              r.ok = false; r.error = '网络错误：' + ((err && err.message) || err);
              finish();
            });
          } catch (e3) { r.ok = false; r.error = '等响应出错：' + ((e3 && e3.message) || e3); finish(); }
        }
      } catch (e) { }
      return p;
    };
    try { target.fetch = patched; } catch (e) {
      r.error = '拦不住宿主 fetch：' + ((e && e.message) || e);
      lastSave = r; log(r.error); return r;
    }
    slot.patched = patched;
    savePatches.push(slot);
    slot.timer = setTimeout(function () { if (!r.dispatched) { r.ok = false; r.error = '6 秒内没看到保存请求'; finish(); } }, 6000);
    return r;
  }

  /* watchSave 压上的 fetch 补丁栈（后进先出收回）。
     注销时逐个还原：先还原最晚压上的那层（它的 orig 可能是上一层补丁），最后回到真 fetch。 */
  var savePatches = [];
  function cancelSavePatches() {
    while (savePatches.length) {
      var p = savePatches.pop();
      p.done = true;
      try { if (p.timer) { clearTimeout(p.timer); p.timer = null; } } catch (e) { }
      try { if (p.target && p.target.fetch === p.patched) { p.target.fetch = p.orig; } } catch (e) { }
    }
  }

  /* 写盘失败时把面板上那几个数字框弹回原值（按 entry + 变量名找，不只管当前这一张卡） */
  function revertVarInputs(plan) {
    if (!panelRoot) { return; }
    for (var i = 0; i < (plan || []).length; i++) {
      var list = [];
      try { list = panelRoot.querySelectorAll('[data-kami-var="' + plan[i].name + '"]'); } catch (e) { list = []; }
      for (var j = 0; j < list.length; j++) {
        if (list[j].getAttribute('data-kami-entry') !== plan[i].identifier) { continue; }
        list[j].value = plan[i].old;
        list[j].setAttribute('data-kami-old', plan[i].old);
      }
      syncVarModel(plan[i].identifier, plan[i].name, plan[i].old);
    }
  }

  /* ── 写预设文件 ────────────────────────────────────────────────────────

     ⚠️ 通道选择（读源码 + 真机实测后定的，与上一轮的设计不同）：
     · `getPresetManager('openai').savePreset(名字)` **不能用在 openai 上**：
       preset-manager.js:641-673 的 getSettingsByApiId() 没有 openai 分支（default → 返回 {}），
       savePreset 不传第二个参数时 preset 取 this.getPresetSettings(name) = {}，
       而服务端 presets.js:43 只判 `!request.body.preset`（`{}` 是 truthy）→ 会把预设文件**写成空对象**。
       酒馆自己从不在 openai 上用它：index.html:203 openai 那颗保存按钮是 #update_oai_preset；
       preset-manager.js:1068 重命名时也特意改点那颗按钮（注释：prevents the renamed preset from being corrupted）。
     · 正确通道 = **同一颗按钮**：#update_oai_preset → openai.js:6766
       `saveOpenAIPreset(oai_settings.preset_settings_openai, oai_settings, false)`，
       请求体由 getChatCompletionPreset()（openai.js:4477）从**活设置**按酒馆自己的字段表组装，
       prompts / prompt_order 整段 structuredClone —— 字段一个不丢（含 injection_trigger）。
       按钮保存用的名字就是活设置里的 preset_settings_openai（openai.js:6767），
       与上面兜底链的第 1 层（官方 getSelectedPresetName）同源。
     拿不到名字 / 拿不到通道，就如实报错，并把活设置里的改动**回滚**（宁可什么都没发生，也不留半截状态）。 */
  function savePresetFile(ctx, settings, plan) {
    var pm = presetManagerOf(ctx);
    var info = resolvePresetName(ctx, settings, pm);
    lastNameInfo = info;
    if (!info.name) { return { ok: false, msg: '拿不到当前预设名，改动没有写盘' }; }

    /* ① 首选：酒馆原生「更新当前预设」按钮 */
    var btn = null;
    try { btn = HDOC.getElementById('update_oai_preset'); } catch (e) { btn = null; }
    if (btn) {
      var liveName = '';
      try { liveName = cleanName(settings && settings.preset_settings_openai); } catch (e) { liveName = ''; }
      if (!liveName && settings) {
        /* 活设置里这个名字空着（例如刚导入还没落名字）：补上刚解析出来的，原生按钮才有名字可存。
           酒馆载入/保存预设时自己也是这么记的（openai.js:4509/4728）。 */
        try {
          settings.preset_settings_openai = info.name; liveName = info.name;
          log('活设置 preset_settings_openai 为空，已补成「' + info.name + '」让原生按钮有名字可存');
        } catch (e) { }
      }
      if (!liveName) { return { ok: false, msg: '拿不到当前预设名，改动没有写盘' }; }
      if (liveName !== info.name) { log('注意：兜底链解析到「' + info.name + '」，活设置 preset_settings_openai 是「' + liveName + '」，按后者写盘'); }
      watchSave(liveName, info.from, plan);
      try {
        btn.click();                       // 就是酒馆自己那颗保存按钮
      } catch (e) {
        return { ok: false, msg: '点不动酒馆的「更新当前预设」按钮：' + ((e && e.message) || e) };
      }
      saveCount++;
      log('已走酒馆自己的保存通道写盘：点「更新当前预设」按钮 → savePreset(' + liveName + ')（共 ' + saveCount + ' 次，第二个参数不传）');
      return { ok: true, msg: '', name: liveName, from: info.from, layer: info.layer, channel: 'native-button' };
    }

    /* ② 兜底：没有那颗按钮时（换 ST 版本）才考虑 PresetManager —— 但先探一次，
       探到空壳（openai 分支缺失）就**拒绝写盘**：宁可不保存，也绝不把预设写成空对象。 */
    if (!pm || typeof pm.savePreset !== 'function') { return { ok: false, msg: '拿不到 getPresetManager("openai").savePreset，改动没有写盘' }; }
    var probe = null;
    try { probe = pm.getPresetSettings(info.name); } catch (e) { probe = null; }
    var n = 0;
    try { n = probe ? Object.keys(probe).length : 0; } catch (e) { n = 0; }
    if (!probe || !n || !probe.prompts || !probe.prompts.length) {
      return { ok: false, msg: '这台酒馆上没有「更新当前预设」按钮，而 getPresetManager("openai").savePreset 在 openai 上会写出空预设（preset-manager.js 没有 openai 分支），已拒绝写盘：改动没有保存' };
    }
    try {
      pm.savePreset(info.name);          // ⚠️ 第二个参数不传（传了走白名单重建，会把预设写坏）
      saveCount++;
      lastSave = { at: nowText(), name: info.name, from: info.from, channel: 'getPresetManager.savePreset', status: null, ok: null };
      log('已走 getPresetManager("openai").savePreset(' + info.name + ') 写盘（共 ' + saveCount + ' 次）');
      return { ok: true, msg: '', name: info.name, from: info.from, layer: info.layer, channel: 'preset-manager' };
    } catch (e) {
      return { ok: false, msg: 'savePreset 失败：' + ((e && e.message) || e) };
    }
  }

  /* pairs: [{ identifier, name, old, value }]，全部来自同一张变量卡。
     幂等：值没变的那几条根本不会进来（调用方先比过 data-kami-old）。 */
  function commitVars(pairs) {
    var raw = readRaw();
    if (!raw.ok) { return { ok: false, changed: 0, msg: raw.error }; }
    var prompts = raw.settings.prompts || [];
    var plan = [], i, j;
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i], ent = null;
      for (j = 0; j < prompts.length; j++) {
        if (prompts[j] && prompts[j].identifier === p.identifier) { ent = prompts[j]; break; }
      }
      if (!ent) { return { ok: false, changed: 0, msg: '预设里找不到条目 ' + p.identifier }; }
      var before = (typeof ent.content === 'string') ? ent.content : '';
      var after = setVarInContent(before, p.name, p.old, p.value);
      if (after === null) { return { ok: false, changed: 0, msg: '预设里找不到 setvar::' + p.name + '::' + p.old + '（预设被改过？）' }; }
      plan.push({ prompt: ent, identifier: p.identifier, name: p.name, old: p.old, value: p.value, before: before, after: after });
    }
    if (!plan.length) { return { ok: true, changed: 0, msg: '没有变化' }; }
    for (i = 0; i < plan.length; i++) { plan[i].prompt.content = plan[i].after; }   // ① 只动活设置
    var saved = savePresetFile(raw.ctx, raw.settings, plan);                                           // ② 酒馆自己的通道
    if (!saved.ok) {
      for (i = 0; i < plan.length; i++) { plan[i].prompt.content = plan[i].before; }  // 回滚，不留半截
      return { ok: false, changed: 0, msg: saved.msg };
    }
    varWrites += plan.length;
    for (i = 0; i < plan.length; i++) {
      log('写回变量：' + plan[i].name + ' ' + plan[i].old + ' → ' + plan[i].value + '（' + diffDots(plan[i].before, plan[i].after) + '）');
    }
    lastWrite = writeText(nowText(), plan.length, []);
    return { ok: true, changed: plan.length, plan: plan, msg: '' };
  }

  /* 排障用：把两段文本的差异点出来（只差一个数字时，这里会打印出被换掉的那一段） */
  function diffDots(a, b) {
    var i = 0, k = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) { i++; }
    while (k < a.length - i && k < b.length - i && a.charAt(a.length - 1 - k) === b.charAt(b.length - 1 - k)) { k++; }
    return '差异位置 ' + i + ' 「' + a.slice(i, a.length - k) + '」→「' + b.slice(i, b.length - k) + '」';
  }

  /* 改一个变量框（原生 change：失焦或回车都会来）。
     范围卡两个数字框**填反了自动交换**（用户裁定）；写回失败就弹回原值，界面不说谎。
     ⑤ 一律不重建面板：成功只就地改这几个输入框的 value / data-kami-old。 */
  function applyVar(input) {
    if (!input || !input.getAttribute) { return; }
    var card = null;
    try { card = input.closest ? input.closest('[data-kami-var-card]') : null; } catch (e) { }
    var inputs = card ? card.querySelectorAll('[data-kami-var]') : [input];
    if (!inputs.length) { return; }
    var i, vals = [];
    for (i = 0; i < inputs.length; i++) {
      var s = String(inputs[i].value).trim();
      if (!isPureDigits(s)) { toast('warning', '变量只能填 0 以上的整数'); revertVars(inputs); return; }
      vals.push(s);
    }
    if (inputs.length === 2 && Number(vals[0]) > Number(vals[1])) {
      var tmp = vals[0]; vals[0] = vals[1]; vals[1] = tmp;      // 填反了：自动交换
      for (i = 0; i < inputs.length; i++) { inputs[i].value = vals[i]; }
      toast('info', '大小填反了，已自动交换');
    }
    var pairs = [];
    for (i = 0; i < inputs.length; i++) {
      var old = inputs[i].getAttribute('data-kami-old');
      if (vals[i] !== old) {
        pairs.push({
          identifier: inputs[i].getAttribute('data-kami-entry'),
          name: inputs[i].getAttribute('data-kami-var'),
          old: old, value: vals[i]
        });
      }
    }
    if (!pairs.length) { return; }
    var res = commitVars(pairs);
    if (!res.ok) { toast('error', res.msg); revertVars(inputs); renderStatus(); return; }
    for (i = 0; i < pairs.length; i++) {
      syncVarModel(pairs[i].identifier, pairs[i].name, pairs[i].value);
      for (var j = 0; j < inputs.length; j++) {
        if (inputs[j].getAttribute('data-kami-var') === pairs[i].name) { inputs[j].setAttribute('data-kami-old', pairs[i].value); }
      }
    }
    renderStatus();
    log('变量已改：' + pairs.map(function (p) { return p.name + '=' + p.value; }).join('，'));
  }

  /* 写成功之后把变量模型里的值同步掉（只在同一个 view 模型上改值，不重建 DOM）。
     不重建的理由与开关那一条一样：tab / 面板位置 / 尺寸 / 滚动位置都不许动。 */
  function syncVarModel(identifier, name, value) {
    var i, j, k;
    for (i = 0; i < view.length; i++) {
      if (view[i].special !== 'var') { continue; }
      for (j = 0; j < view[i].cards.length; j++) {
        var c = view[i].cards[j];
        if (c.entry !== identifier) { continue; }
        for (k = 0; k < c.vars.length; k++) { if (c.vars[k].name === name) { c.vars[k].value = value; } }
      }
    }
  }

  function revertVars(inputs) {
    for (var i = 0; i < inputs.length; i++) { inputs[i].value = inputs[i].getAttribute('data-kami-old'); }
  }

  function nowText() {
    try {
      var d = new Date();
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    } catch (e) { return ''; }
  }
  function writeText(at, n, missing) {
    return at + ' 改动 ' + n + ' 条' + (missing && missing.length ? ('，' + missing.length + ' 条没找到') : '');
  }

  /* ───────── 渲染模型（解析树 -> 面板要画的东西） ───────── */

  function itemsOf(list) {
    var out = [], i;
    for (i = 0; i < (list || []).length; i++) {
      var e = list[i];
      if (!e || e.role2 === 'layer-locked') { continue; }   // 锁定条目：面板上永远不出现
      out.push({
        identifier: e.identifier,
        name: e.name,
        enabled: e.enabled !== false,
        comment: e.commentFlat,                              // 本轮只带在数据结构里，界面下一轮做
        models: e.models || []
      });
    }
    return out;
  }

  /* 「🤖 模型」tab 的一条：解析器给的是 { entry, identifier, name, models, originCard … }，
     这里只取面板要用的字段（与 itemsOf 的输出形状保持一致，好让 itemEl / syncModel 通用）。
     models = 归属集合：名字里命中的模型 emoji（解析器 preset-parse.mjs 步骤 6 算好的）。 */
  function modelItemsOf(card) {
    var out = [], i;
    for (i = 0; i < ((card && card.items) || []).length; i++) {
      var it = card.items[i];
      if (!it || !it.identifier) { continue; }
      var e = it.entry || {};
      if (e.role2 === 'layer-locked') { continue; }
      out.push({
        identifier: it.identifier,
        name: it.name,
        enabled: e.enabled !== false,
        comment: e.commentFlat || null,
        models: (it.models || []).slice(),
        originLayer: it.originLayer || null,
        originCard: it.originCard || null,
        isMirror: !!it.isMirror,
        onlyInModelTab: !!it.onlyInModelTab
      });
    }
    return out;
  }

  /* 「🧩 设置变量」tab 的卡片模型：**直接用解析器算好的结果**（buildVarCards，规则真相在
     test/harness/preset-parse.mjs 的步骤 4 之后那一段），这里只把它摊成面板要画的形状。
     解析器的产物是「每个变量条目一组」：entry + cards[]，每张 cards[i] 是
       · { type:'number', name, value }              —— 单个纯数字变量
       · { type:'range',  base, min:{name,value}, max:{name,value} } —— 成对的 _min/_max
     所以「卡片数」与用户看到的张数天然一致（实测：3 个变量条目 → 1 张数字卡 + 2 张范围卡）。 */
  function varCardsOf(t) {
    var groups = (t && t.varCards) || [], out = [], i, j;
    for (i = 0; i < groups.length; i++) {
      var g = groups[i] || {}, ent = g.entry || {}, list = g.cards || [];
      for (j = 0; j < list.length; j++) {
        var c = list[j] || null;
        if (!c) { continue; }
        var vars = [];
        if (c.type === 'range') {
          vars.push({ name: c.min.name, value: c.min.value });
          vars.push({ name: c.max.name, value: c.max.value });
        } else {
          vars.push({ name: c.name, value: c.value });
        }
        out.push({
          key: 'V' + i + '_' + j,
          name: ent.name || '',                       // 卡片标题 = 条目名（用户裁定的显示口径）
          entry: ent.identifier || null,
          note: ent.commentFlat || null,
          kind: c.type === 'range' ? 'range' : 'number',
          mode: null,                                 // 变量卡没有「单选/多选」语义（与普通卡片保持同一形状）
          label: c.type === 'range' ? c.base : c.name,
          multi: list.length > 1,                     // 一个条目出了多张卡时才补一枚变量名小标签
          vars: vars,
          items: []                                   // 变量卡里没有「开关条目」：counts / eachItem 都要读它
        });
      }
    }
    return out;
  }

  /* 图例 = 「🤖 [模型类型] 选一」那条登记表的注释（解析器标成 model-registry）。
     优先认名字里带「 选一」的那条；认不到就退到第一条有注释的登记表。 */
  function legendOf(tree) {
    var regs = (tree && tree.modelTab && tree.modelTab.registryEntries) || [], i, fallback = null;
    for (i = 0; i < regs.length; i++) {
      if (!regs[i] || !regs[i].commentFlat) { continue; }
      if (String(regs[i].name || '').indexOf(CARD_ONCE) >= 0) { return regs[i].commentFlat; }
      if (fallback === null) { fallback = regs[i].commentFlat; }
    }
    return fallback;
  }

  /* 「当前模型」闸门：模型专属条目（归属集合非空）只有在当前模型的归属集合里才可开关。
     多模型共用条目（如 🐋 DS/GLM 💤，归属 🐋+💤）跟着它命中的那几个模型走。 */
  function isLockedItem(item) {
    var m = (item && item.models) || [], i;
    if (!m.length) { return false; }          // 不是模型专属条目：永远可开关
    if (!currentModel) { return true; }       // 还没有当前模型：模型专属条目一律锁死
    for (i = 0; i < m.length; i++) { if (m[i] === currentModel) { return false; } }
    return true;
  }

  /* 第一次打开（或存的模型已经不在解析结果里）时按数据推断当前模型：
     哪个模型名下有开着的条目就是它；多个都有就取解析顺序里的第一个。 */
  function resolveCurrentModel(tree) {
    var cards = (tree && tree.modelTab && tree.modelTab.cards) || [], i, j, known = false, found = null;
    for (i = 0; i < cards.length; i++) { if (cards[i].emoji === currentModel) { known = true; } }
    if (known) { return false; }
    for (i = 0; i < cards.length; i++) {
      for (j = 0; j < (cards[i].items || []).length; j++) {
        var e = cards[i].items[j].entry || {};
        if (e.enabled !== false) { found = cards[i].emoji; break; }
      }
      if (found) { break; }
    }
    if (found === currentModel) { return false; }
    currentModel = found;
    return true;
  }

  /* 遍历面板模型里所有条目（含镜像的多份），syncModel / 闸门重画共用 */
  function eachItem(fn) {
    var i, j, k, t, list;
    for (i = 0; i < view.length; i++) {
      t = view[i];
      for (j = 0; j < (t.cards || []).length; j++) {
        list = t.cards[j].items || [];
        for (k = 0; k < list.length; k++) { fn(list[k]); }
      }
      list = t.own || [];
      for (k = 0; k < list.length; k++) { fn(list[k]); }
    }
  }

  function buildView(tree) {
    var out = [], i, j;
    for (i = 0; i < tree.tabs.length; i++) {
      var t = tree.tabs[i];
      if (t.kind === 'model') {
        var mcards = [], mk;
        for (mk = 0; mk < (t.cards || []).length; mk++) {
          var mc = t.cards[mk];
          var mitems = modelItemsOf(mc);
          mcards.push({
            key: 'model#' + mk, emoji: mc.emoji, label: mc.label, name: mc.name,
            mode: null, items: mitems, isModelCard: true
          });
        }
        out.push({
          key: 'model', title: t.displayName || '🤖 模型', special: 'model',
          legend: legendOf(tree), cards: mcards, own: [],
          models: mcards.map(function (c) { return { emoji: c.emoji, label: c.label }; })
        });
        continue;
      }
      /* 「🧩 设置变量」= 层级里带 ` | var` 变量的那个 tab */
      var special = (t.varEntries && t.varEntries.length) ? 'var' : null;
      if (special) {
        /* 这个层级里还有 2 条**不属任何卡片的独立条目**（🧩 清空变量 / 🧩 标签格式）：
           它们是实打实可开关的条目，照旧铺成一层网格（与其它 tab 的裸放条目同一套画法）。 */
        out.push({ key: 'T' + i, title: t.name, special: special, cards: varCardsOf(t), own: itemsOf(t.standaloneItems) });
        continue;
      }
      var cards = [];
      for (j = 0; j < t.cards.length; j++) {
        var c = t.cards[j];
        /* 卡片头自己的注释：解析器把它记在 region.cards[j].head 上（tabs 里的 cards 只留了
           headIdentifier）。注释查看要「卡片名后面挂 ⓘ」，就得把它带进面板模型。 */
        var hc = (t.region && t.region.cards && t.region.cards[j] && t.region.cards[j].head) || null;
        cards.push({ name: c.name, mode: c.mode, items: itemsOf(c.items), note: hc ? hc.commentFlat : null });
      }
      cards = cards.filter(function (c) { return c.items.length > 0; });
      var own = itemsOf(t.standaloneItems);
      /* 裸放条目（不属任何卡片的条目）就这样留在 tab 上，**不再自造一张叫「独立条目」的假卡片**
         把它们装起来（那张卡片是上一轮规则 15 的误伤逼出来的，规则 15 收窄后就不该存在）。 */
      out.push({ key: 'T' + i, title: t.name, special: special, cards: cards, own: own });
    }
    /* 「🤖 模型」tab 排到第一个（用户裁定：它是最常用的入口），其余 tab 的相对顺序不变 */
    for (i = 0; i < out.length; i++) {
      if (out[i].special === 'model') { out.unshift(out.splice(i, 1)[0]); break; }
    }
    /* 固定的最后一页：「ℹ️ 关于」（用户裁定）。它**不随预设结构变化**，永远排在最后，
       内容也与解析结果无关（版本信息 + 检查更新）。 */
    out.push(aboutTab());
    /* v0.6：「更新合并」裁决页（远程更新开着时才出现）。要**排在最前**——
       用户正等着完成一次更新，别让它在 tab 行最后一格里被淹没。 */
    if (mergeCtx) { out.unshift(mergeTab()); }
    return out;
  }

  /* 「更新合并」页的定义：只在 70 号传来计划时存在（openMergeReview 建 / 关掉撤）。
     它不依赖预设解析结果 —— 读不到预设时也要能出（裁决与解析是两回事，见 renderTabs）。 */
  function mergeTab() {
    return { key: 'MERGE', title: '🔀 更新合并', special: 'merge', cards: [], own: [] };
  }

  /* 「关于」页的定义：固定页，任何预设、任何解析结果下都在（连读不到预设时也建得出来）。 */
  function aboutTab() {
    return { key: 'ABOUT', title: 'ℹ️ 关于', special: 'about', cards: [], own: [] };
  }

  function counts(tab) {
    var n = 0, c = 0, i;
    for (i = 0; i < tab.cards.length; i++) { n += tab.cards[i].items.length; c++; }
    n += (tab.own ? tab.own.length : 0);   // 裸放条目也算面板上可点的条目
    return { cards: c, items: n };
  }

  function totalCounts() {
    var cards = 0, items = 0, i;
    for (i = 0; i < view.length; i++) {
      var c = counts(view[i]);
      cards += c.cards; items += c.items;
    }
    return { cards: cards, items: items, tabs: view.length, special: specialCount() };
  }
  function specialCount() {
    var n = 0, i;
    for (i = 0; i < view.length; i++) { if (view[i].special) { n++; } }
    return n;
  }

  /* ───────── 面板 ───────── */

  function mk(tag, cls, text) {
    var el = HDOC.createElement(tag);
    if (cls) { el.className = cls; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
  }
  function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  /* 兜底皮肤：皮肤管理没运行时面板就靠它（同一份 base.css，不手抄） */
  function injectCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var st = HDOC.createElement('style');
      st.id = CSS_ID;
      st.textContent = (typeof KAMI_BASE_CSS === 'string') ? KAMI_BASE_CSS : '';
      (HDOC.head || HDOC.documentElement).appendChild(st);
      log('已注入兜底皮肤 ' + st.textContent.length + 'B（皮肤管理暂未就绪，有皮肤时自动失效，不影响显示）');
    } catch (e) { log('注入兜底皮肤失败：' + ((e && e.message) || e)); }
  }
  function dropCss() {
    try {
      var st = HDOC.getElementById(CSS_ID);
      if (st && st.parentNode) { st.parentNode.removeChild(st); }
    } catch (e) { }
  }

  /* 面板该做成「贴底抽屉」还是「悬浮窗」：跟酒馆自己的单栏状态走
     （酒馆在 ≤1000px 把「把侧栏钉住」的小锁藏起来 = 进单栏；读不到控件就用同一个断点兜底）。
     与 30-皮肤管理.js 同一套判断，皮肤管理在跑时两边下的模式也一致。 */
  function tavernSingleColumn() {
    var any = false;
    try {
      var ids = ['lm_button_panel_pin_div', 'rm_button_panel_pin_div'];
      var view2 = HDOC.defaultView || HOST;
      for (var i = 0; i < ids.length; i++) {
        var el = HDOC.getElementById(ids[i]);
        if (!el) { continue; }
        any = true;
        if (view2.getComputedStyle(el).display !== 'none') { return false; }
      }
    } catch (e) { }
    if (any) { return true; }
    try { return !!(HOST.matchMedia && HOST.matchMedia('(max-width: 1000px)').matches); } catch (e) { return false; }
  }
  function sheetMode() { return tavernSingleColumn(); }

  function buildPanel() {
    if (panelRoot) { return; }
    panelRoot = mk('div', 'kami-root');
    panelRoot.id = PANEL_ID;
    panelRoot.setAttribute('data-kami-comp', 'panel');
    /* 舞台是「结构」：内联保证任何皮肤下都能摆面板；外观与摆法归皮肤（契约 §4.4） */
    panelRoot.style.position = 'fixed';
    panelRoot.style.inset = '0';
    panelRoot.style.zIndex = String(Z);
    panelRoot.style.pointerEvents = 'none';

    panelDrop = mk('div', 'kami-drop kami-surface');
    panelDrop.setAttribute('data-kami-open', '0');
    panelDrop.style.pointerEvents = 'auto';
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');

    var head = mk('div', 'kami-head');
    panelHead = head;
    head.setAttribute('data-kami-drag', '1');
    head.appendChild(mk('span', 'kami-dot'));
    head.appendChild(mk('span', 'kami-title', '🌟 预设设置'));
    var sub = mk('span', 'kami-sub');
    sub.setAttribute('data-kami-role', 'src');
    head.appendChild(sub);
    var acts = mk('span', 'kami-actions');
    var btnClose = mk('button', 'kami-icon-btn', '✕');
    btnClose.setAttribute('aria-label', '关闭');
    btnClose.setAttribute('data-kami-act', 'close');
    acts.appendChild(btnClose);
    head.appendChild(acts);
    panelDrop.appendChild(head);

    var tabs = mk('div', 'kami-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('data-kami-role', 'tabs');
    /* ② 「结构」不归皮肤：触屏在 tab 行上只允许横向手势（纵向手势留给页面），
       横向滑到头时不要让浏览器把它当成「后退」。 */
    tabs.style.touchAction = 'pan-x';
    tabs.style.overscrollBehaviorX = 'contain';
    panelDrop.appendChild(tabs);

    var foot = mk('div', 'kami-foot');
    var st = mk('span', 'kami-sub');
    st.setAttribute('data-kami-role', STATUS_ROLE);
    foot.appendChild(st);
    panelDrop.appendChild(foot);

    /* ① 缩放把手：贴右下角（照搬 30-皮肤管理.js:530-532 的那一枚）。
       外观由皮肤给（.kami-resize 在四套皮肤 + 兜底皮肤里都已经有规则），
       皮肤没给规则时也还能用：光标与命中区域最重要，画不画得出来是次要的。 */
    var rz = mk('span', 'kami-resize');
    rz.setAttribute('data-kami-act', 'resize');
    rz.setAttribute('aria-hidden', 'true');
    panelDrop.appendChild(rz);

    panelRoot.appendChild(panelDrop);
    HDOC.body.appendChild(panelRoot);

    injectCss();
    restoreGeometry();
    bindPanelEvents();
    log('面板已创建（' + (sheetMode() ? '窄屏抽屉' : '桌面悬浮窗') + '）');
  }

  function restoreGeometry() {
    if (!panelRoot || !panelDrop) { return; }
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');
    /* 窄屏抽屉的摆法由皮肤/兜底皮肤决定（贴底、78% 高），脚本不下发坐标 */
    if (sheetMode()) {
      panelRoot.style.removeProperty('--kami-panel-x');
      panelRoot.style.removeProperty('--kami-panel-y');
      panelRoot.style.removeProperty('--kami-panel-w');
      panelRoot.style.removeProperty('--kami-panel-h');
      return;
    }
    var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
    var w = clampNum(geom.w || PANEL_W, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - 24));
    var h = clampNum(geom.h || PANEL_H, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - 24));
    /* 存下来的坐标可能是在另一个宽度下拖的，一律按**当前**视口夹一次 */
    var x = (geom.x === null || geom.x === undefined) ? Math.max(12, (vw - w) / 2) : clampNum(geom.x, -40, Math.max(-40, vw - 80));
    var y = (geom.y === null || geom.y === undefined) ? 72 : clampNum(geom.y, 0, Math.max(0, vh - 48));
    panelRoot.style.setProperty('--kami-panel-w', Math.round(w) + 'px');
    panelRoot.style.setProperty('--kami-panel-h', Math.round(h) + 'px');
    panelRoot.style.setProperty('--kami-panel-x', Math.round(x) + 'px');
    panelRoot.style.setProperty('--kami-panel-y', Math.round(y) + 'px');
  }

  /* ── 面板事件（照搬 30-皮肤管理.js 的 pointer 分段结构：先判动作，再分派） ──

     一次 pointerdown 只归一种手势：
       · 标题栏（[data-kami-drag]）→ 移动面板            （仅悬浮窗）
       · .kami-resize[data-kami-act="resize"] → 缩放面板 （仅悬浮窗）
       · tab 行 → 横向拖动 tab 行                        （两种模式都有）
       · 正文滚动区 → 横向滑动切 tab / 抽屉下拉关闭       （见 bindSwipeEvents）
     拖动统一走 pointer 事件；正文滚动区另用 touch 事件，因为那里必须保留
     「纵向 = 正常滚动」的默认行为（pointer + preventDefault 会把它一起掐掉）。 */
  function bindPanelEvents() {
    panelDrop.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== panelDrop) {
        if (t.getAttribute) {
          /* 注释标记：只弹/收注释。⚠️ 条目卡整张就是开关，这里必须先掐断事件，
             否则同一次点击会接着翻掉开关（用户点名的坑）。 */
          if (t.getAttribute('data-kami-note-mark')) {
            ev.stopPropagation();
            ev.preventDefault();
            toggleNote(t);
            return;
          }
          /* 模型卡片头：整头就是「选中这个模型」（开它名下全部条目 + 关掉别的模型专属条目） */
          if (t.getAttribute('data-kami-model') && t.tagName === 'BUTTON') { selectModel(t.getAttribute('data-kami-model')); return; }
          /* ① 条目卡：整卡就是开关，点一下翻转（原生 button，Enter/Space 也会走到这里） */
          if (t.getAttribute('data-kami-item') && t.tagName === 'BUTTON') { toggleItem(t); return; }
          if (t.getAttribute('data-kami-tab')) { setTab(t.getAttribute('data-kami-tab')); return; }
          if (t.getAttribute('data-kami-act') === 'close') { setOpen(false); return; }
          /* 「关于」页的检查更新：调 70-远程更新.js 的全局 API（用户主动点 = force 一次真查） */
          if (t.getAttribute('data-kami-act') === 'check-update') { runUpdateCheck(t); return; }
          /* v0.6 「更新合并」页：一键选边 / 逐条选边 / 提交 */
          if (t.getAttribute('data-kami-act') === 'merge-all-mine') { setMergeAll('mine'); return; }
          if (t.getAttribute('data-kami-act') === 'merge-all-next') { setMergeAll('next'); return; }
          if (t.getAttribute('data-kami-act') === 'merge-apply') { applyMergeReview(); return; }
          if (t.getAttribute('data-kami-choice')) { setMergeChoice(t, t.getAttribute('data-kami-choice')); return; }
        }
        t = t.parentNode;
      }
    });

    /* 变量数字框：原生 change（失焦 / 回车都会来）就写回预设；回车另外掐一下，
       免得在数字框里按回车被酒馆的全局快捷键接走。 */
    panelDrop.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-kami-var')) { applyVar(t); }
    });
    panelDrop.addEventListener('keydown', function (ev) {
      /* 契约 §4.4 硬规则 1：注释标记与预设面板逐属性同构 → 键盘也必须同构。
         50-引导.js:731-733 认 Enter 与 Space，这里原来只认 Enter，按 Space 什么都不发生
         （还会顺带滚一下页面）。两个 keyCode 是给老引擎的兜底。 */
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar' && ev.keyCode !== 13 && ev.keyCode !== 32) { return; }
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute('data-kami-var')) { ev.preventDefault(); applyVar(t); }
      else if (t && t.getAttribute && t.getAttribute('data-kami-note-mark')) { ev.preventDefault(); toggleNote(t); }
    });

    var drag = null;
    panelDrop.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === 'mouse') { return; }
      var t = ev.target, mode = null;
      while (t && t !== panelDrop) {
        if (t.getAttribute) {
          if (t.getAttribute('data-kami-drag')) { mode = 'move'; break; }
          if (t.getAttribute('data-kami-act') === 'resize') { mode = 'size'; break; }
          if (t.getAttribute('data-kami-role') === 'tabs') { mode = 'tabs'; break; }
        }
        t = t.parentNode;
      }
      if (!mode) { return; }
      /* 悬浮窗专属手势：抽屉下不移动、不缩放（与皮肤管理面板一致） */
      if (sheetMode() && (mode === 'move' || mode === 'size')) { return; }
      /* 标题栏里的按钮（关闭）不参与拖动 */
      if (mode === 'move' && ev.target.closest && ev.target.closest('button')) { return; }
      var r = panelDrop.getBoundingClientRect();
      drag = { mode: mode, sx: ev.clientX, sy: ev.clientY, l: r.left, t: r.top, w: r.width, h: r.height, moved: 0 };
      if (mode === 'tabs') {
        drag.scroll0 = tabsEl() ? tabsEl().scrollLeft : 0;
        /* 记下**真正被按下的那一枚 tab**（点在 tab 行空白处就是 null）。
           下面那行 setPointerCapture 一执行，浏览器就会把随后一串兼容鼠标事件
           （mousedown / mouseup / click）的 target 改到 panelDrop 上，于是 click 委托里
           「从 ev.target 往上爬找 data-kami-tab」那条路永远匹配不上 ——
           **PC 上用鼠标点 tab 页没反应，根因就是这一行**（触屏的合成 click 不走这条捕获链，
           所以手机上一直是好的）。pointerup 里按这里记下的键补一次切换，见那边。 */
        drag.tabKey = tabKeyOf(ev.target);
      }
      try { panelDrop.setPointerCapture(ev.pointerId); } catch (e) { }
      /* tab 行的 pointerdown 不 preventDefault：否则触屏的原生横滑也没了 */
      if (mode !== 'tabs') { ev.preventDefault(); }
    });
    panelDrop.addEventListener('pointermove', function (ev) {
      if (!drag) { return; }
      var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
      if (drag.mode === 'move') {
        geom.x = Math.round(clampNum(drag.l + dx, -40, Math.max(-40, vw - 80)));
        geom.y = Math.round(clampNum(drag.t + dy, 0, Math.max(0, vh - 48)));
        panelRoot.style.setProperty('--kami-panel-x', geom.x + 'px');
        panelRoot.style.setProperty('--kami-panel-y', geom.y + 'px');
      } else if (drag.mode === 'size') {
        /* ① 缩放：宽高一起夹取（下限 PANEL_MIN_*，上限当前视口 - 24），实时写令牌 */
        geom.w = Math.round(clampNum(drag.w + dx, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - 24)));
        geom.h = Math.round(clampNum(drag.h + dy, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - 24)));
        panelRoot.style.setProperty('--kami-panel-w', geom.w + 'px');
        panelRoot.style.setProperty('--kami-panel-h', geom.h + 'px');
      } else if (drag.mode === 'tabs') {
        /* ② 按住拖动 tab 行：拖多少滚多少（反过来拖也生效） */
        var bar = tabsEl();
        if (bar) { bar.scrollLeft = drag.scroll0 - dx; }
        if (drag.moved > TAP_SLOP && ev.cancelable) { ev.preventDefault(); }
      }
    });
    panelDrop.addEventListener('pointerup', function (ev) {
      var was = drag ? drag.mode : null;
      /* PC 鼠标点 tab 页：click 的 target 已经被指针捕获改到 panelDrop（原因见 pointerdown 里
         那段说明），click 委托匹配不到 data-kami-tab，所以在这里按 pointerdown 记下的那一枚
         补一次切换。判据是「按下后基本没动」（容差 TAP_SLOP）——按住拖动 tab 行仍旧只横向滚，
         不会误切。触屏不补：它的合成 click 目标是对的，交给上面的 click 委托就行。 */
      if (drag && was === 'tabs' && drag.tabKey && drag.moved <= TAP_SLOP && ev.pointerType !== 'touch') {
        setTab(drag.tabKey);
      }
      if (drag && (was === 'move' || was === 'size')) { saveVars(); }
      drag = null;
      try { panelDrop.releasePointerCapture(ev.pointerId); } catch (e) { }
    });
    panelDrop.addEventListener('pointercancel', function () {
      if (drag && (drag.mode === 'move' || drag.mode === 'size')) { saveVars(); }
      drag = null;
    });

    /* ② 滚轮：纵向滚轮在 tab 行上转成横向滚动（浏览器默认不会这么做）。
       只有 tab 行真的滚得动时才 preventDefault，否则把滚动还给页面。 */
    panelDrop.addEventListener('wheel', function (ev) {
      var bar = tabsEl();
      if (!bar || !bar.contains(ev.target)) { return; }
      if (bar.scrollWidth - bar.clientWidth <= 1) { return; }
      var d = (ev.deltaX !== 0 && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) ? ev.deltaX : ev.deltaY;
      if (!d) { return; }
      var before = bar.scrollLeft;
      try { bar.scrollLeft = before + d; } catch (e) { }
      var ok = bar.scrollLeft !== before;
      if (!ok) {
        /* 老 Safari 那边 scrollLeft 写不动的话退到 scrollBy；两个都不行就放行让页面自己滚 */
        try { bar.scrollBy(d, 0); } catch (e2) { }
        ok = bar.scrollLeft !== before;
      }
      if (ok && ev.cancelable) { ev.preventDefault(); }
    }, { passive: false });

    /* 面板手势（共享模块，见文件上方内联的那一份）。
       原来是本脚本自己一份 bindTouchGestures：只有「内容区滚到顶下拉收回」和
       「左右滑切 tab」，标题栏下拉收回缺一块。现在换成共享模块，三种手势齐了，
       而且与皮肤管理面板逐条一致（阈值、方向判定、鼠标/触屏分工）。 */
    if (GESTURES) { try { GESTURES.destroy(); } catch (e) { } }
    GESTURES = bindPanelGestures({
      root: panelDrop,
      handle: function () { return panelHead; },
      pane: function () { return paneEl(tabKey); },
      tabs: tabsEl,
      isSheet: sheetMode,
      onClose: function () { setOpen(false); },
      onStep: stepTab
    });
  }

  function tabsEl() { return panelDrop ? panelDrop.querySelector('[data-kami-role="tabs"]') : null; }
  /* 起点元素属于哪一枚 tab：落在 tab 按钮上就返回它的 data-kami-tab，落在 tab 行空白处返回 null。
     指针捕获会改掉随后 click 的 target，所以「真正点了哪一枚」只能在 pointerdown 时问一次。 */
  function tabKeyOf(node) {
    try {
      var el = (node && node.closest) ? node.closest('[data-kami-tab]') : null;
      return el ? el.getAttribute('data-kami-tab') : null;
    } catch (e) { return null; }
  }
  function paneEls() { return panelDrop ? panelDrop.querySelectorAll('[data-kami-pane]') : []; }
  function paneEl(k) { return panelDrop ? panelDrop.querySelector('[data-kami-pane="' + k + '"]') : null; }

  /* 画一枚 tab 与它对应的页面板（两处都要用：正常路径与「读不到预设」路径）。
     页面板一律插在 .kami-foot 之前，顺序与 view 一致。 */
  function appendTab(bar, foot, tab) {
    var btn = mk('button', 'kami-tab', tab.title);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('data-kami-tab', tab.key);
    btn.setAttribute('aria-selected', 'false');
    bar.appendChild(btn);
    var pane = mk('div', 'kami-body kami-scroll');
    pane.setAttribute('data-kami-pane', tab.key);
    pane.hidden = true;
    renderTab(pane, tab);
    panelDrop.insertBefore(pane, foot);
  }

  /* 重建 tab 轨道与每一页（数据变了就整体重画；tab 数量级很小） */
  function renderTabs() {
    if (!panelDrop) { return; }
    var bar = tabsEl();
    if (!bar) { return; }
    bar.textContent = '';
    var panes = paneEls(), i;
    for (i = 0; i < panes.length; i++) {
      if (panes[i].parentNode) { panes[i].parentNode.removeChild(panes[i]); }
    }
    cardMap = {};

    var foot0 = panelDrop.querySelector('.kami-foot');
    /* 出错 / 解析不出来：面板照常打开，但只有一页人话说明，不白屏。
       「关于」页照旧排在最后 —— 三个版本读数与检查更新都不依赖预设能不能解析。 */
    if (!liveData || !liveData.ok) {
      var msg = (liveData && liveData.error) ? liveData.error : '读不到当前预设';
      view = [
        { key: 'ERR', title: '读不到预设', special: 'err', error: msg, cards: [], own: [] },
        aboutTab()
      ];
      /* 「更新合并」页不依赖解析结果：正在裁决时也要在（裁决的是预设文件之间的合并，
         不是实时面板那条读数链路） */
      if (mergeCtx) { view.unshift(mergeTab()); }
      /* 合并页在最前就把它选中（refresh(true) 会带着它走，这里补 tabKey 语义） */
      if (view[0].key === 'MERGE') { tabKey = 'MERGE'; }
      for (i = 0; i < view.length; i++) { appendTab(bar, foot0, view[i]); }
      tabKey = 'ERR';
      applyTab();
      renderStatus();
      return;
    }

    view = buildView(liveData.tree);
    for (i = 0; i < view.length; i++) { appendTab(bar, foot0, view[i]); }
    if (!view.length) {
      var pane2 = mk('div', 'kami-body kami-scroll');
      pane2.setAttribute('data-kami-pane', 'ERR');
      pane2.appendChild(mk('div', 'kami-empty', '这份预设里没有任何可显示的层级（没有卡片、也没有变量条目）。'));
      panelDrop.insertBefore(pane2, foot0);
      tabKey = 'ERR';
      renderStatus();
      return;
    }
    if (!tabKey || !paneEl(tabKey)) { tabKey = view[0].key; }
    var ok = false;
    for (i = 0; i < view.length; i++) { if (view[i].key === tabKey) { ok = true; } }
    if (!ok) { tabKey = view[0].key; }
    applyTab();
    renderStatus();
  }

  function applyTab() {
    var btns = panelDrop.querySelectorAll('.kami-tab'), i;
    for (i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-selected', btns[i].getAttribute('data-kami-tab') === tabKey ? 'true' : 'false');
    }
    var panes = paneEls();
    for (i = 0; i < panes.length; i++) {
      panes[i].hidden = panes[i].getAttribute('data-kami-pane') !== tabKey;
    }
    scrollTabIntoView(tabKey);
  }

  function setTab(k) {
    tabKey = k;
    applyTab();
    renderStatus();
  }

  /* ③ 滑动的落点：按**当前画出来的 tab 顺序**往上/下一个。
     没有下一个时就停在原地（不循环，免得滑一下跳回开头让人懵）。 */
  function stepTab(dir) {
    var i, at = -1;
    for (i = 0; i < view.length; i++) { if (view[i].key === tabKey) { at = i; } }
    if (at < 0) { return; }
    var n = at + dir;
    if (n < 0 || n >= view.length) { return; }
    setTab(view[n].key);
  }

  /* tab 行放不下时把选中的那一枚滚进视野（滑动切 tab 之后用得上）。
     ② 关键：**只在真的看不见时才动 scrollLeft** —— 否则用户自己滚出来/拖出来的位置
     会被下一次 applyTab 一把拉回 0（这就是「轮滚不动」的真根因）。 */
  function scrollTabIntoView(k) {
    var bar = tabsEl();
    if (!bar) { return; }
    var btn = bar.querySelector('[data-kami-tab="' + k + '"]');
    if (!btn) { return; }
    if (bar.scrollWidth - bar.clientWidth <= 1) { return; }
    var left = btn.offsetLeft, right = left + btn.offsetWidth;
    if (left < bar.scrollLeft) { bar.scrollLeft = left - 4; }
    else if (right > bar.scrollLeft + bar.clientWidth) { bar.scrollLeft = right - bar.clientWidth + 4; }
  }

  function renderTab(pane, tab) {
    pane.textContent = '';
    if (tab.special === 'model') { renderModelTab(pane, tab); return; }
    if (tab.special === 'var') { renderVarTab(pane, tab); return; }
    if (tab.special === 'about') { renderAboutTab(pane, tab); return; }
    if (tab.special === 'merge') { renderMergeTab(pane, tab); return; }
    if (tab.special === 'err') {
      pane.appendChild(mk('div', 'kami-empty', (tab.error || '读不到当前预设') +
        '。请确认酒馆页面里的 SillyTavern.getContext() 可用，然后重新打开本面板。'));
      return;
    }
    var drawn = 0, i;
    for (i = 0; i < tab.cards.length; i++) { pane.appendChild(cardEl(tab, tab.cards[i], i)); drawn++; }
    /* 不属任何卡片的裸放条目：直接铺一层网格，不套假卡片 */
    if (tab.own && tab.own.length) {
      pane.appendChild(itemsGrid(tab.own, { mode: null }, tab.key + '#own'));
      drawn++;
    }
    if (!drawn) {
      pane.appendChild(mk('div', 'kami-empty', '这个层级里没有可开关的条目（卡片都在解析时降级了）。'));
    }
  }

  /* 一张卡片组：卡片头（名字 + 计数 + 单选/任选）+ 卡片体里一层条目网格 */
  function cardEl(tab, card, index) {
    var key = tab.key + '#' + index;
    var box = mk('div', 'kami-card');
    box.setAttribute('data-kami-card-key', key);
    var head = mk('div', 'kami-card-head');
    head.appendChild(mk('span', 'kami-card-title', card.name));
    head.appendChild(mk('span', 'kami-chip', card.items.length + ' 条'));
    /* 「 选一」的卡片给出「单选」语义的视觉区分（不新增契约里没有的类名） */
    if (card.mode === '单选') { head.appendChild(mk('span', 'kami-chip', '单选')); }
    else if (card.mode === '多选') { head.appendChild(mk('span', 'kami-chip', '任选')); }
    /* 注释标记：挂在卡片名后面（卡片头不是开关，点了不会翻任何东西） */
    var mark = noteMark(card.note);
    if (mark) { head.appendChild(mark); }
    box.appendChild(head);
    var txt = noteText(card.note);
    if (txt) { box.appendChild(txt); }
    var body = mk('div', 'kami-card-body');
    body.appendChild(itemsGrid(card.items, card, key));
    box.appendChild(body);
    cardMap[key] = { tabKey: tab.key, items: card.items };
    return box;
  }

  /* 条目网格 = 共享模块的 buildItemsGrid（src/scripts/_preset-cards.js）：
     div.kami-grid 里一排 button.kami-item.kami-card，结构只有一份实现。
     lock 用面板自己的模型闸门（非当前模型的专属条目原生 disabled 锁死）。 */
  function itemsGrid(items, card, cardKey) {
    return buildItemsGrid(HDOC, items, { key: cardKey, mode: card ? card.mode : null }, { lock: isLockedItem });
  }

  /* 「🤖 模型」tab：顶部图例（不可开关）+ 一个模型一张卡片（卡片头 = 选中这个模型）。
     条目是**镜像**：同一条也留在它原本所属的卡片里（两处是同一个开关）。 */
  function renderModelTab(pane, tab) {
    if (tab.legend) {
      var box = mk('div', 'kami-card');
      var lgHead = mk('div', 'kami-card-head');
      lgHead.appendChild(mk('span', 'kami-card-title', '模型切换说明'));
      box.appendChild(lgHead);
      box.appendChild(mk('div', 'kami-card-body', tab.legend));
      pane.appendChild(box);
    }
    var i;
    for (i = 0; i < tab.cards.length; i++) { pane.appendChild(modelCardEl(tab, tab.cards[i])); }
    if (!tab.cards.length) {
      pane.appendChild(mk('div', 'kami-empty', '这份预设里没有登记任何模型（📋 支持模型列表 | model 是空的）。'));
    }
  }

  /* 一张模型卡片：整张卡由共享模块的 buildModelCard 建（src/scripts/_preset-cards.js），
     结构 = div.kami-card + 可点卡头 button.kami-card-head.kami-btn--ghost（含「当前」小标签）
     + 卡内 .kami-card-body > .kami-grid 的条目卡。引导面板的模型页调的是同一个函数。
     这里只补面板自己的登记：cardMap 记下这张卡里有哪些条目（单选联动要用）。 */
  function modelCardEl(tab, card) {
    var box = buildModelCard(HDOC, card, currentModel, { cardKey: card.key, lock: isLockedItem });
    cardMap[card.key] = { tabKey: tab.key, items: card.items };
    return box;
  }

  /* 条目卡本体、角标（emoji 摘取）、ⓘ 标记、注释外包层的结构**全部在共享模块里**：
     src/scripts/_preset-cards.js（构建期内联，见文件头的 buildItemsGrid / buildItemCard）。
     引导面板的模型页用的是同一份 —— 同一颗卡片在两块面板里不会再各写一套（契约 §4.4）。 */

  /* ── 注释查看（用户裁定：不是角标，挂名字后面；没有注释就什么都别显示） ──
     做法：
       · 标记 = 名字后面一枚 ⓘ，占一格的宽度（.kami-card-note 是契约 §4.2 已登记的类名，
         用 data-kami-note-mark 与展开出来的正文区分，不新增类名）；
       · 没有注释的条目/卡片**一枚记号都不加**（不显示成灰色不可点，免得用户困惑）；
       · 结构 = **条目名（卡本体）作标题栏，注释正文是标题栏下方那个独立容器**：条目卡外面
         包一层 .kami-item-note（契约 §4.2 已登记），正文不再是按钮的一部分；卡片组 / 变量卡
         则放在卡片头与正文之间。四套皮肤对 .kami-card-head 与 .kami-card-note 都各自有样式，
         正文容器直接用现成的 .kami-card-note；
       · 展开/收起只切 hidden 属性，容器始终留在 DOM 里（契约 §4.3）；
       · ⚠️ 条目卡整张就是一个开关：标记的 click 必须 stopPropagation + preventDefault，
         否则注释一弹出来的同时开关也被翻掉。卡片头不是开关，没有这个坑。 */
  /* 标记与正文的结构在共享模块里（noteMarkEl / noteBoxEl）：契约 §4.4 硬规则 1 要求
     「ⓘ 与预设面板逐属性同构」，那就只有一份实现，两个函数只负责把 HDOC 传进去。 */
  function noteMark(note) { return noteMarkEl(HDOC, note); }
  function noteText(note) { return noteBoxEl(HDOC, note); }
  /* 点标记：只切它所在那一组里的注释正文，别的一律不动（也不重画面板） */
  function toggleNote(el) {
    /* 注释正文有两个落点：条目卡外面包的那一层 `.kami-item-note` 里（标题栏下方），
       以及卡片组 / 变量卡的 `.kami-card` 里（卡片头下面、正文上面）。两种都认。 */
    var host = null;
    try {
      if (el.closest) { host = el.closest('.kami-item-note') || el.closest('.kami-card'); }
    } catch (e) { }
    if (!host) { return; }
    var txt = host.querySelector('[data-kami-note]');
    if (!txt) { return; }
    var open = txt.hasAttribute('hidden');
    if (open) { txt.removeAttribute('hidden'); } else { txt.setAttribute('hidden', 'hidden'); }
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.setAttribute('aria-label', open ? '收起注释' : '查看注释');
  }

  /* 「🧩 设置变量」tab：一张变量卡 = 卡片头（条目名 + 数字/范围 + 有注释才有的 ⓘ）+ 一个数字框。
     范围卡是两个数字框（_min / _max 一对），填反了自动交换（用户裁定）。 */
  function renderVarTab(pane, tab) {
    var i, drawn = 0;
    for (i = 0; i < tab.cards.length; i++) { pane.appendChild(varCardEl(tab, tab.cards[i])); drawn++; }
    /* 裸放条目（不属任何卡片的那 2 条）照常铺网格：在别的 tab 里它们也是这么画的 */
    if (tab.own && tab.own.length) {
      pane.appendChild(itemsGrid(tab.own, { mode: null }, tab.key + '#own'));
      drawn++;
    }
    if (!drawn) {
      pane.appendChild(mk('div', 'kami-empty', '这个层级里没有可设置的数字变量（变量的值必须是一串纯数字）。'));
    }
  }

  function varCardEl(tab, card) {
    var box = mk('div', 'kami-card');
    box.setAttribute('data-kami-card-key', card.key);
    box.setAttribute('data-kami-var-card', card.key);
    var head = mk('div', 'kami-card-head');
    head.appendChild(mk('span', 'kami-card-title', card.name));
    head.appendChild(mk('span', 'kami-chip', card.kind === 'range' ? '范围' : '数字'));
    if (card.multi) { head.appendChild(mk('span', 'kami-chip', card.label)); }
    var mark = noteMark(card.note);
    if (mark) { head.appendChild(mark); }
    box.appendChild(head);
    var txt = noteText(card.note);
    if (txt) { box.appendChild(txt); }
    var body = mk('div', 'kami-card-body');
    var field = mk('div', 'kami-field');
    field.appendChild(mk('span', 'kami-field-label', card.label));
    var val = mk('span', 'kami-field-value');
    for (var i = 0; i < card.vars.length; i++) {
      if (i > 0) { val.appendChild(mk('span', 'kami-card-note', '–')); }
      val.appendChild(varInput(card.vars[i], card.entry));
    }
    field.appendChild(val);
    body.appendChild(field);
    box.appendChild(body);
    return box;
  }

  /* 一个变量 = 一个原生数字输入框（.kami-number 是契约 §4.2 已登记的类名）。
     data-kami-old 记着**当前预设里的值**：只有真的变了才写、才保存（与开关一样的幂等口径）。 */
  function varInput(v, entry) {
    var inp = mk('input', 'kami-number');
    inp.type = 'number';
    inp.setAttribute('min', '0');
    inp.setAttribute('step', '1');
    inp.value = v.value;
    inp.setAttribute('data-kami-var', v.name);
    inp.setAttribute('data-kami-entry', entry || '');
    inp.setAttribute('data-kami-old', v.value);
    inp.setAttribute('aria-label', v.name);
    return inp;
  }

  /* ───────── 「🔀 更新合并」页（v0.6；远程更新 v1.4 的三方合并裁决） ─────────
     数据（plan）由 70 号算好带进来：{ degraded, stats, conflicts:[{key,kind,id,name,fields}] }。
     本页只做三件事：列出待裁决项（每项一张卡）、一键选边、提交 onApply(plan)。
     不内联合并引擎 —— 计算、备份、写盘都在 70 号那边。
     类名只用契约已登记的（卡片 / 字段行 / 分段切换 / 按钮），不新增皮肤类名。 */

  function mergeKindLabel(kind) {
    return { prompt: '两边都改过', delete: '删除与新版改动撞了', order: '排列两边都调过',
      regex: '正则两边都改过' }[kind] || '两边都改过';
  }

  /* 一张待裁决卡：条目名 + 「改了什么」+ 二选一分段（默认保留我的）。
     update-plan 后只就地配料（paintMergeCard），不重画整页。 */
  function mergeCardEl(c) {
    var box = mk('div', 'kami-card');
    box.setAttribute('data-kami-conflict', c.key);
    var head = mk('div', 'kami-card-head');
    head.appendChild(mk('span', 'kami-card-title', c.name || c.id));
    head.appendChild(mk('span', 'kami-chip', mergeKindLabel(c.kind)));
    box.appendChild(head);
    var body = mk('div', 'kami-card-body');
    var fs = (c.fields && c.fields.length) ? c.fields.join('、') : '';
    if (fs) { body.appendChild(mk('div', 'kami-card-note', '改了：' + fs)); }
    var seg = mk('div', 'kami-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', c.name || c.id);
    var opts = [['mine', '保留我的'], ['next', '用新版']];
    for (var i = 0; i < opts.length; i++) {
      var choice = (c.choice || 'mine') === opts[i][0];
      var btn = mk('button', 'kami-seg-item' + (choice ? ' is-on' : ''), opts[i][1]);
      btn.type = 'button';
      btn.setAttribute('data-kami-choice', opts[i][0]);
      btn.setAttribute('aria-pressed', choice ? 'true' : 'false');
      seg.appendChild(btn);
    }
    body.appendChild(seg);
    box.appendChild(body);
    return box;
  }

  function renderMergeTab(pane) {
    var plan = mergeCtx ? mergeCtx.plan : null;
    if (!plan) {
      pane.appendChild(mk('div', 'kami-empty', '现在没有进行中的合并。'));
      return;
    }
    /* 摘要卡：这一版从哪儿来、要裁决多少项、怎么选全说清 */
    var box = mk('div', 'kami-card');
    var head = mk('div', 'kami-card-head');
    head.appendChild(mk('span', 'kami-card-title', '合并到新版本'));
    if (plan.degraded) { head.appendChild(mk('span', 'kami-chip', '旧版认不出')); }
    box.appendChild(head);
    var body = mk('div', 'kami-card-body',
      '要你裁决的差异 ' + plan.conflicts.length + ' 项。每一项二选一：保留我的 / 用新版。' +
      '没有列进来的（开关、采样参数、脚本设置、正则开关、新增/删除的条目）一律以你现在' +
      '的预设为准，不会被新版覆盖。' + (plan.degraded ? '（你的旧版认不出来，所有差异都当成' +
      '「两边都改过」处理，宁可少更新也不动你的东西。）' : ''));
    box.appendChild(body);
    pane.appendChild(box);
    /* 顶部一键按钮 */
    var bar = mk('div', 'kami-card');
    var barBody = mk('div', 'kami-card-body');
    var row = mk('div', 'kami-field');
    row.appendChild(mk('span', 'kami-field-label', '一键'));
    var vals = mk('span', 'kami-field-value');
    var bMine = mk('button', 'kami-btn', '全部保留我的');
    bMine.type = 'button'; bMine.setAttribute('data-kami-act', 'merge-all-mine');
    var bNext = mk('button', 'kami-btn', '全部用新版');
    bNext.type = 'button'; bNext.setAttribute('data-kami-act', 'merge-all-next');
    vals.appendChild(bMine);
    vals.appendChild(bNext);
    row.appendChild(vals);
    barBody.appendChild(row);
    bar.appendChild(barBody);
    pane.appendChild(bar);
    /* 待裁决清单（正文区自己滚，几十条也能滑） */
    for (var i = 0; i < plan.conflicts.length; i++) { pane.appendChild(mergeCardEl(plan.conflicts[i])); }
    if (!plan.conflicts.length) {
      pane.appendChild(mk('div', 'kami-empty', '没有需要你裁决的差异 —— 其余全部自动按口径合并。'));
    }
    /* 底部提交 */
    var foot = mk('div', 'kami-card');
    var footBody = mk('div', 'kami-card-body');
    var row2 = mk('div', 'kami-field');
    var vals2 = mk('span', 'kami-field-value');
    var bApply = mk('button', 'kami-btn kami-btn--primary', '应用并完成更新');
    bApply.type = 'button'; bApply.setAttribute('data-kami-act', 'merge-apply');
    vals2.appendChild(bApply);
    row2.appendChild(mk('span', 'kami-field-label', '确认'));
    row2.appendChild(vals2);
    footBody.appendChild(row2);
    foot.appendChild(footBody);
    pane.appendChild(foot);
  }

  /* 找计划里一枚冲突项的现状（就地刷新时按 key 找） */
  function mergePlanOf() { return mergeCtx ? mergeCtx.plan : null; }
  function mergeConflictAt(key) {
    var plan = mergePlanOf();
    if (!plan) { return null; }
    for (var i = 0; i < plan.conflicts.length; i++) {
      if (plan.conflicts[i].key === key) { return plan.conflicts[i]; }
    }
    return null;
  }

  /* 点一枚分段：改 plan 里那一项的 choice → 只重画这一张卡（不重画整页，不丢滚动位置） */
  function setMergeChoice(btn, val) {
    var plan = mergePlanOf();
    if (!btn) { return; }
    var card = btn.closest ? btn.closest('[data-kami-conflict]') : null;
    if (!card) { return; }
    var c = mergeConflictAt(card.getAttribute('data-kami-conflict'));
    if (!c) { return; }
    if (mergeCtx) { c.choice = val; }
    paintMergeCard(card);
    log('合并裁决「' + (c.name || c.id) + '」→ ' + (val === 'next' ? '用新版' : '保留我的'));
  }

  function paintMergeCard(card) {
    var plan = mergePlanOf();
    if (!card || !plan) { return; }
    var c = mergeConflictAt(card.getAttribute('data-kami-conflict'));
    if (!c) { return; }
    var choice = (c.choice || 'mine');
    var items = card.querySelectorAll('[data-kami-choice]');
    for (var i = 0; i < items.length; i++) {
      var on = items[i].getAttribute('data-kami-choice') === choice;
      items[i].classList.toggle('is-on', on);
      items[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function paintMergeAll() {
    if (!panelRoot) { return; }
    var cards = panelRoot.querySelectorAll('[data-kami-conflict]');
    for (var i = 0; i < cards.length; i++) { paintMergeCard(cards[i]); }
  }

  /* 一键全保留 / 全覆盖：改 plan 里的 choice + 就地重画所有卡 */
  function setMergeAll(val) {
    var plan = mergePlanOf();
    if (!plan) { return; }
    for (var i = 0; i < plan.conflicts.length; i++) { plan.conflicts[i].choice = val; }
    paintMergeAll();
    log('一键裁决：' + (val === 'next' ? '全部用新版' : '全部保留我的') + '（' + plan.conflicts.length + ' 处）');
  }

  /* 应用并完成更新：把决定交回 70 号（合并、备份、写盘都在那边），然后收掉这一页。 */
  function applyMergeReview() {
    var ctxNow = mergeCtx;
    if (!ctxNow) { return; }
    mergeCtx = null;    // 先清：onApply 里若再开面板 / 关面板都会重画
    try { if (typeof ctxNow.onApply === 'function') { ctxNow.onApply(ctxNow.plan); } } catch (e) {
      log('裁决回调出错（合并流程那边的日志为准）：' + ((e && e.message) || e));
    }
    refresh(true);
    setOpen(false);
  }

  /* ──────────────────────── v0.6 的 API：openMergeReview ─────────────────────
     打开「更新合并」页。面板本来没建就建；建不好（异常）返回 false 让 70 号退化。
     页面排在 tab 最前。裁决完成 / 应用后关闭；用户点 ✕ = 放弃（onApply(null)）。 */
  function openMergeReview(plan, onApply) {
    if (disposed) { return false; }
    if (!plan || !Array.isArray(plan.conflicts) || typeof onApply !== 'function') { return false; }
    var old = mergeCtx;
    mergeCtx = { plan: plan, onApply: onApply };
    try {
      if (!panelRoot) { buildPanel(); }
      refresh(true);
      if (!paneEl('MERGE')) { mergeCtx = old || null; return false; }
      tabKey = 'MERGE';
      applyTab();
      renderStatus();
      setOpen(true);
      log('「更新合并」裁决页已打开：待裁决 ' + plan.conflicts.length + ' 项' +
        (plan.degraded ? '（旧版认不出，退化模式）' : ''));
      return true;
    } catch (e) {
      log('打开裁决页失败：' + ((e && e.message) || e));
      mergeCtx = old || null;
      return false;
    }
  }

  /* ───────── 「ℹ️ 关于」页（固定的最后一页） ─────────

     三个版本读数各有来源与兜底，**任何一条读不到都只显示「读不到」，绝不假装**：

       · 酒馆本体  酒馆助手把整个 API 注入了脚本 iframe（JS-Slash-Runner 的
                   src/iframe/predefine.js:12-18 把 window.parent 上的 TavernHelper 合并进本窗口），
                   所以 getTavernVersion() 是**本窗口的全局函数**、同步返回字符串。
                   兜底：酒馆页面上的 #version_display 文本（酒馆自己写的 "SillyTavern 1.18.0"，
                   见 public/script.js 的 getCurrentVersion）。
       · 酒馆助手  getTavernHelperVersion()（同一个注入通道）；再兜底 HOST.TavernHelper 上的同名方法。
       · 预设本体  当前预设名里解析出的版本 ＋ 构建时注入的产物号（BUILD_N）做交叉核对。
                   名字认不出编号时只显示产物号。

     检查更新调 70-远程更新.js 的全局 API KamiUpdate.check(true)：force=true 才会忽略
     「拒绝过 / 已写入」的记录 —— 用户主动点的按钮必须是真查一次。那个脚本没在运行时
     按钮照样点得动，只把一句人话写进结果行（不把按钮做成点不动，用户会犯懵）。 */

  /* 本窗口 → 宿主窗口 → 宿主上的 TavernHelper，三层找一个函数并调用它（找不到/抛错都返回空串） */
  function callGlobal(name) {
    var f = null;
    try { if (typeof window[name] === 'function') { f = window[name]; } } catch (e) { }
    if (!f) { try { if (HOST && typeof HOST[name] === 'function') { f = HOST[name]; } } catch (e) { } }
    if (!f) {
      try { if (HOST && HOST.TavernHelper && typeof HOST.TavernHelper[name] === 'function') { f = HOST.TavernHelper[name]; } } catch (e) { }
    }
    if (!f) { return ''; }
    try { return cleanName(f()); } catch (e) { return ''; }
  }

  function tavernVersionText() {
    var v = callGlobal('getTavernVersion');
    if (v) { return /^sillytavern/i.test(v) ? v : ('SillyTavern ' + v); }
    try {
      var el = HDOC.getElementById('version_display');
      var t = el ? cleanName(el.textContent) : '';
      if (t) { return t; }
    } catch (e) { }
    return '';
  }

  /* 预设版本：从预设名里认**正式命名**（现行 kami-v0.90-113-20260923，曾用 卡密预设v0.90-102-20260922）。
     认不出返回 null。
     ⚠️ 与 70-远程更新.js 的 parseVersion 是同一套命名规则的两份实现：那边管「比大小」，
     这份只管「显示」。不共用是为了让面板不依赖那个脚本是否在运行（它可能被用户关掉）。 */
  function presetVersionOf(name) {
    var s = cleanName(name);
    var m = /(?:kami-|卡密预设)v(\d+)\.(\d+)-(\d+)-(\d{8})/i.exec(s);
    if (m) { return { label: 'v' + m[1] + '.' + m[2] + '-' + m[3], date: m[4], build: +m[3] }; }
    /* 旧命名也认（用户盘上还留着旧产物）：卡密预设0.9-97 / 卡密预设0.9-260917-97 */
    m = /(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d+)(?:\D|$)/i.exec(s);
    if (m) { return { label: 'v0.9-' + m[1], date: '', build: +m[1] }; }
    return null;
  }

  /* 当前预设名：先问酒馆（与写盘用的是同一套四层兜底），再退回预设文件里的 name 字段。
     预设文件里的 name 是**构建时写进去的产物名**，改了文件名它也不变 —— 做交叉核对正好。 */
  function presetNameNow() {
    try {
      var ctx = liveData ? liveData.ctx : null;
      var r = resolvePresetName(ctx, liveData ? liveData.settings : null, presetManagerOf(ctx));
      if (r && r.name) { return r.name; }
    } catch (e) { }
    try {
      var n = liveData && liveData.preset ? cleanName(liveData.preset.name) : '';
      if (n && n !== '当前预设') { return n; }
    } catch (e) { }
    return '';
  }

  /* 一行「标签 ＋ 值（＋可选小标签）」。用的都是契约 §4.2 已登记的类名，不新增。 */
  function aboutRow(label, value, chip) {
    var row = mk('div', 'kami-field');
    row.appendChild(mk('span', 'kami-field-label', label));
    var val = mk('span', 'kami-field-value');
    val.textContent = value || '读不到';
    if (chip) { val.appendChild(mk('span', 'kami-chip', chip)); }
    row.appendChild(val);
    return row;
  }

  /* 「🔄 远程更新」脚本的全局 API（它挂在宿主窗口上；拿不到就返回 null） */
  function kamiUpdateApi() {
    var api = null;
    try { if (HOST && HOST.KamiUpdate) { api = HOST.KamiUpdate; } } catch (e) { }
    if (!api) { try { if (typeof KamiUpdate !== 'undefined' && KamiUpdate) { api = KamiUpdate; } } catch (e) { } }
    return (api && typeof api.check === 'function') ? api : null;
  }

  function renderAboutTab(pane) {
    aboutEls = null;
    var i;

    /* ① 版本信息 */
    var box = mk('div', 'kami-card');
    var head = mk('div', 'kami-card-head');
    head.appendChild(mk('span', 'kami-card-title', '版本信息'));
    box.appendChild(head);
    var body = mk('div', 'kami-card-body');
    var pv = presetVersionOf(presetNameNow());
    var rows = [
      ['酒馆版本', tavernVersionText(), ''],
      ['酒馆助手', callGlobal('getTavernHelperVersion'), ''],
      ['预设版本', pv ? (pv.date ? (pv.label + '（' + pv.date + '）') : pv.label) : '名称里认不出编号', BUILD_N ? ('构建 ' + BUILD_N) : '']
    ];
    for (i = 0; i < rows.length; i++) { body.appendChild(aboutRow(rows[i][0], rows[i][1], rows[i][2])); }
    box.appendChild(body);
    pane.appendChild(box);

    /* ② 检查更新 */
    var api = kamiUpdateApi();
    var snap = null;
    try { snap = api ? api.status() : null; } catch (e) { snap = null; }
    var box2 = mk('div', 'kami-card');
    var head2 = mk('div', 'kami-card-head');
    head2.appendChild(mk('span', 'kami-card-title', '检查更新'));
    box2.appendChild(head2);
    var body2 = mk('div', 'kami-card-body');
    var repoText = '「🔄 远程更新」脚本没在运行';
    if (snap) { repoText = (snap.repo && snap.repo.configured) ? (snap.repo.owner + '/' + snap.repo.repo) : '还没配置仓库'; }
    body2.appendChild(aboutRow('远程仓库', repoText, ''));
    var lastRow = aboutRow('上次检查', (snap && snap.lastCheckedAt) ? snap.lastCheckedAt : '本次会话还没查过', '');
    body2.appendChild(lastRow);
    var btn = mk('button', 'kami-btn kami-btn--primary', '检查更新');
    btn.type = 'button';
    btn.setAttribute('data-kami-act', 'check-update');
    var rowBtn = mk('div', 'kami-field');
    rowBtn.appendChild(mk('span', 'kami-field-label', '手动检查'));
    var valBtn = mk('span', 'kami-field-value');
    valBtn.appendChild(btn);
    rowBtn.appendChild(valBtn);
    body2.appendChild(rowBtn);
    var outRow = aboutRow('检查结果', '还没查过', '');
    body2.appendChild(outRow);
    box2.appendChild(body2);
    pane.appendChild(box2);

    aboutEls = {
      btn: btn,
      out: outRow.querySelector('.kami-field-value'),
      last: lastRow.querySelector('.kami-field-value')
    };
  }

  /* 把一次检查的结果翻成一句人话（动作名与 70-远程更新.js 的 last.action 一一对应） */
  function updateResultText(r) {
    if (!r) { return '检查完成（没拿到结果）'; }
    if (r.error) { return '检查失败：' + r.error; }
    var act = r.action;
    if (act === 'unconfigured') { return '远程更新脚本还没配置仓库'; }
    if (act === 'cooldown') { return '刚查过，还没到下次检查时间'; }
    if (act === 'none') { return '已经是最新版本' + (r.localVersion ? ('（' + r.localVersion + '）') : ''); }
    if (act === 'imported') { return '这个版本已经下载过了'; }
    if (act === 'installed') { return '本机已经有这个版本了'; }
    if (act === 'skipped') { return '这个版本你拒绝过，不再提示'; }
    if (act === 'declined') { return '发现新版本，你选了暂不更新'; }
    if (r.remote && r.remote.version) { return '发现新版本 ' + r.remote.version; }
    return '检查完成';
  }

  function runUpdateCheck(btn) {
    var els = aboutEls;
    if (!els || els.btn !== btn) { return; }
    var api = kamiUpdateApi();
    if (!api) {
      els.out.textContent = '「🔄 远程更新」脚本没在运行，检查不了';
      return;
    }
    if (btn.getAttribute('data-kami-busy') === '1') { return; }
    btn.setAttribute('data-kami-busy', '1');
    btn.disabled = true;
    els.out.textContent = '正在检查…';
    log('手动检查更新（KamiUpdate.check(true)）');
    Promise.resolve(api.check(true))['then'](function (r) {
      btn.removeAttribute('data-kami-busy');
      btn.disabled = false;
      /* 面板重画过（aboutEls 换了一份）就别往旧节点上写了 */
      if (aboutEls !== els) { return; }
      els.out.textContent = updateResultText(r);
      try {
        var s = api.status();
        if (s && s.lastCheckedAt) { els.last.textContent = s.lastCheckedAt; }
      } catch (e) { }
    })['catch'](function (e) {
      btn.removeAttribute('data-kami-busy');
      btn.disabled = false;
      if (aboutEls === els) { els.out.textContent = '检查失败：' + ((e && e.message) || e); }
    });
  }

  /* ⑤ 就地改一张条目卡的样子（不重建 DOM：不重排、不丢焦点、滚动位置不动） */
  function paintItem(el, on) {
    if (!el) { return; }
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) { el.classList.add('is-on'); } else { el.classList.remove('is-on'); }
  }

  /* 同一条目在面板上可能有好几张卡（模型 tab 的镜像 + 原卡片；多模型共用的还出现在两张
     模型卡里）——它们**是同一个开关**，翻一处必须把每一处一起翻。找不到就什么都不做。 */
  function paintItemAll(identifier, value) {
    if (!panelRoot) { return; }
    var list;
    try { list = panelRoot.querySelectorAll('[data-kami-item="' + identifier + '"]'); } catch (e) { return; }
    for (var i = 0; i < list.length; i++) { paintItem(list[i], value); }
  }

  /* 锁死/解锁：走 HTML 原生的 disabled（条目卡本来就是 <button>），外观交给皮肤 */
  function setLocked(el, locked) {
    if (!el) { return; }
    if (locked) {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
    } else {
      el.disabled = false;
      el.removeAttribute('aria-disabled');
    }
  }

  /* 当前模型一变，所有条目的可开关状态都可能变：就地按模型重刷一遍 disabled（不重建 DOM） */
  function paintLocks() {
    if (!panelRoot) { return; }
    var list = panelRoot.querySelectorAll('[data-kami-item]'), i;
    for (i = 0; i < list.length; i++) {
      var it = modelItemById(list[i].getAttribute('data-kami-item'));
      setLocked(list[i], it ? isLockedItem(it) : false);
    }
  }

  function modelItemById(identifier) {
    var found = null;
    eachItem(function (it) { if (!found && it.identifier === identifier) { found = it; } });
    return found;
  }

  /* 模型卡片头的选中态就地改（.is-on + 「当前」小标签），同样不重建 DOM */
  function paintModelHeads() {
    if (!panelRoot) { return; }
    var list = panelRoot.querySelectorAll('[data-kami-model]'), i;
    for (i = 0; i < list.length; i++) {
      var el = list[i], on = el.getAttribute('data-kami-model') === currentModel;
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) { el.classList.add('is-on'); } else { el.classList.remove('is-on'); }
      var chip = el.querySelector('[data-kami-role="cur"]');
      if (on && !chip) {
        var c = mk('span', 'kami-chip', '当前');
        c.setAttribute('data-kami-role', 'cur');
        el.appendChild(c);
      } else if (!on && chip && chip.parentNode) { chip.parentNode.removeChild(chip); }
    }
  }

  /* 点模型卡片头 = 选中这个模型：开它名下全部条目 + 关掉归属集合与它毫无交集的条目。
     共用的那条（归属集合里有本模型）**不动它的开关**，只是留着（用户裁定）。 */
  function selectModel(emoji) {
    if (!emoji) { return; }
    var pairs = [], seen = {}, i;
    eachItem(function (it) {
      var m = it.models || [];
      if (!m.length) { return; }                       // 非模型条目：不动
      if (seen[it.identifier]) { return; }
      seen[it.identifier] = true;
      var hit = m.indexOf(emoji) >= 0;
      if (hit) { if (it.enabled === false) { pairs.push({ identifier: it.identifier, value: true }); } }
      else if (it.enabled !== false) { pairs.push({ identifier: it.identifier, value: false }); }
    });
    var res = commit(pairs);
    if (!res.ok) { toast('error', res.msg); renderStatus(); return; }
    currentModel = emoji;
    for (i = 0; i < pairs.length; i++) {
      paintItemAll(pairs[i].identifier, pairs[i].value);
      syncModel(pairs[i].identifier, pairs[i].value);
    }
    paintLocks();
    paintModelHeads();
    saveVars();
    renderStatus();
    log('选中模型 ' + emoji + '（改动 ' + pairs.length + ' 条，当前模型闸门已重刷）');
  }

  /* 点一下条目卡 = 翻转它。单选卡片组：开一条就自动关掉同组其它条（写之前一起提交）。 */
  function toggleItem(el) {
    if (el.disabled) { return; }                            // 锁死：disabled 收不到 click，这是双保险
    if (el.getAttribute('aria-disabled') === 'true') { return; }
    var id = el.getAttribute('data-kami-item');
    if (!id) { return; }
    var on = el.getAttribute('aria-pressed') !== 'true';   // 目标状态 = 当前状态取反
    var pairs = [{ identifier: id, value: on }];
    if (on && el.getAttribute('data-kami-single') === '1') {
      var rec = cardMap[el.getAttribute('data-kami-card') || ''];
      if (rec) {
        for (var i = 0; i < rec.items.length; i++) {
          var it = rec.items[i];
          if (it.identifier !== id && it.enabled !== false) { pairs.push({ identifier: it.identifier, value: false }); }
        }
      }
    }
    var res = commit(pairs);
    if (!res.ok) {
      /* 写失败：把这一张卡弹回原样（不重画面板，只说真话），别让界面说谎 */
      toast('error', res.msg);
      for (var j = 0; j < pairs.length; j++) {
        if (pairs[j].identifier === id) { paintItem(el, !on); }
      }
      renderStatus();
      return;
    }
    /* 成功：**只就地更新受影响的这几张卡**（自己 + 同组被联动关掉的 + 它们在原卡片/模型
       tab 里的镜像），不重新渲染整个面板 —— 当前 tab、面板位置/大小、滚动位置一律不动。
       内存里的卡片模型同步改掉，下一次单选判断读到的才是新状态。 */
    for (var k = 0; k < pairs.length; k++) {
      var p = pairs[k];
      paintItemAll(p.identifier, p.value);
      syncModel(p.identifier, p.value);
    }
    renderStatus();
  }

  /* 把一次写入的结果同步进条目模型（只改 enabled，不动结构）。
     cardMap 里的 items 就是 view 里那些对象的同一份引用，所以遍历 view 就够了。 */
  function syncModel(identifier, value) {
    eachItem(function (it) { if (it.identifier === identifier) { it.enabled = !!value; } });
  }

  function renderStatus() {
    if (!panelDrop) { return; }
    var sub = panelDrop.querySelector('[data-kami-role="src"]');
    var st = panelDrop.querySelector('[data-kami-role="' + STATUS_ROLE + '"]');
    if (!liveData || !liveData.ok) {
      if (sub) { sub.textContent = '读不到预设'; }
      if (st) { st.textContent = (liveData && liveData.error) ? liveData.error : '读不到当前预设'; }
      return;
    }
    var tree = liveData.tree;
    if (sub) { sub.textContent = liveData.preset.name; }
    if (!st) { return; }
    /* 这一行必须短：皮肤给 .kami-sub 的是 white-space:nowrap，长了会被 .kami-drop 的
       overflow:hidden 裁掉（320px 的抽屉下尤其明显）。完整数字在 KamiPreset.status() 里。 */
    var c = totalCounts();
    var leak = lockedShown();
    st.textContent = '卡片 ' + c.cards + ' · 条目 ' + c.items +
      (leak.length ? (' · ⚠ 锁定 ' + leak.length + ' 条在面板') : (' · 锁定 ' + tree.locked.length + ' 不在面板')) +
      ' · 写入 ' + writeCount + ' 次';
  }

  /* ───────── 面板位置持久化（脚本变量 kami-preset；读全量→改一个键→整体写回） ───────── */

  function readVars() {
    var saved = null;
    try {
      if (typeof getVariables === 'function') {
        var all = getVariables({ type: 'script' });
        saved = all && all[VARS_KEY];
      }
    } catch (e) { log('读脚本变量失败：' + ((e && e.message) || e)); }
    if (!saved || typeof saved !== 'object') { return; }
    if (saved.panel && typeof saved.panel === 'object') {
      if (typeof saved.panel.x === 'number') { geom.x = saved.panel.x; }
      if (typeof saved.panel.y === 'number') { geom.y = saved.panel.y; }
      if (typeof saved.panel.w === 'number') { geom.w = saved.panel.w; }
      if (typeof saved.panel.h === 'number') { geom.h = saved.panel.h; }
    }
    /* 当前模型（闸门）与面板几何存在同一个键里；没存过就等 refresh 时从数据推断 */
    if (typeof saved.currentModel === 'string' && saved.currentModel) { currentModel = saved.currentModel; }
  }
  function saveVars() {
    if (saveTimer) { try { clearTimeout(saveTimer); } catch (e) { } }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (disposed) { return; }
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        /* ① 位置与大小一起存（键名与皮肤管理面板一致：x/y/w/h）；
           当前模型（🤖 模型 tab 的闸门）与它们放同一个键里，换页面也记得 */
        all[VARS_KEY] = { panel: { x: geom.x, y: geom.y, w: geom.w, h: geom.h }, currentModel: currentModel || null };
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('写脚本变量失败：' + ((e && e.message) || e)); }
    }, 250);
  }

  /* ───────── 开关 ───────── */

  function setOpen(v) {
    if (disposed) { return; }
    if (!panelRoot) { buildPanel(); }
    var open = !!v;
    panelDrop.setAttribute('data-kami-open', open ? '1' : '0');
    panelRoot.style.display = open ? '' : 'none';
    if (open) {
      restoreGeometry();
      refresh(true);
      /* 读不到设置时，除了面板里的说明再补一次 toast：绝不静默失败 */
      if (liveData && !liveData.ok) { toast('warning', liveData.error); }
      log('面板已打开（' + (liveData && liveData.ok ? liveData.preset.name + ' · tab ' + view.length : '读不到预设') + '）');
    } else if (mergeCtx) {
      /* v0.6：裁决期间关掉面板 = 用户放弃这次裁决 → 通知 70 号（本次更新暂停导入） */
      var ctxNow = mergeCtx;
      mergeCtx = null;
      log('面板在裁决期间被关闭 → 本次更新暂停（70 那边记 merge-cancelled）');
      try { if (typeof ctxNow.onApply === 'function') { ctxNow.onApply(null); } } catch (e) { }
    }
  }
  function openPanel() { setOpen(true); }
  function closePanel() { setOpen(false); }
  function isOpen() { return !!(panelDrop && panelDrop.getAttribute('data-kami-open') === '1'); }
  function togglePanel() { setOpen(!isOpen()); }

  /* 重新读活设置 + 重解析 + 重画（外部换预设、resize 之类的整体刷新走这里）。
     ⑤ 这条路径**不再由开关触发**（开关只就地改卡片）；但真要走它时也要尽量不打断用户：
       当前 tab 由 renderTabs 里的 tabKey 保住，每一页的滚动位置在这里保住。 */
  function refresh(force) {
    if (disposed) { return; }
    liveData = readTree();
    if (liveData.ok) {
      /* 当前模型（闸门）必须先定下来：buildView 里每条条目的 disabled 就是照它算的 */
      var modelChanged = resolveCurrentModel(liveData.tree);
      view = buildView(liveData.tree);
      if (modelChanged) { saveVars(); }
    } else { view = []; }
    if (!panelRoot && !force) { return; }
    /* 顺手核对一次几何与「贴底抽屉 / 悬浮窗」：尺寸变化事件偶尔会漏（预览台的模拟视口就是这样），
       每次重读都过一遍这段代码，面板不会停在上一次的布局模式上。 */
    if (panelRoot) {
      var keepScroll = captureScroll();
      restoreGeometry();
      renderTabs();
      restoreScroll(keepScroll);
    }
    updateDef();
  }

  /* 每一页各自的滚动位置：重画前抓、重画后放回去 */
  function captureScroll() {
    var out = {}, i, list = paneEls();
    for (i = 0; i < list.length; i++) {
      var k = list[i].getAttribute('data-kami-pane');
      if (k && list[i].scrollTop) { out[k] = list[i].scrollTop; }
    }
    return out;
  }
  function restoreScroll(map) {
    if (!map) { return; }
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) { continue; }
      var el = paneEl(k);
      if (el) { el.scrollTop = map[k]; }
    }
  }

  /* ───────── 登记按钮 ───────── */

  function updateDef() {
    if (!ownDef) { return; }
    try { if (HOST.__hub && typeof HOST.__hub.paint === 'function') { HOST.__hub.paint(); } } catch (e) { }
  }

  function registerButton() {
    try {
      var w = HOST;
      /* 先清掉可能残留的同名登记（脚本重载时不留幽灵按钮） */
      var defs = w.__hubDefs || (w.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === HUB_NAME) { defs.splice(i, 1); }
      }
      ownDef = {
        name: HUB_NAME,
        order: HUB_ORDER,
        tip: '预设设置（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        /* 读不到设置时按钮文字带个 ⚠，别让用户以为面板是空的 */
        label: function () { return HUB_NAME + ((liveData && !liveData.ok) ? '⚠' : ''); },
        /* ready 恒为 true：面板本身就是「读不到设置」时的报错界面，
           这里返回 false 会让中转站只弹个提示、面板根本打不开（那就成了静默失败）。
           错误同样写进 absent，任何走 absent 的路径都会说出真实原因。 */
        ready: function () { return true; },
        absent: '预设设置拿不到酒馆设置（SillyTavern.getContext 不可用），读不到当前预设',
        click: function () { togglePanel(); }
      };
      defs.push(ownDef);
      try {
        var ev = w.document.createEvent('Event');
        ev.initEvent('kami-hub-def', false, false);
        w.dispatchEvent(ev);
      } catch (e) { }
      log('已向按钮中转站登记按钮 ' + HUB_NAME);
    } catch (e) {
      console.warn('[预设] 向中转站登记按钮失败（可用控制台 KamiPreset.open() 手动打开）', e);
    }
  }

  /* ───────── 全局 API ───────── */

  function lockedShown() {
    var out = [], i, j;
    if (!liveData || !liveData.ok || !panelRoot) { return out; }
    var ids = {}, locked = liveData.tree.locked;
    for (i = 0; i < locked.length; i++) { ids[locked[i].identifier] = locked[i].name; }
    var drawn = inspectedIdentifiers();
    for (j = 0; j < drawn.length; j++) { if (ids[drawn[j]]) { out.push(ids[drawn[j]]); } }
    return out;
  }
  function inspectedIdentifiers() {
    var out = [];
    if (!panelRoot) { return out; }
    try {
      /* 每条可点条目就是一张 .kami-item 卡片，它带 data-kami-item（不再有 input） */
      var list = panelRoot.querySelectorAll('[data-kami-item]');
      for (var i = 0; i < list.length; i++) {
        var v = list[i].getAttribute('data-kami-item');
        if (v && out.indexOf(v) < 0) { out.push(v); }
      }
    } catch (e) { }
    return out;
  }

  function status() {
    var c = totalCounts();
    return {
      version: VERSION,
      ok: !!(liveData && liveData.ok),
      error: (liveData && liveData.error) || null,
      preset: (liveData && liveData.ok) ? liveData.preset.name : null,
      characterId: (liveData && liveData.ok) ? liveData.tree.meta.characterId : null,
      panelOpen: isOpen(),
      activeTab: tabKey,
      tabCount: c.tabs, specialTabCount: c.special, cardCount: c.cards, switchCount: c.items,
      lockedCount: (liveData && liveData.ok) ? liveData.tree.locked.length : 0,
      writes: writeCount, saves: saveCount, lastWrite: lastWrite,
      presetName: lastNameInfo ? lastNameInfo.name : null,
      presetNameFrom: lastNameInfo ? lastNameInfo.from : null,
      lastSave: lastSave,
      varWrites: varWrites,
      presetChangedEmits: emitCount, presetChangedSkipped: emitSkipped
    };
  }

  function inspect() {
    var tabs = [], i, j;
    for (i = 0; i < view.length; i++) {
      var t = view[i], cards = [];
      for (j = 0; j < t.cards.length; j++) {
        cards.push({
          name: t.cards[j].name, mode: t.cards[j].mode, items: t.cards[j].items.length,
          kind: t.cards[j].kind || null,                                  // 变量卡才有：number / range
          vars: t.cards[j].vars ? t.cards[j].vars.map(function (v) { return v.name; }) : null,
          note: !!(t.cards[j].note)                                       // 卡片头有没有注释（有没有 ⓘ）
        });
      }
      tabs.push({ key: t.key, title: t.title, special: t.special, cards: cards, itemCount: counts(t).items });
    }
    var locked = (liveData && liveData.ok) ? liveData.tree.locked : [];
    return {
      ok: !!(liveData && liveData.ok),
      error: (liveData && liveData.error) || null,
      tabTitles: tabs.map(function (t) { return t.title; }),
      tabs: tabs,
      drawnIdentifiers: inspectedIdentifiers(),
      lockedIdentifiers: locked.map(function (x) { return x.identifier; }),
      lockedInPanel: lockedShown(),
      stats: (liveData && liveData.ok) ? liveData.tree.stats : null
    };
  }

  function expose() {
    var api = {
      version: VERSION,
      open: openPanel, close: closePanel, toggle: togglePanel,
      refresh: function () { refresh(true); },
      /* 排障/脚本化用：按 identifier 直接改一条开关（同样走 prompt_order 路径）。
         ⑤ 与点卡片同一条路径：成功就只就地改那张卡（含它在别处的镜像），不重画面板。 */
      setEnabled: function (identifier, value) {
        var v = !!value;
        var r = commit([{ identifier: identifier, value: v }]);
        if (r.ok && panelRoot) { paintItemAll(identifier, v); syncModel(identifier, v); renderStatus(); }
        return r;
      },
      /* 当前模型（模型 emoji）：读 / 选。选的时候与点模型卡片头同一条路径。 */
      currentModel: function () { return currentModel; },
      selectModel: function (emoji) { selectModel(emoji); return currentModel; },
      /* 模型 tab 的静态读数：几张卡、每张几条、哪几条是多模型共用 */
      models: function () {
        var out = [], i, j;
        for (i = 0; i < view.length; i++) {
          if (view[i].special !== 'model') { continue; }
          for (j = 0; j < view[i].cards.length; j++) {
            var c = view[i].cards[j], ids = [];
            for (var k = 0; k < c.items.length; k++) {
              ids.push({ name: c.items[k].name, identifier: c.items[k].identifier, models: c.items[k].models.slice(), enabled: c.items[k].enabled !== false });
            }
            out.push({ emoji: c.emoji, label: c.label, name: c.name, itemCount: c.items.length, items: ids });
          }
        }
        return { current: currentModel, legend: (function () {
          for (var m = 0; m < view.length; m++) { if (view[m].special === 'model') { return view[m].legend; } }
          return null;
        })(), cards: out };
      },
      /* 「🧩 设置变量」tab 的静态读数 + **从活设置里现读的预设正文**（验收对照用：
         改值前后各读一次 content，两段文本必须只差那一个数字）。 */
      vars: function () {
        var out = [], contents = [], seen = {}, i, j, k;
        for (i = 0; i < view.length; i++) {
          if (view[i].special !== 'var') { continue; }
          for (j = 0; j < view[i].cards.length; j++) {
            var c = view[i].cards[j], vs = [];
            for (k = 0; k < c.vars.length; k++) { vs.push({ name: c.vars[k].name, value: c.vars[k].value }); }
            out.push({ key: c.key, name: c.name, kind: c.kind, entry: c.entry, label: c.label, note: c.note, vars: vs });
            if (c.entry && !seen[c.entry]) { seen[c.entry] = 1; }
          }
        }
        try {
          var raw = readRaw();
          var prompts = (raw.ok && raw.settings.prompts) ? raw.settings.prompts : [];
          for (i = 0; i < prompts.length; i++) {
            if (seen[prompts[i].identifier]) { contents.push({ identifier: prompts[i].identifier, name: prompts[i].name, content: prompts[i].content }); }
          }
        } catch (e) { }
        return { cards: out, contents: contents, varWrites: varWrites };
      },
      /* 排障：直接按 identifier + 变量名改一个值（与在输入框里改走同一条路径） */
      setVar: function (identifier, name, value, oldValue) {
        return commitVars([{ identifier: identifier, name: name, old: oldValue, value: String(value) }]);
      },
      status: status,
      inspect: inspect,
      /* v0.6：三方合并的裁决页。70 号的合并流程在需要时调它：
         plan = 合并引擎算好的计划（conflicts[].choice 是决策位）；
         onApply(settledPlan) = 提交所有决策（合并、备份、写盘在 70 号那侧）；
         onApply(null) = 用户放弃（关掉了面板）。返回 false = 面板建不出来（70 号会退化成原生弹窗）。 */
      openMergeReview: function (plan, onApply) { return openMergeReview(plan, onApply); },
      closeMergeReview: function () { if (mergeCtx) { setOpen(false); } return true; },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  /* ───────── 注销（零残留：逐项对照登记与自建的东西） ───────── */

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    log('正在注销：摘监听 / 拆面板 / 收样式 / 撤登记 / 删全局');
    /* 裁决没完成就注销（脚本被关 / 重挂）：同样通知 70 号放弃，别让它干等回 */
    if (mergeCtx) { var mc = mergeCtx; mergeCtx = null; try { if (typeof mc.onApply === 'function') { mc.onApply(null); } } catch (e) { } }
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    /* 写盘自证压上的 fetch 补丁与 6 秒兜底定时器：必须在这里收回，否则注销后最多 6 秒内
       HOST.fetch 还是被替换过的版本（会继续截获 /api/presets/save 并写 lastSave）。 */
    try { cancelSavePatches(); } catch (e) { }
    for (var i = 0; i < unsubs.length; i++) { try { if (unsubs[i] && unsubs[i].stop) { unsubs[i].stop(); } } catch (e) { } }
    unsubs = [];
    try { if (resizeHandler) { HOST.removeEventListener('resize', resizeHandler); } } catch (e) { }
    resizeHandler = null;
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    /* 自注入的兜底皮肤 */
    dropCss();
    /* 面板 DOM */
    try { if (GESTURES) { GESTURES.destroy(); } } catch (e) { }
    GESTURES = null;
    try { if (panelRoot && panelRoot.parentNode) { panelRoot.parentNode.removeChild(panelRoot); } } catch (e) { }
    panelRoot = null; panelDrop = null; panelHead = null; cardMap = {}; view = [];
    /* 按钮登记：__hubDefs 里自己那一份 + 中转站里的登记 */
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) {
        if (defs[j] === ownDef || (defs[j] && defs[j].name === HUB_NAME)) { defs.splice(j, 1); }
      }
      if (HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister(HUB_NAME); }
    } catch (e) { }
    ownDef = null;
    /* 全局 API（只删自己这一份） */
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    log('注销完成：面板、样式、登记、全局 API 都已收回；预设文件与酒馆设置没有被改动');
  }

  /* ───────── 启动 ───────── */

  var hideHandler = null;

  function boot() {
    log('启动 v' + VERSION + '（解析器与兜底皮肤已内联）');
    readVars();
    refresh(true);
    log('读活设置：' + (liveData.ok
      ? ('预设「' + liveData.preset.name + '」· prompt_order ' + liveData.order.order.length + ' 条 · tab ' + view.length)
      : ('失败 —— ' + liveData.error)));
    expose();
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    resizeHandler = function () {
      if (!panelDrop) { return; }
      restoreGeometry();
      log('尺寸变化 → layout=' + panelDrop.getAttribute('data-kami-layout') +
        ' 视口=' + HDOC.documentElement.clientWidth + 'x' + HDOC.documentElement.clientHeight);
      if (isOpen()) { renderStatus(); }
    };
    try { HOST.addEventListener('resize', resizeHandler); } catch (e) { }
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
    if (!liveData.ok) { log('提示：' + liveData.error + '（面板仍可打开，打开后会显示这句说明）'); }
  }

  try { boot(); } catch (e) { console.error('[预设] 启动失败', e); }
})();
