'use strict';
const {removeBuildTree}=require('./build-cleanup');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {sourceStage,stagedDependenciesValid}=require('./release-windows'),{runCommand,npmInvocation,treeManifest}=require('./release-utils');
const {packageDependencies}=require('./package-dependencies'),{archiveName}=require('./package-local-modules'),{verifyPreparedSource}=require('./check-packaged-integrity');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const phases=require('./package-phase-timer').phaseTimer('beta71');
function dependencyFixtures(){
 const entries=new Map([
  ['package.json',JSON.stringify({dependencies:{express:'4'}})],
  ['node_modules/express/package.json',JSON.stringify({dependencies:{'body-parser':'1'},optionalDependencies:{optional:'1'},peerDependencies:{peer:'1'},peerDependenciesMeta:{peer:{optional:true}}})],
  ['node_modules/body-parser/package.json','{}']
 ]);
 const check=()=>packageDependencies(new Set(entries.keys()),name=>entries.get(name));assert.equal(check().size,3);
 entries.delete('node_modules/body-parser/package.json');assert.throws(check,/express\/package.json → body-parser/);
 entries.set('node_modules/express/node_modules/body-parser/package.json',JSON.stringify({dependencies:{express:'4'}}));assert.equal(check().size,3,'Nested dependency and cycle resolve within the archive');
 entries.set('node_modules/express/package.json',JSON.stringify({peerDependencies:{required:'1'}}));assert.throws(check,/required/);
}
(async()=>{
 dependencyFixtures();
 phases.mark('dependency-fixtures');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alm71-package-'));
 let testFailure,successMessage;
 try{
  const electron=require('electron'),electronDist=path.dirname(electron),stage=path.join(temporary,'project'),source=JSON.parse(fs.readFileSync(path.join(root,'SOURCE-MANIFEST.json'),'utf8'));
  assert(fs.existsSync(electron),'Electron runtime absent; install dependencies with npm ci.');
  sourceStage(root,stage,source);
  phases.mark('stage-physical-dependencies');
  const modules=path.join(stage,'node_modules'),digest=treeManifest(path.join(root,'node_modules'),{allowLinks:true}).digest;
  assert(stagedDependenciesValid(stage,digest));assert(!fs.lstatSync(modules).isSymbolicLink());
  const changed=path.join(modules,'body-parser/package.json'),original=fs.readFileSync(changed);fs.appendFileSync(changed,' ');assert(!stagedDependenciesValid(stage,digest));fs.writeFileSync(changed,original);
  // Reproduce the old staging topology through the actual, locked builder.
  const copy=path.join(temporary,'physical-modules');fs.renameSync(modules,copy);
  fs.symlinkSync(path.join(root,'node_modules'),modules,process.platform==='win32'?'junction':'dir');assert(!stagedDependenciesValid(stage,digest));
  const args=[require.resolve('electron-builder/cli.js'),process.platform==='win32'?'--win':process.platform==='darwin'?'--mac':'--linux','dir','--x64','--publish','never','--config.electronDist='+electronDist];
  const build=()=>runCommand(process.execPath,args,{cwd:stage,timeoutMs:240000});
  const broken=await build();assert.notEqual(broken.code,0,'Linked node_modules regression was not rejected');assert.match(broken.output,/Dépendance de production absente du paquet/,broken.output.slice(-10000));
  phases.mark('negative-builder');console.log('OK Beta71: actual electron-builder rejects the old linked dependency tree.');
  fs.rmSync(modules,{recursive:true,force:true});fs.renameSync(copy,modules);assert(stagedDependenciesValid(stage,digest));
  const invocation=npmInvocation(['list','--all','--omit=dev','--json']);const listed=await runCommand(invocation.command,invocation.args,{cwd:stage,timeoutMs:60000});assert.equal(listed.code,0,listed.output.slice(-6000));
  phases.mark('npm-production-tree');
  fs.rmSync(path.join(stage,'dist'),{recursive:true,force:true});const built=await build();assert.equal(built.code,0,built.output.slice(-12000));
  phases.mark('positive-builder');
  const out=path.join(stage,'dist',process.platform==='win32'?'win-unpacked':process.platform==='darwin'?'mac':'linux-unpacked');
  const archive=process.platform==='darwin'?path.join(out,pkg.build.productName+'.app/Contents/Resources/app.asar'):path.join(out,'resources/app.asar');
  const checked=verifyPreparedSource(archive,stage);assert(checked.dependencyPackages>=80);
  const asar=require('@electron/asar'),files=new Set(asar.listPackage(archive).map(archiveName));
  assert(files.has('node_modules/body-parser/package.json'));assert(!files.has('node_modules/electron-builder/package.json'));
  phases.mark('verify-asar-dependencies');
  const profile=path.join(temporary,'alm69-profile-'+crypto.randomBytes(4).toString('hex')),nonce=crypto.randomBytes(32).toString('hex');fs.mkdirSync(profile);
  for(const phase of ['seed','verify']){
   const flags=process.platform==='linux'?['--ozone-platform=headless',...(process.getuid?.()===0?['--no-sandbox']:[])]:[];
   const env={...process.env,ALM_PACKAGE_ARCHIVE:archive,ALM_PACKAGE_PROFILE:profile,ALM_PACKAGE_PHASE:phase,ALM_PACKAGE_NONCE:nonce,ALM_PACKAGE_ELECTRON:pkg.devDependencies.electron};
   for(const key of Object.keys(env))if(/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH)$/i.test(key))delete env[key];
   const result=await runCommand(electron,[...flags,path.join(__dirname,'test-beta69-engine-electron.cjs')],{cwd:temporary,timeoutMs:180000,env});
   assert.equal(result.code,0,result.output.slice(-12000));assert(result.output.includes('ALM_PACKAGE_ENGINE_OK'),result.output);console.log(result.output.split(/\r?\n/).find(line=>line.startsWith('ALM_PACKAGE_ENGINE_OK')));phases.mark('electron-'+phase);
  }
  successMessage='OK Beta71: real electron-builder package, '+checked.dependencyPackages+' production packages, dependency copy integrity and resume validation; real Electron utility process, catalogue/import/backup/persistence. The native Windows EXE gate remains required.';
 }catch(error){testFailure=error;throw error;}finally{
  try{await removeBuildTree(temporary);phases.mark('cleanup');}catch(error){if(testFailure)throw new AggregateError([testFailure,error],'Test et nettoyage en echec');throw error;}
 }
 console.log(successMessage);console.log('[package-profile] summary '+JSON.stringify(phases.result()));
 console.log('OK nettoyage du dossier temporaire et fermeture des processus de test.');
})().catch(error=>{console.error(error);process.exitCode=1;});
