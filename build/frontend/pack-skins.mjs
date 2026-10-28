#!/usr/bin/env node
/**
 * 内置皮肤打包：src/skins-next/<id>/{skin.json, skin.css?, assets/*} → .cache/frontend/skins.json
 * 前端契约 5.5 第 6 条、6.3、14：清单校验、CSS 检查、**每个配色方案都不允许出现自动校正**，任何一项不过就构建失败。
 * 素材打成 data: URL（以后可改为 blob: 共享池），并检查单张与总量预算。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'src', 'skins-next');
const OUT = path.join(ROOT, '.cache', 'frontend', 'skins.json');
const ONE_MAX = 300 * 1024, TOTAL_MAX = 1200 * 1024;

/* 引擎是 TypeScript：现场打一份给 node 用 */
const tmp = path.join(ROOT, '.cache', 'frontend', 'engine-node.mjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await esbuild.build({ stdin: { contents: "export { validateManifest } from './src/frontend/skin-engine/package';\nexport { composeSkin } from './src/frontend/skin-engine/compose';\nexport { lintSkinCss } from './src/frontend/skin-engine/lint-css';", resolveDir: ROOT, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', outfile: tmp, packages: 'external', loader: { '.css': 'text' }, logLevel: 'silent' });
const { validateManifest, composeSkin, lintSkinCss } = await import(tmp + '?t=' + Date.now());

const problems = [];
const skins = [];
let total = 0;
const ids = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((d) => fs.statSync(path.join(DIR, d)).isDirectory()).sort() : [];
for (const id of ids) {
  const d = path.join(DIR, id);
  const fail = (m) => problems.push(id + '：' + m);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(d, 'skin.json'), 'utf8')); } catch (e) { fail('skin.json 读不了：' + e.message); continue; }
  if (manifest.id !== id) { fail('清单 id（' + manifest.id + '）与目录名不一致'); }
  for (const e of validateManifest(manifest)) { fail(e); }
  const cssPath = path.join(d, 'skin.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  for (const i of css ? lintSkinCss(css) : []) { fail('skin.css 第 ' + i.line + ' 行：' + i.message); }
  const assetUrls = {};
  for (const [name, a] of Object.entries(manifest.assets || {})) {
    const f = path.join(d, a.file);
    if (!fs.existsSync(f)) { fail('素材不存在：' + a.file); continue; }
    const buf = fs.readFileSync(f); total += buf.length;
    if (buf.length > ONE_MAX) { fail('素材 ' + a.file + ' 超过单张预算（' + Math.round(buf.length / 1024) + 'KB > 300KB）'); }
    assetUrls[name] = 'data:image/' + (a.file.toLowerCase().endsWith('.png') ? 'png' : 'webp') + ';base64,' + buf.toString('base64');
  }
  /* 内置皮肤：每个配色方案、每档对比度设置都不允许出现自动校正 */
  for (const mode of Object.keys(manifest.schemes || {})) {
    try {
      const c = composeSkin(manifest, { scheme: mode, density: 'cozy', motion: 'full', fontScale: 1 }, { skinCss: css });
      for (const x of c.corrections) { fail(mode + ' 方案需要自动校正：' + x.token + ' 对 ' + x.against + ' 只有 ' + x.before + '（要 ' + x.required + '），' + x.from + ' → 建议 ' + x.to); }
    } catch (e) { fail(mode + ' 方案合成失败：' + e.message); }
  }
  skins.push({ manifest, css, assetUrls });
}
if (total > TOTAL_MAX) { problems.push('全部内置皮肤素材超过总预算（' + Math.round(total / 1024) + 'KB > 1200KB）'); }
if (problems.length) { console.error('[内置皮肤] 不通过：\n  ' + problems.join('\n  ')); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(skins));
console.log('[内置皮肤] ' + skins.length + ' 套通过（' + (skins.map((s) => s.manifest.id).join('、') || '暂无') + '），素材共 ' + Math.round(total / 1024) + 'KB → ' + path.relative(ROOT, OUT));
