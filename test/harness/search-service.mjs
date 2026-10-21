import { kamiUserHandle } from '../../src/scripts/_user-scope.js';
import assert from 'node:assert/strict';
import { createKamiSearchService } from '../../src/scripts/_search-service.js';
import * as pure from '../../src/scripts/_search-pure.js';
import * as providerModule from '../../src/scripts/_search-providers.js';
import fs from 'node:fs';
import { createKamiSearchTaskBinding } from '../../src/scripts/_search-task.js';
const { parseWebSearchJSON, webSearchSource, webSearchTag, readWebSearchRecords, normalizeWebSearchRecord, attachWebSearchRecord } = pure;

let count = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); count++; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const events = Object.fromEntries(['CHAT_COMPLETION_SETTINGS_READY', 'MESSAGE_RECEIVED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'OAI_PRESET_CHANGED_AFTER'].map(name => [name, name]));
const plan = { needed: true, world: '示例世界', scope: '当前版本', queries: ['城镇的建筑风格'] };
const evidence = { world: '示例世界', facts: [{ key: '城镇建筑', text: '当地建筑使用浅色石材。', source_ids: ['s1'], note: '仅适用当前版本' }] };
function make(options = {}) {
  let vars = { keep: 7, 'kami-web-search': { enabled: true, mode: 'service', provider: 'tavily', ...(options.config || {}) } };
  let ctx = { chatId: 'A', chat: [{ is_user: true, mes: '走进城镇' }], chatCompletionSettings: options.settings || {}, extensionPrompts: { '1_memory': { value: '已确认的旧剧情', position: 0 } } };
  let epoch = 0, rawIndex = 0;
  const listeners = new Map(), timers = new Map(), rawCalls = [], requests = [], creates = [], writes = [], stopped = [];
  const storage = new Map(Object.entries(options.storage || {}));
  const emit = async (event, ...args) => { for (const fn of [...listeners.get(event) || []]) await fn(...args); };
  const env = { pure, task: options.task, taskDefinition: options.taskDefinition, providers: { list: providerModule.webSearchProviders, get: providerModule.webSearchProvider, endpoint: providerModule.webSearchEndpoint, request: providerModule.webSearchRequest, rows: providerModule.webSearchRows },
    host: { localStorage: { getItem(key) { if (options.denyStorage) throw new Error('denied'); return storage.get(key) || null; }, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      async fetch(path, init) { requests.push({ path, body: init.body ? JSON.parse(init.body) : null, init }); if (path === '/api/users/me') return options.userFetch ? options.userFetch() : { ok: true, json: async () => ({ handle: options.userHandle || 'A' }) }; if (options.fetch) return options.fetch(path, init); return { ok: true, async json() { return { results: [{ title: '设定资料', url: 'https://example.org/world', content: '浅色石材的建筑。' }] }; } }; } },
    context: () => ctx, headers: async () => ({ 'Content-Type': 'application/json' }),
    stamp: () => ({ id: ctx.chatId, chat: ctx.chat, epoch }), validStamp: stamp => stamp.id === ctx.chatId && stamp.chat === ctx.chat && stamp.epoch === epoch,
    readVariables: () => structuredClone(vars), writeVariables: next => { vars = structuredClone(next); },
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); return { stop: () => listeners.get(event).delete(fn) }; }, events,
    canRun: () => true, count: options.count || (async text => options.tokens || Math.ceil(text.length / 3)), connections: () => [],
    fetchUserHandle: kamiUserHandle, responseText: response => response?.content || '', toast() {}, saveNotice() {}, stopRaw: id => stopped.push(id),
    async raw(request, connection) {
      rawCalls.push({ request, connection }); const index = rawIndex++;
      equal(request.should_silence, true, '后台搜索使用独立取消按钮');
      const data = { type: options.rawType || 'normal', max_tokens: options.rawMaxTokens || 65535, reasoning_effort: 'max', messages: request.ordered_prompts.filter(item => typeof item === 'object') };
      await emit(events.CHAT_COMPLETION_SETTINGS_READY, data);
      equal(data._kami_background_task, 'web_search', '独立搜索请求标明后台任务');
      equal(data.enable_web_search, false, '外部搜索模型不再叠加原生搜索');
      const manual = api.status().manualRunning, output = Math.max(manual ? 8192 : 4096, api.limits(manual).maxTokens + 2048);
      equal(data.max_tokens, Math.min(options.rawMaxTokens || 65535, output), '资料输出预算随保存上限扩展，不提高原有小预算');
      equal(data.reasoning_effort, 'low', '不继承剧情最高思考档');
      if (options.raw) return options.raw(request, index);
      return JSON.stringify(index % 2 === 0 ? plan : evidence);
    },
    createMessages(messages) { creates.push(messages); for (const item of messages) ctx.chat.push({ is_user: false, mes: item.message }); return Promise.resolve(); },
    writeMessages(messages) { writes.push(messages); for (const item of messages) ctx.chat[item.message_id].mes = item.message; return options.write ? options.write(messages) : Promise.resolve(); },
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }
  };
  const api = createKamiSearchService(env);
  return { api, env, emit, rawCalls, requests, creates, writes, timers, stopped, storage, context: () => ctx, vars: () => vars,
    switchChat() { epoch++; ctx = { ...ctx, chatId: 'B', chat: [{ is_user: true, mes: '另一段剧情' }] }; },
    reply(text) { ctx.chat.push({ is_user: false, mes: text }); return ctx.chat.length - 1; },
    request(type = 'normal') { return { type, messages: [{ role: 'user', content: '走进城镇' }], model: 'example', chat_completion_source: 'custom', max_tokens: 1000 }; }
  };
}

equal(parseWebSearchJSON('```json\n{"a":1}\n```'), { a: 1 });
equal(parseWebSearchJSON('<html>接口错误</html>'), null);
equal(parseWebSearchJSON('[]'), null);
equal(webSearchSource({ url: 'javascript:alert(1)' }), null);
equal(webSearchSource({ url: 'https://user:secret@example.org' }), null);
const sample = normalizeWebSearchRecord(evidence, [{ id: 's1', title: '</script>', url: 'https://example.org' }]);
equal(sample.facts.length, 1);
equal(webSearchTag(sample).includes('</script>'), false);
equal(readWebSearchRecords(webSearchTag(sample))[0].facts[0].text, sample.facts[0].text + '（仅适用当前版本）');
equal(readWebSearchRecords('<search_results>' + JSON.stringify(sample) + '</search_results>')[0], sample, '旧JSON资料仍兼容');
equal(webSearchTag(sample).includes('schema_version'), false, '新资料块不保存机器字段');
equal(webSearchTag(sample).includes('queries'), false);
equal(webSearchTag(sample).includes('note'), false);
equal(normalizeWebSearchRecord(evidence, [], []).facts, []);
equal(normalizeWebSearchRecord(evidence, sample.sources, sample.facts).facts, []);
equal(readWebSearchRecords(attachWebSearchRecord('<out_body><introduction>旧内容</introduction><content>剧情</content></out_body>', sample)).length, 1);
equal(attachWebSearchRecord('正文' + webSearchTag(sample), null), '正文');

