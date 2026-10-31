'use strict';
const {boundedTextFetch,singleFlight}=require('./bounded-text-fetch');
const positive=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;
const fields='alternative_titles,synopsis,mean,rank,popularity,num_list_users,num_episodes,start_date,end_date,media_type,genres,studios,average_episode_duration,related_anime,recommendations,broadcast,status';
function malToJikan(m){
 if(!positive(m?.id)||!String(m.title||'').trim())throw Error('ALM_PROVIDER_IDENTITY');
 return {mal_id:Number(m.id),title:m.title,title_english:m.alternative_titles?.en||'',title_japanese:m.alternative_titles?.ja||'',title_synonyms:m.alternative_titles?.synonyms||[],synopsis:m.synopsis||'',score:m.mean||null,rank:m.rank||null,popularity:m.popularity||null,members:m.num_list_users||null,episodes:m.num_episodes||null,type:({tv:'TV',movie:'Movie',ova:'OVA',ona:'ONA',special:'Special',music:'Music'})[m.media_type]||m.media_type||'',genres:m.genres||[],studios:(m.studios||[]).map(s=>({mal_id:s.id,name:s.name})),images:{jpg:{large_image_url:m.main_picture?.large||m.main_picture?.medium||''}},aired:{from:m.start_date||'',to:m.end_date||''},duration:m.average_episode_duration?Math.round(m.average_episode_duration/60)+' min':'',status:m.status==='currently_airing'?'Currently Airing':m.status==='not_yet_aired'?'Not yet aired':'Finished Airing',url:'https://myanimelist.net/anime/'+m.id,broadcast:m.broadcast?{day:String(m.broadcast.day_of_the_week||'').replace(/^./,s=>s.toUpperCase())+'s',time:m.broadcast.start_time,timezone:'Asia/Tokyo'}:null,relations:(m.related_anime||[]).map(r=>({relation:r.relation_type_formatted||r.relation_type,entry:[{mal_id:r.node?.id,type:'anime',name:r.node?.title,url:'https://myanimelist.net/anime/'+r.node?.id}]})),recommendations:(m.recommendations||[]).map(r=>({entry:{mal_id:r.node?.id,title:r.node?.title,images:{jpg:{large_image_url:r.node?.main_picture?.large||r.node?.main_picture?.medium||''}}},votes:r.num_recommendations||0})),source:'MyAnimeList'};
}
function kitsuToJikan(item,malId){
 const a=item?.attributes;if(item?.type!=='anime'||!positive(item.id)||!a||!positive(malId))throw Error('ALM_PROVIDER_IDENTITY');
 return {mal_id:positive(malId),title:a.titles?.en_jp||a.canonicalTitle||a.titles?.en||'',title_english:a.titles?.en||'',title_japanese:a.titles?.ja_jp||'',title_synonyms:Object.values(a.titles||{}),synopsis:a.synopsis||a.description||'',episodes:a.episodeCount||null,type:String(a.subtype||'').toUpperCase()==='MOVIE'?'Movie':String(a.subtype||'').toUpperCase(),images:{jpg:{large_image_url:a.posterImage?.large||a.posterImage?.original||a.posterImage?.medium||''}},aired:{from:a.startDate||'',to:a.endDate||''},duration:a.episodeLength?a.episodeLength+' min':'',url:'https://myanimelist.net/anime/'+malId,source:'Kitsu',kitsuId:positive(item.id),trailer:a.youtubeVideoId?{youtube_id:a.youtubeVideoId}:null,score:null,rank:null,popularity:null,members:null};
}
function createMetadataProviders({getClientId=()=>'',fetchText=boundedTextFetch,now=Date.now,timeoutMs=6500}={}){
 const cache=new Map(),failures=new Map();let active=0;const waiting=[];
 const clientId=()=>String(getClientId()||'').trim();
 async function json(provider,url,headers={}){
  const retryAt=failures.get(provider)||0;if(now()<retryAt)throw Error('ALM_PROVIDER_COOLDOWN');
  if(active>=3)await new Promise(resolve=>waiting.push(resolve));else active++;
  try{const r=await fetchText(url,{timeoutMs,maxBytes:3*1024*1024,maxRedirects:0,headers:{Accept:'application/json',...headers}});if(!r.response.ok){const sec=Number(r.response.headers?.get?.('retry-after'));failures.set(provider,now()+Math.min(86400000,Math.max(60000,(sec||0)*1000)));throw Error('ALM_PROVIDER_UNAVAILABLE');}const value=JSON.parse(r.text);failures.delete(provider);return value;}
  catch(error){failures.set(provider,Math.max(failures.get(provider)||0,now()+60000));throw error;}
  finally{if(waiting.length)waiting.shift()();else active--;}
 }
 async function mal(suffix){const id=clientId();if(!id)throw Error('ALM_MAL_CLIENT_REQUIRED');return json('mal:'+id,'https://api.myanimelist.net/v2/'+suffix,{'X-MAL-CLIENT-ID':id});}
 async function kitsu(suffix){return json('kitsu','https://kitsu.app/api/edge/'+suffix,{Accept:'application/vnd.api+json'});}
 function save(key,value){cache.set(key,{value,time:now()});while(cache.size>256)cache.delete(cache.keys().next().value);return value;}
 const detailFlight=singleFlight(async(key,id)=>{
  const hit=cache.get(key);if(hit&&now()-hit.time<3600000)return hit.value;
  if(clientId())try{const m=await mal('anime/'+id+'?'+new URLSearchParams({fields}));if(positive(m.id)!==id)throw Error('ALM_PROVIDER_IDENTITY');return save(key,malToJikan(m));}catch{}
  // Only an explicit mapping may attach a Kitsu record to an existing MAL id.
  try{const result=await kitsu('mappings?'+new URLSearchParams({'filter[externalSite]':'myanimelist/anime','filter[externalId]':String(id),include:'item','page[limit]':'10'}));const matches=(result.data||[]).filter(m=>m.type==='mappings'&&m.attributes?.externalSite==='myanimelist/anime'&&positive(m.attributes.externalId)===id&&m.relationships?.item?.data?.type==='anime');const itemIds=[...new Set(matches.map(m=>String(m.relationships.item.data.id)))];if(result.links?.next||itemIds.length!==1)return save(key,null);const item=(result.included||[]).find(m=>m.type==='anime'&&String(m.id)===itemIds[0]);if(!item)return save(key,null);return save(key,kitsuToJikan(item,id));}catch{return null;}
 });
 const detailsFlight=singleFlight(async(key,id)=>{
  const hit=cache.get('detail:'+key);if(hit&&now()-hit.time<3600000)return hit.value;
  const base=await byId(id);if(!base||base.trailer?.youtube_id)return base;
  try{const r=await kitsu('mappings?'+new URLSearchParams({'filter[externalSite]':'myanimelist/anime','filter[externalId]':String(id),include:'item','page[limit]':'10'}));const mapping=(r.data||[]).filter(m=>m.type==='mappings'&&m.attributes?.externalSite==='myanimelist/anime'&&positive(m.attributes.externalId)===id&&m.relationships?.item?.data?.type==='anime');const ids=[...new Set(mapping.map(m=>String(m.relationships.item.data.id)))];const item=ids.length===1&&!r.links?.next?(r.included||[]).find(m=>m.type==='anime'&&String(m.id)===ids[0]):null;if(item){const supplement=kitsuToJikan(item,id);return save('detail:'+key,{...base,synopsis:base.synopsis||supplement.synopsis,trailer:supplement.trailer});}}catch{}
  return save('detail:'+key,base);
 });
 const details=id=>{id=positive(id);return id?detailsFlight(clientId()+':'+id,id):Promise.resolve(null);};
 const byId=id=>{id=positive(id);return id?detailFlight(clientId()+':'+id,id):Promise.resolve(null);};
 const search=singleFlight(async title=>{
  if(clientId()&&String(title).trim().length>=3)try{const r=await mal('anime?'+new URLSearchParams({q:title,limit:'5',fields}));return (r.data||[]).map(x=>malToJikan(x.node));}catch{}
  try{const r=await kitsu('anime?'+new URLSearchParams({'filter[text]':title,'page[limit]':'5',include:'mappings'}));const mapped=[];for(const item of r.data||[]){const ids=[...new Set((r.included||[]).filter(m=>m.type==='mappings'&&m.attributes?.externalSite==='myanimelist/anime'&&positive(m.attributes.externalId)&&String(m.relationships?.item?.data?.id)===String(item.id)&&m.relationships?.item?.data?.type==='anime').map(m=>positive(m.attributes.externalId)))];if(ids.length===1)mapped.push(kitsuToJikan(item,ids[0]));}return mapped;}catch{return [];}
 });
 async function ranking(page){const r=await mal('anime/ranking?'+new URLSearchParams({ranking_type:'all',limit:'25',offset:String((page-1)*25),fields}));if(!Array.isArray(r.data))throw Error('ALM_PROVIDER_RESPONSE');return {data:r.data.map(x=>({...malToJikan(x.node),rank:x.ranking?.rank}))};}
 async function season(year,season,page=1){const r=await mal('anime/season/'+year+'/'+season+'?'+new URLSearchParams({limit:'25',offset:String((page-1)*25),fields}));return {data:(r.data||[]).map(x=>malToJikan(x.node)),pagination:{has_next_page:!!r.paging?.next}};}
 return {byId,details,search,ranking,season,configured:()=>!!clientId(),mal,fields};
}
module.exports={createMetadataProviders,malToJikan,kitsuToJikan,positive};
