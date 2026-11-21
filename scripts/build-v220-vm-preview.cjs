'use strict';
// VM-only preview build. Run AFTER verification on an isolated Windows CI runner.
// Edits only the runner checkout, never the release branch. Separate app identity.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(process.platform!=='win32')throw Error('ALM_PREVIEW_WINDOWS_ONLY');
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
save('main.js',read('main.js').replace("app.setAppUserModelId?.('fr.gentilrobot.animelocalmanager')","app.setAppUserModelId?.('fr.gentilrobot.animelocalmanager.vmtest')")
 .replace(/createIntegratedUpdater\(\{current:app\.getVersion\(\),platform:process\.platform,arch:process\.arch,packaged:app\.isPackaged,/,
 'createIntegratedUpdater({current:app.getVersion(),platform:process.platform,arch:process.arch,packaged:false,')
 .replace(/createScheduler\(\{exe:process\.env\.APPIMAGE\|\|process\.execPath,packaged:app\.isPackaged,/,
 'createScheduler({exe:process.env.APPIMAGE||process.execPath,packaged:false,'));
// Keep the VM preview uninstall script tied to its OWN executable, never stable ALM.
save('build/installer.nsh',read('build/installer.nsh').replace(/Anime Local Manager\.exe/g,'Anime Local Manager VM Test.exe'));
const cli=require.resolve('electron-builder/out/cli/cli.js');
console.log('[VM TEST] Building isolated preview 2.2.0 with independent app identity. Auto-updater disabled.');
const result=spawnSync(process.execPath,[cli,'--win','nsis','--publish','never'],{
 cwd:root,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'},stdio:'inherit',windowsHide:false
});
if(result.error)throw result.error;
if(result.status!==0)throw Error('ALM_PREVIEW_BUILD_FAILED_'+result.status);
const exe=path.join(root,'dist','Anime-Local-Manager-2.2.0-VM-TEST-x64.exe');
const report=require('./check-windows-artifacts').inspectPe(exe);
const obj={status:'preview-not-published',version:'2.2.0',baseVersion:'2.1.3',appId:pkg.build.appId,productName:pkg.build.productName,
 filename:report.file,size:report.bytes,sha256:report.sha256,notForProduction:true,
 note:'VM-only preview; test native folder scan and install progress on a disposable Windows VM. Unsigned installer may show SmartScreen.',
 buildAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'dist','VM-TEST-REPORT.json'),JSON.stringify(obj,null,2)+'\n');
console.log('[VM TEST] '+JSON.stringify(obj));
