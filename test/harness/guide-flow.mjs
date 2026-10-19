import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {flattenScriptTrees,expandBaseCssJs,expandPresetParse,expandPanelGestures,expandGuideCopy} from '../../build/kami-doc.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
function matches(node,selector){
 if(selector[0]==='#')return node.id===selector.slice(1);
 if(selector[0]==='.')return node.className.split(/\s+/).includes(selector.slice(1));
 const a=/^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
 if(a)return node.hasAttribute(a[1])&&(a[2]===undefined||node.getAttribute(a[1])===a[2]);
 return node.tagName===selector.toUpperCase();
}
function documentMock(){
 const doc={};function el(tag){
  const attrs={},events=new Map(),node={ownerDocument:doc,nodeType:1,tagName:tag.toUpperCase(),children:[],parentNode:null,className:'',id:'',style:{setProperty(k,v){this[k]=v;},removeProperty(k){delete this[k];}},
   appendChild(n){n.parentNode=node;node.children.push(n);return n;},
   removeChild(n){node.children.splice(node.children.indexOf(n),1);n.parentNode=null;return n;},
   setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k]??null;},hasAttribute(k){return k in attrs;},removeAttribute(k){delete attrs[k];},
   addEventListener(k,fn){events.set(k,fn);},removeEventListener(k){events.delete(k);},
   click(){if(!node.disabled)events.get('click')?.({preventDefault(){}});},
   querySelectorAll(selector){const all=[];const walk=n=>{for(const c of n.children){if(matches(c,selector))all.push(c);walk(c);}};walk(node);return all;},
   querySelector(selector){return this.querySelectorAll(selector)[0]??null;}};
  Object.defineProperty(node,'firstChild',{get:()=>node.children[0]??null});
  Object.defineProperty(node,'textContent',{get:()=>node._text??'',set:v=>{node._text=String(v);node.children=[];}});
  node.classList={toggle(name,force){const set=new Set(node.className.split(/\s+/).filter(Boolean));const on=force===undefined?!set.has(name):!!force;if(on)set.add(name);else set.delete(name);node.className=[...set].join(' ');return on;},add(...names){names.forEach(n=>this.toggle(n,true));},remove(...names){names.forEach(n=>this.toggle(n,false));},contains(name){return node.className.split(/\s+/).includes(name);}};
  return node;
 }
 doc.createElement=el;doc.createTextNode=text=>{const n=el('text');n.nodeType=3;n.textContent=text;return n;};
 doc.documentElement=el('html');doc.head=el('head');doc.body=el('body');doc.documentElement.appendChild(doc.head);doc.documentElement.appendChild(doc.body);
 doc.querySelectorAll=s=>doc.documentElement.querySelectorAll(s);doc.querySelector=s=>doc.documentElement.querySelector(s);doc.getElementById=id=>doc.querySelector('#'+id);doc.createEvent=()=>({initEvent(){}});doc.body.appendChild(Object.assign(el('textarea'),{id:'send_textarea'}));return doc;
}

