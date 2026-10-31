'use strict';
// Disposable, bounded cache for covers from the owner's library only.
// Never accepts an HTTP-supplied URL, stores private data or downloads the catalogue.
const fsp=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {fetchBinary,imageExtension}=require('./public-network');
const allowedHosts=new Set(['cdn.myanimelist.net','s4.anilist.co','static.tvmaze.com','media.kitsu.io']);
const extensions=['jpg','png','webp','gif','avif'];
const maxAgeMs=30*24*60*60*1000;
const persistentCodes=/ALM_COVER_INVALID|ALM_IMAGE_(?:FORMAT|SIZE|PRIVATE_ADDRESS|URL|HOST|RESPONSE|REDIRECTS)/;
function safeSource(raw){
 try {const url=new URL(raw);url.hash='';return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowedHosts.has(url.hostname)&&url.pathname.length<1024&&url.href.length<=2048?url.href:'';}catch{return '';}
}
function failureKind(error){
 const code=String(error?.code||error?.message||'');
 if(code==='ALM_IMAGE_HTTP'){
  const status=Number(error.statusCode);
  if(status===429)return 'rate-limit';
  if(status===408||status===425||status>=500&&status<=599)return 'server';
  return 'permanent';
 }
 return persistentCodes.test(code)?'permanent':'network';
}
function createCoverCache({directory,fetchImage=fetchBinary,extension=imageExtension,maxBytes=512*1024*1024,maxConcurrent=3,maxQueued=96,now=Date.now,random=Math.random}={}){
 if(!directory)throw Error('ALM_COVER_CACHE_DIRECTORY');
 let active=0,lastReconnect=-Infinity;
 const queued=[],flights=new Map(),failures=new Map(),providerUntil=new Map();
 const base=url=>'alm-cover-'+crypto.createHash('sha256').update(url).digest('hex').slice(0,40);
 const fileFor=(name,ext)=>path.join(directory,name+'.'+ext);
 const hostFor=url=>new URL(url).hostname;
 function postpone(key,kind,error,url){
  const previous=failures.get(key),count=previous?.kind===kind?Math.min(10,previous.count+1):1;
  const baseline=kind==='permanent'?30*60*1000:Math.min(15*60*1000,90*1000*Math.pow(2,count-1));
  // The first transient failure remains at 90 s; later failures use jitter.
  const jitter=count===1||kind==='permanent'?1:Math.min(1.15,0.85+Math.max(0,Math.min(1,Number(random())||0))*0.3);
  const delay=Math.max(0,Math.round(baseline*jitter));
  const providerDelay=Number.isFinite(error?.retryAfterMs)?Math.max(0,error.retryAfterMs):0;
  const until=now()+Math.max(delay,providerDelay);
  failures.delete(key);failures.set(key,{until,kind,count});
  if(failures.size>1024)failures.delete(failures.keys().next().value);
  const host=hostFor(url);
  // A 429 is a provider-wide throttle even without Retry-After. A 503 with
  // Retry-After also pauses the provider, not merely the individual image.
  if(kind==='rate-limit'||kind==='server'&&providerDelay>0){
   providerUntil.set(host,Math.max(providerUntil.get(host)||0,until));
  }
 }
 async function existing(name){
  for(const ext of extensions){const file=fileFor(name,ext);try{const stat=await fsp.lstat(file);if(stat.isFile()&&stat.size>=800&&stat.size<=8*1024*1024)return {file,stat};}catch(error){if(error.code!=='ENOENT')throw error;}}
  return null;
 }
 function blocked(url,key){return (failures.get(key)?.until||0)>now()||(providerUntil.get(hostFor(url))||0)>now();}
 function execute(){
  while(active<maxConcurrent&&queued.length){const job=queued.shift();active++;
   Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{active--;execute();});
  }
 }
 function enqueue(key,work){
  if(flights.has(key))return flights.get(key);
  if(queued.length>=maxQueued)return Promise.reject(Error('ALM_COVER_QUEUE_FULL'));
  const promise=new Promise((resolve,reject)=>{queued.push({work,resolve,reject});execute();}).finally(()=>flights.delete(key));
  flights.set(key,promise);return promise;
 }
 async function evict(preserve){
  let entries;try{entries=await fsp.readdir(directory,{withFileTypes:true});}catch{return;}
  const items=[];let total=0;
  for(const entry of entries){if(!entry.isFile()||!/^alm-cover-[a-f0-9]{40}\.(?:jpg|png|webp|gif|avif)$/.test(entry.name))continue;
   try{const file=path.join(directory,entry.name),stat=await fsp.lstat(file);if(stat.isFile()){total+=stat.size;items.push({file,bytes:stat.size,when:stat.mtimeMs});}}catch{}
  }
  if(total<=maxBytes)return;
  items.sort((a,b)=>a.when-b.when);
  for(const item of items){if(total<=maxBytes)break;if(item.file===preserve)continue;try{await fsp.unlink(item.file);total-=item.bytes;}catch{}}
 }
 async function save(url,key){
  let temp;
  try{
   // Recheck after waiting in the queue: another image might have received 429.
   if(blocked(url,key))return '';
   const {bytes}=await fetchImage(url,{requireHttps:true,maxBytes:8*1024*1024,timeoutMs:12000,allowedHosts});
   if(!Buffer.isBuffer(bytes)||bytes.length<800)throw Error('ALM_COVER_INVALID_IMAGE');
   const ext=extension(bytes);if(!extensions.includes(ext))throw Error('ALM_COVER_INVALID_EXTENSION');
   const target=fileFor(key,ext);
   await fsp.mkdir(directory,{recursive:true});
   temp=target+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
   const handle=await fsp.open(temp,'wx',0o600);
   try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
   await fsp.rename(temp,target);temp=null;
   await evict(target);failures.delete(key);return target;
  }catch(error){postpone(key,failureKind(error),error,url);throw error;}
  finally{if(temp)await fsp.unlink(temp).catch(()=>{});}
 }
 async function get(source,{offline=false}={}){
  const url=safeSource(source);if(!url)return '';
  const key=base(url),cached=await existing(key);
  if(cached){
   // Preserve cached images even during provider throttling and while offline.
   if(!offline&&now()-cached.stat.birthtimeMs>maxAgeMs&&!flights.has(key)&&!blocked(url,key))enqueue(key,()=>save(url,key)).catch(()=>{});
   if(now()-cached.stat.mtimeMs>60*60*1000)fsp.utimes(cached.file,new Date(),new Date()).catch(()=>{});
   return cached.file;
  }
  if(offline||blocked(url,key))return '';
  try{return await enqueue(key,()=>save(url,key));}catch{return '';}
 }
 // Only a browser 'online' transition may request a limited reopening of
 // network failures. It must NEVER clear 429/503 Retry-After or permanent errors.
 function reconnect(){
  if(now()-lastReconnect<60*1000)return false;
  lastReconnect=now();
  for(const [key,entry] of failures)if(entry.kind==='network')failures.delete(key);
  return true;
 }
 return {get,safeSource,evict,reconnect,info:()=>({active,queued:queued.length,pending:flights.size,maxBytes,maxConcurrent,blockedProviders:[...providerUntil.values()].filter(until=>until>now()).length})};
}
module.exports={safeSource,createCoverCache,failureKind};
