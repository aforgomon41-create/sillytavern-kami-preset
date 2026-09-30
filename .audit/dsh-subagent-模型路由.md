# DSH 子代理模型路由调查报告

调查时间：2026-09-30
只读侦察，未改动任何 DSH 配置、安装目录或项目文件。
（本文件覆盖了一版写到一半的草稿；草稿里「GUI 用的是 web profile」这一条经复核是错的，已在证据 1 更正。）

---

## 结论

**现在不能按次指定模型，但可以打开。**

- 当前状态：`subagent`、`subagent_fork`、`spawn_teammate` 三个工具都没有模型参数，子代理一律继承 leader 当前使用的模型。
- 打开办法：把 Host 设置项 `subagent-model-selection-settings` 的 `enabled` 设为 `true`，并在 `allowedModels` 里列出允许的 provider/model 组合。做完后新开会话，`subagent` 工具会多出 `provider`、`model`、`reasoning_effort` 三个参数，并多一个 `list_subagent_models` 工具。
- teammate 是例外：`spawn_teammate` 无论怎么配都没有模型参数，永远继承 leader。所以「文案类子代理必须用 Gemini」这条规范，只能靠普通 `subagent` 实现，不能靠 teammate。
- Gemini 现在可用：provider 名 `gcli-ggchan`，模型 id `agy-gemini-3.8-flash-high`、`agy-gemini-3.7-flash-high`、`gemini-3.1-pro-preview`，密钥名字已存在。

---

## 证据

### 证据 1：本机跑的是 desktop profile，不是 web profile

- 文件：`C:\Users\kamisama\.dsh\profiles\desktop\package.json`
- 关键片段：

```json
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dshmarket",
      "@linxin666/dsh-client-ui-skill-explorer",
      "dsh-web-search-free",
      "@agents-anywhere/dsh-bridge-next",
      "@deepseek-ai/dsh-experimental-agent-team-profile"
    ]
  }
}
```

- 证据链：
  1. 端口 19387 的监听进程是 `DeepSeek Harness.exe`（PID 3924），也就是桌面版，不是 `node dsh` CLI。
  2. `profiles\web\package.json` 只有 `dsh-base` + `dsh-web-app`，依赖为空；`profiles\web\cordis.patch.yml` 内容就是空数组 `[]`。
  3. 全盘搜索 `gcli-ggchan`，只在 `profiles\desktop\cordis.patch.yml` 里出现一次。历史会话用过的这个 provider，只能来自 desktop profile。
- 证明：所有配置改动都落在 `profiles\desktop\cordis.patch.yml`，改 web profile 没用。

### 证据 2：默认行为就是继承父代理模型

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-subagent\README.md`
- 关键片段：

> A start request may override the child Agent's provider, model, reasoning effort, and output-token limit through `agentOptions`...
> ...child creation merges requested fields over the provider, model, and reasoning effort in **the parent's latest logged request**, falls back to creation options before the first request, and retains the configured token limit.

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-agent\lib\types\runtime-types.d.ts` 第 21-30 行
- 关键片段：

```ts
export interface AgentOptions {
    provider?: string;
    model?: string;
    reasoningEffort?: ReasoningEffortId;
    maxTokens?: number;
}
```

- 证明：子代理的模型来自「父代理最近一次请求」的路线。没有任何显式指定时，就是原样继承。

### 证据 3：当前这个会话确实没开模型选择

- 文件：`C:\Users\kamisama\.dsh\storages\session_projcache\sessions\session-0a19d285-2e09-4f04-988d-15a20bc66d47.json` 第 443-459 行
- 关键片段：

```json
"subagentModelSelectionPolicy": { "ver": 1, "seq": 179, "val": null },
"modelSelection": {
  "val": {
    "lastUsed": {
      "provider": "commandcode",
      "model": "deepseek/deepseek-v4.1-flash",
      "reasoningEffort": "max"
    }
  }
}
```

- 证明：`subagentModelSelectionPolicy` 是 `null`，意思是「本会话的子代理工具是固定路线版本」。leader 跑在 `commandcode / deepseek/deepseek-v4.1-flash` 上。
- 旁证：leader 会话 system prompt 的工具声明表里**没有** `list_subagent_models`。该工具只在模型选择打开时才注册。

