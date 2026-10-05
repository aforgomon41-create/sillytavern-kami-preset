#!/usr/bin/env node
/**
 * 「只复制干净的正文」纯逻辑单测（离线，不需要酒馆、不需要浏览器）
 * 用法：node test/harness/copy-clean.mjs
 *
 * 它测的是 src/scripts/_copy-clean.js —— 构建期内联进两个使用者的那一份：
 *   💭 显式思维链前端（src/regex/frontend-think.html）
 *   📄 正文外壳（src/scripts/45-正文外壳.js）
 * 两端共用同一份规则，所以这里过了，两边就都过了。
 *
 * 覆盖用户点名的三种样例：① 只有正文  ② 思维链 + 正文  ③ 正文里含 HTML 美化卡片
 * 断言四件事：无标签、无界面文字、段落换行保留、不复制 HTML 源码。
 *
 * 为什么要手写一个假 DOM：这个模块只用到 nodeType / nodeName / className /
 * getAttribute / childNodes / cloneNode 这几个接口，四十行替身就够。
 * 这样测的是**真代码**，而不是把规则抄一遍来测抄本（抄本永远是对的）。
 *
 * 另有一段「内联契约」：前端那条构建链会把每个美元符号加倍、还会拒收大括号宏，
 * 所以模块里一个美元符号都不许有 —— 这条只有读源码才发现得了，构建期报错太晚。
 */
import { readFileSync } from 'node:fs';
import { cleanCopyText, tidyCopyText, isCopyUiNode, copyWalk } from '../../src/scripts/_copy-clean.js';

let pass = 0, fail = 0;
const bad = [];
function eq(actual, expect, label) {
  if (actual === expect) { pass++; return; }
  fail++;
  bad.push(label + '\n    期望：' + JSON.stringify(expect) + '\n    实际：' + JSON.stringify(actual));
}
function ok(cond, label) { eq(!!cond, true, label); }

/* ── 最小 DOM 替身 ── */
function txt(s) {
  return {
    nodeType: 3, nodeName: '#text', nodeValue: String(s), childNodes: [],
    get textContent() { return this.nodeValue; },
    cloneNode() { return txt(this.nodeValue); }
  };
}
function el(tag, opts) {
  opts = opts || {};
  const attrs = opts.attrs || {};
  const node = {
    nodeType: 1,
    nodeName: String(tag).toUpperCase(),
    childNodes: [],
    className: opts.class || '',
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    appendChild(c) { node.childNodes.push(c); return c; },
    cloneNode() {
      const c = el(tag, opts);
      for (const k of node.childNodes) { c.childNodes.push(k.cloneNode()); }
      return c;
    },
    get textContent() {
      return node.childNodes.map(c => (c.textContent === undefined ? (c.nodeValue || '') : c.textContent)).join('');
    }
  };
  return node;
}
/* 注意：appendChild 按 DOM 规矩返回**被加进去的那个子节点**，不是父节点。
     所以想要"元素本身"必须自己接住 —— 直接链式写会把文本节点当成元素挂上去。 */
function wrap(tag, opts, text) { const e = el(tag, opts); e.appendChild(txt(text)); return e; }
const p = (s) => wrap('p', null, s);

/* 共同断言：拿到的东西里不许有标签、不许有界面文字 */
function noMarkup(s, label) {
  ok(s.indexOf('<') < 0, label + '：没有尖括号（不复制标签/HTML 源码）');
  ok(s.indexOf('>') < 0, label + '：没有右尖括号');
  ok(s.indexOf('data-kami') < 0, label + '：没有把前端属性复制出来');
  ok(s.indexOf('style=') < 0, label + '：没有把样式源码复制出来');
}

/* ════════════════════════════════════════════════════════════
 * ① 只有正文
 * ════════════════════════════════════════════════════════════ */
{
  const box = el('div', { class: 'kami-md' });
  box.appendChild(p('第一段正文。'));
  const p2 = el('p');
  p2.appendChild(txt('第二段正文，'));
  p2.appendChild(wrap('strong', null, '带强调'));
  p2.appendChild(txt('。'));
  box.appendChild(p2);
  const out = cleanCopyText(box);
  eq(out, '第一段正文。\n\n第二段正文，带强调。', '① 只取正文，段落之间留一个空行');
  noMarkup(out, '①');
  ok(out.indexOf('\n\n') >= 0, '① 段落换行保留（不是挤成一坨）');
}

