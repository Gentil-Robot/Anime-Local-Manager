'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm55-')),keepAlive=setInterval(()=>{},1000);let host;
const fixture=process.env.ALM_VM_FIXTURE;
if(fixture)fs.cpSync(fixture,dir,{recursive:true});
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');fs.mkdirSync(process.env.ALM_IMAGES_DIR,{recursive:true});
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;global.fetch=(u,o)=>String(u).startsWith('http://127.0.0.1:')?nativeFetch(u,o):Promise.reject(Error('Offline regression fixture'));
(async()=>{
 const integrity=require('../lib/catalogue-integrity'),links=require('../lib/local-season-links'),progress=require('../lib/progress-reconciliation'),plans=require('../lib/betaseries-progress');
 const canonical={malId:52211,...integrity.identities[52211]},spoiled={...canonical,title:'MASHLE: MAGIC AND MUSCLES — Saison 2',titleRomaji:'MASHLE: MAGIC AND MUSCLES — Saison 2'};
 const repair=integrity.restore([spoiled],{items:{wrong:{source:'auto',sourceTitle:spoiled.title,animeTitle:spoiled.title,malId:52211},manual:{source:'manual',sourceTitle:'My own name',animeTitle:'My own name',malId:52211}}});
 assert.equal(repair.corrected[0].title,'Mashle');assert.deepEqual(Object.keys(repair.aliases.items),['manual']);assert.equal(integrity.restore(repair.corrected,repair.aliases).corrected.length,0);
 assert.equal(integrity.restore([],{items:{newer:{source:'auto',sourceTitle:'A new official anime',animeTitle:'A new official anime',malId:999555}}},()=>({title:'A new official anime'})).removed.length,0);
 const grouped=plans.buildSeasonProgressPlan('S02E17',[{malId:1,sourceSeason:1,episodesTotal:12},{malId:2,sourceSeason:1,episodesTotal:12},{malId:3,sourceSeason:2,episodesTotal:12},{malId:4,sourceSeason:2,episodesTotal:12}]);
 assert.deepEqual(grouped.records.map(r=>r.episodesSeen),[12,12,12,5]);assert(grouped.complete);
 assert.equal(plans.buildSeasonProgressPlan('S01E25',[{sourceSeason:1,episodesTotal:13},{sourceSeason:2,episodesTotal:12}]).remainingUnallocatedEpisodes,0);
 const ambiguous=[{malId:2,title:'Example 2nd Season',startDate:'2024-01-01',type:'TV',episodes:12},{malId:3,title:'Example Season 2',startDate:'2024-02-01',type:'TV',episodes:12}];
 assert.equal(links.findNext({malId:1,title:'Example',startDate:'2023-01-01'},()=>ambiguous),null);
 const server=require('../server'),db=require('../db');await db.whenReady();
 const groupedRows=[
  {malId:995501,title:'Beta55 Grouped Fixture',startDate:'2020-01-01'},
  {malId:995502,title:'Beta55 Grouped Fixture Part 2',startDate:'2020-07-01'},
  {malId:995503,title:'Beta55 Grouped Fixture 2nd Season',startDate:'2021-01-01'},
  {malId:995504,title:'Beta55 Grouped Fixture 2nd Season Part 2',startDate:'2021-07-01'}
 ].map(a=>({...a,type:'TV',episodes:12}));
 const bridgedRows=[{malId:995511,title:'Sky Archive',type:'TV',episodes:12,startDate:'2020-01-01'},{malId:995512,title:'Sky Archive Film',type:'Movie',episodes:1,startDate:'2020-07-01'},{malId:995513,title:'An Unrelated Sequel Subtitle',type:'TV',episodes:12,startDate:'2021-01-01'}];
 db.importMetadataRows([...groupedRows,...bridgedRows]);
 const item=(row,marker)=>({source:'BetaSeries',classification:'anime',sourceTitle:row.title,row:{id:'test-'+row.malId,title:row.title,episode:marker,status:'50',remaining:'7'},found:{malId:String(row.malId),officialTitle:row.title,type:'TV',episodesTotal:'12',startDate:row.startDate},anime:{malId:String(row.malId),title:row.title,type:'TV',episodesTotal:'12',tags:['BetaSeries']}});
 const expanded=await server.__test.expandBetaSeriesProgressItems([item(groupedRows[0],'S02E17')],{localOnly:true});
 assert.deepEqual(expanded.map(a=>Number(a.anime.episodesSeen)),[12,12,12,5],JSON.stringify(expanded.map(a=>({id:a.anime.malId,title:a.anime.title,seen:a.anime.episodesSeen,season:a.anime.betaseriesSeason,part:a.anime.partNumber}))));assert.deepEqual(expanded.map(a=>Number(a.anime.betaseriesSeason)),[1,1,2,2]);
 const cacheFile=path.join(dir,'cache/betaseries-season-relations-v2.json');fs.mkdirSync(path.dirname(cacheFile),{recursive:true});
 const cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile)):{};
 const sequel=record=>[{relation:'Sequel',entry:[{mal_id:record.malId,name:record.title,type:'anime',mediaType:record.type}]}];
 cache['995511']={relations:sequel(bridgedRows[1]),updatedAt:new Date().toISOString()};cache['995512']={relations:sequel(bridgedRows[2]),updatedAt:new Date().toISOString()};fs.writeFileSync(cacheFile,JSON.stringify(cache));
 const bridged=await server.__test.expandBetaSeriesProgressItems([item(bridgedRows[0],'S02E03')],{localOnly:true});
 assert.deepEqual(bridged.map(a=>Number(a.anime.malId)),[995511,995513]);assert.deepEqual(bridged.map(a=>Number(a.anime.episodesSeen)),[12,3]);
 let original;
 if(fixture){
  original=JSON.parse(fs.readFileSync(path.join(fixture,'animes.json')));
  const rows=server.__test.readAnimes();
  assert.equal(rows.filter(a=>Number(a.malId)===1735).length,1);assert(!rows.some(a=>a.id===282));
  assert.equal(rows.find(a=>Number(a.malId)===1735).episodesSeen,'500');assert(!rows.some(a=>a.id===271));
  assert.equal(Number(rows.find(a=>a.id===138).malId),55813);assert.equal(db.getMetadataByMalId(52211).title,'Mashle');
  assert.equal(Number(rows.find(a=>a.id===170).malId),39489);assert.equal(rows.find(a=>a.id===170).episodesSeen,'6');
  for(const row of rows){const before=original.find(a=>a.id===row.id);if(before){assert.equal(row.score,before.score);assert.equal(row.customTitle,before.customTitle);}}
 }else{
  db.writeAllAnimes([{id:1,title:'Toaru Ossan no VRMMO Katsudouki',malId:'54431',type:'TV',status:'Completed',episodesSeen:'12',episodesTotal:'12',startDate:'2023-10-02',synopsis:'A virtual world.',genres:['Fantasy'],imageUrl:'/assets/design/moon-library.webp',unallocatedEpisodes:1,betaseriesEpisode:'S01E13',tags:['BetaSeries']},{id:2,title:'Meitantei Conan',malId:'235',type:'TV',status:'Watching',startDate:'1996-01-08',synopsis:'A detective story.',genres:['Mystery'],imageUrl:'/assets/design/moon-library.webp',episodesTotal:'',betaseriesProgressScope:'season-marker'}]);
 }
 host=await server.startServer(0);const origin='http://127.0.0.1:'+host.almPort;
 async function api(url,body,method='POST'){const r=await nativeFetch(origin+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 const before=await api('/api/library/completion-issues');
 assert(before.awaiting.some(a=>Number(a.id)===(fixture?316:2)));
 const gapId=fixture?5:1,issue=before.items.find(a=>a.id===gapId);assert.equal(issue.kind,'progress');assert.deepEqual(issue.missing,['progression importée']);
 const detail=await api('/api/animes/'+gapId+'/import-gap');
 let response=await nativeFetch(origin+'/api/animes/'+gapId+'/preserve-import-gap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint:'stale'})});assert.equal(response.status,409);
 await api('/api/animes/'+gapId+'/preserve-import-gap',{fingerprint:detail.fingerprint});assert(!(await api('/api/library/completion-issues')).items.some(a=>a.id===gapId));assert.equal(db.getAnimeById(gapId).unallocatedEpisodes,1);
 const changed=server.__test.readAnimes();changed.find(a=>a.id===gapId).betaseriesEpisode='S01E14';server.__test.writeAnimes(changed);assert((await api('/api/library/completion-issues')).items.some(a=>a.id===gapId));
 // A user edit made while completion is running must win over that snapshot.
 const stale=server.__test.readAnimes(),fresh=server.__test.readAnimes(),freshGap=fresh.find(a=>a.id===gapId);
 freshGap.progressResolution={fingerprint:'explicit-choice',sourceEpisode:'S01E14'};freshGap.unallocatedEpisodes=2;freshGap.progressWarning='Keep the new source discrepancy';server.__test.writeAnimes(fresh);
 stale.find(a=>a.id===gapId).unallocatedEpisodes=0;server.__test.writeCompletionAnimes(stale);
 assert.equal(db.getAnimeById(gapId).unallocatedEpisodes,2);assert.equal(db.getAnimeById(gapId).progressResolution.fingerprint,'explicit-choice');
 const restored=server.__test.readAnimes();Object.assign(restored.find(a=>a.id===gapId),{unallocatedEpisodes:1,progressWarning:''});server.__test.writeAnimes(restored);
 const job=await api('/api/bulk/info-only',{retryMarked:true});let result;
 for(let n=0;n<2000;n++){result=await api('/api/bulk/complete-all/progress/'+job.jobId);if(['done','error','cancelled'].includes(result.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(result.status,'done',JSON.stringify(result));const after=await api('/api/library/completion-issues');
 const rows=server.__test.readAnimes();assert.equal(new Set(rows.filter(a=>a.malId).map(a=>Number(a.malId))).size,rows.filter(a=>a.malId).length);
 const persisted=JSON.parse(fs.readFileSync(path.join(dir,'animes.json')));assert.equal(persisted.length,rows.length);
 assert.equal(db.getMetadataByMalId(52211).title,'Mashle');assert(rows.every(a=>!a.episodesTotal||Number(a.episodesSeen||0)<=Number(a.episodesTotal)));
 const counts=items=>items.reduce((out,a)=>(out[a.kind]=(out[a.kind]||0)+1,out),{});
 const catalogueReport=path.join(dir,'backups/beta55-catalogue-report.json');
 const migration=fs.existsSync(catalogueReport)?JSON.parse(fs.readFileSync(catalogueReport)):{};
 const summary={fixture:!!fixture,originalRecords:original?.length,afterStartupIssues:before.items.length,afterCompletionIssues:after.items.length,beforeKinds:counts(before.items),afterKinds:counts(after.items),awaiting:after.awaiting.length,records:rows.length,canonicalRowsRepaired:migration.corrected?.length||0,automaticAliasesRemoved:migration.removedAliases?.length||0,job:{done:result.done,total:result.total,failed:result.failed,successful:result.successful},remainingSeasons:after.items.filter(a=>a.kind==='season').map(a=>a.title)};
 if(fixture){fs.mkdirSync(path.join(__dirname,'../verification/beta55'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../verification/beta55/vm-summary.json'),JSON.stringify(summary,null,2));}
 // Restart a new Node process against the persisted copy, not the loaded cache.
 const keys=['id','malId','title','customTitle','score','status','episodesSeen','episodesTotal','notes','betaseriesEpisode','unallocatedEpisodes','progressResolution','seriesSeasonStatuses'];
 const projection=values=>values.map(a=>Object.fromEntries(keys.filter(k=>Object.hasOwn(a,k)).map(k=>[k,a[k]]))).sort((a,b)=>a.id-b.id);
 fs.writeFileSync(path.join(dir,'restart-expected.json'),JSON.stringify(projection(rows)));
 server.stopBackups();await new Promise(resolve=>{host.close(resolve);host.closeAllConnections?.();});host=null;db.close();
 const probe=`(async()=>{global.fetch=()=>Promise.reject(Error('Offline restart'));const fs=require('fs'),path=require('path'),assert=require('assert/strict');const server=require('./server'),db=require('./db');await db.whenReady();const keys=${JSON.stringify(keys)};const rows=server.__test.readAnimes().map(a=>Object.fromEntries(keys.filter(k=>Object.hasOwn(a,k)).map(k=>[k,a[k]]))).sort((a,b)=>a.id-b.id);assert.deepEqual(rows,JSON.parse(fs.readFileSync(path.join(process.env.ALM_DATA_DIR,'restart-expected.json'))));server.stopBackups();db.close();console.log('OK Beta55 restart: repaired identities, personal fields and preserved discrepancies persist without another migration.');})().catch(e=>{console.error(e);process.exitCode=1;});`;
 console.log(require('node:child_process').execFileSync(process.execPath,['-e',probe],{cwd:path.resolve(__dirname,'..'),env:process.env,timeout:30000,encoding:'utf8'}).trim());
 console.log('OK Beta55: canonical repair, aliases, ambiguity, split cours, continuous series, version identity, independent progress review, optimistic concurrency and preserved source data.');console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);clearInterval(keepAlive);});
