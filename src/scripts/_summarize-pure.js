/* ============================================================
 * 📜 压缩 · 纯逻辑（构建期内联进 60-压缩.js；不是独立脚本，meta.json 里没有它）
 * ------------------------------------------------------------
 * 这里只放**不碰酒馆 API、不碰 DOM、不碰网络**的纯函数，两块：
 *
 *   A. 摘要响应解析（parseSummaryResponse / assembleBlockText）
 *      只认结构化输出，别的一律判失败。当年「供应商报错被当成压缩块写进
 *      世界书」的根因就是只要模型返回非空文本就收下 —— 报错信息也是非空文本。
 *      JSON 只是**传输格式**：落盘前一定还原成给人看的人话（assembleBlockText），
 *      世界书条目里永远不塞 JSON。
 *
 *   B. 世界书对账（reconcileBlocks）
 *      块条目（名字里的楼层范围 + 正文）是**唯一真相**，账本只提供结构。
 *      账本里有档案、条目却没了的段 ⇒ 记进 pending，下次大总结重新总结
 *      （用户删块 = 要求这段重来）。同一份逻辑既服务面板显示，也服务流水线。
 *
 * 内联规则与 _preset-cards.js 完全一致：构建期只去掉**行首**的 export 前缀。
 * 离线测试：node test/harness/summarize-pure.mjs
 * ============================================================ */

/* ───────── 共享小工具 ───────── */

/** 楼层号列表 → 连续区间（[{from,to}]）。待重做段用它打包，免得一楼一个请求。 */
export function rangesOf(list) {
  var sorted = (list || []).slice().sort(function (a, b) { return a - b; });
  var out = [];
  for (var i = 0; i < sorted.length; i++) {
    var last = out[out.length - 1];
    if (last && sorted[i] <= last.to + 1) { if (sorted[i] > last.to) { last.to = sorted[i]; } }
    else { out.push({ from: sorted[i], to: sorted[i] }); }
  }
  return out;
}

/** 区间列表一共盖住几楼 */
export function countFloors(ranges) {
  var n = 0;
  for (var i = 0; i < (ranges || []).length; i++) { n += ranges[i].to - ranges[i].from + 1; }
  return n;
}

/** 区间列表 → 不相交且已合并的区间（相接的也并起来） */
export function mergeRanges(list) {
  var sorted = (list || []).filter(function (r) { return r && typeof r.from === 'number' && typeof r.to === 'number' && r.to >= r.from; })
    .slice().sort(function (a, b) { return a.from - b.from || a.to - b.to; });
  var out = [];
  for (var i = 0; i < sorted.length; i++) {
    var last = out[out.length - 1];
    if (last && sorted[i].from <= last.to + 1) { if (sorted[i].to > last.to) { last.to = sorted[i].to; } }
    else { out.push({ from: sorted[i].from, to: sorted[i].to }); }
  }
  return out;
}

/** 从 list 里减掉 cut 盖住的部分（楼层精度）。用它把「已被活着的块覆盖」的
 *  部分从待重做清单里剔掉 —— 用户重写过某段之后，那段就不该再重做。 */
export function subtractRanges(list, cut) {
  var remain = mergeRanges(list);
  var holes = mergeRanges(cut);
  for (var h = 0; h < holes.length; h++) {
    var next = [];
    for (var i = 0; i < remain.length; i++) {
      var r = remain[i];
      if (holes[h].to < r.from || holes[h].from > r.to) { next.push(r); continue; }
      if (holes[h].from > r.from) { next.push({ from: r.from, to: holes[h].from - 1 }); }
      if (holes[h].to < r.to) { next.push({ from: holes[h].to + 1, to: r.to }); }
    }
    remain = next;
  }
  return remain;
}

export function floorInRanges(ranges, f) {
  for (var i = 0; i < (ranges || []).length; i++) {
    if (f >= ranges[i].from && f <= ranges[i].to) { return true; }
  }
  return false;
}

