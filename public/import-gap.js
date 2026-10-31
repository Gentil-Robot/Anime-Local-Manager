(()=>{'use strict';const D=window.ALM_DESIGN,t=(k,v)=>D.t(k,v);let dialog,source,serial=0;
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;return b;};
 async function open(item,opener){
  if(!item?.id)return;const version=++serial;let current;const isCurrent=()=>version===serial&&dialog?.open;source=opener||document.activeElement;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='importGapDialog';dialog.className='alm-dialog';dialog.setAttribute('aria-labelledby','importGapHeading');document.body.append(dialog);dialog.addEventListener('close',()=>{++serial;if(source?.isConnected)source.focus();});}
  dialog.replaceChildren();const h=document.createElement('h2');h.id='importGapHeading';h.textContent=t('progressTitle');dialog.append(h);
  const close=button(t('closeDialog'),()=>dialog.close());close.className='import-gap-close';dialog.append(close);if(!dialog.open)dialog.showModal();
  try{
   const response=await fetch('/api/animes/'+item.id+'/import-gap');if(!response.ok)throw Error(t('progressChanged'));current=await response.json();if(!isCurrent())return;
   const name=document.createElement('strong'),hint=document.createElement('p'),facts=document.createElement('dl');name.textContent=current.title;hint.textContent=t('progressHint');
   function renderFacts(){facts.replaceChildren();const rows=[[t('progressSource'),current.sourcePosition||'—'],[t('progressCatalogue'),(current.episodesSeen||'?')+' / '+(current.episodesTotal||'?')],[t('progressExtra',{count:current.unallocated}),current.sourceTitle]];if(current.progressEvidence)rows.push([t('progressSourceCounter'),current.progressEvidence.watched+' / '+current.progressEvidence.total]);for(const [label,value]of rows){const term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=label;definition.textContent=value||'—';facts.append(term,definition);}}
   renderFacts();
   const actions=document.createElement('div');actions.className='completion-actions';
   const allocate=button(t('progressTry'),async()=>{allocate.disabled=true;try{const job=await window.ALM_COMPLETION_ISSUES.complete([item.id]);if(!job||job.status!=='done'||!isCurrent())return;const r=await fetch('/api/animes/'+item.id+'/import-gap');if(!r.ok)throw Error(t('progressChanged'));current=await r.json();if(!isCurrent())return;renderFacts();preserve.disabled=!current.unallocated||current.acknowledged;const report=document.createElement('p');report.className='import-gap-result';report.setAttribute('role','status');report.textContent=current.unallocated?t('automationGapPreserved',{count:current.unallocated}):t('automationAllocated');dialog.querySelector('.import-gap-result')?.remove();dialog.append(report);if(!current.unallocated)allocate.disabled=true;}catch(e){if(isCurrent())window.notifyApp?.(e.message,'error');}finally{allocate.disabled=!current?.unallocated;}});
   const associate=button(t('associationTitle'),()=>{dialog.close();const anime=(window._almAnimes||[]).find(a=>Number(a.id)===Number(item.id));window.ALM_ASSOCIATION.open(anime,source);});
   const preserve=button(t('progressKeep'),async()=>{
    if(!await window.showAppConfirm(t('progressKeepConfirm',{count:current.unallocated}),{title:t('progressTitle'),okText:t('progressKeep'),cancelText:t('chooseCancel')})||!isCurrent())return;
    preserve.disabled=true;try{
     const r=await fetch('/api/animes/'+item.id+'/preserve-import-gap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint:current.fingerprint})});
     if(!r.ok)throw Error(t('progressChanged'));await window.reloadAnimeLibrary();await window.ALM_COMPLETION_ISSUES.refresh();if(isCurrent())dialog.close();
    }catch(e){if(isCurrent())window.notifyApp?.(e.message,'error');}finally{preserve.disabled=false;}
   });preserve.disabled=!current.unallocated||current.acknowledged;actions.append(allocate,associate,preserve);dialog.append(name,hint,facts,actions);
  }catch(e){if(!isCurrent())return;const p=document.createElement('p');p.textContent=e.message;dialog.append(p);}
 }
 window.ALM_IMPORT_GAP={open};
})();
