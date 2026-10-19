/* 预设脚本分类兼容：由按钮中转站一次性执行，不新增运行脚本。 */
export function clearKamiRuntimePause(trees, state, blocked) {
  var found = false;
  trees.forEach(function (node) {
    if (!node || typeof node !== 'object') { return; }
    (node.type === 'folder' ? (Array.isArray(node.scripts) ? node.scripts : []) : [node]).forEach(function (leaf) {
      if (leaf && typeof leaf.info === 'string' && leaf.info.slice(-state.marker.length) === state.marker && Object.prototype.hasOwnProperty.call(state.flags, leaf.id)) {
        leaf.info = leaf.info.slice(0, -state.marker.length);
        if (!blocked || !blocked[leaf.id]) { leaf.enabled = state.flags[leaf.id]; }
        found = true;
      }
    });
  });
  return found;
}

/* 此函数会编译到宿主realm：暂停入口iframe后，恢复任务仍必须能完成。 */
export function getKamiRuntimeScopeBlocks(host) {
  var blocked = Object.create(null);
  ['global', 'character'].forEach(function (type) {
    host.TavernHelper.getScriptTrees({ type: type }).forEach(function (node) {
      (node.type === 'folder' ? node.scripts : [node]).forEach(function (leaf) { blocked[leaf.id] = true; });
    });
  });
  return blocked;
}

export function resumeKamiScriptRuntime(host, state, clearPause, scopeBlocks) {
  var api = host.TavernHelper, ctx = host.SillyTavern.getContext(), pm = ctx.getPresetManager('openai');
  var list = pm.getPresetList();
  if (pm.getSelectedPresetName() !== state.name || list.presets[list.preset_names[state.name]] !== state.row || ctx.chatCompletionSettings !== state.settings) { return; }
  var blocked = scopeBlocks(host);
  state.blocked = blocked;
  var trees = api.getScriptTrees({ type: 'preset' });
  if (!clearPause(trees, state, blocked)) { return; }
  /* 保留暂停期间最新data、用户脚本和分类；只恢复带本事务标记的开关。 */
  api.replaceScriptTrees(trees, { type: 'preset' });
}

export function beginKamiScriptRuntime(host, state, paused, resume, clearPause, scopeBlocks) {
  var pm = host.SillyTavern.getContext().getPresetManager('openai'), save = pm.savePreset, guardState = state;
  state.blocked = scopeBlocks(host);
  /* 精确剥离本事务临时状态；复制、改名或切换后也不能把暂停状态保存下来。 */
  var guardedSave = function (name, raw, options) {
    var helper = raw && raw.extensions && raw.extensions.tavern_helper;
    if (guardState && helper && Array.isArray(helper.scripts)) { clearPause(helper.scripts, guardState, guardState.blocked); }
    return save.call(this, name, raw, options);
  };
  pm.savePreset = guardedSave;
  var cleanupTimer = null, cleanup = function () { guardState = null; if (pm.savePreset === guardedSave) { pm.savePreset = save; } };
  /* 必须由宿主JS栈登记定时器；从子iframe直接调用宿主setTimeout仍可能随子页被取消。 */
  var tries = 0, restore = function () {
    try { resume(host, state, clearPause, scopeBlocks); }
    catch (error) { if (++tries < 3) { host.setTimeout(restore, 0); } else { host.console.warn('卡密脚本实例重建未完成，原开关已保留在预设文件中', error); } }
    finally { if (cleanupTimer === null) { cleanupTimer = host.setTimeout(cleanup, 3000); } }
  };
  var timer = host.setTimeout(restore, 0);
  try {
    host.TavernHelper.replaceScriptTrees(paused, { type: 'preset' });
    /* 先清旧实例，再让出事件循环；即使随后切换/改名，也不会遗留旧iframe。 */
    var frames = host.document.querySelectorAll('iframe[id]');
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i], id = frame.id.slice(frame.id.lastIndexOf('--') + 2);
      if (frame.id.indexOf('TH-script--') !== 0 || !state.owned[id] || state.blocked[id]) { continue; }
      try { frame.contentWindow.dispatchEvent(new host.Event('pagehide')); } catch (e) { }
      frame.remove();
    }
  }
  catch (error) { host.clearTimeout(timer); cleanup(); throw error; }
}

