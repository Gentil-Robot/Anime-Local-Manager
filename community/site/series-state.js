(function(root){
'use strict';
const n=v=>Math.max(0,Number(v)||0),norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const reference=typeof module==='object'&&module.exports?require('./season-reference'):root.ALM_SEASON_REFERENCE;
function slot(a){
 const title=String(a.canonicalTitle||a.title||'');
 const m=title.match(/\b(?:season|saison|staffel|temporada|s)\s*(\d+)\b/i)||title.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i);
 const roman=title.match(/\s+(II|III|IV|V|VI)(?=\s*$|\s*[:—–]|\s+(?:part|cour)\b)/);
 const part=title.match(/\b(?:part|partie|cour)\s*(\d+)\b/i);
 const number=n(a.manualSeasonNumber||a.betaseriesSeason)||(m?n(m[1]):roman?{II:2,III:3,IV:4,V:5,VI:6}[roman[1]]:0);
 const base=title.replace(/\b(?:season|saison|staffel|temporada|s)\s*\d+\b.*$/i,'').replace(/\b\d+(?:st|nd|rd|th)\s+season\b.*$/i,'').replace(/\b(?:part|partie|cour)\s*\d+\b.*$/i,'').replace(/\s+(?:II|III|IV|V|VI)(?=\s*$|\s*[:—–]).*$/,'').replace(/[\s:—–-]+$/,'').trim();
 return {number,part:n(a.partNumber||a.courNumber)||(part?n(part[1]):0),base};
}
function groups(items){
 const tv=a=>! /movie|film|ova|special|music|pv/i.test(a.type||'') || a.seriesReference?.status==='verified'&&reference.role(a)==='main'&&n(a.episodesTotal)>1, familyRoots=new Set();
 const rootsByMal=new Map();
 for(const a of items){const rootId=n(a.seriesReference?.rootMalId);if(!rootId)continue;for(const id of [rootId,n(a.malId)].filter(Boolean)){if(!rootsByMal.has(id))rootsByMal.set(id,new Set());rootsByMal.get(id).add(rootId);}}
 for(const a of items){const s=slot(a);if(tv(a)&&s.number>1&&!a.seriesSeparate)familyRoots.add(norm(s.base));}
 const manualRoots=new Map(),manualBS=new Map();for(const a of items)if(a.seriesGroupTitle&&!a.seriesSeparate){manualRoots.set(norm(slot(a).base),a.seriesGroupTitle);if(a.betaseriesSeriesId||a.betaseriesId)manualBS.set(String(a.betaseriesSeriesId||a.betaseriesId),a.seriesGroupTitle);}
 const map=new Map(),parents=new Map(),byMal=new Map(items.filter(a=>a.malId).map(a=>[String(a.malId),a]));
 const find=id=>{if(!parents.has(id))parents.set(id,id);const parent=parents.get(id);if(parent!==id)parents.set(id,find(parent));return parents.get(id);};
 for(const a of items)if(tv(a)&&!a.seriesSeparate)for(const relation of a.relations||[]){
  if(!/^sequel$/i.test(relation.relation||relation.relationType||''))continue;
  for(const entry of relation.entry||[]){const b=byMal.get(String(entry.mal_id||entry.malId||''));if(!b||!tv(b)||b.seriesSeparate||a.seriesGroupTitle||b.seriesGroupTitle)continue;const x=find(String(a.id)),y=find(String(b.id));if(x!==y)parents.set(y,x);}
 }
 const relationCounts=new Map();for(const a of items){const key=find(String(a.id));relationCounts.set(key,(relationCounts.get(key)||0)+1);}
 for(const a of items){
  const s=slot(a);
  let key='single:'+a.id;
  if(!a.seriesSeparate){
   if(a.seriesGroupTitle)key='root:'+norm(a.seriesGroupTitle);
   else if(a.seriesGroupId)key='group:'+a.seriesGroupId;
   else if(n(a.malId)&&rootsByMal.get(n(a.malId))?.size===1)key='canonical:'+ [...rootsByMal.get(n(a.malId))][0];
   else if(n(a.seriesReference?.rootMalId))key='canonical:'+n(a.seriesReference.rootMalId);
   else if(a.betaseriesSeriesId||a.betaseriesId){const id=String(a.betaseriesSeriesId||a.betaseriesId);key=manualBS.has(id)?'root:'+norm(manualBS.get(id)):'bs:'+id;}
   else if(a.seriesRootTitle)key='root:'+norm(a.seriesRootTitle);
   else if(tv(a)&&relationCounts.get(find(String(a.id)))>1)key='relation:'+find(String(a.id));
   else if(tv(a)&&familyRoots.has(norm(s.base)))key='root:'+norm(manualRoots.get(norm(s.base))||s.base);
  }
  if(!map.has(key))map.set(key,{key,items:[],seasons:[],extras:[],gaps:[]});
  map.get(key).items.push(a);
 }
 for(const g of map.values()){
  const order=(a,b)=>(slot(a).number||1)-(slot(b).number||1)||slot(a).part-slot(b).part||String(a.startDate||'').localeCompare(String(b.startDate||''))||n(a.id)-n(b.id);
  g.items.sort(order);g.seasons=g.items.filter(tv);g.extras=g.items.filter(a=>!tv(a));
  const first=g.seasons[0]||g.items[0];
  g.title=first.seriesGroupTitle||first.customTitle||first.seriesRootTitle||slot(first).base||first.title;
  const counted=new Map();for(const a of g.seasons){const key=reference.identity(a),previous=counted.get(key);if(!previous||n(a.episodesSeen)>n(previous.episodesSeen))counted.set(key,a);}
  g.countedSeasons=[...counted.values()];
  g.unallocated=g.countedSeasons.reduce((sum,a)=>sum+n(a.unallocatedEpisodes),0);
  g.seen=g.countedSeasons.reduce((sum,a)=>sum+n(a.episodesSeen),0);
  g.total=g.countedSeasons.reduce((sum,a)=>sum+n(a.episodesTotal),0);
  g.unknown=g.countedSeasons.filter(a=>!n(a.episodesTotal)).length;
  g.provisional=g.seasons.filter(a=>a.seriesReference?.status==='provisional'||!a.malId&&!a.anilistId&&(a.tags||[]).includes('saison à identifier'));
  const numbers=new Set(g.seasons.map(a=>slot(a).number||1));
  const last=Math.min(100,Math.max(0,...numbers));
  for(let i=1;i<last;i++)if(!numbers.has(i))g.gaps.push(i);
  g.active=g.seasons.find(a=>a.status==='Watching')||g.seasons.find(a=>a.status==='Plan to Watch')||first;
  const pictured=g.seasons.find(a=>!a.needsSequelCheck&&(a.poster||a.imageUrl))||g.items.find(a=>a.poster||a.imageUrl);
  g.poster=pictured?.poster||pictured?.imageUrl||'';
  g.progressUnknown=g.seasons.some(a=>a.progressUnresolved===true);
  g.gapStatuses={};for(const a of g.items)Object.assign(g.gapStatuses,a.seriesSeasonStatuses||{});
  const statuses=new Set(['Watching','Plan to Watch','Completed','On-Hold','Dropped']);
  g.missingStatuses=g.gaps.filter(season=>!statuses.has(g.gapStatuses[season]));
  g.followedCount=g.countedSeasons.length+g.gaps.length-g.missingStatuses.length;
  g.sourceSeason=g.seasons.reduce((max,a)=>a.betaseriesProgressScope==='season-marker'?Math.max(max,n(String(a.betaseriesEpisode||'').match(/^S(\d+)E/i)?.[1])):max,0);
  g.grouped=g.items.length>1||g.gaps.length>0||g.progressUnknown||g.sourceSeason>1;
 }
 return [...map.values()];
}
function summary(g,t){
 if(g.sourceSeason)return t('seriesSourceSeasons',{count:g.sourceSeason});
 return t(g.followedCount===1?'seriesCountOne':'seriesCount',{count:g.followedCount})+(g.missingStatuses.length?' · '+t(g.missingStatuses.length===1?'seriesGapCountOne':'seriesGapCount',{count:g.missingStatuses.length}):'');
}
function providerRanges(g){
 const count=Math.min(100,n(g.sourceSeason));
 return Array.from({length:Math.ceil(count/5)},(_,index)=>{
  const from=index*5+1,to=Math.min(count,from+4);
  return {from,to,seasons:Array.from({length:to-from+1},(_,offset)=>from+offset)};
 });
}
const api={groups,slot,summary,providerRanges};if(typeof module==='object'&&module.exports)module.exports=api;else root.ALM_SERIES=api;
})(typeof window==='object'?window:globalThis);

