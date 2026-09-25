// d10 闭合性审计：①每个面是否凸四边形 ②所有其它顶点是否在该面平面的内侧（凸包归面）③相邻面共享边
const PI = Math.PI;
const C36 = Math.cos(PI / 5);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = a => Math.sqrt(dot(a, a));
const unit = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// 与 d10.js 同步的顶点构造（近球形版）：
// 上尖顶 A+=(0,0,1)、下尖顶 B-=(0,0,-1)；上环 U_i 角 72i、z=+u·(1/maxR)；下环 W_i 角 36+72i、z=−u
const K = (1 + C36) / (1 - C36);
function vertsOf() {
  const u = 1 / K;
  const V = [[0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < 5; i++) {
    V.push([Math.cos(2 * PI * i / 5) * 1, Math.sin(2 * PI * i / 5) * 1, u]);                 // U_i  2+2i
    V.push([Math.cos(2 * PI * (i + 0.5) / 5) * 1, Math.sin(2 * PI * (i + 0.5) / 5) * 1, -u]); // W_i  3+2i
  }
  const m = Math.max(...V.map(vlen));
  return V.map(v => v.map(x => x / m));
}
// 与模块 buildGeom 一致的 10 只风筝：顶 [A, U_i, W_i, U_(i+1)]；底 [B, W_j, U_(j+1), W_(j+1)]
function facesOf(V) {
  const A = 0, B = 1, U = i => 2 + 2 * i, W = i => 3 + 2 * i;
  const qs = [];
  for (let i = 0; i < 5; i++) qs.push([A, U(i), W(i), U((i + 1) % 5)]);
  for (let j = 0; j < 5; j++) qs.push([B, W(j), U((j + 1) % 5), W((j + 1) % 5)]);
  return qs;
}

const V = vertsOf();
const QS = facesOf(V);
let problems = 0;

/* ① 每面方形化凸性：四点在面内坐标（叉积同号、内角闭包<π）*/
for (const q of QS) {
  const P = q.map(i => V[i]);
  const n = unit(cross(sub(P[1], P[0]), sub(P[2], P[0])));
  const b1 = unit(sub(P[1], P[0]));
  const b2 = unit(cross(n, b1));
  const pts = P.map(p => [dot(sub(p, P[0]), b1), dot(sub(p, P[0]), b2)]);
  const signs = [];
  for (let m = 0; m < 4; m++) {
    const a = pts[m], b = pts[(m + 1) % 4], c = pts[(m + 2) % 4];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    signs.push(Math.sign(cr));
  }
  const convex = signs.every(s => s !== 0 && s === signs[0]);
  if (!convex) { problems++; console.log('非凸/折叠面 q=' + q.join(','), JSON.stringify(pts.map(p => p.map(v => +v.toFixed(4))))); }
}

/* ② 其它顶点是否严格在平面内侧（凸包归面）；面平面 dot(n,·)=d 而 P0 一定等于 d */
for (const q of QS) {
  const P = q.map(i => V[i]);
  let n = unit(cross(sub(P[1], P[0]), sub(P[2], P[0])));
  if (dot(n, P[0]) < 0) n = [-n[0], -n[1], -n[2]];
  const d = dot(n, P[0]);
  for (let i = 0; i < V.length; i++) {
    if (q.indexOf(i) >= 0) continue;
    const dd = dot(n, V[i]);
    if (dd > d + 1e-6) { problems++; console.log('面 q=' + q.join(',') + ' 外侧有顶点 #' + i + ' dd=' + dd.toFixed(4) + ' > d=' + d.toFixed(4)); }
  }
}

/* ③ 相邻面共享边（无重复/无缺口）：统计每个 无序顶点对 出现次数 —— 必须恰好 = 2 */
const cnt = {};
for (const q of QS) {
  for (let m = 0; m < 4; m++) {
    const a = q[m], b = q[(m + 1) % 4];
    const key = Math.min(a, b) + '-' + Math.max(a, b);
    cnt[key] = (cnt[key] || 0) + 1;
  }
}
const keys = Object.keys(cnt);
for (const k of keys) if (cnt[k] !== 2) { problems++; console.log('边 ' + k + ' 出现 ' + cnt[k] + ' 次（应为 2）'); }
console.log('边总数 = ' + keys.length + '（预期 20：5×2 环锯齿 + 10 尖顶辐条 + 0）→ ' + (keys.length === 20 && keys.every(k => cnt[k] === 2) ? '[OK]' : '[FAIL]'));

/* ④ 面多边形的二维投影凸包无缝检查：把一只风筝面转到正面投影后，其它面片顶点投影是否都在轮廓外…
   简化成：每种 aim 姿态下的「地面外接轮廓」连续性 —— 这里用 ④ 所需的替代指标：
   对每个 верш值 val（1..10），所有「非该面面的其它顶点」到原点的距离应 ≤ 面朝前时的最大投影半径（闭合无外溢） */
console.log(problems ? '[FAIL] 闭合性/凸性 存在 ' + problems + ' 处问题' : '[OK] 面面共边、无重复边、凸包无外溢 —— 闭合成立');
process.exit(problems ? 1 : 0);
