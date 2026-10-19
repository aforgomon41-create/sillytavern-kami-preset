/* 读取当前酒馆账号；仅同源公开身份端点，不保存完整用户资料。 */
export async function kamiUserHandle(fetcher, headers, signal) {
  var response = await fetcher('/api/users/me', { method: 'GET', headers: headers || {},
    credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: signal });
  if (!response.ok) { throw new Error('无法确认当前酒馆用户，请刷新酒馆后重试'); }
  var user = await response.json();
  if (!user || typeof user.handle !== 'string' || !user.handle || user.handle.length > 255) {
    throw new Error('无法确认当前酒馆用户，请刷新酒馆后重试');
  }
  return user.handle;
}
