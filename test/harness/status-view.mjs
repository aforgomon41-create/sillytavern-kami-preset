#!/usr/bin/env node
/**
 * 「状态栏前端」纯逻辑单测（离线，不需要酒馆、不需要 MVU）
 * 用法：node test/harness/status-view.mjs
 *
 * 测的是 src/scripts/_status-view.js —— 构建期内联进 80-状态栏.js 的那份。
 * 覆盖：天气图标、变量形状容错、空数据判定、三行标题栏、模块开关的默认值与合并、
 *       字段自适应分类、剧透字段过滤、内联契约。
 */
import { readFileSync } from 'node:fs';
const NAMES = ['SAMPLE_STAT', 'STATUS_COPY', 'WEATHER_ICON', 'WEATHER_FALLBACK', 'MODULES', 'HIDDEN_FIELDS',
  'weatherIcon', 'defaultSettings', 'mergeSettings', 'enabledModules', 'pickStat', 'isEmptyStat',
  'shouldShowHeader', 'locationText', 'headerLines', 'describeField', 'sectionsOf', 'moduleLabel'];
const src = readFileSync(new URL('../../src/scripts/_status-view.js', import.meta.url), 'utf8')
  .split('\n').map(l => (l.slice(0, 7) === 'export ') ? l.slice(7) : l).join('\n');
const M = new Function(src + '\nreturn {' + NAMES.map(n => n + ': ' + n).join(', ') + '};')();

let pass = 0, fail = 0; const bad = [];
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return; }
  fail++; bad.push(label + '\n    期望：' + JSON.stringify(b) + '\n    实际：' + JSON.stringify(a));
}
const ok = (c, label) => eq(!!c, true, label);

/* ── ① 天气图标：枚举全覆盖 + 兜底 + 空 ── */
{
  const ENUM = ['晴','雨','阴','雪','雾','大风','雷暴','暴雨','沙暴','瘴气','异象'];
  for (const w of ENUM) { ok(M.WEATHER_ICON[w] && M.WEATHER_ICON[w].length > 0, '① 天气「' + w + '」有图标'); }
  eq(M.weatherIcon('晴'), '☀️', '① 认得出来的天气给对应图标');
  eq(M.weatherIcon(' 雾 '), '🌫️', '① 两头空格也认');
  eq(M.weatherIcon('下猫下狗'), M.WEATHER_FALLBACK, '① 认不出的天气给兜底图标，不返回空');
  eq(M.weatherIcon(''), '', '① 空天气给空串（标题栏不留一个孤零零的图标）');
  eq(M.weatherIcon(null), '', '① null 给空串');
  ok(M.weatherIcon('下猫下狗').length > 0, '① 兜底图标不是空串（免得标题栏缺一块）');
}

/* ── ② 变量形状容错：从各种包装里捞出 stat_data ── */
{
  eq(M.pickStat({ stat_data: { a: 1 } }), { a: 1 }, '② 直接给 stat_data');
  eq(M.pickStat({ swipes_data: [{ stat_data: {} }, { stat_data: { b: 2 } }] }), { b: 2 }, '② 从 swipes_data 里捞（跳过前面那格空壳）');
  eq(M.pickStat({ swipes_data: [{ stat_data: {} }] }), null, '② 全是空壳 → null，不返回空对象');
  eq(M.pickStat({ variables: { mvu: { stat_data: { c: 3 } } } }), { c: 3 }, '② 从 variables 里捞');
  eq(M.pickStat({ variables: { x: { nope: 1 } } }), null, '② 捞不到就 null，**不伪造**');
  eq(M.pickStat(null), null, '② null → null');
  eq(M.pickStat('字符串'), null, '② 非对象 → null');
  eq(M.pickStat({}), null, '② 空对象 → null');
}

/* ── ③ 空数据判定：决定"只有球"还是"展开标题栏" ── */
{
  ok(M.isEmptyStat(null) === true, '③ null 算空');
  ok(M.isEmptyStat({}) === true, '③ 一个键都没有算空');
  ok(M.isEmptyStat({ status: {} }) === false, '③ 有一个顶层键就不算空');
  ok(M.isEmptyStat('x') === true, '③ 非对象算空');
}

