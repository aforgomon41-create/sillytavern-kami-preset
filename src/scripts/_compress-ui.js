/* 压缩页的现有控件与渲染。内联到工具箱闭包，继续使用原有配置、事件和保存流程。 */
export function sectionCard(title) {
    var card = mk('div', 'kami-card');
    card.appendChild(mk('div', 'kami-card-title', title));
    var body = mk('div', 'kami-card-body');
    card.appendChild(body);
    return { card: card, body: body };
  }
  function noteLine(parent, text) {
    var n = mk('div', 'kami-card-note', text);
    parent.appendChild(n);
    return n;
  }
  /* 字段行：契约 §4.2 的 .kami-field 三件套（40-预设设置.js 第 1538-1545 行、
      30-皮肤管理.js 第 804-806 行同款）。行距、分隔线、点线引导符全靠皮肤，前端零内联。 */
  function fieldRow(parent, label, control) {
    var row = mk('div', 'kami-field');
    if (label !== null && label !== undefined && label !== '') { row.appendChild(mk('span', 'kami-field-label', label)); }
    if (control) { row.appendChild(control); }
    parent.appendChild(row);
    return row;
  }
  /* 数字框：input 裹在 .kami-field-value 里（40 号 varInput 同款），宽度用皮肤登记的 62px */
  function numInput(parent, label, value, key, hint) {
    var input = HDOC.createElement('input');
    input.className = 'kami-number';
    input.type = 'number';
    input.setAttribute('data-kami-var', key);
    input.value = String(value);
    var val = mk('span', 'kami-field-value');
    val.appendChild(input);
    fieldRow(parent, label, val);
    if (hint) { noteLine(parent, hint); }
    return input;
  }
  /* 文本/密码框：作为 .kami-field 的直接子元素，撑开由 LAYOUT_CSS 负责。
     类名 = 契约 §4.2 的 `.kami-text`（2026-09-21 起不再借用数字框的 `.kami-number`：
     那条规则带 `text-align:right`，会把文本框一起变成右对齐）。 */
  function textInput(parent, label, value, attrs, hint) {
    var input = HDOC.createElement('input');
    input.className = 'kami-text';
    if (attrs) { for (var k in attrs) { input.setAttribute(k, attrs[k]); } }
    input.value = String(value === undefined || value === null ? '' : value);
    fieldRow(parent, label, input);
    if (hint) { noteLine(parent, hint); }
    return input;
  }
  /* 下拉框：options = [[value, text], …]；同样作为 .kami-field 直接子元素。
     类名 = 契约 §4.2 的 `.kami-select`（六份样式表里原本一条下拉框规则都没有，
     真机上就是浏览器默认样式；`.kami-number` 是数字框，不许再借用）。 */
  function selectRow(parent, label, options, current, attrs) {
    var sel = HDOC.createElement('select');
    sel.className = 'kami-select';
    if (attrs) { for (var k2 in attrs) { sel.setAttribute(k2, attrs[k2]); } }
    for (var i = 0; i < options.length; i++) {
      var op = HDOC.createElement('option');
      var choice = options[i], value = Array.isArray(choice) ? choice[0] : choice.value;
      op.value = value;
      op.textContent = Array.isArray(choice) ? choice[1] : choice.label;
      if (value === current) { op.selected = true; }
      sel.appendChild(op);
    }
    fieldRow(parent, label, sel);
    return sel;
  }
  /* 开关卡：button.kami-item.kami-card + .is-on + aria-pressed（40 号第 1546-1576 行同款），
     行内结构用 span.kami-card-head > span.kami-item-main（button 的内容模型只允许 phrasing content） */
  function toggleCard(parent, key, title, on, extraLine) {
    var btn = mk('button', 'kami-item kami-card' + (on ? ' is-on' : ''));
    btn.type = 'button';
    btn.setAttribute('role', 'button');
    btn.setAttribute('data-kami-cmode', key);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', title);
    var head = mk('span', 'kami-card-head');
    head.appendChild(mk('span', 'kami-item-main', title));
    btn.appendChild(head);
    if (extraLine) { btn.appendChild(mk('span', 'kami-card-note', extraLine)); }
    parent.appendChild(btn);
    return btn;
  }

  function renderContent() {
    if (!bodyEl || disposed) { return; }
    var keepScroll = bodyEl.scrollTop;
    bodyEl.textContent = '';

    /* ① 模式 */
    var roll = rollInfo();
    var sec1 = sectionCard(COPY.mode.section);
    toggleCard(sec1.body, 'roll', COPY.mode.rollTitle, roll.ok && roll.enabled,
      COPY.mode.rollDepthLine.replace('{n}', roll.ok ? roll.minDepth : '—'));
    noteLine(sec1.body, COPY.mode.rollNote);
    toggleCard(sec1.body, 'grand', COPY.mode.grandTitle, cfg.grandOn, null);
    noteLine(sec1.body, COPY.mode.grandNote);
    bodyEl.appendChild(sec1.card);

    /* ② 滚动压缩参数 */
    var sec2 = sectionCard(COPY.roll.section);
    if (roll.ok) {
      numInput(sec2.body, COPY.roll.depthLabel, roll.minDepth, 'depth', COPY.roll.depthHint);
    } else {
      noteLine(sec2.body, roll.error);
    }
    bodyEl.appendChild(sec2.card);

    /* ③ 超限压缩参数 */
    var sec3 = sectionCard(COPY.grand.section);
    numInput(sec3.body, COPY.grand.thresholdLabel, cfg.threshold, 'threshold', COPY.grand.thresholdHint);
    numInput(sec3.body, COPY.grand.keepLabel, cfg.keep, 'keep', COPY.grand.keepHint);
    numInput(sec3.body, COPY.grand.chunkLabel, cfg.chunk, 'chunk', COPY.grand.chunkHint);
    bodyEl.appendChild(sec3.card);

    /* ④ 大总结模型 */
    var sec4 = renderKamiLlmModel({state:cfg,copy:COPY,make:mk,document:HDOC,section:sectionCard,field:fieldRow,note:noteLine,text:textInput,select:selectRow,profiles:tavernCCProfiles,currentConfig:currentSumConfig,models:cachedModelList,fetchState:fetchState});
    bodyEl.appendChild(sec4.card);

    /* ⑤ 例外楼层 */
    var sec5 = sectionCard(COPY.pins.section);
    if (st.pins.length) {
      var chips = mk('div');
      chips.setAttribute('data-kami-role', 'pin-chips');
      for (var i = 0; i < st.pins.length; i++) {
        var chip = mk('span', 'kami-chip', '#' + st.pins[i]);
        chip.setAttribute('data-kami-pin', String(st.pins[i]));
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', COPY.pins.chipTitle + ' #' + st.pins[i]);
        chip.title = COPY.pins.chipTitle;
        chips.appendChild(chip);
      }
      sec5.body.appendChild(chips);
    } else {
      noteLine(sec5.body, COPY.pins.empty);
    }
    var pinRow = fieldRow(sec5.body, COPY.pins.ph, null);
    var pinInput = HDOC.createElement('input');
    pinInput.className = 'kami-number';
    pinInput.type = 'number';
    pinInput.setAttribute('data-kami-var', 'pin');
    pinInput.placeholder = COPY.pins.ph;
    pinRow.appendChild(pinInput);
    var bAdd = mk('button', 'kami-btn kami-btn--ghost', COPY.pins.add);
    bAdd.type = 'button';
    bAdd.setAttribute('data-kami-act', 'pin-add');
    pinRow.appendChild(bAdd);
    var bDel = mk('button', 'kami-btn kami-btn--ghost', COPY.pins.remove);
    bDel.type = 'button';
    bDel.setAttribute('data-kami-act', 'pin-del');
    pinRow.appendChild(bDel);
    noteLine(sec5.body, COPY.pins.note);
    bodyEl.appendChild(sec5.card);

    /* ⑥ 压缩块 */
    var secTitle = COPY.blocks.section + '（' + st.blocks.length + '）';
    if (st.pending.length) { secTitle += ' ｜ ' + COPY.blocks.pendingTag + ' ' + countFloors(st.pending); }
    var sec6 = sectionCard(secTitle);
    if (st.error) {
      noteLine(sec6.body, COPY.blocks.errHint.replace('{err}', st.error));
      noteLine(sec6.body, COPY.blocks.errFix);
    }
    /* 刷新：重新读一遍世界书（你在世界书里手改的正文立刻反映到面板上）。
       正常情况下 WORLDINFO_UPDATED 会自动刷，这颗按钮是拿不到那个事件时的兜底。 */
    var refreshRow = fieldRow(sec6.body, '', null);
    refreshRow.setAttribute('data-kami-role', 'block-refresh');
    var bRefresh = mk('button', 'kami-btn kami-btn--ghost', COPY.blocks.refresh);
    bRefresh.type = 'button';
    bRefresh.title = COPY.blocks.refreshTip;
    bRefresh.setAttribute('data-kami-act', 'blocks-refresh');
    refreshRow.appendChild(bRefresh);
    /* 对账结果的一句话汇总（待重做 / 孤儿隐藏楼层 / 重复条目 / 疑似报错内容） */
    for (var nt = 0; nt < st.notice.length; nt++) { noteLine(sec6.body, st.notice[nt]); }
    if (st.orphan.length) {
      var bRepair = mk('button', 'kami-btn kami-btn--ghost', COPY.blocks.orphanBtn);
      bRepair.type = 'button';
      bRepair.setAttribute('data-kami-act', 'repair-orphans');
      sec6.body.appendChild(bRepair);
    }
    if (st.blocks.length) {
      for (var b = 0; b < st.blocks.length; b++) {
        var blk = mk('div');
        var susp = st.suspect.indexOf(b) >= 0;
        var bt = mk('div', 'kami-card-title', COPY.blocks.blockTag + ' ' + (b + 1) + ' ｜ 楼层 ' + st.blocks[b].from + '-' + st.blocks[b].to +
          (st.blocks[b].depth !== null && st.blocks[b].depth !== undefined ? (' ｜ ' + COPY.blocks.depthTag + ' ' + st.blocks[b].depth) : '') +
          (susp ? (' ｜ ⚠ ' + COPY.blocks.suspectTag) : ''));
        var bb = mk('div', 'kami-card-body', st.blocks[b].text);
        bb.setAttribute('data-kami-role', 'block-text');
        blk.appendChild(bt);
        blk.appendChild(bb);
        sec6.body.appendChild(blk);
      }
      noteLine(sec6.body, COPY.blocks.note.replace('{lb}', st.lbName || COPY.blocks.lbNone));
    } else if (st.pending.length) {
      /* 一块都没有但有待重做段：别显示「暂无压缩块」，那会让人以为数据没了 */
      for (var pd = 0; pd < st.pending.length; pd++) {
        var pblk = mk('div');
        pblk.appendChild(mk('div', 'kami-card-title', COPY.blocks.pendingTag + ' ｜ 楼层 ' + st.pending[pd].from + '-' + st.pending[pd].to));
        sec6.body.appendChild(pblk);
      }
      noteLine(sec6.body, COPY.blocks.note.replace('{lb}', st.lbName || COPY.blocks.lbNone));
    } else if (!st.error) {
      sec6.body.appendChild(mk('div', 'kami-empty', COPY.blocks.empty));
    }
    bodyEl.appendChild(sec6.card);

    /* ⑦ 摘要提示词（模板 + 头/任务/尾） */
    var sec7 = renderKamiLlmPrompts({state:cfg,copy:COPY,make:mk,document:HDOC,section:sectionCard,field:fieldRow,note:noteLine,text:textInput,select:selectRow,snapshot:snapPrompts,currentTemplate:currentTpl});
    bodyEl.appendChild(sec7.card);

    /* ⑧ 摘要条目状态 */
    var sec8 = sectionCard(COPY.entry.section);
    var info = summaryInfo();
    if (info.ok) {
      var bToggle = mk('button', 'kami-btn kami-btn--ghost', info.enabled ? COPY.entry.turnOff : COPY.entry.turnOn);
      bToggle.type = 'button';
      bToggle.setAttribute('data-kami-act', 'toggle-entry');
      fieldRow(sec8.body, info.name, bToggle);
    } else {
      noteLine(sec8.body, info.error);
    }
    noteLine(sec8.body, COPY.entry.note);
    bodyEl.appendChild(sec8.card);

    bodyEl.scrollTop = keepScroll;
    renderStatus();
  }

  /* ── 摘要模型 / 摘要提示词的写回 ──
     文本域与下拉的改动只落 cfg + saveVars，**不重画面板**（保住输入焦点）；
     增删条目、恢复默认这类结构变化才重画。 */
