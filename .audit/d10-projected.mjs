// 把 pose（目标面正对）下 10 个面片的屏幕投影画成 SVG，用眼睛+数值同时验证：谁在哪、谁越界、Convex包多大
import fs from 'node:fs';

function run() {
  let src = fs.readFileSync('src/decor/d10.js', 'utf8');
  src = src.replace('table.sort(function (m1, m2) { return m1.value - m2.value; });',
    'table.sort(function (m1, m2) { return m1.value - m2.value; });\n    win.__d10log = table;');
  const winApi = { document: {}, console, __d10log: null };
  new Function('window', 'win', src)({ document: {}, console, __d10log: null }, winApi);
  const table = winApi.__d10log;
  const D2R = 180 / Math.PI;
  const slot = 240;
  const rIn = table[0].rIn;

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

  function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
  function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
  function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }
  function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
  function applyM(M, x, y, z) { return [M[0][0] * x + M[0][1] * y + M[0][2] * z, M[1][0] * x + M[1][1] * y + M[1][2] * z, M[2][0] * x + M[2][1] * y + M[2][2] * z]; }

  const out = [];
  for (let t0 = 0; t0 < 10; t0++) {
    const t = table[t0];
    const wx = -t.rx * 180 / Math.PI, wy = -t.ry * 180 / Math.PI;
    const az = 720;
    const ax = wx + 360 * Math.ceil((720 - wx) / 360);
    const ay = wy + 360 * Math.ceil((720 - wy) / 360);
    const pose = mul(mul(rotZ(az * Math.PI / 180), rotX(ax * Math.PI / 180)), rotY(ay * Math.PI / 180));
    const R = (slot * 0.98 / 2) * (rIn / 0.987522);   // silR（模块实测 0.9875）
    const parts = [];
    for (let fi = 0; fi < 10; fi++) {
      const f = table[fi];
      const M = mul(pose, mul(rotY(f.ry), rotX(f.rx)));
      const poly = f.pts.map(p => applyM(M, p[0] * R, p[1] * R, R).slice(0, 2));
      const nW = applyM(M, 0, 0, 1);
      parts.push({ v: f.value, poly, nz: nW[2] });
    }
    // 输出 SVG：可见面画实心，不可见面画红描边（帮看划线/漏面）
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="-240 -200 480 360" style="display:block;background:#15111d">';
    for (const p of parts) {
      const path = p.poly.map(pt => pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join(' ');
      const vis = p.nz >= 0;
      svg += '<polygon points="' + path + '" fill="' + (vis ? '#8d80c8' : 'none') + '" stroke="' + (vis ? '#b9aee8' : '#c33') + '" stroke-width="1.5" opacity="' + (vis ? 0.95 : 0.8) + '"/>';
      const cx = p.poly.reduce((s, q) => s + q[0], 0) / 4, cy = p.poly.reduce((s, q) => s + q[1], 0) / 4;
      svg += '<text x="' + cx.toFixed(0) + '" y="' + cy.toFixed(0) + '" fill="#fff" font-size="13" text-anchor="middle" opacity="' + (vis ? 1 : 0.5) + '">' + p.v + '</text>';
    }
    svg += '<text x="-232" y="-190" fill="#ddd" font-size="13">pose=面' + (t0 + 1) + '</text></svg>';
    out.push(svg);
  }
  fs.writeFileSync('.audit/d10-projected.svg-parts', out.join('\n\n'), 'utf8');
  // 拼 HTML 一页
  const page = ['<!DOCTYPE html><meta charset="utf-8"><style>body{margin:0;background:#141019;font:12px monospace;color:#ddd;padding:8px}div{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0}figcaption{margin:2px 0}</figure>'].length;
  const html = '<!DOCTYPE html><meta charset="utf-8"><style>body{margin:0;background:#141019;color:#ddd;font:13px monospace;padding:10px}.row{display:flex;flex-wrap:wrap;gap:12px}</style><div class="row">' + out.map((s, i) => '<div class="cell"><div>aim=面' + (i + 1) + '</div>' + s + '</div>').join('') + '</div>';
  fs.writeFileSync('.audit/d10-projected.html', html, 'utf8');
  console.log('written .audit/d10-projected.html (SVG 投影图)');
}
run();
