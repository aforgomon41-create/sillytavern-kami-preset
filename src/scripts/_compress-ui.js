/* 压缩业务保留，基础字段和卡片由共享组件库生成。 */
export function sectionCard(title) {
  var card=createKamiUi(HDOC).settingsCard({title:title,flatTitle:true});return {card:card,body:card.body};
}
function noteLine(parent,text){var n=mk('div','kami-card-note',text);parent.appendChild(n);return n;}
function fieldRow(parent,label,control){var row=createKamiUi(HDOC).field({label:label,control:control,labelTag:'span'});parent.appendChild(row);return row;}
function numInput(parent,label,value,key,hint){var input=createKamiUi(HDOC).number({value:value,attrs:{'data-kami-var':key}}),val=mk('span','kami-field-value');val.appendChild(input);fieldRow(parent,label,val);if(hint)noteLine(parent,hint);return input;}
function textInput(parent,label,value,attrs,hint){var input=createKamiUi(HDOC).text({value:value,attrs:attrs});fieldRow(parent,label,input);if(hint)noteLine(parent,hint);return input;}
function selectRow(parent,label,items,current,attrs){var input=createKamiUi(HDOC).select({items:items,value:current,attrs:attrs});fieldRow(parent,label,input);return input;}
function toggleCard(parent,key,title,on,extraLine){var n=createKamiUi(HDOC).choiceCard({label:title,selected:on,description:extraLine,attrs:{'data-kami-cmode':key,role:'button','aria-label':title}});parent.appendChild(n);return n;}

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
    var sec4 = createKamiUi(HDOC).modelConnection({render:renderKamiLlmModel,env:{state:cfg,copy:COPY,make:mk,document:HDOC,section:sectionCard,field:fieldRow,note:noteLine,text:textInput,select:selectRow,profiles:tavernCCProfiles,currentConfig:currentSumConfig,models:cachedModelList,fetchState:fetchState}});
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
    var pinInput = createKamiUi(HDOC).element('input');
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
    var sec7 = createKamiUi(HDOC).promptEditor({render:renderKamiLlmPrompts,env:{state:cfg,copy:COPY,make:mk,document:HDOC,section:sectionCard,field:fieldRow,note:noteLine,text:textInput,select:selectRow,snapshot:snapPrompts,currentTemplate:currentTpl}});
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
