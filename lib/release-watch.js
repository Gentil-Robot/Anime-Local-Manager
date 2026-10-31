'use strict';
const fs=require('node:fs'),{atomicJson}=require('./atomic-file'),{boundedTextFetch}=require('./bounded-text-fetch');
const {withAniListFetch}=require('./anilist-fetch');
const POS=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;
const linkedMedia=require('./media-link');
// Use exact provider IDs and official broadcast times. Streaming availability may differ.
async function providerBatch(animes,now,fetchImpl=global.fetch){
 const since=Math.floor(now/1000)-7*86400,until=Math.floor(now/1000)+30*86400;
 const request=async fields=>{const {response,text}=await boundedTextFetch('https://graphql.anilist.co',{timeoutMs:12000,maxBytes:2*1024*1024,maxRedirects:0,fetchImpl:withAniListFetch(fetchImpl),method:'POST',headers:{'Content-Type':'application/json','User-Agent':'AnimeLocalManager/'+require('../package.json').version},body:JSON.stringify({query:'query{'+fields+'}'})});if(!response.ok)throw Error('ALM_AIRING_SOURCE');const data=JSON.parse(text);if(data.errors?.length&&!data.data)throw Error('ALM_AIRING_SOURCE');return data;};
 const fields=animes.map((a,i)=>POS(a.anilistId)||POS(a.malId)?`a${i}:Media(${POS(a.anilistId)?'id:'+POS(a.anilistId):'idMal:'+POS(a.malId)},type:ANIME){id idMal}`:'').filter(Boolean).join('\n');
 if(!fields)return animes.map(a=>({animeId:a.id,unavailable:true}));
 const data=await request(fields),valid=(a,m)=>m&&POS(m.id)&&(!POS(a.malId)||m.idMal===POS(a.malId))&&(!POS(a.anilistId)||m.id===POS(a.anilistId));
 const query=animes.map((a,i)=>{const m=data.data?.['a'+i];return valid(a,m)?`a${i}:Page(page:1,perPage:50){airingSchedules(mediaId:${m.id},airingAt_greater:${since},airingAt_lesser:${until},sort:AIRING_AT){episode airingAt}}`:'';}).filter(Boolean).join('\n');
 const schedule=query?await request(query):{data:{}};
 return animes.map((a,i)=>{const m=data.data?.['a'+i],page=schedule.data?.['a'+i];if(!valid(a,m)||!page)return {animeId:a.id,unavailable:true};return {animeId:a.id,entries:(page.airingSchedules||[]).filter(s=>POS(s.episode)&&Number.isSafeInteger(s.airingAt)&&s.airingAt>=since&&s.airingAt<=until).map(s=>({key:m.id+':'+s.episode,animeId:a.id,title:a.title,poster:a.poster||'',episode:s.episode,airingAt:s.airingAt,source:'AniList'}))};});
}
const providerBatchWithFallback=(animes,now,fetchImpl)=>require('./calendar-sources').withFallback(providerBatch,animes,now,fetchImpl);
function createReleaseWatch({stateFile,getAnimes,fetchBatch=providerBatchWithFallback,now=Date.now}){
 let saved={enabled:false,chosen:false,seen:{},items:[],checkedAt:'',error:'',cursor:0},pending=null,notify=null,timer=null,deliveryPending=null;
 try{const input=JSON.parse(fs.readFileSync(stateFile,'utf8'));saved={...saved,...input,chosen:input.chosen===undefined?typeof input.enabled==='boolean':input.chosen===true,seen:input.seen&&typeof input.seen==='object'?input.seen:{},items:Array.isArray(input.items)?input.items:[]};}catch{}
 const write=()=>atomicJson(stateFile,saved),watched=()=>getAnimes().filter(a=>a.status==='Watching'&&a.followReleases!==false);
 const state=()=>{const all=watched(),ids=new Set(all.map(a=>a.id));return {enabled:saved.enabled,chosen:saved.chosen,checkedAt:saved.checkedAt,error:saved.error,running:!!pending,source:[...new Set(saved.items.map(i=>i.source).filter(Boolean))].join(' / ')||'AniList',unlinked:all.filter(a=>!POS(a.malId)&&!POS(a.anilistId)).length,items:saved.items.filter(i=>ids.has(i.animeId)&&linkedMedia.compatible(i,all.find(a=>a.id===i.animeId))&&i.airingAt>=Math.floor(now()/1000)-7*86400).sort((a,b)=>a.airingAt-b.airingAt)};};
 const episodeKey=i=>{const a=getAnimes().find(a=>a.id===i.animeId);return POS(i.episode)?(POS(a?.malId)?'mal:'+POS(a.malId)+':'+i.episode:POS(a?.anilistId)?POS(a.anilistId)+':'+i.episode:i.key):i.key;};
 function unseen(){if(!saved.enabled)return [];const all=new Map(getAnimes().map(a=>[a.id,a]));return state().items.filter(i=>!i.estimated&&i.airingAt*1000<=now()&&!saved.seen[i.key]&&!saved.seen[episodeKey(i)]&&i.episode>(Number(all.get(i.animeId)?.episodesSeen)||0));}
 function ack(key){const item=unseen().find(i=>i.key===key);if(!item)return false;saved.seen[key]=now();saved.seen[episodeKey(item)]=now();write();return true;}
 async function deliver(){if(deliveryPending)return deliveryPending;deliveryPending=(async()=>{if(saved.enabled&&notify)for(const item of unseen().slice(-5))try{if(await notify(item))ack(item.key);}catch{}})().finally(()=>{deliveryPending=null;});return deliveryPending;}
 const signature=()=>JSON.stringify(watched().map(a=>[a.id,linkedMedia.identity(a)]).sort((a,b)=>Number(a[0])-Number(b[0])));
 async function check(force=false){if(pending)return pending;if(!force&&saved.checkedAt&&saved.trackedSignature===signature()&&now()-Date.parse(saved.checkedAt)<15*60000){await deliver();return state();}
  pending=(async()=>{for(const item of saved.items)if(saved.seen[item.key])saved.seen[episodeKey(item)]=saved.seen[item.key];const trackedSignature=signature(),all=watched().filter(a=>POS(a.malId)||POS(a.anilistId));let success=false,errors=0;if(!all.length){saved.items=[];saved.error='';saved.checkedAt=new Date(now()).toISOString();write();return state();}
   // Rotate very large collections; six batches use at most twelve source requests.
   const start=(Number(saved.cursor)||0)%all.length,selected=all.slice(start,start+120);saved.cursor=start+120>=all.length?0:start+120;
   for(let i=0;i<selected.length;i+=20)try{const batch=await fetchBatch(selected.slice(i,i+20),now());for(const row of batch){if(row.unavailable){errors++;continue;}const original=selected.find(a=>a.id===row.animeId),latest=getAnimes().find(a=>a.id===row.animeId);if(!original||!linkedMedia.compatible({canonicalIdentity:linkedMedia.identity(original)},latest))continue;success=true;saved.items=saved.items.filter(x=>x.animeId!==row.animeId).concat(row.entries.map(item=>({...item,canonicalIdentity:linkedMedia.identity(original)})));}}catch{errors++;break;}
   saved.items=saved.items.filter(i=>all.some(a=>a.id===i.animeId)&&i.airingAt>=Math.floor(now()/1000)-7*86400);saved.checkedAt=new Date(now()).toISOString();saved.trackedSignature=trackedSignature;saved.error=errors?(success?'ALM_AIRING_PARTIAL':'ALM_AIRING_SOURCE'):'';
   for(const [key,time]of Object.entries(saved.seen))if(now()-Number(time)>90*86400000)delete saved.seen[key];write();
   await deliver();return state();
  })().finally(()=>{pending=null;});return pending;
 }
 function invalidate(ids){const changed=new Set(ids.map(Number));saved.items=saved.items.filter(i=>!changed.has(Number(i.animeId)));saved.trackedSignature='';write();}
 return {state,check,unseen,ack,invalidate,configure(enabled){saved.enabled=enabled===true;saved.chosen=true;write();return state();},start(callback){notify=callback;if(timer)return;timer=setInterval(()=>{if(saved.enabled)check().catch(()=>{});},15*60000);timer.unref?.();if(saved.enabled)check().catch(()=>{});},stop(){clearInterval(timer);timer=null;notify=null;}};
}
module.exports={providerBatch,providerBatchWithFallback,createReleaseWatch};
