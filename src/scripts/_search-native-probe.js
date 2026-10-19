/* Native search diagnostic. Only provider-side structured evidence counts as execution. */
export function createKamiNativeSearchEvidence() {
  var queries=new Set(),calls=new Set(),results=new Set(),sources=new Map(),usage=0,error='',finished=false;
  function source(item){if(!item)return;var raw=item.url||item.uri;try{var url=new URL(raw);if(!/^https?:$/.test(url.protocol)||url.username||url.password)return;if(sources.size<8)sources.set(url.href,{url:url.href,title:String(item.title||url.hostname).slice(0,160)});}catch(e){}}
  function block(item){
    if(!item||typeof item!=='object')return;
    if(item.type==='server_tool_use'&&item.name==='web_search'&&typeof item.id==='string')calls.add(item.id);
    if(item.type==='web_search_tool_result'){
      var content=item.content;
      if(content&&content.type==='web_search_tool_result_error')error=String(content.error_code||'search_tool_error').slice(0,80);
      else if(Array.isArray(content)){results.add(item.tool_use_id||'result');content.forEach(function(row){if(row.type==='web_search_result')source(row);});}
    }
    (Array.isArray(item.citations)?item.citations:[]).forEach(function(row){if(row.type==='web_search_result_location')source(row);});
  }
  function consume(value){
    if(!value||typeof value!=='object')return;
    if(value.error||value.type==='error')error='provider_error';
    if(value.type==='message_stop')finished=true;
    var u=value.usage||(value.message&&value.message.usage),count=u&&u.server_tool_use&&Number(u.server_tool_use.web_search_requests);
    if(Number.isFinite(count)&&count>usage)usage=count;
    (Array.isArray(value.candidates)?value.candidates:[]).forEach(function(candidate){
      if(candidate.finishReason)finished=true;
      var data=candidate.groundingMetadata;
      if(!data)return;
      (Array.isArray(data.webSearchQueries)?data.webSearchQueries:[]).forEach(function(query){if(typeof query==='string'&&query.trim())queries.add(query.trim());});
      (Array.isArray(data.groundingChunks)?data.groundingChunks:[]).forEach(function(chunk){if(chunk.web)source(chunk.web);});
    });
    if(value.type==='content_block_start')block(value.content_block);
    if(value.type==='content_block_delta'&&value.delta&&value.delta.citation)source(value.delta.citation);
    (Array.isArray(value.content)?value.content:[]).forEach(block);
    (Array.isArray(value.choices)?value.choices:[]).forEach(function(choice){
      if(choice.finish_reason)finished=true;
      var message=choice.message||choice.delta||{};
      (Array.isArray(message.annotations)?message.annotations:[]).forEach(function(row){if(row.type==='url_citation')source(row.url_citation);});
    });
  }
  function result(){
    var completed=Array.from(results).some(function(id){return calls.has(id);});
    var executed=queries.size>0||usage>0||completed;
    var count=Math.max(queries.size,usage,completed?results.size:0);
    var state=error?'failed':executed?(sources.size?'verified':'empty'):'unverified';
    return {state:state,queries:count,sources:Array.from(sources.values()),error:error,finished:finished,
      message:error?'测试失败：搜索接口或工具返回错误':state==='verified'?'已验证搜索成功':state==='empty'?'已执行搜索，未返回可核实资料':'无法验证：接口未返回搜索执行记录'};
  }
  return {consume:consume,result:result};
}

