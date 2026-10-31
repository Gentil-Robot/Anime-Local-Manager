'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const U=require('./release-utils'),R=require('./release-windows'),{REQUIRED}=require('./check-source-files');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm58-release-'));
(async()=>{
 const workflow=require('js-yaml').load(fs.readFileSync(path.join(__dirname,'../.github/workflows/windows-installer.yml'),'utf8'));assert.equal(workflow.permissions.contents,'read');assert.equal(workflow.jobs.installer['runs-on'],'windows-latest');assert(workflow.jobs.installer.steps.some(step=>step.run?.includes('release-windows.js --ci')));assert(!JSON.stringify(workflow).includes('Portable-x64'));for(const step of workflow.jobs.installer.steps.filter(s=>s.uses))assert(/@[a-f0-9]{40}$/.test(step.uses),'Release actions must use immutable commits: '+step.uses);
 assert(!R.validNode('22.11.0'));assert(R.validNode('22.22.0'));assert(R.validNode('24.19.0'));
 assert.throws(()=>R.auditGate({total:1},{total:0}),/production/);assert.match(R.auditPackages({vulnerabilities:{qs:{severity:'moderate'},express:{severity:'high'}}}).join(', '),/qs \[moderate\]/);assert.throws(()=>R.auditGate({total:1,packages:['qs [moderate]']},{total:0}),/qs \[moderate\]/);assert.throws(()=>R.auditGate({total:0},{high:1,total:1}),/critique/);assert.equal(R.auditGate({total:0},{moderate:1,total:1}),'warning');assert.throws(()=>R.auditSummary({error:{message:'Offline'}},'test'),/indisponible/);assert.throws(()=>R.auditSummary({metadata:{vulnerabilities:{}}},'test'),/indisponible/);
 const output=await U.runCommand(process.execPath,['-e',`process.stderr.write('runtime warning\\n');process.stdout.write(JSON.stringify({ok:true}));`]);assert.equal(output.code,0);assert.deepEqual(JSON.parse(output.stdout),{ok:true});assert(output.stderr.includes('runtime warning'));
 const messages=[],log=U.logger(path.join(directory,'secret.log'),{env:{CSC_KEY_PASSWORD:'my-secret-password'},consoleOutput:line=>messages.push(line),heartbeatMs:10});log.begin('Construction');log.write('my-secret-password');await new Promise(r=>setTimeout(r,35));log.end('Construction');log.close();assert(messages.some(s=>s.includes('en cours')));assert(!fs.readFileSync(log.file,'utf8').includes('my-secret-password'));
 const pub=path.join(directory,'promotion');fs.mkdirSync(pub);const incoming=path.join(directory,'incoming');fs.mkdirSync(incoming);for(const name of ['app.exe','report.json']){fs.writeFileSync(path.join(pub,name),'old '+name);fs.writeFileSync(path.join(incoming,name),'new '+name);}let renamed=0;
 assert.throws(()=>U.promote(['app.exe','report.json'].map(n=>path.join(incoming,n)),pub,{rename:(from,to)=>{if(++renamed===3)throw Error('disk failure');fs.renameSync(from,to);}}),/disk failure/);assert.equal(fs.readFileSync(path.join(pub,'app.exe'),'utf8'),'old app.exe');assert.equal(fs.readFileSync(path.join(pub,'report.json'),'utf8'),'old report.json');
 assert.throws(()=>U.promote(['app.exe','report.json'].map(n=>path.join(incoming,n)),pub,{finalize:()=>{throw Error('report failure');}}),/report failure/);assert.equal(fs.readFileSync(path.join(pub,'app.exe'),'utf8'),'old app.exe');assert.equal(fs.readFileSync(path.join(pub,'report.json'),'utf8'),'old report.json');
 const root=path.join(directory,'project');fs.mkdirSync(root);const names=new Set([...REQUIRED,'data/database/metadata-full.sql.gz','data/database/metadata-manifest.json']);
 for(const name of names){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture '+name);}
 const pkg={name:'fixture',version:'2.0.0-beta.58',devDependencies:{electron:'44.1.1','electron-builder':'26.16.1'},build:{directories:{output:'dist'},nsis:{artifactName:'ALM-${version}-Setup-${arch}.${ext}'},executableName:'Anime Local Manager'}};U.atomicJson(path.join(root,'package.json'),pkg);U.atomicJson(path.join(root,'data/database/metadata-manifest.json'),{rows:30430});
 const modules=path.join(root,'node_modules/electron-builder');fs.mkdirSync(modules,{recursive:true});U.atomicJson(path.join(modules,'package.json'),{name:'electron-builder',version:'26.16.1'});fs.writeFileSync(path.join(modules,'cli.js'),'// fixture');
 function manifest(){U.atomicJson(path.join(root,'SOURCE-MANIFEST.json'),{schema:1,version:pkg.version,files:[...names].sort().map(name=>({path:name,bytes:fs.statSync(path.join(root,name)).size,sha256:U.fileHash(path.join(root,name))}))});}manifest();
 const nsisFixture=path.join(root,'node_modules/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh');fs.mkdirSync(path.dirname(nsisFixture),{recursive:true});fs.writeFileSync(nsisFixture,'; controlled NSIS include');
 const counts={install:0,verify:0,dir:0,nsis:0,smoke:0};let fail=false,prodAlert=false;
 const result=(code=0,output='')=>({code,output});
 const run=async(command,args,options)=>{
  if(args.includes('--version'))return result(0,'10.9.4');
  if(args.includes('ci')){counts.install++;return result();}
  if(args[0]?.endsWith(path.join('electron','install.js'))){const folder=path.join(root,'node_modules/electron');fs.mkdirSync(path.join(folder,'dist'),{recursive:true});fs.writeFileSync(path.join(folder,'dist/version'),pkg.devDependencies.electron);fs.writeFileSync(path.join(folder,'path.txt'),'electron.exe');fs.writeFileSync(path.join(folder,'dist/electron.exe'),'fictional runtime');return result();}
  if(args.includes('audit')){const stdout=JSON.stringify({metadata:{vulnerabilities:{info:0,low:0,moderate:prodAlert?1:0,high:0,critical:0,total:prodAlert?1:0}}});return {code:prodAlert?1:0,stdout,output:'runtime warning\n'+stdout};}
  if(args[0].endsWith('prepare-metadata-release.js'))return result();
  assert(args.includes('--win'));assert(!args.includes('portable'));const stage=options.cwd;
  if(args.includes('dir')){
   counts.dir++;const app=path.join(stage,'dist/win-unpacked'),payload=path.join(directory,'payload-'+counts.dir);fs.mkdirSync(payload);for(const name of ['main.js','preload.js','server.js','db.js','csv-worker.js','public/index.html']){const p=path.join(payload,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fixture '+counts.dir);}
   fs.mkdirSync(path.join(app,'resources'),{recursive:true});require('./ensure-asar-finished').ensureAsarFinished();await require('@electron/asar').createPackage(payload,path.join(app,'resources/app.asar'));fs.writeFileSync(path.join(app,'Anime Local Manager.exe'),'fake app '+counts.dir);return result();
  }
  counts.nsis++;if(fail)return result(9,'Invalid configuration');assert(args.includes('--prepackaged'));
  const bytes=Buffer.alloc(2048,counts.nsis);bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128);fs.writeFileSync(path.join(stage,'dist','ALM-'+pkg.version+'-Setup-x64.exe'),bytes);return result();
 };
 const verify=async({reportFile})=>{counts.verify++;const report={status:'passed',checks:[{status:'passed'}]};U.atomicJson(reportFile,report);return report;};
 const smoke=async()=>{counts.smoke++;return {application:{status:'passed'},installer:{status:'passed'}};};
 // Synthetic MZ/PE fixtures only: never invoke OS Authenticode on a fake EXE.
 // Real NSIS builds use checkArtifacts without injection and MUST verify signatures.
 const {checkArtifacts,signatures}=require('./check-windows-artifacts');
 const inspectFixture=(stage,targets)=>checkArtifacts(stage,targets,{
  checkSignatures:files=>files.map(()=>({status:'NotSigned',signer:null}))
 });
 const samplePath='C:\\build & test\\installer.exe';
 const observed=[];
 const unsigned=signatures([samplePath],{platform:'win32',run:(shell,args,options)=>{
  observed.push(shell);
  assert.equal(shell,'pwsh.exe');
  assert.equal(JSON.parse(options.env.ALM_RELEASE_FILES)[0],samplePath);
  assert(!args[3].includes(samplePath),'Executable code must never interpolate a file path');
  assert(args[3].includes('Get-AuthenticodeSignature'));
  return JSON.stringify([{status:'NotSigned',signer:null}]);
 }});
 assert.deepEqual(unsigned,[{status:'NotSigned',signer:null}]);assert.deepEqual(observed,['pwsh.exe']);
 const shellCalls=[];
 const fallback=signatures([samplePath],{platform:'win32',run:shell=>{
  shellCalls.push(shell);
  if(shell==='pwsh.exe'){const error=Error('pwsh not installed');error.code='ENOENT';throw error;}
  return JSON.stringify([{status:'Valid',signer:'CN=Fixture'}]);
 }});
 assert.deepEqual(fallback,[{status:'Valid',signer:'CN=Fixture'}]);assert.deepEqual(shellCalls,['pwsh.exe','powershell.exe']);
 assert.throws(()=>signatures([samplePath],{platform:'win32',run:()=>JSON.stringify([{status:'UnknownError'}])}),/Signature Windows invalide/);
 assert.throws(()=>signatures([samplePath],{platform:'win32',run:()=>JSON.stringify([])}),/incomplet/);
 const options={root,workspaceOptions:{platform:'fixture'},platform:'win32',run,verify,smoke,inspect:inspectFixture,consoleOutput:()=>{}};
 const first=await R.releaseWindows(options);assert.equal(first.status,'passed');assert.equal(counts.dir,1);assert.equal(counts.nsis,1);assert.equal(counts.verify,1);assert.equal(counts.install,1);
 const target=path.join(root,'dist','ALM-'+pkg.version+'-Setup-x64.exe'),original=U.fileHash(target);
 await R.releaseWindows({...options,resume:true});assert.equal(counts.dir,1);assert.equal(counts.nsis,1);assert.equal(counts.verify,1);assert.equal(counts.install,1);assert.equal(counts.smoke,2,'Native checks are never silently skipped on resume');
 const runDir=fs.readdirSync(first.workspace.directory).find(name=>/^[a-f0-9]{20}$/.test(name)),stage=path.join(first.workspace.directory,runDir,'project');
 fs.writeFileSync(path.join(stage,'dist','ALM-'+pkg.version+'-Setup-x64.exe'),'corrupt');await R.releaseWindows({...options,resume:true});assert.equal(counts.nsis,2);assert.equal(counts.dir,1);
 fs.appendFileSync(path.join(stage,'dist/win-unpacked/Anime Local Manager.exe'),'modified');await R.releaseWindows({...options,resume:true});assert.equal(counts.dir,2);assert.equal(counts.nsis,3);
 const beforeFailure=U.fileHash(target);fs.appendFileSync(path.join(root,'main.js'),' changed');manifest();fail=true;await assert.rejects(R.releaseWindows({...options,resume:true}),/Construction interrompue/);assert.equal(U.fileHash(target),beforeFailure,'Failed build preserves previous deliverable');const prepared=counts.dir;fail=false;await R.releaseWindows({...options,resume:true});assert.equal(counts.dir,prepared,'Interrupted NSIS resumes without repackaging verified application');
 prodAlert=true;const safe=U.fileHash(target);await assert.rejects(R.releaseWindows({...options,resume:true}),/production/);assert.equal(U.fileHash(target),safe);prodAlert=false;
 await assert.rejects(R.releaseWindows({...options,platform:'linux'}),/requiert Windows/);
 const native=JSON.parse(fs.readFileSync(path.join(root,'dist/release-check.json')));assert(native.tools.node);assert(native.source.manifestSha256);assert.equal(native.artifacts.length,1);assert.equal(native.artifacts[0].target,'nsis');assert(native.smoke.installer.status==='passed');assert(native.steps.some(s=>s.name==='smoke'));assert(native.steps.some(s=>s.name==='promotion'&&s.status==='passed'));
 const dependencyFile=path.join(first.workspace.directory,'dependencies.json'),dependencyState=JSON.parse(fs.readFileSync(dependencyFile));dependencyState.arch='different-architecture';U.atomicJson(dependencyFile,dependencyState);const installedCount=counts.install;await R.releaseWindows({...options,resume:true});assert.equal(counts.install,installedCount+1,'Different dependency toolchain is not silently reused');
 const certificate=process.env.CSC_LINK;try{process.env.CSC_LINK='fixture-certificate';const previousHash=U.fileHash(target);await assert.rejects(R.releaseWindows({...options,resume:true}),/signature Windows valide/);assert.equal(U.fileHash(target),previousHash);}finally{if(certificate===undefined)delete process.env.CSC_LINK;else process.env.CSC_LINK=certificate;}
 console.log('OK Beta58 release: quiet heartbeat/log redaction, audit gates, atomic rollback, NSIS-only preparation, verified resume, corrupt cache rejection, failed-build preservation, same-input verification reuse and source-change invalidation. Build/PE/native steps are controlled fixtures.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200}));
