'use strict';
const {removeBuildTree}=require('./build-cleanup');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {FileMatcher}=require('app-builder-lib/out/fileMatcher'),{localModules,sourceRuntimeFiles,archiveName}=require('./package-local-modules'),{checkArchive}=require('./check-packaged-integrity'),{runCommand,npmInvocation}=require('./release-utils');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const phases=require('./package-phase-timer').phaseTimer('beta69');
(async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alm69-package-'));
 let testFailure,successMessage;
 try{
  const filter=new FileMatcher(root,root,value=>value,pkg.build.files).createFilter(),runtime=sourceRuntimeFiles(root);
  for(const name of runtime)assert(filter(path.join(root,name),fs.statSync(path.join(root,name))),'Runtime file excluded by build.files: '+name);
  const omitted=['community/library-stats.js','community/content-policy.js','data/database/community-content-policy.json'];
  const oldFilter=new FileMatcher(root,root,value=>value,pkg.build.files.filter(name=>!omitted.includes(name))).createFilter();for(const name of omitted)assert(!oldFilter(path.join(root,name),fs.statSync(path.join(root,name))));
  phases.mark('filter-validation');
  const payload=path.join(temporary,'payload');fs.mkdirSync(payload);const source=JSON.parse(fs.readFileSync(path.join(root,'SOURCE-MANIFEST.json'),'utf8'));
  for(const {path:name}of source.files){if(name.startsWith('public/assets/')||name.startsWith('build/icons/')||!filter(path.join(root,name),fs.statSync(path.join(root,name))))continue;const destination=path.join(payload,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,name),destination);}
  phases.mark('copy-sources');
  const invocation=npmInvocation(['ls','--omit=dev','--all','--parseable']),dependencies=spawnSync(invocation.command,invocation.args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(dependencies.status,0,dependencies.stderr);
  phases.mark('npm-ls');
  const count=require('./production-copy-roots').copyProductionModules(root,payload,dependencies.stdout);
  phases.mark('copy-production-modules');
  require('./ensure-asar-finished').ensureAsarFinished();const asar=require('@electron/asar');
  phases.mark('load-asar-tools');
  const missing=new Map(omitted.map(name=>[name,fs.readFileSync(path.join(payload,name))]));for(const name of omitted)fs.rmSync(path.join(payload,name));
  const broken=path.join(temporary,'missing.asar');await asar.createPackageWithOptions(payload,broken,{unpack:'{**/*.wasm,data/database/metadata-full.sql.gz}'});assert.throws(()=>checkArchive(broken),/Module local absent du paquet/);
  phases.mark('missing-module-asar');
  for(const [name,bytes]of missing)fs.writeFileSync(path.join(payload,name),bytes);const archive=path.join(temporary,'complete.asar');await asar.createPackageWithOptions(payload,archive,{unpack:'{**/*.wasm,data/database/metadata-full.sql.gz}'});assert(checkArchive(archive).files>100);
  phases.mark('complete-asar-and-integrity');
  for(const name of omitted){const files=new Set(asar.listPackage(archive).map(archiveName));files.delete(name);assert.throws(()=>localModules(files,name=>asar.extractFile(archive,path.normalize(name))),/Module local absent du paquet/);}
  const windowsFiles=new Map([['\\main.js',"require('./lib/entry')"],['\\lib\\entry.js','module.exports=true;']].map(([name,code])=>[archiveName(name),code]));assert.equal(localModules(new Set(windowsFiles.keys()),name=>windowsFiles.get(name)).size,2);windowsFiles.delete('lib/entry.js');assert.throws(()=>localModules(new Set(windowsFiles.keys()),name=>windowsFiles.get(name)),/lib\/entry/);
  const sample=new Map([['main.js',"require('./lib/entry')"],['lib/entry.js',"require('../public/nested')"],['lib/server-process.js',''],['lib/server-host.js','']]);assert.throws(()=>localModules(new Set(sample.keys()),name=>sample.get(name)),/public\/nested/);
  phases.mark('module-fixtures');
  const nonce=crypto.randomBytes(32).toString('hex'),profile=path.join(temporary,'alm69-profile-'+crypto.randomBytes(4).toString('hex'));fs.mkdirSync(profile);
  const electron=require('electron');assert.equal(typeof electron,'string');assert(fs.existsSync(electron),'Electron runtime absent; install dependencies with npm ci.');
  for(const phase of ['missing','seed','verify']){
   const flags=process.platform==='linux'?['--ozone-platform=headless',...(process.getuid?.()===0?['--no-sandbox']:[])]:[];
   const env={...process.env,ALM_PACKAGE_ARCHIVE:phase==='missing'?broken:archive,ALM_PACKAGE_PROFILE:profile,ALM_PACKAGE_PHASE:phase,ALM_PACKAGE_NONCE:nonce};for(const key of Object.keys(env))if(/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH)$/i.test(key))delete env[key];
   const result=await runCommand(electron,[...flags,path.join(__dirname,'test-beta69-engine-electron.cjs')],{cwd:temporary,timeoutMs:180000,env});assert.equal(result.code,0,result.output.slice(-12000));assert(result.output.includes('ALM_PACKAGE_ENGINE_OK'),result.output);console.log(result.output.split(/\r?\n/).find(line=>line.startsWith('ALM_PACKAGE_ENGINE_OK')));phases.mark('electron-'+phase);
  }
  const previous=process.env.ALM_CONFIG_KEY;process.env.ALM_CONFIG_KEY='CONTROLLED_PRIVATE_SECRET';
  try{
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.postMessage=()=>{child.stderr.write('module failure CONTROLLED_');child.stderr.write('PRIVATE_SECRET');child.emit('exit',7);};child.kill=()=>{};
   const engine=require('../lib/server-process').createServerProcess({fork(_file,_args,options){assert.equal(options.stdio,'pipe');return child;}});await assert.rejects(engine.startServer(0),error=>error.exitCode===7&&error.message.includes('[masqué]')&&!error.message.includes('CONTROLLED_PRIVATE_SECRET'));
  }finally{if(previous===undefined)delete process.env.ALM_CONFIG_KEY;else process.env.ALM_CONFIG_KEY=previous;}
  phases.mark('redacted-error-fixture');
  successMessage='OK Beta69 package: builder filtering, missing-module reproduction in Electron, ASAR dependency checks, actual Electron utility launches, catalogue/import/backup/persistence, protected session and redacted diagnostics. Native Windows EXE validation remains required.';
 }catch(error){testFailure=error;throw error;}finally{
  try{await removeBuildTree(temporary);phases.mark('cleanup');}catch(error){if(testFailure)throw new AggregateError([testFailure,error],'Test et nettoyage en echec');throw error;}
 }
 console.log(successMessage);console.log('[package-profile] summary '+JSON.stringify(phases.result()));
 console.log('OK nettoyage du dossier temporaire et fermeture des processus de test.');
})().catch(error=>{console.error(error);process.exitCode=1;});
