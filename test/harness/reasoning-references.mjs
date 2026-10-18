import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createReasoningReferenceStream, protectReasoningReferences } from '../../src/scripts/_reasoning-references.js';
import { createKamiResponseTransport } from '../../src/scripts/_response-transport.js';
import { createTagReferenceResponse } from '../../src/scripts/_tag-response.js';
import { kamiResponsePipeline } from '../../src/scripts/_response-pipeline.js';
import { repairTags, TAG_SPECS, describeFix } from '../../src/scripts/_tags-pure.js';
import { expandPanelGestures } from '../../build/kami-doc.mjs';

let checks=0;
function eq(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;}
const body='<out_body><content>真实正文</content><options>真正选项</options></out_body>';
const fixtures=[
 ['<nyaruko_think>引用<content>、<状态栏>以及</summary>。</nyaruko_think>'+body,'<nyaruko_think>引用＜content＞、＜状态栏＞以及＜/summary＞。</nyaruko_think>'+body],
 ['<think><content>完整示例</content><my-tag a="x>y"/></think>'+body,'<think>＜content＞完整示例＜/content＞＜my-tag a="x＞y"/＞</think>'+body],
 ['<nyaruko_think>写在`</nyaruko_think>`之前，引用“</nyaruko_think>”。</nyaruko_think>'+body,'<nyaruko_think>写在`＜/nyaruko_think＞`之前，引用“＜/nyaruko_think＞”。</nyaruko_think>'+body],
 ['<nyaruko_think>\n```xml\n<nyaruko_think><content>示例</content></nyaruko_think>\n```\n真正结尾\n</nyaruko_think>\n'+body,'<nyaruko_think>\n```xml\n＜nyaruko_think＞＜content＞示例＜/content＞＜/nyaruko_think＞\n```\n真正结尾\n</nyaruko_think>\n'+body],
 ['<nyaruko_think>引用<medium>并未关闭，不应遮蔽真正正文。</nyaruko_think>'+body,'<nyaruko_think>引用＜medium＞并未关闭，不应遮蔽真正正文。</nyaruko_think>'+body],
 ['<nyaruko_think>引用<content\n a="x">以及<未完成\n</nyaruko_think>'+body,'<nyaruko_think>引用＜content\n a="x"＞以及＜未完成\n</nyaruko_think>'+body],
 ['<nyaruko_think>先想\n<out_body>\n<content>真正正文</content></out_body>','<nyaruko_think>先想\n<out_body>\n<content>真正正文</content></out_body>'],
 ['<content>正文\n```xml\n<nyaruko_think><x></nyaruko_think>\n```\n</content>','<content>正文\n```xml\n<nyaruko_think><x></nyaruko_think>\n```\n</content>'],
 ['<medium>\n<nyaruko_think><div>美化</div></nyaruko_think>\n</medium>','<medium>\n<nyaruko_think><div>美化</div></nyaruko_think>\n</medium>'],
 ['普通文字`<nyaruko_think><content></nyaruko_think>`，还有比较 1 < 2 与结尾<','普通文字`<nyaruko_think><content></nyaruko_think>`，还有比较 1 < 2 与结尾<'],
 ['<think>it\'s a <content> reference</think>'+body,'<think>it\'s a ＜content＞ reference</think>'+body],
 ['<nyaruko_think>第一段<x></nyaruko_think>'+body+'\n<think>第二段<y></think>','<nyaruko_think>第一段＜x＞</nyaruko_think>'+body+'\n<think>第二段＜y＞</think>'],
 ['<nyaruko_think><!-- </nyaruko_think>引用 -->真正思维</nyaruko_think>'+body,'<nyaruko_think>＜!-- ＜/nyaruko_think＞引用 --＞真正思维</nyaruko_think>'+body],
 ['<!-- <nyaruko_think><content></nyaruko_think> -->'+body,'<!-- <nyaruko_think><content></nyaruko_think> -->'+body],
 ['<think>\n````\n```\n</think>\n````\n</think>'+body,'<think>\n````\n```\n＜/think＞\n````\n</think>'+body],
 ['<out_body>\n<content>提到\n<think>内心标签\n</content><options>选项</options></out_body>','<out_body>\n<content>提到\n<think>内心标签\n</content><options>选项</options></out_body>'],
 ['<content>\n<think/>是自闭合\n</content>','<content>\n<think/>是自闭合\n</content>'],
 ['<nyaruko_think>\n<out_body><content>示例</content></out_body>\n后续思维\n</nyaruko_think>'+body,'<nyaruko_think>\n＜out_body＞＜content＞示例＜/content＞＜/out_body＞\n后续思维\n</nyaruko_think>'+body],
 ['<think>引用“多行\n</think>\n继续引用”\n<content>示例</content>\n</think>'+body,'<think>引用“多行\n＜/think＞\n继续引用”\n＜content＞示例＜/content＞\n</think>'+body],
 ['<think><n>奈亚子</n>会引用`<n>示例</n>`和<content>。</think>'+body,'<think><n>奈亚子</n>会引用`＜n＞示例＜/n＞`和＜content＞。</think>'+body],
 ['<think>推理 <out_body><content>正文</content></out_body>','<think>推理 <out_body><content>正文</content></out_body>'],
 ['<think>示例：<think>内层</think>续写 <content>思维正文</content></think>'+body,'<think>示例：＜think＞内层＜/think＞续写 ＜content＞思维正文＜/content＞</think>'+body],
 ['<think>引用未闭合的<think>写法。</think>'+body,'<think>引用未闭合的＜think＞写法。</think>'+body],
 ['<think>引用</think>作为字面说明；<content>示例</content>。</think>'+body,'<think>引用＜/think＞作为字面说明；＜content＞示例＜/content＞。</think>'+body],
 ['好的，<nyaruko_think>引用<content>。</nyaruko_think>'+body,'好的，<nyaruko_think>引用＜content＞。</nyaruko_think>'+body]
];
for(const [source,expected] of fixtures){
 eq(protectReasoningReferences(source).text,expected,'整包引用保护');
 for(let split=0;split<=source.length;split++){
  const stream=createReasoningReferenceStream();
  eq(stream.push(source.slice(0,split))+stream.push(source.slice(split))+stream.finish(),expected,'任意双分片');
 }
 const stream=createReasoningReferenceStream();eq([...source].map(x=>stream.push(x)).join('')+stream.finish(),expected,'逐字符流');
 eq(protectReasoningReferences(expected).text,expected,'重复处理幂等');
}
const safe=protectReasoningReferences(fixtures[0][0]).text;
eq([...safe.matchAll(/<content>([\s\S]*?)<\/content>/g)].map(x=>x[1]),['真实正文'],'角色卡/正文正则只命中真实正文');
eq([...safe.matchAll(/<状态栏>[\s\S]*?<\/状态栏>/g)],[],'未知角色卡标签不会跨思维链匹配');
eq(/<nyaruko_think>([\s\S]*?)<\/nyaruko_think>/.exec(protectReasoningReferences(fixtures[2][0]).text)[1],'写在`＜/nyaruko_think＞`之前，引用“＜/nyaruko_think＞”。','同名结束引用不提前结束提取');
eq(protectReasoningReferences('<think>只想<content>但没有结尾').stats.incomplete,true,'缺外层边界报告');
const massive='<nyaruko_think>'+('字'.repeat(100000))+'<'+('x'.repeat(12000))+'</nyaruko_think>'+body;
const start=performance.now();const large=protectReasoningReferences(massive);assert(performance.now()-start<2000,'长消息不能跨引用反复回扫');checks++;
eq(large.text.endsWith(body),true,'超长引用有限缓冲且不破坏真实正文');

