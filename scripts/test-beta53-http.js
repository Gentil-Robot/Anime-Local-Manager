'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm53-http-')),keepAlive=setInterval(()=>{},1000);let host;
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
// Both the parent and its workers are isolated from all external services.
const preload=path.join(dir,'offline-worker.cjs');
fs.writeFileSync(preload,`let rateLimitStarted=false;
global.fetch=async url=>{
 const u=new URL(url),title=u.searchParams.get('q')||'';
 if(u.hostname==='api.tvmaze.com'){
  if(title==='Unavailable TV Fixture')return new Response('{}',{status:503});
  if(title==='Rate Limit Fixture'){
   if(!rateLimitStarted){rateLimitStarted=true;require('node:worker_threads').parentPort.postMessage({type:'fixture-network-start',fixture:'rate-limit',startedAt:Date.now()});}
   return new Response('{}',{status:429,headers:{'retry-after':'999999'}});
  }
  const type=title==='Animation Fixture'?'Animation':'Scripted';
  return new Response(JSON.stringify([{show:{id:53,name:title,type,language:'English',genres:[type==='Animation'?'Animation':'Drama']}}]),{headers:{'Content-Type':'application/json'}});
 }
 if(u.hostname==='api.jikan.moe')return new Response('{"data":[]}',{headers:{'Content-Type':'application/json'}});
 if(u.hostname==='graphql.anilist.co')return new Response('{"data":{"Page":{"media":[]}}}',{headers:{'Content-Type':'application/json'}});
 throw Error('Unexpected external fixture request');
};`);
const previews=[];let rateLimitNetworkStartedAt=null;const threads=require('node:worker_threads'),RealWorker=threads.Worker;
threads.Worker=class extends RealWorker{constructor(file,options){super(file,{...options,execArgv:['--require',preload]});this.on('message',m=>{if(m.type==='progress'&&m.preview)previews.push(m.preview);if(m.type==='fixture-network-start'&&m.fixture==='rate-limit'&&rateLimitNetworkStartedAt===null)rateLimitNetworkStartedAt=m.startedAt;});}};
const nativeFetch=global.fetch;global.fetch=(url,options)=>String(url).startsWith('http://127.0.0.1:')?nativeFetch(url,options):Promise.reject(Error('External network blocked by test'));
(async()=>{
 const server=require('../server'),db=require('../db');await db.whenReady();db.writeAllAnimes([]);
 const titles=['Verified Fantasy Anime Fixture','Dexter','Stargate SG-1','TV Film Fixture','Altered Carbon','Shared title','Animation Fixture','Unavailable TV Fixture'];
 const cache={};
 for(const [title,id]of [[titles[0],990053],['Shared title',990054]]){
  cache[title.toLowerCase()]={title,officialTitle:title,malId:id,type:'TV',source:'LocalMetadata',episodesTotal:'12',synopsis:'A verified fantasy plot.',genres:['Fantasy'],imageUrl:'/assets/design/moon-library.webp'};
  db.importMetadataRows([{malId:id,title,type:'TV',episodes:12,synopsis:'A verified fantasy plot.',genres:['Fantasy']}]);
 }
 cache['altered carbon']={title:'Altered Carbon',officialTitle:'Altered Carbon: Resleeved',malId:40485,type:'ONA',source:'LocalMetadata',episodesTotal:'1',matchingScore:100};
 fs.mkdirSync(path.join(dir,'cache'),{recursive:true});fs.writeFileSync(path.join(dir,'cache/betaseries-fast-cache.json'),JSON.stringify(cache));
 host=await new Promise(resolve=>{const listener=server.app.listen(0,'127.0.0.1',()=>resolve(listener));});const base='http://127.0.0.1:'+host.address().port;
 const post=async(endpoint,body)=>{const response=await nativeFetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(response.ok,endpoint);return response.json();};
 async function preview(id,csvTitles=titles){
  const form=new FormData();form.append('file',new Blob(['id,title,episode,remaining,status\n'+csvTitles.map((title,n)=>n+','+title+',S01E01,11,8').join('\n')],{type:'text/csv'}),'series.csv');form.append('progressId',id);
  const response=await nativeFetch(base+'/api/import/csv/preview',{method:'POST',body:form});assert(response.ok);return response.json();
 }
 const result=await preview('mixed53');assert.equal(result.items.length,8);assert.deepEqual(result.items.map(i=>i.sourceTitle),titles);
 assert.deepEqual({anime:result.counts.anime,nonAnime:result.counts.nonAnime,review:result.counts.review},{anime:1,nonAnime:4,review:3});
 const nonAnime=result.items.filter(i=>i.classification==='non_anime');assert(nonAnime.every(i=>i.importExcluded&&!i.forceImport));assert(nonAnime.every(i=>i.tvmaze?.type==='Scripted'));
 assert.equal(result.items.find(i=>i.sourceTitle==='Shared title').classification,'review');assert.equal(result.items.find(i=>i.sourceTitle==='Animation Fixture').classification,'review');
 assert.equal(result.counts.tvUnverified,1);assert.equal(db.getAllAnimes().length,0);
 const progress=await nativeFetch(base+'/api/import/csv/progress/mixed53?preview=1').then(r=>r.json());assert.equal(progress.status,'done');assert.equal(previews.length,8);assert.equal(new Set(previews.map(i=>i.index)).size,8);
 await post('/api/v2/content-audit/quarantine/bulk-dismiss',{keys:nonAnime.map(i=>i.reviewKey)});
 const again=await preview('again53');assert.equal(again.counts.nonAnime,4);assert.equal(again.counts.ignored,0);assert(again.items.filter(i=>i.classification==='non_anime').every(i=>i.reviewState==='dismissed'&&i.importExcluded));
 const imported=await post('/api/import/csv',{progressId:'import53',items:again.items});assert.equal(imported.added,1);assert.equal(imported.blocked,7);assert.equal(db.getAllAnimes().length,1);assert.equal(db.getAllAnimes()[0].title,titles[0]);
 process.env.ALM_CSV_ANALYSIS_NETWORK_BUDGET_MS='1000';
 const started=Date.now();const timed=await preview('bounded53',['Rate Limit Fixture']);const finished=Date.now();
 // Every preview starts a new worker and builds its local catalogue index before
 // either network phase starts. Measure from the first real fixture request,
 // timestamped inside that worker, so CPU/setup cost cannot consume this limit.
 // Keep the same 6000 ms limit for TV retries, anime enrichment and finalization.
 assert(Number.isFinite(rateLimitNetworkStartedAt),'Missing bounded-provider start timestamp');
 assert(rateLimitNetworkStartedAt>=started&&rateLimitNetworkStartedAt<=finished,'Invalid bounded-provider start timestamp');
 const localPreparationMs=rateLimitNetworkStartedAt-started,networkAndFinalizationMs=finished-rateLimitNetworkStartedAt;
 console.log('Beta53 bounded provider timing: '+JSON.stringify({localPreparationMs,networkAndFinalizationMs,totalMs:finished-started}));
 assert(networkAndFinalizationMs<6000,'Provider retry exceeded its phase budget');assert.equal(timed.items[0].classification,'review');assert.equal(timed.counts.tvUnverified,1);assert.equal(timed.items[0].importExcluded,true);
 console.log('OK Beta53 HTTP: real CSV worker classifies uncached TV/film evidence, retains all rows and cached decisions, exposes dismissed TV, signals incomplete checks and imports only the verified anime');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);clearInterval(keepAlive);});
