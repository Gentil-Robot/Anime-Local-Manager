'use strict';
const {app,utilityProcess}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'alm45-electron-'));process.env.ALM_DATA_DIR=profile;process.env.ALM_IMAGES_DIR=path.join(profile,'images');process.env.ALM_SESSION_TOKEN='e'.repeat(64);fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify({metadataUpdateOnStart:false,metadataAutonomousUpdateOnStart:false}));
let engine;app.whenReady().then(async()=>{try{
 engine=require('../lib/server-process').createServerProcess(utilityProcess);const server=await engine.startServer(0),base='http://127.0.0.1:'+server.almPort;
 assert.equal((await fetch(base+'/api/animes')).status,403);
 const page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0];assert(cookie.includes('alm_session='));
 const result=await fetch(base+'/api/storage',{headers:{cookie}});assert(result.ok);const state=await result.json();assert.equal(state.database.engine,'sqlite-disk');
 await engine.shutdown();for(const name of ['collection.sqlite','catalogue.sqlite','caches.sqlite']){const file=path.join(profile,name);fs.renameSync(file,file+'.closed');fs.renameSync(file+'.closed',file);}engine.kill();console.log('OK actual Electron utilityProcess: isolated server, protected session, disk SQLite and orderly shutdown');app.exit(0);
 }catch(error){console.error(error);engine?.kill();app.exit(1);}});
setTimeout(()=>{console.error('Electron integration timeout');engine?.kill();app.exit(1);},45000).unref();
