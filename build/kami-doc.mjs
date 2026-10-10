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

/* ────────────────────────────────────────────────────────────
 * 「只复制干净的正文」的取文本规则（src/scripts/_copy-clean.js）：
 * 💭 显式思维链前端 与 📄 正文外壳 各有一个复制按钮，两边必须是同一套规则 ——
 * 各写一份的话，改了一边忘了另一边，复制出来的东西就会两个前端不一样。
 * 前端那边（src/regex/frontend-*.html）没有别的共享模块机制，所以这里也一并展开。
 * 内联规则同其它模块：只去掉行首的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const COPY_CLEAN_MARK = '/* @@KAMI_COPY_CLEAN@@ */';

export function copyCleanSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_copy-clean.js'), 'utf8');
  return inlineModuleSource(raw, '_copy-clean.js');
}

/** 把源码里的复制取文本占位换成 _copy-clean.js 的源码（已去掉行首 export）。幂等。 */
export function expandCopyClean(root, code) {
  if (code.indexOf(COPY_CLEAN_MARK) < 0) { return code; }
  const src = copyCleanSource(root);
  if (src.indexOf(COPY_CLEAN_MARK) >= 0) {
    throw new Error('_copy-clean.js 里出现了自己的占位符 ' + COPY_CLEAN_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(COPY_CLEAN_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 「导出纯净正文」的纯逻辑（src/scripts/_export-clean.js）：楼层范围解析、role 前缀、
 * 换行与分隔、边界校验。内联进 40-预设设置.js 的 🧰 其他功能页。
 * 它拼文本时用的是 _copy-clean.js 的 tidyCopyText（与「复制」同一套换行规则），
 * 所以 40 号那边必须同时内联 _copy-clean.js —— 两个占位符得一起写。
 * ──────────────────────────────────────────────────────────── */
export const EXPORT_CLEAN_MARK = '/* @@KAMI_EXPORT_CLEAN@@ */';

export function exportCleanSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_export-clean.js'), 'utf8');
  return inlineModuleSource(raw, '_export-clean.js');
}

/** 把源码里的导出逻辑占位换成 _export-clean.js 的源码（已去掉行首 export）。幂等。 */
export function expandExportClean(root, code) {
  if (code.indexOf(EXPORT_CLEAN_MARK) < 0) { return code; }
  const src = exportCleanSource(root);
  if (src.indexOf(EXPORT_CLEAN_MARK) >= 0) {
    throw new Error('_export-clean.js 里出现了自己的占位符 ' + EXPORT_CLEAN_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(EXPORT_CLEAN_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 「远程更新」进度弹窗的纯逻辑（src/scripts/_update-progress.js）：
 * 阶段状态机 + 字节格式化 + 百分比。内联进 70-远程更新.js，IO 留在那边的薄壳里。
 * ──────────────────────────────────────────────────────────── */
export const UPDATE_PROGRESS_MARK = '/* @@KAMI_UPDATE_PROGRESS@@ */';

export function updateProgressSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_update-progress.js'), 'utf8');
  return inlineModuleSource(raw, '_update-progress.js');
}

/** 把源码里的更新进度占位换成 _update-progress.js 的源码（已去掉行首 export）。幂等。 */
export function expandUpdateProgress(root, code) {
  if (code.indexOf(UPDATE_PROGRESS_MARK) < 0) { return code; }
  const src = updateProgressSource(root);
  if (src.indexOf(UPDATE_PROGRESS_MARK) >= 0) {
    throw new Error('_update-progress.js 里出现了自己的占位符 ' + UPDATE_PROGRESS_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(UPDATE_PROGRESS_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 「状态栏前端」的纯逻辑（src/scripts/_status-view.js）：三行标题栏、模块开关默认值、
 * 字段自适应分类。内联进 80-状态栏.js，DOM / 拖拽 / 持久化留那边。
 * ──────────────────────────────────────────────────────────── */
export const STATUS_VIEW_MARK = '/* @@KAMI_STATUS_VIEW@@ */';

export function statusViewSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_status-view.js'), 'utf8');
  return inlineModuleSource(raw, '_status-view.js');
}

/** 把源码里的状态栏逻辑占位换成 _status-view.js 的源码（已去掉行首 export）。幂等。 */
export function expandStatusView(root, code) {
  if (code.indexOf(STATUS_VIEW_MARK) < 0) { return code; }
  const src = statusViewSource(root);
  if (src.indexOf(STATUS_VIEW_MARK) >= 0) {
    throw new Error('_status-view.js 里出现了自己的占位符 ' + STATUS_VIEW_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(STATUS_VIEW_MARK, () => src);
}

/** 展开成【酒馆正则 replaceString】用的文本 */
export function expandForRegex(root, name) {
  let doc = frontendSource(root, name);
  doc = doc.replace(PLACEHOLDER, () => baseCss(root));
  doc = expandCopyClean(root, doc);
  doc = doc.split(PAYLOAD).join(DOLLAR + '1');
  assertClean(doc, name);
  return NL + FENCE + NL + doc + NL + FENCE;
}

/** 展开成【浏览器直接渲染】用的文档（供预览台 / 排障用） */
export function expandForPreview(root, name, payload) {
  let doc = frontendSource(root, name);
  doc = doc.replace(PLACEHOLDER, () => baseCss(root));
  doc = expandCopyClean(root, doc);
  doc = doc.split(PAYLOAD).join(payload == null ? '' : String(payload));
  return doc;
}

/* ────────────────────────────────────────────────────────────
 * 装饰模块（契约 §8）：皮肤声明、皮肤管理注入
 * 源文件 src/decor/<id>.js 是一段独立 IIFE；构建期把它变成一个字符串常量
 * 内联进脚本，运行时由皮肤管理用 <script> 注入到酒馆页面与每个消息 iframe。
 * ──────────────────────────────────────────────────────────── */
export const DECOR_MARK = '/* @@KAMI_DECOR_D20@@ */';
/* d20 / d10 的占位符各自独立；expandDecor 只对**写了占位**的脚本展开对应通道
   （目前只有 30-皮肤管理.js 同时写两个占位 —— d10 源码只进皮肤管理脚本，不进前端）。 */
export const DECOR_D10_MARK = '/* @@KAMI_DECOR_D10@@ */';

export function decorSource(root, id) {
  return fs.readFileSync(path.join(root, 'src', 'decor', id + '.js'), 'utf8');
}

/** 把脚本源码里的装饰占位换成 var D20_SRC = "..."; / var D10_SRC = "...";（没有占位就原样返回） */
export function expandDecor(root, code) {
  if (code.indexOf(DECOR_MARK) >= 0) {
    const src = decorSource(root, 'd20');
    /* 函数式替换：替换文本里的美元号不会被当成 $& / $1 之类的引用 */
    code = code.replace(DECOR_MARK, () => 'var D20_SRC = ' + JSON.stringify(src) + ';');
  }
  if (code.indexOf(DECOR_D10_MARK) >= 0) {
    const src = decorSource(root, 'd10');
    code = code.replace(DECOR_D10_MARK, () => 'var D10_SRC = ' + JSON.stringify(src) + ';');
  }
  return code;
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

/* ────────────────────────────────────────────────────────────
 * 用户自定义文风 · 共享 UI 模块（src/scripts/_custom-style-ui.js）：
 * 整块（渲染 + 交互 + 状态机 + 文案）只有一份，40-预设设置.js 与 50-引导.js
 * 都内联它（两个脚本里各留一个占位注释）。规则与 _preset-cards.js 完全一致：
 * 只去掉**行首**的 export 前缀；它也不是独立脚本（meta.json 里没有它）。
 * ⚠️ 为什么不是"各写一份 UI"：_preset-cards.js 头部记着，同组件写两套已经丢过两次功能。
 * ──────────────────────────────────────────────────────────── */
export const CUSTOM_STYLE_UI_MARK = '/* @@KAMI_CUSTOM_STYLE_UI@@ */';

export function customStyleUiSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_custom-style-ui.js'), 'utf8');
  return inlineModuleSource(raw, '_custom-style-ui.js');
}

/** 把脚本源码里的自定义文风占位换成模块源码（已去掉行首 export）。
 *  占位不存在时原样返回（幂等）。与 expandPresetCards 同一条硬检查：
 *  模块源码里若出现自己的占位符字面量，内联后会自我复制，撞上直接报错。 */
export function expandCustomStyleUi(root, code) {
  if (code.indexOf(CUSTOM_STYLE_UI_MARK) < 0) { return code; }
  const src = customStyleUiSource(root);
  if (src.indexOf(CUSTOM_STYLE_UI_MARK) >= 0) {
    throw new Error('_custom-style-ui.js 里出现了自己的占位符 ' + CUSTOM_STYLE_UI_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(CUSTOM_STYLE_UI_MARK, () => src);
}

/** 面板共享模块的内联入口。
 *  ⚠️ 两件事一起做，别有疑问：build/build.mjs 与 test/harness/server.mjs 都只调用
 *  **这一个**函数名（两者的调用点不在本轮文件边界内），所以后来新增的共享模块
 *  （_preset-cards.js / _preset-merge.js / _custom-style-ui.js）都挂在这里一起展开；
 *  各个占位符彼此独立、互不影响，重复调用是幂等的（占位符已经被换掉就什么都不做）。 */
export function expandPanelGestures(root, code) {
  code = expandPresetCards(root, code);
  code = expandCustomStyleUi(root, code);
  code = expandPresetMerge(root, code);
  code = expandSummarizePure(root, code);
  code = expandTagsPure(root, code);
  code = expandGodCmdPure(root, code);
  code = expandCopyClean(root, code);
  code = expandExportClean(root, code);
  code = expandUpdateProgress(root, code);
  code = expandStatusView(root, code);
  code = expandIconStatus(root, code);
  code = expandIconsUi(root, code);
  /* ⚠️ 图标展开必须排在下面那条提前 return **之前**：
     @@KAMI_ICONS@@ 要进的是 30-皮肤管理.js（通用素材），而皮肤管理脚本里
     没有 @@KAMI_PANEL_GESTURES@@ 占位符 —— 挂在 return 之后的话，
     这个展开器对那份脚本永远不生效（实测踩到：30 号返回"展开不全"，
     于是整个预览台连带状态栏都装不进去）。 */
  if (code.indexOf(PANEL_GESTURES_MARK) < 0) { return code; }
  return code.replace(PANEL_GESTURES_MARK, () => panelGesturesSource(root));
}

/* ────────────────────────────────────────────────────────────
 * 状态栏（实验）的悬浮球图标（design/icon/kami-statusbar.png）：
 * 构建期内联成 data URI 常量。为什么不在脚本源码里直接贴 base64 ——
 * 一坨 6 万字符的字面量会让那份源码没法读、也没法 review，而且图标一换就得重贴；
 * 内联之后「图片文件的唯一真相」是 design/icon/ 里那张 PNG，脚本里只留一个占位注释。
 * 挂在手势入口里，于是 build/build.mjs 与 test/harness/server.mjs 两侧同时生效。
 * ──────────────────────────────────────────────────────────── */
export const ICON_STATUS_MARK = '/* @@KAMI_ICON_STATUS@@ */';
export const ICON_STATUS_FILE = 'kami-statusbar.png';

export function iconStatusDataUri(root) {
  const p = path.join(root, 'design', 'icon', ICON_STATUS_FILE);
  if (!fs.existsSync(p)) {
    throw new Error('找不到悬浮球图标：design/icon/' + ICON_STATUS_FILE +
      '（它是构建期内联的唯一真相，缺了产出的脚本就只剩一个空 img）');
  }
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}

/** 把脚本里的图标占位换成 data URI 常量。占位不存在时原样返回（幂等）。 */
export function expandIconStatus(root, code) {
  if (code.indexOf(ICON_STATUS_MARK) < 0) { return code; }
  const src = iconStatusDataUri(root);
  if (src.indexOf(ICON_STATUS_MARK) >= 0) {
    throw new Error('图标 data URI 里出现了占位符字面量（不可能，但拦住为妙）');
  }
  return code.replace(ICON_STATUS_MARK, () => 'var ICON_STATUS = ' + JSON.stringify(src) + ';');
}

/* ────────────────────────────────────────────────────────────
 * 状态栏 RPG 界面的图标集（design/icons/*.svg）：构建期内联成一张表。
 *
 * 为什么走内联而不是把 SVG 贴进源码：
 *   · 35 枚图标、每枚 400–700 字节，贴进去源码里就是两万多字符的路径串，没人 review 得动；
 *   · 图标的唯一真相是 design/icons/ 里那些 .svg（从 Tabler Icons 取的，MIT，见该目录 LICENSE）；
 *   · 各前端运行时只读一张紧凑表 ICON_SVG（**只存 viewBox 与 path 的 d**，
 *     外壳每次现拼），所以**图标颜色天然吃 currentColor**，18 套皮肤零改动就能染色。
 *
 * 表的结构：{ 名字: { vb:'0 0 24 24', d:['M…','M…'] } }
 * 多路径图标（grip / backpack / flask / key / cards / horse / weight 等）逐条保留，
 * 少了任何一条都会画成残缺图形。非 path 元素（Tabler 有个别图标带 <circle>）也收进来，
 * 否则那枚图标会缺一块。任何一枚图标解析不出路径就直接报错中止构建 —— 宁可构建失败，
 * 也不要静默产出一张空白图标（"空白球"那个坑已经踩过一次）。
 * ──────────────────────────────────────────────────────────── */
export const ICONS_UI_MARK = '/* @@KAMI_ICONS@@ */';
export const ICONS_UI_DIR = 'design/icons';

export function iconsUiTable(root) {
  const dir = path.join(root, ICONS_UI_DIR);
  if (!fs.existsSync(dir)) {
    throw new Error('找不到图标目录：' + ICONS_UI_DIR + '（构建期内联的唯一真相）');
  }
  const files = fs.readdirSync(dir).filter(f => /\.svg$/i.test(f)).sort();
  if (!files.length) { throw new Error(ICONS_UI_DIR + ' 里一个 .svg 都没有'); }
  const out = {};
  for (const f of files) {
    const name = f.replace(/\.svg$/i, '');
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const vb = (/viewBox\s*=\s*"([^"]+)"/.exec(raw) || [])[1];
    if (!vb) { throw new Error('图标缺 viewBox：' + f); }
    const paths = [], shapes = [];
    const re = /<(path|circle|rect|line|polyline|polygon)\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(raw))) {
      const tag = m[1], attrs = m[2];
      const d = (/\bd\s*=\s*"([^"]+)"/.exec(attrs) || [])[1];
      if (tag === 'path') {
        if (!d) { continue; }
        /* 丢掉整幅背景矩形（game-icons 那类图标会带一条 M0 0h24v24H0z） */
        if (/^M0 0h(24|512)v(24|512)H0z?$/i.test(d.trim())) { continue; }
        paths.push(d);
      } else {
        /* 其余形状：保留标签与它的几何属性（去掉 fill/stroke 之类会跟 currentColor 打架的） */
        const keep = attrs.replace(/\b(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)\s*=\s*"[^"]*"/g, '').trim();
        shapes.push(tag + (keep ? ' ' + keep : ''));
      }
    }
    if (!paths.length && !shapes.length) { throw new Error('图标解析不出任何图形：' + f); }
    out[name] = { vb: vb, d: paths };
    if (shapes.length) { out[name].s = shapes; }
  }
  return out;
}

/** 把脚本里的图标占位换成内联表。占位不存在时原样返回（幂等）。 */
export function expandIconsUi(root, code) {
  if (code.indexOf(ICONS_UI_MARK) < 0) { return code; }
  const table = iconsUiTable(root);
  return code.replace(ICONS_UI_MARK, () => 'var ICON_SVG = ' + JSON.stringify(table) + ';');
}

/* ────────────────────────────────────────────────────────────
 * 压缩脚本的纯逻辑（src/scripts/_summarize-pure.js）：摘要响应解析器 +
 * 世界书对账器。挂在手势入口里，于是 build/build.mjs 与 test/harness/server.mjs
 * 两侧同时生效；离线单测（test/harness/summarize-pure.mjs）直接 import 那份源码。
 * 内联规则同上：只去掉行首的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const SUMMARIZE_PURE_MARK = '/* @@KAMI_SUMMARIZE_PURE@@ */';

export function summarizePureSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_summarize-pure.js'), 'utf8');
  return inlineModuleSource(raw, '_summarize-pure.js');
}

/** 把脚本源码里的纯逻辑占位换成 _summarize-pure.js 的源码（已去掉行首 export）。
 *  占位不存在时原样返回（幂等）。硬检查：模块源码里若出现占位符字面量，内联会自我复制。 */
export function expandSummarizePure(root, code) {
  if (code.indexOf(SUMMARIZE_PURE_MARK) < 0) { return code; }
  const src = summarizePureSource(root);
  if (src.indexOf(SUMMARIZE_PURE_MARK) >= 0) {
    throw new Error('_summarize-pure.js 里出现了自己的占位符 ' + SUMMARIZE_PURE_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(SUMMARIZE_PURE_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 「自动标签处理」的纯逻辑（src/scripts/_tags-pure.js）：认出未闭合的标签、决定往哪儿补、
 * 或者把配不上对的标签删掉。内联进 40-预设设置.js（面板那一页要用），同样挂在手势入口里，
 * 构建与预览台两侧同时生效；离线单测（test/harness/tags-pure.mjs）直接 import 那份源码。
 * 内联规则同上：只去掉行首的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const TAGS_PURE_MARK = '/* @@KAMI_TAGS_PURE@@ */';

export function tagsPureSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_tags-pure.js'), 'utf8');
  return inlineModuleSource(raw, '_tags-pure.js');
}

/** 把脚本源码里的标签逻辑占位换成 _tags-pure.js 的源码（已去掉行首 export）。幂等。 */
export function expandTagsPure(root, code) {
  if (code.indexOf(TAGS_PURE_MARK) < 0) { return code; }
  const src = tagsPureSource(root);
  if (src.indexOf(TAGS_PURE_MARK) >= 0) {
    throw new Error('_tags-pure.js 里出现了自己的占位符 ' + TAGS_PURE_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(TAGS_PURE_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 「常驻附加指令」的纯逻辑（src/scripts/_godcmd-pure.js）：把用户那段话包成 <god>…</god>、
 * 判断最后一条是不是 user、幂等地接到正文末尾。内联进 35-提示词发送修改.js（面板那张卡
 * 只读写全局变量，不碰这套逻辑），同样挂在手势入口里，构建与预览台两侧同时生效；
 * 离线单测（test/harness/godcmd-pure.mjs）直接 import 那份源码。
 * 内联规则同上：只去掉行首的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const GODCMD_PURE_MARK = '/* @@KAMI_GODCMD_PURE@@ */';

export function godcmdPureSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_godcmd-pure.js'), 'utf8');
  return inlineModuleSource(raw, '_godcmd-pure.js');
}

/** 把脚本源码里的附加指令逻辑占位换成 _godcmd-pure.js 的源码（已去掉行首 export）。幂等。 */
export function expandGodCmdPure(root, code) {
  if (code.indexOf(GODCMD_PURE_MARK) < 0) { return code; }
  const src = godcmdPureSource(root);
  if (src.indexOf(GODCMD_PURE_MARK) >= 0) {
    throw new Error('_godcmd-pure.js 里出现了自己的占位符 ' + GODCMD_PURE_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(GODCMD_PURE_MARK, () => src);
}

/* ────────────────────────────────────────────────────────────
 * 三方合并引擎（src/scripts/_preset-merge.js）：远程更新（70）合并新版预设、
 * 预设设置（40）裁决 UI 都要用同一套「以用户为准」的合并口径，所以和卡片构建器
 * 一样构建期内联，只有一份真相。内联规则同上：只去掉行首的 export 前缀。
 * ──────────────────────────────────────────────────────────── */
export const PRESET_MERGE_MARK = '/* @@KAMI_PRESET_MERGE@@ */';

export function presetMergeSource(root) {
  const raw = fs.readFileSync(path.join(root, 'src', 'scripts', '_preset-merge.js'), 'utf8');
  return inlineModuleSource(raw, '_preset-merge.js');
}

/** 把脚本源码里的合并引擎占位换成 _preset-merge.js 的源码（已去掉行首 export）。
 *  占位不存在时原样返回（幂等）。硬检查：模块源码里若出现占位符字面量，内联会自我复制。 */
export function expandPresetMerge(root, code) {
  if (code.indexOf(PRESET_MERGE_MARK) < 0) { return code; }
  const src = presetMergeSource(root);
  if (src.indexOf(PRESET_MERGE_MARK) >= 0) {
    throw new Error('_preset-merge.js 里出现了自己的占位符 ' + PRESET_MERGE_MARK +
      '（内联会自我复制）：请在注释里避开这串字面量');
  }
  return code.replace(PRESET_MERGE_MARK, () => src);
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
