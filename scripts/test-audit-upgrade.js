#!/usr/bin/env node
"use strict";
// Behavioral regression tests. Backend dependencies are stubbed; persistence
// deliberately exercises the JSON fallback, not the uninstalled SQLite engine.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm'),http=require('node:http');
const ROOT=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-audit-'));
const originalLoad=Module._load, originalFetch=global.fetch;
process.env.ALM_SQLJS_ONLY='1';process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');
fs.mkdirSync(path.join(dir,'cache'));fs.writeFileSync(path.join(dir,'animes.json'),'[]');
function expressStub(){const app={_routes:[],use(){return app;},disable(){return app;}};for(const method of ['get','post','put','delete','patch'])app[method]=(route,...handlers)=>{app._routes.push({method,route,handlers});return app;};return app;}
expressStub.json=expressStub.static=()=>()=>{};
function multerStub(){return {single(){return ()=>{};}};}multerStub.memoryStorage=()=>({});
Module._load=function(name,parent,main){if(name==='express')return expressStub;if(name==='multer')return multerStub;if(name==='sql.js')throw new Error('Test: deliberate JSON fallback');return originalLoad.call(this,name,parent,main);};
global.fetch=async()=>{throw new Error('External network disabled in regression suite');};
let count=0;const test=(name,fn)=>{fn();count++;console.log('OK audit: '+name);};
(async()=>{
const server=require(path.join(ROOT,'server.js')),db=require(path.join(ROOT,'db.js')),season=require(path.join(ROOT,'lib/season-identity.js'));
await db.whenReady();
const record=(id,title,extra={})=>({id,title,type:'TV',status:'Watching',episodesSeen:'7',episodesTotal:'12',tags:[],...extra});
test('different MAL ids never merge through a shared BetaSeries season',()=>{
 const rows=[record(1,'Example II',{malId:100,betaseriesSeriesId:'s',betaseriesSeason:2}),record(2,'Example II Part 2',{malId:101,betaseriesSeriesId:'s',betaseriesSeason:2})];
 assert.equal(server.__test.repairAnimeLibrary(rows).items.length,2);
});
test('conflicting official ids with identical titles remain separate',()=>assert.equal(server.__test.repairAnimeLibrary([record(1,'Example',{malId:1}),record(2,'Example',{malId:2})]).items.length,2));
test('Part/Cour is not a season number',()=>{assert.equal(season.titleSlot('Example Part 2').season,0);assert.equal(season.titleSlot('Example IV Part 2').season,4);assert.equal(season.titleSlot('Example IV Part 2').part,2);});
test('two cours without official ids are not collapsed',()=>assert.equal(server.__test.repairAnimeLibrary([record(1,'Example IV Part 1'),record(2,'Example IV Part 2')]).items.length,2));
test('CJK-only library titles retain distinct identities',()=>assert.equal(server.__test.repairAnimeLibrary([record(1,'\u661f\u306e\u65c5'),record(2,'\u591c\u306e\u65c5')]).items.length,2));
test('known season conflict wins over a mistakenly inherited MAL id',()=>assert.equal(server.__test.repairAnimeLibrary([record(1,'Example',{malId:1,betaseriesSeason:1}),record(2,'Example II',{malId:1,betaseriesSeason:2})]).items.length,2));
test('same explicit season can reconcile a provisional and official entry',()=>{
 const rows=[record(1,'Example II',{malId:200,betaseriesSeriesId:'s',betaseriesSeason:2}),record(2,'Example - Season 2',{betaseriesSeriesId:'s',betaseriesSeason:2,notes:'Keep my note'})];
 const out=server.__test.repairAnimeLibrary(rows).items;assert.equal(out.length,1);assert.equal(String(out[0].malId),'200');assert.equal(out[0].episodesSeen,'7');assert(out[0].notes.includes('Keep my note'));
});
test('HELL MODE overflow retains 7 unallocated episodes without inventing S2 capacity',()=>{
 const a=server.__test.repairAnimeLibrary([record(1,'HELL MODE',{episodesSeen:'12',status:'Completed',betaseriesOverflowEpisodes:7,betaseriesSeriesId:'hell',betaseriesSeason:1})]);
 assert.equal(a.items.length,1);assert.equal(a.items[0].episodesSeen,'12');assert.equal(a.items[0].unallocatedEpisodes,7);assert.equal(a.items[0].episodesTotal,'12');assert.equal(a.items[0].status,'Completed');
 const b=server.__test.repairAnimeLibrary(a.items);assert.equal(b.items.length,1);assert.equal(b.items[0].unallocatedEpisodes,7);assert.equal(b.changed,false);
});
test('overflow uses existing sequel capacity instead of copying S1 total',()=>{
 const a=server.__test.repairAnimeLibrary([record(1,'Example',{episodesSeen:'12',status:'Completed',betaseriesOverflowEpisodes:19,betaseriesSeriesId:'s',betaseriesSeason:1}),record(2,'Example II',{episodesSeen:'0',episodesTotal:'24',betaseriesSeriesId:'s',betaseriesSeason:2})]);
 assert.equal(a.items.length,2);assert.equal(a.items.find(x=>x.id===2).episodesSeen,'19');assert.equal(a.items.find(x=>x.id===2).status,'Watching');
});
test('ambiguous split season retains overflow for review',()=>{
 const a=server.__test.repairAnimeLibrary([record(1,'Example',{betaseriesOverflowEpisodes:7,betaseriesSeriesId:'s',betaseriesSeason:1}),record(2,'Example II Part 1',{malId:2,betaseriesSeriesId:'s',betaseriesSeason:2}),record(3,'Example II Part 2',{malId:3,betaseriesSeriesId:'s',betaseriesSeason:2})]);
 assert.equal(a.items.length,3);assert.equal(a.items[0].betaseriesOverflowEpisodes,7);
});
test('bounded migration checkpoints residual progress instead of reallocating it',()=>{
 const a=server.__test.repairAnimeLibrary([record(1,'Long story',{episodesSeen:'12',betaseriesSeason:1,betaseriesOverflowEpisodes:150})]);
 const b=server.__test.repairAnimeLibrary(a.items);assert.equal(a.items.length,b.items.length);assert.equal(b.items[0].betaseriesOverflowEpisodes,0);assert.equal(b.items.length,1);assert.equal(b.items[0].unallocatedEpisodes,150);assert.equal(b.items[0].episodesTotal,'12');
});
const atomic=require(path.join(ROOT,'lib/atomic-file.js'));
test('failed atomic rename preserves previous bytes and cleans temporary files',()=>{
 const file=path.join(dir,'atomic.json');fs.writeFileSync(file,'old');const rename=fs.renameSync;
 try{fs.renameSync=(a,b)=>{if(b===file)throw Object.assign(new Error('denied'),{code:'EACCES'});return rename(a,b);};assert.throws(()=>atomic.atomicJson(file,{new:true}),/denied/);}finally{fs.renameSync=rename;}
 assert.equal(fs.readFileSync(file,'utf8'),'old');assert(!fs.readdirSync(dir).some(x=>x.endsWith('.tmp')));
});
test('JSON library add/update/delete round trip and last-good backup',()=>{
 db.writeAllAnimes([]);db.insertAnime(record(1,'Personal'));db.updateAnime(1,{score:'9'});assert.equal(db.getAnimeById(1).score,'9');assert(Array.isArray(JSON.parse(fs.readFileSync(path.join(dir,'animes.json.bak'),'utf8'))));db.deleteAnime(1);assert.equal(db.getAllAnimes().length,0);
});
test('failed library write does not mutate the successful in-memory state',()=>{
 db.writeAllAnimes([record(1,'Keep')]);const rename=fs.renameSync;try{fs.renameSync=(a,b)=>{if(b===path.join(dir,'animes.json'))throw new Error('blocked');return rename(a,b);};assert.throws(()=>db.insertAnime(record(2,'Do not persist')),/blocked/);}finally{fs.renameSync=rename;}
 assert.equal(db.getAllAnimes().length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'animes.json'),'utf8')).length,1);
});
test('invalid bulk write cannot erase library',()=>{assert.throws(()=>db.writeAllAnimes({oops:1}),/array/);assert.equal(db.getAllAnimes().length,1);});
test('malformed JSON is an error, not an empty library',()=>{
 const file=path.join(dir,'animes.json'),before=fs.readFileSync(file);fs.writeFileSync(file,'{broken');const old=Date.now()+3000;fs.utimesSync(file,old/1000,old/1000);
 try{assert.throws(()=>db.getAllAnimes());assert.equal(fs.readFileSync(file,'utf8'),'{broken');}finally{fs.writeFileSync(file,before);}
});
test('corrupt library fails startup before creating an empty SQLite database',()=>{
 const folder=path.join(dir,'bad-start');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'animes.json'),'{bad');
 const code=`require(${JSON.stringify(path.join(ROOT,'db.js'))}).initDb(${JSON.stringify(folder)}).then(()=>process.exit(2)).catch(()=>process.exit(0));`;
 const result=require('node:child_process').spawnSync(process.execPath,['-e',code],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert(!fs.existsSync(path.join(folder,'animes.sqlite')));assert.equal(fs.readFileSync(path.join(folder,'animes.json'),'utf8'),'{bad');
});
const meta=require(path.join(ROOT,'lib/metadata-snapshot.js'));
test('bundled snapshot matches manifest by gzip, hash, size and unique ids',()=>{const m=JSON.parse(fs.readFileSync(path.join(ROOT,'data/database/metadata-manifest.json'),'utf8'));assert(meta.inspectSnapshot(path.join(ROOT,'data/database/metadata-full.sql.gz'),m).rows>10000);});
test('malformed or empty Jikan 200 responses are not end-of-catalogue',()=>{for(const data of [{}, {data:[]}, {data:[],pagination:{has_next_page:false}}, {data:[{mal_id:0,title:'Bad'}],pagination:{has_next_page:false}}])assert.throws(()=>meta.validateJikanPage(data,1));});
test('valid Jikan page is accepted and wrong page is rejected',()=>{const p={data:[{mal_id:1,title:'Test'}],pagination:{has_next_page:false,current_page:1}};assert.equal(meta.validateJikanPage(p,1),p);assert.throws(()=>meta.validateJikanPage(p,2));});
test('large snapshot shrink requires explicit operator override',()=>{assert.throws(()=>meta.checkSnapshotShrink(30000,100));meta.checkSnapshotShrink(30000,100,true);meta.checkSnapshotShrink(30000,29999);});
const d=require(path.join(ROOT,'lib/diagnostics.js'));
test('diagnostic is count-only and reports the completed Chinese catalog',()=>{const report=d.diagnostics(ROOT,db.storageStatus(),[{title:'SECRET_PRIVATE_TITLE',needsSequelCheck:true}],[]);assert(!JSON.stringify(report).includes('SECRET_PRIVATE_TITLE'));assert.equal(report.locales['zh-CN'].percent,100);assert.equal(report.news['zh-CN'].configuredSources,0);assert.equal(report.karaoke.pendingInsertions,0);});
test('news persists Chinese as its own language',()=>{const item=server.__test.normalizeNewsHistoryItem({title:'\u52a8\u753b',url:'https://example.test/news',lang:'zh-CN',publishedAt:'2026-09-01T00:00:00Z'});assert.equal(item.lang,'zh-CN');});
// Run actual browser helpers in a minimal context without bootstrapping the DOM.
const noop=()=>{}, context={window:{addEventListener:noop},document:{addEventListener:noop,querySelectorAll:()=>[]},localStorage:{getItem:()=>null},console,URL,URLSearchParams,Set,Map,Symbol,AbortController,setTimeout,clearTimeout,requestAnimationFrame:noop,MutationObserver:class{observe(){}},CustomEvent:class{}};
context.window.location={origin:'http://127.0.0.1:3123'};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(ROOT,'public/alm-v2.js'),'utf8'),context);
test('recommendation search supports Japanese and Chinese',()=>{assert.equal(vm.runInContext('normalizeRecoSearchV2("\u661f\u306e\u65c5")',context),'\u661f\u306e\u65c5');});
test('recommendations exclude existing library and duplicates',()=>{context.window._almAnimes=[{malId:1,title:'Owned'}];const result=vm.runInContext('filterRecoItemsV2([{malId:1,title:"Owned"},{malId:2,title:"New"},{malId:2,title:"New"}])',context);assert.equal(result.length,1);assert.equal(result[0].malId,2);});
test('similar-response helper exists and tolerates empty data',()=>{assert.equal(vm.runInContext('recoSimilarItemsV2({items:[{malId:2}]}).length',context),1);assert.equal(vm.runInContext('recoSimilarItemsV2({}).length',context),0);});
test('image URLs cannot escape HTML attributes or use executable data schemes',()=>{assert.equal(vm.runInContext('safeUrlV2("javascript:alert(1)")',context),'#');assert.equal(vm.runInContext('safeUrlV2("data:text/html,test")',context),'#');context.unsafe='https://example.test/" onerror="alert(1)';const safe=vm.runInContext('safeUrlV2(unsafe)',context);assert(!safe.includes('"'));});
const security=require(path.join(ROOT,'lib/local-security.js'));
test('IPC is limited to the trusted top-level renderer',()=>{const frame={url:'http://127.0.0.1:3123'},contents={mainFrame:frame},win={webContents:contents};assert(security.validIpcSender({sender:contents,senderFrame:frame},win,frame.url));assert(!security.validIpcSender({sender:{},senderFrame:frame},win,frame.url));assert(!security.validIpcSender({sender:contents,senderFrame:{url:frame.url}},win,frame.url));});
const webServer=http.createServer((req,res)=>{res.status=function(code){this.statusCode=code;return this;};res.json=function(value){this.end(JSON.stringify(value));};security.localRequestGuard(req,res,()=>res.end('OK'));});
await new Promise(resolve=>webServer.listen(0,'127.0.0.1',resolve));
try{
 const port=webServer.address().port;
 const request=headers=>new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:'/',headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});
 assert.equal(await request({}),200);assert.equal(await request({origin:`http://127.0.0.1:${port}`}),200);
 for(const headers of [{origin:'https://evil.example'},{host:`evil.example:${port}`},{origin:'null'},{'sec-fetch-site':'cross-site'}])assert.equal(await request(headers),403);
 count++;console.log('OK audit: actual HTTP loopback accepts local requests and rejects hostile origins/hosts');
}finally{await new Promise(resolve=>webServer.close(resolve));}
console.log(`\n${count} behavioral audit checks passed (JSON fallback + real loopback HTTP; no live provider calls).`);
})().then(()=>{Module._load=originalLoad;global.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});process.exit(0);}).catch(e=>{Module._load=originalLoad;global.fetch=originalFetch;console.error(e.stack);try{fs.rmSync(dir,{recursive:true,force:true});}catch{}process.exit(1);});
