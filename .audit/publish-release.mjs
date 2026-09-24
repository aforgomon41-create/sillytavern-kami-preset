// 发版工具（按 GitHub推送规范 §四）。token 从凭据管理器取，绝不打印。
//
// 用法：
//   node .audit/publish-release.mjs <构建号> [说明正文文件] [--mirror-only]
//     · 默认：提交镜像 → 推仓库 → purge jsDelivr 缓存 → 建 Release（含 tag）→ 挂附件
//     · --mirror-only：只做「提交镜像 + 推仓库 + purge」，**不发 Release**
//       （远程更新脚本的 jsDelivr 通道只认仓库里的文件，不发 Release 也能供货）
//
// 为什么必须「先提交镜像、再打 Release」：
//   jsDelivr 的 `@<tag>/...` 只认**该 tag 指向的那次提交里**的文件。Release 接口建 tag 时
//   取的是默认分支当时的 HEAD —— 镜像文件还没推上去就发版，`@<tag>` 那条路会永远 404。
//
// 规范红线（脚本里都做了机械校验）：
//   · Release 正文是纯文本、一行一条，**不得出现竖线、花括号、反斜杠**（弹窗会把它们换成全角）；
//   · 不发草稿；一个 Release 挂一个预设 JSON 附件，附件名**逐字**用产物名（更新脚本靠它认版本）；
//   · 老用户启动酒馆会弹更新窗（默认 6 小时检查一次）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OWNER = 'aforgomon41-create';
const REPO = 'sillytavern-kami-preset';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIRROR_DIR = 'mirror';

const argv = process.argv.slice(2).filter(a => a !== '--mirror-only');
const MIRROR_ONLY = process.argv.includes('--mirror-only');
const N = String(argv[0] || '').trim();
if (!/^\d{1,4}$/.test(N)) {
  console.error('用法：node .audit/publish-release.mjs <构建号> [说明正文文件] [--mirror-only]');
  process.exit(1);
}
const BODY_FILE = argv[1] || path.join(ROOT, '.audit', 'release-' + N + '.txt');

function git(args, opts) {
  const r = spawnSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {}));
  if (r.status !== 0) {
    console.error('git ' + args.join(' ') + ' 失败（' + r.status + '）：' + String(r.stderr || '').trim());
    process.exit(1);
  }
  return String(r.stdout || '');
}

/* 1. 找产物：dist/kami-v<版本>-<N>-<日期>.json（版本号不写死：从产物名解析，
      并与根目录 version.json 核对一致 —— 免得拿旧版本的产物去发新版本号） */
const distDir = path.join(ROOT, 'dist');
const wantVersion = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version || '').trim();
const hit = fs.readdirSync(distDir)
  .filter(f => new RegExp('^kami-v(\\d+\\.\\d+)-' + N + '-\\d{8}\\.json$', 'i').test(f));
if (hit.length !== 1) {
  console.error('在 dist/ 里找到 ' + hit.length + ' 个匹配「kami-v<版本>-' + N + '-<日期>.json」的文件，无法确定用哪个：' + hit.join(', '));
  process.exit(1);
}
const ASSET_NAME = hit[0];
const FILE = path.join(distDir, ASSET_NAME);
const fileVersion = (ASSET_NAME.match(/^kami-v(\d+\.\d+)-/i) || [, ''])[1];
if (wantVersion && fileVersion !== wantVersion) {
  console.error('产物版本（' + fileVersion + '）与 version.json（' + wantVersion + '）不一致 —— 先跑 node build/build.mjs 出对应版本的产物。');
  process.exit(1);
}
const TAG = 'v' + fileVersion + '-' + N;
const TITLE = '卡密预设 ' + TAG;
const DATE = (ASSET_NAME.match(/-(\d{8})\.json$/i) || [, ''])[1];

/* 2. 说明正文 */
if (!fs.existsSync(BODY_FILE)) {
  console.error('找不到说明正文文件：' + BODY_FILE);
  process.exit(1);
}
const BODY = fs.readFileSync(BODY_FILE, 'utf8').replace(/\r\n/g, '\n').trim();
const bad = ['|', '{', '}', '\\'].filter(c => BODY.includes(c));
if (bad.length) { console.error('正文含禁用字符：' + bad.join(' ')); process.exit(1); }
if (!BODY) { console.error('说明正文是空的'); process.exit(1); }

const BUF = fs.readFileSync(FILE);
const SHA = crypto.createHash('sha256').update(BUF).digest('hex');

console.log((MIRROR_ONLY ? '只发镜像：' : '准备发布：') + TITLE);
console.log('  产物 / 附件名：' + ASSET_NAME + '  (' + Math.round(BUF.length / 1024) + ' KB, sha256 ' + SHA.slice(0, 16) + '…)');
console.log('  说明正文：' + BODY.split('\n').length + ' 行，' + BODY.length + ' 字');