### 证据 4：工具参数确实没有模型位（leader 会话实际下发的原文）

- 来源：`C:\Users\kamisama\.dsh\sessions\--D-SillyTavern-~5361~5BC6~9884~8BBE~5236~4F5C--\session-0a19d285-2e09-4f04-988d-15a20bc66d47\session.v4.jsonl.zstd` 的 system/message 事件（解压后 36194 字符）
- 关键片段：

```ts
subagent: {
  /** A short (3-5 word) description of the delegated task, for display. */
  description: string;
  /** The complete, self-contained task for the subagent. ... */
  prompt: string;
  /** Defaults to true. Set false only when your next action depends on the result. */
  run_in_background?: boolean;
} & Record<string, JsonValue>;

spawn_teammate: {
  /** Unique lower-kebab-case teammate name. */
  name: string;
  /** Short description of the delegated responsibility. */
  description: string;
  /** Complete initial task for the teammate. */
  prompt: string;
  /** fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh. */
  context?: "fresh" | "fork";
} & Record<string, JsonValue>;
```

- 证明：两个工具都没有 provider / model 字段。这不是某一版工具定义的个别现象，是本机真实下发给模型的 schema。

### 证据 5：可用的配置键（工具级）

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-tool-subagent\lib\types\index.d.ts`
- 关键片段（`Config` 接口，已删注释）：

```ts
export interface Config {
    provider: string;                    // 必填，必须是 spawn / fork / acp 之类的后端名
    toolName?: string;                   // 默认 "subagent"
    modelSelectionSettings?: boolean;    // 默认 false
    enableRunInBackground?: boolean;     // 默认 true
    backgroundMode?: 'one-shot' | 'continuable';
    agentOptions?: AgentOptions;         // 固定给每个子代理的默认路线
    persona?: string;
    toolFilter?: { allow?: string[]; deny?: string[] };
    maxDepth?: number | 'provider-managed';
}
```

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-base\cordis.patch.yml` 第 370-388 行
- 关键片段：

```yaml
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    backgroundMode: continuable

# Fork omits model selection so provider/model stay equal to the parent and
# the inherited history remains eligible for KV Cache reuse.
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: one-shot
```

- 证明三点：entry id 叫 `tool-subagent`；base 层没写 `modelSelectionSettings`，所以默认关；`subagent_fork` 走 fork 后端，官方注释明确说它不带模型选择，改不了。
- 注意别混：这里的 `provider: spawn` 是子代理后端名，不是 LLM 供应商名。

### 证据 6：三个 agent preset 其实已经打开了工具侧开关

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-web-app\presets\ptc.patch.yml` 第 90-96 行（leader 用的就是 ptc preset）
- 关键片段：

```yaml
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    modelSelectionSettings: true
    backgroundMode: continuable
```

- `standard.patch.yml` 第 90-96 行、`cordis.patch.yml` 第 89-95 行内容相同。
- 证明：工具侧的开关本来就是开的。真正卡住的是下面那个 Host 设置。

### 证据 7：真正卡住的 Host 设置

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-tool-subagent\lib\model-selection-settings.js`
- 关键片段：

```js
const AllowedModelRouteSchema = z.object({
    provider: z.string().min(1).required(),
    model: z.string().min(1).required()
});

static Config = z.object({
    enabled: z.boolean().default(false).volatile(),
    allowedModels: z.array(AllowedModelRouteSchema).default([]).volatile()
});

current() {
    const enabled = this.config.enabled.get();
    const allowedModels = this.config.allowedModels.get();
    assertAllowedModelRoutes(allowedModels);
    if (enabled && allowedModels.length === 0)
        throw new Error("enabled subagent model selection requires at least one allowed model");
    return { enabled, allowedModels: allowedModels.map((route) => ({ ...route })) };
}
```

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-web-app\cordis.patch.yml` 第 64-67 行
- 关键片段：

```yaml
# Host-owned opt-in sampled when a new Web session receives its preset
# delegation tools. The Plugins page edits this settings namespace.
- id: subagent-model-selection-settings
  name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
```

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-settings\README.md`
- 关键片段：

> Changes persist through the active profile's Cordis patch.

