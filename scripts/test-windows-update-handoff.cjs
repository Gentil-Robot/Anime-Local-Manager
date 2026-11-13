'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {launchWindows}=require('../lib/windows-update-launcher'),{createIntegratedUpdater}=require('../lib/integrated-updater');
async function run(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alm-handoff-'));
 try{
  const log=path.join(temp,'Chemin é $ (test)','update-error.log'),job={pid:123,file:path.join(temp,'setup.exe'),target:path.join(temp,'ALM.exe'),digest:'a'.repeat(64),version:'9.0.0',log};let invocation,child;
  const mock=ack=>(...args)=>{invocation=args;child=new EventEmitter();child.kill=()=>{};child.unref=()=>{};queueMicrotask(()=>{child.emit('spawn');ack?.(JSON.parse(args[2].env.ALM_UPDATE_JOB),child);});return child;};
  const noAck=launchWindows(job,mock(),{timeoutMs:80,pollMs:5});await assert.rejects(noAck,/ALM_UPDATE_HELPER_TIMEOUT/);assert(fs.readFileSync(log,'utf8').includes('ALM_UPDATE_HELPER_TIMEOUT'));
  await assert.rejects(launchWindows(job,mock((j)=>fs.writeFileSync(j.status,JSON.stringify({nonce:'stale',phase:'waiting'}))),{timeoutMs:80,pollMs:5}),/TIMEOUT/);
  await assert.rejects(launchWindows(job,mock((_j,c)=>c.emit('exit',1)),{timeoutMs:80,pollMs:5}),/ALM_UPDATE_HELPER_EXIT/);
  await launchWindows(job,mock(j=>fs.writeFileSync(j.status,JSON.stringify({nonce:j.nonce,phase:'waiting'}))),{timeoutMs:100,pollMs:5});assert.equal(invocation[2].cwd,path.dirname(log));assert.equal(invocation[2].detached,true);
  const payload=Buffer.alloc(2048);payload.write('MZ');payload.writeUInt32LE(128,60);payload.write('PE\0\0',128);const digest=crypto.createHash('sha256').update(payload).digest('hex');
  const name='Anime-Local-Manager-9.0.0-Setup-x64.exe',release={available:true,latest:'v9.0.0',prerelease:true,assets:[{name,state:'uploaded',size:payload.length,digest:'sha256:'+digest,browser_download_url:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/download/v9.0.0/'+name}]};
  let quits=0,launched;
  const options={current:'2.1.1',platform:'win32',arch:'x64',packaged:true,target:job.target,directory:path.dirname(log),getRelease:async()=>release,fetchImpl:async()=>new Response(payload),verifyWindows:async()=>({signed:false}),quit:()=>quits++};
  let updater=createIntegratedUpdater({...options,launch:async()=>{throw Error('ALM_UPDATE_HELPER_EXIT');}});await updater.download();await assert.rejects(updater.install(),/HELPER_EXIT/);assert.equal(quits,0,'A helper that failed to start cannot close ALM');assert(fs.existsSync(path.join(options.directory,'ready.json')));assert(updater.state().canRetry);
  fs.writeFileSync(path.join(options.directory,'update-install.json'),JSON.stringify({phase:'failed',version:'9.0.0',code:'ALM_UPDATE_INSTALL_FAILED'}));
  updater=createIntegratedUpdater({...options,launch:async job=>{launched=job;}});assert.equal(updater.state().phase,'error');assert(updater.state().canRetry);await updater.install();assert.equal(quits,1);assert.equal(launched.version,'9.0.0');assert.equal(launched.readyFile,path.join(options.directory,'ready.json'));assert(fs.existsSync(launched.readyFile),'Only the successful installer may discard the ready marker');
  console.log('OK Windows handoff: spawn alone/stale acknowledgements rejected, helper errors retain ALM and its download, valid acknowledgement permits quit, paths with spaces and accents preserved.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
