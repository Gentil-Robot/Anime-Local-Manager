'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
// Cache only images belonging to saved articles. No arbitrary URL proxy or SVG execution.
function createNewsMedia({directory,lookup,validate,fetchImpl=require("./public-fetch").publicFetch,timeoutMs=25000}){
 const pending=new Map(),failed=new Map();let active=0;const queue=[];
 const slot=()=>active<4?(active++,Promise.resolve()):new Promise(resolve=>queue.push(resolve));
 const release=()=>{const next=queue.shift();if(next)next();else active--;};
 const types=b=>b[0]===255&&b[1]===216?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.subarray(0,3).toString()==='GIF'?'image/gif':b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'image/webp':b.subarray(4,8).toString()==='ftyp'&&/avif|avis/.test(b.subarray(8,32).toString())?'image/avif':'';
 async function read(file){try{const bytes=await fs.readFile(file),type=types(bytes);return type?{bytes,type}:null;}catch{return null;}}
 async function fetchImage(url,articleUrl){
  const controller=new AbortController();let timer;const deadline=new Promise((_,reject)=>timer=setTimeout(()=>{controller.abort();reject(Error('Image timeout'));},timeoutMs));
  const work=(async()=>{let current=url;for(let redirects=0;redirects<=4;redirects++){
   await validate(current);if(controller.signal.aborted)throw Error('Image timeout');
   const response=await fetchImpl(current,{redirect:'manual',signal:controller.signal,headers:{'User-Agent':'AnimeLocalManager/'+require('../release-version.json').technicalVersion,'Accept':'image/avif,image/webp,image/png,image/jpeg,image/gif','Referer':new URL(articleUrl).origin+'/'}});
   if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){await response.body?.cancel?.();current=new URL(response.headers.get('location'),current).href;continue;}
   if(!response.ok){await response.body?.cancel?.();throw Error('Image HTTP '+response.status);}
   if(Number(response.headers.get('content-length')||0)>6*1024*1024){await response.body?.cancel?.();throw Error('Image too large');}
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>6*1024*1024){controller.abort();throw Error('Image too large');}chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks),type=types(bytes);if(!type)throw Error('Not a supported image');return {bytes,type};
  }throw Error('Too many image redirects');})();try{return await Promise.race([work,deadline]);}finally{clearTimeout(timer);controller.abort();}
 }
 async function trim(){const names=(await fs.readdir(directory)).filter(n=>n.endsWith('.img'));const entries=await Promise.all(names.map(async n=>({file:path.join(directory,n),...(await fs.stat(path.join(directory,n)))})));let size=entries.reduce((n,s)=>n+s.size,0);for(const f of entries.sort((a,b)=>a.mtimeMs-b.mtimeMs)){if(size<=60*1024*1024)break;try{await fs.unlink(f.file);size-=f.size;}catch{}}}
 async function get(key){const item=await lookup(key);if(!item||!/^https?:\/\//i.test(item.imageUrl||''))throw Error('Unknown article image');const hash=crypto.createHash('sha256').update(item.imageUrl).digest('hex'),file=path.join(directory,hash+'.img'),cached=await read(file);if(cached)return cached;if(pending.has(hash))return pending.get(hash);if((failed.get(hash)||0)>Date.now())throw Error('Image temporarily unavailable');if(pending.size>=64)throw Error('Image queue full');
  const task=(async()=>{await slot();try{const image=await fetchImage(item.imageUrl,item.articleUrl);await fs.mkdir(directory,{recursive:true});const temporary=file+'.tmp';await fs.writeFile(temporary,image.bytes);await fs.rename(temporary,file);await trim().catch(()=>{});failed.delete(hash);return image;}catch(error){if(failed.size>500)failed.clear();failed.set(hash,Date.now()+60000);throw error;}finally{release();}})().finally(()=>pending.delete(hash));pending.set(hash,task);return task;
 }
 return {get};
}
module.exports={createNewsMedia};
