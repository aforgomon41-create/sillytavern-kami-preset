// 对齐诊断：模块面 vs 离线重建（同一索引布局）逐姿态 diff
import fs from 'node:fs';
import url from 'node:url';

const modPath = url.fileURLToPath(new URL('../src/decor/d10.js', import.meta.url));
let src = fs.readFileSync(modPath, 'utf8');
src = src.replace('table.sort(function (m1, m2) { return m1.value - m2.value; });',
  'table.sort(function (m1, m2) { return m1.value - m2.value; });\n    win.__d10log = table;');
const winApi = { document: {}, console, __d10log: null };
new Function('window', 'win', src)({ document: {}, console, __d10log: null }, winApi);
const modF = winApi.__d10log;

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
  let n = unitv(crossv(subv(B, A), subv(C, A)));
  const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
  if (dotv(n, cen) < 0) n = [-n[0], -n[1], -n[2]];
  return dotv(n, A);
}
let HH = 0;
for (let a = 0.05, b = 3.0, k = 0; k < 90; k++) { const m = (a + b) / 2; if (dTriOf(m) - m > 0) a = m; else b = m; HH = (a + b) / 2; }

/* 反棱柱 → dual，与 buildGeom 完全同构 */
const up = [], down = [];
for (let i = 0; i < 5; i++) {
  up.push([Math.cos(2 * PI * i / 5), Math.sin(2 * PI * i / 5), HH]);
  down.push([Math.cos(2 * PI * (i + 0.5) / 5), Math.sin(2 * PI * (i + 0.5) / 5), -HH]);
}
const av = up.concat(down);
const dual = [];
for (let i = 0; i < 5; i++) {
  let t = [av[i], av[5 + i], av[5 + ((i + 4) % 5)]];
  dual.push(pole(t));
  t = [av[5 + i], av[i], av[(i + 1) % 5]];
  dual.push(pole(t));
  function pole([A3, B3, C3]) {
    let n = unitv(crossv(subv(B3, A3), subv(C3, A3)));
    const cen = [(A3[0] + B3[0] + C3[0]) / 3, (A3[1] + B3[1] + C3[1]) / 3, (A3[2] + B3[2] + C3[2]) / 3];
    if (dotv(n, cen) < 0) n = [-n[0], -n[1], -n[2]];
    const dd = dotv(n, A3);
    return [n[0] / dd, n[1] / dd, n[2] / dd];
  }
}
dual.push([0, 0, 1 / HH]);
dual.push([0, 0, -1 / HH]);
let verts = dual;
{ const m = Math.max(...verts.map(v => Math.hypot(v[0], v[1], v[2]))); verts = verts.map(v => v.map(x => x / m)); }

const quads = [];
for (let i = 0; i < 5; i++) quads.push([10, 2 * ((i + 4) % 5) + 1, 2 * i, 2 * i + 1]);
for (let i = 0; i < 5; i++) quads.push([11, 2 * ((i + 1) % 5), 2 * i + 1, 2 * i]);

function faceCalc(q) {
  const P = q.map(i => verts[i]);
  let n = unitv(crossv(subv(P[1], P[0]), subv(P[2], P[0])));
  const cen = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4];
  if (dotv(n, cen) < 0) { const t = P[1]; P[1] = P[3]; P[3] = t; n = unitv(crossv(subv(P[1], P[0]), subv(P[2], P[0]))); }
  const rIn = dotv(cen, n);
  const rx = -Math.asin(Math.max(-1, Math.min(1, n[1])));
  const ry = Math.atan2(n[0], n[2]);
  const u = [Math.cos(ry), 0, -Math.sin(ry)];
  const v = [Math.sin(rx) * Math.sin(ry), Math.cos(rx), Math.sin(rx) * Math.cos(ry)];
  const pts = P.map(p => { const w = subv(p, cen); return [dotv(w, u) / rIn, dotv(w, v) / rIn]; });
  return { rIn, rx, ry, pts };
}

const locals = quads.map(q => faceCalc(q));
console.log('离线重建（与模块同构）:');
for (const L of locals) console.log(' rx=' + L.rx.toFixed(2), 'ry=' + L.ry.toFixed(2), 'rIn=' + L.rIn.toFixed(4), 'maxPts=' + (Math.max(...L.pts.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1]))))).toFixed(4));
console.log('---- 模块:');
for (const f of modF) console.log(' v=' + f.value, 'rx=' + f.rx.toFixed(2), 'ry=' + f.ry.toFixed(2), 'n=[' + f.n.map(x => x.toFixed(3)).join(',') + ']');
