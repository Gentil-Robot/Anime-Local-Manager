/* Bounded library DOM; filtering, sorting and data always cover the full library. */
(function(root){
 'use strict';
 function createModel(size=60){
  const states=new Map();let all=false;
  return {
   select(items,key,signature){let state=states.get(key);if(!state||state.signature!==signature){state={page:1,signature};states.set(key,state);}const pages=Math.max(1,Math.ceil(items.length/size));state.page=Math.max(1,Math.min(pages,state.page));const start=all?0:(state.page-1)*size;return {items:all?items:items.slice(start,start+size),page:all?1:state.page,pages:all?1:pages,total:items.length,start:items.length?start+1:0,end:all?items.length:Math.min(items.length,start+size),all,size};},
   go(key,page){const state=states.get(key);if(state)state.page=Number.isFinite(page)?Math.trunc(page):1;},
   turn(key,delta){const state=states.get(key);if(state)state.page+=delta;},
   setAll(value){all=!!value;for(const state of states.values())state.page=1;}
  };
 }
 if(typeof module==='object'&&module.exports){module.exports={createModel};return;}
 const model=createModel(),navs=[];let activeKey='all',latest=null,observed=false,visibilityFrame=0;
 function hiddenView(grid){
  if(!grid||!grid.isConnected)return true;
  for(let node=grid;node;node=node.parentElement){if(node.hidden||node.classList.contains('hidden'))return true;const style=root.getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return true;}
  return false;
 }
 function visibility(){
  const grid=document.getElementById('animeGrid'),hidden=!latest||latest.total<=latest.size||hiddenView(grid);
  // Both positions share one model. Repeat the controls only across a genuinely long list.
  const longList=!hidden&&!latest.all&&grid.getBoundingClientRect().height>Math.max(480,(root.innerHeight||720)*.9);
  navs.forEach((nav,index)=>{nav.hidden=!!hidden||(index===1&&!longList);});
 }
 function scheduleVisibility(){if(!visibilityFrame)visibilityFrame=root.requestAnimationFrame(()=>{visibilityFrame=0;visibility();});}
 function redraw(change){change();root.render?.();const grid=document.getElementById('animeGrid'),focus=navs[0]?.querySelector(latest?.all?'[data-page-mode]':'[data-page-label]');focus?.focus({preventScroll:true});root.ALM_SCROLL_PROGRESS?.toStart(grid);}
 function ensure(){
  const grid=document.getElementById('animeGrid');if(!grid||navs.length)return;
  for(const id of ['libraryPagesTop','libraryPagesBottom']){
   const nav=document.createElement('nav');nav.id=id;nav.className='library-pagination';nav.hidden=true;nav.setAttribute('data-no-i18n','');
   nav.innerHTML='<div class="library-page-center"><button type="button" data-page-first aria-label="Première page">&lt;&lt;</button><button type="button" data-page-previous aria-label="Page précédente">&lt;</button><span data-page-label role="status" aria-live="polite" tabindex="-1"></span><button type="button" data-page-next aria-label="Page suivante">&gt;</button><button type="button" data-page-last aria-label="Dernière page">&gt;&gt;</button></div><button type="button" data-page-mode></button>';
   nav.querySelector('[data-page-first]').onclick=()=>redraw(()=>model.go(activeKey,1));nav.querySelector('[data-page-last]').onclick=()=>redraw(()=>model.go(activeKey,latest.pages));nav.querySelector('[data-page-previous]').onclick=()=>redraw(()=>model.turn(activeKey,-1));nav.querySelector('[data-page-next]').onclick=()=>redraw(()=>model.turn(activeKey,1));nav.querySelector('[data-page-mode]').onclick=()=>redraw(()=>model.setAll(!latest.all));
   if(!navs.length)grid.before(nav);else grid.after(nav);if(navs.length)nav.querySelector('[data-page-label]').setAttribute('aria-live','off');navs.push(nav);
  }
  if(!observed){
   const observer=new MutationObserver(visibility);
   for(let node=grid;node;node=node.parentElement)observer.observe(node,{attributes:true,attributeFilter:['class','hidden','style','data-studio-view']});
   if(root.ResizeObserver)new ResizeObserver(scheduleVisibility).observe(grid);
   for(const event of ['resize','alm:library-rendered','alm:view-changed'])root.addEventListener(event,scheduleVisibility);
   observed=true;
  }
 }
 function render(items,{key='all',signature=''}={}){
  activeKey=key;latest=model.select(items,key,signature);if(items.length>latest.size||navs.length)ensure();const t=root.ALM_DESIGN.t;
  for(const nav of navs){nav.setAttribute('aria-label',t('libraryPages'));nav.dataset.page=String(latest.page);nav.dataset.pages=String(latest.pages);nav.dataset.total=String(latest.total);nav.dataset.all=String(latest.all);const previous=nav.querySelector('[data-page-previous]'),next=nav.querySelector('[data-page-next]'),mode=nav.querySelector('[data-page-mode]');const first=nav.querySelector('[data-page-first]'),last=nav.querySelector('[data-page-last]');first.textContent='<<';last.textContent='>>';first.title=t('libraryFirstPage');last.title=t('libraryLastPage');first.setAttribute('aria-label',first.title);last.setAttribute('aria-label',last.title);first.disabled=latest.all||latest.page<=1;last.disabled=latest.all||latest.page>=latest.pages;previous.textContent='<';next.textContent='>';previous.title=t('libraryPreviousPage');next.title=t('libraryNextPage');previous.setAttribute('aria-label',previous.title);next.setAttribute('aria-label',next.title);previous.disabled=latest.all||latest.page<=1;next.disabled=latest.all||latest.page>=latest.pages;mode.textContent=t(latest.all?'libraryShowPages':'libraryShowAll');nav.querySelector('[data-page-label]').textContent=t('libraryPageLabel',{page:latest.page,pages:latest.pages,start:latest.start,end:latest.end,total:latest.total});}
  for(const nav of navs)nav.querySelector('.library-page-center').hidden=latest.all;
  visibility();scheduleVisibility();return latest.items;
 }
 root.ALM_LIBRARY_PAGING={render};
})(typeof window==='object'?window:globalThis);
