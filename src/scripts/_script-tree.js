/* 酒馆助手原生脚本树：构建、更新、继承和检查共用。不注册独立运行脚本。
 * 助手只允许一层文件夹；读取兼容早期没有 type 字段的平面脚本。
 * ES5 纯函数，构建时可内联；不能依赖 DOM、酒馆 API 或文件系统。 */

function scriptTreeEntries(trees) {
  var out = [], rows = Array.isArray(trees) ? trees : [];
  for (var i = 0; i < rows.length; i++) {
    var node = rows[i];
    if (!node || typeof node !== 'object') { continue; }
    if (node.type === 'folder') {
      var children = Array.isArray(node.scripts) ? node.scripts : [];
      for (var j = 0; j < children.length; j++) {
        if (children[j] && children[j].type !== 'folder') { out.push({ script: children[j], folder: node }); }
      }
    } else { out.push({ script: node, folder: null }); }
  }
  return out;
}

export function flattenScriptTrees(trees) {
  return scriptTreeEntries(trees).map(function (entry) { return entry.script; });
}

/* 只在产物装配处使用，编译与 manifest 继续处理平面脚本。
 * script_ids 只存在于源码分组定义，不写入助手对象。 */
export function groupScriptTrees(scripts, groups) {
  var byId = Object.create(null), used = Object.create(null), nodeIds = Object.create(null), out = [];
  for (var i = 0; i < scripts.length; i++) {
    var script = scripts[i];
    if (!script.id || byId[script.id]) { throw new Error('脚本 ID 缺失或重复：' + script.id); }
    byId[script.id] = script; nodeIds[script.id] = true;
  }
  for (var j = 0; j < groups.length; j++) {
    var group = groups[j];
    if (!group.id || nodeIds[group.id]) { throw new Error('文件夹 ID 缺失或重复：' + group.id); }
    nodeIds[group.id] = true;
    var folder = { type: 'folder', enabled: group.enabled !== false, name: group.name, id: group.id,
      icon: group.icon || 'fa-solid fa-folder', color: group.color || 'var(--SmartThemeQuoteColor)', scripts: [] };
    var ids = Array.isArray(group.script_ids) ? group.script_ids : [];
    for (var k = 0; k < ids.length; k++) {
      if (!byId[ids[k]] || used[ids[k]]) { throw new Error('文件夹包含未知或重复脚本：' + ids[k]); }
      folder.scripts.push(byId[ids[k]]); used[ids[k]] = true;
    }
    out.push(folder);
  }
  for (var n = 0; n < scripts.length; n++) {
    if (!used[scripts[n].id]) { throw new Error('脚本未分类：' + scripts[n].name); }
  }
  return out;
}

/* 叶子仍按既有口径：正文取新版，enabled/data 留用户；新增脚本用新版默认。
 * 新版定义分组时采用新版归属，用户自加的脚本与文件夹保留。
 * 不把文件夹当成脚本整体覆盖，不复制同 ID 脚本，也不因移出关闭的文件夹而启用脚本。
 * 早期平面更新器可能留下“旧顶层 + 新文件夹”同ID副本：按首次旧记录保留开关/data，
 * 后面的默认副本不能再覆盖它；只按ID去重，用户同名但不同ID的脚本照常保留。 */
export function mergeScriptTrees(theirs, next) {
  var copy = function (v) { return JSON.parse(JSON.stringify(v)); };
  var oldRows = scriptTreeEntries(theirs), newRows = scriptTreeEntries(next);
  var oldById = Object.create(null), nextById = Object.create(null), merged = Object.create(null);
  var oldFolders = Object.create(null), folders = Object.create(null), used = Object.create(null);
  var flat = [], out = [], report = { applied: 0, kept: 0, added: 0, deduplicated: 0 };
  var i, allRows = oldRows.concat(newRows);
  /* 不把缺失ID的异常记录折叠成一份；在写盘前中止，原配置保持完整。 */
  for (i = 0; i < allRows.length; i++) {
    var identity = allRows[i].script && allRows[i].script.id;
    if (typeof identity !== 'string' || !identity.replace(/^\s+|\s+$/g, '')) { throw new Error('发现缺少标识（ID）的脚本，为保留原配置已停止合并，请先检查脚本列表'); }
  }
  for (i = 0; i < oldRows.length; i++) {
    if (oldById[oldRows[i].script.id]) { report.deduplicated++; }
    else { oldById[oldRows[i].script.id] = oldRows[i]; }
  }
  for (i = 0; i < newRows.length; i++) {
    if (nextById[newRows[i].script.id]) { report.deduplicated++; }
    else { nextById[newRows[i].script.id] = newRows[i]; }
  }
  var oldTrees = Array.isArray(theirs) ? theirs : [], newTrees = Array.isArray(next) ? next : [];
  for (i = 0; i < oldTrees.length; i++) {
    if (oldTrees[i] && oldTrees[i].type === 'folder') { oldFolders[oldTrees[i].id] = oldTrees[i]; }
  }
  for (i = 0; i < oldRows.length; i++) {
    var old = oldRows[i].script, incoming = nextById[old.id];
    if (oldById[old.id] !== oldRows[i]) { continue; }
    var item = copy(incoming ? incoming.script : old);
    if (incoming) {
      item.enabled = old.enabled !== undefined ? !!old.enabled : item.enabled !== false;
      if (old.data !== undefined) { item.data = copy(old.data); }
      report.applied++;
    } else { report.kept++; }
    merged[old.id] = item; flat.push(item);
  }
  for (i = 0; i < newRows.length; i++) {
    var fresh = newRows[i].script;
    if (nextById[fresh.id] !== newRows[i]) { continue; }
    if (!oldById[fresh.id]) {
      var added = copy(fresh); merged[fresh.id] = added; flat.push(added);
      report.added++; report.applied++;
    }
  }
  var grouped = newTrees.some(function (node) { return node && node.type === 'folder'; });
  var hadFolders = oldTrees.some(function (node) { return node && node.type === 'folder'; });
  if (!grouped && !hadFolders) { report.list = flat; return report; }

  function take(script, targetFolder) {
    if (!script || used[script.id] || !merged[script.id]) { return null; }
    var node = merged[script.id], prior = oldById[script.id];
    if (prior && prior.folder && prior.folder.enabled === false &&
        (!targetFolder || targetFolder.enabled !== false)) { node.enabled = false; }
    used[script.id] = true;
    return node;
  }
  function emit(trees) {
    for (var n = 0; n < trees.length; n++) {
      var node = trees[n];
      if (!node || typeof node !== 'object') { continue; }
      if (node.type !== 'folder') {
        var leaf = take(node, null); if (leaf) { out.push(leaf); }
        continue;
      }
      var folder = folders[node.id];
      if (!folder) {
        folder = copy(node); folder.scripts = [];
        var previous = oldFolders[node.id];
        if (previous) {
          var fields = ['enabled', 'name', 'icon', 'color'];
          for (var f = 0; f < fields.length; f++) {
            if (previous[fields[f]] !== undefined) { folder[fields[f]] = copy(previous[fields[f]]); }
          }
        }
        folders[node.id] = folder;
      }
      var children = Array.isArray(node.scripts) ? node.scripts : [];
      for (var c = 0; c < children.length; c++) {
        var child = take(children[c], folder); if (child) { folder.scripts.push(child); }
      }
      if (out.indexOf(folder) < 0) { out.push(folder); }
    }
  }
  if (grouped) { emit(newTrees); emit(oldTrees); }
  else { emit(oldTrees); emit(newTrees); }
  report.list = out;
  return report;
}
