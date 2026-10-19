import assert from 'node:assert/strict';
import {createKamiNativeSearchEvidence,createKamiNativeSearchProbe} from '../../src/scripts/_search-native-probe.js';
import {createKamiResponseTransport} from '../../src/scripts/_response-transport.js';
import {kamiResponsePipeline} from '../../src/scripts/_response-pipeline.js';
import {createKamiSearchService} from '../../src/scripts/_search-service.js';
import * as pure from '../../src/scripts/_search-pure.js';
import * as providers from '../../src/scripts/_search-providers.js';
let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(a,label)=>{assert.ok(a,label);checks++;};
const tick=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
const gemini={candidates:[{finishReason:'STOP',groundingMetadata:{webSearchQueries:['Mozilla blog latest'],groundingChunks:[{web:{uri:'https://blog.mozilla.org/a',title:'Official article'}}]}}]};
const claude={content:[{type:'server_tool_use',id:'srvtoolu_1',name:'web_search'},{type:'web_search_tool_result',tool_use_id:'srvtoolu_1',content:[{type:'web_search_result',url:'https://blog.mozilla.org/b',title:'Article B'}]}],usage:{server_tool_use:{web_search_requests:1}}};
const router={choices:[{finish_reason:'stop',message:{content:'answer',annotations:[{type:'url_citation',url_citation:{url:'https://blog.mozilla.org/c',title:'Article C'}}]}}],usage:{server_tool_use:{web_search_requests:1}}};
for(const data of [gemini,claude,router]){
 const e=createKamiNativeSearchEvidence();e.consume(data);e.consume(data);
 eq(e.result().state,'verified','Structured provider evidence verifies search');
 eq(e.result().queries,1,'Repeated metadata is not double counted');
 eq(e.result().sources.length,1,'Sources are deduplicated');
}
for(const data of [
 {choices:[{message:{content:'我已经联网搜索 https://example.org'}}]},
 {choices:[{message:{content:JSON.stringify(gemini)}}]},
 {...router,usage:undefined},
 {content:[{type:'text',text:'已搜索',citations:[{type:'web_search_result_location',url:'https://example.org'}]}]},
 {content:[{type:'server_tool_use',id:'srvtoolu_1',name:'web_search'}]},
 {candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:'https://example.org'}}]}}]}
]){
 const e=createKamiNativeSearchEvidence();e.consume(data);
 eq(e.result().state,'unverified','Text, citations, intention and empty metadata do not prove execution');
}
{
 const e=createKamiNativeSearchEvidence();e.consume({candidates:[{groundingMetadata:{webSearchQueries:['one']}}]});
 eq(e.result().state,'empty','Execution without returned sources is distinct');
 e.consume({error:{message:'error'}});eq(e.result().state,'failed','200 response body can be a provider error');
}
{
 const e=createKamiNativeSearchEvidence();e.consume({content:[{type:'server_tool_use',id:'x',name:'web_search'},{type:'web_search_tool_result',tool_use_id:'x',content:{type:'web_search_tool_result_error',error_code:'max_uses_exceeded'}}]});
 eq(e.result().state,'failed','Tool error is not an empty result');
}
for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.org']){
 const e=createKamiNativeSearchEvidence();e.consume({candidates:[{groundingMetadata:{webSearchQueries:['one'],groundingChunks:[{web:{uri:url}}]}}]});
 eq(e.result().sources.length,0,'Unsafe sources rejected');
}
const encoder=new TextEncoder();
function stream(text,chunk=1){const data=encoder.encode(text);return new Response(new ReadableStream({start(c){for(let i=0;i<data.length;i+=chunk)c.enqueue(data.slice(i,i+chunk));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
function wire(data){return 'data: '+JSON.stringify(data)+'\r\n\r\ndata: [DONE]\r\n\r\n';}
for(const chunk of [1,3,37,4096]){
 const received=[];const info=await createKamiResponseTransport().readEvents(stream(wire(gemini),chunk),value=>received.push(value));
 eq(received,[gemini],'Fragmented UTF-8/SSE remains intact');eq(info.ended,true,'DONE is recognized');
}
{
 const received=[];
 await createKamiResponseTransport().readEvents(stream('data: {\r\ndata: "中文":"虎鲸"\r\ndata: }\r\n\r\n',2),value=>received.push(value));
 eq(received,[{'中文':'虎鲸'}],'SSE multi-line data and UTF-8');
}
for(const text of [JSON.stringify(gemini),JSON.stringify([gemini,router])]){
 const got=[];await createKamiResponseTransport().readEvents(new Response(text,{headers:{'Content-Type':'application/json'}}),value=>got.push(value));
 eq(got.length,text.startsWith('[')?2:1,'JSON and JSON array response support');
}
await assert.rejects(()=>createKamiResponseTransport().readEvents(stream(wire(gemini)),()=>{},{maxBytes:20}),/大小限制/);checks++;
await assert.rejects(()=>createKamiResponseTransport().readEvents(stream('data: malformed\n\n'),()=>{}));checks++;
{
 let cancelled=false;const controller=new AbortController(),pending=new Response(new ReadableStream({cancel(){cancelled=true;}}));
 const task=createKamiResponseTransport().readEvents(pending,()=>{},{signal:controller.signal});
 await tick();controller.abort();await assert.rejects(()=>task,{name:'AbortError'});checks++;await tick();ok(cancelled,'Abort cancels even before peek receives the first bytes');
}
function fixture(options={}){
 let settings={chat_completion_source:'makersuite',google_model:'test-gemini',reverse_proxy:'https://proxy.example.org'},chat=[{is_user:true,mes:'PRIVATE_STORY'}],epoch=0;
 const host={AbortController,Response,location:{href:'http://localhost:11451/',origin:'http://localhost:11451'}},timers=new Map(),requests=[],stops=[],handlers=new Map();
 const saved=structuredClone(settings),originalFetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body),signal:init.signal});return options.upstream?options.upstream(init):stream(wire(options.data||gemini));};
 host.fetch=originalFetch;
 const events={CHAT_COMPLETION_SETTINGS_READY:'settings',CHAT_CHANGED:'chat',CHATCOMPLETION_MODEL_CHANGED:'model',CHATCOMPLETION_SOURCE_CHANGED:'source',GENERATION_STOPPED:'stop',GENERATION_ENDED:'end',MESSAGE_RECEIVED:'message'};
 const env={host,context:()=>({chat,chatCompletionSettings:settings}),stamp:()=>({epoch}),validStamp:s=>s.epoch===epoch,
   pipeline:kamiResponsePipeline(host),transport:createKamiResponseTransport(),
   setTimeout(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
   canRun:()=>options.canRun!==false,stopRaw:id=>stops.push(id),saveNotice(){},
   raw:async(request,selection,guard)=>{
     if(options.queued)await options.queued;
     guard();eq(request.should_silence,true,'Diagnostic is silent');eq(request.should_stream,false,'Helper keeps a JSON response contract');
     const data={type:'normal',stream:false,messages:request.ordered_prompts.concat([{role:'system',content:'PRIVATE_PRESET_OR_LATE_PLUGIN'}]),tools:[{name:'relay_reply'}],tool_choice:'required',max_tokens:65535,reasoning_effort:'max',stop:['\n'],json_schema:{value:{}},chat_completion_source:settings.chat_completion_source,model:settings.google_model};
     await service.beforeSend(data);
     const response=await host.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(data)});
     const json=await response.json();eq(typeof json.choices[0].message.content,'string','Streaming wire is adapted for Helper JSON reader');
     return json.choices[0].message.content;
   },
   pure,providers:{list:providers.webSearchProviders,get:providers.webSearchProvider,endpoint:providers.webSearchEndpoint,request:providers.webSearchRequest,rows:providers.webSearchRows},
   readVariables:()=>({'kami-web-search':{enabled:true,mode:'native'}}),writeVariables(){throw Error('Diagnostic must not save search settings');},
   on(event,fn){if(event)handlers.set(event,fn);return{stop(){handlers.delete(event);}};},events,count:async()=>0,
   createMessages(){throw Error('Diagnostic must not create a floor');},writeMessages(){throw Error('Diagnostic must not edit a floor');}
 };
 env.nativeProbe=createKamiNativeSearchProbe(env);
 const service=createKamiSearchService(env);
 return{env,service,probe:env.nativeProbe,host,originalFetch,requests,stops,timers,saved,settings,chat,async emit(event){await handlers.get(event)?.();},changeChat(){epoch++;chat=[];}};
}
{
 const f=fixture(),result=await f.probe.run();
 eq(result.state,'verified','Full independent request verifies metadata');
 eq(f.requests.length,1,'Exactly one model generation request');
 const body=f.requests[0].body;
 eq(body.stream,true,'Upstream uses streaming to preserve Gemini metadata');
 eq(body.enable_web_search,true,'Native search is enabled');
 eq(body.messages.length,2,'No preset/role/history injected');
 ok(!JSON.stringify(body).includes('PRIVATE_'),'No story or preset bytes reach the wire');
 eq(body.tools,undefined,'No body or dummy functions conflict with native search');
 eq(body.tool_choice,undefined,'Native search is not disabled by tool choice');
 eq(body.json_schema,undefined,'No inherited structured-output format');
 eq(body.max_tokens,2048,'Does not inherit huge story output budget');
 eq(body.reasoning_effort,'low','Does not inherit highest thinking effort');
 eq(body.stop,[],'Story stop strings do not truncate the diagnostic');
 eq(f.settings,f.saved,'Connection settings unchanged');
 eq(f.chat,[{is_user:true,mes:'PRIVATE_STORY'}],'Chat unchanged');
 eq(f.env.pipeline.size(),0,'Probe hook removed');
 eq(f.host.fetch,f.originalFetch,'Original fetch restored');
 eq(f.timers.size,0,'Deadline removed');
 f.service.shutdown();
}
for(const data of [claude,router,{choices:[{finish_reason:'stop',message:{content:'我已搜索'}}]}, {candidates:[{finishReason:'STOP',groundingMetadata:{webSearchQueries:['one']}}]},{type:'error',error:{message:'bad'}}]){
 const f=fixture({data}),result=await f.probe.run();eq(result.state,createKamiNativeSearchEvidenceResult(data),'Controller classification matches provider evidence');f.service.shutdown();
}
function createKamiNativeSearchEvidenceResult(data){const e=createKamiNativeSearchEvidence();e.consume(data);return e.result().state;}
for(const upstream of [
 ()=>new Response('denied',{status:429}),
 ()=>stream('data: {"candidates": []}\n\n'),
 ()=>new Response('not-json'),
 ()=>{throw Error('SECRET_OR_PRIVATE_PROVIDER_BODY');}
]){
 const f=fixture({upstream}),result=await f.probe.run();eq(result.state,'failed','Transport failure never becomes verified');ok(!JSON.stringify(result).includes('SECRET_OR_PRIVATE'),'Private error bodies not exposed');f.service.shutdown();
}
{
 const f=fixture({canRun:false});eq((await f.probe.run()).state,'failed','Busy generation refuses another call');eq(f.requests.length,0,'No request while busy');f.service.shutdown();
}
for(const action of ['cancel','timeout','model','source','chat','shutdown']){
 let release;const f=fixture({upstream:()=>new Promise(r=>release=r)}),task=f.probe.run();await tick();ok(f.requests.length===1,'Started pending test');
 if(action==='cancel')f.probe.cancel('用户中断');
 if(action==='timeout')[...f.timers.values()][0]();
 if(action==='model'){f.settings.google_model='changed';await f.emit('model');}
 if(action==='source'){f.settings.chat_completion_source='claude';await f.emit('source');}
 if(action==='chat'){f.changeChat();await f.emit('chat');}
 if(action==='shutdown')f.service.shutdown();
 await task;
 ok(f.requests[0].signal.aborted,'Abort propagated for '+action);
 ok(f.stops.length>0,'Helper generation cancelled for '+action);
 eq(f.env.pipeline.size(),0,'Hook cleaned for '+action);
 release(stream(wire(gemini)));await tick();
 ok(f.probe.status().state!=='verified','Late evidence ignored for '+action);
 eq(f.timers.size,0,'Timer cleaned for '+action);
 f.service.shutdown();
}
{
 let resume;const queued=new Promise(r=>resume=r),f=fixture({queued}),task=f.probe.run();await tick();
 f.probe.cancel('cancel queued');await task;resume();await tick();eq(f.requests.length,0,'Cancelled queued Helper call is rejected before sending');f.service.shutdown();
}
{
 const f=fixture();await f.probe.run();f.settings.google_model='another';await f.emit('model');
 eq(f.probe.status().phase,'idle','Connection change invalidates cached success');eq(f.probe.status().sources,[],'Old evidence cleared');f.service.shutdown();
}

