#!/usr/bin/env node
/**
 * 「自动标签处理」纯逻辑单测（离线，不需要酒馆）
 * 用法：node test/harness/tags-pure.mjs
 *
 * 它测的是 src/scripts/_tags-pure.js —— 构建期内联进 40-预设设置.js 的那份。
 * 这里只碰纯函数：给一段 AI 回复，看它认不认得出没闭合的标签、补在哪儿、删得对不对。
 *
 * ⑯ 那一段是**覆盖模式**（用户 2026-10-01 点名「无论是什么标签都会处理」）：
 *   打开后登记表外的标签也按当前档位处理，唯一豁免是 HTML 自带标签（HTML_TAGS）。
 *
 * ⑰ 那一段是**中文标签名**（用户 2026-10-01 真机反馈「不会识别中文标签」）：
 *   标签名放开汉字（基本区 + 扩展 A）；没开覆盖又没填自定义时，中文尖括号照旧不算标签。
 */
import { TAG_SPECS, HTML_TAGS, isHtmlTag, coverSpec, repairTags, scanTags, closeAt, tokenize, describeFix, tagListText, parseCustomTags, specsWithCustom, describeChanges } from '../../src/scripts/_tags-pure.js';

let pass = 0, fail = 0;
const bad = [];
function eq(actual, expect, label) {
  if (actual === expect) { pass++; return; }
  fail++;
  bad.push(label + '\n    期望：' + JSON.stringify(expect) + '\n    实际：' + JSON.stringify(actual));
}
function ok(cond, label) { eq(!!cond, true, label); }

/* ── ① 被截断的回复：内容写到最后，闭合标签没来得及写 ── */
{
  const src = '<content>奈亚子推开门，屋里一片漆黑。';
  const r = repairTags(src, 'close');
  eq(r.text, src + '</content>', '① 末尾补上闭合标签');
  eq(r.closed.join(','), 'content', '① 报告补了哪个标签');
  eq(repairTags(src, 'off').text, src, '① 关闭档：一个字都不动');
  eq(repairTags(src, 'del').text, '奈亚子推开门，屋里一片漆黑。', '① 删除档：删掉开始标签，内容留着');
}

/* ── ② 已经写完整的：不许动 ── */
{
  for (const src of [
    '<content>正文</content>',
    '<nyaruko_think>思考</nyaruko_think><content>正文</content><options>1. 走 2. 留</options>',
    '这里没有任何标签，只是普通正文。',
    '<div class="x">不是我们的标签</div>',
    '<StatusPlaceHolderImpl/>'
  ]) {
    eq(repairTags(src, 'close').text, src, '② 完整的文本原样返回：' + src.slice(0, 24));
    eq(repairTags(src, 'del').text, src, '② 完整的文本原样返回（删除档）：' + src.slice(0, 24));
  }
}

/* ── ③ 没闭合的正文后面跟着写完整的行动选项：补在选项块前面，不许吞掉它 ── */
{
  const src = '<content>正文一段<options>1. 走\n2. 留</options>';
  const r = repairTags(src, 'close');
  eq(r.text, '<content>正文一段</content><options>1. 走\n2. 留</options>', '③ 补在尾巴块前面');
}

/* ── ④ 层层没闭合：由内向外补 ── */
{
  const src = '<content>正文<summary>摘要';
  eq(repairTags(src, 'close').text, '<content>正文<summary>摘要</summary></content>', '④ 里面的先补');
}

/* ── ⑤ 交错写法：先到的闭合标签救不了夹在里面的那个 ── */
{
  const src = '<content>甲<options>乙</content>丙</options>';
  const r = repairTags(src, 'close');
  eq(r.text, '<content>甲<options>乙</options></content>丙</options>', '⑤ 被夹住的补在救它的那个标签前面');
  eq(r.strayLeft.join(','), 'options', '⑤ 多出来的闭合标签只报告、不动它');
}

/* ── ⑥ 删除档：孤立的闭合标签也清掉 ── */
{
  eq(repairTags('正文</content>', 'del').text, '正文', '⑥ 孤立闭合标签删掉');
  eq(repairTags('正文</content>', 'close').text, '正文</content>', '⑥ 补全档不动它');
  eq(repairTags('<content>甲</options>乙', 'del').text, '甲乙', '⑥ 两个都配不上：都删');
}

