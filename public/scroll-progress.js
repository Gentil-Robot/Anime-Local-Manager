/* Every visible reading area owns its controls and survives DOM/navigation changes. */
(()=>{
  'use strict';
  const svg='<svg class="scroll-progress-ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true"><circle class="scroll-progress-track" cx="24" cy="24" r="21"/><circle class="scroll-progress-value" cx="24" cy="24" r="21" pathLength="100"/></svg>';
  const labels={fr:['Remonter tout en haut','Descendre tout en bas'],en:['Back to the top','Go to the bottom'],ja:['一番上に戻る','一番下へ移動'],es:['Volver al principio','Ir al final'],de:['Ganz nach oben','Ganz nach unten'],'pt-BR':['Voltar ao início','Ir para o final'],'zh-CN':['返回顶部','前往底部']};
  const selectors={notebookDialog:['notebook','.notebook-body'],memoryDialog:['memories','.notebook-body'],listImportDialog:['listImport','.notebook-body'],readableExportDialog:['readableExport','.notebook-body'],commDialog:['community','.comm-dialog-scroll'],almPublicDialog:['publicForm','.comm-dialog-scroll'],settingsDialog:['settings','.settings-main'],animePeekDialog:['peek','.anime-peek-body'],calendarPopup:['calendar','.calendar-dialog-body'],calendarDayPopup:['calendarDay','.calendar-dialog-body'],seriesDialog:['series','#seriesContents'],importDialog:['import','#csvImportResults:not(.hidden), .dialog-content'],formDialog:['form','.anime-form-body'],recordSearchDialog:['recordSearch','#recordSearchResults'],animeAssociationDialog:['association','.association-preview']};
  const visible=node=>!!node&&!node.hidden&&!node.classList.contains('hidden')&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
  const scrollable=node=>!!node&&node.scrollHeight>node.clientHeight+1;
  const hide=(node,value)=>{if(node.hidden!==value)node.hidden=value;};
  const reduced=()=>document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let controller=null;
  let startFrame=0,startSerial=0,releaseStart=()=>{};
  // Page changes start a new reading position. Ordinary renders and "show more"
  // keep their position; callers invoke this only after explicit pagination.
  function toStart(scope,focus){
    if(!scope)return false;
    const dialog=scope.closest('dialog');
    const available=()=>{
      if(!scope.isConnected||(dialog&&!dialog.open))return false;
      for(let node=scope;node;node=node.parentElement){
        if(node.hidden||node.classList.contains('hidden'))return false;
        const style=getComputedStyle(node);
        if(style.display==='none'||style.visibility==='hidden')return false;
      }
      // A delayed page response must not move the background of an opened dialog.
      return !!dialog||![...document.querySelectorAll('dialog[open]')].some(visible);
    };
    // An obsolete response from a hidden view must not cancel a newer scroll.
    if(!available())return false;
    if(startFrame)cancelAnimationFrame(startFrame);
    startFrame=0;releaseStart();releaseStart=()=>{};
    const serial=++startSerial,current=()=>serial===startSerial&&available();
    const targets=new Set();
    for(let node=scope;node;node=node.parentElement){
      if(node===document.body||node===document.documentElement)break;
      if(node===dialog||node.scrollTop||(/^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowY)&&scrollable(node)))targets.add(node);
      if(node===dialog)break;
    }
    if(!dialog)targets.add(document.scrollingElement||document.documentElement);
    // New cards use content-visibility: their measured heights can replace the
    // estimates on the next paint. Suspend anchoring until that layout settles.
    const anchors=[...targets].map(node=>[node,node.style.getPropertyValue('overflow-anchor'),node.style.getPropertyPriority('overflow-anchor')]);
    for(const [node]of anchors)node.style.setProperty('overflow-anchor','none');
    let released=false;
    const restore=()=>{if(released)return;released=true;for(const [node,value,priority]of anchors){if(node.style.getPropertyValue('overflow-anchor')!=='none')continue;if(value)node.style.setProperty('overflow-anchor',value,priority);else node.style.removeProperty('overflow-anchor');}};
    releaseStart=restore;
    const reset=()=>{
      for(const node of targets){if(typeof node.scrollTo==='function')node.scrollTo({top:0,left:0,behavior:'instant'});else{node.scrollTop=0;node.scrollLeft=0;}}
      if(!dialog)window.scrollTo({top:0,left:0,behavior:'instant'});
      controller?.resume();
    };
    if(focus?.isConnected&&!focus.disabled)focus.focus({preventScroll:true});
    reset();
    let passes=0;
    const settled=()=>{
      startFrame=0;
      if(current()){reset();if(++passes<2){startFrame=requestAnimationFrame(settled);return;}}
      restore();if(serial===startSerial)releaseStart=()=>{};
    };
    startFrame=requestAnimationFrame(settled);
    return true;
  }
  function mount(){
    if(controller){controller.resume();return;}
    if(!document.body)return;
    const states=new WeakMap(),pairs=new Map();let frame=0,focusedDialog=null,observer;
    const resize=new ResizeObserver(schedule);
    resize.observe(document.body);resize.observe(document.documentElement);
    function makePair(key,container,area,kind){
      const wrap=document.createElement('div');
      const id=key==='page'?'scrollJumpControls':key==='newsReader'?'newsReaderScrollControls':key+'ScrollControls';
      document.getElementById(id)?.remove();
      wrap.id=id;wrap.hidden=true;wrap.className='scroll-jump-controls'+(kind==='reader'?' reader-scroll-controls':kind==='dialog'?' dialog-scroll-controls':'');
      const topId=key==='page'?'scrollJumpTop':key+'ScrollTop',bottomId=key==='page'?'scrollJumpBottom':key+'ScrollBottom';
      wrap.innerHTML='<button type="button" class="scroll-jump-btn" id="'+topId+'">'+svg+'<span aria-hidden="true">↑</span></button><button type="button" class="scroll-jump-btn" id="'+bottomId+'">'+svg+'<span aria-hidden="true">↓</span></button>';
      const pair={wrap,top:wrap.firstElementChild,bottom:wrap.lastElementChild,area,container,observed:null};
      for(const [button,direction]of [[pair.top,'up'],[pair.bottom,'down']])button.onclick=()=>{
        const target=pair.area();if(!target)return;
        const state=states.get(target);if(state)state.direction=direction;
        target.scrollTo({top:direction==='down'?target.scrollHeight:0,behavior:reduced()?'instant':'smooth'});schedule();
      };
      container.append(wrap);pairs.set(key,pair);return pair;
    }
    function ensure(key,container,area,kind){
      let pair=pairs.get(key);
      if(!pair||!pair.wrap.isConnected||pair.container!==container||!pair.wrap.contains(pair.top)||!pair.wrap.contains(pair.bottom)||!pair.top.querySelector('.scroll-progress-value')||!pair.bottom.querySelector('.scroll-progress-value')){
        if(pair){if(pair.observed)resize.unobserve(pair.observed);pair.wrap.remove();}
        pair=makePair(key,container,area,kind);
      }else pair.area=area;
      pair.wrap.classList.remove('hidden');for(const node of [pair.wrap,pair.top,pair.bottom])for(const property of ['display','visibility','opacity'])if(node.style.getPropertyValue(property))node.style.removeProperty(property);
      const target=area();
      if(target!==pair.observed){
        if(pair.observed)resize.unobserve(pair.observed);
        pair.observed=target;if(target)resize.observe(target);
      }
      return pair;
    }
    function paint(pair,target){
      if(!target)return;
      const max=Math.max(0,target.scrollHeight-target.clientHeight),y=Math.max(0,Math.min(max,target.scrollTop));
      let state=states.get(target)||{y,max,direction:'down'};
      if(Math.abs(max-state.max)<1&&Math.abs(y-state.y)>.5)state.direction=y>state.y?'down':'up';
      if(y<=.5)state.direction='down';else if(max-y<=.5)state.direction='up';
      state.y=y;state.max=max;states.set(target,state);pair.wrap.dataset.direction=state.direction;
      const texts=labels[window.ALM_I18N?.getLanguage?.()]||labels.fr;
      for(const [button,direction,index]of [[pair.top,'up',0],[pair.bottom,'down',1]]){
        const percent=max?(direction==='down'?y:max-y)/max*100:0,active=direction===state.direction;
        const ring=button.querySelector('.scroll-progress-ring');hide(ring,!active);
        ring.querySelector('.scroll-progress-value').style.strokeDashoffset=String(100-percent);
        button.dataset.progress=percent.toFixed(1);button.dataset.progressActive=String(active);
        button.title=texts[index];button.setAttribute('aria-label',texts[index]);
        button.disabled=max<1||(direction==='up'?y:max-y)<1;hide(button,button.disabled);
      }
    }
    function update(){
      frame=0;
      const zoom=(Number.parseFloat(getComputedStyle(document.body).zoom)||1)*(Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1);
      for(const [key,value]of [['--alm-viewport-height',innerHeight/zoom+'px'],['--alm-viewport-width',innerWidth/zoom+'px']])if(document.documentElement.style.getPropertyValue(key)!==value)document.documentElement.style.setProperty(key,value);
      document.getElementById('importDialog')?.classList.toggle('alm-short-window',innerHeight/zoom<=720);
      const page=ensure('page',document.body,()=>document.scrollingElement||document.documentElement,'page');
      const openDialogs=[...document.querySelectorAll('dialog[open]')].filter(visible);
      const focused=document.activeElement?.closest('dialog[open]');if(focused&&visible(focused))focusedDialog=focused;
      const topDialog=openDialogs.includes(focusedDialog)?focusedDialog:openDialogs.at(-1);
      const reader=document.getElementById('newsArticleModalV2'),readerVisible=visible(reader);
      hide(page.wrap,openDialogs.length>0||readerVisible||document.body.classList.contains('karaoke-focus-mode')||!scrollable(page.area()));paint(page,page.area());
      for(const [id,[key,selector]]of Object.entries(selectors)){
        const dialog=document.getElementById(id);if(!dialog)continue;
        const area=()=>{const freeList=id==='importDialog'?dialog.querySelector('#listImportPanel:not(.hidden) .notebook-body'):null;if(visible(freeList))return freeList;const workspace=id==='importDialog'?dialog.querySelector('.csv-import-workspace'):null;if(visible(workspace)&&(getComputedStyle(workspace).display==='flex'||workspace.scrollHeight>workspace.clientHeight+1))return workspace;const results=id==='importDialog'?dialog.querySelector('#csvImportResults'):null;return visible(results)?results:dialog.querySelector(selector)||dialog;};
        const pair=ensure(key,dialog,area,'dialog');hide(pair.wrap,!visible(dialog)||!dialog.open||topDialog!==dialog||!scrollable(area()));
        if(!pair.wrap.hidden)paint(pair,area());
      }
      if(reader){
        const box=reader.querySelector('.news-reader-modal-box'),body=()=>reader.querySelector('.news-reader-modal-body');
        if(box&&body()){const pair=ensure('newsReader',box,body,'reader');hide(pair.wrap,!readerVisible||openDialogs.length>0||!scrollable(body()));if(!pair.wrap.hidden)paint(pair,body());}
      }
      for(const [key,pair]of pairs)if(!pair.container.isConnected){if(pair.observed)resize.unobserve(pair.observed);pairs.delete(key);}
      // Ignore our own synchronous paint, but observe removals or hiding by other UI code.
      observer?.takeRecords();
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(update);}
    function resume(){if(frame)cancelAnimationFrame(frame);frame=0;schedule();}
    document.addEventListener('scroll',schedule,{passive:true,capture:true});
    for(const event of ['focusin','click','close','cancel','load'])document.addEventListener(event,schedule,true);
    for(const event of ['resize','pageshow','focus','alm:language-changed','alm:library-rendered','alm:collection-changed'])window.addEventListener(event,resume);
    document.addEventListener('visibilitychange',resume);
    observer=new MutationObserver(schedule);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open','style']});
    document.fonts?.ready.then(schedule);
    controller={schedule,resume};schedule();
  }
  window.ALM_SCROLL_PROGRESS={mount,toStart,refresh:()=>{if(controller)controller.resume();else mount();}};
})();
