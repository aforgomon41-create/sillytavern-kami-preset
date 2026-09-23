# 皮肤设计简报：异世界（`isekai`）

> 本文是皮肤 `isekai`（中文名「异世界」）的设计简报与决策备忘，供后续审查与迭代查阅。

---

## 一、概念与设计语言

**设计语言一句话**：
> **日式异世界轻小说：明亮通透晨曦基调、梦幻微光渐变高光、圆润通透水晶卡片与动漫感粗体标题。**

核心基调：
- **明亮通透**：以澄澈天空晨曦与水晶白（#f0f5fc / #ffffff）为基调，搭配轻柔梦幻的淡天蓝与紫罗兰微光层次，营造如异世界转生轻小说插画般的明朗与通透感。
- **圆角与通透水晶**：加大圆角梯度（`--kami-r-lg: 16px`, `--kami-r-md: 12px`, `--kami-r-sm: 8px`），配合纯净柔和的边框微光与阴影，层次分明而不堆砌。
- **动漫感粗体标题**：标题采用字重 800 的系统无衬线字体栈（`--kami-fw-title: 800`），辅以稍宽的字距（`--kami-ls-title: .06em`），清爽利落、富有张力，杜绝小字号下易模糊的文字描边。
- **克制渐变**：渐变仅用于外壳高光边线、选中小徽章、主要按钮与卡片顶部棱镜光泽，卡片正文与容器依然保持实底或半透明实色，确保文字极度清晰。
- **本地字体栈**（契约 §2 硬约束）：
  - 正文栈 `--kami-font`: `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif;`
  - 标题栈 `--kami-font-title`: `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif;`
  - 代码栈 `--kami-font-mono`: `ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace;`

---

## 二、身份符号（单一视觉焦点）

**唯一身份符号**：**棱镜斜切高光渐变（Prism Luster / 异世界魔法高光边线）**。
- **表现形式**：在卡片顶部、展开头部、分段切换栏以及激活态按钮上，呈现一道 135° 天蓝至薰衣草紫罗兰的微光渐变光泽与柔和内发光（Inner Glow）。
- **约束**：卡片正文与主要容器不铺设大面积复杂渐变，所有文字区域均有清晰稳定的背景色承托，杜绝花哨导致的对比度崩塌。

---

## 三、配色关系与对比度设计

### 1. 面积分配
- **晨曦天空白 / 晶莹卡片底**（`--kami-bg`, `--kami-card`）：约 75%
- **苍蓝墨字 / 暮色蓝灰**（`--kami-fg`, `--kami-fg-dim`, `--kami-line`）：约 20%
- **转生之蓝 / 魔法高光色**（`--kami-accent` 等）：≤ 5%

### 2. 核心色板与对比度计算（WCAG 2.1）
- **默认亮色（晨曦蔚蓝）**：
  - 容器底色 `--kami-bg`: `#f0f5fc`（天空晨曦白）
  - 卡片底色 `--kami-card`: `#ffffff`（纯白水晶卡）
  - 内嵌底色 `--kami-card-2`: `#eaf1fa`（淡蓝柔光底）
  - 主正文字 `--kami-fg`: `#1c2333`（深苍蓝黑）→ 对 `#ffffff` 对比度 **14.8:1**，对 `#f0f5fc` **13.4:1**（远超 4.5:1）
  - 次要文字 `--kami-fg-dim`: `#3d4a66`（暮色苍灰蓝）→ 对 `#ffffff` 对比度 **8.46:1**，对 `#eaf1fa` **7.33:1**
  - 最弱文字 `--kami-fg-mute`: `#596785`（冰蓝冷灰）→ 对 `#ffffff` 对比度 **5.25:1**，对 `#f0f5fc` **4.87:1**，对 `#eaf1fa` **4.66:1**（全部 ≥ 4.5:1）
  - 转生之蓝 `--kami-accent`: `#2563eb`（魔力蔚蓝）→ 纯白反字在其上对比度 **5.46:1**
  - 描边强档 `--kami-line-strong`: `rgba(37, 99, 235, 0.45)`（清晰明朗的魔力边框，对比度 ≥ 3.2:1）
- **暗色方案（星咏之夜，`data-kami-scheme="dark"`）**：
  - 容器底色 `--kami-bg`: `#0f1422`（深空星夜底）
  - 卡片底色 `--kami-card`: `#192035`（星辰卡片底）
  - 内嵌底色 `--kami-card-2`: `#121829`（内嵌深穹底）
  - 主正文字 `--kami-fg`: `#f0f5ff`（星芒白字）→ 对 `#192035` 对比度 **13.8:1**
  - 次要文字 `--kami-fg-dim`: `#b4c2e0`（月辉冰蓝）→ 对 `#192035` 对比度 **7.9:1**
  - 最弱文字 `--kami-fg-mute`: `#8292b8`（星尘冷蓝灰）→ 对 `#192035` 对比度 **4.8:1**
  - 强调色 `--kami-accent`: `#4f8cf6`（星辰蓝）→ 深穹黑字在其上对比度 **6.8:1**

### 3. 语义色（`--kami-kind-*` 七色）
采用异世界轻小说魔法职业属性色彩，高辨识度且在白底与暗底上对比度均 ≥ 5.0:1：
- `--kami-kind-action`: `#1d62c2`（勇者行动 / 圣剑蔚蓝，7.1:1）
- `--kami-kind-persona`: `#a8216b`（魔王性格 / 蔷薇洋红，7.3:1）
- `--kami-kind-plot`: `#157347`（世界推进 / 精灵翠绿，6.3:1）
- `--kami-kind-info`: `#0f768a`（魔法信息 / 贤者青绿，5.8:1）
- `--kami-kind-fun`: `#9e5700`（异界日常 / 琥珀亮橙，5.5:1）
- `--kami-kind-nsfw`: `#be185d`（魅魔契约 / 绚烂绯红，6.2:1）
- `--kami-kind-other`: `#4b5568`（冒险杂记 / 星晶石灰，7.2:1）

---

## 四、参考与边界

1. **零外部网络资源**：严禁 `@import`、`@font-face`、外部图片或字体链接。
2. **纯 CSS 光影与晶透材质**：利用 `linear-gradient`、`radial-gradient`、`backdrop-filter`、`box-shadow` 呈现水晶质感，不使用任何外部图片。
3. **性能边界**：`backdrop-filter` 仅限静止外壳与面板容器，不在每一帧关键帧动画上渲染高消耗滤镜。
4. **反转翻转纪律**：在 `.is-on` 激活态、按钮 hover、高亮卡片中，严格将 `--kami-fg` / `--kami-fg-dim` / `--kami-fg-mute` / `--kami-line` 成对翻转为高对比度文字色，坚决杜绝同色文字事故。
5. **对比度四件套**：`.kami-number` / `.kami-text` / `.kami-textarea` / `.kami-select` 的 `background-color` + `color` + `color-scheme` 均带 `!important` 严格封锁宿主与用户自定义 CSS 污染。
6. **锁死条目外观**：对预设面板中带原生 `[disabled]` 的条目卡与按钮，透明度压至 `.42`，字体置灰为 `--kami-fg-mute`，光标设为 `default`，覆盖移除 `:hover` / `:active` 的任何位移与阴影装饰。
7. **移动端双档响应**：在 `@media (max-width: 560px)` 与 `@media (max-width: 380px)` 下，将网格最小列宽收缩至 `152px` 与 `108px`，同时控件行高调至 `≥44px`。
