'use strict';
// Bounded, short-lived authorization for catalogue artwork returned by local search.
// A client cannot supply a URL. Only recent catalogue IDs may trigger downloads.
function createPreviewCoverGate({limit=2048,ttlMs=20*60*1000,now=Date.now}={}){
 const entries=new Map();
 const valid=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&Number(id)<=100000000;
 function remember(rows){
  for(const row of rows||[]){if(!valid(row?.malId))continue;const id=Number(row.malId);entries.delete(id);entries.set(id,now()+ttlMs);}
  while(entries.size>limit)entries.delete(entries.keys().next().value);
 }
 function permits(id){if(!valid(id))return false;const key=Number(id),until=entries.get(key)||0;if(until<=now()){entries.delete(key);return false;}return true;}
 return Object.freeze({remember,permits});
}
module.exports={createPreviewCoverGate};
