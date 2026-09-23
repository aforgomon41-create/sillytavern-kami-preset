# 皮肤设计简报：漫画草稿（`manga`）

> 本文是皮肤 `manga`（中文名「漫画草稿」）的设计简报与决策备忘，供后续审查与迭代查阅。

---

## 一、概念与设计语言

**设计语言一句话**：
> **黑白漫画草稿：手绘硬朗墨线、分镜画格留白、波普网点纸（Halftone）阶梯，辅以朱笔原稿修正痕迹。**

核心基调：
- **黑白为主**：大面积纯净原稿白与草稿纸灰（#ffffff / #f5f6f8），搭配硬朗浓郁的漫画墨线黑（#111215）与铅笔草稿灰（#444750 / #6c707d）。
- **分镜画格**：卡片以 2px-3px 纯黑硬朗描边与硬投影（硬边缘 3px-4px 无模糊阴影）构建如漫画分镜格（Comic Panel）一般的张力排版。
- **网点纸阶梯**：通过纯 CSS 45° `radial-gradient` 构成微细波普圆点阵列，作为阴影、悬停与选中状态的漫画印刷网点纸材质（Screentone）。
- **朱笔修正痕迹**：以原稿校对朱红（#d92534 / #ff4b5a）作为唯一的强调色与焦点，面积 ≤5%，点缀核心按钮与关键状态。
- **本地字体栈**（契约 §2 硬约束）：
  - 正文栈 `--kami-font`: `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;`
  - 标题栈 `--kami-font-title`: `"Impact", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "SimHei", "Heiti SC", sans-serif;`
  - 代码栈 `--kami-font-mono`: `ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace;`

---

## 二、身份符号（单一视觉焦点）

**唯一身份符号**：**漫画网点纸（Halftone 45° 点阵网花）**。
- **表现形式**：在卡片悬停、选中激活态（`.is-on`）、外壳底纹与特效展开时，以纯 CSS `radial-gradient` 点阵平铺呈现经典黑白漫画的灰阶过渡。
- **约束**：不做繁复的外部图形堆叠，依靠干脆利落的 2px 漫画黑线描边与网点纸质感形成鲜明漫画原稿风格。

---

## 三、配色关系与对比度设计

### 1. 面积分配
- **原稿白 / 留白纸面**（`--kami-bg`, `--kami-card`）：约 75%
- **漫画墨黑 / 铅笔深灰**（`--kami-fg`, `--kami-fg-dim`, `--kami-line`）：约 20%
- **原稿朱红 / 高光修正色**（`--kami-accent` 等）：≤ 5%

### 2. 核心色板与对比度计算（WCAG 2.1）
- **默认亮色（原稿纸白）**：
  - 容器底色 `--kami-bg`: `#f5f6f8`（原稿纸灰白）
  - 卡片底色 `--kami-card`: `#ffffff`（洁净漫画卡）
  - 内嵌底色 `--kami-card-2`: `#eceef2`（网点灰底）
  - 主正文字 `--kami-fg`: `#111215`（浓黑墨色）→ 对 `#ffffff` 对比度 **18.0:1**，对 `#f5f6f8` **16.6:1**（远超 4.5:1）
  - 次要文字 `--kami-fg-dim`: `#444750`（深铅灰）→ 对 `#ffffff` 对比度 **8.7:1**，对 `#f5f6f8` **8.0:1**
  - 最弱文字 `--kami-fg-mute`: `#6c707d`（浅铅灰）→ 对 `#ffffff` 对比度 **4.8:1**，对 `#f5f6f8` **4.5:1**
  - 修正朱红 `--kami-accent`: `#d92534`（朱红印笔）→ 纯白字在其上对比度 **5.1:1**
  - 描边强档 `--kami-line-strong`: `#111215`（分镜粗墨线，实线 2px，对比度 18:1）
- **暗色方案（夜墨原稿，`data-kami-scheme="dark"`）**：
  - 容器底色 `--kami-bg`: `#121316`（深墨黑底）
  - 卡片底色 `--kami-card`: `#1a1c22`（暗色分镜卡）
  - 内嵌底色 `--kami-card-2`: `#22252e`（暗部灰调）
  - 主正文字 `--kami-fg`: `#f0f2f6`（原纸白字）→ 对 `#1a1c22` 对比度 **14.1:1**
  - 次要文字 `--kami-fg-dim`: `#b2b6c3`（银铅灰）→ 对 `#1a1c22` 对比度 **8.0:1**
  - 最弱文字 `--kami-fg-mute`: `#7c8292`（哑光灰）→ 对 `#1a1c22` 对比度 **4.6:1**
  - 强调色 `--kami-accent`: `#ff4b5a`（荧光朱红）→ 深墨字在其上对比度 **7.2:1**

### 3. 语义色（`--kami-kind-*` 七色）
采用高饱和度但沉稳的漫画印刷墨水色阶，在黑白分镜背景上对比度均 ≥ 4.8:1：
- `--kami-kind-action`: `#1863a1`（热血蓝，7.2:1）
- `--kami-kind-persona`: `#942350`（少女品红，7.5:1）
- `--kami-kind-plot`: `#167543`（剧情森绿，6.5:1）
- `--kami-kind-info`: `#177186`（推理青墨，6.0:1）
- `--kami-kind-fun`: `#9a5a07`（搞笑橙黄，5.3:1）
- `--kami-kind-nsfw`: `#c01834`（热烈绯红，5.8:1）
- `--kami-kind-other`: `#4b505c`（网点铅灰，7.8:1）

---

## 四、参考与边界

1. **零外部资源**：严禁 `@import`、`@font-face`、网络图片 URL。
2. **纯 CSS 网点与分镜**：网点纸使用纯 CSS `radial-gradient` 重复背景，分镜阴影使用硬边缘 `box-shadow: 3px 3px 0px #111215`，零外部 SVG。
3. **性能边界**：网点图案限制在 `background-size: 6px 6px` 至 `8px 8px` 的规则平铺，不在每一帧动画上计算大面积 `filter: blur`。
4. **反转翻转纪律**：在 `.is-on` 激活或黑底/红底状态下，严格将 `--kami-fg` / `--kami-fg-dim` / `--kami-fg-mute` / `--kami-line` 成对翻转为纯白反字，杜绝 1.00:1 事故。
5. **对比度四件套**：`.kami-number` / `.kami-text` / `.kami-textarea` / `.kami-select` 的 `background-color` + `color` + `color-scheme` 均带 `!important` 严格封锁宿主与用户自定义深色 CSS 污染。
6. **锁死条目外观**：对带 `[disabled]` 的条目卡与按钮给出明确的锁死外观（透明度降至 `.42`，字体置灰为 `--kami-fg-mute`，光标设为 `default`，移除 `:hover` 位移与阴影）。
7. **移动端双档响应**：`@media (max-width: 560px)` 与 `@media (max-width: 380px)` 分别将网格最小列宽调为 `152px` 与 `108px`，控件行高提升至 `44px`。
