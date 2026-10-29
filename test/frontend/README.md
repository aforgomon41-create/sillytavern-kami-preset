# 新前端的测试

| 命令 | 内容 |
|---|---|
| `npm run typecheck` | TypeScript 类型检查（源码 + 测试） |
| `npm run test:frontend` | 单测：色彩与对比度、令牌引擎（含随机种子性质测试）、皮肤包校验、样式合成、皮肤 CSS 检查、样式表共享（已接进 `build/build.mjs`） |
| `npm run build:frontend` | 打包新运行库与展示台到 `.cache/frontend/` |
| `npm run audit:frontend` | **实际渲染审计**（需要 Playwright，见 `test/st/README.md`）：3 套皮肤 × 明暗 × {320, 390, 1440}px，在敌意宿主页里逐个文字元素按实际叠加后的背景算对比度；另查输入框与占位、悬停态、下拉弹层、提示框、对话框、样式隔离、窄屏横向溢出。加 `--quick` 只跑一组，`--shots` 存截图到 `.cache/` |

| `node test/frontend/browser/panel.mjs` | 面板交互：宽屏拖动 / 夹回 / 缩放 / 方向键 / 窗口变小收回 / Esc，窄屏贴底抽屉的回弹与下拉关闭 |

| `node test/frontend/browser/touch.mjs` | 手机触屏：滑过按钮不触发碎光、点按才触发；页签内容区左右滑动切换、翻页时页签条跟随、页签条横滑与竖向滚动不误翻页；选择卡无勾选框、标题不出界不压 i 按钮、条目名所有 emoji 换图标；抽屉从标题栏 / 内容区（滚到顶）下拉收回（需先打包预览） |

| `node test/frontend/browser/skin-panel.mjs` | 皮肤管理面板（电脑 / 手机）：卡片 / 配色 / 特效 / 参数都按清单生成，换皮肤立即套用且可撤销，配色 / 动效 / 密度写盘并同步渲染面属性，滑杆键盘与拖动（圆角令牌真的变），恢复默认 + 撤销，刷新后设置还在，每套皮肤 × 每档配色的实际对比度（需先打包预览） |
| `node test/frontend/browser/panels.mjs` | 工具箱与引导预览：只显示开着的功能的参数、清除要点两次、搜索来源 / 限额由旧系统目录与字段生成、换来源显示对应项、常驻指令空内容打不开、标签处理确认窗；引导免责声明确认门禁、选皮肤立即套用、完成页汇总、每步两档配色对比度与溢出（需先打包预览） |
| `node test/frontend/browser/message.mjs` | 消息前端（电脑 / 手机）：正文排版（两字缩进、注释与标记不显示、各行内部件）、思维链默认收起显示字数与排版 / 原文、搜索资料、只有最新回复有选项、填入接在已有内容后、发送触发流式（逐步排版、光标、结束出选项）、碎光三档实际渲染对比度、不溢出、宿主样式隔离（需先打包预览） |

展示台：`node build/frontend-build.mjs` 后用任意静态服务器打开 `test/frontend/playground/index.html?skin=fallback|paper|abyss&scheme=dark|light`。
`paper`（粉纸浅黄）与 `abyss`（近黑暗红）是故意配得刁钻的测试皮肤，用来证明「任何种子都可读」在真实渲染里也成立。

浏览器审计没有接进 `build.mjs`（构建不依赖常驻浏览器），改动设计系统或皮肤引擎后手动跑。
