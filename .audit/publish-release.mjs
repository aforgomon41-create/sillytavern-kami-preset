// 发布第一个 Release（按 GitHub推送规范 §四）。token 从凭据管理器取，绝不打印。
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const OWNER = 'aforgomon41-create';
const REPO = 'sillytavern-kami-preset';
const TAG = 'v0.90-113';
const TITLE = '卡密预设 v0.90-113';
const FILE = 'dist/卡密预设v0.90-113-20260923.json';
const ASSET_NAME = '卡密预设v0.90-113-20260923.json';
const BODY = [
  '卡密预设 v0.90-113',
  '',
  '皮肤增至 15 套。新增 8 套：扫描显示、终端、闲云野鹤、漫画草稿、军事工程、统御、异世界、文明启蒙。',
  '重做千恋万花与黑暗世界：补齐动效、锁死条目外观与手机端适配。',
  '修复文明启蒙等三套皮肤的面板无法上下滑动。',
  '修复老五套皮肤在酒馆自定义样式下的输入框配色。',
  '预设条目改名：仿全知、仿绝望、仿OOC、仿发情、仿冰冷 改为 防全知、防绝望、防OOC、防发情、防冰冷。',
  'MVU zod 脚本默认停用。',
].join('\n');

/* 规范要求：正文里不得出现竖线、花括号、反斜杠 */
const bad = ['|', '{', '}', '\\'].filter(c => BODY.includes(c));
if (bad.length) { console.error('正文含禁用字符：', bad.join(' ')); process.exit(1); }

/* 1. 取 token（不打印） */
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

/* 2. 建 Release（tag 由接口一并创建） */
const r = await fetch(api(`/repos/${OWNER}/${REPO}/releases`), {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: TITLE, body: BODY, draft: false, prerelease: false }),
});
const rel = await r.json();
if (!r.ok) { console.error('建 Release 失败 ' + r.status + '：' + JSON.stringify(rel).slice(0, 300)); process.exit(1); }
console.log('Release 已建：' + rel.html_url + '  (id ' + rel.id + ', tag ' + rel.tag_name + ')');

/* 3. 上传附件 */
const buf = fs.readFileSync(FILE);
const up = await fetch(rel.upload_url.split('{')[0] + '?name=' + encodeURIComponent(ASSET_NAME), {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json', 'Content-Length': String(buf.length) },
  body: buf,
});
const asset = await up.json();
if (!up.ok) { console.error('上传附件失败 ' + up.status + '：' + JSON.stringify(asset).slice(0, 300)); process.exit(1); }
console.log('附件已上传：' + asset.name + '  ' + Math.round(asset.size / 1024) + ' KB');
console.log('下载地址：' + asset.browser_download_url);
