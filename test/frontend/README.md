# 新前端的测试

| 命令 | 内容 |
|---|---|
| `npm run typecheck` | TypeScript 类型检查（源码 + 测试） |
| `npm run test:frontend` | 单测：色彩与对比度、令牌引擎（含随机种子性质测试）、皮肤包校验、样式合成、皮肤 CSS 检查、样式表共享（已接进 `build/build.mjs`） |
| `npm run build:frontend` | 打包新运行库与展示台到 `.cache/frontend/` |
| `npm run audit:frontend` | **实际渲染审计**（需要 Playwright，见 `test/st/README.md`）：3 套皮肤 × 明暗 × {320, 390, 1440}px，在敌意宿主页里逐个文字元素按实际叠加后的背景算对比度；另查输入框与占位、悬停态、下拉弹层、提示框、对话框、样式隔离、窄屏横向溢出。加 `--quick` 只跑一组，`--shots` 存截图到 `.cache/` |

展示台：`node build/frontend-build.mjs` 后用任意静态服务器打开 `test/frontend/playground/index.html?skin=fallback|paper|abyss&scheme=dark|light`。
`paper`（粉纸浅黄）与 `abyss`（近黑暗红）是故意配得刁钻的测试皮肤，用来证明「任何种子都可读」在真实渲染里也成立。

浏览器审计没有接进 `build.mjs`（构建不依赖常驻浏览器），改动设计系统或皮肤引擎后手动跑。
