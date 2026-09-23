# 返工队列（派活方维护）

> 规则：**每个渠道同时只跑一个 subagent**。队列里的活按「哪条渠道先空出来」派；
> 派活前必须确认该渠道没有在跑的 agent（`list_agents`）。

## 1. manga 返工（小改，一条规则）

**缺陷**：预览台实测（`preview.html?skin=manga&tab=preset`，1090px 视口）：
🤖 模型 tab 里 4 个模型卡的条目网格是 **`347px→1列 卡347x52`**（一行一张卡），
而其余 22 个网格是 4 列；对照 `xianyun` 同一位置是 4 列。

**根因**（读代码确认）：
- `src/skins/manga/skin.css:1159-1160`：密集判据规则里**只重写了 `grid-template-columns`，没有设 `--kami-items-min`**，
  于是它继续用根上的 `15.5rem`（248px）→ 347px 的网格 `floor(347/248)=1` 列。
- 手机档的两条（`:1489` / `:1498-1499` 的 152px / 108px）**只在 ≤560px / ≤380px 生效**，救不了桌面面板。
- 正确写法见 `src/skins/xianyun/skin.css:953-955`：在**同一条基准规则**里写 `--kami-items-min: 100px;`。

这是项目里出过两次的历史 bug（`docs/交接.md` §三 26② / §五 27）的**第三种形态**：
判据选择器写对了，但没把列宽令牌调小 —— 静默降级，不报错。

**要它做的**：在 `src/skins/manga/skin.css` 那条基准密集规则里补 `--kami-items-min: 100px;`（数值自定，≤200px 即可），
然后跑 `node .audit/check-skin.mjs manga` 确认「密集网格的**基准**规则把 --kami-items-min 调小」变成 ok，
再回预览台量一次 `#pdiag` 的「可见网格」读数，把 `347px→1列` 变成 3 列（或更多）。

**纪律**：只改 `src/skins/manga/skin.css`，不跑 `node build/build.mjs`。

## 2. isekai 返工（小改，选择器搬家）

**缺陷（实测坐实，不是推断）**：478px 窄视口下打开 🌟 预设设置面板，页面探针标题读出
`drop宽=478|402px→3列 卡129x93`（4 个模型卡的条目网格）。402px 排 3 列、卡 129px，
**只有列宽 96px 能算出这个结果**（152px 只会排 2 列、4 列需要 408px 也放不下）。
结论：它自己回报的「窄屏网格收缩至 152px」**对条目网格没有生效**。

**根因（特异性）**：
- 基准密集规则 `src/skins/isekai/skin.css:1319-1321` 把 `--kami-items-min: 96px` 写在
  `.kami-grid:has(> .kami-item, > .kami-item-note)` **元素自己**身上（特异性约 (0,5,1)）。
- 手机档 `:1534-1537` / `:1541-1545` 把 `152px` / `108px` 写在
  `.kami-root[data-kami-comp="panel"]` **祖先**上（特异性 (0,3,1)）。
- 自定义属性是继承来的：**元素自己的声明赢**，祖先上的值下不来 → 手机上条目网格仍是 96px。

**要它做的**：把两条手机档的选择器改成**与基准规则逐字相同**（都带 `.kami-grid:has(> .kami-item, > .kami-item-note)`），
只改令牌值（152px / 108px）与 `--kami-row-h: 44px`。参照 `src/skins/xianyun/skin.css` / `terminal/skin.css` 的写法。
改完自证：窄视口下 `#pdiag` 的可见网格应从「3 列 卡129px」变成 **2 列**（402px 下 152px 只放得下 2 列）。

**纪律**：只改 `src/skins/isekai/skin.css`，不跑 `node build/build.mjs`。

## 3. 待排（8 套新皮肤做完之后）

- 重做 `senren`（千恋万花）与 `wod`（黑暗世界）—— 简报见 `.audit/redo-senren-wod.md`。
- 向用户索取「运行操作 bug」的具体清单（用户只说了一句，没有列点）。
