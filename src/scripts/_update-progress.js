/* ============================================================================
 * 「远程更新」的进度弹窗 —— 纯逻辑
 * ----------------------------------------------------------------------------
 * 用户 2026-10-05 要的：点了确定**不要关掉弹窗**，原地转成进度弹窗，显示到了哪个阶段、下载了多少。
 *
 * ── 查证结果（为什么不能沿用原来那个弹窗）──
 * 原来的确认弹窗是 askUpdate() 里的 /popup 斜杠命令，也就是**酒馆原生弹窗**
 * （src/scripts/70-远程更新.js:636-648）。它点任一按钮就自己关了，
 * 我们的代码里根本没有关闭动作 —— 想"不关"就不能再用它，得有自己的面板。
 *
 * ── 进度总量为什么不用 Content-Length（这条是实测踩出来的）──
 * 实测 jsDelivr 真实下载地址的响应头：
 *     Access-Control-Allow-Origin: *
 *     Access-Control-Expose-Headers: *      ← 响应头 JS 都读得到
 *     Content-Encoding: br
 *     Content-Length: 690287                ← 这是**压缩后**的大小
 *   而解压后的真实正文是 3464106 字节（与 manifest 里的 bytes 完全一致）。
 *   浏览器 fetch 会**透明解压**，getReader() 拿到的是解压后的字节 ——
 *   拿 690287 当分母，进度会一路冲到 502%，比"没有进度"更糟。
 *   所以总量的来源顺序是：① manifest 的 bytes ② 没开压缩时的 content-length ③ 未知。
 *
 * 本模块只做纯计算：阶段状态机 + 字节格式化 + 百分比。IO 全在 70 号的薄壳里。
 * 内联规则同其它共享模块：零 import、只有行首 export。
 * 同样**不许出现美元符号**（免得将来被内联进前端时炸）。
 * ============================================================================ */

/* ── 新增界面文案：**集中在这里，等文案 Agent 出稿**。
     实现里不许再散落第二处文案。值是占位，不是最终稿。 ── */
export var UPDATE_COPY = {
  title: '【占位·待文案】正在更新',
  stageCheck: '【占位·待文案】检查更新',
  stageDownload: '【占位·待文案】下载',
  stageVerify: '【占位·待文案】校验',
  stageMerge: '【占位·待文案】合并',
  stageWrite: '【占位·待文案】写入预设',
  stageDone: '【占位·待文案】更新完成',
  stageFailed: '【占位·待文案】更新失败',
  bytesOf: '【占位·待文案】已下载 {done} / {total}',
  bytesOnly: '【占位·待文案】已下载 {done}',
  indeterminate: '【占位·待文案】总大小未知，正在下载…',
  retry: '【占位·待文案】重试',
  close: '【占位·待文案】关闭',
  doneHint: '【占位·待文案】更新完成，可以关闭这个窗口了',
  retryHint: '【占位·待文案】可以点重试再来一次',
  dupGuard: '【占位·待文案】上一次还没跑完',
  /* 重试不设上限（Lead 2026-10-05 定）：用户自己点的，卡上限反而碍事；
     但要说清这是第几次，让他知道自己在第几轮。{n} 由实现替换。 */
  retryCount: '【占位·待文案】第 {n} 次重试'
};

/* 阶段：按 70 号现有实现如实列，没有编造。
   check = fetchLatestRelease / fetchManifestRemote；download = downloadViaChain；
   verify = verifySha；merge = mergeAndWrite 里的三方合并；write = writePreset。 */
export var UPDATE_STAGES = [
  { id: 'check', copy: 'stageCheck' },
  { id: 'download', copy: 'stageDownload' },
  { id: 'verify', copy: 'stageVerify' },
  { id: 'merge', copy: 'stageMerge' },
  { id: 'write', copy: 'stageWrite' },
  { id: 'done', copy: 'stageDone' }
];

export function stageOrder(id) {
  for (var i = 0; i < UPDATE_STAGES.length; i++) { if (UPDATE_STAGES[i].id === id) { return i; } }
  return -1;
}

