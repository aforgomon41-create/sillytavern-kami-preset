/**
 * 卡密预设 · 正则前端文档展开器
 * ------------------------------------------------------------
 * ⚠️ 最重要的一条（踩过大坑）：
 *   酒馆 1.18 的正则引擎**不是** native String.replace，而是 public/scripts/extensions/regex/engine.js:419-445：
 *     rawString.replace(findRegex, function (match) { ...
 *       replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, ...)   // 只认 $n 与 $<name>
 *       ... return substituteParams(replaceWithGroups);          // 末尾还会跑宏替换
 *     })
 *   它**从不把 $$ 还原成 $**。所以这里：
 *     · 绝不能把正文的 $ 转义成 $$；
 *     · 只能保证模板里除了载荷标记 $1 之外没有别的 $n / $<name>；
 *     · 前端文档里不能出现 {{...}}（会被 substituteParams 当宏吃掉）。
 */
import fs from 'node:fs';
import path from 'node:path';

const PLACEHOLDER = '/* @@KAMI_BASE_CSS@@ */';
const PAYLOAD = '@@PAYLOAD@@';
const NL = String.fromCharCode(10);
const FENCE = String.fromCharCode(96, 96, 96);
const DOLLAR = String.fromCharCode(36);

export function frontendSource(root, name) {
  return fs.readFileSync(path.join(root, 'src', 'regex', 'frontend-' + name + '.html'), 'utf8');
}
export function baseCss(root) {
  return fs.readFileSync(path.join(root, 'src', 'skin', 'base.css'), 'utf8');
}

/** 统计 $n / $<name> 形式的占位个数（不用正则，避免转义问题） */
export function countPlaceholders(doc) {
  let n = 0;
  for (let i = 0; i < doc.length; i++) {
    if (doc[i] !== DOLLAR) { continue; }
    const next = doc[i + 1];
    if (next === undefined) { continue; }
    if (next >= '0' && next <= '9') { n++; }
    else if (next === '<') { n++; }
  }
  return n;
}

/** 统计 {{...}} 形式的宏个数 */
export function countMacros(doc) {
  let n = 0;
  for (let i = 0; i < doc.length - 1; i++) {
    if (doc[i] === '{' && doc[i + 1] === '{') { n++; }
  }
  return n;
}

function assertClean(doc, name) {
  const marks = countPlaceholders(doc);
  if (marks !== 1) {
    throw new Error('前端 ' + name + ' 展开后含 ' + marks + ' 个 $n/$<name> 占位，应当只有载荷标记 $1 一个。' +
      '酒馆不会把 $$ 还原成 $，请在前端源码里避免出现 $ 后跟数字的写法。');
  }
  const macros = countMacros(doc);
  if (macros > 0) {
    throw new Error('前端 ' + name + ' 展开后含 ' + macros + ' 个 {{...}}，会被酒馆的 substituteParams 当宏替换掉。');
  }
}

/** 展开成【酒馆正则 replaceString】用的文本 */
export function expandForRegex(root, name) {
  let doc = frontendSource(root, name);
  doc = doc.replace(PLACEHOLDER, () => baseCss(root));
  doc = doc.split(PAYLOAD).join(DOLLAR + '1');
  assertClean(doc, name);
  return NL + FENCE + NL + doc + NL + FENCE;
}

/** 展开成【浏览器直接渲染】用的文档（供预览台 / 排障用） */
export function expandForPreview(root, name, payload) {
  let doc = frontendSource(root, name);
  doc = doc.replace(PLACEHOLDER, () => baseCss(root));
  doc = doc.split(PAYLOAD).join(payload == null ? '' : String(payload));
  return doc;
}

/* ────────────────────────────────────────────────────────────
 * 装饰模块（契约 §8）：皮肤声明、皮肤管理注入
 * 源文件 src/decor/<id>.js 是一段独立 IIFE；构建期把它变成一个字符串常量
 * 内联进脚本，运行时由皮肤管理用 <script> 注入到酒馆页面与每个消息 iframe。
 * ──────────────────────────────────────────────────────────── */
export const DECOR_MARK = '/* @@KAMI_DECOR_D20@@ */';

export function decorSource(root, id) {
  return fs.readFileSync(path.join(root, 'src', 'decor', id + '.js'), 'utf8');
}

