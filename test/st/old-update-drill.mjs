// 实机演练：已发布的 v0.92-100 用户，用**它自己的**「🔄 远程更新」更新到本支线构建（当作 main 发版的 v0.93-1）。
//   先装旧版：node test/st/install-preset.mjs mirror/kami-v0.92-100-20261021.json
//   再跑：    node test/st/old-update-drill.mjs <新构建 JSON> [--mobile]
// 拦网络：Releases 接口 500 → 走 jsDelivr 清单（@main 给新版 kami-v0.93-1-<日期>.json）；
//         按 tag 取 base 的清单 / 文件给 v0.92-100 原样；新版文件给传入的构建。其余 404。
// 步骤：旧预设里改温度（用户自己的设置）→ KamiUpdate.check(true) → 原生弹窗点「立即更新」→ 等写入
//      → 切到新预设（确认酒馆助手的启用脚本弹窗）→ 记录第一次载入 20 秒内的脚本树与新旧界面 → 刷新再核对。
// 收尾不自动清理（看完再删）：新预设、两份备份、旧版预设都留在测试酒馆里；复位用 test/st/old-update-reset.sh，再删旧版预设、装回当前构建。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const NEW_FILE = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!NEW_FILE) { console.error('用法：node old-update-drill.mjs <新构建 JSON> [--mobile]'); process.exit(2); }
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
/* --from=<mirror 里的已发布产物>：从哪一版升级（默认 v0.92-100；2026-11-12 起也演练 v0.93-8 → 新版） */
const OLD_FILE = (process.argv.find((a) => a.startsWith('--from=')) || '--from=kami-v0.92-100-20261021.json').slice(7);
const OLD_VER = /^kami-v(\d+\.\d+-\d+)-/.exec(OLD_FILE)[1];
const OLD_TEXT = fs.readFileSync(path.join(ROOT, 'mirror', OLD_FILE), 'utf8');
const NEW_TEXT = fs.readFileSync(NEW_FILE, 'utf8');
/* 新版名：从 v0.92 演练时当作「0.93 的第一个正式版」；从 0.93 起演练时就用新构建自己的名字（构建号一定比旧版大） */
const NEW_NAME = OLD_VER.startsWith('0.92') ? 'kami-v0.93-1-20261104' : path.basename(NEW_FILE, '.json');
const NEW_VER = /^kami-v(\d+\.\d+-\d+)-/.exec(NEW_NAME)[1];
const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) { pass++; console.log('PASS  ' + l); } else { fail++; console.log('FAIL  ' + l + (x === undefined ? '' : '  ← ' + JSON.stringify(x).slice(0, 600))); } };
const errors = [], logs = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
const T0 = Date.now();
page.on('console', (m) => { logs.push('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + m.type() + ': ' + m.text().slice(0, 300)); });
const LOG = process.env.DRILL_LOG || path.join(ROOT, '.cache/st-run/drill-log' + (MOBILE ? '-m' : '') + '.txt');
const SHOT = path.join(ROOT, '.cache/st-run/drill' + (MOBILE ? '-m' : ''));
fs.mkdirSync(SHOT, { recursive: true });
process.on('exit', () => { try { fs.writeFileSync(LOG, logs.join('\n')); } catch (e) { } });
const mark = (t) => logs.push('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ===== ' + t);
/* 全程记录旧界面有没有出现过（每次载入页面都装一份） */
await page.addInitScript(() => {
  const seen = window.__drillSeen = [];
  const t0 = performance.timeOrigin;
  const note = (k, v) => { const last = seen.filter((x) => x.k === k).pop(); if (!last || last.v !== v) { seen.push({ k, v, at: Math.round(t0 + performance.now()) }); } };
  const scan = () => {
    try {
      note('oldSkin', document.documentElement.getAttribute('data-kami-skin') || '');
      note('oldBody', document.querySelectorAll('#chat [data-kami-body-host]').length);
      note('oldPanel', [...document.querySelectorAll('body > .kami-root, body > div > .kami-root, [data-kami-comp="guide"], [data-kami-comp="skin"]')].filter((e) => e.getClientRects().length).length);
      note('oldStyle', document.querySelectorAll('style[id^="kami-"]:not([id^="kami-next"]), link[id^="kami-"]').length);
    } catch (e) { }
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-kami-skin', 'data-kami-body-host', 'class'] });
  document.addEventListener('DOMContentLoaded', scan);
});
const hits = [];
await page.route(/api\.github\.com|cdn\.jsdelivr\.net|githubusercontent\.com|github\.com\/.*\/releases\/download|purge\.jsdelivr/, (route) => {
  const u = decodeURIComponent(route.request().url()); hits.push(u.replace(/^https:\/\//, '').slice(0, 110));
  if (/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\?/.test(u)) { return route.fulfill({ status: 500, body: 'drill' }); }
  if (/@main\/mirror\/manifest\.json/.test(u)) { return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: NEW_VER, file: NEW_NAME + '.json', date: '2026-11-12', notes: '演练：v' + OLD_VER + ' 用户更新到 v' + NEW_VER }) }); }
  if (u.includes('@v' + OLD_VER + '/mirror/manifest.json') || u.includes('@' + OLD_VER + '/mirror/manifest.json')) { return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: OLD_VER, file: OLD_FILE }) }); }
  if (u.endsWith('/' + OLD_FILE)) { return route.fulfill({ status: 200, contentType: 'application/json', body: OLD_TEXT }); }
  if (u.endsWith('/' + NEW_NAME + '.json')) { return route.fulfill({ status: 200, contentType: 'application/json', body: NEW_TEXT }); }
  return route.fulfill({ status: 404, body: 'no' });
});
async function acceptPopups(ms, stop) {
  const until = Date.now() + ms; const seen = [];
  while (Date.now() < until) {
    if (stop && await stop()) { break; }
    /* 0.93 起更新询问与合并裁决是新前端的对话框（kami-layer 影子树里），不是酒馆的原生弹窗 */
    const kb = await page.evaluate(() => {
      const l = document.querySelector('kami-layer'); if (!l) { return null; }
      const btn = [...l.shadowRoot.querySelectorAll('button')].find((x) => /^(立即更新|应用并完成)$/.test(x.textContent.trim()) && x.getClientRects().length && !x.disabled);
      if (!btn) { return null; }
      const t = btn.textContent.trim(); btn.click(); return t;
    }).catch(() => null);
    if (kb) { seen.push('[新前端] ' + kb); await page.waitForTimeout(500); continue; }
    const th = page.locator('button:visible', { hasText: /^\s*确认\s*$/ }).first();
    if (await th.count()) { seen.push('[酒馆助手确认]'); await th.click().catch(() => {}); await page.waitForTimeout(500); continue; }
    const okb = page.locator('dialog[open] .popup-button-ok:visible, .popup:visible .popup-button-ok:visible').first();
    if (await okb.count()) {
      const text = (await page.locator('dialog[open] .popup-content, .popup:visible .popup-content').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90);
      seen.push(text); await okb.click().catch(() => {}); await page.waitForTimeout(500); continue;
    }
    await page.waitForTimeout(300);
  }
  return seen;
}
const tree = () => page.evaluate(() => window.TavernHelper.getScriptTrees({ type: 'preset' }).map((n) => n.type === 'folder' ? { f: n.name, s: n.scripts.map((x) => x.name + (x.enabled === false ? '(关)' : '')) } : { s: [n.name] }));
const flat = (t) => t.flatMap((n) => n.s);
const presetName = () => page.evaluate(() => window.SillyTavern.getContext().getPresetManager('openai').getSelectedPresetName());

