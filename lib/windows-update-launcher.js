'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {atomicJson}=require('./atomic-file');
// Paths remain JSON data. PowerShell acknowledges that the program is running
// and has verified the payload before ALM is allowed to close.
const WINDOWS_SCRIPT=`$ErrorActionPreference='Stop'
$j=$null
function Save-State($phase,$code='',$processId=0) {
  $state=@{nonce=$j.nonce;phase=$phase;code=$code;version=$j.version;processId=$processId;at=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($j.status,($state|ConvertTo-Json -Compress),[System.Text.UTF8Encoding]::new($false))
}
try {
  $j=ConvertFrom-Json -InputObject $env:ALM_UPDATE_JOB
  $previous=Get-Content -LiteralPath $j.status -Raw | ConvertFrom-Json
  if($previous.nonce -ne $j.nonce -or $previous.phase -eq 'failed'){exit 0}
  if((Get-FileHash -LiteralPath $j.file -Algorithm SHA256).Hash.ToLower() -ne $j.digest){throw 'ALM_UPDATE_CHECKSUM'}
  $previous=Get-Content -LiteralPath $j.status -Raw | ConvertFrom-Json
  if($previous.nonce -ne $j.nonce -or $previous.phase -eq 'failed'){exit 0}
  Save-State 'waiting' '' $PID
  Wait-Process -Id $j.pid -Timeout 90 -ErrorAction SilentlyContinue
  if(Get-Process -Id $j.pid -ErrorAction SilentlyContinue){throw 'ALM_UPDATE_PARENT_RUNNING'}
  if((Get-FileHash -LiteralPath $j.file -Algorithm SHA256).Hash.ToLower() -ne $j.digest){throw 'ALM_UPDATE_CHECKSUM'}
  if(!(Test-Path -LiteralPath $j.authorization)){exit 0}
  $authorization=Get-Content -LiteralPath $j.authorization -Raw | ConvertFrom-Json
  if($authorization.nonce -ne $j.nonce -or !$authorization.authorized){exit 0}
  Save-State 'installing'
  if($j.portable){
    $backup=$j.target+'.alm-previous'
    if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}
    Move-Item -LiteralPath $j.target -Destination $backup
    try{Move-Item -LiteralPath $j.file -Destination $j.target}catch{Move-Item -LiteralPath $backup -Destination $j.target;throw}
  }else{
    # /D is deliberately last and unquoted, as required by NSIS. We own the
    # restart explicitly instead of relying on NSIS's optional finish action.
    $installer=Start-Process -FilePath $j.file -ArgumentList @('/S','--updated',('/D='+$j.installDir)) -WorkingDirectory (Split-Path -Parent $j.file) -Wait -PassThru
    if($installer.ExitCode -ne 0){throw ('ALM_UPDATE_INSTALLER_EXIT_'+$installer.ExitCode)}
  }
  Save-State 'installed'
  if($j.readyFile -and (Test-Path -LiteralPath $j.readyFile)){Remove-Item -LiteralPath $j.readyFile -Force}
  $application=Start-Process -FilePath $j.target -ArgumentList '--updated' -WorkingDirectory $j.installDir -PassThru
  Save-State 'restarted' '' $application.Id
}catch{
  if($null -ne $j){
    $_ | Out-File -LiteralPath $j.log -Encoding utf8 -Append
    try{Save-State 'failed' 'ALM_UPDATE_INSTALL_FAILED'}catch{}
    # A failed install keeps the downloaded payload for a deliberate retry.
    if((Test-Path -LiteralPath $j.authorization) -and !(Get-Process -Id $j.pid -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $j.target)){
      try{Start-Process -FilePath $j.target -WorkingDirectory $j.installDir}catch{}
    }
  }
  exit 1
}finally{if($null -ne $j -and $j.authorization){Remove-Item -LiteralPath $j.authorization -Force -ErrorAction SilentlyContinue}}
`;
const WINDOWS_BOOTSTRAP_SCRIPT=`$ErrorActionPreference='Stop'
try {
  $j=ConvertFrom-Json -InputObject $env:ALM_UPDATE_JOB
  $worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$env:ALM_UPDATE_COMMAND) -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $j.log) -RedirectStandardOutput ($j.log+'.stdout') -RedirectStandardError ($j.log+'.stderr') -PassThru
  Write-Output $worker.Id
}catch{Write-Error $_;exit 1}`;
function readState(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
async function launchWindows(input,spawnImpl=spawn,{timeoutMs=15000,pollMs=50}={}) {
 const directory=path.dirname(input.log),nonce=crypto.randomUUID(),job={...input,status:input.status||path.join(directory,'update-install.json'),nonce,authorization:path.join(directory,'install-'+nonce+'.json')};
 fs.mkdirSync(directory,{recursive:true});
 atomicJson(job.status,{nonce:job.nonce,phase:'starting',version:job.version,at:new Date().toISOString()});
 fs.appendFileSync(job.log,'\n'+new Date().toISOString()+' ALM_UPDATE_HELPER_START\n');
 // Node's detached flag makes Windows PowerShell exit without running. A
 // regular bootstrap uses Start-Process so the worker also survives Node's
 // kill-on-exit job. Only a matching acknowledgement grants installation.
 const output=fs.openSync(job.log,'a',0o600);let child;
 try{child=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(WINDOWS_BOOTSTRAP_SCRIPT,'utf16le').toString('base64')],{cwd:directory,detached:false,stdio:['ignore',output,output],windowsHide:true,env:{...process.env,ALM_UPDATE_JOB:JSON.stringify(job),ALM_UPDATE_COMMAND:Buffer.from(WINDOWS_SCRIPT,'utf16le').toString('base64')}});}
 catch(error){fs.closeSync(output);throw error;}
 fs.closeSync(output);
 return new Promise((resolve,reject)=>{
  let settled=false,timer,poll;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(poll);child.removeListener('error',failed);child.removeListener('exit',exited);if(error){try{atomicJson(job.status,{nonce:job.nonce,phase:'failed',version:job.version,code:error.message,at:new Date().toISOString()});fs.appendFileSync(job.log,new Date().toISOString()+' '+error.message+'\n');}catch{}reject(error);}else{try{atomicJson(job.authorization,{nonce:job.nonce,authorized:true});}catch{reject(Error('ALM_UPDATE_HELPER_START'));return;}child.on('error',()=>{});child.unref();resolve();}};
  const failed=()=>finish(Error('ALM_UPDATE_HELPER_START'));
  const exited=code=>{if(code!==0)finish(Error('ALM_UPDATE_HELPER_EXIT'));};
  child.once('error',failed);child.once('exit',exited);
  const check=()=>{const state=readState(job.status);if(state?.nonce!==job.nonce)return;if(state.phase==='waiting')finish();else if(state.phase==='failed')finish(Error('ALM_UPDATE_HELPER_START'));};
  poll=setInterval(check,pollMs);timer=setTimeout(()=>{try{child.kill();}catch{}finish(Error('ALM_UPDATE_HELPER_TIMEOUT'));},timeoutMs);check();
 });
}
module.exports={WINDOWS_SCRIPT,WINDOWS_BOOTSTRAP_SCRIPT,launchWindows,readState};
