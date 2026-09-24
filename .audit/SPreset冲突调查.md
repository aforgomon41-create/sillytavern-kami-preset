# SPreset（第三方脚本）与本预设前端的冲突调查

日期：2026-09-24 · 排查人：子智能体（沙盒全权限会话）
相关文件：`收到的文件/ujlfEYPa.json`（引导器脚本 JSON）、`收到的文件/regex_bind_inject.js`（SPreset 本体，233879 B）、`build/merge-handedit.mjs` 之外的 `.audit/inspect-spreset-flags.mjs`、`.audit/make-spreset-fixture.mjs`、`.audit/dump-bootstrap.mjs`、`.audit/clear-base-regexbinding.mjs`。

## 一、结论（先行）

1. **用最新版本的 SPreset（229 KB，本地存档）× 酒馆 1.18.0 × 酒馆助手 4.11.0 × 本预设，两个前端（显式思维链 / 行动选项）完全正常：渲染在、点击在、填输入框也在。** 本次用真机（localhost:11451 的真实酒馆实例，一条小样本聊天）做了真实点击验证。A 组（未开 SPreset）、B 组（开启 SPreset 后）的读数一致（§四）。
2. 因此「一开启就点不动」**在当前组合下复现不出**。能合理造成这种故障的只有代码里那条旧版通路：SPreset 在酒馆版本小于 1.13.05 时会走旧版兼容分支（`regex_bind_inject.js:3885-4490`），把预设正则复制一份塞进**全局正则表**（id 加 `preset_` 前缀），并触发 `ctx.reloadCurrentChat()`。这套旧分支里还有设置面板时的 MutationObserver 与气泡报错弹窗。旧版链路上的双重正则应用（全局复制 + 原生预设正则）或它自身的崩溃弹窗，才能把正则链路压坏。用户端若仍在用旧版酒馆（<1.13.05）或者她那边的 `https://jnai2d9kgnbs6xzx5c.com/regex_bind/inject.js` 是**自动更新的旧版本**，则落进这条坏通路 —— 这也是「作者复现不出来」的最合理解释（作者环境是新酒馆 + 新脚本，走的是 11305+ 的「ST 为权威、只从 ST 同步」的安全路径）。
3. **本预设侧的真正兼容债**是 `build/build.mjs:200-204` 的镜像同步与 `src/preset.base.json` 里继承的 13 条旧正则。这次已经落地清理（§六），防的是两件事：把 110 KB 的 SPresetSettings JSON 塞回预设条目的垃圾写入，以及预先「自带旧正则」与 ST 原生数据不再对齐。
4. 本次 A/B（带 SPreset.RegexBinding 数据 vs 不带）在受控环境裡**两侧都无伤**，不能作为"清空就能修复用户问题"的证据；那一步修复方向只能定「卫生防御」，不是治用户症状的药。真正该改的是**用户当场的环境**（见 §七给用户的处置）。

## 二、复现手段

### 受控环境（8792 harness）
- `test/harness/preview.html` 加了 `?spreset=1` 开关（改动带注释，只有这一处调用 + `installSpresetHost` 一段函数）：装 jQuery / toastr 之后，把本地 `收到的文件/regex_bind_inject.js` ** 以宿主页 `<script>` 的方式注入**（与真机的注入层级一致），并替身 `/version`（1.18.0）、事件源、事件类型、扩展设置，把 mock 酒馆上下文补到能跑起来的程度；它的外网域名请求（编辑器 UI `bundled.html`）被拦截。夹具 `.audit/spreset-fixture.json` 由 `.audit/make-spreset-fixture.mjs` 从最新产物抽 extensions 提供。
- 预览台 Click 判据「渲染了但点不动 / 根本没渲染」：思维链折叠头点击 → 展开出现「渲染/原文/复制」；行动选项卡片点击 → 输入框被填。两组均通过（SPreset 已在宿主页运行：控制台无报错，9 事件监听）。
- **结论：受控环境无任何前端异常**，与真机实测一致。

### 真机（有说服力的一路）
通过酒馆助手「+ 脚本」把收到的引导器原样建为全局脚本并把开关打开——这就是用户的原操作（脚本运行后把 `<script src="https://jnai2d9kgnbs6xzx5c.com/regex_bind/inject.js">` 挂进页面 body）。控制台确认远端脚本运行成功：`displayVersion SillyTavern 1.18.0`、`initializeMenuSections`、`loadSettingsToForm`、`APP_READY`。**（证据是活的远端 inject.js，与本地的 regex_bind_inject.js 一致版本。）**

**（已清理）**：测试脚本已删除并刷新页面；控制台不再出现 jnai… 的日志。SPreset 启动期间的写入只动了内存对象，不会落盘（`saveSettingsDebounced` 只在编辑器提交时才被触发）。

