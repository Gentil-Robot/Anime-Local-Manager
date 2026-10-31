'use strict';
const {norm,titleSlot}=require('./season-identity');
const reference=require('../public/season-reference');
const names=row=>[row.title,row.titleEn,row.titleRomaji,...(row.synonyms||[])].filter(Boolean);
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const ordinal={second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
function descriptor(row){
 // Keep a descriptor from ONE authoritative title. Combining "Part 2" with
 // an alias saying "2nd Season" creates an impossible season-2/part-2 slot.
 const primary=titleSlot(row.title),alternatives=names(row).slice(1).map(titleSlot);
 const english=reference.parse(row.titleEn||row.englishTitle);
 let chosen=primary.part?primary:english.part?english:primary.season?primary:alternatives.find(p=>p.season||p.part)||primary;
 let {season,part}=chosen;
 if(!season&&!part){for(const name of names(row)){const m=name.match(/\s(\d{1,2})\s*$/);if(m){season=Number(m[1]);break;}}}
 const text=clean(row.synopsis);
 const m=text.match(/^(?:the\s+)?(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(season|part|cour)\s+of\s+(.+?)(?:\.(?:\s|$)|$)/i);
 if(m&&!season&&!part){if(m[2].toLowerCase()==='season')season=ordinal[m[1].toLowerCase()];else part=ordinal[m[1].toLowerCase()];}
 return {season,part,of:m?norm(m[3]):''};
}
function baseNames(row){
 return names(row).map(name=>norm(name.replace(/\b(?:\d{1,2}(?:st|nd|rd|th)\s+season|season\s*\d+|part\s*\d+).*$/i,'').replace(/\s\d{1,2}\s*$/,'').replace(/\s(?:II|III|IV|V|VI|VII|VIII|IX|X)(?:\s*[:—–].*)?$/i,''))).filter(n=>n.length>=5);
}
function sameFamily(base,row,description){
 const roots=baseNames(base),candidates=baseNames(row);
 return roots.some(root=>candidates.includes(root)||description.of===root);
}
function familySlot(base,row){
 const roots=new Set(names(base).map(name=>reference.parse(name).root).filter(n=>n.length>=5));
 for(const name of names(row)){
  const parsed=reference.parse(name);
  if(parsed.season&&roots.has(parsed.root))return parsed;
  const suffix=String(name).match(/\s+(\d{1,2})\s*$/);
  if(suffix&&roots.has(norm(String(name).slice(0,suffix.index))))return {season:Number(suffix[1]),part:0};
 }
 const d=descriptor(row);
 if(d.of&&roots.has(d.of))return d;
 // A named sequel can carry an explicit global season in one official alias
 // and the unchanged franchise name in another (Die Neue These, for example).
 if(d.season&&!d.part&&names(row).some(name=>!reference.parse(name).season&&!reference.parse(name).part&&roots.has(norm(name))))return d;
 return null;
}
function isMain(row){
 if(reference.role(row)!=='main')return false;
 if(/^TV(?: Short)?$|^ONA$/i.test(row.type||''))return true;
 // Some official seasons are OVA series, or films split into multiple episodes.
 // A bare OVA/movie title is never evidence for a numbered season.
 return /^(OVA|Movie)$/i.test(row.type||'')&&Number(row.episodes)>1&&(descriptor(row).season>1||names(row).some(name=>reference.parse(name).season>1));
}
function findSeason(base,anime,search){
 const expected=Number(anime.manualSeasonNumber||anime.betaseriesSeason||reference.parse(anime.title).season);
 if(!base?.malId||expected<2)return null;
 const seen=new Map();
 for(const query of reference.queries(anime,base))for(const row of search(query,100)||[])seen.set(Number(row.malId),row);
 const matches=[...seen.values()].filter(row=>{
  if(Number(row.malId)===Number(base.malId)||!isMain(row))return false;
  const slot=familySlot(base,row),d=descriptor(row);
  return slot?.season===expected&&!d.part&&(!row.startDate||!base.startDate||row.startDate>base.startDate);
 });
 if(matches.length!==1)return null;
 return {row:matches[0],proof:{source:'canonical-title',rootMalId:Number(base.malId),season:expected,split:false,method:'official-season-alias'}};
}
function findNext(base,search,options={}){
 if(!base?.malId)return null;
 const b=descriptor(base),seen=new Map();
 for(const query of [...new Set(baseNames(base))].slice(0,5))for(const row of search(query,100)||[])seen.set(Number(row.malId),row);
 // A later cour inherits the season of its unique earlier first cour. Keep
 // the official title as evidence rather than treating "Part 2" as season 2.
 if(b.part>1&&!b.season){
  const root=reference.parse(base.title).root;
  const earlier=[...seen.values()].filter(row=>reference.parse(row.title).root===root&&row.startDate&&base.startDate&&row.startDate<base.startDate&&descriptor(row).season>0&&descriptor(row).part<=1);
  const seasons=new Set(earlier.map(row=>descriptor(row).season));
  if(seasons.size===1)b.season=[...seasons][0];
  else if(!seasons.size){const own=new Set(names(base).map(name=>reference.parse(name).season).filter(Boolean));if(own.size===1)b.season=[...own][0];}
 }
 const ranked=[];
 for(const row of seen.values()){
  if(Number(row.malId)===Number(base.malId)||!isMain(row))continue;
  const d=descriptor(row);if(!sameFamily(base,row,d))continue;
  const primaryRoot=baseNames({...base,synonyms:[],titleEn:'',titleRomaji:''})[0];
  const nextPrimaryRoot=baseNames({...row,synonyms:[],titleEn:'',titleRomaji:''})[0];
  const englishRoot=reference.parse(base.titleEn||base.englishTitle).root;
  const nextEnglishRoot=reference.parse(row.titleEn||row.englishTitle).root;
  const split=d.part===(b.part||1)+1 && (!d.season||d.season===(b.season||1)) && (primaryRoot===nextPrimaryRoot||(englishRoot&&englishRoot===nextEnglishRoot)||d.of===primaryRoot||!!englishRoot&&d.of===englishRoot);
  const global=familySlot(base,row);
  const sequel=global?.season===(b.season||1)+1 && (!d.part||d.part===1);
  if(!split&&!sequel)continue;
  if(!row.startDate||!base.startDate||row.startDate<=base.startDate)continue;
  if(row.startDate>new Date().toISOString().slice(0,10))continue;
  ranked.push({row,split,season:d.season||b.season||1});
 }
 // A split cour belongs before the following season; ambiguity is retained.
 const splits=ranked.filter(r=>r.split),pool=splits.length?splits:ranked;
 if(pool.length!==1)return options.explain?{choices:pool.map(p=>p.row)}:null;
 const chosen=pool[0];return {row:chosen.row,proof:{source:'canonical-title',rootMalId:Number(base.malId),split:chosen.split,season:chosen.season}};
}
module.exports={descriptor,findNext,findSeason,familySlot,isMain,baseNames,sameFamily};
