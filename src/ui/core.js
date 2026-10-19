/* Shared DOM, state, layout and lifecycle. No network, storage or application policy. */
export function createKamiUi(doc) {
  if (!doc || typeof doc.createElement !== 'function') throw new Error('组件需要可用的文档');
  var cacheKey = '__kami_ui_v1__', version = '1.0.1';
  if (doc[cacheKey] && doc[cacheKey].version === version) return doc[cacheKey];
  var sequence = 0;
  function id(prefix) { sequence++; return 'kami-ui-' + (prefix || 'node') + '-' + sequence; }
  function text(value) { return value == null ? '' : String(value); }
  function append(parent, value) {
    if (Array.isArray(value)) value.forEach(function (part) { append(parent, part); });
    else if (value && typeof value.nodeType === 'number') parent.appendChild(value);
    else if (value !== undefined && value !== null) parent.appendChild(doc.createTextNode(text(value)));
    return parent;
  }
  function safeUrl(value) {
    try { var url = new URL(text(value), doc.baseURI || 'https://localhost/'); return /^https?:$/.test(url.protocol) ? url.href : null; } catch (e) { return null; }
  }
  function attrs(node, values) {
    Object.keys(values || {}).forEach(function (name) {
      var value = values[name], lower = name.toLowerCase();
      if (/^on/.test(lower) || lower === 'innerhtml' || lower === 'outerhtml' || lower === 'srcdoc') throw new Error('组件属性禁止执行代码');
      if (['href','xlink:href','src','action','formaction','poster','data','cite','background'].indexOf(lower)>=0) { value = safeUrl(value); if (!value) return; }
      if (value === false || value === null || value === undefined) node.removeAttribute(name);
      else node.setAttribute(name, value === true ? '' : text(value));
    });
    return node;
  }
  function classify(node) {
    var classes = node.classList, tag = (node.tagName || '').toLowerCase();
    if (!classes || typeof classes.contains !== 'function' || typeof node.hasAttribute !== 'function') return node;
    var role = null;
    if (classes.contains('kami-card')) {
      role = tag === 'button' || node.getAttribute('role') === 'button' ? 'choice' : tag === 'details' || classes.contains('kami-collapse') ? 'collapse' : 'container';
      node.setAttribute('data-kami-card-role', role);
    }
    if (!node.hasAttribute('data-kami-ui')) {
      var map = [['kami-icon-btn','iconButton'],['kami-btn','button'],['kami-textarea','textarea'],['kami-number','number'],['kami-select','select'],['kami-text','text'],['kami-switch','switch'],['kami-range','range'],['kami-tabs','tabs'],['kami-seg','segmented'],['kami-empty','empty'],['kami-chip','badge'],['kami-field','field'],['kami-card','card']];
      for (var i = 0; i < map.length; i++) if (classes.contains(map[i][0])) { node.setAttribute('data-kami-ui', role === 'choice' ? 'choiceCard' : role === 'collapse' ? 'collapse' : map[i][1]); break; }
    }
    return node;
  }
  function element(tag, cls, content, properties) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (tag === 'button') node.type = 'button';
    if (content !== undefined && content !== null) { if (typeof content === 'string' || typeof content === 'number') node.textContent = text(content); else append(node, content); }
    attrs(node, properties); return classify(node);
  }
  function mark(node, name) { node.setAttribute('data-kami-ui', name); return node; }
  function options(value) { return typeof value === 'string' ? {label:value} : value || {}; }
  function own(node, methods, cleanups) {
    var dead = false, cleanup = cleanups || [], controller = methods || {};
    controller.destroy = function () { if (dead) return; dead = true; releaseListeners(node); Array.from(node.children || []).forEach(destroy); cleanup.splice(0).reverse().forEach(function (fn) { try { fn(); } catch(e) { } }); };
    controller.disposed = function () { return dead; };
    node.kami = controller; return node;
  }
  function releaseListeners(node){var list=node.__kamiUiListeners||[];node.__kamiUiListeners=[];list.forEach(function(fn){fn();});}
  function listen(node,name,fn,cleanups){node.addEventListener(name,fn);var off=function(){node.removeEventListener(name,fn);};(node.__kamiUiListeners||(node.__kamiUiListeners=[])).push(off);if(cleanups)cleanups.push(off);}
  function adopt(root) { classify(root); if (root.querySelectorAll) root.querySelectorAll('[class]').forEach(classify); return root; }
  function destroy(root){if(!root)return;if(root.kami){root.kami.destroy();return;}releaseListeners(root);Array.from(root.children||[]).forEach(destroy);}
  function control(kind, opts) {
    opts = options(opts);
    var tag = kind === 'textarea' ? 'textarea' : 'input';
    var node = mark(element(tag, kind === 'textarea' ? 'kami-textarea' : kind === 'number' ? 'kami-number' : kind === 'range' ? 'kami-range' : kind === 'checkbox' || kind === 'radio' ? 'kami-check' : 'kami-text'), kind);
    if (tag === 'input') node.type = kind === 'text' ? 'text' : kind;
    attrs(node, opts.attrs);
    ['min','max','step','placeholder','name','autocomplete','rows'].forEach(function (key) { if (opts[key] !== undefined) node.setAttribute(key,text(opts[key])); });
    if (opts.label) node.setAttribute('aria-label', opts.label);
    if (opts.id) node.id = opts.id;
    if (opts.value !== undefined) node.value = text(opts.value);
    if (opts.checked !== undefined) node.checked = !!opts.checked;
    if(opts.disabled!==undefined)node.disabled = !!opts.disabled; if(opts.required!==undefined)node.required = !!opts.required;
    if (opts.onChange) listen(node, kind === 'range' ? 'input' : 'change', function () { opts.onChange(kind === 'checkbox' || kind === 'radio' ? node.checked : kind === 'number' || kind === 'range' ? node.value === '' ? null : Number(node.value) : node.value, node); });
    return own(node,{});
  }
  function button(opts) {
    opts = options(opts);
    var node = mark(element('button','kami-btn' + (opts.variant === 'primary' ? ' kami-btn--primary' : opts.variant === 'ghost' ? ' kami-btn--ghost' : ''),opts.label,opts.attrs),'button');
    if(opts.disabled!==undefined)node.disabled = !!opts.disabled;
    if (opts.onClick) listen(node,'click',function (event) { if (!node.disabled) opts.onClick(event,node); });
    return own(node,{setBusy:function (busy) { node.disabled = !!busy || !!opts.disabled; node.setAttribute('aria-busy',busy?'true':'false'); }});
  }
  function iconButton(opts) { opts=options(opts); if (!opts.label) throw new Error('图标按钮需要名称'); var n=button(Object.assign({},opts,{label:opts.icon || opts.label})); n.className='kami-icon-btn';n.setAttribute('aria-label',opts.label);return mark(n,'iconButton'); }
  function buttonGroup(opts) { opts=options(opts);var n=mark(element('div','kami-actions',null,{role:'group','aria-label':opts.label || '操作'}),'buttonGroup');append(n,(opts.items||[]).map(function(x){return x.nodeType?x:button(x);}));return n; }
  function tabs(opts) {
    opts=options(opts);var root=mark(element('div','kami-ui-tabs'),'tabs'),bar=element('div','kami-tabs',null,{role:'tablist','aria-label':opts.label||'页面'}),body=element('div','kami-ui-tab-body'),buttons=[],panes=[],cleanup=[],items=opts.items||[],current=-1;
    bar.setAttribute('data-kami-tabs-mode',opts.mode==='fit'?'fit':'scroll');
    append(root,[bar,body]);
    function select(value, focus) {
      var index=items.findIndex(function(x){return text(x.id)===text(value);});if(index<0||items[index].disabled)return false;current=index;
      buttons.forEach(function(b,i){var on=i===index;b.setAttribute('aria-selected',on?'true':'false');b.tabIndex=on?0:-1;b.classList.toggle('is-on',on);panes[i].hidden=!on;});
      if(focus)buttons[index].focus();if(opts.onChange)opts.onChange(items[index].id);return true;
    }
    items.forEach(function(item,index){
      var b=element('button','kami-tab',item.label,{role:'tab'}),p=element('div','kami-ui-tab-pane',null,{role:'tabpanel'});
      b.id=id('tab');p.id=id('pane');b.setAttribute('aria-controls',p.id);p.setAttribute('aria-labelledby',b.id);p.hidden=true;b.tabIndex=-1;b.disabled=!!item.disabled;
      append(p,item.content);bar.appendChild(b);body.appendChild(p);buttons.push(b);panes.push(p);
      listen(b,'click',function(){select(item.id,false);},cleanup);
      listen(b,'keydown',function(e){var enabled=buttons.map(function(x,i){return x.disabled?-1:i;}).filter(function(i){return i>=0;}),at=enabled.indexOf(index),next;
        if(e.key==='ArrowRight'||e.key==='ArrowDown')next=enabled[(at+1)%enabled.length];else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=enabled[(at-1+enabled.length)%enabled.length];else if(e.key==='Home')next=enabled[0];else if(e.key==='End')next=enabled[enabled.length-1];else return;
        e.preventDefault();if(next!==undefined)select(items[next].id,true);
      },cleanup);
    });
    var initial=items.find(function(x){return text(x.id)===text(opts.value)&&!x.disabled;})||items.find(function(x){return !x.disabled;});
    if(initial)select(initial.id,false);return own(root,{select:select,value:function(){return current<0?null:items[current].id;},bar:bar,panes:panes},cleanup);
  }
  function segmented(opts) {
    opts=options(opts);var n=mark(element('div','kami-seg',null,{role:'radiogroup','aria-label':opts.label||'选择'}),'segmented'),items=opts.items||[],bs=[],cleanup=[],selected=null;
    function select(value,focus){var at=items.findIndex(function(x){return text(x.value)===text(value);});if(at<0||items[at].disabled)return false;selected=items[at].value;bs.forEach(function(b,i){var on=i===at;b.setAttribute('aria-checked',on?'true':'false');b.classList.toggle('is-on',on);b.tabIndex=on?0:-1;});if(focus)bs[at].focus();if(opts.onChange)opts.onChange(selected);return true;}
    items.forEach(function(x,i){var b=element('button','kami-seg-item',x.label,{role:'radio','aria-checked':'false'});b.disabled=!!x.disabled;b.tabIndex=-1;bs.push(b);n.appendChild(b);listen(b,'click',function(){select(x.value,false);},cleanup);
      listen(b,'keydown',function(e){var enabled=items.map(function(x,i){return x.disabled?-1:i;}).filter(function(i){return i>=0;}),at=enabled.indexOf(i),next;if(e.key==='ArrowRight'||e.key==='ArrowDown')next=enabled[(at+1)%enabled.length];else if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=enabled[(at-1+enabled.length)%enabled.length];else if(e.key==='Home')next=enabled[0];else if(e.key==='End')next=enabled[enabled.length-1];else return;e.preventDefault();if(next!==undefined)select(items[next].value,true);},cleanup);
    });var first=items.find(function(x){return !x.disabled&&text(x.value)===text(opts.value);})||items.find(function(x){return !x.disabled;});if(first)select(first.value,false);return own(n,{select:select,value:function(){return selected;}},cleanup);
  }
  function menu(opts) {
    opts=options(opts);var root=mark(element('span','kami-ui-menu'),'menu'),trigger=button({label:opts.label||'操作'}),box=element('div','kami-ui-menu-items',null,{role:'menu'}),cleanup=[],outside=null,bs=[];
    box.id=id('menu');box.hidden=true;trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls',box.id);trigger.setAttribute('aria-expanded','false');append(root,[trigger,box]);
    function close(focus){box.hidden=true;trigger.setAttribute('aria-expanded','false');if(outside){doc.removeEventListener('pointerdown',outside);outside=null;}if(focus)trigger.focus();}
    function open(){box.hidden=false;trigger.setAttribute('aria-expanded','true');if(!outside){outside=function(e){if(!root.contains(e.target))close(false);};doc.addEventListener('pointerdown',outside);}var first=bs.find(function(b){return !b.disabled;});if(first)first.focus();}
    (opts.items||[]).forEach(function(item){var b=button({label:item.label,disabled:item.disabled,onClick:function(){close(true);if(item.onSelect)item.onSelect(item);if(opts.onSelect)opts.onSelect(item);}});b.setAttribute('role','menuitem');b.tabIndex=-1;bs.push(b);box.appendChild(b);});
    listen(trigger,'click',function(){if(box.hidden)open();else close(false);},cleanup);
    listen(root,'keydown',function(e){var enabled=bs.filter(function(b){return !b.disabled;}),at=enabled.indexOf(doc.activeElement),next;if(e.key==='Escape'){e.preventDefault();close(true);return;}if(e.key==='ArrowDown')next=enabled[(at+1)%enabled.length];else if(e.key==='ArrowUp')next=enabled[(at-1+enabled.length)%enabled.length];else if(e.key==='Home')next=enabled[0];else if(e.key==='End')next=enabled[enabled.length-1];else return;e.preventDefault();if(box.hidden)open();if(next)next.focus();},cleanup);
    cleanup.push(function(){close(false);});return own(root,{open:open,close:close,trigger:trigger},cleanup);
  }
  function select(opts) {
    opts=options(opts);var n=mark(element('select','kami-select',null,opts.attrs),'select');if(opts.label)n.setAttribute('aria-label',opts.label);if(opts.id)n.id=opts.id;if(opts.disabled!==undefined)n.disabled=!!opts.disabled;
    (opts.items||[]).forEach(function(item){if(Array.isArray(item))item={value:item[0],label:item[1]};if(item.items){var group=element('optgroup',null,null,{label:item.label});item.items.forEach(function(x){var o=element('option',null,x.label,{value:x.value,disabled:!!x.disabled});group.appendChild(o);});n.appendChild(group);}else n.appendChild(element('option',null,item.label,{value:item.value,disabled:!!item.disabled}));});
    if(opts.value!==undefined)n.value=text(opts.value);if(opts.onChange)listen(n,'change',function(){opts.onChange(n.value,n);});return n;
  }
  function combobox(opts) {
    opts=options(opts);var root=mark(element('div','kami-ui-combobox'),'combobox'),input=control('text',Object.assign({},opts,{onChange:null})),listbox=element('div','kami-ui-combobox-list',null,{role:'listbox'}),items=opts.items||[],filtered=[],active=-1,selected=opts.value,dirty=false,cleanup=[],outside=null;
    listbox.id=id('list');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',listbox.id);input.setAttribute('aria-expanded','false');listbox.hidden=true;append(root,[input,listbox]);
    function close(){listbox.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');if(outside){doc.removeEventListener('pointerdown',outside);outside=null;}}
    function highlight(index){active=index;Array.from(listbox.children).forEach(function(x,i){x.classList.toggle('is-on',i===index);x.setAttribute('aria-selected',i===index?'true':'false');});if(listbox.children[index])input.setAttribute('aria-activedescendant',listbox.children[index].id);else input.removeAttribute('aria-activedescendant');}
    function choose(index){var item=filtered[index];if(!item)return;selected=item.value;dirty=false;input.value=text(item.label);close();if(opts.onChange)opts.onChange(item.value,item);}
    function render(query){listbox.textContent='';filtered=items.filter(function(x){return !x.disabled&&text(x.label).toLocaleLowerCase().includes(text(query).toLocaleLowerCase());});filtered.forEach(function(x,i){var b=element('div','kami-ui-combobox-option',x.label,{role:'option','aria-selected':'false'});b.id=id('option');listen(b,'pointerdown',function(e){e.preventDefault();choose(i);});listbox.appendChild(b);});if(!filtered.length)listbox.appendChild(element('div','kami-empty',opts.emptyLabel||'没有匹配项',{role:'status'}));highlight(-1);listbox.hidden=false;input.setAttribute('aria-expanded','true');if(!outside){outside=function(e){if(!root.contains(e.target))close();};doc.addEventListener('pointerdown',outside);}}
    listen(input,'input',function(){dirty=true;render(input.value);},cleanup);listen(input,'click',function(){if(!input.disabled&&listbox.hidden)render(dirty?input.value:'');},cleanup);
    listen(input,'keydown',function(e){if(e.key==='Escape'){if(!listbox.hidden){e.preventDefault();e.stopPropagation();close();}return;}if(e.key==='Tab'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(listbox.hidden)render('');if(filtered.length)highlight((active+(e.key==='ArrowDown'?1:-1)+filtered.length)%filtered.length);}else if(e.key==='Enter'&&!listbox.hidden&&active>=0){e.preventDefault();choose(active);}},cleanup);
    var initial=items.find(function(x){return !x.disabled&&text(x.value)===text(opts.value);});if(initial)input.value=text(initial.label);else selected=null;cleanup.push(close);
    return own(root,{input:input,close:close,setItems:function(next){items=next||[];var current=items.find(function(x){return !x.disabled&&text(x.value)===text(selected);});if(current)input.value=text(current.label);else{selected=null;input.value='';}dirty=false;close();},value:function(){return selected;}},cleanup);
  }
  function switchControl(opts) {
    opts=options(opts);var n=mark(element('label','kami-switch'),'switch'),input=control('checkbox',opts);input.className='kami-switch-input';var track=element('span','kami-switch-track'),knob=element('span','kami-switch-knob');track.appendChild(knob);append(n,[input,track]);return own(n,{input:input,setChecked:function(on){input.checked=!!on;}});
  }
  function card(opts) {
    opts=options(opts);var n=mark(element('div','kami-card',null,opts.attrs),'card'),body=element('div','kami-card-body');n.setAttribute('data-kami-card-role','container');n.body=body;
    if(opts.title!==undefined){if(opts.flatTitle)n.appendChild(element('div','kami-card-title',opts.title));else{n.head=element('div','kami-card-head');n.head.appendChild(element('span','kami-card-title',opts.title));n.appendChild(n.head);}}n.appendChild(body);append(body,opts.content);
    if(opts.footer!==undefined){n.foot=element('div','kami-foot',opts.footer);n.appendChild(n.foot);}return n;
  }
  function collapse(opts) {
    opts=options(opts);var n=mark(element('details','kami-card',null,opts.attrs),'collapse'),head=element('summary','kami-card-head'),body=element('div','kami-card-body');n.setAttribute('data-kami-card-role','collapse');head.appendChild(element('span','kami-card-title',opts.title||opts.label));append(n,[head,body]);append(body,opts.content);n.open=!!opts.open;n.body=body;n.head=head;
    if(opts.onChange)listen(n,'toggle',function(){opts.onChange(n.open);});return own(n,{setOpen:function(on){n.open=!!on;},body:body,head:head});
  }
  function group(opts) {opts=options(opts);var n=mark(element('fieldset','kami-ui-group'),'group');if(opts.label)n.appendChild(element('legend',null,opts.label));append(n,opts.content);n.disabled=!!opts.disabled;return n;}
  function divider(opts) {opts=options(opts);return mark(element('hr','kami-ui-divider',null,opts.attrs),'divider');}
  function badge(opts){opts=options(opts);return mark(element('span','kami-chip',opts.label,opts.attrs),'badge');}
  function status(opts){opts=options(opts);var n=mark(element('span','kami-ui-status',opts.label,{role:'status','aria-live':'polite','data-kami-state':opts.state||'idle'}),'status');return own(n,{update:function(label,state){n.textContent=text(label);n.setAttribute('data-kami-state',state||'idle');}});}
  function progress(opts){
    opts=options(opts);var n=mark(element('div','kami-ui-progress',null,{role:'progressbar','aria-label':opts.label||'进度'}),'progress'),fill=element('span','kami-ui-progress-fill');n.appendChild(fill);
    function update(value,max){max=Number(max)||100;n.setAttribute('aria-valuemin','0');n.setAttribute('aria-valuemax',text(max));if(value==null){n.removeAttribute('aria-valuenow');n.setAttribute('data-kami-indeterminate','1');fill.style.setProperty('--kami-progress','30%');}else{value=Math.max(0,Math.min(Number(value)||0,max));n.setAttribute('aria-valuenow',text(value));n.removeAttribute('data-kami-indeterminate');fill.style.setProperty('--kami-progress',text(value/max*100)+'%');}}
    update(opts.value,opts.max);return own(n,{update:update});
  }
  function spinner(opts){opts=options(opts);return mark(element('span','kami-ui-spinner',null,{role:'status','aria-label':opts.label||'正在处理'}),'spinner');}
  function tooltip(opts){
    opts=options(opts);var n=mark(element('span','kami-ui-tooltip'),'tooltip'),trigger=opts.trigger||button({label:opts.label||'说明'}),tip=element('span','kami-ui-tooltip-text',opts.content,{role:'tooltip'}),cleanup=[];tip.id=id('tip');tip.hidden=true;var previous=trigger.getAttribute('aria-describedby');trigger.setAttribute('aria-describedby',[previous,tip.id].filter(Boolean).join(' '));append(n,[trigger,tip]);
    function show(){tip.hidden=false;}function hide(){tip.hidden=true;}listen(trigger,'focus',show,cleanup);listen(trigger,'blur',hide,cleanup);listen(trigger,'pointerenter',show,cleanup);listen(trigger,'pointerleave',function(){if(doc.activeElement!==trigger)hide();},cleanup);listen(trigger,'keydown',function(e){if(e.key==='Escape')hide();},cleanup);
    cleanup.push(function(){if(previous)trigger.setAttribute('aria-describedby',previous);else trigger.removeAttribute('aria-describedby');});return own(n,{show:show,hide:hide},cleanup);
  }
  function alertControl(opts){opts=options(opts);return mark(element('div','kami-ui-alert',opts.label||opts.content,{role:opts.kind==='error'?'alert':'status','data-kami-state':opts.kind||'info'}),'alert');}
  function list(opts){opts=options(opts);var n=mark(element(opts.ordered?'ol':'ul','kami-ui-list'),'list');(opts.items||[]).forEach(function(x,i){var item=element('li');append(item,opts.render?opts.render(x,i):typeof x==='object'?x.label:x);n.appendChild(item);});if(!(opts.items||[]).length)n.appendChild(element('li','kami-empty',opts.emptyLabel||'暂无内容'));return n;}
  function table(opts){
    opts=options(opts);var n=mark(element('div','kami-ui-table-wrap'),'table'),t=element('table','kami-ui-table'),head=element('thead'),body=element('tbody'),columns=opts.columns||[];n.table=t;
    if(opts.caption)t.appendChild(element('caption',null,opts.caption));var row=element('tr');columns.forEach(function(x){row.appendChild(element('th',null,x.label,{scope:'col'}));});head.appendChild(row);append(t,[head,body]);n.appendChild(t);
    (opts.rows||[]).forEach(function(item,index){var tr=element('tr');columns.forEach(function(col){var td=element('td');append(td,col.render?col.render(item,index):item[col.key]);tr.appendChild(td);});body.appendChild(tr);});
    if(!(opts.rows||[]).length){var tr=element('tr');tr.appendChild(element('td','kami-empty',opts.emptyLabel||'暂无内容',{colspan:Math.max(1,columns.length)}));body.appendChild(tr);}return n;
  }
  function tree(opts){
    opts=options(opts);var root=mark(element('ul','kami-ui-tree',null,{role:'tree','aria-label':opts.label||'目录'}),'tree'),cleanup=[],nodes=[];
    function branch(parent,items){(items||[]).forEach(function(item){var li=element('li',null,null,{role:'treeitem',tabindex:'-1','aria-selected':'false'}),label=element('span','kami-ui-tree-label',item.label),kids=null;li.kamiItem=item;li.appendChild(label);nodes.push(li);parent.appendChild(li);
      if(item.children&&item.children.length){kids=element('ul',null,null,{role:'group'});kids.hidden=item.expanded===false;li.setAttribute('aria-expanded',kids.hidden?'false':'true');li.appendChild(kids);branch(kids,item.children);}
      function choose(){nodes.forEach(function(n){n.setAttribute('aria-selected',n===li?'true':'false');n.tabIndex=n===li?0:-1;});if(opts.onSelect)opts.onSelect(item);}
      listen(label,'click',function(){choose();li.focus();},cleanup);
      listen(li,'keydown',function(e){if(e.target!==li)return;var visible=nodes.filter(function(n){var p=n.parentElement;while(p&&p!==root){if(p.hidden)return false;p=p.parentElement;}return true;}),at=visible.indexOf(li),next;if(e.key==='ArrowDown')next=visible[Math.min(visible.length-1,at+1)];else if(e.key==='ArrowUp')next=visible[Math.max(0,at-1)];else if(e.key==='Home')next=visible[0];else if(e.key==='End')next=visible[visible.length-1];else if(e.key==='ArrowRight'&&kids){kids.hidden=false;li.setAttribute('aria-expanded','true');next=kids.firstElementChild;}else if(e.key==='ArrowLeft'){if(kids&&!kids.hidden){kids.hidden=true;li.setAttribute('aria-expanded','false');}else if(li.parentElement!==root)next=li.parentElement.parentElement;}else if(e.key==='Enter'||e.key===' '){choose();}else return;e.preventDefault();e.stopPropagation();if(next){nodes.forEach(function(n){n.tabIndex=n===next?0:-1;});next.focus();}},cleanup);
    });}branch(root,opts.items);if(nodes[0])nodes[0].tabIndex=0;return own(root,{nodes:nodes},cleanup);
  }
  function empty(opts){opts=options(opts);return mark(element('div','kami-empty',opts.label||'暂无内容',{role:'status'}),'empty');}
  function field(opts){
    opts=options(opts);var row=mark(element('div','kami-field',null,opts.attrs),'field'),c=opts.control,label=null;if(opts.label!==undefined&&opts.label!==null&&opts.label!==''){label=element(opts.labelTag||'label','kami-field-label',opts.label);row.appendChild(label);}
    if(c){row.appendChild(c);var input=c.matches&&c.matches('input,textarea,select,button')?c:c.querySelector&&c.querySelector('input,textarea,select,button');if(label&&input){if(!input.id)input.id=id('field');if(label.tagName.toLowerCase()==='label')label.setAttribute('for',input.id);else{label.id=id('label');input.setAttribute('aria-labelledby',label.id);}}}
    if(opts.hint){var note=element('div','kami-card-note',opts.hint);note.id=id('hint');row.appendChild(note);if(input)input.setAttribute('aria-describedby',Array.from(new Set((input.getAttribute('aria-describedby')||'').split(' ').concat(note.id).filter(Boolean))).join(' '));}
    var errorNode=null;function setError(message){if(errorNode){if(input){var ids=(input.getAttribute('aria-describedby')||'').split(' ').filter(function(x){return x&&x!==errorNode.id;});if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');}errorNode.remove();errorNode=null;}if(input)input.setAttribute('aria-invalid',message?'true':'false');if(message){errorNode=element('div','kami-ui-field-error',message,{role:'alert'});errorNode.id=id('error');row.appendChild(errorNode);if(input)input.setAttribute('aria-describedby',[(input.getAttribute('aria-describedby')||''),errorNode.id].filter(Boolean).join(' '));}}
    if(opts.error)setError(opts.error);return own(row,{setError:setError});
  }
  function settingsCard(opts){opts=options(opts);return mark(card(opts),'settingsCard');}
  function choiceCard(opts){
    opts=options(opts);var n=mark(element('button','kami-item kami-card',null,opts.attrs),'choiceCard'),head=element('span','kami-card-head');n.setAttribute('data-kami-card-role','choice');head.appendChild(element('span','kami-item-main',opts.label));n.appendChild(head);if(opts.description)n.appendChild(element('span','kami-card-note',opts.description));n.disabled=!!opts.disabled;
    function selected(on){n.classList.toggle('is-on',!!on);n.setAttribute('aria-pressed',on?'true':'false');}
    selected(opts.selected);if(opts.onChange)listen(n,'click',function(){var on=n.getAttribute('aria-pressed')!=='true';selected(on);opts.onChange(on,n);});return own(n,{setSelected:selected});
  }
  function adapter(name,opts,build){if(opts&&typeof opts.render==='function'){var result=opts.render(opts.env||{}),node=result.card||result;mark(node,name);return result;}return mark(build(),'modelConnection'===name?'modelConnection':name);}
  function modelConnection(opts){
    opts=options(opts);return adapter('modelConnection',opts,function(){var n=settingsCard({title:opts.title||'模型连接'}),address=control('text',{label:'接口地址',value:opts.address}),model=control('text',{label:'模型',value:opts.model}),key=control('password',{label:'密钥',value:opts.key,autocomplete:'off'}),cleanup=[],seq=0,abort=null;
      append(n.body,[field({label:'接口地址',control:address}),field({label:'密钥',control:key}),field({label:'模型',control:model})]);
      if(opts.fetchModels){var fetchButton=button({label:'获取模型列表',onClick:async function(){var token=++seq;if(abort)abort.abort();abort=new (doc.defaultView.AbortController||AbortController)();fetchButton.kami.setBusy(true);
        try{var rows=await opts.fetchModels({address:address.value,key:key.value,signal:abort.signal});if(token!==seq)return;var picker=select({label:'模型列表',items:(rows||[]).map(function(x){return typeof x==='string'?{value:x,label:x}:x;}),value:model.value,onChange:function(v){model.value=v;if(opts.onChange)opts.onChange({address:address.value,key:key.value,model:v});}});var old=n.body.querySelector('[data-kami-model-catalog]');if(old)old.remove();picker.setAttribute('data-kami-model-catalog','1');n.body.appendChild(picker);}catch(e){if(token===seq&&(!e||e.name!=='AbortError')){if(opts.onError)opts.onError(e);else n.body.appendChild(alertControl({kind:'error',label:'获取模型列表失败'}));}}finally{if(token===seq)fetchButton.kami.setBusy(false);}}});n.body.appendChild(fetchButton);}
      function changed(){seq++;if(abort)abort.abort();if(fetchButton)fetchButton.kami.setBusy(false);var old=n.body.querySelector('[data-kami-model-catalog]');if(old)old.remove();if(opts.onChange)opts.onChange({address:address.value,key:key.value,model:model.value});}
      [address,key,model].forEach(function(x){listen(x,'input',changed,cleanup);});cleanup.push(function(){seq++;if(abort)abort.abort();});return own(n,{address:address,model:model,key:key},cleanup);
    });
  }
  function promptEditor(opts){
    opts=options(opts);return adapter('promptEditor',opts,function(){var n=settingsCard({title:opts.title||'提示词'}),values=opts.value||{},controls={};['head','task','tail'].forEach(function(k){var input=control('textarea',{label:({head:'头部',task:'任务',tail:'尾部'})[k],value:values[k]||'',onChange:function(){var next={};Object.keys(controls).forEach(function(key){next[key]=controls[key].value;});if(opts.onChange)opts.onChange(next);}});controls[k]=input;n.body.appendChild(field({label:({head:'头部',task:'任务',tail:'尾部'})[k],control:input}));});return own(n,{controls:controls});});
  }
  function templateManager(opts){
    opts=options(opts);var n=settingsCard({title:opts.title||'模板'}),items=opts.items||[],picker=select({label:'模板',items:items.map(function(x){return{value:x.id,label:x.label};}),value:opts.value,onChange:function(v){if(opts.onSelect)opts.onSelect(v);}}),name=control('text',{label:'模板名称',placeholder:'模板名称'});append(n.body,[picker,name,buttonGroup({items:[{label:'保存',onClick:function(){if(name.value.trim()&&opts.onSave)opts.onSave(name.value.trim());}},{label:'删除',onClick:function(){if(opts.onDelete)opts.onDelete(picker.value);}}]})]);n.picker=picker;n.nameInput=name;return mark(n,'templateManager');
  }
  function markdown(opts){opts=options(opts);var n=mark(element('div','kami-md'),'markdown');var content=opts.render?opts.render(text(opts.content),doc):text(opts.content);if(opts.render&&!(content&&typeof content.nodeType==='number'))throw new Error('Markdown渲染器必须返回安全DOM');append(n,content);return n;}
  function sources(opts){opts=options(opts);var n=mark(element('ol','kami-ui-sources'),'sources');(opts.items||[]).forEach(function(x,i){var url=safeUrl(x.url);if(!url)return;var li=element('li'),a=element('a',null,x.label||x.title||new URL(url).hostname,{href:url,target:'_blank',rel:'noopener noreferrer'});append(li,[text(x.id||i+1)+'. ',a]);n.appendChild(li);});return n;}
  function searchResults(opts){opts=options(opts);var n=collapse({title:opts.title||'搜索资料',open:!!opts.open}),facts=list({items:opts.facts||[],render:function(x){return typeof x==='string'?x:x.text;}});append(n.body,[facts,sources({items:opts.sources||[]})]);return mark(n,'searchResults');}
  function steps(opts){
    opts=options(opts);var n=mark(element('ol','kami-ui-steps'),'steps');
    function update(items){n.textContent='';(items||[]).forEach(function(item,i){var state=['waiting','current','done','error','skipped'].includes(item.state)?item.state:'waiting',li=element('li','is-'+state,null,{'data-kami-state':state});if(state==='current')li.setAttribute('aria-current','step');append(li,[element('span','kami-ui-step-mark',state==='done'?'✓':state==='error'?'!':i+1,{'aria-hidden':'true'}),element('span',null,[element('strong',null,item.label),item.description?element('small',null,item.description):null])]);n.appendChild(li);});}
    update(opts.items);return own(n,{update:update});
  }
  function resourceGrid(opts){
    opts=options(opts);var n=mark(element('div','kami-grid kami-ui-resources'),'resourceGrid');
    (opts.items||[]).forEach(function(item){var c=choiceCard({label:item.label,selected:text(item.id)===text(opts.value),disabled:item.disabled,onChange:function(){Array.from(n.children).forEach(function(x){x.kami.setSelected(x===c);});if(opts.onChange)opts.onChange(item.id,item);}});c.setAttribute('data-kami-resource',text(item.id));if(opts.renderPreview){var preview=opts.renderPreview(item,doc);if(preview&&preview.nodeType)c.prepend(preview);}n.appendChild(c);});return n;
  }
  function toolbar(opts){
    opts=options(opts);var n=buttonGroup(opts),cleanup=[];n.setAttribute('role','toolbar');mark(n,'toolbar');var bs=Array.from(n.querySelectorAll('button'));bs.forEach(function(b,i){b.tabIndex=i? -1:0;});
    listen(n,'keydown',function(e){var enabled=bs.filter(function(x){return !x.disabled;}),at=enabled.indexOf(doc.activeElement),next;if(e.key==='ArrowRight')next=enabled[(at+1)%enabled.length];else if(e.key==='ArrowLeft')next=enabled[(at-1+enabled.length)%enabled.length];else return;e.preventDefault();if(next){bs.forEach(function(x){x.tabIndex=x===next?0:-1;});next.focus();}},cleanup);var first=bs.find(function(b){return !b.disabled;});if(first){bs.forEach(function(b){b.tabIndex=b===first?0:-1;});}return own(n,{},cleanup);
  }
  function layout(kind,children,opts){opts=options(opts);if(!['stack','row','wrap','grid','split','center'].includes(kind))throw new Error('未知布局');var n=element('div','kami-layout',null,{'data-kami-layout-kind':kind});if(opts.min)n.style.setProperty('--kami-layout-min',text(opts.min));if(opts.columns)n.style.setProperty('--kami-layout-columns',text(Math.max(1,Math.min(12,Number(opts.columns)||1))));append(n,children);return n;}
  function slot(name,content){if(!/^[a-z][a-z0-9-]*$/.test(name))throw new Error('非法组件插槽');return element('span','kami-slot',content,{'data-kami-slot':name});}
  function container(kind,opts){
    opts=options(opts);var root=element('div','kami-root',null,{'data-kami-comp':kind==='embedded'?(opts.component||'custom'):kind,'data-kami-container':kind}),shell=element('div',kind==='panel'?'kami-drop kami-surface':'kami-shell kami-surface'),head=element('div','kami-head'),body=element('div','kami-body'),foot=element('div','kami-foot'),title=element('span','kami-title',opts.title);
    title.id=id('title');head.appendChild(title);append(shell,[head,body,foot]);root.appendChild(shell);append(body,opts.content);append(foot,opts.footer);root.shell=shell;root.head=head;root.body=body;root.foot=foot;root.titleNode=title;return mark(root,kind);
  }
  function embedded(opts){return container('embedded',opts);}
  function panelGeometry(node,opts,close,cleanup){
    var win=doc.defaultView,active=null,offMove=null,offEnd=null;
    function stop(){if(offMove){doc.removeEventListener('pointermove',offMove);doc.removeEventListener('pointerup',offEnd);doc.removeEventListener('pointercancel',offEnd);}offMove=offEnd=null;active=null;node.removeAttribute('data-kami-dragging');}
    function start(event,resize){if(event.button!==undefined&&event.button!==0)return;if(!resize&&event.target.closest&&event.target.closest('button,input,textarea,select,a'))return;var box=node.shell.getBoundingClientRect(),x=event.clientX,y=event.clientY;active={resize:resize,box:box,x:x,y:y};event.preventDefault();node.setAttribute('data-kami-dragging','1');
      offMove=function(e){if(!active)return;var dx=e.clientX-x,dy=e.clientY-y,vw=win.innerWidth,vh=win.innerHeight;if(vw<=600&&!resize)return;
        if(resize){node.style.setProperty('--kami-panel-w',Math.max(Math.min(260,vw-24),Math.min(vw-box.left-12,box.width+dx))+'px');node.style.setProperty('--kami-panel-h',Math.max(Math.min(180,vh-24),Math.min(vh-box.top-12,box.height+dy))+'px');}
        else{node.style.setProperty('--kami-panel-x',Math.max(0,Math.min(vw-box.width,box.left+dx))+'px');node.style.setProperty('--kami-panel-y',Math.max(0,Math.min(vh-box.height,box.top+dy))+'px');}};
      offEnd=function(e){var sheet=win.innerWidth<=600&&!resize&&e.type!=='pointercancel'&&e.clientY-y>80;stop();if(sheet)close();else if(opts.onGeometryChange)opts.onGeometryChange({x:node.style.getPropertyValue('--kami-panel-x'),y:node.style.getPropertyValue('--kami-panel-y'),width:node.style.getPropertyValue('--kami-panel-w'),height:node.style.getPropertyValue('--kami-panel-h')});};
      doc.addEventListener('pointermove',offMove);doc.addEventListener('pointerup',offEnd);doc.addEventListener('pointercancel',offEnd);
    }
    if(opts.draggable!==false){node.head.style.touchAction='none';listen(node.head,'pointerdown',function(e){start(e,false);},cleanup);}
    if(opts.resizable!==false){var handle=element('button','kami-resize',null,{'aria-label':'调整面板大小'});node.shell.appendChild(handle);listen(handle,'pointerdown',function(e){start(e,true);},cleanup);listen(handle,'keydown',function(e){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();var box=node.shell.getBoundingClientRect();node.style.setProperty('--kami-panel-w',Math.max(Math.min(260,win.innerWidth-24),Math.min(win.innerWidth-24,box.width+(e.key==='ArrowRight'?16:e.key==='ArrowLeft'?-16:0)))+'px');node.style.setProperty('--kami-panel-h',Math.max(Math.min(180,win.innerHeight-24),Math.min(win.innerHeight-24,box.height+(e.key==='ArrowDown'?16:e.key==='ArrowUp'?-16:0)))+'px');},cleanup);}
    cleanup.push(stop);
  }
  function panel(opts){
    opts=options(opts);var n=container('panel',opts),cleanup=[],opened=false,trigger=null,key=null;n.shell.setAttribute('data-kami-open','0');n.shell.setAttribute('role','dialog');n.shell.setAttribute('aria-labelledby',n.titleNode.id);n.shell.tabIndex=-1;
    function close(){if(!opened)return;opened=false;n.shell.setAttribute('data-kami-open','0');if(key){doc.removeEventListener('keydown',key);key=null;}if(trigger&&trigger.isConnected)trigger.focus();if(opts.onClose)opts.onClose();}
    function open(source){if(opened)return;opened=true;trigger=source||doc.activeElement;n.shell.setAttribute('data-kami-open','1');key=function(e){if(e.key==='Escape'&&!e.defaultPrevented&&!doc.querySelector('dialog[open]')){e.preventDefault();close();}};doc.addEventListener('keydown',key);var first=n.body.querySelector('input,textarea,select,button');(first||n.shell).focus();}
    if(opts.closable!==false)n.head.appendChild(iconButton({label:'关闭',icon:'×',onClick:close}));panelGeometry(n,opts,close,cleanup);
    cleanup.push(function(){close();if(opts.removeOnDestroy!==false)n.remove();});if(opts.mount)opts.mount.appendChild(n);return own(n,{open:open,close:close,root:n,shell:n.shell,body:n.body,head:n.head,foot:n.foot},cleanup);
  }
  function dialog(opts){
    opts=options(opts);var n=mark(element('dialog','kami-ui-dialog'),'dialog'),root=container('dialog',opts),cleanup=[],trigger=null,opened=false;n.root=root;n.shell=root.shell;n.body=root.body;n.head=root.head;n.foot=root.foot;n.setAttribute('aria-labelledby',root.titleNode.id);n.appendChild(root);
    function close(reason){if(!opened)return;opened=false;if(typeof n.close==='function'&&n.open)n.close();else n.removeAttribute('open');if(trigger&&trigger.isConnected)trigger.focus();if(opts.onClose)opts.onClose(reason||'close');}
    function open(source){if(opened)return;if(!n.isConnected)(opts.mount||doc.body).appendChild(n);trigger=source||doc.activeElement;opened=true;if(typeof n.showModal==='function')n.showModal();else{n.setAttribute('open','');n.setAttribute('role','dialog');n.setAttribute('aria-modal','true');}var first=root.body.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])');if(first)first.focus();}
    if(opts.closable!==false)root.head.appendChild(iconButton({label:'关闭',icon:'×',onClick:function(){close('close');}}));
    listen(n,'cancel',function(e){e.preventDefault();close('cancel');},cleanup);listen(n,'close',function(){if(opened)close('close');},cleanup);cleanup.push(function(){close('destroy');destroy(root);n.remove();});return own(n,{open:open,close:close,root:root,body:root.body,head:root.head,foot:root.foot,shell:root.shell},cleanup);
  }
  var api={version:version,element:element,attrs:attrs,append:append,adopt:adopt,destroy:destroy,safeUrl:safeUrl,layout:layout,slot:slot,
    button:button,iconButton:iconButton,buttonGroup:buttonGroup,tabs:tabs,segmented:segmented,menu:menu,
    text:function(o){return control('text',o);},textarea:function(o){return control('textarea',o);},number:function(o){return control('number',o);},password:function(o){return control('password',o);},select:select,combobox:combobox,checkbox:function(o){return control('checkbox',o);},radio:function(o){return control('radio',o);},switch:switchControl,range:function(o){return control('range',o);},
    card:card,collapse:collapse,group:group,divider:divider,badge:badge,status:status,progress:progress,spinner:spinner,tooltip:tooltip,alert:alertControl,list:list,table:table,tree:tree,empty:empty,
    field:field,settingsCard:settingsCard,choiceCard:choiceCard,modelConnection:modelConnection,promptEditor:promptEditor,templateManager:templateManager,markdown:markdown,searchResults:searchResults,sources:sources,steps:steps,resourceGrid:resourceGrid,toolbar:toolbar,embedded:embedded,panel:panel,dialog:dialog};
  Object.defineProperty(doc,cacheKey,{value:api,configurable:true});return api;
}
