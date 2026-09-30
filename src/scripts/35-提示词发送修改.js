/* ============================================================================
 * 卡密预设 · 提示词发送修改（v1.0）
 * ----------------------------------------------------------------------------
 * 这个脚本统管**所有「对发送提示词的修改」**（用户 2026-09-30 裁定）。
 * 目前有两件事：① 角色名包裹（下面的老正文）② 常驻附加指令（待并进来）。
 * ⚠️ 只改了**脚本名**：「角色名包裹」作为**功能名**照旧，一行都不动。
 *
 * ① 角色名包裹：它要解决什么（2026-09-28 用户点名）：
 *   有用户不喜欢正文里的角色名被反引号包着。可名字散落在 18 条示例与规范里，一共 69 处；
 *   要是每换一种包裹风格就回去改一遍预设，谁也受不了。
 *
 * 做法：**改的不是预设文件，是发给 AI 之前的那一份副本**。
 *   ① 预设正文里的角色名一律写成显式标记 `<n>奈亚子</n>`（2026-09-28 已一次性迁移完毕）。
 *      为什么不用反引号认：预设里的反引号有三种用途（角色名 / XML 标签 / 宏与代码），
 *      形状一模一样，脚本分不出来 —— 实测自动识别会把 `行动` `性格` `难度等级` 这类
 *      枚举值和字段名一起改掉（见 .audit/wrap-simulate.mjs）。换成 `<n>` 之后零猜测。
 *   ② 酒馆把提示词拼好、还没发出去时会广播「提示词已就绪」事件
 *      （public/scripts/openai.js:1501；那份数组随后被原样发出，见 public/script.js:4373）。
 *      本脚本接住它，把 `<n>…</n>` 按当前档位换成 反引号 / 双下划线 / 什么都不加。
 *   → 预设文件、屏幕上已显示的消息，两者都不动；只有发出去的那一份被改写。
 *
 * ⚠️ 文生图条目（`🎨 文生图`）**一个字都不许动**：它产出的 tags 会被别的插件用正则抓走
 *    当绘图提示词，混进任何包裹符号都是灾难。那条现在没有 `<n>` 标记，本脚本另外还整条
 *    跳过（SKIP_MARK），万一将来误加了标记会在控制台告警。
 *
 * 三个档位存在酒馆的**全局变量** `kami_name_wrap` 里（跨聊天、跨角色都跟着账号走）：
 *   bt（默认，等于本预设一直以来的行为）/ ul / none
 * 「📌 输出规范」第 4 条读的是同源派生的 `kami_name_wrap_rule`，所以规范措辞与示例
 * 永远一致，不会出现「规范说反引号、示例却是下划线」这种自相矛盾。
 *
 * 控制台 API：KamiNameWrap.get() / .set(id) / .status() / .preview() / .shutdown()
 * ⚠️ 这个全局 API 名**保持 KamiNameWrap 不改**（2026-09-30 裁定）：30-皮肤管理.js 的「显示 →
 *    角色名样式」那一行与 50 号的引导页都在读它，改名没有用户可见收益、只会多冒一份风险。
 * ========================================================================== */
