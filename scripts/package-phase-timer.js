'use strict';
// Small profiler for expensive, real packaging tests. No secret paths or data.
function phaseTimer(test,print=console.log,clock=()=>process.hrtime.bigint()) {
 const start=clock();let last=start;
 const phases=[];
 return {
  mark(name) {
   const now=clock(),durationMs=Number(now-last)/1e6;
   phases.push({name,durationMs:Math.round(durationMs*1000)/1000});last=now;
   print('[package-profile] '+JSON.stringify({test,phase:name,durationMs:phases.at(-1).durationMs}));
  },
  result(){return {test,totalMs:Math.round(Number(clock()-start)/1e6*1000)/1000,phases:[...phases]};}
 };
}
module.exports={phaseTimer};
