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
  'headerGeom', 'ribbonTextInset', 'MIN_RIBBON_W',
  'emptyStateText', 'panelTabPlan', 'isSampleOn',
  'layoutOf', 'clampUserWidth', 'BREAKPOINT', 'HANDLE_W', 'MIN_USER_W', 'MAX_USER_W',
  'splitWeatherIcon', 'viewStateOf', 'LOADING_MS',
  'buildNameIndex', 'resolveRef', 'resolveValue', 'isPlaceRef', 'NOISE_FIELDS', 'isNoiseField',
  'KEY_LABELS', 'labelOf',
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
  /* 键也要解析：characters 的键就是角色 ID，用户不该看到 char_player */
  ok(ch.rows.some(r => r.key === '雷恩'), '⑧ 角色区块的键是**解析后的名字**，不是 char_player');
  /* 剧透字段藏在第二层（characters.c1.real_desc）—— 必须递归过滤，只过滤顶层等于没过滤 */
  const c1 = ch.rows.find(r => r.key === '雷恩').value;
  ok(c1.name === '雷恩', '⑧ 实体里正常字段还在');
  ok(!('real_desc' in c1), '⑧ **第二层的剧透字段也被过滤掉**');

  const withHidden = M.sectionsOf(stat, M.mergeSettings({ options: { showHidden: true } }));
  ok('real_desc' in withHidden.find(s => s.id === 'characters').rows.find(r => r.key === '雷恩').value, '⑧ 打开选项后剧透字段出现');

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
  /* 用户 2026-10-05 改成**默认开**（调试期方便看布局；调完会删示例数据）。
     "真实数据优先"没有变 —— 那条在 readStat() 里，不在默认值里。 */
  eq(M.defaultSettings().options.useSample, true, '⑩ 示例开关**默认开**（调试期）');
  eq(M.mergeSettings({ options: { useSample: false } }).options.useSample, false, '⑩ 用户关掉能记住');
  eq(M.mergeSettings({ options: { useSample: 'yes' } }).options.useSample, true, '⑩ 类型不对退回默认（现在是开）');
}

/* ════════════════════════════════════════════════════════════
 * ⑪ 标题栏几何：从球背后向右探出（用户 2026-10-05 点名的三条）
 * ════════════════════════════════════════════════════════════ */
{
  const ball = { x: 100, y: 40, size: 112 };
  const g = M.headerGeom(ball, 800, 8);
  eq(g.left, 156, '⑪ **左缘落在球心 x**（100 + 112/2 = 156），不是左缘(100)也不是右缘(212)');
  eq(g.height, 112, '⑪ **高度等于图标高度**（同一个数）');
  eq(g.top, 40, '⑪ 顶边与球齐平');
  eq(g.width, 800 - 156 - 8, '⑪ 向右展开，按视口右边距夹过');
  ok(g.width > 0, '⑪ 正常情况下有宽度');

  /* 夹取后球最靠右能到 x = 视口宽 - 8；这时球心已经出了视口，横幅宽度必须夹到 0 */
  /* 球贴右缘：右边放不下就**镜像到左边**（右缘落在球心，向左展开） */
  const mirror = M.headerGeom({ x: 792, y: 0, size: 112 }, 800, 8);
  eq(mirror.dir, 'left', '⑪ 球贴右缘 → 方向翻到左边');
  eq(mirror.left + mirror.width, 792 + 56, '⑪ 镜像时**右缘落在球心**（792+56=848）');
  eq(mirror.left, 848 - (848 - 8), '⑪ 镜像时从球心往左铺到边距');
  eq(mirror.width, 848 - 8, '⑪ 镜像宽度 = 球心 - 边距');
  eq(mirror.height, 112, '⑪ 镜像时高度仍等于图标高度');
  ok(mirror.width > 0, '⑪ 镜像之后**宽度不再是 0**（用户能看出有数据）');
  /* 右边够宽就不镜像 */
  eq(M.headerGeom({ x: 100, y: 0, size: 64 }, 800, 8).dir, 'right', '⑪ 右边够宽 → 仍然向右');
  eq(M.headerGeom({ x: 700, y: 0, size: 64 }, 800, 8).dir, 'left', '⑪ 右边不够 160 → 向左');
  ok(M.MIN_RIBBON_W === 160, '⑪ 换边阈值是 160');
  eq(M.headerGeom({ x: 100, y: 0, size: 112 }, 0, 8).width, 0, '⑪ 视口宽为 0 时宽度 0');
  ok(M.headerGeom({ x: 100, y: 0, size: 112 }, 400, 8).width >= 0, '⑪ 窄屏也不给负数宽度');

  eq(M.headerGeom(null, 800, 8).height, 0, '⑪ 传 null 不炸');
  ok(isFinite(M.headerGeom({}, 800, 8).left), '⑪ 缺字段也给有限数');
  eq(M.headerGeom({ x: 0, y: 0, size: 112 }, 800, -5).width, 800 - 56 - 8, '⑪ 负的边距退回默认 8（left=56，宽度 800-56-8=736）');

  const g2 = M.headerGeom({ x: 0, y: 0, size: 200 }, 800, 8);
  eq([g2.left, g2.height], [100, 200], '⑪ 球尺寸变了，左缘与高度都跟着走');

  /* 用户 2026-10-05 把尺寸从 112 收到 64（面积约 1/3）—— 实际默认值下的几何要钉住 */
  const g64 = M.headerGeom({ x: 60, y: 60, size: 64 }, 900, 8);
  eq([g64.left, g64.top, g64.height], [92, 60, 64], '⑪ 默认 64px 球：左缘=球心 92、顶边 60、高 64');
  eq(g64.width, 900 - 92 - 8, '⑪ 默认 64px 球：横幅宽度 800');
  eq(M.ribbonTextInset(64, 10), 42, '⑪ 64px 球时文字内缩 42px（半个球宽 32 + 10）');
  /* 面积比：112² / 64² = 3.0625 ≈ 3 倍 —— 这正是用户要的"面积降到约三分之一" */
  eq(Math.round((112 * 112) / (64 * 64) * 100) / 100, 3.06, '⑪ 112 → 64 使面积降到约 1/3（3.06 倍差）');

  eq(M.ribbonTextInset(112, 8), 64, '⑪ 文字内缩 = 半个球宽 + 额外间距');
  eq(M.ribbonTextInset(0, 8), 8, '⑪ 尺寸为 0 时只剩额外间距');
  eq(M.ribbonTextInset(-5, 8), 8, '⑪ 负数尺寸不产生负内缩');
}

