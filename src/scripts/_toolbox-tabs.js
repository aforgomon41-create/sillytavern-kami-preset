/* 工具箱入口与服务装配：界面由运行库的工具箱面板画（本脚本第二段「界面接线」），这里只留全局 API 与搜索服务。 */
  var toolboxTab = 'compress';
  var SEARCH = null, MANUAL_SEARCH_UI = null;
export function openToolbox(key) { if (key) { toolboxTab = key; } var n = nextUi(); if (n) { n.open(toolboxTab); } }
  function toggleToolbox() { togglePanel(); }

  function exposeToolbox() {
    var api = {
      open: openToolbox, close: closePanel, toggle: toggleToolbox,
      selectTab: function (key) { openToolbox(key); },
      status: function () { return { open: isOpen(), tab: toolboxTab, compression: status(), search: SEARCH ? SEARCH.status() : null }; },
      manualSearch: function () { if (MANUAL_SEARCH_UI) { MANUAL_SEARCH_UI.open(); } },
      bridge: function () { return toolboxBridge(); },
      shutdown: teardown
    };
    HOST.KamiToolbox = api;
    try { window.KamiToolbox = api; } catch (e) { }
  }

  function initToolboxServices() {
    if (typeof createKamiSearchService === 'function') {
      var taskBinding = createKamiSearchTaskBinding({ read: readRaw,
        mirror: function (raw, prompt, order) {
          var manager = raw.ctx.getPresetManager && raw.ctx.getPresetManager('openai');
          var data = manager && manager.getPresetList(), target = data && data.presets[Number(manager.getSelectedPreset())];
          if (!target) { return; }
          var prompts = target.prompts || (target.prompts = []), orders = pickOrder(target);
          var p = prompts.find(function (row) { return row.identifier === prompt.identifier; });
          var beforePrompt = p && { content: p.content, enabled: p.enabled }, addedPrompt = null, addedOrder = null;
          if (p) { p.content = prompt.content; p.enabled = prompt.enabled; } else { addedPrompt = JSON.parse(JSON.stringify(prompt)); prompts.push(addedPrompt); }
          if (orders) { var o = orders.order.find(function (row) { return row.identifier === order.identifier; }), beforeOrder = o && o.enabled; if (o) { o.enabled = order.enabled; } else { var at = orders.order.findIndex(function (row) { return row.identifier === 'prompt_1789213927315_4s0dsfk'; }); addedOrder = JSON.parse(JSON.stringify(order)); orders.order.splice(at < 0 ? orders.order.length : at + 1, 0, addedOrder); } }
          return function () {
            if (p && p !== prompt) { p.content = beforePrompt.content; p.enabled = beforePrompt.enabled; }
            if (addedPrompt) { prompts.splice(prompts.indexOf(addedPrompt), 1); }
            if (o && o !== order) { o.enabled = beforeOrder; }
            if (addedOrder) { orders.order.splice(orders.order.indexOf(addedOrder), 1); }
          };
        },
        save: function (raw) { if (typeof raw.ctx.saveSettingsDebounced !== 'function') { throw new Error('当前酒馆无法保存任务条目'); } raw.ctx.saveSettingsDebounced(); notifyPresetChanged(raw.ctx); }
      }, WEB_SEARCH_TASK_DEF);
      var searchEnv = {
        task: taskBinding, taskDefinition: WEB_SEARCH_TASK_DEF,
        providers: { list: webSearchProviders, get: webSearchProvider, endpoint: webSearchEndpoint, request: webSearchRequest, rows: webSearchRows },
        pure: { webSearchTaskGuide: webSearchTaskGuide, webSearchLimitFields: webSearchLimitFields, normalizeWebSearchLimits: normalizeWebSearchLimits, normalizeWebSearchManualSettings: normalizeWebSearchManualSettings, parseWebSearchJSON: parseWebSearchJSON, webSearchSource: webSearchSource, webSearchTag: webSearchTag,
          readWebSearchRecords: readWebSearchRecords, normalizeWebSearchRecord: normalizeWebSearchRecord, attachWebSearchRecord: attachWebSearchRecord },
        host: HOST, document: HDOC, context: stCtx, make: mk, changed: function () { bridgeNotify(); }, components: createKamiUi(HDOC),
        saveNotice: function () { renderStatus(); updateDef(); },
        profile: withTavernProfile, profiles: tavernCCProfiles,
        legacyConfigs: function () { return cfg.sumConfigs; },
        modelRequest: modelListRequest, responseText: responseTextOf,
        readVariables: function () { return typeof getVariables === 'function' ? getVariables({ type: 'script' }) || {} : {}; },
        writeVariables: function (data) { if (typeof replaceVariables === 'function') { replaceVariables(data, { type: 'script' }); } },
        headers: modelListHeaders, fetchUserHandle: kamiUserHandle,
        stamp: chatStamp, validStamp: sameChat,
        connections: function () {
          var choices = [{ value: '', label: '当前剧情连接' }];
          tavernCCProfiles().forEach(function (item) { choices.push({ value: 'profile:' + item.name, label: '酒馆：' + item.name }); });
          cfg.sumConfigs.forEach(function (item) { choices.push({ value: 'config:' + item.name, label: '已存自定义：' + item.name }); });
          return choices;
        },
        canRun: function () { return !pipeline.running; },
        count: countText,
        ui: { section: sectionCard, field: fieldRow, note: noteLine, text: textInput, select: selectRow },
        fold: function(title){var card=createKamiUi(HDOC).collapse({title:title});return {card:card,body:card.body};},
        openManual: function (trigger) { if (MANUAL_SEARCH_UI) { MANUAL_SEARCH_UI.open(trigger); } },
        mountManualSettings: function (container) { if (MANUAL_SEARCH_UI) { MANUAL_SEARCH_UI.mount(container); } },
        raw: async function (request, selection, guard) {
          function callRaw() { if (guard) { guard(); } return generateRaw(request); }
          if (typeof generateRaw !== 'function') { throw new Error('需要更新酒馆助手才能调用搜索模型'); }
          if (selection && typeof selection === 'object' && selection.custom_api) { request.custom_api = selection.custom_api; return withTavernProfile('', function () { return callRaw(); }); }
          if (selection && selection.indexOf('profile:') === 0) {
            if (!findTavernProfile(selection.slice(8))) { throw new Error('所选酒馆连接已不存在，请重新选择搜索模型'); }
            var result;
            await withTavernProfile(selection.slice(8), async function () { result = await callRaw(); });
            return result;
          }
          if (selection && selection.indexOf('config:') === 0) {
            var name = selection.slice(7), picked = null;
            for (var i = 0; i < cfg.sumConfigs.length; i++) { if (cfg.sumConfigs[i].name === name) { picked = cfg.sumConfigs[i]; break; } }
            if (!picked || !picked.apiurl || !picked.key || !picked.model) { throw new Error('所选自定义连接不存在或配置不完整，请在压缩页检查'); }
            request.custom_api = { apiurl: picked.apiurl, key: picked.key, model: picked.model, source: picked.source || 'custom' };
          }
          return withTavernProfile('', function () { return callRaw(); });
        },
        stopRaw: function (id) { if (typeof stopGenerationById === 'function') { stopGenerationById(id); } },
        createMessages: function (messages) { if (typeof createChatMessages !== 'function') { throw new Error('缺少聊天消息接口'); } return createChatMessages(messages); },
        writeMessages: function (messages) { if (typeof setChatMessages !== 'function') { throw new Error('缺少聊天消息更新接口'); } return setChatMessages(messages); },
        on: typeof eventOn === 'function' ? eventOn : null,
        events: typeof tavern_events !== 'undefined' ? tavern_events : {},
        toast: function (kind, message) { toast(kind, message, '网络搜索'); }
      };
      searchEnv.nativeProbe = createKamiNativeSearchProbe(Object.assign({}, searchEnv, {pipeline:function(){return kamiResponsePipeline(HOST);},transport:createKamiResponseTransport(),canRun:function(){if(pipeline.running)return false;var ctx=stCtx(),processor=ctx&&ctx.streamingProcessor;if(processor&&processor.isFinished===false)return false;var stop=HDOC.getElementById('mes_stop');return !stop||HOST.getComputedStyle(stop).display==='none';}}));
      SEARCH = createKamiSearchService(searchEnv);
      if (searchEnv.nativeProbe) { try { var offProbe = searchEnv.nativeProbe.subscribe(function () { bridgeNotify(); }); unsubs.push({ stop: offProbe }); } catch (e) { } }
    }
    MANUAL_SEARCH_UI = createKamiManualSearchUi({search:SEARCH,host:HOST,changed:function(){bridgeNotify();},document:HDOC,make:mk,copy:COPY,profiles:tavernCCProfiles,
      defaultTask:normalizeWebSearchManualSettings().llm.prompts.task,fetchModels:fetchLlmModelCatalog,ensureStyle:function(){},
      ui:{section:sectionCard,field:fieldRow,note:noteLine,text:textInput,select:selectRow},toast:function(kind,text){toast(kind,text,'手动搜索');}});
    MANUAL_SEARCH_UI.ping();
    var promptChanged = function (event) {
      var target = event.target;
      if (target && target.closest && target.closest('.prompt-manager-toggle-action, [id$="prompt_manager_popup_entry_form_save"]')) { HOST.setTimeout(function () { if (SEARCH && !disposed) { SEARCH.syncTask(); } }, 0); }
    };
    HDOC.addEventListener('click', promptChanged, true); unsubs.push({ stop: function () { HDOC.removeEventListener('click', promptChanged, true); } });
  }

  function disposeToolboxServices() {
    if (MANUAL_SEARCH_UI) { try { MANUAL_SEARCH_UI.dispose(); } catch (e) { } MANUAL_SEARCH_UI = null; }
    if (SEARCH) { try { SEARCH.shutdown(); } catch (e) { } SEARCH = null; }
    try { delete HOST.KamiToolbox; } catch (e3) { }
    try { delete window.KamiToolbox; } catch (e4) { }
  }