/* ① 旧版：确认在 v0.92-100 上，改一个用户自己的设置 */
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForFunction(() => window.SillyTavern && window.TavernHelper && window.KamiUpdate && typeof window.KamiUpdate.check === 'function', null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
ok((await presetName()) === OLD_FILE.replace('.json', ''), '起点：当前预设是 v' + OLD_VER, await presetName());
/* 真实用户一般是在聊天里更新的：打开 Seraphina 那个长聊天 */
await page.evaluate(async () => { const ctx = window.SillyTavern.getContext(); if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); } });
await page.waitForTimeout(4000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
const oldUi = await page.evaluate(() => ({ msgs: document.querySelectorAll('#chat .mes').length, body: document.querySelectorAll('#chat [data-kami-body-host]').length, skin: document.documentElement.getAttribute('data-kami-skin') }));
console.log('  旧版界面：' + JSON.stringify(oldUi));
await page.screenshot({ path: SHOT + '/0-old.png' });
const t0 = await tree();
console.log('  旧版脚本树：' + JSON.stringify(t0));
await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); ctx.chatCompletionSettings.temp_openai = 0.73; const el = document.getElementById('temp_openai'); if (el) { el.value = '0.73'; el.dispatchEvent(new Event('input', { bubbles: true })); } });
await page.waitForTimeout(500);
await page.evaluate(() => { const btn = document.getElementById('update_oai_preset'); btn && btn.click(); });
await acceptPopups(3000);
await page.waitForTimeout(1500);

