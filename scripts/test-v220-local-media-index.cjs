'use strict';
const assert=require('node:assert/strict');
const os=require('node:os');const path=require('node:path');const fs=require('node:fs/promises');
const {guessEpisode,scanLocalMedia}=require('../lib/local-media-index');
(async()=>{
 assert.deepEqual(guessEpisode('Naruto S02E03.mkv'),{titleGuess:'Naruto',seasonGuess:2,episodeGuess:3,confidence:'high'});
 assert.deepEqual(guessEpisode('[Group] Frieren - 12 [1080p].mkv'),{titleGuess:'Frieren',seasonGuess:0,episodeGuess:12,confidence:'medium'});
 assert.equal(guessEpisode('movie.txt'),null);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'alm22-media-'));
 try{
  await fs.mkdir(path.join(root,'Series'));
  await fs.writeFile(path.join(root,'Series','Anime S01E01.mkv'),'a');
  await fs.writeFile(path.join(root,'Series','readme.txt'),'b');
  await fs.mkdir(path.join(root,'outside'));
  await fs.writeFile(path.join(root,'outside','Other S02E05.mp4'),'c');
  try{await fs.symlink(path.join(root,'outside'),path.join(root,'Series','link'),'dir');}catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e;}
  const report=await scanLocalMedia(root);
  assert.equal(report.files.length,2);
  assert(report.files.every(x=>!path.isAbsolute(x.relativePath)));
  assert(report.files.find(x=>x.filename==='Anime S01E01.mkv').relativePath==='Series/Anime S01E01.mkv');
  assert(report.summary.skippedSymlinks>=0);
  const limited=await scanLocalMedia(root,{maxResults:1});assert.equal(limited.summary.reason,'results');
  const aborted=await scanLocalMedia(root,{signal:{aborted:true}});assert.equal(aborted.summary.reason,'aborted');
  await assert.rejects(()=>scanLocalMedia('relative/path'),/ALM_MEDIA_ROOT_INVALID/);
  const rootLink=path.join(root,'symlink-root');await fs.symlink(path.join(root,'Series'),rootLink,'dir');
  await assert.rejects(()=>scanLocalMedia(rootLink),/ALM_MEDIA_ROOT_INVALID/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
 console.log('OK ALM 2.2 local media index: names, readonly files, links, limits and abort');
})().catch(e=>{console.error(e);process.exitCode=1;});
