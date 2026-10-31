'use strict';
const assert=require('node:assert/strict'),{create}=require('../public/community-requests'),sessionAccess=require('../lib/community-session');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
(async()=>{
 let calls=0,clock=0,gate=deferred();const api=create(async(endpoint,method)=>{calls++;return method==='POST'?{ok:true}:gate.promise;},{now:()=>clock,ttl:10,timeout:1000});
 const reads=[api('status'),api('status'),api('status')];assert.equal(calls,1);gate.resolve({owner:'A'});await Promise.all(reads);await api('status');assert.equal(calls,1);
 clock=11;gate=deferred();const stale=api('status');await api('logout','POST');gate.resolve({owner:'A'});await assert.rejects(stale,/SESSION_EXPIRED/);
 const failing=create(async()=>{throw Error('fixture');});await assert.rejects(failing('status'),/fixture/);await assert.rejects(failing('status'),/fixture/);
 const hanging=create(()=>new Promise(()=>{}),{timeout:5});await assert.rejects(hanging('status'),/ALM_NETWORK/);
 let session={access_token:'A-token',user:{id:'A'}},verified=0,userGate=deferred();
 const access=sessionAccess({auth:{getSession:async()=>({data:{session}}),getUser:async()=>{verified++;return userGate.promise;}}},{now:()=>clock,ttl:10});
 const batch=[access.current(),access.current(),access.current()];await new Promise(setImmediate);assert.equal(verified,1);userGate.resolve({data:{user:{id:'A'}}});await Promise.all(batch);await access.current();assert.equal(verified,1);
 clock+=11;userGate=deferred();const old=access.current();await new Promise(setImmediate);session={access_token:'B-token',user:{id:'B'}};const fresh=access.current();await new Promise(setImmediate);userGate.resolve({data:{user:{id:'B'}}});await assert.rejects(old,/SESSION_EXPIRED/);assert.equal((await fresh).id,'B');assert.equal(verified,3);
 session=null;await assert.rejects(access.current(),/LOGIN_REQUIRED/);
 console.log('OK Beta73 requests: duplicate reads coalesced, short TTL, write invalidation, stale session rejection, error eviction, bounded waits and one server identity check per token burst.');
})().catch(error=>{console.error(error);process.exitCode=1;});
