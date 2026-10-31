'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const original=[
 {id:1,title:'Étoile',malId:1,status:'Watching',type:'TV',startDate:'2020-04-01',genres:['Drama'],poster:'https://cdn.myanimelist.net/images/anime/1.jpg',notes:'Souvenir <script>alert(1)</script> & émotion',personalJournal:{episodes:[{number:3,title:'Retrouvailles',text:'Épisode personnel',score:9}],awards:[{year:2025,kind:'anime',text:'Mon choix 2025'},{year:2024,kind:'episode',episode:3,text:'Choix 2024'}]}},
 {id:2,title:'Étoile Season 2',malId:2,status:'Plan to Watch',startDate:'2024-01-01',genres:['Drama'],tags:['nouvelle saison'],poster:'/images/two.jpg',notes:'Suite détectée depuis : Étoile',personalJournal:{episodes:[],awards:[]}},
 {id:3,title:'Recommandation seule',status:'Plan to Watch',notes:'Ajouté depuis Recommandations.',personalJournal:{episodes:[],awards:[]}},
 {id:4,title:'Note ambiguë',status:'Completed',genres:['Comedy'],notes:'Saison 1\nSaison 2\nSuite détectée depuis : mon souvenir de vacances',tags:['nouvelle saison'],personalJournal:{episodes:[],awards:[]}},
 {id:5,title:'Carnet mixte',status:'Completed',startDate:'1999-01-01',genres:['Comedy'],notes:'Ajouté depuis Recommandations.\n\nMon vrai commentaire',personalJournal:{episodes:[{number:1,text:'Une scène'}],awards:[]}},
 {id:6,title:'Sans date',status:'On Hold',poster:'javascript:alert(1)',notes:'Une note sans date\n'+'Paragraphe conservé. '.repeat(500),personalJournal:{episodes:[],awards:[]}},
 ...Array.from({length:26},(_,i)=>({id:10+i,title:'Fixture '+String(i).padStart(2,'0'),status:'Completed',notes:'Simple commentaire '+i,personalJournal:{episodes:[],awards:[]}}))
];
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}
(async()=>{
 // Exercise the actual read-only API projection independently of the browser.
 const rows=freeze(structuredClone(original)),before=JSON.stringify(rows),handlers=new Map();let writes=0;
 const app={get(url,fn){handlers.set('GET '+url,fn);},post(){},patch(){}};
 require('../lib/notebook').mountNotebook(app,{db:{whenReady:async()=>{}},readAnimes:()=>rows,writeAnimes:()=>{writes++;},titles:{},rememberBatch(){}});
 let payload;await handlers.get('GET /api/notebook')({}, {json(value){payload=value;},status(){return this;}});
 assert.equal(writes,0);assert.equal(JSON.stringify(rows),before);assert.equal(payload.items[0].poster,original[0].poster);assert.equal(payload.items[0].status,'Watching');assert.equal(payload.items[0].startDate,'2020-04-01');assert.deepEqual(payload.items[0].genres,['Drama']);assert.equal(payload.items[1].tags[0],'nouvelle saison');assert.equal(payload.items[4].notes,original[4].notes);
 const html=read('public/index.html'),section=html.slice(html.indexOf('<section id="memoryPage"'),html.indexOf('<section id="studioLibraryHero"'));
 const dom=new JSDOM('<!doctype html><html lang="fr"><body><button id="navMemories">Souvenirs</button>'+section+'</body></html>',{url:'http://127.0.0.1:3123',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 let requests=0,openedNotebook=null,openedDetail=null,fail=false,lang='fr';
 w.ALM_I18N={getLanguage:()=>lang};w.ALM_TITLES={title:row=>row.title};w.ALM_DESIGN={t:key=>key};w._almAnimes=original;
 w.eval(read('public/notebook-copy.js'));w.eval(read('public/watch-status.js'));w.ALM_NOTEBOOK={t:(key,vars)=>w.ALM_NOTEBOOK_COPY.t(lang,key,vars),open:id=>{openedNotebook=id;},exports(){}};
 w.ALM_CATALOG={openRecords(items,index,button){openedDetail={items,index,button};}};
 w.showV2Page=()=>d.getElementById('memoryPage').classList.remove('hidden');
 const safeSource=read('public/alm-v2.js');w.eval(safeSource.slice(safeSource.indexOf('function safeUrlV2('),safeSource.indexOf('\nfunction openLibraryWithGenreV2')));
 w.fetch=async(url,options)=>{requests++;assert.equal(url,'/api/notebook');assert(!options?.method,'Overview/filtering must never write');if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(payload)};};
 w.eval(read('public/selects.js'));w.eval(read('public/memories-page.js'));d.dispatchEvent(new w.Event('DOMContentLoaded'));
 await w.ALM_MEMORIES_PAGE.open();
 const el=id=>d.getElementById(id),cards=()=>[...d.querySelectorAll('.memory-card')],ids=()=>cards().map(card=>Number(card.dataset.memoryId));
 function set(id,v){el(id).value=v;el(id).dispatchEvent(new w.Event('input',{bubbles:true}));el(id).dispatchEvent(new w.Event('change',{bubbles:true}));}
 const visibleSelectLabel=id=>el(id).closest('.alm-select').querySelector('.alm-select-trigger').textContent;
 function toggle(checked){el('memoryPageAutomatic').checked=checked;el('memoryPageAutomatic').dispatchEvent(new w.Event('input',{bubbles:true}));}
 const reset=()=>el('memoryPageReset').click();
 assert.equal(cards().length,24,'Only the current page is rendered');assert.equal(el('memoryPagePagination').hidden,false);assert.equal(el('memoryPageNumber').textContent,'1 / 2');
 assert(!ids().includes(2)&&!ids().includes(3),'Automatic-only entries start hidden');
 set('memoryPageNotebook','4');assert.deepEqual(ids(),[4],'Ambiguous season labels stay visible');assert(el('memoryPageEntries').textContent.includes('Saison 1'));assert(el('memoryPageEntries').textContent.includes('mon souvenir de vacances'));reset();
 assert(!d.querySelector('#memoryPageEntries script'));assert(el('memoryPageEntries').textContent.includes('<script>alert(1)</script>'),'Private text is safely rendered');
 assert.equal(d.querySelector('[data-memory-id="1"] img').getAttribute('src'),'/api/cover-cache/1');
 set('memoryPageNotebook','6');assert.equal(cards().length,1);assert.equal(d.querySelectorAll('#memoryPageEntries img').length,0,'Unsafe image URL is rejected');assert(d.querySelector('.memory-card-note').textContent.length<700,'Cards show a bounded excerpt');assert(payload.items[5].notes.length>600,'Full original note stays in the local notebook response');
 reset();set('memoryPageSearch','etoile');assert.deepEqual(ids(),[1],'Accent-insensitive query and hidden automatic note');
 d.querySelector('[data-memory-id="1"] .memory-card-cover').click();assert.equal(openedDetail.items[openedDetail.index].id,1);assert.equal(openedNotebook,null);assert.equal(openedDetail.button.className,'memory-card-cover');
 d.querySelector('[data-memory-open="1"]').click();assert.equal(openedNotebook,1);
 toggle(true);assert.deepEqual(ids(),[1,2]);assert(d.querySelector('[data-memory-id="2"] .memory-card-automatic'));assert.equal(el('memoryPagePagination').hidden,true);
 reset();set('memoryPageStatus','Watching');assert.deepEqual(ids(),[1]);
 reset();set('memoryPageStatus','On-Hold');assert.deepEqual(ids(),[6],'Legacy On Hold matches the standard On-Hold filter');assert(el('memoryPageEntries').textContent.includes('En pause'));assert(!el('memoryPageEntries').textContent.includes('status_On Hold'));assert.equal(payload.items[5].status,'On Hold','Legacy status is normalized only for presentation, never rewritten');
 reset();set('memoryPageGenre','Comedy');assert.deepEqual(ids(),[5,4]);
 reset();set('memoryPageReleaseYear','2020');assert.deepEqual(ids(),[1]);
 reset();set('memoryPageYear','2025');assert.deepEqual(ids(),[1]);assert(el('memoryPageEntries').textContent.includes('Mon choix 2025'));assert(!el('memoryPageEntries').textContent.includes('Choix 2024'),'Only the selected annual choice appears');
 set('memoryPageReleaseYear','2020');assert.equal(visibleSelectLabel('memoryPageReleaseYear'),'2020');assert.equal(visibleSelectLabel('memoryPageYear'),'2025');reset();
 for(const select of d.querySelectorAll('#memoryPage select'))assert.equal(visibleSelectLabel(select.id),select.selectedOptions[0].textContent,'Reset synchronises the visible label: '+select.id);
 assert.equal(visibleSelectLabel('memoryPageReleaseYear'),'Toutes les années');assert.equal(visibleSelectLabel('memoryPageYear'),'Toutes les années');
 reset();set('memoryPageFilter','episodes');assert.deepEqual(ids(),[5,1]);assert(!el('memoryPageEntries').textContent.includes('Mon vrai commentaire'));assert.equal(d.querySelector('.memory-stat strong').textContent,'0','Comment counter reflects displayed content');
 reset();set('memoryPageSearch','Unmatched private search');assert.equal(cards().length,0);assert.equal(el('memoryPageAutomaticHint').textContent,w.ALM_NOTEBOOK_COPY.t(lang,'autoHint'),'No unrelated hidden count for an empty search');
 set('memoryPageSearch','Ajouté depuis');assert.equal(cards().length,0);assert.equal(el('memoryPageAutomaticHint').textContent,w.ALM_NOTEBOOK_COPY.t(lang,'hiddenAutomatic',{count:2}));toggle(true);assert.deepEqual(ids(),[5,3]);
 reset();set('memoryPageFilter','automatic');assert.equal(el('memoryPageAutomatic').checked,true);assert.deepEqual(ids(),[5,2,3]);toggle(false);assert.equal(el('memoryPageFilter').value,'all');assert.equal(visibleSelectLabel('memoryPageFilter'),w.ALM_NOTEBOOK_COPY.t(lang,'allMemoryKinds'),'Unchecking automatic notes also updates the visible memory-type label');
 set('memoryPageNotebook','5');assert(!el('memoryPageEntries').textContent.includes('Ajouté depuis'));assert(el('memoryPageEntries').textContent.includes('Mon vrai commentaire'));toggle(true);assert(el('memoryPageEntries').textContent.includes('Ajouté depuis'));assert.equal(payload.items[4].notes,original[4].notes);
 reset();set('memoryPageSort','newest');assert.equal(ids()[0],1);assert.equal(el('memoryPageSortHint').hidden,false);assert(el('memoryPageSortHint').textContent.includes('pas la date du souvenir'));set('memoryPageSort','oldest');assert.equal(ids()[0],5);
 reset();el('memoryPagePagination').querySelector('[data-memory-page="last"]').click();assert.equal(el('memoryPageNumber').textContent,'2 / 2');set('memoryPageNotebook','1');assert.equal(el('memoryPageNumber').textContent,'1 / 1');assert.equal(el('memoryPagePagination').hidden,true);
 assert.equal(requests,1,'All filtering and sorting reuse the local response');assert.equal(writes,0);assert.equal(JSON.stringify(rows),before,'Nothing in a notebook is edited by its overview');
 // Failed managed memory covers stay attached for the shared reconnect handler.
 const oldFetch=w.fetch;let reconnects=0;const scheduled=[];
 w.fetch=async(url,options)=>{if(url==='/api/storage/status')return {ok:false};if(url==='/api/cover-cache/reconnect'){reconnects++;assert.equal(options.headers['X-ALM-Cover-Reconnect'],'1');return {ok:true};}return oldFetch(url,options);};
 w.ALM_DESIGN_COPY=Object.fromEntries(['fr','en','ja','es','de','pt-BR','zh-CN'].map(code=>[code,{}]));Object.assign(w.ALM_DESIGN,{edition:()=>'',storage:{get:()=>''},applyText(){}});
 Object.defineProperty(d,'visibilityState',{value:'visible',configurable:true});w.setTimeout=(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length;};
 w.eval(read('public/beta45.js'));if(d.readyState==='loading')d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const failed=d.querySelector('[data-memory-id="1"] img');failed.closest('.memory-card').getBoundingClientRect=()=>({width:340,height:260,top:20,bottom:280});
 failed.dispatchEvent(new w.Event('error'));assert.equal(failed.isConnected,true);assert.equal(failed.hidden,true);assert.equal(failed.dataset.coverRetryPending,'1');
 w.dispatchEvent(new w.Event('online'));await new Promise(setImmediate);assert.equal(reconnects,1);assert.equal(scheduled.length,1);scheduled[0].fn();assert.match(failed.getAttribute('src'),/^\/api\/cover-cache\/1\?resume=\d+$/);assert(!failed.getAttribute('src').includes('myanimelist.net'));
 failed.dispatchEvent(new w.Event('load'));assert.equal(failed.hidden,false);assert.equal(failed.dataset.coverRetryPending,undefined);
 for(const code of ['fr','en','es','de','ja','pt-BR','zh-CN']){
  lang=code;w.dispatchEvent(new w.Event('alm:language-changed'));
  assert.equal(el('memoryPageFilter').options[0].textContent,w.ALM_NOTEBOOK_COPY.t(code,'allMemoryKinds'));
  for(const key of ['showAutomatic','autoHint','sortDateHelp','originSequel','loadError','newestRelease'])assert(w.ALM_NOTEBOOK_COPY.copy[code][key],code+':'+key);
 }
 fail=true;await w.ALM_MEMORIES_PAGE.refresh();assert.equal(cards().length,0);assert.equal(el('memoryPagePagination').hidden,true);assert.equal(el('memoryPageRetry').hidden,false);assert.equal(el('memoryPageEntries').getAttribute('aria-busy'),'false');
 fail=false;await w.ALM_MEMORIES_PAGE.refresh();assert.equal(el('memoryPageRetry').hidden,true);assert.equal(cards().length,1,'Selections survive a refresh');
 // A late result cannot replace a newer local notebook response.
 let resolveOlder;w.fetch=()=>new Promise(resolve=>{resolveOlder=resolve;});const older=w.ALM_MEMORIES_PAGE.refresh();
 w.fetch=async()=>({ok:true,json:async()=>({items:[]})});await w.ALM_MEMORIES_PAGE.refresh();resolveOlder({ok:true,json:async()=>payload});await older;assert.equal(cards().length,0,'Stale response ignored');assert.equal(visibleSelectLabel('memoryPageNotebook'),w.ALM_NOTEBOOK_COPY.t(lang,'allNotebooks'),'Refreshing available notebooks synchronises the visible fallback');
 dom.window.close();
 console.log('OK Beta82 memories: read-only local projection; personal/ambiguous text preserved; reversible automatic annotations; 7-language filters; truthful release-date sort; safe covers and text; anime/notebook routing; bounded pagination; retry and stale-response protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
