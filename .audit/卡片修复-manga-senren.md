# 卡片标题栏 / 角标修复 + markdown 补齐 · manga & senren

> 执行时间：2026-09-25 ｜ 负责皮肤：`manga`（漫画草稿）、`senren`（千恋万花）
> 预览台端口纪律：全程只用 **8785**（`node test/harness/server.mjs --port 8785`）
> 改动文件：**只改** `src/skins/manga/skin.css` 与 `src/skins/senren/skin.css`；`skin.json` 一字未动（无理由动）。

---

## 〇、结论先行

1. **错位的根因**：manga 把「分组卡通栏标题条」的造型（`box-sizing:content-box` + `width:100%` + 固定负外边距）无差别套给了**所有** `.kami-card-head`，连条目卡里那条只是「条目名」的标题栏也吃了一套。负外边距写死 16px，而卡片实际左右内边距有 16px / 12px 两档，于是标题条左右探出量对不上，整条歪出卡片。
2. **遮挡的根因**：两套皮肤都让条目卡里的 emoji 角标继续吃 `.kami-badge` 那套「小标签」造型（描边 + 内边距 + 底色），再 `position:absolute` 钉到卡角；条目名却从卡片内边距起排，两个矩形直接叠在一起。契约 §4.4 要求「角标只占高度不占宽度」，两套都没给卡片补上下内边距。senren 还多一条：ⓘ 继承了 `.kami-card-note` 的 `margin-top`，被再往下推 4px。
3. **修完角标与标题还重叠多少**：**0px²**。manga 从 404px² 降到 0，senren 从 361px² 降到 0（emoji 四角 + ⓘ 全部归零）。
4. **markdown 补齐后覆盖到几个元素**：任务点名的 **19 项全覆盖**（h1/h2/h3、ul/ol/li、嵌套列表、`li::marker`、blockquote、table/th/td、code/pre、hr、a、strong、em、img），另加 `p` / `pre code` / `del` / 首尾子元素边距。`.kami-md` 规则数：manga **1 → 48**，senren **15 → 45**。

---

## 一、现象与复现（修复前读数）

量法：预览台 `http://127.0.0.1:8785/?skin=<id>&tab=preset`，探针读 `#kami-preset-panel` 里**真实渲染**的卡片矩形；「重叠」= 角标矩形 ∩ 条目名矩形（`.kami-item-main`）的相交面积。桌面档：面板 `drop = 472,72,420,560`，条目卡 **110.3 × 69.4**（manga）/ **108 × 72.5**（senren）。

### ① manga —— 标题栏错位 + 角标压内容（用户原话「必须严肃修复」）

**标题栏错位**（`.kami-card-head` 相对卡片的 l/t/r/b，单位 px）

| 位置 | 修复前 | 判定 |
|---|---|---|
| 条目卡标题栏 | **-2.3 / -4.3 / 5.7 / 38.8** | 溢出卡外 **YES**，左右还不等（左探 2.3、右边距剩 5.7） |
| 分组卡卡头（内嵌条目网格，左右内边距 12px） | **-2.3 / 1.7 / 29.7 / …** | 溢出 **YES**，右侧差 29.7px |
| 分组卡卡头（普通分组卡，左右内边距 16px） | 1.7 / 1.7 / **9.7** / … | 左边贴住、右边仍差 9.7px |

计算样式佐证：条目卡标题栏 `box-sizing:content-box`、`width:82.86px`、`padding:8px 12px`、`margin:-14px -16px 12px -16px`。

**角标压内容**

| 角标 | 对手 | 重叠（ox × oy = px²） |
|---|---|---|
| emoji 左上「🐋」 | 标题文字 "DS/GLM底部破限" | 23.5 × 17.2 = **404px²** |
| emoji 左下「💤」 | 标题文字 "DS/GLM底部破限" | 26 × 7.9 = 205px² |
| ⓘ（右上角） | 标题文字 "DS/GLM底部破限" | 12 × 5.3 = **144px²** |
| ⓘ（右上角） | 标题文字 "GLM中文语言锚" | 10 × 15.9 = 159px² |
| emoji 左上「🐋」 | 标题栏整体 | 27.5 × 17.2 = 473px² |
| **★ 全部 112 张条目卡最大重叠** | | **404px²** |

角标自身尺寸 **27.4 × 17.2**（1px 描边 + 1px/5px 内边距 + 等宽字体）。最狠的一例：标题文字只有 **42.5px** 宽，被压掉 **23.5px ≈ 55%**。

