# 新皮肤 `grokbot`（面板名：**色块**）实现简报

> 由主 agent 写。参考图**已下载进工作区**（见第一节），你必须先看图再动手。
> 这套皮肤要成为**默认皮肤**（用户指定）。本轮**只写代码，不构建、不部署**（构建由主 agent 统一做）。

---

## 〇、用户已经拍板的（不要再改）

- **面板显示名 = `色块`**（用户原话：「皮肤名就叫"色块"」）。
- **脚本按钮短名 = `色块`**（按钮整体文案 = `🎨色块`，手机上按钮条窄，两个字刚好）。
- **成为默认皮肤**：`src/scripts/30-皮肤管理.js` 里 `var PREFERRED = 'trpg';` 改成 `'grokbot'`。
- 用户没有要求改配色方向，所以**保持纯无彩色**（炭黑 × 黏土白），不要自作主张加彩色。
  （淡金强调是留给用户以后决定的选项，本轮不做；但请把强调色收敛到 `--kami-accent` 一处。）

## 一、参考图（**先看这些图**，在本地目录 `design/reference/grokbot/`，仅本地存在、不进仓库）

| 文件 | 是什么 |
|---|---|
| `01-app-icon-256.png` | **主参考**：Grok Bot.app 的应用图标原图 |
| `01b-app-icon-256@2x.png` | 同一张图的高清版（256×256） |
| `02-blob-idle.svg` | 登录页角色的静态 blob + idle 眼型，**纯文本，可以直接 read**，里面有精确的路径几何 |
| `03-replica-page.html` | 一个参考页面的源码（含配色，仅供观感参考） |
| `04-study-readme.md` | 该参考页面的说明 |

**看图的办法**：用 `read_image` 工具直接读 `01-app-icon-256.png`（和 `01b-...@2x.png`）。
如果你的模型读不了图（工具报错），就退而读 `02-blob-idle.svg` 的源码 —— 它是纯文本，
里面一条 blob 路径 + 两条眼睛路径，几何信息一点不少。

### 图上是什么（主 agent 亲眼看过，供你核对）

1. **应用图标**：一块**深炭色的圆角方形底板**；板上坐着一大块**哑光黏土白/浅灰的有机 blob**，
   占下半部约三分之二，形状不对称、下缘更圆更鼓；blob 上有**两只深炭色的倾斜胶囊眼**，
   两端圆头、细长、朝同一侧斜。全图**没有描边、没有纹理、没有第二种颜色**，
   体积感完全来自「上亮下暗的柔和渐变」（哑光 + 软光，黏土感）。
2. **登录页角色**：同一套语言，纯黑 blob + 两只白色胶囊眼。
   仓库说明它共有 25 种眼型 / 18 种身形 / 11 种颜色，靠「简单形状 + 表情眼」区分个体。
3. **xAI 官方设计文章**自述：最终方案是「形状简单、**眼睛会说话**」，材料语言是 **matte surfaces、soft lighting**。

**一句话**：无彩色、无描边、大圆角、黏土柔光；身份符号是「**一块歪 blob + 两只斜胶囊眼**」。

> ⚠️ **不要抄**：参考 SVG 里的路径数据是 xAI 的素材，**不许**把它（或它的近似变形）搬进皮肤。
> 皮肤里的 blob 形状请用 CSS 自己造（`border-radius` 的四角不等值 + 轻微 `transform: rotate/scale` 就能做出"歪 blob"）。

## 二、把图标翻译成皮肤（按这个来）

**核心取舍：组件本体 = 黏土白 blob，容器/面板 = 炭色底板。**
这样在聊天楼层的深色酒馆里，卡片是一块发亮的黏土白，一眼认得出；面板则像那块深色 App 图标板。

1. **两层材料**
   - 底板（面板 drop、标题栏、页脚、外壳外圈）：**深炭色哑光**，极轻的竖向渐变（上略亮下略暗），大圆角。
   - 本体（卡片、正文块、展开区）：**黏土白/暖浅灰**，同样竖向柔光渐变，**无描边**（或仅 1px 极淡暖灰线），软投影。
2. **形状**：一律大圆角。外壳 `--kami-r-lg` 级别，按钮/徽章/开关做成**胶囊**（`--kami-r-pill`）。不要直角、不要细锐描边。
3. **身份符号（至少出现两处，必须做）**：**两只倾斜的胶囊眼**。
   - `.kami-dot`（状态点）：平时一枚实心胶囊；`[data-kami-on="1"]` 时变成**两只并排的斜胶囊**（用 `::before`/`::after`，**不许改 DOM**）。
   - 选中态标记（`.is-on` 的左缘/下缘，或 `--kami-accent-mark`）：做成一段**斜胶囊**，不要用直线条。
4. **配色**：纯无彩色。`--kami-accent` 在浅底上用炭黑、在深底上用黏土白，互为正反。
5. **字体**：系统无衬线栈，标题不加衬线、不加等宽，字距略开，标题不做全大写。
6. **动效**：柔和带回弹。展开 `--kami-enter-scale` 从 0.96 到 1；blob 的"呼吸"只出现在 `full` 档，`calm` 降一档、`off` 全压 1ms 且无位移（契约 §3.6 硬要求）。
7. **面板窄屏**必须贴底抽屉（契约 §4.4）。面板内可以用 `filter`/`backdrop-filter`，**消息楼层 iframe 里一律不许用**（皮肤 CSS 会注入每一个楼层）。

