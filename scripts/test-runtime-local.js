#!/usr/bin/env node
"use strict";
// Requires real installed dependencies. Never substitutes stubs or accepts a
// JSON fallback as evidence that SQLite works. Runs only against a temp profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
for(const dep of ['express','multer','sql.js']) {
 try{require.resolve(dep);}catch{console.error(`Missing ${dep}. Run npm install before verify:runtime.`);process.exit(1);}
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-real-runtime-'));
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');
fs.writeFileSync(path.join(dir,'animes.json'),'[]');
const fetchLocal=global.fetch;
global.fetch=(url,...args)=>{
 const u=new URL(typeof url==='string'?url:url.url);
 if(!['127.0.0.1','localhost'].includes(u.hostname))return Promise.reject(new Error('Live providers disabled during tests'));
 return fetchLocal(url,...args);
};
let listener;
(async()=>{
 const {app}=require(path.join(ROOT,'server.js')),db=require(path.join(ROOT,'db.js'));
 await db.whenReady();assert.equal(db.storageStatus().mode,'sqlite','sql.js must actually load; fallback is not a passing test');
 const multer=require('multer');
 app.post('/__test/upload',multer({storage:multer.memoryStorage(),limits:{fileSize:1024,files:1}}).single('file'),(req,res)=>res.json({bytes:req.file?.size}));
 app.use((error,req,res,next)=>{if(error?.code==='LIMIT_FILE_SIZE')return res.status(413).json({code:error.code});res.status(500).json({code:'TEST_ERROR'});});
 listener=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+listener.address().port;
 db.insertAnime({id:1,title:'Runtime fixture',status:'Watching',episodesSeen:'7',episodesTotal:'12',tags:[],genres:[]});
 let response=await fetchLocal(origin+'/api/animes');assert.equal(response.status,200);let items=await response.json();assert.equal(items.length,1);assert.equal(items[0].episodesSeen,'7');
 const rename=fs.renameSync;
 try {fs.renameSync=(a,b)=>{if(b===path.join(dir,'animes.json'))throw new Error('Injected save failure');return rename(a,b);};if(db.storageStatus().engine==='sqlite-disk'){db.updateAnime(1,{episodesSeen:'10'});assert.equal(db.storageStatus().error,'Injected save failure');}else assert.throws(()=>db.updateAnime(1,{episodesSeen:'10'}),/Injected save failure/);}finally{fs.renameSync=rename;}
 assert.equal(db.getAnimeById(1).episodesSeen,db.storageStatus().engine==='sqlite-disk'?'10':'7','Native SQL commits independently of its recovery mirror; WASM rolls back a failed JSON commit');
 db.updateAnime(1,{episodesSeen:'8'});assert.equal(db.getAnimeById(1).episodesSeen,'8');
 response=await fetchLocal(origin+'/api/diagnostics');assert.equal(response.status,200);assert.equal((await response.json()).storage.mode,'sqlite');
 response=await fetchLocal(origin+'/api/animes',{headers:{Origin:'https://external.invalid'}});assert.equal(response.status,403);
 const form=new FormData();form.append('file',new Blob(['abc']),'test.txt');
 response=await fetchLocal(origin+'/__test/upload',{method:'POST',body:form});assert.equal(response.status,200);assert.equal((await response.json()).bytes,3);
 const tooLarge=new FormData();tooLarge.append('file',new Blob(['a'.repeat(2048)]),'large.txt');
 response=await fetchLocal(origin+'/__test/upload',{method:'POST',body:tooLarge});assert.equal(response.status,413);
 db.flush();assert(fs.statSync(path.join(dir,db.storageStatus().engine==='sqlite-disk'?'collection.sqlite':'animes.sqlite')).size>0);
 const initSqlJs=require('sql.js');const SQL=await initSqlJs();const reopened=new SQL.Database(fs.readFileSync(path.join(dir,db.storageStatus().engine==='sqlite-disk'?'collection.sqlite':'animes.sqlite')));
 const data=reopened.exec('SELECT data FROM animes WHERE id=1');assert.equal(JSON.parse(data[0].values[0][0]).episodesSeen,'8');reopened.close();
 db.deleteAnime(1);assert.equal(db.getAllAnimes().length,0);
 console.log('OK real runtime: Express/Origin guard, Multer upload+limit, SQLite persistence/mirror failure/save/reopen/delete. No provider calls.');
})().then(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,listener);process.exit(0);}).catch(async error=>{console.error(error.stack);await require('./runtime-cleanup').cleanupRuntime(dir,listener);process.exit(1);});
