// 用「开关清单」口径复核条目开关（只读）：列出两边被关掉的条目名，直接比集合
import fs from 'node:fs';
const [A, B] = process.argv.slice(2);
const a = JSON.parse(fs.readFileSync(A, 'utf8'));
const b = JSON.parse(fs.readFileSync(B, 'utf8'));
const off = (j) => (j.prompts || []).filter(p => !p.enabled).map(p => `${p.name} <${p.identifier}>`);
const on = (j) => (j.prompts || []).filter(p => p.enabled).length;
console.log(`A（手改）= ${A}\n  条目 ${(a.prompts || []).length} 条，开 ${on(a)}，关 ${(a.prompts || []).length - on(a)}`);
console.log(`B（主干）= ${B}\n  条目 ${(b.prompts || []).length} 条，开 ${on(b)}，关 ${(b.prompts || []).length - on(b)}`);
const oa = new Set(off(a)), ob = new Set(off(b));
const onlyA = [...oa].filter(x => !ob.has(x));
const onlyB = [...ob].filter(x => !oa.has(x));
console.log('\n只有手改关掉的：');
console.log(onlyA.length ? onlyA.map(x => '  ' + x).join('\n') : '  （无）');
console.log('只有主干关掉的：');
console.log(onlyB.length ? onlyB.map(x => '  ' + x).join('\n') : '  （无）');
console.log('\n手改里被关掉的完整清单：');
for (const x of oa) console.log('  ' + x);
