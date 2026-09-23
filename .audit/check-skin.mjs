#!/usr/bin/env node
/**
 * 派活方（主 agent）的独立抽查脚本：node .audit/check-skin.mjs <id> [<id>...]
 *
 * 这是 `build/lint-skins.mjs` 的**补充**，不是替代品：
 * lint 管「能不能进构建产物」，这里管「派活方复核 subagent 自报」时要点名的历史坑。
 * 每条都对应一次真机返工（见 docs/皮肤制作流程.md §五）。
 * **只读，不改动任何被检查的文件。**
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2);
if (!ids.length) { console.error('用法：node .audit/check-skin.mjs <id> [<id>...]'); process.exit(2); }

const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);
const base = fs.readFileSync(path.join(ROOT, 'src', 'skin', 'base.css'), 'utf8');
const MUST = [...new Set([...base.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]))].filter(t => !t.endsWith('-v'));
const PANEL_IDS = ['#kami-preset-panel', '#kami-guide-panel', '#kami-skin-panel', '#kami-compress-panel'];
const FUNC_LABELS = ['--kami-label-empty', '--kami-label-chars', '--kami-label-unit', '--kami-label-demo',
  '--kami-label-filled', '--kami-label-noinput', '--kami-label-sent', '--kami-label-sendfail'];
const CSS_UNITS = new Set(['', 'px', '%', 'em', 'rem', 'deg', 'rad', 'turn', 's', 'ms', 'fr', 'ch', 'ex',
  'vw', 'vmin', 'vmax', 'pt', 'pc', 'cm', 'mm', 'in', 'q', 'lh', 'rlh', 'cap', 'ic']);
const QUAD = ['.kami-number', '.kami-text', '.kami-textarea', '.kami-select'];

/* ---------- 极简 CSS 解析：把 CSS 拆成 [{sel, decls:[{prop,val}], raw}] ---------- */
function parseRules(css) {
  let code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*\}/g, '');   // 关键帧不进规则表
  const rules = [];
  (function walk(text, ctx) {
    let i = 0, start = 0;
    while (i < text.length) {
      if (text[i] === '{') {
        let depth = 1, j = i + 1;
        while (j < text.length && depth > 0) {
          if (text[j] === '{') depth++;
          else if (text[j] === '}') depth--;
          j++;
        }
        const prelude = text.slice(start, i).trim();
        const body = text.slice(i + 1, j - 1);
        if (prelude.startsWith('@')) { walk(body, ctx ? ctx + ' > ' + prelude : prelude); }
        else if (prelude) { rules.push({ sel: prelude, body, decls: decls(body), media: ctx || '' }); }
        i = j; start = j;
      } else { i++; }
    }
  })(code, '');
  return rules;
}
function decls(body) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { push(cur); cur = ''; continue; }
    cur += ch;
  }
  push(cur);
  function push(s) {
    const t = s.trim();
    if (!t) return;
    const k = t.indexOf(':');
    if (k < 0) return;
    out.push({ prop: t.slice(0, k).trim().toLowerCase(), val: t.slice(k + 1).trim() });
  }
  return out;
}
/** 只在括号外按逗号切选择器（`:has(a, b)` 不能被切开） */
function splitSel(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
const has = (r, prop) => r.decls.some(d => d.prop === prop);
const get = (r, prop) => (r.decls.find(d => d.prop === prop) || {}).val || '';
const isImp = (r, prop) => /!important/i.test(get(r, prop));
const selHasClass = (r, cls) => splitSel(r.sel).some(s => new RegExp(cls.replace(/\./g, '\\.') + '(?![\\w-])').test(s));

/* ---------- 颜色与对比度（契约 §2.7：正文对比度不低于 4.5:1） ---------- */
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };
function parseColor(raw) {
  if (!raw) return null;
  const v = String(raw).trim().replace(/\s*!important\s*$/i, '');
  const kw = NAMED[v.toLowerCase()];
  if (kw) return { r: kw[0], g: kw[1], b: kw[2], a: kw[3] };
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    const n = h.length >= 6 ? [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)] : null;
    if (!n) return null;
    return { r: parseInt(n[0], 16), g: parseInt(n[1], 16), b: parseInt(n[2], 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(n => !Number.isFinite(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 };
  }
  return null;   /* 渐变 / var() 未解析 / color-mix 等：算不了就如实说算不了 */
}
function relLum(c) {
  const f = x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrast(c1, c2) {
  const a = relLum(c1), b = relLum(c2);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
/** 把 --kami-* 令牌值里的一层 var(--x) 解掉（皮肤里常见 --kami-fg: var(--kami-ink)） */
function resolveVar(val, map, depth) {
  if (depth > 3 || !val) return val;
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/i.exec(String(val).trim());
  if (!m) return val;
  const next = map.get(m[1]);
  return next === undefined ? (m[2] || null) : resolveVar(next, map, depth + 1);
}

let hardFail = 0;
for (const id of ids) {
  const dir = path.join(ROOT, 'src', 'skins', id);
  const jp = path.join(dir, 'skin.json'), cp = path.join(dir, 'skin.css');
  console.log('=== ' + id + ' ===');
  if (!fs.existsSync(jp) || !fs.existsSync(cp)) {
    console.log('  FAIL  还缺文件：' + (!fs.existsSync(jp) ? 'skin.json ' : '') + (!fs.existsSync(cp) ? 'skin.css' : ''));
    hardFail++; continue;
  }
  const meta = JSON.parse(fs.readFileSync(jp, 'utf8'));
  const css = fs.readFileSync(cp, 'utf8');
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = parseRules(css);
  const allSels = rules.flatMap(r => splitSel(r.sel));
  const bad = [], ok = [], warns = [];

  /* 1 · 选择器前缀（面板要用机械替换生成预览副本） */
  const PREFIX = 'html[data-kami-skin=' + DQ + id + DQ + ']';
  const offPrefix = allSels.filter(s => s.includes('kami') && !s.startsWith(PREFIX) && !s.startsWith('@'));
  (offPrefix.length ? bad : ok).push('选择器前缀 ' + PREFIX + '（' + allSels.length + ' 条，越界 ' + offPrefix.length
    + (offPrefix.length ? '：' + offPrefix.slice(0, 3).join(' | ') : '') + '）');

  /* 2 · 外部资源 / 脚本 / vh */
  const netHits = ['url(http', 'url(//', 'url(' + DQ + 'http', 'url(' + SQ + 'http', 'url(' + DQ + '//', 'url(' + SQ + '//',
    'src=http', 'src=//', '@import', '@font-face', '<script', 'javascript:'].filter(p => code.toLowerCase().includes(p));
  (netHits.length ? bad : ok).push('外部资源与脚本禁项（命中 ' + netHits.length + '：' + (netHits.join(' ') || '无') + '）');
  const vh = [...code.matchAll(/[\d.]+vh\b/gi)].map(m => m[0]);
  (vh.length ? bad : ok).push('vh 单位（命中 ' + vh.length + '：' + (vh.slice(0, 3).join(' ') || '无') + '）');

  /* 3 · 面板 id 污染 / 「少一个空格」（查注释剥掉的代码，免得注释里提一句就误报） */
  const idSels = allSels.filter(s => PANEL_IDS.some(p => s.includes(p)));
  /* 例外（契约 §4.4）：面板自身的几何骨架与网格密度允许用 id */
  const idGeo = idSels.filter(s => {
    const hit = rules.find(r => splitSel(r.sel).includes(s));
    if (!hit) return false;
    const geo = ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'grid-template-columns', 'grid-template-rows', 'inset', 'left', 'top', 'right', 'bottom',
      '--kami-items-min', '--kami-panel-w', '--kami-panel-h'];
    return hit.decls.length > 0 && hit.decls.every(d => geo.includes(d.prop) || d.prop.startsWith('--kami-items'));
  });
  const idReal = idSels.filter(s => !idGeo.includes(s));
  (idReal.length ? bad : ok).push('面板 id 写进组件规则（真命中 ' + idReal.length + '：' + (idReal.slice(0, 2).join(' | ') || '无')
    + '；几何/网格密度例外 ' + idGeo.length + ' 条）');
  const noSpace = allSels.filter(s => /\[data-kami-comp=[^\]]*\]\./.test(s));
  (noSpace.length ? bad : ok).push('面板根与组件之间缺空格（命中 ' + noSpace.length
    + (noSpace.length ? '：' + noSpace.slice(0, 2).join(' | ') : '') + '）');

  /* 4 · 令牌全集 / 禁用功能性文案令牌 */
  const defined = new Set([...code.matchAll(/(--kami-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const missing = MUST.filter(t => !defined.has(t));
  (missing.length ? bad : ok).push('令牌全集（定义 ' + defined.size + '，缺 ' + missing.length
    + (missing.length ? '：' + missing.join(' ') : '') + '）');
  const usedFunc = FUNC_LABELS.filter(t => defined.has(t));
  (usedFunc.length ? bad : ok).push('禁用功能性文案令牌（命中 ' + usedFunc.length + '：' + (usedFunc.join(' ') || '无') + '）');

  /* 5 · 必须响应的档位 */
  const need = [['prefers-reduced-motion', /prefers-reduced-motion/], ['data-kami-motion', /data-kami-motion/],
    [':focus-visible', /:focus-visible/], ['data-kami-scheme', /data-kami-scheme/], ['data-kami-density', /data-kami-density/]];
  const missResp = need.filter(n => !n[1].test(code)).map(n => n[0]);
  (missResp.length ? bad : ok).push('档位响应（缺 ' + missResp.length + '：' + (missResp.join(' ') || '无') + '）');
  const fsScale = /--kami-fs\s*:\s*calc\([^;]*var\(--kami-fs-scale\)/.test(code);
  (fsScale ? ok : bad).push('--kami-fs 把 --kami-fs-scale 乘进 calc()（' + (fsScale ? '有' : '缺/写法不对') + '）');

  /* 6 · 对比度四件套：一条 panel 作用域规则里 background-color + color + color-scheme 三项都 !important，
         且四类控件都被这条规则覆盖（用户酒馆的自定义 CSS 会抢色，少一项真机就是黑底压深字）。 */
  const contrastRules = rules.filter(r => isImp(r, 'background-color') && isImp(r, 'color'));
  const uncovered = QUAD.filter(c => !contrastRules.some(r => selHasClass(r, c)));
  if (!contrastRules.length) {
    bad.push('对比度四件套：找不到「background-color + color 都带 !important」的规则');
  } else {
    const lacks = ['background-color', 'color', 'color-scheme'].filter(p => !contrastRules.every(r => isImp(r, p)));
    if (lacks.length || uncovered.length) {
      bad.push('对比度四件套（合格规则 ' + contrastRules.length + ' 条）：缺 !important 的项 ' + (lacks.join(' ') || '无')
        + '；未被覆盖的控件 ' + (uncovered.join(' ') || '无'));
    } else {
      ok.push('对比度四件套三项 !important（合格规则 ' + contrastRules.length + ' 条，四类控件全覆盖）');
    }
  }
  const badAlign = rules.filter(r => /right/.test(get(r, 'text-align')))
    .filter(r => splitSel(r.sel).some(s => /kami-number/.test(s)))
    .flatMap(r => splitSel(r.sel)).filter(s => !/input\.kami-number\[type=(?:"number"|'number')\]/.test(s));
  (badAlign.length ? bad : ok).push('数字框的 text-align:right 只挂 input.kami-number[type="number"]（越界 ' + badAlign.length
    + (badAlign.length ? '：' + badAlign.slice(0, 2).join(' | ') : '') + '）');

  /* 6b · 对比度数值（契约 §2.7 硬门槛 4.5:1）——只算「显式不透明」的字色/底色对，
         半透明或渐变底一律跳过（那种情况继续往上层合成算出来的数是假读数，历史骗过一轮）。 */
  const globalMap = new Map();
  for (const r of rules) for (const d of r.decls) if (d.prop.startsWith('--kami-')) globalMap.set(d.prop, d.val);
  const tokenBlocks = rules.filter(r => r.decls.some(d => d.prop === '--kami-bg'));
  const pairs = [];
  for (const r of tokenBlocks) {
    const local = new Map(globalMap);
    for (const d of r.decls) if (d.prop.startsWith('--kami-')) local.set(d.prop, d.val);
    const pick = t => parseColor(resolveVar(local.get(t), local, 0));
    const label = (splitSel(r.sel)[0] || r.sel).replace(/^html\[data-kami-skin="[^"]+"\]\s*/, '');
    const fg = pick('--kami-fg'), fgDim = pick('--kami-fg-dim');
    const bg = pick('--kami-bg'), card = pick('--kami-card'), card2 = pick('--kami-card-2');
    const add = (name, a, b) => { if (a && b && a.a === 1 && b.a === 1) pairs.push({ label, name, ratio: contrast(a, b) }); };
    add('fg/bg', fg, bg); add('fg/card', fg, card); add('fg/card-2', fg, card2); add('fg-dim/card-2', fgDim, card2);
  }
  const fgPairs = pairs.filter(p => p.name.startsWith('fg/'));
  if (!fgPairs.length) {
    warns.push('对比度数值：没有可解析的不透明「字色/底色」对（全用渐变或半透明底），只能真机上看');
  } else {
    const worst = fgPairs.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    const low = fgPairs.filter(p => p.ratio < 4.5);
    const msg = '正文对比度数值（' + fgPairs.length + ' 对可算）：最低 ' + worst.ratio.toFixed(2) + ':1（' + worst.name + ' @ ' + worst.label + '）';
    (low.length ? bad : ok).push(msg + (low.length ? '；低于 4.5:1 的 ' + low.length + ' 对：'
      + low.slice(0, 3).map(p => p.name + ' ' + p.ratio.toFixed(2) + ' @ ' + p.label).join('、') : ''));
    const dim = pairs.filter(p => p.name.startsWith('fg-dim/'));
    if (dim.length) {
      const dw = dim.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
      ok.push('次要文字对比度最低 ' + dw.ratio.toFixed(2) + ':1（' + dw.label + '）');
    }
  }


  const noteFlex = rules.some(r => selHasClass(r, '.kami-item-note') && /column/.test(get(r, 'flex-direction')) && get(r, 'min-width') === '0')
    && rules.some(r => /\.kami-item-note\s*>\s*\.kami-card/.test(r.sel) && /^1\s+1/.test(get(r, 'flex')));
  (noteFlex ? ok : bad).push('.kami-item-note 等高两条 flex/column/min-width:0（' + (noteFlex ? '有' : '缺') + '）');
  /* 预览窗的 pointer-events：平台层已经给两个 frame 兜住（30-皮肤管理.js:184 / 50-引导.js:606），
     所以皮肤缺它不算硬伤 —— 但写了更稳（docs/皮肤制作流程.md §五-③-7 要求四处都写）。 */
  const pvMiss = ['.kami-pv', '.kami-pv-frame', '.kami-guide-pv', '.kami-guide-pv-frame']
    .filter(c => !rules.some(r => selHasClass(r, c) && /none/.test(get(r, 'pointer-events'))));
  (pvMiss.length ? warns : ok).push('预览窗 pointer-events:none（缺 ' + pvMiss.length + '：' + (pvMiss.join(' ') || '无')
    + '，平台层已兜 frame，不拦）');
  const gridHas = allSels.filter(s => s.includes('.kami-grid:has('));
  const gridBad = gridHas.filter(s => !s.includes('.kami-item-note'));
  (gridBad.length ? bad : ok).push('网格密集判据含 .kami-item-note（越界 ' + gridBad.length
    + (gridBad.length ? '：' + gridBad.slice(0, 2).join(' | ') : '') + '）');
  /* 「判据写了、但没把密集列宽调小」= 面板里条目卡一行一张（历史 bug 的第二种形态：
     规则里只重写 grid-template-columns，--kami-items-min 仍是根上的 15.5rem=248px，347px 的网格只能排 1 列）。 */
  const denseRules = rules.filter(r => splitSel(r.sel).some(s => s.includes('.kami-grid:has(')));
  /* 桌面面板里条目卡不许一行一张。两种合格写法：
     ① 基准规则直接写 `.kami-grid { --kami-items-min: 100px }`（新皮肤多为带 :has() 的密集判据）；
     ② 老五套那样写在**面板根**上靠继承（`…[data-kami-comp="panel"] { --kami-items-min: 96px }`）。
     手机档里的 152px/108px 救不了桌面，所以只看不带媒体查询的规则。 */
  const small = v => { const n = parseFloat(v); return Number.isFinite(n) && (v.includes('px') ? n <= 200 : v.includes('rem') ? n <= 13 : false); };
  const baseTok = rules.filter(r => !r.media && get(r, '--kami-items-min'));
  const denseOk = baseTok.some(r => small(get(r, '--kami-items-min')));
  (denseOk ? ok : bad).push('桌面面板的密集列宽被调小（' + (denseOk ? '有' : '缺')
    + '：基准令牌规则 ' + baseTok.length + ' 条 → ' + (baseTok.map(r => get(r, '--kami-items-min')).join(' / ') || '无')
    + '；手机档 ' + rules.filter(r => r.media && get(r, '--kami-items-min')).length + ' 条）');
  /* isekai 同款陷阱：基准值写在网格元素自己身上、手机档写在祖先上 → 元素自己的声明赢，手机档不生效 */
  const gridBase = baseTok.some(r => splitSel(r.sel).some(s => /\.kami-grid(?![\w-])/.test(s)));
  const phoneTok = rules.filter(r => r.media && get(r, '--kami-items-min'));
  const phoneOnGrid = phoneTok.some(r => splitSel(r.sel).some(s => /\.kami-grid(?![\w-])/.test(s)));
  if (gridBase && phoneTok.length && !phoneOnGrid) {
    warns.push('手机档改了 --kami-items-min 但没写在 .kami-grid 上：基准规则把令牌声明在网格元素自己身上时，'
      + '祖先上的手机档值打不过它（isekai 的同款陷阱，需实测窄屏确认）');
  }
  const isOn = allSels.filter(s => /\.is-on|aria-pressed/.test(s)).length;
  (isOn >= 3 ? ok : bad).push('.is-on / aria-pressed 选中态规则条数（' + isOn + '，应 ≥3）');
  /* 陷阱：.kami-shell 与 .kami-surface 常常是同一个元素，写 background 简写会把纹理重置掉。
     伪元素（::before/::after）上的 background 不算 —— 那不是同一层。 */
  const shorthand = rules.filter(r => has(r, 'background'))
    .flatMap(r => splitSel(r.sel))
    .filter(s => !s.includes('::') && /\.kami-(shell|surface)(?![\w-])/.test(s));
  (shorthand.length ? bad : ok).push('在 .kami-shell/.kami-surface 本体上写 background 简写（命中 ' + shorthand.length
    + (shorthand.length ? '：' + shorthand.slice(0, 3).join(' | ') : '') + '）');
  const sheet = allSels.some(s => /kami-drop\[data-kami-layout=(?:"sheet"|'sheet')\]/.test(s));
  (sheet ? ok : bad).push('响应 .kami-drop[data-kami-layout="sheet"] 贴底抽屉（' + (sheet ? '有' : '缺') + '）');
  /* 滚动容器必须皮肤自己声明 overflow-y：base.css 那条 `html:not([data-kami-skin]) .kami-scroll{overflow-y:auto}`
     被「仅无皮肤时生效」限定了 —— 真实皮肤生效时它一条都不匹配，
     漏写就是「面板内容超出屏幕后拖不动」（用户真机报「不能上下滑动」，civdawn 就这么坏的）。 */
  const scrollRules = rules.filter(r => splitSel(r.sel).some(s => /\.kami-scroll(?![\w-])/.test(s) && !s.includes('::')));
  const scrollOverflow = scrollRules.some(r => /auto|scroll/.test(get(r, 'overflow-y')) || /auto|scroll/.test(get(r, 'overflow')));
  (scrollOverflow ? ok : bad).push('滚动容器 .kami-scroll 自己声明 overflow-y（' + (scrollOverflow ? '有' : '缺')
    + '：基准规则 ' + scrollRules.length + ' 条 → ' + (scrollRules.map(r => get(r, 'overflow-y') || get(r, 'overflow') || '未设').join(' / ') || '无') + '）');
  /* 面板滚动链路（缺一条就「不能上下滑动」）：平台几何层（30-皮肤管理.js:227-229）只下发位置与尺寸，
     `display:flex / flex-direction:column / overflow:hidden` 是**皮肤的责任**。
     链路 = ① 面板本体 flex 竖列 + 裁切 → ② 头/页签/脚不伸缩 → ③ 中间页 flex:1 1 auto + min-height:0 → ④ 页自己 overflow-y。 */
  const dropRules = rules.filter(r => splitSel(r.sel).some(s => /\.kami-drop(?![\w-])/.test(s) && !/\[data-kami-layout/.test(s) && !s.includes('::')));
  const dropFlex = dropRules.some(r => /flex/.test(get(r, 'display')) && /column/.test(get(r, 'flex-direction')))
    && dropRules.some(r => /hidden/.test(get(r, 'overflow')));
  const bodyFlex = rules.some(r => {
    const sels = splitSel(r.sel);
    return sels.some(s => /\.kami-drop\s*>\s*\.kami-body(?![\w-])/.test(s))
      && /1\s+1/.test(get(r, 'flex')) && get(r, 'min-height') === '0';
  });
  const chainMiss = [];
  if (!dropFlex) chainMiss.push('面板本体缺 display:flex+flex-direction:column+overflow:hidden');
  if (!bodyFlex) chainMiss.push('缺 .kami-drop > .kami-body { flex:1 1 auto; min-height:0 }');
  if (!scrollOverflow) chainMiss.push('缺 .kami-scroll 的 overflow-y');
  (chainMiss.length ? bad : ok).push('面板滚动链路完整（' + (chainMiss.length ? chainMiss.join('；') : '四环齐全') + '）');
  const shellBg = rules.some(r => (selHasClass(r, '.kami-shell') || selHasClass(r, '.kami-surface')));
  (shellBg ? ok : bad).push('给 .kami-shell/.kami-surface 写外观规则（' + (shellBg ? '有' : '缺') + '）');
  /* 锁死条目（原生 disabled）必须有看得见的差别：兜底 base.css 的同类规则被 html:not([data-kami-skin]) 限定，
     真实皮肤生效时一条都不匹配 —— 而预设面板里固定有十来个锁死条目（用户真机反馈「点了没反应也没提示」）。 */
  const disabledRules = rules.filter(r => splitSel(r.sel).some(s => /\[disabled\]|:disabled/.test(s)));
  (disabledRules.length >= 2 ? ok : bad).push('锁死态 [disabled] 可见差别（' + disabledRules.length + ' 条规则，应 ≥2）');
  /* 两端适配：手机档媒体查询（其余七套皮肤都有，缺了就是只在 PC 上成立） */
  const phoneMedia = [...code.matchAll(/@media[^{]*max-width[^{]*\{/g)].map(m => m[0].trim());
  (phoneMedia.length ? ok : bad).push('手机档 @media (max-width)（命中 ' + phoneMedia.length + '）');

  /* 8 · effects / params / skin.json 字段 */
  for (const f of (meta.effects || [])) {
    const hit = code.includes('data-kami-effects~=' + DQ + f.id + DQ) || code.includes('data-kami-effects~=' + SQ + f.id + SQ);
    if (!hit) bad.push('特效 ' + f.id + ' 没有 data-kami-effects~= 规则');
    if (f.label && [...f.label].length > 8) bad.push('effects.' + f.id + '.label 超过 8 格：' + f.label);
    if (f.desc && [...f.desc].length > 60) bad.push('effects.' + f.id + '.desc 超过 60 格（' + [...f.desc].length + '）：' + f.desc);
  }
  for (const p of (meta.params || [])) {
    if (!CSS_UNITS.has(String(p.unit === undefined ? '' : p.unit))) bad.push('params.' + p.id + '.unit 不是合法 CSS 单位：' + JSON.stringify(p.unit));
    if (p.label && [...p.label].length > 8) bad.push('params.' + p.id + '.label 超过 8 格：' + p.label);
    if (p.group && [...p.group].length > 4) bad.push('params.' + p.id + '.group 超过 4 格：' + p.group);
    if (!/^--kami-/.test(String(p.token || ''))) bad.push('params.' + p.id + '.token 不是 --kami- 令牌：' + p.token);
    else if (!defined.has(p.token) && !code.includes('var(' + p.token)) {
      /* 既没在皮肤里定义、也没被 var() 消费 = 这颗滑杆拖了没有任何反应（历史真 bug：grokbot 的 breathe） */
      bad.push('params.' + p.id + '.token 皮肤自己既没定义、也没用 var() 消费（滑杆会没反应）：' + p.token);
    }
  }
  if (!meta.id || !meta.name || !meta.button) bad.push('skin.json 缺 id/name/button');
  if (meta.id !== id) bad.push('skin.json 的 id（' + meta.id + '）与目录名不一致');
  if (meta.css) bad.push('skin.json 里不该有 css 字段');
  if (!meta.tagline) bad.push('skin.json 缺 tagline');
  if (meta.name && [...meta.name].length > 8) bad.push('name 超过 8 格：' + meta.name);
  if (meta.button && [...meta.button].length > 4) bad.push('button 超过 4 格：' + meta.button);
  try { JSON.parse(fs.readFileSync(jp, 'utf8')); } catch (e) { bad.push('skin.json 不是合法 JSON：' + e.message); }

  for (const o of ok) console.log('  ok    ' + o);
  for (const w of warns) console.log('  warn  ' + w);
  for (const b of bad) console.log('  FAIL  ' + b);
  console.log('  -- ' + id + '：' + (bad.length ? bad.length + ' 项要处理' : '抽查全过') +
    '（' + Buffer.byteLength(css) + 'B，' + rules.length + ' 条规则，' + (meta.effects || []).length + ' 特效，'
    + (meta.params || []).length + ' 参数）');
  if (bad.length) hardFail++;
}
console.log(hardFail ? '\n' + hardFail + ' 套抽查不通过' : '\n抽查全部通过');
process.exit(hardFail ? 1 : 0);
