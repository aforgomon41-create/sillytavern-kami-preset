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

# 你的任务：修复「显式思维链前端在真机里无法展开」

## 现象
在**真机酒馆**里，模型输出里的 `<nyaruko_think>...</nyaruko_think>` 会被正则渲染成「显式思维链」折叠面板，但**点击标题栏展不开**（一直停在折叠态）。
对照：工作区里的旧实现 `预设JSON/参考regex-前端_显式思维链(可运行).json` 是**正常的**（它的展开逻辑是给自己的 `.tc-wrap` 加 `data-tc-open`，并且自己写死 `display`）。

## 极其重要
**这个 bug 在模拟环境（`test/harness/preview.html`）里复现不了**（那里一切正常：点击后 `data-kami-open` 0→1、iframe 高度 65→414）。
所以**必须在真机酒馆里定位与验证**，不要试图靠改预览台或写单测来"证明修好了"。

## 你的资源
- **真机酒馆标签页：tabId `1476545379`（`http://localhost:11451/`）—— 这个标签页在整个任务期间由你独占使用**（另一个 subagent 被明确禁止碰它）。
- 借用：`browser_tabs({action:"borrow", session:"<你的id>", tabId:1476545379})`；用完 `return`。
- **不要碰用户的其它标签页**（B站、预览台等）。

## 我的假设（按可能性排序，请逐条验证或排除，不要直接照抄）
1. **皮肤层没实现"展开态"的 `display`**：兜底皮肤里有 `html:not([data-kami-skin]) .kami-collapse[data-kami-open="1"] > .kami-body{display:block}`，但皮肤生效时兜底整体失效；如果当前皮肤只写了"收起时 display:none"、没写"展开时显示"，那属性切了、画面不动。**注意**：脚本注入的结构兜底层只包含 `[data-kami-open="0"]{display:none}`，不包含展开态。
2. **前端脚本在真机里根本没跑**：例如酒馆助手的「Blob URL 渲染」开关打开时 iframe 是 opaque origin，或者脚本在第 56 行附近抛错导致整个 IIFE 挂掉（历史上出过一次：`new RegExp('\\*\\*([^*]+)\\*\\*')` 的反斜杠被吃掉）。用 `browser_inspect action=console` 看有没有报错。
3. **点击被吞**：真机里 `.kami-head` 的 click 可能被酒馆或酒馆助手的某层捕获（预览台里没有这些）。验证法：看点击后 `data-kami-open` 是否变化（用 `browser_inspect action=html ref=<iframe 的某个 ref>` 或 observe 的 a11y 树）。
4. **`localStorage` 在 message iframe 里抛 SecurityError 打断了 `setOpen`**：注意 `store()` 里有 try/catch，理论上不会，但要确认。
5. `data-kami-ready` 防重入标记把第二次 boot 挡掉了，而真机里第一次 boot 发生在 DOM 未就绪时。

## 让修复生效的循环
1. 改 `src/regex/frontend-think.html`
2. `node build/build.mjs`（在工作区根目录）→ 产出新的 `dist/卡密预设0.9-<tag>-<N>.json`
3. 把新产物复制到 `D:\sillytavern-software\SillyTavern Launcher GUI\data\st_data\default-user\OpenAI Settings\`
4. 在酒馆里把它选为当前预设：预设下拉在 **「AI 响应配置」抽屉**里。抽屉图标在最上面一排按钮（`title="AI 响应配置"`），用 `focus` + `press Enter` 打开；然后
   `browser_interact({action:"select", session:"<你的id>", target:"#settings_preset_openai", values:["<新预设文件名去掉 .json>"]})`
5. 硬刷新页面，再看那条消息。
**如果第 4 步你做不到**（抽屉打不开 / select 不可聚焦），**不要卡死**：把根因和修复做完，在汇报里写清"需要用户切换预设后才能做最终验证"，并把你已经拿到的证据列出来。

## 交付
- 根因 + 最小修复（改哪一层、为什么改这层）
- 真机验证证据（截图或 observe/console 读数）
- 如果不能完成最终真机验证，明确说明卡在哪一步、需要用户做什么