'use strict';
const fs=require('node:fs'),path=require('node:path');
const U=require('./release-utils'),{checkSource}=require('./check-source-files');
const {runWithRetry,buildCommand}=require('./build-windows-retry');
const {openWorkspace,assertNsisInputs}=require('./release-workspace');
const {removeBuildTree}=require('./build-cleanup');
const {verifyProject}=require('./verify-project'),{checkArtifacts,artifactPaths}=require('./check-windows-artifacts');
const labels={dependencies:'Dépendances verrouillées',audit:'Audit des dépendances',verification:'Vérification du projet',metadata:'Catalogue embarqué',unpacked:'Préparation commune de l’application',nsis:'Construction de l’installateur',smoke:'Essai réel de démarrage et persistance',promotion:'Validation et livraison'};
const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
function validNode(version=process.versions.node){const [major,minor]=version.split('.').map(Number);return major>22||major===22&&minor>=12;}
function signingPolicy(env=process.env){return {requested:!!(env.CSC_LINK||env.WIN_CSC_LINK||env.CSC_NAME||env.WIN_CSC_NAME),required:env.ALM_REQUIRE_SIGNED_RELEASE==='1',publisher:env.ALM_SIGNER_SUBJECT||''};}
function auditSummary(value,scope){const counts=value?.metadata?.vulnerabilities,levels=['info','low','moderate','high','critical'];if(!counts||value.error||![...levels,'total'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0)||counts.total!==levels.reduce((sum,k)=>sum+counts[k],0))throw Error('Audit '+scope+' indisponible : '+(value?.error?.message||'réponse invalide'));return {scope,status:'checked',...counts};}
function auditGate(prod,all){
 const details=(scope)=>scope.packages?.length?' ('+scope.packages.join(', ').slice(0,500)+')':'';
 if(prod.total>0)throw Error('Audit : vulnérabilité déclarée dans les dépendances de production'+details(prod)+'.');
 if(all.high||all.critical)throw Error('Audit : vulnérabilité élevée ou critique dans les outils de construction'+details(all)+'.');
 return all.total?'warning':'passed';
}
function auditPackages(value){
 if(!value?.vulnerabilities||typeof value.vulnerabilities!=='object')return [];
 const severities=new Set(['info','low','moderate','high','critical']);
 return Object.entries(value.vulnerabilities).filter(([,v])=>v&&typeof v==='object').map(([name,v])=>{
  const safeName=String(name).replace(/[^a-zA-Z0-9@/_.-]/g,'').slice(0,90);
  const severity=severities.has(v.severity)?v.severity:'unknown';
  return safeName+' ['+severity+']';
 }).filter(Boolean).sort().slice(0,30);
}
function sourceStage(root,directory,source){
 fs.mkdirSync(directory,{recursive:true});
 for(const entry of source.files){const target=path.join(directory,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,entry.path),target);}
 fs.copyFileSync(path.join(root,'SOURCE-MANIFEST.json'),path.join(directory,'SOURCE-MANIFEST.json'));
 // npm list treats a linked node_modules root as linked packages and loses their
 // hoisted dependencies. electron-builder then silently omits those dependencies.
 fs.cpSync(path.join(root,'node_modules'),path.join(directory,'node_modules'),{recursive:true,verbatimSymlinks:true});
}
function stagedDependenciesValid(directory,digest){
 try{const modules=path.join(directory,'node_modules');return !fs.lstatSync(modules).isSymbolicLink()&&fs.statSync(modules).isDirectory()&&U.treeManifest(modules,{allowLinks:true}).digest===digest;}catch{return false;}
}

