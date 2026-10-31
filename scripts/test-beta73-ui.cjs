'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,'public',name),'utf8');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function within(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timed out: '+label)),2500);})]);}finally{clearTimeout(timer);}}
async function waitFor(predicate,label){const until=Date.now()+2500;while(!predicate()){if(Date.now()>=until)throw Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,5));}}

// UX82 publishes the account identity first. Friends are fetched only after a
// connected status; the request gate, early rendering and error path are real.
async function checkConnectedLoading(outcome){
 const dom=new JSDOM('<section id="communityPage"></section>',{url:'https://animelocalmanager.com',runScripts:'outside-only'}),w=dom.window;
 const status=deferred(),friends=deferred();let statusCalls=0,friendCalls=0,opened=[];
 const M=require('../public/community-model'),S=require('../public/community-security');
 const profile=M.profile({display_name:'Fixture account'});
 const next={configured:true,connected:true,user:{id:'fixture-owner'},own:{profile,items:[],summary:M.summary([]),dna:[],activity:[]}};
 const emptyFriends={userId:'fixture-owner',cards:[],relationships:[]};
 try{
  if(w.document.readyState==='loading')await within(new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true})),'DOM readiness');
  w.ALM_DESIGN={escape:String,language:()=> 'fr',icon:()=>'',t:key=>key};w.ALM_COMMUNITY_T=key=>key;w.ALM_COMMUNITY_ERROR=error=>error.message;
  w.ALM_COMMUNITY_MODEL=M;w.ALM_COMMUNITY_SECURITY=S;
  w.ALM_COMMUNITY_WORKSPACE={stats:()=>'',reset(){},bindLibrary(){},hydratePosters(){}};
  w.ALM_COMMUNITY_API=async endpoint=>{if(endpoint==='status'){statusCalls++;return status.promise;}if(endpoint==='friends'){friendCalls++;return friends.promise;}throw Error('Unexpected '+endpoint);};
  for(const file of ['community-requests.js','community.js'])w.eval(read(file));
  opened=[w.ALM_COMMUNITY.open(),w.ALM_COMMUNITY.open()];
  const page=w.document.getElementById('communityPage');
  assert.equal(page.getAttribute('aria-busy'),'true','Loading must be shown immediately');
  assert.equal(statusCalls,1,'Overlapping opens must share their status request');
  assert.equal(friendCalls,0,'No friends request before a connected status');
  if(outcome==='status-error'){
   status.reject(Error('STATUS_UNAVAILABLE'));
  }else{
   status.resolve(next);
   await waitFor(()=>friendCalls===1,'one friends request after status');
   assert.equal(w.ALM_COMMUNITY.snapshot(),next,'Account identity is available while friends are still loading');
   assert.equal(page.getAttribute('aria-busy'),'true','The profile is still loading until its friends data is available');
   opened.push(w.ALM_COMMUNITY.open());
   assert.equal(statusCalls,1,'A further open must reuse the in-flight refresh');
   assert.equal(friendCalls,1,'No duplicate friends request while loading');
   if(outcome==='friends-error')friends.reject(Error('FRIENDS_UNAVAILABLE'));else friends.resolve(emptyFriends);
  }
  await within(Promise.all(opened),'community loading completion: '+outcome);
  assert.equal(page.hasAttribute('aria-busy'),false,'Busy state must end on success and failure');
  assert.equal(statusCalls,1);
  assert.equal(friendCalls,outcome==='status-error'?0:1);
  if(outcome==='success'){
   assert.equal(w.ALM_COMMUNITY.context().friends,emptyFriends);
   assert.equal(page.querySelector('h1').textContent,profile.display_name);
  }else{
   assert.equal(page.querySelector('#commStatus').textContent,outcome==='status-error'?'STATUS_UNAVAILABLE':'FRIENDS_UNAVAILABLE','Network errors stay visible');
   assert.equal(w.ALM_COMMUNITY.context().friends,null,'No stale friends data after a failed read');
  }
 }finally{
  // Release controlled promises even when an assertion fails, then close the DOM.
  status.resolve(next);friends.resolve(emptyFriends);
  try{await within(Promise.all(opened),'fixture cleanup');}finally{w.close();}
 }
}

