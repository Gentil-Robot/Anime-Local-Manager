'use strict';
// ALM 2.2.0 — opt-in media links. Paths never leave userData and are not
// exported, uploaded, included in cloud profiles or stored in the SQL catalog.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {atomicWrite}=require('./atomic-file');
const {VIDEO_EXTENSIONS}=require('./local-media-index');
const MAX_ASSOCIATIONS=3000,MAX_FILE_BYTES=1024*1024;
function save(file,items){const payload=JSON.stringify({schema:1,items});if(items.length>MAX_ASSOCIATIONS||Buffer.byteLength(payload,'utf8')>MAX_FILE_BYTES)throw Error('ALM_MEDIA_ASSOCIATION_LIMIT');atomicWrite(file,payload);}
const key=(root,relative)=>crypto.createHash('sha256').update(root+'\0'+relative).digest('hex');
const integer=(value,max)=>Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=max;
function relativeIsSafe(relative){
 if(typeof relative!=='string'||!relative||relative.length>1500||relative.includes('\0')||path.isAbsolute(relative))return false;
 const parts=relative.split(/[\\/]/);
 if(parts.some(part=>!part||part==='.'||part==='..'||part.includes(':')))return false;
 return VIDEO_EXTENSIONS.has(path.extname(parts.at(-1)).toLowerCase());
}
function validRoot(root){return typeof root==='string'&&root.length<1900&&path.isAbsolute(root)&&!root.includes('\0');}
function contained(root,absolute){
 const delta=path.relative(root,absolute);
 return !!delta&&delta!=='.'&&delta!=='..'&&!delta.startsWith('..'+path.sep)&&!path.isAbsolute(delta);
}
function load(file){
 try{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)throw Error('ALM_MEDIA_ASSOCIATIONS_INVALID');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data?.schema!==1||!Array.isArray(data.items)||data.items.length>MAX_ASSOCIATIONS)throw Error('ALM_MEDIA_ASSOCIATIONS_INVALID');
  return data.items.filter(x=>x&&/^[a-f0-9]{64}$/.test(x.key)&&integer(x.malId,100000000)&&Number(x.malId)>0
   &&typeof x.filename==='string'&&x.filename.length<350&&integer(x.episodeGuess??0,999)
   &&integer(x.seasonGuess??0,99)
   &&integer(x.episodeEndGuess??0,999)
   &&(!x.episodeEndGuess||Number(x.episodeEndGuess)>=Number(x.episodeGuess)&&Number(x.episodeEndGuess)-Number(x.episodeGuess)<=6)
   &&(x.wholeWork!==true||Number(x.episodeGuess)===0&&!x.episodeEndGuess)
   &&((!x.root&&!x.relativePath)||(validRoot(x.root)&&relativeIsSafe(x.relativePath)&&x.filename===x.relativePath.split(/[\\/]/).at(-1)&&x.key===key(x.root,x.relativePath))));
 }catch(error){if(error.code==='ENOENT')return [];throw error;}
}
function record(file,{root,relativePath,filename,malId,episodeGuess=0,seasonGuess=0,episodeEndGuess=0,wholeWork=false}={}){
 const id=Number(malId),ep=Number(episodeGuess),season=Number(seasonGuess),end=Number(episodeEndGuess)||0;
 if(!validRoot(root)||!relativeIsSafe(relativePath)||typeof filename!=='string'||filename.length>300
   ||filename!==relativePath.split(/[\\/]/).at(-1)||!integer(id,100000000)||id<1
   ||!integer(ep,999)||!integer(season,99)||!integer(end,999)||wholeWork===true&&(ep!==0||end!==0)||end&&(end<ep||end-ep>6))throw Error('ALM_MEDIA_ASSOCIATION_INVALID');
 const full=path.resolve(root,relativePath);
 if(!contained(root,full))throw Error('ALM_MEDIA_ASSOCIATION_INVALID');
 const entry={key:key(root,relativePath),malId:id,episodeGuess:ep,seasonGuess:season,episodeEndGuess:end,filename,
   root,relativePath,wholeWork:wholeWork===true,at:new Date().toISOString()};
 let items=load(file).filter(x=>x.key!==entry.key);
 if(items.length>=MAX_ASSOCIATIONS)throw Error('ALM_MEDIA_ASSOCIATION_LIMIT');
 items.push(entry);save(file,items);return {key:entry.key,malId:id,episodeGuess:ep,seasonGuess:season};
}
function remove(file,hash){
 if(!/^[a-f0-9]{64}$/.test(String(hash||'')))throw Error('ALM_MEDIA_ASSOCIATION_INVALID');
 const old=load(file),items=old.filter(x=>x.key!==hash);
 if(items.length!==old.length)save(file,items);
 return items.length!==old.length;
}
function summary(file){
 const counts=new Map();
 for(const row of load(file)){
  const old=counts.get(row.malId)||{malId:row.malId,count:0,latestEpisode:0,episodes:[]};
  old.count++;old.latestEpisode=Math.max(old.latestEpisode,row.episodeGuess);
  const end=Math.max(row.episodeGuess,Math.min(row.episodeEndGuess||0,row.episodeGuess+6));
  if(row.episodeGuess>0)for(let i=row.episodeGuess;i<=end;i++)old.episodes.push(i);
  counts.set(row.malId,old);
 }
 return [...counts.values()].map(row=>({...row,episodes:[...new Set(row.episodes)].sort((a,b)=>a-b)}));
}
// Only benign metadata is returned over IPC; root and absolute paths stay in main.
function list(file){
 return load(file).map(row=>({key:row.key,malId:row.malId,episodeGuess:row.episodeGuess||0,
  seasonGuess:row.seasonGuess||0,wholeWork:row.wholeWork===true,filename:row.filename,folder:row.root?path.basename(row.root):'',
  legacy:!row.root||!row.relativePath}));
}
async function locate(file,malId,episode,options={}){
 return locateFromRows(load(file),malId,episode,options);
}
async function locateFromRows(rows,malId,episode,{fsp=fs.promises}={}){
 const id=Number(malId),ep=Number(episode);
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(ep)||ep<0||ep>999)return {ok:false,code:'ALM_MEDIA_SELECTION_INVALID'};
 const matches=rows.filter(row=>row.malId===id&&(ep===0?row.wholeWork===true&&row.episodeGuess===0:row.episodeGuess>0&&ep>=row.episodeGuess&&ep<=Math.max(row.episodeGuess,row.episodeEndGuess||0)));
 if(matches.length===0)return {ok:false,code:'ALM_MEDIA_EPISODE_NOT_ASSOCIATED'};
 if(matches.length!==1)return {ok:false,code:'ALM_MEDIA_EPISODE_AMBIGUOUS'};
 const row=matches[0];
 if(!validRoot(row.root)||!relativeIsSafe(row.relativePath))return {ok:false,code:'ALM_MEDIA_LEGACY_LINK'};
 const full=path.resolve(row.root,row.relativePath);
 if(!contained(row.root,full))return {ok:false,code:'ALM_MEDIA_PATH_INVALID'};
 try{
  const rootStat=await fsp.lstat(row.root),stat=await fsp.lstat(full);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!stat.isFile()||stat.isSymbolicLink())
   return {ok:false,code:'ALM_MEDIA_FILE_CHANGED'};
  const actualRoot=await fsp.realpath(row.root),actual=await fsp.realpath(full);
  if(!contained(actualRoot,actual))return {ok:false,code:'ALM_MEDIA_OUTSIDE_ROOT'};
  return {ok:true,absolutePath:actual,filename:row.filename};
 }catch(error){
  if(['EACCES','EPERM','ENOENT','ENOTDIR','EIO','ENODEV','ETIMEDOUT','EHOSTUNREACH'].includes(error.code))
   return {ok:false,code:'ALM_MEDIA_FILE_UNAVAILABLE'};
  throw error;
 }
}
// Explicit, bounded availability probe. No paths leave the main process.
// A timeout or disconnected NAS is "unverified/unavailable", never a missing-video claim.
async function availability(file,requests,{limit=40,timeoutMs=3500,locateEpisode=locate}={}){
 const cap=Math.max(1,Math.min(40,Number(limit)||40)),timeout=Math.max(100,Math.min(10000,Number(timeoutMs)||3500));
 const unique=new Map();
 for(const r of (Array.isArray(requests)?requests.slice(0,120):[])){
  const id=Number(r?.malId),ep=Number(r?.episode);
  if(Number.isSafeInteger(id)&&id>0&&id<=100000000&&Number.isSafeInteger(ep)&&ep>0&&ep<=999)unique.set(id+':'+ep,{malId:id,episode:ep});
  if(unique.size>=cap)break;
 }
 const entries=[...unique.values()],out=[];
 // Read and validate the bounded association file once for the entire batch.
 const snapshot=entries.length&&locateEpisode===locate?load(file):null;
 const lookup=snapshot?(id,ep)=>locateFromRows(snapshot,id,ep):(id,ep)=>locateEpisode(file,id,ep);
 // At most four filesystem checks at a time; abandon the rest on a timeout.
 for(let i=0;i<entries.length;i+=4){
  const batch=entries.slice(i,i+4);
  const results=await Promise.all(batch.map(async r=>{
   let timer;try{
    const result=await Promise.race([Promise.resolve().then(()=>lookup(r.malId,r.episode)),new Promise(resolve=>{timer=setTimeout(()=>resolve({ok:false,code:'ALM_MEDIA_CHECK_TIMEOUT'}),timeout);})]);
    return {...r,available:result?.ok===true,code:result?.ok?'':String(result?.code||'ALM_MEDIA_FILE_UNAVAILABLE')};
   }catch{return {...r,available:false,code:'ALM_MEDIA_FILE_UNAVAILABLE'};}finally{clearTimeout(timer);}
  }));out.push(...results);
  if(results.some(r=>r.code==='ALM_MEDIA_CHECK_TIMEOUT'))break;
 }return out;
}
module.exports={key,load,record,remove,summary,list,locate,availability,relativeIsSafe,contained};
