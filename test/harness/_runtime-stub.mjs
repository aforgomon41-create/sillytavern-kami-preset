/* 测试用「运行库」桩
 * ------------------------------------------------------------------
 * 面板脚本的组件核心不再各脚本内联，改为从「🧩 运行库」取
 * （见 build/kami-doc.mjs 的 expandUi：惰性 shim，取不到就抛人话错误）。
 * 单测在 vm 沙箱里直接跑脚本源码，那儿没有真运行库，
 * 所以这里给一个**等价的桩**：
 *   · createKamiUi 用真实现（src/ui/core.js）—— 测的还是真组件核心
 *   · KAMI_UI_CSS 用构建期同一个 uiCss() —— 样式与真机逐字节一致
 * 它不模拟 React 那半边（面板迁移完成后另测）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKamiUi } from '../../src/ui/core.js';
import { uiCss } from '../../build/kami-doc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let cachedCss = null;
/* 沙箱里没有 React，所以下面两个工厂退回**原生结构**（与迁移前一致）。
   真机上它们走运行库里的 React + Radix 版本。
   这样面板的业务逻辑与 DOM 断言在单测里仍然跑得通。 */
let lastDoc = null;   /* createKamiUi(doc) 时记下文档，工厂要用它造节点 */

function nativeSwitch(doc, o) {
  var label = doc.createElement('label'); label.className = 'kami-switch';
  var input = doc.createElement('input');
  input.type = 'checkbox'; input.className = 'kami-switch-input';
  input.checked = !!o.checked;
  if (o.attrs) { Object.keys(o.attrs).forEach(function (k) { input.setAttribute(k, o.attrs[k]); }); }
  if (o.label) { input.setAttribute('aria-label', o.label); }
  var track = doc.createElement('span'); track.className = 'kami-switch-track';
  var knob = doc.createElement('span'); knob.className = 'kami-switch-knob';
  track.appendChild(knob); label.appendChild(input); label.appendChild(track);
  if (o.onChange) { input.addEventListener('change', function () { o.onChange(input.checked); }); }
  return { el: label, input: input, setChecked: function (v) { input.checked = !!v; }, destroy: function () { } };
}

function nativeSelect(doc, o) {
  var sel = doc.createElement('select'); sel.className = 'kami-select';
  if (o.attrs) { Object.keys(o.attrs).forEach(function (k) { sel.setAttribute(k, o.attrs[k]); }); }
  if (o.label) { sel.setAttribute('aria-label', o.label); }
  function fill(list) {
    sel.textContent = '';
    (list || []).forEach(function (it) {
      var op = doc.createElement('option'); op.value = it.value; op.textContent = it.label;
      sel.appendChild(op);
    });
  }
  fill(o.options);
  if (o.value !== undefined && o.value !== '') { sel.value = o.value; }
  if (o.onChange) { sel.addEventListener('change', function () { o.onChange(sel.value); }); }
  return { el: sel, setValue: function (v) { sel.value = v; }, setOptions: fill, destroy: function () { } };
}

export function makeRuntimeStub() {
  if (cachedCss === null) { cachedCss = uiCss(ROOT); }
  return {
    version: 'test-stub',
    createKamiUi: function (doc) { lastDoc = doc || lastDoc; return createKamiUi(doc); },
    makeSwitch: function (o) { return nativeSwitch(lastDoc, o || {}); },
    makeSelect: function (o) { return nativeSelect(lastDoc, o || {}); },
    KAMI_UI_CSS: cachedCss,
    React: null,
    ReactDOM: null,
    UI: {},
    primitives: {},
    host: null,
    document: null,
    mount: function () { throw new Error('test-stub 不支持 React 挂载'); },
    ready: function (fn) { try { fn(this); } catch (e) { } return function () { }; }
  };
}
