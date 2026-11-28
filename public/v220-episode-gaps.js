'use strict';
// ALM 2.2: holes in the list of episodes linked by the user, not claims
// about missing video files, provider availability or unseen broadcasts.
(function(root,factory){
 const model=factory();
 if(typeof module==='object'&&module.exports)module.exports=model;
 if(root)root.ALM_V220_EPISODE_GAPS=model;
})(typeof window!=='undefined'?window:null,()=>{
 function find(animes,summaries,{maxRows=25,maxEpisode=300,maxMissing=12}={}){
  if(!Array.isArray(animes)||!Array.isArray(summaries))return [];
  const byId=new Map(animes.map(row=>[Number(row?.malId),row]).filter(([id])=>Number.isSafeInteger(id)&&id>0));
  const rows=[];
  for(const entry of summaries){
   const anime=byId.get(Number(entry?.malId));
   if(!anime||!['Watching','Completed','Plan to Watch'].includes(anime.status))continue;
   const numbers=[...new Set((Array.isArray(entry.episodes)?entry.episodes:[]).map(Number)
    .filter(ep=>Number.isSafeInteger(ep)&&ep>=1&&ep<=maxEpisode))].sort((a,b)=>a-b);
   if(numbers.length<2)continue;
   const low=numbers[0],high=numbers.at(-1);
   if(high-low>maxEpisode)continue;
   const seenSet=new Set(numbers),missing=[];
   for(let ep=low+1;ep<high&&missing.length<=maxMissing;ep++){
    if(!seenSet.has(ep))missing.push(ep);
   }
   if(!missing.length)continue;
   const truncated=missing.length>maxMissing;
   rows.push({malId:Number(entry.malId),title:String(anime.title||'').slice(0,260),
    linked:numbers.length,from:low,to:high,missing:missing.slice(0,maxMissing),truncated});
   if(rows.length>=maxRows)break;
  }
  return rows;
 }
 return Object.freeze({find});
});
