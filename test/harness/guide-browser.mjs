// End-to-end skin checks against the real local preview scripts and message frames.
// Run test/harness/server.mjs first. Uses an isolated Chrome profile, never live ST.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin=process.env.KAMI_PREVIEW_ORIGIN||'http://127.0.0.1:8790';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Use a local preview harness');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),profile=fs.mkdtempSync(path.join(os.tmpdir(),'kami-ui-browser-'));
const chrome=spawn(process.env.KAMI_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--single-process','--in-process-gpu','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-extensions','--disable-background-networking','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,count=0;const evidence=[];const errors=[];
const check=(ok,msg)=>{assert.ok(ok,msg);count++;};
function contrast(fg,bg){
 const lum=css=>css.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const a=lum(fg),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
try{
 let port;for(let i=0;i<100&&!port;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(!port)await pause(100);}
 if(!port)throw Error('Chrome did not start');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve);ws.addEventListener('error',reject);});
 let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const mid=++id;const timer=setTimeout(()=>{pending.delete(mid);reject(Error('CDP timeout: '+method));},20000);pending.set(mid,{resolve,reject,timer});ws.send(JSON.stringify({id:mid,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});



 for(const width of [1440,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const user='guide-alice-'+width,url=origin+'/test/harness/guide-lifecycle.html?user='+user;
  async function navigate(target){
   await send('Page.navigate',{url:target});
   for(let i=0;i<100;i++){if(await ev('!!window.__guideLoaded'))break;await pause(50);}
   check(await ev('!!window.__guideLoaded'),'Guide fixture boots');
  }
  async function settle(){await pause(1800);return ev('KamiGuide.status()');}
  await navigate(url);let state=await settle();
  check(state.open&&state.shown&&!state.confirmed&&!state.completed,'Automatic showing is saved before confirmation at '+width);
  const key=await ev("Object.keys(localStorage).find(key=>key.startsWith('kami-guide-v2:')&&key.includes("+JSON.stringify(user)+"))");
  check(!!key,'Account-scoped browser backup exists');
  /* Refresh immediately after displaying; fixture has no persistent script data at all. */
  await send('Page.reload');for(let i=0;i<100;i++){if(await ev('!!window.__guideLoaded'))break;await pause(50);}
  state=await settle();check(!state.open&&state.shown,'Real page reload without close does not repeat at '+width);
  const manual=await ev("(()=>{KamiGuide.open();const opened=KamiGuide.status().open;document.querySelector('[data-kami-confirm=\"1\"]').click();document.querySelector('#kami-guide-panel [aria-label=\"关闭\"]').click();return{opened,closed:!KamiGuide.status().open,confirmed:KamiGuide.status().confirmed};})()");
  check(manual.opened&&manual.closed&&manual.confirmed,'Manual review, confirmation and close still work');
  await send('Page.reload');for(let i=0;i<100;i++){if(await ev('!!window.__guideLoaded'))break;await pause(50);}
  state=await settle();check(!state.open,'Close followed by real page reload does not repeat');
  await ev('KamiGuide.reset()');await send('Page.reload');
  for(let i=0;i<100;i++){if(await ev('!!window.__guideLoaded'))break;await pause(50);}
  state=await settle();check(state.open&&!state.confirmed,'Reset survives immediate reload and permits a fresh display');
  await ev('__guideFixture.reboot()');state=await settle();check(!state.open,'Same-page iframe/script reboot does not repeat');
  await navigate(origin+'/test/harness/guide-lifecycle.html?user=guide-bob-'+width);state=await settle();check(state.open,'A second account sees its own first guide');
  await navigate(url);state=await settle();check(!state.open,'Original account keeps its own shown marker');
  await navigate(url+'&version=0.93-63');state=await settle();check(state.open,'A different minor version with the same build still shows');
  await navigate(url);state=await settle();check(!state.open,'Returning to an already-seen version does not repeat');
  const cleanup=await ev("(()=>{const api=KamiGuide;api.shutdown();return !window.KamiGuide&&!document.querySelector('#kami-guide-panel')})()");
  check(cleanup,'Guide unload removes API and panel');evidence.push({width,checks:'reload, close, reset, iframe reboot, account and version isolation'});
 }
 check(errors.length===0,'No runtime exceptions: '+errors.join(' | '));
 fs.mkdirSync(path.resolve('.audit'),{recursive:true});fs.writeFileSync(path.resolve('.audit/guide-browser.json'),JSON.stringify({checks:count,evidence,errors},null,2));
 console.log('✓ Guide lifecycle browser integration: '+count+' passed (real page reload, mocked user identity)');
}finally{
 if(ws)ws.close();const done=new Promise(r=>chrome.once('exit',r));chrome.kill();await Promise.race([done,pause(1500)]);
 const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('kami-ui-browser-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}}
}
