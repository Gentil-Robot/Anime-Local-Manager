'use strict';
// ALM 2.2.0: read-only, opt-in inventory of local media. No video content is opened.
// The caller must provide a root chosen by the user via the native folder picker.
const fs=require('node:fs/promises');
const path=require('node:path');

const VIDEO_EXTENSIONS=new Set(['.mkv','.mp4','.avi','.m4v','.mov','.wmv','.webm','.ts','.m2ts','.mpg','.mpeg']);
const SKIP_DIRECTORIES=new Set(['$recycle.bin','system volume information','node_modules','.git','.trash','.trashes','@recycle','lost+found']);
const MAX_DEPTH=8;
const MAX_ENTRIES=50000;
const MAX_RESULTS=20000;
const MAX_DURATION_MS=20000;

function guessEpisode(filename){
 const basename=path.basename(String(filename||''));
 const ext=path.extname(basename).toLowerCase();
 if(!VIDEO_EXTENSIONS.has(ext))return null;
 const original=basename.slice(0,-ext.length);
 let m=original.match(/(?:^|[\s._\[(\-])s(?:eason)?[\s._-]*(\d{1,2})[\s._-]*e(?:pisode)?[\s._-]*(\d{1,3})(?:v\d+)?(?=$|[\s._\])\-])/i);
 let season=0,episode=0,position=-1,confidence='low';
 if(m){season=Number(m[1]);episode=Number(m[2]);position=m.index+Math.max(0,m[0].length-(m[0].trimStart().length));confidence='high';}
 else {
  m=original.match(/(?:^|[\s._\[(\-])(\d{1,2})x(\d{1,3})(?=$|[\s._\])\-])/i);
  if(m){season=Number(m[1]);episode=Number(m[2]);position=m.index;confidence='high';}
  else {
   m=original.match(/\s[-–—]\s(\d{1,3})(?:v\d+)?(?=$|[\s._\[(\-])/i);
   if(m){episode=Number(m[1]);position=m.index;confidence='medium';}
  }
 }
 if(episode<1||episode>999||season>99)return {titleGuess:'',seasonGuess:0,episodeGuess:0,confidence:'unknown'};
 let title=(position<0?original:original.slice(0,position));
 title=title.replace(/^\[[^\]]{1,60}\]\s*/,'').replace(/[._]+/g,' ')
  .replace(/\b(?:19|20)\d\d\b/g,' ').replace(/\b(?:480|720|1080|2160)p\b/ig,' ')
  .replace(/\b(?:bluray|bdrip|webrip|web[ ._-]?dl|h264|h265|x264|x265|hevc|aac|flac|multi|vostfr|vf)\b/ig,' ')
  .replace(/[\s.\-_]+$/,'').trim();
 return {titleGuess:title.slice(0,220),seasonGuess:season,episodeGuess:episode,confidence:episode?confidence:'unknown'};
}

async function scanLocalMedia(root,{maxDepth=MAX_DEPTH,maxEntries=MAX_ENTRIES,maxResults=MAX_RESULTS,maxDurationMs=MAX_DURATION_MS,signal,clock=Date.now}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0'))throw Object.assign(Error('ALM_MEDIA_ROOT_INVALID'),{code:'ALM_MEDIA_ROOT_INVALID'});
 const stat=await fs.lstat(root);
 // Explicitly forbid symbolic-link roots and descended symlinks/junctions.
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Object.assign(Error('ALM_MEDIA_ROOT_INVALID'),{code:'ALM_MEDIA_ROOT_INVALID'});
 const maxD=Math.max(0,Math.min(MAX_DEPTH,Math.floor(Number(maxDepth)||0)));
 const entryLimit=Math.max(1,Math.min(MAX_ENTRIES,Math.floor(Number(maxEntries)||0)));
 const resultLimit=Math.max(1,Math.min(MAX_RESULTS,Math.floor(Number(maxResults)||0)));
 const duration=Math.max(1,Math.min(MAX_DURATION_MS,Math.floor(Number(maxDurationMs)||0)));
 const started=clock();const files=[];const stack=[{folder:root,depth:0}];
 const summary={scannedEntries:0,scannedFolders:0,videoFiles:0,skippedSymlinks:0,skippedInaccessible:0,truncated:false,reason:null};
 while(stack.length){
  if(signal?.aborted){summary.truncated=true;summary.reason='aborted';break;}
  if(clock()-started>duration){summary.truncated=true;summary.reason='time';break;}
  const current=stack.pop();summary.scannedFolders++;
  let entries;
  try{entries=await fs.readdir(current.folder,{withFileTypes:true});}
  catch(e){if(['EACCES','EPERM','ENOENT','EIO','ENOTDIR'].includes(e.code)){summary.skippedInaccessible++;continue;}throw e;}
  entries.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  for(const entry of entries){
   if(signal?.aborted){summary.truncated=true;summary.reason='aborted';break;}
   if(clock()-started>duration){summary.truncated=true;summary.reason='time';break;}
   if(summary.scannedEntries>=entryLimit){summary.truncated=true;summary.reason='entries';break;}
   summary.scannedEntries++;
   if(entry.isSymbolicLink()){summary.skippedSymlinks++;continue;}
   if(entry.isDirectory()){
    if(current.depth<maxD&&!SKIP_DIRECTORIES.has(entry.name.toLowerCase())&&!entry.name.startsWith('.')){
     stack.push({folder:path.join(current.folder,entry.name),depth:current.depth+1});
    }
    continue;
   }
   if(!entry.isFile())continue;
   const guess=guessEpisode(entry.name);if(!guess)continue;
   const full=path.join(current.folder,entry.name);
   let fileStat;
   try{fileStat=await fs.lstat(full);}catch(e){if(['EACCES','EPERM','ENOENT','EIO'].includes(e.code)){summary.skippedInaccessible++;continue;}throw e;}
   if(!fileStat.isFile()||fileStat.isSymbolicLink()){summary.skippedSymlinks++;continue;}
   summary.videoFiles++;
   // Relative paths only. Absolute PC/NAS paths stay outside any exported index.
   files.push({relativePath:path.relative(root,full).split(path.sep).join('/'),filename:entry.name,sizeBytes:fileStat.size,...guess});
   if(files.length>=resultLimit){summary.truncated=true;summary.reason='results';break;}
  }
  if(summary.truncated)break;
 }
 return {files,summary};
}
module.exports={VIDEO_EXTENSIONS,guessEpisode,scanLocalMedia};
