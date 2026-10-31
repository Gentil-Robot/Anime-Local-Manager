(()=>{
 'use strict';
 const $=id=>document.getElementById(id),C=window.ALM_NOTEBOOK_COPY,lang=()=>window.ALM_I18N?.getLanguage?.()||document.documentElement.lang||'fr',t=(k,v)=>C.t(lang(),k,v),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let editor=null,preview=null,overview=[],serial=0;
 const matches=new WeakMap();let importGeneration=0;
 const labels=root=>root.querySelectorAll('[data-notebook-text]').forEach(n=>n.textContent=t(n.dataset.notebookText));
 const label=(key,control)=>'<label><span data-notebook-text="'+key+'">'+esc(t(key))+'</span>'+control+'</label>';
 const button=(action,key,extra='')=>'<button type="button" data-notebook-action="'+action+'" '+extra+' data-notebook-text="'+key+'">'+esc(t(key))+'</button>';
 const input=(name,value='',extra='')=>'<input name="'+name+'" value="'+esc(value)+'" '+extra+'>';
 const area=(name,value='',max=50000)=>'<textarea name="'+name+'" maxlength="'+max+'" rows="4">'+esc(value)+'</textarea>';
 const statusOptions=selected=>['Completed','On-Hold','Watching','Plan to Watch','Dropped'].map(s=>'<option value="'+s+'" '+(s===selected?'selected':'')+' data-notebook-text="status_'+s+'">'+esc(t('status_'+s))+'</option>').join('');
 async function request(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.code||data.error||'ERROR'),data);return data;}
 const message=(dialog,key,vars)=>{const node=dialog.querySelector('.notebook-footer [role=status]');node.dataset.messageKey=key;node.dataset.messageVars=JSON.stringify(vars||{});node.textContent=t(key,vars);};
 const report=(dialog,e)=>message(dialog,e.code==='NOTEBOOK_CONFLICT'?'conflict':e.code==='LIST_EXPIRED'?'expired':/^NOTEBOOK_/.test(e.code||'')?'invalid':/^LIST_/.test(e.code||'')?'listError':'error');
 async function refreshed(){if(typeof window.load==='function')await window.load();else window.dispatchEvent(new Event('alm:collection-changed'));}
 const confirm=message=>window.showAppConfirm?window.showAppConfirm(message,{okText:t('headerYes'),title:t('notebook'),cancelText:t('cancel')}):Promise.resolve(false);
 async function close(dialog){if(dialog.dataset.busy==='true')return;if(dialog.dataset.dirty==='true'&&!await confirm(t('discard')))return;dialog.close();}
 function makeDialog(id,key,content,actions){
  let dialog=$(id);if(!dialog){dialog=document.createElement('dialog');dialog.id=id;dialog.className='notebook-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby',id+'Title');document.body.append(dialog);
   dialog.addEventListener('cancel',e=>{e.preventDefault();close(dialog);});dialog.addEventListener('input',()=>{if(['notebookDialog','listImportDialog'].includes(dialog.id))dialog.dataset.dirty='true';});
  }
  dialog.innerHTML='<header class="notebook-head"><h2 id="'+id+'Title" data-notebook-text="'+key+'">'+esc(t(key))+'</h2></header><div class="notebook-body">'+content+'</div><footer class="notebook-footer"><p role="status" aria-live="polite"></p><div>'+actions+button('close','cancel')+'</div></footer>';
  dialog.dataset.dirty='false';dialog.dataset.busy='false';dialog.showModal();window.ALM_SCROLL_PROGRESS?.mount();return dialog;
 }
 async function busy(dialog,fn){if(dialog.dataset.busy==='true')return;dialog.dataset.busy='true';const controls=[...dialog.querySelectorAll('button,input,select,textarea')].map(n=>[n,n.disabled]);for(const [n]of controls)n.disabled=true;
  try{await fn();}catch(e){report(dialog,e);}finally{dialog.dataset.busy='false';for(const [n,disabled]of controls)if(n.isConnected)n.disabled=disabled;}
 }
 function episodeRow(e={}){return '<fieldset class="notebook-episode"><legend data-notebook-text="episode">'+esc(t('episode'))+'</legend><div class="notebook-columns">'+label('episode',input('number',e.number||'', 'type="number" min="1" max="100000" required'))+label('episodeTitle',input('episodeTitle',e.title||'','maxlength="200"'))+label('optionalScore',input('episodeScore',e.score??'','type="number" min="1" max="10"'))+'</div>'+label('memory',area('episodeText',e.text||'',10000))+button('remove-entry','remove')+'</fieldset>';}
 function awardRow(a={}){return '<fieldset class="notebook-award"><legend data-notebook-text="awards">'+esc(t('awards'))+'</legend><div class="notebook-columns">'+label('year',input('year',a.year||new Date().getFullYear(),'type="number" min="1900" max="'+new Date().getFullYear()+'" required'))+'<label><span data-notebook-text="awards">'+esc(t('awards'))+'</span><select name="kind"><option value="anime" data-notebook-text="animeAward">'+esc(t('animeAward'))+'</option><option value="episode" '+(a.kind==='episode'?'selected':'')+' data-notebook-text="episodeAward">'+esc(t('episodeAward'))+'</option></select></label>'+label('episode',input('awardEpisode',a.episode||'','type="number" min="1" max="100000" '+(a.kind==='episode'?'required':'disabled')) )+'</div>'+label('reason',area('awardText',a.text||'',2000))+button('remove-entry','remove')+'</fieldset>';}
 function editorPayload(dialog){
  const episodes=[...dialog.querySelectorAll('.notebook-episode')].map(row=>({number:Number(row.querySelector('[name=number]').value),title:row.querySelector('[name=episodeTitle]').value,text:row.querySelector('[name=episodeText]').value,score:row.querySelector('[name=episodeScore]').value||null}));
  const awards=[...dialog.querySelectorAll('.notebook-award')].map(row=>({year:Number(row.querySelector('[name=year]').value),kind:row.querySelector('[name=kind]').value,episode:row.querySelector('[name=awardEpisode]').value||null,text:row.querySelector('[name=awardText]').value}));
  return {revision:editor.revision,notes:dialog.querySelector('[name=notes]').value,personalJournal:{episodes,awards}};
 }
 async function open(id){
  const marker=++serial;let data;try{data=await request('/api/library/'+Number(id)+'/notebook');}catch{window.notifyApp?.(t('error'),'error');return;}if(marker!==serial)return;
  if($('notebookDialog')?.open){if($('notebookDialog').dataset.dirty==='true'&&!await confirm(t('discard')))return;$('notebookDialog').close();}
  editor=data;const j=data.personalJournal;
  const dialog=makeDialog('notebookDialog','notebook','<p class="notebook-anime-title" translate="no">'+esc(window.ALM_TITLES?.title(data)||data.title)+'</p><p class="muted" data-notebook-text="privacy">'+esc(t('privacy'))+'</p><form id="notebookForm">'+label('notes',area('notes',data.notes))+'<section><h3 data-notebook-text="episodes">'+esc(t('episodes'))+'</h3><p class="muted" data-notebook-text="episodeHelp">'+esc(t('episodeHelp'))+'</p><div id="notebookEpisodes">'+j.episodes.map(episodeRow).join('')+'</div>'+button('add-episode','addEpisode')+'</section><section><h3 data-notebook-text="awards">'+esc(t('awards'))+'</h3><p class="muted" data-notebook-text="awardHelp">'+esc(t('awardHelp'))+'</p><div id="notebookAwards">'+j.awards.map(awardRow).join('')+'</div>'+button('add-award','addAward')+'</section></form>',button('copy-notes','copyText')+button('save-notebook','save','class="primary"'));
  $('notebookForm').onsubmit=e=>{e.preventDefault();save(dialog);};
 }
 async function save(dialog){
  if(!$('notebookForm').reportValidity())return;
  await busy(dialog,async()=>{
   const payload=editorPayload(dialog);let result;
   try{result=await request('/api/library/'+editor.id+'/notebook',{method:'PATCH',body:JSON.stringify(payload)});}catch(e){
    if(e.code!=='NOTEBOOK_AWARD_CONFLICT')throw e;
    if(!await confirm(t('awardConflict',{titles:e.conflicts.map(c=>c.title+' ('+c.year+')').join(', ')})))return;
    result=await request('/api/library/'+editor.id+'/notebook',{method:'PATCH',body:JSON.stringify({...payload,replaceAwards:e.conflictToken})});
   }
   editor=result;dialog.dataset.dirty='false';await refreshed();if($('memoryDialog')?.open)await loadOverview();if($('memoryPage')&&!$('memoryPage').classList.contains('hidden'))await window.ALM_MEMORIES_PAGE?.refresh();window.notifyApp?.(t('saved'),'success');dialog.close();
  });
 }
 async function loadOverview(){const data=await request('/api/notebook');overview=data.items;const years=[...new Set(overview.flatMap(a=>a.personalJournal.awards.map(v=>v.year)))].sort((a,b)=>b-a),old=$('notebookYear').value;$('notebookYear').innerHTML='<option value="" data-notebook-text="allYears">'+esc(t('allYears'))+'</option>'+years.map(y=>'<option>'+y+'</option>').join('');$('notebookYear').value=years.includes(Number(old))?old:'';renderOverview();}
 async function memories(){
  const dialog=makeDialog('memoryDialog','collectionNotebook','<p data-notebook-text="privacy">'+esc(t('privacy'))+'</p><div class="notebook-filters"><label class="notebook-search"><span data-notebook-text="search">'+esc(t('search'))+'</span><input type="search" id="notebookSearch"></label><label><span data-notebook-text="allEntries">'+esc(t('allEntries'))+'</span><select id="notebookFilter">'+['allEntries','withNotes','withEpisodes','withAwards'].map((key,i)=>'<option value="'+i+'" data-notebook-text="'+key+'">'+esc(t(key))+'</option>').join('')+'</select></label><label><span data-notebook-text="year">'+esc(t('year'))+'</span><select id="notebookYear"></select></label></div><p id="notebookSummary"></p><div id="notebookEntries"></div>',button('export-dialog','export'));
  dialog.querySelectorAll('input,select').forEach(n=>n.addEventListener('input',()=>{dialog.dataset.dirty='false';renderOverview();}));
  try{await loadOverview();}catch(e){report(dialog,e);}
 }
 function renderOverview(){
  const q=$('notebookSearch').value.trim().toLocaleLowerCase(),year=Number($('notebookYear').value)||0,filter=$('notebookFilter').value;
  const rows=overview.filter(a=>{const j=a.personalJournal;return (a.notes.trim()||j.episodes.length||j.awards.length)&&(!year||j.awards.some(v=>v.year===year))&&(filter==='0'||filter==='1'&&a.notes.trim()||filter==='2'&&j.episodes.length||filter==='3'&&j.awards.length)&&(!q||[a.title,a.titleEn,a.titleJa,...Object.values(a.localizedTitles||{}),a.notes,...j.episodes.flatMap(e=>[e.title,e.text,String(e.number)]),...j.awards.flatMap(a=>[a.text,String(a.year)])].join(' ').toLocaleLowerCase().includes(q));}).sort((a,b)=>String(a.title).localeCompare(String(b.title),lang()));
  $('notebookSummary').textContent=t('summary',{notes:rows.filter(a=>a.notes.trim()).length,episodes:rows.reduce((n,a)=>n+a.personalJournal.episodes.length,0),awards:rows.reduce((n,a)=>n+a.personalJournal.awards.length,0)});
  $('notebookEntries').innerHTML=rows.length?rows.map(a=>'<article class="notebook-summary-card"><h3 translate="no">'+esc(window.ALM_TITLES?.title(a)||a.title)+'</h3>'+(a.notes?'<p class="notebook-preview">'+esc(a.notes)+'</p>':'')+a.personalJournal.episodes.map(e=>'<details><summary>'+esc(t('episode')+' '+e.number+(e.title?' — '+e.title:'')+(e.score?' · '+e.score+'/10':''))+'</summary><p class="notebook-text">'+esc(e.text)+'</p></details>').join('')+a.personalJournal.awards.filter(e=>!year||e.year===year).map(e=>'<p class="notebook-award-badge">'+esc(e.year+' · '+t(e.kind==='anime'?'animeAward':'episodeAward')+(e.episode?' · '+t('episode')+' '+e.episode:'')+(e.text?' — '+e.text:''))+'</p>').join('')+button('open-notebook','editMemory','data-id="'+Number(a.id)+'"')+'</article>').join(''):'<p data-notebook-text="empty">'+esc(t('empty'))+'</p>';
 }
 function importDialog(){
  const modal=$('importDialog');if(!modal)return;if(!modal.open)modal.showModal();
  if(window.activateImportTab)window.activateImportTab('listImportPanel');
  else{document.querySelectorAll('.import-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='listImportPanel'));document.querySelectorAll('.import-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!=='listImportPanel'));}
  window.ALM_SCROLL_PROGRESS?.mount();($('notebookImportSource')?.open?$('notebookListText'):$('notebookMatchesTitle'))?.focus();
 }
 function resetMatches(dialog){
  importGeneration++;dialog.querySelectorAll('.notebook-import-row').forEach(row=>{const state=matches.get(row);if(!state)return;state.sequence++;state.controller?.abort();row.removeAttribute('aria-busy');row.querySelector('[data-match-status]').textContent='';row.querySelector('[data-notebook-action=search-match]').disabled=false;});
 }
 function updateImportSelection(){
  const panel=$('listImportPanel');if(!panel)return;
  const rows=[...panel.querySelectorAll('.notebook-import-row')],selected=rows.filter(row=>row.querySelector('.notebook-select')?.checked&&row.querySelector('.notebook-match')?.value).length;
  panel.querySelector('[data-notebook-action=commit-list]').disabled=!preview||!selected||panel.dataset.busy==='true';
  const count=$('notebookSelectionCount');count.textContent=preview?t('selectionCount',{selected,total:rows.length}):'';
 }
 function mountImportPanel(){
  const dialog=$('listImportPanel');if(!dialog||dialog.dataset.mounted)return;dialog.dataset.mounted='true';dialog.dataset.busy='false';dialog.dataset.dirty='false';
  dialog.innerHTML='<div class="notebook-body" id="notebookImportScroll"><details id="notebookImportSource" open><summary data-notebook-text="sourceList">'+esc(t('sourceList'))+'</summary><p data-notebook-text="pasteHelp">'+esc(t('pasteHelp'))+'</p><label><span data-notebook-text="chooseFile">'+esc(t('chooseFile'))+'</span><input id="notebookListFile" type="file" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"></label><form id="notebookImportForm"><label><span data-notebook-text="importList">'+esc(t('importList'))+'</span><textarea id="notebookListText" maxlength="500000" rows="6" required></textarea></label><div class="notebook-columns">'+label('delimiter','<select id="notebookDelimiter">'+['auto','lines','tab','semicolon','comma'].map(v=>'<option value="'+v+'" data-notebook-text="'+v+'">'+esc(t(v))+'</option>').join('')+'</select>')+label('header','<select id="notebookHeader"><option value="auto" data-notebook-text="headerAuto">'+esc(t('headerAuto'))+'</option><option value="true" data-notebook-text="headerYes">'+esc(t('headerYes'))+'</option><option value="false" data-notebook-text="headerNo">'+esc(t('headerNo'))+'</option></select>')+label('defaultStatus','<select id="notebookDefaultStatus">'+statusOptions('Completed')+'</select>')+'</div><details><summary data-notebook-text="columns">'+esc(t('columns'))+'</summary><p data-notebook-text="columnHelp">'+esc(t('columnHelp'))+'</p><div class="notebook-columns">'+['title','notes','score','status'].map(key=>label(key,input('column_'+key,'','type="number" min="1" max="31"'))).join('')+'</div></details><button class="primary" type="submit" data-notebook-text="analyze">'+esc(t('analyze'))+'</button></form></details><section id="notebookListPreview" aria-labelledby="notebookMatchesTitle"></section></div><footer class="notebook-footer"><p role="status" aria-live="polite"></p><div><span id="notebookSelectionCount" aria-live="polite"></span>'+button('commit-list','importSelected','class="primary" disabled')+button('close-import','close')+'</div></footer>';
  $('notebookImportForm').addEventListener('input',()=>{resetMatches(dialog);preview=null;$('notebookListPreview').replaceChildren();message(dialog,'');updateImportSelection();});
  $('notebookListFile').onchange=async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1024*1024)throw {code:'LIST_LIMIT'};$('notebookListText').value=await file.text();$('notebookListText').dispatchEvent(new Event('input',{bubbles:true}));}catch(e){report(dialog,e);}};
  $('notebookImportForm').onsubmit=e=>{e.preventDefault();analyse(dialog);};
  dialog.addEventListener('submit',event=>{const form=event.target.closest('.notebook-match-search');if(!form)return;event.preventDefault();searchMatch(form.closest('.notebook-import-row'),dialog);});
  dialog.addEventListener('input',event=>{
   if(!event.target.matches('.notebook-match-search input'))return;
   const row=event.target.closest('.notebook-import-row'),state=matches.get(row);if(!state)return;
   state.sequence++;state.controller?.abort();row.removeAttribute('aria-busy');row.querySelector('[data-notebook-action=search-match]').disabled=false;row.querySelector('[data-match-status]').textContent='';
  });
 }
 const matchTitle=record=>window.ALM_TITLES?.title(record)||record.title||'';
 function posterURL(value){
  try{const url=new URL(value,location.origin);return value&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
 }
 function paintCandidates(row){
  const state=matches.get(row);if(!state)return;
  const value=row.querySelector('.notebook-match').value,all=state.candidates,visible=state.expanded?all:all.slice(0,4);
  // Always keep the chosen cover visible, even when it is not among the new results.
  const selected=all.find(c=>String(c.malId)===value);if(selected&&!visible.includes(selected))visible.unshift(selected);
  const grid=row.querySelector('.notebook-candidates');grid.replaceChildren();
  for(const item of visible){
   const id=String(item.malId),chosen=value===id,card=document.createElement('article');card.className='notebook-candidate'+(chosen?' is-selected':'');card.dataset.malId=id;
   const cover=document.createElement('button');cover.type='button';cover.className='notebook-candidate-cover';cover.dataset.notebookAction='match-detail';cover.dataset.malId=id;cover.setAttribute('aria-label',t('openMatch',{title:matchTitle(item)}));
   const placeholder=document.createElement('span');placeholder.textContent='✦';placeholder.setAttribute('aria-hidden','true');cover.append(placeholder);
   const url=posterURL(item.poster||item.imageUrl);if(url){const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();cover.append(img);}
   const copy=document.createElement('div');copy.className='notebook-candidate-copy';
   const choose=document.createElement('button');choose.type='button';choose.className='notebook-candidate-choice';choose.dataset.notebookAction='choose-match';choose.dataset.malId=id;choose.setAttribute('aria-pressed',String(chosen));choose.setAttribute('aria-label',t('chooseMatch',{title:matchTitle(item)}));
   const title=document.createElement('strong');title.textContent=matchTitle(item);title.setAttribute('translate','no');
   const facts=document.createElement('small');facts.textContent=[item.type,item.year||String(item.startDate||'').slice(0,4)].filter(Boolean).join(' · ');
   const badge=document.createElement('span');badge.className='notebook-candidate-badge';badge.textContent=(chosen?'✓ ':'')+t(chosen?'matchSelected':'useMatch');choose.append(title,facts,badge);
   const detail=document.createElement('button');detail.type='button';detail.className='notebook-candidate-detail';detail.dataset.notebookAction='match-detail';detail.dataset.malId=id;detail.textContent=t('viewMatch');detail.setAttribute('aria-label',t('openMatch',{title:matchTitle(item)}));copy.append(choose,detail);card.append(cover,copy);grid.append(card);
  }
  row.querySelector('.notebook-no-match').hidden=all.length>0;
  const more=row.querySelector('[data-notebook-action=more-matches]');more.hidden=all.length<=4;more.textContent=t(state.expanded?'fewerMatches':'moreMatches',{count:all.length});
  const manual=row.querySelector('[data-notebook-action=manual-match]');manual.setAttribute('aria-pressed',String(value==='manual'));
 }
 function chooseMatch(row,id){
  if(!preview||$('listImportPanel').dataset.busy==='true')return;
  const state=matches.get(row);if(!state||id!=='manual'&&!state.candidates.some(c=>String(c.malId)===id))return;
  row.querySelector('.notebook-match').value=id;const include=row.querySelector('.notebook-select');include.disabled=false;include.checked=true;paintCandidates(row);updateImportSelection();
  // Repainting must not strand keyboard users on the document body.
  const button=[...row.querySelectorAll('[data-notebook-action=choose-match]')].find(b=>b.dataset.malId===id)||row.querySelector('[data-notebook-action=manual-match]');button?.focus({preventScroll:true});
 }
 function openMatch(row,id,source){
  const items=matches.get(row)?.candidates||[],index=items.findIndex(c=>String(c.malId)===id);if(index<0)return;
  // This is the same detail gallery as Search; importing remains an explicit final action.
  window.ALM_CATALOG?.openRecords(items,index,source,{readOnly:true});
 }
 async function analyse(dialog){if(dialog.dataset.busy==='true')return;resetMatches(dialog);await busy(dialog,async()=>{
  const generation=importGeneration,columns={};for(const key of ['title','notes','score','status']){const v=dialog.querySelector('[name=column_'+key+']').value;if(v!=='')columns[key]=Number(v)-1;}
  const payload={text:$('notebookListText').value,delimiter:$('notebookDelimiter').value,header:$('notebookHeader').value==='auto'?'auto':$('notebookHeader').value==='true',status:$('notebookDefaultStatus').value,columns};
  const result=await request('/api/import/list/preview',{method:'POST',body:JSON.stringify(payload)});if(generation!==importGeneration)return;preview=result;
  $('notebookListPreview').innerHTML='<h3 id="notebookMatchesTitle" tabindex="-1" data-notebook-text="reviewMatches">'+esc(t('reviewMatches'))+'</h3><p data-notebook-text="matchHelp">'+esc(t('matchHelp'))+'</p>'+result.rows.map(row=>'<article class="notebook-import-row" data-key="'+esc(row.key)+'"><header><label class="notebook-check"><input type="checkbox" class="notebook-select" '+(row.invalid||row.existing||!row.selectedMalId?'disabled':'checked')+'><span translate="no">'+esc(row.title)+'</span></label>'+(row.invalid||row.existing?'<small data-notebook-status="'+esc(row.status)+'">'+esc(t('status_'+row.status))+(row.score?' · '+esc(row.score)+'/10':'')+'</small>':'<div class="notebook-import-state">'+label('status','<select class="notebook-row-status">'+statusOptions(row.status)+'</select>')+(row.score?'<small>'+esc(row.score)+'/10</small>':'')+'</div>')+'</header>'+(row.invalid?'<p data-notebook-text="invalidRow">'+esc(t('invalidRow'))+'</p>':row.existing?'<p data-notebook-text="alreadyExists">'+esc(t('alreadyExists'))+'</p>':'<input type="hidden" class="notebook-match" value="'+esc(row.selectedMalId||'')+'"><div class="notebook-candidates"></div><p class="notebook-no-match" data-notebook-text="noMatches">'+esc(t('noMatches'))+'</p>'+button('more-matches','moreMatches')+'<form class="notebook-match-search"><label><span data-notebook-text="searchMatch">'+esc(t('searchMatch'))+'</span><input type="search" maxlength="160" minlength="2" required aria-label="'+esc(t('searchMatch'))+'" value="'+esc(row.title)+'"></label>'+button('search-match','searchMatch')+'</form><p class="notebook-match-status" data-match-status role="status" aria-live="polite"></p>'+button('manual-match','manual','class="notebook-manual" aria-pressed="false"'))+(row.notes?'<details class="notebook-import-notes"><summary data-notebook-text="notes">'+esc(t('notes'))+'</summary><p class="notebook-preview">'+esc(row.notes)+'</p></details>':'')+'</article>').join('');
  for(const row of dialog.querySelectorAll('.notebook-import-row')){const data=result.rows.find(r=>String(r.key)===row.dataset.key);if(data.invalid||data.existing)continue;matches.set(row,{candidates:data.candidates||[],expanded:false,sequence:0});paintCandidates(row);}
  $('notebookImportSource').open=false;$('notebookImportScroll').scrollTop=0;$('notebookMatchesTitle').focus({preventScroll:true});message(dialog,'previewOnly');
 });updateImportSelection();}
 async function searchMatch(row,dialog){
  const state=matches.get(row),query=row.querySelector('input[type=search]').value.trim(),status=row.querySelector('[data-match-status]');if(!state||dialog.dataset.busy==='true')return;
  if(query.length<2){status.textContent=t('queryTooShort');return;}
  state.controller?.abort();const controller=new AbortController(),sequence=++state.sequence,generation=importGeneration;state.controller=controller;
  const button=row.querySelector('[data-notebook-action=search-match]');button.disabled=true;row.setAttribute('aria-busy','true');status.textContent=t('loading');
  const current=()=>generation===importGeneration&&state.sequence===sequence&&row.isConnected&&!controller.signal.aborted;
  try{
   const data=await request('/api/catalog?q='+encodeURIComponent(query),{signal:controller.signal});if(!current())return;
   const value=row.querySelector('.notebook-match').value,selected=state.candidates.find(c=>String(c.malId)===value),items=(data.items||[]).slice(0,20).filter(c=>Number.isSafeInteger(Number(c.malId))&&Number(c.malId)>0);
   state.candidates=[...new Map([...(selected?[selected]:[]),...items].map(c=>[Number(c.malId),c])).values()];state.expanded=false;paintCandidates(row);status.textContent=t(items.length?'matchResults':'noSearchResults',{count:items.length});
  }catch(e){if(current())status.textContent=t('matchSearchError');}
  finally{if(current()){button.disabled=false;row.removeAttribute('aria-busy');}}
 }
 async function commit(dialog){if(!preview||dialog.dataset.busy==='true')return;resetMatches(dialog);await busy(dialog,async()=>{
  const selections=[];for(const row of dialog.querySelectorAll('.notebook-import-row'))if(row.querySelector('.notebook-select').checked){const v=row.querySelector('.notebook-match')?.value;if(!v)throw {code:'LIST_SELECTION'};selections.push({key:row.dataset.key,...(v==='manual'?{manual:true}:{malId:Number(v)}),status:row.querySelector('.notebook-row-status').value});}if(!selections.length)throw {code:'LIST_SELECTION'};
  const payload={token:preview.token,selections};let result;try{result=await request('/api/import/list/commit',{method:'POST',body:JSON.stringify(payload)});}catch(e){if(e.code!=='ALM_EPISODES_UNKNOWN')throw e;if(!await confirm(t('unknownEpisodes')))return;result=await request('/api/import/list/commit',{method:'POST',body:JSON.stringify({...payload,confirmUnknownEpisodes:true})});}
  preview=null;dialog.dataset.dirty='false';await refreshed();message(dialog,'importResult',{added:result.added,skipped:result.skipped.length});$('notebookListPreview').replaceChildren();if(result.undoToken){const undo=document.createElement('button');undo.type='button';undo.textContent=t('undo');undo.dataset.notebookAction='undo-import';undo.dataset.token=result.undoToken;dialog.querySelector('.notebook-footer>div').prepend(undo);}
 });updateImportSelection();}
 function exports(){return makeDialog('readableExportDialog','export','<p data-notebook-text="exportHelp">'+esc(t('exportHelp'))+'</p><div class="notebook-export-actions">'+button('export-csv','exportCsv')+button('export-html','exportHtml')+'</div>','');}
 async function download(format,dialog){await busy(dialog,async()=>{const r=await fetch('/api/library/export/readable?format='+format+'&lang='+encodeURIComponent(lang()));if(!r.ok)throw Error('ERROR');const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='ALM-'+new Date().toISOString().slice(0,10)+'.'+format;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);});}
 document.addEventListener('change',event=>{const row=event.target.closest('.notebook-award');if(row&&event.target.name==='kind'){const field=row.querySelector('[name=awardEpisode]');field.disabled=event.target.value!=='episode';field.required=!field.disabled;}if(event.target.matches('.notebook-select'))updateImportSelection();});
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-notebook-action]');if(!b)return;event.preventDefault();event.stopPropagation();const action=b.dataset.notebookAction,dialog=b.closest('#listImportPanel')||b.closest('dialog');
  if(action==='open-notebook')open(b.dataset.id);else if(action==='memories')memories();else if(action==='import-list')importDialog();else if(action==='export-dialog')exports();else if(action==='close-import'){if(dialog.dataset.busy!=='true')dialog.closest('dialog').close();}else if(action==='close')close(dialog);else if(action==='add-episode'){if(dialog.querySelectorAll('.notebook-episode').length>=300){message(dialog,'invalid');return;}$('notebookEpisodes').insertAdjacentHTML('beforeend',episodeRow());dialog.dataset.dirty='true';$('notebookEpisodes').lastElementChild.querySelector('input').focus();}
  else if(action==='add-award'){$('notebookAwards').insertAdjacentHTML('beforeend',awardRow());dialog.dataset.dirty='true';$('notebookAwards').lastElementChild.querySelector('input').focus();}
  else if(action==='remove-entry'){b.closest('fieldset').remove();dialog.dataset.dirty='true';}
  else if(action==='choose-match')chooseMatch(b.closest('.notebook-import-row'),b.dataset.malId);
  else if(action==='manual-match')chooseMatch(b.closest('.notebook-import-row'),'manual');
  else if(action==='match-detail')openMatch(b.closest('.notebook-import-row'),b.dataset.malId,b);
  else if(action==='more-matches'){const row=b.closest('.notebook-import-row'),state=matches.get(row);state.expanded=!state.expanded;paintCandidates(row);}
  else if(action==='save-notebook')save(dialog);else if(action==='search-match')searchMatch(b.closest('.notebook-import-row'),dialog);else if(action==='commit-list')commit(dialog);
  else if(action==='undo-import')busy(dialog,async()=>{const r=await request('/api/library/undo',{method:'POST',body:JSON.stringify({token:b.dataset.token})});await refreshed();message(dialog,'undone',r);b.remove();});
  else if(action==='copy-notes')busy(dialog,async()=>{const ok=await window.ALM_CLIPBOARD?.copy(dialog.querySelector('[name=notes]').value);if(!ok)throw Error('ERROR');message(dialog,'copied');});
  else if(action==='export-csv'||action==='export-html')download(action.slice(7),dialog);
 });
 function translate(){labels(document);document.querySelectorAll('.notebook-footer [data-message-key]').forEach(node=>{node.textContent=t(node.dataset.messageKey,JSON.parse(node.dataset.messageVars||'{}'));});document.querySelector('.import-tabs')?.setAttribute('aria-label',t('importFormats'));document.querySelectorAll('.notebook-match-search input').forEach(n=>n.setAttribute('aria-label',t('searchMatch')));document.querySelectorAll('.notebook-import-row').forEach(row=>{const data=preview?.rows.find(r=>String(r.key)===row.dataset.key),status=row.querySelector('[data-notebook-status]');if(status&&data)status.textContent=t('status_'+data.status)+(data.score?' · '+data.score+'/10':'');if(matches.has(row)){paintCandidates(row);row.querySelector('[data-match-status]').textContent='';}});updateImportSelection();if($('memoryDialog')?.open)renderOverview();}
 function start(){
  mountImportPanel();
  const tools=$('studioTools')?.querySelector('.studio-toolbar-menu')||document.querySelector('.header-actions');if(tools){const block=document.createElement('div');block.className='notebook-tools';block.setAttribute('data-no-i18n','');block.innerHTML=button('import-list','importList')+button('export-dialog','export');tools.prepend(block);}
  translate();
 }
 window.addEventListener('alm:language-changed',translate);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
 window.ALM_NOTEBOOK={open,memories,importList:importDialog,exports,t};
})();
