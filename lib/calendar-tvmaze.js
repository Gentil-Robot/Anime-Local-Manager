'use strict';
const {boundedTextFetch}=require('./bounded-text-fetch');
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
const normalized=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const titles=anime=>[anime.canonicalTitle,anime.titleRomaji,anime.titleEn,anime.titleJa,anime.titleEnglish,anime.titleJapanese,...(Array.isArray(anime.synonyms)?anime.synonyms:[]),...(!anime.customTitle?[anime.title]:[])].filter(value=>typeof value==='string'&&value.trim());
// Reviewed identity, not a guessed weekly recurrence or a hardcoded episode date.
// MAL 59741: bundled catalogue, original Japanese title + English title.
// TVmaze show + Japanese AKAs + official site agree:
// https://www.tvmaze.com/shows/83670/the-exiled-heavy-knight-knows-how-to-game-the-system
// https://sh-anime.shochiku.co.jp/jukishi-anime/
const reviewed=new Map([[59741,{id:83670,names:['The Exiled Heavy Knight Knows How to Game the System','Tsuihou sareta Tensei Juukishi wa Game Chishiki de Musou suru','追放された転生重騎士はゲーム知識で無双する'],startDate:'2026-07-03'}]]);
const caches=new WeakMap();
let nextRequestAt=0,queue=Promise.resolve();
async function request(route,fetchImpl){
 if(fetchImpl===global.fetch){
  const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;
  try{const delay=Math.max(0,nextRequestAt-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));nextRequestAt=Date.now()+550;}finally{release();}
 }
 const {response,text}=await boundedTextFetch('https://api.tvmaze.com/'+route,{fetchImpl,timeoutMs:6000,maxBytes:3*1024*1024,maxRedirects:0,headers:{Accept:'application/json','User-Agent':'AnimeLocalManager/'+require('../package.json').version}});
 if(!response.ok)throw Error('ALM_CALENDAR_TVMAZE');return JSON.parse(text);
}
function samePremiere(anime,show){
 const first=Date.parse(anime.startDate),second=Date.parse(show.premiered);
 return Number.isFinite(first)&&Number.isFinite(second)&&Math.abs(first-second)<=2*86400000;
}
function eligible(show){return positive(show?.id)&&show.type==='Animation'&&show.language==='Japanese';}
async function resolveShow(anime,fetchImpl){
 const link=reviewed.get(positive(anime.malId));
 if(link){const show=await request('shows/'+link.id,fetchImpl);return eligible(show)&&show.id===link.id&&link.names.map(normalized).includes(normalized(show.name))&&samePremiere(link,show)?show:null;}
 // A title-only match needs an exact name/AKA and the same dated first season.
 // Refuse remakes, live action and ambiguous homonyms rather than changing IDs.
 if(!samePremiere(anime,{premiered:anime.startDate}))return null;
 const names=[...new Set(titles(anime).map(normalized).filter(name=>name.length>=8))];
 if(!names.length)return null;
 const queries=[...new Set(titles(anime))].slice(0,2),candidates=new Map();
 for(const query of queries){
  const result=await request('search/shows?q='+encodeURIComponent(query),fetchImpl);
  if(!Array.isArray(result))throw Error('ALM_CALENDAR_TVMAZE');
  for(const row of result.slice(0,8)){const show=row.show;if(eligible(show)&&samePremiere(anime,show))candidates.set(show.id,show);}
 }
 const matches=[];
 for(const show of candidates.values()){
  const aliases=await request('shows/'+show.id+'/akas',fetchImpl);
  if(!Array.isArray(aliases))continue;
  const alternatives=[show.name,...aliases.filter(item=>!item.country||item.country.code==='JP').map(item=>item.name)].map(normalized);
  if(names.some(name=>alternatives.includes(name)))matches.push(show);
 }
 return matches.length===1?matches[0]:null;
}
async function trackedEvents(anime,now,fetchImpl=global.fetch){
 if(!caches.has(fetchImpl))caches.set(fetchImpl,new Map());
 const cache=caches.get(fetchImpl),key=positive(anime.malId)?'mal:'+positive(anime.malId):titles(anime).map(normalized).join('|')+':'+anime.startDate;
 let saved=cache.get(key);
 if(!saved||saved.until<=now){
  const show=await resolveShow(anime,fetchImpl);
  if(!show)return {animeId:anime.id,unavailable:true};
  const episodes=await request('shows/'+show.id+'/episodes',fetchImpl);
  if(!Array.isArray(episodes)||episodes.length>5000)throw Error('ALM_CALENDAR_TVMAZE');
  saved={show,episodes,until:now+60*60000};cache.set(key,saved);if(cache.size>200)cache.delete(cache.keys().next().value);
 }
 const since=Math.floor(now/1000)-7*86400,until=Math.floor(now/1000)+38*86400,seen=new Set(),entries=[];
 for(const episode of saved.episodes){
  const number=positive(episode.number),airingAt=Math.floor(Date.parse(episode.airstamp)/1000);
  if(episode.season!==1||!number||!positive(episode.id)||!Number.isSafeInteger(airingAt)||airingAt<since||airingAt>until||seen.has(number))continue;
  const parent=episode._links?.show?.href;if(parent&&parent!=='https://api.tvmaze.com/shows/'+saved.show.id)continue;
  seen.add(number);entries.push({key:positive(anime.malId)?'mal:'+positive(anime.malId)+':'+number:'tvmaze:'+saved.show.id+':'+number,animeId:anime.id,title:anime.title,poster:anime.poster||'',episode:number,airingAt,source:'TVmaze',sourceUrl:'https://www.tvmaze.com/episodes/'+episode.id,confirmed:true,tvmazeId:saved.show.id});
 }
 return {animeId:anime.id,entries};
}
module.exports={trackedEvents,normalized};
