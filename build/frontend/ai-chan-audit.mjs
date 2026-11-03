// AI 娘素材验收：读原图的 alpha 通道、把图叠在纯黑 / 纯白底上拼成总览，供人眼查光晕、彩色描边、半透明雾气
//   node build/frontend/ai-chan-audit.mjs <输出目录> <原图…>        例：… .cache/ai-chan/audit .cache/ai-chan/raw/ai-gpt/face-*.png
// 输出：每张一行统计（透明 / 不透明 / 半透明占比、游离碎块数、外圈半透明彩色像素占比），以及 <输出目录>/black.png、white.png 两张总览。
// 「外圈彩色雾」= 主体轮廓外 40px 内、alpha 在 8～160 之间且饱和度高的像素，占人物面积的比例；超过 1.5% 一般就是光晕（第一批 Gemini Q 版是 9%）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) { console.error('用法：node build/frontend/ai-chan-audit.mjs <输出目录> <原图…>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body></body>');
const imgs = files.map((f) => ({ name: path.relative(process.cwd(), f), b64: fs.readFileSync(f).toString('base64') }));
const res = await page.evaluate(async (imgs) => {
  const load = async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); return i; };
  const stats = []; const loaded = [];
  for (const it of imgs) {
    const img = await load(it.b64); loaded.push(img);
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, W, H).data; const n = W * H;
    let zero = 0, solid = 0;
    const core = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const a = px[i * 4 + 3]; if (a === 0) { zero++; } if (a >= 250) { solid++; } if (a > 200) { core[i] = 1; } }
    /* 主体轮廓外 40px 的环：对 core 做 40 次 4 邻域膨胀 */
    let dil = core.slice();
    for (let k = 0; k < 40; k++) {
      const nx = dil.slice();
      for (let i = 0; i < n; i++) { if (dil[i]) { continue; } const xx = i % W; if ((xx > 0 && dil[i - 1]) || (xx < W - 1 && dil[i + 1]) || (i >= W && dil[i - W]) || (i < n - W && dil[i + W])) { nx[i] = 1; } }
      dil = nx;
    }
    let haze = 0, body = 0;
    for (let i = 0; i < n; i++) {
      if (core[i]) { body++; continue; }
      if (!dil[i]) { continue; }
      const a = px[i * 4 + 3]; if (a < 8 || a > 160) { continue; }
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 40 && (mx - mn) / mx > 0.35) { haze++; }
    }
    /* 游离碎块：alpha≥24 的连通块里，除最大块外小于最大块 3% 的个数 */
    const lab = new Int32Array(n); const sizes = [0]; const st = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (lab[s] || px[s * 4 + 3] < 24) { continue; }
      const id = sizes.length; let sp = 0, size = 0; st[sp++] = s; lab[s] = id;
      while (sp) { const p = st[--sp]; size++; const xx = p % W; for (const q of [xx > 0 ? p - 1 : -1, xx < W - 1 ? p + 1 : -1, p - W, p + W]) { if (q >= 0 && q < n && !lab[q] && px[q * 4 + 3] >= 24) { lab[q] = id; st[sp++] = q; } } }
      sizes.push(size);
    }
    const big = Math.max(0, ...sizes);
    stats.push({ name: it.name, W, H, zero: zero / n, solid: solid / n, partial: 1 - (zero + solid) / n, islands: sizes.filter((z, k) => k && z < big * 0.03).length, haze: body ? haze / body : 0 });
  }
  /* 总览：每格 256px，4 列，分别铺黑底和白底 */
  const cell = 256, cols = Math.min(4, loaded.length), rows = Math.ceil(loaded.length / cols);
  const sheets = {};
  for (const [nm, bg] of [['black', '#000'], ['white', '#fff']]) {
    const c = document.createElement('canvas'); c.width = cell * cols; c.height = (cell + 18) * rows;
    const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    loaded.forEach((img, i) => {
      const k = Math.min(cell / img.naturalWidth, cell / img.naturalHeight); const w = img.naturalWidth * k, h = img.naturalHeight * k;
      const ox = (i % cols) * cell + (cell - w) / 2, oy = Math.floor(i / cols) * (cell + 18) + (cell - h) / 2;
      x.drawImage(img, ox, oy, w, h);
      x.fillStyle = bg === '#000' ? '#aaa' : '#555'; x.font = '11px sans-serif'; x.fillText(imgs[i].name.split('/').slice(-2).join('/'), (i % cols) * cell + 4, Math.floor(i / cols) * (cell + 18) + cell + 13);
    });
    sheets[nm] = c.toDataURL('image/png');
  }
  return { stats, sheets };
}, imgs);
await browser.close();
for (const [nm, url] of Object.entries(res.sheets)) { fs.writeFileSync(path.join(out, nm + '.png'), Buffer.from(url.split(',')[1], 'base64')); }
const pct = (v) => (v * 100).toFixed(1) + '%';
for (const s of res.stats) {
  console.log(s.name.padEnd(40) + ' ' + s.W + '×' + s.H + '  透明 ' + pct(s.zero) + '  实心 ' + pct(s.solid) + '  半透明 ' + pct(s.partial) + '  碎块 ' + s.islands + '  外圈彩色雾 ' + pct(s.haze) + (s.haze > 0.015 ? '  ⚠ 可能有光晕' : ''));
}
console.log('总览：' + path.join(out, 'black.png') + '、' + path.join(out, 'white.png'));
