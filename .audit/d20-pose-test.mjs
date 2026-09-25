// pose·n 单独测试：pose = rotX(-rx)·rotY(-ry)（度）作用于面法线 n 后应为 +z
import fs from 'node:fs';
const src = fs.readFileSync('src/decor/d20.js', 'utf8');
const w = { document: {}, console };
new Function('window', src)(w);
const g = w.KamiD20.geometry();
const f1 = g.faces[0];
const D2R = Math.PI / 180;
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; }
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; }
function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i][j] += A[i][k] * B[k][j]; return C; }
function app(M, v) { return [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]]; }
const n1 = f1.n;
const pose = mul(rotX(-f1.rx * D2R), rotY(-f1.ry * D2R));
const n1post = app(pose, n1);
console.log('face1: rx.deg=' + f1.rx.toFixed(3) + ' ry=' + f1.ry.toFixed(3));
console.log('pose·n1 =', n1post.map(x => x.toFixed(4)).join(','), '(应 ≈ 0,0,1)');
const f20 = g.faces[19];
const n2post = app(pose, f20.n);
console.log('pose·n20 =', n2post.map(x => x.toFixed(4)).join(','), '(应 ≈ 0,0,-1)');
