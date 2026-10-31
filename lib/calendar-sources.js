'use strict';
const {withAniListFetch}=require('./anilist-fetch');
const {boundedTextFetch}=require('./bounded-text-fetch');
let providers=null;
const setProviders=value=>{providers=value;};
const POS=n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;
const days=['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];
async function jikan(route,fetchImpl=global.fetch){
 if(fetchImpl===global.fetch){
  const match=/^anime\/(\d+)\/full$/.exec(route);
  if(match&&providers?.configured()){const raw=await providers.byId(Number(match[1]));if(raw)return {data:raw};}
  throw Error('ALM_JIKAN_RETIRED');
 }
 // Explicit test transport keeps coverage of historical cached Jikan schemas.

 const {response,text}=await boundedTextFetch('https://api.jikan.moe/v4/'+route,{fetchImpl,timeoutMs:9000,maxBytes:3*1024*1024,maxRedirects:0,headers:{Accept:'application/json','User-Agent':'AnimeLocalManager/'+require('../package.json').version}});
 if(!response.ok)throw Error('ALM_CALENDAR_SOURCE');return JSON.parse(text);
}
function record(m){return {malId:POS(m.mal_id),title:String(m.title||''),poster:m.images?.jpg?.large_image_url||m.images?.jpg?.image_url||'',synopsis:String(m.synopsis||''),type:m.type||'',episodesTotal:m.episodes||'',publicScore:m.score||'',startDate:m.aired?.from?.slice(0,10)||'',malUrl:POS(m.mal_id)?'https://myanimelist.net/anime/'+m.mal_id:'',genres:(m.genres||[]).map(g=>g.name),studios:(m.studios||[]).map(s=>s.name)};}
function premiere(m){const a=record(m),date=a.startDate;if(!a.malId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];return [{key:'premiere:'+a.malId,date,title:a.title,anime:a,kind:a.type==='Movie'?'movie':'premiere',source:m.source||'MyAnimeList / Jikan',allDay:true,confirmed:true}];}
function broadcastSlots(m,now){
 const a=record(m),b=m.broadcast,index=days.indexOf(b?.day),time=String(b?.time||'');
 // MAL's weekly slot is not an individually confirmed episode. Never number or notify it.
 if(!a.malId||m.status!=='Currently Airing'||m.type==='Movie'||index<0||!/^\d{2}:\d{2}$/.test(time)||b.timezone!=='Asia/Tokyo')return [];
 const [h,min]=time.split(':').map(Number);if(h>23||min>59)return [];
 const first=new Date(now-7*86400000+9*3600000);first.setUTCHours(0,0,0,0);const items=[];
 for(let i=0;i<45;i++){const d=new Date(first.getTime()+i*86400000);if(d.getUTCDay()!==index)continue;const airingAt=Math.floor((d.getTime()+(h-9)*3600000+min*60000)/1000);if(a.startDate&&new Date(airingAt*1000).toISOString().slice(0,10)<a.startDate)continue;if(m.aired?.to&&airingAt*1000>Date.parse(m.aired.to))continue;items.push({key:'slot:'+a.malId+':'+airingAt,airingAt,title:a.title,anime:a,kind:'episode',source:m.source||'MyAnimeList / Jikan',confirmed:false,estimated:true});}
 return items;
}
async function fallbackAnime(a,now,fetchImpl){
 if(!POS(a.malId))return {animeId:a.id,unavailable:true};
 const m=(await jikan('anime/'+POS(a.malId)+'/full',fetchImpl)).data;
 if(m?.mal_id!==POS(a.malId))return {animeId:a.id,unavailable:true};
 const entries=broadcastSlots(m,now).map(i=>({...i,animeId:a.id,title:a.title,poster:a.poster||i.anime.poster}));
 // Report actual known episodes separately. A weekly recurrence cannot prove an episode aired.
 if(m.status==='Currently Airing')try{let page=await jikan('anime/'+POS(a.malId)+'/episodes',fetchImpl);const last=Number(page.pagination?.last_visible_page);if(Number.isSafeInteger(last)&&last>1&&last<=1000)page=await jikan('anime/'+POS(a.malId)+'/episodes?page='+last,fetchImpl);for(const ep of page.data||[]){const airingAt=Math.floor(Date.parse(ep.aired)/1000);if(POS(ep.mal_id)&&Number.isFinite(airingAt)&&airingAt*1000>=now-7*86400000&&airingAt*1000<=now)entries.push({key:'mal:'+a.malId+':'+ep.mal_id,animeId:a.id,title:a.title,poster:a.poster||record(m).poster,episode:ep.mal_id,airingAt,source:m.source||'MyAnimeList / Jikan',confirmed:true,kind:'episode'});}}catch{}
 return {animeId:a.id,entries};
}
async function withFallback(primary,animes,now,fetchImpl=global.fetch){
 let result;try{result=await primary(animes,now,fetchImpl);}catch{result=[];}
 const rows=animes.map(a=>result?.find(row=>row.animeId===a.id)||{animeId:a.id,unavailable:true});let legacyAvailable=true;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],a=animes[i];
  if(!row.unavailable&&row.entries?.some(entry=>POS(entry.episode)&&entry.airingAt*1000>now&&!entry.estimated))continue;
  try{
   const extra=await require('./calendar-tvmaze').trackedEvents(a,now,fetchImpl);
   if(!extra.unavailable&&extra.entries.length){
    const merged=new Map(extra.entries.map(entry=>['episode:'+entry.episode,entry]));
    for(const entry of row.entries||[])merged.set(entry.episode?'episode:'+entry.episode:entry.key,entry);
    rows[i]={animeId:a.id,entries:[...merged.values()]};continue;
   }
  }catch{}
  // Stop repeating a failed legacy source, while allowing verified schedules
  // for the following anime to be resolved through TVmaze.
  if(row.unavailable&&legacyAvailable)try{rows[i]=await fallbackAnime(a,now,fetchImpl);}catch{legacyAvailable=false;}
 }
 return rows;
}
async function globalEvents(now,fetchImpl=global.fetch,onBatch=()=>{}){
 const events=[];let successes=0,partial=false,exact=false;
 // Public episode calendar, including anime not yet added to the collection.
 try{for(let page=1;page<=30;page++){
  const query='query($page:Int,$since:Int,$until:Int){Page(page:$page,perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:$since,airingAt_lesser:$until,sort:AIRING_AT){episode airingAt media{id idMal title{romaji english native} coverImage{large} description(asHtml:false) format episodes averageScore startDate{year month day}}}}}';
  const {response,text}=await boundedTextFetch('https://graphql.anilist.co',{fetchImpl:withAniListFetch(fetchImpl),timeoutMs:10000,maxBytes:3*1024*1024,maxRedirects:0,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{page,since:Math.floor(now/1000)-7*86400,until:Math.floor(now/1000)+38*86400}})});
  if(!response.ok)throw Error();const result=JSON.parse(text);if(!result.data?.Page)throw Error();successes++;exact=true;
  for(const s of result.data.Page.airingSchedules||[]){const m=s.media;if(!POS(m?.id)||!POS(s.episode)||!Number.isSafeInteger(s.airingAt))continue;const a={anilistId:m.id,malId:POS(m.idMal)||null,title:m.title?.romaji||m.title?.english||m.title?.native||'',titleEn:m.title?.english||'',titleJa:m.title?.native||'',poster:m.coverImage?.large||'',synopsis:String(m.description||''),type:m.format==='MOVIE'?'Movie':m.format||'TV',episodesTotal:m.episodes||'',publicScore:m.averageScore?m.averageScore/10:'',malUrl:POS(m.idMal)?'https://myanimelist.net/anime/'+m.idMal:''};events.push({key:m.id+':'+s.episode,airingAt:s.airingAt,episode:s.episode,title:a.title,anime:a,kind:a.type==='Movie'?'movie':'episode',confirmed:true,source:'AniList'});}
  onBatch({events:[...events],partial:true});
  if(!result.data.Page.pageInfo?.hasNextPage)break;if(page===30)partial=true;
 }}catch{if(exact)partial=true;}
 if(fetchImpl===global.fetch){
  partial=true;
  if(providers?.configured())try{
   const d=new Date(now),quarter=Math.floor(d.getUTCMonth()/3),seasons=['winter','spring','summer','fall'];
   for(let offset=0;offset<2;offset++)for(let page=1;page<=8;page++){
    const result=await providers.season(d.getUTCFullYear()+(quarter+offset>3?1:0),seasons[(quarter+offset)%4],page);successes++;
    for(const m of result.data)events.push(...premiere(m));onBatch({events:[...events],partial:true});
    if(!result.pagination.has_next_page)break;
   }
  }catch{}
  return {events,unavailable:successes===0,partial};
 }
 for(const list of [...(!exact?['schedules']:[]),'seasons/upcoming']){
  let completed=false;
  for(let page=1;page<=8;page++)try{const result=await jikan(list+'?limit=25&page='+page,fetchImpl);successes++;for(const m of result.data||[])events.push(...premiere(m),...(!exact?broadcastSlots(m,now):[]));onBatch({events:[...events],partial:true});if(!result.pagination?.has_next_page){completed=true;break;}}catch{partial=true;break;}
  if(!completed)partial=true;
 }
 return {events,unavailable:successes===0,partial};
}
module.exports={setProviders,jikan,record,premiere,broadcastSlots,fallbackAnime,withFallback,globalEvents};
