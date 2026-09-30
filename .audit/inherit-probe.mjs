// 「继承旧预设设置」把结果覆盖回当前预设之前，先看清合并结果到底长什么样：
//   ① merged.name 是谁的名字？（覆盖回活设置时它会不会把当前预设改名）
//   ② 除了名字，还有哪些顶层字段被 theirs（旧预设）改掉了
//   ③ 典型场景下 plan.conflicts 有多少（= 会不会问用户）
import fs from 'node:fs';
import { computeMergePlan, applyMergePlan } from '../src/scripts/_preset-merge.js';

const cur = JSON.parse(fs.readFileSync('src/preset.base.json', 'utf8'));
// 旧预设：模拟用户改过两条条目 + 关了一枚开关 + 加了点自己的东西
const old = JSON.parse(JSON.stringify(cur));
const p1 = old.prompts.find(p => typeof p.content === 'string' && p.content.length > 60);
p1.content += '（用户手改）';
const p2 = old.prompts.filter(p => typeof p.content === 'string' && p.content.length > 60)[3];
p2.content += '（用户也手改）';
const ord = (old.prompt_order || []).find(o => o.character_id === 100001) || (old.prompt_order || [])[0];
const firstOn = ord.order.find(x => x.enabled !== false);
firstOn.enabled = false;

for (const [label, base] of [['退化模式（base = null）', null], ['正常模式（base = 旧预设原件）', JSON.parse(JSON.stringify(cur))]]) {
  const plan = computeMergePlan(base, old, cur);
  const applied = applyMergePlan(base, old, cur, plan);
  const merged = applied.merged;
  console.log('\n=== ' + label + ' ===');
  console.log('conflicts =', plan.conflicts.length, '| added =', plan.stats.added, '| applied =', plan.stats.applied);
  console.log('merged.name =', JSON.stringify(merged.name), '| next.name =', JSON.stringify(cur.name), '| theirs.name =', JSON.stringify(old.name));
  const diff = [];
  for (const k of Object.keys(merged)) {
    if (JSON.stringify(merged[k]) !== JSON.stringify(cur[k])) { diff.push(k); }
  }
  console.log('与「当前预设」不同的顶层字段：', diff.join(', ') || '（无）');
  for (const k of diff) {
    if (k === 'prompts' || k === 'prompt_order' || k === 'extensions') { continue; }
    console.log('   ' + k + '：当前=' + JSON.stringify(cur[k]) + '  →  合并后=' + JSON.stringify(merged[k]));
  }
  console.log('被用户手改的那条回来了吗：', String(merged.prompts.find(p => p.identifier === p1.identifier).content).includes('（用户手改）'));
  console.log('用户关掉的那枚开关：', (merged.prompt_order[0].order.find(x => x.identifier === firstOn.identifier) || {}).enabled);
}
