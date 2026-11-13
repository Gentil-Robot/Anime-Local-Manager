'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {runCommand,atomicJson,fileHash,redact}=require('./release-utils');
function smokeEnvironment(profile,nonce,source=process.env){
 const env={...source};
 for(const key of Object.keys(env))if(/^(ELECTRON_RUN_AS_NODE|ELECTRON_NO_ASAR|NODE_OPTIONS|NODE_PATH|ALM_DATA_DIR|ALM_IMAGES_DIR|ALM_CONFIG_KEY|ALM_SESSION_TOKEN|ALM_TEST_PROFILE|ALM_RELEASE_SMOKE|ALM_RELEASE_PROFILE|ALM_RELEASE_NONCE)$/i.test(key))delete env[key];
 return {...env,ALM_RELEASE_SMOKE:'1',ALM_RELEASE_PROFILE:profile,ALM_RELEASE_NONCE:nonce};
}
function readProof(file){try{return {value:JSON.parse(fs.readFileSync(file,'utf8'))};}catch(error){return {error:error.code==='ENOENT'?'Rapport de l’application absent.':'Rapport de l’application illisible.'};}}
function failureDetails(result,proof){
 const code=Number.isInteger(result.code)?result.code:null;
 return [code===null?'Code de sortie inconnu.':`Code de sortie ${code} (0x${(code>>>0).toString(16).toUpperCase().padStart(8,'0')}).`,result.signal&&'Signal : '+result.signal,result.error&&'Lancement : '+result.error,proof.value?.stage&&'Étape : '+proof.value.stage,proof.value?.error&&'Application : '+proof.value.error,proof.error,(result.output||'').trim().slice(-2000)].filter(Boolean).join('\n');
}
function preserveFailure(profile,phase,result,proof,{log,diagnosticsDir}={}){
 const destination=diagnosticsDir||(log?.file?path.join(path.dirname(log.file),'smoke-diagnostics'):null);
 if(!destination)return null;
 fs.mkdirSync(destination,{recursive:true});
 const file=path.join(destination,'smoke-'+Date.now()+'-'+phase+'-'+crypto.randomBytes(8).toString('hex')+'.json');
 let chromium='';try{const source=path.join(profile,'chromium-'+phase+'.log'),fd=fs.openSync(source,'r');try{const size=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(size,131072));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,size-buffer.length));chromium=buffer.toString('utf8');}finally{fs.closeSync(fd);}}catch{}
 // Keep only test reports and bounded log tails, never the temporary database or keys.
 atomicJson(file,JSON.parse(redact(JSON.stringify({schema:1,phase,exitCode:result.code??null,signal:result.signal||null,launchError:result.error||null,proof:proof.value||null,proofError:proof.error||null,output:(result.output||'').slice(-131072),chromium}))));
 log?.write('[smoke] Diagnostic conservé : '+file+'\n');return file;
}
function validateProof(value,{nonce,phase,version,expectedCount,electron}){if(value?.status!=='passed'||value.nonce!==nonce||value.phase!==phase||value.version!==version||value.packaged!==true||!value.ui||!Number.isSafeInteger(expectedCount)||value.catalogueCount!==expectedCount||electron&&value.runtime?.electron!==electron||value.episodesSeen!==3||value.imported!==1||!value.backup||phase==='verify'&&value.persistence!==true)throw Error('Résultat de démarrage absent ou incohérent.');return value;}
async function testApp(executable,{version,expectedCount,electron,log,signal,run=runCommand,diagnosticsDir}={}){
 const profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'alm-release-'))),nonce=crypto.randomBytes(32).toString('hex'),results=[];
 try{for(const phase of ['seed','verify']){
  atomicJson(path.join(profile,'.alm-release-test.json'),{nonce,phase,expectedCount});const proof=path.join(profile,'smoke-result.json');fs.rmSync(proof,{force:true});
  const result=await run(executable,['--enable-logging=file','--log-file='+path.join(profile,'chromium-'+phase+'.log')],{cwd:path.dirname(executable),env:smokeEnvironment(profile,nonce),log,signal,timeoutMs:180000}),report=readProof(proof);
  try{
    if(result.code!==0)throw Error('Essai de l’application échoué.\n'+failureDetails(result,report));
    if(report.error)throw Error(report.error);
    results.push(validateProof(report.value,{nonce,phase,version,expectedCount,electron}));
  }catch(error){
    let saved;try{saved=preserveFailure(profile,phase,result,report,{log,diagnosticsDir});}catch(keepError){log?.write('[smoke] Conservation du diagnostic impossible : '+keepError.message+'\n');}
    throw Error(error.message+(result.code===0?'\n'+failureDetails(result,report):'')+(saved?'\nDiagnostic : '+saved:''));
  }
 }return {status:'passed',launches:2,exeSha256:fileHash(executable),runtime:results[1].runtime,catalogueCount:results[1].catalogueCount,imported:1,persistence:true,backup:true};
 }finally{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
}
async function smokeWindows({root,unpacked,installer,installerSmoke=false,log,signal,run=runCommand,platform=process.platform}={}){
 if(platform!=='win32')throw Error('Essai natif Windows indisponible sur cette plateforme.');
 require('./check-packaged-integrity').verifyPreparedSource(path.join(unpacked,'resources/app.asar'),root);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),exeName=(pkg.build.executableName||pkg.build.productName)+'.exe',appPath=path.join(unpacked,exeName),report={};
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/database/metadata-manifest.json'),'utf8')),expectedCount=Number(manifest.full?.rows);if(!Number.isSafeInteger(expectedCount)||expectedCount<10000)throw Error('Catalogue attendu absent du manifeste.');
 const proofOptions={version:pkg.version,expectedCount,electron:pkg.devDependencies.electron,log,signal,run};
 report.application=await testApp(appPath,proofOptions);
 report.installer={status:'not-run',reason:'L’installation automatique nécessite un runner Windows neuf ou une VM explicitement désignée comme jetable.'};
 if(!installerSmoke)return report;
 if(process.env.GITHUB_ACTIONS!=='true'&&process.env.ALM_INSTALLER_TEST_DISPOSABLE!=='1')throw Error('Essai NSIS réservé au runner Windows neuf ou à une VM jetable explicitement désignée.');
 const check="$ErrorActionPreference='Stop'; $items=@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Anime Local Manager' }); Write-Output ([bool]($items.Count -gt 0))";
 const exists=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',check],{log,signal,timeoutMs:30000});if(exists.code!==0||!/^false\s*$/i.test(exists.output.trim()))throw Error('Essai NSIS refusé : installation ALM existante ou contrôle du registre indisponible.');
 const installDir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-install-'));let installed=false;
 try{
  const result=await run(installer,['/S','/D='+installDir],{log,signal,timeoutMs:180000,windowsVerbatimArguments:true});if(result.code!==0)throw Error('Installation NSIS silencieuse échouée.');installed=true;
  const installedExe=path.join(installDir,exeName);if(fileHash(installedExe)!==report.application.exeSha256)throw Error('L’EXE installé ne correspond pas à l’application préparée.');
  const before=fileHash(path.join(unpacked,'resources/app.asar')),after=fileHash(path.join(installDir,'resources/app.asar'));if(before!==after)throw Error('ASAR installé incohérent.');
  report.installer={...await testApp(installedExe,proofOptions),asarSha256:after};
 }finally{
  const uninstall=fs.readdirSync(installDir).filter(name=>/^Uninstall.*\.exe$/i.test(name));
  if(installed||uninstall.length){if(uninstall.length!==1)throw Error('Désinstallateur de test introuvable.');const result=await run(path.join(installDir,uninstall[0]),['/S'],{log,timeoutMs:120000});if(result.code!==0)throw Error('Désinstallation du test échouée.');}
  fs.rmSync(installDir,{recursive:true,force:true,maxRetries:10,retryDelay:500});
 }
 return report;
}
module.exports={smokeWindows,testApp,validateProof,smokeEnvironment};
