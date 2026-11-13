'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const express=require('express');
const {createCommunity,mountCommunity}=require('../lib/community');
const M=require('../public/community-model');
const {fixture}=require('./test-v200-auth-security.cjs');
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-auth-http-')),f=fixture();let listener,community,snapshots=0;
 try{
  await f.client.auth.signOut();f.client.auth.stopAutoRefresh=()=>{};
  const baseRpc=f.client.rpc.bind(f.client);
  f.client.rpc=async(name,args)=>{
   if(name==='alm_ensure_identity')return {data:M.profile({id:f.user.id,handle:'fictional_http',display_name:'Fictional HTTP',discriminator:1})};
   if(name==='alm_register_device')return {data:{ok:true}};
   if(name==='alm_account_age_state')return {data:{recorded:true,adult:true,excludeAdult:true}};
   return baseRpc(name,args);
  };
  f.client.from=()=>{const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;};
  community=createCommunity({directory,getAnimes:()=>{snapshots++;return [];},clientFactory:()=>f.client,config:{url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'}});
  const app=express();app.use(express.json());mountCommunity(app,community);
  listener=app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
  const origin='http://127.0.0.1:'+listener.address().port;
  const request=async(endpoint,body)=>{
   const response=await fetch(origin+'/api/community/'+endpoint,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
   return {status:response.status,body:await response.json()};
  };
  let result=await request('auth',{mode:'login',email:f.user.email,password:'Fictional-http-pass-123!'});
  assert.equal(result.status,200);assert.equal(result.body.connected,false);assert.equal(result.body.mfaRequired,true);
  const attempt=result.body.mfa.attemptId;
  const pending=await request('status');assert.equal(pending.body.connected,false);assert.equal(pending.body.mfaRequired,true);assert.equal(pending.body.identity,null);
  assert(!f.calls.some(row=>row[0]==='alm_ensure_identity'),'No private profile RPC while the second factor is pending');
  result=await request('mfa/verify',{attemptId:attempt,factorId:f.primary,code:'000000'});assert.equal(result.status,400);assert.equal(result.body.error,'MFA_CODE_INVALID');
  result=await request('mfa/verify',{attemptId:attempt,factorId:f.backup,code:'123456'});assert.equal(result.status,200);
  snapshots=0;result=await request('status');assert.equal(snapshots,1,'One library snapshot per connected status refresh');assert.equal(result.status,200);assert.equal(result.body.connected,true);assert.equal(result.body.mfa.enabled,true);
  assert(!JSON.stringify(result.body).includes(f.session.access_token));
  result=await request('sensitive',{action:'revoke-session',target:f.primary,password:'fresh-password',factorId:f.backup,code:'123456'});
  // The fixture deliberately does not implement the destructive RPC. Prove
  // that HTTP forwarded the fresh proof and exact target before reaching it.
  assert.equal(result.status,400);
  assert(f.calls.some(row=>row[0]==='alm_begin_sensitive'&&row[1].p_action==='revoke-session'&&row[1].p_target===f.primary));
  assert(f.calls.some(row=>row[0]==='alm_approve_sensitive'));
  result=await request('logout',{});assert.equal(result.status,200);assert.equal((await request('status')).body.connected,false);
  assert(f.calls.some(row=>row[0]==='alm_logout_session'));
  console.log('OK V2 Auth HTTP: optional community auth routes, mandatory pending MFA, backup verification, sanitized status, fresh targeted authorization and server revocation on logout.');
 }finally{await community?.close();if(listener)await new Promise(resolve=>listener.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
