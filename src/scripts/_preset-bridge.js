/* 新前端预设设置面板（06 号「🧪 预设设置」）与引导用的读写桥。
   view() 把当前预设解析成新面板的数据形状（与 build/frontend/preview-preset-data.mjs 同一口径）；
   开关、变量、模型、自定义文风都走本脚本原来的写入路径（单选联动、对话模式联动、模型闸门不变）。
   变化通知与 40 号其他桥共用 toolsNotify（refresh / 写入成功后都会叫）。 */
export function presetFlat(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  var presetCache = null;
  function presetView() {
    if (presetCache && presetCache.ver === toolsVer) { return presetCache.data; }
    var raw = readTree();
    var data;
    if (!raw.ok) { data = { ok: false, error: raw.error || '读不到当前预设', name: '', tabs: [], state: { on: {}, vars: {}, model: '' } }; }
    else {
      var tree = raw.tree, varIndex = {}, on = {}, vars = {}, model = '';
      if (!currentModel) { resolveCurrentModel(tree); }
      var item = function (id, name, enabled, note, models) {
        on[id] = enabled;
        var locked = isLockedItem({ models: models || [] });
        return { id: id, name: name, on: enabled, note: presetFlat(note), locked: locked };
      };
      var layerItems = function (list) {
        var out = [];
        for (var i = 0; i < (list || []).length; i++) {
          var e = list[i];
          if (!e || e.role2 === 'layer-locked' || !e.identifier) { continue; }
          out.push(item(e.identifier, e.name, e.enabled !== false, e.commentFlat, e.models));
        }
        return out;
      };
      var tabs = [];
      for (var ti = 0; ti < tree.tabs.length; ti++) {
        var t = tree.tabs[ti];
        if (t.kind === 'model') {
          var reg = (t.registryEntries || [])[0];
          var models = (t.cards || []).map(function (c) {
            var its = [];
            for (var k = 0; k < (c.items || []).length; k++) {
              var it = c.items[k], e = it.entry || {};
              if (!it.identifier || e.role2 === 'layer-locked') { continue; }
              its.push(item(it.identifier, it.name, e.enabled !== false, e.commentFlat, it.models));
            }
            if (c.emoji === currentModel) { model = c.name; }
            return { name: c.name, label: c.label, emoji: c.emoji, items: its };
          });
          tabs.push({ id: 'model', kind: 'model', name: t.displayName || t.name, order: ti, note: presetFlat((legendOf(tree)) || (reg && reg.commentFlat)), models: models });
          continue;
        }
        var vcs = [];
        for (var vi = 0; vi < (t.varCards || []).length; vi++) {
          var g = t.varCards[vi] || {}, ent = g.entry || {}, fields = [];
          for (var ci = 0; ci < (g.cards || []).length; ci++) {
            var c2 = g.cards[ci];
            if (!c2) { continue; }
            if (c2.type === 'range') {
              fields.push({ kind: 'range', keys: [c2.min.name, c2.max.name], values: [Number(c2.min.value), Number(c2.max.value)] });
              varIndex[c2.min.name] = { identifier: ent.identifier, value: String(c2.min.value) };
              varIndex[c2.max.name] = { identifier: ent.identifier, value: String(c2.max.value) };
              vars[c2.min.name] = Number(c2.min.value); vars[c2.max.name] = Number(c2.max.value);
            } else {
              fields.push({ kind: 'single', keys: [c2.name], values: [Number(c2.value)] });
              varIndex[c2.name] = { identifier: ent.identifier, value: String(c2.value) };
              vars[c2.name] = Number(c2.value);
            }
          }
          if (fields.length) { vcs.push({ name: String(ent.name || '').replace(/\s*\|\s*var\s*$/, ''), note: presetFlat(ent.commentFlat), fields: fields }); }
        }
        var groups = [];
        for (var gi = 0; gi < (t.cards || []).length; gi++) {
          var cd = t.cards[gi];
          var head = (t.region && t.region.cards && t.region.cards[gi] && t.region.cards[gi].head) || null;
          var gitems = layerItems(cd.items);
          if (gitems.length) { groups.push({ name: cd.name, mode: cd.mode === '单选' ? 'one' : 'any', note: presetFlat(head && head.commentFlat), items: gitems }); }
        }
        var own = layerItems(t.standaloneItems);
        if (vcs.length || own.length || groups.length) { tabs.push({ id: 'tab-' + ti, kind: 'layer', name: t.name, order: ti, vars: vcs, standalone: own, groups: groups }); }
      }
      var rank = function (x) { return x.kind === 'model' ? 0 : (x.vars && x.vars.length ? 1 : 2); };
      tabs.sort(function (a, b) { return rank(a) - rank(b) || a.order - b.order; });
      data = { ok: true, error: '', name: raw.preset.name, tabs: tabs, state: { on: on, vars: vars, model: model }, varIndex: varIndex };
    }
    presetCache = { ver: toolsVer, data: data };
    return data;
  }
  /* 一次写入成功之后：旧面板（如果开着）就地改卡、内存模型同步，再通知新界面 */
  function presetAfterCommit(pairs) {
    for (var i = 0; i < pairs.length; i++) {
      if (panelRoot) { paintItemAll(pairs[i].identifier, pairs[i].value); }
      syncModel(pairs[i].identifier, pairs[i].value);
    }
    renderStatus();
    toolsNotify();
  }
  function presetBridge() {
    return {
      version: function () { return toolsVer; },
      subscribe: function (fn) { toolsSubs.push(fn); return function () { toolsSubs = toolsSubs.filter(function (x) { return x !== fn; }); }; },
      copy: CUSTOM_STYLE_COPY,
      view: function () { var v = presetView(); return { ok: v.ok, error: v.error, name: v.name, tabs: v.tabs, state: v.state }; },
      reload: function () { refresh(false); toolsNotify(); },
      /* 与点旧面板的条目卡同一条规则：目标 = 现状取反；单选组打开一条时同组其它条关掉；运行模式两条带对话模式联动 */
      toggle: function (id, groupName) {
        var v = presetView();
        if (!v.ok) { return { ok: false, msg: v.error }; }
        var group = null, found = null, i, j, k;
        for (i = 0; i < v.tabs.length && !found; i++) {
          var t = v.tabs[i];
          var lists = [];
          (t.groups || []).forEach(function (g) { lists.push({ g: g, items: g.items }); });
          lists.push({ g: null, items: t.standalone || [] });
          (t.models || []).forEach(function (m) { lists.push({ g: null, items: m.items }); });
          for (j = 0; j < lists.length && !found; j++) {
            if (groupName && (!lists[j].g || lists[j].g.name !== groupName)) { continue; }
            for (k = 0; k < lists[j].items.length; k++) { if (lists[j].items[k].id === id) { found = lists[j].items[k]; group = lists[j].g; break; } }
          }
        }
        if (!found) { return { ok: false, msg: '预设里找不到这一条' }; }
        if (found.locked) { return { ok: false, msg: '这条是别的模型专属的，先在模型页选对应的模型' }; }
        var target = !v.state.on[id];
        var pairs = [{ identifier: id, value: target }];
        if (target && group && group.mode === 'one') {
          for (k = 0; k < group.items.length; k++) { if (group.items[k].id !== id && v.state.on[group.items[k].id]) { pairs.push({ identifier: group.items[k].id, value: false }); } }
        }
        try {
          if (isModeLayerEntry(id)) {
            var extra = isDialogModeEntry(id) ? enterDialogMode() : leaveDialogMode();
            for (var mi = 0; mi < extra.length; mi++) {
              if (!pairs.some(function (p) { return p.identifier === extra[mi].identifier; })) { pairs.push(extra[mi]); }
            }
            if (!isDialogModeEntry(id) && dialogSaved && extra.length) { dialogSaved = null; saveVars(); }
          }
        } catch (e0) { log('对话模式联动出错（不拦写入）：' + ((e0 && e0.message) || e0)); }
        var res = commit(pairs);
        if (!res.ok) { toolsNotify(); return { ok: false, msg: res.msg }; }
        presetAfterCommit(pairs);
        return { ok: true, on: target, pairs: pairs.length };
      },
      setVar: function (key, value) {
        var v = presetView(), ix = v.varIndex && v.varIndex[key];
        if (!ix) { return { ok: false, msg: '找不到变量 ' + key }; }
        if (String(value) === ix.value) { return { ok: true, changed: 0 }; }
        var r = commitVars([{ identifier: ix.identifier, name: key, old: ix.value, value: String(value) }]);
        if (r && r.ok) { refresh(false); }
        toolsNotify();
        return r;
      },
      selectModel: function (name) {
        var v = presetView(), mt = v.tabs.filter(function (t) { return t.kind === 'model'; })[0];
        var m = mt && (mt.models || []).filter(function (x) { return x.name === name; })[0];
        if (!m) { return { ok: false, msg: '找不到这个模型' }; }
        selectModel(m.emoji);
        toolsNotify();
        return { ok: currentModel === m.emoji };
      },
      customStyles: function (anchorCards) { return readCustomStyleState({ anchorCards: anchorCards || null }); },
      applyCustomStyles: function (req) {
        return Promise.resolve(applyCustomStyles(req)).then(function (r) { refresh(false); toolsNotify(); return r; },
          function (e) { toolsNotify(); return { ok: false, code: 'APPLY_FAIL', detail: (e && e.message) || String(e) }; });
      }
    };
  }
