'use strict';
const {parseBetaSeriesEpisode}=require('./betaseries-progress'),{norm}=require('./season-identity');
function mismatch(row,found){
 const marker=parseBetaSeriesEpisode(row?.episode);
 return marker.season===1&&marker.episode>1&&/^Movie$/i.test(found?.type||'')&&Number(found?.episodes||found?.episodesTotal)===1;
}
function choose(row,found,candidates){
 if(!mismatch(row,found))return null;
 const marker=parseBetaSeriesEpisode(row.episode);
 const alternatives=candidates.filter(r=>/^TV$|^ONA$/i.test(r.type||'')&&Number(r.episodes||r.episodesTotal)===marker.episode&&[r.title,r.titleEn,...(Array.isArray(r.synonyms)?r.synonyms:[])].some(t=>norm(t)===norm(row.title)));
 const unique=[...new Map(alternatives.map(r=>[Number(r.malId),r])).values()];return unique.length===1?unique[0]:null;
}
module.exports={mismatch,choose};
