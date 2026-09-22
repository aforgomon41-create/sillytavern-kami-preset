/* ============================================================
 * 📜 压缩   v1.1
 * 酒馆助手（TavernHelper / JS-Slash-Runner 4.9.5）脚本
 * ------------------------------------------------------------
 * v1.1（2026-09-21，并入主任务线）：摘要提示词支持多模板；四个控件类名迁到
 * 契约 §4.2 新登记的 `.kami-text` / `.kami-select` / `.kami-textarea`
 * （此前借用数字框的 `.kami-number`，被那条 `text-align:right` 带成了右对齐）。
 *
 * 长上下文压缩的中转面板。两个模式**并存**（可以同时开，但不建议），
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

  var VERSION = '1.1';
  var HUB_NAME = '📜 压缩';
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
    '## 输出格式（严格遵守，只输出以下内容）',
    '时间线：[本块覆盖的时间跨度与场景转移]',
    '本块剧情：',
    '[300-600 字第三人称叙述式总结，须覆盖：核心事件及其因果、人物关系与情绪的变化、重要对话得出的结论、地点与物品的转移]',
    '关键变化：',
    '- [人物状态、关系或立场的改变]',
    '- [物品、地点、时间线的推进]',
    '- [尚未解决、后续必须回收的伏笔]',
    '',
    '## 写作规则',
    '- 与历史压缩块自然衔接：已写过的信息不重复，只写增量与变化；',
    '- 对话概括为转述，但约定、承诺、威胁、转折这类关键台词必须保留原意；',
    '- 人名、称谓、专有名词沿用原文写法，不要改译或简写；',
    '- 楼层里的 XML 标签（<summary>、<options> 等）是格式残留，一律忽略；',
    '- 状态要具体：伤势、持有物、金钱、时间点宁可写细，不要含糊带过；',
    '- 本块结尾悬而未决的情节点，必须在「关键变化」里单列一条；',
    '- 不要开场白、解释或代码块标记，直接从「时间线：」开始输出。',
    '</compress_task>'
  ].join('\n');

  /* ── 面板文案（唯一出处；改文案只动这张表） ──
     {x} {n} {a} {b} {c} {err} {lb} 是占位符，润色时必须原样保留。 */
  var COPY = {
    "hubTip": "压缩：滚动压缩 / 超限压缩（点击展开）",
    "hubAbsent": "压缩脚本未就绪",
    "mode": {
      "section": "模式",
      "rollTitle": "滚动压缩",
      "rollDepthLine": "起始深度 {n}",
      "rollNote": "按楼层深度把旧楼替换为摘要，改动即时写入正则「压缩|摘要/设定」。可与超限压缩同时开，但不建议。",
      "grandTitle": "超限压缩（大总结）",
      "grandNote": "平时不压缩。发送 token 达到上限时自动分块总结旧楼层并隐藏，也可在下方手动触发。",
      "on": "开启",
      "off": "关闭",
      "bad": "不可用"
    },
    "roll": {
      "section": "滚动压缩参数",
      "depthLabel": "起始深度（从第几楼起只发摘要）",
      "depthHint": "设为 0 表示从第 1 楼开始压缩。修改会立即写入正则，无需保存。"
    },
    "grand": {
      "section": "超限压缩参数",
      "thresholdLabel": "触发上限（发送 token）",
      "thresholdHint": "达到该数值自动触发大总结。需小于模型的上下文窗口，底部有上次实测值供参考。",
      "keepLabel": "保留最近楼层",
      "keepHint": "这些最新楼层永远原样发送，不参与压缩与隐藏。",
      "chunkLabel": "每块楼层数",
      "chunkHint": "每达到设定楼数生成一个「压缩块」，各块之间不再合并。",
      "runNow": "立即大总结",
      "running": "总结中",
      "unhideAll": "全部取消隐藏",
      "clearData": "清除压缩数据",
      "clearArmed": "再点一次确认",
      "runHint": "手动触发不受模式开关限制；失败会停在失败的块，下次从断点继续。"
    },
    "model": {
      "section": "大总结模型",
      "tavern": "跟随酒馆",
      "custom": "自定义接口",
      "note": "大总结使用哪个 AI 接口。跟随酒馆用当前连接；自定义可存多套配置随时切换。",
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
      "sourceHint": "接口格式必须与地址匹配，例如选 Claude 格式，接口地址就必须支持 Anthropic 协议。",
      "apiUrlHint": "自定义格式填完整地址。其他格式一般填反代地址，留空使用官方入口。",
      "keyHint": "密钥只存本机，不会写入聊天或「世界书」",
      "modelHint": "可手动填写模型名，也可点击右侧按钮在线获取。",
      "fetchModels": "获取模型列表",
      "fetching": "获取中…",
      "fetchFail": "获取模型列表失败：{err}",
      "fetchEmpty": "接口没有返回任何模型",
      "fetchPick": "（请选择模型）",
      "pickModelLabel": "从列表选一个",
      "pickLabel": "用哪套",
      "pickCurrent": "当前连接",
      "pickMissing": "连接配置「{name}」已不存在，本次用当前连接",
      "pickNone": "酒馆里没有已存的对话补全连接配置",
      "pickHint": "选连接配置 = 直接用酒馆存好的那套，不用复制。",
      "pickProxyNote": "走代理预设的连接配置拿不到它的密钥（酒馆把它当机密存着）；这种配置若失败，请改用自定义配置手填密钥。",
      "saveAs": "存为新配置",
      "namePh": "配置名称",
      "nameMissing": "请先输入配置名称。",
      "saveDone": "已保存配置「{name}」",
      "delBtn": "删除当前配置",
      "delDone": "已删除配置「{name}」",
      "delLast": "至少保留一个配置。",
      "customHint": "地址、密钥、模型名三项都填才生效。若有缺失，自动回退为跟随酒馆。"
    },
    "prompts": {
      "section": "摘要提示词",
      "head": "头部（可选，排在最前）",
      "task": "任务（正文后自动接材料）",
      "tail": "尾部（可选，排在最后）",
      "addEntry": "添加一条",
      "removeEntry": "删除",
      "reset": "恢复默认",
      "roleLabel": "角色",
      "hint": "头尾可自由增删条目（角色与内容），任务只改动正文。改动即时生效，无需保存。",
      "roleSystem": "系统",
      "roleUser": "用户",
      "roleChar": "角色",
      "tplLabel": "哪套模板",
      "tplNamePh": "模板名称",
      "tplSaveAs": "存为新模板",
      "tplDel": "删除当前模板",
      "tplDelLast": "至少保留一个模板。",
      "tplSaved": "已保存模板「{name}」",
      "tplDeleted": "已删除模板「{name}」",
      "tplNameMissing": "请先输入模板名称。",
      "tplHint": "模板只保存与替换提示词内容，不影响头尾条目的增删。",
      "tplDefaultName": "默认"
    },
    "pins": {
      "section": "例外楼层（隐藏时跳过）",
      "empty": "暂无例外楼层。",
      "ph": "楼层号",
      "add": "添加",
      "remove": "移除",
      "chipTitle": "点击移除",
      "note": "例外楼层永远保持显示，不参与总结。每次生成「压缩块」都会带上它们的信息。"
    },
    "blocks": {
      "section": "压缩块",
      "blockTag": "块",
      "empty": "暂无「压缩块」。开启超限压缩达到上限后自动生成，也可点击「立即大总结」。",
      "depthTag": "注入深度",
      "note": "每个块对应一个「世界书」条目（📜 压缩块 #N），锚在块尾楼层之后注入。数据保存在聊天「{lb}」的世界书中，切换预设不会丢。",
      "lbNone": "（聊天尚未绑定世界书）",
      "errHint": "压缩数据读取异常：{err}",
      "errFix": "可在上方「清除压缩数据」清空本聊天的压缩数据后重来；被隐藏的楼层不受影响。"
    },
    "entry": {
      "section": "「🧱 摘要(小总结)」条目",
      "turnOn": "开启条目",
      "turnOff": "关闭条目",
      "note": "建议保持常开：滚动压缩时若某楼层缺少摘要，压缩后信息将直接丢失。仅使用超限压缩时可关闭（大总结读取楼层原文）。本面板不会自动开关此条目。"
    },
    "toasts": {
      "running": "大总结正在进行中，请等待跑完",
      "noChat": "当前没有打开的聊天",
      "start": "大总结开始（{x}）",
      "startAuto": "达到上限自动触发",
      "startManual": "手动触发",
      "nothing": "没有需要压缩的楼层（保留最近 {n} 楼）",
      "onlyPins": "范围内没有未隐藏的楼层（前沿推进到 {n} 楼）",
      "partial": "大总结未全部完成：{err}",
      "partialTail": "。已完成的 {n} 块照常生效。",
      "done": "大总结完成：新增 {a} 块，隐藏 {b} 楼（共 {c} 块）",
      "noHidden": "当前聊天没有被隐藏的楼层",
      "unhideDone": "已恢复 {n} 楼的显示（压缩数据未变动）",
      "noLorebook": "当前聊天未绑定世界书，也没有压缩数据",
      "clearFail": "删除世界书条目失败：{err}",
      "clearDone": "已清除本聊天的压缩数据（{n} 个条目；已隐藏楼层保持原样，可用「全部取消隐藏」恢复显示）",
      "pinRange": "楼层号必须在 0 到 {n} 之间",
      "pinMissing": "例外楼层中不存在 #{n}",
      "pinDup": "#{n} 已在例外楼层中",
      "pinSaveFail": "写入世界书失败：{err}",
      "pinAdded": "已添加例外楼层 #{n}",
      "pinRemoved": "已移除例外楼层 #{n}",
      "grandOn": "超限压缩已开启：达到 {n} token 自动大总结",
      "numBad": "请填写有效数字",
      "writeFail": "写入失败：{err}",
      "toggleFail": "切换失败：{err}",
      "noSummaryEntry": "当前预设中未找到「🧱 摘要(小总结)」条目",
      "noRollRegex": "当前预设中未找到滚动压缩正则「{name}」",
      "noGenerate": "酒馆助手缺少 generateRaw（版本过旧？）",
      "emptyReply": "模型返回内容为空",
      "tooMany": "头部与尾部最多各 {n} 条",
      "saveFail": "保存失败：{err}"
    }
  };
  /* ── 面板文案到这里为止 ── */

  /* 面板手势共享模块（构建期内联，两块面板共用同一份） */
  /* @@KAMI_PANEL_GESTURES@@ */

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
  function toast(kind, msg) {
    try {
      var box = (HOST && HOST.toastr) || (typeof toastr !== 'undefined' ? toastr : null);
      if (box && typeof box[kind] === 'function') { box[kind](msg, '📜 压缩'); }
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
  function clonePromptList(list) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) { out.push({ role: list[i].role, content: list[i].content }); }
    return out;
  }
  /* 把「当前正在编辑的 prompts」拍一份快照（结构固定，写盘 / 比对都用它） */
  function snapPrompts() {
    return {
      head: clonePromptList(cfg.prompts.head),
      taskRole: cfg.prompts.taskRole,
      task: cfg.prompts.task,
      tail: clonePromptList(cfg.prompts.tail)
    };
  }
  function findTpl(name) {
    for (var i = 0; i < cfg.promptTpls.length; i++) {
      if (cfg.promptTpls[i].name === name) { return cfg.promptTpls[i]; }
    }
    return null;
  }
  function currentTpl() { return findTpl(cfg.promptTplCurrent); }
  /* 编辑即写回当前模板：不这样做的话，切到别的模板再切回来，刚才的编辑就没了
     （用户报「改动即时生效，无需保存」的那条约定要保住）。 */
  function syncCurrentTpl() {
    var t = currentTpl();
    if (!t) { return; }
    var snap = snapPrompts();
    t.head = snap.head; t.taskRole = snap.taskRole; t.task = snap.task; t.tail = snap.tail;
  }
  function currentSumConfig() {
    for (var i = 0; i < cfg.sumConfigs.length; i++) {
      if (cfg.sumConfigs[i].name === cfg.sumModel.current) { return cfg.sumConfigs[i]; }
    }
    return null;
  }
  var pingTimer = null, saveTimer = null, resizeHandler = null, hideHandler = null;
  var armTimer = null;        // 两段式确认的 4 秒定时器（注销时清）
  var panelDrag = null;       // 面板拖动/缩放进行中的状态（注销时释放指针捕获用）
  var ownDef = null, unsubs = [];
  var regexWrites = 0, entryWrites = 0;
  var lastError = null;

  /* 超限压缩进行中（面板标签与页脚都会显示进度） */
  var pipeline = { running: false, done: 0, total: 0 };

  /* 本聊天的压缩状态（真相在聊天世界书条目里，这里是它的内存映像） */
  var st = freshState();
  function freshState() {
    return { v: 2, lbName: null, stateUid: null, blocks: [], pins: [], covered: -1, updatedAt: null, adopted: false, error: null };
  }

  /* 实测（会话内记忆，不持久化）：钩子里每次生成后更新 */
  var measure = { installed: false, native: null, host: null, last: null };
  var floorTokCache = {};
  var tokenCounter = null;   // { kind: 'async'|'sync'|'est', fn }

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
      typeof getChatLorebook === 'function' && typeof getOrCreateChatLorebook === 'function');
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

  async function loadChatState() {
    st = freshState();
    if (!hasNativeLorebook()) { st.error = '拿不到酒馆原生的世界书读写接口'; return st; }
    var ctx = stCtx();
    var lb = null;
    try { lb = getChatLorebook(); } catch (e) { st.error = '读聊天世界书失败：' + msgOf(e); return st; }
    if (!lb) { return st; }   // 本聊天没绑世界书 = 没有压缩数据（不主动创建，写的时候才建）
    st.lbName = lb;
    var entryMap = {};
    try {
      var raw = await ctx.loadWorldInfo(lb);
      entryMap = (raw && raw.entries && typeof raw.entries === 'object') ? raw.entries : {};
    } catch (e) { st.error = '读世界书条目失败：' + msgOf(e); return st; }
    var stateEntry = findRawEntry(entryMap, LB_STATE);
    if (stateEntry) {
      st.stateUid = stateEntry.uid;
      try {
        var data = JSON.parse(stateEntry.content || '{}');
        if (data && typeof data === 'object') {
          if (Array.isArray(data.blocks)) {
            for (var i = 0; i < data.blocks.length; i++) {
              var b = data.blocks[i];
              if (b && typeof b.text === 'string' && typeof b.from === 'number' && typeof b.to === 'number') {
                st.blocks.push({
                  from: b.from, to: b.to, at: b.at || null, text: b.text,
                  uid: (typeof b.uid === 'number') ? b.uid : null,
                  depth: (typeof b.depth === 'number') ? b.depth : null
                });
              }
            }
          }
          if (Array.isArray(data.pins)) {
            for (var j = 0; j < data.pins.length; j++) {
              if (typeof data.pins[j] === 'number') { st.pins.push(data.pins[j]); }
            }
          }
          if (typeof data.covered === 'number') { st.covered = data.covered; }
          if (typeof data.updatedAt === 'number') { st.updatedAt = data.updatedAt; }
        }
      } catch (e) {
        st.error = '压缩状态条目不是合法 JSON（已被手工改坏？）——可点「清除本聊天压缩数据」重来';
      }
    }
    /* 账本丢了但块条目还在：按条目名收养（楼层范围写在名字里），避免重复总结 */
    if (!st.blocks.length) {
      var re = new RegExp('^' + LB_BLOCK_PREFIX + '(\\d+)｜楼层 (\\d+)-(\\d+)$');
      var allEntries = rawEntryList(entryMap);
      for (var k = 0; k < allEntries.length; k++) {
        var en = allEntries[k];
        if (!en || typeof en.comment !== 'string') { continue; }
        var m2 = re.exec(en.comment);
        if (!m2) { continue; }
        st.blocks.push({
          from: Number(m2[2]), to: Number(m2[3]), at: null,
          text: stripBlockHeader(String(en.content || '')),
          uid: en.uid, depth: (typeof en.depth === 'number') ? en.depth : null
        });
      }
      if (st.blocks.length) { st.adopted = true; }
    }
    var maxTo = -1;
    for (var k = 0; k < st.blocks.length; k++) { if (st.blocks[k].to > maxTo) { maxTo = st.blocks[k].to; } }
    if (maxTo > st.covered) { st.covered = maxTo; }
    st.pins.sort(function (a, b) { return a - b; });
    return st;
  }

  /* 块条目：一个块一个条目。名字带楼层范围（账本丢失时按名字收养），
     正文 = 一行头 + 提要文本；位置 @D⚙ 按深度注入，深度 = 块尾楼层之后的
     未隐藏楼层数（块锚在自己最后一名"住户"正后方，详见头部注释）。 */
  function blockContent(b) {
    return '【剧情提要｜楼层 ' + b.from + '-' + b.to + '】\n' + b.text;
  }
  function blockComment(index, b) {
    return LB_BLOCK_PREFIX + (index + 1) + '｜楼层 ' + b.from + '-' + b.to;
  }
  function stripBlockHeader(content) {
    var s = String(content || '');
    var m = s.match(/^【剧情提要｜楼层 \d+-\d+】\s*\n?/);
    return m ? s.slice(m[0].length) : s;
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
    var run = wbQueue.then(fn).catch(function (e) { log('世界书写入队列任务失败：' + msgOf(e)); throw e; });
    /* 队列尾巴单独接一个不会 reject 的句柄，避免一次失败把后面所有写入堵死 */
    wbQueue = run.then(function () { }, function () { });
    return run;
  }

  async function saveChatState() { return wbWrite(saveChatStateNow); }
  async function saveChatStateNow() {
    if (!hasNativeLorebook()) { throw new Error('拿不到酒馆原生的世界书读写接口'); }
    var ctx = stCtx();
    var lb = null;
    try { lb = await getOrCreateChatLorebook(); } catch (e) { throw new Error('创建/绑定聊天世界书失败：' + msgOf(e)); }
    st.lbName = lb;
    st.updatedAt = Date.now();
    var depthAfter = makeDepthCounter();
    var raw = null;
    try { raw = await ctx.loadWorldInfo(lb); } catch (e) { throw new Error('读世界书失败：' + msgOf(e)); }
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

    var created = 0, updated = 0;
    for (var i = 0; i < st.blocks.length; i++) {
      var b = st.blocks[i];
      b.depth = depthAfter(b.to);
      var fields = {
        comment: blockComment(i, b), content: blockContent(b),
        constant: true, disable: false, position: 4, role: 0,
        depth: b.depth, order: 1000000 - b.from,
        probability: 100, useProbability: true, ignoreBudget: true, addMemo: true
      };
      var key = (b.uid !== null && b.uid !== undefined && entryMap[b.uid]) ? b.uid : null;
      if (key !== null) { Object.assign(entryMap[key], fields); updated++; }
      else {
        maxUid++; maxDisplay++;
        b.uid = maxUid;
        var ne = Object.assign({ uid: maxUid, displayIndex: maxDisplay }, WI_TEMPLATE);
        Object.assign(ne, fields);
        entryMap[maxUid] = ne;
        created++;
      }
    }
    /* 账本：关闭状态（disable:true），永不进提示词；JSON 里带每个块的条目 uid */
    var stateJson = JSON.stringify(
      { v: 2, updatedAt: st.updatedAt, covered: st.covered, pins: st.pins, blocks: st.blocks },
      null, 2);
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
    try { if (typeof ctx.reloadWorldInfoEditor === 'function') { ctx.reloadWorldInfoEditor(false, false); } } catch (e) { }
    log('压缩状态已写入聊天世界书「' + lb + '」（块 ' + st.blocks.length + ' 个：新建 ' + created + '，更新 ' + updated + '；前沿 ' + st.covered + ' 楼）');
  }

  /* 深度核对：例外楼层增删、保留楼数改动、手动取消隐藏都会让"块尾之后的
     未隐藏楼层数"变化；有出入就只改受影响的条目（读是内存缓存操作，零成本）。 */
  async function syncBlockDepths(reason) { return wbWrite(function () { return syncBlockDepthsNow(reason); }); }
  async function syncBlockDepthsNow(reason) {
    if (disposed || !st.blocks.length || !st.lbName) { return; }
    if (!hasNativeLorebook()) { return; }
    var ctx = stCtx();
    try {
      var raw = await ctx.loadWorldInfo(st.lbName);
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
        log('已同步 ' + changed + ' 个块的注入深度（' + reason + '）');
        if (panelRoot) { renderContent(); }
      }
    } catch (e) { log('同步注入深度失败：' + msgOf(e)); }
  }

  async function clearChatData() { return wbWrite(clearChatDataNow); }
  async function clearChatDataNow() {
    await loadChatState();
    if (!st.lbName) { toast('info', COPY.toasts.noLorebook); return; }
    var ctx = stCtx();
    var uids = [], seen = {}, i;
    function take(id) { if (id !== null && id !== undefined && !seen[id]) { seen[id] = 1; uids.push(id); } }
    take(st.stateUid);
    for (i = 0; i < st.blocks.length; i++) { take(st.blocks[i].uid); }
    try {
      var raw = await ctx.loadWorldInfo(st.lbName);
      var all = rawEntryList((raw && raw.entries) || {});
      for (i = 0; i < all.length; i++) {
        if (typeof all[i].comment === 'string' && all[i].comment.indexOf(LB_BLOCK_PREFIX) === 0) { take(all[i].uid); }
      }
      for (i = 0; i < uids.length; i++) { delete raw.entries[uids[i]]; }
      await ctx.saveWorldInfo(st.lbName, raw, true);
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
    var len = chatLen();
    if (!len) { return 0; }
    var list = null;
    try { list = getChatMessages('0-' + (len - 1)) || []; } catch (e) { return 0; }
    var sum = 0;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || m.is_hidden) { continue; }
      var mes = m.message || '';
      var key = m.message_id + ':' + mes.length;
      var v = floorTokCache[key];
      if (v === undefined) { v = await countText(mes); floorTokCache[key] = v; }
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
    try {
      var body = JSON.parse(raw);
      var msgs = body && body.messages;
      if (!Array.isArray(msgs) || !msgs.length) { return; }
      var total = 0;
      for (var i = 0; i < msgs.length; i++) { total += await countText(contentTextOf(msgs[i])); }
      var floorsSum = await floorsTokens();
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

  async function summarizeChunk(chunk, pinsInRange) {
    var mats = [];
    mats.push('【历史压缩块】');
    if (!st.blocks.length) { mats.push('（无，这是第一块）'); }
    for (var i = 0; i < st.blocks.length; i++) {
      var b = st.blocks[i];
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
    var i, e;
    for (i = 0; i < cfg.prompts.head.length; i++) {
      e = cfg.prompts.head[i];
      if (e.content && e.content.trim()) { msgs.push({ role: e.role, content: e.content }); }
    }
    if (cfg.prompts.task && cfg.prompts.task.trim()) { msgs.push({ role: cfg.prompts.taskRole, content: cfg.prompts.task }); }
    msgs.push({ role: 'user', content: mats.join('\n\n') });
    for (i = 0; i < cfg.prompts.tail.length; i++) {
      e = cfg.prompts.tail[i];
      if (e.content && e.content.trim()) { msgs.push({ role: e.role, content: e.content }); }
    }
    if (typeof generateRaw !== 'function') { throw new Error(COPY.toasts.noGenerate); }
    /* 占位工具 + tool_choice:'none'：酒馆助手的标准生成路径只有在带 tools 时
       才把 tool_choice 注入请求体（responseGenerator.ts 的 optionsInjector 只认
       hasTools||jsonSchema），而反截断只认请求体里的 tool_choice:'none' 才会放手。
       所以带一个不会被调用的占位工具，把 'none' 送进请求体，两边都稳。
       自定义接口（source:'custom'）同样在 toolCallCompat 的支持名单里。 */
    var req = {
      generation_id: 'kami-summarize-' + Date.now(),
      ordered_prompts: msgs,
      should_silence: true,
      tools: [{ type: 'function', function: { name: 'kami_noop', description: '占位工具，不要调用。', parameters: { type: 'object', properties: {}, required: [] } } }],
      tool_choice: 'none'
    };
    var finish = function (res) {
      var text = (typeof res === 'string') ? res : (res && res.content) ? res.content : '';
      text = String(text || '').trim();
      text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
      if (!text) { throw new Error(COPY.toasts.emptyReply); }
      return text;
    };
    var send = function () { return generateRaw(req); };
    if (cfg.sumModel.mode === 'custom') {
      var cc = currentSumConfig();
      if (cc && cc.apiurl && cc.key && cc.model) {
        req.custom_api = {
          apiurl: cc.apiurl,
          key: cc.key,
          model: cc.model,
          source: cc.source || 'custom'   // 请求格式跟所选接口格式走（custom=OpenAI 兼容自定义）
        };
        var res = await send();
        return finish(res);
      }
      toast('warning', COPY.model.customHint);
      var res2 = await send();
      return finish(res2);
    }
    if (cfg.sumModel.tavernPick) {
      /* 直接用酒馆那套连接配置：借用活设置跑一次，跑完还原 */
      var res3 = null;
      await withTavernProfile(cfg.sumModel.tavernPick, async function () { res3 = await send(); });
      return finish(res3);
    }
    var res4 = await send();
    return finish(res4);
  }
  function chatMsg(i) {
    try {
      var list = getChatMessages(String(i));
      return (list && list.length) ? list[0] : null;
    } catch (e) { return null; }
  }

  async function setFloorHidden(ids, hidden) {
    if (!ids.length) { return; }
    if (typeof setChatMessages !== 'function') { throw new Error('酒馆助手没有 setChatMessages（版本过旧？）'); }
    var payload = [];
    for (var i = 0; i < ids.length; i++) { payload.push({ message_id: ids[i], is_hidden: !!hidden }); }
    await setChatMessages(payload, { refresh: 'affected' });
  }

  async function unhideAll() {
    var len = chatLen();
    if (!len) { toast('info', COPY.toasts.noChat); return; }
    var list = getChatMessages('0-' + (len - 1)) || [];
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].is_hidden) { ids.push(list[i].message_id); }
    }
    if (!ids.length) { toast('info', COPY.toasts.noHidden); return; }
    await setFloorHidden(ids, false);
    toast('success', COPY.toasts.unhideDone.replace('{n}', ids.length));
  }

  async function runPipeline(trigger) {
    if (pipeline.running) { toast('warning', COPY.toasts.running); return; }
    var len = chatLen();
    if (!len) { toast('warning', COPY.toasts.noChat); return; }
    if (trigger === 'auto' && !cfg.grandOn) { return; }

    pipeline.running = true; pipeline.done = 0; pipeline.total = 0;
    updateDef(); renderStatus();
    toast('info', COPY.toasts.start.replace('{x}', trigger === 'auto' ? COPY.toasts.startAuto : COPY.toasts.startManual));

    var newBlocks = [], failMsg = null, hideIds = [];
    try {
      await loadChatState();
      var keep = Math.max(1, Math.min(500, cfg.keep));
      var chunkSize = Math.max(1, Math.min(200, cfg.chunk));
      var end = len - 1 - keep;
      var start = st.covered + 1;
      if (end < start) {
        toast('info', COPY.toasts.nothing.replace('{n}', keep));
        return;
      }
      var all = getChatMessages('0-' + (len - 1)) || [];
      var pinMap = {};
      for (var p = 0; p < st.pins.length; p++) { pinMap[st.pins[p]] = 1; }
      var targets = [];
      for (var i = start; i <= end; i++) {
        var m = all[i];
        if (!m || m.is_hidden) { continue; }
        if (pinMap[i]) { continue; }
        targets.push(i);
      }
      var pinsInRange = [];
      for (var pi = 0; pi < st.pins.length; pi++) { if (st.pins[pi] <= end) { pinsInRange.push(st.pins[pi]); } }
      if (!targets.length) {
        /* 范围里全被隐藏或全是例外楼层：前沿推进到本轮末尾，避免下次重复扫同一段 */
        st.covered = end;
        await saveChatState();
        toast('info', COPY.toasts.onlyPins.replace('{n}', end));
        return;
      }
      /* 按每块楼数切块（纯按数量切；楼号可能有例外楼层造成的空洞，没关系） */
      var chunks = [];
      for (var t = 0; t < targets.length; t += chunkSize) {
        chunks.push(targets.slice(t, t + chunkSize));
      }
      pipeline.total = chunks.length;
      var coveredNow = st.covered;
      for (var c = 0; c < chunks.length; c++) {
        if (disposed) { failMsg = '脚本已注销'; break; }
        try {
          /* st.blocks 里带着本轮已完成的块（summarizeChunk 会全部带上） */
          var text = await summarizeChunk(chunks[c], pinsInRange);
          var blk = { from: chunks[c][0], to: chunks[c][chunks[c].length - 1], at: Date.now(), text: text };
          st.blocks.push(blk);
          newBlocks.push(blk);
          coveredNow = Math.max(coveredNow, blk.to);
          pipeline.done = c + 1;
          log('块 ' + (c + 1) + '/' + chunks.length + ' 完成（楼层 ' + blk.from + '-' + blk.to + '）');
          var bRun2 = panelHead ? panelHead.querySelector('[data-kami-act="run-now"]') : null;
          if (bRun2) { bRun2.textContent = COPY.grand.running + ' ' + pipeline.done + '/' + pipeline.total; }
          renderStatus();
        } catch (e) {
          failMsg = '第 ' + (c + 1) + ' 块（楼层 ' + chunks[c][0] + '-' + chunks[c][chunks[c].length - 1] + '）总结失败：' + msgOf(e);
          break;
        }
      }
      if (disposed) {
        /* 注销后不再写盘、不再隐藏（F1：跑批中途脚本被关，已算出的块留在内存里即可） */
        log('流水线进行中脚本被注销：放弃本次落盘与隐藏');
      } else if (newBlocks.length) {
        /* 前沿只推进到**成功块**的末尾：失败块连同后面的楼层，下次触发从断点继续 */
        st.covered = coveredNow;
        await saveChatState();
        /* 只隐藏「这次成功块覆盖的」未隐藏楼层（例外楼层天然不在 targets 里） */
        var coveredMap = {};
        for (var b2 = 0; b2 < newBlocks.length; b2++) {
          for (var f = newBlocks[b2].from; f <= newBlocks[b2].to; f++) { coveredMap[f] = 1; }
        }
        for (var t2 = 0; t2 < targets.length; t2++) { if (coveredMap[targets[t2]]) { hideIds.push(targets[t2]); } }
        await setFloorHidden(hideIds, true);
      }
    } catch (e) {
      failMsg = failMsg || msgOf(e);
    } finally {
      pipeline.running = false;
    }
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
    try {
      await syncBlockDepths('生成前核对');   // 手动取消隐藏等造成的漂移在这里兜住
      var est = await estimateNext(t);
      log('生成前估算：' + est.est + ' token（楼层 ' + est.floorTok + ' + 头部 ' + est.overhead + ' + 新输入 ' + est.extra + '），上限 ' + cfg.threshold);
      if (est.est >= cfg.threshold) { await runPipeline('auto'); }
    } catch (e) {
      log('自动触发检查失败（不阻塞生成）：' + msgOf(e));
    }
  }
  function onChatChanged() {
    measure.last = null;
    floorTokCache = {};
    lastError = null;
    loadChatState().then(function () {
      if (panelRoot) { renderContent(); }
      renderStatus();
      return syncBlockDepths('切换聊天');
    });
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
    var el = HDOC.createElement(tag);
    if (cls) { el.className = cls; }
    if (text !== undefined && text !== null) { el.textContent = text; }
    return el;
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

  function injectCss() {
    try {
      if (HDOC.getElementById(CSS_ID)) { return; }
      var stl = HDOC.createElement('style');
      stl.id = CSS_ID;
      /* 兜底皮肤（皮肤管理没跑时才生效）+ 本面板布局，装在同一个 style 里 */
      stl.textContent = ((typeof KAMI_BASE_CSS === 'string') ? KAMI_BASE_CSS : '') + '\n' + LAYOUT_CSS;
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
    panelRoot.style.position = 'fixed';
    panelRoot.style.inset = '0';
    panelRoot.style.zIndex = String(Z);
    panelRoot.style.pointerEvents = 'none';

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
    head.appendChild(mk('span', 'kami-title', '📜 压缩'));
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
    head.appendChild(headRow2);
    panelDrop.appendChild(head);

    bodyEl = mk('div', 'kami-body kami-scroll');
    bodyEl.setAttribute('data-kami-pane', 'main');
    bodyEl.style.touchAction = 'pan-y';
    panelDrop.appendChild(bodyEl);

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
    log('面板已创建（' + (sheetMode() ? '窄屏抽屉' : '桌面悬浮窗') + '）');
  }

  /* ── 面板内容（数据变了就整片重画正文；几何与手势不动） ── */

  function sectionCard(title) {
    var card = mk('div', 'kami-card');
    card.appendChild(mk('div', 'kami-card-title', title));
    var body = mk('div', 'kami-card-body');
    card.appendChild(body);
    return { card: card, body: body };
  }
  function noteLine(parent, text) {
    var n = mk('div', 'kami-card-note', text);
    parent.appendChild(n);
    return n;
  }
  function noteLine(parent, text) {
    var n = mk('div', 'kami-card-note', text);
    parent.appendChild(n);
    return n;
  }
  /* 字段行：契约 §4.2 的 .kami-field 三件套（40-预设设置.js 第 1538-1545 行、
      30-皮肤管理.js 第 804-806 行同款）。行距、分隔线、点线引导符全靠皮肤，前端零内联。 */
  function fieldRow(parent, label, control) {
    var row = mk('div', 'kami-field');
    if (label !== null && label !== undefined && label !== '') { row.appendChild(mk('span', 'kami-field-label', label)); }
    if (control) { row.appendChild(control); }
    parent.appendChild(row);
    return row;
  }
  /* 数字框：input 裹在 .kami-field-value 里（40 号 varInput 同款），宽度用皮肤登记的 62px */
  function numInput(parent, label, value, key, hint) {
    var input = HDOC.createElement('input');
    input.className = 'kami-number';
    input.type = 'number';
    input.setAttribute('data-kami-var', key);
    input.value = String(value);
    var val = mk('span', 'kami-field-value');
    val.appendChild(input);
    fieldRow(parent, label, val);
    if (hint) { noteLine(parent, hint); }
    return input;
  }
  /* 文本/密码框：作为 .kami-field 的直接子元素，撑开由 LAYOUT_CSS 负责。
     类名 = 契约 §4.2 的 `.kami-text`（2026-09-21 起不再借用数字框的 `.kami-number`：
     那条规则带 `text-align:right`，会把文本框一起变成右对齐）。 */
  function textInput(parent, label, value, attrs, hint) {
    var input = HDOC.createElement('input');
    input.className = 'kami-text';
    if (attrs) { for (var k in attrs) { input.setAttribute(k, attrs[k]); } }
    input.value = String(value === undefined || value === null ? '' : value);
    fieldRow(parent, label, input);
    if (hint) { noteLine(parent, hint); }
    return input;
  }
  /* 下拉框：options = [[value, text], …]；同样作为 .kami-field 直接子元素。
     类名 = 契约 §4.2 的 `.kami-select`（六份样式表里原本一条下拉框规则都没有，
     真机上就是浏览器默认样式；`.kami-number` 是数字框，不许再借用）。 */
  function selectRow(parent, label, options, current, attrs) {
    var sel = HDOC.createElement('select');
    sel.className = 'kami-select';
    if (attrs) { for (var k2 in attrs) { sel.setAttribute(k2, attrs[k2]); } }
    for (var i = 0; i < options.length; i++) {
      var op = HDOC.createElement('option');
      op.value = options[i][0];
      op.textContent = options[i][1];
      if (options[i][0] === current) { op.selected = true; }
      sel.appendChild(op);
    }
    fieldRow(parent, label, sel);
    return sel;
  }
  /* 提示词条目里的角色下拉（带头/尾条目序号，改哪条就是哪条） */
  function roleSelect(value, list, idx) {
    var sel = HDOC.createElement('select');
    sel.className = 'kami-select';
    sel.setAttribute('data-kami-prompt', list);
    sel.setAttribute('data-kami-pi', String(idx));
    sel.setAttribute('data-kami-pf', 'role');
    sel.setAttribute('aria-label', COPY.prompts.roleLabel);
    var opts = [['system', COPY.prompts.roleSystem], ['user', COPY.prompts.roleUser], ['assistant', COPY.prompts.roleChar]];
    for (var i = 0; i < opts.length; i++) {
      var op = HDOC.createElement('option');
      op.value = opts[i][0];
      op.textContent = opts[i][1];
      if (opts[i][0] === value) { op.selected = true; }
      sel.appendChild(op);
    }
    return sel;
  }
  /* 多行文本框：类名 = 契约 §4.2 的 `.kami-textarea`（尺寸由 LAYOUT_CSS 管） */
  function promptTextarea(list, idx) {
    var ta = HDOC.createElement('textarea');
    ta.className = 'kami-textarea';
    ta.setAttribute('data-kami-prompt', list);
    ta.setAttribute('data-kami-pi', String(idx));
    ta.setAttribute('data-kami-pf', 'content');
    ta.value = (list === 'task') ? cfg.prompts.task : (cfg.prompts[list][idx] ? cfg.prompts[list][idx].content : '');
    return ta;
  }
  /* 头/尾的一个条目：角色行（.kami-field）+ 内容域 */
  function promptEntry(parent, list, idx) {
    var row = fieldRow(parent, COPY.prompts.roleLabel, null);
    row.appendChild(roleSelect(cfg.prompts[list][idx].role, list, idx));
    var bDel = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.removeEntry);
    bDel.type = 'button';
    bDel.setAttribute('data-kami-act', 'prompt-del');
    bDel.setAttribute('data-kami-prompt', list);
    bDel.setAttribute('data-kami-pi', String(idx));
    row.appendChild(bDel);
    parent.appendChild(promptTextarea(list, idx));
  }
  function promptEditor(parent, list, title) {
    parent.appendChild(mk('div', 'kami-card-title', title));
    for (var i = 0; i < cfg.prompts[list].length; i++) { promptEntry(parent, list, i); }
    var bAdd = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.addEntry);
    bAdd.type = 'button';
    bAdd.setAttribute('data-kami-act', 'prompt-add');
    bAdd.setAttribute('data-kami-prompt', list);
    parent.appendChild(bAdd);
  }
  /* 开关卡：button.kami-item.kami-card + .is-on + aria-pressed（40 号第 1546-1576 行同款），
     行内结构用 span.kami-card-head > span.kami-item-main（button 的内容模型只允许 phrasing content） */
  function toggleCard(parent, key, title, on, extraLine) {
    var btn = mk('button', 'kami-item kami-card' + (on ? ' is-on' : ''));
    btn.type = 'button';
    btn.setAttribute('role', 'button');
    btn.setAttribute('data-kami-cmode', key);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', title);
    var head = mk('span', 'kami-card-head');
    head.appendChild(mk('span', 'kami-item-main', title));
    btn.appendChild(head);
    if (extraLine) { btn.appendChild(mk('span', 'kami-card-note', extraLine)); }
    parent.appendChild(btn);
    return btn;
  }

  function renderContent() {
    if (!bodyEl || disposed) { return; }
    var keepScroll = bodyEl.scrollTop;
    bodyEl.textContent = '';

    /* ① 模式 */
    var roll = rollInfo();
    var sec1 = sectionCard(COPY.mode.section);
    toggleCard(sec1.body, 'roll', COPY.mode.rollTitle, roll.ok && roll.enabled,
      COPY.mode.rollDepthLine.replace('{n}', roll.ok ? roll.minDepth : '—'));
    noteLine(sec1.body, COPY.mode.rollNote);
    toggleCard(sec1.body, 'grand', COPY.mode.grandTitle, cfg.grandOn, null);
    noteLine(sec1.body, COPY.mode.grandNote);
    bodyEl.appendChild(sec1.card);

    /* ② 滚动压缩参数 */
    var sec2 = sectionCard(COPY.roll.section);
    if (roll.ok) {
      numInput(sec2.body, COPY.roll.depthLabel, roll.minDepth, 'depth', COPY.roll.depthHint);
    } else {
      noteLine(sec2.body, roll.error);
    }
    bodyEl.appendChild(sec2.card);

    /* ③ 超限压缩参数 */
    var sec3 = sectionCard(COPY.grand.section);
    numInput(sec3.body, COPY.grand.thresholdLabel, cfg.threshold, 'threshold', COPY.grand.thresholdHint);
    numInput(sec3.body, COPY.grand.keepLabel, cfg.keep, 'keep', COPY.grand.keepHint);
    numInput(sec3.body, COPY.grand.chunkLabel, cfg.chunk, 'chunk', COPY.grand.chunkHint);
    bodyEl.appendChild(sec3.card);

    /* ④ 大总结模型 */
    var sec4 = sectionCard(COPY.model.section);
    var mRow = mk('div', 'kami-items');
    var bTavern = mk('button', 'kami-item kami-card' + (cfg.sumModel.mode !== 'custom' ? ' is-on' : ''));
    bTavern.type = 'button';
    bTavern.setAttribute('role', 'button');
    bTavern.setAttribute('data-kami-model-mode', 'tavern');
    bTavern.setAttribute('aria-pressed', cfg.sumModel.mode !== 'custom' ? 'true' : 'false');
    bTavern.setAttribute('aria-label', COPY.model.tavern);
    bTavern.appendChild(mk('span', 'kami-item-main', COPY.model.tavern));
    mRow.appendChild(bTavern);
    var bCustom = mk('button', 'kami-item kami-card' + (cfg.sumModel.mode === 'custom' ? ' is-on' : ''));
    bCustom.type = 'button';
    bCustom.setAttribute('role', 'button');
    bCustom.setAttribute('data-kami-model-mode', 'custom');
    bCustom.setAttribute('aria-pressed', cfg.sumModel.mode === 'custom' ? 'true' : 'false');
    bCustom.setAttribute('aria-label', COPY.model.custom);
    bCustom.appendChild(mk('span', 'kami-item-main', COPY.model.custom));
    mRow.appendChild(bCustom);
    sec4.body.appendChild(mRow);
    if (cfg.sumModel.mode !== 'custom') {
      /* 跟随酒馆：默认用当前连接，也可以直接点选酒馆里已存的连接配置——
         不复制、不落地，请求时按那套配置临时转一下即可。 */
      var profiles = tavernCCProfiles();
      var opts = [['', COPY.model.pickCurrent]];
      for (var pi = 0; pi < profiles.length; pi++) {
        opts.push([profiles[pi].name, profiles[pi].name + (profiles[pi].model ? ('（' + profiles[pi].model + '）') : '')]);
      }
      selectRow(sec4.body, COPY.model.pickLabel, opts, cfg.sumModel.tavernPick, { 'data-kami-mi': '__pick' });
      if (!profiles.length) { noteLine(sec4.body, COPY.model.pickNone); }
      noteLine(sec4.body, COPY.model.pickHint);
      noteLine(sec4.body, COPY.model.pickProxyNote);
    } else {
      if (!cfg.sumConfigs.length) {
        cfg.sumConfigs.push({ name: '默认', source: 'custom', apiurl: '', key: '', model: '' });
        cfg.sumModel.current = '默认';
      }
      if (!currentSumConfig()) { cfg.sumModel.current = cfg.sumConfigs[0].name; }
      var cur = currentSumConfig();
      var cfgOpts = [];
      for (var ci = 0; ci < cfg.sumConfigs.length; ci++) { cfgOpts.push([cfg.sumConfigs[ci].name, cfg.sumConfigs[ci].name]); }
      selectRow(sec4.body, COPY.model.cfgLabel, cfgOpts, cfg.sumModel.current, { 'data-kami-mi': '__config' });
      var srcOpts = [];
      for (var si = 0; si < COPY.model.sources.length; si++) { srcOpts.push([COPY.model.sources[si].v, COPY.model.sources[si].n]); }
      selectRow(sec4.body, COPY.model.sourceLabel, srcOpts, cur.source, { 'data-kami-mi': 'source' });
      noteLine(sec4.body, COPY.model.sourceHint);
      textInput(sec4.body, COPY.model.apiUrlLabel, cur.apiurl, { 'data-kami-mi': 'apiurl', type: 'text', placeholder: 'https://…/v1' }, COPY.model.apiUrlHint);
      textInput(sec4.body, COPY.model.keyLabel, cur.key, { 'data-kami-mi': 'key', type: 'password' }, COPY.model.keyHint);
      textInput(sec4.body, COPY.model.modelLabel, cur.model, { 'data-kami-mi': 'model', type: 'text' }, COPY.model.modelHint);
      /* 模型列表（点「获取模型列表」后多出一行，选中即回填模型名） */
      var ml = modelListCache[cur.name];
      if (ml && ml.length) {
        var mlOpts = [[cur.model, cur.model ? cur.model : COPY.model.fetchPick]];
        for (var mi = 0; mi < ml.length; mi++) { if (ml[mi] !== cur.model) { mlOpts.push([ml[mi], ml[mi]]); } }
        selectRow(sec4.body, COPY.model.pickModelLabel, mlOpts, cur.model, { 'data-kami-mi': 'model' });
      }
      var bFetch = mk('button', 'kami-btn kami-btn--ghost', fetchState === 'busy' ? COPY.model.fetching : COPY.model.fetchModels);
      bFetch.type = 'button';
      bFetch.setAttribute('data-kami-act', 'fetch-models');
      if (fetchState === 'busy') { bFetch.setAttribute('disabled', '1'); }
      sec4.body.appendChild(bFetch);
      /* 存为新配置：名称行（名称框 + 两个按钮） */
      var nameRow = fieldRow(sec4.body, COPY.model.namePh, null);
      nameRow.setAttribute('data-kami-role', 'name-row');
      var nameInput = HDOC.createElement('input');
      nameInput.className = 'kami-text';
      nameInput.type = 'text';
      nameInput.setAttribute('data-kami-mi', '__name');
      nameInput.placeholder = COPY.model.namePh;
      nameRow.appendChild(nameInput);
      var bSaveAs = mk('button', 'kami-btn kami-btn--ghost', COPY.model.saveAs);
      bSaveAs.type = 'button';
      bSaveAs.setAttribute('data-kami-act', 'config-save-as');
      nameRow.appendChild(bSaveAs);
      var bDelCfg = mk('button', 'kami-btn kami-btn--ghost', COPY.model.delBtn);
      bDelCfg.type = 'button';
      bDelCfg.setAttribute('data-kami-act', 'config-del');
      nameRow.appendChild(bDelCfg);
    }
    noteLine(sec4.body, COPY.model.note);
    noteLine(sec4.body, COPY.model.customHint);
    bodyEl.appendChild(sec4.card);

    /* ⑤ 例外楼层 */
    var sec5 = sectionCard(COPY.pins.section);
    if (st.pins.length) {
      var chips = mk('div');
      chips.setAttribute('data-kami-role', 'pin-chips');
      for (var i = 0; i < st.pins.length; i++) {
        var chip = mk('span', 'kami-chip', '#' + st.pins[i]);
        chip.setAttribute('data-kami-pin', String(st.pins[i]));
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', COPY.pins.chipTitle + ' #' + st.pins[i]);
        chip.title = COPY.pins.chipTitle;
        chips.appendChild(chip);
      }
      sec5.body.appendChild(chips);
    } else {
      noteLine(sec5.body, COPY.pins.empty);
    }
    var pinRow = fieldRow(sec5.body, COPY.pins.ph, null);
    var pinInput = HDOC.createElement('input');
    pinInput.className = 'kami-number';
    pinInput.type = 'number';
    pinInput.setAttribute('data-kami-var', 'pin');
    pinInput.placeholder = COPY.pins.ph;
    pinRow.appendChild(pinInput);
    var bAdd = mk('button', 'kami-btn kami-btn--ghost', COPY.pins.add);
    bAdd.type = 'button';
    bAdd.setAttribute('data-kami-act', 'pin-add');
    pinRow.appendChild(bAdd);
    var bDel = mk('button', 'kami-btn kami-btn--ghost', COPY.pins.remove);
    bDel.type = 'button';
    bDel.setAttribute('data-kami-act', 'pin-del');
    pinRow.appendChild(bDel);
    noteLine(sec5.body, COPY.pins.note);
    bodyEl.appendChild(sec5.card);

    /* ⑥ 压缩块 */
    var sec6 = sectionCard(COPY.blocks.section + '（' + st.blocks.length + '）');
    if (st.error) {
      noteLine(sec6.body, COPY.blocks.errHint.replace('{err}', st.error));
      noteLine(sec6.body, COPY.blocks.errFix);
    }
    if (st.blocks.length) {
      for (var b = 0; b < st.blocks.length; b++) {
        var blk = mk('div');
        var bt = mk('div', 'kami-card-title', COPY.blocks.blockTag + ' ' + (b + 1) + ' ｜ 楼层 ' + st.blocks[b].from + '-' + st.blocks[b].to +
          (st.blocks[b].depth !== null && st.blocks[b].depth !== undefined ? (' ｜ ' + COPY.blocks.depthTag + ' ' + st.blocks[b].depth) : ''));
        var bb = mk('div', 'kami-card-body', st.blocks[b].text);
        bb.setAttribute('data-kami-role', 'block-text');
        blk.appendChild(bt);
        blk.appendChild(bb);
        sec6.body.appendChild(blk);
      }
      noteLine(sec6.body, COPY.blocks.note.replace('{lb}', st.lbName || COPY.blocks.lbNone));
    } else if (!st.error) {
      sec6.body.appendChild(mk('div', 'kami-empty', COPY.blocks.empty));
    }
    bodyEl.appendChild(sec6.card);

    /* ⑦ 摘要提示词（模板 + 头/任务/尾） */
    var sec7 = sectionCard(COPY.prompts.section);
    noteLine(sec7.body, COPY.prompts.hint);
    /* 模板行：下拉切换 + 名称 + 存为新模板 + 删除当前模板（与 sec4「大总结模型」同构）。
       兜底同 sec4：列表为空时先塞一条，指针失效时指回第一条。 */
    if (!cfg.promptTpls.length) {
      var seed = snapPrompts();
      seed.name = COPY.prompts.tplDefaultName;
      cfg.promptTpls.push(seed);
    }
    if (!currentTpl()) { cfg.promptTplCurrent = cfg.promptTpls[0].name; }
    var tplOpts = [];
    for (var ti = 0; ti < cfg.promptTpls.length; ti++) { tplOpts.push([cfg.promptTpls[ti].name, cfg.promptTpls[ti].name]); }
    selectRow(sec7.body, COPY.prompts.tplLabel, tplOpts, cfg.promptTplCurrent, { 'data-kami-pt': '__tpl' });
    var tplRow = fieldRow(sec7.body, COPY.prompts.tplNamePh, null);
    tplRow.setAttribute('data-kami-role', 'name-row');
    var tplInput = HDOC.createElement('input');
    tplInput.className = 'kami-text';
    tplInput.type = 'text';
    tplInput.setAttribute('data-kami-pt', '__name');
    tplInput.placeholder = COPY.prompts.tplNamePh;
    tplRow.appendChild(tplInput);
    var bTplSave = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.tplSaveAs);
    bTplSave.type = 'button';
    bTplSave.setAttribute('data-kami-act', 'tpl-save-as');
    tplRow.appendChild(bTplSave);
    var bTplDel = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.tplDel);
    bTplDel.type = 'button';
    bTplDel.setAttribute('data-kami-act', 'tpl-del');
    tplRow.appendChild(bTplDel);
    noteLine(sec7.body, COPY.prompts.tplHint);
    promptEditor(sec7.body, 'head', COPY.prompts.head);
    sec7.body.appendChild(mk('div', 'kami-card-title', COPY.prompts.task));
    var taskRow = fieldRow(sec7.body, COPY.prompts.roleLabel, null);
    taskRow.appendChild(roleSelect(cfg.prompts.taskRole, 'task', 0));
    var bReset = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.reset);
    bReset.type = 'button';
    bReset.setAttribute('data-kami-act', 'task-reset');
    taskRow.appendChild(bReset);
    sec7.body.appendChild(promptTextarea('task', 0));
    promptEditor(sec7.body, 'tail', COPY.prompts.tail);
    bodyEl.appendChild(sec7.card);

    /* ⑧ 摘要条目状态 */
    var sec8 = sectionCard(COPY.entry.section);
    var info = summaryInfo();
    if (info.ok) {
      var bToggle = mk('button', 'kami-btn kami-btn--ghost', info.enabled ? COPY.entry.turnOff : COPY.entry.turnOn);
      bToggle.type = 'button';
      bToggle.setAttribute('data-kami-act', 'toggle-entry');
      fieldRow(sec8.body, info.name, bToggle);
    } else {
      noteLine(sec8.body, info.error);
    }
    noteLine(sec8.body, COPY.entry.note);
    bodyEl.appendChild(sec8.card);

    bodyEl.scrollTop = keepScroll;
    renderStatus();
  }

  /* ── 摘要模型 / 摘要提示词的写回 ──
     文本域与下拉的改动只落 cfg + saveVars，**不重画面板**（保住输入焦点）；
     增删条目、恢复默认这类结构变化才重画。 */
  function toggleModelMode(mode) {
    if (cfg.sumModel.mode === mode) { return; }
    cfg.sumModel.mode = (mode === 'custom') ? 'custom' : 'tavern';
    saveVars();
    renderContent();
  }
  function applyModelInput(field, value) {
    if (field === '__config') {   // 切换已存配置
      if (!currentSumConfig() || currentSumConfig().name !== value) {
        cfg.sumModel.current = value;
        saveVars();
        renderContent();
      }
      return;
    }
    if (field === '__pick') {   // 跟随酒馆：选「当前连接」或某套连接配置
      cfg.sumModel.tavernPick = String(value === undefined || value === null ? '' : value);
      saveVars();
      renderContent();
      return;
    }
    if (field === '__name') { return; }   // 名称框只给「存为新配置」用，不落值
    var cur = currentSumConfig();
    if (!cur) { return; }
    if (field === 'source') {
      cur.source = ['custom', 'openai', 'claude', 'makersuite', 'deepseek', 'xai', 'openrouter', 'azure_openai'].indexOf(value) >= 0 ? value : 'custom';
    } else if (field === 'apiurl' || field === 'key' || field === 'model') {
      cur[field] = String(value === undefined || value === null ? '' : value);
    }
    saveVars();   // 不重画：保住输入焦点
  }
  function saveConfigAs(name) {
    name = String(name || '').trim();
    if (!name) { toast('warning', COPY.model.nameMissing); return; }
    var cur = currentSumConfig();
    var src = cur || { source: 'custom', apiurl: '', key: '', model: '' };
    var exist = null;
    for (var i = 0; i < cfg.sumConfigs.length; i++) { if (cfg.sumConfigs[i].name === name) { exist = cfg.sumConfigs[i]; break; } }
    if (exist) {
      exist.source = src.source; exist.apiurl = src.apiurl; exist.key = src.key; exist.model = src.model;
    } else {
      cfg.sumConfigs.push({ name: name, source: src.source, apiurl: src.apiurl, key: src.key, model: src.model });
    }
    cfg.sumModel.current = name;
    saveVars();
    toast('success', COPY.model.saveDone.replace('{name}', name));
    renderContent();
  }
  function deleteCurrentConfig() {
    if (cfg.sumConfigs.length <= 1) { toast('warning', COPY.model.delLast); return; }
    var cur = currentSumConfig();
    if (!cur) { return; }
    cfg.sumConfigs = cfg.sumConfigs.filter(function (c) { return c.name !== cur.name; });
    if (cfg.sumModel.current === cur.name) { cfg.sumModel.current = cfg.sumConfigs[0].name; }
    delete modelListCache[cur.name];
    saveVars();
    toast('success', COPY.model.delDone.replace('{name}', cur.name));
    renderContent();
  }
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
  async function withTavernProfile(name, fn) {
    var ctx = stCtx();
    var s = settingsOf(ctx);
    var pf = findTavernProfile(name);
    if (!ctx || !s || !pf) {
      if (name) { toast('warning', COPY.model.pickMissing.replace('{name}', name)); }
      await fn();
      return;
    }
    var keys = ['chat_completion_source', 'reverse_proxy', 'custom_url', 'model'];
    var old = {};
    for (var i = 0; i < keys.length; i++) { old[keys[i]] = s[keys[i]]; }
    try {
      if (pf.api) { s.chat_completion_source = pf.api; }
      if (pf.model) { s.model = pf.model; }
      var url = (typeof pf['api-url'] === 'string') ? pf['api-url'] : '';
      if (url) {
        if (pf.api === 'custom') { s.custom_url = url; } else { s.reverse_proxy = url; }
      }
      await fn();
    } finally {
      for (var j = 0; j < keys.length; j++) { s[keys[j]] = old[keys[j]]; }
      log('已还原酒馆连接设置（' + name + '）');
    }
  }
  /* 从接口拉模型列表：走酒馆服务端的 /status（各源按它的字段要求给地址与密钥）。 */
  var modelListCache = {};   // 配置名 -> [模型名]
  var fetchState = 'idle';   // idle | busy
  async function fetchModelList() {
    if (fetchState === 'busy') { return; }
    var cur = currentSumConfig();
    if (!cur) { return; }
    fetchState = 'busy';
    if (panelRoot) { renderContent(); }   // 按钮进「获取中…」并禁用
    var ids = [];
    try {
      var body = { chat_completion_source: cur.source, api_key: cur.key, proxy_password: cur.key };
      if (cur.source === 'custom') {
        body.custom_url = cur.apiurl;
        if (cur.key) { body.custom_include_headers = 'Authorization: Bearer ' + cur.key; }
      } else {
        body.reverse_proxy = cur.apiurl || '';
      }
      var resp = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var json = null;
      try { json = await resp.json(); } catch (e) { }
      if (json && json.data && Array.isArray(json.data)) {
        for (var i = 0; i < json.data.length; i++) {
          var id = String((json.data[i] && (json.data[i].id || json.data[i].name)) || '').trim();
          if (id) { ids.push(id); }
        }
        ids.sort();
      }
      fetchState = 'idle';
      if (!ids.length) { toast('warning', COPY.model.fetchEmpty); renderContent(); return; }
      modelListCache[cur.name] = ids;
      toast('success', ids.length + ' 个模型');
    } catch (e) {
      fetchState = 'idle';
      toast('error', COPY.model.fetchFail.replace('{err}', msgOf(e)));
    }
    renderContent();
  }

  function applyPromptChange(list, pi, pf, value) {
    if (list === 'task') {
      if (pf === 'content') { cfg.prompts.task = String(value === undefined || value === null ? '' : value); }
      else if (pf === 'role' && ['system', 'user', 'assistant'].indexOf(value) >= 0) { cfg.prompts.taskRole = value; }
    } else if (list === 'head' || list === 'tail') {
      var it = cfg.prompts[list][pi];
      if (!it) { return; }
      if (pf === 'content') { it.content = String(value === undefined || value === null ? '' : value); }
      else if (pf === 'role' && ['system', 'user', 'assistant'].indexOf(value) >= 0) { it.role = value; }
    }
    syncCurrentTpl();
    saveVars();
  }
  function addPromptEntry(list) {
    if (list !== 'head' && list !== 'tail') { return; }
    if (cfg.prompts[list].length >= MAX_PROMPT_ENTRIES) { toast('warning', COPY.toasts.tooMany.replace('{n}', MAX_PROMPT_ENTRIES)); return; }
    cfg.prompts[list].push({ role: 'system', content: '' });
    syncCurrentTpl();
    saveVars();
    renderContent();
  }
  function removePromptEntry(list, idx) {
    if ((list !== 'head' && list !== 'tail') || !cfg.prompts[list][idx]) { return; }
    cfg.prompts[list].splice(idx, 1);
    syncCurrentTpl();
    saveVars();
    renderContent();
  }
  function resetTask() {
    cfg.prompts.task = DEFAULT_TASK;
    cfg.prompts.taskRole = 'system';
    syncCurrentTpl();
    saveVars();
    renderContent();
  }

  /* ── 摘要提示词模板（v1.1）──
     与「大总结模型」的多配置同构：下拉切换 + 名称框 + 存为新模板 + 删除当前模板。
     切换 = 把模板的四个字段拷回 cfg.prompts 再重画面板（结构变了必须重画）；
     切换前先把当前这套同步回它自己的快照，免得正在编辑的内容被切掉。 */
  function switchPromptTpl(name) {
    if (name === cfg.promptTplCurrent) { return; }
    var t = findTpl(name);
    if (!t) { return; }
    syncCurrentTpl();
    cfg.promptTplCurrent = name;
    cfg.prompts.head = clonePromptList(t.head);
    cfg.prompts.taskRole = t.taskRole;
    cfg.prompts.task = t.task;
    cfg.prompts.tail = clonePromptList(t.tail);
    saveVars();
    renderContent();
  }
  function savePromptTplAs(name) {
    name = String(name || '').trim();
    if (!name) { toast('warning', COPY.prompts.tplNameMissing); return; }
    syncCurrentTpl();
    var snap = snapPrompts();
    var exist = findTpl(name);
    if (exist) {
      exist.head = snap.head; exist.taskRole = snap.taskRole; exist.task = snap.task; exist.tail = snap.tail;
    } else {
      snap.name = name;
      cfg.promptTpls.push(snap);
    }
    cfg.promptTplCurrent = name;
    saveVars();
    toast('success', COPY.prompts.tplSaved.replace('{name}', name));
    renderContent();
  }
  function deletePromptTpl() {
    if (cfg.promptTpls.length <= 1) { toast('warning', COPY.prompts.tplDelLast); return; }
    var cur = currentTpl();
    if (!cur) { return; }
    cfg.promptTpls = cfg.promptTpls.filter(function (t) { return t.name !== cur.name; });
    cfg.promptTplCurrent = cfg.promptTpls[0].name;
    var t2 = currentTpl();
    cfg.prompts.head = clonePromptList(t2.head);
    cfg.prompts.taskRole = t2.taskRole;
    cfg.prompts.task = t2.task;
    cfg.prompts.tail = clonePromptList(t2.tail);
    saveVars();
    toast('success', COPY.prompts.tplDeleted.replace('{name}', cur.name));
    renderContent();
  }

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
    var len = chatLen();
    /* 空值/非数字先拦掉：Number('') === 0 会混进一条 #0（用户真机点过） */
    if (v === '' || v === null || v === undefined || String(v).trim() === '') { toast('warning', COPY.toasts.numBad); return; }
    var n = Math.floor(Number(v));
    if (!isFinite(n) || n < 0 || (len && n > len - 1)) { toast('warning', COPY.toasts.pinRange.replace('{n}', Math.max(0, len - 1))); return; }
    await loadChatState();
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
      pane: function () { return bodyEl; },
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
      loadChatState().then(function () { renderContent(); });
      renderStatus();
    }
  }
  function openPanel() { setOpen(true); }
  function closePanel() { setOpen(false); }
  function isOpen() { return !!(panelDrop && panelDrop.getAttribute('data-kami-open') === '1'); }
  function togglePanel() { setOpen(!isOpen()); }

  /* ───────── 登记按钮 ───────── */

  function updateDef() {
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
        click: function () { togglePanel(); }
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
      measured: measure.last, pipeline: { running: pipeline.running, done: pipeline.done, total: pipeline.total },
      lastError: lastError,
      panelOpen: isOpen(), regexWrites: regexWrites, entryWrites: entryWrites, disposed: disposed
    };
  }
  function inspect() {
    return {
      cfg: JSON.parse(JSON.stringify(cfg)),
      state: { lbName: st.lbName, covered: st.covered, pins: st.pins.slice(), updatedAt: st.updatedAt, error: st.error || null, adopted: !!st.adopted, blocks: st.blocks.map(function (b) { return { from: b.from, to: b.to, at: b.at, uid: b.uid, depth: b.depth, chars: b.text.length }; }) },
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
      shutdown: function () { teardown(); }
    };
    try { HOST[API_NAME] = api; } catch (e) { }
    try { window[API_NAME] = api; } catch (e) { }
  }

  /* ───────── 注销（零残留；压缩成果照章留在聊天里） ───────── */

  function teardown() {
    if (disposed) { return; }
    disposed = true;
    log('正在注销：摘事件 / 停实测钩子 / 拆面板 / 收样式 / 撤登记 / 删全局');
    try { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } } catch (e) { }
    try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } } catch (e) { }
    try { if (armTimer) { clearTimeout(armTimer); armTimer = null; } } catch (e) { }   /* R1：两段确认的 4 秒定时器 */
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
    loadChatState().then(function () { renderStatus(); });
    installMeasureHook();

    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      try { unsubs.push(eventOn(tavern_events.GENERATION_STARTED, onGenerationStarted)); } catch (e) { log('挂生成事件失败：' + msgOf(e)); }
      try { unsubs.push(eventOn(tavern_events.CHAT_CHANGED, onChatChanged)); } catch (e) { }
      try { unsubs.push(eventOn(tavern_events.MESSAGE_DELETED, onMessagesChanged)); } catch (e) { }
    } else {
      log('拿不到 eventOn/tavern_events：自动触发不可用（面板的手动触发不受影响）');
    }

    expose();
    registerButton();
    pingTimer = setInterval(function () { if (ownDef && !disposed) { ownDef.ping = Date.now(); } }, 2500);
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
