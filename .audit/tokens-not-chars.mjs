/* 把预设里的「字数要求」改成「token 量要求」（用户 2026-09-27 点名）。
   用法：node .audit/tokens-not-chars.mjs [--check]
     · 默认写盘；--check 只报告要改哪些地方，不写。
   纪律（照本项目的老规矩）：
     · 每一处替换都**必须恰好命中一次**，0 次或多次直接中止，绝不猜；
     · 只改这几个条目，别的一个字不动；
     · 改完打印「条目 → 旧 → 新」，便于人工核对。
   换算：**1 汉字 ≈ 0.8 token**（o200k / cl100k 对中文的常见区间 0.7–1.0 取中）。
   于是原来的 1500–3000 字 ≈ 1200–2400 token，篇幅观感不变。 */
import fs from 'node:fs';

const FILE = process.cwd() + '/src/preset.base.json';
const CHECK = process.argv.includes('--check');
const raw = fs.readFileSync(FILE, 'utf8');
const preset = JSON.parse(raw);
const prompts = preset.prompts || [];
const byId = (id) => prompts.find(p => p.identifier === id);
function byName(kw) {
  const hit = prompts.filter(p => String(p.name || '').indexOf(kw) >= 0);
  if (hit.length !== 1) { throw new Error('条目「' + kw + '」命中 ' + hit.length + ' 个，无法确定改哪个'); }
  return hit[0];
}

const ID_VAR = 'prompt_1788363595936_1f5wx8e';        // 🧩 正文字数 | var
const ID_SPEC = 'prompt_1788364276043_04lx6bt';       // 📌 输出规范
const ID_DS = 'prompt_1789199973145_mdjojp9';         // 🐋 DeepSeek强强
const ID_GLM = 'a26b37fc-66f3-4212-8f8e-c6441ae3cf45'; // 💤 GLM偷偷
const ID_GEM = '18d441df-d6b6-4072-bdff-165d7eea0bda'; // 🐱 Gemini糖糖（本轮残留检查才发现的第三份）

const edits = [];
function sub(entry, from, to, why) {
  const c = String(entry.content || '');
  const n = c.split(from).length - 1;
  if (n !== 1) { throw new Error('【' + entry.name + '】里这段出现 ' + n + ' 次（必须恰好 1 次）：' + JSON.stringify(from.slice(0, 60))); }
  entry.content = c.split(from).join(to);
  edits.push({ entry: entry.name, why: why, from: from, to: to });
}

const eV = byId(ID_VAR), eS = byId(ID_SPEC), eD = byId(ID_DS), eG = byId(ID_GLM), eM = byId(ID_GEM);
for (const [id, e] of [[ID_VAR, eV], [ID_SPEC, eS], [ID_DS, eD], [ID_GLM, eG], [ID_GEM, eM]]) {
  if (!e) { throw new Error('找不到条目 ' + id); }
}

/* ① 变量条目：名字、注释、变量名与默认值 */
eV.name = '🧩 正文token量 | var';
sub(eV, '{{//设定正文的目标字数范围，供 AI 把控回复篇幅；仅作参考提示，对实际生成长度无强制约束。}}',
  '{{//设定正文的目标 token 量范围，供 AI 把控回复篇幅；仅作参考提示，对实际生成长度无强制约束。' +
  '按 1 汉字约等于 0.8 token 折算，1200-2400 token 大致等于过去写的 1500-3000 字。}}', '变量条目注释');
sub(eV, '{{setvar::content_word_count_min::1500}}', '{{setvar::content_token_min::1200}}', '变量改名 + 默认值');
sub(eV, '{{setvar::content_word_count_max::3000}}', '{{setvar::content_token_max::2400}}', '变量改名 + 默认值');

/* ② 输出规范：步骤标记改 token；§3 输出约束规则**新增一条**；模板示例跟着改 */
sub(eS, '- 格式：`<!-- 步骤[序号]/字数[该步骤字数] -->`',
  '- 格式：`<!-- 步骤[序号]/Token[该步骤预估 token 量] -->`', '步骤标记格式');
