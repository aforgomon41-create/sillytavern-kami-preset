# 本轮背景（先读这条，再看你的任务）

用户对皮肤提了一批意见，主 agent 已经先把**平台层**改完了，现在轮到皮肤。

## 1. 契约已更新，**必须先重读 docs/皮肤契约.md**

- **§3.7 文案硬规定（重要）**：文案分两类。
  - **功能性文案 = 前端写死，皮肤既不能提供也不能覆盖**：渲染 / 原文、填入 / 发送、复制、N 项、N 字、
    参数名、特效名与说明、示例与失败提示。你的 CSS 里如果还有 `--kami-label-render` / `-raw` / `-fill` /
    `-send` / `-think-copy` / `-hint` / `-options-hint` / `-chars` / `-empty` 之类的声明，**请全部删掉**（已失效）。
  - **风格性文案只剩三个令牌**：`--kami-label-think`（思维链收起态标题）、`--kami-label-think-open`（展开态）、
    `--kami-label-options`（行动选项标题）。
  - **重要：最终文案会由一个专职文案 Agent 用更强的模型重写。所以本轮你不要在文案上花任何精力**，
    只要保留那三个令牌、填一个中性的占位值即可（例如标题就写「思维链」「行动选项」），措辞由后面那位统一处理。

- **§5.1 骨架变了（显式思维链）**：
  - 标题栏现在只有：状态点 + 标题（**靠左**）+ 右侧动作区（**字数靠右** + 折叠箭头）；
  - **渲染/原文 切换与复制按钮搬到了展开后的正文头部**，包在一个新类 `.kami-bar` 里；
  - 也就是说：收起时看不到 seg 与复制按钮；`.kami-bar` 需要你给样式（它是组件内的横向操作行，
    区别于标题栏专用的 `.kami-actions`）。参考实现见 src/skin/base.css 里新增的 .kami-bar 规则。

- **§7 新增前缀规则**：皮肤 CSS 的**每一条选择器都必须以 `html[data-kami-skin="<你的id>"] ` 原样开头**
  （特效规则写成 `html[data-kami-skin="<id>"][data-kami-effects~="fx"] `）。
  原因：面板要做「每张皮肤卡片用它自己那套皮肤渲染」，靠的是机械替换这个前缀生成预览作用域副本。

## 2. 你的工作方式

- 只改你自己的 `src/skins/<你的id>/` 两个文件；不要动别人的皮肤、不要动 build/*、不要动 src/regex/*、不要动 src/scripts/*。
- 预览台（实时读 src/skins/，改完刷新即可，**不需要构建**）：
  **http://127.0.0.1:<你的端口>/test/harness/preview.html?skin=<你的id>**（`&closed=1` 只看前端；`&reset=1` 清状态）
- 浏览器纪律：自己 `browser_session action=start` 开一个会话，**此后每次 browser_* 调用都显式带 session**；
  不要 stop/list 别人的会话；不要动别人的标签页；坐标点击会被「Agent 正在控制」浮标挡住，用 `focus` + `press Enter` 代替。
- 窄屏用 `browser_assist action=emulate device=iphone-se`（375×667），看完 `off` 关掉。
- 结论以预览台顶部 `#diag` 的读数与 observe 文本为准（截图会返回旧帧）。
- 交活前跑 `node build/lint-skins.mjs <你的id>` 必须 **PASS**。
- 汇报 8 行内：改了什么 / 关键证据（#diag 读数）/ 遗留风险。

（新皮肤简报见下一条消息）
