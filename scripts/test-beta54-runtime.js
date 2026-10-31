'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm54-'));let host;const keepAlive=setInterval(()=>{},1000);
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;global.fetch=(u,o)=>String(u).startsWith('http://127.0.0.1:')?nativeFetch(u,o):Promise.reject(Error('Offline regression fixture'));
(async()=>{
 const server=require('../server'),db=require('../db'),integrity=require('../lib/import-integrity');await db.whenReady();await db.prepareMetadataTitleIndex();
 const meta={malId:54431,title:'Toaru Ossan no VRMMO Katsudouki',type:'TV',episodes:12,startDate:'2023-10-02',genres:['Fantasy'],synopsis:'A man explores a fantasy virtual world.',imageUrl:'/assets/design/moon-library.webp'};
 db.importMetadataRows([meta,{...meta,malId:985402,title:'Bulk exact first season'},{...meta,malId:985403,title:'Manual remains manual'}]);
 const first={id:1,title:meta.title,status:'Watching',episodesSeen:'12',episodesTotal:'12',betaseriesSeason:1,tags:['BetaSeries','progression à vérifier'],notes:'Personal notes',score:'8'};
 assert(integrity.acceptsInfo(first,{malId:meta.malId,officialTitle:meta.title,type:'TV'}));
 assert(integrity.acceptsInfo({...first,title:'Official English alias'},{malId:meta.malId,officialTitle:meta.title,englishTitle:'Official English alias',type:'TV'}));
 assert(!integrity.acceptsInfo({...first,title:'Unverified query echo'},{malId:meta.malId,officialTitle:meta.title,title:'Unverified query echo',type:'TV'}));
 assert(!integrity.acceptsInfo({...first,betaseriesSeason:2},{malId:meta.malId,officialTitle:meta.title,type:'TV'}));
 assert(!integrity.acceptsInfo({...first,partNumber:2},{malId:meta.malId,officialTitle:meta.title,type:'TV'}));
 assert(!integrity.acceptsInfo({...first,title:'Another anime'},{malId:meta.malId,officialTitle:meta.title,type:'TV'}));
 db.writeAllAnimes([first,{...first,id:2,title:'Bulk exact first season'}, {...first,id:3,title:'Manual remains manual'}, {...first,id:4,title:'Explicit identity review',importIdentityReview:true}]);
 host=await server.startServer(0);const origin='http://127.0.0.1:'+host.almPort;
 async function api(url,body,method='POST'){const response=await nativeFetch(origin+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;}
 const getIssues=()=>api('/api/library/completion-issues');
 assert((await getIssues()).items.some(a=>a.id===1));
 const edited=await api('/api/animes/1',{status:'Completed',autoInfo:true},'PUT');
 assert.equal(Number(edited.malId),meta.malId);assert.equal(edited.status,'Completed');assert.equal(edited.notes,first.notes);assert.equal(edited.score,'8');assert.equal(edited.episodesSeen,'12');assert(edited.synopsis);assert(edited.imageUrl);
 assert(!(await getIssues()).items.some(a=>a.id===1));
 // The library API and the independent audit agree after an ordinary edit.
 assert.equal(Number((await api('/api/animes')).find(a=>a.id===1).malId),meta.malId);
 for(let n=0;n<2;n++)assert(!(await api('/api/v2/content-audit')).completion.items.some(a=>a.id===1));
 const job=await api('/api/bulk/info-only',{ids:[2],retryMarked:true});let final;
 for(let n=0;n<300;n++){final=await api('/api/bulk/complete-all/progress/'+job.jobId);if(['done','error','cancelled'].includes(final.status))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(final.status,'done',JSON.stringify(final));assert.equal(Number(db.getAnimeById(2).malId),985402);assert(!(await getIssues()).items.some(a=>a.id===2));
 const manual=await api('/api/animes/3',{title:'Manual remains manual',autoInfo:false},'PUT');assert(!manual.malId);
 const review=await api('/api/animes/4',{title:'Explicit identity review',autoInfo:true},'PUT');assert(review.importIdentityReview);assert(!review.malId);
 // Selecting a verified proposal changes the same saved record, idempotently.
 const associated=await api('/api/animes/4/reassociate',{malId:54431,expectedMalId:0,status:'Completed'}).catch(()=>null);
 assert.equal(associated,null); // A different existing record already owns this ID.
 const rows=server.__test.readAnimes();rows.push({...first,id:5,title:'Choose the proposal'});server.__test.writeAnimes(rows);
 db.importMetadataRows([{...meta,malId:985405,title:'Selected official proposal'}]);
 for(const expectedMalId of [0,985405]){const a=await api('/api/animes/5/reassociate',{malId:985405,expectedMalId,status:'Completed'});assert.equal(a.id,5);assert.equal(a.notes,first.notes);assert.equal(a.score,'8');assert.equal(a.status,'Completed');}
 assert(!(await getIssues()).items.some(a=>a.id===5));
 const persisted=JSON.parse(fs.readFileSync(path.join(dir,'animes.json')));assert.equal(Number(persisted.find(a=>a.id===1).malId),54431);assert.equal(Number(persisted.find(a=>a.id===5).malId),985405);
 const song=require('../public/karaoke/song.json');assert.equal(song.karaoke.translationHighlight.enabled,false);assert.equal(song.title,'Where stories come alive');
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');assert(!html.includes('Threads of Stories'));assert(html.includes('data-design-text="songTranslation"'));
 console.log('OK Beta54: exact provisional S1 resolves; S2/parts and identity conflicts protected; edit honours autoInfo; bulk fills and removes completed records; saved association is idempotent; audit agrees; translations fixed, current song title.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);clearInterval(keepAlive);});