### ② senren —— emoji 角标挡住内容

**标题栏**：l/t/r/b = 12.6 / 10.6 / 12.5，**不溢出、无错位**（senren 的卡头本来就是干净的 flex 条：`padding:0; background:transparent; border:none`）。所以 senren 只有角标一个问题。

**角标压内容**

| 角标 | 对手 | 重叠 |
|---|---|---|
| emoji 左上「🐋」 | 标题文字 "DS/GLM" | 26 × 13.8 = **359px²**（26 / 82.9 ≈ 31% 被压） |
| emoji 右上「💤」 | 标题文字 "DS/GLM" | 26 × 13.8 = 359px² |
| emoji 左下「💤」 | 标题文字 "DS/GLM底部破限" | 26 × 7.9 = 205px² |
| ⓘ（右上角） | 标题文字 "DS/GLM底部破限" | 10 × 15.9 = **159px²** |
| **★ 最大重叠** | | **361px²** |

角标自身尺寸 **33 × 18.8**（2px 描边 + 2px/8px 内边距）。额外病根：ⓘ 的 `top` 名义上是 6px，实测却被 `.kami-card-note` 的 `margin-top:4px` 推到 10px。

---

## 二、根因

### 根因 A（manga 标题栏错位）—— 通栏标题条的几何写错了

`src/skins/manga/skin.css` 旧规则把「分组卡通栏标题条」的造型套给了所有 `.kami-card-head`：

```css
box-sizing: content-box;  width: 100%;  padding: 8px 12px;
margin: -14px -16px 12px -16px;      /* 负外边距把标题条拉成与卡同宽 */
```

两个错叠在一起：

1. **负外边距写死 16px，卡片实际内边距却有两档**。普通分组卡是 `--kami-pad-lg-x` = 16px，而「卡内套条目网格」的分组卡被 `:has(> .kami-card-body > .kami-grid)` 规则压到 **12px**，所有条目卡也只有 **12px**。负外边距和实际内边距对不上，标题条就左右探出量不等。
2. **`width:100%` + `content-box` 的边框盒算错了**。`100%` 是卡片**内容宽**，加上自己那 24px 内边距，得到的内容宽 + 24 仍然比卡片 padding-box 窄 `2 × (卡内边距 − 12)`。普通分组卡差 8px、12px 内边距的卡差 24px，右边永远差一截。

条目卡更明显：内边距只有 12px，`margin-top:-14px` 把整条拉到卡片**上边外 4.3px**，左边探出 2.3px。

### 根因 B（两套共有的角标遮挡）—— 角标还是「小标签」，且没让出高度

契约 §4.4 写得很清楚：`data-kami-corner` 的角标「**只占高度不占宽度**」。兜底皮肤 `src/skin/base.css:851-886` 就是标准答案：

```css
.kami-item > .kami-badge { position:absolute; padding:0; border:0; background:none; pointer-events:none; }
.kami-item:has(> .kami-badge[data-kami-corner="tl"], > ...[data-kami-corner="tr"], > .kami-card-note[data-kami-corner="tr"]) { padding-top: calc(...); }
.kami-item:has(> .kami-badge[data-kami-corner="bl"], > ...[data-kami-corner="br"]) { padding-bottom: calc(...); }
```

manga / senren 两条都没写：角标继续带描边、内边距和底色（占的面更大），卡片也没有补上下内边距（角标和文字挤在同一行）。senren 额外漏了 `margin: 0`，ⓘ 被 `.kami-card-note` 的 `margin-top` 又推低 4px。

---

## 三、修法（只动这两个文件）

### manga（`src/skins/manga/skin.css`）

1. **标题栏造型收窄 + 几何重算**（约 1325–1360 行）
   - 通栏标题条只留给 `.kami-card:not(.kami-item):not(button) > .kami-card-head`（`:not(button)` 把模型卡那颗 `button.kami-card-head.kami-btn` 排除掉，它通栏无底板，由原规则管，避免视觉改动面扩大）；
   - 几何改成 `width: calc(100% + 2 * var(--kami-pad-lg-x))` + `box-sizing:border-box` + 左右 `calc(-1 * var(--kami-pad-lg-x))` —— 边框盒正好等于卡片 padding-box 宽，标题条左右都贴到描边内侧；
   - 「卡内套条目网格」的分组卡另补一条 `margin-left/right:-12px; width: calc(100% + 24px)`，与它被压到 12px 的内边距逐字对应；
   - **条目卡的卡头回归普通行**：`.kami-item > .kami-card-head { margin:0; padding:0; border:0; background:none; box-sizing:border-box; }`。
