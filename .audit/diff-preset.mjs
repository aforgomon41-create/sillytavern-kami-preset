// 逐条比对两份预设，找出差异（只读）。用法：node .audit/diff-preset.mjs <A> <B>
import fs from 'node:fs';
import crypto from 'node:crypto';
const [A, B] = process.argv.slice(2);
if (!A || !B) { console.error('用法：node .audit/diff-preset.mjs <A> <B>'); process.exit(2); }
const a = JSON.parse(fs.readFileSync(A, 'utf8'));
const b = JSON.parse(fs.readFileSync(B, 'utf8'));
const sha = s => crypto.createHash('sha256').update(String(s ?? '')).digest('hex').slice(0, 8);
const say = (...x) => console.log(...x);

say(`A = ${A}`);
say(`B = ${B}`);
const ka = new Set(Object.keys(a)), kb = new Set(Object.keys(b));
say('\n顶层键：');
say('  A 多出：', [...ka].filter(k => !kb.has(k)).join(', ') || '(无)');
say('  B 多出：', [...kb].filter(k => !ka.has(k)).join(', ') || '(无)');

/* 顶层标量差异 */
say('\n顶层标量差异（长度 < 80 的值）：');
for (const k of kb) {
  if (!ka.has(k)) continue;
  const sa = JSON.stringify(a[k]), sb = JSON.stringify(b[k]);
  if (sa !== sb && sa.length < 80 && sb.length < 80) say(`  ${k}: B=${sb}  →  A=${sa}`);
}

const pa = a.prompts || [], pb = b.prompts || [];
say(`\nprompts：A ${pa.length} 条 / B ${pb.length} 条`);
const ida = pa.map(p => p.identifier), idb = pb.map(p => p.identifier);
say('  顺序一致：', JSON.stringify(ida) === JSON.stringify(idb));
say('  仅 A 有：', ida.filter(i => !idb.includes(i)).slice(0, 10).join(', ') || '(无)');
say('  仅 B 有：', idb.filter(i => !ida.includes(i)).slice(0, 10).join(', ') || '(无)');

const mapB = new Map(pb.map(p => [p.identifier, p]));
const mapA = new Map(pa.map(p => [p.identifier, p]));
say('\n逐条差异（A=用户手改，B=主干）：');
let n = 0;
for (const id of [...new Set([...ida, ...idb])]) {
  const p = mapA.get(id), q = mapB.get(id);
  if (!p) { say(`  [主干有、手改没了] ${q.name}  <${id}>`); n++; continue; }
  if (!q) { say(`  [手改新增] ${p.name}  <${id}>  ${String(p.content || '').length}B`); n++; continue; }
  const d = [];
  if (p.name !== q.name) d.push(`名字：「${q.name}」→「${p.name}」`);
  if (!!p.enabled !== !!q.enabled) d.push(`开关：${q.enabled} → ${p.enabled}`);
  if (p.role !== q.role) d.push(`role：${q.role} → ${p.role}`);
  if (p.injection_position !== q.injection_position) d.push(`注入位置：${q.injection_position} → ${p.injection_position}`);
  if (p.injection_depth !== q.injection_depth) d.push(`注入深度：${q.injection_depth} → ${p.injection_depth}`);
  if (sha(p.content) !== sha(q.content)) {
    const la = String(p.content || '').length, lb = String(q.content || '').length;
    d.push(`正文变了（${lb}B/${sha(q.content)} → ${la}B/${sha(p.content)}，差 ${la - lb > 0 ? '+' : ''}${la - lb}）`);
  }
  if (d.length) { say(`  · ${p.name}  <${id}>`); for (const x of d) say(`      ${x}`); n++; }
}
say(`\n有差异的条目：${n} 条`);
