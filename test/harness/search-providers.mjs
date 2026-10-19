import assert from 'node:assert/strict';
import { webSearchProviders, webSearchProvider, webSearchEndpoint, webSearchRequest, webSearchRows } from '../../src/scripts/_search-providers.js';
let count = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); count++; };
const list = webSearchProviders();
eq(list.length, 14); eq(new Set(list.map(row => row.id)).size, 14);
eq(list.map(row => row.label), ['Firecrawl (免key)', 'Tavily', 'SerpApi', 'Bing', '维基百科 (免key)', 'SearXNG', 'KoboldCpp', 'Serper', 'Z.AI', 'DeepSeek', 'TinyFish', 'Exa', 'Firecrawl', 'Serping'], '服务选项显示供应商名称，两个开箱即用来源标注免key');
eq(list.filter(row => !row.secret && !row.localKey).map(row => row.id), ['firecrawl-keyless', 'bing', 'wikipedia', 'searxng', 'koboldcpp'], '五类来源不需要服务密钥');
eq(webSearchProvider('anysearch'), null, '移除需要额外转发的渠道');
eq(list.some(row => row.bridge), false, '没有额外插件渠道');
eq(webSearchProvider('unknown'), null);
for (const row of list) { eq(row.url.startsWith('https://'), true); eq(Boolean(row.label && row.note), true); }
for (const row of list.filter(p => p.secret || p.localKey)) { eq(new URL(row.keyUrl).protocol, 'https:', row.id + '有官方Key获取入口'); }
for (const row of list.filter(p => p.localKey)) {
  const spec = webSearchRequest(row.id, '城镇 & ? #', {}, 'TEST_KEY');
  eq(spec.direct, true); eq(new URL(spec.path).protocol, 'https:');
  eq(spec.path.includes('TEST_KEY'), false, '密钥不放进URL');
  eq(spec.headers.Authorization || spec.headers['X-API-Key'] || spec.headers['x-api-key'], row.id === 'deepseek' || row.id === 'firecrawl' ? 'Bearer TEST_KEY' : 'TEST_KEY');
  assert.throws(() => webSearchRequest(row.id, '城镇', {}, '')); count++;
  assert.throws(() => webSearchRequest(row.id, '城镇', {}, 'key\nforged: header')); count++;
}
assert.throws(() => webSearchRequest('anysearch', '查询', {}, 'key')); count++;
assert.throws(() => webSearchRequest('deepseek', '字'.repeat(129), {}, 'key')); count++;
eq(webSearchRequest('deepseek', '🐟'.repeat(128), {}, 'key').body.count, 3, 'Unicode按字符计算');
eq(webSearchRequest('deepseek', '城镇', {}, 'key').body.need_content, false);
const tiny = webSearchRequest('tinyfish', '中土 & ? #', {}, 'key');
eq(tiny.method, 'GET'); eq(new URL(tiny.path).pathname, '/'); eq(new URL(tiny.path).searchParams.get('query'), '中土 & ? #');
eq(webSearchRequest('firecrawl', '城镇', {}, 'key').body, { query: '城镇', limit: 3, sources: ['web'] });
eq(webSearchRequest('exa', '城镇', {}, 'key').body.contents, { highlights: true });
const keyless = webSearchRequest('firecrawl-keyless', '城镇', {}, 'IGNORED_SAVED_KEY');
eq(keyless.path, 'https://api.firecrawl.dev/v2/search'); eq(keyless.method, 'POST'); eq(keyless.direct, true);
eq(keyless.headers, { Accept: 'application/json', 'Content-Type': 'application/json' }, '免key请求不含认证头');
eq(keyless.body, webSearchRequest('firecrawl', '城镇', {}, 'key').body, '两种Firecrawl共用低开销网页搜索协议');
eq(keyless.body.scrapeOptions, undefined, '不默认额外抓取整页');
eq(JSON.stringify(keyless).includes('IGNORED_SAVED_KEY'), false);
eq(webSearchProvider('firecrawl-keyless').keyUrl, undefined); eq(webSearchProvider('firecrawl-keyless').localKey, undefined);
eq(webSearchRequest('firecrawl-keyless', '城镇').body.query, '城镇');
assert.throws(() => webSearchRequest('firecrawl-keyless', '字'.repeat(501)), /搜索查询过长/); count++;
eq(webSearchEndpoint('http://localhost:8080/', 'searxng'), 'http://localhost:8080');
eq(webSearchEndpoint('http://localhost:5001/v1/', 'koboldcpp'), 'http://localhost:5001/v1');
for (const address of ['javascript:alert(1)', 'https://user:key@example.org', 'https://example.org/?key=private', 'https://example.org/#token', 'invalid', 'file:///test']) {
  assert.throws(() => webSearchEndpoint(address, 'koboldcpp')); count++;
}
assert.throws(() => webSearchEndpoint('https://example.org/search', 'searxng'), /根地址/); count++;
assert.throws(() => webSearchRequest('unknown', 'test', {})); count++;
assert.throws(() => webSearchRequest('koboldcpp', 'test', {}), /请先填写/); count++;
const settings = { endpoints: { searxng: 'http://localhost:8080', koboldcpp: 'http://localhost:5001' }, wikiLanguage: 'en' };
for (const provider of ['tavily', 'serper', 'serpapi', 'zai', 'searxng', 'koboldcpp']) {
  const request = webSearchRequest(provider, 'world', settings);
  eq(request.path, '/api/search/' + provider); eq(request.body.query, 'world');
}
eq(webSearchRequest('searxng', 'world', settings).response, 'text');
eq(webSearchRequest('searxng', 'world', settings).body.baseUrl, settings.endpoints.searxng);
eq(webSearchRequest('koboldcpp', 'world', settings).body.url, settings.endpoints.koboldcpp);
const bing = webSearchRequest('bing', '中土世界 !google !!wp !!', settings);
eq(bing.path, '/api/search/searxng', '复用已有SearXNG转发');
eq(bing.body.baseUrl, settings.endpoints.searxng, '与SearXNG共享地址');
eq(bing.body.query.startsWith('!bing '), true); eq((bing.body.query.match(/!/g) || []).length, 1, '不能追加其他引擎或触发外部重定向');
eq(bing.response, 'text'); eq(webSearchProvider('bing').secret, undefined);
assert.throws(() => webSearchRequest('bing', 'test', {}), /请先填写SearXNG/); count++;
const wiki = webSearchRequest('wikipedia', '魔戒 & 中土世界', settings), url = new URL(wiki.path);
eq(url.hostname, 'en.wikipedia.org'); eq(url.searchParams.get('gsrsearch'), '魔戒 & 中土世界');
eq(url.searchParams.get('origin'), '*'); eq(url.searchParams.get('exchars'), '1200'); eq(url.searchParams.get('exlimit'), '3');
eq(wiki.direct, true); eq(wiki.headers['Api-User-Agent'].includes('github.com/aforgomon41-create/'), true, '公开百科请求带可联系的客户端标识');
eq(new URL(webSearchRequest('wikipedia', 'test', { wikiLanguage: 'evil.example' }).path).hostname, 'zh.wikipedia.org', '百科域名不受任意输入控制');
const result = { title: '作品设定', url: 'https://example.org/world', content: '世界资料' };
eq(webSearchRows('tavily', { results: [result] }), [result]);
eq(webSearchRows('serper', { organic: [{ title: result.title, link: result.url, snippet: result.content }] }), [result]);
eq(webSearchRows('serpapi', { organic_results: [{ title: result.title, link: result.url, snippet: result.content }] }), [result]);
eq(webSearchRows('zai', { search_result: [{ title: result.title, link: result.url, content: result.content }] }), [result]);
eq(webSearchRows('deepseek', { results: [{ ...result, summary: result.content, snippet: '短摘录', content: '不要整页' }] }), [result]);
eq(webSearchRows('tinyfish', { results: [{ title: result.title, url: result.url, snippet: result.content }] }), [result]);
eq(webSearchRows('exa', { results: [{ title: result.title, url: result.url, highlights: [result.content, {}], text: '其他' }] }), [result]);
eq(webSearchRows('firecrawl', { success: true, data: { web: [{ title: result.title, url: result.url, description: result.content }] } }), [result]);
eq(webSearchRows('serping', { organic: [{ title: result.title, link: result.url, snippet: result.content }] }), [result]);
eq(webSearchRows('serping', { searchParameters: { q: 'x' } }), []);
for (const provider of ['firecrawl', 'firecrawl-keyless']) {
  eq(webSearchRows(provider, { success: true, data: { web: [{ title: result.title, url: result.url, description: result.content }] } }), [result]);
  eq(webSearchRows(provider, { success: true, data: { web: [{ title: result.title, url: result.url, markdown: result.content }] } }), [result], '兼容Markdown正文');
  eq(webSearchRows(provider, { success: true, data: { web: [{ ...result, content: undefined, markdown: '字'.repeat(6000) }] } })[0].content.length, 2800, '整页资料仍受摘录上限限制');
  eq(webSearchRows(provider, { success: true, data: { web: [] } }), []);
  assert.throws(() => webSearchRows(provider, { success: false, error: 'limited' })); count++;
  assert.throws(() => webSearchRows(provider, { success: true, data: {} })); count++;
}
eq(webSearchRows('deepseek', { results: [{ ...result, summary: '字'.repeat(6000) }] })[0].content.length, 2800);
eq(webSearchRows('koboldcpp', [{ title: result.title, url: result.url, desc: result.content }]), [result]);
eq(webSearchRows('wikipedia', { batchcomplete: true, query: { pages: [{ title: result.title, fullurl: result.url, extract: result.content }] } }), [result]);
eq(webSearchRows('wikipedia', { batchcomplete: true }), []);
eq(webSearchRows('koboldcpp', []), []);
eq(webSearchRows('searxng', JSON.stringify({ results: [result] })), [result], '兼容未来酒馆返回结构化结果');
eq(webSearchRows('bing', { results: [{ ...result, engines: ['bing'] }, { ...result, url: 'https://other.example', engines: ['google'] }] }), [result], 'Bing入口只保留有Bing来源的记录');
eq(webSearchRows('bing', { results: [{ ...result, engine: 'bing' }] }), [result]);
eq(webSearchRows('bing', { results: [] }), []);
assert.throws(() => webSearchRows('bing', { results: [result] }), /未返回可核对的Bing/); count++;
for (const provider of list) { assert.throws(() => webSearchRows(provider.id, { error: { message: 'invalid key' } })); count++; }
for (const provider of ['tavily', 'serper', 'serpapi', 'zai', 'wikipedia', 'koboldcpp']) { assert.throws(() => webSearchRows(provider, '<html>验证页面</html>')); count++; }
console.log('十四个搜索选项、直连协议、获取密钥入口与响应适配：' + count + ' 项通过');
