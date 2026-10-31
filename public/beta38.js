(() => {
 'use strict';
 const D=window.ALM_DESIGN,$=id=>document.getElementById(id),t=D.t,e=D.escape;
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 async function json(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||t('backupError')),{code:data.code});return data;}
 async function chooseAnime(payload){
  const dialog=document.createElement('dialog');dialog.className='anime-choice-dialog';dialog.setAttribute('data-no-i18n','');
  dialog.innerHTML=`<h2>${e(t('chooseAnime'))}</h2><p>${e(t('chooseAnimeHint'))}</p><div class="anime-choice-list" aria-live="polite">${e(t('chooseSearching'))}</div><menu><button type="button" data-choice-manual>${e(t('chooseManual'))}</button><button type="button" data-choice-cancel>${e(t('chooseCancel'))}</button></menu>`;
  document.body.append(dialog);dialog.showModal();
  return new Promise(resolve=>{
   let finished=false;const controller=new AbortController();
   const close=value=>{if(finished)return;finished=true;controller.abort();dialog.close();dialog.remove();resolve(value);};
   dialog.querySelector('[data-choice-manual]').onclick=()=>close({...payload,autoInfo:false});
   dialog.querySelector('[data-choice-cancel]').onclick=()=>close(null);
   dialog.addEventListener('cancel',ev=>{ev.preventDefault();close(null);});
   fetch('/api/discover?q='+encodeURIComponent(payload.title)+'&online=1',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
    if(finished)return;const items=(data.items||[]).slice(0,20),host=dialog.querySelector('.anime-choice-list');
    host.replaceChildren();for(const item of items){const b=document.createElement('button');b.type='button';
     const safePoster=/^(?:https?:\/\/|\/images\/|\/assets\/)/.test(item.poster||'')?item.poster:'';
     b.innerHTML=(safePoster?`<img src="${e(safePoster)}" alt="" loading="lazy">`:'')+`<span><strong>${e(item.title)}</strong><small>${e(item.type)} · ${e(String(item.startDate||'').slice(0,4))} · ★ ${e(item.publicScore||'—')}</small></span>`;
     b.querySelector('img')?.addEventListener('error',ev=>ev.target.remove());
     b.onclick=()=>close({...item,...payload,title:item.title,malId:item.malId,anilistId:item.anilistId,poster:item.poster,synopsis:item.synopsis,malUrl:item.malUrl,publicScore:item.publicScore,rank:item.rank,studios:item.studios,genres:payload.genres?.length?payload.genres:item.genres,episodesTotal:payload.episodesTotal||item.episodesTotal,autoInfo:false,catalogAdd:true});host.append(b);
    }if(!items.length)host.textContent=t('searchEmpty');
   }).catch(()=>{if(!finished)dialog.querySelector('.anime-choice-list').textContent=t('searchOfflineResults');});
  });
 }
 async function preparePayload(payload,id){
  if(!id&&payload.autoInfo!==false){payload=await chooseAnime(payload);if(!payload)return null;}
  if(payload.status==='Completed'){
   let total=Number(payload.episodesTotal)||0;
   const previous=id?(window._almAnimes||[]).find(a=>String(a.id)===String(id)):null;
   const malId=payload.malId||previous?.malId;
   if(!total&&malId)try{total=Number((await json('/api/completion?malId='+encodeURIComponent(malId))).episodes)||0;}catch{}
   total=total||Number(payload.episodesSeen)||0;
   if(total>0){payload.episodesTotal=String(total);payload.episodesSeen=String(total);}
   else if(previous?.status!=='Completed'){
    const confirmed=await window.showAppConfirm(t('unknownEpisodes'),{title:t('enterEpisodes'),okText:t('keepUnknown'),cancelText:t('enterEpisodes')});
    if(!confirmed){$('episodesSeen')?.focus();return null;}payload.confirmUnknownEpisodes=true;
   }
  }
  return payload;
 }
 let activeTab='profile',serial=0,historyData=null,chosenYear=String(new Date().getFullYear());
 const dateLabel=value=>new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 function posterCard(anime){const b=document.createElement('button');b.type='button';b.className='viewing-poster';
  const poster=/^(?:https?:\/\/|\/images\/|\/assets\/)/.test(anime.poster||'')?anime.poster:'';
  b.innerHTML=(poster?`<img src="${e(poster)}" alt="" loading="lazy">`:'<span class="viewing-poster-placeholder">✦</span>')+`<strong translate="no">${e(anime.title)}</strong><small>${e(anime.completedOn?dateLabel(anime.completedOn):t('viewingUnknown'))}</small>`;
  b.onclick=()=>window.openEdit(anime);return b;
 }
 function renderHistory(){
  const host=$('viewingHistory');if(!host||!historyData)return;host.replaceChildren();
  if(activeTab==='years'){
   const rows=chosenYear==='unknown'?historyData.undated:historyData.completed;
   const count=document.createElement('p');count.textContent=t('viewingFinished',{count:rows.length});host.append(count);
   const grid=document.createElement('div');grid.className='viewing-posters';rows.forEach(a=>grid.append(posterCard(a)));host.append(grid);if(!rows.length)grid.textContent=t('viewingEmpty');return;
  }
  const rows=new Map(historyData.days.map(x=>[x.date,x])),year=historyData.year;
  const summary=document.createElement('div');summary.className='viewing-summary';summary.textContent=t('viewingEpisodes',{count:historyData.days.reduce((n,d)=>n+d.episodes,0)})+' · '+t('viewingFinished',{count:historyData.completed.length});host.append(summary);
  const firstDate=new Date(Date.UTC(year,0,1,12)),offset=(firstDate.getUTCDay()+6)%7,daysInYear=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000,weeks=Math.ceil((offset+daysInYear)/7);const months=document.createElement('div');months.className='viewing-months';months.style.gridTemplateColumns='repeat('+weeks+',var(--viewing-cell))';for(let m=0;m<12;m++){const date=new Date(Date.UTC(year,m,1,12)),span=document.createElement('span');span.textContent=new Intl.DateTimeFormat(D.language(),{month:'short',timeZone:'UTC'}).format(date);span.style.gridColumn=String(Math.floor((offset+(date-firstDate)/86400000)/7)+1);months.append(span);}
  const scroll=document.createElement('div');scroll.className='viewing-calendar-scroll';const grid=document.createElement('div');grid.className='viewing-heatmap';scroll.append(months,grid);host.append(scroll);
  const first=new Date(Date.UTC(year,0,1,12));for(let pad=0;pad<(first.getUTCDay()+6)%7;pad++)grid.append(document.createElement('span'));
  const detail=document.createElement('div');detail.className='viewing-day-detail';
  for(let d=new Date(first);d.getUTCFullYear()===year;d.setUTCDate(d.getUTCDate()+1)){
   const value=d.toISOString().slice(0,10),day=rows.get(value),count=day?.episodes||0,b=document.createElement('button');b.type='button';
   b.dataset.date=value;b.dataset.level=String(count===0?0:count<2?1:count<4?2:count<7?3:4);b.title=dateLabel(value)+' · '+t('viewingEpisodes',{count});b.setAttribute('aria-label',b.title);
   b.onclick=()=>{detail.replaceChildren();const heading=document.createElement('h3');heading.textContent=b.title;detail.append(heading);const posters=document.createElement('div');posters.className='viewing-posters';for(const id of day?.animeIds||[]){const anime=(window._almAnimes||[]).find(a=>a.id===id);if(anime)posters.append(posterCard(anime));}detail.append(posters);};grid.append(b);
  }
  const legend=document.createElement('div');legend.className='viewing-legend';legend.innerHTML=e(t('viewingLess'))+'<i></i><i style="background:#6655a4"></i><i style="background:#8a70c9"></i><i style="background:#a187e2"></i><i style="background:#cfb2ff"></i>'+e(t('viewingMore'));host.append(legend,detail);
  if(!rows.size){const p=document.createElement('p');p.textContent=t('viewingEmpty');host.append(p);}
 }
 async function loadHistory(){const version=++serial;try{const year=chosenYear==='unknown'?new Date().getFullYear():Number(chosenYear);const data=await json('/api/viewing?year='+year);if(version!==serial)return;historyData=data;const select=$('viewingYear'),years=[...new Set([new Date().getFullYear(),year,...data.years])].sort((a,b)=>b-a);select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('')+(activeTab==='years'?`<option value="unknown">${e(t('viewingUnknown'))}</option>`:'');select.value=chosenYear;renderHistory();}catch{if(version===serial)$('viewingHistory').textContent=t('searchError');}}
 function selectTab(tab,owner='dna'){if(owner==='dna'&&$('viewingPanel')?.parentElement!==$('dnaPage'))$('dnaPage').append($('viewingPanel'));activeTab=tab;$('viewingTitle').textContent=t(tab==='years'?'viewingYears':'viewingCalendar');$('dnaProfileContent').hidden=tab!=='profile';$('viewingPanel').hidden=tab==='profile';$('viewingPanel').setAttribute('aria-labelledby','viewingTab-'+tab);$('dnaProfileContent').setAttribute('aria-labelledby','viewingTab-profile');document.querySelectorAll('[data-viewing-tab]').forEach(b=>{const selected=b.dataset.viewingTab===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});if(tab==='profile'){window.dispatchEvent(new Event('resize'));window.renderDNA?.();}else{if(tab==='calendar'&&chosenYear==='unknown')chosenYear=String(new Date().getFullYear());loadHistory();}}
 function mountHistory(){const page=$('dnaPage'),profile=document.createElement('div');profile.id='dnaProfileContent';profile.setAttribute('role','tabpanel');while(page.firstChild)profile.append(page.firstChild);page.append(profile);
  const tabs=document.createElement('div');tabs.className='viewing-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Anime DNA');
  for(const [tab,key]of [['profile','viewingProfile'],['calendar','viewingCalendar'],['years','viewingYears']]){const b=document.createElement('button');b.type='button';b.id='viewingTab-'+tab;b.dataset.viewingTab=tab;b.dataset.designText=key;b.setAttribute('data-no-i18n','');b.setAttribute('role','tab');b.setAttribute('aria-controls',tab==='profile'?'dnaProfileContent':'viewingPanel');b.onclick=()=>selectTab(tab);tabs.append(b);}
  tabs.onkeydown=ev=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;ev.preventDefault();const items=[...tabs.children],index=items.indexOf(document.activeElement);const next=ev.key==='Home'?0:ev.key==='End'?2:(index+(ev.key==='ArrowRight'?1:2))%3;items[next].click();items[next].focus();};page.prepend(tabs);
  const panel=document.createElement('section');panel.id='viewingPanel';panel.className='viewing-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('data-no-i18n','');panel.innerHTML=`<div class="viewing-toolbar"><h2 id="viewingTitle"></h2><label><span data-design-text="viewingYear"></span> <select id="viewingYear"></select></label></div><p data-design-text="viewingHint"></p><div id="viewingHistory" aria-live="polite"></div>`;page.append(panel);$('viewingYear').onchange=()=>{chosenYear=$('viewingYear').value;loadHistory();};selectTab('profile');
 }
 function decorateWatching(){const byId=new Map();for(const a of window._almAnimes||[])if(!byId.has(String(a.id)))byId.set(String(a.id),a);for(const card of document.querySelectorAll('#animeGrid .card')){if(card.querySelector('.viewing-increment'))continue;const anime=byId.get(card.dataset.animeId);if(anime?.status!=='Watching')continue;const b=document.createElement('button');b.type='button';b.className='viewing-increment';b.textContent=t('viewingIncrement');b.disabled=Number(anime.episodesTotal)>0&&Number(anime.episodesSeen)>=Number(anime.episodesTotal);b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/api/animes/'+anime.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({episodesSeen:String(Number(anime.episodesSeen||0)+1),watchedOn:today()})});if(!r.ok)throw Error();await window.load();}catch{b.disabled=false;window.notifyApp?.(t('searchError'),'error');}};(card.querySelector('.card-body')||card).append(b);}}
 let backupBusy=false,backupState=null;
 function paintBackup(s){backupState=s;$('encryptedBackupDirectory').value=s.directory||'';$('encryptedBackupInterval').value=s.intervalHours||24;$('encryptedBackupRetention').value=s.retention||7;$('encryptedBackupEnabled').checked=!!s.enabled;
  $('encryptedBackupStatus').textContent=s.running?t('backupBusy'):s.lastError?t(s.lastError==='ALM_BACKUP_LOCKED'?'backupLocked':'backupError'):s.lastSuccess?t('backupDone')+' · '+new Intl.DateTimeFormat(D.language(),{dateStyle:'short',timeStyle:'short'}).format(new Date(s.lastSuccess)):t('backupNever');$('encryptedBackupSecretStatus').textContent=s.secretStorage==='session'?t('backupSession'):s.unlocked?t('backupUnlocked'):t('backupLocked');window.ALM_BACKUP_UI?.paintSecret();
 }
 async function backupAction(fn){if(backupBusy)return;backupBusy=true;const buttons=$('encryptedBackupPanel').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);$('encryptedBackupStatus').textContent=t('backupBusy');try{await fn();paintBackup(await json('/api/backup/encrypted/status'));}catch(error){$('encryptedBackupStatus').textContent=t(error.code==='ALM_BACKUP_INVALID_PASSWORD_OR_FILE'?'backupInvalid':error.code==='ALM_BACKUP_PASSWORD'?'backupPassword':error.code==='ALM_BACKUP_LOCKED'?'backupLocked':'backupError');}finally{backupBusy=false;buttons.forEach(b=>b.disabled=false);window.ALM_BACKUP_UI?.paintSecret();}}
 function mountBackup(){const host=$('exportBackup')?.closest('.settings-disclosure-body');if(!host)return;const panel=document.createElement('section');panel.id='encryptedBackupPanel';panel.className='encrypted-backup-section';panel.setAttribute('data-no-i18n','');
  panel.innerHTML=`<h3 data-design-text="backupTitle"></h3><p data-design-text="backupHint"></p><div class="encrypted-backup-fields"><label><span data-design-text="backupFolder"></span><input id="encryptedBackupDirectory" type="text" autocomplete="off"><button type="button" id="encryptedBackupChoose" data-design-text="backupChoose"></button></label><label><span data-design-text="backupPassword"></span><input id="encryptedBackupPassword" type="password" autocomplete="new-password" minlength="12"><small data-design-text="backupPasswordHelp"></small></label><label><span data-design-text="backupInterval"></span><input id="encryptedBackupInterval" type="number" min="1" max="168" value="24"></label><label><span data-design-text="backupRetention"></span><input id="encryptedBackupRetention" type="number" min="1" max="60" value="7"></label></div><label class="checkbox-row"><input id="encryptedBackupEnabled" type="checkbox"><span data-design-text="backupEnabled"></span></label><div class="backup-actions"><button type="button" id="encryptedBackupSave" data-design-text="backupSave"></button><button type="button" id="encryptedBackupRun" data-design-text="backupRun"></button><button type="button" id="encryptedBackupExport" data-design-text="backupExport"></button></div><p id="encryptedBackupStatus" class="backup-status" role="status"></p><p id="encryptedBackupSecretStatus"></p><label><span data-design-text="backupFile"></span><input id="encryptedBackupFile" type="file" accept=".alm-backup"></label><button type="button" id="encryptedBackupRestore" data-design-text="backupRestore"></button>`;host.prepend(panel);
  $('encryptedBackupChoose').onclick=async()=>{const folder=await window.animeManager?.pickFolder?.();if(folder)$('encryptedBackupDirectory').value=folder;else $('encryptedBackupDirectory').focus();};
  $('encryptedBackupSave').onclick=()=>backupAction(async()=>{await json('/api/backup/encrypted/settings',{directory:$('encryptedBackupDirectory').value,intervalHours:Number($('encryptedBackupInterval').value),retention:Number($('encryptedBackupRetention').value),enabled:$('encryptedBackupEnabled').checked,password:$('encryptedBackupPassword').value});$('encryptedBackupPassword').value='';});
  $('encryptedBackupRun').onclick=()=>backupAction(()=>json('/api/backup/encrypted/run',{}));
  $('encryptedBackupExport').onclick=()=>backupAction(async()=>{const response=await fetch('/api/backup/encrypted/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('encryptedBackupPassword').value})});if(!response.ok){const data=await response.json();throw Object.assign(Error(),{code:data.code});}const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='ALM-'+today()+'.alm-backup';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('encryptedBackupPassword').value='';});
  $('encryptedBackupRestore').onclick=async()=>{const file=$('encryptedBackupFile').files[0];if(!file){window.notifyApp?.(t('backupSelectFile'),'error');return;}const password=await window.ALM_BACKUP_UI.promptRestore(file.name);if(password===null)return;await backupAction(async()=>{const form=new FormData();form.append('file',file);form.append('password',password);const r=await fetch('/api/backup/encrypted/restore',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw Object.assign(Error(),{code:data.code});$('encryptedBackupPassword').value='';$('encryptedBackupFile').value='';await window.load();});};
  const refresh=()=>json('/api/backup/encrypted/status').then(paintBackup).catch(()=>{});$('navSettings')?.addEventListener('click',refresh);$('settingsBtn')?.addEventListener('click',refresh);refresh();
 }
 function wallpaperSizes(){return;document.querySelectorAll('[data-wallpaper]').forEach(a=>{let small=a.querySelector('.wallpaper-size');if(!small){small=document.createElement('small');small.className='wallpaper-size';a.append(small);}small.textContent=t('wallpaperSize',{width:1672,height:941});});}
 function apply(){D.applyText();$('viewingTitle').textContent=t(activeTab==='years'?'viewingYears':'viewingCalendar');document.querySelectorAll('.viewing-increment').forEach(b=>b.textContent=t('viewingIncrement'));if(activeTab!=='profile')loadHistory();if(backupState)paintBackup(backupState);wallpaperSizes();}
 function init(){mountHistory();mountBackup();decorateWatching();apply();window.addEventListener('alm:library-rendered',()=>{decorateWatching();if(activeTab!=='profile')loadHistory();});window.addEventListener('alm:language-changed',apply);}
 window.ALM_BETA38={preparePayload,showProfile(){selectTab("profile");},showHistory(host,tab){host.append($("viewingPanel"));selectTab(tab||"calendar","calendar");}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