/** 块条目的名字：「<前缀>N｜楼层 X-Y」。名字里的范围是收养与对账的依据。 */
export function parseBlockName(prefix, comment) {
  var re = new RegExp('^' + String(prefix || '') + '(\\d+)｜楼层 (\\d+)-(\\d+)$');
  var m = re.exec(String(comment === undefined || comment === null ? '' : comment));
  if (!m) { return null; }
  return { index: Number(m[1]), from: Number(m[2]), to: Number(m[3]) };
}

/** 条目正文 → 去掉第一行的「【剧情提要｜楼层 X-Y】」头（用户手改过的正文原样返回） */
export function stripBlockHeader(content) {
  var s = String(content === undefined || content === null ? '' : content);
  var m = s.match(/^【剧情提要｜楼层 \d+-\d+】[ \t]*\r?\n?/);
  return m ? s.slice(m[0].length) : s;
}

/** 条目正文（头 + 人话正文）。头是脚本加的，正文归用户。 */
export function blockContent(from, to, text) {
  return '【剧情提要｜楼层 ' + from + '-' + to + '】\n' + String(text === undefined || text === null ? '' : text);
}

/* ───────── 供应商 / 网关报错文案特征 ─────────
   两处用：① 摘要响应合法性判定（写盘之前）；② 老数据体检（面板标「疑似失败内容」）。
   只看正文开头 400 字，避免把正常剧情里的英文词误伤。 */
export var ERR_PATTERNS = [
  /^\s*[[{]/,                                   // 一坨 JSON（合法 JSON 由解析器另判）
  /\b(?:HTTP|status|code)\s*[:=]?\s*[45]\d\d\b/i,
  /\b(?:invalid[_\s-]?api[_\s-]?key|insufficient[_\s-]?quota|rate[_\s-]?limit|quota[_\s-]?exceeded|context[_\s-]?length[_\s-]?exceeded|bad[_\s-]?gateway|service[_\s-]?unavailable|upstream|econnrefused|econnreset|socket[_\s-]?hang[_\s-]?up|too[_\s-]?many[_\s-]?requests)\b/i,
  /\bplease\s+try\s+again(?:\s+later)?\b/i,
  /\b(?:error|exception)\s+(?:code|type)\s*[:=]/i,
  /<!DOCTYPE|<html|<\/html>|<\/body>/i,
  /\[object Object\]/,
  /当前分组|上游负载|负载已饱和|无可用渠道|可用渠道|额度不足|余额不足|请求过于频繁|模型不存在|模型未找到|鉴权失败|密钥无效|密钥错误|连接失败|请检查网络|接口报错|接口返回错误|返回错误信息|服务暂不可用|服务器繁忙|请求超时|已超出|超出限制/
];

export function looksLikeProviderError(text) {
  var s = String(text === undefined || text === null ? '' : text).trim();
  if (!s) { return false; }
  var head = s.slice(0, 400);
  for (var i = 0; i < ERR_PATTERNS.length; i++) { if (ERR_PATTERNS[i].test(head)) { return true; } }
  return false;
}

/* ───────── A. 摘要响应解析 ───────── */

/** 结构化输出的 schema（酒馆助手的 json_schema 参数：value 才是 JSON Schema 本体）。
 *  strict 模式下 OpenAI 要求 properties 全部进 required 且 additionalProperties:false，
 *  所以三个字段都是必填（允许空串/空数组，模型写不出内容时给空值也比给一段报错好）。 */
export var SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    timeline: { type: 'string', description: '本块覆盖的时间跨度与场景转移，一到两句' },
    plot: { type: 'string', description: '本块的剧情提要，第三人称叙述，300 到 600 字' },
    changes: {
      type: 'array',
      items: { type: 'string' },
      description: '关键变化清单：人物状态与关系、物品地点与时间线、尚未回收的伏笔'
    }
  },
  required: ['timeline', 'plot', 'changes'],
  additionalProperties: false
};

/** 交给酒馆助手的 json_schema 包装（酒馆助手 4.11 起支持这个参数：
 *  {name, description, value:JSON Schema, strict}）。
 *  三个字段全部必填 + additionalProperties:false 正好满足 OpenAI strict 模式的硬要求；
 *  Google 那条路 ST 自己会把 additionalProperties 删掉（util.js 的 isGoogleApi 白名单），
 *  所以不需要为 Gemini 单独降级 —— 助手版本过旧不认识这个参数时会静默忽略，
 *  这时靠 OUTPUT_CONTRACT 那段提示词兜底。 */