/* ════════════════════════════════════════════════════════════
 * ② 思维链 + 正文：界面（标题/字数/按钮/原文视图）一律不许带出来
 * ════════════════════════════════════════════════════════════ */
{
  const root = el('div', { class: 'kami-root', attrs: { 'data-kami-comp': 'think' } });
  const collapse = el('div', { class: 'kami-collapse' });
  const head = el('div', { class: 'kami-collapse-head' });
  head.appendChild(wrap('span', { class: 'kami-title', attrs: { 'data-kami-slot': 'think-title' } }, '思维链'));
  head.appendChild(wrap('span', { class: 'kami-sub', attrs: { 'data-kami-slot': 'think-count' } }, '128 字'));
  const seg = el('span', { class: 'kami-seg' });
  seg.appendChild(wrap('button', { class: 'kami-seg-item' }, '渲染'));
  seg.appendChild(wrap('button', { class: 'kami-seg-item' }, '原文'));
  head.appendChild(seg);
  head.appendChild(wrap('button', { class: 'kami-btn', attrs: { 'data-kami-act': 'copy' } }, '复制'));
  collapse.appendChild(head);

  const mdBox = el('div', { class: 'kami-md' });
  mdBox.appendChild(p('他先看了一眼门锁。'));
  mdBox.appendChild(p('锁芯是新的。'));
  collapse.appendChild(mdBox);

  const rawBox = el('pre', { class: 'kami-raw' });
  rawBox.appendChild(txt('<nyaruko_think>他先看了一眼门锁。</nyaruko_think>'));
  collapse.appendChild(rawBox);
  root.appendChild(collapse);

  const fromBody = cleanCopyText(mdBox);
  eq(fromBody, '他先看了一眼门锁。\n\n锁芯是新的。', '② 复制渲染后的正文容器');
  noMarkup(fromBody, '②');

  /* 就算有人把整个组件根递进来（两个前端都发生过这种"传根"的错误），界面也得被摘干净 */
  const fromRoot = cleanCopyText(root);
  eq(fromRoot, fromBody, '② 传整个组件根，结果与传正文容器一致（界面被摘掉）');
  for (const uiText of ['思维链', '128 字', '复制', '渲染', '原文']) {
    ok(fromRoot.indexOf(uiText) < 0, '② 界面文字「' + uiText + '」没有混进复制结果');
  }
  ok(fromRoot.indexOf('nyaruko_think') < 0, '② 思维链标签没有混进复制结果');
  noMarkup(fromRoot, '②');
}

/* ════════════════════════════════════════════════════════════
 * ③ 正文里含 HTML 美化卡片：卡片是正文，要留；源码与脚本样式不要
 * ════════════════════════════════════════════════════════════ */
{
  const box = el('div', { class: 'kami-md' });
  box.appendChild(p('开头一段。'));
  /* 卡片本身也是 .kami- 开头 —— 正是这一点逼着排除清单必须"明确列举"而不是按前缀通配 */
  const card = el('div', { class: 'kami-card', attrs: { style: 'border:1px solid #ccc' } });
  card.appendChild(wrap('div', { class: 'kami-card-title' }, '状态面板'));
  card.appendChild(p('HP 100'));
  card.appendChild(p('MP 50'));
  box.appendChild(card);
  box.appendChild(wrap('style', null, '.kami-card { color: red }'));
  box.appendChild(wrap('script', null, 'var secret = 1;'));
  box.appendChild(p('结尾一段。'));

  const out = cleanCopyText(box);
  ok(out.indexOf('状态面板') >= 0, '③ 卡片是正文：它的可见文字要留下');
  ok(out.indexOf('HP 100') >= 0 && out.indexOf('MP 50') >= 0, '③ 卡片里的内容都留下');
  ok(out.indexOf('开头一段。') >= 0 && out.indexOf('结尾一段。') >= 0, '③ 卡片前后的正文都在');
  ok(out.indexOf('color: red') < 0, '③ <style> 里的 CSS 源码不复制');
  ok(out.indexOf('secret') < 0, '③ <script> 里的脚本不复制');
  noMarkup(out, '③');
  ok(out.indexOf('\n\n') >= 0, '③ 卡片与段落之间仍有空行');
  /* 卡片内部结构不能被挤成一坨 */
  ok(out.indexOf('状态面板') < out.indexOf('HP 100'), '③ 卡片内部保持原来的先后顺序');
}