(function () {
  var VERSION = '0.1';
  var VAR_MODE = 'kami_name_wrap';        /* 档位（唯一真值来源） */
  var VAR_RULE = 'kami_name_wrap_rule';   /* 输出规范那句的措辞（由档位派生） */
  var MARK_RE = /<n>([^<]*)<\/n>/g;
  var SKIP_MARK = '<image_task>';         /* 文生图条目指纹：见到它整条不改 */
  var DEFAULT_MODE = 'bt';

  /* 三个档位。rule 是嵌进「所有出现的角色名___，同一条回复内不得混用。」中间那一句 */
  var MODES = [
    { id: 'bt', label: '反引号', open: '`', close: '`', rule: '必须使用反引号包裹', demo: '`角色名`' },
    { id: 'ul', label: '双下划线', open: '__', close: '__', rule: '必须使用双下划线包裹（Markdown 加粗）', demo: '__角色名__' },
    { id: 'none', label: '无包裹', open: '', close: '', rule: '一律直接书写、不加包裹', demo: '角色名' }
  ];

  var modeCache = DEFAULT_MODE;

  /* 宿主窗口：酒馆助手把**每个脚本各自**放进一个 iframe 跑，所以 `window` 不是酒馆页面。
     别的脚本（40 号面板 / 50 号引导）要看这个 API，就得挂到父窗口上去
     —— 与 45-正文外壳.js 同一套取法，两处都挂一份，谁在哪个窗口都能拿到。 */
  var HOST = (function () {
    try {
      if (window.parent && window.parent !== window && window.parent.document) { return window.parent; }
    } catch (e) { }
    return window;
  })();

  function log(msg) { try { if (window.console && console.log) { console.log('[角色名包裹] ' + msg); } } catch (e) { } }
  function warn(msg) { log('⚠ ' + msg); }

  function modeOf(id) {
    for (var i = 0; i < MODES.length; i++) { if (MODES[i].id === id) { return MODES[i]; } }
    return null;
  }

  function stCtx() {
    try {
      if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) { return SillyTavern.getContext(); }
    } catch (e) { }
    /* 兜底：有些版本的 iframe 里没有全局 SillyTavern，得去父窗口拿。 */
    try {
      if (HOST && HOST.SillyTavern && HOST.SillyTavern.getContext) { return HOST.SillyTavern.getContext(); }
    } catch (e) { }
    return null;
  }

  /* ───────── 全局变量：优先走酒馆自己的通道（st-context.js:204 的 variables.global） ───────── */
  function readGlobal(name) {
    var c = stCtx();
    try {
      if (c && c.variables && c.variables.global && typeof c.variables.global.get === 'function') {
        var v = c.variables.global.get(name);
        return (v === undefined || v === null) ? null : String(v);
      }
    } catch (e) { }
    try {
      var g = c && c.extensionSettings && c.extensionSettings.variables && c.extensionSettings.variables.global;
      if (g && Object.prototype.hasOwnProperty.call(g, name)) { return String(g[name]); }
    } catch (e) { }
    return null;
  }

  function writeGlobal(name, value) {
    var c = stCtx();
    if (!c) { return false; }
    try {
      if (c.variables && c.variables.global && typeof c.variables.global.set === 'function') {
        c.variables.global.set(name, value);
      } else {
        /* 兜底：直接写酒馆存全局变量的那张表（variables.js:84 的 extension_settings.variables.global） */
        if (!c.extensionSettings) { return false; }
        if (!c.extensionSettings.variables) { c.extensionSettings.variables = {}; }
        if (!c.extensionSettings.variables.global) { c.extensionSettings.variables.global = {}; }
        c.extensionSettings.variables.global[name] = value;
      }
    } catch (e) {
      warn('写全局变量失败：' + ((e && e.message) || e));
      return false;
    }
    try { if (typeof c.saveSettingsDebounced === 'function') { c.saveSettingsDebounced(); } } catch (e) { }
    return true;
  }

  /* 档位 → 变量。缺了、认不出、或措辞与档位对不上，都当场修正（幂等） */
  function syncVars(force) {
    var mode = modeOf(readGlobal(VAR_MODE));
    if (!mode) { mode = modeOf(DEFAULT_MODE); }
    var changed = false;
    if (readGlobal(VAR_MODE) !== mode.id) { changed = writeGlobal(VAR_MODE, mode.id) || changed; }
    if (readGlobal(VAR_RULE) !== mode.rule) { changed = writeGlobal(VAR_RULE, mode.rule) || changed; }
    modeCache = mode.id;
    if (changed || force) { log('档位 = ' + mode.label + '（规范措辞：' + mode.rule + '）'); }
    return mode;
  }

  function currentMode() { return modeOf(modeCache) || modeOf(DEFAULT_MODE); }

  /* 把一段文本里的 <n>…</n> 换成该档位的写法；counter 用来数改了几处 */
  function applyMode(text, mode, counter) {
    return text.replace(MARK_RE, function (_full, inner) {
      if (counter) { counter.n++; }
      return mode.open + inner + mode.close;
    });
  }

  /* ───────── 提示词已就绪：在这里把标记换成当前档位 ─────────
     dryRun（酒馆自己数 token 的那一趟）也照改，改的是当趟的临时数组，无副作用。 */
  function onPromptReady(data) {
    try {
      var chat = data && data.chat;
      if (!chat || !chat.length) { return; }
      var mode = currentMode();
      var counter = { n: 0 };
      var skipped = 0;
      for (var i = 0; i < chat.length; i++) {
        var m = chat[i];
        if (!m || typeof m.content !== 'string') { continue; }
        if (m.content.indexOf('<n>') < 0) { continue; }
        if (SKIP_MARK && m.content.indexOf(SKIP_MARK) >= 0) {
          skipped++;
          warn('文生图条目里出现了 <n> 标记 —— 已整条跳过（那条会被别的插件抓 tags，不能有包裹符号）');
          continue;
        }
        m.content = applyMode(m.content, mode, counter);
      }
      if (counter.n > 0 || skipped > 0) {
        log('本次替换 ' + counter.n + ' 处角色名标记 → ' + mode.label +
          (skipped ? ('；跳过 ' + skipped + ' 条文生图条目') : '') + (data && data.dryRun ? '（试算）' : ''));
      }
    } catch (e) {
      warn('改写提示词失败：' + ((e && e.message) || e));
    }
  }

  var unsubs = [];
  function subscribe() {
    try {
      if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined' && tavern_events.CHAT_COMPLETION_PROMPT_READY) {
        unsubs.push(eventOn(tavern_events.CHAT_COMPLETION_PROMPT_READY, onPromptReady));
        log('已订阅「提示词已就绪」');
      } else {
        warn('拿不到 eventOn / tavern_events.CHAT_COMPLETION_PROMPT_READY：角色名包裹切换不会生效');
      }
    } catch (e) { warn('订阅失败：' + ((e && e.message) || e)); }
  }

  function boot(attempt) {
    attempt = attempt || 0;
    /* 脚本可能比酒馆上下文先就绪，给它几次机会（最多 5 秒） */
    if (!stCtx()) {
      if (attempt < 10) { setTimeout(function () { boot(attempt + 1); }, 500); }
      else { warn('拿不到酒馆上下文：档位变量读不到，包裹切换不会生效'); }
      return;
    }
    syncVars(true);
    subscribe();
  }

  var api = {
    version: VERSION,
    MODES: MODES,
    /* 当前档位 id */
    get: function () { return currentMode().id; },
    /* 切换档位；成功返回 true */
    set: function (id) {
      var mode = modeOf(id);
      if (!mode) { return false; }
      if (!writeGlobal(VAR_MODE, mode.id)) { return false; }
      if (!writeGlobal(VAR_RULE, mode.rule)) { return false; }
      modeCache = mode.id;
      log('已切到「' + mode.label + '」');
      return true;
    },
    /* 说明文案与效果示例，面板直接用 */
    describe: function (id) {
      var m = modeOf(id) || currentMode();
      return { id: m.id, label: m.label, demo: m.demo, desc: m.rule };
    },
    /* 三档的效果对照，面板/引导页拿去展示 */
    preview: function () {
      var sample = '<n>奈亚子</n>在此！';
      return MODES.map(function (m) { return { id: m.id, label: m.label, text: applyMode(sample, m, null) }; });
    },
    refresh: function () { syncVars(false); },
    status: function () {
      return {
        version: VERSION,
        mode: currentMode().id,
        varMode: readGlobal(VAR_MODE),
        varRule: readGlobal(VAR_RULE),
        subscribed: unsubs.length
      };
    },
    shutdown: function () {
      unsubs.forEach(function (u) { try { u.stop(); } catch (e) { } });
      unsubs = [];
      log('已注销');
    }
  };
  try { HOST.KamiNameWrap = api; } catch (e) { }
  try { window.KamiNameWrap = api; } catch (e) { }

  boot();
})();
