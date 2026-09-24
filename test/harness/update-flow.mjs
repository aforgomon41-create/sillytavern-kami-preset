#!/usr/bin/env node
/**
 * 🔄 远程更新脚本离线自测：node test/harness/update-flow.mjs
 * ------------------------------------------------------------
 * 直接加载 src/scripts/70-远程更新.js（它就是被打进预设的那份源），
 * 给它一套假的「酒馆 + 酒馆助手」环境（window / document / toastr /
 * SillyTavern.getContext / getVariables / replaceVariables /
 * getPresetNames / triggerSlash / importRawPreset / fetch / 定时器队列），
 * 把整条流程跑一遍：
 *   · 仓库未配置时不发起网络请求
 *   · 有新版本 → 弹酒馆原生 /popup（命令串里不带会绊倒解析器的字符）
 *   · 用户点「立即更新」→ importRawPreset 写入预设文件夹 + 脚本变量记 imported + 提醒切换
 *   · 用户点「暂不更新」→ 脚本变量记 skipped，同版本不再弹；换新版本会重新弹
 *   · 已是最新 / 本机已导入过 → 不弹
 *   · 认不出本机版本号 / Releases 404 或无 JSON 附件 / 下载内容不是预设 / 写入失败 → 各自的表现
 *   · 引导向导占着屏幕时先让路，关掉后补弹
 *   · check(true) 强制重弹；reset/shutdown；启动 3 秒后只自动检查一次
 *   · 同一窗口两份脚本实例只跑一份
 *   · 6 小时间隔内启动不重复连网；手动 check() 不受限
 *   · 草稿 Release 跳过；多个附件优先选 卡密预设 开头的 JSON
 *   · 新旧命名互认：本机 0.9-97 与仓库 v<版本>-97 是同一版本，不弹
 * 不依赖浏览器。改 70-远程更新.js 后跑一遍，能挡住大部分回归。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/* v1.4 起脚本内联了三方合并引擎（占位符 @@KAMI_PRESET_MERGE@@ 由 build/kami-doc.mjs 的
   expandPresetMerge 展开）——这个 harness 不走构建，所以这里照同一条内联规则
   手动展开一次（漏了它，引擎就是 undefined，合并全部静默退回老流程的「假象」）。 */
const MERGE_RAW = fs.readFileSync(path.join(ROOT, 'src', 'scripts', '_preset-merge.js'), 'utf8');
const MERGE_CODE = MERGE_RAW.split('\n').map(l => (l.slice(0, 7) === 'export ' ? l.slice(7) : l)).join('\n');
if (MERGE_CODE === MERGE_RAW) { throw new Error('剥离 export 失败：_preset-merge.js 里没有 export 声明？'); }
const MERGE_MARK = '/* @@KAMI_PRESET_MERGE@@ */';
const baseCode70 = fs.readFileSync(path.join(ROOT, 'src', 'scripts', '70-远程更新.js'), 'utf8');
if (baseCode70.indexOf(MERGE_MARK) < 0) { throw new Error('70-远程更新.js 里没有合并引擎占位符 ' + MERGE_MARK); }
const CODE = baseCode70.replace(MERGE_MARK, () => MERGE_CODE);
/* 脚本现在自带仓库配置；清空常量后再加载一份，专测「未配置」分支 */
const CODE_UNCONFIGURED = CODE
  .replace("var REPO_OWNER = 'aforgomon41-create';", "var REPO_OWNER = '';")
  .replace("var REPO_NAME = 'sillytavern-kami-preset';", "var REPO_NAME = '';");
if (CODE_UNCONFIGURED === CODE) { throw new Error('清空仓库常量失败：没找到 REPO_OWNER / REPO_NAME 的赋值'); }

let bad = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + msg + (!cond && extra !== undefined ? '  >> ' + extra : ''));
  if (!cond) { bad++; }
};
const tick = () => new Promise(r => setImmediate(r));
async function settle(n = 8) { for (let i = 0; i < n; i++) { await tick(); } }
const el = (visibleFlag) => ({
  offsetWidth: visibleFlag === false ? 0 : 100, offsetHeight: visibleFlag === false ? 0 : 20,
  hasAttribute: () => false, getClientRects: () => (visibleFlag === false ? [] : [{}]),
});

