'use strict';
const fields=new Set(['title','type','episodesTotal','startDate','endDate','synopsis','genres','themes','demographics','studios','producers','studio','publicScore','rank','duration','rating','trailer','poster','imageUrl']);
const equal=(a,b)=>JSON.stringify(a??'')===JSON.stringify(b??'');
function locked(anime,key){return anime?.manualMetadata?.fields?.includes(key)===true;}
function capture(previous,input,next){
 const chosen=new Set(previous?.manualMetadata?.fields||[]);
 for(const key of fields)if(Object.hasOwn(input||{},key)&&!equal(previous?.[key],input[key]))chosen.add(key);
 if(input?.autoInfo===false)for(const key of fields)if(Object.hasOwn(input,key)&&input[key]!==''&&input[key]!=null)chosen.add(key);
 if(chosen.size)next.manualMetadata={fields:[...chosen].filter(key=>fields.has(key)),at:new Date().toISOString()};
 return next;
}
function preserve(previous,next){
 for(const key of previous?.manualMetadata?.fields||[])if(fields.has(key)){
  if(Object.hasOwn(previous,key))next[key]=previous[key];else delete next[key];
 }
 if(previous?.manualMetadata)next.manualMetadata=previous.manualMetadata;
 if(previous?.associationResolution?.source==='manual'){
  next.associationResolution=previous.associationResolution;
  for(const key of ['malId','anilistId'])if(previous[key])next[key]=previous[key];
 }
 if(previous?.seasonStatusExplicit)next.status=previous.status;
 if(previous?.episodesSeenExplicit)next.episodesSeen=previous.episodesSeen;
 return next;
}
module.exports={locked,capture,preserve,fields};
