// d10 比例审计（旧 vs 新）：circum/intra 比 + 三轴包围盒 + 风筝边/共面校验
const PI = Math.PI;
const C36 = Math.cos(PI / 5);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = a => Math.sqrt(dot(a, a));
const unit = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* 旧构造（当前线上）：等腰正五边形反棱柱（h=1/√5, ρ=2/√5）的对偶，再缩放到外接半径=1 */
function oldVerts() {
  const H = 1 / Math.sqrt(5), RHO = 2 / Math.sqrt(5);
  const up = [], down = [];
  for (let i = 0; i < 5; i++) {
    up.push([RHO * Math.cos(2 * PI * i / 5), RHO * Math.sin(2 * PI * i / 5), H]);
    down.push([RHO * Math.cos(2 * PI * (i + 0.5) / 5), RHO * Math.sin(2 * PI * (i + 0.5) / 5), -H]);
  }
  const verts = up.concat(down);
  const tris = [];
  for (let i = 0; i < 5; i++) {
    tris.push([i, 5 + i, 5 + ((i + 4) % 5)]);
    tris.push([5 + i, i, (i + 1) % 5]);
  }
  const dual = [];
  for (const [ia, ib, ic] of tris) {
    const A = verts[ia], B = verts[ib], C = verts[ic];
    let n = unit(cross(sub(B, A), sub(C, A)));
    const c = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    if (dot(n, c) < 0) { n = [-n[0], -n[1], -n[2]]; }
    const d = dot(n, A);
    dual.push([n[0] / d, n[1] / d, n[2] / d]);
  }
  dual.push([0, 0, 1 / H]);
  dual.push([0, 0, -1 / H]);
  const maxR = Math.max(...dual.map(vlen));
  return dual.map(v => [v[0] / maxR, v[1] / maxR, v[2] / maxR]);
}

/* 新构造：apex z=±k·u（共面性定死 p/u=k）；取环半径 ρ=1、u=1/k，
   使 apex（=1）与环顶点半径（√(1+u²)=1.00556）几乎相等 → 近球形 */
const K = (1 + C36) / (1 - C36);
function newVerts() {
  const u = 1 / K;
  const verts = [[0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < 5; i++) {
    verts.push([Math.cos(2 * PI * i / 5), Math.sin(2 * PI * i / 5), u]);                    // 上环 U_i
    verts.push([Math.cos(2 * PI * (i + 0.5) / 5), Math.sin(2 * PI * (i + 0.5) / 5), -u]);   // 下环 W_i
  }
  const maxR = Math.max(...verts.map(vlen));
  return verts.map(v => v.map(x => x / maxR));
}

function report(name, verts) {
  const [x, y, z] = [0, 1, 2].map(ax => 2 * Math.max(...verts.map(v => Math.abs(v[ax]))));
  const rMax = Math.max(...verts.map(vlen));
  const rMin = Math.min(...verts.map(vlen));
  console.log('== ' + name + ' ==');
  console.log('包围盒 x=' + x.toFixed(4) + ' y=' + y.toFixed(4) + ' z=' + z.toFixed(4) + ' ｜ 拉长比 z/x=' + (z / x).toFixed(4));
  console.log('顶点半径 max=' + rMax.toFixed(4) + ' min=' + rMin.toFixed(4) + ' max/min=' + (rMax / rMin).toFixed(4));
  return verts;
}

/* 新构造面片：A=0 上尖顶、B=1 下尖顶、U_i=2+i（角 72i）、W_i=7+i（角 36+72i）
   顶面第 i 只风筝 = [A, U_i, W_i, U_(i+1)]（W_i 的 36+72i 恰在 U_i(72i) 与 U_(i+1)(72i+72) 之间）；
   底面第 j 只 = [B, W_j, U_(j+1), W_(j+1)]（U_(j+1) 的 72j+72 在 W_j(36+72j) 与 W_(j+1)(108+72j) 之间）。 */
function newFaces(verts) {
  const A = 0, B = 1, U = i => 2 + 2 * i, W = i => 3 + 2 * i;
  const quads = [];
  for (let i = 0; i < 5; i++) quads.push([A, U(i), W(i), U((i + 1) % 5)]);
  for (let j = 0; j < 5; j++) quads.push([B, W(j), U((j + 1) % 5), W((j + 1) % 5)]);
  const d = (a, b) => vlen(sub(verts[a], verts[b]));
  return quads.map(q => {
    const e = [];
    for (let m = 0; m < 4; m++) e.push(d(q[m], q[(m + 1) % 4]));
    const A3 = verts[q[0]], B3 = verts[q[1]], C3 = verts[q[2]];
    const n = cross(sub(B3, A3), sub(C3, A3));
    const planarErr = Math.abs(dot(n, sub(verts[q[3]], A3)));
    return { q, e: e.map(v => +v.toFixed(4)), kite: Math.abs(e[0] - e[3]) < 1e-9 && Math.abs(e[1] - e[2]) < 1e-9, planarErr: planarErr.toExponential(2) };
  });
}

const vo = report('旧构造（当前线上，反棱柱对偶）', oldVerts());
const vn = report('新构造（近球形）', newVerts());
const faces = newFaces(vn);
let allOk = true;
for (const f of faces) {
  if (!f.kite || +f.planarErr > 1e-9) allOk = false;
  console.log(' q=' + f.q.join(',') + ' edges=' + f.e.join(',') + ' kite=' + f.kite + ' planarErr=' + f.planarErr);
}
console.log(allOk ? '[OK] 10 面全部是共面风筝' : '[FAIL] 校验未过');

/* 面内切（rIn）与 circum 比：法线朝向取「面心同侧」，rIn = 面平面距 */
{
  let rInMin = 9;
  for (const f of faces) {
    const P = f.q.map(i => vn[i]);
    let n = unit(cross(sub(P[1], P[0]), sub(P[2], P[0])));
    const c = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4];
    if (dot(n, c) < 0) { n = [-n[0], -n[1], -n[2]]; }
    rInMin = Math.min(rInMin, dot(n, c));
  }
  console.log('rIn=' + rInMin.toFixed(4) + ' ｜ circum/rIn=' + (1 / rInMin).toFixed(4));
}
