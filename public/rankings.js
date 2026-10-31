(() => {
 'use strict';const D=window.ALM_DESIGN,$=id=>document.getElementById(id),e=D.escape,t=D.t;let report=null,page=0,selected=null,loading=false,timer=null,studio='',requestId=0;const bt=(key,args)=>window.ALM_BETA37.t(key,args);
 const title=i=>window.ALM_TITLES.title(i);
 const numeric=v=>new Intl.NumberFormat(D.language(),{maximumFractionDigits:2}).format(Number(v));
 function render(){
  const heading=document.querySelector('#rankingPage h1'),intro=document.querySelector('#rankingPage .studio-banner-copy p');heading.removeAttribute('data-design-text');intro.removeAttribute('data-design-text');heading.textContent=studio?bt('studioTitle',{studio}):t('rankingTitle');intro.textContent=studio?bt('studioIntro'):t('rankingIntro');
  const pager=$('rankingPageNumber').closest('.ranking-pagination');pager.hidden=!report||(report.items||[]).length<=20;
  if(!report)return;const items=report.items||[],pages=Math.max(1,Math.ceil(items.length/20));page=Math.max(0,Math.min(page,pages-1));
  $('rankingCount').textContent=t('rankingCount',{count:items.length});$('rankingPrevious').disabled=page===0;$('rankingFirst').disabled=page===0;$('rankingNext').disabled=page===pages-1;$('rankingLast').disabled=page===pages-1;$('rankingPageNumber').textContent=(page+1)+' / '+pages;for(const [id,key]of [['rankingFirst','libraryFirstPage'],['rankingPrevious','libraryPreviousPage'],['rankingNext','libraryNextPage'],['rankingLast','libraryLastPage']])$(id)?.setAttribute('aria-label',t(key));$('rankingRefresh').disabled=loading||report.refreshing;
  let message=studio?(report.source==='jikan-studio-cache'?t('rankingCache'):bt(report.source==='jikan-studio'?'studioOnline':'studioLocal')):t(report.source==='mal'?'rankingMAL':report.source==='jikan-cache'?'rankingCache':'rankingLocal');
  if(report.updatedAt)message+=' · '+t('rankingUpdated',{date:new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(report.updatedAt))});
  if(report.refreshing)message+=' · '+t('rankingUpdating')+' '+(report.completedPages||0)+(studio?'':' / '+(report.totalPages||4));else if(report.unavailable)message+=' · '+t('rankingUnavailable');
  $('rankingStatus').textContent=message;
  $('rankingResults').innerHTML=items.slice(page*20,page*20+20).map((item,n)=>{const member=window.ALM_COLLECTION.find(item);return `<button type="button" class="ranking-card ${selected?.malId===item.malId?'active':''}" data-ranking="${page*20+n}" data-podium="${(studio?page*20+n+1:Number(item.rank))<=3}" aria-pressed="${selected?.malId===item.malId}"><span class="ranking-place">${e(numeric(studio?page*20+n+1:item.rank||page*20+n+1))}</span>${item.poster?`<img src="${e(window.safeUrlV2(item.poster))}" alt="" loading="lazy" data-image-fallback="true">`:D.icon('image')}<span class="ranking-card-copy"><strong translate="no">${e(title(item))}</strong><small>${e([item.type,String(item.startDate||'').slice(0,4)].filter(Boolean).join(' · '))}</small><b>★ ${e(numeric(item.publicScore))} / 10</b>${member?`<small class="ranking-member">✓ ${e(window.ALM_COLLECTION.label(member))}</small>`:''}</span></button>`;}).join('')||`<p>${e(t('rankingEmpty'))}</p>`;
  $('rankingResults').querySelectorAll('[data-ranking]').forEach(b=>b.onclick=()=>{selected=items[Number(b.dataset.ranking)];render();window.ALM_DISCOVERY.showDetail(selected,'rankingDetail');if(innerWidth<=1050)$('rankingDetail').scrollIntoView({block:'start',behavior:'auto'});});
  if(!selected&&items.length){selected=items[0];window.ALM_DISCOVERY.showDetail(selected,'rankingDetail');render();}
 }
 async function load(force=false){
  const request=++requestId,currentStudio=studio;loading=true;clearTimeout(timer);render();
  try{
   const base=studio?'/api/rankings/studio':'/api/rankings';const url=force?base+'/refresh':base+(studio?'?name='+encodeURIComponent(studio):'');
   const response=await fetch(url,force?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(studio?{name:studio}:{})}:undefined);
   if(!response.ok)throw Error();const next=await response.json();if(request!==requestId||currentStudio!==studio)return;report=next;
   if(selected){const current=report.items.find(i=>i.malId===selected.malId);if(current&&JSON.stringify(current)!==JSON.stringify(selected)){selected=current;window.ALM_DISCOVERY.showDetail(current,'rankingDetail');}}
  }catch{if(request!==requestId)return;report={...(report||{items:[],source:studio?'local-studio':'local'}),refreshing:false,unavailable:true};}
  finally{if(request===requestId){loading=false;render();if(report?.refreshing&&document.body.dataset.studioView==='rankingPage')timer=setTimeout(()=>load(),1500);}}
 }
 async function loadStudios(){try{const r=await fetch('/api/rankings/studios');if(!r.ok)return;const data=await r.json();const select=$('rankingStudio');select.replaceChildren(new Option(bt('allStudios'),''),...(data.studios||[]).map(s=>new Option(s.name+' ('+s.count+')',s.name)));select.value=studio;}catch{}}
 function init(){
  $('rankingPageNumber').closest('.ranking-pagination').hidden=true;
  $('navRanking').onclick=()=>{window.showV2Page('rankingPage','navRanking');loadStudios();load();};
  $('rankingStudio').onchange=()=>{studio=$('rankingStudio').value;page=0;selected=null;report=null;$('rankingResults').replaceChildren();$('rankingDetail').replaceChildren();load();};$('rankingRefresh').onclick=()=>load(true);
  for(const [id,delta]of [['rankingFirst','first'],['rankingPrevious',-1],['rankingNext',1],['rankingLast','last']])$(id).onclick=()=>{if($(id).disabled)return;page=delta==='first'?0:delta==='last'?Math.max(0,Math.ceil((report?.items||[]).length/20)-1):page+delta;render();window.ALM_SCROLL_PROGRESS?.toStart($('rankingPage'),$('rankingResults').querySelector('[data-ranking]'));};
  window.addEventListener('alm:language-changed',()=>{const first=$('rankingStudio').options[0];if(first)first.textContent=bt('allStudios');render();});window.addEventListener('alm:collection-changed',render);
  window.addEventListener('alm:titles-changed',render);window.ALM_RANKINGS={load};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