/* ════════════════════════════════════════════════════════════
 * ④ 零碎规则：<br>、列表、表格、空态提示
 * ════════════════════════════════════════════════════════════ */
{
  const box = el('div', { class: 'kami-md' });
  const line = el('p');
  line.appendChild(txt('上行'));
  line.appendChild(el('br'));
  line.appendChild(txt('下行'));
  box.appendChild(line);
  eq(cleanCopyText(box), '上行\n下行', '④ <br> 还原成一个换行');

  const ul = el('ul');
  ul.appendChild(wrap('li', null, '甲'));
  ul.appendChild(wrap('li', null, '乙'));
  eq(cleanCopyText(ul), '甲\n乙', '④ 列表项各占一行');

  const empty = el('div', { class: 'kami-md' });
  empty.appendChild(wrap('p', { class: 'kami-empty' }, '这一楼没有正文内容'));
  eq(cleanCopyText(empty), '', '④ 前端自己的空态提示不复制');

  eq(cleanCopyText(null), '', '④ 传 null 不炸，返回空串');
  eq(tidyCopyText('\n\n甲\n\n\n\n乙   \n\n\n'), '甲\n\n乙', '④ 收尾：首尾空行去掉、最多留一个空行、行尾空格去掉');
  ok(isCopyUiNode(el('button')) === true, '④ <button> 判定为界面');
  ok(isCopyUiNode(el('div', { class: 'kami-raw' })) === true, '④ .kami-raw 判定为界面');
  ok(isCopyUiNode(el('div', { class: 'kami-card' })) === false, '④ .kami-card 不是界面（通配会误伤它）');
  ok(copyWalk(txt('原样')) === '原样', '④ 文本节点原样返回');
}

/* ════════════════════════════════════════════════════════════
 * ⑤ 内联契约：这份源码要能原样内联进两个前端
 * ════════════════════════════════════════════════════════════ */
{
  const src = readFileSync(new URL('../../src/scripts/_copy-clean.js', import.meta.url), 'utf8');
  ok(src.indexOf('$') < 0, '⑤ 模块里没有美元符号（前端构建链会把每个美元符号加倍，正则锚点会被写坏）');
  ok(src.indexOf('{{') < 0, '⑤ 模块里没有大括号宏（会被酒馆的 substituteParams 当宏替换掉）');
  ok(src.indexOf('import ') < 0, '⑤ 模块里没有 import（内联前提）');
  ok(src.split('\n').filter(l => /^\s+export\s/.test(l)).length === 0, '⑤ 没有缩进的 export');
  ok(src.split('\n').filter(l => l.startsWith('export ')).length >= 2, '⑤ 有行首 export 可供去掉');
}

