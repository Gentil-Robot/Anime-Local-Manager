'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){const end=Date.now()+2000;while(!predicate()){if(Date.now()>end)throw Error('UI fixture timed out');await pause();}}
async function main(){
 const dom=new JSDOM('<!doctype html><html><body><section id="communityPage"></section></body></html>',{url:'http://127.0.0.1:3123',runScripts:'outside-only'}),w=dom.window;
 try{
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  w.ALM_DESIGN={escape,language:()=> 'fr'};w.ALM_DESIGN_COPY={};
  for(const name of ['community-copy.js','community-security.js','community-upgrade-copy.js','community-mfa-copy.js'])w.eval(source(name));
  const A=randomUUID(),primary=randomUUID(),backup=randomUUID(),setupId=randomUUID(),calls=[];
  let state={connected:false,mfaRequired:true,user:{id:A},mfa:{available:true,enabled:true,required:true,attemptId:'fictional-attempt',factors:[{id:primary,name:'Primary <img src=x>'},{id:backup,name:'Backup'}],backupReady:true}};
  const current=()=>w.document.getElementById('commDialog'),form=()=>current()?.querySelector('form');
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){}});
  w.ALM_CAPTCHA={config:async()=>({captchaSiteKey:'fixture'}),mount:async()=>({token:()=> 'fictional-captcha',reset(){},destroy(){calls.push(['destroyCaptcha']);}})};
  w.ALM_QR={toCanvas:async(_canvas,uri)=>calls.push(['qr',uri])};
  w.ALM_COMMUNITY={snapshot:()=>state,refresh:async()=>{},paint(){},toast:text=>calls.push(['toast',text]),open:async()=>{},setTab:async()=>{},
   modal(html){let d=current();if(!d){d=w.document.createElement('dialog');d.id='commDialog';w.document.body.append(d);}d.onclose=null;d.innerHTML=html;d.querySelector('[data-close]').onclick=()=>d.close();d.showModal();return d;},
   async api(endpoint,method,body){calls.push([endpoint,body]);
    if(endpoint==='mfa')return state.mfa;
    if(endpoint==='mfa/verify'){state={...state,connected:true,mfaRequired:false,mfa:{...state.mfa,required:false}};return {ok:true};}
    if(endpoint==='mfa/cancel')return {ok:true};
    if(endpoint==='mfa/enroll')return {id:setupId,uri:'otpauth://totp/ALM?secret=JBSWY3DPEHPK3PXP',secret:'JBSWY3DPEHPK3PXP'};
    if(endpoint==='mfa/enroll/cancel'||endpoint==='sensitive')return {ok:true};
    throw Error('Unexpected UI endpoint '+endpoint);
   }
  };
  w.eval(source('community-mfa.js'));const UI=w.ALM_COMMUNITY_MFA;
  for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN'])for(const key of ['securityTitle','mfaEnable','mfaBackupHelp','mfaAfterLogin','mfaCodeInvalid','securityUpdateRequired'])assert(w.ALM_COMMUNITY_COPY[lang][key],lang+': '+key);
  assert(UI.authOptions(false).includes('name="enable_mfa"'));assert(UI.authOptions(true).includes('Après confirmation'));
  const verified=UI.challenge(state.mfa);await until(()=>form()?.elements.code);
  assert.equal(current().querySelectorAll('img').length,0,'Authenticator names are escaped');
  form().elements.factorId.value=backup;form().elements.code.value='123456';form().dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(await verified,true);assert.equal(calls.find(row=>row[0]==='mfa/verify')[1].factorId,backup);
  assert.equal(form().elements.code.value,'');

  state={...state,connected:false,mfaRequired:true,mfa:{...state.mfa,required:true}};
  const cancelled=UI.challenge(state.mfa);await until(()=>current()?.open&&form()?.elements.code);
  form().elements.code.value='654321';current().close();assert.equal(await cancelled,false);await pause();
  assert(calls.some(row=>row[0]==='mfa/cancel'&&row[1].attemptId==='fictional-attempt'));assert.equal(form().elements.code.value,'');

  state={...state,connected:true,mfaRequired:false,mfa:{available:true,enabled:false,required:false,factors:[],backupReady:false}};
  await UI.settings();current().querySelector('[data-add-factor]').click();
  await until(()=>form()?.elements.password&&!form().querySelector('[type=submit]').disabled);
  form().elements.password.value='Fictional-pass-123!';form().dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>form()?.elements.secret);
  assert.equal(form().elements.secret.value,'JBSWY3DPEHPK3PXP');assert(calls.some(row=>row[0]==='qr'&&row[1].startsWith('otpauth://')));
  const secret=form().elements.secret;current().close();await pause();
  assert.equal(secret.value,'');assert.equal(secret.hasAttribute('value'),false);
  assert(calls.some(row=>row[0]==='mfa/enroll/cancel'&&row[1].factorId===setupId));

  state={...state,mfa:{enabled:true,required:false,factors:[{id:primary,name:'Primary'}],backupReady:false}};
  const sensitive=UI.sensitive('revoke-session',{target:backup});await until(()=>form()?.elements.password&&!form().querySelector('[type=submit]').disabled&&form().elements.code);
  const fields=form();fields.elements.password.value='Fictional-pass-123!';fields.elements.factorId.value=primary;fields.elements.code.value='123456';fields.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await sensitive;const request=calls.find(row=>row[0]==='sensitive')[1];
  assert.equal(request.action,'revoke-session');assert.equal(request.target,backup);assert.equal(request.factorId,primary);assert.equal(request.captchaToken,'fictional-captcha');
  assert.equal(fields.elements.password.value,'');assert.equal(fields.elements.code.value,'');
  console.log('OK V2 Auth UI: seven languages, visible optional setup, escaped factors, backup login, close cancellation, private local QR, secret cleanup and sensitive target/password/MFA forwarding.');
 }finally{w.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
