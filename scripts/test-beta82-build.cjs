'use strict';
// Build-only regression tests. Native Windows/NSIS execution is not asserted here.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const W=require('./release-workspace'),C=require('./build-cleanup'),U=require('./release-utils');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-build-'));
let count=0;
const ok=name=>{count++;console.log('OK build82: '+name);};
const write=(file,content)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
async function main(){
 const projectPkg=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
 assert(projectPkg.build.files.includes('!public/assets/alm-clip-complet-1080p.mp4'));
 assert(projectPkg.build.extraResources.some(x=>x.from==='public/assets/alm-clip-complet-1080p.mp4'&&x.to==='alm-media/alm-clip-complet-1080p.mp4'));
 assert(!projectPkg.build.asarUnpack.includes('public/assets/*.mp4'));
 assert.deepEqual(projectPkg.build.nsis.preCompressedFileExtensions,[]);
 ok('large video is a distinct NSIS resource with a safe media path');
 const windows=path.win32;
 const original='C:\\Users\\TestUser\\Downloads\\Anime-Local-Manager-Beta82-Reprise81-Prepublication-Correctif-Build\\Anime-Local-Manager-Beta82-Reprise81-Prepublication';
 const originalInclude=windows.join(original,'.release-work','687257dd68f927609e96','project',...W.NSIS_INCLUDE.split('/'));
 assert.equal(originalInclude.length,276);ok('reported 276-character NSIS path reproduced');
 const settings={platform:'win32',paths:windows,env:{LOCALAPPDATA:'C:\\Users\\TestUser\\AppData\\Local'},home:'C:\\Users\\TestUser',temporary:'C:\\Users\\TestUser\\AppData\\Local\\Temp'};
 const candidates=W.workspaceCandidates(original,settings);assert(candidates.length>=2);
 for(const directory of candidates)assert(W.projectedNsisPath(directory,windows).length<=W.PATH_BUDGET);
 assert(!candidates[0].startsWith(original));ok('automatic short workspace does not depend on extraction depth');
 assert.deepEqual(W.workspaceCandidates(original.toUpperCase(),settings),candidates);ok('case-insensitive Windows identity and stable resume location');
 assert.notDeepEqual(W.workspaceCandidates(original+'-other',settings),candidates);ok('separate source copies never share their compilation cache');
 assert(W.workspaceCandidates(original,{...settings,env:{}})[0].startsWith(settings.home));ok('profile fallback without LOCALAPPDATA');
 assert.equal(W.workspaceCandidates(original,{...settings,env:{LOCALAPPDATA:'C:\\'+'x'.repeat(220)},home:'C:\\'+'x'.repeat(220),temporary:'C:\\'+'x'.repeat(220)}).length,0);ok('no overlong cache accepted silently');
 assert.deepEqual(W.workspaceCandidates('/source',{platform:'linux',paths:path.posix}),['/source/.release-work']);ok('Linux workspace unchanged');
 const source=path.join(temporary,'nested-'+ 's'.repeat(95),'deep-'+ 't'.repeat(95),'source');
 fs.mkdirSync(source,{recursive:true});write(path.join(source,'personal-sentinel.txt'),'keep');
 const cacheOptions={platform:'win32',env:{LOCALAPPDATA:path.join(temporary,'cache')},home:temporary,temporary};
 const workspace=W.openWorkspace(source,cacheOptions);assert(workspace.external);assert(!workspace.directory.startsWith(source));
 assert(fs.existsSync(path.join(source,'.release-work/workspace.json')));ok('real filesystem workspace and source-side locator created');
 assert.throws(()=>W.openWorkspace(source,cacheOptions),/publication utilise deja/);ok('concurrent build rejected without terminating another process');
 workspace.release();const reopened=W.openWorkspace(source,cacheOptions);assert.equal(reopened.directory,workspace.directory);reopened.release();
 assert.equal(fs.readFileSync(path.join(source,'personal-sentinel.txt'),'utf8'),'keep');ok('resume reuses workspace and leaves original files untouched');
 const stage=path.join(workspace.directory,'f'.repeat(20),'project'),include=path.join(stage,...W.NSIS_INCLUDE.split('/'));
 assert.throws(()=>W.assertNsisInputs(stage,{version:'2.0.0-beta.82'},{platform:'win32'}),/absent ou illisible/);ok('missing NSIS include rejected before compiler launch');
 write(include,'');assert.throws(()=>W.assertNsisInputs(stage,{version:'2.0.0-beta.82'}),/absent ou illisible/);ok('empty NSIS input rejected');
 write(include,'; controlled fixture');assert(W.assertNsisInputs(stage,{version:'2.0.0-beta.82'},{platform:'win32'}).includePathLength<=230);ok('existing readable NSIS input and short uninstaller output validated');
 assert.throws(()=>W.assertNsisInputs(source,{version:'2.0.0-beta.82'},{platform:'win32'}),/Chemin NSIS trop long/);ok('native path budget checked independently of filesystem existence');
 const owner=path.join(workspace.directory,'workspace-owner.json');const savedOwner=fs.readFileSync(owner);write(owner,JSON.stringify({schema:1,source:'another source'}));
 const fallback=W.openWorkspace(source,cacheOptions);assert.notEqual(fallback.directory,workspace.directory);fallback.release();fs.writeFileSync(owner,savedOwner);ok('foreign workspace ownership is never overwritten');
 const lockdir=path.join(temporary,'locks');fs.mkdirSync(lockdir);write(path.join(lockdir,'publication.lock'),JSON.stringify({schema:1,pid:2147483647,token:'stale'}));
 const unlock=W.acquireLock(lockdir);unlock();assert(!fs.existsSync(path.join(lockdir,'publication.lock')));ok('stale lock from a terminated process recovered');
 let attempts=0;const waits=[];
 await C.removeBuildTree('fixture',{remove:async()=>{if(++attempts<3)throw Object.assign(Error('busy'),{code:'EBUSY'});},wait:async n=>waits.push(n)});
 assert.equal(attempts,3);assert.deepEqual(waits,[200,400]);ok('temporary EBUSY retried asynchronously with bounded backoff');
 attempts=0;await assert.rejects(C.removeBuildTree('fixture',{attempts:3,remove:async()=>{attempts++;throw Object.assign(Error('locked'),{code:'EBUSY'});},wait:async()=>{}}),e=>e.code==='EBUSY'&&e.message.includes('erreur non ignoree'));assert.equal(attempts,3);ok('permanent lock remains a real failed test');
 attempts=0;await assert.rejects(C.removeBuildTree('fixture',{remove:async()=>{attempts++;throw Object.assign(Error('access'),{code:'EACCES'});},wait:async()=>{throw Error('unexpected retry');}}),e=>e.code==='EACCES');assert.equal(attempts,1);ok('unrelated filesystem errors never swallowed or endlessly retried');
 const cleanup=path.join(temporary,'remove');write(path.join(cleanup,'nested/file'),'x');await C.removeBuildTree(cleanup);assert(!fs.existsSync(cleanup));ok('actual recursive cleanup completes');
 const child=new EventEmitter();let kills=0;child.kill=()=>{kills++;setTimeout(()=>child.emit('exit',0),15);};
 const observer=C.observeUtility(child);let ended=false;const stopping=observer.stop().then(()=>{ended=true;});assert(!ended);await stopping;await observer.stop();assert.equal(kills,1);ok('cleanup waits for owned Electron utility exit and stop is idempotent');
 const early=new EventEmitter();early.kill=()=>{throw Error('already stopped');};const earlyObserver=C.observeUtility(early);early.emit('exit',1);await earlyObserver.stop();ok('already-exited missing-module test is handled correctly');
 const stuck=new EventEmitter();stuck.kill=()=>false;await assert.rejects(C.observeUtility(stuck).stop(15),/ne se ferme pas/);ok('utility shutdown timeout fails instead of pretending success');
 // A long source-side destination must not depend on mkdtempSync's
 // Win32 prefix-length behavior. Exercise a real publication-side promotion.
 const incoming=path.join(temporary,'promotion-source/ALM-Setup.exe');write(incoming,'fixture installer');
 const promotionDir=path.join(source,'promotion-probe');
 const originalMkdtemp=fs.mkdtempSync;
 fs.mkdtempSync=()=>{throw Error('legacy mkdtempSync called during promotion');};
 try{U.promote([incoming],promotionDir);}finally{fs.mkdtempSync=originalMkdtemp;}
 assert.equal(fs.readFileSync(path.join(promotionDir,'ALM-Setup.exe'),'utf8'),'fixture installer');
 assert(!fs.readdirSync(promotionDir).some(name=>name.startsWith('.publication-')));
 ok('deep Windows publication directory uses atomic mkdir instead of mkdtemp');
 await pipelineFixture(source,cacheOptions);
 const project=path.resolve(__dirname,'..');
 for(const name of ['Publier Installateur Windows.bat','REPRENDRE_BUILD_WINDOWS.bat']){
  const text=fs.readFileSync(path.join(project,name),'utf8');assert(text.startsWith('@echo off\r\n'));assert(text.includes('node scripts\\release-windows.js --resume'));assert(text.includes('cd /d "%~dp0"'));assert(text.includes('DisableDelayedExpansion'));
 }
 ok('same publish/resume buttons, automatic resume and quoted source directory');
 const plan=JSON.parse(fs.readFileSync(path.join(project,'scripts/verification-plan.json'),'utf8'));assert(plan.steps.includes('scripts/test-beta82-build.cjs'));assert(plan.steps.includes('scripts/test-beta69-package.cjs'));assert(plan.steps.includes('scripts/test-beta71-package.cjs'));ok('new regression gate added without removing previous package tests');
 console.log(count+' build82 checks passed. Native Windows/NSIS execution still requires Windows.');
}
async function pipelineFixture(longRoot,workspaceOptions){
 const root=path.join(longRoot,'pipeline');fs.mkdirSync(root);
 const {REQUIRED}=require('./check-source-files');
 const files=new Set([...REQUIRED,'data/database/metadata-full.sql.gz','data/database/metadata-manifest.json']);
 for(const name of files)write(path.join(root,name),'fixture '+name);
 const pkg={name:'fixture',version:'2.0.0-beta.82',devDependencies:{electron:'45.2.1','electron-builder':'26.16.1'},build:{directories:{output:'dist'},nsis:{artifactName:'ALM-${version}-Setup-${arch}.${ext}'},executableName:'Anime Local Manager'}};
 write(path.join(root,'package.json'),JSON.stringify(pkg));write(path.join(root,'data/database/metadata-manifest.json'),'{}');
 write(path.join(root,'node_modules/electron-builder/package.json'),JSON.stringify({name:'electron-builder',version:'26.16.1'}));write(path.join(root,'node_modules/electron-builder/cli.js'),'// fixture');
 write(path.join(root,...W.NSIS_INCLUDE.split('/')),'; fixture include');
 function manifest(){U.atomicJson(path.join(root,'SOURCE-MANIFEST.json'),{schema:1,version:pkg.version,files:[...files].sort().map(name=>({path:name,bytes:fs.statSync(path.join(root,name)).size,sha256:U.fileHash(path.join(root,name))}))});}manifest();
 // Test real staging, hashes, checkpoints and promotion; only compiler/native operations are fixtures.
 const file=path.join(__dirname,'release-windows.js'),module={exports:{}},here=createRequire(file);
 const checker={checkArchive:archive=>{assert(fs.existsSync(archive));return {fixture:true};}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:name=>name==='./check-packaged-integrity'?checker:here(name),module,exports:module.exports,__dirname,__filename:file,console,process},{filename:file});
 const R=module.exports,counts={install:0,runtime:0,verify:0,dir:0,nsis:0,smoke:0};let failNsis=true,failRuntime=false;
 const run=async(command,args,options)=>{
  if(args.includes('--version'))return {code:0,output:'10.9.8'};
  if(args.includes('ci')){counts.install++;return {code:0,output:''};}
  if(args[0]?.endsWith(path.join('electron','install.js'))){counts.runtime++;assert(!options.env.ELECTRON_SKIP_BINARY_DOWNLOAD);if(process.env.ELECTRON_CACHE)assert.equal(options.env.electron_config_cache,process.env.electron_config_cache||path.resolve(process.env.ELECTRON_CACHE));if(failRuntime)return {code:9,output:'Controlled runtime preparation failure'};write(path.join(root,'node_modules/electron/dist/version'),pkg.devDependencies.electron);write(path.join(root,'node_modules/electron/path.txt'),'electron.exe');write(path.join(root,'node_modules/electron/dist/electron.exe'),'fixture runtime');return {code:0,output:''};}
  if(args.includes('audit')){const text=JSON.stringify({metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0,total:0}}});return {code:0,output:text,stdout:text};}
  if(args[0].endsWith('prepare-metadata-release.js'))return {code:0,output:''};
  assert(args.includes('--win'));assert(!options.cwd.startsWith(root));
  if(args.includes('dir')){counts.dir++;write(path.join(options.cwd,'dist/win-unpacked/resources/app.asar'),'fixture archive');write(path.join(options.cwd,'dist/win-unpacked/Anime Local Manager.exe'),'fixture exe');return {code:0,output:''};}
  assert(args.includes('nsis'));counts.nsis++;
  if(failNsis)return {code:1,output:'Controlled compiler failure'};
  write(path.join(options.cwd,'dist/ALM-'+pkg.version+'-Setup-x64.exe'),'fixture installer '+counts.nsis);return {code:0,output:''};
 };
 const verify=async({reportFile,logFile})=>{assert(R.electronRuntimeReady(root,pkg.devDependencies.electron,'win32'),'Runtime must be ready before tests');counts.verify++;const value={status:'passed',checks:[{status:'passed'}]};U.atomicJson(reportFile,value);write(logFile,'fixture verification');return value;};
 const smoke=async()=>{counts.smoke++;return {application:{status:'passed'},installer:{status:'passed'}};};
 const options={root,platform:'win32',workspaceOptions,run,verify,smoke,inspect:()=>({artifacts:[{target:'nsis',signature:{status:'NotSigned'}}]}),resume:true,consoleOutput:()=>{}};
 const target=path.join(root,'dist/ALM-'+pkg.version+'-Setup-x64.exe');write(target,'previous installer');
 const priorOverride=process.env.ELECTRON_OVERRIDE_DIST_PATH;try{process.env.ELECTRON_OVERRIDE_DIST_PATH='fictional-external-runtime';await assert.rejects(R.releaseWindows(options),/ELECTRON_OVERRIDE_DIST_PATH/);assert.equal(counts.install,0);ok('external runtime override cannot invalidate the tested-engine evidence');}finally{if(priorOverride===undefined)delete process.env.ELECTRON_OVERRIDE_DIST_PATH;else process.env.ELECTRON_OVERRIDE_DIST_PATH=priorOverride;}
 await assert.rejects(R.releaseWindows(options),/Construction interrompue/);assert.equal(fs.readFileSync(target,'utf8'),'previous installer');assert.equal(counts.verify,1);ok('NSIS failure preserves previous installer and verified checkpoint');
 assert(fs.existsSync(path.join(root,'logs/verification.log')));assert(!fs.existsSync(path.join(root,'.release-work/publication.lock')));ok('verification diagnostics copied back and build lock released on failure');
 failNsis=false;const first=await R.releaseWindows(options);assert.equal(first.status,'passed');
 assert(Number.isFinite(first.wallDurationMs)&&first.wallDurationMs>=0);
 assert(Number.isFinite(first.stepsTotalMs)&&first.stepsTotalMs>=0);
 assert(Number.isFinite(first.unattributedMs)&&first.unattributedMs>=0);
 for(const name of ['sourceIntegrityMs','workspaceMs','npmVersionMs','fingerprintMs','stageAndIntegrityMs','nsisPreflightMs'])assert(Number.isFinite(first.preparationTimings[name]),name+' should be measured');
 const completedReport=JSON.parse(fs.readFileSync(path.join(root,'dist/release-check.json'),'utf8'));
 assert.equal(completedReport.steps.length,first.steps.length,'delivery must include completed promotion step');
 assert.equal(completedReport.unattributedMs,first.unattributedMs,'delivered overhead must match verified run');assert.equal(counts.verify,1);assert.equal(counts.install,1);assert.equal(counts.runtime,1);assert.equal(counts.dir,1);assert.equal(counts.smoke,1);assert(first.workspace.external);ok('resume skips already verified source/dependency steps after compiler failure');
 assert(fs.readFileSync(target,'utf8').startsWith('fixture installer'));assert(fs.existsSync(path.join(root,'dist/release-check.json')));ok('installer and report promoted atomically to original dist directory');
 const builds=counts.nsis;await R.releaseWindows(options);assert.equal(counts.nsis,builds);assert.equal(counts.smoke,2);ok('unchanged build reused but native smoke gate still requested');
 const marker=JSON.parse(fs.readFileSync(path.join(root,'.release-work/workspace.json')));const runDirectory=fs.readdirSync(marker.directory).find(name=>/^[a-f0-9]{20}$/.test(name));
 const checkpointFile=path.join(marker.directory,runDirectory,'state.json'),checkpoint=JSON.parse(fs.readFileSync(checkpointFile));
 const dependencyMarker=JSON.parse(fs.readFileSync(path.join(marker.directory,'dependencies.json')));assert.equal(dependencyMarker.digest,U.treeManifest(path.join(root,'node_modules'),{allowLinks:true}).digest);assert(R.electronRuntimeReady(path.join(marker.directory,runDirectory,'project'),pkg.devDependencies.electron,'win32'));ok('prepared runtime is captured in the dependency marker and staging');
 write(checkpoint.steps.nsis.path,'tampered');await R.releaseWindows(options);assert.equal(counts.nsis,builds+1);ok('modified cached installer is rebuilt, not delivered silently');
 fs.appendFileSync(path.join(root,'main.js'),' source change');manifest();await R.releaseWindows(options);assert.equal(counts.verify,2);ok('source modification invalidates verification cache');
 fs.appendFileSync(path.join(root,'node_modules/electron-builder/cli.js'),' dependency change');await R.releaseWindows(options);assert.equal(counts.verify,3);ok('dependency-tree modification invalidates verification cache');
 const previousInstaller=U.fileHash(target),previousVerify=counts.verify;fs.rmSync(path.join(root,'node_modules/electron/dist/electron.exe'));failRuntime=true;await assert.rejects(R.releaseWindows(options),/Préparation du binaire Electron impossible/);assert.equal(counts.verify,previousVerify);assert.equal(U.fileHash(target),previousInstaller);ok('missing runtime is prepared before verification and failure preserves the previous installer');
 failRuntime=false;await R.releaseWindows(options);assert(R.electronRuntimeReady(root,pkg.devDependencies.electron,'win32'));ok('runtime preparation can resume after a failure without skipping verification');
 const limited=await R.releaseWindows({...options,smoke:async()=>({application:{status:'passed'},installer:{status:'not-run'}})});assert.equal(limited.status,'passed-with-limitations');assert(limited.limitations.some(text=>text.includes('reste à exécuter')));assert(!limited.limitations.some(text=>text.includes('elle est testée sur le runner')));ok('an unexecuted installer check is reported as still required');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>C.removeBuildTree(temporary)).catch(error=>{console.error(error);process.exitCode=1;});