{
  const definition = JSON.parse(fs.readFileSync(new URL('../../src/preset.base.json', import.meta.url))).prompts.find(p => p.identifier === 'kami_web_search_task');
  const raw = { ok: true, settings: { prompts: [structuredClone(definition)] }, order: { order: [{ identifier: definition.identifier, enabled: false }] } };
  let saves = 0;
  const binding = createKamiSearchTaskBinding({ read: () => raw, mirror() {}, save() { saves++; } }, definition);
  const e = make({ task: binding, taskDefinition: definition });
  equal(e.api.status().enabled, false, '条目开关优先于旧工具箱变量');
  equal(e.vars()['kami-web-search'].system, definition.content, '条目完整内容同步到工具箱');
  e.api.configure({ enabled: true, system: '工具箱修改的完整任务' });
  equal(binding.read(), { enabled: true, content: '工具箱修改的完整任务' });
  equal(e.vars()['kami-web-search'].system, '工具箱修改的完整任务');
  raw.settings.prompts[0].content = '用户在头部条目修改任务'; raw.order.order[0].enabled = false;
  await e.emit(events.OAI_PRESET_CHANGED_AFTER);
  equal(e.api.status().enabled, false); equal(e.vars()['kami-web-search'].system, '用户在头部条目修改任务');
  const before = saves; e.api.status(); e.api.syncTask(); equal(saves, before, '无变化不重复保存条目');
  const request = e.request(); await e.api.beforeSend(request); equal(e.rawCalls.length, 0, '条目关闭后没有独立模型请求');
  e.api.shutdown();
  const missing = { ok: true, settings: { prompts: [] }, order: { order: [] } };
  const newBinding = createKamiSearchTaskBinding({ read: () => missing, mirror() {}, save() {} }, definition);
  const off = make({ task: newBinding, taskDefinition: definition, config: { enabled: false } });
  equal(newBinding.read(), null, '旧预设未开搜索时不主动插入条目');
  off.api.configure({ enabled: true }); equal(newBinding.read(), { enabled: true, content: definition.content }, '开启搜索时迁移完整头部任务');
  off.api.shutdown();
  missing.settings.prompts = []; missing.order.order = [];
  const on = make({ task: newBinding, taskDefinition: definition });
  equal(newBinding.read(), { enabled: true, content: definition.content }, '旧预设原先已开搜索时自动迁移');
  equal(on.vars()['kami-web-search'].enabled, true); on.api.shutdown();
}

{
  const source = { id: 's3', title: '不需要重复保存的来源标题', url: 'https://example.org/?a=1&b=2' };
  const record = { ...sample, origin: 'native', world: '世界 <x> & Y', scope: '版本一', facts: [{ text: '事实含 <tag>、&lt; 字样和 [9] 引用。', source_ids: ['s3', 's3'], note: '' }], sources: [source] };
  const tag = webSearchTag(record), back = readWebSearchRecords(tag)[0];
  equal(back.origin, 'native'); equal(back.facts[0].text, record.facts[0].text);
  equal(back.sources[0].url, source.url); equal(back.facts[0].source_ids, ['s1']);
  equal(webSearchTag(back), tag, '精简格式重复读写稳定且不重复编码');
  /* 2026-10-21 用户裁定：来源标题要救回来（前端要显示真实标题而不是主机名）。
     这条断言原来是反的（当时刻意不保存标题以省体积），使命完成即翻转，不删除。 */
  equal(tag.includes('不需要重复保存的来源标题'), true, '来源标题现在会写进标签');
  equal(readWebSearchRecords('<search_results>范围：世界\n- 旧格式 [1]\n[1] https://old.example/a\n</search_results>')[0].sources[0].title, 'old.example', '旧消息没有标题时退回主机名');
  equal(readWebSearchRecords('<search_results>范围：世界\n- 没有可信来源 [1]\n[1] javascript:alert(1)\n</search_results>')[0].facts, []);
  equal(readWebSearchRecords('<search_results>范围：世界\n- 不能保存密码URL [1]\n[1] https://user:secret@example.org\n</search_results>')[0].facts, []);
  equal(readWebSearchRecords('<search_results>范围：世界\n- 不接受未列出的来源 [2]\n[1] https://example.org\n</search_results>')[0].facts, []);
  const many = { world: '世界', facts: Array.from({ length: 10 }, (_, i) => ({ text: '事实' + i, source_ids: ['s1'] })), sources: [{ id: 's1', url: 'https://example.org' }] };
  equal(readWebSearchRecords(webSearchTag(normalizeWebSearchRecord(many, many.sources)))[0].facts.length, 8, '自动资料仍最多8条');
  equal(readWebSearchRecords(webSearchTag(normalizeWebSearchRecord(many, many.sources, [], {manual:true})))[0].facts.length, 10, '手动资料保留更多事实');
  for (const status of ['not_found', 'budget_exceeded', 'no_new_facts']) equal(readWebSearchRecords(webSearchTag({ facts: [], sources: [], status }))[0].status, status);
  equal(readWebSearchRecords(webSearchTag({ ...record, facts: [{ text: '原事实', source_ids: ['s3'], note: '增加无用的检索日志' }] }))[0].facts[0].text, '原事实');
}

{
  const e = make({ rawType: 'quiet' });
  equal((await e.api.search('城镇')).facts.length, 1, '兼容旧版助手 quiet 独立调用');
  e.api.shutdown();
}
{
  const e = make({ rawMaxTokens: 2048 });
  equal((await e.api.search('城镇')).facts.length, 1, '保持用户较小的输出上限'); e.api.shutdown();
}
for (const type of ['normal', 'quiet']) {
  const e = make();
  const stale = { type, messages: [{ role: 'system', content: '__kami_search_private_expired' }] };
  await assert.rejects(e.api.beforeSend(stale), /已经失效/, '过期独立调用不能递归触发搜索'); count++;
  equal(e.rawCalls.length, 0); e.api.shutdown();
}

