#!/usr/bin/env node
// Isolated real-browser regressions. No user browser/profile or live ST session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import * as expand from '../../build/kami-doc.mjs';
import {packSkinAssets} from '../../build/skin-assets.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kami-test-browser-'));
const chromePath=process.env.KAMI_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome=spawn(chromePath,['--headless=new','--single-process','--in-process-gpu','--no-sandbox',
 '--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-extensions',
 '--disable-background-networking','about:blank'],{stdio:'ignore',windowsHide:true});
let ws,count=0;
function check(ok,message){assert.ok(ok,message);count++;}
function script(file,assetFixture=false){
 let code=read('src/scripts/'+file);
 if(code.includes('/* @@KAMI_SKINS@@ */')){
  const skins=fs.readdirSync(path.join(ROOT,'src/skins')).map(id=>({...packSkinAssets(ROOT,id,JSON.parse(read('src/skins/'+id+'/skin.json'))),css:read('src/skins/'+id+'/skin.css')}));
  if(assetFixture)for(const sk of skins)sk.assets={fixture:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1kAAAAASUVORK5CYII='};
  code=code.replace('/* @@KAMI_SKINS@@ */',()=> 'var SKINS='+JSON.stringify(skins)+';');
 }
 for(const name of ['expandDecor','expandBaseCssJs','expandPresetParse','expandPanelGestures','expandGuideCopy'])code=expand[name](ROOT,code);
 return code.replaceAll('@@KAMI_BUILD_N@@','29').replaceAll('@@KAMI_PRESET_NAME@@','kami-v0.92-29-20261015');
}
try{
 let port;
 for(let i=0;i<100;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await sleep(100);}
 assert.ok(port,'Chrome starts');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve);ws.addEventListener('error',reject);});
 let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(pending.has(r.id)){const p=pending.get(r.id);pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const mid=++id;const timer=setTimeout(()=>{pending.delete(mid);reject(Error('CDP timeout: '+method));},12000);pending.set(mid,{resolve,reject,timer});ws.send(JSON.stringify({id:mid,method,params}));});
 async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 const tree=await send('Page.getFrameTree');
 async function page(html='<div id="chat"></div><textarea id="send_textarea"></textarea>'){
  await send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html><html><head></head><body>'+html+'</body></html>'});
 }
 async function child(code,setup=''){
  await ev(`(()=>{const f=document.createElement('iframe');document.body.appendChild(f);window.testFrame=f;const w=f.contentWindow;w.console={log(){},warn(){},error(){}};${setup};w.eval(${JSON.stringify(code)});})()`);
 }

 // Real body nodes survive wrapping and unloading; pending generation scan stops.
 await page('<div id="chat"><div class="mes" mesid="0"><div class="mes_text"><div data-kami-body-start></div><p id="story">正文</p><button id="plugin">插件</button><div data-kami-body-end></div></div></div></div>');
 await ev(`window.scanCount=0;window.originalQsa=Element.prototype.querySelectorAll;Element.prototype.querySelectorAll=function(s){if(this.id==='chat'&&s==='.mes[mesid]')scanCount++;return originalQsa.call(this,s);};window.originalStory=document.getElementById('story');window.pluginClicks=0;document.getElementById('plugin').onclick=()=>pluginClicks++;`);
 await child(script('45-正文外壳.js'),`
  const events={};w.tavern_events=Object.fromEntries(['GENERATION_STARTED','GENERATION_ENDED','MESSAGE_RECEIVED','MESSAGE_UPDATED'].map(x=>[x,x]));
  w.eventOn=(key,fn)=>{events[key]=fn;return ()=>delete events[key];};w.emit=key=>events[key]?.();w.SillyTavern={getContext:()=>({chat:[{mes:'<content>正文</content>'}]})};`);
 check(await ev(`document.querySelectorAll('[data-kami-body-host]').length===1&&document.getElementById('story')===originalStory`),'Body wrapper preserves original nodes');
 await ev(`scanCount=0;testFrame.contentWindow.emit('MESSAGE_UPDATED');testFrame.contentWindow.emit('GENERATION_STARTED');`);await sleep(100);
 check(await ev('scanCount===0'),'Already queued body scan does not run after generation starts');
 await ev('window.stoppedBody=KamiBodyShell;KamiBodyShell.shutdown();document.getElementById("plugin").click();');
 check(await ev(`!window.KamiBodyShell&&!document.querySelector('[data-kami-body-host]')&&document.getElementById('story')===originalStory&&pluginClicks===1`),'Shutdown removes wrapper and API while preserving text/plugin listeners');
 await ev(`scanCount=0;document.getElementById('chat').appendChild(document.createElement('div'));`);await sleep(450);
 check(await ev('scanCount===0'),'Stopped body observer never rescans');
 await ev('Element.prototype.querySelectorAll=originalQsa');

 // Real keyboard activation on nested mode buttons.
 await page();
 const options=expand.expandForPreview(ROOT,'options',JSON.stringify([{title:'继续',type:'行动',content:'继续'}]));
 await ev(`(()=>{const f=document.createElement('iframe');document.body.appendChild(f);window.optionsFrame=f;f.srcdoc=${JSON.stringify(options)};})()`);await sleep(250);
 await send('Page.bringToFront');
 await ev(`optionsFrame.contentWindow.focus();optionsFrame.contentDocument.querySelector('button[data-kami-mode="send"]').focus()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 const keyboard=await ev(`(()=>{const d=optionsFrame.contentDocument;return {mode:d.querySelector('.kami-root').getAttribute('data-kami-mode'),open:d.querySelector('.kami-collapse').getAttribute('data-kami-open'),ready:d.querySelector('.kami-root').getAttribute('data-kami-ready'),active:d.activeElement?.outerHTML,focused:d.hasFocus()};})()`);
 check(keyboard.mode==='send'&&keyboard.open==='1','Enter activates Send without folding the title: '+JSON.stringify(keyboard));

 // Actual computed pseudo-element animations in every promised motion mode.
 for(const skin of ['senren','isekai']){
  await page('<div class="kami-root"><div class="kami-shell"><span class="kami-dot"></span><button class="kami-btn kami-btn--primary">按钮</button></div></div>');
  await ev(`(()=>{document.head.innerHTML='';const s=document.createElement('style');s.textContent=${JSON.stringify(read('src/skins/'+skin+'/skin.css'))};document.head.appendChild(s);document.documentElement.setAttribute('data-kami-skin',${JSON.stringify(skin)});document.documentElement.setAttribute('data-kami-effects',${JSON.stringify(skin==='senren'?'sakura':'starlight')});})()`);
  const expr=skin==='senren'?`getComputedStyle(document.querySelector('.kami-shell'),'::before').animationName`:`[getComputedStyle(document.querySelector('.kami-dot')).animationName,getComputedStyle(document.querySelector('.kami-btn'),'::after').animationName].join(',')`;
  for(const motion of ['full','calm','off']){
   await ev(`document.documentElement.setAttribute('data-kami-motion',${JSON.stringify(motion)})`);
   const names=await ev(expr);check(motion==='full'?!names.split(',').every(x=>x==='none'):names.split(',').every(x=>x==='none'),skin+' computed animations obey '+motion);
  }
  await ev(`document.documentElement.setAttribute('data-kami-motion','full')`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  check((await ev(expr)).split(',').every(x=>x==='none'),skin+' obeys system reduced motion');
  await send('Emulation.setEmulatedMedia',{features:[]});
 }

 // Full manager, new iframes, navigation and mutation traffic.
 await page();
 await child(script('30-皮肤管理.js',true),`w.getVariables=()=>({});w.replaceVariables=()=>{};w.eventOn=()=>({stop(){}});w.iframe_events={};`);
 check(await ev(`!!window.KamiSkin`),'Skin manager boots from expanded current source');
 await ev(`(()=>{const f=document.createElement('iframe');f.id='TH-message--audit';f.srcdoc='<div class="kami-root"><div class="kami-shell">新楼层</div></div>';document.getElementById('chat').appendChild(f);})()`);await sleep(250);
 check(await ev(`document.getElementById('TH-message--audit').contentDocument.documentElement.getAttribute('data-kami-skin')===KamiSkin.skin`),'New iframe gets skin without full-chat polling');
 check(await ev(`(()=>{const f=document.getElementById('TH-message--audit');return KamiSkin.status().assets.images===1&&getComputedStyle(document.documentElement).getPropertyValue('--kami-asset-fixture')===f.contentWindow.getComputedStyle(f.contentDocument.documentElement).getPropertyValue('--kami-asset-fixture');})()`),'Full skin manager shares asset variables between host and message iframe');
 await ev(`window.attrWrites=0;window.attributeWatch=new MutationObserver(r=>attrWrites+=r.length);attributeWatch.observe(document.getElementById('TH-message--audit').contentDocument.documentElement,{attributes:true});for(let i=0;i<30;i++){const p=document.createElement('span');p.textContent='token'+i;document.getElementById('chat').appendChild(p);}`);await sleep(180);
 check(await ev('attrWrites===0'),'Streaming DOM traffic does not rewrite historical iframe attributes');
 await ev(`window.detached=document.createElement('iframe');detached.id='TH-message--detached';window.detachedLoadHandlers=0;const add=detached.addEventListener.bind(detached),remove=detached.removeEventListener.bind(detached);detached.addEventListener=(type,...args)=>{if(type==='load')detachedLoadHandlers++;return add(type,...args)};detached.removeEventListener=(type,...args)=>{if(type==='load')detachedLoadHandlers--;return remove(type,...args)};document.getElementById('chat').appendChild(detached)`);await sleep(100);
 await ev(`detached.remove()`);await sleep(100);
 check(await ev('detachedLoadHandlers===0'),'Removed iframe releases its load listener');
 await ev(`KamiSkin.setSkin('gemini');KamiSkin.setParam('halo',14);KamiSkin.setSkin('nixie')`);
 check(await ev('KamiSkin.state.params.halo===55'),'Full manager isolates per-skin units');
 await ev(`document.getElementById('TH-message--audit').srcdoc='<div class="kami-root">重新渲染</div>'`);await sleep(200);
 check(await ev(`document.getElementById('TH-message--audit').contentDocument.documentElement.getAttribute('data-kami-skin')==='nixie'`),'Same iframe with a new document is not skipped by cache');
 await ev('window.oldSkinManager=KamiSkin;attributeWatch.disconnect();KamiSkin.shutdown()');
 check(await ev(`!document.getElementById('kami-skin')&&!document.getElementById('TH-message--audit').contentDocument.documentElement.hasAttribute('data-kami-skin')`),'Manager shutdown restores iframe fallback');
 check(await ev('oldSkinManager.status().assets.images===0&&oldSkinManager.status().assets.disposed'),'Full manager shutdown releases the shared asset pool');

 // One image pool serves multiple message documents and new content without observers.
 await page();
 await ev(read('src/scripts/_skin-assets.js').replace(/^export /gm,''));
 await ev(`window.assetPool=createSkinAssetPool(window);window.assetSkin={id:'demo',assets:{pixel:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1kAAAAASUVORK5CYII='}};window.assetCss=assetPool.css(assetSkin);for(let i=0;i<2;i++){const f=document.createElement('iframe');f.className='asset-frame';document.body.append(f);f.contentDocument.documentElement.setAttribute('data-kami-skin','demo');f.contentDocument.head.innerHTML='<style>'+assetCss+'.sample{background-image:var(--kami-asset-pixel)}</style>';f.contentDocument.body.innerHTML='<div class="sample">图片</div>';}`);
 check(await ev(`(()=>{const frames=[...document.querySelectorAll('.asset-frame')];window.assetURL=frames[0].contentWindow.getComputedStyle(frames[0].contentDocument.querySelector('.sample')).backgroundImage.slice(5,-2);return frames.every(f=>f.contentWindow.getComputedStyle(f.contentDocument.querySelector('.sample')).backgroundImage.includes(assetURL))&&assetPool.stats().images===1;})()`),'Two real iframe documents share one image URL');
 check(await ev(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===1);img.onerror=()=>resolve(false);img.src=assetURL;})`),'Shared Blob image actually decodes');
 check(await ev(`(()=>{const f=document.querySelector('.asset-frame'),n=f.contentDocument.createElement('div');n.className='sample';f.contentDocument.body.append(n);return f.contentWindow.getComputedStyle(n).backgroundImage.includes(assetURL);})()`),'New content receives decoration through CSS without DOM scanning');
 await ev('assetPool.dispose()');
 check(await ev(`assetPool.stats().images===0&&assetPool.css(assetSkin)===''`),'Asset pool releases resources and rejects late work');

 // Retry in an iframe cannot re-subscribe after explicit shutdown.
 await page();
 await child(script('35-提示词发送修改.js'),`w.subscriptions=0;w.ready=false;w.SillyTavern={getContext:()=>w.ready?{extensionSettings:{variables:{global:{}}}}:null};w.eventOn=()=>{w.subscriptions++;return {stop(){}};};w.tavern_events={CHAT_COMPLETION_PROMPT_READY:'ready'};`);
 await ev('window.stoppedName=KamiNameWrap;KamiNameWrap.shutdown();testFrame.contentWindow.ready=true');await sleep(550);
 check(await ev('testFrame.contentWindow.subscriptions===0&&!window.KamiNameWrap&&stoppedName.set("none")===false'),'Shutdown cancels startup retry and invalidates stale write API');

 // A live progress window is cleaned even while its download Promise is pending.
 await page();
 await child(script('70-远程更新.js'),`
  w.imports=0;w.downloadStarted=false;
  const preset={name:'kami-v0.92-29-20261015',preset_settings_openai:'kami-v0.92-29-20261015',prompts:[{identifier:'a',content:'x'}],prompt_order:[]};
  w.SillyTavern={getContext:()=>({chatCompletionSettings:preset,getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'CSRF'})})};
  w.getVariables=()=>({});w.replaceVariables=()=>{};w.getPresetNames=()=>[];w.triggerSlash=async()=> '1';w.importRawPreset=()=>{w.imports++;return true;};
  w.fetch=async(url)=>{if(String(url).includes('/releases?'))return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify([{tag_name:'v0.92-99',name:'kami-v0.92-99-20261017',draft:false,body:'更新',assets:[{name:'kami-v0.92-99-20261017.json',browser_download_url:'https://example.invalid/preset.json'}]}])};w.downloadStarted=true;return new Promise(resolve=>w.releaseDownload=()=>resolve({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(preset)}));};`);
 await ev('window.updateDone=false;KamiUpdate.check(true).then(()=>updateDone=true);void 0');await sleep(200);
 check(await ev(`!!document.getElementById('kami-update-progress')&&testFrame.contentWindow.downloadStarted`),'Update actually opens a progress window before shutdown test');
 await ev('window.stoppedUpdate=KamiUpdate;KamiUpdate.shutdown()');await sleep(30);
 check(await ev(`!window.KamiUpdate&&!document.getElementById('kami-update-progress')&&!document.getElementById('kami-update-progress-css')&&updateDone`),'Shutdown closes progress, CSS and pending public check');
 await ev('testFrame.contentWindow.releaseDownload()');await sleep(150);
 check(await ev(`testFrame.contentWindow.imports===0&&!document.getElementById('kami-update-progress')`),'Late download cannot write a preset or recreate a progress window');
 console.log('✓ Real-browser audit regressions: '+count+' passed');
}finally{
 if(ws)ws.close();
 const exited=new Promise(resolve=>chrome.once('exit',resolve));
 chrome.kill();await Promise.race([exited,sleep(1500)]);
 const resolved=path.resolve(profile),temp=path.resolve(os.tmpdir())+path.sep;
 if(resolved.startsWith(temp)&&path.basename(resolved).startsWith('kami-test-browser-')){
  try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}
 }
}
