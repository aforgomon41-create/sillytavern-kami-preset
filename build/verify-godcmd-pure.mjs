#!/usr/bin/env node
/**
 * 「常驻附加指令」接线守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 为什么需要：这件功能横跨三处 ——
 *   ① 纯逻辑 src/scripts/_godcmd-pure.js（构建期内联进 35-提示词发送修改.js）；
 *   ② 35 号在「提示词已就绪」时把包块**原地**接到最后一条 user 消息末尾；
 *   ③ 面板那张卡在 40 号「🧰 其他功能」页，只读写全局变量 kami_god_cmd / kami_god_cmd_on。
 * 这三样任何一样漏了，构建都照样全绿：脚本护栏只 new Function 不执行；
 * 离线单测直接 import 源码、压根不看产物；面板少一张卡也不会报错。
 *
 * 用法：node build/verify-godcmd-pure.mjs <产物路径>
 *      （不传路径时自动挑 dist/ 里最新的 kami-*.json）
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
  if (!p) { console.error('用法：node build/verify-godcmd-pure.mjs <产物路径>（dist/ 里也没有产物）'); process.exit(2); }
}
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }

const preset = JSON.parse(fs.readFileSync(p, 'utf8'));
const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const wrap = scripts.find(s => String(s.name).indexOf('提示词发送修改') >= 0);
const panel = scripts.find(s => String(s.name).indexOf('预设设置') >= 0);
const wrapCode = String((wrap && wrap.content) || '');
const panelCode = String((panel && panel.content) || '');

let bad = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};

/* 断言必须看**代码**，不能看注释：源码里有句「不许写 data.chat = [...]」的警告注释，
   按字面量一匹配就误报。所以下面几条断言先剥掉注释再比。 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1');
}

console.log('=== 常驻附加指令接线验证（' + path.basename(p) + '） ===');

ok(!!wrap, '① 产物里有「提示词发送修改」脚本', wrap ? wrap.name : '没找到');
ok(!!panel, '① 产物里有「预设设置」脚本', panel ? panel.name : '没找到');

/* ② 纯逻辑模块的出口全在（内联漏了就只有真机用起来才炸） */
const FUNCS = ['buildGodCmdBlock', 'shouldInject', 'appendGodCmd'];
const missing = FUNCS.filter(f => wrapCode.indexOf('function ' + f + '(') < 0);
ok(missing.length === 0, '② 纯逻辑模块的函数都在产物里（' + FUNCS.length + ' 个）', missing.join('、') || '全在');
ok(wrapCode.indexOf('@@KAMI_GODCMD_PURE@@') < 0, '③ 35 号里 @@KAMI_GODCMD_PURE@@ 没有残留');
ok(!/^\s*export\s/m.test(wrapCode), '④ 产物里没有行首 export（内联规则生效）');

/* ⑤ 开关与正文走全局变量（跨脚本只能走全局，脚本变量各脚本一份） */
ok(wrapCode.indexOf('kami_god_cmd_on') >= 0 && wrapCode.indexOf('kami_god_cmd') >= 0,
  '⑤ 35 号读的是全局变量 kami_god_cmd / kami_god_cmd_on');
ok(panelCode.indexOf('kami_god_cmd_on') >= 0 && panelCode.indexOf('kami_god_cmd') >= 0,
  '⑤ 40 号那张卡读写的也是同一对全局变量');

/* ⑥ 注入挂在「提示词已就绪」上，且是原地改 content（用剥过注释的代码判断） */
const bareWrap = stripComments(wrapCode);
const barePanel = stripComments(panelCode);
ok(bareWrap.indexOf('CHAT_COMPLETION_PROMPT_READY') >= 0, '⑥ 35 号订阅了「提示词已就绪」');
ok(/\.content\s*=\s*next/.test(bareWrap), '⑥ 注入是原地改 content（不是整体替换 data.chat）');
ok(!/data\.chat\s*=/.test(bareWrap), '⑥ 源码里不许出现 data.chat = 整体替换（会静默失效）');
ok(/shouldInject\(/.test(wrapCode), '⑥ 注入前先问 shouldInject（最后一条必须是 user）');
ok(/appendGodCmd\(/.test(wrapCode), '⑥ 追加走 appendGodCmd（幂等，一轮派发两次不叠段）');

/* ⑦ 面板卡片：挂在「其他功能」页，默认折叠，用现成零件 */
ok(barePanel.indexOf('data-kami-godcmd-on') >= 0 && barePanel.indexOf('data-kami-godcmd-text') >= 0,
  '⑦ 面板有输入框与开关的钩子（data-kami-godcmd-*）');
ok(panelCode.indexOf('kami-collapse') >= 0, '⑦ 那张卡是折叠卡（contract §4.3 现成机制）');

console.log(bad ? ('★ 验证失败 ' + bad + ' 条') : '常驻附加指令接线验证全部通过（产物 ' + path.basename(p) + '）');
process.exit(bad ? 1 : 0);
