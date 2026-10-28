/** 浏览器审计的共享部分：静态服务器与页面内审计函数 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function serve(root) {
  const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  return { server, base: 'http://127.0.0.1:' + server.address().port };
}

/* 在页面里执行的审计函数：返回 { checked, failures[] } */
export function auditInPage(scopeSel) {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) { return null; } const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top.a; return { r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 }; };
  const up = (el) => el.parentElement || (el.getRootNode() && el.getRootNode().host) || null;
  /* 实际背景：从元素往上收集背景色，遇到不透明的为止，再自底向上叠加 */
  const effectiveBg = (el) => {
    const stack = []; let n = el;
    while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) { break; } } n = up(n); }
    if (!stack.length || stack[stack.length - 1].a < 1) { return null; }
    let bg = stack.pop(); while (stack.length) { bg = over(stack.pop(), bg); } return bg;
  };
  const desc = (el) => { const parts = []; let n = el; for (let i = 0; i < 4 && n && n.getAttribute; i++) { parts.unshift((n.getAttribute('data-k') ? '[' + n.getAttribute('data-k') + ']' : n.tagName.toLowerCase()) + (n.getAttribute('data-k-part') ? '.' + n.getAttribute('data-k-part') : '')); n = up(n); } return parts.join(' > '); };
  const skip = (el) => el.closest('[data-k-ornament], [aria-hidden="true"], [disabled], [data-disabled], [aria-disabled="true"]');
  const visible = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0; };
  /* scopeSel === '@mounts'：审计聊天区里所有消息挂载点（每个都是独立的 Shadow DOM） */
  const scope = scopeSel === '@mounts'
    ? [...document.querySelectorAll('[data-kami-mount]')].map((m) => m.shadowRoot).filter(Boolean)
    : (() => { const sr = document.querySelector('kami-layer').shadowRoot; return scopeSel ? sr.querySelectorAll(scopeSel) : [sr]; })();
  const failures = []; let checked = 0;
  const check = (el, fgColor, min, what) => {
    const bg = effectiveBg(el); const fg = parse(fgColor);
    if (!bg) { failures.push({ el: desc(el), what, problem: '一路透明到宿主页（没有铺底的表面）' }); return; }
    const f = fg.a < 1 ? over(fg, bg) : fg; const r = ratio(f, bg); checked++;
    if (r < min - 0.01) { failures.push({ el: desc(el), what, ratio: Math.round(r * 100) / 100, min, text: (el.textContent || '').trim().slice(0, 20) }); }
  };
  for (const s of scope) {
    for (const el of (s.nodeType === 1 ? [s, ...s.querySelectorAll('*')] : s.querySelectorAll('*'))) {
      if (skip(el) || !visible(el)) { continue; }
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { check(el, getComputedStyle(el).color, 4.5, '文字'); }
      if (el.matches('input, textarea')) {
        if (el.value) { check(el, getComputedStyle(el).color, 4.5, '输入值'); }
        if (el.placeholder) { check(el, getComputedStyle(el, '::placeholder').color, 3, '占位'); }
      }
    }
  }
  return { checked, failures };
}

