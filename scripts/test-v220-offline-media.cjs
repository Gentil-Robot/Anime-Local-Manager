'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),fsp=require('node:fs/promises');
const store=require('../lib/media-associations');
(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'alm22-offline-'));
 try{
  const root=path.join(base,'PC-VIDEOS'),dir=path.join(root,'Series');
  await fsp.mkdir(dir,{recursive:true});
  const file=path.join(base,'media-associations.json');
  const ep11=path.join(dir,'Anime S01E11.mkv'),ep13=path.join(dir,'Anime S01E13.mkv');
  await fsp.writeFile(ep11,'fake fixture');await fsp.writeFile(ep13,'fake fixture');
  store.record(file,{root,relativePath:'Series/Anime S01E11.mkv',filename:'Anime S01E11.mkv',malId:55,episodeGuess:11,seasonGuess:1});
  store.record(file,{root,relativePath:'Series/Anime S01E13.mkv',filename:'Anime S01E13.mkv',malId:55,episodeGuess:13,seasonGuess:1});
  const summaries=store.summary(file),saved=store.list(file);
  assert.deepEqual(summaries[0].episodes,[11,13]);
  assert.equal(summaries[0].count,2);
  assert.equal(saved.length,2);
  assert(saved.every(row=>!('root' in row)&&!('relativePath' in row)),'Absolute paths must never cross IPC');
  const reopened=await store.locate(file,55,11);
  assert.equal(reopened.ok,true,'Persisted association must work on relaunch without rescanning');
  assert.equal(reopened.absolutePath,await fsp.realpath(ep11));
  assert.equal((await store.locate(file,55,12)).ok,false,'No invented file for an unlinked episode');
  assert.throws(()=>store.record(file,{root,relativePath:'../outside.mkv',filename:'outside.mkv',malId:55,episodeGuess:10}),/ALM_MEDIA_ASSOCIATION_INVALID/);
  assert.throws(()=>store.record(file,{root,relativePath:'Series/launch.exe',filename:'launch.exe',malId:55,episodeGuess:10}),/ALM_MEDIA_ASSOCIATION_INVALID/);
  await fsp.unlink(ep11);
  assert.equal((await store.locate(file,55,11)).code,'ALM_MEDIA_FILE_UNAVAILABLE','Disconnected disk is not a success');
  await fsp.writeFile(ep11,'fixture');
  const outside=path.join(base,'outside.mkv');await fsp.writeFile(outside,'fake fixture');
  try{
   await fsp.unlink(ep13);
   await fsp.symlink(outside,ep13,'file');
   assert.equal((await store.locate(file,55,13)).code,'ALM_MEDIA_FILE_CHANGED','No symlink escape');
  }catch(e){if(!['EPERM','EACCES','ENOSYS','ENOTSUP'].includes(e.code))throw e;}
  assert(store.remove(file,store.key(root,'Series/Anime S01E11.mkv')));
  assert.equal(store.summary(file)[0].count,1);
  console.log('OK V2.2 offline media: secure persisted file links, IPC privacy, missing NAS, symlinks, validation and removal.');
 }finally{await fsp.rm(base,{force:true,recursive:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
