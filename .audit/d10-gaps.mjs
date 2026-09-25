// d10 投影级闭合检查：完全按模块公式（rotateY(ry)rotateX(rx)translateZ(R) + 容器姿态）逐面投影，
// 验证「可见面投影面积和 = 投影凸包面积」（凸体正投影下两者必须相等，不等= 有缝/穿插）。
import fs from 'node:fs';
function run() {
  let src = fs.readFileSync('src/decor/d10.js', 'utf8');
  src = src.replace('table.sort(function (m1, m2) { return m1.value - m2.value; });',
    'table.sort(function (m1, m2) { return m1.value - m2.value; });\n    win.__d10log = table;');
  const winApi = { document: {}, console, __d10log: null };
  new Function('window', 'win', src)({ document: {}, console, __d10log: null }, winApi);
  const table = winApi.__d10log;
  if (!table || !table.length) { console.log('[FAIL] table 没抓到'); process.exit(1); }

  const D2R = 180 / Math.PI;
  const slot = 200;
  const rIn = table[0].rIn;
  function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
  function applyM(M, x, y, z) {
    return [M[0][0] * x + M[0][1] * y + M[0][2] * z, M[1][0] * x + M[1][1] * y + M[1][2] * z, M[2][0] * x + M[2][1] * y + M[2][2] * z];
  }

  // 拿 silR：模块 buildGeom 在记录里没给；用 verts（重建）
  const C36 = Math.cos(Math.PI / 5);
  const K = (1 + C36) / (1 - C36);
  const uu = 1 / K;
  let verts = [[0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < 5; i++) {
    verts.push([Math.cos(2 * Math.PI * i / 5), Math.sin(2 * Math.PI * i / 5), uu]);
    verts.push([Math.cos(2 * Math.PI * (i + 0.5) / 5), Math.sin(2 * Math.PI * (i + 0.5) / 5), -uu]);
  }
  { const m = Math.max(...verts.map(v => Math.hypot(v[0], v[1], v[2]))); verts = verts.map(v => v.map(x => x / m)); }
  const dist = v => Math.hypot(v[0], v[1], v[2]);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unitv = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
  const Wh = i => 3 + 2 * i, Ui = i => 2 + 2 * i;
  const quads = [];
  for (let i = 0; i < 5; i++) quads.push([0, Ui(i), Wh(i), Ui((i + 1) % 5)]);
  for (let j = 0; j < 5; j++) quads.push([1, Wh(j), Ui((j + 1) % 5), Wh((j + 1) % 5)]);
  const sil = (() => { let m = 0; for (const Pq of quads) { for (const qi of Pq) { m = Math.max(m, dist(verts[qi])); } } return m; })();
  const Rtrue = (slot * 0.98 / 2) * (rIn / sil);
  const lam = Rtrue / rIn;

  function faceM(f) { return mul(rotY(f.ry), rotX(f.rx)); }

  function projectPose(t0) {
    // 目标面 t0（value=t0+1）正对镜头：容器姿态与模块 aim() 一致
    const t = table[t0];
    const wx = -t.rx * 180 / Math.PI;
    const wy = -t.ry * 180 / Math.PI;
    const az = Math.ceil(720 / 360) * 360;
    const ax = wx + 360 * Math.ceil((720 - wx) / 360);
    const ay = wy + 360 * Math.ceil((720 - wy) / 360);
    const pose = mul(mul([[Math.cos(az * Math.PI / 180), -Math.sin(az * Math.PI / 180), 0], [Math.sin(az * Math.PI / 180), Math.cos(az * Math.PI / 180), 0], [0, 0, 1]], rotX(ax * Math.PI / 180)), rotY(ay * Math.PI / 180));
    const faces = [];
    for (const f of table) {
      const M = mul(pose, faceM(f));
      // 局 faç: pts = (px,py)·1? pts 已含 /rIn；绘制 px = pts·R -> 3D = M·(px,py,R)
      const w2 = f.pts.map(p => applyM(M, p[0] * Rtrue, p[1] * Rtrue, Rtrue));
      // 面法线（不位移）：M·(0,0,1)
      const nz = applyM(M, 0, 0, 1);
      faces.push({ value: f.value, poly: w2.map(p => [p[0], p[1]]), nWorld: nz });
    }
    return faces;
  }

  function polyArea(pol) {
    let a = 0;
    for (let i = 0; i < pol.length; i++) {
      const [x1, y1] = pol[i], [x2, y2] = pol[(i + 1) % pol.length];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }
  function hullArea(polys) {
    // 凸包（Andrew monotone chain 简化版：收集所有点后）
    const pts = [];
    for (const poly of polys) pts.push(...poly);
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (up.length >= 2 && cross2(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (lo.length >= 2 && cross2(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    lo.pop(); up.pop();
    const h = lo.concat(up);
    return polyArea(h);
  }

  const results = [];
  for (let t0 = 0; t0 < 10; t0++) {
    const faces = projectPose(t0);
    // 可见面：世界法线朝向镜头。CSS 相机朝 -z（看向 -z 方向），backface-visibility 在 n.z > 0 时被隐藏?：
    // 实测约定：可见的面 = (nWorld.z <= 0)（法线朝向观察者 = -z）
    const vis = faces.filter(f => f.nWorld[2] >= 0);
    const sVis = vis.reduce((s, f) => s + polyArea(f.poly.map(p => p)), 0);
    const sHull = hullArea(vis.map(f => f.poly));
    console.log('--pose', t0 + 1, 'sVis=' + sVis.toFixed(0), 'sHull=' + sHull.toFixed(0), 'visCount=' + vis.length, 'n01=' + faces.map(function (f) { return f.value + ':' + f.nWorld[2].toFixed(3); }).join(' '));
    results.push({ t0: t0 + 1, visible: vis.map(function (f) { return f.value; }), relErr: Math.abs(sVis - sHull) / sHull });
  }
  let bad = 0;
  for (const r of results) {
    const tag = r.relErr < 0.01 ? 'OK' : 'GAP';
    if (tag === 'GAP') bad++;
    console.log('pose价值=' + r.t0, '可见面(值)=' + r.visible.join(','), '可见面积和/凸包面积=' + r.relErr.toExponential(2) + '【' + tag + '】');
  }
  console.log(bad ? '[FAIL] 有 ' + bad + ' 个姿态的可见面拼不出完整轮廓（会有缝/穿插）' : '[OK] 所有姿态可见面无缝覆盖投影轮廓');
}
run();
