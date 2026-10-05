#!/usr/bin/env node
/**
 * 「用户自定义文风」纯逻辑单测（离线，不需要酒馆）
 * 用法：node test/harness/custom-style-pure.mjs
 *
 * 测的是 test/harness/preset-parse.mjs 里那一块新出口 ——
 * 它被 build/kami-doc.mjs 的 presetParseSource **内联进 40-预设设置.js 与 50-引导.js**，
 * 所以这里测过的就是两个面板运行时用的同一份代码（标记与 parseCustomName 只有这一份，禁止分叉）。
 *
 * 覆盖四块：
 *   ① 标记的解析与生成          ② 组归属（向上检索卡片头）
 *   ③ 写作指导分区与可选组清单   ④ 写入计划（纯数据：增 / 删 / 改 / 搬家 / 选一互斥 / 断言失败）
 *
 * 真实落盘（点酒馆「更新当前预设」按钮）不在这里测 —— 那要真酒馆，见报告。
 */
import { parsePreset, DIY_SUFFIX, DIY_CHAR_ID,
  isCustomStyleName, customStyleDisplay, buildCustomStyleName, parseCustomName,
  resolveCustomGroup, customStyleSections, planCustomStyleWrite, customStyleEntries } from './preset-parse.mjs';

let pass = 0, fail = 0;
const bad = [];
function eq(actual, expect, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expect);
  if (a === b) { pass++; return; }
  fail++;
  bad.push(label + '\n    期望：' + b + '\n    实际：' + a);
}
function ok(cond, label) { eq(!!cond, true, label); }

/* ════════════════════════════════════════════════════════════
 * 夹具：一份最小但结构完整的预设（层级 + 三张卡片，含选一与任选各一）
 * ══════════════════════════════════════════════════════════ */
const ARROW_OPEN = String.fromCodePoint(0x1f53b);
const ARROW_CLOSE = String.fromCodePoint(0x1f53a);
function P(id, name, content) {
  return {
    identifier: id, name: name, content: content || '',
    enabled: true, forbid_overrides: false, injection_depth: 4, injection_order: 100,
    injection_position: 0, marker: false, role: 'system', system_prompt: false,
  };
}
function fixture() {
  const prompts = [
    P('layer_open', '📝 写作指导' + ARROW_OPEN),
    P('opt_head', '✒️ [文风优化] 任选', '{{//优化组说明}}'),
    P('opt_a', '💀 反死人文风', '<a>'),
    P('opt_b', '🔄 写作节奏优化', '<b>'),
    P('style_head', '🖊️ [写作文风] 选一', '{{//文风组说明}}'),
    P('style_a', '🌊 流畅行文', '<s1>'),
    P('style_b', '🌐 通用网文', '<s2>'),
    P('style_c', '😘 萌系轻小说', '<s3>'),
    P('nsfw_head', '🔞 [NSFW文风] 选一', '{{//nsfw组说明}}'),
    P('nsfw_a', '🔞 NSFW基础', '<n1>'),
    P('layer_close', '📝 写作指导' + ARROW_CLOSE),
  ];
  const order = prompts.map((p, i) => ({ identifier: p.identifier, enabled: i === 7 }));  // 默认开 style_c
  return { name: '夹具预设', prompts: prompts, prompt_order: [{ character_id: DIY_CHAR_ID, order: order }] };
}

