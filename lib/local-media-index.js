'use strict';
// ALM 2.2.0 — deterministic, opt-in read-only metadata indexing. Original code.
// No video playback, downloading, online lookups or content inspection.
const fs=require('node:fs/promises');
const path=require('node:path');

const VIDEO_EXTENSIONS=new Set(['.mkv','.mp4','.avi','.m4v','.mov','.wmv','.webm','.ts','.m2ts','.mpg','.mpeg']);
const SKIP_DIRECTORIES=new Set(['$recycle.bin','system volume information','node_modules','.git','.trash','.trashes','@recycle','lost+found']);
const MAX_DEPTH=8;
const MAX_ENTRIES=50000;
const MAX_RESULTS=20000;
const MAX_DURATION_MS=20000;
const SEASON_FOLDER=/^(?:s(?:eason)?|saison|temporada|staffel|シーズン|第)\s*0?(\d{1,2})(?:\s*期)?$/i;
const GENERIC_FOLDER=/^(?:anime|animes|animé|animés|videos?|séries?|series|shows?|collection|library|media|tv|downloads?|complete|completed|episodes?|season|saison|season \d+|saison \d+)$/i;
const SPECIAL=/^(?:nc(?:op|ed)|op|ed|pv|cm|sp|ova|special|extra|trailer|opening|ending)(?:[ ._-]?\d{0,2})?$/i;
const BOUNDARY='(?=$|[\\s._\\]\\)\\[-])';

