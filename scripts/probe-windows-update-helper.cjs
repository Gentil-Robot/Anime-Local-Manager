'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {launchWindows,readState}=require('../lib/windows-update-launcher');
async function run(){
 if(process.platform!=='win32')throw Error('Windows-only native probe');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-launch-probe-'));
 const encoded=Buffer.from("[IO.File]::WriteAllText($env:ALM_PROBE_MARKER,'ok');exit 0",'utf16le').toString('base64');
 try{
  for(const detached of [true,false])for(const mode of ['ignore','file','pipe']){
   const name=String(detached)+'-'+mode,marker=path.join(directory,name+'.txt'),output=path.join(directory,name+'.log'),fd=mode==='file'?fs.openSync(output,'a'):null;
   const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{detached,windowsHide:true,stdio:mode==='file'?['ignore',fd,fd]:mode,env:{...process.env,ALM_PROBE_MARKER:marker}});if(fd!==null)fs.closeSync(fd);
   let text='';child.stdout?.on('data',b=>text+=b);child.stderr?.on('data',b=>text+=b);child.stdin?.end();
   const result=await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve({timeout:true});},10000);child.once('error',error=>{clearTimeout(timer);resolve({error:error.message});});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,hex:Number.isInteger(code)?'0x'+(code>>>0).toString(16):null,signal});});});
   console.log('ALM_PS_PROBE '+JSON.stringify({detached,mode,...result,marker:fs.existsSync(marker),output:text||(fs.existsSync(output)?fs.readFileSync(output,'utf8'):'')}));
  }
  const job={pid:process.pid,file:process.execPath,target:path.join(directory,'nonexistent-fixture.exe'),digest:crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex'),portable:false,installDir:path.dirname(process.execPath),version:'fixture',log:path.join(directory,'update-error.log')};let helper;
  try{await launchWindows(job,(...args)=>{helper=spawn(...args);helper.on('exit',(code,signal)=>console.log('ALM_HELPER_EXIT '+JSON.stringify({code,hex:Number.isInteger(code)?'0x'+(code>>>0).toString(16):null,signal})));return helper;});console.log('ALM_HELPER_ACKNOWLEDGED');}
  finally{const state=readState(path.join(directory,'update-install.json'));if(state?.phase==='waiting'&&Number.isSafeInteger(state.processId)&&state.processId>0){try{process.kill(state.processId);}catch{}await new Promise(resolve=>setTimeout(resolve,250));}if(helper?.exitCode===null){helper.kill();await new Promise(resolve=>helper.once('exit',resolve));}if(fs.existsSync(job.log))console.log(fs.readFileSync(job.log,'utf8'));}
 }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
