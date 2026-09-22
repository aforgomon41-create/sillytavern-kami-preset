/* ============================================================
 * 🎛 脚本按钮中转站   v1.3
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 它是一个「纯服务」：自己一个按钮都不写死，只做四件事
 *   ① 接收其它脚本的登记（宿主窗口的 __hubDefs 数组，或 __hub.register()）
 *   ② 把登记到的按钮注册到酒馆助手（replace/appendScriptButtons）
 *   ③ 绘制按钮文字（例如 🛡 显示 开/关），并随状态自动刷新
 *   ④ 点击时调用登记方提供的 click() / label() / ready()
 *
 * 一切功能都走酒馆助手接口，不使用任何斜杠命令。
 *
 * v1.3 关键改动：
 *   · 删除全部斜杠命令相关代码（登记声明、命令注册、退避重试、日志报错）
 *   · 清除旧皮肤脚本时代的残留：样式表 id 与自定义事件改为 kami-* 前缀
 *   · 按钮文本匹配改为「前缀匹配」：登记名为 🎨、标签显示 🎨暗夜紫 也能正确命中
 *   · 修掉两个真实 bug：TAG 被拼接成 data-data-hub-btn（样式注入与注销清理全部失效）
 *   · 注销更彻底：事件监听/事件通道/定时器/Observer/样式表/属性/全局 全部回收，
 *     并加 disposed 守卫，脚本关闭后不会被残留事件唤醒重新注册按钮
 *
 * v1.2 关键改动（都是被真实环境坑出来的）：
 *   · 心跳 hb：每 2.5s 往 HOST.__hub 上写时间戳，其它脚本据此判断
 *     “中转站是真的活着，还是脚本被关掉后留下的残骸”
 *   · 同版本实例去重不再“一声不响地退出”，而是写日志（手机上能看见原因）
 *   · 按钮表每轮轮询都会核对并自动补写：按钮被重置/吞掉/隐藏都会恢复
 *   · 登记方心跳过期 → 自动撤下它的按钮（不会留下点不动的幽灵按钮）
 *   · pagehide 挂在自己 window 上（原来只挂宿主窗口，脚本被关掉时
 *     根本不会触发清理，__hub 会一直“假活着”）
 *
 * 谁想要按钮，谁就登记；中转站与其它脚本都不需要知道对方存在。
 * ------------------------------------------------------------
 * 登记格式（在【宿主窗口】上）：
 *   (HOST.__hubDefs = HOST.__hubDefs || []).push({
 *     name:   '✨',             // 唯一名；也是标签的前缀（显示文本可以更长，例如 '🎨暗夜紫'）
 *     order:  30,               // 显示顺序（小的在前，默认 50）
 *     tip:    '说明',            // title 提示
 *     label:  function(){ return '✨'; },        // 可选：按钮文字（可显示状态）
 *     get:    function(){ return 目标API; },      // 可选：给 label 用
 *     ready:  function(){ return !!目标API; },    // 可选：目标是否就绪
 *     click:  function(){ 目标API.doSomething(); },
 *     absent: '目标脚本没运行时给出的提示',
 *     ping:   Date.now(),                        // 推荐：定时更新，死了会被自动撤下
 *     alive:  function(){ return true; }         // 可选：登记方自定义存活判断
 *   });
 *   然后（可省，中转站每 0.8s 也会自己发现）：
 *   HOST.dispatchEvent(new Event('kami-hub-def'))
 *
 * 注意：登记名之间可以有前缀包含关系（例如同时存在 '🎨' 与 '🎨✨'）：
 *       命中时取「名字最长的那个」，并在启动自检里用日志 warn 出来。
 *       点击只认「被点按钮宿主自己的标签」，绝不拿祖先按钮条拼起来的文字去猜。
 * ============================================================ */
