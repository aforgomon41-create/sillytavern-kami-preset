#!/usr/bin/env node
/**
 * 「常驻附加指令」纯逻辑单测（离线，不需要酒馆）
 * 用法：node test/harness/godcmd-pure.mjs
 *
 * 它测的是 src/scripts/_godcmd-pure.js —— 构建期内联进 35-提示词发送修改.js 的那份。
 * 这里只碰纯函数：给一段用户指令与一趟消息数组，看它认不认得出该不该注入、
 * 包出来的形状对不对、同一趟里会不会叠成两段。
 *
 * ⚠️ 这里**不测**接线（事件订阅、原地改 content、面板两个开关）——
 * 那些在产物里，由构建守卫 build/verify-godcmd-pure.mjs 守。
 */
import { buildGodCmdBlock, shouldInject, appendGodCmd } from '../../src/scripts/_godcmd-pure.js';

let pass = 0, fail = 0;
const bad = [];
function eq(actual, expect, label) {
  if (actual === expect) { pass++; return; }
  fail++;
  bad.push(label + '\n    期望：' + JSON.stringify(expect) + '\n    实际：' + JSON.stringify(actual));
}
function ok(cond, label) { eq(!!cond, true, label); }

const TXT = '永远用简体中文回复。';

/* ── ① 空文本：一个字都不许加进提示词 ── */
{
  eq(buildGodCmdBlock(''), '', '① 空串 → 空块');
  eq(buildGodCmdBlock('   '), '', '① 全空白 → 空块');
  eq(buildGodCmdBlock('\n\t '), '', '① 只有换行与制表符 → 空块');
  eq(buildGodCmdBlock(null), '', '① null 不炸');
  eq(buildGodCmdBlock(undefined), '', '① undefined 不炸');
  eq(buildGodCmdBlock(123), '', '① 数字不炸');
  eq(appendGodCmd('正文', ''), '正文', '① 空文本时正文原样');
  eq(appendGodCmd('正文', '   '), '正文', '① 全空白时正文原样');
}

/* ── ② 该不该注入：最后一条必须是 user ── */
{
  eq(shouldInject([{ role: 'user', content: '甲' }]), true, '② 只有一条 user → 注入');
  eq(shouldInject([{ role: 'system', content: '规则' }, { role: 'user', content: '甲' }]), true, '② 系统在前、user 在末 → 注入');
  eq(shouldInject([{ role: 'user', content: '甲' }, { role: 'system', content: '规则' }]), false, '② 末条是 system → 不注入（60-压缩 generateRaw 走这条）');
  eq(shouldInject([{ role: 'user', content: '甲' }, { role: 'assistant', content: '乙' }]), false, '② 末条是 assistant → 不注入');
  eq(shouldInject([{ role: 'system', content: '<summary>…</summary>' }]), false, '② 末条是摘要 system → 不注入');
  eq(shouldInject([]), false, '② 空数组 → 不注入');
  eq(shouldInject(null), false, '② null → 不注入');
  eq(shouldInject(undefined), false, '② undefined → 不注入');
  eq(shouldInject([null]), false, '② 末条是 null → 不注入');
  eq(shouldInject([{ content: '没有 role' }]), false, '② 末条没有 role → 不注入');
  eq(shouldInject(['字符串']), false, '② 末条不是对象 → 不注入');
}

/* ── ③ 正常追加：贴在上一条正文后面，换行隔开 ── */
{
  const one = appendGodCmd('甲', TXT);
  eq(one, '甲\n<god>\n' + TXT + '\n</god>', '③ 一段正文 + 包块');
  eq(one.indexOf('甲') === 0, true, '③ 原正文原样在最前面（不改写用户内容）');
  eq(appendGodCmd('', TXT), '\n<god>\n' + TXT + '\n</god>', '③ 空正文也能包（消息只有 role 没有文字）');
  eq(appendGodCmd('甲\n乙', TXT), '甲\n乙\n<god>\n' + TXT + '\n</god>', '③ 多行正文接在最后一行之后');
}

