'use strict';
/* Bound the WHOLE request (DNS validation, redirects and body), not just headers.
   validate(url) is supplied by the existing public-address/SSRF guard. */
async function boundedTextFetch(url, options = {}) {
 const {timeoutMs=10000,maxBytes=8*1024*1024,maxRedirects=4,validate=async()=>{},fetchImpl=global.fetch,signal:externalSignal,...init}=options;
 const controller=new AbortController();let timer;
 let externalReject;
 const cancelled=new Promise((_,reject)=>{externalReject=reject;});
 const abort=()=>{controller.abort();externalReject(new Error('Source request cancelled'));};
 if(externalSignal?.aborted)abort();else externalSignal?.addEventListener?.('abort',abort,{once:true});
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Source response timed out'));},Math.max(1,timeoutMs));});
 const work=(async()=>{
  let current=String(url);
  for(let i=0;i<=maxRedirects;i++){
   require('./rescue-mode').assertNetworkAllowed(current);
   await validate(current);if(controller.signal.aborted)throw new Error('Source response timed out');
   const response=await fetchImpl(current,{...init,signal:controller.signal,redirect:'manual'});
   if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){
    await response.body?.cancel?.();current=new URL(response.headers.get('location'),current).toString();continue;
   }
   if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body?.cancel?.();throw new Error('Source response too large');}
   let text;
   if(response.body?.getReader){
    const reader=response.body.getReader(),decoder=new TextDecoder();let total=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error('Source response too large');}chunks.push(decoder.decode(value,{stream:true}));}
    chunks.push(decoder.decode());text=chunks.join('');
   }else{text=await response.text();if(Buffer.byteLength(text,'utf8')>maxBytes)throw new Error('Source response too large');}
   return {response,text,finalUrl:current};
  }
  throw new Error('Too many source redirects');
 })();
 try{return await Promise.race([work,deadline,cancelled]);}finally{clearTimeout(timer);externalSignal?.removeEventListener?.('abort',abort);controller.abort();}
}
function singleFlight(fn,max=64){
 const pending=new Map();
 return function(key,...args){
  if(pending.has(key))return pending.get(key);
  if(pending.size>=max)return Promise.reject(new Error('Too many source requests'));
  const request=Promise.resolve().then(()=>fn(key,...args)).finally(()=>pending.delete(key));pending.set(key,request);return request;
 };
}
module.exports={boundedTextFetch,singleFlight};
