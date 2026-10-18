#!/usr/bin/env node
// Execute current source; no network, generated fixtures, or production writes.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { reconcileBlocks } from '../../src/scripts/_summarize-pure.js';
const ROOT = path.resolve(import.meta.dirname, '../..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const noop = () => {};
let count = 0;
const check = (value, message) => { assert.ok(value, message); count++; };
const eq = (got, want, message) => { assert.equal(JSON.stringify(got), JSON.stringify(want), message); count++; };
function grab(code, name) {
  const lines = code.split(/\r?\n/);
  const a = lines.findIndex(l => l.startsWith('  function ' + name + '(') || l.startsWith('  async function ' + name + '('));
  assert.ok(a >= 0, 'Function exists: ' + name);
  let b = a + 1;
  while (b < lines.length && lines[b].trimEnd() !== '  }') b++;
  assert.ok(b < lines.length, 'Function ends: ' + name);
  return lines.slice(a, b + 1).join('\n');
}
function functions(file, names) { const code = read(file); return names.map(n => grab(code, n)).join('\n'); }
const ticks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Reuse the existing integration environment in memory, without its test runner.
let fixture = read('test/harness/summarize-flow.mjs');
fixture = fixture.replace(/(from\s+['"])(\.[^'"]+)(['"])/g, (_all, prefix, spec, suffix) =>
  prefix + pathToFileURL(path.resolve(ROOT, 'test/harness', spec)).href + suffix);
fixture = fixture.slice(0, fixture.indexOf('/* ───────────────────────── 用例 0'));
fixture = fixture.replace(/const ROOT = path.resolve\([^\n]+\);/, 'const ROOT = ' + JSON.stringify(ROOT) + ';');
fixture = fixture.replace('const ARGV = process.argv.slice(2);', "const ARGV = ['--src'];");
fixture = fixture.replace('const env = {', `const env = {
  switchChat(name, lorebook=name) { boundLb=lorebook; wb={entries:{}};ctx.chatId=name;for(const m of chat){m.message='CHAT-B-'+m.message_id;m.is_hidden=false;} },`);
fixture += '\nexport {makeEnv,VARS,settle,goodJson};';
const { makeEnv, VARS, settle, goodJson } = await import('data:text/javascript;base64,' + Buffer.from(fixture).toString('base64'));

for (const emitChange of [false, true]) {
  let release, started;
  const ready = new Promise(r => started = r), gate = new Promise(r => release = r);
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 20 }), generate: async () => { started(); return gate; } });
  await settle(); const api = env.api(); const running = api.runOnce(); await ready;
  env.switchChat('聊天 B'); if (emitChange) await env.emit('chat_changed');
  release(goodJson(1)); await running;
  eq(env.calls.saveWorld, [], 'Old summary never saves to B, even before CHAT_CHANGED arrives');
  eq(env.hidden(), [], 'Old summary never hides B floors');
  eq(env.blockRanges(), [], 'Old summary never creates B blocks');
  api.shutdown();
}
for (const emitChange of [false, true]) {
  let release, started;
  const ready = new Promise(r => started = r), gate = new Promise(r => release = r);
  const env = makeEnv({ vars: VARS({keep:5,chunk:20}), lorebook:null,
    createLorebook: async () => { started(); return gate; } });
  await settle(); const api=env.api(), running=api.runOnce(); await ready;
  env.switchChat('聊天 B', null); const changed=emitChange?env.emit('chat_changed'):Promise.resolve();
  release(true); await running; await changed;
  eq(env.lbName(),null,'Late worldbook creation never binds chat B');
  eq(env.calls.bindLorebook||[],[],'Creation verifies identity BEFORE binding');
  eq(env.calls.saveWorld,[],'Late created worldbook receives no summary data');
  eq(env.hidden(),[],'Late worldbook creation never hides B floors');
  api.shutdown();
}
{
  const env = makeEnv({vars:VARS({keep:5,chunk:20})});await settle();
  const original=env.ctx.loadWorldInfo;let release;
  env.ctx.loadWorldInfo=name=>name==='聊天 B'?original(name):new Promise(r=>release=r);
  const oldRead=env.api().refresh();await ticks();env.switchChat('聊天 B');await env.emit('chat_changed');
  release({entries:{0:{uid:0,comment:'📜 压缩块 #1｜楼层 0-9',content:'A 的旧摘要'}}});
  await assert.rejects(oldRead,e=>e.chatCancelled);count++;
  eq(env.api().status().blocks,0,'Late worldbook read cannot replace new chat state');env.api().shutdown();
}
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 10 }) }); await settle();
  const api = env.api(); await api.runOnce();
  env.dropEntry('📜 压缩块 #2｜楼层 10-14'); env.dropEntry('📜 压缩状态（勿动）');
  await api.refresh();
  eq(api.status().orphan, ['10-14'], 'Missing tail block and ledger detected on FIRST refresh');
  await api.runOnce(); eq(api.status().covered, 9, 'No phantom frontier advance over unknown hidden floors');
  await api.repairOrphans(); await api.runOnce();
  eq(env.blockRanges(), ['0-9', '10-14'], 'Explicit recovery regenerates missing tail');
  api.shutdown();
}
{
  const env = makeEnv({ vars: VARS({ keep: 5, chunk: 20 }) }); await settle();
  env.chat[2].is_hidden = true; await env.api().runOnce();
  check(env.calls.gen.length > 0, 'User-hidden floor does not permanently block a fresh chat');
  check(!env.calls.setMessages[0].payload.some(p => p.message_id === 2), 'User-hidden floor is left alone');
  env.api().shutdown();
}
{
  const plan = reconcileBlocks({ prefix: 'x', entries: [], ledger: null, len: 20, keep: 5, hiddenFloors: [10,11,12], orphanScanTop: 14 });
  eq(plan.orphan, [{ from: 10, to: 12 }], 'Recovery scan can exceed the surviving frontier');
  eq(plan.covered, -1, 'Inspection alone never advances coverage');
}

