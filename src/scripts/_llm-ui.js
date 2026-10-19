function kamiLlmElement(doc,tag){return typeof createKamiUi==='function'?createKamiUi(doc).element(tag):doc.createElement(tag);}
/* 压缩和手动搜索共用模型选择与头/任务/尾模板编辑。仅文案、状态和事件作用域不同。 */
function scopeKamiLlmCard(card,scope){
  card.setAttribute('data-kami-llm-scope',scope||'compress');
  if(scope==='manual')for(var node of card.querySelectorAll('*'))for(var name of ['act','mi','pt','prompt','pi','pf','model-mode']){var old='data-kami-'+name;if(node.hasAttribute(old)){node.setAttribute('data-search-llm-'+name,node.getAttribute(old));node.removeAttribute(old);}}
  return card;
}
export function renderKamiLlmModel(env){
var cfg=env.state,COPY=env.copy,mk=env.make,HDOC=env.document,sectionCard=env.section,fieldRow=env.field,noteLine=env.note,textInput=env.text,selectRow=env.select;
var tavernCCProfiles=env.profiles,currentSumConfig=env.currentConfig,cachedModelList=env.models,fetchState=env.fetchState||'idle';
    var sec4 = sectionCard(COPY.model.section);
    var mRow = mk('div', 'kami-items');
    var bTavern = mk('button', 'kami-item kami-card' + (cfg.sumModel.mode !== 'custom' ? ' is-on' : ''));
    bTavern.type = 'button';
    bTavern.setAttribute('role', 'button');
    bTavern.setAttribute('data-kami-model-mode', 'tavern');
    bTavern.setAttribute('aria-pressed', cfg.sumModel.mode !== 'custom' ? 'true' : 'false');
    bTavern.setAttribute('aria-label', COPY.model.tavern);
    bTavern.appendChild(mk('span', 'kami-item-main', COPY.model.tavern));
    mRow.appendChild(bTavern);
    var bCustom = mk('button', 'kami-item kami-card' + (cfg.sumModel.mode === 'custom' ? ' is-on' : ''));
    bCustom.type = 'button';
    bCustom.setAttribute('role', 'button');
    bCustom.setAttribute('data-kami-model-mode', 'custom');
    bCustom.setAttribute('aria-pressed', cfg.sumModel.mode === 'custom' ? 'true' : 'false');
    bCustom.setAttribute('aria-label', COPY.model.custom);
    bCustom.appendChild(mk('span', 'kami-item-main', COPY.model.custom));
    mRow.appendChild(bCustom);
    sec4.body.appendChild(mRow);
    if (cfg.sumModel.mode !== 'custom') {
      /* 跟随酒馆：默认用当前连接，也可以直接点选酒馆里已存的连接配置——
         不复制、不落地，请求时按那套配置临时转一下即可。 */
      var profiles = tavernCCProfiles();
      var opts = [['', COPY.model.pickCurrent]];
      for (var pi = 0; pi < profiles.length; pi++) {
        opts.push([profiles[pi].name, profiles[pi].name + (profiles[pi].model ? ('（' + profiles[pi].model + '）') : '')]);
      }
      selectRow(sec4.body, COPY.model.pickLabel, opts, cfg.sumModel.tavernPick, { 'data-kami-mi': '__pick' });
      if (!profiles.length) { noteLine(sec4.body, COPY.model.pickNone); }
      noteLine(sec4.body, COPY.model.pickHint);
      noteLine(sec4.body, COPY.model.pickProxyNote);
    } else {
      if (!cfg.sumConfigs.length) {
        cfg.sumConfigs.push({ name: '默认', source: 'custom', apiurl: '', key: '', model: '' });
        cfg.sumModel.current = '默认';
      }
      if (!currentSumConfig()) { cfg.sumModel.current = cfg.sumConfigs[0].name; }
      var cur = currentSumConfig();
      var cfgOpts = [];
      for (var ci = 0; ci < cfg.sumConfigs.length; ci++) { cfgOpts.push([cfg.sumConfigs[ci].name, cfg.sumConfigs[ci].name]); }
      selectRow(sec4.body, COPY.model.cfgLabel, cfgOpts, cfg.sumModel.current, { 'data-kami-mi': '__config' });
      var srcOpts = [];
      for (var si = 0; si < COPY.model.sources.length; si++) { srcOpts.push([COPY.model.sources[si].v, COPY.model.sources[si].n]); }
      selectRow(sec4.body, COPY.model.sourceLabel, srcOpts, cur.source, { 'data-kami-mi': 'source' });
      noteLine(sec4.body, COPY.model.sourceHint);
      textInput(sec4.body, COPY.model.apiUrlLabel, cur.apiurl, { 'data-kami-mi': 'apiurl', type: 'text', placeholder: 'https://…/v1' }, COPY.model.apiUrlHint);
      textInput(sec4.body, COPY.model.keyLabel, cur.key, { 'data-kami-mi': 'key', type: 'password' }, COPY.model.keyHint);
      textInput(sec4.body, COPY.model.modelLabel, cur.model, { 'data-kami-mi': 'model', type: 'text' }, COPY.model.modelHint);
      /* 模型列表（点「获取模型列表」后多出一行，选中即回填模型名） */
      var ml = cachedModelList(cur);
      if (ml && ml.length) {
        var mlOpts = [[cur.model, cur.model ? cur.model : COPY.model.fetchPick]];
        for (var mi = 0; mi < ml.length; mi++) { if (ml[mi] !== cur.model) { mlOpts.push([ml[mi], ml[mi]]); } }
        selectRow(sec4.body, COPY.model.pickModelLabel, mlOpts, cur.model, { 'data-kami-mi': 'model' });
      }
      var bFetch = mk('button', 'kami-btn kami-btn--ghost', fetchState === 'busy' ? COPY.model.fetching : COPY.model.fetchModels);
      bFetch.type = 'button';
      bFetch.setAttribute('data-kami-act', 'fetch-models');
      if (fetchState === 'busy') { bFetch.setAttribute('disabled', '1'); }
      sec4.body.appendChild(bFetch);
      /* 存为新配置：名称行（名称框 + 两个按钮） */
      var nameRow = fieldRow(sec4.body, COPY.model.namePh, null);
      nameRow.setAttribute('data-kami-role', 'name-row');
      var nameInput = kamiLlmElement(HDOC,'input');
      nameInput.className = 'kami-text';
      nameInput.type = 'text';
      nameInput.setAttribute('data-kami-mi', '__name');
      nameInput.placeholder = COPY.model.namePh;
      nameRow.appendChild(nameInput);
      var bSaveAs = mk('button', 'kami-btn kami-btn--ghost', COPY.model.saveAs);
      bSaveAs.type = 'button';
      bSaveAs.setAttribute('data-kami-act', 'config-save-as');
      nameRow.appendChild(bSaveAs);
      var bDelCfg = mk('button', 'kami-btn kami-btn--ghost', COPY.model.delBtn);
      bDelCfg.type = 'button';
      bDelCfg.setAttribute('data-kami-act', 'config-del');
      nameRow.appendChild(bDelCfg);
    }
    noteLine(sec4.body, COPY.model.note);
    noteLine(sec4.body, COPY.model.customHint);

scopeKamiLlmCard(sec4.card,env.scope);return sec4;
}
export function renderKamiLlmPrompts(env){
var cfg=env.state,COPY=env.copy,mk=env.make,HDOC=env.document,sectionCard=env.section,fieldRow=env.field,noteLine=env.note,textInput=env.text,selectRow=env.select;
var snapPrompts=env.snapshot,currentTpl=env.currentTemplate;
  /* 提示词条目里的角色下拉（带头/尾条目序号，改哪条就是哪条） */
  function roleSelect(value, list, idx) {
    var sel = kamiLlmElement(HDOC,'select');
    sel.className = 'kami-select';
    sel.setAttribute('data-kami-prompt', list);
    sel.setAttribute('data-kami-pi', String(idx));
    sel.setAttribute('data-kami-pf', 'role');
    sel.setAttribute('aria-label', COPY.prompts.roleLabel);
    var opts = [['system', COPY.prompts.roleSystem], ['user', COPY.prompts.roleUser], ['assistant', COPY.prompts.roleChar]];
    for (var i = 0; i < opts.length; i++) {
      var op = kamiLlmElement(HDOC,'option');
      op.value = opts[i][0];
      op.textContent = opts[i][1];
      if (opts[i][0] === value) { op.selected = true; }
      sel.appendChild(op);
    }
    return sel;
  }
  /* 多行文本框：类名 = 契约 §4.2 的 `.kami-textarea`（尺寸由 LAYOUT_CSS 管） */
  function promptTextarea(list, idx) {
    var ta = kamiLlmElement(HDOC,'textarea');
    ta.className = 'kami-textarea';
    ta.setAttribute('data-kami-prompt', list);
    ta.setAttribute('data-kami-pi', String(idx));
    ta.setAttribute('data-kami-pf', 'content');
    ta.value = (list === 'task') ? cfg.prompts.task : (cfg.prompts[list][idx] ? cfg.prompts[list][idx].content : '');
    return ta;
  }
  /* 头/尾的一个条目：角色行（.kami-field）+ 内容域 */
  function promptEntry(parent, list, idx) {
    var row = fieldRow(parent, COPY.prompts.roleLabel, null);
    row.appendChild(roleSelect(cfg.prompts[list][idx].role, list, idx));
    var bDel = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.removeEntry);
    bDel.type = 'button';
    bDel.setAttribute('data-kami-act', 'prompt-del');
    bDel.setAttribute('data-kami-prompt', list);
    bDel.setAttribute('data-kami-pi', String(idx));
    row.appendChild(bDel);
    parent.appendChild(promptTextarea(list, idx));
  }
  function promptEditor(parent, list, title) {
    parent.appendChild(mk('div', 'kami-card-title', title));
    for (var i = 0; i < cfg.prompts[list].length; i++) { promptEntry(parent, list, i); }
    var bAdd = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.addEntry);
    bAdd.type = 'button';
    bAdd.setAttribute('data-kami-act', 'prompt-add');
    bAdd.setAttribute('data-kami-prompt', list);
    parent.appendChild(bAdd);
  }

    var sec7 = sectionCard(COPY.prompts.section);
    noteLine(sec7.body, COPY.prompts.hint);
    /* 模板行：下拉切换 + 名称 + 存为新模板 + 删除当前模板（与 sec4「大总结模型」同构）。
       兜底同 sec4：列表为空时先塞一条，指针失效时指回第一条。 */
    if (!cfg.promptTpls.length) {
      var seed = snapPrompts();
      seed.name = COPY.prompts.tplDefaultName;
      cfg.promptTpls.push(seed);
    }
    if (!currentTpl()) { cfg.promptTplCurrent = cfg.promptTpls[0].name; }
    var tplOpts = [];
    for (var ti = 0; ti < cfg.promptTpls.length; ti++) { tplOpts.push([cfg.promptTpls[ti].name, cfg.promptTpls[ti].name]); }
    selectRow(sec7.body, COPY.prompts.tplLabel, tplOpts, cfg.promptTplCurrent, { 'data-kami-pt': '__tpl' });
    var tplRow = fieldRow(sec7.body, COPY.prompts.tplNamePh, null);
    tplRow.setAttribute('data-kami-role', 'name-row');
    var tplInput = kamiLlmElement(HDOC,'input');
    tplInput.className = 'kami-text';
    tplInput.type = 'text';
    tplInput.setAttribute('data-kami-pt', '__name');
    tplInput.placeholder = COPY.prompts.tplNamePh;
    tplRow.appendChild(tplInput);
    var bTplSave = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.tplSaveAs);
    bTplSave.type = 'button';
    bTplSave.setAttribute('data-kami-act', 'tpl-save-as');
    tplRow.appendChild(bTplSave);
    var bTplDel = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.tplDel);
    bTplDel.type = 'button';
    bTplDel.setAttribute('data-kami-act', 'tpl-del');
    tplRow.appendChild(bTplDel);
    noteLine(sec7.body, COPY.prompts.tplHint);
    promptEditor(sec7.body, 'head', COPY.prompts.head);
    sec7.body.appendChild(mk('div', 'kami-card-title', COPY.prompts.task));
    var taskRow = fieldRow(sec7.body, COPY.prompts.roleLabel, null);
    taskRow.appendChild(roleSelect(cfg.prompts.taskRole, 'task', 0));
    var bReset = mk('button', 'kami-btn kami-btn--ghost', COPY.prompts.reset);
    bReset.type = 'button';
    bReset.setAttribute('data-kami-act', 'task-reset');
    taskRow.appendChild(bReset);
    sec7.body.appendChild(promptTextarea('task', 0));
    promptEditor(sec7.body, 'tail', COPY.prompts.tail);

scopeKamiLlmCard(sec7.card,env.scope);return sec7;
}
