/* 读取当前酒馆账号；仅同源公开身份端点，不保存完整用户资料。
 *
 * ⚠️ 2026-10-21 实测：**TauriTavern（把酒馆打包进 Tauri 的移动端客户端）没有 /api/users/me 这个接口**，
 * 请求会落到它的单页兜底，返回 200 + 整个首页 HTML（实测 769KB，<title>TauriTavern</title>）。
 * 所以这个函数**失败是正常现象**，调用方必须准备好兜底：
 *   · 网络搜索：拿不到账号就退回公共前缀继续，不让「本机密钥」类来源整个不可用；
 *   · 引导：拿不到账号就退回脚本作用域记录。
 * 日志只在第一次失败时打一条紧凑的，不刷屏、不倒整页。 */
var warnedMissingHandle = false;
/* 端点**确定**不提供 JSON（不是临时故障）时置位：之后同一脚本实例内直接失败，不再发请求。
   TauriTavern 每次请求会拉回 769KB 的首页 HTML，不缓存的话引导每次开页面都白拉一遍。 */
var endpointMissing = false;

export async function kamiUserHandle(fetcher, headers, signal) {
  if (endpointMissing) { throw new Error('读不到当前酒馆账号，已改用公共前缀继续'); }
  var response = await fetcher('/api/users/me', { method: 'GET', headers: headers || {},
    credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: signal });
  if (!response.ok) { throw new Error('读不到当前酒馆账号（HTTP ' + response.status + '）'); }
  /* 真实 fetch 响应一定有 text()；测试替身只有 json() 时退回它。 */
  var raw = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json()), user = null;
  try { user = JSON.parse(raw); }
  catch (error) {
    endpointMissing = true;
    if (!warnedMissingHandle) {
      warnedMissingHandle = true;
      try {
        var NL = String.fromCharCode(10);
        var title = (String(raw).match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i) || [])[1] || '(没有 title)';
        var type = response.headers && response.headers.get ? (response.headers.get('content-type') || '(没有)') : '(未知)';
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[网络搜索] 酒馆没有 /api/users/me（返回的是网页，不是账号数据）' + NL +
            '  页面标题: ' + title + '  内容类型: ' + type + '  返回长度: ' + String(raw).length + ' 字符' + NL +
            '  影响: 只影响需要「本机密钥」的搜索来源（DeepSeek / TinyFish / Exa / Firecrawl / Serping）。' + NL +
            '  处理: 已自动退回公共前缀继续，不需要你做什么；同一会话内不再重复提示。' + NL +
            '  （常见于 TauriTavern 这类把酒馆打包进客户端的构建。）');
        }
      } catch (e2) { }
    }
    throw new Error('读不到当前酒馆账号，已改用公共前缀继续');
  }
  if (!user || typeof user.handle !== 'string' || !user.handle || user.handle.length > 255) {
    throw new Error('读不到当前酒馆账号，已改用公共前缀继续');
  }
  return user.handle;
}