/* ════════════════════════════════════════════════════════════
 * ⑥ 接线：两个使用者的复制都必须走这一份，谁也别再回去复制原始文本
 * ════════════════════════════════════════════════════════════ */
{
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const think = read('../../src/regex/frontend-think.html');
  const shell = read('../../src/scripts/45-正文外壳.js');
  const doc = read('../../build/kami-doc.mjs');

  for (const [name, src] of [['💭 思维链前端', think], ['📄 正文外壳', shell]]) {
    ok(src.indexOf('/* @@KAMI_COPY_CLEAN@@ */') >= 0, '⑥ ' + name + '：留了共享模块占位符');
    ok(src.indexOf('cleanCopyText(') >= 0, '⑥ ' + name + '：复制走 cleanCopyText');
  }
  ok(think.indexOf('copy(raw, copyBtn)') < 0, '⑥ 思维链前端：不再直接复制 raw');
  ok(shell.indexOf('var text = rawBox.textContent') < 0, '⑥ 正文外壳：不再直接复制 rawBox');
  ok(shell.indexOf('已复制原文') < 0, '⑥ 正文外壳：提示语不再说「原文」');
  /* 构建期必须真把这一份内联进去，否则产物里会原样留着占位符 */
  ok(doc.indexOf('COPY_CLEAN_MARK') >= 0, '⑥ build/kami-doc.mjs：有占位符常量');
  ok(doc.indexOf('expandCopyClean') >= 0, '⑥ build/kami-doc.mjs：有展开函数');
  ok(/expandForRegex[\s\S]{0,500}expandCopyClean\(root, doc\)/.test(doc), '⑥ 正则那条路展开了（酒馆 replaceString）');
  ok(/expandForPreview[\s\S]{0,500}expandCopyClean\(root, doc\)/.test(doc), '⑥ 预览台那条路展开了');
  ok(/expandPanelGestures[\s\S]{0,900}expandCopyClean\(root, code\)/.test(doc), '⑥ 脚本那条路展开了（45-正文外壳）');
}

/* ════════════════════════════════════════════════════════════
 * ⑦ 复制结果不依赖「我们哪几个正则是开着的」
 *   用户原话（2026-10-05）：「只复制最终被各种正则处理出来的正文，不管用户用了什么正则」。
 *   四种开关组合都得干净：只有思维链开 / 只有正文外壳开 / 两个都开 / 两个都不开。
 *   ⚠️「两个都不开」这一种最容易被忽略：这时候页面上**没有我们的任何界面元素**，
 *   容器里就是酒馆自己渲染出来的最终正文，照样不许把标签复制出去。
 * ════════════════════════════════════════════════════════════ */
{
  const thinkRoot = el('div', { class: 'kami-root', attrs: { 'data-kami-comp': 'think' } });
  const tCollapse = el('div', { class: 'kami-collapse' });
  const tHead = el('div', { class: 'kami-collapse-head' });
  tHead.appendChild(wrap('span', { class: 'kami-title' }, '思维链'));
  tHead.appendChild(wrap('span', { class: 'kami-sub' }, '96 字'));
  tHead.appendChild(wrap('button', { class: 'kami-btn', attrs: { 'data-kami-act': 'copy' } }, '复制'));
  tCollapse.appendChild(tHead);
  const tMd = el('div', { class: 'kami-md' });
  /* 正文里**故意不出现**「思维链」这三个字 —— 否则下面的界面文字断言会误判成界面泄漏 */
  tMd.appendChild(p('推理内容第一段。'));
  tMd.appendChild(p('推理内容第二段。'));
  tCollapse.appendChild(tMd);
  tCollapse.appendChild(wrap('pre', { class: 'kami-raw' }, '<nyaruko_think>原始标签</nyaruko_think>'));
  thinkRoot.appendChild(tCollapse);

  const shellRoot = el('div', { class: 'kami-root', attrs: { 'data-kami-comp': 'body' } });
  const sShell = el('div', { class: 'kami-shell' });
  const sHead = el('div', { class: 'kami-head' });
  sHead.appendChild(wrap('span', { class: 'kami-title' }, '正文'));
  sHead.appendChild(wrap('span', { class: 'kami-sub' }, '40 字'));
  sHead.appendChild(wrap('button', { class: 'kami-btn', attrs: { 'data-kami-body-copy': '1' } }, '复制'));
  sShell.appendChild(sHead);
  const sBody = el('div', { class: 'kami-body' });
  const sRender = el('div', { class: 'kami-body-render' });
  sRender.appendChild(p('正文第一段。'));
  sRender.appendChild(p('正文第二段。'));
  sBody.appendChild(sRender);
  sBody.appendChild(wrap('pre', { class: 'kami-raw' }, '<content>原始正文标签</content>'));
  sShell.appendChild(sBody);
  sShell.appendChild(wrap('div', { class: 'kami-toast' }, '已复制正文'));
  shellRoot.appendChild(sShell);

  const plain = el('div', { class: 'mes_text' });
  plain.appendChild(p('原生渲染第一段。'));
  plain.appendChild(p('原生渲染第二段。'));

  const both = el('div', { class: 'mes_text' });
  both.appendChild(thinkRoot);
  both.appendChild(shellRoot);
  both.appendChild(plain);

  const combos = [
    ['只有思维链前端开', tMd, '推理内容第一段。\n\n推理内容第二段。'],
    ['只有正文外壳开', sRender, '正文第一段。\n\n正文第二段。'],
    ['两个都开（从整条消息取）', both, null],
    ['两个都不开（页面上没有我们的界面元素）', plain, '原生渲染第一段。\n\n原生渲染第二段。'],
  ];
  for (const [name, node, exact] of combos) {
    const out = cleanCopyText(node);
    noMarkup(out, '⑦ ' + name);
    if (exact !== null) { eq(out, exact, '⑦ ' + name + '：取到的就是最终正文'); }
    for (const ui of ['复制', '思维链', '96 字', '40 字', '已复制正文']) {
      ok(out.indexOf(ui) < 0, '⑦ ' + name + '：界面文字「' + ui + '」没混进来');
    }
    ok(out.indexOf('nyaruko_think') < 0, '⑦ ' + name + '：思维链标签没混进来');
    ok(out.indexOf('<content>') < 0, '⑦ ' + name + '：正文标签没混进来');
    ok(out.length > 0, '⑦ ' + name + '：确实取到了东西（不是空串糊弄过去）');
  }
}

