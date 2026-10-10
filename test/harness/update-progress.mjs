#!/usr/bin/env node
/**
 * 「远程更新进度」纯逻辑单测（离线，不需要酒馆、不需要网络）
 * 用法：node test/harness/update-progress.mjs
 *
 * 覆盖用户点名的四个边界：总长为 0、长度未知、下载到一半失败、连点确定。
 * 加载方式与构建期同一条路（去行首 export 后 eval）。
 */
import { readFileSync } from 'node:fs';
const NAMES = ['UPDATE_COPY', 'UPDATE_STAGES', 'stageOrder', 'formatBytes', 'percentOf',
  'newProgress', 'beginProgress', 'enterStage', 'setTotal', 'addBytes',
  'failProgress', 'doneProgress', 'viewOf'];
const src = readFileSync(new URL('../../src/scripts/_update-progress.js', import.meta.url), 'utf8')
  .split('\n').map(l => (l.slice(0, 7) === 'export ') ? l.slice(7) : l).join('\n');
const M = new Function(src + '\nreturn {' + NAMES.map(n => n + ': ' + n).join(', ') + '};')();

let pass = 0, fail = 0; const bad = [];
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return; }
  fail++; bad.push(label + '\n    期望：' + JSON.stringify(b) + '\n    实际：' + JSON.stringify(a));
}
const ok = (c, label) => eq(!!c, true, label);

/* ── ① 字节格式化：不许只给字节数 ── */
{
  eq(M.formatBytes(0), '0 B', '① 0 字节');
  eq(M.formatBytes(512), '512 B', '① 不到 1 KB 报 B');
  eq(M.formatBytes(1024), '1.0 KB', '① 1 KB');
  eq(M.formatBytes(690287), '674 KB', '① 实测那个压缩后的 690287 → KB');
  eq(M.formatBytes(3464106), '3.3 MB', '① 实测那个解压后的 3464106 → MB');
  eq(M.formatBytes(1024 * 1024 * 1024), '1.00 GB', '① GB');
  eq(M.formatBytes(-5), '0 B', '① 负数不炸');
  eq(M.formatBytes(NaN), '0 B', '① NaN 不炸');
  eq(M.formatBytes(undefined), '0 B', '① undefined 不炸');
  ok(M.formatBytes(3464106).indexOf('MB') >= 0, '① 数字后面带单位，不是光秃秃的字节');
}

/* ── ② 百分比：总长未知 / 为 0 一律返回 null，不许假装有百分比 ── */
{
  eq(M.percentOf(50, 100), 50, '② 正常一半');
  eq(M.percentOf(100, 100), 100, '② 下满');
  eq(M.percentOf(0, 100), 0, '② 一个字节没下 = 0%');
  eq(M.percentOf(50, 0), null, '② **总长为 0 → null**（不是 0%，也不是 NaN）');
  eq(M.percentOf(50, null), null, '② **长度未知 → null**');
  eq(M.percentOf(50, undefined), null, '② undefined → null');
  eq(M.percentOf(50, NaN), null, '② NaN → null');
  eq(M.percentOf(50, -1), null, '② 负数总长 → null');
  eq(M.percentOf(120, 100), 100, '② 超出总量也封顶 100，不显示 120%');
  eq(M.percentOf(690287, 3464106) < 20, true,
    '② 实测那个坑：拿压缩后的 content-length 当分母，下完只显示 20% —— 所以不能用它');
}

/* ── ③ 阶段状态机 ── */
{
  eq(M.UPDATE_STAGES.map(s => s.id), ['check', 'download', 'verify', 'merge', 'write', 'done'],
    '③ 阶段按现有实现如实排列');
  const p = M.newProgress(1000);
  eq(p.stage, 'check', '③ 起点是检查');
  eq(p.status, 'running', '③ 起点是进行中');
  M.enterStage(p, 'download', 1100); eq(p.stage, 'download', '③ 推进到下载');
  M.enterStage(p, 'verify', 1200); eq(p.stage, 'verify', '③ 推进到校验');
  M.enterStage(p, 'download', 1300); eq(p.stage, 'verify', '③ **不许倒退**（从校验退不回下载）');
  M.enterStage(p, 'nope', 1400); eq(p.stage, 'verify', '③ 不认识的阶段不生效');
  M.enterStage(p, 'download', 1500); eq(p.stage, 'verify', '③ 任何倒退都不生效，没有例外');
  /* 重试不需要倒退：beginProgress 会把阶段重置回 check，再正常往前走 */
  const q = M.newProgress(0);
  M.beginProgress(q, 0); M.enterStage(q, 'write', 10);
  eq(q.stage, 'write', '③ 推到写入');
  M.failProgress(q, '写盘失败', 20); M.beginProgress(q, 30);
  eq(q.stage, 'check', '③ 重试后阶段重置回 check（不是往回跳，是重新开始）');
  eq(M.enterStage(q, 'download', 40), true, '③ 重试后能正常往前推到下载');
  /* 结束之后不许再推 */
  M.doneProgress(p, 'v9', 2000);
  M.enterStage(p, 'write', 2100); eq(p.stage, 'done', '③ 已经完成就不再接受阶段推进');
}