2. **角标退成纯字形 + 让出高度**（约 1470–1502 行）
   - `.kami-item > .kami-badge` 去掉 padding / border / background / box-shadow，`pointer-events:none`；
   - `:has(> .kami-badge[data-kami-corner="tl"|"tr"], > .kami-card-note[data-kami-corner="tr"])` → `padding-top: calc(var(--kami-pad-y) + 1.15em)`；下角标 → 同值 `padding-bottom`；
   - ⓘ 角标规则补 `margin: 0`（原来只有 `margin-left:0`，`margin-top:6px` 会把它再推低 6px），`top/right` 从 6px 收到 4px。

### senren（`src/skins/senren/skin.css`，约 1261–1310 行）

同一套机制：`.kami-item > .kami-badge` 去造型、`:has()` 补上下内边距、ⓘ 角标补 `margin: 0`。senren 的卡头本来就干净，**不动**。

---

## 四、修复后读数（同一套量法、同一视口）

### manga

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 条目卡标题栏相对卡 l/t/r/b | -2.3 / -4.3 / 5.7 / 38.8 | **13.7 / 24.9 / 13.7 / 42**（左右对称、不溢出） |
| 分组卡卡头相对卡 l/t/r/b（4 张全量） | -2.3 / 1.7 / 29.7 … | **1.7 / 1.7 / 1.7**（四张全部通栏贴边） |
| emoji 角标 ∩ 标题文字 | 404px² / 205px² | **0 × 0 = 0px²**（tl / tr / bl / br 全为 0） |
| ⓘ ∩ 标题文字 | 144 ~ 159px² | **0px²** |
| ★ 最大重叠 | **404px²** | **0px²** |
| 带角标条目卡高度 | 69.4px | 84.1px（角标让出高度，符合契约） |

### senren

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 标题栏相对卡 l/t/r/b | 12.6 / 10.6 / 12.5（本就没错位） | 12.6 / 23.7 / 12.5（不变，仍不溢出） |
| emoji 角标 ∩ 标题文字 | 359px² / 205px² | **0px²** |
| ⓘ ∩ 标题文字 | 159px² | **0px²** |
| ★ 最大重叠 | **361px²** | **0px²** |
| 带角标条目卡高度 | 72.5px | 98.9px |

---

## 五、③ 同类问题扫描（另外 13 套，只读不改，同一套量法）

在同一预览台进程里逐套 `KamiSkin.setSkin(id)` → 打开 🌟 面板 → 量 112 张条目卡。判定口径与上面完全一致。

| 皮肤 | 有重叠的卡 | 最大重叠 | 重叠来自 | 严重程度 |
|---|---|---|---|---|
| **xianyun** | 9 | **227px²** | ⓘ | **重** |
| grokbot | 17 | 63px² | ⓘ | 中 |
| mileng | 20 | 28px² | ⓘ | 中 |
| civdawn | 12 | 24px² | ⓘ | 轻 |
| terminal | 24 | 20px² | ⓘ | 轻 |
| empire | 9 | 15px² | ⓘ | 轻 |
| rain | 15 | 5px² | emoji 左上角标 | 极轻 |
| nixie | 6 | 8px² | ⓘ | 极轻 |
| crt80s | 0 | 0px² | — | 干净 |
| isekai | 0 | 0px² | — | 干净 |
| memo | 0 | 0px² | — | 干净 |
| trpg | 0 | 0px² | — | 干净 |
| wod | 0 | 0px² | — | 干净 |
| *（manga / senren，本次已修）* | *0* | *0px²* | — | *干净* |

**读法**：

> 扫描口径说明：读数取自扫描执行瞬间的工作区状态。本次执行期间有其它 agent 在并行改其它皮肤，若它们的改动落库，此表可能已过期——复查时用同一套量法再跑一遍即可（xianyun 在扫描后仍未见 `.kami-item > .kami-badge` 去造型规则与 `:has()` 补偿，病根仍在）。