/* ---------- 每次用例一套全新环境（定时器队列也各自独立） ---------- */
function makeEnv(opts) {
  opts = opts || {};
  const toasts = [], slashCalls = [], importCalls = [], fetchCalls = [];
  const scriptVars = JSON.parse(JSON.stringify(opts.vars || {}));
  let timerId = 0;
  const timers = [];
  const fakeSetTimeout = (fn, ms) => { const t = { fn, ms, id: ++timerId }; timers.push(t); return t.id; };
  const fakeClearTimeout = (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) { timers.splice(i, 1); } };
  async function pump(ms) {
    const due = timers.filter(t => t.ms <= ms).sort((a, b) => a.ms - b.ms);
    for (const t of due) {
      const i = timers.indexOf(t); if (i < 0) { continue; }
      timers.splice(i, 1);
      t.fn();
      await settle();
    }
  }

  /* 假 Releases 接口：默认给一个「最新正式版 97」 */
  const RELEASE = opts.release === undefined ? [releaseOf(97, '20260922')] : opts.release;
  const PRESET_TEXT = opts.presetText !== undefined ? opts.presetText
    : JSON.stringify({ name: PN + '-97-20260922', prompts: [{ identifier: 'a', name: 'x', content: 'y' }], prompt_order: [] });

  const dom = Object.assign({}, opts.dom || {});
  const HDOC = {
    getElementById: (id) => (id === 'send_textarea' ? {} : (dom['#' + id] || null)),
    querySelector: (sel) => (dom[sel] !== undefined ? dom[sel] : null),
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    addEventListener: () => { }, removeEventListener: () => { },
  };
  /* 弹窗回执支持队列（opts.popupResults）：合并流程要弹两次（先问更新、再问裁决），
     每次回执从队列里取；没给就沿用 popupResult。 */
  const popupQueue = (opts.popupResults || []).slice();
  const popupVal = () => popupQueue.length > 0 ? String(popupQueue.shift()) :
    (opts.popupResult === undefined ? '1' : String(opts.popupResult));
  const ctx = {
    chatCompletionSettings: Object.assign({ preset_settings_openai: opts.localPreset || '卡密预设0.9-96' }, opts.settings || {}),
    getPresetManager: () => ({
      getSelectedPresetName: () => opts.localPreset || '卡密预设0.9-96',
      getAllPresets: () => opts.installed || ['卡密预设0.9-96', 'Default'],
    }),
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'tok' }),
    executeSlashCommandsWithOptions: async (cmd) => {
      slashCalls.push(cmd);
      return { pipe: popupVal(), isError: false };
    },
  };
  const optsManifest = opts.manifest === undefined
    ? manifestOf(97, '20260922', { bytes: PRESET_TEXT.length, sha256: '' })
    : opts.manifest;

  const fetchMock = (url, opt) => {
    fetchCalls.push({ url: String(url), headers: opt && opt.headers ? opt.headers : null });
    const headers = { get: (k) => (k === 'x-ratelimit-remaining' ? (opts.rateLimit ? '0' : '50') : null) };
    if (opts.fetchFail) { return Promise.resolve({ ok: false, status: 404, headers }); }
    if (opts.rateLimit) { return Promise.resolve({ ok: false, status: 403, headers, text: () => Promise.resolve('') }); }
    /* 可选：下载链定向失败（模拟手机网络连不上 GitHub 那几个下载域名）。
       failDirect    = GitHub 直链域名（示例 example.com）抛 TypeError；jsDelivr 可达
       failDownload  = 连 API 附件接口与 jsDelivr 也抛 TypeError → 取「全部通道失败」的文案
       failReleases  = Releases 清单接口抛 TypeError（模拟手机连不上 api.github.com），
                       但 jsDelivr 与附件接口正常 —— 清单兜底路径的用武之地 */
    const u = String(url);
    const isApiList = u.indexOf('https://api.github.com/') === 0 && u.indexOf('/releases?per_page=') >= 0;
    const isJsd = u.indexOf('https://cdn.jsdelivr.net/') === 0;
    if (isApiList && opts.failReleases) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (opts.failDirect && !isJsd && u.indexOf('https://api.github.com/') !== 0) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (opts.failDownload && !isApiList) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    if (u.indexOf('https://api.github.com/') === 0) {
      if (!RELEASE) { return Promise.resolve({ ok: false, status: 404, headers }); }
      /* 附件接口（/releases/assets/<id>，Accept: octet-stream）返回的是附件本体，不是清单 */
      if (u.indexOf('/releases/assets/') >= 0) {
        return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(PRESET_TEXT) });
      }
      return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(JSON.stringify(RELEASE)) });
    }
    if (u.indexOf('cdn.jsdelivr.net/') >= 0) {
      /* v1.4 合并：用户那一版（base）按 tag 从镜像取。baseTag 给了就按这个 tag 分流：
         manifest → baseManifest；文件 → baseText（没有就 PRESET_TEXT）。 */
      if (opts.baseTag && u.indexOf('@' + opts.baseTag + '/') >= 0) {
        if (u.indexOf('mirror/manifest.json') >= 0) {
          if (opts.baseManifest === null) { return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('') }); }
          return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(JSON.stringify(opts.baseManifest)) });
        }
        return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(opts.baseText === undefined ? PRESET_TEXT : opts.baseText) });
      }
      /* jsDelivr：清单（版本兜底读的那份）与镜像文件（下载链 ②③ 条）按 URL 分流。
         @<tag> 默认也 200；jsdTag404 时这条给 404（模拟「tag 打早了、里面没有这份文件」）→ 自动退 @main */
      if (u.indexOf('@main/mirror/manifest.json') >= 0) {
        if (optsManifest === null) { return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('') }); }
        return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(JSON.stringify(optsManifest)) });
      }
      if (opts.jsdTag404 && /@v[\d.]+-\d+\//.test(u)) {
        return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('not found') });
      }
      /* base 的兜底路：按**本地预设名**取 `@main/mirror/<预设名>.json`。
         baseMain404 模拟「镜像里也没有这一版」；baseMainText 给这条路一份单独的 base 内容。 */
      if (/@main\/mirror\/[^/]+\.json$/.test(u) && u.indexOf('manifest.json') < 0) {
        if (opts.baseMain404) { return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('') }); }
        return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(opts.baseMainText === undefined ? PRESET_TEXT : opts.baseMainText) });
      }
      return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(PRESET_TEXT) });
    }
    return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(PRESET_TEXT) });
  };
  const W = {
    document: HDOC, console, parent: null, top: null,
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout,
    addEventListener: () => { }, removeEventListener: () => { },
    toastr: {
      options: {},
      success: (m, t) => toasts.push(['success', m, t]),
      info: (m, t) => toasts.push(['info', m, t]),
      warning: (m, t) => toasts.push(['warning', m, t]),
      error: (m, t) => toasts.push(['error', m, t]),
    },
    SillyTavern: { getContext: () => ctx },
    fetch: fetchMock,
  };
  W.parent = W; W.top = W;

  const injected = {
    getVariables: () => JSON.parse(JSON.stringify(scriptVars)),
    replaceVariables: (all) => { Object.keys(scriptVars).forEach(k => delete scriptVars[k]); Object.assign(scriptVars, all); },
    getPresetNames: () => ['in_use'].concat(opts.installed || ['卡密预设0.9-96', 'Default']),
    triggerSlash: async (cmd) => { slashCalls.push(cmd); return popupVal(); },
    importRawPreset: (name, content) => { importCalls.push({ name, content }); return opts.importFail ? false : true; },
  };
  const names = Object.keys(injected);
  const runner = new Function(...names, 'window', 'document', 'console', 'fetch', opts.code || CODE);
  runner(...names.map(n => injected[n]), W, HDOC, console, fetchMock);
  W.__injected = injected;

  return { W, toasts, slashCalls, importCalls, fetchCalls, scriptVars, dom, pump, api: () => W.KamiUpdate };
}

/* 下载链的几条用例要「原地重试」：假定时器没有真实时钟，把通道重试延迟清成 0 */
const CODE_NO_RETRY_DELAY = CODE
  .replace('var RETRY_DELAY_MS = 1500;', 'var RETRY_DELAY_MS = 0;');
if (CODE_NO_RETRY_DELAY === CODE) { throw new Error('清重试延迟失败：没找到 RETRY_DELAY_MS 的赋值'); }

/* 模拟「酒馆用局域网 http 打开」：crypto.subtle 不存在（非安全上下文），
   完整性校验必须优雅跳过而不是抛错挡安装 */
const CODE_NO_SUBTLE = CODE
  .replace('return !!(typeof crypto !== \'undefined\' && crypto && crypto.subtle &&',
    'return !!(false && typeof crypto !== \'undefined\' && crypto && crypto.subtle &&');
if (CODE_NO_SUBTLE === CODE) { throw new Error('屏蔽 crypto.subtle 失败：没找到 subtleAvailable 的判据'); }

/* 专测「API 附件通道」的老用例要用：关掉 jsDelivr 两条（v1.3 起它们排在 API 附件前面） */
const CODE_NO_JSD = CODE
  .replace('var USE_JSD_MIRROR = true;', 'var USE_JSD_MIRROR = false;');
if (CODE_NO_JSD === CODE) { throw new Error('关 jsDelivr 失败：没找到 USE_JSD_MIRROR 的赋值'); }
/* 两条补丁叠加（老 API 附件用例：关 jsDelivr + 清零重试延迟） */
const CODE_NO_JSD_NO_RETRY = CODE_NO_JSD
  .replace('var RETRY_DELAY_MS = 1500;', 'var RETRY_DELAY_MS = 0;');
if (CODE_NO_JSD_NO_RETRY === CODE_NO_JSD) { throw new Error('叠加清零重试延迟失败'); }

const REPO_VARS = { 'kami-update': { repo: { owner: 'kamisama', repo: 'kami-preset' } } };

/* 当前版本从根目录 version.json 读（**别写死**）：升版本之后，「跨小版本升级要能识别」那条用例
   会自动跟着新版本号跑，不用回来改测试。夹具里的版本号一律由这两个常量派生。 */