## 三、机制（代码级，被真机排除的是哪一块）

### SPreset 会动的三样东西
被它启动期做的改动主要落在这三条，全部有出处：
- `regex_bind_inject.js:58-62`：把 `chatCompletionSettings.prompts` 里 `role === 'model'` 的条目改成 `assistant`（当场生效，用户不打自招——真机也做了；本预设没有 model 角色条目，因此无感）。
- `regex_bind_inject.js:3752-3754` + `5343-5369`：启动时 `getRegexesFromPreset()` 从预设 `extensions.SPreset.RegexBinding.regexes` 读，若 ST 已有 regex_scripts（≥1.13.05）则以 ST 为准 `syncFromST`，并把整份 SPresetSettings JSON 写回一条 `SPresetSettings` prompt（没有就 **addPrompt 新增**塞进预设）→ 110 KB 的 JSON 条目会被激活。
- `regex_bind_inject.js:4210-4218 & 4194-4207`：把 ST 的正则与 SPreset 自己那份合并后再 `syncToST()` 写回。

### 保存点击密码的两条「坏通路」（唯一可能压坏前端的地方）
1. **酒馆 <1.13.05（旧版兼容分支）**：预设正则本应当只在原生列表里；这条分支会把它们再复制到全局正则表（id 加 `preset_` 前缀）+ `ctx.reloadCurrentChat()` —— 正则可能被**双重替换**，前端载荷被套两层或/与 reload 抢跑，表现就是「要么不渲染、要么点不动」。
2. **预设里自带的旧 RegexBinding 数据（13 条本次清理前状态）+ 新酒馆**：SPreset 启动后两份并存的正则 id 会混进它的合并逻辑（`syncFromST` 只会 push 新的不会删旧的）。一旦用户在 SPreset 编辑器里保存任意东西，`commitBindings(2542+)` 调 `syncSPresetRegexesToCurrentST()`，把这份混着**旧 id 的列表**整个写回 `extensions.regex_scripts`——就是「预设内正则改成了一份带陈旧条目的组合」，随机引发非故障侧的连锁（这次无论如何都没复现）。

### 观测假象的教训（重要）
真机一次读取里曾出现「行动选项卡片的 6 个按钮从无障碍树消失」的疑似复现；**随后复测证明这是抽屉遮挡下的 a11y 缺帧假象**，同一楼层刷新后的完整树里卡片、填入/发送按钮齐全，点击卡片成功填输入框（§四读数）。所以「前端渲染出来了但点不动」这一表现，在此次环境里**只出现过一次假象**，不能当证据。

## 四、A / B 读数（真机，全部真实点击）

| 读数 | A 未开 SPreset | B 开 SPreset 后 |
| --- | --- | --- |
| 思维链头按钮 | 点击后展开（内容出现） | 「思绪展开 2363 字」，渲染/原文/复制 都在，点击无异常 |
| 行动选项卡片 | 6 张卡可见可点 | 6 张卡可见；点「直接拉入怀中」成功填入输入框「伸手一把扣住柚香纤细的手腕…」 |
| 控制台 SPreset 报错 | — | 无（只有正常日志） |

## 五、「为什么作者复现不出来」的条件推测

复现差异需要在**用户现场**才可能成立（这侧实测不到，只可依据代码归因）：
- **酒馆版本 <1.13.05**（旧版兼容分支）：唯一有直接产物（`preset_` 复制 + `reloadCurrentChat`）能导致前端坏的路径。作者环境是新酒馆 + 新脚本（成分上一致）；而且她是"自动更新"拉的远端脚本，我们只有她**当时**的 229 KB 存档，历史版本无从取证。
- 用户在 SPreset 编辑器里针对这套预设存过东西（锁定正则 / 预设绑定名单 / 固定预设名），使她这台机器上的 SPresetSettings 与预设数据冗余叠加（本次在受控环境无法验证，不作为确定结论）。

## 六、已落地的清理（方案 a 的防御版）

