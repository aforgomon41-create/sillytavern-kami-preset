/* 其他功能页复用现有标签修复、常驻指令和导出控件；状态仍由预设设置脚本持有。 */
export function renderToolboxTabLegacy(pane) {
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
    /* 2026-10-26：开关改用 Radix。tagFixEls.all 存的是**控件对象**（有 setChecked），
       写回逻辑在 40-预设设置.js 的 paintTagFixAll。 */
    var tagFixAllSw = HOST.KamiRuntime.makeSwitch({
      checked: !!tagFixAll, label: TAGFIX_COPY.allLabel,
      attrs: { 'data-kami-tagfix-all': '1' }
    });
    valAll.appendChild(tagFixAllSw.el);
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

    tagFixEls = { box: box, seg: seg, stat: statNote, btn: btn, chip: chip, custom: inp, all: tagFixAllSw };
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
    /* 2026-10-26：开关改用 Radix。勾选态由 paintGodCmdCard 通过 setChecked 写回。 */
    var godCmdSw = HOST.KamiRuntime.makeSwitch({
      checked: false, label: GODCMD_COPY.switchLabel,
      attrs: { 'data-kami-godcmd-on': '1' },
      onChange: function () { toggleGodCmd(); }
    });
    gValSw.appendChild(godCmdSw.el);
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
    gTxt.addEventListener('input', function () { setGodCmdText(gTxt.value); });
    /* blur 再补一次：有些输入法与粘贴只触发 change，不触发 input */
    gTxt.addEventListener('change', function () { setGodCmdText(gTxt.value); });

    gBox.appendChild(gBody);
    pane.appendChild(gBox);

    godcmdEls = { box: gBox, head: gHead, chip: gChip, on: godCmdSw, txt: gTxt };
    paintGodCmdCard();

    /* ② 「导出纯净正文」（用户 2026-10-05 点名放这一页） */
    renderExportCardLegacy(pane);
  }

  function renderExportCardLegacy(pane) {
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


/* ════════════════════════════════════════════════════════════════
 * React 版（2026-10-26 迁移）
 * ----------------------------------------------------------------
 * 三张折叠卡：#1 自动标签处理、#2 常驻附加指令、#3 导出纯净正文。
 * 折叠行为由面板的点击委托（data-kami-collapse-head）负责，这里只管结构。
 * 两张卡的状态写回函数（paintTagFixStat / paintGodCmdCard）在 40-预设设置.js，
 * 它们按 Element 引用就地改，所以这里渲染完把 tagFixEls / godcmdEls 接上即可。
 * 运行库不可用时退回上面的 *Legacy 实现（单测沙箱走那条）。
 * ════════════════════════════════════════════════════════════════ */

var toolboxOtherRoot = null;

function otherUiRt() {
  try { var rt = HOST.KamiRuntime; if (rt && rt.createRoot) { return rt; } } catch (e) { }
  return null;
}

export function renderToolboxTab(pane) {
  var rt = otherUiRt();
  if (!rt || typeof tagFixApiReady !== 'function') { renderToolboxTabLegacy(pane); return; }
  var h = rt.React.createElement;
  var nodes = [
    h(TagFixCard, { key: 'tagfix', rt: rt }),
    h(GodCmdCard, { key: 'godcmd', rt: rt }),
    h(ExportCard, { key: 'export', rt: rt })
  ];
  if (!toolboxOtherRoot) { pane.textContent = ''; toolboxOtherRoot = rt.createRoot(pane); }
  rt.flushSync(function () {
    toolboxOtherRoot.render(h(rt.React.Fragment, null, nodes));
  });
  try { rt.classifyTree(pane); } catch (e2) { }
}

/* 一张折叠卡的外壳：头（箭头 + 标题 + 可选的 ⓘ / 徽章）+ 折叠体 */
function collapseCard(h, opts) {
  var headKids = [h('span', { key: 'chev', className: 'kami-chev' }, '▸'),
    h('span', { key: 't', className: 'kami-card-title' }, opts.title)];
  if (opts.mark) { headKids.push(opts.mark); }
  if (opts.chip) { headKids.push(opts.chip); }
  var kids = [
    h('div', { key: 'head', className: 'kami-card-head kami-head kami-collapse-head', 'data-kami-collapse-head': '1' }, headKids)
  ];
  if (opts.note) { kids.push(opts.note); }
  kids.push(h('div', { key: 'body', className: 'kami-card-body kami-collapse-body' }, opts.body));
  return h('div', { key: opts.key, className: 'kami-card kami-collapse', 'data-kami-open': '0' }, kids);
}

/* ⓘ 注释标记（不做翻转，翻转由面板委托负责 —— 与 40 号同一套结构） */
function otherNoteMark(h, text, refFn) {
  if (!text) { return null; }
  return h('span', {
    className: 'kami-card-note', 'data-kami-note-mark': '1',
    role: 'button', tabindex: 0, 'aria-expanded': 'false', 'aria-label': '查看注释',
    ref: refFn
  }, 'ⓘ');
}
function otherNoteBox(h, text) {
  if (!text) { return null; }
  return h('div', { className: 'kami-card-note', 'data-kami-note': '1', hidden: true }, text);
}

/* ① 自动标签处理 */
function TagFixCard(props) {
  var rt = props.rt, h = rt.React.createElement;
  var refs = {};
  rt.React.useEffect(function () {
    tagFixEls = {
      box: refs.box, seg: refs.seg, stat: refs.stat, btn: refs.btn,
      chip: refs.chip, custom: refs.custom, all: refs.all
    };
    try { paintTagFixStat(); } catch (e) { }
  }, []);

  var seg = h('div', { className: 'kami-seg', role: 'group', 'aria-label': TAGFIX_COPY.title, ref: function (n) { refs.seg = n; } },
    TAGFIX_MODES.map(function (m) {
      var on = m.id === tagFixMode;
      return h('button', {
        key: m.id, type: 'button',
        className: 'kami-seg-item' + (on ? ' is-on' : ''),
        'data-kami-tagfix': m.id,
        'aria-pressed': on ? 'true' : 'false'
      }, m.label);
    }));

  var body = [
    h('div', { key: 'mode', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, TAGFIX_COPY.modeLabel),
      h('span', { className: 'kami-field-value' }, seg)),
    h('div', { key: 'modehint', className: 'kami-card-note' }, TAGFIX_COPY.modeHint),
    h('div', { key: 'all', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, TAGFIX_COPY.allLabel),
      h('span', { className: 'kami-field-value', ref: function (n) { mountTagFixSwitch(n, rt, refs); } })),
    h('div', { key: 'allhint', className: 'kami-card-note' }, TAGFIX_COPY.allHint),
    h('div', { key: 'cus', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, TAGFIX_COPY.customLabel),
      h('span', { className: 'kami-field-value' },
        h('input', {
          type: 'text', className: 'kami-text',
          'data-kami-tagfix-custom': '1',
          placeholder: TAGFIX_COPY.customHint,
          'aria-label': TAGFIX_COPY.customLabel,
          defaultValue: tagFixCustom.join(' '),
          ref: function (n) { refs.custom = n; }
        }))),
    h('div', { key: 'stat', className: 'kami-card-note', ref: function (n) { refs.stat = n; } },
      TAGFIX_COPY.statLabel + '：' + TAGFIX_COPY.statNone),
    h('div', { key: 'man', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, TAGFIX_COPY.manualLabel),
      h('span', { className: 'kami-field-value' },
        h('button', {
          type: 'button', className: 'kami-btn', title: TAGFIX_COPY.manualHint,
          'data-kami-act': 'tagfix-floor',
          ref: function (n) { refs.btn = n; }
        }, TAGFIX_COPY.manualBtn))),
    tagFixApiReady() ? null : h('div', { key: 'needapi', className: 'kami-card-note' }, TAGFIX_COPY.needApi)
  ];

  return h('div', { className: 'kami-card kami-collapse', 'data-kami-open': '0', ref: function (n) { refs.box = n; } },
    h('div', { className: 'kami-card-head kami-head kami-collapse-head', 'data-kami-collapse-head': '1' },
      h('span', { className: 'kami-chev' }, '▸'),
      h('span', { className: 'kami-card-title' }, TAGFIX_COPY.title),
      otherNoteMark(h, TAGFIX_COPY.note),
      h('span', { className: 'kami-chip', ref: function (n) { refs.chip = n; } }, tagFixChipText())),
    otherNoteBox(h, TAGFIX_COPY.note),
    h('div', { className: 'kami-card-body kami-collapse-body' }, body));
}

function mountTagFixSwitch(host, rt, refs) {
  if (!host || host.__kamiSwitchMounted) { return; }
  host.__kamiSwitchMounted = 1;
  var ctl = rt.makeSwitch({
    checked: !!tagFixAll, label: TAGFIX_COPY.allLabel,
    attrs: { 'data-kami-tagfix-all': '1' }
  });
  host.appendChild(ctl.el);
  refs.all = ctl;
}

/* ② 常驻附加指令 */
function GodCmdCard(props) {
  var rt = props.rt, h = rt.React.createElement;
  var refs = {};
  rt.React.useEffect(function () {
    godcmdEls = { box: refs.box, head: refs.head, chip: refs.chip, on: refs.on, txt: refs.txt };
    try { paintGodCmdCard(); } catch (e) { }
  }, []);

  var body = [
    h('div', { key: 'sw', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, GODCMD_COPY.switchLabel),
      h('span', { className: 'kami-field-value', ref: function (n) { mountGodCmdSwitch(n, rt, refs); } })),
    h('div', { key: 'txt', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, GODCMD_COPY.textLabel),
      h('span', { className: 'kami-field-value' },
        h('textarea', {
          className: 'kami-textarea',
          'data-kami-godcmd-text': '1',
          placeholder: GODCMD_COPY.textHint,
          'aria-label': GODCMD_COPY.textLabel,
          ref: function (n) {
            refs.txt = n;
            if (n && !n.__kamiWired) {
              n.__kamiWired = 1;
              n.addEventListener('input', function () { setGodCmdText(n.value); });
              n.addEventListener('change', function () { setGodCmdText(n.value); });
            }
          }
        })))
  ];

  return h('div', { className: 'kami-card kami-collapse', 'data-kami-open': '0', ref: function (n) { refs.box = n; } },
    h('div', {
      className: 'kami-card-head kami-head kami-collapse-head', 'data-kami-collapse-head': '1',
      ref: function (n) { refs.head = n; }
    },
      h('span', { className: 'kami-chev' }, '▸'),
      h('span', { className: 'kami-card-title' }, GODCMD_COPY.title),
      otherNoteMark(h, GODCMD_COPY.note),
      h('span', { className: 'kami-chip', ref: function (n) { refs.chip = n; } })),
    otherNoteBox(h, GODCMD_COPY.note),
    h('div', { className: 'kami-card-body kami-collapse-body' }, body));
}

function mountGodCmdSwitch(host, rt, refs) {
  if (!host || host.__kamiSwitchMounted) { return; }
  host.__kamiSwitchMounted = 1;
  var ctl = rt.makeSwitch({
    checked: false, label: GODCMD_COPY.switchLabel,
    attrs: { 'data-kami-godcmd-on': '1' },
    onChange: function () { toggleGodCmd(); }
  });
  host.appendChild(ctl.el);
  refs.on = ctl;
}

/* ③ 导出纯净正文（有导出进度/结果状态，用 React 状态管） */
function ExportCard(props) {
  var rt = props.rt, h = rt.React.createElement;
  var canFmt = false;
  try { var c0 = stCtx(); canFmt = !!(c0 && typeof c0.messageFormatting === 'function'); } catch (e0) { }
  var s0 = rt.React.useState('all');
  var scope = s0[0], setScope = s0[1];
  var s1 = rt.React.useState('');
  var msg = s1[0], setMsg = s1[1];
  var s2 = rt.React.useState('');
  var kind = s2[0], setKind = s2[1];
  var s3 = rt.React.useState(false);
  var busy = s3[0], setBusy = s3[1];
  var refs = {};

  function say(k, text) { setKind(k || ''); setMsg(text); }

  function go() {
    if (busy) { return; }
    var ctx = stCtx();
    if (!ctx) { say('error', exportErrorText('NO_CTX')); return; }
    var chat = ctx.chat || [];
    var plan = planExport(chat,
      refs.from ? refs.from.value : '', refs.to ? refs.to.value : '', scope === 'ai');
    if (!plan.ok) { say('error', exportErrorText(plan.code, plan)); return; }
    var picks = plan.picks, i = 0;
    setBusy(true);
    function step() {
      var t0 = Date.now();
      while (i < picks.length && (Date.now() - t0) < 60) {
        picks[i].text = exportCleanOne(ctx, chat[picks[i].index], picks[i]);
        i++;
      }
      say('work', EXPORT_NOTICE.working + ' ' + i + '/' + picks.length);
      if (i < picks.length) { setTimeout(step, 0); return; }
      var text = buildExportText(picks, scope === 'all');
      setBusy(false);
      if (!text) { say('error', exportErrorText('EMPTY_RESULT')); return; }
      var name = exportFileName(plan.from, plan.to);
      var skipped = plan.skippedSystem ? ('，跳过 ' + plan.skippedSystem + ' 条隐藏消息') : '';
      if (plan.noContent) { skipped += '，其中 ' + plan.noContent + ' 条没有 content 块（按整条清洗）'; }
      try { downloadTextFile(name, text); } catch (e) { say('error', '下载失败：' + ((e && e.message) || e)); return; }
      var sizeText = text.length >= 1024 ? (Math.round(text.length / 1024) + ' KB') : (text.length + ' 字');
      say('done', '已导出 ' + name + '（' + picks.length + ' 条' + skipped + '，' + sizeText + '）');
      log('导出纯净正文：' + name + ' 楼层 ' + plan.from + '-' + plan.to + '/' + plan.total +
        ' 条数 ' + picks.length + ' 字符 ' + text.length + ' 路径 ' + (canFmt ? 'messageFormatting' : '去标签兜底'));
    }
    step();
  }

  var scopeHintText = (scope === 'ai') ? EXPORT_NOTICE.scopeAiHint : EXPORT_NOTICE.scopeAllHint;
  var body = [
    h('div', { key: 'range', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, EXPORT_NOTICE.rangeLabel),
      h('span', { className: 'kami-field-value' },
        h('input', {
          type: 'text', className: 'kami-number', 'data-kami-export': 'from',
          placeholder: EXPORT_NOTICE.rangeFromHint,
          'aria-label': EXPORT_NOTICE.rangeLabel + '（起始）',
          ref: function (n) { refs.from = n; }
        }),
        h('span', { className: 'kami-field-note' }, '～'),
        h('input', {
          type: 'text', className: 'kami-number', 'data-kami-export': 'to',
          placeholder: EXPORT_NOTICE.rangeToHint,
          'aria-label': EXPORT_NOTICE.rangeLabel + '（结束）',
          ref: function (n) { refs.to = n; }
        }))),
    h('div', { key: 'rangenote', className: 'kami-card-note' }, EXPORT_NOTICE.note),
    h('div', { key: 'scope', className: 'kami-field' },
      h('span', { className: 'kami-field-label' }, EXPORT_NOTICE.scopeLabel),
      h('span', { className: 'kami-field-value' },
        h('div', { className: 'kami-seg', role: 'group', 'aria-label': EXPORT_NOTICE.scopeLabel },
          [['all', EXPORT_NOTICE.scopeAll], ['ai', EXPORT_NOTICE.scopeAi]].map(function (pair) {
            var on = scope === pair[0];
            return h('button', {
              key: pair[0], type: 'button',
              className: 'kami-seg-item' + (on ? ' is-on' : ''),
              'data-kami-export': 'scope',
              'data-kami-scope': pair[0],
              'aria-pressed': on ? 'true' : 'false',
              onClick: function () { setScope(pair[0]); }
            }, pair[1]);
          })))),
    h('div', { key: 'scopehint', className: 'kami-card-note' }, scopeHintText),
    h('div', {
      key: 'msg', className: 'kami-card-note',
      'data-kami-export': 'msg', 'data-kami-kind': kind
    }, msg),
    h('button', {
      key: 'go', type: 'button', className: 'kami-btn kami-btn--primary',
      'data-kami-export': 'go', disabled: busy || undefined,
      onClick: go
    }, EXPORT_NOTICE.btn),
    h('div', {
      key: 'path', className: 'kami-card-note', 'data-kami-export': 'path'
    }, canFmt ? EXPORT_NOTICE.goodPath : EXPORT_NOTICE.badPath)
  ];

  return h('div', { className: 'kami-card kami-collapse', 'data-kami-open': '0' },
    h('div', { className: 'kami-card-head kami-head kami-collapse-head', 'data-kami-collapse-head': '1' },
      h('span', { className: 'kami-chev' }, '▸'),
      h('span', { className: 'kami-card-title' }, EXPORT_NOTICE.title),
      otherNoteMark(h, EXPORT_NOTICE.note),
      h('span', { className: 'kami-chip' }, canFmt ? '与所见一致' : '清洗文本')),
    otherNoteBox(h, EXPORT_NOTICE.note),
    h('div', { className: 'kami-card-body kami-collapse-body' }, body));
}