/* A dormant pipeline must survive complete toolbox shutdown and a new measurement wrapper. */
{
 const host={location:{href:'http://localhost/',origin:'http://localhost'}},url='/api/backends/chat-completions/generate';
 let upstream=0,handled=0;
 const native=async()=>{upstream++;return new Response('{}');};
 function measure(base){return function(){return base.apply(this,arguments);};}
 host.fetch=measure(native);
 const old=kamiResponsePipeline(host);
 let off=old.register('first',0,async next=>{handled++;return next();});
 await host.fetch(url);off();host.fetch=native;host.fetch=measure(native);
 const fresh=kamiResponsePipeline(host);
 ok(fresh!==old,'Reload builds a new idle closure when measurement fetch changed');
 off=fresh.register('second',0,async next=>{handled++;return next();});
 await host.fetch(url);off();
 eq(handled,2,'Handler still runs after toolbox shutdown and reload');
 eq(upstream,2,'Each reloaded request reaches upstream exactly once');
 /* External wrappers may retain an inactive hooked function; never rebind its base to itself. */
 off=fresh.register('third',0,async next=>{handled++;return next();});
 const retained=host.fetch;host.fetch=measure(retained);off();
 const wrapped=kamiResponsePipeline(host);
 off=wrapped.register('fourth',0,async next=>{handled++;return next();});
 await host.fetch(url);off();
 eq(handled,3,'A wrapper retaining an inactive hook does not recurse or duplicate handlers');
 eq(upstream,3,'Retained inactive hook forwards once');
}

{
 const f=fixture(),context=f.env.context;
 f.env.context=()=>({...context(),mainApi:'textgenerationwebui'});
 eq((await f.probe.run()).state,'failed','Non-chat-completion API rejected before calling');
 eq(f.requests.length,0,'Unsupported main API sends no diagnostic request');
 f.service.shutdown();
}
{
 const f=fixture();let factories=0;
 f.env.pipeline=()=>{factories++;return kamiResponsePipeline(f.host);};
 await f.probe.run();
 const previous=f.host.fetch;f.host.fetch=function(){return previous.apply(this,arguments);};
 eq((await f.probe.run()).state,'verified','Probe reacquires shared pipeline after fetch wrapper changes');
 eq(factories,2,'Each test acquires the current shared pipeline');
 f.service.shutdown();
}
console.log('✓ Native search diagnostic: '+checks+' passed');
