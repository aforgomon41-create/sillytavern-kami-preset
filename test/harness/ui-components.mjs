import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createKamiUi} from '../../src/ui/core.js';
import {mapCssSelectors,migrateComponentSelectors,splitSelectors} from '../../build/css-scope.mjs';
import {inspectNavigationCss} from '../../build/skin-contract.mjs';
import {uiCss,expandUi,expandForRegex,countPlaceholders,countMacros} from '../../build/kami-doc.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'src/ui/catalog.json'),'utf8'));
let count=0;const ok=(v,m)=>{assert.ok(v,m);count++;},eq=(v,e,m)=>{assert.deepEqual(v,e,m);count++;};
const doc={createElement(){return{};},baseURI:'https://fixture.invalid/base/'},ui=createKamiUi(doc);
eq(createKamiUi(doc),ui,'A document shares one UI instance');
const oldDoc={createElement(){return{};},__kami_ui_v1__:{version:'0.0.0'}};eq(createKamiUi(oldDoc).version,ui.version,'A stale cached runtime is replaced on version change');
const all=[...catalog.base,...catalog.composite,...catalog.containers];
eq([catalog.base.length,catalog.composite.length,catalog.containers.length],[30,12,3],'Public scope is explicit');
eq(new Set(all).size,45,'No duplicate public names');
for(const name of all)ok(typeof ui[name]==='function','Public factory '+name);
for(const layout of catalog.layouts)ok(['stack','row','wrap','grid','split','center'].includes(layout),'Known layout '+layout);
for(const bad of ['javascript:alert(1)','data:text/html,bad','file:///x','vbscript:bad'])eq(ui.safeUrl(bad),null,'Reject unsafe '+bad.split(':')[0]);
eq(ui.safeUrl('/item'),'https://fixture.invalid/item','Relative HTTP URL resolves explicitly');
eq(ui.safeUrl('https://example.org/'),'https://example.org/','HTTPS source allowed');
assert.throws(()=>ui.attrs({setAttribute(){}},{onclick:'bad'}),/禁止/);count++;
assert.throws(()=>ui.attrs({setAttribute(){}},{srcdoc:'bad'}),/禁止/);count++;
for(const name of ['SrCdOc','INNERHTML','OuterHtml','ONCLICK']){assert.throws(()=>ui.attrs({setAttribute(){}},{[name]:'bad'}),/禁止/);count++;}
for(const name of ['Href','SRC','FormAction','Xlink:Href']){let wrote=false;ui.attrs({setAttribute(){wrote=true;}},{[name]:'javascript:bad'});ok(!wrote,'Reject mixed-case URL '+name);}
const inline=expandUi(root,'/* @@KAMI_UI@@ */');
eq(countPlaceholders(inline),0,'UI source cannot collide with ST capture groups');
eq(countMacros(inline),0,'UI source cannot invoke ST macros');
new Function(inline);count++;
for(const name of ['think','options','search']){
 const html=expandForRegex(root,name);
 ok(!html.includes('@@KAMI_UI'),'Expanded frontend '+name);
 ok(html.includes('function createKamiUi'),'All frontends use shared runtime '+name);
 eq(countPlaceholders(html),name==='search'?0:1,'Capture count '+name);
 for(const block of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){new Function(block[1]);count++;}
}
const transformed=migrateComponentSelectors('html[data-kami-skin="x"] .kami-root[data-kami-comp="panel"]{position:fixed}html[data-kami-skin="x"] .kami-root[data-kami-comp="panel"] .kami-card{color:red}@media(max-width:500px){html[data-kami-skin="x"] .kami-root[data-kami-comp="think"]{color:blue}}');
ok(transformed.includes('[data-kami-comp="panel"]{position:fixed}'),'Panel geometry does not spill into dialog');
ok(transformed.includes(':is([data-kami-comp="panel"],[data-kami-comp="dialog"]) .kami-card'),'Interior cards share themed appearance');
ok(transformed.includes(':is([data-kami-comp="think"],[data-kami-comp="search"])'),'Search has explicit compatibility appearance');
eq(splitSelectors('a:is(.b,.c),d[data-x=","]').length,2,'Selector commas respect nesting and quotes');
const data='a{background:url("data:image/svg+xml,<svg>{x}</svg>")}@media(x){b{color:red}}';
eq(mapCssSelectors(data,s=>s),data,'Quoted braces do not corrupt stylesheet');
function checkTabLayoutCss(css,name){eq(inspectNavigationCss(css),[],name+' navigation must not wrap');}
assert.throws(()=>checkTabLayoutCss(':where(.kami-root .kami-actions,.kami-root .kami-tabs){display:flex;flex-wrap:wrap;}','regression'),/navigation must not wrap/);count++;
const css=uiCss(root);checkTabLayoutCss(css,'Foundation');
ok(!css.includes('@@KAMI_UI_DEFAULTS@@'),'Common defaults compiled');
ok(css.includes('--kami-fg:'),'Fallback exists even with an active skin');
ok(css.includes('[data-kami-container="dialog"]'),'Modal structure has distinct identity');
ok(!/@import|@font-face|url\(\s*["']?https?:/i.test(css),'Foundation has no external resource requests');
for(const id of fs.readdirSync(path.join(root,'src/skins'))){
 const skin=fs.readFileSync(path.join(root,'src/skins',id,'skin.css'),'utf8');checkTabLayoutCss(skin,'Theme '+id);
 ok(skin.includes('--kami-fg:'),'Theme '+id+' retains foreground');
 ok(skin.includes('prefers-reduced-motion'),'Theme '+id+' retains reduced motion');
 ok(!new RegExp('html\\[data-kami-skin="'+id+'"\\]\\s*\\{\\s*--kami-kind\\s*:').test(skin),'Local kind does not become document default '+id);
}
console.log('✓ Shared component contract: '+count+' passed');
