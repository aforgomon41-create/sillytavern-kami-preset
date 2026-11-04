/* 手动搜索：设置桥（模型、提示词，给新工具箱的「网络搜索」页）、打开手动搜索窗口、可选的消息栏快捷按钮。
   窗口本身由新运行库的工具箱画（KamiToolboxNext.manualSearch）；2026-11-04 起旧组件写的设置区与弹窗已删。 */
export function createKamiManualSearchUi(env) {
  var api=env.search,host=env.host,disposed=false,definition=null;
  var fetchState='idle',fetchSeq=0,fetchAbort=null,fetchTimer=null,models=Object.create(null),lastTopic='';
  var copy={model:Object.assign({},env.copy.model,{section:'手动搜索模型',note:'此模型仅用于手动搜索。自动搜索跟随剧情连接，压缩模型独立保存。',customHint:'自定义接口请填写完整地址、密钥和模型后再搜索。'}),prompts:Object.assign({},env.copy.prompts,{section:'手动搜索提示词',task:'任务正文（结合本次查询要求）',hint:'仅手动查询使用。头部、任务正文和尾部的编辑方式与摘要提示词一致；不修改网络搜索头部任务。'}),toasts:env.copy.toasts};
  var bridgeEditor=null;
  function changed(){try{if(env.changed)env.changed();}catch(e){}}
  function llmEditor(){var state=api.manualSettings().llm;if(!bridgeEditor||bridgeEditor.__state!==state){bridgeEditor=createKamiLlmSettingsController({state:state,copy:copy,defaultTask:env.defaultTask,save:api.saveManual,render:changed,toast:env.toast,invalidate:invalidate});bridgeEditor.__state=state;}return bridgeEditor;}
  function cachedModels(cur){var cached=models[cur.name];return cached&&cached.key===configKey(cur)?cached.ids:null;}
  function configKey(cur){return JSON.stringify([cur.source,cur.apiurl,cur.key]);}
  function invalidate(name){delete models[name];fetchSeq++;if(fetchAbort)fetchAbort.abort();fetchAbort=null;fetchState='idle';if(fetchTimer!==null){host.clearTimeout(fetchTimer);fetchTimer=null;}changed();}
  async function fetchModels(){
    if(disposed||fetchState==='busy')return;var config=Object.assign({},llmEditor().currentConfig()),key=configKey(config),seq=++fetchSeq;fetchState='busy';fetchAbort=new host.AbortController();changed();
    try{var deadline=new Promise(function(_,reject){fetchTimer=host.setTimeout(function(){if(fetchAbort)fetchAbort.abort();reject(new Error('获取模型列表超时，请重试'));},30000);});var result=await Promise.race([env.fetchModels(config,fetchAbort.signal),deadline]);if(disposed||seq!==fetchSeq)return;var ids=result.data.map(function(row){return String(typeof row==='string'?row:row&&(row.id||row.name)||'').trim();}).filter(Boolean);ids=Array.from(new Set(ids)).sort();if(!ids.length)throw new Error('接口没有返回可用模型');models[config.name]={key:key,ids:ids};env.toast('success','已获取 '+ids.length+' 个模型');}
    catch(error){if(!disposed&&seq===fetchSeq){var text=error.message||String(error);if(config.key)text=text.split(config.key).join('[密钥已隐藏]');env.toast('error',text);}}
    finally{if(seq===fetchSeq){if(fetchTimer!==null)host.clearTimeout(fetchTimer);fetchTimer=null;fetchAbort=null;fetchState='idle';if(!disposed)changed();}}
  }
  function open(){
    if(disposed)return;
    try{var nx=host.KamiToolboxNext;if(nx&&typeof nx.alive==='function'&&nx.alive()&&typeof nx.manualSearch==='function'){nx.manualSearch();return;}}catch(e){}
    env.toast('error','手动搜索窗口打不开：「🧩 运行库」没有加载，请在酒馆助手脚本列表里启用它');
  }
  function syncShortcut(){
    if(disposed)return;var state=api.status(),wanted=state.enabled&&state.mode==='service'&&state.shortcut,defs=host.__hubDefs||(host.__hubDefs=[]);
    if(wanted&&!definition){var registered={name:'🔎 手动搜索',order:41,ping:Date.now(),active:true,alive:function(){return !disposed&&registered.active;},ready:function(){return true;},label:function(){return '🔎 手动搜索'+(api.status().manualRunning?'·搜索中':'');},click:function(){open();}};definition=registered;defs.push(definition);host.dispatchEvent(new host.Event('kami-hub-def'));}
    else if(!wanted&&definition){unregisterShortcut();}
    if(definition)definition.ping=Date.now();
  }
  function unregisterShortcut(){
    if(!definition)return;var old=definition;old.active=false;definition=null;var defs=host.__hubDefs||[],at=defs.indexOf(old);if(at>=0)defs.splice(at,1);
    try{if(host.__hub&&typeof host.__hub.unregister==='function')host.__hub.unregister(old.name);}catch(e){}
    host.dispatchEvent(new host.Event('kami-hub-def'));
  }
  return {open:open,ping:syncShortcut,
    llm:function(){return createKamiLlmBridge({state:api.manualSettings().llm,editor:llmEditor(),models:cachedModels,fetch:fetchModels,busy:function(){return fetchState==='busy';},profiles:env.profiles});},
    lastTopic:function(v){if(typeof v==='string')lastTopic=v;return lastTopic;},
    setShortcut:function(v){api.manualSettings().shortcut=!!v;api.saveManual();syncShortcut();changed();},
dispose:function(){if(disposed)return;invalidate('');disposed=true;unregisterShortcut();bridgeEditor=null;}};
}
