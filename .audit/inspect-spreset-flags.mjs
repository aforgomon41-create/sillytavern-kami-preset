// 调查探针：对比 src/preset.base.json 与最新 dist 产物里 SPreset 各模块的开关状态，
// 以及两条前端正则的原始字段。只读不改。用法：node .audit/inspect-spreset-flags.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
/* 取 dist 里最新的一份产物（别写死版本，升版本后这里不用改）。
   ⚠️ 构建号自 2026-09-25 起按版本各自计数（升版本重置），所以先比版本号再比构建号。 */
const NAMED = /^kami-v(\d+\.\d+)-(\d{1,4})-\d{8}\.json$/i;
const distFile = fs.readdirSync(path.join(ROOT, 'dist'))
  .filter(f => NAMED.test(f))
  .sort((a, b) => {
    const ma = NAMED.exec(a), mb = NAMED.exec(b);
    const va = ma[1].split('.').map(Number), vb = mb[1].split('.').map(Number);
    if (va[0] !== vb[0]) { return vb[0] - va[0]; }
    if (va[1] !== vb[1]) { return vb[1] - va[1]; }
    return Number(mb[2]) - Number(ma[2]);
  })[0];
const dist = read(path.join(ROOT, 'dist', distFile));
const base = read(path.join(ROOT, 'src', 'preset.base.json'));
for (const [tag, j] of [['base', base], ['dist', dist]]) {
  const s = j.extensions?.SPreset;
  const cnt = (o) => (!o || typeof o !== 'object') ? 0 : Object.keys(o).length;
  console.log(`${tag}: enabled=${s?.ChatSquash?.enabled} forced=${s?.ForcedPostProcessing?.enabled}/${s?.ForcedPostProcessing?.mode} outPrep=${s?.OutputPreprocessing?.enabled} macro=${s?.MacroNest} fixedName='${s?.FixedPresetName}' tools=${cnt(s?.ToolBindings)} inj=${cnt(s?.MessageInjections)} regexes=${s?.RegexBinding?.regexes?.length}`);
}
for (const r of dist.extensions.regex_scripts) {
  if (!/前端|frontend/.test(String(r.scriptName))) continue;
  console.log(`${r.scriptName}: ${String(r.replaceString || '').length}B disabled=${r.disabled} minDepth=${r.minDepth} markdownOnly=${r.markdownOnly} promptOnly=${r.promptOnly} placement=${JSON.stringify(r.placement)} target=${r.target}`);
}
console.log('base 中 SPreset.RegexBinding.regexes 与 dist regex_scripts 的 id 差异：');
const ids = (list) => (list || []).map((r) => r.id + ':' + r.scriptName);
const a = base.extensions.SPreset.RegexBinding.regexes.map(r => r.scriptName);
const b = dist.extensions.regex_scripts.map(r => r.scriptName);
console.log('base:', a.join(' | '));
console.log('dist:', b.join(' | '));
