import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../../src/frontend/message/markdown';

const html = (t: string): string => renderToStaticMarkup(React.createElement(Markdown, { text: t }));

test('有序列表：条目之间隔空行仍是同一个列表，编号不从 1 重来', () => {
  const h = html('1. 一\n\n2. 二\n\n3. 三');
  assert.equal((h.match(/<ol/g) || []).length, 1);
  assert.equal((h.match(/<li>/g) || []).length, 3);
  assert.match(html('3. 三\n4. 四'), /<ol start="3">/);
});

test('列表条目下缩进的引用并进上一条', () => {
  const h = html('3. **署名示例：**\n\n   > 本预设基于某某修改\n   > 许可协议：CC BY-NC 4.0\n\n4. 下一条');
  assert.equal((h.match(/<ol/g) || []).length, 1);
  assert.match(h, /<li><strong>署名示例：<\/strong><br\/>本预设基于某某修改<br\/>许可协议：CC BY-NC 4.0<\/li>/);
  assert.ok(!h.includes('<blockquote'));
});

test('竖线表格：表头 + 行，外面包可横向滚动的容器', () => {
  const h = html('前文\n| 条件 | 说明 |\n|------|------|\n| **署名** | 注明作者 |\n| 非商业 | 不得出售 |\n后文');
  assert.match(h, /<table><thead><tr><th>条件<\/th><th>说明<\/th><\/tr><\/thead><tbody><tr><td><strong>署名<\/strong><\/td><td>注明作者<\/td><\/tr>/);
  assert.match(h, /data-k-swipe="off"/);
  assert.match(h, /<p>前文<\/p>/);
  assert.match(h, /<p>后文<\/p>/);
});

test('不是表格的竖线照常当段落；尖括号原样显示', () => {
  assert.match(html('a | b'), /<p>a \| b<\/p>/);
  assert.match(html('<script>x</script>'), /&lt;script&gt;/);
});
