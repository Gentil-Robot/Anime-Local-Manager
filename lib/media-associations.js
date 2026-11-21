'use strict';
// Private, opt-in ALM 2.2.0 media associations. Only local metadata is saved.
// No file content is read, moved, uploaded or included in ALM backups.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {atomicJson}=require('./atomic-file');
const MAX_ASSOCIATIONS=3000;
const key=(root,relative)=>crypto.createHash('sha256').update(root+'\0'+relative).digest('hex');
function load(file){
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('ALM_MEDIA_ASSOCIATIONS_INVALID');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data?.schema!==1||!Array.isArray(data.items)||data.items.length>MAX_ASSOCIATIONS)throw Error('ALM_MEDIA_ASSOCIATIONS_INVALID');
  return data.items.filter(x=>x&&/^[a-f0-9]{64}$/.test(x.key)&&Number.isSafeInteger(x.malId)&&x.malId>0&&x.malId<=100000000&&typeof x.filename==='string'&&x.filename.length<350);
 }catch(error){if(error.code==='ENOENT')return [];throw error;}
}
function record(file,{root,relativePath,filename,malId,episodeGuess=0}={}){
 const id=Number(malId),ep=Number(episodeGuess);
 if(typeof root!=='string'||!path.isAbsolute(root)||typeof relativePath!=='string'||relativePath.includes('\0')||!relativePath||relativePath.length>1500||!filename||filename.length>300||!Number.isSafeInteger(id)||id<=0||id>100000000||!Number.isSafeInteger(ep)||ep<0||ep>999)throw Error('ALM_MEDIA_ASSOCIATION_INVALID');
 const entry={key:key(root,relativePath),malId:id,episodeGuess:ep,filename:String(filename).slice(0,300),at:new Date().toISOString()};
 let items=load(file).filter(x=>x.key!==entry.key);
 if(items.length>=MAX_ASSOCIATIONS)items=items.slice(1);
 items.push(entry);atomicJson(file,{schema:1,items});return entry;
}
function remove(file,hash){if(!/^[a-f0-9]{64}$/.test(String(hash||'')))throw Error('ALM_MEDIA_ASSOCIATION_INVALID');const old=load(file),items=old.filter(x=>x.key!==hash);if(items.length!==old.length)atomicJson(file,{schema:1,items});return items.length!==old.length;}
function summary(file){const counts=new Map();for(const row of load(file)){const old=counts.get(row.malId)||{malId:row.malId,count:0,latestEpisode:0};old.count++;old.latestEpisode=Math.max(old.latestEpisode,row.episodeGuess);counts.set(row.malId,old);}return [...counts.values()];}
module.exports={key,load,record,remove,summary};
