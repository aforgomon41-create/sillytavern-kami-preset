import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scriptUpgradeCatalog} from '../../build/kami-doc.mjs';
import {groupScriptTrees,flattenScriptTrees,mergeScriptTrees} from '../../src/scripts/_script-tree.js';
import {planKamiScriptUpgrade,runKamiScriptUpgrade,resetKamiScriptRuntime} from '../../src/scripts/_script-upgrade.js';
import {snapshotCompletionPreset} from '../../src/scripts/_preset-snapshot.js';
const clone=x=>JSON.parse(JSON.stringify(x)),catalog=scriptUpgradeCatalog(process.cwd());
catalog.build='kami-v0.92-72-20261019';
const meta=JSON.parse(fs.readFileSync('src/scripts/meta.json','utf8'));
const fresh=groupScriptTrees(meta.map(x=>({type:'script',id:x.id,name:x.name,enabled:x.enabled!==false,data:{},content:'NEW '+x.file})),catalog.groups);
const old=flattenScriptTrees(fresh).map(x=>({...clone(x),id:Object.keys(catalog.aliases).find(id=>catalog.aliases[id]===x.id)||x.id,data:{user:x.name,budget:4321},content:'OLD '+x.name}));
const mixed=()=>clone(old).concat(clone(fresh),[{type:'script',id:'custom',name:'🧰 工具箱 v1.0',enabled:true,data:{custom:1},content:'CUSTOM'}]);
let checks=0;
const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
const tick=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(options={}){
 const name='kami-v0.92-72-20261019',nameB='另一个预设',scope={};
 scope[name]=options.trees?clone(options.trees):mixed();scope[nameB]=[{type:'script',id:'B',enabled:true,data:{B:1},content:'B'}];
 let disposeHook=null;
 let selected=name,live={temperature:.7,extensions:{other:{keep:1},tavern_helper:{scripts:clone(scope[name]),variables:{keep:'preset'}}}},alive=true;
 const cache=[clone(live),{temperature:.8,extensions:{tavern_helper:{scripts:clone(scope[nameB])}}}],names={[name]:0,[nameB]:1},files=new Map([[name,clone(cache[0])],[nameB,clone(cache[1])]]);
 const variables={[name]:{keep:'preset'},[nameB]:{B:1}},calls=[],applies=[],events=[],host={};
 const pm={getSelectedPresetName:()=>selected,getPresetList:()=>({presets:cache,preset_names:names}),
 async savePreset(target,raw,opts){eq(opts,{skipUpdate:true},'保存不切预设');calls.push({target,raw:clone(raw)});events.push('save-start:'+target);if(options.save)await options.save(target,raw,calls.length,state);files.set(target,clone(raw));events.push('save-done:'+target);}};
 const env={host,catalog,merge:mergeScriptTrees,snapshot:snapshotCompletionPreset,id:()=>options.id||catalog.carrier,alive:()=>alive,onDispose:fn=>{disposeHook=fn;},
 context:()=>({chatCompletionSettings:live,getPresetManager:()=>pm}),
 trees:({type})=>type==='preset'?clone(scope[selected]):clone(type==='global'?options.global||[]:options.character||[]),
 variables:()=>clone(variables[selected]),
 beforeApply(){events.push('before-apply');if(options.beforeApply)options.beforeApply(state);},
 replaceTrees(trees,opts){eq(opts,{type:'preset'});if(options.applyError)throw Error('apply denied');applies.push({name:selected,trees:clone(trees)});events.push('apply');scope[selected]=clone(trees);},
 async wait(){events.push('yield');if(options.wait)await options.wait(state);}};
 const state={env,calls,applies,events,host,files,cache,variables,scope,name,nameB,
  trees:()=>scope[selected],live:()=>live,selected:()=>selected,stop:()=>{alive=false;if(disposeHook)disposeHook();},
  switch(){selected=nameB;live=clone(cache[1]);},replaceCache(){cache[0]={...clone(cache[0]),temperature:1.9};}};
 return state;
}
{
 const plan=planKamiScriptUpgrade(mixed(),catalog,mergeScriptTrees),rows=flattenScriptTrees(plan.trees);
 /* 2026-10-26：原先写死 14/14/13。加了「🧩 运行库」脚本后 meta 多一条，
    再把数量写死就每次加脚本都要来改。改成按 meta.json 推导 ——
    断言意图不变（合并不丢行、不重复、去重数等于脚本数），但不再脆。
    mixed() 里额外塞了一条 id='custom'，所以行数要 +1。 */
 eq(rows.length,meta.length+1);eq(new Set(rows.map(x=>x.id)).size,meta.length+1);eq(plan.deduplicated,meta.length);
 eq(plan.trees.filter(x=>x.type!=='folder').map(x=>x.id),['custom']);
 for(const leaf of rows.filter(x=>x.id!=='custom')){eq(leaf.data.budget,4321);eq(leaf.content.startsWith('NEW'),true);}
 eq(rows.find(x=>x.id==='custom').content,'CUSTOM');
 eq(planKamiScriptUpgrade(fresh,catalog,mergeScriptTrees),null);
 const alias=catalog.aliases,legacy=Object.keys(alias)[0],current=alias[legacy];
 const one=mergeScriptTrees([{id:legacy,enabled:false,data:{keep:7},content:'OLD'}],[{id:current,enabled:true,data:{},content:'NEW'}],alias);
 eq(one.list[0],{id:current,enabled:false,data:{keep:7},content:'NEW'});
 eq(mergeScriptTrees([{id:legacy}],[{id:legacy}],alias).list[0].id,legacy,'更新旧产物时不强行换ID');
}
{
 const f=fixture(),state=await runKamiScriptUpgrade(f.env);
 eq(state.repaired,true);eq(state.boot,true);eq(f.calls.length,2);eq(f.applies.length,1);
 /* 合并后：meta 每条一行 + mixed() 里那条 custom（同样按 meta 推导，加脚本不误报） */
 eq(flattenScriptTrees(f.files.get(f.name).extensions.tavern_helper.scripts).length,meta.length+1);
 /* 备份里是「旧全量 + 新全量 + custom」，所以是 meta×2 + 1 */
 eq(flattenScriptTrees(f.files.get(f.name+' · 自动整理前备份').extensions.tavern_helper.scripts).length,meta.length*2+1);
 eq(f.files.get(f.name).temperature,.7);eq(f.files.get(f.name).extensions.other,{keep:1});eq(f.files.get(f.name).extensions.tavern_helper.variables,{keep:'preset'});
 eq(f.events.indexOf('save-done:'+f.name)<f.events.indexOf('apply'),true,'收到持久化成功回执后才替换内存');
 eq(f.events.indexOf('save-done:'+f.name)<f.events.indexOf('before-apply'),true,'保存成功后才清理旧实例');
 eq(f.events.indexOf('before-apply')<f.events.indexOf('apply'),true,'移除旧iframe前已收回旧心跳和事件');
 eq(f.events.includes('yield'),true,'替换后让旧iframe先卸载');
 eq(f.host.__kamiScriptUpgrade.phase,'done');eq(f.host.__kamiScriptUpgrade.promise,null);
 await runKamiScriptUpgrade(f.env);eq(f.calls.length,2,'整理完成后重启不重复写盘');
}
{
 const f=fixture({trees:fresh});eq(await runKamiScriptUpgrade(f.env),{boot:true});eq(f.calls.length,0);eq(f.applies.length,0,'健康配置不写盘');
}
for(const kind of ['global','character']){
 const f=fixture({[kind]:[{id:catalog.carrier}]});eq((await runKamiScriptUpgrade(f.env)).skipped,'非唯一的预设脚本作用域');eq(f.calls.length,0);
}
{
 const f=fixture({id:'some-other-id'});eq(await runKamiScriptUpgrade(f.env),{boot:true});eq(f.calls.length,0);
}
for(const failAt of [1,2]){
 const f=fixture({save:async(_n,_r,i)=>{if(i===failAt)throw Error('offline');}}),before=JSON.stringify(f.trees());
 await assert.rejects(runKamiScriptUpgrade(f.env),/offline/);checks++;
 eq(JSON.stringify(f.trees()),before);eq(f.applies.length,0);eq(f.host.__kamiScriptUpgrade.phase,'error');
}
for(const kind of ['hub','folder'])for(const failAt of [1,2]){
 const trees=mixed(),legacy=Object.keys(catalog.aliases)[0];
 if(kind==='hub')trees.find(x=>x.id===legacy).enabled=false;
 else trees.find(x=>x.type==='folder').enabled=false;
 const f=fixture({trees,save:async(_n,_r,i)=>{if(i===failAt)throw Error('offline');}}),before=clone(f.trees());
 await assert.rejects(runKamiScriptUpgrade(f.env),error=>error.message==='offline'&&error.kamiUpgradeBoot===false);checks++;
 eq(f.trees(),before);eq(f.applies.length,0,'保存失败也不启用用户已关闭的入口');
}
{
 const gate=deferred(),f=fixture({save:async(_n,_r,i)=>{if(i===2)await gate.promise;}});
 const promise=runKamiScriptUpgrade(f.env);await tick();eq(f.applies.length,0);eq(flattenScriptTrees(f.trees()).length,meta.length*2+1,'未收到回执时原树完整保留');
 gate.resolve();await promise;eq(f.applies.length,1);
}
{
 const gate=deferred(),f=fixture({save:async(_n,_r,i)=>{if(i===2)await gate.promise;}});
 const promise=runKamiScriptUpgrade(f.env);await tick();
 f.trees()[0].data.budget=9999;f.live().temperature=1.2;f.live().extensions.other.newValue='latest';f.variables[f.name].newValue='latest';
 gate.resolve();const state=await promise;eq(state.repaired,true);eq(f.calls.length,3,'保存期间有修改时重读并重新保存');
 const saved=f.files.get(f.name);eq(saved.temperature,1.2);eq(saved.extensions.other.newValue,'latest');eq(saved.extensions.tavern_helper.variables.newValue,'latest');
 const id=old[0].id,logical=catalog.aliases[id]||id;eq(flattenScriptTrees(saved.extensions.tavern_helper.scripts).find(x=>x.id===logical).data.budget,9999);
}
for(const switchAt of [1,2]){
 const f=fixture({save:async(_n,_r,i,state)=>{if(i===switchAt)state.switch();}});
 const state=await runKamiScriptUpgrade(f.env);eq(state.cancelled,true);eq(state.boot,false);eq(f.applies.length,0);
 eq(f.selected(),f.nameB);eq(f.trees()[0].id,'B');eq(f.files.get(f.nameB).temperature,.8,'从不写另一个预设');
}
{
 const f=fixture({wait:async state=>state.switch()});const state=await runKamiScriptUpgrade(f.env);eq(state.boot,false);eq(state.cancelled,true,'旧iframe不能在切换后继续启动hub');
}
{
 const f=fixture({applyError:true}),before=clone(f.files.get(f.name));
 await assert.rejects(runKamiScriptUpgrade(f.env),/apply denied/);checks++;
 eq(f.files.get(f.name),before);eq(f.applies.length,0,'替换失败恢复文件和内存');
}
{
 const trees=mixed(),legacy=Object.keys(catalog.aliases)[0];trees.find(x=>x.id===legacy).enabled=false;
 const f=fixture({trees}),state=await runKamiScriptUpgrade(f.env);
 eq(state.repaired,true);eq(state.boot,false,'沿用用户关闭按钮中转站的状态');
 eq(flattenScriptTrees(f.files.get(f.name).extensions.tavern_helper.scripts).find(x=>x.id===catalog.carrier).enabled,false);
}
{
 const gate=deferred(),f=fixture({save:async(_n,_r,i)=>{if(i===1)await gate.promise;}});
 const p1=runKamiScriptUpgrade(f.env);await tick();const p2=runKamiScriptUpgrade(f.env);await tick();eq(f.calls.length,1,'重复实例共享一次维护');
 gate.resolve();await Promise.all([p1,p2]);eq(f.calls.length,2);eq(f.applies.length,1);
}
{
 const trees=mixed();trees.push({id:'custom',content:'different custom'});
 assert.throws(()=>planKamiScriptUpgrade(trees,catalog,mergeScriptTrees),/用户脚本ID冲突/);checks++;
}