/* ════════════════════════════════════════════════════════════
 * ① 标记的解析与生成
 * ══════════════════════════════════════════════════════════ */
{
  eq(DIY_SUFFIX, ' | diy_write_style', '① 标记字面量（管道两侧各一个空格）');
  ok(isCustomStyleName('我的文风' + DIY_SUFFIX), '① 带标记 → 认得');
  ok(!isCustomStyleName('我的文风'), '① 不带标记 → 不认');
  ok(!isCustomStyleName('我的文风 | diy_write_style2'), '① 后缀多一个字符 → 不认（endsWith 判据）');
  ok(!isCustomStyleName('我的文风 | var'), '① 别的标签不误伤（ | var）');
  ok(!isCustomStyleName('我的文风 | model'), '① 别的标签不误伤（ | model）');
  ok(!isCustomStyleName(''), '① 空串不认');
  ok(!isCustomStyleName(null), '① null 不认');
  ok(!isCustomStyleName(undefined), '① undefined 不认');

  eq(customStyleDisplay('我的文风' + DIY_SUFFIX), '我的文风', '① 显示名剥掉标记');
  eq(customStyleDisplay('普通条目'), '普通条目', '① 不带标记的原样返回');

  eq(buildCustomStyleName('我的文风'), '我的文风' + DIY_SUFFIX, '① 生成名字');
  eq(buildCustomStyleName('  我的文风  '), '我的文风' + DIY_SUFFIX, '① 生成时去首尾空白');
  eq(buildCustomStyleName(''), null, '① 空名字 → null（调用方报错，不猜）');
  eq(buildCustomStyleName('   '), null, '① 全空白 → null');
  eq(buildCustomStyleName('a' + DIY_SUFFIX + 'b'), null, '① 名字里再带标记 → null（否则解析认到最后一处）');
  eq(buildCustomStyleName('两' + String.fromCharCode(10) + '行'), null, '① 名字里有换行 → null');

  eq(parseCustomName('我的文风' + DIY_SUFFIX), { ok: true, reason: null, display: '我的文风', name: '我的文风' + DIY_SUFFIX }, '① parse 成功');
  eq(parseCustomName('普通条目').ok, false, '① parse 失败：not-custom');
  eq(parseCustomName('普通条目').reason, 'not-custom', '① 失败原因');
  eq(parseCustomName(DIY_SUFFIX).reason, 'empty-display', '① 只有标记、没有名字 → empty-display');
  /* 名字里本来就含「 | 」的情况：只剥末尾标记，前面的竖线原样留着 */
  eq(parseCustomName('甲 | 乙' + DIY_SUFFIX).display, '甲 | 乙', '① 用户名字里自带竖线 → 原样保留');
}

/* ════════════════════════════════════════════════════════════
 * ② 组归属：在解析出来的序列里向上检索最近的卡片头
 * ══════════════════════════════════════════════════════════ */
const tree = parsePreset(fixture());
{
  eq(tree.stats.promptCount, 11, '② 夹具解析出 11 条 prompts');
  const gA = resolveCustomGroup(tree.tabs, 'style_a');
  eq(gA && gA.cardName, '🖊️ [写作文风]', '② style_a 归到写作文风');
  eq(gA && gA.cardMode, '单选', '② 该组是选一');
  eq(gA && gA.headIdentifier, 'style_head', '② 卡片头 identifier');
  eq(gA && gA.memberIndex, 0, '② 组内位次');
  eq(gA && gA.memberCount, 3, '② 组内条数');
  eq(resolveCustomGroup(tree.tabs, 'opt_b').cardName, '✒️ [文风优化]', '② opt_b 归到文风优化');
  eq(resolveCustomGroup(tree.tabs, 'opt_b').cardMode, '多选', '② 该组是任选');
  eq(resolveCustomGroup(tree.tabs, 'style_head'), null, '② 卡片头自己不是任何组的成员');
  eq(resolveCustomGroup(tree.tabs, 'layer_open'), null, '② 层级标记不是成员');
  eq(resolveCustomGroup(tree.tabs, '不存在'), null, '② 找不到 → null');
  eq(resolveCustomGroup(tree.tabs, ''), null, '② 空 id → null');
}

