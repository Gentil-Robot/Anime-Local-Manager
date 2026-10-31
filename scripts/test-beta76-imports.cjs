'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {metadataSqlRows}=require('../lib/metadata-sql-data');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm76-imports-'));
process.env.ALM_DATA_DIR=directory;process.env.ALM_IMAGES_DIR=path.join(directory,'images');process.env.ALM_AUTOMATION_STARTUP='0';
fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false,metadataAutonomousLearnFromSearch:false}));
let listener;
(async()=>{try{
 assert.deepEqual(metadataSqlRows("INSERT INTO metadata (malId,title) VALUES (9000001,'Quote ''; ; -- not SQL'),(9000002,'日本語');"),[{malId:9000001,title:"Quote '; ; -- not SQL"},{malId:9000002,title:'日本語'}]);
 for(const sql of ["DELETE FROM animes;","ATTACH DATABASE '/tmp/forbidden' AS stolen;","PRAGMA writable_schema=1;","INSERT INTO metadata(malId,title) VALUES(9000001,'ok'); DELETE FROM animes;","INSERT INTO metadata(malId,title) VALUES(9000001,readfile('/tmp/private'));","INSERT INTO metadata(malId,title) SELECT 1,title FROM animes;","INSERT INTO metadata(malId,title) VALUES(9000001,'unterminated);"]){assert.throws(()=>metadataSqlRows(sql));}
 const api=require('../server'),db=require('../db');await db.whenReady();assert.equal(db.getMetadataCount(),30430);
 db.writeAllAnimes([{id:1,malId:'20',title:'Naruto',status:'Watching',episodesSeen:'1',episodesTotal:'220',notes:'old note',tags:[],genres:[]}]);
 listener=await new Promise(resolve=>{const s=api.app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+listener.address().port;
 const call=async body=>{const response=await fetch(origin+'/api/metadata/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const collection=JSON.stringify(db.getAllAnimes()),catalogue=db.getMetadataCount();
 for(const sql of ['DELETE FROM animes;','THIS IS INVALID SQL;',"INSERT INTO metadata(malId,title) VALUES(9000001,'safe'); DELETE FROM animes;"]){const r=await call({clear:true,sql});assert.equal(r.status,400);assert.equal(r.body.ok,false);assert.equal(db.getMetadataCount(),catalogue);assert.equal(JSON.stringify(db.getAllAnimes()),collection);assert(!db.getMetadataByMalId(9000001)?.malId);}
 for(const items of [[],[{title:'missing id'}]]){const r=await call({clear:true,items});assert.equal(r.status,400);assert.equal(db.getMetadataCount(),catalogue);}
 const good=await call({sql:"INSERT INTO metadata(malId,title) VALUES(9000001,'Fictional metadata');"});assert.equal(good.body.ok,true,JSON.stringify(good));assert.equal(db.getMetadataCount(),catalogue+1);assert.equal(JSON.stringify(db.getAllAnimes()),collection);
 // Actual HTTP import, with writes injected after the baseline read and before its yield.
 const original=db.getAllAnimes;
 const xml='<?xml version="1.0"?><myanimelist><anime><series_animedb_id>20</series_animedb_id><series_title>Naruto</series_title><series_episodes>220</series_episodes><my_watched_episodes>2</my_watched_episodes><my_status>Watching</my_status></anime></myanimelist>';
 async function concurrent(change){let armed=true,injected=false;db.getAllAnimes=function(...args){const rows=original(...args);if(armed){armed=false;setImmediate(()=>{change();injected=true;});}return rows;};try{const form=new FormData();form.append('file',new Blob([xml],{type:'application/xml'}),'fictional.xml');const r=await fetch(origin+'/api/import/xml',{method:'POST',body:form});assert.equal((await r.json()).ok,true);assert(injected);}finally{db.getAllAnimes=original;}}
 await concurrent(()=>db.updateAnime(1,{notes:'newer concurrent note',episodesSeen:'7'}));assert.equal(db.getAnimeById(1).notes,'newer concurrent note');assert.equal(db.getAnimeById(1).episodesSeen,'7');
 await concurrent(()=>db.deleteAnime(1));assert.equal(db.getAnimeById(1),null);
 // All 30,430 historical rows still parse and can atomically replace the catalogue.
 const sql=require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'../data/database/metadata-full.sql.gz')),{maxOutputLength:256*1024*1024}).toString();
 const restored=db.importMetadataSql(sql,{clear:true});assert.equal(restored.ok,true,restored.error);assert.equal(db.getMetadataCount(),30430);assert.equal(db.getAllAnimes().length,0);
 console.log('OK Beta76: SQL data-only parser, injection rejection without collection changes, invalid/empty replacement preserves catalogue, real HTTP XML concurrent note/progress/deletion, full 30430-row atomic replacement.');
}finally{await require('./runtime-cleanup').cleanupRuntime(directory,listener);}})().catch(error=>{console.error(error);process.exitCode=1;});
