#!/usr/bin/env node
/** 用真实预设生成「预设设置」重设计预览的数据：design/previews/preset-panel/preset-data.json */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset } from '../../test/harness/preset-parse.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const r = parsePreset(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/preset.base.json'), 'utf8')));
const short = (t, n) => { if (!t) { return ''; } const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
/* 没有注释的条目：取正文第一行有意义的文字当简短提示（去掉宏与列表符号） */
const firstLine = (c) => String(c || '').replace(/\{\{[^}]*\}\}/g, '').split('\n').map((l) => l.replace(/^[-*#>\s]+/, '').trim()).find((l) => l.length > 3 && !/^\/\//.test(l) && !/^<\/?[\w-]+>$/.test(l) && !/^<[^>]+>/.test(l)) || '';
/* 提示去掉「叙事视角：」「特色文风指导规范：」这类前缀；只是重复了名字的就不要 */
const hintOf = (it) => {
  const h = firstLine(it.content).replace(/^[^：:]{2,12}[：:]/, '').replace(/[（(].*?[）)]$/, '').trim();
  const name = String(it.name).replace(/^\P{L}+/u, '');
  return h.length < 4 || name.includes(h) || h.includes(name) ? '' : short(h, 40);
};
const groups = {};
for (const layer of r.layers) {
  for (const c of layer.cards || []) {
    groups[c.name] = {
      name: c.name, layer: layer.name, mode: c.mode === '单选' ? 'one' : 'any',
      items: c.items.map((it) => ({ id: it.shortId, name: it.name, on: !!it.enabled, note: short(it.commentFlat || it.comment, 140), hint: hintOf(it), models: it.modelLabels || [] }))
    };
  }
}
fs.writeFileSync(path.join(ROOT, 'design/previews/preset-panel/preset-data.json'), JSON.stringify({ groups }, null, 1) + '\n');
console.log('[预览数据] ' + Object.keys(groups).length + ' 组：' + Object.keys(groups).join('、'));
