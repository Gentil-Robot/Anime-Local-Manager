'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {atomicJson}=require('./atomic-file');
const {WINDOWS_PROGRESS_SCRIPT}=require('./windows-update-progress');
// Windows PowerShell 5.1 requires a BOM to read CJK translations reliably.
const WINDOWS_PROGRESS_CONTENT='\uFEFF'+WINDOWS_PROGRESS_SCRIPT;
// Keep the PowerShell environment below Windows process limits. The GUI source
// is an immutable file checked by SHA-256 before running, not a giant env value.
const PROGRESS_LOADER=`$ErrorActionPreference='Stop';$file=$env:ALM_UPDATE_PROGRESS_FILE;$digest=$env:ALM_UPDATE_PROGRESS_DIGEST;if(-not $file -or -not $digest){throw 'ALM_UPDATE_PROGRESS_SCRIPT_CHECKSUM'};$stream=[IO.File]::OpenRead($file);$sha=[Security.Cryptography.SHA256]::Create();try{$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()};if($actual -ne $digest){throw 'ALM_UPDATE_PROGRESS_SCRIPT_CHECKSUM'};[ScriptBlock]::Create([IO.File]::ReadAllText($file,[Text.Encoding]::UTF8)).Invoke()`;

// Paths remain JSON data. PowerShell acknowledges that the program is running
// and has verified the payload before ALM is allowed to close.
const WINDOWS_SCRIPT=`$ErrorActionPreference='Stop'
$j=$null
function Get-UpdateHash($file) {
  $stream=[IO.File]::OpenRead($file)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
}
function Save-State($phase,$code='',$processId=0) {
  $actualPid=if($processId -gt 0){$processId}else{$PID}
  $state=@{nonce=$j.nonce;phase=$phase;code=$code;version=$j.version;processId=$actualPid;at=[DateTime]::UtcNow.ToString('o')}
  [IO.File]::WriteAllText($j.status,($state|ConvertTo-Json -Compress),[System.Text.UTF8Encoding]::new($false))
}
try {
  $j=ConvertFrom-Json -InputObject $env:ALM_UPDATE_JOB
  $previous=Get-Content -LiteralPath $j.status -Raw | ConvertFrom-Json
  if($previous.nonce -ne $j.nonce -or $previous.phase -eq 'failed'){exit 0}
  if((Get-UpdateHash $j.file) -ne $j.digest){throw 'ALM_UPDATE_CHECKSUM'}
  # Show the independent window BEFORE acknowledging the handoff. ALM must
  # remain open if Windows cannot display the progress indicator.
  if($j.showProgress -ne $false){
    if(!$env:ALM_UPDATE_PROGRESS_COMMAND -or !(Test-Path -LiteralPath $j.uiScript)){throw 'ALM_UPDATE_PROGRESS_UNAVAILABLE'}
    if((Get-UpdateHash $j.uiScript) -ne $j.uiScriptDigest){throw 'ALM_UPDATE_PROGRESS_SCRIPT_CHECKSUM'}
    $ui=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-STA','-EncodedCommand',$env:ALM_UPDATE_PROGRESS_COMMAND) -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $j.log) -PassThru
    $deadline=[DateTime]::UtcNow.AddSeconds(15);$visible=$false
    while([DateTime]::UtcNow -lt $deadline){
      $ui.Refresh()
      if($ui.HasExited){throw 'ALM_UPDATE_PROGRESS_EXIT'}
      if(Test-Path -LiteralPath $j.uiReady){
        try{$ack=Get-Content -LiteralPath $j.uiReady -Raw | ConvertFrom-Json
          if($ack.nonce -eq $j.nonce -and $ack.visible -eq $true){$visible=$true;break}
        }catch{}
      }
      Start-Sleep -Milliseconds 150
    }
    if(!$visible){throw 'ALM_UPDATE_PROGRESS_TIMEOUT'}
  }
  $previous=Get-Content -LiteralPath $j.status -Raw | ConvertFrom-Json
  if($previous.nonce -ne $j.nonce -or $previous.phase -eq 'failed'){exit 0}
  Save-State 'waiting'
  Wait-Process -Id $j.pid -Timeout 90 -ErrorAction SilentlyContinue
  if(Get-Process -Id $j.pid -ErrorAction SilentlyContinue){throw 'ALM_UPDATE_PARENT_RUNNING'}
  if(!(Test-Path -LiteralPath $j.authorization)){exit 0}
  $authorization=Get-Content -LiteralPath $j.authorization -Raw | ConvertFrom-Json
  if($authorization.nonce -ne $j.nonce -or !$authorization.authorized){exit 0}
  Save-State 'verifying'
  if((Get-UpdateHash $j.file) -ne $j.digest){throw 'ALM_UPDATE_CHECKSUM'}
  Save-State 'installing'
  if($j.portable){
    $backup=$j.target+'.alm-previous'
    if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}
    Move-Item -LiteralPath $j.target -Destination $backup
    try{Move-Item -LiteralPath $j.file -Destination $j.target}catch{Move-Item -LiteralPath $backup -Destination $j.target;throw}
  }else{
    # NSIS /S supplies no trustworthy percent. The separate GUI shows a
    # moving indicator during this stage, not fictitious percentages.
    $installer=Start-Process -FilePath $j.file -ArgumentList @('/S','--updated',('/D='+$j.installDir)) -WorkingDirectory (Split-Path -Parent $j.file) -Wait -PassThru
    if($installer.ExitCode -ne 0){throw ('ALM_UPDATE_INSTALLER_EXIT_'+$installer.ExitCode)}
  }
  if(!(Test-Path -LiteralPath $j.target -PathType Leaf)){throw 'ALM_UPDATE_TARGET_MISSING'}
  if(!$j.portable){
    $installedVersion=[string](Get-Item -LiteralPath $j.target).VersionInfo.FileVersion
    if($installedVersion -and !$installedVersion.StartsWith(([string]$j.version)+'.') -and $installedVersion -ne [string]$j.version){
      throw 'ALM_UPDATE_INSTALLED_VERSION_MISMATCH'
    }
  }
  Save-State 'installed'
  # Cache cleanup is best-effort. It must not turn a successful installation
  # into a false failure or remove evidence of a failed installer.
  if($j.readyFile -and (Test-Path -LiteralPath $j.readyFile)){
    try{Remove-Item -LiteralPath $j.readyFile -Force}catch{try{$_|Out-File -LiteralPath $j.log -Append}catch{}}
  }
  try{
    Save-State 'restarting'
    $application=Start-Process -FilePath $j.target -ArgumentList '--updated' -WorkingDirectory $j.installDir -PassThru
    Save-State 'restarted' '' $application.Id
  }catch{
    try{$_|Out-File -LiteralPath $j.log -Append}catch{}
    Save-State 'installed' 'ALM_UPDATE_RESTART_FAILED'
  }
}catch{
  if($null -ne $j){
    $failure=$_
    try{$failure | Out-File -LiteralPath $j.log -Encoding utf8 -Append}catch{}
    $code=[string]$failure.Exception.Message
    if($code -notmatch '^ALM_UPDATE_[A-Z0-9_\\-]+$'){$code='ALM_UPDATE_INSTALL_FAILED'}
    try{Save-State 'failed' $code}catch{}
    # Keep ready.json and the verified installer for explicit retry.
    if((Test-Path -LiteralPath $j.authorization) -and !(Get-Process -Id $j.pid -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $j.target)){
      try{Start-Process -FilePath $j.target -WorkingDirectory $j.installDir}catch{}
    }
  }
  exit 1
}finally{
  if($null -ne $j -and $j.authorization){Remove-Item -LiteralPath $j.authorization -Force -ErrorAction SilentlyContinue}
  if($null -ne $j -and $j.uiReady){Remove-Item -LiteralPath $j.uiReady -Force -ErrorAction SilentlyContinue}
  if($null -ne $j -and $j.uiScript){Remove-Item -LiteralPath $j.uiScript -Force -ErrorAction SilentlyContinue}
}
`;
const WINDOWS_BOOTSTRAP_SCRIPT=`$ErrorActionPreference='Stop'
try {
  $j=ConvertFrom-Json -InputObject $env:ALM_UPDATE_JOB
  $worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand',$env:ALM_UPDATE_COMMAND) -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $j.log) -RedirectStandardOutput ($j.log+'.stdout') -RedirectStandardError ($j.log+'.stderr') -PassThru
  Write-Output $worker.Id
}catch{Write-Error $_;exit 1}`;
function readState(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
async function launchWindows(input,spawnImpl=spawn,{timeoutMs=15000,pollMs=50}={}) {
 const directory=path.dirname(input.log),nonce=crypto.randomUUID(),job={...input,status:input.status||path.join(directory,'update-install.json'),nonce,authorization:path.join(directory,'install-'+nonce+'.json'),uiReady:path.join(directory,'window-'+nonce+'.json'),uiScript:path.join(directory,'progress-'+nonce+'.ps1'),uiScriptDigest:crypto.createHash('sha256').update(WINDOWS_PROGRESS_CONTENT,'utf8').digest('hex'),showProgress:input.showProgress!==false,language:input.language||'fr'};
 fs.mkdirSync(directory,{recursive:true});
 if(job.showProgress)fs.writeFileSync(job.uiScript,WINDOWS_PROGRESS_CONTENT,{encoding:'utf8',mode:0o600,flag:'wx'});
 atomicJson(job.status,{nonce:job.nonce,phase:'starting',version:job.version,at:new Date().toISOString()});
 fs.appendFileSync(job.log,'\n'+new Date().toISOString()+' ALM_UPDATE_HELPER_START\n');
 // Node's detached flag makes Windows PowerShell exit without running. A
 // regular bootstrap uses Start-Process so the worker also survives Node's
 // kill-on-exit job. Only a matching acknowledgement grants installation.
 const output=fs.openSync(job.log+'.bootstrap','a',0o600);let child;
 try{child=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(WINDOWS_BOOTSTRAP_SCRIPT,'utf16le').toString('base64')],{cwd:directory,detached:false,stdio:['ignore',output,output],windowsHide:true,env:{...process.env,ALM_UPDATE_JOB:JSON.stringify(job),ALM_UPDATE_COMMAND:Buffer.from(WINDOWS_SCRIPT,'utf16le').toString('base64'),ALM_UPDATE_PROGRESS_COMMAND:Buffer.from(PROGRESS_LOADER,'utf16le').toString('base64'),ALM_UPDATE_PROGRESS_FILE:job.uiScript,ALM_UPDATE_PROGRESS_DIGEST:job.uiScriptDigest}});}
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
module.exports={WINDOWS_SCRIPT,WINDOWS_BOOTSTRAP_SCRIPT,PROGRESS_LOADER,launchWindows,readState};