/* ════════════════════════════════════════════════════════════
 * ③ 写作指导分区与可选组清单
 * ══════════════════════════════════════════════════════════ */
{
  const sec = customStyleSections(tree.tabs, null);
  ok(sec, '③ 只给名字提示也能找到分区');
  eq(sec.via, 'layer-name', '③ 命中方式 = 层级名');
  eq(sec.layerName, '📝 写作指导', '③ 分区名');
  eq(sec.cards.map((c) => c.cardName), ['✒️ [文风优化]', '🖊️ [写作文风]', '🔞 [NSFW文风]'], '③ 分区下所有 [组名] 卡片头');
  eq(sec.cards.map((c) => c.cardMode), ['多选', '单选', '单选'], '③ 每组的模式（界面上要能看出来）');
  eq(sec.cards[1].members.map((m) => m.identifier), ['style_a', 'style_b', 'style_c'], '③ 组成员按解析序列');
  eq(sec.closeIdentifier, 'layer_close', '③ 分区收尾标记的 identifier（插入边界的最后一道闸）');

  const sec2 = customStyleSections(tree.tabs, ['🖊️ [写作文风]']);
  eq(sec2.via, 'anchor', '③ 给锚点卡片名时优先用锚点');
  eq(sec2.layerName, '📝 写作指导', '③ 锚点命中的还是同一个分区');

  const sec3 = customStyleSections(tree.tabs, ['不存在的卡片']);
  eq(sec3.via, 'layer-name', '③ 锚点没命中 → 退回层级名');
  eq(customStyleSections([], null), null, '③ 没有 tab → null');
  eq(customStyleSections(null, null), null, '③ null → null');
}

/* ════════════════════════════════════════════════════════════
 * ④ 写入计划（纯数据）
 * ══════════════════════════════════════════════════════════ */
const SECTION = customStyleSections(tree.tabs, null);
const GROUPS = SECTION.cards;
const SECTION_END = SECTION.closeIdentifier;   // 📝 写作指导🔺 —— 插入位置的最后一道边界
function base() {
  const f = fixture();
  return { prompts: f.prompts.map((p) => JSON.parse(JSON.stringify(p))), order: JSON.parse(JSON.stringify(f.prompt_order[0].order)) };
}
let seq = 0;
const newId = () => 'diy_' + (++seq);
function plan(over) {
  const b = base();
  return planCustomStyleWrite(Object.assign({
    prompts: b.prompts, order: b.order,
    orderEntryCount: 1, charId: DIY_CHAR_ID,
    groups: GROUPS, adds: [], updates: [], removes: [], newId: newId, sectionEndId: SECTION_END,
  }, over || {}));
}

/* ④-1 增：克隆同组字段、两个数组同插、插在组尾、默认选中、选一互斥 */
{
  seq = 0;
  const r = plan({ adds: [{ display: '我的治愈文风', groupHeadId: 'style_head', content: '<mine>' }] });
  ok(r.ok, '④-1 计划成功');
  eq(r.code, null, '④-1 没有错误码');
  eq(r.report.added.length, 1, '④-1 报告一条新增');
  eq(r.report.added[0].identifier, 'diy_1', '④-1 生成的 id');
  eq(r.report.added[0].clonedFrom, 'style_c', '④-1 克隆源 = 目标组最后一条成员');
  eq(r.report.before, { prompts: 11, order: 11 }, '④-1 写入前条数');
  eq(r.report.after, { prompts: 12, order: 12 }, '④-1 写入后条数（两个数组同增）');

  const np = r.nextPrompts, no = r.nextOrder;
  const at = np.findIndex((p) => p.identifier === 'diy_1');
  eq(np[at].name, '我的治愈文风' + DIY_SUFFIX, '④-1 名字写成 <名字> + 标记');
  eq(np[at].content, '<mine>', '④-1 正文写进去了');
  eq(np[at].injection_depth, 4, '④-1 克隆到了同组条目的字段（injection_depth）');
  eq(np[at].role, 'system', '④-1 克隆到了 role');
  eq(np[at].forbid_overrides, false, '④-1 克隆到了 forbid_overrides');
  eq(np[at - 1].identifier, 'style_c', '④-1 在 prompts[] 里紧跟在组尾之后');

  const oat = no.findIndex((o) => o.identifier === 'diy_1');
  eq(no[oat - 1].identifier, 'style_c', '④-1 在 order[] 里也紧跟在组尾之后');
  eq(no[oat].enabled, true, '④-1 新增默认选中');
  eq(no[oat + 1].identifier, 'nsfw_head', '④-1 没有越过下一个卡片头');
  eq(no.length, 12, '④-1 order 长度 +1');
  eq(r.report.deselected, ['style_c'], '④-1 只报告真正被翻掉的那条（a/b 本来就是关的）');
  eq(no.filter((o) => ['style_a', 'style_b', 'style_c'].indexOf(o.identifier) >= 0 && o.enabled).map((o) => o.identifier), [], '④-1 选一组：同组其它三条全部是关的');
  eq(no.filter((o) => o.enabled).map((o) => o.identifier), ['diy_1'], '④-1 全预设只剩新条目开着');
  /* 原数组一个字节都不能被动 */
  eq(base().order.length, 11, '④-1 输入数组没被改写');
}

