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
    /* 2026-10-26：页面改由 React 渲染；运行库不可用时才走下面那套命令式重建。 */
    bridgeNotify();
    if (!bodyEl || disposed) { return; }
    var rtRc = compressRt();
    if (rtRc) { renderContentReact(rtRc); return; }
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

/* ── React 版页面（2026-10-26 迁移）────────────────────────────────
 * 原来 renderContent 每次都是「清空 + 整页重建」，正好就是 React 的用法：
 * 状态一变就重新 render，滚动位置自己记住。
 * 两处复合块（大总结模型 / 摘要提示词）依赖老组件核心的 modelConnection /
 * promptEditor（它们是适配器，真的要渲染还是模块给的），这里先用**挂载点**承载：
 * React 负责排位置，里面那块仍由老渲染器画 —— 逐块迁，不搞大爆炸。
 * ──────────────────────────────────────────────────────────────── */
function compressRt() {
  try { var rt = HOST.KamiRuntime; if (rt && rt.createRoot) { return rt; } } catch (e) { }
  return null;
}

function renderContentReact(rt) {
  var h = rt.React.createElement;
  function card(title, kids, key) {
    return h('div', { key: key, className: 'kami-card' },
      h('div', { className: 'kami-card-title' }, title),
      h('div', { className: 'kami-card-body' }, kids));
  }
  function note(text, key) { return h('div', { key: key, className: 'kami-card-note' }, text); }
  function fieldRow(label, control, key, extraClass) {
    return h('div', { key: key, className: 'kami-field' + (extraClass ? ' ' + extraClass : '') },
      label ? h('span', { className: 'kami-field-label' }, label) : null,
      h('span', { className: 'kami-field-value' }, control));
  }
  function numInput(label, value, key, hint) {
    return fieldRow(label,
      h('input', {
        type: 'number', className: 'kami-number', defaultValue: String(value),
        'data-kami-var': key
      }), 'f' + key);
  }
  function toggleCard(key, title, on, extraLine) {
    return h('button', {
      key: 'tg' + key, type: 'button',
      className: 'kami-item kami-card' + (on ? ' is-on' : ''),
      'data-kami-card-role': 'choice',
      'aria-pressed': on ? 'true' : 'false',
      'data-kami-toggle': key
    },
      h('span', { className: 'kami-card-head' }, h('span', { className: 'kami-item-main' }, title)),
      extraLine ? h('span', { className: 'kami-card-note' }, extraLine) : null);
  }

  var nodes = [];
  var roll = rollInfo();

  /* ① 模式 */
  nodes.push(card(COPY.mode.section, [
    toggleCard('roll', COPY.mode.rollTitle, roll.ok && roll.enabled,
      COPY.mode.rollDepthLine.replace('{n}', roll.ok ? roll.minDepth : '—')),
    note(COPY.mode.rollNote, 'n1'),
    toggleCard('grand', COPY.mode.grandTitle, cfg.grandOn, null),
    note(COPY.mode.grandNote, 'n2')
  ], 'sec1'));

  /* ② 滚动压缩参数 */
  nodes.push(card(COPY.roll.section, roll.ok
    ? [numInput(COPY.roll.depthLabel, roll.minDepth, 'depth', COPY.roll.depthHint)]
    : [note(roll.error, 'e1')], 'sec2'));

  /* ③ 超限压缩参数 */
  nodes.push(card(COPY.grand.section, [
    numInput(COPY.grand.thresholdLabel, cfg.threshold, 'threshold', COPY.grand.thresholdHint),
    numInput(COPY.grand.keepLabel, cfg.keep, 'keep', COPY.grand.keepHint),
    numInput(COPY.grand.chunkLabel, cfg.chunk, 'chunk', COPY.grand.chunkHint)
  ], 'sec3'));

  /* ④ 大总结模型：挂载点（里面仍由老渲染器画） */
  nodes.push(h('div', { key: 'sec4', className: 'kami-card',
    ref: function (n) { mountModelConnection(n, rt); } }));

  /* ⑤ 例外楼层 */
  var pins = [];
  if (st.pins.length) {
    pins.push(h('div', { key: 'chips', 'data-kami-role': 'pin-chips' },
      st.pins.map(function (p) {
        return h('span', {
          key: 'p' + p, className: 'kami-chip', 'data-kami-pin': String(p),
          role: 'button', tabindex: 0, title: COPY.pins.chipTitle,
          'aria-label': COPY.pins.chipTitle + ' #' + p
        }, '#' + p);
      })));
  } else {
    pins.push(note(COPY.pins.empty, 'pe'));
  }
  pins.push(fieldRow(COPY.pins.ph, [
    h('input', {
      key: 'pinin', type: 'number', className: 'kami-number',
      'data-kami-var': 'pin', placeholder: COPY.pins.ph
    }),
    h('button', { key: 'add', type: 'button', className: 'kami-btn kami-btn--ghost', 'data-kami-act': 'pin-add' }, COPY.pins.add),
    h('button', { key: 'del', type: 'button', className: 'kami-btn kami-btn--ghost', 'data-kami-act': 'pin-del' }, COPY.pins.remove)
  ], 'pinrow'));
  pins.push(note(COPY.pins.note, 'pn'));
  nodes.push(card(COPY.pins.section, pins, 'sec5'));

  /* ⑥ 压缩块 */
  var secTitle = COPY.blocks.section + '（' + st.blocks.length + '）';
  if (st.pending.length) { secTitle += ' ｜ ' + COPY.blocks.pendingTag + ' ' + countFloors(st.pending); }
  var blkNodes = [];
  if (st.error) {
    blkNodes.push(note(COPY.blocks.errHint.replace('{err}', st.error), 'be1'));
    blkNodes.push(note(COPY.blocks.errFix, 'be2'));
  }
  blkNodes.push(h('div', { key: 'ref', className: 'kami-field', 'data-kami-role': 'block-refresh' },
    h('span', { className: 'kami-field-value' },
      h('button', {
        type: 'button', className: 'kami-btn kami-btn--ghost', title: COPY.blocks.refreshTip,
        'data-kami-act': 'blocks-refresh'
      }, COPY.blocks.refresh))));
  for (var nt = 0; nt < st.notice.length; nt++) { blkNodes.push(note(st.notice[nt], 'no' + nt)); }
  if (st.orphan.length) {
    blkNodes.push(h('button', {
      key: 'repair', type: 'button', className: 'kami-btn kami-btn--ghost',
      'data-kami-act': 'repair-orphans'
    }, COPY.blocks.orphanBtn));
  }
  if (st.blocks.length) {
    for (var bi = 0; bi < st.blocks.length; bi++) {
      var blk = st.blocks[bi];
      var susp = st.suspect.indexOf(bi) >= 0;
      blkNodes.push(h('div', { key: 'b' + bi },
        h('div', { className: 'kami-card-title' },
          COPY.blocks.blockTag + ' ' + (bi + 1) + ' ｜ 楼层 ' + blk.from + '-' + blk.to +
          (blk.depth !== null && blk.depth !== undefined ? (' ｜ ' + COPY.blocks.depthTag + ' ' + blk.depth) : '') +
          (susp ? (' ｜ ⚠ ' + COPY.blocks.suspectTag) : '')),
        h('div', { className: 'kami-card-body', 'data-kami-role': 'block-text' }, blk.text)));
    }
    blkNodes.push(note(COPY.blocks.note.replace('{lb}', st.lbName || COPY.blocks.lbNone), 'bn'));
  } else if (st.pending.length) {
    for (var pd = 0; pd < st.pending.length; pd++) {
      blkNodes.push(h('div', { key: 'pd' + pd },
        h('div', { className: 'kami-card-title' }, COPY.blocks.pendingTag + ' ｜ 楼层 ' + st.pending[pd].from + '-' + st.pending[pd].to)));
    }
    blkNodes.push(note(COPY.blocks.note.replace('{lb}', st.lbName || COPY.blocks.lbNone), 'bn2'));
  } else if (!st.error) {
    blkNodes.push(h('div', { key: 'empty', className: 'kami-empty' }, COPY.blocks.empty));
  }
  nodes.push(card(secTitle, blkNodes, 'sec6'));

  /* ⑦ 摘要提示词：挂载点 */
  nodes.push(h('div', { key: 'sec7', className: 'kami-card',
    ref: function (n) { mountPromptEditor(n, rt); } }));

  /* ⑧ 摘要条目状态 */
  var info = summaryInfo();
  var entryNodes = [];
  if (info.ok) {
    entryNodes.push(fieldRow(info.name, h('button', {
      type: 'button', className: 'kami-btn kami-btn--ghost', 'data-kami-act': 'toggle-entry'
    }, info.enabled ? COPY.entry.turnOff : COPY.entry.turnOn), 'er'));
  } else {
    entryNodes.push(note(info.error, 'ee'));
  }
  entryNodes.push(note(COPY.entry.note, 'en'));
  nodes.push(card(COPY.entry.section, entryNodes, 'sec8'));

  var keepScroll = bodyEl.scrollTop;
  if (!compressRoot) { bodyEl.textContent = ''; compressRoot = rt.createRoot(bodyEl); }
  rt.flushSync(function () { compressRoot.render(h(rt.React.Fragment, null, nodes)); });
  try { rt.classifyTree(bodyEl); } catch (e) { }
  bodyEl.scrollTop = keepScroll;
  renderStatus();
}


