// 发 Release（按 GitHub推送规范 §四）。token 从凭据管理器取，绝不打印。
//
// 用法：node .audit/publish-release.mjs <构建号> [说明正文文件]
//   例：node .audit/publish-release.mjs 122 .audit/release-122.txt
//   附件与产物从 dist/ 里按构建号找（kami-v0.90-<N>-<日期>.json），
//   附件名**逐字**用产物名 —— 更新脚本靠它认版本，一个字都不能改。
//
// 规范红线（脚本里都做了机械校验）：
//   · 正文是纯文本、一行一条，**不得出现竖线、花括号、反斜杠**（弹窗会把它们换成全角）；
//   · 不发草稿；一个 Release 挂一个预设 JSON 附件；
//   · 老用户启动酒馆会弹更新窗（默认 6 小时检查一次）。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const OWNER = 'aforgomon41-create';
const REPO = 'sillytavern-kami-preset';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const N = String(process.argv[2] || '').trim();
if (!/^\d{1,4}$/.test(N)) {
  console.error('用法：node .audit/publish-release.mjs <构建号> [说明正文文件]');
  process.exit(1);
}
const BODY_FILE = process.argv[3] || path.join(ROOT, '.audit', 'release-' + N + '.txt');

/* 1. 找产物：dist/kami-v0.90-<N>-<日期>.json */
const distDir = path.join(ROOT, 'dist');
const hit = fs.readdirSync(distDir)
  .filter(f => new RegExp('^kami-v0\\.90-' + N + '-\\d{8}\\.json$', 'i').test(f));
if (hit.length !== 1) {
  console.error('在 dist/ 里找到 ' + hit.length + ' 个匹配「kami-v0.90-' + N + '-<日期>.json」的文件，无法确定用哪个：' + hit.join(', '));
  process.exit(1);
}
const ASSET_NAME = hit[0];
const FILE = path.join(distDir, ASSET_NAME);
const TAG = 'v0.90-' + N;
const TITLE = '卡密预设 ' + TAG;

/* 2. 说明正文 */
if (!fs.existsSync(BODY_FILE)) {
  console.error('找不到说明正文文件：' + BODY_FILE);
  process.exit(1);
}
const BODY = fs.readFileSync(BODY_FILE, 'utf8').replace(/\r\n/g, '\n').trim();
const bad = ['|', '{', '}', '\\'].filter(c => BODY.includes(c));
if (bad.length) { console.error('正文含禁用字符：' + bad.join(' ')); process.exit(1); }
if (!BODY) { console.error('说明正文是空的'); process.exit(1); }

console.log('准备发布：' + TITLE);
console.log('  产物 / 附件名：' + ASSET_NAME + '  (' + Math.round(fs.statSync(FILE).size / 1024) + ' KB)');
console.log('  说明正文：' + BODY.split('\n').length + ' 行，' + BODY.length + ' 字');

/* 3. 取 token（不打印） */
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

/* 4. 先看一眼重名：同一个 tag 已经发过就停手（避免接口改已有 Release） */
const existed = await fetch(api('/repos/' + OWNER + '/' + REPO + '/releases/tags/' + TAG), { headers: H });
if (existed.status === 200) {
  const r0 = await existed.json();
  console.error('已经存在 tag ' + TAG + ' 的 Release：' + r0.html_url + ' —— 先确认要不要改它，别重复发。');
  process.exit(1);
}

/* 5. 建 Release（tag 由接口一并创建） */
const r = await fetch(api('/repos/' + OWNER + '/' + REPO + '/releases'), {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: TITLE, body: BODY, draft: false, prerelease: false }),
});
const rel = await r.json();
if (!r.ok) { console.error('建 Release 失败 ' + r.status + '：' + JSON.stringify(rel).slice(0, 300)); process.exit(1); }
console.log('Release 已建：' + rel.html_url + '  (id ' + rel.id + ', tag ' + rel.tag_name + ')');

/* 6. 上传附件 */
const buf = fs.readFileSync(FILE);
const up = await fetch(rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(ASSET_NAME), {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json', 'Content-Length': String(buf.length) },
  body: buf,
});
const asset = await up.json();
if (!up.ok) { console.error('上传附件失败 ' + up.status + '：' + JSON.stringify(asset).slice(0, 300)); process.exit(1); }
console.log('附件已上传：' + asset.name + '  ' + Math.round(asset.size / 1024) + ' KB');
if (asset.name !== ASSET_NAME) {
  console.error('⚠️ GitHub 把附件名改了：' + ASSET_NAME + ' → ' + asset.name + '（更新脚本会认不出，必须处理）');
  process.exit(1);
}
console.log('下载地址：' + asset.browser_download_url);
