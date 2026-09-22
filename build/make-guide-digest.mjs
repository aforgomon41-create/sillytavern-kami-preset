/* 生成「引导文案素材包」：给文案 agent 的预设结构 digest。
 * 输出 design/copy/guide-digest.md
 * 只读，不改任何预设文件。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset, firstComment, stripArrowEnds } from '../test/harness/preset-parse.mjs';

/* 工作区根目录从本文件位置推导（build/ 的上一级）：不写死，
   换机器、改文件夹名都能跑。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'src/preset.base.json');   /* 构建真正的源预设 */
const out = path.join(ROOT, 'design/copy/guide-digest.md');

const preset = JSON.parse(fs.readFileSync(src, 'utf8'));
const tree = parsePreset(preset);

const prompts = preset.prompts || [];
const byId = {};
for (const p of prompts) { byId[p.identifier] = p; }
const order = (preset.prompt_order || []).find((o) => o.character_id === 100001) || (preset.prompt_order || [])[0];
const enabledMap = {};
if (order) { for (const p of order.order) { enabledMap[p.identifier] = p.enabled; } }

function clean(s) {
  return String(s == null ? '' : s)
    .split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean).join(' ')
    .replace(/\s+/g, ' ');
}
function excerpt(content, n) {
  let s = clean(content);
  /* 去掉开头的 {{trim}} 之类宏与注释本身，注释单独展示 */
  s = s.replace(/\{\{\/\/[^}]*\}\}/g, '').replace(/\{\{trim\}\}/g, '').trim();
  return s.length > n ? s.slice(0, n) + '……(后文略)' : s;
}
function noteOf(entry) {
  if (!entry) { return null; }
  return firstComment(entry.content);
}

const L = [];
L.push('# 卡密预设 0.9 · 引导文案素材包');
L.push('');
L.push('> 由脚本从预设本体自动生成（' + path.basename(src) + '）。');
L.push('> 条目名一律以「条目名」字段全文为准（含 emoji），写文案时 match 字段必须照抄它。');
L.push('> 「默认状态」开/关指预设出厂的开关状态；「注释」是条目内容里第一个 {{//...}}，也就是面板 ⓘ 显示的字。');
L.push('');

L.push('## 0. 预设是什么（一句话）');
L.push('');
L.push('「卡密预设」是 SillyTavern 1.18 + 酒馆助手 4.9.5 上的 AI 角色扮演预设。用户通过开关一条条「条目」来配置 AI 的行为：选模型、选语言、选文风、选难度、开关各种功能。引导向导要把这些选择用大白话讲清楚。');
L.push('');

/* ── tab 结构 ── */
L.push('## 1. 设置面板的 tab 结构（引导页面对应的配置项全在这里）');
L.push('');
for (const tab of (tree.tabs || [])) {
  const tname = tab.name || tab.title || tab.key || '(未命名)';
  if (!(tab.cards || []).length) { continue; }   /* 空 tab（变量/模型）在后面单独列 */
  L.push('### tab ' + tname + (tab.special ? '（特殊 tab：' + tab.special + '）' : ''));
  L.push('');
  const tabHead = noteOf(byId[tab.identifier]);
  if (tabHead) { L.push('- tab 注释：' + tabHead); }
  for (const c of (tab.cards || [])) {
    const cname = c.name || c.label || '(未命名卡片)';
    const mode = c.mode === 'once' ? '【选一：开一个自动关其它】' : c.mode === 'any' ? '【任选：互相独立】' : '';
    L.push('- 卡片「' + cname + '」' + mode);
    for (const it of (c.items || [])) {
      const e = byId[it.identifier];
      const st = enabledMap[it.identifier] === false ? '关' : (enabledMap[it.identifier] === true ? '开' : '?');
      const note = noteOf(e);
      L.push('  - 条目名「' + it.name + '」｜默认' + st + (note ? '｜注释：' + note : '｜（无注释）'));
      if (e && e.content) { L.push('    - 内容摘要：' + excerpt(e.content, 160)); }
    }
  }
  L.push('');
}

/* ── 模型表 ── */
L.push('## 2. 模型（🤖 模型 tab：选一个模型 = 开它名下的条目、关其它模型的）');
L.push('');
const mt = tree.modelTab || {};
for (const c of (mt.cards || [])) {
  L.push('- 模型卡「' + c.name + '」（emoji ' + c.emoji + '）');
  for (const it of (c.items || [])) {
    const st = enabledMap[it.identifier] === false ? '关' : (enabledMap[it.identifier] === true ? '开' : '?');
    const e = byId[it.identifier];
    L.push('  - 条目名「' + it.name + '」｜默认' + st + '｜来自' + (it.originLayer || '?') + '｜注释：' + (noteOf(e) || '（无注释）'));
    if (e && e.content) { L.push('    - 内容摘要：' + excerpt(e.content, 120)); }
  }
}
/* 登记条目原文（emoji 表的出处，讲模型时的话术素材） */
for (const layer of (tree.layers || [])) {
  for (const r of (layer.registries || [])) {
    L.push('- 登记条目「' + r.name + '」｜注释：' + (noteOf(r) || '（无注释）'));
    L.push('  - 内容全文：');
    L.push('  ```');
    L.push('  ' + String(r.content || '').trim().split(String.fromCharCode(10)).join(String.fromCharCode(10) + '  '));
    L.push('  ```');
  }
}
L.push('');

/* ── 变量 ── */
L.push('## 3. 设置变量（数字/范围，生成设置页与文生图页用；名字以 🧩 开头的条目都在这）');
L.push('');
for (const p of prompts) {
  if ((p.name || '').indexOf('🧩') !== 0) { continue; }
  L.push('- 条目名「' + p.name + '」｜默认' + (enabledMap[p.identifier] === false ? '关' : '开') + '｜注释：' + (noteOf(p) || '（无注释）'));
  L.push('  - 内容全文：' + clean(p.content));
}
L.push('');

/* ── 免责 ── */
L.push('## 4. 免责声明条目（引导第一页展示的正文）');
L.push('');
const disc = prompts.find((p) => (p.name || '').indexOf('免责') >= 0);
if (disc) {
  L.push('条目名「' + disc.name + '」｜identifier：' + disc.identifier + '｜默认' + (enabledMap[disc.identifier] === false ? '关（只展示不参与对话）' : '开'));
  L.push('');
  L.push('```');
  L.push(String(disc.content || '').trim());
  L.push('```');
}
L.push('');

/* ── 结构性/锁定条目（不进面板，写文案时不需要管，列出防止误会） ── */
L.push('## 5. 不出现在设置面板的条目');
L.push('');
L.push('以下层级被解析器跳过（结构包裹区/锁定条目），引导不要把它们当成可配置项：');
L.push('');
for (const s of (tree.skippedLayers || [])) { L.push('- ' + (s.name || s.rawName || '(未命名)') + '（' + (s.skipReason || '结构包裹区') + '）'); }
for (const l of (tree.locked || [])) { L.push('- 锁定：' + (l.name || '(未命名)')); }
L.push('');

fs.writeFileSync(out, L.join(String.fromCharCode(10)), 'utf8');
console.log('已写出 ' + out + '（' + L.length + ' 行）');
