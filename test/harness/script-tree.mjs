import assert from 'node:assert/strict';
import fs from 'node:fs';
import { flattenScriptTrees, groupScriptTrees, mergeScriptTrees } from '../../src/scripts/_script-tree.js';

let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const script = (id, enabled = true, data = {}) => ({ type: 'script', id, enabled, name: id, content: 'new-' + id, data });
const folder = (id, scripts, enabled = true) => ({ type: 'folder', id, name: id, icon: 'fa-solid fa-folder', color: 'var(--SmartThemeQuoteColor)', enabled, scripts });
const ids = trees => flattenScriptTrees(trees).map(item => item.id);

const meta = JSON.parse(fs.readFileSync(new URL('../../src/scripts/meta.json', import.meta.url), 'utf8'));
const definitions = JSON.parse(fs.readFileSync(new URL('../../src/scripts/folders.json', import.meta.url), 'utf8'));
const leaves = meta.map(item => script(item.id, item.enabled));
const groups = definitions.map(item => ({ ...item, script_ids: item.files.map(file => {
  const entry = meta.find(row => row.file === file);
  assert.ok(entry, file); return entry.id;
}) }));
const grouped = groupScriptTrees(leaves, groups);
equal(grouped.map(item => item.name), ['基础与外观', '功能与设置', '开发中']);
equal(new Set(ids(grouped)).size, meta.length);
equal(flattenScriptTrees(grouped).filter(item => item.enabled).map(item => item.id), leaves.filter(item => item.enabled).map(item => item.id));
equal(flattenScriptTrees(grouped).filter(item => !item.enabled).map(item => item.id).sort(), leaves.filter(item => !item.enabled).map(item => item.id).sort());
equal(grouped.every(item => item.type === 'folder' && item.scripts.every(child => child.type === 'script')), true);
equal(flattenScriptTrees(null), []);

const mine = [script('a', false, { skin: 'mine', nested: { value: 7 } }), script('custom', true, { keep: 1 })];
mine[0].content = 'old-a';
const next = [folder('tools', [script('a'), script('b')])];
const snapshots = JSON.stringify([mine, next]);
const migrated = mergeScriptTrees(mine, next).list;
equal(ids(migrated), ['a', 'b', 'custom']);
equal(migrated[0].scripts[0].enabled, false);
equal(migrated[0].scripts[0].data, mine[0].data);
equal(migrated[0].scripts[0].content, 'new-a');
equal(migrated[1].data, { keep: 1 });
equal(JSON.stringify([mine, next]), snapshots);

const off = folder('tools', [script('a', true, { model: 'old' }), script('custom')], false);
off.name = '我的工具';
const stillOff = mergeScriptTrees([off], next).list;
equal(stillOff.length, 1);
equal(stillOff[0].enabled, false);
equal(stillOff[0].name, '我的工具');
equal(stillOff[0].scripts[0].enabled, true);
equal(stillOff[0].scripts[0].data, { model: 'old' });
equal(ids(stillOff), ['a', 'b', 'custom']);

const moved = mergeScriptTrees([folder('old-folder', [script('a'), script('user')], false)], next).list;
equal(moved[0].scripts.find(item => item.id === 'a').enabled, false);
equal(moved[1].id, 'old-folder');
equal(ids([moved[1]]), ['user']);
equal(moved[1].enabled, false);
equal(new Set(ids(moved)).size, ids(moved).length);
const keptEmpty = mergeScriptTrees([folder('mine', [script('a')], false)], next).list;
equal(keptEmpty.find(item => item.id === 'mine').scripts, []);
equal(mergeScriptTrees([script('a', false)], [script('a'), script('b')]).list.map(item => [item.id, item.enabled]), [['a', false], ['b', true]]);
equal(ids(mergeScriptTrees([folder('personal', [script('a'), script('custom')])], [script('a'), script('b')]).list), ['a', 'custom', 'b']);

for (const bad of [
  [{ id: 'f', script_ids: ['a', 'a'] }],
  [{ id: 'f', script_ids: ['missing'] }],
  [{ id: 'f', script_ids: [] }],
  [{ id: 'a', script_ids: ['a'] }],
]) { assert.throws(() => groupScriptTrees([script('a')], bad)); checks++; }
console.log('脚本文件夹与设置迁移：' + checks + ' 项通过');