/** 人类可读的字节数。只给字节数用户看不懂，所以一律走这里。 */
export function formatBytes(n) {
  var v = Number(n);
  if (!isFinite(v) || v < 0) { return '0 B'; }
  if (v < 1024) { return Math.round(v) + ' B'; }
  if (v < 1024 * 1024) { return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB'; }
  if (v < 1024 * 1024 * 1024) { return (v / (1024 * 1024)).toFixed(1) + ' MB'; }
  return (v / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 百分比。**拿不到总量就返回 null**，调用方必须显示"不确定进度"，
 * 不许拿 0 或者假数字糊弄（用户点名：宁可要看得见的失败，也不要看不见的错误）。
 * 总长为 0 也当未知 —— 一个 0 字节的文件没有"进度"可言。
 */
export function percentOf(received, total) {
  var r = Number(received), t = Number(total);
  if (!isFinite(r) || !isFinite(t) || t <= 0) { return null; }
  if (r < 0) { r = 0; }
  var p = (r / t) * 100;
  if (p > 100) { p = 100; }          /* 兜住：真出现超发也不能显示 120% */
  return p;
}

/** 新建一份进度状态。now 传时间戳（纯函数不读时钟，方便单测）。 */
export function newProgress(now) {
  return {
    stage: 'check', status: 'running',        /* running | failed | done */
    received: 0, total: null, totalFrom: null, /* manifest | length | null */
    error: null, startedAt: now || 0, stageAt: now || 0, endedAt: 0,
    /* 重试次数：连点确定时靠它和 running 一起挡住重复启动 */
    attempts: 0, running: false
  };
}

/** 开始一次更新。已经在跑就直接拒绝（连点确定的守卫）。返回 false = 没启动。 */
export function beginProgress(p, now) {
  if (!p || p.running) { return false; }
  p.running = true;
  p.status = 'running';
  p.stage = 'check';
  p.received = 0;
  p.total = null;
  p.totalFrom = null;
  p.error = null;
  p.startedAt = now || 0;
  p.stageAt = now || 0;
  p.endedAt = 0;
  p.attempts = (p.attempts || 0) + 1;
  return true;
}

/** 进入某个阶段。**只许往前推，不许倒退**。
    重试不需要"往回跳"这个例外：beginProgress 会把阶段重置回 check，再从 check 正常往前走。 */
export function enterStage(p, id, now) {
  if (!p || p.status !== 'running') { return false; }
  var want = stageOrder(id), cur = stageOrder(p.stage);
  if (want < 0) { return false; }
  if (cur >= 0 && want < cur) { return false; }
  if (p.stage !== id) { p.stage = id; p.stageAt = now || 0; }
  return true;
}

/** 设定总量。source: 'manifest' | 'length'。传 0 或非法值 = 当未知（不是"总量为 0"）。 */
export function setTotal(p, total, source) {
  if (!p) { return false; }
  var t = Number(total);
  if (!isFinite(t) || t <= 0) { p.total = null; p.totalFrom = null; return false; }
  p.total = t;
  p.totalFrom = source || 'manifest';
  return true;
}

/** 累加已下载字节。返回累加后的值。 */
export function addBytes(p, n) {
  if (!p) { return 0; }
  var v = Number(n);
  if (isFinite(v) && v > 0) { p.received += v; }
  return p.received;
}

/** 失败：**保留已下载的字节与阶段**，弹窗要留在原地给人话原因。 */
export function failProgress(p, errorText, now) {
  if (!p) { return p; }
  p.status = 'failed';
  p.error = String(errorText == null ? '' : errorText);
  p.endedAt = now || 0;
  p.running = false;
  return p;
}

/** 成功。newVersion 只用于显示。 */
export function doneProgress(p, newVersion, now) {
  if (!p) { return p; }
  p.status = 'done';
  p.stage = 'done';
  p.newVersion = String(newVersion == null ? '' : newVersion);
  p.endedAt = now || 0;
  p.running = false;
  return p;
}

/** 给界面渲染用的只读快照。所有要显示的字符串都在这里算好，界面不再自己拼。 */
export function viewOf(p) {
  var v = {
    stage: p ? p.stage : 'check',
    status: p ? p.status : 'running',
    stageText: '',
    detail: '',
    percent: null,
    indeterminate: true,
    bytesText: '',
    canRetry: false,
    canClose: false,
    title: UPDATE_COPY.title,
    error: (p && p.error) || '',
    attempts: p ? (p.attempts || 0) : 0
  };
  if (!p) { return v; }
  var st = null, i;
  for (i = 0; i < UPDATE_STAGES.length; i++) { if (UPDATE_STAGES[i].id === p.stage) { st = UPDATE_STAGES[i]; } }
  if (p.status === 'failed') {
    v.stageText = UPDATE_COPY.stageFailed;
  } else if (st) {
    v.stageText = UPDATE_COPY[st.copy];
  }
  var pct = percentOf(p.received, p.total);
  v.percent = pct;
  v.indeterminate = (pct === null);
  if (p.stage === 'download' && p.received > 0) {
    if (p.total) {
      v.bytesText = UPDATE_COPY.bytesOf
        .replace('{done}', formatBytes(p.received)).replace('{total}', formatBytes(p.total));
    } else {
      v.bytesText = UPDATE_COPY.bytesOnly.replace('{done}', formatBytes(p.received));
      v.detail = UPDATE_COPY.indeterminate;
    }
  } else if (p.stage === 'download') {
    v.detail = UPDATE_COPY.indeterminate;
  }
  if (p.status === 'done') { v.detail = UPDATE_COPY.doneHint; }
  if (p.status === 'failed') { v.detail = v.error || UPDATE_COPY.retryHint; }
  /* 第 2 次及以后标出"这是第几次重试"（attempts 从 1 起，第 1 次是初次，不算重试） */
  v.retryText = (p.attempts > 1) ? UPDATE_COPY.retryCount.replace('{n}', String(p.attempts - 1)) : '';
  v.canRetry = (p.status === 'failed');
  v.canClose = (p.status === 'done' || p.status === 'failed');
  return v;
}
