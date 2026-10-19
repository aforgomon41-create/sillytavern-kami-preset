export function installNativeSearchFixture(host,st){
 const fixture={mode:'success',calls:[],stops:[],writes:[]},base=host.fetch;
 host.fetch=async function(input,init){
  const url=String(input);
  if(url==='/csrf-token')return new Response(JSON.stringify({token:'TEST_CSRF'}));
  if(url==='/api/backends/chat-completions/generate'){
   const body=JSON.parse(init.body);fixture.calls.push(body);
   if(fixture.mode==='block')return new Promise((resolve,reject)=>{fixture.release=()=>resolve(response());init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
   await new Promise(r=>setTimeout(r,40));
   if(fixture.mode==='http')return new Response('fixture',{status:429});
   return response();
  }
  return base.apply(this,arguments);
 };
 function response(){
  let value=fixture.mode==='error'?{type:'error',error:{message:'fixture'}}:fixture.mode==='unverified'?{choices:[{finish_reason:'stop',message:{content:'声称已搜索 https://example.org'}}]}:
    {candidates:[{finishReason:'STOP',groundingMetadata:{webSearchQueries:['Mozilla latest blog'],groundingChunks:fixture.mode==='empty'?[]:[{web:{uri:'https://blog.mozilla.org/fixture',title:'Mozilla 官方资料'}}]}}]};
  return new Response('data: '+JSON.stringify(value)+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }
 fixture.installWorker=function(worker,emit){
  worker.tavern_events=Object.fromEntries(['CHAT_COMPLETION_SETTINGS_READY','CHAT_CHANGED','CHATCOMPLETION_MODEL_CHANGED','CHATCOMPLETION_SOURCE_CHANGED','GENERATION_STOPPED','GENERATION_ENDED','MESSAGE_RECEIVED','OAI_PRESET_CHANGED_AFTER'].map(x=>[x,x.toLowerCase()]));
  fixture.emit=emit;
  worker.generateRaw=async request=>{
   const s=st.getContext().chatCompletionSettings;
   const data={type:'normal',stream:false,max_tokens:65535,reasoning_effort:'max',messages:request.ordered_prompts.concat([{role:'system',content:'PRIVATE_PRESET'}]),chat_completion_source:s.chat_completion_source,model:s.google_model||s.model};
   await emit(worker.tavern_events.CHAT_COMPLETION_SETTINGS_READY,data);
   const response=await host.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(data)});
   const json=await response.json();
   await emit(worker.tavern_events.GENERATION_ENDED);
   return json.choices[0].message.content;
  };
  worker.stopGenerationById=id=>fixture.stops.push(id);
  worker.createChatMessages=async rows=>fixture.writes.push(rows);
  worker.setChatMessages=async rows=>fixture.writes.push(rows);
 };
 st.getContext().chatCompletionSettings.chat_completion_source='makersuite';
 st.getContext().chatCompletionSettings.google_model='fixture-gemini';
 host.__nativeProbeFixture=fixture;
}
