// 调查工具：把最新构建产物的 extensions（regex_scripts + SPreset）抽成探针夹具，
// 供 preview.html 的 ?spreset=1 路径读取（静态服务器只会按文件名取，不提供列目录）。
// 用法：node .audit/make-spreset-fixture.mjs   →  写出 .audit/spreset-fixture.json
// 重新构建出新产物后重跑一次本脚本即可。见 .audit/SPreset冲突调查.md。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(ROOT, 'dist');
let best = null, bestN = -1;
for (const f of fs.readdirSync(dist)) {
  const m = /^(?:kami-|卡密预设)v\d+\.\d+-(\d{1,4})-\d{8}\.json$/i.exec(f);
  if (!m) continue;
  const n = Number(m[1]);
  if (n > bestN) { bestN = n; best = f; }
}
if (!best) { console.error('dist 下没有可用产物'); process.exit(1); }
const preset = JSON.parse(fs.readFileSync(path.join(dist, best), 'utf8'));
const fixture = {
  from: best,
  extensions: {
    regex_scripts: preset.extensions?.regex_scripts ?? [],
    SPreset: preset.extensions?.SPreset ?? null,
  },
};
const out = path.join(ROOT, '.audit', 'spreset-fixture.json');
fs.writeFileSync(out, JSON.stringify(fixture, null, 1), 'utf8');
console.log(`fixture ← ${best}  regex_scripts=${fixture.extensions.regex_scripts.length}  SPreset.regexes=${fixture.extensions.SPreset?.RegexBinding?.regexes?.length ?? '无'}  → ${path.relative(ROOT, out)}`);
