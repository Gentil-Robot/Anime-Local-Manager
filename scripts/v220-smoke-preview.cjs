'use strict';
// Native smoke of isolated 2.2.0 VM preview after packaging.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
if(process.platform!=='win32')throw Error('ALM_VM_TEST_WINDOWS_ONLY');
if(process.env.ALM_VM_PREVIEW_BUILD!=='1'||process.env.GITHUB_ACTIONS!=='true')throw Error('ALM_VM_TEST_DISPOSABLE_RUNNER_REQUIRED');
const reportFile=path.join(dist,'VM-TEST-REPORT.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
if(report.version!=='2.2.0'||report.notForProduction!==true)throw Error('ALM_VM_PREVIEW_METADATA');
(async()=>{
 const outcome=await require('./smoke-windows').smokeWindows({root,unpacked:path.join(dist,'win-unpacked'),
  installer:path.join(dist,report.filename),installerSmoke:true});
 const expectedNode=fs.readFileSync(path.join(root,'.node-version'),'utf8').trim();
 const expectedElectron=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).devDependencies.electron;
 for(const proof of [outcome.application,outcome.installer]){
  if(proof?.runtime?.node!==expectedNode||proof?.runtime?.electron!==expectedElectron)throw Error('ALM_VM_RUNTIME_MISMATCH');
  if(expectedElectron==='45.5.0'&&proof.runtime.chrome!=='156.0.8078.109')throw Error('ALM_VM_CHROMIUM_MISMATCH');
 }
 report.smoke=outcome;
 report.runtime=outcome.installer.runtime;
 report.status=outcome.installer?.status==='passed'&&outcome.updater?.status==='passed'?'verified-vm-preview':'smoke-incomplete';
 fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
 if(report.status!=='verified-vm-preview')throw Error('ALM_VM_PREVIEW_SMOKE_INCOMPLETE');
 console.log('OK 2.2.0 VM TEST: real NSIS installation, persistence, independent handoff, restart and backup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
