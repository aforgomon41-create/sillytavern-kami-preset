# SOLVE 0.9.0-preview.1 调试与恢复 API

调试界面通过本文件的接口工作。所有正式状态修改仍走操作归档；读取和预演不会直接写聊天。

## 绑定入口

原生扩展加载后使用 `SOLVE.register(definition, {characters, attach})`。`characters` 是明确绑定的角色头像文件名数组，例如 `['测试角色.png']`；`attach` 接收下方的控制器配置。页面刷新后需要作者脚本再次注册定义。已有聊天按定义指纹选取已注册版本，未绑定的新角色不自动初始化。

也可用 `SOLVE.attach(definition, options)` 手动绑定当前聊天。`SOLVE.controller` 返回当前控制器，未绑定时为 undefined。`SOLVE.sessions.getStatus()` 返回自动绑定状态及缺失定义等原因；`SOLVE.sessions.subscribe(listener)` 观察变化；`SOLVE.detach()` 停止自动绑定并释放实例。

缺少原定义时，`await SOLVE.sessions.inspectArchive(commitId?)` 可以只读查看归档和已执行状态；它不运行作者函数，也不允许用其他版本重放。

| 配置 | 说明 |
|---|---|
| `mode` | `in-band`（默认）或 `out-of-band` |
| `operatorFormat` | 独立操作模型接收 `json`（默认）或 `toon` |
| `operatorProfileId` | 独立连接预设 ID |
| `operatorRequest(prompt, signal)` | 自定义独立请求，替代连接预设服务 |
| `operatorTimeoutMs` | 超时毫秒数，默认 60,000 |
| `allowRequestsDuringOperatorBusy` | 是否允许同步忙碌期间发起新请求，默认 false |
| `cache` | 默认在支持 IndexedDB 的浏览器中启用；false 关闭，也可传自建 IndexedDbCache |
| `onError(error)` | 错误通知；回调抛错不会破坏归档 |

## 状态与定义

以下例子中的 `backend` 为 `SOLVE.controller`。

操作指南可通过 `SOLVE.getGuide(tag?)`、载体入口 `lease.getGuide(tag?)` 或 `backend.getGuide(tag?)` 读取，结果与 `{{solve_guide}}` / `{{solve_guide::combat}}` 共用筛选逻辑。tag是模块名；省略时包含全局指南。支持条件表达式与纯同步条件函数，具体写法见 [authoring.md](authoring.md)。当前聊天未绑定、未就绪或所选历史未对齐时拒绝读取，条件错误包含指南来源。`getContextPreview().guide` 也展示筛选后的指南。

| 方法 | 返回内容 |
|---|---|
| `getStatus()` | 就绪/忙碌原因、聊天和提交身份、待保存数量、缓存与宿主能力 |
| `getPerformance()` / `clearPerformance()` | 最近160条阶段耗时及成功标记；清理只影响测量记录 |
| `getVerificationStats()` | 完整恢复、后缀恢复、内存命中、已核对提交与检查点容量计数 |
| `getState()` | 已恢复的逻辑状态安全拷贝，包含 data 与 engineState |
| `getValue('@alice.hp')` | 按实体或普通路径读取值 |
| `getProjectedState({view, paths})` | 应用视图和路径筛选后的结构 |
| `getDefinitionInfo()` | Schema 描述、实体、引用、模块、数值约束、披露规则、模板和预制 |
| `getModules()` | 模块偏好与实际启用状态，含父模块影响 |
| `getMessages()` | 当前消息、回复版本、提交指针和正文，楼层下标从 0 开始 |
| `subscribe(listener)` | 状态/诊断变化通知，返回取消订阅函数 |

`getState` 等状态读取在未就绪时拒绝。历史待修复时仍可调用 `inspectCommit` 查看已归档事实。`getStatus().ready` 额外检查当前选中历史与执行位置是否对齐；界面应据此启用写入按钮。

性能阶段可能互相包含，例如adapter.save包含adapter.pack，不应把所有阶段耗时直接相加。记录不含正文、变量或作者输入；exportDebugReport同时附带这些计时和认证计数。内存检查点与IndexedDB快照分开管理，getVerificationStats().estimatedBytes只估算检查点状态的JSON字节，不是真实内存峰值。

`getStatus().cache.source`只区分IndexedDB目标快照是否命中；显示archive时，仍可能复用按当前实际归档内容核对过的进程内检查点。清理IndexedDB快照不等于清理进程内认证；显式历史验证和公开restore继续完整检查，不受内存命中影响。

## 酒馆助手标准变量

酒馆助手变量面板可展开 `solve` 查看。楼层变量是唯一正式归档，聊天快照是读取副本。0.8.3 使用格式 3 的短编号和校验索引，操作指令与 dataPatch 继续使用普通 JSON。酒馆助手脚本可直接读取：

