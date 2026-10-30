#!/usr/bin/env node
/**
 * 「自动标签处理」接线守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 为什么需要：这一件功能横跨三处 ——
 *   ① 纯逻辑 src/scripts/_tags-pure.js（构建期内联进 40-预设设置.js）；
 *   ② 面板页「🧰 其他功能」排在「ℹ️ 关于」**前面**（用户点名要的位置）；
 *   ③ 自动那一条路要真挂在 MESSAGE_RECEIVED 上，而且监听器必须**返回 Promise**
 *      （酒馆的 emit 会 await 它，非流式回复才来得及在渲染前改完 —— 不返回就等于
 *       用户会先看到一版坏的、再跳成好的）。
 *   ④ 覆盖模式（用户 2026-10-01 点名「无论是什么标签都会处理」）：纯逻辑新出口、
 *      开关传参、面板接线、存读、文案、复用控件 —— 六样缺一不可（见 ⑩）。
 * 这三样任何一样漏了，构建都照样全绿：脚本护栏只做 `new Function(code)` 不执行；
 * 离线单测直接 import 源码、压根不看产物；面板页少一栏也不会报错。
 *
 * 用法：node build/verify-tags-pure.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json，与 verify-frontends.mjs 同规矩）
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
  if (!p) { console.error('用法：node build/verify-tags-pure.mjs <产物路径>（dist/ 里也没有产物）'); process.exit(2); }
}
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = flattenScriptTrees((preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || []);
const entry = scripts.find(s => String(s.name).indexOf('预设设置') >= 0 && String(s.name).indexOf('🧪') < 0);
const code = String((entry && entry.content) || '');

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

console.log('=== 自动标签处理接线验证（' + path.basename(p) + '） ===');

ok(!!entry, '① 产物里有「预设设置」脚本', entry ? entry.name : '没找到');

/* ② 纯逻辑模块的出口全在（内联漏了就只有真机点开那一页才炸） */
const FUNCS = ['repairTags', 'scanTags', 'tokenize', 'closeAt', 'describeFix', 'tagListText',
  'tagSpecOf', 'codeRanges', 'htmlRegions', 'skipRanges'];
const missing = FUNCS.filter(f => code.indexOf('function ' + f + '(') < 0);
ok(missing.length === 0, '② 纯逻辑模块的函数都在产物里（' + FUNCS.length + ' 个）', missing.join('、') || '全在');
ok(code.indexOf('@@KAMI_TAGS_PURE@@') < 0, '③ 占位符 @@KAMI_TAGS_PURE@@ 没有残留');
ok(!/^\s*export\s/m.test(code), '④ 产物里没有行首 export（内联规则生效）');

/* ⑤ 标签登记表：官方名单（预设条目「🧩 标签格式」）一个都不能少 */
const TAGS = ['out_body', 'introduction', 'content', 'appendix', 'think', 'nyaruko_think',
  'medium', 'medium_content', 'summary', 'char_setting', 'options', 'image', 'image_Tag',
  'MakeImage', 'god', 'search_results'];
const lostTags = TAGS.filter(t => code.indexOf("tag: '" + t + "'") < 0);
ok(lostTags.length === 0, '⑤ 标签登记表与预设「🧩 标签格式」对齐（' + TAGS.length + ' 个）', lostTags.join('、') || '全在');

/* ⑥ 防误伤：HTML 卡片区必须排除（`<details><summary>` 被当成摘要块是调研点名的隐患） */
ok(code.indexOf("['medium', 'medium_content', 'details']") >= 0,
  '⑥ HTML 卡片区进了排除名单（medium / medium_content / details）');

/* ⑦ 界面：2026-10-30 起「自动标签处理」卡由运行库的工具箱面板画（src/frontend/panels/toolbox-panel.tsx），
     经 40 号的工具桥（_tools-bridge.js）读写；40 号旧的 DOM 渲染与确认弹窗已删。 */
