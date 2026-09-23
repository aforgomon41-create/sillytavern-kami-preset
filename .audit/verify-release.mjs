// 端到端验证：拿真实 Releases 接口，跑更新脚本里那套「挑附件 + 解析版本」的逻辑
const OWNER = 'aforgomon41-create', REPO = 'sillytavern-kami-preset';
const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kami-verify' },
});
const list = await r.json();
console.log('HTTP ' + r.status + '，共 ' + list.length + ' 个 Release');

/* 与 src/scripts/70-远程更新.js 里的 parseVersion 逐字同源 */
const clean = (s) => String(s == null ? '' : s).trim();
function parseVersion(name) {
  const str = clean(name);
  let m = /(?:kami-|卡密预设)?v(\d+)\.(\d+)-(\d+)-(\d{8})(?:\D|$)/i.exec(str);
  if (m) return { major: +m[1], minor: +('0.' + m[2]), build: +m[3], date: m[4], raw: str };
  m = /(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d+)(?:\D|$)/i.exec(str);
  if (m) return { major: 0, minor: 0.9, build: +m[1], date: '', raw: str };
  return null;
}
const label = (v) => v ? ('v' + v.major + '.' + (v.minor === 0.9 ? '90' : String(v.minor).slice(2)) + '-' + v.build) : '';

for (const rel of list) {
  if (rel.draft) continue;
  const assets = (rel.assets || []).filter(a => /\.json$/i.test(clean(a.name)));
  if (!assets.length) continue;
  let pick = assets.find(a => /^(?:kami-|卡密预设)/i.test(a.name)) || assets.find(a => parseVersion(a.name)) || assets[0];
  const v = parseVersion(pick.name) || parseVersion(rel.tag_name) || parseVersion(rel.name);
  console.log('  挑中附件：' + JSON.stringify(pick.name));
  console.log('  解析版本：' + (v ? label(v) + '（构建号 ' + v.build + '）' : '解析失败'));
  console.log('  下载地址：' + pick.browser_download_url);
  console.log('  → 用户端会看到的更新提示：' + (v ? '有新版 ' + label(v) : '无法判断'));
  break;
}