## 三、交付物（只许动这些文件）

```
src/skins/grokbot/skin.css      已有一份草稿（见下），你要审读、修好、补完
src/skins/grokbot/skin.json     新建（结构照抄 src/skins/trpg/skin.json，不要放 css 字段）
build/apply-copy.mjs            只改 SKIN_IDS 那一行：加 'grokbot'
build/lint-copy.mjs             只改 SKIN_IDS 那一行：加 'grokbot'
design/copy/copy-table.json     给 grokbot 加 slots / taglines / effects / params 四节
src/scripts/30-皮肤管理.js       只改 PREFERRED = 'trpg' → 'grokbot'
```

**关于那份已有草稿**：上一个 subagent 在写 `src/skins/grokbot/skin.css` 时崩了（没写 skin.json、没改 SKIN_IDS），
留下 1707 行 CSS（约 77KB）。它看起来已经成型（352 条作用域选择器，有动效/密度/明暗/特效响应块、`:focus-visible`、面板作用域、容器查询、窄屏媒体查询）。
**请先通读它**：能用的留着，不对的按本简报改，缺的补上。不要推倒重来（那是白扔一大坨活），也不要照单全收（它没看过参考图）。

**不许动**：`dist/`、`docs/`、`test/`、`src/preset.base.json`、其它皮肤包、
`src/scripts/60-压缩.js`（另一个 agent 的活，**连看都不用看**）、`40-预设设置.js`、`50-引导.js`。

## 四、skin.json / 文案的两摊分工

- **结构归你**：effects/params 的 id、token、min/max/step/value、以及 CSS。
- **措辞先由你写暂定值**：tagline、三个槽位标题（`think-title` / `think-title-open` / `options-title`）、
  effects 的 `label`/`desc`、params 的 `label`/`group`/`unit`。
  **同一份值要同时写进 `src/skins/grokbot/skin.json` 和 `design/copy/copy-table.json`，两处必须一字不差**。
  后面会有专职文案 agent 重写表里的措辞，再由 `node build/apply-copy.mjs` 落地 —— 所以措辞不用追求完美，
  但**必须符合 lint-copy 的限制**（见下）。
- 写完跑 `node build/apply-copy.mjs --check`，应当**没有任何输出**（表与皮肤包一致）。有输出就按提示对齐。

建议（不强制）：
- `id`: `grokbot` ｜ `name`: `色块` ｜ `button`: `色块` ｜ `scheme`: `dark` ｜ `decor`: 不声明
- `effects`: 3–5 条，围绕这套材料（例：黏土柔光、blob 呼吸、眼睛跟随、哑光颗粒、投影深度）。**每条必须真的在 CSS 里有 `data-kami-effects~="<id>"` 规则**。
- `params`: 3–4 条。`unit` 必须是**合法 CSS 单位或空串**（`px`/`%`/`deg`，倍率留空；**绝不能写 `×` 或 `°`**），`value` 必须在 `min..max` 内。

## 五、必须先读

1. `docs/皮肤契约.md` —— 全部。特别是 §2 硬规则、§3 令牌全集、§3.6 全局旋钮、§3.7 文案机制与禁用令牌、§4 DOM 类名与状态钩子、§4.4 面板几何与窄屏抽屉、§6.5 两个坑、§7 构建期校验。
2. `src/skins/nixie/skin.css` —— 看一份"完整且已过 lint"的皮肤怎么组织（令牌块 / 档位响应块 / 特效块 / 面板作用域块）。
3. `docs/交接.md` 第五节（硬事实与踩过的坑）。

## 六、自检（我会复跑，不达标打回）

1. `node build/lint-skins.mjs grokbot` 必须 **PASS**。
2. `node build/lint-copy.mjs` 必须 **通过**。限制：`slots.<id>` 只许那三个键，标题每条 ≤6 格（CJK 记 1 格、其余 0.5 格）；
   `label` ≤8 格、`desc` ≤60 格、`group` ≤4 格、`unit` ≤2 格；
   不许出现美元号、反斜杠、分号、花括号、引号、换行。
3. 预览台自查：`http://127.0.0.1:8781/test/harness/preview.html?skin=grokbot`（**8781 已经在跑，不要另起服务器、不要停它**）。
   - 两个消息楼层 iframe（思维链折叠/展开、行动选项卡片）在 320px 宽下成立；
   - 🎨 面板（皮肤/参数/特效三 tab）与 🌟 面板（7 tab、103 张条目卡）都要能看、能点、有你这套皮肤的反馈；
   - `browser_assist action=resize` 看 375 宽：面板必须是**贴底抽屉**；
   - **只开你自己的浏览器会话**（`browser_session action=start` 自己开），用完 `action=stop` 关掉；
   - **绝对不要碰真机酒馆 localhost:11451**。
4. 至少一轮实质打磨，自审：概念贯穿了吗？眼睛符号出现了几处？320px 可用吗？

## 七、纪律

- **不要跑 `node build/build.mjs`**（本轮不构建），不要部署，不要碰真机。
- 只动第三节列的文件。
- 报告用中文、说人话：交付了什么、最得意的一处 CSS 手法、你那版暂定文案原文、遗留风险、需要主 agent 配合什么。
