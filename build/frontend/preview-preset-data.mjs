#!/usr/bin/env node
/**
 * 「预设设置」预览数据：完全由解析预设本体得来（test/harness/preset-parse.mjs），不写死任何分类名 / 分组名。
 * 改了预设条目，重跑本脚本即可，面板代码不用动（用户 2026-10-28 要求）。
 * 规则只看类型：模型页最前、含变量的页签其次、其余按预设顺序；变量 xxx_min / xxx_max 成对时当作范围。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePreset } from '../../test/harness/preset-parse.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const r = parsePreset(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/preset.base.json'), 'utf8')));
const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const byId = new Map((Array.isArray(r.entries) ? r.entries : Object.values(r.entries || {})).map((e) => [e.identifier, e]));
const item = (it) => ({ id: it.shortId || it.identifier, name: it.name, on: !!it.enabled, note: flat(it.commentFlat || it.comment) });
const group = (c) => ({
  name: c.name, mode: c.mode === '单选' ? 'one' : 'any',
  note: flat((byId.get(c.headIdentifier) || {}).commentFlat || ''),
  items: c.items.map(item)
});
const varCard = (vc) => {
  const name = String(vc.entry.name).replace(/\s*\|\s*var\s*$/, '');
  const vars = (vc.numericVars || []).map((v) => ({ key: v.name, value: Number(v.value) }));
  const fields = [];
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i], nx = vars[i + 1];
    const base = v.key.replace(/_min$/, '');
    if (/_min$/.test(v.key) && nx && nx.key === base + '_max') { fields.push({ kind: 'range', keys: [v.key, nx.key], values: [v.value, nx.value] }); i++; }
    else { fields.push({ kind: 'single', keys: [v.key], values: [v.value] }); }
  }
  return { name, note: flat(vc.entry.commentFlat || ''), fields };
};
const tabs = r.tabs.map((t, order) => {
  if (t.kind === 'model') {
    const reg = (t.registryEntries || [])[0];
    return { id: 'model', kind: 'model', name: t.displayName || t.name, order, note: flat(reg && reg.commentFlat),
      models: t.cards.map((c) => ({ name: c.name, label: c.label, emoji: c.emoji, items: c.items.map(item) })) };
  }
  return { id: 'tab-' + order, kind: 'layer', name: t.name, order,
    vars: (t.varCards || []).map(varCard), standalone: (t.standaloneItems || []).map(item), groups: (t.cards || []).map(group) };
}).filter((t) => t.kind === 'model' || t.vars.length || t.standalone.length || t.groups.length);
const rank = (t) => (t.kind === 'model' ? 0 : t.vars && t.vars.length ? 1 : 2);
tabs.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
fs.writeFileSync(path.join(ROOT, 'design/previews/preset-panel/preset-data.json'), JSON.stringify({ tabs }, null, 1) + '\n');
console.log('[预览数据] ' + tabs.length + ' 个页签：' + tabs.map((t) => t.name).join('、'));

/* 引导预览：免责声明正文现读预设里名字含「免责」的条目（和旧引导一样，不在界面代码里抄一份）；去掉 {{// … }} 注释宏外壳 */
const disc = (JSON.parse(fs.readFileSync(path.join(ROOT, 'src/preset.base.json'), 'utf8')).prompts || []).find((p) => /免责/.test(p.name || ''));
const disclaimer = disc ? String(disc.content || '').replace(/^\s*\{\{\/\/\s*/, '').replace(/\s*\}\}\s*$/, '').replace(/\n-{3,}\s*$/, '').trim() : '';
fs.mkdirSync(path.join(ROOT, 'design/previews/guide'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'design/previews/guide/guide-data.json'), JSON.stringify({ disclaimer }, null, 1) + '\n');
console.log('[预览数据] 引导：免责声明 ' + disclaimer.length + ' 字');
