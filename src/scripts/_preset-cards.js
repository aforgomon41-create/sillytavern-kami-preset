/* ============================================================
 * 预设卡片（模型卡 / 条目卡）共享构建器
 * ------------------------------------------------------------
 * **不是独立脚本**：src/scripts/meta.json 里不登记它（与 _panel-gestures.js 同一个套路）。
 * 构建期由 build/kami-doc.mjs 的 expandPresetCards 内联进 40-预设设置.js 与 50-引导.js，
 * 两个脚本里各留一行占位注释（占位符常量名见 build/kami-doc.mjs 的 PRESET_CARDS_MARK）。
 * ⚠️ 本文件里**不许出现那串占位符字面量**：它会被内联进脚本，二次展开时就会自我复制
 * （展开器里有这条硬检查，撞上会直接构建失败）。
 *
 * 为什么要有这一份：同一枚组件（模型卡、条目卡）此前在两个脚本里各写一套 ——
 * 40 的 modelCardEl / itemEl 与 50 的 renderModel 各建一棵 DOM，于是「同一颗卡片
 * 在两块面板里长得不一样」。注释标记 ⓘ 与开关卡片高亮已经因为同源问题丢过两次
 * （契约 §4.4 的两条硬规则），这里是第三次收口：**只留一份结构实现**。
 *
 * 本模块只建**结构**：
 *   · 不写外观（一个 style 都不碰：颜色/尺寸/圆角全归皮肤，契约 §0）；
 *   · 不挂事件（click / keydown 由调用方自己挂，两块面板的行为不同）；
 *   · 不读全局（文档对象由调用方传进来：40 与 50 各有一个 HDOC，
 *     面板可能建在酒馆宿主页上，所以不能直接用 document）。
 *
 * 三个导出函数的第一个参数都是**文档对象**（doc），其余照调用方给的数据走：
 *   buildModelCard(doc, model, currentEmoji, opts) → div.kami-card
 *       结构 = 卡（data-kami-card-key）+ 卡头按钮（.kami-card-head.kami-btn--ghost，
 *       data-kami-model + aria-pressed + 当前态 .is-on）+ 卡内 grid（.kami-card-body > .kami-grid）
 *   buildItemCard(doc, item, group, opts) → button.kami-item.kami-card（有注释时返回外包层 .kami-item-note）
 *   buildItemsGrid(doc, items, group, opts) → div.kami-grid（里面一排 buildItemCard）
 *   noteMarkEl / noteBoxEl → ⓘ 标记 / 注释正文容器（两块面板 + 引导的变量卡共用同一形状）
 *
 * 入参形状（两块面板的调用方把数据摊成这个形状）：
 *   item  = { name, identifier, enabled, models, comment }
 *   group = { key, mode }   // key → data-kami-card；mode === '单选' 时加 data-kami-single
 *   opts  = {
 *     cardKey,          // 模型卡：写进 data-kami-card-key
 *     lock(item),       // 是否锁死（原生 disabled）—— 40 与本模块默认 item.locked
 *     noteText(item)    // 注释正文来源 —— 默认 item.comment（引导从 noteMap 取）
 *   }
 * ============================================================ */

function pcMake(doc, tag, cls, text) {
  var n = doc.createElement(tag);
  if (cls) { n.className = cls; }
  if (text != null && text !== '') { n.textContent = String(text); }
  return n;
}

/* ── 条目名里的 emoji：摘成卡片角标（**只改显示，预设里的名字一个字不动**） ──
   动机：条目名绝大多数是四个汉字，名字里那枚 emoji + 空格会把紧凑网格（约 110px 宽）
   顶到第二行。把 emoji 搬到卡片角上，文字那一行就整行腾出来了（用户裁定的做法）。

   判定规则：
     · 名字里**任何位置**的 emoji 都按出现顺序摘出来（真机上多 emoji 的名字
       是「开头一枚 + 结尾一枚」，如 `🐋 DS/GLM 💤`，不在开头连成一片）；
     · 一枚 emoji = 区域指示符对（国旗）｜键帽（# * 0-9 + FE0F? + U+20E3）
       ｜Extended_Pictographic + 可选变体选择符(FE0F/FE0E) + 可选肤色修饰符
         + 若干「ZWJ + 上面这一套」（家庭/职业等组合序列）；
     · 角标分配（用户裁定）：第 1 枚 → 左上角 "tl"、第 2 枚 → 右上角 "tr"、
       第 3 枚 → 左下角 "bl"、第 4 枚 → 右下角 "br"；**第 5 枚及以后原样留在文字里**
       （最多 4 个角标，罕见情况也不丢信息）；
     · 摘完剩下的文字（被摘走的位置补一个空格，再合并空白、去掉首尾空白）作为卡片显示文字；
     · 名字本身就全是 emoji（摘完没文字了）→ 一枚都不摘，整名照常显示，免得卡片空掉。
   aria-label 仍用**完整原名**（含 emoji），角标 aria-hidden，读屏不会丢也不会念两遍。 */
