// AI 娘系列：Codex 交回的原图 → 皮肤素材
//   node build/frontend/ai-chan-assets.mjs [--only=ai-deepseek,ai-claude]
// 输入：.cache/ai-chan/raw/<id>/<名>.png（见 design/ai-chan/生图提示词.md）
// 输出：src/skins-next/<id>/assets/<名>.webp（包内轻量版）与 <名>.hd.webp（高清版，走外链，不打进预设）
// 处理：透明图去掉 alpha < 24 的残留与游离碎点（只留与主体连通的部分）→ 等比缩放 → WebP，按体积上限逐步降质量。
// 编码用 Chromium 的 canvas（本机没有 sharp / cwebp），只依赖测试已在用的 playwright。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const RAW = path.join(ROOT, '.cache/ai-chan/raw');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

/* 每种素材：fit 是缩放后长边（或指定边）的像素，kb 是体积上限；hd 为 null 表示只出一份 */
const SPECS = {
  portrait: { alpha: true, lite: { h: 400, kb: 44 }, hd: { h: 1200, kb: 220 } },
  chibi: { alpha: true, lite: { h: 220, kb: 16 }, hd: { h: 512, kb: 70 } },
  scene: { alpha: false, lite: { w: 560, kb: 24 }, hd: { w: 1536, kb: 200 } },
  'face-think': { alpha: true, lite: { h: 128, kb: 9 }, hd: null },
  'face-done': { alpha: true, lite: { h: 128, kb: 9 }, hd: null },
  'face-search': { alpha: true, lite: { h: 128, kb: 9 }, hd: null },
  'face-oops': { alpha: true, lite: { h: 128, kb: 9 }, hd: null },
  'item-1': { alpha: true, lite: { h: 96, kb: 6 }, hd: null },
  'item-2': { alpha: true, lite: { h: 96, kb: 6 }, hd: null }
};

const ids = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((d) => d.startsWith('ai-') && (!ONLY.length || ONLY.includes(d))) : [];
if (!ids.length) { console.log('[AI 娘素材] .cache/ai-chan/raw/ 里没有可处理的角色'); process.exit(0); }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas></canvas>');
let made = 0;
const report = [];
for (const id of ids) {
  const outDir = path.join(ROOT, 'src/skins-next', id, 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, spec] of Object.entries(SPECS)) {
    const src = path.join(RAW, id, name + '.png');
    if (!fs.existsSync(src)) { continue; }
    const b64 = fs.readFileSync(src).toString('base64');
    const outs = [['', spec.lite], ...(spec.hd ? [['.hd', spec.hd]] : [])];
    for (const [suffix, t] of outs) {
      const res = await page.evaluate(async ({ b64, alpha, t }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const W = img.naturalWidth, H = img.naturalHeight;
        const c0 = document.createElement('canvas'); c0.width = W; c0.height = H;
        const x0 = c0.getContext('2d', { willReadFrequently: true });
        x0.drawImage(img, 0, 0);
        let islands = 0;
        if (alpha) {
          /* 去残留与游离碎点：alpha<24 清零；在 alpha≥24 的掩膜上找最大连通块，其他块清掉（头发、翼膜这些半透明部分只要和主体相连就保留） */
          const d = x0.getImageData(0, 0, W, H); const px = d.data; const n = W * H;
          const lab = new Int32Array(n); let cur = 0; const sizes = [0];
          for (let i = 0; i < n; i++) { if (px[i * 4 + 3] < 24) { px[i * 4 + 3] = 0; } }
          const stack = new Int32Array(n);
          for (let s = 0; s < n; s++) {
            if (lab[s] || px[s * 4 + 3] === 0) { continue; }
            cur++; let sp = 0, size = 0; stack[sp++] = s; lab[s] = cur;
            while (sp) {
              const p = stack[--sp]; size++; const x = p % W;
              const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
              for (const q of nb) { if (q >= 0 && q < n && !lab[q] && px[q * 4 + 3] > 0) { lab[q] = cur; stack[sp++] = q; } }
            }
            sizes.push(size);
          }
          /* 留下所有「够大」的块（主体的 3% 以上，例如和身体分开画的道具），清掉碎点 */
          const big = Math.max(...sizes);
          for (let i = 0; i < n; i++) { const l = lab[i]; if (l && sizes[l] < big * 0.03) { px[i * 4 + 3] = 0; } }
          islands = sizes.filter((z, k) => k && z < big * 0.03).length;
          x0.putImageData(d, 0, 0);
        }
        const k = t.h ? t.h / H : t.w / W;
        const w = Math.round(W * k), h = Math.round(H * k);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        /* 大比例缩小分两步，减少锯齿 */
        if (k < 0.5) {
          const m = document.createElement('canvas'); m.width = Math.round(W * k * 2); m.height = Math.round(H * k * 2);
          const mx = m.getContext('2d'); mx.imageSmoothingQuality = 'high'; mx.drawImage(c0, 0, 0, m.width, m.height);
          x.drawImage(m, 0, 0, w, h);
        } else { x.drawImage(c0, 0, 0, w, h); }
        let q = 0.86, url = '';
        for (; q >= 0.4; q -= 0.06) { url = c.toDataURL('image/webp', q); if ((url.length - 23) * 0.75 <= t.kb * 1024) { break; } }
        return { url, w, h, q: Math.round(q * 100) / 100, islands };
      }, { b64, alpha: spec.alpha, t });
      const buf = Buffer.from(res.url.split(',')[1], 'base64');
      const out = path.join(outDir, name + suffix + '.webp');
      fs.writeFileSync(out, buf);
      made++;
      report.push(id + '/' + name + suffix + '.webp  ' + res.w + '×' + res.h + '  ' + Math.round(buf.length / 1024) + 'KB  质量 ' + res.q + (res.islands ? '  清掉碎点 ' + res.islands + ' 块' : '') + (buf.length > t.kb * 1024 ? '  ⚠ 超过 ' + t.kb + 'KB' : ''));
    }
  }
}
await browser.close();
console.log(report.join('\n'));
console.log('[AI 娘素材] 生成 ' + made + ' 个文件');
