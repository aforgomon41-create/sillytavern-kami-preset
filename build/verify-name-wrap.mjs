#!/usr/bin/env node
/**
 * 「角色名包裹」守卫（只读产物，不写任何东西）
 * ------------------------------------------------------------
 * 用户 2026-09-28 点名的功能：角色名外面包什么符号，要能一键切三档
 * （反引号 / 双下划线 / 无包裹），而且**不许每次切换都回去改一遍预设**。
 *
 * 落地方案 = 预设正文里名字一律写成显式标记 `<n>奈亚子</n>`，由 35 号脚本在
 * 「提示词已就绪」那一刻按当前档位换成真符号。所以这里守的是四件事：
 *   ① 数据：24 个角色名不许再有反引号包裹的残留（标志该迁移的没迁移干净）；
 *   ② 数据：`<n>` 标记配平，且**文生图条目里一个都不能有**
 *      （那条产出的 tags 会被别的插件用正则抓走当绘图提示词，混进包裹符号是灾难）；
 *   ③ 规范：「📌 输出规范」第 4 条必须是变量驱动 + `<n>` 示例，措辞与示例才不会打架；
 *   ④ 代码：35 号订阅了那个事件、三档齐全、有文生图保护；40/50 两处入口都还在。
 *
 * 用法：node build/verify-name-wrap.mjs <产物路径>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const p = process.argv[2];
if (!p) { console.error('用法：node build/verify-name-wrap.mjs <产物路径>'); process.exit(2); }
if (!fs.existsSync(p)) { console.error('找不到产物：' + p); process.exit(2); }
const preset = JSON.parse(fs.readFileSync(p, 'utf8'));

const BT = String.fromCharCode(96);
const prompts = preset.prompts || [];
const textOf = (e) => String((e && e.content) || '');
const allText = prompts.map(textOf).join('\n');

/* 已迁移的 24 个角色名（迁移脚本 .audit/wrap-marker-migrate.mjs 里的同一份名单） */
const NAMES = ['奈亚子', '林冲', '陆沉', '王陆', '诸葛雷', '阿撒托斯', '艾莉亚', '白术', '王舞', '宁缺',
  '千反田', '折木', '李寻欢', '陆谦', '卡恩', '她', '桑桑', '朝小树', '桐乃', '阿库娅', '常陆茉子', '古河渚', '沙耶', '富安'];

let bad = 0, warnN = 0;
const ok = (cond, label, extra) => {
  if (!cond) { bad++; }
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (extra === undefined ? '' : '  ← ' + extra));
};
const note = (label) => { warnN++; console.log('NOTE  ' + label); };

console.log('=== 角色名包裹验证（' + path.basename(p) + '） ===');

/* ① 数据：不许再有反引号包裹的角色名残留 */
const left = NAMES.filter(n => allText.indexOf(BT + n + BT) >= 0);
ok(left.length === 0, '① 24 个角色名都没有反引号残留（该迁移的都迁移了）', left.join('、') || '干净');

/* ①b 反面提示（不算失败）：还有没有「长得像角色名」的反引号片段没迁移。
   这里只提醒不拦 —— `行动` `性格` 这类枚举值本来就该是反引号，硬拦会天天误报。 */
