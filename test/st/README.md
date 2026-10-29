# 本机测试酒馆

真实的 SillyTavern + 酒馆助手环境，用来验证预设在真酒馆里的行为（消息清洗、脚本并行加载、宿主样式等预览台模拟不了的东西）。

| | |
|---|---|
| 版本 | SillyTavern 1.18.0 + 酒馆助手 4.11.3（与作者的测试环境一致；可用环境变量 `ST_TAG` / `TH_TAG` 换版本） |
| 搭建 | `bash test/st/setup.sh [目录]`，默认装到 `/workspace/st-test`（不在仓库里） |
| 启动 | `cd /workspace/st-test/SillyTavern && node server.js --port 8000 --listen false --browserLaunchEnabled false` |
| 浏览器 | Playwright 的 Chromium：在仓库外的目录 `npm install playwright` 并 `npx playwright install --with-deps chromium`；脚本默认从 `/workspace/tools` 取，换位置用 `KAMI_TOOLS=<那里的 package.json>` |

## 工具

| 脚本 | 作用 |
|---|---|
| `check-st.mjs` | 打开酒馆，确认主界面与酒馆助手加载成功，打印出错的请求并截图 |
| `install-preset.mjs <预设JSON>` | 按用户在界面里导入的流程装预设：切到对话补全 → 上传 → 确认酒馆与酒馆助手的弹窗（覆盖 / 启用内嵌正则 / 启用内嵌脚本）→ 重新打开核对运行库、皮肤、按钮与脚本日志 |
| `reload-check.mjs [次数]` | 反复刷新，统计脚本启动失败（例如「运行库未加载」）的频率 |
| `open-toolbox.mjs` | 关掉自动弹出的引导，打开工具箱面板，核对面板与页签并截图 |
| `chat.mjs "<话>" [--html] [--shot 文件]` | 和默认角色 Seraphina 聊一句（自动选角色、自动连接接口），等回复渲染完，打印最后一条消息的原文、原生思维链、iframe 与 `.kami-root` 数量 |
| `mount-probe.mjs` | 消息挂载验证：给 `[data-kami-mount]` 挂 Shadow DOM，触发重载聊天与单条重绘，核对自动重挂 |
| `message-next.mjs [--mobile] [--shots]` | 新消息前端（「🧪 消息前端」脚本）：接管回复、流式期间逐步排版、生成结束出选项、只在最新回复出选项、填入 / 发送、编辑时让回酒馆的编辑框、重载重挂、删除清理、实际渲染对比度、注销后不留东西（32 项） |

## 假模型接口

`node test/mock-llm/server.mjs`（默认 `http://127.0.0.1:8787/v1`，OpenAI 兼容，支持流式与原生思维链）。酒馆里选「对话补全 → 自定义（OpenAI 兼容）」，
地址填上面那个、模型 `kami-mock`（本机测试酒馆已配好，并打开了「自动连接」）。

- 默认回复模仿卡密预设的输出格式：思维链 + 正文 + 行动选项。
- 在消息里写 `[mock:<场景>]` 换场景：`native`（原生思维链）、`plain`、`long`、`mount-probe`。
- 测试脚本可 `POST /__mock/next` 精确排队下一条回复（`content`、`reasoning`、`chunk`、`delayMs`），`GET /__mock/requests` 核对酒馆实际发出的提示词。

环境变量：`ST_URL`（默认 `http://127.0.0.1:8000/`）、`ST_ROOT`（默认 `/workspace/st-test`，截图与设置文件位置）、`ST_SETTINGS`（设置文件路径）。

## 已知的坑

- **首次打开要走完欢迎向导**（填人设名并保存），在那之前酒馆**不保存任何设置**。`install-preset.mjs` 会自动点掉它。
- **酒馆助手的「启用预设内嵌脚本」确认窗只弹一次**（按预设名记在 `extension_settings.tavern_helper.script.popuped.presets`），
  没点「确认」脚本就不会跑，症状是页面上一个卡密脚本都没有。`install-preset.mjs` 关掉页面后会把预设名补进 `script.enabled.presets` 再重新打开。
- 按标签固定检出的酒馆助手不在分支上，酒馆的扩展自动更新会报 500；`setup.sh` 已把它的 `auto_update` 关掉。
- 本机沙箱经代理上网：用 `curl` 访问本机酒馆要加 `--noproxy '*'`，否则拿到的是代理返回的 403。
- **导入后要确认两道闸门**：酒馆助手脚本放行（`tavern_helper.script.enabled.presets`）与预设正则放行（`preset_allowed_regex.openai`）。确认窗点了也可能因为酒馆延迟保存没落盘；`install-preset.mjs` 会把两者都补上。症状分别是「一个卡密脚本都没有」和「行动选项 JSON 原样显示、正文没套壳」。
- 酒馆默认接口是 AI Horde，启动时去查它的在线状态，没外网会报两个 500，与预设无关；切到对话补全后就不再查。

## 已用它抓到的问题

- 2026-10-28：酒馆助手的 `generate()` 只生成文本、**不写进聊天**——拿它做「行动选项 · 发送」不会出新楼层（旧行动选项前端也是这么写的）。新消息前端改走酒馆自己的发送流程（选项放进输入框 → 点发送键，再把用户原来的草稿放回去）。
- 2026-10-28：酒馆统计提示词（dry run）时也发 `GENERATION_STARTED`，没有对应的结束事件；拿事件记「正在生成」会一直卡住。改为以停止键是否可见为准。

- 2026-10-27：工具箱每次刷新都启动失败（「运行库未加载」，脚本并行加载的竞态），预览台与单测都没发现。已在 main 修复（提交 0dd9fc8）。
