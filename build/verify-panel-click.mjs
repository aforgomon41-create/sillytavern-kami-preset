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
import fs from 'node:fs';
import path from 'node:path';

const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-panel-click.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = (((preset.extensions || {}).tavern_helper || {}).scripts) || [];
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

/* ③ 模式卡（🎛 [模式切换]）的渲染与联动链路 */
ok(code.indexOf('mode-layer') >= 0, '③ 模式卡的来源标记（mode-layer）在');
ok(code.indexOf('modeEntryIds') >= 0, '③ 认得模式卡里的条目');
ok(code.indexOf('isDialogModeEntry') >= 0 && code.indexOf('DIALOG_MODE_NAME') >= 0, '③ 分得清「剧情游玩」与「对话讨论」');
ok(code.indexOf('enterDialogMode') >= 0 && code.indexOf('leaveDialogMode') >= 0, '③ 进入/退出对话模式两个函数都在');
ok(code.indexOf('dialogSaved') >= 0, '③ 开关快照的存取在（切回时才能恢复）');
ok(code.indexOf('dialogModeTargets') >= 0, '③ 解析器提供的「要关哪些组」被内联进来了');

/* ④ 模式卡的卡片级接线 */
ok(code.indexOf('isModeCard') >= 0 || code.indexOf("'单选'") >= 0, '④ 模式卡走单选语义（选中一个顶掉另一个）');

console.log(bad ? ('\n面板交互接线验证失败：' + bad + ' 处') : '\n面板交互接线验证全部通过');
process.exit(bad ? 1 : 0);