#!/usr/bin/env node
/**
 * 扫描预设条目名里用到的 emoji → src/frontend/ds/icons/preset-emojis.json（前端契约 6.7）
 * 每项：emoji、出现次数、举例的条目名。皮肤据此在 skin.json 的 icons 里给映射；构建时报告内置皮肤还没映射的 emoji。
 * 改了预设条目名后重跑：node build/frontend/scan-emojis.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const preset = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/preset.base.json'), 'utf8'));
const RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;
const map = new Map();
for (const p of preset.prompts || []) {
  const name = String(p.name || '');
  for (const m of name.matchAll(RE)) {
    const key = m[0].replace(/\p{Emoji_Modifier}/gu, '');   /* 肤色修饰不区分 */
    const e = map.get(key) || { emoji: key, count: 0, examples: [] };
    e.count++; if (e.examples.length < 3) { e.examples.push(name.slice(0, 30)); }
    map.set(key, e);
  }
}
const list = [...map.values()].sort((a, b) => b.count - a.count);
fs.writeFileSync(path.join(ROOT, 'src/frontend/ds/icons/preset-emojis.json'), JSON.stringify(list, null, 1) + '\n');
console.log('[emoji] 预设条目名里共 ' + list.length + ' 种 emoji → src/frontend/ds/icons/preset-emojis.json');