export function summaryJsonSchema() {
  return {
    name: 'kami_block_summary',
    description: '一段剧情的压缩块：时间线 + 剧情提要 + 关键变化',
    value: SUMMARY_SCHEMA,
    strict: true
  };
}

/** 原文前 N 字，给面板/通知看（换行压成空格，免得撑破一行） */
export function rawHead(s, n) {
  var t = String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim();
  var max = n || 200;
  return t.length > max ? (t.slice(0, max) + '…') : t;
}

function stripFences(s) {
  var t = String(s || '').trim();
  t = t.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, '');
  t = t.replace(/\r?\n?```[ \t]*$/, '');
  return t.trim();
}

/** 取第一个**完整**的 JSON 对象：从第一个 { 起按花括号配对，跳过字符串里的括号与转义。
 *  返回 null 表示没有配平的对象（半个 JSON、纯文本、报错文案都落这里）。 */
export function extractJsonObject(s) {
  var t = String(s || '');
  var start = t.indexOf('{');
  if (start < 0) { return null; }
  var depth = 0, inStr = false, esc = false;
  for (var i = start; i < t.length; i++) {
    var ch = t.charAt(i);
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) { return t.slice(start, i + 1); }
    }
  }
  return null;
}

function asString(v) {
  if (typeof v === 'string') { return v; }
  if (typeof v === 'number' && isFinite(v)) { return String(v); }
  return '';
}

/** 从对象里认领三个字段（容忍常见别名，容忍 changes 写成一段文本） */
export function normalizeSummaryFields(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { return null; }
  /* 接口把报错包成 JSON：{"error":{"message":…}} —— 没有正文就当没有 */
  var plot = asString(obj.plot) || asString(obj.summary) || asString(obj.text) ||
    asString(obj.content) || asString(obj['本块剧情']) || asString(obj['剧情提要']);
  var timeline = asString(obj.timeline) || asString(obj.time) || asString(obj['时间线']);
  var changes = [];
  var rawChanges = obj.changes || obj.key_changes || obj.keyChanges || obj['关键变化'];
  if (Array.isArray(rawChanges)) {
    for (var i = 0; i < rawChanges.length; i++) {
      var one = asString(rawChanges[i]).trim();
      if (one) { changes.push(one); }
    }
  } else {
    var asText = asString(rawChanges);
    if (asText.trim()) {
      var lines = asText.split(/\r?\n/);
      for (var j = 0; j < lines.length; j++) {
        var ln = lines[j].replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim();
        if (ln) { changes.push(ln); }
      }
    }
  }
  plot = plot.trim();
  timeline = timeline.trim();
  /* 正文太短（或压根没有）就不算摘要：正常一块是 300-600 字，
     这里只卡一个很松的下限，专门挡「空壳 / 一句报错 / 半个 JSON」 */
  if (plot.replace(/\s/g, '').length < 20) { return null; }
  return { timeline: timeline, plot: plot, changes: changes };
}

/** 字段 → 世界书条目正文（人话）。世界书条目里**永远不塞 JSON**。 */
export function assembleBlockText(fields) {
  var f = fields || {};
  var parts = [];
  if (f.timeline) { parts.push('时间线：' + f.timeline); }
  parts.push('本块剧情：\n' + String(f.plot || '').trim());
  if (f.changes && f.changes.length) {
    parts.push('关键变化：\n' + f.changes.map(function (x) { return '- ' + x; }).join('\n'));
  }
  return parts.join('\n\n').trim();
}

/** 摘要响应 → {ok, reason, fields, text, rawHead}
 *  reason 取值：empty(空回复) / errorText(像供应商报错) / noJson(不是 JSON) /
 *               badJson(JSON 残缺) / errorJson(JSON 里是报错) / noFields(缺正文字段) */
export function parseSummaryResponse(raw) {
  var res = { ok: false, reason: '', fields: null, text: '', rawHead: '' };
  var s = (raw === undefined || raw === null) ? '' : raw;
  if (typeof s !== 'string') {
    /* 万一哪天助手直接把解析好的对象递回来 */
    var f0 = normalizeSummaryFields(s);
    if (f0) {
      res.ok = true; res.fields = f0; res.text = assembleBlockText(f0);
      try { res.rawHead = rawHead(JSON.stringify(s)); } catch (e) { res.rawHead = ''; }
      return res;
    }
    try { s = JSON.stringify(s); } catch (e) { s = String(s); }
  }
  s = String(s);
  res.rawHead = rawHead(s);
  var body = stripFences(s);
  if (!body) { res.reason = 'empty'; return res; }
  var cand = extractJsonObject(body);
  if (!cand) {
    /* 「夹断的 JSON」与「接口在骂人」分开报：前者是模型输出被打断，
       后者是供应商/网关的错误文案 —— 面板上给用户的说法不一样。 */
    var startsJson = body.charAt(0) === '{';
    var looksErrJson = /"error"\s*:/.test(body.slice(0, 400));
    res.reason = (startsJson && !looksErrJson) ? 'badJson' : (looksLikeProviderError(body) ? 'errorText' : 'noJson');
    return res;
  }
  var obj = null;
  try { obj = JSON.parse(cand); } catch (e) { obj = null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { res.reason = 'badJson'; return res; }
  if (obj.error && !obj.plot && !obj.summary && !obj.text && !obj.content) { res.reason = 'errorJson'; return res; }
  var f = normalizeSummaryFields(obj);
  if (!f) { res.reason = 'noFields'; return res; }
  if (looksLikeProviderError(f.plot)) { res.reason = 'errorText'; return res; }
  res.ok = true; res.fields = f; res.text = assembleBlockText(f);
  return res;
}

/* ───────── B. 世界书对账 ─────────
   输入（全部是普通数据，没有任何酒馆对象）：
     prefix       块条目前缀（📜 压缩块 #）
     entries      世界书条目数组 [{uid, comment, content, depth}]（含用户自己的条目，函数自己筛）
     ledger       账本对象（可能为 null / 被改坏）
     pins         例外楼层号
     hiddenFloors 当前被隐藏的楼层号数组
     len          聊天楼层总数
     keep         保留最新楼数
   输出：见下方 out 的字段。 */

export function reconcileBlocks(input) {
  var inp = input || {};
  var prefix = String(inp.prefix || '');
  var entries = inp.entries || [];
  var ledger = inp.ledger || null;
  var len = (typeof inp.len === 'number') ? inp.len : 0;
  var keep = Math.max(1, Math.min(500, inp.keep || 20));
  var pins = (inp.pins || []).slice().sort(function (a, b) { return a - b; });
  var hiddenFloors = inp.hiddenFloors || [];

  var out = {
    blocks: [], pending: [], covered: -1, hiddenByUs: [], adopted: false,
    orphan: [], dup: [], suspect: [], hiddenNow: {}, pins: pins, ledgerRead: !!ledger
  };
  var i, k;

  /* ① 世界书条目全表：
        · 全部条目按 uid 索引 —— **名字被改过也认得出是哪个块**（结构以账本为准）；
        · 名字能解析出「#N｜楼层 X-Y」的，另外进 nameHits，做收养与范围兜底匹配。 */
  var byUidAll = {}, nameHits = [];
  for (i = 0; i < entries.length; i++) {
    var en = entries[i];
    if (!en || typeof en.comment !== 'string') { continue; }
    var enText = stripBlockHeader(String(en.content || ''));
    if (typeof en.uid === 'number') {
      byUidAll[en.uid] = { uid: en.uid, text: enText, depth: en.depth, comment: en.comment };
    }
    var pn = parseBlockName(prefix, en.comment);
    if (!pn) { continue; }
    nameHits.push({
      uid: (typeof en.uid === 'number') ? en.uid : null,
      wantIndex: pn.index, from: pn.from, to: pn.to,
      text: enText,
      depth: (typeof en.depth === 'number') ? en.depth : null,
      at: null
    });
  }

  /* ② 账本：只认结构 */
  if (ledger && typeof ledger === 'object') {
    if (Array.isArray(ledger.pins)) {
      for (i = 0; i < ledger.pins.length; i++) {
        if (typeof ledger.pins[i] === 'number' && pins.indexOf(ledger.pins[i]) < 0) { pins.push(ledger.pins[i]); }
      }
      pins.sort(function (a, b) { return a - b; });
      out.pins = pins;
    }
    if (Array.isArray(ledger.hiddenByUs)) {
      for (i = 0; i < ledger.hiddenByUs.length; i++) {
        if (typeof ledger.hiddenByUs[i] === 'number') { out.hiddenByUs.push(ledger.hiddenByUs[i]); }
      }
    }
    /* 账本里记着的待重做段（上一次对账的结果，落盘过就不会丢） */
    if (Array.isArray(ledger.pending)) {
      for (i = 0; i < ledger.pending.length; i++) {
        var lp = ledger.pending[i];
        if (lp && typeof lp.from === 'number' && typeof lp.to === 'number') { out.pending.push({ from: lp.from, to: lp.to }); }
      }
    }
    if (typeof ledger.covered === 'number') { out.covered = ledger.covered; }
  }

  /* ③ 对账：账本档案 → 找它对应的条目。
        匹配顺序：uid（改过名字也认）→ 楼层范围（同名条目）→ 都没有 = 这段的条目没了。
        找到 = 块还活着（**正文以条目为准**）；找不到 = 记进待重做（用户删块 = 要求这段重来）。 */
  var takenIdx = [], takenUids = {};
  function takeNameHit(one, at) {
    one.at = (typeof at === 'number') ? at : null;
    out.blocks.push(one);
    takenIdx.push(one);
    if (one.uid !== null && one.uid !== undefined) { takenUids[one.uid] = 1; }
  }
  var ledgerBlocks = (ledger && Array.isArray(ledger.blocks)) ? ledger.blocks : [];
  for (i = 0; i < ledgerBlocks.length; i++) {
    var arc = ledgerBlocks[i];
    if (!arc || typeof arc.from !== 'number' || typeof arc.to !== 'number') { continue; }
    var ue = (arc.uid === null || arc.uid === undefined) ? null : byUidAll[arc.uid];
    if (ue && String(ue.text).trim()) {
      /* uid 认得出来：结构（楼层范围）以账本为准，正文以条目为准 —— 名字被改过也算它活着 */
      out.blocks.push({
        uid: arc.uid, from: arc.from, to: arc.to, text: ue.text,
        depth: (typeof ue.depth === 'number') ? ue.depth : null,
        at: (typeof arc.at === 'number') ? arc.at : null
      });
      takenUids[arc.uid] = 1;
      continue;
    }
    var hit = null;
    for (k = 0; k < nameHits.length; k++) {
      if (takenIdx.indexOf(nameHits[k]) >= 0) { continue; }
      if (nameHits[k].uid !== null && takenUids[nameHits[k].uid]) { continue; }
      if (nameHits[k].from === arc.from && nameHits[k].to === arc.to && String(nameHits[k].text).trim()) {
        hit = nameHits[k];
        break;
      }
    }
    if (hit) { takeNameHit(hit, arc.at); }
    else { out.pending.push({ from: arc.from, to: arc.to }); }
  }

  /* ④ 账本没登记的块条目 = 用户手加 / 账本丢了一半 → 收养（正文空的孤儿条目当作不存在） */
  for (i = 0; i < nameHits.length; i++) {
    if (takenIdx.indexOf(nameHits[i]) >= 0) { continue; }
    if (nameHits[i].uid !== null && takenUids[nameHits[i].uid]) { continue; }
    if (!String(nameHits[i].text).trim()) { continue; }
    takeNameHit(nameHits[i], null);
    out.adopted = true;
  }
  out.blocks.sort(function (x, y) { return x.from - y.from || x.to - y.to; });

  /* ⑤ 同一段楼层只留一条（用户可能复制过条目）；多出来的报给面板，绝不自动删 */
  var seen = {}, dedup = [];
  for (i = 0; i < out.blocks.length; i++) {
    var key = out.blocks[i].from + '-' + out.blocks[i].to;
    if (seen[key]) { out.dup.push(key); continue; }
    seen[key] = 1; dedup.push(out.blocks[i]);
  }
  out.blocks = dedup;

  /* ⑥ 前沿只增不减（账本丢一半时不至于倒退重压）；待重做段必须落在前沿之内 */
  var maxTo = -1;
  for (i = 0; i < out.blocks.length; i++) { if (out.blocks[i].to > maxTo) { maxTo = out.blocks[i].to; } }
  for (i = 0; i < out.pending.length; i++) { if (out.pending[i].to > maxTo) { maxTo = out.pending[i].to; } }
  if (maxTo > out.covered) { out.covered = maxTo; }

  /* ⑦ 孤儿隐藏楼层：在前沿之内、没有任何块覆盖、却被隐藏的楼层。
        · 我们隐藏过的（账本 hiddenByUs 里有）→ 自动纳入待重做；
        · 来路不明的 → 只报给面板 + 由用户点按钮决定，绝不自动碰
          （用户手动 /hide 过的楼层承诺过不参与总结）。 */
  for (i = 0; i < hiddenFloors.length; i++) { out.hiddenNow[hiddenFloors[i]] = 1; }
  if (out.covered >= 0 && len > 0) {
    var end = len - 1 - keep;
    var top = Math.min(out.covered, end, len - 1);
    var preRanges = out.blocks.concat(mergeRanges(out.pending));
    var ours = [], unknownList = [];
    for (var f = 0; f <= top; f++) {
      if (!out.hiddenNow[f]) { continue; }
      if (floorInRanges(preRanges, f)) { continue; }
      if (pins.indexOf(f) >= 0) { continue; }
      if (out.hiddenByUs.indexOf(f) >= 0) { ours.push(f); } else { unknownList.push(f); }
    }
    if (ours.length) {
      var extraRanges = rangesOf(ours);
      for (i = 0; i < extraRanges.length; i++) { out.pending.push(extraRanges[i]); }
    }
    out.orphan = rangesOf(unknownList);
  }

  /* ⑧ 待重做清单定稿：合并 + 剔掉已经被活着的块覆盖的部分 + 只留前沿之内的 */
  var blockRanges = out.blocks.map(function (x) { return { from: x.from, to: x.to }; });
  out.pending = subtractRanges(out.pending, blockRanges).filter(function (p) { return p.to <= out.covered; });
  out.pending = out.pending.filter(function (p) { return p.to >= p.from; });

  /* 手动取消隐藏过的楼层要从 hiddenByUs 里退出去（下一次它们按普通楼层参与） */
  var pruned = [];
  for (i = 0; i < out.hiddenByUs.length; i++) {
    var hb = out.hiddenByUs[i];
    if (hb >= 0 && hb <= len - 1 && out.hiddenNow[hb]) { pruned.push(hb); }
  }
  out.hiddenByUs = pruned;

  /* ⑨ 体检：正文像供应商报错的块（升级前被写进来的脏内容） */
  for (i = 0; i < out.blocks.length; i++) {
    if (looksLikeProviderError(out.blocks[i].text)) { out.suspect.push(i); }
  }
  return out;
}

/* ───────── C. 流水线取材 ───────── */

/** 一段待重做区间里真正要重新总结的楼层：
 *  跳过例外楼层、跳过越界楼层；
 *  **包含被隐藏的楼层**（这些楼当年就是被我们自己隐藏的：它被一个块覆盖过，
 *  而那个块的条目现在没了 —— 不把它们读回来，那段剧情就永远补不上）。 */
export function pendingFloors(range, len, pins) {
  var out = [];
  var pinMap = {};
  for (var i = 0; i < (pins || []).length; i++) { pinMap[pins[i]] = 1; }
  var top = Math.min(range.to, len - 1);
  for (var f = Math.max(0, range.from); f <= top; f++) {
    if (pinMap[f]) { continue; }
    out.push(f);
  }
  return out;
}
