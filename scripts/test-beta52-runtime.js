'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm52-runtime-'));let listener;const keepAlive=setInterval(()=>{},1000);
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;global.fetch=(url,options)=>{
 const u=new URL(String(url));if(u.hostname==='127.0.0.1')return nativeFetch(url,options);
 if(u.hostname==='api.tvmaze.com'&&u.pathname==='/search/shows')return Promise.resolve(new Response(JSON.stringify([{score:1,show:{id:77752,name:'Dexter',type:'Scripted',language:'English',genres:['Drama'],premiered:'2006-10-01',image:{original:'https://example.invalid/dexter.jpg'}}}]),{headers:{'Content-Type':'application/json'}}));
 return Promise.reject(Error('Offline fixture'));
};
(async()=>{
 const server=require('../server'),db=require('../db'),{groups,providerRanges}=require('../public/series-state');await db.whenReady();
 const base={status:'Plan to Watch',type:'TV',genres:['Fantasy'],poster:'/assets/design/moon-library.webp'};
 const rows=[{...base,id:1,malId:59989,title:'Kami no Tou: Koubou-sen',status:'Completed',episodesTotal:13,episodesSeen:13,startDate:'2024-10-06',synopsis:'Second part of Tower of God Season 2.'},
 {...base,id:2,malId:62359,title:'Towa no Yuugure Episode 0',type:'SPECIAL',episodesTotal:1,startDate:'2025-09-25',synopsis:'Episode 0 of Towa no Yuugure.'},
 {...base,id:3,malId:64419,title:'Nisemono no Renkinjutsushi',synopsis:'A fantasy story with alchemy and magic.'},
 {...base,id:4,malId:56647,title:'Ao no Miburo',status:'Completed',episodesSeen:'24',episodesTotal:'24',score:'6',notes:'Personal fixture note',relations:[{relation:'Sequel',entry:[{type:'anime',mal_id:61333}]}]}];
 db.writeAllAnimes(rows);db.importMetadataRows([{malId:61333,title:'Ao no Miburo: Serizawa Ansatsu-hen',type:'TV',episodes:14,startDate:'2025-12-20',synopsis:'Second season of Ao no Miburo.',genres:['Action']}]);
 for(const row of rows.slice(0,3))assert.equal(server.__test.animeFullCompleteness(row).complete,true);
 const incomplete={...base,malId:888,title:'Missing plot',synopsis:'',startDate:'2020-01-01',episodesTotal:12};assert(server.__test.animeFullCompleteness(incomplete).missing.includes('synopsis'));
 assert(server.__test.animeFullCompleteness({...rows[2],status:'Completed'}).missing.includes("nombre d'épisodes"));
 listener=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+listener.address().port;
 async function api(url,body,method='POST'){const response=await nativeFetch(origin+url,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;}
 let issues=await api('/api/library/completion-issues');assert(!issues.items.some(a=>[1,2,3].includes(a.id)));assert.equal(issues.awaiting.length,1);assert.equal(issues.awaiting[0].id,3);assert(!db.getAnimeById(3).startDate);assert(!db.getAnimeById(3).episodesTotal);
 const next={sourceTitle:'Ao no Miburo',title:'Ao no Miburo: Serizawa Ansatsu-hen',malId:'61333',relation:'Sequel',type:'TV',episodesTotal:'14'};
 const results=await Promise.all([api('/api/news/add-to-plan',next),api('/api/news/add-to-plan',next)]);assert(results.some(r=>r.anime));assert(results.some(r=>r.alreadyExists));
 const current=server.__test.readAnimes();assert.equal(current.filter(a=>Number(a.malId)===61333).length,1);const sequel=current.find(a=>Number(a.malId)===61333);assert.equal(sequel.status,'Plan to Watch');assert.equal(sequel.manualSeasonNumber,2);assert.equal(groups(current).find(g=>g.items.includes(sequel)).items.length,2);assert.equal(db.getAnimeById(4).notes,'Personal fixture note');
 const conan={id:20,title:'Meitantei Conan',canonicalTitle:'Meitantei Conan',malId:235,type:'TV',status:'Watching',episodesSeen:'',episodesTotal:'',betaseriesEpisode:'S26E34',betaseriesProgressScope:'season-marker',progressUnresolved:true,importShapeVersion:50,poster:base.poster};
 db.writeAllAnimes([...current,conan]);const group=groups([conan])[0],ranges=providerRanges(group);assert.deepEqual(ranges.map(r=>[r.from,r.to]),[[1,5],[6,10],[11,15],[16,20],[21,25],[26,26]]);assert.equal(new Set(ranges.flatMap(r=>r.seasons)).size,26);assert.equal(group.seasons.length,1);
 await api('/api/animes/20/season-status',{season:2,status:'Completed'},'PATCH');await api('/api/animes/20/season-status',{season:26,status:'Completed'},'PATCH');const saved=server.__test.readAnimes().find(a=>a.id===20);assert.equal(saved.seriesSeasonStatuses[2],'Completed');assert.equal(saved.status,'Completed');assert.equal(saved.betaseriesEpisode,'S26E34');assert.equal(saved.episodesSeen,'');assert.equal(saved.episodesTotal,'');
 // An old review gains reliable TV evidence while resolving its missing cover.
 fs.writeFileSync(path.join(dir,'media-review.json'),JSON.stringify({pendingImports:[{key:'betaseries:dx',state:'pending',source:'BetaSeries',sourceTitle:'Dexter',classification:'review',anime:{title:'Dexter'},row:{id:'dx',title:'Dexter'}}],quarantined:[],analysis:null}));
 const resolved=await api('/api/v2/content-audit/images/resolve',{refs:['pending:betaseries:dx']});assert.equal(resolved.items.length,1);assert.equal(resolved.items[0].excluded,true);
 const review=JSON.parse(fs.readFileSync(path.join(dir,'media-review.json')));assert.equal(review.pendingImports[0].state,'auto_excluded');const cache=JSON.parse(fs.readFileSync(path.join(dir,'cache/tvmaze-import-cache.json')));assert.equal(cache.dexter.value.name,'Dexter');assert.equal(cache.dexter.value.type,'Scripted');
 issues=await api('/api/library/completion-issues');assert(!issues.items.some(a=>[1,2,3].includes(a.id)));
 console.log('OK Beta52: short synopses accepted; announced unknown data advisory; concurrent Ao no Miburo adds one linked S2; Conan ranges and statuses preserve progress; TV evidence removes and caches Dexter.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,listener);clearInterval(keepAlive);});
