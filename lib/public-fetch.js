'use strict';
const dns=require('node:dns').promises,net=require('node:net'),http=require('node:http'),https=require('node:https'),zlib=require('node:zlib');
const {publicIp}=require('./public-network');
// The validated addresses are the ONLY addresses passed to the socket lookup.
// Return a standard Response so boundedTextFetch and its callers retain their API.
function createPublicFetch({lookup=(...args)=>dns.lookup(...args),request=(url,options,callback)=>(url.protocol==='https:'?https:http).request(url,options,callback)}={}){
 return async function publicFetch(raw,options={}){
  const url=new URL(raw),host=url.hostname.replace(/^\[|\]$/g,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port)||/^(?:localhost)$|\.(?:localhost|local|internal)$/i.test(host))throw Error('ALM_NETWORK_URL');
  const maxBytes=options.maxBytes||8*1024*1024;
  const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);
  if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(Error('ALM_NETWORK_TIMEOUT')),options.timeoutMs||25000);
  try{
   const addresses=await Promise.race([
    net.isIP(host)?Promise.resolve([{address:host,family:net.isIP(host)}]):lookup(host,{all:true,verbatim:true}),
    new Promise((_,reject)=>{if(controller.signal.aborted)reject(Error('ALM_NETWORK_CANCELLED'));else controller.signal.addEventListener('abort',()=>reject(Error('ALM_NETWORK_CANCELLED')),{once:true});})
   ]);
   if(!addresses.length||addresses.some(item=>!publicIp(item.address)))throw Error('ALM_NETWORK_PRIVATE_ADDRESS');
   if(controller.signal.aborted)throw Error('ALM_NETWORK_CANCELLED');
   const address=addresses[0];
   return await new Promise((resolve,reject)=>{
    // Keep Brotli outside this public-source path until the packaged runtime
    // has a verified fix for CVE-2026-111497; byte limits cannot guard that flaw.
    const headers=new Headers(options.headers);headers.set('accept-encoding','gzip, deflate');
    const req=request(url,{method:options.method||'GET',headers:Object.fromEntries(headers),signal:controller.signal,agent:false,
     lookup:(_host,opts,cb)=>cb(null,opts.all?[address]:address.address,opts.all?undefined:address.family)
    },response=>{
     const status=response.statusCode||502,rawHeaders=new Headers();
     for(const [key,value]of Object.entries(response.headers))if(value!==undefined)rawHeaders.set(key,Array.isArray(value)?value.join(', '):String(value));
     if(Number(rawHeaders.get('content-length'))>maxBytes){response.destroy();return reject(Error('Source response too large'));}
     if([301,302,303,307,308].includes(status)){response.destroy();return resolve(new Response(null,{status,headers:rawHeaders}));}
     const encoding=String(rawHeaders.get('content-encoding')||'').toLowerCase();
     let stream=response;
     if(encoding==='gzip')stream=response.pipe(zlib.createGunzip());else if(encoding==='deflate')stream=response.pipe(zlib.createInflate());else if(encoding&&encoding!=='identity'){response.destroy();return reject(Error('ALM_NETWORK_ENCODING'));}
     const chunks=[];let size=0,compressed=0;
     response.on('data',chunk=>{compressed+=chunk.length;if(compressed>maxBytes)response.destroy(Error('Source response too large'));});
     response.on('error',error=>{if(stream!==response)stream.destroy(error);reject(error);});
     stream.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){stream.destroy(Error('Source response too large'));response.destroy();return;}chunks.push(chunk);});
     stream.on('error',reject);stream.on('end',()=>{
      rawHeaders.delete('content-encoding');rawHeaders.delete('content-length');
      resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers:rawHeaders}));
     });
    });
    req.on('error',reject);if(options.body!=null)req.write(options.body);req.end();
   });
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 };
}
module.exports={createPublicFetch,publicFetch:createPublicFetch()};
