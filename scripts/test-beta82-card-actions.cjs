'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const rows=Array.from({length:62},(_,index)=>({id:index+1,malId:index+20,title:'Anime '+String(index+1).padStart(3,'0'),status:'Completed',type:'TV',notes:'Private note '+index,genres:[],tags:[],episodesSeen:'12',episodesTotal:'12',malUrl:'https://myanimelist.net/anime/'+(index+20)}));
const original=JSON.stringify(rows);
(async()=>{
 const dom=new JSDOM('<html lang="fr"><body><input id="search"><select id="statusFilter"><option value=""></option></select><select id="sort"><option value="title">Title</option></select><input id="seriesView" type="checkbox"><div id="stats"></div><div id="animeGrid"></div></body></html>',{url:'http://127.0.0.1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.$=id=>w.document.getElementById(id);let language='fr',called=null;
  for(const name of ['design-copy.js','community-copy.js','community-workspace-copy.js','notebook-copy.js'])w.eval(read(name));
  w.ALM_DESIGN={language:()=>language,t:(key,args={})=>String(w.ALM_DESIGN_COPY[language][key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(args[name]??''))};
  w.ALM_NOTEBOOK={t:key=>w.ALM_NOTEBOOK_COPY.t(language,key)};
  w.ALM_COMMUNITY_WORKSPACE={recommendAnime:async(id,record)=>{called={id,record};}};
  w.ALM_COMMUNITY={snapshot:()=>null,toast:error=>{throw error;}};
  w.ALM_COMMUNITY_ERROR=error=>error;
  w.ALM_SERIES=require('../public/series-state');
  w.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  w.formatDate=()=>'';w.genreLabelFr=value=>value;w.statusLabelFr=value=>value;w.safeText=()=>{};
  w.activePersonalScoreFilter=0;w.currentLibraryViewKey='all';w.LIBRARY_FILTER_FIELDS=['search','statusFilter','sort'];w.animeGrid=w.$('animeGrid');w.stats=w.$('stats');w.animes=rows;w._almAnimes=rows;
  w.eval(read('library-paging.js'));
  const app=read('app.js');w.eval(app.slice(app.indexOf('function filteredAnimes()'),app.indexOf('function formatDate(value)')));
  const actions=()=>Array.from(w.animeGrid.querySelector('.card .actions').children);
  const names=()=>actions().map(button=>button.dataset.action||button.dataset.notebookAction||button.textContent);
  for(const code of ['fr','en','es','de','ja','pt-BR','zh-CN']){
   language=code;w.document.documentElement.lang=code;w.render();
   assert.deepEqual(names(),['edit','open-notebook','refresh','image','MAL','recommend','delete']);
   const recommend=actions().find(button=>button.dataset.action==='recommend');assert.equal(recommend.hidden,false,'Action remains available before account data loads');
   assert.equal(recommend.textContent,w.ALM_COMMUNITY_T('recommendFriend'));recommend.click();
   assert.equal(called.id,20);assert.equal(called.record,rows[0],'Pass the original season record to the guarded shared recommendation flow');
  }
  w.$('libraryPagesTop').querySelector('[data-page-next]').click();
  assert.equal(w.animeGrid.querySelectorAll('[data-action="recommend"]:not([hidden])').length,2,'Rebuilt pages retain recommendation actions');
  w.$('search').value='Anime 062';w.render();assert.equal(actions().find(button=>button.dataset.action==='recommend').hidden,false);
  actions().find(button=>button.dataset.action==='recommend').click();assert.equal(called.id,81);assert.equal(called.record,rows[61]);
  assert.equal(JSON.stringify(rows),original,'Rendering and filtering never alter the local records');
  // These low-impact edits are checked together with the affected action flow.
  const html=read('index.html');assert(!html.includes('id="seasonNewsBtn"'));assert(html.includes('id="navSeasonNews"'),'The dedicated seasons page remains available');
  const full=new JSDOM(html);try{const figure=full.window.document.querySelector('.xml-import-showcase');assert(figure.querySelector('img[src$="alm-retro-banner.gif"]'));assert(!figure.querySelector('figcaption'));}finally{full.window.close();}
  console.log('OK Beta82 card actions: stable recommendation before/after paging and filters, exact record routing, seven languages, action order, unchanged notes, retained seasons page and GIF without caption.');
 }finally{await new Promise(resolve=>setTimeout(resolve,20));w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