/* ── ⑦ 自闭合标签、代码块、别的标签一律不碰 ── */
{
  const src = '<content>看这段：\n```html\n<div>示例</div>\n```\n就这样';
  eq(repairTags(src, 'close').text, src + '</content>', '⑦ 代码块里的尖括号不当标签');
  eq(repairTags('<MakeImage prompt="a>b"/>', 'close').text, '<MakeImage prompt="a>b"/>', '⑦ 自闭合不参与配对');
  eq(scanTags('<content a="1">甲</content>').ok, true, '⑦ 带属性的开始标签照样配对');
}

/* ── ⑧ 扫描器本身的读数 ── */
{
  const s = scanTags('<content>甲<options>乙</options>');
  eq(s.unclosed.map(x => x.tag).join(','), 'content', '⑧ 没闭合的就是正文块');
  eq(s.stray.length, 0, '⑧ 没有孤立的闭合标签');
  eq(s.ok, false, '⑧ 整体判定为「有问题」');
  eq(scanTags('<content>甲</content>').ok, true, '⑧ 完整时判定为「没问题」');
}

/* ── ⑨ HTML 卡片区里的标签一律不碰（防误伤，调研点名的隐患） ── */
{
  /* AI 在 <medium> 卡片里写 <details><summary>：那个 summary 是 HTML 的，不是我们的摘要块 */
  const src = '<content>正文</content><medium><details><summary>属性面板</summary><p>力量 10</p></details></medium>';
  eq(repairTags(src, 'close').text, src, '⑨ 卡片里的 <details><summary> 不许动');
  eq(repairTags(src, 'del').text, src, '⑨ 卡片里的 <details><summary> 不许删（删除档也一样）');
  /* 卡片外面那个 summary 才是我们的摘要块 */
  const src2 = '<content>正文</content><medium><details><summary>面板</summary></details></medium><summary>摘要没写完';
  eq(repairTags(src2, 'close').text, src2 + '</summary>', '⑨ 卡片外面没闭合的摘要照补');
  /* <medium> 自己没闭合：补在末尾，不许补到后面的兄弟块前面去（它按设计嵌在正文里） */
  const src3 = '<content>甲</content><medium>卡片<options>1. 走</options>';
  eq(repairTags(src3, 'close').text, src3 + '</medium>', '⑨ medium 没闭合补在末尾');
  /* 卡片没写闭合时，里面的一切都算卡片内容 */
  const src4 = '<medium><details><summary>面板</summary></details>卡片还没写完';
  eq(repairTags(src4, 'close').text, src4 + '</medium>', '⑨ 卡片没闭合：里面的 summary 不算数');
}

/* ── ⑩ 总标签与兄弟块的边界规则 ── */
{
  /* out_body 包住一切：它没闭合时补在末尾，不许补到选项块前面 */
  const src = '<out_body><content>甲</content><options>1. 走</options>';
  eq(repairTags(src, 'close').text, src + '</out_body>', '⑩ 总标签补在末尾（兄弟块在它里面）');
  /* 正文没闭合、后面跟着写完整的前处理/后处理块：补在那个块前面 */
  eq(repairTags('<content>甲<appendix>附注</appendix>', 'close').text,
    '<content>甲</content><appendix>附注</appendix>', '⑩ 补在后处理块前面');
  eq(repairTags('<introduction>前情<content>甲</content>', 'close').text,
    '<introduction>前情</introduction><content>甲</content>', '⑩ 补在正文块前面');
  /* 思维链、设定、图片这些兄弟块同理 */
  eq(repairTags('<think>在想<content>甲</content>', 'close').text,
    '<think>在想</think><content>甲</content>', '⑩ 原生思维链补在正文块前面');
  eq(repairTags('<nyaruko_think>在想</nyaruko_think><content>甲<char_setting>设定', 'close').text,
    '<nyaruko_think>在想</nyaruko_think><content>甲<char_setting>设定</char_setting></content>', '⑩ 设定块没闭合补在末尾');
  eq(repairTags('<content>甲<image>图</image>', 'close').text,
    '<content>甲</content><image>图</image>', '⑩ 图片块算兄弟块');
}

