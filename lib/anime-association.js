'use strict';
const {publicAnime}=require('./discovery'),{custom}=require('../public/title-preference');
const id=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
function reassociate(previous,record){
 const malId=id(record.malId);if(!malId||!record.title)throw Error('ALM_ASSOCIATION_MISSING');
 const next={...previous},personalTitle=custom(previous);
 // Metadata belongs to the selected identity. Never retain the old clip's data.
 for(const field of ['canonicalTitle','titleEn','titleJa','titleRomaji','englishTitle','japaneseTitle','officialTitle','romajiTitle','localizedTitles','synonyms','poster','imageUrl','synopsis','publicScore','rank','popularity','members','type','episodesTotal','startDate','endDate','genres','themes','demographics','studios','producers','studio','duration','rating','trailer','youtubeVideoId','anilistId','kitsuId','malUrl','source','metadataSource','autoInfo'])delete next[field];
 Object.assign(next,record,{id:previous.id,malId,canonicalTitle:record.title,title:personalTitle||record.title,poster:record.poster||'',imageUrl:record.poster||'',malUrl:'https://myanimelist.net/anime/'+malId});
 next.importIdentityReview=false;next.importIdentityReviewed=true;
 if(personalTitle)next.customTitle=personalTitle;else delete next.customTitle;
 for(const field of ['poster','imageUrl'])if(previous.manualMetadata?.fields?.includes(field))next[field]=previous[field];
 return next;
}
function mountAssociations(app,{db,readAnimes,writeAnimes,fetchRecord,onAssociated}){
 app.post('/api/animes/:id/reassociate',async(req,res)=>{
  try{
   const animeId=id(req.params.id),malId=id(req.body?.malId),expected=Number(req.body?.expectedMalId);
   const status=req.body?.status;if(status!==undefined&&!['Watching','Plan to Watch','Completed','On-Hold','Dropped'].includes(status))return res.status(400).json({code:'ALM_ASSOCIATION_INVALID',error:'Invalid status'});
   if(!animeId||!malId||!Number.isSafeInteger(expected)||expected<0)return res.status(400).json({code:'ALM_ASSOCIATION_INVALID',error:'Invalid anime identity'});
   await db.whenReady();let record;
   const local=db.getMetadataByMalId(malId);if(local&&Number(local.malId)===malId)record=publicAnime(local);
   if(!record&&fetchRecord)try{record=await fetchRecord(malId);}catch{}
   if(!record||Number(record.malId)!==malId||!record.title)return res.status(404).json({code:'ALM_ASSOCIATION_MISSING',error:'Verified metadata missing'});
   // Read after the optional network wait so another episode change is preserved.
   const rows=readAnimes(),index=rows.findIndex(a=>Number(a.id)===animeId);
   if(index<0)return res.status(404).json({code:'ALM_ASSOCIATION_MISSING',error:'Anime missing'});
   if((id(rows[index].malId)||0)!==expected)return res.status(409).json({code:'ALM_ASSOCIATION_CHANGED',error:'Association changed; reload the record'});
   if(rows.some((a,i)=>i!==index&&id(a.malId)===malId))return res.status(409).json({code:'ALM_ASSOCIATION_DUPLICATE',error:'This anime is already in the library'});
   const before=JSON.parse(JSON.stringify(rows)),previous=rows[index];
   rows[index]=reassociate(rows[index],record);
   rows[index].associationResolution={source:'manual',malId,sourceSeason:Number(previous.manualSeasonNumber||previous.betaseriesSeason)||0,at:new Date().toISOString()};
   if(previous.manualMetadata)rows[index].manualMetadata={...previous.manualMetadata,fields:previous.manualMetadata.fields.filter(key=>['title','poster','imageUrl'].includes(key))};
   if(status!==undefined){rows[index].status=status;rows[index].seasonStatusExplicit=true;}
   const family=String(rows[index].betaseriesSeriesId||rows[index].betaseriesId||'');
   const root=family&&rows.find(a=>a.malId&&String(a.betaseriesSeriesId||a.betaseriesId||'')===family&&Number(a.betaseriesSeason||1)===1);
   if(root){rows[index].associationResolution.rootMalId=Number(root.malId);rows[index].seriesReference={status:'verified',rootMalId:Number(root.malId),sourceSeason:Number(previous.manualSeasonNumber||previous.betaseriesSeason)||1,part:Number(previous.partNumber)||1};}
   rows[index].tags=(rows[index].tags||[]).filter(t=>!/saison à identifier|progression à vérifier|non trouvé auto/.test(t));
   if(family)for(const a of rows)if(String(a.betaseriesSeriesId||a.betaseriesId||'')===family){a.importIdentityReview=false;a.importIdentityReviewed=true;}
   delete rows[index].resolutionAssessment;
   writeAnimes(rows);onAssociated?.(previous,rows[index],before,readAnimes());res.json(rows[index]);
  }catch(error){res.status(500).json({code:'ALM_ASSOCIATION_FAILED',error:'Association could not be saved'});}
 });
}
module.exports={reassociate,mountAssociations};
