import fs from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { expandForRegex } from '../../build/kami-doc.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const list = JSON.parse(fs.readFileSync(new URL('../../src/regex/list.json', import.meta.url)));
const rolling = list.find(row => row.scriptName.startsWith('压缩|摘要/设定'));
const search = list.find(row => row.scriptName === '前端|网络搜索资料');
let count = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); count++; };
const apply = text => text.replace(eval(rolling.findRegex), rolling.replaceString);
const summary = '<summary>本轮摘要</summary>', setting = '<char_setting>角色设定</char_setting>';
const result = '<search_results>{"facts":[]}</search_results>';
for (const blocks of [[summary], [setting], [result], [result, summary, setting], [summary, result, summary]]) {
  eq(apply('<out_body>开头<introduction>思考' + blocks.join('</introduction>\n正文\n<introduction>') + '</introduction>尾部</out_body>'), blocks.join(''), '保留全部分散的指定标签');
}
for (const text of ['', '没有摘要的正文', '<introduction>仅思考</introduction>', '<content>剧情</content>', '<summary>未结束', '<search_results>未结束']) eq(apply(text), '', '没有完整指定块则全部去除');
eq(apply('<details><summary>折叠标题</summary>内容</details>' + result), '<summary>折叠标题</summary>' + result, '正则仅按已约定标签名称保留，不改变历史 HTML summary 语义');
eq(result.repeat(2).match(eval(search.findRegex)).length, 1, '继续生成的连续记录仅生成一张资料卡');
eq(search.promptOnly, false); eq(search.markdownOnly, true);
const doc = expandForRegex(root, 'search');
eq(doc.includes('@@KAMI_'), false); eq(/\$(?:\d|<)/.test(doc), false, '常量文档不接收原文捕获替换');
for (const match of doc.matchAll(/<script>([\s\S]*?)<\/script>/g)) { new Function(match[1]); count++; }
const long = '长篇剧情文本。'.repeat(100000) + result + '后续剧情'.repeat(100000) + summary;
const start = performance.now(); eq(apply(long), result + summary);
assert.ok(performance.now() - start < 2000, '滚动正则在大段文本上无明显回溯阻塞'); count++;
console.log('搜索资料前端与滚动压缩：' + count + ' 项通过');