/** 把脚本源码里的装饰占位换成 var D20_SRC = "...";（没有占位就原样返回） */
export function expandDecor(root, code) {
  if (code.indexOf(DECOR_MARK) < 0) { return code; }
  const src = decorSource(root, 'd20');
  /* 函数式替换：替换文本里的美元号不会被当成 $& / $1 之类的引用 */
  return code.replace(DECOR_MARK, () => 'var D20_SRC = ' + JSON.stringify(src) + ';');
}

/* ────────────────────────────────────────────────────────────
 * 兜底皮肤（src/skin/base.css）：前端文档里的 @@KAMI_BASE_CSS@@ 是**CSS 注释**占位，
 * 直接替换成原文。但脚本里需要的是「一段可被 putStyle 用的字符串」，
 * 所以另开一个通道：脚本源码里写 BASE_CSS_JS_MARK 这个占位（一条块注释），
 * 构建期换成 var 名字 = "<base.css 原文>";（未写占位就原样返回）。
 * 与前端用**同一份** base.css，不手抄，避免两处维护。
 * ──────────────────────────────────────────────────────────── */
export const BASE_CSS_JS_MARK = '/* @@KAMI_BASE_CSS_JS@@ */';

/** 把脚本源码里的兜底皮肤占位换成 var <varName> = "<base.css>"; */
export function expandBaseCssJs(root, code, varName) {
  if (code.indexOf(BASE_CSS_JS_MARK) < 0) { return code; }
  const name = varName || 'KAMI_BASE_CSS';
  /* 函数式替换：替换文本里的美元号不会被当成 $& / $1 之类的引用 */
  return code.replace(BASE_CSS_JS_MARK, () => 'var ' + name + ' = ' + JSON.stringify(baseCss(root)) + ';');
}

/* ────────────────────────────────────────────────────────────
 * 预设结构解析器（test/harness/preset-parse.mjs）：纯函数、零 import，
 * 文件头就写明「可直接被浏览器面板脚本复用」。面板要按同一套规则解析当前预设，
 * 所以构建期把它的**源码**内联进脚本，而不是手抄一份（两个真相源必然漂移）。
 * 它用的是 ESM 的 export 声明，这里只把**行首**的 export 前缀去掉，
 * 声明就落在脚本 IIFE 内部（const / function 都是局部）。
 * ──────────────────────────────────────────────────────────── */
export const PRESET_PARSE_MARK = '/* @@KAMI_PRESET_PARSE@@ */';

export function presetParseSource(root) {
  const raw = fs.readFileSync(path.join(root, 'test', 'harness', 'preset-parse.mjs'), 'utf8');
  const lines = raw.split(NL);
  let stripped = 0;
  const out = lines.map(function (line) {
    if (line.slice(0, 7) === 'export ') { stripped++; return line.slice(7); }
    return line;
  });
  if (!stripped) { throw new Error('preset-parse.mjs 里没有找到 export 声明，内联规则需要同步更新'); }
  const left = out.filter(line => line.slice(0, 7) === 'export ');
  if (left.length) { throw new Error('preset-parse.mjs 里还有 ' + left.length + ' 行行首 export 没被去掉（可能缩进了）'); }
  if (out.join(NL).indexOf('import ') >= 0) { throw new Error('preset-parse.mjs 里出现了 import，不能再内联进脚本'); }
  return out.join(NL);
}

/** 把脚本源码里的解析器占位换成 preset-parse.mjs 的源码（已去掉行首 export） */
export function expandPresetParse(root, code) {
  if (code.indexOf(PRESET_PARSE_MARK) < 0) { return code; }
  return code.replace(PRESET_PARSE_MARK, () => presetParseSource(root));
}

/* ────────────────────────────────────────────────────────────
 * 面板手势共享模块（src/scripts/_panel-gestures.js）：两个面板脚本
 * （30-皮肤管理 / 40-预设设置）都要用同一套「标题栏下拉收回 / 滚到顶下拉收回 /
 * 左右滑切 tab」，所以和解析器一样，构建期把**源码**内联进脚本，只有一份真相。
 * 它也不是独立脚本：src/scripts/meta.json 里没有它，不会被组装成单独的 content。
 * 内联规则与 presetParseSource 完全一致：只去掉**行首**的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const PANEL_GESTURES_MARK = '/* @@KAMI_PANEL_GESTURES@@ */';