var PC_EMOJI_ONE = '(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?[\\u{1F3FB}-\\u{1F3FF}]?(?:\\u200D(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?[\\u{1F3FB}-\\u{1F3FF}]?|[\\u{1F3FB}-\\u{1F3FF}]))*)';
var PC_EMOJI_ALL_RE = null;
var PC_CORNERS = ['tl', 'tr', 'bl', 'br'];   // 角标最多 4 枚：左上 → 右上 → 左下 → 右下（用户裁定）
/* ⓘ 注释标记占掉右上角（tr）时的 emoji 角表：tl → bl → br（最多 3 枚，第 4 枚起留在文字里） */
var PC_CORNERS_NO_TR = ['tl', 'bl', 'br'];
try { PC_EMOJI_ALL_RE = new RegExp(PC_EMOJI_ONE, 'gu'); }
catch (e) { PC_EMOJI_ALL_RE = null; }   // 老宿主不认 \p{...}/u 时：不摘角标，文字照常显示

function splitNameEmoji(rawName, max) {
  var name = (rawName === null || rawName === undefined) ? '' : String(rawName);
  var empty = { emojis: [], rest: name };
  if (!PC_EMOJI_ALL_RE) { return empty; }
  /* max = 最多摘几枚角标（默认 4）。ⓘ 占右上角时传 3：emoji 从左上角起排，
     摘满 3 枚后其余的整枚留在文字里，信息不丢。 */
  var cap = (max === undefined || max === null) ? PC_CORNERS.length : max;
  var found = [], keep = '', last = 0, m;
  /* 被摘走的 emoji 之间可能漏下一个「连接符」（ZWJ，零宽）——只清**匹配之外**的碎片，
     第 5 枚及以后整枚留在文字里，它内部的 ZWJ 必须原样保住 */
  var clean = function (s) { return s.replace(/\u200D/g, ''); };
  PC_EMOJI_ALL_RE.lastIndex = 0;
  while ((m = PC_EMOJI_ALL_RE.exec(name))) {
    if (!m[0]) { PC_EMOJI_ALL_RE.lastIndex++; continue; }
    keep += clean(name.slice(last, m.index));
    if (found.length < cap) { found.push(m[0]); }
    else { keep += m[0]; }          // 第 5 枚及以后：留在文字里
    keep += ' ';                    // 被摘走的位置补个空格，两边文字不会被粘到一起
    last = m.index + m[0].length;
  }
  keep += clean(name.slice(last));
  var rest = keep.replace(/[\s\u200B]+/g, ' ').replace(/^ | $/g, '');
  if (!found.length || !rest) { return empty; }
  return { emojis: found, rest: rest };
}

