/* 搜索来源目录、原生酒馆端点与响应归一化。构建内联，不增加运行脚本。
 * 额度核对日期 2026-10-19；没有密钥、没有默认公共代理，不自动切换到收费来源。 */
export function webSearchProviders() {
  var list = [
    { id: 'firecrawl-keyless', label: "Firecrawl (免key)", url: 'https://docs.firecrawl.dev/rate-limits#keyless-no-api-key', note: '无需注册或密钥，当前设备直接连接Firecrawl全网搜索。免费用量按IP每日限制，请求数或积分任一达到上限都会限流；同一网络可能共用额度，具体上限以官方政策为准。只取网页搜索摘录，不额外抓取整页；限流后可稍后重试或自行切换来源。' },
    { id: 'tavily', label: "Tavily", secret: 'api_key_tavily', url: 'https://docs.tavily.com/documentation/api-credits', note: '每月1000免费积分（credits）；当前普通搜索每次1积分，需注册领取密钥。超额费用以账户套餐为准。' },
    { id: 'serpapi', label: "SerpApi", secret: 'api_key_serpapi', url: 'https://serpapi.com/pricing', note: '免费计划每月250次搜索，需注册领取密钥；超额需按服务商规则升级。' },
    { id: 'bing', label: "Bing", endpoint: true, endpointKey: 'searxng', url: 'https://docs.searxng.org/dev/engines/online/bing.html', note: '通过SearXNG的Bing网页引擎检索，无需搜索API密钥。需填写自己部署或获准使用、且启用了Bing的实例；与SearXNG共用地址。服务器及上游费用、网络与限流仍需自行处理。微软原官方搜索API已停用。' },
    { id: 'wikipedia', label: "维基百科 (免key)", url: 'https://www.mediawiki.org/wiki/API:Search', note: '无需密钥；只检索维基百科，不是全网搜索。由浏览器直接访问，设备需能连接维基百科；冷门同人设定可能查不到，请遵守接口限流。' },
    { id: 'searxng', label: "SearXNG", endpoint: true, url: 'https://docs.searxng.org/dev/search_api.html', note: '开源软件免搜索API费用，需填写自己部署或获准使用的实例地址。服务器及上游引擎可能有费用或限流；不预置公共实例。' },
    { id: 'koboldcpp', label: "KoboldCpp", endpoint: true, url: 'https://koboldcpp.net/docs/features/web-search-and-mcp/', note: '需运行启用了 --websearch 的 KoboldCpp，底层使用 DuckDuckGo，免搜索API密钥；服务器、网络与上游限流仍需自行处理。默认用于无密码的本地服务；有密码的实例需另行配置酒馆转发认证。' },
    { id: 'serper', label: "Serper", secret: 'api_key_serper', url: 'https://serper.dev/', note: '官网提供2500次试用查询，需密钥；不是每月自动补充的免费计划，用完后按服务商价格购买。' },
    { id: 'zai', label: "Z.AI", secret: 'api_key_zai', url: 'https://docs.z.ai/guides/overview/pricing', note: '使用酒馆已接入的 search-prime，按服务商价格付费。与酒馆Z.AI模型共用密钥；保存密钥会更新酒馆中该服务的密钥。' }
  ];
  list = list.concat([
    { id: 'deepseek', label: "DeepSeek", localKey: true, url: 'https://api-docs.deepseek.com/guides/search/', note: '使用DeepSeek官方Search API，按搜索接口规则计费；不是网页聊天的免费联网功能。密钥保存在本机浏览器，不修改酒馆的DeepSeek模型密钥。' },
    { id: 'tinyfish', label: "TinyFish", localKey: true, url: 'https://docs.tinyfish.ai/search-api', note: '使用独立Search API，需密钥。当前每日12000次免费搜索，UTC零点重置，默认每分钟30次；超额且钱包有余额时可能扣费，以账户规则为准。' },
    { id: 'exa', label: "Exa", localKey: true, url: 'https://exa.ai/docs/reference/search', note: '使用普通Search API及资料摘录，需密钥。新账户有免费积分；积分额度和用完后的收费以账户及官方定价为准。' },
    { id: 'firecrawl', label: "Firecrawl", localKey: true, url: 'https://docs.firecrawl.dev/api-reference/endpoint/search', note: '使用v2 Search的网页结果，需密钥，支持账户免费积分。搜索按积分计费；本功能不额外抓取整页、图片或视频，具体额度以账户为准。' },
    { id: 'serping', label: "Serping", localKey: true, url: 'https://serpingapi.com/docs', note: '接入serpingapi.com的Google搜索接口，需密钥。免费计划每账号一次性1000次，用完不按月补充；与serp.ing是不同服务。' }
  ]);
  var keyUrls = { tavily: 'https://app.tavily.com/home', serpapi: 'https://serpapi.com/manage-api-key', serper: 'https://serper.dev/', zai: 'https://z.ai/manage-apikey/apikey-list',
    deepseek: 'https://platform.deepseek.com/api_keys', tinyfish: 'https://agent.tinyfish.ai/api-keys',
    exa: 'https://dashboard.exa.ai/api-keys', firecrawl: 'https://www.firecrawl.dev/app/api-keys', serping: 'https://serpingapi.com/dashboard' };
  list.forEach(function (item) { if (keyUrls[item.id]) { item.keyUrl = keyUrls[item.id]; } });
  return list;
}

