'use strict';
// ALM 2.2 — independent personal score and viewing chronology selectors.
// Data source: the local ALM library. Never infer watch dates from airing dates.
(function(root,factory){
 const model=factory();
 if(typeof module==='object'&&module.exports)module.exports=model;
 if(root)root.ALM_V220_PERSONAL_INSIGHTS=model;
})(typeof window!=='undefined'?window:null,()=>{
 const safeId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0;};
 const score=value=>{
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=10?n:null;
 };
 function scoreLanes(records,{maxPerLane=24}={}){
  const max=Math.max(1,Math.min(60,Math.floor(Number(maxPerLane)||24)));
  const all=Array.isArray(records)?records:[];
  const lanes=Array.from({length:10},(_,index)=>({score:10-index,items:[],count:0}));
  const none={score:null,items:[],count:0};
  const groups=new Map(lanes.map(row=>[row.score,row]));
  const seen=new Set();
  for(const record of all){
   const id=safeId(record?.id);if(!id||seen.has(id))continue;seen.add(id);
   const lane=groups.get(score(record.score))||none;
   lane.count++;
   if(lane.items.length<max)lane.items.push({id,title:String(record.title||'').slice(0,300),anime:record});
  }
  return {lanes:[...lanes,none],total:seen.size,rated:lanes.reduce((sum,row)=>sum+row.count,0),unrated:none.count};
 }
 return Object.freeze({score,scoreLanes});
});
