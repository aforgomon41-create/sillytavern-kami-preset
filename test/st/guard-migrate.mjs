// 「🛡 防护」接手旧「反截断」的开关（真实酒馆）：
//   node test/st/guard-migrate.mjs [--mobile]
// 前提：测试酒馆在跑、装了当前构建。防护沿用旧反截断的脚本 ID，升级后脚本变量原样带过来，
//   里面只有旧键 anti-truncation.enabled（2026-11-19 审计：以前只读新键，开着反截断的老用户升级后被悄悄关掉）。
// 做法：直接把脚本变量改成各种旧格式、刷新，看 KamiGuard 读出来的开关；测完还原。
//   A：只有旧键 anti-truncation.enabled=true → tool 开，旧键被删
//   B：旧键 enabled=true + 新键 tool=false（用户在新面板里关过）→ 以新键为准，旧键被删
//   C：旧键 enabled=false → tool 关
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const load = async () => { await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/'); await page.waitForFunction(() => window.KamiGuard && window.TavernHelper, null, { timeout: 90000 }); await page.waitForTimeout(4000); };
await load();
const sid = await page.evaluate(() => { const trees = window.TavernHelper.getScriptTrees({ type: 'preset' }); const all = trees.flatMap((n) => n.type === 'folder' ? n.scripts : [n]); const s = all.find((x) => /防护/.test(x.name)); return s && s.id; });
const before = await page.evaluate((id) => JSON.stringify(window.TavernHelper.getVariables({ type: 'script', script_id: id })), sid);
const vars = () => page.evaluate((id) => window.TavernHelper.getVariables({ type: 'script', script_id: id }), sid);
const setVars = async (v) => { await page.evaluate(([id, v]) => window.TavernHelper.replaceVariables(v, { type: 'script', script_id: id }), [sid, v]); await page.waitForTimeout(2500); };
const cases = [
  ['A 只有旧键且开着', { 'anti-truncation': { enabled: true } }, true],
  ['B 旧键开 + 新键关', { 'anti-truncation': { enabled: true }, 'kami-guard': { tool: false, noise: true } }, false],
  ['C 只有旧键且关着', { 'anti-truncation': { enabled: false } }, false],
];
for (const [label, v, want] of cases) {
  await setVars(v);
  await load();
  const g = await page.evaluate(() => ({ tool: window.KamiGuard.get().tool, noise: window.KamiGuard.get().noise, legacy: window.AntiTruncation && window.AntiTruncation.enabled }));
  ok(g.tool === want, label + '：工具调用反截断 = ' + want, g);
  ok(g.legacy === want, label + '：旧接口 AntiTruncation.enabled 一致', g.legacy);
  if (label.startsWith('B')) ok(g.noise === true, label + '：新键里的其它设置保留', g.noise);
  await page.waitForTimeout(2000);
  const after = await vars();
  ok(!('anti-truncation' in after) && 'kami-guard' in after, label + '：旧键已删、新键已写', Object.keys(after));
  await load();
  ok((await page.evaluate(() => window.KamiGuard.get().tool)) === want, label + '：再刷新一次仍然 = ' + want);
}
await page.evaluate(([id, v]) => window.TavernHelper.replaceVariables(JSON.parse(v), { type: 'script', script_id: id }), [sid, before]);
await page.waitForTimeout(2500);
console.log(fail ? '★ 失败 ' + fail + ' 项' : '「🛡 防护」旧开关迁移验证全部通过（' + pass + ' 项，' + (MOBILE ? '手机 390' : '电脑 1440') + '）');
await b.close(); process.exit(fail ? 1 : 0);
