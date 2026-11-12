# SOLVE · SillyTavern-Oriented-LLM-Variable-Engine

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-365c49.svg)](LICENSE)
[![Version: 0.9.0-preview.1](https://img.shields.io/badge/Version-0.9.0--preview.1-647063.svg)](https://github.com/aforgomon41-create/SillyTavern-Oriented-LLM-Variable-Engine/releases/tag/v0.9.0-preview.1)

面向 **SillyTavern 1.19.x 单角色聊天**的结构化变量引擎。模型在回复里输出 JSON 操作，引擎按数据结构校验并执行，结果随聊天保存，删楼、切换回复、分支都能准确回到对应状态。玩家在状态栏里查看和修改变量，作者用声明式的数据结构描述字段、规则和状态栏布局。

![酒馆里的 SOLVE 状态栏：角色页](docs/images/statusbar-desktop-role.jpg)

| 社交页（电脑） | 角色页（手机） |
| --- | --- |
| ![社交页](docs/images/statusbar-desktop-social.jpg) | ![手机角色页](docs/images/statusbar-mobile-role.jpg) |

当前版本 **0.9.0-preview.1**（预发布）。截图为本机酒馆实际页面，使用官方数据结构和示例数据。界面设计预览（含进入聊天检测等尚未接入酒馆的部分）：[设计预览](https://aforgomon41-create.github.io/sillytavern-kami-preset/solve/preview/)。

## 安装

1. 从 [Releases](https://github.com/aforgomon41-create/SillyTavern-Oriented-LLM-Variable-Engine/releases/tag/v0.9.0-preview.1) 下载 `SOLVE-native-0.9.0-preview.1.zip`。
2. 解压到酒馆的第三方扩展目录 `public/scripts/extensions/third-party/`，得到独立的 `solve/` 文件夹，`manifest.json` 直接位于其中。
3. 重载酒馆，左下角魔法棒菜单里出现 **SOLVE 设置**、**SOLVE 调试**、**SOLVE 结构制作** 三个入口。

另有 dynamic（托管 `solve/` 目录，作者脚本导入 `dynamic.js`；只用官方数据结构时，角色脚本里一行 `import '…/auto.js'` 即可）和 embedded（酒馆助手脚本 JSON）两种分发，三种用同一份构建，见 [分发与安装](docs/distributions.md)。每个包都附带对应的 `SOURCE_CODE.zip`。

## 快速开始：用官方数据结构

官方数据结构给没有自带变量的角色卡补上一套开箱即用的变量：角色（属性、能力、状态、动机、关系）、物品与货币、地点与地图、势力、建筑、设定与伏笔、时间天气和场景情绪。规格见 [官方数据结构](docs/official-structure.md)。

在酒馆助手里给角色卡加一个脚本（每次页面加载运行一次）：

```js
await SOLVE.register(SOLVE.compileStructure(SOLVE.officialStructure), { characters: ['角色文件名.png'] });
```

再在角色描述或预设里放上给模型看的内容：

```text
{{solve_SOP}}
{{solve_guide}}
当前变量：{{solve_toon}}
```

开始聊天后，模型在回复末尾输出 `<solve_operate>` 操作块，SOLVE 执行后更新状态栏。扩展不会自动给未注册的角色卡启用 SOLVE；进入聊天时自动检测卡片自带变量（MVU / ERA / SOLVE）并询问是否使用默认结构的功能正在做，界面见设计预览。

## 状态栏

状态栏按数据结构里声明的布局渲染，任何符合标准的结构都能显示，不只官方结构。

- **横条 / 按钮 / 面板**：平时是一条显示地点、时间、天气、在场角色的横条，可收成按钮；点开是面板。电脑上是侧栏导航，手机上是底部弹出的页签。
- **页面**：人物卡（立绘、量表、状态、效果、货币、属性、能力、背包、任务、档案）、关系图与人物列表、地图、图鉴、势力、设定、建筑等，由作者在结构里组合。
- **玩家操作**：作者允许的字段可以直接改，按钮可以使用、装备、交给、丢弃，可以新建条目；操作先预演再提交，记入聊天，下一轮以一句旁白告诉模型，可以撤销。
- **⚙ 设置**：模块开关、清单上限、变化上限（按聊天保存）；剧透显示、皮肤、背景音乐与自己的曲目（本机）。「数据结构」「变量更新」两节目前只有界面，开关还不生效。
- **皮肤**：有卡密预设时跟随它的皮肤，单独使用时用 SOLVE 自带的皮肤；支持浅色和深色。

## 变量操作

模型在 `<solve_operate>` 里输出一个操作对象或按顺序执行的对象数组。实体用 `@ID` 开头定位（`@erin.items.gold.count`），其他数据从根写起（`meta.weather`）。

| 算子 | 写法 | 作用 |
| --- | --- | --- |
| `$set` | `{路径: 值}` | 写入；对象只合并写到的键。集合下写新 ID 等于新建实体 |
| `$inc` | `{路径: 数}` | 加减数值 |
| `$transfer` | `{来源: {目标: 数}}` | 从来源转给目标，总数守恒（付钱、交易、存取） |
| `$push` / `$pull` | `{数组路径: 元素}` | 追加 / 删除数组元素 |
| `$createEntity` | `{"集合.新ID": {字段}}` | 新建实体；`$from` 以模板或预制为底 |
| `$move` / `$swap` | `{路径A: 路径B}` | 搬移 / 交换 |
| `$unset` / `$deleteEntity` | `"路径"` 或数组 | 删除字段 / 删除实体 |
| `$group` | `[操作对象, …]` | 按顺序执行，全部成功才生效，否则整组撤回 |

任何值都可以写 `{"$valueOf": "路径", "$mul": 系数}` 读取已有的值。数值上下限、单次变化上限、清单上限、独一无二的物品由引擎按结构处理，被修正或失败的操作会在下一轮反馈给模型。完整说明就是 `{{solve_SOP}}` 的内容，可在调试工作台的「上下文预览」里查看。

```json
{"$group":[
  {"$transfer":{"@erin.items.gold.count":{"@mira.items.gold.count":30}}},
  {"$inc":{"@erin.items.healing_draught.count":1}}
]}
```

## 宏

| 宏 | 内容 |
|---|---|
| `{{solve_SOP}}` | 怎么写 `<solve_operate>`：每个算子的用法、执行规则和示例 |
| `{{solve_guide}}` | 结构作者写的指南：总指南、开启模块的指南、满足条件的指南，以及迁移和清单整理提示 |
| `{{solve_toon}}` / `{{solve_json}}` | 当前启用模块的状态（同一投影，两种格式） |
| `{{solve_toon::narrative}}` / `{{solve_json::narrative}}` | 去除 internal 字段 |
| `{{solve_toon::operator}}` / `{{solve_json::operator}}` | 去除 readonly 字段 |
| `{{solve_toon::@erin.condition, meta.weather}}` | 局部投影 |
| `{{solve_val::@erin.condition}}` | 单值 |
| `{{solve_feedback}}` | 上一轮的反馈 |

readonly/internal 是披露策略，不是写权限。`@` 只标记投影中的实体，真实键不带 `@`。宏只读已归档且对应当前选中历史的状态。

## 给作者

- **数据结构**：`compileStructure` 把 JSON 可序列化的字段树编译成定义，显示名、剧透等级、控件和状态栏布局不进入定义指纹。格式见 [官方数据结构 §11](docs/official-structure.md)，可以从官方结构改起。
- **作者工具与世界书**：`SOLVE.author()` 内联规则、多文件组合、世界书 `[SOLVE:…]` 条目、条件指南和 Facet，见 [作者接入](docs/authoring.md)。
- **更新方式**：随正文输出，或独立操作模型（独立连接预设或自定义请求函数，支持超时与取消），在注册时用 `attach: { mode }` 指定。
- **结构制作**：可视化编辑字段蓝图、模块、状态栏布局、交互、提示词、视图、开局数据和音乐，从左下角魔法棒菜单 › SOLVE 结构制作 打开；目前从官方数据结构起步，成果下载为 .js / .json，直接写进世界书还没接通。

注册后切换聊天会自动恢复；旧聊天按定义指纹寻找原版本，缺少时不会自动套用新版。`SOLVE.attach()` 可单次手动绑定，`SOLVE.detach()` 停止自动绑定。控制器方法：`processMessage(index)`、`submit(batch, {actionId, index})`、`setModule(name, enabled)`、`setSettings(patch)`、`replayMessage(index)`、`replayFrom(index)`、`dispose()`。

作者函数与历史：输入 schema 的 transform 只在输入边界运行；跨字段规则用 `validateState`。时间、随机数、远程结果在调用前准备并以 authorInputs 归档，Replay 复用这些值，Restore 不执行作者函数或模型请求。函数行为变化时必须更新定义版本。

## 调试面板与结构制作

左下角魔法棒菜单 › **SOLVE 调试** 打开调试面板：概览、状态、历史、操作台（预演与提交）、提示词、结构、日志；没绑定时显示原因和已注册的定义。**SOLVE 结构制作** 打开结构制作：从官方数据结构起步修改字段、模块、状态栏布局、交互、提示词、视图、开局数据和音乐，检查后下载为角色脚本（.js）或 JSON；直接写进世界书还没接通。**SOLVE 设置** 打开状态栏的设置页（当前聊天没启用 SOLVE 时会提示）。

旧版调试工作台仍可用 `SOLVE.openDebugger()` 打开：状态树与路径查询、操作预演与提交、历史对比与重放、上下文预览（JSON/TOON/指南/操作说明/反馈/独立操作提示词，带字数）、诊断日志与报告。查询和预演不保存聊天；报告里可能含变量值，分享前请检查。接口见 [调试 API](docs/debug-api.md)。

## 酒馆助手变量

在酒馆助手的变量面板展开 `solve`：

| 位置 | 字段 | 内容 |
| --- | --- | --- |
| 楼层变量 | `solve.operations` | 此回复的有序动作记录，含来源与操作指令 |
| 楼层变量 | `solve.dataPatch` / `solve.enginePatch` | 数据与引擎状态的实际变化 |
| 楼层变量 | `solve.commit` | 短提交编号、父提交、校验索引与绑定 |
| 楼层变量 | `solve.feedback` / `solve.aliases` | 执行反馈与实体别名 |
| 聊天变量 | `solve.data` / `solve.engineState` | 当前已确认的数据快照与引擎状态 |
| 聊天变量 | `solve.headId` / `solve.stateHash` / `solve.ready` | 快照对应提交、校验值和是否可用于当前聊天 |

切换回复会同步活跃快照；预演不写入。保存失败时保留上次确认状态，`ready` 标为 false。楼层格式为 3，JSON Patch 是唯一正式变更格式；旧聊天自动无损迁移。请通过操作 API 修改正式状态，脚本读取方式见 [调试 API](docs/debug-api.md#酒馆助手标准变量)。

## 开发

要求 Node.js 22 或更新版本。

```sh
npm ci
npm run check      # 类型、全部回归（264 项）、三载体构建
npm run dev        # 本机调试工作台演示，默认 http://127.0.0.1:4173/debug.html?demo=1
npm run package    # 打包到 artifacts/releases/<版本>/
npm run test:release
```

真实酒馆验收脚本在 `scripts/live-*.mjs`（需要本机测试酒馆和假模型，用法见各脚本开头）。

| 目的 | 入口 |
| --- | --- |
| 参与开发、分工和合并 | [协作指南](CONTRIBUTING.md) |
| 编写角色定义、世界书和条件指南 | [作者接入](docs/authoring.md) |
| 官方数据结构与结构描述格式 | [官方数据结构](docs/official-structure.md) |
| 设计、接口、验收和交付文档 | [文档目录](docs/README.md) |
| 完成情况与接手任务 | [当前状态](docs/implementation-status.md) |
| 变更记录 | [CHANGELOG](CHANGELOG.md) |

## 当前边界

- 已验证 SillyTavern 1.19 单聊；原生拦截器覆盖原生生成入口，不承诺拦住酒馆助手或第三方自行联网。服务端没有比较后原子写入接口，第三方绕过队列保存仍可能竞争。
- 进入聊天时的变量框架检测、默认数据结构、随正文输出的提示词注入、玩家可选的独立操作模型设置：只有界面，正在接入。
- 结构制作只能从官方数据结构起步，不能直接写进世界书；自制视图（视图页）引擎还不读取。
- 指南正文热更新、宿主关键词触发、不同版本引擎共存仍待推进；浏览器、IndexedDB 和真实保存的大规模验收未完成。

实施规范：`docs/backend-design.md`。主企划保留原文件名。

## 开源协议

从 **0.7.1** 开始，本项目采用 **[GNU AGPL v3，仅限第 3 版（AGPL-3.0-only）](LICENSE)**，具有强互惠性（通常称“开源传染力”）：分发修改版或构成同一程序的衍生作品时，需按协议提供对应源码并保留相同许可；修改版若支持通过网络与用户交互，还须向这些用户显著提供免费获取该版本对应源码的机会。协议允许商用。

源码与构建入口见本仓库，面板页脚提供源码及协议链接。独立作品仅与本项目一同存放、普通聊天数据或单纯使用本项目，并不会因此自动全部改为 AGPL；具体范围以协议正文为准。分发或部署修改版时，应提供自己的实际对应源码，不能只链接未修改的上游版本。详见 [授权与版本说明](docs/licensing.md)。

**已发布的 0.7.0 曾采用 Apache-2.0，已授出的许可无法追溯撤回。** 其标签与历史安装包保留原许可；当前版本和后续版本以各自声明为准。

第三方依赖继续遵循各自协议。浏览器构建包中的 `THIRD_PARTY_NOTICES.txt` 保留所包含依赖的授权内容，项目声明见 [NOTICE](NOTICE)。
