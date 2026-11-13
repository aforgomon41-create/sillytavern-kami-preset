# 0.8.3 精简聊天归档

目标是在酒馆助手楼层变量中直接保留操作、diff 和 commit，同时避免整包复制。格式版本独立于 Core 的 `Archive.version: '0.5'`；运行时和公开历史 API 继续使用完整 Commit。

## 文件中的位置

- `chat_metadata.solve`：开局快照、会话/定义身份，以及 `storage: {version: 3, contexts: [...], hashes: [...]}`。执行上下文以数组共享，四种完整校验值在唯一表中保存。HEAD 从有效回复指针推导，不再另存映射；Genesis 的重复身份/定义字段按默认值恢复。
- `message.extra.solve`、`swipe_info[i].extra.solve`：物理文件只保存 `{ref: 短提交编号, index?: 回复下标}`，下标为 0 时省略。原有身份属性在运行时按需展开且不参与 JSON 序列化，原生保存不会把完整指针重新存回。
- `message.variables[i].solve`：`version: 3`、当前 `operations`、`dataPatch`、`commit`，可选 `enginePatch`、反馈、别名和 `history`。当前短提交 ID 读取 `commit.id`，省略重复的顶层 headId。
- `chat_metadata.variables.solve`：当前已确认的完整 data/engineState、headId、stateHash、ready，以及必要时的 reason。快照可重建，省略 version/derived 和重复会话身份。

dev.3 会同时设置宿主原生的 chat_metadata.tainted=true，表示这份固定开局已使用，防止编辑/导出角色时重建唯一开场并丢失楼层记录。载入合法旧聊天会补写该宿主标记；它不是新的 SOLVE 存储版本、状态字段或提交。原生保存全部丢失已有提交时拒绝覆盖。

每份修订只存在一个正式楼层变量槽中。`commit.context` 引用聊天级公共上下文，编号 0 省略；`commit.binding` 是消息/回复短编号数组，历史同属一回复时省略。`commit.checks` 按 baseHash、stateHash、opsDigest、textDigest 的顺序引用 hashes 表，四种完整校验全部保留。UUID 和 SHA256 使用无损 Base64URL 编码，分别保留全部 128/256 位；作者数据、操作内容和 authorInputs 中的字符串不作编号解码。新提交及新重放不保存运行期 generationToken，待保存草稿仍保留迟到请求检查所需的绑定。

模型操作省略默认的 kind=operations、source=model，玩家操作保留 source=user，模块事件使用 module/enabled。动作编号同样无损缩短，其他作者输入保持原样。同楼旧修订的操作或反馈是当前修订的前缀时，`history` 只记录 `operationsPrefix` / `feedbackPrefix` 的数量；历史 dataPatch 与当前完全相同时使用 `dataSame: 1`。其他历史内容直接保存，所有旧修订都保留。空的 enginePatch、反馈与别名省略，读取时分别使用 `[]`、`[]`、`{}`。操作与 dataPatch 始终可以直接查看。

`getHistory()` 仍返回完整原始提交；`inspectCommit(floor.solve.commit.id)` 和 `compareCommits()` 支持短提交编号，返回展开后的完整身份、四种校验和动作。无需手动查看校验表来完成调试。

## 兼容、恢复与修改

0.8.0/0.8.1 的 `extra.solve.commits` 和 0.8.2 的格式 2 仍可读取；旧版派生楼层变量不是事实来源。打开旧聊天并绑定原作者定义后，保存格式 3 并回读，展开后的完整 Archive 必须与原归档一致。不重新执行作者规则或模型，不创建新修订。

格式 2/3 的楼层变量是正式事实来源。直接篡改操作或 Patch 会被摘要/状态哈希检查拦截；直接删除正式变量会明确失败，不能再依靠隐藏重复副本补回。聊天活跃快照仍可从正式历史重建。通过 `submit`、模块和重放 API 修改状态，通过 `getHistory()` / `inspectCommit()` 读取展开后的完整历史。

切换 Swipe、分支、保存失败重试、旧祖先保留与 IndexedDB 草稿继续沿用原逻辑。原生删除时所需的失去载体的祖先随存活楼层保存，不集中塞入聊天头。三种分发应统一升级到 0.8.3，旧引擎不能读取格式 3。

## 第二轮实测

同批聊天从 0.8.2 转换为 0.8.3 的紧凑 JSON SOLVE 载荷，不计正文，所有旧修订保留：

| 聊天 | 上轮楼层载荷 | 本轮楼层载荷 | 本轮减少 | 本轮 SOLVE 总载荷减少 |
| --- | ---: | ---: | ---: | ---: |
| 动态 | 4,861 B | 2,028 B | 58.28% | 46.59% |
| 内嵌 | 5,573 B | 2,359 B | 57.67% | 46.04% |
| 原生 | 4,674 B | 2,001 B | 57.19% | 47.00% |