const VERSION_NOW = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const VERSION_PREV = (function () {
  const m = /^(\d+)\.(\d{2})$/.exec(VERSION_NOW);
  if (!m) { throw new Error('version.json 里的 version 必须是「大版本.两位小版本」：' + VERSION_NOW); }
  const minor = Number(m[2]) - 1;
  if (minor < 0) { throw new Error('小版本号退无可退：' + VERSION_NOW); }
  return m[1] + '.' + String(minor).padStart(2, '0');
})();

/* 断言里一律用这两个派生常量，别写死版本号：升版本后测试自动跟上。
   （夹具里的「仓库最新版」用 VERSION_PREV＝上一个两位小版本，所以跨小版本升级这条路每次都被测到。） */
const PV = 'v' + VERSION_PREV;      /* 例：v0.90 */
const PN = 'kami-' + PV;            /* 例：kami-v0.90 */

/* 造一个假 Release：现行正式分发名 kami-v<版本>-<build>-<date>.json
   （曾用名「卡密预设v…」在 GitHub 上会被削成「v…」，所以 2026-09-23 起前缀改成 ASCII） */
function releaseOf(build, date, extra) {
  const d = date || '20260922';
  const ver = (extra && extra.__version) || VERSION_PREV;
  const name = 'kami-v' + ver + '-' + build + '-' + d;
  return Object.assign({
    tag_name: 'v' + ver + '-' + build + '-' + d,
    name: name,
    draft: false,
    prerelease: false,
    published_at: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T00:00:00Z',
    body: '· 新增远程更新脚本\n· 修了一堆bug\n· 含 | 管道 {花括号} "引号" 反斜杠\\ 与 <标签>',
    assets: [{ id: 580000 + build, name: name + '.json', browser_download_url: 'https://example.com/dl/' + name + '.json' }],
  }, extra || {});
}

/* 夹具默认给一份清单（file 与默认 RELEASE 的附件名一致）；
   opts.manifest = null 可以模拟「清单也拿不到」。
   （在 makeEnv 里求值，因为默认 bytes 取 PRESET_TEXT 的长度） */

console.log('--- 仓库未配置 ---');
{
  const env = makeEnv({ code: CODE_UNCONFIGURED });
  await settle();
  const r = await env.api().check(false);
  ok(env.fetchCalls.length === 0, '未配置仓库时不发起任何网络请求');
  ok(r.action === 'unconfigured', 'action = unconfigured', JSON.stringify(r.action));
  ok(env.slashCalls.length === 0, '不弹窗');
}

console.log('--- 有新版本 + 用户点「立即更新」 ---');
{
  const env = makeEnv({ vars: REPO_VARS, popupResult: '1' });
  await settle();
  const r = await env.api().check(false);
  ok(env.slashCalls.length === 1, '弹了一次原生弹窗');
  const cmd = env.slashCalls[0] || '';
  ok(cmd.indexOf('/popup ') === 0, '用的是酒馆 /popup 命令');
  ok(cmd.indexOf('result=true') > 0, '带 result=true（能拿到用户选的是/否）');
  ok(cmd.indexOf('okButton="立即更新"') > 0 && cmd.indexOf('cancelButton="暂不更新"') > 0, '按钮是 立即更新 / 暂不更新');
  ok(cmd.indexOf(PN + '-97-20260922') > 0 && cmd.indexOf(PV + '-97') > 0, '弹窗里带新版本名');
  ok(cmd.indexOf('max-height:36vh') > 0 && cmd.indexOf('overflow-y:auto') > 0, '更新说明放在可滚动区域里（窗口不会过高）');
  ok(env.importCalls.length === 1, '调用了 importRawPreset 写入预设文件夹');
  ok(env.importCalls[0] && env.importCalls[0].name === PN + '-97-20260922', '写入的预设名正确', env.importCalls[0] && env.importCalls[0].name);
  ok(env.importCalls[0] && env.importCalls[0].content.indexOf('"prompts"') > 0, '写入的是下载到的预设原文');
  ok(env.scriptVars['kami-update'].imported === PV + '-97', '脚本变量记下 imported=' + PV + '-97（跟账号走，不存浏览器）');
  ok(r.action === 'imported', 'action = imported');
  ok(env.toasts.some(t => t[0] === 'success' && t[1].indexOf('切换') > 0), '写入后提醒用户切换预设');
  /* 命令串安全性：HTML 段不能带会绊倒斜杠命令解析器的字符 */
  const html = cmd.split('cancelButton="暂不更新" ')[1] || '';
  ok(!html.includes('{{') && !html.includes('}}'), 'HTML 里没有双花括号（不会触发宏）');
  ok(!html.includes('\\'), 'HTML 里没有反斜杠');
  ok(!html.includes('"'), 'HTML 里没有裸双引号（不会绊倒斜杠命令解析）');
  ok(html.indexOf('｜') > 0 && html.indexOf('｛') > 0 && html.indexOf('｝') > 0, 'notes 里的 | { } 被换成全角');
  ok(html.indexOf('&quot;') > 0, 'notes 里的双引号被转义成实体');
  ok(html.indexOf('&lt;标签&gt;') > 0, 'notes 里的尖括号被转义（原样显示）');
  ok(html.indexOf('<br>') > 0, 'notes 里的换行变成 <br>');
  const r2 = await env.api().check(false);
  ok(env.slashCalls.length === 1 && r2.action === 'imported', '同一版本已写入过 → 不再弹窗');
}

console.log('--- 用户点「暂不更新」 ---');
{
  const env = makeEnv({ vars: REPO_VARS, popupResult: '0' });
  await settle();
  const r = await env.api().check(false);
  ok(r.action === 'declined', 'action = declined');
  ok(env.scriptVars['kami-update'].skipped === PV + '-97', '脚本变量记下 skipped=' + PV + '-97');
  ok(env.importCalls.length === 0, '没有写入预设');
  const r2 = await env.api().check(false);
  ok(env.slashCalls.length === 1, '再检查不为同一版本弹窗');
  ok(r2.action === 'skipped', '第二次 action = skipped');
  const env2 = makeEnv({
    vars: { 'kami-update': { skipped: PV + '-97', repo: REPO_VARS['kami-update'].repo } },
    release: [releaseOf(98, '20260923')], popupResult: '0',
  });
  await settle();
  const r3 = await env2.api().check(false);
  ok(env2.slashCalls.length === 1 && r3.action === 'declined', '换新版本 98 会重新弹窗');
}

