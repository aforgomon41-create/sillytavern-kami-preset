/* 模型配置与提示词模板的共用写回逻辑。每个调用方传入独立状态，编辑不互相覆盖。 */
export function createKamiLlmSettingsController(env){
var cfg=env.state,COPY=env.copy,DEFAULT_TASK=env.defaultTask,MAX_PROMPT_ENTRIES=6;
var saveVars=env.save,renderContent=env.render,toast=env.toast,invalidateModelList=env.invalidate||function(){};
  function clonePromptList(list) {
    var out = [];
    for (var i = 0; i < (list || []).length; i++) { out.push({ role: list[i].role, content: list[i].content }); }
    return out;
  }
  /* 把「当前正在编辑的 prompts」拍一份快照（结构固定，写盘 / 比对都用它） */
  function snapPrompts() {
    return {
      head: clonePromptList(cfg.prompts.head),
      taskRole: cfg.prompts.taskRole,
      task: cfg.prompts.task,
      tail: clonePromptList(cfg.prompts.tail)
    };
  }
  function findTpl(name) {
    for (var i = 0; i < cfg.promptTpls.length; i++) {
      if (cfg.promptTpls[i].name === name) { return cfg.promptTpls[i]; }
    }
    return null;
  }
  function currentTpl() { return findTpl(cfg.promptTplCurrent); }
  /* 编辑即写回当前模板：不这样做的话，切到别的模板再切回来，刚才的编辑就没了
     （用户报「改动即时生效，无需保存」的那条约定要保住）。 */
  function syncCurrentTpl() {
    var t = currentTpl();
    if (!t) { return; }
    var snap = snapPrompts();
    t.head = snap.head; t.taskRole = snap.taskRole; t.task = snap.task; t.tail = snap.tail;
  }
  function currentSumConfig() {
    for (var i = 0; i < cfg.sumConfigs.length; i++) {
      if (cfg.sumConfigs[i].name === cfg.sumModel.current) { return cfg.sumConfigs[i]; }
    }
    return null;
  }
  function toggleModelMode(mode) {
    if (cfg.sumModel.mode === mode) { return; }
    cfg.sumModel.mode = (mode === 'custom') ? 'custom' : 'tavern';
    saveVars();
    renderContent();
  }
  function applyModelInput(field, value) {
    if (field === '__config') {   // 切换已存配置
      if (!currentSumConfig() || currentSumConfig().name !== value) {
        cfg.sumModel.current = value;
        saveVars();
        renderContent();
      }
      return;
    }
    if (field === '__pick') {   // 跟随酒馆：选「当前连接」或某套连接配置
      cfg.sumModel.tavernPick = String(value === undefined || value === null ? '' : value);
      saveVars();
      renderContent();
      return;
    }
    if (field === '__name') { return; }   // 名称框只给「存为新配置」用，不落值
    var cur = currentSumConfig();
    if (!cur) { return; }
    if (field === 'source') {
      cur.source = ['custom', 'openai', 'claude', 'makersuite', 'deepseek', 'xai', 'openrouter', 'azure_openai'].indexOf(value) >= 0 ? value : 'custom';
    } else if (field === 'apiurl' || field === 'key' || field === 'model') {
      cur[field] = String(value === undefined || value === null ? '' : value);
    }
    if (field === 'source' || field === 'apiurl' || field === 'key') { invalidateModelList(cur.name); }
    saveVars();   // 不重画：保住输入焦点
  }
  function saveConfigAs(name) {
    name = String(name || '').trim();
    if (!name) { toast('warning', COPY.model.nameMissing); return; }
    var cur = currentSumConfig();
    var src = cur || { source: 'custom', apiurl: '', key: '', model: '' };
    var exist = null;
    for (var i = 0; i < cfg.sumConfigs.length; i++) { if (cfg.sumConfigs[i].name === name) { exist = cfg.sumConfigs[i]; break; } }
    if (exist) {
      exist.source = src.source; exist.apiurl = src.apiurl; exist.key = src.key; exist.model = src.model;
    } else {
      cfg.sumConfigs.push({ name: name, source: src.source, apiurl: src.apiurl, key: src.key, model: src.model });
    }
    cfg.sumModel.current = name;
    saveVars();
    toast('success', COPY.model.saveDone.replace('{name}', name));
    renderContent();
  }
  function deleteCurrentConfig() {
    if (cfg.sumConfigs.length <= 1) { toast('warning', COPY.model.delLast); return; }
    var cur = currentSumConfig();
    if (!cur) { return; }
    cfg.sumConfigs = cfg.sumConfigs.filter(function (c) { return c.name !== cur.name; });
    if (cfg.sumModel.current === cur.name) { cfg.sumModel.current = cfg.sumConfigs[0].name; }
    invalidateModelList(cur.name);
    saveVars();
    toast('success', COPY.model.delDone.replace('{name}', cur.name));
    renderContent();
  }
  function applyPromptChange(list, pi, pf, value) {
    if (list === 'task') {
      if (pf === 'content') { cfg.prompts.task = String(value === undefined || value === null ? '' : value); }
      else if (pf === 'role' && ['system', 'user', 'assistant'].indexOf(value) >= 0) { cfg.prompts.taskRole = value; }
    } else if (list === 'head' || list === 'tail') {
      var it = cfg.prompts[list][pi];
      if (!it) { return; }
      if (pf === 'content') { it.content = String(value === undefined || value === null ? '' : value); }
      else if (pf === 'role' && ['system', 'user', 'assistant'].indexOf(value) >= 0) { it.role = value; }
    }
    syncCurrentTpl();
    saveVars();
  }
  function addPromptEntry(list) {
    if (list !== 'head' && list !== 'tail') { return; }
    if (cfg.prompts[list].length >= MAX_PROMPT_ENTRIES) { toast('warning', COPY.toasts.tooMany.replace('{n}', MAX_PROMPT_ENTRIES)); return; }
    cfg.prompts[list].push({ role: 'system', content: '' });
    syncCurrentTpl();
    saveVars();
    renderContent();
  }
  function removePromptEntry(list, idx) {
    if ((list !== 'head' && list !== 'tail') || !cfg.prompts[list][idx]) { return; }
    cfg.prompts[list].splice(idx, 1);
    syncCurrentTpl();
    saveVars();
    renderContent();
  }
  function resetTask() {
    cfg.prompts.task = DEFAULT_TASK;
    cfg.prompts.taskRole = 'system';
    syncCurrentTpl();
    saveVars();
    renderContent();
  }

  /* ── 摘要提示词模板（v1.1）──
     与「大总结模型」的多配置同构：下拉切换 + 名称框 + 存为新模板 + 删除当前模板。
     切换 = 把模板的四个字段拷回 cfg.prompts 再重画面板（结构变了必须重画）；
     切换前先把当前这套同步回它自己的快照，免得正在编辑的内容被切掉。 */
  function switchPromptTpl(name) {
    if (name === cfg.promptTplCurrent) { return; }
    var t = findTpl(name);
    if (!t) { return; }
    syncCurrentTpl();
    cfg.promptTplCurrent = name;
    cfg.prompts.head = clonePromptList(t.head);
    cfg.prompts.taskRole = t.taskRole;
    cfg.prompts.task = t.task;
    cfg.prompts.tail = clonePromptList(t.tail);
    saveVars();
    renderContent();
  }
  function savePromptTplAs(name) {
    name = String(name || '').trim();
    if (!name) { toast('warning', COPY.prompts.tplNameMissing); return; }
    syncCurrentTpl();
    var snap = snapPrompts();
    var exist = findTpl(name);
    if (exist) {
      exist.head = snap.head; exist.taskRole = snap.taskRole; exist.task = snap.task; exist.tail = snap.tail;
    } else {
      snap.name = name;
      cfg.promptTpls.push(snap);
    }
    cfg.promptTplCurrent = name;
    saveVars();
    toast('success', COPY.prompts.tplSaved.replace('{name}', name));
    renderContent();
  }
  function deletePromptTpl() {
    if (cfg.promptTpls.length <= 1) { toast('warning', COPY.prompts.tplDelLast); return; }
    var cur = currentTpl();
    if (!cur) { return; }
    cfg.promptTpls = cfg.promptTpls.filter(function (t) { return t.name !== cur.name; });
    cfg.promptTplCurrent = cfg.promptTpls[0].name;
    var t2 = currentTpl();
    cfg.prompts.head = clonePromptList(t2.head);
    cfg.prompts.taskRole = t2.taskRole;
    cfg.prompts.task = t2.task;
    cfg.prompts.tail = clonePromptList(t2.tail);
    saveVars();
    toast('success', COPY.prompts.tplDeleted.replace('{name}', cur.name));
    renderContent();
  }


return {mode:toggleModelMode,modelInput:applyModelInput,saveConfig:saveConfigAs,deleteConfig:deleteCurrentConfig,promptChange:applyPromptChange,addPrompt:addPromptEntry,removePrompt:removePromptEntry,resetTask:resetTask,switchTemplate:switchPromptTpl,saveTemplate:savePromptTplAs,deleteTemplate:deletePromptTpl,currentConfig:currentSumConfig,currentTemplate:currentTpl,snapshot:snapPrompts,syncCurrent:syncCurrentTpl,cloneList:clonePromptList};
}