{
  const e = make(); const record = await e.api.search('城镇');
  equal(record.facts.length, 1);
  equal(e.creates.length, 1, '手动只创建一个资料楼层');
  equal(e.writes.length, 0);
  equal(e.rawCalls.length, 2);
  equal(e.rawCalls[0].request.ordered_prompts.includes('chat_history'), true, '历史走助手内置正则路径');
  equal(e.rawCalls[0].request.ordered_prompts.includes('world_info_before'), true);
  equal(e.rawCalls[0].request.ordered_prompts.some(row => row.content?.includes('已确认的旧剧情')), true);
  equal(e.rawCalls[0].request.ordered_prompts.at(-1).role, 'system', '不触发剧情常驻附加指令');
  equal(e.rawCalls[1].request.ordered_prompts.includes('chat_history'), true, '提取阶段同样按角色设定与正则历史排除冲突及剧透');
  equal(e.rawCalls[0].request.overrides?.chat_history, undefined, '不使用会绕过正则的原文覆盖');
  equal(readWebSearchRecords(e.context().chat.at(-1).mes).length, 1);
  equal(e.timers.size, 0);
  e.api.configure({ system: '自定义搜索提示词' }); equal(e.vars().keep, 7, '保存不覆盖其他脚本变量');
  e.api.shutdown();
}
{
  const e = make({ config: { provider: 'serper' }, raw: async (_request, index) => JSON.stringify(index === 0 ? { ...plan, queries: ['城镇建筑', '城镇交通'] } : evidence),
    fetch: async (_path, init) => ({ ok: true, json: async () => ({ organic: Array.from({ length: 5 }, (_, n) => ({ title: '资料', link: 'https://example.org/' + encodeURIComponent(JSON.parse(init.body).query) + n, snippet: '搜索片段' })) }) }) });
  await e.api.search('城镇');
  equal(e.requests.length, 2); equal(e.requests.every(item => item.path === '/api/search/serper'), true);
  const material = JSON.parse(e.rawCalls[1].request.ordered_prompts.find(item => item.role === 'user').content);
  equal(material.sources.length, 8, '手动查询使用八个来源预算');
  equal(new Set(material.sources.map(item => item.url.replace(/\d$/, ''))).size, 2, '第二个查询仍能分到来源名额');
  e.api.shutdown();
}
{
  const e = make(); e.context().chat.push({ is_user: false, is_hidden: true, mes: webSearchTag(sample) });
  const record = await e.api.search('资料');
  equal(record.facts.length, 1, '已隐藏的旧资料不重新带入增量比对'); e.api.shutdown();
}
{
  const e = make({ fetch: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(e.api.search('资料'), /HTTP 403/); count++;
  equal(e.creates.length, 0, '搜索服务失败不创建成功资料楼层'); equal(e.timers.size, 0); e.api.shutdown();
}
for (const failure of ['model', 'service', 'timeout']) {
  const gate = deferred();
  const e = make(failure === 'model' ? { raw: async () => { throw Error('模型不可用'); } } : failure === 'service' ? { fetch: async () => ({ ok: false, status: 403 }) } : { raw: () => gate.promise });
  const task = e.api.beforeSend(e.request());
  if (failure === 'timeout') { await tick(); [...e.timers.values()][0](); }
  await task;
  const id = e.reply('<content>剧情照常</content>' + webSearchTag(sample));
  await e.emit(events.MESSAGE_RECEIVED, id); await e.emit(events.GENERATION_ENDED);
  equal(readWebSearchRecords(e.context().chat[id].mes).length, 0, '模型/服务失败及超时后剔除剧情编造的搜索块：' + failure);
  equal(e.writes.length, 1, '两个结束事件不会重复改写'); e.api.shutdown();
}
{
  const e = make(), request = e.request(); await e.api.beforeSend(request);
  equal(e.creates.length, 0, '自动搜索不新建资料楼层');
  equal(request.messages.length, 3, '当前剧情请求得到资料与输出约束');
  const id = e.reply('<out_body><introduction>前处理</introduction><content>剧情</content><appendix><summary>摘要</summary></appendix></out_body>');
  await e.emit(events.MESSAGE_RECEIVED, id); await e.emit(events.GENERATION_ENDED);
  equal(e.context().chat.length, 2, '仍只有用户与一个最终 AI 楼层');
  equal(e.writes.length, 1); equal(readWebSearchRecords(e.context().chat[id].mes).length, 1);
  equal(e.context().chat[id].mes.includes('<summary>摘要</summary>'), true);
  const regenerate = e.request('regenerate'); await e.api.beforeSend(regenerate);
  equal(e.rawCalls.length, 2, '同一用户楼层重生成复用资料');
  e.context().chat[id].mes = '<content>另一个版本的剧情</content>'; await e.emit(events.MESSAGE_RECEIVED, id);
  equal(e.context().chat.length, 2); equal(readWebSearchRecords(e.context().chat[id].mes).length, 1);
  e.api.shutdown();
}
{
  const e = make({ raw: async () => JSON.stringify({ needed: false, queries: [] }) });
  await e.api.beforeSend(e.request()); equal(e.requests.length, 0);
  const id = e.reply('剧情' + webSearchTag(sample)); await e.emit(events.MESSAGE_RECEIVED, id);
  equal(readWebSearchRecords(e.context().chat[id].mes).length, 0, '未检索时不保存模型虚构的搜索块'); e.api.shutdown();
}
{
  const e = make(), request = e.request(); await e.api.beforeSend(request);
  e.api.configure({ enabled: false, provider: 'serper', system: '下一轮的新配置' });
  const id = e.reply('<content>使用了资料的剧情</content>');
  await e.emit(events.MESSAGE_RECEIVED, id);
  equal(readWebSearchRecords(e.context().chat[id].mes).length, 1, '已交给剧情的资料不会因修改下轮配置丢失');
  equal(e.creates.length, 0); e.api.shutdown();
}
{
  const gate = deferred(), e = make({ write: () => gate.promise });
  await e.api.beforeSend(e.request()); e.reply('<content>第一轮剧情</content>');
  const ending = e.emit(events.GENERATION_ENDED); await tick();
  await e.api.beforeSend(e.request()); const nextId = e.reply('<content>第二轮剧情</content>');
  gate.resolve(); await ending; await e.emit(events.MESSAGE_RECEIVED, nextId);
  equal(e.writes.length, 2, '前一轮迟到的结束回调不清掉新一轮待保存资料');
  equal(readWebSearchRecords(e.context().chat[nextId].mes).length, 1); e.api.shutdown();
}
for (const newFacts of [false, true]) {
  const e = make({ raw: async (_request, index) => JSON.stringify(newFacts ? (index % 2 === 0 ? plan : evidence) : { needed: false, queries: [] }) });
  const older = { ...sample, facts: [{ ...sample.facts[0], text: '旧记录中的城门朝东。' }] };
  const id = e.reply('<introduction>' + webSearchTag(older) + '</introduction><content>旧剧情</content>');
  await e.api.beforeSend(e.request('continue'));
  e.context().chat[id].mes += '<content>续写剧情</content>' + webSearchTag(sample);
  await e.emit(events.MESSAGE_RECEIVED, id); await e.emit(events.GENERATION_ENDED);
  const records = readWebSearchRecords(e.context().chat[id].mes);
  equal(records.length, newFacts ? 2 : 1, '继续生成保留原楼资料且剔除伪造块');
  equal(records[0], readWebSearchRecords(webSearchTag(older))[0], '续写保留原资料事实与来源');
  equal(e.context().chat[id].mes.includes('续写剧情'), true);
  equal(e.creates.length, 0, '继续生成不新增楼层');
  equal(e.writes.length, 1, '重复回调不重复更新');
  e.api.shutdown();
}
for (const mode of ['chat', 'stop', 'timeout']) {
  const gate = deferred(), e = make({ raw: () => gate.promise });
  const task = e.api.search('资料'); await tick();
  if (mode === 'chat') { e.switchChat(); await e.emit(events.CHAT_CHANGED); }
  if (mode === 'stop') await e.emit(events.GENERATION_STOPPED);
  if (mode === 'timeout') [...e.timers.values()][0]();
  await assert.rejects(task, error => error.searchCancelled); count++;
  gate.resolve(JSON.stringify(plan)); await tick();
  equal(e.creates.length, 0); equal(e.writes.length, 0); equal(e.stopped.length, 1); equal(e.timers.size, 0);
  e.api.shutdown();
}
{
  const gate = deferred(), e = make({ raw: () => gate.promise }), request = e.request();
  const task = e.api.beforeSend(request); await tick(); e.switchChat(); await e.emit(events.CHAT_CHANGED); await task;
  gate.resolve(JSON.stringify(plan)); await tick(); equal(request.messages.length, 1, '切聊天后不把资料注入原请求'); e.api.shutdown();
}
{
  const e = make(); await e.api.beforeSend(e.request()); await e.emit(events.GENERATION_STOPPED);
  const id = e.reply('<content>停止时的部分正文</content>'); await e.emit(events.GENERATION_ENDED);
  equal(e.writes.length, 0); equal(readWebSearchRecords(e.context().chat[id].mes).length, 0); e.api.shutdown();
}
{
  const e = make({ settings: { openai_max_context: 1100, openai_max_tokens: 1000 }, tokens: 500 }), request = e.request();
  await e.api.beforeSend(request); equal(request.messages.length, 1, '余量不足时不挤掉原有上下文'); e.api.shutdown();
}
{
  const e = make({ config: { enabled: true, mode: 'native' } }), request = e.request();
  request.chat_completion_source = 'makersuite'; await e.api.beforeSend(request);
  equal(request.enable_web_search, true); equal(request._kami_native_search, true); equal(e.rawCalls.length, 0, '原生模式不额外调用搜索模型');
  await assert.rejects(e.api.search('资料')); count++;
  const quiet = e.request('quiet'); await e.api.beforeSend(quiet); equal(quiet.enable_web_search, undefined, '不影响其他后台请求');
  e.api.configure({ enabled: false }); const off = e.request(); await e.api.beforeSend(off); equal(off.enable_web_search, false);
  e.api.shutdown();
}
{
  const e = make({ config: { provider: 'unknown-free-service' } });
  equal(e.api.status().enabled, false, '未知供应商不会自动启用其他可能收费的服务');
  await assert.rejects(e.api.search('资料'), /请先开启/); count++; equal(e.requests.length, 0); e.api.shutdown();
}
for (const provider of ['serpapi', 'zai', 'koboldcpp', 'wikipedia', 'bing']) {
  const row = { title: '设定资料', url: 'https://example.org/world', content: '浅色石材的建筑。' };
  const payload = provider === 'serpapi' ? { organic_results: [{ ...row, link: row.url, snippet: row.content }] } : provider === 'zai' ? { search_result: [{ ...row, link: row.url }] } : provider === 'koboldcpp' ? [row] : provider === 'bing' ? { results: [{ ...row, engines: ['bing'] }] } : { batchcomplete: true, query: { pages: [{ title: row.title, fullurl: row.url, extract: row.content }] } };
  const e = make({ config: { provider, wikiLanguage: 'ja', endpoints: { koboldcpp: 'http://localhost:5001', searxng: 'http://localhost:8080' } }, fetch: async () => ({ ok: true, json: async () => payload, text: async () => JSON.stringify(payload) }) });
  const record = await e.api.search('城镇');
  equal(e.api.status().provider, provider, '读取已保存供应商'); equal(record.facts.length, 1); equal(e.creates.length, 1);
  equal(e.rawCalls[1].request.ordered_prompts.find(item => item.role === 'user').content.includes(row.content), true, '供应商资料进入同一提取流程');
  if (provider === 'wikipedia') {
    equal(e.requests[0].init.credentials, 'omit'); equal(e.requests[0].init.headers['X-CSRF-Token'], undefined, '外站请求不携带酒馆校验码');
    equal(e.requests[0].init.headers['Api-User-Agent'].includes('KamiPreset'), true);
    equal(new URL(e.requests[0].path).hostname, 'ja.wikipedia.org');
    equal(e.rawCalls[0].request.ordered_prompts.at(-1).content.includes('日文维基百科'), true);
  } else { equal(e.requests[0].path, '/api/search/' + (provider === 'bing' ? 'searxng' : provider)); }
  if (provider === 'bing') { equal(e.requests[0].body.query, '!bing 城镇的建筑风格'); }
  e.api.configure({ system: '保留其他设置' }); equal(e.vars()['kami-web-search'].provider, provider);
  e.api.shutdown();
}
{
  const e = make({ config: { provider: 'searxng' } });
  await assert.rejects(e.api.search('资料'), /请先填写/); count++; equal(e.rawCalls.length, 0, '缺实例地址时不消耗搜索模型调用');
  e.api.configure({ endpoints: { searxng: 'http://localhost:8080' } });
  e.api.configure({ provider: 'koboldcpp', endpoints: { koboldcpp: 'http://localhost:5001' } });
  equal(e.vars()['kami-web-search'].endpoints, { searxng: 'http://localhost:8080', koboldcpp: 'http://localhost:5001' }, '两种地址分别保存');
  assert.throws(() => e.api.configure({ endpoints: { searxng: 'https://user:key@example.org' } })); count++;
  equal(e.vars()['kami-web-search'].endpoints.searxng, 'http://localhost:8080', '错误地址不覆盖旧配置'); e.api.shutdown();
}
{
  const gate = deferred(), e = make({ config: { provider: 'wikipedia' }, fetch: () => gate.promise });
  const task = e.api.search('资料'); await tick(); e.switchChat(); await e.emit(events.CHAT_CHANGED);
  await assert.rejects(task, error => error.searchCancelled); count++;
  gate.resolve({ ok: true, json: async () => ({ batchcomplete: true }) }); await tick();
  equal(e.creates.length, 0, '百科请求迟到也不能写进新聊天'); equal(e.rawCalls.length, 1); e.api.shutdown();
}
{
  const e = make({ config: { provider: undefined, enabled: false, mode: undefined } });
  equal(e.api.status().provider, 'firecrawl-keyless', '无已存选择时默认免key'); equal(e.api.status().enabled, false); equal(e.api.status().mode, 'native', '默认供应商不自动开启搜索或改变模式');
  equal(e.requests.length, 0); e.api.configure({ system: '保留搜索任务' }); equal(e.vars()['kami-web-search'].provider, 'firecrawl-keyless'); e.api.shutdown();
}
for (const manual of [true, false]) {
  const e = make({ denyStorage: true, config: { provider: undefined }, fetch: async () => Response.json({ success: true, data: { web: [{ title: '资料', url: 'https://example.org/world', description: '浅色石材的建筑。' }] } }) });
  if (manual) { const record = await e.api.search('城镇'); equal(record.facts.length, 1); equal(e.creates.length, 1, '免key手动只新增一个资料楼层'); }
  else { const request = e.request(); await e.api.beforeSend(request); equal(e.creates.length, 0, '免key自动不新增中间楼层'); const id = e.reply('<out_body>剧情</out_body>'); await e.emit(events.MESSAGE_RECEIVED, id); equal(readWebSearchRecords(e.context().chat[id].mes).length, 1); equal((e.context().chat[id].mes.match(/<out_body>/g) || []).length, 1); }
  equal(e.requests.length, 1, '免key不读取账号或酒馆密钥'); equal(e.requests[0].path, 'https://api.firecrawl.dev/v2/search');
  equal(e.requests[0].init.credentials, 'omit'); equal(e.requests[0].init.mode, 'cors'); equal(e.requests[0].init.redirect, 'error'); equal(e.requests[0].init.referrerPolicy, 'no-referrer');
  equal(e.requests[0].init.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
  equal(e.rawCalls.length, 2); equal(e.api.status().provider, 'firecrawl-keyless'); e.api.shutdown();
}
for (const [status, pattern] of [[401, /拒绝访问/], [403, /拒绝访问/], [402, /暂不可用.*HTTP 402/], [429, /当前IP.*限流/], [500, /HTTP 500/]]) {
  const e = make({ config: { provider: 'firecrawl-keyless' }, fetch: async () => new Response('不读取错误详情', { status }) });
  await assert.rejects(e.api.search('资料'), pattern); count++; equal(e.requests.length, 1, '免key失败不重试或切到带Key来源'); equal(e.rawCalls.length, 1); equal(e.creates.length, 0); equal(e.api.status().provider, 'firecrawl-keyless'); e.api.shutdown();
}
{
  const gate = deferred(), e = make({ config: { provider: 'firecrawl-keyless' }, fetch: () => gate.promise });
  const task = e.api.search('资料'); await tick(); e.api.cancel(); await assert.rejects(task, error => error.searchCancelled); count++;
  equal(e.requests[0].init.signal.aborted, true); gate.resolve(Response.json({ success: true, data: { web: [] } })); await tick(); equal(e.creates.length, 0); equal(e.rawCalls.length, 1); e.api.shutdown();
}
for (const provider of providerModule.webSearchProviders().filter(p => p.localKey)) {
  const row = { title: '资料', url: 'https://example.org', content: '石材建筑' };
  const payload = provider.id === 'firecrawl' ? { success: true, data: { web: [{ ...row, description: row.content }] } } : provider.id === 'serping' ? { organic: [{ ...row, link: row.url, snippet: row.content }] } : provider.id === 'exa' ? { results: [{ ...row, highlights: [row.content] }] } : provider.id === 'deepseek' ? { results: [{ ...row, summary: row.content }] } : { results: [row] };
  const e = make({ config: { provider: provider.id }, storage: { ['kami-web-search-keys-v1:A:' + provider.id]: 'TEST_KEY' }, fetch: async () => Response.json(payload) });
  const record = await e.api.search('城镇');
  equal(record.facts.length, 1); equal(e.creates.length, 1, provider.id + '仍只有一个资料楼层');
  equal(e.requests[0].path, '/api/users/me', '按当前酒馆用户隔离本机密钥');
  equal(e.requests[1].init.credentials, 'omit'); equal(e.requests[1].init.mode, 'cors'); equal(e.requests[1].init.redirect, 'error');
  equal(e.requests[1].init.headers['X-CSRF-Token'], undefined, '外站没有酒馆校验码');
  equal(e.requests.some(row => /plugins|secrets/.test(row.path)), false, '直连不依赖插件或服务端密钥暴露');
  equal(JSON.stringify(e.vars()).includes('TEST_KEY'), false); equal(JSON.stringify(e.creates).includes('TEST_KEY'), false);
  equal(e.rawCalls.some(call => JSON.stringify(call).includes('TEST_KEY')), false, 'Key不进搜索模型上下文');
  if (provider.id === 'deepseek') equal(e.rawCalls[0].request.ordered_prompts.at(-1).content.includes('128'), true);
  e.api.shutdown();
}
for (const options of [{}, { denyStorage: true }, { storage: { 'kami-web-search-keys-v1:Other:exa': 'OTHER_USER_KEY' } }, { userFetch: async () => ({ ok: false }) }]) {
  const e = make({ ...options, config: { provider: 'exa' } });
  await assert.rejects(e.api.search('城镇')); count++;
  equal(e.rawCalls.length, 0, '密钥或用户未就绪不消耗模型调用'); equal(e.creates.length, 0); equal(e.api.status().running, false); e.api.shutdown();
}
{
  const gate = deferred(), e = make({ config: { provider: 'exa' }, userFetch: () => gate.promise, storage: { 'kami-web-search-keys-v1:A:exa': 'TEST_KEY' } });
  const task = e.api.search('资料'); await tick(); e.api.cancel(); await assert.rejects(task, error => error.searchCancelled); count++;
  gate.resolve({ ok: true, json: async () => ({ handle: 'A' }) }); await tick();
  equal(e.rawCalls.length, 0, '用户信息迟到不能继续调用模型'); equal(e.creates.length, 0); e.api.shutdown();
}
for (const [status, pattern] of [[401, /密钥无效/], [403, /访问权限/], [402, /额度/], [429, /限流/], [500, /HTTP 500/]]) {
  let readErrorBody = false;
  const e = make({ config: { provider: 'exa' }, storage: { 'kami-web-search-keys-v1:A:exa': 'TEST_KEY' }, fetch: async () => ({ ok: false, status, json() { readErrorBody = true; return { error: 'PRIVATE_DETAILS' }; } }) });
  await assert.rejects(e.api.search('城镇'), pattern); count++; equal(readErrorBody, false); equal(e.creates.length, 0); e.api.shutdown();
}
for (const response of [new Response('<html>challenge</html>'), new Response('字'.repeat(1024 * 1024)), new Response('{}', { headers: { 'Content-Length': '3000000' } })]) {
  const e = make({ config: { provider: 'exa' }, storage: { 'kami-web-search-keys-v1:A:exa': 'TEST_KEY' }, fetch: async () => response });
  /* 2026-10-21：解析失败改成「返回的是网页而不是数据…完整返回已打到控制台日志」，断言跟着放宽 */
  await assert.rejects(e.api.search('资料'), /网页而不是数据|格式异常|响应过大/); count++; equal(e.creates.length, 0); equal(e.rawCalls.length, 1, '无效结果不继续提取或写楼'); e.api.shutdown();
}
{
  const e = make({ config: { provider: 'anysearch' } }); equal(e.api.status().enabled, false, '移除渠道的旧配置不会自动换成付费来源'); await assert.rejects(e.api.search('资料')); count++; equal(e.requests.length, 0); e.api.shutdown();
}
{
  const e = make({ config: { connection: 'profile:旧搜索连接', system: '自动头部任务专用' } });
  equal(e.api.manualSettings().llm.sumModel.tavernPick, '旧搜索连接', '迁移旧连接到手动设置');
  const settings = e.api.manualSettings(); settings.llm.prompts.head = [{role:'system',content:'手动头部'}]; settings.llm.prompts.task='手动任务正文';settings.llm.prompts.tail=[{role:'assistant',content:'手动尾部'}];e.api.saveManual();
  const progress=[];const off=e.api.subscribeProgress(p=>progress.push(p));await e.api.search('详细主题');off();
  equal(e.rawCalls[0].connection, 'profile:旧搜索连接');
  const all=JSON.stringify(e.rawCalls[0].request.ordered_prompts);
  equal(all.includes('手动头部')&&all.includes('手动任务正文')&&all.includes('手动尾部'), true);
  equal(all.includes('自动头部任务专用'), false, '手动助手不混入自动头部任务');
  equal(e.rawCalls[0].request.ordered_prompts.at(-1).role,'system','用户尾部之后仍保留阶段格式约束');
  equal(progress.filter(p=>p.phase==='search').length,1);equal(progress.at(-1).phase,'done');equal(progress.at(-1).running,false);e.api.shutdown();
  const automatic=make({config:{connection:'profile:不应影响自动',system:'自动头部专用'}});await automatic.api.beforeSend(automatic.request());
  equal(automatic.rawCalls.every(call=>call.connection===''),true,'自动搜索始终跟随剧情连接');equal(JSON.stringify(automatic.rawCalls[0].request).includes('自动头部专用'),true);automatic.api.shutdown();
}
{
  const e=make({ raw: async(_request,index)=>JSON.stringify(index===0?{...plan,queries:['q1','q2','q3','q4','q5']}:{facts:Array.from({length:25},(_,i)=>({text:'详细事实'+i+'：可靠来源中的背景、适用条件及具体描述。',source_ids:['s'+(i%8+1)]}))}),fetch:async(_path,init)=>({ok:true,json:async()=>({results:Array.from({length:5},(_,i)=>({title:'资料',url:'https://example.org/'+JSON.parse(init.body).query+'/'+i,content:'主题背景事实'}))})}) });
  const record=await e.api.search('多角度详细资料');equal(e.requests.length,4);equal(record.sources.length,8);equal(record.facts.length,20);equal(readWebSearchRecords(e.context().chat.at(-1).mes)[0].facts.length,20,'详细资料写入与前端共享读取不截成8条');e.api.shutdown();
}
{
  const gate=deferred(),e=make({raw:async(_request,index)=>index===0?gate.promise:JSON.stringify(evidence)}),task=e.api.beforeSend(e.request());await tick();
  e.api.manualSettings().llm.prompts.task='只修改手动设置';e.api.saveManual();gate.resolve(JSON.stringify(plan));await task;
  equal(e.requests.length,1,'编辑手动设置不会取消运行中的自动搜索');equal(e.rawCalls.length,2);e.api.shutdown();
}
{
  equal(pure.normalizeWebSearchLimits(),{maxQueries:2,maxSources:3,maxFacts:8,maxTokens:1200});
  equal(pure.normalizeWebSearchLimits(null,true),{maxQueries:4,maxSources:8,maxFacts:20,maxTokens:4000});
  equal(pure.normalizeWebSearchLimits({maxQueries:'3.8',maxSources:999,maxFacts:0,maxTokens:'invalid'}),{maxQueries:3,maxSources:20,maxFacts:1,maxTokens:1200});
  equal(pure.normalizeWebSearchLimits({maxQueries:null,maxSources:'',maxFacts:true,maxTokens:Infinity},true),pure.normalizeWebSearchLimits(null,true),'无效数值不变成意外的零预算');
  const sources=Array.from({length:20},(_,i)=>({id:'s'+(i+1),url:'https://example.org/'+i}));
  const value={world:'多资料世界',facts:Array.from({length:60},(_,i)=>({text:'详细事实'+i,source_ids:[sources[i%20].id]}))};
  const record=normalizeWebSearchRecord(value,sources,[],{manual:true,maxFacts:60,maxSources:20});
  const back=readWebSearchRecords(webSearchTag(record))[0];equal(back.facts.length,60);equal(back.sources.length,20,'提高限额后持久化和读取不能暗中截回旧上限');
  const note={...record,facts:[{text:'字'.repeat(1000),note:'仅'+('限'.repeat(239)),source_ids:['s1']}]};
  equal(readWebSearchRecords(webSearchTag(note))[0].facts.length,1,'长事实附带必要限制仍能读回');
}
{
  const e=make({raw:async(request,index)=>{
    if(index%2===0)return JSON.stringify({...plan,queries:Array.from({length:12},(_,i)=>'查询'+i)});
    const material=JSON.parse(request.ordered_prompts.find(p=>p.role==='user').content);
    return JSON.stringify({facts:Array.from({length:40},(_,i)=>({text:'新增事实'+index+'-'+i,source_ids:[material.sources[i%material.sources.length].id]}))});
  },fetch:async(_path,init)=>({ok:true,json:async()=>({results:Array.from({length:20},(_,i)=>({url:'https://example.org/'+encodeURIComponent(JSON.parse(init.body).query)+'/'+i,content:'资料'}))})})});
  e.api.configureLimits(true,{maxQueries:3,maxSources:12,maxFacts:25,maxTokens:14000});
  e.api.configureLimits(false,{maxQueries:1,maxSources:2,maxFacts:3,maxTokens:1100});
  const record=await e.api.search('扩大详细资料');equal(e.requests.length,3);equal(record.sources.length,12);equal(record.facts.length,25);
  equal(readWebSearchRecords(e.context().chat.at(-1).mes)[0].facts.length,25);
  equal(e.rawCalls[0].request.ordered_prompts.at(-1).content.includes('最多3个查询'),true);
  equal(e.rawCalls[1].request.ordered_prompts.at(-1).content.includes('最多25条'),true);
  equal(e.rawCalls[1].request.ordered_prompts.at(-1).content.includes('14000 token'),true);
  const request=e.request();await e.api.beforeSend(request);equal(e.requests.length,4,'自动只执行其自身一个查询');
  const block=readWebSearchRecords(request.messages.at(-2).content)[0];equal(block.facts.length,3);equal(block.sources.length,2);
  const id=e.reply('<out_body>剧情</out_body>');await e.emit(events.MESSAGE_RECEIVED,id);await e.emit(events.GENERATION_ENDED);
  e.api.configureLimits(false,{maxFacts:1});await e.api.beforeSend(e.request());equal(e.requests.length,5,'修改自动限额使旧缓存失效');
  equal(e.api.limits(true),{maxQueries:3,maxSources:12,maxFacts:25,maxTokens:14000},'修改自动限额不改手动限额');
  const saved=e.vars()['kami-web-search'];e.api.shutdown();const loaded=make({config:saved});equal(loaded.api.limits(false),{maxQueries:1,maxSources:2,maxFacts:1,maxTokens:1100});equal(loaded.api.limits(true),saved.manual.limits);loaded.api.shutdown();
}
{
  const e=make({config:{manual:{limits:{maxTokens:100}}},raw:async(_request,index)=>JSON.stringify(index===0?plan:{facts:Array.from({length:5},(_,i)=>({text:'资料'+i+'字'.repeat(400),source_ids:['s1']}))})});
  const record=await e.api.search('小预算');equal(record.status,'budget_exceeded');equal(Math.ceil(webSearchTag(record).length/3)<=100,true);e.api.shutdown();
}
{
  const gate=deferred(),e=make({raw:()=>gate.promise}),running=e.api.search('查询');await tick();
  e.api.configureLimits(false,{maxQueries:1});equal(e.stopped.length,0,'自动限额调整不打断手动搜索');
  e.api.configureLimits(true,{maxQueries:2});await assert.rejects(running,error=>error.searchCancelled);count++;gate.resolve(JSON.stringify(plan));await tick();equal(e.creates.length,0);e.api.shutdown();
}
{
  const definition=JSON.parse(fs.readFileSync(new URL('../../src/preset.base.json',import.meta.url))).prompts.find(p=>p.identifier==='kami_web_search_task');
  const e=make({config:{mode:'native',limits:{maxQueries:2,maxSources:2,maxFacts:2,maxTokens:300}},taskDefinition:definition}),request=e.request();request.chat_completion_source='makersuite';
  request.messages.push({role:'system',content:definition.content.replace(/\{\{\/\/[\s\S]*?\}\}/g,'')});
  await e.api.beforeSend(request);equal(request.messages.at(-1).content.includes('<web_search_task>'),false,'注释宏展开后不重复注入整份任务');equal(request.messages.at(-1).content.includes('2条资料'),true);
  const big={world:'当前世界',sources:Array.from({length:5},(_,i)=>({id:'s'+(i+1),url:'https://example.org/'+i})),facts:Array.from({length:12},(_,i)=>({text:'原生事实'+i,source_ids:['s'+(i%5+1)]}))};
  const id=e.reply('<out_body><introduction>'+webSearchTag({...big,origin:'native'})+'</introduction>剧情</out_body>');
  await Promise.all([e.emit(events.MESSAGE_RECEIVED,id),e.emit(events.GENERATION_ENDED)]);
  equal(e.writes.length,1,'原生资料的两个结束事件只保存一次');const record=readWebSearchRecords(e.context().chat[id].mes)[0];equal(record.facts.length,2);equal(record.sources.length,2);equal(record.origin,'native');equal(Math.ceil(webSearchTag(record).length/3)<=300,true);
  e.api.shutdown();
}
{
  const gate=deferred(),e=make({config:{mode:'native'},count:()=>gate.promise}),request=e.request();request.chat_completion_source='makersuite';await e.api.beforeSend(request);
  const id=e.reply(webSearchTag({...sample,origin:'native'})),committing=e.emit(events.MESSAGE_RECEIVED,id);await tick();e.switchChat();await e.emit(events.CHAT_CHANGED);gate.resolve(10);await committing;equal(e.writes.length,0,'原生资料计数期间切聊天不能迟到写入');e.api.shutdown();
}
for(const stop of ['GENERATION_STOPPED','CHAT_CHANGED']){
  const gate=deferred(),e=make({config:{mode:'native'},count:()=>gate.promise}),request=e.request();request.chat_completion_source='makersuite';await e.api.beforeSend(request);
  const id=e.reply('剧情'+webSearchTag({...sample,origin:'native'})),committing=e.emit(events.MESSAGE_RECEIVED,id);await tick();if(stop==='CHAT_CHANGED')e.switchChat();await e.emit(events[stop]);
  const cleanupWrites=e.writes.length;gate.resolve(10);await committing;equal(e.writes.length,cleanupWrites,'原生异步计数迟到不再追加写入：'+stop);
  if(stop==='GENERATION_STOPPED'){equal(readWebSearchRecords(e.context().chat[id].mes).length,0,'停止时立即清理尚未核验的原生块');equal(e.context().chat[id].mes,'剧情');}else equal(e.writes.length,0,'切聊天不写新聊天');e.api.shutdown();
}
{
  const e=make({config:{mode:'native',limits:{maxFacts:1,maxSources:1,maxTokens:100}},count:async()=>{throw Error('计数不可用');}}),request=e.request();request.chat_completion_source='makersuite';await e.api.beforeSend(request);
  const id=e.reply('<out_body>剧情'+webSearchTag({...sample,origin:'native',facts:[sample.facts[0],{...sample.facts[0],text:'额外事实'}]})+'</out_body>');
  await Promise.all([e.emit(events.MESSAGE_RECEIVED,id),e.emit(events.GENERATION_ENDED)]);equal(readWebSearchRecords(e.context().chat[id].mes).length,0,'原生计数失败不保留未经核验的新资料块');equal(e.context().chat[id].mes.includes('剧情'),true);e.api.shutdown();
}
{
  const guide=pure.webSearchTaskGuide(),defaults=pure.normalizeWebSearchManualSettings();equal(defaults.llm.prompts.task.includes(guide),true,'手动默认提示词含共用任务分类与字段');
  const task=JSON.parse(fs.readFileSync(new URL('../../src/preset.base.json',import.meta.url))).prompts.find(p=>p.identifier==='kami_web_search_task');equal(task.content.includes(guide),true,'头部条目与手动助手使用同一分类定义');
  const e=make({config:{manual:{llm:{prompts:{task:'用户以前保存的手动提示词'}}}},raw:async(_request,index)=>JSON.stringify(index===0?{...plan,task_type:'细节补充',target:'人物甲',focus:['外貌·发色']}:evidence)});
  await e.api.search('只补充发色');equal(e.rawCalls.every(call=>call.request.ordered_prompts.some(row=>row.content?.includes('<search_task_types>'))),true,'已保存的旧手动模板也会收到分类规则');
  const material=JSON.parse(e.rawCalls[1].request.ordered_prompts.find(p=>p.role==='user').content);equal(material.task_type,'细节补充');equal(material.target,'人物甲');equal(material.focus,['外貌·发色']);equal(e.rawCalls[1].request.ordered_prompts.at(-1).content.includes('不展开整份人物'),true);e.api.shutdown();
}
{
  const e=make({config:{manual:{limits:{maxQueries:10,maxSources:1}}},raw:async(_request,index)=>JSON.stringify(index===0?{...plan,queries:['一','二','三']}:evidence)});
  await e.api.search('只取一个来源');equal(e.requests.length,1,'来源已达到上限后不继续花费后续查询');e.api.shutdown();
}
{
  let state={enabled:true,content:'原任务'},writes=0;
  const task={read:()=>({...state}),write:patch=>(state={...state,...patch}),ensure:()=>state},e=make({task});
  await e.api.beforeSend(e.request());const id=e.reply('<out_body>剧情</out_body>');await e.emit(events.MESSAGE_RECEIVED,id);await e.emit(events.GENERATION_ENDED);equal(e.rawCalls.length,2);
  state.content='用户从条目修改检索范围';e.api.syncTask();await e.api.beforeSend(e.request('regenerate'));equal(e.rawCalls.length,4,'从条目编辑任务后不再复用旧检索缓存');e.api.shutdown();
}
{
  const e=make({config:{mode:'native'},write:()=>{throw Error('写回失败');}}),request=e.request();request.chat_completion_source='makersuite';await e.api.beforeSend(request);e.reply(webSearchTag({...sample,origin:'native'}));
  await e.emit(events.GENERATION_STOPPED);equal(e.api.status().message.includes('清理未完成的原生资料失败'),true,'同步写回失败也给出状态，不抛出未处理错误');e.api.shutdown();
}
{
  const gate=deferred(),e=make({config:{mode:'native'},count:()=>gate.promise});
  const id=e.reply('<out_body><introduction>'+webSearchTag({...sample,origin:'native'})+'</introduction>旧剧情</out_body>'),request=e.request('continue');request.chat_completion_source='makersuite';await e.api.beforeSend(request);
  e.context().chat[id].mes+='新剧情'+webSearchTag({...sample,origin:'native',facts:[{...sample.facts[0],text:'本轮未核验的新事实'}]});
  const committing=e.emit(events.MESSAGE_RECEIVED,id);await tick();e.api.shutdown();
  let records=readWebSearchRecords(e.context().chat[id].mes);equal(records.length,1,'脚本关闭立即清理未核验原生块，保留之前的增量');equal(records[0].facts[0].text.includes('本轮未核验'),false);equal(e.context().chat[id].mes.includes('新剧情'),true);const cleanupWrites=e.writes.length;gate.resolve(10);await committing;equal(e.writes.length,cleanupWrites,'脚本关闭后token计数迟到不再写入');
}
{
  /* 2026-10-21 用户要求：响应不是 JSON 时，把**完整返回原文**打到日志（酒馆助手控制台）。
     顺便钉住两件事：用户看的提示不能出现浏览器的原始 SyntaxError；日志里要有完整正文。 */
  const HTML = '<!DOCTYPE html>' + String.fromCharCode(10) + '<html><head><title>请先登录</title></head><body>代理登录页 SENTINEL_HTML_BODY</body></html>';
  const response = () => ({
    ok: true, status: 200, statusText: 'OK', url: 'https://example.org/api/search/tavily',
    headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null), forEach() { } },
    text: async () => HTML,
  });
  const logs = [];
  const origin = console.error;
  console.error = (...args) => { logs.push(args.map((v) => String(v)).join(' ')); };
  let error = null;
  try {
    const e = make({ config: { provider: 'tavily' }, fetch: async () => response() });
    try { await e.api.search('资料'); } catch (err) { error = err; }
    e.api.shutdown();
  } finally { console.error = origin; }
  equal(!!error, true, '返回网页时搜索会失败');
  equal(/完整返回已打到控制台日志/.test(String(error && error.message)), true, '提示告诉用户去看日志');
  equal(/Unexpected token|is not valid JSON/.test(String(error && error.message)), false, '提示里不再漏浏览器原始解析错误');
  equal(logs.length > 0, true, '确实打了日志');
  const all = logs.join(String.fromCharCode(10));
  equal(all.includes('SENTINEL_HTML_BODY'), true, '日志里有完整返回正文');
  equal(all.includes('<!DOCTYPE html>'), true, '日志保留了返回原文的开头');
  equal(all.includes('text/html'), true, '日志里有内容类型');
  equal(all.includes('https://example.org/api/search/tavily'), true, '日志里有请求地址');
  equal(all.includes('tavily') || all.includes('Tavily'), true, '日志里有搜索来源');
  equal(/这张网页|网页.*而不是数据/.test(all), true, '日志给出了「这是网页」的判断');
}
console.log('网络搜索结构、单楼生成与取消：' + count + ' 项通过');