{
 const trees=clone(fresh),oldFolderId=Object.keys(catalog.folder_aliases)[0],baseId=catalog.folder_aliases[oldFolderId],legacy=Object.keys(catalog.aliases)[0];
 const legacyHub=clone(old.find(x=>x.id===legacy)); legacyHub.enabled=false;
 trees.push({type:'folder',id:oldFolderId,name:'我的基础分类',enabled:false,icon:'user-icon',color:'user-color',scripts:[legacyHub]});
 const f=fixture({trees}),state=await runKamiScriptUpgrade(f.env),base=f.trees().find(x=>x.id===baseId);
 eq(state.repaired,true);eq(state.boot,false);eq(f.trees().length,3);eq(base.enabled,false);eq(base.name,'我的基础分类');eq(base.icon,'user-icon');eq(base.color,'user-color');
 eq(base.scripts.find(x=>x.id===catalog.carrier).data,legacyHub.data,'新记录排前面时仍继承旧标识记录的数据');
 eq(base.scripts.find(x=>x.id===catalog.carrier).enabled,false);
}
for(const kind of ['global','character']){
 const legacy=Object.keys(catalog.aliases)[0],f=fixture({[kind]:[{id:legacy}]});
 eq((await runKamiScriptUpgrade(f.env)).skipped,'非唯一的预设脚本作用域');eq(f.calls.length,0,'不接管其他作用域的旧中转站');
}
for(const kind of ['global','character']){
 const id=catalog.groups[0].script_ids.find(id=>id!==catalog.carrier),f=fixture({[kind]:[{id}]});
 eq((await runKamiScriptUpgrade(f.env)).skipped,'非唯一的预设脚本作用域');eq(f.calls.length,0,'其他官方ID跨作用域冲突也不重建');
}
{
 const f=fixture({applyError:true,save:async(_n,_r,i)=>{if(i===3)throw Error('rollback offline');}});
 await assert.rejects(runKamiScriptUpgrade(f.env),/规范脚本已保存.*恢复保存未完成/);checks++;
 eq(f.files.has(f.name+' · 自动整理前备份'),true);eq(f.applies.length,0);
}
{
 const f=fixture({wait:async state=>state.stop()}),result=await runKamiScriptUpgrade(f.env);
 eq(result.boot,false);eq(result.cancelled,true);eq(f.host.__kamiScriptUpgrade,undefined,'iframe卸载不把完整快照挂在宿主');
 eq(flattenScriptTrees(f.files.get(f.name).extensions.tavern_helper.scripts).length,meta.length+1,'卸载前已有持久化回执');
}
{
 const gate=deferred(),f=fixture({save:async(_n,_r,i)=>{if(i===1)await gate.promise;}});
 const pending=runKamiScriptUpgrade(f.env);await tick();f.stop();eq(f.host.__kamiScriptUpgrade,undefined);
 gate.resolve();eq((await pending).cancelled,true);eq(f.applies.length,0,'备份时被关闭便停止改写');
}
function runtimeFixture(){
 let trees=clone(fresh),selected='A',cleared=false,applies=0,global=[],frames=[],timers=[],files=new Map();
 trees.push({id:'custom',enabled:true,data:{custom:1}});
 const row={},settings={},pm={getSelectedPresetName:()=>selected,getPresetList:()=>({presets:[row,{}],preset_names:{A:0,B:1}}),savePreset(name,raw){files.set(name,clone(raw));}};
 const save=pm.savePreset;
 const host={Function,console,Event:class{constructor(type){this.type=type;}},
   SillyTavern:{getContext:()=>({chatCompletionSettings:settings,getPresetManager:()=>pm})},
   TavernHelper:{getScriptTrees:({type})=>clone(type==='preset'?trees:type==='global'?global:[]),replaceScriptTrees(next){applies++;trees=clone(next);}},
   document:{querySelectorAll:()=>frames},setTimeout:(fn,delay)=>{timers.push({fn,delay,done:false});return timers.length;},clearTimeout:id=>{timers[id-1].done=true;cleared=true;}};
 const frame=id=>({id:'TH-script--测试--'+id,removed:false,contentWindow:{dispatchEvent:()=>{}},remove(){this.removed=true;}});
 const run=delay=>{const task=timers.find(x=>x.delay===delay&&!x.done);assert.ok(task,'有待执行的宿主定时任务');task.done=true;task.fn();};
 const f={host,trees:()=>trees,applies:()=>applies,frames,files,pm,save,clear:()=>cleared,run:()=>run(0),cleanup:()=>run(3000),switch:()=>{selected='B';},block:id=>global.push({id}),frame};
 return f;
}
{
 /* 2026-10-26：原先写死 script_ids[1]。加了「🧩 运行库」后索引整体后移，
    [1] 恰好变成 carrier 自己，测试语义就变了。改成显式排除 carrier ——
    断言意图不变：挑一个**别的**官方脚本做「另一作用域冲突」的样本。 */
 /* 2026-10-26：原先写死 scripts[0] / scripts[1] / script_ids[1]。
     加了「🧩 运行库」后数组整体后移，scripts[1] 变成了 carrier（脚本按钮）本身，
     把 carrier 当成「用户关掉的脚本」会让暂停/恢复走出预期分支。
     这里改成**按语义挑**，不再依赖任何下标：
       · id      = carrier（官方脚本的载体）
       · others  = 基础与外观里除 carrier 外的官方脚本
       · onIdx   = 保持启用的那条（验证恢复后 enabled=true 且 data 更新保留）
       · offIdx  = 预先关掉的那条（验证恢复不擅自打开）
       · other   = 拿来做「另一作用域冲突」的样本（取最后一条，避免和上面两条撞） */
 const f=runtimeFixture(),id=catalog.carrier;
 const next=clone(f.trees());
 const g0=next[0].scripts.map(x=>x.id);
 const others=g0.filter(x=>x!==id);
 const other=others[others.length-1];
 const onIdx=g0.indexOf(others[0]),offIdx=g0.indexOf(others[1]);
 next[0].scripts[offIdx].enabled=false;
 const a=f.frame(id),b=f.frame(id),custom=f.frame('custom');
 f.block(other);const blocked=f.frame(other);f.frames.push(a,b,blocked,custom);
 resetKamiScriptRuntime(f.host,next,catalog);
 eq(flattenScriptTrees(f.trees()).filter(x=>x.id!=='custom').every(x=>x.enabled===false),true,'先退出所有官方实例，避免Vue重复key残留');
 eq(f.trees().find(x=>x.id==='custom').enabled,true,'不暂停用户自建脚本');eq(a.removed,true,'切换/改名前已清孤立iframe');
 f.trees()[0].scripts[onIdx].data={latest:1};f.trees().push({id:'custom-new',enabled:true});f.run();
 eq(f.trees()[0].scripts[onIdx].enabled,true);eq(f.trees()[0].scripts[offIdx].enabled,false);eq(f.trees()[0].scripts[onIdx].data,{latest:1},'恢复开关不覆盖暂停期间最新data');
  eq(f.trees().some(x=>x.id==='custom-new'),true);eq(a.removed,true);eq(b.removed,true);eq(blocked.removed,false,'不移除另一作用域的冲突实例');eq(custom.removed,false);
 eq(f.applies(),2);
 eq(flattenScriptTrees(f.trees()).every(x=>!String(x.info).includes('[kami-runtime-pause:')),true,'恢复后不残留临时标记');
 f.cleanup();eq(f.pm.savePreset,f.save,'临时保存保护及时撤下');
}
{
 const f=runtimeFixture(),original=clone(f.trees());resetKamiScriptRuntime(f.host,f.trees(),catalog);
 const paused=clone(f.trees());f.switch();f.run();eq(f.applies(),1,'宿主恢复回调也检查当前预设身份');
 f.pm.savePreset('A',{extensions:{tavern_helper:{scripts:paused}}});
 const persisted=flattenScriptTrees(f.files.get('A').extensions.tavern_helper.scripts),wanted=flattenScriptTrees(original);
 eq(persisted.map(x=>[x.id,x.enabled]),wanted.map(x=>[x.id,x.enabled]),'已切预设时，旧预设的延迟保存也保留原开关');
 eq(persisted.every(x=>!String(x.info).includes('[kami-runtime-pause:')),true,'暂停标记不会写进旧预设文件');
 f.cleanup();eq(f.pm.savePreset,f.save);
}
{
 const f=runtimeFixture();f.host.Function=()=>{throw Error('CSP denied');};
 assert.throws(()=>resetKamiScriptRuntime(f.host,f.trees(),catalog),/CSP denied/);checks++;eq(f.applies(),0,'无法创建独立恢复任务时绝不暂停入口');
}
{
 const f=runtimeFixture();f.host.TavernHelper.replaceScriptTrees=()=>{throw Error('replace failed');};
 assert.throws(()=>resetKamiScriptRuntime(f.host,f.trees(),catalog),/replace failed/);checks++;eq(f.clear(),true,'暂停失败便撤销恢复任务');
 eq(f.pm.savePreset,f.save,'暂停失败同步撤下保存保护');
}
{
 const f=runtimeFixture();resetKamiScriptRuntime(f.host,f.trees(),catalog);
 const paused=clone(f.trees()),changed=clone(paused);changed[0].scripts[0].info='用户新写的说明';changed[0].scripts[0].enabled=true;
 const ordinary=clone(fresh);ordinary[0].scripts[0].enabled=false;
 f.pm.savePreset('B',{extensions:{tavern_helper:{scripts:ordinary}}});
 eq(f.files.get('B').extensions.tavern_helper.scripts,ordinary,'不干预另一预设的正常保存');
 f.pm.savePreset('B',{extensions:{tavern_helper:{scripts:[null,{type:'folder',scripts:null}]}}});
 eq(f.files.get('B').extensions.tavern_helper.scripts,[null,{type:'folder',scripts:null}],'不阻止其他调用方保存自己的不规范数据');
 f.pm.savePreset('A-rename',{extensions:{tavern_helper:{scripts:clone(paused)}}});
 eq(flattenScriptTrees(f.files.get('A-rename').extensions.tavern_helper.scripts).find(x=>x.id===catalog.carrier).enabled,true,'复制/改名也不持久化临时关闭状态');
 eq(flattenScriptTrees(f.files.get('A-rename').extensions.tavern_helper.scripts).some(x=>String(x.info).includes('[kami-runtime-pause:')),false);
 f.pm.savePreset('A',{extensions:{tavern_helper:{scripts:changed}}});
 eq(f.files.get('A').extensions.tavern_helper.scripts[0].scripts[0].info,'用户新写的说明','仅精确事务标记触发清理');
 f.run();f.cleanup();
 const normal=clone(f.trees());normal[0].scripts[0].enabled=false;
 f.pm.savePreset('A',{extensions:{tavern_helper:{scripts:normal}}});
 eq(f.files.get('A').extensions.tavern_helper.scripts[0].scripts[0].enabled,false,'保护移除后不修改用户正常保存的开关');
}
{
 const f=runtimeFixture();resetKamiScriptRuntime(f.host,f.trees(),catalog);
 const apply=f.host.TavernHelper.replaceScriptTrees;let fail=true;
 f.host.TavernHelper.replaceScriptTrees=function(trees,options){if(fail){fail=false;throw Error('temporary');}return apply(trees,options);};
 f.run();eq(f.applies(),1);f.run();eq(f.applies(),2,'宿主恢复临时失败可重试');
 eq(f.trees()[0].scripts[0].enabled,true);f.cleanup();
}
{
 const f=runtimeFixture(),id=catalog.carrier;resetKamiScriptRuntime(f.host,f.trees(),catalog);
 const paused=clone(f.trees());f.block(id);
 const apply=f.host.TavernHelper.replaceScriptTrees;let fail=true;
 f.host.TavernHelper.replaceScriptTrees=function(trees,options){if(fail){fail=false;throw Error('temporary');}return apply(trees,options);};
 f.run();f.pm.savePreset('A',{extensions:{tavern_helper:{scripts:paused}}});
 eq(flattenScriptTrees(f.files.get('A').extensions.tavern_helper.scripts).find(x=>x.id===id).enabled,false,'恢复与延迟保存都尊重新出现的跨作用域冲突');
 f.run();f.cleanup();
}
{
 const f=fixture();f.live().temp_openai=.37;
 await runKamiScriptUpgrade(f.env);
 const saved=f.files.get(f.name);
 eq(saved.temperature,.37,'脚本整理按真实预设字段保存最新温度，不取旧缓存值');
 eq(Object.prototype.hasOwnProperty.call(saved,'temp_openai'),false,'落盘不遗留酒馆内部温度字段');
}
console.log('无感脚本升级、持久化与并发边界：'+checks+' 项通过');
