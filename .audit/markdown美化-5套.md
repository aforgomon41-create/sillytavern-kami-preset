# Markdown 渲染美化 · 5 套皮肤交付报告

> 日期：2026-10 轮次 ｜ 负责 skin：civdawn / empire / isekai / xianyun / wod
> 修改文件：仅 `src/skins/<id>/skin.css`，未动 skin.json、未动其它皮肤与脚本/文档/构建。
> 验收环境：`node test/harness/server.mjs --port 8786` + 探针页 `.audit/md-probe.html`
> （临时工具：iframe 载 `/doc/think?payload=<自写 markdown>`，父页经 `/vendor` 持有 showdown 与
> DOMPurify，给 iframe 挂 `data-kami-skin` 并注入该皮肤 CSS，再读 `getComputedStyle` 真值。
> 引擎读数 `data-kami-md-engine=showdown`，五套全部命中，确认渲染走了 showdown 而非 mini。）

## 覆盖矩阵（任务口径：17 元素 = md 容器/h/ul/ol/li/blockquote/table/th/td/code/pre/hr/a/strong/em/img）

| 皮肤 | 改前 | 改后 | 本次补了什么 |
|---|---|---|---|
| civdawn | 13 | **17** | em、strong、a、img、嵌套层区分（li>ul 缩进 + 嵌套 marker 压暗）、ol/ul marker 颜色、手机档表格横滚 |
| empire | 15 | **17** | em、img、h4-h6、li::marker（金色）与嵌套压暗、手机档表格横滚 |
| isekai | 15 | **17** | em、img、h4-h6、li::marker（天空蓝）与嵌套压暗、手机档表格横滚 |
| wod | 16 | **17** | em（斜体+淡骨白）、h5/h6 并入标题组、嵌套 marker 压暗、li>ul 缩进、手机档表格横滚 |
| xianyun | 2 | **17** | 全套重写：h1-h6（楷体）、ul/ol/li 与 ::marker（朱砂/墨灰双层）、blockquote、pre、table/th/td、hr、a、strong、em、del、img、手机档表格横滚 |

全部新规则以 `html[data-kami-skin="<id>"] ` 原样开头，只用既有令牌，无外链/JS/新类名。

## 预览台实测读数（getComputedStyle，来自 .audit/md-probe.html）

每套均含：`data-kami-md-engine=showdown`；同一关键读数如下（420px 档）：

**xianyun（变化最直观：原来除 blockquote/code 全裸）**
- 列表被真实作用到：ul disc 的 `::marker color=rgb(184,36,36)`（朱砂），嵌套 `ul ul li::marker=rgb(115,115,120)`（淡墨、层级区分），`ol li::marker=rgb(70,70,73)`；`ul padding-left=22.5px`，ol `list-style-type=decimal`，嵌套 `ul[1] list-style-type=circle`。
- 引用块：`border-left 2.857px solid rgb(184,36,36)`、`padding 8px 16px`、底 `rgb(244,240,230)`（宣纸卡底）。
- 表格：h3 `rgb(26,26,28)` 楷体 700、底 `rgb(244,240,230)`；td 淡墨；375px 下 `display=block / overflow-x=auto`，900px 下恢复 `display=table`。
- 代码块：`pre background-color=rgb(244,240,230) / overflow-x=auto`；行内码朱砂字+朱砂淡底。
- hr `height=1px / background-color=rgba(28,28,30,.45)`；a 朱砂 `rgb(184,36,36)` + 下划线（墨线色）；strong 浓墨 700；em 斜体淡墨；img `max-width:100%`、3px 圆角、墨线框。
- 收起→展开前后差：改前 `li`/`strong`/`em`/`a`/`h2`/`img`/`table` 全部落 UA 默认；改后逐项如上。

**civdawn（陶土/岩壁）**：marker `rgb(217,101,59)`（赭红橙）、嵌套压到 `rgb(143,125,105)`；blockquote 左条赭红 2.857px + 深岩底 `rgb(34,26,20)`；a 赭红下划线；em 斜体淡赭；img 5px 圆角 + 描边；h2 18px 600 阴刻风。375px md 346/346 不溢出。
**empire（金紫）**：marker `rgb(216,180,95)`（金）、嵌套 `rgb(154,144,173)`；blockquote 左条金透明档 + fg-mute 字；pre 底 `rgb(25,18,35)`；a 金色下划线；em 斜体紫灰；img 3px 圆角。375px 342/342。
**isekai（天空蓝白）**：marker `rgb(37,99,235)`、嵌套 `rgb(89,103,133)`；blockquote 左条蓝 + 淡蓝底；pre 白底；link 蓝 600 字重；img 8px 圆角。375px 326/326。
**wod（暗夜羊皮）**：marker `rgb(176,34,51)` 血红、嵌套 `rgb(147,133,122)`；blockquote 祈祷文（斜体 + 封蜡红条 + 血印淡底、`font-style=italic` 实测）；code 玫瑰字 `rgb(224,163,171)`；a 骨白字 + 血红下划线。375px 350/350。

**横向溢出**：五套在 ≤560px 媒体查询把 `.kami-md table` 转为 `display:block; overflow-x:auto`；实测 375px 每套 md `scrollWidth == clientWidth`（346/342/326/350/327），含一个 56 字符不可断英文串的表格不撑破容器；900px 桌面档表格保持原生 `display:table`（实测 xianyun 852/852）。`pre` 各套均有 `overflow-x=auto` 长行自滚。

## 静态校验（本次实跑）
- `node build/lint-skins.mjs civdawn|empire|isekai|xianyun|wod` → 五条全 PASS。
- `node .audit/check-skin.mjs civdawn empire isekai xianyun wod` → 五套 25 项全 ok（对比度最低：civdawn 11.43:1 / empire 13.49 / isekai 13.80 / xianyun 13.54 / wod 13.12）。

## 遗留与说明
1. `.audit/md-probe.html` 是本次新增的临时探针页（不属于 5 套皮肤交付物），留着供派活方复跑读数；不需要可删。
2. 预览台 iframe 与真机消息 iframe 的字号缩放（`--kami-fs-scale`）未改：所有新规则只用 `var(--kami-fs*)` 与 em，加缩放会整体跟随。
3. 表格块化的桌面档未启用（只在 ≤560px 生效），是为了不破坏既有的桌面表格局；审计的「手机档」读数在 375px 已验证。
4. 渲染引擎在预览台取自 `/vendor/*.js`（本机酒馆 `D:/SillyTavern/SillyTavern` 的副本），与真机同一条宿主链。