/* ④-2 增到任选组：不触发互斥 */
{
  seq = 0;
  const r = plan({ adds: [{ display: '克制文风', groupHeadId: 'opt_head', content: '<x>' }] });
  ok(r.ok, '④-2 计划成功');
  eq(r.report.deselected, [], '④-2 任选组不做互斥');
  const no = r.nextOrder;
  const oat = no.findIndex((o) => o.identifier === 'diy_1');
  eq(no[oat - 1].identifier, 'opt_b', '④-2 插在文风优化组尾');
  eq(no[oat].enabled, true, '④-2 新增默认选中');
  eq(r.nextPrompts.find((p) => p.identifier === 'diy_1').name, '克制文风' + DIY_SUFFIX, '④-2 名字');
}

/* ④-3 删：两个数组同删，绝不留孤儿 */
{
  seq = 0;
  const r0 = plan({ adds: [{ display: '待删的', groupHeadId: 'opt_head', content: '' }] });
  const b = base();
  b.prompts = r0.nextPrompts; b.order = r0.nextOrder;
  const r = planCustomStyleWrite({
    prompts: b.prompts, order: b.order, orderEntryCount: 1, charId: DIY_CHAR_ID, groups: GROUPS,
    adds: [], updates: [], removes: ['diy_1'], newId: newId, sectionEndId: SECTION_END,
  });
  ok(r.ok, '④-3 计划成功');
  eq(r.report.removed, ['diy_1'], '④-3 报告一条删除');
  eq(r.report.after, { prompts: 11, order: 11 }, '④-3 两个数组同减，回到 11');
  eq(r.nextPrompts.filter((p) => p.identifier === 'diy_1').length, 0, '④-3 prompts 里删掉了');
  eq(r.nextOrder.filter((o) => o.identifier === 'diy_1').length, 0, '④-3 order 里删掉了（不留孤儿）');
}

/* ④-4 删非自定义条目：拒绝 */
{
  seq = 0;
  const r = plan({ removes: ['style_a'] });
  eq(r.ok, false, '④-4 拒绝删预设原有条目');
  eq(r.code, 'REMOVE_NOT_CUSTOM', '④-4 错误码');
  eq(r.nextPrompts, null, '④-4 一个字节都不动');
}

/* ④-5 改名字 + 换组 = 搬家 */
{
  seq = 0;
  const r0 = plan({ adds: [{ display: '旧名字', groupHeadId: 'opt_head', content: 'C1' }] });
  const b = base();
  b.prompts = r0.nextPrompts; b.order = r0.nextOrder;
  const r = planCustomStyleWrite({
    prompts: b.prompts, order: b.order, orderEntryCount: 1, charId: DIY_CHAR_ID, groups: GROUPS,
    adds: [], removes: [], newId: newId, sectionEndId: SECTION_END,
    updates: [{ identifier: 'diy_1', display: '新名字', groupHeadId: 'style_head', content: 'C2' }],
  });
  ok(r.ok, '④-5 计划成功');
  eq(r.report.updated, ['diy_1'], '④-5 报告一条修改');
  eq(r.report.orderMoved, ['diy_1'], '④-5 换组 → 在 order 里搬了家');
  const np = r.nextPrompts, no = r.nextOrder;
  const p = np.find((x) => x.identifier === 'diy_1');
  eq(p.name, '新名字' + DIY_SUFFIX, '④-5 名字改了');
  eq(p.content, 'C2', '④-5 正文改了');
  const oi = no.findIndex((o) => o.identifier === 'diy_1');
  eq(no[oi - 1].identifier, 'style_c', '④-5 搬到了写作文风组的组尾');
  eq(no[oi + 1].identifier, 'nsfw_head', '④-5 没越过下一个卡片头');
  eq(no.length, 12, '④-5 只是搬家，长度不变');
  eq(no.filter((o) => o.identifier === 'diy_1').length, 1, '④-5 搬家后只有一条（没复制出两条）');
}

