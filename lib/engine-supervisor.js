'use strict';
// The desktop parent owns this supervisor. No renderer or failed HTTP server
// is needed to report an engine failure or authorize its replacement.
function createEngineSupervisor({initial,create,reconnect,onFailure,now=Date.now,timers=globalThis,
 intervalMs=15000,pingTimeoutMs=5000,missesBeforeNotify=3,restartWindowMs=60000,maxRestarts=2}={}) {
 let engine=initial,unsubscribe=null,disposed=false,suspended=false,phase='online',misses=0,
  checking=false,restarting=null,notifying=null,lastCheck=now(),attempts=[];
 const snapshot=()=>({phase,misses,canRestart:!disposed&&attempts.filter(at=>now()-at<restartWindowMs).length<maxRestarts,
  diagnostics:engine?.diagnostics?.()||null});
 function notify(reason,error) {
  if(disposed||suspended||notifying)return;
  const information={reason,error:String(error?.message||error||''),...snapshot()};
  notifying=Promise.resolve().then(()=>onFailure(information,{restart,resume,snapshot,terminate:()=>engine?.terminate?.()})).catch(()=>{
   // A failed native dialog must not become another unhandled rejection.
  }).finally(()=>{notifying=null;});
 }
 function watch(next) {
  unsubscribe?.();engine=next;
  unsubscribe=next?.onExit?.(result=>{
   if(disposed||suspended||engine!==next||phase==='restarting')return;
   phase='stopped';if(!result.expected)notify('exit',result.error);
  });
 }
 async function check() {
  if(disposed||suspended||checking||phase!=='online'||!engine?.ping)return;
  const at=now(),gap=at-lastCheck;lastCheck=at;
  // Sleep/resume and a suspended parent event loop are not engine failures.
  if(gap>intervalMs*3+pingTimeoutMs){misses=0;return;}
  const candidate=engine;checking=true;
  try {await candidate.ping(pingTimeoutMs);if(engine===candidate)misses=0;}
  catch(error){
   if(disposed||suspended||engine!==candidate||phase!=='online')return;
   if(++misses>=missesBeforeNotify){phase='unresponsive';notify('unresponsive',error);}
  }finally{checking=false;}
 }
 function resume(){if(!disposed){suspended=false;phase=engine?.hasExited?.()?'stopped':'online';misses=0;lastCheck=now();}}
 function restart() {
  if(restarting)return restarting;
  if(disposed)return Promise.reject(Error('ALM_ENGINE_SUPERVISOR_CLOSED'));
  attempts=attempts.filter(at=>now()-at<restartWindowMs);
  if(attempts.length>=maxRestarts)return Promise.reject(Error('ALM_ENGINE_RESTART_LIMIT'));
  attempts.push(now());phase='restarting';
  const previous=engine;
  restarting=(async()=>{
   // Never start a second database writer while the old utility process is
   // still alive, or while its already-started key-store writes are pending.
   await previous?.terminate?.();
   if(previous?.hasExited&&!previous.hasExited())throw Error('ALM_ENGINE_STILL_RUNNING');
   await previous?.settleCallbacks?.();
   if(disposed)throw Error('ALM_ENGINE_SUPERVISOR_CLOSED');
   const candidate=await create();
   // Quit can arrive while process creation is pending. Do not reconnect a
   // replacement engine after disposal, even if creating it already succeeded.
   if(disposed){await candidate.terminate?.();throw Error('ALM_ENGINE_SUPERVISOR_CLOSED');}
   watch(candidate);
   try {
    const value=await reconnect(candidate);
    if(disposed){await candidate.terminate?.();throw Error('ALM_ENGINE_SUPERVISOR_CLOSED');}
    phase='online';misses=0;lastCheck=now();return value;
   }catch(error){await candidate.terminate?.();throw error;}
  })().catch(error=>{phase=engine?.hasExited?.()?'stopped':'unresponsive';throw error;}).finally(()=>{restarting=null;});
  return restarting;
 }
 watch(initial);
 const timer=timers.setInterval(()=>{check().catch(()=>{});},intervalMs);timer.unref?.();
 return {check,restart,resume,snapshot,
  suspend(){suspended=true;},
  dispose(){disposed=true;suspended=true;timers.clearInterval(timer);unsubscribe?.();unsubscribe=null;}
 };
}
module.exports={createEngineSupervisor};
