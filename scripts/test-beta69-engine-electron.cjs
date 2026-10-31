'use strict';
// Test-only launcher; excluded from the installed application.
const {app,utilityProcess,safeStorage}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {observeUtility}=require('./build-cleanup');
let engine,utility;
async function nativeSecrets(archive,profile,nonce){
 const ready=await safeStorage.isAsyncEncryptionAvailable();
 if(!ready || safeStorage.getSelectedStorageBackend?.()==='basic_text'){
  if(process.platform==='win32')throw Error('OS secret storage unavailable on Windows');
  return 'not-available';
 }
 const S=require(path.join(archive,'lib/system-secrets.js'));
 const dataDir=path.join(profile,'electron'),keyFile=path.join(dataDir,'connections-key.bin');
 const oldKey=require('node:crypto').createHash('sha256').update(nonce).digest('base64');
 // Generate a synthetic legacy ciphertext on the *test* profile only.
 // The production main process must never call these deprecated APIs.
 const legacy=safeStorage.encryptString(oldKey);fs.writeFileSync(keyFile,legacy);
 assert.equal(await S.configKey(safeStorage,dataDir),oldKey);
 assert.deepEqual(fs.readFileSync(keyFile),legacy,'legacy ciphertext is preserved');
 const asyncCipher=await safeStorage.encryptStringAsync('synthetic backup '+nonce);
 const opened=await safeStorage.decryptStringAsync(asyncCipher);
 assert.equal(opened.result,'synthetic backup '+nonce);
 assert.equal(typeof opened.shouldReEncrypt,'boolean');
 return 'passed';
}
async function run(){
 const {ALM_PACKAGE_ARCHIVE:archive,ALM_PACKAGE_PROFILE:profile,ALM_PACKAGE_PHASE:phase,ALM_PACKAGE_NONCE:nonce}=process.env;
 assert(path.isAbsolute(archive)&&fs.existsSync(archive));assert(path.isAbsolute(profile)&&path.basename(profile).startsWith('alm69-profile-'));assert(['missing','seed','verify'].includes(phase));assert(/^[a-f0-9]{64}$/.test(nonce));
 fs.mkdirSync(path.join(profile,'electron'),{recursive:true});app.disableHardwareAcceleration();app.setPath('userData',path.join(profile,'electron'));app.setPath('sessionData',path.join(profile,'electron'));
 process.env.ALM_DATA_DIR=path.join(profile,'data');process.env.ALM_IMAGES_DIR=path.join(profile,'images');process.env.ALM_AUTOMATION_STARTUP='0';process.env.ALM_RELEASE_SMOKE='1';process.env.ALM_SESSION_TOKEN=nonce;delete process.env.ALM_CONFIG_KEY;delete process.env.ALM_TEST_PROFILE;
 fs.mkdirSync(process.env.ALM_DATA_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.ALM_DATA_DIR,'config.json'),JSON.stringify({preloadMetadataOnStart:true,metadataUpdateOnStart:false,metadataAutonomousUpdateOnStart:false,metadataAutonomousLearnFromSearch:false}));
 const timer=setTimeout(()=>{console.error('ALM_PACKAGE_ENGINE_TIMEOUT');engine?.kill();app.exit(1);},150000);timer.unref();
 await app.whenReady();
 try{
  const expected=require(path.join(archive,'package.json')),expectedElectron=expected.devDependencies?.electron||process.env.ALM_PACKAGE_ELECTRON;
  assert(/^\d+\.\d+\.\d+$/.test(expectedElectron));assert.equal(process.versions.electron,expectedElectron);
  engine=require(path.join(archive,'lib/server-process.js')).createServerProcess({fork(...args){const child=utilityProcess.fork(...args);utility=observeUtility(child);return child;}});
  if(phase==='missing'){
   await assert.rejects(engine.startServer(0),error=>error.code==='ALM_ENGINE_STOPPED'&&error.exitCode===1&&/Cannot find module.*content-policy/s.test(error.message));
   console.log('ALM_PACKAGE_ENGINE_OK '+JSON.stringify({phase,electron:process.versions.electron,missingModuleRejected:true}));return;
  }
  const nativeStorage=phase==='seed'?await nativeSecrets(archive,profile,nonce):'not-exercised';
  const server=await engine.startServer(0),base='http://127.0.0.1:'+server.almPort;
  assert.equal((await fetch(base+'/api/animes')).status,403);
  const page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0];assert(cookie.startsWith('alm_session='));
  const get=async route=>{const response=await fetch(base+route,{headers:{cookie}});assert(response.ok,route);return response.json();};
  const metadata=await get('/api/metadata/status');assert.equal(Number(metadata.count),30430);
  let items=await get('/api/animes');const note='ALM package persistence '+nonce;
  if(phase==='seed'){
   assert.equal(items.length,0);
   const xml='<?xml version="1.0" encoding="UTF-8"?><myanimelist><anime><series_animedb_id>28907</series_animedb_id><series_title>Gate: Jieitai Kanochi nite, Kaku Tatakaeri</series_title><series_type>TV</series_type><series_episodes>12</series_episodes><my_watched_episodes>3</my_watched_episodes><my_score>8</my_score><my_status>Watching</my_status><my_comments>'+note+'</my_comments></anime></myanimelist>';
   const form=new FormData();form.append('file',new Blob([xml],{type:'application/xml'}),'package-test.xml');const imported=await fetch(base+'/api/import/xml',{method:'POST',headers:{cookie,Origin:base},body:form});assert(imported.ok,await imported.text());items=await get('/api/animes');
  }
  assert.equal(items.length,1);assert.equal(items[0].notes,note);assert.equal(Number(items[0].episodesSeen),3);assert.equal(Number(items[0].score),8);assert.equal(items[0].status,'Watching');
  const backup=await get('/api/backup/export');assert(JSON.stringify(backup).includes(note));await engine.shutdown();
  console.log('ALM_PACKAGE_ENGINE_OK '+JSON.stringify({phase,electron:process.versions.electron,catalogue:30430,imported:1,backup:true,persistence:phase==='verify',nativeStorage}));
 }finally{clearTimeout(timer);if(utility)await utility.stop();}
}
run().then(()=>app.quit()).catch(error=>{console.error(error);engine?.kill();app.exit(1);});
