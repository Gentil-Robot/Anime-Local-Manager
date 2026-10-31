'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createCoverCache,safeSource}=require('../lib/cover-cache');
const fixture=async test=>{const root=await fsp.mkdtemp(path.join(os.tmpdir(),'alm-cover-test-'));try{return await test(root);}finally{await fsp.rm(root,{recursive:true,force:true});}};
async function main(){
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const library=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const imageError=fs.readFileSync(path.join(__dirname,'../public/beta45.js'),'utf8');
 assert(server.includes("app.get('/api/cover-cache/:malId'"),'Cache must be mounted on the local server');
 assert(server.includes('ownedCoverSource(id)'),'Cache must be restricted to the owner library');
 assert(library.includes("'/api/cover-cache/'"),'Visible library cards must request cached images');
 assert(!library.includes('data-cover-remote-fallback') && !imageError.includes('image.dataset.coverRemoteFallback'),'Cache-managed covers must NEVER bypass the queue via a direct CDN fallback');
 assert(library.includes('data-alm-managed-cover'),'Managed library covers must be marked for recovery');
 assert(imageError.includes("window.addEventListener('online'"),'Visible library covers must be retried after the connection recovers');
 for(const value of ['http://127.0.0.1/x.jpg','https://localhost/x.jpg','https://cdn.myanimelist.net:444/a.jpg','https://evil.example/cover.jpg','file:///etc/passwd','https://cdn.myanimelist.net@evil.example/a.jpg','https://s4.anilist.co.evil.example/hi.jpg'])assert.equal(safeSource(value),'','Unsafe image address must never be downloaded: '+value);
 assert.equal(safeSource('https://cdn.myanimelist.net/images/anime/12/345.jpg'),'https://cdn.myanimelist.net/images/anime/12/345.jpg');
 assert.equal(safeSource('https://s4.anilist.co/file/test.webp'),'https://s4.anilist.co/file/test.webp');
 const samples=Array.from({length:9},(_,i)=>`https://cdn.myanimelist.net/images/anime/${i+1}/cover.jpg`);
 await fixture(async directory=>{
  let calls=0,active=0,maxActive=0;
  const bytes=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(1021,0x4f)]);
  const cache=createCoverCache({directory,maxConcurrent:2,maxQueued:12,maxBytes:10000,fetchImage:async(_url,options)=>{assert.equal(options.requireHttps,true);assert.equal(options.maxBytes,8*1024*1024);calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,4));active--;return {bytes};}});
  const first=await Promise.all(Array.from({length:8},()=>cache.get(samples[0])));
  assert.equal(calls,1,'Concurrent requests must share one download');assert.equal(new Set(first).size,1);assert.equal((await fsp.readFile(first[0])).compare(bytes),0);
  assert.equal(await cache.get(samples[0],{offline:true}),first[0]);
  assert.equal(await cache.get('https://evil.example/test'),'', 'Unsupported hosts must be rejected');
  const next=await Promise.all(samples.slice(1,7).map(s=>cache.get(s)));
  assert.equal(next.length,6);assert(maxActive<=2,'Concurrent provider requests must be bounded');
  const leftovers=(await fsp.readdir(directory)).filter(x=>x.startsWith('alm-cover-'));
  assert(leftovers.length<=9,'Cache must not grow beyond size quota');
  let total=0;for(const file of leftovers)total+=(await fsp.stat(path.join(directory,file))).size;
  assert(total<=10000,'Cache must evict oldest files when full');
  const stale=await cache.get(samples[0],{offline:true}); // may be evicted
  if(stale)assert((await fsp.readFile(stale)).equals(bytes));
 });
 await fixture(async directory=>{
  let count=0;
  const cache=createCoverCache({directory,fetchImage:async()=>{count++;throw Error('network off');}});
  assert.equal(await cache.get(samples[0]),'');
  assert.equal(await cache.get(samples[0]),'');
  assert.equal(count,1,'Negative failures must be temporarily throttled');
  assert.equal((await fsp.readdir(directory)).length,0,'Failed downloads must not leave files behind');
 });
 await fixture(async directory=>{
  const cache=createCoverCache({directory,fetchImage:async()=>{throw Error('Network should not run offline');}});
  assert.equal(await cache.get(samples[0],{offline:true}),'');
  assert.equal((await fsp.readdir(directory)).length,0,'Offline should not write files');
 });
 console.log('OK beta82 cover cache: safe hosts, lazy storage, no duplicate requests, concurrency bound, size eviction, offline/failure behaviour.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