- `build/build.mjs`：删掉 `extensions.SPreset.RegexBinding.regexes` 的镜像写入（新产物不再向 SPreset 数据块塞正则），注释里写明原因。产物号从 125 → **126**（`dist/kami-v0.90-126-20260924.json`）。
- `src/preset.base.json`：`SPreset.RegexBinding.regexes` 清为 `[]`（先备份 `preset.base.json.bak-spreset-cleanup`，一次性脚本 `.audit/clear-base-regexbinding.mjs`）。
- 验证：`node build/build.mjs` 全绿（前端两条 PASS）；`node test/harness/update-flow.mjs` **117 / 117 通过**；新产物复查 `regex_scripts=11 / spreset.regexes=0`。
- 副作用（要说清）：若用户真的在用 SPreset 编辑器编辑我们 11 条预设正则，SPreset 绑定面板读出的清单将不再依赖预设里那份拷贝；但由于它 11305+ 本来就以 ST 原生正则为源（`saveRegexesToPreset`/`syncFromST`），这个面板仍在用，**没有真正损失**。唯一的边缘会是老版本 SPreset（<11305 酒馆）——那时它的整块数据就没有「预设正则」可读，此时**保底依然是 ST 原生预设正则面板照常工作**，我们的正则功能不受影响。

## 七、给用户的明确处置（按优先级）

1. **先更新酒馆到 1.13.05 或更高**（本机 1.18 实测：同一份第三方脚本开着也不会伤前端）。这是按钮级的升级，不需要换预设。
2. **升级 / 重新拉取该第三方脚本**（它是自动更新的 bootstrap：只要重启酒馆它就重新拉一份）。
3. 遇到坏的时候，给用户的排障顺序：关酒馆美化脚本（这个第三方脚本是往页面 body 注入的，最容易碰到这类连锁）→ 重开看恢复；不要先动我们的预设。

## 八、只有真机能确认的部分 / 遗留
- 无法在本侧完全复现用户的确切故障版本（她的酒馆版本 / 她当时拉到的脚本版本），所以「旧版兼容分支压坏正则链」仍是**代码归因**而非点击复现。
- 本次实验在真机上新增的 `SPresetSettings` prompt 条目只存在内存，没有点「更新当前预设」，刷新后即丢。但 `addPrompt` / `saveRegexesToPreset` 的自动写回行为本就在该脚本代码里，**只要它开着、未来用户任何一次手动保存预设都可能落盘一条 110 KB 的 SPresetSettings 条目**——这正是方案 a 真正防御的点；新产物从 126 号起就不会再自带这块数据。
- 真机全局脚本里的「_input assistant」「填写到角色卡」等其它脚本我没有动过（确认删除按钮点过的是「排查复现-SPreset引导器」这一行）。

## 九、派活方复核与**回退**（2026-09-24，本节优先于 §六）

**§六 那处产品改动已被派活方回退**，请勿照着 §六 再把镜像同步删掉。

- 复核时发现一条被漏掉的危险分支：SPreset 里另一个 `oai_preset_changed_after` 处理器是
  `if (SPresetSettings.RegexBinding.regexes) syncToST(); else syncFromST();`（`regex_bind_inject.js:4099-4105`），
  而 **`syncToST()` 写回的是 `presetRegexes`** —— 那是它在**加载时**算好的常量
  （`const presetRegexes = getRegexesFromPreset();`，`:3700`）。`getRegexesFromPreset()` 的逻辑是
  「`RegexBinding.regexes` 非空就用它，否则退回 `regexes-bindings` 条目，再否则空表」。
- 于是把 `RegexBinding.regexes` 清成 `[]` 之后：**空数组在 JS 里是真值** → 走 `syncToST()` →
  把 `chatCompletionSettings.extensions.regex_scripts` 覆盖成加载时那份空表 → **本预设的 11 条正则
  （含两个前端载荷）会被整表清空**。这不是理论风险：只要用户在装着 SPreset 的机器上切一次预设就会触发。
- 原来那版（块里就是这 11 条、与 `regex_scripts` 逐条一致）反而是**等值覆盖 = 空操作**，是安全态。
- 因此：`build/build.mjs` 的镜像同步**已装回**，并在注释里写明「不能删」及原因；`src/preset.base.json`
  里那 13 条旧正则的清空**保留**（无副作用：构建期会用现行 11 条覆盖该字段）。
- 复验：重新构建 `dist/kami-v0.90-128-20260924.json`，产物实测 `regex_scripts = 11`、
  `RegexBinding.regexes = 11`、两边 id 逐条一致；`node build/build.mjs` 全绿（前端两条 PASS）。
- 另：`.audit/clear-base-regexbinding.mjs`（一次性脚本，前提已回退）与 `preset.base.json.bak-spreset-cleanup`
  已删除；`.audit/lib/`（jQuery / jQuery UI / toastr）与夹具 `spreset-fixture.json`、`make-spreset-fixture.mjs`、
  `dump-bootstrap.mjs`、`inspect-spreset-flags.mjs`、`spreset-bootstrap.js` 保留（`?spreset=1` 探针要用）。
- **§一第 3 条与 §六的「本预设侧兼容债」结论据此作废**：本预设侧不改才是对的；
  真正要动的只有用户环境（§七 那三条处置不变）。