const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;},ok=(a,label)=>{assert.ok(a,label);checks++;};
function page(preset,code,disk,options={}){
 const timers=new Map(),listeners=new Map(),logs=[],notices=[],requests=[],storage=options.storage||new Map();
 let now=0,seq=0,saveId=null,memory=clone(disk.value),writes=0;
 const set=(fn,delay,interval)=>{const id=++seq;timers.set(id,{fn,at:now+delay,interval});return id;};
 const clear=id=>timers.delete(id);
 const advance=ms=>{const end=now+ms;for(;;){let pair;for(const entry of timers)if(entry[1].at<=end&&(!pair||entry[1].at<pair[1].at))pair=entry;if(!pair)break;const [id,t]=pair;now=t.at;if(t.interval)t.at+=t.interval;else timers.delete(id);t.fn();}now=end;};
 const doc=documentMock(),ctx={chatCompletionSettings:{...clone(preset),name:'用户自己改的名字'},getRequestHeaders:()=>({'X-Fixture':'guide'})};
 if(options.notReady)ctx.chatCompletionSettings.prompt_order=[];
 if(options.mountError){const append=doc.body.appendChild;doc.body.appendChild=n=>{if(n.id==='kami-guide-panel')throw Error('mount failed');return append(n);};}
 const localStorage={getItem(k){if(options.localReadError)throw Error('blocked');return storage.get(k)??null;},setItem(k,v){if(options.localWriteError)throw Error('blocked');storage.set(k,v);},removeItem(k){storage.delete(k);}};
 const win={document:doc,AbortController,localStorage,console:{log:(...args)=>logs.push(args.join(' ')),warn:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},
 SillyTavern:{getContext:()=>ctx},toastr:{warning:m=>notices.push(m)},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type)=>listeners.delete(type),dispatchEvent(){},scrollTo(){},
 fetch:async(url,init)=>{requests.push({url,init});if(options.request)return options.request(url,init);return{ok:true,json:async()=>({handle:options.user||'alice'})};}};
 win.window=win;win.self=win;win.parent=win;win.top=win;
 Object.assign(win,{setTimeout:(fn,ms)=>set(fn,ms,0),clearTimeout:clear,setInterval:(fn,ms)=>set(fn,ms,ms),clearInterval:clear,
 getVariables:()=>{if(options.readError)throw Error('read failed');return clone(memory);},
 replaceVariables(value){if(options.writeError)throw Error('write failed');memory=clone(value);writes++;if(saveId)clear(saveId);saveId=set(()=>{disk.value=clone(memory);},1000,0);}});
 class ClockDate extends Date {static now(){return now;}}
 vm.runInNewContext(code,{...win,window:win,Date:ClockDate,Map,Set,URL,TextEncoder,TextDecoder,AbortController},{timeout:1500});
 const api=win.KamiGuide;assert.ok(api,'Guide booted');
 const start=async()=>{advance(300);await tick();advance(1200);await tick();assert.ok(!logs.some(x=>/启动失败/.test(x)),logs.join('\n'));return api.status();};
 const close=()=>{doc.querySelector('[data-kami-confirm="1"]')?.click();doc.querySelector('[aria-label="关闭"]')?.click();assert.equal(api.status().open,false,'User close hides guide');};
 const next=()=>{const button=doc.querySelector('[data-kami-confirm="1"]')||doc.querySelector('[data-kami-finish="1"]')||doc.querySelectorAll('button').find(n=>n.textContent==='下一步');assert.ok(button,'Next action exists');button.click();};
 return {api,doc,start,close,next,advance,logs,notices,requests,storage,timers,listeners,memory:()=>clone(memory),writes:()=>writes,
 refresh(overrides={}){api.shutdown();return page(preset,code,disk,{...options,storage,...overrides});}};
}
const root=path.resolve(import.meta.dirname,'../..');
const preset=JSON.parse(fs.readFileSync(path.join(root,'src/preset.base.json'),'utf8'));
const product=process.argv[2];
let expanded;
if(product){
 const data=JSON.parse(fs.readFileSync(path.resolve(product),'utf8'));
 expanded=flattenScriptTrees(data.extensions.tavern_helper.scripts).find(s=>s.id==='92b51640-4662-4884-8792-7ca22edbe6e9').content;
}else{
 expanded=fs.readFileSync(path.join(root,'src/scripts/50-引导.js'),'utf8');
 expanded=expandBaseCssJs(root,expanded);expanded=expandPresetParse(root,expanded);
 expanded=expandPanelGestures(root,expanded);expanded=expandGuideCopy(root,expanded);
}
function codeFor(name='kami-v0.92-63-20261019'){
 const build=Number(/-(\d+)-\d{8}$/.exec(name)[1]);
 return expanded.replace(/var SELF_NAME = '[^']+';/,"var SELF_NAME = '"+name+"';")
 .replace(/var BUILD_N = parseInt\('[^']+', 10\) \|\| 0;/,"var BUILD_N = parseInt('"+build+"', 10) || 0;");
}
const code=codeFor(),fresh=()=>({value:{}});
{
 const disk=fresh(),p=page(preset,code,disk),state=await p.start();
 eq(state.open,true,'New version is shown automatically');eq(state.shown,true,'Showing records the full version immediately');
 eq(state.confirmed,false,'Showing does not imply disclaimer confirmation');eq(state.completed,false,'Showing does not imply completion');
 eq(state.presetVersion,'v0.92-63','Identity comes from build constant even when user renames preset');
 const again=p.refresh();eq((await again.start()).open,false,'Immediate refresh without closing does not reopen');again.api.shutdown();
}
for(const action of ['close','reload-script','switch-preset']){
 const disk=fresh(),p=page(preset,code,disk);await p.start();if(action==='close')p.close();
 const again=p.refresh();eq((await again.start()).open,false,action+' before debounced disk save does not repeat');again.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk);await p.start();eq(p.requests.length,1,'Only one lightweight account lookup per boot');
 eq(p.requests[0].url,'/api/users/me','Account identity stays on same origin');
 eq(p.requests[0].init.credentials,'same-origin','No credentials sent to third parties');
 eq(p.requests[0].init.redirect,'error','Identity request cannot follow a redirect');
 eq(p.requests[0].init.headers,{'X-Fixture':'guide'},'Reuses host request headers');
 eq(p.memory()['kami-guide'].version,'v0.92-63','Script state also has full version');
 p.doc.querySelector('[data-kami-confirm="1"]').click();
 eq(p.api.status().confirmed,true,'Confirmation recorded separately');eq(p.api.status().completed,false,'Confirmation alone is not completion');
 for(let i=0;i<30&&p.api.status().open;i++)p.next();
 eq(p.api.status().completed,true,'Finish action records completion');eq(p.api.status().open,false,'Finish closes guide');
 p.api.open();eq(p.api.status().open,true,'Manual review remains available after completion');p.api.shutdown();
}
for(const options of [{writeError:true},{readError:true,writeError:true},{localReadError:true,localWriteError:true},{request:async()=>{throw Error('offline');}}]){
 const disk=fresh(),p=page(preset,code,disk,options);await p.start();eq(p.api.status().shown,true,'A failed storage channel does not block guide');
 if(options.localWriteError||options.request)p.advance(1001);
 const again=p.refresh();eq((await again.start()).open,false,'The other storage channel preserves shown state');again.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk,{writeError:true,localWriteError:true});await p.start();
 eq(p.notices.length,1,'Both storage failures produce one useful warning');p.api.close();eq(p.notices.length,1,'Warning is not repeated for every action');p.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk);await p.start();p.close();p.advance(1001);
 p.api.reset();eq(p.api.status().shown,false,'Reset clears current shown status');
 const again=p.refresh();eq((await again.start()).open,true,'Synchronous reset overrides stale already-shown disk data');eq(again.api.status().confirmed,false,'Reset also clears confirmation');
 const resetAgain=again.refresh();eq((await resetAgain.start()).open,false,'Reset permits exactly one fresh auto display');resetAgain.api.shutdown();
}
{
 const disk=fresh(),storage=new Map(),a=page(preset,code,disk,{storage});await a.start();a.advance(1001);a.api.shutdown();
 const newer=page(preset,codeFor('kami-v0.92-64-20261019'),disk,{storage});eq((await newer.start()).open,true,'New build is shown once');newer.advance(1001);newer.api.shutdown();
 const rollback=page(preset,code,disk,{storage});eq((await rollback.start()).open,false,'Returning to already-shown version does not reopen');rollback.api.shutdown();
 const minor=page(preset,codeFor('kami-v0.93-63-20261019'),disk,{storage});eq((await minor.start()).open,true,'Same build number in another major/minor is a different version');minor.api.shutdown();
}
{
 const disk=fresh(),storage=new Map(),a=page(preset,code,disk,{storage});await a.start();a.advance(1001);a.api.shutdown();
 const b=page(preset,code,disk,{storage,user:'bob'});eq((await b.start()).open,true,'A second account does not inherit the first account shown state');
 ok([...storage.keys()].some(k=>k.includes(':bob:')),'Browser record is account scoped');b.api.shutdown();
}
for(const options of [{notReady:true},{mountError:true}]){
 const disk=fresh(),p=page(preset,code,disk,options);await p.start();eq(p.api.status().shown,false,'Failed startup/mount never marks as shown');eq(p.writes(),0,'Failed display does not write seen state');p.api.shutdown();
 const next=page(preset,code,disk,{storage:p.storage});eq((await next.start()).open,true,'Successful retry still shows guide');next.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk);p.api.close();eq(p.writes(),0,'Closing absent panel does not mark it shown');p.api.shutdown();
}
{
 const disk={value:{'kami-guide':{seen:130},otherSetting:{preserve:true}}},p=page(preset,code,disk);eq((await p.start()).open,true,'Historical numeric seen=130 is not mistaken for full-version state');
 eq(p.memory().otherSetting,{preserve:true},'Other script settings survive writes');p.api.shutdown();
}
{
 let resolve;const pending=new Promise(r=>resolve=r),p=page(preset,code,fresh(),{request:()=>pending});
 p.advance(300);await tick();p.api.open();eq(p.api.status().shown,true,'Manual opening is remembered while account request is pending');
 resolve({ok:true,json:async()=>({handle:'alice'})});await tick();p.advance(1200);await tick();
 eq(p.api.status().autoOpened,false,'Pending automatic display is suppressed by manual review');
 ok(p.storage.size>0,'Delayed account resolution backs up the latest manual display');p.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk,{request:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true}))});
 p.advance(300);await tick();p.api.shutdown();await tick();
 eq(p.requests[0].init.signal.aborted,true,'Shutdown cancels pending identity request');
 eq(p.timers.size,0,'Shutdown releases intervals and timers before any display');eq(p.api.status().open,false,'Late identity callback cannot open a panel');
}
{
 const disk=fresh(),storage=new Map(),a=page(preset,code,disk,{storage}),b=page(preset,code,disk,{storage});
 a.advance(300);b.advance(300);await tick();a.advance(1200);b.advance(1200);await tick();
 eq(Number(a.api.status().open)+Number(b.api.status().open),1,'Two script instances share a final check before automatically showing');
 a.api.shutdown();b.api.shutdown();
}

