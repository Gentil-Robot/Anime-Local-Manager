'use strict';
// VM-only preview build. Run AFTER verification on an isolated Windows or Linux CI runner.
// Edits only the runner checkout, never the release branch. Separate app identity.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!['win32','linux'].includes(process.platform))throw Error('ALM_PREVIEW_PLATFORM');
if(process.env.ALM_VM_PREVIEW_BUILD!=='1')throw Error('ALM_PREVIEW_BUILD_NOT_AUTHORIZED');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const save=(name,data)=>fs.writeFileSync(path.join(root,name),data);
const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='2.1.3')throw Error('ALM_PREVIEW_UNEXPECTED_BASE');
pkg.version='2.2.0';
pkg.description='Anime Local Manager V2.2.0 VM TEST (isolated preview)';
pkg.build.appId='fr.gentilrobot.animelocalmanager.vmtest';
pkg.build.productName='Anime Local Manager VM Test';
pkg.build.executableName='Anime Local Manager VM Test';
pkg.build.nsis.artifactName='Anime-Local-Manager-2.2.0-VM-TEST-${arch}.${ext}';
pkg.build.nsis.shortcutName='Anime Local Manager VM Test';
pkg.build.nsis.runAfterFinish=false;
if(process.platform==='linux'){
 pkg.name='anime-local-manager-vm-test';
 pkg.build.linux.executableName='anime-local-manager-vm-test';
 pkg.build.linux.desktop.entry.Name='Anime Local Manager VM Test';
 pkg.build.linux.desktop.entry.StartupWMClass='anime-local-manager-vm-test';
 pkg.build.artifactName='Anime-Local-Manager-2.2.0-VM-TEST-${os}-${arch}.${ext}';
 pkg.build.linux.artifactName=pkg.build.artifactName;
 pkg.build.deb={...(pkg.build.deb||{}),artifactName:pkg.build.artifactName};
}
save('package.json',JSON.stringify(pkg,null,2)+'\n');
const release=JSON.parse(read('release-version.json'));
release.technicalVersion='2.2.0';
release.qualifier='VM TEST';
release.publicVersion='V2.2.0 VM TEST';
release.publicName='Anime Local Manager V2.2.0 VM TEST';
release.installerName='Anime-Local-Manager-2.2.0-VM-TEST-x64.exe';
release.archiveName='Anime-Local-Manager-2.2.0-VM-TEST.zip';
release.previousValidatedVersion='2.1.3';
save('release-version.json',JSON.stringify(release,null,2)+'\n');
const productScript='// VM preview generated from release-version.json.\n'+
 "(()=>{'use strict';window.ALM_RELEASE=Object.freeze("+JSON.stringify(release)+');})();\n';
save('public/release-version.js',productScript);
save('public/index.html',read('public/index.html').replace(/V2\.1\.3 Bêta stable/g,'V2.2.0 VM TEST'));
save('public/design-core.js',read('public/design-core.js').replace(/window\.ALM_RELEASE\?\.technicalVersion \|\| "2\.1\.3"/g,'window.ALM_RELEASE?.technicalVersion || "2.2.0"')
 .replace(/window\.ALM_RELEASE\?\.publicVersion \|\| "V2\.1\.3 Bêta stable"/g,'window.ALM_RELEASE?.publicVersion || "V2.2.0 VM TEST"'));
// Fail closed if any of the normal updater/scheduler/identity paths change.
let main=read('main.js');
const replaceCount=(pattern,value,count)=>{const found=[...main.matchAll(pattern)];if(found.length!==count)throw Error('ALM_PREVIEW_HOOK_COUNT '+pattern+' '+found.length);main=main.replace(pattern,value);};
replaceCount(/fr\.gentilrobot\.animelocalmanager(?!\.vmtest)/g,'fr.gentilrobot.animelocalmanager.vmtest',2);
replaceCount(/createIntegratedUpdater\(\{current:app\.getVersion\(\),platform:process\.platform,arch:process\.arch,packaged:app\.isPackaged,/g,'createIntegratedUpdater({current:app.getVersion(),platform:process.platform,arch:process.arch,packaged:false,',1);
replaceCount(/createScheduler\(\{exe:process\.env\.APPIMAGE\|\|process\.execPath,packaged:app\.isPackaged,/g,'createScheduler({exe:process.env.APPIMAGE||process.execPath,packaged:false,',2);
replaceCount(/if\(removeMaintenance\)\{const removal=[^\n]*?app\.quit\(\);return;\}/g,'if(removeMaintenance){app.quit();return;}',1);
save('main.js',main);
// The VM test has no scheduled tasks; uninstall must NOT delete stable ALM tasks.
if(process.platform==='win32'){
 const nsis=read('build/installer.nsh');
 if(!nsis.includes('!macro customUnInstall')||!nsis.includes('!macroend'))throw Error('ALM_VM_PREVIEW_NSIS_HOOK');
 save('build/installer.nsh',nsis.replace(/!macro customUnInstall[\s\S]*?!macroend/,'!macro customUnInstall\n  ; VM test: no maintenance task to remove\n!macroend'));
}
const cli=require.resolve('electron-builder/out/cli/cli.js');
console.log('[VM TEST] Building isolated preview 2.2.0 with independent app identity. Auto-updater disabled.');
const result=spawnSync(process.execPath,[cli,...(process.platform==='win32'?['--win','nsis']:['--linux','AppImage','deb']),'--publish','never'],{
 cwd:root,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'},stdio:'inherit',windowsHide:false
});
if(result.error)throw result.error;
if(result.status!==0)throw Error('ALM_PREVIEW_BUILD_FAILED_'+result.status);
if(process.platform==='win32'){
const exe=path.join(root,'dist','Anime-Local-Manager-2.2.0-VM-TEST-x64.exe');
const report=require('./check-windows-artifacts').inspectPe(exe);
const obj={status:'preview-not-published',version:'2.2.0',baseVersion:'2.1.3',appId:pkg.build.appId,productName:pkg.build.productName,
 filename:report.file,size:report.bytes,sha256:report.sha256,notForProduction:true,
 note:'VM-only preview; test native folder scan and install progress on a disposable Windows VM. Unsigned installer may show SmartScreen.',
 buildAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'dist','VM-TEST-REPORT.json'),JSON.stringify(obj,null,2)+'\n');
console.log('[VM TEST] '+JSON.stringify(obj));
}else{
 const crypto=require('node:crypto'),dist=path.join(root,'dist');
 const artifacts=fs.readdirSync(dist).filter(name=>name.includes('VM-TEST')&&/\.(?:AppImage|deb)$/.test(name)).sort().map(name=>{
  const file=path.join(dist,name),data=fs.readFileSync(file);
  return {filename:name,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};
 });
 if(artifacts.length!==2||!artifacts.some(a=>a.filename.endsWith('.AppImage'))||!artifacts.some(a=>a.filename.endsWith('.deb')))throw Error('ALM_LINUX_PREVIEW_ARTIFACTS');
 const report={status:'preview-not-published',version:'2.2.0',baseVersion:'2.1.3',appId:pkg.build.appId,productName:pkg.build.productName,packageName:pkg.name,artifacts,notForProduction:true,buildAt:new Date().toISOString()};
 fs.writeFileSync(path.join(dist,'LINUX-VM-TEST-REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log('[VM TEST LINUX] '+JSON.stringify(report));
}
