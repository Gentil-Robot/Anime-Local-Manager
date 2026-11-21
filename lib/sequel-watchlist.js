'use strict';
// ALM 2.2.0: propose missing follow-ups only from verified local season links.
// Never download remote data or automatically mutate the user's collection.
const ALLOWED_STATUSES=new Set(['Completed','Watching','Plan to Watch']);
function normalizeId(value){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0;}
function missingSequels(library,resolveVerifiedNext,{maxCandidates=50,includePlanned=false}={}){
 if(!Array.isArray(library)||typeof resolveVerifiedNext!=='function')throw Error('ALM_SEQUELS_INPUT');
 const owned=new Set(library.map(r=>normalizeId(r?.malId)).filter(Boolean));
 const seen=new Set();const found=[];
 const limit=Math.max(1,Math.min(100,Math.floor(Number(maxCandidates)||50)));
 for(const record of library){
  if(!record||!ALLOWED_STATUSES.has(String(record.status)))continue;
  if(!includePlanned&&record.status==='Plan to Watch')continue;
  const previous=normalizeId(record.malId);
  if(!previous)continue;
  // The existing local season resolver establishes title/season identity.
  const next=resolveVerifiedNext(record);
  const target=next?.row||null;const id=normalizeId(target?.malId);
  if(!id||id===previous||owned.has(id)||seen.has(id))continue;
  if(!['canonical-title','official-relation'].includes(next?.proof?.source))continue;
  seen.add(id);
  found.push({malId:id,title:String(target.title||target.titleEn||'').slice(0,300),sourceMalId:previous,
   sourceTitle:String(record.title||'').slice(0,300),startDate:String(target.startDate||'').slice(0,10),
   proofSource:next.proof.source,kind:next.proof.split?'part':'season'});
  if(found.length>=limit)break;
 }
 return found;
}
module.exports={missingSequels,normalizeId};
