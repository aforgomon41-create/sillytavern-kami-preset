/* ============================================================================
 * 卡密预设 · 标签处理（纯逻辑，构建期内联进 40-预设设置.js）
 * ----------------------------------------------------------------------------
 * 干什么：AI 回复里的成对标签（`<content>…</content>` 这种）**没闭合**时，把结尾补上，
 *   或者把配不上对的标签本身删掉。检测与改写全在这里，一行 DOM / 一行酒馆 API 都没有 ——
 *   于是可以离线单测（test/harness/tags-pure.mjs），也不用为了改一句话去开浏览器。
 *
 * 为什么要管（谁在消费这些标签，见 docs/皮肤契约.md §5 与 src/regex/list.json）：
 *   标签名单的**唯一真相**是预设条目「🧩 标签格式」（src/preset.base.json，用
 *   `{{setvar::content_start::<content>}}` 的形式把全部标签列了一遍）。逐个对应：
 *
 *   <out_body>        总标签：包住正文与前后处理块    → 隐藏|XML结构间换行 A/B
 *   <introduction>    前处理块                        → 同上
 *   <content>         正文块                          → 前端|正文 v0.1（缺闭合 ⇒ 整块外壳不出现）
 *   <appendix>        后处理块                        → 隐藏|XML结构间换行 A/B
 *   <think>           原生思维链（DeepSeek/GLM）      → 酒馆本体 reasoning.js 解析
 *   <nyaruko_think>   显式思维链（Gemini 等）         → 前端|显式思维链 v0.1
 *   <image>           文生图                          → 屏蔽|图片与<god>(仅保留一楼)
 *   <image_Tag>       图片标签                        → 同上
 *   <MakeImage>       生图指令                        → 同上
 *   <god>             ROOT 权限指令                   → 同上
 *   <medium>          正文里的 HTML 美化部件          → 屏蔽|HTML美化代码
 *   <medium_content>  HTML 美化的留档文字             → 隐藏|HTML美化留档文字
 *   <summary>         摘要                            → 隐藏|摘要/设定、压缩|摘要/设定
 *   <char_setting>    角色设定                        → 同上两条
 *   <options>         行动选项                        → 前端|行动选项 v0.1
 *
 *   `<summary>` 未闭合是**双重伤害**：摘要原文会露在楼层里，而且「压缩|摘要/设定」那条正则
 *   要求至少一组完整闭合对 —— 零匹配时 String.replace 原样返回，整层全文照发，压缩静默失效。
 *
 * 三个档位（面板上的三档开关）：
 *   off   什么都不做
 *   close 补全：给没闭合的开始标签补上闭合标签
 *   del   删除：把配不上对的标签本身删掉（内容原样保留）
 *
 * 「补在哪儿」的规则（用户 2026-09-30 裁定：补到紧挨着标签的前面或后面）：
 *   ① 默认补在**消息末尾**（被截断的回复就是这种情况：内容一直写到最后，闭合标签没来得及写）；
 *   ② 如果这个没闭合的块后面紧跟着一个**写完整的兄弟块**（标签格式里与它平级的那几块：
 *      前处理 / 正文 / 后处理 / 思维链 / 摘要 / 设定 / 行动选项 / 图片），闭合标签就补在
 *      那个块的**前面** —— 补到末尾会把整个兄弟块吞进去，那更糟；
 *   ③ 两个例外**永远补在末尾**：`<out_body>`（它是包住一切的总标签，兄弟块本来就在它里面）、
 *      `<medium>` / `<medium_content>`（按设计就嵌在正文里）。
 *
 * ⚠️ 不改的东西：正文一个字都不动，只增删标签本身。
 *   三段区间里的尖括号一律不当标签看：``` / ~~~ 围起来的代码块、`<medium>` / `<medium_content>`
 *   （AI 在那里写 HTML 前端部件）、`<details>`（预设明确允许 AI 在卡片里写 `<details><summary>` ——
 *   不排除的话那个 `summary` 会被当成没闭合的摘要块，把 `</summary>` 补到卡片外面去）。
 * ========================================================================== */

