'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {createMetadataProviders,malToJikan,kitsuToJikan}=require('../lib/metadata-providers');
const {createServiceHealth}=require('../lib/service-health');
const {createRankings}=require('../lib/rankings');
const {maintain}=require('./metadata-maintenance');
const {inspectSnapshot}=require('../lib/metadata-snapshot');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alm44-'));let checks=0,listener,server;
const ok=name=>{checks++;console.log('OK Beta44:',name);};
const response=data=>({response:{ok:true,status:200,headers:new Headers()},text:JSON.stringify(data)});
(async()=>{
 let calls=[],clock=1000;
 const item={type:'anime',id:'88',attributes:{canonicalTitle:'Exact sequel',titles:{en:'Exact sequel'},episodeCount:12,subtype:'TV',averageRating:'90',posterImage:{large:'https://example.test/88.jpg'}}};
 const mapping=(id,target='88',type='anime')=>({type:'mappings',id:'1',attributes:{externalSite:'myanimelist/anime',externalId:String(id)},relationships:{item:{data:{type,id:target}}}});
 let payload={data:[mapping(20)],included:[item]};
 const provider=createMetadataProviders({now:()=>clock,fetchText:async(url,options)=>{calls.push({url,options});return response(payload);}});
 const results=await Promise.all([provider.byId(20),provider.byId(20)]);assert.equal(calls.length,1);assert.equal(results[0].mal_id,20);assert.equal(results[0].kitsuId,88);assert.equal(results[0].score,null);assert(!calls.some(c=>c.url.includes('jikan')));await provider.byId(20);assert.equal(calls.length,1);ok('one verified Kitsu mapping preserves MAL identity, shares requests and never imports its score as MAL');
 payload={data:[mapping(999)],included:[item]};assert.equal(await provider.byId(21),null);
 payload={data:[mapping(22),mapping(22,'89')],included:[item]};assert.equal(await provider.byId(22),null);
 payload={data:[mapping(23,'88','manga')],included:[{...item,type:'manga'}]};assert.equal(await provider.byId(23),null);
 payload={data:[mapping(24)],included:[]};assert.equal(await provider.byId(24),null);ok('foreign IDs, ambiguous seasons, manga and absent included records are rejected');
 payload={data:[item],included:[mapping(20)]};const search=await provider.search('Exact sequel');assert.equal(search.length,1);assert.equal(search[0].mal_id,20);payload={data:[item],included:[]};assert.equal((await provider.search('Unknown')).length,0);ok('Kitsu title search admits only records carrying an explicit MAL mapping');
 let id='clientFixture0000',malCalls=[];
 const mal=createMetadataProviders({getClientId:()=>id,fetchText:async(url,options)=>{malCalls.push({url,options});assert.equal(options.maxRedirects,0);assert.equal(options.headers['X-MAL-CLIENT-ID'],id);return response({id:101,title:'Exact film',media_type:'movie',mean:8.1,rank:41,alternative_titles:{en:'Exact film'},related_anime:[{relation_type:'prequel',node:{id:100,title:'Earlier film'}}]});}});
 const film=await mal.byId(101);assert.equal(film.type,'Movie');assert.equal(film.relations[0].entry[0].mal_id,100);assert.equal(film.score,8.1);assert.equal(film.url,'https://myanimelist.net/anime/101');ok('official MAL fields, relations and film format use their own exact IDs without credential redirects');
 let forbidden=0;const offline=createMetadataProviders({fetchText:async()=>{forbidden++;throw Error('offline');},now:()=>clock});assert.equal(await offline.byId(100),null);assert.equal(await offline.byId(101),null);assert.equal(forbidden,1);assert.equal((await offline.search('Known')).length,0);assert.equal(forbidden,1);ok('network failure opens a cooldown across requests rather than multiplying timeouts');
 const health=createServiceHealth({fetchText:async()=>{throw Error('unexpected network');}});assert.equal((await health.test('jikan')).state,'retired');assert.equal((await health.test('mal')).state,'unconfigured');ok('retired and unconfigured diagnostics return immediately without network access');
 let broken=false;const rankings=createRankings({directory:path.join(temp,'rankings'),source:'mal',now:()=>clock,wait:async()=>{},fetchPage:async p=>({data:Array.from({length:broken&&p===3?24:25},(_,i)=>({mal_id:(p-1)*25+i+1,title:'Fixture '+((p-1)*25+i+1),score:8,rank:(p-1)*25+i+1}))})});await rankings.refresh();assert.equal(rankings.state().source,'mal');assert.equal(rankings.state().items.length,100);const before=JSON.stringify(rankings.state().items);clock+=86400001;broken=true;await rankings.refresh();assert(rankings.state().unavailable);assert.equal(JSON.stringify(rankings.state().items),before);ok('official Top 100 publishes only four complete consistent pages and retains the last good ranking on failure');
 const database=path.join(temp,'snapshot/data/database');fs.mkdirSync(database,{recursive:true});const bundled=path.resolve(__dirname,'../data/database');fs.copyFileSync(path.join(bundled,'metadata-recovery.sql.gz'),path.join(database,'metadata-recovery.sql.gz'));fs.copyFileSync(path.join(bundled,'metadata-recovery.json'),path.join(database,'metadata-recovery.json'));fs.mkdirSync(path.join(temp,'snapshot/.metadata-build-cache'),{recursive:true});fs.writeFileSync(path.join(temp,'snapshot/.metadata-build-cache/keep.txt'),'resume me');fs.writeFileSync(path.join(database,'personal-collection.json'),'PRIVATE_DATA');const restored=maintain({root:path.join(temp,'snapshot')});assert(restored.restored);assert.equal(restored.rows,30430);const digest=restored.sha256;assert.equal(maintain({root:path.join(temp,'snapshot')}).sha256,digest);assert.equal(fs.readFileSync(path.join(database,'personal-collection.json'),'utf8'),'PRIVATE_DATA');assert.equal(fs.readFileSync(path.join(temp,'snapshot/.metadata-build-cache/keep.txt'),'utf8'),'resume me');ok('offline restoration recovers all 30430 rows with an identical hash and preserves collection and resume cache');
 fs.writeFileSync(path.join(database,'metadata-full.sql.gz'),'corrupt');assert.throws(()=>maintain({root:path.join(temp,'snapshot')}));assert.equal(fs.readFileSync(path.join(database,'metadata-full.sql.gz'),'utf8'),'corrupt');ok('an existing invalid snapshot is reported and never silently overwritten');
 // Real SQLite and HTTP, with every outbound request controlled.
 const profile=path.join(temp,'profile');fs.mkdirSync(profile);process.env.ALM_DATA_DIR=profile;process.env.ALM_IMAGES_DIR=path.join(profile,'images');fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({metadataUpdateOnStart:false,metadataAutonomousUpdateOnStart:false}));
 const nativeFetch=global.fetch,outbound=[];global.fetch=(url,options)=>{if(String(url).startsWith('http://127.0.0.1:'))return nativeFetch(url,options);outbound.push(String(url));return Promise.reject(Error('Offline fixture'));};
 server=require('../server');const db=require('../db');await db.whenReady();listener=await new Promise(resolve=>{const l=server.app.listen(0,'127.0.0.1',()=>resolve(l));});const origin='http://127.0.0.1:'+listener.address().port;
 const api=async(route,body)=>{const r=await nativeFetch(origin+route,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 assert.equal(db.getMetadataCount(),30430);assert.equal((await api('/api/catalog')).data.items.length,48);await api('/api/catalog/add-batch',{ids:[20,199],status:'Completed',score:9});const personal=JSON.stringify(db.getAllAnimes());
 assert.equal((await api('/api/rankings')).data.source,'local');assert.equal((await api('/api/services/jikan/test',{})).data.state,'retired');assert.equal((await api('/api/services/mal/test',{})).data.state,'unconfigured');
 const update=(await api('/api/metadata/autonomous/sync',{force:true})).data;assert.equal(update.ok,false);assert.equal(update.merged,0);assert.equal(db.getMetadataCount(),30430);assert.equal(JSON.stringify(db.getAllAnimes()),personal);ok('fresh offline profile loads the full catalogue; updates preserve collection and report missing sources honestly');
 await api('/api/discover?q=Naruto&online=1');assert(!outbound.some(url=>url.includes('api.jikan.moe')));ok('real discovery, rankings, diagnostics and metadata refresh make zero Jikan public requests');
 assert.equal((await api('/api/config/providers',{malClientId:'bad\r\nheader'})).status,400);const saved=await api('/api/config/providers',{malClientId:'ownClientFixture0000'});assert.equal(saved.data.malConfigured,true);assert(!JSON.stringify(saved.data).includes('ownClientFixture0000'));assert(!JSON.stringify((await api('/api/config')).data).includes('ownClientFixture0000'));assert.equal((await api('/api/config/providers',{malClientId:''})).data.malConfigured,false);ok('optional client settings validate header input, hide stored values and support removal');
 global.fetch=()=>Promise.reject(Error('should not call'));const calendar=require('../lib/calendar-sources');calendar.setProviders(null);await assert.rejects(calendar.jikan('anime/20/full'));global.fetch=nativeFetch;ok('default calendar fallback cannot contact the retired public API');
 const source=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');assert(!source.includes('sort:UPDATED_AT_DESC'));assert(!source.includes('averageScore) / 10) * 100'));ok('bulk AniList metadata collection is removed and its scores cannot populate MAL metadata');
 console.log(checks+' Beta44 adaptation checks passed. Remote services used controlled fixtures; no personal MAL credentials available.');
})().then(()=>finish(0),error=>{console.error(error);finish(1);});
async function finish(code){
 try{await require('./runtime-cleanup').cleanupRuntime(temp,listener);}
 catch(error){console.error('Runtime cleanup failed:',error);code=1;}
 process.exit(code);
}
