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

console.log((fail ? '✗ ' : '✓ ') + '复制干净正文：' + pass + ' 项' + (fail ? '，' + fail + ' 项失败' : '全部通过'));
if (fail) { console.log('\n' + bad.join('\n')); process.exitCode = 1; }
