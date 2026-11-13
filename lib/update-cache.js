'use strict';
const fs=require('node:fs'),path=require('node:path'),{version,compare}=require('./version-check');
const OWNED=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}-Anime-Local-Manager-(.+)-(?:Setup|Portable|linux)-(?:x64|arm64|ia32)\.(?:exe|AppImage)$/i;
function stat(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()?s:null;}catch{return null;}}
function candidates({directory,current,now=Date.now(),onlyInstalled=false,runningFile=process.env.APPIMAGE||process.env.PORTABLE_EXECUTABLE_FILE||process.execPath}){
 try{const s=fs.lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink())return [];}catch{return [];}
 let protectedName='';
 try{const ready=JSON.parse(fs.readFileSync(path.join(directory,'ready.json'),'utf8'));if(typeof ready.basename==='string'&&path.basename(ready.basename)===ready.basename&&version(ready.latest)&&compare(ready.latest,current)>0)protectedName=ready.basename;}catch{}
 const result=[];
 for(const name of fs.readdirSync(directory)){
  const match=name.match(OWNED);if(!match||!version(match[1])||name===protectedName)continue;
  const file=path.join(directory,name),s=stat(file);if(!s)continue;
  const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
  if(runningFile&&normalize(file)===normalize(runningFile))continue;
  if(compare(match[1],current)<=0||!onlyInstalled&&now-s.mtimeMs>7*86400000)result.push({file,name,bytes:s.size,mtime:s.mtimeMs});
 }
 return result;
}
function remove({directory,current,files,now=Date.now(),onlyInstalled=false,runningFile,unlink=fs.unlinkSync}){
 // Re-evaluate the protected download and file identity after the preview.
 const allowed=new Map(candidates({directory,current,now,onlyInstalled,runningFile}).map(i=>[i.name,i]));
 let count=0,bytes=0,failed=0,skipped=0;
 for(const old of files||allowed.values()){
  const item=allowed.get(old.name);if(!item||item.bytes!==old.bytes||item.mtime!==old.mtime){skipped++;continue;}
  try{unlink(item.file);count++;bytes+=item.bytes;}catch{failed++;}
 }
 return {ok:failed===0,count,bytes,failed,skipped};
}
module.exports={candidates,remove};
