'use strict';
const crypto=require('node:crypto'),N=require('./notebook-model'),identity=require('../public/collection-state'),viewing=require('./viewing'),{publicAnime}=require('./discovery'),normalize=require('./catalogue-title-index').normalize;
function mountNotebook(app,{db,readAnimes,writeAnimes,titles,rememberBatch}){
 const previews=new Map();
 const error=(res,e)=>res.status(e.status||400).json({code:e.code||e.message,error:e.code||e.message,...(e.details||{})});
 const failure=(code,status=400,details)=>{throw Object.assign(new Error(code),{code,status,details});};
 // This projection stays local: the overview needs library facts for its filters
 // and covers, without another request per card or any write to a notebook.
 const projection=a=>({id:a.id,title:a.title,titleEn:a.titleEn,titleJa:a.titleJa,localizedTitles:a.localizedTitles,malId:a.malId,episodesTotal:a.episodesTotal,
  poster:a.poster,imageUrl:a.imageUrl,status:a.status,type:a.type,startDate:a.startDate,year:a.year,
  genres:Array.isArray(a.genres)?a.genres:[],tags:Array.isArray(a.tags)?a.tags:[],sourceTitle:a.sourceTitle,previousSeasonId:a.previousSeasonId,
  notes:N.notes(a.notes),personalJournal:N.readJournal(a.personalJournal),revision:N.revision(a)});
 app.get('/api/notebook',async(req,res)=>{try{await db.whenReady();res.json({items:readAnimes().map(projection)});}catch(e){error(res,e);}});
 app.get('/api/library/:id/notebook',async(req,res)=>{try{await db.whenReady();const a=readAnimes().find(a=>String(a.id)===req.params.id);if(!a)failure('NOTEBOOK_MISSING',404);res.json(projection(a));}catch(e){error(res,e);}});
 app.patch('/api/library/:id/notebook',async(req,res)=>{try{
  await db.whenReady();const all=readAnimes(),a=all.find(a=>String(a.id)===req.params.id);if(!a)failure('NOTEBOOK_MISSING',404);
  if(req.body?.revision!==N.revision(a))failure('NOTEBOOK_CONFLICT',409);
  const next=N.journal(req.body?.personalJournal),notes=N.text(req.body?.notes??''),conflicts=[];
  for(const award of next.awards)for(const other of all){if(other.id===a.id)continue;const existing=N.readJournal(other.personalJournal).awards.find(v=>v.year===award.year&&v.kind===award.kind);if(existing)conflicts.push({id:other.id,title:other.title,year:award.year,kind:award.kind});}
  // A replacement is confirmed against the exact conflicting choices shown to the user.
  const conflictToken=crypto.createHash('sha256').update(JSON.stringify(conflicts.map(c=>[c.id,c.year,c.kind,N.revision(all.find(a=>a.id===c.id))]))).digest('hex');
  if(conflicts.length&&req.body?.replaceAwards!==conflictToken)failure('NOTEBOOK_AWARD_CONFLICT',409,{conflicts,conflictToken});
  for(const c of conflicts){const other=all.find(v=>v.id===c.id),j=N.readJournal(other.personalJournal);other.personalJournal={...j,awards:j.awards.filter(v=>v.year!==c.year||v.kind!==c.kind)};}
  a.notes=notes;a.personalJournal=next;writeAnimes(all);res.json({ok:true,...projection(readAnimes().find(v=>v.id===a.id))});
 }catch(e){error(res,e);}});
 function candidates(title){
  const found=[...(db.searchMetadataByTitle(title,8)||[]),...(titles.matchingIds(title)||[]).slice(0,8).map(id=>db.getMetadataByMalId(id)).filter(Boolean)];
  const rows=[...new Map(found.map(r=>[Number(r.malId),r])).values()].slice(0,10);
  return rows.map(r=>{
   const item=titles.decorate(publicAnime(r));
   // Public catalogue fields only: the preview must not carry another notebook.
   return {malId:item.malId,title:item.title,titleEn:item.titleEn,titleJa:item.titleJa,localizedTitles:item.localizedTitles,poster:item.poster,type:item.type,startDate:item.startDate,episodesTotal:item.episodesTotal,year:String(item.startDate||'').slice(0,4),exact:[r.title,r.titleEn,r.titleJa,r.titleRomaji,...(r.synonyms||[])].some(v=>v&&normalize(v)===normalize(title))};
  }).filter(r=>Number.isSafeInteger(r.malId)&&r.malId>0);
 }
 app.post('/api/import/list/preview',async(req,res)=>{try{
  await db.whenReady();await db.prepareMetadataTitleIndex();const parsed=N.parseList(req.body),known=readAnimes();
  for(const [key,v]of previews)if(v.expires<Date.now())previews.delete(key);while(previews.size>=8)previews.delete(previews.keys().next().value);
  const rows=parsed.map(row=>{const options=row.invalid?[]:candidates(row.title),exact=options.filter(v=>v.exact);const malId=exact.length===1?exact[0].malId:null;const existing=identity.find({title:row.title,malId},known);return {...row,candidates:options,selectedMalId:malId,existing:existing?{id:existing.id,title:existing.title}:null};});
  const token=crypto.randomUUID();previews.set(token,{rows,expires:Date.now()+20*60000});res.json({token,rows});
 }catch(e){error(res,e);}});
 app.post('/api/import/list/commit',async(req,res)=>{try{
  await db.whenReady();const preview=previews.get(req.body?.token);if(!preview||preview.expires<Date.now())failure('LIST_EXPIRED',409);
  const selections=req.body?.selections;if(!Array.isArray(selections)||!selections.length||selections.length>500)failure('LIST_SELECTION');
  const seen=new Set(),chosen=selections.map(s=>{if(!s||seen.has(s.key))failure('LIST_SELECTION');seen.add(s.key);const row=preview.rows.find(r=>r.key===s.key);if(!row||row.invalid)failure('LIST_SELECTION');const status=Object.hasOwn(s,'status')?s.status:row.status;if(!N.STATUSES.includes(status))failure('LIST_STATUS');let meta=null;if(s.manual!==true){const id=Number(s.malId);if(!Number.isSafeInteger(id)||id<1||(meta=db.getMetadataByMalId(id))==null)failure('LIST_SELECTION');}return {row:{...row,status},meta};});
  if(chosen.some(({row,meta})=>row.status==='Completed'&&!viewing.positive(meta?.episodes))&&req.body.confirmUnknownEpisodes!==true)failure('ALM_EPISODES_UNKNOWN',409);
  const all=readAnimes(),added=[],skipped=[];let nextId=all.reduce((n,a)=>Math.max(n,Number(a.id)||0),0)+1;
  for(const {row,meta}of chosen){const item=meta?titles.decorate(publicAnime(meta)):{title:row.title,type:'TV'};const existing=identity.find(item,all);if(existing){skipped.push({title:row.title,id:existing.id});continue;}
   const anime=viewing.recordViewing(null,viewing.completeEpisodes({...item,id:nextId++,canonicalTitle:item.title,status:row.status,score:row.score,episodesSeen:row.status==='Plan to Watch'?'0':'',notes:row.notes,tags:[],personalJournal:{episodes:[],awards:[]}},meta));
   all.push(anime);added.push(anime.id);
  }
  let undoToken=null;if(added.length){writeAnimes(all);const persisted=readAnimes(),entries=added.map(id=>{const a=persisted.find(v=>v.id===id);if(!a)failure('LIST_WRITE',500);return {id,fingerprint:JSON.stringify(a)};});undoToken=rememberBatch(entries);}
  previews.delete(req.body.token);res.json({ok:true,added:added.length,skipped,undoToken});
 }catch(e){error(res,e);}});
 require('./notebook-export').mountExports(app,{db,readAnimes});
}
module.exports={mountNotebook};