/* ── 注释查看（没有注释就什么都别显示） ──
   2026-09-21 用户裁定改版：条目卡里的 ⓘ 从「名字后面的行内记号」变成**右上角角标**
   （顶掉原来留给第 2 枚 emoji 的位置，见 buildItemCard）—— 行内记号会把窄卡片
   （面板网格里约 100–150px）里的条目名挤到换行，同一行的卡片因此被撑高。
   卡片头里的 ⓘ（卡片组标题、变量卡）仍是行内记号：那一行宽，不会挤到名字。
   做法：
     · 标记 = 名字后面一枚 ⓘ，占一格的宽度（.kami-card-note 是契约 §4.2 已登记的类名，
       用 data-kami-note-mark 与展开出来的正文区分，不新增类名）；
     · 没有注释的条目/卡片**一枚记号都不加**（不显示成灰色不可点，免得用户困惑）；
     · 结构 = **条目名（卡本体）作标题栏，注释正文是标题栏下方那个独立容器**：条目卡外面
       包一层 .kami-item-note（契约 §4.2 已登记），正文不再是按钮的一部分；卡片组 / 变量卡
       则放在卡片头与正文之间；
     · 展开/收起只切 hidden 属性，容器始终留在 DOM 里（契约 §4.3）；
     · ⚠️ 条目卡整张就是一个开关：标记的 click 必须 stopPropagation + preventDefault，
       否则注释一弹出来的同时开关也被翻掉。这是**调用方**的活（本模块不挂事件），
       但结构必须与契约 §4.4 硬规则 1 逐属性一致：span + role=button + tabindex
       + aria-expanded + aria-label，换成 span 的调用方要自己补 Enter / Space。 */
export function noteMarkEl(doc, note) {
  if (!note) { return null; }
  var m = pcMake(doc, 'span', 'kami-card-note', 'ⓘ');
  m.setAttribute('data-kami-note-mark', '1');
  m.setAttribute('role', 'button');
  m.setAttribute('tabindex', '0');
  m.setAttribute('aria-expanded', 'false');
  m.setAttribute('aria-label', '查看注释');
  return m;
}

export function noteBoxEl(doc, note) {
  if (!note) { return null; }
  /* 独立容器（div）：它现在是卡片/包裹层的兄弟节点，不再是按钮的子节点 */
  var t = pcMake(doc, 'div', 'kami-card-note');
  t.setAttribute('data-kami-note', '1');
  t.setAttribute('hidden', 'hidden');
  t.textContent = note;
  return t;
}

/* 一个条目 = 一张可点的小卡片，**整卡就是开关**：
   · 原生 <button> → Tab 聚焦、Enter / Space 直接触发 click，键盘可达不用另写按键处理
   · role="button" + aria-pressed → 读屏能说出「已按下/未按下」（行动选项的卡片就是这套）
   · 开着时加 .is-on（五套皮肤 + 兜底皮肤都照它点亮）——**不挂「开 / 关」小标签**：
     状态由 .is-on 的高亮表达就够了，多一枚标签只会把紧凑的网格撑丑（用户裁定）。
     读屏用户的状态信息走 aria-pressed，没有丢。
   · 非当前模型的专属条目：原生 disabled 锁死（外观交给皮肤）
   属性顺序是**冻结**的（外层与预设面板逐属性一致）：class → type → role → aria-pressed
   → (disabled / aria-disabled) → aria-label → data-kami-item → data-kami-card → (data-kami-single)；
   子节点顺序：ⓘ 角标（有注释时，data-kami-corner="tr"）→ emoji 角标们 →
   .kami-card-head（.kami-item-main）。ⓘ 是按钮的直接子元素（与 emoji 角标同一层），
   不再占名字那一行的宽度。 */