/* ── ⑫ 自定义标签（面板上的输入框） ── */
{
  eq(parseCustomTags('foo bar,baz、qux；quux|last').join(','), 'foo,bar,baz,qux,quux,last', '⑫ 逗号/顿号/空格/分号/竖线都能当分隔符');
  eq(parseCustomTags('<mytag> <other>').join(','), 'mytag,other', '⑫ 带尖括号也认（替用户去掉）');
  eq(parseCustomTags('foo foo foo').join(','), 'foo', '⑫ 重复的只留一个');
  eq(parseCustomTags('content summary').join(','), '', '⑫ 内置标签忽略（本来就管）');
  eq(parseCustomTags('1bad _bad bad-dash bad.dot').join(','), '', '⑫ 不合法的标签名丢弃');
  eq(parseCustomTags('').join(','), '', '⑫ 空输入');
  eq(parseCustomTags(null).join(','), '', '⑫ null 不炸');

  /* 并进登记表之后真的管起来 */
  const specs = specsWithCustom(['note', 'aside']);
  eq(specs.length, TAG_SPECS.length + 2, '⑫ 自定义标签并进登记表');
  eq(tagListText(specs).indexOf('<note>（自定义）') >= 0, true, '⑫ 清单里标成「自定义」');
  eq(repairTags('<note>备注没写完', 'close', specs).text, '<note>备注没写完</note>', '⑫ 自定义标签能补全');
  eq(repairTags('<note>备注没写完', 'close').text, '<note>备注没写完', '⑫ 没并进去时不管它');
  eq(repairTags('甲</aside>', 'del', specs).text, '甲', '⑫ 自定义标签能删除');
  /* 自定义标签不当分界：别让它把别的标签提前闭合 */
  const s2 = specsWithCustom(['note']);
  eq(repairTags('<content>正文<note>备注</note>', 'close', s2).text,
    '<content>正文<note>备注</note></content>', '⑫ 自定义标签不会被当成兄弟块分界');
}

/* ── ⑭ 确认窗要报「这一次实际会改什么」（用户 2026-09-30 要求） ── */
{
  const r1 = repairTags('<content>甲', 'close');
  eq(r1.changes.length, 1, '⑭ 一处改动 = 一条');
  eq(r1.changes[0].kind + '|' + r1.changes[0].tag + '|' + r1.changes[0].from + '|' + r1.changes[0].label,
    'close|content|</content>|正文块', '⑭ 补全条目说清补的是什么、补哪个标签');
  const r2 = repairTags('<content>甲<summary>乙', 'close');
  eq(r2.changes.map(c => c.from).join(','), '</summary>,</content>', '⑭ 两处补全各一条');
  const r3 = repairTags('<content>甲<content>乙', 'close');
  eq(r3.changes.length, 1, '⑭ 同一种改动合并成一条');
  eq(r3.changes[0].n, 2, '⑭ 合并后带上条数');
  eq(describeChanges(r3)[0].text, '</content> ×2', '⑭ 说人话时带 ×N');
  const r4 = repairTags('<content>甲</options>乙', 'del');
  eq(r4.changes.map(c => c.kind + ':' + c.from).join(','), 'remove:<content>,remove:</options>', '⑭ 删除条目给出被删掉的原文（分得清头尾）');
  const r5 = repairTags('<content>甲<options>乙</content>丙</options>', 'close');
  eq(r5.changes[0].from, '</options>', '⑭ 交错写法报的是补进去的那一个');
  eq(r5.strayLeft.join(','), 'options', '⑭ 补全档另外报出没管的孤立闭合标签');
  eq(describeChanges(repairTags('甲', 'close')).length, 0, '⑭ 没改动就没有条目');
  const many = repairTags('<a1><a2><a3><a4><a5><a6><a7><a8><a9><a10>', 'close', TAG_SPECS.concat(
    Array.from({ length: 10 }, (_, i) => ({ tag: 'a' + (i + 1), label: '自定义', sibling: false }))));
  eq(describeChanges(many, 3).length, 4, '⑭ 超过上限时并成一句「还有 N 处」');
  eq(describeChanges(many, 3)[3], '还有 7 处', '⑭ 那句的数目对得上');
}

/* ── ⑮ 面板上的文案与登记表联动 ── */{
  ok(tagListText().includes('<content>（正文块）'), '⑨ 标签清单由登记表生成');
  ok(tagListText().includes('<options>（行动选项）'), '⑨ 标签清单里有行动选项');
  ok(TAG_SPECS.length >= 10, '⑨ 登记表至少有 10 个标签');
  eq(describeFix(repairTags('甲', 'close')), '没发现要处理的标签', '⑨ 无事发生时的说法');
  eq(describeFix(repairTags('<content>甲', 'close')), '补全 1 处（content）', '⑨ 补全后的说法');
  ok(describeFix(repairTags('<content>甲', 'del')).indexOf('删掉 1 处') === 0, '⑨ 删除后的说法');
}

