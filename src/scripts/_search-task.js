/* 网络搜索头部任务绑定。复用当前预设读写和通知，不轮询整个预设或新增运行脚本。 */
export function createKamiSearchTaskBinding(env, definition) {
  function locate(raw) {
    if (!raw || !raw.ok) { throw new Error(raw && raw.error || '无法读取当前预设'); }
    var prompt = (raw.settings.prompts || []).find(function (row) { return row.identifier === definition.identifier; });
    var order = (raw.order.order || []).find(function (row) { return row.identifier === definition.identifier; });
    return { raw: raw, prompt: prompt, order: order };
  }
  function place(list, row) {
    var at = list.findIndex(function (item) { return item.identifier === 'prompt_1789213927315_4s0dsfk'; });
    list.splice(at < 0 ? list.length : at + 1, 0, row);
  }
  function read() {
    var item = locate(env.read());
    return item.prompt && item.order ? { enabled: item.order.enabled === true, content: String(item.prompt.content || '') } : null;
  }
  function write(patch, fallback) {
    var item = locate(env.read()), raw = item.raw, addedPrompt = !item.prompt, addedOrder = !item.order;
    var before = item.prompt ? { enabled: item.prompt.enabled, content: item.prompt.content } : null, beforeOrder = item.order && item.order.enabled;
    if (!item.prompt) { item.prompt = JSON.parse(JSON.stringify(definition)); if (fallback) { item.prompt.enabled = !!fallback.enabled; item.prompt.content = fallback.content; } place(raw.settings.prompts, item.prompt); }
    if (!item.order) { item.order = { identifier: definition.identifier, enabled: item.prompt.enabled === true }; place(raw.order.order, item.order); }
    var changed = addedPrompt || addedOrder;
    if (typeof patch.enabled === 'boolean' && (item.order.enabled !== patch.enabled || item.prompt.enabled !== patch.enabled)) { item.order.enabled = item.prompt.enabled = patch.enabled; changed = true; }
    if (typeof patch.content === 'string' && item.prompt.content !== patch.content) { item.prompt.content = patch.content; changed = true; }
    var undoMirror;
    try { undoMirror = env.mirror(raw, item.prompt, item.order); if (changed) { env.save(raw); } }
    catch (error) {
      if (typeof undoMirror === 'function') { undoMirror(); }
      if (addedPrompt) { raw.settings.prompts.splice(raw.settings.prompts.indexOf(item.prompt), 1); } else { item.prompt.enabled = before.enabled; item.prompt.content = before.content; }
      if (addedOrder) { raw.order.order.splice(raw.order.order.indexOf(item.order), 1); } else { item.order.enabled = beforeOrder; }
      throw error;
    }
    return { enabled: item.order.enabled === true, content: item.prompt.content, changed: changed };
  }
  return { read: read, write: write, ensure: function (fallback) { return read() || write({}, fallback); } };
}