export function buildItemCard(doc, item, group, opts) {
  opts = opts || {};
  var key = (group && group.key) || '';
  var on = item.enabled !== false;
  var locked = opts.lock ? !!opts.lock(item) : (item.locked === true);
  var note = opts.noteText ? opts.noteText(item) : item.comment;
  var btn = pcMake(doc, 'button', 'kami-item kami-card' + (on ? ' is-on' : ''));
  btn.type = 'button';
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (locked) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
  /* 可访问性文本用**完整原名**（含 emoji）：角标被摘走了，读屏也不该丢信息 */
  btn.setAttribute('aria-label', item.name);
  btn.setAttribute('data-kami-item', item.identifier);
  btn.setAttribute('data-kami-card', key);
  if (group && group.mode === '单选') { btn.setAttribute('data-kami-single', '1'); }
  /* 有注释时右上角（tr）预留给 ⓘ：emoji 从左上角起排、最多摘 3 枚（第 4 枚起留在文字里）；
     没有注释时维持四角（tl → tr → bl → br，最多 4 枚）。 */
  var name = splitNameEmoji(item.name, note ? 3 : PC_CORNERS.length);
  var corners = note ? PC_CORNERS_NO_TR : PC_CORNERS;
  var head = pcMake(doc, 'span', 'kami-card-head');
  /* 名字放 .kami-item-main：它在五套皮肤里都没有 nowrap，长条目名会自然换行显示全
     （放 .kami-card-title 的话 memo / rain / nixie 都是 nowrap + 省略号，名字会被截断） */
  head.appendChild(pcMake(doc, 'span', 'kami-item-main', name.rest));
  /* 注释标记：**右上角角标**（2026-09-21 用户裁定）。它跟着 emoji 角标同一套定位机制
     （data-kami-corner，契约 §4.4），是按钮的直接子元素、不占名字那一行的宽度 ——
     行内记号在约 100px 宽的条目卡里会把名字挤成两行，同一行的卡片就被撑高。
     属性仍与预设面板逐属性同构（契约 §4.4 硬规则 1：span.kami-card-note +
     data-kami-note-mark + role=button + tabindex=0 + aria-expanded + aria-label），
     两块面板共用同一份构建器，结构不会分叉。只有真有注释的条目才有这一枚。 */
  var mark = noteMarkEl(doc, note);
  if (mark) {
    mark.setAttribute('data-kami-corner', 'tr');
    btn.appendChild(mark);
  }
  /* 角标：用契约里已登记的 .kami-badge（§4.2「小标签」），四角靠 data-kami-corner 区分，
     不新增类名。没有 emoji 的条目**一枚角标都不加**（正常排版）。 */
  for (var bi = 0; bi < name.emojis.length; bi++) {
    var badge = pcMake(doc, 'span', 'kami-badge', name.emojis[bi]);
    badge.setAttribute('data-kami-corner', corners[bi] || 'tr');
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);
  }
  btn.appendChild(head);
  /* 注释正文：**挪到条目卡外面**。卡本体 = 标题栏（条目名，自带底色/描边/内边距的一条），
     注释是它**下方**那个独立容器；开关状态（.is-on 高亮）照旧只在卡本体上。
     以前正文塞在按钮里，一展开就跟开关状态挤在同一条里，而且点正文还会顺手把开关翻掉
     （正文本来就是按钮的一部分）。没有注释的条目**不包这一层**，结构跟以前一模一样。 */
  var txt = noteBoxEl(doc, note);
  if (!txt) { return btn; }
  var wrap = pcMake(doc, 'div', 'kami-item-note');
  wrap.appendChild(btn);
  wrap.appendChild(txt);
  return wrap;
}

export function buildItemsGrid(doc, items, group, opts) {
  var grid = pcMake(doc, 'div', 'kami-grid');
  for (var i = 0; i < ((items || []).length); i++) {
    grid.appendChild(buildItemCard(doc, items[i], group, opts));
  }
  return grid;
}

/* 一张模型卡片：卡片头是「选中这个模型」的开关（选中态 = .is-on + 「当前」小标签），
   卡片体里是这个模型名下的全部条目（含与其他模型共用的那些）。
   引导的模型页与预设面板的模型 tab 用的是**同一个函数**：外层是 div.kami-card，
   卡头是可点的 button.kami-card-head.kami-btn.kami-btn--ghost，条目卡装在卡内的 .kami-grid 里。 */
export function buildModelCard(doc, model, currentEmoji, opts) {
  opts = opts || {};
  var items = model.items || [];
  var key = opts.cardKey || model.key || '';
  var on = model.emoji === currentEmoji;
  var box = pcMake(doc, 'div', 'kami-card');
  box.setAttribute('data-kami-card-key', key);
  var head = pcMake(doc, 'button', 'kami-card-head kami-btn kami-btn--ghost');
  head.type = 'button';
  head.setAttribute('data-kami-model', model.emoji);
  head.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on) { head.classList.add('is-on'); }
  head.appendChild(pcMake(doc, 'span', 'kami-card-title', model.name));
  head.appendChild(pcMake(doc, 'span', 'kami-chip', items.length + ' 条'));
  if (on) {
    var cur = pcMake(doc, 'span', 'kami-chip', '当前');
    cur.setAttribute('data-kami-role', 'cur');
    head.appendChild(cur);
  }
  box.appendChild(head);
  var body = pcMake(doc, 'div', 'kami-card-body');
  body.appendChild(buildItemsGrid(doc, items, { key: key, mode: null }, opts));
  box.appendChild(body);
  return box;
}
