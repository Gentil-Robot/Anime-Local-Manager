'use strict';
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),electron=require('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const flags=process.platform==='linux'?['--no-sandbox','--ozone-platform=headless']:[];
for(const recipe of ['test-v200-engine-native.cjs','test-v200-auth-browser.cjs']){
 const run=spawnSync(electron,[...flags,path.join(__dirname,recipe)],{cwd:root,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');
 if(run.error||run.status!==0){console.error('Native recipe failed:',recipe,run.error?.message||'exit '+run.status);process.exit(1);}
}
