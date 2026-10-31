'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const viewing=require('../lib/viewing'),backup=require('../lib/encrypted-backup');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alm38-'));let checks=0;
const ok=message=>{checks++;console.log('OK Beta38:',message);};
(async()=>{
 assert.equal(viewing.validDate('2024-02-29'),'2024-02-29');assert.equal(viewing.validDate('2025-02-29'),'');assert.equal(viewing.validDate('2026-13-01'),'');
 ok('dates are actual calendar dates, including leap years');
 let anime={id:1,title:'Test',status:'Completed',episodesSeen:'',episodesTotal:''};
 assert.equal(viewing.completeEpisodes(anime,{episodes:12}).episodesSeen,'12');assert.equal(viewing.completeEpisodes({...anime,episodesSeen:'9'}).episodesTotal,'9');assert(viewing.completeEpisodes(anime).completionNeedsEpisodes);
 ok('completion uses exact metadata, then watched count; no invented total');
 const imported=viewing.recordViewing(null,{...anime,episodesSeen:'12'});assert.equal(imported.completedOn,'');assert.deepEqual(imported.watchEvents,[]);
 const before={...anime,status:'Watching',episodesSeen:'3'};
 const dated=viewing.recordViewing(before,{...before,episodesSeen:'4'},{watchedOn:'2026-10-04'});assert.equal(dated.watchEvents[0].episodes,1);
 const correction=viewing.recordViewing(dated,{...dated,episodesSeen:'3'},{});assert.equal(correction.watchEvents.length,1);
 const done=viewing.recordViewing(dated,{...dated,status:'Completed'},{completedOn:'2025-11-03'});
 const data=viewing.viewingData([done,imported],2025);assert.equal(data.completed.length,1);assert.equal(data.undated.length,1);assert.equal(data.days.length,0);assert.equal(viewing.viewingData([done],2026).days[0].episodes,1);
 ok('past imports stay undated; explicitly dated viewing and completion are distinct');
 assert.throws(()=>viewing.recordViewing(before,before,{completedOn:'bad'}));assert.throws(()=>viewing.viewingData([],NaN));ok('invalid dates and years are rejected');
 const payload={app:'Anime Local Manager',version:'test',data:{animes:[done],config:{betaseriesApiKey:'private-fixture'}}};
 const password='Une phrase de test assez longue';
 const bytes=await backup.encrypt(payload,password);assert(!bytes.includes(Buffer.from('private-fixture')));assert(!bytes.includes(Buffer.from(done.title)));assert.deepEqual(await backup.decrypt(bytes,password),payload);
 const second=await backup.encrypt(payload,password);assert(!bytes.equals(second));ok('AES-GCM round trip protects content and uses fresh nonces and salt');
 await assert.rejects(backup.decrypt(bytes,'Une autre phrase très longue'));const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;await assert.rejects(backup.decrypt(corrupt,password));await assert.rejects(backup.decrypt(bytes.subarray(0,52),password));ok('wrong password, corruption and truncation fail authentication');
 const images=path.join(temp,'images'),dest=path.join(temp,'dest');fs.mkdirSync(images);fs.mkdirSync(dest);fs.writeFileSync(path.join(images,'猫.png'),Buffer.from('image fixture'));
 const withPoster={...payload,data:{...payload.data,animes:[{...done,poster:'/images/猫.png'}]}};
 const attached=await backup.attachImages(withPoster,images);assert.equal(backup.validateImages(attached)[0].name,'猫.png');assert.throws(()=>backup.validateImages({...attached,images:[{...attached.images[0],name:'../escape.png'}]}));ok('local posters round trip, Unicode names work, traversal is rejected');
 let now=Date.now(),calls=0;const file=path.join(temp,'settings.json');
 const manager=backup.createBackupManager({settingsFile:file,imagesDir:images,now:()=>now,getPayload:async()=>{calls++;return payload;}});
 try{
  await manager.configure({directory:dest,intervalHours:24,retention:2,password,enabled:true});assert(!fs.readFileSync(file,'utf8').includes(password));
  fs.writeFileSync(path.join(dest,'other-user-file.txt'),'preserve');
  await Promise.all([manager.run(),manager.run()]);assert.equal(calls,1);await manager.tick();assert.equal(calls,1);
  now+=25*3600000;await manager.tick();assert.equal(calls,2);now+=25*3600000;await manager.tick();assert.equal(calls,3);
  const names=fs.readdirSync(dest).filter(n=>n.endsWith('.alm-backup'));assert.equal(names.length,2);assert.equal(fs.readFileSync(path.join(dest,'other-user-file.txt'),'utf8'),'preserve');
  for(const name of names)assert.equal((await backup.decrypt(fs.readFileSync(path.join(dest,name)),password)).data.animes.length,1);
  ok('automatic schedule coalesces concurrent runs, retains only its own files and never stores a plaintext password');
 }finally{manager.stop();}
 const restarted=backup.createBackupManager({settingsFile:file,imagesDir:images,getPayload:async()=>payload});
 try{assert(!restarted.state().unlocked);await assert.rejects(restarted.run(),/LOCKED/);await restarted.configureStorage({load:async()=>password,save:async()=>{}});assert(restarted.state().unlocked);ok('restart needs a vault or explicit unlock; no silent plaintext fallback');}finally{restarted.stop();}
 console.log(checks+' Beta38 checks passed. No native OS-vault or Windows execution claim.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
