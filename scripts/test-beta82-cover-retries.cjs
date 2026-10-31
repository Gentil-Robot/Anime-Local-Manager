'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const dns=require('node:dns').promises;
const https=require('node:https');
const {createCoverCache,failureKind}=require('../lib/cover-cache');
const {fetchBinary,retryAfterDelay}=require('../lib/public-network');
const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(925,0x53)]);
const a='https://cdn.myanimelist.net/images/anime/1/a.jpg';
const b='https://cdn.myanimelist.net/images/anime/2/b.jpg';
const c='https://s4.anilist.co/file/c.jpg';
async function fixture(test){const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'alm-cover-retry-'));try{return await test(directory);}finally{await fsp.rm(directory,{recursive:true,force:true});}}
async function waitFor(predicate,description){
 const limit=Date.now()+5000;
 while(Date.now()<limit){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
 throw Error('Test setup timed out: '+description);
}
function httpFailure(status,retryAfterMs=null){const error=Error('ALM_IMAGE_HTTP_'+status);error.code='ALM_IMAGE_HTTP';error.statusCode=status;error.retryAfterMs=retryAfterMs;return error;}
async function main(){
 assert.equal(retryAfterDelay('120',1000),120000);
 assert.equal(retryAfterDelay('Sun, 25 Oct 2026 12:00:00 GMT',Date.parse('Sun, 25 Oct 2026 11:59:00 GMT')),60000);
 assert.equal(retryAfterDelay('garbage'),null);
 assert.equal(retryAfterDelay('-2'),null);
 assert.equal(failureKind(httpFailure(429)),'rate-limit');
 assert.equal(failureKind(httpFailure(503)),'server');
 assert.equal(failureKind(httpFailure(404)),'permanent');
 assert.equal(failureKind(Error('ALM_IMAGE_FORMAT')),'permanent');
 assert.equal(failureKind(Error('ALM_IMAGE_TIMEOUT')),'network');
 // Simulated HTTP 429/503/404: real fetchBinary is exercised, but no external connection.
 const originalLookup=dns.lookup,originalGet=https.get;
 let status=429,retryAfter='120',requests=0;
 try{
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  https.get=(_url,_options,handler)=>{
   requests++;
   const req=new EventEmitter();req.destroy=error=>{if(error)req.emit('error',error);req.emit('close');};
   process.nextTick(()=>{
    const res=new PassThrough();res.statusCode=status;res.headers={'retry-after':retryAfter};
    handler(res);res.end();req.emit('close');
   });
   return req;
  };
  for(const expected of [429,503,404]){
   status=expected;
   await assert.rejects(fetchBinary(a,{requireHttps:true,allowedHosts:new Set(['cdn.myanimelist.net'])}),error=>{
    assert.equal(error.code,'ALM_IMAGE_HTTP');assert.equal(error.statusCode,expected);
    if(expected===429||expected===503)assert.equal(error.retryAfterMs,120000);
    return true;
   });
  }
  assert.equal(requests,3);
 }finally{dns.lookup=originalLookup;https.get=originalGet;}
 console.log('OK: HTTP 429/503/404 remain distinct and Retry-After seconds/date parsed.');
 await fixture(async directory=>{
  let clock=1000000,calls=[];
  const cache=createCoverCache({directory,now:()=>clock,fetchImage:async url=>{
   calls.push(url);if(url===a&&calls.filter(v=>v===a).length===1)throw httpFailure(429,240000);
   return {bytes:jpeg};
  }});
  assert.equal(await cache.get(a),'');
  assert.equal(await cache.get(b),'','429 must pause the whole CDN, not only the same image');
  assert.equal(cache.info().blockedProviders,1);
  assert.equal(cache.reconnect(),true);
  assert.equal(await cache.get(b),'','Online event must not bypass provider Retry-After');
  assert.equal(await cache.get(c) && calls.length,2,'An independent CDN must continue to work');
  clock+=239000;assert.equal(await cache.get(b),'');
  clock+=2000;assert.ok(await cache.get(b),'Host must recover once Retry-After expires');
  assert.ok(await cache.get(a));
  assert.equal(calls.filter(url=>url===a).length,2);
  assert.equal(await cache.get(b,{offline:true}).then(Boolean),true);
 });
 await fixture(async directory=>{
  let clock=1000000,calls=0;
  const cache=createCoverCache({directory,now:()=>clock,random:()=>0.5,fetchImage:async()=>{
   calls++;if(calls<=2)throw Error('ALM_IMAGE_TIMEOUT');return {bytes:jpeg};
  }});
  assert.equal(await cache.get(a),'');clock+=89999;assert.equal(await cache.get(a),'');assert.equal(calls,1);
  clock+=2;assert.equal(await cache.get(a),'');assert.equal(calls,2);
  clock+=179999;assert.equal(await cache.get(a),'','Second network failure must back off to 180 seconds');
  clock+=3;assert.ok(await cache.get(a));assert.equal(calls,3);
 });
 await fixture(async directory=>{
  let clock=1000000,calls=0;
  const cache=createCoverCache({directory,now:()=>clock,fetchImage:async()=>{
   calls++;if(calls===1)throw Error('ALM_IMAGE_TIMEOUT');return {bytes:jpeg};
  }});
  assert.equal(await cache.get(a),'');
  assert.equal(cache.reconnect(),true);
  assert.ok(await cache.get(a),'Online transition must reopen network-only failure immediately');
  assert.equal(cache.reconnect(),false,'Repeated online transitions within a minute must be limited');
  assert.equal(calls,2);
 });
 await fixture(async directory=>{
  let clock=1000000,calls=0;
  const cache=createCoverCache({directory,now:()=>clock,fetchImage:async()=>{calls++;throw httpFailure(404);}});
  assert.equal(await cache.get(a),'');assert.equal(cache.reconnect(),true);
  clock+=1799999;assert.equal(await cache.get(a),'');assert.equal(calls,1,'Permanent failures do not reopen when online');
  clock+=2;assert.equal(await cache.get(a),'');assert.equal(calls,2);
 });
 await fixture(async directory=>{
  let clock=1000000,calls=[];
  const cache=createCoverCache({directory,now:()=>clock,fetchImage:async url=>{
   calls.push(url);if(url===a)throw httpFailure(503,350000);return {bytes:jpeg};
  }});
  assert.equal(await cache.get(a),'');
  assert.equal(await cache.get(b),'','503 Retry-After also gates host');
  clock+=350001;assert.ok(await cache.get(b));
  assert.equal(calls.length,2);
 });
 await fixture(async directory=>{
  const requests=[];let firstStarted=false,releaseFirst;
  // Force the 429 to arrive only AFTER both other covers are queued. Without
  // this gate, their initial asynchronous disk lookups can reorder the jobs.
  const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
  const cache=createCoverCache({directory,maxConcurrent:1,now:()=>1000000,fetchImage:async url=>{
   requests.push(url);
   if(url===a){firstStarted=true;await firstGate;throw httpFailure(429,180000);}
   return {bytes:jpeg};
  }});
  const first=cache.get(a);
  await waitFor(()=>firstStarted,'first image started');
  const second=cache.get(b),third=cache.get('https://cdn.myanimelist.net/images/anime/3/c.jpg');
  await waitFor(()=>cache.info().queued===2,'two other images queued');
  releaseFirst();
  const files=await Promise.all([first,second,third]);
  assert.deepEqual(files,['','','']);
  assert.deepEqual(requests,[a],'Already queued covers should be stopped before a second request after 429');
 });
 console.log('OK: provider-wide 429/503, independent CDN, progressive cooldown, online reset, offline content and permanent errors.');
 // A small DOM simulation checks that online recovery never opens a direct CDN URL.
 const handlers={},winHandlers={},managed={tagName:'IMG',dataset:{almManagedCover:'1',coverRetryPending:'1'},isConnected:true,hidden:true,src:'/api/cover-cache/123',getAttribute(){return this.src;},closest(){return {getBoundingClientRect:()=>({width:130,height:170,top:10,bottom:180})};},parentElement:{classList:{add(){},remove(){}}}};
 let request,scheduled=[];
 const languageCodes=['fr','en','ja','es','de','pt-BR','zh-CN'];
 const context={
  window:{ALM_DESIGN_COPY:Object.fromEntries(languageCodes.map(code=>[code,{}])),ALM_DESIGN:{edition:()=>'',t:()=>'',storage:{get:()=>''},icon:()=>'',applyText:()=>{}},addEventListener:(name,fn)=>{winHandlers[name]=fn;},location:{origin:'http://127.0.0.1:3123'},innerHeight:900},
  document:{readyState:'loading',visibilityState:'visible',addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:sel=>sel.includes('cover-retry-pending')?[managed]:[],querySelector:()=>null,getElementById:()=>null},
  fetch:async (url,options)=>{if(url==='/api/storage/status')return {ok:false};request={url,options};return {ok:true};},
  setTimeout:(fn,delay)=>{scheduled.push({fn,delay});return 1;},URL,Date
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/beta45.js'),'utf8'),context);
 handlers.DOMContentLoaded();
 await winHandlers.online();
 assert.equal(request.url,'/api/cover-cache/reconnect');
 assert.equal(request.options.headers['X-ALM-Cover-Reconnect'],'1');
 assert.equal(scheduled.length,1);
 scheduled[0].fn();
 assert.match(managed.src,/^\/api\/cover-cache\/123\?resume=\d+$/);
 assert(!String(managed.src).includes('myanimelist.net'));
 console.log('OK: browser online recovery is visible-only, staged and strictly same-origin.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
