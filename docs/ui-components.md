# 共享组件库与皮肤系统整理（2026-10-19）

> **2026-10-27 现状**：本文讲的是老组件核心 `createKamiUi`（`src/ui/core.js`）。0.93 起它**只在「🧩 运行库」里有一份**，
> 不再构建期内联进各脚本；各处的 `/* @@KAMI_UI@@ */` 展开成取用 shim（按 HOST → 本窗口 → 父窗口链找运行库）。
> 四块面板的骨架与内容页已改由 React + Radix 组件层（`RT.UI`）渲染，但正则前端与若干共享模块（压缩、搜索、模型连接、提示词编辑器等）仍在用本文的工厂。
> 两套体系怎么分工、React 怎么写，见 [前端技术栈](前端技术栈.md)。

用户在讨论一套约30个基础组件、12个组合组件和3类容器后，明确要求“一次性全做”。本轮完整实现组件库并迁移现有界面；沿用用户已经确认的21套皮肤、系统字体、页面密度、工具箱与搜索弹窗布局，不新增面向用户的页面或重新设计视觉。现有页面的布局审批继续适用。组件展示台只作开发验证。

## 边界

- 组件库负责DOM、组件身份、交互状态、可访问性、布局与生命周期。
- 公共基础CSS在皮肤运行和未运行时都生效，使用低优先级、完整默认值；皮肤负责材质、配色、品牌排版与装饰。
- 组件角色区分普通容器卡、选择卡、折叠卡；承载容器区分消息内嵌、主面板、模态弹窗。弹窗不使用全屏面板舞台身份。
- 保留既有业务属性、事件委派、设置键、脚本ID与文件夹、已有皮肤外观。组件核心由运行库统一提供（0.93 起；之前是构建期内联），不为组件新增酒馆助手脚本。
- 45个公开组件以真实实现和清单核对，不用空函数或别名凑数。既有模型连接与提示词编辑器直接复用，网络、配置保存与模型请求仍归业务控制器。
- 组件内容默认按文本处理；富文本必须提供可信渲染器。链接仅允许HTTP(S)及明确授权的本地片段。扩展通过插槽和可销毁模块，不执行输入中的脚本。
- 窄屏按容器宽度重排；支持键盘、焦点、禁用、忙碌、错误、空态、减少动效。自定义界面可使用行、列、网格、分栏、换行等布局组合。

## 清单

基础30项：button、iconButton、buttonGroup、tabs、segmented、menu；text、textarea、number、password、select、combobox、checkbox、radio、switch、range；card、collapse、group、divider；badge、status、progress、spinner、tooltip、alert；list、table、tree、empty。

组合12项：field、settingsCard、choiceCard、modelConnection、promptEditor、templateManager、markdown、searchResults、sources、steps、resourceGrid、toolbar。

容器3项：embedded、panel、dialog。

## 迁移与样式

共享工厂统一生成现有类名并写入精确组件身份；已有独立渲染器作为组合组件适配器接入。三个正则前端使用同一运行时，保留酒馆替换字符串与宏限制。所有21套皮肤获得公共底座；搜索资料拥有独立身份，样式通过明确的兼容映射保持原视觉。限定组件CSS作用范围，修复令牌上提丢失局部条件、文案仅五套、外链检查漏报和皮肤检查未进入构建。

## 素材、风格与验证

不新增图片、字体或外部依赖。沿用已有素材来源与授权；图片池与d10/d20装饰生命周期保留。验证包含组件交互、全皮肤明暗和容器宽度、原生菜单、长文本、嵌套、弹窗、资源释放，以及既有压缩、搜索、更新、标签和构建守卫。手机尺寸使用浏览器视口，除非另有记录，不宣称物理手机验收。

## 使用约定

```js
var ui = createKamiUi(document);
var input = ui.text({value:"",label:"名称",onChange:function(value){save(value);}});
var field = ui.field({label:"名称",control:input,hint:"填入要保存的名称"});
var page = ui.settingsCard({title:"设置",content:ui.layout("stack",[field])});
var modal = ui.dialog({title:"编辑",content:page});
modal.kami.open(triggerButton);
// 页面卸载或模块停用时：
modal.kami.destroy();
```