{
 const value=(shown,updatedAt)=>({schema:2,version:'v0.92-63',account:'alice',shown,confirmed:false,completed:false,updatedAt});
 const key='kami-guide-v2:alice:v0.92-63',storage=new Map([[key,JSON.stringify(value(false,100))]]);
 const disk={value:{'kami-guide':value(true,200)}},p=page(preset,code,disk,{storage,localWriteError:true});
 eq((await p.start()).open,false,'Stale local reset cannot override newer successfully saved script state');
 const again=p.refresh();eq((await again.start()).open,false,'A temporarily unwritable local store cannot cause repeated auto display');again.api.shutdown();
}
{
 const value=(shown,updatedAt)=>({schema:2,version:'v0.92-63',account:'alice',shown,confirmed:false,completed:false,updatedAt});
 const key='kami-guide-v2:alice:v0.92-63',storage=new Map([[key,JSON.stringify(value(true,100))]]);
 const disk={value:{'kami-guide':value(false,200)}},p=page(preset,code,disk,{storage,localWriteError:true});
 eq((await p.start()).open,true,'Newer server reset wins over an older local shown marker');p.api.shutdown();
}
{
 let resolve;const key='kami-guide-v2:alice:v0.92-63',old={version:'v0.92-63',account:'alice',shown:true,confirmed:true,completed:true,updatedAt:100000};
 const storage=new Map([[key,JSON.stringify(old)]]),disk={value:{'kami-guide':{...old,updatedAt:200}}};
 const p=page(preset,code,disk,{storage,request:()=>new Promise(r=>resolve=r)});
 p.advance(300);await tick();p.api.reset();resolve({ok:true,json:async()=>({handle:'alice'})});await tick();
 eq(p.api.status().shown,false,'A pending identity lookup cannot overwrite a just-requested reset');
 ok(JSON.parse(storage.get(key)).updatedAt>100000,'Pending user action rebases against late local revision');p.api.shutdown();
 const next=page(preset,code,disk,{storage});eq((await next.start()).open,true,'The rebased reset survives immediate reload');next.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk,{request:async()=>({ok:true,json:async()=>({})})});
 await p.start();eq(p.storage.size,0,'Unknown account never uses a shared anonymous local key');p.advance(1001);
 const again=p.refresh();eq((await again.start()).open,false,'Invalid identity falls back to saved script state');again.api.shutdown();
}
{
 const disk=fresh(),p=page(preset,code,disk,{request:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}))});
 p.advance(300);await tick();p.advance(5000);await tick();p.advance(1200);await tick();
 eq(p.requests[0].init.signal.aborted,true,'Account lookup has a bounded timeout');eq(p.api.status().open,true,'Account timeout still allows the guide using script persistence');p.api.shutdown();
}
{
 const disk={value:{'kami-guide':{version:'v0.92-63',account:'alice',shown:true,updatedAt:200}}},key='kami-guide-v2:alice:v0.92-63';
 const p=page(preset,code,disk,{storage:new Map([[key,'broken-json']])});
 eq((await p.start()).open,false,'Corrupt local data does not erase a valid script record');
 eq(JSON.parse(p.storage.get(key)).shown,true,'Valid script data repairs the corrupt local backup');p.api.shutdown();
}
{
 const p=page(preset,codeFor('kami-v0.92-130-20261019'),{value:{'kami-guide':{seen:130}}});
 eq((await p.start()).open,true,'Historical packaged 130 cannot suppress the actual build 130');p.api.shutdown();
}
{
 const development=expanded.replace(/var SELF_NAME = '[^']+';/,"var SELF_NAME = '@@KAMI_PRESET_NAME@@';")
 .replace(/var BUILD_N = parseInt\('[^']+', 10\) \|\| 0;/,"var BUILD_N = parseInt('@@KAMI_BUILD_N@@', 10) || 0;");
 const p=page(preset,development,fresh());eq((await p.start()).open,false,'Unbuilt preview never auto-opens or touches published version state');
 eq(p.requests.length,0,'Unbuilt preview needs no account request');p.api.shutdown();
}


{
 const disk={value:{'kami-guide':{version:'v0.92-63',account:'alice',shown:true,confirmed:true,completed:true,updatedAt:200}}};
 const p=page(preset,code,disk,{user:'bob',request:async()=>{throw Error('identity unavailable');}});
 eq((await p.start()).open,true,'Unknown identity cannot borrow a previously verified account marker');
 eq(p.storage.size,0,'Identity failure never creates an anonymous browser record');
 p.advance(1001);const same=p.refresh();eq((await same.start()).open,false,'Current script scope still prevents repeated displays during an identity outage');same.api.shutdown();
}


{
 const p=page(preset,code,fresh());await p.start();
 const dots=p.doc.querySelectorAll('[data-kami-dot]');dots[dots.length-1].click();
 p.doc.querySelector('[data-kami-finish="1"]').click();
 eq(p.api.status().completed,true,'Finish records actual completion even when navigation skips a page');
 eq(p.api.status().confirmed,false,'Finishing never fabricates an explicit disclaimer confirmation');p.api.shutdown();
}


{
 const key='kami-guide-v2:alice:v0.92-63',record={version:'v0.92-63',account:'alice',shown:true,confirmed:false,completed:false,updatedAt:100000};
 const storage=new Map([[key,JSON.stringify(record)]]),disk={value:{'kami-guide':{...record,updatedAt:200}}},options={storage};
 const p=page(preset,code,disk,options);eq((await p.start()).open,false,'Future stored revision is read without repeating guide');
 options.localReadError=true;options.localWriteError=true;p.api.reset();p.advance(1001);
 const next=p.refresh({localReadError:false,localWriteError:false});eq((await next.start()).open,true,'Reset stays newer even after clock rollback and temporary local storage failure');next.api.shutdown();
}

const meta=JSON.parse(fs.readFileSync(path.join(root,'src/scripts/meta.json'),'utf8')).find(s=>s.file==='50-引导.js');
eq(meta.data,{},'Fresh distribution has no historical user record');eq(meta.export_with.data,false,'Helper export omits personal shown state');
console.log('✓ Guide lifecycle: '+checks+' passed ('+(product?'built artifact':'source')+')');