console.log('--- 已经是最新 ---');
{
  const env = makeEnv({
    vars: REPO_VARS, localPreset: '卡密预设0.9-95', installed: ['卡密预设0.9-95', 'Default'],
    release: [releaseOf(95, '20260921')],
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.action === 'none', 'action = none', JSON.stringify(r.action));
  ok(env.slashCalls.length === 0, '不弹窗');
  ok(env.importCalls.length === 0, '不写入');
}

console.log('--- 本机已导入过该版本（只是没切换） ---');
{
  const env = makeEnv({ vars: REPO_VARS, installed: ['卡密预设0.9-96', PN + '-97-20260922'] });
  await settle();
  const r = await env.api().check(false);
  ok(r.action === 'installed', 'action = installed');
  ok(env.slashCalls.length === 0, '不弹窗（用户自己导入过，只是没切换）');
}

console.log('--- 认不出本机版本号 ---');
{
  const env = makeEnv({ vars: REPO_VARS, localPreset: '我的自定义预设' });
  await settle();
  const r = await env.api().check(false);
  ok(env.slashCalls.length === 1, '仍然弹窗询问');
  ok(r.localBuild === null, 'localBuild = null');
}

console.log('--- 引导向导占着屏幕 ---');
{
  const env = makeEnv({ vars: REPO_VARS, dom: { '#kami-guide-panel': el(true) } });
  await settle();
  const p = env.api().check(false);
  await settle();
  ok(env.slashCalls.length === 0, '向导开着时不抢弹窗');
  env.dom['#kami-guide-panel'] = null;
  await env.pump(10000);
  await settle();
  ok(env.slashCalls.length === 1, '向导关掉后补弹');
  await p;
}

console.log('--- 清单 404 / 下载内容不对 / 写入失败 ---');
{
  /* Releases 接口 404 后会先试 jsDelivr 清单兜底；两条路都断死才算「真没有」。
     （仓库 mirror/manifest.json 现在是发版纪律的一部分，所以 404 = 仓库真不存在的形态） */
  const envNothing = makeEnv({ vars: REPO_VARS, release: null, manifest: null });
  await settle();
  const rNothing = await envNothing.api().check(false);
  ok(rNothing.ok === false && /404/.test(rNothing.error || ''), 'Releases 与清单两条路都 404：记录错误不弹窗', rNothing.error);
  ok(envNothing.slashCalls.length === 0, '不弹窗');

  const env = makeEnv({ vars: REPO_VARS, release: null, popupResult: '0' });
  await settle();
  const r = await env.api().check(false);
  /* Releases 是 404，但 jsDelivr 清单兜到了版本 → 不再是「检查失败」收场 */
  ok(r.ok === true && r.remote && r.remote.from === 'manifest' && r.action === 'declined',
    'Releases 404 但 jsDelivr 清单兜住了 → 版本发现仍然成立（弹过窗、用户选暂不）',
    JSON.stringify(r.action));

  /* 名字认不出来 → 直接报错，不弹窗也不瞎装 */
  const env2 = makeEnv({
    vars: REPO_VARS,
    release: [releaseOf(999, '20260922', { body: 'n' })],
    presetText: '<html>Not Found</html>',
  });
  await settle();
  const r2 = await env2.api().check(false);
  ok(/不像一个预设|合法 JSON/.test(r2.error || ''), '下载内容不对时拒绝写入', r2.error);
  ok(env2.importCalls.length === 0, '没有写入坏文件');
  ok(!env2.scriptVars['kami-update'].imported, '失败不记录 imported');

  const env3 = makeEnv({ vars: REPO_VARS, importFail: true });
  await settle();
  const r3 = await env3.api().check(false);
  ok(r3.action !== 'imported' && !env3.scriptVars['kami-update'].imported, '写入失败不记录 imported');
  ok(env3.toasts.some(t => t[0] === 'error'), '写入失败弹错误提示');
}

console.log('--- check(true) 强制重弹 ---');
{
  const env = makeEnv({ vars: { 'kami-update': { skipped: PV + '-97', repo: REPO_VARS['kami-update'].repo } }, popupResult: '0' });
  await settle();
  const r = await env.api().check(true);
  ok(env.slashCalls.length === 1, 'force 时忽略 skipped 记录重新弹');
  ok(r.action === 'declined', '用户仍然选否');
}

console.log('--- reset / shutdown ---');
{
  const env = makeEnv({ vars: { 'kami-update': { skipped: PV + '-97', imported: PV + '-97', repo: REPO_VARS['kami-update'].repo } } });
  await settle();
  const s = env.api().reset();
  ok(env.scriptVars['kami-update'].skipped === '' && env.scriptVars['kami-update'].imported === '', 'reset 清空版本记录');
  ok(s.version === '1.4' && s.configured === true, 'status() 有版本与仓库配置');
  env.api().shutdown();
  ok(env.W.KamiUpdate === undefined, 'shutdown 收回全局 API');
  const before = env.fetchCalls.length;
  await env.pump(60000);
  ok(env.fetchCalls.length === before, 'shutdown 后定时器不再触发检查');
}

console.log('--- 启动后自动检查一次 ---');
{
  const env = makeEnv({ vars: REPO_VARS, popupResult: '0' });
  await settle();
  ok(env.fetchCalls.length === 0, '启动瞬间不检查（等 3 秒）');
  await env.pump(3000);
  ok(env.fetchCalls.length === 1, '3 秒后自动检查一次', 'fetchCalls=' + env.fetchCalls.length);
  await env.pump(120000);
  ok(env.fetchCalls.length === 1, '之后不再自己轮询（只认启动那一次）', 'fetchCalls=' + env.fetchCalls.length);
  ok(env.scriptVars['kami-update'].skipped === PV + '-97', '自动检查也走同一条流程（记下拒绝）');
}

console.log('--- 同一窗口两份脚本实例 ---');
{
  const first = makeEnv({ vars: REPO_VARS, popupResult: '0' });
  await settle();
  const W = first.W, inj = W.__injected, names2 = Object.keys(inj);
  const runner2 = new Function(...names2, 'window', 'document', 'console', 'fetch', CODE);
  runner2(...names2.map(n => inj[n]), W, W.document, console, W.fetch);
  await settle();
  await first.pump(3000);
  ok(first.slashCalls.length === 1, '两份脚本只弹了一次窗', 'slash=' + first.slashCalls.length);
  ok(first.fetchCalls.length === 1, '只有一份实例发起了检查', 'fetch=' + first.fetchCalls.length);
}

console.log('--- 6 小时间隔 ---');
{
  const env = makeEnv({
    vars: { 'kami-update': { repo: REPO_VARS['kami-update'].repo, lastCheckAt: Math.floor(Date.now() / 3600000) * 3600000 } },
    popupResult: '0',
  });
  await settle();
  await env.pump(3000);
  ok(env.fetchCalls.length === 0, '6 小时内启动不重复连网');
  const r = await env.api().check(false);
  ok(env.fetchCalls.length === 1, '手动 check() 不受间隔限制');
}

console.log('--- Releases 列表挑选规则 ---');
{
  const env = makeEnv({
    vars: REPO_VARS, popupResult: '0',
    release: [
      releaseOf(98, '20260923', { draft: true }),
      Object.assign(releaseOf(97, '20260922'), {
        assets: [
          { name: 'checksums.txt', browser_download_url: 'https://example.com/dl/checksums.txt' },
          { name: PN + '-97-20260922.json', browser_download_url: 'https://example.com/dl/kami.json' },
        ],
      }),
    ],
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.remote && r.remote.build === 97, '跳过草稿，取最新非草稿版', r.remote && r.remote.build);
  ok(r.remote && r.remote.url === 'https://example.com/dl/kami.json', '多附件优先选 kami- 开头的 JSON', r.remote && r.remote.url);

  /* GitHub 会把非 ASCII 附件名直接削掉：曾用中文名上传的附件会变成 v<版本>-…json（没有前缀）。
     这种附件也必须能挑中、并解析出版本号（否则「改名换前缀」这件事会把老 Release 变成死信）。 */
  const envStripped = makeEnv({
    vars: REPO_VARS, popupResult: '0',
    release: [releaseOf(97, '20260922', {
      assets: [
        { name: 'checksums.txt', browser_download_url: 'https://example.com/dl/checksums.txt' },
        { name: PV + '-97-20260922.json', browser_download_url: 'https://example.com/dl/stripped.json' },
      ],
    })],
  });
  await settle();
  const rs = await envStripped.api().check(false);
  ok(rs.remote && rs.remote.build === 97 && rs.remote.url === 'https://example.com/dl/stripped.json',
    '附件名被 GitHub 削掉前缀时仍能挑中并解析版本', rs.remote && rs.remote.version);

  /* Release 存在但没有 JSON 附件 → 报原文错误，但清单兜底还能救；
     两条路都断死（清单也 null）才真正收场，且错误里带清一边的定性 */
  const env2 = makeEnv({ vars: REPO_VARS, release: [releaseOf(97, '20260922', { assets: [{ name: 'readme.txt', browser_download_url: 'x' }] })], popupResult: '0' });
  await settle();
  const r2 = await env2.api().check(false);
  ok(r2.ok === true && r2.remote && r2.remote.from === 'manifest' && r2.action === 'declined',
    '没有 JSON 附件的 Release → 清单兜底继续供版本', JSON.stringify(r2.action));

  const envNone = makeEnv({ vars: REPO_VARS, release: [releaseOf(97, '20260922', { assets: [{ name: 'readme.txt', browser_download_url: 'x' }] })], manifest: null });
  await settle();
  const rNone = await envNone.api().check(false);
  ok(rNone.ok === false && /没有一个带预设 JSON 附件/.test(rNone.error || '') && /清单兜底也没成/.test(rNone.error || ''),
    '两条路都断死时错误里有两边的定性', rNone.error);

  const env3 = makeEnv({ vars: REPO_VARS, rateLimit: true });
  await settle();
  const r3 = await env3.api().check(false);
  ok(/配额用尽/.test(r3.error || ''), 'API 限流时给出可理解的错误', r3.error);
}

console.log('--- 新旧命名互认 ---');
{
  const env = makeEnv({
    vars: REPO_VARS, localPreset: '卡密预设0.9-97', installed: ['卡密预设0.9-97'],
    release: [releaseOf(97, '20260922')],
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.action === 'none', '本机旧命名 0.9-97 与仓库正式命名 ' + PV + '-97 判为同一版本', JSON.stringify(r.action));

  const env2 = makeEnv({
    vars: REPO_VARS, localPreset: PN + '-96-20260921', installed: [PN + '-96-20260921'],
    release: [releaseOf(97, '20260922')],
  });
  await settle();
  const r2 = await env2.api().check(false);
  ok(env2.slashCalls.length === 1, '本机 ' + PV + '-96 对仓库 ' + PV + '-97 → 弹窗');
  ok(r2.localVersion === PV + '-96', 'status 里带本机版本号', r2.localVersion);

  /* 跨小版本升级（2026-09-24 升 0.90 → 0.91 时补的用例）：老用户在上一个两位小版本上，
     仓库发的是**当前版本**，必须判为「有更新」。版本号全部从 version.json 派生，
     所以以后每次升版本它都自动测新的一跳，不用回来改测试。 */
  const env3 = makeEnv({
    vars: REPO_VARS, localPreset: PN + '-131-20260924', installed: [PN + '-131-20260924'],
    release: [releaseOf(132, '20260924', { __version: VERSION_NOW })],
  });
  await settle();
  const r3 = await env3.api().check(false);
  ok(env3.slashCalls.length === 1, '跨小版本：本机 ' + VERSION_PREV + '-131 对仓库 ' + VERSION_NOW + '-132 → 弹窗');
  ok(r3.remote && r3.remote.version === 'v' + VERSION_NOW + '-132',
    '跨小版本：远端版本号读成 v' + VERSION_NOW + '-132', r3.remote && r3.remote.version);
}

console.log('--- 下载链：直链 TypeError 失败 → 回退 API 附件通道成功（本用例关掉 jsDelivr，专测第④条） ---');
{
  const env = makeEnv({ code: CODE_NO_JSD_NO_RETRY, vars: REPO_VARS, popupResult: '1', failDirect: true });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 1, '直链失败时回退通道仍然装上了预设');
  ok(env.importCalls[0] && env.importCalls[0].name === PN + '-97-20260922', '回退写入的预设名正确');
  ok(env.importCalls[0] && env.importCalls[0].content.indexOf('"prompts"') > 0, '回退写入的是完整预设原文');
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === PV + '-97', '回退成功同样记 imported');
  /* 下载请求顺序：直链先试（2 次），再退到 API 附件接口 */
  const dlCalls = env.fetchCalls.filter(c => c.url.indexOf('https://api.github.com/') !== 0);
  const apiCalls = env.fetchCalls.filter(c => c.url.indexOf('/releases/assets/') >= 0);
  ok(dlCalls.length >= 2 && apiCalls.length >= 1, '直链试了两次、API 附件接口补上', JSON.stringify(dlCalls.length) + '/' + JSON.stringify(apiCalls.length));
  ok(dlCalls[0].url.indexOf('https://example.com/dl/') === 0, '第一发还是走正式直链（发版的正路不变）');
  ok(apiCalls[0] && apiCalls[0].url.indexOf('/releases/assets/580097') > 0, '回退通道用的是 API 附件接口（附件 id 定位）');
  ok(apiCalls[0] && apiCalls[0].headers && apiCalls[0].headers['Accept'] === 'application/octet-stream', 'API 附件通道带 Accept: octet-stream');
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('回退成功') > 0 && logs.indexOf('GitHub API 附件') > 0, '回退成功时日志写明用的是哪条通道');
  ok(env.toasts.some(t => t[0] === 'success'), '回退成功后会照常弹「已写入」提示');
}

