'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {testApp,smokeEnvironment}=require('./smoke-windows'),{executeReleaseSmoke,checkpoint}=require('../lib/release-smoke');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-beta68-release-')),executable=path.join(directory,'ALM.exe'),diagnosticsDir=path.join(directory,'diagnostics');fs.writeFileSync(executable,'controlled-executable');
 try{
  const clean=smokeEnvironment('profile','nonce',{Path:'system',NODE_OPTIONS:'--inspect',electron_run_as_node:'1',ELECTRON_NO_ASAR:'1',NODE_PATH:'other',ALM_DATA_DIR:'user-db',ALM_IMAGES_DIR:'user-images',ALM_CONFIG_KEY:'private',ALM_SESSION_TOKEN:'private',ALM_TEST_PROFILE:'1',ALM_RELEASE_PROFILE:'old'});
  assert.deepEqual(Object.keys(clean).sort(),['ALM_RELEASE_NONCE','ALM_RELEASE_PROFILE','ALM_RELEASE_SMOKE','Path'].sort());assert.equal(clean.Path,'system');
  const options={version:'controlled-version',electron:'controlled-electron',expectedCount:30430,diagnosticsDir};let launches=[],profile;
  const makeProof=(env,changes={})=>{profile=env.ALM_RELEASE_PROFILE;const marker=JSON.parse(fs.readFileSync(path.join(profile,'.alm-release-test.json'),'utf8'));const value={status:'passed',nonce:env.ALM_RELEASE_NONCE,phase:marker.phase,version:options.version,runtime:{electron:options.electron},packaged:true,ui:true,catalogueCount:30430,episodesSeen:3,imported:1,backup:true,persistence:marker.phase==='verify',...changes};fs.writeFileSync(path.join(profile,'smoke-result.json'),JSON.stringify(value));return value;};
  const proof=await testApp(executable,{...options,run:async(_exe,args,{env})=>{launches.push(env.ALM_RELEASE_PROFILE);assert.equal(args[0],'--enable-logging=file');const phase=launches.length===1?'seed':'verify';assert.equal(args[1],'--log-file='+path.join(env.ALM_RELEASE_PROFILE,'chromium-'+phase+'.log'));makeProof(env);return {code:0,output:''};}});
  assert.equal(proof.launches,2);assert.equal(launches[0],launches[1]);assert(proof.persistence);assert(!fs.existsSync(profile));assert(!fs.existsSync(diagnosticsDir));
  await assert.rejects(testApp(executable,{...options,run:async(_exe,_args,{env})=>{makeProof(env,{status:'failed',stage:'engine-start',error:'CONTROLLED_ENGINE_FAILURE'});fs.writeFileSync(path.join(env.ALM_RELEASE_PROFILE,'chromium-seed.log'),'Controlled Windows child log');return {code:1,output:''};}}),error=>error.message.includes('CONTROLLED_ENGINE_FAILURE')&&error.message.includes('engine-start')&&error.message.includes('0x00000001')&&error.message.includes('Diagnostic :'));
  assert(!fs.existsSync(profile));let records=()=>fs.readdirSync(diagnosticsDir).map(f=>JSON.parse(fs.readFileSync(path.join(diagnosticsDir,f),'utf8')));assert.equal(records().length,1);assert.equal(records()[0].proof.status,'failed');assert.equal(records()[0].chromium,'Controlled Windows child log');
  await assert.rejects(testApp(executable,{...options,run:async(_exe,_args,{env})=>{profile=env.ALM_RELEASE_PROFILE;return {code:-1073741819,output:'',signal:null};}}),/0xC0000005/);
  assert(!fs.existsSync(profile));assert.equal(records().length,2);
  await assert.rejects(testApp(executable,{...options,run:async(_exe,_args,{env})=>{profile=env.ALM_RELEASE_PROFILE;return {code:0,output:''};}}),/Rapport de l’application absent/);assert(!fs.existsSync(profile));
  await assert.rejects(testApp(executable,{...options,run:async(_exe,_args,{env})=>{makeProof(env,{nonce:'wrong'});return {code:0,output:''};}}),/absent ou incohérent/);
  await assert.rejects(testApp(executable,{...options,run:async(_exe,_args,{env})=>{makeProof(env);return {code:1,output:'nonzero even with a passed proof'};}}),/Code de sortie 1/);
  // Preserve an application error before exit; passing proofs still require completed checks.
  const context={result:path.join(directory,'app-proof.json'),nonce:'a'.repeat(64),phase:'seed'};checkpoint(context,'engine-ready');assert.equal(JSON.parse(fs.readFileSync(context.result)).status,'running');let exitCode=null,closed=false;
  await executeReleaseSmoke({context,app:{isPackaged:true,exit:code=>exitCode=code},window:{webContents:{executeJavaScript:async()=>{throw Error('CONTROLLED_RENDERER_FAILURE');}}},close:async()=>closed=true});
  const failure=JSON.parse(fs.readFileSync(context.result));assert.equal(failure.status,'failed');assert.equal(failure.error,'CONTROLLED_RENDERER_FAILURE');assert.equal(failure.stage,'renderer-checks');assert.equal(exitCode,1);assert(closed);
  console.log('OK Beta68 release: isolated child environment; two verified launches remain required; silent exit/NTSTATUS, app errors and Electron logs retained; invalid or missing proof blocks release. Native Windows execution is still required on Windows.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
