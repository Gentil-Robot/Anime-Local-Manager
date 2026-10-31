'use strict';
const {boundedTextFetch}=require('./bounded-text-fetch');
const {aniListFetch}=require('./anilist-fetch');

// Public sample queries only. No library titles, credentials or private errors in reports.
function createServiceHealth({rssSources=[],getBetaSeriesKey=()=>'',getMalClientId=()=>'',jikanRetired=true,fetchText=boundedTextFetch,now=Date.now,timeoutMs=7000,cacheMs=60000,validate=async()=>{}}={}) {
 const definitions=[
  {id:'jikan',name:'Jikan / MyAnimeList',group:'metadata',retired:jikanRetired,url:'https://api.jikan.moe/v4/anime/1',valid:d=>Number(d.data?.mal_id)===1},
  {id:'mal',name:'MyAnimeList API',group:'metadata',url:'https://api.myanimelist.net/v2/anime/1?fields=id,title',key:true,mal:true,valid:d=>Number(d.id)===1},
  {id:'anilist',name:'AniList',group:'metadata',url:'https://graphql.anilist.co',method:'POST',body:JSON.stringify({query:'query { Media(idMal: 1, type: ANIME) { id idMal } }'}),valid:d=>!d.errors?.length&&Number(d.data?.Media?.idMal)===1},
  {id:'kitsu',name:'Kitsu',group:'metadata',url:'https://kitsu.app/api/edge/anime?filter[text]=Naruto&page[limit]=1',headers:{Accept:'application/vnd.api+json'},valid:d=>Array.isArray(d.data)&&d.data.some(a=>a.type==='anime')},
  {id:'tvmaze',name:'TVMaze',group:'metadata',url:'https://api.tvmaze.com/search/shows?q=Naruto',valid:d=>Array.isArray(d)&&d.some(a=>a.show?.id)},
  {id:'betaseries',name:'BetaSeries',group:'metadata',url:'https://api.betaseries.com/search/shows?text=naruto',key:true,valid:d=>!d.errors?.length&&Array.isArray(d.shows)},
  {id:'wikidata',name:'Wikidata',group:'metadata',url:'https://www.wikidata.org/wiki/Special:EntityData/Q155653.json',valid:d=>require('./localized-titles').exactEntity(d.entities?.Q155653||{},199)},
  {id:'mymemory',name:'MyMemory',group:'translation',url:'https://api.mymemory.translated.net/get?q=Hello&langpair=en%7Cfr',valid:d=>Number(d.responseStatus)===200&&!!d.responseData?.translatedText},
  ...rssSources.map((s,i)=>({id:'rss-'+i,name:s.name,lang:s.lang,group:'news',url:s.url,feed:true}))
 ];
 const cache=new Map(),pending=new Map(),waiting=[];let active=0;
 function acquire(){if(active<3){active++;return Promise.resolve();}return new Promise(resolve=>waiting.push(resolve));}
 function release(){if(waiting.length)waiting.shift()();else active--;}
 const publicDefinition=d=>({id:d.id,name:d.name,group:d.group,...(d.lang?{lang:d.lang}:{}),optional:!!d.key,retired:!!d.retired});
 const keyFor=d=>d.key?String((d.mal?getMalClientId():getBetaSeriesKey())||'').trim():'';
 function cached(d,key){const item=cache.get(d.id);return item&&item.key===key&&now()-item.time<Math.max(cacheMs,item.result.state==='limited'?(item.result.retryAfterSeconds||60)*1000:0)?item.result:null;}
 function list(){return definitions.filter(d=>!d.retired).map(d=>({...publicDefinition(d),configured:!d.key||!!keyFor(d),last:cached(d,keyFor(d))||null}));}
 async function run(d,key){
  await acquire();const started=now();
  let state='unavailable',httpStatus=null,retryAfterSeconds=null;
  try{
   const headers={'User-Agent':'AnimeLocalManager/'+require('../package.json').version+' diagnostic','Accept':d.feed?'application/rss+xml, application/atom+xml, application/xml, text/xml':'application/json'};
   Object.assign(headers,d.headers||{});
   if(d.key)headers[d.mal?'X-MAL-CLIENT-ID':'X-BetaSeries-Key']=key;
   if(d.body)headers['Content-Type']='application/json';
   const result=await fetchText(d.url,{timeoutMs:d.feed?25000:timeoutMs,maxBytes:d.feed?5*1024*1024:512*1024,maxRedirects:d.key?0:3,validate,method:d.method||'GET',headers,...(d.body?{body:d.body}:{}),
    ...(d.id==='anilist'?{fetchImpl:aniListFetch}:{}),
    // A diagnostic never forwards a BetaSeries key through a redirect.
   });
   httpStatus=result.response.status;
   if(httpStatus===429){state='limited';const raw=result.response.headers?.get?.('retry-after');if(raw&&/^\d+$/.test(raw))retryAfterSeconds=Math.min(86400,Number(raw));}
   else if(httpStatus===401||httpStatus===403)state='denied';
   else if(httpStatus>=300&&httpStatus<400)state='redirect';
   else if(result.response.ok){
    if(d.feed)state=/<(?:rss|feed|rdf:RDF)\b/i.test(result.text)&&!/<html\b/i.test(result.text)?'available':'invalid';
    else{try{const data=JSON.parse(result.text);state=d.id==='mymemory'&&(data.quotaFinished||Number(data.responseStatus)===429)?'limited':d.valid(data)?'available':'invalid';}catch{state='invalid';}}
   }
  }catch(error){if(error?.code==='ALM_ANILIST_RATE_LIMIT'){state='limited';httpStatus=error.status;retryAfterSeconds=Math.ceil(error.retryAfterMs/1000);}else state=/timed? ?out|timeout|abort/i.test(String(error?.message))?'timeout':/redirect/i.test(String(error?.message))?'redirect':'network';}
  finally{release();}
  const result={...publicDefinition(d),state,httpStatus,latencyMs:Math.max(0,now()-started),checkedAt:new Date(now()).toISOString(),retryAfterSeconds};
  cache.set(d.id,{key,time:now(),result});return result;
 }
 function test(id,{force=false}={}){
  const d=definitions.find(x=>x.id===id);if(!d)return Promise.reject(Object.assign(new Error('Unknown service'),{status:404}));
  if(d.retired)return Promise.resolve({...publicDefinition(d),state:"retired",httpStatus:null,latencyMs:0,checkedAt:new Date(now()).toISOString()});
  const key=keyFor(d);
  if(d.key&&!key)return Promise.resolve({...publicDefinition(d),state:'unconfigured',httpStatus:null,latencyMs:null,checkedAt:new Date(now()).toISOString()});
  const known=cached(d,key),age=now()-(cache.get(d.id)?.time||0);
  // An explicit retest bypasses stale errors, but still respects a short cooldown and 429.
  const cooldown=known?.state==='limited'?Math.max(5000,(known.retryAfterSeconds||60)*1000):5000;
  if(known&&(!force||age<cooldown))return Promise.resolve({...known,cached:true});
  // Coalesce per service; a newly saved key gets a fresh check after the in-flight one.
  const existing=pending.get(id);if(existing)return existing.key===key?existing.promise:existing.promise.then(()=>test(id,{force}));
  const promise=run(d,key).finally(()=>pending.delete(id));pending.set(id,{key,promise});return promise;
 }
 return {list,test};
}
function mountServiceHealth(app,options){
 const service=createServiceHealth(options);
 app.get('/api/services',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({services:service.list(),cacheSeconds:60});});
 app.post('/api/services/:id/test',async(req,res)=>{res.setHeader('Cache-Control','no-store');try{res.json(await service.test(req.params.id,{force:req.body?.force===true}));}catch(error){res.status(error.status||500).json({error:'Service unavailable'});}});
 return service;
}
module.exports={createServiceHealth,mountServiceHealth};