export function resetKamiScriptRuntime(host, trees, catalog) {
  var api = host.TavernHelper, ctx = host.SillyTavern.getContext(), pm = ctx.getPresetManager('openai');
  if (!api || !api.replaceScriptTrees || !api.getScriptTrees || !host.Function) { throw new Error('宿主缺少安全重建脚本运行实例的接口'); }
  var paused = JSON.parse(JSON.stringify(trees)), flags = Object.create(null), owned = Object.create(null);
  var marker = '\n[kami-runtime-pause:' + Date.now() + ':' + Math.random().toString(36).slice(2) + ']';
  catalog.groups.forEach(function (group) { group.script_ids.forEach(function (id) { owned[id] = true; }); });
  Object.keys(catalog.aliases || {}).forEach(function (id) { owned[id] = true; });
  paused.forEach(function (node) {
    (node.type === 'folder' ? node.scripts : [node]).forEach(function (leaf) {
      if (owned[leaf.id]) { flags[leaf.id] = leaf.enabled !== false; leaf.enabled = false; leaf.info = (leaf.info || '') + marker; }
    });
  });
  var name = pm.getSelectedPresetName(), list = pm.getPresetList();
  var state = { name: name, row: list.presets[list.preset_names[name]], settings: ctx.chatCompletionSettings, flags: flags, owned: owned, marker: marker };
  /* 仅编译项目内固定函数，无用户源码/提示词拼接；绑定的是宿主函数，不依赖被卸载iframe。 */
  var resume = host.Function('return (' + resumeKamiScriptRuntime.toString() + ');')();
  var begin = host.Function('return (' + beginKamiScriptRuntime.toString() + ');')();
  var clearPause = host.Function('return (' + clearKamiRuntimePause.toString() + ');')();
  var scopeBlocks = host.Function('return (' + getKamiRuntimeScopeBlocks.toString() + ');')();
  begin(host, state, paused, resume, clearPause, scopeBlocks);
}

export function planKamiScriptUpgrade(trees, catalog, merge) {
  var aliases = catalog.aliases || {}, owned = Object.create(null), seen = Object.create(null), needed = false;
  catalog.groups.forEach(function (group) { group.script_ids.forEach(function (id) { owned[id] = true; }); });
  function key(id) { return aliases[id] || id; }
  var rows = [];
  (trees || []).forEach(function (node) { if (node && node.type === 'folder') { if ((catalog.folder_aliases || {})[node.id]) { needed = true; } rows = rows.concat(node.scripts || []); } else if (node) { rows.push(node); } });
  rows.forEach(function (node) {
    var id = key(node.id);
    if (owned[id]) { if (seen[id] || id !== node.id) { needed = true; } seen[id] = true; }
  });
  if (!needed) { return null; }
  var next = catalog.groups.map(function (group) {
    var found = trees.filter(function (node) { return node && node.type === 'folder' && node.id === group.id; });
    if (found.length !== 1) { throw new Error('自动整理缺少可核对的新版脚本分类'); }
    var folder = JSON.parse(JSON.stringify(found[0]));
    folder.scripts = group.script_ids.map(function (id) {
      var candidates = (found[0].scripts || []).filter(function (node) { return node.id === id; });
      if (candidates.length !== 1) { throw new Error('自动整理缺少可核对的新版脚本正文'); }
      return candidates[0];
    });
    return folder;
  });
  /* 不利用自动升级顺带删除用户异常副本，也不猜测缺少ID的记录。 */
  var custom = Object.create(null);
  rows.forEach(function (node) {
    if (typeof node.id !== 'string' || !node.id.trim()) { throw new Error('自动整理遇到缺少ID的脚本，原配置保持不变'); }
    if (!owned[key(node.id)]) { if (custom[node.id]) { throw new Error('自动整理遇到用户脚本ID冲突，原配置保持不变'); } custom[node.id] = true; }
  });
  var result = merge(trees, next, aliases, catalog.folder_aliases), boot = false;
  result.list.forEach(function (node) {
    var folderOn = node.type !== 'folder' || node.enabled !== false;
    (node.type === 'folder' ? node.scripts : [node]).forEach(function (leaf) {
      if (leaf.id === catalog.carrier) { boot = folderOn && leaf.enabled !== false; }
    });
  });
  return { trees: result.list, boot: boot, deduplicated: result.deduplicated };
}

