/* ============================================================
 * 卡密预设 · 三方合并引擎（纯函数，无 DOM、无网络）
 * ------------------------------------------------------------
 * 本模块**不是独立脚本**（src/scripts/meta.json 里没有它），构建期内联进
 * 「🔄 远程更新」脚本（build/kami-doc.mjs 的 expandPresetMerge，挂在 expandPanelGestures
 * 链里一起展开）。裁决 UI（🌟 预设设置里那页「更新合并」）只读计划对象、不参与计算，
 * 所以**不**内联它 —— 面板脚本不必背一份引擎。
 * 与 _panel-gestures / _preset-cards 同一条内联规则：export 声明剥掉行首前缀落进
 * 调用方的 IIFE 内部；全文不许出现 import（脚本运行环境没有模块系统），
 * 也不许出现自己的占位符字面量（内联会自我复制，kami-doc.mjs 有硬检查）。
 * 全部 ES5 写法（var / function，不用箭头函数与模板串），和其它脚本保持一致。
 *
 * ── 三方合并的输入 ──
 *   base   用户**当前这一版**的原始内容（按用户版本号对应的 tag 从仓库镜像取的原始预设；
 *          取不到 = null，进退化模式）
 *   theirs 用户**现在的预设**（酒馆活设置 chatCompletionSettings 的一份深拷贝）
 *   next   刚下载到的新版预设
 *
 * ── 合并口径（硬规格，2026-09-25 定稿）──
 *   A. 一律以用户为准，不询问、不覆盖：
 *      1. 条目开关 prompts[].enabled
 *      2. 顺序表里的开关 prompt_order[].order[].enabled
 *      3. 脚本开关与脚本内设置 scripts[].enabled / [].data（皮肤选择、压缩参数、
 *         反截断开关、面板位置、lastCheckAt …全在 data 里）
 *      4. 脚本变量 extensions.tavern_helper.variables
 *      5. 顶层参数（prompts / prompt_order / extensions 之外的一切字段）
 *      6. 正则的开关 regex_scripts[].disabled
 *   B. 条目内容 / 顺序 / 增减：自动辨别，只有「真冲突」才问用户：
 *      · 条目按 identifier 对齐；「用户动过」= theirs 与 base 在除 enabled 外的任何字段
 *        上不同；「新版动过」= next 与 base 在该条目上不同（同样除 enabled）；
 *      · 只有用户动过 → theirs（不问）；只有新版动过 → next（不问）；
 *        两边都动过 → 待裁决清单（默认「保留我的」）；
 *      · 新版新增 → 加进来（不问）；用户新增 → 保留（不问）；用户删掉 → 不加回来（不问）；
 *        若这条同时被新版改过 → 待裁决（默认＝保持删除）；
 *      · 新版删掉而用户没动过的条目 → 跟着新版删（更新的一部分）；
 *      · 顺序（prompt_order[].order 的排列）：单边调 → 用那一边；双边都调 → 待裁决（一项）。
 *      · base 取不到（认不出用户版本 / 版本太老 / 镜像缺失）→ 退化模式：
 *        theirs 与 next 的每一处差异都当成待裁决（只对两边都有的条目与顺序），
 *        默认一律「保留我的」；新版新增的条目照旧直接加、用户删掉的不加回来。
 *        宁可少更新，也不许动用户的东西。
 *   C. 一律用 next：脚本正文 / 名字 / info / button / export_with；
 *      以及 base 里没有而 next 有的条目结构。正则条目与提示词条目走同一套三方合并
 *      （正文 findRegex / replaceString 在「只有新版动过」时照常更新；用户与新版两边
 *      都改过的才算冲突），开关 disabled 永远留在用户手里。
 *   D. 写盘纪律（写法在 70-远程更新.js）：先备份 theirs，再把合并结果导入成**新预设**，
 *      绝不覆盖原文件。
 *
 * ── 待裁决项结构 ──
 *   { key, kind, id, name, fields }
 *     kind = 'prompt'（两边都改过的条目）| 'delete'（用户删了、新版又改过）
 *          | 'order'（排列两边都调过；每条 prompt_order 最多一项）
 *          | 'regex'（正则两边都改过）
 *   choice 由裁决 UI 填：'mine'（保留我的，默认）| 'next'（用新版）。
 *   key 约定：'pm:<identifier>' / 'rm:<identifier>' / 'ord:<character_id>' / 'rx:<id>'。
 *     （正则被用户删了又被新版改过也用 'rm:'；kind 同为 'delete'。）
 * ============================================================ */

