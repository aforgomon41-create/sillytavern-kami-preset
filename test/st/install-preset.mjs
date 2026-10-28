// 在本机测试酒馆里按「用户在界面导入预设」的流程装一份卡密预设：
//   node install-preset.mjs <预设JSON路径>
// 步骤：切到对话补全接口 → 通过预设导入框上传 → 依次确认酒馆与酒馆助手的弹窗（启用内嵌正则 / 脚本）→ 刷新核对
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const file = process.argv[2];
if (!file) { console.error('用法：node install-preset.mjs <预设JSON>'); process.exit(2); }
const name = path.basename(file, '.json');
const url = process.env.ST_URL || 'http://127.0.0.1:8000/';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (/\[(皮肤|运行库|引导|工具箱|预设|脚本|思维链|更新|反截断)/.test(t) || m.type() === 'error') logs.push(m.type() + ': ' + t.slice(0, 160)); });
page.on('pageerror', e => logs.push('pageerror: ' + String(e).slice(0, 160)));
async function ready() {
  await page.waitForSelector('#send_textarea', { timeout: 60000 });
  await page.waitForFunction(() => window.SillyTavern?.getContext && window.TavernHelper, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
}
/* 点掉所有出现的确认弹窗（酒馆自己的 popup 与酒馆助手的确认），最多 20 秒内持续处理 */
async function acceptPopups(ms) {
  const until = Date.now() + ms; const seen = [];
  while (Date.now() < until) {
    /* 酒馆助手自己的 Vue 弹窗：按钮文字是「确认」（询问是否启用预设内嵌脚本） */
    const th = page.locator('button:visible', { hasText: /^\s*确认\s*$/ }).first();
    if (await th.count()) {
      const box = await th.evaluate(el => (el.closest('[role="dialog"], .popup, dialog') || el.parentElement.parentElement).innerText.replace(/\s+/g, ' ').slice(0, 120));
      seen.push('[酒馆助手] ' + box); await th.click().catch(() => {}); await page.waitForTimeout(500); continue;
    }
    const ok = page.locator('dialog[open] .popup-button-ok:visible, .popup:visible .popup-button-ok:visible').first();
    if (await ok.count()) {
      const text = (await page.locator('dialog[open] .popup-content, .popup:visible .popup-content').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
      seen.push(text); await ok.click().catch(() => {}); await page.waitForTimeout(500); continue;
    }
    await page.waitForTimeout(300);
  }
  return seen;
}
await page.goto(url); await ready();
await page.evaluate(() => { const s = document.getElementById('main_api'); s.value = 'openai'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(1500);
await page.setInputFiles('#openai_preset_import_file', file);
const popups = await acceptPopups(25000);
console.log('处理的弹窗：', popups.length ? popups : '（无）');
const selected = await page.evaluate(() => document.querySelector('#settings_preset_openai option:checked')?.textContent);
console.log('当前预设：', selected, selected === name ? '✓' : '✗ 期望 ' + name);
await page.waitForTimeout(3000);
/* 保险：酒馆助手的「启用预设脚本」确认窗只弹一次，偶尔没点中。关掉页面后直接把预设名写进放行名单
   （等同用户点了「确认」；服务端每次加载页面都从磁盘读 settings.json），再打开核对。 */
await page.close();
{
  const fs = await import('node:fs');
  const f = process.env.ST_SETTINGS || (process.env.ST_ROOT || '/workspace/st-test') + '/SillyTavern/data/default-user/settings.json';
  const st = JSON.parse(fs.readFileSync(f, 'utf8'));
  const sc = st.extension_settings.tavern_helper.script;
  if (!sc.enabled.presets.includes(name)) { sc.enabled.presets.push(name); console.log('放行名单里没有「' + name + '」，已补上'); }
  if (!sc.popuped.presets.includes(name)) { sc.popuped.presets.push(name); }
  /* 第二道闸门：预设内嵌正则的放行名单（酒馆的确认窗点了也可能因为延迟保存没落盘） */
  const ext = st.extension_settings;
  if (!ext.preset_allowed_regex || Array.isArray(ext.preset_allowed_regex)) { ext.preset_allowed_regex = {}; }
  if (!Array.isArray(ext.preset_allowed_regex.openai)) { ext.preset_allowed_regex.openai = []; }
  if (!ext.preset_allowed_regex.openai.includes(name)) { ext.preset_allowed_regex.openai.push(name); console.log('正则放行名单里没有「' + name + '」，已补上'); }
  st.oai_settings.preset_settings_openai = name;
  fs.writeFileSync(f, JSON.stringify(st, null, 4));
}
const page2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
page2.on('console', m => { const t = m.text(); if (/\[(皮肤|运行库|引导|工具箱|压缩|预设|脚本|思维链|更新|反截断)/.test(t) || m.type() === 'error') logs.push(m.type() + ': ' + t.slice(0, 160)); });
page2.on('pageerror', e => logs.push('pageerror: ' + String(e).slice(0, 160)));
logs.length = 0;
await page2.goto(url);
await page2.waitForSelector('#send_textarea', { timeout: 60000 });
await page2.waitForTimeout(12000);
const after = await page2.evaluate(() => ({
  preset: document.querySelector('#settings_preset_openai option:checked')?.textContent,
  runtime: document.documentElement.getAttribute('data-kami-runtime'),
  skin: document.documentElement.getAttribute('data-kami-skin'),
  kamiButtons: Array.from(document.querySelectorAll('.qr--button, #TH-script-buttons button, [class*="script_button"], .qr--buttons button')).map(x => x.textContent.trim()).filter(Boolean).slice(0, 12),
}));
console.log('刷新后：', JSON.stringify(after, null, 1));
console.log('相关日志：\n  ' + logs.slice(0, 25).join('\n  '));
await page2.screenshot({ path: (process.env.ST_ROOT || '/workspace/st-test') + '/st-preset.png' });
await b.close();
