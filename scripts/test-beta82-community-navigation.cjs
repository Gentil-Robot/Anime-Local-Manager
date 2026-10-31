'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
const deferred=()=>{let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};};
const owner='00000000-0000-4000-8000-000000000001',friend='00000000-0000-4000-8000-000000000002';

async function verifyStartupAndCollectionRefresh(){
 const dom=new JSDOM('<html lang="fr"><body><button id="commProfileEntry"><strong id="commProfileName"></strong><small id="commProfileState"></small></button><section id="communityPage" class="hidden"></section></body></html>',{url:'http://127.0.0.1',runScripts:'outside-only'}),w=dom.window;
 const gates=Array.from({length:8},deferred),calls=[];let statusCalls=0;
 const waitFor=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await tick();}assert.fail('Timed out waiting for coalesced account refresh');};
 const state=(id,count)=>({configured:true,connected:true,user:{id},own:{profile:{display_name:id===owner?'GentilRobot':'NewOwner',discriminator:4,visibility:'private'},items:Array.from({length:count},(_,i)=>({mal_id:i+1})),age:{}},sync:{}});
 try{
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.ALM_DESIGN={escape:String};w.ALM_COMMUNITY_T=key=>key;w.ALM_COMMUNITY_SECURITY={tag:profile=>profile.display_name+'#0004'};w.ALM_COMMUNITY_MODEL={avatarImage:()=>''};w.ALM_COMMUNITY_ERROR=error=>error.message;w.ALM_COMMUNITY_WORKSPACE={reset(){}};
  w.ALM_COMMUNITY_API=async endpoint=>{calls.push(endpoint);if(endpoint==='status')return gates[statusCalls++].promise;if(endpoint==='friends')return {userId:owner,relationships:[],cards:[]};throw Error(endpoint);};
  w.eval(source('community-requests.js'));w.eval(source('community.js'));
  assert.equal(statusCalls,1,'Startup itself starts the status read');
  for(let i=0;i<8;i++)w.dispatchEvent(new w.Event('alm:library-rendered'));
  await tick();assert.equal(statusCalls,1,'Filtering/rendering never invalidates a pending account read');
  for(let i=0;i<8;i++)w.dispatchEvent(new w.Event('alm:collection-changed'));
  await tick();assert.equal(statusCalls,1,'Initial collection changes wait for the pending startup status');
  gates[0].resolve(state(owner,1));await waitFor(()=>statusCalls===2);assert.equal(w.document.getElementById('commProfileName').textContent,'GentilRobot','Startup identity reaches the footer before its queued collection refresh');
  gates[1].resolve(state(owner,2));await waitFor(()=>w.ALM_COMMUNITY.snapshot()?.own.items.length===2);await tick();assert.equal(statusCalls,2,'Natural startup and initial collection load need one coalesced follow-up, without manual refresh');
  for(let i=0;i<8;i++)w.dispatchEvent(new w.Event('alm:collection-changed'));
  await waitFor(()=>statusCalls===3);assert.equal(w.ALM_COMMUNITY.snapshot().own.items.length,2,'Current account stays usable during a collection refresh');
  for(let i=0;i<8;i++){w.dispatchEvent(new w.Event('alm:library-rendered'));w.dispatchEvent(new w.Event('alm:collection-changed'));}
  await tick();assert.equal(statusCalls,3,'Changes during a pending read coalesce without canceling it');
  gates[2].resolve(state(owner,3));await waitFor(()=>statusCalls===4);gates[3].resolve(state(owner,4));await waitFor(()=>w.ALM_COMMUNITY.snapshot()?.own.items.length===4);await tick();assert.equal(statusCalls,4,'One follow-up incorporates changes that occurred during the read');assert.equal(calls.filter(endpoint=>endpoint==='friends').length,4);
  // A queued collection refresh must never resurrect its previous account.
  w.dispatchEvent(new w.Event('alm:collection-changed'));await waitFor(()=>statusCalls===5);w.dispatchEvent(new w.Event('alm:community-session'));await waitFor(()=>statusCalls===6);gates[5].resolve(state(friend,5));await waitFor(()=>w.ALM_COMMUNITY.snapshot()?.user?.id===friend);gates[4].resolve(state(owner,99));await tick();assert.equal(w.ALM_COMMUNITY.snapshot().user.id,friend);assert.equal(w.ALM_COMMUNITY.snapshot().own.items.length,5);assert.equal(statusCalls,6,'Old collection work cannot create a new read after a session change');
  w.dispatchEvent(new w.Event('alm:collection-changed'));await waitFor(()=>statusCalls===7);gates[6].reject(Error('STATUS_UNAVAILABLE'));await tick();await tick();assert.equal(statusCalls,7,'A failed collection read does not enter a retry loop');assert.equal(w.ALM_COMMUNITY.snapshot().user.id,friend);
 }finally{for(const gate of gates)gate.resolve(state(friend,4));await tick();w.close();}
}

