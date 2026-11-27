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
assert.deepEqual(guessEpisode('[EroGaKi-Team]_Ayakashi_04_[5B8549C1].avi'),{titleGuess:'Ayakashi',seasonGuess:0,episodeGuess:4,confidence:'review'});
assert.deepEqual(guessEpisode('[Kyuu-F] Mugen no Juunin 07 vostfr .avi'),{titleGuess:'Mugen no Juunin',seasonGuess:0,episodeGuess:7,confidence:'review'});
assert.deepEqual(guessEpisode('[MFF-T]_Malice_Doll_OAV.avi'),{titleGuess:'Malice Doll',seasonGuess:0,episodeGuess:0,confidence:'review',kindGuess:'ova'});
assert.equal(rank(guessEpisode('[MFF-T]_Malice_Doll_OAV.avi'),[{malId:123,title:'Malice@Doll'}]).malId,123);
assert.equal(rank(guessEpisode('[EroGaKi-Team]_Ayakashi_04_[5B8549C1].avi'),[{malId:123,title:'Ayakashi'},{malId:124,title:'Ayakashi'}]).malId,0);
 assert.equal(guessEpisode('E07.mkv').episodeGuess,7);
 assert.equal(guessEpisode('03.mkv').episodeGuess,3);
 assert.equal(inferFromRelativePath('Frieren/Saison 2/03.mkv',guessEpisode('03.mkv')).seasonGuess,2);
 assert.equal(inferFromRelativePath('Frieren/Saison 2/03.mkv',guessEpisode('03.mkv')).titleGuess,'Frieren');
 assert.equal(rank({titleGuess:'Vinland Saga',seasonGuess:2,episodeGuess:4},[{malId:13,title:'Vinland Saga Season 2'}]).malId,13);
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
assert.equal(rank({titleGuess:'Vinland Saga',seasonGuess:2,episodeGuess:4},[{malId:15,title:'Vinland Saga Season 1'},{malId:16,title:'Vinland Saga Season 2'}]).malId,16);
assert.equal(rank({titleGuess:'Long Fictional Anime Title'},[{malId:17,title:'Fictional Anime Title Long'}]).candidates[0].score,70);
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
  const direct=await scanLocalMedia(path.join(root,'Frieren','Season 2'),{maxDurationMs:3000});assert.equal(direct.files[0].seasonGuess,2);
  await fsp.writeFile(path.join(root,'Frieren','03.mkv'),'test');
  const seriesRoot=await scanLocalMedia(path.join(root,'Frieren'),{maxDurationMs:3000});assert.equal(seriesRoot.files.find(f=>f.filename==='03.mkv').titleGuess,'Frieren');
 }finally{await fsp.rm(root,{recursive:true,force:true});}
 console.log('OK V2.2 smart recognition: aliases, seasons from folders, ranges, no false-positive matching and read-only scan.');
})().catch(error=>{console.error(error);process.exitCode=1;});
