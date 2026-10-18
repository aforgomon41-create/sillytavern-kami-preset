# 搜索服务与 API Key 获取

当前保留13种搜索来源，全部无需额外安装搜索插件或重启酒馆。工具箱的“网络搜索 → 搜索服务”中可选择供应商，每种需密钥的来源都有“获取 API Key”链接。

| 来源 | 获取 Key | 保存位置与使用条件 |
|---|---|---|
| DeepSeek | [API Keys](https://platform.deepseek.com/api_keys) | 本机浏览器；使用官方Search接口，按官方规则计费，不修改剧情模型密钥 |
| TinyFish | [API Keys](https://agent.tinyfish.ai/api-keys) | 本机浏览器；使用独立Search接口，有每日免费额度，超额可能扣钱包余额 |
| Exa | [API Keys](https://dashboard.exa.ai/api-keys) | 本机浏览器；账户免费积分及费用以官方政策为准 |
| Firecrawl | [API Keys](https://www.firecrawl.dev/app/api-keys) | 本机浏览器；使用v2 Search，只取网页结果，按账户积分计费 |
| Serping API | [Dashboard](https://serpingapi.com/dashboard) | 本机浏览器；免费1000次为一次性，与serp.ing不同 |
| Tavily | [控制台](https://app.tavily.com/home) | 酒馆服务端；使用酒馆已有搜索接口 |
| SerpApi | [Manage API Key](https://serpapi.com/manage-api-key) | 酒馆服务端；使用酒馆已有搜索接口 |
| Serper | [官网注册或登录](https://serper.dev/) | 酒馆服务端；使用酒馆已有搜索接口 |
| Z.AI | [API Keys](https://z.ai/manage-apikey/apikey-list) | 酒馆服务端；与剧情模型的Z.AI连接共用密钥 |
| Bing | 无需搜索API Key | 需可用的、启用了Bing引擎的SearXNG实例，与SearXNG共用地址 |
| SearXNG | 无需搜索API Key | 需自己部署或获准使用的实例地址 |
| KoboldCpp | 无需搜索API Key | 需启用了`--websearch`的服务地址 |
| 维基百科 | 无需搜索API Key | 浏览器需可访问所选语言的维基百科，只检索百科 |

本机密钥按当前酒馆用户分别保存，不写入脚本变量、聊天或预设导出。换设备、换浏览器或更换酒馆地址后需要重新填写；清除浏览器网站数据也会移除密钥。“清除本机密钥”只删除当前供应商当前用户的密钥。

前五家和维基百科由当前设备访问官方接口，需要设备能联网；其他渠道由酒馆服务器访问。浏览器拒绝跨站请求或服务商修改接口政策时，会明确报错，不自动改用插件、公共代理或其他收费来源。当前浏览器保存的密钥能被同站点脚本访问，功能不声称具有服务端密钥库的隔离能力。

AnySearch因当前浏览器访问检查未通过、需要额外转发，已按用户要求移除。原v0.92-42的插件方案已撤回，不要安装旧插件包。旧配置若选中已移除的渠道，会关闭搜索能力，需手动选择其他来源。

官方接口依据（2026-10-18核对）：[DeepSeek](https://api-docs.deepseek.com/guides/search/)、[TinyFish](https://docs.tinyfish.ai/search-api/reference)、[Exa](https://exa.ai/docs/reference/search)、[Firecrawl](https://docs.firecrawl.dev/api-reference/endpoint/search)、[Serping](https://serpingapi.com/docs)。免费额度与费用以服务商政策为准，搜索模型和剧情模型的调用费用另计。当前尚未使用有效Key完成逐家真实搜索验收。
