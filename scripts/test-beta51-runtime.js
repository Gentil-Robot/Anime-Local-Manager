'use strict';
const assert=require('node:assert/strict'),express=require('express'),{groups,summary}=require('../public/series-state'),{mountAssociations}=require('../lib/anime-association');
const render=(key,args={})=>key+':'+(args.count??'');
const season={id:1,title:'Mushoku Tensei Season 3',manualSeasonNumber:3,type:'TV',status:'Completed',episodesSeen:'14',episodesTotal:'14'};
let group=groups([season])[0];assert.equal(group.followedCount,1);assert.deepEqual(group.missingStatuses,[1,2]);assert(summary(group,render).includes('seriesGapCount:2'));
group=groups([{...season,seriesSeasonStatuses:{1:'Completed',2:'Completed'}}])[0];assert.equal(group.followedCount,3);assert.deepEqual(group.missingStatuses,[]);assert.equal(summary(group,render),'seriesCount:3');assert.equal(group.seen,14);assert.equal(group.total,14);assert.deepEqual(group.gaps,[1,2]);
group=groups([{...season,seriesSeasonStatuses:{1:'bad',2:'Watching'}}])[0];assert.equal(group.followedCount,2);assert.deepEqual(group.missingStatuses,[1]);
group=groups([{id:2,title:'Conan',type:'TV',betaseriesSeason:1,betaseriesEpisode:'S26E34',betaseriesProgressScope:'season-marker',progressUnresolved:true}])[0];assert.equal(group.sourceSeason,26);assert.equal(summary(group,render),'seriesSourceSeasons:26');assert.equal(group.seasons.length,1);assert.equal(group.gaps.length,0);
console.log('OK Beta51: summary counts saved gap statuses, leaves unconfirmed episodes untouched and identifies the BetaSeries S26 division');
let server;
(async()=>{
 let rows=[{id:1,malId:10,title:'Old anime',status:'Watching',episodesSeen:'7',score:'9',notes:'Personal notes'}];
 const db={whenReady:async()=>{},getMetadataByMalId:id=>({malId:id,title:'Verified anime '+id,type:'TV',episodes:'12'})};
 const app=express();app.use(express.json());mountAssociations(app,{db,readAnimes:()=>structuredClone(rows),writeAnimes:next=>rows=next});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=body=>fetch('http://127.0.0.1:'+server.address().port+'/api/animes/1/reassociate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const [index,status]of ['Plan to Watch','Watching','Completed'].entries()){
  const id=20+index,response=await request({malId:id,expectedMalId:rows[0].malId,status});assert.equal(response.status,200);assert.equal(rows[0].malId,id);assert.equal(rows[0].status,status);assert.equal(rows[0].episodesSeen,'7');assert.equal(rows[0].score,'9');assert.equal(rows[0].notes,'Personal notes');
 }
 const original=structuredClone(rows);let response=await request({malId:30,expectedMalId:22,status:'Invalid'});assert.equal(response.status,400);assert.deepEqual(rows,original);
 rows.push({id:2,malId:30});response=await request({malId:30,expectedMalId:22,status:'Completed'});assert.equal(response.status,409);assert.equal(rows[0].malId,22);
 console.log('OK Beta51: atomic association and chosen statuses preserve notes, score and watched count; invalid status and duplicates leave the record unchanged');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server?.close());
