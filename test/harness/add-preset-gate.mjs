/* 一次性：把某个预设名同时加进「酒馆助手脚本放行名单」和「正则放行名单」，并先备份 settings.json。
   用法：node test/_scratch/add-gate.mjs <预设名>
   注意：酒馆运行时会用内存里的副本覆盖这个文件，所以改完必须立刻刷新酒馆页面。
   （正常流程是点酒馆弹出的两个确认框；这个脚本是"弹窗已经消耗掉、点不到了"时的手动兜底。）
   用完即删。 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const P = 'D:/sillytavern-software/SillyTavern Launcher GUI/data/st_data/default-user/settings.json';
const NAME = process.argv[2];
if (!NAME) { console.log('缺少预设名参数'); process.exit(1); }

copyFileSync(P, P + '.bak-before-gate');
const j = JSON.parse(readFileSync(P, 'utf8'));

const scriptList = j.extension_settings.tavern_helper.script.enabled.presets;
const regexList = j.extension_settings.preset_allowed_regex.openai;

const r = {};
for (const [tag, arr] of [['脚本', scriptList], ['正则', regexList]]) {
  const before = arr.length;
  const had = arr.indexOf(NAME) >= 0;
  if (!had) { arr.push(NAME); }
  r[tag] = { before, had, after: arr.length };
}

writeFileSync(P, JSON.stringify(j, null, 4), 'utf8');

const again = JSON.parse(readFileSync(P, 'utf8'));
const s2 = again.extension_settings.tavern_helper.script.enabled.presets;
const g2 = again.extension_settings.preset_allowed_regex.openai;
console.log('预设名: ' + NAME);
console.log('脚本名单: ' + r['脚本'].before + ' -> ' + s2.length + '  写入前已有=' + r['脚本'].had);
console.log('正则名单: ' + r['正则'].before + ' -> ' + g2.length + '  写入前已有=' + r['正则'].had);
console.log('复核：脚本里有=' + (s2.indexOf(NAME) >= 0) + '  正则里有=' + (g2.indexOf(NAME) >= 0));
console.log('备份: settings.json.bak-before-gate');
