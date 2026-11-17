# 作者定义与世界书编译

工作区 0.9.0-dev.5 补齐内联写法和 Facet 生命周期；它尚未公开发布。原有 Definition、compile、attach 和 register 入口继续可用。作者可以把规则写在字段旁、放入分离配置、来自世界书，或拆成多个文件，最后统一编译成同一种定义。

## 最短接入步骤

1. 在 JS/TS 中提供固定 id、version、Zod schema 和 initialData。业务规则或函数依赖改变时更新版本或 runtimeBindings.build。
2. 调用 compileAuthorDefinition(base, options)，一次性收集该角色选定的定义片段和世界书条目。
3. 把返回的 result.definition 传给 SOLVE.register，并明确指定角色文件名。

示例代码（已加载 SOLVE 的作者脚本）：

~~~js
const base = {
  id: 'my-card', version: '1.0.0',
  schema: SOLVE.z.object({ hp: SOLVE.z.number().min(0).max(100).default(100) }),
  initialData: {},
  runtimeBindings: { build: 'my-card-1', dependencies: { rules: '1' } }
};
const result = await SOLVE.compileAuthorDefinition(base, {
  worldInfo: [
    { uid: 1, comment: '[SOLVE:INIT]', content: '{"hp":90}' },
    { uid: 2, comment: '[SOLVE:GUIDE]', content: '战斗后更新 hp。' }
  ]
});
await SOLVE.register(result.definition, { characters: ['你的角色文件名.png'] });
console.log(result.sources, result.ir);
~~~

worldInfo 是由作者显式提供的条目快照，字段为 comment、content、可选 uid/source/disable。需要直接连接酒馆文件时，可使用下方 0.9.0-dev.2 新增的 registerWorldInfo；两个入口都不使用触发后被预算裁剪的条目作为结构来源。

## 直接读取酒馆世界书并自动恢复

在已加载 SOLVE 的原生或卡脚本入口中注册稳定的 JS 基础定义：

~~~js
await SOLVE.registerWorldInfo(base, {
  characters: ['你的角色文件名.png'],
  worldInfo: { characterBook: true, chatBook: false, macros: true }
});
// 或显式选择文件：worldInfo: { books: ['结构书', '开局书'] }
~~~

不指定 books 时默认读取角色主世界书；显式指定 books 时默认只读列出的文件。characterBook 和 chatBook 可额外加入角色主世界书、聊天绑定世界书，书名去重。附加书、全局书和人设书须明确列入 books，不自动扫描所有文件。文件名使用酒馆原生文件 id，不使用可不同的显示别名。

首次打开已绑定的新聊天时，入口通过同源 POST /api/worldinfo/list 和 /api/worldinfo/get 读取完整文件，按所选书顺序和文件条目顺序收集 SOLVE 标签。宿主 substituteParams 处理宏；缺少能力时含宏内容会报错，可明确设置 macros:false。没有选书、文件缺失、无启用 SOLVE 条目或格式错误时不创建默认开局。

宿主导入内置世界书时，聊天切换可能早于文件保存。dev.3 监听世界书保存与设置通知，在当前新聊天尚未建立归档、绑定失败时等待旧读取结束再重试；已固定声明的聊天不因此重新读书或更换定义。失败的书被作者修复后也可由保存通知重新检查。

首次保存时，聊天头 solve.authoring 保存一份已编译的 JSON 声明及完整摘要，包括开局、模板、预制、模块和指南；不会在每楼重复保存，也不携带普通世界书条目。刷新、切回或复制分支后，用这份声明配合原版本 JS 基础包恢复，不重新读取当前世界书、不重跑宏或作者收集器。世界书被修改或删除后，旧聊天仍可恢复；新的聊天读取最新文件。

dev.3 起，固定 SOLVE 开局在宿主中标记为“已使用”（chat_metadata.tainted=true）。即使尚未发送第一条用户消息，编辑/导出角色也不能自动重建这条开场并丢失变量历史；需要使用修改后的开场时另开聊天。原生保存若只剩聊天头、全部楼层历史已丢失，会明确阻止覆盖。载入合法旧聊天会补写该标记，不增加提交或重新执行动作。

