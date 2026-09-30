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
 * 这三样任何一样漏了，构建都照样全绿：脚本护栏只做 `new Function(code)` 不执行；
 * 离线单测直接 import 源码、压根不看产物；面板页少一栏也不会报错。
 *
 * 用法：node build/verify-tags-pure.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json，与 verify-frontends.mjs 同规矩）
 */
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
const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const entry = scripts.find(s => String(s.name).indexOf('预设设置') >= 0);
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
  'MakeImage', 'god'];
const lostTags = TAGS.filter(t => code.indexOf("tag: '" + t + "'") < 0);
ok(lostTags.length === 0, '⑤ 标签登记表与预设「🧩 标签格式」对齐（' + TAGS.length + ' 个）', lostTags.join('、') || '全在');

/* ⑥ 防误伤：HTML 卡片区必须排除（`<details><summary>` 被当成摘要块是调研点名的隐患） */
ok(code.indexOf("['medium', 'medium_content', 'details']") >= 0,
  '⑥ HTML 卡片区进了排除名单（medium / medium_content / details）');

/* ⑦ 面板页：新页排在「关于」前面，且三档与手动按钮都接上了 */
const iBox = code.indexOf("key: 'BOX'");
const iAbout = code.indexOf("key: 'ABOUT'");
ok(iBox >= 0 && iAbout >= 0, '⑦ 「🧰 其他功能」页与「关于」页都定义了');
if (iBox >= 0 && iAbout >= 0) {
  const iPushBox = code.indexOf('out.push(toolboxTab())');
  const iPushAbout = code.indexOf('out.push(aboutTab())');
  ok(iPushBox >= 0 && iPushAbout >= 0 && iPushBox < iPushAbout,
    '⑦ 其他功能排在关于**前面**（用户点名要的位置）');
}
ok(code.indexOf("special: 'toolbox'") >= 0 && code.indexOf("if (tab.special === 'toolbox')") >= 0,
  '⑦ 渲染分派接上了（special=toolbox → renderToolboxTab）');
ok(code.indexOf("data-kami-tagfix") >= 0 && code.indexOf('setTagFixMode(') >= 0,
  '⑦ 三档开关接上了（data-kami-tagfix → setTagFixMode）');
ok(code.indexOf("'tagfix-scan'") >= 0 && code.indexOf('tagFixScanAll') >= 0,
  '⑦ 手动「扫一遍当前聊天」接上了');

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

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '自动标签处理接线验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