```js
const floor = getVariables({ type: 'message', message_id: 1 }).solve;
console.log(floor.operations); // 有序动作：短 actionId、operations 或模块事件
console.log(floor.dataPatch, floor.enginePatch ?? []); // 实际数据/引擎变更
console.log(floor.commit); // 短 id、parentId、checks 校验索引、绑定
console.log(floor.feedback ?? [], floor.aliases ?? {});
const full = await SOLVE.controller.inspectCommit(floor.commit.id);
console.log(full.commit); // 展开后的完整编号、四种校验、动作来源与原始绑定

const active = getVariables({ type: 'chat' }).solve;
console.log(active.data, active.engineState); // 当前已确认的完整快照
console.log(active.headId, active.stateHash, active.ready, active.reason);
```

`message_id` 是从 0 开始的楼层下标，读取该楼当前选中的 Swipe。底层路径分别是 `message.variables[swipe_id].solve` 和 `chat_metadata.variables.solve`。同楼不同 Swipe 各有自己的变量，`operations` 和 Patch 是此回复当前累计修订的结果；更早的修订在 `history` 中使用精简形式保存。模型操作省略默认的 kind/source，模块事件保留 module/enabled，玩家操作保留 source=user；读取完整 Action 使用 `getHistory()` / `inspectCommit()`。`inspectCommit` 和 `compareCommits` 同时接受完整编号和格式 3 短编号。

聊天快照保留 `data`、`engineState`、`headId`、`stateHash` 和 `ready`，有原因时附带 `reason`。会话身份通过 `getStatus()` 或聊天级正式元数据查询，快照不再重复 version、derived、chatId、sessionId、definitionHash。切回复后同步；`ready: false` 时查看 `reason`。失败候选不发布成正式数据，预演不改变快照。快照包含完整逻辑数据，不应用 narrative/operator 的披露筛选。

楼层 `solve.version: 3` 是正式事实来源，当前短提交编号读取 `solve.commit.id`；消息 `extra.solve` 和 `swipe_info` 物理文件中仅留 ref/index。聊天快照可从正式历史重建，篡改快照会在恢复时修复。直接改坏或删除正式楼层记录会明确报告错误；正式变更必须通过操作 API。

更新引擎、刷新并绑定原作者定义后，0.8.0/0.8.1 旧聊天和 0.8.2 格式 2 会自动转换，不增加提交或重新执行指令；旧版派生楼层变量不作为迁移依据。保存后的聊天快照缺失会报告 `VARIABLES_VERIFY_FAILED`，正式归档不符则报告归档校验错误，保留候选。完整存储规则见 [storage-format.md](storage-format.md)。

## 操作、预演与模块

```js
const batch = {$group: [
  {$inc: {'@player.gold': -30}},
  {$move: {'@sword': '@player.inventory'}}
]};
const candidate = await backend.preview(batch);
// 查看 candidate.feedback / dataPatch / enginePatch / state 后，再按需提交。
await backend.submit(batch, {expectedHead: candidate.baseHeadId});
```

预演会运行作者校验与变换函数，可能存在作者自行编写的外部行为；它保证不通过 SOLVE 写入正式聊天。预演后正式状态变化时，`expectedHead` 阻止提交过期候选。正式提交会重新执行规则，预演结果本身不直接成为提交。

`submit(batch,{index,actionId,authorInputs,expectedHead})` 默认操作最后一条角色消息；`setModule(name,enabled,{index,actionId})` 切换模块。相同动作的重试复用 actionId，不同点击使用不同编号。

## 历史与恢复

| 方法 | 行为 |
|---|---|
| `getHistory()` | 所有仍保留的提交，包括旧修订、父节点、变更与反馈；标记当前和选中版本 |
| `inspectCommit(id?)` | 校验并恢复指定提交，返回状态、实体和引用，不改变正式选中状态 |
| `compareCommits(beforeId,afterId)` | 两个历史状态的 dataPatch / enginePatch 差异 |
| `validateArchive()` | 校验各个保留 HEAD，分别返回成功或具体错误和耗时 |
| `refresh()` | 重新检查并恢复当前历史；正文变化时要求重放，不能绕过不一致检查 |
| `replayMessage(index)` | 重算指定楼层，保留旧修订 |
| `replayFrom(index)` | 在同一个控制器队列中逐楼重放，失败即停止 |
| `rebuildCache()` | 清除并重建派生快照，保留待保存草稿 |

原生删除末尾楼层会恢复剩余历史；删除中间楼层需要重放后续楼层。运行中的控制器会把仍被保留修订依赖的已删楼祖先放进存活回复的归档记录。没有控制器参与的第三方删除、且祖先从聊天文件中已彻底丢失时，不能凭缓存伪造恢复成功。

0.8.4 预览版按 1.19 的原生删除事件负载对齐当前/非当前 Swipe 的下标、身份和标准变量；宿主支持 makeLast 时在已注册的助手变量处理之后执行。另一客户端已更新归档，而当前页面仍选中旧修订时，`refresh()` 不会以旧正文覆盖新结果，会报 `STATE_NOT_ALIGNED` 并要求在酒馆重新加载聊天。先处理本地草稿，再重载聊天；该操作不自动合并两个客户端的动作。