- 证明三件事：键名就是 `enabled` 和 `allowedModels`；默认 `false`，所以现在是关的；这个设置项的 entry id 叫 `subagent-model-selection-settings`，插件本来就已经挂载，面板改完会写回 desktop profile 的 cordis patch。

### 证据 8：开关打开后的实际效果（源码）

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-tool-subagent\lib\index.js` 第 388-425 行
- 关键片段：

```js
const install = (runtimeCtx, modelSelectionPolicy) => {
    const modelSelectionEnabled = modelSelectionPolicy !== void 0;
    if (modelSelectionPolicy !== void 0) registerListSubagentModels(runtimeCtx, modelSelectionPolicy);
    ...
    ...modelSelectionEnabled ? {
        provider: { type: "string", description: "LLM provider route for the child. Supply together with model; ..." },
        model:    { type: "string", description: "Model id interpreted by provider. Supply together with provider; ..." },
        reasoning_effort: { type: "string", description: "Adapter-owned reasoning effort for the effective child route. ..." }
    } : {},
```

- 文件：同目录 `lib\index.js` 第 588-604 行
- 关键片段：

```js
} else if (freshSession) {
    const current = settings.current();
    allowedModels = current.enabled ? current.allowedModels : void 0;
}
```

- 文件：`lib\types\model-selection.d.ts`
- 关键片段：

```ts
/** Model-facing child LLM route fields. */
export interface DelegationModelRequest {
    readonly provider?: string;
    readonly model?: string;
    readonly reasoning_effort?: string;
}
```

> Pure inheritance remains outside this policy because no model-facing choice occurred; any explicit route or effort field must resolve to an allowed route.

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh-tool-subagent\README.md`
- 关键片段：

> A restored Session without a recorded policy remains disabled, including an explicitly empty restore. When enabled, the non-empty exact provider/model route list is recorded in the Session, inherited by child Sessions, and **unchanged by later settings edits**. The tool then exposes optional `provider`, `model`, and `reasoning_effort` fields and registers the shared `list_subagent_models` tool.

- 证明：开关是「新会话采样一次」。老会话不会变，改完设置必须新开会话。路线清单会写进会话，之后改设置也不影响已开的会话。`provider` 和 `model` 必须成对出现。不指定就纯继承，不受白名单约束；一旦指定，必须落在白名单里，否则被拒。

### 证据 9：Gemini 现在可用

- 文件：`C:\Users\kamisama\.dsh\profiles\desktop\cordis.patch.yml` 第 86-116 行
- 关键片段（密钥只留字段名，不抄内容）：

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      gcli-ggchan:
        displayName: GCLI (ggchan.dev)
        apiKeyEnv: GCLI_GGCHAN_API_KEY
        api: openai-completions
        baseURL: https://gcli.ggchan.dev/v1
        models:
          - id: agy-gemini-3.8-flash-high
            name: Gemini 3.8 Flash
            contextWindow: 1048576
            maxTokens: 65536
            input: [text, image]
          - id: agy-gemini-3.7-flash-high
            name: Gemini 3.7 Flash
            contextWindow: 1048576
            maxTokens: 65536
            input: [text, image]
          - id: gemini-3.1-pro-preview
            name: Gemini 3.1 Pro
            contextWindow: 1048576
            maxTokens: 65536
            input: [text, image]
