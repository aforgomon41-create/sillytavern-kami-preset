/* ============================================================
 * 🔄 远程更新   v1.1
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 纯后台脚本：**不向按钮中转站登记任何按钮**。它只在每次启动时做一件事：
 * 去看一眼指定 GitHub 仓库的 Releases 里有没有更新版本的预设。
 *
 *   ① 读仓库的 Releases 接口（api.github.com），取最新一个非草稿 Release
 *      与它的预设 JSON 附件（附件名即正式分发名）
 *   ② 和本机当前预设的版本号比大小（大版本.小版本.构建号，三级比较；
 *      认正式命名 卡密预设v0.90-97-20260922，也认旧命名 0.9-97 / 0.9-260917-97）
 *   ③ 确实有更新、且这个版本没被用户拒绝过 → 弹**酒馆原生弹窗**问要不要更新，
 *      更新说明取 Release 的说明正文，放在弹窗内的可滚动区域里（窗口不会太高）
 *   ④ 点「立即更新」→ 下载附件 → 写进用户的预设文件夹 → 提醒用户手动切换
 *      点「暂不更新」→ 把这个版本号记下来，以后不再为它弹窗
 *
 * ── 版本信息存在哪 ──
 * 存在**脚本变量**里（getVariables / replaceVariables，type: 'script'）。
 * 对「预设脚本」而言，脚本变量就存在预设文件内部（酒馆服务端数据目录），
 * 不依赖浏览器本地存储 —— 云酒馆用户换设备、换浏览器都跟着账号走。
 * 本脚本用脚本变量 kami-update 记：skipped（拒绝过的版本）、
 * imported（已经写入过的版本）、repo（可选的仓库配置覆盖）、
 * lastCheckAt（上次连网检查的时间，用来做检查间隔）。
 *
 * ── 关于 GitHub API 限流 ──
 * 未认证的 GitHub API 每个 IP 每小时限 60 次请求，用户常聚在同一出口 IP 下，
 * 所以启动时的自动检查默认 6 小时内不重复连网（控制台 KamiUpdate.check() 可随时手动查）。
 *
 * ── 仓库配置 ──
 * 把下面 REPO_OWNER / REPO_NAME 填上即可；两项留空 = 未配置：脚本只在日志里
 * 说明一句，不发起任何网络请求。也可以不重新构建，直接在酒馆助手「脚本库」
 * 的编辑界面里改本脚本的脚本变量 repo 字段（{owner, repo}）来指向仓库。
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '1.2';
  var API_NAME = 'KamiUpdate';
  var VARS_KEY = 'kami-update';
  /* 本实例的身份证。pagehide 可能**迟到**（酒馆助手重挂脚本 iframe 时旧实例的 pagehide
     晚于新实例的启动），注销时如果按名字删全局，会把新实例刚挂上去的 API 一起删掉 ——
     真机表现就是「远程更新脚本没在运行」且再也无法唤醒（本脚本没有按钮，唯一产物是这个
     全局，删了只能整页刷新）。同一个坑 10-脚本按钮.js 在 __hub 上已经修过一次（:673）。 */
  var INSTANCE_ID = 'kami-update-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
  var LOGTAG = '更新';
  var TOAST_TITLE = '🔄 远程更新';

  /* ───────── GitHub 仓库配置 ─────────
   * 分发走 GitHub Releases：脚本读仓库的 Releases 接口，拿最新版预设附件。
   * 两项都要填；留空 = 尚未配置（脚本不请求网络，只在日志里说明）。 */
  var REPO_OWNER = 'aforgomon41-create';
  var REPO_NAME = 'sillytavern-kami-preset';

  var BOOT_DELAY = 3000;   // 启动后多久做第一次检查（等界面与其它脚本就绪）
  var CALM_WAIT = 10000;   // 有别的弹窗/向导占着时，隔多久再试
  var CALM_TIMES = 6;      // 最多等几轮（约 1 分钟），等不到本次就放弃
  var FETCH_MS = 20000;    // 下载超时
  var DEDUPE_MS = 30000;   // 同一窗口里出现重复脚本实例时的退避窗口
  /* 未认证的 GitHub API 限制每个 IP 每小时 60 次请求，用户常聚在同一出口 IP 下，
     所以默认 6 小时内不重复连网（手动 KamiUpdate.check(true) 可强制）。 */
  var CHECK_INTERVAL_HOURS = 6;

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

  /* ───────── 日志 / 提示 ───────── */

  var LOGS = [];
  function log(msg) {
    LOGS.push(msg);
    if (LOGS.length > 60) { LOGS.shift(); }
    try { if (window.console && console.log) { console.log('[' + LOGTAG + '] ' + msg); } } catch (e) { }
  }
  function warn(msg) {
    log('⚠ ' + msg);
    try { if (window.console && console.warn) { console.warn('[' + LOGTAG + '] ⚠ ' + msg); } } catch (e) { }
  }
  function toast(kind, msg, ms) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') {
        if (ms && typeof box.options === 'object' && box.options) {
          var old = box.options.timeOut;
          box.options.timeOut = ms;
          box[kind](msg, TOAST_TITLE);
          box.options.timeOut = old;
        } else {
          box[kind](msg, TOAST_TITLE);
        }
      }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }

  /* 定时器挂在宿主窗口上（脚本 iframe 是隐藏的，后台标签页里会被浏览器节流）；
     句柄带上「是哪个窗口的」，注销时按原窗口清理。 */
  function hsetTimeout(fn, ms) {
    var w = (HOST && HOST.setTimeout) ? HOST : window;
    try { return { w: w, id: w.setTimeout(fn, ms) }; } catch (e) { }
    return { w: window, id: setTimeout(fn, ms) };
  }
  function hclear(t) {
    try { if (t && t.id !== undefined && t.id !== null) { t.w.clearTimeout(t.id); } } catch (e) { }
  }

  /* ───────── 状态 ───────── */

  var disposed = false;
  var busy = false;               // 一次检查流程正在进行中（防止手动 check 撞车）
  var timers = [];                // 待清理的定时器句柄
  var calmTimer = null;           // 等待「界面空闲」的重试句柄
  var checks = 0;                 // 发起过的检查次数
  var last = {                    // 最近一次检查的结果（status() 用）
    at: 0, ok: false, error: null,
    localName: null, localBuild: null, localVersion: null,
    remote: null, action: null    // action: 'none' | 'skipped' | 'imported' | 'declined'
  };
  var vars = null;                // 脚本变量 kami-update（内存副本）

  /* ───────── 脚本变量（版本记录存在这里，服务端，云酒馆也认） ───────── */

  function readVars() {
    vars = {};
    try {
      if (typeof getVariables === 'function') {
        var all = getVariables({ type: 'script' }) || {};
        var v = all[VARS_KEY];
        if (v && typeof v === 'object') { vars = v; }
      }
    } catch (e) { log('读脚本变量失败：' + ((e && e.message) || e)); }
    if (typeof vars.skipped !== 'string') { vars.skipped = ''; }
    if (typeof vars.imported !== 'string') { vars.imported = ''; }
    if (typeof vars.lastCheckAt !== 'number') { vars.lastCheckAt = 0; }
    return vars;
  }

  /* 只在真的记了新东西时才写回：不写就不会触发预设文件的保存。 */
  function saveVars(patch) {
    if (disposed) { return false; }
    var changed = false, k;
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) { continue; }
      if (JSON.stringify(vars[k]) !== JSON.stringify(patch[k])) { vars[k] = patch[k]; changed = true; }
    }
    if (!changed) { return false; }
    try {
      if (typeof replaceVariables !== 'function') { warn('当前版本没有 replaceVariables，版本记录写不进去（换浏览器会重复弹窗）'); return false; }
      var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
      all[VARS_KEY] = vars;
      replaceVariables(all, { type: 'script' });
      log('已记下：' + JSON.stringify(patch));
      return true;
    } catch (e) { warn('写脚本变量失败：' + ((e && e.message) || e)); return false; }
  }

  /* ───────── 仓库配置（源码常量优先，脚本变量可覆盖） ───────── */

  function cleanStr(v) {
    try { return (v === undefined || v === null) ? '' : String(v).replace(/^[\s\u200B]+|[\s\u200B]+$/g, ''); } catch (e) { return ''; }
  }

  function repoConfig() {
    var o = cleanStr(vars && vars.repo && vars.repo.owner) || cleanStr(REPO_OWNER);
    var r = cleanStr(vars && vars.repo && vars.repo.repo) || cleanStr(REPO_NAME);
    return { owner: o, repo: r, configured: !!(o && r) };
  }

  function releasesApiUrl(cfg) {
    return 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' +
      encodeURIComponent(cfg.repo) + '/releases?per_page=10';
  }

  /* ───────── 酒馆设置：读当前预设名 ───────── */

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

  function domPresetName() {
    try {
      var sel = HDOC.getElementById('settings_preset_openai');
      if (!sel) { return ''; }
      if (sel.selectedOptions && sel.selectedOptions.length) {
        var t = cleanStr(sel.selectedOptions[0].textContent);
        if (t) { return t; }
      }
      if (sel.options && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex]) {
        return cleanStr(sel.options[sel.selectedIndex].text);
      }
    } catch (e) { }
    return '';
  }

  /* 当前预设名：四层兜底（与 🌟 预设设置脚本同一套判法）。
     拿不到就返回空 —— 绝不猜名字。 */
  function resolvePresetName() {
    var ctx = stCtx(), s = settingsOf(ctx), pm = null, i;
    try { if (ctx && typeof ctx.getPresetManager === 'function') { pm = ctx.getPresetManager('openai'); } } catch (e) { }
    var layers = [
      ['getSelectedPresetName()', function () { return (pm && typeof pm.getSelectedPresetName === 'function') ? cleanStr(pm.getSelectedPresetName()) : ''; }],
      ['活设置 preset_settings_openai', function () { return cleanStr(s && s.preset_settings_openai); }],
      ['活设置 name', function () { return cleanStr(s && s.name); }],
      ['预设下拉框选中项', domPresetName]
    ];
    for (i = 0; i < layers.length; i++) {
      try {
        var got = layers[i][1]();
        if (got) { return { name: got, from: layers[i][0] }; }
      } catch (e) { }
    }
    return { name: '', from: null };
  }

  /* 从预设名解析版本号。认这些命名：
   *   现行：kami-v0.90-113-20260923   （v大版本.两位小版本-构建号-日期；2026-09-23 起改用 ASCII 前缀，
   *          因为 GitHub Releases 会把非 ASCII 附件名直接削掉，「卡密预设v…」传上去会变成「v…」）
   *   曾用：卡密预设v0.90-113-20260923
   *   旧版：卡密预设0.9-97 / 卡密预设0.9-260917-97
   * 返回 { major, minor, build, date, raw }；认不出来返回 null（绝不猜）。 */
  function parseVersion(name) {
    var str = cleanStr(name);
    var m = /(?:kami-|卡密预设)?v(\d+)\.(\d+)-(\d+)-(\d{8})(?:\D|$)/i.exec(str);
    if (m) {
      /* 正式命名的「两位小版本」按小数读：v0.90 就是 0.9，
         和旧命名 0.9-97 是同一个版本，不会误判为有更新。 */
      return { major: +m[1], minorDigits: m[2], minor: parseFloat('0.' + m[2]), build: +m[3], date: m[4], raw: str };
    }
    m = /(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d+)(?:\D|$)/i.exec(str);
    if (m) {
      return { major: 0, minorDigits: '9', minor: 0.9, build: +m[1], date: '', raw: str };
    }
    return null;
  }

  /* 版本比大小：先大版本，再小版本，最后构建号。a 比 b 新返回正数。 */
  function cmpVersion(a, b) {
    if (a.major !== b.major) { return a.major - b.major; }
    if (a.minor !== b.minor) { return a.minor - b.minor; }
    return a.build - b.build;
  }

  /* 版本号的展示用短串：v0.90-97 → "v0.90-97"（沿用文件名里的写法） */
  function versionLabel(v) {
    if (!v) { return ''; }
    return 'v' + v.major + '.' + v.minorDigits + '-' + v.build;
  }

  /* 本机已安装的预设名（用来判断「新版本其实已经下载过了」） */
  function installedNames() {
    var out = [];
    try { if (typeof getPresetNames === 'function') { out = getPresetNames() || []; } } catch (e) { }
    if (!out.length) {
      try {
        var ctx = stCtx();
        if (ctx && typeof ctx.getPresetManager === 'function') {
          var pm = ctx.getPresetManager('openai');
          if (pm && typeof pm.getAllPresets === 'function') { out = pm.getAllPresets() || []; }
        }
      } catch (e) { }
    }
    return out;
  }

  /* ───────── 网络 ───────── */

  /* 把一条 fetch 的失败翻成人话：手机流量到 GitHub 的连通性时好时坏，
     浏览器只会丢一句干巴巴的 TypeError（Failed to fetch），得替用户脱壳后说明。 */
  function fetchErrText(e) {
    var msg = (e && e.message) ? e.message : String(e);
    var name = (e && e.name) ? String(e.name) : '';
    if (name === 'AbortError' || /abort/i.test(msg)) { return '超时（等了 ' + Math.round(FETCH_MS / 1000) + ' 秒没回音）'; }
    if (/failed\s+to\s+fetch/i.test(msg)) { return '网络连不上 GitHub（这个网络下访问它不通）'; }
    return msg;
  }

  /* 下载链（本次新增）：按顺序逐条试，哪条成功就用哪条。
     ① GitHub Release 直链 —— 发版的正路，永远在链上
     ② GitHub API 附件接口 —— 与①最终同落一台 CDN，但入口域名不同（api.github.com），
        多一条路；带 Accept: application/octet-stream 拿附件本体
     ③ GitHub raw 镜像 —— 要把预设 JSON 提交进仓库才有用，默认**关**（代价见 meta.json 说明）
     ④ jsDelivr 镜像 —— 同上，默认**关**
     ③④ 是否把 JSON 提进仓库由派活方拍板；这里只提供开关（源码常量 + 脚本变量可覆盖）。 */
  var RAW_DIR = 'release';            // 镜像通道假设预设 JSON 在仓库的这个目录里（可用脚本变量 rawDir 覆盖）
  var USE_RAW_MIRROR = false;         // ① 改成 true = raw 镜像进链（同时要在仓库 rawDir 里放了这份 JSON）
  var USE_JSD_MIRROR = false;         // ① 改成 true = jsDelivr 镜像进链
  var MIRROR_ATTEMPTS = 2;            // 每条通道尝试的次数（手机网络抖一下的第二枪）
  var RETRY_DELAY_MS = 1500;          // 同一条通道两次尝试之间隔多久

  function assetFileName(remote) {
    return cleanStr(remote.name) + '.json';   /* remote.name 已是去 .json 的正式分发名 */
  }

  /* 把没上链资格的通道滤掉后按序返回 */
  function buildChain(remote, cfg) {
    var tag = cleanStr(remote.version);
    var dir = cleanStr((vars && vars.rawDir) || RAW_DIR);
    var file = assetFileName(remote);
    var useRaw = USE_RAW_MIRROR || !!(vars && vars.mirrorRaw === true);
    var useJsd = USE_JSD_MIRROR || !!(vars && vars.mirrorJsdelivr === true);
    var list = [
      { id: 'github', label: 'GitHub 直链', url: remote.url,
        ok: !!remote.url },
      { id: 'api', label: 'GitHub API 附件',
        url: 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
          '/releases/assets/' + cleanStr(remote.assetId),
        headers: { 'Accept': 'application/octet-stream' },
        ok: !!remote.assetId },
      { id: 'raw', label: 'GitHub raw 镜像',
        url: 'https://raw.githubusercontent.com/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
          '/' + encodeURIComponent(tag) + '/' + dir + '/' + encodeURIComponent(file),
        ok: !!useRaw && !!tag },
      { id: 'jsdelivr', label: 'jsDelivr 镜像',
        url: 'https://cdn.jsdelivr.net/gh/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
          '@' + encodeURIComponent(tag) + '/' + dir + '/' + encodeURIComponent(file),
        ok: !!useJsd && !!tag },
    ];
    var on = [], off = [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].ok) { on.push(list[i]); } else { off.push(list[i]); }
    }
    if (off.length) {
      var names = [];
      for (i = 0; i < off.length; i++) { names.push(off[i].label); }
      log('这几条镜像通道留着没走（' + names.join(' / ') + '）：开关没开或这一版没有对应下载地址');
    }
    return { channels: on, skipped: off };
  }

  function fetchText(url, headers, ms) {
    var ctrl = null, timer = null;
    try { if (typeof AbortController === 'function') { ctrl = new AbortController(); } } catch (e) { }
    if (ctrl) {
      timer = hsetTimeout(function () { try { ctrl.abort(); } catch (e) { } }, ms || FETCH_MS);
    }
    var opt = ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' };
    if (headers) { try { opt.headers = headers; } catch (e) { } }
    var p = fetch(url, opt)
      .then(function (res) {
        if (!res.ok) { var er = new Error('HTTP ' + res.status); er.status = res.status; throw er; }
        return res.text();
      });
    if (timer) { p = p['finally'] ? p['finally'](function () { hclear(timer); }) : p; }
    return p;
  }

  /* 一条通道小重试：网络抖动通常缓一下就过，同一条通道先试第二次，而不是立刻换道。
     延迟 ≤0 = 不等待（自测环境没有真实的时钟，靠这个能原地重试）。 */
  function delayChainRetry(ms) {
    var w = (ms === 0) ? 0 : (ms || RETRY_DELAY_MS);
    if (!(w > 0)) { return Promise.resolve(); }
    return new Promise(function (res) {
      var t = hsetTimeout(res, w);
      if (timers.indexOf(t) < 0) { timers.push(t); }
    });
  }

  function downloadViaChain(remote, cfg) {
    var chain = buildChain(remote, cfg);
    var tried = [];
    function tryOnce(ch, left) {
      if (!left || left < 1) { return Promise.reject(new Error('通道尝试次数异常')); }
      var t = MIRROR_ATTEMPTS - left + 1;
      log('下载尝试：通道「' + ch.label + '」第 ' + t + '/' + MIRROR_ATTEMPTS + ' 次 ' + ch.url);
      return fetchText(ch.url, ch.headers).then(function (text) {
        log('通道「' + ch.label + '」成功（第 ' + (MIRROR_ATTEMPTS - left + 1) + ' 次尝试）');
        return { text: text, via: ch.label };
      })['catch'](function (e) {
        var why = fetchErrText(e);
        log('通道「' + ch.label + '」第 ' + t + ' 次尝试没成功：' + why);
        if (left > 1) {
          return delayChainRetry(RETRY_DELAY_MS).then(function () { return tryOnce(ch, left - 1); });
        }
        tried.push({ label: ch.label, url: ch.url, err: why });
        return Promise.reject(e);
      });
    }

    function go(i) {
      if (i >= chain.channels.length) {
        var errs = [];
        for (var k = 0; k < tried.length; k++) { errs.push('「' + tried[k].label + '」' + tried[k].err); }
        var friendly = '几条下载通道都试不通（' + errs.join('；') + '）。' +
          '多半是当前网络访问不到 GitHub：可以换个 Wi-Fi 稍后再试；或者打开仓库' +
          ' https://github.com/' + encodeURIComponent(repoConfig().owner) + '/' +
          encodeURIComponent(repoConfig().repo) + '/releases 手动下载 ' + assetFileName(remote) + ' 导入酒馆';
        var er2 = new Error(friendly);
        er2.networkAll = true;
        return Promise.reject(er2);
      }
      var ch = chain.channels[i];
      log('切到下载通道「' + ch.label + '」（' + (i + 1) + '/' + chain.channels.length + '）');
      return tryOnce(ch, MIRROR_ATTEMPTS)['catch'](function (e) {
        if (i + 1 < chain.channels.length) {
          log('这条走到底也没通（' + (e && e.status ? '是 HTTP ' + e.status : '网络层问题') +
            '），回退到下一条：' + chain.channels[i + 1].label);
        }
        return go(i + 1);   /* 到头了 → go 会走进「全失败」分支，给出人话错误 */
      });
    }
    return go(0).then(function (r) {
      /* 把成功用的通道记进日志，回退时更要写明白 —— 用户看得懂这种说法 */
      if (chain.channels.length > 1 && tried.length > 0) {
        log('回退成功：用的不是首选那一条，最终走的是「' + r.via + '」（前面试过的通道：' +
          tried.map(function (t) { return t.label; }).join(' / ') + '）');
      }
      tried = [];
      return r;
    }, function (e) {
      tried = [];
      throw e;
    });
  }

  /* 读 GitHub API：把状态码与响应头也带出来（403 要能区分「限流」和「没权限」） */
  function fetchApi(url, ms) {
    var ctrl = null, timer = null;
    try { if (typeof AbortController === 'function') { ctrl = new AbortController(); } } catch (e) { }
    if (ctrl) {
      timer = hsetTimeout(function () { try { ctrl.abort(); } catch (e) { } }, ms || FETCH_MS);
    }
    var p = fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-store' } : { cache: 'no-store' })
      .then(function (res) {
        /* 防御性读 body：异常响应（如 404）可能连 text() 都没有 */
        var body = (res.text && typeof res.text === 'function') ? res.text() : Promise.resolve('');
        return body.then(function (text) {
          return {
            status: res.status,
            text: text,
            remaining: (res.headers && res.headers.get) ? res.headers.get('x-ratelimit-remaining') : null
          };
        });
      });
    if (timer) { p = p['finally'] ? p['finally'](function () { hclear(timer); }) : p; }
    return p;
  }

  /* ───────── 原生弹窗（酒馆自己的 /popup 命令） ───────── */

  /* 说明文本净化：既要能当 HTML 显示，又不能带会绊倒斜杠命令解析器的字符。
     · < > & " 转义成实体（弹窗里照原样显示）
     · | 换成全角（| 在斜杠命令里是管道符，会把命令截断）
     · { } 换成全角、反斜杠换掉（避免被当成宏/转义处理）          */
  function escText(s) {
    return cleanStr(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\|/g, '｜')
      .replace(/\\/g, '＼')
      .replace(/\{/g, '｛')
      .replace(/\}/g, '｝');
  }
  function notesHtml(notes) {
    var t = escText(notes);
    if (!t) { return ''; }
    return t.replace(/\r\n|\r|\n/g, '<br>');
  }

  function buildPopupHtml(remote, localText) {
    var h = [];
    h.push("<div style='font-size:13px;line-height:1.65;text-align:left;'>");
    h.push("<div style='margin:0 0 8px;'>检测到新版本预设 <b>" + escText(remote.name || remote.version) + '</b>');
    if (localText) { h.push('（当前 ' + escText(localText) + '）'); }
    h.push('</div>');
    /* 更新说明单独一个可滚动区域：窗口再高也高不起来，手机上也能滑 */
    h.push("<div style='max-height:36vh;overflow-y:auto;-webkit-overflow-scrolling:touch;" +
      "border:1px solid rgba(127,127,127,.4);border-radius:8px;padding:8px 10px;" +
      "word-break:break-word;white-space:normal;'>");
    var n = notesHtml(remote.notes);
    h.push(n ? n : "<span style='opacity:.7;'>（这一版没有写更新说明）</span>");
    h.push('</div>');
    h.push("<div style='margin:8px 0 0;opacity:.72;font-size:12px;'>" +
      '点「立即更新」会自动下载并写入你的预设文件夹；写入后还需要你手动切换预设。</div>');
    h.push('</div>');
    return h.join('');
  }

  /* 跑一条斜杠命令：优先酒馆助手的 triggerSlash，退回酒馆自己的 executeSlashCommandsWithOptions */
  function runSlash(cmd) {
    if (typeof triggerSlash === 'function') {
      return Promise.resolve(triggerSlash(cmd));
    }
    var ctx = stCtx();
    if (ctx && typeof ctx.executeSlashCommandsWithOptions === 'function') {
      return Promise.resolve(ctx.executeSlashCommandsWithOptions(cmd)).then(function (r) {
        if (r && r.isError) { throw new Error(r.errorMessage || '斜杠命令执行失败'); }
        return r ? r.pipe : undefined;
      });
    }
    return Promise.reject(new Error('当前环境没有可用的斜杠命令接口，弹不出原生弹窗'));
  }

  /* 弹窗问要不要更新；返回 true = 用户点了「立即更新」 */
  function askUpdate(remote, localText) {
    var html = buildPopupHtml(remote, localText);
    var cmd = '/popup result=true scroll=true' +
      ' okButton="立即更新"' +
      ' cancelButton="暂不更新"' +
      ' ' + html;
    log('弹原生弹窗询问是否更新到 ' + (remote.version || remote.name));
    return runSlash(cmd).then(function (res) {
      var yes = String(res) === '1';
      log('用户选择：' + (yes ? '立即更新' : ('暂不更新（结果 ' + JSON.stringify(res) + '）')));
      return yes;
    });
  }

  /* ───────── 写入预设文件夹 ───────── */

  function safePresetName(name) {
    return cleanStr(name).replace(/\.json$/i, '').replace(/[\\/\:*?"<>|]/g, '').replace(/^[\s.]+|[\s.]+$/g, '');
  }

  /* 主路径：酒馆助手的 importRawPreset（= 点酒馆界面「导入预设」那一套，
     文件原样写进 OpenAI Settings，并顺手刷新预设下拉列表）。
     退回路径：直接打酒馆自己的 /api/presets/save（需要刷新页面才在下拉里出现）。 */
  function writePreset(name, json, text) {
    if (typeof importRawPreset === 'function') {
      return Promise.resolve(importRawPreset(name, text)).then(function (ok) {
        if (!ok) { throw new Error('importRawPreset 返回失败'); }
        return { via: 'importRawPreset' };
      });
    }
    var ctx = stCtx();
    if (!ctx || typeof ctx.getRequestHeaders !== 'function') {
      return Promise.reject(new Error('没有 importRawPreset，也拿不到酒馆的请求头，无法写盘'));
    }
    var target = (HOST && HOST.fetch) ? HOST.fetch : fetch;
    return Promise.resolve(target.call(HOST, '/api/presets/save', {
      method: 'POST',
      headers: ctx.getRequestHeaders(),
      body: JSON.stringify({ name: name, preset: json, apiId: 'openai' })
    })).then(function (res) {
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      return { via: '/api/presets/save' };
    });
  }

  /* ───────── 等一个「没人占着弹窗」的时机 ───────── */

  function visible(sel) {
    try {
      var el = HDOC.querySelector(sel);
      if (!el) { return false; }
      if (el.hasAttribute('hidden')) { return false; }
      var v = HDOC.defaultView;
      var cs = (v && v.getComputedStyle) ? v.getComputedStyle(el) : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) { return false; }
      return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
    } catch (e) { return false; }
  }

  /* 引导向导、酒馆原生弹窗（dialog.popup[open]）正开着 → 先让路 */
  function busyOnScreen() {
    return visible('#kami-guide-panel') || visible('dialog.popup[open]');
  }

  function waitCalm(times, fn) {
    if (disposed) { return; }
    if (!busyOnScreen()) { fn(); return; }
    if (times <= 0) {
      log('界面上一直有弹窗/向导开着，本次更新提示先跳过（下次启动会再问）');
      return;
    }
    calmTimer = hsetTimeout(function () { waitCalm(times - 1, fn); }, CALM_WAIT);
  }

  /* ───────── 主流程 ───────── */

  /* 读仓库最新一个「发出来的」Release，从里面挑预设 JSON 附件。
     只跳过草稿；预发布（prerelease）也算数，开发期发版不受阻。 */
  function fetchLatestRelease(cfg) {
    return fetchApi(releasesApiUrl(cfg)).then(function (r) {
      if (r.status === 403 && r.remaining === '0') {
        throw new Error('GitHub API 本小时配额用尽（按 IP 限流），稍后会再试');
      }
      if (r.status === 404) { throw new Error('仓库不存在或还没公开（404）'); }
      if (r.status !== 200) { throw new Error('HTTP ' + r.status); }
      var list = null;
      try { list = JSON.parse(r.text); } catch (e) { throw new Error('Releases 接口返回的不是合法 JSON'); }
      if (!Array.isArray(list)) { throw new Error('Releases 接口返回内容不对'); }
      for (var i = 0; i < list.length; i++) {
        var rel = list[i];
        if (!rel || rel.draft) { continue; }
        var assets = (rel.assets || []).filter(function (a) {
          return a && /\.json$/i.test(cleanStr(a.name));
        });
        if (!assets.length) { continue; }
        var pick = null;
        for (var j = 0; j < assets.length; j++) {
          if (/^(?:kami-|卡密预设)/i.test(assets[j].name)) { pick = assets[j]; break; }
        }
        /* 没有带前缀的（例如曾用中文名，被 GitHub 削成 v0.90-…）：挑第一个「名字里能解析出版本号」的 */
        if (!pick) {
          for (var j2 = 0; j2 < assets.length; j2++) {
            if (parseVersion(assets[j2].name)) { pick = assets[j2]; break; }
          }
        }
        if (!pick) { pick = assets[0]; }
        /* 版本号优先从附件文件名解析（正式分发名），解析不了再退回 tag / 标题 */
        var v = parseVersion(pick.name) || parseVersion(rel.tag_name) || parseVersion(rel.name);
        if (!v) { continue; }
        return {
          name: safePresetName(pick.name),
          version: versionLabel(v),       /* tag 的短写法：v0.90-122；同时是镜像仓库取快照用的 tag */
          major: v.major, minor: v.minor, build: v.build,
          released: cleanStr(rel.published_at).slice(0, 10),
          notes: typeof rel.body === 'string' ? rel.body : '',
          url: cleanStr(pick.browser_download_url),
          assetId: pick.id || null        /* API 附件接口（下载链第②条）要用它来定位附件 */
        };
      }
      throw new Error('仓库里没有一个带预设 JSON 附件的 Release');
    });
  }

  /* force = 手动检查：忽略「已拒绝/已写入」记录，也忽略本机已安装 */
  function check(force) {
    if (disposed) { return Promise.resolve(last); }
    if (busy) { log('上一次检查还没结束，忽略本次'); return Promise.resolve(last); }
    busy = true;
    checks++;
    var cfg = repoConfig();
    if (!cfg.configured) {
      busy = false;
      last.ok = true;
      last.error = null;
      last.action = 'unconfigured';
      log('还没配置 GitHub 仓库（REPO_OWNER / REPO_NAME 都是空的），本次不检查更新；' +
        '仓库建好后填进脚本顶部即可，也可以在脚本变量 kami-update.repo 里覆盖');
      return Promise.resolve(last);
    }

    log('第 ' + checks + ' 次检查：读 Releases ' + releasesApiUrl(cfg));
    return fetchLatestRelease(cfg).then(function (remote) {
      last.ok = true;
      last.error = null;
      last.remote = remote;
      var local = resolvePresetName();
      var localVer = parseVersion(local.name);
      last.localName = local.name || null;
      last.localBuild = localVer ? localVer.build : null;
      last.localVersion = localVer ? versionLabel(localVer) : null;
      log('仓库最新：' + remote.version + '；本机当前预设：' +
        (local.name ? ('「' + local.name + '」（' + (localVer === null ? '版本没能识别' : versionLabel(localVer)) + '，取自' + local.from + '）') : '没能识别'));

      /* ① 先比版本：不比你新就什么都不做（绝大多数启动都是这一种） */
      var newer = (localVer === null) ? true : (cmpVersion(remote, localVer) > 0);
      if (!newer) {
        last.action = 'none';
        log('已经是最新版本，什么都不做');
        return last;
      }

      /* ② 这个版本已经处理过了 → 不弹 */
      if (!force) {
        if (vars.skipped && vars.skipped === remote.version) {
          last.action = 'skipped';
          log('版本 ' + remote.version + ' 被用户拒绝过，不再弹窗');
          return last;
        }
        if (vars.imported && vars.imported === remote.version) {
          last.action = 'imported';
          log('版本 ' + remote.version + ' 已经写入过本机，不再弹窗');
          return last;
        }
        /* 本机预设文件夹里已经有这个版本了（用户自己导入过，只是没切换）→ 不弹 */
        var names = installedNames(), i, has = false;
        for (i = 0; i < names.length; i++) {
          if (cleanStr(names[i]) === remote.name) { has = true; break; }
        }
        if (has) {
          last.action = 'installed';
          log('本机已经有预设「' + remote.name + '」，不需要再更新');
          return last;
        }
      }

      return new Promise(function (resolve) {
        waitCalm(CALM_TIMES, function () {
          if (disposed) { resolve(last); return; }
          askUpdate(remote, local.name || '').then(function (yes) {
            if (yes) { resolve(doUpdate(remote)); }
            else {
              saveVars({ skipped: remote.version });
              last.action = 'declined';
              toast('info', '好的，' + remote.version + ' 先不更新（之后不再为这一版弹窗）', 6000);
              resolve(last);
            }
          })['catch'](function (e) {
            warn('弹窗失败：' + ((e && e.message) || e));
            toast('warning', '发现新版本 ' + remote.version + '，但弹窗没弹出来（详见日志）', 8000);
            resolve(last);
          });
        });
      });
    })['catch'](function (e) {
      last.ok = false;
      last.error = (e && e.message) || String(e);
      log('检查失败：' + last.error + '（仓库还没建好或网络不通，下次启动会再试）');
      return last;
    })['then'](function (r) {
      busy = false;
      last.at = Date.now();
      /* 记本次连网时间（取整到小时，同一小时内重复启动不重复写文件） */
      saveVars({ lastCheckAt: Math.floor(Date.now() / 3600000) * 3600000 });
      return r;
    });
  }

  /* 用户点了「立即更新」：下载 → 写进预设文件夹 → 提醒切换。
     下载走下载链（buildChain 里那几条，按序回退），直链走不通也有得选。 */
  function doUpdate(remote) {
    var cfg = repoConfig();
    log('开始下载预设：' + remote.url);
    return downloadViaChain(remote, cfg).then(function (got) {
      var text = got.text;
      var json = null;
      try { json = JSON.parse(text); } catch (e) { throw new Error('下载到的不是合法 JSON'); }
      if (!json || typeof json !== 'object' || !Array.isArray(json.prompts)) {
        throw new Error('下载到的文件不像一个预设（没有 prompts）');
      }
      return writePreset(remote.name, json, text);
    }).then(function (r) {
      saveVars({ imported: remote.version, skipped: '' });
      last.action = 'imported';
      log('已写入预设「' + remote.name + '」（写盘用的通道 ' + r.via + '；下载用的通道见上面日志）');
      toast('success', '新预设「' + remote.name + '」已写入酒馆。打开左侧抽屉的「AI 响应配置」，把预设切换成它即可生效', 15000);
      return last;
    })['catch'](function (e) {
      last.error = (e && e.message) || String(e);
      warn('更新失败：' + last.error);
      var tip = (e && e.networkAll)
        ? ''   /* 人话汇总里已经带了「换网络 / 手动下载」两句指引，toast 不再叠加 */
        : '（可以手动去仓库下载导入）';
      toast('error', '更新失败：' + last.error + tip, 12000);
      return last;
    });
  }

  /* ───────── 全局 API ───────── */

  function status() {
    return {
      version: VERSION,
      repo: repoConfig(),
      configured: repoConfig().configured,
      checks: checks,
      busy: busy,
      lastCheckedAt: last.at ? new Date(last.at).toLocaleString() : null,
      lastOk: last.ok,
      lastError: last.error,
      localPreset: last.localName,
      localVersion: last.localVersion,
      localBuild: last.localBuild,
      remote: last.remote,
      lastAction: last.action,
      skipped: vars ? vars.skipped : '',
      imported: vars ? vars.imported : '',
      logs: LOGS.slice(-30)
    };
  }

  function expose() {
    var api = {
      version: VERSION,
      __instance: INSTANCE_ID,   /* 注销时只删“自己这一份”的判据（见 INSTANCE_ID 的注释） */
      status: status,
      /* 手动查一次；force=true 时忽略「已拒绝/已写入/已安装」记录 */
      check: function (force) { return check(!!force); },
      /* 清掉「拒绝过 / 已写入」的记录（下次启动会重新弹） */
      reset: function () {
        saveVars({ skipped: '', imported: '' });
        log('已清空版本记录');
        return status();
      },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  /* ───────── 注销（零残留） ───────── */

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    log('正在注销：停定时器 / 删全局 API');
    var i;
    for (i = 0; i < timers.length; i++) { hclear(timers[i]); }
    timers = [];
    hclear(calmTimer);
    calmTimer = null;
    /* ★ 只删“自己这一份”：旧实例的 pagehide 迟到时，全局可能已经是新实例的了，不能动。 */
    try { if (HOST[API_NAME] && HOST[API_NAME].__instance === INSTANCE_ID) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME] && window[API_NAME].__instance === INSTANCE_ID) { delete window[API_NAME]; } } catch (e) { }
    /* 启动声明同样只清自己的：不清的话，30 秒内重挂的新实例会被旧声明挡在门外直接退出。 */
    try { var c = HOST.__kamiUpdateClaim; if (c && c.id === INSTANCE_ID) { delete HOST.__kamiUpdateClaim; } } catch (e) { }
    log('注销完成（本脚本没有按钮、没有注入样式与 DOM，没有什么需要收回的）');
  }

  /* 启动时的自动检查：受 6 小时间隔保护（未认证 API 按 IP 限流，用户常聚同一出口 IP）。
     手动 KamiUpdate.check() 不受此限，随时可以查。 */
  function autoCheck() {
    var intervalMs = CHECK_INTERVAL_HOURS * 3600 * 1000;
    if (vars.lastCheckAt && (Date.now() - vars.lastCheckAt) < intervalMs) {
      last.action = 'cooldown';
      log('距上次检查不满 ' + CHECK_INTERVAL_HOURS + ' 小时，本次启动不连网（KamiUpdate.check() 可手动查）');
      return Promise.resolve(last);
    }
    return check(false);
  }

  /* ───────── 启动 ───────── */

  /* 同一窗口里出现两份同名脚本时，只让先启动的那份跑（弹窗只会弹一次） */
  function claimInstance() {
    var prev = null;
    try { prev = HOST.__kamiUpdateClaim; } catch (e) { }
    var now = Date.now();
    if (prev && prev.bootAt && (now - prev.bootAt) < DEDUPE_MS && prev.id !== INSTANCE_ID) {
      log('已有另一个「🔄 远程更新」实例在 ' + Math.round((now - prev.bootAt) / 1000) + 's 前启动，本实例退出（脚本库里是不是有两份？）');
      return false;
    }
    try { HOST.__kamiUpdateClaim = { bootAt: now, id: INSTANCE_ID }; } catch (e) { }
    return true;
  }

  function boot() {
    log('启动 v' + VERSION + '（纯后台脚本，没有按钮）');
    if (!claimInstance()) { disposed = true; return; }
    readVars();
    expose();
    var cfg = repoConfig();
    if (!cfg.configured) {
      log('尚未配置 GitHub 仓库：等仓库建好后填上 REPO_OWNER / REPO_NAME 再重新构建即可');
    }
    /* 稍等几秒再做第一次检查：让向导、皮肤、面板先就绪，弹窗不跟它们抢 */
    timers.push(hsetTimeout(function () { autoCheck(); }, BOOT_DELAY));
    /* 页面只是**进 BFCache**（手机上切后台 / 返回上一页，persisted=true）时不注销：
       这种情况下脚本 iframe 活得好好的，回来还要用；注销了就没有任何东西能唤醒。
       只有真卸载（persisted=false / undefined）才走注销。 */
    function onHide(ev) { try { if (ev && ev.persisted) { return; } teardown(); } catch (e) { } }
    try {
      window.addEventListener('pagehide', onHide);
      if (HOST !== window) { HOST.addEventListener('pagehide', onHide); }
    } catch (e) { }
  }

  try { boot(); } catch (e) { warn('启动失败：' + ((e && e.message) || e)); }

  /* ============================================================
   * 发布约定（发新版本时按这个来）
   * ------------------------------------------------------------
   * 分发走 GitHub Releases，发新版 = 在仓库页发一个 Release：
   *   ① 附件上传正式分发文件，文件名即版本号来源：
   *      卡密预设v{大版本号}.{两位小版本号}-{构建号}-{日期}.json
   *      例如 卡密预设v0.90-98-20260922.json（日期 8 位，年在前）
   *   ② Release 说明正文 = 弹窗里的更新说明（纯文本，一行一条）；
   *      不要放 | { } \ 四个字符（弹窗管道符与宏语法要用，放了会被自动换成全角）
   *   ③ 别发草稿；预发布（prerelease）算正式版，开发期可以直接发
   * 用户下次启动酒馆（默认 6 小时检查一次）就会看到更新弹窗。
   * ============================================================ */
})();
