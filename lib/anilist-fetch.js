'use strict';
const {boundedTextFetch}=require('./bounded-text-fetch');

const ENDPOINT='https://graphql.anilist.co';
const MAX_PAUSE_MS=24*60*60*1000;

function retryDelay(headers,now){
 const value=String(headers?.get?.('retry-after')||'').trim();
 const seconds=/^\d+$/.test(value)?Number(value)*1000:0;
 const date=value&&!/^\d+$/.test(value)?Date.parse(value)-now:0;
 const reset=Number(headers?.get?.('x-ratelimit-reset'))*1000-now;
 const delays=[seconds,date,reset].filter(v=>Number.isFinite(v)&&v>0);
 return Math.min(MAX_PAUSE_MS,delays.length?Math.max(...delays):60000);
}

// One pause per process, shared by searches, schedules, recommendations and
// service diagnostics. It does not add retries or a new provider quota.
function createAniListFetch({fetchImpl=(...args)=>global.fetch(...args),now=Date.now,fetchText=boundedTextFetch}={}){
 let pauseUntil=0,pauseStatus=429;
 const wrappers=new WeakMap(),owned=new WeakSet();
 function paused(){
  const error=Error('ALM_ANILIST_RATE_LIMIT');
  return Object.assign(error,{code:'ALM_ANILIST_RATE_LIMIT',status:pauseStatus,retryable:false,retryAfterMs:Math.max(0,pauseUntil-now())});
 }
 function pause(headers,status=429){
  const until=now()+retryDelay(headers,now());
  if(until>pauseUntil){pauseUntil=until;pauseStatus=status;}
 }
 async function run(input,options={},transport=fetchImpl){
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.href!==ENDPOINT+'/')throw Error('ALM_ANILIST_ORIGIN');
  if(options.signal?.aborted)throw Error('Source request cancelled');
  if(pauseUntil>now())throw paused();
  const result=await fetchText(ENDPOINT,{
   timeoutMs:12000,maxBytes:8*1024*1024,...options,maxRedirects:0,
   fetchImpl:async(address,init)=>{
    // Another in-flight response may have established a pause while validation
    // was pending. Never start a new request in that interval.
    if(pauseUntil>now())throw paused();
    const response=await transport(address,init);
    if(response.status===429||(response.status===503&&response.headers?.get?.('retry-after'))){
     pause(response.headers,response.status);
     await Promise.resolve(response.body?.cancel?.()).catch(()=>{});
     throw paused();
    }
    if(response.headers?.get?.('x-ratelimit-remaining')==='0')pause(response.headers);
    return response;
   }
  });
  // Some GraphQL failures use HTTP 200. Treat their provider status identically.
  if(result.text.includes('"errors"')){
   let body;try{body=JSON.parse(result.text);}catch{}
   if(body?.errors?.some?.(e=>Number(e?.status)===429)){
    pause(result.response.headers);
    throw paused();
   }
  }
  const headers=new Headers(result.response.headers);
  // The original stream has already been decoded and bounded in full.
  headers.delete('content-encoding');headers.delete('content-length');
  const response=new Response([204,205,304].includes(result.response.status)?null:result.text,{status:result.response.status,statusText:result.response.statusText,headers});
  Object.defineProperty(response,'url',{value:result.finalUrl||ENDPOINT});
  return response;
 }
 const fetch=(input,options)=>run(input,options);owned.add(fetch);
 fetch.withFetch=transport=>{
  if(!transport||owned.has(transport))return transport||fetch;
  if(!wrappers.has(transport)){const wrapper=(input,options)=>run(input,options,transport);wrappers.set(transport,wrapper);owned.add(wrapper);}
  return wrappers.get(transport);
 };
 return fetch;
}

const aniListFetch=createAniListFetch();
module.exports={createAniListFetch,aniListFetch,withAniListFetch:aniListFetch.withFetch,retryDelay};
