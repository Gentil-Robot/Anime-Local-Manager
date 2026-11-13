'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {createServerProcess}=require('../lib/server-process');
const {createEngineSupervisor}=require('../lib/engine-supervisor');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function processFixture(options={}){
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.pid=123456;
 child.postMessage=message=>{if(message.method)queueMicrotask(()=>child.emit('message',{id:message.id,value:message.method==='start'?{port:3123}:{ok:true}}));};
 const exit=(code=1)=>{child.pid=undefined;child.emit('exit',code);child.stdout.end();child.stderr.end();};
 child.kill=()=>{exit(0);return true;};
 const api=createServerProcess({fork:()=>child},options);return {child,api,exit};
}
function engineFixture(label,events){
 const listeners=new Set();let stopped=false,hang=false;
 return {label,remote:true,
  onExit(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  diagnostics:()=>({detail:'fictional '+label}),hasExited:()=>stopped,
  fail(expected=false){stopped=true;for(const fn of [...listeners])fn({code:1,expected,error:'fictional failure'});},
  async terminate(){events.push('terminate '+label);stopped=true;},
  async settleCallbacks(){events.push('settle '+label);},
  async ping(){if(hang)throw Error('ALM_ENGINE_TIMEOUT');return {ok:true};},
  set hang(value){hang=value;}
 };
}
async function main(){
 {
  const previous=process.env.ALM_SUPERVISOR_TEST_TOKEN;process.env.ALM_SUPERVISOR_TEST_TOKEN='FICTIONAL_OLD_ENGINE_SECRET';
  try{
   const f=processFixture(),seen=[];f.api.onExit(result=>seen.push(result));
   f.child.stderr.write('failure FICTIONAL_OLD_');
   process.env.ALM_SUPERVISOR_TEST_TOKEN='FICTIONAL_REPLACEMENT_SECRET';
   f.child.stderr.write('ENGINE_SECRET');f.exit(7);await tick();await tick();
   assert.equal(seen.length,1,'No pending RPC is required for exit notification');
   assert.equal(seen[0].code,7);assert.equal(seen[0].expected,false);
   assert(!seen[0].error.includes('FICTIONAL_OLD_ENGINE_SECRET'));assert(seen[0].error.includes('[masqué]'));
   let late=0;f.api.onExit(()=>late++);await tick();assert.equal(late,1,'A late supervisor sees the recorded exit');
  }finally{if(previous===undefined)delete process.env.ALM_SUPERVISOR_TEST_TOKEN;else process.env.ALM_SUPERVISOR_TEST_TOKEN=previous;}
 }
 {
  const f=processFixture(),seen=[];f.api.onExit(result=>seen.push(result));
  assert.equal((await f.api.ping(50)).ok,true);await f.api.shutdown();f.api.kill();await tick();await tick();assert.equal(seen[0].expected,true);
 }
 {
  let forced=0;const f=processFixture({forceKill:pid=>{assert.equal(pid,123456);forced++;f.exit(0);}});f.child.kill=()=>false;
  await f.api.terminate({graceMs:1,forceMs:30});assert.equal(forced,1);assert(f.api.hasExited());
 }
 const inertTimers={setInterval:()=>({unref(){}}),clearInterval(){}};
 {
  const events=[],first=engineFixture('old',events),seen=[],gate=deferred();let current=first,clock=0;
  first.settleCallbacks=async()=>{events.push('settle old');await gate.promise;};
  const supervisor=createEngineSupervisor({initial:first,now:()=>clock,timers:inertTimers,
   create:()=>{events.push('create');return current=engineFixture('new',events);},
   reconnect:async engine=>{events.push('connect '+engine.label);return {port:4321};},onFailure:(info,controls)=>seen.push({info,controls})});
  first.fail();await tick();assert.equal(seen.length,1);
  const restart=supervisor.restart();assert.equal(supervisor.restart(),restart,'Repeated clicks share one restart');
  await tick();assert.deepEqual(events,['terminate old','settle old']);
  gate.resolve();assert.equal((await restart).port,4321);assert.deepEqual(events,['terminate old','settle old','create','connect new']);
  assert.equal(supervisor.snapshot().phase,'online');
  first.fail();await tick();assert.equal(seen.length,1,'An old generation cannot report a new failure');
  current.fail();await supervisor.restart();
  await assert.rejects(supervisor.restart(),/RESTART_LIMIT/);
  clock=61000;assert(supervisor.snapshot().canRestart);await supervisor.restart();supervisor.dispose();
 }
 {
  const events=[],first=engineFixture('busy',events),seen=[];let clock=0;
  const supervisor=createEngineSupervisor({initial:first,timers:inertTimers,now:()=>clock,intervalMs:10,pingTimeoutMs:2,
   onFailure:info=>seen.push(info),create:()=>assert.fail('No automatic restart'),reconnect:async()=>{}});
  first.hang=true;
  for(let n=0;n<2;n++){clock+=10;await supervisor.check();}assert.equal(seen.length,0);
  clock+=10;await supervisor.check();await tick();assert.equal(seen.length,1);assert.equal(seen[0].reason,'unresponsive');
  await supervisor.check();await tick();assert.equal(seen.length,1);
  supervisor.resume();clock+=1000;await supervisor.check();assert.equal(supervisor.snapshot().misses,0,'Resume from sleep is not a missed heartbeat');
  first.hang=false;clock+=10;await supervisor.check();assert.equal(supervisor.snapshot().phase,'online');
  supervisor.suspend();first.fail();await tick();assert.equal(seen.length,1);supervisor.dispose();
 }
 {
  const events=[],first=engineFixture('cannot-stop',events);let created=0;
  first.terminate=async()=>{throw Error('ALM_ENGINE_TERMINATE_TIMEOUT');};
  const supervisor=createEngineSupervisor({initial:first,timers:inertTimers,onFailure:()=>{},
   create:()=>{created++;},reconnect:async()=>{}});
  await assert.rejects(supervisor.restart(),/TERMINATE_TIMEOUT/);assert.equal(created,0,'No second writer if the first process cannot be stopped');supervisor.dispose();
 }
 {
  const events=[],first=engineFixture('closing',events),gate=deferred();let created=0;
  first.settleCallbacks=()=>gate.promise;
  const supervisor=createEngineSupervisor({initial:first,timers:inertTimers,onFailure:()=>{},create:()=>{created++;},reconnect:async()=>{}});
  const restart=supervisor.restart();await tick();supervisor.dispose();gate.resolve();await assert.rejects(restart,/SUPERVISOR_CLOSED/);assert.equal(created,0);
 }
 {
  const events=[],first=engineFixture('creating',events),candidate=engineFixture('late',events),gate=deferred();let connected=0;
  const supervisor=createEngineSupervisor({initial:first,timers:inertTimers,onFailure:()=>{},
   create:()=>gate.promise,reconnect:async()=>{connected++;}});
  const restart=supervisor.restart();await tick();supervisor.dispose();gate.resolve(candidate);
  await assert.rejects(restart,/SUPERVISOR_CLOSED/);assert.equal(connected,0);
  assert(candidate.hasExited(),'A late-created process must stop before any reconnect after quit');
 }
 console.log('OK V2 engine supervision: idle exits, late subscribers, secret redaction across generations, expected stop, bounded termination, one writer, callback drain, restart limits, heartbeat grace and shutdown races.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
