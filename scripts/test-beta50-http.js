'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm50-http-'));let listener;
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_MAL_CLIENT_ID='fixture50';fs.mkdirSync(process.env.ALM_IMAGES_DIR);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch,imageCalls=[];global.fetch=(u,o)=>{
 if(String(u).startsWith('http://127.0.0.1:'))return nativeFetch(u,o);
 if(String(u).startsWith('https://api.myanimelist.net/v2/anime/985012')){imageCalls.push(985012);return Promise.resolve(new Response(JSON.stringify({id:985012,title:'Image Fixture',media_type:'tv',num_episodes:12,main_picture:{large:'https://example.invalid/verified-cover.jpg'}}),{headers:{'Content-Type':'application/json'}}));}
 return Promise.reject(Error('Offline fixture'));
};
(async()=>{
 const server=require('../server'),db=require('../db');await db.whenReady();
 const common={type:'TV',synopsis:'A sufficiently detailed synopsis for this isolated fixture only.',genres:['Fantasy'],startDate:'2020-01-01',episodesTotal:'12',poster:'/images/personal.jpg'};
 const base={id:1,malId:985001,title:'Gate Fixture',betaseriesId:'gate',betaseriesSeason:1,episodesSeen:'12',status:'Completed',...common};
 const unresolved={id:2,title:'Gate Fixture — Saison 2',betaseriesSeriesId:'gate',manualSeasonNumber:2,betaseriesSeason:2,episodesSeen:'8',episodesTotal:'',tags:['saison à identifier'],status:'Watching',score:'9',notes:'Keep this note'};
 const other={id:3,title:'Unselected fixture',malId:985003,type:'TV',episodesSeen:'3',episodesTotal:'',notes:'Keep unselected'};
 db.importMetadataRows([{malId:985001,title:base.title,type:'TV',episodes:12},{malId:985002,title:'Gate Fixture 2nd Season',type:'TV',episodes:12,synopsis:common.synopsis,genres:common.genres,startDate:common.startDate},{malId:985003,title:other.title,type:'TV',episodes:12}]);
 db.writeAllAnimes([base,unresolved,other]);fs.mkdirSync(path.join(dir,'cache'),{recursive:true});fs.writeFileSync(path.join(dir,'cache/betaseries-season-relations-v2.json'),JSON.stringify({'985001':{updatedAt:new Date().toISOString(),relations:[{relation:'Sequel',entry:[{mal_id:985002,type:'anime',name:'Gate Fixture 2nd Season',mediaType:'TV',episodesTotal:12}]}]}}));
 listener=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+listener.address().port;
 let progress;
 async function api(url,body,method='POST'){const r=await nativeFetch(origin+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 for(const status of ['Watching','Plan to Watch','Completed']){await api('/api/animes/1/season-status',{status},'PATCH');const a=db.getAnimeById(1);assert.equal(a.status,status);assert.equal(a.episodesSeen,'12');}
 await api('/api/animes/2/season-status',{status:'Completed'},'PATCH');assert.equal(db.getAnimeById(2).episodesTotal,'');assert.equal(db.getAnimeById(2).episodesSeen,'8');
 await api('/api/animes/1/season-status',{season:3,status:'Plan to Watch'},'PATCH');assert.equal(db.getAnimeById(1).seriesSeasonStatuses[3],'Plan to Watch');
 const invalid=await nativeFetch(origin+'/api/animes/1/season-status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'invalid'})});assert.equal(invalid.status,400);
 // Exercise the online image source before deliberate outages can open the
 // shared source cooldown. The offline season cases remain separate below.
 process.env.ALM_MAL_CLIENT_ID='fixture50-image'; // Separate source health from the deliberately offline earlier requests.
 const imageRows=db.getAllAnimes(),imageId=100;imageRows.push({id:imageId,malId:985012,title:'Image Fixture',...common,poster:'',imageUrl:'',episodesSeen:'5',status:'Watching'});db.writeAllAnimes(imageRows);db.importMetadataRows([{malId:985012,title:'Image Fixture',type:'TV',episodes:12,synopsis:common.synopsis,genres:common.genres,startDate:common.startDate}]);
 const imageJob=await api('/api/bulk/info-only',{ids:[imageId],retryMarked:true});
 for(let n=0;n<300;n++){progress=await api('/api/bulk/complete-all/progress/'+imageJob.jobId);if(progress.status==='done')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(progress.status,'done');assert(imageCalls.length>0);assert.equal(db.getAnimeById(imageId).imageUrl,'https://example.invalid/verified-cover.jpg');assert.equal(db.getAnimeById(imageId).episodesSeen,'5');
 process.env.ALM_MAL_CLIENT_ID='fixture50';
 const before=JSON.stringify(db.getAnimeById(3)),job=await api('/api/bulk/info-only',{ids:[2],retryMarked:true});
 for(let n=0;n<300;n++){progress=await api('/api/bulk/complete-all/progress/'+job.jobId);if(progress.status==='done')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(progress.status,'done');assert.equal(progress.total,1);const fixed=db.getAnimeById(2);assert.equal(Number(fixed.malId),985002);assert.equal(fixed.episodesTotal,'12');assert.equal(fixed.episodesSeen,'8');assert.equal(fixed.score,'9');assert.equal(fixed.notes,'Keep this note');assert.equal(fixed.status,'Completed');assert(!fixed.needsSequelCheck);assert.equal(JSON.stringify(db.getAnimeById(3)),before);
 // Completing a confirmed base can recover its cumulative overflow into a
 // verified second cour; it must not recreate the old guessed season card.
 db.importMetadataRows([{malId:985010,title:'Split Fixture',type:'TV',episodes:12},{malId:985011,title:'Split Fixture Part 2',type:'TV',episodes:12,synopsis:common.synopsis,genres:common.genres,startDate:common.startDate}]);
 const rows=db.getAllAnimes();rows.push({id:4,malId:985010,title:'Split Fixture',...common,betaseriesId:'split',betaseriesSeason:1,betaseriesEpisode:'S01E24',episodesSeen:'12',status:'Completed',unallocatedEpisodes:12,notes:'My split note'});db.writeAllAnimes(rows);
 const relationFile=path.join(dir,'cache/betaseries-season-relations-v2.json'),relations=JSON.parse(fs.readFileSync(relationFile));relations['985010']={updatedAt:new Date().toISOString(),relations:[{relation:'Sequel',entry:[{mal_id:985011,type:'anime',name:'Split Fixture Part 2',mediaType:'TV',episodesTotal:12}]}]};fs.writeFileSync(relationFile,JSON.stringify(relations));
 const repairJob=await api('/api/bulk/info-only',{ids:[4],retryMarked:true});
 for(let n=0;n<300;n++){progress=await api('/api/bulk/complete-all/progress/'+repairJob.jobId);if(progress.status==='done')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(progress.status,'done');assert.equal(db.getAnimeById(4).unallocatedEpisodes,0);assert.equal(db.getAnimeById(4).notes,'My split note');const cour=db.getAllAnimes().filter(a=>Number(a.malId)===985011);assert.equal(cour.length,1);assert.equal(cour[0].episodesSeen,'12');assert.equal(cour[0].episodesTotal,'12');assert.equal(cour[0].betaseriesSeason,1);assert.equal(cour[0].partNumber,2);
 const snapshot=server.__test.readAnimes();db.close();await db.initDb(dir);assert.deepEqual(server.__test.readAnimes(),snapshot);
 console.log('OK Beta50 HTTP: independent season statuses persist after reload; selected completion resolves a true S2 and a split cour through verified relations and preserves personal fields');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,listener);});
