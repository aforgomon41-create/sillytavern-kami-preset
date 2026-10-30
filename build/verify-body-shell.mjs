#!/usr/bin/env node
/**
 * 「正文外壳」链路守卫（只读产物与源码，不写任何东西）
 * ------------------------------------------------------------
 * 2026-09-26 起，「前端|正文 v0.1」**不再发 iframe 载荷**：
 *   正则把 `<content>X</content>` 换成「两个空标记夹住正文」，由 `45-正文外壳.js`
 *   在父文档里把标记之间套上外壳 —— 目的是让「在正文里就地插生图按钮」的插件照常工作。
 * 这条链路有三处只有这里会查，所以单独一个守卫（`verify-frontends.mjs` 只管另外两个 iframe 前端）：
 *   ① 产物里那条正则：载荷是那对标记、保留 $1、很短、markdownOnly / placement / maxDepth 原样；
 *   ② 产物里没有残留的 iframe 版正文载荷（`@@FRONTEND:body@@` 一个都不许有）；
 *   （2026-10-30 脚本整理：45 号「📄 正文外壳」退役，正文由「💬 消息前端」直接以 .mes_text 为宿主渲染；
 *    原来查 45 号脚本、皮肤面板开关、生成期间不重画的 ③⑤⑥ 随之删除，那对标记仍保留——关掉消息前端时它们不可见、不碍事。）
 *   ④ **端到端发射检查**（正则在真输出上跑一遍 → showdown 渲一遍）：标记活下来、markdown 真的渲染、
 *      插图标签仍在正文文本里、`<content>` 不残留、没有用会在页面上露出来的文本哨兵。
 *      这一条是防「有人改回用单个 div 把正文包起来」——那样 showdown 会把正文里的 markdown 全部当原文不渲染。
 *
 * 用法：node build/verify-body-shell.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-body-shell.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 正文外壳链路验证（' + path.basename(p) + '） ===');

/* ① 正则 */
const rg = preset.extensions?.regex_scripts || [];
const hits = rg.filter(r => String(r.scriptName || '').indexOf('前端|正文') === 0);
ok(hits.length === 1, '① 「前端|正文…」这条正则只有一条', '实际 ' + hits.length + ' 条');
const body = hits[0];
if (body) {
  const rep = String(body.replaceString || '');
  ok(rep.indexOf('data-kami-body-start') >= 0 && rep.indexOf('data-kami-body-end') >= 0,
    '① 载荷是「两个空标记夹正文」', JSON.stringify(rep.slice(0, 90)));
  ok(rep.indexOf('$1') >= 0, '① 载荷里保留了 $1（正文原样留下）');
  ok(rep.length < 400, '① 载荷很短（不是一整份 HTML 文档）', rep.length + 'B');
  ok(body.disabled === false, '① 这条正则是启用的');
  ok(body.markdownOnly === true, '① 仍然只作用于显示（markdownOnly）');
  ok(JSON.stringify(body.placement) === '[2]', '① 仍然只吃 AI 输出（placement=[2]）', JSON.stringify(body.placement));
  ok(body.maxDepth === 1, '① maxDepth 保持 1（只渲染最新一层，用户 2026-09-26 裁定）', 'maxDepth=' + body.maxDepth);
  ok(String(body.id) === '4c1f9b26-7d05-4a53-9f18-2be7c4a0d6e1',
    '① id 没变（老用户升级时那条正则是**改写**不是新增，避免两条打架）', String(body.id));
  ok(String(body.scriptName) === '前端|正文 v0.1',
    '① 名字保持「前端|正文 v0.1」（老用户升级时按 id 与名字对位）', String(body.scriptName));
}

/* ② 不许残留 iframe 版载荷 */
ok(rg.filter(r => String(r.replaceString || '').indexOf('@@FRONTEND:body@@') >= 0).length === 0,
  '② 没有残留的 iframe 版正文载荷');
ok(rg.filter(r => /前端\|正文/.test(String(r.scriptName || '')) && String(r.replaceString || '').length > 400).length === 0,
  '② 没有哪条「正文」正则还挂着大载荷');

/* ④ 端到端发射检查（正则 → showdown） */
{
  const ROOTS = (process.env.KAMI_ST_ROOT || [
    'D:/sillytavern-software/SillyTavern Launcher GUI/data/sillytavern/1.18.0',
    'D:/SillyTavern/SillyTavern',
  ].join(';')).split(';').map(s => s.trim()).filter(Boolean);
  let sp = null;
  for (const r of ROOTS) {
    const f = path.join(r, 'node_modules/showdown/dist/showdown.min.js');
    if (fs.existsSync(f)) { sp = f; break; }
  }
  if (!sp) {
    ok(false, '④ 找不到 showdown，端到端发射检查没跑成（设 KAMI_ST_ROOT 指向酒馆根目录）');
  } else if (body) {
    const require = createRequire(import.meta.url);
    const showdown = require(sp);
    const conv = new showdown.Converter();
    const RAW = ['开场白。', '', '<content>', '## 雨夜', '', '她把伞往我这边偏了偏。', '',
      'image###雨夜，一把伞###', '', '- 雨点砸在伞面上', '', '> 「你这个人啊……」', '</content>', '', '收尾。'].join('\n');
    const re = new RegExp(String(body.findRegex || '').replace(/^\/|\/[gimsuy]*$/g, ''), 'g');
    const replaced = RAW.replace(re, String(body.replaceString));
    const html = conv.makeHtml(replaced);
    ok(html.indexOf('data-kami-body-start') >= 0 && html.indexOf('data-kami-body-end') >= 0,
      '④ showdown 之后两个标记都还在（脚本才找得到落点）');
    ok(/<h2/.test(html), '④ markdown 标题真的渲染了（用单个 div 包起来会全灭）');
    ok(/<li>/.test(html) && /<blockquote/.test(html), '④ 列表与引用也渲染了');
    ok(html.indexOf('image###雨夜') >= 0, '④ 插图标签仍在正文文本里（插件就地插按钮的前提）');
    ok(html.indexOf('<content>') < 0 && html.indexOf('</content>') < 0, '④ <content> 标签没残留到显示里');
    ok(html.indexOf('%%') < 0, '④ 没有用文本哨兵那种会在页面上露出来的写法');
  }
}

console.log('');
console.log(bad ? '★ 正文外壳链路验证失败 ' + bad + ' 条' : '正文外壳链路验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