export function webSearchProvider(id) {
  var list = webSearchProviders();
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
  return null;
}

export function webSearchEndpoint(value, provider) {
  var text = String(value || '').trim();
  if (!text) { return ''; }
  var url;
  try { url = new URL(text); } catch (e) { throw new Error('服务地址无效，请填写完整的 http:// 或 https:// 地址'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') { throw new Error('服务地址只支持 http:// 和 https://'); }
  if (url.username || url.password || url.search || url.hash) { throw new Error('服务地址不能包含密码、查询参数或片段；请填写不含登录信息的根地址'); }
  if (provider === 'searxng' && url.pathname !== '/') { throw new Error('当前酒馆SearXNG转发需要实例根地址，请去掉 /search 或其他路径'); }
  return url.toString().replace(/\/+$/, '');
}

export function webSearchRequest(provider, query, settings, apiKey) {
  var entry = webSearchProvider(provider);
  if (!entry) { throw new Error('无法识别所选搜索服务，请重新选择'); }
  if (entry.localKey || provider === 'firecrawl-keyless') {
    if (typeof query !== 'string' || Array.from(query).length > (provider === 'deepseek' ? 128 : 500)) { throw new Error('搜索查询过长；DeepSeek最多128个字符'); }
    if (entry.localKey && query && (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 4096 || /[\r\n]/.test(apiKey))) { throw new Error('请先保存有效的搜索服务密钥'); }
    var headers = { Accept: 'application/json', 'Content-Type': 'application/json' }, directBody, path, method = 'POST';
    if (provider === 'deepseek') { path = 'https://api.deepseek.com/v1/tools/search'; headers.Authorization = 'Bearer ' + apiKey; directBody = { query: query, count: 3, need_content: false }; }
    if (provider === 'tinyfish') { var target = new URL('https://api.search.tinyfish.ai'); target.searchParams.set('query', query); path = target.toString(); method = 'GET'; headers['X-API-Key'] = apiKey; }
    if (provider === 'exa') { path = 'https://api.exa.ai/search'; headers['x-api-key'] = apiKey; directBody = { query: query, type: 'auto', numResults: 3, contents: { highlights: true } }; }
    if (provider === 'firecrawl' || provider === 'firecrawl-keyless') { path = 'https://api.firecrawl.dev/v2/search'; if (entry.localKey) { headers.Authorization = 'Bearer ' + apiKey; } directBody = { query: query, limit: 3, sources: ['web'] }; }
    if (provider === 'serping') { path = 'https://api.serpingapi.com/v1/search'; headers['X-API-Key'] = apiKey; directBody = { q: query, num: 3 }; }
    return { path: path, method: method, body: directBody, direct: true, response: 'json', headers: headers };
  }
  settings = settings || {};
  var body = { query: query }, route = provider, response = 'json';
  if (provider === 'serper') { body.images = false; }
  if (provider === 'tavily') { body.include_images = false; }
  if (provider === 'searxng' || provider === 'koboldcpp' || provider === 'bing') {
    var endpointKey = webSearchProvider(provider).endpointKey || provider;
    var endpoint = webSearchEndpoint((settings.endpoints || {})[endpointKey], endpointKey);
    if (!endpoint) { throw new Error('请先填写' + (endpointKey === 'searxng' ? 'SearXNG实例' : 'KoboldCpp服务') + '地址'); }
    if (endpointKey === 'searxng') {
      route = 'searxng'; body.baseUrl = endpoint; body.categories = 'general'; response = 'text';
      /* 引擎选择符可叠加，移除查询自带的 !，避免 !! 重定向或追加其他引擎。 */
      if (provider === 'bing') { body.query = '!bing ' + String(query || '').replace(/!/g, ' '); }
    }
    else { body.url = endpoint; }
  }
  if (provider === 'wikipedia') {
    var language = ['zh', 'en', 'ja'].indexOf(settings.wikiLanguage) >= 0 ? settings.wikiLanguage : 'zh';
    var url = new URL('https://' + language + '.wikipedia.org/w/api.php');
    var params = { action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '3', prop: 'extracts|info', exintro: '1', explaintext: '1', exchars: '1200', exlimit: '3', inprop: 'url', redirects: '1', format: 'json', formatversion: '2', maxlag: '5', origin: '*' };
    for (var key in params) { url.searchParams.set(key, params[key]); }
    return { path: url.toString(), response: 'json', direct: true, headers: { 'Api-User-Agent': 'KamiPreset/0.93 (+https://github.com/aforgomon41-create/sillytavern-kami-preset)' } };
  }
  return { path: '/api/search/' + route, body: body, response: response };
}

export function webSearchRows(provider, data, document) {
  if (typeof data === 'string' && /^\s*[\[{]/.test(data)) {
    try { data = JSON.parse(data); } catch (e) { throw new Error('搜索服务返回了无效JSON'); }
  }
  if (data && (data.error || data.success === false)) { throw new Error('搜索服务返回错误，请检查配置、额度或接口限流'); }
  var rows;
  if (provider === 'serper' || provider === 'serping') { rows = data && data.organic; if (provider === 'serping' && rows === undefined && data && data.searchParameters) { return []; } }
  else if (provider === 'firecrawl' || provider === 'firecrawl-keyless') { rows = data && data.data && data.data.web; }
  else if (provider === 'serpapi') { rows = data && data.organic_results; }
  else if (provider === 'zai') { rows = data && data.search_result; }
  else if (provider === 'koboldcpp') { rows = Array.isArray(data) ? data : data && data.results; }
  else if (provider === 'wikipedia') {
    rows = data && data.query && data.query.pages;
    if (data && data.batchcomplete !== undefined && !data.query) { return []; }
    if (Array.isArray(rows)) { return rows.filter(function (page) { return page && !page.missing; }).map(function (page) { return { title: page.title, url: page.fullurl, content: page.extract || '' }; }); }
  } else if ((provider === 'searxng' || provider === 'bing') && typeof data === 'string') {
    if (!document || typeof document.createElement !== 'function') { throw new Error('当前环境无法解析SearXNG网页结果'); }
    /* template 内容保持惰性，不把返回的网页挂进页面，不执行脚本或加载图片。 */
    var template = document.createElement('template'); template.innerHTML = data;
    var results = template.content.querySelectorAll('article.result'), parsed = [];
    for (var i = 0; i < results.length; i++) {
      if (provider === 'bing') {
        var engines = results[i].querySelectorAll('.engines > span'), fromBing = false;
        for (var n = 0; n < engines.length; n++) { if (engines[n].textContent.trim().toLowerCase() === 'bing') { fromBing = true; } }
        if (!fromBing) { continue; }
      }
      var link = results[i].querySelector('h3 a'), snippet = results[i].querySelector('.content');
      if (link) { parsed.push({ title: link.textContent, url: link.getAttribute('href'), content: snippet && !snippet.classList.contains('empty_element') ? snippet.textContent : '' }); }
    }
    if (!results.length && !template.content.querySelector('#urls, #results, .result-container')) { throw new Error('SearXNG未返回可识别的搜索页，可能需要登录、验证或已被限流'); }
    if (provider === 'bing' && results.length && !parsed.length) { throw new Error('当前实例未返回可核对的Bing来源，请检查Bing引擎或实例主题配置'); }
    return parsed;
  } else { rows = data && data.results; }
  if (!Array.isArray(rows)) { throw new Error('搜索服务没有返回可识别的结果，请检查配置、额度或服务版本'); }
  if (provider === 'bing') {
    var onlyBing = rows.filter(function (row) { return row && (row.engine === 'bing' || Array.isArray(row.engines) && row.engines.indexOf('bing') >= 0); });
    if (rows.length && !onlyBing.length) { throw new Error('当前实例未返回可核对的Bing来源，请检查Bing引擎配置'); }
    rows = onlyBing;
  }
  return rows.filter(function (row) { return row && typeof row === 'object'; }).map(function (row) {
    var content = provider === 'deepseek' ? row.summary || row.snippet : provider === 'exa' ? (Array.isArray(row.highlights) ? row.highlights.filter(function (text) { return typeof text === 'string'; }).join('\n') : '') || row.text || row.summary : row.content || row.snippet || row.desc || row.description || ((provider === 'firecrawl' || provider === 'firecrawl-keyless') ? row.markdown : '');
    return { title: row.title, url: row.url || row.link, content: typeof content === 'string' ? content.slice(0, 2800) : '' };
  });
}
