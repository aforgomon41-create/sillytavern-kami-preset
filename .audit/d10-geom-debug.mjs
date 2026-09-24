// d10 中间量调试（临时探针）
const PI = Math.PI;
const H = 1 / Math.sqrt(5), RHO = 2 / Math.sqrt(5);
const up = [], down = [];
for (let i = 0; i < 5; i++) {
  up.push([RHO * Math.cos(2 * PI * i / 5), RHO * Math.sin(2 * PI * i / 5), H]);
  down.push([RHO * Math.cos(2 * PI * (i + 0.5) / 5), RHO * Math.sin(2 * PI * (i + 0.5) / 5), -H]);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = a => Math.sqrt(dot(a, a));
const unit = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const verts = up.concat(down);
const tris = [];
for (let i = 0; i < 5; i++) {
  tris.push([i, 5 + i, 5 + ((i + 4) % 5)]);      // type1: (Tr_i, Bt_i, Bt_{i-1})
  tris.push([5 + i, i, (i + 1) % 5]);            // type2: (Bt_i, Tr_i, Tr_{i+1})
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
const pentTop = dual.length; dual.push([0, 0, 1 / H]);
const pentBot = dual.length; dual.push([0, 0, -1 / H]);
const maxR = Math.max(...dual.map(vlen));
for (let i = 0; i < dual.length; i++) { dual[i] = [dual[i][0] / maxR, dual[i][1] / maxR, dual[i][2] / maxR]; }
console.log('apo norm', vlen(dual[pentTop]).toFixed(6), vlen(dual[pentBot]).toFixed(6));
console.log('tri pole norms', dual.slice(0, 10).map(v => vlen(v).toFixed(4)).join(','));
const d = (a, b) => vlen(sub(dual[a], dual[b]));

// 上尖顶 kite: [pent, tri2_(i-1), tri1_i, tri2_i]
for (let i = 0; i < 3; i++) {
  const q = [pentTop, 2 * ((i + 4) % 5) + 1, 2 * i, 2 * i + 1];
  const e = [];
  for (let m = 0; m < 4; m++) e.push(d(q[m], q[(m + 1) % 4]).toFixed(4));
  console.log('top i=' + i, 'edges', e.join(','), ' cycle verts', q.join(','));
}
// 底尖顶 kite candidate: [pentBot, tri1_(i+1), tri2_i, tri1_i]
for (let i = 0; i < 3; i++) {
  const q = [pentBot, 2 * ((i + 1) % 5), 2 * i + 1, 2 * i];
  const e = [];
  for (let m = 0; m < 4; m++) e.push(d(q[m], q[(m + 1) % 4]).toFixed(4));
  console.log('bot i=' + i, 'edges', e.join(','));
}
// 检查镜像对称距离：|pentTop-tri2_j| 是否全等、|tri2_j-tri1_j| vs |tri2_i-tri1_i|
console.log('|pent-tri2_j|:', [0, 1, 2, 3, 4].map(j => d(pentTop, 2 * j + 1).toFixed(6)).join(','));
console.log('|tri2_i-tri1_i|:', [0, 1, 2].map(j => (d(2 * j + 1, 2 * j)).toFixed(6)).join(','));
console.log('|tri2_(i-1)-tri1_i|:', [0, 1, 2].map(i => (d(2 * ((i + 4) % 5) + 1, 2 * i)).toFixed(6)).join(','));
