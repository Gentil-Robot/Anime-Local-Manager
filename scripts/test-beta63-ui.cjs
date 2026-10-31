'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
(async()=>{
 const dom=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const evaluate=file=>w.eval(read('public/'+file));
  for(const file of ['design-copy.js','design-core.js','watch-status.js','season-reference.js','series-state.js','retouches.js','community-content.js','community-model.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-site-copy.js','community-workspace-copy.js'])evaluate(file);
  const M=w.ALM_COMMUNITY_MODEL,animes=[],writes=[],reads=[],requests=[];
  const own={profile:M.profile({id:A,display_name:'Me',discriminator:1}),items:[],dna:[],activity:[]};
  const foreign={profile:M.profile({id:B,display_name:'Friend',discriminator:2,visibility:'friends',share_library:true}),items:M.items([
   {malId:20,title:'Fantasy fixture',status:'Completed',score:9,episodesSeen:12,episodesTotal:12,type:'TV',year:2024,genres:['Fantasy'],image_url:'https://cdn.myanimelist.net/images/anime/fixture.jpg'},
   {malId:21,title:'Drama <img src=x onerror=alert(1)>',status:'Watching',score:8,episodesSeen:7,episodesTotal:12,type:'TV',genres:['Drama']}
  ]),dna:[],activity:[]};
  const sessions=[{id:A,current:true,device_name:'MY-PC',platform:'win32',created_at:'2026-10-17T12:00:00Z'},{id:'00000000-0000-0000-0000-000000000004',current:false,device_name:'VM-ALM',platform:'win32',created_at:'2026-10-17T11:00:00Z'}],revoked=[];
  const inbox=[{id:'received',anime:{mal_id:80,title:'Recommended fixture'},message:'Try this anime',read_at:null}];
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:true});
  w.ALM_TITLES={title:item=>item.title||''};w.safeUrlV2=value=>/^https:\/\/cdn\.myanimelist\.net\//.test(value||'')?value:'#';
  w.ALM_COLLECTION={same:(a,b)=>!!a&&!!b&&Number(a.malId)===Number(b.malId),find:item=>animes.find(a=>Number(a.malId)===Number(item.malId)),label:item=>item.status};
  w.ALM_ADD_LABEL=status=>'Ajouter '+status;w.ALM_BETA38={preparePayload:async value=>value};w.ALM_CATALOG_ENABLED=true;
  w.ALM_SCROLL_PROGRESS={mount(){}};w.showV2Page=()=>{};w.notifyApp=message=>{throw Error('Unexpected toast '+message);};
  w.load=async()=>{own.items=M.items(animes);w._almAnimes=animes;w.dispatchEvent(new w.Event('alm:collection-changed'));};
  w.ALM_COMMUNITY_ERROR=error=>error.message;
  w.ALM_COMMUNITY_API=async(endpoint,method='GET',body)=>{
   if(endpoint==='status')return {configured:true,connected:true,user:{id:A},own,identity:own.profile,notifications:{count:1}};
   if(endpoint==='friends')return {userId:A,cards:[foreign.profile],relationships:[{id:'accepted',requester:A,recipient:B,status:'accepted'}]};
   if(endpoint==='profiles/'+B)return foreign;
   if(endpoint==='sessions')return sessions;
   if(endpoint.startsWith('sessions/')&&endpoint.endsWith('/revoke')){const id=endpoint.split('/')[1];revoked.push(id);sessions.splice(sessions.findIndex(s=>s.id===id),1);return {ok:true};}
   if(endpoint==='recommendations')return {items:inbox,userId:A};
   if(endpoint.endsWith('/read')){reads.push(endpoint);return {ok:true};}
   throw Error('Unexpected community endpoint '+endpoint);
  };
  let rejectEnrichment=false;
  w.fetch=async(url,options={})=>{
   requests.push({url,method:options.method||'GET'});
   if(/^\/api\/discover\/\d+\/record\?(?:enrich=1|local=1)$/.test(url)){
    if(rejectEnrichment)throw Error('Offline fixture');
    const malId=Number(url.match(/\d+/)[0]);return {ok:true,json:async()=>({malId,title:'Catalogue fixture',poster:'https://cdn.myanimelist.net/images/anime/'+malId+'.jpg',episodesTotal:12,startDate:'2024-01-05',publicScore:8.7,rank:15,genres:['Fantasy'],synopsis:'The complete local catalogue synopsis.'})};
   }
   if(url.includes('/synopsis?'))return {ok:true,json:async()=>({text:'Synopsis traduit de la fiche.',language:'fr',translated:true})};
   if(url==='/api/animes'&&options.method==='POST'){const value=JSON.parse(options.body);writes.push(value);animes.push({...value,id:animes.length+1});return {ok:true,json:async()=>({ok:true})};}
   throw Error('Unexpected fetch '+url);
  };
  for(const file of ['community-requests.js','community-charter.js','discovery.js','catalog.js','community-workspace.js','community.js'])evaluate(file);
  await w.ALM_COMMUNITY.open('','friend-library');
  const choice=w.document.getElementById('commFriendChoice');choice.value='Friend#0002';choice.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(w.document.querySelectorAll('.comm-ranking-card').length,2);
  assert(!w.document.querySelector('img[src=x]'),'Titles remain escaped');
  let opener=w.document.querySelector('[data-comm-action=anime-detail][data-mal-id="20"]');opener.focus();opener.click();await tick();
  const dialog=w.document.getElementById('animePeekDialog');assert(dialog.open);assert.equal(w.document.getElementById('animePeekTitle').textContent,'Fantasy fixture');
  assert(w.document.getElementById('animePeekDetail').textContent.includes('Synopsis traduit'));
  assert.equal(w.document.getElementById('peekAddStatus').options.length,5);
  assert.equal(w.document.getElementById('peekAddStatus').value,'Plan to Watch');assert.equal(writes.length,0);assert.equal(reads.length,0);
  w.document.getElementById('animePeekPrevious').click();await tick();assert(w.document.getElementById('animePeekTitle').textContent.startsWith('Drama <img'));
  w.document.getElementById('animePeekClose').click();assert(!dialog.open);assert.equal(w.document.activeElement,opener);
  const filter=w.document.querySelector('[data-comm-filter=genre]');filter.value='Fantasy';filter.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.document.querySelectorAll('.comm-ranking-card').length,1);
  w.document.querySelector('.comm-ranking-card .comm-card-body small').click();await tick();assert(dialog.open);assert.equal(w.document.getElementById('animePeekPosition').textContent,'1 / 1');
  w.document.getElementById('peekAdd').click();await tick();
  assert.equal(writes.length,1);assert.equal(writes[0].malId,20);assert.equal(writes[0].status,'Plan to Watch');assert.equal(writes[0].episodesSeen,'0');assert(!writes[0].score);assert.equal(foreign.items[0].score,9);assert.equal(foreign.items[0].episodes_seen,12);
  w.document.getElementById('animePeekClose').click();assert.equal(filter.value,'Fantasy');assert.equal(w.document.querySelectorAll('.comm-ranking-card').length,1);
  await w.ALM_COMMUNITY.open('','inbox');await tick();opener=w.document.querySelector('.comm-recommendation [data-comm-action=anime-detail]');assert(opener.querySelector('img'),'Legacy recommendation cover');opener.click();await tick();
  assert(dialog.open);assert.equal(w.document.getElementById('animePeekTitle').textContent,'Recommended fixture');assert(w.document.getElementById('animePeekDetail').textContent.includes('8,7'));
  assert.equal(writes.length,1);assert.equal(reads.length,0,'Reading the detail does not archive a recommendation');assert.equal(inbox[0].read_at,null);
  w.document.getElementById('animePeekClose').click();rejectEnrichment=true;opener.click();await tick();assert(dialog.open);assert.equal(w.document.getElementById('animePeekTitle').textContent,'Recommended fixture');w.document.getElementById('animePeekClose').click();
  const before=requests.length;w.ALM_COMMUNITY_WEB=true;opener.click();await tick();
  const webDialog=w.document.getElementById('commDialog');assert(webDialog.open);assert.equal(webDialog.querySelector('h2').textContent,'Recommended fixture');assert.equal(webDialog.querySelector('a').href,'https://myanimelist.net/anime/80');assert.equal(requests.length,before,'Website popup only uses the authorised shared record');
  webDialog.querySelector('[data-close]').click();assert.equal(w.document.activeElement,opener);assert(!webDialog.hasAttribute('aria-label'));
  w.ALM_COMMUNITY_WEB=false;evaluate('community-ui-extra.js');await w.ALM_COMMUNITY.setTab('sessions');assert(w.document.getElementById('commPanel').textContent.includes('MY-PC'));assert(w.document.getElementById('commPanel').textContent.includes('VM-ALM'));w.document.querySelector('[data-session-id="00000000-0000-0000-0000-000000000004"]').click();await tick();assert.equal(revoked.length,0);w.document.querySelector('#commDialog [data-confirm]').click();await tick();assert.equal(revoked.length,1);assert(!w.document.getElementById('commPanel').textContent.includes('VM-ALM'));
  for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN']){w.document.documentElement.lang=lang;const value=w.ALM_COMMUNITY_T('openAnimeDetails');assert(value&&value!=='openAnimeDetails');}
  console.log('OK Beta63 UI: ranking-style friends, actual shared detail dialog, filtered navigation and focus return, five statuses, enriched synopsis, escaped titles, explicit add without friend progress/rating, unread recommendation preserved, offline fallback and authorised website detail in seven languages.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
