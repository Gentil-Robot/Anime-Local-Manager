'use strict';
const crypto=require('node:crypto'),{publicAnime}=require('./discovery'),identity=require('../public/collection-state'),viewing=require('./viewing');
function mountCatalog(app,{db,readAnimes,writeAnimes,titles,updatedAt}){
 const operations=new Map();
 const fingerprint=a=>JSON.stringify(a);
 const remember=operation=>{for(const [k,v]of operations)if(v.expires<Date.now())operations.delete(k);while(operations.size>=30)operations.delete(operations.keys().next().value);const token=crypto.randomUUID();operations.set(token,{...operation,expires:Date.now()+600000});return token;};
 const error=(res,e)=>res.status(e.status||400).json({error:e.message,code:e.message});
 app.get('/api/catalog',async(req,res)=>{try{
  await db.whenReady();const q=String(req.query.q||'').trim().slice(0,160),known=readAnimes(),aliasIds=[];
  // Search verified local language labels too; no online translation of proper names.
  if(q)aliasIds.push(...titles.matchingIds(q));
  const result=db.browseMetadata({...req.query,q,hideOwned:req.query.hideOwned==='1',aliasIds});
  result.items=result.items.map(r=>{const item=titles.decorate(publicAnime(r)),existing=identity.find(item,known);return {...item,owned:existing?{id:existing.id,status:existing.status}:null};});
  res.json({...result,updatedAt:updatedAt(),source:'local'});
 }catch(e){error(res,e);}});
 app.get('/api/catalog/facets',async(req,res)=>{try{await db.whenReady();res.json(db.catalogFacets());}catch(e){error(res,e);}});
 app.post('/api/catalog/add-batch',async(req,res)=>{try{
  await db.whenReady();const raw=req.body?.ids;if(!Array.isArray(raw)||!raw.length||raw.length>200||raw.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<1))throw Error('ALM_CATALOG_SELECTION');
  const score=req.body.score==null||req.body.score===''?'':Number(req.body.score);if(score!==''&&(!Number.isInteger(score)||score<1||score>10))throw Error('ALM_CATALOG_SCORE');
  const status=req.body.status||'Completed';if(!['Completed','Watching','Plan to Watch','Dropped','On-Hold'].includes(status))throw Error('ALM_CATALOG_STATUS');
  const records=[...new Set(raw.map(Number))].map(id=>db.getMetadataByMalId(id));if(records.some(r=>!r))throw Error('ALM_CATALOG_MISSING');
  if(status==='Completed'&&records.some(r=>!viewing.positive(r.episodes))&&req.body.confirmUnknownEpisodes!==true){return res.status(409).json({code:'ALM_EPISODES_UNKNOWN',error:'ALM_EPISODES_UNKNOWN'});}
  const rows=readAnimes(),added=[],existing=[];let nextId=rows.reduce((n,a)=>Math.max(n,Number(a.id)||0),0)+1;
  for(const row of records){const item=titles.decorate(publicAnime(row)),owned=identity.find(item,rows);if(owned){existing.push(owned.id);continue;}
   const anime=viewing.recordViewing(null,viewing.completeEpisodes({...item,id:nextId++,status,score:score===''?'':String(score),episodesSeen:status==='Plan to Watch'?'0':'',tags:[],notes:'',canonicalTitle:item.title},row));
   rows.push(anime);added.push({id:anime.id,fingerprint:fingerprint(anime)});
  }
  if(added.length){writeAnimes(rows);const persisted=readAnimes();for(const entry of added)entry.fingerprint=fingerprint(persisted.find(a=>a.id===entry.id));}res.json({ok:true,added:added.length,existing:existing.length,undoToken:added.length?remember({kind:'batch',added}):null});
 }catch(e){error(res,e);}});
 app.post('/api/library/undo',async(req,res)=>{try{
  await db.whenReady();const op=operations.get(req.body?.token);if(!op||op.expires<Date.now())throw Error('ALM_UNDO_EXPIRED');const rows=readAnimes();let undone=0,skipped=0,next=rows;
  if(op.kind==='batch'){const ids=new Set();for(const entry of op.added){const row=rows.find(a=>a.id===entry.id);if(row&&fingerprint(row)===entry.fingerprint){ids.add(row.id);undone++;}else skipped++;}next=rows.filter(a=>!ids.has(a.id));}
  else {const index=rows.findIndex(a=>a.id===op.id);if(index<0||fingerprint(rows[index])!==op.after)throw Error('ALM_UNDO_CHANGED');next=[...rows];next[index]=op.before;undone=1;}
  if(undone)writeAnimes(next);operations.delete(req.body.token);res.json({ok:true,undone,skipped});
 }catch(e){error(res,e);}});
 app.post('/api/library/:id/complete',async(req,res)=>{try{
  await db.whenReady();const before=db.getAnimeById(Number(req.params.id));if(!before)throw Error('ALM_ANIME_MISSING');const total=viewing.positive(before.episodesTotal);
  if(before.status!=='Watching'||!total||Number(before.episodesSeen)<total)throw Error('ALM_EPISODE_STATUS');db.updateAnime(before.id,{...before,status:'Completed',completionPending:false});const persisted=db.getAnimeById(before.id);
  res.json({ok:true,anime:persisted,undoToken:remember({kind:'status',id:before.id,before,after:fingerprint(persisted)})});
 }catch(e){error(res,e);}});
 app.post('/api/library/:id/episode',async(req,res)=>{try{
  await db.whenReady();const delta=Number(req.body?.delta);if(![-1,1].includes(delta))throw Error('ALM_EPISODE_DELTA');const before=db.getAnimeById(Number(req.params.id));if(!before)throw Error('ALM_ANIME_MISSING');
  if(before.status!=='Watching')throw Error('ALM_EPISODE_STATUS');const seen=Number(before.episodesSeen)||0,total=viewing.positive(before.episodesTotal),nextSeen=seen+delta;
  if(!Number.isSafeInteger(nextSeen)||nextSeen<0||(total&&nextSeen>total))throw Error('ALM_EPISODE_LIMIT');
  let next={...before,episodesSeen:String(nextSeen),completionPending:!!total&&nextSeen===total,watchEvents:(before.watchEvents||[]).map(v=>({...v}))};
  if(delta>0)next=viewing.recordViewing(before,next,{watchedOn:viewing.validDate(req.body.watchedOn)});
  else {let left=1;for(let i=next.watchEvents.length-1;i>=0&&left;i--){const event=next.watchEvents[i],amount=Math.min(left,viewing.positive(event.episodes));event.episodes-=amount;left-=amount;}next.watchEvents=next.watchEvents.filter(v=>v.episodes>0);}
  db.updateAnime(next.id,next,{save:"deferred"});const persisted=db.getAnimeById(next.id);res.json({ok:true,anime:persisted,lastEpisode:!!total&&nextSeen===total,undoToken:remember({kind:'episode',id:next.id,before,after:fingerprint(persisted)})});
 }catch(e){error(res,e);}});
 return {remember};
}
module.exports={mountCatalog};
