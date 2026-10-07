/* ============================================================================
 * 📊 状态栏前端的纯逻辑（数据 → 视图的映射）
 * ----------------------------------------------------------------------------
 * 用户 2026-10-05 拍板：先把前端做出来，别等 MVU 链路验通。
 *   · 没有数据 → 只有一颗球（icon）；
 *   · 有数据 → 球展开成**三行小字标题栏**（时间+天气 / 地点 / 在场人物）；
 *   · 点标题栏 → 展开完整面板，最后一个 tab 是设置页。
 *
 * 这个模块只做**纯计算**：变量形状的容错取值、空数据判定、三行标题栏的文字与图标、
 * 模块开关的默认值与合并、字段的自适应分类。DOM / 拖拽 / 持久化全在 80 号那边。
 *
 * 为什么要单独一份：这一堆映射（模块清单、默认开关、天气图标、字段分类）是最容易
 * 两边写岔的东西，做成纯函数就能离线单测，不必真机跑 MVU。
 *
 * 内联规则同其它共享模块：零 import、只有行首 export。
 * 同样**不许出现美元符号**（免得将来被内联进前端时炸）。
 * ============================================================================ */

/* ── 新增界面文案：**集中在这里，等文案 Agent 出稿**。值是占位，不是最终稿。 ── */
export var STATUS_COPY = {
  label: '剧情状态栏',
  tip: '点击查看当前剧情',
  noData: '当前还没有剧情记录',
  /* 空态**引导句**：光说"没有内容"用户会以为是坏的，得告诉他怎么才会有内容。
     用户 2026-10-05 点名要加；文案由文案 Agent 出稿，这里先是占位、**不要自己编**。 */
  emptyHint: '可在设置里开启无数据时显示示例预览布局，继续对话后会自动填充',
  expandHint: '点击展开查看详情',
  close: '关闭',
  gripTip: '【占位·待文案】拖动可调整宽度，双击恢复默认',
  gripLabel: '【占位·待文案】调整标题栏宽度',
  loading: '【占位·待文案】正在读取剧情状态…',
  settingsTab: '设置',
  settingsModules: '模块显示开关',
  settingsOptions: '界面显示选项',
  optShowHeader: '有数据时展开标题栏',
  optShowHeaderHint: '关闭后不会展开标题栏，屏幕上始终只显示悬浮球',
  optShowHidden: '显示剧透内容',
  optShowHiddenHint: '会展示未公开的隐藏设定，可能提前剧透，请谨慎开启',
  optUseSample: '无数据时显示示例',
  optUseSampleHint: '仅在无真实数据时生效，一旦读到真实数据就自动让位',
  sampleTag: '示例',
  optResetPos: '恢复默认位置',
  saved: '设置已保存',
  secStatus: '状态',
  secCharacters: '角色',
  secMap: '地图',
  secFactions: '势力',
  secStorylines: '剧情线',
  secQuests: '任务',
  secEstates: '不动产',
  secLore: '设定集'
};


/* ============================================================================
 * 内置示例数据（用户 2026-10-05：先内置一套数据用来测试状态栏）
 * ----------------------------------------------------------------------------
 * 用途**只有两个**：让用户看面板布局、让预览台/单测有个稳定的输入。
 * 形状严格照 design/_discussion/mvu/手写变量结构.yaml 写：
 *   · 八个顶层模块全填（空分区看不出布局）；
 *   · 互斥的 RPG 模块组按文档选 **D&D 那套**（stats.dnd 六维，1-20）；
 *   · 剧透字段（real_desc / secret / truth / latent_kinks）都放上，
 *     这样"显示剧透字段"开关开/关都能看出差别；
 *   · 三行标题栏的四个字段齐（time / weather / location / present_chars），
 *     weather 用文档里那个 11 项枚举里的值（'雾'），保证能命中图标映射。
 *
 * ⚠️ 它**绝不是真实剧情数据**，也不会被当成真实的：
 *   ① 默认**关着**（settings.options.useSample = false），用户不主动开就永远看不到；
 *   ② 真实数据**优先**：readStat() 先读楼层变量，只有"读不到 + 允许示例"才轮到它；
 *   ③ 开着的时候界面**处处标着"示例"**（球上带 data-kami-sample、标题栏第一行有示例标、
 *      面板标题也带），不会让人误以为自己的剧情真的有这些变量。
 *
 * 单测会拿这份数据走**与真实数据完全相同**的归一化路径（pickStat → headerLines →
 * sectionsOf），并且逐键比对手写变量文档 —— 文档改了字段而这份没跟上会立刻报错。
 * ============================================================================ */
