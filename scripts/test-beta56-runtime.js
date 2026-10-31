'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createAutomation}=require('../lib/library-automation'),validation=require('../lib/import-candidate-validation'),links=require('../lib/local-season-links');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm56-')),keepAlive=setInterval(()=>{},1000),sleep=ms=>new Promise(r=>setTimeout(r,ms));let host,api;
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_AUTOMATION_STARTUP='0';
fs.mkdirSync(process.env.ALM_IMAGES_DIR);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;global.fetch=(u,o)=>String(u).startsWith('http://127.0.0.1:')?nativeFetch(u,o):Promise.reject(Error('Offline verified fixture'));
(async()=>{
 const suspect=(title,found,episode='S01E13')=>validation.validate({title,episode},found).classification;
 assert.equal(suspect("DOTA: Dragon's Blood",{malId:150,officialTitle:'Blood+',type:'TV',source:'LocalMetadata',matchingScore:98}),'review');
 assert.equal(suspect('The Reincarnation of the Strongest Diviner',{malId:60661,officialTitle:'Reincarnation',type:'Music',source:'LocalMetadata',matchingScore:98}),'review');
 assert.equal(suspect('KonoSuba',{malId:49458,officialTitle:'KonoSuba 3rd Season',type:'TV',englishTitle:'KonoSuba',source:'LocalMetadata'},'S02E02'),'review');
 assert.equal(suspect('Slow Anime 2',{malId:10002,officialTitle:'Slow Anime 2',type:'TV',source:'LocalMetadata'},'S02E02'),'anime');
 assert.equal(suspect('UQ Holder!',{malId:33478,officialTitle:'UQ Holder! Mahou Sensei Negima! 2',englishTitle:'UQ Holder!',type:'TV',source:'LocalMetadata'}),'anime');
 assert.equal(suspect('Chillin in Another World With Level 2 Super Cheat Powers',{malId:56923,officialTitle:'Lv2 kara Cheat datta Motoyuusha Kouho no Mattari Isekai Life',englishTitle:'Chillin in Another World With Level 2 Super Cheat Powers',synonyms:['Life from Level 2'],type:'TV',source:'LocalMetadata'}),'anime');
 const gate={malId:1,title:'Gate: Jieitai Kanochi nite, Kaku Tatakaeri',type:'TV',episodes:12,startDate:'2015-07-01'},part={malId:2,title:gate.title+' Part 2',synonyms:[gate.title+' 2nd Season'],type:'TV',episodes:12,startDate:'2016-01-01'};
 assert.deepEqual(links.descriptor(part),{season:0,part:2,of:''});assert.equal(links.findNext(gate,()=>[part]).proof.split,true);
 assert.equal(links.findNext({malId:10,title:'Shingeki no Kyojin',startDate:'2013-01-01'},()=>[{malId:11,title:'Shingeki no Kyojin: The Final Season Part 2',synonyms:['Shingeki no Kyojin Part 2'],type:'TV',episodes:12,startDate:'2022-01-01'}]),null);
 // Durable queue: a task interrupted in one engine is resumed by another.
 const taskDir=path.join(dir,'journal-test'),first=createAutomation(taskDir);let release;
 first.start({hold:()=>new Promise(r=>{release=r;})});first.enqueue('hold',{marker:'S01E24'},'restart-test');
 for(let n=0;n<100&&!release;n++)await sleep(5);assert(release);first.stop();
 const restarted=createAutomation(taskDir);assert.equal(restarted.job('restart-test').status,'queued');let executions=0;
 restarted.start({hold:async job=>{assert.equal(job.payload.marker,'S01E24');executions++;return {ok:true};}});release({ok:true});
 for(let n=0;n<100&&restarted.job('restart-test').status!=='done';n++)await sleep(5);assert.equal(executions,1);assert.equal(restarted.job('restart-test').status,'done');
 restarted.remember(gate,part,{source:'canonical-title',split:true},'catalogue-v1');assert.equal(restarted.next(gate,()=>part,'catalogue-v1').row.malId,2);assert.equal(restarted.next(gate,()=>part,'catalogue-v2'),null);assert.equal(restarted.next(gate,()=>({...part,episodes:13}),'catalogue-v1'),null);
 const before=[{id:1,title:'Example',score:'9',episodesSeen:'12',unallocatedEpisodes:12,betaseriesEpisode:'S01E24'}],after=[{...before[0],unallocatedEpisodes:0},{id:2,title:'Example Part 2',episodesSeen:'12'}];
 const correction=restarted.record('season-allocation',before,after);assert(restarted.history(after)[0].canUndo);
 const diagnostic=after.map(a=>Object.fromEntries(Object.entries({...a,autoCompletionCheckedAt:'2026-10-11',completionNeedsEpisodes:false}).reverse()));assert(restarted.history(diagnostic)[0].canUndo);
 assert.throws(()=>restarted.undo(correction,[{...after[0],score:'8'},after[1]]),/ALM_CORRECTION_CHANGED/);
 const undo=restarted.undo(correction,diagnostic);assert.equal(undo.rows.length,1);assert.equal(undo.rows[0].score,'9');assert.equal(undo.rows[0].unallocatedEpisodes,12);undo.commit();assert(!restarted.history(after)[0].canUndo);restarted.stop();
 api=require('../server');const db=require('../db');await db.whenReady();await db.prepareMetadataTitleIndex();
 assert.equal(db.searchMetadataByTitle('Detective Conan',8)[0].malId,235);
 const canonical=(id,malId,family,marker,extra)=>{const m=db.getMetadataByMalId(malId);return {id,title:m.title,canonicalTitle:m.title,malId:String(malId),type:m.type,startDate:m.startDate,endDate:m.endDate,synopsis:m.synopsis,genres:m.genres,imageUrl:'/assets/design/moon-library.webp',episodesTotal:String(m.episodes),episodesSeen:String(m.episodes),status:'Completed',notes:'Personal note '+id,score:'9',betaseriesSeriesId:family,betaseriesId:family,betaseriesSeason:1,betaseriesEpisode:marker,betaseriesSourceTitle:m.title,unallocatedEpisodes:extra,tags:['BetaSeries']};};
 const rows=[canonical(1,28907,'gate','S01E24',12),canonical(2,53613,'dmdp','S01E24',12),canonical(3,54431,'toaru','S01E13',1)];
 db.writeAllAnimes(rows);host=await api.startServer(0);const origin='http://127.0.0.1:'+host.almPort;
 async function request(url,body){const r=await nativeFetch(origin+url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();assert(r.ok,JSON.stringify(value));return {value,status:r.status};}
 const started=(await request('/api/bulk/info-only',{ids:[1,2,3],retryMarked:true})).value;let result,maxRtt=0;
 for(let n=0;n<2000;n++){const at=Date.now();result=(await request('/api/bulk/complete-all/progress/'+started.jobId)).value;maxRtt=Math.max(maxRtt,Date.now()-at);if(['done','error','cancelled'].includes(result.status))break;await sleep(10);}
 assert.equal(result.status,'done',JSON.stringify(result));assert(maxRtt<2000,'Progress endpoint must remain responsive');
 const current=api.__test.readAnimes();for(const [family,expected]of [['gate',[28907,31637]],['dmdp',[53613,54743]]]){const items=current.filter(a=>a.betaseriesSeriesId===family);assert.deepEqual(items.map(a=>Number(a.malId)).sort((a,b)=>a-b),expected);assert.deepEqual(items.map(a=>Number(a.episodesSeen)),[12,12]);assert(items.every(a=>!Number(a.unallocatedEpisodes)));}
 for(const original of rows){const a=current.find(a=>a.id===original.id);for(const field of ['notes','score','status','episodesSeen'])assert.equal(a[field],original[field]);}
 const issues=(await request('/api/library/completion-issues')).value;assert(!issues.items.some(a=>a.id===3));assert.equal(issues.awaiting.find(a=>a.id===3).kind,'source-gap');assert.equal(current.find(a=>a.id===3).unallocatedEpisodes,1);assert.equal(result.waiting,1);assert.equal(result.resolved,2);
 const item={source:'BetaSeries',classification:'anime',sourceTitle:rows[0].title,row:{id:'gate',title:rows[0].title,episode:'S01E24',status:'100',remaining:'0'},found:{malId:'28907',officialTitle:rows[0].title,type:'TV',episodesTotal:'12',source:'LocalMetadata'},anime:rows[0]};
 const count=current.length;
 for(let round=0;round<2;round++){
  const id='background-repeat-'+round,begin=Date.now();const accepted=await request('/api/import/csv',{items:[item],progressId:id,background:true});assert.equal(accepted.status,202);assert(Date.now()-begin<2000);
  let progress;for(let n=0;n<2000;n++){progress=(await request('/api/import/csv/progress/'+id)).value;if(progress.result||['error','cancelled'].includes(progress.status))break;await sleep(10);}
  assert.equal(progress.status,'done',JSON.stringify(progress));assert.equal(progress.result.added,0);assert.equal(api.__test.readAnimes().length,count);
 }
 const history=(await request('/api/library/automation')).value.history;assert(history.some(a=>a.label==='season-allocation'));
 const detail=(await request('/api/animes/3/import-gap')).value;assert.equal(detail.sourcePosition,'S01E13');assert.equal(detail.episodesSeen,'12');assert.equal(detail.unallocated,1);
 const memory=JSON.parse(fs.readFileSync(path.join(dir,'automation/verified-series-links.json')));assert.equal(memory.links['28907'].nextMalId,31637);assert.equal(memory.links['53613'].nextMalId,54743);
 // Undoing a selected association must also survive the next completion pass.
 for(let n=0;n<2000;n++){const tasks=(await request('/api/library/automation')).value.jobs;if(!tasks.some(a=>['queued','running'].includes(a.status)))break;await sleep(10);}
 const manual={id:100,title:'Chosen relation 2nd Season',manualSeasonNumber:2,betaseriesSeason:2,betaseriesSeriesId:'gate',betaseriesEpisode:'S02E07',episodesSeen:'7',status:'Watching',notes:'Keep the original association',score:'8',tags:['BetaSeries','saison à identifier']};
 api.__test.writeAnimes([...api.__test.readAnimes(),manual]);
 db.importMetadataRows([{malId:986602,title:manual.title,type:'TV',episodes:12,startDate:'2020-01-01',synopsis:'A verified fixture synopsis.',genres:['Fantasy'],imageUrl:'/assets/design/moon-library.webp'}]);
 await request('/api/animes/100/reassociate',{malId:986602,expectedMalId:0,status:'Watching'});
 const association=(await request('/api/library/automation')).value.history.find(a=>a.label==='manual-association');assert(association.canUndo);
 await request('/api/library/corrections/'+association.id+'/undo',{});
 const retry=(await request('/api/bulk/info-only',{ids:[100],retryMarked:true})).value;
 for(let n=0;n<2000;n++){const p=(await request('/api/bulk/complete-all/progress/'+retry.jobId)).value;if(p.status==='done')break;await sleep(10);}
 const undone=api.__test.readAnimes().find(a=>a.id===100);assert(!undone.malId);assert.equal(undone.notes,manual.notes);assert.equal(undone.episodesSeen,'7');assert.equal(undone.automationDecision.kind,'undo');
 console.log('OK Beta56: durable resume, verified link invalidation, safe undo, false-candidate rejection, canonical parts, exact Conan alias, responsive background import, automatic enrichment, stable reimport and preserved personal data.');
 console.log(JSON.stringify({resolved:result.resolved,waiting:result.waiting,decisions:result.failed,records:count,maxProgressRttMs:maxRtt}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);clearInterval(keepAlive);});
