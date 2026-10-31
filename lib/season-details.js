'use strict';
// Exact identities only. Unknown future dates/episodes are legitimate missing data.
function createSeasonDetails({fetchBatch,fetchOne,hydrate=x=>x,complete=()=>false,now=Date.now}){
 const cache=new Map(),pending=new Map();let batchCooldown=0,singleCooldown=0;
 const idOf=x=>Number(x?.malId||String(x?.url||'').match(/\/anime\/(\d+)/)?.[1]||0);
 const recent=x=>Number(x?.detailsCheckedAt)>0&&now()-Number(x.detailsCheckedAt)<(x.detailsUnavailable?120000:21600000);
 async function prime(items,cancelled=()=>false){
  const ids=[...new Set(items.filter(x=>!recent(x)&&!complete(x)).map(idOf).filter(id=>Number.isSafeInteger(id)&&id>0))];
  for(let n=0;n<ids.length;n+=20){if(cancelled()||batchCooldown>now())break;const group=ids.slice(n,n+20).filter(id=>!cache.has(id)||now()-cache.get(id).at>=21600000);if(!group.length)continue;
   try{const rows=await fetchBatch(group);for(const row of rows||[]){const id=idOf(row);if(group.includes(id))cache.set(id,{at:now(),row});}}
   catch{batchCooldown=now()+60000;}
  }
 }
 async function resolve(input){
  const local=hydrate(input);if(complete(local)||recent(local))return local;const id=idOf(local);
  if(!id||!Number.isSafeInteger(id))return {...local,detailsCheckedAt:now(),detailsUnavailable:true};
  let entry=cache.get(id),unavailable=false,row=entry&&now()-entry.at<21600000?entry.row:null;
  if(!row){
   if(singleCooldown>now())unavailable=true;
   else{if(!pending.has(id))pending.set(id,(async()=>{try{const found=await fetchOne(id);if(idOf(found)!==id)throw Error('Identity mismatch');cache.set(id,{at:now(),row:found});return found;}catch{singleCooldown=now()+60000;return null;}finally{pending.delete(id);}})());row=await pending.get(id);unavailable=!row;}
  }
  const out={...local,detailsCheckedAt:now(),detailsUnavailable:unavailable};
  for(const key of ['imageUrl','synopsis','type','episodesTotal','startDate','endDate','publicScore','rank'])if(!out[key]&&row?.[key])out[key]=row[key];
  if(!out.genres?.length&&row?.genres?.length)out.genres=row.genres;
  if(!out.studios?.length&&row?.studios?.length)out.studios=row.studios;
  return out;
 }
 return {prime,resolve,recent};
}
module.exports={createSeasonDetails};
