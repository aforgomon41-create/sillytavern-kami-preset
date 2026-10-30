/* 新前端工具箱（05 号「🧪 工具箱」）用的读写桥。
   界面换成新运行库的 React 面板，逻辑与状态仍全部留在本脚本：桥只给纯数据快照（get）和动作，
   有变化时通知订阅者（renderContent / renderStatus / 搜索服务 / 手动搜索都会叫 bridgeNotify）。 */
  var bridgeSubs = [], bridgeVer = 0, bridgeQueued = false;
export function bridgeNotify() {
    bridgeVer++;
    if (bridgeQueued || !bridgeSubs.length) { return; }
    bridgeQueued = true;
    Promise.resolve().then(function () {
      bridgeQueued = false;
      var list = bridgeSubs.slice();
      for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) { } }
    });
  }
  function bridgeSubscribe(fn) {
    bridgeSubs.push(fn);
    return function () { bridgeSubs = bridgeSubs.filter(function (x) { return x !== fn; }); };
  }
  function bridgeGuard(p) {
    return Promise.resolve(p).then(function (r) { bridgeNotify(); return r; }, function (e) { toast('error', msgOf(e)); bridgeNotify(); return undefined; });
  }
  function compressBridge() {
    return {
      get: function () {
        var roll = rollInfo(), entry = summaryInfo(), len = chatLen();
        return {
          roll: roll.ok ? { ok: true, enabled: !!roll.enabled, depth: roll.minDepth } : { ok: false, error: String(roll.error || '') },
          grandOn: !!cfg.grandOn, threshold: cfg.threshold, keep: cfg.keep, chunk: cfg.chunk,
          pins: st.pins.slice(), maxFloor: Math.max(0, len - 1),
          blocks: st.blocks.map(function (b, i) { return { from: b.from, to: b.to, depth: (b.depth === null || b.depth === undefined) ? null : b.depth, text: b.text, suspect: st.suspect.indexOf(i) >= 0 }; }),
          pending: st.pending.map(function (p) { return { from: p.from, to: p.to }; }),
          orphans: st.orphan.length, error: st.error || null, notice: st.notice.slice(), lorebook: st.lbName || '',
          entry: entry.ok ? { ok: true, enabled: !!entry.enabled, name: entry.name } : { ok: false, error: String(entry.error || '') },
          measured: (measure.last && measure.last.total) || 0,
          pipeline: { running: !!pipeline.running, done: pipeline.done, total: pipeline.total },
          lastError: lastError
        };
      },
      setRoll: function (on) {
        var r = rollInfo();
        if (!r.ok) { toast('error', COPY.toasts.toggleFail.replace('{err}', r.error)); return Promise.resolve(); }
        if (!!r.enabled === !!on) { return Promise.resolve(); }
        return bridgeGuard(toggleMode('roll'));
      },
      setGrand: function (on) { if (!!cfg.grandOn === !!on) { return Promise.resolve(); } return bridgeGuard(toggleMode('grand')); },
      setNumber: function (key, value) { return bridgeGuard(applyNum(key, value, null)); },
      run: function () { return bridgeGuard(runPipeline('manual')); },
      unhideAll: function () { return bridgeGuard(unhideAll()); },
      clearData: function () { return bridgeGuard(clearChatData()); },
      addPin: function (n) { return bridgeGuard(addPin(String(n), false)); },
      removePin: function (n) { return bridgeGuard(addPin(String(n), true)); },
      refresh: function (reason) { return bridgeGuard(refreshState(reason || '手动刷新')); },
      repairOrphans: function () { return bridgeGuard(repairOrphans()); },
      setEntry: function (on) {
        var info = summaryInfo();
        if (!info.ok) { toast('error', info.error); return Promise.resolve(); }
        return bridgeGuard(writeSummaryEntry(!!on).then(function () { renderContent(); renderStatus(); }));
      }
    };
  }
  var compressLlmBridge = null;
  function toolboxBridge() {
    if (!compressLlmBridge) {
      compressLlmBridge = createKamiLlmBridge({ state: cfg, editor: compressLlmEditor, models: cachedModelList, fetch: fetchModelList,
        busy: function () { return fetchState === 'busy'; }, profiles: tavernCCProfiles });
    }
    var manual = null;
    if (SEARCH && MANUAL_SEARCH_UI) {
      manual = {
        llm: MANUAL_SEARCH_UI.llm(),
        lastTopic: MANUAL_SEARCH_UI.lastTopic,
        setShortcut: MANUAL_SEARCH_UI.setShortcut,
        search: function (topic) { return SEARCH.search(topic); },
        cancel: function (reason) { SEARCH.cancel(reason || '手动搜索已中断'); bridgeNotify(); },
        subscribeProgress: function (fn) { return SEARCH.subscribeProgress(fn); },
        status: function () { return SEARCH.status(); }
      };
    }
    return {
      version: function () { return bridgeVer; },
      subscribe: bridgeSubscribe,
      compress: compressBridge(),
      llm: compressLlmBridge,
      search: SEARCH && SEARCH.bridge ? SEARCH.bridge() : null,
      manual: manual,
      copy: COPY
    };
  }
