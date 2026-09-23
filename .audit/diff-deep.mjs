// 深度比对两份预设：条目开关（两处）+ 脚本开关 + 正则开关 + 全部设置项（只读）
// 用法：node .audit/diff-deep.mjs <A=用户手改> <B=主干构建>
import fs from 'node:fs';
const [A, B] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(A, 'utf8'));
const b = JSON.parse(fs.readFileSync(B, 'utf8'));
const say = (...x) => console.log(...x);

say('=== 1. prompts[].enabled（条目自带开关）===');
const pb = new Map((b.prompts || []).map(p => [p.identifier, p]));
let n1 = 0;
for (const p of (a.prompts || [])) {
  const q = pb.get(p.identifier);
  if (q && !!p.enabled !== !!q.enabled) { say(`  主干 ${q.enabled} → 手改 ${p.enabled} ｜ ${p.name}`); n1++; }
}
if (!n1) say('  （无差异）');

say('\n=== 2. prompt_order[].character_list[].enabled（卡片里的开关，与上者独立）===');
const walk = (o, path = '', out = []) => {
  if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k, out);
  return out;
};
const ordA = new Map(), ordB = new Map();
for (const po of (a.prompt_order || [])) for (const c of (po.character_list || [])) ordA.set(c.identifier, !!c.enabled);
for (const po of (b.prompt_order || [])) for (const c of (po.character_list || [])) ordB.set(c.identifier, !!c.enabled);
const nameOf = new Map((a.prompts || []).map(p => [p.identifier, p.name]));
let n2 = 0;
for (const [id, va] of ordA) { if (ordB.has(id) && ordB.get(id) !== va) { say(`  主干 ${ordB.get(id)} → 手改 ${va} ｜ ${nameOf.get(id) || id}`); n2++; } }
say(`  character_list 条数：手改 ${ordA.size} / 主干 ${ordB.size}`);
if (!n2) say('  （无差异）');

say('\n=== 3. 顺序差异（prompt_order 的 identifier 序列）===');
const seqA = (a.prompt_order || []).map(po => (po.character_list || []).map(c => c.identifier).join(','));
const seqB = (b.prompt_order || []).map(po => (po.character_list || []).map(c => c.identifier).join(','));
say('  一致：', JSON.stringify(seqA) === JSON.stringify(seqB));

say('\n=== 4. 酒馆助手脚本开关 ===');
const sA = a.extensions?.tavern_helper?.scripts || [];
const sB = b.extensions?.tavern_helper?.scripts || [];
say(`  脚本条数：手改 ${sA.length} / 主干 ${sB.length}`);
const byName = new Map(sB.map(s => [s.name, s]));
let n4 = 0;
for (const s of sA) {
  const q = byName.get(s.name);
  if (!q) { say(`  [手改独有] ${s.name}`); n4++; continue; }
  if (!!s.enabled !== !!q.enabled) { say(`  主干 ${!!q.enabled} → 手改 ${!!s.enabled} ｜ ${s.name}`); n4++; }
}
if (!n4) say('  （无差异）');

say('\n=== 5. 正则脚本开关 ===');
const rA = a.extensions?.regex_scripts || [];
const rB = b.extensions?.regex_scripts || [];
say(`  正则条数：手改 ${rA.length} / 主干 ${rB.length}`);
const rByName = new Map(rB.map(r => [r.scriptName, r]));
let n5 = 0;
for (const r of rA) {
  const q = rByName.get(r.scriptName);
  if (!q) { say(`  [手改独有] ${r.scriptName}`); n5++; continue; }
  if (!!r.disabled !== !!q.disabled) { say(`  主干 disabled=${!!q.disabled} → 手改 disabled=${!!r.disabled} ｜ ${r.scriptName}`); n5++; }
}
if (!n5) say('  （无差异）');

say('\n=== 6. 其余设置项差异（排除 prompt/prompt_order/extensions 大块）===');
const skip = new Set(['prompts', 'prompt_order', 'extensions']);
for (const k of Object.keys(a)) {
  if (skip.has(k)) continue;
  const sa = JSON.stringify(a[k]), sb = JSON.stringify(b[k]);
  if (sa !== sb) {
    const t = s => (s === undefined ? '(缺)' : s.length > 100 ? s.slice(0, 100) + '…' : s);
    say(`  ${k}: 主干 ${t(sb)} → 手改 ${t(sa)}`);
  }
}
say('\n=== 7. extensions 里除脚本/正则之外的差异 ===');
const ea = a.extensions || {}, eb = b.extensions || {};
const sub = new Set([...Object.keys(ea), ...Object.keys(eb)]);
for (const k of sub) {
  if (k === 'tavern_helper' || k === 'regex_scripts') continue;
  const sa = JSON.stringify(ea[k]), sb = JSON.stringify(eb[k]);
  if (sa !== sb) say(`  extensions.${k}: ${(sb || '(缺)').slice(0, 90)} → ${(sa || '(缺)').slice(0, 90)}`);
}
