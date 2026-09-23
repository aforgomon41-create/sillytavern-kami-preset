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
  const fetchMock = (url) => {
    fetchCalls.push(url);
    const headers = { get: (k) => (k === 'x-ratelimit-remaining' ? (opts.rateLimit ? '0' : '50') : null) };
    if (opts.fetchFail) { return Promise.resolve({ ok: false, status: 404, headers }); }
    if (opts.rateLimit) { return Promise.resolve({ ok: false, status: 403, headers, text: () => Promise.resolve('') }); }
    if (String(url).indexOf('https://api.github.com/') === 0) {
      if (!RELEASE) { return Promise.resolve({ ok: false, status: 404, headers }); }
      return Promise.resolve({ ok: true, status: 200, headers, text: () => Promise.resolve(JSON.stringify(RELEASE)) });
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
    assets: [{ name: name + '.json', browser_download_url: 'https://example.com/dl/' + name + '.json' }],
  }, extra || {});
}

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
  const env = makeEnv({ vars: REPO_VARS, release: null });
  await settle();
  const r = await env.api().check(false);
  ok(r.ok === false && /404/.test(r.error || ''), '清单 404：记录错误但不弹窗', r.error);
  ok(env.slashCalls.length === 0, '不弹窗');

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
  ok(s.version === '1.2' && s.configured === true, 'status() 有版本与仓库配置');
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

  const env2 = makeEnv({ vars: REPO_VARS, release: [releaseOf(97, '20260922', { assets: [{ name: 'readme.txt', browser_download_url: 'x' }] })] });
  await settle();
  const r2 = await env2.api().check(false);
  ok(/没有一个带预设 JSON 附件/.test(r2.error || ''), '没有 JSON 附件时明确报错', r2.error);

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

console.log('\n结果：' + (total - bad) + ' / ' + total + ' 通过');
process.exit(bad ? 1 : 0);