作者脚本刷新后仍须运行一次 registerWorldInfo。基础包 id/version、schema、函数及 build/dependencies 必须保留原版本；包不匹配或声明损坏时阻止写入，可用 SOLVE.sessions.inspectArchive() 只读检查合法 Patch 历史。不能通过原生保存或提交替换已固定的声明。原有手工 compile/register 聊天没有这份声明时，必须继续注册原定义，不自动迁移。

同一个基础包可以分别给不同角色选择不同的书。同一载体再次为同角色注册时，更新该角色未来新聊天的选择，其他角色不变；旧聊天仍用归档声明。不同载体的同级候选若定义或世界书选择不同，会明确报歧义。公开 register/registerWorldInfo 的 owner 和 priority 由载体管理，不接受外部指定；低层 SessionManager 的所有权接口用于载体实现。

registerWorldInfo 返回基础包指纹，当前聊天的实际指纹见 SOLVE.controller.getStatus().definition.fingerprint。SOLVE.readWorldInfo(selection) 可单独读取选定条目供诊断或手工编译，不会绑定或保存聊天。世界书保存不会热替换活动聊天；dev.4 新增的条件指南按当前已确认状态筛选，正文和条件声明仍随开局固定。

自动接入从 base.facets 取得版本化扩展，新聊天可由这些扩展处理自定义世界书标签。基础包先编译一次，固定其内联规则、视图、条件函数、状态校验和 Hook；旧聊天恢复从该包取回函数，不重跑收集器。只存在于临时世界书/分离收集结果、没有固定在基础包中的新函数不能用于这种恢复。需要显式 detached 输入时继续使用 compileAuthorDefinition。

## 把规则写在字段旁（0.9.0-dev.5）

SOLVE.author() 返回一组本地工具。a.field 返回带注解的新 Zod 节点，不修改原节点或 Zod 的全局方法；已有的 min、max、default、refine、transform 和异步校验继续由 Zod 执行。

~~~js
const z = SOLVE.z;
const a = SOLVE.author();
const definition = {
  id: 'my-inline-card', version: '1',
  schema: z.object({
    player: a.singleton(z.object({
      hp: a.field(z.number().min(0).max(100).default(100), {
        module: 'combat',
        guide: { when: '@player.hp < 30', text: '生命值偏低，治疗时更新hp。' }
      }),
      bio: a.field(z.string().default('背景'), { readonly: true }),
      secret: a.field(z.string().default('内部记录'), { internal: true }),
      target: a.ref(z.string().nullable().default(null), { kind: 'single', onDelete: 'null' })
    }), { id: 'player', type: 'person' })
  }),
  initialData: { player: {} },
  ...a.useModules({ combat: { enabled: true, guide: '战斗时维护生命值。' } })
};
await SOLVE.register(definition, { characters: ['你的角色文件名.png'] });
~~~

hp 的位置自动识别为 player.hp；模块名和开关集中声明，不用再手写一次 paths。字段指南会带上字段路径，支持前文的表达式或同步 when 函数。readonly 从操作投影隐藏，internal 从叙事投影隐藏；这是提示内容的筛选规则，不是拒绝一切写入的权限锁。对象上标注时作用于整个子树。

| 工具 | 用法 |
| --- | --- |
| a.field(schema, options) | options 支持 module、guide、readonly、internal、numeric、source；source 可填文件名和位置以便报错 |
| a.singleton(object, {id,type,nullable?}) | 固定位置的单例实体，操作可写 @player.hp |
| a.collection(record, {type}) | Record 实体集合；实例键就是实体 ID |
| a.ref(schema, {kind,onDelete}) | 单值、数组或以引用为键的 Record；删除策略沿用原引用规则 |
| a.useEntities / a.useRefs | 生成分离实体、引用片段 |
| a.useModules / a.useGuides | 生成模块、条件指南片段；模块 paths 可省略 |
| a.useInitial / a.usePresets | 生成开局、模板与预制片段 |
| a.useVisibility / a.useViews | 生成可见性、视图片段 |
| a.compose(base, ...parts) | 与 SOLVE.compose 相同，按来源合并片段 |

