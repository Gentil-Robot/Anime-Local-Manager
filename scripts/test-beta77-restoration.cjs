'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.ALM_TEST_ROOT||path.join(__dirname,'..'));
async function jsonFallback(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm77-json-news-')),Module=require('node:module'),load=Module._load;process.env.ALM_SQLJS_ONLY='1';
 Module._load=function(name,...args){if(name==='sql.js')throw Error('Fictional unavailable WASM');return load.call(this,name,...args);};const db=require(root+'/db');
 try{
  await db.initDb(dir);assert.equal(db.storageStatus().mode,'json');db.upsertNewsItems([{newsKey:'old',title:'Fictional old'}]);
  const file=path.join(dir,'news-history.json'),before=fs.readFileSync(file),snapshot=JSON.stringify(db.exportNewsHistory()),rename=fs.renameSync,copy=fs.copyFileSync;
  fs.renameSync=function(from,to,...args){if(to===file)throw Object.assign(Error('Fictional denied news write'),{code:'EACCES'});return rename.call(this,from,to,...args);};
  fs.copyFileSync=function(from,to,...args){if(to===file)throw Object.assign(Error('Fictional denied news write'),{code:'EACCES'});return copy.call(this,from,to,...args);};
  try{assert.throws(()=>db.upsertNewsItems([{newsKey:'new',title:'Fictional new'}],{replace:true,strict:true}),/Fictional denied/);assert.deepEqual(fs.readFileSync(file),before);assert.equal(JSON.stringify(db.exportNewsHistory()),snapshot);assert.throws(()=>db.clearNewsHistory(),/Fictional denied/);assert.deepEqual(fs.readFileSync(file),before);assert.equal(JSON.stringify(db.exportNewsHistory()),snapshot);}finally{fs.renameSync=rename;fs.copyFileSync=copy;}
  db.upsertNewsItems([],{replace:true,strict:true});assert.equal(db.getNewsHistoryCount(),0);assert.deepEqual(JSON.parse(fs.readFileSync(file)),[]);db.close();delete require.cache[require.resolve(root+'/db')];
  const corrupt=Buffer.from('{fictional corrupt history');fs.writeFileSync(file,corrupt);const fresh=require(root+'/db');try{await fresh.initDb(dir);assert.throws(()=>fresh.exportNewsHistory(),/ALM_NEWS_JSON_READ_FAILED/);assert.throws(()=>fresh.upsertNewsItems([{title:'New'}]),/ALM_NEWS_JSON_READ_FAILED/);assert.deepEqual(fs.readFileSync(file),corrupt);}finally{fresh.close();}
  console.log('OK JSON: EACCES propagates; file/cache intact; empty replacement works; corrupt history preserved.');
 }finally{Module._load=load;db.close();fs.rmSync(dir,{recursive:true,force:true});}
}
async function runtime(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm77-restore-'));process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_AUTOMATION_STARTUP='0';fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false,metadataAutonomousLearnFromSearch:false}));let listener;
 try{
  const api=require(root+'/server'),db=require(root+'/db');await db.whenReady();listener=await new Promise(resolve=>{const s=api.app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+listener.address().port;
  db.writeAllAnimes([{id:1,title:'Naruto',malId:'20',notes:'Fictional old note',status:'Watching',tags:[],genres:[]}]);db.upsertNewsItems([{newsKey:'old',title:'Fictional old'}]);const before={library:JSON.stringify(db.getAllAnimes()),news:JSON.stringify(db.exportNewsHistory())};
  const unchanged=()=>{assert.equal(JSON.stringify(db.getAllAnimes()),before.library);assert.equal(JSON.stringify(db.exportNewsHistory()),before.news);};
  const send=async newsHistory=>{const form=new FormData();form.append('file',new Blob([JSON.stringify({data:{animes:[{id:2,title:'Cowboy Bebop',malId:'1',tags:[],genres:[]}],newsHistory}})],{type:'application/json'}),'fictional.json');const r=await fetch(origin+'/api/backup/restore',{method:'POST',body:form});return {status:r.status,body:await r.json()};};
  for(const bad of [[{}],[null],[{title:' '}],'invalid',[{newsKey:'dup',title:'One'},{newsKey:'dup',title:'Two'}]]){const r=await send(bad);assert.equal(r.status,400,JSON.stringify(r));unchanged();}
  const upsert=db.upsertNewsItems;let armed=true;db.upsertNewsItems=(...args)=>{if(armed){armed=false;return {ok:false,error:'Fictional disk failure',processed:0};}return upsert(...args);};
  try{const failed=await send([{newsKey:'new',title:'New'}]);assert.equal(failed.status,400);assert.match(failed.body.error,/ALM_BACKUP_NEWS_RESTORE_FAILED/);unchanged();}finally{db.upsertNewsItems=upsert;}
  if(db.storageStatus().engine==='sqlite-disk'){
   const {DatabaseSync}=require('node:sqlite'),connection=new DatabaseSync(path.join(dir,'caches.sqlite'));
   try{connection.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON news_history WHEN new.title='Reject fixture' BEGIN SELECT RAISE(ABORT,'Fictional SQL error'); END;");const r=db.upsertNewsItems([{newsKey:'partial',title:'First'},{newsKey:'reject',title:'Reject fixture'}],{replace:true,strict:true});assert.equal(r.ok,false);unchanged();assert.equal((await send([{newsKey:'reject',title:'Reject fixture'}])).status,400);unchanged();}finally{connection.exec('DROP TRIGGER IF EXISTS reject_fixture');connection.close();}
  }
  const good=await send([{newsKey:'new',title:'New'}]);assert.equal(good.status,200);assert(good.body.ok);assert.equal(db.getNewsHistoryCount(),1);assert.equal(db.exportNewsHistory()[0].newsKey,'new');assert(db.getAnimeById(2));assert.equal((await send([])).status,200);assert.equal(db.getNewsHistoryCount(),0);
  console.log('OK restoration HTTP/SQLite: invalid, duplicate and partial writes rejected; original library/news preserved; valid/empty replacements work.');
 }finally{await require(root+'/scripts/runtime-cleanup').cleanupRuntime(dir,listener);}
 const q=require('node:child_process').spawnSync(process.execPath,[__filename,'--json'],{encoding:'utf8',env:{...process.env,ALM_SQLJS_ONLY:'1'}});assert.equal(q.status,0,q.stdout+q.stderr);process.stdout.write(q.stdout);
}
(process.argv.includes('--json')?jsonFallback():runtime()).catch(e=>{console.error(e);process.exitCode=1;});