## 保存失败与请求

- `getPending()`：查看有效待保存候选。
- `retryPending()`：重用候选结果保存，不重跑操作或再次调用模型。需切回原回复版本；正文改变时拒绝覆盖。
- `discardPending()`：同步清理内存与本地草稿。若发现操作其实已经保存、仅响应丢失，会确认该事实并恢复正式结果，不把它当作未执行动作丢弃。
- `getStatus().pendingImportError`：本地草稿与当前历史不兼容或格式损坏；正式历史仍可检查，可明确放弃本地草稿后继续。
- `cancelOperator()`：取消独立操作模型请求，迟到结果不写回。

浏览器缓存失败不会改变正式聊天的权威地位，但未保存草稿可能无法跨刷新保留。放弃操作若无法清理本地缓存会返回错误，不能显示为已成功放弃。

dev.3 的 IndexedDbCache 支持容量选项、getStats()、pruneSnapshots() 和 clearSnapshots()，默认 64 份/32 MiB/每会话4份。容量清理不淘汰 pending；clear() 则明确清空快照和草稿。升级后刷新旧构建标签页。参数、估算字节与配额失败边界见 [performance.md](performance.md)。

## 上下文、日志与导出

`getContextPreview({view,paths})` 返回 JSON、TOON、指令说明、指南、当前反馈与独立操作模型的提示词预览。预览不会调用模型。

`journal.read()` 返回最多 300 条有时间和顺序的诊断记录，包含请求开始/结束、耗时、保存结果、异常与能力缺失。默认不记录 API 密钥、连接配置或原始模型提示词。`clearDiagnostics()` 清空当前控制器的内存日志。

`exportDebugReport({includeState,includeText})` 返回本地可导出的对象，默认不附完整状态与正文；历史动作及 Patch 仍可能含角色变量值。界面应说明导出内容，让用户自行决定是否分享，不自动上传。

调试面板已接入上述接口。`SOLVE.openDebugger()` 打开旧版调试工作台、`SOLVE.closeDebugger()` 关闭；页面入口在左下角魔法棒菜单（SOLVE 设置 / 调试 / 结构制作），不再显示右下角浮动按钮。SessionManager 状态额外包含当前 chatId，供界面隔离不同聊天的只读结果。0.9 开发版已增加 author、compileAuthorDefinition、compose、registerWorldInfo/readWorldInfo、条件指南和Facet生命周期，见 [authoring.md](authoring.md)；指南正文热更新、关键词触发和复杂查询仍待推进。世界书固定声明坏掉或原包缺失时，sessions.inspectArchive() 仍可只读检查合法 Patch 事实。

dev.5 的 getStatus().facetHooksPending 表示保存后回调队列的未完成数量，与正常保存 busy 分开。高级集成可 await controller.runtime.settledHooks() 等待当前及连带回调结束，并通过 runtime.getHookErrors() 读取最近最多100条回调失败；控制器日志记为 FACET_HOOK_FAILED。回调内部不能等待自身队列结束。通知失败不改变已确认保存结果，期间新状态会使旧基线上的回调操作被拒绝。

## 三种分发的共享入口

0.8.4-preview.2 起，共享运行时同时保护酒馆原生的聊天保存：原生编辑、删楼等请求使用与 SOLVE 提交相同的浏览器聊天锁，保存前核对磁盘历史。旧标签页发现历史已经变化时拒绝保存，并提示重新加载；本地编辑文字仍留在页面，用户可先复制再重载。聊天切换或控制器加载期间的延迟保存也会核对已有归档，不允许丢失或替换另一页已保存的历史。普通无 SOLVE 聊天、归档相同的文字保存及新分支不受此限制。

保护覆盖安装了当前共享运行时、经酒馆标准 `/api/chats/save` 发出的请求，包括原生 gzip 压缩。未加载运行时的页面、其他浏览器、直接修改服务器文件和第三方另设保存入口不共享这把浏览器锁，不能承诺跨这些入口的原子保存。这里的“锁”指同源标签页按顺序保存，避免两页同时覆盖同一聊天。

0.8.0 新增 `dynamic.js` 与 `embedded.js`。它们返回一个脚本作用域的 SOLVE 接口，支持 `register()`、`controller`、`sessions`、`openDebugger()`、`closeDebugger()` 和引擎工具。脚本关闭时自动 `dispose()` 注销自己的定义；也可主动调用。原生页面上的 `SOLVE.distribution()` 返回是否有原生载体以及当前脚本提供者列表，只用于检查。接入示例及版本、拦截边界见 [distributions.md](distributions.md)。

## 官方结构相关接口（claude/dev）

`setSettings`、`getSettings`、`getComputed`、`getDisplay`、`getMigration` 与全局 `SOLVE.bgm` 的说明见 [官方数据结构 11.4](official-structure.md#114-新增的控制器与全局接口)。
