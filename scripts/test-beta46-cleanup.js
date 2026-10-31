'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.argv[2]==='child'){
 (async()=>{
  const dir=process.argv[3],mode=process.argv[4],db=require('../db');
  await db.initDb(dir);assert.equal(db.storageStatus().engine,'sqlite-disk');
  db.insertAnime({id:1,title:'Keep my anime',status:'Watching',episodesSeen:'1',episodesTotal:'12',notes:'Personal notes'});
  db.updateAnime(1,{episodesSeen:'2'},{save:'deferred'});
  if(mode==='mirror-failure'){
   const rename=fs.renameSync;
   fs.renameSync=(from,to)=>{if(to===path.join(dir,'animes.json'))throw Object.assign(Error('Injected mirror failure'),{code:'EACCES'});return rename(from,to);};
   assert.throws(()=>db.close(),/Injected mirror failure/);fs.renameSync=rename;
   assert.equal(db.isReady(),false);
  }else{
   db.close();assert.equal(db.isReady(),false);db.close();
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'animes.json')))[0].episodesSeen,'2');
  }
  // Real close: rename/reopen every attached file while this process is alive.
  const {DatabaseSync}=require('node:sqlite');
  for(const file of ['collection.sqlite','catalogue.sqlite','caches.sqlite']){
   const original=path.join(dir,file),moved=original+'.moved';fs.renameSync(original,moved);
   const reopened=new DatabaseSync(moved);assert.equal(reopened.prepare('PRAGMA quick_check').get().quick_check,'ok');
   if(file==='collection.sqlite')assert.equal(JSON.parse(reopened.prepare('SELECT data FROM animes WHERE id=1').get().data).episodesSeen,'2');
   reopened.close();fs.renameSync(moved,original);
  }
 })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
 (async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'alm46-cleanup-'));
  try{
   const broken=path.join(base,'broken-init');fs.mkdirSync(broken);
   fs.writeFileSync(path.join(broken,'catalogue.sqlite'),'Invalid catalogue');
   assert.throws(()=>new (require('../lib/sqlite-disk').DiskDatabase)(broken));
   for(const file of fs.readdirSync(broken)){const target=path.join(broken,file);fs.renameSync(target,target+'.closed');}
   console.log('OK Beta46: failed native initialization releases allocated file handles without replacing evidence');
   for(const mode of ['normal','mirror-failure']){
    const dir=path.join(base,mode);fs.mkdirSync(dir);
    const result=spawnSync(process.execPath,[__filename,'child',dir,mode],{encoding:'utf8',timeout:30000,env:{...process.env,ALM_SQLJS_ONLY:'0'}});
    assert.equal(result.status,0,result.stderr||result.stdout);console.log('OK Beta46: real attached SQLite handles released and SQL progress preserved ('+mode+')');
   }
   const dir=path.join(base,'http');fs.mkdirSync(dir);process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');
   fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
   const api=require('../server'),db=require('../db');await db.whenReady();
   const listener=api.app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));
   const originalRm=fs.promises.rm;let attempted=false;
   fs.promises.rm=async(target,options)=>{
    attempted=true;assert.equal(listener.listening,false);assert.equal(db.isReady(),false);
    assert.equal(options.maxRetries,5);assert.equal(options.retryDelay,100);
    return originalRm(target,options);
   };
   try{await require('./runtime-cleanup').cleanupRuntime(dir,listener);}finally{fs.promises.rm=originalRm;}
   assert(attempted);assert(!fs.existsSync(dir));console.log('OK Beta46: HTTP and SQLite close before recursive removal, with bounded lock retries');
   const kept=path.join(base,'permanent-error');fs.mkdirSync(kept);fs.writeFileSync(path.join(kept,'evidence'),'Keep');
   fs.promises.rm=async()=>{throw Object.assign(Error('Permanent cleanup failure'),{code:'EACCES'});};
   try{await assert.rejects(require('./runtime-cleanup').cleanupRuntime(kept),/Permanent cleanup failure/);}finally{fs.promises.rm=originalRm;}
   assert(fs.existsSync(path.join(kept,'evidence')));console.log('OK Beta46: permanent cleanup errors are reported, not turned into successful tests');
  }finally{await fs.promises.rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
