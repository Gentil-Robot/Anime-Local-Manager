'use strict';
const assert=require('node:assert/strict'),{createScheduler,schedulerError}=require('../lib/os-maintenance');
(async()=>{
 let installed=false,matching=true,calls=0;
 const fixture={exe:'C:\\App folder\\ALM.exe',packaged:true,platform:'win32',userData:'fixture-user',exec:async(_command,args,options)=>{
  calls++;const program=Buffer.from(args.at(-1),'base64').toString('utf16le'),job=JSON.parse(options.env.ALM_SCHEDULE_JOB);
  assert(!args.join(' ').includes(fixture.exe));assert(program.includes('InnerException'));assert(program.includes("GetFolder('\\ALM')"));
  if('enabled' in job){installed=job.enabled;assert(program.includes('$folder.GetTask($j.name)'));assert(!program.includes('RunLevel=1'));}
  return {stdout:JSON.stringify({registered:installed,enabled:installed,matches:matching})};
 }};
 const scheduler=createScheduler(fixture);assert.equal((await scheduler.status()).registered,false);
 await scheduler.configure(true);let state=await scheduler.status();assert(state.verified&&state.registered&&state.matches);assert.equal(state.platform,'win32');assert.equal(state.folder,'\\ALM');assert(state.taskPath.startsWith('\\ALM\\'));assert.equal(calls,2,'Status uses readback cache');
 await scheduler.configure(false);assert.equal((await scheduler.status()).registered,false);
 matching=false;await assert.rejects(scheduler.configure(true),/ALM_SCHEDULE_UNVERIFIED/);
 const broken=createScheduler({...fixture,exec:async()=>({stdout:''})});assert.equal((await broken.status()).verified,false);await assert.rejects(broken.configure(true));
 assert.equal((await createScheduler({...fixture,exe:undefined,packaged:false}).status()).supported,false);
 const source=createScheduler({...fixture,packaged:false,exec:async()=>{throw Error('must not run');}});assert.equal((await source.status()).supported,false);await assert.rejects(source.configure(true),/PACKAGED_ONLY/);
 const denied=createScheduler({...fixture,exec:async()=>{throw Object.assign(Error('Access is denied 0x80070005'),{stderr:'PRIVATE-PATH 0x80070005'});}});await assert.rejects(denied.configure(true),/ALM_SCHEDULE_ACCESS_DENIED/);const failed=await denied.status();assert.equal(failed.error,'ALM_SCHEDULE_ACCESS_DENIED');assert.equal(failed.hresult,'0x80070005');assert(!JSON.stringify(failed).includes('PRIVATE-PATH'));assert.equal(schedulerError(Object.assign(Error('spawn'),{code:'ENOENT'})).code,'ALM_SCHEDULE_POWERSHELL_MISSING');assert.equal(schedulerError({killed:true}).code,'ALM_SCHEDULE_TIMEOUT');
 let release;const gate=new Promise(r=>release=r),order=[];const serial=createScheduler({...fixture,exec:async(_command,args,options)=>{const job=JSON.parse(options.env.ALM_SCHEDULE_JOB);order.push(job.enabled);if(order.length===1)await gate;return {stdout:JSON.stringify({registered:job.enabled,enabled:job.enabled,matches:true})};}});const first=serial.configure(true),second=serial.configure(false);await new Promise(r=>setImmediate(r));assert.deepEqual(order,[true]);release();await Promise.all([first,second]);assert.deepEqual(order,[true,false]);assert.equal((await serial.status()).registered,false);
 console.log('OK Beta61 scheduler: verified task readback, rejection of wrong/missing task, failed status, no command interpolation, cached reads, disable and source-mode restrictions. Native Windows COM remains a VM check.');
})().catch(error=>{console.error(error);process.exitCode=1;});
