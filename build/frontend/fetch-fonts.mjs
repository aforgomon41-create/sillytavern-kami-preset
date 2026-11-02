#!/usr/bin/env node
/**
 * 皮肤外链字体的分片表生成器（前端契约 6.6）。
 *
 * 皮肤目录里写 fonts.src.json（要哪些 fontsource 字体包、哪些字重），本脚本去 jsDelivr 取 fontsource 的 CSS，
 * 解析出每一片（woff2 地址 + unicode-range），写成同目录的 fonts.gen.json（FontDef[]，提交进仓库）；
 * 中文字体的切片范围存进共用表 src/frontend/runtime/font-slices.json，清单里只留地址模板与片号。
 * 构建时 pack-skins.mjs 把 fonts.gen.json 并进清单的 fonts；运行时 runtime/remote.ts 只注册不预载分片，
 * 浏览器用到哪些字才下载哪几片。地址钉死版本号，构建本身不连网。
 *
 *   node build/frontend/fetch-fonts.mjs [皮肤 id …]     不给 id 就处理全部有 fonts.src.json 的皮肤
 *
 * fonts.src.json 格式：[{ "pkg": "ma-shan-zheng", "weights": [400], "family": "Ma Shan Zheng" }]
 *   pkg      @fontsource/ 后面的包名
 *   weights  要哪些字重（默认 [400]）
 *   family   注册用的字体名（默认用 fontsource 里的名字）；皮肤的字体栈里写这个名字
 * 为什么用 jsDelivr 上的 fontsource：大陆能连（Google Fonts 常连不上），中文字体按 unicode-range 切了一百多片。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'src', 'skins-next');
const CDN = 'https://cdn.jsdelivr.net/npm/';

/* 用 curl 取：沙箱 / 公司网络常常只有 curl 走代理，Node 自带的 fetch 不读代理环境变量 */
async function get(url) {
  try { return execFileSync('curl', ['-sSfL', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  catch (e) { throw new Error(url + ' 取不到：' + String(e.stderr || e.message).trim()); }
}

const versions = new Map();
async function latest(pkg) {
  if (!versions.has(pkg)) {
    const j = JSON.parse(await get('https://data.jsdelivr.com/v1/package/npm/@fontsource/' + pkg));
    versions.set(pkg, j.tags.latest);
  }
  return versions.get(pkg);
}

function parse(css, base, family) {
  const out = [];
  for (const block of css.split('@font-face').slice(1)) {
    const body = block.slice(block.indexOf('{') + 1, block.indexOf('}'));
    const prop = (k) => { const m = new RegExp(k + '\\s*:\\s*([^;]+);').exec(body); return m ? m[1].trim() : ''; };
    const m = /url\(([^)]+\.woff2)\)/.exec(prop('src'));
    if (!m) { continue; }
    const f = { family: family || prop('font-family').replace(/^['"]|['"]$/g, ''), src: [new URL(m[1].replace(/^['"]|['"]$/g, ''), base).href] };
    const w = prop('font-weight'); if (w) { f.weight = w; }
    const st = prop('font-style'); if (st === 'italic') { f.style = 'italic'; }
    const ur = prop('unicode-range'); if (ur) { f.unicodeRange = ur.replace(/\s+/g, ''); }
    out.push(f);
  }
  return out;
}

/* 共用切片表：fontsource 的中文字体都按同一套编号切片（同编号 = 同一段 unicode-range），所以范围只存一份在运行库里，
   皮肤清单里每款字体只写一条「地址模板 + 用到哪几片」，运行时展开（不然每款中文字体光范围就有 70KB）。 */
const TABLE = path.join(ROOT, 'src', 'frontend', 'runtime', 'font-slices.json');
const table = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : {};
let tableChanged = false;

const want = process.argv.slice(2);
const ids = fs.readdirSync(DIR).filter((d) => fs.existsSync(path.join(DIR, d, 'fonts.src.json')) && (!want.length || want.includes(d)));
for (const id of ids) {
  const src = JSON.parse(fs.readFileSync(path.join(DIR, id, 'fonts.src.json'), 'utf8'));
  const all = [];
  for (const item of src) {
    const ver = await latest(item.pkg);
    for (const w of item.weights || [400]) {
      const url = CDN + '@fontsource/' + item.pkg + '@' + ver + '/' + w + '.css';
      const faces = parse(await get(url), url, item.family);
      if (!faces.length) { throw new Error(id + '：' + url + ' 里没解析出字体'); }
      /* 文件名里的切片编号：…/<pkg>-<片>-<字重>-<样式>.woff2 */
      const re = new RegExp('/' + item.pkg + '-([\\w-]+?)-' + w + '-(normal|italic)\\.woff2$');
      const sliced = faces.length > 8 && faces.every((f) => f.unicodeRange && re.test(f.src[0]));
      if (!sliced) { all.push(...faces); continue; }
      const keys = [];
      for (const f of faces) {
        const key = re.exec(f.src[0])[1];
        if (table[key] && table[key] !== f.unicodeRange) { throw new Error(item.pkg + ' 的第 ' + key + ' 片范围和共用切片表不一样，不能共用（要么换字体，要么改成逐片写）'); }
        if (!table[key]) { table[key] = f.unicodeRange; tableChanged = true; }
        keys.push(key);
      }
      const tpl = faces[0].src[0].replace(re, '/' + item.pkg + '-{slice}-' + w + '-$2.woff2');
      const one = { family: faces[0].family, src: [tpl], slices: keys };
      if (faces[0].weight) { one.weight = faces[0].weight; }
      if (faces[0].style) { one.style = faces[0].style; }
      all.push(one);
    }
  }
  fs.writeFileSync(path.join(DIR, id, 'fonts.gen.json'), JSON.stringify(all) + '\n');
  console.log('[字体] ' + id + '：' + src.map((x) => x.pkg).join('、') + ' → ' + all.map((f) => f.family + (f.slices ? '（' + f.slices.length + ' 片）' : '')).join('、'));
}
if (tableChanged) {
  const sorted = Object.fromEntries(Object.keys(table).sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b)).map((k) => [k, table[k]]));
  fs.writeFileSync(TABLE, JSON.stringify(sorted) + '\n');
  console.log('[字体] 共用切片表更新：' + Object.keys(sorted).length + ' 片 → ' + path.relative(ROOT, TABLE));
}
