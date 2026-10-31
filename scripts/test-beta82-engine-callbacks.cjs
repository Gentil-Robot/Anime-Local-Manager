'use strict';
// Parent/utility shutdown races with fictional messages only; no Electron,
// network, OS key-store access or persistent writes are needed.
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createServerProcess}=require('../lib/server-process');

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(){
 const child=new EventEmitter(),sent=[];
 child.stdout=new PassThrough();child.stderr=new PassThrough();child.alive=true;
 child.replyError=null;child.holdRpc=false;child.kill=()=>{};
 child.postMessage=message=>{
  if(!child.alive)throw Error('FICTIONAL_CLOSED_TRANSPORT');
  if(message.callbackResult&&child.replyError)throw child.replyError;
  sent.push(message);
  if(message.method&&!child.holdRpc)queueMicrotask(()=>child.emit('message',{id:message.id,value:message.method==='start'?{port:3123}:true}));
 };
 const api=createServerProcess({fork:()=>child});
 const exit=()=>{child.alive=false;child.emit('exit',1);};
 const callback=(name,id=101,args=[])=>child.emit('message',{callback:name,id,args});
 return {child,sent,api,exit,callback};
}
async function register(f,name,fn){
 if(name==='notify')await f.api.startReleaseNotifications(fn);
 else if(name==='maintenanceUpdate')await f.api.configureMaintenanceUpdate(fn);
 else await f.api.configureBackupSecrets({load:name==='loadSecret'?fn:async()=>'',save:name==='saveSecret'?fn:async()=>{}});
}
(async()=>{
 const unhandled=[];
 const observe=error=>unhandled.push(error);
 process.on('unhandledRejection',observe);
 try{
  for(const name of ['notify','loadSecret','saveSecret','maintenanceUpdate']){
   const f=fixture(),value=name==='loadSecret'?'fictional-stored-value':{ok:true};let calls=0,input;
   await register(f,name,async arg=>{calls++;input=arg;return value;});
   f.callback(name,101,['fictional-input']);await tick();
   assert.equal(calls,1,name+' normal callback');
   if(name!=='loadSecret')assert.equal(input,'fictional-input');
   assert.deepEqual(f.sent.find(message=>message.callbackResult===101),{callbackResult:101,value,error:undefined});
   assert.equal((await f.api.startServer(3123)).almPort,3123,'normal RPC still works');
   f.exit();
  }
  {
   const f=fixture();await register(f,'loadSecret',async()=>{throw Error('FICTIONAL_KEY_STORE_FAILURE');});
   f.callback('loadSecret');await tick();
   assert.deepEqual(f.sent.find(message=>message.callbackResult),{callbackResult:101,value:undefined,error:'FICTIONAL_KEY_STORE_FAILURE'});
   f.exit();
  }
  for(const name of ['notify','loadSecret','saveSecret','maintenanceUpdate']){
   const f=fixture(),operation=deferred();let started=0,finished=0;
   await register(f,name,async()=>{started++;await operation.promise;finished++;return true;});
   f.callback(name);assert.equal(started,1);
   f.exit();operation.resolve();await tick();
   assert.equal(finished,1,name+' already-started work completes');
   assert.equal(f.sent.some(message=>message.callbackResult),false,name+' late reply suppressed');
   f.callback(name,102);await tick();assert.equal(started,1,name+' post-exit work suppressed');
  }
  {
   const f=fixture();await register(f,'notify',async()=>true);
   f.child.replyError=Error('FICTIONAL_TRANSPORT_CLOSED_BEFORE_EXIT');
   f.callback('notify');await tick();
   f.child.holdRpc=true;
   const pending=f.api.startServer(3123);
   const rejected=assert.rejects(pending,error=>error.code==='ALM_ENGINE_STOPPED'&&error.message.includes('FICTIONAL_TRANSPORT_CLOSED_BEFORE_EXIT'));
   f.exit();await rejected;
  }
  {
   const previous=process.env.ALM_CALLBACK_TEST_SECRET;process.env.ALM_CALLBACK_TEST_SECRET='FICTIONAL_SPLIT_PRIVATE_VALUE';
   try{
    const f=fixture();f.child.holdRpc=true;
    const pending=f.api.startServer(3123);
    const rejected=assert.rejects(pending,error=>error.code==='ALM_ENGINE_STOPPED'&&error.message.includes('FICTIONAL_MISSING_MODULE_AFTER_EXIT')&&error.message.includes('[masqué]')&&!error.message.includes(process.env.ALM_CALLBACK_TEST_SECRET));
    f.exit();
    await tick();f.child.stderr.write('FICTIONAL_MISSING_MODULE_AFTER_EXIT FICTIONAL_SPLIT_');f.child.stderr.write('PRIVATE_VALUE');f.child.stdout.end();f.child.stderr.end();
    await rejected;
    for(const stream of [f.child.stdout,f.child.stderr]){assert.equal(stream.listenerCount('end'),0);assert.equal(stream.listenerCount('close'),0);}
   }finally{if(previous===undefined)delete process.env.ALM_CALLBACK_TEST_SECRET;else process.env.ALM_CALLBACK_TEST_SECRET=previous;}
  }
  {
   const f=fixture();f.child.holdRpc=true;
   const pending=f.api.startServer(3123);
   const rejected=assert.rejects(pending,error=>error.code==='ALM_ENGINE_STOPPED'&&error.message.includes('Aucun détail du moteur.'));
   f.exit();
   let timer;try{await Promise.race([rejected,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Pipe drain must be bounded')),1500);})]);}finally{clearTimeout(timer);}
   for(const stream of [f.child.stdout,f.child.stderr]){assert.equal(stream.listenerCount('end'),0);assert.equal(stream.listenerCount('close'),0);stream.destroy();}
  }
  await tick();assert.deepEqual(unhandled,[],'No callback can escape as an unhandled rejection');
  console.log('OK Beta82 engine callbacks: normal replies/errors, completed in-flight writes, late callbacks suppressed, closed-transport race, bounded stderr drain and listener cleanup.');
 }finally{process.removeListener('unhandledRejection',observe);}
})().catch(error=>{console.error(error);process.exitCode=1;});
