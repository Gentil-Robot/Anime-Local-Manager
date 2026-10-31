'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomicJson}=require('./atomic-file');
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const recordFingerprint=value=>{if(!value)return hash(null);const row={...value};for(const key of ['autoCompletionCheckedAt','autoCompletionMissing','autoCompletionSignature','autoCompletionReason','completionNeedsEpisodes','resolutionAssessment'])delete row[key];return hash(canonical(row));};
const load=(file,fallback)=>{try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'?value:fallback;}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const metadataFingerprint=row=>hash([row?.malId,row?.title,row?.titleEn,row?.titleRomaji,row?.synonyms,row?.type,row?.episodes,row?.startDate]);
function createAutomation(dataDir){
 const file=path.join(dataDir,'automation','library-tasks.json'),memoryFile=path.join(dataDir,'automation','verified-series-links.json'),historyFile=path.join(dataDir,'automation','corrections.json');
 const state=load(file,{version:1,jobs:[]}),memory=load(memoryFile,{version:1,links:{},seasons:{}}),history=load(historyFile,{version:1,items:[]});
 let handlers={},timer=null,running=false,stopped=false;
 for(const job of state.jobs)if(['running','queued'].includes(job.status)){
  if(['done','error','cancelled'].includes(job.progress?.status)&&(job.kind!=='csv-import'||job.progress?.result)){job.status=job.progress.status;job.result=job.progress.result||job.progress;job.finishedAt=job.progress.finishedAt||Date.now();delete job.payload;continue;}
  if(job.progress?.cancelRequested){job.status='cancelled';job.finishedAt=Date.now();delete job.payload;}
  else{job.status='queued';job.resumed=true;}
 }
 const save=()=>atomicJson(file,state);
 function schedule(){if(stopped||running)return;clearTimeout(timer);timer=null;const pending=state.jobs.filter(j=>['queued','retrying'].includes(j.status));if(!pending.length)return;const time=Math.min(...pending.map(j=>Number(j.notBefore)||0));timer=setTimeout(()=>{timer=null;void pump();},Math.max(0,Math.min(60000,time-Date.now())));timer.unref?.();}
 async function pump(){
  if(stopped||running)return;
  const job=state.jobs.find(j=>['queued','retrying'].includes(j.status)&&(!j.notBefore||j.notBefore<=Date.now())&&handlers[j.kind]);
  if(!job){schedule();return;}
  running=true;job.status='running';job.attempts=(job.attempts||0)+1;job.startedAt=job.startedAt||Date.now();save();
  try{const result=await handlers[job.kind](job);if(stopped)return;job.result=result;job.status=result?.cancelled?'cancelled':result?.status==='error'?'error':'done';job.finishedAt=Date.now();delete job.payload;}
  catch(error){if(stopped)return;job.status='error';job.error=String(error.message||error);job.finishedAt=Date.now();delete job.payload;}
  finally{running=false;if(!stopped){const finished=state.jobs.filter(j=>!['queued','running','retrying'].includes(j.status));if(finished.length>80){const remove=new Set(finished.slice(0,finished.length-80));state.jobs=state.jobs.filter(j=>!remove.has(j));}save();schedule();}}
 }
 return {
  start(next){handlers=next;stopped=false;save();schedule();},
  stop(){stopped=true;clearTimeout(timer);timer=null;save();},
  enqueue(kind,payload,id=crypto.randomUUID(),options={}){const old=state.jobs.find(j=>j.id===id);if(old)return old;const job={id,kind,payload:clone(payload),status:options.notBefore?'retrying':'queued',createdAt:Date.now(),notBefore:options.notBefore||0};state.jobs.push(job);save();schedule();return job;},
  job:id=>state.jobs.find(j=>j.id===id),
  jobs:()=>state.jobs.map(({payload,...j})=>clone(j)),
  once(key,action){state.upgrades=state.upgrades||{};if(state.upgrades[key])return false;action();state.upgrades[key]=new Date().toISOString();save();return true;},
  checkpoint(id,progress){const job=state.jobs.find(j=>j.id===id);if(!job)return;job.progress=clone(progress);save();},
  cancel(id){const job=state.jobs.find(j=>j.id===id);if(!job)return false;if(['queued','retrying'].includes(job.status)){job.status='cancelled';job.finishedAt=Date.now();delete job.payload;save();return true;}return false;},
  wake(id){const job=state.jobs.find(j=>j.id===id);if(job?.status!=='retrying')return false;job.notBefore=0;job.status='queued';save();schedule();return true;},
  next(base,getRow,signature){const link=memory.links[base?.malId];if(!link||!signature||link.catalogueSignature!==signature)return null;const next=getRow(link.nextMalId);if(metadataFingerprint(base)!==link.baseFingerprint||metadataFingerprint(next)!==link.nextFingerprint)return null;return {row:next,proof:link.proof};},
  remember(base,next,proof,signature){if(!base?.malId||!next?.malId||!['canonical-title','official-relation'].includes(proof?.source))return;const link={nextMalId:Number(next.malId),baseFingerprint:metadataFingerprint(base),nextFingerprint:metadataFingerprint(next),catalogueSignature:signature||'',proof:clone(proof),verifiedAt:new Date().toISOString()};if(memory.links[base.malId]?.baseFingerprint===link.baseFingerprint&&memory.links[base.malId]?.nextFingerprint===link.nextFingerprint&&memory.links[base.malId]?.catalogueSignature===signature)return;memory.links[base.malId]=link;atomicJson(memoryFile,memory);},
  rememberSeason(anime,explicit=false,rootMalId=0){const family=String(anime.betaseriesSeriesId||anime.betaseriesId||''),season=Number(anime.manualSeasonNumber||anime.betaseriesSeason);if(!family||!season||!anime.malId||(!explicit&&!anime.verifiedSeriesSeason))return;if(!explicit&&memory.seasons[family+':'+season]?.source==='manual')return;memory.seasons[family+':'+season]={malId:Number(anime.malId),rootMalId:Number(rootMalId||anime.verifiedSeriesSeason?.rootMalId||0),source:explicit?'manual':'verified-chain',verifiedAt:new Date().toISOString()};atomicJson(memoryFile,memory);},
  season(family,season){return memory.seasons[family+':'+season]||null;},
  snapshot(){return clone({memory,history});},
  restoreDecisions(value){
   const next=value?.memory,records=value?.history;
   if(!next||next.version!==1||!next.links||!next.seasons||Object.keys(next.links).length>10000||Object.keys(next.seasons).length>10000||!Array.isArray(records?.items)||records.items.length>40)throw Error('ALM_BACKUP_FORMAT');
   if(Object.values(next.links).some(a=>!Number.isSafeInteger(Number(a.nextMalId))||Number(a.nextMalId)<1)||records.items.some(a=>!Array.isArray(a.changes)||a.changes.length>100000||a.changes.some(c=>!Number.isSafeInteger(Number(c.id))||Number(c.id)<1)))throw Error('ALM_BACKUP_FORMAT');
   atomicJson(memoryFile,next);atomicJson(historyFile,records);
   for(const key of Object.keys(memory))delete memory[key];Object.assign(memory,clone(next));history.items=clone(records.items);
   for(const job of state.jobs)if(['queued','retrying'].includes(job.status)){job.status='cancelled';job.finishedAt=Date.now();delete job.payload;}save();
  },
  record(label,before,after){const left=new Map(before.map(a=>[Number(a.id),a])),right=new Map(after.map(a=>[Number(a.id),a]));const ids=[...new Set([...left.keys(),...right.keys()])].filter(id=>recordFingerprint(left.get(id))!==recordFingerprint(right.get(id)));if(!ids.length)return null;const item={id:crypto.randomUUID(),label,at:new Date().toISOString(),changes:ids.map(id=>({id,before:left.get(id)||null,after:right.get(id)||null}))};history.items.push(clone(item));history.items=history.items.slice(-40);atomicJson(historyFile,history);return item.id;},
  history(rows){const byId=new Map(rows.map(a=>[Number(a.id),a]));return history.items.slice().reverse().map(item=>({id:item.id,label:item.label,at:item.at,count:item.changes.length,undoneAt:item.undoneAt||null,canUndo:!item.undoneAt&&item.changes.every(c=>recordFingerprint(byId.get(c.id))===recordFingerprint(c.after))}));},
  undo(id,rows){const item=history.items.find(a=>a.id===id),byId=new Map(rows.map(a=>[Number(a.id),a]));if(!item||item.undoneAt||!item.changes.every(c=>recordFingerprint(byId.get(c.id))===recordFingerprint(c.after)))throw Object.assign(Error('ALM_CORRECTION_CHANGED'),{status:409});for(const c of item.changes){if(c.before){const row=clone(c.before);row.automationDecision={kind:'undo',sourcePosition:row.betaseriesEpisode||'',malId:String(row.malId||'')};byId.set(c.id,row);}else byId.delete(c.id);}return {rows:[...byId.values()],commit(){item.undoneAt=new Date().toISOString();atomicJson(historyFile,history);}};}
 };
}
module.exports={createAutomation,metadataFingerprint,hash};