mark('② 检查更新');
/* ② 旧 70 号检查更新 → 原生弹窗 → 立即更新 → 写入 */
const checking = page.evaluate(() => window.KamiUpdate.check(true).then((r) => r && { action: r.action, error: r.error, merge: r.merge }).catch((e) => ({ action: 'throw', error: e.message })));
let result = null; checking.then((r) => { result = r; });
const seen = await acceptPopups(120000, async () => !!result);
await page.waitForTimeout(1000);
console.log('  处理的弹窗：' + JSON.stringify(seen));
console.log('  更新结果：' + JSON.stringify(result));
const wrote = logs.some((l) => /第 2 步 · 导入合并结果/.test(l)), planned = logs.filter((l) => /合并计划就绪/.test(l)).pop();
ok(wrote && !!planned, '旧 70 号做完三方合并并导入（' + (planned || '').replace(/^.*合并计划就绪：/, '') + '）', result);
const names = await page.evaluate(() => [...document.querySelectorAll('#settings_preset_openai option')].map((o) => o.textContent));
ok(names.includes(NEW_NAME), '新预设「' + NEW_NAME + '」写进了预设列表', names.filter((n) => /kami/.test(n)));
const PDIR = (process.env.ST_ROOT || '/workspace/st-test') + '/SillyTavern/data/default-user/OpenAI Settings';
ok(fs.existsSync(PDIR + '/' + OLD_FILE.replace('.json', '') + ' · 合并前备份.json'), '旧版先把原预设另存了「合并前备份」（磁盘上）');
const autoSwitched = await presetName();
console.log('  导入后当前预设：' + autoSwitched + (autoSwitched === NEW_NAME ? '（酒馆导入时自动切过去了）' : ''));

mark('③ 切换');
await page.screenshot({ path: SHOT + '/1-before-switch.png' });
/* ③ 切换到新预设：这才是第一次载入新脚本 */
await page.evaluate((n) => { const s = document.getElementById('settings_preset_openai'); const o = [...s.options].find((x) => x.textContent === n); s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }, NEW_NAME);
const timeline = [];
const t1 = Date.now();
const seen2 = [];
let shotN = 0;
while (Date.now() - t1 < 60000) {
  if (Date.now() - t1 > shotN * 6000) { await page.screenshot({ path: SHOT + '/2-switch-' + String(shotN).padStart(2, '0') + '.png' }).catch(() => {}); shotN++; }
  seen2.push(...(await acceptPopups(400)));
  const snap = await page.evaluate(() => {
    let names = [];
    try { names = window.TavernHelper.getScriptTrees({ type: 'preset' }).flatMap((n) => n.type === 'folder' ? n.scripts.map((x) => x.name + (x.enabled === false ? '(关)' : '')) : [n.name]); } catch (e) { }
    return {
      n: names.length, oldOn: names.filter((x) => /皮肤管理|正文外壳|引导 v0\.6|制作中/.test(x) && !/\(关\)/.test(x)),
      next: !!window.KamiRuntimeNext, fe: !!(window.KamiChatFrontend && window.KamiChatFrontend.active()),
      oldBody: document.querySelectorAll('#chat [data-kami-body-host]').length, oldSkin: document.documentElement.getAttribute('data-kami-skin'),
      oldGuide: !!document.querySelector('.kami-root[data-kami-comp="guide"], #kami-guide-root'), newLayer: !!document.querySelector('kami-layer'),
      dialogs: [...document.querySelectorAll('dialog[open] .popup-content')].map((d) => d.innerText.replace(/\s+/g, ' ').slice(0, 60))
    };
  });
  const key = JSON.stringify(snap);
  if (!timeline.length || timeline[timeline.length - 1].key !== key) { timeline.push({ ms: Date.now() - t1, key, snap }); }
  await page.waitForTimeout(300);
}
console.log('  切换后的弹窗：' + JSON.stringify(seen2));
console.log('  第一次载入 60 秒内的变化：');
timeline.forEach((x) => console.log('    +' + x.ms + 'ms ' + x.key));
const conflict = timeline.filter((x) => x.snap.oldBody > 0 || x.snap.oldGuide || x.snap.oldOn.length);
ok(conflict.length === 0, '第一次载入：旧脚本没有跑出界面（旧正文外壳 / 旧引导 / 旧皮肤管理）', conflict.slice(0, 3).map((x) => '+' + x.ms + ' ' + x.key));
const t2 = await tree();
console.log('  60 秒后的脚本树：' + JSON.stringify(t2));
const want = ['🧩 运行库 v2.0', '💬 消息前端 v1.0', '🎨 显示 v1.0', '🧭 引导 v1.0', '🎛 脚本按钮 v1.4', '反截断 v1.3', '✍️ 提示词发送修改 v1.0', '💭 思维链 v0.1', '🌟 预设设置 v1.0', '🧰 工具箱 v2.0', '🔄 远程更新 v1.6'];
ok(JSON.stringify(flat(t2).slice().sort()) === JSON.stringify(want.slice().sort()), '整理后脚本树只剩新版 11 个（旧的、制作中的都清掉）', flat(t2));

