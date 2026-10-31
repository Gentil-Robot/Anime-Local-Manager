'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm49-http-'));let listener;
process.env.ALM_DATA_DIR=dir;process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_MAL_CLIENT_ID='fixture49-partial';process.env.ALM_AUTOMATION_STARTUP='0';fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch,calls=[];let rich=false,badIdentity=false;
global.fetch=async(u,o)=>{
 const url=new URL(String(u));if(url.origin.startsWith('http://127.0.0.1:'))return nativeFetch(u,o);
 if(url.hostname==='api.myanimelist.net'){
  const id=Number(url.pathname.match(/anime\/(\d+)/)?.[1]);calls.push(id);
  if(!id)throw Error('Title searches are forbidden in exact-ID fixture');
  return new Response(JSON.stringify({id:badIdentity&&id===980203?id+1:id,title:'Fixture '+id,media_type:'tv',num_episodes:12,start_date:'2020-01-01',synopsis:rich?'A sufficiently detailed anime synopsis returned by the exact official source.':'',genres:rich?[{id:1,name:'Action'}]:[],main_picture:{medium:''}}),{headers:{'Content-Type':'application/json'}});
 }
 if(url.hostname==='kitsu.app')return new Response(JSON.stringify({data:[]}),{headers:{'Content-Type':'application/json'}});
 throw Error('Offline fixture: '+url.hostname);
};
(async()=>{
 const server=require('../server'),db=require('../db');await db.whenReady();
 const rows=[980201,980202,980203].map((id,i)=>({id:i+1,malId:id,title:'Fixture '+id,canonicalTitle:'Fixture '+id,malUrl:'https://myanimelist.net/anime/'+id,status:'Watching',type:'TV',episodesSeen:'7',episodesTotal:'12',startDate:'2020-01-01',genres:[],synopsis:'',poster:'/images/existing.jpg',score:'9',notes:'Keep my note '+i,tags:['personal','non trouvé auto'],...(i<2?{autoCompletionCheckedAt:new Date().toISOString()}: {})}));
 db.importMetadataRows(rows.map(a=>({malId:a.malId,title:a.title,type:a.type,episodes:12,startDate:a.startDate})));db.writeAllAnimes(rows);
 listener=await new Promise(resolve=>{const s=server.app.listen(0,'127.0.0.1',()=>resolve(s));});const origin='http://127.0.0.1:'+listener.address().port;
 async function api(url,body){const r=await nativeFetch(origin+url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 async function job(endpoint,body){const {jobId}=await api(endpoint,body);for(let n=0;n<300;n++){const p=await api('/api/bulk/complete-all/progress/'+jobId);if(!['queued','running','cancelling'].includes(p.status)){assert.equal(p.status,'done',JSON.stringify(p));return p;}await new Promise(r=>setTimeout(r,20));}throw Error('Job timeout');}
 const beforeIssues=await api('/api/library/completion-issues');assert.equal(beforeIssues.items.length,3);assert(beforeIssues.items.every(a=>a.missing.includes('synopsis')&&a.missing.includes('genres')));
 const beforeAudit=await api('/api/v2/content-audit');assert.equal(beforeAudit.completion.items.length,3);assert.equal(beforeAudit.library.nonAnime,0);
 console.log('OK Beta49: all incomplete anime are visible separately in control, including one never attempted; no quarantine');
 await job('/api/bulk/info-only',{retryMarked:true});
 assert([980201,980202,980203].every(id=>calls.includes(id)),'Incomplete local records must trigger exact source requests');
 const again=await job('/api/bulk/info-only',{retryMarked:true,ids:[1,2,3]});assert.equal(again.updatedInfos,0,JSON.stringify(again));assert.equal(again.failed,0);assert.equal(again.waiting,3);assert.equal(again.successful,0);
 assert.equal((await api('/api/library/completion-issues')).awaiting.length,3);
 console.log('OK Beta49: unchanged partial records await sources, never count as newly enriched or decisions');
 rich=true;badIdentity=true;process.env.ALM_MAL_CLIENT_ID='fixture49-rich';
 const partiallyCompleted=await job('/api/bulk/info-only',{retryMarked:true,ids:[1,2,3]});
 assert.equal(partiallyCompleted.failed,0);assert.equal(partiallyCompleted.waiting,1);assert.equal(partiallyCompleted.successful,2);assert.equal(partiallyCompleted.updatedInfos,2);
 assert.equal(db.getAnimeById(3).malId,980203);assert.equal(db.getAnimeById(3).synopsis||'','');
 console.log('OK Beta49: exact-ID remote enrichment repairs two records and rejects the mismatched third identity');
 badIdentity=false;process.env.ALM_MAL_CLIENT_ID='fixture49-final';
 const completed=await job('/api/bulk/info-only',{retryMarked:true,ids:[1,2,3]});assert.equal(completed.updatedInfos,1);assert.equal(completed.failed,0);assert.equal(completed.successful,1);
 const completeAll=await job('/api/bulk/complete-all',{overwrite:true,retryMarked:true});assert.equal(completeAll.updatedInfos,0);assert.equal(completeAll.failed,0);assert.equal(completeAll.successful,0);
 assert.equal((await api('/api/library/completion-issues')).items.length,0);assert.equal((await api('/api/v2/content-audit')).completion.items.length,0);
 for(const a of db.getAllAnimes()){assert.equal(a.episodesSeen,'7');assert.equal(a.score,'9');assert(a.notes.startsWith('Keep my note'));assert(a.tags.includes('personal'));assert(!a.tags.includes('non trouvé auto'));}
 console.log('OK Beta49: resolved markers disappear, counters count unique anime, and progress / notes / personal score survive');
 const payload={app:'Anime Local Manager',createdAt:'2026-10-09T18:00:00Z',data:{animes:[{id:70,title:'Backup fixture',status:'Watching',notes:'Private note',episodesSeen:'3',episodesTotal:'12'}]}};
 const encrypted=require('../lib/encrypted-backup'),bytes=await encrypted.encrypt(payload,'a long fixture password');
 async function preview(data,name,password){const form=new FormData();form.set('file',new Blob([data]),name);if(password)form.set('password',password);const r=await nativeFetch(origin+'/api/backup/preview',{method:'POST',body:form});return {status:r.status,data:await r.json()};}
 const original=JSON.stringify(db.getAllAnimes());
 for(const [data,name,password]of [[JSON.stringify(payload),'backup.json',''],[bytes,'backup.alm-backup','a long fixture password'],[bytes,'renamed.json','a long fixture password'],[JSON.stringify(payload),'plain.alm-backup','']]){
  const p=await preview(data,name,password);assert.equal(p.status,200,JSON.stringify(p));assert.equal(p.data.count,1);assert.equal(p.data.notes,1);await api('/api/backup/preview/'+p.data.token+'/cancel',{});
 }
 const wrong=await preview(bytes,'backup.alm-backup','wrong password long');assert.equal(wrong.status,400);assert.equal(JSON.stringify(db.getAllAnimes()),original);
 console.log('OK Beta49: both backup kinds are previewed by content regardless of extension; cancel and wrong password preserve collection');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,listener);});