const tbx = fs.readFileSync(path.join(ROOT, 'src', 'frontend', 'panels', 'toolbox-panel.tsx'), 'utf8');
ok(!code.includes('out.push(toolboxTab())'), '⑦ 预设设置不再重复显示其他功能页');
ok(/setTagMode:\s*function \(id\) \{ setTagFixMode\(id\)/.test(code) && /api\.setTagMode\(/.test(tbx),
  '⑦ 三档开关接上了（新面板 → setTagMode → setTagFixMode）');
ok(/scanTag:\s*function/.test(code) && /applyTag:\s*async function/.test(code) && /api\.scanTag\(\)/.test(tbx) && /api\.applyTag\(/.test(tbx),
  '⑦ 手动「处理当前楼层」接上了（先扫 scanTag → 面板里确认 → applyTag 写）');
ok(/setTagCustom:\s*function \(text\) \{ var l = setTagFixCustom\(text\)/.test(code) && /api\.setTagCustom\(/.test(tbx),
  '⑦ 自定义标签输入框接上了');
ok(code.indexOf('specsWithCustom(tagFixCustom)') >= 0 && code.indexOf('parseCustomTags(') >= 0,
  '⑦ 自定义标签并进登记表（parseCustomTags → specsWithCustom）');
ok(code.indexOf('tagFixCustom: tagFixCustom.slice()') >= 0 && code.indexOf('saved[TAGFIX_CUSTOM_VAR]') >= 0,
  '⑦ 自定义标签存进脚本变量（读回来 + 写回去都在）');
/* ⑦-c 确认：先扫一遍、报这一次**实际会改**的条目（用户 2026-09-30 点名） */
ok(code.indexOf('describeChanges(res, 8)') >= 0, '⑦ 确认列表拼的是扫描结果（describeChanges），不是登记表');
ok(code.indexOf('TAGFIX_COPY.closeLead') >= 0 && code.indexOf('TAGFIX_COPY.removeLead') >= 0,
  '⑦ 确认里分「要补上的结尾 / 要删掉的标签」两组列条目');
ok(/p\.seq !== token/.test(code) && /tagFixSameChat\(p\.stamp/.test(code),
  '⑦ 写之前核对：确认期间楼层或聊天变了就不写');
ok(tbx.indexOf("T['strayNote']") >= 0 && /stray:/.test(code), '⑦ 有落单的结尾标签时在确认里说明没动它们');

/* ⑧ 自动那一条路：事件、Promise、写回、重画 */
ok(code.indexOf('tavern_events.MESSAGE_RECEIVED') >= 0, '⑧ 挂在 MESSAGE_RECEIVED 上');
ok(code.indexOf('return tagFixOnReceived(id)') >= 0,
  '⑧ 监听器把 Promise 返回给酒馆（emit 会 await，渲染前才来得及改完）');
ok(code.indexOf("refresh: 'affected'") >= 0, '⑧ 改完消息用 refresh:affected 重画那一楼');
ok(code.indexOf('{ message_id: idx, message: res.text }') >= 0, '⑧ 写回的是这条消息的正文');
ok(code.indexOf('m.is_user') >= 0, '⑧ 用户自己打的楼层不碰');
ok(code.indexOf("saved[TAGFIX_VAR]") >= 0 && code.indexOf('tagFix: tagFixMode') >= 0,
  '⑧ 档位存进脚本变量（读回来 + 写回去都在）');
ok(code.indexOf('unsubs.push({ stop: stop })') >= 0, '⑧ 注销时订阅会被收回（零残留）');

/* ⑨ 离线单测文件必须在（否则这份守卫会掩盖"纯逻辑没人测"） */
ok(fs.existsSync(path.join(ROOT, 'test', 'harness', 'tags-pure.mjs')),
  '⑨ 离线单测还在（test/harness/tags-pure.mjs）');

/* ⑩ 覆盖模式（用户 2026-10-01 点名「无论是什么标签都会处理」）：
      纯逻辑新出口 + 开关真的传进去 + 面板接线 + 存读 + 文案 + 复用控件，六样缺一不可。
      任何一样漏掉，构建都一样全绿：这功能是「静默失效」型的 —— 开关点得动、正文全不动。 */
ok(code.indexOf('HTML_TAGS') >= 0 && code.indexOf('isHtmlTag(') >= 0 && code.indexOf('coverSpec(') >= 0,
  '⑩ 覆盖模式的纯逻辑出口进了产物（HTML_TAGS / isHtmlTag / coverSpec）');
ok(code.indexOf("repairTags(safe.text, safe.stats.incomplete ? 'off' : m, tagFixSpecs(), tagFixAll)") >= 0,
  '⑩ 覆盖开关真的传进了纯逻辑（repairTags 的第 4 个参数）');
ok(code.includes("register('tag-references', 20") && code.includes('createTagReferenceResponse(createKamiResponseTransport(), createReasoningReferenceStream'),
  '⑩ 引用保护在响应交给酒馆前接入共享管线');
ok(code.includes('tagReferenceRelease(); tagReferenceRelease = null') && code.includes('protectReasoningReferences(text)'),
  '⑩ 关闭/注销移除自有处理器，后置手动处理复用同一保护器');
ok(/setTagAll:\s*function \(on\) \{ setTagFixAll\(on\)/.test(code) && /api\.setTagAll\(/.test(tbx),
  '⑩ 覆盖开关接上了（新面板 → setTagAll → setTagFixAll）');
ok(code.indexOf('saved[TAGFIX_ALL_VAR]') >= 0 && code.indexOf('tagFixAll: tagFixAll') >= 0,
  '⑩ 覆盖开关存进脚本变量（读回来 + 写回去都在）');
ok(tbx.indexOf("T['allHint']") >= 0,
  '⑩ 覆盖开关的说明文案被用上（allHint）');
ok(/<Switch checked=\{s\.tag\.all\}/.test(tbx),
  '⑩ 开关复用设计系统的 Switch 控件');
ok((code.match(/tagFixAll/g) || []).length >= 4,
  '⑩ 覆盖开关在产物里多处出现（状态 / 渲染 / 事件 / 存读，不是只写了个字符串）',
  '出现 ' + ((code.match(/tagFixAll/g) || []).length) + ' 次');

/* ⑩-b 中文标签名（2026-10-01 用户真机反馈「不会识别中文标签」）：
      字符集放开在**两处** —— tokenize 的正则与 parseCustomTags 的校验。
      只放一处就只有一半能用（正文认、输入框不认，或反过来），构建照样全绿。
      原先只认 [A-Za-z]，被改回去时这条立刻红。 */
const CN_NAME_CLASS = '[A-Za-z\\u4e00-\\u9fff\\u3400-\\u4dbf]';
ok(code.indexOf(CN_NAME_CLASS) >= 0,
  '⑩ 标签名认汉字（tokenize 正则的字符集含 \\u4e00-\\u9fff / \\u3400-\\u4dbf）');
ok((code.split(CN_NAME_CLASS).length - 1) >= 2,
  '⑩ 自定义标签输入框也放开汉字（两处字符集都在，防只放开一半）',
  '出现 ' + (code.split(CN_NAME_CLASS).length - 1) + ' 次');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '自动标签处理接线验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
