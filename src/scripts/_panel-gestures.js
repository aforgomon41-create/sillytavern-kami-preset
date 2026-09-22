/* ============================================================
 * 面板手势（共享模块，不是独立脚本 —— meta.json 里没有它）
 * ------------------------------------------------------------
 * 三个手势，两个面板（30-皮肤管理 / 40-预设设置）共用同一份实现：
 *   ① 标题栏下拉        → 收回面板（仅窄屏贴底抽屉）
 *   ② 内容区滚到顶再下拉 → 收回面板（仅窄屏贴底抽屉）
 *   ③ 正文左右滑        → 切上一个/下一个 tab（两种模式都有）
 *
 * 它**不认识任何面板结构**：挂哪个元素、要做什么，全部由调用方传进来。
 * 构建期内联进脚本：build/kami-doc.mjs 的 expandPanelGestures（去掉行首 export）。
 *
 * 调用方（cfg）：
 *   root        面板根元素，事件挂在这上面（必填）
 *   pane        内容滚动区元素，或返回它的函数（判断「滚到顶」用）
 *   handle      标题栏元素，或返回它的函数（① 的起点）
 *   tabs        tab 行元素，或返回它的函数（起点在它上面时一律不接管）
 *   onClose     收回面板（必填）
 *   onStep      切 tab 的回调，参数 dir = +1 下一个 / -1 上一个（不传则 ③ 不生效）
 *   isSheet     返回「是不是窄屏贴底抽屉」（①② 只在抽屉模式下生效）
 *   closeDy     ①② 的关闭阈值，默认 90（与皮肤管理面板原有实现一致）
 *   swipeAxis   判方向的最小位移，默认 12（小于它不判方向，避免误触）
 *   swipeSwitch 切 tab 的位移阈值，默认 48
 * 返回 { destroy }，收回面板时调一次解绑。
 *
 * 三条实现约定：
 *   · 横向 vs 纵向：横向位移要**明显大于**纵向（≥1.2 倍）且超过阈值才算切 tab；
 *     判定为横向后才 preventDefault，纵向滚动的默认行为一律放行。
 *   · 指针来源分开：触屏走 touch 事件（能 preventDefault 又不吃掉纵向滚动），
 *     鼠标走 pointer 事件且只认 pointerType === 'mouse'，两边不会重复处理。
 *   · 事件只挂在 root 上，root 之外的节点（聊天楼层等）一个都不碰。
 * ============================================================ */

