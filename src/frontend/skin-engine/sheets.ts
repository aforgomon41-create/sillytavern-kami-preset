/**
 * 样式表共享：一个文档里只有两份样式表（设计系统静态表 + 当前皮肤表），被该文档里所有 Shadow DOM 根共用。
 * 前端契约第 7 节。
 *
 * ⚠️ 可构造样式表必须用**目标文档自己的** CSSStyleSheet 构造器创建：脚本跑在酒馆助手的 iframe 里，
 *    直接 new CSSStyleSheet() 建出来的属于 iframe 的文档，挂到酒馆主页面的 Shadow DOM 上会抛 NotAllowedError。
 * 不支持可构造样式表时，退回为每个根放两个 <style>，更新时逐个改写。
 */

type Root = ShadowRoot;

interface DocLike { defaultView: (Window & typeof globalThis) | null; createElement(tag: 'style'): HTMLStyleElement }

export class StyleHub {
  private readonly doc: Document;
  private readonly constructable: boolean;
  private dsSheet: CSSStyleSheet | null = null;
  private skinSheet: CSSStyleSheet | null = null;
  private dsText = '';
  private skinText = '';
  private readonly roots = new Map<Root, { ds: HTMLStyleElement; skin: HTMLStyleElement } | null>();

  constructor(doc: Document, opts: { forceFallback?: boolean } = {}) {
    this.doc = doc;
    const win = (doc as unknown as DocLike).defaultView;
    let ok = false;
    try {
      ok = !opts.forceFallback && !!win && 'adoptedStyleSheets' in win.Document.prototype && typeof win.CSSStyleSheet === 'function'
        && typeof (win.CSSStyleSheet.prototype as CSSStyleSheet).replaceSync === 'function';
      if (ok && win) { this.dsSheet = new win.CSSStyleSheet(); this.skinSheet = new win.CSSStyleSheet(); }
    } catch (e) { ok = false; }
    this.constructable = ok;
  }

  /** 是否在用可构造样式表（否则是每个根两个 <style>） */
  get shared(): boolean { return this.constructable; }

  /** 现在的设计系统与皮肤样式原文（消息前端要从里面抽出正文的规则，改写成页面 DOM 里用的样式） */
  texts(): { ds: string; skin: string } { return { ds: this.dsText, skin: this.skinText }; }

  setDesignSystem(css: string): void {
    this.dsText = css;
    if (this.dsSheet) { this.dsSheet.replaceSync(css); }
    for (const els of this.roots.values()) { if (els) { els.ds.textContent = css; } }
  }

  setSkin(css: string): void {
    this.skinText = css;
    if (this.skinSheet) { this.skinSheet.replaceSync(css); }
    for (const els of this.roots.values()) { if (els) { els.skin.textContent = css; } }
  }

  /** 把两份样式表挂到一个 Shadow DOM 根上；返回卸载函数 */
  attach(root: Root): () => void {
    if (this.roots.has(root)) { return () => this.detach(root); }
    if (this.constructable && this.dsSheet && this.skinSheet) {
      const others = Array.from(root.adoptedStyleSheets || []).filter((s) => s !== this.dsSheet && s !== this.skinSheet);
      root.adoptedStyleSheets = [this.dsSheet, this.skinSheet, ...others];
      this.roots.set(root, null);
    } else {
      const ds = this.doc.createElement('style'), skin = this.doc.createElement('style');
      ds.setAttribute('data-k-style', 'ds'); skin.setAttribute('data-k-style', 'skin');
      ds.textContent = this.dsText; skin.textContent = this.skinText;
      root.insertBefore(skin, root.firstChild); root.insertBefore(ds, skin);
      this.roots.set(root, { ds, skin });
    }
    return () => this.detach(root);
  }

  detach(root: Root): void {
    if (!this.roots.has(root)) { return; }
    const els = this.roots.get(root);
    if (els) { els.ds.remove(); els.skin.remove(); }
    else { try { root.adoptedStyleSheets = Array.from(root.adoptedStyleSheets).filter((s) => s !== this.dsSheet && s !== this.skinSheet); } catch (e) { /* 根已失效 */ } }
    this.roots.delete(root);
  }

  get size(): number { return this.roots.size; }
}