/* ④-6 改：本来就在组尾 → 不做无意义搬家 */
{
  seq = 0;
  const r0 = plan({ adds: [{ display: 'A', groupHeadId: 'opt_head', content: '' }] });
  const b = base(); b.prompts = r0.nextPrompts; b.order = r0.nextOrder;
  const r = planCustomStyleWrite({
    prompts: b.prompts, order: b.order, orderEntryCount: 1, charId: DIY_CHAR_ID, groups: GROUPS,
    adds: [], removes: [], newId: newId, sectionEndId: SECTION_END,
    updates: [{ identifier: 'diy_1', display: 'B', groupHeadId: 'opt_head', content: '' }],
  });
  ok(r.ok, '④-6 计划成功');
  eq(r.report.orderMoved, [], '④-6 已在组尾 → 不搬家');
  eq(r.report.updated, ['diy_1'], '④-6 但名字照改');
}

/* ④-7 断言失败：结构不符就放弃，一个字节不动 */
{
  seq = 0;
  eq(plan({ orderEntryCount: 2 }).code, 'ORDER_SHAPE', '④-7 prompt_order 多条 → ORDER_SHAPE');
  eq(plan({ orderEntryCount: 0 }).code, 'ORDER_SHAPE', '④-7 prompt_order 空 → ORDER_SHAPE');
  eq(plan({ charId: 123 }).code, 'ORDER_SHAPE', '④-7 character_id 不对 → ORDER_SHAPE');
  const r = plan({ charId: 123, adds: [{ display: 'x', groupHeadId: 'style_head', content: '' }] });
  eq(r.nextPrompts, null, '④-7 结构不符时连计划都不产出');
  eq(plan({ prompts: null }).code, 'NO_PROMPTS', '④-7 缺 prompts → NO_PROMPTS');
  eq(plan({ order: null }).code, 'NO_ORDER', '④-7 缺 order → NO_ORDER');
}

/* ④-8 断言失败：目标组不存在 / 名字非法 / 找不到条目 */
{
  seq = 0;
  eq(plan({ adds: [{ display: 'x', groupHeadId: '没有这个组', content: '' }] }).code, 'GROUP_NOT_FOUND', '④-8 组不存在');
  eq(plan({ adds: [{ display: '', groupHeadId: 'style_head', content: '' }] }).code, 'BAD_NAME', '④-8 空名字');
  eq(plan({ updates: [{ identifier: '不存在', display: 'x', groupHeadId: 'style_head' }] }).code, 'UPDATE_MISSING', '④-8 改不存在的条目');
  eq(plan({ updates: [{ identifier: 'style_a', display: 'x', groupHeadId: 'style_head' }] }).code, 'UPDATE_NOT_CUSTOM', '④-8 改预设原有条目');
  eq(plan({ removes: ['不存在'] }).code, 'REMOVE_MISSING', '④-8 删不存在的条目');
  /* 空组：memberIds 为空 */
  const g2 = [{ headIdentifier: 'style_head', cardName: 'x', cardMode: '单选', members: [] }];
  eq(plan({ groups: g2, adds: [{ display: 'x', groupHeadId: 'style_head', content: '' }] }).code, 'GROUP_EMPTY', '④-8 空组不给加');
}

