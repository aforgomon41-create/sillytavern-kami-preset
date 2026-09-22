# 项目背景（你没有上下文，以下是全部必要信息，先读完再动手）

**工作区**：`D:\SillyTavern\卡密预设0.9`
**真机酒馆**：`http://localhost:11451/`（SillyTavern 1.18 + 酒馆助手 4.9.5）
**酒馆数据目录**：`D:\sillytavern-software\SillyTavern Launcher GUI\data\st_data\default-user\`（预设放在其中的 `OpenAI Settings\`）

## 工程结构
```
src/scripts/*.js            酒馆助手脚本（构建时打包进预设）
src/regex/frontend-think.html      「显式思维链」正则内嵌前端源码（完整 HTML 文档）
src/regex/frontend-options.html    「行动选项」正则内嵌前端源码
src/skins/<id>/skin.{json,css}     三套皮肤包：trpg / rain / nixie
src/skin/base.css                  兜底皮肤（皮肤管理脚本未运行时生效）
build/build.mjs             构建：node build/build.mjs → dist/卡密预设0.9-<tag>-<N>.json（N 自增，从不覆盖）
build/lint-skins.mjs        皮肤包校验：node build/lint-skins.mjs [id]
build/kami-doc.mjs          前端文档展开器（内联兜底皮肤 / 把正文的 $ 转义成 $$ / 注入载荷 / 套三反引号围栏）
test/harness/server.mjs     静态服务器：node test/harness/server.mjs --port 87xx
test/harness/preview.html   皮肤预览台（模拟酒馆页面 + 两个真前端 iframe + 🎨 面板）
docs/皮肤契约.md             冻结版接口规范（令牌 / DOM 类名 / 状态钩子 / 各前端骨架）
docs/参考/                   旧版前端实现（只作功能参考）
dist/                       构建产物
```

## 关键机制（**必须先读 `docs/皮肤契约.md`**）
- 前端是「三个反引号围栏 + 含 `<body>` 的完整 HTML 文档」的代码块，**酒馆助手**把它渲染成**同源 iframe**（`id=TH-message--<楼层>--<n>`），iframe 高度由 `body.scrollHeight` 自动测量。
- 前端只输出 DOM + 类名 + 状态属性；**全部外观由皮肤 CSS 提供**。
- 折叠：前端只切 `.kami-collapse[data-kami-open="0|1"]`，显隐与动画由皮肤实现；脚本侧另注入一层「结构兜底层」，只负责 `data-kami-open="0"` 时 `display:none`。
- 品牌文案走 CSS 令牌 `--kami-label-*`：前端读计算样式后写进 DOM。
- 皮肤作用域 `html[data-kami-skin="<id>"] .kami-root`；兜底皮肤作用域 `html:not([data-kami-skin]) .kami-root`，两者**互斥**（皮肤生效时兜底整体失效）。
- 皮肤管理脚本（`src/scripts/30-皮肤管理.js`）会把皮肤 CSS 与 `data-kami-*` 属性同时下发到**酒馆页面**与**每个消息 iframe**。

## 硬性纪律（违反会破坏别人的工作）
1. **不要修改 `src/regex/frontend-options.html`、`src/skins/*`、`build/*`**，除非你的任务明确需要（每位 agent 只管自己那一块）。
2. **不要运行 `node build/build.mjs`**，除非你的任务需要（它会让 dist 版本号 +1，多人同时跑会撞号）。**需要构建时，只在你自己确认没有别人正在构建的间隙跑一次。**
3. 浏览器会话：**自己 `browser_session action=start` 开一个**，记下 `sessionId`，**此后每一次 `browser_*` 调用都必须显式带 `session: "<你的id>"`**。不要 start 第二次、不要 stop、不要 list；不要动 `browser_tabs` 的 borrow/return/select/close（你的任务里明确给你的除外）。
4. 截图是异步合成的，**可能返回上一帧**：先 `observe` 拿文本结论，再 `screenshot` 看观感；若图上内容与 observe 不符，再截一次。**结论以 observe / 诊断读数为准。**
5. **坐标点击会被"Agent 正在控制"浮标挡住**（已知问题）。请用 `browser_interact focus` + `press Enter` 代替 click；必须用坐标时先 `scroll-to`。
6. 完成后**不要关闭会话/标签页**，主 agent 统一收尾。

## 汇报格式
根因（要有证据链，不要猜）／改了哪一层、为什么／验证证据（命令与读数）／遗留风险。控制在 10 行内。

# 你的任务：修复「窄屏下皮肤管理面板只剩一条线」

## 现象
在**窄屏**（手机宽度）下打开 🎨 皮肤管理面板，只出现**一条线**（高度约 1–2px 的细条），看不到完整面板；把窗口恢复成宽屏后，可拖动的面板又正常出现。

## 你的资源
- **专属端口 8775**：主 agent 已经起好了服务器？如果没有，自己起一个常驻后台任务：
  `node test/harness/server.mjs --port 8775`（工作目录 = 工作区根目录）
- 预览台：`http://127.0.0.1:8775/test/harness/preview.html`（面板默认展开）
- 窄屏复现：`browser_assist({action:"emulate", session:"<你的id>", device:"iphone-se"})`（375×667）；关掉用 `{action:"emulate", session:"<你的id>", off:true}`。
  注意 emulate 之后**紧接的 navigate 会报 `session already has an unfinished command`**，等几秒重试或用 `reload` 代替。
- 预览台顶部 `#diag` 是实时诊断读数（两个真前端的 `clientWidth×clientHeight / sw / sh / 卡片数 / 皮肤命中`），**判断靠它**。
- **绝对不要碰酒馆标签页 `1476545379`**（另一个 subagent 正在独占它）。你只在自己 8775 的预览台上工作。

## 定位要求（必须给出根因，不要"试出来能用了"就交）
面板由三层拼出来，你要判断是哪一层的问题：
1. **几何层**：脚本注入的 `GEOMETRY_CSS`，在 `src/scripts/30-皮肤管理.js` 里。它保证舞台 `.kami-root[data-kami-comp="panel"]{position:fixed;inset:0;pointer-events:none}`，并给 `.kami-drop` 一个默认定位；**其中有一条 `@media (max-width:768px)` 规则把面板变成贴底抽屉**（`left:0;right:0;top:auto;bottom:0;width:auto;height:78%`）。注意脚本在窄屏时会**移除** `--kami-panel-x/y/w/h` 四个令牌。
2. **兜底皮肤** `src/skin/base.css`（作用域 `html:not([data-kami-skin])`，只在没有皮肤时生效）。
3. **皮肤 CSS** `src/skins/<id>/skin.css`（trpg / rain / nixie 三套，作用域 `html[data-kami-skin="<id>"]`）。
   **重点怀疑**：皮肤给 `.kami-drop` 写死 `height: var(--kami-panel-h)` 之类的规则，而窄屏下该令牌被移除 → 计算值失效 → 高度塌成 0；或者皮肤覆盖了舞台的 `inset:0` 导致 `height:78%` 的百分比基准变成 0。

## 必须做到的
- **三套皮肤（trpg / rain / nixie）在 375px 下都要验一遍**，不要只修一套就交。
- 修好后**宽屏（默认 1075 宽）要回归一次**，不能改坏桌面形态。
- 如果根因在皮肤里，改皮肤；如果根因在几何层/兜底皮肤里，改那一层（并说明为什么放在那层最合适）。
- 改完跑 `node build/lint-skins.mjs`（全部 PASS）与 `node build/build.mjs`（**只跑一次**，构建产物版本号会 +1）。

## 交付
- 根因 + 证据（`#diag` 读数、observe 文本、必要时截图）
- 改在哪个文件哪一层、为什么
- 三套皮肤在 375px 与桌面下的验证证据