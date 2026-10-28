// 新运行库在真实酒馆里的验证：注入 .cache/frontend/runtime.js（相当于一个酒馆助手脚本加载它），
// 核对宿主浮层（层级、隔离、对话框交互）与消息挂载服务（挂载、重绘重挂、删除消息后清理）。
// 前提：最后一条 AI 消息含 [data-kami-mount="probe"]（先跑 chat.mjs "探针 [mock:mount-probe]"），并已 npm run build:frontend
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto(process.env.ST_URL || 'http://127.0.0.1:8000/');
await page.waitForSelector('#send_textarea'); await page.waitForTimeout(9000);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.evaluate(async () => {
  const ctx = window.SillyTavern.getContext();
  if (ctx.characterId === undefined || ctx.characterId === null) { await ctx.selectCharacterById(String(ctx.characters.findIndex((c) => /Seraphina/i.test(c.name)))); }
});
await page.waitForTimeout(2500);
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + x : '')); };

const RUNTIME = fs.readFileSync(path.join(ROOT, '.cache/frontend/runtime.js'), 'utf8');
if (process.env.IFRAME === '1') {
  /* 模拟酒馆助手脚本：运行库在一个同源 iframe 里执行，自己沿 window 链找到酒馆主页面。
     这条路径才会碰到「可构造样式表必须用目标文档的构造器创建」的问题 */
  await page.evaluate((code) => new Promise((resolve) => {
    const f = document.createElement('iframe'); f.style.display = 'none'; f.id = 'kami-script-frame';
    f.addEventListener('load', () => { const s = f.contentDocument.createElement('script'); s.textContent = code; f.contentDocument.body.appendChild(s); resolve(); });
    f.srcdoc = '<!doctype html><html><body></body></html>'; document.body.appendChild(f);
  }), RUNTIME);
  console.log('（运行库在脚本 iframe 里加载）');
} else {
  await page.addScriptTag({ content: RUNTIME });
}
ok(await page.evaluate(() => !!window.KamiRuntimeNext && document.documentElement.getAttribute('data-kami-runtime-next')), '新运行库注册到酒馆主窗口');

/* 宿主浮层：开一个对话框 */
await page.evaluate(() => {
  const rt = window.KamiRuntimeNext, h = rt.React.createElement, D = rt.ds;
  window.__dlgOpen = true;
  function Demo() {
    const [open, setOpen] = rt.React.useState(true);
    return h(D.Dialog, { open, onOpenChange: setOpen, title: '真实酒馆里的对话框', footer: h(D.Button, { variant: 'primary', onClick: () => setOpen(false) }, '确定') },
      h(D.Field, { label: '名称' }, h(D.TextField, { placeholder: '输入点什么' })));
  }
  rt.layer().open('st-test', h(Demo));
});
await page.waitForTimeout(400);
const layerInfo = await page.evaluate(() => {
  const host = document.querySelector('kami-layer');
  const sr = host.shadowRoot; const c = sr.querySelector('[data-k="dialog"][data-k-part="content"]');
  const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 10);
  const btn = sr.querySelector('[data-k="button"]'); const cs = getComputedStyle(btn);
  return { onTop: top === host, sheets: sr.adoptedStyleSheets.length, font: cs.fontFamily.slice(0, 40), bg: cs.backgroundColor };
});
ok(layerInfo.onTop, '对话框在酒馆所有界面之上（中心点命中宿主浮层）', JSON.stringify(layerInfo));
ok(layerInfo.sheets === 2, '浮层用的是共享的可构造样式表（2 份）', layerInfo.sheets);
await page.locator('kami-layer [data-k="text-field"] input').fill('键盘输入');
ok((await page.locator('kami-layer [data-k="text-field"] input').inputValue()) === '键盘输入', '对话框里的输入框可以打字（酒馆的快捷键没抢焦点）');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ok((await page.locator('kami-layer [data-k="dialog"][data-k-part="content"]').count()) === 0, 'Esc 关闭对话框');

/* 消息挂载服务 */
await page.evaluate(() => {
  const rt = window.KamiRuntimeNext, h = rt.React.createElement, D = rt.ds;
  const ctx = () => window.SillyTavern.getContext();
  window.__mm = rt.messages({
    chat: () => document.getElementById('chat'),
    getRaw: (id) => (ctx().chat[id] || {}).mes,
    kinds: {
      probe: {
        payload: (raw) => { const m = /data-kami-payload="([^"]*)"/.exec(raw); return m ? JSON.parse(atob(m[1])) : undefined; },
        render: (p, c) => h(D.Card, { title: '探针挂载', meta: '#' + c.mesId }, h('span', { 'data-testid': 'probe-payload' }, JSON.stringify(p)))
      }
    }
  });
  window.__mm.start();
});
await page.waitForTimeout(500);
const read = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('#chat [data-kami-mount="probe"]')].pop();
  const t = el && el.shadowRoot && el.shadowRoot.querySelector('[data-testid="probe-payload"]');
  return { size: window.__mm.size, mounts: window.__mm.mounts, payload: t ? t.textContent : null, sheets: el && el.shadowRoot ? el.shadowRoot.adoptedStyleSheets.length : 0 };
});
let s = await read();
ok(s.payload === '{"a":1}', '消息里的标记挂上了设计系统组件，载荷取自聊天原始数据', JSON.stringify(s));
ok(s.sheets === 2, '消息挂载点与浮层共用同一份样式表', s.sheets);
const m0 = s.mounts;
await page.evaluate(() => window.SillyTavern.getContext().reloadCurrentChat()); await page.waitForTimeout(2500);
s = await read();
ok(s.payload === '{"a":1}' && s.mounts > m0, '重载聊天后自动重挂', JSON.stringify(s));
const m1 = s.mounts;
await page.evaluate(() => { const ctx = window.SillyTavern.getContext(); const id = ctx.chat.length - 1; ctx.updateMessageBlock(id, ctx.chat[id]); }); await page.waitForTimeout(800);
s = await read();
ok(s.mounts > m1 && s.size >= 1, '单条消息重绘后自动重挂，旧挂载已卸载（挂载数不累积）', JSON.stringify(s));
const before = s.size;
await page.evaluate(async () => { const ctx = window.SillyTavern.getContext(); await ctx.executeSlashCommandsWithOptions('/del 1'); }); await page.waitForTimeout(1200);
s = await read();
ok(s.size < before, '删除那条消息后挂载点被清理', JSON.stringify(s));

/* 换皮肤：浮层与挂载点同步 */
const mode = await page.evaluate(() => { const rt = window.KamiRuntimeNext; const c = rt.applySkin(rt.engine.composeSkin ? { id: 'fallback', name: 'x', version: '0', contract: '1.0', defaultScheme: 'light', schemes: { light: { seeds: { neutral: '#f3f4f6', accent: '#2f5bd3' } } } } : null, { scheme: 'light' }); return [c.mode, document.querySelector('kami-layer').shadowRoot.querySelector('[data-k-surface]').getAttribute('data-k-scheme')]; });
ok(mode[0] === 'light' && mode[1] === 'light', '换皮肤后浮层属性同步', JSON.stringify(mode));
await page.evaluate(() => window.KamiRuntimeNext.dispose());
ok(await page.evaluate(() => !document.querySelector('kami-layer') && window.__mm.size === 0), '运行库 dispose 后浮层与挂载点全部清理');
ok(errors.length === 0, '无页面错误', errors.join(' | '));
console.log('\n结果：' + pass + ' / ' + (pass + fail));
await b.close();
