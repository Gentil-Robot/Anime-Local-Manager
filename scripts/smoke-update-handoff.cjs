'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {atomicJson,fileHash}=require('./release-utils'),{readState}=require('../lib/windows-update-launcher');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,predicate,timeoutMs){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){const value=read();if(predicate(value))return value;await delay(100);}throw Error('ALM_UPDATE_SMOKE_TIMEOUT');}
async function testUpdateHandoff({root,installer,installedExe,version,expectedCount,electron,log,signal,run,smokeEnvironment,validateProof}){
 const profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'alm-release-'))),nonce=crypto.randomBytes(32).toString('hex');
 const updates=path.join(profile,'updates é $ (test)'),state=path.join(updates,'update-install.json'),errorLog=path.join(updates,'update-error.log');fs.mkdirSync(updates);
 const readyFile=path.join(updates,'ready.json');atomicJson(readyFile,{fixture:true});
 const job={file:installer,target:installedExe,digest:fileHash(installer),portable:false,installDir:path.dirname(installedExe),log:errorLog,readyFile,version};
 const recipe=path.join(updates,'parent.cjs');fs.writeFileSync(recipe,"'use strict';const fs=require('node:fs');const {launchWindows}=require(process.env.ALM_HANDOFF_MODULE);(async()=>{await launchWindows({...JSON.parse(process.env.ALM_HANDOFF_JOB),pid:process.pid});fs.writeFileSync(process.env.ALM_HANDOFF_ACK,'acknowledged');})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});");
 atomicJson(path.join(profile,'.alm-release-test.json'),{nonce,phase:'seed',expectedCount});
 const env={...smokeEnvironment(profile,nonce),ALM_HANDOFF_MODULE:path.join(root,'lib/windows-update-launcher.js'),ALM_HANDOFF_JOB:JSON.stringify(job),ALM_HANDOFF_ACK:path.join(updates,'ack.txt')};
 const media=path.join(path.dirname(installedExe),'resources/alm-media/alm-clip-complet-1080p.mp4'),mediaDigest=fileHash(media);
 // Removing only this disposable installed resource proves that NSIS really
 // restores its payload; restarting an unchanged installation cannot pass.
 fs.unlinkSync(media);
 let helperPid=0;
 try{
  // This parent really exits. The independent PowerShell helper must survive,
  // wait for that exit, run the actual NSIS installer and launch installed ALM.
  const parent=spawn(process.execPath,[recipe],{env,cwd:updates,stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';parent.stdout.on('data',b=>output+=b);parent.stderr.on('data',b=>output+=b);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{parent.kill();reject(Error('ALM_UPDATE_SMOKE_PARENT_TIMEOUT'));},30000);parent.once('error',error=>{clearTimeout(timer);reject(error);});parent.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('ALM_UPDATE_SMOKE_PARENT: '+output));});});
  if(!fs.existsSync(path.join(updates,'ack.txt')))throw Error('ALM_UPDATE_SMOKE_NOT_ACKNOWLEDGED');
  const restarted=await until(()=>readState(state),s=>['restarted','failed'].includes(s?.phase),180000);
  if(restarted.phase!=='restarted')throw Error('ALM_UPDATE_SMOKE_INSTALL: '+fs.readFileSync(errorLog,'utf8'));
  helperPid=restarted.processId;
  const proof=await until(()=>readState(path.join(profile,'smoke-result.json')),p=>['passed','failed'].includes(p?.status),180000);
  validateProof(proof,{nonce,phase:'seed',version,expectedCount,electron});
  if(fileHash(media)!==mediaDigest)throw Error('ALM_UPDATE_SMOKE_PAYLOAD_NOT_RESTORED');
  if(fs.existsSync(readyFile))throw Error('ALM_UPDATE_SMOKE_STALE_READY');
  // Check data through a second launch after the automatic restart completed.
  await until(()=>{try{process.kill(helperPid,0);return false;}catch{return true;}},v=>v,30000);
  atomicJson(path.join(profile,'.alm-release-test.json'),{nonce,phase:'verify',expectedCount});fs.rmSync(path.join(profile,'smoke-result.json'),{force:true});
  const verify=await run(installedExe,[],{env:smokeEnvironment(profile,nonce),cwd:path.dirname(installedExe),log,signal,timeoutMs:180000});
  if(verify.code!==0)throw Error('ALM_UPDATE_SMOKE_VERIFY_EXIT');
  const persisted=validateProof(readState(path.join(profile,'smoke-result.json')),{nonce,phase:'verify',version,expectedCount,electron});
  return {status:'passed',parentExited:true,helperAcknowledged:true,installer:true,automaticRestart:true,payloadRestored:true,persistence:persisted.persistence,backup:persisted.backup,version,runtime:proof.runtime,pathsWithSpacesAndAccents:true};
 }catch(error){log?.write('[update-handoff] '+error.message+'\n');log?.write(JSON.stringify({handoff:readState(state),application:readState(path.join(profile,'smoke-result.json'))})+'\n');if(fs.existsSync(errorLog))log?.write(fs.readFileSync(errorLog,'utf8').slice(-8192)+'\n');throw error;}
 finally{if(helperPid)try{process.kill(helperPid);}catch{}fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:250});}
}
module.exports={testUpdateHandoff};
