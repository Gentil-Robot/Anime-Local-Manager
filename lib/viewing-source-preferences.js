'use strict';
// Private local preferences. No paths or URLs in the lightweight overview.
const fs=require('node:fs'),{atomicWrite}=require('./atomic-file');
const modes=new Set(['always','associated','details','off']),LIMIT=3000,MAX_BYTES=512*1024;
const idOK=id=>Number.isSafeInteger(id)&&id>0&&id<=100000000;
const keyOK=(kind,key)=>typeof key==='string'&&(kind==='local'?/^[a-f0-9]{64}$/.test(key):kind==='stream'&&/^[a-f0-9]{32}$/.test(key));
function read(file){
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('ALM_SOURCE_PREFS_INVALID');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(state?.schema!==1||!modes.has(state.display)||!Array.isArray(state.favorites)||state.favorites.length>LIMIT)throw Error('ALM_SOURCE_PREFS_INVALID');
  const ids=new Set();for(const row of state.favorites){if(!idOK(row?.malId)||!keyOK(row.kind,row.key)||ids.has(row.malId))throw Error('ALM_SOURCE_PREFS_INVALID');ids.add(row.malId);}
  return state;
 }catch(error){if(error.code==='ENOENT')return {schema:1,display:'always',favorites:[]};throw error;}
}
function write(file,state){
 const json=JSON.stringify(state);if(state.favorites.length>LIMIT||Buffer.byteLength(json)>MAX_BYTES)throw Error('ALM_SOURCE_LIMIT');atomicWrite(file,json);
}
function group(state,local,stream){
 const groups=new Map(),selected=new Map(state.favorites.map(f=>[f.malId,f]));
 const row=id=>{if(!groups.has(id))groups.set(id,{malId:id,localCount:0,streamCount:0,favorite:null});return groups.get(id);};
 for(const item of local){if(!idOK(item.malId))continue;const g=row(item.malId),f=selected.get(item.malId);g.localCount++;
  if(f?.kind==='local'&&f.key===item.key&&!item.legacy&&(item.wholeWork||item.episodeGuess>0))g.favorite={kind:'local',key:item.key,episode:item.episodeGuess||0,end:Math.max(item.episodeGuess||0,item.episodeEndGuess||0),wholeWork:item.wholeWork===true};
 }
 for(const item of stream){if(!idOK(item.malId))continue;const g=row(item.malId),f=selected.get(item.malId);g.streamCount++;
  if(f?.kind==='stream'&&f.key===item.key)g.favorite={kind:'stream',key:item.key,episode:item.episode,end:item.episode,wholeWork:item.episode===0};
 }
 return {display:state.display,groups:[...groups.values()]};
}
function overview(file,local,stream){return group(read(file),local,stream);}
function setDisplay(file,display){
 if(!modes.has(display))throw Error('ALM_SOURCE_PREFS_INVALID');const state=read(file);write(file,{...state,display});return true;
}
function setFavorite(file,id,kind,key,local,stream){
 if(!idOK(id)||!(kind===null&&key===null||keyOK(kind,key)))throw Error('ALM_SOURCE_PREFS_INVALID');
 const state=read(file);
 if(kind!==null){
  const target=(kind==='local'?local:stream).find(item=>item.malId===id&&item.key===key);
  if(!target||kind==='local'&&(target.legacy||!target.wholeWork&&!target.episodeGuess))throw Error('ALM_SOURCE_PREFS_INVALID');
 }
 // Drop stale preferences while writing. Removing a source never removes a video.
 const active=new Map(group(state,local,stream).groups.map(g=>[g.malId,g.favorite]));
 const favorites=state.favorites.filter(f=>f.malId!==id&&active.get(f.malId)?.key===f.key&&active.get(f.malId)?.kind===f.kind);
 if(kind!==null)favorites.push({malId:id,kind,key});
 write(file,{...state,favorites});return true;
}
module.exports={read,overview,setDisplay,setFavorite};
