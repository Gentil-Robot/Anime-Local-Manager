'use strict';
const classifier=require('./media-classifier'),{titleSlot,norm}=require('./season-identity'),{descriptor}=require('./local-season-links'),{parseBetaSeriesEpisode}=require('./betaseries-progress');
function validate(row,found,tvFound=null){
 const decision=classifier.classifyImportCandidate({title:row?.title||'',animeFound:found,tvFound});
 if(decision.classification!=='anime')return decision;
 const primary=found?.officialTitle||found?.title;
 const marker=parseBetaSeriesEpisode(row?.episode),slot=descriptor({...found,title:primary}),source=titleSlot(row?.title),canonical=titleSlot(primary);
 // A number inferred from an alternate title can be part of the actual name
 // (Lv2, UQ Holder! Negima! 2). An exact official alias is sufficient in that
 // case. Explicit season/part markers in the canonical title still win over
 // generic aliases shared by several seasons.
 const exactTitle=[primary,found?.englishTitle,found?.titleEn,found?.titleRomaji,found?.romajiTitle,...(found?.synonyms||[])].some(t=>t&&norm(t)===norm(row?.title));
 const inferredOnly=!canonical.season&&!canonical.part&&exactTitle;
 let conflict='';
 if(/^(Music|PV|CM)$/i.test(found?.type||found?.format||''))conflict='La correspondance décrit un clip musical, pas la série importée.';
 if(marker.episode>1&&/^Movie$/i.test(found?.type||'')&&Number(found.episodesTotal||found.episodes)===1)conflict='Le film proposé ne correspond pas à la progression de la série.';
 if(slot.season>1&&!source.season&&!source.part&&!inferredOnly)conflict='Le titre source désigne la série, mais la proposition désigne une autre saison.';
 if(slot.part>1&&!source.part&&!source.season&&!inferredOnly)conflict='Le titre source désigne la série, mais la proposition désigne une autre partie.';
 if(source.season&&slot.season&&source.season!==slot.season)conflict='La saison de la proposition ne correspond pas au titre importé.';
 if(tvFound?.premiered&&found?.startDate&&marker.season<=1&&Math.abs(Number(tvFound.premiered.slice(0,4))-Number(found.startDate.slice(0,4)))>2&&decision.conflict)conflict='Les dates des deux œuvres ne concordent pas.';
 return conflict?{...decision,classification:'review',reason:conflict,conflict:true}:decision;
}
module.exports={validate};
