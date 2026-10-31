'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {atomicJson}=require('./atomic-file');
function prepareReleaseSmoke(app,env=process.env){
 if(env.ALM_RELEASE_SMOKE!=='1')return null;
 const profile=path.resolve(env.ALM_RELEASE_PROFILE||''),relative=path.relative(fs.realpathSync(os.tmpdir()),profile);
 if(!env.ALM_RELEASE_PROFILE||!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(profile).startsWith('alm-release-'))throw Error('ALM_SMOKE_PROFILE_REJECTED');
 if(!fs.existsSync(profile)||fs.lstatSync(profile).isSymbolicLink()||fs.realpathSync(profile).toLowerCase()!==profile.toLowerCase())throw Error('ALM_SMOKE_PROFILE_REJECTED');
 const marker=JSON.parse(fs.readFileSync(path.join(profile,'.alm-release-test.json'),'utf8'));
 if(!/^[a-f0-9]{64}$/.test(env.ALM_RELEASE_NONCE||'')||marker.nonce!==env.ALM_RELEASE_NONCE||!['seed','verify'].includes(marker.phase))throw Error('ALM_SMOKE_TOKEN_REJECTED');
 if(!Number.isSafeInteger(marker.expectedCount)||marker.expectedCount<10000)throw Error('ALM_SMOKE_CATALOGUE_EXPECTATION');
 app.setPath('userData',profile);app.setPath('sessionData',profile);
 fs.mkdirSync(path.join(profile,'data'),{recursive:true});atomicJson(path.join(profile,'data/config.json'),{preloadMetadataOnStart:true,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false,metadataAutonomousLearnFromSearch:false});
 fs.writeFileSync(path.join(profile,'app-language.txt'),'fr');env.ALM_AUTOMATION_STARTUP='0';
 const context={profile,nonce:marker.nonce,phase:marker.phase,expectedCount:marker.expectedCount,result:path.join(profile,'smoke-result.json')};
 checkpoint(context,'profile-ready');return context;
}
function checkpoint(context,stage){if(context){context.stage=stage;atomicJson(context.result,{schema:1,status:'running',nonce:context.nonce,phase:context.phase,stage});}}
function rendererScript(context){return '('+rendererChecks.toString()+')('+JSON.stringify({nonce:context.nonce,phase:context.phase,expectedCount:context.expectedCount})+')';}
async function rendererChecks({nonce,phase,expectedCount}){
 const get=async url=>{const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status+' '+url);return response.json();};
 if(!document.title.includes('Anime Local Manager'))throw Error('ALM_SMOKE_UI');
 // Verify the media through the REAL installed application's HTTP server.
 // The source tree / win-unpacked directory can contain the clip even when the
 // NSIS payload accidentally omits it; merely checking the ASAR is insufficient.
 const clip=await fetch('/assets/alm-clip-complet-1080p.mp4',{headers:{Range:'bytes=0-31'}});
 if(clip.status!==206 || !/^bytes 0-31\/\d+$/i.test(clip.headers.get('content-range')||'') || (await clip.arrayBuffer()).byteLength!==32)
  throw Error('ALM_SMOKE_CLIP_MISSING');
 let metadata;const deadline=Date.now()+120000;do{metadata=await get('/api/metadata/status');if(Number(metadata.count)===expectedCount)break;await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);if(Number(metadata.count)!==expectedCount)throw Error('ALM_SMOKE_CATALOGUE');
 let items=await get('/api/animes');const note='ALM release smoke '+nonce;
 if(phase==='seed'){
  if(items.length)throw Error('ALM_SMOKE_PROFILE_NOT_EMPTY');
  const xml='<?xml version="1.0" encoding="UTF-8"?><myanimelist><anime><series_animedb_id>28907</series_animedb_id><series_title>Gate: Jieitai Kanochi nite, Kaku Tatakaeri</series_title><series_type>TV</series_type><series_episodes>12</series_episodes><my_watched_episodes>3</my_watched_episodes><my_score>8</my_score><my_status>Watching</my_status><my_comments>'+note+'</my_comments></anime></myanimelist>';
  const form=new FormData();form.append('file',new Blob([xml],{type:'application/xml'}),'release-smoke.xml');
  const imported=await fetch('/api/import/xml',{method:'POST',body:form});if(!imported.ok)throw Error('ALM_SMOKE_IMPORT');items=await get('/api/animes');
 }
 const record=items.find(a=>a.notes===note);if(items.length!==1||!record||record.malId&&Number(record.malId)!==28907||Number(record.episodesSeen)!==3||record.status!=='Watching'||record.notes!==note)throw Error('ALM_SMOKE_PERSISTENCE');
 const backup=await get('/api/backup/export');if(!JSON.stringify(backup).includes(note))throw Error('ALM_SMOKE_BACKUP');
 return {ui:true,catalogueCount:Number(metadata.count),imported:1,episodesSeen:3,persistence:phase==='verify',backup:true};
}
async function executeReleaseSmoke({context,app,window,close}){
 let result;
 try{if(!app.isPackaged)throw Error('ALM_SMOKE_NOT_PACKAGED');checkpoint(context,'renderer-checks');result=await window.webContents.executeJavaScript(rendererScript(context));checkpoint(context,'persistence-close');await close();atomicJson(context.result,{schema:1,status:'passed',nonce:context.nonce,phase:context.phase,version:app.getVersion(),runtime:{electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome},packaged:true,...result});app.quit();}
 catch(error){try{await close();}catch{}atomicJson(context.result,{schema:1,status:'failed',nonce:context.nonce,phase:context.phase,stage:context.stage,error:error.message});app.exit(1);}
}
module.exports={prepareReleaseSmoke,rendererScript,rendererChecks,executeReleaseSmoke,checkpoint};
