import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createSkinAssetPool} from '../../src/scripts/_skin-assets.js';
import {packSkinAssets,SKIN_ASSET_LIMIT,PRESET_ASSET_TOTAL_LIMIT} from '../../build/skin-assets.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1kAAAAASUVORK5CYII=','base64');
const data='data:image/png;base64,'+png.toString('base64');
let tests=0;const ok=(v,m)=>{assert.ok(v,m);tests++;};const eq=(a,b,m)=>{assert.deepEqual(a,b,m);tests++;};
const created=[],revoked=[];
const host={Blob,atob,URL:{createObjectURL(b){created.push(b);return 'blob:fixture/'+created.length;},revokeObjectURL(u){revoked.push(u);}}};
const pool=createSkinAssetPool(host),a={id:'a',assets:{mascot:data}},b={id:'b',assets:{mascot:data}};
const css=pool.css(a);
ok(css.includes('--kami-asset-mascot:url("blob:fixture/1")'),'Blob variable is exported');
ok(!css.includes('base64'),'Per-frame CSS contains no image bytes');
eq(pool.css(a),css,'Repeated application reuses CSS');
ok(pool.css(b).includes('blob:fixture/1'),'Same image in another skin shares the URL');
eq(created.length,1,'One image gets one Blob');
eq(created[0].type,'image/png','MIME preserved');
eq(pool.css({id:'remote',assets:{bad:'https://example.invalid/x.png'}}),'','No remote image requests');
eq(pool.css({id:'bad"id',assets:{a:data}}),'','Invalid skin ID never creates CSS');
eq(pool.css({id:'valid',assets:{'bad;key':data}}),'','Invalid asset name never creates CSS');
pool.dispose();pool.dispose();eq(revoked,['blob:fixture/1'],'Dispose revokes every owned URL once');
eq(pool.css(a),'','Disposed pool cannot create more resources');
eq(pool.stats().images,0,'Pool releases its image references');
const fallback=createSkinAssetPool({});ok(fallback.css(a).includes(data),'Legacy fallback stays offline');fallback.dispose();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'kami-skin-assets-'));
try{
 const dir=path.join(root,'src/skins/demo/assets');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'icon.png'),png);
 const plain={id:'demo'};eq(packSkinAssets(root,'demo',plain),plain,'Old metadata unchanged');
 fs.writeFileSync(path.join(dir,'../skin.json'),'{}');
 eq(packSkinAssets(root,'demo',{id:'demo',assets:{icon:'assets/icon.png'}}).assets.icon,data,'Build embeds local source once');
 const webp=Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAEAdQmShyAQMR0f8A','base64');
 fs.writeFileSync(path.join(dir,'icon.webp'),webp);
 ok(packSkinAssets(root,'demo',{assets:{icon:'assets/icon.webp'}}).assets.icon.startsWith('data:image/webp;base64,'),'Lossless WebP source accepted');
 const animWebp=Buffer.concat([webp,Buffer.from('ANIM'),Buffer.alloc(8)]);animWebp.writeUInt32LE(animWebp.length-8,4);
 fs.writeFileSync(path.join(dir,'animated.webp'),animWebp);
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{icon:'assets/animated.webp'}}),/静态/);tests++;
 const animPng=Buffer.concat([png.subarray(0,33),Buffer.from([0,0,0,8]),Buffer.from('acTL'),Buffer.alloc(12),png.subarray(33)]);
 fs.writeFileSync(path.join(dir,'animated.png'),animPng);
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{icon:'assets/animated.png'}}),/静态/);tests++;
 for(const assets of [{icon:'https://example.invalid/a.png'},{'bad key':'assets/icon.png'}]){
  assert.throws(()=>packSkinAssets(root,'demo',{assets}));tests++;
 }
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{escape:'assets/../skin.json'}}),/越出/);tests++;
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{icon:'assets/icon.png'}},{bytes:PRESET_ASSET_TOTAL_LIMIT-16}),/整份预设/);tests++;
 const largePixels=Buffer.from(png);largePixels.writeUInt32BE(100000,16);fs.writeFileSync(path.join(dir,'pixels.png'),largePixels);
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{icon:'assets/pixels.png'}}),/像素/);tests++;
 fs.mkdirSync(path.join(root,'outside/assets'),{recursive:true});fs.writeFileSync(path.join(root,'outside/assets/icon.png'),png);
 fs.symlinkSync(path.join(root,'outside'),path.join(root,'src/skins/linked'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>packSkinAssets(root,'linked',{assets:{icon:'assets/icon.png'}}),/真实路径/);tests++;
 fs.writeFileSync(path.join(dir,'large.png'),Buffer.alloc(SKIN_ASSET_LIMIT+1));
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{large:'assets/large.png'}}),/体积/);tests++;
 fs.writeFileSync(path.join(dir,'fake.webp'),png);
 assert.throws(()=>packSkinAssets(root,'demo',{assets:{fake:'assets/fake.webp'}}),/格式|扩展名/);tests++;
}finally{
 const resolved=path.resolve(root);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('kami-skin-assets-'))fs.rmSync(resolved,{recursive:true,force:true});
}
console.log('✓ Skin asset pipeline: '+tests+' passed');
