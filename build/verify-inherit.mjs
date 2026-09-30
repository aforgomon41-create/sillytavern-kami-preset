#!/usr/bin/env node
/**
 * 「继承旧预设设置」守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 用户 2026-09-28 点名：远程更新里的三方合并只服务「点弹窗自动更新」那条路，
 * 可有的用户网络到 GitHub 不通，只能自己下载新版手动导入 —— 那条路不触发合并，
 * 于是他只能把手动改过的东西再设一遍。补救办法是在「ℹ️ 关于」页加一个入口，
 * 挑一份旧预设，把同一台合并引擎再开一次。
 *
 * 这条路最容易出的三种错，本守卫逐条盯死：
 *   ① **另写一台合并引擎**（而不是复用 _preset-merge.js）—— 两份口径迟早分家；
 *   ② **读错 API 拿到空预设** —— getPresetManager('openai').getPresetSettings() 在
 *      preset-manager.js:617 那个 switch 里没有 openai 分支，会返回空对象（40 号有同源血泪注释）；
 *      正路是 getPresetList()，它把 openai_settings 数组原样给出来。
 *   ③ **没备份就覆盖**，或者写盘失败之后内存与磁盘分家（退回动作丢了）。
 *
 * 用法：node build/verify-inherit.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';

const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-inherit.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));

const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const textOf = (kw) => String((scripts.find(s => String(s.name).indexOf(kw) >= 0) || {}).content || '');
const up = textOf('远程更新');
const panel = textOf('预设设置');

/* 去注释后的正文：有几条要判「代码里有没有踩坑」，而注释里正好写着那些坑的名字
   （比如 70 号那段「绝不能走 getPresetSettings」的告警），不去注释会自己把自己判失败。 */
const stripComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const upCode = stripComments(up);
const panelCode = stripComments(panel);

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 继承旧预设设置验证（' + path.basename(p) + '） ===');

/* ① 70 号：接口齐、复用同一台引擎、读对 API、先备份 */
ok(up.indexOf('function inheritFrom') >= 0, '① 70 号里有 inheritFrom');
ok(/otherPresetNames: otherPresetNames/.test(up) && /isKamiName: isKamiName/.test(up) && /inheritFrom: inheritFrom/.test(up),
  '① 三个接口都挂到全局 API 上了（写了不导出等于没有）');
ok(up.indexOf('computeMergePlan(base, theirs, next)') >= 0 && up.indexOf('applyMergePlan(base, theirs, next, chosen.plan)') >= 0,
  '① 用的是**同一台**三方合并引擎（不是另写一套口径）');