console.log('--- 下载链全部失败 → 给出可操作错误 ---');
{
  const env = makeEnv({ code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1', failDownload: true });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 0, '全部通道失败时不写入预设');
  ok(!env.scriptVars['kami-update'].imported, '失败不记录 imported');
  ok(r.action !== 'imported', 'action 不是 imported');
  ok(/几条下载通道都试不通/.test(r.error || ''), '错误文案不是干巴巴的 Failed to fetch，而是人话汇总', r.error);
  ok(/手动下载/.test(r.error || '') && /releases/.test(r.error || ''), '错误文案给出手动去仓库下载的路径', r.error);
  ok(/网络连不上 GitHub/.test(r.error || ''), '错误里带上「网络连不上 GitHub」的定性', r.error);
  const t = env.toasts.filter(x => x[0] === 'error')[0];
  ok(t && t[1].indexOf('换个 Wi-Fi') > 0 && t[1].indexOf('手动下载') > 0, '错误提示告诉用户换网络或手动下载');
}

/* ---------- v1.3 新增：jsDelivr 清单兜底 / @main 二段兜底 / SHA-256 校验 ---------- */

/* 夹具：仓库 mirror/ 目录里那份清单（与真实 mirror/manifest.json 同构）。
   file 给 97（与本套环境的 RELEASE / PRESET_TEXT 对齐），这样清单兜底拼出的
   下载地址正对着假 jsDelivr 上预置的预设正文。 */
function manifestOf(build, date, extra) {
  const d = date || '20260922';
  const file = PN + '-' + build + '-' + d + '.json';
  return Object.assign({
    version: PV + '-' + build,
    file: file,
    bytes: 0,   /* bytes 仅清单信息展示用，脚本校验只用 sha256；需要时在 extra 里给 */
    sha256: '',
    date: d,
    notes: '· 清单兜底版的更新说明\n· 含 | 管道 {花括号} "引号" 反斜杠\\ 与 <标签>',
  }, extra || {});
}

function jsdFileCalls(env) {
  return env.fetchCalls.filter(c =>
    c.url.indexOf('https://cdn.jsdelivr.net/') === 0 && c.url.indexOf('mirror/manifest.json') < 0);
}

console.log('--- ① Releases 接口读失败 → jsDelivr 清单兜底发现版本 → jsDelivr 下载成功 ---');
{
  /* failReleases = api.github.com 的 releases 清单接口抛 TypeError（模拟手机连不上）；
     jsDelivr 一切正常 —— 用户手机的典型形态：接口偶发不通、镜像可达。 */
  const env = makeEnv({ code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1', failReleases: true });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 1, '清单兜底路径成功装上了预设');
  ok(env.importCalls[0] && env.importCalls[0].name === PN + '-97-20260922', '清单兜底写入的预设名正确',
    env.importCalls[0] && env.importCalls[0].name);
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === PV + '-97', '清单兜底同样记 imported');
  ok(r.remote && r.remote.from === 'manifest', 'remote 标记来源 = manifest', r.remote && r.remote.from);
  ok(r.remote && r.remote.assetId === null, '清单兜底的 remote 没有 Release 附件 id');
  const dlJsd = jsdFileCalls(env);
  ok(dlJsd.length >= 1, '下载确实走的 jsDelivr', JSON.stringify(dlJsd.map(c => c.url)));
  ok(dlJsd[0] && dlJsd[0].url.indexOf('/mirror/' + PN + '-97-20260922.json') > 0,
    '清单兜底下载的是镜像上同一份文件名', dlJsd[0] && dlJsd[0].url);
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('jsDelivr 清单') > 0 && logs.indexOf('发现的') > 0, '日志写明这一版是从 jsDelivr 清单发现的');
  ok(logs.indexOf('SHA-256') > 0 && logs.indexOf('跳过') > 0, '清单没带哈希时日志写明跳过校验的原因');
  ok(env.toasts.some(t => t[0] === 'success'), '清单兜底成功后照常弹「已写入」提示');
}

console.log('--- ② 下载链：直链与 jsDelivr @<tag> 都 404 → 自动落到 jsDelivr @main 成功 ---');
{
  /* failDirect = GitHub 直链不通（手机场景）；jsdTag404 = tag 打早了、tag 提交里没有这份文件 */
  const env = makeEnv({ code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1', failDirect: true, jsdTag404: true });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 1, '@<tag> 404 后 @main 兜底仍装上了预设');
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === PV + '-97', '@main 兜底同样记 imported');
  const jsdTag = env.fetchCalls.filter(c => /cdn\.jsdelivr\.net\/.*@v0\.90-97\//.test(c.url));
  const jsdMain = jsdFileCalls(env).filter(c => c.url.indexOf('@main/') >= 0);
  ok(jsdTag.length >= 1, '@<tag> 那条也试过（每条通道 2 次的既有逻辑没动）', JSON.stringify(jsdTag.map(c => c.url)));
  ok(jsdMain.length >= 1, '随后落到 @main 那条', JSON.stringify(jsdMain.map(c => c.url)));
  ok(jsdMain[0] && jsdMain[0].url.indexOf('/mirror/' + PN + '-97-20260922.json') > 0,
    '@main 请求的也是同一份文件名', jsdMain[0] && jsdMain[0].url);
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('回退成功') > 0 && logs.indexOf('jsDelivr 镜像（最新）') > 0,
    '日志写明最终走的是 jsDelivr @main 通道');
}

console.log('--- ③ 清单 sha256 与下载正文不一致 → 报错且不写盘 ---');
{
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1',
    failReleases: true,   /* 走清单路径，remote 才带 sha256 */
    manifest: manifestOf(97, '20260922', { sha256: 'deadbeef' + '0'.repeat(56) }),
  });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 0, '校验不一致 → 没有写盘');
  ok(!env.scriptVars['kami-update'].imported, '校验失败不记录 imported');
  ok(r.action !== 'imported', 'action 不是 imported');
  ok(/校验不通过/.test(r.error || ''), '错误文案说人话（校验不通过，可能没下全）', r.error);
  ok(/重试/.test(r.error || ''), '错误文案给出「重试」的指引', r.error);
  const t = env.toasts.filter(x => x[0] === 'error')[0];
  ok(t && t[1].indexOf('校验不通过') > 0, '错误提示同样说人话');
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('SHA-256') > 0 && logs.indexOf('对不上') > 0, '日志里有 SHA-256 校验失败的字样');
}

