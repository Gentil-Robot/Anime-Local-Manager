'use strict';
// Only the fixed methods below cross the trusted parent/utility boundary.
const api=require('../server'),db=require('../db'),pending=new Map();let server,serial=0;
function callback(name,args=[]){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('ALM_PARENT_TIMEOUT'));},15000);pending.set(id,{resolve,reject,timer});process.parentPort.postMessage({callback:name,id,args});});}
process.parentPort.on('message',async({data:m})=>{
 if(m.callbackResult){const p=pending.get(m.callbackResult);if(p){clearTimeout(p.timer);pending.delete(m.callbackResult);m.error?p.reject(Error(m.error)):p.resolve(m.value);}return;}
 let value,error;try{switch(m.method){
 case 'start':server=await api.startServer(m.args[0]);value={port:server.almPort};break;
 case 'notifications':api.startReleaseNotifications(item=>callback('notify',[item]));value=true;break;
 case 'secrets':await api.configureBackupSecrets({load:()=>callback('loadSecret'),save:p=>callback('saveSecret',[p])});value=true;break;
 case 'testNotification':value=await api.testNotification(item=>callback('notify',[item]));break;
 case 'updates':value=await api.checkUpdates(m.args[0],m.args[1]);break;
 case 'maintenanceCallback':api.configureMaintenanceUpdate(settings=>callback('maintenanceUpdate',[settings]));value=true;break;
 case 'maintenanceRun':value=await api.runMaintenance(m.args[0]);break;
 case 'maintenanceState':value=api.maintenanceState();break;
 case 'maintenanceConfig':value=api.configureMaintenance(m.args[0]);break;
 case 'updateBackup':value=await api.prepareUpdateBackup();break;
 case 'stop':await api.stopMaintenance();await api.closeCommunity();api.stopBackups();await new Promise(resolve=>{if(!server)return resolve();server.close(resolve);server.closeAllConnections?.();});await db.whenReady();db.close();value=true;break;
 default:throw Error('ALM_ENGINE_METHOD');
 }}catch(e){error=e.message;}process.parentPort.postMessage({id:m.id,value,error});
});
