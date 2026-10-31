'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createCommunity}=require('../lib/community'),M=require('../public/community-model');
const A='00000000-0000-0000-0000-000000000001';
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm65-sync-'));
 let remote=M.profile({id:A,display_name:'Fixture',handle:'u_fixture',discriminator:2,visibility:'friends',share_library:true,share_dna:true,share_activity:true}),fail=false,hold=null,release=null;
 let rows=[{malId:2,title:'Second',status:'Watching',score:9,genres:['Fantasy'],watchEvents:[{date:'2026-10-17',episodes:1}]},{malId:1,title:'First',status:'Completed',genres:['Drama']}];
 const requests=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:A,email:'fixture@invalid.test'}}}}),getUser:async()=>({data:{user:{id:A}}}),stopAutoRefresh(){}},
  from(){const chain={select(){return chain},eq(){return chain},is(){return chain},order(){return chain},limit(){return chain},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};return chain;},
  async rpc(name,args){
   if(name==='alm_ensure_identity')return {data:remote};
   if(name==='alm_register_device')return {data:{ok:true}};
   if(name==='alm_save_identity'){remote=M.profile({...args.p_profile,id:A,handle:remote.handle,discriminator:remote.discriminator});return {data:remote};}
   if(name==='alm_publish_profile'||name==='alm_refresh_shared_profile'){
    requests.push({name,args});if(hold){await hold;hold=null;}
    if(fail)return {error:{message:'ALM_NETWORK'}};
    if(name==='alm_publish_profile')remote=M.profile(args.p_profile);
    return {data:name==='alm_publish_profile'?null:{updated:true}};
   }
   throw Error('Unexpected RPC '+name);
  }};
 const c=createCommunity({directory,getAnimes:()=>rows,clientFactory:()=>client,config:{url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'}});
 try{
  await c.status();await c.saveProfile(remote);await c.publish();
  let s=await c.status();assert.equal(s.sync.dirty,false);assert.equal(s.sync.auto,true);
  rows.reverse();for(const row of rows)Object.assign(row,{...Object.fromEntries(Object.entries(row).reverse())});
  assert.equal((await c.status()).sync.dirty,false,'Same shared collection in another order stays current');
  rows[0].score=7;assert.equal((await c.status()).sync.dirty,true);
  await c.syncNow();assert.equal((await c.status()).sync.dirty,false,'Automatic publication acknowledges the exact sent data');
  hold=new Promise(r=>release=r);const publish=c.publish();while(!release||requests.length<3)await new Promise(r=>setTimeout(r,1));
  rows[0].episodesSeen=3;release();await publish;
  assert.equal((await c.status()).sync.dirty,true,'Changes made during an in-flight publication must remain pending');
  await c.publish();assert.equal((await c.status()).sync.dirty,false);
  fail=true;await assert.rejects(c.publish());assert((await c.status()).sync.error,'Failed manual publication is reported');
  fail=false;await c.publish();s=await c.status();assert.equal(s.sync.error,null);assert.equal(s.sync.dirty,false);
  await c.syncPreference(false);rows[0].score=4;const before=requests.length;await c.syncNow();assert.equal(requests.length,before,'Opt-out prevents automatic sends');
  assert.equal((await c.status()).sync.dirty,true);
  console.log('OK Beta65 sync: actual publication/status round trip, stable collection order, automatic acknowledgment, edits during send, failure/recovery and opt-out.');
 }finally{await c.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
