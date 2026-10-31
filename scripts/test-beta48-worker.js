'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Worker}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm48-worker-'));
(async()=>{try{
 const db=new DatabaseSync(path.join(dir,'catalogue.sqlite'));db.exec('CREATE TABLE metadata(malId INTEGER PRIMARY KEY,title TEXT,titleEn TEXT,titleRomaji TEXT,synonyms TEXT,genres TEXT,episodes INTEGER,score REAL,type TEXT,studios TEXT,imageUrl TEXT,startDate TEXT)');
 const insert=db.prepare('INSERT INTO metadata VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'),rows=[];
 for(let n=1;n<=383;n++){const title='Confirmed Fantasy Adventure Anime Fixture Number '+n;insert.run(900000+n,title,title,title,'[]','["Fantasy"]',12,8,'TV','["Test Studio"]','https://example.invalid/cover-'+n+'.jpg','2026-01-01');rows.push({id:String(n),title,episode:'S01E12',remaining:'0',status:'100'});}db.close();
 const start=performance.now();let progress=0;
 const results=await new Promise((resolve,reject)=>{const worker=new Worker(path.join(__dirname,'../csv-worker.js'),{workerData:{rows,matchingCache:{},betaFastCache:{},config:{},dataDir:dir,deadlineAt:Date.now()-1}});const timer=setTimeout(()=>{worker.terminate();reject(Error('Local worker stalled'));},20000);worker.on('error',e=>{clearTimeout(timer);reject(e);});worker.on('message',m=>{if(m.type==='progress')progress=m.done;if(m.type==='error'){clearTimeout(timer);reject(Error(m.message));}if(m.type==='result'){clearTimeout(timer);resolve(m.results);}});});
 assert.equal(results.length,383);for(const [index,item]of results.entries()){assert.equal(Number(item.found?.malId),900001+index);assert.equal(item.classification,'anime');assert.equal(item.anime.episodesSeen,'12');}
 console.log('OK Beta48 worker: 383 rows resolved from native catalogue.sqlite with no network and no legacy database in '+Math.round(performance.now()-start)+' ms; last progress '+progress);
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});

