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

export function makeRuntimeStub() {
  if (cachedCss === null) { cachedCss = uiCss(ROOT); }
  return {
    version: 'test-stub',
    createKamiUi: createKamiUi,
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
