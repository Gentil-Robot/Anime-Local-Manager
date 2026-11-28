'use strict';
// Private, opt-in bookmarks. ALM never requests these URLs or sends them to its servers.
const fs=require('node:fs'),crypto=require('node:crypto'),{atomicWrite}=require('./atomic-file');
const MAX_ROWS=3000,MAX_BYTES=1024*1024;
const validId=v=>Number.isSafeInteger(v)&&v>0&&v<=100000000;
const validEpisode=v=>Number.isSafeInteger(v)&&v>=0&&v<=999;
const validKey=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
function validateUrl(raw){
 if(typeof raw!=='string'||raw.length>2048||/[\u0000-\u0020\u007f\\]/.test(raw))throw Error('ALM_SOURCE_URL_INVALID');
 let u;try{u=new URL(raw);}catch{throw Error('ALM_SOURCE_URL_INVALID');}
 if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password||u.href.length>2048)throw Error('ALM_SOURCE_URL_INVALID');
 return u.href;
}
function clean(input){
 if(!input||!validId(input.malId)||!validEpisode(input.episode))throw Error('ALM_SOURCE_INVALID');
 const url=validateUrl(input.url);
 if(typeof input.label!=='string'||input.label.length>100||/[\u0000-\u001f\u007f]/.test(input.label))throw Error('ALM_SOURCE_INVALID');
 return {malId:input.malId,episode:input.episode,label:input.label.trim()||new URL(url).hostname,url};
}
function load(file){
 try{
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('ALM_SOURCE_STORE_INVALID');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data?.schema!==1||!Array.isArray(data.items)||data.items.length>MAX_ROWS)throw Error('ALM_SOURCE_STORE_INVALID');
  const keys=new Set();return data.items.map(row=>{if(!validKey(row?.key)||keys.has(row.key))throw Error('ALM_SOURCE_STORE_INVALID');keys.add(row.key);return {...clean(row),key:row.key};});
 }catch(err){if(err.code==='ENOENT')return [];throw err;}
}
function save(file,items){
 const json=JSON.stringify({schema:1,items});if(items.length>MAX_ROWS||Buffer.byteLength(json)>MAX_BYTES)throw Error('ALM_SOURCE_LIMIT');atomicWrite(file,json);
}
function list(file,malId){if(!validId(malId))throw Error('ALM_SOURCE_INVALID');return load(file).filter(row=>row.malId===malId);}
function put(file,input){
 const cleanRow=clean(input),items=load(file);let key=input.key;
 if(key!==undefined){if(!validKey(key)||!items.some(row=>row.key===key&&row.malId===cleanRow.malId))throw Error('ALM_SOURCE_INVALID');}
 else {const old=items.find(row=>row.malId===cleanRow.malId&&row.episode===cleanRow.episode&&row.url===cleanRow.url);key=old?.key||crypto.randomBytes(16).toString('hex');}
 const row={...cleanRow,key};save(file,[...items.filter(item=>item.key!==key),row]);return row;
}
function remove(file,malId,key){
 if(!validId(malId)||!validKey(key))throw Error('ALM_SOURCE_INVALID');
 const before=load(file),after=before.filter(row=>row.malId!==malId||row.key!==key);if(after.length===before.length)return false;save(file,after);return true;
}
function get(file,malId,key){if(!validKey(key))throw Error('ALM_SOURCE_INVALID');return list(file,malId).find(row=>row.key===key)||null;}
module.exports={validateUrl,list,put,remove,get};
