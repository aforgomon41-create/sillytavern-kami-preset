/* ============================================================================
 * 「导出纯净正文」的纯逻辑
 * ----------------------------------------------------------------------------
 * 用户 2026-10-05 要的：在 🧰 其他功能页把干净正文导成 TXT，可选楼层范围（默认全部），
 * 可选是否只导 AI 消息（两边都导时每条前面加 role 标识）。
 *
 * 为什么**不读渲染出来的界面**（用户点名问的难点，这里是实测查证结果）：
 *   酒馆只渲染最后 power_user.chat_truncation 条 —— 默认 100，滑杆上限 1000
 *   （public/scripts/power-user.js:134 = 100；public/index.html:4878 max="1000"），
 *   见 public/script.js:1379-1391 printMessages()：startIndex = chat.length - count，
 *   超过就先插一个「Show more messages」按钮，再只画最后 count 条。
 *   所以 DOM 里**根本没有全部楼层**：3000 层的聊天，#chat 里只有 100 个 .mes。
 *   读 DOM 不只是慢，而是**会静默漏掉前面 2900 层** —— 那是正确性问题，不是性能问题。
 *   聊天记录本身是 context.chat 这个数组，层数多少与渲染几个无关；读数组拼字符串是纯内存操作。
 *
 * 「干净」从哪来：走 context.messageFormatting（酒馆自己那条链，public/script.js:1522，
 *   内部调正则引擎的 getRegexedString，script.js:1578），再把返回的 HTML 交给
 *   _copy-clean.js 取可见文本 —— 与「复制」那块**同一套换行规则**，不写第二份。
 *   拿不到 messageFormatting 时由调用方退化，并由界面**如实说明**那是清洗过的原始文本、
 *   不是所见即所得（用户明确说过：宁可要看得见的失败，也不要看不见的错误）。
 *
 * 内联规则同其它共享模块：零 import、只有行首 export，构建期由 build/kami-doc.mjs
 * 的 expandExportClean 去掉行首 export 后内联进 40-预设设置.js。
 * 本文件同样**不许出现美元符号**（与 _copy-clean.js 同规矩，免得将来被内联进前端时炸）。
 * ============================================================================ */

export var EXPORT_NL = String.fromCharCode(10);

/* 楼层号从 1 开始：第 1 层是聊天里最上面那条，也就是数组下标 0。
   酒馆自己在 DOM 上写的 mesid 就是这个下标（script.js:1390 addOneMessage(..., forceId: i)），
   所以「用户看到的第几层」= 下标 + 1。隐藏/系统消息也占一个号（它们同样在数组里）。 */
export function floorToIndex(floor) { return Number(floor) - 1; }

/** 这一条是不是用户发的 */
export function isUserMessage(m) { return !!(m && m.is_user); }

/** 这一条是不是酒馆的隐藏/系统消息：不是正文，整条跳过（但要计数，好在界面上说清楚） */
export function isSystemMessage(m) { return !!(m && m.is_system); }

/** 两边都导时，每条前面写的 role 标识 */
export function roleOf(m) { return isUserMessage(m) ? 'user' : 'assistant'; }

/**
 * 取这一条的正文：**当前这条**，不是它的所有 swipe。
 * 酒馆把「当前显示的那一份」放在 mes 上（切 swipe 时 mes 会跟着换），
 * 所以 mes 就是当前 swipe；mes 空着才回头去 swipes[swipe_id] 里捞。
 */
export function messageText(m) {
  if (!m) { return ''; }
  if (m.mes !== undefined && m.mes !== null && String(m.mes) !== '') { return String(m.mes); }
  var sw = m.swipes;
  if (sw && sw.length) {
    var id = (m.swipe_id === undefined || m.swipe_id === null) ? 0 : Number(m.swipe_id);
    if (sw[id] !== undefined && sw[id] !== null) { return String(sw[id]); }
    if (sw[0] !== undefined && sw[0] !== null) { return String(sw[0]); }
  }
  return '';
}

/** 只认纯数字（不写正则，避开美元符号）；空串按默认值处理 */
function readFloor(v, dflt) {
  if (v === undefined || v === null) { return dflt; }
  var s = String(v).trim();
  if (s === '') { return dflt; }
  for (var i = 0; i < s.length; i++) {
    if (s.charAt(i) < '0' || s.charAt(i) > '9') { return null; }
  }
  return parseInt(s, 10);
}

/**
 * 解析楼层范围。from/to 都是**用户看到的楼层号**（1 起、含两端），空着就取默认（全部）。
 * 返回 { ok:true, from, to, total } 或 { ok:false, code, total }。
 */