/* ════════════════════════════════════════════════════════════
 * ⑫ 空态引导句：每个模块分区的空态都要带 emptyHint
 *   用户 2026-10-05：光说"没有内容"用户会以为是坏的，得告诉他怎么才会有内容。
 *   这条断言的价值在于**将来新增分区时漏不掉** —— 它逐个模块走一遍。
 * ════════════════════════════════════════════════════════════ */
{
  ok(typeof M.STATUS_COPY.emptyHint === 'string' && M.STATUS_COPY.emptyHint.length > 0, '⑫ emptyHint 键在');
ok(M.STATUS_COPY.emptyHint.indexOf('【占位') < 0 && M.STATUS_COPY.emptyHint.length >= 6, '⑫ 文案已落地（不是占位、也不是空串）');

  /* 逐个模块：给它一份**完全没有数据**的 stat，该分区必须是空态、且带引导句 */
  const emptyStat = {};
  for (const mod of M.MODULES) {
    const st = M.mergeSettings({ modules: { [mod.id]: true }, options: { useSample: false } });
    const plan = M.panelTabPlan(emptyStat, st, mod.id);
    eq(plan.kind, 'empty', '⑫ 分区 ' + mod.id + ' 在无数据时是空态');
    eq(plan.rows.length, 0, '⑫ 分区 ' + mod.id + ' 的空态没有行');
    ok(plan.lines.join(' ').indexOf(M.STATUS_COPY.emptyHint) >= 0, '⑫ 分区 ' + mod.id + ' 的空态**带引导句**');
    ok(plan.lines.length >= 1, '⑫ 分区 ' + mod.id + ' 的空态不是一片空白');
  }
  /* 八个模块一个都不能漏 */
  eq(M.MODULES.length, 8, '⑫ 八个模块都被上面那个循环覆盖到了');

  /* 有数据时当然不是空态 */
  const withData = M.panelTabPlan(M.SAMPLE_STAT, M.mergeSettings({ modules: { status: true } }), 'status');
  eq(withData.kind, 'rows', '⑫ 有数据时不是空态');
  ok(withData.rows.length > 0, '⑫ 有数据时有行可画');

  /* 与"无数据时显示示例"不打架：示例开着时不该同时喊"没有数据" */
  const sampleOn = M.mergeSettings({ options: { useSample: true } });
  const linesOn = M.emptyStateText({ isSample: true });
  ok(linesOn.indexOf(M.STATUS_COPY.noData) < 0, '⑫ **示例开着时空态不说"没有数据"**（自相矛盾）');
  ok(linesOn.indexOf(M.STATUS_COPY.emptyHint) >= 0, '⑫ 示例开着时仍留引导句');
  const linesOff = M.emptyStateText({ isSample: false });
  ok(linesOff.indexOf(M.STATUS_COPY.noData) >= 0, '⑫ 示例关着时正常说"没有数据"');
  ok(linesOff.indexOf(M.STATUS_COPY.emptyHint) >= 0, '⑫ 示例关着时也带引导句');
  eq(M.panelTabPlan(emptyStat, sampleOn, 'lore').lines.join('|').indexOf(M.STATUS_COPY.noData), -1,
    '⑫ 走完整链路验一次：示例开着 → lore 空态里没有"没有数据"');
  eq(M.isSampleOn(sampleOn), true, '⑫ isSampleOn 读得对');
  eq(M.isSampleOn(M.defaultSettings()), true, '⑫ 默认就是开着的（调试期）');

  /* 设置页不是空态（它有自己的内容） */
  eq(M.panelTabPlan(emptyStat, M.defaultSettings(), '__settings').kind, 'settings', '⑫ 设置页走自己的分支');

  /* 源码级：面板的空态必须走这条路，不许在 DOM 层另写一套 */
  const src80 = readFileSync(new URL('../../src/scripts/80-状态栏.js', import.meta.url), 'utf8');
  ok(src80.indexOf('panelTabPlan(') >= 0, '⑫ 80 号的面板空态走 panelTabPlan');
  ok(src80.indexOf("STATUS_COPY.noData") < 0, '⑫ 80 号里没有绕过纯函数直接写 noData 的地方');
}