/* ════════════════════════════════════════════════════════════
 * ⑧ 渲染失败时不许把原始文本交出去
 *   改之前是 try { mdBox.innerHTML = md(raw) } catch (e) { mdBox.textContent = raw } ——
 *   渲染一失败，容器里装的就是原始文本，复制出来又带标签，正好退回用户抱怨的老样子。
 *   现在改成：留一句说明 + 打失败标记 + 复制按钮置灰。
 *   最后三条是源码级防线：万一将来有人又把按钮放开，容器里也只有那句说明，
 *   而说明是 .kami-empty（界面元素），取出来仍然是空串 —— 绝不会漏出原文。
 * ════════════════════════════════════════════════════════════ */
{
  const failedBox = el('div', { class: 'kami-md' });
  failedBox.appendChild(wrap('p', { class: 'kami-empty' }, '正文渲染失败，暂时不能复制'));
  eq(cleanCopyText(failedBox), '', '⑧ 渲染失败：取出来是空串，不是原始文本');

  const src = readFileSync(new URL('../../src/regex/frontend-think.html', import.meta.url), 'utf8');
  ok(src.indexOf('mdBox.textContent = raw') < 0, '⑧ 源码里没有「渲染失败就把 raw 塞进正文容器」那条老写法');
  ok(src.indexOf("root.setAttribute('data-kami-md-failed', '1')") >= 0, '⑧ 渲染失败会打上失败标记');
  ok(src.indexOf('renderFailed') >= 0, '⑧ 渲染失败有可读的提示文案');
  ok(/var mdFailed = root\.getAttribute\('data-kami-md-failed'\) === '1'/.test(src), '⑧ 复制接线会读这个失败标记');
  ok(/if \(mdFailed \|\| !raw\)[\s\S]{0,320}setAttribute\('disabled'/.test(src), '⑧ 失败时复制按钮被置灰（而不是复制原文）');
  const clickAt = src.indexOf('copy(cleanCopyText(mdBox || root), copyBtn)');
  const disableAt = src.indexOf("copyBtn.setAttribute('disabled', 'disabled')");
  ok(clickAt > 0 && disableAt > 0 && disableAt < clickAt, '⑧ 置灰分支排在复制分支之前，失败时根本挂不上点击');
}

console.log((fail ? '✗ ' : '✓ ') + '复制干净正文：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
