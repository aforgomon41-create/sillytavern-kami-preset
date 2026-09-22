# 第二阶段：进入实现（方案已通过用户审阅）

用户已批准你的设计方案，现在开始写**皮肤包**。以下是你需要的全部新信息。

## 一、交付物（只写这两个文件，不要动别的任何文件）

```
D:\SillyTavern\卡密预设0.9\src\skins\<你的皮肤id>\skin.json
D:\SillyTavern\卡密预设0.9\src\skins\<你的皮肤id>\skin.css
```

skin.json 结构（**不要**在里面放 css 字段）：

```json
{
  "id": "你的id",
  "name": "面板里显示的名字（可含中文与括号）",
  "button": "脚本按钮上的短名",
  "scheme": "dark 或 light",
  "tagline": "面板卡片上的一句话（可选）",
  "effects": [ { "id": "xxx", "label": "中文名", "desc": "一句说明", "default": true } ],
  "params": [ { "id": "xxx", "label": "中文名", "group": "分组名", "token": "--kami-xxx",
                "unit": "px", "min": 0, "max": 24, "step": 1, "value": 8 } ]
}
```

skin.css 是**纯 CSS**，作用域固定为 `html[data-kami-skin="<你的id>"] .kami-root` 起步。

## 二、契约已更新（**必须重读 docs/皮肤契约.md**，新增了 4 处）

1. **§3.7 文案令牌 —— 品牌化标题（用户点名要求）**
   界面文案不再写死在前端里。你用令牌提供，前端会读并写进 DOM（皮肤切换时会重读）：
   ```css
   --kami-label-think: 收起时的标题;
   --kami-label-think-open: 展开时的标题;
   --kami-label-think-copy: 复制按钮;
   --kami-label-render / --kami-label-raw: 渲染 / 原文;
   --kami-label-options: 行动选项标题;
   --kami-label-fill / --kami-label-send: 填入 / 发送;
   --kami-label-hint: 底部提示;
   --kami-label-empty: 空态文案;
   ```
   （**值不要加引号**，前端会去掉首尾引号与空白。）

   - **奈亚子的TRPG**：用户已经指定 —— 思维链**收起态标题 = 奈亚子的DM帷幕**，**展开态标题 = 欸？不要偷看嘛~**。其余文案令牌你自己按概念拟。
   - **恋雨 / 辉光管**：**标题由你原创**，必须贴合你的概念、并且一看就知道是这套皮肤。请在汇报里单独说明你拟的这两条标题与理由。

2. **§4.3 状态钩子（前端保证，你消费）**
   - `.kami-collapse[data-kami-open="0|1"]`：前端**只切属性**，显隐与进出动画全归你；
   - `data-kami-view="render|raw"`（在组件根上）：双视图切换，两个视图 DOM 始终保留；
   - `.is-done`：一次性成功反馈（复制成功 / 已填入 / 已发送），前端约 1200ms 后自己移除；
   - `--kami-value`（0–1）：滑杆的归一化值，脚本会写在滑杆元素上 —— 这是你辉光管"通电区段"那条依赖的落地方式；
   - 结构性兜底（`display:none` 那三条）由**脚本注入在皮肤 CSS 之前**，你可以用同优先级的规则覆盖它来实现收起动画。

3. **§4.4 面板几何令牌**：`.kami-root[data-kami-comp="panel"]` 是**铺满视口的定位舞台**（脚本已内联保证 `position:fixed; inset:0; pointer-events:none`），`.kami-drop` 的位置与尺寸来自脚本下发的四个令牌 `--kami-panel-x / -y / -w / -h`。**窄屏（`max-width:768px`）必须是贴底的底部抽屉**。皮肤内不得出现 `vh`。

4. **§3.6 全局旋钮 / §3.8 参数**：字号缩放必须通过 `calc(var(--kami-fs-scale) * 基准)` 真正生效；明暗 / 动效（`full|calm|off`）/ 密度（`compact|cozy|roomy`）用 `<html>` 属性选择器响应。

## 三、自检环境（**重点**）

预览台：`http://127.0.0.1:8765/test/harness/preview.html?skin=<你的id>`

- 该页**实时读取 src/skins/**，你改完 skin.css **只要刷新页面**就能看到，**不需要构建**。
- 页面里有：QR bar（🎨 按钮，点开就是皮肤管理面板）、两个**消息楼层 iframe**（思维链 + 行动选项，用的是**已经冻结的 DOM 骨架**）、以及面板本身（面板也被你的皮肤渲染，包含标签页、卡片、滑段切换、开关）。
- `?closed=1` 可以只看前端不展开面板；`http://127.0.0.1:8765/test/harness/preview.html` 不带参数默认打开面板。
- **纪律**：不要运行 `node build/build.mjs`（会与其它设计师抢产物编号，构建由主 agent 统一做）；不要启动或停止服务器（8765 常驻）。
- 需要看实际观感可以用浏览器工具自查，但**只开你自己的 agent 窗口**，用完立刻 stop session；**不要借用用户的标签页**。把页面拉高到 1075 宽可以看到桌面形态，缩到 375 宽看手机形态（`browser_assist action=resize`）。

## 四、交付标准（我会复跑，不达标就打回）

1. `node build/lint-skins.mjs <你的id>` 必须 **PASS**（规则见契约第 7 节：选择器必须含 kami、不得有 vh / 外链 / @font-face / @import、令牌必须覆盖全集、必须有 `:focus-visible` 与 `prefers-reduced-motion` 与 `data-kami-motion` 响应、每个特效 id 必须在 CSS 里有 `data-kami-effects~="id"` 的规则、params 的 value 必须在 min..max 内）。
2. 面板必须真的能被驱动：切皮肤、拖动滑杆、点开关、切标签页，都要有你这套皮肤的反馈。
3. 320px 宽下必须成立；面板在窄屏是贴底抽屉。
4. 消息楼层 iframe 里**不得使用 `filter` / `backdrop-filter`**（按楼层线性付费），面板内可以用。

## 五、工作方式

按你方案的顺序写完整份 CSS → 刷新预览台自查 → 以创意总监身份自审（概念是否贯穿？观感是否成立？动效是否有意义？320px 是否可用？）→ **至少一轮实质打磨** → 跑 lint → 汇报。

## 六、汇报格式（3–5 句）

1. 交付了什么（文件 + 行数/字节）；
2. 最得意的一处实现（具体到 CSS 手法）；
3. 你原创的品牌化标题及其理由（恋雨 / 辉光管 必答）；
4. 遗留风险或没做到的；
5. 需要主 agent（前端侧 / 面板侧）配合调整的地方。