/* ── ④ 连点确定 ── */
{
  const p = M.newProgress(0);
  eq(M.beginProgress(p, 100), true, '④ 第一次点确定：启动');
  eq(p.attempts, 1, '④ 记一次尝试');
  eq(M.beginProgress(p, 200), false, '④ **连点确定：第二次被挡住**');
  eq(p.attempts, 1, '④ 被挡住时不增加尝试次数');
  eq(p.startedAt, 100, '④ 被挡住时不重置开始时间');
  /* 失败之后可以重试 */
  M.failProgress(p, '网络断了', 300);
  eq(p.running, false, '④ 失败后不再占着"正在跑"');
  eq(M.beginProgress(p, 400), true, '④ 失败后允许重试');
  eq(p.attempts, 2, '④ 重试算第二次尝试');
  eq(p.status, 'running', '④ 重试后回到进行中');
  eq(p.received, 0, '④ 重试要把已下载字节清零（不从上次的半截接着算）');
  eq(p.error, null, '④ 重试要把上一次的错误清掉');
}

/* ── ⑤ 下载到一半失败 ── */
{
  const p = M.newProgress(0);
  M.beginProgress(p, 0);
  M.enterStage(p, 'download', 0);
  M.setTotal(p, 3464106, 'manifest');
  M.addBytes(p, 1000000);
  M.addBytes(p, 500000);
  M.addBytes(p, -5);            /* 非法值不许倒扣 */
  eq(p.received, 1500000, '⑤ 非法字节数不加也不减');
  const half = M.viewOf(p);
  eq(half.percent > 43 && half.percent < 44, true, '⑤ 下到一半：百分比约 43%');
  eq(half.indeterminate, false, '⑤ 有总量时不是不确定进度');
  ok(half.bytesText.indexOf('1.4 MB') >= 0 && half.bytesText.indexOf('3.3 MB') >= 0,
    '⑤ 文案里已下载/总量都是人类可读单位');
  M.failProgress(p, '下载中途网络断了', 9000);
  const f = M.viewOf(p);
  eq(f.status, 'failed', '⑤ **失败后状态是 failed**（弹窗要留在原地）');
  eq(f.error, '下载中途网络断了', '⑤ 失败原因保留着，给人话');
  eq(p.received, 1500000, '⑤ 失败时**已下载的字节保留**，不清零（让人看出下到哪儿断的）');
  eq(f.canRetry, true, '⑤ **失败时提供重试**');
  eq(f.canClose, true, '⑤ 失败时也允许关闭（但绝不自动关）');
  eq(f.stageText, M.UPDATE_COPY.stageFailed, '⑤ 阶段文字切成失败态');
}

/* ── ⑥ 长度未知：不确定进度 ── */
{
  const p = M.newProgress(0);
  M.beginProgress(p, 0);
  M.enterStage(p, 'download', 0);
  eq(M.setTotal(p, 0, 'manifest'), false, '⑥ 总量传 0 = 当成未知，不当成"总量为 0"');
  eq(p.total, null, '⑥ 总量留在 null');
  M.addBytes(p, 250000);
  const v = M.viewOf(p);
  eq(v.percent, null, '⑥ **长度未知 → 百分比是 null**，不许假装有');
  eq(v.indeterminate, true, '⑥ 明确标成不确定进度（界面显示转圈）');
  ok(v.bytesText.indexOf('250 KB') >= 0 || v.bytesText.indexOf('244 KB') >= 0, '⑥ 仍然报已下载字节，不是什么都不显示');
  eq(v.detail, M.UPDATE_COPY.indeterminate, '⑥ 有"总大小未知"的说明文案');
}

/* ── ⑦ 完成态 ── */
{
  const p = M.newProgress(0);
  M.beginProgress(p, 0);
  M.enterStage(p, 'download', 0);
  M.setTotal(p, 3464106, 'manifest');
  M.addBytes(p, 3464106);
  eq(M.viewOf(p).percent, 100, '⑦ 下满 = 100%');
  M.doneProgress(p, 'v0.91-111', 5000);
  const v = M.viewOf(p);
  eq(v.status, 'done', '⑦ 完成态');
  eq(v.stage, 'done', '⑦ 阶段是 done');
  eq(v.canRetry, false, '⑦ 成功后不给重试按钮');
  eq(v.canClose, true, '⑦ 成功后可以关');
  eq(v.detail, M.UPDATE_COPY.doneHint, '⑦ 完成提示');
}

