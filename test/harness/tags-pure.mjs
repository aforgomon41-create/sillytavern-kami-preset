#!/usr/bin/env node
/**
 * 「自动标签处理」纯逻辑单测（离线，不需要酒馆）
 * 用法：node test/harness/tags-pure.mjs
 *
 * 它测的是 src/scripts/_tags-pure.js —— 构建期内联进 40-预设设置.js 的那份。
 * 这里只碰纯函数：给一段 AI 回复，看它认不认得出没闭合的标签、补在哪儿、删得对不对。
 */
import { TAG_SPECS, repairTags, scanTags, closeAt, tokenize, describeFix, tagListText, parseCustomTags, specsWithCustom } from '../../src/scripts/_tags-pure.js';

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

/* ── ⑬ 面板上的文案与登记表联动 ── */{
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

console.log('=== 「自动标签处理」纯逻辑单测 ===');
if (bad.length) { console.log(bad.map((b, i) => '  ✗ ' + (i + 1) + '. ' + b).join('\n')); }
console.log('=== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
