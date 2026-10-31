'use strict';
const fs=require('fs'),path=require('path'),{atomicJson}=require('./atomic-file'),{publicAnime}=require('./discovery');
function fromJikan(a){return publicAnime({malId:a.mal_id,title:a.title,titleEn:a.title_english,titleJa:a.title_japanese,synonyms:a.title_synonyms,poster:a.images?.webp?.large_image_url||a.images?.jpg?.large_image_url,synopsis:a.synopsis,score:a.score,rank:a.rank,popularity:a.popularity,members:a.members,type:a.type,episodes:a.episodes,startDate:a.aired?.from,endDate:a.aired?.to,genres:a.genres,studios:a.studios,duration:a.duration});}
function createRankings({directory,fetchPage,getLocal=()=>[],learn=()=>{},source="jikan",mapItem=fromJikan,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const file=path.join(directory,'rankings-top100.json');let saved=null,pending=null,lastAttempt=0,error=false,completedPages=0;
 try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(data.items)&&data.items.length===100&&data.updatedAt&&Number.isFinite(Date.parse(data.updatedAt)))saved=data;}catch{}
 function state(){const items=saved?.items||getLocal().slice(0,100).map(publicAnime);return {items,source:saved?(saved.source||'jikan-cache'):'local',updatedAt:saved?.updatedAt||null,refreshing:!!pending,completedPages,totalPages:4,unavailable:error,stale:!saved||now()-Date.parse(saved.updatedAt)>=86400000,nextRefreshAt:saved?new Date(Date.parse(saved.updatedAt)+86400000).toISOString():null};}
 function refresh(force=false){
  if(pending)return pending;
  if((!force&&saved&&now()-Date.parse(saved.updatedAt)<86400000)||(lastAttempt&&now()-lastAttempt<60000))return Promise.resolve(state());
  lastAttempt=now();error=false;completedPages=0;
  pending=(async()=>{try{
   const rows=[];for(let page=1;page<=4;page++){
    if(page>1)await wait(1100);
    const data=await fetchPage(page);
    if(!Array.isArray(data.data)||data.data.length!==25)throw Error('Incomplete ranking');
    for(const item of data.data){const row=mapItem(item);if(!row.malId||!row.title||!(Number(row.publicScore)>0)||!(Number(row.rank)>0))throw Error('Invalid ranking');rows.push(row);}
    completedPages=page;
   }
   if(new Set(rows.map(r=>r.malId)).size!==100||rows.some((r,i)=>Number(r.rank)!==i+1))throw Error('Inconsistent ranking pages');
   const next={source,updatedAt:new Date(now()).toISOString(),items:rows};atomicJson(file,next);saved=next;
   try{learn(rows);}catch{} // Display/cache remains valid even if optional metadata enrichment fails.
  }catch{error=true;}finally{pending=null;}return state();})();return pending;
 }
 return {state,refresh};
}
function mountRankings(app,options){const rankings=createRankings(options);
 app.get('/api/rankings',async(_req,res)=>{await options.ready?.();rankings.refresh();res.setHeader('Cache-Control','no-store');res.json(rankings.state());});
 app.post('/api/rankings/refresh',async(_req,res)=>{await options.ready?.();rankings.refresh(true);res.setHeader('Cache-Control','no-store');res.json(rankings.state());});return rankings;
}
module.exports={createRankings,mountRankings,fromJikan};
