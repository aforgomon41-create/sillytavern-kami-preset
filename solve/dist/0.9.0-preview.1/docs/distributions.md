# SOLVE 三种分发方式

适用版本：0.9.0-preview.1（预发布）；SillyTavern 1.19.x，脚本方式需要酒馆助手。三种载体需统一版本，旧引擎不能读取格式 3。内联作者工具、世界书、条件指南与Facet见 [authoring.md](authoring.md)；各版本真实页面覆盖范围见 [verification.md](verification.md)。新版检查基于自动宿主和构建包，不以dev.3页面记录替代新版验证。构建、打包和源码位置见 [release-guide.md](release-guide.md)，远程交付以仓库 Releases 为准。

| 方式 | 入口 | 放置位置 |
| --- | --- | --- |
| 动态 Import | dist/dynamic.js | 整个 dist 放在 HTTP(S) 文件服务，作者脚本导入此入口 |
| 卡内单文件 | dist/embedded.js | 完整文件内容放进角色卡的酒馆助手脚本，再追加作者定义 |
| 原生扩展 | manifest.json 与 index.js | 整个 dist 复制到独立的酒馆扩展目录 |

## 动态 Import

在角色卡的酒馆助手脚本中使用：

```js
const { install } = await import("https://你的文件地址/dynamic.js");
const SOLVE = await install();
const z = SOLVE.z;
const host = window.parent.SillyTavern.getContext();
await SOLVE.register({
  id: "my-card", version: "1.0.0",
  schema: z.object({ hp: z.number().min(0).max(100).default(100) }),
  initialData: {}
}, { characters: [host.characters[host.characterId].avatar] });
```

跨端口或跨域服务需允许酒馆页面来源的 CORS。入口会把引擎装到酒馆主页面；调试面板使用同源 srcdoc，避免跨域 iframe 无法连接父页面。服务必须保留 runtime.js 和 debug-inline.html 等构建文件。不要只上传 dynamic.js。

## 卡内单文件

把 dist/embedded.js 的完整内容粘入角色卡的酒馆助手脚本，再追加上例中从 const z 开始的代码。文件已经声明了 SOLVE，不要重复声明，也不要再导入远程引擎。内含 Core、宿主接入和完整 React/Radix 调试面板。

角色卡导出时保留酒馆助手脚本，接收者需启用该角色的脚本。该方式运行 SOLVE 不需要获取远程引擎或面板文件；酒馆助手本身和 LLM 服务仍是独立依赖。实机已在 SOLVE 文件服务返回 503 时验证冷启动、面板、真实回复和刷新恢复。

## 原生扩展

把 dist 的所有文件放进一个独立扩展文件夹，manifest.json 必须直接位于该目录。刷新酒馆后出现右下角 SOLVE 按钮。原生作者脚本可使用 window.parent.SOLVE.register(定义, { characters: [角色头像文件名] })；本项目仍要求作者明确提供定义，不会扫描并初始化所有角色。

## 共存和清理

同一酒馆页面只保留一个共享运行时和一个活动聊天控制器。同版本的动态和内嵌脚本以独立租约注册，优先级高于原生定义；脚本 pagehide 时注销自己的定义和监听器，原生定义可接管。不同引擎版本明确拒绝混用，需统一版本后刷新；当前尚不支持不同版本并行运行或无刷新热升级。

聊天已有归档时按原定义指纹恢复，不以新定义覆盖旧历史。重复注册同一定义可以累计多个角色绑定。手动关闭脚本后，若没有其他定义可接管，当前聊天会解绑。

原生扩展通过 manifest 的生成拦截器检查就绪、待保存和忙碌状态。脚本版为酒馆本地标准生成请求加传输检查；独立操作模型请求进行期间无法可靠区分内部请求与其他同时间的请求。助手或第三方直接访问外部服务的请求不在覆盖范围内，不能把这些入口称作全量拦截。

## 实机验收与复现

本轮证据在 test-results/live-distribution/，摘要见 verification.md。scripts/live-test-setup.mjs 创建独立 UUID 命名的角色和脚本；live-test-server.mjs 只在本机提供文件及测试 Git 仓库；native 安装走酒馆接口。它们是验收辅助工具，不包含在发布包中，运行前需检查其中的本机地址与酒馆路径。

常规检查：npm run check。若 Windows 的 tsx 启动器因用户信息读取失败，可执行 node scripts/check-portable.mjs：先类型检查，将相同测试编译为独立 Node 测试文件运行，再调用原构建脚本和构建包检查。没有替换断言或跳过测试。
