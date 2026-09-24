/* ============================================================
 * 🔄 远程更新   v1.4
 * 酒馆助手（TavernHelper / JS-Slash-Runner）脚本
 * ------------------------------------------------------------
 * 纯后台脚本：**不向按钮中转站登记任何按钮**。它只在每次启动时做一件事：
 * 去看一眼指定 GitHub 仓库里有没有更新版本的预设。
 *
 *   ① 版本发现两条路：先读仓库的 Releases 接口（api.github.com），拿最新一个
 *      非草稿 Release 与它的预设 JSON 附件；**接口读失败时退回 jsDelivr 清单**
 *      （仓库 mirror/manifest.json，走 cdn.jsdelivr.net，国内可达性好），照样拿
 *      到版本号、说明与下载地址
 *   ② 和本机当前预设的版本号比大小（大版本.小版本.构建号，三级比较；
 *      认正式命名 kami-v<版本>-<构建号>-<日期>，也认旧命名 0.9-97 / 0.9-260917-97）
 *   ③ 确实有更新、且这个版本没被用户拒绝过 → 弹**酒馆原生弹窗**问要不要更新，
 *      更新说明取 Release 正文（清单兜底时取 manifest 的 notes），
 *      放在弹窗内的可滚动区域里（窗口不会太高）
 *   ④ 点「立即更新」→ 走下载链 → **三方合并**（v1.4 起）→ 写进用户的预设文件夹
 *      → 提醒用户手动切换
 *      点「暂不更新」→ 把这个版本号记下来，以后不再为它弹窗
 *
 * ── 三方合并（v1.4 起，取代整份换新）──
 *   老流程是「下载新版 → 原样导入」，用户改过的条目开关 / 采样参数 / 脚本设置 /
 *   正则开关 / 自己改的条目全文全丢。v1.4 起改成三方合并：
 *     base   = 用户当前这一版的原始内容（按用户版本号对应的 tag 从仓库 mirror/ 取）
 *     theirs = 用户现在的预设（酒馆活设置 chatCompletionSettings）
 *     next   = 刚下载到的新版预设
 *   合并口径见 src/scripts/_preset-merge.js（内联在下方）：一律以用户为准；
 *   条目内容只有「两边都改过」才是待裁决；先备份（theirs 另存一份），再把合并结果
 *   导入成**新预设**，绝不覆盖原文件。
 *   待裁决走两条路：
 *     · 主路径：🌟 预设设置面板里那页「更新合并」（HOST.KamiPreset.openMergeReview，
 *       该脚本没在运行时自动退化）；
 *     · 退化：酒馆原生弹窗给摘要 + 一键「全部保留我的 / 全部用新版」。
 *   base 取不到（认不出版本 / 版本太老 / 镜像缺失）→ 引擎的退化模式：
 *   差异全进待裁决、默认「保留我的」，宁可少更新，也不动用户的东西。
 *
 * ── 下载链（v1.3 起的顺序）──
 *   ① GitHub Release 直链 → ② jsDelivr @<tag>/mirror/<file> →
 *   ③ jsDelivr @main/mirror/<file> → ④ GitHub API 附件 → ⑤ GitHub raw 镜像（默认关）
 *   每条通道试 2 次、隔 1.5 秒，再换下一条；哪条成功用哪条，日志写明。
 *   手机连不到 GitHub 的附件 CDN（release-assets.githubusercontent.com）时，
 *   ①④ 都救不了 —— jsDelivr 那两条才是主力兜底（产物 JSON 已提交进仓库 mirror/ 目录）。
 *
 * ── 完整性校验（尽力而为）──
 *   版本发现不管走哪条路，拿到 manifest 里的 sha256 且浏览器支持 crypto.subtle 时，
 *   下载结果先算哈希对一遍：不 → 报错、不写盘；支持不了（局域网 http）就跳过并记日志。
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
 *
 * ── 发版约定（v1.3 起，mirror/ 目录必做）──
 * 发版 = ① 把产物 JSON 提交进仓库 mirror/ 目录、更新 mirror/manifest.json
 *        （version / file / bytes / sha256 / date / notes）→ 推送；
 *        ② purge 一下 jsDelivr 的 @main 缓存（https://purge.jsdelivr.net/gh/<o>/<r>@main/mirror/manifest.json）；
 *        ③ 打同号 tag（如 v<版本>-<构建号>）→ 发 Release、传附件（直链通道的正路）。
 * 注意顺序：**先提交 mirror/ 再打 tag**——jsDelivr 的 @<tag> 只认 tag 提交里有的文件。
 * ============================================================ */
