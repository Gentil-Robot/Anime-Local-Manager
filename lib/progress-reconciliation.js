'use strict';
const {parseBetaSeriesEpisode}=require('./betaseries-progress');
const continuousIds=new Set([235,11061,1735]);
const n=v=>Math.max(0,Number(v)||0);
const fingerprint=a=>JSON.stringify([String(a.malId||''),a.betaseriesEpisode||'',n(a.episodesTotal),n(a.unallocatedEpisodes)]);
const acknowledged=a=>a.progressResolution?.fingerprint===fingerprint(a);
function continuous(a){return a.betaseriesProgressScope==='season-marker'||continuousIds.has(Number(a.malId));}
function repair(input){
 const items=input.map(a=>({...a})),removed=[],removedSet=new Set(),corrected=[];
 // Legacy provisional seasons are only candidates when they have no official ID.
 // Index once instead of scanning the whole library for each continuous series.
 const provisionalByFamily=new Map();
 for(const anime of items){
  if(anime.malId||anime.anilistId||!(anime.tags||[]).includes('saison à identifier'))continue;
  const family=String(anime.betaseriesSeriesId||anime.betaseriesId||'');
  if(!family)continue;
  if(!provisionalByFamily.has(family))provisionalByFamily.set(family,[]);
  provisionalByFamily.get(family).push(anime);
 }
 for(const root of items){
  const explicitSeen=root.episodesSeenExplicit?root.episodesSeen:undefined;
  const marker=parseBetaSeriesEpisode(root.betaseriesEpisode);
  if(!root.malId||!continuous(root)||marker.season<2)continue;
  const family=String(root.betaseriesSeriesId||root.betaseriesId||'');
  const children=(provisionalByFamily.get(family)||[]).filter(a=>a!==root);
  if(root.importProgressVersion===55&&!children.length)continue;
  const row=root.betaseriesSourceRow||{},completed=Number(String(row.status??root.betaseriesStatus??'').replace(',','.'))>=100||(String(row.remaining??'').trim()==='0');
  const next={betaseriesProgressScope:'season-marker',betaseriesSeason:1,manualSeasonNumber:0,importProgressVersion:55,unallocatedEpisodes:0,betaseriesOverflowEpisodes:0,needsSequelCheck:false,progressUnresolved:!completed};
  if(!root.seasonStatusExplicit&&completed&&n(root.episodesTotal)){next.status='Completed';next.episodesSeen=String(root.episodesTotal);next.progressWarning='';}
  else if(root.status!=='Completed'){next.episodesSeen='';next.progressWarning='La position '+root.betaseriesEpisode+' est conservée ; son équivalent global reste à confirmer.';}
  Object.assign(root,next);root.tags=(root.tags||[]).filter(t=>!/saison à identifier|progression à vérifier|non trouvé auto/.test(t));
  if(explicitSeen!==undefined)root.episodesSeen=explicitSeen;
  if(children.length)root.importRecoveryRecords=[...(root.importRecoveryRecords||[]),...children];
  removed.push(...children);for(const child of children)removedSet.add(child);corrected.push(root.id);
 }
 return {items:items.filter(a=>!removedSet.has(a)),removed,corrected,changed:corrected.length>0};
}
module.exports={continuous,continuousIds,fingerprint,acknowledged,repair};
