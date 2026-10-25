/* 运行库：定位酒馆宿主窗口。
 *
 * 每个酒馆助手脚本都跑在自己的 iframe 里，彼此看不见对方的变量；
 * 但它们同源，可以沿 window 链向上找到酒馆主页面。
 * 面板实际挂在宿主文档（HOST.document）上，所以运行库也必须注册到宿主 window，
 * 这样后面每一个面板脚本都能用 HOST.KamiRuntime 取到同一份 React/Radix。
 */
export function detectHost(win) {
  var w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) { return null; }
  var cands = [w];
  try { if (w.parent && w.parent !== w) { cands.push(w.parent); } } catch (e) { }
  try { if (w.top && w.top !== w && w.top !== w.parent) { cands.push(w.top); } } catch (e) { }
  function looksLikeTavern(x) {
    try {
      var d = x.document;
      if (!d) { return false; }
      if (d.getElementById('send_textarea')) { return true; }
      if (d.querySelector('#chat')) { return true; }
      if (d.querySelector('.mes_text')) { return true; }
      if (d.querySelector('#sheld')) { return true; }
    } catch (e) { }
    return false;
  }
  for (var i = 0; i < cands.length; i++) { if (looksLikeTavern(cands[i])) { return cands[i]; } }
  for (var j = 0; j < cands.length; j++) {
    try { if (cands[j] && cands[j].document && cands[j].document.documentElement) { return cands[j]; } } catch (e) { }
  }
  return w;
}