/* 登记表：只认这些标签。加新标签就来这里加一行（名字 / 中文用途 / 是不是「平级兄弟块」）。 */
export var TAG_SPECS = [
  { tag: 'out_body', label: '总标签', sibling: false },
  { tag: 'introduction', label: '前处理', sibling: true },
  { tag: 'content', label: '正文块', sibling: true },
  { tag: 'appendix', label: '后处理', sibling: true },
  { tag: 'think', label: '原生思维链', sibling: true },
  { tag: 'nyaruko_think', label: '显式思维链', sibling: true },
  { tag: 'medium', label: 'HTML 美化', sibling: false },
  { tag: 'medium_content', label: 'HTML 留档', sibling: false },
  { tag: 'summary', label: '摘要', sibling: true },
  { tag: 'char_setting', label: '角色设定', sibling: true },
  { tag: 'options', label: '行动选项', sibling: true },
  { tag: 'image', label: '文生图', sibling: true },
  { tag: 'image_Tag', label: '图片标签', sibling: true },
  { tag: 'MakeImage', label: '生图指令', sibling: true },
  { tag: 'god', label: '指令（god）', sibling: true }
];

export var FIX_MODES = ['off', 'close', 'del'];

export function tagSpecOf(name, specs) {
  var list = specs || TAG_SPECS;
  for (var i = 0; i < list.length; i++) { if (list[i].tag === name) { return list[i]; } }
  return null;
}

/* ── 自定义标签（面板上那个输入框，2026-09-30 用户点名） ──
   用户填进来的标签并进登记表一起管。规则：
     · 一行里可以写多个，逗号 / 顿号 / 空格 / 换行都算分隔符（用户不该被分隔符难住）；
     · 标签名只认字母开头的字母数字下划线（与 XML 标签名同规则），带尖括号也行（写了就替用户去掉）；
     · 已经在内置登记表里的忽略掉（内置的本来就管），重复的也去重；
     · 自定义标签的 sibling 一律 false：它**不当作别人的分界**。
       理由：分界规则会让别的标签提前闭合，拿不准的新标签不该有这个权力（宁可补在末尾）。 */
export function parseCustomTags(text) {
  var raw = String(text == null ? '' : text);
  var parts = raw.split(/[\s,，、;；|]+/);
  var out = [], seen = {}, i, name;
  for (i = 0; i < parts.length; i++) {
    name = parts[i].replace(/[<>\/]/g, '');
    if (!name) { continue; }
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) { continue; }
    if (tagSpecOf(name, TAG_SPECS)) { continue; }
    if (seen[name]) { continue; }
    seen[name] = 1;
    out.push(name);
  }
  return out;
}

/* 内置登记表 + 用户自定义 = 这一次实际要管的标签。
   自定义的排在后面，`sibling:false`（见上），label 统一叫「自定义」。 */
export function specsWithCustom(custom) {
  var out = TAG_SPECS.slice(), i;
  var list = (custom && custom.length) ? custom : [];
  for (i = 0; i < list.length; i++) {
    var name = (typeof list[i] === 'string') ? list[i] : (list[i] && list[i].tag);
    if (!name || tagSpecOf(name, TAG_SPECS)) { continue; }
    out.push({ tag: name, label: '自定义', sibling: false, custom: true });
  }
  return out;
}

