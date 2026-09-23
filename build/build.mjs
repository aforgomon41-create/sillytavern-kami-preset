#!/usr/bin/env node
/**
 * 卡密预设构建脚本
 * ------------------------------------------------------------
 * 输入（src/ 是唯一真相来源）：
 *   src/preset.base.json          预设本体（prompts / settings），构建时只做“注入”，不改
 *   src/scripts/meta.json         脚本顺序与元数据（name/id/enabled/info/button/data/export_with）
 *   src/scripts/*.js              脚本代码（文件内容即 content 字段）
 *   src/regex/list.json           ST 原生正则列表（唯一真相来源）
 * 输出：
 *   dist/kami-v0.90-<N>-<日期>.json    N 自增，永不覆盖历史产物
 *   dist/build-manifest.json             构建台账（含每个源的 sha256）
 *
 * 用法：node build/build.mjs [--dry]
 * 命名（正式分发格式）：kami-v{大版本号}.{两位小版本号}-{构建号}-{日期}.json，
 *       例如 kami-v0.90-113-20260923.json。「两位小版本」= 版本号小数部分写两位，
 *       当前版本 0.9 写作 0.90；日期为构建当天（8 位，年在前）。
 *       N 会从历史产物里的最大构建号继续递增（新旧命名都认），编号不断档。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

/* 正式分发文件名里的版本号段（升版本时改这里）。
   当前版本 0.9，按正式格式写成两位小数：v0.90 */
const V_MAJOR = 0;
const V_MINOR_STR = '90';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
import { expandRegexList, expandDecor, expandBaseCssJs, expandPresetParse, expandPanelGestures, expandGuideCopy } from './kami-doc.mjs';
import { execFileSync } from 'node:child_process';

/* ---------- 读取源 ---------- */
const preset = readJson(path.join(SRC, 'preset.base.json'));
const meta = readJson(path.join(SRC, 'scripts', 'meta.json'));
const regexList = expandRegexList(ROOT, readJson(path.join(SRC, 'regex', 'list.json')));

if (!preset.extensions) preset.extensions = {};
if (!preset.extensions.tavern_helper) preset.extensions.tavern_helper = {};

/* ---------- 皮肤包收集（src/skins/<id>/skin.json + skin.css） ---------- */
function collectSkins() {
  const dir = path.join(SRC, 'skins');
  const out = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const d = path.join(dir, name);
      if (!fs.statSync(d).isDirectory()) { continue; }
      const metaPath = path.join(d, 'skin.json');
      const cssPath = path.join(d, 'skin.css');
      if (!fs.existsSync(metaPath) || !fs.existsSync(cssPath)) { continue; }
      const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      out.push({ ...m, css: fs.readFileSync(cssPath, 'utf8') });
    }
  }
  if (!out.length) {
    /* 设计师还没交付时：把兜底皮肤重新作用域成一套“开发占位皮肤”，让链路可跑通 */
    const base = fs.readFileSync(path.join(SRC, 'skin', 'base.css'), 'utf8');
    out.push({
      id: 'trpg',
      name: '奈亚子的TRPG（开发占位）',
      button: 'TRPG',
      scheme: 'dark',
      dev: true,
      tagline: '占位皮肤：等待设计师交付后替换',
      effects: [{ id: 'scanline', label: '扫描线（占位）', desc: '仅用于验证特效通道', default: false }],
      params: [{ id: 'glow', label: '辉光半径', group: '氛围', token: '--kami-glow-size', unit: 'px', min: 0, max: 24, step: 1, value: 0 }],
      css: base.split('html:not([data-kami-skin])').join('html[data-kami-skin="trpg"]'),
    });
    const alt = base.split('html:not([data-kami-skin])').join('html[data-kami-skin="dev-alt"]') +
      '\nhtml[data-kami-skin="dev-alt"] .kami-root{--kami-accent:#39d0c8;--kami-r-lg:4px;--kami-r-md:3px;--kami-blur:0px;--kami-title-transform:uppercase;}' +
      '\nhtml[data-kami-skin="dev-alt"] .kami-shell{border-left:3px solid var(--kami-accent);}';
    out.push({
      id: 'dev-alt',
      name: '开发占位·备选（Dev Alt）',
      button: 'ALT',
      scheme: 'dark',
      dev: true,
      tagline: '占位皮肤：用于验证切换链路',
      effects: [],
      params: [],
      css: alt,
    });
    console.log('  [皮肤] 警告：src/skins/ 为空，已注入 2 套开发占位皮肤（不可用于发布）');
  }
  return out;
}
const SKINS = collectSkins();
const skinsJson = JSON.stringify(SKINS);

/* ---------- 文案校验（design/copy/copy-table.json 与四套 skin.json 必须一致） ---------- */
try {
  execFileSync(process.execPath, [path.join(__dirname, 'lint-copy.mjs')], { stdio: 'inherit' });
} catch (e) {
  console.error('  [中止] 文案表与皮肤包不一致，先修 design/copy/copy-table.json 或对应 skin.json。');
  process.exit(1);
}

