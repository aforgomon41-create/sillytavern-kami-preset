import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRegexList, expandForPreview, expandDecor, expandBaseCssJs, expandPresetParse, expandPanelGestures, expandGuideCopy } from '../../build/kami-doc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = (function () { const i = process.argv.indexOf('--port'); return i >= 0 ? Number(process.argv[i + 1]) : 8765; })();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };

/* ── /vendor/<库>.js：把**本机酒馆自带的**第三方库按「酒馆页面」的身份发给预览台 ──
   为什么需要：消息 iframe 里的前端**不内联** markdown 库，而是沿父窗口链去拿酒馆页面上的
   window.showdown（酒馆 public/lib.js 的 initLibraryShims 挂上去的）。预览台要测这条链路，
   就得让父窗口（预览台页面自己）也有同样的两个库。
   路径是本机约定，找不到就 404（前端会安静退回极简渲染，预览台不因此坏掉）；
   要换机器：设环境变量 KAMI_ST_ROOT=<酒馆根目录>，多个目录用 ; 分隔。 */
const LIB_ROOTS = (process.env.KAMI_ST_ROOT || [
  'D:/sillytavern-software/SillyTavern Launcher GUI/data/sillytavern/1.18.0',
  'D:/SillyTavern/SillyTavern',
].join(';')).split(';').map(s => s.trim()).filter(Boolean);
const VENDOR = {
  'showdown.js': 'node_modules/showdown/dist/showdown.min.js',
  'dompurify.js': 'node_modules/dompurify/dist/purify.min.js',
};
function vendorFile(name) {
  const rel = VENDOR[name];
  if (!rel) { return null; }
  for (const root of LIB_ROOTS) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) { return p; }
  }
  return null;
}

const DEMO = {
  think: [
    '## 理解现状',
    '',
    '- 时间：深夜，约莫十一点',
    '- 地点：卧室，床上',
    '- 阶段：起始（NSFW：调情 / 前戏预备）',
    '',
    '**关键点**：如果她此刻选择后退，整条线都会滑向另一种结局。',
    '',
    '> 这里可以放任意 markdown，包括 \`行内代码\` 与列表。',
    '',
    '### 下一步',
    '',
    '1. 先确认玩家想要的方向',
    '2. 再决定要不要把节奏推快',
    ''
  ].join(String.fromCharCode(10)),
  options: JSON.stringify([
    { title: '直接拉入怀中', type: '行动', content: '伸手一把扣住她的手腕，顺势将整个人拉进怀里。' },
    { title: '戏谑调侃她的身材', type: '性格', content: '嘴角勾起一抹坏笑，抬起手机在她面前晃了晃。' },
    { title: '正面确认她的心意', type: '推进', content: '收起手机坐起身来，目光直视她泛红的双眼。' },
    { title: '追问她的拍摄动机', type: '信息', content: '冷静地询问她今晚反常的真正原因。' },
    { title: '装傻充愣转移话题', type: '搞笑', content: '指着她身上宽大的衬衫大呼小叫。' },
    { title: '指尖触碰透光的领口', type: 'nsfw', content: '一言不发地抬起手，指尖顺着敞开的领口缓缓滑入。' }
  ], null, 2)
};

