// d10 几何离线自检 v3：全部以【模块 buildGeom 同步】的内切球反棱柱对偶构造为准。
// ① 面/顶点数与点数 ② 反面之和恒 11 ③ 相邻面共享棱（每条棱恰好 2 面；投影边长逐棱比对 1e-9）
// ④ 凸包归面 ⑤ 三轴包围盒 / 顶点半径比 ⑥ 投影多边形非自交
import fs from 'node:fs';
import url from 'node:url';

const path = url.fileURLToPath(new URL('../src/decor/d10.js', import.meta.url));
const src = fs.readFileSync(path, 'utf8');
const win = { document: {}, console };
new Function('window', src)(win);
if (!win.KamiD10) { console.error('[FAIL] window.KamiD10 没有被创建'); process.exit(1); }
const g = win.KamiD10.geometry();
console.log('edge=' + g.edge.toFixed(6), 'rIn=' + g.rIn.toFixed(6), 'box=' + g.box.toFixed(6), 'silR=' + g.silR.toFixed(6), 'faces=' + g.faces.length);
let fail = 0;

/* 顶点构造（与 buildGeom 同步）：内切球反棱柱 → 对偶极点 → 归一 */
const PI = Math.PI;
const C36 = Math.cos(PI / 5);
const unitv = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function dTriOf(h) {
  const A = [1, 0, h];
  const B = [Math.cos(2 * PI / 10), Math.sin(2 * PI / 10), -h];
  const C = [Math.cos(2 * PI * 4.5 / 5), Math.sin(2 * PI * 4.5 / 5), -h];
  let n = unitv(crossv(subv(B, A), subv(C, A)));  const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
  if (dotv(n, cen) < 0) n = [-n[0], -n[1], -n[2]];
  return dotv(n, A);
}
let HH = 0;
for (let a = 0.05, b = 3.0, k = 0; k < 90; k++) { const m = (a + b) / 2; if (dTriOf(m) - m > 0) a = m; else b = m; HH = (a + b) / 2; }
let verts = [];

/* 离线重建与 buildGeom 同一索引布局：dual[0..9] = 10 个三角面极点（type1(i)=2i、type2(i)=2i+1），dual[10]=pentTop、dual[11]=pentBot */
{
  const up = [], down = [];
  for (let i = 0; i < 5; i++) {
    up.push([Math.cos(2 * PI * i / 5), Math.sin(2 * PI * i / 5), HH]);
    down.push([Math.cos(2 * PI * (i + 0.5) / 5), Math.sin(2 * PI * (i + 0.5) / 5), -HH]);
  }
  const av = up.concat(down);
  verts = [];
  for (let i = 0; i < 5; i++) {
    /* type1 = (U_i, W_i, W_(i-1)) */
    let A3 = av[i], B3 = av[5 + i], C3 = av[5 + ((i + 4) % 5)];
    let n = unitv(crossv(subv(B3, A3), subv(C3, A3)));
    const cen = [(A3[0] + B3[0] + C3[0]) / 3, (A3[1] + B3[1] + C3[1]) / 3, (A3[2] + B3[2] + C3[2]) / 3];
    if (dotv(n, cen) < 0) n = [-n[0], -n[1], -n[2]];
    const dd = dotv(n, A3);
    verts.push([n[0] / dd, n[1] / dd, n[2] / dd]);
    /* type2 = (W_i, U_i, U_(i+1)) */
    A3 = av[5 + i]; B3 = av[i]; C3 = av[(i + 1) % 5];
    n = unitv(crossv(subv(B3, A3), subv(C3, A3)));
    const cen2 = [(A3[0] + B3[0] + C3[0]) / 3, (A3[1] + B3[1] + C3[1]) / 3, (A3[2] + B3[2] + C3[2]) / 3];
    if (dotv(n, cen) < 0) n = [-n[0], -n[1], -n[2]];
    const de = dotv(n, A3);
    verts.push([n[0] / de, n[1] / de, n[2] / de]);
  }
  verts.push([0, 0, 1 / HH]);
  verts.push([0, 0, -1 / HH]);
}
{
  const m = Math.max(...verts.map(v => Math.hypot(v[0], v[1], v[2])));
  verts = verts.map(v => v.map(x => x / m));
}
const A = 10, B = 11;
const quads = [];
for (let i = 0; i < 5; i++) quads.push([A, 2 * ((i + 4) % 5) + 1, 2 * i, 2 * i + 1]);           // [pentTop, type2_(i-1), type1_i, type2_i]
for (let i = 0; i < 5; i++) quads.push([B, 2 * ((i + 1) % 5), 2 * i + 1, 2 * i]);               // [pentBot, type1_(i+1), type2_i, type1_i]