console.log('--- ④ crypto.subtle 不存在（局域网 http）→ 跳过校验照样装上 ---');
{
  const env = makeEnv({
    code: CODE_NO_SUBTLE, vars: REPO_VARS, popupResult: '1',
    failReleases: true,
    manifest: manifestOf(97, '20260922', { sha256: 'deadbeef' + '0'.repeat(56) }),
  });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 1, '没有 subtle 时跳过校验、预设照常装上');
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === PV + '-97', '跳过校验同样记 imported');
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('SHA-256') > 0 && logs.indexOf('跳过') > 0, '日志写明「校验跳过」及原因');
}

console.log('--- ⑤ 清单里的版本比本机旧 → 不弹窗（清单兜底同样要比版本） ---');
{
  const env = makeEnv({
    vars: REPO_VARS, localPreset: PN + '-98-20260923', installed: [PN + '-98-20260923'],
    failReleases: true,
    manifest: manifestOf(97, '20260922'),
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.action === 'none', '清单兜底发现的是旧版本 → 不弹窗', JSON.stringify(r.action));
  ok(env.slashCalls.length === 0, '不弹窗');
  ok(env.importCalls.length === 0, '不写入');
}

console.log('--- ⑥ 清单文件名解析不出版本号 → 明确报错（绝不瞎猜） ---');
{
  const env = makeEnv({
    vars: REPO_VARS, popupResult: '1',
    failReleases: true,
    manifest: {
      version: PV + '-97', file: 'preset-final.json', date: '20260922',
      bytes: 1, sha256: '', notes: 'n',
    },
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.ok === false && /清单里的文件名解析不出版本号/.test(r.error || ''),
    '文件名解析不出版本号 → 明确报错、不弹窗', r.error);
  ok(env.slashCalls.length === 0 && env.importCalls.length === 0, '不弹窗、不写入');
}

/* ---------- v1.4 新增：三方合并（口径 A/B/C/D 的脚本侧编排） ----------
   theirs = 活设置（opts.settings 塞进 chatCompletionSettings 的深拷贝源）；
   base   = opts.baseTag + baseManifest + baseText（按 tag 从镜像取的那份原始预设）；
   next   = PRESET_TEXT（下载链拿到的那份）。 */

function miniPreset(buildNo, prompts, order, ext) {
  return JSON.stringify({
    name: PN + '-' + buildNo + '-20260922',
    temperature: 0.7,
    prompts: prompts,
    prompt_order: [{ character_id: 100001, order: order }],
    extensions: ext || {}
  });
}
function prompt(id, content, extra) {
  return Object.assign({ identifier: id, name: id + ' 名', content: content == null ? '内容·' + id : content, enabled: true, role: 'system' }, extra || {});
}

/* 下面的每组都给用户版本号 96（baseTag=<上一个两位小版本>-96）与仓库最新 97：
   base = 96 的原始预设，theirs = 用户改过的活设置，next = 下载到的 97。 */
const MERGE_BASE = miniPreset(96, [prompt('a', 'base 版'), prompt('b'), prompt('c')],
  [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }],
  { regex_scripts: [{ id: 'r1', script_name: '压缩', find_regex: 'f1', replace_string: 'r', disabled: false }] });

console.log('--- 合并①：没有冲突 → 先备份、再导入合并结果（几乎静默） ---');
{
  const theirsText = miniPreset(96, [prompt('a', '我从没动过这条'), prompt('b'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }]);
  const nextText = miniPreset(97, [prompt('a', 'base 版'), prompt('b'), prompt('c'), prompt('new', '新版新条目')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }, { identifier: 'new', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1',
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const injection = { prompts: [prompt('a', 'base 版'), prompt('b'), prompt('c')], prompt_order: [{ character_id: 100001, order: [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }] }] };
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = JSON.parse(JSON.stringify(injection.prompts));
  st.prompt_order = JSON.parse(JSON.stringify(injection.prompt_order));
  await settle();
  const r = await env.api().check(false);
  ok(env.slashCalls.length === 1, '先弹「要不要更新」的普通弹窗（一次）');
  ok(env.importCalls.length === 2, '合并流程 = 两次 importRawPreset：备份 + 合并结果', env.importCalls.length);
  ok(env.importCalls[0].name === PN + '-96-20260921 · 合并前备份', '第 1 次写盘是「合并前备份」备份当前那份',
    env.importCalls[0] && env.importCalls[0].name);
  const backup = JSON.parse(env.importCalls[0].content);
  ok(backup.prompts && backup.prompts[0].content === 'base 版', '备份里存的是用户当前预设的内容',
    backup.prompts && backup.prompts[0]);
  ok(env.importCalls[1].name === PN + '-97-20260922', '第 2 次写盘 = 新版预设名',
    env.importCalls[1].name);
  const merged = JSON.parse(env.importCalls[1].content);
  ok(merged.prompts[0].content === 'base 版', '无冲突条目内容（两边同文）→ 保持原样，不空穴来风',
    merged.prompts[0]);
  ok(merged.prompts.some(p => p.identifier === 'new'), '新版新增条目直接进入合并结果',
    merged.prompts.map(p => p.identifier));
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === PV + '-97', '合并成功同样记 imported');
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('合并前备份') > 0, '日志写明先备份了');
  ok(logs.indexOf('合并计划就绪') > 0 && logs.indexOf('待裁决 0') > 0, '日志写明合并计划（本组 0 处待裁决）');
  ok(env.toasts.some(t => t[0] === 'success'), '合并成功后 toast 提醒切换');
}