/* 页面根的 React 容器（面板关闭时要清掉，否则会往被移除的容器里渲染） */
var compressRoot = null;

/* 把复合组件产出的卡片「收养」进 React 渲染的那个容器：
   搬的是子节点 + 类名/属性，节点身份不变 ——
   复合组件内部持有的引用（input、按钮）依然有效。 */
function adoptCard(host, card) {
  if (!host || !card) { return; }
  if (card.className) { host.className = card.className; }
  var attrs = card.attributes || [];
  for (var i = 0; i < attrs.length; i++) {
    if (attrs[i].name === 'class') { continue; }
    try { host.setAttribute(attrs[i].name, attrs[i].value); } catch (e) { }
  }
  while (card.firstChild) { host.appendChild(card.firstChild); }
}

function mountModelConnection(host, rt) {
  if (!host || host.__kamiComposite) { return; }
  host.__kamiComposite = 1;
  try {
    var sec = createKamiUi(HDOC).modelConnection({
      render: renderKamiLlmModel,
      env: {
        state: cfg, copy: COPY, make: mk, document: HDOC,
        section: sectionCard, field: fieldRow, note: noteLine,
        text: textInput, select: selectRow,
        profiles: tavernCCProfiles, currentConfig: currentSumConfig,
        models: cachedModelList, fetchState: fetchState
      }
    });
    adoptCard(host, sec && sec.card ? sec.card : sec);
  } catch (e) {
    host.appendChild(mk('div', 'kami-card-note', '模型设置渲染失败：' + ((e && e.message) || e)));
  }
}

function mountPromptEditor(host, rt) {
  if (!host || host.__kamiComposite) { return; }
  host.__kamiComposite = 1;
  try {
    var sec = createKamiUi(HDOC).promptEditor({
      render: renderKamiLlmPrompts,
      env: {
        state: cfg, copy: COPY, make: mk, document: HDOC,
        section: sectionCard, field: fieldRow, note: noteLine,
        text: textInput, select: selectRow,
        snapshot: snapPrompts, currentTemplate: currentTpl
      }
    });
    adoptCard(host, sec && sec.card ? sec.card : sec);
  } catch (e) {
    host.appendChild(mk('div', 'kami-card-note', '提示词设置渲染失败：' + ((e && e.message) || e)));
  }
}