/* 真正后置入口的组合规则，不复制实现。 */
const panel=fs.readFileSync('src/scripts/40-预设设置.js','utf8');
const begin=panel.indexOf('  function tagFixText('),end=panel.indexOf('\n  /* 「收到消息」',begin);
const context=vm.createContext({tagFixMode:'close',tagFixAll:true,tagFixSpecs:()=>TAG_SPECS,protectReasoningReferences,repairTags,log:()=>{}});
vm.runInContext(panel.slice(begin,end),context);
eq(context.tagFixText(fixtures[0][0],'off'),null,'关闭档完全不干预');
for(const mode of ['close','del']){
 const fixed=context.tagFixText(fixtures[0][0],mode);eq(fixed.text,fixtures[0][1],'两档共用保护');eq(describeFix(fixed).includes('保护'),true,'报告保护引用');
}
eq(context.tagFixText('<nyaruko_think>引用<x></nyaruko_think><content>缺结束','close').text,'<nyaruko_think>引用＜x＞</nyaruko_think><content></content>缺结束','正文仍保持紧贴自身补全');
eq(context.tagFixText('<think>缺结束','close'),null,'边界缺失不补空思维壳');
eq(context.tagFixText('<think>推理 <out_body><content>正文</content></out_body>','close'),null,'缺外层结束时不写回损坏正文');
const limited='<think>'+('x'.repeat(524300))+'<content>body</content>';
eq(protectReasoningReferences(limited).text,limited,'缓冲超限保留原文');
eq(protectReasoningReferences(limited).stats.bufferLimited,true,'缓冲上限报告');