(function () {
  'use strict';

  var VERSION = '1.4';
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

  /* ───────── 三方合并引擎（唯一真相：src/scripts/_preset-merge.js，构建期内联） ───────── */

  /* @@KAMI_PRESET_MERGE@@ */

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
    remote: null, action: null,   // action: 'none' | 'skipped' | 'imported' | 'declined' | ...
    merge: null                   // 最近一次合并的报告（人话摘要，status() 里可看）
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

  /* jsDelivr 的两条地址（下载链与版本兜底共用）。
     注意：data.jsdelivr.com 的版本列表接口对这个仓库返回 500（2026-09-23 实测），
     所以版本发现一律走 @main/mirror/manifest.json，不依赖它。 */
  function jsdUrl(cfg, ref, file) {
    return 'https://cdn.jsdelivr.net/gh/' + encodeURIComponent(cfg.owner) + '/' +
      encodeURIComponent(cfg.repo) + '@' + encodeURIComponent(ref) + '/mirror/' + encodeURIComponent(file);
  }
  function manifestUrl(cfg) {
    return jsdUrl(cfg, 'main', 'manifest.json');
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
   *   现行：kami-v<版本>-<构建号>-<日期>（v大版本.两位小版本-构建号-日期；版本见根目录 version.json；2026-09-23 起改用 ASCII 前缀，
   *          因为 GitHub Releases 会把非 ASCII 附件名直接削掉，「卡密预设v…」传上去会变成「v…」）
   *   曾用：卡密预设v0.90-<构建号>-<日期>
   *   旧版：卡密预设0.9-97 / 卡密预设0.9-260917-97
   * 返回 { major, minor, build, date, raw }；认不出来返回 null（绝不猜）。 */
  function parseVersion(name) {
    var str = cleanStr(name);
    var m = /(?:kami-|卡密预设)?v(\d+)\.(\d+)-(\d+)-(\d{8})(?:\D|$)/i.exec(str);
    if (m) {
      /* 正式命名的「两位小版本」按小数读：v0.91 就是 0.91（小数部分原样两位），
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

  /* 版本号的展示用短串：v0.91-97 → "v0.91-97"（沿用文件名里的写法） */
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

  /* 下载链（v1.3 起的顺序）：按顺序逐条试，哪条成功就用哪条。
     ① GitHub Release 直链 —— 发版的正路，永远在链上
     ② jsDelivr @<tag>/mirror/<file> —— 产物 JSON 已提交进仓库 mirror/ 目录后的主力兜底
        （用户手机连不到 GitHub 附件 CDN，①④ 最终都落在那台服务器上救不了；jsDelivr 国内可达）
     ③ jsDelivr @main/mirror/<file> —— 防「tag 打早了、tag 提交里没有这份文件」：@main 永远有最新那份
     ④ GitHub API 附件接口 —— 与①最终同落一台 CDN，但入口域名不同（api.github.com），多一条路；
        带 Accept: application/octet-stream 拿附件本体
     ⑤ GitHub raw 镜像 —— raw.githubusercontent.com 国内可达性一般，默认**关**
     ⑤ 是否入链由源码常量 + 脚本变量共同决定；②③④ 常开。 */
  var USE_RAW_MIRROR = false;         // 改成 true = raw 镜像进链（同时要在仓库 mirror/ 里放了这份 JSON）
  var USE_JSD_MIRROR = true;          // jsDelivr 镜像通道：主力兜底，默认开（产物 JSON 已在仓库 mirror/ 里）
  var MIRROR_ATTEMPTS = 2;            // 每条通道尝试的次数（手机网络抖一下的第二枪）
  var RETRY_DELAY_MS = 1500;          // 同一条通道两次尝试之间隔多久

  function assetFileName(remote) {
    return cleanStr(remote.name) + '.json';   /* remote.name 已是去 .json 的正式分发名 */
  }

  /* 把没上链资格的通道滤掉后按序返回 */
  function buildChain(remote, cfg) {
    var tag = cleanStr(remote.version);
    var file = assetFileName(remote);
    var useRaw = USE_RAW_MIRROR || !!(vars && vars.mirrorRaw === true);
    /* 清单兜底发现的一版没有 GitHub 直链（remote.url 就是 jsDelivr 地址）——
       别把它错当直链上链：标签会写错、还和第③条重复请求同一个地址。 */
    var githubDirect = cleanStr(remote.url) && cleanStr(remote.url).indexOf('https://cdn.jsdelivr.net/') !== 0
      ? cleanStr(remote.url) : '';
    var list = [
      { id: 'github', label: 'GitHub 直链', url: githubDirect,
        ok: !!githubDirect },
      { id: 'jsd-tag', label: 'jsDelivr 镜像（按版本）',
        url: tag ? jsdUrl(cfg, tag, file) : '',
        ok: !!USE_JSD_MIRROR && !!tag },
      { id: 'jsd-main', label: 'jsDelivr 镜像（最新）',
        url: jsdUrl(cfg, 'main', file),
        ok: !!USE_JSD_MIRROR },
      { id: 'api', label: 'GitHub API 附件',
        url: 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
          '/releases/assets/' + cleanStr(remote.assetId),
        headers: { 'Accept': 'application/octet-stream' },
        ok: !!remote.assetId },
      { id: 'raw', label: 'GitHub raw 镜像',
        url: tag ? ('https://raw.githubusercontent.com/' + encodeURIComponent(cfg.owner) + '/' +
          encodeURIComponent(cfg.repo) + '/' + encodeURIComponent(tag) + '/mirror/' + encodeURIComponent(file)) : '',
        ok: !!useRaw && !!tag },
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

  /* ───────── 完整性校验（尽力而为） ───────── */

  /* 浏览器环境里 crypto.subtle 只在安全上下文（https / localhost）暴露；
     酒馆用局域网 http 打开时它不存在 —— 那就跳过校验，记一行日志，不拦安装。 */
  function subtleAvailable() {
    try {
      return !!(typeof crypto !== 'undefined' && crypto && crypto.subtle &&
        typeof crypto.subtle.digest === 'function');
    } catch (e) { return false; }
  }

  function sha256Hex(text) {
    var buf = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      var u = new Uint8Array(d), out = '', i;
      for (i = 0; i < u.length; i++) { out += (u[i] < 16 ? '0' : '') + u[i].toString(16); }
      return out;
    });
  }

  /* expect = manifest 里的 sha256（存在才校验）。不一致 → 报错、不写盘。 */
  function verifySha(text, expect) {
    var want = cleanStr(expect).toLowerCase();
    if (!want) { log('这一版没带 SHA-256 对照值（不是清单走的版本），完整性校验跳过'); return Promise.resolve({ skipped: '清单里没有 sha256' }); }
    if (!subtleAvailable()) {
      log('这个环境算不了 SHA-256（非安全上下文，比如酒馆走局域网 http），完整性校验跳过');
      return Promise.resolve({ skipped: '环境不支持' });
    }
    return sha256Hex(text).then(function (got) {
      if (got === want) { log('完整性校验通过：SHA-256 与清单一致'); return { ok: true }; }
      throw new Error('下载到的文件校验不通过（SHA-256 对不上），可能没下全；请换个网络再重试一次');
    });
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
          version: versionLabel(v),       /* tag 的短写法：v<版本>-<构建号>；同时是镜像仓库取快照用的 tag */
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

  /* jsDelivr 清单兜底（v1.3 起）：Releases 接口读失败时，改读仓库里的
     mirror/manifest.json（@main 永远指向最新提交，jsDelivr 对国内可达性好）。
     拼一个与 fetchLatestRelease 同形的 remote，让弹窗 → 下载 → 写盘照常走。
     下载地址直接用 jsDelivr @main（ Releases 的附件直链手机多半连不到）。 */
  function fetchManifestRemote(cfg) {
    var url = manifestUrl(cfg);
    log('Releases 接口没读成，改从 jsDelivr 清单找最新版本：' + url);
    return fetchApi(url).then(function (r) {
      if (r.status !== 200) { throw new Error('jsDelivr 清单也是 HTTP ' + r.status); }
      var m = null;
      try { m = JSON.parse(r.text); } catch (e) { throw new Error('jsDelivr 清单不是合法 JSON'); }
      var file = cleanStr(m.file), ver = cleanStr(m.version);
      if (!file || !ver) { throw new Error('jsDelivr 清单里缺 file 或 version 字段'); }
      var v = parseVersion(file) || parseVersion(ver);
      if (!v) { throw new Error('jsDelivr 清单里的文件名解析不出版本号（' + file + '）'); }
      return {
        name: file.replace(/\.json$/i, ''),
        version: versionLabel(v),
        major: v.major, minor: v.minor, build: v.build,
        released: cleanStr(m.date),
        notes: typeof m.notes === 'string' ? m.notes : '',
        url: jsdUrl(cfg, 'main', file),
        assetId: null,                 /* 清单路径没有 Release 附件 id，API 附件通道上不了链 */
        sha256: cleanStr(m.sha256) || null,
        from: 'manifest'
      };
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
    /* 版本发现两条路：先 Releases 接口，读失败再试 jsDelivr 清单（@main/mirror/manifest.json）。
       日志写明这一版是从哪边发现的 —— 排障时看得懂。 */
    return fetchLatestRelease(cfg)['catch'](function (eRel) {
      log('读 Releases 没成功：' + ((eRel && eRel.message) || eRel));
      return fetchManifestRemote(cfg).then(function (remote) {
        log('这一版是从 jsDelivr 清单发现的（GitHub Releases 接口没读成，多半是网络问题）');
        return remote;
      })['catch'](function (eMan) {
        /* 两条路都断：报原始的 Releases 错误为主（它才是正路），清单错误附在后面。 */
        throw new Error(((eRel && eRel.message) || eRel) +
          '（jsDelivr 清单兜底也没成：' + ((eMan && eMan.message) || eMan) + '）');
      });
    }).then(function (remote) {
      last.ok = true;
      last.error = null;
      last.remote = remote;
      var local = resolvePresetName();
      var localVer = parseVersion(local.name);
      last.localName = local.name || null;
      last.localBuild = localVer ? localVer.build : null;
      last.localVersion = localVer ? versionLabel(localVer) : null;
      log('仓库最新：' + remote.version + '（' + (remote.from === 'manifest' ? '来自 jsDelivr 清单' : '来自 GitHub Releases') +
        '）；本机当前预设：' +
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

  /* ───────── v1.4 起的三方合并写入（先备份，再导入合并结果，绝不覆盖原文件） ───────── */

  /* 口径 B 的 theirs：用户现在的预设 = 酒馆活设置（chatCompletionSettings）的深拷贝。
     拿不到（或没有 prompts 数组）→ 返回 null，调用方退化成老流程（原样导入，不备份）。 */
  function currentPresetSnapshot() {
    var ctx = stCtx();
    var s = settingsOf(ctx);
    if (!s || typeof s !== 'object' || !Array.isArray(s.prompts)) { return null; }
    var snap = null;
    try { snap = JSON.parse(JSON.stringify(s)); } catch (e) { return null; }
    if (!snap || !Array.isArray(snap.prompts)) { return null; }
    return snap;
  }

  /* base = 用户那一版的原始内容。两条路（都不发 Release 也能用）：
     ① jsDelivr `@<tag>/mirror/manifest.json` → file → `@<tag>/mirror/<file>`（该版本发过 Release / tag 时的正路）；
     ② 兜底：直接按**用户本机预设名**取 `@main/mirror/<预设名>.json`。
        为什么需要它：合并只要求「这一版的原始文件在仓库里」，不要求它发过 Release；
        镜像目录每版都会留一份（文件名就是预设名，含构建号与日期），而 @main 下这些文件一直都在。
        没有它的话，没发过 Release 的版本只能走退化模式（差异全进待裁决），合并质量白白打折。
     取不到就返回 null（退化模式），并记一行日志说明。 */
  function fetchBaseSnapshot(tag, cfg, localName) {
    var want = cleanStr(tag);
    var localFile = cleanStr(localName);
    /* 镜像里的文件名是「预设名 + .json」：预设名本身不带扩展名，这里补上
       （少了这一步，兜底那条路会去取一个不存在的名字，实测过）。 */
    if (localFile && !/\.json$/i.test(localFile)) { localFile += '.json'; }
    if (!want && !localFile) {
      log('认不出当前预设的版本号 → 取不到用户那一版的原始内容，合并走退化模式（theirs 与 next 的差异全进待裁决）');
      return Promise.resolve(null);
    }
    var byTag = (!want) ? Promise.reject(new Error('没有版本号')) : fetchApi(jsdUrl(cfg, want, 'manifest.json')).then(function (r) {
      if (r.status !== 200) { throw new Error('清单 HTTP ' + r.status); }
      var m2 = null;
      try { m2 = JSON.parse(r.text); } catch (e2) { throw new Error('清单不是合法 JSON'); }
      var file = cleanStr(m2 && m2.file);
      if (!file) { throw new Error('清单里没有 file 字段'); }
      return file;
    }).then(function (file) {
      log('按版本 ' + want + ' 取用户那一版的原始内容（合并的 base）：' + jsdUrl(cfg, want, file));
      return fetchText(jsdUrl(cfg, want, file));
    });
    return byTag['catch'](function (e1) {
      if (!localFile) { throw e1; }
      log('按 tag 取没成（' + ((e1 && e1.message) || e1) + '）→ 改按预设名从镜像最新提交取：' + jsdUrl(cfg, 'main', localFile));
      return fetchText(jsdUrl(cfg, 'main', localFile));
    }).then(function (text) {
      var base = JSON.parse(text);
      if (!base || !Array.isArray(base.prompts)) { throw new Error('内容不像一份预设'); }
      log('base 取到了：' + base.prompts.length + ' 条条目（可以逐一判断谁改过什么）');
      return base;
    })['catch'](function (e) {
      log('⚠ base 取不到（' + ((e && e.message) || e) + '）→ 合并进退化模式：差异全进待裁决、默认保留你的');
      return null;
    });
  }

  /* 待裁决的呈现：
     · 主路径：🌟 面板的「更新合并」页（KamiPreset.openMergeReview，该脚本没跑时走不到）；
     · 退化：原生弹窗给摘要 + 一键「全部保留我的 / 全部用新版」。 */
  /* 待裁决内容在弹窗里的正文：列出每项的名字与改了什么字段。 */
  function mergePopupHtml(plan) {
    var h = [];
    h.push('<div style=\'font-size:13px;line-height:1.65;text-align:left;\'>');
    h.push('<div style=\'margin:0 0 8px;\'>合并前有 <b>' + plan.conflicts.length +
      '</b> 处你和新版都改过的内容' +
      (plan.degraded ? '（你的旧版本认不出来，全部按「两边都改过」处理）' : '') + '：</div>');
    h.push('<div style=\'max-height:36vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
      "border:1px solid rgba(127,127,127,.4);border-radius:8px;padding:8px 10px;" +
      "word-break:break-word;white-space:normal;\'>");
    h.push(escText(plan.conflicts.map(function (c, i) {
      return (i + 1) + '. ' + c.name + '：' + c.fields.join('、');
    }).join('\n')).replace(/\r\n|\r|\n/g, '<br>'));
    h.push('</div>');
    h.push('<div style=\'margin:8px 0 0;opacity:.72;font-size:12px;\'>默认是「全部保留我的」（宁可少更新，' +
      '也不动你的东西）。逐条裁决要打开「🌟 预设设置」面板的「更新合并」页。</div>');
    h.push('</div>');
    return h.join('');
  }

  /* 决断从哪儿来：plan.conflicts[].choice（'mine'|'next'）。
     返回 Promise<{ plan }>；用户放弃（弹窗失败 → 保留我的继续，面板关闭 → 中止更新）时：
     · 面板路径用户关掉 → null（本次更新不落盘，稍后可重查）；
     · 弹窗路径失败 → 退化成「全部保留我的」继续（新增的条目照加）。 */
  function decidePlan(plan) {
    var i;
    for (i = 0; i < plan.conflicts.length; i++) {
      if (plan.conflicts[i].choice !== 'next') { plan.conflicts[i].choice = 'mine'; }
    }
    if (!plan.conflicts.length) { return Promise.resolve({ plan: plan, via: 'none' }); }
    var P = null;
    try { if (HOST.KamiPreset && typeof HOST.KamiPreset.openMergeReview === 'function') { P = HOST.KamiPreset; } } catch (e0) { }
    if (P) {
      log('待裁决 ' + plan.conflicts.length + ' 处 → 打开「🌟 预设设置」面板的「更新合并」页让你逐条决策');
      return new Promise(function (resolve) {
        var okAsk = false;
        try {
          okAsk = P.openMergeReview(plan, function (settledPlan) {
            if (settledPlan === null) {
              log('你在面板里没有完成裁决（关掉了面板），本次更新暂停导入；' +
                '下次启动或手动检查更新可以重新来一次');
              resolve(null);
              return;
            }
            log('裁决完成（面板）：逐项开始合并写入');
            resolve({ plan: settledPlan, via: 'panel' });
          }) !== false;
        } catch (e1) { okAsk = false; }
        if (!okAsk) {
          log('面板裁决页没打开成 → 退化成原生弹窗一键裁决');
          askMergePopup(plan).then(function (r) { resolve(r); });
        }
      });
    }
    return askMergePopup(plan);
  }

  /* 原生弹窗一键裁决兜底（面板脚本没在运行时的路）。
     result=true（okButton）= 全部用新版；取消 / 关窗 / Esc = 全部保留我的（宁可少更新）。 */
  function askMergePopup(plan) {
    var summary = plan.conflicts.map(function (c, i) { return (i + 1) + '. ' + c.name; }).join('\n');
    var html = mergePopupHtml(plan);
    var cmd = '/popup result=true scroll=true' +
      ' okButton="全部用新版"' +
      ' cancelButton="全部保留我的"' +
      ' ' + html;
    log('面板裁决页不可用，改用原生弹窗一键裁决（待裁决 ' + plan.conflicts.length + ' 处）');
    return runSlash(cmd).then(function (res) {
      var yes = String(res) === '1';
      log('合并裁决（原生弹窗）：' + (yes ? '全部用新版' : '全部保留我的（含没答＝Esc）'));
      for (var j = 0; j < plan.conflicts.length; j++) { plan.conflicts[j].choice = yes ? 'next' : 'mine'; }
      return { plan: plan, via: 'popup', allOf: yes ? 'next' : 'mine', summary: summary };
    }, function (e) {
      warn('裁决弹窗失败：' + ((e && e.message) || e) + ' → 按「全部保留我的」继续（不落新版的内容覆盖）');
      for (var k = 0; k < plan.conflicts.length; k++) { plan.conflicts[k].choice = 'mine'; }
      return { plan: plan, via: 'popup-failed', allOf: 'mine', summary: summary };
    });
  }

  /* 写盘（硬规格 D）：① 先把用户当前那份（theirs）用 importRawPreset 另存一份备份；
     ② 再把合并结果导入成新预设。备份写不进去就报错停下 —— 备份不许跳过。 */
  function writeMergedFiles(remote, theirs, merged) {
    var backupText = JSON.stringify(theirs);
    var mergedText = JSON.stringify(merged);
    var localName = cleanStr(resolvePresetName().name);
    if (!localName) {
      return Promise.reject(new Error('拿不到当前预设的名字，没法先备份；本次没有写盘（先手动导入新版也行）'));
    }
    var backupName = safePresetName(localName + ' · 合并前备份');
    log('第 1 步 · 先备份：把当前预设另存为「' + backupName + '」');
    return writePreset(backupName, JSON.parse(backupText), backupText).then(function () {
      log('第 2 步 · 导入合并结果：' + remote.name);
      return writePreset(remote.name, merged, mergedText);
    }).then(function (r) {
      return { via: (r && r.via) || 'importRawPreset', backupName: backupName, backupBytes: backupText.length, mergedBytes: mergedText.length };
    });
  }

  function mergeReportText(rep) {
    return '合并报告：应用新版 ' + rep.applied + ' 处，保留你的 ' + rep.kept + ' 处，新增 ' + rep.added +
      ' 条，待裁决 ' + rep.conflicts + ' 处（保留我的 ' + rep.decidedMine + ' / 用新版 ' + rep.decidedNext + '）' +
      (rep.degraded ? '（退化模式：认不出你的旧版，全部按冲突处理）' : '');
  }

  /* 下载到 next 之后 → 合并 → 先备份 → 导入合并结果 → toast。 */
  function mergeAndWrite(remote, nextJson, nextText) {
    var theirs = currentPresetSnapshot();
    if (!theirs) {
      log('读不到当前预设的完整内容（theirs），做不了三方合并与备份 → 按老办法整份导入（不备份）');
      return writePreset(remote.name, nextJson, nextText).then(function (r) {
        finishImported(remote, null, (r && r.via) || 'importRawPreset');
        return last;
      });
    }
    var cfg = repoConfig();
    return fetchBaseSnapshot(last.localVersion, cfg, last.localName).then(function (base) {
      var plan = computeMergePlan(base, theirs, nextJson);
      log('合并计划就绪：待裁决 ' + plan.conflicts.length + ' 处 / 新版新增 ' + plan.stats.added +
        ' 条 / 应用新版 ' + plan.stats.applied + ' 处' + (plan.degraded ? '（退化模式：base 取不到）' : ''));
      return decidePlan(plan).then(function (chosen) {
        if (!chosen) { last.action = 'merge-cancelled'; return last; }
        var applied = applyMergePlan(base, theirs, nextJson, chosen.plan);
        return writeMergedFiles(remote, theirs, applied.merged).then(function (w) {
          finishImported(remote, applied.report, w && w.via);
          return last;
        });
      });
    })['catch'](function (e) {
      last.error = (e && e.message) || String(e);
      warn('更新失败：' + last.error);
      toast('error', '更新失败：' + last.error + '（可以手动去仓库下载导入）', 12000);
      return last;
    });
  }

  function finishImported(remote, rep, via) {
    saveVars({ imported: remote.version, skipped: '' });
    last.action = 'imported';
    var repLine = rep ? mergeReportText(rep) : null;
    last.merge = rep ? {
      degraded: !!rep.degraded, applied: rep.applied, kept: rep.kept, added: rep.added,
      conflicts: rep.conflicts, decidedMine: rep.decidedMine, decidedNext: rep.decidedNext
    } : null;
    log('已写入预设「' + remote.name + '」' + (via ? ('（写盘用的通道 ' + via + '）') : '') +
      (repLine ? '；' + repLine : ''));
    toast('success', '新预设「' + remote.name + '」已写入酒馆。打开左侧抽屉的「AI 响应配置」，把预设切换成它即可生效', 15000);
  }

  /* 用户点了「立即更新」：下载 → 校验 → 合并 → 写进预设文件夹 → 提醒切换。 */
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
      log('下载到 ' + new TextEncoder().encode(text).length + ' 字节的预设（' + remote.name + '）');
      /* 尽力而为的完整性校验：清单里有 sha256 就对一遍，不一致 → 报错、不写盘。 */
      return verifySha(text, remote.sha256).then(function () {
        return mergeAndWrite(remote, json, text);
      });
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
      lastMerge: last.merge,
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
   *      例如 卡密预设v0.90-<构建号>-<日期>.json（日期 8 位，年在前）
   *   ② Release 说明正文 = 弹窗里的更新说明（纯文本，一行一条）；
   *      不要放 | { } \ 四个字符（弹窗管道符与宏语法要用，放了会被自动换成全角）
   *   ③ 别发草稿；预发布（prerelease）算正式版，开发期可以直接发
   * 用户下次启动酒馆（默认 6 小时检查一次）就会看到更新弹窗。
   * ============================================================ */
})();
