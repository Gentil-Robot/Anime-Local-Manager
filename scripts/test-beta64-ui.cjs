'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
(async()=>{
 const dom=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  let language='fr';const locales=Object.fromEntries(['fr','en','es','de','ja','pt-BR','zh-CN'].map(code=>[code,JSON.parse(read('public/locales/'+code+'.json'))]));
  w.ALM_I18N={getLanguage:()=>language,t:source=>locales[language].strings[source]||source};
  w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const evaluate=file=>w.eval(read('public/'+file));
  for(const file of ['design-copy.js','design-core.js','watch-status.js','season-reference.js','series-state.js','community-content.js','community-model.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-workspace-copy.js'])evaluate(file);
  const M=w.ALM_COMMUNITY_MODEL,S=w.ALM_WATCH_STATUS;
  const profile=M.profile({id:A,display_name:'Me',discriminator:1,visibility:'friends',share_library:true});
  const own={profile,items:M.ownItems([{malId:10,title:'My favorite',score:9,status:'On-Hold',year:2026}]),dna:[],activity:[]};
  const friend={profile:M.profile({id:B,display_name:'Friend',discriminator:2}),items:M.items([
   {malId:20,title:'Series',status:'Completed',year:2026,type:'TV',genres:['Fantasy']},
   {malId:21,title:'Series Season 2',status:'Watching',year:2026,type:'TV',genres:['Fantasy']},
   {malId:22,title:'Older',status:'Plan to Watch',year:2025,type:'Movie'},
   {malId:23,title:'Oldest',status:'On-Hold',year:1996,type:'OVA'}
  ]),dna:[],activity:[]};
  delete friend.items[2].year;friend.items[2].start_date='2025-01-01';
  for(const item of friend.items)item.image_url='https://cdn.myanimelist.net/images/anime/fixture.jpg';
  const sync={publishedAt:'2026-10-17T12:00:00Z',dirty:false,error:null};
  w.showV2Page=()=>{};w.ALM_COMMUNITY_ERROR=error=>error.message;w.ALM_SCROLL_PROGRESS={mount(){}};w.ALM_CLIPBOARD={copy:async()=>true};
  w.ALM_COMMUNITY_API=async(endpoint)=>{
   if(endpoint==='status')return {configured:true,connected:true,user:{id:A,email:'fixture@invalid.test'},identity:profile,own,sync,notifications:{count:0,requests:[],recommendations:[]}};
   if(endpoint==='friends')return {userId:A,cards:[friend.profile],relationships:[{id:'accepted',requester:A,recipient:B,status:'accepted'}]};
   if(endpoint==='profiles/'+B)return friend;
   if(endpoint==='recommendations')return {items:[],userId:A};
   throw Error('Unexpected endpoint '+endpoint);
  };
  w.fetch=async()=>({ok:false});
  for(const file of ['community-requests.js','community-charter.js','community-workspace.js','community.js','community-ui-extra.js','selects.js'])evaluate(file);
  for(const tab of ['summary','library','friends','inbox','friend-library']){
   await w.ALM_COMMUNITY.open('',tab);
   const bar=w.document.querySelector('.comm-profile-toolbar');assert(bar,tab);
   assert.deepEqual([...bar.children].map(b=>b.dataset.commAction||b.dataset.commPlus),['account','edit','copy','preview','add-friend','notifications']);
   assert(!w.document.querySelector('#communityPage [data-comm-plus=diagnostic]'));
   assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'syncCurrent');
  }
  sync.dirty=true;await w.ALM_COMMUNITY.open();assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'syncLocal');
  sync.error='ALM_NETWORK';await w.ALM_COMMUNITY.open();assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'syncFailed');sync.error=null;sync.dirty=false;
  profile.visibility='private';await w.ALM_COMMUNITY.open();assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'sharingPrivate');profile.visibility='friends';
  await w.ALM_COMMUNITY.open('','friend-library');let choice=w.document.getElementById('commFriendChoice');choice.value='Friend#0002';choice.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const years=w.document.querySelector('[data-comm-filter=year]');assert.deepEqual([...years.options].slice(1).map(o=>o.textContent),['2026 (2)','2025 (1)','1996 (1)']);
  assert.deepEqual([...w.document.querySelectorAll('.comm-library-stats strong')].map(n=>n.textContent),['4','1','1','1','1']);
  years.value='2025';years.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.document.querySelectorAll('#commLibraryResults [data-comm-anime]').length,1);w.document.getElementById('commResetFilters').click();
  assert.equal(w.document.querySelectorAll('.comm-series-group').length,1,'Shared series can be grouped without fetching private records');
  w.document.querySelector('[data-comm-stat=Watching]').click();assert.equal(w.document.querySelector('[data-comm-filter=status]').value,'Watching');assert.equal(w.document.querySelectorAll('#commLibraryResults [data-comm-anime]').length,1);
  w.document.getElementById('commResetFilters').click();
  const selected=w.document.getElementById('status');selected.value='On-Hold';
  for(const code of ['fr','en','es','de','ja','pt-BR','zh-CN']){
   language=code;w.document.documentElement.lang=code;w.dispatchEvent(new w.Event('alm:language-changed'));await tick();
   assert.equal(selected.value,'On-Hold');assert.deepEqual([...selected.options].map(o=>o.value),[...S.values]);
   assert.deepEqual([...selected.options].map(o=>o.textContent),[...S.copy[code]]);
   selected.closest('.alm-select').querySelector('button').click();assert.deepEqual([...w.document.querySelectorAll('.alm-select-menu [role=option]')].map(o=>o.textContent),[...S.copy[code]]);w.ALM_SELECTS.close();
   assert.equal(w.document.querySelector('[data-comm-filter=status] option[value="On-Hold"]').textContent,S.label('On-Hold',code));
   assert.equal(w.document.querySelector('[data-comm-action=add-status][data-status="On-Hold"]').textContent,S.label('On-Hold',code));
   for(const key of ['favoritesRule','groupSeries','syncFailed','librarySearch'])assert.notEqual(w.ALM_COMMUNITY_T(key),key);
  }
  await w.ALM_COMMUNITY.open('','favorites');assert(w.document.querySelector('[data-comm-action=favorite]'),'Own favorites remain manually editable');
  assert.equal(S.normalize('On Hold'),'On-Hold');
  console.log('OK Beta64 UI: five translated statuses with stable saved values and custom menus in seven languages, shared toolbar on all entry pages, sync states, newest years with counts, scoped statistics, filtering, series grouping and manual favorite controls.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