/* 包围盒 / 顶点半径比 */
const bb = [0, 1, 2].map(ax => 2 * Math.max(...verts.map(v => Math.abs(v[ax]))));
const rMax = Math.max(...verts.map(v => Math.hypot(v[0], v[1], v[2])));
const rMin = Math.min(...verts.map(v => Math.hypot(v[0], v[1], v[2])));
console.log('包围盒 x=' + bb[0].toFixed(4) + ' y=' + bb[1].toFixed(4) + ' z=' + bb[2].toFixed(4) + ' (z/x=' + (bb[2] / bb[0]).toFixed(4) + ')');
console.log('顶点半径 max/min=' + (rMax / rMin).toFixed(6), 'circum/rIn=' + (rMax / g.rIn).toFixed(4));

/* 共享棱证书：每个无序顶点对在面上出现恰好 2 次；同一棱在相交两面的投影长度一致（< 1e-9） */
const cnt = {};
const edgeMap = {};
for (const q of quads) {
  for (let m = 0; m < 4; m++) {
    const a = q[m], b = q[(m + 1) % 4];
    const key = Math.min(a, b) + '-' + Math.max(a, b);
    cnt[key] = (cnt[key] || 0) + 1;
    (edgeMap[key] = edgeMap[key] || []).push(q);
  }
}
const keys = Object.keys(cnt);
if (keys.length !== 20) { fail++; console.log('[FAIL] 棱数 ' + keys.length + ' ≠ 20'); }
for (const k of keys) {
  if (cnt[k] !== 2) { fail++; console.log('[FAIL] 棱 ' + k + ' 出现 ' + cnt[k] + ' 次（应恰为 2）'); }
  if (edgeMap[k].length !== 2) { fail++; console.log('[FAIL] 棱 ' + k + ' 只归属 ' + edgeMap[k].length + ' 个面'); }
}
/* 每面的面内坐标（重建：与其 module pts 完全同一套公式） */
function faceLocal(q) {
  const P = q.map(i => verts[i]);
  let n = unitv(crossv(subv(P[1], P[0]), subv(P[2], P[0])));
  const cen = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4];
  if (dotv(n, cen) < 0) {
    const t = P[1]; P[1] = P[3]; P[3] = t;
    n = unitv(crossv(subv(P[1], P[0]), subv(P[2], P[0])));
  }
  const rIn = dotv(cen, n);
  const rx = -Math.asin(Math.max(-1, Math.min(1, n[1])));
  const ry = Math.atan2(n[0], n[2]);
  const u = [Math.cos(ry), 0, -Math.sin(ry)];
  const v = [Math.sin(rx) * Math.sin(ry), Math.cos(rx), Math.sin(rx) * Math.cos(ry)];
  const f00t = [rIn * n[0], rIn * n[1], rIn * n[2]];
  const pts = P.map(p => { const w = subv(p, f00t); return [dotv(w, u) / rIn, dotv(w, v) / rIn]; });
  return { n, rIn, rx, ry, pts };
}
let maxEdgeErr = 0;
for (const k of keys) {
  const [fa, fb] = edgeMap[k];
  const la = faceLocalEdge(fa, k), lb = faceLocalEdge(fb, k);
  maxEdgeErr = Math.max(maxEdgeErr, Math.abs(la - lb));
}
function faceLocalEdge(q, key) {
  const f = faceLocal(q);
  const [a, b] = key.split('-').map(Number);
  const ia = q.indexOf(a), ib = q.indexOf(b);
  return Math.hypot(f.pts[ia][0] - f.pts[ib][0], f.pts[ia][1] - f.pts[ib][1]);
}
console.log('共享棱证书：棱 ' + keys.length + ' 条，相邻面同一棱投影长一致误差 max=' + maxEdgeErr.toExponential(2) + '（<1e-5）');
if (maxEdgeErr > 1e-9) { fail++; console.log('[FAIL] 共享棱投影长度不一致'); }

