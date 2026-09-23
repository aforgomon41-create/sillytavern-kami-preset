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
 *   · 新旧命名互认：本机 0.9-97 与仓库 v0.90-97 是同一版本，不弹
 * 不依赖浏览器。改 70-远程更新.js 后跑一遍，能挡住大部分回归。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CODE = fs.readFileSync(path.join(ROOT, 'src', 'scripts', '70-远程更新.js'), 'utf8');
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
    : JSON.stringify({ name: 'kami-v0.90-97-20260922', prompts: [{ identifier: 'a', name: 'x', content: 'y' }], prompt_order: [] });

  const dom = Object.assign({}, opts.dom || {});
  const HDOC = {
    getElementById: (id) => (id === 'send_textarea' ? {} : (dom['#' + id] || null)),
    querySelector: (sel) => (dom[sel] !== undefined ? dom[sel] : null),
    defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    addEventListener: () => { }, removeEventListener: () => { },
  };
  const ctx = {
    chatCompletionSettings: { preset_settings_openai: opts.localPreset || '卡密预设0.9-96' },
    getPresetManager: () => ({
      getSelectedPresetName: () => opts.localPreset || '卡密预设0.9-96',
      getAllPresets: () => opts.installed || ['卡密预设0.9-96', 'Default'],
    }),
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'tok' }),
    executeSlashCommandsWithOptions: async (cmd) => {
      slashCalls.push(cmd);
      return { pipe: opts.popupResult === undefined ? '1' : String(opts.popupResult), isError: false };
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
      /* jsDelivr：清单（版本兜底读的那份）与镜像文件（下载链 ②③ 条）按 URL 分流。
         @<tag> 默认也 200；jsdTag404 时这条给 404（模拟「tag 打早了、里面没有这份文件」）→ 自动退 @main */
      if (u.indexOf('@main/mirror/manifest.json') >= 0) {
        if (optsManifest === null) { return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('') }); }
        return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(JSON.stringify(optsManifest)) });
      }
      if (opts.jsdTag404 && /@v[\d.]+-\d+\//.test(u)) {
        return Promise.resolve({ ok: false, status: 404, headers, text: () => Promise.resolve('not found') });
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
    triggerSlash: async (cmd) => { slashCalls.push(cmd); return opts.popupResult === undefined ? '1' : String(opts.popupResult); },
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

/* 造一个假 Release：现行正式分发名 kami-v0.90-<build>-<date>.json
   （曾用名「卡密预设v0.90-…」在 GitHub 上会被削成「v0.90-…」，所以 2026-09-23 起前缀改成 ASCII） */
function releaseOf(build, date, extra) {
  const d = date || '20260922';
  const name = 'kami-v0.90-' + build + '-' + d;
  return Object.assign({
    tag_name: 'v0.90-' + build + '-' + d,
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
  ok(cmd.indexOf('kami-v0.90-97-20260922') > 0 && cmd.indexOf('v0.90-97') > 0, '弹窗里带新版本名');
  ok(cmd.indexOf('max-height:36vh') > 0 && cmd.indexOf('overflow-y:auto') > 0, '更新说明放在可滚动区域里（窗口不会过高）');
  ok(env.importCalls.length === 1, '调用了 importRawPreset 写入预设文件夹');
  ok(env.importCalls[0] && env.importCalls[0].name === 'kami-v0.90-97-20260922', '写入的预设名正确', env.importCalls[0] && env.importCalls[0].name);
  ok(env.importCalls[0] && env.importCalls[0].content.indexOf('"prompts"') > 0, '写入的是下载到的预设原文');
  ok(env.scriptVars['kami-update'].imported === 'v0.90-97', '脚本变量记下 imported=v0.90-97（跟账号走，不存浏览器）');
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
  ok(env.scriptVars['kami-update'].skipped === 'v0.90-97', '脚本变量记下 skipped=v0.90-97');
  ok(env.importCalls.length === 0, '没有写入预设');
  const r2 = await env.api().check(false);
  ok(env.slashCalls.length === 1, '再检查不为同一版本弹窗');
  ok(r2.action === 'skipped', '第二次 action = skipped');
  const env2 = makeEnv({
    vars: { 'kami-update': { skipped: 'v0.90-97', repo: REPO_VARS['kami-update'].repo } },
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
  const env = makeEnv({ vars: REPO_VARS, installed: ['卡密预设0.9-96', 'kami-v0.90-97-20260922'] });
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
  const env = makeEnv({ vars: { 'kami-update': { skipped: 'v0.90-97', repo: REPO_VARS['kami-update'].repo } }, popupResult: '0' });
  await settle();
  const r = await env.api().check(true);
  ok(env.slashCalls.length === 1, 'force 时忽略 skipped 记录重新弹');
  ok(r.action === 'declined', '用户仍然选否');
}

console.log('--- reset / shutdown ---');
{
  const env = makeEnv({ vars: { 'kami-update': { skipped: 'v0.90-97', imported: 'v0.90-97', repo: REPO_VARS['kami-update'].repo } } });
  await settle();
  const s = env.api().reset();
  ok(env.scriptVars['kami-update'].skipped === '' && env.scriptVars['kami-update'].imported === '', 'reset 清空版本记录');
  ok(s.version === '1.3' && s.configured === true, 'status() 有版本与仓库配置');
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
  ok(env.scriptVars['kami-update'].skipped === 'v0.90-97', '自动检查也走同一条流程（记下拒绝）');
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
          { name: 'kami-v0.90-97-20260922.json', browser_download_url: 'https://example.com/dl/kami.json' },
        ],
      }),
    ],
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.remote && r.remote.build === 97, '跳过草稿，取最新非草稿版', r.remote && r.remote.build);
  ok(r.remote && r.remote.url === 'https://example.com/dl/kami.json', '多附件优先选 kami- 开头的 JSON', r.remote && r.remote.url);

  /* GitHub 会把非 ASCII 附件名直接削掉：曾用中文名上传的附件会变成 v0.90-…json（没有前缀）。
     这种附件也必须能挑中、并解析出版本号（否则「改名换前缀」这件事会把老 Release 变成死信）。 */
  const envStripped = makeEnv({
    vars: REPO_VARS, popupResult: '0',
    release: [releaseOf(97, '20260922', {
      assets: [
        { name: 'checksums.txt', browser_download_url: 'https://example.com/dl/checksums.txt' },
        { name: 'v0.90-97-20260922.json', browser_download_url: 'https://example.com/dl/stripped.json' },
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
  ok(r.action === 'none', '本机旧命名 0.9-97 与仓库正式命名 v0.90-97 判为同一版本', JSON.stringify(r.action));

  const env2 = makeEnv({
    vars: REPO_VARS, localPreset: 'kami-v0.90-96-20260921', installed: ['kami-v0.90-96-20260921'],
    release: [releaseOf(97, '20260922')],
  });
  await settle();
  const r2 = await env2.api().check(false);
  ok(env2.slashCalls.length === 1, '本机 v0.90-96 对仓库 v0.90-97 → 弹窗');
  ok(r2.localVersion === 'v0.90-96', 'status 里带本机版本号', r2.localVersion);
}

console.log('--- 下载链：直链 TypeError 失败 → 回退 API 附件通道成功（本用例关掉 jsDelivr，专测第④条） ---');
{
  const env = makeEnv({ code: CODE_NO_JSD_NO_RETRY, vars: REPO_VARS, popupResult: '1', failDirect: true });
  await settle();
  const r = await env.api().check(false);
  ok(env.importCalls.length === 1, '直链失败时回退通道仍然装上了预设');
  ok(env.importCalls[0] && env.importCalls[0].name === 'kami-v0.90-97-20260922', '回退写入的预设名正确');
  ok(env.importCalls[0] && env.importCalls[0].content.indexOf('"prompts"') > 0, '回退写入的是完整预设原文');
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === 'v0.90-97', '回退成功同样记 imported');
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
  const file = 'kami-v0.90-' + build + '-' + d + '.json';
  return Object.assign({
    version: 'v0.90-' + build,
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
  ok(env.importCalls[0] && env.importCalls[0].name === 'kami-v0.90-97-20260922', '清单兜底写入的预设名正确',
    env.importCalls[0] && env.importCalls[0].name);
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === 'v0.90-97', '清单兜底同样记 imported');
  ok(r.remote && r.remote.from === 'manifest', 'remote 标记来源 = manifest', r.remote && r.remote.from);
  ok(r.remote && r.remote.assetId === null, '清单兜底的 remote 没有 Release 附件 id');
  const dlJsd = jsdFileCalls(env);
  ok(dlJsd.length >= 1, '下载确实走的 jsDelivr', JSON.stringify(dlJsd.map(c => c.url)));
  ok(dlJsd[0] && dlJsd[0].url.indexOf('/mirror/kami-v0.90-97-20260922.json') > 0,
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
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === 'v0.90-97', '@main 兜底同样记 imported');
  const jsdTag = env.fetchCalls.filter(c => /cdn\.jsdelivr\.net\/.*@v0\.90-97\//.test(c.url));
  const jsdMain = jsdFileCalls(env).filter(c => c.url.indexOf('@main/') >= 0);
  ok(jsdTag.length >= 1, '@<tag> 那条也试过（每条通道 2 次的既有逻辑没动）', JSON.stringify(jsdTag.map(c => c.url)));
  ok(jsdMain.length >= 1, '随后落到 @main 那条', JSON.stringify(jsdMain.map(c => c.url)));
  ok(jsdMain[0] && jsdMain[0].url.indexOf('/mirror/kami-v0.90-97-20260922.json') > 0,
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
  ok(r.action === 'imported' && env.scriptVars['kami-update'].imported === 'v0.90-97', '跳过校验同样记 imported');
  const logs = env.api().status().logs.join('\n');
  ok(logs.indexOf('SHA-256') > 0 && logs.indexOf('跳过') > 0, '日志写明「校验跳过」及原因');
}

console.log('--- ⑤ 清单里的版本比本机旧 → 不弹窗（清单兜底同样要比版本） ---');
{
  const env = makeEnv({
    vars: REPO_VARS, localPreset: 'kami-v0.90-98-20260923', installed: ['kami-v0.90-98-20260923'],
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
      version: 'v0.90-97', file: 'preset-final.json', date: '20260922',
      bytes: 1, sha256: '', notes: 'n',
    },
  });
  await settle();
  const r = await env.api().check(false);
  ok(r.ok === false && /清单里的文件名解析不出版本号/.test(r.error || ''),
    '文件名解析不出版本号 → 明确报错、不弹窗', r.error);
  ok(env.slashCalls.length === 0 && env.importCalls.length === 0, '不弹窗、不写入');
}

console.log('\n结果：' + (total - bad) + ' / ' + total + ' 通过');
process.exit(bad ? 1 : 0);
