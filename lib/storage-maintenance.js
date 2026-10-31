'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function mountStorage(app,{dataDir,imagesDir,db}){
 let lastIntegrity={result:'not-run',at:null};
 const jobs=new Map(),updates=path.join(path.dirname(dataDir),'updates');
 const stat=file=>{try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()?s:null;}catch{return null;}};
 function candidates(){const result=[];if(fs.existsSync(updates))for(const name of fs.readdirSync(updates)){if(!/^[a-f0-9-]{36}-Anime-Local-Manager-.*\.(?:exe|AppImage)$/.test(name))continue;const file=path.join(updates,name),s=stat(file);if(s&&Date.now()-s.mtimeMs>7*86400000)result.push({file,name,bytes:s.size,mtime:s.mtimeMs});}return result;}
 function inspect(){return {integrity:{...lastIntegrity},database:db.storageStatus(),memory:process.memoryUsage(),collection:db.getQuickStats(),catalogue:db.getMetadataCount(),files:['collection.sqlite','catalogue.sqlite','caches.sqlite','animes.json','animes.json.bak'].map(name=>({name,bytes:stat(path.join(dataDir,name))?.size||0})),images:{count:fs.existsSync(imagesDir)?fs.readdirSync(imagesDir).filter(n=>stat(path.join(imagesDir,n))).length:0,bytes:fs.existsSync(imagesDir)?fs.readdirSync(imagesDir).reduce((n,f)=>n+(stat(path.join(imagesDir,f))?.size||0),0):0},cleanup:candidates().reduce((n,c)=>n+c.bytes,0)};}
 app.get('/api/storage/status',(_req,res)=>res.json(db.storageStatus()));
 app.get('/api/storage',async(_req,res)=>{try{await db.whenReady();res.json(inspect());}catch{res.status(503).json({code:'ALM_STORAGE_UNAVAILABLE'});}});
 app.post('/api/storage/check',async(_req,res)=>{try{await db.whenReady();const result=db.checkIntegrity();lastIntegrity={result:result.ok?'ok':'error',at:new Date().toISOString()};res.json(result);}catch{lastIntegrity={result:'error',at:new Date().toISOString()};res.status(503).json({code:'ALM_STORAGE_INTEGRITY'});}});
 app.post('/api/storage/cleanup/preview',(_req,res)=>{for(const [id,j]of jobs)if(j.until<Date.now())jobs.delete(id);while(jobs.size>=3)jobs.delete(jobs.keys().next().value);const files=candidates(),token=crypto.randomUUID();jobs.set(token,{files,until:Date.now()+60000});res.json({token,bytes:files.reduce((n,c)=>n+c.bytes,0),files:files.map(({name,bytes})=>({name,bytes}))});});
 app.post('/api/storage/cleanup', (req,res)=>{const job=jobs.get(req.body?.token);if(!job||job.until<Date.now())return res.status(409).json({code:'ALM_CLEANUP_EXPIRED'});jobs.delete(req.body.token);let bytes=0,count=0;for(const old of job.files){const s=stat(old.file);if(s&&s.size===old.bytes&&s.mtimeMs===old.mtime){fs.unlinkSync(old.file);bytes+=old.bytes;count++;}}res.json({ok:true,count,bytes});});
 return {integrity:()=>({...lastIntegrity})};
}
module.exports={mountStorage};
