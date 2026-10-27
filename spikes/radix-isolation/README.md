# 技术验证：React + Radix 的隔离方案（2026-10-27）

运行：`node spikes/radix-isolation/run.mjs`（需要 Playwright：`/workspace/tools` 里 `npm install playwright` 并 `npx playwright install chromium`，或用 `KAMI_TOOLS` 指向装了 playwright 的 package.json）。

| 环境变量 | 作用 |
|---|---|
| `KAMI_PATCH=1` | 打开两处构建期修补（见下） |
| `KAMI_TOUCH=1` | 加跑手机触屏套件（390×844，tap） |
| `KAMI_CONTROL=1` | 加跑对照组（普通 DOM，样式隔离 3 项预期失败） |
| `KAMI_ONLY_A=1` / `KAMI_SKIP_A=1` | 跳过 iframe 场景 / 跳过 Shadow DOM 场景 |

宿主页 `host.html` 模拟酒馆与用户自定义 CSS 的强硬全局样式（`button`、`*` 字体、弹层角色都带 `!important`）。

## 结论

| 场景 | 结果 |
|---|---|
| A. 宿主页 Shadow DOM，**无修补** | 样式完全隔离；鼠标交互正常；**键盘焦点失灵**：Dialog 焦点陷阱 5/5 失败，Menu 键盘 5/5 失败，Select 键盘间歇失败 |
| A. 宿主页 Shadow DOM，**两处修补** | **20/20，连续 5 次稳定**；触屏套件 7/7；修补对普通 DOM 无回归（对照组 5 次全过） |
| B. 父页面 React 渲染进同源 iframe | **不可行**：Select 一点开就关（Radix 监听的是全局 window 的 blur，React 跑在父页面，点 iframe 父页面就失焦），后续卡死。属于 Radix 依赖全局 window/document 的结构性问题 |

两处修补（在 esbuild 打包时做，不改 node_modules；修补点数量不对会直接构建失败）：

1. `document.activeElement` → 钻进 Shadow DOM 取真实焦点的读取器（Radix 的 focus-scope / select / menu / roving-focus 直接读它，在 Shadow DOM 里读到的是宿主元素）。
2. FocusScope 的 `focusin` / `focusout` 监听从 `document` 改到容器所在根节点（Shadow DOM 里冒泡到 document 的事件目标被改写成宿主元素，焦点陷阱误判逃逸、把焦点拉回去）。普通 DOM 里根节点就是 document，行为不变。

验证时的版本：react 18.3.1、@radix-ui/react-select 2.4.1、react-focus-scope 1.3.1、react-dialog 1.3.1、react-menu（随 dropdown-menu）、react-roving-focus 1.2.1。升级 Radix 必须重跑本验证。

> 注意：测试里按键后要等一拍再断言（React 异步更新），否则会出现假失败。
