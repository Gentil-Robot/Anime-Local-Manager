'use strict';
const fs=require('node:fs'),path=require('node:path'),{snapshotHash}=require('./community-snapshot');
const {atomicJson}=require('./atomic-file'),M=require('../public/community-model'),S=require('../public/community-security');
module.exports=function upgrade({api,client,current,check,own,directory,getProfile,setProfile,config,authSecurity,device=null,timers=globalThis,ready=async()=>{}}){
 const file=path.join(directory,'community-sync.json');let sync={auto:false,lastHash:'',publishedAt:null,owner:null},identity=null,lastError=null,inflight=null,deviceRegistered=false;
 try{sync={...sync,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch(error){if(error.code!=='ENOENT')sync={auto:false,lastHash:'',publishedAt:null,owner:null};}
 const save=()=>atomicJson(file,sync);
 const digest=()=>snapshotHash(M.shared(own()));
 const rpc=async(name,args={})=>{await current();const data=check(await client.rpc(name,args));if(data?.ok===false)throw Error(data.code||'INVALID_INPUT');return data;};
 const one=r=>Array.isArray(r)?r[0]:r;
 let ensurePending=null,ensuredOwner=null,ensuredAt=0;
 async function ensure(force=false){const user=await current();if(!force&&ensuredOwner===user.id&&identity&&Date.now()-ensuredAt<30000)return user;if(ensurePending)return ensurePending;ensurePending=loadIdentity().then(value=>{ensuredOwner=value.id;ensuredAt=Date.now();return value;}).finally(()=>{ensurePending=null;});return ensurePending;}
 async function loadIdentity(){const user=await current();identity=one(await rpc('alm_ensure_identity',{p_profile:getProfile()}));if(identity){if(sync.owner!==user.id){deviceRegistered=false;sync={auto:false,lastHash:'',publishedAt:null,owner:user.id};setProfile({...M.profile(identity),...(!getProfile().id?{bio:getProfile().bio,avatar:getProfile().avatar,avatar_image:getProfile().avatar_image,banner:getProfile().banner}:{})});save();}else setProfile({...getProfile(),id:identity.id,handle:identity.handle,discriminator:identity.discriminator});}if(device&&!deviceRegistered){try{await rpc('alm_register_device',{p_name:String(device.name||'ALM').slice(0,80),p_platform:['win32','linux','darwin','web'].includes(device.platform)?device.platform:'other'});deviceRegistered=true;}catch{deviceRegistered=true;}}return user;}
 const baseAuth=api.auth,baseLogout=api.logout;if(baseAuth)api.auth=async input=>{deviceRegistered=false;ensuredAt=0;return authSecurity?authSecurity.authenticate(()=>baseAuth(input)):baseAuth(input);};if(baseLogout)api.logout=async()=>{deviceRegistered=false;ensuredOwner=null;identity=null;ensuredAt=0;return baseLogout();};
 const baseStatus=api.status,baseSave=api.saveProfile,basePublish=api.publish,baseWithdraw=api.withdraw,baseClose=api.close;
 api.status=async()=>{const status=await baseStatus({includeOwn:false});let notifications={count:0,requests:[],recommendations:[]};if(status.connected){[, ,notifications]=await Promise.all([ensure(),api.age?.(),api.notifications()]);}status.own=own();return {...status,identity:status.connected?identity:null,confirmed:status.connected,profileSaved:status.connected&&!!identity?.id,sync:{auto:sync.auto===true,publishedAt:sync.publishedAt,dirty:!!sync.publishedAt&&digest()!==sync.lastHash,error:lastError},captchaSiteKey:String(config.captchaSiteKey||''),publicEndpoint:String(config.publicEndpoint||''),notifications};};
 api.saveProfile=async input=>{const next=M.profile(input);if(!next.display_name||/[#\x00-\x1f\x7f]/.test(next.display_name))throw Error('INVALID_INPUT');const session=client?check(await client.auth.getSession()):null;if(session?.session){const p=one(await rpc('alm_save_identity',{p_profile:next}));identity=p;if(p)Object.assign(next,{id:p.id,handle:p.handle,discriminator:p.discriminator});}const result=baseSave(next);if(next.visibility!=='friends'){sync.auto=false;save();}return result;};
 api.publish=()=>{if(inflight)return inflight;inflight=(async()=>{await ready();await ensure();const first=!sync.publishedAt;const result=await basePublish();sync.lastHash=result.snapshotHash||digest();sync.publishedAt=new Date().toISOString();if(first&&getProfile().visibility==='friends')sync.auto=true;lastError=null;save();const {snapshotHash,...response}=result;return response;})().catch(error=>{lastError=S.errorCode(error);throw error;}).finally(()=>{inflight=null;});return inflight;};
 api.publicConfig=()=>({captchaSiteKey:String(config.captchaSiteKey||''),publicEndpoint:String(config.publicEndpoint||'')});
 api.withdraw=async()=>{const result=await baseWithdraw();sync.auto=false;sync.lastHash='';sync.publishedAt=null;save();return result;};
 api.resend=async(email,captchaToken)=>{if(!S.email(email))throw Error('INVALID_INPUT');check(await client.auth.resend({type:'signup',email,options:{emailRedirectTo:'https://animelocalmanager.com/confirmation.html',captchaToken}}));return {ok:true};};
 api.request=async identifier=>rpc('alm_request_friend_v2',{p_identifier:String(identifier||'').trim().slice(0,90)});
 api.notifications=async()=>{const user=await current();const [f,r]=await Promise.all([client.from('alm_friendships').select('id,requester,recipient,status').eq('recipient',user.id).eq('status','pending'),client.from('alm_recommendations').select('id,anime,message,created_at,read_at').eq('recipient',user.id).is('read_at',null).order('created_at',{ascending:false}).limit(100)]);const requests=check(f)||[],recommendations=check(r)||[];return {count:requests.length+recommendations.length,requests,recommendations};};
 api.sessions=async()=>{await ensure();return rpc('alm_sessions');};
 api.revokeSession=id=>{if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('INVALID_INPUT');return rpc('alm_revoke_session',{p_session:id});};
 api.sensitive=async(action,password,captchaToken,proof={})=>{if(!['delete','revoke','revoke-session'].includes(action))throw Error('INVALID_INPUT');await current();if(!authSecurity)throw Error('ALM_SECURITY_UPDATE_REQUIRED');await authSecurity.executeAuthorized(action,action==='revoke-session'?proof.target:null,{password,captchaToken,factorId:proof.factorId,code:proof.code},()=>rpc(action==='delete'?'alm_delete_account':action==='revoke-session'?'alm_revoke_session':'alm_revoke_other_sessions',action==='delete'?{p_confirm:'DELETE'}:action==='revoke-session'?{p_session:proof.target}:{}));if(action==='delete'){await client.auth.signOut({scope:'local'});identity=null;sync={auto:false,lastHash:'',publishedAt:null,owner:null};save();baseSave({...getProfile(),id:'',discriminator:null,handle:'',visibility:'private',share_library:false,share_favorites:false,share_watching:false,share_dna:false,share_activity:false});}return {ok:true};};
 api.mfaState=()=>authSecurity.state();
 api.mfaVerify=input=>authSecurity.verifyLogin(input);
 api.mfaCancel=input=>authSecurity.cancelLogin(input);
 api.mfaEnroll=input=>authSecurity.enroll(input);
 api.mfaEnrollVerify=input=>authSecurity.verifyEnrollment(input);
 api.mfaEnrollCancel=input=>authSecurity.cancelEnrollment(input);
 api.mfaChange=input=>authSecurity.changeFactor(input);
 api.syncPreference=async enabled=>{const user=await current();if(enabled===true&&(!sync.publishedAt||getProfile().visibility!=='friends'))throw Error('INVALID_INPUT');sync.owner=user.id;sync.auto=enabled===true;save();return {ok:true};};

 let syncing=null,closed=false;
 api.syncNow=()=>{
  if(syncing)return syncing;
  syncing=(async()=>{
   if(closed||!client||!sync.auto||!sync.publishedAt||getProfile().visibility!=='friends')return {updated:false};
   await ready();await api.age?.();if(closed||!sync.auto||digest()===sync.lastHash)return {updated:false};
   const session=check(await client.auth.getSession());if(!session?.session||session.session.user.id!==sync.owner)return {updated:false};
   await ensure(true);
   // The automatic RPC checks the latest server permissions under the actor lock.
   if(identity?.visibility!=='friends'){sync.auto=false;setProfile({...getProfile(),visibility:'private'});save();return {updated:false};}
   const next={...getProfile()};for(const key of ['library','favorites','watching','dna','activity'])next['share_'+key]=next['share_'+key]===true&&identity['share_'+key]===true;
   next.featured=next.featured.filter(id=>Array.isArray(identity.featured)&&identity.featured.includes(id));setProfile(next);
   if(closed||!sync.auto||digest()===sync.lastHash)return {updated:false};
   const result=await api.refreshShared();if(!result.updated){if(result.reason==='private'){sync.auto=false;save();}return {updated:false};}
   sync.lastHash=result.snapshotHash||digest();sync.publishedAt=new Date().toISOString();lastError=null;save();return {updated:true};
  })().catch(error=>{lastError=S.errorCode(error);return {updated:false,error:lastError};}).finally(()=>{syncing=null;});return syncing;
 };
 const startup=timers.setTimeout(()=>api.syncNow(),0),timer=timers.setInterval(()=>api.syncNow(),5*60*1000);startup.unref?.();timer.unref?.();
 api.close=async()=>{closed=true;timers.clearTimeout(startup);timers.clearInterval(timer);await baseClose();};
 return api;
};
