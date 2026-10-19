import assert from 'node:assert/strict';
import {inspectSkinMeta,inspectSkinCss,inspectNavigationCss,declarations} from '../../build/skin-contract.mjs';
let count=0;
const ok=(value,message)=>{assert.ok(value,message);count++;};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);count++;};
const meta=()=>({id:'test',name:'测试',button:'测试',scheme:'light',effects:[],params:[],decor:[]});
const param=()=>({id:'glow',label:'辉光',token:'--kami-glow',min:0,max:5,value:2,step:1,unit:'px'});
const prefix='html[data-kami-skin="test"]';
const root=prefix+' .kami-root{--kami-fg:#111;--kami-bg:#fff;--kami-accent:#000;--kami-accent-fg:#fff;--kami-card:#fff;--kami-card-2:#eee;}';
eq(inspectSkinMeta(meta(),'test'),[],'Minimal metadata');
for(const value of [null,[],false,'text'])ok(inspectSkinMeta(value,'test').length,'Malformed metadata rejected');
for(const [key,value] of [['id','Other'],['name',{}],['button',' '],['scheme','auto'],['css',''],['effects',{}],['params',{}],['decor','d20']]){
 const m=meta();m[key]=value;ok(inspectSkinMeta(m,'test').length,'Reject malformed '+key);
}
for(const p of [{...param(),unit:'×'},{...param(),unit:'°'},{...param(),step:0},{...param(),step:'1'},{...param(),value:6},{...param(),max:0},{...param(),min:Infinity},{...param(),token:'color'},null]){
 const m=meta();m.params=[p];ok(inspectSkinMeta(m,'test').length,'Invalid parameter');
}
for(const unit of ['','px','rem','em','%','deg','rad','turn','ms','s']){const m=meta();m.params=[{...param(),unit}];eq(inspectSkinMeta(m,'test'),[],'Valid CSS unit '+unit);}
for(const m of [
 {...meta(),effects:[{id:'a',label:'A'},{id:'a',label:'Again'}]},
 {...meta(),effects:[{id:'a',label:'A',default:'true'}]},
 {...meta(),effects:[null]},
 {...meta(),params:[param(),param()]},
 {...meta(),params:[param(),{...param(),id:'other'}]},
 {...meta(),decor:['d20','d20']},
 {...meta(),decor:['future']}
])ok(inspectSkinMeta(m,'test').length,'Duplicate or invalid declaration');
eq(inspectSkinCss(root,'test'),[],'Root defaults are valid');
ok(inspectSkinCss('@media(max-width:400px){'+root+'}', 'test').length,'Conditional values do not satisfy unconditional defaults');
ok(inspectSkinCss(root.replace('--kami-fg:#111','--kami-fg:'),'test').length,'Empty defaults are rejected');
eq(inspectSkinCss('@layer theme{'+root+'}','test'),[],'Cascade layer can hold unconditional defaults');
const badRules=[
 prefix+' #chat{color:red}',
 prefix+' .kami-root + .mes{color:red}',
 prefix+'{color:red}',
 prefix+'[data-kami-kind="action"]{--kami-kind:red}',
 'html[data-kami-skin="other"] .kami-root{color:red}',
 prefix+' .kami-card,body{color:red}',
 '@media(max-width:400px){'+prefix+' .kami-card,body{color:red}}',
 prefix+' .kami-root{--kami-label-empty:"override"}',
 prefix+' .kami-root{background:url( https://example.org/a.png )}',
 prefix+' .kami-root{background:url(" //example.org/a.png")}',
 prefix+' .kami-root{background:url(assets/a.png)}',
 prefix+' .kami-root{background:url("data:text/html,bad")}',
 prefix+' .kami-root{background:url("data:image/png;base64,AAAA")',
];
for(const css of badRules)ok(inspectSkinCss(root+css,'test').length,'Invalid skin CSS rejected: '+css.slice(0,90));
ok(inspectSkinCss(root.replace('--kami-fg:#111;','')+prefix+' .kami-btn{--kami-fg:#111}','test').some(x=>x.includes('默认 .kami-root')),'Local foreground does not satisfy root default');
eq(inspectSkinCss(root+prefix+'{--kami-fg:#111}'+prefix+' .kami-root[data-kami-comp="dialog"] .kami-card{color:var(--kami-fg)}','test'),[],'Root token copy and scoped cards');
eq(inspectSkinCss(root+prefix+' .kami-root{background:url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\'>{x}</svg>")}','test'),[],'Data URI namespace is not an external request');
eq(declarations('background:url("data:image/svg+xml,a;b:c");--kami-font:"A;B";COLOR:red;'),[['background','url("data:image/svg+xml,a;b:c")'],['--kami-font','"A;B"'],['color','red']],'Quoted declaration separators and case');
for(const css of [
 ':where(.kami-root .kami-actions,.kami-root .kami-tabs){flex-wrap:wrap}',
 '@media(max-width:400px){:is(.kami-tabs,.kami-actions){flex-flow:row wrap}}',
 ':where(:is(.kami-tabs,.other)){FLEX-WRAP:wrap!important}',
 '.kami-tabs{display:grid}', '.kami-tabs{flex-direction:column}', '.kami-tabs{overflow-x:hidden}',
 '.kami-tabs{overflow:clip auto}', '.kami-tabs{white-space:normal}',
 '.kami-tab{flex:1 1 0}', '.kami-tab{flex:1}', '.kami-tab{flex-shrink:1}',
 '.kami-tab{white-space:normal}'
])ok(inspectNavigationCss(css).length,'Broken navigation rejected: '+css);
for(const css of [
 '.kami-tabs{display:flex;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;white-space:nowrap}',
 '.kami-tab{flex:0 0 auto;white-space:nowrap}',
 '.kami-tabs::-webkit-scrollbar{display:none}',
 '.kami-tabs::before{display:block}',
 '.kami-actions{flex-wrap:wrap}',
 '.kami-tabs-extra{display:grid;flex-wrap:wrap}',
 '.kami-tab-label{white-space:normal}',
 '.kami-actions:not(.kami-tabs){flex-wrap:wrap}',
 '.kami-tabs .kami-btn{flex-shrink:1;white-space:normal}',
 '.kami-tabs :is(.kami-btn,.kami-select){white-space:normal}'
])eq(inspectNavigationCss(css),[],'Legitimate scoped rule: '+css);
console.log('✓ Skin contract: '+count+' passed');
