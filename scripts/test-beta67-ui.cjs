'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom'),N=require('../lib/notebook-model');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,'public',name),'utf8'),tick=()=>new Promise(r=>setTimeout(r,35));
(async()=>{
 const dom=new JSDOM(read('index.html'),{url:'http://127.0.0.1:3123',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  let language='fr',reloads=0,confirmations=0,allowClose=false;const calls=[],notifications=[];
  const records=[{id:1,malId:1,title:'Cowboy Bebop',status:'Completed',episodesTotal:'26',notes:'Avant\n\nAprès',personalJournal:{episodes:[],awards:[]}},{id:2,malId:5,title:'Cowboy Bebop Movie',notes:'',personalJournal:{episodes:[],awards:[]}}];
  w._almAnimes=records;w.ALM_I18N={getLanguage:()=>language};w.ALM_SCROLL_PROGRESS={mount(){}};w.ALM_TITLES={title:a=>a.title};w.ALM_CLIPBOARD={copy:async()=>true};w.notifyApp=(s,t)=>notifications.push([s,t]);w.load=async()=>{reloads++;w.dispatchEvent(new w.Event('alm:collection-changed'));};w.confirm=()=>{throw Error("Native confirmation must not be called");};w.showAppConfirm=async()=>{confirmations++;return allowClose;};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const toolbar=w.document.createElement('details');toolbar.id='studioTools';toolbar.innerHTML='<div class="studio-toolbar-menu"></div>';w.document.querySelector('.header-actions').append(toolbar);
  const projection=a=>({...a,revision:N.revision(a)});
  w.fetch=async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null;calls.push({url,body,method:options.method||'GET'});let data;
   if(url==='/api/notebook')data={items:records.map(projection)};
   else if(/^\/api\/library\/\d+\/notebook$/.test(url)){const a=records.find(a=>a.id===Number(url.split('/')[3]));if(options.method==='PATCH'){assert.equal(body.revision,N.revision(a));a.notes=body.notes;a.personalJournal=N.journal(body.personalJournal);}data=projection(a);}
   else if(url==='/api/import/list/preview')data={token:'fixture-preview',rows:[{key:'0',title:'Naruto',notes:'Import private\n\ntext',status:'Plan to Watch',score:'',candidates:[{malId:20,title:'Naruto',type:'TV',year:2002}],selectedMalId:20},{key:'1',title:'Manual choice',notes:'',status:'Plan to Watch',score:'',candidates:[],selectedMalId:null}]};
   else if(url==='/api/import/list/commit')data={ok:true,added:2,skipped:[],undoToken:'fixture-undo'};
   else if(url==='/api/library/undo')data={undone:1,skipped:1};
   else if(url.startsWith('/api/catalog?'))data={items:[{malId:21,title:'One Piece',type:'TV',startDate:'1999-01-01'}]};
   else throw Error('Unexpected request: '+url);
   return {ok:true,json:async()=>data};
  };
  for(const f of ['notebook-copy.js','notebook.js'])w.eval(read(f));
  assert.equal(w.document.querySelectorAll('.notebook-tools button').length,2);
  await w.ALM_NOTEBOOK.open(1);const editor=w.document.getElementById('notebookDialog');assert(editor.open);assert.equal(editor.querySelector('[name=notes]').value,records[0].notes);
  const notes=editor.querySelector('[name=notes]');notes.value='Mon avis.\n\nMon avis. 💜';notes.dispatchEvent(new w.Event('input',{bubbles:true}));
  editor.querySelector('[data-notebook-action=add-episode]').click();let ep=editor.querySelector('.notebook-episode');ep.querySelector('[name=number]').value='7';ep.querySelector('[name=episodeTitle]').value='La scène du train';ep.querySelector('[name=episodeText]').value='<script>private only</script>';ep.querySelector('[name=episodeScore]').value='9';
  editor.querySelector('[data-notebook-action=add-award]').click();const award=editor.querySelector('.notebook-award'),kind=award.querySelector('[name=kind]');assert(award.querySelector('[name=awardEpisode]').disabled);kind.value='episode';kind.dispatchEvent(new w.Event('change',{bubbles:true}));assert(!award.querySelector('[name=awardEpisode]').disabled);award.querySelector('[name=awardEpisode]').value='7';award.querySelector('[name=year]').value='2025';award.querySelector('[name=awardText]').value='Découvert cette année-là.';
  editor.querySelector('[data-notebook-action=close]').click();assert(editor.open);assert.equal(confirmations,1);
  for(const code of ['en','ja','es','de','pt-BR','zh-CN','fr']){language=code;w.document.documentElement.lang=code;w.dispatchEvent(new w.Event('alm:language-changed'));assert.equal(editor.querySelector('h2').textContent,w.ALM_NOTEBOOK.t('notebook'));assert.equal(notes.value,'Mon avis.\n\nMon avis. 💜');}
  editor.querySelector('[data-notebook-action=save-notebook]').click();await tick();assert(!editor.open);assert.equal(records[0].notes,'Mon avis.\n\nMon avis. 💜');assert.equal(records[0].personalJournal.episodes[0].number,7);assert.equal(records[0].personalJournal.awards[0].episode,7);assert.equal(reloads,1);assert.equal(records[0].status,'Completed');
  await w.ALM_NOTEBOOK.memories();const memories=w.document.getElementById('memoryDialog');assert.equal(memories.querySelectorAll('.notebook-summary-card').length,1);assert.equal(memories.querySelectorAll('script,img').length,0);assert(memories.textContent.includes('<script>private only</script>'));
  const search=w.document.getElementById('notebookSearch');search.value='train';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(memories.querySelectorAll('.notebook-summary-card').length,1);assert.equal(memories.dataset.dirty,'false');search.value='no match';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(memories.querySelectorAll('.notebook-summary-card').length,0);search.value='';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.getElementById('notebookYear').value='2025';w.document.getElementById('notebookYear').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(memories.querySelectorAll('.notebook-award-badge').length,1);
  memories.querySelector('[data-notebook-action=open-notebook]').click();await tick();assert(editor.open);editor.querySelector('[data-notebook-action=close]').click();assert(!editor.open);memories.querySelector('[data-notebook-action=close]').click();assert(!memories.open);
  w.ALM_NOTEBOOK.importList();const imp=w.document.getElementById('listImportPanel'),text=w.document.getElementById('notebookListText');text.value='Naruto\nManual choice';text.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.getElementById('notebookDefaultStatus').value='Plan to Watch';
  w.document.getElementById('notebookImportForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();const rows=imp.querySelectorAll('.notebook-import-row');assert.equal(rows.length,2);assert(rows[0].querySelector('.notebook-select').checked);assert(!rows[1].querySelector('.notebook-select').checked);assert(!imp.querySelector('[data-notebook-action=commit-list]').disabled);
  rows[1].querySelector('[data-notebook-action=manual-match]').click();assert(rows[1].querySelector('.notebook-select').checked);
  rows[0].querySelector('[data-notebook-action=search-match]').click();await tick();assert(rows[0].querySelector('.notebook-candidate[data-mal-id="21"]'));assert.equal(rows[0].querySelector('.notebook-match').value,'20');
  imp.querySelector('[data-notebook-action=commit-list]').click();await tick();assert.equal(calls.find(c=>c.url==='/api/import/list/commit').body.selections[1].manual,true);assert(imp.querySelector('[data-notebook-action=commit-list]').disabled);assert(imp.querySelector('[role=status]').textContent.includes('2'));
  imp.querySelector('[data-notebook-action=undo-import]').click();await tick();assert(imp.querySelector('[role=status]').textContent.includes('1'));assert(!imp.querySelector('[data-notebook-action=undo-import]'));assert.equal(reloads,3);
  w.ALM_NOTEBOOK.exports();assert(w.document.getElementById('readableExportDialog').open);assert.equal(w.document.querySelectorAll('#readableExportDialog .notebook-export-actions button').length,2);
  const style=w.document.createElement('style');style.textContent=read('style.css')+'\n'+read('design.css')+'\n'+read('notebook.css');w.document.head.append(style);assert.equal(imp.closest('dialog').id,'importDialog');assert(!w.document.getElementById('listImportDialog'));assert.equal(w.getComputedStyle(imp.querySelector('.notebook-body')).overflow,'auto');assert(Number.parseInt(w.getComputedStyle(imp.querySelector('.notebook-footer')).paddingRight)>=128);
  // The actual shared detail renderer must offer the notebook everywhere it finds an owned anime.
  w.ALM_DESIGN={escape:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),t:k=>k,language:()=>language,icon:()=>'',applyText(){}};w.ALM_RETOUCHES={t:k=>k};w.safeUrlV2=s=>s;w.ALM_CONTENT_LANGUAGE={genre:s=>s};w.ALM_CATALOG_ENABLED=true;w.eval(read('collection-state.js'));w.eval(read('discovery.js'));
  const host=w.document.getElementById('rankingDetail');assert(host);await w.ALM_DISCOVERY.showDetail(records[0],'rankingDetail');assert.equal(host.querySelector('[data-notebook-action=open-notebook]').dataset.id,'1');assert.equal(host.querySelector('[data-notebook-action=open-notebook]').textContent,w.ALM_NOTEBOOK.t('notebook'));
  w.$=id=>w.document.getElementById(id);w.ALM_FORM={reset(){}};const app=read('app.js'),edit=app.slice(app.indexOf('function openEdit(anime) {'),app.indexOf('async function saveForm(event)'));w.eval(edit);w.openEdit({...records[0],score:'0'});assert.equal(w.document.getElementById('score').value,'');assert(w.document.getElementById('score').checkValidity(),'Legacy zero means unrated and must not block editing');w.document.getElementById('formDialog').close();
  console.log('OK Beta67 UI: real notebook editor, optional episode scores, yearly episode choices, dirty-close protection, language changes retain drafts, memory search/year filters and direct edits, explicit list matching and safe undo, shared detail access and scroll/footer separation.');
 }finally{w.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
