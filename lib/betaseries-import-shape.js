'use strict';
const {parseBetaSeriesEpisode}=require('./betaseries-progress');
const {normalizeMediaTitle}=require('./media-classifier');
function sourceState(anime,row={},found={}) {
  const marker=parseBetaSeriesEpisode(row.episode||anime.betaseriesEpisode);
  const total=Number(found?.episodesTotal||anime.episodesTotal)||0;
  const name=normalizeMediaTitle(found?.officialTitle||anime.canonicalTitle||row.title||anime.title);
  // A large episode count alone does not prove continuous broadcasting.
  const continuous=marker.season>1 && (/^tv$/i.test(found?.type||anime.type||'TV')) && (require('./progress-reconciliation').continuous({...anime,malId:found?.malId||anime.malId}) || ['detective conan','meitantei conan'].includes(name));
  const result={...anime,betaseriesSourceTitle:String(row.title||anime.betaseriesSourceTitle||anime.title||''),betaseriesEpisode:String(row.episode||anime.betaseriesEpisode||''),betaseriesStatus:String(row.status??anime.betaseriesStatus??''),betaseriesRemaining:String(row.remaining??anime.betaseriesRemaining??''),betaseriesSourceRow:{...(anime.betaseriesSourceRow||{}),...row}};
  if(continuous){
    const completed=Number(String(row.status||'').replace(',','.'))>=100||String(row.remaining??'').trim()==='0';
    Object.assign(result,{betaseriesProgressScope:'season-marker',betaseriesSeriesId:String(row.id||anime.betaseriesSeriesId||anime.betaseriesId||''),betaseriesSeason:1,manualSeasonNumber:0,episodesSeen:completed&&total?String(total):'',episodesTotal:total?String(total):'',status:completed&&total?'Completed':marker.episode?'Watching':'Plan to Watch',needsSequelCheck:false,progressUnresolved:!(completed&&total),progressWarning:completed&&total?'':'La position '+result.betaseriesEpisode+' est conservée. Le nombre global d’épisodes vus reste à confirmer.'});
    result.tags=(result.tags||[]).filter(tag=>!/suite probable|multi-saison|progression répartie|saison à identifier/.test(String(tag)));
  }
  return result;
}
module.exports={sourceState};
