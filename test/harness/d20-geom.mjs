#!/usr/bin/env node
/**
 * d20 几何离线校验：node test/harness/d20-geom.mjs
 * ------------------------------------------------------------
 * 直接加载 src/decor/d20.js（它就是被内联进皮肤管理的那份源），给它一个假的 window，
 * 然后对 Kam iD20.geometry() 吐出来的单位几何表做独立复算：
 *   · 面数 = 20、点数 1..20 各一次、反面之和恒为 21
 *   · 每个面的 rotateY(ry) rotateX(rx) 是否真的把 +Z 转到该面法线
 *   · 容器写 rotateZ(0) rotateX(-rx) rotateY(-ry) 时，该面法线是否正好指向镜头（+Z）
 *   · 面片三角形的面内重心是否落在方框中心（数字才会落在三角形正中）
 * 不依赖浏览器，也不依赖任何第三方库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src', 'decor', 'd20.js'), 'utf8');

const win = { document: {} };
new Function('window', SRC)(win);
const API = win.KamiD20;
if (!API || typeof API.geometry !== 'function') { console.log('FAIL  模块没有暴露 geometry()'); process.exit(1); }
const G = API.geometry();

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) { bad++; } };

ok(G.faces.length === 20, '面数 = 20（实测 ' + G.faces.length + '）');
const vals = G.faces.map(f => f.value).sort((a, b) => a - b).join(',');
ok(vals === Array.from({ length: 20 }, (_, i) => i + 1).join(','), '点数 1..20 各一次');
ok(Math.abs(G.edge - 2 / Math.sqrt((1 + Math.sqrt(5)) / 2 + 2)) < 1e-6, '棱长 = 2/sqrt(phi+2)（' + G.edge.toFixed(6) + '）');
ok(Math.abs(G.silR - 0.982247) < 1e-5, '正面朝镜头轮廓半径 silR = 0.9822（' + G.silR.toFixed(6) + '）');
ok(Math.abs(G.box - 2 * G.maxAbs) < 1e-9 && G.box > 0, '面片方框边长 = 2 x maxAbs（' + G.box.toFixed(6) + '）');

const D = Math.PI / 180;
const mul = (M, v) => [0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mm = (A, B) => A.map(r => [0, 1, 2].map(j => A[r[0] === r ? 0 : 0] === undefined ? 0 : 0));
function matmul(A, B) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j];
  return C;
}

let worstN = 0, worstFront = 0, worstCentroid = 0, worstPts = 0;
for (const f of G.faces) {
  const M = matmul(rotY(f.ry * D), rotX(f.rx * D));
  const z = mul(M, [0, 0, 1]);
  worstN = Math.max(worstN, Math.hypot(z[0] - f.n[0], z[1] - f.n[1], z[2] - f.n[2]));
  const M2 = matmul(rotX(-f.rx * D), rotY(-f.ry * D));
  const n2 = mul(M2, f.n);
  worstFront = Math.max(worstFront, Math.abs(n2[0]), Math.abs(n2[1]), Math.abs(1 - n2[2]));
  const s = f.pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  worstCentroid = Math.max(worstCentroid, Math.hypot(s[0], s[1]));
  for (const p of f.pts) { worstPts = Math.max(worstPts, Math.abs(p[0]), Math.abs(p[1])); }
}
ok(worstN < 1e-6, 'rotateY(ry) rotateX(rx) 把 +Z 映射到面法线（最大误差 ' + worstN.toExponential(1) + '）');
ok(worstFront < 1e-6, '容器 rotateX(-rx) rotateY(-ry) 让该面法线正对镜头（最大误差 ' + worstFront.toExponential(1) + '）');
ok(worstCentroid < 1e-5, '三角形面内重心 = 方框中心（最大偏移 ' + worstCentroid.toExponential(1) + '）');
ok(Math.abs(worstPts - G.maxAbs) < 1e-5, '三个顶点都落在方框内（极值 ' + worstPts.toFixed(6) + '，maxAbs ' + G.maxAbs.toFixed(6) + '）');

const pairs = [];
const used = new Set();
for (let i = 0; i < 20; i++) {
  if (used.has(i)) continue;
  for (let j = i + 1; j < 20; j++) {
    if (used.has(j)) continue;
    const a = G.faces[i].n, b = G.faces[j].n;
    if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < -0.9999) { pairs.push([i, j]); used.add(i); used.add(j); break; }
  }
}
ok(pairs.length === 10 && used.size === 20, '20 个面配成 10 组反面（' + pairs.length + ' 组）');
ok(pairs.every(([i, j]) => G.faces[i].value + G.faces[j].value === 21), '反面点数之和恒为 21');

console.log(bad ? ('\n' + bad + ' 项未通过') : '\nd20 几何全部通过');
process.exit(bad ? 1 : 0);
