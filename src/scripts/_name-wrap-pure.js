/* ============================================================================
 * 卡密预设 · 角色名包裹纯逻辑（构建期内联进 35-提示词发送修改.js）
 * ----------------------------------------------------------------------------
 * 干什么：把一段提示词文本里的 `<n>角色名</n>` 换成当前档位的包裹符号，
 *   同时**只保护文生图块**（`<image_task>…</image_task>`），不要把整条消息跳过。
 *
 * 为什么不能整条跳过（2026-10-20 真机 bug）：
 *   酒馆的「压缩系统消息」会把连续的 system 条目合并成一条大 system 消息。
 *   35 号原来看到消息里出现 `<image_task>` 就整条跳过 —— 合并后这一条里既有
 *   文生图块、也有输出规范和 62 处角色名标记，于是整条系统消息都没被替换，
 *   用户看到的提示词里全是 `<n>`。
 *
 * 现在的边界：
 *   · 只保护**行首**的 `<image_task>…</image_task>` 块；正文里顺口提到
 *     `<image_task>` 的那句话不算块（HTML美化条目里就有一句这样的提及）。
 *   · 块外照常替换；块内如果有 `<n>` 则保持原样并报数，交给调用方提示。
 * ========================================================================== */

export var NAME_WRAP_OPEN = '<n>';
export var NAME_WRAP_CLOSE = '</n>';

/* 只认行首（允许缩进）的完整文生图块；行内提及不算。 */
var IMAGE_TASK_RE = /(^|\n)([ \t]*)<image_task>[\s\S]*?<\/image_task>/g;

export function nameWrapReplace(text, open, close, counter) {
  var re = /<n>([^<]*)<\/n>/g;
  return String(text == null ? '' : text).replace(re, function (_full, inner) {
    if (counter) { counter.n++; }
    return open + inner + close;
  });
}

/* 返回 { text, skippedBlocks, skippedTokens }。skippedTokens 是块内未替换的 <n> 数。 */
export function nameWrapExceptImageTask(text, open, close, counter) {
  var source = String(text == null ? '' : text);
  var out = [], last = 0, match, skippedBlocks = 0, skippedTokens = 0;
  IMAGE_TASK_RE.lastIndex = 0;
  while ((match = IMAGE_TASK_RE.exec(source))) {
    var start = match.index + (match[1] ? match[1].length : 0);
    var block = source.slice(start, match.index + match[0].length);
    out.push(nameWrapReplace(source.slice(last, start), open, close, counter));
    out.push(block);
    skippedBlocks++;
    skippedTokens += (block.match(/<n>[^<]*<\/n>/g) || []).length;
    last = match.index + match[0].length;
    if (IMAGE_TASK_RE.lastIndex === match.index) { IMAGE_TASK_RE.lastIndex++; }
  }
  out.push(nameWrapReplace(source.slice(last), open, close, counter));
  return { text: out.join(''), skippedBlocks: skippedBlocks, skippedTokens: skippedTokens };
}
