'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),M=require('../public/community-model'),upgrade=require('../lib/community-account');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
function fixture(options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm62-sync-')),state={user:A,profile:M.profile({id:A,display_name:'Fixture',handle:'fixture',discriminator:1,visibility:'friends',share_library:true,featured:[]}),rows:M.items([{malId:1,title:'First anime'}]),remote:null,auto:0,manual:0,payloads:[],loaded:!options.wait};
 state.remote={...state.profile};let release;const ready=options.wait?new Promise(r=>release=()=>{state.loaded=true;r();}):Promise.resolve();
 const own=()=>{assert(state.loaded,'Do not read a library before database readiness');return {profile:state.profile,items:state.rows,dna:[],activity:[]};},digest=()=>require('../lib/community-snapshot').snapshotHash(M.shared(own()));
 fs.writeFileSync(path.join(directory,'community-sync.json'),JSON.stringify({owner:A,auto:true,publishedAt:'2026-10-17',lastHash:'previous',...options.sync}));
 const pending=[],intervals=[],cleared=[],timers={setTimeout(fn,delay){const h={fn,delay,unref(){}};pending.push(h);return h;},setInterval(fn,delay){const h={fn,delay,unref(){}};intervals.push(h);return h;},clearTimeout(h){cleared.push(h);},clearInterval(h){cleared.push(h);}};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:state.user}}}})},rpc:async(name,args)=>({data:[name==='alm_save_identity'?(state.remote={...args.p_profile}):{...state.remote}]})};
 const api={status:async()=>({connected:true,own:own()}),saveProfile(p){state.profile=M.profile(p);return own();},publish:async()=>{state.manual++;return {ok:true,snapshotHash:digest()};},refreshShared:async()=>{state.beforeRefresh?.();if(state.remote.visibility!=='friends')return {updated:false,reason:'private'};if(state.fail)throw Error('ALM_NETWORK');state.auto++;state.payloads.push(M.shared(own()));return {updated:true,snapshotHash:digest()};},withdraw:async()=>({ok:true}),close:async()=>{}};
 upgrade({api,client,current:async()=>({id:state.user}),check:r=>r.data,own,directory,getProfile:()=>state.profile,setProfile:p=>{state.profile=M.profile(p);},config:{},timers,ready:()=>ready});
 return {api,state,pending,intervals,cleared,release,stored:()=>JSON.parse(fs.readFileSync(path.join(directory,'community-sync.json'))),async close(){await api.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
(async()=>{
 let f=fixture({wait:true});try{
  assert.equal(f.pending[0].delay,0);assert.equal(f.intervals[0].delay,300000);
  const started=f.pending[0].fn();await Promise.resolve();assert.equal(f.state.auto,0);f.release();await started;assert.equal(f.state.auto,1);
  await f.intervals[0].fn();assert.equal(f.state.auto,1);f.state.rows.push(M.item({malId:20,title:'Second'}));await f.intervals[0].fn();assert.equal(f.state.auto,2);
  await f.api.syncPreference(false);f.state.rows.push(M.item({malId:21,title:'Third'}));await f.api.syncNow();assert.equal(f.state.auto,2);assert.equal(f.stored().auto,false);
 }finally{await f.close();assert.equal(f.cleared.length,2);}
 f=fixture({sync:{auto:false,publishedAt:null}});try{await f.pending[0].fn();assert.equal(f.state.auto,0);await f.api.publish();assert.equal(f.stored().auto,true);f.state.rows.push(M.item({malId:20,title:'New'}));await f.api.syncNow();assert.equal(f.state.auto,1);await f.api.saveProfile({...f.state.profile,visibility:'private'});assert.equal(f.stored().auto,false);}finally{await f.close();}
 f=fixture();try{f.state.user=B;await f.api.syncNow();assert.equal(f.state.auto,0);}finally{await f.close();}
 f=fixture();try{f.state.remote.visibility='private';await f.api.syncNow();assert.equal(f.state.auto,0);assert.equal(f.stored().auto,false);}finally{await f.close();}
 f=fixture();try{f.state.profile.featured=[1];f.state.remote.share_library=false;await f.api.syncNow();assert.deepEqual(f.state.payloads[0].items,[]);}finally{await f.close();}
 f=fixture();try{f.state.beforeRefresh=()=>{f.state.remote.visibility='private';};await f.api.syncNow();assert.equal(f.state.auto,0);assert.equal(f.stored().auto,false);}finally{await f.close();}
 f=fixture();try{f.state.fail=true;assert.equal((await f.api.syncNow()).error,'ALM_NETWORK');f.state.fail=false;await f.api.syncNow();assert.equal(f.state.auto,1);}finally{await f.close();}
 console.log('OK Beta62 sync: startup, database readiness, five-minute interval, changed data only, explicit sharing, opt-out, account isolation, remote privacy, showcase permissions and offline recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