/* 代码块（``` 或 ~~~ 围起来的段落）的区间：这些地方里的尖括号不当标签看 */
export function codeRanges(text) {
  var out = [], re = /^[ \t]*(```|~~~)/gm, m, start = -1;
  while ((m = re.exec(text))) {
    if (start < 0) { start = m.index; }
    else { out.push([start, m.index + m[0].length]); start = -1; }
  }
  if (start >= 0) { out.push([start, text.length]); }   /* 没关上的代码块：一直到末尾 */
  return out;
}

/* 某个 HTML 标签**里面**的区间（`<medium>…</medium>` 之间的那一段）。
   返回的是夹在两个标签中间的部分，**不含标签自己** —— 含进去的话，`<medium>` 自己没写闭合时
   连它这个开始标签都会被跳过，于是「补一个 `</medium>`」这件事根本不会发生（踩过）。
   没写闭合标签就一路算到消息末尾。 */
export function htmlRegions(text, name) {
  var out = [], low = text.toLowerCase(), close = '</' + name.toLowerCase() + '>';
  var re = new RegExp('<' + name + '\\b[^>]*>', 'gi'), m;
  while ((m = re.exec(text))) {
    var inner = m.index + m[0].length;
    var end = low.indexOf(close, inner);
    out.push([inner, end < 0 ? text.length : end]);
    if (end < 0) { break; }
    re.lastIndex = end;                     /* 从闭合标签后面接着找下一个 */
  }
  return out;
}

/* 一律不当标签看的区间：代码块 + HTML 卡片区（`<medium>` / `<medium_content>` / `<details>`）。
   `<details>` 那一条是**防误伤**：预设允许 AI 在卡片里写 `<details><summary>标题</summary>…</details>`，
   不排除的话那个 `summary` 会被当成本预设的摘要块，凭空补一个 `</summary>` 到卡片外面去。 */
export function skipRanges(text) {
  var out = codeRanges(text);
  ['medium', 'medium_content', 'details'].forEach(function (n) {
    var r = htmlRegions(text, n);
    for (var i = 0; i < r.length; i++) { out.push(r[i]); }
  });
  return out;
}

function inRanges(ranges, at) {
  for (var i = 0; i < ranges.length; i++) { if (at >= ranges[i][0] && at < ranges[i][1]) { return true; } }
  return false;
}

/* 把文本切成标签记号流。只有登记表里的标签才算记号，其余尖括号（`<div>`、`<br>` 之类）一律忽略。
   属性段排掉 `<`（挡掉嵌套尖括号，也避免 `<a<a<a…` 把正则拖进回溯），并且**不许吃掉结尾那个 `/`** ——
   写成 `/(?!>)` + `[^<>"'/]` 才认得出 `<MakeImage prompt="a>b"/>` 是自闭合（用贪婪的 `[^<>"']` 时
   那段会把 `/` 吞进属性里，于是自闭合被当成开始标签，平白补出一个 `</MakeImage>`，实测踩过）。 */
export function tokenize(text, specs) {
  var out = [], re = /<(\/?)([A-Za-z][A-Za-z0-9_]*)((?:"[^"]*"|'[^']*'|\/(?!>)|[^<>"'\/])*)(\/?)>/g, m;
  var skip = skipRanges(text);
  while ((m = re.exec(text))) {
    if (inRanges(skip, m.index)) { continue; }
    var spec = tagSpecOf(m[2], specs);
    if (!spec) { continue; }
    if (m[4] === '/') { continue; }                 /* 自闭合：不参与配对 */
    out.push({
      tag: m[2], label: spec.label, sibling: !!spec.sibling,
      close: m[1] === '/',
      start: m.index, end: m.index + m[0].length
    });
  }
  return out;
}

/* 扫一遍：谁没闭合、谁是孤立的闭合标签。
   交错写法（`<甲><乙></甲></乙>`）里被夹住的那个，补位点记在**救它的那个闭合标签前面**
   （`item.at`）—— 那正是用户说的「补到紧挨着标签的前面」。 */
export function scanTags(text, specs) {
  var toks = tokenize(text, specs);
  var stack = [], unclosed = [], stray = [], pairs = [], i, k;
  for (i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (!t.close) { stack.push(t); continue; }
    k = -1;
    for (var j = stack.length - 1; j >= 0; j--) { if (stack[j].tag === t.tag) { k = j; break; } }
    if (k < 0) { stray.push(t); continue; }
    /* k 之上那些开始标签等不到自己的闭合了（交错写法）：记成没闭合，补位点就是眼前这个闭合标签 */
    for (var q = stack.length - 1; q > k; q--) {
      var los = stack[q];
      los.at = t.start;
      unclosed.push(los);
    }
    pairs.push({ tag: stack[k].tag, openStart: stack[k].start, closeStart: t.start });
    stack.length = k;
  }
  for (i = 0; i < stack.length; i++) { unclosed.push(stack[i]); }
  return { tokens: toks.length, unclosed: unclosed, stray: stray, pairs: pairs, ok: !unclosed.length && !stray.length };
}

/* 一个没闭合的块，闭合标签该补在哪：
   ① 被别的闭合标签救下来的（`item.at`）→ 补在那个标签前面；
   ② 后面紧跟着一个「写完整的兄弟块」→ 补在那个块前面；
   ③ 否则补在消息末尾（`<out_body>` 与 `<medium>` 系列永远走这一条）。 */
export function closeAt(text, item, scan, specs) {
  var at = (typeof item.at === 'number') ? item.at : text.length, i;
  if (typeof item.at === 'number') { return at; }
  var self = tagSpecOf(item.tag, specs);
  if (!self || !self.sibling) { return at; }        /* 总标签 / 嵌在正文里的：永远补末尾 */
  for (i = 0; i < scan.pairs.length; i++) {
    var p = scan.pairs[i];
    if (p.openStart <= item.end) { continue; }
    var spec = tagSpecOf(p.tag, specs);
    if (!spec || !spec.sibling) { continue; }
    /* 只有「这个兄弟块之后全都写完整了」才算分界 —— 后面还有没闭合的标签时，
       说明那个块本身就在这个没闭合的块里面，分界不成立（硬切会把半个块切开）。 */
    var tailOk = true;
    for (var u = 0; u < scan.unclosed.length; u++) {
      if (scan.unclosed[u].start > p.openStart) { tailOk = false; break; }
    }
    if (!tailOk) { continue; }
    if (p.openStart < at) { at = p.openStart; }
  }
  return at;
}

/* 主函数：按档位改写文本。
   返回 { text, mode, closed:[标签名], removed:[标签名], strayLeft:[标签名], changes:[…], changed }
   `changes` 是**这一次实际会动的东西**（用户 2026-09-30 要求确认窗报这个，而不是「我管哪些标签」）：
     { kind:'close'|'remove', tag, label, from:<原文片段>, n:<合并后的条数> }
   —— close 的 from 就是将要插进去的那个闭合标签（`</content>`）；
      remove 的 from 是被删掉的那一段原文（`<options>` 或 `</options>`，一眼能看出删的是头还是尾）。 */
export function repairTags(text, mode, specs) {
  var src = String(text == null ? '' : text);
  var res = { text: src, mode: mode, closed: [], removed: [], strayLeft: [], changes: [], changed: false };
  if (mode !== 'close' && mode !== 'del') { return res; }
  var scan = scanTags(src, specs);
  var i, spec;
  if (mode === 'close') {
    /* 没闭合的：由内向外补（列表里后面的先开，所以倒着补位置从大到小，插入不会互相挪位） */
    var todo = [];
    for (i = 0; i < scan.unclosed.length; i++) {
      var it = scan.unclosed[i];
      todo.push({ at: closeAt(src, it, scan, specs), insert: '</' + it.tag + '>', tag: it.tag });
    }
    todo.sort(function (a, b) { return b.at - a.at; });
    var out = src;
    for (i = 0; i < todo.length; i++) {
      out = out.slice(0, todo[i].at) + todo[i].insert + out.slice(todo[i].at);
      res.closed.push(todo[i].tag);
    }
    res.text = out;
    /* 补全模式不动孤立的闭合标签，只把它们报出来（面板上提醒用户可以切档位） */
    for (i = 0; i < scan.stray.length; i++) { res.strayLeft.push(scan.stray[i].tag); }
    res.changed = !!res.closed.length;
    /* changes 按**它在最终文本里的先后**排（人读的顺序）：位置小的在前；
       同一个位置的，后插进去的反而更靠前（内层先补）。插入本身是倒着做的，所以这里要重排。 */
    var ordered = todo.map(function (t, idx) { return { at: t.at, seq: idx, insert: t.insert, tag: t.tag }; });
    ordered.sort(function (a, b) { return (a.at !== b.at) ? (a.at - b.at) : (b.seq - a.seq); });
    for (i = 0; i < ordered.length; i++) {
      spec = tagSpecOf(ordered[i].tag, specs);
      res.changes.push({ kind: 'close', tag: ordered[i].tag, label: (spec && spec.label) || '', from: ordered[i].insert, n: 1 });
    }
  } else {
    /* 删除模式：配不上对的开始标签与孤立的闭合标签，删掉标签本身，内容原样留着 */
    var cuts = [], c;
    for (c = 0; c < scan.unclosed.length; c++) { cuts.push([scan.unclosed[c].start, scan.unclosed[c].end, scan.unclosed[c].tag]); }
    for (c = 0; c < scan.stray.length; c++) { cuts.push([scan.stray[c].start, scan.stray[c].end, scan.stray[c].tag]); }
    /* 先按**文档先后**留一份给 changes（人读的顺序），再倒着删（倒着删才不会挪动前面的位置） */
    var inDoc = cuts.slice().sort(function (a, b) { return a[0] - b[0]; });
    for (c = 0; c < inDoc.length; c++) {
      spec = tagSpecOf(inDoc[c][2], specs);
      res.changes.push({ kind: 'remove', tag: inDoc[c][2], label: (spec && spec.label) || '', from: src.slice(inDoc[c][0], inDoc[c][1]), n: 1 });
    }
    cuts.sort(function (a, b) { return b[0] - a[0]; });
    var out2 = src;
    for (c = 0; c < cuts.length; c++) {
      out2 = out2.slice(0, cuts[c][0]) + out2.slice(cuts[c][1]);
      res.removed.push(cuts[c][2]);
    }
    res.text = out2;
    res.changed = !!res.removed.length;
  }
  /* 同一档位里同一种改动合并计数（两处都补 </content> 就写成一条 ×2），确认窗才看得清 */
  var merged = [], seen = {};
  for (i = 0; i < res.changes.length; i++) {
    var ch = res.changes[i], key = ch.kind + '|' + ch.tag + '|' + ch.from;
    if (seen[key] === undefined) { seen[key] = merged.length; merged.push({ kind: ch.kind, tag: ch.tag, label: ch.label, from: ch.from, n: 1 }); }
    else { merged[seen[key]].n++; }
  }
  res.changes = merged;
  return res;
}

/* 把 changes 说成人话（一行一条），面板的确认窗直接列出来。
   limit 是保险丝：真出现离谱的一堆改动时只列前几条，其余并成一句「还有 N 处」。 */
export function describeChanges(res, limit) {
  var max = limit || 8, out = [], i;
  if (!res || !res.changes || !res.changes.length) { return out; }
  for (i = 0; i < res.changes.length; i++) {
    var ch = res.changes[i];
    if (i >= max) { out.push('还有 ' + (res.changes.length - max) + ' 处'); break; }
    out.push({ kind: ch.kind, text: ch.from + (ch.n > 1 ? (' ×' + ch.n) : ''), label: ch.label });
  }
  return out;
}

/* 给面板用的一句话描述：把结果说成人话 */
export function describeFix(res) {
  if (!res || !res.changed) { return '没发现要处理的标签'; }
  var parts = [];
  if (res.closed.length) { parts.push('补全 ' + res.closed.length + ' 处（' + uniq(res.closed).join('、') + '）'); }
  if (res.removed.length) { parts.push('删掉 ' + res.removed.length + ' 处孤立标签（' + uniq(res.removed).join('、') + '）'); }
  if (res.strayLeft && res.strayLeft.length) { parts.push('另有 ' + res.strayLeft.length + ' 处孤立闭合标签没管（切到「删除」才清）'); }
  return parts.join('；');
}

function uniq(arr) {
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
  return out;
}

/* 面板上「管哪些标签」那一行：直接由登记表生成，改表就跟着变 */
export function tagListText(specs) {
  var list = specs || TAG_SPECS;
  return list.map(function (s) { return '<' + s.tag + '>（' + s.label + '）'; }).join('、');
}
