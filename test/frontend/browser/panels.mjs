#!/usr/bin/env node
/**
 * 工具箱与引导预览：node test/frontend/browser/panels.mjs（需先 node build/frontend/build-preview.mjs）
 *   工具箱：四个页签都带图标（含「更新」：检查更新 → 进度弹窗失败可重试 → 完成；继承旧预设 → 逐条裁决）；大总结分块进度；手动搜索弹窗；
 *           只有开着的功能才显示参数；清除数据要点两次；搜索来源 / 限额由旧系统的目录与字段生成；
 *           换来源后显示该来源需要的项（密钥 / 服务地址 / 百科语言）；常驻指令内容为空时打不开；标签处理有确认窗
 *   引导：免责声明确认前走不了；选皮肤立即套用；选的模型出现在完成页；每一步两档配色的实际对比度；窄屏不横向溢出
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { auditInPage, serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
const { webSearchProviders } = await import(path.join(ROOT, 'src/scripts/_search-providers.js'));
const { webSearchLimitFields } = await import(path.join(ROOT, 'src/scripts/_search-pure.js'));
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const b = await chromium.launch();
const inLayer = (page, fn, arg) => page.evaluate(([src, arg]) => (0, eval)('(' + src + ')')(document.querySelector('kami-layer').shadowRoot, arg), [fn.toString(), arg]);
const text = (page) => inLayer(page, (r) => r.querySelector('[data-k="panel"]').textContent);
const clickText = (page, sel, re) => inLayer(page, (r, [sel, re]) => { const el = [...r.querySelectorAll(sel)].find((x) => new RegExp(re).test(x.textContent)); if (el) { el.click(); } return !!el; }, [sel, re]);
const audit = async (page, label, bad) => { const a = await page.evaluate(auditInPage, null); if (a.failures.length) { bad.push(label + ': ' + JSON.stringify(a.failures.slice(0, 2))); } return a.checked; };
const overflow = (page) => inLayer(page, (r) => { const p = r.querySelector('[data-k="panel"]'); const bd = p.querySelector(':scope > [data-k-part="body"]'); return bd.scrollWidth > bd.clientWidth + 1 || p.getBoundingClientRect().right > innerWidth + 1; });
const PROVIDERS = webSearchProviders();
const LIMITS = webSearchLimitFields();

for (const [label, opts] of [["电脑 1280", { viewport: { width: 1280, height: 900 } }], ["手机 390", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
  console.log('\n── 工具箱 · ' + label);
  const ctx = await b.newContext(opts);
  let page = await ctx.newPage();
  let errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const URL0 = base + '/design/previews/toolbox/index.html';
  await page.goto(URL0); await page.waitForTimeout(700);
  const tabs = await inLayer(page, (r) => [...r.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].map((t) => ({ t: t.textContent, svg: !!t.querySelector('svg') })));
  ok(tabs.map((x) => x.t).join() === '压缩,网络搜索,其他功能,更新' && tabs.every((x) => x.svg), '四个页签（含更新），每个都带图标', tabs);
  /* 大总结：分块进度条 */
  await clickText(page, '[data-k="button"]', '^立即大总结$'); await page.waitForTimeout(300);
  const gp = await inLayer(page, (r) => { const g = r.querySelector('[data-grand-progress]'); return g ? { bar: !!g.querySelector('[data-k="progress"][role="progressbar"]'), t: g.textContent } : null; });
  ok(gp && gp.bar && /正在总结第 1 \/ 3 块/.test(gp.t), '立即大总结：出现分块进度', gp);
  await page.waitForTimeout(3300);
  ok(/大总结完成/.test(await inLayer(page, (r) => (r.querySelector('[data-k="toast"]') || {}).textContent || '')) && !(await inLayer(page, (r) => !!r.querySelector('[data-grand-progress]'))), '跑完：进度条收起，提示条报结果');
  /* 压缩：只有开着的模式显示参数 */
  let t = await text(page);
  ok(t.includes('超限压缩参数') && !t.includes('滚动压缩参数'), '默认只开超限压缩：只显示它的参数');
  await clickText(page, '[data-k="card"][data-role="choice"] > [data-k-part="select"]', '^滚动压缩'); await page.waitForTimeout(150);
  t = await text(page);
  ok(t.includes('滚动压缩参数') && t.includes('起始深度 20'), '开滚动压缩：出现它的参数，卡片显示当前深度');
  await clickText(page, '[data-k="button"]', '^清除压缩数据$'); await page.waitForTimeout(100);
  t = await text(page);
  ok(t.includes('再点一次确认') && !/已清除/.test(await inLayer(page, (r) => (r.querySelector('[data-k="toast"]') || {}).textContent || '')), '清除压缩数据：第一次只变成「再点一次确认」');
  await clickText(page, '[data-k="button"]', '^再点一次确认$'); await page.waitForTimeout(150);
  ok(/已清除本聊天的压缩数据/.test(await inLayer(page, (r) => (r.querySelector('[data-k="toast"]') || {}).textContent || '')), '第二次才执行，提示条说明结果');
  await clickText(page, '[data-k="segmented"] [data-k-part="item"]', '^自定义接口$'); await page.waitForTimeout(150);
  t = await text(page);
  ok(['接口格式', '接口地址', '密钥', '模型名', '获取模型列表', '导入连接配置', '存为新配置', '删除当前配置'].every((x) => t.includes(x)), '大总结模型选「自定义接口」：连接配置的各项都在');

  /* 网络搜索 */
  await page.goto(URL0 + '?tab=search'); await page.waitForTimeout(600);
  const sliders = await inLayer(page, (r) => [...r.querySelectorAll('[role="slider"]')].map((s) => ({ l: s.getAttribute('aria-label'), min: +s.getAttribute('aria-valuemin'), max: +s.getAttribute('aria-valuemax'), v: +s.getAttribute('aria-valuenow') })));
  ok(sliders.length === LIMITS.length && LIMITS.every((f, n) => sliders[n].min === f.min && sliders[n].max === f.max && sliders[n].v === f.auto), '自动搜索限额：字段、范围、默认值都来自 _search-pure.js', sliders);
  /* 打开「服务」下拉数一下（Radix 下拉的选项在弹层里） */
  await page.locator('[data-k="field"]:has-text("服务") [data-k="select"]').first().click(); await page.waitForTimeout(250);
  const options = await inLayer(page, (r) => [...r.querySelectorAll('[role="option"]')].map((o) => o.textContent));
  ok(options.length === PROVIDERS.length, '服务下拉 = 来源目录的 ' + PROVIDERS.length + ' 家', options.length);
  const pick = async (lbl) => { await page.locator('[role="option"]', { hasText: lbl }).first().click(); await page.waitForTimeout(200); };
  await pick('Tavily');
  t = await text(page);
  ok(t.includes('API Key') && t.includes('获取 API Key') && t.includes('还没保存密钥') && t.includes(PROVIDERS.find((p) => p.id === 'tavily').note.slice(0, 12)), '选 Tavily：密钥输入、获取密钥链接、密钥状态与该来源的说明');
  await page.locator('[data-k="field"]:has-text("服务") [data-k="select"]').first().click(); await page.waitForTimeout(200);
  await pick('SearXNG');
  t = await text(page);
  ok(t.includes('服务地址') && !t.includes('API Key'), '选 SearXNG：要服务地址、不要密钥');
  await page.locator('[data-k="field"]:has-text("服务") [data-k="select"]').first().click(); await page.waitForTimeout(200);
  await pick('维基百科');
  ok((await text(page)).includes('百科语言'), '选维基百科：出现百科语言');
  await clickText(page, '[data-k="segmented"] [data-k-part="item"]', '^模型自带$'); await page.waitForTimeout(150);
  t = await text(page);
  ok(t.includes('模型联网能力') && !t.includes('搜索服务连接') && !t.includes('手动搜索设置'), '模型自带：不显示服务连接与手动搜索');
  await inLayer(page, (r) => r.querySelector('[data-k="switch"]').click()); await page.waitForTimeout(150);
  t = await text(page);
  ok(!t.includes('搜索来源') && !t.includes('自动搜索限额'), '关掉搜索能力：只剩开关');

  /* 手动搜索弹窗 */
  await page.goto(URL0 + '?tab=search'); await page.waitForTimeout(600);
  await clickText(page, '[data-k="button"]', '^手动搜索$'); await page.waitForTimeout(300);
  const dlgText = () => inLayer(page, (r) => { const d = [...r.querySelectorAll('[role="dialog"]')].filter((x) => !x.matches('[data-k="panel"]')).pop(); return d ? d.textContent : ''; });
  const confirmDisabled = await inLayer(page, (r) => [...r.querySelectorAll('[data-k="button"]')].find((b) => b.textContent === '确认并搜索').disabled);
  ok(confirmDisabled && /这次想查什么/.test(await dlgText()), '手动搜索：没填要求时「确认并搜索」点不了');
  await inLayer(page, (r) => { const ta = [...r.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-label') === '本次搜索要求'); ta.focus(); });
  await page.keyboard.type('港口城市的地理'); await page.waitForTimeout(100);
  await clickText(page, '[data-k="button"]', '^确认并搜索$'); await page.waitForTimeout(400);
  const ms1 = await inLayer(page, (r) => [...r.querySelectorAll('[data-k="steps"] > [data-k-part="item"]')].map((i) => i.getAttribute('data-state')));
  ok(ms1[0] === 'current' && /手动搜索进行中/.test(await dlgText()), '开始后按四个步骤走', ms1);
  await page.waitForTimeout(4200);
  ok(/手动搜索已完成/.test(await dlgText()), '跑完显示「手动搜索已完成」');
  await clickText(page, '[data-k="button"]', '^关闭$'); await page.waitForTimeout(200);

  /* 更新页：检查更新 → 进度弹窗（预览默认第一次下载失败）→ 重试 → 完成 */
  await page.goto(URL0 + '?tab=update'); await page.waitForTimeout(600);
  t = await text(page);
  ok(['酒馆版本', '酒馆助手', '预设版本', '检查更新', '继承旧预设设置'].every((x) => t.includes(x)), '更新页：版本信息、检查更新、继承旧预设');
  await clickText(page, '[data-k="button"]', '^检查更新$'); await page.waitForTimeout(900);
  await clickText(page, '[data-k="button"]', '^立即更新$'); await page.waitForTimeout(2600);
  let up = await dlgText();
  ok(/更新失败/.test(up) || /几条下载通道都试不通/.test(up), '下载失败：弹窗留在原地说原因', up.slice(0, 80));
  await clickText(page, '[data-k="button"]', '^重试$'); await page.waitForTimeout(4500);
  up = await dlgText();
  ok(/更新完成/.test(up) && /第1次重试/.test(up), '重试后完成，标出第几次重试', up.slice(0, 120));
  await clickText(page, '[data-k="button"]', '^关闭$'); await page.waitForTimeout(200);
  await clickText(page, '[data-k="button"]', '^继承$'); await page.waitForTimeout(300);
  const doneBtn = () => inLayer(page, (r) => [...r.querySelectorAll('[data-k="button"]')].find((b) => b.textContent === '完成').disabled);
  ok(await doneBtn(), '逐条裁决：没选完不能完成');
  await clickText(page, '[data-k="button"]', '^全部保留我的$'); await page.waitForTimeout(150);
  ok(!(await doneBtn()), '「全部保留我的」后可以完成');
  await clickText(page, '[data-k="button"]', '^完成$'); await page.waitForTimeout(250);
  ok((await text(page)).includes('这一份继承自kami-v0.92-100'), '完成后记下继承自哪一份');

  /* 其他功能 */
  await page.goto(URL0 + '?tab=other'); await page.waitForTimeout(600);
  t = await text(page);
  ok(['自动标签处理', '常驻附加指令', '导出纯净正文'].every((x) => t.includes(x)), '其他功能：三项都在');
  const folds = await inLayer(page, (r) => [...r.querySelectorAll('[data-k="card"][data-role="collapse"]')].map((c) => c.getAttribute('data-state')));
  ok(folds.length === 3 && folds.every((x) => x === 'closed'), '其他功能：三个互不相干的小工具各是一张折叠卡片，默认收起', folds);
  const unfold = () => inLayer(page, (r) => { [...r.querySelectorAll('[data-k="card"][data-role="collapse"]:not([data-state="open"]) > [data-k-part="head"]')].forEach((h) => h.click()); });
  await unfold(); await page.waitForTimeout(300);
  await inLayer(page, (r) => [...r.querySelectorAll('[data-k="switch"]')].find((s) => /常驻附加指令/.test(s.getAttribute('aria-label'))).click()); await page.waitForTimeout(150);
  const god = await inLayer(page, (r) => ({ on: [...r.querySelectorAll('[data-k="switch"]')].find((s) => /常驻附加指令/.test(s.getAttribute('aria-label'))).getAttribute('data-state'), toast: (r.querySelector('[data-k="toast"]') || {}).textContent || '' }));
  ok(god.on === 'unchecked' && god.toast.includes('内容还是空的'), '常驻指令内容为空时打不开（用户给定的提示语）', god);
  await clickText(page, '[data-k="button"]', '^处理当前楼层$'); await page.waitForTimeout(300);
  const dlg = await inLayer(page, (r) => { const all = [...r.querySelectorAll('[role="dialog"]')].filter((x) => !x.matches('[data-k="panel"]')); return all.length ? all[all.length - 1].textContent : ''; });
  ok(dlg.includes('刚刚扫出的结果') && dlg.includes('没法撤销'), '处理当前楼层：先弹确认窗，说明这次会改什么', dlg.slice(0, 60));
  await clickText(page, '[data-k="button"]', '^确认执行$'); await page.waitForTimeout(300);
  ok((await text(page)).includes('本次会话：补全 2 处'), '确认后更新本次会话统计');

  /* 对比度：每个页签 × 两档配色 */
  const bad = []; let checked = 0;
  for (const scheme of ['light', 'dark']) {
    for (const tab of ['compress', 'search', 'other', 'update']) {
      await page.goto(URL0 + '?scheme=' + scheme + '&tab=' + tab); await page.waitForTimeout(450);
      if (tab === 'other') { await inLayer(page, (r) => { [...r.querySelectorAll('[data-k="card"][data-role="collapse"]:not([data-state="open"]) > [data-k-part="head"]')].forEach((h) => h.click()); }); await page.waitForTimeout(400); }
      checked += await audit(page, scheme + '/' + tab, bad);
      if (await overflow(page)) { bad.push(scheme + '/' + tab + ' 横向溢出'); }
    }
  }
  ok(bad.length === 0 && checked > 200, '对比度与溢出：4 页签 × 2 档共 ' + checked + ' 处', bad.slice(0, 3));
  ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
  await page.close();

  /* ───────── 引导 ───────── */
  /* 预设设置：「关于」挪走了；写作指导页有自定义文风（新增 → 待保存 → 保存） */
  console.log('\n── 预设设置 · ' + label);
  page = await ctx.newPage();
  errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/design/previews/preset-panel/index.html'); await page.waitForTimeout(700);
  const navT = await inLayer(page, (r) => [...r.querySelectorAll('[data-k="nav"] [data-k-part="item"], [data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].map((x) => x.textContent));
  ok(!navT.some((x) => /关于/.test(x)) && navT.some((x) => /写作指导/.test(x)), '预设设置不再有「关于」', navT);
  if (opts.isMobile) { await inLayer(page, (r) => [...r.querySelectorAll('[data-k="tabs"] > [data-k-part="list"] [data-k-part="tab"]')].find((x) => /写作指导/.test(x.textContent)).focus()); }
  else { await clickText(page, '[data-k="nav"] [data-k-part="item"]', '写作指导'); }
  await page.waitForTimeout(300);
  ok((await text(page)).includes('自定义文风') && (await text(page)).includes('冷硬派'), '写作指导页有自定义文风');
  await clickText(page, '[data-k="setting-section"] [data-k="button"]', '^新增$'); await page.waitForTimeout(300);
  await inLayer(page, (r) => { const i = [...r.querySelectorAll('input')].find((x) => x.placeholder === '给文风起个名字'); i.focus(); });
  await page.keyboard.type('水墨'); await clickText(page, '[data-k="button"]', '^确定$'); await page.waitForTimeout(250);
  t = await text(page);
  ok(t.includes('水墨') && t.includes('待保存') && t.includes('有改动还没保存'), '新增一条：标「待保存」，分组标「有改动还没保存」');
  await clickText(page, '[data-k="setting-section"] [data-k="button"]', '^保存$'); await page.waitForTimeout(200);
  t = await text(page);
  ok(t.includes('水墨') && !t.includes('待保存'), '保存后归为已保存');
  const bad3 = [];
  const c3 = await audit(page, '写作指导', bad3);
  ok(bad3.length === 0 && c3 > 30, '写作指导页对比度：' + c3 + ' 处', bad3);
  ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
  await page.close();

  console.log('\n── 引导 · ' + label);
  page = await ctx.newPage();
  errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  const G0 = base + '/design/previews/guide/index.html';
  await page.goto(G0 + '?reset=1'); await page.waitForTimeout(700);
  const d = await inLayer(page, (r) => ({ ol: r.querySelectorAll('[data-k="prose"] ol').length, table: r.querySelectorAll('[data-k="prose"] table tr').length, h: r.querySelectorAll('[data-k="prose"] h4, [data-k="prose"] h5').length, foot: r.querySelector('[data-k="panel"] > [data-k-part="foot"]').textContent }));
  ok(d.h >= 2 && d.table >= 3 && d.ol <= d.h + 1, '免责声明由预设条目排版：标题、表格，编号列表不被空行拆散', d);
  ok(/我已阅读并确认/.test(d.foot) && !/下一步|上一步/.test(d.foot), '确认前只有「我已阅读并确认」', d.foot);
  if (!opts.isMobile) {
    await clickText(page, '[data-k="nav"] [data-k-part="item"]', '模型'); await page.waitForTimeout(150);
    ok((await inLayer(page, (r) => r.querySelector('[data-k="panel"] > [data-k-part="body"] h2').textContent)) === '免责声明', '确认前点侧栏的后面步骤没反应');
  }
  await clickText(page, '[data-k="panel"] > [data-k-part="foot"] [data-k="button"]', '我已阅读并确认'); await page.waitForTimeout(200);
  ok((await inLayer(page, (r) => r.querySelector('[data-k="panel"] > [data-k-part="body"] h2').textContent)) === '外观', '确认后进入「外观」');
  const skin0 = await inLayer(page, (r) => r.querySelector('[data-k-surface]').getAttribute('data-k-skin'));
  await inLayer(page, (r) => r.querySelectorAll('[data-k="card"][data-role="choice"]')[1].querySelector('[data-k-part="select"]').click()); await page.waitForTimeout(200);
  const skin1 = await inLayer(page, (r) => r.querySelector('[data-k-surface]').getAttribute('data-k-skin'));
  ok(skin0 === 'suiguang' && skin1 === 'paper', '选皮肤立即套用到引导自己', { skin0, skin1 });
  await inLayer(page, (r) => r.querySelectorAll('[data-k="card"][data-role="choice"]')[0].querySelector('[data-k-part="select"]').click()); await page.waitForTimeout(150);
  const next = () => clickText(page, '[data-k="panel"] > [data-k-part="foot"] [data-k="button"]', '^下一步$').then(() => page.waitForTimeout(200));
  await next();
  const modelName = await inLayer(page, (r) => { const c = [...r.querySelectorAll('[data-k="card"][data-role="choice"]')].find((x) => x.getAttribute('data-state') !== 'selected'); c.querySelector('[data-k-part="select"]').click(); return c.querySelector('[data-k-part="title"]').textContent; });
  await page.waitForTimeout(150);
  await next(); await next(); await next();
  const done = await inLayer(page, (r) => ({ h: r.querySelector('[data-k="panel"] > [data-k-part="body"] h2').textContent, t: r.querySelector('[data-k="panel"]').textContent, foot: r.querySelector('[data-k="panel"] > [data-k-part="foot"]').textContent }));
  const short = modelName.split('/').pop().trim();
  ok(done.h === '完成' && done.t.includes(short) && done.t.includes('皮肤 · 碎光'), '完成页汇总这次的选择（模型 ' + short + '）', done.t.slice(-200));
  ok(/完成配置并进入对话/.test(done.foot), '最后一步是「完成配置并进入对话」');
  const bad2 = []; let checked2 = 0;
  for (const scheme of ['light', 'dark']) {
    for (let s = 0; s < 6; s++) {
      await page.goto(G0 + '?reset=1&scheme=' + scheme + '&step=' + s); await page.waitForTimeout(400);
      await page.evaluate((sc) => window.__mgr.setScheme(sc), scheme); await page.waitForTimeout(100);
      checked2 += await audit(page, scheme + '/第' + (s + 1) + '步', bad2);
      if (await overflow(page)) { bad2.push(scheme + '/第' + (s + 1) + '步 横向溢出'); }
    }
  }
  ok(bad2.length === 0 && checked2 > 200, '对比度与溢出：6 步 × 2 档共 ' + checked2 + ' 处', bad2.slice(0, 3));
  ok(errors.length === 0, '没有页面错误', errors.slice(0, 3));
  await ctx.close();
}
await b.close(); server.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
