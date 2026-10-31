'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {promisify}=require('node:util');
const {atomicJson,atomicWrite}=require('./atomic-file');
const scrypt=promisify(crypto.scrypt),gzip=promisify(zlib.gzip),gunzip=promisify(zlib.gunzip);
const MAGIC=Buffer.from('ALMBK01\n'),MAX=128*1024*1024;
function passwordValid(password){if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)throw Error('ALM_BACKUP_PASSWORD');return password;}
async function derive(password,salt){return scrypt(passwordValid(password),salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
async function encrypt(payload,password){
 const plain=Buffer.from(JSON.stringify(payload));if(plain.length>MAX)throw Error('ALM_BACKUP_TOO_LARGE');
 const packed=await gzip(plain),salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=await derive(password,salt);
 try{const cipher=crypto.createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(MAGIC);
 return Buffer.concat([MAGIC,salt,iv,...encryptChunks(cipher,packed)]);
 }finally{key.fill(0);}
}
function encryptChunks(cipher,packed){const ciphertext=Buffer.concat([cipher.update(packed),cipher.final()]);return [cipher.getAuthTag(),ciphertext];}
async function decrypt(bytes,password){
 if(!Buffer.isBuffer(bytes)||bytes.length<53||bytes.length>MAX||!bytes.subarray(0,8).equals(MAGIC))throw Error('ALM_BACKUP_FORMAT');
 const key=await derive(password,bytes.subarray(8,24));
 try{const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(24,36),{authTagLength:16});cipher.setAAD(MAGIC);cipher.setAuthTag(bytes.subarray(36,52));
 const plain=await gunzip(Buffer.concat([cipher.update(bytes.subarray(52)),cipher.final()]),{maxOutputLength:MAX});
 const payload=JSON.parse(plain.toString('utf8'));
 if(payload?.app!=='Anime Local Manager'||!Array.isArray(payload?.data?.animes))throw Error('ALM_BACKUP_FORMAT');
 return payload;
 }catch{throw Error('ALM_BACKUP_INVALID_PASSWORD_OR_FILE');}finally{key.fill(0);}
}
async function attachImages(payload,imagesDir){
 const names=new Set();
 for(const anime of payload.data.animes){const poster=String(anime.poster||'');if(/^\/images\/[^/]+$/.test(poster))names.add(path.basename(poster));}
 const images=[];let bytes=Buffer.byteLength(JSON.stringify(payload));
 for(const name of names){
  const file=path.join(imagesDir,name);let stat;try{stat=await fsp.lstat(file);}catch{continue;}
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('ALM_BACKUP_IMAGE_INVALID');
  if(bytes+stat.size*1.4>MAX)throw Error('ALM_BACKUP_TOO_LARGE');
  const data=await fsp.readFile(file);bytes+=data.length*1.4;
  images.push({name,sha256:crypto.createHash('sha256').update(data).digest('hex'),data:data.toString('base64')});
 }
 return {...payload,images};
}
function validateImages(payload){
 if(payload.images!==undefined&&!Array.isArray(payload.images))throw Error('ALM_BACKUP_FORMAT');
 const names=new Set();let size=0;
 return (payload.images||[]).map(image=>{
  if(!image||typeof image.name!=='string'||!/^[-\p{L}\p{N}_ .()]+\.(?:png|jpe?g|webp|gif)$/iu.test(image.name)||image.name.length>160||names.has(image.name)||typeof image.data!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data))throw Error('ALM_BACKUP_IMAGE_INVALID');
  const bytes=Buffer.from(image.data,'base64');size+=bytes.length;names.add(image.name);
  if(size>MAX||crypto.createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw Error('ALM_BACKUP_IMAGE_INVALID');
  return {name:image.name,bytes};
 });
}
function createBackupManager({settingsFile,imagesDir,getPayload,now=()=>Date.now()}){
 let saved={enabled:false,directory:'',intervalHours:24,retention:7,lastSuccess:null,lastAttempt:null,lastError:null},secret='',pending=null,secretStore=null;
 try{const data=JSON.parse(fs.readFileSync(settingsFile,'utf8'));saved={...saved,...data};}catch{}
 const persist=()=>atomicJson(settingsFile,saved);
 function state(){return {...saved,running:!!pending,unlocked:!!secret,secretStorage:secretStore?'system':'session',nextAt:saved.enabled&&saved.lastSuccess?new Date(Date.parse(saved.lastSuccess)+saved.intervalHours*3600000).toISOString():null};}
 async function configureStorage(store){const loaded=await store.load();if(typeof loaded!=='string')throw Error('ALM_BACKUP_SECRET_UNAVAILABLE');secret=loaded;secretStore=store;return state();}
 async function configure(input){
  if(pending)throw Error('ALM_BACKUP_BUSY');
  const directory=String(input.directory||'').trim(),intervalHours=Number(input.intervalHours),retention=Number(input.retention);
  if(!path.isAbsolute(directory)||!Number.isInteger(intervalHours)||intervalHours<1||intervalHours>168||!Number.isInteger(retention)||retention<1||retention>60)throw Error('ALM_BACKUP_SETTINGS');
  if(input.password){const next=passwordValid(input.password);if(secretStore)await secretStore.save(next);secret=next;}
  if(input.enabled&&!secret)throw Error('ALM_BACKUP_LOCKED');
  saved={...saved,enabled:input.enabled===true,directory,intervalHours,retention,lastError:null};persist();return state();
 }
 async function run(){
  if(pending)return pending;
  pending=(async()=>{
   if(!secret)throw Error('ALM_BACKUP_LOCKED');if(!path.isAbsolute(saved.directory))throw Error('ALM_BACKUP_SETTINGS');
   saved.lastAttempt=new Date(now()).toISOString();persist();
   const directory=await fsp.lstat(saved.directory);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('ALM_BACKUP_DIRECTORY');
   const payload=await attachImages(await getPayload(),imagesDir),bytes=await encrypt(payload,secret);
   const name='ALM-auto-'+saved.lastAttempt.replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.alm-backup';
   const file=path.join(saved.directory,name);atomicWrite(file,bytes);
   saved.lastSuccess=new Date(now()).toISOString();saved.lastError=null;persist();
   const candidates=(await fsp.readdir(saved.directory)).filter(n=>/^ALM-auto-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[a-f0-9]{8}\.alm-backup$/.test(n)).sort().reverse();
   for(const old of candidates.slice(saved.retention)){const target=path.join(saved.directory,old);const stat=await fsp.lstat(target);if(stat.isFile()&&!stat.isSymbolicLink())await fsp.unlink(target);}
   return {ok:true,file:name,bytes:bytes.length,...state()};
  })().catch(error=>{saved.lastError=error.code||error.message;persist();throw error;}).finally(()=>{pending=null;});
  return pending;
 }
 async function recovery(payload,directory){
  const withImages=await attachImages(payload,imagesDir);
  if(saved.enabled&&!secret)throw Error('ALM_BACKUP_LOCKED');
  const bytes=secret?await encrypt(withImages,secret):Buffer.from(JSON.stringify(withImages));
  const name='ALM-before-restore-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+(secret?'.alm-backup':'.json');
  const target=path.join(directory,name);atomicWrite(target,bytes);return {file:target,encrypted:!!secret};
 }
 async function tick(){if(!saved.enabled||pending||!secret)return;const last=Math.max(Date.parse(saved.lastSuccess)||0,Date.parse(saved.lastAttempt)||0);if(!last||now()-last>=saved.intervalHours*3600000)try{await run();}catch{}}
 const timer=setInterval(tick,60000);timer.unref?.();
 return {state,configure,configureStorage,run,recovery,tick,stop:()=>{clearInterval(timer);secret='';}};
}
module.exports={encrypt,decrypt,attachImages,validateImages,createBackupManager,passwordValid};