(function () {
  'use strict';

  var HUB_VER = 3;         // 登记协议版本（登记格式不变就不要改动）
  var HUB_VERSION = '1.3'; // 本脚本版本
  var TAG = 'data-hub-btn';// 属性名（选择器请用 '[' + TAG + ']'，不要再拼 data-）
  var CSS_ID = 'kami-hub-css';
  var EVT_DEF = 'kami-hub-def';
  var POLL_MS = 800;
  var HB_MS = 2500;       // 心跳写入间隔（其它脚本据此判断本实例是否还活着）
  var HB_STALE = 120000;  // 心跳超过这么久没更新 = 本实例已经死了（脚本被关掉/iframe 被销毁）
                          // 注意：脚本 iframe 是隐藏的，浏览器会节流定时器（极端情况 1 分钟才跑一次），
                          //      所以阈值放到 2 分钟；正常关闭时注销会立刻删掉 __hub，不靠这个兜底
  var DEF_STALE = 180000; // 登记方心跳超过这么久没更新 = 登记方已经死了（自动撤下它的按钮）

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
  var SAME_WINDOW = false;
  try { SAME_WINDOW = (HOST === window); } catch (e) { SAME_WINDOW = true; }

  /* ───────── 日志 ───────── */

  var LOGS = [];
  function stamp() {
    try {
      var d = new Date();
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    } catch (e) { return '--:--:--'; }
  }
  function log(msg) {
    LOGS.push('[' + stamp() + '] ' + msg);
    if (LOGS.length > 80) { LOGS.shift(); }
    try { if (window.console && console.log) { console.log('[按钮] ' + msg); } } catch (e) { }
  }
  /* 自检类问题：日志 + 控制台都要能看见（手机上只有日志） */
  function warn(msg) {
    log('⚠ ' + msg);
    try { if (window.console && console.warn) { console.warn('[按钮] ⚠ ' + msg); } } catch (e) { }
  }
  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, '🎛 脚本按钮'); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }
  function hsetTimeout(fn, ms) {
    try { return (HOST && HOST.setTimeout ? HOST.setTimeout : setTimeout)(fn, ms); } catch (e) { return setTimeout(fn, ms); }
  }

  /* ───────── 按钮表：全部来自其它脚本的登记 ───────── */

  var BUTTONS = [];
  var boundNames = {};   // name -> 事件通道的 stop() 句柄

  function normDef(d) {
    if (!d || !d.name) { return null; }
    return {
      name: String(d.name),
      order: (typeof d.order === 'number' ? d.order : 50),
      tip: d.tip || String(d.name),
      get: (typeof d.get === 'function') ? d.get : function () { return true; },
      label: (typeof d.label === 'function') ? d.label : function () { return String(d.name); },
      ready: (typeof d.ready === 'function') ? d.ready : function () { return true; },
      click: (typeof d.click === 'function') ? d.click : function () { },
      absent: d.absent || '目标脚本还没就绪',
      _def: d                                                        // 保留原始登记对象，用来查“登记方还在不在”
    };
  }

  /* 登记方是否还活着：
     · 有 alive() 的按 alive() 判断（函数抛错 = 实例已死）
     · 有心跳 ping 的，超过 DEF_STALE 没更新 = 已死
     · 两者都没写的第三方登记保持兼容（永远视为活着）            */
  function defAlive(d) {
    if (!d) { return false; }
    try { if (typeof d.alive === 'function' && !d.alive()) { return false; } } catch (e) { return false; }
    try { if (d.ping && (Date.now() - d.ping) > DEF_STALE) { return false; } } catch (e) { }
    return true;
  }

  function find(name) {
    for (var i = 0; i < BUTTONS.length; i++) { if (BUTTONS[i].name === name) { return BUTTONS[i]; } }
    return null;
  }

  /* 扫描宿主窗口上的登记表（别的脚本 push 进去的），并顺手撤下“登记方已经死了”的按钮 */
  function collect() {
    if (api.disposed) { return false; }
    var list = null, changed = false, i, def, cur, name;
    try { list = HOST.__hubDefs; } catch (e) { list = null; }
    if (list && list.length) {
      for (i = 0; i < list.length; i++) {
        def = list[i];
        if (!def || !def.name) { continue; }
        name = String(def.name);
        cur = find(name);
        if (cur) { cur._def = def; continue; }   // 登记方重启后会推入新的登记对象，跟上它
        if (!defAlive(def)) { continue; }        // 登记方已经没了 → 不收
        cur = normDef(def);
        if (!cur) { continue; }
        BUTTONS.push(cur);
        changed = true;
        log('发现登记：' + cur.name);
      }
    }
    for (i = BUTTONS.length - 1; i >= 0; i--) {  // 已登记但登记方死掉的 → 撤下
      if (!defAlive(BUTTONS[i]._def)) {
        name = BUTTONS[i].name;
        log('登记方已下线（心跳过期/已注销），撤下按钮：' + name);
        dropEventChannel(name);
        BUTTONS.splice(i, 1);
        changed = true;
      }
    }
    if (changed) {
      BUTTONS.sort(function (a, b) { return a.order - b.order; });
    }
    return changed;
  }

  /* ───────── 注册 / 绑定 / 绘制 ───────── */

  /* 酒馆助手视角：本脚本当前“真在显示”的按钮名。拿不到接口时返回 null */
  function ownButtonNames() {
    try {
      if (typeof getScriptButtons === 'function') {
        var list = getScriptButtons() || [], out = [], i;
        for (i = 0; i < list.length; i++) {
          if (list[i] && list[i].name && list[i].visible !== false) { out.push(list[i].name); }
        }
        return out;
      }
    } catch (e) { }
    return null;
  }

  /* 把本脚本的按钮表写为 names（新老版本签名都兼容；names 为空 = 清空） */
  function writeOwnButtons(names) {
    var list = [], i;
    for (i = 0; i < names.length; i++) { list.push({ name: names[i], visible: true }); }
    try {
      if (typeof replaceScriptButtons === 'function') {
        /* 老版本要 (script_id, buttons)，新版本可省略 script_id；
           传 script_id 在新版本里依然被接受，所以这里统一走老签名。 */
        if (typeof getScriptId === 'function') { replaceScriptButtons(getScriptId(), list); }
        else { replaceScriptButtons(list); }
        return true;
      }
      if (list.length && typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons(list);
        return true;
      }
      if (!list.length) { log('（旧版本没有 replaceScriptButtons，无法主动清空按钮表，刷新页面后按钮才会消失）'); return false; }
      log('当前版本没有 replace/appendScriptButtons 接口，按钮以脚本 JSON 里声明的为准');
    } catch (e) { log('写入按钮表失败：' + ((e && e.message) || e)); }
    return false;
  }

  /* 保证“登记到的每个按钮”都还挂在酒馆助手里。
     每次轮询都会核对一次状态：被重置/被吞掉/变成隐藏时自动补回去，
     登记方都下线时也会把这边的按钮表清空。
     所以按钮不会“消失后再也回不来”。 */
  function ensureButtons(force) {
    if (api.disposed) { return false; }
    var want = [], i, need = !!force;
    for (i = 0; i < BUTTONS.length; i++) { want.push(BUTTONS[i].name); }
    if (!need) {
      var have = ownButtonNames();
      if (have) {
        if (have.length === want.length) {
          for (i = 0; i < want.length; i++) { if (have.indexOf(want[i]) < 0) { need = true; break; } }
        } else {
          need = true;
        }
      } else {
        need = true;   // 核对不了：按“需要写入”处理（接口内部会自己 diff，重复写没有副作用）
      }
    }
    if (!need) { return true; }
    if (writeOwnButtons(want)) {
      log(want.length ? '注册/恢复按钮：' + want.join(' ') : '登记方都不在了，清空按钮表');
      return true;
    }
    return false;
  }

  /* 事件通道：eventOn 在 4.9.5 返回 { stop() }，注销时用它精确回收 */
  function dropEventChannel(name) {
    var stop = boundNames[name];
    if (!stop) { return; }
    try { if (typeof stop === 'function') { stop(); } else if (stop && typeof stop.stop === 'function') { stop.stop(); } } catch (e) { }
    delete boundNames[name];
  }

  function bindEvents() {
    if (api.disposed) { return false; }
    if (typeof getButtonEvent !== 'function' || typeof eventOn !== 'function') { return false; }
    var any = false, i;
    for (i = 0; i < BUTTONS.length; i++) {
      (function (b) {
        if (boundNames[b.name]) { return; }
        try {
          var evt = getButtonEvent(b.name);
          if (!evt) { return; }
          var handle = eventOn(evt, function () { fire(b); });
          boundNames[b.name] = (handle && typeof handle.stop === 'function') ? handle : true;
          any = true;
          log('事件通道已绑：' + b.name);
        } catch (e) { log('绑定 ' + b.name + ' 失败：' + ((e && e.message) || e)); }
      })(BUTTONS[i]);
    }
    return any;
  }

  /* 从点击目标往上找「按钮宿主」，找到就停：
     · 带中转站 TAG 的 → 就是中转站自己画过的按钮，最可信
     · 否则要求 isButtonish，且它内部没有别的「能对上登记名」的按钮
       （内部还有 → 它是按钮条容器 .qr--buttons，不是按钮，跳过）
     找不到按钮宿主 → 返回 null，这一次点击什么都不做（宁可点不动，也不许串台） */
  function holdsOtherButtons(el) {
    try {
      var kids = el.querySelectorAll('*');
      for (var i = 0; i < kids.length; i++) {
        if (!isButtonish(kids[i])) { continue; }
        var t = '';
        try { t = kids[i].textContent || ''; } catch (e) { }
        if (matchButton(t)) { return true; }
      }
    } catch (e) { }
    return false;
  }
  function buttonHost(el) {
    var hops = 0;
    while (el && hops < 6) {
      if (el === HDOC.body || el === HDOC.documentElement) { return null; }
      try { if (el.getAttribute && el.getAttribute(TAG) !== null) { return el; } } catch (e) { }
      if (isButtonish(el) && !holdsOtherButtons(el)) { return el; }
      el = el.parentNode;
      hops += 1;
    }
    return null;
  }

  var domBound = false, clickHandler = null;
  function bindDelegated() {
    if (domBound) { return; }
    domBound = true;
    clickHandler = function (ev) {
      var host = buttonHost(ev.target);
      if (!host) { return; }
      /* 只按「这一个宿主自己的标签」认；标签为空（纯图标按钮）时才退回看 TAG 点名。
         两条路都只认这个宿主自己，绝不拿祖先按钮条拼起来的文字猜。 */
      var b = matchButton(host.textContent), tag = null;
      if (!b) {
        try { tag = host.getAttribute(TAG); } catch (e) { tag = null; }
        if (tag) { b = find(tag); }
      }
      if (!b) { return; }
      try { ev.stopImmediatePropagation(); } catch (e) { }
      try { ev.preventDefault(); } catch (e) { }
      fire(b);
    };
    try { HOST.addEventListener('click', clickHandler, true); } catch (e) { }
    if (HOST !== window) { try { window.addEventListener('click', clickHandler, true); } catch (e) { } }
    log('DOM 兜底通道已装（窗口捕获阶段）');
  }

  /* 让中转站管的按钮保持紧凑、并排、不换行（只影响带 data-hub-btn 的按钮） */
  function injectButtonCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var st = HDOC.createElement('style');
      st.id = CSS_ID;
      st.textContent = '.qr--button[' + TAG + ']{flex:0 0 auto !important;width:auto !important;min-width:0 !important;' +
        'max-width:none !important;white-space:nowrap;}' +
        '.qr--button[' + TAG + '] .qr--button-label{padding:0 2px;}';
      (HDOC.head || HDOC.documentElement).appendChild(st);
      log('已注入按钮紧凑样式（只作用于中转站管理的按钮）');
    } catch (e) { }
  }

  function norm(s) { return String(s === undefined || s === null ? '' : s).trim(); }
  function isButtonish(el) {
    try {
      var c = String(el.className || '');
      if (c.indexOf('qr--button-label') >= 0) { return false; }
      return c.indexOf('button') >= 0 || c.indexOf('btn') >= 0;
    } catch (e) { return false; }
  }
  function hostOf(el) {
    if (isButtonish(el)) { return el; }
    try { if (el.parentNode && isButtonish(el.parentNode)) { return el.parentNode; } } catch (e) { }
    return el;
  }
  /* 前缀匹配：登记名 '🎨' 要能命中标签 '🎨暗夜紫'（皮肤按钮的标签随皮肤名变化）。
     命中多个时取「最长的那个」，所以登记名互为前缀（'🎨' 与 '🎨✨'）也不会互相抢。 */
  function matches(text, name) {
    var t = norm(text);
    if (!t) { return false; }
    return t.indexOf(name) === 0;
  }
  /* 这段文字属于哪个登记按钮：所有前缀能对上的名字里，取名字最长的那个。
     名字一样长时按登记顺序取第一个。对不上任何一个 → null。 */
  function matchButton(text) {
    var t = norm(text), best = null, i;
    if (!t) { return null; }
    for (i = 0; i < BUTTONS.length; i++) {
      var b = BUTTONS[i];
      if (!matches(t, b.name)) { continue; }
      if (!best || b.name.length > best.name.length) { best = b; }
    }
    return best;
  }
  /* 登记名互为前缀 = 隐性依赖，启动时自检并在 status() 里报出来（不再靠它决定点谁） */
  function nameConflicts() {
    var out = [], i, j;
    for (i = 0; i < BUTTONS.length; i += 1) {
      for (j = i + 1; j < BUTTONS.length; j += 1) {
        var a = BUTTONS[i].name, b = BUTTONS[j].name;
        if (!a || !b || a === b) { continue; }
        if (a.indexOf(b) === 0 || b.indexOf(a) === 0) { out.push(a + ' ↔ ' + b); }
      }
    }
    return out;
  }
  var warnedConflicts = null;
  function auditNames() {
    var list = nameConflicts(), key = list.join('|');
    if (key === warnedConflicts) { return list; }
    warnedConflicts = key;
    if (list.length) {
      warn('登记名互为前缀：' + list.join('、') + '（命中时按最长的那个算；建议把名字改成互不为前缀）');
    }
    return list;
  }
  /* 文字写进 label（.qr--button-label），别覆盖按钮元素本身 */
  function labelTarget(node) {
    try {
      if (node && node.querySelector) {
        var l = node.querySelector('.qr--button-label');
        if (l) { return l; }
      }
    } catch (e) { }
    return node;
  }
  function findNode(name) {
    try {
      var nodes = HDOC.querySelectorAll('.qr--button-label, .qr--button, #qr--bar button, [data-qr-button]');
      for (var i = 0; i < nodes.length; i++) {
        /* 这一段文字的「主人」必须是这个按钮：避免把别人的按钮画成自己 */
        var owner = matchButton(nodes[i].textContent);
        if (owner && owner.name === name) {
          return { label: labelTarget(nodes[i]), host: hostOf(nodes[i]) };
        }
      }
    } catch (e) { }
    return null;
  }

  var lastFire = 0, lastWhich = '';
  function fire(b) {
    if (api.disposed) { return; }
    var now = Date.now();
    if (lastWhich === b.name && now - lastFire < 320) { return; }
    lastWhich = b.name; lastFire = now;

    if (!defAlive(b._def)) {
      log('点击 ' + b.name + ' → 登记方已不在（脚本被关闭？），按钮将撤下');
      toast('warning', b.name + ' 对应的脚本已经停止了');
      collect();
      ensureButtons(true);
      return;
    }
    if (!b.ready()) {
      toast('warning', b.absent);
      paint();
      return;
    }
    try {
      b.click();
      log('点击 ' + b.name + ' → 已调用登记方 click()');
    } catch (e) {
      toast('error', '调用失败：' + ((e && e.message) || e));
    }
    hsetTimeout(paint, 60);
    hsetTimeout(paint, 400);
  }

  function paint() {
    if (api.disposed) { return; }
    for (var i = 0; i < BUTTONS.length; i++) {
      var b = BUTTONS[i];
      var found = findNode(b.name);
      if (!found) { continue; }
      var want = '';
      try { want = String(b.label(b.get())); } catch (e) { want = b.name; }
      try { if (norm(found.label.textContent) !== want) { found.label.textContent = want; } } catch (e) { }
      try {
        if (found.host.getAttribute(TAG) !== b.name) { found.host.setAttribute(TAG, b.name); }
        if (found.host.title !== b.tip) { found.host.title = b.tip; }
        injectButtonCss();
      } catch (e) { }
    }
  }

  /* 扫描 + 注册 + 绑定 + 绘制（每轮都会核对按钮是否还在、事件是否已绑） */
  function refresh() {
    if (api.disposed) { return BUTTONS.length; }
    var changed = collect();
    ensureButtons(changed);
    bindEvents();
    paint();
    auditNames();
    return BUTTONS.length;
  }

  /* 其它脚本也可以直接调用：__hub.register({...}) */
  function register(def) {
    if (api.disposed) { return false; }
    var d = normDef(def);
    if (!d || find(d.name)) { return false; }
    try { (HOST.__hubDefs = HOST.__hubDefs || []).push(def); } catch (e) { }
    BUTTONS.push(d);
    BUTTONS.sort(function (a, b) { return a.order - b.order; });
    ensureButtons();
    bindEvents();
    paint();
    auditNames();
    log('已登记按钮：' + d.name);
    return true;
  }

  /* 注销某个按钮（登记方关闭时会调用） */
  function unregister(name) {
    var found = false, i, list = [];
    for (i = 0; i < BUTTONS.length; i++) {
      if (BUTTONS[i].name === name) { found = true; continue; }
      list.push(BUTTONS[i]);
    }
    if (!found) { return false; }
    BUTTONS.length = 0;
    for (i = 0; i < list.length; i++) { BUTTONS.push(list[i]); }
    dropEventChannel(name);
    /* 顺手擦掉该按钮留在 DOM 上的标记（酒馆助手重绘按钮栏之前也不要留残迹） */
    try {
      var marked = HDOC.querySelectorAll('[' + TAG + ']');
      for (i = 0; i < marked.length; i++) {
        try { if (marked[i].getAttribute(TAG) === name) { marked[i].removeAttribute(TAG); } } catch (e) { }
      }
    } catch (e) { }
    /* 同时把登记表里的旧登记去掉，否则下一轮轮询又会被收回来（幽灵按钮） */
    try {
      var defs = HOST.__hubDefs || [];
      for (i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === name) { defs.splice(i, 1); }
      }
    } catch (e) { }
    log('登记方撤销按钮：' + name);
    auditNames();
    var names = [], j;
    for (j = 0; j < BUTTONS.length; j++) { names.push(BUTTONS[j].name); }
    if (!names.length) {
      try {
        if (typeof replaceScriptButtons === 'function') {
          if (typeof getScriptId === 'function') { replaceScriptButtons(getScriptId(), []); }
          else { replaceScriptButtons([]); }
        }
      } catch (e) { log('清空按钮表失败：' + ((e && e.message) || e)); }
    } else {
      writeOwnButtons(names);
    }
    return true;
  }

  var api = {
    ver: HUB_VER,
    version: HUB_VERSION,
    unregister: unregister,
    buttons: BUTTONS,
    register: register,
    collect: collect,
    refresh: refresh,
    paint: paint,
    fire: fire,
    logs: function (n) { return LOGS.slice(-(n || 40)).join('\n'); },
    status: function () {
      var out = {
        version: HUB_VERSION, ver: HUB_VER, host: (SAME_WINDOW ? '本窗口' : '父窗口'),
        eventChannel: Object.keys(boundNames).length > 0, domChannel: domBound, disposed: !!api.disposed,
        nameConflicts: nameConflicts(),
        hbAgeMs: api.hb ? (Date.now() - api.hb) : null, buttons: []
      };
      for (var i = 0; i < BUTTONS.length; i++) {
        var b = BUTTONS[i], found = findNode(b.name), ready = false, alive = true;
        try { ready = !!b.ready(); } catch (e) { ready = false; }
        try { alive = defAlive(b._def); } catch (e) { alive = false; }
        out.buttons.push({ name: b.name, order: b.order, ready: ready, alive: alive, nodeFound: !!found, label: found ? norm(found.label.textContent) : null });
      }
      return out;
    }
  };

  /* 按钮审计：列出“所有启用脚本的按钮”和“页面上真实存在的按钮”，用来定位幽灵按钮 */
  function audit() {
    var out = { host: (SAME_WINDOW ? '本窗口' : '父窗口'), own: [], all: null, dom: [] };
    try { if (typeof getScriptButtons === 'function') { out.own = (getScriptButtons() || []).map(function (b) { return b.name + (b.visible === false ? '(隐藏)' : ''); }); } }
    catch (e) { out.own = 'err'; }
    try {
      if (typeof getAllEnabledScriptButtons === 'function') {
        var raw = getAllEnabledScriptButtons() || {};
        var names = {};
        if (typeof getScriptTrees === 'function') {
          ['global', 'preset', 'character'].forEach(function (tp) {
            try {
              (getScriptTrees({ type: tp }) || []).forEach(function (item) {
                if (item && item.type === 'script' && item.id) { names[item.id] = item.name; }
                if (item && item.type === 'folder' && item.scripts) {
                  item.scripts.forEach(function (s2) { if (s2 && s2.id) { names[s2.id] = (item.name ? item.name + '/' : '') + s2.name; } });
                }
              });
            } catch (e) { }
          });
        }
        out.all = Object.keys(raw).map(function (sid) {
          var bs = (raw[sid] || []).map(function (b) { return b.button_name; });
          return (names[sid] || ('脚本 ' + String(sid).slice(0, 8))) + ' → ' + bs.join(' ');
        });
      } else { out.all = ['（当前版本没有 getAllEnabledScriptButtons）']; }
    } catch (e) { out.all = 'err'; }
    try {
      var nodes = HDOC.querySelectorAll('.qr--button, #qr--bar button');
      for (var i = 0; i < nodes.length; i++) {
        var t2 = (nodes[i].textContent || '').trim();
        if (t2) { out.dom.push(t2); }
      }
    } catch (e) { }
    return out;
  }
  api.audit = audit;

  /* 清掉本脚本自己残留的按钮（比如旧版本 JSON 里声明过、现在不该有的） */
  function cleanOwnStale() {
    try {
      if (typeof getScriptButtons !== 'function' || typeof replaceScriptButtons !== 'function' || typeof getScriptId !== 'function') { return; }
      var mine = getScriptButtons() || [];
      if (!mine.length) { return; }
      var keep = [], i, j;
      for (i = 0; i < mine.length; i++) {
        for (j = 0; j < BUTTONS.length; j++) {
          if (BUTTONS[j].name === mine[i].name) { keep.push({ name: mine[i].name, visible: mine[i].visible !== false }); break; }
        }
      }
      if (keep.length !== mine.length) {
        replaceScriptButtons(getScriptId(), keep);
        log('清理本脚本残留按钮：[' + mine.map(function (m) { return m.name; }).join(' ') + '] → [' +
          keep.map(function (k) { return k.name; }).join(' ') + ']');
      }
    } catch (e) { }
  }

  /* 注销：脚本关闭时把监听、定时器、按钮、全局都清掉（可重复调用，只生效一次） */
  api.teardown = function (why) {
    if (api.disposed) { log('已经注销过了，忽略：' + (why || '')); return; }
    api.disposed = true;
    log('正在注销（' + (why || '脚本关闭') + '）：停轮询 / 摘监听 / 清按钮 / 删全局');
    try { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } } catch (e) { }
    try { if (hbTimer) { clearInterval(hbTimer); hbTimer = null; } } catch (e) { }
    try { if (moBtn) { moBtn.disconnect(); moBtn = null; } } catch (e) { }
    /* 事件通道（酒馆助手 eventOn）：逐个 stop()，不留回调 */
    try { for (var k in boundNames) { if (Object.prototype.hasOwnProperty.call(boundNames, k)) { dropEventChannel(k); } } } catch (e) { }
    /* DOM 兜底点击通道 */
    try { if (clickHandler) { HOST.removeEventListener('click', clickHandler, true); } } catch (e) { }
    try { if (clickHandler && HOST !== window) { window.removeEventListener('click', clickHandler, true); } } catch (e) { }
    clickHandler = null;
    domBound = false;
    /* 自定义登记事件（原来用匿名函数注册，注销时摘不掉 → 已关闭的脚本还会被唤醒） */
    try { if (defEvtHandler) { HOST.removeEventListener(EVT_DEF, defEvtHandler); } } catch (e) { }
    try { if (defEvtHandler && HOST !== window) { window.removeEventListener(EVT_DEF, defEvtHandler); } } catch (e) { }
    defEvtHandler = null;
    /* 酒馆助手里的按钮表 */
    try {
      if (typeof replaceScriptButtons === 'function') {
        if (typeof getScriptId === 'function') { replaceScriptButtons(getScriptId(), []); }
        else { replaceScriptButtons([]); }
        log('已清空酒馆助手里的按钮表');
      }
    } catch (e) { }
    /* 自己写在按钮上的属性 + 注入的样式表 */
    try {
      var nodes = HDOC.querySelectorAll('[' + TAG + ']');
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].removeAttribute(TAG); } catch (e) { } }
    } catch (e) { }
    try { var cs = HDOC.getElementById(CSS_ID); if (cs) { cs.remove(); } } catch (e) { }
    /* 只删“自己这一份”：万一旧实例的 pagehide 迟到，也不会把新实例的 __hub 删掉 */
    try { if (HOST.__hub === api) { delete HOST.__hub; } } catch (e) { }
    try { if (window.__hub === api) { delete window.__hub; } } catch (e) { }
    BUTTONS.length = 0;
    log('注销完成：中转站已停止（其它脚本的按钮登记还在，下次启动会重新接手）');
  };
  api.dispose = api.teardown;

  /* ───────── 启动 ───────── */

  var pollTimer = null, moBtn = null, hbTimer = null, defEvtHandler = null;

  /* 手机上也能一眼看到“它到底跑没跑” */
  function announce() {
    if (api.disposed) { return; }
    var names = [], i;
    for (i = 0; i < BUTTONS.length; i++) { names.push(BUTTONS[i].name); }
    var text = '已启动 v' + HUB_VERSION + '｜' +
      (names.length ? '登记 ' + names.length + ' 个按钮：' + names.join(' ') : '暂时没有脚本登记按钮（可以用 __hub.logs() 看日志）');
    log(text);
    toast('info', text);
  }

  function boot() {
    log('启动 v' + HUB_VERSION + ' · 宿主=' + (SAME_WINDOW ? '本窗口' : '父窗口') + '（按钮全部来自其它脚本登记）');

    /* 同版本实例去重：心跳还活着 → 说明另一个中转站正在运行，本实例让位；
       心跳已经停了 → 那是上一个实例的残骸（脚本被关掉时没清干净），本实例接管。 */
    var prev = null;
    try { prev = HOST.__hub; } catch (e) { }
    if (prev && prev.ver === HUB_VER) {
      var hb = 0;
      try { hb = Number(prev.hb || 0); } catch (e) { }
      if (hb && (Date.now() - hb) < HB_STALE) {
        log('已有同版本「🎛 脚本按钮」在运行（' + Math.round((Date.now() - hb) / 1000) + 's 前的心跳）→ 本实例退出。' +
          '如果脚本库里有两份同名脚本，请删掉多余的');
        try { prev.refresh(); } catch (e) { }
        api.disposed = true;
        return false;
      }
      log('发现同版本中转站的残留（心跳已过期，说明旧实例已停止）→ 本实例接管');
    } else if (prev) {
      log('发现其它版本的中转站（v' + (prev.version || '?') + '）→ 本实例接管');
    }

    /* 先挂全局，再慢慢初始化：其它脚本随时可能来登记 */
    try { HOST.__hub = api; } catch (e) { }
    try { window.__hub = api; } catch (e) { }
    api.hb = Date.now();
    try { hbTimer = setInterval(function () { api.hb = Date.now(); }, HB_MS); } catch (e) { }

    bindDelegated();
    refresh();
    cleanOwnStale();
    hsetTimeout(refresh, 300);
    hsetTimeout(refresh, 1200);
    hsetTimeout(refresh, 3000);

    /* 登记方可以立刻通知一声（不通知也行，下面会轮询发现） */
    defEvtHandler = function () { refresh(); };
    try { HOST.addEventListener(EVT_DEF, defEvtHandler); } catch (e) { }
    if (HOST !== window) { try { window.addEventListener(EVT_DEF, defEvtHandler); } catch (e) { } }

    try { pollTimer = setInterval(refresh, POLL_MS); } catch (e) { }

    try {
      var MO = (HOST && HOST.MutationObserver) || window.MutationObserver;
      if (MO) {
        var queued = false;
        moBtn = new MO(function () {
          if (queued || api.disposed) { return; }
          queued = true;
          hsetTimeout(function () { queued = false; paint(); }, 400);
        });
        moBtn.observe(HDOC.body, { childList: true, subtree: true });
      }
    } catch (e) { }

    /* 脚本关闭：酒馆助手会在【本脚本 iframe 自己】身上触发 pagehide；
       监听父窗口的 pagehide 只在整页刷新时才有用（以前只监听宿主，
       导致脚本被关掉时没人清理，__hub 一直“假活着”）。两条都挂，清理是幂等的。 */
    try { window.addEventListener('pagehide', function () { try { api.teardown('脚本关闭'); } catch (e) { } }); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', function () { try { api.teardown('页面刷新/关闭'); } catch (e) { } }); } catch (e) { } }

    log('就绪：' + JSON.stringify(api.status()));
    var aud = audit();
    log('按钮审计 · 本脚本按钮=' + JSON.stringify(aud.own) +
      ' · 页面上看到的按钮=' + JSON.stringify(aud.dom) +
      ' · 所有启用脚本的按钮=' + JSON.stringify(aud.all));

    /* 等 1.6s，让其它脚本把登记推过来，再报“我跑起来了 + 登记到什么” */
    hsetTimeout(function () { try { announce(); } catch (e) { } }, 1600);
    return true;
  }

  try { boot(); } catch (e) { log('启动失败：' + ((e && e.message) || e)); }
})();
