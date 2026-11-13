'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),electron=require('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const flags=process.platform==='linux'?['--no-sandbox','--ozone-platform=headless']:[];
for(const recipe of ['test-v200-engine-native.cjs','test-v200-auth-browser.cjs','test-v211-update-browser.cjs']){
 // Chromium holds profile files open on Windows until the entire Electron
 // process exits. The independent Node parent therefore owns their cleanup.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-native-recipe-'));
 let failed=false;
 try {
  const run=spawnSync(electron,[...flags,path.join(__dirname,recipe)],{
   cwd:root,env:{...env,ALM_NATIVE_TEST_DIRECTORY:directory},encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024
  });
  process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
  if(run.error||run.status!==0){console.error('Native recipe failed:',recipe,run.error?.message||'exit '+run.status);failed=true;}
 } finally {
  // Retry transient antivirus/file-handle delays after the child has stopped.
  fs.rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:250});
 }
 if(failed)process.exit(1);
}
