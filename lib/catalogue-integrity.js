'use strict';
const {norm,titleSlot}=require('./season-identity');
const identities=require('../data/database/catalogue-identities.json');
const generatedTitle=t=>/\s[—–-]\s*Saison\s+\d+\s*$/i.test(String(t||''));
function trustedFound(found){
 return !!found && /^(MyAnimeList|Kitsu|Jikan)$/i.test(found.source||'') && !found.aliasSource && !generatedTitle(found.officialTitle||found.title);
}
function aliasValid(alias,get){
 if(alias?.source==='manual'||alias?.aliasSource==='manual')return true;
 const row=get(Number(alias?.malId));if(!row)return false;
 const expected=titleSlot(alias.sourceTitle),actual=titleSlot(row.title);
 if(expected.season && expected.season!==actual.season)return false;
 if(expected.part && expected.part!==actual.part)return false;
 return !generatedTitle(alias.animeTitle) && !!norm(alias.animeTitle);
}
function restore(rows,aliases={items:{}},getMetadata=()=>null){
 const corrected=[];
 for(const row of rows){
  const canonical=identities[row.malId];if(!canonical)continue;
  if(!generatedTitle(row.title)&&!generatedTitle(row.titleRomaji)&&!(row.synonyms||[]).some(generatedTitle))continue;
  const synonyms=[...new Set([...(row.synonyms||[]).filter(t=>!generatedTitle(t)),...canonical.synonyms])];
  corrected.push({...row,title:generatedTitle(row.title)?canonical.title:row.title,titleRomaji:generatedTitle(row.titleRomaji)?canonical.titleRomaji:row.titleRomaji,titleEn:row.titleEn||canonical.titleEn,synonyms});
 }
 const canonicalRow=id=>identities[id]||getMetadata(id);
 const removed=[],items={};
 for(const [key,alias]of Object.entries(aliases.items||{})){
  if(aliasValid(alias,canonicalRow))items[key]=alias;
  else removed.push({key,alias});
 }
 return {corrected,aliases:{...aliases,items},removed};
}
module.exports={identities,generatedTitle,trustedFound,aliasValid,restore};
