#!/usr/bin/env node
/**
 * 「思维链」接线守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 这一件功能横跨四处，任何一处漏掉构建都照样全绿：
 *   ① 纯切流模块 src/scripts/_cot-stream.js 必须真内联进 46-思维链.js；
 *   ② 管线必须注册在 order 15（20 号反截断 10 之后、40 号引用保护 20 之前）；
 *   ③ 消息落地必须真的写 extra.reasoning 并重画原生块；
 *   ④ 原生块美化必须保留 summary / 原生按钮，只挂 kami 骨架类。
 *
 * 用法：node build/verify-cot-stream.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json）
 */
import { flattenScriptTrees } from './kami-doc.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function newestProduct() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) { return null; }
  const files = fs.readdirSync(dir).filter(f => /^kami-.*\.json$/.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}

let p = process.argv[2];
if (!p) {
  p = newestProduct();
  if (!p) { console.error('用法：node build/verify-cot-stream.mjs <产物路径>（dist/ 里也没有产物）'); process.exit(2); }
}
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = flattenScriptTrees((preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || []);
const entry = scripts.find(s => String(s.name).indexOf('思维链') >= 0 && String(s.name).indexOf('🧪') < 0);
const code = String((entry && entry.content) || '');

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 思维链接线验证（' + path.basename(p) + '） ===');

ok(!!entry, '① 产物里有「思维链」脚本', entry ? entry.name : '没找到');
/* 2026-10-26：原先写死 13（原 12 + 思维链）。加了「🧩 运行库」后是 14。
   改成直接对 meta.json 的条数 —— 以后加脚本不用再来改这个数字，
   而「产物脚本数必须等于源码登记数」这个真正要守的不变式还在。 */
const metaCount = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'scripts', 'meta.json'), 'utf8')).length;
ok(scripts.length === metaCount, '① 运行脚本总数与 meta.json 一致（' + metaCount + ' 条）', String(scripts.length));
ok(code.indexOf('@@KAMI_COT_STREAM@@') < 0, '② 占位符 @@KAMI_COT_STREAM@@ 没有残留');
ok(code.indexOf('@@KAMI_RESPONSE_PIPELINE@@') < 0, '② 占位符 @@KAMI_RESPONSE_PIPELINE@@ 没有残留');
ok(code.indexOf('@@KAMI_RESPONSE_TRANSPORT@@') < 0, '② 占位符 @@KAMI_RESPONSE_TRANSPORT@@ 没有残留');
ok(code.indexOf('@@KAMI_TAG_RESPONSE@@') < 0, '② 占位符 @@KAMI_TAG_RESPONSE@@ 没有残留');
ok(code.indexOf('@@KAMI_UI@@') < 0, '② 占位符 @@KAMI_UI@@ 没有残留');
ok(!/^\s*export\s/m.test(code), '② 产物里没有行首 export（内联规则生效）');

/* 切流模块真的进来了 */
const FUNCS = ['createCotStream', 'newCotCollector', 'COT_OPEN', 'COT_CLOSE'];
const missing = FUNCS.filter(f => code.indexOf(f) < 0);
ok(missing.length === 0, '③ 切流模块进了产物（' + FUNCS.length + ' 个出口）', missing.join('、') || '全在');
ok(code.indexOf('COT_BUFFER_LIMIT') >= 0, '③ 缓冲上限在（超长内容不会无限吃内存）');
ok(code.indexOf('partial') >= 0, '③ 中止兜底保留 partial（流被切断时不丢字）');

/* 管线：order 15 + 请求过滤 + 原样放行 */
ok(code.indexOf("register('cot-move', 15") >= 0, '④ 管线注册在 order 15');
ok(code.indexOf('createTagReferenceResponse') >= 0 && code.indexOf('createKamiResponseTransport') >= 0,
  '④ 复用现成的方言适配器与传输层（不新写方言分支）');
ok(code.indexOf('_kami_background_task') >= 0 && code.indexOf('_kami_native_probe') >= 0 &&
  code.indexOf('should_silence') >= 0, '④ 后台/搜索/探针请求不接管');
ok(code.indexOf('body.n > 1') >= 0, '④ 多 swipe（n>1）不接管');
ok(code.indexOf('__kami_search_private_') >= 0, '④ 搜索私有消息不接管');
ok(code.indexOf('管线改写失败，原样放行') >= 0, '④ 解析失败原样放行，不污染响应');
ok(code.indexOf('reasoning_content') < 0, '④ 没有注入任何方言推理字段（用户要求不管方言）');

/* 消息落地：写 extra.reasoning + 重画 */
ok(code.indexOf('tavern_events.MESSAGE_RECEIVED') >= 0, '⑤ 挂在 MESSAGE_RECEIVED 上');
ok(code.indexOf('extra.reasoning') >= 0 && code.indexOf('reasoning_type') >= 0,
  '⑤ 写进 extra.reasoning（并补 reasoning_type）');
