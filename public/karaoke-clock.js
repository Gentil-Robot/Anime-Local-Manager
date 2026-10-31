/* Shared pure timeline, independent of language and of the video decoder. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ALM_KARAOKE_CLOCK=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const clamp=(n)=>Math.max(0,Math.min(1,Number(n)||0));
 function unitProgress(unit,time){
  const points=unit.progressCurve;
  if(!Array.isArray(points)||points.length<2)return clamp((time-unit.start)/Math.max(.001,unit.end-unit.start));
  if(time<=points[0].time)return clamp(points[0].position);
  for(let i=1;i<points.length;i++){
   const before=points[i-1],after=points[i];
   if(time<after.time)return clamp(before.position+(after.position-before.position)*clamp((time-before.time)/Math.max(.001,after.time-before.time)));
  }
  return clamp(points[points.length-1].position);
 }
 function unitState(units,time){
  let pastCount=0;
  for(let i=0;i<(units||[]).length;i++){
   const u=units[i];if(time>=u.end){pastCount=i+1;continue;}
   if(time<u.start)return {index:-1,progress:0,pastCount};
   return {index:i,progress:unitProgress(u,time),pastCount};
  }
  return {index:-1,progress:0,pastCount};
 }
 function state(lines,time){
  const index=(lines||[]).findIndex(l=>time>=l.start&&time<l.end);
  if(index<0)return {index:-1,singing:false,progress:0,unit:{index:-1,progress:0,pastCount:0}};
  const line=lines[index],units=line.syncGroups||line.romajiUnits||line.jaUnits||[];
  return {index,singing:true,progress:clamp((time-line.start)/Math.max(.001,line.end-line.start)),unit:unitState(units,time)};
 }
 function phraseState(units,progress){
  const weights=(units||[]).map(u=>Math.max(1,Array.from(String(u.text||'')).length));
  const target=clamp(progress)*weights.reduce((s,n)=>s+n,0);let offset=0;
  for(let i=0;i<weights.length;i++){if(target<offset+weights[i])return {index:i,progress:clamp((target-offset)/weights[i]),pastCount:i};offset+=weights[i];}
  return {index:weights.length-1,progress:1,pastCount:weights.length};
 }
 return Object.freeze({unitState,state,phraseState,unitProgress,clamp});
});
