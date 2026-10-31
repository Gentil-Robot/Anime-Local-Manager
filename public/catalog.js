/* One bounded gallery and one shared detail dialog for the library and catalogue. */
(()=>{
 'use strict';window.ALM_CATALOG_ENABLED=true;
 const D=window.ALM_DESIGN,$=id=>document.getElementById(id),t=D.t,e=D.escape;
 let rows=[],page=1,total=0,facets=null,requestVersion=0,controller,started=false,loaded=false,updatedAt=null;
 const chosen=new Set();let popupRows=[],popupIndex=0,popupSerial=0,returnFocus=null,popupOrigin='catalog',popupContext=null;
 const localDate=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 async function request(url,options){const r=await fetch(url,options),data=await r.json();if(!r.ok){const error=Error(data.error||t('searchError'));error.code=data.code;throw error;}return data;}
 const title=a=>window.ALM_TITLES?.title(a)||a.title||'';
 const owned=a=>window.ALM_COLLECTION.find(a);
 const safe=v=>{const url=window.safeUrlV2(v);return url==='#'?'':url;};
 const date=v=>{const d=new Date(v);return Number.isNaN(d.valueOf())?'—':new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeStyle:'short'}).format(d);};
 let undoClock=null;
 let undoTimer=null,undoRemaining=0,undoDeadline=0;
 function pauseUndo(){undoClock?.pause();if(!undoTimer)return;clearTimeout(undoTimer);undoTimer=null;undoRemaining=Math.max(0,undoDeadline-Date.now());}
 function resumeUndo(){undoClock?.resume();const bar=$('catalogUndo');if(bar.hidden||bar.matches(':hover')||bar.contains(document.activeElement))return;clearTimeout(undoTimer);undoDeadline=Date.now()+undoRemaining;undoTimer=null;}
 function notifyUndo(message,token,after){
  undoClock?.stop();clearTimeout(undoTimer);undoTimer=null;undoRemaining=5000;
  const bar=$('catalogUndo');bar.replaceChildren();const label=document.createElement('span');label.textContent=message;bar.append(label);bar.hidden=false;
  if(token){const undo=document.createElement('button');undo.type='button';undo.className='primary';undo.textContent=t('undo');undo.onclick=async()=>{undo.disabled=true;try{const result=await request('/api/library/undo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});await window.load();label.textContent=t('undoResult',{count:result.undone,skipped:result.skipped});undo.remove();after?.();}catch{label.textContent=t('undoError');undo.remove();}};bar.append(undo);}
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label',t('chooseCancel'));close.onclick=()=>{undoClock?.stop();clearTimeout(undoTimer);undoTimer=null;bar.hidden=true;};bar.append(close);undoClock=window.ALM_COUNTDOWN.start(close,5000,()=>{bar.hidden=true;clearTimeout(undoTimer);undoTimer=null;},bar);bar.onpointerenter=pauseUndo;bar.onpointerleave=resumeUndo;bar.onfocusin=pauseUndo;bar.onfocusout=()=>queueMicrotask(resumeUndo);resumeUndo();
 }
 function showSelected(){
  const item=popupRows[popupIndex];if(!item)return;const serial=++popupSerial;
  $('animePeekPrevious').disabled=popupIndex===0;$('animePeekNext').disabled=popupIndex===popupRows.length-1;$('animePeekPosition').textContent=(popupIndex+1)+' / '+popupRows.length;
  $('animePeekTitle').textContent=title(item);
  const present=owned(item),extras=$('animePeekPersonal');extras.replaceChildren();
  if(present){const line=document.createElement('p');line.textContent=t('detailStatus')+' · '+window.ALM_COLLECTION.label(present)+' · '+t('personalScore')+' : '+(Number(present.score)>0?present.score:'—');extras.append(line);if(present.notes){const notes=document.createElement('p');notes.className='peek-notes';notes.textContent=t('personalNotes')+' : '+present.notes;extras.append(notes);}}
  if(present?.status==='Watching')extras.append(createEpisodeStepper(present));
  if(present){const correction=document.createElement('button');correction.type='button';correction.className='association-correct';correction.textContent=t('associationCorrect');correction.onclick=()=>window.ALM_ASSOCIATION.open(present,correction);extras.append(correction);}
  const malId=Number(item.malId||item.mal_id);
  if(window.ALM_COMMUNITY?.snapshot()?.connected&&Number.isSafeInteger(malId)&&malId>0&&window.ALM_COMMUNITY_MODEL?.shareAllowed(malId,window.ALM_COMMUNITY.snapshot().own.age)){
   const recommend=document.createElement('button');recommend.type='button';recommend.className='comm-anime-recommend';
   recommend.textContent=window.ALM_COMMUNITY_T('recommendFriend');
   recommend.onclick=()=>window.ALM_COMMUNITY_WORKSPACE.recommendAnime(malId,item).catch(error=>window.ALM_COMMUNITY.toast(window.ALM_COMMUNITY_ERROR(error),true));
   extras.append(recommend);
  }

  const paint=record=>{if(serial!==popupSerial||!$('animePeekDialog').open)return;window.ALM_DISCOVERY.setDetailActions('animePeekDetail',popupContext?.readOnly?()=>{const actions=$('animePeekDetail').querySelector('.discovery-detail-actions');actions.querySelector('.catalog-add')?.remove();const hint=document.createElement('p');hint.textContent=t('csvDetailHint');actions.prepend(hint);}:popupContext?.select?record=>{
    const actions=$('animePeekDetail').querySelector('.discovery-detail-actions');actions.querySelector('.catalog-add')?.remove();actions.querySelector('#peekOpen')?.remove();
    const controls=document.createElement('div');controls.className='catalog-add';const select=document.createElement('select');select.setAttribute('aria-label',t('seriesStatus'));
    select.innerHTML=window.ALM_WATCH_STATUS.options('', ['Plan to Watch','Watching','Completed','On-Hold','Dropped']);select.value=popupContext.status||'Plan to Watch';select.onchange=()=>popupContext.status=select.value;
    const button=document.createElement('button');button.type='button';button.className='primary';button.textContent=t('recordSearchUse');const present=owned(record);button.disabled=!!present&&Number(present.id)!==Number(popupContext.currentId);button.onclick=()=>popupContext.select(record,select.value,button);controls.append(select,button);actions.prepend(controls);
   }:null);window.ALM_DISCOVERY.showDetail({...record,poster:record.poster||record.imageUrl||''},'animePeekDetail');
  };
  paint(item);
  if(item.malId)request('/api/discover/'+Number(item.malId)+'/record?enrich=1').then(record=>{if(serial!==popupSerial||!$('animePeekDialog').open)return;const full={...record,...item,synopsis:item.synopsis||record.synopsis,trailer:item.trailer||record.trailer,poster:item.poster||item.imageUrl||record.poster};for(const field of ['genres','studios','episodesTotal','startDate','endDate','duration','titleEn','titleJa','titleRomaji','synonyms','localizedTitles'])if(!full[field]||(Array.isArray(full[field])&&!full[field].length))full[field]=record[field];if(record.type&&item.type&&record.type!==item.type){const warning=document.createElement('p');warning.className='peek-source-warning';warning.textContent=t('sourceReview')+' ('+item.type+' → '+record.type+')';extras.append(warning);}paint(full);}).catch(()=>{});
 }
 function openPopup(items,index,origin,source,context=null){
  if(!items.length)return;popupRows=[...items];popupIndex=Math.max(0,Math.min(index,items.length-1));popupOrigin=origin;popupContext=context;returnFocus=source||document.activeElement;
  const dialog=$('animePeekDialog');if(!dialog.open){dialog.showModal();if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&document.documentElement.dataset.motion!=='reduced'&&source){const a=source.getBoundingClientRect(),b=dialog.getBoundingClientRect(),x=Math.max(-180,Math.min(180,a.left+a.width/2-b.left-b.width/2)),y=Math.max(-140,Math.min(140,a.top+a.height/2-b.top-b.height/2));dialog.animate([{opacity:0,transform:`translate(${x}px,${y}px) scale(.9)`},{opacity:1,transform:'translate(0,0) scale(1)'}],{duration:190,easing:'ease-out'});}}
  $('animePeekBody').scrollTop=0;showSelected();$('animePeekClose').focus({preventScroll:true});
 }
 function closePopup(){const d=$('animePeekDialog');if(d.open)d.close();}
 function render(){
  const host=$('discoveryResults');host.replaceChildren();host.className='catalog-grid';
  for(const item of rows){const current=owned(item),card=document.createElement('article');card.className='catalog-card';card.dataset.malId=String(item.malId||'');
   const cover=document.createElement('button');cover.type='button';cover.className='catalog-cover';cover.setAttribute('aria-label',title(item));const url=safe(item.poster||item.imageUrl);if(url){const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=url;img.alt='';img.onerror=()=>{img.remove();cover.classList.add('missing-poster');};cover.append(img);}else{const placeholder=document.createElement('span');placeholder.textContent='✦';placeholder.setAttribute('aria-hidden','true');cover.append(placeholder);}cover.onclick=()=>openPopup(rows,rows.indexOf(item),'catalog',cover);
   const body=document.createElement('div');body.className='catalog-card-copy';const name=document.createElement('button');name.type='button';name.className='catalog-title';name.textContent=title(item);name.setAttribute('translate','no');name.onclick=()=>cover.click();const facts=document.createElement('small');facts.textContent=[item.type,String(item.startDate||'').slice(0,4),Number(item.publicScore)>0?'★ '+new Intl.NumberFormat(D.language(),{maximumFractionDigits:2}).format(item.publicScore):''].filter(Boolean).join(' · ');body.append(name,facts);
   if(current){const badge=document.createElement('span');badge.className='catalog-owned';badge.textContent='✓ '+window.ALM_COLLECTION.label(current);body.append(badge);chosen.delete(Number(item.malId));}
   else if(Number(item.malId)>0){const label=document.createElement('label');label.className='catalog-select';const check=document.createElement('input');check.type='checkbox';check.checked=chosen.has(Number(item.malId));check.setAttribute('aria-label',t('selectAnime',{title:title(item)}));check.onchange=()=>{check.checked?chosen.add(Number(item.malId)):chosen.delete(Number(item.malId));paintSelection();};label.append(check);card.append(label);}
   card.append(cover,body);host.append(card);
  }
  if(!rows.length){const empty=document.createElement('p');empty.className='catalog-empty';empty.textContent=t('searchEmpty');host.append(empty);}
  $('discoveryStatus').textContent=t('catalogCount',{count:total,page,pages:Math.max(1,Math.ceil(total/48))});$('catalogPrevious').disabled=page<=1;$('catalogFirst').disabled=page<=1;$('catalogNext').disabled=page>=Math.max(1,Math.ceil(total/48));$('catalogLast').disabled=$('catalogNext').disabled;$('catalogPageNumber').textContent=page+' / '+Math.max(1,Math.ceil(total/48));for(const [id,key]of [['catalogFirst','libraryFirstPage'],['catalogPrevious','libraryPreviousPage'],['catalogNext','libraryNextPage'],['catalogLast','libraryLastPage']])$(id)?.setAttribute('aria-label',t(key));
  $('catalogPageNumber').closest('.catalog-page-center').hidden=total<=48;
  $('catalogFreshness').textContent=updatedAt?t('catalogDate',{date:date(updatedAt)}):t('catalogNoDate');paintSelection();
 }
 function paintSelection(){$('catalogBatch').hidden=chosen.size===0;$('catalogSelectionCount').textContent=t('catalogSelection',{count:chosen.size});}
 function parameters(){const result={q:$('discoveryQuery').value.trim(),page:String(page),sort:$('discoverySort').value,hideOwned:$('catalogHideOwned').checked?'1':'0'};for(const key of ['year','decade','genre','studio','type'])result[key]=$('catalogFilter-'+key).value;return result;}
 // Restore the initial catalogue view without erasing intentional batch selections.
 function resetSearch(){
  $('discoveryQuery').value='';
  $('discoverySort').value='relevance';
  for(const key of ['year','decade','genre','studio','type'])$('catalogFilter-'+key).value='';
  $('catalogHideOwned').checked=false;
  page=1;
  $('discoveryQuery').focus({preventScroll:true});
  return refresh(); // Aborts stale catalogue/online requests and loads page one.
 }
  async function refresh({online=false,scroll=false}={}){
  const serial=++requestVersion;controller?.abort();controller=new AbortController();const params=parameters();$('discoveryForm').setAttribute('aria-busy','true');$('discoveryStatus').textContent=t('searchLoading');
   try{const result=await request('/api/catalog?'+new URLSearchParams(params),{signal:controller.signal});if(serial!==requestVersion)return;rows=result.items||[];page=result.page||1;total=result.total||0;updatedAt=result.updatedAt;loaded=true;render();
    if(scroll)window.ALM_SCROLL_PROGRESS?.toStart($('discoveryPage'),$('discoveryResults').querySelector('.catalog-cover'));
   if(online&&params.q.length>=2&&page===1&&!['year','decade','genre','studio','type'].some(k=>params[k])){
    try{const remote=await request('/api/discover?'+new URLSearchParams({q:params.q,online:'1'}),{signal:controller.signal});if(serial!==requestVersion)return;const additions=(remote.items||[]).filter(a=>!rows.some(b=>window.ALM_COLLECTION.same(a,b))&&(!$('catalogHideOwned').checked||!owned(a))).slice(0,Math.max(0,48-rows.length));if(additions.length){rows=[...additions,...rows];total+=additions.length;render();}if(remote.onlineUnavailable)$('discoveryStatus').textContent+=' · '+t('searchOfflineResults');}catch(err){if(err.name!=='AbortError'&&serial===requestVersion)$('discoveryStatus').textContent+=' · '+t('searchOfflineResults');}
   }
  }catch(err){if(err.name!=='AbortError'&&serial===requestVersion){$('discoveryStatus').textContent=t('searchError');}}
  finally{if(serial===requestVersion)$('discoveryForm').setAttribute('aria-busy','false');}
 }
 function fillFacets(){
  const selected=Object.fromEntries(['year','decade','genre','studio','type'].map(k=>[k,$('catalogFilter-'+k).value]));
  const entries={year:facets?.years||[],decade:[...new Set((facets?.years||[]).map(v=>String(Math.floor(Number(v)/10)*10)))],genre:facets?.genres||[],studio:facets?.studios||[],type:facets?.types||[]};
  const labels={year:'allYears',decade:'allDecades',genre:'allGenres',studio:'allStudios',type:'allFormats'};
  for(const [key,values]of Object.entries(entries)){const select=$('catalogFilter-'+key);select.innerHTML=`<option value="">${e(t(labels[key]))}</option>`+values.map(value=>`<option value="${e(value)}">${e(key==='decade'?t('decadeLabel',{year:value}):key==='genre'?(window.ALM_CONTENT_LANGUAGE?.genre(value)||value):value)}</option>`).join('');select.value=selected[key];select.setAttribute('aria-label',t(labels[key]));}
 }
 async function enter(){window.showV2Page('discoveryPage','navDiscovery');started=true;if(!facets){try{facets=await request('/api/catalog/facets');fillFacets();}catch{}}if(!loaded)await refresh();else render();}
 async function addBatch(){const button=$('catalogBatchAdd');button.disabled=true;let acceptedUnknown=false;const payload={ids:[...chosen],status:$('catalogBatchStatus').value,score:$('catalogBatchScore').value};try{
  let result;try{result=await request('/api/catalog/add-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch(err){if(err.code!=='ALM_EPISODES_UNKNOWN')throw err;acceptedUnknown=await window.showAppConfirm(t('batchUnknown'),{title:t('markSelected'),okText:t('markSelected'),cancelText:t('chooseCancel')});if(!acceptedUnknown)return;result=await request('/api/catalog/add-batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,confirmUnknownEpisodes:true})});}
  chosen.clear();await window.load();await refresh();notifyUndo(t('batchResult',result),result.undoToken,()=>refresh());
 }catch(err){window.notifyApp?.(t('searchError'),'error');}finally{button.disabled=false;paintSelection();}}
 function offerCompletion(anime,stepper){
  if(!stepper||stepper.querySelector('.episode-finish'))return;const finish=document.createElement('button');finish.type='button';finish.className='episode-finish';finish.textContent=t('finishAnime');finish.onclick=async event=>{event.stopPropagation();finish.disabled=true;try{const saved=await request('/api/library/'+anime.id+'/complete',{method:'POST'});await window.load();notifyUndo(t('completedSaved'),saved.undoToken);}catch{finish.disabled=false;window.notifyApp?.(t('searchError'),'error');}};stepper.append(finish);
 }
 function createEpisodeStepper(anime){
  const stepper=document.createElement('div');stepper.className='episode-stepper';const count=document.createElement('span');count.setAttribute('aria-live','polite');count.textContent=(anime.episodesSeen||'0')+' / '+(anime.episodesTotal||'?')+' '+t('searchEpisodes');
  for(const delta of [-1,1]){const button=document.createElement('button');button.type='button';button.textContent=delta===-1?'−':'+';button.setAttribute('aria-label',t(delta===-1?'minusEpisode':'plusEpisode'));button.disabled=delta===-1?Number(anime.episodesSeen||0)<=0:Number(anime.episodesTotal)>0&&Number(anime.episodesSeen)>=Number(anime.episodesTotal);
   button.onclick=async ev=>{ev.stopPropagation();stepper.querySelectorAll('button').forEach(b=>b.disabled=true);try{const result=await request('/api/library/'+anime.id+'/episode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delta,watchedOn:localDate()})});const y=scrollY;await window.load();window.scrollTo({top:y,behavior:'instant'});notifyUndo(t('episodeSaved',{seen:result.anime.episodesSeen,total:result.anime.episodesTotal||'?'}),result.undoToken);
    if(result.lastEpisode&&!$('animePeekDialog').open)offerCompletion(result.anime,document.querySelector('#animeGrid .card[data-anime-id="'+anime.id+'"] .episode-stepper'));
   }catch{stepper.querySelectorAll('button').forEach(b=>b.disabled=false);window.notifyApp?.(t('searchError'),'error');}};
   if(delta===-1)stepper.append(button,count);else stepper.append(button);
  }

  if(anime.completionPending===true&&Number(anime.episodesTotal)>0&&Number(anime.episodesSeen)===Number(anime.episodesTotal))offerCompletion(anime,stepper);
  return stepper;
 }
 function decorateLibrary(){
  const byId=new Map();for(const a of window._almAnimes||[])if(!byId.has(String(a.id)))byId.set(String(a.id),a);
  for(const card of document.querySelectorAll('#animeGrid .card')){
   card.querySelector('.viewing-increment')?.remove();const anime=byId.get(card.dataset.animeId);if(!anime)continue;
   const poster=card.querySelector('.poster');if(poster){poster.tabIndex=0;poster.setAttribute('role','button');poster.setAttribute('aria-label',title(anime));}
   if(anime.status!=='Watching'||card.querySelector('.episode-stepper'))continue;
   (card.querySelector('.card-body')||card).append(createEpisodeStepper(anime));
  }
 }
 function init(){
  const intro=document.querySelector('#discoveryPage .discovery-heading p');intro.dataset.designText='catalogIntro';$('discoveryQuery').required=false;$('discoveryQuery').removeAttribute('minlength');
  const filters=document.createElement('div');filters.className='catalog-filters';filters.setAttribute('data-no-i18n','');filters.innerHTML=['year','decade','genre','studio','type'].map(k=>`<select id="catalogFilter-${k}"></select>`).join('')+'<label><input id="catalogHideOwned" type="checkbox"><span data-design-text="hideOwned"></span></label>';$('discoveryForm').after(filters);
  const layout=document.querySelector('.discovery-layout');layout.className='catalog-layout';$('discoveryDetail').hidden=true;
  const footer=document.createElement('div');footer.className='catalog-pagination';footer.innerHTML='<nav class="catalog-page-center" hidden><button type="button" id="catalogFirst" aria-label="Première page">&lt;&lt;</button><button type="button" id="catalogPrevious" aria-label="Page précédente">&lt;</button><span id="catalogPageNumber"></span><button type="button" id="catalogNext" aria-label="Page suivante">&gt;</button><button type="button" id="catalogLast" aria-label="Dernière page">&gt;&gt;</button></nav><small id="catalogFreshness"></small><small data-design-text="catalogCoverage"></small>';layout.after(footer);
  const batch=document.createElement('div');batch.id='catalogBatch';batch.className='catalog-batch';batch.hidden=true;batch.setAttribute('data-no-i18n','');batch.innerHTML='<strong id="catalogSelectionCount"></strong><label><span data-design-text="optionalScore"></span><select id="catalogBatchScore"><option value="" data-design-text="noScore"></option>'+Array.from({length:10},(_,n)=>`<option value="${n+1}">${n+1}/10</option>`).join('')+'</select></label><label><span data-design-text="detailStatus"></span><select id="catalogBatchStatus">'+window.ALM_WATCH_STATUS.options('Completed')+'</select></label><button type="button" id="catalogBatchAdd" class="primary" data-design-text="addSelected"></button><button type="button" id="catalogBatchClear" data-design-text="clearSelection"></button>';$('discoveryPage').append(batch);
  const dialog=document.createElement('dialog');dialog.id='animePeekDialog';dialog.className='anime-peek-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','animePeekTitle');dialog.innerHTML='<header class="anime-peek-header"><h2 id="animePeekTitle" translate="no"></h2><button type="button" id="animePeekClose" data-design-text="closeDetail"></button></header><div id="animePeekBody" class="anime-peek-body"><div id="animePeekPersonal"></div><article id="animePeekDetail" class="discovery-detail"></article></div><nav class="anime-peek-navigation"><button type="button" id="animePeekPrevious" data-design-text="previousAnime"></button><span id="animePeekPosition"></span><button type="button" id="animePeekNext" data-design-text="nextAnime"></button></nav>';document.body.append(dialog);
  const undo=document.createElement('div');undo.id='catalogUndo';undo.className='catalog-undo';undo.hidden=true;undo.setAttribute('role','status');undo.setAttribute('data-no-i18n','');document.body.append(undo);
  const noRating=document.createElement('label');noRating.className='unrated-filter';noRating.setAttribute('data-no-i18n','');noRating.innerHTML='<input type="checkbox" id="unratedOnly"><span data-design-text="noRating"></span>';document.querySelector('.filters').append(noRating);$('unratedOnly').onchange=()=>window.render();
   $('navDiscovery').onclick=enter;$('discoveryForm').onsubmit=ev=>{ev.preventDefault();page=1;refresh({online:true});};$('catalogReset').onclick=resetSearch;$('discoverySort').onchange=()=>{page=1;refresh();};filters.addEventListener('change',()=>{page=1;refresh();});$('catalogFirst').onclick=()=>{page=1;refresh({scroll:true});};$('catalogPrevious').onclick=()=>{page--;refresh({scroll:true});};$('catalogNext').onclick=()=>{page++;refresh({scroll:true});};$('catalogLast').onclick=()=>{page=Math.max(1,Math.ceil(total/48));refresh({scroll:true});};$('catalogBatchAdd').onclick=addBatch;$('catalogBatchClear').onclick=()=>{chosen.clear();render();};
  $('animePeekClose').onclick=closePopup;$('animePeekPrevious').onclick=()=>{if(popupIndex>0){popupIndex--;$('animePeekBody').scrollTop=0;showSelected();}};$('animePeekNext').onclick=()=>{if(popupIndex<popupRows.length-1){popupIndex++;$('animePeekBody').scrollTop=0;showSelected();}};
  dialog.addEventListener('close',()=>{popupSerial++;window.ALM_DISCOVERY.forgetDetail('animePeekDetail');returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});});
  dialog.addEventListener('keydown',ev=>{if(ev.target.closest('input,select,textarea'))return;if(ev.key==='ArrowLeft'){ev.preventDefault();$('animePeekPrevious').click();}if(ev.key==='ArrowRight'){ev.preventDefault();$('animePeekNext').click();}});
  const grid=$('animeGrid');grid.addEventListener('click',ev=>{if(ev.target.closest('button,a,input,select,textarea'))return;const card=ev.target.closest('.card');if(!card)return;if(card.dataset.seriesKey){window.ALM_SERIES_UI.open(card.dataset.seriesKey,card.querySelector('.poster'));return;}const items=window.filteredAnimes(),index=items.findIndex(a=>String(a.id)===card.dataset.animeId);openPopup(items,index,'library',card.querySelector('.poster'));});grid.addEventListener('keydown',ev=>{if(ev.target.matches('.poster')&&['Enter',' '].includes(ev.key)){ev.preventDefault();ev.target.click();}});
  window.addEventListener('alm:library-rendered',decorateLibrary);
  window.addEventListener('alm:collection-changed',()=>{if(started){if($('catalogHideOwned').checked)refresh();else render();}if(dialog.open){const current=popupRows[popupIndex],fresh=(window._almAnimes||[]).find(a=>a.id===current.id);if(fresh)popupRows[popupIndex]=fresh;showSelected();}});
  window.addEventListener('alm:titles-changed',()=>{if(started)render();if(dialog.open)showSelected();});
  window.addEventListener('alm:language-changed',()=>{fillFacets();render();decorateLibrary();if(dialog.open)showSelected();D.applyText(dialog);});
  fillFacets();D.applyText();decorateLibrary();
 }
 window.ALM_CATALOG={refresh,enter,openRecords(items,index=0,source,context=null){openPopup(items,index,'related',source,context);},openLibrary(anime){const items=window.filteredAnimes();openPopup(items,Math.max(0,items.findIndex(a=>a.id===anime.id)),'library');},notifyUndo};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