export var SAMPLE_STAT = {
  status: {
    round: 12,
    time: '第四纪元-2023年-11月-15日-15:00',
    location: { realm: 'realm_forest', area: 'area_woods_entry', spot: 'spot_ancient_altar' },
    weather: '雾',
    present_chars: ['char_player', 'char_heroine']
  },
  characters: {
    char_player: {
      is_user: true,
      name: '雷恩',
      alias: '灰狼',
      role: 'user',
      age: '24',
      identities: ['流浪游侠', '前骑士团见习生'],
      location: 'spot_ancient_altar',
      health: '轻度疲惫，左臂有划伤',
      summary: '因家族变故离开王都的落魄骑士，性格谨慎寡言',
      appearance: '黑色碎发，身着磨损皮甲，眼神锐利',
      goals: { long_term: '查清当年骑士团覆灭的真相', short_term: '在天黑前穿过迷雾森林' },
      thoughts: '那个少女手里拿着的徽记，我一定在哪里见过',
      plan: ['前往旧哨塔休整', '向守林人打听近道'],
      relations: {
        char_heroine: {
          affinity: 15,
          ties: ['同路旅伴', '潜在雇主'],
          impression: '警惕且机敏，但似乎隐瞒了真实目的',
          promise: '承诺安全护送其穿过密林',
          key_event: '在林地边缘合力击退野狼'
        }
      },
      rank: '三阶初段',
      stats: {
        fu: {}, wod: {}, fate: {},
        dnd: { str: 14, dex: 16, con: 13, int: 12, wis: 15, cha: 10 }
      },
      special_stats: { 剑势: '连续三次命中后伤害提升' },
      skills: { 连珠射击: '瞬间搭上两支箭连续射击，命中附带穿刺' },
      traits: { 林地行者: '在丛林移动不受减速惩罚，潜行判定具备优势' },
      items: {
        item_longbow: {
          name: '精钢猎弓', count: 1, type: 'equip',
          desc: '一把做工扎实的猎弓，弓臂略有磨损',
          real_desc: '弓把暗槽内刻有古代工匠暗纹',
          equipped: true
        },
        item_relic: {
          name: '半枚日轮徽记', count: 1, type: 'key',
          desc: '边缘烧熔的金属徽记，背面刻着半个字',
          real_desc: '断口与骑士团大团长佩剑的缺口完全吻合',
          equipped: false
        }
      },
      wealth: { 金币: 12, 银币: 45 },
      mount: {
        mount_horse: {
          name: '杂色驽马', type: 'mount',
          desc: '体格健壮耐力较好的山地马',
          real_desc: '', status: '健康良好', equipped: true
        }
      },
      nsfw: {
        libido: '克制但敏锐', exp: '略有经历',
        kinks: ['轻度控制', '耳语'],
        latent_kinks: ['公开羞耻'],
        lust: 20,
        body: {
          arm: { desc: '左臂有一道旧疤', dev: '轻度开发', sens: 'normal', status: '伤口已结痂' }
        }
      }
    },
    char_heroine: {
      is_user: false,
      name: '艾莉丝',
      alias: '白鸦',
      role: 'core',
      age: '19',
      identities: ['晨曦骑士团逃徒', '符文学徒'],
      location: 'spot_ancient_altar',
      health: '完好，右手缠着符文绷带',
      summary: '带着半枚徽记逃出圣城的少女，固执且不肯解释来由',
      appearance: '银灰长发束成低马尾，外披一件过大的旧斗篷',
      goals: { long_term: '把徽记送到能读懂它的人手里', short_term: '确认雷恩是否值得信任' },
      thoughts: '他要是认出这枚徽记，我该跑还是该说实话',
      plan: ['拓印石碑符文', '在入夜前找到避风处'],
      relations: {
        char_player: {
          affinity: 30,
          ties: ['同路旅伴'],
          impression: '明明一身旧伤，却总是先看别人的脸色',
          promise: '答应事成之后说出徽记的来历',
          key_event: '他把最后一块干粮分给了她'
        }
      },
      rank: '二阶中段',
      stats: {
        fu: {}, wod: {}, fate: {},
        dnd: { str: 9, dex: 14, con: 11, int: 17, wis: 13, cha: 15 }
      },
      special_stats: { 符文共鸣: '靠近古代刻文时会耳鸣' },
      skills: { 符文拓印: '把刻文完整复制到纸上，成功率取决于专注' },
      traits: { 夜视: '弱光下仍能辨字' },
      items: {
        item_book: {
          name: '残页笔记', count: 1, type: 'prop',
          desc: '被水浸过的笔记，只剩最后七页还能读',
          real_desc: '第七页夹着一张圣城地下水道的手绘地图',
          equipped: false
        }
      },
      wealth: { 金币: 3, 银币: 71 },
      mount: {},
      nsfw: {
        libido: '羞怯而敏感', exp: '没有经历',
        kinks: ['耳语'],
        latent_kinks: ['被注视'],
        lust: 5,
        body: { ear: { desc: '耳尖微薄，容易泛红', dev: '未开发', sens: 'weakspot', status: '微热紧绷' } }
      }
    },
    char_warden: {
      is_user: false,
      name: '老哨人 · 卡尔',
      alias: '',
      role: 'minor',
      age: '未知',
      identities: ['守林人'],
      location: 'area_woods_entry',
      health: '老迈，右腿跛',
      summary: '在林缘哨所住了三十年的守林人，话少，认得每一条兽径',
      appearance: '驼背，披着打了补丁的油布斗篷',
      goals: { long_term: '守着石碑不让外人乱碰', short_term: '赶在天黑前修好哨塔的木梯' },
      thoughts: '又来两个找石碑的，这个月第三批了',
      plan: ['补木梯'],
      relations: {},
      rank: '不入阶',
      stats: { fu: {}, wod: {}, fate: {}, dnd: { str: 11, dex: 8, con: 12, int: 13, wis: 16, cha: 7 } },
      special_stats: {},
      skills: { 辨向: '在林子里从不迷路' },
      traits: {},
      items: {},
      wealth: { 铜币: 8 },
      mount: {},
      nsfw: { libido: '', exp: '', kinks: [], latent_kinks: [], lust: 0, body: {} }
    }
  },
  map_nodes: {
    realm_forest: {
      name: '迷雾森林大区',
      is_found: true,
      desc: '终年笼罩在白雾中的广袤林海',
      real_desc: '地底埋藏着上古文明的能量节点',
      bg_image: 'forest_bg.webp',
      bgm: 'fog_ambient.mp3',
      areas: {
        area_woods_entry: {
          name: '林缘哨所区',
          is_found: true,
          desc: '旧王国遗留的边境巡逻道',
          real_desc: '巡逻道的地基是一段更古老的石砌路',
          bg_image: '', bgm: '',
          connections: ['area_ruins', 'area_lake'],
          spots: {
            spot_ancient_altar: {
              name: '石碑遗迹', is_found: true,
              desc: '矗立在三岔路口的古老石碑',
              real_desc: '石碑背面有新刻的盗贼密语',
              bg_image: '', bgm: ''
            },
            spot_old_tower: {
              name: '旧哨塔', is_found: true,
              desc: '半塌的石塔，顶层还留着一圈火盆',
              real_desc: '', bg_image: '', bgm: ''
            }
          }
        },
        area_ruins: {
          name: '塌陷回廊', is_found: false,
          desc: '传闻中通往地下的石砌回廊',
          real_desc: '回廊尽头连着骑士团的封印室',
          bg_image: '', bgm: '',
          connections: ['area_woods_entry'],
          spots: {}
        }
      }
    }
  },
  factions: {
    faction_dawn: {
      name: '晨曦骑士团',
      alias: '白鸦教团',
      type: '宗教军事武装',
      leader: 'char_grand_master',
      summary: '崇奉旧日烈阳的军修组织，对异端极度严苛',
      domain: '控制圣城周边及北方三大要塞',
      goals: {
        long_term: '净化边境异象并收复旧圣堂',
        short_term: '封锁迷雾森林的外围主干道'
      },
      plan: ['向石碑哨所增派骑兵小队', '搜捕失窃的圣印'],
      rep: {
        char_player: { value: -20, title: '受审嫌疑人', key_event: '曾拒绝接受教团的强制搜身' },
        char_heroine: { value: -75, title: '叛逃者', key_event: '带着圣印碎片逃离圣城' }
      },
      diplomacy: {
        faction_wardens: { relation: '互不干涉', trends: '守林人拒绝为教团带路' }
      }
    },
    faction_wardens: {
      name: '守林人议会',
      alias: '',
      type: '松散行会',
      leader: 'char_warden',
      summary: '由各国逃役者组成的守林人，只管林子不管王权',
      domain: '迷雾森林外围的哨所与兽径',
      goals: { long_term: '不让石碑落入任何一方手里', short_term: '修好三座哨塔' },
      plan: ['补木梯', '清点冬粮'],
      rep: { char_player: { value: 5, title: '生面孔', key_event: '替哨所赶走了两只林中狼' } },
      diplomacy: {}
    }
  },
  storylines: {
    line_holy_relic: {
      title: '圣印窃案的真相',
      priority: 'main',
      summary: '骑士团丢失的圣印似乎不是被盗，更像是一场内外勾结的监守自盗',
      nodes: [
        { round: 3, time: '第四纪元-2023年-11月-12日-09:00', title: '林地边缘的相遇',
          log: '在兽径上撞见一个抱着布包跑的白发少女，身后跟着两名骑手。', chars: ['char_player', 'char_heroine'] },
        { round: 9, time: '第四纪元-2023年-11月-14日-20:00', title: '血色回廊的遭遇',
          log: '在地下水道发现了带有教团密印的匕首。刺客临死前念叨的名字绝非外人。', chars: ['char_player', 'char_heroine'] },
        { round: 12, time: '第四纪元-2023年-11月-15日-15:00', title: '石碑前的对峙',
          log: '老哨人拦在石碑前，说这个月已经来过三批人了。', chars: ['char_player', 'char_heroine', 'char_warden'] }
      ]
    },
    line_gray_wolf: {
      title: '灰狼的身世',
      priority: 'personal',
      summary: '雷恩始终不肯说家族是怎么败的，但每次提到王都都会沉默',
      nodes: [
        { round: 7, time: '第四纪元-2023年-11月13日-22:00', title: '篝火边的沉默',
          log: '她问起王都，他只说了一句"那年冬天很冷"就不说了。', chars: ['char_player', 'char_heroine'] }
      ]
    }
  },
  quests: {
    quest_scout: {
      name: '遗迹的侦察委托',
      client: 'char_heroine',
      line_id: 'line_holy_relic',
      type: '赏金委托',
      objective: '前往迷雾森林深处的古老石碑，拓印表面的符文',
      limits: '必须在入夜迷雾加深前返回',
      status: 'active',
      reward: '金币 50 与内城通行文书',
      secret: '雇主想借助符文破译开启深层封印，拓印过程会触发警戒陷阱'
    },
    quest_ladder: {
      name: '修好哨塔木梯',
      client: 'char_warden',
      line_id: null,
      type: '人情',
      objective: '找三根够直的杉木，替老哨人把塌掉的木梯补上',
      limits: '',
      status: 'pending',
      reward: '哨所一夜的干床铺',
      secret: ''
    }
  },
  estates: {
    estate_hunter_cabin: {
      name: '林间废弃猎人小屋',
      type: '避难据点',
      owner: 'char_player',
      spot_id: 'spot_old_tower',
      is_found: true,
      desc: '一间用原木搭建的单层木屋，带有倾斜的阁楼',
      real_desc: '地下藏有一个通风良好的储藏地窖',
      facilities: { 工作台: '简陋修补工具，可维护武器防具', 炉灶: '可烹饪基础热食' },
      residents: ['char_player']
    }
  },
  lore: {
    lore_miasma: {
      title: '深渊瘴气侵蚀机制',
      category: '世界法则',
      is_found: true,
      summary: '吸入迷雾中的深渊瘴气会导致理智下降，并在体表产生结晶异变',
      truth: '瘴气并非自然天灾，而是远古神明残骸泄露的能量波动'
    },
    lore_sun_order: {
      title: '日轮誓约',
      category: '宗教信仰',
      is_found: false,
      summary: '骑士团入团时要对着日轮立誓，誓词只有大团长一人知晓全文',
      truth: '誓约的真正作用是给每一任大团长套一层不可违逆的束缚'
    }
  }
};