/* ── ⑧ 文案集中在一个对象里，且键都在 ── */
{
  ok(M.UPDATE_COPY && typeof M.UPDATE_COPY === 'object', '⑧ 文案是一个对象（等文案 Agent 出稿）');
  for (const k of ['title', 'stageCheck', 'stageDownload', 'stageVerify', 'stageMerge', 'stageWrite',
                   'stageDone', 'stageFailed', 'bytesOf', 'bytesOnly', 'indeterminate', 'retry', 'close',
                   'doneHint', 'retryHint', 'dupGuard']) {
    ok(typeof M.UPDATE_COPY[k] === 'string' && M.UPDATE_COPY[k].length > 0, '⑧ 文案键 ' + k + ' 在');
  }
  ok(M.UPDATE_COPY.bytesOf.indexOf('{done}') >= 0 && M.UPDATE_COPY.bytesOf.indexOf('{total}') >= 0,
    '⑧ bytesOf 用占位符，实现不自己拼文案');
  /* 阶段与文案一一对应，没有漏 */
  for (const s of M.UPDATE_STAGES) { ok(typeof M.UPDATE_COPY[s.copy] === 'string', '⑧ 阶段 ' + s.id + ' 有对应文案'); }
}

/* ── ⑨ 内联契约 ── */
{
  const raw = readFileSync(new URL('../../src/scripts/_update-progress.js', import.meta.url), 'utf8');
  ok(raw.indexOf('$') < 0, '⑨ 没有美元符号');
  ok(raw.indexOf('{{') < 0, '⑨ 没有大括号宏');
  ok(raw.indexOf('import ') < 0, '⑨ 没有 import');
  ok(raw.split('\n').filter(l => /^\s+export\s/.test(l)).length === 0, '⑨ 没有缩进的 export');
  ok(raw.indexOf('fetch(') < 0 && raw.indexOf('XMLHttpRequest') < 0, '⑨ 纯逻辑里没有 IO');
}


