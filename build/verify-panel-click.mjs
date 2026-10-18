#!/usr/bin/env node
/**
 * 面板交互接线守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 为什么要有它：2026-10-14 我在清理临时探针时，用「删掉所有含某标记的行」这种粗暴办法，
 * 把点击委托里的**条目卡分支**整行删掉了 —— 后果是面板上所有条目开关全部失效。
 * 那行恰好和探针写在同一行，所以被一起删掉，构建与全部单测都没报错，一路发到了线上。
 * 教训：**交互接线必须有硬检查**，不能靠人记得。
 *
 * 检查两件事：
 *   ① 点击委托的每个分支都在（少一个就有整类控件点不动）；
 *   ② 模式卡（🎛 [模式切换]）的渲染与联动链路完整。
 *
 * 用法：node build/verify-panel-click.mjs <产物路径>
 */
import { flattenScriptTrees } from './kami-doc.mjs';
import fs from 'node:fs';
import path from 'node:path';

const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-panel-click.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = flattenScriptTrees((((preset.extensions || {}).tavern_helper || {}).scripts) || []);
const panel = scripts.find((s) => String(s.name || '').indexOf('预设设置') >= 0);

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 面板交互接线验证（' + path.basename(p) + '） ===');
ok(!!panel, '① 产物里找得到「预设设置」面板脚本', panel ? String(panel.name).slice(0, 40) : '没有');
if (!panel) { console.log('\n没有面板脚本，后面的检查无从谈起'); process.exit(1); }
const code = String(panel.content || '');
ok(code.length > 10000, '① 面板脚本内容非空', code.length + ' 字');

/* ② 点击委托的每个分支：每一条都对应一类控件，少一条就有一类点不动 */
const BRANCHES = [
  ['条目卡（所有开关）', "t.getAttribute('data-kami-item') && t.tagName === 'BUTTON'", 'toggleItem(t)'],
  ['模型卡片头（切模型）', "t.getAttribute('data-kami-model') && t.tagName === 'BUTTON'", 'selectModel('],
  ['注释标记 ⓘ', "t.getAttribute('data-kami-note-mark')", 'toggleNote(t)'],
  ['tab 切换', "t.getAttribute('data-kami-tab')", 'setTab('],
  ['关闭面板', "t.getAttribute('data-kami-act') === 'close'", 'setOpen(false)'],
  ['检查更新', "t.getAttribute('data-kami-act') === 'check-update'", 'runUpdateCheck('],
  ['合并页一键选边', "t.getAttribute('data-kami-act') === 'merge-all-mine'", 'setMergeAll('],
  ['合并页提交', "t.getAttribute('data-kami-act') === 'merge-apply'", 'applyMergeReview('],
];
for (const [label, needle, action] of BRANCHES) {
  const hasBranch = code.indexOf(needle) >= 0;
  const hasAction = code.indexOf(action) >= 0;
  ok(hasBranch && hasAction, '② 点击委托分支：' + label, hasBranch ? (hasAction ? '齐全' : '缺动作 ' + action) : '**整行不见了**');
}

/* ③ 「🎛 运行模式」层级的接线（2026-10-15 重做：它现在是预设最后面一个**自然层级**，
      解析器照常给它出 tab，面板不需要任何特例。这里查的是「对话模式的特殊逻辑」还在不在）。 */
ok(code.indexOf('DIALOG_MODE_ID') >= 0 && code.indexOf('PLAY_MODE_ID') >= 0, '③ 两个模式条目按 identifier 认（不按中文名）');
ok(code.indexOf('d1a10001-0000-4000-8000-000000000003') >= 0, '③ 「对话讨论」的 id 常量在');
ok(code.indexOf('isModeLayerEntry') >= 0, '③ 只对那一层里的条目触发联动');
ok(code.indexOf('isDialogModeEntry') >= 0, '③ 分得清「剧情游玩」与「对话讨论」');
ok(code.indexOf('enterDialogMode') >= 0 && code.indexOf('leaveDialogMode') >= 0, '③ 进入/退出对话模式两个函数都在');
ok(code.indexOf('dialogSaved') >= 0, '③ 开关快照的存取在（切回时才能恢复）');
ok(code.indexOf('dialogModeTargets') >= 0, '③ 解析器提供的「要关哪些组」被内联进来了');
/* ⚠️ 反向检查：模型 tab 不许再挂模式卡（用户 2026-10-15 明确要求「不要做到模型页」） */
ok(code.indexOf('mode-layer') < 0, '③ 模型 tab 里那个特例已撤掉（不再有 mode-layer 标记）');

/* ④ 产物里「运行模式」必须是一个**自然层级**：有自己的层级标记、有自己的卡片头 */
const pnames = (preset.prompts || []).map((e) => String(e.name || '').trim());
ok(pnames.indexOf('🎛 运行模式\u{1f53b}') >= 0 || pnames.some((n) => n.indexOf('运行模式') === 2 && n.indexOf('\u{1f53b}') > 0),
  '④ 产物里有「🎛 运行模式🔻」层级开标记');
ok(pnames.some((n) => /^🎛\s*\[运行模式\]\s*选一$/.test(n)), '④ 有卡片头「🎛 [运行模式] 选一」（没有它这一层就不出 tab）');
const di = pnames.indexOf('💬 对话讨论');
const pi = pnames.indexOf('🎲 剧情游玩');
ok(di >= 0 && pi >= 0, '④ 两个模式条目都在产物里');
ok(Math.max(di, pi) > pnames.indexOf('🧠 推理选项\u{1f53a}') || pnames.indexOf('🧠 推理选项\u{1f53a}') < 0,
  '④ 运行模式层级排在推理选项**之后**（在预设最下面）');

console.log(bad ? ('\n面板交互接线验证失败：' + bad + ' 处') : '\n面板交互接线验证全部通过');
process.exit(bad ? 1 : 0);