/* 天气 → 图标。用 emoji（理由写在报告里）：
   零外部依赖、离线可用、各端都渲染；断网不会变白板；
   字号与颜色可以由皮肤用令牌控制（就是一个文字节点）。 */
export var WEATHER_ICON = {
  '晴': '☀️', '雨': '🌧️', '阴': '☁️', '雪': '❄️', '雾': '🌫️',
  '大风': '🌬️', '雷暴': '⛈️', '暴雨': '🌧️', '沙暴': '🌪️', '瘴气': '☣️', '异象': '✨'
};
export var WEATHER_FALLBACK = '🌡️';

/** 天气文字 → 图标；认不出来的用兜底图标（不返回空，免得标题栏缺一块） */
export function weatherIcon(w) {
  var k = String(w == null ? '' : w).trim();
  if (!k) { return ''; }
  return WEATHER_ICON[k] || WEATHER_FALLBACK;
}

/* ── 八个模块：与 design/_discussion/mvu/手写变量结构.yaml 的 8 个顶层模块一一对应 ── */
export var MODULES = [
  { id: 'status', copy: 'secStatus' },
  { id: 'characters', copy: 'secCharacters' },
  { id: 'map_nodes', copy: 'secMap' },
  { id: 'factions', copy: 'secFactions' },
  { id: 'storylines', copy: 'secStorylines' },
  { id: 'quests', copy: 'secQuests' },
  { id: 'estates', copy: 'secEstates' },
  { id: 'lore', copy: 'secLore' }
];