/* ════════════════════════════════════════════════════════════
 * ⑬ 自适应布局 layoutOf：断点 / 手机满宽 / 内容撑开 / 调宽 / 镜像复核 / 连体面板
 * ════════════════════════════════════════════════════════════ */
{
  const B = (x, y, size) => ({ x: x, y: y, size: size });
  const F = (o) => M.layoutOf(Object.assign({ ball: B(40, 40, 64), viewW: 1440, contentW: 200, edgeGap: 8 }, o));

  /* ── 断点 640 两侧 ── */
  eq(M.BREAKPOINT, 640, '⑬ 断点是 640');
  eq(F({ viewW: 639 }).mobile, true, '⑬ 639 → 手机');
  eq(F({ viewW: 640 }).mobile, false, '⑬ 640 → PC（断点归 PC）');
  eq(F({ viewW: 641 }).mobile, false, '⑬ 641 → PC');
  eq(F({ viewW: 390 }).mobile, true, '⑬ 390 → 手机');
  eq(F({ viewW: 1440 }).mobile, false, '⑬ 1440 → PC');
  eq(F({ viewW: 390, isMobile: false }).mobile, false, '⑬ isMobile 显式给了就听它的');

  /* ── 手机：连球一起占满整行 ── */
  const m = F({ viewW: 390, ball: B(16, 30, 64) });
  eq(m.left, 16, '⑬ **手机横幅左缘 = 球的左缘**（球成了排头，不再压住横幅）');
  eq(m.width, 390 - 16 - 8, '⑬ 手机横幅铺到右边距 → 球+横幅**占满整行**');
  eq(m.height, 64, '⑬ 手机高度仍等于图标高度');
  eq(m.dir, 'right', '⑬ 手机永远向右（满宽没有镜像的意义）');
  const m0 = F({ viewW: 390, ball: B(0, 30, 64) });
  eq(m0.left + m0.width, 390 - 8, '⑬ 球贴左缘时横幅一路铺到右边距');
  eq(F({ viewW: 390, ball: B(500, 30, 64) }).left, 390, '⑬ 球跑到视口外时左缘夹进视口');

  /* ── PC：内容撑开 ── */
  const d = F({ viewW: 1440, contentW: 300, ball: B(40, 40, 64) });
  eq(d.left, 72, '⑬ PC 左缘落在球心（40 + 64/2）');
  eq(d.width, 300, '⑬ PC **由内容撑开**：内容 300 → 横幅 300');
  eq(d.height, 64, '⑬ PC 高度等于图标高度');
  eq(F({ viewW: 1440, contentW: 40 }).width, M.MIN_RIBBON_W, '⑬ 内容太窄时兜到最小可用宽 160');
  eq(F({ viewW: 1440, contentW: 0 }).width, M.MIN_RIBBON_W, '⑬ 内容量不到时也给最小可用宽');

  /* ── 调宽覆盖 ── */
  eq(F({ viewW: 1440, contentW: 300, userWidth: 500 }).width, 500, '⑬ **用户调宽覆盖内容撑开**');
  eq(F({ viewW: 1440, contentW: 300, userWidth: 220 }).width, 220, '⑬ 调窄也生效');
  eq(M.clampUserWidth(10, 1440), M.MIN_USER_W, '⑬ 调窄到极限以下 → 夹到最小 160');
  eq(M.clampUserWidth(99999, 1440), M.MAX_USER_W, '⑬ 调宽到极限以上 → 夹到最大 1200');
  eq(M.clampUserWidth(99999, 500), 500 - 16, '⑬ 宽度不许超过视口（留 16 边距）');
  eq(M.clampUserWidth(null, 1440), null, '⑬ 没调过 → null（走内容撑开）');
  eq(M.clampUserWidth(0, 1440), null, '⑬ 0 也算没调过');
  eq(M.clampUserWidth('abc', 1440), null, '⑬ 脏值当没调过，不炸');

  /* ── 双击复位 ── */
  const reset = F({ viewW: 1440, contentW: 300, userWidth: null });
  eq(reset.width, 300, '⑬ **双击复位 = userWidth 清成 null → 回到内容撑开**');
  eq(F({ viewW: 1440, contentW: 300, userWidth: 600 }).width, 600, '⑬ 复位前是用户宽');
  eq(F({ viewW: 1440, contentW: 300, userWidth: null }).width, 300, '⑬ 复位后回到内容宽');

  /* ── 调宽后镜像复核 ── */
  const nearRight = F({ viewW: 800, ball: B(680, 40, 64), contentW: 100 });
  ok(nearRight.dir === 'right' || nearRight.dir === 'left', '⑬ 贴右缘时给一个确定方向');
  eq(F({ viewW: 800, ball: B(680, 40, 64), contentW: 100 }).dir, 'left', '⑬ 球贴右缘、内容窄 → 向右放不下 → 镜像向左');
  eq(F({ viewW: 800, ball: B(680, 40, 64), contentW: 100, userWidth: 800 }).dir, 'left', '⑬ **调很宽之后仍然镜像向左**（复核过）');
  const wide = F({ viewW: 800, ball: B(680, 40, 64), contentW: 100, userWidth: 800 });
  eq(wide.left + wide.width, 712, '⑬ 镜像时右缘落在球心 712');
  ok(wide.width > 0, '⑬ 镜像后宽度不为 0');
  /* 反过来：球在左边、用户拖得很宽。右边能放 660、左边只有 124 ——
     **不许翻边**：翻过去反而更窄，而且横幅会平白跳到球的另一侧。夹到右边余量才对。 */
  const grew = F({ viewW: 800, ball: B(100, 40, 64), contentW: 100, userWidth: 700 });
  eq(grew.dir, 'right', '⑬ 球在左、拖得很宽 → 右边仍放得下更多 → **留在右边**（不翻边）');
  eq(grew.width, 800 - 132 - 8, '⑬ 宽度夹到右边的余量 660');
  eq(grew.left, 132, '⑬ 左缘仍在球心，用户拖手柄的手感不变');
  ok(grew.width > 0, '⑬ 仍有宽度');
  /* 两边都放不下 → 取空间大的那边、夹到余量 */
  const tight = F({ viewW: 300, ball: B(150, 40, 64), contentW: 100, userWidth: 1200, isMobile: false });
  eq(tight.dir, 'left', '⑬ 两边都放不下时取空间大的一边（球心 182，左边 174 > 右边 110）');
  eq(tight.width, 174, '⑬ 宽度夹到那边的余量');
  ok(tight.width >= 0, '⑬ 任何情况下都不给负宽度');
  eq(F({ viewW: 0 }).width, 0, '⑬ 视口量不到 → 宽度 0');
  eq(F({ viewW: 60, isMobile: false, ball: B(0, 0, 64) }).width >= 0, true, '⑬ 极窄 PC 也不给负数');

  /* ── 连体面板：共享一条边 ── */
  for (const c of [d, m, nearRight, wide, grew, tight]) {
    eq(c.panel.left, c.left, '⑬ **面板左缘 = 横幅左缘**');
    eq(c.panel.top, c.top + c.height, '⑬ **面板上缘 = 横幅下缘**（共享边，读数 0）');
    eq(c.panel.width, c.width, '⑬ 面板与横幅同宽（像从横幅长出来）');
  }

  /* ── 拖动同步：球一动，横幅与面板一起动 ── */
  const at40 = F({ viewW: 1440, contentW: 300, ball: B(40, 40, 64) });
  const at140 = F({ viewW: 1440, contentW: 300, ball: B(140, 40, 64) });
  eq(at140.left - at40.left, 100, '⑬ 球右移 100 → 横幅左缘也右移 100');
  eq(at140.panel.left - at40.panel.left, 100, '⑬ **面板跟着一起移**（同一个几何来源）');
  eq(at140.panel.top, at40.panel.top, '⑬ 只横移时面板上缘不变');
  const down = F({ viewW: 1440, contentW: 300, ball: B(40, 90, 64) });
  eq(down.left, at40.left, '⑬ 只纵移时横幅左缘不变');
  eq(down.panel.top - at40.panel.top, 50, '⑬ 球下移 50 → 面板也跟着下移 50');

  /* ── 手柄 ── */
  eq(d.gripLeft, d.left + d.width - M.HANDLE_W, '⑬ 右手柄贴在横幅右端');
  const lg = F({ viewW: 800, ball: B(680, 40, 64), contentW: 100 });
  eq(lg.gripLeft, lg.left, '⑬ 镜像向左时手柄换到左端（跟着展开方向走）');
}

