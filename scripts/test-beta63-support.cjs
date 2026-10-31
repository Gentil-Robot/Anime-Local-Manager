'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.ALM_JSDOM_MODULE||'jsdom');
const root=path.join(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 const dom=new JSDOM('<!doctype html><html lang="fr"><body><section id="settingsPanel-storage"><div class="storage-actions"></div></section><p id="commSettingsStatus"></p></body></html>',{url:'http://127.0.0.1:3123/',runScripts:'outside-only'}),w=dom.window;
 try{
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  for(const file of ['design-copy.js','design-core.js','community-security.js','community-copy.js','community-upgrade-copy.js','community-site-copy.js','community-workspace-copy.js'])w.eval(fs.readFileSync(path.join(root,'public',file),'utf8'));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.onclose?.();};w.ALM_SCROLL_PROGRESS={mount(){}};
  w.ALM_COMMUNITY_ERROR=e=>e.message;
  const sent=[],copied=[];w.ALM_COMMUNITY_PLUS={copy:async value=>copied.push(value)};
  w.animeManager={maintenanceState:async()=>({schedulerSupported:true,schedulerState:{verified:true,registered:false,error:'ALM_SCHEDULE_ACCESS_DENIED',hresult:'0x80070005',exe:'PRIVATE-EXE'}})};
  const append=w.document.head.append.bind(w.document.head);w.document.head.append=(node)=>{append(node);if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload());};
  let captchaOptions;w.turnstile={render(_host,options){captchaOptions=options;options.callback('fixture-captcha');return 1;},remove(){},reset(){captchaOptions.callback('fixture-captcha');}};
  w.fetch=async(url,options={})=>{
   // Deliberately serve an older backend version to verify current UI version wins.
   if(url==='/api/support-diagnostic')return {ok:true,json:async()=>({version:'2.0.0-beta.82',runtime:{platform:'win32',node:'22.22.2',arch:'x64'},storage:{engine:'sqlite',ready:true,path:'PRIVATE-PATH'},counts:{collection:42,catalogue:30430},hostname:'PRIVATE-HOST',email:'PRIVATE-EMAIL',key:'PRIVATE-KEY',library:['PRIVATE-TITLE']})};
   if(url==='/api/community/public-config')return {ok:true,json:async()=>({captchaSiteKey:'fixture-public-key',publicEndpoint:'https://duzwwoyqproxpytmfzdx.supabase.co/functions/v1/alm-public'})};
   if(url==='https://duzwwoyqproxpytmfzdx.supabase.co/functions/v1/alm-public/config')return {ok:true,json:async()=>({diagnosticVersion:1,diagnosticSectionsVersion:2})};
   if(url==='https://duzwwoyqproxpytmfzdx.supabase.co/functions/v1/alm-public'){sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true})};}
   throw Error('Unexpected fixture endpoint '+url);
  };
  w.eval(fs.readFileSync(path.join(root,'public/community-forms.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'public/support-diagnostics.js'),'utf8'));
  assert.equal(w.document.querySelector('[data-alm-diagnostic]').textContent,'Envoyer mon diagnostic');
  w.ALM_SUPPORT.record('maintenance','ALM_SCHEDULE_ACCESS_DENIED','0x80070005');
  await w.ALM_SUPPORT.copy();const report=JSON.parse(copied[0]);assert.equal(report.counts.collection,42);assert.equal(report.counts.catalogue,30430);assert.equal(report.scheduler.code,'ALM_SCHEDULE_ACCESS_DENIED');assert.equal(report.events[0].hresult,'0x80070005');assert.equal(report.version,require('../package.json').version,'Support diagnostics must report the current application version, even when the mocked local API still returns a former beta');
  for(const value of ['PRIVATE-PATH','PRIVATE-HOST','PRIVATE-EMAIL','PRIVATE-KEY','PRIVATE-TITLE','PRIVATE-EXE'])assert(!copied[0].includes(value));assert(w.document.getElementById('commSettingsStatus').textContent.includes('presse-papiers'));
  w.document.querySelector('[data-alm-diagnostic]').click();await tick();await tick();
  const dialog=w.document.getElementById('almPublicDialog'),form=dialog.querySelector('form');assert(dialog.open);assert.equal(form.elements.category.value,'problem');assert.equal(sent.length,0,'Preparing the contact form must not send anything');
  assert(form.querySelector('textarea[readonly]').value.includes('ALM_SCHEDULE_ACCESS_DENIED'));assert(form.elements.attach_diagnostic.checked);assert(!form.elements.consent.checked);
  form.elements.email.value='fixture@example.invalid';form.elements.message.value='A reproducible maintenance problem';form.elements.consent.checked=true;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.equal(sent.length,1);assert.equal(sent[0].diagnostic.scheduler.hresult,'0x80070005');assert(!JSON.stringify(sent[0].diagnostic).includes('PRIVATE-'));
  form.elements.attach_diagnostic.checked=false;form.elements.email.value='fixture@example.invalid';form.elements.message.value='The same report without a diagnostic';form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(sent.length,2);assert(!('diagnostic' in sent[1]));
  dialog.close();const copyMethod=w.ALM_COMMUNITY_PLUS.copy;w.ALM_COMMUNITY_PLUS.copy=async()=>false;await w.ALM_SUPPORT.copy();assert.equal(w.document.getElementById('commSettingsStatus').textContent,w.ALM_COMMUNITY_T('copyManual'));w.ALM_COMMUNITY_PLUS.copy=copyMethod;
  const state={settings:{enabled:true,unmeteredOnly:true,installOnExit:false,channel:'stable',tasks:{news:{enabled:true,hours:2}}},tasks:{},running:false,schedulerSupported:true,schedulerState:{platform:'win32',verified:true,registered:false,enabled:false,matches:false}};
  w.document.body.insertAdjacentHTML('beforeend','<dialog id="settingsDialog" open><section id="settingsPanel-updates"></section></dialog>');let poll;
  w.setInterval=fn=>{poll=fn;return 1;};w.clearInterval=()=>{};
  w.animeManager={maintenanceState:async()=>state,maintenanceConfigure:async()=>({...state,ok:false,code:'ALM_SCHEDULE_ACCESS_DENIED',hresult:'0x80070005'})};
  w.eval(fs.readFileSync(path.join(root,'public/maintenance.js'),'utf8'));await tick();
  w.document.querySelector('#autoMaintenance [data-save]').click();await tick();assert(w.document.getElementById('autoStatus').textContent.includes('Windows refuse'));assert(w.document.getElementById('autoStatus').textContent.includes('0x80070005'));
  await poll();await tick();assert(w.document.getElementById('autoStatus').textContent.includes('ALM_SCHEDULE_ACCESS_DENIED'),'Polling must preserve the save failure');assert(w.document.querySelector('#autoMaintenance [data-repair]'));assert(w.document.querySelector('#autoMaintenance [data-alm-diagnostic]'));
  w.eval(fs.readFileSync(path.join(root,'public/legal-content.js'),'utf8'));for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN']){w.document.documentElement.lang=lang;assert(w.ALM_LEGAL_COPY[lang].support&&w.ALM_LEGAL_COPY[lang].devices);for(const key of ['sendDiagnostic','diagnosticPrivacy','contactLimits','repairSchedule','disconnectSession','privacyAboutCopy'])assert.notEqual(w.ALM_COMMUNITY_T(key),key);}
  console.log('OK Beta63 support: real preview and opt-out, no automatic send, clipboard feedback, strict redaction, scheduler codes and HRESULT, persistent failure after polling, repair control and seven-language copy.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
