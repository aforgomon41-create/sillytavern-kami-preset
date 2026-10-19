export async function checkNativeSearchRuntime(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks={},ok=(name,value)=>{checks[name]=!!value;if(!value)throw Error(name);};
 for(let i=0;i<100&&!window.__setTab;i++)await wait(100);await wait(950);window.__setTab('compress');
 const fixture=window.__nativeProbeFixture;
 ok('fixture',!!fixture);
 KamiToolbox.open('search');await wait(50);
 const page=document.querySelector('[data-toolbox-pane="search"]'),settings=SillyTavern.getContext().chatCompletionSettings;
 const saved=JSON.stringify(settings),chat=JSON.stringify(SillyTavern.getContext().chat);
 if(!page.querySelector('[aria-label="开启搜索能力"]').checked)page.querySelector('[aria-label="开启搜索能力"]').click();
 [...page.querySelectorAll('button')].find(x=>x.textContent==='模型自带').click();await wait(30);
 const start=()=>page.querySelector('[data-search-native-test]'),result=()=>page.querySelector('[data-search-native-result]');
 const finish=async()=>{for(let i=0;i<120&&KamiToolbox.status().search.probeRunning;i++)await wait(20);return result().getAttribute('data-search-native-state');};
 ok('real-test-entry',!!start());ok('cost-visible',page.textContent.includes('可能产生模型与搜索费用'));
 start().click();await wait(10);ok('running-visible',KamiToolbox.status().search.probeRunning&&!page.querySelector('[data-search-native-stop]').hidden);ok('progress-visible',!page.querySelector('[data-search-native-result] [role=progressbar]').hidden);
 ok('success-state',await finish()==='verified');ok('source-visible',!!result().querySelector('a[href="https://blog.mozilla.org/fixture"]'));ok('progress-stops',page.querySelector('[data-search-native-result] [role=progressbar]').hidden);
 ok('single-request',fixture.calls.length===1);ok('isolated-prompts',fixture.calls[0].messages.length===2&&!JSON.stringify(fixture.calls[0]).includes('PRIVATE_PRESET'));
 ok('native-enabled-and-streamed',fixture.calls[0].enable_web_search&&fixture.calls[0].stream);ok('no-floor-writes',fixture.writes.length===0);
 for(const [mode,state]of [['empty','empty'],['unverified','unverified'],['error','failed'],['http','failed']]){
  fixture.mode=mode;start().click();ok('outcome-'+mode,await finish()===state);
 }
 fixture.mode='block';start().click();await wait(30);page.querySelector('[data-search-native-stop]').click();await wait(30);
 ok('cancel-state',result().getAttribute('data-search-native-state')==='cancelled');ok('cancel-helper',fixture.stops.length>0);ok('cancel-idle',!KamiToolbox.status().search.probeRunning);
 fixture.release();await wait(30);ok('cancel-late-ignored',result().getAttribute('data-search-native-state')==='cancelled');
 fixture.mode='success';start().click();await finish();settings.google_model='changed-model';await fixture.emit('chatcompletion_model_changed');await wait(20);
 ok('connection-invalidates',result().getAttribute('data-search-native-state')==='idle');ok('old-sources-cleared',!result().querySelector('a'));settings.google_model='fixture-gemini';await fixture.emit('chatcompletion_model_changed');
 fixture.mode='success';start().click();await finish();
 const skins=KamiSkin.skins(),width=innerWidth;
 for(const skin of skins)for(const scheme of ['dark','light']){
  KamiSkin.setSkin(skin.id);KamiSkin.setFlag('scheme',scheme);await wait(30);
  const nodes=[start(),page.querySelector('[data-search-native-status]'),result().querySelector('a')];
  const geometry=nodes.map(node=>{const r=node.getBoundingClientRect();return{tag:node.tagName,text:node.textContent,left:r.left,right:r.right,width:r.width};});ok('fit-'+skin.id+'-'+scheme+'-'+width+'-'+JSON.stringify(geometry),geometry.every(r=>r.width>0&&r.left>=-1&&r.right<=width+1));
 }
 ok('chat-unchanged',JSON.stringify(SillyTavern.getContext().chat)===chat);
 const after=JSON.parse(saved),current=structuredClone(settings);for(const key of ['prompts','prompt_order','kami_web_search']){delete after[key];delete current[key];}
 ok('connection-settings-unchanged',JSON.stringify(current)===JSON.stringify(after));
 KamiToolbox.shutdown();ok('hook-cleanup',window.__kamiResponsePipelineV1.size()===0||window.__kamiResponsePipelineV1.size()===1);
 return{checks,requests:fixture.calls.length,floorWrites:fixture.writes.length};
}