function response(text,type='application/json',width=7){
 const bytes=new TextEncoder().encode(text);let at=0;
 return new Response(new ReadableStream({pull(c){if(at>=bytes.length){c.close();return;}c.enqueue(bytes.slice(at,at+=width));}}),{headers:{'content-type':type,'x-kept':'yes'}});
}
const transport=createKamiResponseTransport(),reports=[];
const rewrite=createTagReferenceResponse(transport,createReasoningReferenceStream,x=>reports.push(x));
for(const value of [
 {choices:[{index:0,message:{content:fixtures[0][0],tool_calls:[{function:{arguments:'{"content":"<original>"}'}}]},finish_reason:'stop'}]},
 {candidates:[{content:{parts:[{thought:true,text:'<think><native></think>',thoughtSignature:'opaque'},{text:fixtures[0][0]}]},finishReason:'STOP'}]},
 {content:[{type:'thinking',thinking:'<think><native></think>',signature:'opaque'},{type:'text',text:fixtures[0][0]}]},
 {results:[{text:fixtures[0][0]}]}
]){
 const expected=JSON.parse(JSON.stringify(value).replace(JSON.stringify(fixtures[0][0]).slice(1,-1),JSON.stringify(fixtures[0][1]).slice(1,-1)));
 const result=await rewrite(response(JSON.stringify(value)));eq(await result.json(),expected,'整包协议只修改普通文本');eq(result.headers.get('x-kept'),'yes','保留响应头');
}
const events=[];
for(let i=0;i<fixtures[0][0].length;i+=3){events.push({choices:[{index:0,delta:{content:fixtures[0][0].slice(i,i+3)}}]});}
events.push({choices:[{index:0,delta:{tool_calls:[{function:{arguments:'<content>保留参数</content>'}}],reasoning_content:'<native>',signature:'keep'},finish_reason:'stop'}]});
const sse=events.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n';
const parsed=(await(await rewrite(response(sse,'text/event-stream',1))).text()).split(/\r?\n/).filter(x=>x.startsWith('data: ')).map(x=>x.slice(6));
eq(parsed.pop(),'[DONE]','DONE最后发送');
const packets=parsed.map(x=>JSON.parse(x));
eq(packets.map(x=>x.choices?.[0]?.delta?.content||'').join(''),fixtures[0][1],'SSE逐字节UTF-8与跨delta标签');
eq(packets.at(-1).choices[0].delta.tool_calls,events.at(-1).choices[0].delta.tool_calls,'工具调用参数不改');
eq(packets.at(-1).choices[0].delta.reasoning_content,'<native>','原生推理字段不改');
eq(packets.at(-1).choices[0].delta.signature,'keep','签名不改');
const array=events.map(x=>({candidates:[{index:0,content:{parts:[{text:x.choices[0].delta.content||''}]}}]}));
const arrayText=await(await rewrite(response(JSON.stringify(array),'application/json',2))).text();
eq(arrayText.split('\n').filter(x=>x.startsWith('data: {')).map(x=>JSON.parse(x.slice(6)).candidates[0].content.parts.map(p=>p.text||'').join('')).join(''),fixtures[0][1],'Gemini数组流复用传输层');
const unfinished='data: '+JSON.stringify({choices:[{delta:{content:'<think>引用<unfinished'}}]})+'\n\ndata: [DONE]\n\n';
const flushed=await(await rewrite(response(unfinished,'text/event-stream'))).text();
eq(flushed.split('\n').filter(x=>x.startsWith('data: {')).map(x=>JSON.parse(x.slice(6)).choices?.[0]?.delta?.content||'').join(''),'<think>引用<unfinished','缺外层结束的原文在DONE前清空');
eq(reports.at(-1).incomplete,true,'不完整边界报告');
let cancelled=false;
const endless=new Response(new ReadableStream({pull(c){c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"文本"}}]}\n\n'));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
const reader=(await rewrite(endless)).body.getReader();await reader.read();await reader.cancel();await new Promise(r=>setTimeout(r,10));eq(cancelled,true,'取消向上游传递');
const failure=new Response('error',{status:500});eq(await rewrite(failure),failure,'错误响应不读取');

