/* ============================================================
 * 🧰 工具箱 v1.0（压缩 / 网络搜索 / 其他功能）
 * 原压缩脚本 ID 与 KamiSummarize 接口保持兼容；下方 v1.x 为压缩功能历史。
 * 酒馆助手（TavernHelper / JS-Slash-Runner 4.9.5+）脚本
 * ------------------------------------------------------------
 * ⚠️ v1.3 起摘要请求会带 json_schema —— 这个参数要**酒馆助手 4.11** 才认
 *   （本机实测版本 4.11.0）。旧版会静默忽略它，此时靠 OUTPUT_CONTRACT 那段
 *   提示词约束输出格式，功能不受影响，只是少了服务端强制。
 * v1.3（2026-09-29，三个用户反馈的 bug）：
 *   · 摘要改走结构化输出（json_schema + 提示词契约双保险），解析器只认合法 JSON：
 *     供应商报错信息再也不会被当成压缩块写进世界书（旧版只要非空就收）。
 *     解析不过自动换边重试一次，仍不过就判该块失败 —— 不写盘、不隐藏、断点续跑。
 *     落盘前一定还原成人话（时间线/本块剧情/关键变化），世界书条目里不塞 JSON。
 *   · **块条目的正文是唯一真相**：面板读条目本身，不再读账本里的副本；
 *     保存时也不再回写正文 —— 你在世界书里手改的内容既不会被无视，也不会被覆盖。
 *     账本瘦身成 v3（只有结构：前沿 / 例外楼层 / 我们隐藏过哪些楼 / 待重做段 / 块档案）。
 *     世界书保存事件（worldinfo_updated）会触发面板自动对账，另有「刷新」按钮兜底。
 *   · **缺块会补**：账本里有档案、条目却没了的段记成「待重做」，
 *     下次大总结先重做这些段（连已隐藏楼层的原文一起读回来），再往前推进。
 *     账本也丢了的极端情况：面板报警 + 一颗按钮，由用户决定要不要重新纳入。
 *
 * v1.2：iOS 上面板打不开的修法（舞台高度下限 + 滚回原点 + 窄屏判定改读 body）。
 * v1.1（2026-09-21，并入主任务线）：摘要提示词支持多模板；四个控件类名迁到
 * 契约 §4.2 新登记的 `.kami-text` / `.kami-select` / `.kami-textarea`
 * （此前借用数字框的 `.kami-number`，被那条 `text-align:right` 带成了右对齐）。
 *
 * 长上下文压缩的中转面板。两个模式**并存**（可以同时开：
 * 默认不建议，只有「超长期玩同一个会话」才两个都开 —— 口径见引导「长文压缩」页），
 * 各管各的，互不依赖：
 *
 * ① 滚动压缩（管理酒馆正则，不自己压缩）
 *    面板里开关正则「压缩|摘要/设定」（id 0c74198f…，真相在 src/regex/list.json），
 *    并可调整它的起始深度（minDepth，默认 20）。写入走酒馆助手的正则接口
 *    （replaceTavernRegexes → 活设置 + saveSettingsDebounced），不碰预设文件。
 *    本脚本关闭后这条正则**照常工作**——它本来就独立于任何脚本。
 *
 * ② 超限压缩（大总结）
 *    平时不压缩。每次生成前只做「只读测量」：钩住宿主 fetch（照反截断的链式规矩，
 *    只读不改），数一次实际要发送的 token。估算值 = 头部开销（实测总tg -
 *    实测楼层和）+ 当前未隐藏楼层 + 新输入。达到上限（默认 400k）自动触发，
 *    也可以在面板里手动触发：
 *      · 圈定范围：上一压缩前沿 + 1 ～ 当前楼层 - 保留楼数（默认 20），
 *        已隐藏的与「例外楼层」跳过；
 *      · 按每块楼数（默认 20）切块，每块一次**独立摘要请求**
 *        （generateRaw 原始路径：不带预设、tool_choice:'none'——反截断认得
 *        这个标记会主动放手；原始路径不经过酒馆正则引擎，拿到的是楼层原文）；
 *      · 每个块的请求都带上**之前所有压缩块**与**例外楼层**的信息，接力连贯；
 *      · 全部成功的块才落盘：**一个块一个世界书条目**
 *          「📜 压缩块 #N｜楼层 X-Y」 常驻 · @D⚙ 按深度注入
 *            深度 = 块尾楼层之后的未隐藏楼层数 → 块锚定在自己最后一名"住户"
 *            的正后方；同深度时 order 取 1000000-起始楼号，先来的块排前面。
 *            深度只在例外楼层/保留楼数变化时需要重算（面板会自动同步），
 *            聊天照常增长不影响——深度按"距末尾"数，保留区大小不变它就不变。
 *          「📜 压缩状态（勿动）」 关闭 · JSON 账本（块档案/例外楼层/压缩前沿）
 *        聊天没有绑定世界书时自动创建并绑定。世界书由酒馆自己注入提示词，
 *        所以**切预设、刷新页面、甚至关掉本脚本，压缩块都在**；
 *      · 然后把已总结楼层标记隐藏（酒馆原生 is_hidden：不进提示词，
 *        界面上变半透明仍可读，消息菜单可手动解除）。
 *      · 中途失败：已成功的块照常落盘并隐藏，失败块连同后面的楼层原样保留，
 *        下次触发从断点继续。
 *
 * ③ 摘要条目状态卡
 *    显示「🧱 摘要(小总结)」条目（id 3fd5251a…）的开关，可手动开关
 *    （走 prompt_order + saveSettingsDebounced，与 🌟 预设设置同一条安全通道）。
 *    **任何模式下都不自动开关它**。说明文字向用户讲清楚：
 *    滚动压缩开着时应常开摘要条目——哪一楼没生成摘要，那一楼被压缩后就
 *    什么都不剩；只开超限压缩时则可关（大总结读的是楼层原文）。
 *
 * 面板骨架照抄 40-预设设置.js：.kami-* 契约类 + 手势共享模块 + 内联兜底皮肤，
 * 四套皮肤零改动。面板位置存脚本变量 kami-summarize。
 *
 * ⚠️ 组件类的**标准是预设设置面板**（40-预设设置.js），不是引导面板：
 *   · 开关卡 = button.kami-item.kami-card + .is-on + aria-pressed（40 第 1546 行）
 *   · 动作按钮 = kami-btn / kami-btn--ghost（40 第 1367 行的卡片头钮就是 ghost）
 *   · 预设设置面板**没有** --primary，accent 填充那是引导面板 footer 的语汇，别用
 *   · 数字框 input.kami-number、关闭 kami-icon-btn、注释标记 data-kami-note-mark 同源
 *
 * v1.0 变更（主任务审计单，2026-09-21）：
 *   · 面板控件一律吃契约类：字段行 = .kami-field 三件套（40 号第 1538-1545 行同款），
 *     开关卡 = span.kami-card-head > span.kami-item-main，按钮 = kami-btn--ghost。
 *     **99 处内联外观清零**，只剩契约认可的例外（舞台几何 / touchAction / 开合 display）；
 *     剩下少数「契约里没有登记类」的尺寸（宽控件撑满、多行文本框、小标签行、块正文换行）
 *     收进 LAYOUT_CSS 一段只写布局的注入样式（先例 = 50 号 GUIDE_CSS 排版层）。
 *   · 标题栏稳定两行且零对抗：副标题（世界书名）撤到「压缩块」区——它曾是爆行根源
 *     （flex 开 wrap 后按自然宽度断行），撤掉后 rain 的 order:3 匹配不到任何元素。
 *   · 开关态高亮改回吃皮肤（主任务已修好三套皮肤选择器缺的空格），删掉自注入的 HILITE_CSS。
 *   · 修：COPY.blocks.blockTag 漏定义（块标题渲染出 undefined）、例外楼层空值加出 #0、
 *     st.error 面板不可见（现渲染在压缩块区并指路清除）、清除按钮三种文案统一走 COPY、
 *     注销后流水线不再写盘/隐藏、两段确认定时器与指针捕获入注销、世界书写入串行化、
 *     楼层删除收拢落盘、数字框改值不再整片重画（焦点不丢）、提示词角色下拉带条目序号。
 *   · meta export_with.data 改 false：自定义接口的密钥不随预设导出。
 *
 * 已知边界（docs/大总结功能.md 有完整说明）：
 *    · 删除楼层会让已有压缩块的楼层号漂移（酒馆的删除事件不报被删序号）；
 *    · 脚本运行中不重入；注销不影响已写入的世界书条目、已隐藏的楼层与正则状态；
 *    · 触发上限按「实测发送 token」算，上限大于模型上下文时会在触发前先撑爆，
 *      请按模型调小（页脚常驻显示上次实测值）。
 *
 * 控制台：KamiSummarize.status() / .inspect() / .runOnce() / .shutdown()
 * 本脚本不使用任何斜杠命令，一切功能都依赖酒馆助手接口。
 * ============================================================ */
