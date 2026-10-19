#!/usr/bin/env node
/**
 * 皮肤包校验：node build/lint-skins.mjs [皮肤id...]
 * 规则见 docs/皮肤契约.md 第 7 节。不通过就没有资格进入构建产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packSkinAssets } from './skin-assets.mjs';
import { inspectSkinMeta, inspectSkinCss } from './skin-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKIN_DIR = path.join(ROOT, 'src', 'skins');
const only = process.argv.slice(2);
const assetBudget = {bytes: 0};

const base = fs.readFileSync(path.join(ROOT, 'src', 'skin', 'base.css'), 'utf8');
const ALL_TOKENS = [...new Set([...base.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]))];

/* 可选令牌在 base.css 有完整默认值；全体皮肤补齐后再转为必填。 */
const OPTIONAL_TOKENS = new Set([
  /* RPG 界面层 —— 状态栏重构新增，四个面板共用 */
  '--kami-surface-2', '--kami-surface-3', '--kami-surface-4',
  '--kami-sunken', '--kami-sunken-line', '--kami-edge', '--kami-edge-in',
  '--kami-bar-h', '--kami-bar-fill', '--kami-bar-fill-pos', '--kami-bar-fill-neg', '--kami-bar-gloss',
  '--kami-rank-bg', '--kami-rank-edge', '--kami-rank-fg',
  '--kami-ico-size', '--kami-ico-size-sm',
  '--kami-sb-card-cols', '--kami-sb-row-gap',
  /* 地图节点图（状态栏地图页） */
  '--kami-map-void', '--kami-map-node-fill', '--kami-map-node-edge', '--kami-map-node-fg',
  '--kami-map-fog-fill', '--kami-map-fog-edge', '--kami-map-fog-fg',
  '--kami-map-here-fill', '--kami-map-here-ring', '--kami-map-edge', '--kami-map-edge-dash',
]);

const MUST = ALL_TOKENS.filter(t => !t.endsWith('-v') && !OPTIONAL_TOKENS.has(t));

const REQUIRED_LABEL_TOKENS = ['--kami-label-think-title', '--kami-label-options-title'];
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
function hasAttrValue(code, attr, value) {
  return code.indexOf(attr + '~=' + DQ + value + DQ) >= 0 || code.indexOf(attr + '~=' + SQ + value + SQ) >= 0;
}

function checkSkin(id) {
  const dir = path.join(SKIN_DIR, id);
  const errs = [], warns = [];
  if (!fs.existsSync(dir)) { return { id, errs: ['目录不存在'], warns }; }
  const mp = path.join(dir, 'skin.json'), cp = path.join(dir, 'skin.css');
  if (!fs.existsSync(mp)) { errs.push('缺少 skin.json'); }
  if (!fs.existsSync(cp)) { errs.push('缺少 skin.css'); }
  if (errs.length) { return { id, errs, warns }; }

  let meta;
  try { meta = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (error) { return { id, errs: ['skin.json 解析失败：' + error.message], warns }; }
  errs.push(...inspectSkinMeta(meta, id));
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { id, errs, warns };
  const css = fs.readFileSync(cp, 'utf8');
  const code = stripComments(css);

  errs.push(...inspectSkinCss(css, id));
  try { packSkinAssets(ROOT, id, meta, assetBudget); } catch (e) { errs.push(e.message); }
  const declaredAssets = meta.assets && typeof meta.assets === 'object' ? Object.keys(meta.assets) : [];
  for (const m of code.matchAll(/var\(\s*--kami-asset-([a-z0-9-]+)/g)) {
    if (!declaredAssets.includes(m[1])) { errs.push('未声明的装饰资源 ' + m[1]); }
  }

  if (/@import/i.test(code)) { errs.push('出现 @import'); }
  if (/@font-face/i.test(code)) { errs.push('出现 @font-face（不允许外部字体）'); }
  if (/<script|javascript:/i.test(code)) { errs.push('出现脚本内容'); }
  if (/[\d.]+vh\b/i.test(code)) { errs.push('使用了 vh 单位'); }
  const defined = new Set([...code.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const missing = MUST.filter(t => !defined.has(t));
  if (missing.length) { errs.push('缺少令牌（' + missing.length + ' 个）：' + missing.join(' ')); }
  /* 根级令牌副本供组件继承，不为酒馆自身添加外观。 */
  if (!new RegExp('html\\[data-kami-skin="' + id + '"\\]\\s*\\{[^}]*--kami-fg\\s*:').test(code)) {
    errs.push('基础令牌未上提到 <html>（组件继承不完整）：跑 node build/sync-tavern.mjs');
  }
  const missingLabel = REQUIRED_LABEL_TOKENS.filter(t => !defined.has(t));
  if (missingLabel.length) { warns.push('没有提供文案令牌：' + missingLabel.join(' ') + '（皮肤会失去品牌化标题）'); }

  if (!/prefers-reduced-motion/.test(code)) { errs.push('缺少 prefers-reduced-motion 降级'); }
  if (!/data-kami-motion/.test(code)) { errs.push('缺少 data-kami-motion 档位响应'); }
  if (!/data-kami-density/.test(code)) { warns.push('没有响应 data-kami-density 密度档位'); }
  if (!/data-kami-scheme/.test(code)) { warns.push('没有响应 data-kami-scheme 明暗档位'); }
  if (!/:focus-visible/.test(code)) { errs.push('缺少 :focus-visible 焦点样式'); }
  if (!/--kami-fs-scale/.test(code)) { errs.push('没有把 --kami-fs-scale 乘进字号'); }

  for (const f of (Array.isArray(meta.effects) ? meta.effects : [])) {
    if (!f || !f.id || !f.label) { errs.push('effects 项缺少 id 或 label'); continue; }
    if (!hasAttrValue(code, 'data-kami-effects', f.id)) {
      errs.push('特效 ' + f.id + ' 在 CSS 里找不到 data-kami-effects 的规则');
    }
  }
  for (const d of (Array.isArray(meta.decor) ? meta.decor : [])) {
    if (typeof d === 'string' && code.indexOf('.kami-' + d) < 0) warns.push('声明了 ' + d + ' 装饰，但没有对应样式');
  }

  return { id, errs, warns, bytes: Buffer.byteLength(css), tokens: defined.size };
}

const ids = only.length ? only : (fs.existsSync(SKIN_DIR) ? fs.readdirSync(SKIN_DIR).filter(d => fs.statSync(path.join(SKIN_DIR, d)).isDirectory()) : []);
if (!ids.length) { console.log('（src/skins/ 下还没有皮肤包）'); process.exit(0); }

let bad = 0;
for (const id of ids) {
  const r = checkSkin(id);
  const ok = r.errs.length === 0;
  if (!ok) { bad++; }
  console.log((ok ? 'PASS  ' : 'FAIL  ') + id + (r.bytes ? '  (' + r.bytes + 'B, ' + r.tokens + ' 令牌)' : ''));
  for (const e of r.errs) { console.log('    x ' + e); }
  for (const w of r.warns) { console.log('    ! ' + w); }
}
console.log(bad ? ('\n' + bad + ' 套皮肤未通过校验') : '\n全部皮肤通过校验');
process.exit(bad ? 1 : 0);
