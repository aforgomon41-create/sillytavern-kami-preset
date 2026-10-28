#!/usr/bin/env node
/**
 * 生成「碎光」皮肤的宣纸纹理：96×96 灰度 + 透明 PNG，稀疏的淡色纤维点，平铺后看不出接缝。
 * 用法：node build/frontend/make-paper-texture.mjs <输出路径>（固定随机种子，结果可复现）
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
const out = process.argv[2];
const W = 96, H = 96;
let seed = 20261027;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const raw = Buffer.alloc((W * 2 + 1) * H);
const alpha = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) { alpha[i] = rnd() < 0.5 ? rnd() * 10 : 0; }            /* 底噪 */
for (let f = 0; f < 70; f++) {                                                            /* 纤维：短斜线，环绕边界保证平铺无缝 */
  let x = rnd() * W, y = rnd() * H; const a = rnd() * Math.PI, len = 4 + rnd() * 10, k = 10 + rnd() * 16;
  for (let t = 0; t < len; t++) { const ix = ((Math.round(x) % W) + W) % W, iy = ((Math.round(y) % H) + H) % H; alpha[iy * W + ix] = Math.max(alpha[iy * W + ix], k); x += Math.cos(a); y += Math.sin(a); }
}
for (let y = 0; y < H; y++) {
  raw[y * (W * 2 + 1)] = 0;
  for (let x = 0; x < W; x++) { const o = y * (W * 2 + 1) + 1 + x * 2; raw[o] = 90; raw[o + 1] = Math.min(255, Math.round(alpha[y * W + x])); }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) { c = crcTable[(c ^ b) & 255] ^ (c >>> 8); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log('纹理 → ' + out + '（' + png.length + ' 字节）');