- **xianyun 是唯一的重灾**：全项目只剩它的 emoji 角标还带「小标签」造型（实测 `padding: 2px 7px` + `0.57px solid` 描边 + `rgb(244,240,230)` 米白底），与 manga / senren 修复前同款病根，最大重叠 227px²。
- **grokbot / mileng / civdawn / terminal / empire / nixie / rain 是同一个共性小病**：角标已经退成纯字形（实测 `padding:0; border:0; background:transparent`），剩下 5~63px² 全部来自 **ⓘ 的 `margin-top` 没归零**（ rain 那 5px² 是 emoji 左上角标的微量重叠）。
- **标题栏错位：15 套里只有 manga 有**。其它 14 套的「条目卡标题栏溢出 / 分组卡头溢出」全部为 0。静态核查也印证：全项目只有 manga 写过 `box-sizing:content-box` + 负外边距的通栏卡头（`nixie` 那条 `-2.5px` 是 `margin: -2.5px 0 0 -.5px`，与卡头无关）。
- 一句话修法（供对应皮肤的 agent 参考）：`.kami-item > .kami-badge` 去掉 padding/border/background 并 `pointer-events:none`；用 `:has(> .kami-badge[data-kami-corner="tl"|"tr"], > .kami-card-note[data-kami-corner="tr"])` 补 `padding-top`、下角标补 `padding-bottom`；ⓘ 角标规则补 `margin: 0`。**本次没有动任何别人的文件。**

---

## 六、④ markdown 美化补齐

### 覆盖矩阵

| | 修复前 `.kami-md` 规则数 | 修复后 |
|---|---|---|
| manga | **1** | **48** |
| senren | 15 | **45** |

（读数来自 `node .audit/coverage.mjs manga senren`）

**任务点名的 19 项，两套全部覆盖**：`h1` / `h2` / `h3`（另含 h4~h6）、`ul` / `ol` / `li`（缩进 1.45em·manga / 1.4em·senren、行距 `--kami-lh`、`margin`）、**嵌套列表**（`ul ul` 换 `circle`、`ol ol` 换 `lower-alpha`，缩进再收一档）、**`li::marker`**（首层上强调色、嵌套层淡一档）、`blockquote`、`table` / `th` / `td`、`code` 与 `pre`（含 `pre code` 复位）、`hr`、`a`、`strong`、`em`、`img`；另补 `p`、`del`、`:first-child` / `:last-child` 边距归零。

设计语言落点：manga 用 Impact 全大写标题 + 3px 粗墨分镜线（h2 下边线）/ 朱笔修正竖条（h3 左边条）、网点纸底引用块、**墨块反白表头**、分镜格硬投影代码块、**速度线分隔线**（12px 周期虚线段）；senren 用和风楷体标题、樱色 `::marker`、和纸底引用块、描金细线表格。颜色一律走各自令牌（`--kami-accent` / `--kami-fg` / `--kami-fg-mute` / `--kami-card-2` / `--kami-line` / `--kami-bg-soft` / `--kami-t1`），**没有新增令牌、没有新增类名**。

### 真渲染读数（`?skin=<id>&tab=think`，引擎 showdown）

自建一枚 `TH-message--` 前缀的楼层 iframe、载荷换成覆盖全元素矩阵的 markdown，皮肤管理会自动把皮肤 CSS 注入进去，读到的就是真前端 + 真 showdown 的结果。

**manga**

- `li::marker`：ul 首层 `rgb(217,37,52)`（原稿朱红）｜ol 首层 朱红｜**ul 嵌套层 `rgb(108,112,125)`（淡铅灰）**
- 嵌套列表：`list-style-type: circle`，`padding-left: 18px`（父层 21.75px）
- `blockquote`：`border-left: 2.857px solid rgb(217,37,52)`，`background-color: rgb(236,238,242)`（网点灰底），`font-style: italic`
- `table`：`width:100%; border-collapse:collapse`；`th` `border:1.714px solid rgb(17,18,21)` + `background-color: rgb(17,18,21)` + `color: rgb(245,246,248)`（墨块反白）；`td` 同描边
- `pre`：`background-color: rgb(236,238,242)`，`border: 1.714px solid rgb(17,18,21)`，`box-shadow: 2px 2px 0px`（分镜硬投影），`overflow-x: auto`
- `hr`：`height:3px` + `linear-gradient(90deg, #111215 0 7px, transparent 7px 12px)`（速度线）
- `a`：`rgb(217,37,52)` + `underline 1.5px`｜`strong`：`800`｜`em`：italic + `rgb(68,71,80)`
- `h2`：17.4px / Impact / 800 / uppercase / `border-bottom: 1.714px solid #111215`；`h3`：15.9px / `border-left: 2.857px solid #d92534`

