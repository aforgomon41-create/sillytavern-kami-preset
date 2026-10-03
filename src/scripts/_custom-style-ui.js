/* ============================================================
 * 用户自定义文风 · 共享 UI 模块（渲染 + 交互 + 状态机）
 * ------------------------------------------------------------
 * **不是独立脚本**：src/scripts/meta.json 里不登记它（与 _preset-cards.js / _panel-gestures.js
 * 同一个套路）。构建期由 build/kami-doc.mjs 的 expandCustomStyleUi 内联进
 * 40-预设设置.js 与 50-引导.js，两个脚本里各留一行占位注释（占位符常量名见
 * build/kami-doc.mjs 的 CUSTOM_STYLE_UI_MARK）。
 * ⚠️ 本文件里**不许出现那串占位符字面量**：它会被内联进脚本，二次展开时就会自我复制
 * （展开器里有这条硬检查，撞上会直接构建失败）。
 *
 * 为什么要有这一份：这块功能一开始只长在引导面板里，用户 2026-10-02 要求预设设置面板
 * 也要有。本仓库的规矩写在 _preset-cards.js 头部：「同一个组件写两套，已经丢过两次功能」。
 * 所以整块（不只是结构）抽到这里 —— 状态机、DOM、事件、文案全在这一个文件里，
 * 两个面板各自只留一句「在我这块容器里挂一次」。
 *
 * ⚠️ 与 _preset-cards.js 的一处**有意不同**：那个模块「不挂事件」是因为它只建结构、
 *    两块面板的行为不同；这一块两块面板的行为**要求逐条一致**（用户拍板），
 *    所以事件与状态机必须一起共享 —— 分出去就又变成两套了。
 *
 * 写入一律走注入的 api（40-预设设置.js 暴露的 KamiPreset 子集）：
 *   api.customStyles({ anchorCards })        → 读
 *   api.applyCustomStyles({ anchorCards, adds, updates, removes }) → 写（保存才调）
 * 本模块**不碰预设**、不读全局、不自己造文案以外的界面文本。
 *
 * 文案唯一真相 = 本文件的 CUSTOM_STYLE_COPY（全是占位，等文案 agent 出稿替换）。
 * ============================================================ */

/* 两个面板共用的一份文案。改这里两个面板同时变 —— 这就是抽模块的目的。 */
export var CUSTOM_STYLE_COPY = {
  sectionTitle: '自定义文风',
  intro: '在这里添加或调整自己的文风，全部改好后点击保存才会生效',
  unsaved: '有改动还没保存',
  savedToast: '已保存到预设',
  addBtn: '新增',
  saveBtn: '保存',
  editBtn: '编辑',
  delBtn: '删除',
  undoBtn: '撤销',
  doomedTag: '待删除',
  pendingTag: '待保存',
  orphanTag: '原分组失效',
  /* {n} 会被替换成条数（与 stepCounter 同一套替换规矩） */
  orphanNote: '有 {n} 条自定义文风现在不在任何一组里，多半是预设更新挪了位置。点右边的编辑重新选一组，保存就会归位。',
  okBtn: '确定',
  cancelBtn: '取消',
  nameLabel: '文风名称',
  groupLabel: '所属分组',
  contentLabel: '文风内容',
  namePlaceholder: '给文风起个名字',
  contentPlaceholder: '写下具体的行文风格和描写要求',
  modeSingle: '选一',
  modeAny: '任选',
  modeNoteSingle: '同组只能开启一条，启用这条会自动关掉同组其它文风',
  modeNoteAny: '同组可以同时开启多条，你能根据喜好自由搭配组合',
  empty: '还没有文风，点击新增写一条',
  degrade: '配套脚本当前没有运行，请刷新网页重新加载',
  noSection: '当前预设缺少写作指导分区，请换用完整预设',
  nameRequired: '请先填写文风名字',
  errNoTree: '无法读取当前预设，请刷新页面后再试一次',
  errNoSection: '预设缺少写作指导分区，请切换到完整预设再保存',
  errNoSectionEnd: '读不到写作指导分区的收尾标记。为了不把文风插到外面出看不见的毛病，这个功能先停用了。',
  errOrderShape: '预设排序结构异常，请重新选择预设或刷新网页',
  errVerify: '内容校验未通过，修改已复原，请检查后重新保存',
  errSave: '写入预设失败，改动已复原，请重试或刷新网页',
  errName: '文风名字不合规范，请换个简单名字重新保存',
  errGroup: '所选分组在预设中不存在，请重新选择分组再保存',
  errGeneric: '保存出现未知问题，请刷新网页后再试一次'
};