/* ④-9 一次保存里同时增删改：顺序是 删 → 改 → 增，结果可预测 */
{
  seq = 0;
  const r0 = plan({ adds: [{ display: '甲', groupHeadId: 'style_head', content: '甲' }, { display: '乙', groupHeadId: 'opt_head', content: '乙' }] });
  const b = base(); b.prompts = r0.nextPrompts; b.order = r0.nextOrder;
  const r = planCustomStyleWrite({
    prompts: b.prompts, order: b.order, orderEntryCount: 1, charId: DIY_CHAR_ID, groups: GROUPS,
    removes: ['diy_1'],
    updates: [{ identifier: 'diy_2', display: '乙改', groupHeadId: 'opt_head', content: '乙2' }],
    adds: [{ display: '丙', groupHeadId: 'style_head', content: '丙' }],
    newId: newId, sectionEndId: SECTION_END,
  });
  ok(r.ok, '④-9 计划成功');
  eq(r.report.removed, ['diy_1'], '④-9 删了甲');
  eq(r.report.updated, ['diy_2'], '④-9 改了乙');
  eq(r.report.added.length, 1, '④-9 加了丙');
  eq(r.report.before, { prompts: 13, order: 13 }, '④-9 起点 13');
  eq(r.report.after, { prompts: 13, order: 13 }, '④-9 终点 13（-1 +1）');
  eq(r.nextOrder.filter((o) => o.identifier === 'diy_2').length, 1, '④-9 乙没被复制成两条');
}

/* ④-10 同一组一次加两条：只留最后一条选中 */
{
  seq = 0;
  const r = plan({ adds: [
    { display: '一', groupHeadId: 'style_head', content: '' },
    { display: '二', groupHeadId: 'style_head', content: '' },
  ] });
  ok(r.ok, '④-10 计划成功');
  const no = r.nextOrder;
  const on = no.filter((o) => o.enabled).map((o) => o.identifier);
  eq(on, ['diy_2'], '④-10 同组加两条只留最后一条开着');
  eq(r.report.after.order, 13, '④-10 order 长度 +2');
}

/* ④-11 分区里**最后一张卡**：组尾不能一路算到整个预设的末尾（分区收尾标记就是那道闸） */
{
  seq = 0;
  const r = plan({ adds: [{ display: 'NSFW新风格', groupHeadId: 'nsfw_head', content: '<n>' }] });
  ok(r.ok, '④-11 计划成功');
  const no = r.nextOrder;
  const oi = no.findIndex((o) => o.identifier === 'diy_1');
  eq(no[oi - 1].identifier, 'nsfw_a', '④-11 插在 NSFW 组尾');
  eq(no[oi + 1].identifier, 'layer_close', '④-11 没有越过分区收尾标记（插到分区外面）');
  eq(no[no.length - 1].identifier, 'layer_close', '④-11 分区收尾标记仍在最后');
  /* 不给 sectionEndId 时的退化行为：这一条是**已知的残余风险**，写出来免得以后被当成 bug */
  const r2 = plan({ sectionEndId: null, adds: [{ display: 'x', groupHeadId: 'nsfw_head', content: '' }] });
  const no2 = r2.nextOrder;
  const nid2 = r2.report.added[0].identifier;
  eq(r2.report.added[0].orderAt, 11, '④-11 缺边界时的落点');
  eq(no2[no2.length - 1].identifier, nid2, '④-11 缺边界 → 落到 order 末尾');
  eq(no2.filter((o) => o.identifier === 'layer_close').length, 1, '④-11 分区收尾标记还在');
  ok(no2.indexOf(no2.filter((o) => o.identifier === 'layer_close')[0]) < no2.indexOf(no2.filter((o) => o.identifier === nid2)[0]),
    '④-11 缺边界 → 插到了分区收尾标记**后面**（这就是必须传 closeIdentifier 的原因）');
}