/* ───────────── 导出函数（行首 export 由构建期内联时剥掉） ───────────── */

export function computeMergePlan(base, theirs, next) {
  var a = analyze(base, theirs, next, null);
  return a.plan;
}

export function applyMergePlan(base, theirs, next, plan) {
  var a = analyze(base, theirs, next, plan || null);
  return { merged: a.merged, report: a.report, plan: a.plan };
}

/* ────────────────────────── 内部实现 ────────────────────────── */

function cloneObj(o) {
  try {
    if (o === undefined || o === null || typeof o !== 'object') { return o; }
    return JSON.parse(JSON.stringify(o));
  } catch (e) { return o; }
}
function cleanStr(v) {
  try { return (v === undefined || v === null) ? '' : String(v).replace(/^[\s\u200B]+|[\s\u200B]+$/g, ''); }
  catch (e) { return ''; }
}
function isPreset(o) { return !!o && typeof o === 'object'; }
function defined(v) { return v !== undefined && v !== null; }
function hasKey(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

/* 结构相等（不依赖键序）。只比较预设里的 JSON 数据。 */
function deepEq(a, b) {
  if (a === b) { return true; }
  if (a === undefined || b === undefined) { return false; }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) { return false; }
  var ka = Object.keys(a), kb = Object.keys(b), i;
  if (ka.length !== kb.length) { return false; }
  for (i = 0; i < ka.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) { return false; }
    if (!deepEq(a[ka[i]], b[ka[i]])) { return false; }
  }
  return true;
}

function indexById(list) {
  var m = {}, i;
  for (i = 0; i < list.length; i++) {
    var id = cleanStr(list[i] && list[i].identifier);
    if (id && m[id] === undefined) { m[id] = list[i]; }
  }
  return m;
}
function identsOf(list) {
  var out = [], i;
  for (i = 0; i < list.length; i++) { out.push(cleanStr(list[i] && list[i].identifier)); }
  return out;
}
function seqEq(a, b) {
  if (!a || !b || a.length !== b.length) { return false; }
  var i;
  for (i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return false; } }
  return true;
}
function arrOf(v) { return Array.isArray(v) ? v : []; }
function uniqueList(list) {
  var out = [], i;
  for (i = 0; i < list.length; i++) { if (out.indexOf(list[i]) < 0) { out.push(list[i]); } }
  return out;
}
function orderIdMap(list, key) {
  var m = {}, i;
  for (i = 0; i < list.length; i++) {
    var id = cleanStr(list[i] && list[i][key || 'identifier']);
    if (id && m[id] === undefined) { m[id] = list[i]; }
  }
  return m;
}

/* 差异字段集合：x 相对 b 在哪些**两边都有**的字段上不同（identifier / skipKey 不算）。
   一边独有的字段不算差异：一边是酒馆运行时挂上的标准字段、或是对方版本还没有的
   新结构，都不该被当成「用户动过」或「新版动过」。 */
function diffPair(b, x, skipKey) {
  if (!x || typeof x !== 'object') { return []; }
  var keys = {}, k, out = [];
  for (k in x) { if (Object.prototype.hasOwnProperty.call(x, k)) { keys[k] = 1; } }
  if (b) { for (k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) { keys[k] = 1; } } }
  for (k in keys) {
    if (!Object.prototype.hasOwnProperty.call(keys, k)) { continue; }
    if (k === 'identifier' || k === skipKey) { continue; }
    if (!hasKey(b, k) || !hasKey(x, k)) { continue; }
    if (!deepEq(x[k], b[k])) { out.push(k); }
  }
  return out;
}

