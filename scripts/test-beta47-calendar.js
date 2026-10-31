'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {trackedEvents}=require('../lib/calendar-tvmaze'),{withFallback}=require('../lib/calendar-sources'),{createCalendar}=require('../lib/calendar');
const evidence=require('./fixtures/tvmaze-captured-20261009.json').responses;
const now=Date.parse('2026-10-09T10:00:00Z'),anime={id:747,malId:59741,title:'Tsuihou sareta Tensei Juukishi wa Game Chishiki de Musou suru',status:'Watching',episodesSeen:15,notes:'Conserver mes notes'};
const fixtures=(override={})=>{const calls=[];const fetch=async url=>{calls.push(url);const route=String(url).replace('https://api.tvmaze.com/','');if(!(route in evidence)&&!(route in override))throw Error('Offline source');return new Response(JSON.stringify(route in override?override[route]:evidence[route]),{status:200,headers:{'Content-Type':'application/json'}});};return {fetch,calls};};
(async()=>{
 const source=fixtures(),before=JSON.stringify(anime),rows=await withFallback(async()=>[{animeId:anime.id,entries:[]}],[anime],now,source.fetch),episode=rows[0].entries.find(item=>item.episode===16);
 assert(episode);assert.equal(episode.source,'TVmaze');assert.equal(episode.confirmed,true);assert(!episode.estimated);assert.equal(episode.animeId,anime.id);assert.equal(episode.tvmazeId,83670);assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(episode.airingAt*1000)),'2026-10-15');assert.equal(JSON.stringify(anime),before);assert(!source.calls.some(url=>url.includes('jikan')));
 console.log('OK calendar: current provider episode 16 is on 15 October in Paris when AniList returns an empty schedule; personal progress stays 15');
 const afterUnavailable=await withFallback(async()=>{throw Error('Unavailable primary');},[{id:746,malId:101,title:'Undated unresolved title'},anime],now,fixtures().fetch);
 assert(afterUnavailable[0].unavailable);assert(afterUnavailable[1].entries.some(item=>item.episode===16));
 console.log('OK calendar: an unresolved earlier anime does not prevent a later verified schedule from loading');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm47-calendar-'));
 try{
  let collection=[],requests=0;const file=path.join(dir,'calendar.json');const calendar=createCalendar({stateFile:file,getAnimes:()=>collection,now:()=>now,fetchGlobal:async()=>({events:[]}),fetchTracked:async selected=>{requests++;return withFallback(async()=>selected.map(a=>({animeId:a.id,entries:[]})),selected,now,source.fetch);}});
  await calendar.check();assert(!calendar.state().needsRefresh);collection=[anime];assert(calendar.state().needsRefresh);await calendar.check(false);assert.equal(requests,1);assert(!calendar.state().needsRefresh);assert(calendar.state().events.some(item=>item.episode===16&&item.category==='watching'&&item.anime.episodesSeen===15));await calendar.check(false);assert.equal(requests,1);
  const reread=createCalendar({stateFile:file,getAnimes:()=>collection,now:()=>now});assert(reread.state().events.some(item=>item.episode===16));assert(!reread.state().needsRefresh);
  console.log('OK calendar: adding a followed anime invalidates a fresh cache, persists exact dates and keeps normal repeated reads cached');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 for(const changed of [{id:12345},{type:'Scripted'},{language:'English'},{name:'Unrelated show'},{premiered:'2020-07-02'}]){
  const broken=fixtures({'shows/83670':{...evidence['shows/83670'],...changed}});assert.equal((await trackedEvents(anime,now,broken.fetch)).unavailable,true);
 }
 console.log('OK calendar: foreign IDs, live action, language, titles and premiere mismatches cannot supply an anime schedule');
 const altered=fixtures({'shows/83670/episodes':[{...evidence['shows/83670/episodes'].find(item=>item.number===16),airstamp:null},{...evidence['shows/83670/episodes'].find(item=>item.number===16),season:2},{...evidence['shows/83670/episodes'].find(item=>item.number===16),_links:{show:{href:'https://api.tvmaze.com/shows/12345'}}}]});
 assert.equal((await trackedEvents(anime,now,altered.fetch)).entries.length,0);
 const exact={key:'999:16',animeId:anime.id,episode:16,airingAt:episode.airingAt,source:'AniList'};
 const offline=async()=>{throw Error('Primary exact dates must not need another source');};assert.deepEqual((await withFallback(async()=>[{animeId:anime.id,entries:[exact]}],[anime],now,offline))[0].entries,[exact]);
 console.log('OK calendar: unknown dates, other seasons and wrong parent shows are rejected; existing exact AniList forecasts need no fallback');
 // Two same-name anime with the same premiere are ambiguous even with high fuzzy scores.
 const unknown={id:2,title:'A fantasy example',titleEn:'Fantasy example',startDate:'2026-07-03',type:'TV'};
 const ambiguous=async url=>new Response(JSON.stringify(String(url).includes('/search/shows')?[1,2].map(id=>({show:{id,name:'Fantasy example',type:'Animation',language:'Japanese',premiered:'2026-07-02'}})):[{name:'A fantasy example',country:{code:'JP'}}]),{status:200});
 assert.equal((await trackedEvents(unknown,now,ambiguous)).unavailable,true);
 console.log('OK calendar: title-only fallback refuses ambiguous homonyms');
})().catch(error=>{console.error(error);process.exitCode=1;});