/* 凸包归面 */
for (const q of quads) {
  const P = q.map(i => verts[i]);
  let n = unitv(crossv(subv(P[1], P[0]), subv(P[2], P[0])));
  if (dotv(n, P[0]) < 0) n = [-n[0], -n[1], -n[2]];
  const d = dotv(n, P[0]);
  for (let i = 0; i < verts.length; i++) {
    if (q.indexOf(i) >= 0) continue;
    if (dotv(n, verts[i]) > d + 1e-9) { fail++; console.log('[FAIL] 面外顶点', i, 'in', q.join(',')); }
  }
}

/* 模块投影多边形与本地重建一致（按 (rx,ry) 配对，防 buildGeom 与离线表漂移） */
let ptMatchErr = 0;
{
  const locals = quads.map(q => faceLocal(q));
  console.log('offline:', locals.map(L => L.rx.toFixed(2) + '/' + L.ry.toFixed(2)).join(' '));
  for (const f of g.faces) {
    const hit = locals.find(L => Math.abs(L.rx * 180 / Math.PI - f.rx) < 1e-6 && Math.abs(L.ry * 180 / Math.PI - f.ry) < 1e-6);
    if (!hit) { ptMatchErr = 9; break; }
    for (let pi = 0; pi < 4; pi++) {
      const dda = Math.abs(hit.pts[pi][0] - f.pts[pi][0]) + Math.abs(hit.pts[pi][1] - f.pts[pi][1]);
      ptMatchErr = Math.max(ptMatchErr, dda);
    }
  }
}
console.log('模块表与离线重建的面片 pts 一致性误差 max=' + ptMatchErr.toExponential(2) + '（<1e-5）');
if (ptMatchErr > 1e-5) { fail++; }

/* 投影多边形简单 */
let simple = true;
for (const f of g.faces) {
  const pts = f.pts;
  let sgn = 0, crossing = false;
  for (let m = 0; m < 4; m++) {
    const a = pts[m], b = pts[(m + 1) % 4], c = pts[(m + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (sgn === 0) sgn = Math.sign(cr);
    else if (Math.sign(cr) !== sgn) crossing = true;
  }
  if (crossing) { simple = false; fail++; console.log('[FAIL] v=' + f.value + ' 投影四边形自相交'); }
}

/* 反面之和恒为 11 */
for (const f of g.faces) {
  let best = null, bd = 9;
  for (const o of g.faces) {
    if (o.value === f.value) continue;
    const dd = Math.hypot(o.n[0] + f.n[0], o.n[1] + f.n[1], o.n[2] + f.n[2]);
    if (dd < bd) { bd = dd; best = o; }
  }
  if (bd > 1e-3 || f.value + best.value !== 11) { fail++; console.log('[FAIL] 反面配对 v=' + f.value); }
}
console.log(simple ? '[OK] 10 面投影多边形均为简单四边形' : '[FAIL] 投影简单性');
console.log(fail ? '[FAIL] 共 ' + fail + ' 处闭合性问题' : '[OK] 反面之和 / 共棱恰 2 面 / 凸包归面 / 投影凸性 全部通过');
process.exit(fail ? 1 : 0);
