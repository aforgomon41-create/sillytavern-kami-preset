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

环境变量：`ST_URL`（默认 `http://127.0.0.1:8000/`）、`ST_ROOT`（默认 `/workspace/st-test`，截图与设置文件位置）、`ST_SETTINGS`（设置文件路径）。

## 已知的坑

- **首次打开要走完欢迎向导**（填人设名并保存），在那之前酒馆**不保存任何设置**。`install-preset.mjs` 会自动点掉它。
- **酒馆助手的「启用预设内嵌脚本」确认窗只弹一次**（按预设名记在 `extension_settings.tavern_helper.script.popuped.presets`），
  没点「确认」脚本就不会跑，症状是页面上一个卡密脚本都没有。`install-preset.mjs` 关掉页面后会把预设名补进 `script.enabled.presets` 再重新打开。
- 按标签固定检出的酒馆助手不在分支上，酒馆的扩展自动更新会报 500；`setup.sh` 已把它的 `auto_update` 关掉。
- 本机沙箱经代理上网：用 `curl` 访问本机酒馆要加 `--noproxy '*'`，否则拿到的是代理返回的 403。
- 酒馆默认接口是 AI Horde，启动时去查它的在线状态，没外网会报两个 500，与预设无关；切到对话补全后就不再查。

## 已用它抓到的问题

- 2026-10-27：工具箱每次刷新都启动失败（「运行库未加载」，脚本并行加载的竞态），预览台与单测都没发现。已在 main 修复（提交 0dd9fc8）。
