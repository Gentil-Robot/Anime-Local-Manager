'use strict';
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createAuthSecurity}=require('../community/auth-security');
const check=r=>{if(r.error)throw Error(r.error.code||r.error.message);return r.data;};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture({enabled=true}={}) {
 const user={id:randomUUID(),email:'fictional@example.invalid'},primary=randomUUID(),backup=randomUUID();
 const calls=[],factors=new Map(enabled?[[primary,{id:primary,name:'Primary',type:'totp'}],[backup,{id:backup,name:'Backup',type:'totp'}]]:[]);
 let current,clock=0,gate=null,rpcFailure=null,codeFailure=false,failUnenroll=false,changes=0,authenticated=false;
 const makeSession=level=>{const sid=randomUUID();return {user,refresh_token:randomUUID(),access_token:'x.'+Buffer.from(JSON.stringify({session_id:sid,aal:level})).toString('base64url')+'.x',level};};
 current=makeSession('aal1');
 const client={
  auth:{
   getSession:async()=>({data:{session:current}}),getUser:async()=>({data:{user:current?.user||null}}),
   async signInWithPassword(input){calls.push(['password',input]);if(input.password==='wrong')return {error:{code:'credentialsError'}};current=makeSession('aal1');authenticated=true;return {data:{session:current,user}};},
   async setSession(value){calls.push(['restore']);current={...value,user,level:'aal2'};return {data:{session:current}};},
   async signOut(){calls.push(['signOut']);current=null;return {data:{}};},
   async refreshSession(){calls.push(['refresh']);return {data:{session:current}};},
   mfa:{
    async challengeAndVerify(input){calls.push(['code',input.factorId]);if(gate)await gate.promise;if(codeFailure||input.code!=='123456')return {error:{code:'MFA_CODE_INVALID'}};current.level='aal2';current.factorId=input.factorId;current.access_token=current.access_token.replace(/\.x$/,'.renewed');return {data:{}};},
    async enroll(input){calls.push(['enroll',input]);const id=randomUUID();factors.set(id,{id,name:input.friendlyName,type:'totp',untrusted:true});return {data:{id,totp:{uri:'otpauth://totp/ALM?secret=JBSWY3DPEHPK3PXP',secret:'JBSWY3DPEHPK3PXP',qr_code:'<svg>never forward provider SVG</svg>'}}};},
    async listFactors(){return {data:{all:[...factors.values()]}};},
    async unenroll({factorId}){calls.push(['unenroll',factorId]);if(failUnenroll)return {error:{code:'MFA_CHANGE_INCOMPLETE'}};if(factors.has(factorId)&&!factors.get(factorId).untrusted&&current?.level!=='aal2')return {error:{code:'MFA_REQUIRED'}};factors.delete(factorId);if(current?.factorId===factorId){current.level='aal1';current.factorId=null;}return {data:{}};}
   }
  },
  async rpc(name,args){
   calls.push([name,args]);if(rpcFailure===name)return {error:{code:'ALM_NETWORK'}};
   if(name==='alm_security_state')return {data:{version:1,enabled,required:enabled&&current?.level!=='aal2',locked:false,currentLevel:current?.level,factors:[...factors.values()].filter(f=>!f.untrusted)}};
   if(name==='alm_begin_sensitive')return {data:{id:randomUUID()}};
   if(name==='alm_approve_sensitive'){assert(authenticated);return {data:{ok:true}};}
   if(name==='alm_confirm_mfa_enrollment'){factors.get(args.p_factor).untrusted=false;enabled=true;return this.rpc('alm_security_state',{});}
   if(name==='alm_authorize_factor_change')return {data:{ok:true}};
   if(name==='alm_finish_factor_change'){if(args.p_action==='mfa-disable')enabled=false;return {data:{ok:true}};}
   if(name==='alm_logout_session')return {data:{ok:true}};
   throw Error('Unexpected RPC: '+name);
  }
 };
 const security=createAuthSecurity(client,{check,changed:()=>changes++,now:()=>clock});
 return {client,security,calls,primary,backup,user,get session(){return current;},set level(value){current.level=value;},set gate(value){gate=value;},set clock(value){clock=value;},set failCode(value){codeFailure=value;},set failRpc(value){rpcFailure=value;},set failUnenroll(value){failUnenroll=value;},get changes(){return changes;}};
}
async function main() {
 {
  const f=fixture();f.client.rpc=async()=>({error:{code:'SESSION_EXPIRED'}});
  await assert.rejects(f.security.afterLogin({connected:true}),/SESSION_EXPIRED/);
  assert.equal(f.session,null,'A revoked login cannot be presented as connected');
 }
 {
  const f=fixture(),result=await f.security.afterLogin({connected:true});
  const verify=f.client.auth.mfa.challengeAndVerify.bind(f.client.auth.mfa);
  f.client.auth.mfa.challengeAndVerify=async input=>{const result=await verify(input);f.client.rpc=async()=>({error:{code:'SESSION_EXPIRED'}});return result;};
  await assert.rejects(f.security.verifyLogin({attemptId:result.mfa.attemptId,factorId:f.primary,code:'123456'}),/SESSION_EXPIRED/);
  assert.equal(f.session,null,'Revocation during verification is never a successful login');
 }
 {
  const f=fixture();const result=await f.security.authenticate(async()=>({connected:true,confirmationRequired:false}));
  assert.equal(result.connected,false);assert.equal(result.mfaRequired,true);assert.equal(result.mfa.factors.length,2);
  assert(result.mfa.attemptId);assert(!JSON.stringify(result).includes(f.session.access_token));
  await assert.rejects(f.security.verifyLogin({attemptId:result.mfa.attemptId,factorId:randomUUID(),code:'123456'}),/MFA_REQUIRED/);
  await assert.rejects(f.security.verifyLogin({attemptId:result.mfa.attemptId,factorId:f.primary,code:'wrong'}),/MFA_CODE_INVALID/);
  await f.security.verifyLogin({attemptId:result.mfa.attemptId,factorId:f.backup,code:'123456'});
  assert.equal((await f.security.state()).required,false);assert(f.changes>0);
 }
 {
  const f=fixture(),result=await f.security.afterLogin({connected:true});
  const gate=deferred();f.gate=gate;const verify=f.security.verifyLogin({attemptId:result.mfa.attemptId,factorId:f.primary,code:'123456'});
  await new Promise(setImmediate);const cancel=f.security.cancelLogin({attemptId:result.mfa.attemptId});
  gate.resolve();await verify;await cancel;assert.equal(f.session,null,'Closing a pending verification revokes the late successful login');
 }
 {
  const f=fixture(),result=await f.security.afterLogin({connected:true});
  await f.security.authenticate(async()=>{await f.client.auth.signInWithPassword({password:'fresh'});return {connected:true};});
  await f.security.cancelLogin({attemptId:result.mfa.attemptId});assert(f.session,'A stale dialog cannot sign out a newer login');
 }
 {
  const f=fixture();f.level='aal2';const previous=f.session;
  await assert.rejects(f.security.authorize('delete',null,{password:'fresh',factorId:f.primary,code:'000000'}),/MFA_CODE_INVALID/);
  assert.equal(f.session.access_token,previous.access_token);assert(f.calls.some(c=>c[0]==='alm_logout_session'));
  assert(!f.calls.some(c=>c[0]==='alm_approve_sensitive'));
  f.calls.length=0;
  await f.security.authorize('revoke-session',f.backup,{password:'fresh',factorId:f.primary,code:'123456'});
  assert(f.calls.findIndex(c=>c[0]==='alm_begin_sensitive')<f.calls.findIndex(c=>c[0]==='password'));
  assert(f.calls.findIndex(c=>c[0]==='code')<f.calls.findIndex(c=>c[0]==='alm_approve_sensitive'));
  assert.deepEqual(f.calls.find(c=>c[0]==='alm_begin_sensitive')[1],{p_action:'revoke-session',p_target:f.backup});
 }
 {
  const f=fixture({enabled:false});
  const setup=await f.security.enroll({password:'fresh',name:'My authenticator'});
  assert.equal(setup.secret,'JBSWY3DPEHPK3PXP');assert(!('qr_code'in setup));
  assert(!JSON.stringify(await f.security.state()).includes(setup.secret));
  await f.security.verifyEnrollment({factorId:setup.id,code:'123456'});
  assert.equal((await f.security.state()).enabled,true);
  await f.security.cancelEnrollment({factorId:setup.id});
  assert(!f.calls.some(c=>c[0]==='unenroll'&&c[1]===setup.id),'Closing a completed setup never removes the enrolled factor');
 }
 {
  const f=fixture({enabled:false}),setup=await f.security.enroll({password:'fresh'});
  await f.security.cancelEnrollment({factorId:setup.id});assert(f.calls.some(c=>c[0]==='unenroll'&&c[1]===setup.id));
  await assert.rejects(f.security.verifyEnrollment({factorId:setup.id,code:'123456'}),/REAUTH_REQUIRED/);
 }
 {
  const f=fixture({enabled:false}),setup=await f.security.enroll({password:'fresh'});f.clock=300000;
  await assert.rejects(f.security.verifyEnrollment({factorId:setup.id,code:'123456'}),/REAUTH_REQUIRED/);
 }
 {
  const f=fixture();f.level='aal2';f.failUnenroll=true;
  await assert.rejects(f.security.changeFactor({action:'disable',password:'fresh',factorId:f.backup,code:'123456'}),/MFA_CHANGE_INCOMPLETE/);
  assert(!f.calls.some(c=>c[0]==='alm_finish_factor_change'));
  assert.equal((await f.security.state()).enabled,true);
 }
 {
  const f=fixture();f.level='aal2';await f.security.changeFactor({action:'disable',password:'fresh',factorId:f.backup,code:'123456'});
  const approve=f.calls.findIndex(c=>c[0]==='alm_authorize_factor_change'),remove=f.calls.findIndex(c=>c[0]==='unenroll'),finish=f.calls.findIndex(c=>c[0]==='alm_finish_factor_change');
  assert(approve<remove&&remove<finish);assert.equal((await f.security.state()).enabled,false);
 }
 {
  const f=fixture();f.level='aal2';await f.security.changeFactor({action:'disable',password:'fresh',factorId:f.primary,code:'123456'});
  assert.deepEqual(f.calls.filter(c=>c[0]==='unenroll').map(c=>c[1]),[f.backup,f.primary],
   'Keep the current AAL2 factor until every other native factor is removed');
  assert.equal((await f.security.state()).enabled,false);
 }
 {
  const f=fixture();f.failRpc='alm_logout_session';
  await assert.rejects(f.security.logout(),/ALM_NETWORK/);
  assert.equal(f.session,null,'Local credentials are cleared even if server revocation cannot be confirmed');
 }
 {
  const f=fixture();f.level='aal2';const gate=deferred();let executing=false;
  const action=f.security.executeAuthorized('revoke',null,{password:'fresh',factorId:f.primary,code:'123456'},async()=>{
   executing=true;await gate.promise;assert(f.session,'The approved session remains available until the one-use action completes');return {ok:true};
  });
  while(!executing)await new Promise(setImmediate);
  const logout=f.security.logout();await new Promise(setImmediate);
  assert(!f.calls.some(c=>c[0]==='signOut'),'Logout waits for proof and execution together');
  gate.resolve();assert.equal((await action).ok,true);await logout;assert.equal(f.session,null);
 }
 console.log('OK V2 Auth client: required challenge, backup factor, code validation, cancellation races, fresh reauthentication, restoration on failure, QR secrecy, expiry, safe disable and explicit revocation failure.');
}
module.exports={fixture};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
