#!/usr/bin/env node
/**
 * 外链资源兜底（前端契约 6.6）：node test/frontend/browser/remote.mjs
 * 能加载的字体 / 图片 → 换上；打不开的地址（连接被拒）与超时 → 界面照常显示、用系统字体与包内兜底，且不卡住。
 */
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from './audit-lib.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(process.env.KAMI_TOOLS || '/workspace/tools/package.json');
const { chromium } = require('playwright');
const { server, base } = serve(ROOT);
/* 一个永远不响应的服务器：模拟「外链被墙 / 超时」 */
const hang = http.createServer(() => { /* 不回 */ }).listen(0);
const HANG = 'http://127.0.0.1:' + hang.address().port;
let pass = 0, fail = 0;
const ok = (c, l, x) => { c ? pass++ : fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (!c && x !== undefined ? '  ← ' + JSON.stringify(x) : '')); };
const b = await chromium.launch();
const page = await b.newPage();
await page.goto(base + '/test/frontend/playground/index.html');
await page.waitForSelector('kami-layer');
const r = await page.evaluate(async ({ base, HANG }) => {
  /* 直接调运行库里的加载器（测试用本地 http 地址；真实皮肤的清单校验要求 https） */
  const { loadFonts, probeImage } = window.__kamiRemoteForTest;
  const t0 = performance.now();
  const fonts = await loadFonts(document, [
    { family: 'KamiTestOk', src: [base + '/test/frontend/fixtures/test-font.ttf'] },
    { family: 'KamiTestRefused', src: ['http://127.0.0.1:1/nope.woff2'] },
    { family: 'KamiTestHang', src: [HANG + '/slow.woff2'] }
  ], 1500);
  const fontsMs = performance.now() - t0;
  const imgOk = await probeImage(document, base + '/test/frontend/fixtures/remote-image.png', 1500);
  const imgBad = await probeImage(document, HANG + '/x.png', 1500);
  return { fonts, fontsMs, imgOk, imgBad, okInSet: document.fonts.check('16px KamiTestOk'), hangInSet: [...document.fonts].some((f) => f.family.includes('KamiTestHang')) };
}, { base, HANG });
ok(r.fonts.KamiTestOk === 'loaded' && r.okInSet, '能加载的外链字体：注册到主页面并可用', r);
ok(r.fonts.KamiTestRefused === 'failed', '连接被拒的字体：判为失败，交给后面的系统字体', r.fonts);
ok(r.fonts.KamiTestHang === 'failed' && !r.hangInSet, '一直不响应的字体：超时后判失败，不注册', r.fonts);
ok(r.fontsMs < 2500, '超时生效（不会无限等）', Math.round(r.fontsMs));
ok(r.imgOk === true && r.imgBad === false, '外链图片：能加载的换上，打不开的用包内兜底', r);
/* 界面在等待外链期间照常可用：渲染面里的文字有尺寸、按钮能点 */
const usable = await page.evaluate(() => { const b = document.querySelector('kami-layer').shadowRoot.querySelector('[data-k="button"]'); return b.getBoundingClientRect().width > 0; });
ok(usable, '等待外链期间界面照常显示');
await b.close(); server.close(); hang.close();
console.log('\n结果：' + pass + ' / ' + (pass + fail));
process.exit(fail ? 1 : 0);
