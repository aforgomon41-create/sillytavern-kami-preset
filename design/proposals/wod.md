# wod（黑暗世界）重做提案 · 2026

## 设计语言一句话
一册封存在隐秘结社禁忌图书馆深处的血族羊皮卷密契：黑羊皮书脊做底、骨白衬线手记写正文、
每一处「可点」都像一枚深红封蜡血印 —— 按下去就是盖一次章。

## 身份符号
- **封蜡血印**（全局身份符号）：状态点是一颗径向渐变的血珠（关态暗红 / 开态透红光）；
  选中卡是「深红描边 + 内环 + 密契落章动画」；特效 `seal` 给选中卡盖右下角八角血印。
- **哥特尖拱/玫瑰花窗暗纹**（内联 SVG data-URI 平铺，特效 `rose` 控制明度）。
- **真 3D d20**（平台装饰模块）：面用黑曜/血红双色蚀 + 暗金字，滚动时按住磨砂。
- 顶部封蜡金线贯穿所有外壳（`.kami-shell::before`）。

## 配色关系
- 暗档（默认）：底 `#141019` 黑曜 × 卡 `#201826` 封皮 × 字 `#ece4d8` 骨白（13:1）
  × 强调 `#b0223a` 封蜡红（对字 6.6:1）。分隔是暗铜锈细线，控件描边是描金骨线。
- 亮档：泛黄羊皮纸 `#f2ead8` × 炭墨字 `#241a16`（15:1），封蜡深红同调压暗到 `#9a1b2c`。
  亮档不是「反色」而是「白日下的图书馆」——同一个血印色相、两档各自调饱和。
- 七个语义色两档各一套：暗档亮级、亮档暗级，只落在徽章文字/描边、卡左缘封蜡条上，
  彩色面积永远小于版面的 5%，主调仍是「黑曜×骨白×封蜡」。
- 七种 kind 色在 CSS 里各落墨 ≥5 处（令牌定义 ×2 档 + kind-curr 映射 + 徽章实写 +
  卡左缘），七种类型在行动选项里一眼分得开。

## 这次重做改了什么（对照打回意见）
用户打回的三条：**太素半成品 / 字体排版不舒服 / 动效太弱**，加上「运行 bug 与两端适配」。
（量：旧版 120 条规则 / 35.3KB，全项目最薄；新版 251 条规则 / ~70KB。）

1. **补齐整套组件，不再是半成品**
   - 新写：`.kami-list`（列表主轴走 `--kami-list-dir`）、`.kami-item-main`（占 fazer 主列 +
     min-width:0 防竖排单字）、`.kami-empty`（封蜡菱形前缀）、`md` 全体裁（表格/列表/链接/图片/分隔线）、
     `kami-md li::marker` 血红点、`blockquote` 祈祷文样式。
   - 新写面板组件全套：字段行、festival 开关（骨白旋钮 → 蜡点亮起）、滑杆（`--kami-value`
     走过的一段染成蜡红）、tabs 右缘渐隐提示可横滚、缩放把手、滚动区（蜡红 hover）。
   - `:has()` 结构判据写了 10 处：面板与模型卡内条目网格的密集列宽、
     角标的 padding 补偿等；网格密集判据 **基准规则直接写死 `--kami-items-min:100px`**
     （模型卡内 88px、引导模型页 150px），条目卡一行三张而不是一张。
2. **锁死条目有了看得见的差别**
   - `.kami-item[disabled]` 压淡（`--kami-dim-lock:.42`）+ 字色 --kami-fg-mute +
     **虚线边框** + `cursor:default`，`:hover`/`:active` 全部覆盖去位移去阴影；
   - `.kami-btn[disabled]` / `.kami-icon-btn[disabled]` 同档处理；
   - 文字一族（item-main / card-title / item-side）一起翻到 mute。真机读数：16 个
     非当前模型条目全部落上（izable 复核）。
3. **排版重做**
   - 正文字体改系统衬线栈（Georgia/Times/Palatino/宋体），15px 基准、1.66 行高、
     字距 .02em；标题用 `--kami-fs-lg`（≈17.7px）+ 宽字距，标题与正文层级拉开了。
   - 卡片内边距放宽（lg 16/14），数字框右对齐只挂 `input.kami-number[type="number"]`。
4. **动效加码（6 个特效，4 组关键帧）**
   - 入场：`kami-wod-in`（折叠体/展开卡/选项卡错峰 nth-child）。
   - 强调：`kami-wod-stamp` 落章（is-on / is-done / seal 血印）。
   - 循环：`kami-wod-flicker` 烛影（特效 candle）+ `kami-wod-seep` 夜雾呼吸（mist），
     **calm/off 与 prefers-reduced-motion 下循环动画直接 `animation:none`**，
     off 档整个根内 1ms 无位移。
   - 新增特效：`candle` 烛影摇曳、`seal` 封蜡印痕（对应新参数 --kami-wod-candle）；
     浓度参数 unit 全部改空串（它们都参与 calc(.../100)，写 % 会失真）。
5. **两端适配**
   - 手机档 @media 560 / 380（选择器与基准网格判据**逐字相同**：
     `.kami-panel .kami-grid:has(> .kami-item, > .kami-item-note)` 不在面板里也有）：
     列宽收到 152px / 108px，行高抬到 44px；≤768 抽屉兜底已有。
   - 容器查询三档（21/19/15rem）：外壳变窄时收敛标题字距、换行策略与内边距。
   - icon 按钮最小 40px、触屏 `:active` 反馈 + 非 hover 的骨线边可点提示，
     hover 整包包进 `@media (hover:hover)`。

## 选择器纪律
- 全部 298 条选择器以 `html[data-kami-skin="wod"]` 原样开头（特效规则以
  `html[data-kami-skin="wod"][data-kami-effects~="…"]` 开头），每条含 kami。
- 面板组件规则一律 `.kami-root[data-kami-comp="panel"] …`，全篇 0 处面板 id。
- `.kami-shell`/`.kami-surface` 长写 background-color/background-image，无简写。
