/**
 * 外链资源加载（前端契约 6.6）：字体与图片都**不阻塞界面**、都有超时、失败时自动用兜底。
 * · 字体：用宿主文档自己的 FontFace 构造器在酒馆主页面注册（Shadow DOM 里的 @font-face 不生效；
 *   脚本跑在 iframe 里，必须用目标文档的构造器，否则挂不上）。注册前，字体栈后面的系统字体已经在显示；
 *   加载成功才替换（等价于 font-display: swap），失败或超时就一直用系统字体。
 * · 图片：先用包内兜底立刻显示；后台试外链，成功才换成外链地址。
 * 同一资源一次会话只试一次（结果缓存），换皮肤再换回来不会重复请求。
 */
import type { FontDef } from '../skin-engine/package';
import FONT_SLICES from './font-slices.json';

/** 把分片简写（src 带 {slice} + slices 片号）展开成逐片的字体定义 */
export function expandSlices(fonts: FontDef[]): FontDef[] {
  const table = FONT_SLICES as Record<string, string>;
  const out: FontDef[] = [];
  for (const f of fonts) {
    if (!f.slices) { out.push(f); continue; }
    for (const k of f.slices) {
      const range = table[k];
      if (!range) { continue; }
      const one: FontDef = { family: f.family, src: f.src.map((u) => u.split('{slice}').join(k)), unicodeRange: range };
      if (f.weight) { one.weight = f.weight; }
      if (f.style) { one.style = f.style; }
      out.push(one);
    }
  }
  return out;
}

/** lazy：分片字体（带 unicodeRange）只注册不预载，浏览器遇到用得着的字才下载那一片（中文字体一百多片，全部预载要好几 MB） */
export type LoadState = 'loading' | 'loaded' | 'failed' | 'lazy';
const fontCache = new Map<string, Promise<LoadState>>();
const imageCache = new Map<string, Promise<boolean>>();

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(onTimeout), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(onTimeout); });
  });
}

/** 注册并加载外链字体；返回每个字体的结果（不必等它：界面先用系统字体） */
export function loadFonts(doc: Document, fonts: FontDef[], timeoutMs = 4000): Promise<Record<string, LoadState>> {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const out: Record<string, Promise<LoadState>> = {};
  for (const f of expandSlices(fonts)) {
    const key = f.family + '|' + f.src.join(',') + '|' + (f.weight || '') + '|' + (f.style || '') + '|' + (f.unicodeRange || '');
    let p = fontCache.get(key);
    if (!p) {
      p = (async (): Promise<LoadState> => {
        if (!win || typeof win.FontFace !== 'function' || !doc.fonts) { return 'failed'; }
        const src = f.src.map((u) => 'url("' + u.replace(/"/g, '%22') + '")' + (/\.woff2(\?|$)/i.test(u) ? ' format("woff2")' : /\.woff(\?|$)/i.test(u) ? ' format("woff")' : '')).join(', ');
        const desc: FontFaceDescriptors = { display: 'swap' };
        if (f.weight) { desc.weight = f.weight; }
        if (f.style) { desc.style = f.style; }
        if (f.unicodeRange) { desc.unicodeRange = f.unicodeRange; }
        const face = new win.FontFace(f.family, src, desc);
        if (f.unicodeRange) { doc.fonts.add(face); return 'lazy'; }
        const ok = await withTimeout(face.load().then(() => true), timeoutMs, false);
        if (!ok) { return 'failed'; }
        doc.fonts.add(face);
        return 'loaded';
      })();
      fontCache.set(key, p);
    }
    out[f.family + (f.unicodeRange ? '#' + f.unicodeRange : '')] = p;
  }
  return Promise.all(Object.entries(out).map(async ([k, v]) => [k, await v] as const)).then((xs) => Object.fromEntries(xs));
}

/** 试一张外链图片能不能加载（用宿主文档的 Image） */
export function probeImage(doc: Document, url: string, timeoutMs = 4000): Promise<boolean> {
  let p = imageCache.get(url);
  if (!p) {
    p = withTimeout(new Promise<boolean>((resolve, reject) => {
      const win = doc.defaultView as (Window & typeof globalThis) | null;
      if (!win) { reject(new Error('no window')); return; }
      const img = new win.Image();
      img.onload = (): void => resolve(img.naturalWidth > 0);
      img.onerror = (): void => resolve(false);
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    }), timeoutMs, false);
    imageCache.set(url, p);
  }
  return p;
}

/** 测试用：清空缓存 */
export function resetRemoteCache(): void { fontCache.clear(); imageCache.clear(); }
