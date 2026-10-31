'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'alm80-perf-'));
(async()=>{let db;try{
 const {DiskDatabase}=require('../lib/sqlite-disk'),disk=new DiskDatabase(base);
 disk.run('CREATE TABLE perf(id INTEGER PRIMARY KEY,value TEXT)');
 disk.run('INSERT INTO perf VALUES (?,?)',[1,'fictitious']);
 const count=()=>{const s=disk.prepare('SELECT COUNT(*) n FROM perf WHERE id > ?');try{s.bind([0]);assert(s.step());return s.getAsObject().n;}finally{s.free();}};
 assert.equal(count(),1);const plan=disk.statements.get('SELECT COUNT(*) n FROM perf WHERE id > ?').stmt;assert.equal(count(),1);assert.equal(disk.statements.get('SELECT COUNT(*) n FROM perf WHERE id > ?').stmt,plan);
 for(const value of [1,2,1]){const s=disk.prepare('SELECT value FROM perf WHERE id=?');try{s.bind([value]);assert.equal(s.step(),value===1);if(value===1)assert.equal(s.getAsObject().value,'fictitious');}finally{s.free();}}
 const a=disk.prepare('SELECT id FROM perf WHERE id > ?'),b=disk.prepare('SELECT id FROM perf WHERE id > ?');a.bind([0]);b.bind([0]);assert(a.step());assert(b.step());assert.equal(a.getAsObject().id,b.getAsObject().id);a.free();b.free();
 disk.run('BEGIN');disk.run('INSERT INTO perf VALUES (?,?)',[2,'rollback']);assert.equal(count(),2);disk.run('ROLLBACK');assert.equal(count(),1);
 disk.run('ALTER TABLE perf ADD COLUMN changed TEXT');assert.equal(count(),1);
 for(let i=0;i<300;i++){const s=disk.prepare('SELECT ? AS n /* '+i+' */');s.bind([i]);assert(s.step());assert.equal(s.getAsObject().n,i);s.free();}assert(disk.statements.size<=128);
 assert(![...disk.statements.keys()].some(x=>/INSERT|UPDATE|DELETE|ALTER|CREATE/.test(x)));disk.close();
 console.log('OK Beta80: bounded read-plan cache, independent active cursors, rebinding, schema changes and rollback.');
 for(const mode of ['0','1']){
  process.env.ALM_SQLJS_ONLY=mode;delete require.cache[require.resolve('../db')];db=require('../db');const dir=path.join(base,'catalog-'+mode);await db.initDb(dir);
  const rows=Array.from({length:6},(_,i)=>({malId:980080+i,title:'FictionalPerf80 title '+i,titleEn:'FictionalPerf80 English '+i,titleRomaji:'FictionalPerf80 Romaji '+i,type:'TV',score:7}));assert(db.importMetadataRows(rows).ok);
  db.writeAllAnimes([{id:1,title:'Different fictional title',malId:'0980080'},{id:2,title:'Different fictional title 2',malId:'980081suffix'},{id:3,title:'FictionalPerf80 English 2',malId:''},{id:4,title:'fictionalperf80 romaji 3',malId:''},{id:5,title:'FictionalPerf80 title 4',malId:'42'}]);
  const before=db.getAllAnimes(),shown=db.browseMetadata({q:'FictionalPerf80',hideOwned:true,sort:'alphabetical'});assert.deepEqual(shown.items.map(x=>x.malId),[980084,980085]);assert.deepEqual(db.getAllAnimes(),before);db.flush();db.close();db=null;
 }
 console.log('OK Beta80: native and sql.js hide-owned semantics preserve numeric casts, empty-ID title matching and nonmatching IDs.');
 }finally{db?.close();fs.rmSync(base,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
