'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const reference=require('../public/season-reference'),links=require('../lib/local-season-links'),evidence=require('../lib/import-progress-evidence'),series=require('../public/series-state');
const {boundedTextFetch}=require('../lib/bounded-text-fetch');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm57-')),keepAlive=setInterval(()=>{},1000),sleep=ms=>new Promise(r=>setTimeout(r,ms));let host,api,db;
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_AUTOMATION_STARTUP='0';
fs.mkdirSync(process.env.ALM_IMAGES_DIR);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;let remote;
global.fetch=(u,o)=>String(u).startsWith('http://127.0.0.1:')?nativeFetch(u,o):remote?remote(u,o):Promise.reject(Error('Offline regression fixture'));
(async()=>{
 assert.equal(reference.parse('Arifureta — Saison 3').base,'Arifureta');assert.equal(reference.parse('Strike the Blood IV').season,4);assert.equal(reference.parse('Lv2 kara Cheat').season,0);
 assert.equal(reference.role({title:'Tsuki ga Michibiku Isekai Douchuu'}),'main');assert.equal(reference.role({title:'Chiichai! Maou-sama!!'}),'bonus');
 assert.deepEqual(evidence.infer({status:'20.83',remaining:'19'}),{watched:5,total:24,remaining:19,percent:20.83,source:'percentage-and-remaining'});
 assert.equal(evidence.infer({status:'100',remaining:'0'}),null);assert.equal(evidence.infer({status:'50',remaining:'900'}),null);
 // A provider can answer headers and stall the body: the whole request expires.
 const at=Date.now();await assert.rejects(boundedTextFetch('https://fixture.example',{timeoutMs:30,fetchImpl:async()=>new Response(new ReadableStream({start(){}}))}),/timed out/);assert(Date.now()-at<1000);
 const cancel=new AbortController();const cancelled=boundedTextFetch('https://fixture.example',{timeoutMs:2000,signal:cancel.signal,fetchImpl:()=>new Promise(()=>{})});cancel.abort();await assert.rejects(cancelled,/cancelled/);
 api=require('../server');db=require('../db');await db.whenReady();await db.prepareMetadataTitleIndex();
 const search=(q,n)=>[...db.searchMetadataByTitle(q,n),...db.searchMetadataByTitleTokens(q,n)];
 for(const [root,season,expected]of [[15809,2,48413],[36882,3,52995],[18277,5,49316],[31433,4,51805],[43523,2,49889],[30831,2,32937]]){
  const base=db.getMetadataByMalId(root),found=links.findSeason(base,{title:base.title+' — Saison '+season,betaseriesSeason:season},search);assert.equal(Number(found?.row.malId),expected,'Exact official season '+root+':'+season);
 }
 assert.equal(links.findNext(db.getMetadataByMalId(15809),search).row.malId,48413);assert(links.findNext(db.getMetadataByMalId(48413),search).proof.split);
 assert.equal(links.findNext(db.getMetadataByMalId(55644),search).row.malId,57592,'Dr. Stone first cour inherits global season 3');
 assert.equal(links.findSeason(db.getMetadataByMalId(11757),{title:'Sword Art Online — Saison 4',betaseriesSeason:4},search),null,'A subseries season is not a global season');
 // Official relation IDs take priority over a similar local title.
 const missing=api.__test.betaSeriesSeasonEntryFromCandidate({malId:998570,title:'Arifureta Shokugyou de Sekai Saikyou',mediaType:'TV',episodesTotal:12});assert.equal(Number(missing.malId),998570);assert.equal(missing.found,null);
 remote=async()=>new Response(JSON.stringify({data:{m0:{idMal:999999,relations:{edges:[]}}}}));assert.equal((await api.__test.fetchAniListSeasonRelationsBatch([{malId:34599}])).size,0);
 remote=async()=>new Response(new ReadableStream({start(){}}));const relationStart=Date.now();await assert.rejects(api.__test.fetchAniListSeasonRelationsBatch([{malId:34599}],{timeoutMs:750}),/timed out/);assert(Date.now()-relationStart<2000);remote=null;
 const canonical=(id,malId,family)=>{const m=db.getMetadataByMalId(malId);return {id,title:m.title,malId:String(malId),canonicalTitle:m.title,type:m.type,episodesSeen:String(m.episodes),episodesTotal:String(m.episodes),startDate:m.startDate,endDate:m.endDate,synopsis:m.synopsis,genres:m.genres,imageUrl:'/assets/design/moon-library.webp',status:'Completed',betaseriesSeriesId:family,betaseriesSeason:1,tags:['BetaSeries'],score:'9',notes:'Personal note '+id};};
 const roots=[canonical(1,36882,'arifureta'),canonical(3,34599,'abyss')];
 const provisional={id:2,title:'Arifureta — Saison 3',episodesSeen:'16',status:'Completed',betaseriesSeriesId:'arifureta',betaseriesSeason:3,manualSeasonNumber:3,betaseriesEpisode:'S03E16',tags:['BetaSeries','saison à identifier'],notes:'Preserve me',score:'8'};
 api.__test.writeAnimes([...roots,provisional]);
 // Available cached relations still work when another family/provider failed.
 fs.mkdirSync(path.join(dir,'cache'),{recursive:true});fs.writeFileSync(path.join(dir,'cache/betaseries-season-relations-v2.json'),JSON.stringify({'34599':{updatedAt:new Date().toISOString(),relations:[{relation:'Sequel',entry:[{mal_id:41084,type:'anime',name:'Made in Abyss: Retsujitsu no Ougonkyou',mediaType:'TV'}]}]}}));
 const abyss={title:'Made in Abyss — Saison 2',betaseriesSeriesId:'abyss',betaseriesSeason:2,tags:['saison à identifier']};assert.equal(Number((await api.__test.resolveProvisionalSeasonInfo(abyss,{localOnly:true}))?.malId),41084);
 host=await api.startServer(0);const origin='http://127.0.0.1:'+host.almPort;
 const request=async(url,body,method='POST')=>{const r=await nativeFetch(origin+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert(r.ok,JSON.stringify(v));return v;};
 const waitJob=async id=>{for(let n=0;n<2000;n++){const p=await request('/api/bulk/complete-all/progress/'+id);if(['done','error','cancelled'].includes(p.status)){assert.equal(p.status,'done',JSON.stringify(p));return p;}await sleep(10);}throw Error('Completion job did not finish');};
 const job=await request('/api/bulk/info-only',{ids:[2],retryMarked:true});await waitJob(job.jobId);
 let associated=api.__test.readAnimes().find(a=>a.id===2);assert.equal(Number(associated.malId),52995);assert.equal(associated.notes,provisional.notes);assert.equal(associated.betaseriesEpisode,'S03E16');assert.equal(associated.seriesReference.rootMalId,36882);
 const edit=await request('/api/animes/2',{...associated,title:'My chosen title',synopsis:'My own summary',episodesTotal:'18',episodesSeen:'8',status:'On-Hold',notes:'Edited note',autoInfo:true},'PUT');assert.equal(edit.synopsis,'My own summary');
 const repeat=await request('/api/bulk/info-only',{ids:[2],overwrite:true,retryMarked:true});await waitJob(repeat.jobId);
 const protectedRow=api.__test.readAnimes().find(a=>a.id===2);for(const [k,v]of Object.entries({title:'My chosen title',synopsis:'My own summary',episodesTotal:'18',episodesSeen:'8',status:'On-Hold',notes:'Edited note'}))assert.equal(protectedRow[k],v,k+' must survive automatic completion');
 const reimport=api.__test.mergeImportedAnime(protectedRow,{...associated,episodesSeen:'16',status:'Completed',notes:''},true);assert.equal(reimport.episodesSeen,'8');assert.equal(reimport.synopsis,'My own summary');assert.equal(reimport.status,'On-Hold');
 // Corrections of a named sequel are remembered for later CSV imports.
 db.importMetadataRows([{malId:998571,title:'Verified base',type:'TV',episodes:12,startDate:'2020-01-01',synopsis:'Base.',genres:['Fantasy']},{malId:998572,title:'A different official sequel title',type:'TV',episodes:12,startDate:'2021-01-01',synopsis:'Sequel.',genres:['Fantasy']}]);await db.prepareMetadataTitleIndex();
 const base=canonical(10,998571,'manual-family'),child={id:11,title:'Verified base — Saison 2',betaseriesSeriesId:'manual-family',betaseriesSeason:2,manualSeasonNumber:2,betaseriesEpisode:'S02E07',episodesSeen:'7',status:'Watching',notes:'A personal correction',tags:['BetaSeries','saison à identifier']};api.__test.writeAnimes([...api.__test.readAnimes(),base,child]);
 await request('/api/animes/11/reassociate',{malId:998572,expectedMalId:0,status:'Watching'});
 const expanded=await api.__test.expandBetaSeriesProgressItems([{source:'BetaSeries',classification:'anime',sourceTitle:base.title,row:{id:'manual-family',title:base.title,episode:'S02E07',status:'70',remaining:'5'},anime:base}],{localOnly:true});assert(expanded.some(a=>Number(a.anime.malId)===998572),'Reimport uses the saved manual crosswalk');
 const restored=require('../lib/library-automation').createAutomation(dir);assert.equal(restored.season('manual-family',2).source,'manual');assert.equal(restored.season('manual-family',2).malId,998572);restored.stop();
 // Repeated canonical IDs do not count the same episode twice.
 const shared={...associated,seriesReference:{status:'verified',rootMalId:36882,sourceSeason:3}};const groups=series.groups([roots[0],shared,{...shared,id:88}]);assert.equal(groups.length,1);assert.equal(groups[0].total,29);assert.equal(groups[0].seen,29);
 // Dates and notifications from an old identity cannot return after reassociation.
 let tracked=[{id:77,title:'Original',malId:1,status:'Watching',episodesSeen:0}],release;
 const calendar=require('../lib/calendar').createCalendar({stateFile:path.join(dir,'test-calendar.json'),getAnimes:()=>tracked,fetchTracked:()=>new Promise(r=>{release=r;}),fetchGlobal:async()=>({events:[]})});const pending=calendar.check(true);await sleep(0);tracked=[{...tracked[0],malId:2,title:'Corrected'}];release([{animeId:77,entries:[{key:'old',anime:{malId:1},airingAt:Math.floor(Date.now()/1000),episode:2}]}]);await pending;assert.equal(calendar.state().events.length,0);assert(calendar.state().needsRefresh);
 const notifications=require('../lib/notification-center').createNotificationCenter({file:path.join(dir,'test-notifications.json')});notifications.record({animeId:77,malId:1,title:'Original',episode:2,airingAt:Math.floor(Date.now()/1000)});notifications.invalidate([77]);assert.equal(notifications.state().unread,0);assert(notifications.state().items[0].associationOutdated);
 console.log('OK Beta57: canonical season aliases, OVA seasons, bonus rejection, cour inheritance, bounded bodies/cancellation, exact relation IDs, partial-cache recovery, protected edits/reimports, durable manual crosswalk, unique episode totals and stale-event rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);clearInterval(keepAlive);});