/* ---------- 引导跨层取色护栏（GUIDE_CSS 里不许直接读皮肤的面色令牌） ----------
 * 为什么需要：皮肤可以在组件元素自己身上重定义 --kami-fg / --kami-bg
 * （empire / terminal / mileng 的主按钮就是「强调底 + 底上的深色字」，合法写法），
 * 引导页脚那条墨块规则特异性最高、读的若还是 var(--kami-fg)，就会取到被换过的值 ——
 * 实测底 rgb(27,18,38) 配字 rgb(22,16,31)，对比度 1.03，按钮在屏幕上等于不存在
 * （2026-09-23 用户真机报的统御 / 终端 / 冷凝三套）。判定细节见 build/lint-guide.mjs 文件头。 */
try {
  execFileSync(process.execPath, [path.join(__dirname, 'lint-guide.mjs')], { stdio: 'inherit' });
} catch (e) {
  console.error('  [中止] 引导结构层出现「直接读皮肤面色令牌」的写法，按 lint-guide 的提示改成面板快照再构建。');
  process.exit(1);
}

/* ---------- 脚本编译护栏（src/scripts/*.js 必须全部能编译，编译不过就中止） ----------
 * 为什么需要：文案校验管 skin.json、lint-skins 管皮肤 CSS、verify-frontends 管两个前端，
 * **没有任何一步会看 src/scripts/*.js**——脚本里漏一个花括号，构建照样全绿，
 * 只有把预设导进酒馆才会发现（脚本直接不启动）。这里在写盘之前先机械编译一遍：
 *   · 普通脚本（IIFE / 函数体）→ new Function(源码)：编译，不执行；
 *   · ES 模块脚本（如 01-mvu-zod.js 只有一个 import）→ 函数体编译必然失败，
 *     交给 node 自己的模块语法检查（源码走 stdin，--input-type=module --check -）。
 * 判定「是不是模块脚本」只看**行首**有没有 import / export 声明。
 * 只编译、不执行：不进网络、不碰酒馆，构建依旧离线可跑。 */
