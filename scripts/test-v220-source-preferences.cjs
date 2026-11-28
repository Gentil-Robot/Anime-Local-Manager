'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const prefs=require('../lib/viewing-source-preferences'),stream=require('../lib/streaming-sources'),media=require('../lib/media-associations');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-source-prefs-')),p=path.join(dir,'prefs.json'),s=path.join(dir,'stream.json'),m=path.join(dir,'local.json');
 try{
  assert.equal(prefs.read(p).display,'always');assert.throws(()=>prefs.setDisplay(p,'bogus'));prefs.setDisplay(p,'details');assert.equal(prefs.read(p).display,'details');
  const a=stream.put(s,{malId:42,episode:0,label:'Service',url:'https://example.com/show'}),b=stream.put(s,{malId:43,episode:2,label:'Other',url:'https://example.com/episode'});
  assert.throws(()=>stream.validateUrl('https:example.com'));assert.throws(()=>stream.validateUrl('file:///tmp/x'));
  const filename='video.mkv';fs.writeFileSync(path.join(dir,filename),'fixture');const local=media.record(m,{root:dir,relativePath:filename,filename,malId:42,episodeGuess:2,episodeEndGuess:3,seasonGuess:1});
  const ls=()=>media.list(m),ss=()=>stream.summary(s);
  const series=path.join(dir,'Series');fs.mkdirSync(series);fs.writeFileSync(path.join(series,'other.mkv'),'fixture');
  const nested=media.record(m,{root:dir,relativePath:'Series/other.mkv',filename:'other.mkv',malId:43,episodeGuess:2});
  assert.equal(media.indexPaths(media.load(m)).get(media.pathIdentity(series,'other.mkv')).key,nested.key);
  assert.throws(()=>media.record(m,{root:series,relativePath:'other.mkv',filename:'other.mkv',malId:43,episodeGuess:2}),/ALM_MEDIA_FILE_ALREADY_LINKED/);
  assert.throws(()=>media.record(m,{root:dir,relativePath:filename,filename,malId:43,episodeGuess:4}),/ALM_MEDIA_FILE_ALREADY_LINKED/);
  assert.throws(()=>prefs.setFavorite(p,42,'stream',b.key,ls(),ss()));assert.throws(()=>prefs.setFavorite(p,43,'local',local.key,ls(),ss()));
  prefs.setFavorite(p,42,'stream',a.key,ls(),ss());
  let state=prefs.overview(p,ls(),ss()),group=state.groups.find(g=>g.malId===42);
  assert.equal(group.streamCount,1);assert.equal(group.localCount,1);assert.equal(group.favorite.kind,'stream');assert.equal(group.favorite.episode,0);
  assert(prefs.resolveFavorite(p,42,4,'stream',a.key,ls(),ss()));assert.equal(prefs.resolveFavorite(p,43,4,'stream',a.key,ls(),ss()),null);
  assert(!JSON.stringify(state).includes('https://'));assert(!JSON.stringify(state).includes(filename));assert(!JSON.stringify(state).includes(dir));
  prefs.setFavorite(p,42,'local',local.key,ls(),ss());group=prefs.overview(p,ls(),ss()).groups.find(g=>g.malId===42);assert.equal(group.favorite.episode,2);assert.equal(group.favorite.end,3);assert(prefs.resolveFavorite(p,42,3,'local',local.key,ls(),ss()));assert.equal(prefs.resolveFavorite(p,42,4,'local',local.key,ls(),ss()),null);
  media.relabel(m,42,local.key,4,2);const corrected=ls().find(row=>row.key===local.key);assert.equal(corrected.episodeGuess,4);assert.equal(corrected.seasonGuess,2);assert.equal(corrected.episodeEndGuess,0);assert.equal(prefs.resolveFavorite(p,42,3,'local',local.key,ls(),ss()),null);
  assert.equal((await media.locateKey(m,42,local.key)).ok,true);assert.throws(()=>media.relabel(m,43,local.key,1,1));
  media.remove(m,local.key);assert(fs.existsSync(path.join(dir,filename)));assert.equal(prefs.overview(p,ls(),ss()).groups.find(g=>g.malId===42).favorite,null);
  prefs.setFavorite(p,42,'stream',a.key,ls(),ss());prefs.setFavorite(p,42,null,null,ls(),ss());assert.equal(prefs.read(p).favorites.length,0);
  prefs.setDisplay(p,'off');assert.equal(prefs.overview(p,ls(),ss()).display,'off');
  console.log('OK private preferences: exact source identity, scoped favorite, no URLs or paths in overview, persistent visibility, relabel and safe unlink.');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