ok(upCode.indexOf('getPresetList') >= 0 || upCode.indexOf('openai_settings') >= 0, '① 读旧预设走 getPresetList（openai_settings 那条正路）');
ok(!/getPresetSettings\s*\(/.test(upCode), '① 代码里没有踩 getPresetSettings 那个空对象坑');
ok(/getPresetList\(\)/.test(upCode) && upCode.indexOf('JSON.parse(JSON.stringify(presets[idx]))') >= 0,
  '① 取到后**深拷一份**再用（绝不改内存里那一格）');
ok(up.indexOf('function backupCurrentPreset') >= 0 && /backupCurrentPreset\(next\)/.test(up),
  '① 覆盖当前预设之前先备份（用户点名要的保险）');
ok(/备份当前预设失败[\s\S]{0,120}已经中止/.test(up), '① 备份失败就中止，不硬写');
ok(up.indexOf('plan.inherit = true') >= 0, '① 合并计划上带了 inherit 标记（裁决页据此换措辞）');
ok(up.indexOf('base = ' + "'认不出（退化模式）'") >= 0 || up.indexOf('认不出（退化模式）') >= 0,
  '① 认不出旧预设版本时走退化模式（取不到 base 也能合并，宁可少动）');

/* ② 40 号：卡片、三层退路、非卡密警告、取消、写回 */
ok(panel.indexOf('function renderInheritCard') >= 0, '② 40 号里有「继承旧预设设置」这张卡');
ok(/renderInheritCard\(pane\)/.test(panel), '② 它被挂进「关于」页（不是写了不用）');
ok(panel.indexOf('otherPresetNames()') >= 0 && panel.indexOf('isKamiName(') >= 0,
  '② 清单与「是不是卡密预设」都问 70 号（不在面板里另造一份判断）');
ok(panel.indexOf('warnThenStart') >= 0 && panel.indexOf("'继承（非卡密）'") >= 0,
  '② 挑到非卡密预设时先警告再问（用户点名的那句提示）');
ok(panel.indexOf("'仍然继承'") >= 0 && panel.indexOf("'换一个'") >= 0, '② 警告里给出「仍然继承 / 换一个」两条路');
ok(panel.indexOf("mk('button', 'kami-btn', '取消')") >= 0, '② 清单里有取消键（防误触）');
ok(panel.indexOf('INHERIT_COPY.degrade') >= 0 && /if \(!up\) \{/.test(panel),
  '② 远程更新脚本没在跑时降级成一句说明，不给点了没反应的按钮');
ok(panel.indexOf('function applyInheritedToLive') >= 0, '② 40 号负责最后一棒：把结果覆盖到当前预设');
ok(/savePresetFile\(ctx, s, null, function \(\) \{/.test(panelCode),
  '② 写盘走酒馆自己的通道，并且**带上写失败的退回动作**（内存与磁盘不能分家）');
ok(panel.indexOf('INHERIT_COPY.failHead') >= 0 && panel.indexOf('cancelled') >= 0,
  '② 失败与「你在裁决页里没完成」都有人话提示');

/* ③ 裁决页措辞：继承时「我的」其实指旧预设，必须换一套说法 */
ok(panel.indexOf('function mergeWords') >= 0, '③ 裁决页措辞抽成了一处（mergeWords）');
ok(panel.indexOf("mine: '保留旧预设', next: '用现在这份'") >= 0, '③ 继承那套说「保留旧预设 / 用现在这份」');
ok(panel.indexOf("mine: '保留我的', next: '用新版'") >= 0, '③ 远程更新那套说「保留我的 / 用新版」');
ok(/var W = mergeWords\(\);/.test(panel) && (panel.match(/var W = mergeWords\(\);/g) || []).length >= 2,
  '③ 卡片与页头都读同一处措辞（不是改一处漏一处）');
ok(panel.indexOf("inh ? '🔀 继承旧预设' : '🔀 更新合并'") >= 0, '③ 那一页的标题也跟着换');

/* ④ 文案：用户点名要的几句必须在产物里 */
[['卡片标题', '继承旧预设设置'], ['使用时机', '手动导入新版本后'], ['非卡密警告', '这个看起来不是卡密预设'],
  ['成功提示', '立刻生效'], ['备份说明', '继承前备份'], ['失败开头', '搬运设置失败']].forEach(([k, v]) => {
  ok(panel.indexOf(v) >= 0, '④ 文案 · ' + k + ' 在产物里', v);
});

/* ⑤ 身份字段不许跟着旧预设走（2026-09-28 真机：点完继承，酒馆的预设选择跳到了别的一份） */
ok(up.indexOf('function pinIdentity') >= 0 && /pinIdentity\(applied\.merged, targetName\)/.test(upCode),
  '⑤ 下发之前把身份字段钉成当前预设（name / preset_settings_* 不继承）');
ok(up.indexOf('IDENTITY_KEYS') >= 0, '⑤ 身份字段有一份明确的名单，不是一个一个手删');
/* 只看 inheritFrom 函数体：全文搜 currentPresetSnapshot 会先撞上 mergeAndWrite 里那处 */
const inheritBody = (function () {
  const i = upCode.indexOf('function inheritFrom');
  if (i < 0) { return ''; }
  const j = upCode.indexOf('全局 API', i);
  return upCode.slice(i, j > i ? j : i + 9000);
})();
const targetFirst = inheritBody.indexOf('var targetName = cleanStr(resolvePresetName().name);');
const firstMutate = inheritBody.indexOf('currentPresetSnapshot()');
ok(targetFirst > 0 && firstMutate > targetFirst,
  '⑤ 当前预设名是**在动活设置之前**抓的（动完再解析有可能认成别的一份）',
  '抓名位置 ' + targetFirst + ' / 读活设置位置 ' + firstMutate);
ok(/var SKIP = \{ name: 1, preset_settings_openai: 1/.test(panelCode),
  '⑤ 面板侧再挡一道：这些字段一律不覆盖');
ok(panel.indexOf('function restorePresetSelection') >= 0 && /restorePresetSelection\(ctx, r\.name \|\| targetName\)/.test(panelCode),
  '⑤ 写完之后把酒馆的预设选择拨回当前这一份（保存通道自己会挪它）');
ok(/pm\.findPreset\(wantName\)/.test(panelCode) && /pm\.selectPreset\(val\)/.test(panelCode),
  '⑤ 拨回用的是酒馆自己的 findPreset / selectPreset（不是自己改下拉框）');
ok(/savePresetFile\(ctx, s, null, function \(\) \{[\s\S]{0,200}\}, targetName\)/.test(panelCode),
  '⑤ 写盘用的是**抓好的那个名字**，不是动完之后现解析的');

/* ⑥ 用户问过「怎么没问我要不要保留条目修改」：没问必须说明白 */
ok(panel.indexOf('noAsk') >= 0 && panel.indexOf('没有条目需要你裁决') >= 0,
  '⑥ 没有冲突时明说「没有条目需要你裁决」（不是漏问了）');
ok(panel.indexOf('asked') >= 0 && panel.indexOf('两边都改过') >= 0, '⑥ 有冲突时说明按裁决页的选择处理了');
ok(panel.indexOf('sourceLabel') >= 0 && panel.indexOf('这一份继承自') >= 0,
  '⑥ 面板里写明「这一份继承自」哪份旧预设（用户点名）');
ok(/inheritFrom: inheritFromName \|\| null/.test(panelCode) && /saved\.inheritFrom/.test(panelCode),
  '⑥ 这个来源跟着预设走（存进脚本变量，而脚本变量写在预设文件里）');
ok(panel.indexOf('inheritFromName = r.oldName') >= 0, '⑥ 继承成功后把来源记下来');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '继承旧预设设置验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
