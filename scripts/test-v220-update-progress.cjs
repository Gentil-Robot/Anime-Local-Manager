'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events');
const {WINDOWS_PROGRESS_SCRIPT}=require('../lib/windows-update-progress');
const {WINDOWS_SCRIPT,WINDOWS_BOOTSTRAP_SCRIPT,PROGRESS_LOADER,launchWindows,readState}=require('../lib/windows-update-launcher');
const launcher=fs.readFileSync(path.join(__dirname,'../lib/windows-update-launcher.js'),'utf8');
const integrated=fs.readFileSync(path.join(__dirname,'../lib/integrated-updater.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const smoke=fs.readFileSync(path.join(__dirname,'smoke-update-handoff.cjs'),'utf8');
const probe=fs.readFileSync(path.join(__dirname,'probe-windows-update-helper.cjs'),'utf8');

assert(WINDOWS_PROGRESS_SCRIPT.includes('System.Windows.Forms'), 'Progress must live in an external native window');
assert(WINDOWS_PROGRESS_SCRIPT.includes('Show-Result'), 'Must render explicit success/failure');
assert(WINDOWS_PROGRESS_SCRIPT.includes("if($phase -eq 'failed')"), 'Failure from installer must be explicit');
assert(WINDOWS_PROGRESS_SCRIPT.includes("if($phase -eq 'restarted')"), 'Success must survive process handoff');
assert(WINDOWS_PROGRESS_SCRIPT.includes("ALM_UPDATE_RESTART_FAILED"), 'Installer success without app restart must be distinguishable');
assert(WINDOWS_PROGRESS_SCRIPT.includes('Get-Process -Id'), 'Orphaned helper must be detected');
assert(WINDOWS_PROGRESS_SCRIPT.includes('[System.Windows.Forms.ProgressBarStyle]::Marquee'), 'Silent NSIS must not claim invented percentages');
assert(WINDOWS_PROGRESS_SCRIPT.includes('$close.Enabled=$true'), 'Final results must remain visible until dismissed');
for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN'])assert(WINDOWS_PROGRESS_SCRIPT.includes("'"+lang+"'=@("), 'Missing language: '+lang);
assert(Buffer.byteLength(WINDOWS_PROGRESS_SCRIPT,'utf16le')*4/3 < 32767, 'PowerShell encoded command too large for environment variable');
assert(WINDOWS_SCRIPT.indexOf('ALM_UPDATE_PROGRESS_UNAVAILABLE')<WINDOWS_SCRIPT.indexOf("Save-State 'waiting'"), 'Progress window must be checked before ALM quits');
assert(WINDOWS_SCRIPT.includes('ALM_UPDATE_PROGRESS_TIMEOUT'), 'Missing UI acknowledgement must fail');
assert(WINDOWS_SCRIPT.includes("Save-State 'installing'")&&WINDOWS_SCRIPT.includes("Save-State 'installed'"), 'Installer milestones missing');
assert(WINDOWS_SCRIPT.includes("Save-State 'installed' 'ALM_UPDATE_RESTART_FAILED'"), 'Restart failure must not be called install failure');
assert(WINDOWS_SCRIPT.includes('ALM_UPDATE_INSTALLED_VERSION_MISMATCH'), 'Successful exit must verify installed version');
assert(WINDOWS_SCRIPT.includes('$j.showProgress -ne $false'), 'Native smoke must be able to opt out without showing GUI');
assert(integrated.includes("showProgress:platform==='win32'"), 'Windows updater must opt into progress');
assert(main.includes('language:readAppLanguage()'), 'Window language should match ALM');
assert(smoke.includes('showProgress:false')&&probe.includes('showProgress:false'), 'Non-interactive CI must not open a window');

if(process.platform==='win32'){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-update-ps-'));
  try{
    for(const [name,source] of [['progress',WINDOWS_PROGRESS_SCRIPT],['worker',WINDOWS_SCRIPT],['bootstrap',WINDOWS_BOOTSTRAP_SCRIPT],['progress-loader',PROGRESS_LOADER]]){
      const file=path.join(directory,name+'.ps1');fs.writeFileSync(file,'\uFEFF'+source);
      const checker="$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile($env:ALM_PS_FILE,[ref]$tokens,[ref]$errors)|Out-Null;foreach($problem in $errors){Write-Output ($problem.Message+' @ '+$problem.Extent.StartLineNumber)};if($errors.Count){exit 1}";
      const check=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(checker,'utf16le').toString('base64')],{env:{...process.env,ALM_PS_FILE:file},encoding:'utf8',timeout:15000});
      assert.equal(check.status,0,name+' PowerShell syntax error: '+(check.stdout||'')+(check.stderr||''));
    }
    const fixture=path.join(directory,'trusted.ps1');fs.writeFileSync(fixture,"Write-Output 'ALM_GUI_CHECK_OK'");
    const digest=require('node:crypto').createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
    const args=['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(PROGRESS_LOADER,'utf16le').toString('base64')];
    const env={...process.env,ALM_UPDATE_PROGRESS_FILE:fixture,ALM_UPDATE_PROGRESS_DIGEST:digest};
    const good=spawnSync('powershell.exe',args,{env,encoding:'utf8',timeout:15000});
    assert.equal(good.status,0,'Signed GUI loader should execute trusted content: '+good.stderr);
    assert(good.stdout.includes('ALM_GUI_CHECK_OK'));
    const bad=spawnSync('powershell.exe',args,{env:{...env,ALM_UPDATE_PROGRESS_DIGEST:'0'.repeat(64)},encoding:'utf8',timeout:15000});
    assert.notEqual(bad.status,0,'Tampered GUI source must fail closed');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-update-ui-test-'));
 try{
  let captured;
  const job={pid:1234,file:path.join(directory,'setup.exe'),target:path.join(directory,'ALM.exe'),digest:'a'.repeat(64),version:'2.2.0',log:path.join(directory,'error.log'),language:'fr'};
  const mockSpawn=(exe,args,options)=>{
    captured={exe,args,options};
    const child=new EventEmitter();child.unref=()=>{};child.kill=()=>{};
    queueMicrotask(()=>{
      child.emit('spawn');
      const data=JSON.parse(options.env.ALM_UPDATE_JOB);
      assert(data.showProgress,'UI should be required by default');
      assert.equal(data.language,'fr');
      assert(data.uiReady.includes('window-'+data.nonce));
      assert(options.env.ALM_UPDATE_PROGRESS_COMMAND,'Progress launcher missing from the independent helper');
      assert(fs.existsSync(data.uiScript),'Progress script must be present before ALM closes');
      assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(data.uiScript)).digest('hex'),data.uiScriptDigest,'Progress script must be pinned by SHA-256');
      assert.equal(options.env.ALM_UPDATE_PROGRESS_DIGEST,data.uiScriptDigest,'Viewer must recheck code integrity');
      fs.writeFileSync(data.status,JSON.stringify({nonce:data.nonce,phase:'waiting',version:data.version}));
    });
    return child;
  };
  await launchWindows(job,mockSpawn,{timeoutMs:1000,pollMs:5});
  assert(captured.options.env.ALM_UPDATE_PROGRESS_COMMAND.length>500,'Missing checked progress launcher');
  assert(captured.options.env.ALM_UPDATE_PROGRESS_COMMAND.length<6000,'Large base64 payloads could break Windows process environment limits');
  const saved=readState(path.join(directory,'update-install.json'));
  assert.equal(saved.phase,'waiting');
  const auth=JSON.parse(fs.readFileSync(JSON.parse(captured.options.env.ALM_UPDATE_JOB).authorization,'utf8'));
  assert.equal(auth.authorized,true);
  console.log('OK ALM 2.2 update status: GUI required before handoff, seven languages, explicit outcome, offline progress, parsed PowerShell on Windows.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