/* 这块 UI 自己的样式。**跟着模块走**，两个面板各注入一次 —— 否则两边会长得不一样，
   而"同一组件两套长相"正是当初要收口的那件事。
   只用契约里的令牌，且避开裸的 --kami-fg / --kami-bg（lint-guide 的护栏盯着这一层）。 */
export var CUSTOM_STYLE_CSS = [
  '.kami-cs{margin-top:var(--kami-gap-lg,12px);}',
  '.kami-cs-sec{display:flex;align-items:center;gap:var(--kami-gap,8px);margin:var(--kami-gap,8px) 0;}',
  '.kami-cs-sec > span{font-weight:var(--kami-fw-title,600);letter-spacing:var(--kami-ls-title,.04em);}',
  '.kami-cs-note{margin:4px 0;font-size:var(--kami-fs-xs,12px);color:var(--kami-fg-mute,currentColor);}',
  '.kami-cs-row{display:flex;align-items:center;gap:var(--kami-gap,8px);padding:var(--kami-pad-y,6px) 0;',
  'border-bottom:1px solid var(--kami-line,currentColor);flex-wrap:wrap;}',
  '.kami-cs-row[data-kami-cs-doomed]{opacity:.55;}',
  '.kami-cs-row[data-kami-cs-orphan] .kami-cs-name{color:var(--kami-warn,currentColor);}',
  '.kami-cs-name{flex:1 1 auto;min-width:0;color:var(--kami-fg-dim,currentColor);}',
  '.kami-cs-acts{flex:none;display:flex;gap:var(--kami-gap,8px);}',
  '.kami-cs-bar{display:flex;align-items:center;gap:var(--kami-gap,8px);margin-top:var(--kami-gap,8px);flex-wrap:wrap;}',
  '.kami-cs-form{margin:var(--kami-gap,8px) 0;}',
  '.kami-cs-form .kami-field{align-items:flex-start;}',
  '.kami-cs-form .kami-text,.kami-cs-form .kami-textarea,.kami-cs-form .kami-select{width:100%;min-width:180px;}',
  '.kami-cs-form .kami-textarea{min-height:96px;}'
].join('');

/**
 * 建一块「自定义文风」。
 * @param ctx {
 *   doc,          文档对象（40 = HDOC，50 = HDOC）—— 本模块不读全局
 *   api,          { customStyles, applyCustomStyles }；缺任一个就整块降级成说明文字
 *   toast,        function(kind, msg)
 *   log,          function(msg)（可选）
 *   onSaved,      function()（可选）保存成功后调用：引导重画步骤 / 面板重画自己
 *   anchorCards,  （可选）分区锚点卡片名数组；不传就只按层级名找（DIY_LAYER_HINT）
 * }
 * @returns { mount(container), refresh(), state(), copy }
 *   mount 会把 container 清空后重画；草稿只活在这一次 mount 到下一次 refresh 之间
 *   （与引导面板原本的行为一致：换页/换 tab 重来）。
 */
