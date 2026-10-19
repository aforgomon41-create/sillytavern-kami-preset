// Shared structural checks: a tab list must remain one scrollable row.
export function inspectTabStrip(bar) {
 const issues=[],tabs=[...bar.querySelectorAll(':scope > .kami-tab')].filter(n=>n.getClientRects().length),rect=bar.getBoundingClientRect(),cs=getComputedStyle(bar);
 if(!tabs.length)return{issues:['No tabs'],count:0};
 const boxes=tabs.map(n=>n.getBoundingClientRect()),centers=boxes.map(r=>(r.top+r.bottom)/2);
 if(Math.max(...centers)-Math.min(...centers)>2)issues.push('Tabs wrap into multiple rows');
 if(cs.flexWrap!=='nowrap')issues.push('Tab list permits wrapping: '+cs.flexWrap);
 if(!['auto','scroll'].includes(cs.overflowX))issues.push('Tab list cannot scroll horizontally');
 const padding=parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+parseFloat(cs.borderTopWidth)+parseFloat(cs.borderBottomWidth),maxHeight=Math.max(...[...bar.children].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);return r.height+(parseFloat(c.marginTop)||0)+(parseFloat(c.marginBottom)||0);}));
 const scrollbar=Math.max(0,bar.offsetHeight-bar.clientHeight-(parseFloat(cs.borderTopWidth)||0)-(parseFloat(cs.borderBottomWidth)||0));
 if(rect.height>Math.max(parseFloat(cs.minHeight)||0,maxHeight+padding)+scrollbar+2)issues.push('Tab strip consumes more than one row');
 const picker=bar.querySelector('select');if(picker){const p=picker.getBoundingClientRect();if(Math.abs((p.top+p.bottom)/2-centers[0])>2)issues.push('Trailing select moved onto another row');if(p.left<rect.left-1||p.right>rect.right+1)issues.push('Trailing select outside tab strip');}
 const overflow=bar.scrollWidth>bar.clientWidth+1,initial=bar.scrollLeft;let scrollable=true;
 if(overflow){bar.scrollLeft=bar.scrollWidth;scrollable=bar.scrollLeft>0;if(!scrollable)issues.push('Overflowing tabs do not scroll');bar.scrollLeft=initial;}
 for(const n of tabs){const c=getComputedStyle(n);if(c.whiteSpace!=='nowrap'||parseFloat(c.flexShrink)!==0)issues.push('Tab can shrink or wrap its label');}
 return{issues,count:tabs.length,height:+rect.height.toFixed(2),clientWidth:bar.clientWidth,scrollWidth:bar.scrollWidth,overflow,scrollable};
}
