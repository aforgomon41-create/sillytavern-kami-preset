/* 正则前端（src/regex/frontend-*.html，跑在酒馆助手的消息 iframe 里）建元素用的小工具，构建期整段内联（占位见 build/kami-doc.mjs 的 expandUi）。
 * 2026-11-04 起取代旧组件核心 src/ui/core.js（连同旧运行库一起删了），正则前端只用到它的 element() 与 adopt()。
 * 两者照旧给元素打 data-kami-ui / data-kami-card-role 标记——同一份兜底样式（src/ui/foundation.css + src/skin/base.css，
 * 构建期内联进前端文档）按这些标记写规则。
 * ES5、不依赖运行库。 */
export function createKamiUi(doc) {
  if (!doc || typeof doc.createElement !== 'function') { throw new Error('组件需要可用的文档'); }
  var MAP = [['kami-icon-btn', 'iconButton'], ['kami-btn', 'button'], ['kami-textarea', 'textarea'], ['kami-number', 'number'], ['kami-select', 'select'], ['kami-text', 'text'], ['kami-switch', 'switch'], ['kami-range', 'range'], ['kami-tabs', 'tabs'], ['kami-seg', 'segmented'], ['kami-empty', 'empty'], ['kami-chip', 'badge'], ['kami-field', 'field'], ['kami-card', 'card']];
  var URL_ATTRS = ['href', 'xlink:href', 'src', 'action', 'formaction', 'poster', 'data', 'cite', 'background'];
  function text(value) { return value == null ? '' : String(value); }
  function append(parent, value) {
    if (Array.isArray(value)) { value.forEach(function (part) { append(parent, part); }); }
    else if (value && typeof value.nodeType === 'number') { parent.appendChild(value); }
    else if (value !== undefined && value !== null) { parent.appendChild(doc.createTextNode(text(value))); }
    return parent;
  }
  function safeUrl(value) {
    try { var url = new URL(text(value), doc.baseURI || 'https://localhost/'); return /^https?:$/.test(url.protocol) ? url.href : null; } catch (e) { return null; }
  }
  function attrs(node, values) {
    Object.keys(values || {}).forEach(function (name) {
      var value = values[name], lower = name.toLowerCase();
      if (/^on/.test(lower) || lower === 'innerhtml' || lower === 'outerhtml' || lower === 'srcdoc') { throw new Error('组件属性禁止执行代码'); }
      if (URL_ATTRS.indexOf(lower) >= 0) { value = safeUrl(value); if (!value) { return; } }
      if (value === false || value === null || value === undefined) { node.removeAttribute(name); }
      else { node.setAttribute(name, value === true ? '' : text(value)); }
    });
    return node;
  }
  function classify(node) {
    var classes = node.classList, tag = (node.tagName || '').toLowerCase();
    if (!classes || typeof classes.contains !== 'function' || typeof node.hasAttribute !== 'function') { return node; }
    var role = null;
    if (classes.contains('kami-card')) {
      role = tag === 'button' || node.getAttribute('role') === 'button' ? 'choice' : tag === 'details' || classes.contains('kami-collapse') ? 'collapse' : 'container';
      node.setAttribute('data-kami-card-role', role);
    }
    if (!node.hasAttribute('data-kami-ui')) {
      for (var i = 0; i < MAP.length; i++) {
        if (classes.contains(MAP[i][0])) { node.setAttribute('data-kami-ui', role === 'choice' ? 'choiceCard' : role === 'collapse' ? 'collapse' : MAP[i][1]); break; }
      }
    }
    return node;
  }
  function element(tag, cls, content, properties) {
    var node = doc.createElement(tag);
    if (cls) { node.className = cls; }
    if (tag === 'button') { node.type = 'button'; }
    if (content !== undefined && content !== null) { if (typeof content === 'string' || typeof content === 'number') { node.textContent = text(content); } else { append(node, content); } }
    attrs(node, properties);
    return classify(node);
  }
  /* 给模板里现成的一棵节点补上同样的标记（搜索资料前端用） */
  function adopt(root) { if (!root) { return root; } classify(root); if (root.querySelectorAll) { Array.prototype.forEach.call(root.querySelectorAll('[class]'), classify); } return root; }
  return { element: element, adopt: adopt };
}