```

- 文件：`C:\Users\kamisama\.dsh\.credentials.yaml`——只确认键名 `GCLI_GGCHAN_API_KEY` 存在，内容未读取、未抄录。
- 网络检查：`gcli.ggchan.dev:443` 可达（Test-NetConnection 返回 True）。
- 该文件同一节里还有 `ark-coding-plan`、`step-plan`、`commandcode` 三个 provider，另有 `llm-deepseek` 行提供 `deepseek-flash` / `deepseek-v4-pro`。
- 证明：Gemini 走的是第三方 OpenAI 兼容网关 gcli.ggchan.dev，不是本机 CLI。**不需要装 Gemini CLI，也不需要额外装什么。**
- 注意：这三个模型条目都没写 `reasoningEfforts`，所以调用时不要传 `reasoning_effort`。

### 证据 10：两个历史名字都还在

- `gcli-ggchan` — provider 名，定义在 `C:\Users\kamisama\.dsh\profiles\desktop\cordis.patch.yml` 第 90 行。
- `agy-gemini-3.7-flash-high` — 模型 id，定义在同文件第 103 行。
- 同 provider 下还多了一个更新的 `agy-gemini-3.8-flash-high`（第 96 行）。

### 证据 11：teammate 是另一套，且没有模型参数

- 文件：`C:\Users\kamisama\.dsh\profiles\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-experimental-tool-agent-team\lib\index.js` 第 243-292 行
- 关键片段：

```js
name: "spawn_teammate",
description: "Create one named, durable teammate. Only the Team Lead may call this tool.",
parameters: {
    name: {...}, description: {...}, prompt: {...},
    context: { type: "string", enum: ["fresh", "fork"], description: "..." }
},
async execute(args, exec) {
    return { member: modelMember((await ctx.agentTeams.spawnTeammate(agent, {
        name: args.name,
        description: args.description,
        prompt: [...],
        context,
        provider: context === "fork" ? config.forkProvider : config.freshProvider,
        signal: exec.signal
    })).member) };
}
```

- 这里的 `provider` 是子代理后端名（spawn / fork），不是 LLM 供应商。
- 文件：`...\dsh-experimental-agent-team-profile\cordis.patch.yml`（全文 33 行）
- 关键片段：

```yaml
- insert:
    - id: agent-team
      name: '@deepseek-ai/dsh-experimental-agent-team'
      config:
        maxMembers: 8
        maxTasks: 256
        maxPendingMessagesPerMember: 64
        maxMessageBytes: 65536
        disposalTimeoutMs: 5000

    - id: tool-agent-team
      name: '@deepseek-ai/dsh-experimental-tool-agent-team'
      config:
        freshProvider: spawn
        forkProvider: fork
```

- 文件：`...\dsh-experimental-tool-agent-team\lib\index.js` 第 58-78 行——`list_agents` 的返回结构里有 `provider` 和 `model`，这是**只读回报**，用来看某个 teammate 当前跑在哪条路线上，不能用来设置。
- 证明：teammate 的模型没有任何配置项，也没有调用参数，只能继承 leader。它和普通 subagent 共用底层的 spawn/fork 后端，但模型选择的入口只存在于 `tool-subagent` 上。所以是「同一套底层、两套工具面」。

### 证据 12：本机上两套工具同时存在，teammate 已启用

- 来源：leader 会话 system prompt（`session-0a19d285-...\session.v4.jsonl.zstd`）
- 关键片段一（Agent Teams 策略段）：

> Agent Teams is available in this session, but create teammates only when the user explicitly asks to use Agent Teams or teammates.

- 关键片段二（该会话声明的工具名清单）：

```
ask_user_question, create_goal, edit, exit_plan_mode, glob, grep, interrupt_agent,
job_kill, job_output, present, pwsh, read, read_image, send_message, skill,
spawn_teammate, subagent, subagent_fork, team_task_create, team_task_get,
team_task_list, team_task_update, todo_write, update_goal, wait_agent,
web_fetch, web_search, write
```

- 旁证：`C:\Users\kamisama\.dsh\storages\session_projcache\sessions\` 下 2026-09-30 20:40 之后写入的会话，全部带 `agentTeam` 投影。
- 证明：Agent Teams 确实开着。而且 `spawn_teammate` 与 `subagent`/`subagent_fork` 同时可用。官方 README 说启用 Agent Teams 会禁用 `subagent`/`subagent_fork`，但本机上没有发生——两套工具并存，可以各用各的。

---

## 可直接照抄的写法

### 方式 A：打开按次指定（推荐，能挑文案任务单独走 Gemini）

把下面内容写进 `C:\Users\kamisama\.dsh\profiles\desktop\cordis.patch.yml`（追加到文件末尾即可，和现有条目平级）：

```yaml
- id: subagent-model-selection-settings
  config:
    enabled: true
    allowedModels:
      - provider: gcli-ggchan
        model: agy-gemini-3.8-flash-high
      - provider: gcli-ggchan
        model: agy-gemini-3.7-flash-high
      - provider: gcli-ggchan
        model: gemini-3.1-pro-preview
```

或者走图形界面：Plugins 页面里找到 `subagent-model-selection-settings` 这一项，把 enabled 打开，再把上面三条路线加进 allowedModels。效果一样，写回的是同一个文件。

**改完必须新开一个会话。** 老会话不会生效。

新会话里 leader 就能这样派活：

```js
// 先看有哪些路线（可选，但建议先跑一次确认）
await tools.list_subagent_models({});

