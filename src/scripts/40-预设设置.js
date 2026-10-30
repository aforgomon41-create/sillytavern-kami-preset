/* ============================================================
 * 🌟 预设设置   v0.6
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 它把「当前预设」变成一块可以点的面板：
 *   · 自己向「🎛 脚本按钮」登记一个按钮（🌟 预设设置），点击展开面板
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
 * v0.9 新增（用户 2026-09-30 点名）：「🧰 其他功能」页，位置固定排在「ℹ️ 关于」**前面**，
 *   用来放"不知道该塞到哪一页"的功能入口。第一件是**自动标签处理**：
 *   AI 回复里成对标签（正文块 `<content>` 这类）没写闭合时，自动补上缺的闭合标签、
 *   或者把配不上对的标签删掉（三档：关闭 / 补全 / 删除，设置存在脚本变量 kami-preset.tagFix 里）。
 *   认标签、判定往哪儿补、删哪一段的逻辑全在 src/scripts/_tags-pure.js（构建期内联，
 *   离线单测 test/harness/tags-pure.mjs）；本脚本只管设置、挂 MESSAGE_RECEIVED、
 *   把结果显示到面板上（外加一颗「处理当前楼层」做手动处理）。
 *   标签名单的唯一真相是预设条目「🧩 标签格式」，逐个对应关系与"未闭合会坏什么"
 *   见 .audit/标签调研.md 与 _tags-pure.js 的头部注释。
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
  /* @@KAMI_UI@@ */

  var VERSION = '0.9'; var API_NAME = 'KamiPreset';
  var VARS_KEY = 'kami-preset';
  /* 产物号：构建时把 @@KAMI_BUILD_N@@ 换成真实编号（源码必须能独立编译，所以写成字符串）。
     与 50-引导.js 用的是同一个占位符 —— 「关于」页拿它给预设版本做交叉核对。 */
  var BUILD_N = parseInt('@@KAMI_BUILD_N@@', 10) || 0;
  var CHAR_ID = 100001;     // 拖动 tab 行时允许的「按下不动」容差

  /* 「继承旧预设设置」这一张卡的文案（2026-09-28 由 Gemini 出稿，用户点名的流程）。
     它干的事：用户自己手动下载导入新版（网络到 GitHub 不通时只能这样），
     那条路不会触发远程更新里的合并，于是把同一台合并引擎再开一次 ——
     theirs = 他挑的那份旧预设，next = 当前这份，结果覆盖回当前预设、立刻生效。 */
  var INHERIT_COPY = {
    title: '继承旧预设设置',
    note: '手动导入新版本后，可以用它把旧预设里你改过的设置搬过来。',
    pickHint: '请从下面选一个你之前用过的旧预设。',
    notKamiWarn: '这个看起来不是卡密预设，强行搬过来可能会出问题。你想继续继承它，还是换一个？',
    working: '正在搬运设置...',
    done: '设置已经搬过来了，页面会在几秒后自动刷新，让各个脚本用上搬来的设置。当前的预设已经提前备份了一份，名字里带有“继承前备份”。',
    failHead: '搬运设置失败：',
    noOthers: '没有找到其他预设，需要先有旧预设才能搬运设置。',
    degrade: '这个功能需要远程更新脚本运行才能用。请先启动脚本。',
    /* 2026-09-28 用户看完真机效果后补的两句：这一份是从哪继承来的要写在面板上（免得看标题栏误会），
       以及「为什么没问我要不要保留条目修改」得说清楚（没问 = 本来就没有冲突，不是漏问了）。 */
    sourceLabel: '这一份继承自',
    sourceNone: '还没继承过',
    sourceNote: '上面那一行是「这一份的设置是从哪份旧预设搬来的」，只做记录，不影响任何功能；面板标题栏显示的名字仍是当前这份预设自己的名字。',
    noAsk: '这次没有条目需要你裁决：你的旧预设和这一版之间，没有同一条内容被两边都改过，所以直接搬完了。',
    asked: '其中 {n} 处两边都改过，已按你在裁决页里的选择处理。',
    selMoved: '注意：写完之后酒馆的预设选择被挪到了别处，已经自动拨回当前这一份；如果界面看着不对，切一下预设即可。',
    selFailed: '注意：写完之后酒馆的预设选择被挪到了别处，自动拨回没成功，请手动切回当前这一份。'
  };
  /* 「这一份继承自」：跟着预设走（存在脚本变量里，而脚本变量就写在预设文件里） */
  var inheritFromName = '';
  var inheritAtText = '';

  /* 「用户自定义文风」整块（渲染 + 交互 + 状态机 + 文案 + 样式）只有一份实现：
     src/scripts/_custom-style-ui.js，构建期内联到这里（build/kami-doc.mjs 的 expandCustomStyleUi）。
     引导面板内联的是**同一份**，两块面板不会再各写一套（用户 2026-10-02 点名要预设面板也有）。 */
  /* @@KAMI_CUSTOM_STYLE_UI@@ */

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

  /* ── 「自动标签处理」的纯逻辑（唯一真相：src/scripts/_tags-pure.js，构建期内联） ──
     为什么要它：「🧰 其他功能」页上的开关要能检测 AI 回复里没闭合的标签并补上/删掉。
     认标签、决定补在哪儿、删哪一段全在那份模块里，这里是它的唯一消费者；
     标签名单（哪些标签算数、谁在消费它们）也写在那个文件的表里，改表就两边一起变。 */
  /* @@KAMI_TAGS_PURE@@ */
  /* @@KAMI_RESPONSE_PIPELINE@@ */
  /* @@KAMI_RESPONSE_TRANSPORT@@ */
  /* @@KAMI_REASONING_REFERENCES@@ */
  /* @@KAMI_TAG_RESPONSE@@ */

  /* 「只复制干净的正文」的取文本规则（src/scripts/_copy-clean.js）。
     🧰 其他功能页的「导出纯净正文」与两个前端的复制按钮用的是**同一套换行规则**，
     所以这里也要内联一份 —— 不许在导出那边再抄一遍换行逻辑。 */

  /* 「导出纯净正文」要用的换行规则（src/scripts/_copy-clean.js 的 tidyCopyText），与消息前端的复制按钮同一套。 */
  /* @@KAMI_COPY_CLEAN@@ */

  /* 「导出纯净正文」的纯逻辑（src/scripts/_export-clean.js）：楼层范围解析、role 前缀、
     换行分隔、边界校验。下载那一层是 40 号自己的薄壳，不进这个模块。 */
  /* @@KAMI_EXPORT_CLEAN@@ */

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
  var panelRoot = null;  var liveData = null;              // 最近一次「读活设置 + 解析」的结果
  var view = [];                    // tab 模型（渲染用）
  var tabKey = null;              // 「关于」页的元素句柄（检查更新的结果就地写，不重画面板）
  var geom = { x: null, y: null, w: null, h: null };  // 面板位置与大小（拖动/缩放时存回脚本变量 kami-preset）
  var currentModel = null;          // 当前模型（模型 emoji）：存在脚本变量 kami-preset.currentModel 里
  /* 对话模式（2026-10-14）：进入「💬 对话讨论」之前，把**即将被关掉**的那些条目的开关存一份，
     切回「🎲 剧情游玩」时原样恢复。只存一份、只在第一次进入时存 ——
     用户在对话模式期间的手动改动不该覆盖掉他的原始配置。
     形状 { at: 时间文本, on: { identifier: true|false } }；没进过时为 null。 */
  var dialogSaved = null;
  /* 「💬 对话讨论」那一条的 identifier（预设里固定）。
     它是这一层里唯一带特殊逻辑的条目：选中它要关掉跑团专属的组，选中另一个要恢复。 */
  var DIALOG_MODE_ID = 'd1a10001-0000-4000-8000-000000000003';
  /* 「🎲 剧情游玩」那一条（默认选中）。 */
  var PLAY_MODE_ID = 'd1a10001-0000-4000-8000-000000000002';
  var writeCount = 0, saveCount = 0, lastWrite = '';   // prompt_order 写入计数与最近一次的结果文本
  var lastSave = null;      // 最近一次「写预设文件」的结果（预设名 / 取自哪一层 / 通道 / 服务端回执）
  var lastNameInfo = null;  // 最近一次解析到的预设名：{ name, from }
  var varWrites = 0;                    // 变量写回次数（与开关的 writeCount 分开记，读起来才不含糊）
  var emitCount = 0, emitSkipped = 0;   // OAI_PRESET_CHANGED_AFTER 的发出/跳过次数（排障用）
  var saveTimer = null, pingTimer = null;
  var unsubs = [];
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

  /* 读出场正文里某个变量**当前**的值。读不到 / 是空值 / 正文残缺都返回 null。
     ⚠️ 为什么需要它：面板的输入框把"渲染那一刻的值"存在 data-kami-old 里当钥匙。
     可用户完全可能在酒馆里**直接改预设正文**（或在别处改过这个变量），
     于是正文里的值跟面板缓存的对不上 —— 2026-10-10 用户报的 bug 就是这个：
     面板报「预设里找不到 setvar::名::旧值（预设被改过？）」并拒绝写入。
     解法：**变量名才是钥匙，值不是**。写之前先拿这个名字现读一次真实值。 */
  function readVarValue(content, name) {
    if (typeof content !== 'string') { return null; }
    var head = 'setvar::' + name + '::';
    var at = content.indexOf(head);
    if (at < 0) { return null; }
    var rest = content.slice(at + head.length);
    /* 必须有收尾的 }}：没有说明这段正文残缺（用户改坏了 / 还没写完）。
       残文一律返回 null —— 宁可不改，也不在一片坏文本上动手。 */
    if (rest.indexOf('}}') < 0) { return null; }
    return rest.split('}}')[0];
  }

  /* 把 content 里第一处 `setvar::<name>::…` 的值换成 newValue。
     返回 { ok:true, after } 或 { ok:false, why } —— 绝不猜、绝不整段重写。

     ── 两段式匹配（2026-10-10 修 bug 时改的）──
     ① **精确匹配** `setvar::名::旧值` 优先。值跟面板记的一致时，行为与以前一模一样。
     ② ① 落空才退到**按名锚定**：只认 `setvar::名::` 这段前缀，把后面的值换掉。
        退之前必须过几道闸，守住"只改那一个数字"的老规矩（第 371 行那段注释）。
        ⚠️ 闸门失败要**说清是哪种**（why 字段）—— 用户看到"找不到该变量"会去翻预设，
        其实可能只是这个变量的值本来是文字。原先一律报"找不到"，是很误导人的。

     why 取值：
       `no-entry`   条目里根本没有这个变量名
       `no-close`   有 `setvar::名::` 但没有收尾的 `}}` —— 正文残缺
       `empty`      值是空的（`setvar::名::}}`）
       `not-number` 值不是纯数字（多行文本、小数、全角数字、科学计数法…）
       `minus`      值以减号开头（负数；面板是整数框，且会与 `::1` 前缀混淆） */
  function setVarInContent(content, name, oldValue, newValue) {
    if (typeof content !== 'string') { return { ok: false, why: 'no-entry' }; }
    /* ⚠️ oldValue 为空串时**绝不能**走精确匹配：needle 会退化成 `setvar::名::`，
       它在正文里必然命中，然后 `at + needle.length` 只跳过前缀、没跳过原来的数字 ——
       结果是新旧值叠在一起写出 `300250` 这种脏数据（2026-10-10 自测抓到的）。
       空值直接走下面的按名锚定。 */
    if (oldValue !== '' && oldValue !== null && oldValue !== undefined) {
      var needle = 'setvar::' + name + '::' + oldValue;
      var at = content.indexOf(needle);
      if (at >= 0) {
        return { ok: true, after: content.slice(0, at) + 'setvar::' + name + '::' + newValue + content.slice(at + needle.length) };
      }
    }
    /* ① 落空 → ② 按名锚定 */
    var head = 'setvar::' + name + '::';
    var hAt = content.indexOf(head);
    if (hAt < 0) { return { ok: false, why: 'no-entry' }; }
    var rest = content.slice(hAt + head.length);
    if (rest.indexOf('}}') < 0) { return { ok: false, why: 'no-close' }; }
    var cur = rest.split('}}')[0];
    if (cur === '') { return { ok: false, why: 'empty' }; }
    /* ⚠️ 减号必须**先判**：负数（-5）本来就通不过纯数字那道闸，
       顺序反了它会一路落到 not-number，用户看到的就是含糊的"值不是数字"，
       而他真正需要知道的是"面板不认负数"。 */
    if (cur.charAt(0) === '-') { return { ok: false, why: 'minus' }; }
    if (!/^\d+$/.test(cur)) { return { ok: false, why: 'not-number' }; }
    var valAt = hAt + head.length;
    return { ok: true, after: content.slice(0, valAt) + newValue + content.slice(valAt + cur.length) };
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

  function watchSave(name, from, plan, onFail, onDone) {
    var target = HOST || window;
    var orig = null, done = false, patched = null;
    var r = {
      at: nowText(), name: name, from: from, channel: '酒馆原生「更新当前预设」按钮',
      status: null, ok: null, dispatcher: null, prompts: null, injection: null, bytes: null, content: null, error: null
    };
    try { orig = target.fetch; } catch (e) { orig = null; }
    if (typeof orig !== 'function') {
      r.error = '宿主 fetch 不可用，没法回读写盘结果（改动仍已发出）';
      lastSave = r; log('写盘自证不可用：' + r.error);
      r.ok = false;
      if (typeof onDone === 'function') { onDone(); }
      return r;
    }
    /* 补丁与兜底定时器都登记在 savePatches 里，注销时由 cancelSavePatches() 逐项收回
       （原来只靠 finish() 自还原：写盘途中注销 → 最多 6 秒内 HOST.fetch 还是被替换过的版本）。 */
    var slot = { target: target, orig: orig, patched: null, timer: null, done: false };
    function finish() {
      if (done || slot.done || disposed) { return; }
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
      try { renderStatus(); } catch (e) { }
      /* 真写失败：活设置里的改动要退回去，否则内存与磁盘就分家了（界面也弹回旧值） */
      if (r.ok === false && plan && plan.length) {
        try {
          var reverted = [];
          for (var i = 0; i < plan.length; i++) {
            var p = plan[i];
            /* 后一次编辑仍在队列时，失败只能撤销自己拥有的内容。 */
            for (var q = 0; q < saveJobs.length; q++) {
              var next = saveJobs[q].plan || [];
              for (var n = 0; n < next.length; n++) {
                if (next[n].prompt === p.prompt && next[n].before === p.after) { next[n].before = p.before; }
              }
            }
            if (p.prompt.content === p.after) { p.prompt.content = p.before; reverted.push(p); }
          }
          if (reverted.length) { revertVarInputs(reverted); }
          toast('error', '预设没写进去（HTTP ' + r.status + '）' + (reverted.length ? '，本次改动已退回' : '；后续编辑已保留'));
        } catch (e) { log('退回活设置失败：' + ((e && e.message) || e)); }
      } else if (r.ok === false && typeof onFail === 'function') {
        /* 不是「改一个数字」那种 plan（例如整份继承写回）：退回动作由调用方给，
           它自己知道刚才覆盖了哪些字段、原值是什么。 */
        try { onFail(r); } catch (e) { log('退回活设置失败：' + ((e && e.message) || e)); }
      }
      if (typeof onDone === 'function') { onDone(); }
    }
    r.cancel = function () { r.ok = false; finish(); };
    patched = function (input, init) {
      var url = '';
      try { url = (typeof input === 'string') ? input : ((input && input.url) || ''); } catch (e) { }
      var p = orig.apply(this, arguments);
      try {
        if (url.indexOf('/api/presets/save') >= 0 && !r.dispatched && !slot.done && !disposed) {
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
      r.ok = false; finish(); return r;
    }
    if (target.fetch !== patched) { r.ok = false; r.error = '宿主 fetch 无法替换'; finish(); return r; }
    slot.patched = patched;
    savePatches.push(slot);
    slot.timer = setTimeout(function () { if (!r.dispatched) { r.ok = false; r.error = '6 秒内没看到保存请求'; finish(); } }, 6000);
    return r;
  }

  /* watchSave 压上的 fetch 补丁栈（后进先出收回）。
     注销时逐个还原：先还原最晚压上的那层（它的 orig 可能是上一层补丁），最后回到真 fetch。 */
  var savePatches = [];
  var saveJobs = [], saveJobActive = null, saveSerial = 0;
  var SAVE_BUSY = '上一项还在保存，请保存完成后再修改';
  function savingBusy() { return !!saveJobActive || saveJobs.length > 0; }
  function queuePresetSave(name, from, plan, onFail, button) {
    saveJobs.push({ name: name, from: from, plan: plan, onFail: onFail, button: button, serial: ++saveSerial });
    return pumpPresetSaves();
  }
  function pumpPresetSaves() {
    if (disposed || saveJobActive || !saveJobs.length) { return; }
    var job = saveJobActive = saveJobs.shift();
    var complete = function () {
      if (saveJobActive !== job) { return; }
      saveJobActive = null;
      /* 避免在 fetch.then 的当前栈里再次点原生按钮。 */
      Promise.resolve().then(function () { pumpPresetSaves(); });
    };
    var r = watchSave(job.name, job.from, job.plan, function (result) {
      if (job.serial === saveSerial && typeof job.onFail === 'function') { job.onFail(result); }
    }, complete);
    if (r.ok === false) { return r; }
    try {
      var sent = job.button.click();
      if (sent && typeof sent.catch === 'function') {
        sent.catch(function (e) { r.error = '保存失败：' + ((e && e.message) || e); if (r.cancel) { r.cancel(); } });
      }
    }
    catch (e) {
      r.ok = false; r.error = '点不动酒馆保存按钮：' + ((e && e.message) || e);
      if (r.cancel) { r.cancel(); }
      complete();
      toast('error', r.error);
    }
    return r;
  }
  function cancelSavePatches() {
    saveJobs = []; saveJobActive = null;
    while (savePatches.length) {
      var p = savePatches.pop();
      p.done = true;
      try { if (p.timer) { clearTimeout(p.timer); p.timer = null; } } catch (e) { }
      try { if (p.target && p.target.fetch === p.patched) { p.target.fetch = p.orig; } } catch (e) { }
    }
  }

  /* 写盘失败时把面板上那几个数字框弹回原值（按 entry + 变量名找，不只管当前这一张卡） */
  function revertVarInputs(plan) {
    for (var i = 0; i < (plan || []).length; i++) { syncVarModel(plan[i].identifier, plan[i].name, plan[i].old); }
    toolsNotify();
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
  function savePresetFile(ctx, settings, plan, onFail, forcedName) {
    var pm = presetManagerOf(ctx);
    /* forcedName：调用方在**动活设置之前**就抓好的当前预设名（继承那条路要用）。
       为什么不让这里现解析：解析的第 1 层读的是酒馆下拉框的选中项、第 2/3 层读活设置字段，
       而继承刚刚把活设置里一大堆字段换成了合并结果 —— 现解析有可能认成别的一份预设。 */
    var info = forcedName
      ? { name: cleanName(forcedName), from: '调用方在动活设置之前抓下来的当前预设名', layer: 0 }
      : resolvePresetName(ctx, settings, pm);
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
      var request = queuePresetSave(liveName, info.from, plan, onFail, btn);
      if (request && request.ok === false) { return { ok: false, msg: request.error || '保存失败' }; }
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
      var request = queuePresetSave(info.name, info.from, plan, onFail, { click: function () {
        return pm.savePreset(info.name); // 第二个参数不传，避免白名单重建
      } });
      if (request && request.ok === false) { return { ok: false, msg: request.error || '保存失败' }; }
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
  /* 改不动时到底为什么 —— 人话版。原先一律报"预设里找不到 setvar::名::值（预设被改过？）"，
     用户会一头雾水地去翻预设，其实可能只是那个变量的值本来是文字。 */
  function varWhyText(why, name) {
    if (why === 'no-entry') { return '这个条目里没有 \'' + name + '\' 这个变量（它可能被删掉了）'; }
    if (why === 'no-close') { return '\'' + name + '\' 这段正文残缺：setvar 少了收尾的 }}，请先在预设里把它补全'; }
    if (why === 'empty') { return '\'' + name + '\' 当前是空值，面板不敢猜原来的数字，请先给它填一个数'; }
    if (why === 'not-number') { return '\'' + name + '\' 当前的值不是纯数字（可能是文字或多行内容），面板不会去动它'; }
    if (why === 'minus') { return '\'' + name + '\' 当前是负数，面板只认非负整数，请直接在预设里改'; }
    return '\'' + name + '\' 改不动（原因未知）';
  }

  function commitVars(pairs) {
    if (disposed || savingBusy()) { return { ok: false, changed: 0, msg: disposed ? '脚本已关闭' : SAVE_BUSY }; }
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
      /* ⚠️ 钥匙是**变量名**，不是面板缓存的值。先按名现读一次正文里的真实值 ——
         读到了就用真实值当旧值（这样精确匹配那一段能命中，改动最小、行为可预测）；
         读不到（真没这个变量）就退回面板缓存值，让 setVarInContent 去决定能不能救。
         2026-10-10：用户手改过预设正文后，面板缓存的值与正文不一致，
         旧代码拿缓存值当钥匙 → 找不到 → 拒绝写入。 */
      var realOld = readVarValue(before, p.name);
      var useOld = (realOld !== null && realOld !== '') ? realOld : p.old;
      var res = setVarInContent(before, p.name, useOld, p.value);
      if (!res.ok) { return { ok: false, changed: 0, why: res.why, msg: varWhyText(res.why, p.name) }; }
      var after = res.after;
      plan.push({ prompt: ent, identifier: p.identifier, name: p.name, old: useOld, panelOld: p.old, value: p.value, before: before, after: after });
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
      log('写回变量：' + plan[i].name + ' ' + plan[i].old + ' → ' + plan[i].value + '（' + diffDots(plan[i].before, plan[i].after) + '）'
        + (plan[i].panelOld !== plan[i].old ? '　⚠️ 面板缓存的是 ' + plan[i].panelOld + '，正文里其实是 ' + plan[i].old + '（已按正文为准）' : ''));
    }
    lastWrite = writeText(nowText(), plan.length, []);
    return { ok: true, changed: plan.length, plan: plan, msg: '' };
  }

  /* ───────── 用户自定义文风：结构写入（增 / 删 / 改，保存才落盘） ─────────

     这是本脚本**第一次**改预设的**结构**（以前的写入只有两种：prompt_order.enabled 与
     条目 content 里的一个数字）。所以规矩比别处更紧：

     ① 计划是纯数据：所有"插哪儿、删哪条、克隆谁"的判断都在内联进来的
        planCustomStyleWrite() 里算完（test/harness/preset-parse.mjs，有离线单测）。
        这里只是一层薄壳：读活设置 → 算计划 → 写回两个数组 → 点酒馆的保存按钮。
     ② prompts[] 与 prompt_order[] **同增同删**（R1）：只动一边会留下孤儿，
        解析器对孤儿的处理是**静默跳过**（不报错），用户会以为"加了但没生效"。
     ③ 新增条目**克隆同组现有条目的完整字段表**，只覆盖 identifier / name / content
        —— 自己拼字段少了什么没人知道（R2）。
     ④ 写入前断言 prompt_order 结构（条数与 character_id），不符合就放弃并报错（R3）。
     ⑤ 写入前后逐字段对比，任何异常**立刻回滚内存改动**，绝不"先写进去看看"。
     ⑥ 落盘走 savePresetFile()（点 #update_oai_preset）——
        **绝不**用 replacePreset / updatePresetWith / setPreset（白名单重建会丢字段，已实测写坏）。 */

  /* 校验用：数组里有没有这个 identifier */
  function indexOfIdentifier(arr, id) {
    var i;
    for (i = 0; i < (arr || []).length; i++) { if (arr[i] && arr[i].identifier === id) { return true; } }
    return false;
  }

  /* 分区收尾标记读不到时**硬拒绝写入**（用户 2026-10-02 拍板）。
     为什么不像别处那样降级：功能不可用是**看得见**的毛病，条目被插到分区外面是**看不见**的毛病
     —— 后者要等用户某天发现「文风怪怪的」才会暴露。宁可报错。 */
  var DIY_NO_SECTION_END = 'NO_SECTION_END';

  var DIY_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  /* 新条目的 identifier 沿用酒馆自己生成的那个形态：prompt_<时间戳>_<随机> */
  function diyNewIdentifier() {
    var s = '', i;
    for (i = 0; i < 7; i++) { s += DIY_ID_CHARS.charAt(Math.floor(Math.random() * DIY_ID_CHARS.length)); }
    return 'prompt_' + Date.now() + '_' + s;
  }

  /* 读侧：写作指导分区 + 可选组 + 现有自定义条目。opts.anchorCards 由引导页传它的
     「文风页卡片名」（PAGE_GROUPS 里那份），卡片改名后仍能命中；不传就只按层级名找。 */
  function readCustomStyleState(opts) {
    var raw = readTree();
    if (!raw.ok) { return { ok: false, code: 'NO_TREE', detail: raw.error || '' }; }
    var sec = null;
    try { sec = customStyleSections(raw.tree.tabs, (opts && opts.anchorCards) || null); } catch (e) { sec = null; }
    if (!sec) { return { ok: false, code: 'NO_SECTION', detail: DIY_LAYER_HINT }; }
    var prompts = raw.settings.prompts || [];
    var order = raw.order.order || [];
    var entries = [];
    try { entries = customStyleEntries(prompts, order, raw.tree.tabs); } catch (e2) { entries = []; }
    return {
      ok: true, code: null, detail: '',
      layerName: sec.layerName,
      closeIdentifier: sec.closeIdentifier,
      /* false = 收尾标记读不到 → 界面禁用保存（写侧也会硬拒绝，这里只是别让用户白点） */
      closeOk: !!sec.closeIdentifier,
      groups: sec.cards,
      entries: entries,
      promptCount: prompts.length,
      orderLength: order.length,
    };
  }

  /* 写侧。req = { anchorCards, adds:[{display,groupHeadId,content}], updates:[{identifier,display,groupHeadId,content}], removes:[identifier] } */
  function applyCustomStyles(req) {
    if (disposed || savingBusy()) { return { ok: false, code: 'SAVE_BUSY', detail: disposed ? '脚本已关闭' : SAVE_BUSY }; }
    req = req || {};
    var live = readTree();
    if (!live.ok) { return { ok: false, code: 'NO_TREE', detail: live.error || '' }; }
    var sec = null;
    try { sec = customStyleSections(live.tree.tabs, req.anchorCards || null); } catch (e) { sec = null; }
    if (!sec) { return { ok: false, code: 'NO_SECTION', detail: DIY_LAYER_HINT }; }
    /* 收尾标记是插入位置的最后一道边界：读不到就拒绝写入，**不放它去走退化路径** */
    if (!sec.closeIdentifier) { return { ok: false, code: DIY_NO_SECTION_END, detail: sec.layerName || '' }; }

    var settings = live.settings;
    var orderList = settings.prompt_order || [];
    var orderEntry = live.order;
    var orderIdx = -1, i;
    for (i = 0; i < orderList.length; i++) { if (orderList[i] === orderEntry) { orderIdx = i; break; } }
    if (orderIdx < 0) { return { ok: false, code: 'ORDER_SHAPE', detail: 'prompt_order 里找不到当前那一条' }; }

    /* ④ 结构断言 + 算计划（计划里也会再断言一次条数与 character_id） */
    var plan = planCustomStyleWrite({
      prompts: settings.prompts || [],
      order: orderEntry.order || [],
      orderEntryCount: orderList.length,
      charId: orderEntry.character_id,
      groups: sec.cards,
      sectionEndId: sec.closeIdentifier,
      adds: req.adds || [],
      updates: req.updates || [],
      removes: req.removes || [],
      newId: diyNewIdentifier,
    });
    if (!plan.ok) { return { ok: false, code: plan.code, detail: plan.detail }; }
    var hasWork = plan.report.added.length || plan.report.updated.length || plan.report.removed.length;
    if (!hasWork) { return { ok: true, code: null, detail: '', report: plan.report, nothing: true }; }

    /* ⑤ 快照：任何异常都退回这一份，内存与磁盘绝不分家 */
    var snapPrompts = JSON.stringify(settings.prompts || []);
    var snapOrder = JSON.stringify(orderEntry.order || []);
    function diyRollback(force) {
      if (!force && (JSON.stringify(settings.prompts) !== JSON.stringify(plan.nextPrompts) || JSON.stringify(orderEntry.order) !== JSON.stringify(plan.nextOrder))) {
        log('自定义文风保存失败，但后续设置已经变化，保留后续编辑'); return;
      }
      try { settings.prompts = JSON.parse(snapPrompts); } catch (e3) { }
      try { orderEntry.order = JSON.parse(snapOrder); } catch (e4) { }
      log('自定义文风：已回滚内存改动（预设文件没有被改动）');
    }

    function diyFail(code, detail) {
      diyRollback(true);
      try { refresh(true); } catch (e5) { }
      return { ok: false, code: code, detail: detail || '' };
    }

    /* ① 写进活设置（两个数组一起换） */
    try {
      settings.prompts = plan.nextPrompts;
      orderEntry.order = plan.nextOrder;
    } catch (e6) {
      return diyFail('APPLY_FAIL', (e6 && e6.message) || String(e6));
    }

    /* ② 逐字段对比：读回来的必须与计划完全一致，并且增删的条目确实到位了 */
    var check = readRaw();
    if (!check.ok) { return diyFail('VERIFY_FAIL', check.error || ''); }
    var livePrompts = check.settings.prompts || [];
    var liveOrder = check.order.order || [];
    if (JSON.stringify(livePrompts) !== JSON.stringify(plan.nextPrompts) ||
        JSON.stringify(liveOrder) !== JSON.stringify(plan.nextOrder)) {
      return diyFail('VERIFY_FAIL', '读回来的数组与写入计划不一致');
    }
    if (livePrompts.length !== plan.report.after.prompts || liveOrder.length !== plan.report.after.order) {
      return diyFail('VERIFY_FAIL', '条数对不上');
    }
    var probe = null;
    for (i = 0; i < plan.report.added.length; i++) {
      probe = plan.report.added[i].identifier;
      if (!indexOfIdentifier(livePrompts, probe) || !indexOfIdentifier(liveOrder, probe)) {
        return diyFail('VERIFY_FAIL', '新增条目没到位：' + probe);
      }
    }
    for (i = 0; i < plan.report.removed.length; i++) {
      probe = plan.report.removed[i];
      if (indexOfIdentifier(livePrompts, probe) || indexOfIdentifier(liveOrder, probe)) {
        return diyFail('VERIFY_FAIL', '删除条目还留着：' + probe);
      }
    }

    /* ③ 落盘：走酒馆自己的保存通道；失败由 watchSave 回调把快照退回来 */
    var saved = savePresetFile(check.ctx, check.settings, null, function (r) {
      diyRollback();
      toast('error', '预设没写进去（HTTP ' + (r && r.status) + '），自定义文风的改动已退回');
      try { refresh(true); } catch (e7) { }
    });
    if (!saved.ok) { return diyFail('SAVE_FAIL', saved.msg || ''); }

    /* ④ 让**酒馆原生预设面板**自己重画一次。
       它只在收到 OAI_PRESET_CHANGED_AFTER 时才重读条目列表；不 emit 的话，用户切到酒馆原生面板
       看到的还是改动前的旧样子 —— 2026-10-05 用户报「删除没有用」，根因就是这个，删除本身没坏。
       与变量那条写入路径（commitVars）用的是同一个 notifyPresetChanged，拿不到环境时它会自己跳过、不影响落盘结果。 */
    try { notifyPresetChanged(check.ctx); } catch (e9) { }

    log('自定义文风：' + JSON.stringify(plan.report.before) + ' → ' + JSON.stringify(plan.report.after) +
      '｜增 ' + plan.report.added.length + ' 删 ' + plan.report.removed.length +
      ' 改 ' + plan.report.updated.length + ' 搬家 ' + plan.report.orderMoved.length +
      ' 互斥关闭 ' + plan.report.deselected.length + '｜落盘 ' + saved.name);
    try { refresh(true); } catch (e8) { }
    return { ok: true, code: null, detail: '', report: plan.report, saved: saved, nothing: false };
  }

  /* 排障用：把两段文本的差异点出来（只差一个数字时，这里会打印出被换掉的那一段） */
  function diffDots(a, b) {
    var i = 0, k = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) { i++; }
    while (k < a.length - i && k < b.length - i && a.charAt(a.length - 1 - k) === b.charAt(b.length - 1 - k)) { k++; }
    return '差异位置 ' + i + ' 「' + a.slice(i, a.length - k) + '」→「' + b.slice(i, b.length - k) + '」';
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
    /* 「🧰 其他功能」（2026-09-30 用户点名）：放那些不知道该塞到哪一页的功能入口。
       位置固定 —— 排在「关于」**前面**、预设结构那几页后面，所以它要在这里、在 aboutTab 之前 push。 */
    out.push(aboutTab());
    /* v0.6：「更新合并」裁决页（远程更新开着时才出现）。要**排在最前**——
       用户正等着完成一次更新，别让它在 tab 行最后一格里被淹没。 */
    if (mergeCtx) { out.unshift(mergeTab()); }
    return out;
  }

  /* 「更新合并」页的定义：只在 70 号传来计划时存在（openMergeReview 建 / 关掉撤）。
     它不依赖预设解析结果 —— 读不到预设时也要能出（裁决与解析是两回事，见 renderTabs）。 */
  function mergeTab() {
    var inh = !!(mergeCtx && mergeCtx.plan && mergeCtx.plan.inherit);
    return { key: 'MERGE', title: inh ? '🔀 继承旧预设' : '🔀 更新合并', special: 'merge', cards: [], own: [] };
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
    return createKamiUi(HDOC).element(tag, cls, text == null ? undefined : String(text));
  } /* ── 面板事件（照搬 30-皮肤管理.js 的 pointer 分段结构：先判动作，再分派） ──
 ── 角色名样式这一行 ──
     ⚠️ 2026-09-28 用户裁定：它**不在这块面板里了**，搬去了「🎨 皮肤管理面板 → 显示」那张卡
     （理由：两件事都是显示相关，不涉及预设本身的调整）。实现与 API 见 src/scripts/35-提示词发送修改.js，
     它的界面归 30-皮肤管理.js 的 nameWrapRow()。这里一个字都不留，免得两处各长一份。 */

  /* 条目卡本体、角标（emoji 摘取）、ⓘ 标记、注释外包层的结构**全部在共享模块里**：
     src/scripts/_preset-cards.js（构建期内联，见文件头的 buildItemsGrid / buildItemCard）。
     引导面板的模型页用的是同一份 —— 同一颗卡片在两块面板里不会再各写一套（契约 §4.4）。 */
 /* ───────── 「🔀 更新合并」页（v0.6；远程更新 v1.4 的三方合并裁决） ─────────
     数据（plan）由 70 号算好带进来：{ degraded, stats, conflicts:[{key,kind,id,name,fields}] }。
     本页只做三件事：列出待裁决项（每项一张卡）、一键选边、提交 onApply(plan)。
     不内联合并引擎 —— 计算、备份、写盘都在 70 号那边。
     类名只用契约已登记的（卡片 / 字段行 / 分段切换 / 按钮），不新增皮肤类名。 */
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

  /* 预设版本。**首选是打包时写进来的产物名**（SELF_NAME，2026-09-26 用户点名）：
     版本号的唯一真相是仓库根目录的 version.json，构建时把它写进脚本文本，
     于是「本机是哪个版本」与用户怎么给预设改名无关 —— 以前只看当前预设名，
     用户一改名（改成「我的卡密预设」之类）这里就显示不出年份与构建号了。
     认不出才退回当前预设名，认不出返回 null。
     ⚠️ 与 70-远程更新.js 的 parseVersion 是同一套命名规则的两份实现：那边管「比大小」，
     这份只管「显示」。不共用是为了让面板不依赖那个脚本是否在运行（它可能被用户关掉）——
     这一条现在依然成立：这里是**构建期常量**，不是去读别的脚本。 */
  var SELF_NAME = '@@KAMI_PRESET_NAME@@';
  function presetVersionOf(name) {
    var hit = presetVersionLabel(SELF_NAME);
    if (hit) { return hit; }
    return presetVersionLabel(name);
  }
  function presetVersionLabel(name) {
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

  /* 「🔄 远程更新」脚本的全局 API（它挂在宿主窗口上；拿不到就返回 null） */
  function kamiUpdateApi() {
    var api = null;
    try { if (HOST && HOST.KamiUpdate) { api = HOST.KamiUpdate; } } catch (e) { }
    if (!api) { try { if (typeof KamiUpdate !== 'undefined' && KamiUpdate) { api = KamiUpdate; } } catch (e) { } }
    return (api && typeof api.check === 'function') ? api : null;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * 🧰 其他功能 → 「自动标签处理」（2026-09-30 用户点名）
   * ----------------------------------------------------------------------
   * 干什么：AI 回复里的成对标签（`<content>…</content>` 这种）**没闭合**时，自动把结尾补上，
   *   或者把配不上对的标签本身删掉。三档：关闭 / 补全 / 删除。
   *
   * 为什么值得做（调研结论见 .audit/标签调研.md）：
   *   · `<content>` 没闭合 → 「前端|正文」那条正则零匹配 → 正文外壳（标题/字数/双视图/复制）整块不出现；
   *   · `<summary>` 没闭合是**双重伤害** → 摘要原文露在楼层里，而且「压缩|摘要/设定」要求
   *     至少一组完整闭合对，零匹配时整层全文照发，**压缩静默失效**；
   *   · `<options>` / `<nyaruko_think>` 没闭合 → 行动选项表 / 思维链组件直接不渲染，裸文本露出来。
   *
   * 在哪儿动手：`MESSAGE_RECEIVED`。非流式时它发在界面渲染**之前**（一改就生效、不会闪），
   *   流式时发在渲染之后（改完用 setChatMessages 的 refresh 重新渲染那一楼）。两条路一条订阅都覆盖。
   *   为什么改的是聊天记录而不是「只改发出去的那份」：屏幕上的显示本身就要修 ——
   *   思维链/正文/行动选项三个前端都是正则跑在消息文本上的，文本不修，显示就一直坏着。
   *
   * 标签名单与「补在哪儿」的规则全在 _tags-pure.js（构建期内联在文件头），这里只管：
   *   读设置、挂事件、把结果显示到面板上。手动按钮「处理当前楼层」先扫再问。
   * ══════════════════════════════════════════════════════════════════════ */

  var TAGFIX_VAR = 'tagFix';
  var TAGFIX_CUSTOM_VAR = 'tagFixCustom';
  var TAGFIX_ALL_VAR = 'tagFixAll';
  var TAGFIX_MODES = [
    { id: 'off', label: '关闭' },
    { id: 'close', label: '补全' },
    { id: 'del', label: '删除' }
  ];
  /* 面板文案：2026-09-30 由文案 Agent（Gemini）出稿，用户裁定「说明折叠进 ⓘ」。
     我（实现者）只做了两处事实订正，不改语气：
       · 「标签头」→「标签」（前者是行话，用户看不懂）
       · 「遇到其他完整的标签还会提前收口以免吞掉它们」→ 说清是「补在它们前面」 */
  var TAGFIX_COPY = {
    title: '自动标签处理',
    note: 'AI 忘写结尾标签会导致正文或选项不显示，也会让摘要压缩失效。' +
      '你可以在下面填入需要自动收拾的标签名，打开覆盖模式管得更宽，所有标签都管，HTML 标签除外。' +
      '开启补全或删除时，会先把思维链里的标签引用改成全角尖括号，防止它们触发预设或角色卡正则。' +
      '补全把结尾紧贴缺失的开始标签补上；删除会扔掉没配对的标签。关闭则保持原样。',
    modeLabel: '处理方式',
    modeHint: '关闭不干预，补全自动加结尾，删除清掉多余的标签',
    allLabel: '覆盖模式',
    allHint: '正文里任何标签都按当前档位处理，网页自带的 HTML 标签（如 br、div）除外。',
    allChip: '全覆盖',
    customLabel: '自定义标签',
    customHint: '填入其他要处理的标签，用空格隔开',
    manualLabel: '手动处理',
    manualBtn: '处理当前楼层',
    manualHint: '手动对当前楼层执行一次检查和处理',
    statLabel: '本次会话',
    statNone: '等待处理',
    /* 确认窗短句：2026-09-30 由文案 Agent（Gemini）出稿。用户裁定「窗里报的是**这一次实际会改什么**」，
       所以这些引子后面拼的是扫出来的真实条目，不是「我管哪些标签」那张表。 */
    scanLead: '刚刚扫出的结果，请确认：',
    closeLead: '要补上的结尾：',
    removeLead: '要删掉的标签：',
    referenceLead: '要保护的思维链引用：',
    strayNote: '另有 %n% 处落单的结尾标签没动。',
    confirmNote: '这会直接修改当前楼层的文字，操作没法撤销。',
    confirmOk: '确认执行',
    confirmCancel: '取消',
    nothing: '这层很干净，不用改。',
    confirmDone: '处理完了，聊天记录里的显示会立刻更新。',
    confirmFail: '处理失败：',
    noFloor: '找不到可处理的楼层。',
    noPopup: '因为弹不出确认提示，所以什么都没改。',
    needApi: '这个功能需要酒馆助手提供消息读写接口，当前版本拿不到。'
  };
  /* 「🧰 其他功能 → 常驻附加指令」那张卡的文案。**用户 2026-09-30 本人逐字给定**，
     实现者一字未改（留档见 design/copy/godcmd-copy.json）。它管的是 35 号脚本里那套注入，
     面板只负责读写两个全局变量：kami_god_cmd（正文）/ kami_god_cmd_on（'1' 开）。
     为什么不存脚本变量：脚本变量是每个脚本各自一份，35 号读不到（跨脚本只能走全局变量）。 */
  var GODCMD_COPY = {
    title: '常驻附加指令',
    note: '打开后，你每发一条消息，脚本都会把下面这段内容接在最后，一起发给模型。' +
      '它只进提示词，聊天记录里看不见，也不会动你的输入框。' +
      '这段内容会用预设里的最高权限标签包起来，适合把长期不变的规矩钉住，不用每轮手打。' +
      '内容留空就等于没开。',
    switchLabel: '开关',
    modeOff: '关闭',
    modeOn: '开启',
    textLabel: '指令内容',
    textHint: '会包在 <god> 标签里，接在你每条消息的末尾',
    emptyWarn: '内容还是空的，先填点什么再打开'
  };

  var tagFixMode = 'off';
  var tagReferenceRelease = null, tagReferenceLast = null;
  function syncTagReferenceResponse() {
    if (tagReferenceRelease) { tagReferenceRelease(); tagReferenceRelease = null; }
    if (disposed || tagFixMode === 'off') { return; }
    var rewrite = createTagReferenceResponse(createKamiResponseTransport(), createReasoningReferenceStream, function (stats) {
      if (disposed) { return; }
      tagReferenceLast = stats;
      if (stats.references || stats.recovered) { log('正则前保护 ' + stats.references + ' 处思维链引用' + (stats.recovered ? '，恢复正文边界 ' + stats.recovered + ' 处' : '')); }
      if (stats.incomplete) { toast('warning', '思维链结束边界缺失，请检查当前楼层'); }
    });
    tagReferenceRelease = kamiResponsePipeline(HOST).register('tag-references', 20, async function (next, ctx, args) {
      var response = await next(args);
      return disposed || tagFixMode === 'off' ? response : rewrite(response);
    });
  }
  var tagFixCustom = [];                       // 用户自定义标签（面板上那个输入框）
  var tagFixAll = false;                       // 覆盖模式：登记表之外的标签也按当前档位处理
  var tagFixStat = { fixed: 0, lastFloor: -1, lastText: '' };
  var tagFixEls = null;
  var godcmdEls = null;                     // 「常驻附加指令」那张卡的元素（每次渲染重建）
  var tagFixCurFloor = -1;                     // 「当前楼层」= 用户最后点过的那一楼（没有就退回最新一楼）
  var tagFixSelection = null, tagFixWatchNode = null, tagFixFloorHandler = null;
  var continuationEnvelope = null;
  function tagFixChatStamp() {
    var c = stCtx() || {};
    return { chat: c.chat, id: JSON.stringify([c.characterId, c.groupId, c.chatId]) };
  }
  function tagFixSameChat(a, b) { return !!a && !!b && a.chat === b.chat && a.id === b.id; }
  function unbindChatFloorWatch() {
    if (tagFixWatchNode && tagFixFloorHandler) {
      try { tagFixWatchNode.removeEventListener('click', tagFixFloorHandler, true); } catch (e) { }
      if (tagFixWatchNode.__kamiTagfixWatch === tagFixFloorHandler) {
        delete tagFixWatchNode.__kamiTagfixWatch;
        tagFixWatchNode.removeAttribute('data-kami-tagfix-floor');
      }
    }
    tagFixWatchNode = null; tagFixFloorHandler = null;
  }

  function tagFixModeSpec(id) {
    for (var i = 0; i < TAGFIX_MODES.length; i++) { if (TAGFIX_MODES[i].id === id) { return TAGFIX_MODES[i]; } }
    return TAGFIX_MODES[0];
  }
  /* 这一次实际要管的标签 = 内置登记表 + 用户自定义 */
  function tagFixSpecs() { return specsWithCustom(tagFixCustom); }
  function tagFixApiReady() {
    return (typeof getChatMessages === 'function') && (typeof setChatMessages === 'function');
  }
  /* 酒馆助手的消息接口：读一楼 / 读整段聊天 / 楼层总数 */
  function chatMsgAt(i) {
    try {
      var list = getChatMessages(String(i));
      return (list && list.length) ? list[0] : null;
    } catch (e) { return null; }
  }
  function chatLen() {
    try {
      var c = stCtx();
      if (c && c.chat && typeof c.chat.length === 'number') { return c.chat.length; }
    } catch (e) { }
    try {
      var el = HDOC.querySelectorAll('#chat .mes').length;
      return el || 0;
    } catch (e) { return 0; }
  }
  /* 「当前楼层」：优先用户最后点过的那一楼，否则最新的一楼（AI 楼层才算数） */
  function currentFloorId() {
    if (!tagFixSameChat(tagFixSelection, tagFixChatStamp())) { tagFixCurFloor = -1; tagFixSelection = null; }
    var n = chatLen();
    if (!n) { return -1; }
    var seq = [], i, m;
    if (tagFixCurFloor >= 0 && tagFixCurFloor < n) { seq.push(tagFixCurFloor); }
    seq.push(n - 1);
    if (tagFixCurFloor === n - 1) { seq = [n - 1]; }
    for (i = 0; i < seq.length; i++) {
      m = chatMsgAt(seq[i]);
      if (m && !m.is_user) { return seq[i]; }
    }
    return -1;
  }
  /* 记「用户点了哪一楼」：被动监听，不改 DOM、不拦事件。 */
  function bindChatFloorWatch() {
    try {
      var chat = HDOC.getElementById('chat');
      if (!chat || (chat === tagFixWatchNode && tagFixFloorHandler)) { return; }
      unbindChatFloorWatch();
      if (chat.__kamiTagfixWatch) { chat.removeEventListener('click', chat.__kamiTagfixWatch, true); }
      tagFixWatchNode = chat;
      chat.setAttribute('data-kami-tagfix-floor', '1');
      tagFixFloorHandler = function (ev) {
        if (disposed) { return; }
        try {
          var node = ev.target;
          while (node && node !== chat) {
            if (node.getAttribute && node.getAttribute('mesid') !== null) {
              var id = parseInt(node.getAttribute('mesid'), 10);
              if (isFinite(id) && id >= 0) { tagFixCurFloor = id; tagFixSelection = tagFixChatStamp(); }
              return;
            }
            node = node.parentNode;
          }
        } catch (e) { }
      };
      chat.__kamiTagfixWatch = tagFixFloorHandler;
      chat.addEventListener('click', tagFixFloorHandler, true);
    } catch (e) { }
  }

  /* 处理一条文本：返回 repairTags 的结果；关闭档或没变化时返回 null。
     第 4 个参数是「覆盖模式」：为真时登记表之外的标签也一起处理（HTML 自带标签除外）。 */
  function tagFixText(text, mode) {
    var m = mode || tagFixMode;
    if (m === 'off') { return null; }
    var res = null;
    try {
      var safe = protectReasoningReferences(text);
      if (safe.stats.incomplete) { log('思维链结束边界缺失：保留原文，请检查当前楼层'); return null; }
      /* 边界仍缺失时不让旧补全把真正思维链起始标签变成空壳。 */
      res = repairTags(safe.text, safe.stats.incomplete ? 'off' : m, tagFixSpecs(), tagFixAll);
      if (safe.stats.references || safe.stats.recovered) {
        res.references = safe.stats.references; res.recovered = safe.stats.recovered;
        res.changed = true;
        res.changes.unshift({ kind: 'reference', tag: '思维链引用', label: '全角尖括号', from: '思维链中的标签 → 普通文字', n: safe.stats.references + safe.stats.recovered });
      }
    } catch (e) { log('标签处理出错：' + ((e && e.message) || e)); return null; }
    return (res && res.changed) ? res : null;
  }

  /* 「收到消息」那条路：改完等它写完再返回 —— 酒馆的 emit 会 await 监听器，
     非流式时这一步跑在界面渲染之前（正则还没跑），所以用户看不到「先闪一下坏的、再变好」。
     流式那条路做不到「渲染前」：完整正文要等流结束才存在（调研 B2），只能改完补一次重画。 */
  function tagFixOnReceived(id) {
    if (disposed || tagFixMode === 'off' || !tagFixApiReady()) { return; }
    var idx = (typeof id === 'number' && isFinite(id)) ? id : (chatLen() - 1);
    if (idx < 0) { return; }
    var m = chatMsgAt(idx);
    if (!m || m.is_user) { return; }
    var res = tagFixText(m.message);
    if (!res) { return; }
    tagFixStat.fixed++;
    tagFixStat.lastFloor = idx;
    tagFixStat.lastText = describeFix(res);
    paintTagFixStat();
    log('第 ' + idx + ' 楼：' + tagFixStat.lastText);
    try {
      return setChatMessages([{ message_id: idx, message: res.text }], { refresh: 'affected' });
    } catch (e) { log('写回第 ' + idx + ' 楼失败：' + ((e && e.message) || e)); }
  }

  function continuationOnReady(data) {
    if (disposed || !data || !Array.isArray(data.messages)) { return; }
    if (data.messages.some(function (row) { return row.role === 'system' && typeof row.content === 'string' && row.content.indexOf('__kami_search_private_') >= 0; })) { return; }
    if (['normal', 'regenerate', 'swipe', 'continue'].indexOf(data.type) < 0) { return; }
    continuationEnvelope = null;
    if (data.type !== 'continue') { return; }
    var c = stCtx() || {}, last = (c.chat || []).slice(-1)[0];
    if (last && !last.is_user && typeof last.mes === 'string') { continuationEnvelope = { stamp: tagFixChatStamp(), index: c.chat.length - 1, before: last.mes }; }
  }
  async function continuationOnReceived(id) {
    var item = continuationEnvelope;
    if (!item || disposed || !tagFixApiReady() || !tagFixSameChat(item.stamp, tagFixChatStamp())) { return; }
    var idx = typeof id === 'number' ? id : chatLen() - 1;
    if (idx !== item.index) { return; }
    var row = chatMsgAt(idx);
    if (!row || row.is_user) { return; }
    var next = mergeContinuedOutBody(row.message, item.before);
    if (next === row.message) { return; }
    continuationEnvelope = null;
    await setChatMessages([{ message_id: idx, message: next }], { refresh: 'affected' });
    log('第 ' + idx + ' 楼：已合并续写的重复外层标签');
  }

  /* 确认窗：必须在预设面板**上面**。酒馆原生弹窗的层级与面板同为 30000，
     而面板是脚本后挂进 body 的、DOM 顺序在后面 —— 不处理就会被盖住（用户实测点名）。
     做法：弹窗期间把面板舞台临时压到 1，弹完恢复。只动自己那个元素的层级，不碰酒馆 DOM。

  /* 确认窗里那份「这次会处理哪些标签」= 当前登记表（含自定义）逐个人话列出。
     2026-09-30 用户裁定后**不再用它**：窗里改成报这一次实际会改的条目（describeChanges 的结果）。
     留着这段注释是为了记住那张表去哪了 —— 要是哪天想做成「查看我管哪些标签」的入口，可以从这里捡回去。 */

  function setTagFixMode(id) {
    var spec = tagFixModeSpec(id);
    tagFixMode = spec.id;
    syncTagReferenceResponse();
    saveVars();
    log('自动标签处理 → ' + spec.label);
    paintTagFixStat();
    /* 面板上的三档按钮与卡片头右端那枚标签都要跟着亮（noteMark 是行内记号，不带 data-kami-corner） */
    if (tagFixEls && tagFixEls.seg) {
      var btns = tagFixEls.seg.querySelectorAll('[data-kami-tagfix]');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-kami-tagfix') === tagFixMode;
        btns[i].className = 'kami-seg-item' + (on ? ' is-on' : '');
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    if (tagFixEls && tagFixEls.chip) { tagFixEls.chip.textContent = tagFixChipText(); }
  }

  /* 卡片头那枚 chip 的文字：只显示档位；覆盖开着时补一句「全覆盖」。
     三处共用：初次渲染、切档（setTagFixMode）、翻转覆盖开关（setTagFixAll）。 */
  function tagFixChipText() {
    return tagFixModeSpec(tagFixMode).label + (tagFixAll ? (' · ' + TAGFIX_COPY.allChip) : '');
  }

  /* 覆盖模式开关：登记表之外的标签也按当前档位处理（HTML 自带标签除外，由纯逻辑那边放行）。
     状态跟着预设走，所以翻转后要 saveVars()；开关本体与卡片头 chip 一起刷新。 */
  function setTagFixAll(on) {
    tagFixAll = !!on;
    saveVars();
    log('自动标签处理 → 覆盖模式' + (tagFixAll ? '开启' : '关闭'));
    if (tagFixEls && tagFixEls.all && tagFixEls.all.setChecked) { tagFixEls.all.setChecked(tagFixAll); }
    if (tagFixEls && tagFixEls.chip) { tagFixEls.chip.textContent = tagFixChipText(); }
  }

  /* 自定义标签输入框：失焦或回车时解析并存盘（不重建面板，免得正在打字时被打断） */
  function setTagFixCustom(text) {
    var list = parseCustomTags(text);
    var before = tagFixCustom.join(',');
    tagFixCustom = list;
    if (tagFixEls && tagFixEls.custom && tagFixEls.custom.value !== list.join(' ')) {
      tagFixEls.custom.value = list.join(' ');
    }
    if (before !== list.join(',')) {
      saveVars();
      log('自定义标签：' + (list.length ? list.join(' ') : '（清空）'));
    }
    return list;
  }

  /* 状态行：面板没开时是空操作（元素是渲染时挂上来的）。
     ⚠️ 它走 .kami-card-note（整段文字会换行），**不是 .kami-field 的值列** ——
     状态文本会长到「已处理 3 楼（最近：第 12 楼 补全 1 处（content））」，塞进值列会把
     「本次会话」这个标签挤成竖排单字（实测踩过两次，另一处是「管的标签」）。 */
  function paintTagFixStat(extra) {
    if (!tagFixEls || !tagFixEls.stat) { return; }
    if (extra) { tagFixEls.stat.textContent = TAGFIX_COPY.statLabel + '：' + extra; return; }
    if (!tagFixStat.fixed) { tagFixEls.stat.textContent = TAGFIX_COPY.statLabel + '：' + TAGFIX_COPY.statNone; return; }
    tagFixEls.stat.textContent = TAGFIX_COPY.statLabel + '：已处理 ' + tagFixStat.fixed + ' 楼（最近：第 ' +
      (tagFixStat.lastFloor + 1) + ' 楼 ' + tagFixStat.lastText + '）';
  }

  /* ───────── 常驻附加指令（第二张卡；第一张是「自动标签处理」） ─────────
     档位与文本存在**酒馆全局变量**里：真正的注入在 35-提示词发送修改.js（那边只读），
     面板这里只读写；两边共用的键名写死在这两处，改一个另一个也得改。 */
  var VAR_GODCMD = 'kami_god_cmd';
  var VAR_GODCMD_ON = 'kami_god_cmd_on';

  function godVarRead(name) {
    var ctx = stCtx();
    if (!ctx) { return null; }
    try {
      if (ctx.variables && ctx.variables.global && typeof ctx.variables.global.get === 'function') {
        var v = ctx.variables.global.get(name);
        return (v === undefined || v === null) ? null : String(v);
      }
    } catch (e) { }
    try {
      var g = ctx.extensionSettings && ctx.extensionSettings.variables && ctx.extensionSettings.variables.global;
      if (g && Object.prototype.hasOwnProperty.call(g, name)) { return String(g[name]); }
    } catch (e) { }
    return null;
  }

  function godVarWrite(name, value) {
    var ctx = stCtx();
    if (!ctx) { return false; }
    try {
      if (ctx.variables && ctx.variables.global && typeof ctx.variables.global.set === 'function') {
        ctx.variables.global.set(name, value);
      } else {
        if (!ctx.extensionSettings) { return false; }
        if (!ctx.extensionSettings.variables) { ctx.extensionSettings.variables = {}; }
        if (!ctx.extensionSettings.variables.global) { ctx.extensionSettings.variables.global = {}; }
        ctx.extensionSettings.variables.global[name] = value;
      }
    } catch (e) {
      log('写全局变量失败：' + ((e && e.message) || e));
      return false;
    }
    try { if (typeof ctx.saveSettingsDebounced === 'function') { ctx.saveSettingsDebounced(); } } catch (e) { }
    return true;
  }

  /* 两个全局变量的当前值。开关缺省即关（拿不到酒馆上下文也按关处理：绝不假装开着）。 */
  function readGodCmd() {
    return { on: godVarRead(VAR_GODCMD_ON) === '1', text: (godVarRead(VAR_GODCMD) || '') };
  }
  function toggleGodCmd(force) {
    var want = (force === undefined) ? !readGodCmd().on : !!force;
    /* 用户点名：内容还是空的就先别打开，并说清原因（两处都要照顾到） */
    if (want && !readGodCmd().text.replace(/\s/g, '')) {
      toast('warning', GODCMD_COPY.emptyWarn);
      paintGodCmdCard();
      return false;
    }
    godVarWrite(VAR_GODCMD_ON, want ? '1' : '0');
    log('常驻附加指令 → ' + (want ? '开启' : '关闭'));
    paintGodCmdCard();
    return true;
  }
  function setGodCmdText(text) {
    var v = (text === null || text === undefined) ? '' : String(text);
    godVarWrite(VAR_GODCMD, v);
    log('常驻附加指令正文已保存（' + v.length + ' 字）');
    paintGodCmdCard();
  }

  /* @@KAMI_TOOLS_BRIDGE@@ */
  /* @@KAMI_PRESET_BRIDGE@@ */
  /* ───────── 🧰 「导出纯净正文」 ─────────
     用户要的：导出干净正文 TXT，可选楼层范围（默认全部）、可选是否只导 AI 消息。
     他点名问的难点是"酒馆一般不会渲染那么多楼层，怎么保证正常且高性能"——
     查证结果：**根本不要去读渲染界面**。酒馆只渲染最后 power_user.chat_truncation 条
     （默认 100，上限 1000；public/script.js:1379-1391 printMessages），
     3000 层的聊天 DOM 里只有 100 个 .mes —— 读 DOM 不是慢，是**会漏掉前面 2900 层**。
     聊天记录本身是 context.chat 这个数组，与渲染几个无关；读数组是纯内存操作。
     实测（3000 条典型消息）：纯字符串拼接 <1 ms；
     真正花时间的是酒馆自己那条正文处理链（showdown + 净化）约 0.66 ms/条 → 3000 条约 2 秒。
     所以这里**分片跑**（每片约 60 ms，片间让出主线程）并显示进度，界面不会卡死。 */
  var EXPORT_NOTICE = {
    title: '导出纯净正文',
    note: '把当前聊天的正文导成 TXT。楼层范围留空表示全部；范围用你看到的楼层号（第 1 层在最上面）。',
    rangeLabel: '楼层范围',
    rangeFromHint: '起始',
    rangeToHint: '结束',
    scopeLabel: '导出范围',
    scopeAll: '全部',
    scopeAi: '仅 AI',
    scopeAllHint: '用户与 AI 的消息都导；每条前面写 role：user / role：assistant',
    scopeAiHint: '只导 AI 的消息，不写 role 前缀',
    btn: '导出 TXT',
    working: '正在处理',
    goodPath: '导出的是酒馆自己处理后交给页面显示的正文，与你在聊天里看到的一致。',
    goodPath: '只取每条消息里 content 块中的正文，再去掉标签、还原段落换行；' +
      '<content> 之外的东西（前端代码、围栏代码块、指令）一律不进导出。',
    badPath: '⚠️ 这次导出的是**按标签规则清洗过的原始文本**，不是所见即所得 —— 排版可能与聊天里看到的不一样。'
  };

  /* 这一条的导出正文：**只取原始消息里 content 块那一截**，不看渲染结果。
     ── 2026-10-05 用户报「把 <content> 前后的前端代码都导出来了」，根因在这里 ──
     预设「前端|显式思维链 v0.1」那条正则的 replaceString 开头是
     换行 + 三个反引号 + <!DOCTYPE html>（src/preset.base.json:134）——
     它把整份前端 HTML 塞进围栏代码块。渲染之后，代码块里的可见文本就是那段 HTML 源码，
     所以"从渲染结果取文本"必然把前端代码当正文导出去。
     改法：回到 pick.raw（原始消息），只取 content 块；块内部再走去标签 + 换行还原。
     content 是用户自己定义的标记，边界确定，不是"用正则清洗一切"。
     ── 顺带解决了上一轮记录的那条副作用 ──
     之前走 ctx.messageFormatting，而它在 messageId === 0 时会把 substituteParams 后的文本
     写回 chat[0].mes（public/script.js:1527-1534；酒馆自己渲染第一层时也走这条路，
     script.js:1994-2002 传的正是 chat.indexOf(mes)）。现在**完全不再调用它**，
     导出对聊天数据就是只读的，那条副作用连同"要不要隔离"的问题一起消失了。 */
  function exportCleanOne(ctx, msg, pick) {
    return cleanMessageForExport(pick.raw);
  }

  function downloadTextFile(name, text) {
    var blob = new HOST.Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = HOST.URL.createObjectURL(blob);
    var a = HDOC.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    HDOC.body.appendChild(a);
    a.click();
    HDOC.body.removeChild(a);
    /* 立刻回收会让部分浏览器来不及取，留几秒 */
    setTimeout(function () { try { HOST.URL.revokeObjectURL(url); } catch (e) { } }, 4000);
  }


  /* 卡片上的开关态与两个控件同步。读的是**全局变量**（唯一真值），不是内存里的影子状态。 */
  function paintGodCmdCard() {
    var cur = readGodCmd();
    toolsNotify();
    if (!godcmdEls) { return; }
    if (godcmdEls.on) { godcmdEls.on.setChecked ? godcmdEls.on.setChecked(cur.on) : null; }
    if (godcmdEls.chip) { godcmdEls.chip.textContent = cur.on ? GODCMD_COPY.modeOn : GODCMD_COPY.modeOff; }
    if (godcmdEls.txt) {
      if (document.activeElement !== godcmdEls.txt) { godcmdEls.txt.value = cur.text; }
      /* 只置只读、不置 disabled：契约 §4.2 的置灰规则写的是 textarea[readonly]，
         用 disabled 反而顶不掉皮肤给 readonly 的样式。 */
      godcmdEls.txt.readOnly = cur.on;
    }
  }

  /* 写完之后核对：酒馆自己的预设选择有没有被挪走。
     用户真机撞到过（2026-09-28）：点完继承，酒馆的预设跳到了列表里**另一份**上去。
     不管是谁挪的（保存通道自己会 updateList + trigger change），这里统一拨回来：
     findPreset 按下拉框的**显示名**找 value，selectPreset 会触发 change，
     把刚写进去的那份重新载回活设置 —— 内存与磁盘因此还是同一份。 */
  function restorePresetSelection(ctx, wantName) {
    var pm = presetManagerOf(ctx);
    if (!pm || typeof pm.getSelectedPresetName !== 'function' || !wantName) { return { checked: false }; }
    var now = '';
    try { now = cleanName(pm.getSelectedPresetName()); } catch (e) { return { checked: false }; }
    if (now === wantName) { return { checked: true, moved: false, now: now, ok: true }; }
    log('⚠ 写完之后酒馆的预设选择是「' + now + '」，不是「' + wantName + '」→ 拨回来');
    var moved = false;
    try {
      if (typeof pm.findPreset === 'function' && typeof pm.selectPreset === 'function') {
        var val = pm.findPreset(wantName);
        if (val !== undefined && val !== null && val !== '') { pm.selectPreset(val); moved = true; }
      }
    } catch (e) { log('拨回预设选择失败：' + ((e && e.message) || e)); }
    var after = '';
    try { after = cleanName(pm.getSelectedPresetName()); } catch (e) { }
    return { checked: true, moved: moved, now: now, after: after, ok: after === wantName };
  }

  /* 把合并结果**覆盖到当前预设**（活的设置对象）并走酒馆自己的保存通道写盘。
     为什么不像远程更新那样导入成一个新预设：用户就是想让**现在这一份**把旧设置捡回来，
     再让他切来切去等于没省事。写盘前 70 号已经先把当前预设备份过了。
     覆盖前把要动的键各存一份，写盘失败就退回去 —— 不然内存与磁盘就分家了。 */
  /* 继承写盘后同步酒馆助手（2026-10-30 预览版用户报「继承不了」，实机查明）：
     酒馆助手在内存里另存一份当前预设的脚本树与预设变量，只在切换预设时才重读；继承写完盘后，
     任何脚本存一次变量，它就在 1 秒后把内存里那份旧脚本树写回预设——脚本开关、脚本里的设置
     （压缩、搜索、标签处理、皮肤……）全被盖回去。所以写完盘要把合并结果也交给它。
     它只按脚本 id / 名字 / 正文决定重启，data 变了不重启；开关变了的那几个脚本会被启停（用户在旧预设里就是这么设的）。 */
  function syncHelperStore(merged) {
    var th = null;
    try { th = HOST.TavernHelper || null; } catch (e) { th = null; }
    if (!th && typeof TavernHelper !== 'undefined') { th = TavernHelper; }
    var ext = merged && merged.extensions && merged.extensions.tavern_helper;
    if (!th || !ext) { log('⚠ 继承：拿不到酒馆助手或合并结果里没有脚本，跳过同步'); return false; }
    var ok = true;
    try { if (Array.isArray(ext.scripts) && typeof th.replaceScriptTrees === 'function') { th.replaceScriptTrees(JSON.parse(JSON.stringify(ext.scripts)), { type: 'preset' }); } }
    catch (e) { ok = false; log('⚠ 继承：同步脚本树到酒馆助手失败：' + ((e && e.message) || e)); }
    try { if (ext.variables && typeof ext.variables === 'object' && typeof th.replaceVariables === 'function') { th.replaceVariables(JSON.parse(JSON.stringify(ext.variables)), { type: 'preset' }); } }
    catch (e) { ok = false; log('⚠ 继承：同步预设变量到酒馆助手失败：' + ((e && e.message) || e)); }
    log('继承：已把合并后的脚本树与预设变量交给酒馆助手' + (ok ? '' : '（有一部分没成功）'));
    return ok;
  }

  /* 继承完成后的收尾（新旧面板共用）：只把「继承自」两项写进本脚本已继承来的变量里（不能用 saveVars——
     它会拿本脚本内存里的现值盖掉旧预设搬来的标签处理等设置），然后刷新页面，让每个脚本按搬来的设置重新启动。
     刷新前停掉本脚本后续的变量写入。 */
  var INHERIT_RELOAD_MS = 3000;
  var inheritReloading = false;
  function finishInherit(oldName) {
    inheritFromName = oldName || '';
    inheritAtText = nowText();
    try {
      if (typeof getVariables === 'function' && typeof replaceVariables === 'function') {
        var all = getVariables({ type: 'script' }) || {};
        var mine = (all[VARS_KEY] && typeof all[VARS_KEY] === 'object') ? all[VARS_KEY] : {};
        mine.inheritFrom = inheritFromName;
        mine.inheritAt = inheritAtText;
        all[VARS_KEY] = mine;
        replaceVariables(all, { type: 'script' });
      }
    } catch (e) { log('写「继承自」失败：' + ((e && e.message) || e)); }
    inheritReloading = true;
    if (saveTimer) { try { clearTimeout(saveTimer); } catch (e) { } saveTimer = null; }
    toast('success', '已从「' + inheritFromName + '」继承设置，' + Math.round(INHERIT_RELOAD_MS / 1000) + ' 秒后刷新页面生效');
    setTimeout(function () { try { HOST.location.reload(); } catch (e) { try { location.reload(); } catch (e2) { } } }, INHERIT_RELOAD_MS);
  }

  function applyInheritedToLive(merged, targetName) {
    if (disposed || savingBusy()) { return { ok: false, msg: disposed ? '脚本已关闭' : SAVE_BUSY }; }
    if (!merged || typeof merged !== 'object') { return { ok: false, msg: '合并结果不是一份预设' }; }
    var ctx = stCtx();
    if (!ctx) { return { ok: false, msg: '拿不到酒馆上下文，改动没有写盘' }; }
    var s = settingsOf(ctx);
    if (!s) { return { ok: false, msg: '读不到活设置，改动没有写盘' }; }
    /* ⚠️ 身份/管道字段一律不覆盖：它们回答的是「这是哪一份预设」，不是「设置了什么」。
       70 号那边已经钉过一道，这里再来一道 —— 这类字段一旦被别的预设的值盖掉，
       酒馆就会把预设切到别处去（真机撞到过的那个毛病）。 */
    var SKIP = { name: 1, preset_settings_openai: 1, preset_settings_novel: 1, preset_settings: 1 };
    var keys = [], k;
    for (k in merged) {
      if (!Object.prototype.hasOwnProperty.call(merged, k)) { continue; }
      if (SKIP[k]) { continue; }
      keys.push(k);
    }
    if (!keys.length) { return { ok: false, msg: '合并结果是空的，什么都没做' }; }
    var before = {}, changed = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      before[keys[i]] = s[keys[i]];
      var same = false;
      try { same = JSON.stringify(s[keys[i]]) === JSON.stringify(merged[keys[i]]); } catch (e) { same = false; }
      if (!same) { changed.push(keys[i]); }
      try { s[keys[i]] = merged[keys[i]]; } catch (e) { }
    }
    var r = savePresetFile(ctx, s, null, function () {
      /* 写盘失败（服务端没成功）：把刚覆盖的字段一个个放回去，内存与磁盘不能分家 */
      for (var j = 0; j < keys.length; j++) { try { if (s[keys[j]] === merged[keys[j]]) { s[keys[j]] = before[keys[j]]; } } catch (e) { } }
      toast('error', '继承结果没写进预设，已退回，你的设置没有变');
    }, targetName);
    if (!r.ok) {
      for (i = 0; i < keys.length; i++) { try { s[keys[i]] = before[keys[i]]; } catch (e) { } }
      return { ok: false, msg: (r.msg || '写盘失败') + '（已退回，改动一个字都没留下）' };
    }
    /* 写完之后把酒馆的预设选择钉回当前这一份（保存通道自己会挪它） */
    var sel = restorePresetSelection(ctx, r.name || targetName);
    syncHelperStore(merged);
    log('继承写盘完成：覆盖 ' + changed.length + ' 个字段（' + (changed.join('、') || '无变化') +
      '）→ 酒馆自己的通道落到「' + (r.name || targetName) + '」' +
      (sel.checked ? ('；预设选择=' + (sel.ok ? '正确' : '没拨回来')) : ''));
    return { ok: true, name: r.name || targetName, count: changed.length, changed: changed, sel: sel };
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

  /* 点模型卡片头 = 选中这个模型：开它名下全部条目 + 关掉归属集合与它毫无交集的条目。
     共用的那条（归属集合里有本模型）**不动它的开关**，只是留着（用户裁定）。
     ⚠️ 标签约定（2026-09-28 用户点名）：条目标题里带 **(非必要不开)** 的，
     **选模型时一律不跟着开** —— 它们是破限/抗审这类「平时不该开」的条目，
     要用的时候自己去条目卡上点开。别的模型条目照旧跟着模型开关走。
     为什么用标题标签而不是加个字段：标签本来就是给用户看的同一件事，
     两者合一才不会出现「名字写着非必要不开、选模型却把它开了」这种自相矛盾。 */
  function isOptionalOff(it) {
    return String((it && it.name) || '').indexOf('非必要不开') >= 0;
  }
  function selectModel(emoji) {
    if (!emoji) { return; }
    var pairs = [], seen = {}, i, skipped = [];
    eachItem(function (it) {
      var m = it.models || [];
      if (!m.length) { return; }                       // 非模型条目：不动
      if (seen[it.identifier]) { return; }
      seen[it.identifier] = true;
      var hit = m.indexOf(emoji) >= 0;
      if (hit) {
        if (it.enabled === false) {
          if (isOptionalOff(it)) { skipped.push(it.name); }   /* 标了「非必要不开」：不跟着开 */
          else { pairs.push({ identifier: it.identifier, value: true }); }
        }
      } else if (it.enabled !== false) { pairs.push({ identifier: it.identifier, value: false }); }
    });
    var res = commit(pairs);
    if (!res.ok) { toast('error', res.msg); renderStatus(); return; }
    currentModel = emoji;
    for (i = 0; i < pairs.length; i++) {
      syncModel(pairs[i].identifier, pairs[i].value);
    }
    saveVars();
    renderStatus();
    log('选中模型 ' + emoji + '（改动 ' + pairs.length + ' 条，当前模型闸门已重刷）' +
      (skipped.length ? '；按「非必要不开」跳过 ' + skipped.length + ' 条：' + skipped.join('、') : ''));
  }

  /* ───────── 对话模式（2026-10-14 用户点名）────────────────────────────────

     「🎲 剧情游玩 / 💬 对话讨论」是模型 tab 里「🎛 [模式切换]」卡片的两个互斥模式；
     条目本体在预设的「🎛 运行模式」层级里，那个层级**不出 tab**（用户要求别多占一页）。

     选「对话讨论」时让位给元讨论：把跑团专属的那些组整组关掉；
     切回「剧情游玩」时，把**进入之前**的开关原样恢复。
     要关哪些组由解析器的 dialogModeTargets() 算（纯函数，有离线单测）。 */
  function dialogTargets() {
    try {
      if (typeof dialogModeTargets !== 'function') { return null; }
      var tabs = (liveData && liveData.ok && liveData.tree) ? liveData.tree.tabs : null;
      return dialogModeTargets(tabs || []);
    } catch (e) { log('算对话模式要关的组时出错：' + ((e && e.message) || e)); return null; }
  }
  /* 某条现在开没开。
     ⚠️ 2026-10-14 的关键坑：**不要走 readRaw()**。
        `toggleItem` 里已经有 `for (var i = 0; ...)`（单选联动那段），
        `var` 是函数作用域 —— 这里再写一个 `var i` 会把外层的 i 覆盖掉，
        症状是外层循环莫名其妙提前结束。
        正路是读**面板自己的数据模型**（`view` 里每个条目的 enabled）：
        它与界面所见一致，也省一次读酒馆设置。 */
  function enabledOfId(id) {
    var out = null;
    eachItem(function (it) {
      if (out === null && it && it.identifier === id) { out = it.enabled !== false; }
    });
    return out === null ? false : out;
  }
  function enterDialogMode() {
    var t = dialogTargets();
    if (!t || !t.identifiers.length) { return []; }
    if (!dialogSaved) {
      var on = {};
      for (var qi = 0; qi < t.identifiers.length; qi++) { on[t.identifiers[qi]] = enabledOfId(t.identifiers[qi]); }
      dialogSaved = { at: nowText(), on: on };
      saveVars();
      log('对话模式：已存下 ' + t.identifiers.length + ' 条开关的快照（切回剧情游玩时恢复）');
    }
    var pairs = [];
    for (var pi = 0; pi < t.identifiers.length; pi++) { pairs.push({ identifier: t.identifiers[pi], value: false }); }
    log('对话模式：关掉 ' + t.groups.length + ' 个跑团专属组（共 ' + t.identifiers.length + ' 条）');
    return pairs;
  }
  /* 点的是不是「💬 对话讨论」那个条目（按名字认，改名只改这一处常量）。
     ⚠️ 2026-10-14 的关键坑：**不能靠 on（aria-pressed 取反）判断进出**。
        「剧情游玩」是默认选中项、从没被点亮过（aria-pressed 一直是 false），
        所以点它时 on 也是 true —— 只看 on 会把「切回剧情游玩」也当成「进入对话模式」。 */
  /* 点的是不是「💬 对话讨论」那一条。
     ⚠️ 按 **identifier** 认，不按名字 —— 「运行模式」这个层级的含义就是它那两个条目，
        id 是预设里固定的，改中文名（甚至换语言）都不会让它失灵。
        2026-10-14 最早那版是按中文名认的，太脆，已换掉。 */
  /* 这一条是不是「🎛 运行模式」层级里的模式条目（那一层就这两条，id 固定）。 */
  function isModeLayerEntry(id) {
    var s = String(id);
    return s === DIALOG_MODE_ID || s === PLAY_MODE_ID;
  }
  function isDialogModeEntry(id) {
    return String(id) === DIALOG_MODE_ID;
  }
  function leaveDialogMode() {
    if (!dialogSaved) { return []; }
    var pairs = [], ids = Object.keys(dialogSaved.on || {}), li, trueC = 0;
    for (li = 0; li < ids.length; li++) { var v = !!dialogSaved.on[ids[li]]; if (v) { trueC++; } pairs.push({ identifier: ids[li], value: v }); }
    if (!pairs.length) { return []; }
    log('对话模式：按快照恢复 ' + pairs.length + ' 条开关（存于 ' + (dialogSaved.at || '未知时间') + '）');
    return pairs;
  }

  /* 把一次写入的结果同步进条目模型（只改 enabled，不动结构）。
     cardMap 里的 items 就是 view 里那些对象的同一份引用，所以遍历 view 就够了。 */
  function syncModel(identifier, value) {
    eachItem(function (it) { if (it.identifier === identifier) { it.enabled = !!value; } });
  }

  /* 界面由运行库的 PresetPanel 画：状态变了就通知它重读 */
  function renderStatus() { toolsNotify(); }


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
    /* 🧰 其他功能 → 自动标签处理的三档（关闭 / 补全 / 删除）与自定义标签。
       存在同一个键里，跟着预设走：换聊天、换设备都还是这一套。 */
    if (typeof saved[TAGFIX_VAR] === 'string') { tagFixMode = tagFixModeSpec(saved[TAGFIX_VAR]).id; }
    if (Object.prototype.toString.call(saved[TAGFIX_CUSTOM_VAR]) === '[object Array]') {
      tagFixCustom = parseCustomTags(saved[TAGFIX_CUSTOM_VAR].join(' '));
    }
    if (saved[TAGFIX_ALL_VAR] === '1') { tagFixAll = true; }
    /* 「这一份继承自哪份旧预设」——跟着预设走（脚本变量就存在预设文件里），
       用户 2026-09-28 点名要在面板里写明，免得看标题栏的名字时误会。 */
    if (typeof saved.inheritFrom === 'string' && saved.inheritFrom) { inheritFromName = saved.inheritFrom; }
    if (typeof saved.inheritAt === 'string' && saved.inheritAt) { inheritAtText = saved.inheritAt; }
    /* 对话模式的开关快照（跟着预设走） */
    if (saved.dialogSaved && typeof saved.dialogSaved === 'object' &&
        saved.dialogSaved.on && typeof saved.dialogSaved.on === 'object') {
      dialogSaved = { at: String(saved.dialogSaved.at || ''), on: saved.dialogSaved.on };
    }
  }
  function saveVars() {
    if (saveTimer) { try { clearTimeout(saveTimer); } catch (e) { } }
    if (inheritReloading) { return; }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (disposed || inheritReloading) { return; }
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        /* ① 位置与大小一起存（键名与皮肤管理面板一致：x/y/w/h）；
           当前模型（🤖 模型 tab 的闸门）与它们放同一个键里，换页面也记得 */
        all[VARS_KEY] = {
          panel: { x: geom.x, y: geom.y, w: geom.w, h: geom.h },
          currentModel: currentModel || null,
          inheritFrom: inheritFromName || null,
          inheritAt: inheritAtText || null,
          tagFix: tagFixMode,
          tagFixCustom: tagFixCustom.slice(),
          tagFixAll: tagFixAll ? '1' : '0',
          dialogSaved: dialogSaved
        };
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('写脚本变量失败：' + ((e && e.message) || e)); }
    }, 250);
  }

  /* ───────── 开关 ───────── */

  /* 面板由本脚本末尾的「界面接线」一段画（运行库的 PresetPanel，经 HOST.KamiPresetNext 开关）；
     2026-10-30 脚本整理：原来这里自己用 DOM 拼的旧面板（窗口、页签、卡片、几何、手势）已删除。 */
  function nextUi() { try { var n = HOST.KamiPresetNext; return n && n.alive() ? n : null; } catch (e) { return null; } }
  function openPanel() { var n = nextUi(); if (n) { n.open(); } }
  function closePanel() { var n = nextUi(); if (n) { n.close(); } }
  function isOpen() { var n = nextUi(); return !!(n && n.isOpen && n.isOpen()); }
  function togglePanel() { var n = nextUi(); if (n) { n.toggle(); } }

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
    toolsNotify();
    updateDef();
  }
  /* ───────── 登记按钮 ───────── */

  function updateDef() {
    try { if (HOST.__hub && typeof HOST.__hub.paint === 'function') { HOST.__hub.paint(); } } catch (e) { }
  }

  /* ───────── 全局 API ───────── */

  /* 旧面板时代用来自查「锁定条目有没有画进面板」；面板改由运行库画后这里恒为空 */
  function lockedShown() { return []; }
  function inspectedIdentifiers() { return []; }

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
      tagReferences: tagReferenceLast,
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
      toolsBridge: toolsBridge,
      updateBridge: updateBridge,
      presetBridge: presetBridge,
      version: VERSION,
      open: openPanel, close: closePanel, toggle: togglePanel,
      refresh: function () { refresh(true); },
      /* 排障/脚本化用：按 identifier 直接改一条开关（同样走 prompt_order 路径）。
         ⑤ 与点卡片同一条路径：成功就只就地改那张卡（含它在别处的镜像），不重画面板。 */
      setEnabled: function (identifier, value) {
        var v = !!value;
        var r = commit([{ identifier: identifier, value: v }]);
        if (r.ok) { syncModel(identifier, v); renderStatus(); }
        return r;
      },
      /* 用户自定义文风（引导的「文风」页用）。
         customStyles(opts)    读：分区 / 可选组（含每组是选一还是任选）/ 现有自定义条目。
                               opts.anchorCards = 引导页那份「文风页卡片名」，卡片改名后仍能命中分区。
         applyCustomStyles(req) 写：{ anchorCards, adds, updates, removes } —— **保存才调用**。
                               走活设置 + 酒馆原生保存按钮；失败会回滚内存并返回 { ok:false, code, detail }。
                               错误码：NO_TREE / NO_SECTION / NO_SECTION_END / ORDER_SHAPE / APPLY_FAIL / VERIFY_FAIL / SAVE_FAIL
                               ＋计划层的 GROUP_NOT_FOUND / GROUP_EMPTY / GROUP_TAIL_MISSING / BAD_NAME /
                                 DUP_ID / NO_ID / REMOVE_MISSING / REMOVE_NOT_CUSTOM / UPDATE_MISSING /
                                 UPDATE_NOT_CUSTOM / NO_PROMPTS / NO_ORDER。 */
      customStyles: function (opts) { return readCustomStyleState(opts); },
      applyCustomStyles: function (req) { return applyCustomStyles(req); },
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
      closeMergeReview: function () { return true; },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  /* ───────── 注销（零残留：逐项对照登记与自建的东西） ───────── */

  function teardown() {
    if (disposed) { return; }
    continuationEnvelope = null;
    disposed = true;
    if (tagReferenceRelease) { tagReferenceRelease(); tagReferenceRelease = null; }
    unbindChatFloorWatch();
    tagFixCurFloor = -1; tagFixSelection = null;
    log('正在注销：摘监听 / 删全局');
    /* 裁决没完成就注销（脚本被关 / 重挂）：同样通知 70 号放弃，别让它干等回 */
    if (mergeCtx) { var mc = mergeCtx; mergeCtx = null; try { if (typeof mc.onApply === 'function') { mc.onApply(null); } } catch (e) { } }
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    /* 写盘自证压上的 fetch 补丁与 6 秒兜底定时器：必须在这里收回，否则注销后最多 6 秒内
       HOST.fetch 还是被替换过的版本（会继续截获 /api/presets/save 并写 lastSave）。 */
    try { cancelSavePatches(); } catch (e) { }
    for (var i = 0; i < unsubs.length; i++) { try { if (unsubs[i] && unsubs[i].stop) { unsubs[i].stop(); } } catch (e) { } }
    unsubs = [];
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    view = [];
    /* 按钮登记归末尾的「界面接线」管（它有自己的 pagehide 注销），这里不碰中转站 */
    /* 全局 API（只删自己这一份） */
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    log('注销完成：面板、样式、登记、全局 API 都已收回；预设文件与酒馆设置没有被改动');
  }

  /* ───────── 启动 ───────── */

  var hideHandler = null;

  /* 「自动标签处理」唯一要挂的事件：MESSAGE_RECEIVED。
     为什么只挂这一个：非流式时它发在界面渲染之前、流式时发在渲染之后，
     两种情况一条订阅都覆盖（.audit/标签调研.md B2）。改完用 setChatMessages 的
     refresh:'affected' 重画那一楼，三个正则前端会跟着重跑（同文件 B3 已验证这条链路）。
     拿不到 eventOn/tavern_events 时不报错、只记一行 —— 面板上的手动按钮仍然可用。 */
  function bindTagFixEvents() {
    bindChatFloorWatch();                       /* 「当前楼层」= 用户最后点过的那一楼 */
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && tavern_events.CHAT_CHANGED) {
      var changed = eventOn(tavern_events.CHAT_CHANGED, function () {
        continuationEnvelope = null; tagFixCurFloor = -1; tagFixSelection = null; bindChatFloorWatch();
      });
      if (typeof changed === 'function') { unsubs.push({ stop: changed }); }
      else if (changed && typeof changed.stop === 'function') { unsubs.push(changed); }
      /* 新界面（读写桥）跟着预设变化重读：切预设、在酒馆原生面板里改开关，都会发这个事件 */
      if (tavern_events.OAI_PRESET_CHANGED_AFTER) {
        var presetChanged = eventOn(tavern_events.OAI_PRESET_CHANGED_AFTER, function () { if (!disposed) { toolsNotify(); } });
        if (typeof presetChanged === 'function') { unsubs.push({ stop: presetChanged }); }
        else if (presetChanged && typeof presetChanged.stop === 'function') { unsubs.push(presetChanged); }
      }
    }
    try {
      if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined' ||
        !tavern_events.MESSAGE_RECEIVED) {
        log('自动标签处理：拿不到 eventOn/tavern_events.MESSAGE_RECEIVED，' +
          '只保留面板上的手动「处理当前楼层」');
        return;
      }
      /* 监听器返回 Promise：酒馆的 emit 会 await 它，于是「改完消息」跑在渲染之前，
         用户不会先看到一版坏的、再跳成好的。 */
      var stop = eventOn(tavern_events.MESSAGE_RECEIVED, function (id) {
        return continuationOnReceived(id).then(function () { return tagFixOnReceived(id); });
      });
      /* 统一塞进 unsubs（teardown 按 .stop() 收）：新老版本 eventOn 的返回值不一样，
         两种形状都包一层，注销时零残留。 */
      if (typeof stop === 'function') { unsubs.push({ stop: stop }); }
      else if (stop && typeof stop.stop === 'function') { unsubs.push(stop); }
      if (tavern_events.CHAT_COMPLETION_SETTINGS_READY) { var ready = eventOn(tavern_events.CHAT_COMPLETION_SETTINGS_READY, continuationOnReady); unsubs.push(typeof ready === 'function' ? { stop: ready } : ready); }
      if (tavern_events.GENERATION_ENDED) {
        var ended = eventOn(tavern_events.GENERATION_ENDED, function () { var item = continuationEnvelope; return continuationOnReceived().finally(function () { if (continuationEnvelope === item) { continuationEnvelope = null; } }); });
        unsubs.push(typeof ended === 'function' ? { stop: ended } : ended);
      }
      log('自动标签处理：已订阅 MESSAGE_RECEIVED（当前档位 ' + tagFixModeSpec(tagFixMode).label + '）');
    } catch (e) { log('订阅 MESSAGE_RECEIVED 失败：' + ((e && e.message) || e)); }
  }

  function boot() {
    log('启动 v' + VERSION + '（解析器、兜底皮肤、标签处理逻辑已内联）');
    readVars();
    syncTagReferenceResponse();
    refresh(true);
    log('读活设置：' + (liveData.ok
      ? ('预设「' + liveData.preset.name + '」· prompt_order ' + liveData.order.order.length + ' 条 · tab ' + view.length)
      : ('失败 —— ' + liveData.error)));
    expose();
    bindTagFixEvents();
    hideHandler = function () { try { teardown(); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
    if (!liveData.ok) { log('提示：' + liveData.error + '（面板仍可打开，打开后会显示这句说明）'); }
  }

  try { boot(); } catch (e) { console.error('[预设] 启动失败', e); }
})();

