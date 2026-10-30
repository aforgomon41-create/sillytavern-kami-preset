/* ============================================================
 * 用户自定义文风 · 共享 UI 模块（渲染 + 交互 + 状态机）
 * ------------------------------------------------------------
 * **不是独立脚本**：src/scripts/meta.json 里不登记它（与 _preset-cards.js / _panel-gestures.js
 * 同一个套路）。构建期由 build/kami-doc.mjs 的 expandCustomStyleUi 内联进
 * 40-预设设置.js 与 50-引导.js，两个脚本里各留一行占位注释（占位符常量名见
 * build/kami-doc.mjs 的 CUSTOM_STYLE_UI_MARK）。
 * ⚠️ 本文件里**不许出现那串占位符字面量**：它会被内联进脚本，二次展开时就会自我复制
 * （展开器里有这条硬检查，撞上会直接构建失败）。
 *
 * 为什么要有这一份：这块功能一开始只长在引导面板里，用户 2026-10-02 要求预设设置面板
 * 也要有。本仓库的规矩写在 _preset-cards.js 头部：「同一个组件写两套，已经丢过两次功能」。
 * 所以整块（不只是结构）抽到这里 —— 状态机、DOM、事件、文案全在这一个文件里，
 * 两个面板各自只留一句「在我这块容器里挂一次」。
 *
 * ⚠️ 与 _preset-cards.js 的一处**有意不同**：那个模块「不挂事件」是因为它只建结构、
 *    两块面板的行为不同；这一块两块面板的行为**要求逐条一致**（用户拍板），
 *    所以事件与状态机必须一起共享 —— 分出去就又变成两套了。
 *
 * 写入一律走注入的 api（40-预设设置.js 暴露的 KamiPreset 子集）：
 *   api.customStyles({ anchorCards })        → 读
 *   api.applyCustomStyles({ anchorCards, adds, updates, removes }) → 写（保存才调）
 * 本模块**不碰预设**、不读全局、不自己造文案以外的界面文本。
 *
 * 文案唯一真相 = 本文件的 CUSTOM_STYLE_COPY（全是占位，等文案 agent 出稿替换）。
 * ============================================================ */

/* 两个面板共用的一份文案。改这里两个面板同时变 —— 这就是抽模块的目的。 */
export var CUSTOM_STYLE_COPY = {
  sectionTitle: '自定义文风',
  intro: '在这里添加或调整自己的文风，全部改好后点击保存才会生效',
  unsaved: '有改动还没保存',
  savedToast: '已保存到预设',
  addBtn: '新增',
  saveBtn: '保存',
  editBtn: '编辑',
  delBtn: '删除',
  undoBtn: '撤销',
  doomedTag: '待删除',
  pendingTag: '待保存',
  orphanTag: '原分组失效',
  /* {n} 会被替换成条数（与 stepCounter 同一套替换规矩） */
  orphanNote: '有 {n} 条自定义文风现在不在任何一组里，多半是预设更新挪了位置。点右边的编辑重新选一组，保存就会归位。',
  okBtn: '确定',
  cancelBtn: '取消',
  nameLabel: '文风名称',
  groupLabel: '所属分组',
  contentLabel: '文风内容',
  namePlaceholder: '给文风起个名字',
  contentPlaceholder: '写下具体的行文风格和描写要求',
  modeSingle: '选一',
  modeAny: '任选',
  modeNoteSingle: '同组只能开启一条，启用这条会自动关掉同组其它文风',
  modeNoteAny: '同组可以同时开启多条，你能根据喜好自由搭配组合',
  empty: '还没有文风，点击新增写一条',
  degrade: '配套脚本当前没有运行，请刷新网页重新加载',
  noSection: '当前预设缺少写作指导分区，请换用完整预设',
  nameRequired: '请先填写文风名字',
  errNoTree: '无法读取当前预设，请刷新页面后再试一次',
  errNoSection: '预设缺少写作指导分区，请切换到完整预设再保存',
  errNoSectionEnd: '读不到写作指导分区的收尾标记。为了不把文风插到外面出看不见的毛病，这个功能先停用了。',
  errOrderShape: '预设排序结构异常，请重新选择预设或刷新网页',
  errVerify: '内容校验未通过，修改已复原，请检查后重新保存',
  errSave: '写入预设失败，改动已复原，请重试或刷新网页',
  errName: '文风名字不合规范，请换个简单名字重新保存',
  errGroup: '所选分组在预设中不存在，请重新选择分组再保存',
  errGeneric: '保存出现未知问题，请刷新网页后再试一次'
};
