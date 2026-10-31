'use strict';
const {sourceState}=require('./betaseries-import-shape');
const {parseBetaSeriesEpisode}=require('./betaseries-progress');
const {normalizeMediaTitle}=require('./media-classifier');
const {provisional}=require('./import-integrity');
const seriesId=a=>String(a.betaseriesSeriesId||a.betaseriesId||'');
const n=v=>Math.max(0,Number(v)||0);
function repair(input){
  const items=input.map(a=>({...a})),removed=[],corrected=[];
  const families=new Map();
  for(const a of items)if(seriesId(a)){const key=seriesId(a);if(!families.has(key))families.set(key,[]);families.get(key).push(a);}
  for(const family of families.values()){
    const root=family.find(a=>!provisional(a)&&n(a.betaseriesSeason||a.manualSeasonNumber)<=1);
    if(!root)continue;
    const marker=parseBetaSeriesEpisode(root.betaseriesEpisode),version=n(root.importShapeVersion);
    const sourceTitle=root.betaseriesSourceTitle||root.betaseriesSourceRow?.title||root.seriesRootTitle||family.find(a=>a!==root&&a.seriesRootTitle)?.seriesRootTitle||'';
    const sourceName=normalizeMediaTitle(sourceTitle),official=normalizeMediaTitle(root.canonicalTitle||root.title);
    const identityConflict=marker.season>1&&/^movie$|^film$|^ona$/i.test(root.type||'')&&n(root.episodesTotal)===1&&sourceName&&official.startsWith(sourceName+' ');
    if(identityConflict&&!root.importIdentityReviewed){
      for(const a of family)if(!a.importIdentityReview){a.importIdentityReview=true;corrected.push({id:a.id,reason:'identity'});}
      continue; // Never manufacture an anime identity for a live action source.
    }
    if(version>=50)continue;
    const reshaped=sourceState(root,root.betaseriesSourceRow||{title:sourceTitle||root.title,episode:root.betaseriesEpisode,id:seriesId(root)});
    if(reshaped.betaseriesProgressScope==='season-marker'){
      const recovery=family.filter(a=>a!==root&&!a.malId&&!a.anilistId&&provisional(a));
      Object.assign(root,reshaped,{importShapeVersion:50,betaseriesOverflowEpisodes:0,betaseriesOverflowNextSeason:0});
      if(recovery.length)root.importRecoveryRecords=[...(root.importRecoveryRecords||[]),...recovery];
      removed.push(...recovery);corrected.push({id:root.id,reason:'continuous'});
    }else if(marker.season===1&&marker.episode>0){
      // Older versions inferred S2 from an S1 overflow. Keep the source position
      // and every removed record in recovery, without asserting that S2 exists.
      const recovery=family.filter(a=>a!==root&&!a.malId&&!a.anilistId&&provisional(a)&&parseBetaSeriesEpisode(a.betaseriesEpisode).season===1);
      const confirmed=family.filter(a=>!recovery.includes(a));
      const capacity=confirmed.reduce((sum,a)=>sum+n(a.episodesTotal),0);
      const excess=Math.max(0,marker.episode-capacity,n(root.betaseriesOverflowEpisodes),n(root.unallocatedEpisodes));
      if(recovery.length||excess){
        Object.assign(root,{importShapeVersion:50,unallocatedEpisodes:excess,betaseriesOverflowEpisodes:0,betaseriesOverflowNextSeason:0,needsSequelCheck:excess>0,progressWarning:excess?excess+' épisode(s) importés restent à rattacher.':''});
        root.tags=(root.tags||[]).filter(t=>!/suite probable/.test(t));
        root.importRecoveryRecords=[...(root.importRecoveryRecords||[]),...recovery];
        removed.push(...recovery);corrected.push({id:root.id,reason:'unallocated'});
      }
    }
  }
  return {items:items.filter(a=>!removed.includes(a)),changed:!!corrected.length,removed,corrected};
}
module.exports={repair};
