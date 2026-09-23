#!/usr/bin/env node
/**
 * 皮肤覆盖面矩阵：node .audit/coverage.mjs [id...]
 * 回答一个问题：「这套皮肤到底把契约里那些组件写全了没有」。
 * 每条 = 一个契约 §4.2/§4.4 登记的组件类名，格子 = 该皮肤为它写了多少条规则。
 * 0 = 完全没写（多半是漏），数量悬殊 = 有的皮肤只做了一半。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIN_DIR = path.join(ROOT, 'src', 'skins');

const GROUPS = [
  ['消息楼层：外壳', ['.kami-shell', '.kami-surface', '.kami-head', '.kami-body', '.kami-foot']],
  ['消息楼层：标题与动作', ['.kami-title', '.kami-sub', '.kami-actions', '.kami-bar', '.kami-dot']],
  ['消息楼层：按钮与分段', ['.kami-btn', '.kami-icon-btn', '.kami-seg', '.kami-seg-item', '.kami-chip', '.kami-badge']],
  ['消息楼层：折叠与视图', ['.kami-collapse', '.kami-chev', '.kami-raw', '.kami-md']],
  ['消息楼层：提示与空态', ['.kami-toast', '.kami-empty']],
  ['列表与卡片', ['.kami-list', '.kami-item', '.kami-item-main', '.kami-item-side', '.kami-card',
    '.kami-card-head', '.kami-card-title', '.kami-card-note', '.kami-card-body', '.kami-item-note']],
  ['表单控件', ['.kami-field', '.kami-field-label', '.kami-field-value', '.kami-range',
    '.kami-number', '.kami-text', '.kami-textarea', '.kami-select', '.kami-switch']],
  ['面板骨架', ['.kami-drop', '.kami-tabs', '.kami-tab', '.kami-dots', '.kami-grid', '.kami-scroll', '.kami-resize']],
  ['角标与注释', ['[data-kami-corner', '[data-kami-note-mark', '[data-kami-note]']],
  ['装饰与预览', ['.kami-deco', '.kami-pv', '.kami-guide-pv']],
  ['语义色', ['--kami-kind-action', '--kami-kind-persona', '--kami-kind-plot', '--kami-kind-info',
    '--kami-kind-fun', '--kami-kind-nsfw', '--kami-kind-other']],
];
const STATES = [
  ['选中态 .is-on', /\.is-on/],
  ['禁用态', /disabled/],
  ['悬停 :hover', /:hover/],
  ['焦点 :focus-visible', /:focus-visible/],
  ['展开 [data-kami-open]', /data-kami-open/],
  ['贴底抽屉 sheet', /data-kami-layout/],
  ['明暗档 scheme', /data-kami-scheme/],
  ['密度档 density', /data-kami-density/],
  ['动效档 motion', /data-kami-motion/],
  ['减动效 reduced-motion', /prefers-reduced-motion/],
  ['窄屏 @media', /@media[^{]*max-width/],
  ['容器查询 @container', /@container/],
  ['关键帧 @keyframes', /@keyframes/],
  [':has() 结构判据', /:has\(/],
];

const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(SKIN_DIR).filter(d => fs.existsSync(path.join(SKIN_DIR, d, 'skin.css')));
const data = {};
for (const id of ids) {
  const css = fs.readFileSync(path.join(SKIN_DIR, id, 'skin.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  data[id] = css;
}
const count = (css, needle) => {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (css.match(new RegExp(esc, 'g')) || []).length;
};
const pad = (s, n) => { let w = 0; for (const ch of String(s)) { w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1; } return String(s) + ' '.repeat(Math.max(0, n - w)); };
const head = '  ' + pad('组件 / 状态', 30) + ids.map(i => pad(i, 11)).join('');
console.log(head);
console.log('  ' + '-'.repeat(30 + ids.length * 11));
for (const [title, needles] of GROUPS) {
  console.log('  [' + title + ']');
  for (const n of needles) {
    const cells = ids.map(i => count(data[i], n));
    const mark = cells.map(c => pad(c === 0 ? '—' : String(c), 11)).join('');
    console.log('  ' + pad(n, 30) + mark);
  }
}
console.log('  [状态与档位]');
for (const [title, re] of STATES) {
  const cells = ids.map(i => (data[i].match(new RegExp(re.source, 'g')) || []).length);
  console.log('  ' + pad(title, 30) + cells.map(c => pad(c === 0 ? '—' : String(c), 11)).join(''));
}
console.log('');
console.log('  ' + pad('体积 / 规则条数', 30) + ids.map(i => {
  const css = data[i];
  const rules = (css.match(/\{/g) || []).length;
  return pad((Buffer.byteLength(css) / 1024).toFixed(0) + 'KB/' + rules, 11);
}).join(''));