/* ── ⑩ 边界：空文本、只有标签、超长无标签文本 ── */
{
  eq(repairTags('', 'close').text, '', '⑩ 空文本不炸');
  eq(repairTags(null, 'close').text, '', '⑩ null 不炸');
  eq(repairTags('<content>', 'close').text, '<content></content>', '⑩ 只有开始标签');
  eq(repairTags('</content>', 'close').text, '</content>', '⑩ 只有闭合标签（补全档不动）');
  eq(repairTags('</content>', 'del').text, '', '⑩ 只有闭合标签（删除档清掉）');
  const long = '甲'.repeat(20000);
  eq(repairTags(long, 'close').text.length, 20000, '⑩ 两万字无标签文本原样返回');
  eq(tokenize(long).length, 0, '⑩ 两万字无标签文本切出 0 个记号');
}

/* ── ⑯ 覆盖模式（用户 2026-10-01 点名「无论是什么标签都会处理」） ──
   第 4 个参数 coverage 为真时，登记表里没登记的标签也参与处理；HTML 自带标签照旧豁免。
   覆盖进来的标签 label 统一「其他标签」、sibling 一律 false（不给人当分界，补位一律消息末尾）。 */
{
  /* ⑯-a 不开覆盖：登记表外的标签一动不动（回归保护，老调用方零影响） */
  eq(repairTags('<foo>甲', 'close', TAG_SPECS, false).text, '<foo>甲', '⑯ 不开覆盖：未知开始标签不补');
  eq(repairTags('<foo>甲', 'del', TAG_SPECS, false).text, '<foo>甲', '⑯ 不开覆盖：未知开始标签不删');
  eq(repairTags('甲</foo>', 'del', TAG_SPECS, false).text, '甲</foo>', '⑯ 不开覆盖：未知闭合标签不删');
  eq(repairTags('<foo>甲', 'close').text, '<foo>甲', '⑯ 省掉 coverage 时按关闭处理');
  eq(scanTags('<foo>甲<bar>乙', TAG_SPECS, false).ok, true, '⑯ 不开覆盖：扫描器一个记号都不认');
  eq(tokenize('<foo>甲', TAG_SPECS, false).length, 0, '⑯ 不开覆盖：切出 0 个记号');

  /* ⑯-b 开启后：未闭合的未知开始标签补在消息末尾 */
  const c1 = repairTags('<foo>甲', 'close', TAG_SPECS, true);
  eq(c1.text, '<foo>甲</foo>', '⑯ 覆盖 + 补全：未知标签补在消息末尾');
  eq(c1.closed.join(','), 'foo', '⑯ 覆盖进来的标签也报进 closed');
  eq(c1.changes[0].kind + '|' + c1.changes[0].tag + '|' + c1.changes[0].label + '|' + c1.changes[0].from,
    'close|foo|其他标签|</foo>', '⑯ 确认窗里叫它「其他标签」');
  eq(repairTags('<aaa>甲<bbb>乙', 'close', TAG_SPECS, true).text,
    '<aaa>甲<bbb>乙</bbb></aaa>', '⑯ 两个未知标签层层没闭合：由内向外补');
  eq(describeFix(c1), '补全 1 处（foo）', '⑯ 说人话时也认覆盖进来的标签');

  /* ⑯-c HTML 自带标签无论开关都不动（补 </br> 只会往正文里塞乱码、删了会把卡片拆散） */
  for (const src of [
    '甲<br>乙',
    '甲<BR>乙',
    '<img src="x.png">甲',
    '<div class="x">甲</div><span>乙<span>',
    '<a href="/x">甲</a><table><tr>',
    '<DIV>甲'
  ]) {
    eq(repairTags(src, 'close', TAG_SPECS, true).text, src, '⑯ HTML 自带标签不补：' + src.slice(0, 18));
    eq(repairTags(src, 'del', TAG_SPECS, true).text, src, '⑯ HTML 自带标签不删：' + src.slice(0, 18));
  }
  eq(tokenize('<div>甲</div>', TAG_SPECS, true).length, 0, '⑯ HTML 自带标签连覆盖模式也切不出记号');

  /* ⑯-d 代码块（``` 与 ~~~）里的未知标签不动，块外的照常处理 */
  const fence = '<foo>甲\n```\n<bar>乙\n```\n';
  eq(repairTags(fence, 'close', TAG_SPECS, true).text, fence + '</foo>', '⑯ 代码块里的未知标签不碰，块外照补');
  eq(repairTags(fence, 'del', TAG_SPECS, true).text, '甲\n```\n<bar>乙\n```\n', '⑯ 删除档也不碰代码块里的未知标签');
  const tilde = '甲\n~~~\n<bar>乙\n~~~\n';
  eq(repairTags(tilde, 'close', TAG_SPECS, true).text, tilde, '⑯ ~~~ 围起来的代码块同样豁免');

  /* ⑯-e <medium> / <medium_content> / <details> 区间里的未知标签不动 */
  const card = '<medium><foo>甲</foo></medium>';
  eq(repairTags(card, 'close', TAG_SPECS, true).text, card, '⑯ 卡片里的未知标签不补');
  eq(repairTags(card, 'del', TAG_SPECS, true).text, card, '⑯ 卡片里的未知标签不删');
  const card2 = '<medium_content><foo>甲</foo></medium_content>';
  eq(repairTags(card2, 'close', TAG_SPECS, true).text, card2, '⑯ medium_content 区间同样豁免');
  const det = '<details><foo>甲</foo></details>';
  eq(repairTags(det, 'del', TAG_SPECS, true).text, det, '⑯ details 区间同样豁免（删除档）');
  eq(repairTags('<medium><foo>甲', 'close', TAG_SPECS, true).text, '<medium><foo>甲</medium>',
    '⑯ 卡片自己没闭合：里面的未知标签不算数');
  eq(repairTags('<medium><details><summary>面板</summary></details></medium><foo>甲', 'close', TAG_SPECS, true).text,
    '<medium><details><summary>面板</summary></details></medium><foo>甲</foo>', '⑯ 卡片外面的未知标签照补');

  /* ⑯-f 自闭合 <foo/> 不参与配对（不许平白补出一个 </foo>） */
  eq(repairTags('<foo/>甲', 'close', TAG_SPECS, true).text, '<foo/>甲', '⑯ 自闭合不补出 </foo>');
  eq(repairTags('<foo a="1"/>甲', 'close', TAG_SPECS, true).text, '<foo a="1"/>甲', '⑯ 带属性的自闭合也不补');
  eq(repairTags('<foo/>甲<bar>乙', 'close', TAG_SPECS, true).text,
    '<foo/>甲<bar>乙</bar>', '⑯ 自闭合与没闭合混在一起：只补该补的');
  eq(repairTags('<foo/>甲', 'del', TAG_SPECS, true).text, '<foo/>甲', '⑯ 自闭合在删除档也不动');

  /* ⑯-g 覆盖 + 删除档：配不上对的标签本身删掉，内容一个字不动 */
  eq(repairTags('正文</foo>', 'del', TAG_SPECS, true).text, '正文', '⑯ 孤立闭合标签删掉');
  eq(repairTags('<foo>内容', 'del', TAG_SPECS, true).text, '内容', '⑯ 未闭合的开始标签删掉，内容原样留着');
  const d1 = repairTags('<foo>甲</bar>乙', 'del', TAG_SPECS, true);
  eq(d1.text, '甲乙', '⑯ 两个都配不上：都删');
  eq(d1.changes.map(c => c.kind + ':' + c.from).join(','), 'remove:<foo>,remove:</bar>',
    '⑯ 删除条目给出被删掉的原文（分得清头尾）');
  eq(d1.changes[0].label, '其他标签', '⑯ 删掉的覆盖标签也标「其他标签」');
  eq(describeFix(repairTags('<foo>甲', 'del', TAG_SPECS, true)), '删掉 1 处孤立标签（foo）', '⑯ 删除档的说法');

  /* ⑯-h 覆盖进来的标签不当兄弟块分界：一律补在消息末尾 */
  eq(repairTags('<foo>甲<content>乙</content>', 'close', TAG_SPECS, true).text,
    '<foo>甲<content>乙</content></foo>', '⑯ 补在消息末尾，不是 content 前面');
  eq(repairTags('<foo>甲<options>1. 走</options>', 'close', TAG_SPECS, true).text,
    '<foo>甲<options>1. 走</options></foo>', '⑯ 面对行动选项块也不当分界');

  /* ⑯-i 登记表里的标签在覆盖模式下行为不变（label 也不变） */
  const r9 = repairTags('正常 <content>正文', 'close', TAG_SPECS, true);
  eq(r9.text, '正常 <content>正文</content>', '⑯ 登记表标签照旧补全');
  eq(r9.changes[0].label, '正文块', '⑯ 登记表标签的 label 不变（不是「其他标签」）');
  eq(repairTags('<content>甲<options>1. 走\n2. 留</options>', 'close', TAG_SPECS, true).text,
    '<content>甲</content><options>1. 走\n2. 留</options>', '⑯ 兄弟块分界规则照旧（补在选项块前面）');
  eq(repairTags('<out_body><content>甲</content>', 'close', TAG_SPECS, true).text,
    '<out_body><content>甲</content></out_body>', '⑯ 总标签照旧补在末尾');
  eq(repairTags('<medium>卡片<options>1. 走</options>', 'close', TAG_SPECS, true).text,
    '<medium>卡片<options>1. 走</options></medium>', '⑯ medium 照旧补在末尾');

  /* ⑯-j 交错写法：不报错，结果说得通 */
  const x1 = repairTags('<foo><bar></foo>', 'close', TAG_SPECS, true);
  eq(x1.text, '<foo><bar></bar></foo>', '⑯ 交错写法：被夹住的补在救它的标签前面');
  eq(x1.changes.map(c => c.from).join(','), '</bar>', '⑯ 交错写法只补一处');
  const x2 = repairTags('<foo>甲<content>乙</foo>丙</content>', 'close', TAG_SPECS, true);
  eq(x2.text, '<foo>甲<content>乙</content></foo>丙</content>', '⑯ 混着登记表标签的交错同样处理');
  eq(x2.strayLeft.join(','), 'content', '⑯ 多出来的闭合标签只报告、不动它');
  eq(repairTags('<foo><br></foo>', 'close', TAG_SPECS, true).text, '<foo><br></foo>',
    '⑯ 中间夹着 HTML 标签不影响配对');

  /* ⑯-k 自定义标签与覆盖同时开：不重复、不冲突 */
  const both = specsWithCustom(['note']);
  const k1 = repairTags('<note>甲<foo>乙', 'close', both, true);
  eq(k1.text, '<note>甲<foo>乙</foo></note>', '⑯ 自定义与覆盖的标签都补上');
  eq(k1.changes.map(c => c.label).sort().join(','), '其他标签,自定义', '⑯ 两边的 label 分得开');
  eq(specsWithCustom(['note']).length, TAG_SPECS.length + 1, '⑯ 覆盖不往登记表里塞条目（只在扫描时临时造）');
  eq(repairTags('<note>甲</note>', 'close', both, true).changed, false, '⑯ 写完整的一句话都不动');
  eq(repairTags('<foo>甲</foo>', 'close', specsWithCustom(['foo']), true).closed.length, 0,
    '⑯ 同一个名字既是自定义又被覆盖：不会补两遍');
  eq(repairTags('<div>甲', 'close', specsWithCustom(['div']), true).text, '<div>甲</div>',
    '⑯ 用户显式登记的自定义标签优先于 HTML 豁免（点名要管就管）');

  /* ⑯-l 接口级断言（HTML_TAGS / isHtmlTag / coverSpec / 覆盖下的扫描读数） */
  ok(Array.isArray(HTML_TAGS) && HTML_TAGS.length > 0, '⑯ HTML_TAGS 是非空数组');
  eq(HTML_TAGS.length, 127, '⑯ HTML 自带标签共 127 个');
  eq(HTML_TAGS.filter(n => n !== n.toLowerCase()).length, 0, '⑯ 豁免名单全小写');
  eq(new Set(HTML_TAGS).size, HTML_TAGS.length, '⑯ 豁免名单没有重复项');
  eq(TAG_SPECS.map(s => s.tag).filter(n => isHtmlTag(n)).length, 0, '⑯ 登记表里的标签一个都没被误列进豁免名单');
  eq(isHtmlTag('DIV'), true, '⑯ isHtmlTag 认大写形式');
  eq(isHtmlTag('content'), false, '⑯ 预设的正文块不是 HTML 标签');
  eq(isHtmlTag('medium'), false, '⑯ 预设的 medium 不是 HTML 标签');
  eq(isHtmlTag(null), false, '⑯ isHtmlTag(null) 不炸');
  eq(coverSpec('x').sibling, false, '⑯ 覆盖进来的标签没有「给别人当分界」的权力');
  eq(coverSpec('x').label, '其他标签', '⑯ 覆盖进来的标签统一叫「其他标签」');
  eq(coverSpec('x').tag, 'x', '⑯ coverSpec 记住标签名');
  eq(scanTags('<foo>甲<bar>乙', TAG_SPECS, true).unclosed.map(x => x.tag).join(','), 'foo,bar',
    '⑯ 覆盖模式下扫描器报出未知标签');
  eq(scanTags('<foo>甲</foo>', TAG_SPECS, true).ok, true, '⑯ 覆盖模式下写完整的判定为「没问题」');
  eq(repairTags('<正文>甲', 'close', TAG_SPECS, true).text, '<正文>甲</正文>', '⑯ 中文标签名也认（2026-10-01 用户真机反馈后放开）');
}

