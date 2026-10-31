'use strict';
// Build hook: never accept a package whose ASAR payload is missing or altered.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function checkArchive(archive){
 const asar=require('@electron/asar');asar.uncache(archive);
 const header=asar.getRawHeader(archive),files=new Set();let count=0,expectedEnd=8+header.headerSize;
 for(const full of asar.listPackage(archive)){
  const name=require('./package-local-modules').archiveName(full),nativeName=path.normalize(name);const info=asar.statFile(archive,nativeName,false);
  if(info.size===undefined||info.link)continue;
  files.add(name);
  if(!info.unpacked)expectedEnd=Math.max(expectedEnd,8+header.headerSize+Number(info.offset)+info.size);
  if(!info.integrity||info.integrity.algorithm!=='SHA256')throw Error('ASAR integrity missing: '+name);
  const content=asar.extractFile(archive,nativeName);
  if(content.length!==info.size||crypto.createHash('sha256').update(content).digest('hex')!==info.integrity.hash)throw Error('ASAR file missing or altered: '+name);
  count++;
 }
 if(fs.statSync(archive).size!==expectedEnd)throw Error('ASAR size does not match its complete payload');
 for(const required of ['main.js','preload.js','server.js','db.js','csv-worker.js','public/index.html'])asar.statFile(archive,path.normalize(required));
 require('./package-local-modules').localModules(files,name=>asar.extractFile(archive,path.normalize(name)));
 const dependencies=require('./package-dependencies').packageDependencies(files,name=>asar.extractFile(archive,path.normalize(name)));
 return {files:count,bytes:expectedEnd,dependencyPackages:Math.max(0,dependencies.size-1)};
}
async function afterPack(context){
 const resources=context.electronPlatformName==='darwin'?path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app','Contents','Resources'):path.join(context.appOutDir,'resources');
 const result=checkArchive(path.join(resources,'app.asar'));
 console.log(`[package-integrity] Complete ASAR verified: ${result.files} files, ${result.bytes} bytes, ${result.dependencyPackages} production dependency packages.`);
}
module.exports=afterPack;module.exports.default=afterPack;module.exports.checkArchive=checkArchive;

function verifyPreparedSource(archive,root){
 const asar=require('@electron/asar');asar.uncache(archive);const pkg=JSON.parse(asar.extractFile(archive,'package.json').toString());const source=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(pkg.version!==source.version)throw Error('Version du paquet différente des sources.');
 for(const name of ['main.js','server.js','lib/release-smoke.js']){const original=fs.readFileSync(path.join(root,name)),packed=asar.extractFile(archive,path.normalize(name));if(!original.equals(packed))throw Error('Code du paquet différent des sources : '+name);}
 return checkArchive(archive);
}
module.exports.verifyPreparedSource=verifyPreparedSource;
