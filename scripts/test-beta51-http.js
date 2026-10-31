'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm51-live-'));let listener;const keepAlive=setInterval(()=>{},1000);
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_CSV_ANALYSIS_NETWORK_BUDGET_MS='60000';fs.mkdirSync(process.env.ALM_IMAGES_DIR);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
// Worker threads inherit this preload: every remote fetch is answered by synthetic data without any network request.
const offlinePreload=path.join(dir,'offline-worker.cjs');fs.writeFileSync(offlinePreload,`globalThis.fetch=async(url)=>{await new Promise(r=>setTimeout(r,50));const u=new URL(url);const body=u.hostname==='api.tvmaze.com'?[]:u.hostname==='api.jikan.moe'?{data:[{mal_id:988000,title:u.searchParams.get('q')||'Unknown Streaming Fixture',type:'TV',episodes:12}]}:{data:{Page:{media:[]}}};return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});};\n`);const threads=require('node:worker_threads'),RealWorker=threads.Worker;threads.Worker=class extends RealWorker{constructor(file,options){super(file,{...options,execArgv:['--require',offlinePreload]});}};
const realFetch=global.fetch;global.fetch=(url,options)=>String(url).startsWith('http://127.0.0.1:')?realFetch(url,options):Promise.reject(Error('Offline test fixture'));
(async()=>{
 const server=require('../server'),db=require('../db');await db.whenReady();db.writeAllAnimes([]);
 const cache={};let csv='id,title,episode,remaining,status\n';for(let n=0;n<380;n++){const title='Streaming Anime Fixture '+n;cache[title.toLowerCase()]={title,officialTitle:title,malId:987000+n,type:'TV',episodesTotal:'12',source:'LocalMetadata',matchingScore:100};csv+=n+','+title+',S01E03,9,25\n';}
 // Six uncertain entries keep the job alive long enough to observe its cached batch.
 for(let n=0;n<6;n++)csv+=(400+n)+',Unknown Streaming Fixture '+n+',S01E01,0,0\n';
 fs.mkdirSync(path.join(dir,'cache'),{recursive:true});fs.writeFileSync(path.join(dir,'cache/betaseries-fast-cache.json'),JSON.stringify(cache));
 listener=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+listener.address().port;
 const form=new FormData();form.append('file',new Blob([csv],{type:'text/csv'}),'series.csv');form.append('progressId','live51');
 let complete=false;const pending=realFetch(base+'/api/import/csv/preview',{method:'POST',body:form}).then(async response=>{assert.equal(response.status,200);const result=await response.json();complete=true;return result;});
 let cursor=0,sawRunning=false;const indexes=new Set(),samples=[];
 for(let n=0;n<300&&!complete;n++){
  const response=await realFetch(base+'/api/import/csv/progress/live51?preview=1&cursor='+cursor),progress=await response.json();assert.equal(response.status,200);samples.push([progress.status,progress.done,progress.previews?.length]);
  if(progress.previews?.length){assert(progress.previews.length<=100);assert.equal(progress.previewCursor,cursor+progress.previews.length);if(progress.status==='running')sawRunning=true;for(const entry of progress.previews){assert(!indexes.has(entry.index));indexes.add(entry.index);assert(entry.item.sourceTitle);}cursor=progress.previewCursor;}
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 const result=await pending;assert.equal(result.items.length,386);assert(sawRunning,'No results streamed while the actual worker was running: '+JSON.stringify(samples.slice(-10)));assert(indexes.size>=1);assert.equal(db.getAllAnimes().length,0);
 const final=await realFetch(base+'/api/import/csv/progress/live51').then(r=>r.json());assert.equal(final.status,'done');assert.equal(final.done,386);assert(!final.previews);
 console.log('OK Beta51 HTTP: actual CSV worker delivers incremental results, cursor batches contain no duplicates, final response is complete and preview never imports the collection');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,listener);clearInterval(keepAlive);});
