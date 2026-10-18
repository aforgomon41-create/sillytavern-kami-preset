/* 其他功能页复用现有标签修复、常驻指令和导出控件；状态仍由预设设置脚本持有。 */
export function renderToolboxTab(pane) {
    tagFixEls = null;

    /* ① 自动标签处理。屏幕上只留短标签；说明全部折叠进 ⓘ（用户 2026-09-30 裁定）。 */
    var box = mk('div', 'kami-card kami-collapse');
    box.setAttribute('data-kami-open', '0');   /* 默认折叠（契约 §4.3；首版不持久化，每次进页都是收起的） */
    var head = mk('div', 'kami-card-head kami-head kami-collapse-head');
    head.setAttribute('data-kami-collapse-head', '1');
    head.appendChild(mk('span', 'kami-chev', '▸'));
    head.appendChild(mk('span', 'kami-card-title', TAGFIX_COPY.title));
    head.appendChild(noteMark(TAGFIX_COPY.note));          /* ⓘ 与预设条目的注释同一套结构 */
    var chip = mk('span', 'kami-chip', tagFixChipText());
    head.appendChild(chip);
    box.appendChild(head);

    var noteBox = noteText(TAGFIX_COPY.note);
    noteBox.hidden = true;
    box.appendChild(noteBox);

    var body = mk('div', 'kami-card-body kami-collapse-body');

    /* 三档：关闭 / 补全 / 删除 */
    var rowMode = mk('div', 'kami-field');
    rowMode.appendChild(mk('span', 'kami-field-label', TAGFIX_COPY.modeLabel));
    var valMode = mk('span', 'kami-field-value');
    var seg = mk('div', 'kami-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', TAGFIX_COPY.title);
    for (var i = 0; i < TAGFIX_MODES.length; i++) {
      var on = TAGFIX_MODES[i].id === tagFixMode;
      var b = mk('button', 'kami-seg-item' + (on ? ' is-on' : ''), TAGFIX_MODES[i].label);
      b.type = 'button';
      b.setAttribute('data-kami-tagfix', TAGFIX_MODES[i].id);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      seg.appendChild(b);
    }
    valMode.appendChild(seg);
    rowMode.appendChild(valMode);
    body.appendChild(rowMode);
    body.appendChild(mk('div', 'kami-card-note', TAGFIX_COPY.modeHint));

    /* 覆盖模式：登记表之外的标签也按当前档位处理（HTML 自带标签除外）。
       控件照抄「常驻附加指令」那张卡的 .kami-switch 写法（契约 §4.2，不新增类名与令牌）。 */
    var rowAll = mk('div', 'kami-field');
    rowAll.appendChild(mk('span', 'kami-field-label', TAGFIX_COPY.allLabel));
    var valAll = mk('span', 'kami-field-value');
    var swAll = mk('label', 'kami-switch');
    var allOn = mk('input', 'kami-switch-input');
    allOn.type = 'checkbox';
    allOn.setAttribute('data-kami-tagfix-all', '1');
    allOn.setAttribute('aria-label', TAGFIX_COPY.allLabel);
    allOn.checked = !!tagFixAll;
    var allTrack = mk('span', 'kami-switch-track');
    allTrack.appendChild(mk('span', 'kami-switch-knob'));
    swAll.appendChild(allOn); swAll.appendChild(allTrack);
    valAll.appendChild(swAll);
    rowAll.appendChild(valAll);
    body.appendChild(rowAll);
    body.appendChild(mk('div', 'kami-card-note', TAGFIX_COPY.allHint));

    /* 自定义标签：用户自己往里填，逗号 / 空格 / 换行都算分隔 */
    var rowCus = mk('div', 'kami-field');
    rowCus.appendChild(mk('span', 'kami-field-label', TAGFIX_COPY.customLabel));
    var valCus = mk('span', 'kami-field-value');
    var inp = mk('input', 'kami-text');
    inp.type = 'text';
    inp.setAttribute('data-kami-tagfix-custom', '1');
    inp.setAttribute('placeholder', TAGFIX_COPY.customHint);
    inp.setAttribute('aria-label', TAGFIX_COPY.customLabel);
    inp.value = tagFixCustom.join(' ');
    valCus.appendChild(inp);
    rowCus.appendChild(valCus);
    body.appendChild(rowCus);

    /* 状态 + 手动处理当前楼层 */
    var statNote = mk('div', 'kami-card-note', TAGFIX_COPY.statLabel + '：' + TAGFIX_COPY.statNone);
    body.appendChild(statNote);

    var btn = mk('button', 'kami-btn', TAGFIX_COPY.manualBtn);
    btn.type = 'button';
    btn.title = TAGFIX_COPY.manualHint;
    btn.setAttribute('data-kami-act', 'tagfix-floor');
    var rowBtn = mk('div', 'kami-field');
    rowBtn.appendChild(mk('span', 'kami-field-label', TAGFIX_COPY.manualLabel));
    var valBtn = mk('span', 'kami-field-value');
    valBtn.appendChild(btn);
    rowBtn.appendChild(valBtn);
    body.appendChild(rowBtn);

    if (!tagFixApiReady()) { body.appendChild(mk('div', 'kami-card-note', TAGFIX_COPY.needApi)); }
    box.appendChild(body);
    pane.appendChild(box);

    tagFixEls = { box: box, seg: seg, stat: statNote, btn: btn, chip: chip, custom: inp, all: allOn };
    paintTagFixStat();

    /* ② 常驻附加指令（用户 2026-09-30 裁定：固定放这一页的第二张卡）。
       默认折叠，写法与第一张卡逐字同构（契约 §4.3）：折叠体始终在 DOM，只切 data-kami-open。 */
    godcmdEls = null;
    var gBox = mk('div', 'kami-card kami-collapse');
    gBox.setAttribute('data-kami-open', '0');
    var gHead = mk('div', 'kami-card-head kami-head kami-collapse-head');
    gHead.setAttribute('data-kami-collapse-head', '1');
    gHead.appendChild(mk('span', 'kami-chev', '▸'));
    gHead.appendChild(mk('span', 'kami-card-title', GODCMD_COPY.title));
    gHead.appendChild(noteMark(GODCMD_COPY.note));
    var gChip = mk('span', 'kami-chip');
    gHead.appendChild(gChip);
    gBox.appendChild(gHead);

    var gNoteBox = noteText(GODCMD_COPY.note);
    gNoteBox.hidden = true;
    gBox.appendChild(gNoteBox);

    var gBody = mk('div', 'kami-card-body kami-collapse-body');
    /* 设置项一行（契约 §4.2：开关用现成的 .kami-switch 系列）。 */
    var gRowSw = mk('div', 'kami-field');
    gRowSw.appendChild(mk('span', 'kami-field-label', GODCMD_COPY.switchLabel));
    var gValSw = mk('span', 'kami-field-value');
    var gSw = mk('label', 'kami-switch');
    var gOn = mk('input', 'kami-switch-input');
    gOn.type = 'checkbox';
    gOn.setAttribute('data-kami-godcmd-on', '1');
    gOn.setAttribute('aria-label', GODCMD_COPY.switchLabel);
    var gTrack = mk('span', 'kami-switch-track');
    gTrack.appendChild(mk('span', 'kami-switch-knob'));
    gSw.appendChild(gOn); gSw.appendChild(gTrack);
    gValSw.appendChild(gSw);
    gRowSw.appendChild(gValSw);
    gBody.appendChild(gRowSw);

    /* 指令正文。空内容时也让它可写（否则「先填内容再打开」这条路走不通）；
       开着的时候才置只读，改内容要先关掉开关 —— 用户点名要「内容留空就等于没开」。 */
    var gRowTxt = mk('div', 'kami-field');
    gRowTxt.appendChild(mk('span', 'kami-field-label', GODCMD_COPY.textLabel));
    var gValTxt = mk('span', 'kami-field-value');
    var gTxt = mk('textarea', 'kami-textarea');
    gTxt.setAttribute('data-kami-godcmd-text', '1');
    gTxt.setAttribute('placeholder', GODCMD_COPY.textHint);
    gTxt.setAttribute('aria-label', GODCMD_COPY.textLabel);
    gValTxt.appendChild(gTxt);
    gRowTxt.appendChild(gValTxt);
    gBody.appendChild(gRowTxt);

    /* ⚠️ 事件必须在这里绑上。卡片渲染出来不等于功能在：2026-10-01 用户真机报
       「开关点不动、内容关掉面板就丢」，根因就是这两个函数写好了却没有任何地方调用
       （守卫原来只查 data-kami-godcmd-* 钩子存在，查不出「没人听」）。 */
    gOn.addEventListener('change', function () { toggleGodCmd(); });
    gTxt.addEventListener('input', function () { setGodCmdText(gTxt.value); });
    /* blur 再补一次：有些输入法与粘贴只触发 change，不触发 input */
    gTxt.addEventListener('change', function () { setGodCmdText(gTxt.value); });

    gBox.appendChild(gBody);
    pane.appendChild(gBox);

    godcmdEls = { box: gBox, head: gHead, chip: gChip, on: gOn, txt: gTxt };
    paintGodCmdCard();

    /* ② 「导出纯净正文」（用户 2026-10-05 点名放这一页） */
    renderExportCard(pane);
  }

  function renderExportCard(pane) {
    var ctx0 = stCtx();
    var canFmt = !!(ctx0 && typeof ctx0.messageFormatting === 'function');

    var box = mk('div', 'kami-card kami-collapse');
    box.setAttribute('data-kami-open', '0');
    var head = mk('div', 'kami-card-head kami-head kami-collapse-head');
    head.setAttribute('data-kami-collapse-head', '1');
    head.appendChild(mk('span', 'kami-chev', '▸'));
    head.appendChild(mk('span', 'kami-card-title', EXPORT_NOTICE.title));
    head.appendChild(noteMark(EXPORT_NOTICE.note));
    head.appendChild(mk('span', 'kami-chip', canFmt ? '与所见一致' : '清洗文本'));
    box.appendChild(head);

    var noteBox = noteText(EXPORT_NOTICE.note);
    noteBox.hidden = true;
    box.appendChild(noteBox);

    var body = mk('div', 'kami-card-body kami-collapse-body');

    /* 楼层范围：两个输入框，留空 = 不限制 */
    var rowRange = mk('div', 'kami-field');
    rowRange.appendChild(mk('span', 'kami-field-label', EXPORT_NOTICE.rangeLabel));
    var valRange = mk('span', 'kami-field-value');
    var inFrom = mk('input', 'kami-number');
    inFrom.type = 'text';
    inFrom.setAttribute('data-kami-export', 'from');
    inFrom.setAttribute('placeholder', EXPORT_NOTICE.rangeFromHint);
    inFrom.setAttribute('aria-label', EXPORT_NOTICE.rangeLabel + '（起始）');
    var inTo = mk('input', 'kami-number');
    inTo.type = 'text';
    inTo.setAttribute('data-kami-export', 'to');
    inTo.setAttribute('placeholder', EXPORT_NOTICE.rangeToHint);
    inTo.setAttribute('aria-label', EXPORT_NOTICE.rangeLabel + '（结束）');
    valRange.appendChild(inFrom);
    valRange.appendChild(mk('span', 'kami-field-note', '～'));
    valRange.appendChild(inTo);
    rowRange.appendChild(valRange);
    body.appendChild(rowRange);
    body.appendChild(mk('div', 'kami-card-note', EXPORT_NOTICE.note));

    /* 导出范围：全部 / 仅 AI */
    var scope = 'all';
    var rowAi = mk('div', 'kami-field');
    rowAi.appendChild(mk('span', 'kami-field-label', EXPORT_NOTICE.scopeLabel));
    var valAi = mk('span', 'kami-field-value');
    /* ⚠️ 2026-10-05 用户报「没法选择只导 AI 还是全部导出，只有'只导 AI 消息'在显示」——
       原来是一个含义模糊的开关。改成**两个明确选项**的分段按钮，选中态一眼可见。 */
    var segScope = mk('div', 'kami-seg');
    segScope.setAttribute('role', 'group');
    segScope.setAttribute('aria-label', EXPORT_NOTICE.scopeLabel);
    var scopeBtns = {};
    var scopeHint = mk('div', 'kami-card-note', '');
    function setScope(v) {
      scope = (v === 'ai') ? 'ai' : 'all';
      scopeBtns.all.className = 'kami-seg-item' + (scope === 'all' ? ' is-on' : '');
      scopeBtns.ai.className = 'kami-seg-item' + (scope === 'ai' ? ' is-on' : '');
      scopeBtns.all.setAttribute('aria-pressed', String(scope === 'all'));
      scopeBtns.ai.setAttribute('aria-pressed', String(scope === 'ai'));
      scopeHint.textContent = (scope === 'ai') ? EXPORT_NOTICE.scopeAiHint : EXPORT_NOTICE.scopeAllHint;
    }
    [['all', EXPORT_NOTICE.scopeAll], ['ai', EXPORT_NOTICE.scopeAi]].forEach(function (pair) {
      var b = mk('button', 'kami-seg-item', pair[1]);
      b.type = 'button';
      b.setAttribute('data-kami-export', 'scope');
      b.setAttribute('data-kami-scope', pair[0]);
      b.addEventListener('click', function () { setScope(pair[0]); });
      scopeBtns[pair[0]] = b;
      segScope.appendChild(b);
    });
    valAi.appendChild(segScope);
    rowAi.appendChild(valAi);
    body.appendChild(rowAi);
    body.appendChild(scopeHint);
    setScope('all');

    /* 结果/进度一行 */
    var msgEl = mk('div', 'kami-card-note', '');
    msgEl.setAttribute('data-kami-export', 'msg');
    body.appendChild(msgEl);

    function say(kind, text) {
      msgEl.textContent = text;
      msgEl.setAttribute('data-kami-kind', kind || '');
    }

    var btn = mk('button', 'kami-btn kami-btn--primary', EXPORT_NOTICE.btn);
    btn.type = 'button';
    btn.setAttribute('data-kami-export', 'go');
    btn.addEventListener('click', function () {
      if (btn.disabled) { return; }
      var ctx = stCtx();
      if (!ctx) { say('error', exportErrorText('NO_CTX')); return; }
      var chat = ctx.chat || [];
      /* 边界校验全在纯逻辑里：范围填反 / 超界 / 零楼层，都要明确提示，不许静默导出空文件 */
      var plan = planExport(chat, inFrom.value, inTo.value, scope === 'ai');
      if (!plan.ok) { say('error', exportErrorText(plan.code, plan)); return; }

      var picks = plan.picks, i = 0;
      btn.disabled = true;
      function step() {
        var t0 = Date.now();
        /* 每片最多干 60 ms —— 3000 层约 2 秒，分片后界面仍能响应、进度看得见 */
        while (i < picks.length && (Date.now() - t0) < 60) {
          picks[i].text = exportCleanOne(ctx, chat[picks[i].index], picks[i]);
          i++;
        }
        say('work', EXPORT_NOTICE.working + ' ' + i + '/' + picks.length);
        if (i < picks.length) { setTimeout(step, 0); return; }
        var text = buildExportText(picks, scope === 'all');
        if (!text) { btn.disabled = false; say('error', exportErrorText('EMPTY_RESULT')); return; }
        var name = exportFileName(plan.from, plan.to);
        var skipped = plan.skippedSystem ? ('，跳过 ' + plan.skippedSystem + ' 条隐藏消息') : '';
        /* 没有 content 块的条目要明说 —— 不许让人以为每条都规规矩矩有标记 */
        if (plan.noContent) { skipped += '，其中 ' + plan.noContent + ' 条没有 content 块（按整条清洗）'; }
        try { downloadTextFile(name, text); } catch (e) { btn.disabled = false; say('error', '下载失败：' + ((e && e.message) || e)); return; }
        btn.disabled = false;
        /* 小文件别显示成「0 KB」—— 不到 1 KB 就报字数 */
        var sizeText = text.length >= 1024 ? (Math.round(text.length / 1024) + ' KB') : (text.length + ' 字');
        say('done', '已导出 ' + name + '（' + picks.length + ' 条' + skipped + '，' + sizeText + '）');
        log('导出纯净正文：' + name + ' 楼层 ' + plan.from + '-' + plan.to + '/' + plan.total +
          ' 条数 ' + picks.length + ' 字符 ' + text.length + ' 路径 ' + (canFmt ? 'messageFormatting' : '去标签兜底'));
      }
      step();
    });
    body.appendChild(btn);

    /* 诚实说明走的是哪条路：能拿到酒馆处理链就说与所见一致，拿不到就明确说不是所见即所得 */
    var pathNote = mk('div', 'kami-card-note', canFmt ? EXPORT_NOTICE.goodPath : EXPORT_NOTICE.badPath);
    pathNote.setAttribute('data-kami-export', 'path');
    body.appendChild(pathNote);

    box.appendChild(body);
    pane.appendChild(box);
  }
