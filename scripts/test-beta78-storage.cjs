'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.argv[2]==='child'){
 const mode=process.argv[3],dir=process.argv[4];process.env.ALM_SQLJS_ONLY=mode.startsWith('wasm')?'1':'0';const db=require('../db');
 (async()=>{await db.initDb(dir);db.insertAnime({id:1,title:'Fictional recovery record',notes:'Original fictional note'});
  if(mode.startsWith('wasm')){db.updateAnime(1,{notes:'Latest fictional note'},{save:'memory'});const mirror=path.join(dir,'animes.json');if(mode==='wasm-tie'){const tie=new Date(Date.now()-2000);fs.utimesSync(mirror,tie,tie);fs.utimesSync(path.join(dir,'animes.sqlite'),tie,tie);}else{const old=new Date(fs.statSync(mirror).mtimeMs-50);fs.utimesSync(path.join(dir,'animes.sqlite'),old,old);}}
  else{const rename=fs.renameSync;fs.renameSync=function(from,to,...args){if(to===path.join(dir,'animes.json'))throw Object.assign(Error('Fictional mirror denied'),{code:'EACCES'});return rename.call(this,from,to,...args);};db.deleteAnime(1);assert.equal(db.getAllAnimes().length,0);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'animes.json'))).length,1);}
  process.exit(0);
 })().catch(e=>{console.error(e);process.exit(1);});
}else{
 process.env.ALM_SQLJS_ONLY='0';const base=fs.mkdtempSync(path.join(os.tmpdir(),'alm78-storage-'));
 const fresh=()=>{delete require.cache[require.resolve('../db')];return require('../db');};
 (async()=>{let db;try{
  for(const mode of ['mirror','wasm','wasm-tie']){
   const dir=path.join(base,mode);fs.mkdirSync(dir);const q=cp.spawnSync(process.execPath,[__filename,'child',mode,dir],{env:process.env,encoding:'utf8',timeout:180000});assert.equal(q.status,0,q.stdout+q.stderr);db=fresh();await db.initDb(dir);assert.equal(db.storageStatus().engine,'sqlite-disk');
   if(mode==='mirror'){assert.equal(db.getAllAnimes().length,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'animes.json'))),[]);}
   else assert.equal(db.getAnimeById(1).notes,'Latest fictional note');db.close();
  }
  console.log('OK Beta78: durable deletion stays deleted after abrupt stop and mirror failure; initial WASM migration keeps newer or equal-timestamp JSON and revision.');
  const dir=path.join(base,'edges');fs.mkdirSync(dir);db=fresh();await db.initDb(dir);db.insertAnime({id:1,title:'Fictional record',notes:'Old fictional note'});db.updateAnime(1,{notes:'Latest fictional note'},{save:'deferred'});
  const Disk=require('../lib/sqlite-disk').DiskDatabase,prepare=Disk.prototype.prepare;
  Disk.prototype.prepare=function(sql){if(/SELECT data FROM animes ORDER BY id/.test(sql))throw Error('Fictional library read failure');return prepare.apply(this,arguments);};
  try{assert.throws(()=>db.getAllAnimes(),/ALM_LIBRARY_READ_FAILED/);}finally{Disk.prototype.prepare=prepare;}
  assert.equal(db.getAnimeById(1).notes,'Latest fictional note');db.flush();
  db.upsertNewsItems([{newsKey:'one',title:'Fictional article',articleUrl:'https://example.invalid/a'}]);
  assert.equal(db.updateNewsImageByArticleUrl('https://example.invalid/a','https://example.invalid/first.jpg').updated,1);
  assert.equal(db.updateNewsImagesByArticleUrl([{key:'one',articleUrls:['https://example.invalid/a'],imageUrl:'https://example.invalid/second.jpg'}],{overwrite:true}).updated,1);
  assert.equal(db.getNewsItemByKey('one').imageUrl,'https://example.invalid/second.jpg');
  Disk.prototype.prepare=function(sql){if(/FROM news_history/.test(sql))throw Error('Fictional news read failure');return prepare.apply(this,arguments);};
  try{assert.throws(()=>db.exportNewsHistory(),/ALM_NEWS_EXPORT_FAILED/);}finally{Disk.prototype.prepare=prepare;}
  assert.equal(db.exportNewsHistory().length,1);
  assert(db.importMetadataRows([{malId:990078,title:'Fictional invalid studio shape',score:7,studios:{unexpected:1}},{malId:990079,title:'Fictional valid studio shape',score:8,studios:['FictionalStudio']}]).ok);
  assert.doesNotThrow(()=>db.listMetadataStudios());assert(db.listMetadataStudios().some(x=>x.name==='FictionalStudio'&&x.count===1));
  console.log('OK Beta78: library and backup read errors stay explicit; native image counts match actual changes; malformed studios cannot break listing.');
  const {viewingData}=require('../lib/viewing');const calendar=viewingData([{id:1,title:'Fictional',watchEvents:[null,{},undefined,{date:'2026-10-20',episodes:2}]}],2026);assert.equal(calendar.days.length,1);assert.equal(calendar.days[0].episodes,2);console.log('OK Beta78: invalid viewing events are skipped and valid events retained.');db.close();
  const {DatabaseSync}=require('node:sqlite'),exec=DatabaseSync.prototype.exec;const indexDir=path.join(base,'index');fs.mkdirSync(indexDir);let injected=false;db=fresh();
  DatabaseSync.prototype.exec=function(sql,...args){if(/INSERT INTO catalog.metadata_search\(metadata_search\) VALUES\('rebuild'\)/.test(sql)&&!injected){injected=true;throw Error('Fictional interrupted FTS rebuild');}return exec.call(this,sql,...args);};
  let first;try{await db.initDb(indexDir);first=db.browseMetadata({q:'Naruto'}).total;assert(injected);assert(first>0);}finally{DatabaseSync.prototype.exec=exec;db.close();}
  db=fresh();await db.initDb(indexDir);assert.equal(db.browseMetadata({q:'Naruto'}).total,first);db.close();
  // A beta77-style partial index already present before upgrade is repaired too.
  const c=new DatabaseSync(path.join(indexDir,'collection.sqlite'));try{c.prepare('ATTACH DATABASE ? AS catalog').run(path.join(indexDir,'catalogue.sqlite'));c.exec("DROP TABLE catalog.metadata_search; CREATE VIRTUAL TABLE catalog.metadata_search USING fts5(title,titleEn,titleRomaji,synonyms,content='metadata',content_rowid='malId',tokenize='trigram'); DELETE FROM catalog.metadata_studios; DELETE FROM catalog.metadata_sync WHERE key IN ('auxiliaryIndexVersion','ftsIndexVersion');");}finally{c.close();}
  db=fresh();await db.initDb(indexDir);assert.equal(db.browseMetadata({q:'Naruto'}).total,first);assert(db.listMetadataStudios().length>0);assert(db.browseMetadata({studio:db.listMetadataStudios()[0].name}).total>0);db.close();console.log('OK Beta78: failed index creation rolls back; restart rebuilds; existing partial genre/studio/FTS indexes are repaired.');
 }finally{try{db?.close();}finally{fs.rmSync(base,{recursive:true,force:true});}}})().catch(e=>{console.error(e);process.exitCode=1;});
}