/** 把一段 ESM 源码去行首 export 变成可直接内联的普通声明 */
function inlineModuleSource(raw, label) {
  const lines = raw.split(NL);
  let stripped = 0;
  const out = lines.map(function (line) {
    if (line.slice(0, 7) === 'export ') { stripped++; return line.slice(7); }
    return line;
  });
  if (!stripped) { throw new Error(label + ' 里没有找到 export 声明，内联规则需要同步更新'); }
  const left = out.filter(line => line.slice(0, 7) === 'export ');
  if (left.length) { throw new Error(label + ' 里还有 ' + left.length + ' 行行首 export 没被去掉（可能缩进了）'); }
  if (out.join(NL).indexOf('import ') >= 0) { throw new Error(label + ' 里出现了 import，不能再内联进脚本'); }
  return out.join(NL);
}

export function panelGesturesSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_panel-gestures.js'), 'utf8');
  return inlineModuleSource(raw, '_panel-gestures.js');
}

/* ────────────────────────────────────────────────────────────
 * 预设卡片共享模块（src/scripts/_preset-cards.js）：模型卡 / 条目卡的结构
 * 只有一份实现，40-预设设置.js 与 50-引导.js 都内联它（两个脚本里各留一个占位注释）。
 * 与手势模块同一条内联规则：只去掉**行首**的 export 前缀。它也不是独立脚本
 * （src/scripts/meta.json 里没有它），不会被组装成单独的 content。
 * ──────────────────────────────────────────────────────────── */
export const PRESET_CARDS_MARK = '/* @@KAMI_PRESET_CARDS@@ */';

export function presetCardsSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_preset-cards.js'), 'utf8');
  return inlineModuleSource(raw, '_preset-cards.js');
}

/** 把脚本源码里的卡片占位换成 _preset-cards.js 的源码（已去掉行首 export）。
 *  占位不存在时原样返回（幂等）——build.mjs 与本模块的手势入口都会调它一次。
 *  ⚠️ 硬检查：模块源码里若出现占位符字面量（例如写在注释里），内联后会**自我复制**，
 *  第二次展开就把整份模块嵌进自己的注释里。撞上直接报错，不写坏产物。 */
export function expandPresetCards(root, code) {
  if (code.indexOf(PRESET_CARDS_MARK) < 0) { return code; }
  const src = presetCardsSource(root);
  if (src.indexOf(PRESET_CARDS_MARK) >= 0) {
    throw new Error('_preset-cards.js 里出现了自己的占位符 ' + PRESET_CARDS_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(PRESET_CARDS_MARK, () => src);
}

/** 面板共享模块的内联入口。
 *  ⚠️ 两件事一起做，别有疑问：build/build.mjs 与 test/harness/server.mjs 都只调用
 *  **这一个**函数名（两者的调用点不在本轮文件边界内），所以后来新增的共享模块
 *  （_preset-cards.js）挂在这里一起展开；两个占位符各自独立、互不影响，
 *  重复调用是幂等的（占位符已经被换掉就什么都不做）。 */
export function expandPanelGestures(root, code) {
  code = expandPresetCards(root, code);
  if (code.indexOf(PANEL_GESTURES_MARK) < 0) { return code; }
  return code.replace(PANEL_GESTURES_MARK, () => panelGesturesSource(root));
}

/* ────────────────────────────────────────────────────────────
 * 引导文案（design/copy/guide-copy.json）：唯一真相是文案表，
 * 构建期内联成对象字面量（GUIDE_COPY = {...};），脚本运行时缺键走自己的中性兜底。
 * 文件还不存在（首次构建前）就原样返回——脚本里 GUIDE_COPY 保持 null，构建不中断。
 * ──────────────────────────────────────────────────────────── */
export const GUIDE_COPY_MARK = '/* @@KAMI_GUIDE_COPY_JS@@ */';

export function expandGuideCopy(root, code) {
  if (code.indexOf(GUIDE_COPY_MARK) < 0) { return code; }
  const p = path.join(root, 'design', 'copy', 'guide-copy.json');
  if (!fs.existsSync(p)) {
    console.log('  [引导] 提示：design/copy/guide-copy.json 不存在，引导脚本先用内置中性文案。');
    return code;
  }
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
  return code.replace(GUIDE_COPY_MARK, () => 'GUIDE_COPY = ' + JSON.stringify(obj) + ';');
}

/** 把正则列表里的 @@FRONTEND:<name>@@ 占位展开 */
export function expandRegexList(root, list) {
  return list.map(function (r) {
    const rs = String(r.replaceString || '');
    if (rs.slice(0, 11) !== '@@FRONTEND:') { return r; }
    const name = rs.slice(11, -2);
    return Object.assign({}, r, { replaceString: expandForRegex(root, name) });
  });
}
