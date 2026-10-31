'use strict';
// Run with Electron in Node mode against a real electron-builder ASAR package.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if (!process.versions.electron) throw Error('Use ELECTRON_RUN_AS_NODE=1 with the Electron executable.');
const archive=path.resolve(process.argv[2]||'dist/linux-unpacked/resources/app.asar');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'alm36-packaged-'));
process.env.ALM_DATA_DIR=profile;process.env.ALM_IMAGES_DIR=path.join(profile,'images');
fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const fetchLocal=global.fetch;
global.fetch=(url,...args)=>{if(!String(url).startsWith('http://127.0.0.1:'))return Promise.reject(Error('External request disabled during packaged test'));return fetchLocal(url,...args);};
let listener;
(async()=>{
 const db=require(path.join(archive,'db.js')),{app}=require(path.join(archive,'server.js'));
 await db.whenReady();assert.equal(db.storageStatus().mode,'sqlite');
 assert.equal(db.getMetadataCount(),30430,'The complete metadata snapshot must be loaded offline');
 listener=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const origin='http://127.0.0.1:'+listener.address().port;
 for (const url of ['/','/app.js','/scroll-progress.js','/beta37.js','/beta37.css','/beta38.js','/beta38.css','/release-watch.js','/release-copy.js','/beta39.js','/beta39.css','/beta39-copy.js','/beta40.js','/beta40.css','/beta40-copy.js','/catalog.js','/beta42.js','/beta42.css','/beta42-copy.js','/beta45.js','/beta45.css','/countdown.js','/locales/zh-CN.json','/assets/design/alm-retro-banner.gif',...['chevauchee','jardin','bibliotheque','constellations'].map(k=>'/assets/wallpapers/ALM-'+k+'.png')]) {const r=await fetchLocal(origin+url);assert.equal(r.status,200,url);assert((await r.arrayBuffer()).byteLength>100);}
 for (const asset of ['alm-clip-complet-1080p.mp4']) {const r=await fetchLocal(origin+'/assets/'+asset,{headers:{Range:'bytes=0-1023'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,1024);}
 for(const name of ['elf','mage','knight','nekomata','fox','dragon','slime','forest-spirit']){const r=await fetchLocal(origin+'/assets/calendar/'+name+'.svg');assert.equal(r.status,200);assert((await r.text()).includes('<svg'));}
 assert.equal((await fetchLocal(origin+'/calendar-companions.js')).status,200);
 assert.equal(typeof require(path.join(archive,'lib/calendar-tvmaze.js')).trackedEvents,'function');
 assert.equal(require(path.join(archive,'public/karaoke/song.json')).sections.flatMap(section=>section.lines).reduce((sum,line)=>sum+line.jaUnits.length,0),270);
 for(const name of ['chevauchee','jardin','bibliotheque','constellations'])for(const size of ['FHD','QHD','4K']){const r=await fetchLocal(origin+'/assets/wallpapers/ALM-'+name+'-'+size+'.jpg');assert.equal(r.status,200);assert((await r.arrayBuffer()).byteLength>10000);}
 assert.equal((await fetchLocal(origin+'/api/notifications').then(r=>r.json())).items.length,0);const notice=await fetchLocal(origin+'/api/notifications/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());assert.equal(notice.items[0].type,'test');assert.equal((await fetchLocal(origin+'/api/titles?ids=199').then(r=>r.json())).titles[199].fr,'Le Voyage de Chihiro');
 const catalogue=await fetchLocal(origin+'/api/catalog').then(r=>r.json());assert.equal(catalogue.items.length,48);assert.equal(catalogue.total,30430);assert.equal(typeof require(path.join(archive,'lib/display-preferences.js')).bounds,'function');
 assert.equal(require(path.join(archive,'package.json')).version,require('../package.json').version);assert.equal((await fetchLocal(origin+'/api/calendar').then(r=>r.json())).running,false);assert.equal(typeof require(path.join(archive,'lib/integrated-updater.js')).chooseAsset,'function');
 db.insertAnime({id:1,title:'Packaged fixture',status:'Watching',episodesSeen:'3',episodesTotal:'12',tags:[],genres:[]});db.flush();
 assert(fs.statSync(path.join(profile,db.storageStatus().engine==='sqlite-disk'?'collection.sqlite':'animes.sqlite')).size>0);assert.equal(db.getAnimeById(1).episodesSeen,'3');
 const denied=await fetchLocal(origin+'/api/animes',{headers:{Origin:'https://untrusted.example'}});assert.equal(denied.status,403);
 assert.equal((await fetchLocal(origin+'/../package.json')).status,404);
 const diagnostic=await fetchLocal(origin+'/api/diagnostics').then(r=>r.json());assert.equal(diagnostic.version,require('../package.json').version);assert.equal(diagnostic.snapshot.rows,30430);
 const {Worker}=require('node:worker_threads');
 await new Promise((resolve,reject)=>{
   const worker=new Worker(path.join(archive,'csv-worker.js'),{workerData:{rows:[],matchingCache:{},betaFastCache:{},config:{},dataDir:profile}});
   const timeout=setTimeout(()=>{worker.terminate();reject(Error('Packaged CSV worker timed out'));},15000);
   worker.once('error',e=>{clearTimeout(timeout);reject(e);});
   worker.on('message',m=>{
     if(m.type!=='result'&&m.type!=='error')return;
     clearTimeout(timeout);worker.terminate();
     if(m.type==='error')return reject(Error(m.message));
     try{assert.deepEqual(m.results,[]);resolve();}catch(e){reject(e);}
   });
 });
 console.log('OK packaged Electron/ASAR: Express, SQLite disk/compatibility, offline snapshot 30430, UI/assets, ranged audio/video, writable isolated user data, Origin protection, CSV worker.');
})().then(()=>finish(0),e=>{console.error(e);finish(1);});
async function finish(code){
 try{await require('./runtime-cleanup').cleanupRuntime(profile,listener,archive);}
 catch(error){console.error('Runtime cleanup failed:',error);code=1;}
 process.exit(code);
}
