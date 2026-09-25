// 打印每面 rIn / maxAbs / pts，检查 λ = R/rIn 是否逐面一致（越一致越闭合）
import fs from 'node:fs';
import url from 'node:url';
const path = url.fileURLToPath(new URL('../src/decor/d10.js', import.meta.url));
const src = fs.readFileSync(path, 'utf8');
const win = { document: {}, console };
new Function('window', src)(win);
const g = win.KamiD10.geometry();
console.log('silR=' + g.silR.toFixed(4), 'rIn(first)=' + g.rIn.toFixed(4), 'box=' + g.box.toFixed(4));
const R = (100 * 0.98 / 2) / g.silR;   // 假想槽 100px
const lambda = R / g.rIn;
let bad = 0;
for (const f of g.faces) {
  const extents = Math.max(...f.pts.map(p => Math.hypot(f.pts[0][0] * 0 + p[0], p[1])));
  void extents;
  const mx = Math.max(...f.pts.map(p => Math.abs(p[0])), ...f.pts.map(p => Math.abs(p[1])));
  console.log('v=' + f.value, 'rx=' + f.rx.toFixed(2), 'ry=' + f.ry.toFixed(2), 'maxPts=' + mx.toFixed(4), 'drawnHalf=' + (mx * R).toFixed(1) + 'px', 'planeAt=' + R.toFixed(1) + 'px');
  // 该多边形是否自相交：按相邻点叉积同号判凸
  const pts = f.pts;
  let sgn = 0, crossing = false;
  for (let m = 0; m < 4; m++) {
    const a = ptsA(f.pts, m), b = ptsA(f.pts, (m + 1) % 4), c = ptsA(f.pts, (m + 2) % 4);
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (sgn === 0) sgn = Math.sign(cr);
    else if (Math.sign(cr) !== sgn) crossing = true;
  }
  if (crossing) { bad++; console.log('  !! 投影多边形自相交'); }
}
console.log(bad ? '[FAIL] 有自相交面片' : '[OK] 投影四边形均为简单四边形');
function ptsA(pts, i) { return [pts[i][0], pts[i][1]]; }