(async()=>{
 await verifyStartupAndCollectionRefresh();
 const dom=new JSDOM('<html lang="fr"><body><aside id="studioSidebar"><nav class="side-nav"><button id="navSettings"></button></nav><button id="commProfileEntry"><img><span><strong id="commProfileName"></strong><small id="commProfileState"></small></span></button></aside><div id="animeGrid"><button data-action="recommend" data-mal-id="20" hidden></button><button data-action="recommend" data-mal-id="999" hidden></button></div><section id="communityPage"></section></body></html>',{url:'http://127.0.0.1',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],pendingFriends=deferred();let connected=true,holdFriends=true,sendGate=null,statusGate=null,loginCalls=0;
 try{
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const name of ['design-copy.js','design-core.js','watch-status.js','season-reference.js','series-state.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-workspace-copy.js'])w.eval(source(name));
  w.ALM_COMMUNITY_CONTENT={allowed:item=>[20,21].includes(Number(item?.mal_id||item?.malId||item)),adult:()=>false};w.eval(source('community-model.js'));
  const M=w.ALM_COMMUNITY_MODEL,own={profile:M.profile({id:owner,display_name:'GentilRobot',discriminator:4,visibility:'private'}),items:[],summary:M.summary([]),dna:[],activity:[],age:{recorded:false,excludeAdult:true}};
  const network={userId:owner,cards:[{id:friend,display_name:'Friend',discriminator:5}],relationships:[{requester:owner,recipient:friend,status:'accepted'}]};
  const shared={profile:M.profile({id:friend,display_name:'Friend',discriminator:5,visibility:'friends',featured:[]}),items:M.items([{malId:20,title:'Shared anime',status:'Completed',type:'TV'}]),comparison:{common:1,compatibility:80,genres:[],discoveries:[]},summary:M.summary([]),dna:[],activity:[]};
  w.showV2Page=()=>{};w.ALM_COMMUNITY_ERROR=error=>error.message;w.ALM_COMMUNITY_PLUS={report(){},decorate(){}};w.fetch=async()=>({ok:false});
  w.ALM_COMMUNITY_API=async(endpoint,method='GET',body)=>{
   calls.push({endpoint,method,body});
   if(endpoint==='status'&&statusGate)return statusGate.promise;
   if(endpoint==='status')return {configured:true,connected,user:connected?{id:owner,email:'previous-owner@example.invalid'}:null,identity:own.profile,own,notifications:{count:0},sync:{}};
   if(endpoint==='friends')return holdFriends?pendingFriends.promise:network;
   if(endpoint==='profiles/'+friend)return shared;
   if(endpoint==='recommendations'&&method==='POST')return sendGate?sendGate.promise:{ok:true};
   throw Error('Unexpected '+endpoint);
  };
  for(const name of ['community-requests.js','community-workspace.js','community.js'])w.eval(source(name));
  await tick();
  assert.equal(w.document.getElementById('commProfileName').textContent,'GentilRobot','Identity is shown before the friends request finishes');
  assert.equal(w.document.getElementById('commProfileState').textContent,'GentilRobot#0004');
  assert(w.document.querySelector('.side-nav .comm-side-group'),'Friend navigation stays inside the scrolling menu');
  assert.equal(calls.filter(c=>c.endpoint==='status').length,1,'Footer reuses the existing status request');
  pendingFriends.resolve(network);holdFriends=false;await w.ALM_COMMUNITY.refresh({cached:true});
  const W=w.ALM_COMMUNITY_WORKSPACE,visible=w.document.querySelector('[data-mal-id="20"]');W.updateRecommendationButtons();assert.equal(visible.hidden,false,'An unpublished anime is not hidden by a missing account snapshot row');
  await W.recommendAnime(20,{title:'Local title before publication'});
  let form=w.document.querySelector('#commDialog form');assert(form);assert(form.textContent.includes('Local title before publication'));
  form.elements.recipient.value=friend;form.elements.message.value='Test message';sendGate=deferred();form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(calls.filter(c=>c.endpoint==='recommendations'&&c.method==='POST').length,1,'Repeated clicks send once');
  const dialog=w.document.getElementById('commDialog');dialog.close();w.ALM_COMMUNITY.modal('<h2>New dialog</h2><button data-close>Close</button>');sendGate.resolve({ok:true});await tick();assert(dialog.open,'Completion of a previous send cannot close another dialog');assert(dialog.textContent.includes('New dialog'));dialog.close();
  await W.recommendAnime(999,{title:'Unclassified'});assert.equal(dialog.querySelector('[role=status]').textContent,'CONTENT_NOT_SHARED');assert(!dialog.querySelector('form'),'Unavailable content remains blocked');dialog.close();
  own.items=shared.items;await w.ALM_COMMUNITY.open(friend);
  let common=w.document.querySelector('.comm-profile-common-heading button');assert(common);assert.equal(common.textContent.replace(/\s+/g,' ').trim(),'Animés en commun 1→');assert.equal(w.document.querySelectorAll('[data-comm-action="show-common"]').length,1);assert(!w.document.body.textContent.includes('Voir tous nos animés en commun'));
  const profileCalls=calls.filter(c=>c.endpoint==='profiles/'+friend).length;common.click();await tick();assert.equal(w.ALM_COMMUNITY.context().tab,'common');assert.equal(w.document.activeElement.id,'comm-tab-common','Focus follows the opened list');assert.equal(w.document.querySelector('.comm-pagination').hidden,true,'A one-page common list has no useless arrows');assert.equal(calls.filter(c=>c.endpoint==='profiles/'+friend).length,profileCalls,'Opening common anime uses the already-authorized data');
  shared.items=[];await w.ALM_COMMUNITY.open(friend);common=w.document.querySelector('.comm-profile-common-heading button');assert(common.disabled,'No common anime produces a disabled count, not a dead clickable area');assert(w.document.querySelector('.comm-profile-common').textContent.includes('Aucun animé'));
  for(const language of ['fr','en','es','de','ja','pt-BR','zh-CN']){w.document.documentElement.lang=language;w.dispatchEvent(new w.Event('alm:language-changed'));const title=w.document.getElementById('commProfileName').textContent;assert(title.includes('GentilRobot'));assert(!title.includes('{name}'));assert.equal(w.document.getElementById('commProfileState').textContent,'GentilRobot#0004');}
  // The Settings window may remain open when an account is invalidated.
  // A pending or failed next status must not leave the previous account's data/actions.
  const settings=w.document.createElement('dialog');settings.id='settingsDialog';settings.innerHTML='<section id="commAccountSettings"></section>';w.document.body.append(settings);settings.showModal();await W.renderAccount();
  const account=w.document.getElementById('commAccountSettings');assert(account.textContent.includes('previous-owner@example.invalid'));assert(account.querySelector('[data-comm-action="publish"]'));w.ALM_COMMUNITY_PLUS.sessionRows=[{id:'old-session',name:'Previous device'}];
  w.document.getElementById('communityPage').classList.add('hidden');statusGate=deferred();connected=false;const writesBefore=calls.filter(c=>c.method!=='GET').length;
  w.dispatchEvent(new w.Event('alm:community-session'));const statusRefresh=w.ALM_COMMUNITY.refresh({cached:true});
  const cleared=()=>{assert.equal(w.ALM_COMMUNITY.snapshot(),null);assert(!account.textContent.includes('previous-owner@example.invalid'));assert(!account.textContent.includes('GentilRobot'));assert(!account.querySelector('[data-comm-action="publish"],[data-comm-action="withdraw"],[data-comm-plus="delete"]'));assert.equal(w.ALM_COMMUNITY_PLUS.sessionRows.length,0);};
  cleared();assert(account.querySelector('[data-comm-account-refresh]'),'The cleared panel offers an existing retry action while loading');statusGate.reject(Error('STATUS_UNAVAILABLE'));await assert.rejects(statusRefresh,/STATUS_UNAVAILABLE/);await tick();cleared();assert.equal(account.querySelector('[role=status]').textContent,'STATUS_UNAVAILABLE');assert.equal(calls.filter(c=>c.method!=='GET').length,writesBefore,'Invalidating an account never sends a cloud write');statusGate=null;settings.close();settings.remove();
  connected=false;w.dispatchEvent(new w.Event('alm:community-session'));assert(!w.document.getElementById('commProfileState').textContent.includes('GentilRobot'),'Signing out clears the visible account immediately');await w.ALM_COMMUNITY.refresh({cached:true});W.updateRecommendationButtons();assert.equal(visible.hidden,false);await W.recommendAnime(20);assert(dialog.querySelector('[data-recommend-login]'));w.ALM_COMMUNITY.auth=async mode=>{assert.equal(mode,'login');loginCalls++;};dialog.querySelector('[data-recommend-login]').click();assert.equal(loginCalls,1);
  for(const name of ['community.js','community-workspace.js','community-copy.js','community-workspace-copy.js','community-workspace.css'])assert.equal(source(name),fs.readFileSync(path.join(root,'community/site',name),'utf8'),'Shared website source: '+name);
  console.log('OK Beta82 community navigation: natural startup survives renders and coalesced collection changes; early identity, fixed footer, all seven languages, one clickable common count, empty results, unpublished recommendations, login prompt, content policy, single send, stale-dialog isolation and immediate account-panel clearing on session loss.');
 }finally{pendingFriends.resolve({userId:owner,relationships:[],cards:[]});w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
