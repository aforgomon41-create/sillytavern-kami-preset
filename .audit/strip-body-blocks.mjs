/* 一次性工具：把 15 套皮肤里「正文美化包裹层 [data-kami-comp="body"]」整段删掉，
 * 换上一行退役留痕。判据是机械的（两个标记行之间的整段），不靠手抄行号。
 *
 *   node .audit/strip-body-blocks.mjs          干跑：只报告
 *   node .audit/strip-body-blocks.mjs --apply  真删
 *
 * 归属：2026-09-27「删正文标签美化、改为美化消息楼层」那一轮，跑完即可删。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKINS = path.join(ROOT, 'src', 'skins');
const APPLY = process.argv.includes('--apply');

const HEAD = ' * · 正文美化包裹层 [data-kami-comp="body"]';
const NEXT = '/* ==== 全局层令牌上提';
const NOTE = [
  '/* ============================================================',
  ' * · 正文美化包裹层 [data-kami-comp="body"]（已退役，2026-09-27）',
  ' *   本节原样保留到 2026-09-26：给「只美化 <content> 标签内正文」包出来的',
  ' *   div.kami-root[data-kami-comp="body"] 上皮（容器底 / 描边 / 圆角 / 字色）。',
  ' *   那套功能已按用户裁定整体退役（改为直接在酒馆的消息楼层上做皮肤排版，',
  ' *   见 src/skin/tavern.css 第 ⑤ 段与契约 §9.8），包裹层不再产生，故本节删除。',
  ' *   消息楼层的容器（.mes）与正文排版都由全局层负责，皮肤包这边零维护。',
  ' * ============================================================ */',
].join('\r\n') + '\r\n';

let total = 0;
const ids = fs.readdirSync(SKINS).filter((d) => fs.existsSync(path.join(SKINS, d, 'skin.css')));

for (const id of ids) {
  const file = path.join(SKINS, id, 'skin.css');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\r\n');
  const hi = lines.findIndex((l) => l.startsWith(HEAD));
  if (hi < 0) { console.log(`[跳过] ${id}：没找到正文美化包裹层段`); continue; }
  /* 往上找本段开头的 /* ===== 注释框 */
  let start = hi;
  while (start > 0 && !lines[start].startsWith('/* ====')) { start -= 1; }
  /* 往下找下一个段（生成的令牌块标记；找不到就退到文件尾） */
  let end = lines.findIndex((l, i) => i > hi && l.startsWith(NEXT));
  if (end < 0) { end = lines.length; }
  const removed = end - start;
  const out = lines.slice(0, start).concat(NOTE.split('\r\n').slice(0, -1), lines.slice(end));
  total += removed;
  console.log(`${APPLY ? '[删]' : '[干跑]'} ${id}：第 ${start + 1}~${end} 行（${removed} 行）→ 1 行留痕`);
  if (APPLY) { fs.writeFileSync(file, out.join('\r\n'), 'utf8'); }
}
console.log(`${APPLY ? '已删除' : '将删除'}共 ${total} 行`);
