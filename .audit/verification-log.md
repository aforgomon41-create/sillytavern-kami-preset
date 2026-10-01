# 只读验证日志 · 「覆盖模式」开关（.audit/，2026-10-01）

浏览器：Chrome 154 无头，CDP 9341（技能 browser.mjs launch/goto/click/screenshot）
服务：http://127.0.0.1:8781/test/harness/preview.html（复用已在跑的实例，PID 11684，起于 2026-09-30 11:38，父进程已消失）
产物：dist/kami-v0.91-98-20261001.json（含 function repairTags ×1，无未展开占位符）

## A. 预览台 /dev 路径（test/harness/preview.html）
读数（.kami-chip / 开关 / 说明行）：
- 默认：chip=「关闭」，.kami-switch-input[data-kami-tagfix-all] checked=false
- 点开关：checked=true，chip=「关闭 · 全覆盖」
- 切「补全」：chip=「补全 · 全覆盖」，mode 按钮 close aria-pressed=true
- 关开关：chip=「补全」，checked=false
- 「覆盖模式」行下一行 .kami-card-note 文本逐字 = 正文里任何标签都按当前档位处理，网页自带的 HTML 标签（如 br、div）除外。

端到端（mode=补全 + 覆盖开）：
  注入 <foo>甲<content>乙 → STATE.emit('message_received', 0) → 读回 <foo>甲<content>乙（一字未改）
  const cap 抓脚本内部 console：`[预设] 标签处理出错：repairTags is not defined`
  面板状态行停在「本次会话：等待处理」
根因（只读定位）：
  - 原文件 src/scripts/40-预设设置.js:136 有占位符 /* @@KAMI_TAGS_PURE@@ */
  - /dev/40-预设设置.js（241172 字符）里占位符仍在 ×1，且没有 function repairTags
  - build/kami-doc.mjs:289 TAGS_PURE_MARK、:297 expandTagsPure 都在
  - test/harness/server.mjs:6 只 import 了 expandRegexList/expandForPreview/expandDecor/expandBaseCssJs/expandPresetParse/expandPanelGestures/expandGuideCopy；
    :134-142 依次调用，**没有 expandTagsPure** → 预览台的 dev 路径永远缺这段纯逻辑
  - 同类：/dev/35-提示词发送修改.js 里 /* @@KAMI_GODCMD_PURE@@ */ 也没展开（14270 字节）
  - 对照：/built/40-预设设置.js（320557 字节）有 function repairTags ×1、占位符 0

## B. 构建产物路径（.audit/preview-built.html = preview.html 副本，仅把 '/dev/40-预设设置.js' 换成 '/built/40-预设设置.js'）
UI 读数与 A 完全一致（默认关、点开 true、chip 关闭·全覆盖 → 补全·全覆盖 → 补全）。
端到端①（补全 + 覆盖开）：<foo>甲<content>乙 → <foo>甲<content>乙</content></foo>
端到端②（先恢复原坏消息，覆盖关）：<foo>甲<content>乙 → <foo>甲<content>乙</content>
  脚本日志：`[预设] 第 0 楼：补全 1 处（content）`
  状态行：本次会话：已处理 2 楼（最近：第 1 楼 补全 1 处（content））
  脚本变量：{ tagFix: 'close', tagFixAll: '0' }
附加（覆盖开，验 HTML 豁免）：
  <div>甲<br>乙<content>丙 → <div>甲<br>乙<content>丙</content>
  <br>甲<span>乙 → 原样不动