工厂返回真实DOM节点，可继续组合。带状态的节点提供 `.kami` 控制器；例如 tabs 的 `select/value`、progress 的 `update`、field 的 `setError`、collapse 的 `setOpen`、choiceCard 的 `setSelected`、menu 的 `open/close`、容器的 `open/close/destroy`。不应直接覆盖 `.kami` 或私有缓存。通用 `ui.destroy(root)` 递归收回子组件监听，重复调用安全；移除DOM前先销毁。业务模块自己注册的定时器、宿主事件和网络请求仍由业务模块清理。

六种布局：stack（纵排）、row（横排）、wrap（自动换行）、grid（网格）、split（可换行分栏）、center（居中）。grid 可设置 columns 或最小列宽 min；split 用 min 控制折行。`ui.slot(name,content)` 为组合组件留出具名位置，装饰槽不抢点击；不要通过输入字符串拼接HTML。

面板默认支持标题拖动、右下角拖动/方向键调整尺寸、Escape关闭、手机标题下拉关闭；通过 draggable/resizable/closable 关闭对应能力。弹窗使用原生 dialog 管理模态焦点，关闭后回到触发按钮，长内容只在正文滚动。原有面板暂沿用共享手势模块以保留用户位置与尺寸存储；新面板使用容器工厂。

既有压缩/手动搜索的连接卡与提示词由组合组件适配已有渲染器，不复制业务控制器。模板列表、业务数据、密钥保存和真实API调用不归组件库管理。Markdown默认是安全文本；需要富文本时传入返回已净化DOM的 render，继续复用项目现有净化流程。公开属性拒绝事件处理属性、srcdoc和危险URL，URL属性仅接受HTTP(S)。

## 验证命令

- `node test/harness/ui-components.mjs`：45项清单、展开链、宏/捕获限制、属性安全、CSS兼容、21皮肤令牌。
- `node test/harness/server.mjs --port 8794`：本地开发验证台。
- `KAMI_PREVIEW_ORIGIN=http://127.0.0.1:8794 node test/harness/ui-components-browser.mjs`：504种主题/明暗/宽度/容器/展开状态，含键盘、异步迟到、销毁、焦点与长内容滚动。PowerShell 请用 `$env:KAMI_PREVIEW_ORIGIN="http://127.0.0.1:8794"` 设置地址，再执行命令。
- `node test/harness/toolbox-browser.mjs`：现有工具箱的两套限额、模型列表、模板、快捷入口、单楼搜索、中断、弹窗和清理（使用模拟返回）。
- `node test/harness/brand-skins-browser.mjs`：三套品牌皮肤、菜单、图片共享与骰子装饰。

需要本机Chrome；默认路径为常见Windows安装位置，其他路径用 KAMI_CHROME 指定。离线检查已进入正式构建；浏览器检查在预览台单独运行，避免构建依赖常驻浏览器。

组件核心的 `version` 独立于预设版本与运行库版本；修改公共API或运行时行为并准备发布时更新 core.js 的 version。缓存只复用完全相同的版本，新版不会继续拿到旧版实现；旧控件仍按各自生命周期销毁。

## 页签导航约束（1.0.1）

页签是单行横向滚动轨道，不能与可换行按钮组共用换行规则。默认 `ui.tabs` 按内容宽度排列，超出后左右滑动；`ui.tabs({mode:"fit",...})` 用于工具箱这种等分页签，同样保持单行。文字不压缩成多行，不通过缩小文字来塞进窗口。皮肤只修改材质、配色与间距，不改变导航轨道的换行和滚动方式。

尾部快捷选择等控件放进 `ui.slot("tab-actions",control)` 并追加到页签轨道；公共层统一负责贴右、内容宽度和最大占用比例，不再为每个面板手写定位，也不继承表单的整行控件宽度。普通按钮组仍可换行。

`ui-components.mjs` 在构建时拒绝公共层和任一皮肤把页签改成 wrap；`ui-components-browser.mjs` 通过长页签检验新组件。`tab-layout-browser.mjs` 验证真实皮肤管理、预设设置、工具箱的21套皮肤、两种明暗、320/390/1440px、默认/放大字体，并检查触屏横滑、鼠标滚轮与切换远端页签；加 `--built` 检查最新成品，`--screens` 保存截图。本次按用户要求恢复先前已确认的布局。

原生搜索能力测试在现有模型连接卡内复用 button、status、progress、sources；业务模块负责请求和取消，不另造控件或独立运行脚本。成品回归为 native-search-browser.mjs，模拟模型响应，不消耗真实额度。