/** 默认只开前两个 + 地图：一上来就摊开八个模块，折叠栏会变成一堵墙 */
export function defaultSettings() {
  return {
    modules: {
      status: true, characters: true, map_nodes: true,
      factions: false, storylines: false, quests: true, estates: false, lore: false
    },
    options: {
      showHeader: true,
      showHidden: false,
      /* 示例数据默认**开着**（用户 2026-10-05：调试期方便看布局；调完会删掉示例数据）。
         但"真实数据优先"没有变：readStat() 先读楼层变量，读到真实数据示例立刻让位。 */
      useSample: true
    }
  };
}

/**
 * 把存下来的设置合并进默认值。**存下来的东西一律不可信**（用户手改过脚本变量、
 * 或者旧版本的结构不同），所以逐字段判类型，坏的直接退回默认，不整份丢弃。
 */
export function mergeSettings(saved) {
  var d = defaultSettings();
  if (!saved || typeof saved !== 'object') { return d; }
  var m = saved.modules, o = saved.options, i, id;
  if (m && typeof m === 'object') {
    for (i = 0; i < MODULES.length; i++) {
      id = MODULES[i].id;
      if (typeof m[id] === 'boolean') { d.modules[id] = m[id]; }
    }
  }
  if (o && typeof o === 'object') {
    if (typeof o.showHeader === 'boolean') { d.options.showHeader = o.showHeader; }
    if (typeof o.showHidden === 'boolean') { d.options.showHidden = o.showHidden; }
    if (typeof o.useSample === 'boolean') { d.options.useSample = o.useSample; }
  }
  return d;
}

