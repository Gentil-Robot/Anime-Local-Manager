'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');

async function test(){
 const html=source('public/index.html');
 assert(html.includes('id="navMemories"')&&html.includes('id="memoryPage"'));
 assert(html.includes('src="/assets/design/alm-retro-banner.gif"'));
 assert(html.includes('<script src="/memories-page.js"></script>'));
 assert(!source('public/notebook.js').includes("block.innerHTML=button('memories','collectionNotebook')"),'Old memories toolbar shortcut must be absent');
 assert(source('public/alm-v2.js').includes('"memoryPage"'));
 assert(source('public/design.js').includes("['#navMemories','memories']"));
 assert(source('public/navigation.js').includes("state.view==='memoryPage'"));
 assert(source('public/ux-beta82.css').includes('#animeGrid .card.studio-card-has-series .actions'));
 assert(source('public/app.js').includes('article.classList.add("studio-card-has-series")'));
 assert(source('public/community-workspace.js').includes('data-comm-account-refresh'));
 assert(source('public/community.js').includes("const version=++refreshEpoch,next=await api('status')"));
 assert(source('public/index.html').includes('studio-account-shortcut'));
 for(const name of ['public/library-paging.js','public/catalog.js','public/rankings.js','public/lexicon.js','public/community-workspace.js','public/app.js']){
  const text=source(name);
  assert(text.includes('last')||text.includes('Last'),name+' missing last-page control');
 }
 // Source-derived browser logic with a deliberately minimal local-only DOM.
 const events={};const elements={};
 function elem(id){const self={id,innerHTML:'',textContent:'',value:'',dataset:{},hidden:false,disabled:false,listeners:{},attrs:{},
   classList:{contains(){return false;}},addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(k,v){this.attrs[k]=v;},replaceChildren(){this.innerHTML='';},scrollIntoView(){},querySelectorAll(){return[];},querySelector(){return null;}};elements[id]=self;return self;}
 const ids=['navMemories','memoryPage','memoryPageStats','memoryPageSearch','memoryPageFilter','memoryPageYear','memoryPageSummary','memoryPageEntries','memoryPagePagination','memoryPageNumber','memoryPageExport'];for(const id of ids)elem(id);
 const buttons=['first','prev','next','last'].map(key=>({...elem('button-'+key),dataset:{memoryPage:key}}));elements.memoryPagePagination.querySelectorAll=()=>buttons;elements.memoryPagePagination.querySelector=sel=>buttons.find(b=>sel.includes('"'+b.dataset.memoryPage+'"'))||null;
 elements.memoryPageFilter.value='all';
 const document={readyState:'loading',getElementById:id=>elements[id]||null,addEventListener(name,fn){events[name]=fn;},querySelectorAll(){return[];}};
 const rows=Array.from({length:26},(_,i)=>({id:i+1,title:'Memory '+String(i).padStart(2,'0'),notes:i===0?'Souvenir <script>alert(1)</script>':'Note '+i,personalJournal:{episodes:i===1?[{number:3,text:'Fictif & privé'}]:[],awards:i===2?[{year:2025,kind:'anime',text:'Choix perso'}]:[]}}));
 let called='',requests=[];const window={ALM_NOTEBOOK:{t:key=>key,open:id=>{called='open:'+id;},exports:()=>{called='export';}},ALM_TITLES:{title:a=>a.title},ALM_I18N:{getLanguage:()=> 'fr'},ALM_DESIGN:{t:key=>key},showV2Page:(id,nav)=>{called=id+'/'+nav;},addEventListener(name,fn){events[name]=fn;}};
 const context={window,document,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({items:rows})};}};
 vm.runInNewContext(source('public/memories-page.js'),context,{filename:'memories-page.js'});
 events.DOMContentLoaded();window.ALM_MEMORIES_PAGE.open();
 await new Promise(setImmediate);
 assert.equal(called,'memoryPage/navMemories');
 assert.deepEqual(requests,['/api/notebook'],'All journals must remain a local-only read');
 assert(elements.memoryPageEntries.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert(!elements.memoryPageEntries.innerHTML.includes('<script>'),'Notebook text must be HTML-escaped');
 assert.equal(elements.memoryPageNumber.textContent,'1 / 2');
 assert.equal(elements.memoryPagePagination.hidden,false);
 elements.memoryPagePagination.listeners.click({target:{closest:()=>buttons[2]}});
 assert.equal(elements.memoryPageNumber.textContent,'2 / 2');
 assert(elements.memoryPageEntries.innerHTML.includes('Memory 25'));
 elements.memoryPageSearch.value='Memory 01';elements.memoryPageSearch.listeners.input();
 assert.equal(elements.memoryPageNumber.textContent,'1 / 1');
 assert(elements.memoryPageEntries.innerHTML.includes('Fictif &amp; privé'));
 elements.memoryPagePagination.listeners.click({target:{closest:()=>buttons[3]}});
 assert.equal(elements.memoryPageNumber.textContent,'1 / 1','Last-page button must respect active filters');
 elements.memoryPageEntries.listeners.click({target:{closest:()=>({dataset:{memoryOpen:'2'}})}});
 assert.equal(called,'open:2');
 elements.memoryPageExport.listeners.click();assert.equal(called,'export');
 for(const file of ['community.js','community-workspace.js','community-workspace-copy.js'])assert(source('public/'+file)===source('community/site/'+file),'Desktop/community website drift: '+file);
 const translations=source('public/community-workspace-copy.js').split('\n').find(line=>line.startsWith('retry|'));assert.equal(translations.split('|').length,8,'Retry label must have 7 translations');
 console.log('OK Beta82 UX6: private standalone memories page with filtering and pagination, XSS escaping, central paging, GIF, concise card layout, async account loading and all 7 retry translations.');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