const SCRIPT_NL = String.fromCharCode(10);
function looksLikeModuleScript(code) {
  return /^[ \t]*(import|export)\b/m.test(code);
}
{
  const dir = path.join(SRC, 'scripts');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const rows = [];
  const bad = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    const isModule = looksLikeModuleScript(code);
    let err = null;
    if (isModule) {
      try {
        execFileSync(process.execPath, ['--input-type=module', '--check', '-'],
          { input: code, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        const detail = (e.stderr && e.stderr.toString()) || e.message || String(e);
        err = detail.trim().split(SCRIPT_NL).filter(l => l.trim()).slice(-1)[0] || '模块语法检查失败';
      }
    } else {
      try { new Function(code); } catch (e) { err = (e && e.message) || String(e); }
    }
    rows.push({ file: f, mode: isModule ? '模块' : '函数体', err: err });
    if (err) { bad.push(f); }
  }
  console.log('=== 脚本编译检查 ===');
  for (const r of rows) {
    console.log(`  [编译] ${r.err ? '失败' : '通过'}  ${r.file}  (${r.mode})` +
      (r.err ? SCRIPT_NL + '        x ' + r.err : ''));
  }
  if (bad.length) {
    console.error('  [中止] ' + bad.length + ' 个脚本编译不通过：' + bad.join('、') + '，先修脚本语法再构建。');
    process.exit(1);
  }
}

/* ---------- 组装脚本 ---------- */
const scripts = meta.map(m => {
  let code = fs.readFileSync(path.join(SRC, 'scripts', m.file), 'utf8');
  if (code.includes('@@KAMI_SKINS@@')) {
    code = code.replace('/* @@KAMI_SKINS@@ */', 'var SKINS = ' + skinsJson + ';');
  }
  /* 装饰模块（src/decor/*.js）在构建期内联成字符串常量，运行时由脚本注入（契约 §8） */
  code = expandDecor(ROOT, code);
  /* 兜底皮肤（src/skin/base.css）与前端内联的是同一份：脚本里做成一个字符串常量 */
  code = expandBaseCssJs(ROOT, code);
  /* 预设结构解析器（test/harness/preset-parse.mjs）内联进脚本，规则只有一份 */
  code = expandPresetParse(ROOT, code);
  /* 面板手势（src/scripts/_panel-gestures.js）内联进脚本，两个面板共用一份实现 */
  code = expandPanelGestures(ROOT, code);
  /* 引导文案（design/copy/guide-copy.json）内联进引导脚本，文案只有一份真相 */
  code = expandGuideCopy(ROOT, code);
  return {
    type: 'script',
    enabled: m.enabled !== false,
    name: m.name,
    id: m.id,
    content: code,
    info: m.info ?? '',
    button: m.button ?? { enabled: true, buttons: [] },
    data: m.data ?? {},
    export_with: m.export_with ?? { data: true, button: true },
  };
});
preset.extensions.tavern_helper.scripts = scripts;
if (!preset.extensions.tavern_helper.variables) preset.extensions.tavern_helper.variables = {};

/* ---------- 组装正则（regex_scripts 为准，SPreset 镜像同步） ---------- */
preset.extensions.regex_scripts = regexList;
if (preset.extensions.SPreset && preset.extensions.SPreset.RegexBinding) {
  preset.extensions.SPreset.RegexBinding.regexes = regexList;
}

/* ---------- 版本号自增 ---------- */
fs.mkdirSync(DIST, { recursive: true });

/* 同时扫描 dist/ 与 预设JSON/（基线产物也在里面），保证“每次构建都不覆盖历史产物，
   只在最后一个小版本号上 +1”，方便回档。 */
const scanDirs = [DIST, path.join(ROOT, '预设JSON')];
let N = 0;
for (const dir of scanDirs) {
  if (!fs.existsSync(dir)) { continue; }
  for (const f of fs.readdirSync(dir)) {
    /* 三种命名都要认，否则构建号会从 1 重来：
       · 现行  kami-v0.90-113-20260923.json（2026-09-23 起：前缀由「卡密预设」改为 kami-，
              因为 GitHub Releases 会把非 ASCII 附件名直接削掉）
       · 曾用  卡密预设v0.09-52-20260922.json
       · 旧版  卡密预设0.9-52.json
       · 更旧  卡密预设0.9-260917-51.json（日期前缀 = 6 位数字 + 短横线） */
    let m = /^(?:kami-|卡密预设)v\d+\.\d+-(\d{1,4})-\d{8}\.json$/i.exec(f);
    if (m) { N = Math.max(N, Number(m[1])); continue; }
    m = /^(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d{1,4})\.json$/i.exec(f);
    if (m) { N = Math.max(N, Number(m[1])); }
  }
}
N += 1;
const _d = new Date();
const dateTag = '' + _d.getFullYear() + String(_d.getMonth() + 1).padStart(2, '0') + String(_d.getDate()).padStart(2, '0');
const outName = `kami-v${V_MAJOR}.${V_MINOR_STR}-${N}-${dateTag}.json`;
const outPath = path.join(DIST, outName);

preset.name = outName.replace(/\.json$/, '');

/* ---------- 产物号注入（引导脚本用它判「这个产物看过没有」） ---------- */
for (const s of scripts) {
  if (s.content.includes('@@KAMI_BUILD_N@@')) {
    s.content = s.content.split('@@KAMI_BUILD_N@@').join(String(N));
    console.log(`  [注入] 产物号 ${N} → ${s.name}`);
  }
}

/* ---------- 构建台账 ---------- */
const manifestPath = path.join(DIST, 'build-manifest.json');
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : { builds: [] };
const entry = {
  file: outName,
  builtAt: new Date().toISOString(),
  presetName: preset.name,
  scripts: scripts.map(s => ({ name: s.name, enabled: s.enabled, id: s.id, source: meta.find(m => m.id === s.id)?.file, sha256: sha(s.content), bytes: Buffer.byteLength(s.content) })),
  regex: regexList.map(r => ({ scriptName: r.scriptName, disabled: !!r.disabled, replacementBytes: Buffer.byteLength(r.replaceString || '') })),
  base: 'src/preset.base.json',
  baseSha256: sha(fs.readFileSync(path.join(SRC, 'preset.base.json'))),
};

console.log('=== 卡密预设构建 ===');
for (const s of entry.scripts) {
  console.log(`  [脚本] ${s.enabled ? '启用' : '停用'}  ${s.name}  (${s.bytes}B, sha ${s.sha256})  <= ${s.source}`);
}
for (const r of entry.regex) {
  console.log(`  [正则] ${r.disabled ? '停用' : '启用'}  ${r.scriptName}  (${r.replacementBytes}B)`);
}
console.log(`  [皮肤] ${SKINS.map(k => k.id + (k.dev ? '(占位)' : '')).join(', ')} 共 ${SKINS.length} 套`);
console.log(`  [输出] ${outName}`);

if (dry) {
  console.log('  (--dry：未写盘)');
} else {
  fs.writeFileSync(outPath, JSON.stringify(preset), 'utf8');
  manifest.builds.push(entry);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  [完成] ${outPath}  (${fs.statSync(outPath).size} bytes)`);
  /* 真实语义验证：按酒馆 engine.js 的替换语义重放并编译前端脚本，不通过就退出 */
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify-frontends.mjs')], { stdio: 'inherit' });
  } catch (e) {
    console.error('  [中止] 前端真实语义验证未通过，产物已写出但请不要使用，先修前端。');
    process.exit(1);
  }
}
