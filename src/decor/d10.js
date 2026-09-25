/* ============================================================
 * 卡密预设 · 真 3D d10 装饰模块（KamiD10）
 * ------------------------------------------------------------
 * 与 KamiD20 同构的独立 IIFE（无 import、无外部依赖、不读全局变量）：
 *   1. 把前端预留的空槽 span.kami-deco[data-kami-deco=d10] 升级成
 *      span.kami-d10 > span.kami-d10-stage > span.kami-d10-body > 10 x span.kami-d10-face > i
 *   2. 初始化时算一次五角偏方二十四面体（pentagonal trapezohedron，10 个风筝面）
 *      的位姿：10 顶点 -> 枚举 10 个风筝面 -> 面法线 ->
 *      rotateY(ry) rotateX(rx) translateZ(R)，之后不再逐帧计算
 *   3. 点击 / 回车 -> 随机选一面 -> 容器 transform 多转两圈 -> CSS transition 缓动停住
 *
 * 为什么不用 WebGL / canvas 逐帧绘制：骰子会出现在每一个聊天楼层，
 * 而浏览器同时存在的 WebGL 上下文有硬上限，那样会直接爆掉。
 * 这里全程只有 10 个静态面片 + 容器上的一个 transform，闲置时零开销。
 *
 * 实现：由「🎨 皮肤管理」在构建期内联（build/kami-doc.mjs，占位 @@KAMI_DECOR_D10@@），
 * 注入到酒馆页面与每个消息 iframe；注入后暴露
 * window.KamiD10 = { mount(doc), destroy(doc), roll(el), geometry() }。
 * 几何与行为在这里，配色与排版归皮肤（.kami-d10-*），契约见 docs/皮肤契约.md 第 8 节。
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document) { return; }

  var VERSION = '1.0';
  var SEL = '.kami-deco[data-kami-deco="d10"]';
  var STYLE_ID = 'kami-d10-css';
  var FALLBACK_BOX = 32;   /* 槽位还没量到尺寸（display:none）时的临时尺寸，ResizeObserver 会纠正 */
  var INNER = 0.9;         /* 内层风筝相对外层的收缩比例：外层底色就是棱边 */
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
  var SIN18 = Math.sin(Math.PI / 10);   /* 18°：同环相邻（36°）的弦长一半 */

  /* ───────── 五角偏方二十四面体：一次性几何 ─────────
   * 构造（2026-09-25 「比例修正」第三轮后定稿）：回到【正五边形反棱柱的对偶】这条
   * 已被验证能闭合渲染的管线（对偶体天然保证 10 只风筝面全等、逐棱共享）——但反棱柱
   * 不再取「等棱」形态，改取【内切球形态】：所有 12 个面（2 个正五边形 + 10 个三角形）
   * 到球心的距离相同。这样对偶体的 12 个顶点（= 反棱柱各面极点 n/d）半径就全部相等
   * （= 1/d），整个十面骰贴在一个球上 —— 近球形，且全等风筝、闭合。
   *
   *   反棱柱：上/下两个正五边形环错开 36°，环 z = ±h、环半径 ρ（两个自由度）。
   *   「内切球相切」的方程：三角形面的面心距 d_tri(h, ρ) = h（正五边形面心距就是 h）。
   *   对 dTri 建模后用二分法解 h（固定 ρ = 1，再整体归一）。一眼可查：等棱解
   *   （h=1/√5）的对偶体拉长比 1.809——那是上一版纺锤形的来源；内切球解接近 1.0。
   *
   * 位姿公式与 d20 相同：CSS transform rotateY(ry) rotateX(rx) translateZ(R) 把面片局部 +Z
   * 映射到 (cos rx sin ry, -sin rx, cos rx cos ry)；令它等于面法线 n，解出
   * rx = -asin(ny)，ry = atan2(nx, nz)。把第 k 面转到正对镜头，容器写
   * rotateZ(a) rotateX(-rx) rotateY(-ry)（a 取 360 的整数倍，数字才是正的）。
   * ============================================================ */
  function buildGeom() {
    var C36 = Math.cos(Math.PI / 5);
    /* 解 d_tri(h) = h（三角面面心距 = 正五边形面心距），ρ 固定 = 1（先随意定型再整体归一） */
    function dTri(h, rho) {
      var up = [], down = [], i;
      for (var i2 = 0; i2 < 5; i2++) {
        up.push([rho * Math.cos(2 * Math.PI * i2 / 5), rho * Math.sin(2 * Math.PI * i2 / 5), h]);
        down.push([rho * Math.cos(2 * Math.PI * (i2 + 0.5) / 5), rho * Math.sin(2 * Math.PI * (i2 + 0.5) / 5), -h]);
      }
      var A = up[0], B = down[0], C = down[4];              /* 三角 (U_0, W_0, W_{-1}) */
      var n = unit(cross(sub(B, A), sub(C, A)));
      var cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      if (dot(n, cen) < 0) { n = [-n[0], -n[1], -n[2]]; }
      return dot(n, A);
    }
    function solveH() {
      var lo = 0.2, hi = 1.4, a = lo, b = hi, m2, i3;
      for (i3 = 0; i3 < 64; i3++) {
        m2 = (a + b) / 2;
        var t = dTri(m2, 1) - m2;      /* >0：还能更胖；<0 → 太瘦 */
        if (t > 0) { a = m2; } else { b = m2; }
      }
      return (a + b) / 2;
    }
    var H = solveH();          /* 反棱柱的面心距 h（上下两个六边形面共用） */
    var RHO = 1;

    var verts = [];
    var up = [], down = [], i, j, k, m;
    for (i = 0; i < 5; i++) {
      up.push([RHO * Math.cos(2 * Math.PI * i / 5), RHO * Math.sin(2 * Math.PI * i / 5), H]);
      down.push([RHO * Math.cos(2 * Math.PI * (i + 0.5) / 5), RHO * Math.sin(2 * Math.PI * (i + 0.5) / 5), -H]);
    }
    /* 10 个三角面：type1 = (U_i, W_i, W_(i-1))、type2 = (W_i, U_i, U_(i+1)) —— 各 5 个、互镜像全等 */
    function idx1(i) { return i; }                 /* up */
    function idx2(i) { return i + 5; }             /* down */
    var antiprismVerts = up.concat(down);
    var tris = [];
    for (i = 0; i < 5; i++) {
      tris.push([idx1(i), idx2(i), idx2((i + 4) % 5)]);
      tris.push([idx2(i), idx1(i), idx1((i + 1) % 5)]);
    }
    /* 对偶顶点：每个反棱柱面的极点 n/d（= 1/d，单位法线×距离倒数） */
    var dual = [];
    for (i = 0; i < tris.length; i++) {
      var A = antiprismVerts[tris[i][0]], B = antiprismVerts[tris[i][1]], C = antiprismVerts[tris[i][2]];
      var n = unit(cross(sub(B, A), sub(C, A)));
      var cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
      if (dot(n, cen) < 0) { n = [-n[0], -n[1], -n[2]]; }
      var dPlane = dot(n, A);
      dual.push([n[0] / dPlane, n[1] / dPlane, n[2] / dPlane]);
    }
    var pentTopIdx = dual.length;   /* 上五边形面（z = +H）的极点 = (0,0,+1/H) */
    dual.push([0, 0, 1 / H]);
    var pentBotIdx = dual.length;
    dual.push([0, 0, -1 / H]);
    /* 内切球条件已经在 solveH 里满足：d_tri = H → 全部 12 个对偶顶点半径相同（= 1/H）。
       统一再缩放到外接半径 = 1 */
    var maxR = 0;
    for (i = 0; i < dual.length; i++) { maxR = Math.max(maxR, vlen(dual[i])); }
    for (i = 0; i < dual.length; i++) { dual[i] = [dual[i][0] / maxR, dual[i][1] / maxR, dual[i][2] / maxR]; }
    var verts = dual;

    /* 风筝面：反棱柱顶点 U_i 周围三个三角面极点 + 上尖顶，按环向次序连成四边形
       （这正是第一版里「闭合渲染验证通过」的那套拓扑，type1(i) = index 2i、type2(i) = 2i+1）。
       顶面第 i 只 = [pentTop, type2_(i-1), type1_i, type2_i]；
       由横穿对称可得底面第 i 只 = [pentBot, type1_(i+1), type2_i, type1_i]。 */
    var rawQuads = [];
    for (i = 0; i < 5; i++) {
      rawQuads.push([pentTopIdx, 2 * ((i + 4) % 5) + 1, 2 * i, 2 * i + 1]);
    }
    for (i = 0; i < 5; i++) {
      rawQuads.push([pentBotIdx, 2 * ((i + 1) % 5), 2 * i + 1, 2 * i]);
    }
    if (rawQuads.length !== 10) { throw new Error('d10: 面数不是 10'); }

    var edge = Infinity;
    var quadEdges = [];
    for (i = 0; i < rawQuads.length; i++) {
      var q = rawQuads[i], qe = [], m;
      for (m = 0; m < 4; m++) {
        var e = vdist(verts[q[m]], verts[q[(m + 1) % 4]]);
        qe.push(e);
        edge = Math.min(edge, e);
      }
      quadEdges.push(qe);
      /* 风筝校验：首尾两条（尖顶-环点）边相等、中间两条（环-环）边相等。
         全等性（顶/底两族互为镜像）由「内切球反棱柱」的对偶保证 */
      if (Math.abs(qe[0] - qe[3]) > 1e-6 || Math.abs(qe[1] - qe[2]) > 1e-6) {
        throw new Error('d10: 风筝面两边不对等');
      }
    }

    var maxAbs = 0, silR = 0;
    var table = rawQuads.map(function (quad, fi) {
      var P = quad.map(function (x) { return verts[x]; });
      var A = P[0], B = P[1], C = P[2], D = P[3], t;
      var n = unit(cross(sub(B, A), sub(C, A)));
      var cen = [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4, (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4];
      if (dot(n, cen) < 0) {
        t = P[1]; P[1] = P[3]; P[3] = t;
        n = unit(cross(sub(P[1], A), sub(P[2], A)));
      }
      var rIn = dot(cen, n);
      var rx = -Math.asin(Math.max(-1, Math.min(1, n[1])));
      var ry = Math.atan2(n[0], n[2]);
      var u = [Math.cos(ry), 0, -Math.sin(ry)];
      var v = [Math.sin(rx) * Math.sin(ry), Math.cos(rx), Math.sin(rx) * Math.cos(ry)];
      /* pts 的原点 = 面平面与内切球的【切点】(rIn·n)，不是质心！
         这是和 d20 隐含约定完全一致的一段：等边三角形质心=切点（两者恰好重合），
         而风筝面质心 ≠ 切点 —— 以切点为原点时，绘制矩阵 (translateZ(R), 尺度 λ=R/rIn)
         才能把整片面完整地映射回 λ·真多面体的骨架上（面与面共享棱、闭合无缝）；
         以质心为原点会把每片面朝自己的质心各自错开 —— 面与面之间就撕裂了
         （2026-09-25「闭合性修复」的根因，就是在这里沿用了质心）。 */
      var foot = [rIn * n[0], rIn * n[1], rIn * n[2]];
      var pts = P.map(function (p) {
        var w = sub(p, foot);
        return [dot(w, u) / rIn, dot(w, v) / rIn];
      });
      for (var q2 = 0; q2 < 4; q2++) {
        maxAbs = Math.max(maxAbs, Math.abs(pts[q2][0]), Math.abs(pts[q2][1]));
      }
      /* 正面朝镜头时的轮廓半径（姿态 rotateX(-rx) rotateY(-ry)，顺序不能反） */
      var cz = Math.cos(rx), sz = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      for (var m2 = 0; m2 < verts.length; m2++) {
        var Pt = verts[m2];
        var q0 = cy * Pt[0] - sy * Pt[2];
        var w1 = cz * Pt[1] + sz * (sy * Pt[0] + cy * Pt[2]);
        silR = Math.max(silR, Math.sqrt(q0 * q0 + w1 * w1));
      }
      return { n: n, rx: rx, ry: ry, rIn: rIn, pts: pts };
    });

    /* 反面配对：法线互为反向的两面，点数和为 11（真实 d10 的排法） */
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
      table[y].value = 10 - k;
    }
    table.sort(function (m1, m2) { return m1.value - m2.value; });

    return {
      verts: verts,
      faces: table,
      edge: edge,
      quadEdges: quadEdges,
      rIn: table[0].rIn,
      maxAbs: maxAbs,
      box: maxAbs * 2,       /* 外接半径 = 1 时，面片方框的边长 */
      silR: silR             /* 外接半径 = 1 时，正面朝镜头的轮廓半径 */
    };
  }
  var GEOM = buildGeom();

  /* ───────── 结构 CSS（只有几何与行为，颜色/尺寸/字体全归皮肤） ───────── */
  var CSS = [
    '.kami-d10{display:inline-block;position:relative;box-sizing:border-box;vertical-align:middle;',
    '-webkit-tap-highlight-color:transparent;touch-action:manipulation;}',
    '.kami-d10-stage{position:absolute;left:0;top:0;width:100%;height:100%;display:block;',
    'perspective:var(--kami-d10-persp,calc(var(--kami-d10-s,32px) * 5));perspective-origin:50% 50%;}',
    '.kami-d10-body{position:absolute;left:50%;top:50%;width:0;height:0;display:block;',
    'transform-style:preserve-3d;transform:rotateZ(0deg) rotateX(0deg) rotateY(0deg);',
    'transition:transform var(--kami-d10-dur,1.05s) cubic-bezier(.22,.74,.2,1);}',
    '.kami-d10-face{position:absolute;left:0;top:0;display:block;overflow:hidden;',
    'width:var(--kami-d10-s,32px);height:var(--kami-d10-s,32px);',
    'margin-left:calc(var(--kami-d10-s,32px) / -2);margin-top:calc(var(--kami-d10-s,32px) / -2);',
    'backface-visibility:hidden;-webkit-backface-visibility:hidden;}',
    '.kami-d10-face>i{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;',
    'align-items:center;justify-content:center;font-style:normal;line-height:1;pointer-events:none;}',
    '.kami-d10[data-kami-d10-rolling="1"]{cursor:progress;}',
    '.kami-d10-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;}',
    /* 兜底外观：皮肤管理没在跑（没有 html[data-kami-skin]）时也得看得见 */
    'html:not([data-kami-skin]) .kami-d10{width:32px;height:32px;}',
    'html:not([data-kami-skin]) .kami-d10-face{background-color:#3b2d5c;}',
    'html:not([data-kami-skin]) .kami-d10-face>i{clip-path:var(--kami-d10-clip-i);',
    'background-image:linear-gradient(158deg,#9b8bd8,#5a4a8f);color:#f5f2ff;font:600 11px/1 system-ui,sans-serif;}',
    'html:not([data-kami-skin]) .kami-d10:focus-visible{outline:2px solid #9b8bd8;outline-offset:2px;}'
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

  /* ───────── 尺寸 → 位姿 ─────────（与 d20 同一节：皮肤定槽位尺寸，这里量一次） */
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
    for (i = 0; i < 4; i++) {
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
    /* 外接半径：让「画出来的轮廓」正好填到 0.49·槽位（与 d20 的 0.98 步进一致）。
       关键关系：绘制尺度 λ = R/rIn（面片 pts 已按各自 rIn 归一），画面轮廓半径 = λ·silR。
       所以 R = 0.49·slot·rIn/silR —— d20 的 silR/rIn ≈ 1.24,靠旧式摊销溢出也能看；
       d10 近球形几何的这个比值要除回来，否则骰子放大 1.48 倍、溢出槽位（2026-09-25 修正）。 */
    var R = (box * 0.98 / 2) * (GEOM.rIn / GEOM.silR);
    var S = GEOM.box * R;
    try {
      rec.el.style.setProperty('--kami-d10-s', fmt(S) + 'px');
      rec.el.style.setProperty('--kami-d10-r', fmt(R) + 'px');
    } catch (e) { }
    for (var i = 0; i < 10; i++) {
      var f = rec.faces[i], t = GEOM.faces[i];
      try {
        f.style.transform = 'rotateY(' + fmt(t.ry * DEG) + 'deg) rotateX(' + fmt(t.rx * DEG) + 'deg) translateZ(' + fmt(R) + 'px)';
        f.style.clipPath = polygon(t.pts, S, R, 1);
        f.style.setProperty('--kami-d10-clip-i', polygon(t.pts, S, R, INNER));
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
      rec.el.removeAttribute('data-kami-d10-rolling');
      if (rec.body) { rec.body.removeAttribute('data-kami-d10-rolling'); }
      rec.el.setAttribute('data-kami-d10-value', String(value));
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
      /* 滚动状态写在最外层与 .kami-d10-body 两处：皮肤选哪一层都能钩到 */
      rec.el.setAttribute('data-kami-d10-rolling', '1');
      if (rec.body) { rec.body.setAttribute('data-kami-d10-rolling', '1'); }
      rec.el.setAttribute('aria-label', '掷骰中');
      paint(rec);
    } catch (e) { }
    /* transitionend 是主路径，定时器只兜底（元素被隐藏时不会有过渡事件） */
    rec.timer = rec.doc.defaultView.setTimeout(function () { rec.timer = null; settle(rec); }, durMs(rec) + 400);
    return value;
  }

  function roll(rec, value) {
    if (typeof value !== 'number' || !(value >= 1 && value <= 10)) {
      value = 1 + Math.floor(Math.random() * 10);
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
      el.removeAttribute('data-kami-d10');
      el.removeAttribute('data-kami-d10-value');
      el.removeAttribute('data-kami-d10-rolling');
    } catch (e) { }
    try { delete el.__kamiD10; } catch (e) { el.__kamiD10 = null; }
    for (var i = records.length - 1; i >= 0; i--) { if (records[i] === rec) { records.splice(i, 1); } }
  }

  function upgrade(el, doc) {
    var rec = el.__kamiD10;
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
    stage.className = 'kami-d10-stage';
    var body = doc.createElement('span');
    body.className = 'kami-d10-body';
    var sr = doc.createElement('span');
    sr.className = 'kami-d10-sr';
    sr.setAttribute('role', 'status');
    sr.setAttribute('aria-live', 'polite');

    var faces = [], i, f, num;
    for (i = 0; i < 10; i++) {
      f = doc.createElement('span');
      f.className = 'kami-d10-face';
      f.setAttribute('data-kami-d10-n', String(GEOM.faces[i].value));
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
    el.__kamiD10 = rec;
    records.push(rec);

    el.classList.add('kami-d10');
    el.setAttribute('data-kami-d10', 'on');
    el.removeAttribute('aria-hidden');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', '掷骰');
    el.setAttribute('title', '点按掷骰');

    var start = aim(rec, 10);   /* 静止时先亮 10 面；az 取 360 的整数倍，数字是正的 */
    rec.az = 0; rec.ax = start.ax; rec.ay = start.ay;
    rec.pending = 10;
    rec.box = -1;
    /* 第一帧不要过渡：骰子要「已经停在 10 面」，而不是当着用户的面转进来 */
    try { body.style.transition = 'none'; } catch (e) { }
    layout(rec);
    try { body.offsetWidth; body.style.transition = ''; } catch (e) { }
    el.setAttribute('data-kami-d10-value', '10');
    el.setAttribute('aria-label', '掷骰：10，点按重掷');
    if (sr) { sr.textContent = '骰子结果 10'; }

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
      if (win && win.KamiD10 === API) { delete win.KamiD10; }
    } catch (e) { }
    return n;
  };
  API.roll = function (el, value) {
    if (el && el.__kamiD10) { return roll(el.__kamiD10, value); }
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

  window.KamiD10 = API;

  /* 自检（模块加载时跑一次）：几何必须真的成立，坏了直接抛、不静默出坏骰子 */
  (function () {
    try {
      var g = GEOM;
      if (g.faces.length !== 10) { throw new Error('面数 ' + g.faces.length + ' ≠ 10'); }
      if (g.verts.length !== 12) { throw new Error('顶点数 ' + g.verts.length + ' ≠ 12'); }
      var counts = {}, i;
      for (i = 0; i < g.faces.length; i++) {
        counts[g.faces[i].value] = (counts[g.faces[i].value] || 0) + 1;
        if (Math.abs(g.faces[i].rx * 0) !== 0) { throw new Error('rx NaN'); }
      }
      for (i = 1; i <= 10; i++) { if (counts[i] !== 1) { throw new Error('点数 ' + i + ' 出现 ' + counts[i] + ' 次'); } }
    } catch (err) {
      try { if (window.console && console.error) { console.error('[装饰 d10] 几何自检失败：', err); } } catch (e) { }
      throw err;
    }
  })();
})();