console.log('--- 合并②：开关与顶层参数永远保留用户 + 用户改过的条目留他的 ---');
{
  const nextText = miniPreset(97,
    [prompt('a', 'base 版', { enabled: false }), prompt('b'), prompt('c'), prompt('new', '新条目')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }, { identifier: 'new', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1',
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  const theirs = [prompt('a', '用户自己改过的 a', { enabled: false }), prompt('b'), prompt('c')];
  st.prompts = theirs;
  st.prompt_order = [{ character_id: 100001, order: [{ identifier: 'a', enabled: false }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }] }];
  st.temperature = 1.05;
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 2, '有合并 + 先备份再导入（2 次写盘）', env.importCalls.map(c => c.name));
  const merged = JSON.parse(env.importCalls[1].content);
  const ma = merged.prompts.find(p => p.identifier === 'a');
  ok(ma.content === '用户自己改过的 a', '用户改过的条目内容保留（不问）', ma);
  ok(ma.enabled === false, '用户的条目开关保留（新版想改也没用）', ma);
  ok(merged.prompts.some(p => p.identifier === 'new'), '新版新增条目照加', merged.prompts.map(p => p.identifier));
  ok(merged.temperature === 1.05, '顶层参数（temperature）保留用户', merged.temperature);
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('待裁决 0') > 0, '只有用户改过 → 不进待裁决', logs);
  ok(r.action === 'imported', '成功收口', r.action);
}