// Native-save transaction lock, conditional rollback, cleanup and retry.
{
  const requests = [], host = { fetch: () => new Promise(resolve => requests.push(resolve)) };
  const native = host.fetch, prompt = { content: 'value=1' }, timers = new Map(); let timer = 0;
  const c = vm.createContext({ HOST: host, window: host, disposed: false, savePatches: [], saveJobs: [], saveJobActive: null, saveSerial: 0,
    lastSave: null, nowText: () => '', countInjection: () => 0, planInBody: () => [], log: noop, renderStatus: noop, revertVarInputs: noop, toast: noop,
    setTimeout(fn) { const id = ++timer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(functions('src/scripts/40-预设设置.js', ['watchSave', 'queuePresetSave', 'pumpPresetSaves', 'savingBusy', 'cancelSavePatches']), c);
  c.plan = [{ prompt, before: 'value=1', after: 'value=2' }]; prompt.content = 'value=2';
  c.button = { click() { host.fetch('/api/presets/save', {}); } };
  vm.runInContext("queuePresetSave('test','test',plan,null,button)", c);
  check(vm.runInContext('savingBusy()', c), 'Full transaction remains locked while HTTP is pending');
  prompt.content = 'value=3'; requests[0]({ ok: false, status: 500 }); await ticks();
  eq(prompt.content, 'value=3', 'Failure cannot overwrite a later external edit');
  check(host.fetch === native, 'Native fetch is restored after failure');
  check(!vm.runInContext('savingBusy()', c), 'Failure releases the transaction lock');
  c.plan = [{ prompt, before: 'value=3', after: 'value=4' }]; prompt.content = 'value=4';
  vm.runInContext("queuePresetSave('test','test',plan,null,button)", c);
  requests[1]({ ok: false, status: 500 }); await ticks();
  eq(prompt.content, 'value=3', 'An owned failed edit is rolled back');
  c.plan = [{ prompt, before: 'value=3', after: 'value=5' }]; prompt.content = 'value=5';
  vm.runInContext("queuePresetSave('test','test',plan,null,button); disposed=true; cancelSavePatches()", c);
  requests[2]({ ok: false, status: 500 }); await ticks();
  eq(prompt.content, 'value=5', 'Late failure after shutdown cannot mutate live settings');
  check(host.fetch === native && timers.size === 0, 'Shutdown restores fetch and clears all save timers');
  const code = read('src/scripts/40-预设设置.js');
  c.disposed=false;c.saveJobActive={};c.SAVE_BUSY='正在保存';
  for (const name of ['commitVars', 'applyCustomStyles', 'applyInheritedToLive']) {
    vm.runInContext(grab(code,name),c);
    const result=vm.runInContext(name+'({})',c);
    check(result.ok===false&&(result.msg==='正在保存'||result.detail==='正在保存'),name+' rejects overlap before accessing or mutating live data');
  }
}

// Selected message belongs to a chat; listener lifecycle permits rebinding.
{
 const listeners=new Set(),attrs={};
 const chat={getAttribute:k=>attrs[k]??null,setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],
  addEventListener:(k,fn)=>listeners.add(fn),removeEventListener:(k,fn)=>listeners.delete(fn)};
 const ctx={chat:[],characterId:0,chatId:'A'};
 const c=vm.createContext({disposed:false,tagFixCurFloor:-1,tagFixSelection:null,tagFixWatchNode:null,tagFixFloorHandler:null,
  stCtx:()=>ctx,HDOC:{getElementById:()=>chat},chatLen:()=>5,chatMsgAt:()=>({is_user:false})});
 vm.runInContext(functions('src/scripts/40-预设设置.js',['tagFixChatStamp','tagFixSameChat','unbindChatFloorWatch','currentFloorId','bindChatFloorWatch']),c);
 vm.runInContext('bindChatFloorWatch()',c);
 [...listeners][0]({target:{getAttribute:k=>k==='mesid'?'2':null,parentNode:chat}});
 eq(vm.runInContext('currentFloorId()',c),2,'Click selects AI floor in its own chat');
 ctx.chatId='B';eq(vm.runInContext('currentFloorId()',c),4,'Switching chat resets selection even when chat array is reused');
 vm.runInContext('unbindChatFloorWatch()',c);eq(listeners.size,0,'Unloading removes exact click listener');
 check(!attrs['data-kami-tagfix-floor'],'Unloading removes binding marker');
 vm.runInContext('bindChatFloorWatch();bindChatFloorWatch()',c);eq(listeners.size,1,'Rebinding after restart works exactly once');
}

// Skin-local settings and legacy migration, using the real metadata.
{
  const code = read('src/scripts/30-皮肤管理.js');
  const skins = fs.readdirSync(path.join(ROOT, 'src/skins')).map(id => JSON.parse(read('src/skins/' + id + '/skin.json')));
  const init = code.slice(code.indexOf('  var PREFERRED'), code.indexOf('  function findSkin'));
  const c = vm.createContext({ SKINS: skins, VARS_KEY: 'kami-skin', saveState: noop, syncAll: noop, syncAllIframes: noop, applyTo: noop, skinRevision: 0,
    renderPane: noop, renderFxPane: noop, renderPaneStatusOnly: noop, log: noop, HDOC: {}, panelDrop: null });
  vm.runInContext(init + functions('src/scripts/30-皮肤管理.js', ['findSkin','curSkin','rememberSkinSettings','useSkinSettings','readState','setSkin','setParam','effectList','toggleEffect']), c);
  vm.runInContext("useSkinSettings(state.skinId);setSkin('gemini');setParam('halo',14);setParam('__fs',1.2);setSkin('nixie')", c);
  eq(c.state.params.halo, 55, 'Nixie uses its own percent default rather than Gemini px');
  vm.runInContext("setParam('halo',63);setSkin('gemini')", c);
  eq(c.state.params.halo, 14, 'Returning to Gemini restores its own edited value');
  eq(c.state.params.__fs, 1.2, 'Font scaling remains global across skins');
  vm.runInContext("setSkin('memo');toggleEffect('dice');setSkin('trpg')", c);
  check(vm.runInContext("effectList().includes('dice')", c), 'Unrelated TRPG dice effect retains its own default');
  vm.runInContext("setSkin('memo')", c);
  check(!vm.runInContext("effectList().includes('dice')", c), 'Memo effect choice is retained');
  c.getVariables = () => ({ 'kami-skin': { skinId: 'gemini', params: { halo: 999, __fs: 1.3 }, effects: { dice: false } } });
  vm.runInContext("state.skinSettings={};readState()", c);
  eq(c.state.params.halo, 14, 'Legacy parameter is clamped on startup');
  vm.runInContext("setSkin('nixie')", c);
  eq(c.state.params.halo, 55, 'Legacy flat values migrate ONLY into their original skin');
  eq(c.state.params.__fs, 1.3, 'Legacy global font scaling is preserved');
}

// Real model-list adapters, request headers, parsing, errors and stale responses.
const modelFns = ['modelConfigKey','cachedModelList','invalidateModelList','modelListRequest','modelListHeaders','fetchLlmModelCatalog','fetchModelList'];
function modelEnv(fetcher, source = 'custom') {
  const config = { name: 'test', source, apiurl: source === 'custom' ? 'https://example.invalid/v1' : '', key: 'FAKE-KEY' };
  const notices = [], requests = [], timers = new Map(); let timer = 0;
  const c = vm.createContext({ URL, AbortController, disposed: false, modelListCache: {}, modelFetchSeq: 0, modelFetchAbort: null,
    fetchState: 'idle', panelRoot: null, bodyEl: null, currentSumConfig: () => config, renderContent: noop, msgOf: e => e.message,
    COPY: { model: { fetchModels: '获取模型列表', fetchEmpty: '空列表', fetchFail: '失败：{err}' } },
    toast: (kind, text) => notices.push({kind,text}), stCtx: () => ({getRequestHeaders: () => ({'Content-Type':'application/json','X-CSRF-Token':'CSRF'})}),
    HOST: { fetch: async (url, init) => { requests.push({url,init}); return fetcher(url,init); } },
    setTimeout(fn) { const id=++timer;timers.set(id,fn);return id; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(functions('src/scripts/60-工具箱.js', modelFns), c);
  return {c,config,notices,requests,timers,run:()=>vm.runInContext('fetchModelList()',c)};
}
for (const source of ['custom','openai','claude','makersuite','deepseek','xai','openrouter','azure_openai']) {
  const e = modelEnv(async () => ({ok:true,status:200,json:async()=>({data:[{id:'b'},{name:'a'},{id:'b'}]})}),source);
  if (source === 'azure_openai') e.config.apiurl='https://resource.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21';
  await e.run();
  eq(e.requests[0].init.headers['X-CSRF-Token'],'CSRF', source + ' includes ST CSRF header');
  eq(vm.runInContext('cachedModelList(currentSumConfig())', e.c), ['a','b'], source + ' sorts and deduplicates model IDs');
  const body=JSON.parse(e.requests[0].init.body);
  if (source==='makersuite') eq(body.proxy_password,'FAKE-KEY','Gemini uses standalone key');
  else {
    const headers=JSON.parse(body.custom_include_headers);
    eq(body.chat_completion_source,'custom',source+' uses server adapter without reusing ST stored key');
    if(source==='claude') eq(headers['x-api-key'],'FAKE-KEY','Claude auth header');
    if(source==='azure_openai') {eq(body.custom_url,'https://resource.openai.azure.com/openai/v1','Azure model directory URL');eq(headers['api-key'],'FAKE-KEY','Azure independent key');}
  }
  check(e.timers.size===0 && e.c.fetchState==='idle',source+' clears timeout and busy state');
}
{
  const e=modelEnv(async()=>({ok:false,status:403,json:async()=>{throw Error('HTML');}})); await e.run();
  check(e.notices.some(n=>n.kind==='error'&&n.text.includes('403')),'HTTP 403 is reported as an error, never an empty list');
  const f=modelEnv(async()=>({ok:true,status:200,json:async()=>({error:{message:'bad FAKE-KEY'}})}));await f.run();
  check(f.notices.some(n=>n.kind==='error')&&!f.notices.some(n=>n.text.includes('FAKE-KEY')),'Provider error cannot expose API key');
}
{
  let release;const e=modelEnv(()=>new Promise(r=>release=r));const p=e.run();await ticks();
  e.config.apiurl='https://other.invalid/v1';vm.runInContext("invalidateModelList('test')",e.c);
  release({ok:true,status:200,json:async()=>({data:[{id:'old'}]})});await p;
  eq(e.c.modelListCache,{},'Old endpoint response is discarded after editing configuration');
}
{
  const e=modelEnv(()=>new Promise(()=>{}));const p=e.run();await ticks();
  [...e.timers.values()][0]();await p;
  check(e.notices.some(n=>n.text.includes('超时'))&&e.c.fetchState==='idle','Timeout restores usable fetch button');
}
console.log('✓ Audit regression checks: '+count+' passed');