export async function runKamiScriptUpgrade(env) {
  var catalog = env.catalog, host = env.host, copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  if (!env.id || !env.trees || !env.replaceTrees || !env.context || !catalog || env.id() !== catalog.carrier) { return { boot: true }; }
  function listRows(trees) {
    var rows = [];
    (trees || []).forEach(function (node) { rows = rows.concat(node && node.type === 'folder' ? node.scripts || [] : node ? [node] : []); });
    return rows;
  }
  function read() {
    var ctx = env.context(), settings = ctx && ctx.chatCompletionSettings;
    var pm = ctx && ctx.getPresetManager && ctx.getPresetManager('openai');
    if (!settings || !pm || !pm.getPresetList || !pm.getSelectedPresetName || !pm.savePreset) { return null; }
    var name = pm.getSelectedPresetName(), list = pm.getPresetList(), index = list && list.preset_names && list.preset_names[name];
    if (!name || !list || !list.presets || !list.presets[index]) { return null; }
    var trees = env.trees({ type: 'preset' });
    return { ctx: ctx, settings: settings, pm: pm, name: name, row: list.presets[index], trees: trees,
      cacheSignature: JSON.stringify(list.presets[index]), variables: env.variables ? env.variables({ type: 'preset' }) : undefined };
  }
  var initial = read();
  if (!initial) { return { boot: true }; }
  var plan = planKamiScriptUpgrade(initial.trees, catalog, env.merge);
  if (!plan) { return { boot: true }; }
  var fallbackBoot = plan.boot;
  if (listRows(initial.trees).filter(function (node) { return node.id === catalog.carrier; }).length !== 1 ||
      ['global', 'character'].some(function (type) { return listRows(env.trees({ type: type })).some(function (node) {
        return Object.prototype.hasOwnProperty.call(catalog.aliases || {}, node.id) || catalog.groups.some(function (group) { return group.script_ids.indexOf(node.id) >= 0; });
      }); })) {
    return { boot: true, skipped: '非唯一的预设脚本作用域' };
  }
  var previous = host.__kamiScriptUpgrade;
  if (previous && previous.name === initial.name && previous.build === catalog.build && previous.promise && (!previous.alive || previous.alive())) { return previous.promise; }
  var job = { name: initial.name, build: catalog.build, phase: 'backup', promise: null, alive: env.alive };
  host.__kamiScriptUpgrade = job;
  /* 当前iframe被关闭时释放宿主引用，避免未决Promise把完整预设快照长期留在内存。 */
  if (env.onDispose) { env.onDispose(function () {
    if (host.__kamiScriptUpgrade === job) { job.promise = null; delete host.__kamiScriptUpgrade; }
  }); }
  function same(state) {
    return !!state && (!env.alive || env.alive()) && host.__kamiScriptUpgrade === job && state.name === initial.name && state.row === initial.row && state.settings === initial.settings;
  }
  function putScripts(raw, trees) {
    raw.extensions = raw.extensions || {}; raw.extensions.tavern_helper = raw.extensions.tavern_helper || {};
    raw.extensions.tavern_helper.scripts = trees;
  }
  function snapshot(state, trees) {
    var raw = copy(state.settings), key;
    for (key in state.row) { if (!Object.prototype.hasOwnProperty.call(raw, key)) { raw[key] = copy(state.row[key]); } }
    var storedExt = state.row.extensions || {};
    raw.extensions = raw.extensions || {};
    for (key in storedExt) { if (!Object.prototype.hasOwnProperty.call(raw.extensions, key)) { raw.extensions[key] = copy(storedExt[key]); } }
    var storedHelper = storedExt.tavern_helper || {}, helper = raw.extensions.tavern_helper || {};
    for (key in storedHelper) { if (!Object.prototype.hasOwnProperty.call(helper, key)) { helper[key] = copy(storedHelper[key]); } }
    raw.extensions.tavern_helper = helper;
    putScripts(raw, copy(trees));
    if (state.variables !== undefined) { helper.variables = copy(state.variables); }
    return raw;
  }
  function save(name, raw) { return initial.pm.savePreset(name, raw, { skipUpdate: true }); }
  job.promise = (async function () {
    await save(initial.name + ' · 自动整理前备份', snapshot(initial, initial.trees));
    for (var attempt = 0; attempt < 3; attempt++) {
      var current = read();
      if (!same(current)) { job.phase = 'cancelled'; return { boot: false, cancelled: true }; }
      var next = planKamiScriptUpgrade(current.trees, catalog, env.merge);
      if (!next) { job.phase = 'done'; return { boot: true }; }
      fallbackBoot = next.boot;
      var before = JSON.stringify(snapshot(current, current.trees)), corrected = snapshot(current, next.trees);
      job.phase = 'save';
      await save(current.name, corrected);
      var latest = read();
      if (!same(latest)) {
        /* 只更新原目标的缓存，不把当前树API写到用户刚切换的另一份预设。 */
        if (host.__kamiScriptUpgrade !== job) { return { boot: false, cancelled: true }; }
        var presets = initial.pm.getPresetList(), index = presets.preset_names[current.name], cached = presets.presets[index];
        if (cached === current.row && JSON.stringify(cached) === current.cacheSignature) { putScripts(cached, copy(next.trees)); }
        else if (cached) { await save(current.name, copy(cached)); }
        job.phase = 'cancelled'; return { boot: false, cancelled: true };
      }
      if (JSON.stringify(snapshot(latest, latest.trees)) !== before) { continue; }
      job.phase = 'apply';
      var oldCache = latest.row.extensions, oldLive = latest.settings.extensions;
      try {
        /* 仅替换脚本子树，其他模型参数、扩展、预设变量都保留当前值。 */
        latest.row.extensions = copy(latest.row.extensions || {});
        latest.settings.extensions = copy(latest.settings.extensions || {});
        putScripts(latest.row, copy(next.trees)); putScripts(latest.settings, copy(next.trees));
        if (env.beforeApply) { env.beforeApply(next); }
        env.replaceTrees(copy(next.trees), { type: 'preset' });
      } catch (error) {
        latest.row.extensions = oldCache; latest.settings.extensions = oldLive;
        try { await save(latest.name, snapshot(latest, latest.trees)); }
        catch (rollbackError) { throw new Error('规范脚本已保存，但界面应用和恢复保存未完成；整理前备份仍保留。' + (rollbackError.message || rollbackError)); }
        throw error;
      }
      /* 旧iframe的pagehide须先完成，再进入中转站原有去重guard。 */
      if (env.wait) { await env.wait(); }
      if (!same(read())) { job.phase = 'cancelled'; return { boot: false, cancelled: true }; }
      job.phase = 'done';
      return { boot: next.boot, repaired: true, deduplicated: next.deduplicated };
    }
    var newest = read();
    if (same(newest)) { await save(newest.name, snapshot(newest, newest.trees)); }
    throw new Error('脚本设置仍在变化，已保留最新配置，稍后启动时自动再检查');
  })();
  try { return await job.promise; }
  catch (error) {
    job.phase = 'error';
    var failure = new Error((error && error.message) || String(error));
    failure.kamiUpgradeBoot = fallbackBoot;
    throw failure;
  }
  finally { job.promise = null; }
}