function cleanTitle(raw){
 return String(raw||'')
  .replace(/^\s*(?:\[[^\]]{1,65}\]|\([^)]+\))\s*/,'')
  .replace(/[._]+/g,' ').replace(/\[[^\]]{1,65}\]/g,' ')
  .replace(/\b(?:480|720|1080|2160)p\b/ig,' ')
  .replace(/\b(?:bluray|bd(?:rip)?|web[ ._-]?dl|webrip|dvd(?:rip)?|h\.?26[45]|x26[45]|hevc|aac|flac|10bit|dual[ ._-]?audio|vostfr|multi)\b/ig,' ')
  .replace(/[\s._-]+$/,'').trim().slice(0,220);
}
function guessEpisode(filename){
 const basename=path.basename(String(filename||''));
 const ext=path.extname(basename).toLowerCase();
 if(!VIDEO_EXTENSIONS.has(ext))return null;
 const original=basename.slice(0,-ext.length);
 if(SPECIAL.test(original.trim()))return {titleGuess:'',seasonGuess:0,episodeGuess:0,confidence:'unknown'};
 const patterns=[
  {re:new RegExp('(?:^|[\\s._\\[(\\-])s(?:eason)?[\\s._-]*(\\d{1,2})[\\s._-]*e(?:pisode)?[\\s._-]*(\\d{1,3})(?:[\\-~](?:e)?(\\d{1,3}))?(?:v\\d+)?'+BOUNDARY,'i'),season:true,confidence:'high'},
  {re:new RegExp('(?:^|[\\s._\\[(\\-])(\\d{1,2})x(\\d{1,3})(?:[\\-~](\\d{1,3}))?'+BOUNDARY,'i'),season:true,confidence:'high'},
  {re:new RegExp('(?:^|[\\s._\\[(\\-])(?:ep(?:isode)?\\.?|épisode|第)[\\s._#-]*(\\d{1,3})(?:v\\d+)?'+BOUNDARY,'i'),season:false,confidence:'medium'},
  {re:/(?:^|[\s._\[(\-])[-–—]\s*(\d{1,3})(?:v\d+)?(?=$|[\s._\[(\-])/i,season:false,confidence:'medium'}
 ];
 for(const spec of patterns){
  const match=original.match(spec.re);if(!match)continue;
  const season=spec.season?Number(match[1]):0;
  const episode=Number(match[spec.season?2:1]);
  if(episode<1||episode>999||season>99)continue;
  const rawTitle=original.slice(0,match.index);
  const titleGuess=cleanTitle(rawTitle);
  const result={titleGuess,seasonGuess:season,episodeGuess:episode,confidence:spec.confidence};
  const end=spec.season&&match[3]?Number(match[3]):0;
  if(end>episode&&end-episode<=6)result.episodeEndGuess=end;
  return result;
 }
 return {titleGuess:cleanTitle(original),seasonGuess:0,episodeGuess:0,confidence:'unknown'};
}
function inferFromRelativePath(relativePath,guess){
 const pathParts=String(relativePath||'').split(/[\\/]/).slice(0,-1);
 let season=guess.seasonGuess||0,title=guess.titleGuess;
 for(let i=pathParts.length-1;i>=0;i--){
  const part=cleanTitle(pathParts[i]);if(!part)continue;
  const folderSeason=part.match(SEASON_FOLDER);
  if(folderSeason){if(!season)season=Number(folderSeason[1]);continue;}
  if(GENERIC_FOLDER.test(part)||/^\d{4}$/.test(part))continue;
  if((!title||/^(?:ep|episode|épisode|part|disc)\s*\d{1,3}$/i.test(title))&&part.length>=3){title=part;break;}
 }
 const result={...guess,titleGuess:title.slice(0,220),seasonGuess:season};
 if(result.episodeGuess>0&&!guess.titleGuess&&title)result.confidence='medium';
 return result;
}
async function scanLocalMedia(root,{maxDepth=MAX_DEPTH,maxEntries=MAX_ENTRIES,maxResults=MAX_RESULTS,maxDurationMs=MAX_DURATION_MS,signal,clock=Date.now}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0'))throw Object.assign(Error('ALM_MEDIA_ROOT_INVALID'),{code:'ALM_MEDIA_ROOT_INVALID'});
 const stat=await fs.lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Object.assign(Error('ALM_MEDIA_ROOT_INVALID'),{code:'ALM_MEDIA_ROOT_INVALID'});
 const maxD=Math.max(0,Math.min(MAX_DEPTH,Math.floor(Number(maxDepth)||0)));
 const entryLimit=Math.max(1,Math.min(MAX_ENTRIES,Math.floor(Number(maxEntries)||0)));
 const resultLimit=Math.max(1,Math.min(MAX_RESULTS,Math.floor(Number(maxResults)||0)));
 const duration=Math.max(1,Math.min(MAX_DURATION_MS,Math.floor(Number(maxDurationMs)||0)));
 const started=clock(),files=[],stack=[{folder:root,depth:0}];
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
    if(current.depth<maxD&&!SKIP_DIRECTORIES.has(entry.name.toLowerCase())&&!entry.name.startsWith('.'))
     stack.push({folder:path.join(current.folder,entry.name),depth:current.depth+1});
    continue;
   }
   if(!entry.isFile())continue;
   const guess=guessEpisode(entry.name);if(!guess)continue;
   const full=path.join(current.folder,entry.name);let fileStat;
   try{fileStat=await fs.lstat(full);}catch(e){if(['EACCES','EPERM','ENOENT','EIO'].includes(e.code)){summary.skippedInaccessible++;continue;}throw e;}
   if(!fileStat.isFile()||fileStat.isSymbolicLink()){summary.skippedSymlinks++;continue;}
   const relativePath=path.relative(root,full).split(path.sep).join('/');
   const inferred=inferFromRelativePath(relativePath,guess);
   summary.videoFiles++;
   files.push({relativePath,filename:entry.name,sizeBytes:fileStat.size,...inferred});
   if(files.length>=resultLimit){summary.truncated=true;summary.reason='results';break;}
  }
  if(summary.truncated)break;
 }
 return {files,summary};
}
module.exports={VIDEO_EXTENSIONS,guessEpisode,inferFromRelativePath,scanLocalMedia};
