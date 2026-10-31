'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-news-progress-'));
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');
fs.writeFileSync(path.join(dir,'animes.json'),'[]');fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const bounded=require('../lib/bounded-text-fetch');
let calls=0,release,failAll=false,listener;
const gate=new Promise(resolve=>release=resolve);
bounded.boundedTextFetch=async()=>{
 const index=++calls;
 if(failAll)throw Error('Fixture source unavailable');
 if(index>1){await gate;throw Error('Fixture slow source unavailable');}
 return {response:{ok:true,status:200},text:`<rss><channel><item><title>Une nouvelle saison de test</title><link>https://news.example.org/fixture</link><description>Annonce de la nouvelle saison. Donnée de test.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`};
};
const fetchLocal=global.fetch;global.fetch=(...args)=>Promise.reject(Error('External network disabled by test'));
const timeout=setTimeout(()=>{console.error('Progressive news test exceeded deadline');process.exit(1);},20000);
(async()=>{
 const {app}=require('../server'),db=require('../db');await db.whenReady();
 assert.equal(db.storageStatus().mode,'sqlite');
 listener=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin='http://127.0.0.1:'+listener.address().port;
 const get=async query=>{const response=await fetchLocal(origin+'/api/v2/news?'+query);assert.equal(response.status,200);return response.json();};
 const first=await get('refresh=1&background=1');assert.equal(first.refresh.pending,true,'Cold refresh returns before a slow source completes');
 const progressive=await get('quick=1');assert.equal(progressive.refresh.pending,true);assert(progressive.items.some(i=>i.title==='Une nouvelle saison de test'),'Fast-source article must be visible while slow feeds are blocked');assert.equal(progressive.cached,true);
 const inFlightCalls=calls;assert(inFlightCalls>1);await Promise.all([get('refresh=1&background=1'),get('refresh=1&background=1')]);assert.equal(calls,inFlightCalls,'Concurrent refreshes share a single collection');
 release();let result;for(let i=0;i<50;i++){result=await get('quick=1');if(!result.refresh.pending)break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(result.refresh.pending,false);assert(result.items.length>0);assert.equal(result.refresh.completedSources,result.refresh.totalSources);assert(fs.statSync(path.join(dir,db.storageStatus().engine==='sqlite-disk'?'caches.sqlite':'animes.sqlite')).size>0);
 failAll=true;await get('refresh=1&background=1');for(let i=0;i<50;i++){result=await get('quick=1');if(!result.refresh.pending)break;await new Promise(r=>setTimeout(r,5));}
 assert(result.items.some(i=>i.title==='Une nouvelle saison de test'),'A failed refresh preserves earlier articles');
 const SQL=await require('sql.js')();const reopened=new SQL.Database(fs.readFileSync(path.join(dir,db.storageStatus().engine==='sqlite-disk'?'caches.sqlite':'animes.sqlite')));const tables=reopened.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.flat();assert(tables.includes('news_history'));assert(reopened.exec('SELECT count(*) FROM news_history')[0].values[0][0]>0);reopened.close();
 console.log('OK progressive news: real Express/SQLite, cold nonblocking response, early feed publication, shared concurrent job, source progress, failure preserves history, persisted articles reopened. Provider responses are controlled fixtures.');
})().then(async()=>{clearTimeout(timeout);await require('./runtime-cleanup').cleanupRuntime(dir,listener);process.exit(0);}).catch(async e=>{console.error(e);release();clearTimeout(timeout);await require('./runtime-cleanup').cleanupRuntime(dir,listener);process.exit(1);});