// 指定 Gemini
await tools.subagent({
  description: "撰写商品文案",
  prompt: "...",
  provider: "gcli-ggchan",
  model: "agy-gemini-3.7-flash-high"
});
```

注意事项：
- `provider` 和 `model` 必须成对出现，只给一个会报错。
- 不要传 `reasoning_effort`，gcli-ggchan 的三个模型都没声明推理档位。
- `subagent_fork` 永远不带模型参数，要指定模型只能用 `subagent`。
- `spawn_teammate` 永远不带模型参数，要指定模型不能用 teammate。
- 子代理会继承父会话的路线白名单清单，不会跟着设置变。

### 方式 B：固定路线（不需要开设置，代价是这个工具派的子代理全变成 Gemini）

在 leader 用的 preset（`preset-ptc`）的 `tool-subagent` 那一行加 `agentOptions`：

```yaml
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    backgroundMode: continuable
    agentOptions:
      provider: gcli-ggchan
      model: agy-gemini-3.7-flash-high
```

这条路我没有在本机验证过生效链路（见下节）。而且它只能给整条工具实例固定一个模型，做不到「只有文案类走 Gemini」，所以一般不如方式 A。

---

## 没查到的

1. **方式 A 没有跑通端到端验证。** 我只读源码和文档确认了机制，没有真的打开开关、新开会话、派一个 Gemini 子代理跑一次。所以「写完就一定能用」这句话我没有实测证据。
2. **方式 B 的写入路径没验证。** `ptc.patch.yml` 顶部注释说「Web 编辑器保存的改动会按 id 覆盖这一行的 `config.plugins`」，但我没有打开过 agent preset 编辑器，也没确认手写 profile patch 时该嵌套在哪一层才能覆盖到 preset 内部的 `tool-subagent` 行。
3. **`GCLI_GGCHAN_API_KEY` 这把密钥是否还能用，没验证。** 我只确认了键名存在、域名 443 端口可达，没有发过任何请求。
4. **gcli.ggchan.dev 后面接的是什么，没查到。** 不知道它转发到 Google 官方 API、本机某个 CLI，还是第三方代理。按模型 id 判断走的是 Google 的 Gemini，但这条是推断，没有直接证据。
5. **Plugins 页面上这一项中文叫什么、具体在哪个分组，没查到。** 我只有源码注释那句「The Plugins page edits this settings namespace」，没有界面截图或界面文案。
6. **没有找到任何「在 prompt 里写特殊前缀就能指定模型」的语法。** 我查了工具 schema 和 `dsh-tool-subagent` 的全部源码，没有这类解析逻辑。也就是说除了上面的配置方式，没有别的旁门。
7. **teammate 实际跑过的模型记录，没找到实例。** leader 会话的 `agentTeam.members` 是空数组，本机没有跑过成功的 teammate，所以「teammate 继承 leader 模型」这条是源码推断，不是实测记录。
8. **`list_subagent_models` 打开后到底回报哪些路线，没验证。** 只知道它会列出已注册 provider 及其声明的模型，具体输出格式没跑过。

---

## 步骤 4：投影缓存里的 gcli-ggchan 到底是什么

文件样例：`storages\session_projcache\sessions\01794116-....json`（2021 行，170 个 json 命中该串）

命中的位置在 JSON 的 `record.projections` 下，键名是 **`subagentModelSelectionPolicy`**，不是调用记录。原文（L1984-2005）：

```json
"subagentModelSelectionPolicy": {
  "ver": 1,
  "seq": 883,
  "val": [
    { "provider": "gcli-ggchan", "model": "gemini-3.1-pro-preview" },
    { "provider": "gcli-ggchan", "model": "agy-gemini-3.8-flash-high" },
    { "provider": "gcli-ggchan", "model": "agy-gemini-3.7-flash-high" },
    { "provider": "opencode-go-extras", "model": "deepseek-v4.1-flash" },
    { "provider": "opencode-go", "model": "glm-5.3-flash" }
  ]
}
```

结论：这就是"这个会话允许 subagent 显式选哪些模型"的**白名单**，来自 `subagent/model-selection-policy` 会话事件（`dsh-tool-subagent\lib\index.js` L199-212 定义投影，L230-232 追加事件）。
它证明**曾经开启过**按次选模型；它是策略快照，不是某次调用的模型记录。

---

## 步骤 5：真正的配置键长什么样（settings.yaml）

文件：`C:\Users\kamisama\.dsh\settings.yaml.imported`（L170-188 原文，另外两个 .bak 里也有同样段落）

```yaml
subagent-model-selection:
  # 让 subagent 工具可为每个子代理单独指定 provider/model（并注册 list_subagent_models 工具）。
  # 注意：策略在「每个全新顶层会话」组合时读取，因此改完需新开会话才生效，已有会话不受影响。
  enabled: true
  allowedModels:
    - provider: gcli-ggchan
      model: gemini-3.1-pro-preview
    - provider: gcli-ggchan
      model: agy-gemini-3.8-flash-high
    - provider: gcli-ggchan
      model: agy-gemini-3.7-flash-high
    - provider: opencode-go
      model: glm-5.3-flash
    - provider: ark-coding-plan
      model: glm-5.3-flash
    - provider: step-plan
      model: step-5-preview
    - provider: commandcode
      model: deepseek/deepseek-v4.1-flash
