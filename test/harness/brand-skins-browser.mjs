// End-to-end skin checks against the real local preview scripts and message frames.
// Run test/harness/server.mjs first. Uses an isolated Chrome profile, never live ST.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin=process.env.KAMI_PREVIEW_ORIGIN||'http://127.0.0.1:8790';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Use a local preview harness');
const pause=ms=>new Promise(r=>setTimeout(r,ms)),profile=fs.mkdtempSync(path.join(os.tmpdir(),'kami-brand-browser-'));
const chrome=spawn(process.env.KAMI_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--single-process','--in-process-gpu','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-extensions','--disable-background-networking','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,count=0;const evidence=[];
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
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/test/harness/preview.html?skin=deepseek&tab=options&nowrap=1&nostatus=1&reset=1'});
 for(let i=0;i<150;i++){if(await ev(`!!(window.KamiSkin&&KamiSkin.skin==='deepseek'&&window.KamiPreset&&window.KamiGuide&&window.KamiSummarize&&document.querySelector('[data-pane="options"] iframe')?.contentDocument?.querySelector('.kami-item'))`))break;await pause(100);}
 check(await ev(`!!(window.KamiSkin&&window.KamiPreset&&window.KamiGuide&&window.KamiSummarize)`),'All four real panels start');
 const frames=await ev(`([...document.querySelectorAll('#slot iframe')].map(f=>({pane:f.closest('[data-pane]').dataset.pane,written:f.dataset.written,head:!!f.contentDocument?.querySelector('.kami-head'),title:f.contentDocument?.title,text:f.contentDocument?.body?.textContent.slice(0,100)})))`);
 check(frames.length===2&&frames.every(f=>f.head),'Message frames boot: '+JSON.stringify(frames));await pause(1300);
 // Host themes can style option rows separately from the closed select control.
 // Reproduce the reported dark menu + inherited dark text, even with host !important.
 await ev(`(()=>{const style=document.createElement('style');style.textContent='select option,select optgroup{background-color:#808080!important;color:#fff!important}select option:not(:checked){background-color:#000!important;color:inherit!important}';document.head.appendChild(style);})()`);
 // Browser-side measurements return only concrete failures, not large DOM dumps.
 await ev(`window.skinProbe=()=>{const out={fail:[],fields:0,text:0};const rgb=s=>{const n=s.match(/[\\d.]+/g);return n?n.map(Number):[0,0,0,0];};const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};const visible=x=>x.getClientRects().length&&getComputedStyle(x).visibility!=='hidden';const docs=[document,...[...document.querySelectorAll('#slot iframe')].map(f=>f.contentDocument).filter(Boolean)];for(const doc of docs){const win=doc.defaultView;for(const root of doc.querySelectorAll('.kami-root')){if(!root.getClientRects().length)continue;const shell=root.querySelector('.kami-shell,.kami-drop');if(!shell||!shell.getClientRects().length)continue;const r=shell.getBoundingClientRect();if(r.left<-.5||r.right>win.innerWidth+.5)out.fail.push('shell overflow '+doc.title+' '+r.left+'/'+r.right+'/'+win.innerWidth);for(const input of root.querySelectorAll('input.kami-number,input.kami-text,textarea.kami-textarea,select.kami-select,select.kami-number,textarea.kami-number')){if(!input.getClientRects().length)continue;const cs=win.getComputedStyle(input),bg=rgb(cs.backgroundColor);out.fields++;if(bg[3]===0||ratio(rgb(cs.color),bg)<4.5)out.fail.push('input contrast '+input.className+' '+cs.color+'/'+cs.backgroundColor);}for(const el of root.querySelectorAll('.kami-md p,.kami-card-title,.kami-card-body,.kami-item-main')){if(!el.getClientRects().length)continue;let p=el,bg;while(p){bg=rgb(win.getComputedStyle(p).backgroundColor);if(bg[3]!==0)break;p=p.parentElement;}out.text++;if(!bg||bg[3]===0||ratio(rgb(win.getComputedStyle(el).color),bg)<4.5)out.fail.push('text contrast '+el.className);}const head=shell.querySelector('.kami-head');if(head)for(const x of head.querySelectorAll('button,.kami-actions')){const b=x.getBoundingClientRect();if(b.right>r.right+.5||b.left<r.left-.5)out.fail.push('header action overflow '+x.className);}}}return out;};`);
 for(const width of [1440,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  for(const skin of ['gpt','claude','deepseek'])for(const scheme of ['light','dark']){
   await ev(`KamiSkin.setSkin(${JSON.stringify(skin)});KamiSkin.setFlag('scheme',${JSON.stringify(scheme)});KamiSkin.setFlag('motion','off');KamiSkin.setFlag('density','cozy');`);await pause(80);
   check(await ev(`document.documentElement.dataset.kamiSkin===${JSON.stringify(skin)}&&[...document.querySelectorAll('#slot iframe')].every(f=>f.contentDocument.documentElement.dataset.kamiSkin===${JSON.stringify(skin)}&&f.contentDocument.documentElement.dataset.kamiScheme===${JSON.stringify(scheme)})`),skin+' '+scheme+' frame sync');
   let fields=0,text=0;
   for(const tab of ['think','options','skin','preset','guide','compress']){
    await ev(`setTab(${JSON.stringify(tab)});if(${JSON.stringify(tab)}==='think'){const doc=document.querySelector('[data-pane="think"] iframe').contentDocument;const head=doc.querySelector('.kami-collapse-head');if(head.getAttribute('aria-expanded')!=='true')head.click();}`);await pause(70);
    const got=await ev('skinProbe()');check(got.fail.length===0,[skin,scheme,width,tab,...got.fail].join(' | '));fields+=got.fields;text+=got.text;
    if(process.argv.includes('--screens')&&scheme==='light'&&['options','preset'].includes(tab)){
     const dir=path.resolve('.audit/brand-runtime');fs.mkdirSync(dir,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,skin+'-'+width+'-'+tab+'.png'),Buffer.from(shot.data,'base64'));
    }
   }
   await ev(`setTab('skin')`);
   const menu=await ev(`(()=>{const select=document.querySelector('[data-kami-role="skin-pick"]'),fixture=select.cloneNode(false);fixture.removeAttribute('data-kami-role');fixture.innerHTML='<optgroup label="选项组"><option selected>当前选项</option><option>普通选项</option><option disabled>暂不可用</option></optgroup>';select.after(fixture);const rows=[...select.options,...fixture.querySelectorAll('option,optgroup')].map(o=>{const cs=getComputedStyle(o);return {selected:o.selected,bg:cs.backgroundColor,fg:cs.color};});fixture.remove();return {rows};})()`);
   check(menu.rows.length>=21&&menu.rows.every(r=>r.bg!=='rgb(0, 0, 0)'&&r.bg!=='rgb(128, 128, 128)'&&r.bg!=='rgba(0, 0, 0, 0)'),skin+' '+scheme+' menu rows override the host background');
   check(menu.rows.every(r=>r.selected||r.fg!==r.bg)&&menu.rows.some(r=>r.selected),skin+' '+scheme+' menu selected and unselected rows have explicit colors');
   const menuContrast=Math.min(...menu.rows.map(r=>contrast(r.fg,r.bg)));
   check(menuContrast>=4.5,skin+' '+scheme+' option/group/disabled/selected contrast '+menuContrast.toFixed(2));
   if(process.argv.includes('--screens')&&width===1440){
    const rect=await ev(`(()=>{const select=document.querySelector('[data-kami-role="skin-pick"]');window.menuFixture=select.cloneNode(true);menuFixture.removeAttribute('data-kami-role');menuFixture.size=8;menuFixture.style.cssText='display:block;width:240px;min-height:240px;max-width:100%;margin:12px;';document.querySelector('#kami-skin-panel [data-kami-pane="skin"]').prepend(menuFixture);menuFixture.scrollIntoView({block:'center'});const r=menuFixture.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height,scale:1};})()`);
    const shot=await send('Page.captureScreenshot',{format:'png',clip:rect});fs.writeFileSync(path.resolve('.audit/brand-runtime/'+skin+'-menu-'+scheme+'.png'),Buffer.from(shot.data,'base64'));await ev('menuFixture.remove()');
   }
   evidence.push({skin,scheme,width,fields,text,menuContrast:Number(menuContrast.toFixed(2))});
  }
 }
 await ev(`KamiSkin.setSkin('deepseek');KamiSkin.setFlag('scheme','light');setTab('skin');document.querySelector('#kami-skin-panel [data-kami-tab="fx"]').click();`);
 for(const fx of ['mascots','ocean','controls']){
  check(await ev(`(()=>{const box=document.querySelector('[data-kami-act="fx:${fx}"]');if(!box)throw Error('Missing effect checkbox ${fx}');box.click();return !KamiSkin.status().effects.includes('${fx}');})()`),'Disable '+fx);
  const result=await ev(`(()=>{const doc=document.querySelector('[data-pane="options"] iframe').contentDocument,win=doc.defaultView,el=doc.querySelector('${fx==='mascots'?'.kami-title':fx==='ocean'?'.kami-shell':'.kami-card-title'}'),cs=win.getComputedStyle(el,'::before');return {active:doc.documentElement.dataset.kamiEffects.split(' ').includes('${fx}'),content:cs.content,image:cs.backgroundImage};})()`);
  check(!result.active,'Effect '+fx+' propagates to iframe');
  if(fx!=='controls')check(result.content==='none'||result.content==='normal','Disabled '+fx+' removes image pseudo-element');
  else check(result.image==='none','Disabled controls remove option ornament');
  await ev(`document.querySelector('[data-kami-act="fx:${fx}"]').click()`);
 }
 const point=await ev(`(()=>{const box=document.querySelector('[data-kami-act="fx:controls"]'),track=box.parentElement.querySelector('.kami-switch-track');track.scrollIntoView({block:'center'});const r=track.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 check(await ev(`!KamiSkin.status().effects.includes('controls')`),'Decorated switch accepts a real pointer click');
 await ev(`document.querySelector('[data-kami-act="fx:controls"]').focus()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 check(await ev(`KamiSkin.status().effects.includes('controls')`),'Decorated switch accepts native keyboard activation');
 await ev(`KamiSkin.setParam('ocean',.04);KamiSkin.setParam('mascot',40);`);
 check(await ev(`(()=>{const doc=document.querySelector('[data-pane="options"] iframe').contentDocument;return doc.defaultView.getComputedStyle(doc.querySelector('.kami-shell'),'::before').opacity==='0.04'&&doc.defaultView.getComputedStyle(doc.querySelector('.kami-title')).getPropertyValue('--kami-deepseek-mascot-size').trim()==='40px';})()`),'Decoration parameters affect real iframe');
 await ev(`KamiSkin.setSkin('gpt');KamiSkin.setSkin('deepseek');`);
 check(await ev(`KamiSkin.state.params.ocean===.04&&KamiSkin.state.params.mascot===40`),'Decoration parameters survive skin switching');
 await ev(`KamiSkin.setParam('ocean',.12);KamiSkin.setParam('mascot',34);`);
 const decoded=await ev(`(async()=>{const doc=document.querySelector('[data-pane="options"] iframe').contentDocument,root=doc.querySelector('.kami-root');const values=[];for(const key of ['mascot','thinking','peek','ocean','orca']){const s=doc.defaultView.getComputedStyle(root).getPropertyValue('--kami-asset-'+key).trim();values.push(await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);img.src=s.slice(5,-2);}));}return values;})()`);
 check(decoded.length===5&&decoded.every(Boolean),'All five production images decode from shared Blob URLs');
 check(await ev(`KamiSkin.status().assets.images===5`),'Only five shared image resources across all message and preview frames');
 // A long story is a host component, unlike the compact cards in the design preview.
 await ev(`setTab('options');window.storyFixture=document.createElement('section');storyFixture.className='kami-root';storyFixture.dataset.kamiComp='body';storyFixture.innerHTML='<article class="kami-shell kami-surface"><div class="kami-body"><p>长正文背景适配示例。装饰应贴着四角和边缘，中央保持清楚。</p></div></article>';document.body.appendChild(storyFixture);`);
 const borders=[];
 for(const [width,height] of [[300,180],[300,1800],[1100,260],[1100,1800]]){
  await send('Emulation.setDeviceMetricsOverride',{width:width+40,height:1000,deviceScaleFactor:1,mobile:false});
  const border=await ev(`(()=>{const root=storyFixture,shell=root.firstElementChild;root.style.width='${width}px';shell.style.height='${height}px';const cs=getComputedStyle(shell,'::before');return {width:parseFloat(cs.width),height:parseFloat(cs.height),source:cs.borderImageSource,slice:cs.borderImageSlice,background:cs.backgroundImage,pointer:cs.pointerEvents,shellWidth:shell.offsetWidth,shellHeight:shell.offsetHeight};})()`);
  check(border.source.startsWith('url("blob:')&&border.background==='none'&&Math.abs(border.width-border.shellWidth)<3&&Math.abs(border.height-border.shellHeight)<3,'Ocean frame covers '+width+'x'+height+' story without a fixed-size image');
  check(border.slice==='42%'&&border.pointer==='none','Ocean corners and interaction remain intact');borders.push({width,height,slice:border.slice});
  if(process.argv.includes('--screens')){
   await ev(`storyFixture.scrollIntoView({block:'start'});scrollBy(0,-12)`);
   const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.resolve('.audit/brand-runtime/ocean-'+width+'x'+height+'.png'),Buffer.from(shot.data,'base64'));
  }
 }
 await ev(`storyFixture.remove()`);
 // Exercise all result faces with the production d10 and fixed camera transform.
 await ev(`KamiSkin.setSkin('wod');KamiSkin.setFlag('motion','off');setTab('options');`);
 const dice=await ev(`(()=>{const doc=document.querySelector('[data-pane="options"] iframe').contentDocument,win=doc.defaultView,el=doc.querySelector('.kami-d10'),g=win.KamiD10.geometry(),out=[];for(let value=1;value<=10;value++){win.KamiD10.roll(el,value);const m=new win.DOMMatrix(win.getComputedStyle(el.querySelector('.kami-d10-body')).transform);const normals=g.faces.map(f=>m.transformPoint(new win.DOMPoint(...f.n,0)));out.push({value:Number(el.dataset.kamiD10Value),visible:normals.filter(n=>n.z>.01).length,resultZ:normals[value-1].z,rolling:el.hasAttribute('data-kami-d10-rolling')});}return out;})()`);
 check(dice.every((d,i)=>d.value===i+1&&!d.rolling),'All ten d10 results settle correctly with motion off');
 check(dice.every(d=>d.visible>=4&&d.resultZ>.8),'All d10 results retain a readable front face and at least four visible faces');
 await ev(`(()=>{KamiSkin.setFlag('motion','full');const doc=document.querySelector('[data-pane="options"] iframe').contentDocument;doc.defaultView.KamiD10.roll(doc.querySelector('.kami-d10'),7);})()`);
 check(await ev(`document.querySelector('[data-pane="options"] iframe').contentDocument.querySelector('.kami-d10').hasAttribute('data-kami-d10-rolling')`),'d10 full motion still animates');await pause(1500);
 check(await ev(`(()=>{const el=document.querySelector('[data-pane="options"] iframe').contentDocument.querySelector('.kami-d10');return el.dataset.kamiD10Value==='7'&&!el.hasAttribute('data-kami-d10-rolling');})()`),'d10 full-motion roll settles to its selected result');
 await ev(`(()=>{KamiSkin.setFlag('motion','calm');const doc=document.querySelector('[data-pane="options"] iframe').contentDocument;doc.defaultView.KamiD10.roll(doc.querySelector('.kami-d10'),8);})()`);
 check(await ev(`(()=>{const el=document.querySelector('[data-pane="options"] iframe').contentDocument.querySelector('.kami-d10');return el.dataset.kamiD10Value==='8'&&!el.hasAttribute('data-kami-d10-rolling');})()`),'d10 calm motion jumps directly to the result');
 await ev(`KamiSkin.setSkin('deepseek');setTab('options');window.brandOldApi=KamiSkin;KamiSkin.shutdown();`);
 check(await ev(`brandOldApi.status().assets.disposed&&brandOldApi.status().assets.images===0&&!document.documentElement.hasAttribute('data-kami-skin')&&[...document.querySelectorAll('#slot iframe')].every(f=>!f.contentDocument.documentElement.hasAttribute('data-kami-skin'))`),'Shutdown releases artwork and clears skin from frames');
 console.log(JSON.stringify({checks:count,matrix:evidence,borders,dice}));console.log('✓ Brand skin browser integration: '+count+' passed');
}finally{
 if(ws)ws.close();const done=new Promise(r=>chrome.once('exit',r));chrome.kill();await Promise.race([done,pause(1500)]);
 const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('kami-brand-browser-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}}
}