(async()=>{
 // Render every hosted translation binding in all seven languages, not just copy tables.
 for(const language of ['fr','en','es','de','ja','pt-BR','zh-CN']){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'community/site/index.html'),'utf8'),{url:'https://animelocalmanager.com/?lang='+language,runScripts:'outside-only'}),w=dom.window;
  try{
   for(const file of ['community-page-init.js','design-core.js','community-age.js','community-copy.js','community-upgrade-copy.js','community-site-copy.js','community-workspace-copy.js','community-charter.js'])w.eval(read(file));
   if(w.document.readyState==='loading')await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
   w.ALM_DESIGN.applyText();
   for(const node of w.document.querySelectorAll('[data-design-text]')){const key=node.dataset.designText;assert.notEqual(node.textContent,key,language+': '+key);assert(node.textContent.trim(),language+': empty '+key);}
   assert.equal(w.document.querySelector('[data-design-text=signup]').textContent,w.ALM_COMMUNITY_COPY[language].signup);
   assert.equal(w.document.querySelector('[data-design-text=login]').textContent,w.ALM_COMMUNITY_COPY[language].login);
   const wrapper=w.document.createElement('div');wrapper.innerHTML=w.ALM_COMMUNITY_CHARTER.fields(language);assert.equal(wrapper.querySelector('input').checked,false);assert(wrapper.querySelector('input').required);assert(wrapper.textContent.includes(w.ALM_COMMUNITY_CHARTER.copy[language].accept));
  }finally{w.close();}
 }
 const dom=new JSDOM('<style>'+read('scroll-progress.css')+'</style><section id="communityPage"></section>',{url:'https://animelocalmanager.com',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.ALM_DESIGN={escape:String,language:()=> 'fr',icon:()=>'',t:k=>k};w.ALM_COMMUNITY_T=k=>k;w.ALM_COMMUNITY_ERROR=e=>e.message;w.ALM_COMMUNITY_MODEL=require('../public/community-model');w.ALM_COMMUNITY_SECURITY=require('../public/community-security');
  let resolveStatus,resolveFriends,statusCalls=0,friendCalls=0;const status=new Promise(r=>{resolveStatus=r;}),friends=new Promise(r=>{resolveFriends=r;});w.ALM_COMMUNITY_API=async endpoint=>{if(endpoint==='status'){statusCalls++;return status;}if(endpoint==='friends'){friendCalls++;return friends;}throw Error('Unexpected '+endpoint);};
  for(const file of ['community-requests.js','community.js'])w.eval(read(file));
  const first=w.ALM_COMMUNITY.open(),second=w.ALM_COMMUNITY.open();assert.equal(w.document.getElementById('communityPage').getAttribute('aria-busy'),'true');assert.equal(w.document.querySelector('[role=status]').textContent,'running');assert.equal(statusCalls,1);assert.equal(friendCalls,0,'Friends must not be requested before status confirms a connected account');
  const M=w.ALM_COMMUNITY_MODEL;resolveStatus({configured:true,connected:false,own:{profile:M.profile(),items:[],summary:M.summary([]),dna:[],activity:[]}});resolveFriends(null);await within(Promise.all([first,second]),'disconnected profile');assert.equal(statusCalls,1);assert.equal(friendCalls,0,'A disconnected profile must not load friends');assert.equal(w.document.getElementById('communityPage').hasAttribute('aria-busy'),false);
  w.ResizeObserver=class{observe(){}unobserve(){}};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.getClientRects=function(){return this.closest('dialog')&&!this.closest('dialog').open?[]:[{}];};w.requestAnimationFrame=fn=>w.setTimeout(()=>fn(Date.now()),0);w.cancelAnimationFrame=id=>w.clearTimeout(id);
  w.eval(read('scroll-progress.js'));const dialog=w.ALM_COMMUNITY.modal('<p>Fixture</p><button data-close>Close</button>');await new Promise(r=>setTimeout(r,30));dialog.close();await new Promise(r=>setTimeout(r,30));
  for(const id of ['scrollJumpTop','communityScrollTop']){const b=w.document.getElementById(id);assert(b);assert.equal(w.getComputedStyle(b).width,'48px');assert.equal(w.getComputedStyle(b).height,'48px');assert.equal(w.getComputedStyle(b).position,'relative');assert.equal(b.querySelector('svg').getAttribute('width'),'48');}
  assert(w.document.getElementById('communityScrollControls').hidden);
  const app=new JSDOM(read('index.html'));assert.equal(app.window.document.querySelector('.alm-retro-banner').href,'https://animelocalmanager.com/');assert(app.window.document.querySelector('#dnaDashboard .dna-site-banner #almRetroBanner'));assert.equal(app.window.document.querySelector('#aboutPage .alm-retro-banner'),null);assert(app.window.document.querySelector('.creator-card a[href="https://animelocalmanager.com/"]'));app.window.close();
  for(const outcome of ['success','friends-error','status-error'])await checkConnectedLoading(outcome);
  console.log('OK Beta73 UI: status-first loading, early account identity, no friends call while disconnected, one shared friends call when connected, visible network errors; every homepage binding rendered in seven languages, signup/login and charter installed before initial paint, required unchecked charter, immediate duplicate-click loading, bounded scroll controls after dialog close and website links.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
