'use strict';
const {DatabaseSync}=require('node:sqlite'),path=require('node:path'),fs=require('node:fs'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
assert(fs.existsSync(path.join(dir,'perf-seeded')),'Synthetic fixture marker required');
const db=new DatabaseSync(path.join(dir,'collection.sqlite'));
db.prepare('ATTACH DATABASE ? AS catalog').run(path.join(dir,'catalogue.sqlite'));
const original="SELECT COUNT(*) n FROM catalog.metadata m WHERE NOT EXISTS (SELECT 1 FROM animes a WHERE CAST(a.malId AS INTEGER)=m.malId OR (a.malId='' AND (a.title=m.title COLLATE NOCASE OR a.title=m.titleEn COLLATE NOCASE OR a.title=m.titleRomaji COLLATE NOCASE)))";
const split="SELECT COUNT(*) n FROM catalog.metadata m WHERE NOT EXISTS (SELECT 1 FROM animes a WHERE CAST(a.malId AS INTEGER)=m.malId) AND NOT EXISTS (SELECT 1 FROM animes a WHERE a.malId='' AND (a.title=m.title COLLATE NOCASE OR a.title=m.titleEn COLLATE NOCASE OR a.title=m.titleRomaji COLLATE NOCASE))";
const result={before_plan:db.prepare('EXPLAIN QUERY PLAN '+original).all(),before:[],after:[]};
for(let i=0;i<3;i++){const t=performance.now(),row=db.prepare(original).get();result.before.push({ms:performance.now()-t,count:row.n});}
// Isolated synthetic profile only; never run against production or user data.
assert(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_malId_integer'").get(),'Use the Beta79 fixture for this comparison');
db.exec('CREATE INDEX idx_malId_integer ON animes(CAST(malId AS INTEGER))');try{result.after_plan=db.prepare('EXPLAIN QUERY PLAN '+split).all();
for(let i=0;i<7;i++){const t=performance.now(),row=db.prepare(split).get();result.after.push({ms:performance.now()-t,count:row.n});assert.equal(row.n,result.before[0].count);}
}finally{db.exec('DROP INDEX idx_malId_integer');db.close();}fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