/* ── ⑰ 中文标签名（用户 2026-10-01 真机反馈「不会识别中文标签」，Lead 放开字符集） ──
   标签名首字：ASCII 字母或汉字（基本区 \u4e00-\u9fff / 扩展 A \u3400-\u4dbf）；
   其余字符：ASCII 字母 / 数字 / 下划线或汉字。假名、韩文、扩展 B、全角尖括号都不算。
   放开落在两处：tokenize 的正则与 parseCustomTags 的校验。
   **安全默认不变**：没开覆盖又没填自定义时，正文里的中文尖括号照旧不当标签看。 */
{
  const CJK_A = '\u3400';            /* 汉字扩展 A 区的第一个字 */
  const KANA = '\u3042';             /* 日文平假名「あ」 */
  const HANGUL = '\ud55c\uae00';    /* 韩文「한글」 */
  const EXT_B = '\u{20000}';         /* 扩展 B 区（本次没放开） */

  /* ⑰-a 覆盖模式：中文标签照常按档位处理 */
  const cn = repairTags('<状态栏>甲', 'close', TAG_SPECS, true);
  eq(cn.text, '<状态栏>甲</状态栏>', '⑰ 覆盖 + 补全：中文标签补在消息末尾');
  eq(cn.changes[0].tag + '|' + cn.changes[0].label + '|' + cn.changes[0].from, '状态栏|其他标签|</状态栏>',
    '⑰ 补的是中文闭合标签，label 仍是「其他标签」');
  eq(describeFix(cn), '补全 1 处（状态栏）', '⑰ 说人话时中文标签名照念');
  eq(repairTags('</状态栏>甲', 'del', TAG_SPECS, true).text, '甲', '⑰ 覆盖 + 删除：孤立的中文闭合标签删掉');
  eq(repairTags('<状态栏>甲', 'del', TAG_SPECS, true).text, '甲', '⑰ 覆盖 + 删除：未闭合的中文开始标签删掉，内容留着');
  eq(repairTags('<状态栏>甲<心声>乙', 'close', TAG_SPECS, true).text,
    '<状态栏>甲<心声>乙</心声></状态栏>', '⑰ 两个中文标签层层没闭合：由内向外补');

  /* ⑰-b 安全默认：没开覆盖又没填自定义时，中文尖括号照旧不算标签 */
  eq(repairTags('<状态栏>甲', 'close', TAG_SPECS, false).text, '<状态栏>甲', '⑰ 不开覆盖：中文标签一动不动（补全档）');
  eq(repairTags('<状态栏>甲', 'del', TAG_SPECS, false).text, '<状态栏>甲', '⑰ 不开覆盖：中文标签一动不动（删除档）');
  eq(tokenize('<状态栏>甲', TAG_SPECS, false).length, 0, '⑰ 不开覆盖：中文标签一个记号都切不出来');
  eq(scanTags('<状态栏>甲', TAG_SPECS, false).ok, true, '⑰ 不开覆盖：扫描器不认中文标签');

  /* ⑰-c 自定义标签输入框：填中文也认 */
  eq(parseCustomTags('状态栏 心声,<好感度>').join(','), '状态栏,心声,好感度',
    '⑰ 输入框里中文名照收（空格 / 逗号 / 尖括号都能写）');
  eq(parseCustomTags('状态栏，心声').join(','), '状态栏,心声', '⑰ 中文逗号也当分隔符');
  eq(parseCustomTags('状态栏 状态栏').join(','), '状态栏', '⑰ 中文名重复的只留一个');
  eq(repairTags('<状态栏>甲', 'close', specsWithCustom(['状态栏']), false).text, '<状态栏>甲</状态栏>',
    '⑰ 填了自定义：不开覆盖也能补中文标签');
  eq(repairTags('<状态栏>甲', 'close', specsWithCustom(['状态栏']), false).changes[0].label, '自定义',
    '⑰ 自定义的中文标签 label 是「自定义」（不是「其他标签」）');
  eq(repairTags('</状态栏>甲', 'del', specsWithCustom(['状态栏']), false).text, '甲', '⑰ 自定义的中文标签也能删');
  eq(repairTags('<状态栏>甲</状态栏>', 'close', specsWithCustom(['状态栏']), true).changed, false,
    '⑰ 中文标签已经配对：一个都不动');

  /* ⑰-d 属性、自闭合、兄弟块规矩照旧 */
  eq(repairTags('<状态栏 颜色="红">甲', 'close', TAG_SPECS, true).text, '<状态栏 颜色="红">甲</状态栏>',
    '⑰ 带属性的中文标签照补（补的是 </状态栏>）');
  eq(repairTags('<状态栏/>甲', 'close', TAG_SPECS, true).text, '<状态栏/>甲', '⑰ 中文标签自闭合不配对');
  eq(repairTags('<状态栏v2>甲', 'close', TAG_SPECS, true).text, '<状态栏v2>甲</状态栏v2>', '⑰ 中英混名认得出来');
  eq(repairTags('<状态栏2号>甲', 'close', TAG_SPECS, true).text, '<状态栏2号>甲</状态栏2号>', '⑰ 名字中间夹数字也认');
  eq(repairTags('<状态栏>甲<content>乙</content>', 'close', TAG_SPECS, true).text,
    '<状态栏>甲<content>乙</content></状态栏>', '⑰ 中文标签不当兄弟块分界（补消息末尾）');
  eq(repairTags('正文</状态栏>', 'close', TAG_SPECS, true).strayLeft.join(','), '状态栏',
    '⑰ 补全档把中文孤立闭合标签报出来（不动它）');

  /* ⑰-e 区间豁免照旧：代码块、卡片里的中文标签一个字都不动 */
  const cnFence = '<状态栏>甲\n```\n<心声>乙\n```\n';
  eq(repairTags(cnFence, 'close', TAG_SPECS, true).text, cnFence + '</状态栏>', '⑰ 代码块里的中文标签不碰，块外照补');
  const cnTilde = '甲\n~~~\n<心声>乙\n~~~\n';
  eq(repairTags(cnTilde, 'del', TAG_SPECS, true).text, cnTilde, '⑰ ~~~ 代码块里的中文标签也不碰');
  const cnCard = '<medium><状态栏>甲</状态栏></medium>';
  eq(repairTags(cnCard, 'close', TAG_SPECS, true).text, cnCard, '⑰ 卡片里的中文标签不补');
  const cnDet = '<details><状态栏>甲</状态栏></details>';
  eq(repairTags(cnDet, 'del', TAG_SPECS, true).text, cnDet, '⑰ details 区间里的中文标签不删');
  eq(repairTags('<div 颜色="红">甲', 'close', TAG_SPECS, true).text, '<div 颜色="红">甲',
    '⑰ HTML 标签照旧豁免（属性值里是中文也一样）');

  /* ⑰-f 边界：只放开汉字基本区与扩展 A，别的字符集一律不算标签 */
  eq(repairTags('<' + CJK_A + '>甲', 'close', TAG_SPECS, true).text,
    '<' + CJK_A + '>甲</' + CJK_A + '>', '⑰ 扩展 A 区的「' + CJK_A + '」认');
  eq(repairTags('<' + KANA + '>甲', 'close', TAG_SPECS, true).text, '<' + KANA + '>甲', '⑰ 日文假名「' + KANA + '」不认');
  eq(repairTags('<' + HANGUL + '>甲', 'close', TAG_SPECS, true).text, '<' + HANGUL + '>甲', '⑰ 韩文「' + HANGUL + '」不认');
  eq(repairTags('<' + EXT_B + '>甲', 'close', TAG_SPECS, true).text, '<' + EXT_B + '>甲',
    '⑰ 扩展 B 区不认（本次只放开基本区与扩展 A）');
  eq(repairTags('\uff1c状态栏\uff1e甲', 'close', TAG_SPECS, true).text, '\uff1c状态栏\uff1e甲',
    '⑰ 全角尖括号不认（只认半角尖括号）');
  eq(repairTags('<2状态栏>甲', 'close', TAG_SPECS, true).text, '<2状态栏>甲', '⑰ 首字是数字不认');
  eq(parseCustomTags('状态栏'.repeat(10) + '心声').length, 1, '⑰ 自定义中文名到 32 字（上限）照收');
  eq(parseCustomTags('状态栏'.repeat(11)).length, 0, '⑰ 自定义中文名 33 字超长丢弃');
}

console.log('=== 「自动标签处理」纯逻辑单测 ===');
if (bad.length) { console.log(bad.map((b, i) => '  ✗ ' + (i + 1) + '. ' + b).join('\n')); }
console.log('=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