**senren**

- `li::marker`：ul 首层 `rgb(201,75,109)`（薄红樱）｜ol 首层 樱色｜**ul 嵌套层 `rgb(125,109,116)`（淡墨）**
- 嵌套列表：`list-style-type: circle`，`padding-left: 18.75px`（父层 21px）
- `blockquote`：`border-left: 2.857px solid rgba(201,75,109,.52)`，`background-color: rgb(251,245,238)`（和纸底）
- `table`：`width:100%; border-collapse:collapse`；`th` `background-color: rgb(245,237,228)`；`th`/`td` `border: 0.571px solid rgba(92,78,84,.16)`（描金细线）
- `pre`：`background-color: rgb(251,245,238)`，`border: 0.571px solid rgba(92,78,84,.16)`，`overflow-x: auto`
- `a`：`rgb(201,75,109)`｜`em`：italic + `rgb(92,78,84)`｜`h2`：18px / 和风楷体 / 700

### 375px 窄屏：不横向溢出

| 皮肤 | `.kami-md` scrollW / clientW | body scrollW / clientW | `pre` scrollW / clientW |
|---|---|---|---|
| manga | 325 / 325 → **不溢出** | 360 / 360 → 不溢出 | 321 / 321 → 不溢出 |
| senren | 327 / 327 → **不溢出** | 360 / 360 → 不溢出 | 326 / 326 → 不溢出 |

---

## 七、验收

```
node build/lint-skins.mjs manga   → PASS  (63875B, 83 令牌)
node build/lint-skins.mjs senren  → PASS  (63855B, 84 令牌)
node .audit/check-skin.mjs manga senren → 抽查全部通过
    manga ：215 条规则 / 4 特效 / 4 参数；选择器前缀 273 条越界 0；面板 id 命中 0；
            外部资源与 vh 命中 0；正文对比度最低 13.66:1；.kami-item-note 等高两条有；
            密集网格判据含 .kami-item-note；对比度四件套三项 !important 全覆盖
    senren：229 条规则 / 5 特效 / 5 参数；选择器前缀 293 条越界 0；面板 id 命中 0；
            正文对比度最低 13.31:1；锁死态 7 条；手机档 @media 3 处；贴底抽屉 sheet 有
```

约定未破坏：`prefers-reduced-motion` / `[data-kami-motion="off"]` / `--kami-fs-scale` 三条档位响应都在（lint 与 audit 的「档位响应缺 0」通过）；新规则全部以 `html[data-kami-skin="<id>"] ` 开头，面板规则一律只写到 `.kami-root[data-kami-comp="panel"]`，**没有面板 id**（audit 的「面板 id 真命中 0」通过）。

---

## 八、遗留

1. **xianyun 的 227px² 与另外 7 套的 5~63px² 都没动**——那是别人的文件。共性修法见第五节末尾一句话，可直接照抄。
2. **引导面板里这个问题在所有皮肤下都还在**：`50-引导.js` 的 `GUIDE_CSS` 用 `#kami-guide-panel .kami-guide-grid > .kami-item{padding:0}` 把条目卡内边距压成 0，带 id 的特异性高于皮肤的 `:has()` 补偿规则，所以补偿不生效。本次扫描量的是 🌟 预设面板，没量引导页；要修得改 `GUIDE_CSS` 或加引导专用类，超出本次文件范围。
3. **模型 tab 的卡头**（`button.kami-card-head.kami-btn`）在 manga 下保持原样（通栏、无底板、`padding:6px 8px`），没有给它加分镜标题条——为避免视觉改动面扩大。若后续想要一致，把 `:not(button)` 去掉并按 button 的 `width:auto` 收缩特性另算宽度即可。
4. **带角标的卡片变高了**（manga 69.4→84.1px，senren 72.5→98.9px）。这是契约「角标只占高度」的必然结果，兜底皮肤同样如此；网格同行卡片仍被 `align-items:stretch` 拉平。
5. **真机未验**：预览台没有酒馆的深色样式、没有用户自定义 CSS、也没有真 iframe 沙箱行为。对比度类问题按流程§五-⑥ 仍需真机复核。
6. 预览台探针为本次自建（`.audit` 外的临时页面，用完已删）；端口只用 8785。