/* ════════════════════════════════════════════════════════════
 * ⑭ 天气图标拆分（基线对齐用）+ 三态判定（空 / 加载中 / 有数据）
 * ════════════════════════════════════════════════════════════ */
{
  /* 图标拆分：拆得出来才包一层去压基线，拆不出来原样返回 —— 绝不丢字 */
  eq(M.splitWeatherIcon('第四纪元-2023年-11月-15日-15:00 🌫️'), { text: '第四纪元-2023年-11月-15日-15:00', icon: '🌫️' }, '⑭ 时间行拆出图标');
  eq(M.splitWeatherIcon('某时 · 下猫下狗'), { text: '某时 · 下猫下狗', icon: '' }, '⑭ 认不出的天气没有图标可拆，原文完整保留');
  eq(M.splitWeatherIcon('☀️'), { text: '', icon: '☀️' }, '⑭ 只有图标时文字为空');
  eq(M.splitWeatherIcon(''), { text: '', icon: '' }, '⑭ 空串不炸');
  eq(M.splitWeatherIcon(null), { text: '', icon: '' }, '⑭ null 不炸');
  eq(M.splitWeatherIcon('第四纪元 🌧️'), { text: '第四纪元', icon: '🌧️' }, '⑭ 拆完不带多余空格');
  ok(M.splitWeatherIcon('第四纪元 ⛈️').icon.length > 0, '⑭ ⛈️ 这种组合 emoji 也认得');
  /* 拼接回去必须与原文一致（除空格规整外），证明没吞字 */
  for (const w of ['☀️','🌧️','☁️','❄️','🌫️','🌬️','⛈️','🌪️','☣️','✨']) {
    const r = M.splitWeatherIcon('测试时间 ' + w);
    eq(r.text + ' ' + r.icon, '测试时间 ' + w, '⑭ 图标 ' + w + ' 拆完拼回原样');
  }

  /* 三态 */
  eq(M.LOADING_MS, 8000, '⑭ 加载窗口 8 秒');
  eq(M.viewStateOf({ hasData: true, elapsedMs: 0 }), 'data', '⑭ 有数据 → data');
  eq(M.viewStateOf({ hasData: true, elapsedMs: 99999 }), 'data', '⑭ 有数据永远优先，超时也不受影响');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 0 }), 'loading', '⑭ **刚启动没数据 → loading（不是 empty）**');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 7999 }), 'loading', '⑭ 窗口内仍是 loading');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 8000 }), 'empty', '⑭ 到点翻成 empty');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 60000 }), 'empty', '⑭ 超时之后一直是 empty');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 0, timeoutMs: 0 }), 'empty', '⑭ 窗口为 0 时立刻是 empty');
  eq(M.viewStateOf({}), 'loading', '⑭ 什么都不传按"刚启动、没数据"算');
  eq(M.viewStateOf({ hasData: false, elapsedMs: -5 }), 'loading', '⑭ 负数耗时当 0');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 100, timeoutMs: 'abc' }), 'loading', '⑭ 脏超时退回默认窗口');
  eq(M.viewStateOf({ hasData: false, elapsedMs: 9000, timeoutMs: 'abc' }), 'empty', '⑭ 脏超时退回默认后仍会翻 empty');

  /* 源码级：这三态真的接进了渲染，不是只在纯逻辑里躺着 */
  const src80 = readFileSync(new URL('../../src/scripts/80-状态栏.js', import.meta.url), 'utf8');
  ok(src80.indexOf('viewStateOf(') >= 0, '⑭ 80 号用了 viewStateOf');
  ok(src80.indexOf("setAttribute('data-kami-view'") >= 0, '⑭ 三态写到了 data-kami-view');
  ok(src80.indexOf('splitWeatherIcon(') >= 0, '⑭ 80 号用了 splitWeatherIcon');
  ok(src80.indexOf("'kami-status-wx'") >= 0, '⑭ 图标真的包了一层（基线对齐才有作用点）');
  /* B 轮三个缺陷的源码级防线 */
  ok(src80.indexOf('flex:0 0 auto;width:max-content') >= 0, '⑭ head 不压缩（缺陷 3 的根因防线）');
  ok(src80.indexOf('sampleTagEl = mk(') < 0, '⑭ **不再创建示例徽标**（缺陷 1）');
  ok(src80.indexOf("STATUS_COPY.label + (currentIsSample") < 0, '⑭ **面板标题不再缀「（示例）」**（缺陷 2）');
}

