'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const base=path.join(__dirname,'../public');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
const tick=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const dom=new JSDOM('<!doctype html><html lang="fr"><body><nav class="side-nav"><button id="navSettings"></button></nav><button id="navCommunity"></button><button id="commProfileEntry"><img><strong id="commProfileName"></strong><small id="commProfileState"></small></button><section id="communityPage"></section><dialog id="settingsDialog"><section id="commAccountSettings"></section></dialog></body></html>',{url:'http://127.0.0.1:3123',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 const copies=[],calls=[],animes=[],read=[];let chosen='',connected=true;
 w.eval(fs.readFileSync(path.join(base,'release-version.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(base,'design-copy.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(base,'design-core.js'),'utf8'));
 w.showV2Page=()=>{};w.animeManager={writeClipboard:async text=>{copies.push(text);return true;}};
 w.ALM_SETTINGS={select:key=>{chosen=key;}};w.ALM_SCROLL_PROGRESS={mount(){}};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['watch-status.js','season-reference.js','series-state.js','community-content.js','community-model.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-site-copy.js','community-workspace-copy.js','clipboard.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
 const pending={requests:[{id:'pending'}],recommendations:[{id:'received',anime:{mal_id:80,title:'A new recommendation'}}]};let notices={items:[{type:'test',createdAt:'2026-10-17T10:00:00Z'}],unread:1,muted:false};
 const M=w.ALM_COMMUNITY_MODEL;
 const own={profile:M.profile({display_name:'Fixture',id:A,handle:'u_fixture',discriminator:1,visibility:'private'}),items:[],summary:M.summary([]),dna:[],activity:[]};
 const people=[{id:B,display_name:'Twin',discriminator:1,avatar:'aster'},{id:C,display_name:'Twin',discriminator:2,avatar:'moon'}];
 const friends={userId:A,relationships:people.map((p,i)=>({id:'friend-'+i,requester:A,recipient:p.id,status:'accepted'})),cards:people};
 const inbox=[{id:'rec-1',anime:{mal_id:80,title:'Pending fixture'},message:'Recommended',read_at:null},{id:'rec-old',anime:{mal_id:81,title:'Already treated'},message:'Old',read_at:'2026-10-10'}];
 const foreign={profile:M.profile({...people[1],visibility:'friends',share_library:true}),items:M.items([{malId:20,title:'Fantasy 2024',status:'Completed',type:'TV',year:2024,genres:['Fantasy'],studios:['Studio A'],score:9},{malId:21,title:'Drama 2023',status:'Watching',type:'Movie',year:2023,genres:['Drama'],studios:['Studio B'],score:0}]),dna:[],activity:[]};
 w.ALM_COMMUNITY_ERROR=error=>w.ALM_COMMUNITY_T(w.ALM_COMMUNITY_SECURITY.messageKey(error));
 w.ALM_COMMUNITY_API=async(endpoint,method='GET',body={})=>{
  calls.push({endpoint,method,body});
  if(endpoint==='status')return {configured:true,connected,user:{id:A,email:'fixture@example.invalid'},identity:own.profile,own,profileSaved:true,sync:{auto:false,publishedAt:null,dirty:false},notifications:pending};
  if(endpoint==='friends')return friends;
  if(endpoint==='recommendations'&&method==='POST')return {ok:true};
  if(endpoint==='recommendations')return {items:inbox,userId:A};
  if(endpoint.startsWith('profiles/')){assert.equal(endpoint,'profiles/'+C);return foreign;}
  if(endpoint==='profile'){own.profile=M.profile(body);return own;}
  if(endpoint==='sync')return {ok:true};
  if(endpoint.endsWith('/read')){read.push(endpoint);inbox.find(r=>endpoint.includes(r.id)).read_at='2026-10-15';return {ok:true};}
  throw Error('Unexpected fixture endpoint '+endpoint);
 };
 w.fetch=async(url,options={})=>{
  if(url.startsWith('/api/notifications')){if(url.endsWith('/read'))notices={...notices,unread:0};if(url.endsWith('/clear'))notices={...notices,items:[],unread:0};return {ok:true,json:async()=>notices};}
  if(url==='/api/animes'&&!options.method)return {ok:true,json:async()=>animes};
  if(url==='/api/animes'&&options.method==='POST'){const row={...JSON.parse(options.body),id:animes.length+1};animes.push(row);own.items=M.items(animes);return {ok:true};}
  throw Error('Unexpected fixture fetch '+url);
 };
 for(const file of ['community-requests.js','community-charter.js','community-workspace.js','community-ui-extra.js','community.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
 await w.ALM_COMMUNITY.open('','friends');assert.equal(w.document.querySelectorAll('.comm-friend').length,2);
 assert(w.document.getElementById('navFriendLibrary'));assert(w.document.querySelector('.comm-stats').textContent.includes('Bibliothèques consultées'));
 await w.ALM_COMMUNITY.open('','friend-library');
 const choice=w.document.getElementById('commFriendChoice');choice.value='Twin#0002';choice.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(w.document.querySelectorAll('#commLibraryResults .comm-card').length,2);
 const filter=w.document.querySelector('[data-comm-filter=genre]');filter.value='Fantasy';filter.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(w.document.querySelectorAll('#commLibraryResults .comm-card').length,1);
 w.document.querySelector('[data-comm-action="add-status"][data-status="Completed"]').click();await tick();
 assert.equal(animes[0].status,'Completed');assert.equal(Number(animes[0].malId),20);
 await w.ALM_COMMUNITY.open('','inbox');assert(!w.document.getElementById('commPanel').textContent.includes('Already treated'));
 w.document.querySelector('[data-comm-action="add-status"][data-status="Watching"]').click();await tick();
 assert.equal(animes[1].status,'Watching');assert.equal(read.length,1);assert(!w.document.querySelector('.comm-recommendation'));
 w.document.querySelector('[data-comm-plus=copy]').click();await tick();assert.equal(copies.at(-1),'Fixture#0001');
 await w.ALM_COMMUNITY_WORKSPACE.openAccount();
 w.document.querySelector('[data-comm-action=account-diagnostic]').click();await tick();assert.equal(JSON.parse(copies.at(-1)).application,require('../release-version.json').publicName);assert(!copies.at(-1).includes('fixture@example.invalid'));
 await w.ALM_COMMUNITY_WORKSPACE.openAccount();assert.equal(chosen,'account');
 assert(w.document.querySelector('#commAccountSettings .comm-check span'));assert(w.document.querySelector('.comm-danger-zone [data-comm-plus=delete]'));
 w.document.getElementById('settingsDialog').close();w.ALM_COMMUNITY.edit();
 const visibility=w.document.querySelector('[name=visibility]');assert(w.document.getElementById('commShareChoices').hidden);
 visibility.value='friends';visibility.dispatchEvent(new w.Event('change'));assert(!w.document.getElementById('commShareChoices').hidden);
 w.document.querySelector('[name=bio]').value='Updated once';w.document.getElementById('commEditForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(own.profile.bio,'Updated once');assert.equal(w.ALM_COMMUNITY.snapshot().own.profile.visibility,'friends');
 assert(w.document.querySelector('#commAccountSettings').textContent.includes('Fixture#0001'));
 assert.equal(M.avatarImage('data:image/svg+xml;base64,PHN2Zz4='),'');assert.equal(M.avatarImage('https://tracker.invalid/pixel.png'),'');

 await w.ALM_COMMUNITY.open();
 await w.ALM_COMMUNITY_WORKSPACE.openAccount();
 const idNode=w.document.querySelector('#commAccountSettings [data-comm-copy-id]'),beforeCopies=copies.length;
 idNode.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true,cancelable:true}));await tick();assert.equal(copies.at(-1),'Fixture#0001');
 idNode.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();assert.equal(copies.length,beforeCopies+2);
 w.document.getElementById('settingsDialog').close();
 assert(w.ALM_COMMUNITY.avatar({avatar:'moon'}).endsWith('/aster-portrait.webp'));
 w.ALM_COMMUNITY.edit();const editor=w.document.getElementById('commEditForm');assert(editor.querySelector('[name=avatar_file]'));assert(!editor.querySelector('[name=avatar]'));assert(!editor.querySelector('#commAvatarRemove'));editor.closest('dialog').close();
 friends.relationships[1].status='pending';await w.ALM_COMMUNITY_WORKSPACE.recommendAnime(20);
 let recForm=w.document.querySelector('dialog[open] form');assert.equal(recForm.querySelectorAll('select option').length,2);assert(recForm.querySelector('option[value="'+B+'"]'));assert(!recForm.querySelector('option[value="'+C+'"]'));
 recForm.elements.recipient.value=B;recForm.elements.message.value='Try this anime';recForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));recForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 const sends=calls.filter(c=>c.endpoint==='recommendations'&&c.method==='POST');assert.equal(sends.length,1);assert.equal(sends[0].body.malId,20);assert.equal(sends[0].body.recipient,B);
 friends.relationships[0].status='pending';await w.ALM_COMMUNITY_WORKSPACE.recommendAnime(20);assert(!w.document.querySelector('dialog[open] form'));w.document.querySelector('dialog[open]').close();
 const backup=w.document.createElement('button');backup.id='backupBtn';w.document.body.append(backup);
 w.eval(fs.readFileSync(path.join(base,'beta41-copy.js'),'utf8'));w.eval(fs.readFileSync(path.join(base,'notification-center.js'),'utf8'));await tick();
 assert.equal(w.document.getElementById('notificationClose').textContent,'Fermer');assert.equal(w.document.querySelector('#notificationBell .notification-badge').textContent,'3');
 w.document.getElementById('notificationBell').click();await tick();assert.equal(w.document.querySelectorAll('#notificationList .notification-group').length,2);assert.equal(w.document.querySelector('#notificationBell .notification-badge').textContent,'2');
 w.document.getElementById('notificationClear').click();await tick();assert.equal(w.document.querySelector('[data-kind=community] .notification-entry').textContent,'1 demande(s) d’amis à traiter');assert.equal(pending.recommendations.length,1);
 for(const [lang,close]of [['fr','Fermer'],['en','Close'],['es','Cerrar'],['de','Schließen'],['ja','閉じる'],['pt-BR','Fechar'],['zh-CN','关闭']]){w.document.documentElement.lang=lang;w.dispatchEvent(new w.Event('alm:language-changed'));assert.equal(w.document.getElementById('notificationClose').textContent,close);}
 connected=false;await w.ALM_COMMUNITY.refresh();await w.ALM_COMMUNITY_WORKSPACE.recommendAnime(20);assert(w.document.querySelector('dialog[open] [data-recommend-login]'),'Signed-out users receive an actionable login prompt');assert(!w.document.querySelector('dialog[open] .comm-loading'),'The prompt must not stay on a loading screen');
 const sourceDom=new JSDOM(fs.readFileSync(path.join(base,'index.html'),'utf8')),sourceDoc=sourceDom.window.document;
 assert(!sourceDoc.getElementById('navCommunity'));assert.equal(sourceDoc.querySelectorAll('#commProfileEntry').length,1);assert.equal(sourceDoc.getElementById('commProfileEntry').parentElement.id,'studioSidebar');assert.equal(sourceDoc.getElementById('studioSidebar').lastElementChild.id,'commProfileEntry');assert(!sourceDoc.getElementById('commProfileEntry').closest('.side-nav'),'Identity remains in the fixed footer beneath the menu');sourceDom.window.close();
 console.log('OK Beta62 UI: single default avatar, double-click and keyboard copy, friend-only recommendations, duplicate-submit prevention, unified calendar/community notifications, separate pending actions, invitation and seven-language close labels.');

 dom.window.close();console.log('OK Beta61 UI: dedicated community navigation, accepted-friend chooser, shared library filters, three import statuses, pending-only inbox, native clipboard, redacted diagnostics, account settings and conditional sharing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
