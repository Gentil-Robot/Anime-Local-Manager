'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const {ensureAsarFinished}=require('./ensure-asar-finished'),{archiveName}=require('./package-local-modules');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'alm70-asar-'));
function loadCommonJS(file,overrides){const module={exports:{}},requireHere=createRequire(file);vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>Object.hasOwn(overrides,name)?overrides[name]:requireHere(name),__dirname:path.dirname(file),__filename:file,Buffer,console},{filename:file});return module.exports;}
(async()=>{
 try{
  const payload=path.join(temporary,'payload');fs.mkdirSync(payload);
  const contents={
   'main.js':"module.exports=require('./lib/catalogue');",'lib/catalogue.js':"module.exports=require('../data/database/catalogue-identities.json');",'data/database/catalogue-identities.json':'{"ids":[1,2,3]}',
   'preload.js':'module.exports={};','server.js':'module.exports={};','db.js':'module.exports={};','csv-worker.js':'module.exports={};','public/index.html':'<!doctype html><title>ALM fixture</title>',
   'public/assets/design/fixture.bin':Buffer.alloc(32,7)
  };
  for(const [name,value]of Object.entries(contents)){const file=path.join(payload,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
  ensureAsarFinished();const asar=require('@electron/asar'),archive=path.join(temporary,'app.asar');await asar.createPackageWithOptions(payload,archive,{unpack:'**/*.bin'});
  // Execute the locked ASAR implementation with Windows path semantics.
  const fsModule=path.join(path.dirname(require.resolve('@electron/asar')),'filesystem.js'),WindowsFilesystem=loadCommonJS(fsModule,{path:path.win32}).Filesystem;
  let windowsTree;
  const windowsAsar={
   uncache(file){asar.uncache(file);const raw=asar.getRawHeader(file);windowsTree=new WindowsFilesystem('C:\\ALM\\app.asar');windowsTree.setHeader(JSON.parse(raw.headerString),raw.headerSize);},
   getRawHeader:file=>asar.getRawHeader(file),listPackage:()=>windowsTree.listFiles(),
   statFile(_archive,name,follow){return windowsTree.getFile(name,follow);},
   extractFile(file,name,follow){windowsTree.getFile(name,follow);return asar.extractFile(file,path.normalize(archiveName(name)),follow);}
  };
  windowsAsar.uncache(archive);assert.throws(()=>windowsTree.getFile('data/database/catalogue-identities.json'),/not found/);assert.equal(windowsTree.getFile('data\\database\\catalogue-identities.json').size,Buffer.byteLength(contents['data/database/catalogue-identities.json']));
  const checkerFile=path.join(root,'scripts/check-packaged-integrity.js'),windowsChecker=loadCommonJS(checkerFile,{'node:path':path.win32,'@electron/asar':windowsAsar});
  assert.equal(windowsChecker.checkArchive(archive).files,Object.keys(contents).length);
  assert.equal(require('./check-packaged-integrity').checkArchive(archive).files,Object.keys(contents).length);
  // Windows handling must still reject validly hashed packages with a missing module.
  fs.rmSync(path.join(payload,'data/database/catalogue-identities.json'));const missing=path.join(temporary,'missing.asar');await asar.createPackageWithOptions(payload,missing,{unpack:'**/*.bin'});assert.throws(()=>windowsChecker.checkArchive(missing),/Module local absent du paquet/);
  // Integrity checks cover nested files stored inside and outside the ASAR.
  const original=fs.readFileSync(archive),raw=asar.getRawHeader(archive),info=asar.statFile(archive,path.normalize('data/database/catalogue-identities.json')),changed=Buffer.from(original);changed[8+raw.headerSize+Number(info.offset)]^=1;fs.writeFileSync(archive,changed);assert.throws(()=>windowsChecker.checkArchive(archive),/missing or altered/);
  fs.writeFileSync(archive,original);const outside=path.join(archive+'.unpacked','public/assets/design/fixture.bin');fs.writeFileSync(outside,Buffer.alloc(32,8));assert.throws(()=>windowsChecker.checkArchive(archive),/missing or altered/);fs.rmSync(outside);assert.throws(()=>windowsChecker.checkArchive(archive),/ENOENT/);
  console.log('OK Beta70 Windows ASAR: actual locked filesystem under win32 paths, nested JSON and unpacked assets, local-module traversal, missing modules, corruption and missing external bytes.');
 }finally{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
})().catch(error=>{console.error(error);process.exitCode=1;});