/** 面板里要显示哪几个模块（按 MODULES 的顺序，勾上的才出） */
export function enabledModules(settings) {
  var out = [], i, s = settings || defaultSettings();
  for (i = 0; i < MODULES.length; i++) {
    if (s.modules && s.modules[MODULES[i].id]) { out.push(MODULES[i]); }
  }
  return out;
}

/**
 * 从各种可能的形状里把 stat_data 捞出来。
 * 为什么要容错：MVU 那条链路**还没验通**，不同版本/不同写法给的东西不一样
 * （有的直接给 stat_data，有的包一层 variables/swipes_data）。
 * 所以这里按"能认出 stat_data 就认，认不出返回 null"处理 —— **绝不伪造数据**。
 */
export function pickStat(raw) {
  if (!raw || typeof raw !== 'object') { return null; }
  /* 空的那份要跳过：swipes_data 里第一格常常是空壳，
     直接返回它会把后面真正有数据的那一格挡掉（实测踩到）。 */
  if (raw.stat_data && typeof raw.stat_data === 'object' && Object.keys(raw.stat_data).length > 0) {
    return raw.stat_data;
  }
  if (Array.isArray(raw.swipes_data)) {
    for (var i = 0; i < raw.swipes_data.length; i++) {
      var s = pickStat(raw.swipes_data[i]);
      if (s) { return s; }
    }
  }
  if (raw.variables && typeof raw.variables === 'object') {
    var keys = Object.keys(raw.variables);
    for (var k = 0; k < keys.length; k++) {
      var got = pickStat(raw.variables[keys[k]]);
      if (got) { return got; }
    }
  }
  return null;
}

/** 空数据判定：null / 非对象 / 一个键都没有 → 都算"没数据"，这时只显示球 */
export function isEmptyStat(stat) {
  if (!stat || typeof stat !== 'object') { return true; }
  return Object.keys(stat).length === 0;
}

/** 有数据 + 用户没关掉标题栏 → 才展开三行 */
export function shouldShowHeader(stat, settings) {
  var s = settings || defaultSettings();
  if (!s.options || s.options.showHeader !== false) {
    return !isEmptyStat(stat);
  }
  return false;
}

/* 剧透字段：默认不显示（用户的"可选项"里能打开）。
   ⚠️ 必须**递归**过滤：real_desc 藏在 characters[].items[] 这种第二三层里，
   只过滤顶层等于没过滤（实测踩到）。 */
export var HIDDEN_FIELDS = ['real_desc', 'secret', 'truth', 'latent_kinks'];

/** 深拷贝一份，顺手把剧透字段摘掉。showHidden=true 时原样返回。 */
export function stripHidden(value, showHidden) {
  if (showHidden) { return value; }
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) { arr.push(stripHidden(value[i], false)); }
    return arr;
  }
  if (value && typeof value === 'object') {
    var out = {}, keys = Object.keys(value), k;
    for (var j = 0; j < keys.length; j++) {
      k = keys[j];
      if (HIDDEN_FIELDS.indexOf(k) >= 0) { continue; }
      out[k] = stripHidden(value[k], false);
    }
    return out;
  }
  return value;
}

function txt(v) {
  if (v === null || v === undefined) { return ''; }
  if (typeof v === 'string') { return v.trim(); }
  if (typeof v === 'number' || typeof v === 'boolean') { return String(v); }
  return '';
}

/**
 * 地点可能是字符串（地图关），也可能是 {realm,area,spot}（地图开）。
 * ⚠️ 地图开着时存的是**实体 ID**（文档原话："填入实体ID结构对象"），
 * 直接显示会变成 realm_forest · area_woods_entry · spot_ancient_altar —— 用户看不懂。
 * 所以拿到 stat 时**自己去 map_nodes 里把名字查出来**，查不到才退回 ID。
 */
export function locationText(loc, stat) {
  if (!loc) { return ''; }
  if (typeof loc === 'string') { return loc.trim(); }
  if (typeof loc !== 'object') { return ''; }
  var nodes = (stat && stat.map_nodes) || {};
  var ids = ['realm', 'area', 'spot'], parts = [], cur = null, i, id, name;
  for (i = 0; i < ids.length; i++) {
    id = txt(loc[ids[i]]);
    if (!id) { continue; }
    name = '';
    if (i === 0) { cur = nodes[id] || null; name = cur ? txt(cur.name) : ''; }
    else if (i === 1) { var ar = cur && cur.areas ? cur.areas[id] : null; cur = ar || null; name = ar ? txt(ar.name) : ''; }
    else { var sp = cur && cur.spots ? cur.spots[id] : null; name = sp ? txt(sp.name) : ''; }
    parts.push(name || id);   /* 查不到就退回 ID：宁可显示得难看，也不要显示成空 */
  }
  return parts.join(' · ');
}

