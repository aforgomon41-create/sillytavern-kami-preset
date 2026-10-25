/* 运行库：入口
 * ------------------------------------------------------------------
 * 产物是一个自执行 IIFE，构建期被打进「00-运行库.js」脚本里（见 build/build-runtime.mjs）。
 * 它做三件事：
 *   1. 把 React / ReactDOM / Radix 与组件层挂到**宿主窗口**（HOST.KamiRuntime）
 *   2. 提供 ready(fn) 与 waitFor(fn, timeout) 两种取用方式
 *   3. 提供 createRoot 包装：直接往宿主文档里挂载 React 树
 * 面板脚本里这样用：
 *   var RT = window.KamiRuntime || HOST.KamiRuntime;
 *   if (!RT) { 提示「请启用运行库」并退出 }
 *   RT.ready(function (R) { R.createRoot(el).render(R.UI.mount(...)); });
 */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as UI from './ui.jsx';
import { detectHost } from './host.js';
import { createReady } from './ready.js';
/* 老的组件核心（createKamiUi）与它的基础样式：不再由每个面板各内联一份，
   改成运行库提供唯一一份。面板脚本用惰性 shim 取它（见 build/kami-doc.mjs expandUi）。 */
import { createKamiUi } from '../ui/core.js';

/* 构建期注入的基础样式表（foundation.css + 令牌），由 build/build-runtime.mjs 的 define 传入 */
var KAMI_UI_CSS = __KAMI_UI_CSS_JSON__;

var HOST = detectHost(window);
var DOC = HOST && HOST.document ? HOST.document : document;
var RUNTIME_VERSION = '1.0.0';

/* 往宿主文档里挂一棵 React 树。
 * 面板都渲染在宿主页面（不是脚本自己的 iframe），所以根节点必须建在宿主文档里。 */
function mount(container, element) {
  if (!container) { throw new Error('[运行库] mount 的容器为空'); }
  var root = ReactDOMClient.createRoot(container);
  root.render(element);
  return root;
}

/* 卸载并回收一个根 */
function unmount(root) {
  try { if (root && typeof root.unmount === 'function') { root.unmount(); } } catch (e) { }
}

/* 创建一个挂载点（宿主文档里的一块 div），返回 { el, root, render, destroy } */
function createMountPoint(className) {
  var el = DOC.createElement('div');
  if (className) { el.className = className; }
  var root = ReactDOMClient.createRoot(el);
  return {
    el: el,
    root: root,
    render: function (element) { root.render(element); },
    destroy: function () { try { root.unmount(); } catch (e) { } if (el.parentNode) { el.parentNode.removeChild(el); } }
  };
}

var runtime = {
  version: RUNTIME_VERSION,
  React: React,
  ReactDOM: ReactDOM,
  createRoot: ReactDOMClient.createRoot,
  flushSync: ReactDOMClient.flushSync,
  UI: UI,
  primitives: UI.primitives,
  /* 老组件核心（面板还没迁移完时用）与它的基础样式 */
  createKamiUi: createKamiUi,
  KAMI_UI_CSS: KAMI_UI_CSS,
  host: HOST,
  document: DOC,
  mount: mount,
  unmount: unmount,
  createMountPoint: createMountPoint
};

var readyApi = createReady(runtime);

/* 取用方式一：已经能拿到 KamiRuntime 时直接调用（推荐，运行库脚本排第一位时永远成立） */
runtime.ready = readyApi.ready;

/* 取用方式二：拿不到 KamiRuntime 时轮询等待。面板脚本把这段内联进去，
 * 20 行，比给每个面板塞一份运行库便宜得多；也让「运行库被关掉」有明确的人话提示。 */
runtime.waitFor = function () {
  /* 这个函数不在这里用，是给面板脚本抄的模板；保留在 API 上便于统一。 */
  return readyApi.ready;
};

/* 注册到宿主窗口：所有脚本 iframe 都能沿 window 链拿到同一份。
 * 幂等：同名已存在就覆盖成最新的（用户热重载脚本时不会堆一堆旧实例）。 */
try {
  HOST.KamiRuntime = runtime;
  HOST.__KAMI_RUNTIME_READY__ = true;
  /* 可观测标记：宿主 html 上写版本号。装没装上一眼就能看出来
     （真机在元素面板里看，预览台在快照/控制台里看），排查时省很多事。 */
  if (HOST.document && HOST.document.documentElement) {
    try { HOST.document.documentElement.setAttribute('data-kami-runtime', RUNTIME_VERSION); } catch (e0) { }
  }
} catch (e) {
  try { console.error('[运行库] 无法注册到宿主窗口', e); } catch (e2) { }
}

/* 自己这个 iframe 里也放一份，方便脚本直接从 window 取 */
try { window.KamiRuntime = runtime; } catch (e) { }

/* 唤醒在 ready() 里排队的回调 */
try { readyApi.flush(); } catch (e) { }

/* 广播一个事件，给不用轮询的调用方用（可选） */
try {
  var ev = DOC.createEvent('Event');
  ev.initEvent('kami-runtime-ready', true, true);
  DOC.dispatchEvent(ev);
} catch (e) { }

export default runtime;