~~~js
const item = z.object({
  name: z.string(),
  count: a.field(z.number().int().min(0).default(1), { numeric: { destroyOnZero: true } })
});
const inventory = a.collection(z.record(z.string(), item), { type: 'item' });
~~~

同一个 item 可以复用在背包、商店等不同位置，路径分别收集为 player.inventory.*.count、shop.*.count；数组也是 *，固定长度 Tuple 使用数字下标。Tuple 可变尾部的内置注解会明确拒绝，避免 * 同时影响固定前缀；此时用分离路径声明。交叉结构、管道输出和显式 outputSchema 也收集注解。变换若改变字段位置，应把最终状态的规则写在输出结构，必要时提供 outputSchema；工具不会从函数体猜测输出字段。

注解可放在 default/optional/nullable 等包装前后。编译只读结构和元信息，不运行默认值函数、变换或校验；这些函数在初始化、正常执行时按原规则运行，Patch 恢复不重复运行输入变换。联合类型的所有分支须给出相同内置规则，否则报错；共同规则可写在联合外层或分离配置中。循环结构不属于有限 JSON 状态的支持范围。

内联和分离配置没有覆盖优先级：相同规则去重，不同规则给出来源冲突。字段不能同时归属两个无父子关系的模块；需要嵌套归属时显式填写模块 parent。模块可以来自世界书，但合并结束时必须存在。新增 Tuple/交叉结构的完整指纹描述会区分其成员；原先使用这两类结构的开发聊天应保留原版本引擎/作者包，或另开聊天，不自动迁移旧指纹。普通旧定义的身份回归保持通过。

## 六板块与多文件组合

Schema、复杂 Zod 校验、变换及函数保留在 JS/TS 中。其他板块可通过带来源的 parts 分开维护：

~~~ts
const result = await compileAuthorDefinition(base, {
  parts: [
    { source: 'initial.ts', definition: { initialData: { hp: 90 } } },
    { source: 'guides.ts', definition: { guide: '休息时恢复 hp。' } }
  ]
});
// 不需要 IR 或世界书时，可以直接 compose(base, ...parts)，再交给 compile/register。
~~~

片段支持 initialData、entities、refs、modules、numeric、readonly、internal、guide、guides、templates、prefabs、views 和 validateState。根 schema、outputSchema、id/version 和运行时绑定集中在 base，避免合并时丢失 Zod 的跨字段规则。

- 对象合并不相互覆盖：相同叶值可重复声明，不同值报 AUTHOR_CONFLICT，并指出传入来源和字段。
- 实体与引用按 path 去重；冲突的声明会报错。可见性路径去重，指南按来源顺序追加。
- 不同视图函数占用同一名称时拒绝合并；状态校验函数按片段顺序等待执行。
- 编译不会运行 Zod 默认函数、输入变换或状态校验。它们仍在现有引擎的初始化/执行阶段运行。

## 世界书标签

标签放在 comment 开头，后面可跟便于辨认的标题。停用条目和普通世界书条目不参与收集或宏替换。除了 GUIDE，内置标签的 content 必须是严格 JSON。

| 标签 | content |
| --- | --- |
| [SOLVE:INIT] | 开局数据对象，对应 initialData |
| [SOLVE:ENTITIES] | 实体声明数组 |
| [SOLVE:REFS] | 引用声明数组 |
| [SOLVE:MODULES] | 模块名到模块定义的对象 |
| [SOLVE:NUMERIC] | 路径到数值约束的对象 |
| [SOLVE:VISIBILITY] | 含 readonly/internal 路径数组的对象 |
| [SOLVE:PREFABS] / [SOLVE:TEMPLATES] | 名称到 {type, data} 的对象。预制以自己的 ID 登场一次；模板经 `$from` 生成任意多个独立实体，`$from` 也可指向预制实体。未登场的预制与全部模板会自动列在给模型的指南里 |
| [SOLVE:GUIDE] | 普通指南文本 |
| [SOLVE:GUIDE module=combat] | 已声明 combat 模块的指南，模块启用时披露 |
| [SOLVE:GUIDE id=critical module=combat when="@player.hp < 30"] | 模块启用且条件成立时披露正文；id可省略，由内容生成稳定标识 |