/* ── ④ 幂等：同一趟里派发两次（dryRun + 真发送）不许叠成两段 ── */
{
  const once = appendGodCmd('甲', TXT);
  const twice = appendGodCmd(once, TXT);
  eq(twice, once, '④ 同样文本再来一次不叠加');
  const many = appendGodCmd(appendGodCmd(appendGodCmd('甲', TXT), TXT), TXT);
  eq(many, once, '④ 连来三次也只一段');
  eq(many.split('<god>').length - 1, 1, '④ 正文里只有一个 <god>');
  eq(appendGodCmd(once, '换一段别的指令').indexOf('换一段别的指令') >= 0, true, '④ 文本改了就追加新块（幂等只认「同样的块」）');
}

/* ── ⑤ <god> 包裹形状：与预设既有语法一致 ── */
{
  const block = buildGodCmdBlock(TXT);
  eq(block.indexOf('\n<god>\n'), 0, '⑤ 块以换行 + <god> + 换行开头（与上文正文隔开，且不是 <god > 变体）');
  eq(block.indexOf('<god>') , 1, '⑤ 开始标签紧跟在那个换行后面（前面没有别的东西）');
  eq(block.slice(-7), '\n</god>', '⑤ 块以换行 + </god> 收尾');
  eq(block.split('<god>').length - 1, 1, '⑤ 只有一个开始标签');
  eq(block.split('</god>').length - 1, 1, '⑤ 只有一个闭合标签');
  eq(block.indexOf(TXT) >= 0, true, '⑤ 用户原文整段在块里');
  eq(/<god>\s/.test(block), true, '⑤ 开始标签后面紧跟换行（模型按行解析时不会把正文粘在标签上）');
}

/* ── ⑥ 文本里含换行 / 特殊字符：原样保留，不做转义 ── */
{
  const multi = '第一条规矩。\n第二条规矩：%s $1 {{宏}} <b>粗体</b> & 符号 \\ 反斜杠 "引号"。';
  const block = buildGodCmdBlock(multi);
  eq(block.indexOf(multi) >= 0, true, '⑥ 多行与特殊字符原样进块');
  const out = appendGodCmd('提问', multi);
  eq(out.indexOf(multi) >= 0, true, '⑥ 追加后特殊字符仍然原样');
  eq(out.slice(-7), '\n</god>', '⑥ 收尾仍然是 </god>');
  eq(out.split('<god>').length - 1, 1, '⑥ 特殊字符没把标签弄坏（正文里没有多余的 <god>）');
  const weird = 'a'.repeat(2000) + '\n<god>藏在正文里的假标签</god>';
  const o2 = appendGodCmd('提问', weird);
  eq(o2.split('</god>').length - 1, 2, '⑥ 正文里自带 </god> 时形状仍然是可预期的（不去猜、不转义）');
}

/* ── ⑦ 调用方要用的那个判断：非 user 结尾 + 空文本的组合 ── */
{
  const chat = [{ role: 'system', content: '规则' }, { role: 'user', content: '甲' }];
  const last = chat[chat.length - 1];
  eq(shouldInject(chat) && buildGodCmdBlock('') === '', true, '⑦ 开关开着但内容为空 → 什么都不会追加（实测组合）');
  eq(shouldInject(chat) && buildGodCmdBlock(TXT) !== '', true, '⑦ 开关开着且有内容 → 会追加');
  const sysChat = [{ role: 'user', content: '甲' }, { role: 'system', content: '规则' }];
  eq(shouldInject(sysChat), false, '⑦ 末条是 system → 即使有内容也不追加');
  eq(last.role, 'user', '⑦ 探针：正常那趟的末条确实是 user');
}

/* ── ⑧ 边界：不改入参、不是字符串的正文不炸 ── */
{
  const src = { role: 'user', content: '甲' };
  const before = JSON.stringify(src);
  appendGodCmd(src.content, TXT);
  eq(JSON.stringify(src), before, '⑧ 本模块不改入参对象（改由调用方原地赋值）');
  eq(appendGodCmd(null, TXT), null, '⑧ content 为 null → 原样返回');
  eq(appendGodCmd(undefined, TXT), undefined, '⑧ content 为 undefined → 原样返回');
  eq(appendGodCmd(123, TXT), 123, '⑧ content 不是字符串 → 原样返回');
}

console.log('=== 「常驻附加指令」纯逻辑单测 ===');
if (bad.length) { console.log(bad.map((b, i) => '  ✗ ' + (i + 1) + '. ' + b).join('\n')); }
console.log('=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