function newestPreset() {
  const dir = path.join(ROOT, 'dist');
  if (!fs.existsSync(dir)) { return null; }
  let best = null, bestN = -1;
  for (const f of fs.readdirSync(dir)) {
    /* 现行 kami-v0.90-113-20260923.json、曾用 卡密预设v0.90-52-20260922.json 与旧命名（0.9-52 / 0.9-260917-51）都认 */
    let m = /^(?:kami-|卡密预设)v\d+\.\d+-(\d{1,4})-\d{8}\.json$/i.exec(f);
    if (m) {
      const n2 = Number(m[1]);
      if (n2 > bestN) { bestN = n2; best = path.join(dir, f); }
      continue;
    }
    m = /^(?:kami-|卡密预设)0\.9-(?:\d{6}-)?(\d{1,4})\.json$/i.exec(f);
    if (!m) { continue; }
    const n = Number(m[1]);
    if (n > bestN) { bestN = n; best = path.join(dir, f); }
  }
  return best;
}
function collectSkins() {
  const dir = path.join(ROOT, 'src', 'skins');
  const out = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const d = path.join(dir, name);
      if (!fs.statSync(d).isDirectory()) { continue; }
      const mp = path.join(d, 'skin.json'), cp = path.join(d, 'skin.css');
      if (!fs.existsSync(mp) || !fs.existsSync(cp)) { continue; }
      const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
      out.push({ ...m, css: fs.readFileSync(cp, 'utf8') });
    }
  }
  return out;
}
function presetScripts() {
  const p = newestPreset();
  return p ? JSON.parse(fs.readFileSync(p, 'utf8')).extensions.tavern_helper.scripts : null;
}
function scriptIndex(file) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'scripts', 'meta.json'), 'utf8'));
  return meta.findIndex(m => m.file === file);
}
function devScript(file) {
  const src = path.join(ROOT, 'src', 'scripts', file);
  if (!fs.existsSync(src)) { return null; }
  let code = fs.readFileSync(src, 'utf8');
  if (code.includes('@@KAMI_SKINS@@')) {
    const skins = collectSkins();
    if (!skins.length) {
      const scripts = presetScripts();
      const i = scriptIndex(file);
      if (scripts && scripts[i]) { return scripts[i].content; }
    }
    code = code.replace('/* @@KAMI_SKINS@@ */', 'var SKINS = ' + JSON.stringify(skins) + ';');
  }
  /* 与 build.mjs 一致：把 src/decor/*.js 内联进来，预览台才能实时读 src（不需要构建） */
  code = expandDecor(ROOT, code);
  /* 与 build.mjs 一致：兜底皮肤（src/skin/base.css）与预设解析器（test/harness/preset-parse.mjs） */
  code = expandBaseCssJs(ROOT, code);
  code = expandPresetParse(ROOT, code);
  /* 与 build.mjs 一致：面板手势共享模块（src/scripts/_panel-gestures.js） */
  code = expandPanelGestures(ROOT, code);
  /* 与 build.mjs 一致：引导文案表（design/copy/guide-copy.json）。漏了它，预览台里的引导
     只会说脚本内置的中性兜底文案，看到的就不是真机上的样子。 */
  code = expandGuideCopy(ROOT, code);
  return code;
}
function builtScript(file) {
  const scripts = presetScripts();
  if (!scripts) { return null; }
  const i = scriptIndex(file);
  return (i >= 0 && scripts[i]) ? scripts[i].content : null;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let p = decodeURIComponent(url.pathname);
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

  if (p.startsWith('/dev/') || p.startsWith('/built/')) {
    const dev = p.startsWith('/dev/');
    const file = p.slice(dev ? 5 : 7);
    const code = dev ? devScript(file) : builtScript(file);
    if (code == null) { send(404, 'text/plain', 'no script: ' + file); return; }
    send(200, 'text/javascript; charset=utf-8', code);
    return;
  }

  /* 真前端文档：/doc/think?demo=1 或 /doc/options?payload=<原文> */
  if (p.startsWith('/doc/')) {
    const name = p.slice(5);
    if (name !== 'think' && name !== 'options') { send(404, 'text/plain', 'no doc: ' + name); return; }
    const payload = url.searchParams.get('payload') != null ? url.searchParams.get('payload') : DEMO[name];
    send(200, 'text/html; charset=utf-8', expandForPreview(ROOT, name, payload));
    return;
  }

  /* 本机酒馆自带的第三方库（markdown 渲染链路用，见上方 LIB_ROOTS 的说明） */
  if (p.startsWith('/vendor/')) {
    const vf = vendorFile(p.slice(8));
    if (!vf) { send(404, 'text/plain', 'no vendor lib: ' + p.slice(8) + '（设 KAMI_ST_ROOT 指向酒馆根目录）'); return; }
    send(200, 'text/javascript; charset=utf-8', fs.readFileSync(vf));
    return;
  }

  /* 展开后的正则（供排查用）：/regex */
  if (p === '/regex') {
    const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'regex', 'list.json'), 'utf8'));
    const expanded = expandRegexList(ROOT, list).map(r => ({ name: r.scriptName, bytes: Buffer.byteLength(r.replaceString || ''), disabled: !!r.disabled, markdownOnly: !!r.markdownOnly, promptOnly: !!r.promptOnly }));
    send(200, 'application/json; charset=utf-8', JSON.stringify(expanded, null, 1));
    return;
  }
  if (p === '/skins') {
    send(200, 'application/json; charset=utf-8', JSON.stringify(collectSkins().map(s => ({ id: s.id, name: s.name, button: s.button })), null, 1));
    return;
  }

  if (p === '/') { p = '/test/harness/preview.html'; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { send(403, 'text/plain', 'no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { send(404, 'text/plain', 'not found: ' + p); return; }
    send(200, MIME[path.extname(file)] || 'application/octet-stream', buf);
  });
}).listen(PORT, '127.0.0.1', () => console.log('harness http://127.0.0.1:' + PORT + '/  |  /doc/<think|options>  /dev/<脚本>  /built/<脚本>  /skins  /regex'));