(function () {
  'use strict';
  /* @@KAMI_UI@@ */

  var VERSION = '1.0';
  var HUB_NAME = '🧰 工具箱';
  /* 按钮条排布（2026-09-21 用户裁定）：引导(10) → 皮肤(20) → 预设(30) → 压缩(40) → 反截断(50) */
  var HUB_ORDER = 40;
  var PANEL_ID = 'kami-compress-panel';
  var CSS_ID = 'kami-compress-css';   // 兜底皮肤 + 本面板布局（LAYOUT_CSS）装在同一个 style 里
  var API_NAME = 'KamiSummarize';
  var VARS_KEY = 'kami-summarize';
  var CHAR_ID = 100001;          // 酒馆 prompt_order 主键（与 40-预设设置.js 一致）
  var Z = 30000;
  var PANEL_W = 420, PANEL_H = 560, PANEL_MIN_W = 300, PANEL_MIN_H = 240;
  var STATUS_ROLE = 'status';

  /* ── 对象标识（真相在 src/regex/list.json 与 src/preset.base.json） ── */
  var ROLL_ID = '0c74198f-1acc-43e3-8d88-d776d7242b89';   // 压缩|摘要/设定(默认最小深度20)
  var ROLL_NAME = '压缩|摘要/设定';
  var SUMMARY_ID = '3fd5251a-b51b-4fc2-a4a8-fbb955faa527'; // 🧱 摘要(小总结)
  var LB_BLOCK_PREFIX = '📜 压缩块 #';
  var LB_STATE = '📜 压缩状态（勿动）';

  var DEF_THRESHOLD = 400000;
  var DEF_KEEP = 20;
  var DEF_CHUNK = 20;
  var MAX_FLOOR_CHARS = 12000;   // 单楼进入摘要请求的上限（超长截断，防撑爆摘要上下文）
  var MAX_PIN_CHARS = 4000;      // 例外楼层进入摘要请求的上限
  var MAX_PROMPT_ENTRIES = 6;    // 头/尾各自最多几个条目

  /* ── 默认任务提示词（「恢复默认」回到这里） ── */
  var DEFAULT_TASK = [
    '<compress_task>',
    '# 任务：撰写剧情压缩块',
    '',
    '你是一部正在连载的长篇互动故事的剧情记录员。你会按顺序收到三份材料：',
    '1.【历史压缩块】更早剧情的既有提要，按时间排列；',
    '2.【例外楼层】被要求完整保留的楼层原文，只用来理解上下文，不要复述它们；',
    '3.【本块楼层】本次要总结的楼层原文，包含玩家楼层与角色楼层。',
    '',
    '请通读本块楼层，对照历史压缩块，写出**本块**的剧情提要。',
    '',
    '## 输出格式（严格遵守）',
    '只输出一个 JSON 对象，不要解释、开场白或代码块标记：',
    '{"timeline":"…","plot":"…","changes":["…"]}',
    '· timeline：本块覆盖的时间跨度与场景转移，一到两句；',
    '· plot：本块的剧情提要，第三人称叙述，300 到 600 字，须覆盖核心事件及其因果、',
    '  人物关系与情绪的变化、重要对话得出的结论、地点与物品的转移；',
    '· changes：关键变化逐条，0 到 8 条：人物状态与关系、物品地点与时间线的推进、',
    '  尚未解决、后续必须回收的伏笔。',
    '',
    '## 写作规则',
    '- 与历史压缩块自然衔接：已写过的信息不重复，只写增量与变化；',
    '- 对话概括为转述，但约定、承诺、威胁、转折这类关键台词必须保留原意；',
    '- 人名、称谓、专有名词沿用原文写法，不要改译或简写；',
    '- 楼层里的 XML 标签（<summary>、<options> 等）是格式残留，一律忽略；',
    '- 状态要具体：伤势、持有物、金钱、时间点宁可写细，不要含糊带过；',
    '- 本块结尾悬而未决的情节点，必须在 changes 里单列一条；',
    '- JSON 的字符串里不要出现 markdown 语法（列表、加粗、标题都不要）。',
    '</compress_task>'
  ].join('\n');

  /* 结构化输出的**运行时契约**：不管用户把「任务正文」改成什么样子，
     这一段都会作为最后一条消息附在请求末尾。必要性：老用户的自定义提示词
     与模板存在脚本变量里，它们不懂 JSON，光靠默认任务正文救不了 ——
     少了它，这些人的摘要会永远卡在「返回内容不是合法 JSON」。
     格式只此一处权威（默认任务正文里那份是给人看的副本）。 */
  var OUTPUT_CONTRACT = [
    '<output_format>',
    '最后一步：把上面的结果整理成**一个 JSON 对象**输出，不要输出任何其它内容。',
    '',
    '{"timeline":"…","plot":"…","changes":["…","…"]}',
    '',
    '· timeline：字符串。本块覆盖的时间跨度与场景转移，一到两句。',
    '· plot：字符串。本块的剧情提要，第三人称叙述，300 到 600 字。',
    '· changes：字符串数组。关键变化逐条写，0 到 8 条，每条一句话，不要挤成一大段。',
    '',
    '若无法完成总结，同样必须返回此结构的 JSON，并将 plot 替换为实际说明。',
    '只输出这一个 JSON 对象：不要解释、不要开场白、不要代码块标记，也不要 markdown 语法。',
    '</output_format>'
  ].join('\n');

  /* ── 面板文案（唯一出处；改文案只动这张表） ──
     {x} {n} {a} {b} {c} {err} {lb} 是占位符，润色时必须原样保留。 */
  var COPY = {
    "hubTip": "压缩、网络搜索与其他功能（点击展开工具箱）",
    "hubAbsent": "工具箱脚本未就绪",
    "mode": {
      "section": "压缩模式",
      "rollTitle": "滚动压缩",
      "rollDepthLine": "超过 {n} 楼只发摘要",
      "rollNote": "把较早的旧楼层替换为单楼摘要。只在超长期会话里才建议与超限压缩同时开。",
      "grandTitle": "超限压缩（大总结）",
      "grandNote": "平时发送完整楼层。发送量达到上限后自动把旧楼层总结成压缩块并隐藏。",
      "on": "开启",
      "off": "关闭",
      "bad": "不可用"
    },
    "roll": {
      "section": "滚动压缩参数",
      "depthLabel": "起始深度",
      "depthHint": "距最新楼层超过此数值时只发摘要。填 0 表示从第 1 楼起全部压缩。"
    },
    "grand": {
      "section": "超限压缩参数",
      "thresholdLabel": "触发上限",
      "thresholdHint": "总发送量达到此 token 上限时自动触发大总结。建议小于模型的上下文窗口。",
      "keepLabel": "保留最新楼数",
      "keepHint": "最新的这部分楼层永远发送完整原文，不参与大总结与隐藏。",
      "chunkLabel": "每块楼数",
      "chunkHint": "每次把设定数量的旧楼层总结为 1 个压缩块，各块生成后不再合并。",
      "runNow": "立即大总结",
      "running": "总结中",
      "unhideAll": "全部取消隐藏",
      "clearData": "清除压缩数据",
      "clearArmed": "再点一次确认",
      "runHint": "手动触发不受开关限制。若中途失败会停在失败处，下次从断点继续。"
    },
    "model": {
      "section": "大总结模型",
      "tavern": "跟随酒馆",
      "custom": "自定义接口",
      "note": "选择大总结使用的 AI 接口。跟随酒馆使用当前连接，自定义接口可保存多套独立配置。",
      "cfgLabel": "已存配置",
      "noCfgName": "（未命名配置）",
      "sourceLabel": "接口格式",
      "apiUrlLabel": "接口地址",
      "keyLabel": "密钥",
      "modelLabel": "模型名",
      "sources": [
        {
          "v": "custom",
          "n": "OpenAI 兼容（自定义）"
        },
        {
          "v": "openai",
          "n": "OpenAI"
        },
        {
          "v": "claude",
          "n": "Claude"
        },
        {
          "v": "makersuite",
          "n": "Gemini（Google AI Studio）"
        },
        {
          "v": "deepseek",
          "n": "DeepSeek"
        },
        {
          "v": "xai",
          "n": "xAI"
        },
        {
          "v": "openrouter",
          "n": "OpenRouter"
        },
        {
          "v": "azure_openai",
          "n": "Azure OpenAI"
        }
      ],
      "sourceHint": "接口格式须与接口地址匹配。例如选 Claude 格式时，地址必须支持 Anthropic 协议。",
      "apiUrlHint": "自定义格式请填写完整请求地址。其他格式一般填反代地址，留空则使用官方地址。",
      "keyHint": "密钥仅保存在当前浏览器本地，不会写入聊天记录或世界书。",
      "modelHint": "可直接填写模型名称，也可点击下方按钮在线获取模型列表。",
      "fetchModels": "获取模型列表",
      "fetching": "获取中…",
      "fetchFail": "获取模型列表失败：{err}",
      "fetchEmpty": "接口未返回任何可用模型",
      "fetchPick": "（请选择模型）",
      "pickModelLabel": "选择模型",
      "pickLabel": "连接配置",
      "pickCurrent": "当前连接",
      "pickMissing": "连接配置「{name}」已不存在，本次自动使用当前连接",
      "pickNone": "酒馆中没有已保存的对话补全连接配置",
      "pickHint": "可直接选用酒馆已保存的连接配置，无需重复填写接口参数。",
      "pickProxyNote": "使用酒馆代理的配置可能无法读取其内置密钥。若总结失败，请切换至自定义接口手动填写密钥。",
      "saveAs": "存为新配置",
      "namePh": "配置名称",
      "nameMissing": "请先输入配置名称",
      "saveDone": "已保存配置「{name}」",
      "delBtn": "删除当前配置",
      "delDone": "已删除配置「{name}」",
      "delLast": "至少保留一套配置",
      "customHint": "地址、密钥与模型名均填写完整后生效。若有缺失将自动回退为跟随酒馆。"
    },
    "prompts": {
      "section": "摘要提示词",
      "head": "头部提示词（可选）",
      "task": "任务正文（后接剧情材料）",
      "tail": "尾部提示词（可选）",
      "addEntry": "添加一条",
      "removeEntry": "删除",
      "reset": "恢复默认",
      "roleLabel": "角色",
      "hint": "头尾可自由增删角色与内容条目，任务区用于调整总结规则。改动即时生效。",
      "roleSystem": "系统",
      "roleUser": "用户",
      "roleChar": "角色",
      "tplLabel": "提示词模板",
      "tplNamePh": "模板名称",
      "tplSaveAs": "存为新模板",
      "tplDel": "删除当前模板",
      "tplDelLast": "至少保留一套模板",
      "tplSaved": "已保存模板「{name}」",
      "tplDeleted": "已删除模板「{name}」",
      "tplNameMissing": "请先输入模板名称",
      "tplHint": "切换模板会替换提示词内容与结构，保存后可随时切换不同总结风格。",
      "tplDefaultName": "默认"
    },
    "pins": {
      "section": "例外楼层（不参与压缩）",
      "empty": "暂无例外楼层",
      "ph": "楼层号",
      "add": "添加",
      "remove": "移除",
      "chipTitle": "点击移除",
      "note": "例外楼层始终保留原文显示且不被隐藏。每次生成压缩块时，模型都会参考这些楼层的完整原文。"
    },
    "blocks": {
      "section": "压缩块",
      "blockTag": "块",
      "empty": "暂无压缩块。开启超限压缩达到上限后会自动生成，也可点击顶部的「立即大总结」手动生成。",
      "depthTag": "注入深度",
      "note": "每个压缩块对应一个世界书条目（📜 压缩块 #N），按位置锚定在楼层后注入。数据保存在当前绑定的世界书「{lb}」中，更换预设不会丢失。条目正文支持手动修改，改完点「刷新」即可同步。",
      "lbNone": "（当前聊天未绑定世界书）",
      "errHint": "压缩数据读取异常：{err}",
      "errFix": "可点击顶部「清除压缩数据」重置当前聊天的压缩记录。已被隐藏的楼层不会受影响。",
      "pendingTag": "待重新生成",
      "pendingNote": "有 {n} 个楼层的压缩块条目缺失或被清空。下次大总结会自动重新总结并补回。",
      "orphanNote": "检测到 {n} 个已隐藏楼层没有压缩块。手动隐藏的楼层无需处理；若因条目误删导致，可点下方按钮重新总结。",
      "orphanBtn": "重新纳入大总结",
      "dupNote": "发现 {n} 组楼层范围重复的压缩块，目前仅生效其中一块。建议在世界书里删掉多余条目。",
      "suspectNote": "有 {n} 个压缩块的内容疑似接口报错，已在下方标出。在世界书里删掉对应条目后重新大总结即可。",
      "suspectTag": "疑似失败内容",
      "refresh": "刷新",
      "refreshTip": "重新读取世界书，同步手动修改的内容"
    },
    "entry": {
      "section": "「🧱 摘要(小总结)」条目",
      "turnOn": "开启条目",
      "turnOff": "关闭条目",
      "note": "使用滚动压缩时建议常开此条目，避免旧楼层因缺少单楼摘要而丢失剧情。仅使用超限压缩时可关闭。本面板不会自动改变此条目的开关状态。"
    },
    "toasts": {
      "running": "大总结正在进行中，请等待当前任务完成",
      "noChat": "当前没有打开的聊天",
      "start": "大总结开始（{x}）",
      "startAuto": "达到上限自动触发",
      "startManual": "手动触发",
      "nothing": "没有需要压缩的楼层（当前已保留最新 {n} 楼）",
      "onlyPins": "范围内无待压缩楼层（前沿已推进至第 {n} 楼）",
      "partial": "大总结未全部完成：{err}",
      "partialTail": "。已完成的 {n} 个压缩块照常生效。",
      "done": "大总结完成：新增 {a} 个压缩块，隐藏 {b} 楼（当前共 {c} 块）",
      "repairFail": "补回楼层 {range} 的压缩块失败：{err}",
      "repairQueued": "已将 {n} 个隐藏楼层重新加入大总结，下次触发时会自动补回压缩块",
      "refreshed": "已重新读取世界书",
      "schemaBad": "模型未按要求格式作答（{why}）。本块未写入，楼层完整保留，可稍后重试。返回内容：{head}",
      "schemaWhy": {
        "empty": "返回内容为空",
        "errorText": "接口返回错误信息",
        "noJson": "未按要求格式输出",
        "badJson": "输出被打断，格式不完整",
        "errorJson": "接口返回错误数据",
        "noFields": "缺少剧情提要正文"
      },
      "noHidden": "当前聊天没有被隐藏的楼层",
      "noOrphan": "没有需要重新纳入的隐藏楼层",
      "unhideDone": "已恢复 {n} 个楼层的显示（压缩数据保持原样）",
      "noLorebook": "当前聊天未绑定世界书，且没有压缩数据",
      "clearFail": "删除世界书条目失败：{err}",
      "clearDone": "已清除当前聊天的压缩数据（共 {n} 个条目，已隐藏楼层保持原样，可点击「全部取消隐藏」恢复显示）",
      "pinRange": "楼层号必须在 0 到 {n} 之间",
      "pinMissing": "例外楼层中不存在 #{n} 楼",
      "pinDup": "#{n} 楼已在例外楼层中",
      "pinSaveFail": "写入世界书失败：{err}",
      "pinAdded": "已添加例外楼层 #{n} 楼",
      "pinRemoved": "已移除例外楼层 #{n} 楼",
      "grandOn": "超限压缩已开启：发送量达到 {n} token 时自动触发大总结",
      "numBad": "请填写有效数字",
      "writeFail": "写入失败：{err}",
      "toggleFail": "切换失败：{err}",
      "noSummaryEntry": "当前预设中未找到「🧱 摘要(小总结)」条目",
      "noRollRegex": "当前预设中未找到滚动压缩正则「{name}」",
      "noGenerate": "酒馆助手缺少 generateRaw 接口（请检查酒馆助手版本）",
      "emptyReply": "模型返回内容为空",
      "tooMany": "头部与尾部最多各添加 {n} 条",
      "saveFail": "保存失败：{err}"
    }
  };
  /* ── 面板文案到这里为止 ── */

  /* 面板手势共享模块（构建期内联，两块面板共用同一份） */
  /* @@KAMI_PANEL_GESTURES@@ */
  /* @@KAMI_TOOLBOX_TABS@@ */
  /* @@KAMI_SEARCH_PROVIDERS@@ */
  /* @@KAMI_SEARCH_PURE@@ */
  /* @@KAMI_SEARCH_TASK_DEF@@ */
  /* @@KAMI_SEARCH_TASK@@ */
  /* @@KAMI_RESPONSE_PIPELINE@@ */
  /* @@KAMI_RESPONSE_TRANSPORT@@ */
  /* @@KAMI_SEARCH_NATIVE_PROBE@@ */
  /* @@KAMI_USER_SCOPE@@ */
  /* @@KAMI_SEARCH_SERVICE@@ */
  /* @@KAMI_LLM_UI@@ */
  /* @@KAMI_LLM_SETTINGS@@ */
  /* @@KAMI_SEARCH_MANUAL_UI@@ */

  /* 压缩纯逻辑（摘要响应解析器 + 世界书对账器；构建期内联，离线单测直接读那份源码） */
  /* @@KAMI_SUMMARIZE_PURE@@ */

  /* 兜底皮肤（唯一真相：src/skin/base.css，构建期内联成字符串常量） */
  /* @@KAMI_BASE_CSS_JS@@ */

  /* ───────── 宿主窗口 ───────── */

  function looksLikeTavern(w) {
    try {
      var d = w.document;
      if (!d) { return false; }
      if (d.getElementById('send_textarea')) { return true; }
      if (d.querySelector('#chat')) { return true; }
      if (d.querySelector('.mes_text')) { return true; }
      if (d.querySelector('#sheld')) { return true; }
    } catch (e) { }
    return false;
  }

  var HOST = (function () {
    var c = [window], i, w;
    try { if (window.parent && window.parent !== window) { c.push(window.parent); } } catch (e) { }
    try { if (window.top && window.top !== window && window.top !== window.parent) { c.push(window.top); } } catch (e) { }
    for (i = 0; i < c.length; i++) { if (looksLikeTavern(c[i])) { return c[i]; } }
    for (i = 0; i < c.length; i++) {
      w = c[i];
      try { if (w && w.document && w.document.documentElement) { return w; } } catch (e) { }
    }
    return window;
  })();
  var HDOC = null;
  try { HDOC = HOST.document; } catch (e) { HDOC = document; }

  function log(msg) {
    try { if (window.console && console.log) { console.log('[压缩] ' + msg); } } catch (e) { }
  }
  function toast(kind, msg, title) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, title || '📜 压缩'); }
    } catch (e) { }
    log('TOAST(' + kind + ') ' + msg);
  }
  function msgOf(e) { return (e && e.message) ? e.message : String(e); }

  /* ───────── 酒馆设置读取（照抄 40-预设设置.js 的通道） ───────── */

  function stCtx() {
    var cands = [], i;
    function push(o) { try { if (o && cands.indexOf(o) < 0) { cands.push(o); } } catch (e) { } }
    try { push(window.SillyTavern); } catch (e) { }
    try { push(HOST && HOST.SillyTavern); } catch (e) { }
    try { if (window.parent && window.parent !== window) { push(window.parent.SillyTavern); } } catch (e) { }
    try { if (window.top && window.top !== window) { push(window.top.SillyTavern); } } catch (e) { }
    for (i = 0; i < cands.length; i++) {
      try { if (typeof cands[i].getContext === 'function') { return cands[i].getContext(); } } catch (e) { }
    }
    return null;
  }
  function settingsOf(ctx) {
    if (!ctx) { return null; }
    try { if (ctx.chatCompletionSettings) { return ctx.chatCompletionSettings; } } catch (e) { }
    try { if (HOST && HOST.oai_settings) { return HOST.oai_settings; } } catch (e) { }
    return null;
  }
  function pickOrder(s) {
    var list = (s && s.prompt_order) ? s.prompt_order : [], i, best = null;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].character_id === CHAR_ID && list[i].order && list[i].order.length) { return list[i]; }
    }
    for (i = 0; i < list.length; i++) {
      if (!list[i] || !list[i].order || !list[i].order.length) { continue; }
      if (!best || list[i].order.length > best.order.length) { best = list[i]; }
    }
    return best;
  }
  function readRaw() {
    var ctx = stCtx();
    if (!ctx) { return { ok: false, error: '拿不到酒馆设置：SillyTavern.getContext 不可用' }; }
    var s = settingsOf(ctx);
    if (!s) { return { ok: false, error: '酒馆设置里没有 chatCompletionSettings' }; }
    var pm = pickOrder(s);
    if (!pm) { return { ok: false, error: '当前预设的 prompt_order 是空的', ctx: ctx, settings: s }; }
    return { ok: true, error: null, ctx: ctx, settings: s, order: pm };
  }
  function notifyPresetChanged(ctx) {
    var es = null, name = null, i, cands = [ctx, HOST];
    for (i = 0; i < cands.length; i++) {
      if (!cands[i]) { continue; }
      if (!es) { es = cands[i].eventSource || null; }
      if (!name && cands[i].eventTypes) { name = cands[i].eventTypes.OAI_PRESET_CHANGED_AFTER || null; }
    }
    if (!es || typeof es.emit !== 'function' || !name) { return false; }
    try { es.emit(name); return true; } catch (e) { return false; }
  }
  function chatLen() {
    try { var ctx = stCtx(); if (ctx && ctx.chat && typeof ctx.chat.length === 'number') { return ctx.chat.length; } } catch (e) { }
    try { if (typeof chat !== 'undefined' && chat && chat.length) { return chat.length; } } catch (e) { }
    return 0;
  }

  /* ───────── 状态 ───────── */

  var disposed = false;
  var panelRoot = null, panelDrop = null, panelHead = null, bodyEl = null;
  var GESTURES = null;
  var geom = { x: null, y: null, w: null, h: null };
  var cfg = {
    grandOn: false, threshold: DEF_THRESHOLD, keep: DEF_KEEP, chunk: DEF_CHUNK,
    sumModel: { mode: 'tavern', current: '', tavernPick: '' },   // tavernPick: '' = 当前连接，否则是酒馆连接配置名
    sumConfigs: [],   // [{name, source, apiurl, key, model}]
    prompts: { head: [], taskRole: 'system', task: DEFAULT_TASK, tail: [] },
    /* 摘要提示词模板（v1.1 起）：prompts 是**当前正在编辑的那一套**，promptTpls 是
       若干份快照，promptTplCurrent 指向其中一份。编辑 prompts 时同步写回当前模板
       （见 syncCurrentTpl），所以切走再切回来不会丢改动。 */
    promptTpls: [],   // [{name, head, taskRole, task, tail}]
    promptTplCurrent: ''
  };
  var compressLlmEditor = createKamiLlmSettingsController({state:cfg,copy:COPY,defaultTask:DEFAULT_TASK,save:saveVars,render:renderContent,toast:toast,invalidate:invalidateModelList});
  function clonePromptList(list){ return compressLlmEditor.cloneList(list); }
  function snapPrompts(){ return compressLlmEditor.snapshot(); }
  function findTpl(name) { return cfg.promptTpls.find(function(row){return row.name===name;}) || null; }
  function currentTpl(){ return compressLlmEditor.currentTemplate(); }
  function syncCurrentTpl(){ return compressLlmEditor.syncCurrent(); }
  function currentSumConfig(){ return compressLlmEditor.currentConfig(); }
  var pingTimer = null, saveTimer = null, resizeHandler = null, hideHandler = null;
  var armTimer = null;        // 两段式确认的 4 秒定时器（注销时清）
  var panelDrag = null;       // 面板拖动/缩放进行中的状态（注销时释放指针捕获用）
  var ownDef = null, unsubs = [];
  var regexWrites = 0, entryWrites = 0;
  var lastError = null;

  /* 超限压缩进行中（面板标签与页脚都会显示进度） */
  var pipeline = { running: false, done: 0, total: 0 };
  var chatEpoch = 0, stateLoadSeq = 0, stateReadPromise = null;
  function chatStamp() {
    var ctx = stCtx() || {}, lb = null;
    try { lb = getChatLorebook() || null; } catch (e) { }
    return { epoch: chatEpoch, chat: ctx.chat, id: JSON.stringify([ctx.characterId, ctx.groupId, ctx.chatId]), lb: lb };
  }
  function sameChat(stamp) {
    if (disposed || !stamp || stamp.epoch !== chatEpoch) { return false; }
    var now = chatStamp();
    return stamp.chat === now.chat && stamp.id === now.id && (!stamp.lb || stamp.lb === now.lb);
  }
  function requireChat(stamp) {
    if (sameChat(stamp)) { return; }
    var err = new Error('聊天已切换或脚本已关闭，本次操作已取消');
    err.chatCancelled = true;
    throw err;
  }
  function publishChatState(value, stamp, seq) {
    requireChat(stamp);
    if (seq !== stateLoadSeq) { return stateReadPromise; }
    st = value;
    return value;
  }

  /* 本聊天的压缩状态（真相在聊天世界书条目里，这里是它的内存映像）。
     v1.3 起「块条目的正文」是唯一真相：
       · 面板显示的、请求带上的、注入提示词的都是**块条目自己**的内容 ——
         你在世界书里改正文，面板立刻跟着变，脚本再也不回写覆盖你改的东西；
       · 账本（📜 压缩状态（勿动））只记结构：前沿 / 例外楼层 / 我们隐藏过哪些楼 / 块的档案；
       · 账本里有档案、条目却没了（你删了或清空了正文）= 你要求这段重来 →
         记进 pending，下次大总结重新总结这些楼层。 */
  var st = freshState();
  function freshState() {
    return {
      v: 3, lbName: null, stateUid: null,
      blocks: [],          // 活着的块 {from,to,at,uid,depth,text}（text 来自块条目）
      pending: [],         // 待重做段 {from,to}（条目没了/正文空了，等着重新总结）
      pins: [], covered: -1, hiddenByUs: [], updatedAt: null,
      adopted: false, error: null, notice: [], suspect: [], orphan: [], dup: []
    };
  }

  /* 实测（会话内记忆，不持久化）：钩子里每次生成后更新 */
  var measure = { installed: false, native: null, host: null, last: null };
  var floorTokCache = {};
  var tokenCounter = null;   // { kind: 'async'|'sync'|'est', fn }
  /* 结构化输出上次是哪条路走通的：'on' = json_schema 通过，'off' = 只剩提示词约束。
     每次摘要先试走通的那条，失败自动换边再试（见 summarizeChunk）。 */
  var schemaMode = 'on';

  /* ───────── 脚本变量（面板几何 + 超限压缩参数） ───────── */

  function readVars() {
    var saved = null;
    try {
      if (typeof getVariables === 'function') {
        var all = getVariables({ type: 'script' });
        saved = all && all[VARS_KEY];
      }
    } catch (e) { log('读脚本变量失败：' + msgOf(e)); }
    if (!saved || typeof saved !== 'object') { return; }
    if (saved.panel && typeof saved.panel === 'object') {
      if (typeof saved.panel.x === 'number') { geom.x = saved.panel.x; }
      if (typeof saved.panel.y === 'number') { geom.y = saved.panel.y; }
      if (typeof saved.panel.w === 'number') { geom.w = saved.panel.w; }
      if (typeof saved.panel.h === 'number') { geom.h = saved.panel.h; }
    }
    if (saved.cfg && typeof saved.cfg === 'object') {
      if (typeof saved.cfg.grandOn === 'boolean') { cfg.grandOn = saved.cfg.grandOn; }
      if (typeof saved.cfg.threshold === 'number' && saved.cfg.threshold >= 1000) { cfg.threshold = saved.cfg.threshold; }
      if (typeof saved.cfg.keep === 'number' && saved.cfg.keep >= 1) { cfg.keep = Math.floor(saved.cfg.keep); }
      if (typeof saved.cfg.chunk === 'number' && saved.cfg.chunk >= 1) { cfg.chunk = Math.floor(saved.cfg.chunk); }
      /* 大总结模型（跟随酒馆 / 自定义多配置）。
         v0.3 旧形状（sumModel 带 apiurl/key/model 单套）迁移成一条已存配置。 */
      if (Array.isArray(saved.cfg.sumConfigs)) {
        cfg.sumConfigs.length = 0;
        for (var sc = 0; sc < saved.cfg.sumConfigs.length; sc++) {
          var c0 = saved.cfg.sumConfigs[sc];
          if (c0 && typeof c0.name === 'string' && c0.name) {
            cfg.sumConfigs.push({
              name: c0.name,
              source: (typeof c0.source === 'string' && c0.source) ? c0.source : 'custom',
              apiurl: (typeof c0.apiurl === 'string') ? c0.apiurl : '',
              key: (typeof c0.key === 'string') ? c0.key : '',
              model: (typeof c0.model === 'string') ? c0.model : ''
            });
          }
        }
      }
      if (saved.cfg.sumModel && typeof saved.cfg.sumModel === 'object') {
        var sm = saved.cfg.sumModel;
        if (sm.mode === 'tavern' || sm.mode === 'custom') { cfg.sumModel.mode = sm.mode; }
        if (typeof sm.current === 'string') { cfg.sumModel.current = sm.current; }
        if (typeof sm.tavernPick === 'string') { cfg.sumModel.tavernPick = sm.tavernPick; }
        /* v0.3 → v0.4 迁移：旧的单套自定义配置转成一条已存配置 */
        if (!cfg.sumConfigs.length && (sm.apiurl || sm.key || sm.model)) {
          cfg.sumConfigs.push({ name: '默认', source: 'custom', apiurl: sm.apiurl || '', key: sm.key || '', model: sm.model || '' });
          cfg.sumModel.current = '默认';
        }
      }
      /* 摘要提示词（头/任务/尾） */
      if (saved.cfg.prompts && typeof saved.cfg.prompts === 'object') {
        var pp = saved.cfg.prompts;
        function adoptList(src, dst) {
          if (!Array.isArray(src)) { return; }
          dst.length = 0;
          for (var q = 0; q < src.length && q < MAX_PROMPT_ENTRIES; q++) {
            var it = src[q];
            if (it && typeof it.content === 'string' && ['system', 'user', 'assistant'].indexOf(it.role) >= 0) {
              dst.push({ role: it.role, content: it.content });
            }
          }
        }
        adoptList(pp.head, cfg.prompts.head);
        adoptList(pp.tail, cfg.prompts.tail);
        if (typeof pp.task === 'string') { cfg.prompts.task = pp.task; }
        if (['system', 'user', 'assistant'].indexOf(pp.taskRole) >= 0) { cfg.prompts.taskRole = pp.taskRole; }
      }
      /* 摘要提示词模板（v1.1 新增）。
         迁移：老用户只存了一套 prompts —— 把刚 adopt 出来的这一套原样包成第一条模板，
         数据一点不丢；从没改过提示词的用户也有一条可用的「默认」。
         存盘时 prompts 与 promptTpls **都写**：旧版本脚本回退时仍然读得到那一套。 */
      if (Array.isArray(saved.cfg.promptTpls)) {
        cfg.promptTpls.length = 0;
        var adoptTplList = function (src, dst) {
          if (!Array.isArray(src)) { return; }
          for (var q2 = 0; q2 < src.length && q2 < MAX_PROMPT_ENTRIES; q2++) {
            var it2 = src[q2];
            if (it2 && typeof it2.content === 'string' && ['system', 'user', 'assistant'].indexOf(it2.role) >= 0) {
              dst.push({ role: it2.role, content: it2.content });
            }
          }
        };
        for (var tp = 0; tp < saved.cfg.promptTpls.length; tp++) {
          var t0 = saved.cfg.promptTpls[tp];
          if (!t0 || typeof t0.name !== 'string' || !t0.name) { continue; }
          var one = { name: t0.name, head: [], taskRole: 'system', task: DEFAULT_TASK, tail: [] };
          adoptTplList(t0.head, one.head);
          adoptTplList(t0.tail, one.tail);
          if (typeof t0.task === 'string') { one.task = t0.task; }
          if (['system', 'user', 'assistant'].indexOf(t0.taskRole) >= 0) { one.taskRole = t0.taskRole; }
          cfg.promptTpls.push(one);
        }
      }
      if (typeof saved.cfg.promptTplCurrent === 'string') { cfg.promptTplCurrent = saved.cfg.promptTplCurrent; }
      if (!cfg.promptTpls.length) {
        var first = snapPrompts();
        first.name = COPY.prompts.tplDefaultName;
        cfg.promptTpls.push(first);
      }
      if (!currentTpl()) { cfg.promptTplCurrent = cfg.promptTpls[0].name; }
    }
    if (saved && ['compress', 'search', 'other'].indexOf(saved.toolboxTab) >= 0) { toolboxTab = saved.toolboxTab; }
  }
  function saveVars() {
    if (saveTimer) { try { clearTimeout(saveTimer); } catch (e) { } }
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (disposed) { return; }
      try {
        if (typeof replaceVariables !== 'function') { return; }
        var all = (typeof getVariables === 'function') ? (getVariables({ type: 'script' }) || {}) : {};
        all[VARS_KEY] = {
          toolboxTab: toolboxTab,
          panel: { x: geom.x, y: geom.y, w: geom.w, h: geom.h },
          cfg: {
            grandOn: cfg.grandOn, threshold: cfg.threshold, keep: cfg.keep, chunk: cfg.chunk,
            sumModel: { mode: cfg.sumModel.mode, current: cfg.sumModel.current, tavernPick: cfg.sumModel.tavernPick },
            sumConfigs: cfg.sumConfigs,
            prompts: { head: cfg.prompts.head, taskRole: cfg.prompts.taskRole, task: cfg.prompts.task, tail: cfg.prompts.tail },
            promptTpls: cfg.promptTpls,
            promptTplCurrent: cfg.promptTplCurrent
          }
        };
        replaceVariables(all, { type: 'script' });
      } catch (e) { log('写脚本变量失败：' + msgOf(e)); }
    }, 250);
  }

  /* ───────── 聊天压缩状态（聊天世界书） ─────────
     「📜 压缩块 #N」若干条（一块一条，给模型读）+「📜 压缩状态（勿动）」一条
     （JSON 账本，给脚本查，关闭状态永不进提示词）。

     ⚠️ 读写刻意走**酒馆原生**的 loadWorldInfo / saveWorldInfo
     （SillyTavern.getContext() 暴露），不走酒馆助手的 getLorebookEntries /
     replaceLorebookEntries：后者把条目按自己的字段表重映射后**整文件写回**
     （lorebook_entry.ts 的 toLorebookEntry / fromPartialLorebookEntry），
     酒馆原生条目里不在表上的字段（ignoreBudget、matchPersonaDescription 等）
     会被悄悄抹掉——包括聊天世界书里用户自己的条目。原生读写没有这个问题，
     还能给块条目设 ignoreBudget=true，免得块被世界书预算截断丢弃
     （world-info.js：预算到顶后 !entry.ignoreBudget 的条目一律跳过）。 */

  function hasNativeLorebook() {
    var ctx = stCtx();
    return !!(ctx && typeof ctx.loadWorldInfo === 'function' && typeof ctx.saveWorldInfo === 'function' &&
      typeof getChatLorebook === 'function');
  }
  async function ensureChatLorebook(stamp) {
    requireChat(stamp);
    var lb = getChatLorebook();
    if (lb) { stamp.lb = lb; return lb; }
    if (typeof createLorebook !== 'function' || typeof setChatLorebook !== 'function') {
      throw new Error('缺少安全创建聊天世界书的接口，请更新酒馆助手或先手动绑定聊天世界书');
    }
    /* 不能用 getOrCreateChatLorebook：其内部创建后会绑定届时的当前聊天。
       创建和绑定拆开，异步创建完成后先核验聊天；唯一名字避免覆盖已有世界书。 */
    var name = 'Chat_Book_Kami_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    if (!await createLorebook(name)) { throw new Error('创建聊天世界书失败'); }
    requireChat(stamp);
    lb = getChatLorebook();
    if (!lb) {
      /* setChatLorebook 在调用时同步绑定，随后才异步保存元数据。 */
      await setChatLorebook(name);
      requireChat(stamp);
      lb = getChatLorebook();
      if (lb !== name) { throw new Error('聊天世界书绑定已变化，本次写入已取消'); }
    }
    stamp.lb = lb;
    return lb;
  }
  /* 酒馆原生条目模板（镜像 world-info.js 的 newWorldInfoEntryTemplate，1.18）；
     新建条目必须带全字段，别让酒馆拿到 undefined。 */
  var WI_TEMPLATE = {
    key: [], keysecondary: [], comment: '', content: '',
    constant: false, vectorized: false, selective: true, selectiveLogic: 0, addMemo: false,
    order: 100, position: 0, disable: false, ignoreBudget: false,
    excludeRecursion: false, preventRecursion: false,
    matchPersonaDescription: false, matchCharacterDescription: false,
    matchCharacterPersonality: false, matchCharacterDepthPrompt: false,
    matchScenario: false, matchCreatorNotes: false,
    delayUntilRecursion: 0, probability: 100, useProbability: true,
    depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100,
    scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null,
    automationId: '', role: 0, sticky: null, cooldown: null, delay: null, triggers: []
  };

  function findRawEntry(entryMap, comment) {
    for (var k in entryMap) {
      if (Object.prototype.hasOwnProperty.call(entryMap, k)) {
        var e = entryMap[k];
        if (e && e.comment === comment) { return e; }
      }
    }
    return null;
  }
  function rawEntryList(entryMap) {
    var out = [];
    for (var k in entryMap) {
      if (Object.prototype.hasOwnProperty.call(entryMap, k) && entryMap[k]) { out.push(entryMap[k]); }
    }
    return out;
  }

  /* ───────── 块条目的解析（正文的唯一真相） ─────────
     条目名字是结构化的：「📜 压缩块 #N｜楼层 X-Y」。名字里的楼层范围是收养与对账的依据，
     正文（含用户手改）由条目自己拥有，脚本只读不覆盖。
     解析与对账的纯逻辑在 _summarize-pure.js（构建期内联，见文件顶部占位注释）。 */

  /* 读世界书 → 对账。真相优先级：
       ① 块条目（正文 + 名字里的楼层范围）—— 唯一真相，用户手改立刻生效；
       ② 账本「📜 压缩状态（勿动）」—— 只提供结构（前沿 / 例外楼层 / 我们隐藏过哪些楼 / 块的档案）；
       ③ 账本里有档案、条目却没了 ⇒ 那一段进 pending，下次大总结重做（用户删块 = 要求这段重来）。
     对账本身是纯函数 reconcileBlocks()，这里只负责取数与落地。 */
  async function loadChatState() {
    var stamp = chatStamp(), seq = ++stateLoadSeq;
    var loaded = freshState();
    stateReadPromise = loadChatStateInto(loaded, stamp).then(function () { return publishChatState(loaded, stamp, seq); });
    return stateReadPromise;
  }
  async function loadChatStateInto(st, stamp) {
    if (!hasNativeLorebook()) { st.error = '拿不到酒馆原生的世界书读写接口'; return st; }
    var ctx = stCtx();
    var lb = null;
    try { lb = getChatLorebook(); } catch (e) { st.error = '读聊天世界书失败：' + msgOf(e); return st; }
    if (!lb) { return st; }   // 本聊天没绑世界书 = 没有压缩数据（不主动创建，写的时候才建）
    st.lbName = lb;
    var raw = null, entryMap = {};
    try {
      raw = await ctx.loadWorldInfo(lb);
      requireChat(stamp);
      entryMap = (raw && raw.entries && typeof raw.entries === 'object') ? raw.entries : {};
    } catch (e) { st.error = '读世界书条目失败：' + msgOf(e); return st; }

    /* 账本（只读结构；JSON 坏了就只是丢了结构，块条目本身照常能用） */
    var ledger = null;
    var stateEntry = findRawEntry(entryMap, LB_STATE);
    if (stateEntry) {
      st.stateUid = stateEntry.uid;
      try {
        var data = JSON.parse(stateEntry.content || '{}');
        if (data && typeof data === 'object') { ledger = data; }
      } catch (e) {
        st.error = '压缩状态条目不是合法 JSON（已被手工改坏？）——可点「清除本聊天压缩数据」重来';
      }
    }

    /* 聊天现状：楼层总数 + 哪些楼被隐藏。
       ⚠️ 只读**前沿那一段**（0 到 covered），不读整个聊天：对账只关心压缩覆盖过的楼层，
       而世界书保存事件（用户在编辑器里打字）会频繁触发这条路径 —— 长聊天全量读会卡。
       前沿的三种来源都要算上：账本的 covered、账本的块档案、账本的待重做段，
       **以及世界书里块条目名字里的楼层范围**（账本整个丢了时，只有条目的名字能告诉我们
       压缩到过哪一楼；漏了这条，底下就找不到"孤儿隐藏楼层"，账本丢失场景会静默失灵）。 */
    var len = chatLen();
    var hiddenFloors = [];
    var coveredSoFar = (ledger && typeof ledger.covered === 'number') ? ledger.covered : -1;
    if (Array.isArray(ledger && ledger.blocks)) {
      for (var lb0 = 0; lb0 < ledger.blocks.length; lb0++) {
        var arc0 = ledger.blocks[lb0];
        if (arc0 && typeof arc0.to === 'number' && arc0.to > coveredSoFar) { coveredSoFar = arc0.to; }
      }
    }
    if (Array.isArray(ledger && ledger.pending)) {
      for (var lp0 = 0; lp0 < ledger.pending.length; lp0++) {
        var rng0 = ledger.pending[lp0];
        if (rng0 && typeof rng0.to === 'number' && rng0.to > coveredSoFar) { coveredSoFar = rng0.to; }
      }
    }
    var entriesAll = rawEntryList(entryMap);
    for (var en0 = 0; en0 < entriesAll.length; en0++) {
      var one0 = entriesAll[en0];
      if (!one0 || typeof one0.comment !== 'string') { continue; }
      var pn0 = parseBlockName(LB_BLOCK_PREFIX, one0.comment);
      if (pn0 && pn0.to > coveredSoFar) { coveredSoFar = pn0.to; }
    }
    if (len && coveredSoFar >= 0) {
      /* 读的区间必须盖住 hiddenByUs 里的每一楼（否则下面按"没读到=没隐藏"裁剪会误删记录） */
      var scanTop = coveredSoFar;
      /* 丢账本时，剩余块名不能证明末段从未被压缩；检查整个可压缩区。 */
      if (!ledger) { scanTop = Math.max(scanTop, len - 1 - cfg.keep); }
      if (Array.isArray(ledger && ledger.hiddenByUs)) {
        for (var hu0 = 0; hu0 < ledger.hiddenByUs.length; hu0++) {
          if (typeof ledger.hiddenByUs[hu0] === 'number' && ledger.hiddenByUs[hu0] > scanTop) { scanTop = ledger.hiddenByUs[hu0]; }
        }
      }
      var readTop = Math.min(scanTop, len - 1);
      try {
        var list = getChatMessages('0-' + readTop) || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].is_hidden) { hiddenFloors.push(list[i].message_id); }
        }
      } catch (e) { hiddenFloors = []; }
    }

    var plan = reconcileBlocks({
      prefix: LB_BLOCK_PREFIX,
      entries: entriesAll,
      ledger: ledger,
      pins: st.pins,
      hiddenFloors: hiddenFloors,
      orphanScanTop: !ledger && coveredSoFar >= 0 ? Math.max(coveredSoFar, len - 1 - cfg.keep) : coveredSoFar,
      len: len,
      keep: cfg.keep
    });
    st.blocks = plan.blocks;
    st.pending = plan.pending;
    st.covered = plan.covered;
    st.hiddenByUs = plan.hiddenByUs;
    st.pins = plan.pins;
    st.adopted = plan.adopted;
    st.orphan = plan.orphan;
    st.dup = plan.dup;
    st.suspect = plan.suspect;
    if (ledger && typeof ledger.updatedAt === 'number') { st.updatedAt = ledger.updatedAt; }

    /* 给面板的一句人话汇总（文案在 COPY 表里，纯逻辑不认识文案） */
    if (st.pending.length) { st.notice.push(COPY.blocks.pendingNote.replace('{n}', countFloors(st.pending))); }
    if (st.orphan.length) { st.notice.push(COPY.blocks.orphanNote.replace('{n}', countFloors(st.orphan))); }
    if (st.dup.length) { st.notice.push(COPY.blocks.dupNote.replace('{n}', st.dup.length)); }
    if (st.suspect.length) { st.notice.push(COPY.blocks.suspectNote.replace('{n}', st.suspect.length)); }
    if (!st.blocks.length && !st.pending.length && !st.error && (ledger || entriesAll.length)) {
      /* 有账本却没块：账本被手工清过。不算错误，面板显示空态即可。 */
      log('账本里没有任何块档案（曾被手工改动？）');
    }
    return st;
  }

  /* 块条目：一个块一个条目。名字带楼层范围（账本丢失时按名字收养），
     正文 = 一行头 + 提要文本；位置 @D⚙ 按深度注入，深度 = 块尾楼层之后的
     未隐藏楼层数（块锚在自己最后一名"住户"正后方，详见头部注释）。 */
  /* 块条目的正文/名字：格式归脚本，正文归用户（blockContent / stripBlockHeader
     在 _summarize-pure.js 里，这里只留名字这一件带前缀的事） */
  function blockComment(index, b) {
    return LB_BLOCK_PREFIX + (index + 1) + '｜楼层 ' + b.from + '-' + b.to;
  }
  /* 深度计数器：suffix[f] = 楼层 f 及之后还有多少未隐藏楼层。
     块尾是 F → 注入深度 = suffix[F+1]（藏在 F 与下一个未隐藏楼层之间）。 */
  function makeDepthCounter() {
    var len = chatLen();
    var list = [];
    try { list = (len ? (getChatMessages('0-' + (len - 1)) || []) : []); } catch (e) { list = []; }
    var hidden = {};
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m && m.is_hidden) { hidden[m.message_id] = 1; }
    }
    var suffix = new Array(len + 1);
    suffix[len] = 0;
    for (var f = len - 1; f >= 0; f--) { suffix[f] = suffix[f + 1] + (hidden[f] ? 0 : 1); }
    return function (floorIdx) {
      if (floorIdx === null || floorIdx === undefined) { return 0; }
      if (floorIdx >= len) { return cfg.keep; }   // 楼层被删过的旧块：退回保留区前，别贴到末尾
      return suffix[floorIdx + 1];
    };
  }

  /* 世界书写入串行队列（F2）：saveChatState / syncBlockDepths / clearChatData 都是
     「读世界书 → 改 → 写回」，跑批时用户在面板上同时改例外楼层或保留数，两条读写
     交错会让后写者用自己的快照覆盖对方（丢一次例外楼层或丢一个块）。队列把每次
     「读-改-写」串成原子的一段。 */
  var wbQueue = Promise.resolve();
  function wbWrite(fn) {
    var stamp = chatStamp(), snapshot = st;
    var run = wbQueue.then(function () { requireChat(stamp); return fn(stamp, snapshot); }).catch(function (e) { log('世界书写入队列任务失败：' + msgOf(e)); throw e; });
    /* 队列尾巴单独接一个不会 reject 的句柄，避免一次失败把后面所有写入堵死 */
    wbQueue = run.then(function () { }, function () { });
    return run;
  }

  async function saveChatState() { return wbWrite(saveChatStateNow); }
  async function saveChatStateNow(stamp, st) {
    requireChat(stamp);
    if (!hasNativeLorebook()) { throw new Error('拿不到酒馆原生的世界书读写接口'); }
    var ctx = stCtx();
    var lb = null;
    try { lb = await ensureChatLorebook(stamp); } catch (e) {
      if (e && e.chatCancelled) { throw e; }
      throw new Error('创建/绑定聊天世界书失败：' + msgOf(e));
    }
    requireChat(stamp);
    st.lbName = lb;
    st.updatedAt = Date.now();
    var depthAfter = makeDepthCounter();
    var raw = null;
    try { raw = await ctx.loadWorldInfo(lb); } catch (e) { throw new Error('读世界书失败：' + msgOf(e)); }
    requireChat(stamp);
    if (!raw || typeof raw !== 'object') { throw new Error('读世界书失败：返回为空'); }
    if (!raw.entries || typeof raw.entries !== 'object') { raw.entries = {}; }
    var entryMap = raw.entries;

    var maxUid = -1, maxDisplay = -1, k, e0;
    for (k in entryMap) {
      if (Object.prototype.hasOwnProperty.call(entryMap, k) && (e0 = entryMap[k])) {
        if (e0.uid > maxUid) { maxUid = e0.uid; }
        if (typeof e0.displayIndex === 'number' && e0.displayIndex > maxDisplay) { maxDisplay = e0.displayIndex; }
      }
    }

    var created = 0, updated = 0, keptText = 0;
    for (var i = 0; i < st.blocks.length; i++) {
      var b = st.blocks[i];
      b.depth = depthAfter(b.to);
      var fields = {
        comment: blockComment(i, b),
        constant: true, disable: false, position: 4, role: 0,
        depth: b.depth, order: 1000000 - b.from,
        probability: 100, useProbability: true, ignoreBudget: true, addMemo: true
      };
      var key = (b.uid !== null && b.uid !== undefined && entryMap[b.uid]) ? b.uid : null;
      var cur = (key !== null) ? entryMap[key] : null;
      if (cur) {
        /* 正文以**世界书里的当下内容**为准：面板开着的时候你刚改过条目，
           这里的 st.blocks 还是旧的 —— 照抄旧的就把你的手改覆盖了。
           正文只在两种情况下由脚本写：条目是新建的，或者连格式头都没有。 */
        var curText = stripBlockHeader(String(cur.content || ''));
        if (curText.trim()) { if (curText !== b.text) { keptText++; } b.text = curText; }
        Object.assign(cur, fields);
        var want = blockContent(b.from, b.to, b.text);
        if (String(cur.content || '') !== want) { cur.content = want; }
        updated++;
      } else {
        maxUid++; maxDisplay++;
        b.uid = maxUid;
        var ne = Object.assign({ uid: maxUid, displayIndex: maxDisplay }, WI_TEMPLATE);
        Object.assign(ne, fields);
        ne.content = blockContent(b.from, b.to, b.text);
        entryMap[maxUid] = ne;
        created++;
      }
    }
    /* 账本：关闭状态（disable:true），永不进提示词。
       v3 起**不存正文**（正文的真相在块条目里，两份副本必然不一致）：
       只记结构 —— 前沿 / 例外楼层 / 我们隐藏过哪些楼 / 待重做段 / 每块的档案（范围 + 条目 uid）。 */
    var ledgerBlocks = [];
    for (var lb2 = 0; lb2 < st.blocks.length; lb2++) {
      var bb = st.blocks[lb2];
      ledgerBlocks.push({ from: bb.from, to: bb.to, at: bb.at || null, uid: (bb.uid === undefined ? null : bb.uid) });
    }
    var stateJson = JSON.stringify({
      v: 3, updatedAt: st.updatedAt, covered: st.covered, pins: st.pins,
      hiddenByUs: st.hiddenByUs, pending: st.pending, blocks: ledgerBlocks
    }, null, 2);
    var stateEntry = findRawEntry(entryMap, LB_STATE);
    if (stateEntry) {
      st.stateUid = stateEntry.uid;
      stateEntry.content = stateJson;
      stateEntry.disable = true;
    } else {
      maxUid++; maxDisplay++;
      st.stateUid = maxUid;
      var se = Object.assign({ uid: maxUid, displayIndex: maxDisplay }, WI_TEMPLATE);
      Object.assign(se, { comment: LB_STATE, content: stateJson, disable: true, constant: false, position: 1, order: 1, ignoreBudget: true });
      entryMap[maxUid] = se;
    }
    try { await ctx.saveWorldInfo(lb, raw, true); } catch (e) { throw new Error('写世界书失败：' + msgOf(e)); }
    requireChat(stamp);
    try { if (typeof ctx.reloadWorldInfoEditor === 'function') { ctx.reloadWorldInfoEditor(false, false); } } catch (e) { }
    log('压缩状态已写入聊天世界书「' + lb + '」（块 ' + st.blocks.length + ' 个：新建 ' + created + '，更新 ' + updated + '；前沿 ' + st.covered + ' 楼）');
  }

  /* 深度核对：例外楼层增删、保留楼数改动、手动取消隐藏都会让"块尾之后的
     未隐藏楼层数"变化；有出入就只改受影响的条目（读是内存缓存操作，零成本）。 */
  async function syncBlockDepths(reason) { return wbWrite(function (stamp, state) { return syncBlockDepthsNow(reason, stamp, state); }); }
  async function syncBlockDepthsNow(reason, stamp, st) {
    if (disposed || !st.blocks.length || !st.lbName) { return; }
    if (!hasNativeLorebook()) { return; }
    var ctx = stCtx();
    try {
      var raw = await ctx.loadWorldInfo(st.lbName);
      requireChat(stamp);
      var entryMap = (raw && raw.entries) ? raw.entries : {};
      var depthAfter = makeDepthCounter();
      var changed = 0;
      for (var i = 0; i < st.blocks.length; i++) {
        var b = st.blocks[i];
        if (b.uid === null || b.uid === undefined || !entryMap[b.uid]) { continue; }
        var d = depthAfter(b.to);
        if (b.depth !== d) { b.depth = d; entryMap[b.uid].depth = d; changed++; }
      }
      if (changed) {
        await ctx.saveWorldInfo(st.lbName, raw, true);
        requireChat(stamp);
        log('已同步 ' + changed + ' 个块的注入深度（' + reason + '）');
        if (panelRoot) { renderContent(); }
      }
    } catch (e) { log('同步注入深度失败：' + msgOf(e)); }
  }

  async function clearChatData() { if (pipeline.running) { toast('warning', COPY.toasts.running); return; } return wbWrite(clearChatDataNow); }
  async function clearChatDataNow(stamp) {
    await loadChatState();
    requireChat(stamp);
    if (!st.lbName) { toast('info', COPY.toasts.noLorebook); return; }
    var ctx = stCtx();
    var uids = [], seen = {}, i;
    function take(id) { if (id !== null && id !== undefined && !seen[id]) { seen[id] = 1; uids.push(id); } }
    take(st.stateUid);
    for (i = 0; i < st.blocks.length; i++) { take(st.blocks[i].uid); }
    try {
      var raw = await ctx.loadWorldInfo(st.lbName);
      requireChat(stamp);
      var all = rawEntryList((raw && raw.entries) || {});
      for (i = 0; i < all.length; i++) {
        if (typeof all[i].comment === 'string' && all[i].comment.indexOf(LB_BLOCK_PREFIX) === 0) { take(all[i].uid); }
      }
      for (i = 0; i < uids.length; i++) { delete raw.entries[uids[i]]; }
      await ctx.saveWorldInfo(st.lbName, raw, true);
      requireChat(stamp);
    } catch (e) { toast('error', COPY.toasts.clearFail.replace('{err}', msgOf(e))); return; }
    st = freshState();
    toast('success', COPY.toasts.clearDone.replace('{n}', uids.length));
    renderContent();
    renderStatus();
  }

  /* ───────── 滚动压缩正则管理 ───────── */

  function hasTavernHelperRegex() {
    return typeof getTavernRegexes === 'function' && typeof replaceTavernRegexes === 'function';
  }
  function getRegexList() {
    return getTavernRegexes({ type: 'preset' }) || [];
  }
  function findRollRegex(list) {
    var i, r;
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (r && r.id === ROLL_ID) { return r; }
    }
    for (i = 0; i < list.length; i++) {
      r = list[i];
      if (r && String(r.script_name || '').indexOf(ROLL_NAME) === 0) { return r; }
    }
    return null;
  }
  /* enabled / depth 都可以只传一个；幂等：没变化就不写 */
  async function writeRollRegex(enabled, depth) {
    if (!hasTavernHelperRegex()) { throw new Error('酒馆助手缺少正则接口（版本过旧？）'); }
    var list = getRegexList();
    var r = findRollRegex(list);
    if (!r) { throw new Error(COPY.toasts.noRollRegex.replace('{name}', ROLL_NAME)); }
    var changed = false;
    if (typeof enabled === 'boolean' && r.enabled !== enabled) { r.enabled = enabled; changed = true; }
    if (typeof depth === 'number' && isFinite(depth) && r.min_depth !== depth) { r.min_depth = depth; changed = true; }
    if (!changed) { return { changed: 0 }; }
    await replaceTavernRegexes(list, { type: 'preset', name: 'in_use' });
    regexWrites++;
    log('滚动压缩正则已写入：enabled=' + r.enabled + ' minDepth=' + r.min_depth + '（第 ' + regexWrites + ' 次写）');
    return { changed: 1 };
  }
  function rollInfo() {
    if (!hasTavernHelperRegex()) { return { ok: false, error: '酒馆助手缺少正则接口' }; }
    try {
      var r = findRollRegex(getRegexList());
      if (!r) { return { ok: false, error: '当前预设里没有滚动压缩正则' }; }
      return { ok: true, enabled: !!r.enabled, minDepth: (r.min_depth === null || r.min_depth === undefined) ? 0 : r.min_depth };
    } catch (e) { return { ok: false, error: msgOf(e) }; }
  }

  /* ───────── 「🧱 摘要(小总结)」条目状态 ───────── */

  function summaryInfo() {
    var raw = readRaw();
    if (!raw.ok) { return { ok: false, error: raw.error }; }
    var name = null, enabled = null, i, j;
    var prompts = raw.settings.prompts || [];
    for (i = 0; i < prompts.length; i++) {
      if (prompts[i] && prompts[i].identifier === SUMMARY_ID) { name = prompts[i].name; break; }
    }
    var list = raw.order.order || [];
    for (j = 0; j < list.length; j++) {
      if (list[j] && list[j].identifier === SUMMARY_ID) { enabled = !!list[j].enabled; break; }
    }
    if (enabled === null) { return { ok: false, error: COPY.toasts.noSummaryEntry }; }
    return { ok: true, enabled: enabled, name: name || '🧱 摘要(小总结)' };
  }
  async function writeSummaryEntry(on) {
    var raw = readRaw();
    if (!raw.ok) { throw new Error(raw.error); }
    var list = raw.order.order || [], ent = null, i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].identifier === SUMMARY_ID) { ent = list[i]; break; }
    }
    if (!ent) { throw new Error('当前预设里没有「🧱 摘要(小总结)」条目'); }
    if (ent.enabled === on) { return { changed: 0 }; }
    ent.enabled = on;
    try {
      if (typeof raw.ctx.saveSettingsDebounced !== 'function') { throw new Error('找不到 saveSettingsDebounced'); }
      raw.ctx.saveSettingsDebounced();
      entryWrites++;
    } catch (e) {
      ent.enabled = !on;   // 回滚内存态，宁可没写也不要显示假状态
      throw new Error(COPY.toasts.saveFail.replace('{err}', msgOf(e)));
    }
    notifyPresetChanged(raw.ctx);
    log('「🧱 摘要(小总结)」条目已' + (on ? '开启' : '关闭') + '（第 ' + entryWrites + ' 次写）');
    return { changed: 1 };
  }

  /* ───────── token 计数 ───────── */

  function counterOf() {
    if (tokenCounter) { return tokenCounter; }
    var ctx = stCtx();
    if (ctx && typeof ctx.getTokenCountAsync === 'function') { tokenCounter = { kind: 'async', fn: ctx.getTokenCountAsync.bind(ctx) }; return tokenCounter; }
    if (ctx && typeof ctx.getTokenCount === 'function') { tokenCounter = { kind: 'sync', fn: ctx.getTokenCount.bind(ctx) }; return tokenCounter; }
    tokenCounter = { kind: 'est', fn: null };
    return tokenCounter;
  }
  async function countText(text) {
    var s = String(text === undefined || text === null ? '' : text);
    if (!s) { return 0; }
    var c = counterOf();
    try {
      if (c.kind === 'async') { return await c.fn(s, 0); }
      if (c.kind === 'sync') { return c.fn(s, 0); }
    } catch (e) { log('token 计数失败，退回估算法：' + msgOf(e)); tokenCounter = { kind: 'est', fn: null }; }
    return Math.ceil(s.length * 0.6);
  }
  /* 未隐藏楼层的 token 总和（带缓存；键 = 楼号 + 内容长度） */
  async function floorsTokens() {
    var stamp = chatStamp();
    var len = chatLen();
    if (!len) { return 0; }
    var list = null;
    try { list = getChatMessages('0-' + (len - 1)) || []; } catch (e) { return 0; }
    var sum = 0;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || m.is_hidden) { continue; }
      var mes = m.message || '';
      var key = String(m.message_id), cached = floorTokCache[key];
      var v = cached && cached.text === mes ? cached.tokens : undefined;
      if (v === undefined) {
        v = await countText(mes);
        requireChat(stamp);
        floorTokCache[key] = { text: mes, tokens: v };
      }
      sum += v;
    }
    return sum;
  }

  /* ───────── 发送量实测（只读钩子，照反截断的链式规矩挂） ───────── */

  var ENDPOINT = /\/api\/backends\/[^/]+\/generate\b/;
  var MEASURE_MARK = '__kamiMeasureHook';

  function urlOf(input) {
    try {
      if (typeof input === 'string') { return input; }
      if (input && typeof input.url === 'string') { return input.url; }
    } catch (e) { }
    return '';
  }
  function contentTextOf(m) {
    var c = m ? m.content : null;
    if (typeof c === 'string') { return c; }
    if (Array.isArray(c)) {
      var out = [];
      for (var i = 0; i < c.length; i++) {
        if (c[i] && c[i].type === 'text' && typeof c[i].text === 'string') { out.push(c[i].text); }
      }
      return out.join('\n');
    }
    return '';
  }
  function installMeasureHook() {
    if (measure.installed || disposed) { return; }
    var host = null;
    try { host = HOST; void host.fetch; } catch (e) { host = null; }
    if (!host || typeof host.fetch !== 'function') { log('拿不到宿主 fetch，不装实测钩子（只用楼层估算法）'); return; }
    var current = host.fetch;
    var native = (current && current[MEASURE_MARK] && current[MEASURE_MARK].native) ? current[MEASURE_MARK].native : current;
    var hooked = function () {
      var args = arguments, ctx2 = this || host;
      var url = '';
      try { url = urlOf(args[0]); } catch (e) { }
      var p = native.apply(ctx2, args);        // 先放行，绝不为测量耽搁请求
      try {
        if (url && ENDPOINT.test(url) && !pipeline.running) {
          var raw = (args[1] && typeof args[1].body === 'string') ? args[1].body : null;
          if (raw) { measureAsync(raw); }      // 异步补记，不 await
        }
      } catch (e) { }
      return p;
    };
    hooked[MEASURE_MARK] = { native: native };
    host.fetch = hooked;
    measure.installed = true; measure.native = native; measure.host = host;
    log('发送量实测钩子已装上（只读不改请求）');
  }
  function disposeMeasureHook() {
    if (!measure.installed) { return; }
    try {
      var cur = measure.host ? measure.host.fetch : null;
      if (cur && cur[MEASURE_MARK]) { measure.host.fetch = measure.native; }
      else { log('fetch 上还压着别的补丁，实测钩子先不动它（页面刷新会整体还原）'); }
    } catch (e) { }
    measure.installed = false; measure.host = null; measure.native = null;
  }
  async function measureAsync(raw) {
    var stamp = chatStamp();
    try {
      var body = JSON.parse(raw);
      /* 独立搜索不含剧情头部，不能用它覆盖剧情生成的用量基线。 */
      if (body && (body._kami_native_probe || body._kami_background_task === 'web_search')) { return; }
      var msgs = body && body.messages;
      if (!Array.isArray(msgs) || !msgs.length) { return; }
      var total = 0;
      for (var i = 0; i < msgs.length; i++) { total += await countText(contentTextOf(msgs[i])); }
      var floorsSum = await floorsTokens();
      requireChat(stamp);
      measure.last = { total: total, floorsSum: floorsSum, at: Date.now() };
      log('实测：本次发送 ≈ ' + total + ' token（楼层 ' + floorsSum + '）');
      renderStatus();
    } catch (e) { log('实测失败（不影响请求）：' + msgOf(e)); }
  }
  /* 估算下次发送量：头部开销（实测总数-实测楼层和）+ 当前未隐藏楼层 + 新输入 */
  async function estimateNext(type) {
    var floorTok = await floorsTokens();
    var overhead = 0;
    if (measure.last && measure.last.total >= measure.last.floorsSum) {
      overhead = measure.last.total - measure.last.floorsSum;
    }
    var extra = 0;
    if (type === 'normal') {
      var el2 = null;
      try { el2 = HDOC.getElementById('send_textarea'); } catch (e) { }
      var t = el2 ? String(el2.value || '') : '';
      if (t) { extra = await countText(t); }
    }
    return { est: floorTok + overhead + extra, floorTok: floorTok, overhead: overhead, extra: extra };
  }

  /* ───────── 超限压缩流水线 ───────── */

  function clip(s, max) {
    s = String(s === undefined || s === null ? '' : s);
    if (s.length <= max) { return s; }
    return s.slice(0, max) + '……（本楼过长，已截断）';
  }

  /* 从返回值里取正文。三种形状：
       ① 字符串（绝大多数接口）；
       ② 对象带 content（酒馆助手在「带着工具且模型真调了工具」时会返回它）；
       ③ 对象只有 tool_calls —— Claude 那条路：服务端把 json_schema 变成一个**强制工具**，
          content 恒为空串，JSON 在工具参数里（这是「Claude + json_schema」唯一正确的读法）。
       顺带认一下反截断的占位工具形状（参数是 {content:'…'}）。 */
  function responseTextOf(res) {
    if (typeof res === 'string') { return res; }
    if (!res || typeof res !== 'object') { return ''; }
    if (typeof res.content === 'string' && res.content.trim()) { return res.content; }
    var calls = res.tool_calls;
    if (Array.isArray(calls) && calls.length) {
      var pick = null, i, one;
      for (i = 0; i < calls.length; i++) {
        one = calls[i];
        var nm = one && one.function && one.function.name;
        if (nm === SUMMARY_SCHEMA.name) { pick = one; break; }
        if (!pick) { pick = one; }
      }
      var args = pick && pick.function && typeof pick.function.arguments === 'string' ? pick.function.arguments : '';
      if (args) {
        try {
          var o = JSON.parse(args);
          if (o && typeof o === 'object' && typeof o.content === 'string' && o.content.trim()) { return o.content; }
        } catch (e) { }
        return args;
      }
    }
    return typeof res.content === 'string' ? res.content : '';
  }

  /* 块摘要请求：材料 → 结构化输出 → 人话正文。
     返回 {text}，失败一律抛错（**绝不把没通过校验的东西交出去**）。
     两段式：先带 json_schema 试一次，解析不过/请求被拒就退回「只靠提示词约束」再试一次 ——
     有些反代不认 response_format，不留这条路会让压缩对它永久失效。
     注意：解析标准全程不放宽，第二次也一样只认合法 JSON。 */
  async function summarizeChunk(chunk, pinsInRange, stamp) {
    requireChat(stamp);
    var mats = [];
    mats.push('【历史压缩块】');
    /* 只带**在本块之前**的块：补块时 st.blocks 里可能有更晚的块（时间在后面的
       剧情不该出现在"历史"里，否则模型会提前总结还没发生的事）。 */
    var hist = [];
    for (var h = 0; h < st.blocks.length; h++) {
      if (st.blocks[h].to < chunk[0]) { hist.push(st.blocks[h]); }
    }
    if (!hist.length) { mats.push('（无，这是第一块）'); }
    for (var i = 0; i < hist.length; i++) {
      var b = hist[i];
      mats.push('—— 块（楼层 ' + b.from + '-' + b.to + '）——\n' + b.text);
    }
    mats.push('');
    mats.push('【例外楼层】');
    var pinList = [];
    for (var p = 0; p < pinsInRange.length; p++) { pinList.push(pinsInRange[p]); }
    if (!pinList.length) { mats.push('（无）'); }
    for (var q = 0; q < pinList.length; q++) {
      var pm = chatMsg(pinList[q]);
      mats.push('—— 例外楼层 ' + pinList[q] + ' ——\n' + clip(pm ? pm.message : '', MAX_PIN_CHARS));
    }
    mats.push('');
    mats.push('【本块楼层：' + chunk[0] + ' 到 ' + chunk[chunk.length - 1] + '】');
    for (var c = 0; c < chunk.length; c++) {
      var m = chatMsg(chunk[c]);
      var who = m ? (m.is_user ? '用户' : '角色') : '?';
      var nm = m && m.name ? m.name : '';
      mats.push('—— 楼层 ' + chunk[c] + '（' + who + (nm ? '·' + nm : '') + '）——\n' + clip(m ? m.message : '', MAX_FLOOR_CHARS));
    }
    /* 请求组合：头条目 → 任务 → 材料（固定 user）→ 尾条目。空内容的头尾条目跳过。 */
    var msgs = [];
    var i2, e;
    for (i2 = 0; i2 < cfg.prompts.head.length; i2++) {
      e = cfg.prompts.head[i2];
      if (e.content && e.content.trim()) { msgs.push({ role: e.role, content: e.content }); }
    }
    if (cfg.prompts.task && cfg.prompts.task.trim()) { msgs.push({ role: cfg.prompts.taskRole, content: cfg.prompts.task }); }
    msgs.push({ role: 'user', content: mats.join('\n\n') });
    for (i2 = 0; i2 < cfg.prompts.tail.length; i2++) {
      e = cfg.prompts.tail[i2];
      if (e.content && e.content.trim()) { msgs.push({ role: e.role, content: e.content }); }
    }
    /* 输出格式契约永远压在最后一条：它不依赖用户的任务正文（自定义模板也管用） */
    msgs.push({ role: 'system', content: OUTPUT_CONTRACT });
    if (typeof generateRaw !== 'function') { throw new Error(COPY.toasts.noGenerate); }
    /* 占位工具 + tool_choice:'none'：酒馆助手的标准生成路径只有在带 tools 时
       才把 tool_choice 注入请求体（responseGenerator.ts 的 optionsInjector 只认
       hasTools 才写 tool_choice，光有 json_schema 不写），而反截断只认请求体里的
       tool_choice:'none' 才会放手。所以占位工具**必须留着**，别以为有了 json_schema
       就能把它删掉 —— 删了反截断会接管这次摘要请求。
       自定义接口（source:'custom'）同样在 toolCallCompat 的支持名单里。 */
    var baseReq = {
      generation_id: 'kami-summarize-' + Date.now(),
      ordered_prompts: msgs,
      should_silence: true,
      tools: [{ type: 'function', function: { name: 'kami_noop', description: '占位工具，不要调用。', parameters: { type: 'object', properties: {}, required: [] } } }],
      tool_choice: 'none'
    };
    /* 自定义接口的临时参数：每次尝试都要带上（Object.assign 出去的对象各自独立） */
    var customApi = null;
    if (cfg.sumModel.mode === 'custom') {
      var cc = currentSumConfig();
      if (cc && cc.apiurl && cc.key && cc.model) {
        customApi = {
          apiurl: cc.apiurl,
          key: cc.key,
          model: cc.model,
          source: cc.source || 'custom'   // 请求格式跟所选接口格式走（custom=OpenAI 兼容自定义）
        };
      } else { toast('warning', COPY.model.customHint); }
    }
    var send = async function (useSchema) {
      var req = {
        generation_id: baseReq.generation_id + (useSchema ? '' : '-plain'),
        ordered_prompts: baseReq.ordered_prompts,
        should_silence: true,
        tools: baseReq.tools,
        tool_choice: 'none'
      };
      if (useSchema) { req.json_schema = summaryJsonSchema(); }
      if (customApi) { req.custom_api = customApi; }
      if (customApi) { return withTavernProfile('', function () { return generateRaw(req); }); }
      if (cfg.sumModel.tavernPick) {
        var got = null;
        await withTavernProfile(cfg.sumModel.tavernPick, async function () { got = await generateRaw(req); });
        return got;
      }
      return withTavernProfile('', function () { return generateRaw(req); });
    };
    /* 上次哪一种模式通过，下次就先试它（省一次往返）；失败会自己换边再试。 */
    var order = (schemaMode === 'off') ? [false, true] : [true, false];
    var lastErr = '';
    for (var attempt = 0; attempt < order.length; attempt++) {
      var useSchema = order[attempt];
      var res = null;
      try {
        requireChat(stamp);
        res = await send(useSchema);
        requireChat(stamp);
      } catch (err) {
        if (err && err.chatCancelled) { throw err; }
        lastErr = msgOf(err);
        if (useSchema) { log('带 json_schema 的摘要请求被拒（' + lastErr + '），改用提示词约束重试'); }
        continue;
      }
      var parsed = parseSummaryResponse(responseTextOf(res));
      if (parsed.ok) {
        if (useSchema) { schemaMode = 'on'; }
        else if (attempt > 0) { schemaMode = 'off'; }
        return parsed.text;
      }
      lastErr = COPY.toasts.schemaBad
        .replace('{why}', COPY.toasts.schemaWhy[parsed.reason] || parsed.reason)
        .replace('{head}', parsed.rawHead || '（空）');
      /* 只在「模型给了东西但不是我们的 JSON」时才怀疑结构化输出这条路走不通。
         如果是接口报错、空回复这类**传输层**问题，json_schema 是无辜的 ——
         乱翻模式只会让后面的块白丢一次 json_schema 强制（探测脚本抓到的真实行为）。 */
      var formatTrouble = (parsed.reason === 'noJson' || parsed.reason === 'badJson' || parsed.reason === 'noFields');
      if (useSchema && formatTrouble) {
        schemaMode = 'off';
        log('带 json_schema 的摘要响应没通过校验（' + parsed.reason + '），改用提示词约束重试：' + parsed.rawHead);
      } else {
        log('摘要响应没通过校验（' + parsed.reason + '）：' + parsed.rawHead);
      }
    }
    throw new Error(lastErr || COPY.toasts.emptyReply);
  }
  function chatMsg(i) {
    try {
      var list = getChatMessages(String(i));
      return (list && list.length) ? list[0] : null;
    } catch (e) { return null; }
  }

  async function setFloorHidden(ids, hidden, stamp) {
    if (stamp) { requireChat(stamp); }
    if (!ids.length) { return; }
    if (typeof setChatMessages !== 'function') { throw new Error('酒馆助手没有 setChatMessages（版本过旧？）'); }
    var payload = [];
    for (var i = 0; i < ids.length; i++) { payload.push({ message_id: ids[i], is_hidden: !!hidden }); }
    await setChatMessages(payload, { refresh: 'affected' });
    if (stamp) { requireChat(stamp); }
  }

  async function unhideAll() {
    if (pipeline.running) { toast('warning', COPY.toasts.running); return; }
    if (SEARCH && SEARCH.status().running) { toast('warning', '请先等待搜索完成，或取消搜索'); return; }
    var stamp = chatStamp();
    var len = chatLen();
    if (!len) { toast('info', COPY.toasts.noChat); return; }
    var list = getChatMessages('0-' + (len - 1)) || [];
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].is_hidden) { ids.push(list[i].message_id); }
    }
    if (!ids.length) { toast('info', COPY.toasts.noHidden); return; }
    await setFloorHidden(ids, false, stamp);
    /* 取消隐藏之后这些楼不再由我们隐藏：hiddenByUs 必须跟着清空，
       否则下次对账会把它们当成「我们隐藏的孤儿楼层」自动重新总结一遍。 */
    st.hiddenByUs = [];
    if (st.lbName) {
      try { await saveChatState(); } catch (e) { log('取消隐藏后落盘失败（不影响显示）：' + msgOf(e)); }
    }
    toast('success', COPY.toasts.unhideDone.replace('{n}', ids.length));
  }

  async function runPipeline(trigger) {
    if (disposed) { lastError = '脚本已注销'; return; }
    if (pipeline.running) { toast('warning', COPY.toasts.running); return; }
    if (SEARCH && SEARCH.status().running) { toast('warning', '请先等待搜索完成，或取消搜索'); return; }
    var len = chatLen();
    if (!len) { toast('warning', COPY.toasts.noChat); return; }
    if (trigger === 'auto' && !cfg.grandOn) { return; }
    var stamp = chatStamp();

    pipeline.running = true; pipeline.done = 0; pipeline.total = 0;
    updateDef(); renderStatus();
    toast('info', COPY.toasts.start.replace('{x}', trigger === 'auto' ? COPY.toasts.startAuto : COPY.toasts.startManual));

    var newBlocks = [], failMsg = null, hideIds = [];
    try {
      await loadChatState();
      requireChat(stamp);
      if (st.orphan.length) {
        toast('warning', COPY.blocks.orphanNote.replace('{n}', countFloors(st.orphan)));
      }
      var keep = Math.max(1, Math.min(500, cfg.keep));
      var chunkSize = Math.max(1, Math.min(200, cfg.chunk));
      var end = len - 1 - keep;
      var start = st.covered + 1;
      var all = getChatMessages('0-' + (len - 1)) || [];
      var pinMap = {};
      for (var p = 0; p < st.pins.length; p++) { pinMap[st.pins[p]] = 1; }
      var pinsInRange = [];
      for (var pi = 0; pi < st.pins.length; pi++) { if (st.pins[pi] <= end) { pinsInRange.push(st.pins[pi]); } }

      /* ① 补块：账本里有档案、条目却没了的段（你把块条目删了/清空了 = 要求这段重来）。
            这些楼层基本都已经被隐藏 —— 它们正是被那个丢掉的块隐藏的，
            不把原文读回来，这段剧情就永远补不上（用户报的「缺块不补」就是这条）。 */
      var repairChunks = [];
      for (var pr = 0; pr < st.pending.length; pr++) {
        var pf = pendingFloors(st.pending[pr], len, st.pins);
        for (var pt = 0; pt < pf.length; pt += chunkSize) { repairChunks.push(pf.slice(pt, pt + chunkSize)); }
      }

      /* ② 常规：前沿之后、保留区之前、未隐藏、非例外楼层 */
      var targets = [];
      for (var i = start; i <= end; i++) {
        var m = all[i];
        if (!m || m.is_hidden) { continue; }
        if (pinMap[i]) { continue; }
        targets.push(i);
      }
      /* 按每块楼数切块（纯按数量切；楼号可能有例外楼层造成的空洞，没关系） */
      var chunks = [];
      for (var t = 0; t < targets.length; t += chunkSize) {
        chunks.push(targets.slice(t, t + chunkSize));
      }
      if (!chunks.length && !repairChunks.length) {
        /* 未知隐藏区保留提示，不能在没有生成摘要时静默推进覆盖前沿。 */
        if (st.orphan.length) { return; }
        if (end < start) {
          toast('info', COPY.toasts.nothing.replace('{n}', keep));
        } else {
          /* 范围里全被隐藏或全是例外楼层：前沿推进到本轮末尾，避免下次重复扫同一段 */
          st.covered = end;
          await saveChatState();
          toast('info', COPY.toasts.onlyPins.replace('{n}', end));
        }
        return;
      }
      pipeline.total = repairChunks.length + chunks.length;
      if (repairChunks.length) {
        log('先补 ' + repairChunks.length + ' 段缺失的压缩块（共 ' + countFloors(st.pending) + ' 楼）');
      }
      var coveredNow = st.covered;
      var doneCount = 0;
      var bumpProgress = function () {
        pipeline.done = doneCount;
        var bRun = panelHead ? panelHead.querySelector('[data-kami-act="run-now"]') : null;
        if (bRun) { bRun.textContent = COPY.grand.running + ' ' + pipeline.done + '/' + pipeline.total; }
        renderStatus();
      };

      /* ③ 补块先跑（历史补齐了，新材料才接得上） */
      var rc = 0, pendingLeft = [];
      for (; rc < st.pending.length && !failMsg; rc++) {
        var rng = st.pending[rc];
        var rfloors = pendingFloors(rng, len, st.pins);
        var rq = 0;
        for (; rq < rfloors.length; rq += chunkSize) {
          if (disposed) { failMsg = '脚本已注销'; break; }
          var piece = rfloors.slice(rq, rq + chunkSize);
          try {
            var rtext = await summarizeChunk(piece, pinsInRange, stamp);
            requireChat(stamp);
            var rblk = { from: piece[0], to: piece[piece.length - 1], at: Date.now(), text: rtext };
            st.blocks.push(rblk);
            st.blocks.sort(function (x, y) { return x.from - y.from || x.to - y.to; });
            newBlocks.push(rblk);
            doneCount++;
            log('补块完成（楼层 ' + rblk.from + '-' + rblk.to + '）');
            bumpProgress();
          } catch (e) {
            failMsg = COPY.toasts.repairFail
              .replace('{range}', rng.from + '-' + rng.to)
              .replace('{err}', msgOf(e));
            /* 这一段没做完的部分留着，下次接着来 */
            pendingLeft.push({ from: piece[0], to: rfloors[rfloors.length - 1] });
            break;
          }
        }
        if (failMsg) {
          /* 后面还没轮到的段原样留着 */
          for (var rest = rc + 1; rest < st.pending.length; rest++) { pendingLeft.push(st.pending[rest]); }
          break;
        }
      }

      /* ④ 常规块 */
      for (var c = 0; c < chunks.length && !failMsg; c++) {
        if (disposed) { failMsg = '脚本已注销'; break; }
        try {
          /* st.blocks 里带着本轮已完成的块（summarizeChunk 只会带上本块之前的） */
          var text = await summarizeChunk(chunks[c], pinsInRange, stamp);
          requireChat(stamp);
          var blk = { from: chunks[c][0], to: chunks[c][chunks[c].length - 1], at: Date.now(), text: text };
          st.blocks.push(blk);
          newBlocks.push(blk);
          coveredNow = Math.max(coveredNow, blk.to);
          doneCount++;
          log('块 ' + (c + 1) + '/' + chunks.length + ' 完成（楼层 ' + blk.from + '-' + blk.to + '）');
          bumpProgress();
        } catch (e) {
          failMsg = '第 ' + (c + 1) + ' 块（楼层 ' + chunks[c][0] + '-' + chunks[c][chunks[c].length - 1] + '）总结失败：' + msgOf(e);
          break;
        }
      }
      if (!sameChat(stamp)) {
        /* 注销后不再写盘、不再隐藏（F1：跑批中途脚本被关，已算出的块留在内存里即可） */
        log('流水线进行中脚本被注销：放弃本次落盘与隐藏');
      } else {
        var pendingChanged = JSON.stringify(st.pending) !== JSON.stringify(pendingLeft);
        st.pending = pendingLeft;
        if (newBlocks.length) {
          /* 前沿只推进到**成功块**的末尾：失败块连同后面的楼层，下次触发从断点继续 */
          st.covered = coveredNow;
          /* 这次成功块覆盖的楼层：可见的藏起来；全部记进 hiddenByUs（= 我们隐藏的，
             将来它们万一丢了块，脚本才敢自动把原文读回来重做）。
             ⚠️ hiddenByUs 必须在这句 saveChatState **之前**填好 —— 否则账本里没有
             「这些楼是我们隐藏的」这条记录，等用户删掉块条目时脚本就认不出它们，
             只能退化成"报个警等用户点按钮"。 */
          var ownedMap = {};
          for (var b2 = 0; b2 < newBlocks.length; b2++) {
            for (var f = newBlocks[b2].from; f <= newBlocks[b2].to; f++) { if (!pinMap[f]) { ownedMap[f] = 1; } }
          }
          for (var t2 = 0; t2 < targets.length; t2++) { if (ownedMap[targets[t2]]) { hideIds.push(targets[t2]); } }
          for (var ok in ownedMap) {
            if (Object.prototype.hasOwnProperty.call(ownedMap, ok) && st.hiddenByUs.indexOf(Number(ok)) < 0) {
              st.hiddenByUs.push(Number(ok));
            }
          }
          st.hiddenByUs.sort(function (x, y) { return x - y; });
          await saveChatState();
          requireChat(stamp);
          await setFloorHidden(hideIds, true, stamp);
        } else if (pendingChanged) {
          /* 补块一段都没成（或只是清理了空段）：把剩余待办落盘，别等下次重新推 */
          await saveChatState();
        }
      }
    } catch (e) {
      failMsg = failMsg || msgOf(e);
    } finally {
      pipeline.running = false;
    }
    if (!sameChat(stamp)) { return; }
    if (failMsg) {
      lastError = failMsg;
      toast('error', COPY.toasts.partial.replace('{err}', failMsg) + (newBlocks.length ? COPY.toasts.partialTail.replace('{n}', newBlocks.length) : ''));
    } else {
      lastError = null;
      toast('success', COPY.toasts.done.replace('{a}', newBlocks.length).replace('{b}', hideIds.length).replace('{c}', st.blocks.length));
    }
    updateDef();
    renderStatus();
    if (panelRoot) { renderContent(); }
  }

  /* 自动触发：挂在生成起点（酒馆会等这个事件的所有监听者跑完才继续），
     所以总结+隐藏能赶在这一轮提示词组装之前完成。绝不让异常抛出去。 */
  async function onGenerationStarted(type) {
    if (disposed || pipeline.running || !cfg.grandOn) { return; }
    var t = String(type || 'normal');
    if (t === 'quiet' || t === 'impersonate') { return; }
    var stamp = chatStamp();
    try {
      await syncBlockDepths('生成前核对');   // 手动取消隐藏等造成的漂移在这里兜住
      requireChat(stamp);
      var est = await estimateNext(t);
      requireChat(stamp);
      log('生成前估算：' + est.est + ' token（楼层 ' + est.floorTok + ' + 头部 ' + est.overhead + ' + 新输入 ' + est.extra + '），上限 ' + cfg.threshold);
      if (est.est >= cfg.threshold) { await runPipeline('auto'); }
    } catch (e) {
      log('自动触发检查失败（不阻塞生成）：' + msgOf(e));
    }
  }
  function onChatChanged() {
    chatEpoch++; stateLoadSeq++;
    st = freshState();
    measure.last = null;
    floorTokCache = {};
    lastError = null;
    var stamp = chatStamp();
    return loadChatState().then(function () {
      requireChat(stamp);
      if (panelRoot) { renderContent(); }
      renderStatus();
      return syncBlockDepths('切换聊天');
    }).catch(function (e) { if (!e.chatCancelled) { log('切换聊天后读取失败：' + msgOf(e)); } });
  }
  /* 面板与世界书对齐：重新读一遍世界书（块条目是正文的唯一真相），
     顺带体检（待重做段 / 孤儿隐藏楼层 / 疑似报错内容）。
     · 打开面板时调用（进来就是最新的）；
     · 酒馆保存世界书后调用（WORLDINFO_UPDATED，手动改完 1 秒内面板跟着变）；
     · 面板上「刷新」按钮兜底（拿不到那个事件时）。 */
  async function refreshState(reason) {
    if (disposed || pipeline.running) { return; }
    var stamp = chatStamp();
    await loadChatState();
    requireChat(stamp);
    if (reason === 'autosync') {
      log('世界书有变动，已重新对账（块 ' + st.blocks.length + '，待重做 ' + st.pending.length + ' 段）');
    } else if (reason === 'manual') {
      toast('info', COPY.toasts.refreshed);
    }
    if (panelRoot) { renderContent(); }
    renderStatus();
  }
  /* 世界书事件：用户在世界书面板里改条目（ST 1.18 是输入即存，没有保存按钮），
     保存完发 worldinfo_updated。只认当前聊天绑的世界书，别被别的世界书刷屏。
     防抖 400ms：ST 自己就是 1 秒防抖，连续打字会连着触发。 */
  var wiSyncTimer = null;
  function onWorldInfoUpdated(name) {
    if (disposed) { return; }
    var mine = null;
    try { mine = getChatLorebook(); } catch (e) { return; }
    if (!mine || String(name || '') !== String(mine)) { return; }
    try { if (wiSyncTimer) { clearTimeout(wiSyncTimer); } } catch (e) { }
    wiSyncTimer = setTimeout(function () {
      wiSyncTimer = null;
      refreshState('autosync').catch(function (e) { log('世界书同步失败：' + msgOf(e)); });
    }, 400);
  }
  /* 把「已被隐藏、却没有压缩块管着」的楼层纳入待重做。
     只由用户点按钮触发：这些楼可能是用户自己 /hide 的，脚本不替他做主。 */
  async function repairOrphans() {
    if (pipeline.running) { toast('warning', COPY.toasts.running); return; }
    var stamp = chatStamp();
    await loadChatState();
    requireChat(stamp);
    if (!st.orphan.length) { toast('info', COPY.toasts.noOrphan); return; }
    var floors = [];
    for (var i = 0; i < st.orphan.length; i++) {
      for (var f = st.orphan[i].from; f <= st.orphan[i].to; f++) { floors.push(f); }
    }
    if (!floors.length) { return; }
    st.pending = mergeRanges(st.pending.concat(st.orphan));
    for (var o = 0; o < st.orphan.length; o++) { st.covered = Math.max(st.covered, st.orphan[o].to); }
    for (var j = 0; j < floors.length; j++) {
      if (st.hiddenByUs.indexOf(floors[j]) < 0) { st.hiddenByUs.push(floors[j]); }
    }
    st.hiddenByUs.sort(function (x, y) { return x - y; });
    await saveChatState();
    requireChat(stamp);
    toast('success', COPY.toasts.repairQueued.replace('{n}', floors.length));
    /* 重新对账一遍：notice / orphan / suspect 全部回到真实状态（别手搓面板文案） */
    await loadChatState();
    requireChat(stamp);
    if (panelRoot) { renderContent(); }
    renderStatus();
  }
  function onMessagesChanged() {
    /* 删除楼层会让楼层号漂移（酒馆不报被删序号），这里只把越界的引用收进来并提示 */
    var len = chatLen();
    var drifted = false;
    if (st.covered > len - 1) { st.covered = len - 1; drifted = true; }
    for (var i = 0; i < st.pins.length; i++) {
      if (st.pins[i] > len - 1) { st.pins.splice(i, 1); i--; drifted = true; }
    }
    if (drifted) {
      log('检测到楼层删除：压缩块的楼层号可能整体漂移，详见面板说明');
      /* 收拢要落盘，否则下次 loadChatState 又从账本读回未收拢的值 */
      if (st.lbName) { saveChatState().catch(function (e) { log('收拢落盘失败：' + msgOf(e)); }); }
    }
    if (panelRoot) { renderContent(); }
    renderStatus();
  }

  /* ───────── 面板 ───────── */

  function mk(tag, cls, text) {
    return createKamiUi(HDOC).element(tag, cls, text == null ? undefined : String(text));
  }
  function clampNum(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  /* 本面板的布局样式表：**只写布局，不写颜色/字体/材质**。
     先例 = 50-引导.js 的 GUIDE_CSS 排版层（契约 §4.4 例外②）。
     管两件事：① 标题栏第二行（三个等宽按钮）——.kami-head 在四套皮肤里都是 nowrap，
     需要 wrap 才能落第二行；② 三个按钮等宽 + 字号压到面板小号档（用户真机裁定「字太大」）。
     条目卡开关态高亮（.is-on）**不在这里**——那归皮肤管：主任务已把 trpg/rain/nixie
     三代选择器缺的空格修好，兜底皮肤也有规则，直接吃皮肤的。 */
  var LAYOUT_CSS = [
    '#' + PANEL_ID + ' .kami-head{flex-wrap:wrap;}',
    '#' + PANEL_ID + ' .kami-head>[data-kami-role="head-actions"]{flex:0 0 100%;display:flex;align-items:center;gap:var(--kami-gap);min-width:0;}',
    '#' + PANEL_ID + ' .kami-head>[data-kami-role="head-actions"]>.kami-btn{flex:1 1 0;min-width:0;font-size:var(--kami-fs-xs);}',
    /* 字段行里的宽控件：文本/下拉/多行撑满剩余宽度（数字框、以及裹在
       .kami-field-value 里的框保持皮肤登记的宽度）。
       ⚠️ 2026-09-21：类名从 `.kami-number` 换成契约 §4.2 新登记的
       `.kami-text` / `.kami-select` / `.kami-textarea` —— 原来一条 `:not([type="number"])`
       把 textarea 与 select 也捞进来，只是权宜之计。 */
    '#' + PANEL_ID + ' .kami-field > input.kami-text,',
    '#' + PANEL_ID + ' .kami-field > select.kami-select{flex:1 1 auto;min-width:0;}',
    /* 多行文本框 */
    '#' + PANEL_ID + ' textarea.kami-textarea{width:100%;box-sizing:border-box;min-height:72px;resize:vertical;}',
    /* 「名称框 + 存为 / 删除」这一行（大总结模型与摘要提示词模板共用 data-kami-role="name-row"）：
       按钮不许在词中间折断，名称框吃掉剩余宽度；一行放不下时**整行换行**而不是把
       「存为新模板」拆成两行（420px 面板里不加这几条就会拆）。 */
    '#' + PANEL_ID + ' [data-kami-role="name-row"]{flex-wrap:wrap;row-gap:6px;}',
    '#' + PANEL_ID + ' [data-kami-role="name-row"]>.kami-field-label{flex:0 0 auto;}',
    '#' + PANEL_ID + ' [data-kami-role="name-row"]>input.kami-text{flex:1 1 6em;min-width:6em;}',
    '#' + PANEL_ID + ' [data-kami-role="name-row"]>.kami-btn{flex:0 0 auto;white-space:nowrap;}',
    /* 例外楼层小标签一行排开、窄了换行 */
    '#' + PANEL_ID + ' [data-kami-role="pin-chips"]{display:flex;flex-wrap:wrap;gap:var(--kami-gap);}',
    /* 压缩块正文保留提要里的换行 */
    '#' + PANEL_ID + ' [data-kami-role="block-text"]{white-space:pre-wrap;}'
  ].join('\n');


  var TOOLBOX_LAYOUT_CSS = [
    '#'+PANEL_ID+' .kami-toolbox-pane{flex:1 1 auto;min-height:0;overflow:auto;}',
    '#'+PANEL_ID+' [data-toolbox-pane=compress]{display:flex;flex-direction:column;overflow:hidden;}',
    '#'+PANEL_ID+' .kami-toolbox-pane[hidden]{display:none!important;}',
    '#'+PANEL_ID+' .kami-toolbox-pane>.kami-body{flex:1 1 auto;min-height:0;overflow:auto;}',
    '#'+PANEL_ID+' .kami-tabs{display:flex;flex:0 0 auto;gap:0;}',
    '#'+PANEL_ID+' .kami-toolbox-actions{display:flex;flex:0 0 auto;flex-wrap:wrap;gap:var(--kami-gap);padding:var(--kami-pad-y) var(--kami-pad-lg-x);}',
    '#'+PANEL_ID+' .kami-toolbox-actions>.kami-btn{flex:1 1 auto;min-width:0;white-space:nowrap;font-size:var(--kami-fs-xs);}',
    '#'+PANEL_ID+' [data-toolbox-pane=other] .kami-card{margin-bottom:var(--kami-gap);}',
    '#'+PANEL_ID+' details>summary{cursor:pointer;list-style:none;}',
    '#'+PANEL_ID+' details>summary::-webkit-details-marker{display:none;}',
    '#'+PANEL_ID+' details>summary::after{content:"⌄";margin-left:auto;}',
    '#'+PANEL_ID+' details[open]>summary::after{content:"⌃";}',
    '#'+PANEL_ID+' [data-search-manual-settings] .kami-card{margin-top:var(--kami-gap);}',
    '#'+PANEL_ID+' [data-search-limits] input[type=number]{width:130px;min-width:0;max-width:100%;flex:0 1 130px;}',
    '.kami-manual-dialog{border:0;padding:0;background:transparent;color:inherit;width:min(560px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:90dvh;overflow:visible;}',
    '.kami-manual-dialog::backdrop{background:rgba(0,0,0,.58);}',
    '.kami-manual-dialog .kami-shell{position:relative!important;inset:auto!important;transform:none!important;width:100%!important;max-height:90dvh;display:flex;flex-direction:column;margin:0!important;}',
    '.kami-manual-dialog .kami-body{overflow:auto;min-height:0;background:var(--kami-card-2);color:var(--kami-fg);}',
    '.kami-manual-dialog .kami-root[data-kami-comp="dialog"] .kami-card-note{color:var(--kami-fg-dim);opacity:1;}',
    '.kami-manual-dialog textarea.kami-textarea{width:100%;box-sizing:border-box;min-height:150px!important;resize:vertical;}',
    '.kami-manual-dialog .kami-foot{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:var(--kami-gap);}',
    '.kami-manual-dialog li{padding:var(--kami-gap) 0;}',
    '.kami-manual-dialog .kami-search-status{display:flex;align-items:center;gap:16px;padding:20px;background:var(--kami-card-2);color:var(--kami-fg);border:1px solid var(--kami-accent-line);border-radius:var(--kami-r-md);}',
    '.kami-manual-dialog .kami-search-status>div{min-width:0;}',
    '.kami-manual-dialog .kami-search-status p{margin:0;overflow-wrap:anywhere;}',
    '.kami-manual-dialog .kami-search-status-eyebrow,.kami-manual-dialog .kami-search-status-count{font-size:var(--kami-fs-sm);color:var(--kami-fg-dim);}',
    '.kami-manual-dialog .kami-search-status-title{font-size:calc(var(--kami-fs) * 1.25);font-weight:750;line-height:1.4;padding:5px 0;}',
    '.kami-manual-dialog .kami-search-status-icon{display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;font-size:24px;font-weight:700;color:var(--kami-fg);}',
    '.kami-manual-dialog .kami-search-status-icon.is-running{box-sizing:border-box;border:3px solid var(--kami-line-strong);border-top-color:var(--kami-accent);border-radius:50%;animation:kami-search-spin 1s linear infinite;}',
    '.kami-manual-dialog .kami-search-stages{list-style:none;padding:0;margin:18px 0;}',
    '.kami-manual-dialog .kami-search-stages li{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid transparent;border-radius:var(--kami-r-sm);color:var(--kami-fg-dim);}',
    '.kami-manual-dialog .kami-search-stages li.is-current{background:var(--kami-card-2);border-color:var(--kami-accent-line);color:var(--kami-fg);}',
    '.kami-manual-dialog .kami-search-stages li.is-done{color:var(--kami-fg);}',
    '.kami-manual-dialog .kami-search-stages li.is-error{color:var(--kami-warn);}',
    '.kami-manual-dialog .kami-search-stages small{display:block;font-size:var(--kami-fs-xs);color:var(--kami-fg-dim);margin-top:2px;}',
    '.kami-manual-dialog .kami-search-stage-mark{display:grid;place-items:center;box-sizing:border-box;width:28px;height:28px;flex:0 0 28px;border:1px solid var(--kami-line-strong);border-radius:50%;font-weight:650;}',
    '.kami-manual-dialog .is-current .kami-search-stage-mark,.kami-manual-dialog .is-done .kami-search-stage-mark{border-color:var(--kami-accent);color:var(--kami-fg);}',
    '.kami-manual-dialog .is-current .kami-search-stage-mark{outline:2px solid var(--kami-accent-soft);outline-offset:2px;}',
    '.kami-manual-dialog .is-search-stop{font-weight:700;border-width:2px;}',
    '@keyframes kami-search-spin{to{transform:rotate(360deg);}}',
    '@media(prefers-reduced-motion:reduce){.kami-manual-dialog .kami-search-status-icon.is-running{animation:none;}}',
    'html[data-kami-motion="off"] .kami-manual-dialog .kami-search-status-icon.is-running{animation:none;}',
    '@media(max-width:600px){.kami-manual-dialog .kami-search-status{padding:15px;gap:12px;}.kami-manual-dialog .kami-search-stages li{padding:10px;}}',
    '.kami-manual-dialog [hidden]{display:none!important;}'
  ].join('\n');

  function injectCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var stl = HDOC.createElement('style');
      stl.id = CSS_ID;
      /* 兜底皮肤（皮肤管理没跑时才生效）+ 本面板布局，装在同一个 style 里 */
      stl.textContent = ((typeof KAMI_BASE_CSS === 'string') ? KAMI_BASE_CSS : '') + '\n' + LAYOUT_CSS + '\n' + TOOLBOX_LAYOUT_CSS;
      (HDOC.head || HDOC.documentElement).appendChild(stl);
      log('已注入兜底皮肤 ' + stl.textContent.length + 'B（皮肤管理在跑时自动失效）');
    } catch (e) { log('注入兜底皮肤失败：' + msgOf(e)); }
  }
  function dropCss() {
    try {
      var stl = HDOC.getElementById(CSS_ID);
      if (stl && stl.parentNode) { stl.parentNode.removeChild(stl); }
    } catch (e) { }
  }

  function tavernSingleColumn() {
    /* ① 酒馆自己的移动布局开关：body 被钉住 = 已进单栏
          （public/css/mobile-styles.css:98-102，≤1000px 时 body{position:fixed}）。
          它比「小锁被藏起来」活得长 —— 本仓库那份 1.13 的源码里已经没有藏小锁的规则，
          真机 1.18 上小锁常显会让下面的老判定误报成「非单栏」。 */
    try {
      var view0 = HDOC.defaultView || HOST;
      if (view0.getComputedStyle(HDOC.body).position === 'fixed') { return true; }
    } catch (e) { }
    var any = false;
    try {
      var ids = ['lm_button_panel_pin_div', 'rm_button_panel_pin_div'];
      var view2 = HDOC.defaultView || HOST;
      for (var i = 0; i < ids.length; i++) {
        var el = HDOC.getElementById(ids[i]);
        if (!el) { continue; }
        any = true;
        if (view2.getComputedStyle(el).display !== 'none') { return false; }
      }
    } catch (e) { }
    if (any) { return true; }
    try { return !!(HOST.matchMedia && HOST.matchMedia('(max-width: 1000px)').matches); } catch (e) { return false; }
  }
  function sheetMode() { return tavernSingleColumn(); }

  /* 打开面板时把页面滚回原点（2026-09-29 iOS 修法之二，与 30 号同一处原因）：
     舞台锚在文档原点，可视窗口漂走时面板会落在可视区外。桌面无感。 */
  function bringViewportHome() {
    try { if (HOST && typeof HOST.scrollTo === 'function') { HOST.scrollTo(0, 0); } } catch (e) { }
  }

  function restoreGeometry() {
    if (!panelRoot || !panelDrop) { return; }
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');
    if (sheetMode()) {
      panelRoot.style.removeProperty('--kami-panel-x');
      panelRoot.style.removeProperty('--kami-panel-y');
      panelRoot.style.removeProperty('--kami-panel-w');
      panelRoot.style.removeProperty('--kami-panel-h');
      return;
    }
    var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
    var w = clampNum(geom.w || PANEL_W, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - 24));
    var h = clampNum(geom.h || PANEL_H, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - 24));
    var x = (geom.x === null || geom.x === undefined) ? Math.max(12, (vw - w) / 2) : clampNum(geom.x, -40, Math.max(-40, vw - 80));
    var y = (geom.y === null || geom.y === undefined) ? 72 : clampNum(geom.y, 0, Math.max(0, vh - 48));
    panelRoot.style.setProperty('--kami-panel-w', Math.round(w) + 'px');
    panelRoot.style.setProperty('--kami-panel-h', Math.round(h) + 'px');
    panelRoot.style.setProperty('--kami-panel-x', Math.round(x) + 'px');
    panelRoot.style.setProperty('--kami-panel-y', Math.round(y) + 'px');
  }

  function buildPanel() {
    if (panelRoot) { return; }
    panelRoot = mk('div', 'kami-root');
    panelRoot.id = PANEL_ID;
    panelRoot.setAttribute('data-kami-comp', 'panel');
    panelRoot.setAttribute('data-kami-container', 'panel');
    panelRoot.style.position = 'fixed';
    panelRoot.style.inset = '0';
    panelRoot.style.zIndex = String(Z);
    panelRoot.style.pointerEvents = 'none';
    /* 舞台高度下限（2026-09-29 iOS 面板打不开的修法之一，与 30 号同一处坑）：
       窄屏下酒馆把 body 钉住 ⇒ html 盒高塌成 0 ⇒ 舞台 top:0;bottom:0 归零。
       内联兜底，dvh 不认时落回上一行 vh。 */
    panelRoot.style.minHeight = '100vh';
    panelRoot.style.minHeight = '100dvh';

    panelDrop = mk('div', 'kami-drop kami-surface');
    panelDrop.setAttribute('data-kami-open', '0');
    panelDrop.style.pointerEvents = 'auto';
    panelDrop.setAttribute('data-kami-layout', sheetMode() ? 'sheet' : 'floating');

    var head = mk('div', 'kami-head');
    panelHead = head;
    head.setAttribute('data-kami-drag', '1');
    /* 标题栏固定两行，且**零内联、零对抗**：
       第一行 = 状态点 + 标题 + 关闭（三个都是短元素，任何皮肤下都排得下，不会断行）；
       第二行 = 三个手动操作按钮（data-kami-role="head-actions"）。
       副标题（世界书名）已从标题栏撤到「压缩块」区——它就是爆行根源：flex 开了 wrap 后
       浏览器按自然宽度断行，三四十个字符不换行的世界书名会把整行顶爆（记事本下变成四行），
       而 rain 又给副标题 order:3 + flex-basis:100%。撤掉它，rain 的规则匹配不到任何元素，
       再也不需要 order/flex 归零去对抗皮肤。
       第二行的布局由 LAYOUT_CSS（只写布局的一段注入样式，先例 = 50 号 GUIDE_CSS 排版层）负责。 */
    head.appendChild(mk('span', 'kami-dot'));
    /* 装饰位（契约 §8）：与两个正则前端同形。皮肤声明了 decor 时，皮肤管理往这个空槽里注入装饰；
       没声明的皮肤由结构层的 .kami-deco{display:none} 收着，一分钱不付。 */
    var decoSlot = mk('span', 'kami-deco');
    decoSlot.setAttribute('data-kami-deco', 'd20');
    decoSlot.setAttribute('aria-hidden', 'true');
    head.appendChild(decoSlot);
    head.appendChild(mk('span', 'kami-title', '🧰 工具箱'));
    var acts = mk('span', 'kami-actions');
    var btnClose = mk('button', 'kami-icon-btn', '✕');
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', '关闭');
    btnClose.setAttribute('data-kami-act', 'close');
    acts.appendChild(btnClose);
    head.appendChild(acts);
    var headRow2 = mk('div');
    headRow2.setAttribute('data-kami-role', 'head-actions');
    var hb1 = mk('button', 'kami-btn kami-btn--ghost', COPY.grand.runNow);
    hb1.type = 'button';
    hb1.setAttribute('data-kami-act', 'run-now');
    hb1.title = COPY.grand.runHint;
    headRow2.appendChild(hb1);
    var hb2 = mk('button', 'kami-btn kami-btn--ghost', COPY.grand.unhideAll);
    hb2.type = 'button';
    hb2.setAttribute('data-kami-act', 'unhide-all');
    headRow2.appendChild(hb2);
    var hb3 = mk('button', 'kami-btn kami-btn--ghost', COPY.grand.clearData);
    hb3.type = 'button';
    hb3.setAttribute('data-kami-act', 'clear-data');
    headRow2.appendChild(hb3);
    panelDrop.appendChild(head);
    panelDrop.appendChild(buildToolboxTabs());
    var compressPane = createToolboxPane('compress', false);
    headRow2.className = 'kami-toolbox-actions';
    compressPane.appendChild(headRow2);

    bodyEl = mk('div', 'kami-body kami-scroll');
    bodyEl.setAttribute('data-kami-pane', 'main');
    bodyEl.style.touchAction = 'pan-y';
    compressPane.appendChild(bodyEl);
    panelDrop.appendChild(compressPane);
    panelDrop.appendChild(createToolboxPane('search', true));
    panelDrop.appendChild(createToolboxPane('other', true));

    var foot = mk('div', 'kami-foot');
    var stl = mk('span', 'kami-sub');
    stl.setAttribute('data-kami-role', STATUS_ROLE);
    foot.appendChild(stl);
    panelDrop.appendChild(foot);

    var rz = mk('span', 'kami-resize');
    rz.setAttribute('data-kami-act', 'resize');
    rz.setAttribute('aria-hidden', 'true');
    panelDrop.appendChild(rz);

    panelRoot.appendChild(panelDrop);
    HDOC.body.appendChild(panelRoot);

    injectCss();
    restoreGeometry();
    bindPanelEvents();
    renderContent();
    setToolboxTab(toolboxTab, false);
    log('面板已创建（' + (sheetMode() ? '窄屏抽屉' : '桌面悬浮窗') + '）');
  }

  /* ── 面板内容（数据变了就整片重画正文；几何与手势不动） ── */

  /* @@KAMI_COMPRESS_UI@@ */

  function toggleModelMode(mode){ return compressLlmEditor.mode(mode); }
  function applyModelInput(field, value){ return compressLlmEditor.modelInput(field, value); }
  function saveConfigAs(name){ return compressLlmEditor.saveConfig(name); }
  function deleteCurrentConfig(){ return compressLlmEditor.deleteConfig(); }
  /* 酒馆「连接配置」直接拿来用（不复制、不落地）。
     名单从酒馆的 extension_settings.connectionManager.profiles 只读；真正请求时，
     把选中那套的「源格式 / 地址 / 模型」临时套到活的 oai_settings 上，跑完立刻还原。
     这样接口格式、地址、模型全按酒馆原班人马处理，密钥也走酒馆自己那份。 */
  function tavernCCProfiles() {
    var out = [];
    try {
      var ctx = stCtx();
      var list = ctx && ctx.extensionSettings && ctx.extensionSettings.connectionManager && ctx.extensionSettings.connectionManager.profiles;
      if (Array.isArray(list)) {
        for (var i = 0; i < list.length; i++) {
          var pf = list[i];
          if (pf && pf.mode !== 'tc' && typeof pf.name === 'string') { out.push(pf); }
        }
      }
    } catch (e) { }
    return out;
  }
  function findTavernProfile(name) {
    var list = tavernCCProfiles();
    for (var i = 0; i < list.length; i++) { if (list[i].name === name) { return list[i]; } }
    return null;
  }
  /* 借用：把选中配置的源格式/地址/模型临时写进活的 oai_settings——只动内存，
     不保存、不碰预设文件，跑完 fn 立刻还原。主生成此刻正等着我们
     （GENERATION_STARTED 是 await 的），不会有并发生成读到临时值。 */
  var profileQueue = Promise.resolve();
  function withTavernProfile(name, fn) {
    var task = profileQueue.then(function () { return applyTavernProfile(name, fn); });
    profileQueue = task.catch(function () {});
    return task;
  }
  async function applyTavernProfile(name, fn) {
    var ctx = stCtx();
    var s = settingsOf(ctx);
    var pf = findTavernProfile(name);
    if (!ctx || !s || !pf) {
      if (name) { toast('warning', COPY.model.pickMissing.replace('{name}', name)); }
      return await fn();
    }
    /* 酒馆按来源读取 custom_model / deepseek_model 等字段，model 只是兼容字段。 */
    var source = pf.api || s.chat_completion_source;
    var modelField = source && /^[a-z_]+$/.test(source) ? (source === 'makersuite' ? 'google' : source) + '_model' : null;
    var keys = ['chat_completion_source', 'reverse_proxy', 'custom_url', 'model'];
    if (modelField) { keys.push(modelField); }
    var old = {};
    var owned = {};
    var applied = {};
    for (var i = 0; i < keys.length; i++) { old[keys[i]] = s[keys[i]]; owned[keys[i]] = Object.prototype.hasOwnProperty.call(s, keys[i]); }
    try {
      if (pf.api) { s.chat_completion_source = pf.api; }
      if (pf.model) { s.model = pf.model; if (modelField) { s[modelField] = pf.model; } }
      var url = (typeof pf['api-url'] === 'string') ? pf['api-url'] : '';
      if (url) {
        if (pf.api === 'custom') { s.custom_url = url; } else { s.reverse_proxy = url; }
      }
      for (var a = 0; a < keys.length; a++) { applied[keys[a]] = s[keys[a]]; }
      return await fn();
    } finally {
      for (var j = 0; j < keys.length; j++) { if (s[keys[j]] === applied[keys[j]]) { if (owned[keys[j]]) { s[keys[j]] = old[keys[j]]; } else { delete s[keys[j]]; } } }
      log('已还原酒馆连接设置（' + name + '）');
    }
  }
  /* 从接口拉模型列表：走酒馆服务端的 /status（各源按它的字段要求给地址与密钥）。 */
  var modelListCache = {};   // 配置名 -> [模型名]
  var fetchState = 'idle';   // idle | busy
  var modelFetchSeq = 0, modelFetchAbort = null;
  function modelConfigKey(cur) { return JSON.stringify([cur.source, cur.apiurl, cur.key]); }
  function cachedModelList(cur) {
    var item = modelListCache[cur.name];
    return item && item.key === modelConfigKey(cur) ? item.ids : null;
  }
  function invalidateModelList(name) {
    delete modelListCache[name];
    modelFetchSeq++;
    if (modelFetchAbort) { modelFetchAbort.abort(); modelFetchAbort = null; }
    fetchState = 'idle';
    var button = bodyEl && bodyEl.querySelector('[data-kami-act="fetch-models"]');
    if (button) { button.disabled = false; button.textContent = COPY.model.fetchModels; }
  }
  function modelListRequest(cur) {
    var defaults = { openai: 'https://api.openai.com/v1', claude: 'https://api.anthropic.com/v1',
      makersuite: 'https://generativelanguage.googleapis.com', deepseek: 'https://api.deepseek.com',
      xai: 'https://api.x.ai/v1', openrouter: 'https://openrouter.ai/api/v1' };
    var source = cur.source || 'custom', base = String(cur.apiurl || defaults[source] || '').trim().replace(/\/+$/, '');
    if (!base) { throw new Error('请先填写接口根地址，例如 https://服务地址/v1'); }
    var url;
    try { url = new URL(base); } catch (e) { throw new Error('接口地址无效，请填写以 http:// 或 https:// 开头的完整地址'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') { throw new Error('接口地址必须使用 http:// 或 https://'); }
    if (url.username || url.password) { throw new Error('请把密钥填在密钥栏，接口地址不能包含用户名或密码'); }
    /* 模型列表总是取根地址；也兼容误粘贴的聊天请求路径。 */
    url.pathname = url.pathname.replace(/\/(?:chat\/completions|messages|models)\/?$/, '').replace(/\/+$/, '');
    url.search = ''; url.hash = '';
    var headers = { Authorization: 'Bearer ' + String(cur.key || '').trim() };
    if (source === 'claude') {
      headers['x-api-key'] = String(cur.key || '').trim();
      headers['anthropic-version'] = '2023-06-01';
    } else if (source === 'azure_openai') {
      /* Azure v1 的模型目录不需要部署名或 api-version，走标准 /models。 */
      var beforeOpenai = url.pathname.split('/openai')[0];
      url.pathname = beforeOpenai + '/openai/v1';
      headers['api-key'] = String(cur.key || '').trim();
    }
    base = url.toString().replace(/\/+$/, '');
    /* Gemini 由酒馆转换 models/foo 名字；其余来源走 custom，以独立密钥为准。 */
    if (source === 'makersuite') {
      return { chat_completion_source: 'makersuite', reverse_proxy: base.replace(/\/(?:v1|v1beta)$/, ''), proxy_password: String(cur.key || '').trim() };
    }
    /* JSON 是 YAML 的子集，避免特殊字符把自定义头串成额外字段。 */
    return { chat_completion_source: 'custom', custom_url: base, custom_include_headers: JSON.stringify(headers) };
  }
  async function modelListHeaders(requestFetch) {
    var ctx = stCtx();
    if (ctx && typeof ctx.getRequestHeaders === 'function') { return ctx.getRequestHeaders(); }
    if (HOST && typeof HOST.getRequestHeaders === 'function') { return HOST.getRequestHeaders(); }
    var resp = await requestFetch('/csrf-token', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok) { throw new Error('读取酒馆校验码失败（HTTP ' + resp.status + '），请刷新页面后重试'); }
    var data = await resp.json();
    if (!data || typeof data.token !== 'string') { throw new Error('读取酒馆校验码失败，请刷新页面后重试'); }
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': data.token };
  }
  async function fetchLlmModelCatalog(config, signal) {
    var requestFetch = HOST && typeof HOST.fetch === 'function' ? HOST.fetch.bind(HOST) : fetch;
        var headers = await modelListHeaders(requestFetch);
        var resp = await requestFetch('/api/backends/chat-completions/status', {
          method: 'POST', headers: headers, credentials: 'same-origin', cache: 'no-store',
          signal: signal, body: JSON.stringify(modelListRequest(config))
        });
        var json = null;
        try { json = await resp.json(); } catch (e) { }
        if (!resp.ok || (json && json.error)) {
          var detail = json && ((json.error && json.error.message) || json.message || (typeof json.error === 'string' ? json.error : ''));
          throw new Error('HTTP ' + resp.status + (detail ? '：' + String(detail).slice(0, 240) : '：接口拒绝了请求，请检查地址和密钥'));
        }
        if (!json || !Array.isArray(json.data)) { throw new Error('接口返回格式不正确，没有模型列表 data 数组'); }
        return json;

  }
  async function fetchModelList() {
    if (disposed || fetchState === 'busy') { return; }
    var cur = currentSumConfig();
    if (!cur) { return; }
    var config = Object.assign({}, cur), seq = ++modelFetchSeq, key = modelConfigKey(config);
    var requestFetch = HOST && typeof HOST.fetch === 'function' ? HOST.fetch.bind(HOST) : fetch;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    modelFetchAbort = controller;
    fetchState = 'busy';
    if (panelRoot) { renderContent(); }   // 按钮进「获取中…」并禁用
    var timeout = null;
    try {
      var body = modelListRequest(config);
      var work = fetchLlmModelCatalog(config, controller ? controller.signal : undefined);
      var deadline = new Promise(function (_, reject) {
        timeout = setTimeout(function () { if (controller) { controller.abort(); } reject(new Error('获取超时（30 秒），请检查接口连接后重试')); }, 30000);
      });
      var json = await Promise.race([work, deadline]);
      if (disposed || seq !== modelFetchSeq || modelConfigKey(config) !== key) { return; }
      var ids = json.data.map(function (m) { return String(typeof m === 'string' ? m : (m && (m.id || m.name)) || '').trim(); }).filter(Boolean);
      ids = Array.from(new Set(ids)).sort();
      if (!ids.length) { toast('warning', COPY.model.fetchEmpty); return; }
      modelListCache[config.name] = { key: key, ids: ids };
      toast('success', ids.length + ' 个模型' + (json.has_more ? '（接口还有后续分页，可手动填写其他模型名）' : ''));
    } catch (e) {
      if (!disposed && seq === modelFetchSeq) {
        var message = msgOf(e);
        if (config.key) { message = message.split(config.key).join('[密钥已隐藏]'); }
        toast('error', COPY.model.fetchFail.replace('{err}', message));
      }
    } finally {
      if (timeout !== null) { clearTimeout(timeout); }
      if (seq === modelFetchSeq) { modelFetchAbort = null; fetchState = 'idle'; if (!disposed) { renderContent(); } }
    }
  }

  function applyPromptChange(list, pi, pf, value){ return compressLlmEditor.promptChange(list, pi, pf, value); }
  function addPromptEntry(list){ return compressLlmEditor.addPrompt(list); }
  function removePromptEntry(list, idx){ return compressLlmEditor.removePrompt(list, idx); }
  function resetTask(){ return compressLlmEditor.resetTask(); }
  function switchPromptTpl(name){ return compressLlmEditor.switchTemplate(name); }
  function savePromptTplAs(name){ return compressLlmEditor.saveTemplate(name); }
  function deletePromptTpl(){ return compressLlmEditor.deleteTemplate(); }
  /* 数字输入统一写回：depth 写正则，其余写 cfg。
     **不整片重画面板**（交接铁律）：写完后只把夹取后的值回填进输入框、刷状态栏，
     焦点与光标都不丢。el 是触发变化的那个 input。 */
  async function applyNum(key, value, el) {
    var v = Number(value);
    if (!isFinite(v)) { toast('warning', COPY.toasts.numBad); if (el) { el.value = ''; } return; }
    var fixed = null;
    try {
      if (key === 'depth') {
        var d = Math.max(0, Math.min(999, Math.floor(v)));
        await writeRollRegex(undefined, d);
        fixed = d;
      } else if (key === 'threshold') {
        cfg.threshold = Math.max(1000, Math.min(4000000, Math.floor(v)));
        fixed = cfg.threshold;
        saveVars();
      } else if (key === 'keep') {
        cfg.keep = Math.max(1, Math.min(500, Math.floor(v)));
        fixed = cfg.keep;
        saveVars();
        await syncBlockDepths('保留楼数变化');
      } else if (key === 'chunk') {
        cfg.chunk = Math.max(1, Math.min(200, Math.floor(v)));
        fixed = cfg.chunk;
        saveVars();
      } else if (key === 'pin') {
        return;   // 楼层号不走 change（由添加/移除按钮处理）
      }
      lastError = null;
    } catch (e) {
      lastError = msgOf(e);
      toast('error', COPY.toasts.writeFail.replace('{err}', msgOf(e)));
    }
    if (el && fixed !== null && el.value !== String(fixed)) { el.value = String(fixed); }
    renderStatus();
  }
  async function toggleMode(which) {
    try {
      if (which === 'roll') {
        var info = rollInfo();
        if (!info.ok) { throw new Error(info.error); }
        await writeRollRegex(!info.enabled, undefined);
      } else {
        cfg.grandOn = !cfg.grandOn;
        saveVars();
        if (cfg.grandOn) { toast('info', COPY.toasts.grandOn.replace('{n}', cfg.threshold)); }
      }
      lastError = null;
    } catch (e) {
      lastError = msgOf(e);
      toast('error', COPY.toasts.toggleFail.replace('{err}', msgOf(e)));
    }
    renderContent();
    renderStatus();
  }
  async function addPin(v, remove) {
    var stamp = chatStamp();
    var len = chatLen();
    /* 空值/非数字先拦掉：Number('') === 0 会混进一条 #0（用户真机点过） */
    if (v === '' || v === null || v === undefined || String(v).trim() === '') { toast('warning', COPY.toasts.numBad); return; }
    var n = Math.floor(Number(v));
    if (!isFinite(n) || n < 0 || (len && n > len - 1)) { toast('warning', COPY.toasts.pinRange.replace('{n}', Math.max(0, len - 1))); return; }
    if (!pipeline.running) { await loadChatState(); }
    requireChat(stamp);
    var at = st.pins.indexOf(n);
    if (remove) {
      if (at < 0) { toast('info', COPY.toasts.pinMissing.replace('{n}', n)); return; }
      st.pins.splice(at, 1);
    } else {
      if (at >= 0) { toast('info', COPY.toasts.pinDup.replace('{n}', n)); return; }
      st.pins.push(n);
      st.pins.sort(function (a, b) { return a - b; });
    }
    try { await saveChatState(); } catch (e) { toast('error', COPY.toasts.pinSaveFail.replace('{err}', msgOf(e))); return; }
    requireChat(stamp);
    await syncBlockDepths('例外楼层变化');
    toast('success', (remove ? COPY.toasts.pinRemoved : COPY.toasts.pinAdded).replace('{n}', n));
    renderContent();
    renderStatus();
  }

  /* ── 面板事件（照 40-预设设置.js 的 pointer 分段结构，无 tab 行） ── */

  function bindPanelEvents() {
    panelDrop.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== panelDrop) {
        if (t.getAttribute) {
          var act = t.getAttribute('data-kami-act');
          if (act === 'close') { setOpen(false); return; }
          if (t.getAttribute('data-kami-cmode')) { toggleMode(t.getAttribute('data-kami-cmode')); return; }
          if (t.getAttribute('data-kami-model-mode')) { toggleModelMode(t.getAttribute('data-kami-model-mode')); return; }
          if (act === 'fetch-models') { fetchModelList(); return; }
          if (act === 'config-save-as') {
            var nameInput = bodyEl.querySelector('[data-kami-mi="__name"]');
            saveConfigAs(nameInput ? nameInput.value : '');
            return;
          }
          if (act === 'config-del') { deleteCurrentConfig(); return; }
          if (act === 'tpl-save-as') {
            var tplInput = bodyEl.querySelector('[data-kami-pt="__name"]');
            savePromptTplAs(tplInput ? tplInput.value : '');
            return;
          }
          if (act === 'tpl-del') { deletePromptTpl(); return; }
          if (act === 'prompt-add') { addPromptEntry(t.getAttribute('data-kami-prompt')); return; }
          if (act === 'prompt-del') { removePromptEntry(t.getAttribute('data-kami-prompt'), Number(t.getAttribute('data-kami-pi'))); return; }
          if (act === 'task-reset') { resetTask(); return; }
          if (act === 'run-now') { runPipeline('manual'); return; }
          if (act === 'blocks-refresh') { refreshState('手动刷新').catch(function (e) { toast('error', msgOf(e)); }); return; }
          if (act === 'repair-orphans') { repairOrphans().catch(function (e) { toast('error', msgOf(e)); }); return; }
          if (act === 'unhide-all') { unhideAll().catch(function (e) { toast('error', msgOf(e)); }); return; }
          if (act === 'clear-data') {
            /* 删除性操作：两段式确认（第一次点变成待确认，4 秒内再点才执行）。
               句柄存起来，注销时清掉（R1：原来 4 秒定时器没处可收）。 */
            if (t.getAttribute('data-kami-armed') === '1') {
              t.removeAttribute('data-kami-armed');
              t.textContent = COPY.grand.clearData;
              clearChatData().catch(function (e) { toast('error', msgOf(e)); });
            } else {
              t.setAttribute('data-kami-armed', '1');
              t.textContent = COPY.grand.clearArmed;
              try { if (armTimer) { clearTimeout(armTimer); } } catch (e) { }
              armTimer = setTimeout(function () {
                armTimer = null;
                if (t.isConnected && t.getAttribute('data-kami-armed') === '1') {
                  t.removeAttribute('data-kami-armed');
                  t.textContent = COPY.grand.clearData;
                }
              }, 4000);
            }
            return;
          }
          if (act === 'toggle-entry') {
            var info = summaryInfo();
            if (info.ok) {
              writeSummaryEntry(!info.enabled).then(function () { renderContent(); renderStatus(); })
                .catch(function (e) { toast('error', msgOf(e)); });
            }
            return;
          }
          if (act === 'pin-add' || act === 'pin-del') {
            var input = bodyEl.querySelector('[data-kami-var="pin"]');
            if (input) { addPin(input.value, act === 'pin-del').then(function () { input.value = ''; }); }
            return;
          }
          /* 例外楼层小标签：整枚就是「移除这枚」（含键盘 Enter/Space，见下方 keydown） */
          if (t.getAttribute && t.getAttribute('data-kami-pin')) { addPin(t.getAttribute('data-kami-pin'), true); return; }
        }
        t = t.parentNode;
      }
    });

    panelDrop.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) { return; }
      if (t.getAttribute('data-kami-var')) { applyNum(t.getAttribute('data-kami-var'), t.value, t); return; }
      if (t.getAttribute('data-kami-mi')) { applyModelInput(t.getAttribute('data-kami-mi'), t.value); return; }
      if (t.getAttribute('data-kami-pt') === '__tpl') { switchPromptTpl(t.value); return; }
      if (t.getAttribute('data-kami-prompt')) {
        applyPromptChange(t.getAttribute('data-kami-prompt'), Number(t.getAttribute('data-kami-pi') || 0), t.getAttribute('data-kami-pf'), t.value);
      }
    });
    panelDrop.addEventListener('keydown', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) { return; }
      var isEnter = (ev.key === 'Enter' || ev.keyCode === 13);
      var isSpace = (ev.key === ' ' || ev.key === 'Spacebar' || ev.keyCode === 32);
      /* 例外楼层小标签的键盘可达（role=button + tabindex=0 的那枚） */
      if (t.getAttribute('data-kami-pin') && (isEnter || isSpace)) {
        ev.preventDefault();
        addPin(t.getAttribute('data-kami-pin'), true);
        return;
      }
      if (isEnter && t.getAttribute('data-kami-var')) { ev.preventDefault(); applyNum(t.getAttribute('data-kami-var'), t.value, t); }
    });

    panelDrop.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === 'mouse') { return; }
      var t = ev.target, mode = null;
      while (t && t !== panelDrop) {
        if (t.getAttribute) {
          if (t.getAttribute('data-kami-drag')) { mode = 'move'; break; }
          if (t.getAttribute('data-kami-act') === 'resize') { mode = 'size'; break; }
        }
        t = t.parentNode;
      }
      if (!mode) { return; }
      if (sheetMode() && (mode === 'move' || mode === 'size')) { return; }
      if (mode === 'move' && ev.target.closest && ev.target.closest('button')) { return; }
      var r = panelDrop.getBoundingClientRect();
      panelDrag = { mode: mode, sx: ev.clientX, sy: ev.clientY, l: r.left, t: r.top, w: r.width, h: r.height, moved: 0, pointerId: ev.pointerId };
      try { panelDrop.setPointerCapture(ev.pointerId); } catch (e) { }
      ev.preventDefault();
    });
    panelDrop.addEventListener('pointermove', function (ev) {
      if (!panelDrag) { return; }
      var dx = ev.clientX - panelDrag.sx, dy = ev.clientY - panelDrag.sy;
      panelDrag.moved = Math.max(panelDrag.moved, Math.abs(dx) + Math.abs(dy));
      var vw = HDOC.documentElement.clientWidth, vh = HDOC.documentElement.clientHeight;
      if (panelDrag.mode === 'move') {
        geom.x = Math.round(clampNum(panelDrag.l + dx, -40, Math.max(-40, vw - 80)));
        geom.y = Math.round(clampNum(panelDrag.t + dy, 0, Math.max(0, vh - 48)));
        panelRoot.style.setProperty('--kami-panel-x', geom.x + 'px');
        panelRoot.style.setProperty('--kami-panel-y', geom.y + 'px');
      } else if (panelDrag.mode === 'size') {
        geom.w = Math.round(clampNum(panelDrag.w + dx, PANEL_MIN_W, Math.max(PANEL_MIN_W, vw - 24)));
        geom.h = Math.round(clampNum(panelDrag.h + dy, PANEL_MIN_H, Math.max(PANEL_MIN_H, vh - 24)));
        panelRoot.style.setProperty('--kami-panel-w', geom.w + 'px');
        panelRoot.style.setProperty('--kami-panel-h', geom.h + 'px');
      }
    });
    panelDrop.addEventListener('pointerup', function (ev) {
      var was = panelDrag ? panelDrag.mode : null;
      if (panelDrag && (was === 'move' || was === 'size')) { saveVars(); }
      panelDrag = null;
      try { panelDrop.releasePointerCapture(ev.pointerId); } catch (e) { }
    });
    panelDrop.addEventListener('pointercancel', function () {
      if (panelDrag && (panelDrag.mode === 'move' || panelDrag.mode === 'size')) { saveVars(); }
      panelDrag = null;
    });

    if (GESTURES) { try { GESTURES.destroy(); } catch (e) { } }
    GESTURES = bindPanelGestures({
      root: panelDrop,
      handle: function () { return panelHead; },
      pane: activeToolboxPane,
      tabs: function () { return toolboxTabsBar; },
      onStep: stepToolboxTab,
      isSheet: sheetMode,
      onClose: function () { setOpen(false); }
    });
  }

  function renderStatus() {
    if (!panelDrop) { return; }
    var sub = panelDrop.querySelector('[data-kami-role="src"]');
    var stl = panelDrop.querySelector('[data-kami-role="' + STATUS_ROLE + '"]');
    var roll = rollInfo();
    if (sub) {
      sub.textContent = st.lbName || '聊天未绑世界书';
    }
    if (!stl) { return; }
    var parts = [];
    parts.push('滚动 ' + (roll.ok ? (roll.enabled ? '开·深' + roll.minDepth : '关') : '✕'));
    parts.push('超限 ' + (cfg.grandOn ? '开' : '关'));
    if (measure.last && measure.last.total) { parts.push('实测 ' + fmtK(measure.last.total)); }
    if (st.blocks.length) { parts.push('块' + st.blocks.length + '→' + st.covered + '楼'); }
    if (pipeline.running) { parts.push('总结中 ' + pipeline.done + '/' + pipeline.total); }
    if (lastError) { parts.push('⚠'); }
    /* 这一行必须短：.kami-sub 是 nowrap，长文字会被面板裁掉。完整数字看 KamiSummarize.status()。 */
    stl.textContent = parts.join(' ｜ ');
    renderToolboxStatus(stl);
  }
  function fmtK(n) {
    if (n >= 10000) { return Math.round(n / 1000) + 'k'; }
    if (n >= 1000) { return (Math.round(n / 100) / 10) + 'k'; }
    return String(n);
  }

  function setOpen(v) {
    if (disposed) { return; }
    if (!panelRoot) { buildPanel(); }
    var open = !!v;
    panelDrop.setAttribute('data-kami-open', open ? '1' : '0');
    panelRoot.style.display = open ? '' : 'none';
    if (open) {
      restoreGeometry();
      bringViewportHome();
      /* 每次打开都重新对账：你在世界书里手改过正文的话，面板进来就是最新的 */
      (toolboxTab === 'compress' ? refreshState('open') : Promise.resolve()).catch(function (e) { log('打开面板时读状态失败：' + msgOf(e)); });
      renderStatus();
    }
  }
  function openPanel() { openToolbox('compress'); }
  function closePanel() { setOpen(false); }
  function isOpen() { return !!(panelDrop && panelDrop.getAttribute('data-kami-open') === '1'); }
  function togglePanel() { if (isOpen() && toolboxTab === 'compress') { closePanel(); } else { openPanel(); } }

  /* ───────── 登记按钮 ───────── */

  function updateDef() {
    if (MANUAL_SEARCH_UI) { MANUAL_SEARCH_UI.ping(); }
    if (!ownDef) { return; }
    try { if (HOST.__hub && typeof HOST.__hub.paint === 'function') { HOST.__hub.paint(); } } catch (e) { }
  }
  function registerButton() {
    try {
      var w = HOST;
      var defs = w.__hubDefs || (w.__hubDefs = []);
      for (var i = defs.length - 1; i >= 0; i -= 1) {
        if (defs[i] && defs[i].name === HUB_NAME) { defs.splice(i, 1); }
      }
      ownDef = {
        name: HUB_NAME,
        order: HUB_ORDER,
        tip: COPY.hubTip,
        ping: Date.now(),
        alive: function () { return !disposed; },
        label: function () {
          return HUB_NAME + (pipeline.running ? '·总结中 ' + pipeline.done + '/' + pipeline.total : '') + (lastError ? '⚠' : '');
        },
        ready: function () { return true; },
        absent: COPY.hubAbsent,
        click: function () { toggleToolbox(); }
      };
      defs.push(ownDef);
      try {
        var ev = w.document.createEvent('Event');
        ev.initEvent('kami-hub-def', false, false);
        w.dispatchEvent(ev);
      } catch (e) { }
      log('已向按钮中转站登记按钮 ' + HUB_NAME);
    } catch (e) {
      console.warn('[压缩] 向中转站登记按钮失败（可用控制台 KamiSummarize.open() 手动打开）', e);
    }
  }

  /* ───────── 全局 API ───────── */

  function status() {
    var roll = rollInfo(), info = summaryInfo();
    return {
      version: VERSION,
      grandOn: cfg.grandOn, threshold: cfg.threshold, keep: cfg.keep, chunk: cfg.chunk,
      roll: roll, summaryEntry: info,
      lorebook: st.lbName, blocks: st.blocks.length, covered: st.covered, pins: st.pins.slice(),
      pending: st.pending.map(function (p) { return p.from + '-' + p.to; }),
      orphan: st.orphan.map(function (p) { return p.from + '-' + p.to; }),
      suspect: st.suspect.length, dup: st.dup.length,
      hiddenByUs: st.hiddenByUs.length, schemaMode: schemaMode,
      measured: measure.last, pipeline: { running: pipeline.running, done: pipeline.done, total: pipeline.total },
      lastError: lastError,
      panelOpen: isOpen(), regexWrites: regexWrites, entryWrites: entryWrites, disposed: disposed
    };
  }
  function inspect() {
    return {
      cfg: JSON.parse(JSON.stringify(cfg)),
      state: {
        lbName: st.lbName, covered: st.covered, pins: st.pins.slice(), updatedAt: st.updatedAt,
        error: st.error || null, adopted: !!st.adopted, notice: st.notice.slice(),
        pending: JSON.parse(JSON.stringify(st.pending)), orphan: JSON.parse(JSON.stringify(st.orphan)),
        dup: st.dup.slice(), hiddenByUs: st.hiddenByUs.slice(), schemaMode: schemaMode,
        blocks: st.blocks.map(function (b) { return { from: b.from, to: b.to, at: b.at, uid: b.uid, depth: b.depth, chars: b.text.length, suspect: looksLikeProviderError(b.text) }; })
      },
      blockTexts: st.blocks.map(function (b) { return b.text; })
    };
  }
  function expose() {
    var api = {
      version: VERSION,
      open: openPanel, close: closePanel, toggle: togglePanel,
      status: status, inspect: inspect,
      runOnce: function () { return runPipeline('manual'); },
      setRolling: async function (on, depth) {
        var r = await writeRollRegex(on, depth);
        renderContent(); renderStatus();
        return r;
      },
      setGrand: function (on) { cfg.grandOn = !!on; saveVars(); renderContent(); renderStatus(); return cfg.grandOn; },
      addPin: function (n) { return addPin(n, false); },
      removePin: function (n) { return addPin(n, true); },
      unhideAll: function () { return unhideAll(); },
      clearChatData: function () { return clearChatData(); },
      refresh: function () { return refreshState('manual'); },
      repairOrphans: function () { return repairOrphans(); },
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
    exposeToolbox();
  }

  /* ───────── 注销（零残留；压缩成果照章留在聊天里） ───────── */

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    disposeToolboxServices();
    modelFetchSeq++;
    if (modelFetchAbort) { modelFetchAbort.abort(); modelFetchAbort = null; }
    log('正在注销：摘事件 / 停实测钩子 / 拆面板 / 收样式 / 撤登记 / 删全局');
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    try { if (armTimer) { clearTimeout(armTimer); armTimer = null; } } catch (e) { }   /* R1：两段确认的 4 秒定时器 */
    try { if (wiSyncTimer) { clearTimeout(wiSyncTimer); wiSyncTimer = null; } } catch (e) { }   /* 世界书同步的 400ms 防抖 */
    for (var i = 0; i < unsubs.length; i++) { try { if (unsubs[i] && unsubs[i].stop) { unsubs[i].stop(); } } catch (e) { } }
    unsubs = [];
    disposeMeasureHook();
    try { if (resizeHandler) { HOST.removeEventListener('resize', resizeHandler); } } catch (e) { }
    resizeHandler = null;
    try { if (hideHandler) { window.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    try { if (hideHandler && HOST !== window) { HOST.removeEventListener('pagehide', hideHandler); } } catch (e) { }
    hideHandler = null;
    dropCss();
    /* R3：拖动中注销，把指针捕获放掉（节点随后移除，但捕获先撒手更干净） */
    try { if (panelDrag && panelDrop && panelDrag.pointerId !== undefined) { panelDrop.releasePointerCapture(panelDrag.pointerId); } } catch (e) { }
    panelDrag = null;
    try { if (GESTURES) { GESTURES.destroy(); } } catch (e) { }
    GESTURES = null;
    try { if (panelRoot && panelRoot.parentNode) { panelRoot.parentNode.removeChild(panelRoot); } } catch (e) { }
    panelRoot = null; panelDrop = null; panelHead = null; bodyEl = null;
    try {
      var defs = HOST.__hubDefs || [];
      for (var j = defs.length - 1; j >= 0; j -= 1) {
        if (defs[j] === ownDef || (defs[j] && defs[j].name === HUB_NAME)) { defs.splice(j, 1); }
      }
      if (HOST.__hub && typeof HOST.__hub.unregister === 'function') { HOST.__hub.unregister(HUB_NAME); }
    } catch (e) { }
    ownDef = null;
    try { if (HOST[API_NAME]) { delete HOST[API_NAME]; } } catch (e) { }
    try { if (window[API_NAME]) { delete window[API_NAME]; } } catch (e) { }
    log('注销完成：面板、样式、登记、实测钩子、全局 API 都已收回；世界书条目、隐藏楼层、正则状态按设计保持原样');
  }

  /* ───────── 启动 ───────── */

  function boot() {
    log('启动 v' + VERSION + '（手势与兜底皮肤已内联）');
    readVars();
    loadChatState().then(function () { renderStatus(); }).catch(function (e) { if (!e.chatCancelled) { log(msgOf(e)); } });
    installMeasureHook();

    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      try { unsubs.push(eventOn(tavern_events.GENERATION_STARTED, onGenerationStarted)); } catch (e) { log('挂生成事件失败：' + msgOf(e)); }
      try { unsubs.push(eventOn(tavern_events.CHAT_CHANGED, onChatChanged)); } catch (e) { }
      try { unsubs.push(eventOn(tavern_events.MESSAGE_DELETED, onMessagesChanged)); } catch (e) { }
      /* 世界书条目被改动（ST 1.18 世界书面板是输入即存，1 秒防抖后发这个事件）：
         面板跟着刷新，用户手改的块正文立刻反映出来。 */
      try {
        if (tavern_events.WORLDINFO_UPDATED) { unsubs.push(eventOn(tavern_events.WORLDINFO_UPDATED, onWorldInfoUpdated)); }
      } catch (e) { log('挂世界书事件失败（面板刷新按钮仍可用）：' + msgOf(e)); }
    } else {
      log('拿不到 eventOn/tavern_events：自动触发不可用（面板的手动触发不受影响）');
    }

    expose();
    initToolboxServices();
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); if (SEARCH) { SEARCH.syncTask(); } if (MANUAL_SEARCH_UI) { MANUAL_SEARCH_UI.ping(); } } }, 2500);
    resizeHandler = function () {
      if (!panelDrop) { return; }
      restoreGeometry();
      if (isOpen()) { renderStatus(); }
    };
    try { HOST.addEventListener('resize', resizeHandler); } catch (e) { }
    hideHandler = function () { try { teardown('脚本关闭'); } catch (e) { } };
    try { window.addEventListener('pagehide', hideHandler); } catch (e) { }
    if (HOST !== window) { try { HOST.addEventListener('pagehide', hideHandler); } catch (e) { } }
    log('就绪：' + JSON.stringify({
      grandOn: cfg.grandOn, threshold: cfg.threshold, keep: cfg.keep, chunk: cfg.chunk,
      blocks: st.blocks.length, covered: st.covered, pins: st.pins.length
    }));
  }

  try { boot(); } catch (e) { console.error('[压缩] 启动失败', e); }
})();