export function parseFloorRange(fromRaw, toRaw, total) {
  var n = Number(total);
  if (!isFinite(n) || n <= 0) { return { ok: false, code: 'NO_FLOOR', total: 0 }; }
  var from = readFloor(fromRaw, 1), to = readFloor(toRaw, n);
  if (from === null || to === null) { return { ok: false, code: 'BAD_NUMBER', total: n }; }
  if (from < 1 || to < 1 || from > n || to > n) { return { ok: false, code: 'OUT_OF_RANGE', total: n }; }
  if (from > to) { return { ok: false, code: 'REVERSED', total: n, from: from, to: to }; }
  return { ok: true, from: from, to: to, total: n };
}

/**
 * 把「要导哪些楼层」算出来。纯函数，不碰 DOM、不碰酒馆。
 * chat 就是 context.chat 那个数组。
 */
export function planExport(chat, fromRaw, toRaw, onlyAi) {
  var list = chat || [];
  var r = parseFloorRange(fromRaw, toRaw, list.length);
  if (!r.ok) { return r; }
  var picks = [], skippedSystem = 0, skippedUser = 0, i, m;
  for (i = r.from - 1; i <= r.to - 1; i++) {
    m = list[i];
    if (!m) { continue; }
    if (isSystemMessage(m)) { skippedSystem++; continue; }
    if (onlyAi && isUserMessage(m)) { skippedUser++; continue; }
    picks.push({
      index: i, floor: i + 1, role: roleOf(m),
      isUser: isUserMessage(m), name: String(m.name || ''), raw: messageText(m)
    });
  }
  if (!picks.length) {
    return { ok: false, code: 'ALL_FILTERED', total: list.length, from: r.from, to: r.to, skippedSystem: skippedSystem };
  }
  return {
    ok: true, from: r.from, to: r.to, total: list.length, picks: picks,
    onlyAi: !!onlyAi, skippedSystem: skippedSystem, skippedUser: skippedUser
  };
}

/**
 * 拼最终要写进 TXT 的文本。
 * picks 每条要有 { role, text }（text 由调用方从 messageFormatting 的结果里取）。
 * 换行规则直接用 _copy-clean.js 的 tidyCopyText —— 与「复制」那块是同一套，不写第二份。
 */
export function buildExportText(picks, withRole) {
  var blocks = [], i, t;
  for (i = 0; i < (picks || []).length; i++) {
    t = tidyCopyText(picks[i] && picks[i].text);
    /* 空楼层要整块跳过，不然会留下「role：user」下面一片空白。
       注意 tidyCopyText 只收换行、不收空格，所以这里连空格一起判 ——
       判的是"有没有可见字符"，不是"字符串是不是空的"。 */
    if (t.replace(/[ \t\n]/g, '') === '') { continue; }
    blocks.push(withRole ? ('role：' + picks[i].role + EXPORT_NL + t) : t);
  }
  return blocks.join(EXPORT_NL + EXPORT_NL);
}

/**
 * 拿不到 messageFormatting 时的通用去标签兜底。
 * ⚠️ 这条**就是**"拿规则去清洗"，一定会漏 —— 标签是用户自己那一堆正则定义的，我们列不全。
 * 所以调用方**必须**在界面上如实说明"这不是所见即所得"，不许默默给一份看起来干净的东西
 * （用户明确说过：宁可要看得见的失败，也不要看不见的错误）。
 * 规则刻意保守：只删尖括号包起来的一段，别的一律不动 —— 宁可留下可疑文字，也不误删正常内容。
 */
export function fallbackCleanText(raw) {
  var s = String(raw === null || raw === undefined ? '' : raw);
  s = s.replace(/<[^<>]*>/g, '');
  return tidyCopyText(s);
}

/** 文件名带范围信息 */
export function exportFileName(from, to) {
  return '卡密预设-正文-' + from + '-' + to + '.txt';
}

/** 出问题时的提示语（界面直接用，不许静默导空文件） */
export var EXPORT_ERRORS = {
  BAD_NUMBER: '楼层号只能填数字（留空表示不限制）',
  REVERSED: '起始楼层比结束楼层大，把两个数调过来',
  OUT_OF_RANGE: '楼层范围超出这个聊天的总层数',
  NO_FLOOR: '这个聊天里一层都没有，没有可导出的内容',
  ALL_FILTERED: '这个范围里一条都没选上：开着「只导 AI 消息」时用户消息会被跳过',
  NO_CTX: '拿不到酒馆上下文（SillyTavern.getContext 不可用）',
  EMPTY_RESULT: '选中的楼层里没有可导出的正文（全是空的）'
};

export function exportErrorText(code, detail) {
  var base = EXPORT_ERRORS[code] || '导出失败';
  detail = detail || {};
  if (code === 'OUT_OF_RANGE' && detail.total) { base += '（这个聊天共 ' + detail.total + ' 层）'; }
  if (code === 'ALL_FILTERED' && detail.skippedSystem) {
    base += '；另外 ' + detail.skippedSystem + ' 条隐藏消息本来就不导';
  }
  if (code === 'NO_FLOOR' && detail.total === 0) { base += ''; }
  return base;
}