动态版单次操作楼层从 1,118 B 降为 **451 B**，三个修订的楼层从 2,893 B 降为 **1,337 B**。聊天头、开局、共享表和当前快照均计入的 SOLVE 总载荷分别从 7,327/7,832/6,925 B 降为 3,913/4,226/3,670 B。

证据为 `test-results/live-distribution/compact-v3-report.json`。对当前内存对象额外执行原生式 JSON 保存并通过真实 API 回读后，短指针未膨胀、完整归档哈希不变，见 `compact-v3-native-save-report.json`。

## 第一轮实测

同一批真实测试聊天转换前后，紧凑 JSON 的 SOLVE 楼层载荷如下；不计聊天正文，且所有旧修订均保留：

| 聊天 | 原楼层载荷 | 精简后 | 减少 |
| --- | ---: | ---: | ---: |
| 动态 | 17,407 B | 4,861 B | 72.07% |
| 内嵌 | 20,079 B | 5,573 B | 72.24% |
| 原生 | 16,058 B | 4,674 B | 70.89% |

计入聊天级开局、公共上下文和活跃快照后，SOLVE 总载荷分别减少 61.42%、63.85%、60.75%。动态版单次操作楼层从 3,847 B 降为 1,118 B，三个修订的楼层从 10,517 B 降为 2,893 B。这些测试的变量状态本身很小（约 132 B），精简后仍大于单份全量状态；本轮保留完整指令、变更与历史校验，尚未采用 diff/全量结果择小保存。

完整证据见 `test-results/live-distribution/compact-report.json`，转换前备份目录写在报告的 backup 字段中。该结果验证存储和控制器，不代称浏览器页面已刷新。

## 0.9 开发版：可选的固定作者声明

registerWorldInfo 初始化的新聊天，在聊天头 solve.authoring 保存一份声明；原有聊天和手工注册不会自动增加它。楼层正式记录仍为格式 3，JSON Patch、旧修订和原有四种历史校验均保留。

作者声明的 version:1 是独立的声明格式编号，字段包括 baseHash、fingerprint、declaration、views、customValidation、books 和 digest。declaration 保存实际开局输入、实体引用、模块、数值规则、模板/预制、指南与运行时绑定；schema、视图函数和校验函数留在原 JS 包。普通世界书条目不保存。

dev.4的可选declaration.guides保存id、text、可选module/when/source。字符串when原样保存；JS条件只存when:{binding:指南id}，恢复时从原基础包按id绑定函数，不保存函数正文或闭包。声明与正文仍是开局固定值，读取时按已确认状态选取；Patch恢复不运行条件。无guides的旧快照摘要和旧定义身份不变，不增加楼层格式编号。

它不是每楼的完整状态快照，只在聊天头存一次；包含开局声明时会增加这份声明自身的体积。重新加载用声明和原包重建执行定义，再按原有 Patch 恢复状态。声明完整摘要、开局绑定摘要、原包身份与重建出的定义指纹均需一致。当前引擎下的原生保存和 SOLVE 保存禁止替换或删除已固定的声明。

IndexedDB 派生证明包含该可选声明，旧式无声明归档的证明保持兼容。声明坏掉或原包缺失不妨碍只读检查合法 Patch 事实，但不能冒用当前世界书继续写入。复制聊天/分支会自然携带声明，并保持各自的后续状态。此机制不迁移旧聊天定义，不包含跨浏览器原子保存保证。

dev.5的内联规则先归一为上述声明；Facet函数继续留在原版本JS基础包，快照只含版本绑定和JSON数据，运行时Hook名称参与定义身份。恢复不执行收集器或生命周期通知。Hook新增操作使用原有Action结构，在authorInputs.solveFacetChain中保存扩展来源链以阻止循环；Replay保留动作效果，但不重发保存后通知。没有引入新的楼层格式或替代JSON Patch。

dev.6的消息/回复、祖先和摘要位置索引只存在于单次同步打包中，不写入聊天或作为认证来源。规范JSON仍使用相同的键排序和输出字节，原SHA256不缩短；恢复仍核对每楼全部校验。打包后的归档与原归档完整对比、磁盘基线和保存回读均保留，未升级存储格式。

## claude/dev：玩家设置动作与引擎状态新键

格式编号仍为 3。玩家通过 `setSettings` 修改清单上限或单次变化上限时，楼层动作记录为 `{actionId, settings}`（与模块动作 `{actionId, module, enabled}` 并列）。引擎状态 `engineState` 可能新增 `settings`（玩家设置）与 `migration`（待发送的互斥组迁移指令），两者只在使用时出现，未使用的聊天状态与哈希保持不变。模型动作的轮次写在 `authorInputs.solveRound`，与其他作者输入一样随动作归档。旧版引擎读取含设置动作的聊天会报存储无效，三种分发需统一升级。