```

这就是配置键：**`subagent-model-selection.enabled` + `subagent-model-selection.allowedModels`**。
键名里的 `subagent-model-selection` 对应插件行 `subagent-model-selection-settings`（`dsh-web-app\cordis.patch.yml` L66-67，name 为 `@deepseek-ai/dsh-tool-subagent/model-selection-settings`）。

**重要坏消息**：这份文件已经被改名成 `.imported`，`.dsh\settings.yaml` **当前不存在**（只剩 3 个改名备份）。
所以这版本实例里 `allowedModels` 白名单没生效，subagent 退回"固定路由"，工具参数自然只有 description/prompt/run_in_background。

补充：整个 `.dsh`（跳过 node_modules）里只有这 3 个改名文件含 `allowedModels`；`C:\Users\kamisama\AppData\Roaming\@deepseek-ai`、`D:\新建文件夹`、`_lab\home` 里都没有 settings.yaml。
settings.yaml 的**当前实际路径没查到**（`dsh-settings-file` 包内文件列表：<ERR ENOENT>）。
（未找到路径解析相关行）

---

## 步骤 6：Gemini provider 在哪定义（能用的前提）

文件：`C:\Users\kamisama\.dsh\profiles\desktop\cordis.patch.yml`（**desktop** profile 的补丁层）

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      gcli-ggchan:
        displayName: GCLI (ggchan.dev)
        apiKeyEnv: GCLI_GGCHAN_API_KEY
        api: openai-completions
        baseURL: https://gcli.ggchan.dev/v1
        models:
          - id: agy-gemini-3.8-flash-high
            name: Gemini 3.8 Flash
            contextWindow: 1048576
            maxTokens: 65536
            input: [text, image]
          - id: agy-gemini-3.7-flash-high
            name: Gemini 3.7 Flash
          - id: gemini-3.1-pro-preview
            name: Gemini 3.1 Pro
```

前置条件：

1. provider `gcli-ggchan` 由 `dsh-llm-pi-ai` 插件声明，**写在 desktop profile 的补丁里**。
2. 需要环境变量 `GCLI_GGCHAN_API_KEY`（键名 `apiKeyEnv`，凭据值未读取也未记录）。
3. `agy-gemini-3.7-flash-high` / `agy-gemini-3.8-flash-high` 里的 high 是**模型 id 的一部分**，不是 reasoningEffort 参数。

注意：`profiles/web/cordis.patch.yml` 是**空数组**，web profile 自己不声明 gcli-ggchan。当前会话能不能用 Gemini，取决于跑我这个会话的 profile 是否加载了 desktop 的那份补丁（未逐进程确认，见"未查到"）。

---

## 步骤 7：开关的默认值（bundle 预设层）

`dsh-base\cordis.patch.yml` L370-390 注册两行 `tool-subagent`（provider: spawn / fork）。
`dsh-web-app\presets\{standard,ptc}.patch.yml` L90-100 把 tool-subagent 覆盖为：

```yaml
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    modelSelectionSettings: true
```

