// 删除 -113 的 Release 与 tag，重发 -114（用户已批准）
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const OWNER = 'aforgomon41-create';
const REPO = 'sillytavern-kami-preset';
const OLD_RELEASE_ID = 394235653;
const OLD_TAG = 'v0.90-113';
const TAG = 'v0.90-114';
const TITLE = '卡密预设 v0.90-114';
const FILE = 'dist/kami-v0.90-114-20260923.json';
const ASSET_NAME = 'kami-v0.90-114-20260923.json';
const BODY = [
  '卡密预设 v0.90-114',
  '',
  '分发文件名改用 ASCII 前缀 kami-，因为 GitHub 会削掉附件名里的中文。',
  '皮肤 15 套：新增 8 套，重做千恋万花与黑暗世界。',
  '修复三套皮肤的面板无法上下滑动。',
  '修复老五套皮肤在酒馆自定义样式下的输入框配色。',
  '预设条目改名：仿全知、仿绝望、仿OOC、仿发情、仿冰冷 改为 防X。',
  'MVU zod 脚本默认停用。',
].join('\n');

const bad = ['|', '{', '}', '\\'].filter(c => BODY.includes(c));
if (bad.length) { console.error('正文含禁用字符：' + bad.join(' ')); process.exit(1); }

const c = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const TOKEN = /^password=(.+)$/m.exec(c.stdout)[1].trim();
const H = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'kami-preset-release' };
const api = (p) => 'https://api.github.com' + p;

/* 1. 删 Release */
let r = await fetch(api(`/repos/${OWNER}/${REPO}/releases/${OLD_RELEASE_ID}`), { method: 'DELETE', headers: H });
console.log('删除 -113 Release → HTTP ' + r.status);

/* 2. 删 tag（删 Release 不会自动删 tag） */
r = await fetch(api(`/repos/${OWNER}/${REPO}/git/refs/tags/${OLD_TAG}`), { method: 'DELETE', headers: H });
console.log('删除 tag ' + OLD_TAG + ' → HTTP ' + r.status);

/* 3. 建 -114 */
r = await fetch(api(`/repos/${OWNER}/${REPO}/releases`), {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: TITLE, body: BODY, draft: false, prerelease: false }),
});
const rel = await r.json();
if (!r.ok) { console.error('建 Release 失败 ' + r.status + '：' + JSON.stringify(rel).slice(0, 300)); process.exit(1); }
console.log('Release 已建：' + rel.html_url + '  (id ' + rel.id + ')');

/* 4. 传附件 */
const buf = fs.readFileSync(FILE);
const up = await fetch(rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(ASSET_NAME), {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'Content-Length': String(buf.length) }, body: buf,
});
const asset = await up.json();
if (!up.ok) { console.error('上传失败 ' + up.status + '：' + JSON.stringify(asset).slice(0, 300)); process.exit(1); }
console.log('附件上传 → 存成 ' + JSON.stringify(asset.name) + '  ' + Math.round(asset.size / 1024) + ' KB');
console.log(asset.name === ASSET_NAME ? '✅ 附件名与正式分发名逐字一致' : '❌ 附件名不一致');

/* 5. 复查整个 Release 列表 */
r = await fetch(api(`/repos/${OWNER}/${REPO}/releases`), { headers: H });
const list = await r.json();
console.log('\n仓库现有 Release：');
for (const x of list) {
  console.log('  ' + x.tag_name + '  ' + JSON.stringify(x.name) + '  draft=' + x.draft + '  附件=' +
    JSON.stringify((x.assets || []).map(a => a.name)));
}
