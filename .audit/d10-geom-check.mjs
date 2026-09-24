// d10 几何离线自检（临时探针，放 .audit 下）
import fs from 'node:fs';
import url from 'node:url';

const path = url.fileURLToPath(new URL('../src/decor/d10.js', import.meta.url));
const src = fs.readFileSync(path, 'utf8');
const script = new Function('window', src);
const win = { document: {}, console };
script(win);
if (!win.KamiD10) { console.error('[FAIL] window.KamiD10 没有被创建'); process.exit(1); }
const g = win.KamiD10.geometry();
console.log('edge', g.edge.toFixed(6), 'rIn', g.rIn.toFixed(6), 'box', g.box.toFixed(6), 'silR', g.silR.toFixed(6));
console.log('faces', g.faces.length);
// 反面之和恒为 11（真实 d10 排法）
const by = new Map(g.faces.map(f => [f.value, f]));
let ok = true;
for (const f of g.faces) {
  const opp = f.n.map(v => -v);
  let best = null, bd = 9;
  for (const o of g.faces) {
    if (o.value === f.value) continue;
    const dd = Math.hypot(o.n[0] + f.n[0], o.n[1] + f.n[1], o.n[2] + f.n[2]);
    if (dd < bd) { bd = dd; best = o; }
  }
  const s = f.value + best.value;
  if (bd > 1e-3 || s !== 11) { ok = false; console.log('BAD pair', f.value, best.value, bd.toExponential(2), 'sum', s); }
}
console.log(ok ? '[OK] 每面与其法线反向的那一面之和均为 11；法线朝向互反' : '[FAIL] 反面配对不成立');
// 风筝臂长：同一面内四点两两距离，应呈 (长,短)×2 的风筝（外接半径=1 时先反投影：pts 已除以 rIn）
for (const value of [1, 5, 10]) {
  const f = by.get(value);
  let mn = 9, mx = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const dd = Math.hypot(f.pts[i][0] - f.pts[j][0], f.pts[i][1] - f.pts[j][1]);
      mn = 0; // noop
      mx = Math.max(mx, dd); mn = Math.min(mn, dd);
      void dd;
    }
  }
  console.log('value', value, 'rx', f.rx.toFixed(2), 'ry', f.ry.toFixed(2), 'pts', JSON.stringify(f.pts));
}
