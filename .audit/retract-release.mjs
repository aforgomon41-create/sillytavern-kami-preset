// 撤回一个 Release：删 Release、刷 jsDelivr 清单缓存。token 从凭据管理器取，绝不打印。
// ⚠ 不删 tag：已经更新到这一版的用户，下次更新要从 jsDelivr `@<tag>/mirror/` 取这一版的原始内容当合并的 base；
//   tag 删了、mirror/ 又恢复了，base 两条路都断，合并只能走退化模式（2026-11-15 撤回 v0.93-29 时踩到，事后补回 tag）。
//   更新脚本只看 Releases 列表，不看 tag，留着光 tag 不会被当成新版推送。
// 用法：NODE_USE_ENV_PROXY=1 node .audit/retract-release.mjs v0.93-29   （先把 mirror/ 恢复并推上 main）
import { spawnSync } from 'node:child_process';
const OWNER = 'aforgomon41-create', REPO = 'sillytavern-kami-preset';
const TAG = process.argv[2];
if (!/^v[\d.]+-\d+$/.test(TAG || '')) { console.error('用法：node .audit/retract-release.mjs <tag>'); process.exit(1); }
const cred = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const m = /^password=(.+)$/m.exec(cred.stdout || '');
if (!m) { console.error('拿不到 token'); process.exit(1); }
const H = { Authorization: 'Bearer ' + m[1].trim(), Accept: 'application/vnd.github+json', 'User-Agent': 'kami-preset-release' };
const api = (p) => 'https://api.github.com/repos/' + OWNER + '/' + REPO + p;
const r = await fetch(api('/releases/tags/' + TAG), { headers: H });
if (r.status === 200) {
  const rel = await r.json();
  const d = await fetch(api('/releases/' + rel.id), { method: 'DELETE', headers: H });
  console.log('删 Release ' + rel.id + '：HTTP ' + d.status);
} else { console.log('没有 ' + TAG + ' 的 Release（HTTP ' + r.status + '）'); }
console.log('tag ' + TAG + ' 保留（合并的 base 要用）');
const pj = await (await fetch('https://purge.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@main/mirror/manifest.json')).json();
console.log('jsDelivr 清单缓存刷新：' + pj.status);
const latest = await (await fetch(api('/releases/latest'), { headers: H })).json();
console.log('现在的最新 Release：' + latest.tag_name);
const mj = await (await fetch('https://cdn.jsdelivr.net/gh/' + OWNER + '/' + REPO + '@main/mirror/manifest.json')).json();
console.log('线上清单：' + mj.version + ' ' + mj.file);
