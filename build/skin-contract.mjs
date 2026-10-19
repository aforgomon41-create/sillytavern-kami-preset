/* Enforceable subset of docs/皮肤契约.md. Shared by lint and component checks. */
import {mapCssSelectors,splitSelectors} from './css-scope.mjs';
const clean=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');
export function declarations(body){
  const out=[];let start=0,depth=0,quote='',escaped=false;
  body=clean(body);
  for(let i=0;i<=body.length;i++){const ch=body[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']')depth--;if((ch===';'&&!depth)||i===body.length){const text=body.slice(start,i),at=text.indexOf(':');if(at>=0)out.push([text.slice(0,at).trim().startsWith('--')?text.slice(0,at).trim():text.slice(0,at).trim().toLowerCase(),text.slice(at+1).trim()]);start=i+1;}}
  return out;
}
/* Expand positive selector lists, so a grouped :where cannot hide a tab rail. */
function branches(selector){
  const out=[];for(const part of splitSelectors(clean(selector))){const match=/:(?:is|where)\(/.exec(part);if(!match){out.push(part);continue;}let depth=1,quote='',escaped=false,end=match.index+match[0].length;for(;end<part.length;end++){const ch=part[end];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='(')depth++;else if(ch===')'&&!--depth)break;}if(depth)throw Error('选择器函数未闭合');for(const item of splitSelectors(part.slice(match.index+match[0].length,end))){out.push(...branches(part.slice(0,match.index)+item+part.slice(end+1)));if(out.length>256)throw Error('选择器分支过多');}}
  return out;
}
function subject(selector){let at=0,depth=0,quote='',escaped=false;for(let i=0;i<selector.length;i++){const ch=selector[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']')depth--;else if(!depth&&/[\s>+~]/.test(ch))at=i+1;}return selector.slice(at);}
export function inspectNavigationCss(css){
  const errors=[];mapCssSelectors(css,(selector,body)=>{for(const s of branches(selector)){const tail=subject(s.trim()).replace(/:(?:not|has)\((?:[^()]|\([^()]*\))*\)/g,'');if(tail.includes('::'))continue;const rail=/\.kami-tabs(?![a-z0-9_-])/i.test(tail),tab=/\.kami-tab(?![a-z0-9_-])/i.test(tail);for(const [property,raw] of declarations(body)){const value=raw.replace(/\s*!important\s*$/i,'').toLowerCase();let bad=false;
    if(rail){if(property==='display')bad=!['flex','inline-flex'].includes(value);if(property==='flex-wrap')bad=value!=='nowrap';if(property==='flex-direction')bad=value!=='row';if(property==='flex-flow')bad=/\b(?:column|row-reverse|wrap|wrap-reverse)\b/.test(value);if(property==='white-space')bad=value!=='nowrap';if(property==='overflow-x'||property==='overflow')bad=!['auto','scroll'].includes(value.split(/\s+/)[0]);}
    if(tab){if(property==='white-space')bad=value!=='nowrap';if(property==='flex-shrink')bad=value!=='0';if(property==='flex'){const parts=value.split(/\s+/);bad=value==='auto'||value==='initial'||(parts.length>1&&!/^0(?:\.0+)?$/.test(parts[1]))||(parts.length===1&&value!=='none');}}
    if(bad)errors.push('导航结构不可覆盖：'+property+': '+raw+'（'+s.trim()+'）');
  }}return selector;});return [...new Set(errors)];
}
export function inspectSkinMeta(meta,id){
  const errors=[],validId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]*$/.test(value),text=value=>typeof value==='string'&&!!value.trim();
  if(!meta||typeof meta!=='object'||Array.isArray(meta))return ['skin.json 必须是对象'];
  if(!validId(id)||meta.id!==id)errors.push('皮肤 id 必须是小写标识符并与目录名一致');
  for(const key of ['name','button'])if(!text(meta[key]))errors.push(key+' 必须是非空字符串');
  if(meta.scheme!==undefined&&!['dark','light'].includes(meta.scheme))errors.push('scheme 只允许 dark/light');
  if(meta.css!==undefined)errors.push('skin.json 不允许 css 字段；样式写入 skin.css');
  for(const key of ['effects','params','decor'])if(meta[key]!==undefined&&!Array.isArray(meta[key]))errors.push(key+' 必须是数组');
  const effectIds=new Set(),paramIds=new Set(),paramTokens=new Set();
  for(const item of Array.isArray(meta.effects)?meta.effects:[]){if(!item||!validId(item.id)||!text(item.label)){errors.push('effects 项必须有合法 id 和非空 label');continue;}if(effectIds.has(item.id))errors.push('重复特效 id：'+item.id);effectIds.add(item.id);if(item.default!==undefined&&typeof item.default!=='boolean')errors.push('effects.'+item.id+'.default 必须是布尔值');}
  const units=new Set(['','px','rem','em','%','deg','rad','turn','ms','s']);
  for(const item of Array.isArray(meta.params)?meta.params:[]){if(!item||!validId(item.id)||!text(item.label)||typeof item.token!=='string'||!/^--kami-[a-z0-9-]+$/.test(item.token)){errors.push('params 项必须有合法 id、label、--kami-* token');continue;}if(paramIds.has(item.id))errors.push('重复参数 id：'+item.id);if(paramTokens.has(item.token))errors.push('重复参数 token：'+item.token);paramIds.add(item.id);paramTokens.add(item.token);if(!['min','max','value'].every(key=>typeof item[key]==='number'&&Number.isFinite(item[key]))||item.min>=item.max||item.value<item.min||item.value>item.max)errors.push('params.'+item.id+' 的数值或范围无效');if(item.step!==undefined&&(!Number.isFinite(item.step)||item.step<=0))errors.push('params.'+item.id+'.step 必须是正数');if(!units.has(item.unit===undefined?'':item.unit))errors.push('params.'+item.id+'.unit 不是支持的 CSS 单位（不能用 ×/° 等显示符号）');}
  const decor=Array.isArray(meta.decor)?meta.decor:[];
  if(new Set(decor).size!==decor.length)errors.push('decor 不能重复');
  for(const item of decor)if(!['d20','d10'].includes(item))errors.push('未登记的交互装饰：'+String(item));
  return errors;
}
function urls(css){const out=[];const re=/\burl\s*\(/gi;let match;while((match=re.exec(css))){let at=re.lastIndex,end=at,quote='',escaped=false;for(;end<css.length;end++){const ch=css[end];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch===')')break;}if(end===css.length)throw Error('url() 未闭合');out.push(css.slice(at,end).trim().replace(/^(["'])([\s\S]*)\1$/,'$2'));re.lastIndex=end+1;}return out;}
export function inspectSkinCss(css,id){
  const errors=[],code=clean(css),prefix='html[data-kami-skin="'+id+'"]',rootTokens=new Map();
  const forbiddenLabels=new Set(['empty','chars','unit','demo','filled','noinput','sent','sendfail'].map(x=>'--kami-label-'+x));
  try{
    for(const url of urls(code))if(!/^data:image\/(?:svg\+xml|png|webp)[;,]/i.test(url))errors.push('皮肤不允许外部或未打包的 url() 资源');
    mapCssSelectors(css,(selector,body,context)=>{for(const part of splitSelectors(clean(selector))){const s=part.trim(),tail=s.startsWith(prefix)?s.slice(prefix.length):null;if(tail===null){errors.push('选择器未以皮肤前缀开头：'+s);continue;}const rest=tail.replace(/^(?:\[data-kami-(?:scheme|motion|density|effects)[^\]]+\])*/,'');
      if(/(?:^|[\s>+~])(?:#chat\b|#sheld\b|\.mes(?:[._:#\s]|$)|body\b|html\b|\.qr--)/.test(rest))errors.push('不得选择酒馆宿主：'+s);
      if(!rest.trim()){if(declarations(body).some(([key])=>!/^--kami-[a-z0-9-]+$/.test(key)))errors.push('<html> 作用域只允许根级 --kami-* 令牌，不能写外观');}
      else if(!/^\s+(?:[a-z]+)?(?:\.kami-|\[data-kami-)/.test(rest))errors.push('选择器必须先进入 kami 组件作用域：'+s);
      if(s===prefix+' .kami-root'&&context.every(rule=>/^@layer\b/.test(rule)))for(const [key,value] of declarations(body))rootTokens.set(key,value);
    }
    for(const [key] of declarations(body))if(forbiddenLabels.has(key))errors.push('禁止覆盖功能文案令牌：'+key);
    return selector;});
    for(const token of ['--kami-fg','--kami-bg','--kami-accent','--kami-accent-fg','--kami-card','--kami-card-2'])if(!rootTokens.get(token))errors.push('基础配色必须定义在默认 .kami-root 上：'+token);
    errors.push(...inspectNavigationCss(css));
  }catch(error){errors.push('CSS 解析失败：'+error.message);}
  return [...new Set(errors)];
}