/* 决定合并条目的 enabled（硬规格 A1/A2：开关留在用户手里）。 */
function enabledOf(tObj, nObj, tOrderItem, nOrderItem) {
  if (tOrderItem && defined(tOrderItem.enabled)) { return !!tOrderItem.enabled; }
  if (tObj && defined(tObj.enabled)) { return !!tObj.enabled; }
  if (nOrderItem && defined(nOrderItem.enabled)) { return !!nOrderItem.enabled; }
  if (nObj && defined(nObj.enabled)) { return !!nObj.enabled; }
  return true;
}
function orderItemOf(entry, id) {
  var list = (entry && entry.order) ? entry.order : null, i;
  if (!list) { return null; }
  for (i = 0; i < list.length; i++) {
    if (list[i] && cleanStr(list[i].identifier) === id) { return list[i]; }
  }
  return null;
}
function orderEntryOf(list, cid) {
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i] && cleanStr(list[i].character_id) === cleanStr(cid)) { return list[i]; }
  }
  return null;
}

/* ── 主分析 ── 一次分析同时产出 plan / merged / report：
   · computeMergePlan（decisions=null）→ 冲突全部按默认「保留我的」叠，只出清单与统计；
   · applyMergePlan（decisions=plan）→ 按 conflicts[].choice 落地。
   merged 里的 prompts / prompt_order / extensions / name 永远重新构造；
   其余顶层字段一律以 theirs 为准（A5）。 */
