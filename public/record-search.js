/* Suggestions help identify an existing record; nothing is associated on search. */
(()=>{
 'use strict';const D=window.ALM_DESIGN,t=D.t;let dialog,current,source,input,results,message,chosenStatus,controller,serial=0;
 const request=async(url,signal)=>{const response=await fetch(url,{signal}),data=await response.json();if(!response.ok)throw Error(t('searchError'));return data;};
 async function search(online=false){
  controller?.abort();controller=new AbortController();const version=++serial,q=input.value.trim();results.replaceChildren();
  if(!q){dialog.setAttribute('aria-busy','false');message.textContent=t('searchEmpty');return;}message.textContent=t('searchLoading');dialog.setAttribute('aria-busy','true');
  try{
   const data=await request((online?'/api/discover?online=1&':'/api/animes/'+current.id+'/association-candidates?')+new URLSearchParams({q}),controller.signal);
   if(version!==serial||!dialog.open)return;const items=data.items||[];message.textContent=(data.onlineUnavailable?t('searchOfflineResults'):items.length?t('searchLocal'):t('searchEmpty'))+(items.length?' · '+items.length:'');
   items.forEach((item,index)=>{
    const row=document.createElement('article');row.className='record-search-result';
    const detail=document.createElement('button');detail.type='button';detail.className='record-search-preview';
    const imageUrl=window.safeUrlV2(item.poster||item.imageUrl||'');if(imageUrl&&imageUrl!=='#'){const img=document.createElement('img');img.src=imageUrl;img.alt='';img.loading='lazy';img.setAttribute('data-image-fallback','true');detail.append(img);}
    const body=document.createElement('span'),title=document.createElement('strong'),facts=document.createElement('small');title.textContent=window.ALM_TITLES.title(item);title.setAttribute('translate','no');facts.textContent=[item.type,String(item.startDate||'').slice(0,4),'MAL '+item.malId].filter(Boolean).join(' · ');body.append(title,facts);detail.append(body);
    detail.onclick=()=>window.ALM_CATALOG.openRecords(items,index,detail,{currentId:current.id,status:chosenStatus.value,select:(record,status,button)=>window.ALM_ASSOCIATION.use(current,button,{malId:record.malId,status})});
    const use=document.createElement('button');use.type='button';use.textContent=t('recordSearchUse');use.dataset.associateMalId=item.malId;
    use.onclick=()=>window.ALM_ASSOCIATION.use(current,use,{malId:item.malId,status:chosenStatus.value});
    row.append(detail,use);results.append(row);
   });
  }catch(error){if(version===serial&&error.name!=='AbortError')message.textContent=error.message;}
  finally{if(version===serial)dialog.setAttribute('aria-busy','false');}
 }
 function ensure(){
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='recordSearchDialog';dialog.className='record-search-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','recordSearchTitle');
  dialog.innerHTML='<header><h2 id="recordSearchTitle" data-design-text="recordSearchTitle"></h2><button type="button" data-search-close data-design-text="closeDetail"></button></header><p data-design-text="recordSearchHint"></p><strong id="recordSearchCurrent" translate="no"></strong><form><input id="recordSearchQuery" type="search" maxlength="160"><button type="submit" data-design-text="searchPage"></button><button type="button" id="recordSearchOnline" data-design-text="recordSearchOnline"></button><label><span data-design-text="seriesStatus"></span><select id="recordSearchStatus"></select></label></form><p id="recordSearchMessage" role="status" aria-live="polite"></p><div id="recordSearchResults"></div><footer><button type="button" id="recordSearchEdit" data-design-text="recordSearchEdit"></button><button type="button" data-search-close data-design-text="closeDetail"></button></footer>';
  document.body.append(dialog);input=dialog.querySelector('input');results=dialog.querySelector('#recordSearchResults');message=dialog.querySelector('#recordSearchMessage');chosenStatus=dialog.querySelector('select');
  chosenStatus.innerHTML=window.ALM_WATCH_STATUS.options('Plan to Watch');
  dialog.querySelector('form').onsubmit=event=>{event.preventDefault();search();};dialog.querySelector('#recordSearchOnline').onclick=()=>search(true);
  dialog.querySelectorAll('[data-search-close]').forEach(button=>button.onclick=()=>dialog.close());
  dialog.querySelector('#recordSearchEdit').onclick=()=>{dialog.close();window.openEdit(current);};
  dialog.onclose=()=>{++serial;controller?.abort();if(source?.isConnected)source.focus({preventScroll:true});};
  const translate=()=>{D.applyText(dialog);input.setAttribute('aria-label',t('searchPage'));window.ALM_WATCH_STATUS.apply(chosenStatus);};window.addEventListener('alm:language-changed',translate);translate();
 }
 function open(item,origin){if(!item?.id)return;ensure();current={...item};source=origin||document.activeElement;const original=item.canonicalTitle||item.seriesRootTitle||item.title||'';input.value=window.ALM_SEASON_REFERENCE.parse(original).base.slice(0,160);chosenStatus.value=item.status||'Plan to Watch';dialog.querySelector('#recordSearchCurrent').textContent=window.ALM_TITLES.title(item)+(item.betaseriesEpisode?' · '+D.t('seriesImportReference',{position:item.betaseriesEpisode}):'');if(!dialog.open)dialog.showModal();input.focus();input.select();search();}
 window.ALM_RECORD_SEARCH={open};
})();
