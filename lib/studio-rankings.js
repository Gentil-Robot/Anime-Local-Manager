'use strict';
const fs=require('fs'),path=require('path'),{atomicJson}=require('./atomic-file'),{publicAnime}=require('./discovery'),{fromJikan}=require('./rankings');
const normalize=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase('en');
function createStudioRankings({directory,fetchJson,getLocal=()=>[],learn=()=>{},retired=false,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const file=path.join(directory,'rankings-studios.json');let saved={};const pending=new Map(),attempts=new Map(),errors=new Set(),pages=new Map();
 try{const data=JSON.parse(fs.readFileSync(file,'utf8'));for(const [k,v]of Object.entries(data).slice(-100))if(Array.isArray(v.items)&&v.items.length<=100&&Number.isFinite(Date.parse(v.updatedAt)))saved[k]=v;}catch{}
 function state(name){const hit=saved[name];return {studio:name,items:hit?.items||getLocal(name).map(publicAnime),source:hit?(retired?'jikan-studio-cache':'jikan-studio'):'local-studio',updatedAt:hit?.updatedAt||null,refreshing:pending.has(name),completedPages:pages.get(name)||0,unavailable:errors.has(name),stale:!hit||now()-Date.parse(hit.updatedAt)>=86400000};}
 function refresh(name,force=false){
  if(retired)return Promise.resolve(state(name));
  if(pending.has(name))return pending.get(name);if(pending.size>=2)return Promise.resolve(state(name));
  if((!force&&saved[name]&&now()-Date.parse(saved[name].updatedAt)<86400000)||(attempts.has(name)&&now()-attempts.get(name)<60000))return Promise.resolve(state(name));
  attempts.set(name,now());errors.delete(name);pages.set(name,0);
  const task=(async()=>{try{
   const producers=await fetchJson('/producers?'+new URLSearchParams({q:name,limit:'25'}));
   const matches=(producers.data||[]).filter(p=>[p.name,...(p.titles||[]).map(t=>t.title)].some(t=>normalize(t)===normalize(name)));
   if(matches.length!==1||!(matches[0].mal_id>0))throw Error('Studio identity ambiguous');const id=matches[0].mal_id,rows=[];let exhausted=false;
   for(let page=1;page<=20;page++){
    await wait(1100);const result=await fetchJson('/anime?'+new URLSearchParams({producers:String(id),order_by:'score',sort:'desc',min_score:'0.01',page:String(page),limit:'25'}));
    if(!Array.isArray(result.data))throw Error('Invalid studio response');
    for(const raw of result.data){if(!raw.studios?.some(s=>s.mal_id===id))continue;const row=fromJikan(raw);if(!row.malId||!row.title||!(Number(row.publicScore)>0))throw Error('Invalid studio entry');rows.push(row);}
    pages.set(name,page);exhausted=result.pagination?.has_next_page===false||result.data.length===0;
    if(rows.length>=100||exhausted)break;
   }
   if(!exhausted&&rows.length<100)throw Error('Studio pagination budget reached');
   if(new Set(rows.map(x=>x.malId)).size!==rows.length)throw Error('Duplicate studio pages');
   rows.sort((a,b)=>Number(b.publicScore)-Number(a.publicScore)||Number(a.rank||Infinity)-Number(b.rank||Infinity)||a.malId-b.malId);
   const entry={updatedAt:new Date(now()).toISOString(),items:rows.slice(0,100)};
   const next=Object.fromEntries([...Object.entries(saved).filter(([k])=>k!==name),[name,entry]].slice(-100));atomicJson(file,next);saved=next;
   try{learn(entry.items);}catch{}
  }catch{errors.add(name);}finally{pending.delete(name);}return state(name);})();pending.set(name,task);return task;
 }
 return {state,refresh};
}
function mountStudioRankings(app,options){const rankings=createStudioRankings(options);
 app.get('/api/rankings/studios',async(_req,res)=>{await options.ready?.();res.json({studios:options.listStudios()});});
 const serve=force=>async(req,res)=>{await options.ready?.();const name=String(force?req.body?.name||'':req.query.name||'');if(!name||name.length>160||!options.listStudios().some(s=>s.name===name))return res.status(400).json({error:'Unknown studio'});rankings.refresh(name,force);res.setHeader('Cache-Control','no-store');res.json(rankings.state(name));};
 app.get('/api/rankings/studio',serve(false));app.post('/api/rankings/studio/refresh',serve(true));return rankings;
}
module.exports={createStudioRankings,mountStudioRankings};