模块指南可以位于模块声明之前，最终统一检查模块是否存在。除 GUIDE 外，内置标签不能附带 module 参数。未知 SOLVE 标签、非法 JSON、危险键或格式错误都会给出来源并阻止编译。

如果需要酒馆宏替换，显式传入 renderWorldInfo(content, entry)。它可以异步返回替换后的文本；编译器会在替换后检查 JSON。引擎不执行世界书中的 JavaScript，也不尝试把任意 JSON 当成 Zod 函数。

## 条件指南（0.9.0-dev.4）

世界书条目的标题和正文分别这样写：

~~~text
标题：[SOLVE:GUIDE id=critical module=combat when="@player.hp < 30"]
正文：重伤时及时更新生命值和相关状态。
~~~

module和when同时存在时必须同时满足。不写when始终提供；不写module不受特定模块开关约束，但条件仍不能读取休眠字段。标题参数可以换序；表达式中含字符串时可用单引号包住整个条件：

~~~text
[SOLVE:GUIDE id=trade when='world.phase == "交易"']
~~~

when支持实体路径（@player.hp）、普通点路径（world.phase、items.0.count）、有限数值、字符串、true/false/null，以及以下运算：

- ==、!=、===、!==：严格类型相等/不等，不把文本"30"当作数值30；对象和数组不能直接比较。
- <、<=、>、>=：仅比较数值。
- !、&&、||及括号：逻辑非、并且、或者；优先级依次为!、比较、&&、||，支持短路。

缺失实体、缺失路径和休眠值均视为未知，不匹配；否定未知仍是未知，missing != true不会误触发。true || missing成立，false && missing不成立。普通数值或文本不会自动当作布尔值，需显式比较。表达式最长4096字符、最多512个词元、括号/否定嵌套最多32层；不支持赋值、函数调用、算术、通配符和方括号访问。语法或类型错误会指出指南id与来源。

JS/TS作者在Definition.guides中声明规则。旧guide字符串和modules[name].guide继续有效，输出顺序为全局字符串、已开启模块字符串、按声明顺序命中的guides：

~~~js
guides: [
  { id: 'critical', module: 'combat', when: '@player.hp < 30', text: '重伤时的操作说明。' },
  { id: 'critical-ratio', module: 'combat', when: ({ get }) => {
    const hp = get('@player.hp'), max = get('@player.maxHp');
    return typeof hp === 'number' && typeof max === 'number' && hp < max * 0.3;
  }, text: '生命值低于最大值30%时的额外说明。' }
]
~~~

get(path)返回状态值的独立副本；缺失或休眠字段返回undefined，包含休眠后代的整个父对象也不披露。条件函数须为纯同步函数并返回boolean；Promise、非布尔返回值或异常会明确报错。编译、保存声明和Patch恢复都不会运行条件函数。函数行为和闭包依赖改变时须更新作者包version或runtimeBindings.build；指南id和函数绑定标记进入指纹与JSON快照，函数本体留在原JS包。自动世界书接入要求函数规则定义在base中，不能只存在于临时收集片段。

函数版本是一项作者约定：如果更改函数体或闭包值却不更新version/build，引擎不能自动识别这种变化。仅带id、不带when的世界书GUIDE也进入guides数组，排在旧模块字符串之后；同id同内容去重，同id不同内容报冲突。不带module的规则不随其他模块关闭而停用，但读取休眠字段仍得到未知值。

