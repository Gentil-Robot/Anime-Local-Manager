'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm48-runtime-'));
process.env.ALM_DATA_DIR=path.join(dir,'data');process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_SQLJS_ONLY='1';
fs.mkdirSync(process.env.ALM_DATA_DIR,{recursive:true});fs.mkdirSync(process.env.ALM_IMAGES_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.ALM_DATA_DIR,'animes.json'),'[]');
function expressStub(){const app={use(){}};for(const method of ['get','post','put','delete','patch'])app[method]=()=>{};return app;}expressStub.json=expressStub.static=()=>()=>{};
const original=Module._load;Module._load=function(name,...args){if(name==='express')return expressStub;if(name==='multer')return Object.assign(()=>({single:()=>()=>{}}),{memoryStorage:()=>({})});if(name==='sql.js')throw Error('isolated JSON fixture');return original.call(this,name,...args);};
global.fetch=async()=>{throw Error('Offline regression fixture');};
const server=require('../server'),t=server.__test,series=require('../public/series-state'),integrity=require('../lib/import-integrity');
try{
 const row={id:'48',title:'Fixture',episode:'S01E12',remaining:'0',status:'100'};
 assert.equal(t.betaseriesWatchedCount(row),12);
 const anime=t.buildAnimeFromBetaSeries(row,{title:'Fixture',officialTitle:'Fixture',episodesTotal:'12',type:'TV',malId:'48000'},'anime');
 assert.equal(anime.episodesSeen,'12');assert.equal(Number(anime.betaseriesOverflowEpisodes||0),0);assert.equal(t.repairAnimeLibrary([{id:1,...anime}]).items.length,1);
 console.log('OK Beta48: completed CSV rows retain their real episode count and never generate sentinel seasons');
 const broken=[{id:1,title:'Fixture',episodesTotal:'12',episodesSeen:'12',status:'Completed',type:'TV',betaseriesId:'48',betaseriesSeriesId:'48',betaseriesSeason:1,betaseriesEpisode:'S01E12',betaseriesOriginalProgress:'999999/12',betaseriesOverflowEpisodes:999987,notes:'Root note',score:'8',tags:['BetaSeries']},
 {id:2,title:'Fixture — Saison 2',manualSeasonNumber:2,betaseriesSeason:2,betaseriesSeriesId:'48',betaseriesEpisode:'S01E12',episodesTotal:'12',episodesSeen:'12',score:'9',notes:'Keep this note',tags:['saison à identifier','progression à vérifier']}];
 t.writeAnimes(broken);let saved=t.readAnimes();assert.equal(saved.length,1);assert(saved[0].notes.includes('Keep this note'));assert.equal(saved[0].score,'8');assert.equal(saved[0].importRecoveryRecords[0].score,'9');
 const copy=JSON.parse(fs.readFileSync(path.join(process.env.ALM_DATA_DIR,'backups/before-beta48-import-integrity.json')));assert(JSON.stringify(copy).includes('Keep this note'));assert.equal(t.repairAnimeLibrary(saved).changed,false);
 console.log('OK Beta48: legacy phantom cards are repaired idempotently and all originals, notes and ratings remain recoverable');
 const pending={title:'Fixture — Saison 3',manualSeasonNumber:3,tags:['saison à identifier']};
 assert(!integrity.acceptsInfo(pending,{title:'Fixture',malId:1}));assert(integrity.acceptsInfo(pending,{title:'Fixture Season 3',malId:3}));
 const mixed=t.mergeImportedAnime({id:5,title:'Mon titre',customTitle:'Mon titre',score:'9',notes:'Personnel',poster:'/images/local.jpg',tags:['perso'],episodesSeen:'8',episodesTotal:'12'}, {title:'Official',notes:'Import',score:'',poster:'',episodesSeen:'10',episodesTotal:'12',tags:['import']},true);
 assert.equal(mixed.title,'Mon titre');assert.equal(mixed.score,'9');assert.equal(mixed.poster,'/images/local.jpg');assert(mixed.notes.includes('Personnel'));assert(mixed.notes.includes('Import'));
 console.log('OK Beta48: unresolved seasons reject S1 matches, and overwrite imports preserve personal title, score, poster and notes');
 t.writeAnimes([{id:10,title:'A',malId:'10',status:'Watching',episodesSeen:'3',score:'7',notes:'Before',poster:'/images/before.jpg'},{id:11,title:'B',malId:'11',episodesSeen:'1'}]);
 const snapshot=t.readAnimes();snapshot[0].synopsis='New synopsis';snapshot[0].poster='/images/automatic.jpg';
 t.writeAnimes([{id:10,title:'Changed',customTitle:'Changed',malId:'10',status:'Watching',episodesSeen:'5',score:'10',notes:'During',poster:'/images/manual.jpg'},{id:12,title:'New',malId:'12'}]);
 t.writeCompletionAnimes(snapshot);saved=t.readAnimes();assert.equal(saved.length,2);const a=saved.find(a=>a.id===10);assert.equal(a.title,'Changed');assert.equal(a.episodesSeen,'5');assert.equal(a.poster,'/images/manual.jpg');assert.equal(a.synopsis,'New synopsis');assert(!saved.some(a=>a.id===11));assert(saved.some(a=>a.id===12));
 console.log('OK Beta48: completion preserves edits and uploaded covers, does not resurrect deleted cards or remove newly added cards');
 const three=[{id:1,title:'Example',type:'TV',episodesSeen:'12',episodesTotal:'12',status:'Completed'},{id:2,title:'Example Season 2',type:'TV',episodesSeen:'12',episodesTotal:'12',status:'Completed'},{id:3,title:'Example Season 3',type:'TV',episodesSeen:'7',episodesTotal:'12',status:'Watching'}];
 let g=series.groups(three)[0];assert.equal(series.groups(three).length,1);assert.equal(g.seen,31);assert.equal(g.total,36);assert.equal(g.active.id,3);assert.deepEqual(g.gaps,[]);
 g=series.groups([three[0],{...three[2],episodesTotal:''}])[0];assert.deepEqual(g.gaps,[2]);assert.equal(g.total,12);assert.equal(g.unknown,1);
 assert.equal(series.groups([three[0],{...three[2],seriesSeparate:true}]).length,2);assert.equal(series.groups([three[0],{id:4,title:'Example Movie',type:'Movie'}]).length,2);
 const movies=series.groups([{...three[0],seriesGroupTitle:'Example'},{id:5,title:'Movie',type:'Movie',seriesGroupTitle:'Example',episodesSeen:'1',episodesTotal:'1'}])[0];assert.equal(movies.extras.length,1);assert.equal(movies.seen,12);
 const family=[{id:1,title:'Base',malId:101,type:'TV',status:'Completed',episodesSeen:'12',episodesTotal:'12'}];const link=t.linkSeasonFamily({title:'A differently named sequel',sourceMalId:101,sourceTitle:'Base',seasonClass:'direct_sequel'},family);assert.equal(link.manualSeasonNumber,2);assert.equal(link.seriesGroupTitle,'Base');assert.equal(family[0].episodesSeen,'12');
 const related=series.groups([{id:20,title:'Original',malId:20,type:'TV',relations:[{relation:'Sequel',entry:[{mal_id:21}]}]},{id:21,title:'A different sequel title',malId:21,type:'TV'}]);assert.equal(related.length,1);assert.equal(related[0].seasons.length,2);
 console.log('OK Beta48: series totals, S2 gaps, unknown totals, separate films and confirmed renamed sequels keep independent progress');
 const {createNotificationCenter}=require('../lib/notification-center'),{createCalendar}=require('../lib/calendar');
 const airingAt=Math.floor(Date.parse('2026-10-08T18:00:00Z')/1000),center=createNotificationCenter({file:path.join(dir,'notifications.json'),now:()=>Date.parse('2026-10-09T09:00:00Z')});
 center.record({animeId:1,malId:101,title:'Base',episode:16,airingAt});center.record({animeId:1,malId:101,title:'Base',episode:16,airingAt});assert.equal(center.state().items.length,1);
 const calendar=createCalendar({stateFile:path.join(dir,'calendar.json'),getAnimes:()=>family,getNotificationEvents:()=>center.state().items,fetchTracked:async()=>[],fetchGlobal:async()=>({events:[]})});
 const events=calendar.state().events;assert.equal(events.length,1);assert.equal(events[0].date,'2026-10-08');assert.equal(center.state().items[0].createdAt,Date.parse('2026-10-09T09:00:00Z'));
 center.record({animeId:1,malId:101,title:'Base',episode:17});assert.equal(calendar.state().events.length,1);
 console.log('OK Beta48: calendar uses confirmed broadcast dates, duplicate notices share one episode and reception dates never become invented broadcasts');
}catch(e){console.error(e);process.exitCode=1;}finally{server.stopBackups();require('../db').close?.();Module._load=original;fs.rmSync(dir,{recursive:true,force:true});}

