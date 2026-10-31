(() => {
 'use strict';const D=window.ALM_DESIGN,t=D.t;let dialog,field,preview,status,verify,apply,current,target,controller,serial=0,returnFocus,desiredStatus;
 const parse=value=>{
  const raw=String(value||'').trim();let result=raw;
  if(!/^[1-9]\d*$/.test(raw))try{const url=new URL(raw);if(url.protocol!=='https:'||!['myanimelist.net','www.myanimelist.net'].includes(url.hostname)||url.username||url.password||url.port)return 0;result=url.pathname.match(/^\/anime\/([1-9]\d*)(?:\/|$)/)?.[1]||'';}catch{return 0;}
  const id=Number(result);return Number.isSafeInteger(id)&&id>0?id:0;
 };
 function suggestion(item){
  return window.ALM_TITLE_PREFERENCE.hint(item);
 }
 const request=async(url,options)=>{const response=await fetch(url,options),data=await response.json();if(!response.ok)throw Object.assign(Error(),{code:data.code});return data;};
 function errorText(error){return t(({ALM_ASSOCIATION_INVALID:'associationInvalid',ALM_ASSOCIATION_MISSING:'associationMissing',ALM_ASSOCIATION_DUPLICATE:'associationDuplicate',ALM_ASSOCIATION_CHANGED:'associationChanged'})[error.code]||'searchError');}
 function resetTarget(){++serial;controller?.abort();target=null;preview.replaceChildren();status.textContent='';apply.disabled=true;verify.disabled=false;}
 function ensure(){
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='animeAssociationDialog';dialog.className='anime-association-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','animeAssociationTitle');
  dialog.innerHTML='<h2 id="animeAssociationTitle" data-design-text="associationTitle"></h2><p data-design-text="associationHint"></p><label for="animeAssociationLink" data-design-text="associationLink"></label><input id="animeAssociationLink" type="text" inputmode="url" autocomplete="off" maxlength="500"><button type="button" id="animeAssociationVerify" data-design-text="associationVerify"></button><div id="animeAssociationPreview" class="association-preview"></div><p id="animeAssociationStatus" role="status" aria-live="polite"></p><menu><button type="button" data-association-close data-design-text="closeDetail"></button><button type="button" id="animeAssociationApply" class="primary" disabled data-design-text="associationApply"></button></menu>';
  document.body.append(dialog);field=dialog.querySelector('input');preview=dialog.querySelector('#animeAssociationPreview');status=dialog.querySelector('#animeAssociationStatus');verify=dialog.querySelector('#animeAssociationVerify');apply=dialog.querySelector('#animeAssociationApply');
  field.oninput=resetTarget;field.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();verify.click();}};
  dialog.querySelector('[data-association-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{resetTarget();verify.disabled=false;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  verify.onclick=async()=>{
   resetTarget();const id=parse(field.value);if(!id){status.textContent=t('associationInvalid');return;}
   const version=serial;controller=new AbortController();verify.disabled=true;status.textContent=t('searchLoading');
   try{const record=await request('/api/discover/'+id+'/record?enrich=0',{signal:controller.signal});if(version!==serial||!dialog.open)return;if(Number(record.malId)!==id||!record.title)throw Object.assign(Error(),{code:'ALM_ASSOCIATION_MISSING'});
    target=id;status.textContent='';const name=document.createElement('strong'),facts=document.createElement('p'),link=document.createElement('a');name.textContent=window.ALM_TITLES.title(record);name.setAttribute('translate','no');facts.textContent=[record.type,String(record.startDate||'').slice(0,4),'MAL '+id,desiredStatus?window.ALM_COLLECTION.label({status:desiredStatus}):''].filter(Boolean).join(' · ');link.href='https://myanimelist.net/anime/'+id;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('searchMal')+' ↗';preview.append(name,facts,link);apply.disabled=false;
   }catch(error){if(version===serial&&error.name!=='AbortError')status.textContent=errorText(error);}finally{if(version===serial)verify.disabled=false;}
  };
  apply.onclick=async()=>{
   if(!target)return;const version=serial,record=current;apply.disabled=verify.disabled=field.disabled=true;
   try{await request('/api/animes/'+record.id+'/reassociate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({malId:target,expectedMalId:Number(record.malId)||0,...(desiredStatus?{status:desiredStatus}:{})})});await window.load();if(version===serial){const body=document.querySelector('#animePeekBody');if(body)body.scrollTop=0;dialog.close();if(document.getElementById('recordSearchDialog')?.open){document.getElementById('animePeekDialog')?.close();document.getElementById('recordSearchDialog').close();}window.notifyApp?.(t('associationSaved'),'success');}}
   catch(error){if(version===serial){status.textContent=errorText(error);apply.disabled=false;}}
   finally{field.disabled=false;verify.disabled=false;}
  };
  window.addEventListener('alm:language-changed',()=>D.applyText(dialog));D.applyText(dialog);
 }
 function open(item,source,options={}){
  if(!item?.id)return;ensure();current={...item};desiredStatus=options.status||null;returnFocus=source||document.activeElement;resetTarget();const id=Number(options.malId)||suggestion(item)||Number(item.malId)||'';field.value=id?'https://myanimelist.net/anime/'+id:'';field.disabled=false;verify.disabled=false;if(!dialog.open)dialog.showModal();field.focus();field.select();if(options.malId||suggestion(item))verify.click();
 }
 async function use(item,source,options={}){
  const malId=parse(options.malId);if(!item?.id||!malId||source?.disabled)return;
  if(source)source.disabled=true;
  try{
   await request('/api/animes/'+item.id+'/reassociate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({malId,expectedMalId:Number(item.malId)||0,...(options.status?{status:options.status}:{})})});
   await window.reloadAnimeLibrary();
   document.getElementById('animePeekDialog')?.close();document.getElementById('recordSearchDialog')?.close();
   await window.ALM_COMPLETION_ISSUES?.refresh();
   window.notifyApp?.(t('associationSaved'),'success');
  }catch(error){window.notifyApp?.(errorText(error),'error');}
  finally{if(source?.isConnected)source.disabled=false;}
 }
 window.ALM_ASSOCIATION={open,use,parse,suggestion};
})();