/* ────────────────────────────────────────────────────────────────────
 * 界面接线（2026-10-30 脚本整理：原「🧪 预设设置 v0.1」并入本脚本）
 * 面板由「🧩 运行库」的 PresetPanel 画：解析当前预设、开关条目（单选联动、对话模式联动、模型闸门）、
 * 改变量、选模型、自定义文风的读写，全部走上面那一段的 KamiPreset.presetBridge()。
 * 「关于」「其他功能」两页在「🧰 工具箱」里（经 toolsBridge / updateBridge）。
 * 按钮条上的「🌟 预设设置」由这一段登记；pagehide 时注销——按钮登记、面板、全局 API 全部收回。
 * ──────────────────────────────────────────────────────────────────── */
(function () {
  var VERSION = '1.0';
  var HUB_NAME = '🌟 预设设置';
  var HUB_ORDER = 30;
  var LAYER_ID = 'kami-preset';
  var HOST = (function () {
    try { if (window.parent && window.parent !== window && window.parent.document) { return window.parent; } } catch (e) { }
    return window;
  })();
  var disposed = false, rt = null, ownDef = null, timer = null, isOpen = false, pingTimer = null;
  function log(msg) { try { console.log('[预设设置·界面] ' + msg); } catch (e) { } }
  function toast(kind, msg) {
    try { if (typeof toastr !== 'undefined' && toastr[kind]) { toastr[kind](msg, '预设设置'); return; } } catch (e) { }
    log(msg);
  }
  function bridge() {
    try { if (HOST.KamiPreset && typeof HOST.KamiPreset.presetBridge === 'function') { return HOST.KamiPreset.presetBridge(); } } catch (e) { }
    return null;
  }

  function open() {
    if (disposed || !rt) { return; }
    var api = bridge();
    if (!api) { toast('warning', '预设设置还没就绪，面板读不到预设'); return; }
    try { api.reload(); } catch (e) { }
    rt.layer().open(LAYER_ID, rt.React.createElement(rt.panels.PresetPanel, { api: api, styleCopy: api.copy, onClose: close }));
    isOpen = true;
  }
  function close() {
    isOpen = false;
    try { if (rt) { rt.layer().close(LAYER_ID); } } catch (e) { }
  }
  function toggle() { if (isOpen) { close(); } else { open(); } }

  function registerButton() {
    try {
      var defs = HOST.__hubDefs || (HOST.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) { if (defs[i] && defs[i].__kamiNext === HUB_NAME) { defs.splice(i, 1); } }
      ownDef = {
        name: HUB_NAME,
        __kamiNext: HUB_NAME,
        order: HUB_ORDER,
        tip: '预设设置（点击展开面板）',
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () { return HUB_NAME; },
        ready: function () { return !!rt; },
        absent: '预设设置还没就绪（🧩 运行库 是否开着？）',
        click: function () { toggle(); }
      };
      defs.push(ownDef);
      try { var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev); } catch (e) { }
    } catch (e) { log('⚠ 登记按钮失败：' + e.message); }
  }

  function boot(r) {
    if (disposed) { return; }
    rt = r;
    try { HOST.KamiPresetNext = { version: VERSION, alive: function () { return !disposed; }, open: open, close: close, toggle: toggle, isOpen: function () { return isOpen; }, shutdown: shutdown }; } catch (e) { }
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
    log('启动 v' + VERSION);
  }

  var waited = 0;
  function wait() {
    if (disposed) { return; }
    var r = HOST.KamiRuntimeNext;
    if (r && r.panels && r.panels.PresetPanel) { boot(r); return; }
    if ((waited += 100) > 15000) { log('⚠ 等不到运行库（🧩 运行库 是否开着？）'); return; }
    timer = setTimeout(wait, 100);
  }

  function shutdown() {
    if (disposed) { return; }
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    close();
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) { if (defs[j] === ownDef) { defs.splice(j, 1); } }
      var ev = HOST.document.createEvent('Event'); ev.initEvent('kami-hub-def', false, false); HOST.dispatchEvent(ev);
    } catch (e) { }
    ownDef = null;
    try { if (HOST.KamiPresetNext && HOST.KamiPresetNext.shutdown === shutdown) { delete HOST.KamiPresetNext; } } catch (e) { }
    try { window.removeEventListener('pagehide', shutdown); } catch (e) { }
    log('已注销');
  }
  try { window.addEventListener('pagehide', shutdown); } catch (e) { }
  wait();
})();