/* ── ④ 该不该展开标题栏 ── */
{
  const D = M.defaultSettings();
  ok(M.shouldShowHeader({ status: {} }, D) === true, '④ 有数据 + 默认设置 → 展开');
  ok(M.shouldShowHeader(null, D) === false, '④ 没数据 → 只有球');
  ok(M.shouldShowHeader({}, D) === false, '④ 空数据 → 只有球');
  const off = M.mergeSettings({ options: { showHeader: false } });
  ok(M.shouldShowHeader({ status: {} }, off) === false, '④ 用户关掉标题栏 → 永远只有球');
}

/* ── ⑤ 三行标题栏 ── */
{
  const stat = {
    status: { time: '第四纪元-2023年-11月-15日-15:00', weather: '雾', location: '迷雾森林·石碑遗迹', present_chars: ['char_player', 'char_heroine'] },
    characters: { char_player: { name: '雷恩' }, char_heroine: { name: '艾莉丝' } }
  };
  const nameOf = id => (stat.characters[id] || {}).name;
  const L = M.headerLines(stat, nameOf);
  eq(L.length, 3, '⑤ **恒为三行**');
  eq(L[0], '第四纪元-2023年-11月-15日-15:00 🌫️', '⑤ 第 1 行 = 时间 + 天气图标');
  eq(L[1], '迷雾森林·石碑遗迹', '⑤ 第 2 行 = 地点');
  eq(L[2], '雷恩 / 艾莉丝', '⑤ 第 3 行 = 在场人物（ID 换成名字）');

  /* 地名是结构对象（地图模块开着时） */
  /* 地图开着时 location 存的是**实体 ID**：要自己去 map_nodes 里换成名字 */
  const L2 = M.headerLines({
    status: { location: { realm: 'realm_forest', area: 'area_woods_entry', spot: 'spot_ancient_altar' } },
    map_nodes: { realm_forest: { name: '迷雾森林大区', areas: { area_woods_entry: { name: '林缘哨所区', spots: { spot_ancient_altar: { name: '石碑遗迹' } } } } } }
  });
  eq(L2[1], '迷雾森林大区 · 林缘哨所区 · 石碑遗迹', '⑤ 地点是 ID 对象时，去 map_nodes 换成名字');
  const L2b = M.headerLines({ status: { location: { realm: 'realm_x', area: 'area_y', spot: 'spot_z' } } });
  eq(L2b[1], 'realm_x · area_y · spot_z', '⑤ 查不到名字就退回 ID（不显示成空）');
  /* 没传 nameOf 时，自己从 stat.characters 里查名字 */
  eq(M.headerLines({ status: { present_chars: ['c1'] }, characters: { c1: { name: '雷恩' } } })[2], '雷恩',
    '⑤ 没传 nameOf 也能自己查出角色名');

  /* 缺项：行数不变，缺的行给空串（位置不会跳） */
  const L3 = M.headerLines({ status: { time: '某时' } });
  eq(L3.length, 3, '⑤ 缺项时仍是三行');
  eq(L3[1], '', '⑤ 没地点 → 第 2 行空着');
  eq(L3[2], '', '⑤ 没人物 → 第 3 行空着');

  /* 认不出名字就退回 ID，不显示空白 */
  eq(M.headerLines({ status: { present_chars: ['unknown_id'] } })[2], 'unknown_id', '⑤ 认不出名字退回 ID');
  /* 天气认不出：文字顶上，不丢信息 */
  ok(M.headerLines({ status: { time: 'T', weather: '下猫下狗' } })[0].indexOf('下猫下狗') >= 0, '⑤ 认不出的天气显示原文');
  eq(M.headerLines(null).length, 3, '⑤ 传 null 也是三行（不炸）');
}

/* ── ⑥ 设置的默认值与合并（存下来的东西一律不可信） ── */
{
  const D = M.defaultSettings();
  eq(Object.keys(D.modules).length, 8, '⑥ 八个模块都有默认值');
  eq(D.modules.status, true, '⑥ 状态默认开');
  eq(D.modules.factions, false, '⑥ 势力默认关（一上来摊开八个会变一堵墙）');
  eq(D.options.showHeader, true, '⑥ 默认展开标题栏');
  eq(D.options.showHidden, false, '⑥ 默认不显示剧透字段');

  eq(M.mergeSettings(null), D, '⑥ 没存过 → 全默认');
  eq(M.mergeSettings('坏数据'), D, '⑥ 存了个非对象 → 全默认，不炸');
  eq(M.mergeSettings({ modules: { lore: true } }).modules.lore, true, '⑥ 只改一个模块也生效');
  eq(M.mergeSettings({ modules: { lore: true } }).modules.status, true, '⑥ 没提的模块保持默认');
  eq(M.mergeSettings({ modules: { lore: 'yes' } }).modules.lore, false, '⑥ 类型不对的值退回默认（不整份丢弃）');
  eq(M.mergeSettings({ options: { showHidden: 1 } }).options.showHidden, false, '⑥ 选项类型不对也退回默认');
  eq(M.mergeSettings({ modules: { 不存在的模块: true } }).modules.status, true, '⑥ 不认识的模块忽略掉');

  const s = M.mergeSettings({ modules: { factions: true, storylines: true } });
  eq(M.enabledModules(s).map(m => m.id), ['status', 'characters', 'map_nodes', 'factions', 'storylines', 'quests'], '⑥ 开启的模块按固定顺序列出');
}

