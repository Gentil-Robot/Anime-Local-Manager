'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),tick=()=>new Promise(r=>setTimeout(r,25));
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003',E='00000000-0000-0000-0000-000000000004';
(async()=>{
 const dom=new JSDOM('<html lang="fr"><body><button id="commProfileEntry"><strong id="commProfileName"></strong><small id="commProfileState"></small></button><section id="communityPage"></section><dialog id="settingsDialog"><section id="commAccountSettings"></section></dialog></body></html>',{url:'http://127.0.0.1:3123',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 try{
  let language='fr',selected='',copies=[],sync={auto:true,publishedAt:'2026-10-17',dirty:true,error:null},deferred=null;
  w.ALM_I18N={getLanguage:()=>language};w.showV2Page=()=>{};w.ALM_SETTINGS={select:key=>{selected=key;}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.fetch=async()=>({ok:false});w.ALM_CLIPBOARD={copy:async value=>{copies.push(value);return true;}};w.ALM_SCROLL_PROGRESS={mount(){}};w.ALM_COMMUNITY_ERROR=e=>e.message;
  const evaluate=file=>w.eval(read('public/'+file));
  for(const f of ['design-copy.js','design-core.js','watch-status.js','community-content.js','community-model.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-workspace-copy.js'])evaluate(f);
  const M=w.ALM_COMMUNITY_MODEL,profile=M.profile({id:A,display_name:'Me',handle:'u_me',discriminator:2,visibility:'friends',share_library:true}),own={profile,items:[],dna:[],activity:[]};
  const people=[{id:B,display_name:'GentilRobot',discriminator:4},{id:C,display_name:'Éclair',discriminator:1},{id:E,display_name:'Zorro',discriminator:1}];
  const relationships=[{id:'r1',requester:A,recipient:B,status:'accepted',created_at:'2026-09-01',updated_at:'2026-10-10'},{id:'r2',requester:A,recipient:C,status:'accepted',created_at:'2026-09-02',updated_at:'2026-10-09'},{id:'r3',requester:E,recipient:A,status:'pending',created_at:'2026-10-11'}];
  const status=()=>({configured:true,connected:true,user:{id:A,email:'fixture@invalid.test'},identity:profile,own,sync:{...sync},notifications:{count:1,requests:[],recommendations:[]}});
  const visits=[];
  w.ALM_COMMUNITY_API=async(endpoint)=>{
   if(endpoint==='status'){if(deferred){const p=deferred;deferred=null;return p;}return status();}
   if(endpoint==='friends')return {userId:A,cards:people,relationships};
   if(endpoint==='recommendations')return {userId:A,items:[]};
   if(endpoint.startsWith('profiles/')){const id=endpoint.slice(9);visits.push(id);return {profile:M.profile(people.find(p=>p.id===id)),items:[],dna:[],activity:[]};}
   if(endpoint==='publish'){sync.dirty=false;return {ok:true};}
   throw Error('Unexpected '+endpoint);
  };
  for(const f of ['community-requests.js','community-charter.js','community-workspace.js','community.js','community-ui-extra.js'])evaluate(f);
  await w.ALM_COMMUNITY.open('','friends');
  const order=()=>[...w.document.querySelectorAll('#commFriendRows .comm-friend')].map(n=>n.dataset.friendId);
  assert.deepEqual(order(),[E,B,C]);
  for(const [sort,expected]of [['az',[C,B,E]],['za',[E,B,C]],['oldest',[C,B,E]],['recent',[E,B,C]]]){const field=w.document.getElementById('commFriendSort');field.value=sort;field.dispatchEvent(new w.Event('change'));assert.deepEqual(order(),expected);}
  let search=w.document.getElementById('commFriendSearch');search.focus();search.value='eclair';search.dispatchEvent(new w.Event('input'));assert.deepEqual(order(),[C]);assert.equal(w.document.activeElement,search);
  search.value='GentilRobot#0004';search.dispatchEvent(new w.Event('input'));assert.deepEqual(order(),[B]);
  w.document.querySelector('.comm-friend-profile strong').click();await tick();assert.equal(visits.at(-1),B);assert.equal(w.document.querySelector('.comm-banner h1').textContent,'GentilRobot');
  await w.ALM_COMMUNITY.open('','friends');search=w.document.getElementById('commFriendSearch');search.value='absent';search.dispatchEvent(new w.Event('input'));assert.equal(order().length,0);assert(w.document.getElementById('commFriendRows').textContent.includes('Aucun ami'));
  await w.ALM_COMMUNITY.setTab('notifications');assert.equal(w.document.querySelectorAll('.comm-friend').length,1,'Search never hides pending requests in notifications');
  for(const tab of ['summary','library','friends','inbox','friend-library']){
   await w.ALM_COMMUNITY.open('',tab);selected='';w.document.querySelector('[data-comm-account-shortcut] strong').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));await tick();assert.equal(selected,'account',tab);assert(w.document.getElementById('settingsDialog').open);w.document.getElementById('settingsDialog').close();
  }
  for(const key of ['Enter',' ']){selected='';w.document.querySelector('[data-comm-account-shortcut]').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true}));await tick();assert.equal(selected,'account');w.document.getElementById('settingsDialog').close();}
  assert.equal(copies.length,0,'The status shortcut opens settings instead of copying');
  w.document.querySelector('#commAccountSettings [data-comm-copy-id]').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));await tick();assert.equal(copies.at(-1),'Me#0002');
  await w.ALM_COMMUNITY.open('','friends');search=w.document.getElementById('commFriendSearch');search.value='Gentil';search.dispatchEvent(new w.Event('input'));search.focus();
  sync.dirty=false;await w.ALM_COMMUNITY.refresh();assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'syncCurrent');assert.equal(w.document.getElementById('commFriendSearch'),search);assert.equal(search.value,'Gentil');assert.equal(w.document.activeElement,search);
  const old=status();old.sync.dirty=true;let release;deferred=new Promise(r=>release=r);const slow=w.ALM_COMMUNITY.refresh();await tick();await w.ALM_COMMUNITY.refresh();release(old);await slow;
  assert.equal(w.ALM_COMMUNITY.snapshot().sync.dirty,false,'A delayed old response must not overwrite a successful new publication');assert.equal(w.document.querySelector('.comm-sharing-status').dataset.sharingState,'syncCurrent');
  for(const code of ['fr','en','es','de','ja','pt-BR','zh-CN']){language=code;w.dispatchEvent(new w.Event('alm:language-changed'));for(const key of ['searchFriends','sortFriends','friendAZ','friendZA','friendNewest','friendOldest','noFriendsFound','accountShortcutHint'])assert.notEqual(w.ALM_COMMUNITY_T(key),key,code+key);}
 }finally{w.close();}
 // Run the actual scroll controller on the restructured anime form.
 const form=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123',runScripts:'outside-only',pretendToBeVisual:true}),v=form.window;
 try{
  await new Promise(r=>v.document.addEventListener('DOMContentLoaded',r,{once:true}));
  v.requestAnimationFrame=cb=>v.setTimeout(()=>cb(0),0);v.cancelAnimationFrame=id=>v.clearTimeout(id);
  v.matchMedia=()=>({matches:true});v.ResizeObserver=class{observe(){}unobserve(){}};
  v.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[{width:700,height:600}];};
  const dialog=v.document.getElementById('formDialog'),area=dialog.querySelector('.anime-form-body');dialog.open=true;
  Object.defineProperty(area,'scrollHeight',{value:2000});Object.defineProperty(area,'clientHeight',{value:500});area.scrollTo=({top})=>{area.scrollTop=Math.min(top,1500);};
  v.eval(read('public/scroll-progress.js'));v.ALM_SCROLL_PROGRESS.mount();await tick();
  assert(!area.contains(dialog.querySelector('menu')));assert.equal(dialog.querySelector('menu').parentElement.id,'animeForm');assert(!area.contains(v.document.getElementById('formScrollControls')));
  v.document.getElementById('formScrollBottom').click();await tick();assert.equal(area.scrollTop,1500);assert.equal(dialog.scrollTop,0);assert.equal(v.document.getElementById('formScrollBottom').disabled,true);
  v.document.getElementById('formScrollTop').click();await tick();assert.equal(area.scrollTop,0);assert.equal(v.document.getElementById('formScrollTop').disabled,true);
 }finally{v.close();}
 console.log('OK Beta65 UI: friend profiles/search/four sorts, pending requests, seven languages, account shortcuts on all pages, copying preserved, live status without lost filters, stale-response rejection and independent form scrolling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