/* ════════════════════════════════════════════════════════════
 * ⑮ 面板不再显示原始 ID / 字段名（Lead 2026-10-06 点出的内容层缺陷）
 *   硬要求：**渲染结果里不许出现下划线形式的原始 ID**
 * ════════════════════════════════════════════════════════════ */
{
  const S = M.SAMPLE_STAT;
  /* 索引本身 */
  const idx = M.buildNameIndex(S);
  eq(idx['char_player'], '雷恩', '⑮ 索引收得到角色');
  eq(idx['realm_forest'], '迷雾森林大区', '⑮ 索引收得到地图大区');
  eq(idx['area_woods_entry'], '林缘哨所区', '⑮ 索引收得到区域');
  eq(idx['spot_ancient_altar'], '石碑遗迹', '⑮ 索引收得到地点');
  eq(idx['faction_dawn'], '晨曦骑士团', '⑮ 索引收得到势力');
  eq(idx['estate_hunter_cabin'], '林间废弃猎人小屋', '⑮ 索引收得到据点');
  eq(idx['quest_scout'], '遗迹的侦察委托', '⑮ 索引收得到任务');
  eq(idx['line_holy_relic'], '圣印窃案的真相', '⑮ 索引收得到剧情线');
  eq(idx['mount_horse'], '杂色驽马', '⑮ 索引收得到坐骑');
  eq(idx['不存在的ID'], undefined, '⑮ 索引里没有的就是没有');
  eq(M.buildNameIndex(null), {}, '⑮ 空数据建索引不炸');
  eq(M.resolveRef('char_player', idx), '雷恩', '⑮ 解析：ID → 名字');
  eq(M.resolveRef('未知ID', idx), '未知ID', '⑮ 解析不到**退回原值**（不显示成空）');
  eq(M.resolveRef(42, idx), 42, '⑮ 非字符串原样返回');
  eq(M.resolveValue(['char_player', 'char_heroine'], idx), ['雷恩', '艾莉丝'], '⑮ 数组里的 ID 也解析');
  eq(M.isPlaceRef({ realm: 'x' }), true, '⑮ 认得地点结构');
  eq(M.isPlaceRef({ name: 'x' }), false, '⑮ 普通对象不是地点结构');

  /* 三个字段合成一行地名，不是三行 ID */
  const allOn = M.mergeSettings({ modules: M.MODULES.reduce((a, m) => (a[m.id] = true, a), {}) });
  const secs = M.sectionsOf(S, allOn);
  const st = secs.find(x => x.id === 'status');
  /* 标签是"占位 + 键名"，所以能按键定位（不带键名的话这里只能按值找，很脆） */
  const loc = st.rows.find(r => r.key === M.KEY_LABELS['location']);
  ok(!!loc, '⑮ 找得到地点那一行');
  eq(loc.value, '迷雾森林大区 · 林缘哨所区 · 石碑遗迹', '⑮ **地点三个字段合成一行可读地名**');
  /* 三个 ID 合成了**一行**：整段里不该再出现任何一个原始地名 ID */
  const statusBlob = JSON.stringify(st);
  ok(statusBlob.indexOf('realm_forest') < 0 && statusBlob.indexOf('area_woods_entry') < 0
    && statusBlob.indexOf('spot_ancient_altar') < 0, '⑮ 地点三个原始 ID 都不在渲染结果里');
  eq(st.rows.filter(r => String(r.value).indexOf('迷雾森林大区') >= 0).length, 1, '⑮ 地点只占一行，不是三行');

  /* ── 硬要求：整份渲染里不许有下划线形式的原始 ID ── */
  /* 区分两件事：
     · **字段名**（present_chars / map_nodes 这种）是 schema 的名字，允许出现 —— 它们不是 ID；
     · **实体 ID**（char_player / area_woods_entry）必须换成人话，一个都不许漏。
     判据就是"这个字符串是不是名字索引里的一个键"。 */
  const IDLIKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
  const rawIds = new Set(Object.keys(M.buildNameIndex(S)));
  const leakedValues = [];
  const leakedKeys = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (IDLIKE.test(v)) { leakedValues.push(path + ' = ' + v); } return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
    if (v && typeof v === 'object') { Object.keys(v).forEach(k => walk(v[k], path + '.' + k)); }
  };
  for (const sec of M.sectionsOf(S, allOn)) {
    for (const row of sec.rows) {
      walk(row.value, sec.id + '.' + row.key);
      if (rawIds.has(row.key)) { leakedKeys.push(sec.id + '.key = ' + row.key); }
    }
  }
  eq(leakedValues, [], '⑮ **渲染出来的值里没有任何下划线形式的原始 ID**');
  eq(leakedKeys, [], '⑮ **没有任何实体 ID 还留在键上**（char_player 这种）');
  /* 索引里的 ID 一个都不能出现在渲染结果里（正面列举，比正则更死） */
  const blob = JSON.stringify(M.sectionsOf(S, allOn));
  const stillRaw = [...rawIds].filter(id => blob.indexOf('"' + id + '"') >= 0);
  eq(stillRaw, [], '⑮ 名字索引里的每个 ID 都不再以原样出现在渲染结果里');

  /* 键名也换了：characters 的键是名字 */
  const chs = secs.find(x => x.id === 'characters');
  ok(chs.rows.some(r => r.key === '雷恩') && chs.rows.some(r => r.key === '艾莉丝'),
    '⑮ 角色实体的键是名字');
  /* 纯记账字段被省掉 */
  ok(!chs.rows.some(r => r.key === 'is_user' || r.key === M.labelOf('is_user')), '⑮ is_user 这类记账字段省掉');
  const items = (chs.rows.find(r => r.key === '雷恩').value || {}).items || {};
  const firstItem = items[Object.keys(items)[0]] || {};
  /* 注意：equipped 只在**第一层**被省（sectionsOf 那一层）；items 是第二层，
     由 80 号的 renderValue 逐层过滤。这里断言的是"深层的键仍然解析成名字"。 */
  ok(!Object.keys(items).some(k => IDLIKE.test(k)), '⑮ 道具的键（item_longbow）也换成了名字');
  ok(firstItem.name === '精钢猎弓', '⑮ 道具解析后拿得到名字');

  /* 剧透开关仍然独立生效（别被这轮改动带坏） */
  const on = M.sectionsOf(S, M.mergeSettings({ modules: allOn.modules, options: { showHidden: true } }));
  ok(JSON.stringify(on).length > JSON.stringify(secs).length, '⑮ 剧透开关仍然有效');

  /* 源码级：面板与标题栏**共用**同一份解析，不是各写一套 */
  const src80 = readFileSync(new URL('../../src/scripts/80-状态栏.js', import.meta.url), 'utf8');
  ok(src80.indexOf('buildNameIndex(') >= 0, '⑮ 面板用了共用的 buildNameIndex');
  ok(src80.indexOf('resolveRef(') >= 0, '⑮ 面板用了共用的 resolveRef');
  ok(src80.indexOf('function buildNameIndex') < 0, '⑮ 80 号里**没有第二份**索引实现');
  ok(src80.indexOf('function locationText') < 0, '⑮ 80 号里**没有第二份**地名解析');
}