const original=async function(input,init){return {input,init,text:'model'};};
const host={fetch:original,location:new URL('http://localhost:11451/')};let sequence=[];
const pipe=kamiResponsePipeline(host);
const stopSafe=pipe.register('safe',20,async(next,ctx,args)=>{const r=await next(args);sequence.push('safe');r.text+=':safe';return r;});
const stopAnti=pipe.register('anti',10,async(next,ctx,args)=>{const r=await next(args);sequence.push('anti');r.text+=':anti';return r;});
eq((await host.fetch('/api/backends/chat-completions/generate',{body:'unaltered'})).text,'model:anti:safe','顺序独立于注册先后');
eq(sequence,['anti','safe'],'响应先反截断再保护');
sequence=[];await host.fetch('https://other.test/api/backends/chat-completions/generate');await host.fetch('/api/secrets/read');eq(sequence,[],'外站和其他请求旁路');
stopAnti();eq((await host.fetch('/api/backends/chat-completions/generate')).text,'model:safe','关闭20后40继续工作');stopSafe();eq(host.fetch,original,'最后订阅注销后还原fetch');
const stopOld=pipe.register('same',20,async next=>next()),stopNew=pipe.register('same',20,async next=>next());stopOld();eq(pipe.size(),1,'旧实例不移除新实例');
const current=host.fetch,external=function(...args){return current.apply(this,args)};host.fetch=external;stopNew();eq(host.fetch,external,'不覆盖其他fetch补丁');
eq((await host.fetch('/api/backends/chat-completions/generate')).text,'model','上层其他补丁保留且旧管线透明');

/* 实际20号协议还原器与40号适配器组合，避免只验证虚拟中间件。 */
for(const streaming of [false,true]){
 let toolUsed=false;
 const wireHost={location:new URL('http://localhost:11451/'),fetch:async(input,init)=>{
  const req=JSON.parse(init.body),tool=req.tools?.at(-1)?.function?.name;toolUsed=!!tool;
  if(!tool)return response(JSON.stringify({choices:[{message:{content:fixtures[0][0]}}]}));
  const args=JSON.stringify({content:fixtures[0][0]});
  if(!streaming)return response(JSON.stringify({choices:[{index:0,message:{content:'',tool_calls:[{id:'test',type:'function',function:{name:tool,arguments:args}}]},finish_reason:'tool_calls'}]}));
  const chunks=[];for(let i=0;i<args.length;i+=5)chunks.push({choices:[{index:0,delta:{tool_calls:[{index:0,id:'test',type:'function',function:{name:i===0?tool:undefined,arguments:args.slice(i,i+5)}}]},finish_reason:null}]});
  chunks.push({choices:[{index:0,delta:{},finish_reason:'tool_calls'}]});
  return response(chunks.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n','text/event-stream',3);
 }};
 let anti=expandPanelGestures(process.cwd(),fs.readFileSync('src/scripts/20-反截断.js','utf8'));
 const stop=anti.indexOf('  const relay = new Relay();');assert(stop>0);
 anti=anti.slice(0,stop)+'globalThis.__antiRelay=Relay;})();';
 const sandbox=vm.createContext({window:{parent:wireHost},console:{log(){},warn(){},error(){}},URL,Map,Set,Request,Response,Headers,ReadableStream,TransformStream,TextEncoder,TextDecoder,crypto:globalThis.crypto});
 vm.runInContext(anti,sandbox);
 const relay=new sandbox.__antiRelay();
 const release=kamiResponsePipeline(wireHost).register('tag',20,async(next,ctx,args)=>rewrite(await next(args)));
 relay.install();
 const result=await wireHost.fetch('/api/backends/chat-completions/generate',{body:JSON.stringify({messages:[{role:'user',content:'test'}],stream:streaming})});
 let text;
 if(streaming){const raw=await result.text();text=raw.split('\n').filter(x=>x.startsWith('data: {')).map(x=>JSON.parse(x.slice(6)).choices?.[0]?.delta?.content||'').join('');}
 else text=(await result.json()).choices[0].message.content;
 eq(text,fixtures[0][1],'实际反截断还原后才保护引用：'+streaming);eq(toolUsed,true,'20保持工具请求改造');
 relay.dispose();
 const normal=await wireHost.fetch('/api/backends/chat-completions/generate',{body:JSON.stringify({messages:[{role:'user',content:'test'}]})});
 eq((await normal.json()).choices[0].message.content,fixtures[0][1],'卸载20后保护独立继续工作');eq(toolUsed,false,'卸载20后不再改造请求');release();
}
console.log('思维链引用与响应管线：'+checks+' 项通过');
