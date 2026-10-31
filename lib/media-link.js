'use strict';
const reference=require('../public/season-reference');
function compatible(event,anime){
 if(!anime)return false;
 if(event.canonicalIdentity&&event.canonicalIdentity!==reference.identity(anime))return false;
 const saved=event.anime||event;
 for(const key of ['malId','anilistId'])if(Number(saved[key])>0&&Number(anime[key])>0&&Number(saved[key])!==Number(anime[key]))return false;
 return event.associationOutdated!==true;
}
module.exports={compatible,identity:reference.identity};