const BAD = /[\s<>{}\|\\\/*_#\[\]()="'&;~$%^,:.+\-！？。，、；：（）【】「」…—]/;
const held = new Set();
for (const m of allText.match(new RegExp(BT + '([^' + BT + '\\n]*)' + BT, 'g')) || []) {
  const inner = m.slice(1, -1);
  if (!inner || inner.length > 16 || BAD.test(inner) || !/[\u4e00-\u9fff]/.test(inner)) { continue; }
  held.add(m);
}
if (held.size) {
  note('还有 ' + held.size + ' 个「短中文」反引号片段没迁移，若不是枚举值/字段名就该改成 <n>：' + [...held].join(' '));
}

/* ② 数据：<n> 标记配平 */
const open = (allText.match(/<n>/g) || []).length;
const close = (allText.match(/<\/n>/g) || []).length;
ok(open > 0 && open === close, '② <n> 与 </n> 数量相等（配平）', open + ' / ' + close);
ok(!/<n>[^<]*<n>/.test(allText), '② 没有嵌套的 <n>（嵌套会让替换错位）');
const marked = new Set((allText.match(/<n>[^<]*<\/n>/g) || []).map(s => s.slice(3, -4)));
/* 「角色名」是输出规范第 4 条格式行里的**通用占位示范**，不是某个具体角色，单独放行 */
const PLACEHOLDER = '角色名';
const real = [...marked].filter(n => n !== PLACEHOLDER);
ok(real.length === NAMES.length, '② 标记覆盖了全部 ' + NAMES.length + ' 个角色名', real.length + ' 个');
const unknown = real.filter(n => NAMES.indexOf(n) < 0);
ok(unknown.length === 0, '② 没有名单外的名字被标记（防迁移脚本误伤）', unknown.join('、') || '干净');
ok(marked.has(PLACEHOLDER), '② 输出规范里那个通用占位示范「' + PLACEHOLDER + '」还在', marked.has(PLACEHOLDER) ? '在' : '没了');

/* ②b 文生图条目：一个标记都不许有（用户点名） */
const img = prompts.filter(e => /文生图/.test(String(e.name || '')));
ok(img.length > 0, '② 产物里能找到文生图条目', img.map(e => e.name).join('、'));
const imgDirty = img.filter(e => textOf(e).indexOf('<n>') >= 0);
ok(imgDirty.length === 0, '② 文生图条目里没有 <n> 标记（那条要被别的插件抓 tags）', imgDirty.map(e => e.name).join('、') || '干净');

/* ③ 规范：第 4 条必须变量驱动 + 用 <n> 做示例 */
const rules = prompts.find(e => String(e.name || '').indexOf('输出规范') >= 0);
const rc = textOf(rules);
ok(rc.indexOf('{{getglobalvar::kami_name_wrap_rule}}') >= 0, '③ 输出规范第 4 条读的是档位变量（切换时措辞跟着变）');
ok(rc.indexOf('格式：<n>角色名</n>') >= 0, '③ 第 4 条的「格式」行用的是 <n> 标记（会被一起替换，不会自相矛盾）');
ok(rc.indexOf('所有出现的角色名必须使用反引号包裹') < 0, '③ 第 4 条里没有写死「必须使用反引号包裹」');

/* ④ 代码：35 号 */
const scripts = (preset.extensions && preset.extensions.tavern_helper && preset.extensions.tavern_helper.scripts) || [];
const wrap = scripts.find(s => String(s.name).indexOf('提示词发送修改') >= 0);
const wc = wrap ? String(wrap.content || '') : '';
ok(!!wrap, '④ 产物里有「✍️ 提示词发送修改」脚本', wrap ? wrap.name : '找不到');
ok(wrap && wrap.enabled !== false, '④ 它是开着的（默认关掉的话这功能就等于不存在）');
ok(wc.indexOf('tavern_events.CHAT_COMPLETION_PROMPT_READY') >= 0, '④ 订阅了「提示词已就绪」（真正干活的时机）');
['bt', 'ul', 'none'].forEach(id => {
  ok(new RegExp("id: '" + id + "'").test(wc), '④ 三档里有 ' + id);
});
ok(/open: '`'/.test(wc) && /open: '__'/.test(wc) && /open: ''/.test(wc), '④ 三档的包裹符号分别是反引号 / 双下划线 / 空');
ok(wc.indexOf('kami_name_wrap') >= 0 && wc.indexOf('kami_name_wrap_rule') >= 0, '④ 档位与措辞两个全局变量的名字对得上预设里那处引用');
ok(wc.indexOf('function syncVars') >= 0 && wc.indexOf('DEFAULT_MODE') >= 0, '④ 有「变量缺了就补默认档」的自愈（换设备/新账号不会读到空）');
ok(wc.indexOf('SKIP_MARK') >= 0 && wc.indexOf('<image_task>') >= 0, '④ 有文生图整条跳过的保护');

/* ④b 代码：30 号（皮肤面板「显示」卡的入口）与 50 号（引导入口）
   ⚠️ 2026-09-28 用户裁定：这一行从「🌟 预设设置」搬到了「🎨 皮肤管理面板 → 显示」那张卡，
   所以守的是 30 号，**同时守「40 号里不许再留一份」**（两处各长一份是这项目的常见病）。 */
const skin = String((scripts.find(s => String(s.name).indexOf('皮肤管理') >= 0) || {}).content || '');
ok(skin.indexOf('function nameWrapRow') >= 0, '④ 30 号里有「角色名样式」那一行的构造');
ok(/g\.appendChild\(nameWrapRow\(\)\)/.test(skin), '④ 它被挂进「显示」卡（不是写了不用）');
ok(skin.indexOf('KamiNameWrap') >= 0, '④ 皮肤面板走的是 35 号的 API（不是自己另写一份状态）');
ok(skin.indexOf("mk('span', 'kami-seg'") >= 0, '④ 右边用的是契约已登记的分段控件（零新增类名）');

const panel = String((scripts.find(s => String(s.name).indexOf('预设设置') >= 0) || {}).content || '');
ok(panel.indexOf('wrapCardEl') < 0 && panel.indexOf('KamiNameWrap') < 0,
  '④ 40 号（预设设置面板）里已经不留这一行了（搬家搬干净，不留第二份实现）');

const guide = String((scripts.find(s => String(s.name).indexOf('引导') >= 0) || {}).content || '');
ok(guide.indexOf('function buildSegRow') >= 0 && guide.indexOf('nameWrapTitle') >= 0, '④ 50 号引导页里有角色名样式那一块');

/* ④c 文案：guide-copy.json 的三条必须原样出现在产物里（文案只有一份真相）。
   注意比对方式：产物里内联的是 JSON 源码，正文里的换行是 `\n` 两个字符而不是真换行，
   所以两种形态都认（只认真换行会把带换行的那几条全判成不一致）。 */
const gc = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'copy', 'guide-copy.json'), 'utf8'));
['nameWrapTitle', 'nameWrapBody', 'nameWrapDegrade'].forEach(k => {
  const v = gc[k];
  const esc = typeof v === 'string' ? JSON.stringify(v).slice(1, -1) : '';
  const hit = typeof v === 'string' && v.length > 0 && (guide.indexOf(v) >= 0 || guide.indexOf(esc) >= 0);
  ok(hit, '④ 引导文案 ' + k + ' 与文案表一字不差');
});

/* ④d 用户裁定：引导页那句必须与皮肤面板那句**是同一句**（不要两套说法）。
   皮肤面板那句写在 30 号的 NAME_WRAP_NOTE 里，这里逐字比对。 */
const noteM = skin.match(/var NAME_WRAP_NOTE = '([^']*)'/);
const noteText = noteM ? noteM[1] : '';
ok(!!noteText, '④ 30 号里有那句共用说明（NAME_WRAP_NOTE）');
ok(noteText === gc.nameWrapBody, '④ 引导页那句与皮肤面板那句一字不差（用户点名要复用）',
  noteText === gc.nameWrapBody ? noteText : '皮肤面板「' + noteText + '」 vs 文案表「' + gc.nameWrapBody + '」');
ok(noteText.indexOf('立刻对新生成的回复生效') >= 0, '④ 那句里说清了「切换后什么时候生效」');

console.log('');
console.log(bad ? '★ 验证失败 ' + bad + ' 条' : '角色名包裹验证全部通过（产物 ' + path.basename(p) + '）' + (warnN ? '，另有 ' + warnN + ' 条提示' : ''));
process.exit(bad ? 1 : 0);
