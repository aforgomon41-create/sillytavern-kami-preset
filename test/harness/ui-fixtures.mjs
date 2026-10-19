export function buildUiFixtures(ui) {
 const state={events:[],templates:[]},label='用于验证换行与可访问性的示例文字';
 const items=[{id:'one',value:'one',label:'第一项',content:'第一页'},{id:'two',value:'two',label:'第二项',content:'第二页'},{id:'disabled',value:'disabled',label:'不可用项',disabled:true}];
 const sample={
  button:()=>ui.button({label:'执行',onClick:()=>state.events.push('button')}),
  iconButton:()=>ui.iconButton({label:'关闭',icon:'×'}),
  buttonGroup:()=>ui.buttonGroup({label:'操作组',items:[{label:'保存',variant:'primary'},{label:'取消',variant:'ghost'}]}),
  tabs:()=>{const node=ui.tabs({label:'页面',items:items.concat(Array.from({length:8},(_,i)=>({id:'long-'+i,label:'用于验证横向滚动的长页签'+i,content:'页面'+i}))),value:'one',onChange:v=>state.tab=v});node.kami.bar.appendChild(ui.slot('tab-actions',ui.select({label:'快捷选择',items:[{value:'a',label:'示例皮肤'},{value:'b',label:'另一个较长的皮肤名称'}],value:'a'})));return node;},
  segmented:()=>ui.segmented({label:'模式',items,value:'one',onChange:v=>state.segment=v}),
  menu:()=>ui.menu({label:'菜单',items:[{id:'a',label:'打开',onSelect:()=>state.events.push('menu')},{label:'不可用',disabled:true}]}),
  text:()=>ui.text({label:'文本',value:label}),textarea:()=>ui.textarea({label:'多行文本',value:label}),
  number:()=>ui.number({label:'数量',value:3,min:1,max:10}),password:()=>ui.password({label:'密钥',value:'fixture-value'}),
  select:()=>ui.select({label:'选项',items,value:'two'}),
  combobox:()=>ui.combobox({label:'搜索选项',items,value:'one',onChange:v=>state.combo=v}),
  checkbox:()=>ui.checkbox({label:'复选',checked:true}),radio:()=>ui.radio({label:'单选',name:'fixture-radio',value:'one'}),
  switch:()=>ui.switch({label:'开关',checked:true}),range:()=>ui.range({label:'大小',value:50,min:0,max:100}),
  card:()=>ui.card({title:'普通容器卡',content:label,footer:'卡片页脚'}),
  collapse:()=>ui.collapse({title:'折叠卡',content:label}),group:()=>ui.group({label:'一组设置',content:label}),divider:()=>ui.divider(),
  badge:()=>ui.badge('已保存'),status:()=>ui.status({label:'准备就绪'}),progress:()=>ui.progress({label:'进度',value:30,max:100}),spinner:()=>ui.spinner({label:'正在处理'}),
  tooltip:()=>ui.tooltip({label:'帮助',content:label}),alert:()=>ui.alert({label:'这里显示操作结果',kind:'info'}),
  list:()=>ui.list({items:['短内容',label]}),table:()=>ui.table({caption:'数据表',columns:[{key:'name',label:'名称'},{key:'value',label:'数值'}],rows:[{name:label,value:42}]}),
  tree:()=>ui.tree({label:'目录',items:[{label:'父项',expanded:true,children:[{label:'子项'}]},{label:'另一项'}],onSelect:x=>state.tree=x.label}),
  empty:()=>ui.empty({label:'暂无内容'}),
  field:()=>ui.field({label:'带说明的设置',control:ui.text({label:'设置值',value:'内容'}),hint:'解释这个设置的作用'}),
  settingsCard:()=>ui.settingsCard({title:'设置卡',content:label}),
  choiceCard:()=>ui.choiceCard({label:'选择卡',description:label,selected:true,onChange:v=>state.choice=v}),
  modelConnection:()=>ui.modelConnection({title:'模型连接',address:'https://example.invalid/v1',model:'fixture',fetchModels:async()=>['fixture','fixture-2']}),
  promptEditor:()=>ui.promptEditor({value:{head:'系统说明',task:'任务要求',tail:'格式要求'},onChange:v=>state.prompt=v}),
  templateManager:()=>ui.templateManager({items:[{id:'default',label:'默认模板'}],value:'default',onSave:v=>state.templates.push(v)}),
  markdown:()=>ui.markdown({content:'安全的阅读内容 <script>不会执行</script>'}),
  searchResults:()=>ui.searchResults({facts:['对象·字段：查证资料'],sources:[{id:'s1',url:'https://example.org/docs',label:'资料来源'}]}),
  sources:()=>ui.sources({items:[{id:'s1',url:'https://example.org/docs',label:'资料来源'},{url:'javascript:alert(1)',label:'危险来源'}]}),
  steps:()=>ui.steps({items:[{label:'理解需求',state:'done'},{label:'查询资料',state:'current',description:'第1/2个查询'},{label:'保存结果',state:'waiting'}]}),
  resourceGrid:()=>ui.resourceGrid({items:[{id:'a',label:'样式A'},{id:'b',label:'样式B'}],value:'a',onChange:v=>state.resource=v}),
  toolbar:()=>ui.toolbar({label:'工具栏',items:[{label:'新增'},{label:'编辑'},{label:'删除',disabled:true}]}),
 };
 return {sample,state};
}
