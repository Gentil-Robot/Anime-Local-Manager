'use strict';
const path=require('node:path');

function createServerProcess(utilityProcess,{forceKill=pid=>process.kill(pid,'SIGKILL'),drainMs=250}={}) {
 const child=utilityProcess.fork(path.join(__dirname,'server-host.js'),[],{serviceName:'ALM local engine',env:process.env,stdio:'pipe'});
 const outputStreams=[child.stdout,child.stderr].filter(Boolean);
 const pending=new Map(),exitListeners=new Set(),callbacks=new Set();
 let serial=0,notifier=null,updateNotifier=null,secrets=null,maintenanceUpdate=null,stopped=false,expectedStop=false;
 let stderr='',stdout='',exitCode=null,fatal='',exitResult=null,resolveExit;
 const redactionSecrets=new Set();
 const exited=new Promise(resolve=>resolveExit=resolve);
 const redact=value=>{
  let text=String(value);
  for(const [key,secret] of Object.entries(process.env))if(/(?:KEY|TOKEN|PASSWORD|SECRET)/i.test(key)&&secret&&secret.length>=6)redactionSecrets.add(secret);
  for(const secret of redactionSecrets)text=text.split(secret).join('[masqué]');
  return text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[masqué]@');
 };
 redact(''); // Capture this engine's credentials before a replacement rotates them.
 child.stdout?.on('data',chunk=>{stdout=(stdout+redact(chunk.toString())).slice(-8192);});
 child.stderr?.on('data',chunk=>{stderr=(stderr+redact(chunk.toString())).slice(-16384);});
 const stoppedError=()=>Object.assign(Error('ALM_ENGINE_STOPPED'+(Number.isInteger(exitCode)?' (code '+exitCode+')':'')+': '+redact(stderr.trim()||fatal||stdout.trim()||'Aucun détail du moteur.')),{code:'ALM_ENGINE_STOPPED',exitCode});
 const emitExit=listener=>{
  try {Promise.resolve(listener(exitResult)).catch(error=>console.error('[engine supervisor]',redact(error?.message||error)));}
  catch(error){console.error('[engine supervisor]',redact(error?.message||error));}
 };
 child.on('error',(type,location)=>{fatal=redact(type instanceof Error?type.message:String(type||'')+' '+String(location||''));});
 const rpc=(method,args=[],timeoutMs=method==='maintenanceRun'||method==='stop'?30*60000:30000)=>new Promise((resolve,reject)=>{
  if(stopped)return reject(stoppedError());
  const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Object.assign(Error('ALM_ENGINE_TIMEOUT'),{code:'ALM_ENGINE_TIMEOUT'}));},timeoutMs);
  pending.set(id,{resolve,reject,timer});
  try{child.postMessage({id,method,args});}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
 });
 async function replyCallback(message) {
  let value,error;
  try {
   if(message.callback==='notify')value=await notifier?.(message.args[0]);
   else if(message.callback==='notifyUpdate')value=await updateNotifier?.(message.args[0]);
   else if(message.callback==='loadSecret')value=await secrets?.load();
   else if(message.callback==='saveSecret')value=await secrets?.save(message.args[0]);
   else if(message.callback==='maintenanceUpdate')value=await maintenanceUpdate?.(message.args[0]);
   else throw Error('ALM_ENGINE_CALLBACK');
  }catch(e){error=e?.message||String(e);}
  // Already-started writes can finish, but a late reply must never escape as
  // an unhandled rejection after the child transport closes.
  if(!stopped)try{child.postMessage({callbackResult:message.id,value,error});}catch(e){fatal=redact(e?.message||e);}
 }
 child.on('message',message=>{
  if(stopped)return;
  if(message.callback){
   const work=replyCallback(message);callbacks.add(work);
   work.then(()=>callbacks.delete(work),()=>callbacks.delete(work));return;
  }
  const item=pending.get(message.id);if(!item)return;
  pending.delete(message.id);clearTimeout(item.timer);
  if(message.error)item.reject(Error(message.error));else item.resolve(message.value);
 });
 child.once('exit',code=>{
  stopped=true;exitCode=code;resolveExit();
  for(const item of pending.values())clearTimeout(item.timer);
  // Notify the supervisor even when no RPC was pending. Drain captured pipes
  // briefly: Electron clears child.stdout/stderr before all bytes arrive.
  let finished=false,timer;const listeners=new Map();
  const finish=()=>{
   if(finished)return;finished=true;clearTimeout(timer);
   for(const [stream,done]of listeners){stream.removeListener('end',done);stream.removeListener('close',done);}
   for(const item of pending.values())item.reject(stoppedError());pending.clear();
   exitResult={code:exitCode,expected:expectedStop,error:stoppedError().message};
   for(const listener of [...exitListeners])emitExit(listener);
  };
  const open=outputStreams.filter(stream=>!stream.readableEnded&&!stream.destroyed);
  if(!open.length){setImmediate(finish);return;}
  const waiting=new Set(open);
  for(const stream of open){const done=()=>{waiting.delete(stream);if(!waiting.size)finish();};listeners.set(stream,done);stream.once('end',done);stream.once('close',done);}
  timer=setTimeout(finish,drainMs);
 });
 async function bounded(promise,timeoutMs,code) {
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(code),{code})),timeoutMs);})]);}
  finally{clearTimeout(timer);}
 }
 return {
  PORT:3123,remote:true,
  async startServer(port){const result=await rpc('start',[port]);return {almPort:result.port,listening:true,close:()=>rpc('stop')};},
  startReleaseNotifications(callback){notifier=callback;return rpc('notifications');},
  configureUpdateNotifications(callback){updateNotifier=callback;return rpc('updateNotifications');},
  configureBackupSecrets(store){secrets=store;return rpc('secrets');},
  testNotification(callback){notifier=callback;return rpc('testNotification');},
  checkUpdates(force,channel){return rpc('updates',[force,channel]);},
  configureMaintenanceUpdate(callback){maintenanceUpdate=callback;return rpc('maintenanceCallback');},
  runMaintenance(options){return rpc('maintenanceRun',[options]);},maintenanceState(){return rpc('maintenanceState');},
  configureMaintenance(input){return rpc('maintenanceConfig',[input]);},prepareUpdateBackup(){return rpc('updateBackup');},stopBackups(){},
  ping(timeoutMs=5000){return rpc('ping',[],timeoutMs);},
  hasExited:()=>stopped,
  onExit(listener){exitListeners.add(listener);if(exitResult)queueMicrotask(()=>{if(exitListeners.has(listener))emitExit(listener);});return()=>exitListeners.delete(listener);},
  diagnostics:()=>({code:exitCode,stopped,pid:child.pid||null,detail:redact(stderr.trim()||fatal||stdout.trim()||'Aucun détail du moteur.')}),
  async settleCallbacks(timeoutMs=15000){await bounded(Promise.allSettled([...callbacks]),timeoutMs,'ALM_ENGINE_CALLBACK_TIMEOUT');},
  async shutdown(){expectedStop=true;if(!stopped)await rpc('stop');},
  kill(){expectedStop=true;if(!stopped)child.kill();},
  async terminate({graceMs=3000,forceMs=3000}={}){
   expectedStop=true;if(stopped)return;
   child.kill();
   try{await bounded(exited,graceMs,'ALM_ENGINE_TERMINATE_TIMEOUT');return;}catch(error){if(stopped)return;}
   const pid=child.pid;
   if(Number.isInteger(pid)&&pid>0&&!stopped)forceKill(pid);
   await bounded(exited,forceMs,'ALM_ENGINE_TERMINATE_TIMEOUT');
  }
 };
}
module.exports={createServerProcess};
