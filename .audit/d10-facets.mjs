// 打印模块每个面（排序前后）的 rIn / maxPts / n —— 找 11% 尺寸差的来源
import fs from 'node:fs';
import url from 'node:url';
const path = url.fileURLToPath(new URL('../src/decor/d10.js', import.meta.url));
let src = fs.readFileSync(path, 'utf8');
const probe = `
    for (var qi = 0; qi < table.length; qi++) {
      var f = table[qi];
      var mx = 0;
      for (var qj = 0; qj < 4; qj++) { mx = Math.max(mx, Math.abs(f.pts[qj][0]), Math.abs(f.pts[qj][1])); }
      if (typeof window.__d10log !== 'undefined') { window.__d10log.push({ value: f.value, rIn: f.rIn, rx: f.rx, ry: f.ry, n: f.n, maxPts: mx, pts: f.pts }); }
    }
`;
src = src.replace('table.sort(function (m1, m2) { return m1.value - m2.value; });',
  probe + '\n    table.sort(function (m1, m2) { return m1.value - m2.value; });');
// 顺序上该行在 sort 之前，value 还没赋——直接整体再跑一次赋值后：把打印挪到 sort 之后
src = src.replace(probe + '\n    ', '\n');
src = src.replace('table.sort(function (m1, m2) { return m1.value - m2.value; });',
  'table.sort(function (m1, m2) { return m1.value - m2.value; });' + probe);
const win = { document: {}, console, __d10log: [] };
new Function('window', src)(win);
for (const f of win.__d10log) {
  console.log('v=' + f.value, 'rIn=' + f.rIn.toFixed(6), 'rx=' + (f.rx).toFixed(2), 'ry=' + (f.ry).toFixed(2),
    'n=[' + f.n.map(x => x.toFixed(3)).join(',') + ']', 'maxPts=' + f.maxPts.toFixed(4),
    'pts=' + JSON.stringify(f.pts.map(p => p.map(x => +x.toFixed(3)))));
}