console.log('--- 合并③：两边都改过 → 原生弹窗兜底一键裁决（无 🌟 面板时的退化路径） ---');
{
  /* 用户在同一窗口没装 🌟 面板：KamiPreset 全局不存在 → 弹窗一键「全部保留我的」 */
  const nextText = miniPreset(97, [prompt('a', '新版也改了 a'), prompt('b'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResults: ['1', '0'],   /* 第一次=更新；第二次弹窗「全部保留我的」 */
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '用户改过的 a'), prompt('b'), prompt('c')];
  st.prompt_order = [{ character_id: 100001, order: [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }, { identifier: 'c', enabled: true }] }];
  await settle();
  const r = await env.api().check(false);
  ok(env.slashCalls.length === 2, '两次弹窗：第一次问更新、第二次问合并裁决', env.slashCalls.length);
  const mergeCmd = env.slashCalls[1] || '';
  ok(mergeCmd.indexOf('okButton="全部用新版"') > 0 && mergeCmd.indexOf('cancelButton="全部保留我的"') > 0,
    '合并弹窗的按钮是「全部保留我的 / 全部用新版」');
  const htmlPart = mergeCmd.split('cancelButton="全部保留我的" ')[1] || '';
  ok(htmlPart.indexOf('\\') < 0 && htmlPart.indexOf('"') < 0 && htmlPart.indexOf('{{') < 0,
    '合并弹窗 HTML 同样过斜杠命令字符净化');
  ok(htmlPart.indexOf('都改过') > 0, '弹窗里说明这是「两边都改过」的差异');
  ok(env.importCalls.length === 2, '保留我的路径也先备份再导入', env.importCalls.map(c => c.name));
  const merged = JSON.parse(env.importCalls[1].content);
  ok(merged.prompts[0].content === '用户改过的 a', '一键全部保留我的 → 冲突内容留用户的',
    merged.prompts[0]);
  ok(env.api().status().logs.join('\n').indexOf('合并裁决') > 0, '日志写明用的是哪条裁决路径');
  /* 同一版本已写入 → 不再弹窗（合并流程与老流程共用 imported 记录） */
  const r2 = await env.api().check(false);
  ok(env.slashCalls.length === 2 && r2.action === 'imported', '同一版本已导入过，不再重复弹窗');
}
{
  /* 弹窗「全部用新版」：okButton 回执='1' → 冲突项全吃新版 */
  const nextText = miniPreset(97, [prompt('a', '新版也改了 a'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'c', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS,
    popupResults: ['1', '1'],    /* 第一次=更新；第二次合并弹窗=「全部用新版」 */
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '用户改过的 a'), prompt('b'), prompt('c')];
  await settle();
  await env.api().check(false);
  const merged = JSON.parse(env.importCalls[1].content);
  ok(merged.prompts[0].content === '新版也改了 a', '一键「全部用新版」→ 冲突项吃新版',
    merged.prompts[0]);
  ok(merged.prompts.some(p => p.identifier === 'b') === false, '新版删掉、用户没动过的条目跟着删',
    merged.prompts.map(p => p.identifier));
  const logs = env.api().status().logs.join('\n');
  ok(/合并报告/.test(logs) && /用新版|保留我的/.test(logs), '日志里有「合并报告」的数字');
}

console.log('--- 合并④：面板路径（HOST.KamiPreset.openMergeReview 主路径） ---');
{
  const nextText = miniPreset(97, [prompt('a', '新版也改了 a'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'c', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResults: ['1'],
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '用户改过的 a'), prompt('c')];
  await settle();
  const seenPlans = [], appliedByMe = [];
  env.W.KamiPreset = {
    openMergeReview: (plan, onApply) => {
      seenPlans.push(JSON.parse(JSON.stringify(plan)));
      /* 模拟用户在面板上：逐项选「保留我的」并点「应用并完成更新」 */
      plan.conflicts.forEach(c => { c.choice = 'mine'; });
      onApply(plan);
      return true;
    }
  };
  await settle();
  const r = await env.api().check(false);
  ok(seenPlans.length === 1 && seenPlans[0].conflicts.length === 1 &&
    seenPlans[0].conflicts[0].key === 'pm:a', '面板路径：计划传进来（key/清单可读）',
    seenPlans[0] && seenPlans[0].conflicts);
  ok(env.importCalls.length === 2, '面板路径同样先备份再导入', env.importCalls.map(c => c.name));
  const merged = JSON.parse(env.importCalls[1].content);
  ok(merged.prompts[0].content === '用户改过的 a', '面板裁决「保留我的」→ 内容留用户',
    merged.prompts[0]);
  ok(env.slashCalls.length === 1, '面板路径不再弹合并弹窗（只有最初的更新询问）',
    env.slashCalls.length);
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('更新合并') > 0, '日志写明走了面板的「更新合并」页');
  /* 用户放弃（onApply(null)）→ 不写盘、不记 imported */
  const env2 = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResults: ['1'],
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st2 = env2.W.SillyTavern.getContext().chatCompletionSettings;
  st2.prompts = [prompt('a', '用户改过的 a'), prompt('c')];
  env2.W.KamiPreset = {
    openMergeReview: (plan, onApply) => { onApply(null); return true; }   /* 用户关掉面板 = 放弃 */
  };
  await settle();
  const r2 = await env2.api().check(false);
  ok(env2.importCalls.length === 0, '放弃裁决 → 不写盘', env2.importCalls.map(c => c.name));
  ok(r2.action !== 'imported' && !env2.scriptVars['kami-update'].imported, '放弃不记 imported',
    r2.action);
}

console.log('--- 合并⑤：备份写不进去 → 同样不导入合并结果 ---');
{
  const nextText = miniPreset(97, [prompt('a', '新版 a'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'c', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResult: '1', importFail: true,
    localPreset: PN + '-96-20260921',
    presetText: nextText,
    baseTag: PV + '-96',
    baseManifest: { version: PV + '-96', file: PN + '-96-20260921.json' },
    baseText: MERGE_BASE,
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '用户版 a'), prompt('c')];
  await settle();
  const r = await env.api().check(false);
  /* importFail mock 会让每一次写入都失败：备份那次被记下并失败 → 合并结果没有导入 */
  ok(env.importCalls.length === 1 && env.importCalls[0].name.indexOf('合并前备份') > 0,
    '备份写不进去 → 备份也没导入成（合并结果没有写盘）',
    env.importCalls.map(c => c.name));
  ok(!env.scriptVars['kami-update'].imported, '失败不记录 imported');
  ok(r.action !== 'imported', 'action 不是 imported');
  const t = env.toasts.filter(x => x[0] === 'error')[0];
  ok(t && /更新失败/.test(t[1]), '备份失败=更新失败，弹错误提示');
}

console.log('--- 合并⑥：base 取不到（认不出 tag / 镜像 404）→ 退化模式也能走完 ---');
{
  const nextText = miniPreset(97, [prompt('a', '新版的 a'), prompt('c')],
    [{ identifier: 'a', enabled: true }, { identifier: 'c', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResults: ['1', '0'],
    localPreset: '我的奇怪预设',
    presetText: nextText,
    baseManifest: null,     /* 按 tag 取：清单 404 */
    baseMain404: true,      /* 按预设名兜底取：镜像里也没有 → 两条路都断，才是真正的退化 */
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '用户版的 a'), prompt('c')];
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 2, '退化模式一样先备份再导入', env.importCalls.map(c => c.name));
  const merged = JSON.parse(env.importCalls[1].content);
  ok(merged.prompts[0].content === '用户版的 a', '退化默认 = 保留我的（a 的差异留在用户手里）',
    merged.prompts[0]);
  ok(merged.prompts.some(p => p.identifier === 'c'), '（顺带）没动过的条目不丢',
    merged.prompts.map(p => p.identifier));
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('退化模式') > 0 || logs.indexOf('退化') > 0, '日志写明进入了退化模式');
  /* 弹窗里也要提示「旧版认不出来」 */
  const mergeCmd = (env.slashCalls[1] || '');
  ok(mergeCmd.indexOf('认不出来') > 0, '弹窗里说明「旧的版本认不出来，全按两边都改过处理」');
}

console.log('--- 合并⑦：按 tag 取不到 base，但按**预设名**能从镜像最新提交兜到 → 不走退化 ---');
{
  /* 场景：用户跑的是没发过 Release 的那一版（仓库里没这个 tag），但镜像目录里留着这一版的文件。
     此时 base 应该按「本地预设名」从 @main/mirror/<预设名>.json 兜到 —— 不发版也能享受完整合并。 */
  const baseText = miniPreset(96, [prompt('a', '原始 a'), prompt('b')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }]);
  const nextText = miniPreset(97, [prompt('a', '新版改过的 a'), prompt('b')],
    [{ identifier: 'a', enabled: true }, { identifier: 'b', enabled: true }]);
  const env = makeEnv({
    code: CODE_NO_RETRY_DELAY, vars: REPO_VARS, popupResults: ['1', '0'],
    localPreset: PN + '-96-20260921',       /* 名字就是镜像里的文件名 */
    presetText: nextText,
    baseTag: PV + '-96', baseManifest: null, /* tag 那条 404 */
    baseMainText: baseText,                  /* 兜底那条给真正的 base */
  });
  const st = env.W.SillyTavern.getContext().chatCompletionSettings;
  st.prompts = [prompt('a', '原始 a'), prompt('b')];   /* 与 base 逐字一致 → 用户没动过，该吃新版 */
  await settle();
  await env.api().check(false);
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('改按预设名从镜像最新提交取') > 0, '日志写明走了「按预设名」的兜底路');
  ok(logs.indexOf('退化模式') < 0, '兜到了 base → 不进退化模式');
  const merged = env.importCalls.length ? JSON.parse(env.importCalls[env.importCalls.length - 1].content) : null;
  ok(!!merged && merged.prompts[0].content === '新版改过的 a',
    '用户没动过的条目吃到了新版正文（证明 base 真被用上了）', merged && merged.prompts[0]);
}

console.log('\n结果：' + (total - bad) + ' / ' + total + ' 通过');process.exit(bad ? 1 : 0);