sub(eS, '- 示例：`<!-- 步骤1/字数500 -->`', '- 示例：`<!-- 步骤1/Token400 -->`', '步骤标记示例');
sub(eS, `4. 前/后处理节点灵活性：
   - \`<introduction>\` 如果没有明确声明要生成在其内的任务，则**必须在其内生成且只能生成<!-- 奈亚子做前锋了~ -->**
   - \`<appendix>\` 如果没有明确声明要生成在其内的任务，则**必须在其内生成且只能生成<!-- 奈亚子要殿后了~ -->**`,
  `4. 前/后处理节点灵活性：
   - \`<introduction>\` 如果没有明确声明要生成在其内的任务，则**必须在其内生成且只能生成<!-- 奈亚子做前锋了~ -->**
   - \`<appendix>\` 如果没有明确声明要生成在其内的任务，则**必须在其内生成且只能生成<!-- 奈亚子要殿后了~ -->**
5. 正文篇幅（按 token 计量，不按汉字个数）：\`<content>\` 内的**文字性内容**（自然叙述、对白、心理描写等；\`<image>\` 与 \`<medium>\` 等组件块内的字符不计入）合计必须落在 {{getvar::content_token_min}} 到 {{getvar::content_token_max}} token 之间。规划"最终线路"时、以及正文写完后自检时，都以此为准。`,
  '§3 新增第 5 条（正文 token 量要求，用 getvar）');
sub(eS, '<!-- 步骤1/字数400 -->', '<!-- 步骤1/Token320 -->', '模板示例步骤1');
sub(eS, '<!-- 步骤2/字数350 -->', '<!-- 步骤2/Token280 -->', '模板示例步骤2');

/* ③ DeepSeek / GLM / Gemini 三份思考脚本：步骤预估、字数检查、步骤注释
   （第三份是残留检查抓出来的 —— 只按印象改会漏） */
for (const e of [eD, eG, eM]) {
  sub(e, '每个步骤需规划预估字数', '每个步骤需规划预估 token 量', '步骤预估改 token');
  sub(e, '- 步骤1（字数：...）：...', '- 步骤1（Token：...）：...', '步骤行');
  sub(e, '- 步骤2（字数：...）：...', '- 步骤2（Token：...）：...', '步骤行');
  sub(e, '- 字数检查：...（要求的正文字数是{{getvar::content_word_count_min}}到{{getvar::content_word_count_max}}字，',
    '- Token检查：...（要求的正文文字量是{{getvar::content_token_min}}到{{getvar::content_token_max}} token，',
    '字数检查行 → token 检查');
  sub(e, '内的所有字符准不计算在正文字数内）', '内的所有字符均不计入正文 token 量）',
    '同一行的尾巴（顺手修掉「准不计算」这个错字）');
  sub(e, '<!-- 步骤**/字数** -->', '<!-- 步骤**/Token** -->', '正文里的步骤注释');
}

/* ④ 摘要：两处长度要求 */
const eSum = byName('摘要(小总结)');
sub(eSum, '[60-100字的叙述式总结,', '[50-80 token 的叙述式总结,', '摘要长度要求');
sub(eSum, '- 总长度控制在150-200字', '- 总长度控制在120-160 token', '摘要总长要求');

/* ---------- 报告 ---------- */
console.log('=== 字数要求 → token 量要求（' + edits.length + ' 处） ===');
for (const e of edits) {
  console.log('  [' + e.entry + '] ' + e.why);
  console.log('      - ' + e.from.replace(/\n/g, ' ⏎ ').slice(0, 110));
  console.log('      + ' + e.to.replace(/\n/g, ' ⏎ ').slice(0, 110));
}

/* 残留检查：正文要求里不该再有「字数」二字（微标签那两处是有意留的） */
const KEEP = ['🔠 行动选项', '🎨 文生图'];
const left = [];
for (const p of prompts) {
  if (KEEP.indexOf(String(p.name)) >= 0) { continue; }
  const c = String(p.content || '');
  const re = /(正文字数|目标字数|预估字数|字数检查|步骤\d*\/字数|总长度控制在[0-9]+-[0-9]+字|[0-9]+-[0-9]+字的)/g;
  const m = c.match(re);
  if (m) { left.push(p.name + ' → ' + Array.from(new Set(m)).join('、')); }
}
console.log('');
console.log('=== 残留的字数要求（' + left.length + ' 处，应为 0） ===');
left.forEach(l => console.log('  ★ ' + l));
console.log('（有意保留的微标签：' + KEEP.join('、') + ' —— 四个字的标题用 token 计量没有意义）');

if (left.length) { console.error('还有残留，先处理再写盘。'); process.exit(1); }
if (CHECK) { console.log('\n（--check：未写盘）'); process.exit(0); }

fs.writeFileSync(FILE, JSON.stringify(preset, null, 2) + '\n', 'utf8');
console.log('\n已写盘：' + FILE);
