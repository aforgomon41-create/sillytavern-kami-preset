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


 const built=process.argv.includes('--built'),baseline=process.argv.includes('--baseline');
 await send('Page.navigate',{url:origin+'/test/harness/preview.html?skin=grokbot&tab=skin&nowrap=1&nostatus=1&clean=1'+(built?'&built=1':'')});
 for(let i=0;i<150;i++){if(await ev('!!(window.KamiSkin&&window.KamiPreset&&window.KamiToolbox)'))break;await pause(60);}
 check(await ev('!!(window.KamiSkin&&window.KamiPreset&&window.KamiToolbox)'),'Real panels boot');
 await ev("import('/test/harness/tab-layout-checks.mjs').then(m=>window.inspectTabStrip=m.inspectTabStrip)");
 const ids=baseline?['grokbot']:await ev("fetch('/skin-pack').then(r=>r.json()).then(a=>a.map(s=>s.id))");
 for(const width of baseline?[390]:[320,390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  for(const id of ids)for(const scheme of ['dark','light']){
   await ev('KamiSkin.setSkin('+JSON.stringify(id)+');KamiSkin.setFlag("scheme",'+JSON.stringify(scheme)+');KamiSkin.setFlag("motion","off");');await pause(40);
   const results=await ev('(()=>{const rows=[];for(const [tab,rootId] of [["skin","kami-skin-panel"],["preset","kami-preset-panel"],["compress","kami-compress-panel"]]){setTab(tab);const root=document.getElementById(rootId);for(const textSize of '+JSON.stringify(baseline?['default']:['default','large'])+'){if(root)for(const [key,value] of Object.entries({"--kami-fs":"22px","--kami-fs-sm":"20px","--kami-fs-xs":"18px"})){if(textSize==="large")root.style.setProperty(key,value);else root.style.removeProperty(key);}const bar=root?.querySelector(".kami-tabs");rows.push({panel:tab,textSize,...(bar?inspectTabStrip(bar):{issues:["Missing tab list"],count:0})});}}return rows;})()');
   evidence.push(...results.map(row=>({skin:id,scheme,width,...row})));
  }
 }
 if(!baseline){
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:2,mobile:false});
  await ev('KamiSkin.setSkin("grokbot");KamiSkin.setFlag("scheme","dark");KamiSkin.setFlag("motion","off");setTab("preset");for(const root of document.querySelectorAll(".kami-root"))for(const key of ["--kami-fs","--kami-fs-sm","--kami-fs-xs"])root.style.removeProperty(key);');await pause(100);
  const point=await ev('(()=>{const b=document.querySelector("#kami-preset-panel .kami-tabs");b.scrollLeft=0;const r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,overflow:b.scrollWidth>b.clientWidth+1};})()');
  check(point.overflow,'Real preset tabs need horizontal scrolling');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await send('Input.synthesizeScrollGesture',{x:point.x,y:point.y,xDistance:-160,yDistance:0,speed:800,gestureSourceType:'touch'});await pause(100);
  check(await ev('document.querySelector("#kami-preset-panel .kami-tabs").scrollLeft>0'),'Touch swipe scrolls real preset tabs');
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await ev('document.querySelector("#kami-preset-panel .kami-tabs").scrollLeft=0');
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:140});await pause(80);
  check(await ev('document.querySelector("#kami-preset-panel .kami-tabs").scrollLeft>0'),'Mouse wheel still scrolls real preset tabs');
  check(await ev('(()=>{const bar=document.querySelector("#kami-preset-panel .kami-tabs"),last=[...bar.querySelectorAll(".kami-tab")].at(-1);last.click();const b=bar.getBoundingClientRect(),r=last.getBoundingClientRect();return last.getAttribute("aria-selected")==="true"&&r.left>=b.left-1&&r.right<=b.right+1;})()'),'Far-away tab can be selected and revealed');
  if(process.argv.includes('--screens'))for(const tab of ['skin','preset']){
   await ev('setTab('+JSON.stringify(tab)+')');const shot=await send('Page.captureScreenshot',{format:'png'});fs.mkdirSync(path.resolve('.audit'),{recursive:true});fs.writeFileSync(path.resolve('.audit/tab-layout-'+tab+'-390.png'),Buffer.from(shot.data,'base64'));
  }
 }
 fs.mkdirSync(path.resolve('.audit'),{recursive:true});const failed=evidence.filter(r=>r.issues.length);fs.writeFileSync(path.resolve('.audit/tab-layout-'+(baseline?'before':built?'built':'source')+'.json'),JSON.stringify({checks:count,cases:evidence.length,errors,matrix:evidence},null,2));
 if(baseline){console.log(JSON.stringify({cases:evidence.length,failed:failed.length,sample:failed.slice(0,3)}));}
 else{for(const row of evidence)check(row.issues.length===0,JSON.stringify(row));check(errors.length===0,'No browser errors: '+errors.join(' | '));fs.writeFileSync(path.resolve('.audit/tab-layout-'+(built?'built':'source')+'.json'),JSON.stringify({checks:count,cases:evidence.length,errors,matrix:evidence},null,2));console.log('✓ Real panel tab layout: '+count+' passed; '+evidence.length+' theme/width/panel cases ('+(built?'built':'source')+')');}
}finally{
 if(ws)ws.close();const done=new Promise(r=>chrome.once('exit',r));chrome.kill();await Promise.race([done,pause(1500)]);
 const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('kami-ui-browser-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}}
}
