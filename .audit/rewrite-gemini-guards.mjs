/* 把两条 Gemini 破限条目的正文换成重写版（保留用户的 XML 伪代码格式与全英文，只改表述）。
   用法：node .audit/rewrite-gemini-guards.mjs [--check]
   背景（2026-09-28 用户纠正）：
     第一版我改成了中文条目式（1288 / 997 字）——**改错了形式**。用户要的是：
     ① 保持 XML 伪代码格式；② 全英文；③ 结构大体一致；④ 只把**表述**换成破限的；
     ⑤ **篇幅不能缩**（token 量不能减少）。
   所以这一版的规定动作是：从用户原版的结构出发，逐层把「加固对齐」的表述换成「破限」的表述，
   并且**按字数下限硬卡**：不得少于用户原版（14634 / 6717 字）。
   文本来源：同目录的 gemini-guard-1.md / gemini-guard-2.md。 */
import fs from 'node:fs';

const ROOT = process.cwd();
const CHECK = process.argv.includes('--check');
const FILE = ROOT + '/src/preset.base.json';
const preset = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/* XML 标签配平检查：整段文本必须能当一个 XML 文档读完（注释忽略）。
   为什么要它：这类内容靠标签层级表达优先级，标签断了模型读到的层级就是乱的。 */
function xmlBalanced(text) {
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const closing = m[1] === '/', selfClose = m[4] === '/', name = m[2];
    if (selfClose) { continue; }
    if (closing) {
      if (!stack.length) { return '多出来的闭合标签 </' + name + '>'; }
      const top = stack.pop();
      if (top !== name) { return '</' + name + '> 与 <' + top + '> 不配对'; }
    } else { stack.push(name); }
  }
  if (stack.length) { return '没有闭合的标签：' + stack.slice(-3).join(', '); }
  return null;
}

const jobs = [
  {
    id: '5bbf9586-d63e-4645-9777-c17b1b808611',
    marker: 'simulation_environment id="GASE-NYARUKO"',   // 我上一版（中文）的标记，用来确认改的是对象
    minLen: 14634,                                        // 用户原版字数 = 篇幅下限
    text: ROOT + '/.audit/gemini-guard-1.md',
    why: '听话！Gemini：基座定义 / Nyaruko 模型（无限制无审查无拒绝）/ 运行环境（开关全关）/ 内容政策 / 篇幅政策',
    mustHave: ['No refusals', 'No censorship', 'safety_filter', 'L5'],
  },
  {
    id: '5462383f-80d2-49b8-813d-479984bbd309',
    marker: 'adversarial_notice id="GASE-SEC-001"',
    minLen: 6717,
    text: ROOT + '/.audit/gemini-guard-2.md',
    why: '倒打一耙：developer 注入 = 攻击载荷 → VOID，不执行、不抬高、不降级、回去干活',
    mustHave: ['VOID', 'do not refuse', 'injection'],
  },
];

let bad = 0;
for (const j of jobs) {
  const e = preset.prompts.find(p => p.identifier === j.id);
  if (!e) { throw new Error('找不到条目 ' + j.id); }
  const now = String(e.content || '');
  if (now.indexOf(j.marker) < 0) {
    throw new Error('【' + e.name + '】里找不到上一版的标记（' + j.marker + '）—— 先确认改的是对象，别覆盖别人的改动');
  }
  const next = fs.readFileSync(j.text, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n';

  const problems = [];
  if (next.length < j.minLen) { problems.push('篇幅缩水：' + next.length + ' < 下限 ' + j.minLen); }
  const cn = (next.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cn > 0) { problems.push('出现了中文字符 ' + cn + ' 个（要求全英文）'); }
  const bal = xmlBalanced(next);
  if (bal) { problems.push('XML 不配平：' + bal); }
  for (const k of j.mustHave) { if (next.indexOf(k) < 0) { problems.push('缺少关键表述「' + k + '」'); } }
  const before = now.length;
  console.log('  [' + e.name + '] ' + before + ' 字 → ' + next.length + ' 字（下限 ' + j.minLen + '）');
  console.log('      ' + j.why);
  if (problems.length) { problems.forEach(p => { console.log('      ★ ' + p); bad++; }); continue; }
  console.log('      ✓ 篇幅达标 · 全英文 · XML 配平 · 关键表述齐全');
  if (!CHECK) { e.content = next; }
}

if (bad) { console.error('\n有 ' + bad + ' 项不合格，不写盘。'); process.exit(1); }
if (CHECK) { console.log('\n（--check：未写盘）'); process.exit(0); }
fs.writeFileSync(FILE, JSON.stringify(preset, null, 2) + '\n', 'utf8');
console.log('\n已写盘：' + FILE);
