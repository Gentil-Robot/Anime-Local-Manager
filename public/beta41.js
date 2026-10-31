(()=>{'use strict';const D=window.ALM_DESIGN,$=id=>document.getElementById(id);let issueRequest=0;
 const reasons={'titre':'missingTitle','identifiant anime fiable':'missingIdentity','format/type':'missingFormat','synopsis':'missingSynopsis','genres':'missingGenres','date de diffusion':'missingDate',"nombre d'épisodes":'missingEpisodes','image':'missingImage','association importée':'importIdentityReview','progression importée':'progressImported','saison importée':'issueSeason'};
 let issueKind='all';
 const selectedIssueIds=new Set();let issuePage=0;
 async function completeIssueIds(ids){
  try{
   const result=await window.runBulkCompletionJob({endpoint:'/api/bulk/info-only',body:{retryMarked:true,...(Array.isArray(ids)?{ids}:{})},title:D.t(Array.isArray(ids)?'completionSelected':'completionAll')});
   await window.reloadAnimeLibrary();await window.loadContentAuditV2?.(false);await issues();return result;
  }catch(error){window.notifyApp?.(error.message,'error');}
 }
 async function issues(items,awaitingItems){
  const serial=++issueRequest;
  try{
   let data;if(Array.isArray(items))data={items,awaiting:awaitingItems};else{const response=await fetch('/api/library/completion-issues');if(!response.ok)throw Error();data=await response.json();}
   if(serial!==issueRequest)return;
   const panel=$('completionIssuesPanel'),list=$('completionIssuesList');if(!panel||!list)return;const awaitingWasOpen=$('completionAwaiting')?.open===true;const openStates={completionAwaiting:awaitingWasOpen,completionAwaitingSources:$('completionAwaitingSources')?.open===true};panel.hidden=false;list.replaceChildren();
   const ids=new Set((data.items||[]).map(item=>Number(item.id)));for(const id of selectedIssueIds)if(!ids.has(id))selectedIssueIds.delete(id);
   function updateSelection(){const button=$('completionIssuesSelected');if(button)button.disabled=!selectedIssueIds.size;}
   const allRecords=data.items||[],records=allRecords.filter(item=>issueKind==='all'||(item.kind||'metadata')===issueKind),pages=Math.max(1,Math.ceil(records.length/40));issuePage=Math.min(issuePage,pages-1);
   let filters=$('completionKindFilters');if(!filters){filters=document.createElement('nav');filters.id='completionKindFilters';filters.className='completion-kind-filters';list.before(filters);}filters.replaceChildren();
   for(const [kind,key]of [['all','issueAll'],['metadata','issueMetadata'],['season','issueSeason'],['progress','issueProgress'],['identity','issueIdentity']]){
    const count=allRecords.filter(item=>kind==='all'||(item.kind||'metadata')===kind).length,b=document.createElement('button');b.type='button';b.textContent=D.t(key)+' ('+count+')';b.setAttribute('aria-pressed',String(issueKind===kind));b.onclick=()=>{issueKind=kind;issuePage=0;issues(allRecords,data.awaiting);};filters.append(b);
   }
   for(const item of records.slice(issuePage*40,(issuePage+1)*40)){
    const row=document.createElement('div');row.className='completion-issue-row';
    row.dataset.kind=item.kind||'metadata';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selectedIssueIds.has(Number(item.id));checkbox.setAttribute('aria-label',D.t('completionChoose')+' : '+item.title);
    checkbox.onchange=()=>{if(checkbox.checked)selectedIssueIds.add(Number(item.id));else selectedIssueIds.delete(Number(item.id));updateSelection();};
    const button=document.createElement('button');button.type='button';button.className='completion-issue-open';
    const name=document.createElement('strong'),missing=document.createElement('span');name.textContent=item.title;missing.textContent=(item.missing||[]).map(m=>D.t(reasons[m]||'completionMissingTitle')).join(' · ')||D.t('completionMissingTitle');button.append(name,missing);
    button.onclick=()=>{const anime=(window._almAnimes||[]).find(a=>Number(a.id)===Number(item.id));if(anime){if(item.kind==='progress')window.ALM_IMPORT_GAP.open(anime,button);else window.ALM_RECORD_SEARCH.open(anime,button);}};
    const complete=document.createElement('button');complete.type='button';complete.textContent=D.t('completionOne');complete.dataset.completeAnimeId=item.id;
    if(item.kind==='progress')complete.textContent=D.t('progressTry');
    if(item.identityReview){complete.textContent=D.t('associationTitle');complete.onclick=()=>{const anime=(window._almAnimes||[]).find(a=>Number(a.id)===Number(item.id));if(anime)window.ALM_ASSOCIATION.open(anime,complete);};}
    else complete.onclick=async()=>{complete.disabled=true;try{await completeIssueIds([item.id]);}finally{complete.disabled=false;}};
    row.append(checkbox,button,complete);list.append(row);
   }
   if(!records.length){const empty=document.createElement('p');empty.textContent=D.t('completionEmpty');list.append(empty);}
   if(data.awaiting?.length)window.ALM_PENDING_REFERENCES.render(list,data.awaiting,openStates);
   if(pages>1){const nav=document.createElement('nav');nav.className='completion-actions';
    for(const [direction,key]of [[-1,'csvPreviousPage'],[0,'csvPageCount'],[1,'csvNextPage']]){
      const control=document.createElement(direction?'button':'span');control.textContent=D.t(key,{page:issuePage+1,pages});
      if(direction){control.type='button';control.disabled=direction<0?issuePage===0:issuePage===pages-1;control.onclick=async()=>{if(control.disabled)return;issuePage+=direction;await issues(allRecords,data.awaiting);window.ALM_SCROLL_PROGRESS?.toStart(panel,list.querySelector('.completion-issue-open'));};}else control.setAttribute('aria-live','polite');nav.append(control);
    }list.append(nav);
   }
   updateSelection();D.applyText(panel);
  }catch{/* Classification remains available if the completion request fails. */}
 }
 function updateKnownTitles(){document.querySelectorAll('.reco-card[data-record]').forEach(card=>{try{const item=JSON.parse(card.dataset.record),name=card.querySelector('.reco-card-title');if(name){name.textContent=window.ALM_TITLES.title(item);name.setAttribute('translate','no');}}catch{}});}
 function init(){
  window.ALM_BETA38.showProfile();document.querySelector('#dnaPage .viewing-tabs')?.remove();$('dnaProfileContent').removeAttribute('role');$('dnaProfileContent').removeAttribute('aria-labelledby');$('viewingPanel').hidden=true;$('viewingPanel').removeAttribute('aria-labelledby');
  document.querySelector('.feature-hub')?.remove();document.querySelector('.about-local-summary')?.remove();
  const support=document.querySelector('.studio-support-grid'),papers=support.querySelector('.alm-wallpapers'),banner=support.querySelector('.alm-retro-banner');
  if(papers&&banner&&!banner.closest(".about-media-main")){support.append(papers,banner);}
  const tool=document.createElement('button');tool.type='button';tool.id='formatLibraryTitles';tool.dataset.designText='formatTitles';tool.setAttribute('data-no-i18n','');document.querySelector('#studioTools .studio-toolbar-menu').prepend(tool);tool.onclick=async()=>{if(!await window.showAppConfirm(D.t('formatTitlesHint'),{title:D.t('formatTitles'),okText:D.t('formatTitles'),cancelText:D.t('chooseCancel')}))return;await window.runBulkCompletionJob({endpoint:'/api/bulk/titles',body:{lang:D.language()},title:D.t('formatTitles')});};
  const panel=document.createElement('section');panel.id='completionIssuesPanel';panel.className='studio-panel completion-issues';panel.hidden=true;panel.setAttribute('data-no-i18n','');panel.innerHTML='<h2 data-design-text="completionMissingTitle"></h2><p data-design-text="completionMissingHint"></p><div id="completionIssuesList"></div>';$('auditStats').after(panel);$('navAudit').addEventListener('click',issues);window.addEventListener('alm:collection-changed',issues);window.addEventListener('alm:language-changed',issues);D.applyText();window.addEventListener('alm:titles-changed',updateKnownTitles);window.addEventListener('alm:language-changed',updateKnownTitles);
  const failed=$('completionProgressFailed')?.parentElement?.querySelector('span,small');if(failed&&failed.id!=='completionProgressFailed'){failed.dataset.designText='completionMissingTitle';failed.setAttribute('data-no-i18n','');D.applyText(failed.parentElement);}
 }
 window.ALM_COMPLETION_ISSUES={refresh:issues,complete:completeIssueIds,selectedIds:()=>[...selectedIssueIds]};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
