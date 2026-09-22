/* ============================================================
 * 卡密预设 · 真 3D d20 装饰模块（KamiD20）
 * ------------------------------------------------------------
 * 它只做三件事：
 *   1. 把前端预留的空槽 span.kami-deco[data-kami-deco=d20] 升级成
 *      span.kami-d20 > span.kami-d20-stage > span.kami-d20-body > 20 x span.kami-d20-face > i
 *   2. 初始化时算一次二十面体 20 个面片的位姿（12 顶点 -> 枚举 20 个三角面 ->
 *      面法线 -> rotateY(ry) rotateX(rx) translateZ(R)），之后不再逐帧计算
 *   3. 点击 / 回车 -> 随机选一面 -> 容器 transform 多转两圈 -> CSS transition 缓动停住
 *
 * 为什么不用 WebGL / canvas 逐帧绘制：骰子会出现在每一个聊天楼层，
 * 而浏览器同时存在的 WebGL 上下文有硬上限，那样会直接爆掉。
 * 这里全程只有 20 个静态面片 + 容器上的一个 transform，闲置时零开销。
 *
 * 本文件是独立 IIFE：没有 import、没有外部依赖、不读全局变量。
 * 由「🎨 皮肤管理」在构建期内联（build/kami-doc.mjs），注入到酒馆页面与每个
 * 消息 iframe；注入后暴露 window.KamiD20 = { mount(doc), destroy(doc), roll(el), geometry() }。
 * 几何与行为在这里，配色与排版归皮肤（.kami-d20-*），契约见 docs/皮肤契约.md 第 8 节。
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) { return; }

  var VERSION = '1.0';
  var SEL = '.kami-deco[data-kami-deco="d20"]';
  var STYLE_ID = 'kami-d20-css';
  var FALLBACK_BOX = 32;   /* 槽位还没量到尺寸（display:none）时的临时尺寸，ResizeObserver 会纠正 */
  var INNER = 0.9;         /* 内层三角相对外层的收缩比例：外层底色就是棱边 */
  var API = {};
  var records = [];
  /* 计数（排障用）：挂载次数 / 真正重算位姿的次数 / ResizeObserver 回调次数 */
  var STATS = { mounts: 0, upgrades: 0, layouts: 0, ro: 0, teardowns: 0 };

  /* ───────── 向量小工具 ───────── */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vlen(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vdist(a, b) { return vlen(sub(a, b)); }
  function fmt(v) { return Math.round(v * 1000) / 1000; }
  function fmt6(v) { return Math.round(v * 1e6) / 1e6; }
  var DEG = 180 / Math.PI;

  /* ───────── 二十面体：一次性几何 ─────────
   * 顶点取 (0, ±1, ±PHI) (±1, ±PHI, 0) (±PHI, 0, ±1)，缩放到外接半径 = 1。
   * 面 = 三边都等于棱长的顶点三元组（共 20 个）。
   * 位姿：CSS 的 transform: rotateY(ry) rotateX(rx) translateZ(R) 把面片的局部 +Z
   * 映射到 rotateY(ry)rotateX(rx) 作用在 (0,0,1) 上，即 (cos rx sin ry, -sin rx, cos rx cos ry)。
   * 令它等于面法线 n，解出 rx = -asin(ny)，ry = atan2(nx, nz)。
   * 反过来把第 k 面转到正对镜头，容器要写 rotateZ(a) rotateX(-rx) rotateY(-ry)（a 取 360 的整数倍，数字才是正的）。
   */
  function buildGeom() {
    var PHI = (1 + Math.sqrt(5)) / 2;
    var K = 1 / Math.sqrt(1 + PHI * PHI);
    var SIG = [1, -1];
    var verts = [], i, j, k, a, b, p;
    for (i = 0; i < 2; i++) {
      a = SIG[i];
      for (j = 0; j < 2; j++) {
        b = SIG[j] * PHI;
        verts.push([0, a, b], [a, b, 0], [b, 0, a]);
      }
    }
    for (i = 0; i < verts.length; i++) {
      verts[i][0] *= K; verts[i][1] *= K; verts[i][2] *= K;
    }
    var edge = Infinity;
    for (i = 0; i < verts.length; i++) {
      for (j = i + 1; j < verts.length; j++) { edge = Math.min(edge, vdist(verts[i], verts[j])); }
    }
    var raw = [];
    for (i = 0; i < verts.length; i++) {
      for (j = i + 1; j < verts.length; j++) {
        if (Math.abs(vdist(verts[i], verts[j]) - edge) > 1e-6) { continue; }
        for (k = j + 1; k < verts.length; k++) {
          if (Math.abs(vdist(verts[j], verts[k]) - edge) > 1e-6) { continue; }
          if (Math.abs(vdist(verts[i], verts[k]) - edge) > 1e-6) { continue; }
          raw.push([i, j, k]);
        }
      }
    }
    var maxAbs = 0, silR = 0;
    var table = raw.map(function (idx) {
      var A = verts[idx[0]], B = verts[idx[1]], C = verts[idx[2]], t;
      var n = unit(cross(sub(B, A), sub(C, A)));
      var c = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      if (dot(n, c) < 0) { t = B; B = C; C = t; n = unit(cross(sub(B, A), sub(C, A))); }
      var rIn = dot(c, n);
      var rx = -Math.asin(Math.max(-1, Math.min(1, n[1])));
      var ry = Math.atan2(n[0], n[2]);
      /* 面片局部坐标轴：u = rotateY(ry)rotateX(rx) 作用在 x 轴上，v 作用在 y 轴上 */
      var u = [Math.cos(ry), 0, -Math.sin(ry)];
      var v = [Math.sin(rx) * Math.sin(ry), Math.cos(rx), Math.sin(rx) * Math.cos(ry)];
      /* 把三个顶点投影到「外接半径 = 1 的那张平面」上（面心在 rIn 处，故除以 rIn） */
      var pts = [A, B, C].map(function (P) {
        var w = sub(P, c);
        return [dot(w, u) / rIn, dot(w, v) / rIn];
      });
      for (var q = 0; q < 3; q++) {
        maxAbs = Math.max(maxAbs, Math.abs(pts[q][0]), Math.abs(pts[q][1]));
      }
      /* 正面朝镜头时的轮廓半径（用来决定外接半径 R，让骰子正好填满槽位）。
         姿态是 rotateX(-rx) rotateY(-ry)：先绕 Y 转 -ry，再绕 X 转 -rx，顺序不能反。 */
      var cz = Math.cos(rx), sz = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      for (var m = 0; m < verts.length; m++) {
        var P2 = verts[m];
        var q0 = cy * P2[0] - sy * P2[2];
        var q2 = sy * P2[0] + cy * P2[2];
        var w1 = cz * P2[1] + sz * q2;
        silR = Math.max(silR, Math.sqrt(q0 * q0 + w1 * w1));
      }
      return { n: n, rx: rx, ry: ry, rIn: rIn, pts: pts };
    });

    /* 反面配对：法线互为反向的两个面，数值和为 21（真实 d20 的排法） */
    var used = [], pairs = [], x, y;
    for (i = 0; i < table.length; i++) { used.push(false); }
    for (i = 0; i < table.length; i++) {
      if (used[i]) { continue; }
      for (j = i + 1; j < table.length; j++) {
        if (used[j]) { continue; }
        if (dot(table[i].n, table[j].n) < -0.9999) { pairs.push([i, j]); used[i] = true; used[j] = true; break; }
      }
    }
    for (k = 0; k < pairs.length; k++) {
      x = pairs[k][0]; y = pairs[k][1];
      table[x].value = k + 1;
      table[y].value = 20 - k;
    }
    table.sort(function (m1, m2) { return m1.value - m2.value; });

    return {
      verts: verts,
      faces: table,
      edge: edge,
      rIn: table[0].rIn,
      maxAbs: maxAbs,
      box: maxAbs * 2,       /* 外接半径 = 1 时，面片方框的边长 */
      silR: silR             /* 外接半径 = 1 时，正面朝镜头的轮廓半径 */
    };
  }
  var GEOM = buildGeom();

  /* ───────── 结构 CSS（只有几何与行为，颜色/尺寸/字体全归皮肤） ───────── */
  var CSS = [
    '.kami-d20{display:inline-block;position:relative;box-sizing:border-box;vertical-align:middle;',
    '-webkit-tap-highlight-color:transparent;touch-action:manipulation;}',
    '.kami-d20-stage{position:absolute;left:0;top:0;width:100%;height:100%;display:block;',
    'perspective:var(--kami-d20-persp,calc(var(--kami-d20-s,32px) * 5));perspective-origin:50% 50%;}',
    '.kami-d20-body{position:absolute;left:50%;top:50%;width:0;height:0;display:block;',
    'transform-style:preserve-3d;transform:rotateZ(0deg) rotateX(0deg) rotateY(0deg);',
    'transition:transform var(--kami-d20-dur,1.05s) cubic-bezier(.22,.74,.2,1);}',
    '.kami-d20-face{position:absolute;left:0;top:0;display:block;overflow:hidden;',
    'width:var(--kami-d20-s,32px);height:var(--kami-d20-s,32px);',
    'margin-left:calc(var(--kami-d20-s,32px) / -2);margin-top:calc(var(--kami-d20-s,32px) / -2);',
    'backface-visibility:hidden;-webkit-backface-visibility:hidden;}',
    '.kami-d20-face>i{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;',
    'align-items:center;justify-content:center;font-style:normal;line-height:1;pointer-events:none;}',
    '.kami-d20[data-kami-d20-rolling="1"]{cursor:progress;}',
    '.kami-d20-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;}',
    /* 兜底外观：皮肤管理没在跑（没有 html[data-kami-skin]）时也得看得见 */
    'html:not([data-kami-skin]) .kami-d20{width:32px;height:32px;}',
    'html:not([data-kami-skin]) .kami-d20-face{background-color:#17564a;}',
    'html:not([data-kami-skin]) .kami-d20-face>i{clip-path:var(--kami-d20-clip-i);',
    'background-image:linear-gradient(158deg,#4fc0a0,#2b7c65);color:#f3fdf9;font:600 11px/1 system-ui,sans-serif;}',
    'html:not([data-kami-skin]) .kami-d20:focus-visible{outline:2px solid #4fc0a0;outline-offset:2px;}'
  ].join('');

  function putStyle(doc) {
    try {
      var head = doc.head || doc.documentElement;
      if (!head) { return; }
      var st = doc.getElementById(STYLE_ID);
      if (!st) { st = doc.createElement('style'); st.id = STYLE_ID; head.appendChild(st); }
      if (st.textContent !== CSS) { st.textContent = CSS; }
    } catch (e) { }
  }
  function dropStyle(doc) {
    try {
      var st = doc.getElementById(STYLE_ID);
      if (st && st.parentNode) { st.parentNode.removeChild(st); }
    } catch (e) { }
  }

  /* ───────── 尺寸 → 位姿 ─────────
   * 槽位尺寸由皮肤决定（em / px / 令牌都行），这里量一次：
   *   R = (边长 * 0.98 / 2) / silR      外接半径，让正面朝镜头时正好填满槽位
   *   S = GEOM.box * R                  面片方框边长（约 0.78 倍槽位）
   * 尺寸变化由 ResizeObserver 触发重算（不是逐帧）。
   */
  function measure(el) {
    var w = el.offsetWidth, h = el.offsetHeight, b;
    if (!w || !h) {
      try { var r = el.getBoundingClientRect(); w = r.width; h = r.height; } catch (e) { }
    }
    b = Math.min(w || 0, h || 0);
    if (!(b > 0) || !isFinite(b)) { b = FALLBACK_BOX; }
    return b;
  }

  function polygon(pts, s, r, k) {
    var half = s / 2, out = [], i;
    for (i = 0; i < 3; i++) {
      out.push(fmt(half + pts[i][0] * r * k) + 'px ' + fmt(half + pts[i][1] * r * k) + 'px');
    }
    return 'polygon(' + out.join(',') + ')';
  }

  function layout(rec) {
    if (rec.dead) { return; }
    var box = measure(rec.el);
    if (box === rec.box) { return; }
    rec.box = box;
    STATS.layouts++;
    var R = (box * 0.98 / 2) / GEOM.silR;
    var S = GEOM.box * R;
    try {
      rec.el.style.setProperty('--kami-d20-s', fmt(S) + 'px');
      rec.el.style.setProperty('--kami-d20-r', fmt(R) + 'px');
    } catch (e) { }
    for (var i = 0; i < 20; i++) {
      var f = rec.faces[i], t = GEOM.faces[i];
      try {
        f.style.transform = 'rotateY(' + fmt(t.ry * DEG) + 'deg) rotateX(' + fmt(t.rx * DEG) + 'deg) translateZ(' + fmt(R) + 'px)';
        f.style.clipPath = polygon(t.pts, S, R, 1);
        f.style.setProperty('--kami-d20-clip-i', polygon(t.pts, S, R, INNER));
      } catch (e) { }
    }
    paint(rec);
  }

  function paint(rec) {
    if (rec.dead || !rec.body) { return; }
    try {
      rec.body.style.transform = 'rotateZ(' + fmt(rec.az) + 'deg) rotateX(' + fmt(rec.ax) +
        'deg) rotateY(' + fmt(rec.ay) + 'deg)';
    } catch (e) { }
  }

  /* ───────── 姿态：把某一面转到正对镜头 ───────── */
  function aim(rec, value) {
    var t = GEOM.faces[value - 1];
    var wx = -t.rx * 180 / Math.PI;
    var wy = -t.ry * 180 / Math.PI;
    /* 每个轴都朝目标方向多转两圈；az 落在 360 的整数倍上，数字才是正的 */
    var az = Math.ceil((rec.az + 720) / 360) * 360;
    var ax = wx + 360 * Math.ceil((rec.ax + 720 - wx) / 360);
    var ay = wy + 360 * Math.ceil((rec.ay + 720 - wy) / 360);
    return { az: az, ax: ax, ay: ay };
  }

  function reduced(rec) {
    try {
      var de = rec.doc.documentElement;
      var m = de ? de.getAttribute('data-kami-motion') : null;
      if (m === 'off' || m === 'calm') { return true; }
      var win = rec.doc.defaultView;
      if (win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) { return true; }
    } catch (e) { }
    return false;
  }

  function durMs(rec) {
    try {
      var cs = rec.doc.defaultView.getComputedStyle(rec.body);
      var d = cs.transitionDuration || '1.05s';
      var first = String(d).split(',')[0].replace(/^ +| +$/g, '');
      var v = parseFloat(first) || 1.05;
      return (first.indexOf('ms') >= 0) ? v : v * 1000;
    } catch (e) { return 1050; }
  }

  function settle(rec, value) {
    if (value === undefined || value === null) { value = rec.pending; }
    rec.pending = value;
    rec.rolling = false;
    if (rec.timer) { try { rec.doc.defaultView.clearTimeout(rec.timer); } catch (e) { } rec.timer = null; }
    try {
      rec.el.removeAttribute('data-kami-d20-rolling');
      if (rec.body) { rec.body.removeAttribute('data-kami-d20-rolling'); }
      rec.el.setAttribute('data-kami-d20-value', String(value));
      rec.el.setAttribute('aria-label', '掷骰：' + value + '，点按重掷');
      if (rec.sr) { rec.sr.textContent = '骰子结果 ' + value; }
    } catch (e) { }
  }

  function rollTo(rec, value) {
    if (rec.dead || !rec.body) { return value; }
    var want = aim(rec, value);
    var instant = reduced(rec);
    if (rec.timer) { try { rec.doc.defaultView.clearTimeout(rec.timer); } catch (e) { } rec.timer = null; }
    rec.az = want.az; rec.ax = want.ax; rec.ay = want.ay;
    rec.pending = value;
    if (instant) {
      /* off / calm / prefers-reduced-motion：直接跳到结果，但骰子还在 */
      try {
        rec.body.style.transition = 'none';
        paint(rec);
        rec.body.offsetWidth;
        rec.body.style.transition = '';
      } catch (e) { }
      settle(rec, value);
      return value;
    }
    rec.rolling = true;
    try {
      /* 滚动状态写在最外层与 .kami-d20-body 两处：皮肤选哪一层都能钩到 */
      rec.el.setAttribute('data-kami-d20-rolling', '1');
      if (rec.body) { rec.body.setAttribute('data-kami-d20-rolling', '1'); }
      rec.el.setAttribute('aria-label', '掷骰中');
      paint(rec);
    } catch (e) { }
    /* transitionend 是主路径，定时器只兜底（元素被隐藏时不会有过渡事件） */
    rec.timer = rec.doc.defaultView.setTimeout(function () { rec.timer = null; settle(rec); }, durMs(rec) + 400);
    return value;
  }

  function roll(rec, value) {
    if (typeof value !== 'number' || !(value >= 1 && value <= 20)) {
      value = 1 + Math.floor(Math.random() * 20);
    }
    return rollTo(rec, Math.round(value));
  }

  /* ───────── 事件 ───────── */
  function stop(ev) { try { ev.stopPropagation(); } catch (e) { } }

  function onKey(rec, ev) {
    var k = ev.key;
    if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar' && k !== 'Space') { return; }
    stop(ev);
    try { ev.preventDefault(); } catch (e) { }
    roll(rec);
  }

  /* ───────── 升级 / 还原 ───────── */
  function restoreAttr(el, name, val) {
    try { if (val === null || val === undefined) { el.removeAttribute(name); } else { el.setAttribute(name, val); } } catch (e) { }
  }

  function teardown(rec) {
    if (!rec || rec.dead) { return; }
    rec.dead = true;
    STATS.teardowns++;
    var el = rec.el, doc = rec.doc;
    if (rec.timer) { try { doc.defaultView.clearTimeout(rec.timer); } catch (e) { } rec.timer = null; }
    if (rec.ro) { try { rec.ro.disconnect(); } catch (e) { } rec.ro = null; }
    try { el.removeEventListener('click', rec.hClick); } catch (e) { }
    try { el.removeEventListener('keydown', rec.hKey); } catch (e) { }
    try { el.removeEventListener('pointerdown', rec.hStop); } catch (e) { }
    try { el.removeEventListener('mousedown', rec.hStop); } catch (e) { }
    try { el.removeEventListener('touchstart', rec.hStop); } catch (e) { }
    try { if (rec.body) { rec.body.removeEventListener('transitionend', rec.hEnd); } } catch (e) { }
    /* 还原槽位：属性、类名、内联样式、子节点，一样都不留 */
    try { el.innerHTML = rec.saved.html; } catch (e) { }
    try { restoreAttr(el, 'class', rec.saved.cls); } catch (e) { }
    try { restoreAttr(el, 'style', rec.saved.style); } catch (e) { }
    try { restoreAttr(el, 'aria-hidden', rec.saved.ariaHidden); } catch (e) { }
    try { restoreAttr(el, 'aria-label', rec.saved.ariaLabel); } catch (e) { }
    try { restoreAttr(el, 'role', rec.saved.role); } catch (e) { }
    try { restoreAttr(el, 'tabindex', rec.saved.tab); } catch (e) { }
    try { restoreAttr(el, 'title', rec.saved.title); } catch (e) { }
    try {
      el.removeAttribute('data-kami-d20');
      el.removeAttribute('data-kami-d20-value');
      el.removeAttribute('data-kami-d20-rolling');
    } catch (e) { }
    try { delete el.__kamiD20; } catch (e) { el.__kamiD20 = null; }
    for (var i = records.length - 1; i >= 0; i--) { if (records[i] === rec) { records.splice(i, 1); } }
  }

  function upgrade(el, doc) {
    var rec = el.__kamiD20;
    if (rec && !rec.dead && rec.stage && rec.stage.parentNode === el) {
      /* 已经升级过：只补一次尺寸核对，不重建 DOM、不重置姿态。
         尺寸的两条路径：ResizeObserver（浏览器主路径）与这里（皮肤管理的每次下发都会
         调 mount —— 改皮肤令牌 / 字号缩放走的就是这条）。量尺寸会强制一次布局，
         所以 250ms 内只核对一次。 */
      var now = Date.now();
      if (!rec.checkedAt || now - rec.checkedAt > 250) { rec.checkedAt = now; layout(rec); }
      return false;
    }
    if (rec) { teardown(rec); }
    STATS.upgrades++;

    var saved = {
      html: el.innerHTML,
      cls: el.getAttribute('class'),
      style: el.getAttribute('style'),
      ariaHidden: el.getAttribute('aria-hidden'),
      ariaLabel: el.getAttribute('aria-label'),
      role: el.getAttribute('role'),
      tab: el.getAttribute('tabindex'),
      title: el.getAttribute('title')
    };

    var stage = doc.createElement('span');
    stage.className = 'kami-d20-stage';
    var body = doc.createElement('span');
    body.className = 'kami-d20-body';
    var sr = doc.createElement('span');
    sr.className = 'kami-d20-sr';
    sr.setAttribute('role', 'status');
    sr.setAttribute('aria-live', 'polite');

    var faces = [], i, f, num;
    for (i = 0; i < 20; i++) {
      f = doc.createElement('span');
      f.className = 'kami-d20-face';
      f.setAttribute('data-kami-d20-n', String(GEOM.faces[i].value));
      num = doc.createElement('i');
      num.textContent = String(GEOM.faces[i].value);
      f.appendChild(num);
      body.appendChild(f);
      faces.push(f);
    }
    stage.appendChild(body);
    el.appendChild(stage);
    el.appendChild(sr);

    rec = {
      el: el, doc: doc, stage: stage, body: body, sr: sr, faces: faces,
      saved: saved, box: -1, az: 0, ax: 0, ay: 0, rolling: false, dead: false, timer: null, ro: null
    };
    el.__kamiD20 = rec;
    records.push(rec);

    el.classList.add('kami-d20');
    el.setAttribute('data-kami-d20', 'on');
    el.removeAttribute('aria-hidden');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', '掷骰');
    el.setAttribute('title', '点按掷骰');

    var start = aim(rec, 20);   /* 静止时先亮 20 面；az 取 360 的整数倍，数字是正的 */
    rec.az = 0; rec.ax = start.ax; rec.ay = start.ay;
    rec.pending = 20;
    rec.box = -1;
    /* 第一帧不要过渡：骰子要「已经停在 20 面」，而不是当着用户的面转进来 */
    try { body.style.transition = 'none'; } catch (e) { }
    layout(rec);
    try { body.offsetWidth; body.style.transition = ''; } catch (e) { }
    el.setAttribute('data-kami-d20-value', '20');
    el.setAttribute('aria-label', '掷骰：20，点按重掷');
    if (sr) { sr.textContent = '骰子结果 20'; }

    rec.hStop = function (ev) { stop(ev); };
    rec.hClick = function (ev) { stop(ev); roll(rec); };
    rec.hKey = function (ev) { onKey(rec, ev); };
    rec.hEnd = function (ev) {
      if (!ev || ev.target !== body) { return; }
      if (ev.propertyName && ev.propertyName !== 'transform') { return; }
      if (rec.rolling) { settle(rec); }
    };
    el.addEventListener('click', rec.hClick);
    el.addEventListener('keydown', rec.hKey);
    el.addEventListener('pointerdown', rec.hStop);
    el.addEventListener('mousedown', rec.hStop);
    el.addEventListener('touchstart', rec.hStop, { passive: true });
    body.addEventListener('transitionend', rec.hEnd);

    /* 尺寸随皮肤令牌 / 字号缩放 / 窗口变化 —— 只在变化时重算一次 */
    try {
      var win = doc.defaultView;
      var RO = win && (win.ResizeObserver || win.webkitResizeObserver);
      if (RO) {
        rec.ro = new RO(function () { STATS.ro++; layout(rec); });
        rec.ro.observe(el);
      }
    } catch (e) { }
    return true;
  }

  /* ───────── 对外接口 ───────── */
  function alive(rec) {
    try { return !!(rec.el && rec.el.isConnected !== false && rec.el.parentNode); } catch (e) { return false; }
  }
  function sweep() {
    for (var i = records.length - 1; i >= 0; i--) {
      if (!alive(records[i])) { teardown(records[i]); }
    }
  }

  API.version = VERSION;
  API.mount = function (doc) {
    if (!doc || !doc.querySelectorAll) { return 0; }
    STATS.mounts++;
    sweep();
    var slots = doc.querySelectorAll(SEL), n = 0, i;
    if (!slots.length) { return 0; }
    putStyle(doc);
    for (i = 0; i < slots.length; i++) {
      try { if (upgrade(slots[i], doc)) { n++; } } catch (e) { }
    }
    return n;
  };
  API.destroy = function (doc) {
    var n = 0, i;
    for (i = records.length - 1; i >= 0; i--) {
      if (!doc || records[i].doc === doc) { teardown(records[i]); n++; }
    }
    if (doc) { dropStyle(doc); }
    try {
      var win = doc ? doc.defaultView : null;
      if (win && win.KamiD20 === API) { delete win.KamiD20; }
    } catch (e) { }
    return n;
  };
  API.roll = function (el, value) {
    if (el && el.__kamiD20) { return roll(el.__kamiD20, value); }
    return null;
  };
  API.stats = function () {
    var o = { mounts: STATS.mounts, upgrades: STATS.upgrades, layouts: STATS.layouts, ro: STATS.ro, teardowns: STATS.teardowns, mounted: records.length };
    return o;
  };
  API.mounted = function (doc) {
    var n = 0;
    for (var i = 0; i < records.length; i++) { if (!doc || records[i].doc === doc) { n++; } }
    return n;
  };
  /* 只读：单位外接半径下的几何表（离线校验 / 排障用） */
  API.geometry = function () {
    return {
      version: VERSION,
      edge: GEOM.edge, rIn: GEOM.rIn, maxAbs: GEOM.maxAbs, box: GEOM.box, silR: GEOM.silR,
      faces: GEOM.faces.map(function (t) {
        return {
          value: t.value,
          rx: t.rx * DEG, ry: t.ry * DEG,          /* 度，与 DOM 里写的完全一致 */
          n: [fmt6(t.n[0]), fmt6(t.n[1]), fmt6(t.n[2])],
          pts: t.pts.map(function (q) { return [fmt6(q[0]), fmt6(q[1])]; })
        };
      })
    };
  };

  window.KamiD20 = API;
})();
