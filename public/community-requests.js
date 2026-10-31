/* Coalesce reads for rapid navigation. Never persist account data or cache writes. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.ALM_COMMUNITY_REQUESTS=value;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function create(request,{now=Date.now,ttl=10000,timeout=20000}={}){
  const reads=new Map();let generation=0;
  const clear=()=>{generation++;reads.clear();};
  async function timed(endpoint,method,body){let timer;try{return await Promise.race([request(endpoint,method,body),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('ALM_NETWORK')),timeout);})]);}finally{clearTimeout(timer);}}
  function api(endpoint,method='GET',body){
   if(method!=='GET'){clear();return timed(endpoint,method,body).finally(clear);}
   const entry=reads.get(endpoint);if(entry&&(entry.pending||entry.expires>now()))return entry.promise;
   const version=generation,next={pending:true,expires:0};
   next.promise=timed(endpoint,method,body).then(value=>{if(version!==generation)throw Error('SESSION_EXPIRED');next.pending=false;next.expires=now()+(endpoint.startsWith('profiles/')?0:ttl);return value;}).catch(error=>{if(reads.get(endpoint)===next)reads.delete(endpoint);throw error;});
   reads.set(endpoint,next);return next.promise;
  }
  api.clear=clear;return api;
 }
 return {create};
});