/* 3. 提交镜像（jsDelivr 通道的货源） */
const mirDir = path.join(ROOT, MIRROR_DIR);
fs.mkdirSync(mirDir, { recursive: true });
fs.copyFileSync(FILE, path.join(mirDir, ASSET_NAME));
fs.writeFileSync(path.join(mirDir, 'manifest.json'), JSON.stringify({
  version: TAG, file: ASSET_NAME, bytes: BUF.length, sha256: SHA, date: DATE, notes: BODY,
}, null, 2) + '\n', 'utf8');
git(['add', MIRROR_DIR]);
const staged = git(['diff', '--cached', '--name-only']).trim();
if (staged) {
  git(['commit', '-m', (MIRROR_ONLY ? '镜像' : '发版镜像') + ' ' + TAG + '：' + ASSET_NAME]);
  console.log('  镜像已提交：' + staged.split('\n').join(' / '));
} else {
  console.log('  镜像没有变化（这一版之前提交过），跳过提交');
}
git(['push', 'origin', 'main']);
console.log('  仓库已推送（' + git(['rev-parse', '--short', 'HEAD']).trim() + '）');

/* 4. 刷 jsDelivr 的 @main 缓存（约 12 小时，不刷的话清单可能还是上一版） */
try {
  const pr = await fetch('https://purge.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@main/' + MIRROR_DIR + '/manifest.json');
  const pj = await pr.json();
  console.log('  jsDelivr 清单缓存已刷：' + pj.status);
} catch (e) {
  console.log('  ⚠ jsDelivr 缓存刷新没成功（不影响供货，只是清单可能滞后）：' + (e && e.message));
}
/* 顺手确认清单真的能读到（拿真实 CDN 当回执） */
try {
  const mr = await fetch('https://cdn.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@main/' + MIRROR_DIR + '/manifest.json', { headers: { 'User-Agent': 'kami-publish' } });
  const mj = await mr.json();
  console.log('  线上清单回执：HTTP ' + mr.status + ' version=' + mj.version + ' file=' + mj.file + ' sha256=' + String(mj.sha256).slice(0, 16) + '…');
} catch (e) {
  console.log('  ⚠ 线上清单没读到：' + (e && e.message));
}

if (MIRROR_ONLY) {
  console.log('--mirror-only：不发 Release，到此结束。');
  process.exit(0);
}

/* 5. 取 token（不打印） */
const cred = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
});
if (cred.status !== 0) { console.error('git credential fill 失败（退出码 ' + cred.status + '）'); process.exit(1); }
const m = /^password=(.+)$/m.exec(cred.stdout || '');
if (!m) { console.error('凭据里没有 password 字段（可能没存 token）'); process.exit(1); }
const TOKEN = m[1].trim();
console.log('凭据已取到（长度 ' + TOKEN.length + '，不打印）');

const api = (p) => 'https://api.github.com' + p;
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'kami-preset-release' };

/* 6. 先看一眼重名：同一个 tag 已经发过就停手（避免接口改已有 Release） */
const existed = await fetch(api('/repos/' + OWNER + '/' + REPO + '/releases/tags/' + TAG), { headers: H });
if (existed.status === 200) {
  const r0 = await existed.json();
  console.error('已经存在 tag ' + TAG + ' 的 Release：' + r0.html_url + ' —— 先确认要不要改它，别重复发。');
  process.exit(1);
}

/* 7. 建 Release（tag 建在刚刚推上去的那个提交上，所以 @<tag>/mirror/<file> 一定取得到） */
const r = await fetch(api('/repos/' + OWNER + '/' + REPO + '/releases'), {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: TITLE, body: BODY, draft: false, prerelease: false }),
});
const rel = await r.json();
if (!r.ok) { console.error('建 Release 失败 ' + r.status + '：' + JSON.stringify(rel).slice(0, 300)); process.exit(1); }
console.log('Release 已建：' + rel.html_url + '  (id ' + rel.id + ', tag ' + rel.tag_name + ')');

/* 8. 上传附件 */
const up = await fetch(rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(ASSET_NAME), {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json', 'Content-Length': String(BUF.length) },
  body: BUF,
});
const asset = await up.json();
if (!up.ok) { console.error('上传附件失败 ' + up.status + '：' + JSON.stringify(asset).slice(0, 300)); process.exit(1); }
console.log('附件已上传：' + asset.name + '  ' + Math.round(asset.size / 1024) + ' KB');
if (asset.name !== ASSET_NAME) {
  console.error('⚠️ GitHub 把附件名改了：' + ASSET_NAME + ' → ' + asset.name + '（更新脚本会认不出，必须处理）');
  process.exit(1);
}
console.log('下载地址：' + asset.browser_download_url);
console.log('jsDelivr 地址：https://cdn.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@' + TAG + '/' + MIRROR_DIR + '/' + ASSET_NAME);
