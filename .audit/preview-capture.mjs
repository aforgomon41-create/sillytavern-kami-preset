// Isolated visual inspection of the review preview. No user profile or live ST.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const [url,out,width='1440',height='1200',mode='light']=process.argv.slice(2);
if(!url||!out)throw Error('Usage: preview-capture.mjs URL output.png [width height mode]');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kami-review-chrome-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--single-process','--in-process-gpu','--no-sandbox','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-extensions','--disable-background-networking','about:blank'],{stdio:'ignore',windowsHide:true});
let ws;
try{
 let port;for(let i=0;i<100&&!port;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(!port)await pause(100);}
 if(!port)throw Error('Chrome did not start');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve);ws.addEventListener('error',reject);});
 let id=0;const pending=new Map();
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const mid=++id;const timer=setTimeout(()=>{pending.delete(mid);reject(Error('Timeout: '+method));},20000);pending.set(mid,{resolve,reject,timer});ws.send(JSON.stringify({id:mid,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:Number(width),height:Number(height),deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url});
 for(let i=0;i<40;i++){await pause(150);if(await ev("document.readyState==='complete'"))break;}
 if(url.includes('/test/harness/preview.html')){
  const skin=new URL(url).searchParams.get('skin');
  for(let i=0;i<150;i++){if(await ev(`!!(window.KamiSkin&&KamiSkin.skin===${JSON.stringify(skin)}&&window.KamiSummarize&&document.querySelector('[data-pane="options"] iframe')?.contentDocument?.querySelector('.kami-item'))`))break;await pause(100);}
  await pause(1000);await ev(`KamiSkin.setFlag('scheme',${JSON.stringify(mode)});setTab(${JSON.stringify(new URL(url).searchParams.get('tab')||'options')})`);
  if(new URL(url).searchParams.get('tab')==='think')await ev(`(()=>{const doc=document.querySelector('[data-pane="think"] iframe').contentDocument;const head=doc.querySelector('.kami-collapse-head');if(head.getAttribute('aria-expanded')!=='true')head.click();})()`);
  console.log(JSON.stringify(await ev(`(()=>{const d=document.querySelector('[data-pane="options"] iframe').contentDocument,w=d.defaultView,r=d.querySelector('.kami-root');return {font:w.getComputedStyle(r).fontFamily,titleFont:w.getComputedStyle(d.querySelector('.kami-title')).fontFamily};})()`)));
 }
 if(url.includes('/design/previews/brand-skins.html')){
  for(let i=0;i<40;i++){if(await ev("document.body.dataset.previewReady==='true'"))break;await pause(150);}
  const checks=await ev(`(async()=>{const lab=document.querySelector('.deepseek-lab');if(!lab)throw Error('Preview decorations did not load');const results={};for(const kind of ['mascots','ocean','controls']){const box=lab.querySelector('[data-decoration="'+kind+'"]');box.click();results[kind]=lab.dataset[kind]==='off';if(kind==='mascots')results[kind]&&=getComputedStyle(lab.querySelector('.footer-mascot')).visibility==='hidden';if(kind==='ocean')results[kind]&&=getComputedStyle(lab,'::before').display==='none';if(kind==='controls')results[kind]&&=getComputedStyle(lab.querySelector('.ornament-field')).backgroundImage==='none';box.click();}const choice=lab.querySelectorAll('.choice')[1];choice.click();results.choice=choice.classList.contains('selected');lab.querySelector('.choice').click();const field=lab.querySelector('.lab-range');field.value='73';field.dispatchEvent(new Event('input',{bubbles:true}));results.range=lab.querySelector('output').value==='73%';field.value='60';field.dispatchEvent(new Event('input',{bubbles:true}));for(const name of ['mascot','thinking','peek','ocean','orca']){const value=getComputedStyle(lab).getPropertyValue('--kami-asset-'+name).trim();const src=value.slice(5,-2);results['image-'+name]=await new Promise(resolve=>{const i=new Image;i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);i.src=src;});}return results;})()`);
  if(Object.values(checks).some(x=>!x))throw Error('Preview interaction check failed: '+JSON.stringify(checks));
  const point=await ev(`(()=>{const x=document.querySelector('.orca-toggle input');x.scrollIntoView({block:'center'});const r=x.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  checks.pointer=await ev(`!document.querySelector('.orca-toggle input').checked`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  checks.keyboard=await ev(`document.querySelector('.orca-toggle input').checked`);
  if(!checks.pointer||!checks.keyboard)throw Error('Decorated checkbox pointer/keyboard failed');
  console.log(JSON.stringify({previewChecks:checks}));await ev('scrollTo(0,0)');
 }
 await ev(`document.body.dataset.mode=${JSON.stringify(mode)};for(const b of document.querySelectorAll('.review-tools button'))b.setAttribute('aria-pressed',String(b.dataset.mode===${JSON.stringify(mode)}))`);
 await pause(400);
 console.log(JSON.stringify(await ev(`({title:document.title,viewport:innerWidth,width:document.documentElement.scrollWidth,images:[...document.images].map(x=>({src:x.getAttribute('src'),loaded:x.complete&&x.naturalWidth>0})),frames:[...document.querySelectorAll('iframe')].map(f=>({src:f.getAttribute('src'),dice:f.contentDocument?.querySelectorAll('.kami-d10').length}))})`)));
 const layout=await send('Page.getLayoutMetrics');
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:Number(width),height:Math.min(6000,layout.cssContentSize.height),scale:1}});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.from(shot.data,'base64'));console.log(out);
}finally{
 if(ws)ws.close();const done=new Promise(r=>chrome.once('exit',r));chrome.kill();await Promise.race([done,pause(1500)]);
 const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('kami-review-chrome-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{}}
}