const drillSeen = await page.evaluate(() => window.__drillSeen || []);
const ts = (x) => '+' + ((x.at - T0) / 1000).toFixed(1) + 's';
console.log('  旧界面记录（本次页面载入以来）：' + drillSeen.filter((x) => x.v !== 0 && x.v !== '' || drillSeen.some((y) => y.k === x.k && y.v)).map((x) => ts(x) + ' ' + x.k + '=' + x.v).join('，'));
const span = (re1, re2) => { const a = logs.filter((l) => re1.test(l)).map((l) => parseFloat(l.slice(1))); const z = logs.filter((l) => re2.test(l)).map((l) => parseFloat(l.slice(1))); const st = a.filter((x) => x > 0).pop(); const en = z.filter((x) => x >= st).shift(); return st === undefined ? null : { start: st, end: en, ms: en === undefined ? null : Math.round((en - st) * 1000) }; };
console.log('  旧脚本在新预设里跑了多久：皮肤管理 ' + JSON.stringify(span(/\[皮肤\] 启动 v0\.3/, /\[皮肤\] 注销完成/)) + '；正文外壳 ' + JSON.stringify(span(/\[正文外壳\] 启动/, /\[正文外壳\] 已注销/)) + '；旧引导 ' + JSON.stringify(span(/\[引导\] 启动 v0\.6/, /\[引导\] 注销完成/)));
mark('④ 刷新');
/* ④ 刷新：磁盘上的预设也是整理后的样子，新界面正常 */
await page.reload();
await page.waitForFunction(() => window.SillyTavern && window.TavernHelper, null, { timeout: 90000 });
await acceptPopups(20000, () => page.evaluate(() => !!window.KamiRuntimeNext));
await page.screenshot({ path: SHOT + '/3-after-reload.png' });
await acceptPopups(4000);
await page.waitForTimeout(4000);
const t3 = await tree();
ok(JSON.stringify(flat(t3).slice().sort()) === JSON.stringify(want.slice().sort()), '刷新后脚本树仍是新版 11 个', flat(t3));
const fin = await page.evaluate(() => ({
  preset: window.SillyTavern.getContext().getPresetManager('openai').getSelectedPresetName(),
  temp: window.SillyTavern.getContext().chatCompletionSettings.temp_openai,
  tb: !!window.KamiToolboxNext, fe: !!(window.KamiChatFrontend && window.KamiChatFrontend.active()), oldBody: document.querySelectorAll('#chat [data-kami-body-host]').length,
  btns: [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].map((x) => x.textContent.trim()).filter((t) => /^[🧰🌟🎨🧭]/.test(t))
}));
ok(fin.preset === NEW_NAME, '当前预设是新版', fin.preset);
ok(Number(fin.temp) === 0.73, '用户改过的温度保住了（0.73）', fin.temp);
ok(fin.tb && fin.fe && fin.oldBody === 0, '新工具箱、新消息前端在跑，没有旧正文外壳', fin);
ok(fin.btns.length >= 3, '按钮条上有新版按钮', fin.btns);
ok(errors.length === 0, '没有页面错误', errors.slice(0, 5));
console.log('  拦下的请求：' + hits.length + ' 个');
logs.filter((l) => /整理|脚本|更新\] (已写入|合并)/.test(l)).slice(-14).forEach((l) => console.log('  log ' + l));
await b.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail) + (MOBILE ? '（手机 390）' : '（电脑 1440）'));
process.exit(fail ? 1 : 0);