/**
 * 标题栏的**三行**。第 1 行时间 + 天气图标，第 2 行地点，第 3 行在场人物。
 * 某一项没有就给空串，**行数恒为 3**（用户明确说"只需要三行"）——
 * 少一项时留空行，比"这行没了、下面整体上移"更稳（位置不会跳）。
 */
export function headerLines(stat, nameOf) {
  var s = (stat && stat.status) ? stat.status : {};
  var when = txt(s.time);
  var weatherTxt = txt(s.weather);
  /* 认得出的天气用图标（零依赖、断网也可用）；**认不出的显示原文** ——
     拿一个通用图标把「下猫下狗」吞掉，等于把信息丢了，不如照实显示。 */
  var exact = WEATHER_ICON[weatherTxt] || '';
  var line1 = when;
  if (exact) { line1 = line1 ? (line1 + ' ' + exact) : exact; }
  else if (weatherTxt) { line1 = line1 ? (line1 + ' · ' + weatherTxt) : weatherTxt; }

  var line2 = locationText(s.location, stat);

  /* 在场人物同理：存的是角色 ID，显示要换成名字。
     没传 nameOf 时**自己从 stat.characters 里查**（调用方就不用重复这份查找逻辑了）。 */
  var present = Array.isArray(s.present_chars) ? s.present_chars : [];
  var chars = (stat && stat.characters) || {};
  var names = [];
  for (var i = 0; i < present.length; i++) {
    var id = txt(present[i]);
    if (!id) { continue; }
    var nm = '';
    try {
      if (typeof nameOf === 'function') { nm = txt(nameOf(id)); }
      else if (chars[id]) { nm = txt(chars[id].name); }
    } catch (e) { nm = ''; }
    names.push(nm || id);
  }
  return [line1, line2, names.join(' / ')];
}

/**
 * 标题栏（从球背后探出的那条横幅）的几何。
 * 用户 2026-10-05 的原话：
 *   · 「标题栏应该从 icon 的**背后**向右探出」→ 它在球下面一层，球的左半压住它左端；
 *   · 「边缘起点应该在 icon 的**中间**」→ 左缘落在**球心 x**，不是球的左缘也不是右缘；
 *   · 「高度则和 icon 一样」→ 高度**等于**图标高度（同一个数，不是"差不多"）。
 * 返回的 width 已经按视口右边距夹过 —— 探出屏幕外面的部分没有意义。
 */
/* 横幅至少要有这么宽才值得往右探；放不下就镜像到左边去。
   160 ≈ 一行十来个小字，比这更窄的横幅只剩个色块，不如换边。 */
export var MIN_RIBBON_W = 160;

/* 手机 / PC 的分界。Lead 2026-10-05 认了这个数，推导：
   球 64 + 横幅最小可用 160 + 两侧边距 16 ≈ 240 是"内容真的放得下"的下界；
   640 是在它上面留足余量之后的手机/平板分界（常见手机竖屏 360–430，横屏 640–926）。 */
export var BREAKPOINT = 640;

/* 调宽手柄的占宽（PC）：手柄压在横幅右端，拖它改宽度 */
export var HANDLE_W = 12;

/* 用户拖出来的宽度会被夹到这个区间里 */
export var MIN_USER_W = MIN_RIBBON_W;
export var MAX_USER_W = 1200;

function numOf(v, dflt) {
  var n = Number(v);
  return (isFinite(n) && n >= 0) ? n : dflt;
}

/** 用户宽度先夹一遍（拖动过程中每一帧都会调，必须是纯的、快的） */
export function clampUserWidth(w, viewW) {
  var n = Number(w);
  if (!isFinite(n) || n <= 0) { return null; }        /* null = 没设过，走内容撑开 */
  var hi = MAX_USER_W;
  var vw = Number(viewW);
  if (isFinite(vw) && vw > 0) { hi = Math.min(hi, Math.max(MIN_USER_W, vw - 16)); }
  return Math.round(Math.min(hi, Math.max(MIN_USER_W, n)));
}

/**
 * 一次把全部几何算完（纯函数）。输入：
 *   { ball:{x,y,size}, viewW, contentW, userWidth, edgeGap, isMobile }
 * 输出：
 *   { mobile, left, top, height, width, dir, gripLeft,
 *     panel:{ left, top, width } }
 *
 * 规则：
 *   · **手机（viewW < 640）**：球 + 横幅**占满整行** —— 横幅左缘 = 球的左缘，
 *     也就是说球成了这条横幅的"排头图标"，而不是被横幅压在下面；
 *   · **PC**：横幅**由内容撑开**（contentW），用户调过宽就用用户的（userWidth）；
 *     左缘仍落在**球心 x**（PC 才保留"从球背后探出"这个形态）；
 *   · **镜像复核**：宽度变了（内容变长 / 用户拖宽）之后，右边放不下就翻到左边，
 *     左边也放不下就取空间大的那一边、把宽度夹到那边的余量；
 *   · **连体面板**：左缘 = 横幅左缘、上缘 = 横幅下缘（共享一条边，读数为 0）。
 */
