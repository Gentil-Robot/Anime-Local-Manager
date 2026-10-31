'use strict';
const assert=require('node:assert/strict'),express=require('express'),{mountAssociations}=require('../lib/anime-association');
let server;
(async()=>{
 let rows=[{id:1,malId:10,title:'Previous',episodesSeen:'2',score:'7',notes:'Earlier notes'}],release,enter;
 let started,foreign=false;const gate=()=>{started=new Promise(resolve=>enter=resolve);};
 const app=express();app.use(express.json());mountAssociations(app,{db:{whenReady:async()=>{},getMetadataByMalId:()=>null},readAnimes:()=>structuredClone(rows),writeAnimes:next=>rows=next,fetchRecord:async id=>{enter();return new Promise(resolve=>{release=()=>resolve({malId:foreign?id+1:id,title:'Verified new anime',type:'TV',episodesTotal:'12',poster:''});});}});
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=body=>fetch(base+'/api/animes/1/reassociate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 gate();let pending=request({malId:20,expectedMalId:10});await started;rows[0].episodesSeen='3';rows[0].notes='Latest notes';release();let response=await pending;assert.equal(response.status,200);assert.equal(rows[0].episodesSeen,'3');assert.equal(rows[0].notes,'Latest notes');assert.equal(rows[0].score,'7');console.log('OK association: delayed source response preserves an episode and notes edited during the wait');
 gate();pending=request({malId:30,expectedMalId:20});await started;rows[0].malId=40;rows[0].episodesSeen='4';release();response=await pending;assert.equal(response.status,409);assert.equal(rows[0].malId,40);assert.equal(rows[0].episodesSeen,'4');console.log('OK association: a stale source response cannot replace a more recent association');
 const original=structuredClone(rows);foreign=true;gate();pending=request({malId:50,expectedMalId:40});await started;release();response=await pending;assert.equal(response.status,404);assert.deepEqual(rows,original);console.log('OK association: a foreign source identity cannot be applied');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server?.close());

