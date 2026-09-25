// 对照组（d20）：pose·n 与 投影闭合检查 —— 数据源改为 geometry()（已换算成度）
import fs from 'node:fs';
const src = fs.readFileSync('src/decor/d20.js', 'utf8');
const w = { document: {}, console };
new Function('window', src)(w);
const g = w.KamiD20.geometry();
if (g.faces.length !== 20) { console.error('[FAIL] d20 faces ' + g.faces.length); process.exit(1); }

const D2R = Math.PI / 180;
const slot = 200;
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
function app(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }
function polyArea(pol) { let a = 0; for (let i = 0; i < pol.length; i++) { const p = pol[i], q = pol[(i + 1) % pol.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
function hullArea(polys) {
  const pts = [];
  for (const poly of polys) pts.push(...poly);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const c2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const up = [], lo = [];
  for (const p of pts) { while (up.length >= 2 && c2(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (lo.length >= 2 && c2(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  up.pop(); lo.pop();
  return polyArea(lo.concat(up));
}

let bad = 0;
for (let t0 = 0; t0 < 20; t0++) {
  const t = g.faces[t0];
  const ax = -t.rx + 360 * Math.ceil((720 + t.rx) / 360);
  const ay = -t.ry + 360 * Math.ceil((720 + t.ry) / 360);
  const az = 720;
  const pose = mul(mul(rotZ(az * D2R), rotX(ax * D2R)), rotY(ay * D2R));
  const faces = g.faces.map(f => {
    const M = mul(pose, mul(rotY(f.ry * D2R), rotX(f.rx * D2R)));
    const len = slot * 0.49 / 0.982214;
    const pts = f.pts.map(p => app(M, p[0] * len, p[1] * len, len));
    return { v: f.value, poly: pts.map(p => [p[0], p[1]]), nW: app(M, [0, 0, 1]) };
  });
  const vis = faces.filter(f => f.nW[2] >= 0);
  const sVis = vis.reduce((s, f) => s + polyArea(f.poly), 0);
  const sHull = hullArea(vis.map(f => f.poly));
  const rel = Math.abs(sVis - sHull) / sHull;
  const tag = rel < 0.02 ? 'OK' : 'GAP';
  if (tag === 'GAP') bad++;
  console.log('aim=' + (t0 + 1), '可见 ' + vis.length + ' 面', 'relErr=' + rel.toExponential(2) + '【' + tag + '】' + (t0 === 0 ? '（' + vis.map(f => f.v).slice(0, 8).join(',') + '）' : ''));
}
console.log(bad ? '[FAIL] d20 参照有 ' + bad + ' 个姿态 GAP' : '[OK] d20 参照全 OK —— 检查器可信');
