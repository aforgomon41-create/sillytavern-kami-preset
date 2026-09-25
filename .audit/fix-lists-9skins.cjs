// 临时脚本：给 9 套皮肤加「显式列表符号」与「特效说明换行」两块规则
// 用完可删。只改 src/skins/<id>/skin.css。
const fs = require('fs');
const IDS = ['civdawn', 'crt80s', 'empire', 'isekai', 'mileng', 'terminal', 'trpg', 'wod', 'xianyun'];

const ANCHORS = {
  civdawn: 'html[data-kami-skin="civdawn"] .kami-md li {\n  margin-bottom: 0.3em;\n}\n',
  crt80s: 'html[data-kami-skin="crt80s"] .kami-md li { margin: .18em 0; }\n',
  empire: 'html[data-kami-skin="empire"] .kami-md li { margin: 0.18em 0; }\n',
  isekai: 'html[data-kami-skin="isekai"] .kami-md li {\n  margin: .2em 0;\n}\n',
  mileng: 'html[data-kami-skin="mileng"] .kami-md li {\n  margin: 0.18em 0;\n}\n',
  terminal: 'html[data-kami-skin="terminal"] .kami-md li {\n  margin: 0.18em 0;\n}\n',
  trpg: 'html[data-kami-skin="trpg"] .kami-md li { margin: .18em 0; }\n',
  wod: 'html[data-kami-skin="wod"] .kami-md li { margin: .2em 0; }\n',
  xianyun: 'html[data-kami-skin="xianyun"] .kami-md li {\n  margin: .25em 0;\n}\n',
};

// 需要补 ::marker 颜色的（其余五套已有：civdawn/empire/isekai/wod/xianyun）
const NEED_COLOR = ['crt80s', 'mileng', 'terminal', 'trpg'];

function block(id) {
  let s = '';
  s += '/* 列表符号：显式声明，不依赖环境继承（酒馆楼层的列表样式可能被整链重置成 none，\n';
  s += '   皮肤只给 ::marker 上色是不够的，符号必须自己声明、自己真的画出来）。\n';
  s += '   无序：一级 disc / 二级 circle / 三级起 square；有序：decimal → lower-alpha → lower-roman */\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ul { list-style-type: disc; }\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ul ul { list-style-type: circle; }\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ul ul ul { list-style-type: square; }\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ol { list-style-type: decimal; }\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ol ol { list-style-type: lower-alpha; }\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-md ol ol ol { list-style-type: lower-roman; }\n';
  if (NEED_COLOR.includes(id)) {
    s += 'html[data-kami-skin="' + id + '"] .kami-md li::marker { color: var(--kami-accent); }\n';
    s += 'html[data-kami-skin="' + id + '"] .kami-md li li::marker { color: var(--kami-fg-mute); }\n';
  }
  s += '\n';
  s += '/* 特效页说明（.kami-field 里的那枚 .kami-sub）：375px 窄屏必须能换行读全。\n';
  s += '   结构层的 .kami-sub 是 white-space:nowrap（标题栏计数确实要单行），\n';
  s += '   这里只对「字段标签里的说明」这一处放开，不碰标题栏 / 页脚的。 */\n';
  s += 'html[data-kami-skin="' + id + '"] .kami-root[data-kami-comp="panel"] .kami-field .kami-field-label .kami-sub {\n';
  s += '  white-space: normal;\n';
  s += '  overflow: visible;\n';
  s += '  text-overflow: clip;\n';
  s += '  min-width: 0;\n';
  s += '}\n';
  return s;
}

let report = [];
for (const id of IDS) {
  const p = 'src/skins/' + id + '/skin.css';
  let usedAnchor = false;
  let css = fs.readFileSync(p, 'utf8');
  if (css.includes('list-style-type: disc;')) { report.push(id + ': 已声明过，跳过'); continue; }
  const anchor = ANCHORS[id];
  const b = block(id);
  if (css.includes(anchor)) {
    css = css.replace(anchor, anchor + b);
    usedAnchor = true;
  } else {
    css = css.replace(/\r?\n*$/, '\n\n') + '\n' + b;
    report.push(id + ': 锚点未命中，已追加到文件尾');
    usedAnchor = false;
  }
  if (usedAnchor) report.push(id + ': 已插入到列表段后');
  fs.writeFileSync(p, css, 'utf8');
}
console.log(report.join('\n'));
