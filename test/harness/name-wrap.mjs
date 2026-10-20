import assert from 'node:assert/strict';
import { nameWrapReplace, nameWrapExceptImageTask } from '../../src/scripts/_name-wrap-pure.js';

let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }

const BT = String.fromCharCode(96);
const UL = '__';
const NONE = '';
const counter = () => ({ n: 0 });

/* 基础三档 */
{
  const c = counter();
  eq(nameWrapReplace('a<n>奈亚子</n>b', BT, BT, c), 'a' + BT + '奈亚子' + BT + 'b', '反引号');
  eq(c.n, 1, '反引号计数');
  eq(nameWrapReplace('<n>她</n>', UL, UL, counter()), UL + '她' + UL, '双下划线');
  eq(nameWrapReplace('<n>她</n>', NONE, NONE, counter()), '她', '无包裹');
}

/* 合并系统消息：文生图块外照常替换，块内不动 —— 真机 bug 回归 */
{
  const merged = [
    '4. 角色名称：所有出现的角色名必须使用双下划线包裹（Markdown 加粗）',
    '  - 格式：<n>角色名</n>',
    '  - 示例：<n>艾莉亚</n>转过身来，看着眼前的<n>卡恩</n>。',
    '<image_task>',
    '## text_to_image',
    '示例：<n>不应被替换</n>',
    '</image_task>',
    '结尾：<n>奈亚子</n>'
  ].join('\n');
  const c = counter();
  const res = nameWrapExceptImageTask(merged, BT, BT, c);
  eq(res.text.indexOf('<n>角色名</n>') < 0, true, '系统消息里的格式行被替换');
  eq(res.text.indexOf(BT + '艾莉亚' + BT) >= 0, true, '系统消息里的示例被替换');
  eq(res.text.indexOf(BT + '卡恩' + BT) >= 0, true, '同一行的第二个名字被替换');
  eq(res.text.indexOf('<n>不应被替换</n>') >= 0, true, '文生图块内保持原样');
  eq(res.text.indexOf(BT + '奈亚子' + BT) >= 0, true, '块后的名字被替换');
  eq(c.n, 4, '只数块外替换');
  eq(res.skippedBlocks, 1, '保护 1 个块');
  eq(res.skippedTokens, 1, '块内 1 处 <n> 没动');
}

/* 行内提及 <image_task> 不能把后面的整段保护起来（HTML美化条目里的那句提及） */
{
  const text = '本条只约束 HTML 美化卡片里的内联配图，不改变也不限制<image_task>的规则。\n示例：<n>奈亚子</n>与<n>艾琳</n>。';
  const c = counter();
  const res = nameWrapExceptImageTask(text, BT, BT, c);
  eq(res.text.indexOf(BT + '奈亚子' + BT) >= 0, true, '行内提及后仍替换');
  eq(res.text.indexOf(BT + '艾琳' + BT) >= 0, true, '行内提及后的第二个名字也替换');
  eq(c.n, 2, '行内提及不算块');
  eq(res.skippedBlocks, 0, '没有块被保护');
}

/* 多个块 + 块不在行首（不算块） */
{
  const text = '前<n>甲</n>\n<image_task>\n<n>块一</n>\n</image_task>\n中<n>乙</n>\n  <image_task>\n<n>块二</n>\n</image_task>\n后<n>丙</n>';
  const c = counter();
  const res = nameWrapExceptImageTask(text, BT, BT, c);
  eq(c.n, 3, '块外三处替换');
  eq(res.skippedBlocks, 2, '两个行首块（允许缩进）');
  eq(res.skippedTokens, 2, '两个块内各一处');
  eq(res.text.indexOf(BT + '甲' + BT) >= 0 && res.text.indexOf(BT + '丙' + BT) >= 0, true, '块外保留');
  const inline = '句子里的<image_task>不是块，<n>她</n>';
  const c2 = counter();
  eq(nameWrapExceptImageTask(inline, BT, BT, c2).text.indexOf(BT + '她' + BT) >= 0, true, '行内 <image_task> 不算块');
}

/* CRLF / 空 / 无标记 */
{
  const text = '前<n>甲</n>\r\n<image_task>\r\n<n>块</n>\r\n</image_task>\r\n后<n>乙</n>';
  const c = counter();
  const res = nameWrapExceptImageTask(text, BT, BT, c);
  eq(c.n, 2, 'CRLF 块外两处');
  eq(res.skippedBlocks, 1, 'CRLF 块');
  eq(nameWrapReplace('', BT, BT, counter()), '', '空文本');
  eq(nameWrapReplace('没有标记', BT, BT, counter()), '没有标记', '无标记');
}

console.log('角色名包裹纯逻辑：' + checks + ' 项通过');
