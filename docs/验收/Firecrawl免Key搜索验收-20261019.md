# Firecrawl 免 Key 搜索验收（2026-10-19）

用户要求：核实 Firecrawl 匿名搜索属实后接入，并作为默认选项；与维基百科一起标注“免key”。

## 结果

- 新增 Firecrawl (免key)，原 Firecrawl 密钥模式保持独立，现有供应商选择和 Key 保留。
- 尚未保存供应商时默认选择免 Key；不自动开启搜索，也不改变原生/服务模式。失效或已移除来源仍关闭搜索。
- 维基百科显示“维基百科 (免key)”。
- 复用已有请求构造、JSON解析、自动/手动搜索、增量资料、单楼与中断流程，不增加运行脚本、插件或公共代理。
- 无认证请求只带 Accept/Content-Type，不读酒馆账号、密钥或浏览器存储；禁止 cookie、重定向和 referrer。
- 搜索仍只取网页摘录，不默认附加 scrapeOptions；兼容响应中的 Markdown，摘录仍限 2800 字符、响应 2MiB。
- 429明确提示当前 IP 免费额度/限流；402仅提示服务暂不可用，不将其断言成IP日额度。失败不自动重试或切到收费来源。

## 官方依据与真实访问

只读 Luna Max 子代理核查官方文档与源码，主代理复核后实现。子代理环境的 EACCES 没有 HTTP 响应，不作为失败证据；主代理在允许联网的执行环境中补实测，TLS证书校验保持开启。

- [官方 Keyless 公告](https://www.firecrawl.dev/blog/firecrawl-keyless-launch)：REST 无需 Authorization，按 IP 每日限制。
- [当前限额](https://docs.firecrawl.dev/rate-limits#keyless-no-api-key)：每日请求数和积分两种上限，超出返回429，未公布固定额度。
- [计费文档](https://docs.firecrawl.dev/billing)：注册免费 Key 的每月1,000积分与匿名每日IP限额不同。不在产品中承诺匿名每月固定1,000积分。
- [Search接口](https://docs.firecrawl.dev/api-reference/endpoint/search)、[匿名路由](https://github.com/firecrawl/firecrawl/blob/main/apps/api/src/routes/v2.ts)、[CORS初始化](https://github.com/firecrawl/firecrawl/blob/main/apps/api/src/index.ts)。

实际匿名 POST https://api.firecrawl.dev/v2/search，公开查询 Rivendell Tolkien，limit:1：
HTTP 200，success:true，data.web 返回维基百科标题、URL、description，creditsUsed:2；没有 Authorization。

预检使用 Origin http://localhost:11451、POST、content-type：
HTTP 204，Access-Control-Allow-Origin:*，允许POST，允许content-type。

隔离Chrome在390px视口加载成品工具箱，按真实UI启用搜索服务并点击手动搜索：
一次实际Firecrawl请求HTTP 200，真实摘录进入提取阶段，输出一个带search_results和来源URL的资料楼层，成功状态及弹窗边界正常。17项通过。
计划与资料整理使用固定测试模型返回，没有调用真实模型，没有修改11451用户聊天、设置或密钥。该项不代表对事实正确性的独立核验。

## 回归与成品

- 供应商协议与响应适配：187项通过。
- 自动/手动、单楼、密钥隔离、默认配置、权限、额度和取消：883项通过。
- 头部任务绑定：21项通过。
- 工具箱桌面/手机浏览器：163项通过，供应商与模型使用模拟返回。
- 原生搜索桌面/手机浏览器：205项通过，供应商与模型使用模拟返回。
- 最新成品压缩：204项通过；引导：79项通过。
- 完整构建、脚本编译、皮肤及组件契约、版本身份和前端链路检查全部通过。
- 子代理只读复核通过；其指出的402与IP限额区分已经修正并加入断言。

测试包：dist/kami-v0.92-69-20261019.json
大小：5,463,001 字节
SHA-256：c512bb9b5d1d28ceac007228ca3091c15233cc1ed636aaf0b59c4d6407f746e7

67构建缺少本机showdown依赖路径，68为中间检查包，69为最终测试包；不要分发67或68。未创建Release或发布镜像，公开最新版仍为v0.92-62。新版同时包含66已完成的引导重复弹出修复。