对照源码 `dsh-tool-subagent\lib\index.js`：

- L374 `const modelSelectionCapable = config.modelSelectionSettings === true;`
- L388 `const modelSelectionEnabled = modelSelectionPolicy !== void 0;`
- L412-425 只有 `modelSelectionEnabled` 为真时才把 `provider` / `model` / `reasoning_effort` 三个参数挂进工具 schema
- L582-604 `modelSelectionSettings !== true` 直接返回 undefined；否则读 `subagentModelSelection` 设置的 `enabled` / `allowedModels`，或从父会话继承策略

所以两层都要满足：预设层 `modelSelectionSettings: true` **且** 设置层 `enabled: true` + 非空 `allowedModels`。

---

## 步骤 8：运行环境

`Get-CimInstance Win32_Process` 显示至少 5 个 `dsh --profile lab` 进程（端口 19995-19999，其中一个带 `--patch D:\新建文件夹\_lab\patch-failing.yml`），另有 Electron 版 DeepSeek Harness。

- `D:\新建文件夹\_lab\home` 是一套独立的 DSH home，里面有 `profiles/lab/`（无 settings.yaml）。
- `_lab\home\profiles\lab\cordis.patch.yml`（960b）内容：

```yaml
# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; `!!js` expressions allowed).
- id: ui-settings-account
  name: "@deepseek-ai/dsh-client-ui-settings-account"
  config:
    version: 1
    step: done
    purpose: null
    process: standard
    completion: skipped
    usage: compact
    developerTools: false
- id: ui-chat
  name: "@deepseek-ai/dsh-client-ui-chat"
  config:
    transcriptView: compact
    performanceUsage: detailed
- id: ui-settings
  name: "@deepseek-ai/dsh-client-ui-settings"
  config:
    enabled: true
- id: agent-preset-registry
  name: "@deepseek-ai/dsh-agent-preset-registry"
  config:
    default: standard
    selectedDefault: ptc
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-official
    model: deepseek-flash
    reasoningEffort: max
```

- `_lab\home\profiles\lab\package.json`：

```json
{
  "name": "dsh-profile-lab",
  "private": true,
  "dependencies": {
    "@linxin666/dsh-client-ui-skill-explorer": "0.4.4",
    "dsh-web-search-free": "1.6.0",
    "dshmarket": "1.66.5"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@linxin666/dsh-client-ui-skill-explorer",
        "dsh-web-search-free",
        "dshmarket"
      ]
    }
  }
}
```

---

## 结论（回答 5 个问题）

### 1. subagent 的模型由谁决定

三层，按优先级从低到高：

1. **默认继承父会话**（源码注释：Pure inheritance remains outside this policy）。
2. **插件静态默认**：`tool-subagent` 的 `config.agentOptions.provider/model/reasoningEffort/maxTokens`（`dsh-tool-subagent\lib\index.js` L258-263）。
3. **按次参数**：`provider` / `model` / `reasoning_effort`，但**只有开关打开时才存在**。

### 2. 有没有配置键能指定

有，两条路：

- 静态（给所有 subagent 定死一个模型）：`tool-subagent` 行的 `config.agentOptions.provider` + `config.agentOptions.model`。
- 白名单（允许按次选）：`subagent-model-selection.enabled` + `subagent-model-selection.allowedModels`（原文见步骤 5）。

### 3. 有没有按次指定的办法

**源码里有，但这个会话里没有。** 需要三件事同时成立：
(a) 预设层 `modelSelectionSettings: true`（当前 standard/ptc 预设已给）；
(b) 设置层 `subagent-model-selection.enabled: true` + `allowedModels` 含目标路由（当前 `.dsh\settings.yaml` 不存在，故不成立）；
(c) 改完**新开一个顶层会话**（注释原文：策略在每个全新顶层会话组合时读取，已有会话不受影响）。
当前工具只有 description/prompt/run_in_background —— 与 (b) 不成立完全吻合。

### 4. Gemini 现在能不能用

Provider 名 `gcli-ggchan`，模型名 `agy-gemini-3.8-flash-high` / `agy-gemini-3.7-flash-high` / `gemini-3.1-pro-preview`。
前置条件：加载含该 provider 的 `llm-pi-ai` 配置（目前只在 desktop profile 补丁里），并设置 `GCLI_GGCHAN_API_KEY`。
**没验证过网络连通性与 key 是否有效**，也没验证本会话所在 profile 是否加载了那份补丁。

