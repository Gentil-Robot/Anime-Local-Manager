'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fsp=require('node:fs/promises');
const {guessEpisode,inferFromRelativePath,scanLocalMedia}=require('../lib/local-media-index');
const {rank,normalize}=require('../public/v220-media-match');
assert.equal(normalize('  L’Été  en   Ville! '),'l ete en ville');
assert.deepEqual(guessEpisode('Naruto S02E03.mkv'),{titleGuess:'Naruto',seasonGuess:2,episodeGuess:3,confidence:'high'});
assert.deepEqual(guessEpisode('[SubsPlease] Frieren - 12 [1080p].mkv'),{titleGuess:'Frieren',seasonGuess:0,episodeGuess:12,confidence:'medium'});
assert.deepEqual(guessEpisode('Vinland.Saga.02x05.mp4'),{titleGuess:'Vinland Saga',seasonGuess:2,episodeGuess:5,confidence:'high'});
assert.deepEqual(guessEpisode('Anime.S01E04-E05.mkv'),{titleGuess:'Anime',seasonGuess:1,episodeGuess:4,confidence:'high',episodeEndGuess:5});
assert.equal(guessEpisode('just-a-file.txt'),null);
assert.equal(guessEpisode('movie.mkv').confidence,'unknown');
assert.deepEqual(inferFromRelativePath('Frieren/Season 2/Episode 08.mkv',guessEpisode('Episode 08.mkv')),
 {titleGuess:'Frieren',seasonGuess:2,episodeGuess:8,confidence:'medium'});
const library=[
 {malId:11,title:'Frieren',manualSeasonNumber:1},
 {malId:12,title:'Frieren',manualSeasonNumber:2},
 {malId:13,title:'Vinland Saga II',titleEn:'Vinland Saga Season 2',manualSeasonNumber:2},
 {malId:14,title:'Naruto Shippuden'}
];
assert.equal(rank({titleGuess:'Frieren',seasonGuess:1,episodeGuess:9},library).malId,11);
assert.equal(rank({titleGuess:'Frieren',seasonGuess:2,episodeGuess:9},library).malId,12);
assert.equal(rank({titleGuess:'Frieren',episodeGuess:9},library).confidence,'review','Unclear season must not auto-link');
assert.equal(rank({titleGuess:'Vinland Saga Season 2',seasonGuess:2,episodeGuess:4},library).malId,13);
assert.equal(rank({titleGuess:'Naruto',episodeGuess:1},library).malId,0,'A generic substring must never match a different anime');
assert.equal(rank({titleGuess:'Frieren',seasonGuess:3,episodeGuess:8},library).candidates.length,0);
assert.equal(rank({titleGuess:'',episodeGuess:8},library).confidence,'none');
(async()=>{
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'alm22-recognize-'));
 try{
  await fsp.mkdir(path.join(root,'Frieren'),{recursive:true});
  await fsp.mkdir(path.join(root,'Frieren','Season 2'));
  await fsp.writeFile(path.join(root,'Frieren','Season 2','Episode 08.mkv'),'test');
  const result=await scanLocalMedia(root,{maxDurationMs:3000});
  assert.equal(result.files.length,1);
  assert.equal(result.files[0].titleGuess,'Frieren');
  assert.equal(result.files[0].seasonGuess,2);
  assert.equal(result.files[0].episodeGuess,8);
  assert.equal(result.summary.videoFiles,1);
 }finally{await fsp.rm(root,{recursive:true,force:true});}
 console.log('OK V2.2 smart recognition: aliases, seasons from folders, ranges, no false-positive matching and read-only scan.');
})().catch(error=>{console.error(error);process.exitCode=1;});