function stagedSourceValid(directory,source){
 const generated=new Set(['data/database/metadata-manifest.json','data/database/metadata-bundled-status.json']);
 for(const entry of source.files){if(generated.has(entry.path))continue;try{if(U.fileHash(path.join(directory,entry.path))!==entry.sha256)return false;}catch{return false;}}
 return true;
}
function electronRuntimeReady(root,version,platform=process.platform){
 try{
  const directory=path.join(root,'node_modules/electron'),binary=platform==='win32'?'electron.exe':platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron';
  return fs.readFileSync(path.join(directory,'dist/version'),'utf8').trim().replace(/^v/,'')===version&&fs.readFileSync(path.join(directory,'path.txt'),'utf8').trim()===binary&&fs.statSync(path.join(directory,'dist',binary)).isFile();
 }catch{return false;}
}
async function releaseWindows({root=path.resolve(__dirname,'..'),resume=false,installerSmoke=false,verifyOnly=false,verbose=false,signal,platform=process.platform,run=U.runCommand,verify=verifyProject,smoke,inspect=checkArtifacts,consoleOutput=console.log,now=Date.now,workspaceOptions}={}){
 if(!validNode())throw Error('Node.js 22.12 minimum requis ; la version de construction validée est indiquée dans .node-version.');
 if(platform!=='win32'&&!verifyOnly)throw Error('Cette publication requiert Windows pour tester le livrable réel. Utiliser GitHub Actions ou la VM Windows.');
 if(process.env.ELECTRON_OVERRIDE_DIST_PATH)throw Error('ELECTRON_OVERRIDE_DIST_PATH doit être retiré pour vérifier le moteur Electron verrouillé du projet.');
 const sourceStart=now();
 const checked=checkSource(root);if(!checked.ok)throw Error('Archive modifiée ou incomplète : '+checked.issues.slice(0,3).join('; '));
 const sourceIntegrityMs=now()-sourceStart;
 const pkg=read(path.join(root,'package.json'));let work,workspace;fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-'),log=U.logger(path.join(root,'logs','publication-'+stamp+'.log'),{consoleOutput});
 const report={schema:2,version:pkg.version,status:'running',startedAt:new Date(sourceStart).toISOString(),target:'nsis',steps:[],
  preparationTimings:{sourceIntegrityMs},
  limitations:['Les audits npm ne couvrent pas toutes les vulnérabilités des binaires Electron/Chromium.']};
 const reportFile=path.join(root,'logs','publication-'+stamp+'.json');let checkpoint,checkpointFile,stage;
 const save=()=>{if(checkpointFile)U.atomicJson(checkpointFile,checkpoint);U.atomicJson(reportFile,report);};
 const step=async(name,fn)=>{if(signal?.aborted)throw Error('Publication annulée');const start=now();log.begin(labels[name]);try{const result=await fn();report.steps.push({name,status:'passed',durationMs:now()-start});log.end(labels[name]);save();return result;}catch(error){report.steps.push({name,status:signal?.aborted?'cancelled':'failed',durationMs:now()-start,error:error.message});log.end(labels[name],'ÉCHEC');save();throw error;}};
 const execute=async(command,args,cwd,options={})=>{if(signal?.aborted)throw Error('Publication annulée');return run(command,args,{cwd,log,verbose,signal,...options});};
 const npm=async(args,cwd=root)=>{const invocation=U.npmInvocation(args);return execute(invocation.command,invocation.args,cwd,{timeoutMs:10*60*1000,env:{...process.env,ELECTRON_SKIP_BINARY_DOWNLOAD:'1'}});};
 try{
  const workspaceAt=now();workspace=openWorkspace(root,workspaceOptions);work=workspace.directory;report.workspace={directory:work,external:workspace.external};report.preparationTimings.workspaceMs=now()-workspaceAt;
  log.say('Espace de compilation : '+work+' ; sources et livrables conserves dans le dossier d origine.');
  const npmVersionAt=now();const npmVersion=(await npm(['--version'])).output.trim().split(/\r?\n/).find(line=>/^\d+\.\d+\.\d+$/.test(line));if(!npmVersion||Number(npmVersion.split('.')[0])<10)throw Error('npm 10 minimum requis.');report.preparationTimings.npmVersionMs=now()-npmVersionAt;
  report.tools={node:process.versions.node,npm:npmVersion,electron:pkg.devDependencies.electron,builder:pkg.devDependencies['electron-builder'],platform,arch:process.arch};log.say('Node '+report.tools.node+' · npm '+npmVersion+' · Electron '+report.tools.electron+' · NSIS uniquement');
  await step('dependencies',async()=>{
   const markerFile=path.join(work,'dependencies.json'),marker=read(markerFile,{}),lock=U.fileHash(path.join(root,'package-lock.json'));let current;
   if(resume&&marker.lock===lock&&marker.node===process.versions.node&&marker.npm===npmVersion&&marker.platform===platform&&marker.arch===process.arch&&fs.existsSync(path.join(root,'node_modules')))current=U.treeManifest(path.join(root,'node_modules'),{allowLinks:true}).digest;
   if(current&&current===marker.digest&&electronRuntimeReady(root,pkg.devDependencies.electron,platform)){log.say('Dépendances inchangées et vérifiées : installation réutilisée.');return;}
   const result=await npm(['ci','--no-audit','--no-fund']);if(result.code!==0)throw Error('Installation des dépendances impossible. '+result.output.slice(-1500));
   // Electron 45 can install lazily on its first require(). Prepare it before
   // hashing/staging node_modules so verification cannot mutate a saved marker.
   const runtimeEnv={...process.env};delete runtimeEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;if(process.env.ELECTRON_CACHE&&!runtimeEnv.electron_config_cache)runtimeEnv.electron_config_cache=path.resolve(process.env.ELECTRON_CACHE);
   let runtimeResult;const runtimeCode=await runWithRetry(async()=>runtimeResult=await execute(process.execPath,[path.join(root,'node_modules/electron/install.js')],root,{timeoutMs:10*60*1000,env:runtimeEnv}),{log:log.say,cancelled:()=>signal?.aborted});
   if(runtimeCode!==0||!electronRuntimeReady(root,pkg.devDependencies.electron,platform))throw Error('Préparation du binaire Electron impossible. '+(runtimeResult?.output||'Version ou fichiers du moteur invalides.').slice(-1500));
   const tree=U.treeManifest(path.join(root,'node_modules'),{allowLinks:true});U.atomicJson(markerFile,{lock,node:process.versions.node,npm:npmVersion,platform,arch:process.arch,digest:tree.digest});
   const deprecated=[...new Set([...result.output.matchAll(/deprecated\s+([^\s:@]+(?:\/[^\s:@]+)?)/g)].map(m=>m[1]))];report.deprecated=deprecated;if(deprecated.length)log.say('Dépendances indirectes dépréciées : '+deprecated.join(', ')+'. Détail conservé dans le journal.');
  });
  const fingerprintAt=now();const input=U.inputFingerprint(root,report.tools,signingPolicy()),key=input.key,runDir=path.join(work,key.slice(0,20));report.preparationTimings.fingerprintMs=now()-fingerprintAt;checkpointFile=path.join(runDir,'state.json');checkpoint=resume?read(checkpointFile,{schema:1,key,steps:{}}):{schema:1,key,steps:{}};
  if(checkpoint.key!==key)throw Error('État de reprise incompatible.');fs.mkdirSync(runDir,{recursive:true});stage=path.join(runDir,'project');
  const stageAt=now();const dependencyDigest=read(path.join(work,'dependencies.json'),{}).digest;
  if(!fs.existsSync(stage)||!resume||!stagedSourceValid(stage,input.source)||!stagedDependenciesValid(stage,dependencyDigest)){
   await removeBuildTree(stage);sourceStage(root,stage,input.source);
   if(!stagedDependenciesValid(stage,dependencyDigest))throw Error('Copie des dépendances de construction incomplète ou modifiée.');
   delete checkpoint.steps.unpacked;delete checkpoint.steps.nsis;delete checkpoint.steps.smoke;
  }
  report.preparationTimings.stageAndIntegrityMs=now()-stageAt;
  const preflightAt=now();if(!verifyOnly&&platform==='win32'){report.nsisPreflight=assertNsisInputs(stage,pkg,{platform});log.say('Controle prealable NSIS : fichier present, chemin de '+report.nsisPreflight.includePathLength+' caracteres.');}
  report.preparationTimings.nsisPreflightMs=now()-preflightAt;
  log.say('[publication] Preparation hors etapes : '+JSON.stringify(report.preparationTimings));
  report.source={manifestSha256:input.manifestSha256,files:input.source.files.length,buildFingerprint:key};
  await step('audit',async()=>{const reports={};for(const scope of ['production','outillage']){const result=await npm(['audit','--json','--package-lock-only',...(scope==='production'?['--omit=dev']:[])],root);let data;try{data=JSON.parse(result.stdout??result.output);}catch{throw Error('Réponse de l’audit illisible. Consulter le journal.');}reports[scope]=auditSummary(data,scope);reports[scope].packages=auditPackages(data);if(reports[scope].packages.length)log.say('Alertes audit '+scope+' : '+reports[scope].packages.join(', '));if(result.code!==0&&(result.code!==1||!reports[scope].total))throw Error('Commande d’audit échouée. Consulter le journal.');U.atomicJson(path.join(runDir,'audit-'+scope+'.json'),data);}report.audit=reports;report.audit.status=auditGate(reports.production,reports.outillage);log.say('Audit production : '+reports.production.total+' alerte(s) ; outillage : '+reports.outillage.total+' alerte(s).');});
  await step('verification',async()=>{const previous=checkpoint.steps.verification;
   if(resume&&previous?.status==='passed'&&previous.key===key&&previous.dependencyDigest===dependencyDigest&&previous.report&&U.verifiedFile(previous.report)){report.verification=read(previous.report.path);log.say('Tests déjà réussis pour ces mêmes sources et outils.');return;}
   const file=path.join(runDir,'verification.json');try{report.verification=await verify({root,reportFile:file,logFile:path.join(runDir,'verification.log'),verbose,signal,consoleOutput});}finally{for(const name of ['verification.log','verification.json']){const origin=path.join(runDir,name);if(fs.existsSync(origin))fs.copyFileSync(origin,path.join(root,'logs',name));}}checkpoint.steps.verification={status:'passed',key,dependencyDigest,report:{path:file,bytes:fs.statSync(file).size,sha256:U.fileHash(file)}};
  });
  await step('metadata',async()=>{const result=await execute(process.execPath,[path.join(stage,'scripts/prepare-metadata-release.js')],stage,{timeoutMs:120000});if(result.code!==0)throw Error('Catalogue embarqué non vérifié. '+result.output.slice(-1000));const manifest=read(path.join(stage,'data/database/metadata-manifest.json'));const snapshot=path.join(stage,'data/database/metadata-full.sql.gz');report.metadata={bytes:fs.statSync(snapshot).size,sha256:U.fileHash(snapshot),manifest};});
  if(verifyOnly){report.status='verified';return report;}
  const unpacked=path.join(stage,'dist/win-unpacked'),target=artifactPaths(stage,pkg).nsis;
  const build=async(targets,prepackaged)=>{const invocation=buildCommand(stage,targets,{prepackaged,cacheRoot:process.env.ELECTRON_CACHE});const code=await runWithRetry(()=>execute(invocation.command,invocation.args,stage,{timeoutMs:30*60*1000}),{log:log.say,cancelled:()=>signal?.aborted});if(code!==0)throw Error('Construction interrompue, code '+code+'. Relancer REPRENDRE_BUILD_WINDOWS.bat.');};
  await step('unpacked',async()=>{const previous=checkpoint.steps.unpacked;
   if(resume&&!signingPolicy().requested&&previous?.digest&&fs.existsSync(unpacked)&&U.treeManifest(unpacked).digest===previous.digest){log.say('Application préparée inchangée : réutilisation.');return;}
   if(fs.existsSync(unpacked))await removeBuildTree(unpacked);delete checkpoint.steps.nsis;delete checkpoint.steps.smoke;
   await build(['dir']);const integrity=require('./check-packaged-integrity').checkArchive(path.join(unpacked,'resources/app.asar'));checkpoint.steps.unpacked={digest:U.treeManifest(unpacked).digest,integrity};
  });
  await step('nsis',async()=>{const previous=checkpoint.steps.nsis,policy=signingPolicy();
   if(resume&&!policy.requested&&previous&&U.verifiedFile(previous)){log.say('Installateur inchangé : intégrité vérifiée, construction réutilisée.');}
   else{report.nsisPreflight=assertNsisInputs(stage,pkg,{platform});log.say('Entree NSIS verifiee : '+report.nsisPreflight.includePathLength+' caracteres.');if(fs.existsSync(target))fs.rmSync(target);await build(['nsis'],unpacked);checkpoint.steps.nsis={path:target,bytes:fs.statSync(target).size,sha256:U.fileHash(target)};delete checkpoint.steps.smoke;}
   const native=inspect(stage,['nsis']);if((policy.required||policy.requested)&&native.artifacts.some(a=>a.signature.status!=='Valid'))throw Error('Une signature Windows valide est requise.');if(policy.publisher&&native.artifacts.some(a=>a.signature.signer!==policy.publisher))throw Error('Éditeur de signature inattendu.');report.artifacts=native.artifacts;checkpoint.steps.unpacked.digest=U.treeManifest(unpacked).digest;
  });
  await step('smoke',async()=>{const test=smoke||require('./smoke-windows').smokeWindows;report.smoke=await test({root:stage,unpacked,installer:target,installerSmoke,signal,log});checkpoint.steps.smoke=report.smoke;});
  await step('promotion',async()=>{const started=now();report.status=report.smoke.installer?.status==='passed'?'passed':'passed-with-limitations';if(report.smoke.installer?.status!=='passed')report.limitations.push('Installation NSIS non exécutée sur cette machine : elle reste à exécuter sur un poste Windows de test ou un runner Windows neuf.');report.finishedAt=new Date(now()).toISOString();const final=path.join(runDir,'release-check.json');U.atomicJson(final,report);U.promote([target,final],path.join(root,'dist'),{finalize:()=>U.atomicJson(path.join(root,'dist/release-check.json'),{...report,steps:[...report.steps,{name:'promotion',status:'passed',durationMs:now()-started}]})});});
  log.say('Installateur vérifié : '+path.basename(target));log.say('Rapport : dist/release-check.json');return report;
 }catch(error){report.status=signal?.aborted?'cancelled':'failed';report.error=error.message;throw error;}finally{
  report.finishedAt=report.finishedAt||new Date(now()).toISOString();
  report.wallDurationMs=now()-Date.parse(report.startedAt);
  report.stepsTotalMs=report.steps.reduce((total,s)=>total+s.durationMs,0);
  report.unattributedMs=Math.max(0,report.wallDurationMs-report.stepsTotalMs);
  log.say('[publication] Durées : étapes='+report.stepsTotalMs+' ms ; hors étapes='+report.unattributedMs+' ms.');
  try{
   save();
   // The published report must contain the *completed* promotion step and the
   // final wall-clock attribution, not only the pre-promotion snapshot.
   if(['passed','passed-with-limitations'].includes(report.status)) {
    const delivered=path.join(root,'dist','release-check.json');
    if(fs.existsSync(delivered))U.atomicJson(delivered,report);
   }
  }finally{log.close();workspace?.release();}
 }
}
module.exports={releaseWindows,validNode,auditSummary,auditGate,auditPackages,sourceStage,stagedSourceValid,stagedDependenciesValid,electronRuntimeReady};
if(require.main===module){const args=process.argv.slice(2),allowed=new Set(['--resume','--ci','--installer-smoke','--verify-only','--verbose','nsis']);if(args.some(arg=>!allowed.has(arg))){console.error('Usage : node scripts/release-windows.js [--resume] [--ci] [--verbose]');process.exitCode=1;}else{const controller=new AbortController();process.on('SIGINT',()=>controller.abort());releaseWindows({resume:args.includes('--resume'),installerSmoke:args.includes('--ci')||args.includes('--installer-smoke'),verifyOnly:args.includes('--verify-only'),verbose:args.includes('--verbose'),signal:controller.signal}).catch(error=>{console.error('[publication] '+error.message);process.exitCode=controller.signal.aborted?130:1;});}}