### 5. teammate（Agent Teams）与普通 subagent 是否同一套机制

**没查到 Agent Teams / teammate 的独立插件包。** `profiles\node_modules\@deepseek-ai` 下与 subagent 相关的只有：
`dsh-subagent`、`dsh-tool-subagent`、`dsh-tool-subagent-control`、`dsh-tool-subagent-report`、`dsh-subagent-{in-process-driver,spawn-in-process,fork-in-process}`。
没有 `team` / `teammate` / `spawn_teammate` 命名的包或配置行。若某处见过 `spawn_teammate`，那不在本机这一版里 → 结论：本机这一版没有独立的 teammate 机制，subagent 就是唯一委派通道。

---

## 未查到 / 未验证

1. `settings.yaml` 的当前实际路径 —— `.dsh` 根、`_lab\home`、`AppData\Roaming\@deepseek-ai` 都没有；只有 3 个改名备份。写配置前必须先确认落点。
2. 跑当前这个会话的进程用的是哪个 profile（`web` / `desktop` / `lab`）—— 端口 19387 对应的进程没能从命令行确认。
3. `agentOptions` 静态键的生效写法没有实机验证（只读了 schema）。
4. `gcli-ggchan` 的 key 是否有效、baseURL 是否可达，未测试。
5. 没找到 `spawn_teammate` 相关证据（无论证也无反证，只是本机包清单里不存在）。

---

## 附：leader 复核（2026-09-30，两路侦察合并后）

两路侦察员的结论大体一致，有三处出入。我逐条核对了源码与现场，**以本节为准**。

**① 生效开关的官方入口是界面，不是手写文件。**
- 证据：`C:\Users\kamisama\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh-client-ui-settings-subagent\README.zh.md` 第 2 行与第 12 行 —— 「在侧栏打开插件，在官方分组里选择子智能体，即可设置委派可以多深、多宽，以及 Agent 可以为子智能体选择哪些模型」，同一页一次保存覆盖 Host 的 `subagent` 与 `subagent-model-selection` 两个命名空间。
- 命名空间常量：同包 `lib\types\client\subagent-model-selection-card-controller.d.ts` 第 7 行 `SUBAGENT_MODEL_SELECTION_NS = "subagent-model-selection-settings"`。
- 结论：**开法 = 侧栏「插件」→ 官方分组「子智能体」→ 勾选允许的模型 → 保存。** 比手写文件稳，因为 `settings.yaml` 当前不在盘上、落点未确认（见本报告末节第 1 条）。

**② 文件级写法只是备选，而且用途不同。**
`tool-subagent` 的 Config 确有静态键 `agentOptions: {provider, model}`，源码在 `…\@deepseek-ai\dsh-tool-subagent\lib\index.js` 第 252-270 行；`modelSelectionSettings` 默认 false，已在 preset 层置 true。但它给**整个工具实例**固定一条路线，做不到「只让文案类走 Gemini」。不要拿它替代上面那个开关。

**③ 更正两条错误结论。**
- 「本会话跑在哪个 profile 未确认」→ 已确认是 **desktop**：19387 端口监听进程为 `DeepSeek Harness.exe`；`profiles\web\package.json` 只有 base 与 web-app 两个 bundle，`profiles\web\cordis.patch.yml` 是空数组；`gcli-ggchan` 只在 `profiles\desktop\cordis.patch.yml` 出现过。
- 「本机没有 teammate 机制」→ **错**。desktop 档 bundle 列表里有 `@deepseek-ai/dsh-experimental-agent-team-profile`（`profiles\desktop\package.json`），本会话现场也可用：`list_agents` 能列成员，`spawn_teammate` / `interrupt_agent` 与任务板工具都在。结论不变的部分：teammate 没有模型参数，只继承 leader，所以文案类只能走 `subagent`。

**④ 仍然没验的两件事**（验证前不要当作已通）：gcli-ggchan 的密钥是否仍有效、网关是否可达；开关打开后 `subagent` 是否真多出 provider/model 参数（要新开顶层会话才看得到，本次会话无法验证）。