export function createKamiNativeSearchProbe(env) {
  var active=null,disposed=false,sequence=0,listeners=[],offView=null;
  var identity=key(),state={phase:'idle',running:false,message:'尚未测试当前连接',sources:[],queries:0};
  var marker='__kami_native_probe_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'_';
  var setTimer=env.setTimeout||setTimeout,clearTimer=env.clearTimeout||clearTimeout;
  function key(){
    var ctx=env.context()||{},s=ctx.chatCompletionSettings||{},fields={};
    Object.keys(s).sort().forEach(function(name){if(/_model$/.test(name)||['model','chat_completion_source','reverse_proxy','custom_url','secret_id','proxy_password','enable_web_search'].indexOf(name)>=0||/^vertexai_/.test(name))fields[name]=s[name];});
    return JSON.stringify([ctx.mainApi||ctx.main_api||'',fields]);
  }
  function snapshot(){var out=Object.assign({},state);out.sources=(state.sources||[]).map(function(row){return Object.assign({},row);});return out;}
  function publish(next){state=Object.assign({},state,next);listeners.slice().forEach(function(fn){try{fn(snapshot());}catch(e){}});if(env.saveNotice)env.saveNotice();}
  function abortError(reason){var error=new Error(reason||'测试已中断');error.name='AbortError';return error;}
  function live(job){return !!job&&!disposed&&active===job&&!job.cancelled&&job.key===key()&&(!env.validStamp||env.validStamp(job.stamp));}
  function check(job){if(!live(job))throw abortError('连接或聊天已变化，测试已取消');}
  function cancel(reason){
    var job=active;if(!job)return;
    active=null;job.cancelled=true;job.controller.abort();
    try{env.stopRaw(job.id);}catch(e){}
    job.reject(abortError(reason));
    if(job.off)job.off();if(job.timer)clearTimer(job.timer);
    publish({phase:'cancelled',state:'cancelled',running:false,message:reason||'测试已中断',sources:[],queries:0});
  }
  function refresh(){
    if(disposed)return;
    var current=key();if(current===identity)return;
    identity=current;cancel('连接已变化，测试已中断');
    publish({phase:'idle',state:'idle',running:false,message:'连接已变化，请重新测试',sources:[],queries:0});
  }
  function marked(data){return data&&Array.isArray(data.messages)&&data.messages.some(function(row){return row&&row.role==='system'&&typeof row.content==='string'&&row.content.indexOf(marker)>=0;});}
  function prepare(data){
    if(!marked(data))return false;
    var job=active;check(job);
    if(!data.messages.some(function(row){return row.content===job.prompts[0].content;}))throw abortError('测试请求已失效');
    data.messages=job.prompts.map(function(row){return Object.assign({},row);});
    data._kami_background_task='web_search';data._kami_native_probe=job.id;
    data.enable_web_search=true;data.max_tokens=2048;data.reasoning_effort='low';data.stop=[];
    delete data.tools;delete data.tool_choice;delete data.json_schema;delete data.response_format;
    return true;
  }
  async function run(){
    refresh();
    if(disposed||active)return snapshot();
    var ctx=env.context()||{},mainApi=ctx.mainApi||ctx.main_api;
    if(mainApi&&mainApi!=='openai'){publish({phase:'failed',state:'failed',running:false,message:'请切换到聊天补全连接后再测试',sources:[],queries:0});return snapshot();}
    if(env.canRun&&!env.canRun()){publish({phase:'failed',state:'failed',message:'请等待当前生成或压缩完成后再测试',running:false,sources:[],queries:0});return snapshot();}
    var job={id:'kami-native-probe-'+Date.now()+'-'+(++sequence),key:key(),stamp:env.stamp?env.stamp():null,controller:new (env.host.AbortController||AbortController)(),cancelled:false};
    var prompts=[{role:'system',content:marker+sequence+'\n这是一次独立联网能力测试。仅执行以下公开信息查询，不续写剧情、不输出任何预设标签。请实际使用网络搜索一次；如无搜索能力如实说明，不能编造检索。只返回简短的标题、发布日期和来源链接。'},
      {role:'user',content:'当前日期为'+new Date().toISOString().slice(0,10)+'。请联网查找 Mozilla 官方博客最近发布的一篇文章，返回标题、发布日期和原始链接；不要只凭记忆回答。'}];
    job.prompts=prompts;
    var cancellation=new Promise(function(_,reject){job.reject=reject;});cancellation.catch(function(){});
    active=job;identity=job.key;publish({phase:'request',state:'running',running:true,message:'正在发送独立测试请求…',sources:[],queries:0,testedAt:null});
    job.timer=setTimer(function(){if(active===job)cancel('测试超时，已中断；请稍后重试');},env.timeoutMs||120000);
    var responsePipeline=typeof env.pipeline==='function'?env.pipeline():env.pipeline;
    job.off=responsePipeline.register(job.id,0,async function(next,context,args){
      var body;try{body=JSON.parse(args[1]&&args[1].body||'{}');}catch(e){return next(args);}
      if(body._kami_native_probe!==job.id)return next(args);
      check(job);prepare(body);
      body.stream=true;
      var forwarded=[args[0],Object.assign({},args[1],{body:JSON.stringify(body),signal:job.controller.signal})];
      var response=await next(forwarded);check(job);
      if(!response.ok){try{if(response.body)await response.body.cancel();}catch(e){}throw Error('HTTP '+response.status);}
      publish({phase:'inspect',message:'正在核对接口返回的搜索记录…'});
      var evidence=createKamiNativeSearchEvidence(),transport=env.transport;
      var info=await transport.readEvents(response,evidence.consume,{signal:job.controller.signal,maxBytes:1048576});
      check(job);job.result=evidence.result();
      if(info.format==='sse'&&!job.result.finished&&!info.ended&&job.result.state!=='failed')throw Error('incomplete_stream');
      return new (env.host.Response||Response)(JSON.stringify({choices:[{message:{role:'assistant',content:'原生搜索能力测试完成。'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
    });
    try{
      var request={generation_id:job.id,should_silence:true,should_stream:false,ordered_prompts:prompts};
      await Promise.race([env.raw(request,'',function(){check(job);}),cancellation]);
      check(job);
      var result=job.result||{state:'unverified',queries:0,sources:[],message:'无法验证：当前环境未暴露原始搜索响应'};
      publish(Object.assign({},result,{phase:result.state,running:false,testedAt:new Date().toISOString()}));
    }catch(error){
      if(active===job&&!job.cancelled){
        if(!live(job)){cancel('连接或聊天已变化，测试已取消');}
        else{var message=/^HTTP \d{3}$/.test(error.message)?'测试失败：接口返回 '+error.message:error.message==='incomplete_stream'?'测试失败：响应提前结束，未完成核验':'测试失败：请求、响应格式或搜索工具异常';publish({phase:'failed',state:'failed',running:false,message:message,sources:[],queries:0});}
      }
    }finally{if(job.off)job.off();if(job.timer)clearTimer(job.timer);if(active===job)active=null;}
    return snapshot();
  }
  function mount(container,canStart){
    if(offView){offView();offView=null;}
    var ui=env.components,make=env.make;
    if(!ui)return function(){};
    var actions=make('div','kami-actions'),start=ui.button({label:'测试真实搜索'}),stop=ui.button({label:'中断测试',kind:'ghost'});
    start.setAttribute('data-search-native-test','1');stop.setAttribute('data-search-native-stop','1');stop.hidden=true;
    actions.appendChild(start);actions.appendChild(stop);container.appendChild(actions);
    var output=make('div','kami-ui-stack');output.setAttribute('data-search-native-result','1');
    var text=ui.status({label:state.message}),progress=ui.progress({label:'联网能力测试进度'}),summary=make('p','kami-card-note'),links=make('div');
    text.setAttribute('data-search-native-status','1');output.appendChild(text);output.appendChild(progress);output.appendChild(summary);output.appendChild(links);container.appendChild(output);
    start.addEventListener('click',function(){if(!canStart||canStart())run();});stop.addEventListener('click',function(){cancel('测试已中断');});
    function paint(value){
      start.disabled=value.running;start.textContent=value.phase==='idle'?'测试真实搜索':'重新测试';stop.hidden=!value.running;progress.hidden=!value.running;
      text.kami.update(value.message,value.running?'busy':value.state==='verified'?'success':value.state==='failed'?'error':'idle');
      output.setAttribute('data-search-native-state',value.phase);
      summary.hidden=value.running||!value.testedAt||value.phase==='idle'||value.phase==='cancelled';
      summary.textContent='搜索记录 '+value.queries+' 次 · 返回来源 '+value.sources.length+' 个。本结果仅适用于当前连接；搜索执行证据不等于事实已逐条核实。';
      links.textContent='';if(!value.running&&value.sources.length)links.appendChild(ui.sources({items:value.sources.slice(0,3)}));
    }
    listeners.push(paint);paint(snapshot());
    var off=function(){listeners=listeners.filter(function(fn){return fn!==paint;});ui.destroy(text);ui.destroy(progress);};
    offView=off;return off;
  }
  return {run:run,cancel:cancel,prepare:prepare,refresh:refresh,mount:mount,
    status:function(){refresh();return snapshot();},
    subscribe:function(fn){listeners.push(fn);fn(snapshot());return function(){listeners=listeners.filter(function(row){return row!==fn;});};},
    shutdown:function(){if(disposed)return;cancel('脚本已关闭，测试已中断');disposed=true;if(offView)offView();listeners=[];}};
}
