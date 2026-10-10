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
  gripTip: '拖动调整宽度，双击恢复默认',
  gripLabel: '调整标题栏宽度',
  loading: '正在读取剧情数据，请稍候',
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
  secLore: '设定集',

  /* ── RPG 界面重构（2026-10-07）：子 tab、背包、技能、筛选、折叠 ── */
  subOverview: '概览',
  subBag: '背包',
  subSkill: '技能',
  subPresent: '在场',
  subAll: '全部',
  subGraph: '节点图',
  subDetail: '地点详情',
  subRep: '声望',
  subDip: '外交',
  subOrg: '组织',
  subMain: '主线',
  subSide: '支线',
  subPersonal: '个人',
  subActive: '进行中',
  subPending: '待办',
  subClosed: '已结束',
  subOwned: '自有',
  subByType: '按类型',
  subUnknown: '未探明',
  subModules: '模块',
  subDisplay: '显示',
  subAbout: '关于',

  filterAll: '全部',
  filterFound: '已探明',
  filterUnknown: '未探明',
  filterClosed: '已完结',
  filterOpen: '未完结',
  filterByRep: '按声望升序',
  filterByName: '按名称',
  filterAllTypes: '全部类型',

  /* 背包 */
  wealth: '货币',
  equipped: '已装备',
  wornSlots: '装备槽',
  slotWeapon: '武器',
  slotArmor: '护甲',
  slotTrinket: '饰品',
  slotEmpty: '空',
  bagEmpty: '背包里还没有东西',
  bagEmptyHint: '让剧情推进到主角取得物品后，这里会自动出现',
  mount: '坐骑与载具',
  countUnit: '件',

  /* 技能 */
  skillEmpty: '还没有学会任何能力',
  skillActive: '主动技能',
  skillPassive: '被动特性',
  skillSpecial: '专有机制',

  /* 通用 */
  filterLabel: '筛选',
  foldHint: '展开',
  unfoldHint: '收起',
  mapEmpty: '还没有任何已探明的地点',
  mapEmptyHint: '去过的地方会自动出现在这张图上',
  graphTooMany: '区域太多，已切到列表视图',
  peopleFolded: '收起',
  questObjective: '目标',
  questClient: '委托人',
  questLine: '关联',
  questReward: '报酬',
  questLimits: '限制',
  factionLeader: '领袖',
  factionDomain: '控制范围',
  factionGoals: '目标',
  factionPlan: '计划',
  factionDiplomacy: '外交动向',
  estateFacilities: '设施',
  estateResidents: '常驻',

  /* 生存状态点（好/中/差三档的语气词，配环形徽章左侧那枚色点） */
  toneGood: '良好',
  toneBad: '不佳',

  /* ── 下面是 RPG 界面层真正在用的键 ──
     ⚠️ 少登记一个的后果不是"少一句话"，而是**界面上直接显示英文键名**：
     cpyText() 查不到就把键名原样返回（图例里那个漏出来的 "mapHere" 就是这么来的，
     实测截图抓到）。所以新增界面文案必须同时登记在这里。 */
  mapHere: '当前所在',
  legendDash: '未探明通路',
  moreInfo: '更多信息',
  truth: '真相',
  isSelf: '主角',
  health: '生理状态',
  riding: '骑乘中',
  reach: '通往',
  factionDomain: '控制范围',
  modulesHint: '关掉的模块不会出现在标签行里，也不再读取它的数据。',
  graphAutoListLabel: '图太挤时自动切列表',
  about: '版本信息',
  aboutPreset: '预设版本',
  aboutTavern: '酒馆版本',
  aboutHelper: '酒馆助手版本'
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
    char_grand_master: {
      is_user: false,
      name: '大团长 · 塞维恩',
      alias: '白鸦之首',
      role: 'minor',
      age: '58',
      identities: ['晨曦骑士团大团长'],
      location: 'area_ruins',
      health: '旧伤缠身，右眼蒙着布',
      summary: '执掌骑士团三十年的老人，誓词只有他一人读过全文',
      appearance: '银甲外罩白袍，声音低沉',
      goals: { long_term: '让日轮誓约继续传下去', short_term: '把失窃的圣印追回来' },
      thoughts: '那个孩子带着徽记跑了 —— 她不知道自己在替谁背罪',
      plan: ['封锁森林主干道', '向守林人施压'],
      relations: {},
      rank: '团长',
      stats: { fu: {}, wod: {}, fate: {}, dnd: { str: 13, dex: 9, con: 14, int: 15, wis: 17, cha: 16 } },
      special_stats: {},
      skills: { 誓约压制: '面对团员时对方难以违逆' },
      traits: {},
      items: {},
      wealth: { 金币: 200 },
      mount: {},
      nsfw: { libido: '', exp: '', kinks: [], latent_kinks: [], lust: 0, body: {} }
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
        area_lake: {
          name: '沉星湖岸',
          is_found: false,
          desc: '林子西侧一片终年不冻的湖水，夜里能看见倒影里的星',
          real_desc: '湖底沉着上古祭坛的基座',
          bg_image: '', bgm: '',
          connections: ['area_woods_entry'],
          spots: {}
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
    /* 界面选择状态（子 tab / 筛选 / 折叠）。**放在 settings 里是为了跟着账号走**，
       与位置、模块开关共用同一份脚本变量。形状见 80 号的 normalizeUi()。 */
    ui: { sub: {}, filter: {}, folds: {} },
    options: {
      showHeader: true,
      showHidden: false,
      /* 示例数据默认**开着**（用户 2026-10-05：调试期方便看布局；调完会删掉示例数据）。
         但"真实数据优先"没有变：readStat() 先读楼层变量，读到真实数据示例立刻让位。 */
      useSample: true,
      /* 图太挤时（手机形态 + 节点数超过阈值）自动退化成列表，见 shouldUseList */
      graphAutoList: true
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
    if (typeof o.graphAutoList === 'boolean') { d.options.graphAutoList = o.graphAutoList; }
  }
  /* 界面选择状态：逐字段验类型，坏的那一项丢掉、其余照旧（不整份退回） */
  var u = saved.ui;
  if (u && typeof u === 'object') {
    var maps = ['sub', 'filter', 'folds'], mi, src, dst, k;
    for (mi = 0; mi < maps.length; mi++) {
      src = u[maps[mi]];
      if (!src || typeof src !== 'object') { continue; }
      dst = d.ui[maps[mi]];
      for (k in src) {
        if (!Object.prototype.hasOwnProperty.call(src, k)) { continue; }
        if (maps[mi] === 'folds') { if (typeof src[k] === 'boolean') { dst[k] = src[k]; } }
        else if (typeof src[k] === 'string') { dst[k] = src[k]; }
      }
    }
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
 * 建一张 **实体 ID → 可读名字** 的索引，一次遍历把八个模块里的命名实体全收进来。
 * 标题栏和面板**共用这一份** —— 本仓库的规矩：同一件事别写两套（写两套已经丢过功能）。
 * 覆盖：角色（含坐骑）、地图大区/区域/地点、势力、据点、剧情线、任务。
 * 名字为空就**不收**，这样解析时自然退回 ID，不会把没名字的实体显示成空白。
 */
export function buildNameIndex(stat) {
  var idx = {};
  if (!stat || typeof stat !== 'object') { return idx; }
  var k, sub, sub2, keys, i;
  var chars = stat.characters || {};
  keys = Object.keys(chars);
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (!chars[k]) { continue; }
    if (chars[k].name) { idx[k] = chars[k].name; }
    /* 坐骑与道具也是"有名字的实体"，它们的 ID 同样会当键出现在面板上 */
    var mounts = chars[k].mount || {};
    var mk = Object.keys(mounts);
    for (var j = 0; j < mk.length; j++) {
      if (mounts[mk[j]] && mounts[mk[j]].name) { idx[mk[j]] = mounts[mk[j]].name; }
    }
    var items = chars[k].items || {};
    var ik = Object.keys(items);
    for (var n = 0; n < ik.length; n++) {
      if (items[ik[n]] && items[ik[n]].name) { idx[ik[n]] = items[ik[n]].name; }
    }
  }
  var mn = stat.map_nodes || {};
  keys = Object.keys(mn);
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (!mn[k]) { continue; }
    if (mn[k].name) { idx[k] = mn[k].name; }
    sub = mn[k].areas || {};
    var ak = Object.keys(sub);
    for (var a = 0; a < ak.length; a++) {
      if (sub[ak[a]] && sub[ak[a]].name) { idx[ak[a]] = sub[ak[a]].name; }
      sub2 = (sub[ak[a]] && sub[ak[a]].spots) || {};
      var sk = Object.keys(sub2);
      for (var s = 0; s < sk.length; s++) {
        if (sub2[sk[s]] && sub2[sk[s]].name) { idx[sk[s]] = sub2[sk[s]].name; }
      }
    }
  }
  var fa = stat.factions || {};
  keys = Object.keys(fa);
  for (i = 0; i < keys.length; i++) { if (fa[keys[i]] && fa[keys[i]].name) { idx[keys[i]] = fa[keys[i]].name; } }
  var es = stat.estates || {};
  keys = Object.keys(es);
  for (i = 0; i < keys.length; i++) { if (es[keys[i]] && es[keys[i]].name) { idx[keys[i]] = es[keys[i]].name; } }
  var sl = stat.storylines || {};
  keys = Object.keys(sl);
  for (i = 0; i < keys.length; i++) { if (sl[keys[i]] && sl[keys[i]].title) { idx[keys[i]] = sl[keys[i]].title; } }
  var qs = stat.quests || {};
  keys = Object.keys(qs);
  for (i = 0; i < keys.length; i++) { if (qs[keys[i]] && qs[keys[i]].name) { idx[keys[i]] = qs[keys[i]].name; } }
  /* 设定集用 title 当名字 */
  var lo = stat.lore || {};
  keys = Object.keys(lo);
  for (i = 0; i < keys.length; i++) { if (lo[keys[i]] && lo[keys[i]].title) { idx[keys[i]] = lo[keys[i]].title; } }
  return idx;
}

/** 值是实体 ID 就换成名字；认不出来原样返回（宁可显示得难看，也不要显示成空）。 */
export function resolveRef(value, index) {
  if (typeof value !== 'string' || !index) { return value; }
  return index[value] ? index[value] : value;
}

/* 面板里省掉的字段（用户 2026-10-06 让重新评估过一轮，见报告）：
   · 留着省的：媒体路径（bg_image / bgm）没有渲染管线、icon 没有图标资产、
     color 是皮肤的事、is_user 冗余（"我"永远是自己）；
   · **恢复渲染的**：count / equipped / is_found / key_event / spot_id ——
     做游戏界面时它们恰恰是料（数量角标、已装备标记、未探明迷雾、关键事件、地点引用）。
     它们现在走 widgetOf 拿到各自控件，不再当噪音。 */
export var NOISE_FIELDS = ['is_user', 'bg_image', 'bgm', 'icon', 'color'];

/* ── 面板字段名的中文标签 ──
   机制先落地、**文案等人出稿**：值一律 `【占位·待文案】`，实现不许自己编。
   渲染时查这张表；**查不到就退回原键名** —— 新字段不会因为没人登记就从面板上消失。
   表里只收 **schema 键**；实体名、技能名、货币名那些是**数据**，不是字段名，照原样显示。 */
export var KEY_LABELS = {
  affinity: '好感度',
  age: '年龄',
  agility: '敏捷',
  alias: '别名',
  appearance: '外貌特征',
  areas: '所属片区',
  arm: '手臂部位',
  athletics: '运动',
  body: '身躯部位',
  burglary: '盗窃',
  category: '条目分类',
  cha: '魅力',
  chars: '牵涉角色',
  client: '委托雇主',
  com: '沉着',
  con: '体质',
  connections: '连通路线',
  contacts: '人脉',
  crafts: '工艺',
  deceive: '欺诈',
  desc: '详细描述',
  dev: '调教开发',
  dex: '敏捷',
  diplomacy: '外交关系',
  dnd: '跑团属性',
  domain: '势力领域',
  drive: '驾驶',
  ear: '耳部轮廓',
  empathy: '共情',
  exp: '亲密经历',
  facilities: '附属设施',
  fate: '命运阶梯',
  fu: '最终物语',
  goals: '核心目标',
  health: '身体状态',
  identities: '身份履历',
  impression: '人物印象',
  insight: '洞察',
  int: '智力',
  investigate: '调查',
  items: '随身道具',
  kinks: '特殊性癖',
  latent_kinks: '潜在性癖',
  leader: '阵营领袖',
  libido: '欲望倾向',
  limits: '限制条件',
  line_id: '所属主线',
  location: '所在地点',
  log: '剧情进展',
  long_term: '长期目标',
  lore: '世界秘闻',
  lust: '情欲值',
  man: '操控',
  melee: '近战',
  might: '力量',
  mount: '随行坐骑',
  name: '名称',
  nodes: '关键节点',
  notice: '察觉',
  nsfw: '私密档案',
  objective: '任务目标',
  owner: '产业归属',
  physique: '体格',
  plan: '行动计划',
  pre: '风度',
  present_chars: '在场人物',
  priority: '重要程度',
  promise: '彼此约定',
  provoke: '挑衅',
  rank: '实力位阶',
  rapport: '交际',
  real_desc: '真相反差',
  relation: '阵营关系',
  relations: '人际关系',
  rep: '势力声望',
  res: '决心',
  residents: '常驻居民',
  resources: '财富',
  reward: '任务报酬',
  role: '角色定位',
  round: '当前回合',
  secret: '隐藏秘密',
  sens: '敏感程度',
  shoot: '射击',
  short_term: '短期目标',
  skills: '掌握技能',
  special_stats: '特殊属性',
  spots: '探索据点',
  sta: '耐力',
  stats: '角色属性',
  status: '当前状况',
  stealth: '潜行',
  str: '力量',
  summary: '概要简介',
  tag_name: '标签名',
  thoughts: '当前心绪',
  ties: '羁绊连结',
  time: '剧情时间',
  title: '标题头衔',
  traits: '固有特质',
  trends: '近期动向',
  truth: '核心真相',
  type: '所属类型',
  value: '声望数值',
  wealth: '持有资产',
  weather: '当前天气',
  will: '意志',
  willpower: '意志',
  wis: '感知',
  wits: '机智',
  wod: '黑暗世界',
};

/** 字段名 → 界面标签。查不到退回原键名（保证未登记的新字段照样显示）。 */
export function labelOf(key) {
  var k = String(key == null ? '' : key);
  return (KEY_LABELS && KEY_LABELS[k]) ? KEY_LABELS[k] : k;
}

/** 这一层的键要不要在面板里显示 */
export function isNoiseField(key) {
  return NOISE_FIELDS.indexOf(key) >= 0;
}

/** 递归把"值是实体 ID"的字符串换成名字。数组、对象都下去。 */
export function resolveValue(v, index) {
  if (typeof v === 'string') { return resolveRef(v, index); }
  if (Array.isArray(v)) {
    var a = [];
    for (var i = 0; i < v.length; i++) { a.push(resolveValue(v[i], index)); }
    return a;
  }
  if (v && typeof v === 'object') {
    /* ⚠️ **键也要解析**：relations 的键是角色 ID、items 的键是道具 ID、
       map_nodes 的键是地点 ID —— 只解析值的话这些 ID 照样会露在面板上（实测漏了 9 个）。 */
    var o = {}, k = Object.keys(v);
    for (var j = 0; j < k.length; j++) {
      o[resolveRef(k[j], index)] = resolveValue(v[k[j]], index);
    }
    return o;
  }
  return v;
}

/** 是不是"地点引用"结构（{realm,area,spot}）—— 是的话合成一行地名，不拆成三行 ID */
export function isPlaceRef(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { return false; }
  return !!(v.realm || v.area || v.spot);
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
  /* 走共用的名字索引 —— 面板和标题栏是同一份解析，不会一处会换名字、另一处还在显示 ID */
  var idx = buildNameIndex(stat);
  var ids = ['realm', 'area', 'spot'], parts = [], i, id;
  for (i = 0; i < ids.length; i++) {
    id = txt(loc[ids[i]]);
    if (!id) { continue; }
    parts.push(resolveRef(id, idx));
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
  var idx = buildNameIndex(stat);
  var names = [];
  for (var i = 0; i < present.length; i++) {
    var id = txt(present[i]);
    if (!id) { continue; }
    var nm = '';
    try {
      if (typeof nameOf === 'function') { nm = txt(nameOf(id)); }
      else { nm = txt(resolveRef(id, idx)); }
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
/* 面板的默认宽度与下限（PC）。
   为什么面板宽度**不跟着横幅**：两者共享的是**一条边**（左缘对齐、上缘相接），
   宽度本来就该各自独立。旧实现把 panel.width 直接赋值成横幅宽度，于是
   "球停在右上角 → 横幅只剩 176px → 面板也只剩 176px"，标签行排不下、
   两列卡片挤成一列（实测截图抓到）。现在面板有自己的默认宽与下限。 */
export var DEF_PANEL_W = 420;
export var MIN_PANEL_W = 300;

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

  /* ── 手机：横幅连球占满整行，面板与横幅同宽 ──
     ⚠️ 原来这里写死了"球在左边、横幅向右铺"：mLeft = 球的 x、mW = 视口右缘 - mLeft。
     可球是可以拖到右边的（默认就在右上角！），那时 mW = 390 - 310 - 8 = **72px** ——
     面板被压成一条缝、文字竖排（实测截图抓到的）。
     正确的语义是「球是这一行的排头图标，横幅铺满**球另一侧**的整行」：
     球偏左就向右铺，球偏右就向左铺（与 PC 的镜像复核同一个思路）。
     面板左缘仍然与横幅左缘对齐（连体共享一条边）。 */
  if (mobile) {
    var mLeft, mW, mDir;
    var roomRight = Math.max(0, viewW - center - gap);
    var roomLeft = Math.max(0, center - gap);
    if (roomRight >= roomLeft) {
      /* 球偏左：横幅从球心向右铺到视口右缘 */
      mLeft = center; mW = roomRight; mDir = 'right';
    } else {
      /* 球偏右：镜像到左边，右缘落在球心（球是这一行末尾的图标） */
      mW = roomLeft; mLeft = Math.max(0, center - mW); mDir = 'left';
    }
    if (mW <= 0) { return empty; }
    return {
      mobile: true, left: Math.round(mLeft), top: by, height: size, width: Math.round(mW), dir: mDir,
      gripLeft: mDir === 'left' ? mLeft : mLeft + mW - HANDLE_W,
      panel: { left: Math.round(mLeft), top: by + size, width: Math.round(mW) }
    };
  }

  /* ── PC：内容撑开，用户可覆盖 ──
     ⚠️ 横幅宽度 = **面板宽度**（两者共享一条边，连体）。所以"内容撑开"有个坑：
     球停在右上角时右边没空间，镜像到左边后可用余量只有 176px 左右，
     面板就变成 176px 宽 —— 九个标签排不下、两列卡片挤成一列（实测截图抓到的）。
     修法：没被用户调过宽时，取「内容宽」与「默认面板宽」的**较大者**。
     用户拖过手柄就完全听用户的（那是一次明确的表态）。 */
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

  /* ── 面板宽度：与横幅**共享左缘**，但宽度独立 ──
     用户调过宽就跟着横幅（他调的其实是"这块地方多宽"）；
     没调过就用默认宽 420，再夹到"从左缘到视口右边"的可用空间里，下限 300。
     夹完之后若连下限都放不下（球贴最右边），向左挪一点 —— 宁可失掉
     "左缘完全对齐"这个美观约束，也不能把面板挤成一条缝。 */
  var panelW = (user !== null) ? width : DEF_PANEL_W;
  var avail = Math.max(0, viewW - left - gap);
  var panelLeft = left;
  if (avail < MIN_PANEL_W) {
    panelLeft = Math.max(0, viewW - MIN_PANEL_W - gap);
    avail = Math.max(0, viewW - panelLeft - gap);
  }
  panelW = Math.max(Math.min(panelW, avail), Math.min(MIN_PANEL_W, avail));

  return {
    mobile: false, left: left, top: by, height: size, width: width, dir: dir,
    panelW: Math.round(panelW), panelLeft: Math.round(panelLeft),
    gripLeft: (dir === 'left' ? left : left + width - HANDLE_W),
    panel: { left: panelLeft, top: by + size, width: panelW }
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
    var index = buildNameIndex(stat);
    if (isPlaceRef(shown)) {
      /* 地点：三个字段（realm/area/spot）对用户没意义，**合成一行**可读地名。
         这是"键名该省就省"的落地 —— 用户要看的是"迷雾森林大区 · 林缘哨所区 · 石碑遗迹"，
         不是三行 realm_forest / area_woods_entry / spot_ancient_altar。 */
      rows.push({ key: labelOf(id), rawKey: id, value: locationText(shown, stat) });
    } else if (typeof shown === 'object' && !Array.isArray(shown)) {
      var keys = Object.keys(shown);
      for (var k = 0; k < keys.length; k++) {
        if (isNoiseField(keys[k])) { continue; }   /* 纯记账字段省掉 */
        var cell = shown[keys[k]];
        /* 这一层的值也可能是地点结构（status.location 就是）→ 同样合成一行地名 */
        rows.push({
          key: labelOf(resolveRef(keys[k], index)),
          /* 原始字段名单独留着：key 已经变成中文标签，而 widgetOf 要按**字段名**判形态 */
          rawKey: keys[k],
          value: isPlaceRef(cell) ? locationText(cell, stat) : resolveValue(cell, index)
        });
      }
    } else {
      rows.push({ key: labelOf(id), rawKey: id, value: resolveValue(shown, index) });
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

/* ══════════════════════════════════════════════════════════════════════
 * 值形态 → 界面控件
 * ----------------------------------------------------------------------
 * 用户 2026-10-06：「现在展开后实际上就是展示个数据，我们要的是像 RPG 游戏的 UI」。
 * 于是每一种数据都要有**与其形态相配**的视觉形式，而不是一行"键：值"。
 *
 * 这一节全是**纯函数**：范围 → 填充比、档位 → 配色分档、正负 → 双向条。
 * DOM 只负责把算好的数画出来，不做任何判断 —— 判断错了在单测里就能看见。
 * ══════════════════════════════════════════════════════════════════════ */

/* 各规则体系的属性范围。**条要按各自范围算填充比，不是统统除以 100** ——
   这是这一节存在的理由：D&D 的 10 分、WOD 的 3 分、FU 的 8 面，
   在"除以 100"的算法下全都几乎是空的。 */
export var RANGE = {
  dnd: { min: 1, max: 20 },
  wod: { min: 1, max: 5 },
  fu: { min: 1, max: 12 },      /* 最终物语的骰面 */
  fate: { min: 0, max: 14 },    /* 档位序号，见 FATE_RANKS */
  affinity: { min: -100, max: 100 },
  rep: { min: -100, max: 100 },
  lust: { min: 0, max: 100 },
  percent: { min: 0, max: 100 }
};

/* 带范围的"量表"字段 → 用哪套范围。表里没有的按 percent 处理。 */
export var BAR_FIELDS = {
  affinity: 'affinity', value: 'rep', lust: 'lust', progress: 'percent'
};

/** 路径里有 stats.dnd / stats.wod / stats.fu / stats.fate 就用哪套范围 */
export function statGroupOf(path) {
  var p = '.';
  var a = path || [];
  for (var i = 0; i < a.length; i++) { p += String(a[i]) + '.'; }
  if (p.indexOf('.dnd.') >= 0) { return 'dnd'; }
  if (p.indexOf('.wod.') >= 0) { return 'wod'; }
  if (p.indexOf('.fu.') >= 0) { return 'fu'; }
  if (p.indexOf('.fate.') >= 0) { return 'fate'; }
  return '';
}

/** 数值 → 填充百分比（自动夹在 0-100，脏输入给 0，范围非法时不除零） */
export function fillPct(value, min, max) {
  var n = Number(value);
  if (!isFinite(n)) { return 0; }
  var lo = Number(min), hi = Number(max);
  if (!isFinite(lo)) { lo = 0; }
  if (!isFinite(hi) || hi <= lo) { hi = lo + 1; }
  var p = (n - lo) / (hi - lo) * 100;
  return Math.max(0, Math.min(100, p));
}

/* FATE 命运阶梯：15 档，从 F 到 EX */
export var FATE_RANKS = ['F', 'F+', 'E', 'E+', 'D', 'D+', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'EX'];

/**
 * 字母档位 → 序号 + **配色分档**（1..5）。
 * 分档规则：F/E=1、D/C=2、B=3、A=4、S/EX=5 —— 按"命运阶梯"的直觉分了五级，
 * 皮肤只要给 5 个档位各一个颜色就能覆盖全部 15 档，不用配 15 个。
 * 认不出的档位返回 known:false，由调用方按普通文字处理（不猜、不乱配色）。
 */
export function rankOf(value) {
  var s = String(value == null ? '' : value).trim().toUpperCase();
  var i = FATE_RANKS.indexOf(s);
  if (i < 0) { return { known: false, index: -1, tier: 0, label: s }; }
  var tier = (i <= 3) ? 1 : (i <= 7) ? 2 : (i <= 9) ? 3 : (i <= 11) ? 4 : 5;
  return { known: true, index: i, tier: tier, label: s };
}

/**
 * 正负双向条（好感度、势力声望）。
 * **负的必须看得出来是负的**：所以返回的不是"从 0 开始的填充"，
 * 而是"零点在条的哪个位置 + 有颜色的那一段从哪到哪"。
 * 例如 -75 在 [-100,100] 上是：零点 50%、填充从 12.5% 到 50%（左边一段红的）。
 */
export function signedBar(value, min, max) {
  var lo = Number(min), hi = Number(max);
  if (!isFinite(lo)) { lo = -100; }
  if (!isFinite(hi) || hi <= lo) { hi = lo + 1; }
  var n = Number(value);
  if (!isFinite(n)) { n = 0; }
  n = Math.max(lo, Math.min(hi, n));
  var zero = fillPct(0, lo, hi);
  var at = fillPct(n, lo, hi);
  return {
    value: n, min: lo, max: hi, negative: n < 0, zero: zero, at: at,
    fillLeft: Math.min(zero, at),
    fillWidth: Math.abs(at - zero)
  };
}

/* 状态类文本 → 徽章（不要当普通文字）。这些字段的值本身就是一个"状态词"。 */
export var BADGE_FIELDS = [
  'health', 'status', 'rank', 'priority', 'role', 'type', 'weather',
  'relation', 'phase', 'sens', 'dev'
];

/* 长文本 → 正文段落（别挤在一行里）。超过这个长度就换段落排版。 */
export var TEXT_WRAP_AT = 24;

/** 状态词 → 语气分档（1 好 / 0 中性 / -1 差）。认不出给 0，不猜。 */
export var TONE_WORDS = {
  good: ['完好', '健康', '良好', '正常', 'active', 'done', 'main', 'core', 'user'],
  bad: ['重伤', '重度', '濒死', '虚弱', '创伤', 'failed', 'dead', '危险', '疲惫', '负伤']
};

export function toneOf(value) {
  var s = String(value == null ? '' : value);
  var i;
  for (i = 0; i < TONE_WORDS.good.length; i++) { if (s.indexOf(TONE_WORDS.good[i]) >= 0) { return 1; } }
  for (i = 0; i < TONE_WORDS.bad.length; i++) { if (s.indexOf(TONE_WORDS.bad[i]) >= 0) { return -1; } }
  return 0;
}

/**
 * **值形态 → 控件**。返回 { kind, ... }，DOM 按 kind 画。
 *   bar    有范围的数字 → 条（自带 pct / min / max / value）
 *   signed 可正可负的数值 → 双向条（好感度、声望）
 *   rank   字母档位 → 档位徽章（自带 tier 1..5）
 *   badge  状态词 → 徽章（自带 tone -1/0/1）
 *   chips  列表 → 标签片
 *   card   实体对象 → 卡片
 *   text   长文本 → 段落
 *   num    普通数字
 *   bool   布尔 → 开关灯
 *   kv     兜底：键值一行
 * 传 path（键路径数组）是为了知道这个数字属于哪套规则体系。
 */
export function widgetOf(key, value, path) {
  var k = String(key == null ? '' : key);
  var group = statGroupOf(path);
  var d = describeField(value);

  if (d.kind === 'empty') { return { kind: 'empty' }; }
  if (d.kind === 'bool') { return { kind: 'bool', on: !!value }; }

  if (d.kind === 'number') {
    if (group === 'fate') { return { kind: 'rank', tier: rankOf(value).tier, known: false, label: '' }; }
    if (group) { var r = RANGE[group]; return { kind: 'bar', value: value, min: r.min, max: r.max, pct: fillPct(value, r.min, r.max), group: group }; }
    var f = BAR_FIELDS[k];
    if (f === 'affinity' || f === 'rep') {
      var s = signedBar(value, RANGE[f].min, RANGE[f].max);
      s.kind = 'signed'; s.field = f;
      return s;
    }
    if (f) { var rr = RANGE[f]; return { kind: 'bar', value: value, min: rr.min, max: rr.max, pct: fillPct(value, rr.min, rr.max), group: f }; }
    return { kind: 'num', value: value };
  }

  if (d.kind === 'list') {
    var items = [];
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i];
      items.push(typeof it === 'object' && it ? String(it.name || '·') : String(it));
    }
    return { kind: 'chips', items: items };
  }

  if (d.kind === 'group') { return { kind: 'card', size: Object.keys(value || {}).length }; }

  /* 文本 */
  var s2 = String(value);
  if (group === 'fate') { var rk = rankOf(s2); return { kind: 'rank', tier: rk.tier, known: rk.known, label: rk.label }; }
  if (BADGE_FIELDS.indexOf(k) >= 0) { return { kind: 'badge', text: s2, tone: toneOf(s2) }; }
  if (s2.length > TEXT_WRAP_AT) { return { kind: 'text', text: s2 }; }
  return { kind: 'kv', text: s2 };
}

/* ══════════════════════════════════════════════════════════════════════
 * 信息架构：每个分区回答一个**玩家真会问的问题**
 * ----------------------------------------------------------------------
 * 用户 2026-10-06：「现在简直是一坨屎，没有任何可用价值」—— 问题不在控件，
 * 在于**每个分区都是"把这一层对象的键平铺成一行一行"**。控件换了，架构没变。
 *
 * 所以这里**一个分区一个构造函数**，每个都按自己的信息优先级组织：
 *   状态    我现在在哪、什么时候、谁在场、我自己怎么样
 *   角色    这个人是谁、现在什么状态、跟我什么关系、细节（收起）
 *   地图    我从哪来、能去哪、哪儿还没去过
 *   任务    我该做什么、做完了什么
 *   势力    谁对我好、谁对我坏
 *   剧情线  事情是怎么一步步发展到现在的
 *   不动产  我有什么产业、里面建了什么
 *   设定集  这个世界有什么、什么是真的
 * 通用渲染（遍历键）在这一层被**彻底废掉**。
 * ══════════════════════════════════════════════════════════════════════ */

/** 未探明 = 迷雾。认不出就当"已探明"，不要把有内容的条目误打码。 */
export function isFogged(entity) {
  return !!(entity && typeof entity === 'object' && entity.is_found === false);
}

/**
 * 当前**生效**的那套 RPG 属性系统。四套互斥，只该显示一套。
 * 返回 'fu' / 'dnd' / 'wod' / 'fate'，一套都没有就给空串。
 * 判据是"这套里有键"，不是"这个字段存在" —— 空对象不算生效。
 */
export function activeStatGroup(char) {
  var st = (char && char.stats) || {};
  var order = ['fu', 'dnd', 'wod', 'fate'];
  for (var i = 0; i < order.length; i++) {
    var g = st[order[i]];
    if (g && typeof g === 'object' && Object.keys(g).length > 0) { return order[i]; }
  }
  return '';
}

/**
 * 按名字取一个**稳定又各不相同**的色相（0-359）。
 * 没图的角色全是同一个字母块 → 长得一样分不出谁是谁（用户点出来的）。
 * 用名字的字符码求和取模：同一个名字永远同一个色，不同名字基本不同色。
 * 纯函数、可测 —— 不依赖任何随机数（随机数会导致每次渲染换个颜色）。
 */
export function hueOf(name) {
  var s = String(name == null ? '' : name);
  if (!s) { return 220; }
  var h = 0, i;
  for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) % 100003; }
  return h % 360;
}

/** 头像兜底：没有图就给一个字（名字首字），绝不空着 */
export function avatarOf(char) {
  var c = char || {};
  if (c.avatar || c.portrait || c.icon) { return { kind: 'image', src: c.avatar || c.portrait || c.icon }; }
  var n = String(c.name || '').trim();
  /* hueKey 用**整个名字**而不是首字：否则"雷恩"和"雷诺"会撞成同一个颜色 */
  return { kind: 'letter', text: n ? Array.from(n)[0] : '?', hueKey: n || '?' };
}

/** 关系要有方向感：对**谁**、多少、正负 */
export function relationListOf(char, stat) {
  var rel = (char && char.relations) || {};
  var idx = buildNameIndex(stat || {});
  var out = [], keys = Object.keys(rel), i;
  for (i = 0; i < keys.length; i++) {
    var r = rel[keys[i]] || {};
    var aff = Number(r.affinity);
    if (!isFinite(aff)) { aff = 0; }
    out.push({
      toward: resolveRef(keys[i], idx),
      affinity: aff,
      negative: aff < 0,
      pct: Math.abs(aff) > 100 ? 100 : Math.abs(aff),
      ties: Array.isArray(r.ties) ? r.ties : [],
      impression: r.impression || ''
    });
  }
  out.sort(function (a, b) { return b.affinity - a.affinity; });
  return out;
}

/* ── ① 状态：一句话能看完的 HUD ── */
export function hudOf(stat) {
  var s = (stat && stat.status) || {};
  var idx = buildNameIndex(stat || {});
  var present = Array.isArray(s.present_chars) ? s.present_chars : [];
  var who = [], i;
  for (i = 0; i < present.length; i++) { who.push(resolveRef(present[i], idx)); }
  /* 玩家自己：is_user 为真那个；没有就取第一个核心角色 */
  var chars = (stat && stat.characters) || {};
  var self = null, ks = Object.keys(chars);
  for (i = 0; i < ks.length; i++) { if (chars[ks[i]] && chars[ks[i]].is_user) { self = chars[ks[i]]; break; } }
  if (!self) { for (i = 0; i < ks.length; i++) { if (chars[ks[i]] && chars[ks[i]].role === 'core') { self = chars[ks[i]]; break; } } }
  return {
    round: (s.round === undefined || s.round === null) ? null : s.round,
    when: String(s.time || ''),
    where: locationText(s.location, stat),
    weather: String(s.weather || ''),
    weatherIcon: weatherIcon(s.weather),
    present: who,
    self: self ? {
      name: String(self.name || ''),
      avatar: avatarOf(self),
      health: String(self.health || ''),
      tone: toneOf(self.health || '')
    } : null
  };
}

/* ── ② 角色：角色卡 + 关系方向 + 细节收起 ── */
export function rosterOf(stat, settings) {
  var chars = (stat && stat.characters) || {};
  var keys = Object.keys(chars), out = [], i;
  var group = '';
  for (i = 0; i < keys.length; i++) {
    var g = activeStatGroup(chars[keys[i]]);
    if (g) { group = g; break; }        /* 一套生效的规则组，取第一个有的 */
  }
  for (i = 0; i < keys.length; i++) {
    var c = chars[keys[i]] || {};
    var st = (c.stats && group) ? (c.stats[group] || {}) : {};
    var bars = [], sk = Object.keys(st);
    for (var j = 0; j < sk.length; j++) {
      bars.push({ key: labelOf(sk[j]), value: st[sk[j]], pct: fillPct(st[sk[j]], RANGE[group].min, RANGE[group].max) });
    }
    out.push({
      id: keys[i],
      isSelf: !!c.is_user,
      name: String(c.name || resolveRef(keys[i], buildNameIndex(stat || {}))),
      alias: String(c.alias || ''),
      role: String(c.role || ''),
      avatar: avatarOf(c),
      summary: String(c.summary || ''),
      health: String(c.health || ''),
      tone: toneOf(c.health || ''),
      group: group,
      bars: bars,
      relations: relationListOf(c, stat),
      /* 细节默认收起 */
      details: detailBlocksOf(c, stat)
    });
  }
  /* 玩家自己排最前 */
  out.sort(function (a, b) { return (b.isSelf ? 1 : 0) - (a.isSelf ? 1 : 0); });
  return out;
}

/* 角色卡里"点开才看"的部分。每组一个可折叠块。 */
export var DETAIL_GROUPS = [
  { id: 'goals', label: '目标与打算' },
  { id: 'skills', label: '能力' },
  { id: 'items', label: '资产' },
  { id: 'body', label: '身体' },
  { id: 'nsfw', label: '成人内容' }
];

export function detailBlocksOf(char, stat) {
  var c = char || {}, out = [], i, k;
  /* 目标：long_term / short_term / plan 三样合成一块 */
  var goals = c.goals || {}, plan = Array.isArray(c.plan) ? c.plan : [];
  var grows = [];
  for (k in goals) { if (goals[k]) { grows.push({ key: labelOf(k), value: goals[k] }); } }
  if (plan.length) { grows.push({ key: labelOf('plan'), value: plan }); }
  if (grows.length) { out.push({ id: 'goals', label: labelOf('goals'), rows: grows }); }
  /* 能力：skills + traits + special_stats 合成一块 */
  var arows = [];
  var packs = [['skills', c.skills], ['traits', c.traits], ['special_stats', c.special_stats]];
  for (i = 0; i < packs.length; i++) {
    var src = packs[i][1] || {}, sk2 = Object.keys(src);
    for (var j = 0; j < sk2.length; j++) { arows.push({ key: sk2[j], value: src[sk2[j]] }); }
  }
  if (arows.length) { out.push({ id: 'skills', label: labelOf('skills'), rows: arows }); }
  /* 资产：items + mount + wealth */
  var irows = [];
  var items = c.items || {}, ik = Object.keys(items);
  for (i = 0; i < ik.length; i++) {
    var it = items[i] || {}, raw = items[ik[i]] || {};
    irows.push({
      key: String(raw.name || ik[i]),
      value: (raw.count > 1 ? '×' + raw.count + ' ' : '') + String(raw.desc || ''),
      equipped: raw.equipped === true
    });
  }
  var w = c.wealth || {}, wk = Object.keys(w);
  if (wk.length) {
    var money = [];
    for (i = 0; i < wk.length; i++) { money.push(wk[i] + ' ' + w[wk[i]]); }
    irows.push({ key: labelOf('wealth'), value: money.join(' · ') });
  }
  if (irows.length) { out.push({ id: 'items', label: labelOf('items'), rows: irows }); }
  /* 身体 / 成人内容：只在允许时给 */
  var nsfw = c.nsfw || {}, nk = Object.keys(nsfw);
  if (nk.length) {
    var nrows = [];
    for (i = 0; i < nk.length; i++) {
      if (isNoiseField(nk[i])) { continue; }
      nrows.push({ key: labelOf(nk[i]), value: resolveValue(nsfw[nk[i]], buildNameIndex(stat || {})) });
    }
    if (nrows.length) { out.push({ id: 'nsfw', label: labelOf('nsfw'), rows: nrows }); }
  }
  return out;
}

/* ── ③ 地图：层级 + 连通 + 迷雾 ── */
export function mapTreeOf(stat) {
  var mn = (stat && stat.map_nodes) || {};
  var rk = Object.keys(mn), out = [], i, j, k;
  for (i = 0; i < rk.length; i++) {
    var r = mn[rk[i]] || {};
    var areas = r.areas || {}, ak = Object.keys(areas), aout = [];
    for (j = 0; j < ak.length; j++) {
      var a = areas[ak[j]] || {};
      var spots = a.spots || {}, sk = Object.keys(spots), sout = [];
      for (k = 0; k < sk.length; k++) {
        var sp = spots[sk[k]] || {};
        sout.push({ id: sk[k], name: String(sp.name || sk[k]), found: !isFogged(sp), desc: String(sp.desc || '') });
      }
      sout.sort(function (x, y) { return (y.found ? 1 : 0) - (x.found ? 1 : 0); });
      aout.push({
        id: ak[j], name: String(a.name || ak[j]), found: !isFogged(a),
        desc: String(a.desc || ''), spots: sout,
        links: Array.isArray(a.connections) ? a.connections : []
      });
    }
    /* 已探明的排前面 —— 没去过的沉底 */
    aout.sort(function (x, y) { return (y.found ? 1 : 0) - (x.found ? 1 : 0); });
    out.push({
      id: rk[i], name: String(r.name || rk[i]), found: !isFogged(r),
      desc: String(r.desc || ''), areas: aout,
      links: Array.isArray(r.connections) ? r.connections : []
    });
  }
  out.sort(function (x, y) { return (y.found ? 1 : 0) - (x.found ? 1 : 0); });
  return out;
}

/* ── ④ 任务：按状态分组排序的日志 ── */
export var QUEST_ORDER = ['active', 'pending', 'done', 'failed'];

export function questLogOf(stat) {
  var qs = (stat && stat.quests) || {};
  var keys = Object.keys(qs), idx = buildNameIndex(stat || {}), groups = {}, i;
  for (i = 0; i < QUEST_ORDER.length; i++) { groups[QUEST_ORDER[i]] = []; }
  groups['其他'] = [];
  for (i = 0; i < keys.length; i++) {
    var q = qs[keys[i]] || {};
    var st = String(q.status || '').trim();
    var bucket = QUEST_ORDER.indexOf(st) >= 0 ? st : '其他';
    groups[bucket].push({
      id: keys[i],
      name: String(q.name || keys[i]),
      status: st,
      objective: String(q.objective || ''),
      client: resolveRef(String(q.client || ''), idx),
      reward: String(q.reward || ''),
      limits: String(q.limits || ''),
      line: resolveRef(String(q.line_id || ''), idx)
    });
  }
  var out = [];
  for (i = 0; i < QUEST_ORDER.length; i++) {
    if (groups[QUEST_ORDER[i]].length) { out.push({ status: QUEST_ORDER[i], items: groups[QUEST_ORDER[i]] }); }
  }
  if (groups['其他'].length) { out.push({ status: '其他', items: groups['其他'] }); }
  return out;
}

/* ── ⑤ 势力：声望双向 + 外交态度 ── */
export function factionsOf(stat) {
  var fs = (stat && stat.factions) || {};
  var keys = Object.keys(fs), idx = buildNameIndex(stat || {}), out = [], i, j;
  for (i = 0; i < keys.length; i++) {
    var f = fs[keys[i]] || {};
    var rep = f.rep || {}, rk = Object.keys(rep), reps = [];
    for (j = 0; j < rk.length; j++) {
      var r = rep[rk[j]] || {};
      var v = Number(r.value);
      if (!isFinite(v)) { v = 0; }
      var sb = signedBar(v, RANGE.rep.min, RANGE.rep.max);
      reps.push({
        who: resolveRef(rk[j], idx), title: String(r.title || ''),
        value: v, negative: sb.negative, fillLeft: sb.fillLeft, fillWidth: sb.fillWidth, zero: sb.zero
      });
    }
    /* 对我最差的排前面 —— 那是玩家最需要知道的 */
    reps.sort(function (x, y) { return x.value - y.value; });
    var dip = f.diplomacy || {}, dk = Object.keys(dip), dips = [];
    for (j = 0; j < dk.length; j++) {
      var d = dip[dk[j]] || {};
      dips.push({ toward: resolveRef(dk[j], idx), relation: String(d.relation || ''), trends: String(d.trends || '') });
    }
    out.push({
      id: keys[i], name: String(f.name || keys[i]), type: String(f.type || ''),
      alias: String(f.alias || ''), summary: String(f.summary || ''),
      domain: String(f.domain || ''), reps: reps, diplomacy: dips
    });
  }
  out.sort(function (x, y) {
    var xv = x.reps.length ? x.reps[0].value : 0, yv = y.reps.length ? y.reps[0].value : 0;
    return xv - yv;
  });
  return out;
}

/* ── ⑥ 剧情线：时间线 ── */
export function timelineOf(stat) {
  var sl = (stat && stat.storylines) || {};
  var keys = Object.keys(sl), idx = buildNameIndex(stat || {}), out = [], i, j;
  for (i = 0; i < keys.length; i++) {
    var l = sl[keys[i]] || {};
    var nodes = Array.isArray(l.nodes) ? l.nodes.slice() : [];
    nodes.sort(function (x, y) { var a = Number(x.round), b = Number(y.round); return (isFinite(a) ? a : 0) - (isFinite(b) ? b : 0); });
    /* 已发生 / 当前 / 未发生：拿节点回合和"现在第几回合"比。
       没有回合数的节点当已发生（它已经在记录里了）。 */
    var now = Number(((stat && stat.status) || {}).round);
    if (!isFinite(now)) { now = Infinity; }
    var nout = [];
    for (j = 0; j < nodes.length; j++) {
      var n = nodes[j] || {};
      var cs = Array.isArray(n.chars) ? n.chars : [], cwho = [];
      for (var k = 0; k < cs.length; k++) { cwho.push(resolveRef(cs[k], idx)); }
      var rd = (n.round === undefined ? null : n.round);
      var rn = Number(rd);
      var phase = 'past';
      if (isFinite(rn) && isFinite(now)) { phase = (rn > now) ? 'future' : (rn === now ? 'now' : 'past'); }
      nout.push({
        round: rd, time: String(n.time || ''), title: String(n.title || ''),
        log: String(n.log || ''), chars: cwho, phase: phase
      });
    }
    out.push({ id: keys[i], title: String(l.title || keys[i]), priority: String(l.priority || ''), summary: String(l.summary || ''), nodes: nout });
  }
  /* 主线排前面 */
  var rank = { main: 0, side: 1, personal: 2 };
  out.sort(function (x, y) {
    var a = rank[x.priority] === undefined ? 3 : rank[x.priority];
    var b = rank[y.priority] === undefined ? 3 : rank[y.priority];
    return a - b;
  });
  return out;
}

/* ── ⑦ 不动产：产业卡 + 设施格子 ── */
export function estatesOf(stat) {
  var es = (stat && stat.estates) || {};
  var keys = Object.keys(es), idx = buildNameIndex(stat || {}), out = [], i, j;
  for (i = 0; i < keys.length; i++) {
    var e = es[keys[i]] || {};
    var fac = e.facilities || {}, fk = Object.keys(fac), fout = [];
    for (j = 0; j < fk.length; j++) {
      fout.push({ name: fk[j], desc: String(fac[fk[j]] || ''), built: true });
    }
    var residents = Array.isArray(e.residents) ? e.residents : [], rout = [];
    for (j = 0; j < residents.length; j++) { rout.push(resolveRef(residents[j], idx)); }
    out.push({
      id: keys[i], name: String(e.name || keys[i]), type: String(e.type || ''),
      owner: resolveRef(String(e.owner || ''), idx), found: !isFogged(e),
      desc: String(e.desc || ''), facilities: fout, residents: rout
    });
  }
  out.sort(function (x, y) { return (y.found ? 1 : 0) - (x.found ? 1 : 0); });
  return out;
}

/* ── ⑧ 设定集：按分类分组，truth 只在剧透开关打开时出现 ── */
export function loreOf(stat, settings) {
  var lo = (stat && stat.lore) || {};
  var keys = Object.keys(lo), byCat = {}, order = [], i;
  var showHidden = !!(settings && settings.options && settings.options.showHidden);
  for (i = 0; i < keys.length; i++) {
    var l = lo[keys[i]] || {};
    var cat = String(l.category || '未分类');
    if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
    var item = {
      id: keys[i], title: String(l.title || keys[i]), summary: String(l.summary || ''),
      found: !isFogged(l)
    };
    /* ⚠️ truth 是剧透：开关没开就**根本不放进去**（不是靠 CSS 藏） */
    if (showHidden && l.truth) { item.truth = String(l.truth); }
    byCat[cat].push(item);
  }
  var out = [];
  for (i = 0; i < order.length; i++) { out.push({ category: order[i], items: byCat[order[i]] }); }
  out.sort(function (x, y) { return y.items.length - x.items.length; });
  return out;
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


/* ============================================================================
 * RPG 界面层（2026-10-07）：**每页一个 panel，panel 下面挂子 tab**
 * ----------------------------------------------------------------------------
 * 用户的要求：「角色的各模块应该做成子 tab 页」「其他页也需要」。
 *
 * 这一层只做**纯计算**：每个 panel 有哪些子 tab、每个子 tab 有哪些卡片、
 * 每个卡片折叠态显示什么摘要、筛选条有哪些档、地图节点怎么摆。
 * DOM 一行都不碰 —— 所以这些全都能离线单测，不必真机跑 MVU。
 *
 * 命名说明：`panel` = 一个主标签页（与 settings.modules 的 id 一一对应，
 * 唯一例外是 '__settings'）；`sub` = 子 tab；`filter` = 子 tab 内的筛选档。
 * ============================================================================ */

/** 主标签页的顺序与显示名（copy 指向 STATUS_COPY 的键） */
export var PANELS = [
  { id: 'status', copy: 'secStatus', icon: 'status' },
  { id: 'characters', copy: 'secCharacters', icon: 'roster' },
  { id: 'map_nodes', copy: 'secMap', icon: 'map' },
  { id: 'factions', copy: 'secFactions', icon: 'factions' },
  { id: 'storylines', copy: 'secStorylines', icon: 'storylines' },
  { id: 'quests', copy: 'secQuests', icon: 'quests' },
  { id: 'estates', copy: 'secEstates', icon: 'estates' },
  { id: 'lore', copy: 'secLore', icon: 'lore' },
  { id: 'settings', copy: 'settingsTab', icon: 'settings' }
];

/** 面板里要出哪几个主标签（模块开关关掉的不出；设置页永远钉在最后） */
export function panelTabsOf(settings) {
  var mods = enabledModules(settings), out = [], i;
  for (i = 0; i < mods.length; i++) {
    for (var j = 0; j < PANELS.length; j++) {
      if (PANELS[j].id === mods[i].id) { out.push(PANELS[j]); break; }
    }
  }
  for (i = 0; i < PANELS.length; i++) { if (PANELS[i].id === 'settings') { out.push(PANELS[i]); break; } }
  return out;
}

/* ── 物品类型 ──
   类型名与 design/_discussion/mvu/手写变量结构.yaml 第 121 行的枚举一一对应。
   认不出的类型**原样显示**，不乱归到"其他"——那会让用户以为数据坏了。 */
export var ITEM_TYPES = [
  { id: 'equip', copy: '装备', icon: 'sword' },
  { id: 'prop', copy: '道具', icon: 'flask' },
  { id: 'consume', copy: '消耗', icon: 'flask' },
  { id: 'key', copy: '关键', icon: 'key' },
  { id: 'misc', copy: '杂物', icon: 'cards' }
];

/** 技能三节的顺序：主动 → 被动 → 专有机制 */
export var SKILL_SECTIONS = [
  { id: 'active', copy: 'skillActive', icon: 'bolt', src: 'skills' },
  { id: 'passive', copy: 'skillPassive', icon: 'sparkles', src: 'traits' },
  { id: 'special', copy: 'skillSpecial', icon: 'weight', src: 'special_stats' }
];

/** 剧情线优先级 → 子 tab（与 yaml 第 205 行的 main/side/personal 一一对应） */
export var LINE_PRIORITY = [
  { id: 'main', copy: 'subMain', icon: 'storylines' },
  { id: 'side', copy: 'subSide', icon: 'storylines' },
  { id: 'personal', copy: 'subPersonal', icon: 'storylines' }
];

/* ── 小工具 ── */
function cpy(k) { return STATUS_COPY[k] || k; }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function objKeys(v) { return isObj(v) ? Object.keys(v) : []; }
/** 这个键下面有没有真东西（空对象 / 空数组都算没有） */
function hasAny(v) {
  if (v === undefined || v === null) { return false; }
  if (Array.isArray(v)) { return v.length > 0; }
  if (typeof v === 'object') { return Object.keys(v).length > 0; }
  return String(v).length > 0;
}

/** 玩家自己：is_user 为真那个；没有就退回第一个 core；再没有就 null */
export function selfCharOf(stat) {
  var chars = (stat && stat.characters) || {};
  var ks = Object.keys(chars), i;
  for (i = 0; i < ks.length; i++) { if (chars[ks[i]] && chars[ks[i]].is_user) { return { id: ks[i], char: chars[ks[i]] }; } }
  for (i = 0; i < ks.length; i++) { if (chars[ks[i]] && chars[ks[i]].role === 'core') { return { id: ks[i], char: chars[ks[i]] }; } }
  return null;
}

/** 在场判定：ID 在 status.present_chars 里（也可能写成角色名字，所以名字也认） */
export function isPresent(stat, id, name) {
  var list = ((stat && stat.status) || {}).present_chars;
  if (!Array.isArray(list)) { return false; }
  for (var i = 0; i < list.length; i++) {
    if (list[i] === id) { return true; }
    if (name && list[i] === name) { return true; }
  }
  return false;
}

/** 把「{键: 描述}」形状的字典摊成技能条目（skills / traits / special_stats 三处共用） */
export function skillItemsOf(char, src) {
  var d = (char && char[src]) || {}, ks = Object.keys(d), out = [], i;
  for (i = 0; i < ks.length; i++) {
    out.push({ id: src + ':' + ks[i], name: ks[i], desc: String(d[ks[i]] === null || d[ks[i]] === undefined ? '' : d[ks[i]]) });
  }
  return out;
}

/* ── 卡片构造 ──
   每张卡都是同一个形状，DOM 层只认这几个字段，不认数据来源：
   id / foldId / headless / summary / icon / tone / [分区各自的载荷] */

/** NPC 卡（角色页与主角页都用它；主角页只出自己那一张） */
export function charCardsOf(stat, char, id) {
  var idx = buildNameIndex(stat || {});
  var group = activeStatGroup(char) || '';
  var st = (char && char.stats && group) ? (char.stats[group] || {}) : {};
  var bars = [], sk = Object.keys(st), i;
  for (i = 0; i < sk.length; i++) {
    bars.push({ key: labelOf(sk[i]), value: st[sk[i]], pct: fillPct(st[sk[i]], RANGE[group].min, RANGE[group].max) });
  }
  var health = String((char && char.health) || '');
  return {
    id: id,
    foldId: 'char:' + id,
    headless: false,
    name: String((char && char.name) || resolveRef(id, idx)),
    alias: String((char && char.alias) || ''),
    role: String((char && char.role) || ''),
    age: String((char && char.age) || ''),
    identities: Array.isArray(char && char.identities) ? char.identities.slice() : [],
    rank: String((char && char.rank) || ''),
    avatar: avatarOf(char || {}),
    health: health,
    tone: toneOf(health),
    summary: String((char && char.summary) || ''),
    appearance: String((char && char.appearance) || ''),
    goals: (char && char.goals) || {},
    thoughts: String((char && char.thoughts) || ''),
    plan: Array.isArray(char && char.plan) ? char.plan.slice() : [],
    group: group,
    bars: bars,
    relations: relationListOf(char || {}, stat),
    /* 折叠态的那一行摘要：状态 + 关系数，收起时也扫得出信息 */
    summaryLine: summaryLineOf(health, toneOf(health), (char && char.relations) || {})
  };
}

/** 折叠态摘要："状态良好 · 好感 +8"；两样都没有就给空串（DOM 层不画那一行） */
export function summaryLineOf(health, tone, relations) {
  var parts = [], ks = objKeys(relations), i, best = null;
  if (health) { parts.push(health); }
  for (i = 0; i < ks.length; i++) {
    var r = relations[ks[i]] || {}, v = Number(r.affinity);
    if (!isFinite(v)) { continue; }
    if (best === null || Math.abs(v) < Math.abs(best)) { best = v; }   /* 取绝对值最小的那个当代表 */
  }
  if (best !== null) { parts.push('好感 ' + (best > 0 ? '+' : '') + best); }
  return parts.join(' · ');
}

/* ── 背包 ── */
export function itemCardsOf(char) {
  var items = (char && char.items) || {}, ks = Object.keys(items), out = [], i;
  for (i = 0; i < ks.length; i++) {
    var it = items[ks[i]] || {};
    var type = String(it.type || 'misc');
    out.push({
      id: ks[i],
      foldId: 'item:' + ks[i],
      headless: true,
      kind: 'item',
      type: type,
      typeLabel: itemTypeLabel(type),
      icon: itemIcon(type),
      name: String(it.name || ks[i]),
      count: (it.count === undefined || it.count === null) ? 1 : it.count,
      desc: String(it.desc || ''),
      realDesc: String(it.real_desc || ''),   /* 剧透字段：只在开关打开时给，见 itemCardsFiltered */
      equipped: it.equipped === true,
      summaryLine: String(it.desc || '')
    });
  }
  /* 已装备的排前面，其余按名字稳定排序 */
  out.sort(function (a, b) {
    if (a.equipped !== b.equipped) { return a.equipped ? -1 : 1; }
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return out;
}

/** 物品类型的中文名；认不出的原样返回 */
export function itemTypeLabel(type) {
  for (var i = 0; i < ITEM_TYPES.length; i++) { if (ITEM_TYPES[i].id === type) { return ITEM_TYPES[i].copy; } }
  return String(type || '');
}
export function itemIcon(type) {
  for (var i = 0; i < ITEM_TYPES.length; i++) { if (ITEM_TYPES[i].id === type) { return ITEM_TYPES[i].icon; } }
  return 'cards';
}

/** 货币：主货币优先、其余按原顺序跟在后面。非数值的等价物原样显示 */
export function wealthOf(char) {
  var w = (char && char.wealth) || {}, ks = Object.keys(w), out = [], i;
  for (i = 0; i < ks.length; i++) {
    out.push({ name: ks[i], value: w[ks[i]], numeric: typeof w[ks[i]] === 'number' });
  }
  return out;
}

/** 坐骑 / 载具 */
export function mountsOf(char) {
  var m = (char && char.mount) || {}, ks = Object.keys(m), out = [], i;
  for (i = 0; i < ks.length; i++) {
    var x = m[ks[i]] || {};
    out.push({
      id: ks[i], name: String(x.name || ks[i]), type: String(x.type || ''),
      desc: String(x.desc || ''), realDesc: String(x.real_desc || ''),
      status: String(x.status || ''), equipped: x.equipped === true
    });
  }
  return out;
}

/** 装备槽：数据里**没有部位字段**，所以只按"`equipped` 有几件"点亮同样多的通用槽 */
export var SLOT_NAMES = ['slotWeapon', 'slotArmor', 'slotTrinket'];
export function slotsOf(items) {
  var worn = [], i;
  for (i = 0; i < items.length; i++) { if (items[i].equipped) { worn.push(items[i]); } }
  var out = [];
  for (i = 0; i < SLOT_NAMES.length; i++) {
    out.push({
      label: cpy(SLOT_NAMES[i]),
      filled: i < worn.length,
      name: i < worn.length ? worn[i].name : cpy('slotEmpty'),
      icon: i < worn.length ? worn[i].icon : 'shirt'
    });
  }
  return out;
}

/* ── 设定集分类 ──
   分类名来自数据（yaml 第 246 行列了六类），所以**不硬编码顺序**：
   按数据里第一次出现的顺序走，这样自定义分类也能出来。 */
export function loreCategoriesOf(stat, settings) {
  var groups = loreOf(stat, settings), out = [], i;
  for (i = 0; i < groups.length; i++) { out.push({ id: groups[i].category, label: groups[i].category, count: groups[i].items.length }); }
  return out;
}

/* ── 筛选档 ──
   一个选项的形状：{ id, label, count }。count 用于显示，也用于"0 条不出档"。 */
function opt(id, label, count) { return { id: id, label: label, count: count }; }

/** 按某个取值字段分组出档位（去重 + 计数），用于"按类型""按分类"这类 */
function optsFromField(items, field, allLabel) {
  var seen = {}, order = [], i, v;
  for (i = 0; i < items.length; i++) {
    v = String((items[i] && items[i][field]) || '');
    if (!v) { continue; }
    if (!seen[v]) { seen[v] = 0; order.push(v); }
    seen[v]++;
  }
  /* 只有一种取值（或一个都没有）→ 等于没有筛选，连"全部"都不给，DOM 据此不画那一行 */
  if (order.length < 2) { return [opt('all', allLabel, items.length)]; }
  var out = [opt('all', allLabel, items.length)];
  for (i = 0; i < order.length; i++) { out.push(opt(order[i], order[i], seen[order[i]])); }
  return out;
}

/**
 * 一个子 tab 的筛选档。**返回 1 档就是"没有筛选"**（DOM 层据此不画那一行）。
 * counts 由调用方先算好（它知道每个档位该数什么）。
 */
/**
 * 筛选档定义。**键是 `主面板id:子tabid`，主面板 id 必须与 PANELS / MODULES 那套一致**
 * （characters 不是 roster、map_nodes 不是 map）—— 写岔了不会报错，只会静默退回
 * "只有全部一档"，表现就是"筛选条不出现"（实测踩过一次，探针抓出来的）。
 * 只写主面板 id 的键表示"这一页所有子 tab 共用这一套档"。
 */
export var FILTER_DEFS = {
  'status:bag': function (ctx) {
    var items = ctx.items, out = [opt('all', cpy('filterAll'), items.length)], i, j;
    for (i = 0; i < ITEM_TYPES.length; i++) {
      var n = 0;
      for (j = 0; j < items.length; j++) { if (items[j].type === ITEM_TYPES[i].id) { n++; } }
      if (n > 0) { out.push(opt(ITEM_TYPES[i].id, ITEM_TYPES[i].copy, n)); }
    }
    return out;
  },
  'status:skill': function (ctx) {
    /* ⚠️ 这里数的是"每个节里有几条"，不是"几节"。
       分组对象是 {id,label,icon,count}，条目要现数 —— 直接把分组当条目用过一次，
       结果是 s[i].items.length 崩掉（探针抓到的）。 */
    var groups = ctx.skillGroups || [], out = [], i, total = 0;
    for (i = 0; i < groups.length; i++) { total += groups[i].count; }
    out.push(opt('all', cpy('filterAll'), total));
    for (i = 0; i < groups.length; i++) {
      out.push(opt(groups[i].id, groups[i].label, groups[i].count));
    }
    return out;
  },
  'characters:all': function (ctx) {
    /* ⚠️ "只有一档"时把 'all' 也去掉 —— 留一个孤零零的"全部 N"是没意义的，
       而 DOM 层的判断是"档数 < 2 就不画这一行"。原来写成 out.length > 2 时返回 out，
       于是只有一种 role 的场合会剩下一档"全部"，DOM 照样画一行点不动的筛选条。 */
    var out = [opt('all', cpy('filterAll'), ctx.items.length)], i;
    var roles = [['core', 'core'], ['major', 'major'], ['minor', 'minor']];
    for (i = 0; i < roles.length; i++) {
      var n = 0;
      for (var j = 0; j < ctx.items.length; j++) { if (ctx.items[j].role === roles[i][0]) { n++; } }
      if (n > 0) { out.push(opt(roles[i][0], roles[i][1], n)); }
    }
    /* 一共只有一档 → 等于没有筛选 */
    return out.length > 1 ? out : [opt('all', cpy('filterAll'), ctx.items.length)];
  },
  'map_nodes:detail': function (ctx) {
    var found = 0, i, un = 0;
    for (i = 0; i < ctx.areas.length; i++) { if (ctx.areas[i].found) { found++; } else { un++; } }
    var out = [opt('all', cpy('filterAll'), ctx.areas.length)];
    if (found) { out.push(opt('found', cpy('filterFound'), found)); }
    if (un) { out.push(opt('unknown', cpy('filterUnknown'), un)); }
    return out;
  },
  'factions:rep': function () { return [opt('rep', cpy('filterByRep'), 0), opt('name', cpy('filterByName'), 0)]; },
  'storylines': function (ctx) {
    /* "未完结"= 有节点正处在"当前"这一回合；"已完结"= 没有当前节点。
       注意 phase 的取值是 past / now / future（见 timelineOf，第 1669 行），不是 done。 */
    var out = [opt('all', cpy('filterAll'), ctx.items.length)], n = 0, i;
    for (i = 0; i < ctx.items.length; i++) { if (ctx.items[i].phase === 'now') { n++; } }
    if (n) { out.push(opt('open', cpy('filterOpen'), n)); }
    if (ctx.items.length - n) { out.push(opt('closed', cpy('filterClosed'), ctx.items.length - n)); }
    return out;
  },
  'quests': function (ctx) { return optsFromField(ctx.items, 'qtype', cpy('filterAllTypes')); },
  'estates:type': function (ctx) { return optsFromField(ctx.items, 'type', cpy('filterAllTypes')); },
  'estates:owned': function (ctx) { return optsFromField(ctx.items, 'type', cpy('filterAllTypes')); },
  'lore': function () { return [opt('all', cpy('filterAll'), 0)]; }
};

/** 取某个 (panel, sub) 的筛选档；没有定义就返回"只有全部"一档 */
export function filterOptionsOf(panelId, subId, ctx) {
  var key = panelId + ':' + subId;
  var fn = FILTER_DEFS[key] || FILTER_DEFS[panelId];
  if (typeof fn !== 'function') { return [opt('all', cpy('filterAll'), (ctx && ctx.items ? ctx.items.length : 0))]; }
  var out = fn(ctx || {});
  return (out && out.length) ? out : [opt('all', cpy('filterAll'), 0)];
}

/** 按筛选档把卡片筛一遍。筛掉的档位若被存下来了，回退到第一档。 */
export function applyFilter(cards, panelId, subId, filterId) {
  if (!filterId || filterId === 'all') { return { cards: cards, filterId: 'all' }; }
  if (panelId === 'status' && subId === 'bag') {
    return { cards: keep(cards, function (c) { return c.type === filterId; }), filterId: filterId };
  }
  if (panelId === 'status' && subId === 'skill') {
    return { cards: keep(cards, function (c) { return c.section === filterId; }), filterId: filterId };
  }
  if (panelId === 'characters' && subId === 'all') {
    return { cards: keep(cards, function (c) { return c.role === filterId; }), filterId: filterId };
  }
  if (panelId === 'map_nodes' && subId === 'detail') {
    return { cards: keep(cards, function (c) { return filterId === 'found' ? c.found : !c.found; }), filterId: filterId };
  }
  if (panelId === 'estates' && (subId === 'type' || subId === 'owned')) {
    return { cards: keep(cards, function (c) { return c.type === filterId; }), filterId: filterId };
  }
  if (panelId === 'quests') {
    return { cards: keep(cards, function (c) { return c.qtype === filterId; }), filterId: filterId };
  }
  if (panelId === 'storylines') {
    if (filterId === 'open') { return { cards: keep(cards, function (c) { return c.phase === 'now'; }), filterId: filterId }; }
    if (filterId === 'closed') { return { cards: keep(cards, function (c) { return c.phase !== 'now'; }), filterId: filterId }; }
    return { cards: cards, filterId: filterId };
  }
  /* 排序类档位（不是筛选，是"按什么排"）：势力声望页的"按声望升序 / 按名称"。
     ⚠️ 这里必须**原样保留 filterId**，不能落回最后那条 return ——
     落回去就把当前档位改写成 'all'，而 'all' 根本不在可选档里，
     于是 chip 高亮全灭、界面显示"没有选中任何排序"（实测踩到）。 */
  if (panelId === 'factions' && subId === 'rep') {
    var sorted = cards.slice();
    if (filterId === 'name') {
      sorted.sort(function (x, y) { return String(x.name).localeCompare(String(y.name), 'zh'); });
    } else {
      sorted.sort(function (x, y) {
        var xv = x.reps.length ? x.reps[0].value : 0, yv = y.reps.length ? y.reps[0].value : 0;
        return xv - yv;                       /* 最差的排最前（既有规则） */
      });
    }
    return { cards: sorted, filterId: filterId };
  }
  return { cards: cards, filterId: filterId };
}
function keep(arr, fn) { var out = [], i; for (i = 0; i < arr.length; i++) { if (fn(arr[i])) { out.push(arr[i]); } } return out; }

/* ── 每页的卡片构造 ──
   统一形状：{ id, foldId, headless, name, summaryLine, icon, tone, ...载荷 } */

function skillCardsOf(char, hideHidden) {
  var out = [], i, j;
  for (i = 0; i < SKILL_SECTIONS.length; i++) {
    var sec = SKILL_SECTIONS[i], items = skillItemsOf(char, sec.src);
    for (j = 0; j < items.length; j++) {
      out.push({
        id: items[j].id, foldId: 'skill:' + items[j].id, headless: true,
        kind: 'skill', section: sec.id,
        icon: sec.icon, name: items[j].name, desc: items[j].desc,
        summaryLine: items[j].desc
      });
    }
  }
  return out;
}
/** 技能分组（每节一个小标题 + 条目数） */
function skillGroupsOf(char) {
  var out = [], i;
  for (i = 0; i < SKILL_SECTIONS.length; i++) {
    var items = skillItemsOf(char, SKILL_SECTIONS[i].src);
    if (items.length) { out.push({ id: SKILL_SECTIONS[i].id, label: cpy(SKILL_SECTIONS[i].copy), icon: SKILL_SECTIONS[i].icon, count: items.length }); }
  }
  return out;
}

function mapDetailCardsOf(stat) {
  var tree = mapTreeOf(stat), out = [], i, j;
  for (i = 0; i < tree.length; i++) {
    var r = tree[i];
    for (j = 0; j < r.areas.length; j++) {
      var a = r.areas[j];
      out.push({
        id: a.id, foldId: 'area:' + a.id, headless: false,
        kind: 'area', realm: r.name, realmFound: r.found,
        name: a.name, found: a.found, desc: a.desc,
        spots: a.spots, links: a.links,
        summaryLine: (a.found ? (a.desc || '') : cpy('subUnknown')) + (a.spots.length ? ' · ' + a.spots.length + ' 个地点' : '')
      });
    }
  }
  return out;
}

function factionCardsOf(stat) {
  var list = factionsOf(stat), out = [], i, j;
  for (i = 0; i < list.length; i++) {
    var f = list[i], reps = [], dips = [];
    for (j = 0; j < f.reps.length; j++) {
      var r = f.reps[j];
      reps.push({ who: r.who, title: r.title, value: r.value, negative: r.negative, zero: r.zero, fillLeft: r.fillLeft, fillWidth: r.fillWidth });
    }
    for (j = 0; j < f.diplomacy.length; j++) { dips.push({ toward: f.diplomacy[j].toward, relation: f.diplomacy[j].relation, trends: f.diplomacy[j].trends }); }
    /* 自己的声望里最差的那个当头部标（对齐"最差的排前面"那条既有规则） */
    var worst = reps.length ? reps[0] : null;
    out.push({
      id: f.id, foldId: 'faction:' + f.id, headless: false,
      kind: 'faction', icon: 'factions',
      name: f.name, alias: f.alias, type: f.type, summary: f.summary,
      domain: f.domain, reps: reps, diplomacy: dips,
      tone: worst ? (worst.value < 0 ? -1 : (worst.value > 0 ? 1 : 0)) : 0,
      summaryLine: worst ? (worst.who + ' ' + (worst.value > 0 ? '+' : '') + worst.value) : (f.alias || f.type)
    });
  }
  return out;
}

function storylineCardsOf(stat) {
  var lines = timelineOf(stat), out = [], i, j;
  for (i = 0; i < lines.length; i++) {
    var l = lines[i], nodes = [];
    for (j = 0; j < l.nodes.length; j++) {
      var n = l.nodes[j];
      nodes.push({ title: n.title, round: n.round, log: n.log, chars: n.chars, phase: n.phase });
    }
    /* "当前"取最后一个已发生节点；没有已发生的就取第一个 */
    var phase = 'future';
    for (j = 0; j < nodes.length; j++) { if (nodes[j].phase && nodes[j].phase !== 'future') { phase = nodes[j].phase; } }
    out.push({
      id: l.id, foldId: 'line:' + l.id, headless: false,
      kind: 'line', priority: l.priority, icon: 'storylines',
      title: l.title, summary: l.summary, nodes: nodes, phase: phase,
      summaryLine: (l.summary || '') + (nodes.length ? ' · ' + nodes.length + ' 个节点' : '')
    });
  }
  return out;
}

function questCardsOf(stat) {
  var log = questLogOf(stat), out = [], i, j;
  var raw = (stat && stat.quests) || {};
  for (i = 0; i < log.length; i++) {
    var g = log[i];
    for (j = 0; j < g.items.length; j++) {
      var q = g.items[j];
      out.push({
        id: q.id, foldId: 'quest:' + q.id, headless: false,
        kind: 'quest', status: q.status, icon: 'quests',
        qtype: String(((raw[q.id] || {}).type) || ''),
        name: q.name, objective: q.objective, client: q.client,
        reward: q.reward, limits: q.limits, line: q.line,
        tone: q.status === 'done' ? 1 : (q.status === 'failed' ? -1 : 0),
        summaryLine: q.objective || (q.client ? cpy('questClient') + ' ' + q.client : '')
      });
    }
  }
  return out;
}

function estateCardsOf(stat) {
  var list = estatesOf(stat), out = [], i;
  for (i = 0; i < list.length; i++) {
    var e = list[i];
    out.push({
      id: e.id, foldId: 'estate:' + e.id, headless: false,
      kind: 'estate', icon: 'estates',
      name: e.name, type: e.type, owner: e.owner, found: e.found,
      desc: e.desc, facilities: e.facilities, residents: e.residents,
      summaryLine: [e.type, e.owner, (e.facilities.length ? e.facilities.length + ' 项设施' : '')].filter(Boolean).join(' · ')
    });
  }
  return out;
}

function loreCardsOf(stat, settings) {
  var groups = loreOf(stat, settings), out = [], i, j;
  for (i = 0; i < groups.length; i++) {
    var g = groups[i];
    for (j = 0; j < g.items.length; j++) {
      var it = g.items[j];
      out.push({
        id: it.id, foldId: 'lore:' + it.id, headless: false,
        kind: 'lore', category: g.category, icon: 'lore',
        title: it.title, found: it.found, summary: it.summary, truth: it.truth,
        summaryLine: it.found ? (it.summary || '') : cpy('subUnknown')
      });
    }
  }
  return out;
}

/* ── 地图节点图 ── */

/** 稳定哈希：同一个 ID 永远得到同一张图（可复现、可断言） */
export function stableHash(s) {
  var h = 2166136261, i, str = String(s || '');
  for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}

/**
 * 把 map_nodes 摊成一张图，并算好每个节点的坐标（**归一化到 0..1**，DOM 层再乘像素）。
 * 摆法：当前所在的区域放正中；其余已探明的按 ID 哈希散在圆周上（角度稳定）；
 * 未探明的放外圈、虚线。
 * 边：connections 是无向的，同一对只画一条；**任一端未探明就画虚线**。
 */
export function mapGraphOf(stat) {
  var tree = mapTreeOf(stat), realm = {}, areas = [], i, j, k;
  for (i = 0; i < tree.length; i++) {
    for (j = 0; j < tree[i].areas.length; j++) {
      var a = tree[i].areas[j];
      realm[a.id] = tree[i].id;
      areas.push({ id: a.id, name: a.name, found: a.found, realm: tree[i].id, realmFound: tree[i].found, links: a.links, spots: a.spots.length });
    }
  }
  var here = currentAreaOf(stat);
  var found = [], fog = [];
  for (i = 0; i < areas.length; i++) { (areas[i].found ? found : fog).push(areas[i]); }

  /* 中心位：当前所在 > 第一个已探明 */
  var centerId = null;
  for (i = 0; i < found.length; i++) { if (found[i].id === here) { centerId = here; } }
  if (!centerId && found.length) { centerId = found[0].id; }

  var nodes = [], n = 0;
  for (i = 0; i < found.length; i++) {
    var it = found[i];
    if (it.id === centerId) {
      nodes.push(mkNode(it, 0.5, 0.5, true));
    } else {
      var ang = ringAngle(it.id, n++);
      var rad = found.length <= 2 ? 0.42 : 0.38;
      nodes.push(mkNode(it, 0.5 + Math.cos(ang) * rad, 0.5 + Math.sin(ang) * rad * 0.82, false));
    }
  }
  /* 未探明：外圈，角度也按 ID 稳定。
     ⚠️ 外圈半径要看**已探明有几个**：只有一个已探明时，把雾节点甩到 0.50 会让
     那唯一一条连线横穿整张图（实测很难看）。所以少的时候往回收。 */
  var fogRad = found.length <= 1 ? 0.34 : (found.length <= 3 ? 0.44 : 0.50);
  for (i = 0; i < fog.length; i++) {
    var ang2 = ringAngle(fog[i].id, i);
    nodes.push(mkNode(fog[i], 0.5 + Math.cos(ang2) * fogRad, 0.5 + Math.sin(ang2) * fogRad * 0.86, false));
  }
  /* 没有已探明节点时，把未探明的也摆到内圈，免得图空成一个大圈 */
  if (!found.length && fog.length) {
    for (i = 0; i < nodes.length; i++) {
      var ang3 = ringAngle(nodes[i].id, i);
      nodes[i].x = 0.5 + Math.cos(ang3) * 0.30;
      nodes[i].y = 0.5 + Math.sin(ang3) * 0.30 * 0.82;
    }
  }

  var edges = [], seen = {}, byId = {};
  for (i = 0; i < areas.length; i++) { byId[areas[i].id] = areas[i]; }
  for (i = 0; i < areas.length; i++) {
    for (j = 0; j < areas[i].links.length; j++) {
      var to = areas[i].links[j];
      if (!byId[to]) { continue; }                       /* connections 指到不存在的 ID：忽略，不伪造节点 */
      var key = areas[i].id < to ? (areas[i].id + '|' + to) : (to + '|' + areas[i].id);
      if (seen[key]) { continue; }
      seen[key] = 1;
      edges.push({ a: areas[i].id, b: to, found: areas[i].found && byId[to].found });
    }
  }
  var realms = [], rk = {};
  for (i = 0; i < tree.length; i++) { realms.push({ id: tree[i].id, name: tree[i].name, found: tree[i].found }); rk[tree[i].id] = 1; }
  return { nodes: nodes, edges: edges, realms: realms, here: here, areaCount: areas.length, fogCount: fog.length };

  function mkNode(it, x, y, current) {
    return {
      id: it.id, name: it.name, found: it.found, realm: it.realm, realmName: realmNameOf(it.realm),
      spots: it.spots, links: it.links,
      x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000,
      current: !!current
    };
  }
  function realmNameOf(id) {
    for (var t = 0; t < tree.length; t++) { if (tree[t].id === id) { return tree[t].name; } }
    return '';
  }
}

/** 圆周角度：按 ID 哈希散开，同一个 ID 永远同一个角度 */
function ringAngle(id, fallbackIndex) {
  var h = stableHash(id);
  return ((h % 360) + (fallbackIndex * 137)) * Math.PI / 180;
}

/** 当前所在的区域 ID（location 可能是 ID 结构，也可能是一句话，所以只认 ID 那种） */
export function currentAreaOf(stat) {
  var loc = ((stat && stat.status) || {}).location;
  if (isObj(loc) && loc.area) { return String(loc.area); }
  return null;
}

/** 区域太多就建议切列表视图（图会挤成一团、圆点小于可点尺寸） */
export var GRAPH_MAX_NODES = 8;
export function shouldUseList(areaCount, form) {
  if (!areaCount) { return false; }
  return form === 'drawer' && areaCount > GRAPH_MAX_NODES;
}
/** 带开关版：设置里关掉"自动切列表"就永远画图（用户能自己决定看哪种） */
export function shouldUseListWith(settings, areaCount, form) {
  var on = !(settings && settings.options && settings.options.graphAutoList === false);
  return on ? shouldUseList(areaCount, form) : false;
}

/* ── 面板数据总入口 ── */

/** 商店/来源不明的"其他"档：quests 的类型取自 type 字段 */
function questTypeOf(q) { return String((q && q.type) || ''); }

/**
 * 一个面板要画什么，**全在这里决定**（DOM 层不做任何取舍判断）。
 * 返回：{ tabs:[…], tab, sub, subs:[…], filterId, filters:[…], groups:[…], cards:[…], graph:{…} }
 */
export function panelPlanOf(stat, settings, panelId, state, form) {
  var st = state || {};
  var s = settings || defaultSettings();
  var showHidden = !!(s.options && s.options.showHidden);
  var selfRef = selfCharOf(stat);
  var sum = {};                                        /* 各处的计数，喂给子 tab 与筛选档 */

  /* ── ① 主角：概览 / 背包 / 技能 ── */
  var selfCards = selfRef ? [charCardsOf(stat, selfRef.char, selfRef.id)] : [];
  var items = selfRef ? itemCardsOf(selfRef.char) : [];
  var skills = selfRef ? skillGroupsOf(selfRef.char) : [];
  var wealth = selfRef ? wealthOf(selfRef.char) : [];
  var mounts = selfRef ? mountsOf(selfRef.char) : [];

  /* ── ② 角色：NPC（排除主角自己） ── */
  var chars = (stat && stat.characters) || {}, ck = Object.keys(chars), npc = [], nk;
  for (nk = 0; nk < ck.length; nk++) {
    if (selfRef && ck[nk] === selfRef.id) { continue; }
    npc.push(charCardsOf(stat, chars[ck[nk]], ck[nk]));
  }
  var present = [], i;
  for (i = 0; i < npc.length; i++) { if (isPresent(stat, npc[i].id, npc[i].name)) { present.push(npc[i]); } }

  /* ── ③ 地图 ── */
  var graph = mapGraphOf(stat);
  var areas = mapDetailCardsOf(stat);

  /* ── ④–⑧ ── */
  var factions = factionCardsOf(stat);
  var lines = storylineCardsOf(stat);
  var quests = questCardsOf(stat);
  var estates = estateCardsOf(stat);
  var loreCards = loreCardsOf(stat, settings);
  var categories = loreCategoriesOf(stat, settings);

  /* 子 tab 列表 */
  var subs = [];
  var subCtx = {};
  function pushSub(id, copyKey, count) { subs.push({ id: id, label: cpy(copyKey), count: count }); }

  if (panelId === 'status') {
    if (!selfRef) { return emptyPanel(panelId, 'noSelf'); }
    pushSub('overview', 'subOverview', 0);
    if (items.length || wealth.length) { pushSub('bag', 'subBag', items.length); }
    if (skills.length) { pushSub('skill', 'subSkill', skills.length); }
    subCtx = { items: items, skillGroups: skills };
  } else if (panelId === 'characters') {
    if (present.length) { pushSub('present', 'subPresent', present.length); }
    if (npc.length) { pushSub('all', 'subAll', npc.length); }
    subCtx = { items: npc };
  } else if (panelId === 'map_nodes') {
    if (graph.areaCount) { pushSub('graph', 'subGraph', 0); }
    if (areas.length) { pushSub('detail', 'subDetail', areas.length); }
    subCtx = { areas: areas };
  } else if (panelId === 'factions') {
    if (factions.length) {
      var repN = 0, dipN = 0;
      for (i = 0; i < factions.length; i++) { repN += factions[i].reps.length; dipN += factions[i].diplomacy.length; }
      pushSub('rep', 'subRep', repN); pushSub('dip', 'subDip', dipN); pushSub('org', 'subOrg', factions.length);
    }
    subCtx = { items: factions };
  } else if (panelId === 'storylines') {
    for (i = 0; i < LINE_PRIORITY.length; i++) {
      var n = 0;
      for (var j = 0; j < lines.length; j++) { if ((lines[j].priority || 'side') === LINE_PRIORITY[i].id) { n++; } }
      if (n) { pushSub(LINE_PRIORITY[i].id, LINE_PRIORITY[i].copy, n); }
    }
    subCtx = { items: lines };
  } else if (panelId === 'quests') {
    var qg = { active: 0, pending: 0, closed: 0 };
    for (i = 0; i < quests.length; i++) {
      var qs = quests[i].status;
      if (qs === 'active') { qg.active++; } else if (qs === 'pending') { qg.pending++; } else { qg.closed++; }
    }
    if (qg.active) { pushSub('active', 'subActive', qg.active); }
    if (qg.pending) { pushSub('pending', 'subPending', qg.pending); }
    if (qg.closed) { pushSub('closed', 'subClosed', qg.closed); }
    subCtx = { items: quests };
  } else if (panelId === 'estates') {
    var owned = [], unknown = [], typed = {};
    for (i = 0; i < estates.length; i++) {
      var e = estates[i];
      if (!e.found) { unknown.push(e); continue; }
      if (isMineOwner(e.owner, stat, selfRef)) { owned.push(e); }
      if (e.type) { typed[e.type] = 1; }
    }
    if (owned.length) { pushSub('owned', 'subOwned', owned.length); }
    if (Object.keys(typed).length > 1) { pushSub('type', 'subByType', 0); }
    if (unknown.length) { pushSub('unknown', 'subUnknown', unknown.length); }
    if (!subs.length && estates.length) { pushSub('owned', 'subOwned', estates.length); }
    subCtx = { items: estates };
  } else if (panelId === 'lore') {
    for (i = 0; i < categories.length; i++) { pushSub(categories[i].id, categories[i].id, categories[i].count); }
    subCtx = { items: loreCards };
  } else if (panelId === 'settings') {
    pushSub('modules', 'subModules', 0); pushSub('display', 'subDisplay', 0); pushSub('about', 'subAbout', 0);
    subCtx = {};
  }

  /* 打开的面板没内容 → 统一空态 */
  if (!subs.length) { return emptyPanel(panelId, 'empty'); }

  /* 选中的子 tab：存下来的若已失效（模块被关掉、这一档没内容）就回退到第一个 */
  var ids = [], si;
  for (si = 0; si < subs.length; si++) { ids.push(subs[si].id); }
  var sub = indexOfStr(ids, st.sub) >= 0 ? st.sub : ids[0];

  /* 选中的筛选档：同样回退到第一档。
     ⚠️ 不能无条件用 'all' 兜底 —— "按声望升序"那种档位里根本没有 'all' 这个选项，
     回退到 'all' 会让 applyFilter 一条都匹配不上、列表直接空掉。 */
  var filters = filterOptionsOf(panelId, sub, subCtx);
  /* ⚠️ 默认值必须是**第一档**，不能无条件写 'all'：
     "按声望升序 / 按名称"这种档位里根本没有 'all' 这个选项，默认成 'all' 会让
     applyFilter 一条都匹配不上 —— 表现就是"打开势力页，列表空的"。 */
  var fid = filters.length ? filters[0].id : 'all';
  if (st.filter) {
    for (i = 0; i < filters.length; i++) { if (filters[i].id === st.filter) { fid = st.filter; } }
  }

  /* 卡片：按子 tab 取那一组，再按筛选档收窄 */
  var cards = [], groups = [], extra = {};
  if (panelId === 'status') {
    if (sub === 'overview') { cards = selfCards; }
    else if (sub === 'bag') {
      cards = items;
      extra.wealth = wealth; extra.slots = slotsOf(items); extra.mounts = mounts;
    } else if (sub === 'skill') {
      for (i = 0; i < skills.length; i++) { groups.push(skills[i]); }
      /* 技能卡的筛选在 applyFilter 里统一做（'status:skill' 那一支），这里不再自己筛一遍 */
      cards = skillCardsOf(selfRef.char, false);
    }
  } else if (panelId === 'characters') {
    cards = sub === 'present' ? present : npc;
  } else if (panelId === 'map_nodes') {
    if (sub === 'graph') { extra.graph = graph; }
    else { cards = areas; }
  } else if (panelId === 'factions') {
    if (sub === 'rep') { cards = factions.slice(); }
    else if (sub === 'dip') { cards = factionDipCards(factions); }
    else { cards = factions; }
  } else if (panelId === 'storylines') {
    cards = pickByField(lines, 'priority', sub, 'side');
  } else if (panelId === 'quests') {
    if (sub === 'active') { cards = pickByField(quests, 'status', 'active', ''); }
    else if (sub === 'pending') { cards = pickByField(quests, 'status', 'pending', ''); }
    else { cards = keepArr(quests, function (c) { return c.status !== 'active' && c.status !== 'pending'; }); }
  } else if (panelId === 'estates') {
    if (sub === 'owned') { cards = keepArr(estates, function (c) { return c.found && isMineOwner(c.owner, stat, selfRef); }); }
    else if (sub === 'unknown') { cards = keepArr(estates, function (c) { return !c.found; }); }
    else { cards = keepArr(estates, function (c) { return c.found; }); }
  } else if (panelId === 'lore') {
    cards = pickByField(loreCards, 'category', sub, '');
  } else if (panelId === 'settings') {
    cards = [];
  }

  /* 剧透开关：real_desc / truth 只在打开时给 DOM —— 关掉时数据层就不给，DOM 无从画错 */
  if (!showHidden) {
    for (i = 0; i < cards.length; i++) {
      if (cards[i].realDesc) { cards[i] = shallowCopy(cards[i], { realDesc: '' }); }
      if (cards[i].truth) { cards[i] = shallowCopy(cards[i], { truth: '' }); }
    }
    if (extra.mounts) {
      var mm = [];
      for (i = 0; i < extra.mounts.length; i++) { mm.push(shallowCopy(extra.mounts[i], { realDesc: '' })); }
      extra.mounts = mm;
    }
  }

  var filtered = applyFilter(cards, panelId, sub, fid);
  cards = filtered.cards; fid = filtered.filterId;

  return {
    tabs: panelTabsOf(s),
    tab: panelId,
    sub: sub,
    subs: subs,
    filterId: fid,
    filters: filters,
    groups: groups,
    cards: cards,
    wealth: extra.wealth || [],
    slots: extra.slots || [],
    mounts: extra.mounts || [],
    graph: extra.graph || null,
    listMode: (panelId === 'map_nodes' && sub === 'graph') ? shouldUseListWith(s, graph.areaCount, form) : false,
    emptyLines: cards.length ? [] : emptyLinesFor(panelId, sub, s)
  };
}

/* 内部小工具（不导出） */
function emptyPanel(panelId, why) {
  var lines = why === 'noSelf'
    ? ['还没有主角实体', '变量里需要一个 is_user 为 true 的角色']
    : emptyStateText({ isSample: false });
  return {
    tabs: panelTabsOf(defaultSettings()), tab: panelId, sub: null, subs: [],
    filterId: 'all', filters: [], groups: [], cards: [],
    wealth: [], slots: [], mounts: [], graph: null, listMode: false, emptyLines: lines
  };
}
function emptyLinesFor(panelId, sub, settings) {
  if (panelId === 'status' && sub === 'bag') { return [cpy('bagEmpty'), cpy('bagEmptyHint')]; }
  if (panelId === 'status' && sub === 'skill') { return [cpy('skillEmpty')]; }
  if (panelId === 'map_nodes') { return [cpy('mapEmpty'), cpy('mapEmptyHint')]; }
  return emptyStateText({ isSample: isSampleOn(settings) });
}
function indexOfStr(arr, v) { for (var i = 0; i < arr.length; i++) { if (arr[i] === v) { return i; } } return -1; }
function keepArr(arr, fn) { var out = [], i; for (i = 0; i < arr.length; i++) { if (fn(arr[i])) { out.push(arr[i]); } } return out; }
function pickByField(arr, field, value, dflt) {
  return keepArr(arr, function (c) { return String(c[field] || dflt) === value; });
}
function shallowCopy(o, add) {
  var out = {}, k;
  for (k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) { out[k] = o[k]; } }
  for (k in add) { if (Object.prototype.hasOwnProperty.call(add, k)) { out[k] = add[k]; } }
  return out;
}
/**
 * 归属判定：owner 可能是**角色 ID**（`char_player`）、可能是自然语言（"public" / "无主"），
 * 也可能是已经解析过的名字。所以：先按 ID 解析成名字，再跟主角的 ID / 名字比；
 * 另外认几种自然语言写法。
 * ⚠️ 不能只比字符串 —— 实测示例数据里就是 `owner: 'char_player'`，只比字符串会漏掉，
 * 结果"自有"子 tab 显示 1 而列表是空的。
 */
function isMineOwner(owner, stat, selfRef) {
  var raw = String(owner || '');
  if (!raw) { return false; }
  if (raw === '我' || raw === '自己' || raw === '主角' || raw === 'mine') { return true; }
  if (!selfRef) { return false; }
  if (raw === selfRef.id) { return true; }
  var name = resolveRef(raw, buildNameIndex(stat || {}));
  var selfName = String((selfRef.char && selfRef.char.name) || '');
  return !!selfName && name === selfName;
}
/** 技能页的卡片按节筛选；不筛就全给 */
function skillFilteredCards(char, groups, fid) {
  var all = skillCardsOf(char, false), out = [], i;
  if (!fid || fid === 'all') { return all; }
  for (i = 0; i < all.length; i++) { if (all[i].section === fid) { out.push(all[i]); } }
  return out;
}
/** 外交子 tab：把每个势力的外交关系摊成一张张卡 */
function factionDipCards(factions) {
  var out = [], i, j;
  for (i = 0; i < factions.length; i++) {
    var f = factions[i];
    for (j = 0; j < f.diplomacy.length; j++) {
      var d = f.diplomacy[j];
      out.push({
        id: f.id + '->' + d.toward, foldId: 'dip:' + f.id + ':' + d.toward, headless: false,
        kind: 'dip', icon: 'factions', name: f.name, toward: d.toward,
        relation: d.relation, trends: d.trends,
        summaryLine: d.toward + ' · ' + d.relation
      });
    }
  }
  return out;
}
