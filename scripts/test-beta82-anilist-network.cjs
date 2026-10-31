'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createAniListFetch,retryDelay}=require('../lib/anilist-fetch');
const {boundedTextFetch}=require('../lib/bounded-text-fetch');
const ENDPOINT='https://graphql.anilist.co',BASE=Date.parse('2026-10-25T08:00:00Z');
const json=(data,options)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'},...options});
const limited=e=>e.code==='ALM_ANILIST_RATE_LIMIT'&&e.retryable===false;
let passed=0;
async function check(label,fn){await fn();passed++;console.log('OK '+label);}
function recommender(transport){
 const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const gql=source.slice(source.indexOf('async function fetchAniListGraphQL('),source.indexOf('async function collectAniListAutonomousRows('));
 const reco=source.slice(source.indexOf('async function fetchAniListReco('),source.indexOf('const ANILIST_CREATOR_QUERY'));
 const sleeps=[];
 const context={boundedTextFetch,aniListFetch:transport,sleep:async ms=>sleeps.push(ms)};
 const run=vm.runInNewContext(gql+'\n'+reco+'\nfetchAniListReco;',context);
 return {run,sleeps};
}
(async()=>{
 await check('normal response and caller payload are preserved',async()=>{
  const payload={data:{Media:{id:1,title:{romaji:'Fixture'}}}};let seen;
  const fetch=createAniListFetch({fetchImpl:async(url,init)=>{seen={url,init};return json(payload,{headers:{'Content-Type':'application/json','X-RateLimit-Remaining':'20'}});}});
  const response=await fetch(ENDPOINT,{method:'POST',body:'{"query":"fixture"}',headers:{'Content-Type':'application/json'}});
  assert(response instanceof Response);assert.equal(response.status,200);assert.deepEqual(await response.json(),payload);
  assert.equal(response.headers.get('x-ratelimit-remaining'),'20');assert.equal(seen.url,ENDPOINT);
  assert.equal(seen.init.body,'{"query":"fixture"}');assert.equal(seen.init.redirect,'manual');
 });
 await check('only the exact AniList endpoint is accepted',async()=>{
  let calls=0;const fetch=createAniListFetch({fetchImpl:async()=>{calls++;return json({});}});
  for(const url of ['https://evil.example','https://graphql.anilist.co.evil.example','http://graphql.anilist.co','https://user@graphql.anilist.co','https://graphql.anilist.co/other'])await assert.rejects(fetch(url),/ALM_ANILIST_ORIGIN/);
  assert.equal(calls,0);
 });
 await check('429 cancels its body and blocks a burst until expiry',async()=>{
  let now=BASE,calls=0,cancelled=0;
  const fetch=createAniListFetch({now:()=>now,fetchImpl:async()=>{calls++;return calls===1?new Response(new ReadableStream({cancel(){cancelled++;}}),{status:429,headers:{'Retry-After':'30'}}):json({data:{ok:true}});}});
  await assert.rejects(fetch(ENDPOINT),e=>limited(e)&&e.retryAfterMs===30000);
  assert.equal(cancelled,1);
  await Promise.all(Array.from({length:20},()=>assert.rejects(fetch(ENDPOINT),limited)));
  assert.equal(calls,1);now+=30001;assert.equal((await fetch(ENDPOINT)).status,200);assert.equal(calls,2);
 });
 await check('Retry-After dates and the later rate-limit reset are respected',async()=>{
  assert.equal(retryDelay(new Headers({'Retry-After':'10','X-RateLimit-Reset':String((BASE+45000)/1000)}),BASE),45000);
  assert.equal(retryDelay(new Headers({'Retry-After':new Date(BASE+20000).toUTCString()}),BASE),20000);
  assert.equal(retryDelay(new Headers({'Retry-After':'invalid'}),BASE),60000);
  assert.equal(retryDelay(new Headers({'Retry-After':'99999999999'}),BASE),86400000);
 });
 await check('GraphQL status429 uses the same provider pause',async()=>{
  let calls=0;const fetch=createAniListFetch({now:()=>BASE,fetchImpl:async()=>{calls++;return json({errors:[{status:429,message:'Too Many Requests'}]},{headers:{'Retry-After':'12'}});}});
  await assert.rejects(fetch(ENDPOINT),e=>limited(e)&&e.retryAfterMs===12000);
  await assert.rejects(fetch(ENDPOINT),limited);assert.equal(calls,1);
 });
 await check('a successful final allowance is delivered before the pause',async()=>{
  let calls=0,now=BASE;const fetch=createAniListFetch({now:()=>now,fetchImpl:async()=>{calls++;return json({data:{id:1}},{headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':String((BASE+10000)/1000)}});}});
  assert.deepEqual(await(await fetch(ENDPOINT)).json(),{data:{id:1}});
  await assert.rejects(fetch(ENDPOINT),limited);assert.equal(calls,1);now+=10001;await fetch(ENDPOINT);assert.equal(calls,2);
 });
 await check('a late parallel success cannot clear a newer provider pause',async()=>{
  let release,calls=0;const held=new Promise(resolve=>{release=resolve;});
  const fetch=createAniListFetch({now:()=>BASE,fetchImpl:async()=>{calls++;if(calls===1){await held;return json({data:{old:true}});}return new Response(null,{status:429,headers:{'Retry-After':'30'}});}});
  const earlier=fetch(ENDPOINT);await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(fetch(ENDPOINT),limited);release();assert.equal((await earlier).status,200);
  await assert.rejects(fetch.withFetch(async()=>{calls++;return json({});})(ENDPOINT),limited);assert.equal(calls,2);
 });
 await check('503 with provider Retry-After also stops immediate retries',async()=>{
  const fetch=createAniListFetch({now:()=>BASE,fetchImpl:async()=>new Response(null,{status:503,headers:{'Retry-After':'9'}})});
  await assert.rejects(fetch(ENDPOINT),e=>limited(e)&&e.status===503&&e.retryAfterMs===9000);
 });
 await check('the deadline aborts a stalled transport',async()=>{
  let signal;const fetch=createAniListFetch({fetchImpl:async(_url,init)=>{signal=init.signal;return new Promise(()=>{});}});
  await assert.rejects(fetch(ENDPOINT,{timeoutMs:20}),/timed out/);assert.equal(signal.aborted,true);
 });
 await check('caller cancellation aborts an unfinished response body',async()=>{
  let signal,ready;const started=new Promise(resolve=>{ready=resolve;});
  const fetch=createAniListFetch({fetchImpl:async(_url,init)=>{signal=init.signal;ready();return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(Error('aborted')),{once:true});}}));}});
  const abort=new AbortController(),request=fetch(ENDPOINT,{signal:abort.signal});await started;abort.abort();
  await assert.rejects(request,/cancelled|abort/);assert.equal(signal.aborted,true);
  await assert.rejects(fetch(ENDPOINT,{signal:abort.signal}),/cancelled/);
 });
 await check('oversized response bodies are cancelled',async()=>{
  let cancelled=false;const fetch=createAniListFetch({fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('0123456789'));},cancel(){cancelled=true;}}))});
  await assert.rejects(fetch(ENDPOINT,{maxBytes:4}),/too large/);assert.equal(cancelled,true);
 });
 await check('recommendations keep normal successes and transient retry behavior',async()=>{
  let calls=0;const {run,sleeps}=recommender(createAniListFetch({fetchImpl:async()=>++calls===1?new Response('{}',{status:500}):json({data:{Media:{id:1}}})}));
  assert.equal((await run('fixture',{})).data.Media.id,1);assert.equal(calls,2);assert.deepEqual(sleeps,[700]);
 });
 await check('recommendations do not retry429 or permanent access errors',async()=>{
  for(const status of [429,400,401,403]){
   let calls=0;const {run,sleeps}=recommender(createAniListFetch({fetchImpl:async()=>{calls++;return new Response('{}',{status,headers:{'Retry-After':'30'}});}}));
   await assert.rejects(run('fixture',{}));assert.equal(calls,1,'status '+status);assert.deepEqual(sleeps,[]);
  }
 });
 await check('service diagnostics report and reuse the shared provider pause',async()=>{
  const live=global.fetch;let calls=0;
  try{
   global.fetch=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'45'}});};
   const health=require('../lib/service-health').createServiceHealth();
   const state=await health.test('anilist');assert.equal(state.state,'limited');assert.equal(state.httpStatus,429);assert(state.retryAfterSeconds>0&&state.retryAfterSeconds<=45);
   assert.equal((await health.test('anilist',{force:true})).state,'limited');assert.equal(calls,1);
  }finally{global.fetch=live;}
 });
 console.log(JSON.stringify({suite:'beta82-anilist-network',passed,network:'mocked only'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
