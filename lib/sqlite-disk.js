'use strict';
// Compatibility surface for the existing prepared-statement callers. SQLite
// stays on disk; no full database export or native npm compilation is needed.
const fs=require('node:fs'),path=require('node:path');
class DiskDatabase {
 constructor(directory){
  const {DatabaseSync}=require('node:sqlite');
  this.file=path.join(directory,'collection.sqlite');this.disk=true;
  this.migrated=false; this.legacyStamp=0;
  this.native=new DatabaseSync(this.file);
  this.statements=new Map();
  try {
  this.native.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-8192;');
  this.native.prepare('ATTACH DATABASE ? AS catalog').run(path.join(directory,'catalogue.sqlite'));
  this.native.prepare('ATTACH DATABASE ? AS cache').run(path.join(directory,'caches.sqlite'));
  // Rollback journals allow atomic transactions across attached databases.
  this.native.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA catalog.journal_mode=DELETE; PRAGMA catalog.synchronous=FULL; PRAGMA catalog.cache_size=-8192; PRAGMA cache.cache_size=-4096;');
  const migrated=this.native.prepare("SELECT 1 FROM sqlite_master WHERE name='storage_migrations'").get();
  if(!migrated){
   const legacy=path.join(directory,'animes.sqlite');
   if(fs.existsSync(legacy)){
    this.migrated=true;this.legacyStamp=fs.statSync(legacy).mtimeMs;
    const backup=path.join(directory,'backups','before-beta45-animes.sqlite');fs.mkdirSync(path.dirname(backup),{recursive:true});if(!fs.existsSync(backup))fs.copyFileSync(legacy,backup,fs.constants.COPYFILE_EXCL);
    this.native.prepare('ATTACH DATABASE ? AS legacy').run(legacy);
    try{this.native.exec('BEGIN IMMEDIATE');for(const table of ['animes','metadata','metadata_sync','news_history']){
     const definition=this.native.prepare("SELECT sql FROM legacy.sqlite_master WHERE type='table' AND name=?").get(table);if(!definition)continue;
     this.native.exec(this.qualify(definition.sql));this.native.exec(`INSERT INTO ${this.table(table)} SELECT * FROM legacy.${table}`);
    }this.native.exec('CREATE TABLE storage_migrations(version INTEGER PRIMARY KEY); INSERT INTO storage_migrations VALUES(45); COMMIT');}
    catch(error){try{this.native.exec('ROLLBACK');}catch{}throw error;}
    this.native.exec('DETACH DATABASE legacy');
   }else this.native.exec('CREATE TABLE storage_migrations(version INTEGER PRIMARY KEY); INSERT INTO storage_migrations VALUES(45)');
  }
     this.libraryInitialized=!!this.native.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='animes'").get();
   for(const schema of ['main','catalog','cache']){const result=this.native.prepare(`PRAGMA ${schema}.quick_check`).get();if(Object.values(result)[0]!=='ok')throw Error('ALM_STORAGE_INTEGRITY');}
  } catch (error) { this.native.close(); throw error; }
 }
 table(name){return name==='metadata'||name==='metadata_sync'?'catalog.'+name:name==='news_history'?'cache.'+name:name;}
 qualify(sql){
  // Index names live in the table's schema, while their ON table is unqualified.
  return sql.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(metadata|metadata_sync|news_history)\b/gi,(_m,u='',i='',name,table)=>`CREATE ${u}INDEX ${i}${table==='news_history'?'cache':'catalog'}.${name} ON ${table}`)
   .replace(/(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?)(metadata_sync|metadata|news_history)\b/gi,(_m,p,t)=>p+this.table(t));
 }
 run(sql,params){if(params)this.prepare(sql).run(params);else this.native.exec(this.qualify(sql));return this;}
 prepare(sql){
  const text=this.qualify(sql),cacheable=/^\s*SELECT\b/i.test(text)&&text.includes('?');let entry=cacheable?this.statements.get(text):null;
  // Active cursors own their plan; nested readers receive an independent one.
  if(entry?.busy)entry=null;
  if(!entry){entry={stmt:this.native.prepare(text),busy:false};
   if(cacheable&&!this.statements.has(text)){
    if(this.statements.size>=128){for(const [key,value]of this.statements)if(!value.busy){this.statements.delete(key);break;}}
    if(this.statements.size<128)this.statements.set(text,entry);
   }
  }else{this.statements.delete(text);this.statements.set(text,entry);}
  entry.busy=true;const stmt=entry.stmt;let params=[],iterator=null,row=null;return {
  bind(values=[]){if(iterator?.return)iterator.return();iterator=null;params=values;},
  step(){if(!iterator)iterator=stmt.iterate(...params);const result=iterator.next();row=result.value;return !result.done;},
  getAsObject(){return {...row};},run(values=params){stmt.run(...values);},
  free(){try{iterator?.return?.();}finally{iterator=null;entry.busy=false;}}
 };}
   getRowsModified(){return Number(this.native.prepare("SELECT changes() AS changes").get().changes);}
  flush(){/* FULL synchronous commits already persist each transaction. */}
 close(){this.statements.clear();this.native.close();}
}
module.exports={DiskDatabase};
