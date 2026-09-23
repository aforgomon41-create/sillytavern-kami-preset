/* lint-guide：引导结构层（50-引导.js 的 GUIDE_CSS）的跨层取色护栏。
 *
 * 为什么需要它（2026-09-23 用户真机报的 bug）：
 *   引导结构层**一个颜色都不自己定**，全靠读皮肤令牌。但皮肤允许在**组件元素自己身上**
 *   重定义 --kami-fg / --kami-bg 一族（empire / terminal / mileng 的
 *   `.kami-btn--primary{--kami-fg:var(--kami-accent-fg); background-color:var(--kami-accent)}`
 *   就是「整块强调底 + 底上的深色字」的标准写法，合法、不用改）。
 *   引导页脚那条墨块规则特异性最高、能压过皮肤，可它读的是 var(--kami-fg)：
 *   在同一个元素上取到的就是被换过的值，于是底 rgb(27,18,38) 配字 rgb(22,16,31) ——
 *   对比度 1.03，按钮在屏幕上等于不存在（统御 / 终端 / 冷凝三套）。
 *   修法是在**给底色的那一层**（`#kami-guide-panel .kami-drop`）先把令牌拍成快照
 *   （--kami-guide-ink / --kami-guide-paper），页脚只认快照。
 *
 * 这个护栏拦的就是「再退回去直接读」：
 *   GUIDE_CSS 里出现的每一次 `var(--kami-fg…)` / `var(--kami-bg…)`，所在行必须同时是快照行；
 *   另有白名单允许 --kami-fg-dim / --kami-fg-mute（次级文字令牌，读它们的都是文字元素，
 *   目前没有皮肤在这些元素上做元素级重定义 —— 真出现了就在这里登记并改成快照）。
 *   注释里也别写 `var(--kami-fg)` 字样，要提就写 --kami-fg。
 *
 * 用法：node build/lint-guide.mjs [脚本路径]
 * 退出码：0 通过；1 有违规。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FILE = process.argv[2] || join(ROOT, 'src/scripts/50-引导.js');

/* 危险令牌：只认「裸」的 --kami-fg / --kami-bg（后面紧跟逗号、右括号或空白）。
   --kami-fg-dim / --kami-fg-mute 不在此列（见文件头白名单说明）。 */
const RISKY = /var\(\s*--kami-(?:fg|bg)\s*[,)]/;
/* 快照行：同一行里落这两颗快照令牌，才允许出现危险令牌。 */
const SNAPSHOT = /--kami-guide-(?:ink|paper)\s*:/;

if (!existsSync(FILE)) {
  console.error('  [中止] 找不到引导脚本：' + FILE);
  process.exit(1);
}
const lines = readFileSync(FILE, 'utf8').split(/\r?\n/);
const bad = [];
let snapshots = 0;
lines.forEach((line, i) => {
  if (!RISKY.test(line)) { return; }
  if (SNAPSHOT.test(line)) { snapshots++; return; }
  bad.push({ n: i + 1, t: line.trim() });
});

/* 快照本身必须存在：少了它，页脚主键会退回「无皮肤时的黑白兜底色」而不是当前皮肤的面色。 */
const hasInk = lines.some(l => /--kami-guide-ink\s*:/.test(l));
const hasPaper = lines.some(l => /--kami-guide-paper\s*:/.test(l));

if (bad.length) {
  console.error('  [失败] 引导结构层里出现了「直接读皮肤面色令牌」的写法：');
  for (const b of bad) { console.error('    ' + FILE + ':' + b.n + '  ' + b.t); }
  console.error('  说明：这些令牌会被皮肤在组件元素上重定义（深底配深字 → 按钮隐形）。');
  console.error('        改法：在 `#kami-guide-panel .kami-drop` 上拍 --kami-guide-ink / --kami-guide-paper 快照，改读快照。');
  process.exit(1);
}
if (!hasInk || !hasPaper) {
  console.error('  [失败] 面板层面的墨色/纸色快照不见了（--kami-guide-ink / --kami-guide-paper）。');
  console.error('        页脚主键靠这两颗快照取当前皮肤的面色，缺了会退化成兜底黑白。');
  process.exit(1);
}
console.log('lint-guide 通过：跨层取色 ' + snapshots + ' 处全部走面板快照（--kami-guide-ink / --kami-guide-paper）。');
