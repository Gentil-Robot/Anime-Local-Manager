'use strict';
// Run explicitly with the pinned Electron executable. This is a disposable
// profile and a real utility process, never the user's installed application.
const {app,utilityProcess}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {createServerProcess}=require('../lib/server-process');
const {createEngineSupervisor}=require('../lib/engine-supervisor');
// The Node driver removes this profile only after Electron has released it.
const directory=process.env.ALM_NATIVE_TEST_DIRECTORY||fs.mkdtempSync(path.join(os.tmpdir(),'alm-engine-native-'));
let engine,supervisor,blocker;const children=[];
app.disableHardwareAcceleration();app.setPath('userData',path.join(directory,'electron'));
process.env.ALM_DATA_DIR=path.join(directory,'data');process.env.ALM_IMAGES_DIR=path.join(directory,'images');
process.env.ALM_RELEASE_SMOKE='1';process.env.ALM_MAINTENANCE_MODE='1';process.env.ALM_AUTOMATION_STARTUP='0';
fs.mkdirSync(process.env.ALM_DATA_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.ALM_DATA_DIR,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const timeout=setTimeout(()=>{console.error('ALM_NATIVE_RECOVERY_TIMEOUT');for(const child of children)child.kill();app.exit(1);},60000);
async function run(){
 await app.whenReady();assert.equal(process.versions.electron,require('../package.json').devDependencies.electron);
 const create=()=>{
  process.env.ALM_SESSION_TOKEN=crypto.randomBytes(32).toString('hex');
  return engine=createServerProcess({fork(...args){const child=utilityProcess.fork(...args);children.push(child);return child;}});
 };
 let port,cookie,firstCookie,seen=0,resolveRecovered,rejectRecovered;
 const recovered=new Promise((resolve,reject)=>{resolveRecovered=resolve;rejectRecovered=reject;});
 const connect=async candidate=>{
  const resource=await candidate.startServer(3123);port=resource.almPort;
  const page=await fetch('http://127.0.0.1:'+port);cookie=page.headers.get('set-cookie').split(';')[0];
  return resource;
 };
 const first=create();await connect(first);firstCookie=cookie;
 const request=(suffix,options={})=>fetch('http://127.0.0.1:'+port+suffix,{...options,headers:{cookie,...options.headers},signal:AbortSignal.timeout(10000)});
 const response=await request('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Fictional native recovery',status:'Watching',episodesSeen:'3',episodesTotal:'12',score:'8',notes:'Fictional persisted note',autoInfo:false})});
 assert.equal(response.status,200,await response.text());
 const before=await(await request('/api/animes')).json();assert.equal(before.length,1);
 supervisor=createEngineSupervisor({initial:first,create,reconnect:connect,onFailure:async(info,controls)=>{
  try {
   seen++;assert.equal(info.reason,'exit');
   const oldPort=port;blocker=http.createServer((_req,res)=>res.end('fictional port occupation'));
   await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(oldPort,'127.0.0.1',resolve);});
   await controls.restart();resolveRecovered();
  }catch(error){rejectRecovered(error);}
 }});
 children[0].kill();await recovered;
 assert.equal(seen,1);assert.equal(children.length,2);assert.notEqual(cookie,firstCookie);
 assert.equal((await request('/api/animes',{headers:{cookie:firstCookie}})).status,403,'Old local session cookie is rejected after replacement');
 const after=await(await request('/api/animes')).json();assert.deepEqual(after,before);
 assert.equal((await engine.ping()).ok,true);
 console.log('ALM_NATIVE_RECOVERY_OK '+JSON.stringify({electron:process.versions.electron,node:process.versions.node,utilities:children.length,portFallback:true,localTokenRotated:true,persistedRows:after.length,notesPreserved:after[0].notes==='Fictional persisted note'}));
}
run().then(async()=>{supervisor?.dispose();await engine?.shutdown();await engine?.terminate();await new Promise(resolve=>blocker?.listening?blocker.close(resolve):resolve());clearTimeout(timeout);app.quit();}).catch(async error=>{console.error(error);supervisor?.dispose();for(const child of children)child.kill();clearTimeout(timeout);await new Promise(resolve=>setTimeout(resolve,100));app.exit(1);});
