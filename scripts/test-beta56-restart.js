'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv.includes('--host')){
 const native=global.fetch;global.fetch=(u,o)=>String(u).startsWith('http://127.0.0.1:')?native(u,o):new Promise((_,reject)=>setTimeout(()=>reject(Error('Delayed offline source')),800));
 const server=require('../server'),db=require('../db');let listener;
 (async()=>{await db.whenReady();await db.prepareMetadataTitleIndex();listener=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});console.log('READY '+listener.address().port);})().catch(e=>{console.error(e);process.exitCode=1;});
 process.on('SIGTERM',()=>{server.stopBackups();listener?.close();listener?.closeAllConnections?.();db.close();process.exit(0);});
}else{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm56-restart-'));let child,output='';
 const env={...process.env,ALM_DATA_DIR:dir,ALM_IMAGES_DIR:path.join(dir,'images'),ALM_AUTOMATION_STARTUP:'0',ALM_BETASERIES_IMPORT_NETWORK_BUDGET_MS:'1000'};
 fs.mkdirSync(env.ALM_IMAGES_DIR);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
 async function start(){output='';child=spawn(process.execPath,[__filename,'--host'],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});for(let n=0;n<1000;n++){const match=output.match(/READY (\d+)/);if(match)return 'http://127.0.0.1:'+match[1];if(child.exitCode!==null)throw Error(output);await sleep(20);}throw Error('Host startup timeout '+output);}
 async function stop(signal){if(!child||child.exitCode!==null)return;const exited=new Promise(r=>child.once('exit',r));child.kill(signal);await exited;child=null;}
 async function request(origin,url,body){const r=await fetch(origin+url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert(r.ok,JSON.stringify(data));return data;}
 (async()=>{
  let origin=await start();
  const anime={title:'Toaru Ossan no VRMMO Katsudouki',malId:'54431',type:'TV',episodesSeen:'12',episodesTotal:'12',status:'Completed',synopsis:'A virtual world.',genres:['Fantasy'],startDate:'2023-10-02',imageUrl:'/assets/design/moon-library.webp',notes:'Preserve my note',score:'9'};
  const item={source:'BetaSeries',classification:'anime',sourceTitle:anime.title,row:{id:'restart-toaru',title:anime.title,episode:'S01E13',status:'100',remaining:'0'},found:{...anime,officialTitle:anime.title,source:'LocalMetadata'},anime};
  await request(origin,'/api/import/csv',{items:[item],progressId:'interrupted-import',background:true});
  for(let n=0;n<500;n++){const progress=await request(origin,'/api/import/csv/progress/interrupted-import');if(progress.phase==='relations'&&progress.status==='running')break;await sleep(10);}
  const journal=JSON.parse(fs.readFileSync(path.join(dir,'automation/library-tasks.json')));assert(journal.jobs.some(j=>j.id==='interrupted-import'&&['running','queued'].includes(j.status)));
  await stop('SIGKILL');origin=await start();let progress;
  for(let n=0;n<1000;n++){progress=await request(origin,'/api/import/csv/progress/interrupted-import');if(progress.result)break;await sleep(20);}
  assert.equal(progress.status,'done',JSON.stringify(progress));assert.equal(progress.result.added,1);assert(progress.result.enrichmentJobId);
  let job;for(let n=0;n<1000;n++){job=await request(origin,'/api/bulk/complete-all/progress/'+progress.result.enrichmentJobId);if(job.status==='done')break;await sleep(20);}assert.equal(job.status,'done');
  const rows=await request(origin,'/api/animes');assert.equal(rows.length,1);assert.equal(rows[0].score,'9');assert(rows[0].notes.includes('Preserve my note'));assert.equal(rows[0].unallocatedEpisodes,1);assert.equal(rows[0].betaseriesEpisode,'S01E13');
  await stop('SIGTERM');origin=await start();const persisted=await request(origin,'/api/animes');assert.deepEqual(persisted,rows);
  const tasks=(await request(origin,'/api/library/automation')).jobs;assert.equal(tasks.find(j=>j.id==='interrupted-import').status,'done');assert.equal(tasks.find(j=>j.id===progress.result.enrichmentJobId).status,'done');assert(!tasks.some(j=>j.status==='running'));
  console.log('OK Beta56 process restart: interrupted import resumes, enrichment follows, committed progress and personal data persist, and completed work is not restarted.');
 })().catch(e=>{console.error(e,output);process.exitCode=1;}).finally(async()=>{await stop('SIGTERM');await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
}
