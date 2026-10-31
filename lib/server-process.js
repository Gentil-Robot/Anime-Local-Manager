'use strict';
const path=require('node:path');
function createServerProcess(utilityProcess){
 const child=utilityProcess.fork(path.join(__dirname,'server-host.js'),[],{serviceName:'ALM local engine',env:process.env,stdio:'pipe'});
 const outputStreams=[child.stdout,child.stderr].filter(Boolean);
 const pending=new Map();let serial=0,notifier=null,secrets=null,stopped=false;
 let stderr='',stdout='',exitCode=null,fatal='';
 const redact=value=>{let text=String(value);for(const [key,secret]of Object.entries(process.env))if(/(?:KEY|TOKEN|PASSWORD|SECRET)/i.test(key)&&secret&&secret.length>=6)text=text.split(secret).join('[masqué]');return text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1[masqué]@');};
 child.stdout?.on('data',chunk=>{stdout=(stdout+redact(chunk.toString())).slice(-8192);});
 child.stderr?.on('data',chunk=>{stderr=(stderr+redact(chunk.toString())).slice(-16384);});
 const stoppedError=()=>{const error=Error('ALM_ENGINE_STOPPED'+(Number.isInteger(exitCode)?' (code '+exitCode+')':'')+': '+redact(stderr.trim()||fatal||stdout.trim()||'Aucun détail du moteur.'));error.code='ALM_ENGINE_STOPPED';error.exitCode=exitCode;return error;};
 child.on('error',(type,location)=>{fatal=redact(type instanceof Error?type.message:String(type||'')+' '+String(location||''));});
 let maintenanceUpdate=null;
 const rpc=(method,args=[])=>new Promise((resolve,reject)=>{if(stopped)return reject(stoppedError());const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('ALM_ENGINE_TIMEOUT'));},method==='maintenanceRun'||method==='stop'?30*60000:30000);pending.set(id,{resolve,reject,timer});try{child.postMessage({id,method,args});}catch(error){pending.delete(id);clearTimeout(timer);reject(error);}});
 child.on('message',async message=>{
  if(stopped)return;
  if(message.callback){let value,error;try{if(message.callback==='notify')value=await notifier?.(message.args[0]);else if(message.callback==='loadSecret')value=await secrets?.load();else if(message.callback==='saveSecret')value=await secrets?.save(message.args[0]);else if(message.callback==='maintenanceUpdate')value=await maintenanceUpdate?.(message.args[0]);else throw Error('ALM_ENGINE_CALLBACK');}catch(e){error=e.message;}
   // OS dialogs, key-store writes and maintenance can finish after the engine
   // exits. Let an already-started operation finish, but never reply to a dead
   // child. The transport can close just before its exit event is delivered.
   if(!stopped)try{child.postMessage({callbackResult:message.id,value,error});}catch(e){fatal=redact(e?.message||String(e));}
   return;
  }
  const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);if(message.error)item.reject(Error(message.error));else item.resolve(message.value);
 });
 child.on('exit',code=>{
  stopped=true;exitCode=code;for(const item of pending.values())clearTimeout(item.timer);
  if(!pending.size)return;
  // The process exit notification can precede the final pipe data. Retain the
  // streams captured before Electron clears child.stdout/stderr, and allow a
  // short, bounded drain before constructing the redacted startup diagnostic.
  let finished=false,timer;const listeners=new Map();
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);for(const [stream,done]of listeners){stream.removeListener('end',done);stream.removeListener('close',done);}for(const item of pending.values())item.reject(stoppedError());pending.clear();};
  const open=outputStreams.filter(stream=>!stream.readableEnded&&!stream.destroyed);
  if(!open.length){setImmediate(finish);return;}
  const waiting=new Set(open);
  for(const stream of open){const done=()=>{waiting.delete(stream);if(!waiting.size)finish();};listeners.set(stream,done);stream.once('end',done);stream.once('close',done);}
  timer=setTimeout(finish,250);
 });
 return {PORT:3123,remote:true,async startServer(port){const result=await rpc('start',[port]);return {almPort:result.port,listening:true,close:()=>rpc('stop')};},
  startReleaseNotifications(callback){notifier=callback;return rpc('notifications');},configureBackupSecrets(store){secrets=store;return rpc('secrets');},
  testNotification(callback){notifier=callback;return rpc('testNotification');},checkUpdates(force,channel){return rpc('updates',[force,channel]);},configureMaintenanceUpdate(callback){maintenanceUpdate=callback;return rpc('maintenanceCallback');},runMaintenance(options){return rpc('maintenanceRun',[options]);},maintenanceState(){return rpc('maintenanceState');},configureMaintenance(input){return rpc('maintenanceConfig',[input]);},prepareUpdateBackup(){return rpc('updateBackup');},stopBackups(){},async shutdown(){if(!stopped)await rpc('stop');},kill(){child.kill();}};
}
module.exports={createServerProcess};