export function layoutOf(input) {
  var o = input || {};
  var ball = o.ball || {};
  var size = numOf(ball.size, 0);
  var bx = numOf(ball.x, 0);
  var by = numOf(ball.y, 0);
  var viewW = Number(o.viewW);
  var gap = numOf(o.edgeGap, 8);
  var center = bx + size / 2;

  var mobile = (o.isMobile === undefined || o.isMobile === null)
    ? (isFinite(viewW) && viewW > 0 && viewW < BREAKPOINT)
    : !!o.isMobile;

  var empty = { mobile: mobile, left: center, top: by, height: size, width: 0, dir: 'right',
    gripLeft: center, panel: { left: center, top: by + size, width: 0 } };

  if (!isFinite(viewW) || viewW <= 0) { return empty; }   /* 视口量不到：什么都不画 */

  /* ── 手机：占满整行 ── */
  if (mobile) {
    var mLeft = Math.max(0, Math.min(bx, viewW));
    var mW = Math.max(0, viewW - mLeft - gap);
    return {
      mobile: true, left: mLeft, top: by, height: size, width: mW, dir: 'right',
      gripLeft: mLeft + mW - HANDLE_W,
      panel: { left: mLeft, top: by + size, width: mW }
    };
  }

  /* ── PC：内容撑开，用户可覆盖 ── */
  var user = clampUserWidth(o.userWidth, viewW);
  var content = numOf(o.contentW, 0);
  var want = (user !== null) ? user : Math.max(MIN_RIBBON_W, content);

  var rightRoom = Math.max(0, viewW - center - gap);
  var leftRoom = Math.max(0, center - gap);

  var left, width, dir;
  if (rightRoom >= want) {
    left = center; width = want; dir = 'right';
  } else if (leftRoom >= want) {
    /* 右边放不下（用户拖宽了、或球贴右缘）→ **镜像到左边**：右缘落在球心 */
    left = center - want; width = want; dir = 'left';
  } else if (leftRoom > rightRoom) {
    left = center - leftRoom; width = leftRoom; dir = 'left';
  } else {
    left = center; width = rightRoom; dir = 'right';
  }

  return {
    mobile: false, left: left, top: by, height: size, width: width, dir: dir,
    gripLeft: (dir === 'left' ? left : left + width - HANDLE_W),
    panel: { left: left, top: by + size, width: width }
  };
}

export function headerGeom(ball, viewW, edgeGap) {
  var size = Number(ball && ball.size);
  var bx = Number(ball && ball.x);
  var by = Number(ball && ball.y);
  if (!isFinite(size) || size < 0) { size = 0; }
  if (!isFinite(bx)) { bx = 0; }
  if (!isFinite(by)) { by = 0; }
  var gap = Number(edgeGap);
  if (!isFinite(gap) || gap < 0) { gap = 8; }
  var center = bx + size / 2;                       /* 球心 x */
  var w = Number(viewW);
  /* 视口量不到（0 / NaN）时什么都不画 —— 这是退化态，镜像到左边也没有意义 */
  if (!isFinite(w) || w <= 0) {
    return { left: center, top: by, height: size, width: 0, dir: 'right' };
  }
  var rightW = Math.max(0, w - center - gap);
  var leftW = Math.max(0, center - gap);
  if (rightW >= MIN_RIBBON_W) {
    return { left: center, top: by, height: size, width: rightW, dir: 'right' };
  }
  /* 用户 2026-10-05：「球贴屏幕右缘时横幅被夹成 0，用户只看到球、不知道其实有数据」
     → 右边放不下就**镜像到左边**：右缘落在球心，向左展开（左边至少要有 gap 的余量）。 */
  if (leftW > rightW) {
    return { left: center - leftW, top: by, height: size, width: leftW, dir: 'left' };
  }
  return { left: center, top: by, height: size, width: rightW, dir: 'right' };
}

/** 横幅里的文字要避开球：从球心再往右让出半个球宽 */
export function ribbonTextInset(size, extra) {
  var s = Number(size);
  if (!isFinite(s) || s < 0) { s = 0; }
  var e = Number(extra);
  if (!isFinite(e) || e < 0) { e = 8; }
  return s / 2 + e;
}

/** 字段的自适应分类（Lead 定的口径：数字→数值、字符串→文本、列表→条目、布尔→点） */
export function describeField(v) {
  if (v === null || v === undefined || v === '') { return { kind: 'empty' }; }
  if (typeof v === 'number') { return { kind: 'number', num: v }; }
  if (typeof v === 'boolean') { return { kind: 'bool', on: v }; }
  if (Array.isArray(v)) { return { kind: 'list', items: v }; }
  if (typeof v === 'object') { return { kind: 'group' }; }
  return { kind: 'text', text: String(v) };
}

/**
 * 面板要画的区块：按开启的模块切，剧透字段按选项过滤。
 * 返回 [{ id, titleKey, rows: [{ key, value }] }]，只做一层展开（深层交给前端递归）。
 */
