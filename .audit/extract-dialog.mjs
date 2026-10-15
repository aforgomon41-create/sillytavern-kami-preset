#!/usr/bin/env node
/**
 * 从 src/scripts/40-预设设置.js 里**抽出**对话模式的几个函数，配上 mock 依赖，
 * 生成 .audit/dialog-extract.cjs 供 test/harness/dialog-mode.mjs 加载。
 *
 * 为什么用「运行时抽取」而不是把它们挪成独立模块：
 *   这几个函数是面板闭包的一部分（要 liveData / eachItem / cardMap / saveVars），
 *   挪出去就得把半个面板传进来。抽取 + mock 是代价最小、又保证**测的是真源码**的做法。
 *   ⚠️ 改了那几个函数就要重跑本脚本（dialog-mode.mjs 会在加载前自动跑一次）。
 *
 * 用法：node .audit/extract-dialog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SRC = path.join(root, 'src', 'scripts', '40-预设设置.js');
const OUT = path.join(here, 'dialog-extract.cjs');

const src = fs.readFileSync(SRC, 'utf8');
const L = src.split(/\r?\n/);

/** 按花括号配平，抓出整个函数声明 */
function grab(name) {
  const i = L.findIndex((l) => l.includes('function ' + name + '('));
  if (i < 0) { throw new Error('源码里找不到 function ' + name + '（改名了？抽取脚本要同步）'); }
  let d = 0, started = false;
  const out = [];
  for (let k = i; k < L.length; k++) {
    out.push(L[k]);
    for (const ch of L[k]) { if (ch === '{') { d++; started = true; } else if (ch === '}') { d--; } }
    if (started && d === 0) { break; }
  }
  return out.join('\n');
}

const NAMES = ['enabledOfId', 'dialogTargets', 'isModeLayerEntry', 'isDialogModeEntry', 'enterDialogMode', 'leaveDialogMode'];

const mocks = [
  '/* 本文件由 .audit/extract-dialog.mjs 生成，不要手改 */',
  'var log = function () { };',
  "var nowText = function () { return '2026-10-15 00:00'; };",
  'var saveVars = function () { };',
  "var DIALOG_MODE_ID = 'd1a10001-0000-4000-8000-000000000003';",
  "var PLAY_MODE_ID = 'd1a10001-0000-4000-8000-000000000002';",
  'var dialogSaved = null;',
  'var VIEW = [];',
  'var eachItem = function (fn) { for (var i = 0; i < VIEW.length; i++) { fn(VIEW[i]); } };',
  'var TARGETS = null;',
  'var dialogModeTargets = function () { return TARGETS; };',
  'var liveData = { ok: true, tree: { tabs: [] } };',

].join('\n');

const body = NAMES.map(grab).join('\n\n');

const tail = [
  'module.exports = {',
  '  setItems: function (a) { VIEW = a; },',
  '  setTargets: function (t) { TARGETS = t; },',
  '  enter: function () { return enterDialogMode(); },',
  '  leave: function () { return leaveDialogMode(); },',
  '  saved: function () { return dialogSaved; },',
  '  clearSaved: function () { dialogSaved = null; },',
  '  isDlgEntry: function (id) { return isDialogModeEntry(id); },',
  '  targets: function () { return dialogTargets(); }',
  '};'
].join('\n');

fs.writeFileSync(OUT, mocks + '\n\n' + body + '\n\n' + tail + '\n', 'utf8');
console.log('已生成 ' + path.relative(root, OUT) + '（' + NAMES.length + ' 个函数，' + (mocks.length + body.length + tail.length) + ' 字）');
