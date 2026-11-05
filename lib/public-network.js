'use strict';
const dns=require('node:dns').promises,net=require('node:net'),http=require('node:http'),https=require('node:https');
function publicIp(value){
 if(net.isIP(value)===4){const a=value.split('.').map(Number);return !(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||a[0]===169&&a[1]===254||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===192&&(a[1]===168||a[1]===0&&(a[2]===0||a[2]===2)||a[1]===88&&a[2]===99)||a[0]===198&&(a[1]===18||a[1]===19||a[1]===51&&a[2]===100)||a[0]===203&&a[1]===0&&a[2]===113||a[0]===100&&a[1]>=64&&a[1]<=127);}
 if(net.isIP(value)===6){const [first,second]=value.toLowerCase().split(':').map(v=>parseInt(v||'0',16));return first>=0x2000&&first<=0x3fff&&!(first===0x2001&&(second<0x200||second===0xdb8))&&first!==0x2002&&!(first===0x3fff&&second<=0xfff);}
 return false;
}
// HTTP Retry-After can be a delta in whole seconds or an HTTP date.
// No timers are scheduled here; the cache owns per-source/provider cooldowns.
function retryAfterDelay(value,receivedAt=Date.now()){
 if(Array.isArray(value))value=value[0];
 if(typeof value!=='string'&&typeof value!=='number')return null;
 const input=String(value).trim();if(!input)return null;
 if(/^\d+$/.test(input)){
  const seconds=Number(input);
  return Number.isFinite(seconds)?Math.min(seconds*1000,30*24*60*60*1000):null;
 }
 // Avoid JavaScript Date.parse accepting invalid numeric tokens as dates.
 const standard=/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/i.test(input);
 const rfc850=/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT$/i.test(input);
 const asctime=/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Za-z]{3} {1,2}\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/i.test(input);
 if(!standard&&!rfc850&&!asctime)return null;
 const date=Date.parse(input);
 return Number.isFinite(date)?Math.min(30*24*60*60*1000,Math.max(0,date-receivedAt)):null;
}
async function fetchBinary(raw,{headers={},timeoutMs=12000,maxBytes=8*1024*1024,redirects=4,requireHttps=false,allowedHosts=null}={}){
 const end=Date.now()+timeoutMs;
 for(let hop=0;hop<=redirects;hop++){
  require('./rescue-mode').assertNetworkAllowed(raw);
  const url=new URL(raw),host=url.hostname.replace(/^\[|\]$/g,'');if(!['http:','https:'].includes(url.protocol)||requireHttps&&url.protocol!=='https:'||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('ALM_IMAGE_URL');
  // Check EVERY redirect hop, not just the first URL. Other fetchBinary callers
  // retain the existing behavior when allowedHosts is omitted.
  if(allowedHosts&&!allowedHosts.has(url.hostname))throw Error('ALM_IMAGE_HOST');
  let timer;const remain=end-Date.now();if(remain<=0)throw Error('ALM_IMAGE_TIMEOUT');
  const addresses=await Promise.race([net.isIP(host)?Promise.resolve([{address:host,family:net.isIP(host)}]):dns.lookup(host,{all:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ALM_IMAGE_TIMEOUT')),remain);})]).finally(()=>clearTimeout(timer));
  if(!addresses.length||addresses.some(a=>!publicIp(a.address)))throw Error('ALM_IMAGE_PRIVATE_ADDRESS');const address=addresses[0];
  const result=await new Promise((resolve,reject)=>{
   const request=(url.protocol==='https:'?https:http).get(url,{headers,agent:false,lookup:(_host,options,cb)=>cb(null,options.all?[address]:address.address,options.all?undefined:address.family)},response=>{
    if([301,302,303,307,308].includes(response.statusCode)){response.resume();return resolve({redirect:response.headers.location});}
    if(response.statusCode!==200){
     const status=Number(response.statusCode)||0;
     const error=Error('ALM_IMAGE_HTTP_'+status);
     error.code='ALM_IMAGE_HTTP';error.statusCode=status;
     if(status===429||status===503)error.retryAfterMs=retryAfterDelay(response.headers['retry-after']);
     response.destroy();return reject(error);
    }
    if(Number(response.headers['content-length'])>maxBytes){response.destroy();return reject(Error('ALM_IMAGE_SIZE'));}
    const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){response.destroy(Error('ALM_IMAGE_SIZE'));return;}chunks.push(chunk);});response.on('end',()=>resolve({bytes:Buffer.concat(chunks),type:response.headers['content-type']||'',headers:response.headers}));response.on('error',reject);
   });const timer=setTimeout(()=>request.destroy(Error('ALM_IMAGE_TIMEOUT')),Math.max(1,end-Date.now()));request.on('error',reject);request.on('close',()=>clearTimeout(timer));
  });
  if(!result.redirect)return result;raw=new URL(result.redirect,url).toString();
 }
 throw Error('ALM_IMAGE_REDIRECTS');
}
function imageExtension(bytes){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';if(/^GIF8[79]a$/.test(bytes.toString('ascii',0,6)))return 'gif';if(bytes.toString('ascii',4,8)==='ftyp'&&/avif|avis/.test(bytes.toString('ascii',8,32)))return 'avif';throw Error('ALM_IMAGE_FORMAT');}
module.exports={publicIp,fetchBinary,imageExtension,retryAfterDelay};
