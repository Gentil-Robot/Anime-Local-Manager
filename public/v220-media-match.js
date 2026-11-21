'use strict';
// ALM 2.2.0: locally ranked *suggestions* for video-to-anime associations.
// No fuzzy match ever writes to the library. The user confirms every link.
(function(root,factory){
 const result=factory();if(typeof module==='object'&&module.exports)module.exports=result;
 if(root)root.ALM_V220_MEDIA_MATCH=result;
})(typeof window!=='undefined'?window:null,()=>{
 const normalize=value=>String(value||'').normalize('NFKC').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[’‘\u0060´]/g,"'").replace(/&/g,' and ')
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
 const safeId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0;};
 const titles=row=>[row?.title,row?.titleEn,row?.titleRomaji,row?.titleJa,...(Array.isArray(row?.synonyms)?row.synonyms.slice(0,25):[])].map(normalize).filter(Boolean);
 function seasonCompatible(file,row){
  const guessed=Number(file?.seasonGuess)||0;
  const known=Number(row?.manualSeasonNumber||row?.betaseriesSeason)||0;
  if(guessed>0&&known>0&&guessed!==known)return false;
  return true;
 }
 function rank(file,library,{maxResults=5}={}){
  const query=normalize(file?.titleGuess);
  const limit=Math.max(1,Math.min(12,Math.floor(Number(maxResults)||5)));
  if(!query||query.length<3||!Array.isArray(library))return {malId:0,confidence:'none',candidates:[]};
  const scored=[];
  for(const row of library){
   const id=safeId(row?.malId);
   if(!id||!seasonCompatible(file,row))continue;
   let best=0,proof='';
   for(const alias of titles(row)){
    if(alias===query){best=100;proof='exact';break;}
    const short=alias.length<query.length?alias:query;
    const long=alias.length<query.length?query:alias;
    if(short.length>=7&&short.length/long.length>=.62&&(long.startsWith(short+' ')||long.endsWith(' '+short))){
      if(best<75){best=75;proof='partial';}
    }
    const a=new Set(alias.split(' ').filter(token=>token.length>=3));
    const b=new Set(query.split(' ').filter(token=>token.length>=3));
    if(a.size>=2&&b.size>=2){
      let common=0;for(const word of a)if(b.has(word))common++;
      const overlap=common/(a.size+b.size-common);
      if(overlap>=.75&&best<70){best=70;proof='tokens';}
    }
   }
   if(best>=70)scored.push({malId:id,title:String(row.title||row.titleEn||'').slice(0,280),score:best,proof});
  }
  scored.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
  const distinct=[];const ids=new Set();
  for(const item of scored){if(ids.has(item.malId))continue;ids.add(item.malId);distinct.push(item);if(distinct.length>=limit)break;}
  const top=distinct[0];const uniqueExact=!!top&&top.score===100&&!distinct.some(x=>x!==top&&x.score===100);
  const episode=Number(file?.episodeGuess)||0;
  const matchedRow=library.find(x=>safeId(x?.malId)===top?.malId);
  const knownSeason=Number(matchedRow?.manualSeasonNumber||matchedRow?.betaseriesSeason)||0;
  const confidence=uniqueExact&&episode>0&&!(Number(file?.seasonGuess)>1&&knownSeason===0)?'high':top?'review':'none';
  return {malId:uniqueExact?top.malId:0,confidence,candidates:distinct};
 }
 return Object.freeze({normalize,rank,seasonCompatible});
});
