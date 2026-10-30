/* 新前端工具箱（05 号「🧪 工具箱」）的「其他功能」与「更新」两页用的读写桥。
   状态（标签处理档位、常驻指令、继承记录）与逻辑仍留在本脚本；桥只给数据快照、动作和变化通知。 */
  var toolsSubs = [], toolsVer = 0, toolsQueued = false;
export function toolsNotify() {
    toolsVer++;
    if (toolsQueued || !toolsSubs.length) { return; }
    toolsQueued = true;
    Promise.resolve().then(function () {
      toolsQueued = false;
      var list = toolsSubs.slice();
      for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) { } }
    });
  }
  function tagFixStatText() {
    if (!tagFixStat.fixed) { return TAGFIX_COPY.statNone; }
    return '已处理 ' + tagFixStat.fixed + ' 楼（最近：第 ' + (tagFixStat.lastFloor + 1) + ' 楼 ' + tagFixStat.lastText + '）';
  }
  /* 「继承」结果的一句人话（与 InheritCardView 里那段同一口径） */
  function inheritSummaryText(r, w) {
    var rep = (r && r.report) || {};
    var kinds = { prompts: '条目内容', prompt_order: '条目开关与顺序', extensions: '脚本设置与正则开关' };
    var names = [];
    for (var i = 0; i < ((w && w.changed) || []).length; i++) { names.push(kinds[w.changed[i]] || w.changed[i]); }
    var s = INHERIT_COPY.done + '（从「' + r.oldName + '」搬来：' + (names.join('、') || '没有变化') + '；先备份成「' + r.backupName + '」）';
    s += rep.conflicts > 0
      ? (' ' + INHERIT_COPY.asked.replace('{n}', String(rep.conflicts)) + '（保留旧预设 ' + (rep.decidedMine || 0) + ' / 用现在这份 ' + (rep.decidedNext || 0) + '）')
      : (' ' + INHERIT_COPY.noAsk);
    if (w && w.sel && w.sel.checked && !w.sel.ok) { s += ' ' + INHERIT_COPY.selFailed; }
    else if (w && w.sel && w.sel.moved && w.sel.ok) { s += ' ' + INHERIT_COPY.selMoved; }
    return s;
  }
  var tagPlanSeq = 0, tagPlan = null;
  function toolsBridge() {
    return {
      version: function () { return toolsVer; },
      subscribe: function (fn) { toolsSubs.push(fn); return function () { toolsSubs = toolsSubs.filter(function (x) { return x !== fn; }); }; },
      copy: { tag: TAGFIX_COPY, god: GODCMD_COPY, exp: EXPORT_NOTICE, inherit: INHERIT_COPY, modes: TAGFIX_MODES.map(function (m) { return { id: m.id, label: m.label }; }) },
      get: function () {
        var g = readGodCmd();
        return {
          tag: { mode: tagFixMode, all: !!tagFixAll, custom: tagFixCustom.join(' '), stat: tagFixStatText(), api: !!tagFixApiReady() },
          god: { on: !!g.on, text: g.text }
        };
      },
      setTagMode: function (id) { setTagFixMode(id); toolsNotify(); },
      setTagAll: function (on) { setTagFixAll(on); toolsNotify(); },
      setTagCustom: function (text) { var l = setTagFixCustom(text); toolsNotify(); return l.join(' '); },
      /* 手动处理分两步：先扫（不写）→ 界面里列给用户确认 → 再写。扫描结果带一个序号，写之前核对楼层没变 */
      scanTag: function () {
        if (disposed) { return { ok: false, message: '脚本已关闭' }; }
        if (tagFixMode === 'off') { return { ok: false, message: TAGFIX_COPY.modeHint }; }
        if (!tagFixApiReady()) { return { ok: false, message: TAGFIX_COPY.needApi }; }
        var idx = currentFloorId();
        var m = idx < 0 ? null : chatMsgAt(idx);
        if (!m) { return { ok: false, message: TAGFIX_COPY.noFloor }; }
        var res = tagFixText(m.message);
        if (!res) { tagPlan = null; return { ok: true, nothing: true, message: TAGFIX_COPY.nothing }; }
        var rows = describeChanges(res, 8), groups = { close: [], remove: [], reference: [] };
        for (var i = 0; i < rows.length; i++) {
          var k = rows[i].kind === 'close' ? 'close' : rows[i].kind === 'reference' ? 'reference' : 'remove';
          groups[k].push({ text: String(rows[i].text), label: String(rows[i].label || '') });
        }
        tagPlan = { seq: ++tagPlanSeq, idx: idx, before: m.message, res: res, stamp: tagFixChatStamp() };
        var out = [];
        if (groups.close.length) { out.push({ lead: TAGFIX_COPY.closeLead, rows: groups.close }); }
        if (groups.remove.length) { out.push({ lead: TAGFIX_COPY.removeLead, rows: groups.remove }); }
        if (groups.reference.length) { out.push({ lead: TAGFIX_COPY.referenceLead, rows: groups.reference }); }
        return { ok: true, token: tagPlan.seq, floor: idx + 1, groups: out, stray: (res.strayLeft && res.strayLeft.length) || 0 };
      },
      applyTag: async function (token) {
        var p = tagPlan;
        tagPlan = null;
        if (!p || p.seq !== token || disposed) { toast('warning', '这条消息已变化，请重新处理'); return false; }
        if (!tagFixSameChat(p.stamp, tagFixChatStamp())) { toast('warning', '聊天已切换，请重新处理'); return false; }
        try {
          var latest = chatMsgAt(p.idx);
          if (!latest || latest.message !== p.before) { toast('warning', '这条消息已变化，请重新处理'); return false; }
          await setChatMessages([{ message_id: p.idx, message: p.res.text }], { refresh: 'affected' });
          tagFixStat.fixed++;
          tagFixStat.lastFloor = p.idx;
          tagFixStat.lastText = describeFix(p.res);
          paintTagFixStat();
          toast('success', TAGFIX_COPY.confirmDone);
          log('手动处理第 ' + p.idx + ' 楼：' + tagFixStat.lastText);
          return true;
        } catch (e) {
          toast('error', TAGFIX_COPY.confirmFail + ((e && e.message) || e));
          return false;
        } finally { toolsNotify(); }
      },
      setGod: function (on) { var r = toggleGodCmd(!!on); toolsNotify(); return r; },
      setGodText: function (text) { setGodCmdText(text); if (!String(text || '').replace(/\s/g, '') && readGodCmd().on) { godVarWrite(VAR_GODCMD_ON, '0'); } toolsNotify(); },
      /* 导出：分片清洗（每片约 60ms，片间让出主线程），onProgress(i, n) 报进度；结果是一句人话 */
      exportChat: function (from, to, aiOnly, onProgress) {
        return new Promise(function (resolve) {
          var ctx = stCtx();
          if (!ctx) { resolve({ ok: false, text: exportErrorText('NO_CTX') }); return; }
          var chat = ctx.chat || [];
          var plan = planExport(chat, String(from == null ? '' : from), String(to == null ? '' : to), !!aiOnly);
          if (!plan.ok) { resolve({ ok: false, text: exportErrorText(plan.code, plan) }); return; }
          var picks = plan.picks, i = 0;
          function step() {
            var t0 = Date.now();
            while (i < picks.length && (Date.now() - t0) < 60) { picks[i].text = exportCleanOne(ctx, chat[picks[i].index], picks[i]); i++; }
            try { if (onProgress) { onProgress(i, picks.length); } } catch (e) { }
            if (i < picks.length) { setTimeout(step, 0); return; }
            var text = buildExportText(picks, !aiOnly);
            if (!text) { resolve({ ok: false, text: exportErrorText('EMPTY_RESULT') }); return; }
            var name = exportFileName(plan.from, plan.to);
            var skipped = plan.skippedSystem ? ('，跳过 ' + plan.skippedSystem + ' 条隐藏消息') : '';
            if (plan.noContent) { skipped += '，其中 ' + plan.noContent + ' 条没有 content 块（按整条清洗）'; }
            try { downloadTextFile(name, text); } catch (e) { resolve({ ok: false, text: '下载失败：' + ((e && e.message) || e) }); return; }
            var sizeText = text.length >= 1024 ? (Math.round(text.length / 1024) + ' KB') : (text.length + ' 字');
            log('导出纯净正文：' + name + ' 楼层 ' + plan.from + '-' + plan.to + '/' + plan.total + ' 条数 ' + picks.length + ' 字符 ' + text.length);
            resolve({ ok: true, text: '已导出 ' + name + '（' + picks.length + ' 条' + skipped + '，' + sizeText + '）' });
          }
          step();
        });
      }
    };
  }
  function updateBridge() {
    return {
      version: function () { return toolsVer; },
      subscribe: function (fn) { toolsSubs.push(fn); return function () { toolsSubs = toolsSubs.filter(function (x) { return x !== fn; }); }; },
      copy: INHERIT_COPY,
      get: function () {
        var api = kamiUpdateApi(), snap = null;
        try { snap = api ? api.status() : null; } catch (e) { snap = null; }
        var pv = presetVersionOf(presetNameNow());
        var repo = '「🔄 远程更新」脚本没在运行';
        if (snap) { repo = (snap.repo && snap.repo.configured) ? (snap.repo.owner + '/' + snap.repo.repo) : '还没配置仓库'; }
        return {
          rows: [
            ['酒馆版本', tavernVersionText() || '读不到'],
            ['酒馆助手', callGlobal('getTavernHelperVersion') || '读不到'],
            ['预设版本', (pv ? (pv.date ? (pv.label + '（' + pv.date + '）') : pv.label) : '名称里认不出编号') + (BUILD_N ? (' · 构建 ' + BUILD_N) : '')]
          ],
          running: !!api, repo: repo, lastChecked: (snap && snap.lastCheckedAt) || '',
          busy: !!(snap && snap.busy),
          inheritFrom: inheritFromName || '', inheritAt: inheritAtText || ''
        };
      },
      check: function () {
        var api = kamiUpdateApi();
        if (!api) { return Promise.resolve('「🔄 远程更新」脚本没在运行，检查不了'); }
        log('手动检查更新（KamiUpdate.check(true)）');
        return Promise.resolve(api.check(true)).then(function (r) { toolsNotify(); return updateResultText(r); },
          function (e) { toolsNotify(); return '检查失败：' + ((e && e.message) || e); });
      },
      presets: function () { var api = kamiUpdateApi(); try { return (api && api.otherPresetNames()) || { names: [], current: '' }; } catch (e) { return { names: [], current: '' }; } },
      isKami: function (name) { var api = kamiUpdateApi(); try { return !api || api.isKamiName(name) === true; } catch (e) { return true; } },
      inherit: function (name) {
        var api = kamiUpdateApi();
        if (!api) { return Promise.resolve({ ok: false, text: INHERIT_COPY.degrade }); }
        var p;
        try { p = api.inheritFrom(name); } catch (e) { p = Promise.reject(e); }
        return Promise.resolve(p).then(function (r) {
          if (!r || !r.ok) {
            if (r && r.cancelled) { return { ok: false, text: '你在裁决页里没有完成，这次什么都不会写。' }; }
            return { ok: false, text: INHERIT_COPY.failHead + ((r && r.msg) || '没拿到结果') };
          }
          var w = applyInheritedToLive(r.merged, r.targetName);
          if (!w.ok) { return { ok: false, text: INHERIT_COPY.failHead + w.msg }; }
          inheritFromName = r.oldName || '';
          inheritAtText = nowText();
          saveVars();
          toast('success', '已从「' + r.oldName + '」继承设置，立刻生效');
          return { ok: true, text: inheritSummaryText(r, w) };
        }, function (e) { return { ok: false, text: INHERIT_COPY.failHead + ((e && e.message) || e) }; })
          .then(function (out) { toolsNotify(); return out; });
      }
    };
  }
