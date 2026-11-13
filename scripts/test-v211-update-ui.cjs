'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20)),read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
async function run(){
 const dom=new JSDOM('<!doctype html><button id="backupBtn"></button><button id="settingsBtn"></button><dialog id="settingsDialog"><section id="settingsPanel-appearance"></section><section id="settingsPanel-updates"></section></dialog><section id="animeGrid"></section>',{url:'http://alm.test',runScripts:'outside-only'}),w=dom.window;
 let language='fr',offline=false,release,updateClicks=0,downloadCalls=0,nativeClick,resolveCheck;
 w.ALM_DESIGN_COPY=Object.fromEntries(['fr','en','ja','es','de','pt-BR','zh-CN'].map(l=>[l,{}]));w.ALM_DESIGN={language:()=>language,icon:()=>'',t:(key,values={})=>(w.ALM_DESIGN_COPY[language]?.[key]||key).replace(/\{(\w+)\}/g,(_,key)=>values[key]??''),applyText(){},storage:{get(){},set(){}}};
 w.setInterval=()=>0;w.setTimeout=()=>0;
 w.ALM_SETTINGS={select:key=>{assert.equal(key,'updates');updateClicks++;}};w.document.getElementById('settingsBtn').onclick=()=>{w.document.getElementById('settingsDialog').open=true;};
 w.animeManager={updateState:async()=>({supported:true,phase:'idle'}),onUpdateOpen:fn=>nativeClick=fn,updateDownload:()=>downloadCalls++};
 let data={muted:false,unread:1,items:[{id:'update',type:'update',version:'2.2.0',prerelease:true,createdAt:Date.now(),read:false}]};
 w.fetch=async(url,options)=>{
  if(url==='/api/updates/check'){if(offline)throw Error('offline');if(resolveCheck)await new Promise(resolve=>resolveCheck=resolve);return {ok:true,json:async()=>release||{available:true,latest:'v2.2.0',releaseUrl:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.2.0'}};}
  if(url==='/api/notifications/read'){data={...data,unread:0,items:data.items.map(i=>({...i,read:true}))};}
  return {ok:true,json:async()=>url.startsWith('/api/notifications')?data:{enabled:false}};
 };
 try{
  for(const file of ['update-notification-copy.js','release-copy.js','notification-center.js','release-watch.js'])w.eval(read(file));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
  for(const lang of w.ALM_UPDATE_COPY.languages){language=lang;w.dispatchEvent(new w.Event('alm:language-changed'));const row=w.document.querySelector('.notification-update');assert(row.textContent.includes(w.ALM_UPDATE_COPY.text('beta',lang)));assert(row.textContent.includes('2.2.0'));}
  language='fr';w.document.querySelector('.notification-update').click();await tick();assert.equal(updateClicks,1);assert.equal(downloadCalls,0);assert(w.document.getElementById('settingsDialog').open);assert(w.document.getElementById('notificationClear').disabled,'Calendar clearing must not remove update alerts');
  nativeClick();await tick();assert.equal(updateClicks,2);assert.equal(downloadCalls,0,'Desktop clicks open settings without starting installation');
  resolveCheck=true;w.document.getElementById('almUpdateCheck').click();assert(w.document.getElementById('almUpdateStatus').textContent.includes('Vérification en cours'));assert(w.document.getElementById('almUpdateCheck').disabled);resolveCheck();resolveCheck=null;await tick();
  offline=true;w.document.getElementById('almUpdateCheck').click();await tick();assert.equal(w.document.getElementById('almUpdateStatus').textContent,w.ALM_DESIGN.t('updateError'));assert(w.document.getElementById('almUpdateNotice').hidden);assert(w.document.getElementById('almUpdateDownload').hidden);
  offline=false;release={available:false,error:'ALM_UPDATE_SOURCE'};w.document.getElementById('almUpdateCheck').click();await tick();assert.equal(w.document.getElementById('almUpdateStatus').textContent,w.ALM_DESIGN.t('updateError'));
  data.items[0].version='<img src=x onerror=alert(1)>';await w.ALM_NOTIFICATIONS.refresh();assert(!w.document.querySelector('.notification-update img'),'Release metadata is rendered as text');
  console.log('OK 2.1.1 update UI: seven languages, bell and desktop actions, checking feedback, persistent error feedback and safe metadata.');
 }finally{dom.window.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
