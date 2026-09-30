# generateRaw / 世界书事件 API 事实压缩（本机源码取证）

> 只读取证，未改动任何源码。审计目标 = 本机实际运行中的那套安装。

## 0. 环境定位（结论）

- ST 安装根：`D:\sillytavern-software\SillyTavern Launcher GUI\data\sillytavern\1.18.0\`
  - 依据：`D:\sillytavern-software\SillyTavern Launcher GUI\data\config.json:13` → `"version": "1.18.0"`；`dataMode: "global"`（线 34）→ 用户数据在 `data\st_data`。
  - 该目录 `package.json` version = `1.18.0`。
- 酒馆助手 = JS-Slash-Runner **4.11.0**，路径：
  `...\1.18.0\public\scripts\extensions\third-party\JS-Slash-Runner\`（`manifest.json` `"version": "4.11.0"`）。
- 干扰项（**不是**当前运行的那套，勿引用）：
  - `D:\sillytavern-software\SillyTavern Launcher GUI\data\sillytavern\1.17.0\`（助手 4.9.3）
  - `D:\sillytavern-software\服务器\SillyTavern\`（package.json 1.17.0，**没有 public 目录**，无助手）
  - `D:\SillyTavern\SillyTavern\`（ST 1.13.2，无助手）
- 关键：助手带完整 **TypeScript 源码** `src/`，所以能读到准确行号；`dist/index.js`（1.1 MB）只作比对。

## 1. generateRaw 参数表（Authored 版 = 运行时真源）

`src/function/generate/types.ts`

```ts
GenerateRawConfig = {            // types.ts:112-126
  generation_id?, user_input?, image?, should_stream?, should_silence?,
  overrides?, injects?, ordered_prompts?, max_chat_history?,
  custom_api?, tools?, tool_choice?, json_schema?
}
// = GenerateConfig (types.ts:93-107) + ordered_prompts
// preset_name 只存在于 GenerateConfig:94，generateRaw 不读取（index.ts:243-260 无该字段）
```

运行时归一化后的内部结构 `detail.GenerateParams`（types.ts:248-263）把
`should_stream→stream`、`should_silence→!bindToStopButton`、`ordered_prompts→order`、`injects→inject`。

公开文档版（脚本作者看到的）在 `dist/@types.txt:1124-1132`，`json_schema` 的说明在 `@types.txt:1111-1121`：
「返回值为 JSON 字符串（需自行 JSON.parse）」「与 tools 互斥，不要同时传入」。

## 2. json_schema

- 形状：`{ name: string; description?: string; value: Record<string,any>; strict?: boolean }`（types.ts:37-42），
  `value` 才是真正的 JSON Schema 对象；`strict` 默认 true。
- 注入手段（**非** custom_api 路径）：监听 `chat_completion_settings_ready` 事件后写进请求体：
  `src/function/generate/responseGenerator.ts:528-542`
  ```ts
  const needsInjection = hasTools || effectiveJsonSchema;
  ... data.json_schema = effectiveJsonSchema;
  eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, optionsInjector);
  ```
- custom_api 路径：直接把 jsonSchema 交给 ST 原生的 `createGenerationParameters`：
  `responseGenerator.ts:299-303` 与 `:384-388`；
  `createGenerationParametersCompat.ts:40` 转发，最终在 `public/scripts/openai.js:3028-3030`
  ```js
  if (jsonSchema) { generate_data.json_schema = jsonSchema; }
  ```
- 服务端翻译（`src/endpoints/backends/chat-completions.js`）：
  - 入口先拍平 schema：`:2170-2172`（`flattenSchema`）
  - 通用 OpenAI 兼容路径（含 custom）：`:2542-2551` → `response_format.json_schema.{name,strict,schema}`
  - custom 分支另有：`:2322-2331`
  - Azure：`:1670-1679`；OpenAI：`:2266+`；OpenRouter `:2322+`；Claude：`:282-290`（转成 tool + 强制 `tool_choice`）；Gemini/Vertex：`:465-476`（`responseMimeType` + `responseSchema`）；Mistral `:874-882`；Cohere `:976-980`；不支持结构化输出的源退化为 `setJsonObjectFormat`（`:197-206`，加一条 user 消息把 schema 塞进正文）
- **source 白名单（助手侧闸门）**：`src/function/generate/toolCallCompat.ts:3-12, 22-32`
  `openai | claude | openrouter | makersuite | vertexai | azure_openai | custom | deepseek | xai`
- **json_schema + custom_api 能否同用：能。**
  `resolveToolCallSource`（toolCallCompat.ts:53-67）：有 `custom_api.source` 就用它；否则有 `apiurl` 就视作 `openai`；否则用当前 ST 源。
  所以 `custom_api:{apiurl,key,model}`（不写 source）会被当成 openai 源，正好落在白名单里。
  带 key 时走 `reverse_proxy + proxy_password`（responseGenerator.ts:190-204）。
- `json_schema` 与 `tools` 在代码里**不互斥**（`hasTools || effectiveJsonSchema` 同时注入，responseGenerator.ts:531-538），
  只是文档 `@types.txt:1119` 建议别同传。

## 3. 其它结构化输出通道

只有 `json_schema` 这一个助手侧入口。`response_format` 是 ST 服务端内部翻译目标，不是助手 API 参数。
助手源码里搜不到 `response_format`（只在 ST 的 openai.js / chat-completions.js 里）。

## 4. 返回值形状（json_schema 生效时）

仍是**字符串**，不会自动 parse。`responseGenerator.ts:415-453`：
```ts
if (hasTools && source) { ...return toolCallResult }        // 只有传了 tools 才可能是对象
const result = { message: extractMessageFromData(response) };
return result.message;                                       // 字符串
```
`extractMessageFromData`（`src/function/generate/utils.ts:50-63`）取
`choices[0].message.content → choices[0].text → text → message.content[0].text → message.tool_plan → ''`。
`@types.txt:1113` 与 `:1241` 的例子都要求调用方自己 `JSON.parse(result)`。

⚠️ 已知坑：`source: 'claude'` + 只给 `json_schema`（不给 tools）时，服务端把它变成强制 tool call
（chat-completions.js:282-290），非流式下 `responseText = generateResponseJson?.content?.[0]?.text || ''`
（chat-completions.js:400）取不到 text → `choices[0].message.content = ''` →
`extractMessageFromData` 得 `''`。而 `hasTools` 为 false，不会去抽 tool_calls。
→ **Claude + json_schema 会静默返回空串。** 要用 Claude 必须改传 `tools` + `tool_choice`。

## 5. json_schema 不被支持时（源不在白名单）

**静默忽略 + 弹一个 toastr.warning**，不报错、不 400：
`responseGenerator.ts:252-259`
```ts
if (!supportedSource && hasToolCallOptions) {
  toastr.warning(getIgnoredToolCallWarningMessage(source), 'Tool Calling', { preventDuplicates: true });
}
...
effectiveJsonSchema: supportedSource ? jsonSchema : undefined,
```
文案：`当前源 ${source} 不支持 tools/json_schema，已忽略这些参数并继续请求`（toolCallCompat.ts:174-177）。

## 6. 报错如何回到调用方（核心）

**结论：几乎所有失败路径都是 reject（throw），唯一现实风险是「resolve 出空串」而不是「resolve 出错误文本」。**

- 助手全程 throw：
  - `generateRaw` → `iframeGenerate`（index.ts:403-408）
  - `iframeGenerate` 的 catch 只做清理再 `throw error`（index.ts:373-377）
  - `generateResponse` catch 同样 `throw error`（responseGenerator.ts:583-587）
  - 非流式抽取前先查错误：`responseGenerator.ts:424-431`
    ```ts
    if (response.error) { if (response?.response) toastr.error(...); throw Error(response?.response); }
    ```
  - 自定义接口非流式：`:400-410` → `!response.ok` 抛 `HTTP ${status}: ${body}`；200 但 `data.error` 抛 `data.error.message`
  - 流式：`:315-319` 同样 `!response.ok` 抛 `HTTP ${status}`；`StreamingProcessor.generate()` 出错 `throw Error('Generate method error: ...')`（`:158-162`）
- ST 本体（`public/scripts/openai.js`）：
  - `sendOpenAIRequest`：`:3062-3065` `if (!response.ok) { tryParseStreamingError(...); throw new Error('Got response status '+status); }`
  - 200 但 body 是错误对象：`:3097-3106`
    ```js
    const data = await response.json();
    checkQuotaError(data); checkModerationError(data);
    if (data.error) { const message = data.error.message || response.statusText || t`Unknown error`; toastr.error(...); throw new Error(message); }
    ```
  - **注意**：`tryParseStreamingError`（`:1624-1655`）里的三个 `throw new Error(data)` 被**同一个 catch 吞掉**
    （`:1652-1654 catch { // No JSON. Do nothing. }`），所以这个函数实际上从不抛出，只弹 toast。
    真正抛的是后面那句 `Got response status N` → 错误体细节会丢。
  - `checkQuotaError`（`:1665-1677`）内层的 `throw new Error(data)` **会**抛（无内部 catch），
    且它比 `data.error` 判断更早执行 → quota 场景调用方拿到的 message 是字面量 `[object Object]`。
- 服务端关键不对称：**上游非 2xx 会被包成 HTTP 200** 返回给浏览器
  `src/endpoints/backends/chat-completions.js:2602-2617`
  ```js
  } else {
    const responseText = await fetchResponse.text(); ...
    response.send({ error: { message }, quota_error: quota_error });   // ← 没写 status()，默认 200
  }
  ```
  前端靠 `data.error` 判出来再抛。对比：Azure 分支 `:1724` 用 `response.status(500).send(data)`；
  Claude 分支 `:395` 用 `response.status(500).send({ error: true })`。
  流式走 `forwardFetchResponse`（`src/util.js:709-738`）会**透传上游状态码**（401 改写成 400，`:718-720`），
  非 2xx 时把 error body 原样 `to.end(rawErrorText)`。

### 会「成功 resolve 出错误文本」的现实条件（逐条可证）

1. **中转/网关把错误正文塞进 `choices[0].message.content` 并返回 200**
   （one-api / new-api 一类：`{"choices":[{"message":{"content":"当前分组上游负载已饱和"}}]}`）。
   ST 只检查 `data.error`（openai.js:3102），没有 `error` 字段就原样返回；
   助手 `extractMessageFromData`（utils.ts:55-62）取 `content` 当正文 → generateRaw 成功 resolve 这段错误文本。
2. **HTTP 200 + 流式，但上游回的是错误 JSON / 非 SSE 正文**：
   `tryParseStreamingError` 吞掉异常（openai.js:1652），`getStreamingReply` 对 openai 系返回
   `data.choices?.[0]?.delta?.content ?? ... ?? ''`（:3210）→ 结果是**空串**，
   错误被静默丢弃，generateRaw resolve 出 `''`（不是错误文本）。
3. **任何形状对不上的 200 响应**（如只有 `{"message":"..."}` / `{"detail":"..."}` 而无 `error`）：
   `extractMessageFromData` 全部落空 → resolve `''`（utils.ts:61）。
4. 拒绝/超时/非 2xx/`data.error` → 都是 reject，**不会**把错误当正文。

## 7. 世界书事件

- 助手事件全表：`src/function/event.ts:183-266`（`tavern_events`，逐条与 ST 同名字符串）。
  世界书相关 6 个：
  - `WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated'`（:217）
  - `WORLDINFO_UPDATED: 'worldinfo_updated'`（:218）← **条目内容变动**
  - `WORLD_INFO_ACTIVATED: 'world_info_activated'`（:230）
  - `WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate'`（:243）
  - `WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded'`（:263）
  - `WORLDINFO_SCAN_DONE: 'worldinfo_scan_done'`（:264）
- ST 发出点：`public/scripts/world-info.js:4080`
  ```js
  await eventSource.emit(event_types.WORLDINFO_UPDATED, name, data);   // 在 _save() 内
  ```
  `_save` 由 `saveWorldInfo(name, data, immediately=false)` 调用（:4097-4110），
  默认走 `saveWorldDebounced`（:83，`debounce_timeout.relaxed` = **1000ms**，`constants.js:14`）。
  **ST 1.18 世界书面板没有「保存」按钮**（`public/` 全目录 grep `world_info_save|world_popup_save|wi_save` 零命中；
  `index.html:4813-4858` 只有 new/export/rename/delete）。每个输入框 `input` 事件里都写着
  `!noSave && await saveWorldInfo(name, data)`（例：:3514 / :3604 / :3780，共 40+ 处）→ 编辑即自动存 → 1 秒后发 `WORLDINFO_UPDATED`。
  `WORLDINFO_SETTINGS_UPDATED` 只管全局滑杆/设置（:5723、:6107-6110），**不代表条目被改**。
- 助手的 `eventOn` 不做名字映射/过滤：`event.ts:78-82` 直接 `eventSource.on(event_type, wrapped)`。
  `EventType = IframeEventType | TavernEventType | string`（:167）→ 也支持任意自定义事件名。
  唯一加工：对消息类事件把首参 `parseInt`（:39-54）。
  → 监听世界书改动就写 `eventOn(tavern_events.WORLDINFO_UPDATED, (name, data) => ...)`。

## 8. 楼层字段 / 世界书读写接口

- `getChatMessages` 返回（`src/function/chat_message.ts:21-29`、`:145-158`）：
  `message_id, name, role, is_hidden, message, data, extra`，兼容字段 `swipe_id, swipes, swipes_data`；
  `include_swipes:true` 时换成 `:31-40` 的 swipes 版。
- `extra` = **按 swipe 存**：`const extra = swipes_info[swipe_id]`（:124、:130），
  无 `swipe_info` 时回落到 `message.extra`（:124）。
- `setChatMessages` **支持写 extra**：`:281-287`
  ```ts
  if (chat_message?.extra !== undefined) {
    if (data?.swipes_info === undefined) _.set(data,'swipe_info', _.times(...));
    _.set(data,'extra', chat_message?.extra);
    _.set(data,['swipe_info', data.swipe_id ?? 0], chat_message?.extra);
  }
  ```
  `createChatMessages` 也支持 `extra`（:324-331、:370-372）。
  ⚠️ `role:'system'` 会顺带写 `extra.type = NARRATOR`（:258-262），`extra` 整对象被覆盖时注意别丢字段。
- 世界书接口（`src/function/lorebook_entry.ts`）：
  - `getLorebookEntries(lorebook, {filter})`（:195-198）→ `LorebookEntry[]`（内部走 ST `loadWorldInfo`，:203）
  - `setLorebookEntries(lorebook, entries)`（:369-372）→ 内部 `replaceLorebookEntries`（:340-355）→ ST `saveWorldInfo`
  - `createLorebookEntries(lorebook, entries)`（:384-406）→ `{entries, new_uids}`
  - `deleteLorebookEntries(lorebook, uids)`（:408-419）
  - `updateLorebookEntriesWith(lorebook, updater)`（:361-367）
  - 废弃：`createLorebookEntry`（:423）、`deleteLorebookEntry`（:428）
  - 书级：`getLorebooks` / `createLorebook` / `deleteLorebook`（`src/function/lorebook.ts:202-217`）

## 9. 未证实 / 未找到

- 未在真机跑过请求，以上全是静态源码推理（无网络、无浏览器、只读约束）。
- 助手 `dist/index.js`（打包产物）未逐行核对，仅确认与 `src/` 同版本目录。
- ST `1.17.0` / `1.13.2` 两套旧安装未取证，若用户实际切版本需重查。
- 「中转站返回 200 + 错误正文」的第 1 条路径是行业常见做法推断 + 代码可证，未在本机抓到真实抓包样本。

---

## 续：json_schema × tools × 各 source

> 本节路径别名同上：`ROOT` = `D:\sillytavern-software\SillyTavern Launcher GUI\data\sillytavern\1.18.0`，
> `EXT` = `ROOT\public\scripts\extensions\third-party\JS-Slash-Runner`。
> 另用 `KAMI` = `D:\SillyTavern\卡密预设制作\src\scripts`（我们自己的脚本，非 ST 源码）。

### 一句话结论

**该传 `json_schema`；占位工具要保留**（去掉它，请求体里就没有 `tool_choice`，反截断照样接管）。
**特殊处理只有两处：`claude`（结构化输出被强制成 tool，正文恒为空，必须读 `tool_calls[0].function.arguments`）、
`makersuite`/`vertexai`（助手的 normalizer 会把 tools 和 tool_choice 一起删掉，反截断照样介入）。**

### E1. optionsInjector 到底注入什么

原文（`EXT\src\function\generate\responseGenerator.ts:527-542`）：

```ts
    } else {
      const needsInjection = hasTools || effectiveJsonSchema;
      const optionsInjector = needsInjection
        ? (data: any) => {
          if (hasTools) {
            data.tools = effectiveToolOptions!.tools;
            data.tool_choice = effectiveToolOptions!.tool_choice ?? 'auto';
          }
          if (effectiveJsonSchema) {
            data.json_schema = effectiveJsonSchema;
          }
        }
        : null;
      if (optionsInjector) {
        eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, optionsInjector);
      }
```

逐点解释：

- `hasTools` 算在哪：`EXT\src\function\generate\responseGenerator.ts:471` —— `const hasTools = !!(effectiveToolOptions?.tools?.length);`
- `effectiveToolOptions` / `effectiveJsonSchema` 算在哪：`EXT\src\function\generate\responseGenerator.ts:271-276` ——
  `effectiveToolOptions: supportedSource ? normalizedToolOptions.toolOptions : undefined,` /
  `effectiveJsonSchema: supportedSource ? jsonSchema : undefined,`
- 写入 `data` 的字段**只有三个**：`data.tools`（行 532）、`data.tool_choice`（行 533）、`data.json_schema`（行 536）。
- **`tool_choice` 在第 533 行写，条件是 `if (hasTools)`** —— 即「本次调用传了非空 tools」；
  值 = `effectiveToolOptions.tool_choice ?? 'auto'`（缺省兜 'auto'）。
- **只传 json_schema、不传 tools** → `hasTools=false` → 行 531 的分支不进 → **请求体里没有 `tool_choice` 这个字段**
  （`needsInjection` 仍为 true，因为 `effectiveJsonSchema` 有值，所以 `data.json_schema` 会被写进去）。
  唯一例外：ST 自带的全局工具管理器若已注册函数工具，会在更早的
  `ROOT\public\scripts\openai.js:2779-2780` → `ROOT\public\scripts\tool-calling.js:415-416`
  写入 `data.tool_choice = 'auto'`（**只会是 'auto'，永远不会是 'none'**）。
- 时序保证注入能进请求体：`ROOT\public\scripts\openai.js:3051-3057` —— 先 `createGenerationParameters`，
  再 `:3052 await eventSource.emit(event_types.CHAT_COMPLETION_SETTINGS_READY, generate_data)`，
  最后 `:3055 fetch(...)`。所以 optionsInjector 的改动在序列化之前落地。

**E1 结论**：**不能**。去掉占位工具、只留 `json_schema`，请求体里不会有 `tool_choice:'none'`，
`KAMI\20-反截断.js:182-183` 的 `const pinned = body.tool_choice; if (pinned === 'none') return { skip: '调用方关掉了工具' };`
就不会命中，反截断会注入它自己的函数并把 `tool_choice` 改成 `'auto'`（`KAMI\20-反截断.js:205`）。
两个前提（结构化输出、反截断放手）在「只给 json_schema」下**不能同时成立**；带上占位工具则可以。

### E2. tools + json_schema 同时传，各 source 各自会发生什么

前置：助手侧先把 tools 按 source 归一化（`EXT\src\function\generate\toolCallCompat.ts:88-172`），
`tool_choice:'none'` 只有在 **claude / openai / openrouter / azure_openai / custom / deepseek / xai 这 8 类**会原样保留；
`makersuite` / `vertexai` 走特殊分支（见下）。

| source | 服务端分支 | 最终请求体 | 返回怎么抽 | 空串风险 |
|---|---|---|---|---|
| `openai` | 通用尾 `chat-completions.js:2537-2539`（tools/tool_choice）+ `:2542-2551`（json_schema 兜底） | `tools=[占位]`、`tool_choice:'none'`、`response_format.json_schema{name,strict,schema}` | `:2601 response.send(json)` 原样透传 → 助手取 `choices[0].message.content` | 无 |
| `custom` | CUSTOM 分支 `:2304-2331`（`response_format` 在 `:2322-2331`）+ 通用 `:2537-2539` | 同上，URL 走 `custom_url` | 同上 | 无 |
| `claude` | `sendClaudeRequest` `:268-290` | `tools=[占位, jsonTool]`，**`tool_choice` 在 `:289` 被强制覆盖**为 `{type:'tool',name:<schema.name>}` | `:404 reply = { choices:[{message:{content: responseText}}], content }`，`responseText` 来自 `:400 content?.[0]?.text \|\| ''` | **高**：`content[0]` 是 `tool_use` 块时 `text` 为 undefined → `content=''` |
| `makersuite` / `vertexai` | `sendMakerSuiteRequest`：`:465-476`（schema→`responseMimeType`+`responseSchema`）、`:528-551`（tools→`function_declarations`）、`:591-621`（tool_choice→`functionCallingConfig`） | **助手侧已把 tools 删掉** → 请求体**无 `tools`、无 `toolConfig`**，只有 `generationConfig.responseSchema` | `:741 reply = { choices:[{message:{content: responseText}}], responseContent }`，`responseText` 来自 `:733 parts.filter(!thought).map(p=>p.text).join('\n\n')` | 中：模型只回 `functionCall` 时 `p.text` 全 undefined → `content=''`（`:734` 只在「无文本且无 functionCall 且无 inlineData」时才转成 error） |
| `deepseek` | `sendDeepSeekRequest` `:1051-1062`（tools）+ `:1065-1074`（**json_object hack**，不是 json_schema） | `tools`、`tool_choice:'none'`、`response_format:{type:'json_object'}`，并额外把 schema 作为一条 user 消息塞进 messages | `:1123 response.send(generateResponseJson)` | 无（schema 只是提示词，不强制） |
| `xai` | `sendXaiRequest` `:1163-1166` + `:1176-1185` | `tools`、`tool_choice:'none'`、`response_format.json_schema{name,strict,schema}` | `:1229` 原样透传 | 无 |
| `openrouter` | `:2216-2303`，schema 在 `:2266-2275`；tools 走通用 `:2537-2539` | 同上 | `:2601` 原样透传 | 无（但若模型是 `anthropic/claude*`，实际由 OpenRouter 侧转 tool，未实测） |
| `azure_openai` | `sendAzureOpenAIRequest`：`ROOT\src\constants.js:454-455` 把 `tools`/`tool_choice` 列进 `AZURE_OPENAI_KEYS` 拷贝，schema 在 `:1670-1679` | `response_format.json_schema{name,strict,schema}` + `tools` + `tool_choice:'none'` | `:1719 response.send(json)` | 无 |

Claude 分支完整判定（**回答「什么条件下才转强制 tool」**）：

- `ROOT\src\endpoints\backends\chat-completions.js:282` —— `if (request.body.json_schema) {` —— **条件里没有 tools 的参与**：
  不管有没有传 tools、传的是 `'none'` 还是别的，只要 `json_schema` 存在就进这一段。
- `:288-289` —— `requestBody.tools = [...(requestBody.tools || []), jsonTool];` /
  `requestBody.tool_choice = { type: 'tool', name: request.body.json_schema.name };`
  —— 它**追加** json 工具并**覆盖**掉客户端传来的 `tool_choice`（`:270` 刚写进去的 `{type:'none'}` 被顶掉）。
- 所以同时传占位工具 + `tool_choice:'none'`，Claude **照样强制 tool**，不会被拒（`tool_choice` 是对象形态、工具确实在列表里，Anthropic 校验能过），
  但返回体里就没有正文文本 → 走 E3。

### E3. Claude 源的空串风险到底怎么触发

**E3a（转换条件的确切行）** —— `ROOT\src\endpoints\backends\chat-completions.js:281-290`：
```js
        // Structured output is a forced tool
        if (request.body.json_schema) {
            const jsonTool = {
                name: request.body.json_schema.name,
                description: request.body.json_schema.description || 'Well-formed JSON object',
                input_schema: request.body.json_schema.value,
            };
            requestBody.tools = [...(requestBody.tools || []), jsonTool];
            requestBody.tool_choice = { type: 'tool', name: request.body.json_schema.name };
        }
```
条件表达式就是 `request.body.json_schema` 为真，**与是否传 tools 无关**。

**E3b（reply 构造，逐行）** —— `ROOT\src\endpoints\backends\chat-completions.js:388-405`：
```js
        if (request.body.stream) {
            await forwardFetchResponse(generateResponse, response);
        } else {
            if (!generateResponse.ok) { ... return response.status(500).send({ error: true }); }
            const generateResponseJson = await generateResponse.json();
            const responseText = generateResponseJson?.content?.[0]?.text || '';
            const reply = { choices: [{ 'message': { 'content': responseText } }], content: generateResponseJson.content };
            return response.send(reply);
        }
```
`content` 变空串的条件：`generateResponseJson.content[0].text` 不存在。
强制 tool 时 Anthropic 返回的是 `content:[{type:'tool_use', name, input}]`，`content[0]` 没有 `text` → `responseText = ''`。
（只有当模型先吐一个 `text` 块、且它恰好排在 `content[0]` 时才会非空 —— 不保证。）

**E3c（该文件里 json_schema / jsonSchema / response_format 的全部出现点，按处理方式归类）**

- 定义：`:197-206 setJsonObjectFormat`（json_object + 往 messages 塞一条含 schema 的 user 消息）。
- **转成强制 tool（唯一一处）**：`:282-290`（Claude）。
- **转成 Gemini 原生 schema**：`:465-476`（`responseMimeType: 'application/json'` + `responseSchema`，**不带 strict**）。
- **转成 `response_format.json_schema` 且带 `strict ?? true`**：`:874-882`(MistralAI)、`:1176-1185`(xAI)、
  `:1282-1290`(AIMLAPI)、`:1382-1390`(ElectronHub)、`:1491-1499`(Chutes)、`:1670-1679`(Azure)、
  `:2266-2275`(OpenRouter)、`:2322-2331`(Custom)、`:2353-2362`(Groq)、`:2369-2378`(Fireworks)、`:2542-2551`(通用兜底)。
- **转成 `response_format.json_schema` 但不带 strict**：`:2340-2347`(Perplexity，只有 `schema`)、
  `:2424-2430`(Pollinations，只有 `schema`)、`:2489-2494`(Workers AI，只有 `schema`)、
  `:976-980`(Cohere，`{type:'json_schema', schema}`，连 name 都没有)。
- **降级成 json_object hack**：`:773-782`(AI21)、`:1065-1074`(DeepSeek)、`:2441-2442`(Moonshot)、
  `:2465`(ZAI)、`:2475`(SiliconFlow)。
- **入口预处理**：`:2170-2172` —— `request.body.json_schema.value = flattenSchema(request.body.json_schema.value, request.body.chat_completion_source);`
  （**所有** source 都先过一遍 `flattenSchema`，见 E4）。
- **兜底**：`:2542` —— `if (request.body.json_schema && !bodyParams['response_format'])` —— OpenAI 与 NanoGPT 走这条。
- 没有任何一处写成「`json_schema` 只在没有 tools 时才生效」。相反，Claude 是「有 tools 也照样覆盖 tool_choice」。

### E4. Gemini / makersuite 的 responseSchema 兼容性

字段白名单在 `ROOT\src\util.js:1436-1484 flattenSchema`：

```js
    const isGoogleApi = [CHAT_COMPLETION_SOURCES.VERTEXAI, CHAT_COMPLETION_SOURCES.MAKERSUITE].includes(api);
    ...
            if (isGoogleApi && ['default', 'additionalProperties', 'exclusiveMinimum', 'propertyNames'].includes(key)) {
                continue;
            }
```
- **有白名单，但只对 Google 生效**：删 `default` / `additionalProperties` / `exclusiveMinimum` / `propertyNames`（`:1471`）；
  `$defs` 会被内联展开（`:1444-1463`）；顶层 `$schema` 对所有 source 都删（`:1482`）。
- **`strict` 完全不参与**：`flattenSchema` 只处理 `json_schema.value`，而 `strict` 是外层包装字段；
  Gemini 分支 `:465-476` 也只用 `value`，从不读取 `strict`。→ **strict 不会传给 Gemini，也不会被校验**。
- 对我们的 schema（`{type:'object', properties:{timeline:{type:'string'}, plot:{type:'string'}, changes:{type:'array', items:{type:'string'}}}, required:['timeline','plot','changes'], additionalProperties:false}`）：
  - **Gemini**：`additionalProperties` 会被 `flattenSchema` 删掉（`:1471`），剩下的 object/string/array+items 都是 Gemini `responseSchema` 支持的原语 →
    **预期不会因 schema 报错**。⚠️ 但**未实测**；且如果把占位工具留下了，助手会把 tools 删掉（见 E2），
    反截断随后又会把 tools 加回来并把 `toolConfig.mode` 设成 AUTO（`:591-621`），
    「`responseSchema` + 工具」在 Google 侧能否共存**源码里查不到**，属未证实项。
  - **Claude**：`:286 input_schema: request.body.json_schema.value`（已被入口 flatten，`additionalProperties` 保留）→
    Anthropic 的 `input_schema` 接受标准 JSON Schema，**不会因 `additionalProperties:false` 报错**；
    但会走强制 tool → **正文必然为空**（E3）。
  - **OpenAI**：`response_format.json_schema.strict ?? true` → `strict:true` → 我们的 schema 每个 property 都在 `required` 里、
    且带 `additionalProperties:false`，**正好满足 strict 模式的两条硬要求**，预期通过。

### E5. `strict` 的默认值

- **助手侧没有实现默认值** —— `EXT\src\function\generate\types.ts:37-42` 里 `strict?: boolean` 只是可选字段，
  类型文件、`@types.txt`（`:1243-1252`）写的也是「默认 true」的**说明**，代码里没有赋值。
- 「默认 true」实际由**服务端每个分支各自 `?? true`** 实现，共 11 处：
  `ROOT\src\endpoints\backends\chat-completions.js:881`(Mistral)、`:1181`(xAI)、`:1289`(AIMLAPI)、`:1389`(ElectronHub)、
  `:1498`(Chutes)、`:1675`(Azure)、`:2271`(OpenRouter)、`:2327`(Custom)、`:2360`(Groq)、`:2376`(Fireworks)、`:2547`(通用兜底/OpenAI)。
  典型原文（`:2547`）—— `strict: request.body.json_schema.strict ?? true,`
- **`strict:true` 对我们的额外要求**：OpenAI strict 要求「每个 property 都出现在 `required`」+「每层带 `additionalProperties:false`」。
  我们的 schema 两条都满足。
- **ST 有没有做校验/补全：没有。** `flattenSchema` 只做 `$ref` 内联 + 4 个 Google 关键字剪枝 + 删 `$schema`；
  它**不会**把漏写的 property 补进 `required`，也**不会**补 `additionalProperties`。
  所以 schema 写错（例如某个 property 没进 required）在 OpenAI 侧会被拒（400 → 见下），ST 不兜。

### 错误怎么回传（补充第 6 节 B 的结论）

- `openai` / `custom` / `openrouter` / `deepseek` / `xai` 等通用路径：上游 400 → `:2611 response.send({ error: { message } })`
  （HTTP 200）→ 助手 `EXT\src\function\generate\responseGenerator.ts:408` 抛 `data.error.message` → **上游原文可见**。
- `claude` / `makersuite` / `azure`：上游 400 → `:395 response.status(500).send({ error: true })` /
  `:712 response.status(500).send(errorJson)` / `:1724 response.status(500).send(data)` →
  助手只抛 `Got response status 500`，**具体错误不会进异常消息**（`ROOT\public\scripts\openai.js:1652` 把
  `tryParseStreamingError` 的 throw 吞了），只能看 toast。调试时注意这一差别。

### 本节未证实

1. 「OpenAI 允许 `tools` + `tool_choice:'none'` + `response_format.json_schema` 同时出现」只从 ST 一定会这么发推出，
   **没有真实请求样本**；上游若拒绝，会以 400 返回。
2. 「Gemini 允许 `responseSchema` 与 `functionDeclarations` 共存」源码无法回答。
3. Claude 强制 tool 时，`content[0]` 是否**永远**是 `tool_use`（有没有可能先给一个 text 块）未实测；
   若模型先输出 text，`responseText` 可能非空 —— 也就是说 Claude 的结果形态**不稳定**。
4. OpenRouter 上跑 Claude / Gemini 模型时，`response_format` 由 OpenRouter 侧如何转译未实测。
