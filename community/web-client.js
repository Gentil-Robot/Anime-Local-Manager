import {createClient} from '@supabase/supabase-js';
import statsModule from './library-stats.js';
import sessionAccess from '../lib/community-session.js';
const {libraryStats}=statsModule;
const M=window.ALM_COMMUNITY_MODEL,S=window.ALM_COMMUNITY_SECURITY,A=window.ALM_COMMUNITY_AGE;
let client=null,profileDraft=null,ownItems=[],config={},identity=null,owner=null,deviceRegistered=false,access=null,ensurePending=null,ensuredAt=0,ownPending=null,ownValue=null,ownAt=0,dataEpoch=0,sessionOwner=null;
const favoriteDrafts=new Map();
async function accountAge(){try{return {...await rpc('alm_account_age_state'),available:true};}catch{return {available:false,recorded:false,adult:false,excludeAdult:true};}}
const check=result=>{if(result.error)throw Error(S.errorCode(result.error));if(result.data?.ok===false)throw Error(result.data.code||'INVALID_INPUT');return result.data;};
const one=r=>Array.isArray(r)?r[0]:r;
const callbackParams=new URLSearchParams(location.hash.slice(1)),callbackType=callbackParams.get('type'),callbackPresent=callbackParams.has('access_token')||callbackParams.has('error')||callbackParams.has('error_code')||new URLSearchParams(location.search).has('error')||new URLSearchParams(location.search).has('error_code');
const callbackSearch=new URLSearchParams(location.search),callbackError=callbackParams.has('error')||callbackParams.has('error_code')||callbackSearch.has('error')||callbackSearch.has('error_code'),recoveryIntent=callbackType==='recovery'||callbackSearch.get('type')==='recovery';
let recoveryVerified=false,recoveryCompleted=false;
const ready=fetch('/community-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('ALM_NETWORK');return r.json();}).then(c=>{config=c;if(c.url&&c.publishableKey){if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(c.url)||!c.publishableKey.startsWith('sb_publishable_'))throw Error('INVALID_INPUT');client=createClient(c.url,c.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});access=sessionAccess(client);client.auth.onAuthStateChange((event,session)=>{const nextOwner=session?.user?.id||null;if(event==='SIGNED_OUT'||sessionOwner&&nextOwner!==sessionOwner)setTimeout(()=>window.dispatchEvent(new CustomEvent('alm:community-session')),0);sessionOwner=nextOwner;if(['SIGNED_OUT','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event)){access.clear();dataEpoch++;ownValue=null;ownPending=null;ensurePending=null;ownAt=0;ensuredAt=0;}if(event==='SIGNED_IN')deviceRegistered=false;if(event==='SIGNED_OUT'){deviceRegistered=false;profileDraft=null;favoriteDrafts.clear();identity=null;owner=null;}if(event==='PASSWORD_RECOVERY'&&!callbackError){recoveryVerified=true;showRecoveryForm();}});}});
async function user(){await ready;if(!client)throw Error('ALM_COMMUNITY_NOT_READY');return access.current();}
async function rpc(name,args={}){await user();return check(await client.rpc(name,args));}
async function ensure(){const u=await user();if(identity&&owner===u.id&&Date.now()-ensuredAt<30000)return u;if(ensurePending)return ensurePending;ensurePending=loadIdentity().then(value=>{ensuredAt=Date.now();return value;}).finally(()=>{ensurePending=null;});return ensurePending;}
async function loadIdentity(){const epoch=dataEpoch,u=await user();if(owner!==u.id){profileDraft=null;favoriteDrafts.clear();owner=u.id;}const next=one(await rpc('alm_ensure_identity',{p_profile:profileDraft||{}}));if(epoch!==dataEpoch)throw Error('SESSION_EXPIRED');identity=next;if(!deviceRegistered){const platform=/Windows/.test(navigator.userAgent)?'Windows':/Android/.test(navigator.userAgent)?'Android':/iPhone|iPad/.test(navigator.userAgent)?'iOS':/Mac/.test(navigator.userAgent)?'macOS':/Linux/.test(navigator.userAgent)?'Linux':'Web';try{await rpc('alm_register_device',{p_name:'Web · '+platform,p_platform:'web'});deviceRegistered=true;}catch{deviceRegistered=true;}}return u;}
async function rows(id){const out=[];for(let n=0;n<20000;n+=500){const batch=check(await client.from('alm_library').select('*').eq('owner_id',id).order('mal_id').range(n,n+499));out.push(...batch);if(batch.length<500)break;}return out;}
async function own(){await ready;const session=client?check(await client.auth.getSession()):null;if(ownValue&&owner===session?.session?.user.id&&Date.now()-ownAt<10000)return ownValue;if(ownPending)return ownPending;const epoch=dataEpoch,request=loadOwn().then(value=>{if(epoch!==dataEpoch)throw Error('SESSION_EXPIRED');ownValue=value;ownAt=Date.now();return value;}).finally(()=>{if(ownPending===request)ownPending=null;});ownPending=request;return request;}
async function loadOwn(){await ready;if(!client)return {profile:M.profile(),items:[],summary:M.summary([]),dna:[],activity:[]};const s=check(await client.auth.getSession());if(!s?.session)return {profile:M.profile(),items:[],summary:M.summary([]),dna:[],activity:[]};const epoch=dataEpoch,u=await ensure();const [items,dna,activity,age]=await Promise.all([rows(u.id),client.from('alm_dna').select('data').eq('owner_id',u.id),client.from('alm_activity').select('data').eq('owner_id',u.id),accountAge()]);if(epoch!==dataEpoch)throw Error('SESSION_EXPIRED');ownItems=items.map(i=>favoriteDrafts.has(i.mal_id)?{...i,favorite:favoriteDrafts.get(i.mal_id)}:i);return {age,profile:profileDraft||M.profile(identity||{}),items:ownItems,summary:M.summary(ownItems),dna:check(dna)[0]?.data||[],activity:check(activity)[0]?.data||[],sharedActivity:check(activity)[0]?.data||[],sharedDna:check(dna)[0]?.data||[]};}
async function notifications(){const u=await user();const [f,r]=await Promise.all([client.from('alm_friendships').select('id,requester,recipient,status').eq('recipient',u.id).eq('status','pending'),client.from('alm_recommendations').select('id,anime,message,created_at,read_at').eq('recipient',u.id).is('read_at',null).order('created_at',{ascending:false}).limit(100)]);const requests=check(f)||[],recommendations=check(r)||[];return {count:requests.length+recommendations.length,requests,recommendations};}
window.ALM_COMMUNITY_WEB=true;
window.ALM_COMMUNITY_API=async(endpoint,method='GET',body={})=>{
 await ready;
 if(method!=='GET'){dataEpoch++;ownValue=null;ownPending=null;ensurePending=null;ownAt=0;ensuredAt=0;}
 if(endpoint==='status'){const session=client?check(await client.auth.getSession()):null;const [data,notices]=await Promise.all([own(),session?.session?notifications():{count:0,requests:[],recommendations:[]}]);return {configured:!!client,connected:!!session?.session,user:session?.session?{id:session.session.user.id,email:session.session.user.email}:null,identity,confirmed:!!session?.session,profileSaved:!!identity?.id,sync:{auto:false,publishedAt:identity?.visibility==='friends'?identity.updated_at:null,dirty:!!profileDraft||favoriteDrafts.size>0},captchaSiteKey:String(config.captchaSiteKey||''),publicEndpoint:String(config.publicEndpoint||''),notifications:notices,own:data};}
 if(endpoint==='auth'){if(!client)throw Error('ALM_COMMUNITY_NOT_READY');const {email,password,captchaToken}=body;if(!S.email(email))throw Error('INVALID_INPUT');if(body.mode==='signup'&&!S.password(password))throw Error('ALM_PASSWORD_WEAK');const data=check(await(body.mode==='signup'?client.auth.signUp({email,password,options:{data:{...A.metadata(body),...window.ALM_COMMUNITY_CHARTER.metadata(body)},emailRedirectTo:'https://animelocalmanager.com/confirmation.html',captchaToken}}):client.auth.signInWithPassword({email,password,options:{captchaToken}})));profileDraft=null;favoriteDrafts.clear();return {connected:!!data.session,confirmationRequired:!data.session};}
 if(endpoint==='age'){if(body.birthDate)A.declaration({birthDate:body.birthDate,ageAttested:body.attested});return rpc('alm_set_account_age',{p_birth_date:body.birthDate||null,p_attested:body.attested===true,p_exclude_adult:body.excludeAdult!==false});}
 if(endpoint==='logout'){if(client)check(await client.auth.signOut({scope:'local'}));profileDraft=null;favoriteDrafts.clear();identity=null;return {ok:true};}
 if(endpoint==='resend'){check(await client.auth.resend({type:'signup',email:body.email,options:{emailRedirectTo:'https://animelocalmanager.com/confirmation.html',captchaToken:body.captchaToken}}));return {ok:true};}
 if(endpoint==='recovery'){check(await client.auth.resetPasswordForEmail(body.email,{redirectTo:'https://animelocalmanager.com/compte.html',captchaToken:body.captchaToken}));return {ok:true};}
 if(endpoint==='profile'){const p=M.profile(body);if(/[#\x00-\x1f\x7f]/.test(p.display_name))throw Error('INVALID_INPUT');identity=one(await rpc('alm_save_identity',{p_profile:p}));profileDraft={...p,id:identity.id,handle:identity.handle,discriminator:identity.discriminator};return {...await own(),profile:profileDraft};}
 if(endpoint==='favorite'){const data=await own(),id=Number(body.malId);if(!data.items.some(i=>i.mal_id===id))throw Error('ALM_COMMUNITY_ANIME');favoriteDrafts.set(id,body.value===true);return own();}
 if(endpoint==='publish'){const data=M.shared(await own());await rpc('alm_publish_profile',{p_profile:data.profile,p_items:data.items,p_dna:data.dna,p_activity:data.activity});profileDraft=null;favoriteDrafts.clear();return {ok:true};}
 if(endpoint==='withdraw'){await rpc('alm_withdraw_profile');profileDraft=null;favoriteDrafts.clear();return {ok:true};}
 if(endpoint==='friends'&&method==='GET'){const u=await user(),relationships=check(await client.from('alm_friendships').select('*').or('requester.eq.'+u.id+',recipient.eq.'+u.id).order('created_at',{ascending:false}));return {userId:u.id,relationships,cards:await rpc('alm_friend_cards'),libraryStats:await libraryStats(client,u.id,relationships)};}
 if(endpoint==='friends')return rpc('alm_request_friend_v2',{p_identifier:body.handle});
 if(endpoint.startsWith('friends/'))return rpc('alm_friend_action',{p_id:endpoint.split('/')[1],p_action:body.action});
 if(endpoint==='sessions'){await ensure();return rpc('alm_sessions');}
 if(/^sessions\/[a-f0-9-]{36}\/revoke$/i.test(endpoint))return rpc('alm_revoke_session',{p_session:endpoint.split('/')[1]});
 if(endpoint==='sensitive'){if(!['delete','revoke'].includes(body.action))throw Error('INVALID_INPUT');const u=await user();check(await client.auth.signInWithPassword({email:u.email,password:body.password,options:{captchaToken:body.captchaToken}}));await rpc(body.action==='delete'?'alm_delete_account':'alm_revoke_other_sessions',body.action==='delete'?{p_confirm:'DELETE'}:{});if(body.action==='delete'){await client.auth.signOut({scope:'local'});identity=null;profileDraft=null;favoriteDrafts.clear();}return {ok:true};}
 if(endpoint.startsWith('profiles/')){const id=endpoint.split('/')[1];if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('INVALID_INPUT');await user();const p=check(await client.from('alm_profiles').select('*').eq('id',id));if(!p.length)throw Error('ALM_COMMUNITY_PROFILE_PRIVATE');const items=await rows(id),[dna,activity]=await Promise.all([client.from('alm_dna').select('data').eq('owner_id',id),client.from('alm_activity').select('data').eq('owner_id',id)]);return {profile:M.profile(p[0]),items,summary:M.summary(items),dna:check(dna)[0]?.data||[],activity:check(activity)[0]?.data||[],comparison:M.compare((await own()).items,items,check(dna)[0]?.data)};}
 if(endpoint==='recommendations'&&method==='GET'){const u=await user();return {userId:u.id,items:check(await client.from('alm_recommendations').select('*').eq('recipient',u.id).order('created_at',{ascending:false}).limit(100))};}
 if(endpoint==='recommendations'){const mine=await own(),anime=mine.items.find(i=>i.mal_id===Number(body.malId));if(!anime)throw Error('ALM_COMMUNITY_ANIME');if(!M.shareAllowed(anime,mine.age))throw Error('CONTENT_NOT_SHARED');return rpc('alm_recommend',{p_recipient:body.recipient,p_anime:{mal_id:anime.mal_id,title:anime.title,image_url:M.poster(anime.image_url)},p_message:body.message});}
 if(endpoint.endsWith('/read'))return rpc('alm_read_recommendation',{p_id:endpoint.split('/')[1]});
 throw Error('INVALID_INPUT');
};
let activationState='';
function renderActivation(){
 const panel=document.getElementById('webActivation');
 if(!panel||!activationState)return;
 const language=window.ALM_DESIGN.language();
 panel.textContent=window.ALM_COMMUNITY_T(activationState)+(language==='en'?'':'\n\n'+window.ALM_COMMUNITY_COPY.en[activationState]);
 if(activationState==='expiredLink'){
  const retry=document.createElement('a');
  retry.href='/compte.html?action=login';
  retry.className='primary';
  retry.textContent=window.ALM_COMMUNITY_T('login');
  panel.append(retry);
 }
}
function isolateRecoveryPage(){
 document.body.classList.add('alm-recovery-mode');
 const landing=document.getElementById('webLanding');if(landing)landing.hidden=true;
 const community=document.getElementById('communityPage');if(community)community.hidden=true;
}
function showRecoveryForm(){
 if(callbackError||recoveryCompleted)return;
 isolateRecoveryPage();
 const activation=document.getElementById('webActivation');if(activation)activation.hidden=true;
 const panel=document.getElementById('webRecovery');
 if(!panel)return;
 panel.hidden=false;
 panel.scrollIntoView?.({block:'start'});
}
function showExpiredRecoveryLink(){
 if(recoveryCompleted)return;
 recoveryVerified=false;
 isolateRecoveryPage();
 const recovery=document.getElementById('webRecovery');if(recovery)recovery.hidden=true;
 const panel=document.getElementById('webActivation');
 if(panel){panel.hidden=false;activationState='expiredLink';renderActivation();panel.scrollIntoView?.({block:'start'});}
}
window.addEventListener('alm:language-changed',renderActivation);
window.addEventListener('DOMContentLoaded',async()=>{
 const form=document.getElementById('webRecoveryForm'),status=document.getElementById('webRecoveryStatus');
 if(form)form.onsubmit=async ev=>{
  ev.preventDefault();
  if(!recoveryVerified||callbackError||recoveryCompleted){showExpiredRecoveryLink();return;}
  const button=form.querySelector('button[type=submit]');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  const data=new FormData(form),password=data.get('password');
  try{
   if(password!==data.get('confirm_password'))throw Error('ALM_PASSWORD_MISMATCH');
   if(!S.password(password))throw Error('ALM_PASSWORD_WEAK');
   await user();
   check(await client.auth.updateUser({password}));
   recoveryCompleted=true;
   form.reset();
   form.classList.add('is-complete');
   status.textContent=window.ALM_COMMUNITY_T('resetDone');
   // The one-time recovery session is not needed after changing the password.
   try{await client.auth.signOut({scope:'local'});}catch{}
  }catch(error){
   status.textContent=window.ALM_COMMUNITY_ERROR(error);
   if(button)button.disabled=false;
  }
 };
 if(callbackError)showExpiredRecoveryLink();
 else if(recoveryVerified)showRecoveryForm();
 else if(recoveryIntent){
  isolateRecoveryPage();
  const panel=document.getElementById('webActivation');
  if(panel){panel.hidden=false;activationState='running';renderActivation();}
  try{await ready;await client?.auth.getSession();}catch{}
  setTimeout(()=>{if(!recoveryVerified&&!recoveryCompleted)showExpiredRecoveryLink();},1500);
 }
 else if(document.getElementById('webActivation')&&(location.pathname==='/confirmation.html'||callbackPresent)){
  const panel=document.getElementById('webActivation');
  panel.hidden=false;
  const landing=document.getElementById('webLanding');if(landing)landing.hidden=true;
  panel.textContent=window.ALM_COMMUNITY_T('running');
  try{
   await ready;
   const u=await user();
   if(!u.email_confirmed_at)throw Error('SESSION_EXPIRED');
   activationState='activationSuccess';
   renderActivation();
   panel.scrollIntoView({block:'start'});
  }catch{activationState='expiredLink';renderActivation();}
 }
 if(callbackType||callbackPresent||callbackSearch.has('code')){
  try{await ready;await client?.auth.getSession();}finally{history.replaceState(null,'',location.pathname);}
 }
});