export function bindPanelGestures(cfg) {
  var root = cfg && cfg.root;
  if (!root || !root.addEventListener) { return null; }
  var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);

  var CLOSE_DY = cfg.closeDy || 90;
  var AXIS = cfg.swipeAxis || 12;
  var SWITCH = cfg.swipeSwitch || 48;
  var RATIO = 1.2;          // 横向要明显大于纵向才算切 tab
  var TOP_SLOP = 2;         // 内容区滚到顶的容差（与皮肤管理面板原有判断一致）

  function el(v) { return typeof v === 'function' ? v() : v; }
  function sheet() { return cfg.isSheet ? !!cfg.isSheet() : false; }

  /* 从 node 往上找：是否落在 ancestor 里面（含自身） */
  function inside(node, ancestor) {
    if (!ancestor) { return false; }
    while (node) {
      if (node === ancestor) { return true; }
      node = node.parentNode;
    }
    return false;
  }
  /* 从 node 往上找带某属性的祖先（含自身），最多找到 root 为止 */
  function attrAncestor(node, name) {
    while (node && node !== root) {
      if (node.getAttribute && node.getAttribute(name) != null) { return node; }
      node = node.parentNode;
    }
    return null;
  }
  /* 内容滚动区：往上找 pane 元素本身 */
  function paneOf(node) {
    var p = el(cfg.pane);
    if (!p) { return null; }
    return inside(node, p) ? p : null;
  }
  /* 起点归类：返回 null 表示「这个手势不归我们管」 */
  function kindOf(target) {
    if (!target) { return null; }
    var tabs = el(cfg.tabs);
    if (tabs && inside(target, tabs)) { return null; }
    var rz = attrAncestor(target, 'data-kami-act');
    if (rz && rz.getAttribute('data-kami-act') === 'resize') { return null; }
    var handle = el(cfg.handle);
    if (handle && inside(target, handle)) {
      /* 标题栏里的按钮（关闭等）不参与手势 */
      if (target.closest && target.closest('button')) { return null; }
      return { top: true };
    }
    var p = paneOf(target);
    if (p) { return { top: p.scrollTop <= TOP_SLOP }; }
    return null;
  }

  var st = null;

  function begin(src, target, x, y) {
    st = null;
    var k = kindOf(target);
    if (!k) { return; }
    st = { src: src, x: x, y: y, axis: '', dx: 0, dy: 0, top: k.top };
  }

  function move(ev, x, y) {
    if (!st) { return; }
    var dx = x - st.x, dy = y - st.y;
    if (!st.axis) {
      if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) { return; }
      st.axis = (Math.abs(dx) > Math.abs(dy) * RATIO) ? 'x' : 'y';
    }
    if (st.axis === 'x') {
      st.dx = dx;
      /* 横向归我们：掐掉浏览器的默认行为（免得它顺手滚了纵向 / 当成后退） */
      if (cfg.onStep && ev.cancelable) { ev.preventDefault(); }
      return;
    }
    /* 纵向：只有「抽屉 + 起点在顶 + 往下拖」才是下拉收回；其它一律放行给原生滚动 */
    if (!sheet() || !st.top || dy <= 0) { return; }
    st.dy = dy;
    root.style.transform = 'translateY(' + dy + 'px)';
  }

  function finish(src) {
    if (!st) { return; }
    if (src && st.src !== src) { return; }
    var s = st;
    st = null;
    if (s.dy) { root.style.transform = ''; }
    if (s.axis === 'x' && cfg.onStep && Math.abs(s.dx) >= SWITCH) {
      cfg.onStep(s.dx < 0 ? 1 : -1);
      return;
    }
    if (s.dy > CLOSE_DY) { cfg.onClose(); }
  }

  /* ── 触屏：touch 事件（passive:false，只有判定横向才 preventDefault） ── */
  function onTouchStart(ev) {
    if (ev.touches.length !== 1) { st = null; return; }
    begin('touch', ev.target, ev.touches[0].clientX, ev.touches[0].clientY);
  }
  function onTouchMove(ev) {
    if (!st || st.src !== 'touch' || ev.touches.length !== 1) { return; }
    move(ev, ev.touches[0].clientX, ev.touches[0].clientY);
  }
  function onTouchEnd() { finish('touch'); }
  function onTouchCancel() {
    if (st && st.src === 'touch') { if (st.dy) { root.style.transform = ''; } st = null; }
  }

  /* ── 鼠标：pointer 事件，但只认 pointerType === 'mouse'（触屏交给上面那套） ── */
  function onPointerDown(ev) {
    if (ev.pointerType !== 'mouse') { return; }
    if (ev.button !== undefined && ev.button !== 0) { return; }
    begin('mouse', ev.target, ev.clientX, ev.clientY);
  }
  function onPointerMove(ev) {
    if (!st || st.src !== 'mouse' || ev.pointerType !== 'mouse') { return; }
    move(ev, ev.clientX, ev.clientY);
  }
  function onPointerEnd(ev) {
    if (ev && ev.pointerType && ev.pointerType !== 'mouse') { return; }
    finish('mouse');
  }

  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: false });
  root.addEventListener('touchend', onTouchEnd);
  root.addEventListener('touchcancel', onTouchCancel);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerEnd);
  root.addEventListener('pointercancel', onPointerEnd);

  var destroy = function () {
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchCancel);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerEnd);
    root.removeEventListener('pointercancel', onPointerEnd);
    var s = st;
    st = null;
    if (s && s.dy) { root.style.transform = ''; }
  };
  return { destroy: destroy };
}
