/* 手动查询设置、输入/进度弹窗及可选快捷按钮。模型和模板编辑复用压缩组件与写回控制器。 */
export function createKamiManualSearchUi(env) {
  var api=env.search,doc=env.document,host=env.host,make=env.make,settingsRoot=null,editor=null,dialog=null,returnFocus=null,offProgress=null,disposed=false,definition=null;
  var fetchState='idle',fetchSeq=0,fetchAbort=null,fetchTimer=null,models=Object.create(null),lastTopic='';
  var copy={model:Object.assign({},env.copy.model,{section:'手动搜索模型',note:'此模型仅用于手动搜索。自动搜索跟随剧情连接，压缩模型独立保存。',customHint:'自定义接口请填写完整地址、密钥和模型后再搜索。'}),prompts:Object.assign({},env.copy.prompts,{section:'手动搜索提示词',task:'任务正文（结合本次查询要求）',hint:'仅手动查询使用。头部、任务正文和尾部的编辑方式与摘要提示词一致；不修改网络搜索头部任务。'}),toasts:env.copy.toasts};
  function fold(title){var card=createKamiUi(doc).collapse({title:title});return {card:card,body:card.body};}
  function configKey(cur){return JSON.stringify([cur.source,cur.apiurl,cur.key]);}
  function invalidate(name){delete models[name];fetchSeq++;if(fetchAbort)fetchAbort.abort();fetchAbort=null;fetchState='idle';if(fetchTimer!==null){host.clearTimeout(fetchTimer);fetchTimer=null;}if(settingsRoot){var button=settingsRoot.querySelector('[data-search-llm-act="fetch-models"]');if(button){button.disabled=false;button.textContent=copy.model.fetchModels;}for(var select of settingsRoot.querySelectorAll('select[data-search-llm-mi="model"]')){var row=select.closest('.kami-field');if(row)row.remove();}}}
  async function fetchModels(){
    if(disposed||fetchState==='busy'||!editor)return;var config=Object.assign({},editor.currentConfig()),key=configKey(config),seq=++fetchSeq;fetchState='busy';fetchAbort=new host.AbortController();renderEditors();
    try{var deadline=new Promise(function(_,reject){fetchTimer=host.setTimeout(function(){if(fetchAbort)fetchAbort.abort();reject(new Error('获取模型列表超时，请重试'));},30000);});var result=await Promise.race([env.fetchModels(config,fetchAbort.signal),deadline]);if(disposed||seq!==fetchSeq)return;var ids=result.data.map(function(row){return String(typeof row==='string'?row:row&&(row.id||row.name)||'').trim();}).filter(Boolean);ids=Array.from(new Set(ids)).sort();if(!ids.length)throw new Error('接口没有返回可用模型');models[config.name]={key:key,ids:ids};env.toast('success','已获取 '+ids.length+' 个模型');}
    catch(error){if(!disposed&&seq===fetchSeq){var text=error.message||String(error);if(config.key)text=text.split(config.key).join('[密钥已隐藏]');env.toast('error',text);}}
    finally{if(seq===fetchSeq){if(fetchTimer!==null)host.clearTimeout(fetchTimer);fetchTimer=null;fetchAbort=null;fetchState='idle';if(!disposed)renderEditors();}}
  }
  function modelOptions(){return {scope:'manual',state:api.manualSettings().llm,copy:copy,make:make,document:doc,section:fold,field:env.ui.field,note:env.ui.note,text:env.ui.text,select:env.ui.select,profiles:env.profiles,currentConfig:editor.currentConfig,models:function(cur){var cached=models[cur.name];return cached&&cached.key===configKey(cur)?cached.ids:null;},fetchState:fetchState,snapshot:editor.snapshot,currentTemplate:editor.currentTemplate};}
  function renderEditors(){
    if(!settingsRoot||disposed)return;var was=[...settingsRoot.querySelectorAll('details')].map(function(row){return row.open;});settingsRoot.textContent='';
    editor=createKamiLlmSettingsController({state:api.manualSettings().llm,copy:copy,defaultTask:env.defaultTask,save:api.saveManual,render:renderEditors,toast:env.toast,invalidate:invalidate});
    var model=createKamiUi(doc).modelConnection({render:renderKamiLlmModel,env:modelOptions()}),prompts=createKamiUi(doc).promptEditor({render:renderKamiLlmPrompts,env:modelOptions()});
    settingsRoot.appendChild(model.card);settingsRoot.appendChild(prompts.card);
    [...settingsRoot.querySelectorAll('details')].forEach(function(row,i){row.open=was[i]===true;});
  }
  function mount(parent){
    var outer=fold('手动搜索设置');outer.card.setAttribute('data-search-manual-settings','1');parent.appendChild(outer.card);env.ui.note(outer.body,'以下设置仅用于手动搜索。自动搜索仍跟随剧情连接；这些修改不会改变压缩设置。');
    var label=make('label','kami-switch'),checkbox=make('input','kami-switch-input');checkbox.type='checkbox';checkbox.checked=api.manualSettings().shortcut;checkbox.setAttribute('aria-label','显示消息栏上方手动搜索按钮');var track=make('span','kami-switch-track');track.appendChild(make('span','kami-switch-knob'));label.appendChild(checkbox);label.appendChild(track);env.ui.field(outer.body,'显示消息栏上方按钮',label);checkbox.addEventListener('change',function(){api.manualSettings().shortcut=checkbox.checked;api.saveManual();syncShortcut();});
    api.mountLimits(outer.body,true,fold);
    settingsRoot=make('div');outer.body.appendChild(settingsRoot);renderEditors();env.ui.note(outer.body,'完成后只新增资料楼层。查询数、来源数、详细资料数和保存预算以上方手动搜索限额为准。');
    settingsRoot.addEventListener('click',function(event){var t=event.target.closest('[data-search-llm-act],[data-search-llm-model-mode]');if(!t||!editor)return;var mode=t.getAttribute('data-search-llm-model-mode'),act=t.getAttribute('data-search-llm-act');if(mode){editor.mode(mode);return;}var list=t.getAttribute('data-search-llm-prompt'),index=Number(t.getAttribute('data-search-llm-pi')||0);if(act==='fetch-models')fetchModels();else if(act==='config-save-as')editor.saveConfig(settingsRoot.querySelector('[data-search-llm-mi="__name"]').value);else if(act==='config-del')editor.deleteConfig();else if(act==='tpl-save-as')editor.saveTemplate(settingsRoot.querySelector('[data-search-llm-pt="__name"]').value);else if(act==='tpl-del')editor.deleteTemplate();else if(act==='task-reset')editor.resetTask();else if(act==='prompt-add')editor.addPrompt(list);else if(act==='prompt-del')editor.removePrompt(list,index);});
    settingsRoot.addEventListener('change',function(event){var t=event.target,field=t.getAttribute('data-search-llm-mi');if(field)editor.modelInput(field,t.value);else if(t.getAttribute('data-search-llm-pt')==='__tpl')editor.switchTemplate(t.value);else if(t.hasAttribute('data-search-llm-prompt'))editor.promptChange(t.getAttribute('data-search-llm-prompt'),Number(t.getAttribute('data-search-llm-pi')||0),t.getAttribute('data-search-llm-pf'),t.value);});
  }
  function close(){if(!dialog)return;if(api.status().manualRunning)api.cancel('手动搜索已中断');if(offProgress){offProgress();offProgress=null;}var old=dialog;dialog=null;try{old.kami.destroy();}catch(e){}old.remove();if(returnFocus&&returnFocus.isConnected)returnFocus.focus();returnFocus=null;}
  function open(trigger){
    if(disposed)return;if(dialog){dialog.focus();return;}var state=api.status();if(!state.enabled||state.mode!=='service'){env.toast('warning','请先开启搜索能力并选择搜索服务');return;}if(state.running&&!state.manualRunning){env.toast('warning','请先等待自动搜索完成');return;}
    env.ensureStyle();returnFocus=trigger||doc.activeElement;dialog=createKamiUi(doc).dialog({title:'手动搜索',closable:false,onClose:function(){close();}});dialog.classList.add('kami-manual-dialog');var root=dialog.root,shell=dialog.shell,head=dialog.head;var x=make('button','kami-btn kami-btn--ghost','×');x.type='button';x.setAttribute('aria-label','关闭并中断手动搜索');var headActions=make('div','kami-actions');headActions.appendChild(x);head.appendChild(headActions);
    var body=dialog.body,inputBox=make('div'),input=make('textarea','kami-textarea');input.setAttribute('aria-label','本次搜索要求');input.placeholder='例如：整理当前年代的地理、居民、文化与规则，排除未来剧情。';input.value=lastTopic;inputBox.appendChild(make('p','','这次想查什么？'));inputBox.appendChild(input);env.ui.note(inputBox,'会参考角色卡、世界书和经过正则处理的历史；不带剧情预设条目。');body.appendChild(inputBox);
    var progressBox=make('div','kami-search-progress'),statusBox=make('div','kami-search-status'),statusIcon=make('span','kami-search-status-icon'),statusText=make('div'),eyebrow=make('p','kami-search-status-eyebrow','手动搜索进行中'),message=make('p','kami-search-status-title'),queryCount=make('p','kami-search-status-count'),steps=make('ol','kami-search-stages');
    progressBox.hidden=true;statusBox.setAttribute('role','status');statusBox.setAttribute('aria-live','polite');statusBox.setAttribute('aria-atomic','true');statusIcon.setAttribute('aria-hidden','true');statusText.appendChild(eyebrow);statusText.appendChild(message);statusText.appendChild(queryCount);statusBox.appendChild(statusIcon);statusBox.appendChild(statusText);progressBox.appendChild(statusBox);steps.setAttribute('aria-label','搜索步骤');
    var stepNodes={},visited={},lastPhase='plan',stageInfo=[['plan','理解需求','识别世界与查询范围'],['search','查询外部资料','按主题查询真实来源'],['extract','整理详细资料','核对事实、细节与引用'],['save','保存资料','只新增一个资料楼层']];
    for(var step of stageInfo){var line=make('li'),mark=make('span','kami-search-stage-mark'),labels=make('div'),label=make('strong','',step[1]),desc=make('small','',step[2]);mark.setAttribute('aria-hidden','true');labels.appendChild(label);labels.appendChild(desc);line.appendChild(mark);line.appendChild(labels);stepNodes[step[0]]={line:line,mark:mark,desc:desc,defaultText:step[2]};steps.appendChild(line);}progressBox.appendChild(steps);env.ui.note(progressBox,'可以随时中断；未完成的资料不会写入聊天。');body.appendChild(progressBox);
    var foot=dialog.foot,cancelButton=make('button','kami-btn kami-btn--ghost','取消'),confirm=make('button','kami-btn','确认并搜索');cancelButton.type=confirm.type='button';foot.appendChild(cancelButton);foot.appendChild(confirm);
    function paint(p){
      inputBox.hidden=true;progressBox.hidden=false;message.textContent=p.message;confirm.hidden=true;cancelButton.textContent=p.running?'中断搜索':'关闭';cancelButton.classList.toggle('is-search-stop',p.running);
      var order=['plan','search','extract','save'],at=order.indexOf(p.phase),failed=p.phase==='error'||p.phase==='cancelled';if(at>=0){lastPhase=p.phase;visited[p.phase]=true;}var current=at>=0?at:order.indexOf(lastPhase);
      eyebrow.textContent=p.phase==='done'?'手动搜索已完成':p.phase==='error'?'搜索未完成':p.phase==='cancelled'?'搜索已中断':'手动搜索进行中';statusBox.setAttribute('data-search-phase',p.phase);statusIcon.classList.toggle('is-running',p.running);statusIcon.textContent=p.running?'':p.phase==='done'?'✓':'!';queryCount.hidden=!(p.phase==='search'&&p.total);queryCount.textContent=p.total?'第 '+p.current+' / '+p.total+' 个查询':'';
      for(var key of order){var node=stepNodes[key],index=order.indexOf(key),done=!!visited[key]&&(p.phase==='done'||index<current),active=index===current&&p.running,stopped=index===current&&failed;node.line.className=done?'is-done':active?'is-current':stopped?'is-error':'';if(active)node.line.setAttribute('aria-current','step');else node.line.removeAttribute('aria-current');node.mark.textContent=done?'✓':stopped?'!':p.phase==='done'&&!visited[key]?'—':String(index+1);node.desc.textContent=key==='search'&&p.phase==='search'&&p.total?'正在处理第 '+p.current+' / '+p.total+' 个查询':p.phase==='done'&&!visited[key]?'本次无需执行':node.defaultText;}
    }
    function listen(){if(!offProgress)offProgress=api.subscribeProgress(paint);}
    confirm.addEventListener('click',function(){lastTopic=input.value.trim();confirm.disabled=true;paint({phase:'plan',message:'正在准备手动搜索…',running:true});cancelButton.focus();var task=api.search(lastTopic);listen();task.catch(function(error){if(dialog&&!error.searchCancelled)paint({phase:'error',message:error.message||String(error),running:false});});});
    x.addEventListener('click',close);cancelButton.addEventListener('click',close);dialog.addEventListener('click',function(event){if(event.target===dialog)close();});
    try{dialog.kami.open(returnFocus);if(state.manualRunning)listen();else input.focus();}catch(error){close();env.toast('error','当前浏览器无法打开搜索弹窗，请更新浏览器后重试');}
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
  return {mount:mount,open:open,ping:syncShortcut,dispose:function(){if(disposed)return;close();invalidate('');disposed=true;unregisterShortcut();settingsRoot=null;editor=null;}};
}