/* ── ⑦ 字段自适应分类 ── */
{
  eq(M.describeField(42).kind, 'number', '⑦ 数字 → number');
  eq(M.describeField(0).kind, 'number', '⑦ 0 也是 number（不是 empty）');
  eq(M.describeField(false).kind, 'bool', '⑦ 布尔 → bool');
  eq(M.describeField('一段话').kind, 'text', '⑦ 字符串 → text');
  eq(M.describeField(['甲', '乙']).kind, 'list', '⑦ 数组 → list');
  eq(M.describeField({ a: 1 }).kind, 'group', '⑦ 对象 → group');
  eq(M.describeField('').kind, 'empty', '⑦ 空串 → empty');
  eq(M.describeField(null).kind, 'empty', '⑦ null → empty');
}

/* ── ⑧ 面板区块：模块过滤 + 剧透字段过滤 ── */
{
  const stat = {
    status: { time: '某时', weather: '晴' },
    factions: { f1: { name: '骑士团' } },
    lore: { l1: { title: '瘴气', summary: '公开', truth: '其实是神骸' } },
    characters: { c1: { name: '雷恩', real_desc: '真实身份是王子' } }
  };
  const D = M.defaultSettings();
  const secs = M.sectionsOf(stat, D);
  eq(secs.map(s => s.id), ['status', 'characters'], '⑧ 只画开着的模块（factions/lore 默认关）');
  const ch = secs.find(s => s.id === 'characters');
  ok(ch.rows.some(r => r.key === 'c1'), '⑧ 角色区块列出实体');
  /* 剧透字段藏在第二层（characters.c1.real_desc）—— 必须递归过滤，只过滤顶层等于没过滤 */
  const c1 = ch.rows.find(r => r.key === 'c1').value;
  ok(c1.name === '雷恩', '⑧ 实体里正常字段还在');
  ok(!('real_desc' in c1), '⑧ **第二层的剧透字段也被过滤掉**');

  const withHidden = M.sectionsOf(stat, M.mergeSettings({ options: { showHidden: true } }));
  ok('real_desc' in withHidden.find(s => s.id === 'characters').rows.find(r => r.key === 'c1').value, '⑧ 打开选项后剧透字段出现');

  eq(M.sectionsOf(null, D), [], '⑧ 没数据 → 没有区块');
  eq(M.sectionsOf({}, D), [], '⑧ 空数据 → 没有区块');
  eq(M.sectionsOf({ lore: { l1: { title: 'x' } } }, M.mergeSettings({ modules: { lore: true } })).map(s => s.id), ['lore'], '⑧ 把 lore 打开就能看到它');
  eq(M.moduleLabel('map_nodes'), 'secMap', '⑧ 模块 id 能换到文案键');
}

/* ── ⑨ 文案集中一处 + 内联契约 ── */
{
  ok(M.STATUS_COPY && typeof M.STATUS_COPY === 'object', '⑨ 文案是一个对象（等文案 Agent 出稿）');
  for (const k of ['label','tip','noData','expandHint','close','settingsTab','settingsModules',
                   'settingsOptions','optShowHeader','optShowHeaderHint','optShowHidden','optShowHiddenHint',
                   'optResetPos','saved']) {
    ok(typeof M.STATUS_COPY[k] === 'string' && M.STATUS_COPY[k].length > 0, '⑨ 文案键 ' + k + ' 在');
  }
  for (const mod of M.MODULES) { ok(typeof M.STATUS_COPY[mod.copy] === 'string', '⑨ 模块 ' + mod.id + ' 有显示名'); }
  const raw = readFileSync(new URL('../../src/scripts/_status-view.js', import.meta.url), 'utf8');
  ok(raw.indexOf('$') < 0, '⑨ 模块里没有美元符号');
  ok(raw.indexOf('{{') < 0, '⑨ 模块里没有大括号宏');
  ok(raw.indexOf('import ') < 0, '⑨ 模块里没有 import');
  ok(raw.split('\n').filter(l => /^\s+export\s/.test(l)).length === 0, '⑨ 没有缩进的 export');
  ok(raw.indexOf('document') < 0 && raw.indexOf('window') < 0, '⑨ 纯逻辑里不碰 DOM');
}