function analyze(base, theirs, next, decisions) {
  var degraded = !(isPreset(base) && Array.isArray(base.prompts));
  var plan = { degraded: degraded, stats: { applied: 0, kept: 0, added: 0, conflicts: 0 }, conflicts: [] };
  var report = {
    degraded: degraded,
    applied: 0, kept: 0, added: 0, followedRemovals: 0, restored: 0,
    decidedMine: 0, decidedNext: 0, conflicts: 0
  };

  var T = isPreset(theirs) ? theirs : {};
  var N = isPreset(next) ? next : {};
  var B = (!degraded && isPreset(base)) ? base : {};
  var TP = arrOf(T.prompts), NP = arrOf(N.prompts), BP = degraded ? [] : arrOf(B.prompts);
  var tI = indexById(TP), nI = indexById(NP), bI = indexById(BP);
  var T_ORD = arrOf(T.prompt_order), N_ORD = arrOf(N.prompt_order), B_ORD = degraded ? [] : arrOf(B.prompt_order);

  var decisionsMap = {};
  if (decisions && Array.isArray(decisions.conflicts)) {
    for (var di = 0; di < decisions.conflicts.length; di++) {
      var d = decisions.conflicts[di];
      if (d && d.key) { decisionsMap[d.key] = (d.choice === 'next') ? 'next' : 'mine'; }
    }
  }
  function isNext(key) { return decisionsMap[key] === 'next'; }
  function pushConflict(kind, key, id, name, fields) {
    var i;
    for (i = 0; i < plan.conflicts.length; i++) { if (plan.conflicts[i].key === key) { return; } }
    plan.conflicts.push({ key: key, kind: kind, id: id, name: cleanStr(name) || cleanStr(id), fields: fields });
  }

  /* 主处理顺序表：theirs 里第一条带 order 的（酒馆预设通常只有 character_id 100001 一条）。
     其它 prompt_order 条目（别的会话）在下一段按各自 character_id 照同样口径处理。 */
  var tMainEntry = null, nMainEntry = null, i, j;
  for (i = 0; i < T_ORD.length; i++) {
    if (T_ORD[i] && arrOf(T_ORD[i].order).length) { tMainEntry = T_ORD[i]; break; }
  }
  if (tMainEntry) { nMainEntry = orderEntryOf(N_ORD, cleanStr(tMainEntry.character_id)); }

  /* 用 next 造合并条目（开关按 enabledOf 兜底）。 */
  function fromNextPrompt(n, tObj, tOrdItem, nOrdItem) {
    var m = cloneObj(n) || {};
    m.enabled = enabledOf(tObj, n, tOrdItem, nOrdItem);
    return m;
  }

  /* ── ② 提示词条目合并 ── */
  var mergedPrompts = [];
  for (i = 0; i < TP.length; i++) {
    var t = TP[i];
    var id = cleanStr(t && t.identifier);
    if (!id) { mergedPrompts.push(cloneObj(t)); continue; }
    var b = degraded ? null : (bI[id] || null);
    var n = nI[id] || null;
    var tOrdItem = tMainEntry ? orderItemOf(tMainEntry, id) : null;
    var nOrdItem = nMainEntry ? orderItemOf(nMainEntry, id) : null;
    if (!n) {
      var userF0 = degraded ? [] : diffPair(b, t, 'enabled');
      if (!degraded && b && !userF0.length) {
        /* 用户没动过它、新版删了 → 跟着删（更新的一部分，不弹窗） */
        report.followedRemovals++;
      } else {
        mergedPrompts.push(cloneObj(t));
        report.kept++;
      }
      continue;
    }
    var userF, nextF;
    if (degraded) {
      /* base 取不到 → 没法判断「谁动过」：把 theirs 与 next 的每处差异当成待裁决，
         走同一条「两边都动过」的裁决分支（choice 默认 mine = 保留用户） */
      userF = diffPair(t, n, 'enabled');
      nextF = userF;   /* 两边「都动过」的裁决分支同一形态：冲突项默认保留用户 */
    } else {
      userF = diffPair(b, t, 'enabled');
      nextF = diffPair(b, n, 'enabled');
    }
    if (userF.length && nextF.length) {
      var key = 'pm:' + id;
      pushConflict('prompt', key, id, t.name || n.name || id, uniqueList(userF.concat(nextF)));
      if (isNext(key)) {
        mergedPrompts.push(fromNextPrompt(n, t, tOrdItem, nOrdItem));
        report.applied++; report.decidedNext++;
      } else {
        mergedPrompts.push(cloneObj(t));
        report.kept++; report.decidedMine++;
      }
      continue;
    }
    if (nextF.length) {
      mergedPrompts.push(fromNextPrompt(n, t, tOrdItem, nOrdItem));
      report.applied++;
      continue;
    }
    /* 只有（或没有）用户动过 → 用户的就是最终态 */
    mergedPrompts.push(cloneObj(t));
    if (userF.length) { report.kept++; }
  }

  /* next-only 条目（theirs 没有）：新版新增照加；用户删的照删（除非新版又改过 → 待裁决） */
  for (j = 0; j < NP.length; j++) {
    var nn = NP[j];
    var id2 = cleanStr(nn && nn.identifier);
    if (!id2 || tI[id2] !== undefined) { continue; }
    var bb = degraded ? null : (bI[id2] || null);
    if (!degraded && bb) {
      var nCh = diffPair(bb, nn, 'enabled');
      var keyR = 'rm:' + id2;
      if (nCh.length) {
        pushConflict('delete', keyR, id2, nn.name || id2, nCh);
        if (isNext(keyR)) {
          mergedPrompts.push(fromNextPrompt(nn, null, null, nMainEntry ? orderItemOf(nMainEntry, id2) : null));
          report.applied++; report.restored++; report.decidedNext++;
        } else {
          report.kept++; report.decidedMine++;   /* 保持删除 */
        }
      }
      /* 新版没改它 → 用户删掉的就是最终态，不加回来 */
      continue;
    }
    mergedPrompts.push(fromNextPrompt(nn, null, null, nMainEntry ? orderItemOf(nMainEntry, id2) : null));
    report.added++;
  }

  var mergedSet = {};
  for (i = 0; i < mergedPrompts.length; i++) {
    var mid = cleanStr(mergedPrompts[i] && mergedPrompts[i].identifier);
    if (mid) { mergedSet[mid] = 1; }
  }

  /* ── ③ 顺序（prompt_order[].order 的**排列**）；顺序项里的开关永远是用户的 ── */
  var mergedOrder = [];
  function mergedOrderEntry(tE, nE, winner) {
    var seqT = identsOf(arrOf(tE && tE.order));
    var seqN = identsOf(arrOf(nE && nE.order));
    var baseSeq = (winner === 'next') ? seqN : seqT;
    var seq = [];
    for (var p = 0; p < baseSeq.length; p++) {
      var idp = baseSeq[p];
      if (mergedSet[idp] && seq.indexOf(idp) < 0) { seq.push(idp); }
    }
    /* 合并后还存在的条目补进表尾：用户自加的在 theirs 段、新版新增的在 next 段 */
    for (var q = 0; q < seqT.length; q++) {
      var idT = seqT[q];
      if (mergedSet[idT] && seq.indexOf(idT) < 0) { seq.push(idT); }
    }
    for (var r = 0; r < seqN.length; r++) {
      var idN = seqN[r];
      if (mergedSet[idN] && seq.indexOf(idN) < 0) { seq.push(idN); }
    }
    var me = cloneObj(tE) || {};
    me.order = [];
    for (var s = 0; s < seq.length; s++) {
      var iid = seq[s];
      var tIt = orderItemOf(tE, iid);
      var nIt = orderItemOf(nE, iid);
      var it = cloneObj(tIt) || {};
      it.identifier = iid;
      it.enabled = enabledOf(tI[iid] || null, nI[iid] || null, tIt, nIt);
      me.order.push(it);
    }
    return me;
  }
  for (i = 0; i < T_ORD.length; i++) {
    var tE = T_ORD[i];
    var cid = cleanStr(tE && tE.character_id);
    var nE = orderEntryOf(N_ORD, cid);
    if (!nE) { mergedOrder.push(cloneObj(tE)); report.kept++; continue; }
    var bE = degraded ? null : orderEntryOf(B_ORD, cid);
    var seqT0 = identsOf(arrOf(tE && tE.order));
    var seqN0 = identsOf(arrOf(nE && nE.order));
    var seqB0 = (bE && bE.order) ? identsOf(arrOf(bE.order)) : null;
    /* 判「谁调过排列」只看**对比的基准里就有**的条目（theirs·next 各自新增的排条不算：
       两个版本各自往尾部加自己的新条目，不是「调整顺序」，一律不该弹裁决） */
    var knownSet = {};
    for (var kk = 0; kk < seqT0.length; kk++) {
      if (mergedSet[seqT0[kk]] && (degraded ? nI[seqT0[kk]] : bI[seqT0[kk]])) { knownSet[seqT0[kk]] = 1; }
    }
    function filteredOrder(seq) {
      var out2 = [], x2;
      for (var xI = 0; xI < seq.length; xI++) {
        x2 = seq[xI];
        if (knownSet[x2] && out2.indexOf(x2) < 0) { out2.push(x2); }
      }
      return out2;
    }
    var winner = 'theirs';
    var keyOrd = 'ord:' + cid;
    if (degraded || !seqB0) {
      if (!seqEq(filteredOrder(seqT0), filteredOrder(seqN0))) {
        pushConflict('order', keyOrd, cid, '条目排列', ['排列']);
        if (isNext(keyOrd)) { winner = 'next'; report.applied++; report.decidedNext++; }
        else { report.kept++; report.decidedMine++; }
      }
    } else {
      /* 正常模式：用户动过 = theirs 的已知条目排列 ≠ base；新版同理 */
      var userCh = !seqEq(filteredOrder(seqT0), filteredOrder(seqB0));
      var nextCh = !seqEq(filteredOrder(seqN0), filteredOrder(seqB0));
      if (userCh && nextCh) {
        pushConflict('order', keyOrd, cid, '条目排列', ['排列']);
        if (isNext(keyOrd)) { winner = 'next'; report.applied++; report.decidedNext++; }
        else { report.kept++; report.decidedMine++; }
      } else if (nextCh) {
        winner = 'next'; report.applied++;
      }
    }
    mergedOrder.push(mergedOrderEntry(tE, nE, winner));
  }
  /* theirs 没有、新版才有的会话 / 角色：它就是新结构，原样加进来（只留合并后还在的条目） */
  for (i = 0; i < N_ORD.length; i++) {
    var nE2 = N_ORD[i];
    if (!nE2 || orderEntryOf(T_ORD, cleanStr(nE2.character_id))) { continue; }
    var copy = cloneObj(nE2) || {};
    var kept = [], keepList = arrOf(copy.order);
    for (j = 0; j < keepList.length; j++) {
      var iid2 = cleanStr(keepList[j] && keepList[j].identifier);
      if (iid2 && mergedSet[iid2]) { kept.push(keepList[j]); }
    }
    copy.order = kept;
    mergedOrder.push(copy);
    report.applied++;
  }

  /* ── ④ 顶层字段（A5）─ theirs 的全部原样保留；next 独有的加进来；name 取新版本的。 ──
     （name 是「这份文件是谁」的身份；ST 加载预设时会剔除顶层 name，不影响用户读数。） */
  var merged = {};
  for (var k in T) { if (hasKey(T, k)) { merged[k] = cloneObj(T[k]); } }
  for (var k2 in N) { if (hasKey(N, k2) && !hasKey(merged, k2)) { merged[k2] = cloneObj(N[k2]); } }
  merged.prompts = mergedPrompts;
  merged.prompt_order = mergedOrder;
  if (cleanStr(N.name)) { merged.name = cleanStr(N.name); }

  /* ── ⑤ extensions：脚本 / 变量 / 正则 ──
     theirs 的 extensions 原样保留，只换两个子块（scripts / regex_scripts）。 */
  var tExt = isPreset(T.extensions) ? T.extensions : {};
  var nExt = isPreset(N.extensions) ? N.extensions : {};
  var mExt = cloneObj(tExt) || {};

  function mergeScripts(tArr, nArr) {
    var out = [], nMap = {}, tIds = {}, i;
    for (i = 0; i < nArr.length; i++) {
      var nid = cleanStr(nArr[i] && nArr[i].id);
      if (nid) { nMap[nid] = nArr[i]; }
    }
    for (i = 0; i < tArr.length; i++) {
      var tid = cleanStr(tArr[i] && tArr[i].id);
      if (tid) { tIds[tid] = 1; }
    }
    for (i = 0; i < tArr.length; i++) {
      var st = tArr[i];
      var sid = cleanStr(st && st.id);
      if (sid && nMap[sid] !== undefined) {
        var m = cloneObj(nMap[sid]) || {};
        m.enabled = defined(st.enabled) ? !!st.enabled : (defined(m.enabled) ? !!m.enabled : true);
        if (defined(st.data)) { m.data = cloneObj(st.data); }   /* 脚本内设置全留用户（含运行时状态） */
        out.push(m);
        report.applied++;
      } else {
        out.push(cloneObj(st));
        report.kept++;
      }
    }
    for (i = 0; i < nArr.length; i++) {
      var nid2 = cleanArrId(nArr[i]);
      if (nid2 && tIds[nid2] === undefined) {
        out.push(cloneObj(nArr[i]));
        report.added++; report.applied++;
      }
    }
    return { list: out };
  }

  var scriptReport = mergeScripts(
    arrOf(isPreset(tExt.tavern_helper) ? tExt.tavern_helper.scripts : []),
    arrOf(isPreset(nExt.tavern_helper) ? nExt.tavern_helper.scripts : [])
  );
  var mTh = cloneObj(mExt.tavern_helper) || {};
  mTh.scripts = scriptReport.list;
  /* A4：脚本变量一律 theirs。theirs 真没有这个键（极老版本）时才接 next 的默认。 */
  if (!defined(mTh.variables) && isPreset(nExt.tavern_helper) && defined(nExt.tavern_helper.variables)) {
    mTh.variables = cloneObj(nExt.tavern_helper.variables);
  }
  mExt.tavern_helper = mTh;

  function mergeRegexes(tArr2, nArr2, bArr2) {
    var out2 = [], nMap2 = {}, tIds2 = {}, bMap2 = {}, i2;
    var skip = 'disabled';
    for (i2 = 0; i2 < nArr2.length; i2++) {
      var nid = cleanArrId(nArr2[i2]);
      if (nid) { nMap2[nid] = nArr2[i2]; }
    }
    for (i2 = 0; i2 < bArr2.length; i2++) {
      var bid = cleanArrId(bArr2[i2]);
      if (bid) { bMap2[bid] = bArr2[i2]; }
    }
    for (i2 = 0; i2 < tArr2.length; i2++) {
      var t2 = tArr2[i2];
      var rid = cleanArrId(t2);
      if (!rid) { out2.push(cloneObj(t2)); continue; }
      var n3 = nMap2[rid] || null;
      if (!n3) { out2.push(cloneObj(t2)); report.kept++; continue; }  /* 新版删了的正则：留用户的那份 */
      var b3 = degraded ? null : (bMap2[rid] || null);
      var userF = degraded ? diffPair(t2, n3, skip) : diffPair(b3, t2, skip);
      var nextF = degraded ? userF : diffPair(b3, n3, skip);
      if (userF.length && nextF.length) {
        var key3 = 'rx:' + rid;
        pushConflict('regex', key3, rid, cleanStr(t2 && t2.script_name) || rid, uniqueList(userF.concat(nextF)));
      }
      var m3;
      if (nextF.length && (!userF.length || isNext('rx:' + rid))) {
        m3 = cloneObj(n3) || {};
        m3.disabled = defined(t2.disabled) ? !!t2.disabled : (defined(m3.disabled) ? !!m3.disabled : false);
        report.applied++;
        if (userF.length) { report.decidedNext++; }
      } else {
        m3 = cloneObj(t2) || {};
        m3.disabled = defined(t2.disabled) ? !!t2.disabled : (defined(n3.disabled) ? !!n3.disabled : false);
        report.kept++;
        if (userF.length && nextF.length) { report.decidedMine++; }
      }
      out2.push(m3);
    }
    /* next-only 正则：用户删过（base 有而 theirs 没有）与全新两种 */
    for (i2 = 0; i2 < nArr2.length; i2++) {
      var nid5 = cleanArrId(nArr2[i2]);
      var hasInT = false, ti2;
      for (ti2 = 0; ti2 < tArr2.length; ti2++) {
        if (cleanArrId(tArr2[ti2]) === nid5) { hasInT = true; break; }
      }
      if (hasInT) { continue; }
      var bb2 = degraded ? null : (bMap2[nid5] || null);
      if (!degraded && bb2) {
        var nCh4 = diffPair(bb2, nArr2[i2], skip);
        var keyR4 = 'rm:' + nid5;
        if (nCh4.length) {
          plan.conflicts.push({ key: keyR4, kind: 'delete', id: nid5, name: cleanStr(nArr2[i2] && nArr2[i2].script_name) || nid5, fields: nCh4 });
          if (isNext(keyR4)) {
            out2.push(cloneObj(nArr2[i2]));
            report.applied++; report.restored++; report.decidedNext++;
          } else {
            report.kept++; report.decidedMine++;
          }
        }
        continue;   /* 新版没改 → 保持删除 */
      }
      out2.push(cloneObj(nArr2[i2]));
      report.added++; report.applied++;
    }
    return { list: out2 };
  }

  var regexReport = mergeRegexes(
    arrOf(tExt.regex_scripts),
    arrOf(nExt.regex_scripts),
    degraded ? [] : arrOf(isPreset(B.extensions) ? B.extensions.regex_scripts : [])
  );
  mExt.regex_scripts = regexReport.list;
  merged.extensions = mExt;

  report.conflicts = plan.conflicts.length;
  plan.stats = { applied: report.applied, kept: report.kept, added: report.added, conflicts: plan.conflicts.length };
  return { plan: plan, merged: merged, report: report };
}

function cleanArrId(o) { return cleanStr(o && o.id); }