ok(code.indexOf('updateReasoningUI') >= 0 || code.indexOf('updateMessageBlock') >= 0,
  '⑤ 写回后重画原生块');
ok(code.indexOf('refresh: \'none\'') >= 0, '⑤ 写回不重画正文（正文已经干净）');
ok(code.indexOf('message_id: idx, message: cleanedMessage, extra: extra') >= 0,
  '⑤ 载荷带 message（只给 extra 会被助手当成 swipe 数据静默丢掉）');
ok(code.indexOf('.is_user') >= 0, '⑤ 用户楼层不碰');
ok(code.indexOf('raw.indexOf(COT_OPEN)') >= 0, '⑤ 管线没搬成时扫正文兜底');
ok(code.indexOf('takeStash') >= 0 && code.indexOf('STASH_TTL') >= 0,
  '⑤ 暂存有 TTL，过期不会串到下一楼');

/* 原生块美化：保留原生 summary / 按钮，只挂 kami 骨架 */
ok(code.indexOf('data-kami-native-think') >= 0, '⑥ 装饰标记在（data-kami-native-think）');
ok(code.indexOf('mes_reasoning_details') >= 0 && code.indexOf('mes_reasoning_summary') >= 0,
  '⑥ 原生 details / summary 保留');
ok(code.indexOf('mes_reasoning_actions') >= 0, '⑥ 原生编辑/删除/复制按钮保留');
ok(code.indexOf('kami-root') >= 0 && code.indexOf('kami-shell') >= 0 && code.indexOf('kami-surface') >= 0 &&
  code.indexOf('kami-collapse') >= 0, '⑥ 复用 think 的 kami 骨架类');
ok(code.indexOf("'data-kami-comp', 'think'") >= 0 && code.indexOf("'data-kami-container', 'native'") >= 0,
  '⑥ 身份复用 think + native 容器');
ok(code.indexOf("var rootWrap = el('div', 'kami-root')") >= 0 &&
  code.indexOf('details.parentNode.insertBefore(rootWrap, details)') >= 0,
  '⑥ 原生 details 外套一层 .kami-root（皮肤的后代选择器才能命中边框）');
ok(code.indexOf('kami-md') >= 0 && code.indexOf('kami-raw') >= 0 && code.indexOf('kami-seg') >= 0 &&
  code.indexOf('kami-sub') >= 0, '⑥ 渲染/原文、字数、分段控件都在');
ok(code.indexOf('data-kami-view') >= 0 && code.indexOf('data-kami-open') >= 0,
  '⑥ 双视图与折叠状态钩子在');
ok(code.indexOf('storedOpen') >= 0 && code.indexOf('OPEN_KEY') >= 0, '⑥ 折叠状态记忆在');
ok(code.indexOf('onHeadClick') >= 0, '⑥ 整条标题栏可点击（summary 默认切换被拦截后自翻转）');
ok(code.indexOf('makeCotStream') >= 0 && code.indexOf('updateStreamHint') >= 0 &&
  code.indexOf('collector.diverting') >= 0,
  '⑥ 流式搬运提示接在切流状态上');
ok(code.indexOf('data-kami-stream-hint') >= 0 && code.indexOf('奈亚子思考中') >= 0 &&
  code.indexOf('kami-cot-spin') >= 0,
  '⑥ 流式提示前端：奈亚子思考中 + 转圈');
ok(code.indexOf('hideStreamHint()') >= 0 && code.indexOf('finish: function') >= 0,
  '⑥ 提示在流结束/消息落地会收起');
ok(code.indexOf("el('div', 'kami-md')") >= 0, '⑥ 渲染内容有 kami-md 外壳（内边距由皮肤给）');
ok(code.indexOf('bar.appendChild(nativeActions)') >= 0, '⑥ 原生三按钮在渲染/原文行');
ok(code.indexOf('.mes_reasoning_header_block{flex:1 1 100%') >= 0,
  '⑥ 标题栏头部占满整行（字数才能右对齐）');

/* 注销零残留 */
ok(code.indexOf('pipelineRelease') >= 0 && code.indexOf('undressAll') >= 0 && code.indexOf('dropCss') >= 0,
  '⑦ 注销收回管线 / 装饰 / 样式');
ok(code.indexOf('delete HOST[API_NAME]') >= 0, '⑦ 注销删除全局 API');

/* 旧正则与老楼层兜底保持不动 */
const regexes = Array.isArray(preset.extensions && preset.extensions.regex_scripts) ? preset.extensions.regex_scripts : [];
const names = regexes.map(r => String(r.scriptName || ''));
ok(names.some(n => n.indexOf('前端|显式思维链') >= 0), '⑧ 旧的显式思维链 iframe 正则仍在（老楼层兜底）');
ok(names.some(n => n.indexOf('屏蔽|显式思维链') >= 0), '⑧ promptOnly 屏蔽正则仍在（兜底）');
ok(regexes.some(r => String(r.findRegex || '').indexOf('nyaruko_think') >= 0), '⑧ 正则表没有被本功能改动');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '思维链接线验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