/* ════════════════════════════════════════════════════════════
 * ⑯ 面板字段名中文化：查表 / 占位前缀 / 未登记退回原键名
 * ════════════════════════════════════════════════════════════ */
{
  ok(!!M.KEY_LABELS && typeof M.KEY_LABELS === 'object', '⑯ KEY_LABELS 表在');
  const keys = Object.keys(M.KEY_LABELS);
  ok(keys.length >= 110, '⑯ 表里登记了足够多的 schema 键（实际 ' + keys.length + ' 个）');
  /* 从手写变量文档的 schema 枚举出来的四套 RPG 模块组属性：DND 之外的三套也要有标签，
     否则用 FU / WOD / FATE 的人会看到一屏英文原名（清单漏了不会有人想起来） */
  for (const k of ['might','agility','insight','willpower','sta','wits','res','pre','man','com',
                   'physique','athletics','melee','shoot','notice','empathy','rapport','deceive',
                   'provoke','contacts','investigate','crafts','burglary','stealth','drive','resources','will','tag_name']) {
    ok(k in M.KEY_LABELS, '⑯ 文档里那四套 RPG 模块组的字段 ' + k + ' 也登记了');
  }

  /* ① 只要是**占位**，就必须以占位前缀开头 —— 防止实现自己编文案。
     这条对"文案已交付"也成立：真的文案里不该出现「占位」二字。
     （所以刻意写成"含占位标记就必须以它开头"，而不是"必须等于占位"——
      这样文案 Agent 交稿后这条断言照样守着，不用改测试。） */
  const PLACEHOLDER = '【占位·待文案】';
  const badPrefix = keys.filter(k => {
    const v = String(M.KEY_LABELS[k]);
    return v.indexOf(PLACEHOLDER) >= 0 && v.indexOf(PLACEHOLDER) !== 0;
  });
  eq(badPrefix, [], '⑯ **凡带占位标记的，都以「【占位·待文案】」开头**（实现不自己编）');
  /* ② 占位阶段要**带键名** —— 否则每一行左边都长一样，面板等于不可用 */
  const noKey = keys.filter(k => String(M.KEY_LABELS[k]) === PLACEHOLDER);
  eq(noKey, [], '⑯ 占位值都带上了键名（面板上分得清哪行是哪个字段）');
  const wrongKey = keys.filter(k => {
    const v = String(M.KEY_LABELS[k]);
    return v.indexOf(PLACEHOLDER) === 0 && v.indexOf(k, PLACEHOLDER.length) < 0;
  });
  eq(wrongKey, [], '⑯ 占位值里的键名与它自己的键一致');
  const empty = keys.filter(k => !M.KEY_LABELS[k]);
  eq(empty, [], '⑯ 没有空标签');

  /* ② 查表路径 */
  eq(M.labelOf('location'), M.KEY_LABELS['location'], '⑯ 查得到就走表里的标签');
  eq(M.labelOf('weather'), M.KEY_LABELS['weather'], '⑯ weather 也查得到');

  /* ③ 未登记就退回原键名 —— 新字段不会因为没人登记而消失 */
  eq(M.labelOf('一个还没登记的新字段'), '一个还没登记的新字段', '⑯ **未登记退回原键名**');
  eq(M.labelOf('brand_new_field'), 'brand_new_field', '⑯ 未登记的英文键也退回原样');
  eq(M.labelOf(''), '', '⑯ 空键返回空串');
  eq(M.labelOf(null), '', '⑯ null 不炸');
  eq(M.labelOf(undefined), '', '⑯ undefined 不炸');
  /* 实体名（数据）不在表里，照原样显示 */
  eq(M.labelOf('雷恩'), '雷恩', '⑯ 实体名是数据，不进表也不被改');

  /* ④ 渲染真的走了查表路径（不是只在纯逻辑里躺着） */
  const S = M.SAMPLE_STAT;
  const allOn = M.mergeSettings({ modules: M.MODULES.reduce((a, m) => (a[m.id] = true, a), {}) });
  const secs = M.sectionsOf(S, allOn);
  const st = secs.find(x => x.id === 'status');
  /* 标签是占位串时所有键**长得一样**，所以这里断言"没有一个键还是原始 schema 键" */
  ok(!st.rows.some(r => r.key === 'time' || r.key === 'weather' || r.key === 'location' || r.key === 'round'),
    '⑯ **面板上不再有原始 schema 键名**（都查过表了）');
  /* 现在每行标签各不相同（占位里带了键名），所以可以**按键定位**了 ——
     这正是采纳"占位+键名"那条建议带来的好处。 */
  ok(st.rows.some(r => r.key === M.KEY_LABELS['time']), '⑯ status 的时间行用的是表里的标签');
  ok(st.rows.some(r => r.key === M.KEY_LABELS['location']), '⑯ 地点行也用表里的标签');
  ok(st.rows.every(r => String(r.key).indexOf('【占位·待文案】') === 0), '⑯ status 每一行的键都来自表');
  /* 登记齐全时不该有任何一个键退回原样 */
  const allOnKeys = secs.flatMap(x => x.rows.map(r => r.key));
  ok(!allOnKeys.some(k => /^[a-z][a-z0-9_]*$/.test(k)),
    '⑯ 登记齐全的分区里，没有键退回成英文原名（实际退回 ' +
    JSON.stringify(allOnKeys.filter(k => /^[a-z][a-z0-9_]*$/.test(k)).slice(0, 5)) + '）');

  /* ⑤ 未登记的键在真实渲染里照样出现（拿掉一个键的登记试试） */
  const saved = M.KEY_LABELS['health'];
  delete M.KEY_LABELS['health'];
  const chs = M.sectionsOf(S, allOn).find(x => x.id === 'characters');
  const one = chs.rows.find(r => r.key === '雷恩').value || {};
  ok('health' in one, '⑯ 拿掉登记后 health 字段本身还在（不丢字段）');
  /* health 在**第二层**（characters.雷恩.health），sectionsOf 只出顶层行 ——
     所以这里验的是"没登记时 labelOf 退回原键名"，渲染层照它显示就是英文键。 */
  eq(M.labelOf('health'), 'health', '⑯ **未登记的键退回原键名**（面板上会直接显示 health）');
  ok('health' in one, '⑯ 值本身没丢（只是标签退回原键名）');
  M.KEY_LABELS['health'] = saved;
  eq(M.labelOf('health'), saved, '⑯ 登记恢复');

  /* ⑥ 故意不换的键：纯记账字段已经整条省掉，压根不需要标签 */
  for (const noise of M.NOISE_FIELDS) {
    ok(!(noise in M.KEY_LABELS), '⑯ 记账字段 ' + noise + ' 故意不登记（它根本不会渲染）');
  }

  /* ⑦ 源码级：渲染路径必须查表 */
  const src80 = readFileSync(new URL('../../src/scripts/80-状态栏.js', import.meta.url), 'utf8');
  ok(src80.indexOf('labelOf(') >= 0, '⑯ 80 号渲染时查表');
  ok(src80.indexOf('KEY_LABELS') < 0, '⑯ 80 号里没有第二份标签表（表只有一份）');
}

console.log((fail ? '✗ ' : '✓ ') + '状态栏纯逻辑：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
