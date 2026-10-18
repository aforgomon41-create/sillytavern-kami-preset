import assert from 'node:assert/strict';
import fs from 'node:fs';
let count = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); count++; };
const ui = fs.readFileSync(new URL('../../src/scripts/_compress-ui.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const make = (tag, className, text) => ({ tag, className, textContent: text, children: [], setAttribute(key, value) { this[key] = value; }, appendChild(child) { this.children.push(child); } });
const select = new Function('HDOC', 'mk', ui + '\nreturn selectRow;')({ createElement: make }, make);
for (const choices of [[['tavily', 'Tavily'], ['serper', 'Serper']], [{ value: 'tavily', label: 'Tavily' }, { value: 'serper', label: 'Serper' }]]) {
  const parent = make('div'); const result = select(parent, '服务', choices, 'serper', { 'data-search-provider': '1' });
  eq(result.children.map(option => [option.value, option.textContent, !!option.selected]), [['tavily', 'Tavily', false], ['serper', 'Serper', true]], '共用下拉框兼容压缩与搜索两种参数');
  eq(result['data-search-provider'], '1');
}
const connections = select(make('div'), '连接', [{ value: '', label: '当前连接' }, { value: 'profile:A', label: '酒馆：A' }, { value: 'config:B', label: '自定义：B' }], 'config:B');
eq(connections.children.map(option => option.value), ['', 'profile:A', 'config:B']);
eq(connections.children[2].selected, true);

const code = fs.readFileSync(new URL('../../src/scripts/60-工具箱.js', import.meta.url), 'utf8');
const start = code.indexOf('  var profileQueue = Promise.resolve();');
const end = code.indexOf('  /* 从接口拉模型列表', start);
assert.ok(start > 0 && end > start);
const settings = { chat_completion_source: 'original', model: 'original' };
const withProfile = new Function('stCtx', 'settingsOf', 'findTavernProfile', 'toast', 'COPY', 'log', code.slice(start, end) + '\nreturn withTavernProfile;')(
  () => ({}), () => settings, name => name ? ({ name, api: name, model: name + '-model' }) : null, () => {}, {}, () => {});
let release;
const gate = new Promise(resolve => { release = resolve; });
const seen = [];
const first = withProfile('A', async () => { seen.push(settings.chat_completion_source); await gate; eq(settings.model, 'A-model'); });
await Promise.resolve();
const second = withProfile('B', async () => { seen.push(settings.chat_completion_source); eq(settings.model, 'B-model'); });
const current = withProfile('', async () => { seen.push(settings.chat_completion_source); });
await Promise.resolve();
eq(seen, ['A'], '连接切换串行，第二个任务不能覆盖第一个');
release(); await Promise.all([first, second, current]);
eq(seen, ['A', 'B', 'original'], '跟随当前连接的请求也要等待临时配置还原'); eq(settings.chat_completion_source, 'original'); eq(settings.model, 'original', '两个任务结束后恢复原连接');
await assert.rejects(withProfile('C', async () => { throw Error('失败'); })); count++;
eq(settings.model, 'original', '异常也还原连接');
await withProfile('D', async () => { settings.model = 'user-changed'; });
eq(settings.model, 'user-changed', '不覆盖用户任务期间手动修改的值');
eq(await withProfile('', async () => 'current-response'), 'current-response', '当前连接的模型响应穿过队列返回');

for (const [source, field] of [['custom', 'custom_model'], ['deepseek', 'deepseek_model'], ['makersuite', 'google_model'], ['claude', 'claude_model'], ['vertexai', 'vertexai_model']]) {
  settings[field] = 'original-model';
  await withProfile(source, async () => { eq(settings[field], source + '-model', '更新酒馆实际读取的来源模型字段'); });
  eq(settings[field], 'original-model', '来源模型字段调用后还原');
  await assert.rejects(withProfile(source, async () => { throw Error('接口失败'); })); count++;
  eq(settings[field], 'original-model', '接口失败仍还原来源模型');
}
eq(await withProfile('E', async () => 'profile-response'), 'profile-response', '配置连接的模型响应穿过队列返回');
const entry = code.slice(code.indexOf('  async function runPipeline(trigger) {'), code.indexOf('    var stamp = chatStamp();', code.indexOf('  async function runPipeline(trigger) {')));
const warnings = [];
const blocked = new Function('disposed', 'pipeline', 'SEARCH', 'toast', 'COPY', 'chatLen', 'cfg', entry + "return 'started'; } return runPipeline;")(
  false, { running: false }, { status: () => ({ running: true }) }, (_kind, text) => warnings.push(text), {}, () => 20, { grandOn: true });
eq(await blocked('manual'), undefined, '手动大总结入口拦住活动搜索');
eq(await blocked('auto'), undefined, '自动大总结入口拦住活动搜索');
eq(warnings.length, 2);
console.log('工具箱共用控件与连接恢复：' + count + ' 项通过');
