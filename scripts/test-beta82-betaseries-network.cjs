'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boundedTextFetch}=require('../lib/bounded-text-fetch');

const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const MAX_BYTES=2*1024*1024,KEY='fixture-key-no-real-secret';
const plain=value=>value===undefined?value:JSON.parse(JSON.stringify(value));
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
const searchSource=section('async function searchBetaSeriesShow(','async function searchImageFallbackAll(');
const routeSource=section('app.post("/api/betaseries/test"','app.get("/api/betaseries/status"');

function harness(kind,transport,{timeoutMs,key=KEY}={}){
 const calls=[],bounds=[];let route,result,status=200,config={retained:'fixture'};
 const context={
  PRODUCT_RELEASE:require('../release-version.json'),
  getBetaSeriesApiKey:()=>key,
  searchJikan:async()=>null,withTimeout:promise=>promise,
  // A future return to raw fetch must still hit this fake transport, never the network.
  fetch:async(address,init)=>{calls.push({url:address,init});return transport(address,init);},
  readConfig:()=>({...config}),writeConfig:value=>{config=plain(value);},
  app:{post:(_url,handler)=>{route=handler;}},
  boundedTextFetch:(url,options)=>{
   bounds.push({timeoutMs:options.timeoutMs,maxBytes:options.maxBytes,maxRedirects:options.maxRedirects});
   return boundedTextFetch(url,{...options,...(timeoutMs?{timeoutMs}:{}),fetchImpl:async(address,init)=>{
    calls.push({url:address,init});return transport(address,init);
   }});
  }
 };
 const search=vm.runInNewContext(kind==='search'?searchSource+'\nsearchBetaSeriesShow;':routeSource,context);
 return {
  calls,bounds,
  config:()=>plain(config),
  async run(){
   if(kind==='search')result=await search('Fixture anime');
   else await route({body:{}},{status(code){status=code;return this;},json(value){result=value;}});
   return {result:plain(result),status};
  }
 };
}
function assertBounded(h){
 assert.equal(h.bounds.length,1);
 assert.deepEqual(h.bounds[0],{timeoutMs:10000,maxBytes:MAX_BYTES,maxRedirects:0});
 assert.equal(h.calls.length,1);
 const {url,init}=h.calls[0];
 assert.equal(new URL(url).origin,'https://api.betaseries.com');
 assert.equal(init.redirect,'manual');assert(init.signal instanceof AbortSignal);
 assert.equal(init.headers['X-BetaSeries-Key'],KEY);
}
function assertFailure(kind,out,pattern){
 if(kind==='search')assert.equal(out.result,null);
 else{assert.equal(out.status,500);assert.equal(out.result.ok,false);assert.match(out.result.error,pattern);assert(!JSON.stringify(out.result).includes(KEY));}
}
let passed=0;
async function check(label,fn){await fn();passed++;console.log('OK Beta82 BetaSeries: '+label);}

(async()=>{
 for(const kind of ['search','key-test']){
  await check(kind+' keeps the normal result and configuration behavior',async()=>{
   const shows=[{id:42,title:'Fixture anime',original_title:'Fixture anime',images:{poster:'https://example.org/fixture.jpg'},description:'Fixture synopsis',genres:['Animation']}];
   const h=harness(kind,async()=>new Response(JSON.stringify({shows}),{headers:{'Content-Type':'application/json'}}));
   const out=await h.run();assertBounded(h);
   if(kind==='search'){
    assert.deepEqual(out.result,{title:'Fixture anime',officialTitle:'Fixture anime',imageUrl:'https://example.org/fixture.jpg',synopsis:'Fixture synopsis',type:'TV',genres:['Animation'],matchingScore:72,source:'BetaSeries',betaseriesId:42});
    assert.deepEqual(h.config(),{retained:'fixture'});
   }else{
    assert.equal(out.status,200);assert.equal(out.result.ok,true);assert.equal(out.result.status,200);assert.equal(out.result.count,1);assert(Number.isFinite(Date.parse(out.result.testedAt)));
    assert.equal(h.config().betaseriesApiKey,KEY);assert.equal(h.config().retained,'fixture');assert.deepEqual(h.config().betaseriesLastTest,out.result);
   }
  });
  await check(kind+' preserves non-success HTTP results without parsing invalid JSON',async()=>{
   const h=harness(kind,async()=>new Response('not JSON',{status:503}));
   const out=await h.run();assertBounded(h);
   if(kind==='search')assert.equal(out.result,null);
   else{assert.equal(out.status,200);assert.equal(out.result.ok,false);assert.equal(out.result.status,503);assert.equal(out.result.count,0);}
  });
  await check(kind+' skips networking when no key is configured',async()=>{
   const h=harness(kind,async()=>{throw Error('Unexpected request');},{key:''});
   const out=await h.run();assert.equal(h.calls.length,0);assert.equal(h.bounds.length,0);
   if(kind==='search')assert.equal(out.result,null);else{assert.equal(out.status,400);assert.equal(out.result.ok,false);}
  });
  await check(kind+' refuses a redirect before any second request',async()=>{
   let cancelled=false;
   const h=harness(kind,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:302,headers:{Location:'https://different.example/collect'}}));
   const out=await h.run();assertBounded(h);assert.equal(cancelled,true);assertFailure(kind,out,/redirect/i);
  });
  await check(kind+' rejects an oversized declared body before reading it',async()=>{
   let cancelled=false;
   const h=harness(kind,async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Length':String(MAX_BYTES+1)}}));
   const out=await h.run();assertBounded(h);assert.equal(cancelled,true);assertFailure(kind,out,/too large/);
  });
  await check(kind+' bounds a streamed body without Content-Length',async()=>{
   let cancelled=false;
   const h=harness(kind,async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_BYTES+1));},cancel(){cancelled=true;}})));
   const out=await h.run();assertBounded(h);assert.equal(cancelled,true);assertFailure(kind,out,/too large/);
  });
  await check(kind+' aborts a transport that never sends headers',async()=>{
   let signal;
   const h=harness(kind,async(_url,init)=>{signal=init.signal;return new Promise(()=>{});},{timeoutMs:25});
   const out=await h.run();assertBounded(h);assert.equal(signal.aborted,true);assertFailure(kind,out,/timed out/);
  });
  await check(kind+' keeps the deadline while reading an unfinished body',async()=>{
   let signal;
   const h=harness(kind,async(_url,init)=>{signal=init.signal;return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(Error('aborted')),{once:true});}}));},{timeoutMs:25});
   const out=await h.run();assertBounded(h);assert.equal(signal.aborted,true);assertFailure(kind,out,/timed out|abort/);
  });
 }
 console.log(JSON.stringify({suite:'beta82-betaseries-network',passed,network:'mocked only',productionTimeoutMs:10000,maxBytes:MAX_BYTES}));
})().catch(error=>{console.error(error);process.exitCode=1;});
