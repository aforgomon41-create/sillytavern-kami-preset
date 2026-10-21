/* 读取当前酒馆账号；仅同源公开身份端点，不保存完整用户资料。 */
export async function kamiUserHandle(fetcher, headers, signal) {
  var response = await fetcher('/api/users/me', { method: 'GET', headers: headers || {},
    credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: signal });
  if (!response.ok) { throw new Error('无法确认当前酒馆用户，请刷新酒馆后重试'); }
  /* 先取文本再解析：解析失败时才有原文可以打日志（2026-10-21 用户要求把完整返回吐到日志）。 */
  /* 真实 fetch 响应一定有 text()；测试替身/极少数环境只有 json() 时退回它。 */
  var raw = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json()), user = null;
  try { user = JSON.parse(raw); }
  catch (error) {
    try {
      var NL = String.fromCharCode(10), cut = raw.length > 65536;
      if (typeof console !== 'undefined' && console.error) {
        console.error('[网络搜索] 读取当前酒馆用户失败：/api/users/me 返回的**不是数据**' + NL +
          '  响应状态: ' + response.status + ' ' + (response.statusText || '') + NL +
          '  内容类型: ' + (response.headers && response.headers.get ? (response.headers.get('content-type') || '(没有 content-type)') : '(未知)') + NL +
          '  解析错误: ' + (error && error.message ? error.message : String(error)) + NL +
          '  返回长度: ' + raw.length + ' 字符' + (cut ? '（太长，下面只贴前 65536 字符）' : '') + NL +
          '  判断: 只要不是 JSON，多半是登录页 / 反向代理 / 子路径部署把 /api 转丢了' + NL +
          '  ---- 返回正文开始 ----' + NL + (cut ? raw.slice(0, 65536) : raw) + NL + '  ---- 返回正文结束 ----');
      }
    } catch (e2) { }
    throw new Error('无法确认当前酒馆用户（接口返回的是网页而不是数据，完整返回已打到控制台日志）');
  }
  if (!user || typeof user.handle !== 'string' || !user.handle || user.handle.length > 255) {
    throw new Error('无法确认当前酒馆用户，请刷新酒馆后重试');
  }
  return user.handle;
}
