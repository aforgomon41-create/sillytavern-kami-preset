/* ============================================================================
 * 卡密预设 · 常驻附加指令（纯逻辑，构建期内联进 35-提示词发送修改.js）
 * ----------------------------------------------------------------------------
 * 干什么：用户每发一条消息，把面板里填的那段话用 <god>…</god> 包起来，
 *   **原地接在发给模型的最后一条 user 消息末尾**。只进提示词，不碰聊天记录。
 *
 * 为什么是 <god>（别自造标签）：它在这份预设里已经是一等公民 ——
 *   「ROOT 最高权限指令，具有绝对覆盖力」写在预设的系统条目里，优先级链也写明
 *   （<god> 指令 > <interactive_input> 意图 > 系统底层协议 > 角色常规设定）。
 *   所以直接复用既有语法，语义天然对齐。
 *
 * 两道守卫（都会在下面的函数里生效）：
 *   ① shouldInject：最后一条消息必须 role === 'user'。
 *      为什么必须有：60-压缩 的 generateRaw 也会派发同一个事件，它最后一条是 system；
 *      不挡就会给摘要请求也塞一段 <god>。
 *   ② 幂等：正文里已经有同样的包块就不再追加。
 *      为什么必须有：CHAT_COMPLETION_PROMPT_READY 一轮会派发不止一次
 *      （酒馆自己数 token 的那趟 dryRun + 真正发送那趟），不判重就会叠成两段。
 *
 * ⚠️ 调用方（35 号）必须**原地改 content**，不许写 data.chat = [...] 整体替换：
 *   酒馆 openai.js 派发该事件后回读的是它自己闭包里的那个数组，整体替换会**静默失效**，
 *   还会把同一条链路上「角色名包裹」的改动一起丢掉（.audit/常驻附加指令-调研.md §2.2）。
 *   本模块只算字符串，不碰数组，就是为了一行都不用写那种危险操作。
 *
 * 这里一行 DOM / 一行酒馆 API 都没有 —— 于是可以离线单测
 * （test/harness/godcmd-pure.mjs），也不用为了改一句话去开浏览器。
 * ========================================================================== */

/* 包块的两端：与预设里既有的 <god>…</god> 写法一致（不是 <god > 之类变体）。 */
var GODCMD_OPEN = '<god>';
var GODCMD_CLOSE = '</god>';

/* 用户那段话 → 要追加的包块。空 / 全空白返回空串（调用方据此不追加）。
   形状固定成「换行 + <god> + 换行 + 正文 + 换行 + </god>」：
   贴在上一条正文后面换行隔开，正文里含多少换行都原样保留，不做任何转义。 */
export function buildGodCmdBlock(text) {
  if (typeof text !== 'string') { return ''; }
  if (!text.replace(/\s/g, '')) { return ''; }
  return '\n' + GODCMD_OPEN + '\n' + text + '\n' + GODCMD_CLOSE;
}

/* 该不该给这一趟提示词注入。chat = data.chat（酒馆拼好的消息数组）。
   false 的四种情况：不是数组、空数组、最后一条不是对象、最后一条不是 user。 */
export function shouldInject(chat) {
  if (!chat || typeof chat.length !== 'number' || !chat.length) { return false; }
  var last = chat[chat.length - 1];
  if (!last || typeof last !== 'object') { return false; }
  return last.role === 'user';
}

/* 把包块接到正文末尾。返回**新的字符串**，调用方自己赋回去（本模块不改入参对象）。
   三种情况原样返回：没有正文、文本为空、正文末尾已经是同样的包块（幂等）。 */
export function appendGodCmd(content, text) {
  if (typeof content !== 'string') { return content; }
  var block = buildGodCmdBlock(text);
  if (!block) { return content; }
  if (content.slice(-block.length) === block) { return content; }
  return content + block;
}