/* ④-12 回归：**新增 → 保存 → 再标记删除 → 保存**，条目必须从两个数组里同时消失
   （用户 2026-10-03 报「新增正常、删除没有用」。这条把"界面标记删除"到"两个数组都干净"
     整条链钉死：计划必须报出 removed、两个数组同减、重复删要有明确错误、不许静默空转。）*/
{
  seq = 0;
  const b0 = base();
  const addPlan = planCustomStyleWrite({
    prompts: b0.prompts, order: b0.order, orderEntryCount: 1, charId: DIY_CHAR_ID,
    groups: GROUPS, sectionEndId: SECTION_END,
    adds: [{ display: '回归用文风', groupHeadId: 'style_head', content: '<r>' }],
    updates: [], removes: [], newId: newId,
  });
  ok(addPlan.ok, '④-12 第一步：新增计划成功');
  const rid = addPlan.report.added[0].identifier;
  const b1 = { prompts: addPlan.nextPrompts, order: addPlan.nextOrder };
  eq([b1.prompts.some(p => p.identifier === rid), b1.order.some(o => o.identifier === rid)], [true, true],
    '④-12 新增后两个数组里都有它');

  /* 界面点「删除」= st.removes[id]=true；点「保存」= save() 把键收进 req.removes 交到这里 */
  const delPlan = planCustomStyleWrite({
    prompts: b1.prompts, order: b1.order, orderEntryCount: 1, charId: DIY_CHAR_ID,
    groups: GROUPS, sectionEndId: SECTION_END,
    adds: [], updates: [], removes: [rid], newId: newId,
  });
  ok(delPlan.ok, '④-12 第二步：删除计划成功');
  eq(delPlan.report.removed, [rid], '④-12 计划确实报告一条删除（不是静默空转）');
  eq(delPlan.report.added.length + delPlan.report.updated.length + delPlan.report.removed.length >= 1, true,
    '④-12 有活可干（40 号的 hasWork 不会走 nothing 静默分支）');
  eq([delPlan.nextPrompts.some(p => p.identifier === rid), delPlan.nextOrder.some(o => o.identifier === rid)], [false, false],
    '④-12 删完两个数组里都没有它');
  eq({ prompts: delPlan.nextPrompts.length, order: delPlan.nextOrder.length }, { prompts: 11, order: 11 },
    '④-12 两个数组条数同时回到 11（同增同删）');

  const del2 = planCustomStyleWrite({
    prompts: delPlan.nextPrompts, order: delPlan.nextOrder, orderEntryCount: 1, charId: DIY_CHAR_ID,
    groups: GROUPS, sectionEndId: SECTION_END, adds: [], updates: [], removes: [rid], newId: newId,
  });
  eq(del2.code, 'REMOVE_MISSING', '④-12 重复删同一条 → 明确报错，不许静默成功');
}

/* ════════════════════════════════════════════════════════════
 * ⑤ 读侧：把现有自定义文风连同组列出来（含掉出组的游离项）
 * ══════════════════════════════════════════════════════════ */
{
  const f = fixture();
  f.prompts.push(P('diy_x', '我的文风' + DIY_SUFFIX, '<m>'));
  f.prompt_order[0].order.splice(6, 0, { identifier: 'diy_x', enabled: true });   // 插在 style_a 之后 → 属于写作文风组
  f.prompts.push(P('diy_y', '游离开的' + DIY_SUFFIX, '<o>'));
  f.prompt_order[0].order.splice(1, 0, { identifier: 'diy_y', enabled: false });  // 插在 layer_open 之后、卡片头之前 → 不属于任何卡片
  const t2 = parsePreset(f);
  const ents = customStyleEntries(f.prompts, f.prompt_order[0].order, t2.tabs);
  eq(ents.length, 2, '⑤ 认出两条自定义文风');
  const byId = {};
  ents.forEach((e) => { byId[e.identifier] = e; });
  eq(byId.diy_x.display, '我的文风', '⑤ 显示名剥掉标记');
  eq(byId.diy_x.groupName, '🖊️ [写作文风]', '⑤ 归属组');
  eq(byId.diy_x.groupMode, '单选', '⑤ 组模式');
  eq(byId.diy_x.enabled, true, '⑤ 开关态来自 order[]');
  eq(byId.diy_x.orphan, false, '⑤ 不是游离项');
  eq(byId.diy_y.orphan, true, '⑤ 掉出组的 → orphan=true（互斥对它失效）');
  eq(byId.diy_y.groupHeadId, null, '⑤ 游离项没有组');
  /* 不带标记的普通条目一条都不该混进来 */
  eq(ents.filter((e) => e.name.indexOf('流畅行文') >= 0).length, 0, '⑤ 普通条目不混进来');
}

/* ════════════════════════════════════════════════════════════ */
if (fail) {
  console.log('✗ 自定义文风纯逻辑：' + fail + ' 项失败 / ' + (pass + fail) + ' 项');
  bad.forEach((b) => console.log('  ✗ ' + b));
  process.exit(1);
}
console.log('✓ 自定义文风纯逻辑：' + pass + ' 项全部通过');
