(function(root){
'use strict';
const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const norm=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const roman={II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10};
function parse(value){
 let title=clean(value),season=0,part=0;
 const p=title.match(/\b(?:part|partie|teil|cour)\s*(\d{1,2})\b/i);
 const s=title.match(/\b(?:saison|season|staffel|temporada|s)\s*(\d{1,2})\b/i)||title.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)||title.match(/第\s*(\d{1,2})\s*[期季]/);
 if(p)part=Number(p[1]);if(s)season=Number(s[1]);
 const r=title.match(/\s+(VIII|VII|III|VI|IV|IX|II|V|X)(?=\s*$|\s*[:—–]|\s+(?:part|cour)\b)/i);
 if(!season&&r)season=roman[r[1].toUpperCase()];
 let base=title.replace(/\b(?:part|partie|teil|cour)\s*\d{1,2}\b.*$/i,'').replace(/\b(?:saison|season|staffel|temporada|s)\s*\d{1,2}\b.*$/i,'').replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b.*$/i,'').replace(/第\s*\d{1,2}\s*[期季].*$/,'');
 if(r&&!s)base=title.slice(0,r.index);
 base=base.replace(/[\s:—–-]+$/,'').trim();
 return {season,part,base,root:norm(base)};
}
function queries(anime,known={}){
 const names=[anime?.betaseriesSourceTitle,anime?.betaseriesSourceRow?.title,anime?.seriesRootTitle,anime?.canonicalTitle,anime?.title,known.title,known.titleEn,known.titleRomaji,...(known.synonyms||[])].filter(Boolean);
 const result=[];for(const name of names)for(const value of [clean(name),parse(name).base])if(value.length>=3&&!result.some(q=>norm(q)===norm(value)))result.push(value);
 return result.slice(0,12);
}
function role(item){
 const text=[item?.officialTitle||item?.title,item?.titleEn||item?.englishTitle].filter(Boolean).join(' ');
 if(/\b(?:picture\s*drama|motion\s*graphic|chibi|chiichai|mini\s*anime|recap|compilation|soushuu|digest)\b/i.test(text)||/^\s*(?:mini anime|picture drama|recap|compilation)\b/i.test(String(item?.synopsis||'').replace(/<[^>]*>/g,' ')))return 'bonus';
 if(/^(Music|PV|CM|Special|TV Special)$/i.test(item?.type||item?.format||''))return 'extra';
 return 'main';
}
function identity(item){
 const mal=Number(item?.malId),ani=Number(item?.anilistId);
 return Number.isSafeInteger(mal)&&mal>0?'mal:'+mal:Number.isSafeInteger(ani)&&ani>0?'ani:'+ani:'local:'+item?.id;
}
const api={clean,norm,parse,queries,role,identity};
if(typeof module==='object'&&module.exports)module.exports=api;else root.ALM_SEASON_REFERENCE=api;
})(typeof window==='object'?window:globalThis);
