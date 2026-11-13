'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const model=require('../public/community-model'),security=require('../public/community-security');
const source=fs.readFileSync(path.join(__dirname,'../community/web-client.js'),'utf8').replace(/^import .*;\n/gm,'');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture({hash='#type=recovery&access_token=fictional',mfa=false}={}){
 const dom=new JSDOM('<!doctype html><body><main id="webLanding"></main><section id="communityPage"></section><section id="webActivation" hidden></section><section id="webRecovery" hidden><form id="webRecoveryForm"><input name="password"><input name="confirm_password"><button type="submit">Save</button></form><p id="webRecoveryStatus"></p></section>',
  {url:'https://animelocalmanager.com/compte.html'+hash,runScripts:'outside-only'});
 const w=dom.window,calls=[];await pause();let callback,allowMfa=false;
 const user={id:'10000000-0000-0000-0000-000000000001',email:'fictional@example.invalid',email_confirmed_at:'2026-11-13T00:00:00Z'};
 const session={user,access_token:'fictional-opaque'};
 const client={auth:{mfa:{},onAuthStateChange:fn=>{callback=fn;},getSession:async()=>({data:{session}}),getUser:async()=>({data:{user}}),
  updateUser:async value=>{calls.push(['password',value]);return {data:{user}};},
  signOut:async value=>{calls.push(['signOut',value]);return {data:{}};}
 },rpc:async()=>({data:{version:1,enabled:mfa,required:mfa,factors:[],locked:false}})};
 w.statsModule={libraryStats:async()=>({})};w.sessionAccess=require('../lib/community-session');
 w.securityModule=require('../community/auth-security');w.createClient=()=>client;
 w.ALM_COMMUNITY_MODEL=model;w.ALM_COMMUNITY_SECURITY=security;w.ALM_COMMUNITY_AGE={};
 w.ALM_DESIGN={language:()=> 'fr'};w.ALM_COMMUNITY_T=value=>value;w.ALM_COMMUNITY_COPY={en:{}};
 w.ALM_COMMUNITY_ERROR=error=>error.message;
 w.ALM_COMMUNITY_MFA={challenge:async()=>{calls.push(['mfa']);return allowMfa;}};
 w.fetch=async()=>({ok:true,json:async()=>({url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'})});
 w.eval(source);await pause();w.dispatchEvent(new w.Event('DOMContentLoaded'));await pause();
 const submit=async()=>{
  const form=w.document.getElementById('webRecoveryForm');form.elements.password.value='Fictional-verified-123!';form.elements.confirm_password.value=form.elements.password.value;
  form.dispatchEvent(new w.Event('submit',{cancelable:true}));await pause();await pause();
 };
 return {w,calls,submit,event:name=>callback(name,session),allowMfa:()=>{allowMfa=true;},close:()=>w.close()};
}
async function main(){
 const forged=await fixture();try{
  await forged.submit();assert(!forged.calls.some(c=>c[0]==='password'),'A recovery-looking URL and a normal session are insufficient');
  assert.equal(forged.w.document.getElementById('webRecovery').hidden,true);
 }finally{forged.close();}
 const invalid=await fixture({hash:'#type=recovery&error_code=otp_expired'});try{
  invalid.event('PASSWORD_RECOVERY');await invalid.submit();assert(!invalid.calls.some(c=>c[0]==='password'));
  assert.match(invalid.w.document.getElementById('webActivation').textContent,/expiredLink/);
 }finally{invalid.close();}
 const verified=await fixture({mfa:true});try{
  verified.event('PASSWORD_RECOVERY');assert.equal(verified.w.document.getElementById('webRecovery').hidden,false);
  assert.equal(verified.w.document.getElementById('communityPage').hidden,true);
  await verified.submit();assert(verified.calls.some(c=>c[0]==='mfa'));assert(!verified.calls.some(c=>c[0]==='password'));
  verified.allowMfa();await verified.submit();assert.equal(verified.calls.filter(c=>c[0]==='password').length,1);
  assert.equal(verified.calls.find(c=>c[0]==='signOut')[1].scope,'global');
  assert.equal(verified.w.document.getElementById('webRecoveryStatus').textContent,'resetDone');
  assert.equal(verified.w.document.getElementById('webRecoveryForm').elements.password.value,'');
  await verified.submit();assert.equal(verified.calls.filter(c=>c[0]==='password').length,1,'A completed form cannot reset twice');
 }finally{verified.close();}
 console.log('OK 2.1.1 recovery: provider-verified intent, expired/forged URL refusal, dedicated form, MFA gate, one submission and password cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
