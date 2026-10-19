/* Small, quote/comment aware stylesheet walker; declarations and keyframes stay intact. */
export function splitSelectors(value) {
  const out=[];let depth=0,quote='',escaped=false,start=0;
  for(let i=0;i<value.length;i++){const ch=value[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='('||ch==='[')depth++;else if(ch===')'||ch===']')depth--;else if(ch===','&&!depth){out.push(value.slice(start,i));start=i+1;}}
  out.push(value.slice(start));return out;
}
export function mapCssSelectors(css, mapper) {
  function boundary(from, closing){let quote='',escaped=false,comment=false,depth=closing?1:0;for(let i=from;i<css.length;i++){const ch=css[i],next=css[i+1];if(comment){if(ch==='*'&&next==='/'){comment=false;i++;}continue;}if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='/'&&next==='*'){comment=true;i++;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch==='{'){if(!closing)return i;depth++;}else if(ch==='}'&&closing&&!--depth)return i;}return css.length;}
  function walk(from,to,context=[]){let out='',at=from;while(at<to){const open=boundary(at,false);if(open>=to){out+=css.slice(at,to);break;}const end=boundary(open+1,true);if(end>=to)throw Error('CSS块未闭合');const pre=css.slice(at,open),clean=pre.replace(/\/\*[\s\S]*?\*\//g,'').trim(),body=css.slice(open+1,end);if(/^@(?:media|supports|container|layer)\b/.test(clean))out+=pre+'{'+walk(open+1,end,context.concat(clean))+'}';else if(clean.startsWith('@'))out+=pre+'{'+body+'}';else out+=mapper(pre,body,context)+'{'+body+'}';at=end+1;}return out;}
  return walk(0,css.length);
}
export function migrateComponentSelectors(css) {
  return mapCssSelectors(css,(selector,body)=>splitSelectors(selector).map(part=>{
    let s=part.replaceAll(':is([data-kami-comp="panel"],[data-kami-comp="dialog"])','__KAMI_PANEL_PAIR__').replaceAll(':is([data-kami-comp="think"],[data-kami-comp="search"])','__KAMI_THINK_PAIR__').replaceAll(':not([data-kami-comp="panel"],[data-kami-comp="dialog"])','__KAMI_NOT_PANEL__').replaceAll(':not([data-kami-comp="panel"])', '__KAMI_NOT_PANEL__');
    s=s.replaceAll('[data-kami-comp="think"]', ':is([data-kami-comp="think"],[data-kami-comp="search"])');
    const attr='[data-kami-comp="panel"]',at=s.indexOf(attr);
    if(at>=0){const tail=s.slice(at+attr.length).trim(),rootSubject=!tail||tail.startsWith('::'),structural=/(?:^|[;{])\s*(?:position|inset|top|left|right|bottom|width|height|min-height|max-height|pointer-events|transform|z-index)\s*:/.test(body);
      if(!(rootSubject&&structural))s=s.replaceAll(attr,':is([data-kami-comp="panel"],[data-kami-comp="dialog"])');
    }
    return s.replaceAll('__KAMI_NOT_PANEL__',':not([data-kami-comp="panel"],[data-kami-comp="dialog"])').replaceAll('__KAMI_PANEL_PAIR__',':is([data-kami-comp="panel"],[data-kami-comp="dialog"])').replaceAll('__KAMI_THINK_PAIR__',':is([data-kami-comp="think"],[data-kami-comp="search"])');
  }).join(','));
}