/* ── ⑩ 2026-10-10 事故的回归断言：进度窗口必须会让位 ──
   事故链条（用户 2026-10-10 报的「传了一个默认关闭预设脚本的版本」）：
     writeMergedFiles → importRawPreset → preset_manager.savePreset → updateList
     → 下拉框 trigger('change') → 酒馆**真的切预设**
     → 酒馆弹「嵌入式正则要不要启用」、酒馆助手弹「嵌入式脚本要不要启用」
     → 那两处都是**先记标记、再弹框**（regex/index.js:1660、use_check_enablement_popup.ts:29）
     → 我们那个居中的不透明进度窗口（z-index 100000）挡着，用户点不到
     → 标记却已写入 → **再也不会问第二次** → 嵌入式脚本永久保持关闭。
   所以：进度窗口必须在"要弹别人家框"之前主动收掉，而且关闭必须可重复调用。 */
{
  const src = readFileSync(new URL('../../src/scripts/70-远程更新.js', import.meta.url), 'utf8');

  ok(/function yieldScreen\(/.test(src), '⑩ 有 yieldScreen（把屏幕让给原生弹窗的统一入口）');
  ok(/progEls = null;[\s\S]{0,40}progRetry = null;/.test(src), '⑩ closeProgress 会清掉引用（可重复调用不炸）');
  ok(/yieldScreen\('马上要写入并触发酒馆切换预设/.test(src),
    '⑩ 三方合并写盘前让位（这一步就在 await 里弹确认框，让晚了没用）');
  ok(/yieldScreen\('马上要整份导入并触发酒馆切换预设/.test(src),
    '⑩ 退化路径（整份导入）也让位');
  ok(/yieldScreen\('要让出屏幕给「更新合并」裁决页'\)/.test(src),
    '⑩ 开「更新合并」裁决页前让位（否则进度窗口压在面板正中间）');
  ok(/yieldScreen\('要让出屏幕给合并裁决的原生弹窗'\)/.test(src),
    '⑩ 原生弹窗兜底路径也让位');

  /* 让位必须发生在写盘调用**之前** —— 顺序反了就等于没修 */
  const atYield = src.indexOf("yieldScreen('马上要写入并触发酒馆切换预设");
  const atWrite = src.indexOf('return writePreset(remote.name, merged, mergedText);');
  ok(atYield >= 0 && atWrite > atYield, '⑩ 让位发生在写盘之前（顺序对了才有效）');

  const atYield2 = src.indexOf("yieldScreen('要让出屏幕给「更新合并」裁决页')");
  const atOpen = src.indexOf('P.openMergeReview(plan,');
  ok(atYield2 >= 0 && atOpen > atYield2, '⑩ 让位发生在打开裁决页之前');
}


/* ── ⑪ 2026-10-11 事故（关闭按钮点了没反应）的回归断言 ── */
{
  const src = readFileSync(new URL('../../src/scripts/70-远程更新.js', import.meta.url), 'utf8');

  /* 变量只能声明一次。2026-10-11 就是声明了两次，后一次执行时把已挂上的
     "点外面也关"的监听器引用冲成 null，功能整个失效。 */
  const decls = (src.match(/var documentTapCloser/g) || []).length;
  eq(decls, 1, '⑪ documentTapCloser 只声明一次（两次会把已挂的监听器冲掉）');

  /* 关闭必须"整屏可关"：不再要求点中按钮。
     2026-10-11 用户报"点了没反应" —— 按钮上挂 click 在手机 WebView 里可能一个都不派发，
     所以改成挂在 document 上，点屏幕任何地方都关。 */
  ok(/for \(var evName of \['pointerdown', 'mousedown', 'click', 'touchend'\]\)/.test(src),
    '⑪ 关闭监听铺四种事件（pointerdown / mousedown / click / touchend）');
  ok(/documentTapCloser = function/.test(src), '⑪ 关闭监听挂在 document 上（不要求点中按钮）');
  ok(/t\.closest && t\.closest\('\.kami-upd-btn'\)/.test(src),
    '⑪ 点按钮也走同一条路（点在窗口里面时只有按钮才算）');
  ok(/hsetTimeout\(function \(\) \{ armed = true; \}, 400\)/.test(src),
    '⑪ 挂监听前先等 400ms（免得打开窗口那一下顺手关掉自己）');
  ok(/for \(var evn of \['pointerdown', 'mousedown', 'click', 'touchend'\]\)/.test(src),
    '⑪ 关窗口时把四个监听都摘掉（否则越挂越多）');

  /* 先清引用再删 DOM：removeChild 抛异常也不能让窗口留在原地 */
  ok(/try \{ closeProgress\(\); \} catch \(e\) \{ warn\('关闭进度窗口出错/.test(src),
    '⑪ 关闭失败也不静默（有 warn 兜底）');

  /* 成功后自动关：不再依赖用户点得准 */
  ok(/更新已完成，自动收起进度窗口/.test(src), '⑪ 更新成功后自动收起');
  ok(/progState && progState\.status === 'done'/.test(src), '⑪ 只在成功时自动关（失败要留着给用户看重试）');

  /* 文案要跟行为一致：既然会自动关，就别再说"可以关闭了" */
  ok(M.UPDATE_COPY.doneHint.indexOf('自动') >= 0, '⑪ 完成文案说明会自动关闭（与行为一致）');
}


/* ── ⑫ 更新说明的加粗记号（2026-10-11 用户要求"公告第一条要用加粗"）──
   弹窗是 escText 转义后再拼 <br> 的，所以公告里**直接写 <b> 没用**（会显示成字面标签）。
   给 notesHtml 加了 \*\*加粗\*\* 记号：转义之后再把记号换成 <b>。
   顺序反了就会被转义掉，所以这里连顺序一起钉住。 */
{
  const src70 = readFileSync(new URL('../../src/scripts/70-远程更新.js', import.meta.url), 'utf8');
  const ls = src70.split(/\r?\n/);
  const grab = (sig) => { const a = ls.findIndex(l => l.startsWith('  function ' + sig)); let b = a; while (b < ls.length && ls[b].replace(/\s+$/, '') !== '  }') b++; return ls.slice(a, b + 1).join('\n'); };
  const NH = new Function(grab('cleanStr(') + '\n' + grab('escText(') + '\n' + grab('notesHtml(') +
    '\nreturn { notesHtml: notesHtml };')();

  eq(NH.notesHtml('**加粗**'), '<b>加粗</b>', '⑫ **x** 渲染成粗体');
  ok(NH.notesHtml('<b>x</b>').indexOf('&lt;b&gt;') >= 0,
    '⑫ 公告里直接写 HTML 标签会被转义成字面（这正是需要记号的原因）');
  eq(NH.notesHtml('a**b\nc**d'), 'a**b<br>c**d', '⑫ 记号不跨行');
  eq(NH.notesHtml('多行\n**第二行**'), '多行<br><b>第二行</b>', '⑫ 加粗与换行共存');
  eq(NH.notesHtml('未配对 *x*'), '未配对 *x*', '⑫ 单个星号不动');

  /* 顺序：先转义、后替换记号。反了记号就会被转义掉 */
  const atEsc = src70.indexOf('var t = escText(notes);');
  const atBold = src70.indexOf("t.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<b>$1</b>')");
  ok(atEsc >= 0 && atBold > atEsc, '⑫ 先转义、后换记号（顺序反了加粗会失效）');
}

console.log((fail ? '✗ ' : '✓ ') + '更新进度纯逻辑：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