export function sectionsOf(stat, settings) {
  var s = settings || defaultSettings();
  var showHidden = !!(s.options && s.options.showHidden);
  var mods = enabledModules(s), out = [];
  if (isEmptyStat(stat)) { return out; }
  for (var i = 0; i < mods.length; i++) {
    var id = mods[i].id, v = stat[id];
    if (v === undefined || v === null) { continue; }
    var rows = [];
    var shown = stripHidden(v, showHidden);
    if (typeof shown === 'object' && !Array.isArray(shown)) {
      var keys = Object.keys(shown);
      for (var k = 0; k < keys.length; k++) {
        rows.push({ key: keys[k], value: shown[keys[k]] });
      }
    } else {
      rows.push({ key: id, value: shown });
    }
    out.push({ id: id, titleKey: mods[i].copy, rows: rows });
  }
  return out;
}

/* 天气图标是 emoji，跟汉字不在同一条基线上：直接挨着排会一个高一个低。
   所以把行尾那串 emoji 拆出来单独包一层，由 CSS 用 vertical-align 压到文字基线上。
   拆不出来就原样返回，绝不丢字。 */
/* 单个图标字符。**不用行尾锚点**：这个模块会被内联进前端，构建期会把美元符号翻倍，
   正则锚点会跟着坏掉（见本文件顶部的内联规则）。所以从尾部逐个码点往前吃。 */
var ICON_CH = /[\u2600-\u27BF\u{1F300}-\u{1FAFF}\uFE0F]/u;

/** 把标题栏第 1 行拆成 { text, icon }。icon 为空串表示这行没有图标。 */
export function splitWeatherIcon(line) {
  var s = String(line == null ? '' : line);
  /* 按**码点**切，不按 UTF-16 单元 —— 否则代理对会被切一半 */
  var chars = (typeof Array.from === 'function') ? Array.from(s) : s.split('');
  var i = chars.length;
  while (i > 0 && ICON_CH.test(chars[i - 1])) { i--; }
  if (i === chars.length) { return { text: s, icon: '' }; }   /* 一个都没吃到 → 原样返回 */
  var icon = chars.slice(i).join('');
  /* 去掉文字与图标之间那个空格。同样**不用正则锚点**（美元符号会被构建期翻倍） */
  var text = chars.slice(0, i).join('');
  while (text.length) {
    var last = text.charAt(text.length - 1);
    if (last === ' ' || last === '\t' || last === '\u00b7') { text = text.slice(0, -1); continue; }
    break;
  }
  return { text: text, icon: icon };
}

/**
 * 三态判定。用户 2026-10-05：真机 MVU 初始化有延迟，
 * 那段时间不能显示成"没数据"——用户分不清"坏了"和"还没好"。
 *   · 有数据 → 'data'
 *   · 没数据但**还在超时窗口内** → 'loading'（正在读，等等看）
 *   · 没数据且**已超时** → 'empty'（真的没有）
 * 超时窗口取得比 MVU 初始化长一些，避免刚闪一下"空"又变"有数据"。
 */
export var LOADING_MS = 8000;

export function viewStateOf(opts) {
  var o = opts || {};
  if (o.hasData) { return 'data'; }
  var wait = Number(o.elapsedMs);
  var limit = Number(o.timeoutMs);
  if (!isFinite(limit) || limit < 0) { limit = LOADING_MS; }
  if (!isFinite(wait) || wait < 0) { wait = 0; }
  return (wait < limit) ? 'loading' : 'empty';
}

/** 设置里"无数据时显示示例"是否开着 */
export function isSampleOn(settings) {
  return !!(settings && settings.options && settings.options.useSample);
}

/**
 * 空态要说哪几句话。
 * ⚠️ 与"无数据时显示示例"那个开关**不许打架**：示例开着的时候数据是有的，
 * 再喊一句"还没有剧情记录"就是自相矛盾 —— 所以那种情况下**只留引导句**。
 */
export function emptyStateText(opts) {
  var o = opts || {};
  var out = [];
  if (!o.isSample) { out.push(STATUS_COPY.noData); }
  out.push(STATUS_COPY.emptyHint);
  return out;
}

/**
 * 面板里某个 tab 该画什么。**空态统一走这里**，不在 DOM 层各写各的 ——
 * 这样将来新增分区时，只要它走这条路就自动带上引导句（单测会逐个分区验）。
 */
export function panelTabPlan(stat, settings, tabId) {
  if (tabId === '__settings') { return { kind: 'settings', rows: [], lines: [] }; }
  var secs = sectionsOf(stat, settings), i;
  for (i = 0; i < secs.length; i++) {
    if (secs[i].id === tabId) { return { kind: 'rows', rows: secs[i].rows, lines: [] }; }
  }
  return { kind: 'empty', rows: [], lines: emptyStateText({ isSample: isSampleOn(settings) }) };
}

/** 模块的显示名（给设置页用） */
export function moduleLabel(id) {
  for (var i = 0; i < MODULES.length; i++) { if (MODULES[i].id === id) { return MODULES[i].copy; } }
  return id;
}
