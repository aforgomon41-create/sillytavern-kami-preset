import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countChars, parseBody, parseInline, parseOptions, splitReply, takeTag } from '../../src/frontend/message/parse';

test('标签：闭合与流式中未闭合', () => {
  assert.deepEqual(takeTag('a<content>正文</content>b', 'content'), { text: '正文', closed: true });
  assert.deepEqual(takeTag('<content>写到一半', 'content'), { text: '写到一半', closed: false });
  assert.equal(takeTag('没有标签', 'content'), null);
});

test('拆回复：思维链 / 搜索资料 / 正文 / 选项', () => {
  const raw = '<nyaruko_think>想一想</nyaruko_think><out_body><introduction><search_results>\n范围：测试\n- 事实一 [1]\n[1] https://example.com/a 例子\n</search_results></introduction>'
    + '<content>　　正文。</content><appendix><options>[{"title":"走","type":"行动","content":"走过去"}]</options></appendix></out_body>';
  const r = splitReply(raw);
  assert.equal(r.think?.text, '想一想');
  assert.equal(r.search.length, 1);
  assert.equal(r.search[0]!.facts[0]!.text, '事实一');
  assert.equal(r.body?.text, '　　正文。');
  assert.deepEqual(r.options, { items: [{ title: '走', type: '行动', content: '走过去' }], closed: true });
});

test('流式：选项写到一半不解析，标记为未闭合；末尾半截标签不显示', () => {
  const r = splitReply('<content>　　好。</content><options>[{"title":"走"');
  assert.deepEqual(r.options, { items: [], closed: false });
  assert.equal(splitReply('<content>　　夜风<').body?.text, '　　夜风');
  assert.equal(splitReply('<content>　　夜风</cont').body?.text, '　　夜风');
  assert.ok(splitReply('<search_results>\n范围：x').searchPending);
});

test('没有 <content> 的普通消息：去掉结构标签后整段当正文', () => {
  assert.equal(splitReply('一段普通回复').body?.text, '一段普通回复');
  assert.equal(splitReply('<options>[]</options>').body, null);
});

test('选项：中文字段名、外面夹字、纯字符串', () => {
  assert.deepEqual(parseOptions('前面有字 [{"标题":"甲","类型":"信息","内容":"看看"}] 后面也有'), [{ title: '甲', type: '信息', content: '看看' }]);
  assert.deepEqual(parseOptions('["直接写一句话"]'), [{ title: '直接写一句话', type: '其他', content: '直接写一句话' }]);
  assert.equal(parseOptions('不是 JSON'), null);
});

test('行内：对白 / 心理 / 角色名 / 关键词 / 专有名词，对白里可以嵌套', () => {
  const xs = parseInline('<n>艾莉亚</n>说：「*真的？*那是**圣剑**」见【旧宅】');
  assert.deepEqual(xs.map((x) => x.t), ['name', 'text', 'dialogue', 'text', 'term']);
  const d = xs[2] as Extract<typeof xs[number], { t: 'dialogue' }>;
  assert.deepEqual(d.kids.map((x) => x.t), ['thought', 'text', 'keyword']);
  assert.equal(d.close, '」');
});

test('行内：流式时对白没收口，吃到段末', () => {
  const xs = parseInline('他说：「等一');
  const d = xs[1] as Extract<typeof xs[number], { t: 'dialogue' }>;
  assert.equal(d.t, 'dialogue'); assert.equal(d.close, '');
});

test('正文：每个非空行一段，去掉段首全角空格与步骤注释，___ 是场景转换', () => {
  const b = parseBody('<!-- 步骤1/Token320 -->\n　　第一段。\n\n___\n　　第二段。\n<!-- 步骤2');
  assert.deepEqual(b.map((x) => x.t), ['para', 'scene', 'para']);
  assert.deepEqual((b[0] as { kids: Array<{ v?: string }> }).kids[0]!.v, '第一段。');
});

test('字数：去掉空白、标记与注释', () => {
  assert.equal(countChars('<!-- 步骤1 -->\n　　<n>甲</n>说 **好**。'), 4);
});
