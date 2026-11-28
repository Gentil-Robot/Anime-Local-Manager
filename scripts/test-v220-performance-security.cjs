'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const M=require('../public/v220-watch-model'),store=require('../lib/media-associations'),{createPreviewCoverGate}=require('../lib/media-cover-preview'),{createCoverCache,safeSource}=require('../lib/cover-cache');
const {validIpcSender,localAuthority}=require('../lib/local-security');
const records=Array.from({length:1000},(_,i)=>({id:i+1,status:'Watching',episodesSeen:1+i%20,episodesTotal:50,title:'Anime '+i,watchEvents:Array.from({length:100},(_,j)=>({date:new Date(1700000000000+j*86400000+i*60000).toISOString()}))}));
let calls=0;const parse=Date.parse;Date.parse=(...args)=>{calls++;return parse(...args);};let rows,ms;
try{const start=performance.now();rows=M.resumeRows(records);ms=performance.now()-start;}finally{Date.parse=parse;}
assert.equal(rows.length,1000);assert(calls<=100000,'Watch dates parsed once per record, not per comparison');
let time=100;const gate=createPreviewCoverGate({limit:2,ttlMs:50,now:()=>time});
assert(!gate.permits(1));gate.remember([{malId:1},{malId:2},{malId:-1}]);assert(gate.permits(1));gate.remember([{malId:3}]);assert(!gate.permits(1)&&gate.permits(3));time+=51;assert(!gate.permits(3));assert(!gate.permits('https://example.com'));
const mainFrame={url:'http://127.0.0.1:3123/'},contents={mainFrame},win={webContents:contents};
assert(validIpcSender({sender:contents,senderFrame:mainFrame},win,'http://127.0.0.1:3123'));
assert(!validIpcSender({sender:contents,senderFrame:{url:mainFrame.url}},win,'http://127.0.0.1:3123'),'Subframe IPC rejected');
assert(!validIpcSender({sender:{},senderFrame:mainFrame},win,'http://127.0.0.1:3123'));
assert(!localAuthority('external.invalid:3123',3123));assert(!localAuthority('127.0.0.1:4444',3123));
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-perf-'));try{
 const file=path.join(dir,'links.json'),root=path.join(dir,'video');fs.mkdirSync(root);
 for(let i=1;i<=12;i++){const filename='Episode '+i+'.mkv';fs.writeFileSync(path.join(root,filename),'fixture');store.record(file,{root,relativePath:filename,filename,malId:50,episodeGuess:i});}
 let reads=0;const old=fs.readFileSync;fs.readFileSync=function(name,...args){if(name===file)reads++;return old.call(this,name,...args);};
 try{const result=await store.availability(file,Array.from({length:12},(_,i)=>({malId:50,episode:i+1})));assert(result.every(r=>r.available));assert.equal(reads,1,'One snapshot for the full availability batch');}finally{fs.readFileSync=old;}
 let downloads=0;
 const cache=createCoverCache({directory:path.join(dir,'covers'),fetchImage:async(url,opts)=>{assert.equal(opts.requireHttps,true);assert(opts.allowedHosts.has('cdn.myanimelist.net'));downloads++;return {bytes:Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(1021,0x4f)])};}});
 const url='https://cdn.myanimelist.net/images/anime/1/fixture.jpg';
 assert.equal(await cache.get(url,{offline:true}),'');assert.equal(downloads,0);
 const covers=await Promise.all(Array.from({length:8},()=>cache.get(url)));
 assert(covers[0]);assert.equal(new Set(covers).size,1);assert.equal(downloads,1);
 assert.equal(await cache.get(url,{offline:true}),covers[0]);assert.equal(downloads,1);
 assert.equal(safeSource('https://cdn.myanimelist.net@evil.invalid/test.jpg'),'');
 assert.equal(await cache.get('http://127.0.0.1:3123/a.jpg'),'');assert.equal(downloads,1);
 console.log('ALM_PERFORMANCE_FIXTURE '+JSON.stringify({watching:rows.length,dateParses:calls,sortMs:Math.round(ms),availabilityFileReads:reads,coverDownloads:downloads,coverGate:'bounded+expiring'}));
}finally{fs.rmSync(dir,{force:true,recursive:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
