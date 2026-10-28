/**
 * Radix 在 Shadow DOM 里的两处构建期修补（前端契约附录 A；技术验证 spikes/radix-isolation/）
 * ------------------------------------------------------------------
 * ① document.activeElement → 钻进 Shadow DOM 取真实焦点的读取器
 *    （focus-scope / select / menu / roving-focus 直接读它，Shadow DOM 里读到的是宿主元素）
 * ② FocusScope 的 focusin/focusout 监听从 document 改到容器所在的根节点
 *    （冒泡到 document 的事件目标被改写成宿主元素，焦点陷阱误判逃逸、把焦点拉回去）
 * 修补点数量不对会直接构建失败：Radix 升级后必须重跑隔离验证。
 */
import fs from 'node:fs';

export const DEEP_ACTIVE_BANNER = `Object.defineProperty(globalThis, '__kamiDeepActive', { configurable: true, get: function () {
  var a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) { a = a.shadowRoot.activeElement; } return a; } });`;

export const DEEP_ACTIVE_DEFINE = { 'document.activeElement': 'globalThis.__kamiDeepActive' };

const FOCUS_RE = /document\.(add|remove)EventListener\("focus(in|out)"/g;

export const focusScopeRootPlugin = {
  name: 'kami-focus-scope-root',
  setup(build) {
    build.onLoad({ filter: /react-focus-scope[\\/]dist[\\/]index\.mjs$/ }, async (args) => {
      const src = await fs.promises.readFile(args.path, 'utf8');
      const n = (src.match(FOCUS_RE) || []).length;
      if (n !== 4) { throw new Error('FocusScope 修补点数量不对（期望 4，实际 ' + n + '）：Radix 版本可能变了，先重跑 spikes/radix-isolation'); }
      return {
        contents: src.replace(FOCUS_RE, (m, verb, dir) =>
          '(container && container.getRootNode ? container.getRootNode() : document).' + verb + 'EventListener("focus' + dir + '"'),
        loader: 'js'
      };
    });
  }
};

/** 给 esbuild 选项套上两处修补 */
export function withRadixPatches(options) {
  return Object.assign({}, options, {
    define: Object.assign({}, options.define || {}, DEEP_ACTIVE_DEFINE),
    banner: { js: DEEP_ACTIVE_BANNER + (options.banner && options.banner.js ? '\n' + options.banner.js : '') },
    plugins: [focusScopeRootPlugin].concat(options.plugins || [])
  });
}