~~~js
SOLVE.getGuide();                    // 全局和已开启模块的适用指南
SOLVE.getGuide('combat');            // 仅combat模块的适用指南
SOLVE.controller.getGuide('combat'); // 同一结果
~~~

对应宏为{{solve_guide}}和{{solve_guide::combat}}，已停止的载体入口和未就绪聊天不能读取有效指南。独立操作模型请求也使用同一筛选器。指南读取不写变量、不新增历史提交，修改世界书不会热替换旧聊天的指南。完整示例见 examples/conditional-guides.ts；这是按状态选择指南，不包含宿主原生世界书关键词扫描或会话内指南正文热更新。

## Facet 扩展与生命周期

Facet 是有固定版本的作者扩展；编译前收集声明，运行时接收指定阶段的回调。原有 registerDetached 和 parseWorldInfo 继续允许异步返回上述定义片段：

~~~ts
const facet = {
  id: 'extra-stats', version: '1', build: 'extra-stats-1',
  registerDetached: async source => ({ initialData: { hp: source.hp } }),
  parseWorldInfo: async entry => entry.tag === 'HP'
    ? { initialData: { hp: Number(entry.content) } }
    : undefined
};
const result = await compileAuthorDefinition(base, {
  facets: [facet],
  detached: [{ source: 'stats.json', facet: 'extra-stats', data: { hp: 90 } }]
});
~~~

同一未知标签只能有一个 Facet 接收；重复 id、多个接收者、缺少收集器均拒绝。内置标签由内置收集器处理。Facet 的 id/version/build/dependencies 会进入定义指纹。编译器在首次等待前固定输入快照和方法引用；函数闭包中的外部依赖仍由作者固定，并填写版本与依赖信息。

dev.5 增加以下入口，可直接放在 base.facets 中：

| 入口 | 调用时机与结果 |
| --- | --- |
| extendZod(schema) | 收集前按扩展顺序执行，返回 Zod 结构；可异步 |
| collectInlineMeta(schema, {path,metadata}) | 对结构节点读取自定义 .meta() 元信息，返回定义片段或 undefined；可异步 |
| runtimeHooks.afterCompile({fingerprint,ir}) | 完成编译后读取冻结的编译清单；可异步，失败会终止这次编译 |
| runtimeHooks.beforeProjection({facetId,view,paths?,data}) | 内置筛选后、自定义视图前读取独立副本；同步返回新对象，或 undefined 保留原结果 |
| runtimeHooks.onStateCommitted({facetId,commit,state,sessionId,submit}) | 新动作保存并确认后读取提交和状态副本；可异步，不阻塞正常保存返回 |

~~~js
const labels = {
  id: 'labels', version: '1',
  collectInlineMeta: (_schema, {path, metadata}) =>
    typeof metadata.label === 'string' ? { guide: `${path}：${metadata.label}` } : undefined,
  runtimeHooks: {
    beforeProjection: ({data, view}) => ({ ...data, displayMode: view }),
    onStateCommitted: async ({state}) => { console.log('已确认状态', state.data); }
  }
};
// 字段写法：z.number().meta({ label: '当前金币' })
// base 中添加：facets: [labels]
~~~

beforeProjection 获得的数据已经过模块、视图可见性和路径筛选；返回的显示字段不写回正式状态。只修改副本却不返回它不会改变输出。该入口必须同步，才能保持宏/API 的同步读取；异步返回、非对象或异常都明确报出扩展来源。它只限制传入的数据，不能隔离作者 JS 自行读取的全局对象。

onStateCommitted 只在新动作确认保存后调用；保存失败不调用，相同 actionId 的成功重试不重复通知，Restore、Replay、刷新和切换历史也不重发。Replay 仍按历史中的动作重建结果，包括已经保存的扩展动作。回调失败记录 FACET_HOOK_FAILED，不撤销已成功的保存。此通知没有跨进程的送达保证；外部服务若需要重试，应以提交 ID 自行去重。

