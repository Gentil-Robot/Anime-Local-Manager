'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Worker}=require('node:worker_threads');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm51-worker-'));
(async()=>{try{
 const rows=[],cache={},tv={};fs.mkdirSync(path.join(dir,'cache'));
 for(let n=0;n<380;n++){const title='Verified Fantasy Anime Fixture '+n;rows.push({id:String(n),title,episode:'S01E12',remaining:'0',status:'100'});cache[title.toLowerCase()]={title,officialTitle:title,malId:990000+n,type:'TV',episodesTotal:'12',source:'LocalMetadata',matchingScore:100};}
 for(const title of ['Altered Carbon','Sherlock','Squid Game']){rows.push({id:title,title,episode:'S02E08',remaining:'1',status:'94'});tv[title.toLowerCase()]={name:title,source:'TVMaze',type:'Scripted',language:'English',genres:['Drama'],matchingScore:100};}
 cache['altered carbon']={title:'Altered Carbon',officialTitle:'Altered Carbon: Resleeved',malId:40485,type:'ONA',episodesTotal:'1',source:'LocalMetadata',matchingScore:100};
 fs.writeFileSync(path.join(dir,'cache/tvmaze-import-cache.json'),JSON.stringify(tv));const start=performance.now();
 const previews=[];const result=await new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'../csv-worker.js'),{workerData:{rows,matchingCache:cache,betaFastCache:{},config:{},dataDir:dir,deadlineAt:Date.now()-1}});const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timed out'));},15000);worker.on('error',reject);worker.on('message',message=>{if(message.type==='progress'&&message.preview)previews.push(message.preview);if(message.type==='result'){clearTimeout(timer);resolve(message.results);}if(message.type==='error'){clearTimeout(timer);reject(Error(message.message));}});});
 assert.equal(result.length,383);assert.equal(previews.length,383);assert.equal(new Set(previews.map(p=>p.index)).size,383);for(const p of previews)assert.equal(p.item.sourceTitle,rows[p.index].title);assert.equal(result.filter(a=>a.classification==='anime').length,380);assert.equal(result.filter(a=>a.classification==='non_anime').length,3);assert.deepEqual(result.map(a=>a.sourceTitle),rows.map(a=>a.title));
 console.log('OK Beta51 worker streaming: mixed 383-row fixture retains order, uses TV evidence after the network deadline and rejects the live action / film mismatch ('+Math.round(performance.now()-start)+' ms)');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
