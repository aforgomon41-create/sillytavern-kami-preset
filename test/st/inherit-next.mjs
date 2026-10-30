// 「继承旧预设设置」在真实酒馆里的验证（2026-10-30：预览版用户报「继承不了」）：
//   node test/st/inherit-next.mjs [--mobile]
// 前提：测试酒馆 + 假模型在跑，当前预设是刚装的卡密测试包（install-preset.mjs）。
// 做法：
//   ① 按当前预设复制一份「用户改过的旧预设」写进酒馆的预设目录：温度、4 个条目开关、一条条目内容、一个脚本开关、
//      🧰 工具箱脚本里的压缩上限（脚本 data）、一条正则开关；
//   ② 在新工具箱「更新」页：选择旧预设 → 继承 → 裁决窗口「全部保留旧预设」→「应用并完成」；
//   ③ 页面自动刷新后核对：活设置、酒馆助手的脚本树、磁盘上的预设文件都带上了这些改动，「这一份继承自」记下来了；
//   ④ 收尾：当前预设恢复成继承前的备份，删掉造出来的旧预设与备份（不留东西）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const MOBILE = process.argv.includes('--mobile');
const ST = process.env.ST_URL || 'http://127.0.0.1:8000/';
const DIR = path.join(process.env.KAMI_ST_ROOT || '/workspace/st-test/SillyTavern', 'data/default-user/OpenAI Settings');
const OLD = 'kami-v0.93-1-20261001-inherit-test';
const MARK = '【继承测试改过】';

let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
const walk = (xs) => xs.flatMap((x) => (x.type === 'folder' ? walk(x.scripts || []) : [x]));
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const b = await chromium.launch();
const page = await b.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const ready = async () => {
  await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper && window.KamiUpdate && window.KamiToolboxNext, null, { timeout: 60000 });
  await page.waitForTimeout(6000);
};
await page.goto(ST); await ready();
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
const cur = await page.evaluate(() => window.KamiUpdate.otherPresetNames().current);
const curFile = path.join(DIR, cur + '.json');
ok(/^kami-/.test(cur) && fs.existsSync(curFile), '当前是卡密预设：' + cur, cur);
const original = fs.readFileSync(curFile, 'utf8');

/* ① 造一份用户改过的旧预设 */
const d = JSON.parse(original);
d.temperature = 0.33;
const order = d.prompt_order[0].order;
const on = order.filter((o) => o.enabled), off = order.filter((o) => !o.enabled);
const flip = [on[5], on[9], off[3], off[7]].map((o) => o.identifier);
for (const o of order) { if (flip.includes(o.identifier)) { o.enabled = !o.enabled; } }
const want = Object.fromEntries(order.filter((o) => flip.includes(o.identifier)).map((o) => [o.identifier, o.enabled]));
const pr = d.prompts.filter((p) => !p.system_prompt && p.content && !flip.includes(p.identifier))[4];
pr.content += '\n' + MARK;
const scripts = walk(d.extensions.tavern_helper.scripts);
const sendMod = scripts.find((x) => /提示词发送修改/.test(x.name)); sendMod.enabled = !sendMod.enabled;
const toolbox = scripts.find((x) => /^🧰 工具箱/.test(x.name));
toolbox.data = toolbox.data || {}; toolbox.data['kami-summarize'] = { ...(toolbox.data['kami-summarize'] || {}), cfg: { ...((toolbox.data['kami-summarize'] || {}).cfg || {}), threshold: 123456 } };
const rx = d.extensions.regex_scripts[2]; rx.disabled = !rx.disabled;
d.name = OLD;
fs.writeFileSync(path.join(DIR, OLD + '.json'), JSON.stringify(d, null, 4));
const exp = { flip: want, prompt: pr.identifier, sendMod: [sendMod.name, sendMod.enabled], toolbox: toolbox.name, regex: [rx.scriptName, rx.disabled] };
await page.reload(); await ready();
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

