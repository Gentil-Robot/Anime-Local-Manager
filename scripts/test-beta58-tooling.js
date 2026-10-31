'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),builder=path.dirname(require.resolve('app-builder-lib/package.json'));
 const packagePath=path.resolve(path.dirname(require.resolve('@electron/get',{paths:[builder]})),'../package.json');const manifest=JSON.parse(fs.readFileSync(packagePath,'utf8'));assert.equal(manifest.version,'5.1.0');
 const get=require(require.resolve('@electron/get',{paths:[builder]}));for(const name of ['download','downloadArtifact','initializeProxy','getHostArch'])assert.equal(typeof get[name],'function');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm58-download-'));let downloads=0;const bytes=Buffer.from('controlled Electron artifact'),name='electron-v44.1.1-win32-x64.zip',sum=crypto.createHash('sha256').update(bytes).digest('hex');
 try{
  const options={version:'44.1.1',artifactName:'electron',platform:'win32',arch:'x64',cacheRoot:dir,checksums:{[name]:sum},downloader:{async download(url,target){assert(url.startsWith('https://'));downloads++;fs.writeFileSync(target,bytes);}}};
  const file=await get.downloadArtifact(options);assert.deepEqual(fs.readFileSync(file),bytes);await get.downloadArtifact(options);assert.equal(downloads,1,'Verified download is reused');
  fs.writeFileSync(file,'corrupt');await get.downloadArtifact(options);assert.equal(downloads,2,'Corrupt cache is redownloaded');
  await assert.rejects(get.downloadArtifact({...options,version:'44.1.2',checksums:{'electron-v44.1.2-win32-x64.zip':'0'.repeat(64)}}),/checksum|mismatch/i);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));for(const key of Object.keys(lock.packages))assert(!['global-agent','roarr','sprintf-js','boolean'].includes(key.split('node_modules/').at(-1)));
 console.log('OK Beta58 tooling: builder uses the official modern download API, cache checksums reject corruption, failed checksum is refused, old proxy vulnerability chain is absent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