/* ════════════════════════════════════════════════════════════
 * ⑩ 内置示例数据（用户 2026-10-05）：必须与真实数据走**同一条归一化路径**，
 *    而且**逐键比对手写变量文档** —— 文档改了字段、示例没跟上，这里立刻报错。
 * ════════════════════════════════════════════════════════════ */
{
  const S = M.SAMPLE_STAT;
  ok(!!S && typeof S === 'object', '⑩ 示例数据在');

  /* ── 与手写变量文档对表 ── */
  const yamlText = readFileSync(new URL('../../design/_discussion/mvu/手写变量结构.yaml', import.meta.url), 'utf8');
  const yamlKeys = new Set([...yamlText.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*):/gm)].map(m => m[1]));
  const notInYaml = (obj, label) => {
    const bad = Object.keys(obj || {}).filter(k => !yamlKeys.has(k));
    eq(bad, [], '⑩ ' + label + ' 的字段都能在文档里找到');
  };
  /* 顶层八模块 */
  const MODS8 = ['status','characters','map_nodes','factions','storylines','quests','estates','lore'];
  eq(M.MODULES.map(m => m.id), MODS8, '⑩ 文档的八个顶层模块与代码里的清单一致');
  for (const mod of MODS8) { ok(yamlKeys.has(mod), '⑩ 模块 ' + mod + ' 在文档里'); ok(S[mod] && Object.keys(S[mod]).length > 0, '⑩ 示例里的 ' + mod + ' 非空'); }
  /* 各模块的字段层级 */
  notInYaml(S.status, 'status');
  notInYaml(S.characters.char_player, 'characters[].');
  notInYaml(S.characters.char_player.goals, 'characters[].goals');
  notInYaml(S.characters.char_player.relations.char_heroine, 'characters[].relations[]');
  notInYaml(S.characters.char_player.items.item_longbow, 'characters[].items[]');
  notInYaml(S.characters.char_player.mount.mount_horse, 'characters[].mount[]');
  notInYaml(S.characters.char_player.nsfw, 'characters[].nsfw');
  notInYaml(S.map_nodes.realm_forest, 'map_nodes[]');
  notInYaml(S.map_nodes.realm_forest.areas.area_woods_entry, 'map_nodes[].areas[]');
  notInYaml(S.map_nodes.realm_forest.areas.area_woods_entry.spots.spot_ancient_altar, 'map_nodes[].areas[].spots[]');
  notInYaml(S.factions.faction_dawn, 'factions[]');
  notInYaml(S.factions.faction_dawn.goals, 'factions[].goals');
  notInYaml(S.factions.faction_dawn.rep.char_player, 'factions[].rep[]');
  notInYaml(S.factions.faction_dawn.diplomacy.faction_wardens, 'factions[].diplomacy[]');
  notInYaml(S.storylines.line_holy_relic, 'storylines[]');
  notInYaml(S.storylines.line_holy_relic.nodes[0], 'storylines[].nodes[]');
  notInYaml(S.quests.quest_scout, 'quests[]');
  notInYaml(S.estates.estate_hunter_cabin, 'estates[]');
  notInYaml(S.lore.lore_miasma, 'lore[]');

  /* ── 互斥 RPG 模块组：只填 D&D ── */
  const st = S.characters.char_player.stats;
  eq(Object.keys(st.dnd).sort(), ['cha','con','dex','int','str','wis'], '⑩ 走的是 D&D 六维那套');
  for (const k of ['str','dex','con','int','wis','cha']) {
    ok(typeof st.dnd[k] === 'number' && st.dnd[k] >= 1 && st.dnd[k] <= 20, '⑩ D&D ' + k + ' 在 1-20 之间');
  }
  eq([Object.keys(st.fu).length, Object.keys(st.wod).length, Object.keys(st.fate).length], [0,0,0], '⑩ 另外三套 RPG 模块组留空（互斥，只选一套）');
  ok(Object.values(st.dnd).every(v => Number.isInteger(v)), '⑩ D&D 六维都是整数');

  /* ── 三行标题栏四个字段齐 ── */
  const L = M.headerLines(S);
  eq(L.length, 3, '⑩ 示例数据出三行');
  ok(L[0] && L[1] && L[2], '⑩ 三行都不是空的（时间/地点/人物齐）');
  ok(L[0].indexOf(M.WEATHER_ICON[S.status.weather]) >= 0, '⑩ 第 1 行用上了天气图标映射');
  eq(S.status.weather, '雾', '⑩ 天气是文档枚举里的值');
  eq(L[1], '迷雾森林大区 · 林缘哨所区 · 石碑遗迹', '⑩ 第 2 行是三级地点');
  eq(L[2], '雷恩 / 艾莉丝', '⑩ 第 3 行是在场人物的名字');

  /* ── 八个分区全都有内容（空分区看不出布局）── */
  const allOn = M.mergeSettings({ modules: MODS8.reduce((a, id) => (a[id] = true, a), {}) });
  const secs = M.sectionsOf(S, allOn);
  eq(secs.map(x => x.id), MODS8, '⑩ 八个分区一个不少');
  for (const sec of secs) { ok(sec.rows.length > 0, '⑩ 分区 ' + sec.id + ' 有内容（' + sec.rows.length + ' 行）'); }

  /* ── 剧透字段：开关开/关必须看得出差别 ── */
  const off = M.sectionsOf(S, allOn);
  const yaml2 = M.mergeSettings({ modules: allOn.modules, options: { showHidden: true } });
  const on = M.sectionsOf(S, yaml2);
  const flat = (xs) => JSON.stringify(xs);
  ok(flat(on).length > flat(off).length, '⑩ 打开「显示剧透字段」后面板内容变多（开关有差别）');
  const s = (xs, id) => xs.find(x => x.id === id);
  ok(!flat(s(off, 'lore')).includes('神明残骸'), '⑩ 关闭时 lore.truth 不出现');
  ok(flat(s(on, 'lore')).includes('神明残骸'), '⑩ 打开时 lore.truth 出现');
  ok(!flat(s(off, 'quests')).includes('警戒陷阱'), '⑩ 关闭时 quest.secret 不出现');
  ok(flat(s(on, 'quests')).includes('警戒陷阱'), '⑩ 打开时 quest.secret 出现');
  ok(!flat(s(off, 'characters')).includes('上古文明'), '⑩ 关闭时嵌套的 real_desc 也不出现');
  ok(flat(s(on, 'characters')).includes('上古文明') === false, '⑩ （real_desc 在地图模块里，这里再确认一次角色侧）');
  ok(!flat(s(off, 'map_nodes')).includes('上古文明'), '⑩ 关闭时地图的 real_desc 被过滤');
  ok(flat(s(on, 'map_nodes')).includes('上古文明'), '⑩ 打开时地图的 real_desc 出现');
  ok(flat(s(off, 'characters')).indexOf('公开羞耻') < 0, '⑩ 关闭时 latent_kinks 不出现');
  ok(flat(s(on, 'characters')).indexOf('公开羞耻') >= 0, '⑩ 打开时 latent_kinks 出现');

  /* ── 形状与真实数据一致：同一套归一化入口 ── */
  eq(M.pickStat({ stat_data: S }), S, '⑩ 示例数据能通过 pickStat 这同一条入口');
  eq(M.isEmptyStat(S), false, '⑩ 示例数据不算空');
  ok(M.shouldShowHeader(S, M.mergeSettings({ options: { useSample: true } })) === true, '⑩ 开了示例开关就能展开标题栏');
  /* 内容像一份真实冒险，不是"示例角色A" */
  const blob = JSON.stringify(S);
  ok(blob.indexOf('示例角色') < 0 && blob.indexOf('角色A') < 0 && blob.indexOf('待填') < 0, '⑩ 没有"A/B/示例角色"这类占位词');
  ok(blob.indexOf('雷恩') >= 0 && blob.indexOf('艾莉丝') >= 0, '⑩ 人名是具体名字');

  /* ── 默认关着：不主动开就永远看不到示例 ── */
  eq(M.defaultSettings().options.useSample, false, '⑩ 示例开关**默认关**（不主动开就看不到）');
  eq(M.mergeSettings({ options: { useSample: true } }).options.useSample, true, '⑩ 开了能记住');
  eq(M.mergeSettings({ options: { useSample: 'yes' } }).options.useSample, false, '⑩ 类型不对退回默认（关）');
}

console.log((fail ? '✗ ' : '✓ ') + '状态栏纯逻辑：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