需要改变正式状态时使用 await context.submit(batch)，例如把扣钱和送物品放在一个 $group 内提交。宿主会排入正常动作队列并检查原聊天、消息、回复版本和提交基线；来源链阻止同一扩展再次处理自身动作及 A→B→A 循环。每次回调的 submit 都以收到的 commit 为基线；需要多步修改时合成一个 batch。若等待期间已有新提交、切换回复或离开聊天，提交会拒绝并记录诊断，不自动套用到新状态。独立 SolveRuntime 未配置宿主 dispatcher 时只可观察，不能调用该提交入口。

保存后回调使用独立队列，避免回调等待自己提交时卡住。SOLVE.controller.getStatus().facetHooksPending 可查看待完成数量；controller.runtime.settledHooks() 可等待队列结束，getHookErrors() 查看最近最多100条失败。不应在回调内部等待 settledHooks() 自己结束。未完成通知不计入正常写入 busy；状态推进时需处理上述基线变化。

扩展方法和元信息在首次异步等待前固定。重新注册已编译定义不重复 extendZod/内联收集；显式再次调用 compileAuthorDefinition 会产生一次新的编译观察 afterCompile，旧聊天快照恢复则不调用任何编译/提交 Hook。新增扩展可通过新一次显式编译加入，但仍产生新的定义身份。

参与作者采集的自定义元信息使用普通对象、数组、基础值或函数；循环引用和类实例会明确拒绝，以免异步采集读到不断变化的对象。未使用SOLVE注解/Facet的普通compile不额外收集这些元信息，原Zod的其他meta内容保持原行为。

Facet 版本、依赖和运行时 Hook 名称进入身份校验，函数本体留在原 JS 包，不能由世界书 JSON 还原。更改函数、闭包或依赖时更新 version/build；引擎不能检测未换版本的闭包变化。同 ID 的基础扩展和 options 扩展只有版本与方法引用都一致才允许合并，临时增删或替换原包扩展不能冒充固定声明。

## 编译结果与旧聊天

result.definition 是可交给现有引擎的可执行定义。result.ir 是冻结、可 JSON 序列化的声明清单，包含结构与输出约束、实体引用、数值规则、模块、指南、预设、视图名称及绑定信息；函数本体留在可执行定义中。result.irHash 便于比对结果，result.sources 用于定位来源。IR 目前用于检查，不能单凭它重新生成任意作者函数。

新入口把实际开局数据摘要加入定义指纹。更改世界书开局、模板、结构或扩展版本后得到新定义，不能静默接管旧聊天。手工入口的旧聊天继续注册原定义；registerWorldInfo 的旧聊天使用归档声明配合原 JS 包恢复。缺包时沿用只读归档检查。首次把既有卡从普通 compile 切换到新作者入口，也要保留旧注册包，并另开聊天使用新定义，不自动迁移历史。

手工入口在 compileAuthorDefinition 调用时收集，registerWorldInfo 在新聊天首次绑定时收集；恢复使用归档声明或原定义，Patch Restore 不读取当前世界书、不运行作者收集器。Replay 继续使用已绑定定义和原操作。指南正文和条件声明按首次编译固定，读取时根据当前已确认状态筛选；尚未接入宿主原生关键词触发和指南正文热更新。

## 完整示例

- examples/simple-definition.ts：只有生命值的最小定义与受伤操作。
- examples/rpg-definition.ts：购买时把扣钱和移动物品放入同一个原子组。
- examples/modular/：结构与拓扑、世界书初始数据/模板/预制/指南、模块与引用的多文件定义。
- examples/inline-authoring.ts：内联人物字段，以及复用物品结构的背包/商店原子购买。
- examples/authoring-workflow/：结构、世界书和自定义元信息/标签 Facet 分文件编写，视图添加派生显示字段。

构建后从 author-examples.js 导入原有示例，或 inlinePersonDefinition、inlineShopDefinition、inlineBuySword、compileInlineWorkflowExample。构建包检查会执行人物初始化、原子购买和多文件工作流，核对实际状态、条件指南和投影；这些示例不调用模型、不访问真实聊天。