export function customStyleBlock(ctx) {
  var H = ctx || {};
  var DOC = H.doc;
  var CP = CUSTOM_STYLE_COPY;
  var st = null;
  var root = null;

  function el(tag, cls, text) {
    var n = DOC.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null && text !== '') { n.textContent = String(text); }
    return n;
  }
  function log(msg) { if (typeof H.log === 'function') { try { H.log(msg); } catch (e) { } } }
  function toast(kind, msg) { if (typeof H.toast === 'function') { try { H.toast(kind, msg); } catch (e) { } } }
  function stripBrackets(s) { return String(s || '').split('[').join('').split(']').join('').trim(); }
  function apiOf() {
    var a = H.api;
    if (!a) { return null; }
    if (typeof a.customStyles !== 'function' || typeof a.applyCustomStyles !== 'function') { return null; }
    return a;
  }
  function groupById(id) {
    var gs = (st && st.groups) || [], i;
    for (i = 0; i < gs.length; i++) { if (gs[i].headIdentifier === id) { return gs[i]; } }
    return null;
  }
  function groupLabel(g) {
    if (!g) { return CP.orphanTag; }
    return stripBrackets(g.cardName) + ' · ' + (g.cardMode === '单选' ? CP.modeSingle : CP.modeAny);
  }
  function dirty() {
    if (!st) { return 0; }
    var n = st.adds.length, k;
    for (k in st.edits) { if (Object.prototype.hasOwnProperty.call(st.edits, k) && !st.removes[k]) { n++; } }
    for (k in st.removes) { if (Object.prototype.hasOwnProperty.call(st.removes, k)) { n++; } }
    return n;
  }
  function errText(code) {
    if (code === 'NO_TREE') { return CP.errNoTree; }
    if (code === 'NO_SECTION') { return CP.errNoSection; }
    if (code === 'NO_SECTION_END') { return CP.errNoSectionEnd; }
    if (code === 'ORDER_SHAPE') { return CP.errOrderShape; }
    if (code === 'VERIFY_FAIL' || code === 'APPLY_FAIL') { return CP.errVerify; }
    if (code === 'SAVE_FAIL') { return CP.errSave; }
    if (code === 'BAD_NAME') { return CP.errName; }
    if (code === 'GROUP_NOT_FOUND' || code === 'GROUP_EMPTY' || code === 'GROUP_TAIL_MISSING') { return CP.errGroup; }
    return CP.errGeneric;
  }
  function load() {
    var a = apiOf();
    st = { groups: [], entries: [], adds: [], edits: {}, removes: {}, open: null, err: null, degrade: !a, closeOk: true };
    if (!a) { return; }
    var r = null;
    try { r = a.customStyles({ anchorCards: H.anchorCards || null }); } catch (e) { r = { ok: false, code: 'NO_TREE' }; }
    if (!r || !r.ok) { st.err = (r && r.code) || 'NO_TREE'; return; }
    st.groups = r.groups || [];
    st.entries = r.entries || [];
    st.layerName = r.layerName;
    st.closeOk = (r.closeOk !== false);
  }
  function btn(label, cls, onClick) {
    var b = el('button', cls || 'kami-btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function paint() {
    if (!root || !st) { return; }
    while (root.firstChild) { root.removeChild(root.firstChild); }
    var wrap = el('div', 'kami-cs');
    wrap.setAttribute('data-kami-cs', '1');
    root.appendChild(wrap);

    var sec = el('div', 'kami-cs-sec');
    sec.appendChild(el('span', '', CP.sectionTitle));
    wrap.appendChild(sec);
    wrap.appendChild(el('p', 'kami-cs-note', CP.intro));

    if (st.degrade) { wrap.appendChild(el('p', 'kami-cs-note', CP.degrade)); return; }
    if (st.err) { wrap.appendChild(el('p', 'kami-cs-note', CP.noSection)); return; }

    var i, dirtyN = dirty();
    if (dirtyN) { wrap.appendChild(el('p', 'kami-cs-note', CP.unsaved + '（' + dirtyN + '）')); }

    /* 收尾标记读不到 → 只能看不能改（写侧也会硬拒绝，这里先把按钮收起来，别让用户白点） */
    var canWrite = (st.closeOk !== false);
    if (!canWrite) { wrap.appendChild(el('p', 'kami-cs-note', CP.errNoSectionEnd)); }

    /* 掉出组的条目：先数一遍，好把解释放在列表**上面**（用户先看到原因，再看那几行） */
    var orphanN = 0;
    for (i = 0; i < st.entries.length; i++) {
      var eo = st.entries[i];
      if (st.removes[eo.identifier]) { continue; }
      var eoEd = st.edits[eo.identifier];
      if (!groupById(eoEd ? eoEd.groupHeadId : eo.groupHeadId)) { orphanN++; }
    }
    if (orphanN) { wrap.appendChild(el('p', 'kami-cs-note', CP.orphanNote.replace('{n}', String(orphanN)))); }

    /* 现有条目（带删除标记的留在原位、变灰，可以撤销） */
    var shown = 0;
    for (i = 0; i < st.entries.length; i++) {
      var e = st.entries[i];
      var doomed = !!st.removes[e.identifier];
      var ed = st.edits[e.identifier];
      var row = el('div', 'kami-cs-row');
      row.setAttribute('data-kami-cs-row', e.identifier);
      if (doomed) { row.setAttribute('data-kami-cs-doomed', '1'); }
      row.appendChild(el('span', 'kami-cs-name', ed ? ed.display : e.display));
      var g = groupById(ed ? ed.groupHeadId : e.groupHeadId);
      if (!g) { row.setAttribute('data-kami-cs-orphan', '1'); }
      row.appendChild(el('span', 'kami-chip', groupLabel(g)));
      if (doomed) { row.appendChild(el('span', 'kami-chip', CP.doomedTag)); }
      else if (ed) { row.appendChild(el('span', 'kami-chip', CP.pendingTag)); }
      var acts = el('span', 'kami-cs-acts');
      (function (ent, isDoomed, editRec) {
        if (isDoomed) {
          acts.appendChild(btn(CP.undoBtn, 'kami-btn kami-btn--ghost', function () {
            delete st.removes[ent.identifier];
            paint();
          }));
        } else {
          acts.appendChild(btn(CP.editBtn, 'kami-btn kami-btn--ghost', function () {
            st.open = {
              kind: 'edit', identifier: ent.identifier,
              display: editRec ? editRec.display : ent.display,
              groupHeadId: editRec ? editRec.groupHeadId : ent.groupHeadId,
              content: editRec ? editRec.content : ent.content
            };
            paint();
          }));
          acts.appendChild(btn(CP.delBtn, 'kami-btn kami-btn--ghost', function () {
            st.removes[ent.identifier] = true;   /* 只是打标记，保存时才真的删 */
            delete st.edits[ent.identifier];
            st.open = null;
            paint();
          }));
        }
      })(e, doomed, ed);
      row.appendChild(acts);
      wrap.appendChild(row);
      shown++;
    }

    /* 还没保存的新条目 */
    for (i = 0; i < st.adds.length; i++) {
      (function (idx) {
        var a = st.adds[idx];
        var row = el('div', 'kami-cs-row');
        row.setAttribute('data-kami-cs-new', String(idx));
        row.appendChild(el('span', 'kami-cs-name', a.display));
        row.appendChild(el('span', 'kami-chip', groupLabel(groupById(a.groupHeadId))));
        row.appendChild(el('span', 'kami-chip', CP.pendingTag));
        var acts = el('span', 'kami-cs-acts');
        acts.appendChild(btn(CP.editBtn, 'kami-btn kami-btn--ghost', function () {
          st.open = { kind: 'add', index: idx, display: a.display, groupHeadId: a.groupHeadId, content: a.content };
          paint();
        }));
        acts.appendChild(btn(CP.undoBtn, 'kami-btn kami-btn--ghost', function () {
          st.adds.splice(idx, 1);
          if (st.open && st.open.kind === 'add') { st.open = null; }
          paint();
        }));
        row.appendChild(acts);
        wrap.appendChild(row);
        shown++;
      })(i);
    }
    if (!shown && !st.open) { wrap.appendChild(el('p', 'kami-cs-note', CP.empty)); }

    if (st.open && canWrite) { wrap.appendChild(form(wrap)); }

    if (!canWrite) { return; }

    var bar = el('div', 'kami-cs-bar');
    bar.appendChild(btn(CP.addBtn, 'kami-btn', function () {
      var first = st.groups.length ? st.groups[0].headIdentifier : null;
      st.open = { kind: 'add', index: -1, display: '', groupHeadId: first, content: '' };
      paint();
    }));
    var saveBtn = btn(CP.saveBtn, 'kami-btn kami-btn--primary', function () { save(); });
    if (!dirtyN) { saveBtn.disabled = true; }
    bar.appendChild(saveBtn);
    wrap.appendChild(bar);
  }

  /* 编辑区：名字 / 组（带模式）/ 内容。确定之前什么都不落进草稿以外的地方。 */
  function form() {
    var o = st.open, i;
    var box = el('div', 'kami-cs-form kami-card');
    var body = el('div', 'kami-card-body');
    box.appendChild(body);

    var f1 = el('div', 'kami-field');
    f1.appendChild(el('span', 'kami-field-label', CP.nameLabel));
    var v1 = el('span', 'kami-field-value');
    var nameIn = el('input', 'kami-text');
    nameIn.type = 'text';
    nameIn.value = o.display || '';
    nameIn.setAttribute('placeholder', CP.namePlaceholder);
    v1.appendChild(nameIn);
    f1.appendChild(v1);
    body.appendChild(f1);

    var f2 = el('div', 'kami-field');
    f2.appendChild(el('span', 'kami-field-label', CP.groupLabel));
    var v2 = el('span', 'kami-field-value');
    var sel = el('select', 'kami-select');
    for (i = 0; i < st.groups.length; i++) {
      var g = st.groups[i];
      var opt = el('option', '', groupLabel(g));
      opt.value = g.headIdentifier;
      if (g.headIdentifier === o.groupHeadId) { opt.selected = true; }
      sel.appendChild(opt);
    }
    v2.appendChild(sel);
    f2.appendChild(v2);
    body.appendChild(f2);

    /* 目标组的模式：用户必须能看出是选一还是任选（用户拍板第 6 条） */
    var note = el('p', 'kami-cs-note', '');
    function paintModeNote() {
      var g = groupById(sel.value);
      note.textContent = (g && g.cardMode === '单选') ? CP.modeNoteSingle : CP.modeNoteAny;
    }
    paintModeNote();
    sel.addEventListener('change', paintModeNote);
    body.appendChild(note);

    body.appendChild(el('div', 'kami-field', CP.contentLabel));
    var ta = el('textarea', 'kami-textarea');
    ta.value = o.content || '';
    ta.setAttribute('placeholder', CP.contentPlaceholder);
    body.appendChild(ta);

    var bar = el('div', 'kami-cs-bar');
    bar.appendChild(btn(CP.okBtn, 'kami-btn kami-btn--primary', function () {
      var nm = String(nameIn.value || '').trim();
      if (!nm) { toast('warning', CP.nameRequired); return; }
      var rec = { display: nm, groupHeadId: sel.value, content: String(ta.value || '') };
      if (o.kind === 'add') {
        if (o.index >= 0) { st.adds[o.index] = rec; } else { st.adds.push(rec); }
      } else {
        st.edits[o.identifier] = rec;
        delete st.removes[o.identifier];
      }
      st.open = null;
      paint();
    }));
    bar.appendChild(btn(CP.cancelBtn, 'kami-btn kami-btn--ghost', function () {
      st.open = null;
      paint();
    }));
    box.appendChild(bar);
    return box;
  }

  /* 保存：把草稿整理成 req 交给注入的 api。写坏了由 40 号回滚，这里只负责把结果说成人话。 */
  function save() {
    var a = apiOf();
    if (!a) { toast('error', CP.degrade); return; }
    var req = { anchorCards: H.anchorCards || null, adds: [], updates: [], removes: [] };
    var i, k;
    for (i = 0; i < st.adds.length; i++) {
      req.adds.push({ display: st.adds[i].display, groupHeadId: st.adds[i].groupHeadId, content: st.adds[i].content });
    }
    for (k in st.edits) {
      if (!Object.prototype.hasOwnProperty.call(st.edits, k)) { continue; }
      if (st.removes[k]) { continue; }
      req.updates.push({ identifier: k, display: st.edits[k].display, groupHeadId: st.edits[k].groupHeadId, content: st.edits[k].content });
    }
    for (k in st.removes) {
      if (Object.prototype.hasOwnProperty.call(st.removes, k)) { req.removes.push(k); }
    }
    var r = null;
    try { r = a.applyCustomStyles(req); } catch (e) { r = { ok: false, code: 'SAVE_FAIL' }; }
    if (!r || !r.ok) {
      toast('error', errText(r && r.code));
      log('自定义文风保存失败：' + ((r && r.code) || '?') + ' ' + ((r && r.detail) || ''));
      return;
    }
    toast('success', CP.savedToast);
    st = null;
    if (typeof H.onSaved === 'function') { try { H.onSaved(); } catch (e2) { log('onSaved 抛了：' + ((e2 && e2.message) || e2)); } }
  }

  return {
    mount: function (container) { root = container; load(); paint(); },
    refresh: function () { load(); paint(); },
    state: function () { return st; },
    copy: CUSTOM_STYLE_COPY
  };
}
