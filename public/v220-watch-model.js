'use strict';
// ALM 2.2.0 — selections for two watch rails in the existing library.
// Same module in Node tests and in the renderer. No networking, writes or watch-state changes.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ALM_V220_WATCH_MODEL=api;
})(typeof window!=='undefined'?window:null,()=> {
  const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
  const nonnegative=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
  function watching(animes){
    return (Array.isArray(animes)?animes:[]).filter(a=>a&&a.status==='Watching'&&positive(a.id));
  }
  function resumeRows(animes,limit=null){
    // Status is the source of truth. A zero/unknown progress is a start,
    // and a completed episode count with Watching is a status to review,
    // never a reason to hide the record or invent another episode.
    const seenIds=new Set();
    const rows=watching(animes).filter(a=>{const id=positive(a.id);if(seenIds.has(id))return false;seenIds.add(id);return true;}).map(a=>{
      const seen=nonnegative(a.episodesSeen),total=positive(a.episodesTotal);
      const state=total&&seen>=total?'review':seen>0?'resume':'start';
      return {anime:a,id:positive(a.id),seen,total,next:state==='review'?null:seen+1,state};
    });
    const latest=a=>Array.isArray(a.watchEvents)?Math.max(0,...a.watchEvents.slice(-200).map(e=>{
      const value=Date.parse(e?.watchedAt||e?.date||e?.at||'');
      return Number.isFinite(value)?value:0;
    })):0;
    const rank={resume:0,start:1,review:2};
    rows.sort((a,b)=>rank[a.state]-rank[b.state]||latest(b.anime)-latest(a.anime)||b.seen-a.seen||String(a.anime.title||'').localeCompare(String(b.anime.title||''))||a.id-b.id);
    return limit===null?rows:rows.slice(0,nonnegative(limit));
  }
  function newEpisodeRows(animes,airing,nowMs=Date.now(),limit=24){
    const all=new Map(watching(animes).map(a=>[positive(a.id),a]));
    const grouped=new Map(),now=Math.floor(Number(nowMs)/1000);
    if(!Number.isFinite(now))return [];
    // Release-watch is already identity-checked by the backend and retains
    // only a seven-day history. Never claim streaming or media availability.
    for(const item of (Array.isArray(airing?.items)?airing.items:[])){
      const id=positive(item?.animeId),episode=positive(item?.episode),time=Number(item?.airingAt);
      if(!id||!episode||!Number.isSafeInteger(time)||time>now||time<now-7*86400||item.estimated===true)continue;
      const anime=all.get(id),seen=nonnegative(anime?.episodesSeen);
      if(!anime||episode<=seen)continue;
      let current=grouped.get(id);
      if(!current){current={anime,id,highestEpisode:0,count:0,lastAired:0,episodes:new Set()};grouped.set(id,current);}
      if(current.episodes.has(episode))continue;
      current.episodes.add(episode);current.count++;
      if(episode>current.highestEpisode)current.highestEpisode=episode;
      if(time>current.lastAired)current.lastAired=time;
    }
    return [...grouped.values()].map(({anime,id,highestEpisode,count,lastAired})=>({anime,id,highestEpisode,count,lastAired}))
      .sort((a,b)=>b.lastAired-a.lastAired||String(a.anime.title||'').localeCompare(String(b.anime.title||'')))
      .slice(0,Math.max(0,Math.min(30,nonnegative(limit))));
  }
  return Object.freeze({watching,resumeRows,newEpisodeRows});
});
