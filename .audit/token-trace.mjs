/* 只读排查：把某个令牌在整份皮肤里的**全部声明点**按源码顺序列出来，
   并标出它的选择器作用域，用来判断「某个元素最终取到哪个值」。
   用法：node .audit/token-trace.mjs <令牌名> [皮肤文件]
   为什么要它：色块皮肤里 --kami-clay-* 有几处互相指涉（消息楼层回指炭黑族、亮色方案反向翻牌、
   令牌上提又在 <html> 上复制一份），光看某一处推不出元素实际取到什么值。 */
import fs from 'node:fs';

const token = process.argv[2] || '--kami-clay-ink';
const file = process.argv[3] || 'src/skins/grokbot/skin.css';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

let sel = [];
console.log('文件：' + file + '　令牌：' + token);
console.log('');
lines.forEach((line, i) => {
  const t = line.trim();
  if (/^[^:{}]*\{\s*$/.test(t) || /,(\s*)$/.test(t)) { sel.push(t.replace(/\s*\{$/, '')); return; }
  if (t === '}') { sel = []; return; }
  if (t.indexOf(token + ':') === 0) {
    const scope = sel.join(' ').trim();
    const kind = /\[data-kami-comp="panel"\]/.test(scope) ? '面板'
      : /:not\(\[data-kami-comp="panel"\]\)/.test(scope) ? '非面板（消息楼层）'
        : /^html\[data-kami-skin/.test(scope) && scope.indexOf('.kami-root') < 0 ? '上提到 <html>'
          : '基准（.kami-root）';
    console.log('行 ' + String(i + 1).padStart(5) + '　[' + kind + ']  ' + t);
    console.log('        作用域：' + scope.slice(0, 150));
  }
});