/* ② 新工具箱 → 更新 → 继承 */
const inLayer = (fn, arg) => page.evaluate(([src, arg]) => { const l = document.querySelector('kami-layer'); return l ? (0, eval)('(' + src + ')')(l.shadowRoot, arg) : null; }, [fn.toString(), arg]);
await page.evaluate(() => { const el = [...document.querySelectorAll('.qr--button, .menu_button, [data-hub-btn]')].find((x) => x.textContent.trim().startsWith('🧰 工具箱')); el && el.click(); });
await page.waitForTimeout(1000);
await inLayer((r) => { const t = [...r.querySelectorAll('[data-k="panel"] [data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((x) => x.textContent.includes('更新')); t.focus(); t.click(); });
await page.waitForTimeout(600);
const tap = async (text) => {
  const box = await inLayer((r, text) => { const x = [...r.querySelectorAll('button, [role="option"]')].find((b) => b.textContent.trim() === text); if (!x) { return null; } x.scrollIntoView({ block: 'center' }); const q = x.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, text);
  if (!box) { return false; }
  if (MOBILE) { await page.touchscreen.tap(box.x, box.y); } else { await page.mouse.click(box.x, box.y); }
  await page.waitForTimeout(500);
  return true;
};
ok(await tap('选择旧预设'), '更新页有「选择旧预设」');
const trigger = await inLayer((r) => { const s = r.querySelector('[data-k="select"] [data-k-part="trigger"]') || r.querySelector('[data-k="select"]'); s.scrollIntoView({ block: 'center' }); const q = s.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
if (MOBILE) { await page.touchscreen.tap(trigger.x, trigger.y); } else { await page.mouse.click(trigger.x, trigger.y); }
await page.waitForTimeout(600);
ok(await tap(OLD), '下拉里选到旧预设「' + OLD + '」');
const shown = await inLayer((r) => (r.querySelector('[data-k="select"]') || {}).textContent || '');
ok(shown.includes(OLD), '选择框显示选中的旧预设', shown);
const nav = page.waitForEvent('framenavigated', { timeout: 90000 }).catch(() => null);
ok(await tap('继承'), '点「继承」');
let dialog = null;
for (let i = 0; i < 60 && !dialog; i++) {
  await page.waitForTimeout(1000);
  dialog = await inLayer((r) => { const d = r.querySelector('[data-k="dialog"][data-k-part="content"]'); return d ? (d.querySelector('[data-k-part="title"]') || {}).textContent : null; });
}
ok(!!dialog, '弹出合并裁决窗口', dialog);
await page.screenshot({ path: '/tmp/inherit-dialog-' + (MOBILE ? 'mobile' : 'desktop') + '.png' }).catch(() => {});
ok(await tap('全部保留旧预设'), '裁决窗口：全部保留旧预设');
ok(await tap('应用并完成'), '裁决窗口：应用并完成');
const note = await (async () => { for (let i = 0; i < 20; i++) { const t = await inLayer((r) => [...r.querySelectorAll('p')].map((n) => n.textContent).find((t) => /搬过来|失败|中止/.test(t)) || null).catch(() => null); if (t) { return t; } await page.waitForTimeout(250); } return null; })();
ok(!!note && /搬过来/.test(note) && /自动刷新/.test(note), '面板写明「设置已经搬过来了…页面会在几秒后自动刷新」', note);

/* ③ 自动刷新后核对 */
const navd = await nav;
ok(!!navd, '继承完成后页面自动刷新');
await ready();
const live = await page.evaluate((exp) => {
  const s = window.SillyTavern.getContext().chatCompletionSettings;
  const order = (s.prompt_order.find((x) => x.character_id === 100001) || s.prompt_order[0]).order;
  const flip = Object.fromEntries(Object.keys(exp.flip).map((id) => [id, (order.find((x) => x.identifier === id) || {}).enabled]));
  const walk = (xs) => xs.flatMap((x) => (x.type === 'folder' ? walk(x.scripts || []) : [x]));
  const th = walk(window.TavernHelper.getScriptTrees({ type: 'preset' }));
  const tb = th.find((x) => x.name === exp.toolbox);
  return {
    name: window.KamiUpdate.otherPresetNames().current, temp: s.temp_openai, flip,
    prompt: ((s.prompts.find((p) => p.identifier === exp.prompt) || {}).content || '').includes('【继承测试改过】'),
    sendMod: (th.find((x) => x.name === exp.sendMod[0]) || {}).enabled,
    threshold: tb && tb.data && tb.data['kami-summarize'] && tb.data['kami-summarize'].cfg ? tb.data['kami-summarize'].cfg.threshold : null,
    regex: ((s.extensions.regex_scripts || []).find((r) => r.scriptName === exp.regex[0]) || {}).disabled,
    newUi: th.filter((x) => /🧪/.test(x.name)).every((x) => x.enabled)
  };
}, exp);
ok(live.name === cur, '刷新后仍是当前这一份预设', live.name);
ok(live.temp === 0.33, '活设置：温度继承了', live.temp);
ok(JSON.stringify(live.flip) === JSON.stringify(exp.flip), '活设置：条目开关继承了', { live: live.flip, want: exp.flip });
ok(live.prompt, '活设置：条目内容继承了');
ok(live.sendMod === exp.sendMod[1], '酒馆助手：脚本开关继承了（之前被它内存里的旧脚本树盖回去）', live.sendMod);
ok(live.threshold === 123456, '酒馆助手：脚本里的设置（压缩上限）继承了', live.threshold);
ok(live.regex === exp.regex[1], '活设置：正则开关继承了', live.regex);
ok(live.newUi, '支线的新前端脚本仍是开着的');
const disk = readJson(curFile);
const dOrder = disk.prompt_order[0].order, dScripts = walk(disk.extensions.tavern_helper.scripts);
const dTool = dScripts.find((x) => x.name === exp.toolbox);
const d40 = dScripts.find((x) => /^🌟 预设设置/.test(x.name));
ok(disk.temperature === 0.33 && Object.keys(exp.flip).every((id) => dOrder.find((o) => o.identifier === id).enabled === exp.flip[id])
  && (dScripts.find((x) => x.name === exp.sendMod[0]) || {}).enabled === exp.sendMod[1]
  && dTool.data['kami-summarize'].cfg.threshold === 123456, '磁盘上的预设文件：温度、条目开关、脚本开关、脚本设置都在');
ok(d40 && d40.data && d40.data['kami-preset'] && d40.data['kami-preset'].inheritFrom === OLD, '「这一份继承自」记在预设里', d40 && d40.data);
ok(errors.length === 0, '没有页面错误', errors);

/* ④ 收尾 */
const backup = path.join(DIR, cur + ' · 继承前备份.json');
fs.writeFileSync(curFile, original);
for (const f of [path.join(DIR, OLD + '.json'), backup]) { try { fs.unlinkSync(f); } catch (e) { } }
await page.reload(); await ready();
/* 酒馆的活设置另存在 settings.json 里：只还原文件不够，要切走再切回当前预设，让它从（已还原的）文件重新载入 */
await page.evaluate(async (cur) => {
  const pm = window.SillyTavern.getContext().getPresetManager('openai');
  pm.selectPreset(pm.findPreset('Default')); await new Promise((r) => setTimeout(r, 1500));
  pm.selectPreset(pm.findPreset(cur)); await new Promise((r) => setTimeout(r, 2500));
}, cur);
const back = await page.evaluate(() => window.SillyTavern.getContext().chatCompletionSettings.temp_openai);
ok(back === JSON.parse(original).temperature && readJson(curFile).temperature === JSON.parse(original).temperature, '收尾：当前预设的活设置与文件都回到继承前', { back, want: JSON.parse(original).temperature });
const clean = await page.evaluate((old) => { const n = window.KamiUpdate.otherPresetNames().names; return !n.includes(old) && !n.some((x) => x.includes(old)); }, OLD);
ok(clean && !fs.existsSync(backup), '收尾：当前预设恢复原样，造出来的旧预设与备份已删');
await b.close();
console.log('\n' + pass + ' 通过，' + fail + ' 失败（' + (MOBILE ? '手机 390' : '电脑 1440') + '）');
process.exit(fail ? 1 : 0);
